(function () {
  var Module = {
    TOTAL_MEMORY: 8 * 1024 * 1024,
    TOTAL_STACK: 2 * 1024 * 1024,
    preRun: [],
    postRun: [],
    print: function (text) {
      console.log(text);
    },
    printErr: function (text) {
      text = Array.prototype.slice.call(arguments).join(' ');
      if (text.indexOf('pre-main prep time') >= 0) {
        return;
      }
      console.error(text);
    },
  };
  var Module;
  if (!Module) Module = (typeof Module !== 'undefined' ? Module : null) || {};
  var moduleOverrides = {};
  for (var key in Module) {
    if (Module.hasOwnProperty(key)) {
      moduleOverrides[key] = Module[key];
    }
  }
  var ENVIRONMENT_IS_WEB = typeof window === 'object';
  var ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  var ENVIRONMENT_IS_NODE =
    typeof process === 'object' &&
    typeof require === 'function' &&
    !ENVIRONMENT_IS_WEB &&
    !ENVIRONMENT_IS_WORKER;
  var ENVIRONMENT_IS_SHELL =
    !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
  if (ENVIRONMENT_IS_NODE) {
    if (!Module['print'])
      Module['print'] = function print(x) {
        process['stdout'].write(x + '\n');
      };
    if (!Module['printErr'])
      Module['printErr'] = function printErr(x) {
        process['stderr'].write(x + '\n');
      };
    var nodeFS = require('fs');
    var nodePath = require('path');
    Module['read'] = function read(filename, binary) {
      filename = nodePath['normalize'](filename);
      var ret = nodeFS['readFileSync'](filename);
      if (!ret && filename != nodePath['resolve'](filename)) {
        filename = path.join(__dirname, '..', 'src', filename);
        ret = nodeFS['readFileSync'](filename);
      }
      if (ret && !binary) ret = ret.toString();
      return ret;
    };
    Module['readBinary'] = function readBinary(filename) {
      var ret = Module['read'](filename, true);
      if (!ret.buffer) {
        ret = new Uint8Array(ret);
      }
      return ret;
    };
    Module['load'] = function load(f) {
      globalEval(read(f));
    };
    if (!Module['thisProgram']) {
      if (process['argv'].length > 1) {
        Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
      } else {
        Module['thisProgram'] = 'unknown-program';
      }
    }
    Module['arguments'] = process['argv'].slice(2);
    if (typeof module !== 'undefined') {
      module['exports'] = Module;
    }
    process['on']('uncaughtException', function (ex) {
      if (!(ex instanceof ExitStatus)) {
        throw ex;
      }
    });
    Module['inspect'] = function () {
      return '[Emscripten Module object]';
    };
  } else if (ENVIRONMENT_IS_SHELL) {
    if (!Module['print']) Module['print'] = print;
    if (typeof printErr != 'undefined') Module['printErr'] = printErr;
    if (typeof read != 'undefined') {
      Module['read'] = read;
    } else {
      Module['read'] = function read() {
        throw 'no read() available (jsc?)';
      };
    }
    Module['readBinary'] = function readBinary(f) {
      if (typeof readbuffer === 'function') {
        return new Uint8Array(readbuffer(f));
      }
      var data = read(f, 'binary');
      return data;
    };
    if (typeof scriptArgs != 'undefined') {
      Module['arguments'] = scriptArgs;
    } else if (typeof arguments != 'undefined') {
      Module['arguments'] = arguments;
    }
  } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    Module['read'] = function read(url) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send(null);
      return xhr.responseText;
    };
    if (typeof arguments != 'undefined') {
      Module['arguments'] = arguments;
    }
    if (typeof console !== 'undefined') {
      if (!Module['print'])
        Module['print'] = function print(x) {
          console.log(x);
        };
      if (!Module['printErr'])
        Module['printErr'] = function printErr(x) {
          console.log(x);
        };
    } else {
      var TRY_USE_DUMP = false;
      if (!Module['print'])
        Module['print'] =
          TRY_USE_DUMP && typeof dump !== 'undefined'
            ? function (x) {
                dump(x);
              }
            : function (x) {};
    }
    if (ENVIRONMENT_IS_WORKER) {
      Module['load'] = importScripts;
    }
    if (typeof Module['setWindowTitle'] === 'undefined') {
      Module['setWindowTitle'] = function (title) {
        document.title = title;
      };
    }
  } else {
    throw 'Unknown runtime environment. Where are we?';
  }
  function globalEval(x) {
    eval.call(null, x);
  }
  if (!Module['load'] && Module['read']) {
    Module['load'] = function load(f) {
      globalEval(Module['read'](f));
    };
  }
  if (!Module['print']) {
    Module['print'] = function () {};
  }
  if (!Module['printErr']) {
    Module['printErr'] = Module['print'];
  }
  if (!Module['arguments']) {
    Module['arguments'] = [];
  }
  if (!Module['thisProgram']) {
    Module['thisProgram'] = './this.program';
  }
  Module.print = Module['print'];
  Module.printErr = Module['printErr'];
  Module['preRun'] = [];
  Module['postRun'] = [];
  for (var key in moduleOverrides) {
    if (moduleOverrides.hasOwnProperty(key)) {
      Module[key] = moduleOverrides[key];
    }
  }
  var Runtime = {
    setTempRet0: function (value) {
      tempRet0 = value;
    },
    getTempRet0: function () {
      return tempRet0;
    },
    stackSave: function () {
      return STACKTOP;
    },
    stackRestore: function (stackTop) {
      STACKTOP = stackTop;
    },
    getNativeTypeSize: function (type) {
      switch (type) {
        case 'i1':
        case 'i8':
          return 1;
        case 'i16':
          return 2;
        case 'i32':
          return 4;
        case 'i64':
          return 8;
        case 'float':
          return 4;
        case 'double':
          return 8;
        default: {
          if (type[type.length - 1] === '*') {
            return Runtime.QUANTUM_SIZE;
          } else if (type[0] === 'i') {
            var bits = parseInt(type.substr(1));
            return bits / 8;
          } else {
            return 0;
          }
        }
      }
    },
    getNativeFieldSize: function (type) {
      return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE);
    },
    STACK_ALIGN: 16,
    prepVararg: function (ptr, type) {
      if (type === 'double' || type === 'i64') {
        if (ptr & 7) {
          ptr += 4;
        }
      } else {
      }
      return ptr;
    },
    getAlignSize: function (type, size, vararg) {
      if (!vararg && (type == 'i64' || type == 'double')) return 8;
      if (!type) return Math.min(size, 8);
      return Math.min(
        size || (type ? Runtime.getNativeFieldSize(type) : 0),
        Runtime.QUANTUM_SIZE,
      );
    },
    dynCall: function (sig, ptr, args) {
      if (args && args.length) {
        if (!args.splice) args = Array.prototype.slice.call(args);
        args.splice(0, 0, ptr);
        return Module['dynCall_' + sig].apply(null, args);
      } else {
        return Module['dynCall_' + sig].call(null, ptr);
      }
    },
    functionPointers: [],
    addFunction: function (func) {
      for (var i = 0; i < Runtime.functionPointers.length; i++) {
        if (!Runtime.functionPointers[i]) {
          Runtime.functionPointers[i] = func;
          return 2 * (1 + i);
        }
      }
      throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
    },
    removeFunction: function (index) {
      Runtime.functionPointers[(index - 2) / 2] = null;
    },
    warnOnce: function (text) {
      if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
      if (!Runtime.warnOnce.shown[text]) {
        Runtime.warnOnce.shown[text] = 1;
        Module.printErr(text);
      }
    },
    funcWrappers: {},
    getFuncWrapper: function (func, sig) {
      if (!Runtime.funcWrappers[sig]) {
        Runtime.funcWrappers[sig] = {};
      }
      var sigCache = Runtime.funcWrappers[sig];
      if (!sigCache[func]) {
        sigCache[func] = function dynCall_wrapper() {
          return Runtime.dynCall(sig, func, arguments);
        };
      }
      return sigCache[func];
    },
    getCompilerSetting: function (name) {
      throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work';
    },
    stackAlloc: function (size) {
      var ret = STACKTOP;
      STACKTOP = (STACKTOP + size) | 0;
      STACKTOP = (STACKTOP + 15) & -16;
      return ret;
    },
    staticAlloc: function (size) {
      var ret = STATICTOP;
      STATICTOP = (STATICTOP + size) | 0;
      STATICTOP = (STATICTOP + 15) & -16;
      return ret;
    },
    dynamicAlloc: function (size) {
      var ret = DYNAMICTOP;
      DYNAMICTOP = (DYNAMICTOP + size) | 0;
      DYNAMICTOP = (DYNAMICTOP + 15) & -16;
      if (DYNAMICTOP >= TOTAL_MEMORY) {
        var success = enlargeMemory();
        if (!success) {
          DYNAMICTOP = ret;
          return 0;
        }
      }
      return ret;
    },
    alignMemory: function (size, quantum) {
      var ret = (size =
        Math.ceil(size / (quantum ? quantum : 16)) * (quantum ? quantum : 16));
      return ret;
    },
    makeBigInt: function (low, high, unsigned) {
      var ret = unsigned
        ? +(low >>> 0) + +(high >>> 0) * +4294967296
        : +(low >>> 0) + +(high | 0) * +4294967296;
      return ret;
    },
    GLOBAL_BASE: 8,
    QUANTUM_SIZE: 4,
    __dummy__: 0,
  };
  var __THREW__ = 0;
  var ABORT = false;
  var EXITSTATUS = 0;
  var undef = 0;
  var tempValue,
    tempInt,
    tempBigInt,
    tempInt2,
    tempBigInt2,
    tempPair,
    tempBigIntI,
    tempBigIntR,
    tempBigIntS,
    tempBigIntP,
    tempBigIntD,
    tempDouble,
    tempFloat;
  var tempI64, tempI64b;
  var tempRet0,
    tempRet1,
    tempRet2,
    tempRet3,
    tempRet4,
    tempRet5,
    tempRet6,
    tempRet7,
    tempRet8,
    tempRet9;
  function assert_em(condition, text) {
    if (!condition) {
      abort('Assertion failed: ' + text);
    }
  }
  var globalScope = this;
  function getCFunc(ident) {
    var func = Module['_' + ident];
    if (!func) {
      try {
        func = eval('_' + ident);
      } catch (e) {}
    }
    return func;
  }
  var cwrap, ccall;
  (function () {
    var JSfuncs = {
      stackSave: function () {
        Runtime.stackSave();
      },
      stackRestore: function () {
        Runtime.stackRestore();
      },
      arrayToC: function (arr) {
        var ret = Runtime.stackAlloc(arr.length);
        writeArrayToMemory(arr, ret);
        return ret;
      },
      stringToC: function (str) {
        var ret = 0;
        if (str !== null && str !== undefined && str !== 0) {
          ret = Runtime.stackAlloc((str.length << 2) + 1);
          writeStringToMemory(str, ret);
        }
        return ret;
      },
    };
    var toC = { string: JSfuncs['stringToC'], array: JSfuncs['arrayToC'] };
    ccall = function ccallFunc(ident, returnType, argTypes, args, opts) {
      var func = getCFunc(ident);
      var cArgs = [];
      var stack = 0;
      if (args) {
        for (var i = 0; i < args.length; i++) {
          var converter = toC[argTypes[i]];
          if (converter) {
            if (stack === 0) stack = Runtime.stackSave();
            cArgs[i] = converter(args[i]);
          } else {
            cArgs[i] = args[i];
          }
        }
      }
      var ret = func.apply(null, cArgs);
      if (returnType === 'string') ret = Pointer_stringify(ret);
      if (stack !== 0) {
        if (opts && opts.async) {
          EmterpreterAsync.asyncFinalizers.push(function () {
            Runtime.stackRestore(stack);
          });
          return;
        }
        Runtime.stackRestore(stack);
      }
      return ret;
    };
    var sourceRegex =
      /^function\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;
    function parseJSFunc(jsfunc) {
      var parsed = jsfunc.toString().match(sourceRegex).slice(1);
      return { arguments: parsed[0], body: parsed[1], returnValue: parsed[2] };
    }
    var JSsource = {};
    for (var fun in JSfuncs) {
      if (JSfuncs.hasOwnProperty(fun)) {
        JSsource[fun] = parseJSFunc(JSfuncs[fun]);
      }
    }
    cwrap = function cwrap(ident, returnType, argTypes) {
      argTypes = argTypes || [];
      var cfunc = getCFunc(ident);
      var numericArgs = argTypes.every(function (type) {
        return type === 'number';
      });
      var numericRet = returnType !== 'string';
      if (numericRet && numericArgs) {
        return cfunc;
      }
      var argNames = argTypes.map(function (x, i) {
        return '$' + i;
      });
      var funcstr = '(function(' + argNames.join(',') + ') {';
      var nargs = argTypes.length;
      if (!numericArgs) {
        funcstr += 'var stack = ' + JSsource['stackSave'].body + ';';
        for (var i = 0; i < nargs; i++) {
          var arg = argNames[i],
            type = argTypes[i];
          if (type === 'number') continue;
          var convertCode = JSsource[type + 'ToC'];
          funcstr += 'var ' + convertCode.arguments + ' = ' + arg + ';';
          funcstr += convertCode.body + ';';
          funcstr += arg + '=' + convertCode.returnValue + ';';
        }
      }
      var cfuncname = parseJSFunc(function () {
        return cfunc;
      }).returnValue;
      funcstr += 'var ret = ' + cfuncname + '(' + argNames.join(',') + ');';
      if (!numericRet) {
        var strgfy = parseJSFunc(function () {
          return Pointer_stringify;
        }).returnValue;
        funcstr += 'ret = ' + strgfy + '(ret);';
      }
      if (!numericArgs) {
        funcstr += JSsource['stackRestore'].body.replace('()', '(stack)') + ';';
      }
      funcstr += 'return ret})';
      return eval(funcstr);
    };
  })();
  Module['ccall'] = ccall;
  function setValue(ptr, value, type, noSafe) {
    type = type || 'i8';
    if (type.charAt(type.length - 1) === '*') type = 'i32';
    switch (type) {
      case 'i1':
        HEAP8[ptr >> 0] = value;
        break;
      case 'i8':
        HEAP8[ptr >> 0] = value;
        break;
      case 'i16':
        HEAP16[ptr >> 1] = value;
        break;
      case 'i32':
        HEAP32[ptr >> 2] = value;
        break;
      case 'i64':
        (tempI64 = [
          value >>> 0,
          ((tempDouble = value),
          +Math_abs(tempDouble) >= +1
            ? tempDouble > +0
              ? (Math_min(+Math_floor(tempDouble / +4294967296), +4294967295) |
                  0) >>>
                0
              : ~~+Math_ceil(
                  (tempDouble - +(~~tempDouble >>> 0)) / +4294967296,
                ) >>> 0
            : 0),
        ]),
          (HEAP32[ptr >> 2] = tempI64[0]),
          (HEAP32[(ptr + 4) >> 2] = tempI64[1]);
        break;
      case 'float':
        HEAPF32[ptr >> 2] = value;
        break;
      case 'double':
        HEAPF64[ptr >> 3] = value;
        break;
      default:
        abort('invalid type for setValue: ' + type);
    }
  }
  function getValue(ptr, type, noSafe) {
    type = type || 'i8';
    if (type.charAt(type.length - 1) === '*') type = 'i32';
    switch (type) {
      case 'i1':
        return HEAP8[ptr >> 0];
      case 'i8':
        return HEAP8[ptr >> 0];
      case 'i16':
        return HEAP16[ptr >> 1];
      case 'i32':
        return HEAP32[ptr >> 2];
      case 'i64':
        return HEAP32[ptr >> 2];
      case 'float':
        return HEAPF32[ptr >> 2];
      case 'double':
        return HEAPF64[ptr >> 3];
      default:
        abort('invalid type for setValue: ' + type);
    }
    return null;
  }
  var ALLOC_NORMAL = 0;
  var ALLOC_STACK = 1;
  var ALLOC_STATIC = 2;
  var ALLOC_DYNAMIC = 3;
  var ALLOC_NONE = 4;
  function allocate(slab, types, allocator, ptr) {
    var zeroinit, size;
    if (typeof slab === 'number') {
      zeroinit = true;
      size = slab;
    } else {
      zeroinit = false;
      size = slab.length;
    }
    var singleType = typeof types === 'string' ? types : null;
    var ret;
    if (allocator == ALLOC_NONE) {
      ret = ptr;
    } else {
      ret = [
        _malloc,
        Runtime.stackAlloc,
        Runtime.staticAlloc,
        Runtime.dynamicAlloc,
      ][allocator === undefined ? ALLOC_STATIC : allocator](
        Math.max(size, singleType ? 1 : types.length),
      );
    }
    if (zeroinit) {
      var ptr = ret,
        stop;
      stop = ret + (size & ~3);
      for (; ptr < stop; ptr += 4) {
        HEAP32[ptr >> 2] = 0;
      }
      stop = ret + size;
      while (ptr < stop) {
        HEAP8[ptr++ >> 0] = 0;
      }
      return ret;
    }
    if (singleType === 'i8') {
      if (slab.subarray || slab.slice) {
        HEAPU8.set(slab, ret);
      } else {
        HEAPU8.set(new Uint8Array(slab), ret);
      }
      return ret;
    }
    var i = 0,
      type,
      typeSize,
      previousType;
    while (i < size) {
      var curr = slab[i];
      if (typeof curr === 'function') {
        curr = Runtime.getFunctionIndex(curr);
      }
      type = singleType || types[i];
      if (type === 0) {
        i++;
        continue;
      }
      if (type == 'i64') type = 'i32';
      setValue(ret + i, curr, type);
      if (previousType !== type) {
        typeSize = Runtime.getNativeTypeSize(type);
        previousType = type;
      }
      i += typeSize;
    }
    return ret;
  }
  function getMemory(size) {
    if (!staticSealed) return Runtime.staticAlloc(size);
    if ((typeof _sbrk !== 'undefined' && !_sbrk.called) || !runtimeInitialized)
      return Runtime.dynamicAlloc(size);
    return _malloc(size);
  }
  function Pointer_stringify(ptr, length) {
    if (length === 0 || !ptr) return '';
    var hasUtf = 0;
    var t;
    var i = 0;
    while (1) {
      t = HEAPU8[(ptr + i) >> 0];
      hasUtf |= t;
      if (t == 0 && !length) break;
      i++;
      if (length && i == length) break;
    }
    if (!length) length = i;
    var ret = '';
    if (hasUtf < 128) {
      var MAX_CHUNK = 1024;
      var curr;
      while (length > 0) {
        curr = String.fromCharCode.apply(
          String,
          HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)),
        );
        ret = ret ? ret + curr : curr;
        ptr += MAX_CHUNK;
        length -= MAX_CHUNK;
      }
      return ret;
    }
    return Module['UTF8ToString'](ptr);
  }
  function AsciiToString(ptr) {
    var str = '';
    while (1) {
      var ch = HEAP8[ptr++ >> 0];
      if (!ch) return str;
      str += String.fromCharCode(ch);
    }
  }
  function stringToAscii(str, outPtr) {
    return writeAsciiToMemory(str, outPtr, false);
  }
  function UTF8ArrayToString(u8Array, idx) {
    var u0, u1, u2, u3, u4, u5;
    var str = '';
    while (1) {
      u0 = u8Array[idx++];
      if (!u0) return str;
      if (!(u0 & 128)) {
        str += String.fromCharCode(u0);
        continue;
      }
      u1 = u8Array[idx++] & 63;
      if ((u0 & 224) == 192) {
        str += String.fromCharCode(((u0 & 31) << 6) | u1);
        continue;
      }
      u2 = u8Array[idx++] & 63;
      if ((u0 & 240) == 224) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u3 = u8Array[idx++] & 63;
        if ((u0 & 248) == 240) {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
        } else {
          u4 = u8Array[idx++] & 63;
          if ((u0 & 252) == 248) {
            u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
          } else {
            u5 = u8Array[idx++] & 63;
            u0 =
              ((u0 & 1) << 30) |
              (u1 << 24) |
              (u2 << 18) |
              (u3 << 12) |
              (u4 << 6) |
              u5;
          }
        }
      }
      if (u0 < 65536) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 65536;
        str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023));
      }
    }
  }
  function UTF8ToString(ptr) {
    return UTF8ArrayToString(HEAPU8, ptr);
  }
  function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
    if (!(maxBytesToWrite > 0)) return 0;
    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite - 1;
    for (var i = 0; i < str.length; ++i) {
      var u = str.charCodeAt(i);
      if (u >= 55296 && u <= 57343)
        u = (65536 + ((u & 1023) << 10)) | (str.charCodeAt(++i) & 1023);
      if (u <= 127) {
        if (outIdx >= endIdx) break;
        outU8Array[outIdx++] = u;
      } else if (u <= 2047) {
        if (outIdx + 1 >= endIdx) break;
        outU8Array[outIdx++] = 192 | (u >> 6);
        outU8Array[outIdx++] = 128 | (u & 63);
      } else if (u <= 65535) {
        if (outIdx + 2 >= endIdx) break;
        outU8Array[outIdx++] = 224 | (u >> 12);
        outU8Array[outIdx++] = 128 | ((u >> 6) & 63);
        outU8Array[outIdx++] = 128 | (u & 63);
      } else if (u <= 2097151) {
        if (outIdx + 3 >= endIdx) break;
        outU8Array[outIdx++] = 240 | (u >> 18);
        outU8Array[outIdx++] = 128 | ((u >> 12) & 63);
        outU8Array[outIdx++] = 128 | ((u >> 6) & 63);
        outU8Array[outIdx++] = 128 | (u & 63);
      } else if (u <= 67108863) {
        if (outIdx + 4 >= endIdx) break;
        outU8Array[outIdx++] = 248 | (u >> 24);
        outU8Array[outIdx++] = 128 | ((u >> 18) & 63);
        outU8Array[outIdx++] = 128 | ((u >> 12) & 63);
        outU8Array[outIdx++] = 128 | ((u >> 6) & 63);
        outU8Array[outIdx++] = 128 | (u & 63);
      } else {
        if (outIdx + 5 >= endIdx) break;
        outU8Array[outIdx++] = 252 | (u >> 30);
        outU8Array[outIdx++] = 128 | ((u >> 24) & 63);
        outU8Array[outIdx++] = 128 | ((u >> 18) & 63);
        outU8Array[outIdx++] = 128 | ((u >> 12) & 63);
        outU8Array[outIdx++] = 128 | ((u >> 6) & 63);
        outU8Array[outIdx++] = 128 | (u & 63);
      }
    }
    outU8Array[outIdx] = 0;
    return outIdx - startIdx;
  }
  function stringToUTF8(str, outPtr, maxBytesToWrite) {
    return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
  }
  function lengthBytesUTF8(str) {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
      var u = str.charCodeAt(i);
      if (u >= 55296 && u <= 57343)
        u = (65536 + ((u & 1023) << 10)) | (str.charCodeAt(++i) & 1023);
      if (u <= 127) {
        ++len;
      } else if (u <= 2047) {
        len += 2;
      } else if (u <= 65535) {
        len += 3;
      } else if (u <= 2097151) {
        len += 4;
      } else if (u <= 67108863) {
        len += 5;
      } else {
        len += 6;
      }
    }
    return len;
  }
  function UTF16ToString(ptr) {
    var i = 0;
    var str = '';
    while (1) {
      var codeUnit = HEAP16[(ptr + i * 2) >> 1];
      if (codeUnit == 0) return str;
      ++i;
      str += String.fromCharCode(codeUnit);
    }
  }
  Module['UTF16ToString'] = UTF16ToString;
  function stringToUTF16(str, outPtr, maxBytesToWrite) {
    if (maxBytesToWrite === undefined) {
      maxBytesToWrite = 2147483647;
    }
    if (maxBytesToWrite < 2) return 0;
    maxBytesToWrite -= 2;
    var startPtr = outPtr;
    var numCharsToWrite =
      maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
    for (var i = 0; i < numCharsToWrite; ++i) {
      var codeUnit = str.charCodeAt(i);
      HEAP16[outPtr >> 1] = codeUnit;
      outPtr += 2;
    }
    HEAP16[outPtr >> 1] = 0;
    return outPtr - startPtr;
  }
  Module['stringToUTF16'] = stringToUTF16;
  function lengthBytesUTF16(str) {
    return str.length * 2;
  }
  function UTF32ToString(ptr) {
    var i = 0;
    var str = '';
    while (1) {
      var utf32 = HEAP32[(ptr + i * 4) >> 2];
      if (utf32 == 0) return str;
      ++i;
      if (utf32 >= 65536) {
        var ch = utf32 - 65536;
        str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023));
      } else {
        str += String.fromCharCode(utf32);
      }
    }
  }
  function stringToUTF32(str, outPtr, maxBytesToWrite) {
    if (maxBytesToWrite === undefined) {
      maxBytesToWrite = 2147483647;
    }
    if (maxBytesToWrite < 4) return 0;
    var startPtr = outPtr;
    var endPtr = startPtr + maxBytesToWrite - 4;
    for (var i = 0; i < str.length; ++i) {
      var codeUnit = str.charCodeAt(i);
      if (codeUnit >= 55296 && codeUnit <= 57343) {
        var trailSurrogate = str.charCodeAt(++i);
        codeUnit =
          (65536 + ((codeUnit & 1023) << 10)) | (trailSurrogate & 1023);
      }
      HEAP32[outPtr >> 2] = codeUnit;
      outPtr += 4;
      if (outPtr + 4 > endPtr) break;
    }
    HEAP32[outPtr >> 2] = 0;
    return outPtr - startPtr;
  }
  function lengthBytesUTF32(str) {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
      var codeUnit = str.charCodeAt(i);
      if (codeUnit >= 55296 && codeUnit <= 57343) ++i;
      len += 4;
    }
    return len;
  }
  function demangle(func) {
    var hasLibcxxabi = !!Module['___cxa_demangle'];
    if (hasLibcxxabi) {
      try {
        var buf = _malloc(func.length);
        writeStringToMemory(func.substr(1), buf);
        var status = _malloc(4);
        var ret = Module['___cxa_demangle'](buf, 0, 0, status);
        if (getValue(status, 'i32') === 0 && ret) {
          return Pointer_stringify(ret);
        }
      } catch (e) {
      } finally {
        if (buf) _free(buf);
        if (status) _free(status);
        if (ret) _free(ret);
      }
    }
    var i = 3;
    var basicTypes = {
      v: 'void',
      b: 'bool',
      c: 'char',
      s: 'short',
      i: 'int',
      l: 'long',
      f: 'float',
      d: 'double',
      w: 'wchar_t',
      a: 'signed char',
      h: 'unsigned char',
      t: 'unsigned short',
      j: 'unsigned int',
      m: 'unsigned long',
      x: 'long long',
      y: 'unsigned long long',
      z: '...',
    };
    var subs = [];
    var first = true;
    function dump(x) {
      if (x) Module.print(x);
      Module.print(func);
      var pre = '';
      for (var a = 0; a < i; a++) pre += ' ';
      Module.print(pre + '^');
    }
    function parseNested() {
      i++;
      if (func[i] === 'K') i++;
      var parts = [];
      while (func[i] !== 'E') {
        if (func[i] === 'S') {
          i++;
          var next = func.indexOf('_', i);
          var num = func.substring(i, next) || 0;
          parts.push(subs[num] || '?');
          i = next + 1;
          continue;
        }
        if (func[i] === 'C') {
          parts.push(parts[parts.length - 1]);
          i += 2;
          continue;
        }
        var size = parseInt(func.substr(i));
        var pre = size.toString().length;
        if (!size || !pre) {
          i--;
          break;
        }
        var curr = func.substr(i + pre, size);
        parts.push(curr);
        subs.push(curr);
        i += pre + size;
      }
      i++;
      return parts;
    }
    function parse(rawList, limit, allowVoid) {
      limit = limit || Infinity;
      var ret = '',
        list = [];
      function flushList() {
        return '(' + list.join(', ') + ')';
      }
      var name;
      if (func[i] === 'N') {
        name = parseNested().join('::');
        limit--;
        if (limit === 0) return rawList ? [name] : name;
      } else {
        if (func[i] === 'K' || (first && func[i] === 'L')) i++;
        var size = parseInt(func.substr(i));
        if (size) {
          var pre = size.toString().length;
          name = func.substr(i + pre, size);
          i += pre + size;
        }
      }
      first = false;
      if (func[i] === 'I') {
        i++;
        var iList = parse(true);
        var iRet = parse(true, 1, true);
        ret += iRet[0] + ' ' + name + '<' + iList.join(', ') + '>';
      } else {
        ret = name;
      }
      paramLoop: while (i < func.length && limit-- > 0) {
        var c = func[i++];
        if (c in basicTypes) {
          list.push(basicTypes[c]);
        } else {
          switch (c) {
            case 'P':
              list.push(parse(true, 1, true)[0] + '*');
              break;
            case 'R':
              list.push(parse(true, 1, true)[0] + '&');
              break;
            case 'L': {
              i++;
              var end = func.indexOf('E', i);
              var size = end - i;
              list.push(func.substr(i, size));
              i += size + 2;
              break;
            }
            case 'A': {
              var size = parseInt(func.substr(i));
              i += size.toString().length;
              if (func[i] !== '_') throw '?';
              i++;
              list.push(parse(true, 1, true)[0] + ' [' + size + ']');
              break;
            }
            case 'E':
              break paramLoop;
            default:
              ret += '?' + c;
              break paramLoop;
          }
        }
      }
      if (!allowVoid && list.length === 1 && list[0] === 'void') list = [];
      if (rawList) {
        if (ret) {
          list.push(ret + '?');
        }
        return list;
      } else {
        return ret + flushList();
      }
    }
    var parsed = func;
    try {
      if (func == 'Object._main' || func == '_main') {
        return 'main()';
      }
      if (typeof func === 'number') func = Pointer_stringify(func);
      if (func[0] !== '_') return func;
      if (func[1] !== '_') return func;
      if (func[2] !== 'Z') return func;
      switch (func[3]) {
        case 'n':
          return 'operator new()';
        case 'd':
          return 'operator delete()';
      }
      parsed = parse();
    } catch (e) {
      parsed += '?';
    }
    if (parsed.indexOf('?') >= 0 && !hasLibcxxabi) {
      Runtime.warnOnce(
        'warning: a problem occurred in builtin C++ name demangling; build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling',
      );
    }
    return parsed;
  }
  function demangleAll(text) {
    return text.replace(/__Z[\w\d_]+/g, function (x) {
      var y = demangle(x);
      return x === y ? x : x + ' [' + y + ']';
    });
  }
  function jsStackTrace() {
    var err = new Error();
    if (!err.stack) {
      try {
        throw new Error(0);
      } catch (e) {
        err = e;
      }
      if (!err.stack) {
        return '(no stack trace available)';
      }
    }
    return err.stack.toString();
  }
  function stackTrace() {
    return demangleAll(jsStackTrace());
  }
  var PAGE_SIZE = 4096;
  function alignMemoryPage(x) {
    if (x % 4096 > 0) {
      x += 4096 - (x % 4096);
    }
    return x;
  }
  var HEAP;
  var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
  var STATIC_BASE = 0,
    STATICTOP = 0,
    staticSealed = false;
  var STACK_BASE = 0,
    STACKTOP = 0,
    STACK_MAX = 0;
  var DYNAMIC_BASE = 0,
    DYNAMICTOP = 0;
  function enlargeMemory() {
    var OLD_TOTAL_MEMORY = TOTAL_MEMORY;
    var LIMIT = Math.pow(2, 31);
    if (DYNAMICTOP >= LIMIT) return false;
    while (TOTAL_MEMORY <= DYNAMICTOP) {
      if (TOTAL_MEMORY < LIMIT / 2) {
        TOTAL_MEMORY = alignMemoryPage(2 * TOTAL_MEMORY);
      } else {
        var last = TOTAL_MEMORY;
        TOTAL_MEMORY = alignMemoryPage((3 * TOTAL_MEMORY + LIMIT) / 4);
        if (TOTAL_MEMORY <= last) return false;
      }
    }
    TOTAL_MEMORY = Math.max(TOTAL_MEMORY, 16 * 1024 * 1024);
    if (TOTAL_MEMORY >= LIMIT) return false;
    try {
      if (ArrayBuffer.transfer) {
        buffer = ArrayBuffer.transfer(buffer, TOTAL_MEMORY);
      } else {
        var oldHEAP8 = HEAP8;
        buffer = new ArrayBuffer(TOTAL_MEMORY);
      }
    } catch (e) {
      return false;
    }
    var success = _emscripten_replace_memory(buffer);
    if (!success) return false;
    Module['buffer'] = buffer;
    Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
    Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
    Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
    Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
    Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
    Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
    Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
    Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
    if (!ArrayBuffer.transfer) {
      HEAP8.set(oldHEAP8);
    }
    return true;
  }
  var byteLength;
  try {
    byteLength = Function.prototype.call.bind(
      Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get,
    );
    byteLength(new ArrayBuffer(4));
  } catch (e) {
    byteLength = function (buffer) {
      return buffer.byteLength;
    };
  }
  var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
  var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
  var totalMemory = 64 * 1024;
  while (totalMemory < TOTAL_MEMORY || totalMemory < 2 * TOTAL_STACK) {
    if (totalMemory < 16 * 1024 * 1024) {
      totalMemory *= 2;
    } else {
      totalMemory += 16 * 1024 * 1024;
    }
  }
  totalMemory = Math.max(totalMemory, 16 * 1024 * 1024);
  if (totalMemory !== TOTAL_MEMORY) {
    TOTAL_MEMORY = totalMemory;
  }
  var buffer;
  buffer = new ArrayBuffer(TOTAL_MEMORY);
  HEAP8 = new Int8Array(buffer);
  HEAP16 = new Int16Array(buffer);
  HEAP32 = new Int32Array(buffer);
  HEAPU8 = new Uint8Array(buffer);
  HEAPU16 = new Uint16Array(buffer);
  HEAPU32 = new Uint32Array(buffer);
  HEAPF32 = new Float32Array(buffer);
  HEAPF64 = new Float64Array(buffer);
  HEAP32[0] = 255;
  Module['HEAP'] = HEAP;
  Module['buffer'] = buffer;
  Module['HEAP8'] = HEAP8;
  Module['HEAP16'] = HEAP16;
  Module['HEAP32'] = HEAP32;
  Module['HEAPU8'] = HEAPU8;
  Module['HEAPU16'] = HEAPU16;
  Module['HEAPU32'] = HEAPU32;
  Module['HEAPF32'] = HEAPF32;
  Module['HEAPF64'] = HEAPF64;
  function callRuntimeCallbacks(callbacks) {
    while (callbacks.length > 0) {
      var callback = callbacks.shift();
      if (typeof callback == 'function') {
        callback();
        continue;
      }
      var func = callback.func;
      if (typeof func === 'number') {
        if (callback.arg === undefined) {
          Runtime.dynCall('v', func);
        } else {
          Runtime.dynCall('vi', func, [callback.arg]);
        }
      } else {
        func(callback.arg === undefined ? null : callback.arg);
      }
    }
  }
  var __ATPRERUN__ = [];
  var __ATINIT__ = [];
  var __ATMAIN__ = [];
  var __ATEXIT__ = [];
  var __ATPOSTRUN__ = [];
  var runtimeInitialized = false;
  var runtimeExited = false;
  function preRun() {
    if (Module['preRun']) {
      if (typeof Module['preRun'] == 'function')
        Module['preRun'] = [Module['preRun']];
      while (Module['preRun'].length) {
        addOnPreRun(Module['preRun'].shift());
      }
    }
    callRuntimeCallbacks(__ATPRERUN__);
  }
  function ensureInitRuntime() {
    if (runtimeInitialized) return;
    runtimeInitialized = true;
    callRuntimeCallbacks(__ATINIT__);
  }
  function preMain() {
    callRuntimeCallbacks(__ATMAIN__);
  }
  function exitRuntime() {
    callRuntimeCallbacks(__ATEXIT__);
    runtimeExited = true;
  }
  function postRun() {
    if (Module['postRun']) {
      if (typeof Module['postRun'] == 'function')
        Module['postRun'] = [Module['postRun']];
      while (Module['postRun'].length) {
        addOnPostRun(Module['postRun'].shift());
      }
    }
    callRuntimeCallbacks(__ATPOSTRUN__);
  }
  function addOnPreRun(cb) {
    __ATPRERUN__.unshift(cb);
  }
  function addOnInit(cb) {
    __ATINIT__.unshift(cb);
  }
  function addOnPreMain(cb) {
    __ATMAIN__.unshift(cb);
  }
  function addOnExit(cb) {
    __ATEXIT__.unshift(cb);
  }
  function addOnPostRun(cb) {
    __ATPOSTRUN__.unshift(cb);
  }
  function intArrayFromString(stringy, dontAddNull, length) {
    var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
    var u8array = new Array(len);
    var numBytesWritten = stringToUTF8Array(
      stringy,
      u8array,
      0,
      u8array.length,
    );
    if (dontAddNull) u8array.length = numBytesWritten;
    return u8array;
  }
  function intArrayToString(array) {
    var ret = [];
    for (var i = 0; i < array.length; i++) {
      var chr = array[i];
      if (chr > 255) {
        chr &= 255;
      }
      ret.push(String.fromCharCode(chr));
    }
    return ret.join('');
  }
  function writeStringToMemory(string, buffer, dontAddNull) {
    var array = intArrayFromString(string, dontAddNull);
    var i = 0;
    while (i < array.length) {
      var chr = array[i];
      HEAP8[(buffer + i) >> 0] = chr;
      i = i + 1;
    }
  }
  function writeArrayToMemory(array, buffer) {
    for (var i = 0; i < array.length; i++) {
      HEAP8[buffer++ >> 0] = array[i];
    }
  }
  function writeAsciiToMemory(str, buffer, dontAddNull) {
    for (var i = 0; i < str.length; ++i) {
      HEAP8[buffer++ >> 0] = str.charCodeAt(i);
    }
    if (!dontAddNull) HEAP8[buffer >> 0] = 0;
  }
  function unSign(value, bits, ignore) {
    if (value >= 0) {
      return value;
    }
    return bits <= 32
      ? 2 * Math.abs(1 << (bits - 1)) + value
      : Math.pow(2, bits) + value;
  }
  function reSign(value, bits, ignore) {
    if (value <= 0) {
      return value;
    }
    var half = bits <= 32 ? Math.abs(1 << (bits - 1)) : Math.pow(2, bits - 1);
    if (value >= half && (bits <= 32 || value > half)) {
      value = -2 * half + value;
    }
    return value;
  }
  if (!Math['imul'] || Math['imul'](4294967295, 5) !== -5)
    Math['imul'] = function imul(a, b) {
      var ah = a >>> 16;
      var al = a & 65535;
      var bh = b >>> 16;
      var bl = b & 65535;
      return (al * bl + ((ah * bl + al * bh) << 16)) | 0;
    };
  Math.imul = Math['imul'];
  if (!Math['clz32'])
    Math['clz32'] = function (x) {
      x = x >>> 0;
      for (var i = 0; i < 32; i++) {
        if (x & (1 << (31 - i))) return i;
      }
      return 32;
    };
  Math.clz32 = Math['clz32'];
  var Math_abs = Math.abs;
  var Math_cos = Math.cos;
  var Math_sin = Math.sin;
  var Math_tan = Math.tan;
  var Math_acos = Math.acos;
  var Math_asin = Math.asin;
  var Math_atan = Math.atan;
  var Math_atan2 = Math.atan2;
  var Math_exp = Math.exp;
  var Math_log = Math.log;
  var Math_sqrt = Math.sqrt;
  var Math_ceil = Math.ceil;
  var Math_floor = Math.floor;
  var Math_pow = Math.pow;
  var Math_imul = Math.imul;
  var Math_fround = Math.fround;
  var Math_min = Math.min;
  var Math_clz32 = Math.clz32;
  var runDependencies = 0;
  var runDependencyWatcher = null;
  var dependenciesFulfilled = null;
  function getUniqueRunDependency(id) {
    return id;
  }
  function addRunDependency(id) {
    runDependencies++;
    if (Module['monitorRunDependencies']) {
      Module['monitorRunDependencies'](runDependencies);
    }
  }
  function removeRunDependency(id) {
    runDependencies--;
    if (Module['monitorRunDependencies']) {
      Module['monitorRunDependencies'](runDependencies);
    }
    if (runDependencies == 0) {
      if (runDependencyWatcher !== null) {
        clearInterval(runDependencyWatcher);
        runDependencyWatcher = null;
      }
      if (dependenciesFulfilled) {
        var callback = dependenciesFulfilled;
        dependenciesFulfilled = null;
        callback();
      }
    }
  }
  Module['preloadedImages'] = {};
  Module['preloadedAudios'] = {};
  var memoryInitializer = null;
  var ASM_CONSTS = [];
  STATIC_BASE = 8;
  STATICTOP = STATIC_BASE + 69200;
  __ATINIT__.push();
  allocate(
    [
      24, 2, 0, 0, 152, 13, 1, 0, 64, 2, 0, 0, 165, 13, 1, 0, 8, 0, 0, 0, 0, 0,
      0, 0, 64, 2, 0, 0, 198, 13, 1, 0, 16, 0, 0, 0, 0, 0, 0, 0, 64, 2, 0, 0,
      12, 14, 1, 0, 16, 0, 0, 0, 0, 0, 0, 0, 64, 2, 0, 0, 232, 13, 1, 0, 48, 0,
      0, 0, 0, 0, 0, 0, 64, 2, 0, 0, 46, 14, 1, 0, 32, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 16, 0, 0, 0, 128, 0, 0, 0,
      8, 0, 0, 0, 64, 0, 0, 141, 7, 1, 0, 173, 8, 1, 0, 23, 7, 1, 0, 23, 7, 1,
      0, 183, 6, 1, 0, 173, 8, 1, 0, 23, 7, 1, 0, 23, 7, 1, 0, 85, 8, 1, 0, 133,
      8, 1, 0, 23, 7, 1, 0, 23, 7, 1, 0, 245, 7, 1, 0, 37, 8, 1, 0, 23, 7, 1, 0,
      23, 7, 1, 0, 189, 7, 1, 0, 72, 7, 1, 0, 128, 7, 1, 0, 135, 7, 1, 0, 141,
      7, 1, 0, 223, 6, 1, 0, 23, 7, 1, 0, 28, 7, 1, 0, 32, 7, 1, 0, 72, 7, 1, 0,
      128, 7, 1, 0, 135, 7, 1, 0, 183, 6, 1, 0, 223, 6, 1, 0, 23, 7, 1, 0, 28,
      7, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 104, 1, 0, 0, 168, 1, 0, 0, 200, 10, 1, 0, 104, 13, 1,
      0, 182, 170, 0, 0, 6, 198, 0, 0, 0, 0, 0, 0, 168, 13, 0, 0, 140, 31, 0, 0,
      160, 1, 40, 14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 17, 0, 48, 45, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 16, 0, 0, 0, 240,
      93, 0, 0, 120, 90, 0, 0, 26, 0, 0, 0, 32, 6, 0, 0, 192, 8, 0, 0, 192, 10,
      1, 0, 240, 10, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 182, 2, 88, 0, 171, 0, 32, 0, 187, 0, 0, 0,
      21, 34, 160, 2, 67, 34, 32, 1, 152, 34, 128, 2, 166, 34, 192, 2, 168, 34,
      0, 3, 169, 34, 224, 2, 171, 34, 32, 3, 205, 34, 96, 0, 242, 34, 224, 1,
      243, 34, 0, 2, 244, 34, 32, 2, 246, 34, 64, 2, 247, 34, 96, 2, 250, 34,
      64, 1, 251, 34, 96, 1, 252, 34, 128, 1, 253, 34, 160, 1, 254, 34, 192, 1,
      184, 41, 128, 0, 245, 41, 64, 0, 222, 42, 160, 0, 227, 42, 224, 0, 228,
      42, 192, 0, 229, 42, 0, 1, 0, 0, 0, 0, 32, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0,
      0, 3, 0, 0, 0, 4, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0,
      0, 0, 0, 0, 80, 0, 0, 0, 1, 0, 0, 0, 5, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0,
      1, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 113, 6, 113, 6, 123, 6, 123, 6, 123, 6, 123,
      6, 126, 6, 126, 6, 126, 6, 126, 6, 0, 0, 0, 0, 0, 0, 0, 0, 122, 6, 122, 6,
      122, 6, 122, 6, 0, 0, 0, 0, 0, 0, 0, 0, 121, 6, 121, 6, 121, 6, 121, 6, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 134, 6, 134, 6, 134, 6, 134, 6, 0, 0, 0, 0, 0, 0, 0, 0,
      141, 6, 141, 6, 140, 6, 140, 6, 142, 6, 142, 6, 136, 6, 136, 6, 152, 6,
      152, 6, 145, 6, 145, 6, 169, 6, 169, 6, 169, 6, 169, 6, 175, 6, 175, 6,
      175, 6, 175, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 186, 6,
      186, 6, 187, 6, 187, 6, 187, 6, 187, 6, 192, 6, 192, 6, 193, 6, 193, 6,
      193, 6, 193, 6, 190, 6, 190, 6, 190, 6, 190, 6, 210, 6, 210, 6, 211, 6,
      211, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 199, 6, 199, 6, 198, 6, 198, 6, 200, 6, 200, 6, 0, 0, 203, 6, 203,
      6, 197, 6, 197, 6, 201, 6, 201, 6, 208, 6, 208, 6, 208, 6, 208, 6, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 204, 6, 204, 6, 204, 6, 204, 6, 75,
      6, 75, 6, 76, 6, 76, 6, 77, 6, 77, 6, 78, 6, 78, 6, 79, 6, 79, 6, 80, 6,
      80, 6, 81, 6, 81, 6, 82, 6, 82, 6, 33, 6, 34, 6, 34, 6, 35, 6, 35, 6, 36,
      6, 36, 6, 37, 6, 37, 6, 38, 6, 38, 6, 38, 6, 38, 6, 39, 6, 39, 6, 40, 6,
      40, 6, 40, 6, 40, 6, 41, 6, 41, 6, 42, 6, 42, 6, 42, 6, 42, 6, 43, 6, 43,
      6, 43, 6, 43, 6, 44, 6, 44, 6, 44, 6, 44, 6, 45, 6, 45, 6, 45, 6, 45, 6,
      46, 6, 46, 6, 46, 6, 46, 6, 47, 6, 47, 6, 48, 6, 48, 6, 49, 6, 49, 6, 50,
      6, 50, 6, 51, 6, 51, 6, 51, 6, 51, 6, 52, 6, 52, 6, 52, 6, 52, 6, 53, 6,
      53, 6, 53, 6, 53, 6, 54, 6, 54, 6, 54, 6, 54, 6, 55, 6, 55, 6, 55, 6, 55,
      6, 56, 6, 56, 6, 56, 6, 56, 6, 57, 6, 57, 6, 57, 6, 57, 6, 58, 6, 58, 6,
      58, 6, 58, 6, 65, 6, 65, 6, 65, 6, 65, 6, 66, 6, 66, 6, 66, 6, 66, 6, 67,
      6, 67, 6, 67, 6, 67, 6, 68, 6, 68, 6, 68, 6, 68, 6, 69, 6, 69, 6, 69, 6,
      69, 6, 70, 6, 70, 6, 70, 6, 70, 6, 71, 6, 71, 6, 71, 6, 71, 6, 72, 6, 72,
      6, 73, 6, 73, 6, 74, 6, 74, 6, 74, 6, 74, 6, 92, 6, 92, 6, 93, 6, 93, 6,
      94, 6, 94, 6, 95, 6, 95, 6, 33, 17, 33, 19, 1, 21, 33, 23, 3, 25, 33, 29,
      3, 31, 1, 35, 3, 37, 3, 41, 3, 45, 3, 49, 3, 53, 1, 57, 1, 59, 1, 61, 1,
      63, 3, 65, 3, 69, 3, 73, 3, 77, 3, 81, 3, 85, 3, 89, 3, 93, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 3, 0, 3, 97, 3, 101, 3, 105, 19, 109, 3, 113, 3, 117, 3,
      121, 1, 125, 1, 127, 3, 129, 4, 1, 132, 1, 132, 1, 132, 1, 132, 1, 132, 1,
      68, 3, 4, 1, 4, 7, 4, 8, 4, 8, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 133,
      1, 135, 1, 137, 1, 139, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 6, 9, 0, 33, 0, 33, 0, 0,
      0, 33, 0, 1, 0, 1, 0, 3, 0, 11, 22, 11, 14, 11, 2, 3, 0, 3, 0, 11, 6, 3,
      0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 11, 42, 3, 0, 9, 56, 1, 0, 1, 0, 1,
      0, 9, 52, 9, 50, 9, 54, 1, 0, 1, 0, 9, 60, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 9, 58, 1, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0,
      3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 11, 62, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0,
      11, 66, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 9, 78,
      11, 80, 3, 0, 3, 0, 11, 90, 3, 0, 9, 84, 11, 86, 1, 0, 1, 0, 1, 0, 9, 144,
      9, 137, 9, 135, 9, 139, 9, 146, 1, 0, 9, 142, 11, 172, 1, 0, 3, 0, 3, 0,
      11, 148, 3, 0, 9, 94, 9, 96, 78, 4, 86, 4, 94, 4, 102, 4, 126, 4, 134, 4,
      142, 4, 150, 4, 158, 4, 166, 4, 172, 4, 180, 4, 188, 4, 196, 4, 204, 4,
      212, 4, 218, 4, 226, 4, 234, 4, 242, 4, 245, 4, 253, 4, 5, 5, 13, 5, 21,
      5, 29, 5, 25, 5, 33, 5, 41, 5, 49, 5, 54, 5, 62, 5, 70, 5, 78, 5, 82, 5,
      90, 5, 98, 5, 106, 5, 114, 5, 122, 5, 118, 5, 126, 5, 131, 5, 139, 5, 145,
      5, 153, 5, 161, 5, 169, 5, 177, 5, 185, 5, 193, 5, 201, 5, 206, 5, 214, 5,
      217, 5, 225, 5, 233, 5, 241, 5, 247, 5, 255, 5, 254, 5, 6, 6, 14, 6, 22,
      6, 38, 6, 30, 6, 46, 6, 110, 4, 110, 4, 62, 6, 70, 6, 54, 6, 86, 6, 88, 6,
      96, 6, 78, 6, 112, 6, 118, 6, 126, 6, 104, 6, 142, 6, 148, 6, 156, 6, 134,
      6, 172, 6, 178, 6, 186, 6, 164, 6, 202, 6, 208, 6, 216, 6, 194, 6, 232, 6,
      240, 6, 248, 6, 224, 6, 8, 7, 14, 7, 22, 7, 0, 7, 38, 7, 44, 7, 52, 7, 30,
      7, 68, 7, 73, 7, 81, 7, 60, 7, 97, 7, 104, 7, 112, 7, 89, 7, 250, 5, 120,
      7, 128, 7, 110, 4, 136, 7, 144, 7, 152, 7, 110, 4, 160, 7, 168, 7, 176, 7,
      181, 7, 189, 7, 196, 7, 204, 7, 110, 4, 185, 5, 212, 7, 220, 7, 228, 7,
      236, 7, 70, 5, 252, 7, 244, 7, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 2, 8, 185, 5, 10, 8, 0, 8, 18, 8,
      185, 5, 14, 8, 185, 5, 24, 8, 32, 8, 40, 8, 70, 5, 70, 5, 48, 8, 56, 8,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      61, 8, 69, 8, 185, 5, 185, 5, 77, 8, 85, 8, 93, 8, 101, 8, 109, 8, 185, 5,
      117, 8, 125, 8, 133, 8, 149, 8, 185, 5, 157, 8, 159, 8, 167, 8, 141, 8,
      185, 5, 170, 8, 190, 8, 178, 8, 186, 8, 198, 8, 185, 5, 206, 8, 212, 8,
      220, 8, 228, 8, 185, 5, 244, 8, 252, 8, 4, 9, 236, 8, 110, 4, 110, 4, 20,
      9, 23, 9, 31, 9, 12, 9, 47, 9, 39, 9, 185, 5, 54, 9, 185, 5, 69, 9, 62, 9,
      77, 9, 85, 9, 110, 4, 93, 9, 101, 9, 238, 4, 109, 9, 112, 9, 118, 9, 125,
      9, 112, 9, 21, 5, 133, 9, 158, 4, 158, 4, 158, 4, 158, 4, 141, 9, 158, 4,
      158, 4, 158, 4, 157, 9, 165, 9, 173, 9, 181, 9, 189, 9, 193, 9, 201, 9,
      149, 9, 225, 9, 233, 9, 209, 9, 217, 9, 241, 9, 249, 9, 1, 10, 9, 10, 33,
      10, 17, 10, 25, 10, 41, 10, 49, 10, 64, 10, 69, 10, 56, 10, 77, 10, 77,
      10, 77, 10, 77, 10, 77, 10, 77, 10, 77, 10, 77, 10, 85, 10, 93, 10, 220,
      8, 96, 10, 104, 10, 111, 10, 116, 10, 124, 10, 220, 8, 130, 10, 129, 10,
      146, 10, 149, 10, 220, 8, 220, 8, 138, 10, 220, 8, 220, 8, 220, 8, 220, 8,
      220, 8, 164, 10, 172, 10, 156, 10, 220, 8, 220, 8, 220, 8, 177, 10, 220,
      8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 183, 10, 191, 10, 220,
      8, 199, 10, 206, 10, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 220,
      8, 220, 8, 77, 10, 77, 10, 77, 10, 77, 10, 214, 10, 77, 10, 221, 10, 228,
      10, 77, 10, 77, 10, 77, 10, 77, 10, 77, 10, 77, 10, 77, 10, 77, 10, 220,
      8, 236, 10, 243, 10, 247, 10, 253, 10, 3, 11, 11, 11, 16, 11, 70, 5, 32,
      11, 24, 11, 40, 11, 158, 4, 158, 4, 158, 4, 48, 11, 238, 4, 56, 11, 185,
      5, 62, 11, 78, 11, 70, 11, 70, 11, 21, 5, 86, 11, 94, 11, 102, 11, 110, 4,
      110, 11, 220, 8, 220, 8, 117, 11, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8,
      220, 8, 125, 11, 131, 11, 147, 11, 139, 11, 250, 5, 185, 5, 155, 11, 56,
      8, 185, 5, 163, 11, 171, 11, 176, 11, 185, 5, 185, 5, 181, 11, 165, 5,
      220, 8, 188, 11, 196, 11, 204, 11, 210, 11, 220, 8, 204, 11, 218, 11, 220,
      8, 196, 11, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 220,
      8, 226, 11, 185, 5, 185, 5, 185, 5, 234, 11, 185, 5, 185, 5, 185, 5, 185,
      5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 240, 11, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 245, 11, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 170, 8, 220, 8,
      220, 8, 253, 11, 185, 5, 0, 12, 185, 5, 8, 12, 14, 12, 22, 12, 30, 12, 35,
      12, 185, 5, 185, 5, 39, 12, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185,
      5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 46, 12, 185, 5, 53, 12,
      59, 12, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 67, 12, 185, 5, 185, 5,
      185, 5, 75, 12, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 77, 12, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 84, 12, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 91, 12, 185, 5, 185, 5, 185, 5,
      98, 12, 106, 12, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 111, 12, 185, 5, 185, 5, 119, 12,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 123, 12,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 126, 12, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 129, 12, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 135, 12,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 143, 12,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 148, 12, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 153, 12, 185, 5, 185, 5,
      185, 5, 158, 12, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 166, 12, 173, 12, 177, 12, 185, 5, 185, 5, 185, 5, 184, 12, 185,
      5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 170, 8, 110, 4, 198, 12,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 190, 12,
      220, 8, 206, 12, 77, 9, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 211, 12, 219, 12, 158, 4, 235, 12, 227, 12, 185, 5, 185,
      5, 243, 12, 251, 12, 11, 13, 158, 4, 16, 13, 24, 13, 30, 13, 110, 4, 3,
      13, 38, 13, 46, 13, 185, 5, 54, 13, 70, 13, 73, 13, 62, 13, 81, 13, 14, 6,
      89, 13, 96, 13, 104, 13, 86, 6, 120, 13, 112, 13, 128, 13, 185, 5, 136,
      13, 144, 13, 152, 13, 185, 5, 160, 13, 168, 13, 176, 13, 184, 13, 192, 13,
      196, 13, 204, 13, 238, 4, 238, 4, 185, 5, 212, 13, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 220, 13, 227, 13, 158, 8, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 235, 13, 235, 13, 235, 13, 235, 13, 235, 13, 235,
      13, 235, 13, 235, 13, 235, 13, 235, 13, 235, 13, 235, 13, 235, 13, 235,
      13, 235, 13, 235, 13, 235, 13, 235, 13, 235, 13, 235, 13, 235, 13, 235,
      13, 235, 13, 235, 13, 235, 13, 235, 13, 235, 13, 235, 13, 235, 13, 235,
      13, 235, 13, 235, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 185, 5, 185, 5, 185, 5, 251, 13, 185, 5, 185, 12, 2,
      14, 7, 14, 185, 5, 185, 5, 185, 5, 15, 14, 185, 5, 185, 5, 169, 8, 110, 4,
      37, 14, 21, 14, 29, 14, 185, 5, 185, 5, 45, 14, 53, 14, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 58, 14,
      66, 14, 185, 5, 70, 14, 185, 5, 76, 14, 80, 14, 88, 14, 96, 14, 103, 14,
      111, 14, 185, 5, 185, 5, 185, 5, 117, 14, 141, 14, 94, 4, 149, 14, 157,
      14, 162, 14, 190, 8, 125, 14, 133, 14, 235, 13, 235, 13, 235, 13, 235, 13,
      235, 13, 235, 13, 235, 13, 235, 13, 235, 13, 235, 13, 235, 13, 235, 13,
      235, 13, 235, 13, 235, 13, 235, 13, 235, 13, 235, 13, 235, 13, 235, 13,
      235, 13, 235, 13, 235, 13, 235, 13, 235, 13, 235, 13, 235, 13, 235, 13,
      235, 13, 235, 13, 235, 13, 235, 13, 184, 17, 184, 17, 248, 17, 56, 18,
      120, 18, 176, 18, 240, 18, 48, 19, 104, 19, 168, 19, 212, 19, 20, 20, 84,
      20, 100, 20, 164, 20, 216, 20, 24, 21, 72, 21, 136, 21, 200, 21, 216, 21,
      12, 22, 68, 22, 132, 22, 196, 22, 4, 23, 56, 23, 100, 23, 164, 23, 220,
      23, 248, 23, 56, 24, 128, 10, 192, 10, 0, 11, 59, 11, 123, 11, 64, 10,
      187, 11, 64, 10, 221, 11, 64, 10, 64, 10, 64, 10, 64, 10, 29, 12, 219, 1,
      219, 1, 93, 12, 157, 12, 64, 10, 64, 10, 64, 10, 64, 10, 221, 12, 253, 12,
      64, 10, 64, 10, 61, 13, 125, 13, 189, 13, 253, 13, 61, 14, 125, 14, 189,
      14, 244, 14, 219, 1, 219, 1, 24, 15, 76, 15, 219, 1, 116, 15, 219, 1, 219,
      1, 219, 1, 219, 1, 161, 15, 219, 1, 219, 1, 219, 1, 219, 1, 219, 1, 219,
      1, 219, 1, 181, 15, 219, 1, 237, 15, 45, 16, 219, 1, 56, 16, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 120, 16, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 184, 16, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64, 10, 64,
      10, 64, 10, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0,
      7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7,
      0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 248, 16, 0, 7, 0, 7, 0, 7,
      0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0,
      7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7,
      0, 7, 0, 7, 0, 7, 248, 16, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 170, 14, 177, 14, 185, 14, 110, 4, 185, 5,
      185, 5, 185, 5, 165, 5, 201, 14, 193, 14, 224, 14, 209, 14, 216, 14, 232,
      14, 106, 11, 240, 14, 110, 4, 110, 4, 110, 4, 110, 4, 104, 13, 185, 5,
      248, 14, 0, 15, 185, 5, 8, 15, 16, 15, 20, 15, 28, 15, 185, 5, 36, 15,
      110, 4, 70, 5, 80, 5, 44, 15, 185, 5, 48, 15, 56, 15, 72, 15, 64, 15, 185,
      5, 80, 15, 185, 5, 87, 15, 110, 4, 110, 4, 110, 4, 110, 4, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 78, 11, 170, 8,
      76, 14, 110, 4, 110, 4, 110, 4, 110, 4, 103, 15, 95, 15, 106, 15, 114, 15,
      190, 8, 122, 15, 110, 4, 130, 15, 138, 15, 146, 15, 110, 4, 110, 4, 185,
      5, 162, 15, 170, 15, 154, 15, 186, 15, 193, 15, 178, 15, 201, 15, 209, 15,
      110, 4, 225, 15, 217, 15, 185, 5, 228, 15, 236, 15, 244, 15, 252, 15, 4,
      16, 110, 4, 110, 4, 185, 5, 185, 5, 12, 16, 110, 4, 70, 5, 20, 16, 238, 4,
      28, 16, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 36, 16, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 52, 16, 239, 5,
      60, 16, 44, 16, 47, 9, 68, 16, 76, 16, 82, 16, 106, 16, 90, 16, 98, 16,
      110, 16, 47, 9, 126, 16, 118, 16, 134, 16, 150, 16, 142, 16, 110, 4, 110,
      4, 157, 16, 165, 16, 17, 6, 173, 16, 189, 16, 178, 6, 197, 16, 181, 16,
      110, 4, 110, 4, 110, 4, 110, 4, 185, 5, 205, 16, 213, 16, 110, 4, 185, 5,
      221, 16, 229, 16, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 185, 5, 237, 16,
      245, 16, 110, 4, 185, 5, 253, 16, 5, 17, 13, 17, 185, 5, 29, 17, 21, 17,
      110, 4, 45, 17, 37, 17, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      70, 5, 238, 4, 53, 17, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 185, 5,
      61, 17, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      83, 17, 88, 17, 69, 17, 77, 17, 104, 17, 96, 17, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 169, 8, 110, 4, 110, 4,
      110, 4, 120, 17, 128, 17, 136, 17, 112, 17, 185, 5, 185, 5, 185, 5, 185,
      5, 185, 5, 185, 5, 144, 17, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110,
      4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 152, 17, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      154, 17, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 61, 17, 190, 8, 162, 17, 110, 4, 110, 4,
      66, 14, 170, 17, 185, 5, 186, 17, 194, 17, 202, 17, 178, 17, 110, 4, 110,
      4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 185, 5, 185, 5,
      210, 17, 215, 17, 223, 17, 110, 4, 110, 4, 231, 17, 185, 5, 185, 5, 185,
      5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 239, 17, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 247, 17, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 255, 17,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      185, 5, 185, 5, 185, 5, 7, 18, 12, 18, 20, 18, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 220, 8, 220, 8, 220, 8, 220, 8,
      220, 8, 220, 8, 220, 8, 125, 11, 220, 8, 28, 18, 220, 8, 35, 18, 43, 18,
      49, 18, 220, 8, 55, 18, 220, 8, 220, 8, 63, 18, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 220, 8, 220, 8, 126, 10, 71, 18, 110, 4, 110, 4, 110, 4,
      110, 4, 87, 18, 94, 18, 99, 18, 105, 18, 113, 18, 121, 18, 129, 18, 91,
      18, 137, 18, 145, 18, 153, 18, 158, 18, 112, 18, 87, 18, 94, 18, 90, 18,
      105, 18, 166, 18, 88, 18, 169, 18, 91, 18, 177, 18, 185, 18, 193, 18, 200,
      18, 180, 18, 188, 18, 196, 18, 203, 18, 183, 18, 211, 18, 79, 18, 220, 8,
      220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8,
      220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 21, 5, 227, 18, 21, 5,
      234, 18, 241, 18, 219, 18, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      248, 18, 0, 19, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 8, 19, 110, 4, 70,
      5, 24, 19, 16, 19, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 40, 19, 48, 19, 56, 19, 64, 19, 72, 19, 80, 19,
      110, 4, 32, 19, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 220, 8, 88, 19, 220, 8, 220, 8, 117, 11, 93, 19, 97, 19, 125, 11,
      105, 19, 110, 19, 220, 8, 88, 19, 220, 8, 54, 18, 110, 4, 118, 19, 126,
      19, 130, 19, 138, 19, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 220, 8, 220,
      8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 146, 19, 220, 8, 220, 8, 220,
      8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8,
      220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8, 220, 8,
      220, 8, 127, 10, 154, 19, 220, 8, 220, 8, 220, 8, 117, 11, 220, 8, 220, 8,
      162, 19, 110, 4, 88, 19, 220, 8, 170, 19, 220, 8, 178, 19, 127, 11, 110,
      4, 110, 4, 186, 19, 194, 19, 202, 19, 110, 4, 126, 11, 110, 4, 232, 14,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 210, 19, 185, 5, 185, 5, 217, 19, 185, 5,
      185, 5, 185, 5, 225, 19, 185, 5, 233, 19, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 95, 12, 185, 5, 185, 5, 241, 19,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 249, 19, 1, 20, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 158, 12, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 8, 20, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 15, 20, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 22, 20,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
    ],
    'i8',
    ALLOC_NONE,
    Runtime.GLOBAL_BASE,
  );

  allocate(
    [
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 78, 11, 110, 4, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      26, 20, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 48, 15, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 255, 17,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 185, 5, 185, 5, 185, 5, 185, 5, 34, 20, 185, 5, 185, 5, 185, 5,
      185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 185, 5, 48, 15,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 50, 20, 42, 20, 42, 20, 42, 20, 110, 4, 110, 4, 110, 4,
      110, 4, 21, 5, 21, 5, 21, 5, 21, 5, 21, 5, 21, 5, 21, 5, 58, 20, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4, 110, 4,
      110, 4, 110, 4, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243, 13, 243,
      13, 66, 20, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0,
      15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15,
      0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0,
      15, 0, 15, 0, 12, 0, 23, 0, 23, 0, 23, 0, 25, 0, 23, 0, 23, 0, 23, 0, 20,
      0, 21, 0, 23, 0, 24, 0, 23, 0, 19, 0, 23, 0, 23, 0, 73, 0, 137, 0, 201, 0,
      9, 1, 73, 1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 23, 0, 23, 0, 24, 0, 24,
      0, 24, 0, 23, 0, 23, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 20, 0, 23, 0, 21, 0, 26, 0, 22, 0, 26, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 20, 0, 24, 0, 21, 0, 24, 0, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 15, 0, 15, 0, 15, 0, 15,
      0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0,
      15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15,
      0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 15, 0, 12, 0, 23, 0, 25, 0,
      25, 0, 25, 0, 25, 0, 27, 0, 23, 0, 26, 0, 27, 0, 5, 0, 28, 0, 24, 0, 16,
      0, 27, 0, 26, 0, 27, 0, 24, 0, 75, 3, 139, 3, 26, 0, 2, 0, 23, 0, 23, 0,
      26, 0, 11, 3, 5, 0, 29, 0, 203, 52, 75, 52, 203, 60, 23, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 24, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 24, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1,
      0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0,
      2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2,
      0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0,
      1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2,
      0, 1, 0, 2, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0,
      2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2,
      0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0,
      1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1,
      0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 2, 0, 2, 0, 1, 0, 1, 0, 2, 0, 1, 0,
      2, 0, 1, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1, 0, 2, 0, 2, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 2, 0, 1, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1, 0, 2, 0, 2, 0, 2, 0, 1, 0, 1, 0,
      2, 0, 1, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 1, 0, 2, 0, 1, 0, 2,
      0, 2, 0, 1, 0, 2, 0, 1, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1, 0, 2, 0, 1, 0, 2, 0,
      1, 0, 1, 0, 2, 0, 2, 0, 5, 0, 1, 0, 2, 0, 2, 0, 2, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 1, 0, 3, 0, 2, 0, 1, 0, 3, 0, 2, 0, 1, 0, 3, 0, 2, 0, 1, 0, 2, 0, 1, 0,
      2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2,
      0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0,
      2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 2, 0, 1, 0, 3, 0, 2, 0, 1, 0, 2,
      0, 1, 0, 1, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0,
      1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1,
      0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0,
      2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2,
      0, 1, 0, 2, 0, 1, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 1, 0, 1, 0,
      2, 0, 1, 0, 1, 0, 2, 0, 2, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1, 0, 1, 0, 2, 0, 1,
      0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 5, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 4, 0, 4, 0, 4, 0, 4, 0,
      4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4,
      0, 4, 0, 26, 0, 26, 0, 26, 0, 26, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0,
      4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26,
      0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 4, 0, 4, 0, 4,
      0, 4, 0, 4, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 4, 0, 26,
      0, 4, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0,
      26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 1, 0, 2,
      0, 1, 0, 2, 0, 4, 0, 26, 0, 1, 0, 2, 0, 0, 0, 0, 0, 4, 0, 2, 0, 2, 0, 2,
      0, 23, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 26, 0, 26, 0, 1, 0, 23, 0, 1, 0,
      1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 1, 0, 2, 0, 2, 0, 1, 0, 1,
      0, 1, 0, 2, 0, 2, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0,
      1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1,
      0, 2, 0, 1, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 1, 0, 2, 0, 24, 0, 1, 0, 2,
      0, 1, 0, 1, 0, 2, 0, 2, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1,
      0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0,
      2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 27, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 7, 0, 7, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2,
      0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0,
      1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1,
      0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0,
      2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 1, 0, 2, 0, 1,
      0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 2, 0,
      1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1,
      0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0,
      2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2,
      0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 0, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      0, 0, 0, 0, 4, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 0, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 0, 0, 23, 0, 19, 0, 0, 0, 0, 0, 27, 0, 27, 0,
      25, 0, 0, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 19, 0, 6, 0,
      23, 0, 6, 0, 6, 0, 23, 0, 6, 0, 6, 0, 23, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5,
      0, 5, 0, 23, 0, 23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 24, 0, 24, 0, 24,
      0, 23, 0, 23, 0, 25, 0, 23, 0, 23, 0, 27, 0, 27, 0, 6, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 23, 0, 16, 0, 0, 0, 23, 0,
      23, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 4, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9,
      2, 73, 2, 137, 2, 23, 0, 23, 0, 23, 0, 23, 0, 5, 0, 5, 0, 6, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 23, 0, 5, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      16, 0, 27, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 4, 0, 4, 0, 6, 0, 6, 0,
      27, 0, 6, 0, 6, 0, 6, 0, 6, 0, 5, 0, 5, 0, 73, 0, 137, 0, 201, 0, 9, 1,
      73, 1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 5, 0, 5, 0, 5, 0, 27, 0, 27,
      0, 5, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0,
      23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 0, 0, 16, 0, 5, 0, 6, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 0, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2,
      73, 2, 137, 2, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 4, 0, 4, 0, 27, 0, 23, 0, 23, 0,
      23, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 6, 0, 6, 0, 6, 0, 4, 0,
      6, 0, 6, 0, 6, 0, 4, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 0, 0, 23, 0,
      23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23,
      0, 23, 0, 23, 0, 23, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 6, 0, 6, 0, 6, 0, 6, 0, 4, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6,
      0, 6, 0, 6, 0, 0, 0, 0, 0, 23, 0, 0, 0, 6, 0, 6, 0, 16, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 5, 0, 5, 0, 6, 0, 6, 0, 23, 0, 23, 0, 73, 0, 137, 0,
      201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 23, 0, 4, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 6, 0, 6, 0, 6, 0, 8, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 8, 0, 6,
      0, 5, 0, 8, 0, 8, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      8, 0, 8, 0, 8, 0, 8, 0, 6, 0, 8, 0, 8, 0, 5, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      6, 0, 6, 0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201,
      1, 9, 2, 73, 2, 137, 2, 5, 0, 5, 0, 25, 0, 25, 0, 203, 55, 203, 53, 203,
      63, 203, 52, 203, 60, 75, 9, 27, 0, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0,
      6, 0, 8, 0, 8, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0,
      0, 0, 0, 5, 0, 5, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0,
      0, 0, 6, 0, 5, 0, 8, 0, 8, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 0, 0, 8,
      0, 8, 0, 0, 0, 0, 0, 8, 0, 8, 0, 6, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 0, 0, 5, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137,
      1, 201, 1, 9, 2, 73, 2, 137, 2, 6, 0, 6, 0, 5, 0, 5, 0, 5, 0, 6, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 6, 0, 8,
      0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0,
      5, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      0, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 0, 0, 0, 0, 6, 0, 0,
      0, 8, 0, 8, 0, 8, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 6, 0, 0, 0,
      0, 0, 6, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 0, 0, 5, 0, 5, 0, 6, 0,
      6, 0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9,
      2, 73, 2, 137, 2, 23, 0, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 6, 0, 8, 0, 0, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0,
      0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0,
      5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 6, 0, 5, 0, 8, 0, 8,
      0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 6, 0, 6, 0, 8, 0, 0, 0, 8, 0,
      8, 0, 6, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 6, 0, 6, 0, 0, 0,
      0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2, 73, 2,
      137, 2, 27, 0, 5, 0, 203, 52, 75, 52, 203, 60, 203, 55, 203, 53, 203, 63,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 8, 0, 8, 0, 0,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 5, 0, 5, 0,
      0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0,
      5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 6, 0, 5, 0, 8,
      0, 6, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 0, 0, 8, 0, 8, 0, 0, 0, 0, 0,
      8, 0, 8, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 8,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2, 73,
      2, 137, 2, 203, 7, 75, 30, 75, 120, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 25, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 5, 0, 0,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0,
      0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 0, 0, 5, 0, 0,
      0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0,
      5, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 8, 0, 6, 0, 8, 0, 8, 0,
      0, 0, 0, 0, 0, 0, 8, 0, 8, 0, 8, 0, 0, 0, 8, 0, 8, 0, 8, 0, 6, 0, 0, 0, 0,
      0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 6, 0, 6, 0, 0, 0, 0, 0, 73, 0, 137, 0,
      201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 75, 5, 139, 5, 203, 5, 11, 6, 139, 5,
      203, 5, 11, 6, 27, 0, 6, 0, 8, 0, 8, 0, 8, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 5, 0, 6, 0, 6, 0, 6, 0, 8, 0, 8,
      0, 8, 0, 8, 0, 0, 0, 6, 0, 6, 0, 6, 0, 0, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 6, 0, 0, 0, 5, 0, 5, 0, 5, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 6, 0, 6, 0, 0, 0, 0, 0, 73, 0, 137,
      0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 0, 0, 5, 0,
      5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 5, 0, 6, 0, 8, 0, 8, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 0, 0, 0, 0, 6, 0, 5, 0, 8, 0, 6, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0,
      0, 0, 6, 0, 8, 0, 8, 0, 0, 0, 8, 0, 8, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 8, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      5, 0, 0, 0, 5, 0, 5, 0, 6, 0, 6, 0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9,
      1, 73, 1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 203, 7, 75, 30, 75, 120,
      203, 52, 75, 52, 203, 60, 203, 55, 203, 53, 203, 63, 27, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 0, 0, 6, 0, 8, 0, 8, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 0, 0, 0, 0, 5, 0, 8, 0, 8, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 8, 0,
      8, 0, 8, 0, 0, 0, 8, 0, 8, 0, 8, 0, 6, 0, 5, 0, 27, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 5, 0, 5, 0, 5, 0, 8, 0, 11, 204, 11, 202, 75, 203, 11, 201, 75, 54,
      75, 201, 11, 53, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 73, 0, 137, 0,
      201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 0, 0, 0, 0, 8,
      0, 8, 0, 23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 8, 0, 8, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0,
      0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 0, 0, 0, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 8, 0, 8, 0, 8, 0, 6, 0, 6, 0, 6, 0, 0, 0, 6, 0, 0, 0, 8, 0, 8, 0,
      8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 5, 0,
      5, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      25, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 4, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 23, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1,
      201, 1, 9, 2, 73, 2, 137, 2, 23, 0, 23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      5, 0, 5, 0, 0, 0, 5, 0, 0, 0, 0, 0, 5, 0, 5, 0, 0, 0, 5, 0, 0, 0, 0, 0, 5,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 0,
      0, 5, 0, 0, 0, 0, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 5, 0,
      5, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 6, 0, 6, 0, 5, 0, 0, 0, 0,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 4, 0, 0, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201,
      1, 9, 2, 73, 2, 137, 2, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 27, 0,
      27, 0, 27, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23,
      0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 27, 0, 23, 0, 27, 0, 27, 0,
      27, 0, 6, 0, 6, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 73, 0, 137,
      0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 75, 52, 75,
      60, 75, 68, 75, 76, 75, 84, 75, 92, 75, 100, 75, 108, 75, 116, 75, 44, 27,
      0, 6, 0, 27, 0, 6, 0, 27, 0, 6, 0, 20, 0, 21, 0, 20, 0, 21, 0, 8, 0, 8, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 23, 0, 6, 0, 6, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 0, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 6, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 0, 0, 27, 0, 27, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 23, 0, 23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 8, 0, 8,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 8, 0,
      6, 0, 6, 0, 8, 0, 8, 0, 6, 0, 6, 0, 5, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73,
      1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0,
      23, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 8, 0, 8, 0, 6, 0, 6, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 6, 0, 6, 0, 6, 0, 5, 0, 8, 0, 8, 0, 8, 0, 5, 0, 5, 0, 8,
      0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 5, 0, 5, 0, 5, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 6, 0, 8, 0, 8, 0, 6, 0, 6, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0,
      6, 0, 5, 0, 8, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9,
      2, 73, 2, 137, 2, 8, 0, 8, 0, 8, 0, 6, 0, 27, 0, 27, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 23,
      0, 4, 0, 5, 0, 5, 0, 5, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 0, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0,
      0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 6, 0, 6, 0, 6, 0, 23, 0,
      23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 11, 3, 75, 3, 139,
      3, 203, 3, 11, 4, 75, 4, 139, 4, 203, 4, 11, 5, 203, 7, 75, 10, 203, 12,
      75, 15, 203, 17, 75, 20, 203, 22, 75, 25, 203, 27, 75, 30, 139, 120, 0, 0,
      0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 0, 0, 0, 0, 19, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 23, 0, 23, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 12, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 20, 0,
      21, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 23, 0, 23, 0, 23, 0, 138, 9, 202, 9, 10, 10, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 6, 0, 6, 0, 6, 0, 23, 0, 23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5,
      0, 5, 0, 0, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0,
      6, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 8, 0, 8, 0, 8, 0, 8,
      0, 8, 0, 8, 0, 8, 0, 8, 0, 6, 0, 8, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 23, 0, 23, 0, 23, 0, 4, 0, 23, 0, 23,
      0, 23, 0, 25, 0, 5, 0, 6, 0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73,
      1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 75, 5, 139, 5, 203, 5, 11, 6, 75, 6, 139, 6, 203, 6, 11, 7, 75, 7, 139,
      7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 6, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 19, 0, 23, 0, 23, 0, 23,
      0, 23, 0, 6, 0, 6, 0, 6, 0, 16, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73,
      1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 5, 0, 5, 0, 5, 0, 4, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 6, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 6, 0, 6, 0,
      8, 0, 8, 0, 8, 0, 8, 0, 6, 0, 6, 0, 8, 0, 8, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 8, 0, 8, 0, 6, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 6, 0, 6, 0, 6, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 0, 0, 0, 0, 0, 0, 23, 0, 23, 0, 73, 0, 137,
      0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2, 73,
      2, 137, 2, 11, 3, 0, 0, 0, 0, 0, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 6, 0, 8, 0, 8, 0, 6, 0, 0,
      0, 0, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 4,
      0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 0, 0, 0, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 7, 0, 0,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
    ],
    'i8',
    ALLOC_NONE,
    Runtime.GLOBAL_BASE + 10240,
  );
  allocate(
    [
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 8, 0, 6, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 0, 0, 6, 0, 8, 0, 6, 0, 8, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 0, 0, 6, 0, 73, 0, 137, 0, 201,
      0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2,
      73, 2, 137, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 23, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 6, 0, 6, 0, 6, 0, 6, 0, 8, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 6, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 8, 0, 6, 0, 8, 0, 8, 0,
      8, 0, 8, 0, 8, 0, 6, 0, 8, 0, 8, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1,
      201, 1, 9, 2, 73, 2, 137, 2, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 5,
      0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 8, 0, 8, 0, 6, 0, 6, 0, 8, 0, 6, 0, 6, 0,
      6, 0, 5, 0, 5, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9,
      2, 73, 2, 137, 2, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 6, 0, 8, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 8, 0, 6, 0, 6, 0, 8, 0, 8, 0, 8, 0,
      6, 0, 8, 0, 6, 0, 6, 0, 6, 0, 8, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 23, 0, 23, 0, 23, 0, 23, 0, 73, 0, 137, 0, 201, 0, 9, 1,
      73, 1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0,
      5, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2, 73, 2,
      137, 2, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0,
      8, 0, 8, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 8, 0, 8,
      0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 4, 0, 4, 0,
      4, 0, 4, 0, 4, 0, 4, 0, 23, 0, 23, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 6, 0, 6, 0, 23, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 8, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 8, 0, 8, 0, 6, 0, 5, 0, 5, 0, 0, 0, 6, 0, 6, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4,
      0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0,
      4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4,
      0, 4, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 4, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0,
      2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2,
      0, 1, 0, 2, 0, 1, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      1, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 26, 0, 26, 0, 26, 0, 0, 0, 0, 0, 2, 0, 2, 0, 2, 0, 0, 0, 2,
      0, 2, 0, 1, 0, 1, 0, 1, 0, 1, 0, 3, 0, 26, 0, 26, 0, 0, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 0, 0, 0, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 0, 0, 0, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 0, 0, 1, 0,
      0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 0, 0, 0,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 3, 0, 3, 0, 3, 0, 3, 0,
      3, 0, 3, 0, 3, 0, 3, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 3,
      0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      0, 0, 2, 0, 2, 0, 1, 0, 1, 0, 1, 0, 1, 0, 3, 0, 26, 0, 2, 0, 26, 0, 26, 0,
      26, 0, 2, 0, 2, 0, 2, 0, 0, 0, 2, 0, 2, 0, 1, 0, 1, 0, 1, 0, 1, 0, 3, 0,
      26, 0, 26, 0, 26, 0, 2, 0, 2, 0, 2, 0, 2, 0, 0, 0, 0, 0, 2, 0, 2, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 0, 0, 26, 0, 26, 0, 26, 0, 22, 0, 23, 0, 23, 0, 23, 0,
      24, 0, 20, 0, 21, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23,
      0, 23, 0, 23, 0, 23, 0, 24, 0, 23, 0, 22, 0, 23, 0, 23, 0, 23, 0, 23, 0,
      23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 12, 0, 16, 0, 16, 0, 16, 0, 16,
      0, 16, 0, 0, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0,
      16, 0, 16, 0, 203, 2, 4, 0, 0, 0, 0, 0, 203, 3, 11, 4, 75, 4, 139, 4, 203,
      4, 11, 5, 24, 0, 24, 0, 24, 0, 20, 0, 21, 0, 4, 0, 12, 0, 12, 0, 12, 0,
      12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 16, 0, 16, 0, 16,
      0, 16, 0, 16, 0, 19, 0, 19, 0, 19, 0, 19, 0, 19, 0, 19, 0, 23, 0, 23, 0,
      28, 0, 29, 0, 20, 0, 28, 0, 28, 0, 29, 0, 20, 0, 28, 0, 23, 0, 23, 0, 23,
      0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 13, 0, 14, 0, 16, 0, 16, 0, 16, 0,
      16, 0, 16, 0, 12, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23,
      0, 23, 0, 28, 0, 29, 0, 23, 0, 23, 0, 23, 0, 23, 0, 22, 0, 203, 2, 11, 3,
      75, 3, 139, 3, 203, 3, 11, 4, 75, 4, 139, 4, 203, 4, 11, 5, 24, 0, 24, 0,
      24, 0, 20, 0, 21, 0, 0, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0,
      4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 0, 0, 0, 0, 0, 0, 25, 0, 25, 0, 25, 0, 25,
      0, 25, 0, 25, 0, 25, 0, 25, 0, 25, 0, 25, 0, 25, 0, 25, 0, 25, 0, 25, 0,
      25, 0, 25, 0, 25, 0, 25, 0, 25, 0, 25, 0, 25, 0, 25, 0, 25, 0, 25, 0, 25,
      0, 25, 0, 25, 0, 25, 0, 25, 0, 25, 0, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      7, 0, 7, 0, 7, 0, 7, 0, 6, 0, 7, 0, 7, 0, 7, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 1, 0, 27, 0, 1, 0, 27, 0, 1, 0, 27, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 27, 0, 2, 0, 1, 0, 1, 0, 1, 0, 1, 0, 2, 0, 5, 0, 5, 0, 5, 0, 5, 0, 2,
      0, 27, 0, 27, 0, 2, 0, 2, 0, 1, 0, 1, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24,
      0, 1, 0, 2, 0, 2, 0, 2, 0, 2, 0, 27, 0, 24, 0, 27, 0, 27, 0, 2, 0, 27, 0,
      139, 53, 11, 54, 75, 54, 139, 52, 139, 56, 11, 53, 11, 57, 11, 61, 11, 65,
      75, 53, 75, 69, 203, 53, 203, 61, 203, 69, 203, 77, 139, 5, 27, 0, 27, 0,
      1, 0, 27, 0, 27, 0, 27, 0, 27, 0, 1, 0, 27, 0, 27, 0, 2, 0, 1, 0, 1, 0, 1,
      0, 2, 0, 2, 0, 1, 0, 1, 0, 1, 0, 2, 0, 27, 0, 1, 0, 27, 0, 27, 0, 24, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 27, 0, 27, 0, 138, 5, 202, 5, 10, 6, 74, 6,
      138, 6, 202, 6, 10, 7, 74, 7, 138, 7, 202, 7, 10, 8, 74, 8, 202, 17, 74,
      30, 10, 152, 74, 120, 138, 5, 202, 5, 10, 6, 74, 6, 138, 6, 202, 6, 10, 7,
      74, 7, 138, 7, 202, 7, 10, 8, 74, 8, 202, 17, 74, 30, 10, 152, 74, 120,
      74, 120, 74, 152, 138, 120, 1, 0, 2, 0, 202, 6, 202, 17, 138, 152, 202,
      120, 75, 5, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 24, 0, 24, 0, 24, 0, 24,
      0, 24, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 24, 0, 24, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 24, 0, 24, 0, 24, 0,
      24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 27,
      0, 27, 0, 24, 0, 27, 0, 27, 0, 24, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 24, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 24, 0, 24, 0, 27, 0, 27, 0, 24, 0, 27, 0, 24, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 24, 0, 24, 0,
      24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24,
      0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0,
      24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 20, 0, 21, 0, 20, 0, 21, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 24, 0,
      24, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 20, 0, 21, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 24, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 24, 0, 24, 0, 24, 0, 24,
      0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0,
      24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 203, 2, 11, 8, 75, 8,
      139, 8, 203, 8, 11, 9, 75, 9, 139, 9, 203, 9, 11, 10, 75, 10, 11, 3, 75,
      3, 139, 3, 203, 3, 11, 4, 75, 4, 139, 4, 203, 4, 11, 5, 203, 7, 203, 2,
      11, 3, 75, 3, 139, 3, 203, 3, 11, 4, 75, 4, 139, 4, 203, 4, 11, 5, 203, 7,
      11, 8, 75, 8, 139, 8, 203, 8, 11, 9, 75, 9, 139, 9, 203, 9, 11, 10, 75,
      10, 11, 3, 75, 3, 139, 3, 203, 3, 11, 4, 75, 4, 139, 4, 203, 4, 11, 5,
      203, 7, 11, 8, 75, 8, 139, 8, 203, 8, 11, 9, 75, 9, 139, 9, 203, 9, 11,
      10, 75, 10, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0,
      24, 0, 24, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 24, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 24, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 24, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0, 20,
      0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0, 11, 3, 75, 3, 139, 3, 203, 3, 11, 4,
      75, 4, 139, 4, 203, 4, 11, 5, 203, 7, 11, 3, 75, 3, 139, 3, 203, 3, 11, 4,
      75, 4, 139, 4, 203, 4, 11, 5, 203, 7, 11, 3, 75, 3, 139, 3, 203, 3, 11, 4,
      75, 4, 139, 4, 203, 4, 11, 5, 203, 7, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 24, 0, 24, 0, 24, 0, 24,
      0, 24, 0, 20, 0, 21, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0,
      24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24,
      0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 20, 0,
      21, 0, 20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0, 24, 0, 24,
      0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0,
      24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 20, 0, 21, 0, 20, 0, 21,
      0, 20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0,
      20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0, 24, 0, 24, 0, 24,
      0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0,
      24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24,
      0, 24, 0, 24, 0, 24, 0, 20, 0, 21, 0, 20, 0, 21, 0, 24, 0, 24, 0, 24, 0,
      24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24,
      0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0,
      24, 0, 24, 0, 24, 0, 24, 0, 20, 0, 21, 0, 24, 0, 24, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24,
      0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 27, 0,
      27, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 24, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 0, 0, 0, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 0, 0, 0, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 0, 0, 0,
      0, 0, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 0, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 27, 0, 27, 0, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1, 0, 2, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1,
      0, 2, 0, 1, 0, 1, 0, 1, 0, 1, 0, 2, 0, 1, 0, 2, 0, 2, 0, 1, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 4, 0, 4, 0, 1, 0, 1, 0, 1, 0, 2, 0, 1, 0, 2, 0, 2,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 1, 0, 2, 0, 1, 0, 2, 0, 6, 0,
      6, 0, 6, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 23, 0, 23, 0, 23, 0,
      23, 0, 75, 52, 23, 0, 23, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 0, 0, 2,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 23, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 23, 0, 23, 0, 28, 0, 29, 0, 28, 0, 29, 0, 23, 0, 23, 0, 23, 0, 28, 0,
      29, 0, 23, 0, 28, 0, 29, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23,
      0, 23, 0, 23, 0, 19, 0, 23, 0, 23, 0, 19, 0, 23, 0, 28, 0, 29, 0, 23, 0,
      23, 0, 28, 0, 29, 0, 20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21,
      0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 4, 0, 23, 0, 23, 0, 23, 0, 23, 0,
      23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 19, 0, 19, 0, 23, 0, 23, 0, 23,
      0, 23, 0, 19, 0, 23, 0, 20, 0, 23, 0, 23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 0, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 138, 5, 202, 5, 10, 6, 74, 6, 138, 6, 202,
      6, 10, 7, 74, 7, 138, 7, 6, 0, 6, 0, 6, 0, 6, 0, 8, 0, 8, 0, 19, 0, 4, 0,
      4, 0, 4, 0, 4, 0, 4, 0, 27, 0, 27, 0, 202, 7, 74, 10, 202, 12, 4, 0, 5, 0,
      23, 0, 27, 0, 27, 0, 12, 0, 23, 0, 23, 0, 23, 0, 27, 0, 4, 0, 5, 0, 74, 5,
      20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0, 27,
      0, 27, 0, 20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0, 19, 0,
      20, 0, 21, 0, 21, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 0, 0, 0, 0, 6, 0, 6, 0, 26, 0, 26, 0, 4, 0, 4, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 23, 0, 4, 0, 4, 0, 4, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0,
      27, 0, 27, 0, 139, 5, 203, 5, 11, 6, 75, 6, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 0, 0, 139, 5, 203,
      5, 11, 6, 75, 6, 139, 6, 203, 6, 11, 7, 75, 7, 139, 7, 203, 7, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 203,
      7, 75, 10, 203, 12, 75, 15, 203, 17, 75, 20, 203, 22, 75, 25, 27, 0, 139,
      10, 203, 10, 11, 11, 75, 11, 139, 11, 203, 11, 11, 12, 75, 12, 139, 12,
      203, 12, 11, 13, 75, 13, 139, 13, 203, 13, 11, 14, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 75, 14, 139, 14, 203, 14, 11, 15, 75, 15, 139, 15,
      203, 15, 11, 16, 75, 16, 139, 16, 203, 16, 11, 17, 75, 17, 139, 17, 203,
      17, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 133, 6, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 197, 5,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 133, 6, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 7, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 133, 5, 5, 0,
      5, 0, 5, 7, 5, 0, 5, 0, 5, 0, 133, 120, 5, 0, 5, 6, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 133, 7, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 197, 5, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 133, 6, 5, 0, 69, 6, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      133, 121, 197, 7, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 69, 120, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 6, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 133, 6, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      69, 30, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 133, 121, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 133, 122, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 197, 5, 5, 0, 69, 7, 5, 0, 197, 6, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 197, 7, 5, 0, 69, 120, 69, 10, 197, 12, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 69, 15, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 6, 5, 6, 5,
      6, 5, 6, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 69, 6, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      133, 5, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 133, 5, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 133, 5, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 133, 7, 69, 10, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 133, 5,
      197, 5, 5, 6, 5, 0, 197, 5, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 197, 7, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 69, 7, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 7, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 133, 7, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 69, 30, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 69, 6, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 133, 120, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 197, 5, 5, 0, 5, 0, 5, 0, 5, 0, 197,
      5, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 197, 5, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 69, 120, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 197, 6, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 69,
      30, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 197, 6, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 69, 5, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 4, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 4, 0, 23, 0, 23, 0, 23,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201,
      1, 9, 2, 73, 2, 137, 2, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2,
      0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0,
      1, 0, 2, 0, 1, 0, 2, 0, 4, 0, 4, 0, 6, 0, 6, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1,
      0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 5, 0, 6, 0, 7, 0,
      7, 0, 7, 0, 23, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 23, 0, 4, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 138, 5, 202, 5, 10,
      6, 74, 6, 138, 6, 202, 6, 10, 7, 74, 7, 138, 7, 74, 5, 6, 0, 6, 0, 23, 0,
      23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0,
      26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26,
      0, 26, 0, 26, 0, 26, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 4,
      0, 4, 0, 2, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 26, 0, 26, 0, 1, 0, 2, 0, 1,
      0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 2, 0,
      2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2,
      0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 4, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1,
      0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 4, 0, 26, 0, 26, 0, 1, 0, 2, 0, 1, 0, 2,
      0, 5, 0, 1, 0, 2, 0, 1, 0, 2, 0, 2, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0,
      2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 2, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 6, 0, 5, 0, 5, 0, 5, 0, 6, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 6, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 8, 0, 8, 0, 6, 0, 6, 0, 8, 0, 27, 0, 27, 0, 27, 0, 27, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 203, 52, 75, 52, 203, 60, 203, 55, 203, 53, 203, 63, 27,
      0, 27, 0, 25, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 23, 0, 23, 0, 23, 0, 23, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 8, 0, 8, 0, 8, 0, 6, 0, 6, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 23, 0, 23, 0, 73, 0, 137, 0,
      201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 8, 0, 8, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 8, 0, 8, 0,
      8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 23, 0, 23, 0, 23, 0,
      5, 0, 23, 0, 5, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 23, 0, 23, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 8, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 23, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 8, 0,
      23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23,
      0, 23, 0, 23, 0, 0, 0, 4, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1,
      201, 1, 9, 2, 73, 2, 137, 2, 0, 0, 0, 0, 0, 0, 0, 0, 23, 0, 23, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 8, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      8, 0, 8, 0, 6, 0, 8, 0, 8, 0, 8, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 4,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 73, 0, 137, 0,
      201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 8, 0, 8, 0, 6, 0, 6, 0, 8, 0, 8, 0, 6,
      0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0,
      5, 0, 6, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 8, 0, 0,
      0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2, 73, 2,
      137, 2, 0, 0, 0, 0, 23, 0, 23, 0, 23, 0, 23, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 4, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 27, 0, 27, 0, 27, 0, 5, 0, 8, 0, 6, 0,
      8, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 5, 0, 6, 0, 6, 0, 6, 0, 5, 0,
      5, 0, 6, 0, 6, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 6, 0, 5, 0, 6, 0, 5,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5,
      0, 5, 0, 4, 0, 23, 0, 23, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 8, 0, 6, 0, 6, 0, 8, 0, 8, 0, 23, 0, 23, 0, 5, 0, 4,
      0, 4, 0, 8, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      26, 0, 4, 0, 4, 0, 4, 0, 4, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      5, 0, 5, 0, 5, 0, 8, 0, 8, 0, 6, 0, 8, 0, 8, 0, 6, 0, 8, 0, 8, 0, 23, 0,
      8, 0, 6, 0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201,
      1, 9, 2, 73, 2, 137, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 18, 0, 18, 0, 18, 0, 18, 0,
      18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18,
      0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0,
      18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 17, 0, 17, 0, 17, 0, 17,
      0, 17, 0, 17, 0, 17, 0, 17, 0, 17,
    ],
    'i8',
    ALLOC_NONE,
    Runtime.GLOBAL_BASE + 20480,
  );

  allocate(
    [
      17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17,
      0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0,
      17, 0, 17, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 6, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 197, 7, 5, 0, 5, 0,
      5, 0, 5, 0, 197, 5, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 197, 6,
      5, 0, 197, 6, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 197, 7, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0,
      0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 24, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 0, 0, 5, 0, 0, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 5, 0, 6, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 26, 0,
      26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26,
      0, 26, 0, 26, 0, 26, 0, 26, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 21, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 25, 0, 27, 0, 0, 0, 0, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 23, 0, 23,
      0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 20, 0, 21, 0, 23, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 23, 0, 19, 0, 19, 0, 22, 0, 22,
      0, 20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0,
      20, 0, 21, 0, 23, 0, 23, 0, 20, 0, 21, 0, 23, 0, 23, 0, 23, 0, 23, 0, 22,
      0, 22, 0, 22, 0, 23, 0, 23, 0, 23, 0, 0, 0, 23, 0, 23, 0, 23, 0, 23, 0,
      19, 0, 20, 0, 21, 0, 20, 0, 21, 0, 20, 0, 21, 0, 23, 0, 23, 0, 23, 0, 24,
      0, 19, 0, 24, 0, 24, 0, 24, 0, 0, 0, 23, 0, 25, 0, 23, 0, 23, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 0, 0, 0, 0, 16, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0,
      25, 0, 25, 0, 24, 0, 26, 0, 27, 0, 25, 0, 25, 0, 0, 0, 27, 0, 24, 0, 24,
      0, 24, 0, 24, 0, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 16, 0, 16, 0, 16, 0, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 23,
      0, 23, 0, 23, 0, 25, 0, 23, 0, 23, 0, 23, 0, 20, 0, 21, 0, 23, 0, 24, 0,
      23, 0, 19, 0, 23, 0, 23, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1,
      201, 1, 9, 2, 73, 2, 137, 2, 23, 0, 23, 0, 24, 0, 24, 0, 24, 0, 23, 0, 26,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 20, 0, 24, 0, 21, 0, 24, 0, 20, 0, 21, 0, 23, 0, 20, 0, 21, 0,
      23, 0, 23, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      4, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 4, 0, 4, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 0, 0, 0, 0, 11, 176, 11, 184, 75, 120, 75, 128, 75, 136, 75, 144,
      75, 152, 75, 160, 75, 168, 75, 176, 75, 184, 139, 120, 139, 128, 139, 136,
      139, 144, 139, 152, 139, 160, 139, 168, 139, 176, 139, 184, 0, 0, 0, 0, 0,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 23, 0,
      23, 0, 23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 139, 5, 203, 5, 11, 6, 75, 6, 139,
      6, 203, 6, 11, 7, 75, 7, 139, 7, 203, 7, 75, 10, 203, 12, 75, 15, 203, 17,
      75, 20, 203, 22, 75, 25, 203, 27, 75, 30, 11, 128, 11, 136, 11, 144, 11,
      152, 11, 160, 11, 168, 202, 7, 202, 7, 202, 7, 202, 7, 202, 7, 202, 12,
      202, 17, 202, 17, 202, 17, 202, 17, 74, 30, 10, 136, 10, 152, 10, 152, 10,
      152, 10, 152, 10, 152, 74, 120, 74, 152, 138, 6, 202, 17, 75, 52, 75, 52,
      139, 56, 203, 60, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 75, 5, 203, 52, 27, 0, 27, 0, 27, 0, 0,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 202, 52, 74, 52, 138, 5, 138, 6,
      202, 17, 10, 152, 74, 152, 138, 152, 138, 6, 202, 7, 202, 17, 74, 30, 10,
      152, 74, 120, 74, 152, 138, 6, 202, 7, 202, 17, 74, 30, 10, 152, 74, 120,
      138, 120, 138, 152, 202, 7, 138, 5, 138, 5, 138, 5, 202, 5, 202, 5, 202,
      5, 202, 5, 138, 6, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 6, 0, 0, 0, 0, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 139, 5, 203, 5, 11, 6, 75, 6, 139, 6,
      203, 6, 11, 7, 75, 7, 139, 7, 203, 7, 75, 10, 203, 12, 75, 15, 203, 17,
      75, 20, 203, 22, 75, 25, 203, 27, 75, 30, 11, 128, 11, 136, 11, 144, 11,
      152, 11, 160, 11, 168, 11, 176, 11, 184, 0, 0, 0, 0, 0, 0, 0, 0, 139, 5,
      139, 6, 203, 7, 203, 17, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 202, 27, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 10, 184, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0,
      23, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 23, 0, 138, 5, 202, 5, 202, 7, 74, 10, 74,
      30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 73, 0, 137, 0, 201,
      0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 23, 0, 139, 5,
      203, 5, 11, 6, 203, 7, 75, 10, 75, 30, 75, 120, 139, 120, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 27, 0, 27, 0, 139, 5, 203,
      5, 11, 6, 75, 6, 139, 6, 203, 7, 75, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 139, 5, 203, 5, 11, 6, 75, 6, 75, 6, 139, 6, 203, 7, 75, 10, 75,
      30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5,
      0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 139, 5, 139, 6, 203, 7, 75, 10, 75,
      30, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 139, 5,
      203, 7, 75, 10, 75, 30, 203, 5, 11, 6, 0, 0, 0, 0, 0, 0, 23, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 23, 0, 75, 160, 75, 168, 75, 176, 75, 184, 139,
      120, 139, 128, 139, 136, 139, 144, 139, 152, 139, 160, 139, 168, 139, 176,
      139, 184, 203, 120, 203, 128, 203, 136, 203, 144, 203, 152, 203, 160, 203,
      168, 203, 176, 203, 184, 203, 54, 75, 53, 203, 52, 139, 52, 203, 70, 75,
      52, 203, 78, 139, 56, 203, 60, 75, 69, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 203, 94, 75, 52,
      5, 0, 5, 0, 139, 5, 203, 5, 11, 6, 75, 6, 139, 6, 203, 6, 11, 7, 75, 7,
      139, 7, 203, 7, 75, 10, 203, 12, 75, 15, 203, 17, 75, 20, 203, 22, 0, 0,
      0, 0, 75, 30, 11, 128, 11, 136, 11, 144, 11, 152, 11, 160, 11, 168, 11,
      176, 11, 184, 75, 120, 75, 128, 75, 136, 75, 144, 75, 152, 11, 3, 75, 3,
      139, 3, 203, 3, 203, 7, 75, 10, 75, 30, 75, 120, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0,
      23, 0, 23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 6, 0, 6, 0,
      6, 0, 0, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 6, 0, 6, 0, 6,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0,
      6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 139, 5,
      203, 17, 23, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 139, 5, 203, 7, 75, 10, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 139, 5, 139, 6,
      203, 7, 75, 10, 75, 30, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 27, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 23, 0, 23, 0, 23, 0,
      23, 0, 23, 0, 23, 0, 23, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 0, 0, 0, 0, 139, 5, 203, 5, 11, 6, 75, 6, 203, 7, 75, 10, 75,
      30, 75, 120, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 139, 5, 203, 5, 11, 6, 75, 6, 203, 7, 75, 10, 75, 30, 75, 120, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      23, 0, 23, 0, 23, 0, 23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 139, 5, 203, 5, 11, 6, 75, 6, 203, 7, 75, 10,
      75, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 139, 5, 139, 6, 203, 7, 203,
      17, 75, 30, 75, 120, 11, 3, 75, 3, 139, 3, 203, 3, 11, 4, 75, 4, 139, 4,
      203, 4, 11, 5, 203, 7, 75, 10, 203, 12, 75, 15, 203, 17, 75, 20, 203, 22,
      75, 25, 203, 27, 75, 30, 11, 128, 11, 136, 11, 144, 11, 152, 11, 160, 11,
      168, 11, 176, 11, 184, 75, 52, 203, 52, 139, 52, 139, 56, 0, 0, 75, 20,
      203, 22, 75, 25, 203, 27, 75, 30, 75, 120, 73, 0, 137, 0, 201, 0, 9, 1,
      73, 1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 8, 0, 6,
      0, 8, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      11, 3, 75, 3, 139, 3, 203, 3, 11, 4, 75, 4, 139, 4, 203, 4, 11, 5, 203, 7,
      75, 10, 203, 12, 75, 15, 203, 17, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 8, 0, 8, 0, 8, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 8, 0, 8, 0, 6, 0, 6, 0, 23, 0, 23, 0, 16, 0, 23,
      0, 23, 0, 23, 0, 23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1,
      201, 1, 9, 2, 73, 2, 137, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 8, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9,
      1, 73, 1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 23, 0, 23, 0, 23, 0, 23, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 6, 0, 6, 0, 6, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 6, 0, 23, 0, 23, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 8, 0, 5, 0, 5, 0, 5, 0, 5, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0,
      6, 0, 6, 0, 6, 0, 23, 0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1,
      137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 5, 0, 23, 0, 5, 0, 23, 0, 23, 0, 23,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 8, 0, 8, 0, 8, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 8, 0, 0, 0, 139, 5, 203, 5, 11, 6,
      75, 6, 139, 6, 203, 6, 11, 7, 75, 7, 139, 7, 203, 7, 75, 10, 203, 12, 75,
      15, 203, 17, 75, 20, 203, 22, 75, 25, 203, 27, 75, 30, 75, 120, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 8, 0, 8, 0, 8, 0, 6,
      0, 6, 0, 6, 0, 8, 0, 8, 0, 6, 0, 8, 0, 6, 0, 6, 0, 23, 0, 23, 0, 23, 0,
      23, 0, 23, 0, 23, 0, 6, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 8, 0, 8,
      0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2, 73,
      2, 137, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 8, 0, 8, 0, 0,
      0, 0, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 6, 0, 6, 0, 8, 0, 8, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 5, 0, 5, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 8, 0, 8, 0,
      8, 0, 8, 0, 0, 0, 0, 0, 8, 0, 8, 0, 0, 0, 0, 0, 8, 0, 8, 0, 8, 0, 0, 0, 0,
      0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      8, 0, 8, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 8, 0, 8,
      0, 6, 0, 6, 0, 6, 0, 8, 0, 6, 0, 5, 0, 5, 0, 5, 0, 5, 0, 23, 0, 23, 0, 23,
      0, 23, 0, 23, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2,
      73, 2, 137, 2, 0, 0, 23, 0, 0, 0, 23, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      8, 0, 8, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 8, 0, 6, 0, 8, 0, 8,
      0, 8, 0, 8, 0, 6, 0, 6, 0, 8, 0, 6, 0, 6, 0, 5, 0, 5, 0, 23, 0, 5, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1,
      73, 1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 8, 0, 8, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 0, 0,
      8, 0, 8, 0, 8, 0, 8, 0, 6, 0, 6, 0, 8, 0, 6, 0, 6, 0, 23, 0, 23, 0, 23, 0,
      23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23,
      0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 6, 0, 6, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 8, 0, 8, 0, 8,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 8, 0, 8, 0, 6, 0, 8, 0,
      6, 0, 6, 0, 23, 0, 23, 0, 23, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1,
      201, 1, 9, 2, 73, 2, 137, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 23, 0,
      23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23,
      0, 23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0,
      9, 1, 73, 1, 137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 8, 0, 6, 0, 8, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 8, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      8, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1,
      9, 2, 73, 2, 137, 2, 203, 7, 75, 10, 23, 0, 23, 0, 23, 0, 27, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0,
      0, 0, 0, 0, 0, 6, 0, 6, 0, 6, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137,
      1, 201, 1, 9, 2, 73, 2, 137, 2, 203, 7, 75, 10, 203, 12, 75, 15, 203, 17,
      75, 20, 203, 22, 75, 25, 203, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 5, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137,
      1, 201, 1, 9, 2, 73, 2, 137, 2, 139, 5, 203, 5, 11, 6, 75, 6, 139, 6, 203,
      6, 11, 7, 75, 7, 139, 7, 203, 7, 75, 10, 203, 12, 75, 15, 203, 17, 75, 20,
      203, 22, 75, 25, 203, 27, 75, 30, 0, 0, 0, 0, 0, 0, 23, 0, 23, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 0, 0, 8, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 8, 0, 6,
      0, 6, 0, 8, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 202, 52, 74, 53, 202, 52,
      202, 52, 74, 52, 138, 52, 138, 56, 74, 15, 202, 17, 74, 6, 138, 6, 202, 6,
      10, 7, 74, 7, 138, 7, 0, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 202, 5, 10, 6, 74,
      6, 138, 6, 202, 6, 10, 7, 74, 7, 138, 7, 10, 6, 74, 6, 138, 6, 202, 6, 10,
      7, 74, 7, 138, 7, 74, 6, 138, 6, 202, 6, 10, 7, 74, 7, 138, 7, 138, 5,
      202, 5, 10, 6, 74, 6, 138, 6, 202, 6, 10, 7, 74, 7, 138, 7, 138, 5, 202,
      5, 10, 6, 74, 6, 138, 6, 202, 5, 10, 6, 10, 6, 74, 6, 138, 6, 202, 6, 10,
      7, 74, 7, 138, 7, 138, 5, 202, 5, 10, 6, 10, 6, 74, 6, 138, 6, 138, 192,
      138, 193, 138, 5, 202, 5, 10, 6, 10, 6, 74, 6, 138, 6, 10, 6, 10, 6, 74,
      6, 74, 6, 74, 6, 74, 6, 202, 6, 10, 7, 10, 7, 10, 7, 74, 7, 74, 7, 138, 7,
      138, 7, 138, 7, 138, 7, 202, 5, 10, 6, 74, 6, 138, 6, 202, 6, 138, 5, 202,
      5, 10, 6, 74, 6, 74, 6, 138, 6, 138, 6, 202, 5, 10, 6, 138, 5, 202, 5,
      138, 52, 138, 56, 74, 69, 138, 52, 138, 56, 202, 53, 5, 0, 5, 0, 5, 0, 5,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1,
      137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 0, 0, 0, 0, 0, 0, 0, 0, 23, 0, 23, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 23, 0, 23, 0, 23, 0, 23, 0, 23, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 4, 0, 4, 0, 4, 0, 4, 0, 23, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1,
      137, 1, 201, 1, 9, 2, 73, 2, 137, 2, 0, 0, 203, 7, 75, 30, 139, 120, 11,
      121, 139, 121, 11, 122, 139, 122, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 5, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8,
      0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0,
      8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 6, 0, 6, 0, 6, 0, 6, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4,
      0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 27, 0, 6, 0, 6, 0, 23,
      0, 16, 0, 16, 0, 16, 0, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 0, 0, 0, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 8, 0, 8, 0, 6,
      0, 6, 0, 6, 0, 27, 0, 27, 0, 27, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0,
      16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 27, 0, 27, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 6, 0, 6, 0, 6, 0, 6, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 27, 0, 27, 0, 6, 0, 6, 0, 6, 0, 27, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 139, 5,
      203, 5, 11, 6, 75, 6, 139, 6, 203, 6, 11, 7, 75, 7, 139, 7, 203, 7, 75,
      10, 203, 12, 75, 15, 203, 17, 75, 20, 203, 22, 75, 25, 203, 27, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      73, 2, 137, 2, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2,
      73, 2, 137, 2, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2,
      73, 2, 137, 2, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2,
      73, 2, 137, 2, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 0, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 1, 0, 0, 0, 1, 0,
      1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 0,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 2, 0, 2, 0, 2, 0, 2, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 1, 0, 1, 0, 0, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0,
      0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 24, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 24, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 24, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 24, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 2, 0, 2, 0, 2, 0, 24, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 1, 0, 2,
      0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2,
      73, 2, 137, 2, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1, 9, 2,
      0, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 27, 0, 27, 0, 27, 0, 27, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 6, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 6, 0, 27, 0, 27,
      0, 23, 0, 23, 0, 23, 0, 23, 0, 23,
    ],
    'i8',
    ALLOC_NONE,
    Runtime.GLOBAL_BASE + 30720,
  );
  allocate(
    [
      6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 6, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0,
      6, 0, 0, 0, 0, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 6, 0, 6,
      0, 0, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 139, 5, 203, 5,
      11, 6, 75, 6, 139, 6, 203, 6, 11, 7, 75, 7, 139, 7, 6, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 73, 0, 137, 0, 201, 0, 9, 1, 73, 1, 137, 1, 201, 1,
      9, 2, 73, 2, 137, 2, 0, 0, 0, 0, 0, 0, 0, 0, 23, 0, 23, 0, 1, 0, 1, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 24, 0, 24, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 0, 0, 5, 0, 0, 0,
      0, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 5, 0, 0, 0, 5,
      0, 0, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 0, 0, 5, 0, 0, 0, 0, 0, 5, 0,
      0, 0, 5, 0, 0, 0, 5, 0, 0, 0, 5, 0, 0, 0, 5, 0, 0, 0, 5, 0, 5, 0, 0, 0, 5,
      0, 0, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0,
      0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 5, 0,
      5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 0, 0, 0, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 0, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 203, 2, 203, 2, 11, 3,
      75, 3, 139, 3, 203, 3, 11, 4, 75, 4, 139, 4, 203, 4, 11, 5, 75, 5, 75, 5,
      0, 0, 0, 0, 0, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 0, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 26, 0, 26, 0, 26, 0, 26, 0, 26, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      0, 0, 0, 0, 0, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 27, 0, 27, 0,
      27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 0, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 0, 0, 0, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      0, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27,
      0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0, 27, 0,
      0, 0, 5, 0, 5, 7, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 69, 6, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 69, 6, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 133, 6, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 197, 12, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 69, 15, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 69, 15, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 197, 6, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 6, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 6, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 6, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 6, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 69, 6, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 133, 7, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 16, 0, 16, 0, 16, 0, 16, 0,
      16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16,
      0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0,
      16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 16, 0, 0, 0, 16, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6,
      0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 17, 0, 17, 0,
      17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17,
      0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0,
      17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 17, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 106, 3, 114, 3, 122, 3, 130, 3, 154, 3, 162, 3, 170, 3, 178,
      3, 138, 3, 146, 3, 138, 3, 146, 3, 138, 3, 146, 3, 138, 3, 146, 3, 138, 3,
      146, 3, 138, 3, 146, 3, 184, 3, 192, 3, 200, 3, 208, 3, 216, 3, 224, 3,
      220, 3, 228, 3, 236, 3, 244, 3, 239, 3, 247, 3, 138, 3, 146, 3, 138, 3,
      146, 3, 255, 3, 7, 4, 138, 3, 146, 3, 138, 3, 146, 3, 138, 3, 146, 3, 13,
      4, 21, 4, 29, 4, 37, 4, 45, 4, 53, 4, 61, 4, 69, 4, 75, 4, 83, 4, 91, 4,
      99, 4, 107, 4, 115, 4, 121, 4, 129, 4, 137, 4, 145, 4, 153, 4, 161, 4,
      173, 4, 169, 4, 181, 4, 31, 4, 31, 4, 197, 4, 205, 4, 189, 4, 213, 4, 215,
      4, 223, 4, 231, 4, 239, 4, 240, 4, 248, 4, 0, 5, 8, 5, 240, 4, 16, 5, 21,
      5, 8, 5, 240, 4, 29, 5, 37, 5, 239, 4, 42, 5, 50, 5, 231, 4, 55, 5, 138,
      3, 63, 5, 67, 5, 75, 5, 76, 5, 84, 5, 92, 5, 239, 4, 100, 5, 108, 5, 231,
      4, 239, 4, 138, 3, 248, 4, 231, 4, 138, 3, 138, 3, 114, 5, 138, 3, 138, 3,
      120, 5, 128, 5, 138, 3, 138, 3, 132, 5, 140, 5, 138, 3, 144, 5, 151, 5,
      138, 3, 159, 5, 167, 5, 174, 5, 54, 5, 138, 3, 138, 3, 182, 5, 190, 5,
      198, 5, 206, 5, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 214, 5, 138, 3, 222, 5, 138, 3,
      138, 3, 138, 3, 230, 5, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 238, 5, 138, 3, 138, 3, 138, 3, 246, 5,
      246, 5, 252, 4, 252, 4, 138, 3, 252, 5, 4, 6, 222, 5, 26, 6, 12, 6, 12, 6,
      34, 6, 41, 6, 18, 6, 138, 3, 138, 3, 138, 3, 49, 6, 57, 6, 138, 3, 138, 3,
      138, 3, 59, 6, 67, 6, 75, 6, 138, 3, 82, 6, 90, 6, 138, 3, 98, 6, 138, 3,
      138, 3, 106, 6, 109, 6, 55, 5, 117, 6, 1, 4, 125, 6, 138, 3, 132, 6, 138,
      3, 137, 6, 138, 3, 138, 3, 138, 3, 138, 3, 143, 6, 151, 6, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 216, 3, 159, 6, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 167, 6, 175, 6, 179, 6, 203, 6, 209, 6, 187, 6, 195, 6, 217, 6,
      225, 6, 229, 6, 177, 5, 237, 6, 245, 6, 253, 6, 138, 3, 5, 7, 67, 6, 67,
      6, 67, 6, 21, 7, 29, 7, 37, 7, 45, 7, 50, 7, 58, 7, 66, 7, 13, 7, 74, 7,
      82, 7, 138, 3, 88, 7, 95, 7, 67, 6, 67, 6, 101, 7, 67, 6, 98, 5, 106, 7,
      67, 6, 114, 7, 138, 3, 138, 3, 64, 6, 67, 6, 67, 6, 67, 6, 67, 6, 67, 6,
      67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 122, 7, 67, 6, 67,
      6, 67, 6, 67, 6, 67, 6, 128, 7, 67, 6, 67, 6, 136, 7, 144, 7, 138, 3, 138,
      3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 67, 6, 67, 6, 67, 6,
      67, 6, 160, 7, 167, 7, 175, 7, 152, 7, 191, 7, 199, 7, 207, 7, 214, 7,
      222, 7, 230, 7, 237, 7, 183, 7, 67, 6, 67, 6, 67, 6, 245, 7, 251, 7, 1, 8,
      9, 8, 14, 8, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 21,
      8, 138, 3, 138, 3, 138, 3, 29, 8, 138, 3, 138, 3, 138, 3, 216, 3, 37, 8,
      45, 8, 52, 8, 138, 3, 60, 8, 67, 6, 67, 6, 70, 6, 67, 6, 67, 6, 67, 6, 67,
      6, 67, 6, 67, 6, 67, 8, 73, 8, 89, 8, 81, 8, 138, 3, 138, 3, 97, 8, 230,
      5, 138, 3, 177, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 67, 6,
      28, 8, 191, 3, 138, 3, 56, 8, 105, 8, 138, 3, 113, 8, 14, 8, 138, 3, 138,
      3, 138, 3, 138, 3, 121, 8, 138, 3, 138, 3, 59, 6, 176, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 67, 6, 67, 6, 138, 3, 138,
      3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 56, 8, 67, 6, 98, 5, 138,
      3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 128, 8,
      138, 3, 138, 3, 133, 8, 76, 5, 138, 3, 138, 3, 146, 5, 67, 6, 58, 6, 138,
      3, 138, 3, 141, 8, 138, 3, 138, 3, 138, 3, 149, 8, 156, 8, 12, 6, 164, 8,
      138, 3, 138, 3, 171, 8, 179, 8, 138, 3, 186, 8, 193, 8, 138, 3, 213, 4,
      198, 8, 138, 3, 238, 4, 138, 3, 206, 8, 214, 8, 240, 4, 138, 3, 218, 8,
      239, 4, 226, 8, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      233, 8, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 253, 8, 241, 8, 245, 8, 137, 4, 137, 4, 137, 4,
      137, 4, 137, 4, 137, 4, 137, 4, 137, 4, 137, 4, 137, 4, 137, 4, 137, 4,
      137, 4, 137, 4, 5, 9, 137, 4, 137, 4, 137, 4, 137, 4, 13, 9, 17, 9, 25, 9,
      33, 9, 37, 9, 45, 9, 137, 4, 137, 4, 137, 4, 49, 9, 57, 9, 122, 3, 65, 9,
      73, 9, 138, 3, 138, 3, 138, 3, 81, 9, 138, 3, 138, 3, 138, 3, 138, 3, 138,
      3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      40, 14, 40, 14, 104, 14, 168, 14, 40, 14, 40, 14, 40, 14, 40, 14, 40, 14,
      40, 14, 224, 14, 32, 15, 96, 15, 112, 15, 176, 15, 188, 15, 40, 14, 40,
      14, 252, 15, 40, 14, 40, 14, 40, 14, 52, 16, 116, 16, 180, 16, 244, 16,
      44, 17, 108, 17, 172, 17, 228, 17, 36, 18, 100, 18, 64, 10, 128, 10, 192,
      10, 250, 10, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160,
      1, 160, 1, 35, 11, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 96, 11, 160, 1, 160, 1, 149, 11, 213, 11, 21, 12, 85, 12,
      149, 12, 213, 12, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 21, 13, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 21, 13, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 21, 13, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 21, 13, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 21, 13,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 21, 13, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      21, 13, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 21, 13, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 21, 13, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 21, 13, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 21, 13, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 21, 13, 85, 13,
      101, 13, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 21, 13, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 21, 13,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1, 160, 1,
      160, 1, 160, 1, 160, 1, 160, 1, 21, 13, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 89, 9, 138, 3, 67, 6, 67, 6, 97, 9, 230,
      5, 138, 3, 232, 4, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      105, 9, 138, 3, 138, 3, 138, 3, 112, 9, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4,
      31, 4, 31, 4, 31, 4, 120, 9, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31,
      4, 128, 9, 132, 9, 31, 4, 31, 4, 31, 4, 31, 4, 148, 9, 140, 9, 31, 4, 156,
      9, 31, 4, 31, 4, 164, 9, 170, 9, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4,
      31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31,
      4, 31, 4, 31, 4, 31, 4, 31, 4, 178, 9, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4,
      31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 239, 4, 173, 8, 186, 9,
      193, 9, 1, 4, 196, 9, 138, 3, 138, 3, 213, 4, 204, 9, 138, 3, 210, 9, 1,
      4, 215, 9, 248, 5, 138, 3, 138, 3, 223, 9, 138, 3, 138, 3, 138, 3, 138, 3,
      29, 8, 231, 9, 1, 4, 240, 4, 75, 5, 238, 9, 138, 3, 138, 3, 138, 3, 138,
      3, 138, 3, 173, 8, 246, 9, 138, 3, 138, 3, 250, 9, 2, 10, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 6, 10, 14, 10, 138, 3, 138, 3, 22, 10, 75,
      5, 50, 8, 138, 3, 30, 10, 138, 3, 138, 3, 214, 5, 38, 10, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 42, 10, 138, 3, 138, 3, 50, 10, 56, 10,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 62, 10,
      138, 3, 68, 10, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      74, 10, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 9, 5, 82, 10, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138,
      3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 89, 10, 97, 10, 103, 10, 138, 3, 138, 3, 67, 6, 67, 6, 111, 10,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 67, 6, 67, 6, 103, 7, 138, 3, 138,
      3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 113, 10, 138, 3,
      120, 10, 138, 3, 116, 10, 138, 3, 123, 10, 138, 3, 131, 10, 135, 10, 138,
      3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 216, 3, 143, 10, 216, 3,
      150, 10, 157, 10, 165, 10, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      173, 10, 181, 10, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 189, 10, 31, 4, 197, 10,
      197, 10, 204, 10, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4,
      31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31,
      4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4,
      31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 31, 4, 137, 4, 137, 4,
      137, 4, 137, 4, 137, 4, 137, 4, 137, 4, 212, 10, 31, 4, 31, 4, 31, 4, 31,
      4, 31, 4, 31, 4, 31, 4, 31, 4, 67, 6, 220, 10, 67, 6, 67, 6, 70, 6, 225,
      10, 229, 10, 67, 8, 237, 10, 138, 3, 138, 3, 243, 10, 138, 3, 138, 3, 138,
      3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 67,
      6, 67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 67, 6,
      67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 67, 6, 104, 7,
      251, 10, 67, 6, 67, 6, 67, 6, 70, 6, 67, 6, 67, 6, 48, 8, 138, 3, 220, 10,
      67, 6, 3, 11, 67, 6, 11, 11, 69, 8, 138, 3, 138, 3, 27, 11, 35, 11, 43,
      11, 138, 3, 68, 8, 138, 3, 230, 5, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 19, 11, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3,
      138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 138, 3, 19, 11,
      59, 11, 51, 11, 51, 11, 51, 11, 60, 11, 60, 11, 60, 11, 60, 11, 216, 3,
      216, 3, 216, 3, 216, 3, 216, 3, 216, 3, 216, 3, 68, 11, 60, 11, 60, 11,
      60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11,
      60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11,
      60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11,
      60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11,
      60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11,
      60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11,
      60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 60, 11, 105, 3,
      105, 3, 105, 3, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0,
      18, 0, 8, 0, 7, 0, 8, 0, 9, 0, 7, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0,
      18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 7, 0, 7, 0,
      7, 0, 8, 0, 9, 0, 10, 0, 10, 0, 4, 0, 4, 0, 4, 0, 10, 0, 10, 0, 10, 49,
      10, 242, 10, 0, 3, 0, 6, 0, 3, 0, 6, 0, 6, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 6, 0, 10, 0, 10, 80, 10, 0, 10, 208, 10,
      0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 10, 81, 10, 0, 10, 210, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10,
      81, 10, 0, 10, 210, 10, 0, 18, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 18, 0, 18, 0, 18, 0, 18, 0,
      18, 0, 7, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18,
      0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0,
      18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 6, 0, 10, 0, 4, 0, 4, 0,
      4, 0, 4, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 10, 144, 10, 0, 178, 0, 10,
      0, 10, 0, 4, 0, 4, 0, 2, 0, 2, 0, 10, 0, 0, 0, 10, 0, 10, 0, 10, 0, 2, 0,
      0, 0, 10, 144, 10, 0, 10, 0, 10, 0, 10,
    ],
    'i8',
    ALLOC_NONE,
    Runtime.GLOBAL_BASE + 40980,
  );

  allocate(
    [
      10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 0, 0, 10, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10,
      0, 0, 0, 0, 0, 10, 0, 10, 0, 4, 0, 1, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 1, 0, 177, 0, 1, 0, 177, 0, 177,
      0, 1, 0, 177, 0, 177, 0, 1, 0, 177, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 10, 0, 10, 0, 13, 0, 4, 0, 4, 0, 13,
      0, 6, 0, 13, 0, 10, 0, 10, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 13, 0, 173, 8, 13, 0, 13, 0,
      13, 0, 77, 0, 13, 0, 141, 0, 141, 0, 141, 0, 141, 0, 77, 0, 141, 0, 77, 0,
      141, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 141, 0, 141, 0, 141, 0, 141, 0,
      77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77,
      0, 77, 0, 77, 0, 45, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0,
      141, 0, 77, 0, 77, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 4, 0, 5, 0, 5, 0, 13, 0, 77, 0, 77, 0, 177, 0,
      141, 0, 141, 0, 141, 0, 13, 0, 141, 0, 141, 0, 141, 0, 77, 0, 77, 0, 77,
      0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 141, 0, 141, 0, 141, 0, 141, 0, 141,
      0, 141, 0, 141, 0, 141, 0, 141, 0, 141, 0, 141, 0, 141, 0, 141, 0, 141, 0,
      141, 0, 141, 0, 141, 0, 141, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0,
      77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77,
      0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0,
      77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77,
      0, 141, 0, 77, 0, 77, 0, 141, 0, 141, 0, 141, 0, 141, 0, 141, 0, 141, 0,
      141, 0, 141, 0, 141, 0, 77, 0, 141, 0, 77, 0, 141, 0, 77, 0, 77, 0, 141,
      0, 141, 0, 13, 0, 141, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 5, 0, 10, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 13,
      0, 13, 0, 177, 0, 177, 0, 10, 0, 177, 0, 177, 0, 177, 0, 177, 0, 141, 0,
      141, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 77, 0,
      77, 0, 77, 0, 13, 0, 13, 0, 77, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13,
      0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 173, 0,
      141, 0, 177, 0, 77, 0, 77, 0, 77, 0, 141, 0, 141, 0, 141, 0, 141, 0, 141,
      0, 77, 0, 77, 0, 77, 0, 77, 0, 141, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0,
      77, 0, 77, 0, 77, 0, 77, 0, 141, 0, 77, 0, 141, 0, 77, 0, 141, 0, 77, 0,
      77, 0, 141, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 13, 0, 13, 0, 141, 0, 77, 0, 77, 0, 77, 0, 77, 0,
      77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 141, 0, 141, 0, 141, 0,
      77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77,
      0, 77, 0, 77, 0, 77, 0, 77, 0, 141, 0, 141, 0, 77, 0, 77, 0, 77, 0, 77, 0,
      141, 0, 77, 0, 141, 0, 141, 0, 77, 0, 77, 0, 77, 0, 141, 0, 141, 0, 77, 0,
      77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13,
      0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0,
      13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13,
      0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0,
      13, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0,
      13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65,
      0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0,
      65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65,
      0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 177, 0, 177, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 1, 0, 1, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 33, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 177, 0, 177, 0, 177,
      0, 177, 0, 1, 0, 177, 0, 177, 0, 177, 0, 1, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 177, 0, 177, 0, 177, 0, 177, 0, 1, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 129, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 129, 0, 129, 0,
      65, 0, 129, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65,
      0, 65, 0, 129, 0, 65, 0, 1, 0, 1, 0, 1, 0, 177, 0, 177, 0, 177, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 177, 0, 177, 0, 5, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 77, 0, 77, 0, 77,
      0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 77, 0, 141, 0, 141, 0, 141,
      0, 13, 0, 141, 0, 77, 0, 77, 0, 141, 0, 141, 0, 77, 0, 77, 0, 13, 0, 77,
      0, 77, 0, 77, 0, 141, 0, 77, 0, 77, 0, 77, 0, 77, 0, 13, 0, 13, 0, 13, 0,
      13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13,
      0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177,
      0, 0, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0,
      0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 0,
      0, 0, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0, 177, 0, 0, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 4, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0,
      177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 0,
      0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      177, 0, 0, 0, 0, 0, 160, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 160, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0,
      177, 0, 177, 0, 0, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0,
      0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 177, 0, 0, 0, 177, 0, 0, 0, 177, 0, 10, 49, 10, 242, 10, 49, 10,
      242, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 177, 0, 177,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 177, 0, 177, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0,
      0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 177, 0, 177, 0,
      0, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177,
      0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 177, 0, 0, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177,
      0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 49, 10, 242,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0,
      177, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 177, 0, 0,
      0, 0, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0,
      64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64,
      0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0,
      64, 0, 64, 0, 64, 0, 177, 0, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 74, 0, 10, 0,
      10, 0, 42, 0, 177, 0, 177, 0, 177, 0, 18, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64,
      0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0,
      64, 0, 64, 0, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      177, 0, 177, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0,
      64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64,
      0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 177, 0, 177, 0, 177, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0,
      177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0,
      177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0,
      0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 177,
      0, 0, 0, 177, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177,
      0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0,
      0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0,
      0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 177, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 177, 0, 177, 0, 0, 0, 177,
      0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0,
      0, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 177, 0, 177, 0, 177,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177,
      0, 0, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177,
      0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 10, 0, 0, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 10, 0, 10, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 6, 0, 10, 49, 10, 242,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 9, 0, 178, 0, 178, 0, 178, 0, 178, 0, 178, 0, 18, 0,
      20, 8, 21, 8, 19, 8, 22, 8, 178, 0, 178, 0, 178, 0, 178, 0, 178, 0, 178,
      0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 3, 0, 3, 0,
      10, 0, 10, 49, 10, 242, 0, 0, 9, 0, 9, 0, 9, 0, 9, 0, 9, 0, 9, 0, 9, 0, 9,
      0, 9, 0, 9, 0, 9, 0, 178, 0, 18, 4, 50, 4, 160, 8, 161, 8, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 9, 0, 7, 0, 171, 8, 174, 8, 176, 8, 172, 8, 175,
      8, 6, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 48,
      10, 240, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 3, 0, 3, 0, 10, 0, 10, 49, 10, 242, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4,
      0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0,
      4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 177, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 10, 0, 10, 0, 0, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 0, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 10, 0, 0, 0,
      10, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 10, 16, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 48,
      10, 240, 10, 48, 10, 240, 10, 48, 10, 240, 10, 48, 10, 240, 10, 48, 10,
      240, 10, 48, 10, 240, 10, 48, 10, 240, 10, 0, 10, 0, 10, 48, 10, 240, 10,
      144, 10, 144, 10, 144, 10, 16, 10, 144, 10, 144, 10, 16, 10, 16, 10, 144,
      10, 144, 10, 144, 10, 144, 10, 144, 10, 16, 10, 0, 10, 16, 10, 16, 10, 16,
      10, 16, 10, 0, 10, 0, 10, 0, 10, 112, 10, 112, 10, 112, 10, 176, 10, 176,
      10, 176, 10, 0, 10, 0, 10, 0, 10, 16, 3, 0, 4, 0, 10, 0, 10, 144, 10, 16,
      10, 0, 10, 0, 10, 0, 10, 16, 10, 16, 10, 16, 10, 16, 10, 0, 10, 16, 10,
      16, 10, 16, 10, 16, 10, 0, 10, 16, 10, 0, 10, 16, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 16, 10, 0, 10, 16, 10, 48, 10, 240,
      10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 144, 10, 16, 10, 16, 10, 16,
      10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 48, 10, 240, 10, 48, 10, 240, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 16, 10, 16, 10, 0, 10, 16, 10, 0,
      10, 48, 10, 240, 10, 48, 10, 240, 10, 48, 10, 240, 10, 48, 10, 240, 10, 0,
      10, 0, 10, 48, 10, 240, 10, 48, 10, 240, 10, 48, 10, 240, 10, 48, 10, 240,
      10, 48, 10, 240, 10, 48, 10, 240, 10, 48, 10, 240, 10, 48, 10, 240, 10,
      48, 10, 240, 10, 16, 10, 0, 10, 0, 10, 48, 10, 240, 10, 48, 10, 240, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 144, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 48, 10, 240, 10, 0, 10, 0, 10, 144, 10,
      16, 10, 144, 10, 144, 10, 16, 10, 144, 10, 16, 10, 16, 10, 16, 10, 16, 10,
      48, 10, 240, 10, 48, 10, 240, 10, 48, 10, 240, 10, 48, 10, 240, 10, 16,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 16, 10, 16, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 48, 10, 240, 10, 48, 10,
      240, 10, 144, 10, 0, 10, 0, 10, 48, 10, 240, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 48, 10, 240, 10, 48, 10, 240, 10, 48, 10, 240, 10, 48, 10, 240, 10,
      48, 10, 240, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      49, 10, 242, 10, 49, 10, 242, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 16, 10, 16, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 49, 10, 242, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 49, 10, 242, 10, 49, 10,
      242, 10, 49, 10, 242, 10, 49, 10, 242, 10, 49, 10, 242, 10, 49, 10, 242,
      10, 49, 10, 242, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 16, 10, 0, 10, 0, 10, 48, 10, 240, 10, 49, 10, 242, 10,
      0, 10, 48, 10, 240, 10, 0, 10, 80, 10, 16, 10, 208, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 16, 10, 16, 10, 48, 10, 240, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 16, 10, 48, 10, 240, 10, 0, 10, 0, 10, 0, 10, 48, 10, 240, 10,
      48, 10, 240, 10, 49, 10, 242, 10, 49, 10, 242, 10, 49, 10, 242, 10, 49,
      10, 242, 10, 49, 10, 242, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      16, 10, 0, 10, 16, 10, 16, 10, 16, 10, 0, 10, 0, 10, 16, 10, 16, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 16, 10,
      144, 10, 16, 10, 16, 10, 48, 10, 240, 10, 0, 10, 0, 10, 49, 10, 242, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 49, 10, 242, 10, 49, 10, 242, 10, 49,
      10, 242, 10, 49, 10, 242, 10, 49, 10, 242, 10, 113, 10, 50, 10, 241, 10,
      178, 10, 49, 10, 242, 10, 49, 10, 242, 10, 49, 10, 242, 10, 49, 10, 242,
      10, 0, 10, 0, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10,
      16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10,
      16, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 144, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 48, 10, 240, 10, 16, 10,
      16, 10, 48, 10, 240, 10, 0, 10, 0, 10, 0, 10, 16, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 16, 10, 48, 10, 240, 10, 48, 10, 240, 10, 0, 10, 48, 10, 240, 10,
      0, 10, 0, 10, 49, 10, 242, 10, 49, 10, 242, 10, 16, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 16, 10, 144, 10, 144, 10, 144, 10, 16, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 48, 10, 240, 10, 16, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      16, 10, 0, 10, 0, 10, 0, 10, 48, 10, 240, 10, 48, 10, 240, 10, 16, 10, 0,
      10, 16, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16,
      10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16,
      10, 16, 10, 16, 10, 16, 10, 0, 10, 16, 10, 16, 10, 16, 10, 16, 10, 0, 10,
      0, 10, 16, 10, 0, 10, 16, 10, 0, 10, 0, 10, 16, 10, 0, 10, 48, 10, 240,
      10, 48, 10, 240, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 48, 10, 240, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 48, 10, 240, 10, 16, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 16, 10, 16, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 48, 10, 240, 10, 0, 10, 0, 10, 0, 10, 0, 10, 16, 10, 16, 10, 16, 10,
      16, 10, 0, 10, 16, 10, 16, 10, 0, 10, 0, 10, 16, 10, 16, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 48, 10, 240, 10, 16, 10, 16, 10, 48, 10, 240, 10, 48, 10,
      240, 10, 48, 10, 240, 10, 48, 10, 240, 10, 16, 10, 16, 10, 16, 10, 16, 10,
      16, 10, 16, 10, 48, 10, 240, 10, 16, 10, 16, 10, 16, 10, 16, 10, 48, 10,
      240, 10, 48, 10, 240, 10, 48, 10, 240, 10, 48, 10, 240, 10, 48, 10, 240,
      10, 48, 10, 240, 10, 16, 10, 16, 10, 16, 10, 16, 10, 48, 10, 240, 10, 16,
      10, 0, 10, 0, 10, 48, 10, 240, 10, 48, 10, 240, 10, 48, 10, 240, 10, 48,
      10, 240, 10, 0, 10, 48, 10, 240, 10, 16, 10, 16, 10, 48, 10, 240, 10, 16,
      10, 16, 10, 16, 10, 16, 10, 16, 10, 16, 10, 48, 10, 240, 10, 48, 10, 240,
      10, 48, 10, 240, 10, 48, 10, 240, 10, 16, 10, 16, 10, 16, 10, 16, 10, 16,
      10, 16, 10, 48, 10, 240, 10, 48, 10, 240, 10, 48, 10, 240, 10, 48, 10,
      240, 10, 48, 10, 240, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 16, 10, 0,
      10, 144, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 177, 0, 10, 0, 10, 0, 10, 48, 10, 240, 10, 48, 10, 240,
      10, 0, 10, 0, 10, 0, 10, 48, 10, 240, 10, 0, 10, 48, 10, 240, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 48, 10, 240, 10, 0, 10, 0, 10, 48, 10, 240, 10, 49, 10,
      242, 10, 49, 10, 242, 10, 49, 10, 242, 10, 49, 10, 242, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177,
      0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 9, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 0, 0, 0, 0, 0, 0, 10, 49, 10, 242, 10, 49, 10, 242, 10, 49, 10, 242,
      10, 49, 10, 242, 10, 49, 10, 242, 10, 0, 10, 0, 10, 49, 10, 242, 10, 49,
      10, 242, 10, 49, 10, 242, 10, 49, 10, 242, 10, 0, 10, 0, 10, 0, 10, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      177, 0, 177, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0,
      10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 10, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177,
      0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 0, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 4, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64, 0, 64, 0,
      64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 64,
      0, 64, 0, 64, 0, 64, 0, 64, 0, 64, 0, 96, 0, 0, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177,
    ],
    'i8',
    ALLOC_NONE,
    Runtime.GLOBAL_BASE + 51244,
  );
  allocate(
    [
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0, 177, 0,
      177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 177, 0, 177, 0, 177, 0,
      0, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0,
      0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 3, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 13, 0, 13, 0, 13, 0, 13, 0,
      13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13,
      0, 13, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 177, 0, 1, 0, 13, 0, 13, 0, 13,
      0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0,
      13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13,
      0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 10, 0, 10, 0, 13, 0, 13, 0,
      13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13,
      0, 13, 0, 13, 0, 13, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0,
      18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 13, 0, 13,
      0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0,
      13, 0, 10, 0, 13, 0, 13, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 6, 0, 10,
      0, 6, 0, 0, 0, 10, 0, 6, 0, 10, 0, 10, 0, 10, 0, 10, 49, 10, 242, 10, 49,
      10, 242, 10, 49, 10, 242, 4, 0, 10, 0, 10, 0, 3, 0, 3, 0, 10, 48, 10, 240,
      10, 0, 0, 0, 10, 0, 4, 0, 4, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 13, 0, 13,
      0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0,
      13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13,
      0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 178, 0, 0, 0,
      10, 0, 10, 0, 4, 0, 4, 0, 4, 0, 10, 0, 10, 0, 10, 49, 10, 242, 10, 0, 3,
      0, 6, 0, 3, 0, 6, 0, 6, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 6, 0, 10, 0, 10, 80, 10, 0, 10, 208, 10, 0, 10, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10,
      81, 10, 0, 10, 210, 10, 0, 10, 49, 10, 242, 10, 0, 10, 49, 10, 242, 10, 0,
      10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 4, 0, 4, 0, 10, 0, 10, 0, 10, 0, 4, 0, 4, 0, 0, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 18, 0, 18, 0, 18, 0, 18,
      0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 170, 0, 170, 0, 170, 0, 10, 0, 10,
      0, 18, 0, 18, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 10, 0, 1, 0, 177, 0, 177, 0, 177, 0, 1, 0, 177, 0, 177, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 177, 0, 177, 0, 177, 0, 177, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 177, 0, 177, 0,
      177, 0, 1, 0, 1, 0, 1, 0, 1, 0, 177, 0, 65, 0, 129, 0, 1, 0, 1, 0, 129, 0,
      177, 0, 177, 0, 1, 0, 1, 0, 1, 0, 1, 0, 65, 0, 65, 0, 65, 0, 65, 0, 129,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 129, 0, 1, 0,
      129, 0, 1, 0, 129, 0, 129, 0, 1, 0, 1, 0, 97, 0, 129, 0, 129, 0, 129, 0,
      129, 0, 129, 0, 65, 0, 65, 0, 65, 0, 65, 0, 97, 0, 65, 0, 65, 0, 65, 0,
      65, 0, 65, 0, 129, 0, 65, 0, 65, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 65, 0, 129, 0, 65, 0, 129, 0, 129, 0, 129, 0, 65, 0, 65, 0, 65,
      0, 129, 0, 65, 0, 65, 0, 129, 0, 65, 0, 129, 0, 129, 0, 65, 0, 129, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 129, 0, 129, 0, 129, 0, 129, 0, 65, 0, 65, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5,
      0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0,
      5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 1, 0, 177, 0, 177, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0, 160, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177,
      0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 177, 0, 0, 0, 177, 0, 177, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177,
      0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 0, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 177, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 177, 0, 177, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      177, 0, 177, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 177, 0, 0, 0, 177, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0,
      177, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0,
      177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 0, 0, 160, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177,
      0, 177, 0, 177, 0, 0, 0, 177, 0, 177, 0, 0, 0, 177, 0, 177, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 178, 0, 178,
      0, 178, 0, 178, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0,
      177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 178, 0, 178,
      0, 178, 0, 178, 0, 178, 0, 178, 0, 178, 0, 178, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 10, 0, 10, 0, 177, 0, 177, 0, 177, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 10, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 16, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      10, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2,
      0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 177, 0, 177, 0,
      0, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 177, 0, 177, 0, 177, 0, 177,
      0, 177, 0, 177, 0, 177, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65,
      0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0,
      65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65, 0, 65,
      0, 65, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 1, 0, 1,
      0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13,
      0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0,
      13, 0, 10, 0, 10, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13,
      0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 13, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 10, 0,
      10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0,
      0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 18, 0, 18, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 10, 0, 0, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
      10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0, 0, 178, 0, 178, 0, 178, 0, 178, 0,
      178, 0, 178, 0, 178, 0, 178, 0, 178, 0, 178, 0, 178, 0, 178, 0, 178, 0,
      178, 0, 178, 0, 178, 0, 178, 0, 178, 0, 178, 0, 178, 0, 178, 0, 178, 0,
      178, 0, 178, 0, 178, 0, 178, 0, 178, 0, 178, 0, 178, 0, 178, 0, 178, 0,
      178, 0, 18, 0, 178, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0,
      18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18,
      0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0,
      18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0, 177, 0,
      177, 0, 177, 0, 177, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0,
      18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 18, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 1, 2, 7, 8, 3, 9, 6, 5, 4, 4, 10, 10, 12, 10, 10, 10, 11,
      10, 4, 4, 4, 4, 13, 14, 1, 2, 4, 5, 7, 15, 17, 7, 9, 7, 0, 7, 3, 18, 21,
      4, 1, 34, 36, 37, 39, 47, 49, 39, 41, 39, 1, 1, 35, 50, 53, 0, 33, 2, 36,
      37, 39, 47, 49, 39, 41, 39, 2, 2, 35, 50, 53, 1, 33, 34, 38, 38, 40, 48,
      49, 40, 40, 40, 3, 3, 3, 50, 53, 1, 33, 34, 4, 37, 39, 47, 49, 74, 11, 74,
      4, 4, 35, 18, 21, 2, 33, 34, 36, 5, 39, 47, 49, 39, 41, 76, 5, 5, 35, 50,
      53, 3, 33, 34, 6, 6, 40, 48, 49, 40, 40, 77, 6, 6, 35, 18, 21, 3, 33, 34,
      36, 37, 7, 47, 49, 7, 78, 7, 7, 7, 35, 50, 53, 4, 33, 34, 38, 38, 8, 48,
      49, 8, 8, 8, 8, 8, 35, 50, 53, 4, 33, 34, 4, 37, 7, 47, 49, 7, 9, 7, 9, 9,
      35, 18, 21, 4, 97, 98, 4, 101, 135, 111, 113, 135, 142, 135, 10, 135, 99,
      18, 21, 2, 33, 34, 4, 37, 39, 47, 49, 39, 11, 39, 11, 11, 35, 18, 21, 2,
      97, 98, 100, 5, 135, 111, 113, 135, 142, 135, 12, 135, 99, 114, 117, 3,
      97, 98, 6, 6, 136, 112, 113, 136, 136, 136, 13, 136, 99, 18, 21, 3, 33,
      34, 132, 37, 7, 47, 49, 7, 14, 7, 14, 14, 35, 146, 149, 4, 33, 34, 36, 37,
      39, 15, 49, 39, 41, 39, 15, 39, 35, 50, 53, 5, 33, 34, 38, 38, 40, 16, 49,
      40, 40, 40, 16, 40, 35, 50, 53, 5, 33, 34, 36, 37, 39, 47, 17, 39, 41, 39,
      17, 39, 35, 50, 53, 6, 33, 34, 18, 37, 39, 47, 49, 83, 20, 83, 18, 18, 35,
      18, 21, 0, 97, 98, 18, 101, 135, 111, 113, 135, 142, 135, 19, 135, 99, 18,
      21, 0, 33, 34, 18, 37, 39, 47, 49, 39, 20, 39, 20, 20, 35, 18, 21, 0, 33,
      34, 21, 37, 39, 47, 49, 86, 23, 86, 21, 21, 35, 18, 21, 3, 97, 98, 21,
      101, 135, 111, 113, 135, 142, 135, 22, 135, 99, 18, 21, 3, 33, 34, 21, 37,
      39, 47, 49, 39, 23, 39, 23, 23, 35, 18, 21, 3, 0, 2, 17, 17, 0, 0, 0, 0,
      0, 66, 1, 1, 0, 0, 0, 0, 0, 2, 4, 4, 19, 19, 0, 1, 0, 34, 52, 52, 3, 3, 0,
      0, 0, 2, 4, 4, 19, 19, 0, 2, 1, 0, 2, 2, 0, 0, 0, 0, 1, 0, 1, 2, 19, 19,
      0, 1, 1, 0, 2, 2, 0, 0, 0, 1, 33, 48, 6, 4, 3, 3, 48, 0, 33, 48, 6, 4, 5,
      5, 48, 3, 33, 48, 6, 4, 5, 5, 48, 2, 33, 48, 6, 4, 3, 3, 48, 1, 0, 1, 2,
      3, 4, 0, 1, 13, 14, 0, 98, 1, 1, 0, 0, 0, 0, 0, 98, 1, 1, 0, 48, 0, 4, 0,
      98, 84, 84, 19, 48, 0, 3, 48, 66, 84, 84, 3, 48, 48, 3, 48, 66, 4, 4, 19,
      48, 48, 4, 19, 0, 1, 1, 0, 0, 0, 0, 35, 0, 1, 1, 2, 64, 0, 1, 35, 0, 1, 1,
      2, 64, 0, 0, 3, 0, 3, 54, 20, 64, 0, 1, 83, 64, 5, 54, 4, 64, 64, 0, 83,
      64, 5, 54, 4, 64, 64, 1, 83, 64, 6, 6, 4, 64, 64, 3, 0, 1, 2, 5, 6, 7, 8,
      0, 1, 9, 10, 11, 12, 0, 1, 0, 2, 0, 0, 0, 0, 0, 1, 3, 3, 20, 20, 0, 1, 0,
      1, 0, 2, 21, 21, 0, 2, 0, 1, 3, 3, 20, 20, 0, 2, 0, 33, 51, 51, 4, 4, 0,
      0, 0, 33, 0, 50, 5, 5, 0, 0, 0, 99, 0, 1, 0, 0, 0, 0, 0, 99, 0, 1, 18, 48,
      0, 4, 32, 99, 32, 1, 2, 48, 32, 3, 0, 99, 85, 86, 20, 48, 0, 3, 48, 67,
      85, 86, 4, 48, 48, 3, 48, 67, 5, 86, 20, 48, 48, 4, 48, 67, 85, 6, 20, 48,
      48, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 20, 20, 0, 1, 0, 1, 0, 0, 21,
      21, 0, 2, 0, 1, 0, 0, 20, 20, 0, 2, 32, 1, 32, 32, 4, 4, 32, 1, 32, 1, 32,
      32, 5, 5, 32, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 0, 1, 1, 20, 20, 0, 1, 1, 0,
      1, 1, 0, 0, 0, 1, 1, 0, 1, 1, 5, 5, 0, 1, 33, 0, 33, 33, 4, 4, 0, 0, 1, 0,
      1, 1, 5, 5, 0, 0, 0, 3, 17, 17, 0, 0, 0, 0, 32, 3, 1, 1, 2, 32, 32, 2, 32,
      3, 1, 1, 2, 32, 32, 1, 0, 3, 5, 5, 20, 0, 0, 1, 32, 3, 5, 5, 4, 32, 32, 1,
      0, 3, 5, 5, 20, 0, 0, 2, 2, 0, 1, 1, 0, 0, 0, 0, 2, 0, 1, 1, 0, 0, 0, 1,
      2, 0, 20, 20, 19, 0, 0, 1, 34, 0, 4, 4, 3, 0, 0, 0, 34, 0, 4, 4, 3, 0, 0,
      1, 1, 0, 2, 2, 0, 0, 0, 0, 1, 0, 1, 3, 20, 20, 0, 1, 1, 0, 2, 2, 0, 0, 0,
      1, 1, 0, 1, 3, 5, 5, 0, 1, 33, 0, 33, 3, 4, 4, 0, 0, 1, 0, 1, 3, 5, 5, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 3, 0, 1, 0, 1, 0, 0, 2, 2, 0, 0, 1, 2,
      0, 1, 1, 2, 0, 1, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 3, 0, 1, 0, 3, 0,
      0, 1, 2, 0, 0, 1, 2, 0, 1, 1, 2, 0, 1, 1, 3, 0, 2, 4, 6, 8, 10, 12, 14, 0,
      1, 0, 0, 0, 0, 0, 1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 2, 3, 0, 1, 2, 3, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 4, 4, 4, 4, 3,
      3, 3, 0, 3, 0, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      1, 2, 3, 0, 1, 0, 1, 2, 3, 0, 1, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1,
      2, 3, 0, 1, 2, 3, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2,
      3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3,
      0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0,
      1, 0, 1, 0, 1, 2, 3, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 45, 0, 3, 3, 44, 3,
      45, 3, 4, 42, 4, 4, 13, 13, 13, 6, 6, 31, 31, 35, 35, 33, 33, 40, 40, 1,
      1, 11, 11, 55, 55, 55, 0, 9, 29, 19, 22, 24, 26, 16, 44, 45, 45, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 4, 29, 0, 3, 3, 3, 0, 3, 44, 44, 45, 4, 4, 4, 4, 4,
      4, 4, 4, 13, 13, 13, 13, 13, 13, 13, 6, 6, 6, 6, 6, 6, 6, 6, 6, 31, 31,
      31, 31, 31, 31, 31, 31, 31, 35, 35, 35, 33, 33, 40, 1, 9, 9, 9, 9, 9, 9,
      29, 29, 11, 38, 11, 19, 19, 19, 11, 11, 11, 11, 11, 11, 22, 22, 22, 22,
      26, 26, 26, 26, 56, 21, 13, 42, 17, 17, 14, 44, 44, 44, 44, 44, 44, 44,
      44, 55, 47, 55, 44, 45, 45, 46, 46, 0, 42, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 31, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 35, 33, 1, 0, 0, 21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      2, 0, 5, 12, 12, 7, 7, 15, 39, 50, 18, 43, 43, 48, 49, 20, 23, 25, 27, 36,
      10, 8, 28, 32, 34, 30, 7, 37, 41, 5, 12, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 53, 52, 51, 4, 4,
      4, 4, 4, 4, 4, 13, 13, 6, 6, 31, 35, 1, 1, 1, 9, 9, 11, 11, 11, 24, 24,
      26, 26, 26, 22, 31, 31, 35, 13, 13, 35, 31, 13, 3, 3, 55, 55, 45, 44, 44,
      54, 54, 13, 35, 35, 19, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 4, 13,
      40, 9, 29, 22, 24, 45, 45, 31, 44, 57, 0, 6, 33, 11, 85, 31, 1, 19, 0, 4,
      4, 4, 31, 45, 86, 88, 87, 0, 0, 58, 60, 60, 64, 64, 61, 0, 82, 0, 84, 84,
      0, 0, 65, 79, 83, 67, 67, 67, 68, 62, 80, 69, 70, 76, 59, 59, 72, 72, 75,
      73, 73, 73, 74, 0, 0, 77, 0, 0, 0, 0, 0, 0, 71, 63, 78, 81, 66, 83, 116,
      57, 116, 121, 112, 101, 95, 105, 110, 102, 111, 0, 78, 49, 48, 95, 95, 99,
      120, 120, 97, 98, 105, 118, 49, 49, 54, 95, 95, 115, 104, 105, 109, 95,
      116, 121, 112, 101, 95, 105, 110, 102, 111, 69, 0, 78, 49, 48, 95, 95, 99,
      120, 120, 97, 98, 105, 118, 49, 49, 55, 95, 95, 99, 108, 97, 115, 115, 95,
      116, 121, 112, 101, 95, 105, 110, 102, 111, 69, 0, 78, 49, 48, 95, 95, 99,
      120, 120, 97, 98, 105, 118, 49, 49, 57, 95, 95, 112, 111, 105, 110, 116,
      101, 114, 95, 116, 121, 112, 101, 95, 105, 110, 102, 111, 69, 0, 78, 49,
      48, 95, 95, 99, 120, 120, 97, 98, 105, 118, 49, 49, 55, 95, 95, 112, 98,
      97, 115, 101, 95, 116, 121, 112, 101, 95, 105, 110, 102, 111, 69, 0, 78,
      49, 48, 95, 95, 99, 120, 120, 97, 98, 105, 118, 49, 50, 48, 95, 95, 115,
      105, 95, 99, 108, 97, 115, 115, 95, 116, 121, 112, 101, 95, 105, 110, 102,
      111, 69, 0,
    ],
    'i8',
    ALLOC_NONE,
    Runtime.GLOBAL_BASE + 61510,
  );

  var tempDoublePtr = Runtime.alignMemory(allocate(12, 'i8', ALLOC_STATIC), 8);
  function copyTempFloat(ptr) {
    HEAP8[tempDoublePtr] = HEAP8[ptr];
    HEAP8[tempDoublePtr + 1] = HEAP8[ptr + 1];
    HEAP8[tempDoublePtr + 2] = HEAP8[ptr + 2];
    HEAP8[tempDoublePtr + 3] = HEAP8[ptr + 3];
  }
  function copyTempDouble(ptr) {
    HEAP8[tempDoublePtr] = HEAP8[ptr];
    HEAP8[tempDoublePtr + 1] = HEAP8[ptr + 1];
    HEAP8[tempDoublePtr + 2] = HEAP8[ptr + 2];
    HEAP8[tempDoublePtr + 3] = HEAP8[ptr + 3];
    HEAP8[tempDoublePtr + 4] = HEAP8[ptr + 4];
    HEAP8[tempDoublePtr + 5] = HEAP8[ptr + 5];
    HEAP8[tempDoublePtr + 6] = HEAP8[ptr + 6];
    HEAP8[tempDoublePtr + 7] = HEAP8[ptr + 7];
  }
  function _sbrk(bytes) {
    var self = _sbrk;
    if (!self.called) {
      DYNAMICTOP = alignMemoryPage(DYNAMICTOP);
      self.called = true;
      self.alloc = Runtime.dynamicAlloc;
      Runtime.dynamicAlloc = function () {
        abort('cannot dynamically allocate, sbrk now has control');
      };
    }
    var ret = DYNAMICTOP;
    if (bytes != 0) {
      var success = self.alloc(bytes);
      if (!success) return -1 >>> 0;
    }
    return ret;
  }
  function ___setErrNo(value) {
    if (Module['___errno_location'])
      HEAP32[Module['___errno_location']() >> 2] = value;
    return value;
  }
  var ERRNO_CODES = {
    EPERM: 1,
    ENOENT: 2,
    ESRCH: 3,
    EINTR: 4,
    EIO: 5,
    ENXIO: 6,
    E2BIG: 7,
    ENOEXEC: 8,
    EBADF: 9,
    ECHILD: 10,
    EAGAIN: 11,
    EWOULDBLOCK: 11,
    ENOMEM: 12,
    EACCES: 13,
    EFAULT: 14,
    ENOTBLK: 15,
    EBUSY: 16,
    EEXIST: 17,
    EXDEV: 18,
    ENODEV: 19,
    ENOTDIR: 20,
    EISDIR: 21,
    EINVAL: 22,
    ENFILE: 23,
    EMFILE: 24,
    ENOTTY: 25,
    ETXTBSY: 26,
    EFBIG: 27,
    ENOSPC: 28,
    ESPIPE: 29,
    EROFS: 30,
    EMLINK: 31,
    EPIPE: 32,
    EDOM: 33,
    ERANGE: 34,
    ENOMSG: 42,
    EIDRM: 43,
    ECHRNG: 44,
    EL2NSYNC: 45,
    EL3HLT: 46,
    EL3RST: 47,
    ELNRNG: 48,
    EUNATCH: 49,
    ENOCSI: 50,
    EL2HLT: 51,
    EDEADLK: 35,
    ENOLCK: 37,
    EBADE: 52,
    EBADR: 53,
    EXFULL: 54,
    ENOANO: 55,
    EBADRQC: 56,
    EBADSLT: 57,
    EDEADLOCK: 35,
    EBFONT: 59,
    ENOSTR: 60,
    ENODATA: 61,
    ETIME: 62,
    ENOSR: 63,
    ENONET: 64,
    ENOPKG: 65,
    EREMOTE: 66,
    ENOLINK: 67,
    EADV: 68,
    ESRMNT: 69,
    ECOMM: 70,
    EPROTO: 71,
    EMULTIHOP: 72,
    EDOTDOT: 73,
    EBADMSG: 74,
    ENOTUNIQ: 76,
    EBADFD: 77,
    EREMCHG: 78,
    ELIBACC: 79,
    ELIBBAD: 80,
    ELIBSCN: 81,
    ELIBMAX: 82,
    ELIBEXEC: 83,
    ENOSYS: 38,
    ENOTEMPTY: 39,
    ENAMETOOLONG: 36,
    ELOOP: 40,
    EOPNOTSUPP: 95,
    EPFNOSUPPORT: 96,
    ECONNRESET: 104,
    ENOBUFS: 105,
    EAFNOSUPPORT: 97,
    EPROTOTYPE: 91,
    ENOTSOCK: 88,
    ENOPROTOOPT: 92,
    ESHUTDOWN: 108,
    ECONNREFUSED: 111,
    EADDRINUSE: 98,
    ECONNABORTED: 103,
    ENETUNREACH: 101,
    ENETDOWN: 100,
    ETIMEDOUT: 110,
    EHOSTDOWN: 112,
    EHOSTUNREACH: 113,
    EINPROGRESS: 115,
    EALREADY: 114,
    EDESTADDRREQ: 89,
    EMSGSIZE: 90,
    EPROTONOSUPPORT: 93,
    ESOCKTNOSUPPORT: 94,
    EADDRNOTAVAIL: 99,
    ENETRESET: 102,
    EISCONN: 106,
    ENOTCONN: 107,
    ETOOMANYREFS: 109,
    EUSERS: 87,
    EDQUOT: 122,
    ESTALE: 116,
    ENOTSUP: 95,
    ENOMEDIUM: 123,
    EILSEQ: 84,
    EOVERFLOW: 75,
    ECANCELED: 125,
    ENOTRECOVERABLE: 131,
    EOWNERDEAD: 130,
    ESTRPIPE: 86,
  };
  function _sysconf(name) {
    switch (name) {
      case 30:
        return PAGE_SIZE;
      case 85:
        return totalMemory / PAGE_SIZE;
      case 132:
      case 133:
      case 12:
      case 137:
      case 138:
      case 15:
      case 235:
      case 16:
      case 17:
      case 18:
      case 19:
      case 20:
      case 149:
      case 13:
      case 10:
      case 236:
      case 153:
      case 9:
      case 21:
      case 22:
      case 159:
      case 154:
      case 14:
      case 77:
      case 78:
      case 139:
      case 80:
      case 81:
      case 82:
      case 68:
      case 67:
      case 164:
      case 11:
      case 29:
      case 47:
      case 48:
      case 95:
      case 52:
      case 51:
      case 46:
        return 200809;
      case 79:
        return 0;
      case 27:
      case 246:
      case 127:
      case 128:
      case 23:
      case 24:
      case 160:
      case 161:
      case 181:
      case 182:
      case 242:
      case 183:
      case 184:
      case 243:
      case 244:
      case 245:
      case 165:
      case 178:
      case 179:
      case 49:
      case 50:
      case 168:
      case 169:
      case 175:
      case 170:
      case 171:
      case 172:
      case 97:
      case 76:
      case 32:
      case 173:
      case 35:
        return -1;
      case 176:
      case 177:
      case 7:
      case 155:
      case 8:
      case 157:
      case 125:
      case 126:
      case 92:
      case 93:
      case 129:
      case 130:
      case 131:
      case 94:
      case 91:
        return 1;
      case 74:
      case 60:
      case 69:
      case 70:
      case 4:
        return 1024;
      case 31:
      case 42:
      case 72:
        return 32;
      case 87:
      case 26:
      case 33:
        return 2147483647;
      case 34:
      case 1:
        return 47839;
      case 38:
      case 36:
        return 99;
      case 43:
      case 37:
        return 2048;
      case 0:
        return 2097152;
      case 3:
        return 65536;
      case 28:
        return 32768;
      case 44:
        return 32767;
      case 75:
        return 16384;
      case 39:
        return 1e3;
      case 89:
        return 700;
      case 71:
        return 256;
      case 40:
        return 255;
      case 2:
        return 100;
      case 180:
        return 64;
      case 25:
        return 20;
      case 5:
        return 16;
      case 6:
        return 6;
      case 73:
        return 4;
      case 84: {
        if (typeof navigator === 'object')
          return navigator['hardwareConcurrency'] || 1;
        return 1;
      }
    }
    ___setErrNo(ERRNO_CODES.EINVAL);
    return -1;
  }
  Module['_memset'] = _memset;
  function _abort() {
    Module['abort']();
  }
  function _time(ptr) {
    var ret = (Date.now() / 1e3) | 0;
    if (ptr) {
      HEAP32[ptr >> 2] = ret;
    }
    return ret;
  }
  function _pthread_self() {
    return 0;
  }
  function _emscripten_memcpy_big(dest, src, num) {
    HEAPU8.set(HEAPU8.subarray(src, src + num), dest);
    return dest;
  }
  Module['_memcpy'] = _memcpy;
  STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);
  staticSealed = true;
  STACK_MAX = STACK_BASE + TOTAL_STACK;
  DYNAMIC_BASE = DYNAMICTOP = Runtime.alignMemory(STACK_MAX);
  function invoke_viiiii(index, a1, a2, a3, a4, a5) {
    try {
      Module['dynCall_viiiii'](index, a1, a2, a3, a4, a5);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      asm['setThrew'](1, 0);
    }
  }
  function invoke_vi(index, a1) {
    try {
      Module['dynCall_vi'](index, a1);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      asm['setThrew'](1, 0);
    }
  }
  function invoke_iiii(index, a1, a2, a3) {
    try {
      return Module['dynCall_iiii'](index, a1, a2, a3);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      asm['setThrew'](1, 0);
    }
  }
  function invoke_viiiiii(index, a1, a2, a3, a4, a5, a6) {
    try {
      Module['dynCall_viiiiii'](index, a1, a2, a3, a4, a5, a6);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      asm['setThrew'](1, 0);
    }
  }
  function invoke_iii(index, a1, a2) {
    try {
      return Module['dynCall_iii'](index, a1, a2);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      asm['setThrew'](1, 0);
    }
  }
  function invoke_viiii(index, a1, a2, a3, a4) {
    try {
      Module['dynCall_viiii'](index, a1, a2, a3, a4);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      asm['setThrew'](1, 0);
    }
  }
  Module.asmGlobalArg = {
    Math: Math,
    Int8Array: Int8Array,
    Int16Array: Int16Array,
    Int32Array: Int32Array,
    Uint8Array: Uint8Array,
    Uint16Array: Uint16Array,
    Uint32Array: Uint32Array,
    Float32Array: Float32Array,
    Float64Array: Float64Array,
    NaN: NaN,
    Infinity: Infinity,
    byteLength: byteLength,
  };
  Module.asmLibraryArg = {
    abort: abort,
    assert_em: assert_em,
    invoke_viiiii: invoke_viiiii,
    invoke_vi: invoke_vi,
    invoke_iiii: invoke_iiii,
    invoke_viiiiii: invoke_viiiiii,
    invoke_iii: invoke_iii,
    invoke_viiii: invoke_viiii,
    _pthread_self: _pthread_self,
    _abort: _abort,
    ___setErrNo: ___setErrNo,
    _sbrk: _sbrk,
    _time: _time,
    _emscripten_memcpy_big: _emscripten_memcpy_big,
    _sysconf: _sysconf,
    STACKTOP: STACKTOP,
    STACK_MAX: STACK_MAX,
    tempDoublePtr: tempDoublePtr,
    ABORT: ABORT,
  };
  var asm = (function (global, env, buffer) {
    'use asm';
    var Int8View = global.Int8Array;
    var Int16View = global.Int16Array;
    var Int32View = global.Int32Array;
    var Uint8View = global.Uint8Array;
    var Uint16View = global.Uint16Array;
    var Uint32View = global.Uint32Array;
    var Float32View = global.Float32Array;
    var Float64View = global.Float64Array;
    var HEAP8 = new Int8View(buffer);
    var HEAP16 = new Int16View(buffer);
    var HEAP32 = new Int32View(buffer);
    var HEAPU8 = new Uint8View(buffer);
    var HEAPU16 = new Uint16View(buffer);
    var HEAPU32 = new Uint32View(buffer);
    var HEAPF32 = new Float32View(buffer);
    var HEAPF64 = new Float64View(buffer);
    var byteLength = global.byteLength;
    var STACKTOP = env.STACKTOP | 0;
    var STACK_MAX = env.STACK_MAX | 0;
    var tempDoublePtr = env.tempDoublePtr | 0;
    var ABORT = env.ABORT | 0;
    var __THREW__ = 0;
    var threwValue = 0;
    var setjmpId = 0;
    var undef = 0;
    var nan = global.NaN,
      inf = global.Infinity;
    var tempInt = 0,
      tempBigInt = 0,
      tempBigIntP = 0,
      tempBigIntS = 0,
      tempBigIntR = 0,
      tempBigIntI = 0,
      tempBigIntD = 0,
      tempValue = 0,
      tempDouble = 0;
    var tempRet0 = 0;
    var tempRet1 = 0;
    var tempRet2 = 0;
    var tempRet3 = 0;
    var tempRet4 = 0;
    var tempRet5 = 0;
    var tempRet6 = 0;
    var tempRet7 = 0;
    var tempRet8 = 0;
    var tempRet9 = 0;
    var Math_floor = global.Math.floor;
    var Math_abs = global.Math.abs;
    var Math_sqrt = global.Math.sqrt;
    var Math_pow = global.Math.pow;
    var Math_cos = global.Math.cos;
    var Math_sin = global.Math.sin;
    var Math_tan = global.Math.tan;
    var Math_acos = global.Math.acos;
    var Math_asin = global.Math.asin;
    var Math_atan = global.Math.atan;
    var Math_atan2 = global.Math.atan2;
    var Math_exp = global.Math.exp;
    var Math_log = global.Math.log;
    var Math_ceil = global.Math.ceil;
    var Math_imul = global.Math.imul;
    var Math_min = global.Math.min;
    var Math_clz32 = global.Math.clz32;
    var abort = env.abort;
    var assert_em = env.assert_em;
    var invoke_viiiii = env.invoke_viiiii;
    var invoke_vi = env.invoke_vi;
    var invoke_iiii = env.invoke_iiii;
    var invoke_viiiiii = env.invoke_viiiiii;
    var invoke_iii = env.invoke_iii;
    var invoke_viiii = env.invoke_viiii;
    var _pthread_self = env._pthread_self;
    var _abort = env._abort;
    var ___setErrNo = env.___setErrNo;
    var _sbrk = env._sbrk;
    var _time = env._time;
    var _emscripten_memcpy_big = env._emscripten_memcpy_big;
    var _sysconf = env._sysconf;
    var tempFloat = 0;
    function _emscripten_replace_memory(newBuffer) {
      if (
        byteLength(newBuffer) & 16777215 ||
        byteLength(newBuffer) <= 16777215 ||
        byteLength(newBuffer) > 2147483648
      )
        return false;
      HEAP8 = new Int8View(newBuffer);
      HEAP16 = new Int16View(newBuffer);
      HEAP32 = new Int32View(newBuffer);
      HEAPU8 = new Uint8View(newBuffer);
      HEAPU16 = new Uint16View(newBuffer);
      HEAPU32 = new Uint32View(newBuffer);
      HEAPF32 = new Float32View(newBuffer);
      HEAPF64 = new Float64View(newBuffer);
      buffer = newBuffer;
      return true;
    }
    function _ubidi_setPara_58(
      $pBiDi,
      $text,
      $length,
      $paraLevel,
      $pErrorCode,
    ) {
      $pBiDi = $pBiDi | 0;
      $text = $text | 0;
      $length = $length | 0;
      $paraLevel = $paraLevel | 0;
      $pErrorCode = $pErrorCode | 0;
      var $$0 = 0,
        $$0$i29 = 0,
        $$010$i = 0,
        $$1$i = 0,
        $$2$i39 = 0,
        $$3$i = 0,
        $$4$i40 = 0,
        $$cast = 0,
        $$flags$111$i = 0,
        $$in = 0,
        $$lcssa159 = 0,
        $$ph = 0,
        $$pre = 0,
        $$pre111 = 0,
        $$pre113 = 0,
        $$sink = 0,
        $$sink$i = 0,
        $$sink$i16 = 0,
        $$sink1$i = 0,
        $$sink4 = 0,
        $$sink5 = 0,
        $$sink6 = 0,
        $$sink8$i = 0,
        $$sink9$i = 0,
        $$stackLast$0$i$lcssa = 0,
        $105 = 0,
        $106 = 0,
        $107 = 0,
        $108 = 0,
        $110 = 0,
        $111 = 0,
        $113 = 0,
        $122 = 0,
        $124 = 0,
        $125 = 0,
        $126 = 0,
        $129 = 0,
        $130 = 0,
        $132 = 0,
        $133 = 0,
        $144 = 0,
        $152 = 0,
        $156 = 0,
        $16 = 0,
        $162 = 0,
        $170 = 0,
        $172 = 0,
        $174 = 0,
        $184 = 0,
        $192 = 0,
        $199 = 0,
        $200 = 0,
        $201 = 0,
        $202 = 0,
        $203 = 0,
        $204 = 0,
        $205 = 0,
        $206 = 0,
        $207 = 0,
        $208 = 0,
        $21 = 0,
        $210 = 0,
        $212 = 0,
        $214 = 0,
        $224 = 0,
        $225 = 0,
        $228 = 0,
        $229 = 0,
        $23 = 0,
        $231 = 0,
        $235 = 0,
        $236 = 0,
        $237 = 0,
        $238 = 0,
        $239 = 0,
        $24 = 0,
        $240 = 0,
        $243 = 0,
        $244 = 0,
        $245 = 0,
        $248 = 0,
        $249 = 0,
        $25 = 0,
        $250 = 0,
        $252 = 0,
        $254 = 0,
        $257 = 0,
        $258 = 0,
        $26 = 0,
        $261 = 0,
        $267 = 0,
        $274 = 0,
        $275 = 0,
        $277 = 0,
        $283 = 0,
        $284 = 0,
        $285 = 0,
        $286 = 0,
        $288 = 0,
        $291 = 0,
        $297 = 0,
        $304 = 0,
        $306 = 0,
        $308 = 0,
        $309 = 0,
        $31 = 0,
        $310 = 0,
        $340 = 0,
        $347 = 0,
        $35 = 0,
        $354 = 0,
        $359 = 0,
        $36 = 0,
        $360 = 0,
        $361 = 0,
        $364 = 0,
        $369 = 0,
        $37 = 0,
        $374 = 0,
        $38 = 0,
        $39 = 0,
        $390 = 0,
        $40 = 0,
        $41 = 0,
        $419 = 0,
        $42 = 0,
        $421 = 0,
        $427 = 0,
        $429 = 0,
        $437 = 0,
        $439 = 0,
        $440 = 0,
        $441 = 0,
        $442 = 0,
        $447 = 0,
        $448 = 0,
        $449 = 0,
        $450 = 0,
        $451 = 0,
        $454 = 0,
        $459 = 0,
        $462 = 0,
        $466 = 0,
        $47 = 0,
        $470 = 0,
        $474 = 0,
        $475 = 0,
        $48 = 0,
        $483 = 0,
        $486 = 0,
        $487 = 0,
        $488 = 0,
        $489 = 0,
        $490 = 0,
        $491 = 0,
        $492 = 0,
        $493 = 0,
        $497 = 0,
        $501 = 0,
        $502 = 0,
        $504 = 0,
        $505 = 0,
        $506 = 0,
        $507 = 0,
        $51 = 0,
        $512 = 0,
        $52 = 0,
        $526 = 0,
        $528 = 0,
        $529 = 0,
        $53 = 0,
        $530 = 0,
        $531 = 0,
        $532 = 0,
        $533 = 0,
        $534 = 0,
        $536 = 0,
        $537 = 0,
        $538 = 0,
        $539 = 0,
        $54 = 0,
        $541 = 0,
        $547 = 0,
        $553 = 0,
        $559 = 0,
        $568 = 0,
        $572 = 0,
        $576 = 0,
        $578 = 0,
        $58 = 0,
        $597 = 0,
        $6 = 0,
        $600 = 0,
        $604 = 0,
        $607 = 0,
        $608 = 0,
        $612 = 0,
        $614 = 0,
        $62 = 0,
        $63 = 0,
        $633 = 0,
        $636 = 0,
        $637 = 0,
        $638 = 0,
        $643 = 0,
        $647 = 0,
        $650 = 0,
        $656 = 0,
        $66 = 0,
        $666 = 0,
        $673 = 0,
        $674 = 0,
        $677 = 0,
        $68 = 0,
        $681 = 0,
        $684 = 0,
        $69 = 0,
        $720 = 0,
        $721 = 0,
        $724 = 0,
        $739 = 0,
        $743 = 0,
        $744 = 0,
        $750 = 0,
        $754 = 0,
        $755 = 0,
        $761 = 0,
        $768 = 0,
        $769 = 0,
        $772 = 0,
        $777 = 0,
        $780 = 0,
        $788 = 0,
        $796 = 0,
        $799 = 0,
        $800 = 0,
        $802 = 0,
        $812 = 0,
        $817 = 0,
        $819 = 0,
        $82 = 0,
        $824 = 0,
        $826 = 0,
        $833 = 0,
        $835 = 0,
        $836 = 0,
        $841 = 0,
        $842 = 0,
        $845 = 0,
        $847 = 0,
        $858 = 0,
        $864 = 0,
        $866 = 0,
        $868 = 0,
        $882 = 0,
        $894 = 0,
        $896 = 0,
        $898 = 0,
        $899 = 0,
        $909 = 0,
        $91 = 0,
        $911 = 0,
        $92 = 0,
        $926 = 0,
        $938 = 0,
        $939 = 0,
        $940 = 0,
        $941 = 0,
        $95 = 0,
        $96 = 0,
        $addedRuns$0$i$lcssa1 = 0,
        $addedRuns$0$i182 = 0,
        $addedRuns$1$i$ph = 0,
        $addedRuns$3$i = 0,
        $addedRuns$5$i$ph = 0,
        $bracketData$i = 0,
        $bracketData4$i = 0,
        $controlCount$0$i$lcssa = 0,
        $controlCount$0$i248 = 0,
        $controlCount$1$i = 0,
        $embeddingLevel$0$i219 = 0,
        $embeddingLevel$1$in$i = 0,
        $embeddingLevel$2$i = 0,
        $eor$0 = 0,
        $flags$0$i$be = 0,
        $flags$0$i$lcssa = 0,
        $flags$0$i20215 = 0,
        $flags$0$i246 = 0,
        $flags$1$i = 0,
        $flags$1$i24 = 0,
        $flags$2$i = 0,
        $flags$3$i = 0,
        $flags$4$i = 0,
        $flags$5$i = 0,
        $flags$5$i26 = 0,
        $flags$6$i = 0,
        $flags$7$i = 0,
        $flags$7$i28 = 0,
        $flags$8$i$lcssa = 0,
        $flags$8$i238 = 0,
        $i$0$i$i261 = 0,
        $i$0$i11249 = 0,
        $i$0$i199 = 0,
        $i$0$i37180 = 0,
        $i$0190 = 0,
        $i$1$i$i = 0,
        $i$1$i12 = 0,
        $i$1$i192 = 0,
        $i$1$i19208 = 0,
        $i$1$i38173179$in = 0,
        $i$1$i38175 = 0,
        $i$1$i38175$in = 0,
        $i$2$i15239 = 0,
        $i$2$i196 = 0,
        $i$2$i21216 = 0,
        $j$0$in$i = 0,
        $j$0$in$i$ph = 0,
        $j$0186 = 0,
        $j$1$i = 0,
        $j$1$i$ph = 0,
        $last$0 = 0,
        $last$1 = 0,
        $lastArabicPos$0$i$be = 0,
        $lastArabicPos$0$i$lcssa = 0,
        $lastArabicPos$0$i247 = 0,
        $lastCcPos$0$i221 = 0,
        $lastCcPos$1$i = 0,
        $lastCcPos$2$i = 0,
        $lastStrong$0$i$be = 0,
        $lastStrong$0$i$lcssa = 0,
        $lastStrong$0$i251 = 0,
        $lastStrong$0$ph$i = 0,
        $limit$0 = 0,
        $newLevel$0$in$i = 0,
        $newLevel$1$i = 0,
        $newLevel$1$in$i = 0,
        $nextLevel$0 = 0,
        $nextLevel$1 = 0,
        $overflowEmbeddingCount$0$i224 = 0,
        $overflowEmbeddingCount$1$i = 0,
        $overflowEmbeddingCount$2$i = 0,
        $overflowIsolateCount$0$i223 = 0,
        $overflowIsolateCount$1$i = 0,
        $overflowIsolateCount$2$i = 0,
        $paraIndex$0$i206 = 0,
        $paraIndex1$0$i212 = 0,
        $previousLevel$0$i220 = 0,
        $previousLevel$1$i = 0,
        $result$0$i$i$be = 0,
        $result$0$i$i260 = 0,
        $runs$0$i = 0,
        $runsOnlyMemory$0$i = 0,
        $sor$0$ph = 0,
        $stackLast$0$i$be = 0,
        $stackLast$0$i$lcssa = 0,
        $stackLast$0$i22222 = 0,
        $stackLast$0$i252 = 0,
        $stackLast$1$i244 = 0,
        $stackLast$1$i25 = 0,
        $stackLast$2$i = 0,
        $stackLast$3$i = 0,
        $start$0 = 0,
        $start$0$i = 0,
        $start2$0$i = 0,
        $state$0$i$be = 0,
        $state$0$i$lcssa = 0,
        $state$0$i250 = 0,
        $state$0$ph$i = 0,
        $state$2$i = 0,
        $state$3$i = 0,
        $state$5$i243 = 0,
        $storemerge = 0,
        $t$0$i = 0,
        $uchar$0$i = 0,
        $uchar$0$i$i = 0,
        $validIsolateCount$0$i225 = 0,
        $validIsolateCount$1$i = 0,
        $validIsolateCount$2$i = 0,
        $visualStart$0$i181 = 0,
        dest = 0,
        label = 0,
        sp = 0,
        src = 0,
        stop = 0,
        $j$0$in$i$looptemp = 0,
        $visualStart$0$i181$looptemp = 0,
        $stackLast$1$i25$looptemp = 0;
      sp = STACKTOP;
      STACKTOP = (STACKTOP + 5072) | 0;
      $bracketData$i = (sp + 2532) | 0;
      $bracketData4$i = sp;
      L1: do
        if ($pErrorCode)
          if ((HEAP32[$pErrorCode >> 2] | 0) <= 0) {
            if (
              !((($pBiDi | 0) == 0) | (($text | 0) == 0) | (($length | 0) < -1))
            ) {
              $6 = $paraLevel & 255;
              if ((((($paraLevel + -126) << 24) >> 24) << 24) >> 24 <= -1) {
                if (($length | 0) == -1) {
                  $t$0$i = $text;
                  while (1)
                    if (!(HEAP16[$t$0$i >> 1] | 0)) break;
                    else $t$0$i = ($t$0$i + 2) | 0;
                  $$0 = ($t$0$i - $text) >> 1;
                } else $$0 = $length;
                $16 = ($pBiDi + 88) | 0;
                if ((HEAP32[$16 >> 2] | 0) == 3) {
                  HEAP32[$16 >> 2] = 0;
                  do
                    if (!$$0) {
                      _ubidi_setPara_58(
                        $pBiDi,
                        $text,
                        0,
                        $paraLevel,
                        $pErrorCode,
                      );
                      $runsOnlyMemory$0$i = 0;
                    } else {
                      $21 = _uprv_malloc_58(($$0 * 7) | 0) | 0;
                      if (!$21) {
                        HEAP32[$pErrorCode >> 2] = 7;
                        $runsOnlyMemory$0$i = 0;
                        break;
                      }
                      $23 = ($21 + ($$0 << 2)) | 0;
                      $24 = ($23 + ($$0 << 1)) | 0;
                      $25 = ($pBiDi + 92) | 0;
                      $26 = HEAP32[$25 >> 2] | 0;
                      if ($26 & 1) HEAP32[$25 >> 2] = ($26 & -4) | 2;
                      $31 = $6 & 1;
                      _ubidi_setPara_58(
                        $pBiDi,
                        $text,
                        $$0,
                        $31 & 255,
                        $pErrorCode,
                      );
                      if ((HEAP32[$pErrorCode >> 2] | 0) > 0)
                        $runsOnlyMemory$0$i = $21;
                      else {
                        $35 = _ubidi_getLevels_58($pBiDi, $pErrorCode) | 0;
                        $36 = ($pBiDi + 16) | 0;
                        $37 = HEAP32[$36 >> 2] | 0;
                        _memcpy($24 | 0, $35 | 0, $37 | 0) | 0;
                        $38 = ($pBiDi + 132) | 0;
                        $39 = HEAP32[$38 >> 2] | 0;
                        $40 = ($pBiDi + 120) | 0;
                        $41 = HEAP32[$40 >> 2] | 0;
                        $42 =
                          _ubidi_writeReordered_58(
                            $pBiDi,
                            $23,
                            $$0,
                            2,
                            $pErrorCode,
                          ) | 0;
                        _ubidi_getVisualMap_58($pBiDi, $21, $pErrorCode);
                        if ((HEAP32[$pErrorCode >> 2] | 0) <= 0) {
                          HEAP32[$25 >> 2] = $26;
                          HEAP32[$16 >> 2] = 5;
                          $47 = ($pBiDi + 72) | 0;
                          $48 = HEAP8[$47 >> 0] | 0;
                          HEAP8[$47 >> 0] = 0;
                          _ubidi_setPara_58(
                            $pBiDi,
                            $23,
                            $42,
                            ($31 ^ 1) & 255,
                            $pErrorCode,
                          );
                          HEAP8[$47 >> 0] = $48;
                          _ubidi_getRuns_58($pBiDi, $pErrorCode);
                          L26: do
                            if ((HEAP32[$pErrorCode >> 2] | 0) <= 0) {
                              $51 = ($pBiDi + 224) | 0;
                              $52 = HEAP32[$51 >> 2] | 0;
                              $53 = ($pBiDi + 228) | 0;
                              $54 = HEAP32[$53 >> 2] | 0;
                              if (($52 | 0) > 0) {
                                $addedRuns$0$i182 = 0;
                                $i$0$i37180 = 0;
                                $visualStart$0$i181 = 0;
                                while (1) {
                                  $visualStart$0$i181$looptemp =
                                    $visualStart$0$i181;
                                  $visualStart$0$i181 =
                                    HEAP32[
                                      ($54 + (($i$0$i37180 * 12) | 0) + 4) >> 2
                                    ] | 0;
                                  $58 =
                                    ($visualStart$0$i181 -
                                      $visualStart$0$i181$looptemp) |
                                    0;
                                  L30: do
                                    if (($58 | 0) < 2)
                                      $addedRuns$3$i = $addedRuns$0$i182;
                                    else {
                                      $62 =
                                        HEAP32[
                                          ($54 + (($i$0$i37180 * 12) | 0)) >> 2
                                        ] & 2147483647;
                                      $63 = ($62 + $58) | 0;
                                      $addedRuns$1$i$ph = $addedRuns$0$i182;
                                      $j$0$in$i$ph = $62;
                                      while (1) {
                                        $j$0$in$i = $j$0$in$i$ph;
                                        do {
                                          $j$0$in$i$looptemp = $j$0$in$i;
                                          $j$0$in$i = ($j$0$in$i + 1) | 0;
                                          if (($j$0$in$i | 0) >= ($63 | 0)) {
                                            $addedRuns$3$i = $addedRuns$1$i$ph;
                                            break L30;
                                          }
                                          $66 =
                                            HEAP32[
                                              ($21 + ($j$0$in$i << 2)) >> 2
                                            ] | 0;
                                          $68 =
                                            HEAP32[
                                              ($21 +
                                                ($j$0$in$i$looptemp << 2)) >>
                                                2
                                            ] | 0;
                                          $69 = ($66 - $68) | 0;
                                          if (
                                            ((($69 | 0) > -1
                                              ? $69
                                              : (0 - $69) | 0) |
                                              0) !=
                                            1
                                          )
                                            break;
                                        } while (
                                          (HEAP8[($24 + $66) >> 0] | 0) ==
                                          (HEAP8[($24 + $68) >> 0] | 0)
                                        );
                                        $addedRuns$1$i$ph =
                                          ($addedRuns$1$i$ph + 1) | 0;
                                        $j$0$in$i$ph = $j$0$in$i;
                                      }
                                    }
                                  while (0);
                                  $i$0$i37180 = ($i$0$i37180 + 1) | 0;
                                  if (($i$0$i37180 | 0) == ($52 | 0)) break;
                                  else $addedRuns$0$i182 = $addedRuns$3$i;
                                }
                                if (!$addedRuns$3$i) {
                                  $addedRuns$0$i$lcssa1 = 0;
                                  $runs$0$i = $54;
                                } else {
                                  $82 = ($pBiDi + 64) | 0;
                                  if (
                                    !(
                                      ((_ubidi_getMemory_58(
                                        $82,
                                        ($pBiDi + 40) | 0,
                                        HEAP8[($pBiDi + 73) >> 0] | 0,
                                        ((($addedRuns$3$i + $52) | 0) * 12) | 0,
                                      ) |
                                        0) <<
                                        24) >>
                                      24
                                    )
                                  )
                                    break;
                                  if (($52 | 0) == 1) {
                                    $91 = HEAP32[$82 >> 2] | 0;
                                    HEAP32[$91 >> 2] = HEAP32[$54 >> 2];
                                    HEAP32[($91 + 4) >> 2] =
                                      HEAP32[($54 + 4) >> 2];
                                    HEAP32[($91 + 8) >> 2] =
                                      HEAP32[($54 + 8) >> 2];
                                  }
                                  $92 = HEAP32[$82 >> 2] | 0;
                                  HEAP32[$53 >> 2] = $92;
                                  HEAP32[$51 >> 2] =
                                    (HEAP32[$51 >> 2] | 0) + $addedRuns$3$i;
                                  $addedRuns$0$i$lcssa1 = $addedRuns$3$i;
                                  $runs$0$i = $92;
                                }
                                $95 = ($runs$0$i + 4) | 0;
                                $$in = $addedRuns$0$i$lcssa1;
                                $i$1$i38173179$in = $52;
                                while (1) {
                                  $96 = ($$in | 0) == 0;
                                  $i$1$i38175$in = $i$1$i38173179$in;
                                  while (1) {
                                    $i$1$i38175 = ($i$1$i38175$in + -1) | 0;
                                    if (!$i$1$i38175)
                                      $110 = HEAP32[$95 >> 2] | 0;
                                    else
                                      $110 =
                                        ((HEAP32[
                                          ($runs$0$i +
                                            (($i$1$i38175 * 12) | 0) +
                                            4) >>
                                            2
                                        ] |
                                          0) -
                                          (HEAP32[
                                            ($runs$0$i +
                                              (((($i$1$i38175$in + -2) | 0) *
                                                12) |
                                                0) +
                                              4) >>
                                              2
                                          ] |
                                            0)) |
                                        0;
                                    $105 =
                                      ($runs$0$i + (($i$1$i38175 * 12) | 0)) |
                                      0;
                                    $106 = HEAP32[$105 >> 2] | 0;
                                    $107 = $106 >>> 31;
                                    $108 = $106 & 2147483647;
                                    if (($110 | 0) >= 2) break;
                                    $$pre111 = ($i$1$i38175 + $$in) | 0;
                                    if (!$96) {
                                      $111 =
                                        ($runs$0$i + (($$pre111 * 12) | 0)) | 0;
                                      HEAP32[$111 >> 2] = HEAP32[$105 >> 2];
                                      HEAP32[($111 + 4) >> 2] =
                                        HEAP32[($105 + 4) >> 2];
                                      HEAP32[($111 + 8) >> 2] =
                                        HEAP32[($105 + 8) >> 2];
                                    }
                                    $113 = HEAP32[($21 + ($108 << 2)) >> 2] | 0;
                                    HEAP32[
                                      ($runs$0$i + (($$pre111 * 12) | 0)) >> 2
                                    ] =
                                      ((HEAPU8[($24 + $113) >> 0] ^ $107) <<
                                        31) |
                                      $113;
                                    if (($i$1$i38175$in | 0) > 1)
                                      $i$1$i38175$in = $i$1$i38175;
                                    else break L26;
                                  }
                                  $122 = ($107 | 0) == 0;
                                  $124 = ($110 + -1 + $108) | 0;
                                  $$1$i = $122 ? $108 : $124;
                                  $$2$i39 = $122 ? -1 : 1;
                                  $125 =
                                    ($runs$0$i + (($i$1$i38175 * 12) | 0) + 4) |
                                    0;
                                  $126 =
                                    ($runs$0$i + (($i$1$i38175 * 12) | 0) + 8) |
                                    0;
                                  $addedRuns$5$i$ph = $$in;
                                  $j$1$i$ph = $122 ? $124 : $108;
                                  L61: while (1) {
                                    $j$1$i = $j$1$i$ph;
                                    while (1) {
                                      if (($j$1$i | 0) == ($$1$i | 0))
                                        break L61;
                                      $129 =
                                        HEAP32[($21 + ($j$1$i << 2)) >> 2] | 0;
                                      $130 = ($j$1$i + $$2$i39) | 0;
                                      $132 =
                                        HEAP32[($21 + ($130 << 2)) >> 2] | 0;
                                      $133 = ($129 - $132) | 0;
                                      if (
                                        ((($133 | 0) > -1
                                          ? $133
                                          : (0 - $133) | 0) |
                                          0) !=
                                        1
                                      )
                                        break;
                                      if (
                                        (HEAP8[($24 + $129) >> 0] | 0) ==
                                        (HEAP8[($24 + $132) >> 0] | 0)
                                      )
                                        $j$1$i = $130;
                                      else break;
                                    }
                                    $144 =
                                      HEAP32[($21 + ($j$1$i$ph << 2)) >> 2] | 0;
                                    $$3$i =
                                      ($144 | 0) < ($129 | 0) ? $144 : $129;
                                    $152 =
                                      ($addedRuns$5$i$ph + $i$1$i38175) | 0;
                                    HEAP32[
                                      ($runs$0$i + (($152 * 12) | 0)) >> 2
                                    ] =
                                      ((HEAPU8[($24 + $$3$i) >> 0] ^ $107) <<
                                        31) |
                                      $$3$i;
                                    HEAP32[
                                      ($runs$0$i + (($152 * 12) | 0) + 4) >> 2
                                    ] = HEAP32[$125 >> 2];
                                    $156 = ($j$1$i - $j$1$i$ph) | 0;
                                    HEAP32[$125 >> 2] =
                                      (HEAP32[$125 >> 2] | 0) +
                                      ~(($156 | 0) > -1
                                        ? $156
                                        : (0 - $156) | 0);
                                    $162 = HEAP32[$126 >> 2] | 0;
                                    HEAP32[
                                      ($runs$0$i + (($152 * 12) | 0) + 8) >> 2
                                    ] = $162 & 10;
                                    HEAP32[$126 >> 2] =
                                      (($162 | -11) ^ 10) & HEAP32[$126 >> 2];
                                    $addedRuns$5$i$ph =
                                      ($addedRuns$5$i$ph + -1) | 0;
                                    $j$1$i$ph = $130;
                                  }
                                  $$pre113 =
                                    ($addedRuns$5$i$ph + $i$1$i38175) | 0;
                                  if ($addedRuns$5$i$ph) {
                                    $170 =
                                      ($runs$0$i + (($$pre113 * 12) | 0)) | 0;
                                    HEAP32[$170 >> 2] = HEAP32[$105 >> 2];
                                    HEAP32[($170 + 4) >> 2] =
                                      HEAP32[($105 + 4) >> 2];
                                    HEAP32[($170 + 8) >> 2] =
                                      HEAP32[($105 + 8) >> 2];
                                  }
                                  $172 =
                                    HEAP32[($21 + ($j$1$i$ph << 2)) >> 2] | 0;
                                  $174 = HEAP32[($21 + ($$1$i << 2)) >> 2] | 0;
                                  $$4$i40 =
                                    ($172 | 0) < ($174 | 0) ? $172 : $174;
                                  HEAP32[
                                    ($runs$0$i + (($$pre113 * 12) | 0)) >> 2
                                  ] =
                                    ((HEAPU8[($24 + $$4$i40) >> 0] ^ $107) <<
                                      31) |
                                    $$4$i40;
                                  if (($i$1$i38175$in | 0) > 1) {
                                    $$in = $addedRuns$5$i$ph;
                                    $i$1$i38173179$in = $i$1$i38175;
                                  } else break;
                                }
                              }
                            }
                          while (0);
                          $184 = ($pBiDi + 97) | 0;
                          HEAP8[$184 >> 0] = HEAPU8[$184 >> 0] ^ 1;
                        }
                        HEAP32[($pBiDi + 8) >> 2] = $text;
                        HEAP32[$36 >> 2] = $37;
                        HEAP32[($pBiDi + 12) >> 2] = $$0;
                        HEAP32[$40 >> 2] = $41;
                        $192 = HEAP32[($pBiDi + 28) >> 2] | 0;
                        _memcpy(
                          HEAP32[($pBiDi + 80) >> 2] | 0,
                          $24 | 0,
                          (($37 | 0) > ($192 | 0) ? $192 : $37) | 0,
                        ) | 0;
                        HEAP32[$38 >> 2] = $39;
                        if ((HEAP32[($pBiDi + 224) >> 2] | 0) > 1) {
                          HEAP32[$40 >> 2] = 2;
                          $runsOnlyMemory$0$i = $21;
                        } else $runsOnlyMemory$0$i = $21;
                      }
                    }
                  while (0);
                  _uprv_free_58($runsOnlyMemory$0$i);
                  HEAP32[$16 >> 2] = 3;
                  break;
                }
                HEAP32[$pBiDi >> 2] = 0;
                $199 = ($pBiDi + 8) | 0;
                HEAP32[$199 >> 2] = $text;
                $200 = ($pBiDi + 20) | 0;
                HEAP32[$200 >> 2] = $$0;
                $201 = ($pBiDi + 12) | 0;
                HEAP32[$201 >> 2] = $$0;
                $202 = ($pBiDi + 16) | 0;
                HEAP32[$202 >> 2] = $$0;
                $203 = ($pBiDi + 97) | 0;
                HEAP8[$203 >> 0] = $paraLevel;
                $204 = $6 & 1;
                $205 = ($pBiDi + 120) | 0;
                HEAP32[$205 >> 2] = $204;
                $206 = ($pBiDi + 136) | 0;
                HEAP32[$206 >> 2] = 1;
                $207 = ($pBiDi + 76) | 0;
                HEAP32[$207 >> 2] = 0;
                $208 = ($pBiDi + 80) | 0;
                HEAP32[$208 >> 2] = 0;
                HEAP32[($pBiDi + 228) >> 2] = 0;
                $210 = ($pBiDi + 336) | 0;
                HEAP32[$210 >> 2] = 0;
                HEAP32[($pBiDi + 340) >> 2] = 0;
                $212 = ($paraLevel & 255) > 253;
                $214 = ($pBiDi + 98) | 0;
                HEAP8[$214 >> 0] = $212 & 1;
                if (!$$0) {
                  if ($212) {
                    HEAP8[$203 >> 0] = $204;
                    HEAP8[$214 >> 0] = 0;
                  }
                  HEAP32[($pBiDi + 124) >> 2] =
                    HEAP32[(104 + ($204 << 2)) >> 2];
                  HEAP32[($pBiDi + 224) >> 2] = 0;
                  HEAP32[$206 >> 2] = 0;
                  HEAP32[($pBiDi + 104) >> 2] = 0;
                  HEAP32[($pBiDi + 112) >> 2] = 0;
                  HEAP32[$pBiDi >> 2] = $pBiDi;
                  break;
                }
                HEAP32[($pBiDi + 224) >> 2] = -1;
                $224 = ($pBiDi + 60) | 0;
                $225 = HEAP32[$224 >> 2] | 0;
                $228 = ($pBiDi + 140) | 0;
                HEAP32[$228 >> 2] = ($225 | 0) == 0 ? ($pBiDi + 144) | 0 : $225;
                $229 = ($pBiDi + 48) | 0;
                $231 = ($pBiDi + 72) | 0;
                if (
                  !(
                    ((_ubidi_getMemory_58(
                      $229,
                      ($pBiDi + 24) | 0,
                      HEAP8[$231 >> 0] | 0,
                      $$0,
                    ) |
                      0) <<
                      24) >>
                    24
                  )
                ) {
                  HEAP32[$pErrorCode >> 2] = 7;
                  break;
                }
                $235 = HEAP32[$229 >> 2] | 0;
                HEAP32[$207 >> 2] = $235;
                $236 = HEAP32[$199 >> 2] | 0;
                $237 = $235;
                $238 = HEAP32[$201 >> 2] | 0;
                $239 = HEAP8[$203 >> 0] | 0;
                $240 = ($239 & 255) > 253;
                if ($240) $364 = (((HEAP32[$16 >> 2] | 0) + -5) | 0) >>> 0 < 2;
                else $364 = 0;
                $243 = ($pBiDi + 92) | 0;
                $244 = HEAP32[$243 >> 2] | 0;
                $245 = $244 & 2;
                if ($244 & 4) HEAP32[$202 >> 2] = 0;
                $248 = $239 & 255;
                $249 = $248 & 1;
                $250 = $249 & 255;
                $252 = ((HEAP32[$228 >> 2] | 0) + 4) | 0;
                if ($240) {
                  HEAP32[$252 >> 2] = $249;
                  $254 = HEAP32[($pBiDi + 104) >> 2] | 0;
                  if (($254 | 0) > 0) {
                    $257 = HEAP32[($pBiDi + 100) >> 2] | 0;
                    $i$0$i$i261 = 0;
                    $result$0$i$i260 = 10;
                    while (1) {
                      $258 = ($i$0$i$i261 + 1) | 0;
                      $261 = HEAPU16[($257 + ($i$0$i$i261 << 1)) >> 1] | 0;
                      if (
                        (($258 | 0) == ($254 | 0)) |
                        ((($261 & 64512) | 0) != 55296)
                      ) {
                        $i$1$i$i = $258;
                        $uchar$0$i$i = $261;
                      } else {
                        $267 = HEAPU16[($257 + ($258 << 1)) >> 1] | 0;
                        if ((($267 & 64512) | 0) == 56320) {
                          $i$1$i$i = ($i$0$i$i261 + 2) | 0;
                          $uchar$0$i$i = (($261 << 10) + -56613888 + $267) | 0;
                        } else {
                          $i$1$i$i = $258;
                          $uchar$0$i$i = $261;
                        }
                      }
                      $274 =
                        _ubidi_getCustomizedClass_58($pBiDi, $uchar$0$i$i) | 0;
                      $275 = $274 & 255;
                      $277 = $274 & 255;
                      L101: do
                        if (($result$0$i$i260 << 24) >> 24 == 10) {
                          switch ($277 | 0) {
                            case 13:
                            case 1:
                            case 0:
                              break;
                            default: {
                              $result$0$i$i$be = 10;
                              break L101;
                            }
                          }
                          $result$0$i$i$be = $275;
                        } else
                          $result$0$i$i$be =
                            ($277 | 0) == 7 ? 10 : $result$0$i$i260;
                      while (0);
                      if (($i$1$i$i | 0) < ($254 | 0)) {
                        $i$0$i$i261 = $i$1$i$i;
                        $result$0$i$i260 = $result$0$i$i$be;
                      } else break;
                    }
                    if (($result$0$i$i$be << 24) >> 24 == 10) {
                      $lastStrong$0$ph$i = $250;
                      $state$0$ph$i = 1;
                    } else {
                      HEAP32[((HEAP32[$228 >> 2] | 0) + 4) >> 2] =
                        (($result$0$i$i$be << 24) >> 24 != 0) & 1;
                      $lastStrong$0$ph$i = $250;
                      $state$0$ph$i = 0;
                    }
                  } else {
                    $lastStrong$0$ph$i = $250;
                    $state$0$ph$i = 1;
                  }
                } else {
                  HEAP32[$252 >> 2] = $248;
                  $lastStrong$0$ph$i = 10;
                  $state$0$ph$i = 0;
                }
                $283 = ($245 | 0) == 0;
                $284 = ($pBiDi + 144) | 0;
                $285 = ($pBiDi + 36) | 0;
                $286 = ($pBiDi + 352) | 0;
                L110: do
                  if (($238 | 0) > 0) {
                    $controlCount$0$i248 = 0;
                    $flags$0$i246 = 0;
                    $i$0$i11249 = 0;
                    $lastArabicPos$0$i247 = -1;
                    $lastStrong$0$i251 = $lastStrong$0$ph$i;
                    $stackLast$0$i252 = -1;
                    $state$0$i250 = $state$0$ph$i;
                    L111: while (1) {
                      $288 = ($i$0$i11249 + 1) | 0;
                      $291 = HEAPU16[($236 + ($i$0$i11249 << 1)) >> 1] | 0;
                      if (
                        (($288 | 0) == ($238 | 0)) |
                        ((($291 & 64512) | 0) != 55296)
                      ) {
                        $i$1$i12 = $288;
                        $uchar$0$i = $291;
                      } else {
                        $297 = HEAPU16[($236 + ($288 << 1)) >> 1] | 0;
                        if ((($297 & 64512) | 0) == 56320) {
                          $i$1$i12 = ($i$0$i11249 + 2) | 0;
                          $uchar$0$i = (($291 << 10) + -56613888 + $297) | 0;
                        } else {
                          $i$1$i12 = $288;
                          $uchar$0$i = $291;
                        }
                      }
                      $304 =
                        _ubidi_getCustomizedClass_58($pBiDi, $uchar$0$i) | 0;
                      $306 = $304 & 255;
                      $308 = (1 << $306) | $flags$0$i246;
                      $309 = ($i$1$i12 + -1) | 0;
                      $310 = ($237 + $309) | 0;
                      HEAP8[$310 >> 0] = $304;
                      if (($uchar$0$i | 0) > 65535) {
                        HEAP8[($237 + ($i$1$i12 + -2)) >> 0] = 18;
                        $flags$1$i = $308 | 262144;
                      } else $flags$1$i = $308;
                      if ($283) $controlCount$1$i = $controlCount$0$i248;
                      else
                        $controlCount$1$i =
                          (((((($uchar$0$i + -8294) | 0) >>> 0 < 4) |
                            (((($uchar$0$i & -4) | 0) == 8204) |
                              ((($uchar$0$i + -8234) | 0) >>> 0 < 5))) &
                            1) +
                            $controlCount$0$i248) |
                          0;
                      L123: do
                        switch ($306 | 0) {
                          case 0: {
                            switch ($state$0$i250 | 0) {
                              case 1: {
                                HEAP32[
                                  ((HEAP32[$228 >> 2] | 0) +
                                    (((HEAP32[$206 >> 2] | 0) + -1) << 3) +
                                    4) >>
                                    2
                                ] = 0;
                                $flags$0$i$be = $flags$1$i;
                                $lastArabicPos$0$i$be = $lastArabicPos$0$i247;
                                $lastStrong$0$i$be = 0;
                                $stackLast$0$i$be = $stackLast$0$i252;
                                $state$0$i$be = 0;
                                break L123;
                                break;
                              }
                              case 2: {
                                $flags$0$i$be =
                                  ($stackLast$0$i252 | 0) < 126
                                    ? $flags$1$i | 1048576
                                    : $flags$1$i;
                                $lastArabicPos$0$i$be = $lastArabicPos$0$i247;
                                $lastStrong$0$i$be = 0;
                                $stackLast$0$i$be = $stackLast$0$i252;
                                $state$0$i$be = 3;
                                break L123;
                                break;
                              }
                              default: {
                                $flags$0$i$be = $flags$1$i;
                                $lastArabicPos$0$i$be = $lastArabicPos$0$i247;
                                $lastStrong$0$i$be = 0;
                                $stackLast$0$i$be = $stackLast$0$i252;
                                $state$0$i$be = $state$0$i250;
                                break L123;
                              }
                            }
                            break;
                          }
                          case 13:
                          case 1: {
                            L164: do
                              switch ($state$0$i250 | 0) {
                                case 1: {
                                  HEAP32[
                                    ((HEAP32[$228 >> 2] | 0) +
                                      (((HEAP32[$206 >> 2] | 0) + -1) << 3) +
                                      4) >>
                                      2
                                  ] = 1;
                                  $flags$5$i = $flags$1$i;
                                  $state$2$i = 0;
                                  break;
                                }
                                case 2: {
                                  if (($stackLast$0$i252 | 0) >= 126) {
                                    $flags$5$i = $flags$1$i;
                                    $state$2$i = 3;
                                    break L164;
                                  }
                                  HEAP8[
                                    ($237 +
                                      (HEAP32[
                                        ($bracketData$i +
                                          ($stackLast$0$i252 << 2)) >>
                                          2
                                      ] |
                                        0)) >>
                                      0
                                  ] = 21;
                                  $flags$5$i = $flags$1$i | 2097152;
                                  $state$2$i = 3;
                                  break;
                                }
                                default: {
                                  $flags$5$i = $flags$1$i;
                                  $state$2$i = $state$0$i250;
                                }
                              }
                            while (0);
                            $flags$0$i$be = $flags$5$i;
                            $lastArabicPos$0$i$be =
                              ($306 | 0) == 13 ? $309 : $lastArabicPos$0$i247;
                            $lastStrong$0$i$be = 1;
                            $stackLast$0$i$be = $stackLast$0$i252;
                            $state$0$i$be = $state$2$i;
                            break;
                          }
                          default: {
                            if ((($306 + -19) | 0) >>> 0 < 3) {
                              $340 = ($stackLast$0$i252 + 1) | 0;
                              if (($340 | 0) < 126) {
                                HEAP32[($bracketData$i + ($340 << 2)) >> 2] =
                                  $309;
                                HEAP8[($bracketData4$i + $340) >> 0] =
                                  $state$0$i250;
                              }
                              if (($306 | 0) != 19) {
                                $flags$0$i$be = $flags$1$i;
                                $lastArabicPos$0$i$be = $lastArabicPos$0$i247;
                                $lastStrong$0$i$be = $lastStrong$0$i251;
                                $stackLast$0$i$be = $340;
                                $state$0$i$be = 3;
                                break L123;
                              }
                              HEAP8[$310 >> 0] = 20;
                              $flags$0$i$be = $flags$1$i;
                              $lastArabicPos$0$i$be = $lastArabicPos$0$i247;
                              $lastStrong$0$i$be = $lastStrong$0$i251;
                              $stackLast$0$i$be = $340;
                              $state$0$i$be = 2;
                              break L123;
                            }
                            switch ($306 | 0) {
                              case 22: {
                                $347 = ($stackLast$0$i252 | 0) < 126;
                                $$flags$111$i =
                                  $347 & (($state$0$i250 | 0) == 2)
                                    ? $flags$1$i | 1048576
                                    : $flags$1$i;
                                if (($stackLast$0$i252 | 0) <= -1) {
                                  $flags$0$i$be = $$flags$111$i;
                                  $lastArabicPos$0$i$be = $lastArabicPos$0$i247;
                                  $lastStrong$0$i$be = $lastStrong$0$i251;
                                  $stackLast$0$i$be = $stackLast$0$i252;
                                  $state$0$i$be = $state$0$i250;
                                  break L123;
                                }
                                if ($347)
                                  $state$3$i =
                                    HEAP8[
                                      ($bracketData4$i + $stackLast$0$i252) >> 0
                                    ] | 0;
                                else $state$3$i = $state$0$i250;
                                $flags$0$i$be = $$flags$111$i;
                                $lastArabicPos$0$i$be = $lastArabicPos$0$i247;
                                $lastStrong$0$i$be = $lastStrong$0$i251;
                                $stackLast$0$i$be =
                                  ($stackLast$0$i252 + -1) | 0;
                                $state$0$i$be = $state$3$i;
                                break L123;
                                break;
                              }
                              case 7:
                                break;
                              default: {
                                $flags$0$i$be = $flags$1$i;
                                $lastArabicPos$0$i$be = $lastArabicPos$0$i247;
                                $lastStrong$0$i$be = $lastStrong$0$i251;
                                $stackLast$0$i$be = $stackLast$0$i252;
                                $state$0$i$be = $state$0$i250;
                                break L123;
                              }
                            }
                            $354 = ($i$1$i12 | 0) < ($238 | 0);
                            if ((($uchar$0$i | 0) == 13) & $354)
                              if (
                                (HEAP16[($236 + ($i$1$i12 << 1)) >> 1] | 0) ==
                                10
                              ) {
                                $flags$0$i$be = $flags$1$i;
                                $lastArabicPos$0$i$be = $lastArabicPos$0$i247;
                                $lastStrong$0$i$be = $lastStrong$0$i251;
                                $stackLast$0$i$be = $stackLast$0$i252;
                                $state$0$i$be = $state$0$i250;
                                break L123;
                              }
                            $359 = HEAP32[$206 >> 2] | 0;
                            $360 = ($359 + -1) | 0;
                            $361 = HEAP32[$228 >> 2] | 0;
                            HEAP32[($361 + ($360 << 3)) >> 2] = $i$1$i12;
                            if ($364 & (($lastStrong$0$i251 << 24) >> 24 == 1))
                              HEAP32[($361 + ($360 << 3) + 4) >> 2] = 1;
                            if (HEAP32[$243 >> 2] & 4) {
                              HEAP32[$202 >> 2] = $i$1$i12;
                              HEAP32[$286 >> 2] = $controlCount$1$i;
                            }
                            if (!$354) {
                              $flags$0$i$be = $flags$1$i;
                              $lastArabicPos$0$i$be = $lastArabicPos$0$i247;
                              $lastStrong$0$i$be = $lastStrong$0$i251;
                              $stackLast$0$i$be = $stackLast$0$i252;
                              $state$0$i$be = $state$0$i250;
                              break L123;
                            }
                            $369 = ($359 + 1) | 0;
                            HEAP32[$206 >> 2] = $369;
                            do
                              if (($361 | 0) == ($284 | 0)) {
                                if (($369 | 0) < 11) break;
                                if (
                                  !(
                                    ((_ubidi_getMemory_58($224, $285, 1, 160) |
                                      0) <<
                                      24) >>
                                    24
                                  )
                                )
                                  break L111;
                                $374 = HEAP32[$224 >> 2] | 0;
                                HEAP32[$228 >> 2] = $374;
                                dest = $374;
                                src = $284;
                                stop = (dest + 80) | 0;
                                do {
                                  HEAP32[dest >> 2] = HEAP32[src >> 2];
                                  dest = (dest + 4) | 0;
                                  src = (src + 4) | 0;
                                } while ((dest | 0) < (stop | 0));
                              } else {
                                if (
                                  !(
                                    ((_ubidi_getMemory_58(
                                      $224,
                                      $285,
                                      1,
                                      $369 << 4,
                                    ) |
                                      0) <<
                                      24) >>
                                    24
                                  )
                                )
                                  break L111;
                                HEAP32[$228 >> 2] = HEAP32[$224 >> 2];
                              }
                            while (0);
                            if ($240) {
                              HEAP32[
                                ((HEAP32[$228 >> 2] | 0) +
                                  (((HEAP32[$206 >> 2] | 0) + -1) << 3) +
                                  4) >>
                                  2
                              ] = $249;
                              $flags$0$i$be = $flags$1$i;
                              $lastArabicPos$0$i$be = $lastArabicPos$0$i247;
                              $lastStrong$0$i$be = $250;
                              $stackLast$0$i$be = -1;
                              $state$0$i$be = 1;
                              break L123;
                            } else {
                              HEAP32[
                                ((HEAP32[$228 >> 2] | 0) +
                                  (((HEAP32[$206 >> 2] | 0) + -1) << 3) +
                                  4) >>
                                  2
                              ] = HEAPU8[$203 >> 0];
                              $flags$0$i$be = $flags$1$i;
                              $lastArabicPos$0$i$be = $lastArabicPos$0$i247;
                              $lastStrong$0$i$be = $lastStrong$0$i251;
                              $stackLast$0$i$be = -1;
                              $state$0$i$be = 0;
                              break L123;
                            }
                          }
                        }
                      while (0);
                      if (($i$1$i12 | 0) < ($238 | 0)) {
                        $controlCount$0$i248 = $controlCount$1$i;
                        $flags$0$i246 = $flags$0$i$be;
                        $i$0$i11249 = $i$1$i12;
                        $lastArabicPos$0$i247 = $lastArabicPos$0$i$be;
                        $lastStrong$0$i251 = $lastStrong$0$i$be;
                        $stackLast$0$i252 = $stackLast$0$i$be;
                        $state$0$i250 = $state$0$i$be;
                      } else {
                        $controlCount$0$i$lcssa = $controlCount$1$i;
                        $flags$0$i$lcssa = $flags$0$i$be;
                        $lastArabicPos$0$i$lcssa = $lastArabicPos$0$i$be;
                        $lastStrong$0$i$lcssa = $lastStrong$0$i$be;
                        $stackLast$0$i$lcssa = $stackLast$0$i$be;
                        $state$0$i$lcssa = $state$0$i$be;
                        break L110;
                      }
                    }
                    HEAP32[$pErrorCode >> 2] = 7;
                    break L1;
                  } else {
                    $controlCount$0$i$lcssa = 0;
                    $flags$0$i$lcssa = 0;
                    $lastArabicPos$0$i$lcssa = -1;
                    $lastStrong$0$i$lcssa = $lastStrong$0$ph$i;
                    $stackLast$0$i$lcssa = -1;
                    $state$0$i$lcssa = $state$0$ph$i;
                  }
                while (0);
                $390 = ($stackLast$0$i$lcssa | 0) > 125;
                $$stackLast$0$i$lcssa = $390 ? 125 : $stackLast$0$i$lcssa;
                L172: do
                  if (($$stackLast$0$i$lcssa | 0) > -1) {
                    $stackLast$1$i244 = $$stackLast$0$i$lcssa;
                    $state$5$i243 = $390 ? 2 : $state$0$i$lcssa;
                    while (1) {
                      if (($state$5$i243 | 0) == 2) break;
                      $state$5$i243 =
                        HEAP8[($bracketData4$i + $stackLast$1$i244) >> 0] | 0;
                      if (($stackLast$1$i244 | 0) <= 0) {
                        $flags$7$i = $flags$0$i$lcssa;
                        break L172;
                      } else $stackLast$1$i244 = ($stackLast$1$i244 + -1) | 0;
                    }
                    $flags$7$i = $flags$0$i$lcssa | 1048576;
                  } else $flags$7$i = $flags$0$i$lcssa;
                while (0);
                if (!(HEAP32[$243 >> 2] & 4)) {
                  HEAP32[
                    ((HEAP32[$228 >> 2] | 0) +
                      (((HEAP32[$206 >> 2] | 0) + -1) << 3)) >>
                      2
                  ] = $238;
                  HEAP32[$286 >> 2] = $controlCount$0$i$lcssa;
                } else if ((HEAP32[$202 >> 2] | 0) < ($238 | 0))
                  HEAP32[$206 >> 2] = (HEAP32[$206 >> 2] | 0) + -1;
                if ($364 & (($lastStrong$0$i$lcssa << 24) >> 24 == 1))
                  HEAP32[
                    ((HEAP32[$228 >> 2] | 0) +
                      (((HEAP32[$206 >> 2] | 0) + -1) << 3) +
                      4) >>
                      2
                  ] = 1;
                if ($240)
                  HEAP8[$203 >> 0] = HEAP32[((HEAP32[$228 >> 2] | 0) + 4) >> 2];
                $419 = HEAP32[$206 >> 2] | 0;
                if (($419 | 0) > 0) {
                  $421 = HEAP32[$228 >> 2] | 0;
                  $flags$8$i238 = $flags$7$i;
                  $i$2$i15239 = 0;
                  while (1) {
                    $427 =
                      HEAP32[
                        (104 +
                          ((HEAP32[($421 + ($i$2$i15239 << 3) + 4) >> 2] & 1) <<
                            2)) >>
                          2
                      ] | $flags$8$i238;
                    $i$2$i15239 = ($i$2$i15239 + 1) | 0;
                    if (($i$2$i15239 | 0) == ($419 | 0)) {
                      $flags$8$i$lcssa = $427;
                      break;
                    } else $flags$8$i238 = $427;
                  }
                } else $flags$8$i$lcssa = $flags$7$i;
                $429 = ($pBiDi + 96) | 0;
                $437 = ($pBiDi + 124) | 0;
                HEAP32[$437 >> 2] =
                  ((((HEAP8[$429 >> 0] | 0) == 0) |
                    ((($flags$8$i$lcssa >>> 7) & 1) ^ 1)) ^
                    1) |
                  $flags$8$i$lcssa;
                HEAP32[($pBiDi + 128) >> 2] = $lastArabicPos$0$i$lcssa;
                $439 = HEAP32[$207 >> 2] | 0;
                $440 = HEAP32[$202 >> 2] | 0;
                $441 = ($pBiDi + 132) | 0;
                HEAP32[$441 >> 2] = $440;
                $442 = ($pBiDi + 52) | 0;
                if (
                  !(
                    ((_ubidi_getMemory_58(
                      $442,
                      ($pBiDi + 28) | 0,
                      HEAP8[$231 >> 0] | 0,
                      $440,
                    ) |
                      0) <<
                      24) >>
                    24
                  )
                ) {
                  HEAP32[$pErrorCode >> 2] = 7;
                  break;
                }
                $447 = HEAP32[$442 >> 2] | 0;
                HEAP32[$208 >> 2] = $447;
                $448 = HEAP32[$207 >> 2] | 0;
                $$cast = $447;
                $449 = HEAP32[$199 >> 2] | 0;
                $450 = HEAP32[$202 >> 2] | 0;
                $451 = HEAP32[$437 >> 2] | 0;
                do
                  if (!(HEAP8[$214 >> 0] | 0)) label = 143;
                  else {
                    $454 = HEAP32[$228 >> 2] | 0;
                    if ((HEAP32[$454 >> 2] | 0) > 0) {
                      label = 143;
                      break;
                    }
                    $$sink$i16 =
                      _ubidi_getParaLevelAtIndex_58(
                        HEAP32[$206 >> 2] | 0,
                        $454,
                        0,
                      ) | 0;
                  }
                while (0);
                if ((label | 0) == 143) $$sink$i16 = HEAP8[$203 >> 0] | 0;
                $459 = ($pBiDi + 244) | 0;
                HEAP32[$459 >> 2] = 0;
                if ((HEAP32[$pErrorCode >> 2] | 0) > 0) break;
                $462 = _directionFromFlags($451) | 0;
                L205: do
                  if (($462 | 0) == 2) {
                    if ((HEAP32[$16 >> 2] | 0) >>> 0 > 1) {
                      $466 = HEAP32[$206 >> 2] | 0;
                      if (($466 | 0) > 0) {
                        $938 = $466;
                        $paraIndex$0$i206 = 0;
                      } else {
                        $$ph = 2;
                        break;
                      }
                      while (1) {
                        if (!$paraIndex$0$i206) {
                          $474 = HEAP32[$228 >> 2] | 0;
                          $start$0$i = 0;
                        } else {
                          $470 = HEAP32[$228 >> 2] | 0;
                          $474 = $470;
                          $start$0$i =
                            HEAP32[
                              ($470 + (($paraIndex$0$i206 + -1) << 3)) >> 2
                            ] | 0;
                        }
                        $475 =
                          HEAP32[($474 + ($paraIndex$0$i206 << 3)) >> 2] | 0;
                        if (($475 | 0) > ($start$0$i | 0)) {
                          _memset(
                            ($$cast + $start$0$i) | 0,
                            (HEAP32[
                              ($474 + ($paraIndex$0$i206 << 3) + 4) >> 2
                            ] &
                              255) |
                              0,
                            ($475 - $start$0$i) | 0,
                          ) | 0;
                          $483 = HEAP32[$206 >> 2] | 0;
                        } else $483 = $938;
                        $paraIndex$0$i206 = ($paraIndex$0$i206 + 1) | 0;
                        if (($paraIndex$0$i206 | 0) >= ($483 | 0)) {
                          $$ph = 2;
                          break L205;
                        } else $938 = $483;
                      }
                    }
                    if (!($451 & 7985152)) {
                      _bracketInit($pBiDi, $bracketData$i);
                      $486 = ($bracketData$i + 492) | 0;
                      $487 = ($bracketData$i + 502) | 0;
                      $488 = ($bracketData$i + 504) | 0;
                      $489 = ($bracketData$i + 508) | 0;
                      $490 = ($bracketData$i + 506) | 0;
                      $491 = ($bracketData$i + 505) | 0;
                      $492 = ($bracketData$i + 496) | 0;
                      $493 = HEAP32[$206 >> 2] | 0;
                      L221: do
                        if (($493 | 0) > 0) {
                          $939 = $493;
                          $paraIndex1$0$i212 = 0;
                          L222: while (1) {
                            if (!$paraIndex1$0$i212) {
                              $501 = HEAP32[$228 >> 2] | 0;
                              $start2$0$i = 0;
                            } else {
                              $497 = HEAP32[$228 >> 2] | 0;
                              $501 = $497;
                              $start2$0$i =
                                HEAP32[
                                  ($497 + (($paraIndex1$0$i212 + -1) << 3)) >> 2
                                ] | 0;
                            }
                            $502 =
                              HEAP32[($501 + ($paraIndex1$0$i212 << 3)) >> 2] |
                              0;
                            $504 =
                              HEAP32[
                                ($501 + ($paraIndex1$0$i212 << 3) + 4) >> 2
                              ] | 0;
                            $505 = $504 & 255;
                            $506 = $504 & 1;
                            $507 = $506 & 255;
                            if (($start2$0$i | 0) < ($502 | 0)) {
                              $i$1$i19208 = $start2$0$i;
                              do {
                                HEAP8[($$cast + $i$1$i19208) >> 0] = $505;
                                L231: do
                                  switch (
                                    HEAP8[($448 + $i$1$i19208) >> 0] | 0
                                  ) {
                                    case 18:
                                      break;
                                    case 7: {
                                      $512 = ($i$1$i19208 + 1) | 0;
                                      if (($512 | 0) >= ($450 | 0)) break L231;
                                      if (
                                        (HEAP16[
                                          ($449 + ($i$1$i19208 << 1)) >> 1
                                        ] |
                                          0) ==
                                        13
                                      )
                                        if (
                                          (HEAP16[($449 + ($512 << 1)) >> 1] |
                                            0) ==
                                          10
                                        )
                                          break L231;
                                      HEAP32[$486 >> 2] = 0;
                                      HEAP16[$487 >> 1] = 0;
                                      HEAP8[$488 >> 0] = $505;
                                      HEAP32[$489 >> 2] = $506;
                                      HEAP8[$490 >> 0] = $507;
                                      HEAP8[$491 >> 0] = $507;
                                      HEAP32[$492 >> 2] = 0;
                                      break;
                                    }
                                    default:
                                      if (
                                        !(
                                          ((_bracketProcessChar(
                                            $bracketData$i,
                                            $i$1$i19208,
                                          ) |
                                            0) <<
                                            24) >>
                                          24
                                        )
                                      )
                                        break L222;
                                  }
                                while (0);
                                $i$1$i19208 = ($i$1$i19208 + 1) | 0;
                              } while (($i$1$i19208 | 0) < ($502 | 0));
                              $526 = HEAP32[$206 >> 2] | 0;
                            } else $526 = $939;
                            $paraIndex1$0$i212 = ($paraIndex1$0$i212 + 1) | 0;
                            if (($paraIndex1$0$i212 | 0) >= ($526 | 0)) {
                              $$010$i = 2;
                              break L221;
                            } else $939 = $526;
                          }
                          HEAP32[$pErrorCode >> 2] = 7;
                          $$010$i = 0;
                        } else $$010$i = 2;
                      while (0);
                      $$ph = $$010$i;
                      break;
                    }
                    _bracketInit($pBiDi, $bracketData4$i);
                    HEAP16[$bracketData$i >> 1] = $$sink$i16 & 255;
                    $528 = ($bracketData4$i + 492) | 0;
                    $529 = ($bracketData4$i + 502) | 0;
                    $530 = ($bracketData4$i + 504) | 0;
                    $531 = ($bracketData4$i + 508) | 0;
                    $532 = ($bracketData4$i + 506) | 0;
                    $533 = ($bracketData4$i + 505) | 0;
                    $534 = ($bracketData4$i + 496) | 0;
                    L244: do
                      if (($450 | 0) > 0) {
                        $embeddingLevel$0$i219 = $$sink$i16;
                        $flags$0$i20215 = 0;
                        $i$2$i21216 = 0;
                        $lastCcPos$0$i221 = 0;
                        $overflowEmbeddingCount$0$i224 = 0;
                        $overflowIsolateCount$0$i223 = 0;
                        $previousLevel$0$i220 = $$sink$i16;
                        $stackLast$0$i22222 = 0;
                        $validIsolateCount$0$i225 = 0;
                        while (1) {
                          $536 = ($448 + $i$2$i21216) | 0;
                          $537 = HEAP8[$536 >> 0] | 0;
                          $538 = $537 & 255;
                          L247: do
                            switch ($538 | 0) {
                              case 15:
                              case 12:
                              case 14:
                              case 11: {
                                $539 = $flags$0$i20215 | 262144;
                                HEAP8[($$cast + $i$2$i21216) >> 0] =
                                  $previousLevel$0$i220;
                                $541 = $embeddingLevel$0$i219 & 255;
                                if ((($537 + -11) & 255) < 2)
                                  $newLevel$0$in$i = ($541 + 2) & 382;
                                else $newLevel$0$in$i = (($541 & 127) + 1) | 1;
                                $547 = $newLevel$0$in$i & 255;
                                if (
                                  !(
                                    (($overflowIsolateCount$0$i223 |
                                      $overflowEmbeddingCount$0$i224 |
                                      0) ==
                                      0) &
                                    ($547 >>> 0 < 126)
                                  )
                                ) {
                                  $embeddingLevel$2$i = $embeddingLevel$0$i219;
                                  $flags$5$i26 = $539;
                                  $lastCcPos$2$i = $lastCcPos$0$i221;
                                  $overflowEmbeddingCount$2$i =
                                    (((($overflowIsolateCount$0$i223 | 0) ==
                                      0) &
                                      1) +
                                      $overflowEmbeddingCount$0$i224) |
                                    0;

                                  $overflowIsolateCount$2$i =
                                    $overflowIsolateCount$0$i223;
                                  $previousLevel$1$i = $previousLevel$0$i220;
                                  $stackLast$3$i = $stackLast$0$i22222;
                                  $validIsolateCount$2$i =
                                    $validIsolateCount$0$i225;
                                  break L247;
                                }
                                switch (($537 << 24) >> 24) {
                                  case 15:
                                  case 12: {
                                    $embeddingLevel$1$in$i = $547 | 128;
                                    break;
                                  }
                                  default:
                                    $embeddingLevel$1$in$i = $newLevel$0$in$i;
                                }
                                $553 = ($stackLast$0$i22222 + 1) | 0;
                                HEAP16[($bracketData$i + ($553 << 1)) >> 1] =
                                  $embeddingLevel$1$in$i & 255;
                                $embeddingLevel$2$i =
                                  $embeddingLevel$1$in$i & 255;
                                $flags$5$i26 = $539;
                                $lastCcPos$2$i = $i$2$i21216;
                                $overflowEmbeddingCount$2$i =
                                  $overflowEmbeddingCount$0$i224;
                                $overflowIsolateCount$2$i =
                                  $overflowIsolateCount$0$i223;
                                $previousLevel$1$i = $previousLevel$0$i220;
                                $stackLast$3$i = $553;
                                $validIsolateCount$2$i =
                                  $validIsolateCount$0$i225;
                                break;
                              }
                              case 16: {
                                $559 = $flags$0$i20215 | 262144;
                                HEAP8[($$cast + $i$2$i21216) >> 0] =
                                  $previousLevel$0$i220;
                                if ($overflowIsolateCount$0$i223) {
                                  $embeddingLevel$2$i = $embeddingLevel$0$i219;
                                  $flags$5$i26 = $559;
                                  $lastCcPos$2$i = $lastCcPos$0$i221;
                                  $overflowEmbeddingCount$2$i =
                                    $overflowEmbeddingCount$0$i224;
                                  $overflowIsolateCount$2$i =
                                    $overflowIsolateCount$0$i223;
                                  $previousLevel$1$i = $previousLevel$0$i220;
                                  $stackLast$3$i = $stackLast$0$i22222;
                                  $validIsolateCount$2$i =
                                    $validIsolateCount$0$i225;
                                  break L247;
                                }
                                if ($overflowEmbeddingCount$0$i224) {
                                  $embeddingLevel$2$i = $embeddingLevel$0$i219;
                                  $flags$5$i26 = $559;
                                  $lastCcPos$2$i = $lastCcPos$0$i221;
                                  $overflowEmbeddingCount$2$i =
                                    ($overflowEmbeddingCount$0$i224 + -1) | 0;
                                  $overflowIsolateCount$2$i = 0;
                                  $previousLevel$1$i = $previousLevel$0$i220;
                                  $stackLast$3$i = $stackLast$0$i22222;
                                  $validIsolateCount$2$i =
                                    $validIsolateCount$0$i225;
                                  break L247;
                                }
                                if (!$stackLast$0$i22222) {
                                  $embeddingLevel$2$i = $embeddingLevel$0$i219;
                                  $flags$5$i26 = $559;
                                  $lastCcPos$2$i = $lastCcPos$0$i221;
                                  $overflowEmbeddingCount$2$i = 0;
                                  $overflowIsolateCount$2$i = 0;
                                  $previousLevel$1$i = $previousLevel$0$i220;
                                  $stackLast$3$i = 0;
                                  $validIsolateCount$2$i =
                                    $validIsolateCount$0$i225;
                                  break L247;
                                }
                                if (
                                  (HEAPU16[
                                    ($bracketData$i +
                                      ($stackLast$0$i22222 << 1)) >>
                                      1
                                  ] |
                                    0) >=
                                  256
                                ) {
                                  $embeddingLevel$2$i = $embeddingLevel$0$i219;
                                  $flags$5$i26 = $559;
                                  $lastCcPos$2$i = $lastCcPos$0$i221;
                                  $overflowEmbeddingCount$2$i = 0;
                                  $overflowIsolateCount$2$i = 0;
                                  $previousLevel$1$i = $previousLevel$0$i220;
                                  $stackLast$3$i = $stackLast$0$i22222;
                                  $validIsolateCount$2$i =
                                    $validIsolateCount$0$i225;
                                  break L247;
                                }
                                $568 = ($stackLast$0$i22222 + -1) | 0;
                                $embeddingLevel$2$i =
                                  HEAP16[($bracketData$i + ($568 << 1)) >> 1] &
                                  255;
                                $flags$5$i26 = $559;
                                $lastCcPos$2$i = $i$2$i21216;
                                $overflowEmbeddingCount$2$i = 0;
                                $overflowIsolateCount$2$i = 0;
                                $previousLevel$1$i = $previousLevel$0$i220;
                                $stackLast$3$i = $568;
                                $validIsolateCount$2$i =
                                  $validIsolateCount$0$i225;
                                break;
                              }
                              case 21:
                              case 20: {
                                $572 = $embeddingLevel$0$i219 & 255;
                                $576 =
                                  HEAP32[(104 + (($572 & 1) << 2)) >> 2] |
                                  $flags$0$i20215;
                                $578 = $572 & 127;
                                HEAP8[($$cast + $i$2$i21216) >> 0] = $578;
                                if (
                                  ($578 | 0) ==
                                  (($previousLevel$0$i220 & 127) | 0)
                                )
                                  $flags$1$i24 = $576 | 1024;
                                else {
                                  _bracketProcessBoundary(
                                    $bracketData4$i,
                                    $lastCcPos$0$i221,
                                    $previousLevel$0$i220,
                                    $embeddingLevel$0$i219,
                                  );
                                  $flags$1$i24 = $576 | -2147482624;
                                }
                                $newLevel$1$in$i =
                                  ($537 << 24) >> 24 == 20
                                    ? ($572 + 2) & 382
                                    : ($578 + 1) | 1;
                                $newLevel$1$i = $newLevel$1$in$i & 255;
                                if (
                                  !(
                                    (($overflowIsolateCount$0$i223 |
                                      $overflowEmbeddingCount$0$i224 |
                                      0) ==
                                      0) &
                                    (($newLevel$1$in$i & 254) >>> 0 < 126)
                                  )
                                ) {
                                  HEAP8[$536 >> 0] = 9;
                                  $embeddingLevel$2$i = $embeddingLevel$0$i219;
                                  $flags$5$i26 = $flags$1$i24;
                                  $lastCcPos$2$i = $lastCcPos$0$i221;
                                  $overflowEmbeddingCount$2$i =
                                    $overflowEmbeddingCount$0$i224;
                                  $overflowIsolateCount$2$i =
                                    ($overflowIsolateCount$0$i223 + 1) | 0;
                                  $previousLevel$1$i = $embeddingLevel$0$i219;
                                  $stackLast$3$i = $stackLast$0$i22222;
                                  $validIsolateCount$2$i =
                                    $validIsolateCount$0$i225;
                                  break L247;
                                }
                                $597 = ($validIsolateCount$0$i225 + 1) | 0;
                                if (
                                  ($validIsolateCount$0$i225 | 0) >=
                                  (HEAP32[$459 >> 2] | 0)
                                )
                                  HEAP32[$459 >> 2] = $597;
                                $600 = ($stackLast$0$i22222 + 1) | 0;
                                HEAP16[($bracketData$i + ($600 << 1)) >> 1] =
                                  $newLevel$1$in$i | 256;
                                $604 = HEAP32[$528 >> 2] | 0;
                                HEAP8[
                                  ($bracketData4$i + 496 + ($604 << 4) + 10) >>
                                    0
                                ] = 10;
                                $607 =
                                  HEAP16[
                                    ($bracketData4$i + 496 + ($604 << 4) + 6) >>
                                      1
                                  ] | 0;
                                $608 = ($604 + 1) | 0;
                                HEAP32[$528 >> 2] = $608;
                                HEAP16[
                                  ($bracketData4$i + 496 + ($608 << 4) + 6) >> 1
                                ] = $607;
                                HEAP16[
                                  ($bracketData4$i + 496 + ($608 << 4) + 4) >> 1
                                ] = $607;
                                HEAP8[
                                  ($bracketData4$i + 496 + ($608 << 4) + 8) >> 0
                                ] = $newLevel$1$i;
                                $612 = $newLevel$1$in$i & 1;
                                HEAP32[
                                  ($bracketData4$i + 496 + ($608 << 4) + 12) >>
                                    2
                                ] = $612;
                                $614 = $612 & 255;
                                HEAP8[
                                  ($bracketData4$i + 496 + ($608 << 4) + 10) >>
                                    0
                                ] = $614;
                                HEAP8[
                                  ($bracketData4$i + 496 + ($608 << 4) + 9) >> 0
                                ] = $614;
                                HEAP32[
                                  ($bracketData4$i + 496 + ($608 << 4)) >> 2
                                ] = 0;
                                $embeddingLevel$2$i = $newLevel$1$i;
                                $flags$5$i26 = $flags$1$i24 | (1 << $538);
                                $lastCcPos$2$i = $i$2$i21216;
                                $overflowEmbeddingCount$2$i =
                                  $overflowEmbeddingCount$0$i224;
                                $overflowIsolateCount$2$i =
                                  $overflowIsolateCount$0$i223;
                                $previousLevel$1$i = $embeddingLevel$0$i219;
                                $stackLast$3$i = $600;
                                $validIsolateCount$2$i = $597;
                                break;
                              }
                              case 22: {
                                if (
                                  !(
                                    ($embeddingLevel$0$i219 ^
                                      $previousLevel$0$i220) &
                                    127
                                  )
                                )
                                  $flags$2$i = $flags$0$i20215;
                                else {
                                  _bracketProcessBoundary(
                                    $bracketData4$i,
                                    $lastCcPos$0$i221,
                                    $previousLevel$0$i220,
                                    $embeddingLevel$0$i219,
                                  );
                                  $flags$2$i = $flags$0$i20215 | -2147483648;
                                }
                                do
                                  if (!$overflowIsolateCount$0$i223) {
                                    if (!$validIsolateCount$0$i225) {
                                      HEAP8[$536 >> 0] = 9;
                                      $flags$3$i = $flags$2$i;
                                      $lastCcPos$1$i = $lastCcPos$0$i221;
                                      $overflowEmbeddingCount$1$i =
                                        $overflowEmbeddingCount$0$i224;
                                      $overflowIsolateCount$1$i = 0;
                                      $stackLast$2$i = $stackLast$0$i22222;
                                      $validIsolateCount$1$i = 0;
                                      break;
                                    } else
                                      $stackLast$1$i25 = $stackLast$0$i22222;
                                    do {
                                      $stackLast$1$i25$looptemp =
                                        $stackLast$1$i25;
                                      $stackLast$1$i25 =
                                        ($stackLast$1$i25 + -1) | 0;
                                    } while (
                                      (HEAPU16[
                                        ($bracketData$i +
                                          ($stackLast$1$i25$looptemp << 1)) >>
                                          1
                                      ] |
                                        0) <
                                      256
                                    );
                                    $633 = ((HEAP32[$528 >> 2] | 0) + -1) | 0;
                                    HEAP32[$528 >> 2] = $633;
                                    HEAP8[
                                      ($bracketData4$i +
                                        496 +
                                        ($633 << 4) +
                                        10) >>
                                        0
                                    ] = 10;
                                    $flags$3$i = $flags$2$i | 4194304;
                                    $lastCcPos$1$i = $i$2$i21216;
                                    $overflowEmbeddingCount$1$i = 0;
                                    $overflowIsolateCount$1$i = 0;
                                    $stackLast$2$i = $stackLast$1$i25;
                                    $validIsolateCount$1$i =
                                      ($validIsolateCount$0$i225 + -1) | 0;
                                  } else {
                                    HEAP8[$536 >> 0] = 9;
                                    $flags$3$i = $flags$2$i;
                                    $lastCcPos$1$i = $lastCcPos$0$i221;
                                    $overflowEmbeddingCount$1$i =
                                      $overflowEmbeddingCount$0$i224;
                                    $overflowIsolateCount$1$i =
                                      ($overflowIsolateCount$0$i223 + -1) | 0;
                                    $stackLast$2$i = $stackLast$0$i22222;
                                    $validIsolateCount$1$i =
                                      $validIsolateCount$0$i225;
                                  }
                                while (0);
                                $636 =
                                  HEAP16[
                                    ($bracketData$i + ($stackLast$2$i << 1)) >>
                                      1
                                  ] | 0;
                                $637 = $636 & 255;
                                $638 = $636 & 255;
                                $643 =
                                  $flags$3$i |
                                  HEAP32[(104 + (($638 & 1) << 2)) >> 2] |
                                  1024;
                                HEAP8[($$cast + $i$2$i21216) >> 0] = $638 & 127;
                                $embeddingLevel$2$i = $637;
                                $flags$5$i26 = $643;
                                $lastCcPos$2$i = $lastCcPos$1$i;
                                $overflowEmbeddingCount$2$i =
                                  $overflowEmbeddingCount$1$i;
                                $overflowIsolateCount$2$i =
                                  $overflowIsolateCount$1$i;
                                $previousLevel$1$i = $637;
                                $stackLast$3$i = $stackLast$2$i;
                                $validIsolateCount$2$i = $validIsolateCount$1$i;
                                break;
                              }
                              case 7: {
                                $647 = $flags$0$i20215 | 128;
                                do
                                  if (!(HEAP8[$214 >> 0] | 0)) label = 206;
                                  else {
                                    $650 = HEAP32[$228 >> 2] | 0;
                                    if (
                                      ($i$2$i21216 | 0) <
                                      (HEAP32[$650 >> 2] | 0)
                                    ) {
                                      label = 206;
                                      break;
                                    }
                                    $$sink8$i =
                                      _ubidi_getParaLevelAtIndex_58(
                                        HEAP32[$206 >> 2] | 0,
                                        $650,
                                        $i$2$i21216,
                                      ) | 0;
                                  }
                                while (0);
                                if ((label | 0) == 206) {
                                  label = 0;
                                  $$sink8$i = HEAP8[$203 >> 0] | 0;
                                }
                                HEAP8[($$cast + $i$2$i21216) >> 0] = $$sink8$i;
                                $656 = ($i$2$i21216 + 1) | 0;
                                if (($656 | 0) >= ($450 | 0)) {
                                  $embeddingLevel$2$i = $embeddingLevel$0$i219;
                                  $flags$5$i26 = $647;
                                  $lastCcPos$2$i = $lastCcPos$0$i221;
                                  $overflowEmbeddingCount$2$i =
                                    $overflowEmbeddingCount$0$i224;
                                  $overflowIsolateCount$2$i =
                                    $overflowIsolateCount$0$i223;
                                  $previousLevel$1$i = $previousLevel$0$i220;
                                  $stackLast$3$i = $stackLast$0$i22222;
                                  $validIsolateCount$2$i =
                                    $validIsolateCount$0$i225;
                                  break L247;
                                }
                                if (
                                  (HEAP16[($449 + ($i$2$i21216 << 1)) >> 1] |
                                    0) ==
                                  13
                                )
                                  if (
                                    (HEAP16[($449 + ($656 << 1)) >> 1] | 0) ==
                                    10
                                  ) {
                                    $embeddingLevel$2$i =
                                      $embeddingLevel$0$i219;
                                    $flags$5$i26 = $647;
                                    $lastCcPos$2$i = $lastCcPos$0$i221;
                                    $overflowEmbeddingCount$2$i =
                                      $overflowEmbeddingCount$0$i224;
                                    $overflowIsolateCount$2$i =
                                      $overflowIsolateCount$0$i223;
                                    $previousLevel$1$i = $previousLevel$0$i220;
                                    $stackLast$3$i = $stackLast$0$i22222;
                                    $validIsolateCount$2$i =
                                      $validIsolateCount$0$i225;
                                    break L247;
                                  }
                                do
                                  if (!(HEAP8[$214 >> 0] | 0)) label = 213;
                                  else {
                                    $666 = HEAP32[$228 >> 2] | 0;
                                    if (($656 | 0) < (HEAP32[$666 >> 2] | 0)) {
                                      label = 213;
                                      break;
                                    }
                                    $$sink9$i =
                                      _ubidi_getParaLevelAtIndex_58(
                                        HEAP32[$206 >> 2] | 0,
                                        $666,
                                        $656,
                                      ) | 0;
                                  }
                                while (0);
                                if ((label | 0) == 213) {
                                  label = 0;
                                  $$sink9$i = HEAP8[$203 >> 0] | 0;
                                }
                                HEAP16[$bracketData$i >> 1] = $$sink9$i & 255;
                                HEAP32[$528 >> 2] = 0;
                                HEAP16[$529 >> 1] = 0;
                                HEAP8[$530 >> 0] = $$sink9$i;
                                $673 = $$sink9$i & 1;
                                HEAP32[$531 >> 2] = $673;
                                $674 = $673 & 255;
                                HEAP8[$532 >> 0] = $674;
                                HEAP8[$533 >> 0] = $674;
                                HEAP32[$534 >> 2] = 0;
                                $embeddingLevel$2$i = $$sink9$i;
                                $flags$5$i26 = $647;
                                $lastCcPos$2$i = $lastCcPos$0$i221;
                                $overflowEmbeddingCount$2$i = 0;
                                $overflowIsolateCount$2$i = 0;
                                $previousLevel$1$i = $$sink9$i;
                                $stackLast$3$i = 0;
                                $validIsolateCount$2$i = 0;
                                break;
                              }
                              case 18: {
                                HEAP8[($$cast + $i$2$i21216) >> 0] =
                                  $previousLevel$0$i220;
                                $embeddingLevel$2$i = $embeddingLevel$0$i219;
                                $flags$5$i26 = $flags$0$i20215 | 262144;
                                $lastCcPos$2$i = $lastCcPos$0$i221;
                                $overflowEmbeddingCount$2$i =
                                  $overflowEmbeddingCount$0$i224;
                                $overflowIsolateCount$2$i =
                                  $overflowIsolateCount$0$i223;
                                $previousLevel$1$i = $previousLevel$0$i220;
                                $stackLast$3$i = $stackLast$0$i22222;
                                $validIsolateCount$2$i =
                                  $validIsolateCount$0$i225;
                                break;
                              }
                              default: {
                                $677 = $embeddingLevel$0$i219 & 255;
                                do
                                  if (
                                    !(
                                      ($embeddingLevel$0$i219 ^
                                        $previousLevel$0$i220) &
                                      127
                                    )
                                  )
                                    $flags$4$i = $flags$0$i20215;
                                  else {
                                    _bracketProcessBoundary(
                                      $bracketData4$i,
                                      $lastCcPos$0$i221,
                                      $previousLevel$0$i220,
                                      $embeddingLevel$0$i219,
                                    );
                                    $681 = $flags$0$i20215 | -2147483648;
                                    $684 = $677 & 1;
                                    if (!($677 & 128)) {
                                      $flags$4$i =
                                        HEAP32[(120 + ($684 << 2)) >> 2] | $681;
                                      break;
                                    } else {
                                      $flags$4$i =
                                        HEAP32[(112 + ($684 << 2)) >> 2] | $681;
                                      break;
                                    }
                                  }
                                while (0);
                                HEAP8[($$cast + $i$2$i21216) >> 0] =
                                  $embeddingLevel$0$i219;
                                if (
                                  !(
                                    ((_bracketProcessChar(
                                      $bracketData4$i,
                                      $i$2$i21216,
                                    ) |
                                      0) <<
                                      24) >>
                                    24
                                  )
                                ) {
                                  $$0$i29 = -1;
                                  break L244;
                                }
                                $embeddingLevel$2$i = $embeddingLevel$0$i219;
                                $flags$5$i26 =
                                  (1 << HEAPU8[$536 >> 0]) | $flags$4$i;
                                $lastCcPos$2$i = $lastCcPos$0$i221;
                                $overflowEmbeddingCount$2$i =
                                  $overflowEmbeddingCount$0$i224;
                                $overflowIsolateCount$2$i =
                                  $overflowIsolateCount$0$i223;
                                $previousLevel$1$i = $embeddingLevel$0$i219;
                                $stackLast$3$i = $stackLast$0$i22222;
                                $validIsolateCount$2$i =
                                  $validIsolateCount$0$i225;
                              }
                            }
                          while (0);
                          $i$2$i21216 = ($i$2$i21216 + 1) | 0;
                          if (($i$2$i21216 | 0) >= ($450 | 0)) break;
                          else {
                            $embeddingLevel$0$i219 = $embeddingLevel$2$i;
                            $flags$0$i20215 = $flags$5$i26;
                            $lastCcPos$0$i221 = $lastCcPos$2$i;
                            $overflowEmbeddingCount$0$i224 =
                              $overflowEmbeddingCount$2$i;
                            $overflowIsolateCount$0$i223 =
                              $overflowIsolateCount$2$i;
                            $previousLevel$0$i220 = $previousLevel$1$i;
                            $stackLast$0$i22222 = $stackLast$3$i;
                            $validIsolateCount$0$i225 = $validIsolateCount$2$i;
                          }
                        }
                        if (!($flags$5$i26 & 8380376)) {
                          $flags$6$i = $flags$5$i26;
                          label = 226;
                          break;
                        }
                        $flags$6$i =
                          HEAP32[(104 + ((HEAPU8[$203 >> 0] & 1) << 2)) >> 2] |
                          $flags$5$i26;
                        label = 226;
                      } else {
                        $flags$6$i = 0;
                        label = 226;
                      }
                    while (0);
                    if ((label | 0) == 226) {
                      $flags$7$i28 =
                        ((((HEAP8[$429 >> 0] | 0) == 0) |
                          ((($flags$6$i >>> 7) & 1) ^ 1)) ^
                          1) |
                        $flags$6$i;
                      HEAP32[$437 >> 2] = $flags$7$i28;
                      $$0$i29 = _directionFromFlags($flags$7$i28) | 0;
                    }
                    $$ph = $$0$i29;
                  } else $$ph = $462;
                while (0);
                if ((HEAP32[$pErrorCode >> 2] | 0) > 0) break;
                $$pre = HEAP32[$459 >> 2] | 0;
                do
                  if (($$pre | 0) < 6)
                    HEAP32[($pBiDi + 248) >> 2] = $pBiDi + 252;
                  else {
                    $720 = $$pre << 4;
                    $721 = ($pBiDi + 44) | 0;
                    $724 = ($pBiDi + 68) | 0;
                    if (($720 | 0) <= (HEAP32[$721 >> 2] | 0)) {
                      HEAP32[($pBiDi + 248) >> 2] = HEAP32[$724 >> 2];
                      break;
                    }
                    if (
                      !(
                        ((_ubidi_getMemory_58($724, $721, 1, $720) | 0) <<
                          24) >>
                        24
                      )
                    ) {
                      HEAP32[$pErrorCode >> 2] = 7;
                      break L1;
                    } else {
                      HEAP32[($pBiDi + 248) >> 2] = HEAP32[$724 >> 2];
                      break;
                    }
                  }
                while (0);
                HEAP32[$459 >> 2] = -1;
                HEAP32[$205 >> 2] = $$ph;
                L333: do
                  switch ($$ph | 0) {
                    case 0: {
                      HEAP32[$441 >> 2] = 0;
                      break;
                    }
                    case 1: {
                      HEAP32[$441 >> 2] = 0;
                      break;
                    }
                    default: {
                      L335: do
                        switch (HEAP32[$16 >> 2] | 0) {
                          case 0: {
                            HEAP32[($pBiDi + 116) >> 2] = 128;
                            break;
                          }
                          case 1: {
                            HEAP32[($pBiDi + 116) >> 2] = 144;
                            break;
                          }
                          case 2: {
                            HEAP32[($pBiDi + 116) >> 2] = 160;
                            break;
                          }
                          case 4: {
                            HEAP32[($pBiDi + 116) >> 2] = 176;
                            break;
                          }
                          case 5: {
                            $739 = ($pBiDi + 116) | 0;
                            if (!(HEAP32[$243 >> 2] & 1)) {
                              HEAP32[$739 >> 2] = 208;
                              break L335;
                            } else {
                              HEAP32[$739 >> 2] = 192;
                              break L335;
                            }
                            break;
                          }
                          case 6: {
                            $743 = ($pBiDi + 116) | 0;
                            if (!(HEAP32[$243 >> 2] & 1)) {
                              HEAP32[$743 >> 2] = 240;
                              break L335;
                            } else {
                              HEAP32[$743 >> 2] = 224;
                              break L335;
                            }
                            break;
                          }
                          default: {
                          }
                        }
                      while (0);
                      $744 = HEAP32[$206 >> 2] | 0;
                      do
                        if (($744 | 0) < 2) {
                          if ((HEAP32[$437 >> 2] | 0) < 0) {
                            label = 262;
                            break;
                          }
                          do
                            if (!(HEAP8[$214 >> 0] | 0)) {
                              $750 = HEAP8[$203 >> 0] | 0;
                              $$sink4 = $750;
                              $768 = $750 & 1;
                            } else {
                              $754 = HEAP32[$228 >> 2] | 0;
                              $755 = HEAP32[$754 >> 2] | 0;
                              if (($755 | 0) > 0) $$sink = HEAP8[$203 >> 0] | 0;
                              else
                                $$sink =
                                  _ubidi_getParaLevelAtIndex_58($744, $754, 0) |
                                  0;
                              $761 = $$sink & 1;
                              if (($440 | 0) > ($755 | 0)) {
                                $$sink4 =
                                  _ubidi_getParaLevelAtIndex_58(
                                    $744,
                                    $754,
                                    ($440 + -1) | 0,
                                  ) | 0;
                                $768 = $761;
                                break;
                              } else {
                                $$sink4 = HEAP8[$203 >> 0] | 0;
                                $768 = $761;
                                break;
                              }
                            }
                          while (0);
                          _resolveImplicitLevels(
                            $pBiDi,
                            0,
                            $440,
                            $768,
                            $$sink4 & 1,
                          );
                        } else label = 262;
                      while (0);
                      if ((label | 0) == 262) {
                        $769 = HEAP32[$208 >> 2] | 0;
                        do
                          if (!(HEAP8[$214 >> 0] | 0)) label = 264;
                          else {
                            $772 = HEAP32[$228 >> 2] | 0;
                            if ((HEAP32[$772 >> 2] | 0) > 0) {
                              label = 264;
                              break;
                            }
                            $$sink5 =
                              _ubidi_getParaLevelAtIndex_58($744, $772, 0) | 0;
                          }
                        while (0);
                        if ((label | 0) == 264) $$sink5 = HEAP8[$203 >> 0] | 0;
                        $777 = HEAP8[$769 >> 0] | 0;
                        $780 = ($440 + -1) | 0;
                        $eor$0 =
                          (($$sink5 & 255) < ($777 & 255) ? $777 : $$sink5) & 1;
                        $limit$0 = 0;
                        $nextLevel$0 = $777;
                        while (1) {
                          do
                            if (($limit$0 | 0) > 0) {
                              if (
                                (HEAP8[($439 + ($limit$0 + -1)) >> 0] | 0) !=
                                7
                              ) {
                                $sor$0$ph = $eor$0;
                                break;
                              }
                              do
                                if (!(HEAP8[$214 >> 0] | 0)) label = 271;
                                else {
                                  $788 = HEAP32[$228 >> 2] | 0;
                                  if (
                                    ($limit$0 | 0) <
                                    (HEAP32[$788 >> 2] | 0)
                                  ) {
                                    label = 271;
                                    break;
                                  }
                                  $$sink6 =
                                    _ubidi_getParaLevelAtIndex_58(
                                      HEAP32[$206 >> 2] | 0,
                                      $788,
                                      $limit$0,
                                    ) | 0;
                                }
                              while (0);
                              if ((label | 0) == 271) {
                                label = 0;
                                $$sink6 = HEAP8[$203 >> 0] | 0;
                              }
                              $sor$0$ph = $$sink6 & 1;
                            } else $sor$0$ph = $eor$0;
                          while (0);
                          $796 = ($limit$0 + 1) | 0;
                          L383: do
                            if (($796 | 0) < ($440 | 0)) {
                              $799 = $796;
                              while (1) {
                                $800 = HEAP8[($769 + $799) >> 0] | 0;
                                if (
                                  ($800 << 24) >> 24 !=
                                  ($nextLevel$0 << 24) >> 24
                                )
                                  if (
                                    !(
                                      (1 << HEAPU8[($439 + $799) >> 0]) &
                                      382976
                                    )
                                  ) {
                                    $824 = $799;
                                    $940 = 1;
                                    $nextLevel$1 = $800;
                                    break L383;
                                  }
                                $802 = ($799 + 1) | 0;
                                if (($802 | 0) < ($440 | 0)) $799 = $802;
                                else {
                                  $$lcssa159 = $802;
                                  label = 278;
                                  break;
                                }
                              }
                            } else {
                              $$lcssa159 = $796;
                              label = 278;
                            }
                          while (0);
                          L389: do
                            if ((label | 0) == 278) {
                              label = 0;
                              do
                                if (HEAP8[$214 >> 0] | 0) {
                                  $812 = HEAP32[$228 >> 2] | 0;
                                  if (($440 | 0) <= (HEAP32[$812 >> 2] | 0))
                                    break;
                                  $824 = $$lcssa159;
                                  $940 = 0;
                                  $nextLevel$1 =
                                    _ubidi_getParaLevelAtIndex_58(
                                      HEAP32[$206 >> 2] | 0,
                                      $812,
                                      $780,
                                    ) | 0;
                                  break L389;
                                }
                              while (0);
                              $824 = $$lcssa159;
                              $940 = 0;
                              $nextLevel$1 = HEAP8[$203 >> 0] | 0;
                            }
                          while (0);
                          $817 = $nextLevel$0 & 255;
                          $819 = $nextLevel$1 & 255;
                          $eor$0 =
                            (($817 & 127) >>> 0 < ($819 & 127) >>> 0
                              ? $819
                              : $817) & 1;
                          if (!($817 & 128))
                            _resolveImplicitLevels(
                              $pBiDi,
                              $limit$0,
                              $824,
                              $sor$0$ph,
                              $eor$0,
                            );
                          else {
                            $start$0 = $limit$0;
                            do {
                              $826 = ($769 + $start$0) | 0;
                              $start$0 = ($start$0 + 1) | 0;
                              HEAP8[$826 >> 0] = HEAPU8[$826 >> 0] & 127;
                            } while (($start$0 | 0) < ($824 | 0));
                          }
                          if (!$940) break;
                          else {
                            $limit$0 = $824;
                            $nextLevel$0 = $nextLevel$1;
                          }
                        }
                      }
                      $833 = HEAP32[($pBiDi + 344) >> 2] | 0;
                      if (($833 | 0) > 0) {
                        HEAP32[$pErrorCode >> 2] = $833;
                        break L1;
                      }
                      $835 = HEAP32[$207 >> 2] | 0;
                      $836 = HEAP32[$208 >> 2] | 0;
                      if (!(HEAP32[$437 >> 2] & 8248192)) break L333;
                      $841 = HEAP32[$441 >> 2] | 0;
                      $842 = (HEAP8[$429 >> 0] | 0) != 0;
                      if (($841 | 0) > 0) $i$0$i199 = $841;
                      else break L333;
                      while (1) {
                        if (($i$0$i199 | 0) > 0) $i$1$i192 = $i$0$i199;
                        else break L333;
                        while (1) {
                          $845 = ($i$1$i192 + -1) | 0;
                          $847 = HEAP8[($835 + $845) >> 0] | 0;
                          if (!((1 << ($847 & 255)) & 8248192)) break;
                          if ($842 & (($847 << 24) >> 24 == 7))
                            HEAP8[($836 + $845) >> 0] = 0;
                          else {
                            do
                              if (!(HEAP8[$214 >> 0] | 0)) label = 298;
                              else {
                                $858 = HEAP32[$228 >> 2] | 0;
                                if (
                                  ($i$1$i192 | 0) <=
                                  (HEAP32[$858 >> 2] | 0)
                                ) {
                                  label = 298;
                                  break;
                                }
                                $$sink$i =
                                  _ubidi_getParaLevelAtIndex_58(
                                    HEAP32[$206 >> 2] | 0,
                                    $858,
                                    $845,
                                  ) | 0;
                              }
                            while (0);
                            if ((label | 0) == 298) {
                              label = 0;
                              $$sink$i = HEAP8[$203 >> 0] | 0;
                            }
                            HEAP8[($836 + $845) >> 0] = $$sink$i;
                          }
                          if (($i$1$i192 | 0) > 1) $i$1$i192 = $845;
                          else break L333;
                        }
                        if (($i$1$i192 | 0) > 1) $i$2$i196 = $845;
                        else break L333;
                        while (1) {
                          $864 = ($i$2$i196 + -1) | 0;
                          $866 = HEAP8[($835 + $864) >> 0] | 0;
                          $868 = 1 << ($866 & 255);
                          if (!($868 & 382976)) {
                            if ($842 & (($866 << 24) >> 24 == 7)) {
                              label = 305;
                              break;
                            }
                            if ($868 & 384) {
                              label = 308;
                              break;
                            }
                          } else
                            HEAP8[($836 + $864) >> 0] =
                              HEAP8[($836 + $i$2$i196) >> 0] | 0;
                          if (($i$2$i196 | 0) > 1) $i$2$i196 = $864;
                          else break L333;
                        }
                        if ((label | 0) == 305) {
                          label = 0;
                          HEAP8[($836 + $864) >> 0] = 0;
                        } else if ((label | 0) == 308) {
                          label = 0;
                          do
                            if (!(HEAP8[$214 >> 0] | 0)) label = 310;
                            else {
                              $882 = HEAP32[$228 >> 2] | 0;
                              if (($i$2$i196 | 0) <= (HEAP32[$882 >> 2] | 0)) {
                                label = 310;
                                break;
                              }
                              $$sink1$i =
                                _ubidi_getParaLevelAtIndex_58(
                                  HEAP32[$206 >> 2] | 0,
                                  $882,
                                  $864,
                                ) | 0;
                            }
                          while (0);
                          if ((label | 0) == 310) {
                            label = 0;
                            $$sink1$i = HEAP8[$203 >> 0] | 0;
                          }
                          HEAP8[($836 + $864) >> 0] = $$sink1$i;
                        }
                        if (($i$2$i196 | 0) > 1) $i$0$i199 = $864;
                        else break;
                      }
                    }
                  }
                while (0);
                do
                  if (HEAP8[$214 >> 0] | 0) {
                    if (!(HEAP32[$243 >> 2] & 1)) break;
                    if ((((HEAP32[$16 >> 2] | 0) + -5) | 0) >>> 0 >= 2) break;
                    $894 = HEAP32[$206 >> 2] | 0;
                    if (($894 | 0) > 0) {
                      $941 = $894;
                      $i$0190 = 0;
                    } else break;
                    while (1) {
                      $896 = HEAP32[$228 >> 2] | 0;
                      $898 = HEAP32[($896 + ($i$0190 << 3)) >> 2] | 0;
                      $899 = ($898 + -1) | 0;
                      L448: do
                        if (!(HEAP32[($896 + ($i$0190 << 3) + 4) >> 2] & 255))
                          $926 = $941;
                        else {
                          if (!$i$0190) $909 = 0;
                          else
                            $909 =
                              HEAP32[($896 + (($i$0190 + -1) << 3)) >> 2] | 0;
                          if (($898 | 0) > ($909 | 0)) $j$0186 = $899;
                          else {
                            $926 = $941;
                            break;
                          }
                          while (1) {
                            $911 = HEAP8[($439 + $j$0186) >> 0] | 0;
                            if (!(($911 << 24) >> 24)) break;
                            if ((1 << ($911 & 255)) & 8194) {
                              $926 = $941;
                              break L448;
                            }
                            if (($j$0186 | 0) > ($909 | 0))
                              $j$0186 = ($j$0186 + -1) | 0;
                            else {
                              $926 = $941;
                              break L448;
                            }
                          }
                          if (($j$0186 | 0) < ($899 | 0)) {
                            $last$0 = $899;
                            while (1)
                              if ((HEAP8[($439 + $last$0) >> 0] | 0) == 7)
                                $last$0 = ($last$0 + -1) | 0;
                              else {
                                $last$1 = $last$0;
                                break;
                              }
                          } else $last$1 = $899;
                          _addPoint($pBiDi, $last$1, 4);
                          $926 = HEAP32[$206 >> 2] | 0;
                        }
                      while (0);
                      $i$0190 = ($i$0190 + 1) | 0;
                      if (($i$0190 | 0) >= ($926 | 0)) break;
                      else $941 = $926;
                    }
                  }
                while (0);
                if (!(HEAP32[$243 >> 2] & 2))
                  $storemerge =
                    ((HEAP32[$200 >> 2] | 0) + (HEAP32[$210 >> 2] | 0)) | 0;
                else
                  $storemerge =
                    ((HEAP32[$200 >> 2] | 0) - (HEAP32[$286 >> 2] | 0)) | 0;
                HEAP32[$200 >> 2] = $storemerge;
                HEAP32[($pBiDi + 104) >> 2] = 0;
                HEAP32[($pBiDi + 112) >> 2] = 0;
                HEAP32[$pBiDi >> 2] = $pBiDi;
                break;
              }
            }
            HEAP32[$pErrorCode >> 2] = 1;
          }
      while (0);
      STACKTOP = sp;
      return;
    }
    function _malloc($bytes) {
      $bytes = $bytes | 0;
      var $$3$i = 0,
        $$pre$phi$i$iZ2D = 0,
        $$pre$phi$i23$iZ2D = 0,
        $$pre$phi$i26Z2D = 0,
        $$pre$phi$iZ2D = 0,
        $$pre$phi58$i$iZ2D = 0,
        $$pre$phiZ2D = 0,
        $$rsize$3$i = 0,
        $$sum$i19$i = 0,
        $$sum2$i21$i = 0,
        $$sum3132$i$i = 0,
        $$sum67$i$i = 0,
        $100 = 0,
        $1000 = 0,
        $1002 = 0,
        $1005 = 0,
        $1010 = 0,
        $1016 = 0,
        $1019 = 0,
        $1020 = 0,
        $1027 = 0,
        $1039 = 0,
        $1044 = 0,
        $1051 = 0,
        $1052 = 0,
        $1053 = 0,
        $106 = 0,
        $1060 = 0,
        $1062 = 0,
        $1063 = 0,
        $1070 = 0,
        $110 = 0,
        $112 = 0,
        $113 = 0,
        $115 = 0,
        $117 = 0,
        $119 = 0,
        $12 = 0,
        $121 = 0,
        $123 = 0,
        $125 = 0,
        $127 = 0,
        $13 = 0,
        $132 = 0,
        $138 = 0,
        $14 = 0,
        $141 = 0,
        $144 = 0,
        $147 = 0,
        $148 = 0,
        $149 = 0,
        $15 = 0,
        $151 = 0,
        $154 = 0,
        $156 = 0,
        $159 = 0,
        $16 = 0,
        $161 = 0,
        $164 = 0,
        $167 = 0,
        $168 = 0,
        $17 = 0,
        $170 = 0,
        $171 = 0,
        $173 = 0,
        $174 = 0,
        $176 = 0,
        $177 = 0,
        $18 = 0,
        $182 = 0,
        $183 = 0,
        $192 = 0,
        $197 = 0,
        $201 = 0,
        $207 = 0,
        $214 = 0,
        $217 = 0,
        $225 = 0,
        $227 = 0,
        $228 = 0,
        $229 = 0,
        $230 = 0,
        $231 = 0,
        $232 = 0,
        $236 = 0,
        $237 = 0,
        $245 = 0,
        $246 = 0,
        $247 = 0,
        $249 = 0,
        $25 = 0,
        $250 = 0,
        $255 = 0,
        $256 = 0,
        $259 = 0,
        $261 = 0,
        $264 = 0,
        $269 = 0,
        $276 = 0,
        $28 = 0,
        $285 = 0,
        $286 = 0,
        $290 = 0,
        $300 = 0,
        $303 = 0,
        $307 = 0,
        $309 = 0,
        $31 = 0,
        $310 = 0,
        $312 = 0,
        $314 = 0,
        $316 = 0,
        $318 = 0,
        $320 = 0,
        $322 = 0,
        $324 = 0,
        $334 = 0,
        $335 = 0,
        $337 = 0,
        $34 = 0,
        $346 = 0,
        $348 = 0,
        $351 = 0,
        $353 = 0,
        $356 = 0,
        $358 = 0,
        $361 = 0,
        $364 = 0,
        $365 = 0,
        $367 = 0,
        $368 = 0,
        $370 = 0,
        $371 = 0,
        $373 = 0,
        $374 = 0,
        $379 = 0,
        $38 = 0,
        $380 = 0,
        $389 = 0,
        $394 = 0,
        $398 = 0,
        $4 = 0,
        $404 = 0,
        $41 = 0,
        $411 = 0,
        $414 = 0,
        $422 = 0,
        $424 = 0,
        $425 = 0,
        $426 = 0,
        $427 = 0,
        $431 = 0,
        $432 = 0,
        $438 = 0,
        $44 = 0,
        $443 = 0,
        $444 = 0,
        $447 = 0,
        $449 = 0,
        $452 = 0,
        $457 = 0,
        $46 = 0,
        $463 = 0,
        $467 = 0,
        $468 = 0,
        $47 = 0,
        $475 = 0,
        $487 = 0,
        $49 = 0,
        $492 = 0,
        $499 = 0,
        $5 = 0,
        $500 = 0,
        $501 = 0,
        $509 = 0,
        $51 = 0,
        $511 = 0,
        $512 = 0,
        $522 = 0,
        $526 = 0,
        $528 = 0,
        $529 = 0,
        $53 = 0,
        $538 = 0,
        $544 = 0,
        $545 = 0,
        $546 = 0,
        $547 = 0,
        $548 = 0,
        $549 = 0,
        $55 = 0,
        $550 = 0,
        $552 = 0,
        $554 = 0,
        $555 = 0,
        $561 = 0,
        $563 = 0,
        $565 = 0,
        $57 = 0,
        $570 = 0,
        $572 = 0,
        $574 = 0,
        $575 = 0,
        $576 = 0,
        $584 = 0,
        $585 = 0,
        $588 = 0,
        $59 = 0,
        $592 = 0,
        $593 = 0,
        $596 = 0,
        $598 = 0,
        $6 = 0,
        $602 = 0,
        $604 = 0,
        $608 = 0,
        $61 = 0,
        $612 = 0,
        $621 = 0,
        $622 = 0,
        $628 = 0,
        $630 = 0,
        $632 = 0,
        $635 = 0,
        $637 = 0,
        $64 = 0,
        $641 = 0,
        $642 = 0,
        $648 = 0,
        $65 = 0,
        $653 = 0,
        $655 = 0,
        $66 = 0,
        $660 = 0,
        $661 = 0,
        $662 = 0,
        $666 = 0,
        $67 = 0,
        $676 = 0,
        $678 = 0,
        $68 = 0,
        $683 = 0,
        $685 = 0,
        $69 = 0,
        $690 = 0,
        $692 = 0,
        $696 = 0,
        $7 = 0,
        $70 = 0,
        $702 = 0,
        $706 = 0,
        $711 = 0,
        $714 = 0,
        $719 = 0,
        $720 = 0,
        $724 = 0,
        $725 = 0,
        $730 = 0,
        $736 = 0,
        $741 = 0,
        $744 = 0,
        $745 = 0,
        $748 = 0,
        $750 = 0,
        $752 = 0,
        $755 = 0,
        $766 = 0,
        $77 = 0,
        $771 = 0,
        $773 = 0,
        $776 = 0,
        $778 = 0,
        $781 = 0,
        $784 = 0,
        $785 = 0,
        $787 = 0,
        $788 = 0,
        $790 = 0,
        $791 = 0,
        $793 = 0,
        $794 = 0,
        $799 = 0,
        $80 = 0,
        $800 = 0,
        $809 = 0,
        $81 = 0,
        $814 = 0,
        $818 = 0,
        $824 = 0,
        $832 = 0,
        $838 = 0,
        $84 = 0,
        $840 = 0,
        $841 = 0,
        $842 = 0,
        $843 = 0,
        $847 = 0,
        $848 = 0,
        $854 = 0,
        $859 = 0,
        $860 = 0,
        $863 = 0,
        $865 = 0,
        $868 = 0,
        $873 = 0,
        $879 = 0,
        $883 = 0,
        $884 = 0,
        $89 = 0,
        $891 = 0,
        $90 = 0,
        $903 = 0,
        $908 = 0,
        $91 = 0,
        $915 = 0,
        $916 = 0,
        $917 = 0,
        $92 = 0,
        $925 = 0,
        $928 = 0,
        $929 = 0,
        $93 = 0,
        $934 = 0,
        $94 = 0,
        $940 = 0,
        $941 = 0,
        $943 = 0,
        $944 = 0,
        $947 = 0,
        $95 = 0,
        $952 = 0,
        $954 = 0,
        $959 = 0,
        $960 = 0,
        $964 = 0,
        $970 = 0,
        $975 = 0,
        $977 = 0,
        $978 = 0,
        $979 = 0,
        $980 = 0,
        $984 = 0,
        $985 = 0,
        $99 = 0,
        $991 = 0,
        $996 = 0,
        $997 = 0,
        $F$0$i$i = 0,
        $F1$0$i = 0,
        $F4$0 = 0,
        $F4$0$i$i = 0,
        $F5$0$i = 0,
        $I1$0$i$i = 0,
        $I7$0$i = 0,
        $I7$0$i$i = 0,
        $K12$029$i = 0,
        $K2$07$i$i = 0,
        $K8$051$i$i = 0,
        $R$0$i = 0,
        $R$0$i$i = 0,
        $R$0$i18 = 0,
        $R$1$i = 0,
        $R$1$i$i = 0,
        $R$1$i20 = 0,
        $RP$0$i = 0,
        $RP$0$i$i = 0,
        $RP$0$i17 = 0,
        $T$0$lcssa$i = 0,
        $T$0$lcssa$i$i = 0,
        $T$0$lcssa$i25$i = 0,
        $T$028$i = 0,
        $T$050$i$i = 0,
        $T$06$i$i = 0,
        $br$0$ph$i = 0,
        $i$02$i$i = 0,
        $idx$0$i = 0,
        $mem$0 = 0,
        $nb$0 = 0,
        $oldfirst$0$i$i = 0,
        $qsize$0$i$i = 0,
        $rsize$0$i = 0,
        $rsize$0$i15 = 0,
        $rsize$1$i = 0,
        $rsize$2$i = 0,
        $rsize$3$lcssa$i = 0,
        $rsize$331$i = 0,
        $rst$0$i = 0,
        $rst$1$i = 0,
        $sizebits$0$i = 0,
        $sp$0$i$i = 0,
        $sp$0$i$i$i = 0,
        $sp$084$i = 0,
        $sp$183$i = 0,
        $ssize$0$$i = 0,
        $ssize$0$i = 0,
        $ssize$1$ph$i = 0,
        $ssize$2$i = 0,
        $t$0$i = 0,
        $t$0$i14 = 0,
        $t$1$i = 0,
        $t$2$ph$i = 0,
        $t$2$v$3$i = 0,
        $t$230$i = 0,
        $tbase$255$i = 0,
        $tsize$0$ph$i = 0,
        $tsize$0323944$i = 0,
        $tsize$1$i = 0,
        $tsize$254$i = 0,
        $v$0$i = 0,
        $v$0$i16 = 0,
        $v$1$i = 0,
        $v$2$i = 0,
        $v$3$lcssa$i = 0,
        $v$3$ph$i = 0,
        $v$332$i = 0,
        label = 0,
        $964$looptemp = 0;
      do
        if ($bytes >>> 0 < 245) {
          $4 = $bytes >>> 0 < 11 ? 16 : ($bytes + 11) & -8;
          $5 = $4 >>> 3;
          $6 = HEAP32[164] | 0;
          $7 = $6 >>> $5;
          if ($7 & 3) {
            $12 = ((($7 & 1) ^ 1) + $5) | 0;
            $13 = $12 << 1;
            $14 = (696 + ($13 << 2)) | 0;
            $15 = (696 + (($13 + 2) << 2)) | 0;
            $16 = HEAP32[$15 >> 2] | 0;
            $17 = ($16 + 8) | 0;
            $18 = HEAP32[$17 >> 2] | 0;
            do
              if (($14 | 0) == ($18 | 0)) HEAP32[164] = $6 & ~(1 << $12);
              else {
                if ($18 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                $25 = ($18 + 12) | 0;
                if ((HEAP32[$25 >> 2] | 0) == ($16 | 0)) {
                  HEAP32[$25 >> 2] = $14;
                  HEAP32[$15 >> 2] = $18;
                  break;
                } else _abort();
              }
            while (0);
            $28 = $12 << 3;
            HEAP32[($16 + 4) >> 2] = $28 | 3;
            $31 = ($16 + ($28 | 4)) | 0;
            HEAP32[$31 >> 2] = HEAP32[$31 >> 2] | 1;
            $mem$0 = $17;
            return $mem$0 | 0;
          }
          $34 = HEAP32[166] | 0;
          if ($4 >>> 0 > $34 >>> 0) {
            if ($7) {
              $38 = 2 << $5;
              $41 = ($7 << $5) & ($38 | (0 - $38));
              $44 = (($41 & (0 - $41)) + -1) | 0;
              $46 = ($44 >>> 12) & 16;
              $47 = $44 >>> $46;
              $49 = ($47 >>> 5) & 8;
              $51 = $47 >>> $49;
              $53 = ($51 >>> 2) & 4;
              $55 = $51 >>> $53;
              $57 = ($55 >>> 1) & 2;
              $59 = $55 >>> $57;
              $61 = ($59 >>> 1) & 1;
              $64 = (($49 | $46 | $53 | $57 | $61) + ($59 >>> $61)) | 0;
              $65 = $64 << 1;
              $66 = (696 + ($65 << 2)) | 0;
              $67 = (696 + (($65 + 2) << 2)) | 0;
              $68 = HEAP32[$67 >> 2] | 0;
              $69 = ($68 + 8) | 0;
              $70 = HEAP32[$69 >> 2] | 0;
              do
                if (($66 | 0) == ($70 | 0)) {
                  HEAP32[164] = $6 & ~(1 << $64);
                  $89 = $34;
                } else {
                  if ($70 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                  $77 = ($70 + 12) | 0;
                  if ((HEAP32[$77 >> 2] | 0) == ($68 | 0)) {
                    HEAP32[$77 >> 2] = $66;
                    HEAP32[$67 >> 2] = $70;
                    $89 = HEAP32[166] | 0;
                    break;
                  } else _abort();
                }
              while (0);
              $80 = $64 << 3;
              $81 = ($80 - $4) | 0;
              HEAP32[($68 + 4) >> 2] = $4 | 3;
              $84 = ($68 + $4) | 0;
              HEAP32[($68 + ($4 | 4)) >> 2] = $81 | 1;
              HEAP32[($68 + $80) >> 2] = $81;
              if ($89) {
                $90 = HEAP32[169] | 0;
                $91 = $89 >>> 3;
                $92 = $91 << 1;
                $93 = (696 + ($92 << 2)) | 0;
                $94 = HEAP32[164] | 0;
                $95 = 1 << $91;
                if (!($94 & $95)) {
                  HEAP32[164] = $94 | $95;
                  $$pre$phiZ2D = (696 + (($92 + 2) << 2)) | 0;
                  $F4$0 = $93;
                } else {
                  $99 = (696 + (($92 + 2) << 2)) | 0;
                  $100 = HEAP32[$99 >> 2] | 0;
                  if ($100 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                  else {
                    $$pre$phiZ2D = $99;
                    $F4$0 = $100;
                  }
                }
                HEAP32[$$pre$phiZ2D >> 2] = $90;
                HEAP32[($F4$0 + 12) >> 2] = $90;
                HEAP32[($90 + 8) >> 2] = $F4$0;
                HEAP32[($90 + 12) >> 2] = $93;
              }
              HEAP32[166] = $81;
              HEAP32[169] = $84;
              $mem$0 = $69;
              return $mem$0 | 0;
            }
            $106 = HEAP32[165] | 0;
            if (!$106) $nb$0 = $4;
            else {
              $110 = (($106 & (0 - $106)) + -1) | 0;
              $112 = ($110 >>> 12) & 16;
              $113 = $110 >>> $112;
              $115 = ($113 >>> 5) & 8;
              $117 = $113 >>> $115;
              $119 = ($117 >>> 2) & 4;
              $121 = $117 >>> $119;
              $123 = ($121 >>> 1) & 2;
              $125 = $121 >>> $123;
              $127 = ($125 >>> 1) & 1;
              $132 =
                HEAP32[
                  (960 +
                    ((($115 | $112 | $119 | $123 | $127) + ($125 >>> $127)) <<
                      2)) >>
                    2
                ] | 0;
              $rsize$0$i = ((HEAP32[($132 + 4) >> 2] & -8) - $4) | 0;
              $t$0$i = $132;
              $v$0$i = $132;
              while (1) {
                $138 = HEAP32[($t$0$i + 16) >> 2] | 0;
                if (!$138) {
                  $141 = HEAP32[($t$0$i + 20) >> 2] | 0;
                  if (!$141) break;
                  else $144 = $141;
                } else $144 = $138;
                $147 = ((HEAP32[($144 + 4) >> 2] & -8) - $4) | 0;
                $148 = $147 >>> 0 < $rsize$0$i >>> 0;
                $rsize$0$i = $148 ? $147 : $rsize$0$i;
                $t$0$i = $144;
                $v$0$i = $148 ? $144 : $v$0$i;
              }
              $149 = HEAP32[168] | 0;
              if ($v$0$i >>> 0 < $149 >>> 0) _abort();
              $151 = ($v$0$i + $4) | 0;
              if ($v$0$i >>> 0 >= $151 >>> 0) _abort();
              $154 = HEAP32[($v$0$i + 24) >> 2] | 0;
              $156 = HEAP32[($v$0$i + 12) >> 2] | 0;
              do
                if (($156 | 0) == ($v$0$i | 0)) {
                  $167 = ($v$0$i + 20) | 0;
                  $168 = HEAP32[$167 >> 2] | 0;
                  if (!$168) {
                    $170 = ($v$0$i + 16) | 0;
                    $171 = HEAP32[$170 >> 2] | 0;
                    if (!$171) {
                      $R$1$i = 0;
                      break;
                    } else {
                      $R$0$i = $171;
                      $RP$0$i = $170;
                    }
                  } else {
                    $R$0$i = $168;
                    $RP$0$i = $167;
                  }
                  while (1) {
                    $173 = ($R$0$i + 20) | 0;
                    $174 = HEAP32[$173 >> 2] | 0;
                    if ($174) {
                      $R$0$i = $174;
                      $RP$0$i = $173;
                      continue;
                    }
                    $176 = ($R$0$i + 16) | 0;
                    $177 = HEAP32[$176 >> 2] | 0;
                    if (!$177) break;
                    else {
                      $R$0$i = $177;
                      $RP$0$i = $176;
                    }
                  }
                  if ($RP$0$i >>> 0 < $149 >>> 0) _abort();
                  else {
                    HEAP32[$RP$0$i >> 2] = 0;
                    $R$1$i = $R$0$i;
                    break;
                  }
                } else {
                  $159 = HEAP32[($v$0$i + 8) >> 2] | 0;
                  if ($159 >>> 0 < $149 >>> 0) _abort();
                  $161 = ($159 + 12) | 0;
                  if ((HEAP32[$161 >> 2] | 0) != ($v$0$i | 0)) _abort();
                  $164 = ($156 + 8) | 0;
                  if ((HEAP32[$164 >> 2] | 0) == ($v$0$i | 0)) {
                    HEAP32[$161 >> 2] = $156;
                    HEAP32[$164 >> 2] = $159;
                    $R$1$i = $156;
                    break;
                  } else _abort();
                }
              while (0);
              do
                if ($154) {
                  $182 = HEAP32[($v$0$i + 28) >> 2] | 0;
                  $183 = (960 + ($182 << 2)) | 0;
                  if (($v$0$i | 0) == (HEAP32[$183 >> 2] | 0)) {
                    HEAP32[$183 >> 2] = $R$1$i;
                    if (!$R$1$i) {
                      HEAP32[165] = HEAP32[165] & ~(1 << $182);
                      break;
                    }
                  } else {
                    if ($154 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                    $192 = ($154 + 16) | 0;
                    if ((HEAP32[$192 >> 2] | 0) == ($v$0$i | 0))
                      HEAP32[$192 >> 2] = $R$1$i;
                    else HEAP32[($154 + 20) >> 2] = $R$1$i;
                    if (!$R$1$i) break;
                  }
                  $197 = HEAP32[168] | 0;
                  if ($R$1$i >>> 0 < $197 >>> 0) _abort();
                  HEAP32[($R$1$i + 24) >> 2] = $154;
                  $201 = HEAP32[($v$0$i + 16) >> 2] | 0;
                  do
                    if ($201)
                      if ($201 >>> 0 < $197 >>> 0) _abort();
                      else {
                        HEAP32[($R$1$i + 16) >> 2] = $201;
                        HEAP32[($201 + 24) >> 2] = $R$1$i;
                        break;
                      }
                  while (0);
                  $207 = HEAP32[($v$0$i + 20) >> 2] | 0;
                  if ($207)
                    if ($207 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                    else {
                      HEAP32[($R$1$i + 20) >> 2] = $207;
                      HEAP32[($207 + 24) >> 2] = $R$1$i;
                      break;
                    }
                }
              while (0);
              if ($rsize$0$i >>> 0 < 16) {
                $214 = ($rsize$0$i + $4) | 0;
                HEAP32[($v$0$i + 4) >> 2] = $214 | 3;
                $217 = ($v$0$i + ($214 + 4)) | 0;
                HEAP32[$217 >> 2] = HEAP32[$217 >> 2] | 1;
              } else {
                HEAP32[($v$0$i + 4) >> 2] = $4 | 3;
                HEAP32[($v$0$i + ($4 | 4)) >> 2] = $rsize$0$i | 1;
                HEAP32[($v$0$i + ($rsize$0$i + $4)) >> 2] = $rsize$0$i;
                $225 = HEAP32[166] | 0;
                if ($225) {
                  $227 = HEAP32[169] | 0;
                  $228 = $225 >>> 3;
                  $229 = $228 << 1;
                  $230 = (696 + ($229 << 2)) | 0;
                  $231 = HEAP32[164] | 0;
                  $232 = 1 << $228;
                  if (!($231 & $232)) {
                    HEAP32[164] = $231 | $232;
                    $$pre$phi$iZ2D = (696 + (($229 + 2) << 2)) | 0;
                    $F1$0$i = $230;
                  } else {
                    $236 = (696 + (($229 + 2) << 2)) | 0;
                    $237 = HEAP32[$236 >> 2] | 0;
                    if ($237 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                    else {
                      $$pre$phi$iZ2D = $236;
                      $F1$0$i = $237;
                    }
                  }
                  HEAP32[$$pre$phi$iZ2D >> 2] = $227;
                  HEAP32[($F1$0$i + 12) >> 2] = $227;
                  HEAP32[($227 + 8) >> 2] = $F1$0$i;
                  HEAP32[($227 + 12) >> 2] = $230;
                }
                HEAP32[166] = $rsize$0$i;
                HEAP32[169] = $151;
              }
              $mem$0 = ($v$0$i + 8) | 0;
              return $mem$0 | 0;
            }
          } else $nb$0 = $4;
        } else if ($bytes >>> 0 > 4294967231) $nb$0 = -1;
        else {
          $245 = ($bytes + 11) | 0;
          $246 = $245 & -8;
          $247 = HEAP32[165] | 0;
          if (!$247) $nb$0 = $246;
          else {
            $249 = (0 - $246) | 0;
            $250 = $245 >>> 8;
            if (!$250) $idx$0$i = 0;
            else if ($246 >>> 0 > 16777215) $idx$0$i = 31;
            else {
              $255 = ((($250 + 1048320) | 0) >>> 16) & 8;
              $256 = $250 << $255;
              $259 = ((($256 + 520192) | 0) >>> 16) & 4;
              $261 = $256 << $259;
              $264 = ((($261 + 245760) | 0) >>> 16) & 2;
              $269 = (14 - ($259 | $255 | $264) + (($261 << $264) >>> 15)) | 0;
              $idx$0$i = (($246 >>> (($269 + 7) | 0)) & 1) | ($269 << 1);
            }
            $276 = HEAP32[(960 + ($idx$0$i << 2)) >> 2] | 0;
            L123: do
              if (!$276) {
                $rsize$2$i = $249;
                $t$1$i = 0;
                $v$2$i = 0;
                label = 86;
              } else {
                $rsize$0$i15 = $249;
                $rst$0$i = 0;
                $sizebits$0$i =
                  $246 <<
                  (($idx$0$i | 0) == 31 ? 0 : (25 - ($idx$0$i >>> 1)) | 0);
                $t$0$i14 = $276;
                $v$0$i16 = 0;
                while (1) {
                  $285 = HEAP32[($t$0$i14 + 4) >> 2] & -8;
                  $286 = ($285 - $246) | 0;
                  if ($286 >>> 0 < $rsize$0$i15 >>> 0)
                    if (($285 | 0) == ($246 | 0)) {
                      $rsize$331$i = $286;
                      $t$230$i = $t$0$i14;
                      $v$332$i = $t$0$i14;
                      label = 90;
                      break L123;
                    } else {
                      $rsize$1$i = $286;
                      $v$1$i = $t$0$i14;
                    }
                  else {
                    $rsize$1$i = $rsize$0$i15;
                    $v$1$i = $v$0$i16;
                  }
                  $290 = HEAP32[($t$0$i14 + 20) >> 2] | 0;
                  $t$0$i14 =
                    HEAP32[
                      ($t$0$i14 + 16 + (($sizebits$0$i >>> 31) << 2)) >> 2
                    ] | 0;
                  $rst$1$i =
                    (($290 | 0) == 0) | (($290 | 0) == ($t$0$i14 | 0))
                      ? $rst$0$i
                      : $290;
                  if (!$t$0$i14) {
                    $rsize$2$i = $rsize$1$i;
                    $t$1$i = $rst$1$i;
                    $v$2$i = $v$1$i;
                    label = 86;
                    break;
                  } else {
                    $rsize$0$i15 = $rsize$1$i;
                    $rst$0$i = $rst$1$i;
                    $sizebits$0$i = $sizebits$0$i << 1;
                    $v$0$i16 = $v$1$i;
                  }
                }
              }
            while (0);
            if ((label | 0) == 86) {
              if ((($t$1$i | 0) == 0) & (($v$2$i | 0) == 0)) {
                $300 = 2 << $idx$0$i;
                $303 = ($300 | (0 - $300)) & $247;
                if (!$303) {
                  $nb$0 = $246;
                  break;
                }
                $307 = (($303 & (0 - $303)) + -1) | 0;
                $309 = ($307 >>> 12) & 16;
                $310 = $307 >>> $309;
                $312 = ($310 >>> 5) & 8;
                $314 = $310 >>> $312;
                $316 = ($314 >>> 2) & 4;
                $318 = $314 >>> $316;
                $320 = ($318 >>> 1) & 2;
                $322 = $318 >>> $320;
                $324 = ($322 >>> 1) & 1;
                $t$2$ph$i =
                  HEAP32[
                    (960 +
                      ((($312 | $309 | $316 | $320 | $324) + ($322 >>> $324)) <<
                        2)) >>
                      2
                  ] | 0;
                $v$3$ph$i = 0;
              } else {
                $t$2$ph$i = $t$1$i;
                $v$3$ph$i = $v$2$i;
              }
              if (!$t$2$ph$i) {
                $rsize$3$lcssa$i = $rsize$2$i;
                $v$3$lcssa$i = $v$3$ph$i;
              } else {
                $rsize$331$i = $rsize$2$i;
                $t$230$i = $t$2$ph$i;
                $v$332$i = $v$3$ph$i;
                label = 90;
              }
            }
            if ((label | 0) == 90)
              while (1) {
                label = 0;
                $334 = ((HEAP32[($t$230$i + 4) >> 2] & -8) - $246) | 0;
                $335 = $334 >>> 0 < $rsize$331$i >>> 0;
                $$rsize$3$i = $335 ? $334 : $rsize$331$i;
                $t$2$v$3$i = $335 ? $t$230$i : $v$332$i;
                $337 = HEAP32[($t$230$i + 16) >> 2] | 0;
                if ($337) {
                  $rsize$331$i = $$rsize$3$i;
                  $t$230$i = $337;
                  $v$332$i = $t$2$v$3$i;
                  label = 90;
                  continue;
                }
                $t$230$i = HEAP32[($t$230$i + 20) >> 2] | 0;
                if (!$t$230$i) {
                  $rsize$3$lcssa$i = $$rsize$3$i;
                  $v$3$lcssa$i = $t$2$v$3$i;
                  break;
                } else {
                  $rsize$331$i = $$rsize$3$i;
                  $v$332$i = $t$2$v$3$i;
                  label = 90;
                }
              }
            if (!$v$3$lcssa$i) $nb$0 = $246;
            else if (
              $rsize$3$lcssa$i >>> 0 <
              (((HEAP32[166] | 0) - $246) | 0) >>> 0
            ) {
              $346 = HEAP32[168] | 0;
              if ($v$3$lcssa$i >>> 0 < $346 >>> 0) _abort();
              $348 = ($v$3$lcssa$i + $246) | 0;
              if ($v$3$lcssa$i >>> 0 >= $348 >>> 0) _abort();
              $351 = HEAP32[($v$3$lcssa$i + 24) >> 2] | 0;
              $353 = HEAP32[($v$3$lcssa$i + 12) >> 2] | 0;
              do
                if (($353 | 0) == ($v$3$lcssa$i | 0)) {
                  $364 = ($v$3$lcssa$i + 20) | 0;
                  $365 = HEAP32[$364 >> 2] | 0;
                  if (!$365) {
                    $367 = ($v$3$lcssa$i + 16) | 0;
                    $368 = HEAP32[$367 >> 2] | 0;
                    if (!$368) {
                      $R$1$i20 = 0;
                      break;
                    } else {
                      $R$0$i18 = $368;
                      $RP$0$i17 = $367;
                    }
                  } else {
                    $R$0$i18 = $365;
                    $RP$0$i17 = $364;
                  }
                  while (1) {
                    $370 = ($R$0$i18 + 20) | 0;
                    $371 = HEAP32[$370 >> 2] | 0;
                    if ($371) {
                      $R$0$i18 = $371;
                      $RP$0$i17 = $370;
                      continue;
                    }
                    $373 = ($R$0$i18 + 16) | 0;
                    $374 = HEAP32[$373 >> 2] | 0;
                    if (!$374) break;
                    else {
                      $R$0$i18 = $374;
                      $RP$0$i17 = $373;
                    }
                  }
                  if ($RP$0$i17 >>> 0 < $346 >>> 0) _abort();
                  else {
                    HEAP32[$RP$0$i17 >> 2] = 0;
                    $R$1$i20 = $R$0$i18;
                    break;
                  }
                } else {
                  $356 = HEAP32[($v$3$lcssa$i + 8) >> 2] | 0;
                  if ($356 >>> 0 < $346 >>> 0) _abort();
                  $358 = ($356 + 12) | 0;
                  if ((HEAP32[$358 >> 2] | 0) != ($v$3$lcssa$i | 0)) _abort();
                  $361 = ($353 + 8) | 0;
                  if ((HEAP32[$361 >> 2] | 0) == ($v$3$lcssa$i | 0)) {
                    HEAP32[$358 >> 2] = $353;
                    HEAP32[$361 >> 2] = $356;
                    $R$1$i20 = $353;
                    break;
                  } else _abort();
                }
              while (0);
              do
                if ($351) {
                  $379 = HEAP32[($v$3$lcssa$i + 28) >> 2] | 0;
                  $380 = (960 + ($379 << 2)) | 0;
                  if (($v$3$lcssa$i | 0) == (HEAP32[$380 >> 2] | 0)) {
                    HEAP32[$380 >> 2] = $R$1$i20;
                    if (!$R$1$i20) {
                      HEAP32[165] = HEAP32[165] & ~(1 << $379);
                      break;
                    }
                  } else {
                    if ($351 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                    $389 = ($351 + 16) | 0;
                    if ((HEAP32[$389 >> 2] | 0) == ($v$3$lcssa$i | 0))
                      HEAP32[$389 >> 2] = $R$1$i20;
                    else HEAP32[($351 + 20) >> 2] = $R$1$i20;
                    if (!$R$1$i20) break;
                  }
                  $394 = HEAP32[168] | 0;
                  if ($R$1$i20 >>> 0 < $394 >>> 0) _abort();
                  HEAP32[($R$1$i20 + 24) >> 2] = $351;
                  $398 = HEAP32[($v$3$lcssa$i + 16) >> 2] | 0;
                  do
                    if ($398)
                      if ($398 >>> 0 < $394 >>> 0) _abort();
                      else {
                        HEAP32[($R$1$i20 + 16) >> 2] = $398;
                        HEAP32[($398 + 24) >> 2] = $R$1$i20;
                        break;
                      }
                  while (0);
                  $404 = HEAP32[($v$3$lcssa$i + 20) >> 2] | 0;
                  if ($404)
                    if ($404 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                    else {
                      HEAP32[($R$1$i20 + 20) >> 2] = $404;
                      HEAP32[($404 + 24) >> 2] = $R$1$i20;
                      break;
                    }
                }
              while (0);
              L199: do
                if ($rsize$3$lcssa$i >>> 0 < 16) {
                  $411 = ($rsize$3$lcssa$i + $246) | 0;
                  HEAP32[($v$3$lcssa$i + 4) >> 2] = $411 | 3;
                  $414 = ($v$3$lcssa$i + ($411 + 4)) | 0;
                  HEAP32[$414 >> 2] = HEAP32[$414 >> 2] | 1;
                } else {
                  HEAP32[($v$3$lcssa$i + 4) >> 2] = $246 | 3;
                  HEAP32[($v$3$lcssa$i + ($246 | 4)) >> 2] =
                    $rsize$3$lcssa$i | 1;
                  HEAP32[($v$3$lcssa$i + ($rsize$3$lcssa$i + $246)) >> 2] =
                    $rsize$3$lcssa$i;
                  $422 = $rsize$3$lcssa$i >>> 3;
                  if ($rsize$3$lcssa$i >>> 0 < 256) {
                    $424 = $422 << 1;
                    $425 = (696 + ($424 << 2)) | 0;
                    $426 = HEAP32[164] | 0;
                    $427 = 1 << $422;
                    if (!($426 & $427)) {
                      HEAP32[164] = $426 | $427;
                      $$pre$phi$i26Z2D = (696 + (($424 + 2) << 2)) | 0;
                      $F5$0$i = $425;
                    } else {
                      $431 = (696 + (($424 + 2) << 2)) | 0;
                      $432 = HEAP32[$431 >> 2] | 0;
                      if ($432 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                      else {
                        $$pre$phi$i26Z2D = $431;
                        $F5$0$i = $432;
                      }
                    }
                    HEAP32[$$pre$phi$i26Z2D >> 2] = $348;
                    HEAP32[($F5$0$i + 12) >> 2] = $348;
                    HEAP32[($v$3$lcssa$i + ($246 + 8)) >> 2] = $F5$0$i;
                    HEAP32[($v$3$lcssa$i + ($246 + 12)) >> 2] = $425;
                    break;
                  }
                  $438 = $rsize$3$lcssa$i >>> 8;
                  if (!$438) $I7$0$i = 0;
                  else if ($rsize$3$lcssa$i >>> 0 > 16777215) $I7$0$i = 31;
                  else {
                    $443 = ((($438 + 1048320) | 0) >>> 16) & 8;
                    $444 = $438 << $443;
                    $447 = ((($444 + 520192) | 0) >>> 16) & 4;
                    $449 = $444 << $447;
                    $452 = ((($449 + 245760) | 0) >>> 16) & 2;
                    $457 =
                      (14 - ($447 | $443 | $452) + (($449 << $452) >>> 15)) | 0;
                    $I7$0$i =
                      (($rsize$3$lcssa$i >>> (($457 + 7) | 0)) & 1) |
                      ($457 << 1);
                  }
                  $463 = (960 + ($I7$0$i << 2)) | 0;
                  HEAP32[($v$3$lcssa$i + ($246 + 28)) >> 2] = $I7$0$i;
                  HEAP32[($v$3$lcssa$i + ($246 + 20)) >> 2] = 0;
                  HEAP32[($v$3$lcssa$i + ($246 + 16)) >> 2] = 0;
                  $467 = HEAP32[165] | 0;
                  $468 = 1 << $I7$0$i;
                  if (!($467 & $468)) {
                    HEAP32[165] = $467 | $468;
                    HEAP32[$463 >> 2] = $348;
                    HEAP32[($v$3$lcssa$i + ($246 + 24)) >> 2] = $463;
                    HEAP32[($v$3$lcssa$i + ($246 + 12)) >> 2] = $348;
                    HEAP32[($v$3$lcssa$i + ($246 + 8)) >> 2] = $348;
                    break;
                  }
                  $475 = HEAP32[$463 >> 2] | 0;
                  L217: do
                    if (
                      ((HEAP32[($475 + 4) >> 2] & -8) | 0) ==
                      ($rsize$3$lcssa$i | 0)
                    )
                      $T$0$lcssa$i = $475;
                    else {
                      $K12$029$i =
                        $rsize$3$lcssa$i <<
                        (($I7$0$i | 0) == 31 ? 0 : (25 - ($I7$0$i >>> 1)) | 0);
                      $T$028$i = $475;
                      while (1) {
                        $492 = ($T$028$i + 16 + (($K12$029$i >>> 31) << 2)) | 0;
                        $487 = HEAP32[$492 >> 2] | 0;
                        if (!$487) break;
                        if (
                          ((HEAP32[($487 + 4) >> 2] & -8) | 0) ==
                          ($rsize$3$lcssa$i | 0)
                        ) {
                          $T$0$lcssa$i = $487;
                          break L217;
                        } else {
                          $K12$029$i = $K12$029$i << 1;
                          $T$028$i = $487;
                        }
                      }
                      if ($492 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                      else {
                        HEAP32[$492 >> 2] = $348;
                        HEAP32[($v$3$lcssa$i + ($246 + 24)) >> 2] = $T$028$i;
                        HEAP32[($v$3$lcssa$i + ($246 + 12)) >> 2] = $348;
                        HEAP32[($v$3$lcssa$i + ($246 + 8)) >> 2] = $348;
                        break L199;
                      }
                    }
                  while (0);
                  $499 = ($T$0$lcssa$i + 8) | 0;
                  $500 = HEAP32[$499 >> 2] | 0;
                  $501 = HEAP32[168] | 0;
                  if (
                    ($500 >>> 0 >= $501 >>> 0) &
                    ($T$0$lcssa$i >>> 0 >= $501 >>> 0)
                  ) {
                    HEAP32[($500 + 12) >> 2] = $348;
                    HEAP32[$499 >> 2] = $348;
                    HEAP32[($v$3$lcssa$i + ($246 + 8)) >> 2] = $500;
                    HEAP32[($v$3$lcssa$i + ($246 + 12)) >> 2] = $T$0$lcssa$i;
                    HEAP32[($v$3$lcssa$i + ($246 + 24)) >> 2] = 0;
                    break;
                  } else _abort();
                }
              while (0);
              $mem$0 = ($v$3$lcssa$i + 8) | 0;
              return $mem$0 | 0;
            } else $nb$0 = $246;
          }
        }
      while (0);
      $509 = HEAP32[166] | 0;
      if ($509 >>> 0 >= $nb$0 >>> 0) {
        $511 = ($509 - $nb$0) | 0;
        $512 = HEAP32[169] | 0;
        if ($511 >>> 0 > 15) {
          HEAP32[169] = $512 + $nb$0;
          HEAP32[166] = $511;
          HEAP32[($512 + ($nb$0 + 4)) >> 2] = $511 | 1;
          HEAP32[($512 + $509) >> 2] = $511;
          HEAP32[($512 + 4) >> 2] = $nb$0 | 3;
        } else {
          HEAP32[166] = 0;
          HEAP32[169] = 0;
          HEAP32[($512 + 4) >> 2] = $509 | 3;
          $522 = ($512 + ($509 + 4)) | 0;
          HEAP32[$522 >> 2] = HEAP32[$522 >> 2] | 1;
        }
        $mem$0 = ($512 + 8) | 0;
        return $mem$0 | 0;
      }
      $526 = HEAP32[167] | 0;
      if ($526 >>> 0 > $nb$0 >>> 0) {
        $528 = ($526 - $nb$0) | 0;
        HEAP32[167] = $528;
        $529 = HEAP32[170] | 0;
        HEAP32[170] = $529 + $nb$0;
        HEAP32[($529 + ($nb$0 + 4)) >> 2] = $528 | 1;
        HEAP32[($529 + 4) >> 2] = $nb$0 | 3;
        $mem$0 = ($529 + 8) | 0;
        return $mem$0 | 0;
      }
      do
        if (!(HEAP32[282] | 0)) {
          $538 = _sysconf(30) | 0;
          if (!(($538 + -1) & $538)) {
            HEAP32[284] = $538;
            HEAP32[283] = $538;
            HEAP32[285] = -1;
            HEAP32[286] = -1;
            HEAP32[287] = 0;
            HEAP32[275] = 0;
            $544 = ((_time(0) | 0) & -16) ^ 1431655768;
            HEAP32[282] = $544;
            break;
          } else _abort();
        }
      while (0);
      $545 = ($nb$0 + 48) | 0;
      $546 = HEAP32[284] | 0;
      $547 = ($nb$0 + 47) | 0;
      $548 = ($546 + $547) | 0;
      $549 = (0 - $546) | 0;
      $550 = $548 & $549;
      if ($550 >>> 0 <= $nb$0 >>> 0) {
        $mem$0 = 0;
        return $mem$0 | 0;
      }
      $552 = HEAP32[274] | 0;
      if ($552) {
        $554 = HEAP32[272] | 0;
        $555 = ($554 + $550) | 0;
        if (($555 >>> 0 <= $554 >>> 0) | ($555 >>> 0 > $552 >>> 0)) {
          $mem$0 = 0;
          return $mem$0 | 0;
        }
      }
      L258: do
        if (!(HEAP32[275] & 4)) {
          $561 = HEAP32[170] | 0;
          L260: do
            if (!$561) label = 174;
            else {
              $sp$0$i$i = 1104;
              while (1) {
                $563 = HEAP32[$sp$0$i$i >> 2] | 0;

                if ($563 >>> 0 <= $561 >>> 0) {
                  $565 = ($sp$0$i$i + 4) | 0;
                  if ((($563 + (HEAP32[$565 >> 2] | 0)) | 0) >>> 0 > $561 >>> 0)
                    break;
                }
                $570 = HEAP32[($sp$0$i$i + 8) >> 2] | 0;
                if (!$570) {
                  label = 174;
                  break L260;
                } else $sp$0$i$i = $570;
              }
              $596 = ($548 - (HEAP32[167] | 0)) & $549;
              if ($596 >>> 0 < 2147483647) {
                $598 = _sbrk($596 | 0) | 0;
                $602 =
                  ($598 | 0) ==
                  (((HEAP32[$sp$0$i$i >> 2] | 0) + (HEAP32[$565 >> 2] | 0)) |
                    0);
                $$3$i = $602 ? $596 : 0;
                if ($602)
                  if (($598 | 0) == (-1 | 0)) $tsize$0323944$i = $$3$i;
                  else {
                    $tbase$255$i = $598;
                    $tsize$254$i = $$3$i;
                    label = 194;
                    break L258;
                  }
                else {
                  $br$0$ph$i = $598;
                  $ssize$1$ph$i = $596;
                  $tsize$0$ph$i = $$3$i;
                  label = 184;
                }
              } else $tsize$0323944$i = 0;
            }
          while (0);
          do
            if ((label | 0) == 174) {
              $572 = _sbrk(0) | 0;
              if (($572 | 0) == (-1 | 0)) $tsize$0323944$i = 0;
              else {
                $574 = $572;
                $575 = HEAP32[283] | 0;
                $576 = ($575 + -1) | 0;
                if (!($576 & $574)) $ssize$0$i = $550;
                else
                  $ssize$0$i = ($550 - $574 + (($576 + $574) & (0 - $575))) | 0;
                $584 = HEAP32[272] | 0;
                $585 = ($584 + $ssize$0$i) | 0;
                if (
                  ($ssize$0$i >>> 0 > $nb$0 >>> 0) &
                  ($ssize$0$i >>> 0 < 2147483647)
                ) {
                  $588 = HEAP32[274] | 0;
                  if ($588)
                    if (
                      ($585 >>> 0 <= $584 >>> 0) |
                      ($585 >>> 0 > $588 >>> 0)
                    ) {
                      $tsize$0323944$i = 0;
                      break;
                    }
                  $592 = _sbrk($ssize$0$i | 0) | 0;
                  $593 = ($592 | 0) == ($572 | 0);
                  $ssize$0$$i = $593 ? $ssize$0$i : 0;
                  if ($593) {
                    $tbase$255$i = $572;
                    $tsize$254$i = $ssize$0$$i;
                    label = 194;
                    break L258;
                  } else {
                    $br$0$ph$i = $592;
                    $ssize$1$ph$i = $ssize$0$i;
                    $tsize$0$ph$i = $ssize$0$$i;
                    label = 184;
                  }
                } else $tsize$0323944$i = 0;
              }
            }
          while (0);
          L280: do
            if ((label | 0) == 184) {
              $604 = (0 - $ssize$1$ph$i) | 0;
              do
                if (
                  ($545 >>> 0 > $ssize$1$ph$i >>> 0) &
                  (($ssize$1$ph$i >>> 0 < 2147483647) &
                    (($br$0$ph$i | 0) != (-1 | 0)))
                ) {
                  $608 = HEAP32[284] | 0;
                  $612 = ($547 - $ssize$1$ph$i + $608) & (0 - $608);
                  if ($612 >>> 0 < 2147483647)
                    if ((_sbrk($612 | 0) | 0) == (-1 | 0)) {
                      _sbrk($604 | 0) | 0;
                      $tsize$0323944$i = $tsize$0$ph$i;
                      break L280;
                    } else {
                      $ssize$2$i = ($612 + $ssize$1$ph$i) | 0;
                      break;
                    }
                  else $ssize$2$i = $ssize$1$ph$i;
                } else $ssize$2$i = $ssize$1$ph$i;
              while (0);
              if (($br$0$ph$i | 0) == (-1 | 0))
                $tsize$0323944$i = $tsize$0$ph$i;
              else {
                $tbase$255$i = $br$0$ph$i;
                $tsize$254$i = $ssize$2$i;
                label = 194;
                break L258;
              }
            }
          while (0);
          HEAP32[275] = HEAP32[275] | 4;
          $tsize$1$i = $tsize$0323944$i;
          label = 191;
        } else {
          $tsize$1$i = 0;
          label = 191;
        }
      while (0);
      if ((label | 0) == 191)
        if ($550 >>> 0 < 2147483647) {
          $621 = _sbrk($550 | 0) | 0;
          $622 = _sbrk(0) | 0;
          if (
            ($621 >>> 0 < $622 >>> 0) &
            ((($621 | 0) != (-1 | 0)) & (($622 | 0) != (-1 | 0)))
          ) {
            $628 = ($622 - $621) | 0;
            $630 = $628 >>> 0 > (($nb$0 + 40) | 0) >>> 0;
            if ($630) {
              $tbase$255$i = $621;
              $tsize$254$i = $630 ? $628 : $tsize$1$i;
              label = 194;
            }
          }
        }
      if ((label | 0) == 194) {
        $632 = ((HEAP32[272] | 0) + $tsize$254$i) | 0;
        HEAP32[272] = $632;
        if ($632 >>> 0 > (HEAP32[273] | 0) >>> 0) HEAP32[273] = $632;
        $635 = HEAP32[170] | 0;
        L299: do
          if (!$635) {
            $637 = HEAP32[168] | 0;
            if ((($637 | 0) == 0) | ($tbase$255$i >>> 0 < $637 >>> 0))
              HEAP32[168] = $tbase$255$i;
            HEAP32[276] = $tbase$255$i;
            HEAP32[277] = $tsize$254$i;
            HEAP32[279] = 0;
            HEAP32[173] = HEAP32[282];
            HEAP32[172] = -1;
            $i$02$i$i = 0;
            do {
              $641 = $i$02$i$i << 1;
              $642 = (696 + ($641 << 2)) | 0;
              HEAP32[(696 + (($641 + 3) << 2)) >> 2] = $642;
              HEAP32[(696 + (($641 + 2) << 2)) >> 2] = $642;
              $i$02$i$i = ($i$02$i$i + 1) | 0;
            } while (($i$02$i$i | 0) != 32);
            $648 = ($tbase$255$i + 8) | 0;
            $653 = (($648 & 7) | 0) == 0 ? 0 : (0 - $648) & 7;
            $655 = ($tsize$254$i + -40 - $653) | 0;
            HEAP32[170] = $tbase$255$i + $653;
            HEAP32[167] = $655;
            HEAP32[($tbase$255$i + ($653 + 4)) >> 2] = $655 | 1;
            HEAP32[($tbase$255$i + ($tsize$254$i + -36)) >> 2] = 40;
            HEAP32[171] = HEAP32[286];
          } else {
            $sp$084$i = 1104;
            while (1) {
              $660 = HEAP32[$sp$084$i >> 2] | 0;
              $661 = ($sp$084$i + 4) | 0;
              $662 = HEAP32[$661 >> 2] | 0;
              if (($tbase$255$i | 0) == (($660 + $662) | 0)) {
                label = 204;
                break;
              }
              $666 = HEAP32[($sp$084$i + 8) >> 2] | 0;
              if (!$666) break;
              else $sp$084$i = $666;
            }
            if ((label | 0) == 204)
              if (!(HEAP32[($sp$084$i + 12) >> 2] & 8))
                if (
                  ($635 >>> 0 < $tbase$255$i >>> 0) &
                  ($635 >>> 0 >= $660 >>> 0)
                ) {
                  HEAP32[$661 >> 2] = $662 + $tsize$254$i;
                  $676 = ((HEAP32[167] | 0) + $tsize$254$i) | 0;
                  $678 = ($635 + 8) | 0;
                  $683 = (($678 & 7) | 0) == 0 ? 0 : (0 - $678) & 7;
                  $685 = ($676 - $683) | 0;
                  HEAP32[170] = $635 + $683;
                  HEAP32[167] = $685;
                  HEAP32[($635 + ($683 + 4)) >> 2] = $685 | 1;
                  HEAP32[($635 + ($676 + 4)) >> 2] = 40;
                  HEAP32[171] = HEAP32[286];
                  break;
                }
            $690 = HEAP32[168] | 0;
            if ($tbase$255$i >>> 0 < $690 >>> 0) {
              HEAP32[168] = $tbase$255$i;
              $755 = $tbase$255$i;
            } else $755 = $690;
            $692 = ($tbase$255$i + $tsize$254$i) | 0;
            $sp$183$i = 1104;
            while (1) {
              if ((HEAP32[$sp$183$i >> 2] | 0) == ($692 | 0)) {
                label = 212;
                break;
              }
              $696 = HEAP32[($sp$183$i + 8) >> 2] | 0;
              if (!$696) {
                $sp$0$i$i$i = 1104;
                break;
              } else $sp$183$i = $696;
            }
            if ((label | 0) == 212)
              if (!(HEAP32[($sp$183$i + 12) >> 2] & 8)) {
                HEAP32[$sp$183$i >> 2] = $tbase$255$i;
                $702 = ($sp$183$i + 4) | 0;
                HEAP32[$702 >> 2] = (HEAP32[$702 >> 2] | 0) + $tsize$254$i;
                $706 = ($tbase$255$i + 8) | 0;
                $711 = (($706 & 7) | 0) == 0 ? 0 : (0 - $706) & 7;
                $714 = ($tbase$255$i + ($tsize$254$i + 8)) | 0;
                $719 = (($714 & 7) | 0) == 0 ? 0 : (0 - $714) & 7;
                $720 = ($tbase$255$i + ($719 + $tsize$254$i)) | 0;
                $$sum$i19$i = ($711 + $nb$0) | 0;
                $724 = ($tbase$255$i + $$sum$i19$i) | 0;
                $725 = ($720 - ($tbase$255$i + $711) - $nb$0) | 0;
                HEAP32[($tbase$255$i + ($711 + 4)) >> 2] = $nb$0 | 3;
                L324: do
                  if (($720 | 0) == ($635 | 0)) {
                    $730 = ((HEAP32[167] | 0) + $725) | 0;
                    HEAP32[167] = $730;
                    HEAP32[170] = $724;
                    HEAP32[($tbase$255$i + ($$sum$i19$i + 4)) >> 2] = $730 | 1;
                  } else {
                    if (($720 | 0) == (HEAP32[169] | 0)) {
                      $736 = ((HEAP32[166] | 0) + $725) | 0;
                      HEAP32[166] = $736;
                      HEAP32[169] = $724;
                      HEAP32[($tbase$255$i + ($$sum$i19$i + 4)) >> 2] =
                        $736 | 1;
                      HEAP32[($tbase$255$i + ($736 + $$sum$i19$i)) >> 2] = $736;
                      break;
                    }
                    $$sum2$i21$i = ($tsize$254$i + 4) | 0;
                    $741 =
                      HEAP32[($tbase$255$i + ($719 + $$sum2$i21$i)) >> 2] | 0;
                    if ((($741 & 3) | 0) == 1) {
                      $744 = $741 & -8;
                      $745 = $741 >>> 3;
                      L332: do
                        if ($741 >>> 0 < 256) {
                          $748 =
                            HEAP32[
                              ($tbase$255$i + (($719 | 8) + $tsize$254$i)) >> 2
                            ] | 0;
                          $750 =
                            HEAP32[
                              ($tbase$255$i + ($tsize$254$i + 12 + $719)) >> 2
                            ] | 0;
                          $752 = (696 + (($745 << 1) << 2)) | 0;
                          do
                            if (($748 | 0) != ($752 | 0)) {
                              if ($748 >>> 0 < $755 >>> 0) _abort();
                              if ((HEAP32[($748 + 12) >> 2] | 0) == ($720 | 0))
                                break;
                              _abort();
                            }
                          while (0);
                          if (($750 | 0) == ($748 | 0)) {
                            HEAP32[164] = HEAP32[164] & ~(1 << $745);
                            break;
                          }
                          do
                            if (($750 | 0) == ($752 | 0))
                              $$pre$phi58$i$iZ2D = ($750 + 8) | 0;
                            else {
                              if ($750 >>> 0 < $755 >>> 0) _abort();
                              $766 = ($750 + 8) | 0;
                              if ((HEAP32[$766 >> 2] | 0) == ($720 | 0)) {
                                $$pre$phi58$i$iZ2D = $766;
                                break;
                              }
                              _abort();
                            }
                          while (0);
                          HEAP32[($748 + 12) >> 2] = $750;
                          HEAP32[$$pre$phi58$i$iZ2D >> 2] = $748;
                        } else {
                          $771 =
                            HEAP32[
                              ($tbase$255$i + (($719 | 24) + $tsize$254$i)) >> 2
                            ] | 0;
                          $773 =
                            HEAP32[
                              ($tbase$255$i + ($tsize$254$i + 12 + $719)) >> 2
                            ] | 0;
                          do
                            if (($773 | 0) == ($720 | 0)) {
                              $$sum67$i$i = $719 | 16;
                              $784 =
                                ($tbase$255$i + ($$sum67$i$i + $$sum2$i21$i)) |
                                0;
                              $785 = HEAP32[$784 >> 2] | 0;
                              if (!$785) {
                                $787 =
                                  ($tbase$255$i +
                                    ($$sum67$i$i + $tsize$254$i)) |
                                  0;
                                $788 = HEAP32[$787 >> 2] | 0;
                                if (!$788) {
                                  $R$1$i$i = 0;
                                  break;
                                } else {
                                  $R$0$i$i = $788;
                                  $RP$0$i$i = $787;
                                }
                              } else {
                                $R$0$i$i = $785;
                                $RP$0$i$i = $784;
                              }
                              while (1) {
                                $790 = ($R$0$i$i + 20) | 0;
                                $791 = HEAP32[$790 >> 2] | 0;
                                if ($791) {
                                  $R$0$i$i = $791;
                                  $RP$0$i$i = $790;
                                  continue;
                                }
                                $793 = ($R$0$i$i + 16) | 0;
                                $794 = HEAP32[$793 >> 2] | 0;
                                if (!$794) break;
                                else {
                                  $R$0$i$i = $794;
                                  $RP$0$i$i = $793;
                                }
                              }
                              if ($RP$0$i$i >>> 0 < $755 >>> 0) _abort();
                              else {
                                HEAP32[$RP$0$i$i >> 2] = 0;
                                $R$1$i$i = $R$0$i$i;
                                break;
                              }
                            } else {
                              $776 =
                                HEAP32[
                                  ($tbase$255$i +
                                    (($719 | 8) + $tsize$254$i)) >>
                                    2
                                ] | 0;
                              if ($776 >>> 0 < $755 >>> 0) _abort();
                              $778 = ($776 + 12) | 0;
                              if ((HEAP32[$778 >> 2] | 0) != ($720 | 0))
                                _abort();
                              $781 = ($773 + 8) | 0;
                              if ((HEAP32[$781 >> 2] | 0) == ($720 | 0)) {
                                HEAP32[$778 >> 2] = $773;
                                HEAP32[$781 >> 2] = $776;
                                $R$1$i$i = $773;
                                break;
                              } else _abort();
                            }
                          while (0);
                          if (!$771) break;
                          $799 =
                            HEAP32[
                              ($tbase$255$i + ($tsize$254$i + 28 + $719)) >> 2
                            ] | 0;
                          $800 = (960 + ($799 << 2)) | 0;
                          do
                            if (($720 | 0) == (HEAP32[$800 >> 2] | 0)) {
                              HEAP32[$800 >> 2] = $R$1$i$i;
                              if ($R$1$i$i) break;
                              HEAP32[165] = HEAP32[165] & ~(1 << $799);
                              break L332;
                            } else {
                              if ($771 >>> 0 < (HEAP32[168] | 0) >>> 0)
                                _abort();
                              $809 = ($771 + 16) | 0;
                              if ((HEAP32[$809 >> 2] | 0) == ($720 | 0))
                                HEAP32[$809 >> 2] = $R$1$i$i;
                              else HEAP32[($771 + 20) >> 2] = $R$1$i$i;
                              if (!$R$1$i$i) break L332;
                            }
                          while (0);
                          $814 = HEAP32[168] | 0;
                          if ($R$1$i$i >>> 0 < $814 >>> 0) _abort();
                          HEAP32[($R$1$i$i + 24) >> 2] = $771;
                          $$sum3132$i$i = $719 | 16;
                          $818 =
                            HEAP32[
                              ($tbase$255$i + ($$sum3132$i$i + $tsize$254$i)) >>
                                2
                            ] | 0;
                          do
                            if ($818)
                              if ($818 >>> 0 < $814 >>> 0) _abort();
                              else {
                                HEAP32[($R$1$i$i + 16) >> 2] = $818;
                                HEAP32[($818 + 24) >> 2] = $R$1$i$i;
                                break;
                              }
                          while (0);
                          $824 =
                            HEAP32[
                              ($tbase$255$i + ($$sum3132$i$i + $$sum2$i21$i)) >>
                                2
                            ] | 0;
                          if (!$824) break;
                          if ($824 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                          else {
                            HEAP32[($R$1$i$i + 20) >> 2] = $824;
                            HEAP32[($824 + 24) >> 2] = $R$1$i$i;
                            break;
                          }
                        }
                      while (0);
                      $oldfirst$0$i$i =
                        ($tbase$255$i + (($744 | $719) + $tsize$254$i)) | 0;
                      $qsize$0$i$i = ($744 + $725) | 0;
                    } else {
                      $oldfirst$0$i$i = $720;
                      $qsize$0$i$i = $725;
                    }
                    $832 = ($oldfirst$0$i$i + 4) | 0;
                    HEAP32[$832 >> 2] = HEAP32[$832 >> 2] & -2;
                    HEAP32[($tbase$255$i + ($$sum$i19$i + 4)) >> 2] =
                      $qsize$0$i$i | 1;
                    HEAP32[($tbase$255$i + ($qsize$0$i$i + $$sum$i19$i)) >> 2] =
                      $qsize$0$i$i;
                    $838 = $qsize$0$i$i >>> 3;
                    if ($qsize$0$i$i >>> 0 < 256) {
                      $840 = $838 << 1;
                      $841 = (696 + ($840 << 2)) | 0;
                      $842 = HEAP32[164] | 0;
                      $843 = 1 << $838;
                      do
                        if (!($842 & $843)) {
                          HEAP32[164] = $842 | $843;
                          $$pre$phi$i23$iZ2D = (696 + (($840 + 2) << 2)) | 0;
                          $F4$0$i$i = $841;
                        } else {
                          $847 = (696 + (($840 + 2) << 2)) | 0;
                          $848 = HEAP32[$847 >> 2] | 0;
                          if ($848 >>> 0 >= (HEAP32[168] | 0) >>> 0) {
                            $$pre$phi$i23$iZ2D = $847;
                            $F4$0$i$i = $848;
                            break;
                          }
                          _abort();
                        }
                      while (0);
                      HEAP32[$$pre$phi$i23$iZ2D >> 2] = $724;
                      HEAP32[($F4$0$i$i + 12) >> 2] = $724;
                      HEAP32[($tbase$255$i + ($$sum$i19$i + 8)) >> 2] =
                        $F4$0$i$i;
                      HEAP32[($tbase$255$i + ($$sum$i19$i + 12)) >> 2] = $841;
                      break;
                    }
                    $854 = $qsize$0$i$i >>> 8;
                    do
                      if (!$854) $I7$0$i$i = 0;
                      else {
                        if ($qsize$0$i$i >>> 0 > 16777215) {
                          $I7$0$i$i = 31;
                          break;
                        }
                        $859 = ((($854 + 1048320) | 0) >>> 16) & 8;
                        $860 = $854 << $859;
                        $863 = ((($860 + 520192) | 0) >>> 16) & 4;
                        $865 = $860 << $863;
                        $868 = ((($865 + 245760) | 0) >>> 16) & 2;
                        $873 =
                          (14 -
                            ($863 | $859 | $868) +
                            (($865 << $868) >>> 15)) |
                          0;
                        $I7$0$i$i =
                          (($qsize$0$i$i >>> (($873 + 7) | 0)) & 1) |
                          ($873 << 1);
                      }
                    while (0);
                    $879 = (960 + ($I7$0$i$i << 2)) | 0;
                    HEAP32[($tbase$255$i + ($$sum$i19$i + 28)) >> 2] =
                      $I7$0$i$i;
                    HEAP32[($tbase$255$i + ($$sum$i19$i + 20)) >> 2] = 0;
                    HEAP32[($tbase$255$i + ($$sum$i19$i + 16)) >> 2] = 0;
                    $883 = HEAP32[165] | 0;
                    $884 = 1 << $I7$0$i$i;
                    if (!($883 & $884)) {
                      HEAP32[165] = $883 | $884;
                      HEAP32[$879 >> 2] = $724;
                      HEAP32[($tbase$255$i + ($$sum$i19$i + 24)) >> 2] = $879;
                      HEAP32[($tbase$255$i + ($$sum$i19$i + 12)) >> 2] = $724;
                      HEAP32[($tbase$255$i + ($$sum$i19$i + 8)) >> 2] = $724;
                      break;
                    }
                    $891 = HEAP32[$879 >> 2] | 0;
                    L418: do
                      if (
                        ((HEAP32[($891 + 4) >> 2] & -8) | 0) ==
                        ($qsize$0$i$i | 0)
                      )
                        $T$0$lcssa$i25$i = $891;
                      else {
                        $K8$051$i$i =
                          $qsize$0$i$i <<
                          (($I7$0$i$i | 0) == 31
                            ? 0
                            : (25 - ($I7$0$i$i >>> 1)) | 0);
                        $T$050$i$i = $891;
                        while (1) {
                          $908 =
                            ($T$050$i$i + 16 + (($K8$051$i$i >>> 31) << 2)) | 0;
                          $903 = HEAP32[$908 >> 2] | 0;
                          if (!$903) break;
                          if (
                            ((HEAP32[($903 + 4) >> 2] & -8) | 0) ==
                            ($qsize$0$i$i | 0)
                          ) {
                            $T$0$lcssa$i25$i = $903;
                            break L418;
                          } else {
                            $K8$051$i$i = $K8$051$i$i << 1;
                            $T$050$i$i = $903;
                          }
                        }
                        if ($908 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                        else {
                          HEAP32[$908 >> 2] = $724;
                          HEAP32[($tbase$255$i + ($$sum$i19$i + 24)) >> 2] =
                            $T$050$i$i;
                          HEAP32[($tbase$255$i + ($$sum$i19$i + 12)) >> 2] =
                            $724;
                          HEAP32[($tbase$255$i + ($$sum$i19$i + 8)) >> 2] =
                            $724;
                          break L324;
                        }
                      }
                    while (0);
                    $915 = ($T$0$lcssa$i25$i + 8) | 0;
                    $916 = HEAP32[$915 >> 2] | 0;
                    $917 = HEAP32[168] | 0;
                    if (
                      ($916 >>> 0 >= $917 >>> 0) &
                      ($T$0$lcssa$i25$i >>> 0 >= $917 >>> 0)
                    ) {
                      HEAP32[($916 + 12) >> 2] = $724;
                      HEAP32[$915 >> 2] = $724;
                      HEAP32[($tbase$255$i + ($$sum$i19$i + 8)) >> 2] = $916;
                      HEAP32[($tbase$255$i + ($$sum$i19$i + 12)) >> 2] =
                        $T$0$lcssa$i25$i;
                      HEAP32[($tbase$255$i + ($$sum$i19$i + 24)) >> 2] = 0;
                      break;
                    } else _abort();
                  }
                while (0);
                $mem$0 = ($tbase$255$i + ($711 | 8)) | 0;
                return $mem$0 | 0;
              } else $sp$0$i$i$i = 1104;
            while (1) {
              $925 = HEAP32[$sp$0$i$i$i >> 2] | 0;
              if ($925 >>> 0 <= $635 >>> 0) {
                $928 = HEAP32[($sp$0$i$i$i + 4) >> 2] | 0;
                $929 = ($925 + $928) | 0;
                if ($929 >>> 0 > $635 >>> 0) break;
              }
              $sp$0$i$i$i = HEAP32[($sp$0$i$i$i + 8) >> 2] | 0;
            }
            $934 = ($925 + ($928 + -39)) | 0;
            $940 =
              ($925 +
                ($928 + -47 + ((($934 & 7) | 0) == 0 ? 0 : (0 - $934) & 7))) |
              0;
            $941 = ($635 + 16) | 0;
            $943 = $940 >>> 0 < $941 >>> 0 ? $635 : $940;
            $944 = ($943 + 8) | 0;
            $947 = ($tbase$255$i + 8) | 0;
            $952 = (($947 & 7) | 0) == 0 ? 0 : (0 - $947) & 7;
            $954 = ($tsize$254$i + -40 - $952) | 0;
            HEAP32[170] = $tbase$255$i + $952;
            HEAP32[167] = $954;
            HEAP32[($tbase$255$i + ($952 + 4)) >> 2] = $954 | 1;
            HEAP32[($tbase$255$i + ($tsize$254$i + -36)) >> 2] = 40;
            HEAP32[171] = HEAP32[286];
            $959 = ($943 + 4) | 0;
            HEAP32[$959 >> 2] = 27;
            HEAP32[$944 >> 2] = HEAP32[276];
            HEAP32[($944 + 4) >> 2] = HEAP32[277];
            HEAP32[($944 + 8) >> 2] = HEAP32[278];
            HEAP32[($944 + 12) >> 2] = HEAP32[279];
            HEAP32[276] = $tbase$255$i;
            HEAP32[277] = $tsize$254$i;
            HEAP32[279] = 0;
            HEAP32[278] = $944;
            $960 = ($943 + 28) | 0;
            HEAP32[$960 >> 2] = 7;
            if ((($943 + 32) | 0) >>> 0 < $929 >>> 0) {
              $964 = $960;
              do {
                $964$looptemp = $964;
                $964 = ($964 + 4) | 0;
                HEAP32[$964 >> 2] = 7;
              } while ((($964$looptemp + 8) | 0) >>> 0 < $929 >>> 0);
            }
            if (($943 | 0) != ($635 | 0)) {
              $970 = ($943 - $635) | 0;
              HEAP32[$959 >> 2] = HEAP32[$959 >> 2] & -2;
              HEAP32[($635 + 4) >> 2] = $970 | 1;
              HEAP32[$943 >> 2] = $970;
              $975 = $970 >>> 3;
              if ($970 >>> 0 < 256) {
                $977 = $975 << 1;
                $978 = (696 + ($977 << 2)) | 0;
                $979 = HEAP32[164] | 0;
                $980 = 1 << $975;
                if (!($979 & $980)) {
                  HEAP32[164] = $979 | $980;
                  $$pre$phi$i$iZ2D = (696 + (($977 + 2) << 2)) | 0;
                  $F$0$i$i = $978;
                } else {
                  $984 = (696 + (($977 + 2) << 2)) | 0;
                  $985 = HEAP32[$984 >> 2] | 0;
                  if ($985 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                  else {
                    $$pre$phi$i$iZ2D = $984;
                    $F$0$i$i = $985;
                  }
                }
                HEAP32[$$pre$phi$i$iZ2D >> 2] = $635;
                HEAP32[($F$0$i$i + 12) >> 2] = $635;
                HEAP32[($635 + 8) >> 2] = $F$0$i$i;
                HEAP32[($635 + 12) >> 2] = $978;
                break;
              }
              $991 = $970 >>> 8;
              if (!$991) $I1$0$i$i = 0;
              else if ($970 >>> 0 > 16777215) $I1$0$i$i = 31;
              else {
                $996 = ((($991 + 1048320) | 0) >>> 16) & 8;
                $997 = $991 << $996;
                $1000 = ((($997 + 520192) | 0) >>> 16) & 4;
                $1002 = $997 << $1000;
                $1005 = ((($1002 + 245760) | 0) >>> 16) & 2;
                $1010 =
                  (14 - ($1000 | $996 | $1005) + (($1002 << $1005) >>> 15)) | 0;
                $I1$0$i$i = (($970 >>> (($1010 + 7) | 0)) & 1) | ($1010 << 1);
              }
              $1016 = (960 + ($I1$0$i$i << 2)) | 0;
              HEAP32[($635 + 28) >> 2] = $I1$0$i$i;
              HEAP32[($635 + 20) >> 2] = 0;
              HEAP32[$941 >> 2] = 0;
              $1019 = HEAP32[165] | 0;
              $1020 = 1 << $I1$0$i$i;
              if (!($1019 & $1020)) {
                HEAP32[165] = $1019 | $1020;
                HEAP32[$1016 >> 2] = $635;
                HEAP32[($635 + 24) >> 2] = $1016;
                HEAP32[($635 + 12) >> 2] = $635;
                HEAP32[($635 + 8) >> 2] = $635;
                break;
              }
              $1027 = HEAP32[$1016 >> 2] | 0;
              L459: do
                if (((HEAP32[($1027 + 4) >> 2] & -8) | 0) == ($970 | 0))
                  $T$0$lcssa$i$i = $1027;
                else {
                  $K2$07$i$i =
                    $970 <<
                    (($I1$0$i$i | 0) == 31 ? 0 : (25 - ($I1$0$i$i >>> 1)) | 0);
                  $T$06$i$i = $1027;
                  while (1) {
                    $1044 = ($T$06$i$i + 16 + (($K2$07$i$i >>> 31) << 2)) | 0;
                    $1039 = HEAP32[$1044 >> 2] | 0;
                    if (!$1039) break;
                    if (((HEAP32[($1039 + 4) >> 2] & -8) | 0) == ($970 | 0)) {
                      $T$0$lcssa$i$i = $1039;
                      break L459;
                    } else {
                      $K2$07$i$i = $K2$07$i$i << 1;
                      $T$06$i$i = $1039;
                    }
                  }
                  if ($1044 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                  else {
                    HEAP32[$1044 >> 2] = $635;
                    HEAP32[($635 + 24) >> 2] = $T$06$i$i;
                    HEAP32[($635 + 12) >> 2] = $635;
                    HEAP32[($635 + 8) >> 2] = $635;
                    break L299;
                  }
                }
              while (0);
              $1051 = ($T$0$lcssa$i$i + 8) | 0;
              $1052 = HEAP32[$1051 >> 2] | 0;
              $1053 = HEAP32[168] | 0;
              if (
                ($1052 >>> 0 >= $1053 >>> 0) &
                ($T$0$lcssa$i$i >>> 0 >= $1053 >>> 0)
              ) {
                HEAP32[($1052 + 12) >> 2] = $635;
                HEAP32[$1051 >> 2] = $635;
                HEAP32[($635 + 8) >> 2] = $1052;
                HEAP32[($635 + 12) >> 2] = $T$0$lcssa$i$i;
                HEAP32[($635 + 24) >> 2] = 0;
                break;
              } else _abort();
            }
          }
        while (0);
        $1060 = HEAP32[167] | 0;
        if ($1060 >>> 0 > $nb$0 >>> 0) {
          $1062 = ($1060 - $nb$0) | 0;
          HEAP32[167] = $1062;
          $1063 = HEAP32[170] | 0;
          HEAP32[170] = $1063 + $nb$0;
          HEAP32[($1063 + ($nb$0 + 4)) >> 2] = $1062 | 1;
          HEAP32[($1063 + 4) >> 2] = $nb$0 | 3;
          $mem$0 = ($1063 + 8) | 0;
          return $mem$0 | 0;
        }
      }
      $1070 = ___errno_location() | 0;
      HEAP32[$1070 >> 2] = 12;
      $mem$0 = 0;
      return $mem$0 | 0;
    }
    function __ZL12shapeUnicodePtiijP10UErrorCodei15uShapeVariables(
      $dest,
      $sourceLength,
      $pErrorCode,
      $shapeVars,
    ) {
      $dest = $dest | 0;
      $sourceLength = $sourceLength | 0;
      $pErrorCode = $pErrorCode | 0;
      $shapeVars = $shapeVars | 0;
      var $$0 = 0,
        $$0$i$ph = 0,
        $$0$i21 = 0,
        $$1 = 0,
        $$2$i = 0,
        $$3$i = 0,
        $$814$i = 0,
        $$mux = 0,
        $$mux12 = 0,
        $$phi$trans$insert = 0,
        $$pre$phi38Z2D = 0,
        $0 = 0,
        $1 = 0,
        $105 = 0,
        $106 = 0,
        $108 = 0,
        $114 = 0,
        $116 = 0,
        $118 = 0,
        $120 = 0,
        $121 = 0,
        $122 = 0,
        $123 = 0,
        $126 = 0,
        $128 = 0,
        $14 = 0,
        $152 = 0,
        $154 = 0,
        $164 = 0,
        $165 = 0,
        $167 = 0,
        $169 = 0,
        $19 = 0,
        $2 = 0,
        $28 = 0,
        $3 = 0,
        $32 = 0,
        $34 = 0,
        $40 = 0,
        $51 = 0,
        $55 = 0,
        $58 = 0,
        $59 = 0,
        $60 = 0,
        $62 = 0,
        $66 = 0,
        $69 = 0,
        $7 = 0,
        $70 = 0,
        $80 = 0,
        $81 = 0,
        $94 = 0,
        $Nw$0 = 0,
        $Nw$0$ = 0,
        $Nw$0$ph = 0,
        $Nx$080 = 0,
        $Nx$1$ph = 0,
        $Nx$2 = 0,
        $Shape$0 = 0,
        $count$0$i$lcssa4 = 0,
        $count$0$i76 = 0,
        $count$1$i = 0,
        $count$2$i71 = 0,
        $count$3$i64 = 0,
        $count$4$i = 0,
        $count$5$i$lcssa5 = 0,
        $count$5$i57 = 0,
        $count$6$i = 0,
        $count$7$i54 = 0,
        $currLink$087 = 0,
        $currLink$1 = 0,
        $currLink$2 = 0,
        $currLink$2$lastLink$2 = 0,
        $i$0$i74 = 0,
        $i$096 = 0,
        $i$1$i70 = 0,
        $i$190 = 0,
        $i$2 = 0,
        $i$3 = 0,
        $i$3$i62 = 0,
        $i$4 = 0,
        $i$4$i60 = 0,
        $i$4$lastPos$0 = 0,
        $i$5$i55 = 0,
        $i$6$i53 = 0,
        $j$0$i75 = 0,
        $j$1$i = 0,
        $j$2$i63 = 0,
        $j$3$i = 0,
        $j$4$i56 = 0,
        $j$5$i = 0,
        $lamalef_found$081 = 0,
        $lamalef_found$1 = 0,
        $lamalef_found$2 = 0,
        $lastLink$086 = 0,
        $lastLink$1 = 0,
        $lastLink$2 = 0,
        $lastLink$2$prevLink$0 = 0,
        $lastPos$089 = 0,
        $nextLink$088 = 0,
        $nextLink$1 = 0,
        $nextLink$1$ph = 0,
        $nextLink$2 = 0,
        $prevLink$085 = 0,
        $seenfamFound$0$lcssa3 = 0,
        $seenfamFound$082 = 0,
        $seenfamFound$1 = 0,
        $seenfamFound$2 = 0,
        $t$0$i$i = 0,
        $yehhamzaFound$0$lcssa2 = 0,
        $yehhamzaFound$083 = 0,
        $yehhamzaFound$1 = 0,
        $yehhamzaFound$2 = 0,
        label = 0;
      $0 = ($sourceLength | 0) > 0;
      if ($0) {
        $i$096 = 0;
        do {
          $1 = ($dest + ($i$096 << 1)) | 0;
          $2 = HEAP16[$1 >> 1] | 0;
          $3 = $2 & 65535;
          do
            if ((($2 + 1200) & 65535) < 176) {
              $7 = HEAP16[(1152 + (($3 + -64336) << 1)) >> 1] | 0;
              if (($7 << 16) >> 16) HEAP16[$1 >> 1] = $7;
            } else if ((($2 + 400) & 65535) < 141) {
              HEAP16[$1 >> 1] = HEAP16[(1504 + (($3 + -65136) << 1)) >> 1] | 0;
              break;
            } else {
              HEAP16[$1 >> 1] = $2;
              break;
            }
          while (0);
          $i$096 = ($i$096 + 1) | 0;
        } while (($i$096 | 0) != ($sourceLength | 0));
      }
      $14 = ($sourceLength + -1) | 0;
      do
        if (!$sourceLength) {
          $$0 = 0;
          $seenfamFound$0$lcssa3 = 0;
          $yehhamzaFound$0$lcssa2 = 0;
        } else {
          $Nx$080 = -2;
          $currLink$087 =
            __ZL7getLinkt(HEAP16[($dest + ($14 << 1)) >> 1] | 0) | 0;
          $i$190 = $14;
          $lamalef_found$081 = 0;
          $lastLink$086 = 0;
          $lastPos$089 = $14;
          $nextLink$088 = 0;
          $prevLink$085 = 0;
          $seenfamFound$082 = 0;
          $yehhamzaFound$083 = 0;
          while (1) {
            $19 = $currLink$087 & 65535;
            if (!($19 & 65280))
              if (
                !(
                  (__ZL7getLinkt(HEAP16[($dest + ($i$190 << 1)) >> 1] | 0) |
                    0) &
                  4
                )
              ) {
                $Nx$2 = $Nx$080;
                $currLink$2 = $currLink$087;
                $i$4 = $i$190;
                $lamalef_found$2 = $lamalef_found$081;
                $lastLink$2 = $lastLink$086;
                $nextLink$2 = $nextLink$088;
                $seenfamFound$2 = $seenfamFound$082;
                $yehhamzaFound$2 = $yehhamzaFound$083;
              } else label = 13;
            else label = 13;
            do
              if ((label | 0) == 13) {
                label = 0;
                $Nw$0$ph = ($i$190 + -1) | 0;
                $Nx$1$ph = $Nx$080;
                $nextLink$1$ph = $nextLink$088;
                L21: while (1) {
                  $28 = ($Nx$1$ph | 0) < 0;
                  $Nw$0 = $Nw$0$ph;
                  $nextLink$1 = $nextLink$1$ph;
                  while (1) {
                    if (!$28) break L21;
                    if (($Nw$0 | 0) == -1) {
                      $Nw$0$ph = -1;
                      $Nx$1$ph = 3e3;
                      $nextLink$1$ph = 0;
                      continue L21;
                    }
                    $32 =
                      __ZL7getLinkt(HEAP16[($dest + ($Nw$0 << 1)) >> 1] | 0) |
                      0;
                    $34 = ($32 & 4) == 0;
                    $Nw$0$ = (((($34 ^ 1) << 31) >> 31) + $Nw$0) | 0;
                    if ($34) {
                      $Nw$0$ph = $Nw$0$;
                      $Nx$1$ph = $Nw$0;
                      $nextLink$1$ph = $32;
                      continue L21;
                    } else {
                      $Nw$0 = $Nw$0$;
                      $nextLink$1 = $32;
                    }
                  }
                }
                if ((($lastLink$086 & 16) == 0) | ((($19 & 32) | 0) == 0)) {
                  $currLink$1 = $currLink$087;
                  $i$3 = $i$190;
                  $lamalef_found$1 = $lamalef_found$081;
                  $lastLink$1 = $lastLink$086;
                } else {
                  $40 = ($dest + ($i$190 << 1)) | 0;
                  switch (HEAPU16[$40 >> 1] | 0) {
                    case 1570: {
                      $$0$i$ph = 1628;
                      label = 23;
                      break;
                    }
                    case 1571: {
                      $$0$i$ph = 1629;
                      label = 23;
                      break;
                    }
                    case 1573: {
                      $$0$i$ph = 1630;
                      label = 23;
                      break;
                    }
                    case 1575: {
                      $$0$i$ph = 1631;
                      label = 23;
                      break;
                    }
                    default: {
                      $$0$i21 = 0;
                      $i$2 = $i$190;
                    }
                  }
                  if ((label | 0) == 23) {
                    label = 0;
                    HEAP16[$40 >> 1] = -1;
                    HEAP16[($dest + ($lastPos$089 << 1)) >> 1] = $$0$i$ph;
                    $$0$i21 = $$0$i$ph;
                    $i$2 = $lastPos$089;
                  }
                  $currLink$1 = __ZL7getLinkt($$0$i21) | 0;
                  $i$3 = $i$2;
                  $lamalef_found$1 = 1;
                  $lastLink$1 = $prevLink$085;
                }
                if (($i$3 | 0) > 0)
                  if ((HEAP16[($dest + (($i$3 + -1) << 1)) >> 1] | 0) == 32) {
                    $51 = HEAP16[($dest + ($i$3 << 1)) >> 1] | 0;
                    if ((($51 + -1587) & 65535) < 4) {
                      $seenfamFound$1 = 1;
                      $yehhamzaFound$1 = $yehhamzaFound$083;
                    } else {
                      $seenfamFound$1 = $seenfamFound$082;
                      $yehhamzaFound$1 =
                        ($51 << 16) >> 16 == 1574 ? 1 : $yehhamzaFound$083;
                    }
                  } else {
                    $seenfamFound$1 = $seenfamFound$082;
                    $yehhamzaFound$1 = $yehhamzaFound$083;
                  }
                else if (!$i$3) {
                  $55 = HEAP16[$dest >> 1] | 0;
                  if ((($55 + -1587) & 65535) < 4) {
                    $seenfamFound$1 = 1;
                    $yehhamzaFound$1 = $yehhamzaFound$083;
                  } else {
                    $seenfamFound$1 = $seenfamFound$082;
                    $yehhamzaFound$1 =
                      ($55 << 16) >> 16 == 1574 ? 1 : $yehhamzaFound$083;
                  }
                } else {
                  $seenfamFound$1 = $seenfamFound$082;
                  $yehhamzaFound$1 = $yehhamzaFound$083;
                }
                $58 = $currLink$1 & 65535;
                $59 = $58 & 3;
                $60 = $lastLink$1 & 65535;
                $62 = $nextLink$1 & 65535;
                $66 =
                  HEAPU8[
                    (67805 + (($62 & 3) << 4) + (($60 & 3) << 2) + $59) >> 0
                  ] | 0;
                if (($59 | 0) == 1) {
                  $$phi$trans$insert = ($dest + ($i$3 << 1)) | 0;
                  $$pre$phi38Z2D = $$phi$trans$insert;
                  $81 = HEAP16[$$phi$trans$insert >> 1] | 0;
                  $Shape$0 = $66 & 1;
                } else {
                  $69 = ($dest + ($i$3 << 1)) | 0;
                  $70 = HEAP16[$69 >> 1] | 0;
                  if ((($70 + -1611) & 65535) < 8)
                    if (!($60 & 2)) {
                      $$pre$phi38Z2D = $69;
                      $81 = $70;
                      $Shape$0 = 0;
                    } else if (
                      ((($62 & 1) | 0) == 0) |
                      ((($70 & -2) << 16) >> 16 == 1612)
                    ) {
                      $$pre$phi38Z2D = $69;
                      $81 = $70;
                      $Shape$0 = 0;
                    } else {
                      $$pre$phi38Z2D = $69;
                      $81 = $70;
                      $Shape$0 =
                        ((($60 >>> 4) & 1) ^ 1) | ((($62 >>> 5) & 1) ^ 1);
                    }
                  else {
                    $$pre$phi38Z2D = $69;
                    $81 = $70;
                    $Shape$0 = $66;
                  }
                }
                $80 = $81 & 65535;
                if (($80 ^ 1536) >>> 0 < 256) {
                  if ((($81 + -1611) & 65535) < 8) {
                    HEAP16[$$pre$phi38Z2D >> 1] =
                      $Shape$0 +
                      65136 +
                      (HEAPU8[(67869 + ($80 + -1611)) >> 0] | 0);
                    $Nx$2 = $Nx$1$ph;
                    $currLink$2 = $currLink$1;
                    $i$4 = $i$3;
                    $lamalef_found$2 = $lamalef_found$1;
                    $lastLink$2 = $lastLink$1;
                    $nextLink$2 = $nextLink$1;
                    $seenfamFound$2 = $seenfamFound$1;
                    $yehhamzaFound$2 = $yehhamzaFound$1;
                    break;
                  }
                  $94 = $58 >>> 8;
                  if ($58 & 8) {
                    HEAP16[$$pre$phi38Z2D >> 1] = $94 + 64336 + $Shape$0;
                    $Nx$2 = $Nx$1$ph;
                    $currLink$2 = $currLink$1;
                    $i$4 = $i$3;
                    $lamalef_found$2 = $lamalef_found$1;
                    $lastLink$2 = $lastLink$1;
                    $nextLink$2 = $nextLink$1;
                    $seenfamFound$2 = $seenfamFound$1;
                    $yehhamzaFound$2 = $yehhamzaFound$1;
                    break;
                  }
                  if ((($94 | 0) != 0) & ((($58 & 4) | 0) == 0)) {
                    HEAP16[$$pre$phi38Z2D >> 1] = $94 + 65136 + $Shape$0;
                    $Nx$2 = $Nx$1$ph;
                    $currLink$2 = $currLink$1;
                    $i$4 = $i$3;
                    $lamalef_found$2 = $lamalef_found$1;
                    $lastLink$2 = $lastLink$1;
                    $nextLink$2 = $nextLink$1;
                    $seenfamFound$2 = $seenfamFound$1;
                    $yehhamzaFound$2 = $yehhamzaFound$1;
                  } else {
                    $Nx$2 = $Nx$1$ph;
                    $currLink$2 = $currLink$1;
                    $i$4 = $i$3;
                    $lamalef_found$2 = $lamalef_found$1;
                    $lastLink$2 = $lastLink$1;
                    $nextLink$2 = $nextLink$1;
                    $seenfamFound$2 = $seenfamFound$1;
                    $yehhamzaFound$2 = $yehhamzaFound$1;
                  }
                } else {
                  $Nx$2 = $Nx$1$ph;
                  $currLink$2 = $currLink$1;
                  $i$4 = $i$3;
                  $lamalef_found$2 = $lamalef_found$1;
                  $lastLink$2 = $lastLink$1;
                  $nextLink$2 = $nextLink$1;
                  $seenfamFound$2 = $seenfamFound$1;
                  $yehhamzaFound$2 = $yehhamzaFound$1;
                }
              }
            while (0);
            $105 = ($currLink$2 & 4) == 0;
            $lastLink$2$prevLink$0 = $105 ? $lastLink$2 : $prevLink$085;
            $currLink$2$lastLink$2 = $105 ? $currLink$2 : $lastLink$2;
            $i$4$lastPos$0 = $105 ? $i$4 : $lastPos$089;
            $106 = ($i$4 + -1) | 0;
            $108 = ($i$4 | 0) == 0;
            if (($106 | 0) == ($Nx$2 | 0))
              if ($108) break;
              else {
                $Nx$080 = -2;
                $currLink$087 = $nextLink$2;
                $i$190 = $106;
                $lamalef_found$081 = $lamalef_found$2;
                $lastLink$086 = $currLink$2$lastLink$2;
                $lastPos$089 = $i$4$lastPos$0;
                $nextLink$088 = $nextLink$2;
                $prevLink$085 = $lastLink$2$prevLink$0;
                $seenfamFound$082 = $seenfamFound$2;
                $yehhamzaFound$083 = $yehhamzaFound$2;
                continue;
              }
            if ($108) break;
            $Nx$080 = $Nx$2;
            $currLink$087 =
              __ZL7getLinkt(HEAP16[($dest + ($106 << 1)) >> 1] | 0) | 0;
            $i$190 = $106;
            $lamalef_found$081 = $lamalef_found$2;
            $lastLink$086 = $currLink$2$lastLink$2;
            $lastPos$089 = $i$4$lastPos$0;
            $nextLink$088 = $nextLink$2;
            $prevLink$085 = $lastLink$2$prevLink$0;
            $seenfamFound$082 = $seenfamFound$2;
            $yehhamzaFound$083 = $yehhamzaFound$2;
          }
          if (!$lamalef_found$2) {
            $$0 = $sourceLength;
            $seenfamFound$0$lcssa3 = $seenfamFound$2;
            $yehhamzaFound$0$lcssa2 = $yehhamzaFound$2;
          } else {
            $114 = HEAP32[($shapeVars + 4) >> 2] | 0;
            $116 = HEAP32[($shapeVars + 8) >> 2] | 0;
            $118 = HEAP32[($shapeVars + 12) >> 2] | 0;
            $120 = HEAP32[($shapeVars + 16) >> 2] | 0;
            $121 = $sourceLength << 1;
            $122 = ($121 + 2) | 0;
            $123 = _uprv_malloc_58($122) | 0;
            if (!$123) {
              HEAP32[$pErrorCode >> 2] = 7;
              $$0 = 0;
              $seenfamFound$0$lcssa3 = $seenfamFound$2;
              $yehhamzaFound$0$lcssa2 = $yehhamzaFound$2;
              break;
            }
            _memset($123 | 0, 0, $122 | 0) | 0;
            if ($0) {
              $count$0$i76 = 0;
              $i$0$i74 = 0;
              $j$0$i75 = 0;
              while (1) {
                $128 = HEAP16[($dest + ($i$0$i74 << 1)) >> 1] | 0;
                if (($128 << 16) >> 16 == -1) {
                  $count$1$i = ($count$0$i76 + 1) | 0;
                  $j$1$i = ($j$0$i75 + -1) | 0;
                } else {
                  HEAP16[($123 + ($j$0$i75 << 1)) >> 1] = $128;
                  $count$1$i = $count$0$i76;
                  $j$1$i = $j$0$i75;
                }
                $i$0$i74 = ($i$0$i74 + 1) | 0;
                if (($i$0$i74 | 0) == ($sourceLength | 0)) break;
                else {
                  $count$0$i76 = $count$1$i;
                  $j$0$i75 = ($j$1$i + 1) | 0;
                }
              }
              if (($count$1$i | 0) > -1) {
                $126 = 1;
                $count$0$i$lcssa4 = $count$1$i;
                label = 54;
              } else label = 61;
            } else {
              $126 = 0;
              $count$0$i$lcssa4 = 0;
              label = 54;
            }
            if ((label | 0) == 54) {
              $count$2$i71 = $count$0$i$lcssa4;
              $i$1$i70 = $126 ? $sourceLength : 0;
              while (1) {
                HEAP16[($123 + ($i$1$i70 << 1)) >> 1] = 0;
                if (($count$2$i71 | 0) > 0) {
                  $count$2$i71 = ($count$2$i71 + -1) | 0;
                  $i$1$i70 = ($i$1$i70 + -1) | 0;
                } else break;
              }
              if ($126) label = 61;
              else $t$0$i$i = $dest;
            }
            if ((label | 0) == 61) {
              _memcpy($dest | 0, $123 | 0, $121 | 0) | 0;
              $t$0$i$i = $dest;
            }
            while (1)
              if (!(HEAP16[$t$0$i$i >> 1] | 0)) break;
              else $t$0$i$i = ($t$0$i$i + 2) | 0;
            if (!$114) {
              $$814$i = ($118 | 0) == 0;
              $154 = 1;
              label = 66;
            } else if (!$118) {
              $$814$i = 1;
              $154 = 0;
              label = 66;
            } else $$2$i = ($t$0$i$i - $dest) >> 1;
            if ((label | 0) == 66) {
              _memset($123 | 0, 0, $122 | 0) | 0;
              if (($sourceLength | 0) > -1) {
                $count$3$i64 = 0;
                $i$3$i62 = $sourceLength;
                $j$2$i63 = $sourceLength;
                while (1) {
                  $152 = HEAP16[($dest + ($i$3$i62 << 1)) >> 1] | 0;
                  if (
                    ($154 & (($152 << 16) >> 16 == -1)) |
                    ($$814$i & (($152 << 16) >> 16 == -2))
                  ) {
                    $count$4$i = ($count$3$i64 + 1) | 0;
                    $j$3$i = ($j$2$i63 + 1) | 0;
                  } else {
                    HEAP16[($123 + ($j$2$i63 << 1)) >> 1] = $152;
                    $count$4$i = $count$3$i64;
                    $j$3$i = $j$2$i63;
                  }
                  if (($i$3$i62 | 0) > 0) {
                    $count$3$i64 = $count$4$i;
                    $i$3$i62 = ($i$3$i62 + -1) | 0;
                    $j$2$i63 = ($j$3$i + -1) | 0;
                  } else break;
                }
                if (($count$4$i | 0) > 0) {
                  $i$4$i60 = 0;
                  do {
                    HEAP16[($123 + ($i$4$i60 << 1)) >> 1] = 32;
                    $i$4$i60 = ($i$4$i60 + 1) | 0;
                  } while (($i$4$i60 | 0) != ($count$4$i | 0));
                }
                if ($0) {
                  _memcpy($dest | 0, $123 | 0, $121 | 0) | 0;
                  $$2$i = $sourceLength;
                } else $$2$i = $sourceLength;
              } else $$2$i = $sourceLength;
            }
            $164 = ($116 | 0) == 0;
            $165 = ($120 | 0) == 0;
            $$mux = $164 ? 1 : 0;
            $$mux12 = $164 ? $165 : 1;
            do
              if ($164 | $165) {
                _memset($123 | 0, 0, $122 | 0) | 0;
                if ($0) {
                  $count$5$i57 = 0;
                  $i$5$i55 = 0;
                  $j$4$i56 = 0;
                  while (1) {
                    $169 = HEAP16[($dest + ($i$5$i55 << 1)) >> 1] | 0;
                    if (
                      ($$mux & (($169 << 16) >> 16 == -1)) |
                      ($$mux12 & (($169 << 16) >> 16 == -2))
                    ) {
                      $count$6$i = ($count$5$i57 + 1) | 0;
                      $j$5$i = ($j$4$i56 + -1) | 0;
                    } else {
                      HEAP16[($123 + ($j$4$i56 << 1)) >> 1] = $169;
                      $count$6$i = $count$5$i57;
                      $j$5$i = $j$4$i56;
                    }
                    $i$5$i55 = ($i$5$i55 + 1) | 0;
                    if (($i$5$i55 | 0) == ($sourceLength | 0)) break;
                    else {
                      $count$5$i57 = $count$6$i;
                      $j$4$i56 = ($j$5$i + 1) | 0;
                    }
                  }
                  if (($count$6$i | 0) > -1) {
                    $167 = 1;
                    $count$5$i$lcssa5 = $count$6$i;
                    label = 78;
                  }
                } else {
                  $167 = 0;
                  $count$5$i$lcssa5 = 0;
                  label = 78;
                }
                if ((label | 0) == 78) {
                  $count$7$i54 = $count$5$i$lcssa5;
                  $i$6$i53 = $167 ? $sourceLength : 0;
                  while (1) {
                    HEAP16[($123 + ($i$6$i53 << 1)) >> 1] = 32;
                    if (($count$7$i54 | 0) > 0) {
                      $count$7$i54 = ($count$7$i54 + -1) | 0;
                      $i$6$i53 = ($i$6$i53 + -1) | 0;
                    } else break;
                  }
                  if (!$167) {
                    $$3$i = $sourceLength;
                    break;
                  }
                }
                _memcpy($dest | 0, $123 | 0, $121 | 0) | 0;
                $$3$i = $sourceLength;
              } else $$3$i = $$2$i;
            while (0);
            _uprv_free_58($123);
            $$0 = $$3$i;
            $seenfamFound$0$lcssa3 = $seenfamFound$2;
            $yehhamzaFound$0$lcssa2 = $yehhamzaFound$2;
          }
        }
      while (0);
      if (!($yehhamzaFound$0$lcssa2 | $seenfamFound$0$lcssa3)) {
        $$1 = $$0;
        return $$1 | 0;
      }
      $$1 =
        __ZL18expandCompositCharPtiijP10UErrorCodei15uShapeVariables($$0) | 0;
      return $$1 | 0;
    }
    function _free($mem) {
      $mem = $mem | 0;
      var $$pre$phi59Z2D = 0,
        $$pre$phi61Z2D = 0,
        $$pre$phiZ2D = 0,
        $$sum2 = 0,
        $1 = 0,
        $103 = 0,
        $104 = 0,
        $111 = 0,
        $112 = 0,
        $12 = 0,
        $120 = 0,
        $128 = 0,
        $133 = 0,
        $134 = 0,
        $137 = 0,
        $139 = 0,
        $14 = 0,
        $141 = 0,
        $15 = 0,
        $156 = 0,
        $161 = 0,
        $163 = 0,
        $166 = 0,
        $169 = 0,
        $172 = 0,
        $175 = 0,
        $176 = 0,
        $178 = 0,
        $179 = 0,
        $181 = 0,
        $182 = 0,
        $184 = 0,
        $185 = 0,
        $19 = 0,
        $191 = 0,
        $192 = 0,
        $2 = 0,
        $201 = 0,
        $206 = 0,
        $210 = 0,
        $216 = 0,
        $22 = 0,
        $231 = 0,
        $233 = 0,
        $234 = 0,
        $235 = 0,
        $236 = 0,
        $24 = 0,
        $240 = 0,
        $241 = 0,
        $247 = 0,
        $252 = 0,
        $253 = 0,
        $256 = 0,
        $258 = 0,
        $26 = 0,
        $261 = 0,
        $266 = 0,
        $272 = 0,
        $276 = 0,
        $277 = 0,
        $284 = 0,
        $296 = 0,
        $301 = 0,
        $308 = 0,
        $309 = 0,
        $310 = 0,
        $318 = 0,
        $39 = 0,
        $44 = 0,
        $46 = 0,
        $49 = 0,
        $5 = 0,
        $51 = 0,
        $54 = 0,
        $57 = 0,
        $58 = 0,
        $6 = 0,
        $60 = 0,
        $61 = 0,
        $63 = 0,
        $64 = 0,
        $66 = 0,
        $67 = 0,
        $72 = 0,
        $73 = 0,
        $8 = 0,
        $82 = 0,
        $87 = 0,
        $9 = 0,
        $91 = 0,
        $97 = 0,
        $F16$0 = 0,
        $I18$0 = 0,
        $K19$052 = 0,
        $R$0 = 0,
        $R$1 = 0,
        $R7$0 = 0,
        $R7$1 = 0,
        $RP$0 = 0,
        $RP9$0 = 0,
        $T$0$lcssa = 0,
        $T$051 = 0,
        $p$0 = 0,
        $psize$0 = 0,
        $psize$1 = 0,
        $sp$0$i = 0,
        $sp$0$in$i = 0;
      if (!$mem) return;
      $1 = ($mem + -8) | 0;
      $2 = HEAP32[168] | 0;
      if ($1 >>> 0 < $2 >>> 0) _abort();
      $5 = HEAP32[($mem + -4) >> 2] | 0;
      $6 = $5 & 3;
      if (($6 | 0) == 1) _abort();
      $8 = $5 & -8;
      $9 = ($mem + ($8 + -8)) | 0;
      do
        if (!($5 & 1)) {
          $12 = HEAP32[$1 >> 2] | 0;
          if (!$6) return;
          $$sum2 = (-8 - $12) | 0;
          $14 = ($mem + $$sum2) | 0;
          $15 = ($12 + $8) | 0;
          if ($14 >>> 0 < $2 >>> 0) _abort();
          if (($14 | 0) == (HEAP32[169] | 0)) {
            $103 = ($mem + ($8 + -4)) | 0;
            $104 = HEAP32[$103 >> 2] | 0;
            if ((($104 & 3) | 0) != 3) {
              $p$0 = $14;
              $psize$0 = $15;
              break;
            }
            HEAP32[166] = $15;
            HEAP32[$103 >> 2] = $104 & -2;
            HEAP32[($mem + ($$sum2 + 4)) >> 2] = $15 | 1;
            HEAP32[$9 >> 2] = $15;
            return;
          }
          $19 = $12 >>> 3;
          if ($12 >>> 0 < 256) {
            $22 = HEAP32[($mem + ($$sum2 + 8)) >> 2] | 0;
            $24 = HEAP32[($mem + ($$sum2 + 12)) >> 2] | 0;
            $26 = (696 + (($19 << 1) << 2)) | 0;
            if (($22 | 0) != ($26 | 0)) {
              if ($22 >>> 0 < $2 >>> 0) _abort();
              if ((HEAP32[($22 + 12) >> 2] | 0) != ($14 | 0)) _abort();
            }
            if (($24 | 0) == ($22 | 0)) {
              HEAP32[164] = HEAP32[164] & ~(1 << $19);
              $p$0 = $14;
              $psize$0 = $15;
              break;
            }
            if (($24 | 0) == ($26 | 0)) $$pre$phi61Z2D = ($24 + 8) | 0;
            else {
              if ($24 >>> 0 < $2 >>> 0) _abort();
              $39 = ($24 + 8) | 0;
              if ((HEAP32[$39 >> 2] | 0) == ($14 | 0)) $$pre$phi61Z2D = $39;
              else _abort();
            }
            HEAP32[($22 + 12) >> 2] = $24;
            HEAP32[$$pre$phi61Z2D >> 2] = $22;
            $p$0 = $14;
            $psize$0 = $15;
            break;
          }
          $44 = HEAP32[($mem + ($$sum2 + 24)) >> 2] | 0;
          $46 = HEAP32[($mem + ($$sum2 + 12)) >> 2] | 0;
          do
            if (($46 | 0) == ($14 | 0)) {
              $57 = ($mem + ($$sum2 + 20)) | 0;
              $58 = HEAP32[$57 >> 2] | 0;
              if (!$58) {
                $60 = ($mem + ($$sum2 + 16)) | 0;
                $61 = HEAP32[$60 >> 2] | 0;
                if (!$61) {
                  $R$1 = 0;
                  break;
                } else {
                  $R$0 = $61;
                  $RP$0 = $60;
                }
              } else {
                $R$0 = $58;
                $RP$0 = $57;
              }
              while (1) {
                $63 = ($R$0 + 20) | 0;
                $64 = HEAP32[$63 >> 2] | 0;
                if ($64) {
                  $R$0 = $64;
                  $RP$0 = $63;
                  continue;
                }
                $66 = ($R$0 + 16) | 0;
                $67 = HEAP32[$66 >> 2] | 0;
                if (!$67) break;
                else {
                  $R$0 = $67;
                  $RP$0 = $66;
                }
              }
              if ($RP$0 >>> 0 < $2 >>> 0) _abort();
              else {
                HEAP32[$RP$0 >> 2] = 0;
                $R$1 = $R$0;
                break;
              }
            } else {
              $49 = HEAP32[($mem + ($$sum2 + 8)) >> 2] | 0;
              if ($49 >>> 0 < $2 >>> 0) _abort();
              $51 = ($49 + 12) | 0;
              if ((HEAP32[$51 >> 2] | 0) != ($14 | 0)) _abort();
              $54 = ($46 + 8) | 0;
              if ((HEAP32[$54 >> 2] | 0) == ($14 | 0)) {
                HEAP32[$51 >> 2] = $46;
                HEAP32[$54 >> 2] = $49;
                $R$1 = $46;
                break;
              } else _abort();
            }
          while (0);
          if (!$44) {
            $p$0 = $14;
            $psize$0 = $15;
          } else {
            $72 = HEAP32[($mem + ($$sum2 + 28)) >> 2] | 0;
            $73 = (960 + ($72 << 2)) | 0;
            if (($14 | 0) == (HEAP32[$73 >> 2] | 0)) {
              HEAP32[$73 >> 2] = $R$1;
              if (!$R$1) {
                HEAP32[165] = HEAP32[165] & ~(1 << $72);
                $p$0 = $14;
                $psize$0 = $15;
                break;
              }
            } else {
              if ($44 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
              $82 = ($44 + 16) | 0;
              if ((HEAP32[$82 >> 2] | 0) == ($14 | 0)) HEAP32[$82 >> 2] = $R$1;
              else HEAP32[($44 + 20) >> 2] = $R$1;
              if (!$R$1) {
                $p$0 = $14;
                $psize$0 = $15;
                break;
              }
            }
            $87 = HEAP32[168] | 0;
            if ($R$1 >>> 0 < $87 >>> 0) _abort();
            HEAP32[($R$1 + 24) >> 2] = $44;
            $91 = HEAP32[($mem + ($$sum2 + 16)) >> 2] | 0;
            do
              if ($91)
                if ($91 >>> 0 < $87 >>> 0) _abort();
                else {
                  HEAP32[($R$1 + 16) >> 2] = $91;
                  HEAP32[($91 + 24) >> 2] = $R$1;
                  break;
                }
            while (0);
            $97 = HEAP32[($mem + ($$sum2 + 20)) >> 2] | 0;
            if (!$97) {
              $p$0 = $14;
              $psize$0 = $15;
            } else if ($97 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
            else {
              HEAP32[($R$1 + 20) >> 2] = $97;
              HEAP32[($97 + 24) >> 2] = $R$1;
              $p$0 = $14;
              $psize$0 = $15;
              break;
            }
          }
        } else {
          $p$0 = $1;
          $psize$0 = $8;
        }
      while (0);
      if ($p$0 >>> 0 >= $9 >>> 0) _abort();
      $111 = ($mem + ($8 + -4)) | 0;
      $112 = HEAP32[$111 >> 2] | 0;
      if (!($112 & 1)) _abort();
      if (!($112 & 2)) {
        if (($9 | 0) == (HEAP32[170] | 0)) {
          $120 = ((HEAP32[167] | 0) + $psize$0) | 0;
          HEAP32[167] = $120;
          HEAP32[170] = $p$0;
          HEAP32[($p$0 + 4) >> 2] = $120 | 1;
          if (($p$0 | 0) != (HEAP32[169] | 0)) return;
          HEAP32[169] = 0;
          HEAP32[166] = 0;
          return;
        }
        if (($9 | 0) == (HEAP32[169] | 0)) {
          $128 = ((HEAP32[166] | 0) + $psize$0) | 0;
          HEAP32[166] = $128;
          HEAP32[169] = $p$0;
          HEAP32[($p$0 + 4) >> 2] = $128 | 1;
          HEAP32[($p$0 + $128) >> 2] = $128;
          return;
        }
        $133 = (($112 & -8) + $psize$0) | 0;
        $134 = $112 >>> 3;
        do
          if ($112 >>> 0 < 256) {
            $137 = HEAP32[($mem + $8) >> 2] | 0;
            $139 = HEAP32[($mem + ($8 | 4)) >> 2] | 0;
            $141 = (696 + (($134 << 1) << 2)) | 0;
            if (($137 | 0) != ($141 | 0)) {
              if ($137 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
              if ((HEAP32[($137 + 12) >> 2] | 0) != ($9 | 0)) _abort();
            }
            if (($139 | 0) == ($137 | 0)) {
              HEAP32[164] = HEAP32[164] & ~(1 << $134);
              break;
            }
            if (($139 | 0) == ($141 | 0)) $$pre$phi59Z2D = ($139 + 8) | 0;
            else {
              if ($139 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
              $156 = ($139 + 8) | 0;
              if ((HEAP32[$156 >> 2] | 0) == ($9 | 0)) $$pre$phi59Z2D = $156;
              else _abort();
            }
            HEAP32[($137 + 12) >> 2] = $139;
            HEAP32[$$pre$phi59Z2D >> 2] = $137;
          } else {
            $161 = HEAP32[($mem + ($8 + 16)) >> 2] | 0;
            $163 = HEAP32[($mem + ($8 | 4)) >> 2] | 0;
            do
              if (($163 | 0) == ($9 | 0)) {
                $175 = ($mem + ($8 + 12)) | 0;
                $176 = HEAP32[$175 >> 2] | 0;
                if (!$176) {
                  $178 = ($mem + ($8 + 8)) | 0;
                  $179 = HEAP32[$178 >> 2] | 0;
                  if (!$179) {
                    $R7$1 = 0;
                    break;
                  } else {
                    $R7$0 = $179;
                    $RP9$0 = $178;
                  }
                } else {
                  $R7$0 = $176;
                  $RP9$0 = $175;
                }
                while (1) {
                  $181 = ($R7$0 + 20) | 0;
                  $182 = HEAP32[$181 >> 2] | 0;
                  if ($182) {
                    $R7$0 = $182;
                    $RP9$0 = $181;
                    continue;
                  }
                  $184 = ($R7$0 + 16) | 0;
                  $185 = HEAP32[$184 >> 2] | 0;
                  if (!$185) break;
                  else {
                    $R7$0 = $185;
                    $RP9$0 = $184;
                  }
                }
                if ($RP9$0 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                else {
                  HEAP32[$RP9$0 >> 2] = 0;
                  $R7$1 = $R7$0;
                  break;
                }
              } else {
                $166 = HEAP32[($mem + $8) >> 2] | 0;
                if ($166 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                $169 = ($166 + 12) | 0;
                if ((HEAP32[$169 >> 2] | 0) != ($9 | 0)) _abort();
                $172 = ($163 + 8) | 0;
                if ((HEAP32[$172 >> 2] | 0) == ($9 | 0)) {
                  HEAP32[$169 >> 2] = $163;
                  HEAP32[$172 >> 2] = $166;
                  $R7$1 = $163;
                  break;
                } else _abort();
              }
            while (0);
            if ($161) {
              $191 = HEAP32[($mem + ($8 + 20)) >> 2] | 0;
              $192 = (960 + ($191 << 2)) | 0;
              if (($9 | 0) == (HEAP32[$192 >> 2] | 0)) {
                HEAP32[$192 >> 2] = $R7$1;
                if (!$R7$1) {
                  HEAP32[165] = HEAP32[165] & ~(1 << $191);
                  break;
                }
              } else {
                if ($161 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                $201 = ($161 + 16) | 0;
                if ((HEAP32[$201 >> 2] | 0) == ($9 | 0))
                  HEAP32[$201 >> 2] = $R7$1;
                else HEAP32[($161 + 20) >> 2] = $R7$1;
                if (!$R7$1) break;
              }
              $206 = HEAP32[168] | 0;
              if ($R7$1 >>> 0 < $206 >>> 0) _abort();
              HEAP32[($R7$1 + 24) >> 2] = $161;
              $210 = HEAP32[($mem + ($8 + 8)) >> 2] | 0;
              do
                if ($210)
                  if ($210 >>> 0 < $206 >>> 0) _abort();
                  else {
                    HEAP32[($R7$1 + 16) >> 2] = $210;
                    HEAP32[($210 + 24) >> 2] = $R7$1;
                    break;
                  }
              while (0);
              $216 = HEAP32[($mem + ($8 + 12)) >> 2] | 0;
              if ($216)
                if ($216 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                else {
                  HEAP32[($R7$1 + 20) >> 2] = $216;
                  HEAP32[($216 + 24) >> 2] = $R7$1;
                  break;
                }
            }
          }
        while (0);
        HEAP32[($p$0 + 4) >> 2] = $133 | 1;
        HEAP32[($p$0 + $133) >> 2] = $133;
        if (($p$0 | 0) == (HEAP32[169] | 0)) {
          HEAP32[166] = $133;
          return;
        } else $psize$1 = $133;
      } else {
        HEAP32[$111 >> 2] = $112 & -2;
        HEAP32[($p$0 + 4) >> 2] = $psize$0 | 1;
        HEAP32[($p$0 + $psize$0) >> 2] = $psize$0;
        $psize$1 = $psize$0;
      }
      $231 = $psize$1 >>> 3;
      if ($psize$1 >>> 0 < 256) {
        $233 = $231 << 1;
        $234 = (696 + ($233 << 2)) | 0;
        $235 = HEAP32[164] | 0;
        $236 = 1 << $231;
        if (!($235 & $236)) {
          HEAP32[164] = $235 | $236;
          $$pre$phiZ2D = (696 + (($233 + 2) << 2)) | 0;
          $F16$0 = $234;
        } else {
          $240 = (696 + (($233 + 2) << 2)) | 0;
          $241 = HEAP32[$240 >> 2] | 0;
          if ($241 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
          else {
            $$pre$phiZ2D = $240;
            $F16$0 = $241;
          }
        }
        HEAP32[$$pre$phiZ2D >> 2] = $p$0;
        HEAP32[($F16$0 + 12) >> 2] = $p$0;
        HEAP32[($p$0 + 8) >> 2] = $F16$0;
        HEAP32[($p$0 + 12) >> 2] = $234;
        return;
      }
      $247 = $psize$1 >>> 8;
      if (!$247) $I18$0 = 0;
      else if ($psize$1 >>> 0 > 16777215) $I18$0 = 31;
      else {
        $252 = ((($247 + 1048320) | 0) >>> 16) & 8;
        $253 = $247 << $252;
        $256 = ((($253 + 520192) | 0) >>> 16) & 4;
        $258 = $253 << $256;
        $261 = ((($258 + 245760) | 0) >>> 16) & 2;
        $266 = (14 - ($256 | $252 | $261) + (($258 << $261) >>> 15)) | 0;
        $I18$0 = (($psize$1 >>> (($266 + 7) | 0)) & 1) | ($266 << 1);
      }
      $272 = (960 + ($I18$0 << 2)) | 0;
      HEAP32[($p$0 + 28) >> 2] = $I18$0;
      HEAP32[($p$0 + 20) >> 2] = 0;
      HEAP32[($p$0 + 16) >> 2] = 0;
      $276 = HEAP32[165] | 0;
      $277 = 1 << $I18$0;
      L199: do
        if (!($276 & $277)) {
          HEAP32[165] = $276 | $277;
          HEAP32[$272 >> 2] = $p$0;
          HEAP32[($p$0 + 24) >> 2] = $272;
          HEAP32[($p$0 + 12) >> 2] = $p$0;
          HEAP32[($p$0 + 8) >> 2] = $p$0;
        } else {
          $284 = HEAP32[$272 >> 2] | 0;
          L202: do
            if (((HEAP32[($284 + 4) >> 2] & -8) | 0) == ($psize$1 | 0))
              $T$0$lcssa = $284;
            else {
              $K19$052 =
                $psize$1 <<
                (($I18$0 | 0) == 31 ? 0 : (25 - ($I18$0 >>> 1)) | 0);
              $T$051 = $284;
              while (1) {
                $301 = ($T$051 + 16 + (($K19$052 >>> 31) << 2)) | 0;
                $296 = HEAP32[$301 >> 2] | 0;
                if (!$296) break;
                if (((HEAP32[($296 + 4) >> 2] & -8) | 0) == ($psize$1 | 0)) {
                  $T$0$lcssa = $296;
                  break L202;
                } else {
                  $K19$052 = $K19$052 << 1;
                  $T$051 = $296;
                }
              }
              if ($301 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
              else {
                HEAP32[$301 >> 2] = $p$0;
                HEAP32[($p$0 + 24) >> 2] = $T$051;
                HEAP32[($p$0 + 12) >> 2] = $p$0;
                HEAP32[($p$0 + 8) >> 2] = $p$0;
                break L199;
              }
            }
          while (0);
          $308 = ($T$0$lcssa + 8) | 0;
          $309 = HEAP32[$308 >> 2] | 0;
          $310 = HEAP32[168] | 0;
          if (($309 >>> 0 >= $310 >>> 0) & ($T$0$lcssa >>> 0 >= $310 >>> 0)) {
            HEAP32[($309 + 12) >> 2] = $p$0;
            HEAP32[$308 >> 2] = $p$0;
            HEAP32[($p$0 + 8) >> 2] = $309;
            HEAP32[($p$0 + 12) >> 2] = $T$0$lcssa;
            HEAP32[($p$0 + 24) >> 2] = 0;
            break;
          } else _abort();
        }
      while (0);
      $318 = ((HEAP32[172] | 0) + -1) | 0;
      HEAP32[172] = $318;
      if (!$318) $sp$0$in$i = 1112;
      else return;
      while (1) {
        $sp$0$i = HEAP32[$sp$0$in$i >> 2] | 0;
        if (!$sp$0$i) break;
        else $sp$0$in$i = ($sp$0$i + 8) | 0;
      }
      HEAP32[172] = -1;
      return;
    }
    function _ubidi_writeReordered_58(
      $pBiDi,
      $dest,
      $destSize,
      $options,
      $pErrorCode,
    ) {
      $pBiDi = $pBiDi | 0;
      $dest = $dest | 0;
      $destSize = $destSize | 0;
      $options = $options | 0;
      $pErrorCode = $pErrorCode | 0;
      var $$ = 0,
        $$0 = 0,
        $$019 = 0,
        $$0448 = 0,
        $$0547 = 0,
        $$10 = 0,
        $$11 = 0,
        $$11044 = 0,
        $$120 = 0,
        $$1256 = 0,
        $$14$be = 0,
        $$1452 = 0,
        $$15 = 0,
        $$16 = 0,
        $$16$ = 0,
        $$18 = 0,
        $$19 = 0,
        $$20 = 0,
        $$20$ = 0,
        $$211 = 0,
        $$22 = 0,
        $$221 = 0,
        $$245 = 0,
        $$3 = 0,
        $$312 = 0,
        $$4 = 0,
        $$4$ = 0,
        $$413 = 0,
        $$51455 = 0,
        $$6 = 0,
        $$615$be = 0,
        $$61551 = 0,
        $$7 = 0,
        $$716 = 0,
        $$8 = 0,
        $$8$ = 0,
        $$817 = 0,
        $$918 = 0,
        $$in = 0,
        $$in59 = 0,
        $12 = 0,
        $130 = 0,
        $133 = 0,
        $153 = 0,
        $157 = 0,
        $159 = 0,
        $160 = 0,
        $165 = 0,
        $168 = 0,
        $170 = 0,
        $173 = 0,
        $174 = 0,
        $175 = 0,
        $177 = 0,
        $186 = 0,
        $189 = 0,
        $207 = 0,
        $210 = 0,
        $23 = 0,
        $27 = 0,
        $45 = 0,
        $49 = 0,
        $5 = 0,
        $51 = 0,
        $54 = 0,
        $56 = 0,
        $57 = 0,
        $62 = 0,
        $65 = 0,
        $66 = 0,
        $67 = 0,
        $69 = 0,
        $71 = 0,
        $72 = 0,
        $73 = 0,
        $76 = 0,
        $8 = 0,
        $80 = 0,
        $92 = 0,
        $95 = 0,
        $logicalStart = 0,
        $markFlag$0 = 0,
        $markFlag$1 = 0,
        $markFlag$2 = 0,
        $markFlag$3 = 0,
        $run$046 = 0,
        $run$143 = 0,
        $runLength = 0,
        $storemerge = 0,
        $storemerge22 = 0,
        $uc$0$ph = 0,
        $uc$1$ph = 0,
        $uc$2$ph = 0,
        $uc$3$ph = 0,
        label = 0,
        sp = 0,
        $$in$looptemp = 0,
        $$in59$looptemp = 0;

      sp = STACKTOP;
      STACKTOP = (STACKTOP + 16) | 0;
      $logicalStart = (sp + 4) | 0;
      $runLength = sp;
      L1: do
        if (!$pErrorCode) $$0 = 0;
        else if ((HEAP32[$pErrorCode >> 2] | 0) > 0) $$0 = 0;
        else {
          if ($pBiDi) {
            $5 = HEAP32[($pBiDi + 8) >> 2] | 0;
            if ($5) {
              $8 = HEAP32[($pBiDi + 16) >> 2] | 0;
              if (($8 | $destSize | 0) >= 0) {
                $12 = ($dest | 0) == 0;
                if (!($12 & (($destSize | 0) > 0))) {
                  do
                    if (!$12) {
                      if (
                        !(
                          ($5 >>> 0 >= $dest >>> 0) &
                          ($5 >>> 0 < (($dest + ($destSize << 1)) | 0) >>> 0)
                        )
                      ) {
                        if ($5 >>> 0 > $dest >>> 0) break;
                        if (
                          (($5 + (HEAP32[($pBiDi + 12) >> 2] << 1)) | 0) >>>
                            0 <=
                          $dest >>> 0
                        )
                          break;
                      }
                      HEAP32[$pErrorCode >> 2] = 1;
                      $$0 = 0;
                      break L1;
                    }
                  while (0);
                  if (!$8) {
                    $$0 =
                      _u_terminateUChars_58($dest, $destSize, 0, $pErrorCode) |
                      0;
                    break;
                  }
                  $23 = _ubidi_countRuns_58($pBiDi, $pErrorCode) | 0;
                  if ((HEAP32[$pErrorCode >> 2] | 0) > 0) {
                    $$0 = 0;
                    break;
                  }
                  $27 = HEAP32[($pBiDi + 92) >> 2] | 0;
                  if (!($27 & 1)) $$019 = $options;
                  else $$019 = (($options & 65523) | 4) & 65535;
                  if (!($27 & 2)) $$120 = $$019;
                  else $$120 = (($$019 & 65523) | 8) & 65535;
                  if ((((HEAP32[($pBiDi + 88) >> 2] | 0) + -3) | 0) >>> 0 < 4)
                    $$221 = $$120;
                  else $$221 = $$120 & 65531;
                  $45 = $$221 & 65535;
                  $49 = (($45 & 4) | 0) != 0;
                  L29: do
                    if (!($45 & 16)) {
                      if (!$49) {
                        $51 = $45 & 65533;
                        if (($23 | 0) > 0) {
                          $$0448 = $dest;
                          $$0547 = $destSize;
                          $run$046 = 0;
                        } else {
                          $$918 = $destSize;
                          break;
                        }
                        while (1) {
                          $54 =
                            (_ubidi_getVisualRun_58(
                              $pBiDi,
                              $run$046,
                              $logicalStart,
                              $runLength,
                            ) |
                              0) ==
                            0;
                          $56 = ($5 + (HEAP32[$logicalStart >> 2] << 1)) | 0;
                          $57 = HEAP32[$runLength >> 2] | 0;
                          if ($54)
                            $storemerge =
                              _doWriteForward(
                                $56,
                                $57,
                                $$0448,
                                $$0547,
                                $51,
                                $pErrorCode,
                              ) | 0;
                          else
                            $storemerge =
                              _doWriteReverse(
                                $56,
                                $57,
                                $$0448,
                                $$0547,
                                $$221,
                                $pErrorCode,
                              ) | 0;
                          HEAP32[$runLength >> 2] = $storemerge;
                          $62 = ($$0547 - $storemerge) | 0;
                          $run$046 = ($run$046 + 1) | 0;
                          if (($run$046 | 0) == ($23 | 0)) {
                            $$918 = $62;
                            break L29;
                          } else {
                            $$0448 =
                              ($$0448 | 0) == 0
                                ? 0
                                : ($$0448 + ($storemerge << 1)) | 0;
                            $$0547 = $62;
                          }
                        }
                      }
                      $65 = HEAP32[($pBiDi + 76) >> 2] | 0;
                      $66 = ($pBiDi + 228) | 0;
                      $67 = ($pBiDi + 84) | 0;
                      $69 = $45 & 65533;
                      if (($23 | 0) > 0) {
                        $$11044 = $destSize;
                        $$245 = $dest;
                        $run$143 = 0;
                        while (1) {
                          $71 =
                            _ubidi_getVisualRun_58(
                              $pBiDi,
                              $run$143,
                              $logicalStart,
                              $runLength,
                            ) | 0;
                          $72 = HEAP32[$logicalStart >> 2] | 0;
                          $73 = ($5 + ($72 << 1)) | 0;
                          $76 =
                            HEAP32[
                              ((HEAP32[$66 >> 2] | 0) +
                                (($run$143 * 12) | 0) +
                                8) >>
                                2
                            ] | 0;
                          $$ = ($76 | 0) < 0 ? 0 : $76;
                          $80 = (HEAP8[$67 >> 0] | 0) != 0;
                          do
                            if (!$71) {
                              if ($80)
                                $markFlag$0 =
                                  ((HEAP8[($65 + $72) >> 0] | 0) != 0) | $$;
                              else $markFlag$0 = $$;
                              if (!($markFlag$0 & 1))
                                if (!($markFlag$0 & 4)) {
                                  $$211 = $$11044;
                                  $$4 = $$245;
                                } else {
                                  $uc$0$ph = 8207;
                                  label = 35;
                                }
                              else {
                                $uc$0$ph = 8206;
                                label = 35;
                              }
                              if ((label | 0) == 35) {
                                label = 0;
                                if (($$11044 | 0) > 0) {
                                  HEAP16[$$245 >> 1] = $uc$0$ph;
                                  $$3 = ($$245 + 2) | 0;
                                } else $$3 = $$245;
                                $$211 = ($$11044 + -1) | 0;
                                $$4 = $$3;
                              }
                              $92 =
                                _doWriteForward(
                                  $73,
                                  HEAP32[$runLength >> 2] | 0,
                                  $$4,
                                  $$211,
                                  $69,
                                  $pErrorCode,
                                ) | 0;
                              HEAP32[$runLength >> 2] = $92;
                              $$4$ =
                                ($$4 | 0) == 0 ? 0 : ($$4 + ($92 << 1)) | 0;
                              $95 = ($$211 - $92) | 0;
                              if (!(HEAP8[$67 >> 0] | 0))
                                $markFlag$1 = $markFlag$0;
                              else
                                $markFlag$1 =
                                  (HEAP8[
                                    ($65 +
                                      ($92 +
                                        -1 +
                                        (HEAP32[$logicalStart >> 2] | 0))) >>
                                      0
                                  ] |
                                    0) ==
                                  0
                                    ? $markFlag$0
                                    : $markFlag$0 | 2;
                              if (!($markFlag$1 & 2))
                                if (!($markFlag$1 & 8)) {
                                  $$11 = $$4$;
                                  $$413 = $95;
                                  break;
                                } else $uc$1$ph = 8207;
                              else $uc$1$ph = 8206;
                              if (($95 | 0) > 0) {
                                HEAP16[$$4$ >> 1] = $uc$1$ph;
                                $$6 = ($$4$ + 2) | 0;
                              } else $$6 = $$4$;
                              $$11 = $$6;
                              $$413 = ($95 + -1) | 0;
                            } else {
                              if ($80)
                                $markFlag$2 =
                                  (((1 <<
                                    HEAPU8[
                                      ($65 +
                                        ($72 +
                                          -1 +
                                          (HEAP32[$runLength >> 2] | 0))) >>
                                        0
                                    ]) &
                                    8194) |
                                    0) ==
                                  0
                                    ? $$ | 4
                                    : $$;
                              else $markFlag$2 = $$;
                              if (!($markFlag$2 & 1))
                                if (!($markFlag$2 & 4)) {
                                  $$312 = $$11044;
                                  $$8 = $$245;
                                } else {
                                  $uc$2$ph = 8207;
                                  label = 49;
                                }
                              else {
                                $uc$2$ph = 8206;
                                label = 49;
                              }
                              if ((label | 0) == 49) {
                                label = 0;
                                if (($$11044 | 0) > 0) {
                                  HEAP16[$$245 >> 1] = $uc$2$ph;
                                  $$7 = ($$245 + 2) | 0;
                                } else $$7 = $$245;
                                $$312 = ($$11044 + -1) | 0;
                                $$8 = $$7;
                              }
                              $130 =
                                _doWriteReverse(
                                  $73,
                                  HEAP32[$runLength >> 2] | 0,
                                  $$8,
                                  $$312,
                                  $$221,
                                  $pErrorCode,
                                ) | 0;
                              HEAP32[$runLength >> 2] = $130;
                              $$8$ =
                                ($$8 | 0) == 0 ? 0 : ($$8 + ($130 << 1)) | 0;
                              $133 = ($$312 - $130) | 0;
                              if (!(HEAP8[$67 >> 0] | 0))
                                $markFlag$3 = $markFlag$2;
                              else
                                $markFlag$3 =
                                  (((1 <<
                                    HEAPU8[
                                      ($65 +
                                        (HEAP32[$logicalStart >> 2] | 0)) >>
                                        0
                                    ]) &
                                    8194) |
                                    0) ==
                                  0
                                    ? $markFlag$2 | 8
                                    : $markFlag$2;
                              if (!($markFlag$3 & 2))
                                if (!($markFlag$3 & 8)) {
                                  $$11 = $$8$;
                                  $$413 = $133;
                                  break;
                                } else $uc$3$ph = 8207;
                              else $uc$3$ph = 8206;
                              if (($133 | 0) > 0) {
                                HEAP16[$$8$ >> 1] = $uc$3$ph;
                                $$10 = ($$8$ + 2) | 0;
                              } else $$10 = $$8$;
                              $$11 = $$10;
                              $$413 = ($133 + -1) | 0;
                            }
                          while (0);
                          $run$143 = ($run$143 + 1) | 0;
                          if (($run$143 | 0) == ($23 | 0)) {
                            $$918 = $$413;
                            break;
                          } else {
                            $$11044 = $$413;
                            $$245 = $$11;
                          }
                        }
                      } else $$918 = $destSize;
                    } else {
                      if (!$49) {
                        $153 = $45 & 65533;
                        if (($23 | 0) > 0) {
                          $$1256 = $dest;
                          $$51455 = $destSize;
                          $$in = $23;
                        } else {
                          $$918 = $destSize;
                          break;
                        }
                        while (1) {
                          $$in$looptemp = $$in;
                          $$in = ($$in + -1) | 0;
                          $157 =
                            (_ubidi_getVisualRun_58(
                              $pBiDi,
                              $$in,
                              $logicalStart,
                              $runLength,
                            ) |
                              0) ==
                            0;
                          $159 = ($5 + (HEAP32[$logicalStart >> 2] << 1)) | 0;
                          $160 = HEAP32[$runLength >> 2] | 0;
                          if ($157)
                            $storemerge22 =
                              _doWriteReverse(
                                $159,
                                $160,
                                $$1256,
                                $$51455,
                                $153,
                                $pErrorCode,
                              ) | 0;
                          else
                            $storemerge22 =
                              _doWriteForward(
                                $159,
                                $160,
                                $$1256,
                                $$51455,
                                $$221,
                                $pErrorCode,
                              ) | 0;
                          HEAP32[$runLength >> 2] = $storemerge22;
                          $165 = ($$51455 - $storemerge22) | 0;
                          if (($$in$looptemp | 0) <= 1) {
                            $$918 = $165;
                            break L29;
                          } else {
                            $$1256 =
                              ($$1256 | 0) == 0
                                ? 0
                                : ($$1256 + ($storemerge22 << 1)) | 0;
                            $$51455 = $165;
                          }
                        }
                      }
                      $168 = HEAP32[($pBiDi + 76) >> 2] | 0;
                      $170 = $45 & 65533;
                      if (($23 | 0) > 0) {
                        $$1452 = $dest;
                        $$61551 = $destSize;
                        $$in59 = $23;
                        while (1) {
                          $$in59$looptemp = $$in59;
                          $$in59 = ($$in59 + -1) | 0;
                          $173 =
                            _ubidi_getVisualRun_58(
                              $pBiDi,
                              $$in59,
                              $logicalStart,
                              $runLength,
                            ) | 0;
                          $174 = HEAP32[$logicalStart >> 2] | 0;
                          $175 = ($5 + ($174 << 1)) | 0;
                          do
                            if (!$173) {
                              $177 = HEAP32[$runLength >> 2] | 0;
                              if (
                                !(HEAP8[($168 + ($174 + -1 + $177)) >> 0] | 0)
                              ) {
                                $$16 = $$1452;
                                $$716 = $$61551;
                              } else {
                                if (($$61551 | 0) > 0) {
                                  HEAP16[$$1452 >> 1] = 8206;
                                  $$15 = ($$1452 + 2) | 0;
                                } else $$15 = $$1452;
                                $$16 = $$15;
                                $$716 = ($$61551 + -1) | 0;
                              }
                              $186 =
                                _doWriteReverse(
                                  $175,
                                  $177,
                                  $$16,
                                  $$716,
                                  $170,
                                  $pErrorCode,
                                ) | 0;
                              HEAP32[$runLength >> 2] = $186;
                              $$16$ =
                                ($$16 | 0) == 0 ? 0 : ($$16 + ($186 << 1)) | 0;
                              $189 = ($$716 - $186) | 0;
                              if (
                                !(
                                  HEAP8[
                                    ($168 + (HEAP32[$logicalStart >> 2] | 0)) >>
                                      0
                                  ] | 0
                                )
                              ) {
                                $$14$be = $$16$;
                                $$615$be = $189;
                                break;
                              }
                              if (($189 | 0) > 0) {
                                HEAP16[$$16$ >> 1] = 8206;
                                $$18 = ($$16$ + 2) | 0;
                              } else $$18 = $$16$;
                              $$14$be = $$18;
                              $$615$be = ($189 + -1) | 0;
                            } else {
                              if (!((1 << HEAPU8[($168 + $174) >> 0]) & 8194)) {
                                if (($$61551 | 0) > 0) {
                                  HEAP16[$$1452 >> 1] = 8207;
                                  $$19 = ($$1452 + 2) | 0;
                                } else $$19 = $$1452;
                                $$20 = $$19;
                                $$817 = ($$61551 + -1) | 0;
                              } else {
                                $$20 = $$1452;
                                $$817 = $$61551;
                              }
                              $207 =
                                _doWriteForward(
                                  $175,
                                  HEAP32[$runLength >> 2] | 0,
                                  $$20,
                                  $$817,
                                  $$221,
                                  $pErrorCode,
                                ) | 0;
                              HEAP32[$runLength >> 2] = $207;
                              $$20$ =
                                ($$20 | 0) == 0 ? 0 : ($$20 + ($207 << 1)) | 0;
                              $210 = ($$817 - $207) | 0;
                              if (
                                (1 <<
                                  HEAPU8[
                                    ($168 +
                                      ($207 +
                                        -1 +
                                        (HEAP32[$logicalStart >> 2] | 0))) >>
                                      0
                                  ]) &
                                8194
                              ) {
                                $$14$be = $$20$;
                                $$615$be = $210;
                                break;
                              }
                              if (($210 | 0) > 0) {
                                HEAP16[$$20$ >> 1] = 8207;
                                $$22 = ($$20$ + 2) | 0;
                              } else $$22 = $$20$;
                              $$14$be = $$22;
                              $$615$be = ($210 + -1) | 0;
                            }
                          while (0);
                          if (($$in59$looptemp | 0) <= 1) {
                            $$918 = $$615$be;
                            break;
                          } else {
                            $$1452 = $$14$be;
                            $$61551 = $$615$be;
                          }
                        }
                      } else $$918 = $destSize;
                    }
                  while (0);
                  $$0 =
                    _u_terminateUChars_58(
                      $dest,
                      $destSize,
                      ($destSize - $$918) | 0,
                      $pErrorCode,
                    ) | 0;
                  break;
                }
              }
            }
          }
          HEAP32[$pErrorCode >> 2] = 1;
          $$0 = 0;
        }
      while (0);
      STACKTOP = sp;
      return $$0 | 0;
    }
    function _dispose_chunk($p, $psize) {
      $p = $p | 0;
      $psize = $psize | 0;
      var $$0 = 0,
        $$02 = 0,
        $$1 = 0,
        $$pre$phi50Z2D = 0,
        $$pre$phi52Z2D = 0,
        $$pre$phiZ2D = 0,
        $$sum18 = 0,
        $$sum21 = 0,
        $0 = 0,
        $10 = 0,
        $100 = 0,
        $106 = 0,
        $108 = 0,
        $109 = 0,
        $11 = 0,
        $115 = 0,
        $123 = 0,
        $128 = 0,
        $129 = 0,
        $132 = 0,
        $134 = 0,
        $136 = 0,
        $149 = 0,
        $15 = 0,
        $154 = 0,
        $156 = 0,
        $159 = 0,
        $161 = 0,
        $164 = 0,
        $167 = 0,
        $168 = 0,
        $170 = 0,
        $171 = 0,
        $173 = 0,
        $174 = 0,
        $176 = 0,
        $177 = 0,
        $18 = 0,
        $182 = 0,
        $183 = 0,
        $192 = 0,
        $197 = 0,
        $2 = 0,
        $20 = 0,
        $201 = 0,
        $207 = 0,
        $22 = 0,
        $222 = 0,
        $224 = 0,
        $225 = 0,
        $226 = 0,
        $227 = 0,
        $231 = 0,
        $232 = 0,
        $238 = 0,
        $243 = 0,
        $244 = 0,
        $247 = 0,
        $249 = 0,
        $252 = 0,
        $257 = 0,
        $263 = 0,
        $267 = 0,
        $268 = 0,
        $275 = 0,
        $287 = 0,
        $292 = 0,
        $299 = 0,
        $300 = 0,
        $301 = 0,
        $35 = 0,
        $40 = 0,
        $42 = 0,
        $45 = 0,
        $47 = 0,
        $5 = 0,
        $50 = 0,
        $53 = 0,
        $54 = 0,
        $56 = 0,
        $57 = 0,
        $59 = 0,
        $60 = 0,
        $62 = 0,
        $63 = 0,
        $68 = 0,
        $69 = 0,
        $78 = 0,
        $83 = 0,
        $87 = 0,
        $9 = 0,
        $93 = 0,
        $99 = 0,
        $F16$0 = 0,
        $I19$0 = 0,
        $K20$043 = 0,
        $R$0 = 0,
        $R$1 = 0,
        $R7$0 = 0,
        $R7$1 = 0,
        $RP$0 = 0,
        $RP9$0 = 0,
        $T$0$lcssa = 0,
        $T$042 = 0;
      $0 = ($p + $psize) | 0;
      $2 = HEAP32[($p + 4) >> 2] | 0;
      do
        if (!($2 & 1)) {
          $5 = HEAP32[$p >> 2] | 0;
          if (!($2 & 3)) return;
          $9 = ($p + (0 - $5)) | 0;
          $10 = ($5 + $psize) | 0;
          $11 = HEAP32[168] | 0;
          if ($9 >>> 0 < $11 >>> 0) _abort();
          if (($9 | 0) == (HEAP32[169] | 0)) {
            $99 = ($p + ($psize + 4)) | 0;
            $100 = HEAP32[$99 >> 2] | 0;
            if ((($100 & 3) | 0) != 3) {
              $$0 = $9;
              $$02 = $10;
              break;
            }
            HEAP32[166] = $10;
            HEAP32[$99 >> 2] = $100 & -2;
            HEAP32[($p + (4 - $5)) >> 2] = $10 | 1;
            HEAP32[$0 >> 2] = $10;
            return;
          }
          $15 = $5 >>> 3;
          if ($5 >>> 0 < 256) {
            $18 = HEAP32[($p + (8 - $5)) >> 2] | 0;
            $20 = HEAP32[($p + (12 - $5)) >> 2] | 0;
            $22 = (696 + (($15 << 1) << 2)) | 0;
            if (($18 | 0) != ($22 | 0)) {
              if ($18 >>> 0 < $11 >>> 0) _abort();
              if ((HEAP32[($18 + 12) >> 2] | 0) != ($9 | 0)) _abort();
            }
            if (($20 | 0) == ($18 | 0)) {
              HEAP32[164] = HEAP32[164] & ~(1 << $15);
              $$0 = $9;
              $$02 = $10;
              break;
            }
            if (($20 | 0) == ($22 | 0)) $$pre$phi52Z2D = ($20 + 8) | 0;
            else {
              if ($20 >>> 0 < $11 >>> 0) _abort();
              $35 = ($20 + 8) | 0;
              if ((HEAP32[$35 >> 2] | 0) == ($9 | 0)) $$pre$phi52Z2D = $35;
              else _abort();
            }
            HEAP32[($18 + 12) >> 2] = $20;
            HEAP32[$$pre$phi52Z2D >> 2] = $18;
            $$0 = $9;
            $$02 = $10;
            break;
          }
          $40 = HEAP32[($p + (24 - $5)) >> 2] | 0;
          $42 = HEAP32[($p + (12 - $5)) >> 2] | 0;
          do
            if (($42 | 0) == ($9 | 0)) {
              $$sum18 = (16 - $5) | 0;
              $53 = ($p + ($$sum18 + 4)) | 0;
              $54 = HEAP32[$53 >> 2] | 0;
              if (!$54) {
                $56 = ($p + $$sum18) | 0;
                $57 = HEAP32[$56 >> 2] | 0;
                if (!$57) {
                  $R$1 = 0;
                  break;
                } else {
                  $R$0 = $57;
                  $RP$0 = $56;
                }
              } else {
                $R$0 = $54;
                $RP$0 = $53;
              }
              while (1) {
                $59 = ($R$0 + 20) | 0;
                $60 = HEAP32[$59 >> 2] | 0;
                if ($60) {
                  $R$0 = $60;
                  $RP$0 = $59;
                  continue;
                }
                $62 = ($R$0 + 16) | 0;
                $63 = HEAP32[$62 >> 2] | 0;
                if (!$63) break;
                else {
                  $R$0 = $63;
                  $RP$0 = $62;
                }
              }
              if ($RP$0 >>> 0 < $11 >>> 0) _abort();
              else {
                HEAP32[$RP$0 >> 2] = 0;
                $R$1 = $R$0;
                break;
              }
            } else {
              $45 = HEAP32[($p + (8 - $5)) >> 2] | 0;
              if ($45 >>> 0 < $11 >>> 0) _abort();
              $47 = ($45 + 12) | 0;
              if ((HEAP32[$47 >> 2] | 0) != ($9 | 0)) _abort();
              $50 = ($42 + 8) | 0;
              if ((HEAP32[$50 >> 2] | 0) == ($9 | 0)) {
                HEAP32[$47 >> 2] = $42;
                HEAP32[$50 >> 2] = $45;
                $R$1 = $42;
                break;
              } else _abort();
            }
          while (0);
          if (!$40) {
            $$0 = $9;
            $$02 = $10;
          } else {
            $68 = HEAP32[($p + (28 - $5)) >> 2] | 0;
            $69 = (960 + ($68 << 2)) | 0;
            if (($9 | 0) == (HEAP32[$69 >> 2] | 0)) {
              HEAP32[$69 >> 2] = $R$1;
              if (!$R$1) {
                HEAP32[165] = HEAP32[165] & ~(1 << $68);
                $$0 = $9;
                $$02 = $10;
                break;
              }
            } else {
              if ($40 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
              $78 = ($40 + 16) | 0;
              if ((HEAP32[$78 >> 2] | 0) == ($9 | 0)) HEAP32[$78 >> 2] = $R$1;
              else HEAP32[($40 + 20) >> 2] = $R$1;
              if (!$R$1) {
                $$0 = $9;
                $$02 = $10;
                break;
              }
            }
            $83 = HEAP32[168] | 0;
            if ($R$1 >>> 0 < $83 >>> 0) _abort();
            HEAP32[($R$1 + 24) >> 2] = $40;
            $$sum21 = (16 - $5) | 0;
            $87 = HEAP32[($p + $$sum21) >> 2] | 0;
            do
              if ($87)
                if ($87 >>> 0 < $83 >>> 0) _abort();
                else {
                  HEAP32[($R$1 + 16) >> 2] = $87;
                  HEAP32[($87 + 24) >> 2] = $R$1;
                  break;
                }
            while (0);
            $93 = HEAP32[($p + ($$sum21 + 4)) >> 2] | 0;
            if (!$93) {
              $$0 = $9;
              $$02 = $10;
            } else if ($93 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
            else {
              HEAP32[($R$1 + 20) >> 2] = $93;
              HEAP32[($93 + 24) >> 2] = $R$1;
              $$0 = $9;
              $$02 = $10;
              break;
            }
          }
        } else {
          $$0 = $p;
          $$02 = $psize;
        }
      while (0);
      $106 = HEAP32[168] | 0;
      if ($0 >>> 0 < $106 >>> 0) _abort();
      $108 = ($p + ($psize + 4)) | 0;
      $109 = HEAP32[$108 >> 2] | 0;
      if (!($109 & 2)) {
        if (($0 | 0) == (HEAP32[170] | 0)) {
          $115 = ((HEAP32[167] | 0) + $$02) | 0;
          HEAP32[167] = $115;
          HEAP32[170] = $$0;
          HEAP32[($$0 + 4) >> 2] = $115 | 1;
          if (($$0 | 0) != (HEAP32[169] | 0)) return;
          HEAP32[169] = 0;
          HEAP32[166] = 0;
          return;
        }
        if (($0 | 0) == (HEAP32[169] | 0)) {
          $123 = ((HEAP32[166] | 0) + $$02) | 0;
          HEAP32[166] = $123;
          HEAP32[169] = $$0;
          HEAP32[($$0 + 4) >> 2] = $123 | 1;
          HEAP32[($$0 + $123) >> 2] = $123;
          return;
        }
        $128 = (($109 & -8) + $$02) | 0;
        $129 = $109 >>> 3;
        do
          if ($109 >>> 0 < 256) {
            $132 = HEAP32[($p + ($psize + 8)) >> 2] | 0;
            $134 = HEAP32[($p + ($psize + 12)) >> 2] | 0;
            $136 = (696 + (($129 << 1) << 2)) | 0;
            if (($132 | 0) != ($136 | 0)) {
              if ($132 >>> 0 < $106 >>> 0) _abort();
              if ((HEAP32[($132 + 12) >> 2] | 0) != ($0 | 0)) _abort();
            }
            if (($134 | 0) == ($132 | 0)) {
              HEAP32[164] = HEAP32[164] & ~(1 << $129);
              break;
            }
            if (($134 | 0) == ($136 | 0)) $$pre$phi50Z2D = ($134 + 8) | 0;
            else {
              if ($134 >>> 0 < $106 >>> 0) _abort();
              $149 = ($134 + 8) | 0;
              if ((HEAP32[$149 >> 2] | 0) == ($0 | 0)) $$pre$phi50Z2D = $149;
              else _abort();
            }
            HEAP32[($132 + 12) >> 2] = $134;
            HEAP32[$$pre$phi50Z2D >> 2] = $132;
          } else {
            $154 = HEAP32[($p + ($psize + 24)) >> 2] | 0;
            $156 = HEAP32[($p + ($psize + 12)) >> 2] | 0;
            do
              if (($156 | 0) == ($0 | 0)) {
                $167 = ($p + ($psize + 20)) | 0;
                $168 = HEAP32[$167 >> 2] | 0;
                if (!$168) {
                  $170 = ($p + ($psize + 16)) | 0;
                  $171 = HEAP32[$170 >> 2] | 0;
                  if (!$171) {
                    $R7$1 = 0;
                    break;
                  } else {
                    $R7$0 = $171;
                    $RP9$0 = $170;
                  }
                } else {
                  $R7$0 = $168;
                  $RP9$0 = $167;
                }
                while (1) {
                  $173 = ($R7$0 + 20) | 0;
                  $174 = HEAP32[$173 >> 2] | 0;
                  if ($174) {
                    $R7$0 = $174;
                    $RP9$0 = $173;
                    continue;
                  }
                  $176 = ($R7$0 + 16) | 0;
                  $177 = HEAP32[$176 >> 2] | 0;
                  if (!$177) break;
                  else {
                    $R7$0 = $177;
                    $RP9$0 = $176;
                  }
                }
                if ($RP9$0 >>> 0 < $106 >>> 0) _abort();
                else {
                  HEAP32[$RP9$0 >> 2] = 0;
                  $R7$1 = $R7$0;
                  break;
                }
              } else {
                $159 = HEAP32[($p + ($psize + 8)) >> 2] | 0;
                if ($159 >>> 0 < $106 >>> 0) _abort();
                $161 = ($159 + 12) | 0;
                if ((HEAP32[$161 >> 2] | 0) != ($0 | 0)) _abort();
                $164 = ($156 + 8) | 0;
                if ((HEAP32[$164 >> 2] | 0) == ($0 | 0)) {
                  HEAP32[$161 >> 2] = $156;
                  HEAP32[$164 >> 2] = $159;
                  $R7$1 = $156;
                  break;
                } else _abort();
              }
            while (0);
            if ($154) {
              $182 = HEAP32[($p + ($psize + 28)) >> 2] | 0;
              $183 = (960 + ($182 << 2)) | 0;
              if (($0 | 0) == (HEAP32[$183 >> 2] | 0)) {
                HEAP32[$183 >> 2] = $R7$1;
                if (!$R7$1) {
                  HEAP32[165] = HEAP32[165] & ~(1 << $182);
                  break;
                }
              } else {
                if ($154 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                $192 = ($154 + 16) | 0;
                if ((HEAP32[$192 >> 2] | 0) == ($0 | 0))
                  HEAP32[$192 >> 2] = $R7$1;
                else HEAP32[($154 + 20) >> 2] = $R7$1;
                if (!$R7$1) break;
              }
              $197 = HEAP32[168] | 0;
              if ($R7$1 >>> 0 < $197 >>> 0) _abort();
              HEAP32[($R7$1 + 24) >> 2] = $154;
              $201 = HEAP32[($p + ($psize + 16)) >> 2] | 0;
              do
                if ($201)
                  if ($201 >>> 0 < $197 >>> 0) _abort();
                  else {
                    HEAP32[($R7$1 + 16) >> 2] = $201;
                    HEAP32[($201 + 24) >> 2] = $R7$1;
                    break;
                  }
              while (0);
              $207 = HEAP32[($p + ($psize + 20)) >> 2] | 0;
              if ($207)
                if ($207 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
                else {
                  HEAP32[($R7$1 + 20) >> 2] = $207;
                  HEAP32[($207 + 24) >> 2] = $R7$1;
                  break;
                }
            }
          }
        while (0);
        HEAP32[($$0 + 4) >> 2] = $128 | 1;
        HEAP32[($$0 + $128) >> 2] = $128;
        if (($$0 | 0) == (HEAP32[169] | 0)) {
          HEAP32[166] = $128;
          return;
        } else $$1 = $128;
      } else {
        HEAP32[$108 >> 2] = $109 & -2;
        HEAP32[($$0 + 4) >> 2] = $$02 | 1;
        HEAP32[($$0 + $$02) >> 2] = $$02;
        $$1 = $$02;
      }
      $222 = $$1 >>> 3;
      if ($$1 >>> 0 < 256) {
        $224 = $222 << 1;
        $225 = (696 + ($224 << 2)) | 0;
        $226 = HEAP32[164] | 0;
        $227 = 1 << $222;
        if (!($226 & $227)) {
          HEAP32[164] = $226 | $227;
          $$pre$phiZ2D = (696 + (($224 + 2) << 2)) | 0;
          $F16$0 = $225;
        } else {
          $231 = (696 + (($224 + 2) << 2)) | 0;
          $232 = HEAP32[$231 >> 2] | 0;
          if ($232 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
          else {
            $$pre$phiZ2D = $231;
            $F16$0 = $232;
          }
        }
        HEAP32[$$pre$phiZ2D >> 2] = $$0;
        HEAP32[($F16$0 + 12) >> 2] = $$0;
        HEAP32[($$0 + 8) >> 2] = $F16$0;
        HEAP32[($$0 + 12) >> 2] = $225;
        return;
      }
      $238 = $$1 >>> 8;
      if (!$238) $I19$0 = 0;
      else if ($$1 >>> 0 > 16777215) $I19$0 = 31;
      else {
        $243 = ((($238 + 1048320) | 0) >>> 16) & 8;
        $244 = $238 << $243;
        $247 = ((($244 + 520192) | 0) >>> 16) & 4;
        $249 = $244 << $247;
        $252 = ((($249 + 245760) | 0) >>> 16) & 2;
        $257 = (14 - ($247 | $243 | $252) + (($249 << $252) >>> 15)) | 0;
        $I19$0 = (($$1 >>> (($257 + 7) | 0)) & 1) | ($257 << 1);
      }
      $263 = (960 + ($I19$0 << 2)) | 0;
      HEAP32[($$0 + 28) >> 2] = $I19$0;
      HEAP32[($$0 + 20) >> 2] = 0;
      HEAP32[($$0 + 16) >> 2] = 0;
      $267 = HEAP32[165] | 0;
      $268 = 1 << $I19$0;
      if (!($267 & $268)) {
        HEAP32[165] = $267 | $268;
        HEAP32[$263 >> 2] = $$0;
        HEAP32[($$0 + 24) >> 2] = $263;
        HEAP32[($$0 + 12) >> 2] = $$0;
        HEAP32[($$0 + 8) >> 2] = $$0;
        return;
      }
      $275 = HEAP32[$263 >> 2] | 0;
      L191: do
        if (((HEAP32[($275 + 4) >> 2] & -8) | 0) == ($$1 | 0))
          $T$0$lcssa = $275;
        else {
          $K20$043 =
            $$1 << (($I19$0 | 0) == 31 ? 0 : (25 - ($I19$0 >>> 1)) | 0);
          $T$042 = $275;
          while (1) {
            $292 = ($T$042 + 16 + (($K20$043 >>> 31) << 2)) | 0;
            $287 = HEAP32[$292 >> 2] | 0;
            if (!$287) break;
            if (((HEAP32[($287 + 4) >> 2] & -8) | 0) == ($$1 | 0)) {
              $T$0$lcssa = $287;
              break L191;
            } else {
              $K20$043 = $K20$043 << 1;
              $T$042 = $287;
            }
          }
          if ($292 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
          HEAP32[$292 >> 2] = $$0;
          HEAP32[($$0 + 24) >> 2] = $T$042;
          HEAP32[($$0 + 12) >> 2] = $$0;
          HEAP32[($$0 + 8) >> 2] = $$0;
          return;
        }
      while (0);
      $299 = ($T$0$lcssa + 8) | 0;
      $300 = HEAP32[$299 >> 2] | 0;
      $301 = HEAP32[168] | 0;
      if (!(($300 >>> 0 >= $301 >>> 0) & ($T$0$lcssa >>> 0 >= $301 >>> 0)))
        _abort();
      HEAP32[($300 + 12) >> 2] = $$0;
      HEAP32[$299 >> 2] = $$0;
      HEAP32[($$0 + 8) >> 2] = $300;
      HEAP32[($$0 + 12) >> 2] = $T$0$lcssa;
      HEAP32[($$0 + 24) >> 2] = 0;
      return;
    }
    function _resolveImplicitLevels($pBiDi, $start, $limit, $sor, $eor) {
      $pBiDi = $pBiDi | 0;
      $start = $start | 0;
      $limit = $limit | 0;
      $sor = $sor | 0;
      $eor = $eor | 0;
      var $$0 = 0,
        $$0$i = 0,
        $$0$i$ph = 0,
        $$0$i12 = 0,
        $$0$i12$ph = 0,
        $$02 = 0,
        $$pre$phiZ2D = 0,
        $$sink = 0,
        $1 = 0,
        $100 = 0,
        $107 = 0,
        $113 = 0,
        $115 = 0,
        $118 = 0,
        $119 = 0,
        $125 = 0,
        $128 = 0,
        $132 = 0,
        $135 = 0,
        $137 = 0,
        $140 = 0,
        $146 = 0,
        $158 = 0,
        $167 = 0,
        $169 = 0,
        $178 = 0,
        $26 = 0,
        $29 = 0,
        $31 = 0,
        $39 = 0,
        $42 = 0,
        $44 = 0,
        $47 = 0,
        $51 = 0,
        $54 = 0,
        $63 = 0,
        $66 = 0,
        $67 = 0,
        $70 = 0,
        $75 = 0,
        $77 = 0,
        $9 = 0,
        $90 = 0,
        $93 = 0,
        $actionImp$0 = 0,
        $gprop$0 = 0,
        $i$0$i = 0,
        $i$0$i6 = 0,
        $i$035 = 0,
        $i$1$i = 0,
        $i$1$i9 = 0,
        $i$1$in = 0,
        $j$0 = 0,
        $j$0$in = 0,
        $k$0$in = 0,
        $levState = 0,
        $nextStrongPos$038 = 0,
        $nextStrongPos$1 = 0,
        $nextStrongPos$2 = 0,
        $nextStrongPos$3 = 0,
        $nextStrongProp$037 = 0,
        $nextStrongProp$1 = 0,
        $nextStrongProp$2 = 0,
        $nextStrongProp$3 = 0,
        $prop$0 = 0,
        $start1$1$lcssa = 0,
        $start1$1$ph = 0,
        $start1$133 = 0,
        $start1$2 = 0,
        $start2$032 = 0,
        $start2$1 = 0,
        $stateImp$0 = 0,
        $stateImp$2$lcssa = 0,
        $stateImp$2$ph = 0,
        $stateImp$230 = 0,
        $uchar$0$i = 0,
        $uchar$0$i8 = 0,
        label = 0,
        sp = 0;
      sp = STACKTOP;
      STACKTOP = (STACKTOP + 32) | 0;
      $levState = sp;
      $1 = HEAP32[($pBiDi + 76) >> 2] | 0;
      if ((HEAP32[($pBiDi + 128) >> 2] | 0) > ($start | 0)) {
        if (!(HEAP8[($pBiDi + 98) >> 0] | 0)) label = 4;
        else {
          $9 = HEAP32[($pBiDi + 140) >> 2] | 0;
          if ((HEAP32[$9 >> 2] | 0) > ($start | 0)) label = 4;
          else
            $$sink =
              _ubidi_getParaLevelAtIndex_58(
                HEAP32[($pBiDi + 136) >> 2] | 0,
                $9,
                $start,
              ) | 0;
        }
        if ((label | 0) == 4) $$sink = HEAP8[($pBiDi + 97) >> 0] | 0;
        if (!($$sink & 1)) $178 = 0;
        else $178 = (((HEAP32[($pBiDi + 88) >> 2] | 0) + -5) | 0) >>> 0 < 2;
      } else $178 = 0;
      HEAP32[($levState + 12) >> 2] = -1;
      HEAP32[($levState + 16) >> 2] = -1;
      HEAP32[($levState + 24) >> 2] = $start;
      $26 = HEAP8[((HEAP32[($pBiDi + 80) >> 2] | 0) + $start) >> 0] | 0;
      HEAP8[($levState + 28) >> 0] = $26;
      $29 = $26 & 1;
      $31 = HEAP32[($pBiDi + 116) >> 2] | 0;
      HEAP32[$levState >> 2] = HEAP32[($31 + ($29 << 2)) >> 2];
      HEAP32[($levState + 4) >> 2] = HEAP32[($31 + 8 + ($29 << 2)) >> 2];
      if (!$start) {
        $39 = HEAP32[($pBiDi + 104) >> 2] | 0;
        if (($39 | 0) > 0) {
          $42 = HEAP32[($pBiDi + 100) >> 2] | 0;
          $i$0$i = $39;
          L14: while (1) {
            if (($i$0$i | 0) <= 0) {
              $$0$i$ph = 4;
              label = 16;
              break;
            }
            $44 = ($i$0$i + -1) | 0;
            $47 = HEAPU16[($42 + ($44 << 1)) >> 1] | 0;
            if ((($i$0$i | 0) > 1) & ((($47 & 64512) | 0) == 56320)) {
              $51 = ($i$0$i + -2) | 0;
              $54 = HEAPU16[($42 + ($51 << 1)) >> 1] | 0;
              if ((($54 & 64512) | 0) == 55296) {
                $i$1$i = $51;
                $uchar$0$i = ($47 + -56613888 + ($54 << 10)) | 0;
              } else {
                $i$1$i = $44;
                $uchar$0$i = $47;
              }
            } else {
              $i$1$i = $44;
              $uchar$0$i = $47;
            }
            switch (
              ((_ubidi_getCustomizedClass_58($pBiDi, $uchar$0$i) | 0) & 255) |
              0
            ) {
              case 0: {
                $$0$i$ph = 0;
                label = 16;
                break L14;
                break;
              }
              case 13:
              case 1: {
                label = 17;
                break L14;
                break;
              }
              case 7: {
                $$0$i = 4;
                break L14;
                break;
              }
              default:
                $i$0$i = $i$1$i;
            }
          }
          if ((label | 0) == 16) $$0$i = $$0$i$ph;
          else if ((label | 0) == 17) $$0$i = 1;
          $$0 = ($$0$i << 24) >> 24 == 4 ? $sor : $$0$i;
        } else $$0 = $sor;
      } else $$0 = $sor;
      $63 = ($1 + $start) | 0;
      if ((HEAP8[$63 >> 0] | 0) == 22) {
        $66 = ($pBiDi + 244) | 0;
        $67 = HEAP32[$66 >> 2] | 0;
        if (($67 | 0) > -1) {
          $70 = HEAP32[($pBiDi + 248) >> 2] | 0;
          HEAP32[($levState + 8) >> 2] = HEAP32[($70 + ($67 << 4)) >> 2];
          $75 = HEAP32[($70 + ($67 << 4) + 4) >> 2] | 0;
          $77 = HEAP16[($70 + ($67 << 4) + 12) >> 1] | 0;
          HEAP32[($levState + 20) >> 2] = HEAP32[($70 + ($67 << 4) + 8) >> 2];
          HEAP32[$66 >> 2] = $67 + -1;
          $$pre$phiZ2D = $66;
          $start1$1$ph = $75;
          $stateImp$2$ph = $77;
        } else label = 22;
      } else label = 22;
      if ((label | 0) == 22) {
        HEAP32[($levState + 8) >> 2] = -1;
        if ((HEAP8[$63 >> 0] | 0) == 17)
          $stateImp$0 = (($$0 & 255) + 1) & 65535;
        else $stateImp$0 = 0;
        HEAP32[($levState + 20) >> 2] = 0;
        _processPropertySeq($pBiDi, $levState, $$0, $start, $start);
        $$pre$phiZ2D = ($pBiDi + 244) | 0;
        $start1$1$ph = $start;
        $stateImp$2$ph = $stateImp$0;
      }
      L35: do
        if (($start | 0) > ($limit | 0)) {
          $start1$1$lcssa = $start1$1$ph;
          $stateImp$2$lcssa = $stateImp$2$ph;
        } else {
          $i$035 = $start;
          $nextStrongPos$038 = -1;
          $nextStrongProp$037 = 1;
          $start1$133 = $start1$1$ph;
          $start2$032 = $start;
          $stateImp$230 = $stateImp$2$ph;
          while (1) {
            $90 = ($i$035 | 0) < ($limit | 0);
            if ($90) {
              $100 = HEAP8[($1 + $i$035) >> 0] | 0;
              if (($100 << 24) >> 24 == 7) HEAP32[$$pre$phiZ2D >> 2] = -1;
              if ($178)
                if (($100 << 24) >> 24 == 13) {
                  $nextStrongPos$2 = $nextStrongPos$038;
                  $nextStrongProp$2 = $nextStrongProp$037;
                  $prop$0 = 1;
                } else if (($100 << 24) >> 24 == 2) {
                  L47: do
                    if (($nextStrongPos$038 | 0) > ($i$035 | 0)) {
                      $nextStrongPos$1 = $nextStrongPos$038;
                      $nextStrongProp$1 = $nextStrongProp$037;
                    } else {
                      $j$0$in = $i$035;
                      while (1) {
                        $j$0 = ($j$0$in + 1) | 0;
                        if (($j$0 | 0) >= ($limit | 0)) {
                          $nextStrongPos$1 = $limit;
                          $nextStrongProp$1 = 1;
                          break L47;
                        }
                        $107 = HEAP8[($1 + $j$0) >> 0] | 0;
                        switch (($107 << 24) >> 24) {
                          case 13:
                          case 1:
                          case 0: {
                            $nextStrongPos$1 = $j$0;
                            $nextStrongProp$1 = $107;
                            break L47;
                            break;
                          }
                          default:
                            $j$0$in = $j$0;
                        }
                      }
                    }
                  while (0);
                  $nextStrongPos$2 = $nextStrongPos$1;
                  $nextStrongProp$2 = $nextStrongProp$1;
                  $prop$0 = ($nextStrongProp$1 << 24) >> 24 == 13 ? 5 : 2;
                } else {
                  $nextStrongPos$2 = $nextStrongPos$038;
                  $nextStrongProp$2 = $nextStrongProp$037;
                  $prop$0 = $100;
                }
              else {
                $nextStrongPos$2 = $nextStrongPos$038;
                $nextStrongProp$2 = $nextStrongProp$037;
                $prop$0 = $100;
              }
              $gprop$0 = HEAP8[(66846 + ($prop$0 & 255)) >> 0] | 0;
              $nextStrongPos$3 = $nextStrongPos$2;
              $nextStrongProp$3 = $nextStrongProp$2;
            } else {
              $k$0$in = $limit;
              do {
                $k$0$in = ($k$0$in + -1) | 0;
                $93 = HEAP8[($1 + $k$0$in) >> 0] | 0;
                if (($k$0$in | 0) <= ($start | 0)) break;
              } while ((((1 << ($93 & 255)) & 382976) | 0) != 0);
              if ((($93 & -2) << 24) >> 24 == 20) {
                $start1$1$lcssa = $start1$133;
                $stateImp$2$lcssa = $stateImp$230;
                break L35;
              } else {
                $gprop$0 = $eor;
                $nextStrongPos$3 = $nextStrongPos$038;
                $nextStrongProp$3 = $nextStrongProp$037;
              }
            }
            $113 = $stateImp$230 & 65535;
            $115 = HEAP8[(($gprop$0 & 255) + (66871 + ($113 << 4))) >> 0] | 0;
            $118 = $115 & 31;
            $119 = ($115 & 255) >>> 5;
            $actionImp$0 =
              (($i$035 | 0) == ($limit | 0)) & (($119 << 24) >> 24 == 0)
                ? 1
                : $119 & 255;
            L58: do
              if (!(($actionImp$0 << 16) >> 16)) {
                $start1$2 = $start1$133;
                $start2$1 = $start2$032;
              } else {
                $125 = HEAP8[(66871 + ($113 << 4) + 15) >> 0] | 0;
                switch (($actionImp$0 & 65535) | 0) {
                  case 1: {
                    _processPropertySeq(
                      $pBiDi,
                      $levState,
                      $125,
                      $start1$133,
                      $i$035,
                    );
                    $start1$2 = $i$035;
                    $start2$1 = $start2$032;
                    break L58;
                    break;
                  }
                  case 2: {
                    $start1$2 = $start1$133;
                    $start2$1 = $i$035;
                    break L58;
                    break;
                  }
                  case 3: {
                    _processPropertySeq(
                      $pBiDi,
                      $levState,
                      $125,
                      $start1$133,
                      $start2$032,
                    );
                    _processPropertySeq(
                      $pBiDi,
                      $levState,
                      4,
                      $start2$032,
                      $i$035,
                    );
                    $start1$2 = $i$035;
                    $start2$1 = $start2$032;
                    break L58;
                    break;
                  }
                  case 4: {
                    _processPropertySeq(
                      $pBiDi,
                      $levState,
                      $125,
                      $start1$133,
                      $start2$032,
                    );
                    $start1$2 = $start2$032;
                    $start2$1 = $i$035;
                    break L58;
                    break;
                  }
                  default: {
                    $start1$2 = $start1$133;
                    $start2$1 = $start2$032;
                    break L58;
                  }
                }
              }
            while (0);
            if ($90) {
              $i$035 = ($i$035 + 1) | 0;
              $nextStrongPos$038 = $nextStrongPos$3;
              $nextStrongProp$037 = $nextStrongProp$3;
              $start1$133 = $start1$2;
              $start2$032 = $start2$1;
              $stateImp$230 = $118;
            } else {
              $start1$1$lcssa = $start1$2;
              $stateImp$2$lcssa = $118;
              break;
            }
          }
        }
      while (0);
      $128 = ($pBiDi + 16) | 0;
      if ((HEAP32[$128 >> 2] | 0) == ($limit | 0)) {
        $132 = HEAP32[($pBiDi + 112) >> 2] | 0;
        if (($132 | 0) > 0) {
          $135 = HEAP32[($pBiDi + 108) >> 2] | 0;
          $i$0$i6 = 0;
          L70: while (1) {
            if (($i$0$i6 | 0) >= ($132 | 0)) {
              $$0$i12$ph = 4;
              label = 55;
              break;
            }
            $137 = ($i$0$i6 + 1) | 0;
            $140 = HEAPU16[($135 + ($i$0$i6 << 1)) >> 1] | 0;
            if ((($137 | 0) == ($132 | 0)) | ((($140 & 64512) | 0) != 55296)) {
              $i$1$i9 = $137;
              $uchar$0$i8 = $140;
            } else {
              $146 = HEAPU16[($135 + ($137 << 1)) >> 1] | 0;
              if ((($146 & 64512) | 0) == 56320) {
                $i$1$i9 = ($i$0$i6 + 2) | 0;
                $uchar$0$i8 = (($140 << 10) + -56613888 + $146) | 0;
              } else {
                $i$1$i9 = $137;
                $uchar$0$i8 = $140;
              }
            }
            switch (
              ((_ubidi_getCustomizedClass_58($pBiDi, $uchar$0$i8) | 0) & 255) |
              0
            ) {
              case 0: {
                $$0$i12$ph = 0;
                label = 55;
                break L70;
                break;
              }
              case 13:
              case 1: {
                label = 56;
                break L70;
                break;
              }
              case 2: {
                label = 57;
                break L70;
                break;
              }
              case 5: {
                $$0$i12 = 3;
                break L70;
                break;
              }
              default:
                $i$0$i6 = $i$1$i9;
            }
          }
          if ((label | 0) == 55) $$0$i12 = $$0$i12$ph;
          else if ((label | 0) == 56) $$0$i12 = 1;
          else if ((label | 0) == 57) $$0$i12 = 2;
          $$02 = ($$0$i12 << 24) >> 24 == 4 ? $eor : $$0$i12;
        } else $$02 = $eor;
      } else $$02 = $eor;
      $i$1$in = $limit;
      do {
        $i$1$in = ($i$1$in + -1) | 0;
        $158 = HEAP8[($1 + $i$1$in) >> 0] | 0;
        if (($i$1$in | 0) <= ($start | 0)) break;
      } while ((((1 << ($158 & 255)) & 382976) | 0) != 0);
      if ((($158 & -2) << 24) >> 24 == 20)
        if ((HEAP32[$128 >> 2] | 0) > ($limit | 0)) {
          $167 = ((HEAP32[$$pre$phiZ2D >> 2] | 0) + 1) | 0;
          HEAP32[$$pre$phiZ2D >> 2] = $167;
          $169 = HEAP32[($pBiDi + 248) >> 2] | 0;
          HEAP16[($169 + ($167 << 4) + 12) >> 1] = $stateImp$2$lcssa;
          HEAP32[($169 + ($167 << 4) + 8) >> 2] = HEAP32[($levState + 20) >> 2];
          HEAP32[($169 + ($167 << 4) + 4) >> 2] = $start1$1$lcssa;
          HEAP32[($169 + ($167 << 4)) >> 2] = HEAP32[($levState + 8) >> 2];
        } else label = 65;
      else label = 65;
      if ((label | 0) == 65)
        _processPropertySeq($pBiDi, $levState, $$02, $limit, $limit);
      STACKTOP = sp;
      return;
    }
    function _ubidi_getRuns_58($pBiDi, $pErrorCode) {
      $pBiDi = $pBiDi | 0;
      $pErrorCode = $pErrorCode | 0;
      var $$$i = 0,
        $$lcssa10 = 0,
        $$runCount$0 = 0,
        $$runCount$0$i = 0,
        $0 = 0,
        $112 = 0,
        $113 = 0,
        $118 = 0,
        $119 = 0,
        $125 = 0,
        $132 = 0,
        $137 = 0,
        $141 = 0,
        $144 = 0,
        $145 = 0,
        $146 = 0,
        $148 = 0,
        $152 = 0,
        $16 = 0,
        $161 = 0,
        $163 = 0,
        $164 = 0,
        $165 = 0,
        $166 = 0,
        $169 = 0,
        $17 = 0,
        $175 = 0,
        $177 = 0,
        $18 = 0,
        $19 = 0,
        $20 = 0,
        $21 = 0,
        $29 = 0,
        $30 = 0,
        $36 = 0,
        $38 = 0,
        $45 = 0,
        $47 = 0,
        $64 = 0,
        $7 = 0,
        $71 = 0,
        $72 = 0,
        $77 = 0,
        $79 = 0,
        $8 = 0,
        $81 = 0,
        $90 = 0,
        $98 = 0,
        $99 = 0,
        $endRun$0$i27 = 0,
        $firstRun$0$i$be = 0,
        $firstRun$0$i29 = 0,
        $firstRun$1$i26 = 0,
        $firstRun$2$i22 = 0,
        $i$033 = 0,
        $i$1 = 0,
        $i$2 = 0,
        $i$319 = 0,
        $level$031 = 0,
        $limit$020 = 0,
        $limitRun$0$i = 0,
        $maxLevel$0 = 0,
        $minLevel$0 = 0,
        $minLevel$2 = 0,
        $pBiDi$idx3$val = 0,
        $point$017 = 0,
        $pu$016 = 0,
        $runCount$0$lcssa2 = 0,
        $runCount$032 = 0,
        $runCount$1$i23 = 0,
        $runIndex$0 = 0,
        $tempRun$i = 0,
        label = 0,
        sp = 0,
        $level$031$looptemp = 0;
      sp = STACKTOP;
      STACKTOP = (STACKTOP + 16) | 0;
      $tempRun$i = sp;
      $0 = ($pBiDi + 224) | 0;
      L1: do
        if ((HEAP32[$0 >> 2] | 0) <= -1) {
          do
            if ((HEAP32[($pBiDi + 120) >> 2] | 0) == 2) {
              $16 = ($pBiDi + 16) | 0;
              $17 = HEAP32[$16 >> 2] | 0;
              $18 = ($pBiDi + 80) | 0;
              $19 = HEAP32[$18 >> 2] | 0;
              $20 = ($pBiDi + 132) | 0;
              $21 = HEAP32[$20 >> 2] | 0;
              if (($21 | 0) > 0) {
                $i$033 = 0;
                $level$031 = -2;
                $runCount$032 = 0;
                do {
                  $level$031$looptemp = $level$031;
                  $level$031 = HEAP8[($19 + $i$033) >> 0] | 0;
                  $runCount$032 =
                    (((($level$031 << 24) >> 24 !=
                      ($level$031$looptemp << 24) >> 24) &
                      1) +
                      $runCount$032) |
                    0;
                  $i$033 = ($i$033 + 1) | 0;
                } while (($i$033 | 0) != ($21 | 0));
                if ((($17 | 0) == ($21 | 0)) & (($runCount$032 | 0) == 1)) {
                  $29 = HEAP8[$19 >> 0] | 0;
                  $30 = ($pBiDi + 232) | 0;
                  HEAP32[($pBiDi + 228) >> 2] = $30;
                  HEAP32[$0 >> 2] = 1;
                  HEAP32[$30 >> 2] = ($29 & 255) << 31;
                  HEAP32[($pBiDi + 236) >> 2] = $17;
                  HEAP32[($pBiDi + 240) >> 2] = 0;
                  break;
                } else $runCount$0$lcssa2 = $runCount$032;
              } else $runCount$0$lcssa2 = 0;
              $36 = ($17 | 0) > ($21 | 0);
              $$runCount$0 = ($runCount$0$lcssa2 + ($36 & 1)) | 0;
              $38 = ($pBiDi + 64) | 0;
              if (
                !(
                  ((_ubidi_getMemory_58(
                    $38,
                    ($pBiDi + 40) | 0,
                    HEAP8[($pBiDi + 73) >> 0] | 0,
                    ($$runCount$0 * 12) | 0,
                  ) |
                    0) <<
                    24) >>
                  24
                )
              )
                break L1;
              $45 = HEAP32[$38 >> 2] | 0;
              $i$1 = 0;
              $maxLevel$0 = 0;
              $minLevel$0 = 126;
              $runIndex$0 = 0;
              while (1) {
                $47 = HEAP8[($19 + $i$1) >> 0] | 0;
                $minLevel$0 =
                  ($47 & 255) < ($minLevel$0 & 255) ? $47 : $minLevel$0;
                $maxLevel$0 =
                  ($47 & 255) > ($maxLevel$0 & 255) ? $47 : $maxLevel$0;
                $i$2 = $i$1;
                while (1) {
                  $i$2 = ($i$2 + 1) | 0;
                  if (($i$2 | 0) >= ($21 | 0)) {
                    $$lcssa10 = 0;
                    break;
                  }
                  if ((HEAP8[($19 + $i$2) >> 0] | 0) != ($47 << 24) >> 24) {
                    $$lcssa10 = 1;
                    break;
                  }
                }
                HEAP32[($45 + (($runIndex$0 * 12) | 0)) >> 2] = $i$1;
                HEAP32[($45 + (($runIndex$0 * 12) | 0) + 4) >> 2] = $i$2 - $i$1;
                HEAP32[($45 + (($runIndex$0 * 12) | 0) + 8) >> 2] = 0;
                $runIndex$0 = ($runIndex$0 + 1) | 0;
                if (!$$lcssa10) break;
                else $i$1 = $i$2;
              }
              if ($36) {
                HEAP32[($45 + (($runIndex$0 * 12) | 0)) >> 2] = $21;
                HEAP32[($45 + (($runIndex$0 * 12) | 0) + 4) >> 2] = $17 - $21;
                $64 = HEAP8[($pBiDi + 97) >> 0] | 0;
                $minLevel$2 =
                  ($64 & 255) < ($minLevel$0 & 255) ? $64 : $minLevel$0;
              } else $minLevel$2 = $minLevel$0;
              HEAP32[($pBiDi + 228) >> 2] = $45;
              HEAP32[$0 >> 2] = $$runCount$0;
              if (($maxLevel$0 & 255) >>> 0 > (($minLevel$2 & 255) | 1) >>> 0) {
                $71 = (($minLevel$2 + 1) << 24) >> 24;
                $72 = HEAP32[$18 >> 2] | 0;
                $$$i =
                  (((((HEAP32[$20 >> 2] | 0) < (HEAP32[$16 >> 2] | 0)) << 31) >>
                    31) +
                    $$runCount$0) |
                  0;
                $77 = (($maxLevel$0 + -1) << 24) >> 24;
                if (($77 & 255) >= ($71 & 255)) {
                  $79 = ($$$i | 0) > 0;
                  $81 = $77;
                  do {
                    L28: do
                      if ($79) {
                        $firstRun$0$i29 = 0;
                        while (1) {
                          if (
                            (HEAPU8[
                              ($72 +
                                (HEAP32[
                                  ($45 + (($firstRun$0$i29 * 12) | 0)) >> 2
                                ] |
                                  0)) >>
                                0
                            ] |
                              0) <
                            ($81 & 255)
                          )
                            $firstRun$0$i$be = ($firstRun$0$i29 + 1) | 0;
                          else {
                            $limitRun$0$i = $firstRun$0$i29;
                            while (1) {
                              $90 = ($limitRun$0$i + 1) | 0;
                              if (($90 | 0) >= ($$$i | 0)) break;
                              if (
                                (HEAPU8[
                                  ($72 +
                                    (HEAP32[($45 + (($90 * 12) | 0)) >> 2] |
                                      0)) >>
                                    0
                                ] |
                                  0) <
                                ($81 & 255)
                              )
                                break;
                              else $limitRun$0$i = $90;
                            }
                            if (($firstRun$0$i29 | 0) < ($limitRun$0$i | 0)) {
                              $endRun$0$i27 = $limitRun$0$i;
                              $firstRun$1$i26 = $firstRun$0$i29;
                              do {
                                $98 = ($45 + (($firstRun$1$i26 * 12) | 0)) | 0;
                                HEAP32[$tempRun$i >> 2] = HEAP32[$98 >> 2];
                                HEAP32[($tempRun$i + 4) >> 2] =
                                  HEAP32[($98 + 4) >> 2];
                                HEAP32[($tempRun$i + 8) >> 2] =
                                  HEAP32[($98 + 8) >> 2];
                                $99 = ($45 + (($endRun$0$i27 * 12) | 0)) | 0;
                                HEAP32[$98 >> 2] = HEAP32[$99 >> 2];
                                HEAP32[($98 + 4) >> 2] = HEAP32[($99 + 4) >> 2];
                                HEAP32[($98 + 8) >> 2] = HEAP32[($99 + 8) >> 2];
                                HEAP32[$99 >> 2] = HEAP32[$tempRun$i >> 2];
                                HEAP32[($99 + 4) >> 2] =
                                  HEAP32[($tempRun$i + 4) >> 2];
                                HEAP32[($99 + 8) >> 2] =
                                  HEAP32[($tempRun$i + 8) >> 2];
                                $firstRun$1$i26 = ($firstRun$1$i26 + 1) | 0;
                                $endRun$0$i27 = ($endRun$0$i27 + -1) | 0;
                              } while (
                                ($firstRun$1$i26 | 0) <
                                ($endRun$0$i27 | 0)
                              );
                            }
                            if (($90 | 0) == ($$$i | 0)) break L28;
                            $firstRun$0$i$be = ($limitRun$0$i + 2) | 0;
                          }
                          if (($firstRun$0$i$be | 0) < ($$$i | 0))
                            $firstRun$0$i29 = $firstRun$0$i$be;
                          else break;
                        }
                      }
                    while (0);
                    $81 = (($81 + -1) << 24) >> 24;
                  } while (($81 & 255) >= ($71 & 255));
                }
                if (!($71 & 1)) {
                  $$runCount$0$i =
                    (((((HEAP32[$20 >> 2] | 0) == (HEAP32[$16 >> 2] | 0)) <<
                      31) >>
                      31) +
                      $$$i) |
                    0;
                  if (($$runCount$0$i | 0) > 0) {
                    $firstRun$2$i22 = 0;
                    $runCount$1$i23 = $$runCount$0$i;
                    do {
                      $112 = ($45 + (($firstRun$2$i22 * 12) | 0)) | 0;
                      HEAP32[$tempRun$i >> 2] = HEAP32[$112 >> 2];
                      HEAP32[($tempRun$i + 4) >> 2] = HEAP32[($112 + 4) >> 2];
                      HEAP32[($tempRun$i + 8) >> 2] = HEAP32[($112 + 8) >> 2];
                      $113 = ($45 + (($runCount$1$i23 * 12) | 0)) | 0;
                      HEAP32[$112 >> 2] = HEAP32[$113 >> 2];
                      HEAP32[($112 + 4) >> 2] = HEAP32[($113 + 4) >> 2];
                      HEAP32[($112 + 8) >> 2] = HEAP32[($113 + 8) >> 2];
                      HEAP32[$113 >> 2] = HEAP32[$tempRun$i >> 2];
                      HEAP32[($113 + 4) >> 2] = HEAP32[($tempRun$i + 4) >> 2];
                      HEAP32[($113 + 8) >> 2] = HEAP32[($tempRun$i + 8) >> 2];
                      $firstRun$2$i22 = ($firstRun$2$i22 + 1) | 0;
                      $runCount$1$i23 = ($runCount$1$i23 + -1) | 0;
                    } while (($firstRun$2$i22 | 0) < ($runCount$1$i23 | 0));
                  }
                }
              }
              if (($$runCount$0 | 0) > 0) {
                $i$319 = 0;
                $limit$020 = 0;
                do {
                  $118 = ($45 + (($i$319 * 12) | 0)) | 0;
                  $119 = HEAP32[$118 >> 2] | 0;
                  HEAP32[$118 >> 2] = (HEAPU8[($19 + $119) >> 0] << 31) | $119;
                  $125 = ($45 + (($i$319 * 12) | 0) + 4) | 0;
                  $limit$020 = ((HEAP32[$125 >> 2] | 0) + $limit$020) | 0;
                  HEAP32[$125 >> 2] = $limit$020;
                  $i$319 = ($i$319 + 1) | 0;
                } while (($i$319 | 0) != ($$runCount$0 | 0));
              }
              if (($runIndex$0 | 0) < ($$runCount$0 | 0)) {
                $132 = HEAPU8[($pBiDi + 97) >> 0] | 0;
                $137 =
                  ($45 +
                    ((((($132 & 1) | 0) != 0 ? 0 : $runIndex$0) * 12) | 0)) |
                  0;
                HEAP32[$137 >> 2] = ($132 << 31) | HEAP32[$137 >> 2];
              }
            } else {
              $7 = HEAP8[($pBiDi + 97) >> 0] | 0;
              $8 = ($pBiDi + 232) | 0;
              HEAP32[($pBiDi + 228) >> 2] = $8;
              HEAP32[$0 >> 2] = 1;
              HEAP32[$8 >> 2] = ($7 & 255) << 31;
              HEAP32[($pBiDi + 236) >> 2] = HEAP32[($pBiDi + 16) >> 2];
              HEAP32[($pBiDi + 240) >> 2] = 0;
            }
          while (0);
          $141 = HEAP32[($pBiDi + 336) >> 2] | 0;
          if (($141 | 0) > 0) {
            $144 = HEAP32[($pBiDi + 348) >> 2] | 0;
            $145 = ($144 + ($141 << 3)) | 0;
            $146 = ($pBiDi + 228) | 0;
            $pBiDi$idx3$val = HEAP32[$146 >> 2] | 0;
            $point$017 = $144;
            do {
              $148 =
                _getRunFromLogicalIndex(
                  HEAP32[$0 >> 2] | 0,
                  $pBiDi$idx3$val,
                  HEAP32[$point$017 >> 2] | 0,
                  $pErrorCode,
                ) | 0;
              $pBiDi$idx3$val = HEAP32[$146 >> 2] | 0;
              $152 = ($pBiDi$idx3$val + (($148 * 12) | 0) + 8) | 0;
              HEAP32[$152 >> 2] =
                HEAP32[$152 >> 2] | HEAP32[($point$017 + 4) >> 2];
              $point$017 = ($point$017 + 8) | 0;
            } while ($point$017 >>> 0 < $145 >>> 0);
          }
          if ((HEAP32[($pBiDi + 352) >> 2] | 0) > 0) {
            $161 = HEAP32[($pBiDi + 8) >> 2] | 0;
            $163 = HEAP32[($pBiDi + 16) >> 2] | 0;
            $164 = ($161 + ($163 << 1)) | 0;
            $165 = $161;
            $166 = ($pBiDi + 228) | 0;
            if (($163 | 0) > 0) {
              $pu$016 = $161;
              do {
                $169 = HEAPU16[$pu$016 >> 1] | 0;
                if ((($169 & 65532) | 0) == 8204) label = 44;
                else
                  switch ($169 | 0) {
                    case 8234:
                    case 8235:
                    case 8236:
                    case 8237:
                    case 8238:
                    case 8294:
                    case 8295:
                    case 8296:
                    case 8297: {
                      label = 44;
                      break;
                    }
                    default: {
                    }
                  }
                if ((label | 0) == 44) {
                  label = 0;
                  $175 =
                    _getRunFromLogicalIndex(
                      HEAP32[$0 >> 2] | 0,
                      HEAP32[$166 >> 2] | 0,
                      ($pu$016 - $165) >> 1,
                      $pErrorCode,
                    ) | 0;
                  $177 = ((HEAP32[$166 >> 2] | 0) + (($175 * 12) | 0) + 8) | 0;
                  HEAP32[$177 >> 2] = (HEAP32[$177 >> 2] | 0) + -1;
                }
                $pu$016 = ($pu$016 + 2) | 0;
              } while ($pu$016 >>> 0 < $164 >>> 0);
            }
          }
        }
      while (0);
      STACKTOP = sp;
      return;
    }
    function _bracketProcessChar($bd, $position) {
      $bd = $bd | 0;
      $position = $position | 0;
      var $$0 = 0,
        $$pre$i = 0,
        $1 = 0,
        $100 = 0,
        $101 = 0,
        $114 = 0,
        $115 = 0,
        $12 = 0,
        $122 = 0,
        $13 = 0,
        $139 = 0,
        $142 = 0,
        $143 = 0,
        $16 = 0,
        $163 = 0,
        $167 = 0,
        $169 = 0,
        $171 = 0,
        $172 = 0,
        $176 = 0,
        $18 = 0,
        $180 = 0,
        $19 = 0,
        $2 = 0,
        $20 = 0,
        $22 = 0,
        $23 = 0,
        $29 = 0,
        $3 = 0,
        $31 = 0,
        $41 = 0,
        $5 = 0,
        $6 = 0,
        $60 = 0,
        $61 = 0,
        $63 = 0,
        $64 = 0,
        $69 = 0,
        $7 = 0,
        $71 = 0,
        $77 = 0,
        $87 = 0,
        $88 = 0,
        $90 = 0,
        $93 = 0,
        $96 = 0,
        $97 = 0,
        $98 = 0,
        $i$025 = 0,
        $i1$024 = 0,
        $idx$0 = 0,
        $idx$0$in = 0,
        $k$0$i31 = 0,
        $k$1$i28 = 0,
        $newProp$0 = 0,
        $newProp$0$i = 0,
        $newProp$0$in$i = 0,
        $newProp$07 = 0,
        $not$1 = 0,
        $stable$0$i = 0,
        $storemerge = 0,
        $storemerge$i = 0,
        label = 0;
      $1 = HEAP32[($bd + 492) >> 2] | 0;
      $2 = ($bd + 496 + ($1 << 4)) | 0;
      $3 = HEAP32[$bd >> 2] | 0;
      $5 = HEAP32[($3 + 76) >> 2] | 0;
      $6 = ($5 + $position) | 0;
      $7 = HEAP8[$6 >> 0] | 0;
      L1: do
        if (($7 << 24) >> 24 == 10) {
          $12 =
            HEAP16[((HEAP32[($3 + 8) >> 2] | 0) + ($position << 1)) >> 1] | 0;
          $13 = ($bd + 496 + ($1 << 4) + 6) | 0;
          $16 = ($bd + 496 + ($1 << 4) + 4) | 0;
          $18 = HEAPU16[$16 >> 1] | 0;
          $19 = ($bd + 484) | 0;
          $20 = $12 & 65535;
          $idx$0$in = HEAPU16[$13 >> 1] | 0;
          while (1) {
            $idx$0 = ($idx$0$in + -1) | 0;
            if (($idx$0$in | 0) <= ($18 | 0)) {
              label = 32;
              break;
            }
            $22 = HEAP32[$19 >> 2] | 0;
            $23 = ($22 + (($idx$0 * 24) | 0) + 4) | 0;
            if ((HEAP32[$23 >> 2] | 0) == ($20 | 0)) break;
            else $idx$0$in = $idx$0;
          }
          if ((label | 0) == 32) {
            if (!(($12 << 16) >> 16)) {
              label = 39;
              break;
            }
            $122 = (_ubidi_getPairedBracket_58($20) | 0) & 65535;
            if (($122 << 16) >> 16 == ($12 << 16) >> 16) {
              label = 39;
              break;
            }
            if (
              (_ubidi_getPairedBracketType_58(HEAP32[($3 + 4) >> 2] | 0, $20) |
                0) !=
              1
            ) {
              label = 39;
              break;
            }
            L11: do
              if (($122 << 16) >> 16 < 12297) {
                switch (($122 << 16) >> 16) {
                  case 9002:
                    break;
                  default:
                    break L11;
                }
                if (
                  !(
                    ((_bracketAddOpening($bd, 12297, $position) | 0) << 24) >>
                    24
                  )
                ) {
                  $$0 = 0;
                  break L1;
                }
              } else {
                switch (($122 << 16) >> 16) {
                  case 12297:
                    break;
                  default:
                    break L11;
                }
                if (
                  !(
                    ((_bracketAddOpening($bd, 9002, $position) | 0) << 24) >>
                    24
                  )
                ) {
                  $$0 = 0;
                  break L1;
                }
              }
            while (0);
            if (
              !(((_bracketAddOpening($bd, $122, $position) | 0) << 24) >> 24)
            ) {
              $$0 = 0;
              break;
            } else {
              label = 39;
              break;
            }
          }
          $29 = HEAPU8[($bd + 496 + ($1 << 4) + 8) >> 0] & 1;
          $31 = HEAP16[($22 + (($idx$0 * 24) | 0) + 12) >> 1] | 0;
          if (!$29)
            if (!($31 & 1)) label = 8;
            else {
              $newProp$0$in$i = 0;
              $stable$0$i = 0;
            }
          else if (!($31 & 2)) label = 8;
          else {
            $newProp$0$in$i = $29;
            $stable$0$i = 0;
          }
          do
            if ((label | 0) == 8)
              if (!($31 & 3)) {
                HEAP16[$13 >> 1] = $idx$0;
                label = 39;
                break L1;
              } else {
                $newProp$0$in$i =
                  HEAP32[($22 + (($idx$0 * 24) | 0) + 16) >> 2] | 0;
                $stable$0$i = ($18 | 0) != ($idx$0 | 0);
                break;
              }
          while (0);
          $newProp$0$i = $newProp$0$in$i & 255;
          $41 = ($22 + (($idx$0 * 24) | 0)) | 0;
          HEAP8[($5 + (HEAP32[$41 >> 2] | 0)) >> 0] = $newProp$0$i;
          HEAP8[
            ((HEAP32[((HEAP32[$bd >> 2] | 0) + 76) >> 2] | 0) + $position) >> 0
          ] = $newProp$0$i;
          _fixN0c($bd, $idx$0, HEAP32[$41 >> 2] | 0, $newProp$0$i);
          L27: do
            if ($stable$0$i) {
              HEAP32[$23 >> 2] = 0 - $position;
              $60 = HEAP16[$16 >> 1] | 0;
              $61 = $60 & 65535;
              L29: do
                if (($idx$0 | 0) > ($61 | 0)) {
                  $63 = HEAP32[$19 >> 2] | 0;
                  $64 = HEAP32[$41 >> 2] | 0;
                  $k$0$i31 = ($idx$0$in + -2) | 0;
                  while (1) {
                    if (
                      (HEAP32[($63 + (($k$0$i31 * 24) | 0)) >> 2] | 0) !=
                      ($64 | 0)
                    )
                      break L29;
                    HEAP32[($63 + (($k$0$i31 * 24) | 0) + 4) >> 2] = 0;
                    if (($k$0$i31 | 0) > ($61 | 0))
                      $k$0$i31 = ($k$0$i31 + -1) | 0;
                    else break;
                  }
                }
              while (0);
              $69 = HEAPU16[$13 >> 1] | 0;
              if (($idx$0$in | 0) < ($69 | 0)) {
                $71 = HEAP32[$19 >> 2] | 0;
                $k$1$i28 = $idx$0$in;
                while (1) {
                  if (
                    (HEAP32[($71 + (($k$1$i28 * 24) | 0)) >> 2] | 0) >=
                    ($position | 0)
                  ) {
                    $98 = $60;
                    break L27;
                  }
                  $77 = ($71 + (($k$1$i28 * 24) | 0) + 4) | 0;
                  if ((HEAP32[$77 >> 2] | 0) > 0) HEAP32[$77 >> 2] = 0;
                  $k$1$i28 = ($k$1$i28 + 1) | 0;
                  if (($k$1$i28 | 0) >= ($69 | 0)) {
                    $98 = $60;
                    break;
                  }
                }
              } else $98 = $60;
            } else {
              $$pre$i = HEAP16[$16 >> 1] | 0;
              $storemerge$i = $idx$0 & 65535;
              while (1) {
                HEAP16[$13 >> 1] = $storemerge$i;
                if (($storemerge$i & 65535) <= ($$pre$i & 65535)) {
                  $98 = $$pre$i;
                  break L27;
                }
                if (
                  (HEAP32[
                    ((HEAP32[$19 >> 2] | 0) +
                      ((((($storemerge$i & 65535) + -1) | 0) * 24) | 0)) >>
                      2
                  ] |
                    0) ==
                  (HEAP32[$41 >> 2] | 0)
                )
                  $storemerge$i = (($storemerge$i + -1) << 16) >> 16;
                else {
                  $98 = $$pre$i;
                  break;
                }
              }
            }
          while (0);
          if (($newProp$0$i << 24) >> 24 == 10) label = 39;
          else {
            HEAP8[($bd + 496 + ($1 << 4) + 10) >> 0] = 10;
            HEAP32[($bd + 496 + ($1 << 4) + 12) >> 2] = $newProp$0$in$i & 255;
            HEAP32[$2 >> 2] = $position;
            $87 = HEAP32[((HEAP32[$bd >> 2] | 0) + 80) >> 2] | 0;
            $88 = ($87 + $position) | 0;
            $90 = HEAPU8[$88 >> 0] | 0;
            if (!($90 & 128)) $115 = $87;
            else {
              $93 = $90 & 1;
              HEAP8[($bd + 496 + ($1 << 4) + 9) >> 0] = $93;
              $96 = 1 << $93;
              $97 = $98 & 65535;
              if (($97 | 0) < ($idx$0 | 0)) {
                $100 = HEAP32[$19 >> 2] | 0;
                $i$025 = $97;
                do {
                  $101 = ($100 + (($i$025 * 24) | 0) + 12) | 0;
                  HEAP16[$101 >> 1] = HEAPU16[$101 >> 1] | $96;
                  $i$025 = ($i$025 + 1) | 0;
                } while (($i$025 | 0) != ($idx$0 | 0));
              }
              HEAP8[$88 >> 0] = HEAPU8[$88 >> 0] & 127;
              $115 = HEAP32[((HEAP32[$bd >> 2] | 0) + 80) >> 2] | 0;
            }
            $114 =
              ($115 +
                (HEAP32[((HEAP32[$19 >> 2] | 0) + (($idx$0 * 24) | 0)) >> 2] |
                  0)) |
              0;
            HEAP8[$114 >> 0] = HEAPU8[$114 >> 0] & 127;
            $$0 = 1;
          }
        } else label = 39;
      while (0);
      L56: do
        if ((label | 0) == 39) {
          $139 =
            HEAPU8[
              ((HEAP32[((HEAP32[$bd >> 2] | 0) + 80) >> 2] | 0) + $position) >>
                0
            ] | 0;
          L58: do
            if (!($139 & 128))
              switch (($7 << 24) >> 24) {
                case 0:
                case 1:
                case 13: {
                  $not$1 = ($7 << 24) >> 24 != 0;
                  HEAP8[($bd + 496 + ($1 << 4) + 10) >> 0] = $7;
                  HEAP8[($bd + 496 + ($1 << 4) + 9) >> 0] = $7;
                  HEAP32[($bd + 496 + ($1 << 4) + 12) >> 2] = $not$1 & 1;
                  HEAP32[$2 >> 2] = $position;
                  $newProp$0 = $not$1 & 1;
                  label = 55;
                  break L58;
                  break;
                }
                case 2: {
                  HEAP8[($bd + 496 + ($1 << 4) + 10) >> 0] = 2;
                  switch (HEAP8[($bd + 496 + ($1 << 4) + 9) >> 0] | 0) {
                    case 0: {
                      if (!(HEAP8[($bd + 2528) >> 0] | 0)) HEAP8[$6 >> 0] = 23;
                      HEAP32[($bd + 496 + ($1 << 4) + 12) >> 2] = 0;
                      HEAP32[$2 >> 2] = $position;
                      $newProp$07 = 0;
                      break L58;
                      break;
                    }
                    case 13: {
                      $storemerge = 5;
                      break;
                    }
                    default:
                      $storemerge = 24;
                  }
                  HEAP8[$6 >> 0] = $storemerge;
                  HEAP32[($bd + 496 + ($1 << 4) + 12) >> 2] = 1;
                  HEAP32[$2 >> 2] = $position;
                  $newProp$07 = 1;
                  break L58;
                  break;
                }
                case 5: {
                  HEAP8[($bd + 496 + ($1 << 4) + 10) >> 0] = 5;
                  HEAP32[($bd + 496 + ($1 << 4) + 12) >> 2] = 1;
                  HEAP32[$2 >> 2] = $position;
                  $newProp$07 = 1;
                  break L58;
                  break;
                }
                case 17: {
                  $163 = HEAP8[($bd + 496 + ($1 << 4) + 10) >> 0] | 0;

                  if (($163 << 24) >> 24 != 10) {
                    $newProp$0 = $163;
                    label = 55;
                    break L58;
                  }
                  HEAP8[$6 >> 0] = 10;
                  $$0 = 1;
                  break L56;
                  break;
                }
                default: {
                  HEAP8[($bd + 496 + ($1 << 4) + 10) >> 0] = $7;
                  $newProp$0 = $7;
                  label = 55;
                  break L58;
                }
              }
            else {
              $142 = $139 & 1;
              $143 = $142 & 255;
              if ((($7 + -8) & 255) >= 3) HEAP8[$6 >> 0] = $143;
              HEAP8[($bd + 496 + ($1 << 4) + 10) >> 0] = $143;
              HEAP8[($bd + 496 + ($1 << 4) + 9) >> 0] = $143;
              HEAP32[($bd + 496 + ($1 << 4) + 12) >> 2] = $142;
              HEAP32[$2 >> 2] = $position;
              $newProp$0 = $143;
              label = 55;
            }
          while (0);
          if ((label | 0) == 55)
            switch (($newProp$0 << 24) >> 24) {
              case 0:
              case 1:
              case 13: {
                $newProp$07 = $newProp$0;
                break;
              }
              default: {
                $$0 = 1;
                break L56;
              }
            }
          $167 = 1 << ((($newProp$07 << 24) >> 24 != 0) & 1);
          $169 = HEAP16[($bd + 496 + ($1 << 4) + 4) >> 1] | 0;
          $171 = HEAP16[($bd + 496 + ($1 << 4) + 6) >> 1] | 0;
          $172 = $171 & 65535;
          if (($169 & 65535) < ($171 & 65535)) {
            $176 = HEAP32[($bd + 484) >> 2] | 0;
            $i1$024 = $169 & 65535;
            do {
              if (
                (HEAP32[($176 + (($i1$024 * 24) | 0)) >> 2] | 0) <
                ($position | 0)
              ) {
                $180 = ($176 + (($i1$024 * 24) | 0) + 12) | 0;
                HEAP16[$180 >> 1] = HEAPU16[$180 >> 1] | $167;
              }
              $i1$024 = ($i1$024 + 1) | 0;
            } while (($i1$024 | 0) < ($172 | 0));
            $$0 = 1;
          } else $$0 = 1;
        }
      while (0);
      return $$0 | 0;
    }
    function _processPropertySeq($pBiDi, $pLevState, $_prop, $start, $limit) {
      $pBiDi = $pBiDi | 0;
      $pLevState = $pLevState | 0;
      $_prop = $_prop | 0;
      $start = $start | 0;
      $limit = $limit | 0;
      var $$0 = 0,
        $$1 = 0,
        $$in = 0,
        $$pre = 0,
        $$pre11 = 0,
        $0 = 0,
        $11 = 0,
        $112 = 0,
        $114 = 0,
        $12 = 0,
        $121 = 0,
        $122 = 0,
        $123 = 0,
        $124 = 0,
        $125 = 0,
        $127 = 0,
        $136 = 0,
        $137 = 0,
        $138 = 0,
        $139 = 0,
        $140 = 0,
        $142 = 0,
        $146 = 0,
        $15 = 0,
        $154 = 0,
        $158 = 0,
        $166 = 0,
        $167 = 0,
        $168 = 0,
        $17 = 0,
        $170 = 0,
        $172 = 0,
        $175 = 0,
        $185 = 0,
        $191 = 0,
        $2 = 0,
        $3 = 0,
        $37 = 0,
        $38 = 0,
        $4 = 0,
        $43 = 0,
        $44 = 0,
        $45 = 0,
        $5 = 0,
        $54 = 0,
        $60 = 0,
        $63 = 0,
        $69 = 0,
        $8 = 0,
        $91 = 0,
        $92 = 0,
        $97 = 0,
        $k$019 = 0,
        $k$020 = 0,
        $k$1$in = 0,
        $k$224 = 0,
        $k$334 = 0,
        $k$334$in = 0,
        $k$428 = 0,
        $k$6 = 0,
        $k$738$in = 0,
        label = 0,
        $k$1$in$looptemp = 0,
        $k$428$looptemp = 0;
      $0 = HEAP32[$pLevState >> 2] | 0;
      $2 = HEAP32[($pLevState + 4) >> 2] | 0;
      $3 = ($pBiDi + 80) | 0;
      $4 = HEAP32[$3 >> 2] | 0;
      $5 = ($pLevState + 20) | 0;
      $8 = HEAP32[$5 >> 2] & 255;
      $11 = HEAPU8[(($_prop & 255) + ($0 + ($8 << 3))) >> 0] | 0;
      $12 = $11 & 15;
      HEAP32[$5 >> 2] = $12;
      $15 = HEAP8[($2 + ($11 >>> 4)) >> 0] | 0;
      $17 = HEAP8[($0 + ($12 << 3) + 7) >> 0] | 0;
      L1: do
        if (!(($15 << 24) >> 24)) $$1 = $start;
        else
          do
            switch (($15 & 255) | 0) {
              case 1: {
                HEAP32[($pLevState + 8) >> 2] = $start;
                $$1 = $start;
                break L1;
                break;
              }
              case 2: {
                $$1 = HEAP32[($pLevState + 8) >> 2] | 0;
                break L1;
                break;
              }
              case 3: {
                _setLevelsOutsideIsolates(
                  HEAP32[($pBiDi + 76) >> 2] | 0,
                  $4,
                  HEAP32[($pLevState + 8) >> 2] | 0,
                  $start,
                  ((HEAPU8[($pLevState + 28) >> 0] | 0) + 1) & 255,
                );
                $$1 = $start;
                break L1;
                break;
              }
              case 4: {
                _setLevelsOutsideIsolates(
                  HEAP32[($pBiDi + 76) >> 2] | 0,
                  $4,
                  HEAP32[($pLevState + 8) >> 2] | 0,
                  $start,
                  ((HEAPU8[($pLevState + 28) >> 0] | 0) + 2) & 255,
                );
                $$1 = $start;
                break L1;
                break;
              }
              case 5: {
                $37 = ($pLevState + 12) | 0;
                $38 = HEAP32[$37 >> 2] | 0;
                if (($38 | 0) > -1) _addPoint($pBiDi, $38, 1);
                HEAP32[$37 >> 2] = -1;
                if (HEAP32[($pBiDi + 332) >> 2] | 0) {
                  $43 = ($pBiDi + 336) | 0;
                  $44 = HEAP32[$43 >> 2] | 0;
                  $45 = ($pBiDi + 340) | 0;
                  if (($44 | 0) > (HEAP32[$45 >> 2] | 0)) {
                    $60 = ($pLevState + 16) | 0;
                    $k$019 = ((HEAP32[$60 >> 2] | 0) + 1) | 0;
                    if (($k$019 | 0) < ($start | 0)) {
                      $k$020 = $k$019;
                      do {
                        $63 = ($4 + $k$020) | 0;
                        HEAP8[$63 >> 0] = ((HEAPU8[$63 >> 0] | 0) + 254) & 254;
                        $k$020 = ($k$020 + 1) | 0;
                      } while (($k$020 | 0) != ($start | 0));
                      $69 = HEAP32[$43 >> 2] | 0;
                    } else $69 = $44;
                    HEAP32[$45 >> 2] = $69;
                    HEAP32[$60 >> 2] = -1;
                    if (($_prop << 24) >> 24 != 5) {
                      $$1 = $start;
                      break L1;
                    }
                    _addPoint($pBiDi, $start, 1);
                    HEAP32[$45 >> 2] = HEAP32[$43 >> 2];
                    $$1 = $start;
                    break L1;
                  }
                }
                HEAP32[($pLevState + 16) >> 2] = -1;
                if (!(HEAP8[($0 + ($8 << 3) + 7) >> 0] & 1)) $$0 = $start;
                else {
                  $54 = HEAP32[($pLevState + 8) >> 2] | 0;
                  $$0 = ($54 | 0) > 0 ? $54 : $start;
                }
                if (($_prop << 24) >> 24 != 5) {
                  $$1 = $$0;
                  break L1;
                }
                _addPoint($pBiDi, $start, 1);
                HEAP32[($pBiDi + 340) >> 2] = HEAP32[($pBiDi + 336) >> 2];
                $$1 = $$0;
                break L1;
                break;
              }
              case 6: {
                if ((HEAP32[($pBiDi + 332) >> 2] | 0) > 0)
                  HEAP32[($pBiDi + 336) >> 2] = HEAP32[($pBiDi + 340) >> 2];
                HEAP32[($pLevState + 8) >> 2] = -1;
                HEAP32[($pLevState + 12) >> 2] = -1;
                HEAP32[($pLevState + 16) >> 2] = $limit + -1;
                $$1 = $start;
                break L1;
                break;
              }
              case 7: {
                if (($_prop << 24) >> 24 == 3)
                  if (
                    (HEAP8[((HEAP32[($pBiDi + 76) >> 2] | 0) + $start) >> 0] |
                      0) ==
                    5
                  )
                    if ((HEAP32[($pBiDi + 88) >> 2] | 0) != 6) {
                      $91 = ($pLevState + 12) | 0;
                      $92 = HEAP32[$91 >> 2] | 0;
                      if (($92 | 0) == -1) {
                        HEAP32[($pLevState + 16) >> 2] = $limit + -1;
                        $$1 = $start;
                        break L1;
                      }
                      if (($92 | 0) > -1) {
                        _addPoint($pBiDi, $92, 1);
                        HEAP32[$91 >> 2] = -2;
                      }
                      _addPoint($pBiDi, $start, 1);
                      $$1 = $start;
                      break L1;
                    }
                $97 = ($pLevState + 12) | 0;
                if ((HEAP32[$97 >> 2] | 0) != -1) {
                  $$1 = $start;
                  break L1;
                }
                HEAP32[$97 >> 2] = $start;
                $$1 = $start;
                break L1;
                break;
              }
              case 8: {
                HEAP32[($pLevState + 16) >> 2] = $limit + -1;
                HEAP32[($pLevState + 8) >> 2] = -1;
                $$1 = $start;
                break L1;
                break;
              }
              case 9: {
                $k$1$in = $start;
                while (1) {
                  $k$1$in$looptemp = $k$1$in;
                  $k$1$in = ($k$1$in + -1) | 0;
                  if (($k$1$in$looptemp | 0) <= 0) break;
                  if (HEAP8[($4 + $k$1$in) >> 0] & 1) {
                    label = 36;
                    break;
                  }
                }
                if ((label | 0) == 36) {
                  _addPoint($pBiDi, $k$1$in, 4);
                  HEAP32[($pBiDi + 340) >> 2] = HEAP32[($pBiDi + 336) >> 2];
                }
                HEAP32[($pLevState + 8) >> 2] = $start;
                $$1 = $start;
                break L1;
                break;
              }
              case 10: {
                _addPoint($pBiDi, $start, 1);
                _addPoint($pBiDi, $start, 2);
                $$1 = $start;
                break L1;
                break;
              }
              case 11: {
                $112 = ($pBiDi + 340) | 0;
                $114 = ($pBiDi + 336) | 0;
                HEAP32[$114 >> 2] = HEAP32[$112 >> 2];
                if (($_prop << 24) >> 24 != 5) {
                  $$1 = $start;
                  break L1;
                }
                _addPoint($pBiDi, $start, 4);
                HEAP32[$112 >> 2] = HEAP32[$114 >> 2];
                $$1 = $start;
                break L1;
                break;
              }
              case 12: {
                $121 = ((HEAPU8[($pLevState + 28) >> 0] | 0) + ($17 & 255)) | 0;
                $122 = $121 & 255;
                $123 = ($pLevState + 8) | 0;
                $124 = HEAP32[$123 >> 2] | 0;
                $125 = $121 & 255;
                if (($124 | 0) < ($start | 0)) {
                  $k$224 = $124;
                  do {
                    $127 = ($4 + $k$224) | 0;
                    if ((HEAPU8[$127 >> 0] | 0) >>> 0 < $125 >>> 0)
                      HEAP8[$127 >> 0] = $122;
                    $k$224 = ($k$224 + 1) | 0;
                  } while (($k$224 | 0) != ($start | 0));
                }
                HEAP32[($pBiDi + 340) >> 2] = HEAP32[($pBiDi + 336) >> 2];
                HEAP32[$123 >> 2] = $start;
                $$1 = $start;
                break L1;
                break;
              }
              case 13: {
                $136 = HEAP8[($pLevState + 28) >> 0] | 0;
                $137 = ($pLevState + 8) | 0;
                $138 = $136 & 255;
                $139 = ($138 + 3) | 0;
                $140 = ($138 + 2) | 0;
                $142 = ($138 + 1) & 255;
                if ((HEAP32[$137 >> 2] | 0) < ($start | 0)) $k$334$in = $start;
                else {
                  $$1 = $start;
                  break L1;
                }
                while (1) {
                  $k$334 = ($k$334$in + -1) | 0;
                  $146 = HEAP8[($4 + $k$334) >> 0] | 0;
                  if ((($146 & 255) | 0) == ($139 | 0)) {
                    $k$428 = $k$334;
                    do {
                      $k$428$looptemp = $k$428;
                      $k$428 = ($k$428 + -1) | 0;
                      HEAP8[($4 + $k$428$looptemp) >> 0] = $142;
                      $$pre = HEAP8[($4 + $k$428) >> 0] | 0;
                    } while ((($$pre & 255) | 0) == ($139 | 0));
                    if (($$pre << 24) >> 24 == ($136 << 24) >> 24) {
                      $$in = $k$428;
                      while (1) {
                        $154 = ($$in + -1) | 0;
                        $$pre11 = HEAP8[($4 + $154) >> 0] | 0;
                        if (($$pre11 << 24) >> 24 == ($136 << 24) >> 24)
                          $$in = $154;
                        else {
                          $158 = $$pre11;
                          $k$6 = $154;
                          break;
                        }
                      }
                    } else {
                      $158 = $$pre;
                      $k$6 = $k$428;
                    }
                  } else {
                    $158 = $146;
                    $k$6 = $k$334;
                  }
                  HEAP8[($4 + $k$6) >> 0] =
                    (($158 & 255) | 0) == ($140 | 0) ? $136 : $142;
                  if (($k$6 | 0) > (HEAP32[$137 >> 2] | 0)) $k$334$in = $k$6;
                  else {
                    $$1 = $start;
                    break;
                  }
                }
                break;
              }
              case 14: {
                $166 = ($pLevState + 8) | 0;
                $167 = ((HEAPU8[($pLevState + 28) >> 0] | 0) + 1) & 255;
                $168 = HEAP32[$166 >> 2] | 0;
                if (($168 | 0) < ($start | 0)) {
                  $191 = $168;
                  $k$738$in = $start;
                } else {
                  $$1 = $start;
                  break L1;
                }
                while (1) {
                  $k$738$in = ($k$738$in + -1) | 0;
                  $170 = ($4 + $k$738$in) | 0;
                  $172 = HEAPU8[$170 >> 0] | 0;
                  if ($172 >>> 0 > $167 >>> 0) {
                    HEAP8[$170 >> 0] = $172 + 254;
                    $175 = HEAP32[$166 >> 2] | 0;
                  } else $175 = $191;
                  if (($k$738$in | 0) <= ($175 | 0)) {
                    $$1 = $start;
                    break;
                  } else $191 = $175;
                }
                break;
              }
              default: {
                $$1 = $start;
                break L1;
              }
            }
          while (0);
      while (0);
      do
        if ((($17 << 24) >> 24 != 0) | (($$1 | 0) < ($start | 0))) {
          $185 = ((HEAPU8[($pLevState + 28) >> 0] | 0) + ($17 & 255)) & 255;
          if (($$1 | 0) < (HEAP32[($pLevState + 24) >> 2] | 0)) {
            _setLevelsOutsideIsolates(
              HEAP32[($pBiDi + 76) >> 2] | 0,
              HEAP32[$3 >> 2] | 0,
              $$1,
              $limit,
              $185,
            );
            break;
          }
          if (($$1 | 0) < ($limit | 0))
            _memset(($4 + $$1) | 0, $185 | 0, ($limit - $$1) | 0) | 0;
        }
      while (0);
      return;
    }
    function _ubidi_getVisualMap_58($pBiDi, $indexMap, $pErrorCode) {
      $pBiDi = $pBiDi | 0;
      $indexMap = $indexMap | 0;
      $pErrorCode = $pErrorCode | 0;
      var $10 = 0,
        $102 = 0,
        $103 = 0,
        $104 = 0,
        $106 = 0,
        $108 = 0,
        $11 = 0,
        $111 = 0,
        $114 = 0,
        $15 = 0,
        $17 = 0,
        $19 = 0,
        $27 = 0,
        $39 = 0,
        $42 = 0,
        $51 = 0,
        $54 = 0,
        $57 = 0,
        $62 = 0,
        $65 = 0,
        $67 = 0,
        $7 = 0,
        $78 = 0,
        $8 = 0,
        $84 = 0,
        $85 = 0,
        $89 = 0,
        $9 = 0,
        $92 = 0,
        $i$036 = 0,
        $i$133$in = 0,
        $i3$050 = 0,
        $j$028$in = 0,
        $j4$047 = 0,
        $j4$142 = 0,
        $k$0$be = 0,
        $k$031 = 0,
        $k$1 = 0,
        $k$2$lcssa = 0,
        $k$227 = 0,
        $k5$051 = 0,
        $k5$148 = 0,
        $k5$243 = 0,
        $k5$3 = 0,
        $k5$4 = 0,
        $logicalStart$0 = 0,
        $logicalStart$1 = 0,
        $markFound$037 = 0,
        $markFound$3$be = 0,
        $markFound$332 = 0,
        $markFound$4 = 0,
        $pi$055 = 0,
        $pi$1 = 0,
        $pi$2 = 0,
        $runs$057 = 0,
        $smax = 0,
        $smax20$pn = 0,
        $visualStart$056 = 0,
        $visualStart$1 = 0,
        $visualStart$2 = 0,
        $visualStart$452 = 0,
        $visualStart$452$looptemp = 0,
        $i$133$in$looptemp = 0;
      L1: do
        if ($pErrorCode)
          if ((HEAP32[$pErrorCode >> 2] | 0) <= 0) {
            if (!$indexMap) {
              HEAP32[$pErrorCode >> 2] = 1;
              break;
            }
            _ubidi_countRuns_58($pBiDi, $pErrorCode) | 0;
            if ((HEAP32[$pErrorCode >> 2] | 0) < 1) {
              $7 = HEAP32[($pBiDi + 228) >> 2] | 0;
              $8 = ($pBiDi + 224) | 0;
              $9 = HEAP32[$8 >> 2] | 0;
              $10 = ($7 + (($9 * 12) | 0)) | 0;
              $11 = ($pBiDi + 20) | 0;
              if ((HEAP32[$11 >> 2] | 0) >= 1) {
                if (($9 | 0) > 0) {
                  $pi$055 = $indexMap;
                  $runs$057 = $7;
                  $visualStart$056 = 0;
                  while (1) {
                    $15 = HEAP32[$runs$057 >> 2] | 0;
                    $17 = HEAP32[($runs$057 + 4) >> 2] | 0;
                    if (($15 | 0) > -1) {
                      $19 = ($visualStart$056 + 1) | 0;
                      $logicalStart$0 = $15;
                      $pi$1 = $pi$055;
                      $visualStart$1 = $visualStart$056;
                      while (1) {
                        HEAP32[$pi$1 >> 2] = $logicalStart$0;
                        $visualStart$1 = ($visualStart$1 + 1) | 0;
                        if (($visualStart$1 | 0) >= ($17 | 0)) break;
                        else {
                          $logicalStart$0 = ($logicalStart$0 + 1) | 0;
                          $pi$1 = ($pi$1 + 4) | 0;
                        }
                      }
                      $smax20$pn = ($17 | 0) > ($19 | 0) ? $17 : $19;
                    } else {
                      $27 = ($visualStart$056 + 1) | 0;
                      $logicalStart$1 =
                        ($17 - $visualStart$056 + ($15 & 2147483647)) | 0;
                      $pi$2 = $pi$055;
                      $visualStart$2 = $visualStart$056;
                      while (1) {
                        $logicalStart$1 = ($logicalStart$1 + -1) | 0;
                        HEAP32[$pi$2 >> 2] = $logicalStart$1;
                        $visualStart$2 = ($visualStart$2 + 1) | 0;
                        if (($visualStart$2 | 0) >= ($17 | 0)) break;
                        else $pi$2 = ($pi$2 + 4) | 0;
                      }
                      $smax20$pn = ($17 | 0) > ($27 | 0) ? $17 : $27;
                    }
                    $runs$057 = ($runs$057 + 12) | 0;
                    if ($runs$057 >>> 0 >= $10 >>> 0) break;
                    else {
                      $pi$055 =
                        ($pi$055 + (($smax20$pn - $visualStart$056) << 2)) | 0;
                      $visualStart$056 = $smax20$pn;
                    }
                  }
                }
                if ((HEAP32[($pBiDi + 336) >> 2] | 0) <= 0) {
                  if ((HEAP32[($pBiDi + 352) >> 2] | 0) <= 0) break;
                  $84 = HEAP32[$8 >> 2] | 0;
                  $85 = ($pBiDi + 8) | 0;
                  if (($84 | 0) > 0) {
                    $i3$050 = 0;
                    $k5$051 = 0;
                    $visualStart$452 = 0;
                  } else break;
                  while (1) {
                    $visualStart$452$looptemp = $visualStart$452;
                    $visualStart$452 =
                      HEAP32[($7 + (($i3$050 * 12) | 0) + 4) >> 2] | 0;
                    $89 = ($visualStart$452 - $visualStart$452$looptemp) | 0;
                    $92 =
                      (HEAP32[($7 + (($i3$050 * 12) | 0) + 8) >> 2] | 0) == 0;
                    do
                      if (
                        (($k5$051 | 0) == ($visualStart$452$looptemp | 0)) &
                        $92
                      )
                        $k5$4 = $visualStart$452;
                      else {
                        if ($92) {
                          $smax =
                            ($visualStart$452 | 0) <
                            ($visualStart$452$looptemp | 0)
                              ? $visualStart$452$looptemp
                              : $visualStart$452;
                          if (
                            ($visualStart$452 | 0) >
                            ($visualStart$452$looptemp | 0)
                          ) {
                            $j4$047 = $visualStart$452$looptemp;
                            $k5$148 = $k5$051;
                            while (1) {
                              HEAP32[($indexMap + ($k5$148 << 2)) >> 2] =
                                HEAP32[($indexMap + ($j4$047 << 2)) >> 2];
                              $j4$047 = ($j4$047 + 1) | 0;
                              if (($j4$047 | 0) == ($visualStart$452 | 0))
                                break;
                              else $k5$148 = ($k5$148 + 1) | 0;
                            }
                          }
                          $k5$4 =
                            ($k5$051 - $visualStart$452$looptemp + $smax) | 0;
                          break;
                        }
                        $102 = HEAP32[($7 + (($i3$050 * 12) | 0)) >> 2] | 0;
                        $103 = $102 & 2147483647;
                        $104 = ($102 | 0) > -1;
                        $106 = ($89 + -1 + $103) | 0;
                        if (($89 | 0) > 0) {
                          $108 = HEAP32[$85 >> 2] | 0;
                          $j4$142 = 0;
                          $k5$243 = $k5$051;
                          while (1) {
                            $111 = $104
                              ? ($j4$142 + $103) | 0
                              : ($106 - $j4$142) | 0;
                            $114 = HEAPU16[($108 + ($111 << 1)) >> 1] | 0;
                            L40: do
                              if ((($114 & 65532) | 0) == 8204) $k5$3 = $k5$243;
                              else {
                                switch ($114 | 0) {
                                  case 8234:
                                  case 8235:
                                  case 8236:
                                  case 8237:
                                  case 8238:
                                  case 8294:
                                  case 8295:
                                  case 8296:
                                  case 8297: {
                                    $k5$3 = $k5$243;
                                    break L40;
                                    break;
                                  }
                                  default: {
                                  }
                                }
                                HEAP32[($indexMap + ($k5$243 << 2)) >> 2] =
                                  $111;
                                $k5$3 = ($k5$243 + 1) | 0;
                              }
                            while (0);
                            $j4$142 = ($j4$142 + 1) | 0;
                            if (($j4$142 | 0) == ($89 | 0)) {
                              $k5$4 = $k5$3;
                              break;
                            } else $k5$243 = $k5$3;
                          }
                        } else $k5$4 = $k5$051;
                      }
                    while (0);
                    $i3$050 = ($i3$050 + 1) | 0;
                    if (($i3$050 | 0) == ($84 | 0)) break L1;
                    else $k5$051 = $k5$4;
                  }
                }
                $39 = HEAP32[$8 >> 2] | 0;
                if (($39 | 0) > 0) {
                  $i$036 = 0;
                  $markFound$037 = 0;
                  do {
                    $42 = HEAP32[($7 + (($i$036 * 12) | 0) + 8) >> 2] | 0;
                    $markFound$037 =
                      ((((($42 & 5) | 0) != 0) & 1) +
                        $markFound$037 +
                        (((($42 & 10) | 0) != 0) & 1)) |
                      0;
                    $i$036 = ($i$036 + 1) | 0;
                  } while (($i$036 | 0) != ($39 | 0));
                  if (($markFound$037 | 0) > 0) {
                    $i$133$in = $39;
                    $k$031 = HEAP32[$11 >> 2] | 0;
                    $markFound$332 = $markFound$037;
                    while (1) {
                      $i$133$in$looptemp = $i$133$in;
                      $i$133$in = ($i$133$in + -1) | 0;
                      $51 = HEAP32[($7 + (($i$133$in * 12) | 0) + 8) >> 2] | 0;
                      if (!($51 & 10)) {
                        $k$1 = $k$031;
                        $markFound$4 = $markFound$332;
                      } else {
                        $54 = ($k$031 + -1) | 0;
                        HEAP32[($indexMap + ($54 << 2)) >> 2] = -1;
                        $k$1 = $54;
                        $markFound$4 = ($markFound$332 + -1) | 0;
                      }
                      $57 = ($i$133$in$looptemp | 0) > 1;
                      if ($57)
                        $65 =
                          HEAP32[
                            ($7 +
                              (((($i$133$in$looptemp + -2) | 0) * 12) | 0) +
                              4) >>
                              2
                          ] | 0;
                      else $65 = 0;
                      $62 = HEAP32[($7 + (($i$133$in * 12) | 0) + 4) >> 2] | 0;
                      if ((($markFound$4 | 0) > 0) & (($62 | 0) > ($65 | 0))) {
                        $67 = ($65 + $k$1) | 0;
                        $j$028$in = $62;
                        $k$227 = $k$1;
                        do {
                          $j$028$in = ($j$028$in + -1) | 0;
                          $k$227 = ($k$227 + -1) | 0;
                          HEAP32[($indexMap + ($k$227 << 2)) >> 2] =
                            HEAP32[($indexMap + ($j$028$in << 2)) >> 2];
                        } while (($j$028$in | 0) > ($65 | 0));
                        $k$2$lcssa = ($67 - $62) | 0;
                      } else $k$2$lcssa = $k$1;
                      if (!($51 & 5)) {
                        $k$0$be = $k$2$lcssa;
                        $markFound$3$be = $markFound$4;
                      } else {
                        $78 = ($k$2$lcssa + -1) | 0;
                        HEAP32[($indexMap + ($78 << 2)) >> 2] = -1;
                        $k$0$be = $78;
                        $markFound$3$be = ($markFound$4 + -1) | 0;
                      }
                      if (!($57 & (($markFound$3$be | 0) > 0))) break;
                      else {
                        $k$031 = $k$0$be;
                        $markFound$332 = $markFound$3$be;
                      }
                    }
                  }
                }
              }
            }
          }
      while (0);
      return;
    }
    function _doWriteReverse(
      $src,
      $srcLength,
      $dest,
      $destSize,
      $options,
      $pErrorCode,
    ) {
      $src = $src | 0;
      $srcLength = $srcLength | 0;
      $dest = $dest | 0;
      $destSize = $destSize | 0;
      $options = $options | 0;
      $pErrorCode = $pErrorCode | 0;
      var $$0 = 0,
        $$012 = 0,
        $$013 = 0,
        $$015 = 0,
        $$1 = 0,
        $$114 = 0,
        $$116 = 0,
        $$2 = 0,
        $$217 = 0,
        $$3 = 0,
        $$318 = 0,
        $$4 = 0,
        $$419 = 0,
        $$5 = 0,
        $$520$ph = 0,
        $$52056 = 0,
        $$6 = 0,
        $$621 = 0,
        $$7 = 0,
        $$8 = 0,
        $$9 = 0,
        $$lcssa41 = 0,
        $0 = 0,
        $101 = 0,
        $105 = 0,
        $108 = 0,
        $116 = 0,
        $129 = 0,
        $14 = 0,
        $15 = 0,
        $24 = 0,
        $27 = 0,
        $3 = 0,
        $31 = 0,
        $34 = 0,
        $46 = 0,
        $47 = 0,
        $55 = 0,
        $58 = 0,
        $73 = 0,
        $75 = 0,
        $76 = 0,
        $79 = 0,
        $83 = 0,
        $86 = 0,
        $9 = 0,
        $98 = 0,
        $c$0 = 0,
        $c$1 = 0,
        $c$2 = 0,
        $c$3 = 0,
        $c$4 = 0,
        $i$0 = 0,
        $i$2 = 0,
        $j$0 = 0,
        $j$1 = 0,
        $j$2$ph = 0,
        $j$255 = 0,
        $k$0 = 0,
        $length$0 = 0,
        label = 0;
      $0 = $options & 65535;
      L1: do
        switch (($0 & 11) | 0) {
          case 0: {
            if (($destSize | 0) < ($srcLength | 0)) {
              HEAP32[$pErrorCode >> 2] = 15;
              $$0 = $srcLength;
              break L1;
            } else {
              $$013 = $srcLength;
              $$015 = $dest;
            }
            while (1) {
              $3 = ($$013 + -1) | 0;
              if (
                ($$013 | 0) > 1
                  ? ((HEAP16[($src + ($3 << 1)) >> 1] & -1024) << 16) >> 16 ==
                    -9216
                  : 0
              ) {
                $9 = ($$013 + -2) | 0;
                $$114 =
                  ((HEAP16[($src + ($9 << 1)) >> 1] & -1024) << 16) >> 16 ==
                  -10240
                    ? $9
                    : $3;
              } else $$114 = $3;
              $14 = ($$114 + 1) | 0;
              $15 = ($$013 | 0) > ($14 | 0);
              $$116 = $$015;
              $j$0 = $$114;
              while (1) {
                HEAP16[$$116 >> 1] = HEAP16[($src + ($j$0 << 1)) >> 1] | 0;
                $j$0 = ($j$0 + 1) | 0;
                if (($j$0 | 0) >= ($$013 | 0)) break;
                else $$116 = ($$116 + 2) | 0;
              }
              $$015 = ($$015 + ((($15 ? $$013 : $14) - $$114) << 1)) | 0;
              if (($$114 | 0) <= 0) {
                $$0 = $srcLength;
                break;
              } else $$013 = $$114;
            }
            break;
          }
          case 1: {
            if (($destSize | 0) < ($srcLength | 0)) {
              HEAP32[$pErrorCode >> 2] = 15;
              $$0 = $srcLength;
              break L1;
            } else {
              $$2 = $srcLength;
              $$217 = $dest;
            }
            while (1) {
              $$3 = $$2;
              while (1) {
                $24 = ($$3 + -1) | 0;
                $27 = HEAPU16[($src + ($24 << 1)) >> 1] | 0;
                if ((($$3 | 0) > 1) & ((($27 & 64512) | 0) == 56320)) {
                  $31 = ($$3 + -2) | 0;
                  $34 = HEAPU16[($src + ($31 << 1)) >> 1] | 0;
                  if ((($34 & 64512) | 0) == 55296) {
                    $$4 = $31;
                    $c$0 = ($27 + -56613888 + ($34 << 10)) | 0;
                  } else {
                    $$4 = $24;
                    $c$0 = $27;
                  }
                } else {
                  $$4 = $24;
                  $c$0 = $27;
                }
                if (($$4 | 0) <= 0) {
                  $$lcssa41 = 0;
                  break;
                }
                if (
                  !((1 << (((_u_charType_58($c$0) | 0) << 24) >> 24)) & 448)
                ) {
                  $$lcssa41 = 1;
                  break;
                } else $$3 = $$4;
              }
              $46 = ($$4 + 1) | 0;
              $47 = ($$2 | 0) > ($46 | 0);
              $$318 = $$217;
              $j$1 = $$4;
              while (1) {
                HEAP16[$$318 >> 1] = HEAP16[($src + ($j$1 << 1)) >> 1] | 0;
                $j$1 = ($j$1 + 1) | 0;
                if (($j$1 | 0) >= ($$2 | 0)) break;
                else $$318 = ($$318 + 2) | 0;
              }
              $$217 = ($$217 + ((($47 ? $$2 : $46) - $$4) << 1)) | 0;
              if (!$$lcssa41) {
                $$0 = $srcLength;
                break;
              } else $$2 = $$4;
            }
            break;
          }
          default: {
            $55 = (($0 & 8) | 0) != 0;
            if ($55) {
              $$012 = $src;
              $i$0 = 0;
              $length$0 = $srcLength;
              while (1) {
                $58 = HEAPU16[$$012 >> 1] | 0;
                $i$0 =
                  ((((((($58 + -8294) | 0) >>> 0 < 4) |
                    (((($58 & 65532) | 0) == 8204) |
                      ((($58 + -8234) | 0) >>> 0 < 5))) &
                    1) ^
                    1) +
                    $i$0) |
                  0;
                if (($length$0 | 0) <= 1) break;
                else {
                  $$012 = ($$012 + 2) | 0;
                  $length$0 = ($length$0 + -1) | 0;
                }
              }
              $$1 =
                ($src +
                  ((($srcLength | 0) < 1 ? (1 - $srcLength) | 0 : 0) << 1)) |
                0;
              $i$2 = $i$0;
            } else {
              $$1 = $src;
              $i$2 = $srcLength;
            }
            if (($i$2 | 0) > ($destSize | 0)) {
              HEAP32[$pErrorCode >> 2] = 15;
              $$0 = $i$2;
              break L1;
            }
            $73 = (($0 & 1) | 0) != 0;
            $75 = (($0 & 2) | 0) == 0;
            $$419 = $dest;
            $$5 = $srcLength;
            while (1) {
              $76 = ($$5 + -1) | 0;
              $79 = HEAPU16[($$1 + ($76 << 1)) >> 1] | 0;
              if ((($$5 | 0) > 1) & ((($79 & 64512) | 0) == 56320)) {
                $83 = ($$5 + -2) | 0;
                $86 = HEAPU16[($$1 + ($83 << 1)) >> 1] | 0;
                if ((($86 & 64512) | 0) == 55296) {
                  $$6 = $83;
                  $c$1 = ($79 + -56613888 + ($86 << 10)) | 0;
                } else {
                  $$6 = $76;
                  $c$1 = $79;
                }
              } else {
                $$6 = $76;
                $c$1 = $79;
              }
              L17: do
                if ($73 & (($$6 | 0) > 0)) {
                  $$8 = $$6;
                  $c$3 = $c$1;
                  while (1) {
                    if (
                      !((1 << (((_u_charType_58($c$3) | 0) << 24) >> 24)) & 448)
                    ) {
                      $$9 = $$8;
                      $c$4 = $c$3;
                      break L17;
                    }
                    $98 = ($$8 + -1) | 0;
                    $101 = HEAPU16[($$1 + ($98 << 1)) >> 1] | 0;
                    if ((($$8 | 0) > 1) & ((($101 & 64512) | 0) == 56320)) {
                      $105 = ($$8 + -2) | 0;
                      $108 = HEAPU16[($$1 + ($105 << 1)) >> 1] | 0;
                      if ((($108 & 64512) | 0) == 55296) {
                        $$7 = $105;
                        $c$2 = ($101 + -56613888 + ($108 << 10)) | 0;
                      } else {
                        $$7 = $98;
                        $c$2 = $101;
                      }
                    } else {
                      $$7 = $98;
                      $c$2 = $101;
                    }
                    if (($$7 | 0) > 0) {
                      $$8 = $$7;
                      $c$3 = $c$2;
                    } else {
                      $$9 = $$7;
                      $c$4 = $c$2;
                      break;
                    }
                  }
                } else {
                  $$9 = $$6;
                  $c$4 = $c$1;
                }
              while (0);
              if ($55)
                if ((($c$4 & -4) | 0) == 8204) $$621 = $$419;
                else
                  switch ($c$4 | 0) {
                    case 8234:
                    case 8235:
                    case 8236:
                    case 8237:
                    case 8238:
                    case 8294:
                    case 8295:
                    case 8296:
                    case 8297: {
                      $$621 = $$419;
                      break;
                    }
                    default:
                      label = 38;
                  }
              else label = 38;
              if ((label | 0) == 38) {
                label = 0;
                if ($75) {
                  $$520$ph = $$419;
                  $j$2$ph = $$9;
                } else {
                  $116 = _ubidi_getMirror_58($c$4) | 0;
                  if ($116 >>> 0 < 65536) {
                    HEAP16[$$419 >> 1] = $116;
                    $k$0 = 1;
                  } else {
                    HEAP16[$$419 >> 1] = ($116 >>> 10) + 55232;
                    HEAP16[($$419 + 2) >> 1] = ($116 & 1023) | 56320;
                    $k$0 = 2;
                  }
                  $$520$ph = ($$419 + ($k$0 << 1)) | 0;
                  $j$2$ph = ($k$0 + $$9) | 0;
                }
                $129 =
                  ((($j$2$ph | 0) > ($$5 | 0) ? $j$2$ph : $$5) - $j$2$ph) | 0;
                if (($j$2$ph | 0) < ($$5 | 0)) {
                  $$52056 = $$520$ph;
                  $j$255 = $j$2$ph;
                  while (1) {
                    HEAP16[$$52056 >> 1] =
                      HEAP16[($$1 + ($j$255 << 1)) >> 1] | 0;
                    $j$255 = ($j$255 + 1) | 0;
                    if (($j$255 | 0) == ($$5 | 0)) break;
                    else $$52056 = ($$52056 + 2) | 0;
                  }
                }
                $$621 = ($$520$ph + ($129 << 1)) | 0;
              }
              if (($$9 | 0) > 0) {
                $$419 = $$621;
                $$5 = $$9;
              } else {
                $$0 = $i$2;
                break;
              }
            }
          }
        }
      while (0);
      return $$0 | 0;
    }
    function _doWriteForward(
      $src,
      $srcLength,
      $dest,
      $destSize,
      $options,
      $pErrorCode,
    ) {
      $src = $src | 0;
      $srcLength = $srcLength | 0;
      $dest = $dest | 0;
      $destSize = $destSize | 0;
      $options = $options | 0;
      $pErrorCode = $pErrorCode | 0;
      var $$0 = 0,
        $$01 = 0,
        $$02 = 0,
        $$06 = 0,
        $$1 = 0,
        $$1372 = 0,
        $$17 = 0,
        $$24 = 0,
        $$273 = 0,
        $$28 = 0,
        $$3 = 0,
        $$3569 = 0,
        $$470 = 0,
        $$sink$in = 0,
        $12 = 0,
        $18 = 0,
        $25 = 0,
        $39 = 0,
        $40 = 0,
        $43 = 0,
        $49 = 0,
        $64 = 0,
        $70 = 0,
        $80 = 0,
        $85 = 0,
        $9 = 0,
        $96 = 0,
        $c$0 = 0,
        $c5$0 = 0,
        $i$0 = 0,
        $i$1 = 0,
        $i3$0 = 0,
        $j$0 = 0,
        $j$1 = 0,
        $j4$0 = 0,
        $j4$1 = 0,
        $length$0 = 0,
        $remaining$0 = 0,
        $remaining$1$ = 0,
        $remaining$1$lcssa = 0,
        $remaining$174 = 0,
        $remaining$2 = 0,
        $remaining2$0 = 0,
        $remaining2$1$lcssa = 0,
        $remaining2$171 = 0,
        $remaining2$2 = 0,
        $remaining2$3 = 0,
        label = 0,
        $$1$looptemp = 0;
      L1: do
        switch (($options & 10) | 0) {
          case 0: {
            if (($destSize | 0) < ($srcLength | 0)) {
              HEAP32[$pErrorCode >> 2] = 15;
              $$0 = $srcLength;
              break L1;
            } else {
              $$01 = $src;
              $$06 = $dest;
              $length$0 = $srcLength;
              while (1) {
                HEAP16[$$06 >> 1] = HEAP16[$$01 >> 1] | 0;
                if (($length$0 | 0) > 1) {
                  $$01 = ($$01 + 2) | 0;
                  $$06 = ($$06 + 2) | 0;
                  $length$0 = ($length$0 + -1) | 0;
                } else {
                  $$0 = $srcLength;
                  break;
                }
              }
            }
            break;
          }
          case 2: {
            if (($destSize | 0) < ($srcLength | 0)) {
              HEAP32[$pErrorCode >> 2] = 15;
              $$0 = $srcLength;
              break L1;
            } else {
              $i$0 = 0;
              $j$0 = 0;
            }
            while (1) {
              $9 = ($i$0 + 1) | 0;
              $12 = HEAPU16[($src + ($i$0 << 1)) >> 1] | 0;
              if (
                (($9 | 0) == ($srcLength | 0)) |
                ((($12 & 64512) | 0) != 55296)
              ) {
                $c$0 = $12;
                $i$1 = $9;
              } else {
                $18 = HEAPU16[($src + ($9 << 1)) >> 1] | 0;
                if ((($18 & 64512) | 0) == 56320) {
                  $c$0 = (($12 << 10) + -56613888 + $18) | 0;
                  $i$1 = ($i$0 + 2) | 0;
                } else {
                  $c$0 = $12;
                  $i$1 = $9;
                }
              }
              $25 = _ubidi_getMirror_58($c$0) | 0;
              if ($25 >>> 0 < 65536) {
                $$sink$in = $25;
                $j$1 = ($j$0 + 1) | 0;
              } else {
                HEAP16[($dest + (($j$0 + 1) << 1)) >> 1] = ($25 & 1023) | 56320;
                $$sink$in = (($25 >>> 10) + 55232) | 0;
                $j$1 = ($j$0 + 2) | 0;
              }
              HEAP16[($dest + ($j$0 << 1)) >> 1] = $$sink$in;
              if (($i$1 | 0) < ($srcLength | 0)) {
                $i$0 = $i$1;
                $j$0 = $j$1;
              } else {
                $$0 = $srcLength;
                break;
              }
            }
            break;
          }
          case 8: {
            $$02 = $srcLength;
            $$1 = $src;
            $$17 = $dest;
            $remaining$0 = $destSize;
            L39: while (1) {
              $$1$looptemp = $$1;
              $$1 = ($$1 + 2) | 0;
              $39 = HEAP16[$$1$looptemp >> 1] | 0;
              $40 = $39 & 65535;
              L41: do
                if ((($40 & 65532) | 0) == 8204) {
                  $$28 = $$17;
                  $remaining$2 = $remaining$0;
                } else {
                  switch ($40 | 0) {
                    case 8234:
                    case 8235:
                    case 8236:
                    case 8237:
                    case 8238:
                    case 8294:
                    case 8295:
                    case 8296:
                    case 8297: {
                      $$28 = $$17;
                      $remaining$2 = $remaining$0;
                      break L41;
                      break;
                    }
                    default: {
                    }
                  }
                  $43 = ($remaining$0 + -1) | 0;
                  if (($remaining$0 | 0) < 1) break L39;
                  HEAP16[$$17 >> 1] = $39;
                  $$28 = ($$17 + 2) | 0;
                  $remaining$2 = $43;
                }
              while (0);
              if (($$02 | 0) <= 1) {
                label = 22;
                break;
              } else {
                $$02 = ($$02 + -1) | 0;
                $$17 = $$28;
                $remaining$0 = $remaining$2;
              }
            }
            if ((label | 0) == 22) {
              $$0 = ($destSize - $remaining$2) | 0;
              break L1;
            }
            HEAP32[$pErrorCode >> 2] = 15;
            if (($$02 | 0) > 1) {
              $$1372 = $$02;
              $$273 = $$1;
              $remaining$174 = $43;
              while (1) {
                $$1372 = ($$1372 + -1) | 0;
                $49 = HEAPU16[$$273 >> 1] | 0;
                $remaining$1$ =
                  (((((((($49 + -8294) | 0) >>> 0 < 4) |
                    (((($49 & 65532) | 0) == 8204) |
                      ((($49 + -8234) | 0) >>> 0 < 5))) ^
                    1) <<
                    31) >>
                    31) +
                    $remaining$174) |
                  0;
                if (($$1372 | 0) <= 1) {
                  $remaining$1$lcssa = $remaining$1$;
                  break;
                } else {
                  $$273 = ($$273 + 2) | 0;
                  $remaining$174 = $remaining$1$;
                }
              }
            } else $remaining$1$lcssa = $43;
            $$0 = ($destSize - $remaining$1$lcssa) | 0;
            break;
          }
          default: {
            $$24 = $srcLength;
            $$3 = $src;
            $j4$0 = 0;
            $remaining2$0 = $destSize;
            L2: while (1) {
              $64 = HEAPU16[$$3 >> 1] | 0;
              if ((($$24 | 0) == 1) | ((($64 & 64512) | 0) != 55296)) {
                $c5$0 = $64;
                $i3$0 = 1;
              } else {
                $70 = HEAPU16[($$3 + 2) >> 1] | 0;
                if ((($70 & 64512) | 0) == 56320) {
                  $c5$0 = (($64 << 10) + -56613888 + $70) | 0;
                  $i3$0 = 2;
                } else {
                  $c5$0 = $64;
                  $i3$0 = 1;
                }
              }
              $$3 = ($$3 + ($i3$0 << 1)) | 0;
              $$24 = ($$24 - $i3$0) | 0;
              L8: do
                if ((($c5$0 & -4) | 0) == 8204) {
                  $j4$1 = $j4$0;
                  $remaining2$3 = $remaining2$0;
                } else {
                  switch ($c5$0 | 0) {
                    case 8234:
                    case 8235:
                    case 8236:
                    case 8237:
                    case 8238:
                    case 8294:
                    case 8295:
                    case 8296:
                    case 8297: {
                      $j4$1 = $j4$0;
                      $remaining2$3 = $remaining2$0;
                      break L8;
                      break;
                    }
                    default: {
                    }
                  }
                  $80 = ($remaining2$0 - $i3$0) | 0;
                  if (($80 | 0) < 0) break L2;
                  $96 = _ubidi_getMirror_58($c5$0) | 0;
                  if ($96 >>> 0 < 65536) {
                    HEAP16[($dest + ($j4$0 << 1)) >> 1] = $96;
                    $j4$1 = ($j4$0 + 1) | 0;
                    $remaining2$3 = $80;
                    break;
                  } else {
                    HEAP16[($dest + ($j4$0 << 1)) >> 1] = ($96 >>> 10) + 55232;
                    HEAP16[($dest + (($j4$0 + 1) << 1)) >> 1] =
                      ($96 & 1023) | 56320;
                    $j4$1 = ($j4$0 + 2) | 0;
                    $remaining2$3 = $80;
                    break;
                  }
                }
              while (0);
              if (($$24 | 0) <= 0) {
                $$0 = $j4$1;
                break L1;
              } else {
                $j4$0 = $j4$1;
                $remaining2$0 = $remaining2$3;
              }
            }
            HEAP32[$pErrorCode >> 2] = 15;
            if (($$24 | 0) > 0) {
              $$3569 = $$24;
              $$470 = $$3;
              $remaining2$171 = $80;
              while (1) {
                $85 = HEAPU16[$$470 >> 1] | 0;
                $remaining2$2 =
                  (((((((($85 + -8294) | 0) >>> 0 < 4) |
                    (((($85 & 65532) | 0) == 8204) |
                      ((($85 + -8234) | 0) >>> 0 < 5))) ^
                    1) <<
                    31) >>
                    31) +
                    $remaining2$171) |
                  0;
                if (($$3569 | 0) > 1) {
                  $$3569 = ($$3569 + -1) | 0;
                  $$470 = ($$470 + 2) | 0;
                  $remaining2$171 = $remaining2$2;
                } else {
                  $remaining2$1$lcssa = $remaining2$2;
                  break;
                }
              }
            } else $remaining2$1$lcssa = $80;
            $$0 = ($destSize - $remaining2$1$lcssa) | 0;
          }
        }
      while (0);
      return $$0 | 0;
    }
    function _ubidi_setLine_58(
      $pParaBiDi,
      $start,
      $limit,
      $pLineBiDi,
      $pErrorCode,
    ) {
      $pParaBiDi = $pParaBiDi | 0;
      $start = $start | 0;
      $limit = $limit | 0;
      $pLineBiDi = $pLineBiDi | 0;
      $pErrorCode = $pErrorCode | 0;
      var $$pre$phiZ2D = 0,
        $100 = 0,
        $102 = 0,
        $104 = 0,
        $108 = 0,
        $123 = 0,
        $13 = 0,
        $14 = 0,
        $17 = 0,
        $21 = 0,
        $24 = 0,
        $29 = 0,
        $35 = 0,
        $36 = 0,
        $38 = 0,
        $47 = 0,
        $51 = 0,
        $54 = 0,
        $57 = 0,
        $58 = 0,
        $61 = 0,
        $63 = 0,
        $67 = 0,
        $68 = 0,
        $72 = 0,
        $76 = 0,
        $86 = 0,
        $88 = 0,
        $96 = 0,
        $i$0 = 0,
        $j$010 = 0,
        $pParaBiDi$idx$val = 0,
        $start$0$i = 0,
        $start$1$i = 0,
        label = 0;
      do
        if ($pErrorCode)
          if ((HEAP32[$pErrorCode >> 2] | 0) <= 0) {
            if ($pParaBiDi)
              if ((HEAP32[$pParaBiDi >> 2] | 0) == ($pParaBiDi | 0)) {
                if (!((($start | 0) > -1) & (($limit | 0) > ($start | 0)))) {
                  HEAP32[$pErrorCode >> 2] = 1;
                  break;
                }
                if (($limit | 0) >= 0)
                  if ((HEAP32[($pParaBiDi + 16) >> 2] | 0) >= ($limit | 0)) {
                    if (!$pLineBiDi) {
                      HEAP32[$pErrorCode >> 2] = 1;
                      break;
                    }
                    $13 =
                      _ubidi_getParagraph_58($pParaBiDi, $start, $pErrorCode) |
                      0;
                    $14 = ($limit + -1) | 0;
                    if (
                      ($13 | 0) !=
                      (_ubidi_getParagraph_58($pParaBiDi, $14, $pErrorCode) | 0)
                    ) {
                      HEAP32[$pErrorCode >> 2] = 1;
                      break;
                    }
                    HEAP32[$pLineBiDi >> 2] = 0;
                    $17 = ($pParaBiDi + 8) | 0;
                    HEAP32[($pLineBiDi + 8) >> 2] =
                      (HEAP32[$17 >> 2] | 0) + ($start << 1);
                    $21 = ($limit - $start) | 0;
                    HEAP32[($pLineBiDi + 16) >> 2] = $21;
                    HEAP32[($pLineBiDi + 12) >> 2] = $21;
                    $24 = ($pLineBiDi + 20) | 0;
                    HEAP32[$24 >> 2] = $21;
                    if (!(HEAP8[($pParaBiDi + 98) >> 0] | 0)) label = 17;
                    else {
                      $29 = HEAP32[($pParaBiDi + 140) >> 2] | 0;
                      if ((HEAP32[$29 >> 2] | 0) > ($start | 0)) label = 17;
                      else {
                        $pParaBiDi$idx$val =
                          HEAP32[($pParaBiDi + 136) >> 2] | 0;
                        $36 =
                          _ubidi_getParaLevelAtIndex_58(
                            $pParaBiDi$idx$val,
                            $29,
                            $start,
                          ) | 0;
                        $38 = $pParaBiDi$idx$val;
                      }
                    }
                    if ((label | 0) == 17) {
                      $36 = HEAP8[($pParaBiDi + 97) >> 0] | 0;
                      $38 = HEAP32[($pParaBiDi + 136) >> 2] | 0;
                    }
                    $35 = ($pLineBiDi + 97) | 0;
                    HEAP8[$35 >> 0] = $36;
                    HEAP32[($pLineBiDi + 136) >> 2] = $38;
                    HEAP32[($pLineBiDi + 228) >> 2] = 0;
                    HEAP32[($pLineBiDi + 124) >> 2] = 0;
                    HEAP32[($pLineBiDi + 88) >> 2] =
                      HEAP32[($pParaBiDi + 88) >> 2];
                    HEAP32[($pLineBiDi + 92) >> 2] =
                      HEAP32[($pParaBiDi + 92) >> 2];
                    $47 = ($pLineBiDi + 352) | 0;
                    HEAP32[$47 >> 2] = 0;
                    if ((HEAP32[($pParaBiDi + 352) >> 2] | 0) > 0) {
                      $51 = HEAP32[$17 >> 2] | 0;
                      $58 = 0;
                      $j$010 = $start;
                      while (1) {
                        $54 = HEAPU16[($51 + ($j$010 << 1)) >> 1] | 0;
                        if ((($54 & 65532) | 0) == 8204) label = 23;
                        else
                          switch ($54 | 0) {
                            case 8234:
                            case 8235:
                            case 8236:
                            case 8237:
                            case 8238:
                            case 8294:
                            case 8295:
                            case 8296:
                            case 8297: {
                              label = 23;
                              break;
                            }
                            default:
                              $61 = $58;
                          }
                        if ((label | 0) == 23) {
                          label = 0;
                          $57 = ($58 + 1) | 0;
                          HEAP32[$47 >> 2] = $57;
                          $61 = $57;
                        }
                        $j$010 = ($j$010 + 1) | 0;
                        if (($j$010 | 0) == ($limit | 0)) break;
                        else $58 = $61;
                      }
                      HEAP32[$24 >> 2] = $21 - $61;
                    }
                    $63 = HEAP32[($pParaBiDi + 76) >> 2] | 0;
                    HEAP32[($pLineBiDi + 76) >> 2] = $63 + $start;
                    $67 = HEAP32[($pParaBiDi + 80) >> 2] | 0;
                    $68 = ($67 + $start) | 0;
                    HEAP32[($pLineBiDi + 80) >> 2] = $68;
                    HEAP32[($pLineBiDi + 224) >> 2] = -1;
                    $72 = HEAP32[($pParaBiDi + 120) >> 2] | 0;
                    L36: do
                      if (($72 | 0) == 2) {
                        if ((HEAP8[($63 + $14) >> 0] | 0) == 7) {
                          $86 = ($pLineBiDi + 132) | 0;
                          HEAP32[$86 >> 2] = $21;
                          $$pre$phiZ2D = $86;
                          $102 = $21;
                        } else {
                          $start$0$i = $21;
                          while (1) {
                            if (($start$0$i | 0) <= 0) {
                              $start$1$i = $start$0$i;
                              break;
                            }
                            $88 = ($start$0$i + -1) | 0;
                            if (
                              !(
                                (1 << HEAPU8[($63 + ($88 + $start)) >> 0]) &
                                8248192
                              )
                            ) {
                              $start$1$i = $start$0$i;
                              break;
                            } else $start$0$i = $88;
                          }
                          while (1) {
                            if (($start$1$i | 0) <= 0) break;
                            $96 = ($start$1$i + -1) | 0;
                            if (
                              (HEAP8[($67 + ($96 + $start)) >> 0] | 0) ==
                              ($36 << 24) >> 24
                            )
                              $start$1$i = $96;
                            else break;
                          }
                          $100 = ($pLineBiDi + 132) | 0;
                          HEAP32[$100 >> 2] = $start$1$i;
                          $$pre$phiZ2D = $100;
                          $102 = $start$1$i;
                        }
                        do
                          if (!$102) {
                            $104 = $36 & 1;
                            HEAP32[($pLineBiDi + 120) >> 2] = $104;
                            $123 = $104;
                          } else {
                            $108 = HEAPU8[$68 >> 0] & 1;
                            do
                              if (($102 | 0) < ($21 | 0)) {
                                if ((($36 & 1) | 0) == ($108 | 0)) {
                                  $i$0 = 1;
                                  break;
                                }
                                HEAP32[($pLineBiDi + 120) >> 2] = 2;
                                break L36;
                              } else $i$0 = 1;
                            while (0);
                            while (1) {
                              if (($i$0 | 0) == ($102 | 0)) {
                                label = 45;
                                break;
                              }
                              if (
                                ((HEAPU8[($67 + ($i$0 + $start)) >> 0] & 1) |
                                  0) ==
                                ($108 | 0)
                              )
                                $i$0 = ($i$0 + 1) | 0;
                              else {
                                label = 47;
                                break;
                              }
                            }
                            if ((label | 0) == 45) {
                              HEAP32[($pLineBiDi + 120) >> 2] = $108;
                              $123 = $108;
                              break;
                            } else if ((label | 0) == 47) {
                              HEAP32[($pLineBiDi + 120) >> 2] = 2;
                              break L36;
                            }
                          }
                        while (0);
                        switch ($123 | 0) {
                          case 0: {
                            HEAP8[$35 >> 0] = (($36 & 255) + 1) & 254;
                            HEAP32[$$pre$phiZ2D >> 2] = 0;
                            break L36;
                            break;
                          }
                          case 1: {
                            HEAP8[$35 >> 0] = ($36 & 255) | 1;
                            HEAP32[$$pre$phiZ2D >> 2] = 0;
                            break L36;
                            break;
                          }
                          default:
                            break L36;
                        }
                      } else {
                        HEAP32[($pLineBiDi + 120) >> 2] = $72;
                        $76 = HEAP32[($pParaBiDi + 132) >> 2] | 0;
                        if (($76 | 0) <= ($start | 0)) {
                          HEAP32[($pLineBiDi + 132) >> 2] = 0;
                          break;
                        }
                        if (($76 | 0) < ($limit | 0)) {
                          HEAP32[($pLineBiDi + 132) >> 2] = $76 - $start;
                          break;
                        } else {
                          HEAP32[($pLineBiDi + 132) >> 2] = $21;
                          break;
                        }
                      }
                    while (0);
                    HEAP32[$pLineBiDi >> 2] = $pParaBiDi;
                    break;
                  }
                HEAP32[$pErrorCode >> 2] = 1;
                break;
              }
            HEAP32[$pErrorCode >> 2] = 27;
          }
      while (0);
      return;
    }
    function _try_realloc_chunk($p, $nb) {
      $p = $p | 0;
      $nb = $nb | 0;
      var $$pre$phiZ2D = 0,
        $0 = 0,
        $1 = 0,
        $101 = 0,
        $103 = 0,
        $106 = 0,
        $109 = 0,
        $110 = 0,
        $112 = 0,
        $113 = 0,
        $115 = 0,
        $116 = 0,
        $118 = 0,
        $119 = 0,
        $124 = 0,
        $125 = 0,
        $134 = 0,
        $139 = 0,
        $143 = 0,
        $149 = 0,
        $159 = 0,
        $168 = 0,
        $2 = 0,
        $20 = 0,
        $3 = 0,
        $33 = 0,
        $35 = 0,
        $4 = 0,
        $45 = 0,
        $47 = 0,
        $5 = 0,
        $56 = 0,
        $62 = 0,
        $68 = 0,
        $7 = 0,
        $70 = 0,
        $71 = 0,
        $74 = 0,
        $76 = 0,
        $78 = 0,
        $8 = 0,
        $91 = 0,
        $96 = 0,
        $98 = 0,
        $R$0 = 0,
        $R$1 = 0,
        $RP$0 = 0,
        $newp$0 = 0,
        $storemerge = 0,
        $storemerge21 = 0;
      $0 = ($p + 4) | 0;
      $1 = HEAP32[$0 >> 2] | 0;
      $2 = $1 & -8;
      $3 = ($p + $2) | 0;
      $4 = HEAP32[168] | 0;
      $5 = $1 & 3;
      if (!((($5 | 0) != 1) & ($p >>> 0 >= $4 >>> 0) & ($p >>> 0 < $3 >>> 0)))
        _abort();
      $7 = ($p + ($2 | 4)) | 0;
      $8 = HEAP32[$7 >> 2] | 0;
      if (!($8 & 1)) _abort();
      if (!$5) {
        if ($nb >>> 0 < 256) {
          $newp$0 = 0;
          return $newp$0 | 0;
        }
        if ($2 >>> 0 >= (($nb + 4) | 0) >>> 0)
          if ((($2 - $nb) | 0) >>> 0 <= (HEAP32[284] << 1) >>> 0) {
            $newp$0 = $p;
            return $newp$0 | 0;
          }
        $newp$0 = 0;
        return $newp$0 | 0;
      }
      if ($2 >>> 0 >= $nb >>> 0) {
        $20 = ($2 - $nb) | 0;
        if ($20 >>> 0 <= 15) {
          $newp$0 = $p;
          return $newp$0 | 0;
        }
        HEAP32[$0 >> 2] = ($1 & 1) | $nb | 2;
        HEAP32[($p + ($nb + 4)) >> 2] = $20 | 3;
        HEAP32[$7 >> 2] = HEAP32[$7 >> 2] | 1;
        _dispose_chunk(($p + $nb) | 0, $20);
        $newp$0 = $p;
        return $newp$0 | 0;
      }
      if (($3 | 0) == (HEAP32[170] | 0)) {
        $33 = ((HEAP32[167] | 0) + $2) | 0;
        if ($33 >>> 0 <= $nb >>> 0) {
          $newp$0 = 0;
          return $newp$0 | 0;
        }
        $35 = ($33 - $nb) | 0;
        HEAP32[$0 >> 2] = ($1 & 1) | $nb | 2;
        HEAP32[($p + ($nb + 4)) >> 2] = $35 | 1;
        HEAP32[170] = $p + $nb;
        HEAP32[167] = $35;
        $newp$0 = $p;
        return $newp$0 | 0;
      }
      if (($3 | 0) == (HEAP32[169] | 0)) {
        $45 = ((HEAP32[166] | 0) + $2) | 0;
        if ($45 >>> 0 < $nb >>> 0) {
          $newp$0 = 0;
          return $newp$0 | 0;
        }
        $47 = ($45 - $nb) | 0;
        if ($47 >>> 0 > 15) {
          HEAP32[$0 >> 2] = ($1 & 1) | $nb | 2;
          HEAP32[($p + ($nb + 4)) >> 2] = $47 | 1;
          HEAP32[($p + $45) >> 2] = $47;
          $56 = ($p + ($45 + 4)) | 0;
          HEAP32[$56 >> 2] = HEAP32[$56 >> 2] & -2;
          $storemerge = ($p + $nb) | 0;
          $storemerge21 = $47;
        } else {
          HEAP32[$0 >> 2] = ($1 & 1) | $45 | 2;
          $62 = ($p + ($45 + 4)) | 0;
          HEAP32[$62 >> 2] = HEAP32[$62 >> 2] | 1;
          $storemerge = 0;
          $storemerge21 = 0;
        }
        HEAP32[166] = $storemerge21;
        HEAP32[169] = $storemerge;
        $newp$0 = $p;
        return $newp$0 | 0;
      }
      if ($8 & 2) {
        $newp$0 = 0;
        return $newp$0 | 0;
      }
      $68 = (($8 & -8) + $2) | 0;
      if ($68 >>> 0 < $nb >>> 0) {
        $newp$0 = 0;
        return $newp$0 | 0;
      }
      $70 = ($68 - $nb) | 0;
      $71 = $8 >>> 3;
      do
        if ($8 >>> 0 < 256) {
          $74 = HEAP32[($p + ($2 + 8)) >> 2] | 0;
          $76 = HEAP32[($p + ($2 + 12)) >> 2] | 0;
          $78 = (696 + (($71 << 1) << 2)) | 0;
          if (($74 | 0) != ($78 | 0)) {
            if ($74 >>> 0 < $4 >>> 0) _abort();
            if ((HEAP32[($74 + 12) >> 2] | 0) != ($3 | 0)) _abort();
          }
          if (($76 | 0) == ($74 | 0)) {
            HEAP32[164] = HEAP32[164] & ~(1 << $71);
            break;
          }
          if (($76 | 0) == ($78 | 0)) $$pre$phiZ2D = ($76 + 8) | 0;
          else {
            if ($76 >>> 0 < $4 >>> 0) _abort();
            $91 = ($76 + 8) | 0;
            if ((HEAP32[$91 >> 2] | 0) == ($3 | 0)) $$pre$phiZ2D = $91;
            else _abort();
          }
          HEAP32[($74 + 12) >> 2] = $76;
          HEAP32[$$pre$phiZ2D >> 2] = $74;
        } else {
          $96 = HEAP32[($p + ($2 + 24)) >> 2] | 0;
          $98 = HEAP32[($p + ($2 + 12)) >> 2] | 0;
          do
            if (($98 | 0) == ($3 | 0)) {
              $109 = ($p + ($2 + 20)) | 0;
              $110 = HEAP32[$109 >> 2] | 0;
              if (!$110) {
                $112 = ($p + ($2 + 16)) | 0;
                $113 = HEAP32[$112 >> 2] | 0;
                if (!$113) {
                  $R$1 = 0;
                  break;
                } else {
                  $R$0 = $113;
                  $RP$0 = $112;
                }
              } else {
                $R$0 = $110;
                $RP$0 = $109;
              }
              while (1) {
                $115 = ($R$0 + 20) | 0;
                $116 = HEAP32[$115 >> 2] | 0;
                if ($116) {
                  $R$0 = $116;
                  $RP$0 = $115;
                  continue;
                }
                $118 = ($R$0 + 16) | 0;
                $119 = HEAP32[$118 >> 2] | 0;
                if (!$119) break;
                else {
                  $R$0 = $119;
                  $RP$0 = $118;
                }
              }
              if ($RP$0 >>> 0 < $4 >>> 0) _abort();
              else {
                HEAP32[$RP$0 >> 2] = 0;
                $R$1 = $R$0;
                break;
              }
            } else {
              $101 = HEAP32[($p + ($2 + 8)) >> 2] | 0;
              if ($101 >>> 0 < $4 >>> 0) _abort();
              $103 = ($101 + 12) | 0;
              if ((HEAP32[$103 >> 2] | 0) != ($3 | 0)) _abort();
              $106 = ($98 + 8) | 0;
              if ((HEAP32[$106 >> 2] | 0) == ($3 | 0)) {
                HEAP32[$103 >> 2] = $98;
                HEAP32[$106 >> 2] = $101;
                $R$1 = $98;
                break;
              } else _abort();
            }
          while (0);
          if ($96) {
            $124 = HEAP32[($p + ($2 + 28)) >> 2] | 0;
            $125 = (960 + ($124 << 2)) | 0;
            if (($3 | 0) == (HEAP32[$125 >> 2] | 0)) {
              HEAP32[$125 >> 2] = $R$1;
              if (!$R$1) {
                HEAP32[165] = HEAP32[165] & ~(1 << $124);
                break;
              }
            } else {
              if ($96 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
              $134 = ($96 + 16) | 0;
              if ((HEAP32[$134 >> 2] | 0) == ($3 | 0)) HEAP32[$134 >> 2] = $R$1;
              else HEAP32[($96 + 20) >> 2] = $R$1;
              if (!$R$1) break;
            }
            $139 = HEAP32[168] | 0;
            if ($R$1 >>> 0 < $139 >>> 0) _abort();
            HEAP32[($R$1 + 24) >> 2] = $96;
            $143 = HEAP32[($p + ($2 + 16)) >> 2] | 0;
            do
              if ($143)
                if ($143 >>> 0 < $139 >>> 0) _abort();
                else {
                  HEAP32[($R$1 + 16) >> 2] = $143;
                  HEAP32[($143 + 24) >> 2] = $R$1;
                  break;
                }
            while (0);
            $149 = HEAP32[($p + ($2 + 20)) >> 2] | 0;
            if ($149)
              if ($149 >>> 0 < (HEAP32[168] | 0) >>> 0) _abort();
              else {
                HEAP32[($R$1 + 20) >> 2] = $149;
                HEAP32[($149 + 24) >> 2] = $R$1;
                break;
              }
          }
        }
      while (0);
      if ($70 >>> 0 < 16) {
        HEAP32[$0 >> 2] = ($1 & 1) | $68 | 2;
        $159 = ($p + ($68 | 4)) | 0;
        HEAP32[$159 >> 2] = HEAP32[$159 >> 2] | 1;
        $newp$0 = $p;
        return $newp$0 | 0;
      } else {
        HEAP32[$0 >> 2] = ($1 & 1) | $nb | 2;
        HEAP32[($p + ($nb + 4)) >> 2] = $70 | 3;
        $168 = ($p + ($68 | 4)) | 0;
        HEAP32[$168 >> 2] = HEAP32[$168 >> 2] | 1;
        _dispose_chunk(($p + $nb) | 0, $70);
        $newp$0 = $p;
        return $newp$0 | 0;
      }
      return 0;
    }
    function _u_shapeArabic_58(
      $source,
      $sourceLength,
      $dest,
      $destCapacity,
      $pErrorCode,
    ) {
      $source = $source | 0;
      $sourceLength = $sourceLength | 0;
      $dest = $dest | 0;
      $destCapacity = $destCapacity | 0;
      $pErrorCode = $pErrorCode | 0;
      var $$0 = 0,
        $$010 = 0,
        $$1$outputSize$0 = 0,
        $$byval_copy = 0,
        $0 = 0,
        $25 = 0,
        $30 = 0,
        $45 = 0,
        $48 = 0,
        $49 = 0,
        $6 = 0,
        $buffer = 0,
        $outputSize$2 = 0,
        $spacesCountl = 0,
        $spacesCountr = 0,
        $t$0$i = 0,
        $tempbuffer$0 = 0,
        sp = 0;
      sp = STACKTOP;
      STACKTOP = (STACKTOP + 656) | 0;
      $$byval_copy = (sp + 32) | 0;
      $buffer = (sp + 56) | 0;
      $spacesCountl = (sp + 28) | 0;
      $spacesCountr = (sp + 24) | 0;
      $0 = sp;
      if (!$pErrorCode) {
        $$0 = 0;
        STACKTOP = sp;
        return $$0 | 0;
      }
      if ((HEAP32[$pErrorCode >> 2] | 0) > 0) {
        $$0 = 0;
        STACKTOP = sp;
        return $$0 | 0;
      }
      if (!((($source | 0) == 0) | (($sourceLength | 0) < -1))) {
        $6 = ($dest | 0) == 0;
        if (!((($destCapacity | 0) < 0) | ($6 & (($destCapacity | 0) != 0)))) {
          if (($sourceLength | 0) == -1) {
            $t$0$i = $source;
            while (1)
              if (!(HEAP16[$t$0$i >> 1] | 0)) break;
              else $t$0$i = ($t$0$i + 2) | 0;
            $$010 = ($t$0$i - $source) >> 1;
          } else $$010 = $sourceLength;
          if (($$010 | 0) < 1) {
            $$0 =
              _u_terminateUChars_58($dest, $destCapacity, 0, $pErrorCode) | 0;
            STACKTOP = sp;
            return $$0 | 0;
          }
          do
            if (!$6) {
              if (
                !(
                  ($source >>> 0 <= $dest >>> 0) &
                  ((($source + ($$010 << 1)) | 0) >>> 0 > $dest >>> 0)
                )
              )
                if (
                  !(
                    ($dest >>> 0 <= $source >>> 0) &
                    ((($dest + ($destCapacity << 1)) | 0) >>> 0 > $source >>> 0)
                  )
                )
                  break;
              HEAP32[$pErrorCode >> 2] = 1;
              $$0 = 0;
              STACKTOP = sp;
              return $$0 | 0;
            }
          while (0);
          HEAP32[$spacesCountl >> 2] = 0;
          HEAP32[$spacesCountr >> 2] = 0;
          $25 = __ZL13calculateSizePKtiij($source, $$010) | 0;
          if (($25 | 0) > ($destCapacity | 0)) {
            HEAP32[$pErrorCode >> 2] = 15;
            $$0 = $25;
            STACKTOP = sp;
            return $$0 | 0;
          }
          $$1$outputSize$0 = ($$010 | 0) > ($25 | 0) ? $$010 : $25;
          if (($$1$outputSize$0 | 0) < 301) {
            $outputSize$2 = 300;
            $tempbuffer$0 = $buffer;
          } else {
            $30 = _uprv_malloc_58($$1$outputSize$0 << 1) | 0;
            if (!$30) {
              HEAP32[$pErrorCode >> 2] = 7;
              $$0 = 0;
              STACKTOP = sp;
              return $$0 | 0;
            } else {
              $outputSize$2 = $$1$outputSize$0;
              $tempbuffer$0 = $30;
            }
          }
          _memcpy($tempbuffer$0 | 0, $source | 0, ($$010 << 1) | 0) | 0;
          if (($outputSize$2 | 0) > ($$010 | 0))
            _memset(
              ($tempbuffer$0 + ($$010 << 1)) | 0,
              0,
              (($outputSize$2 - $$010) << 1) | 0,
            ) | 0;
          __ZL11countSpacesPtijPiS0_(
            $tempbuffer$0,
            $$010,
            $spacesCountl,
            $spacesCountr,
          );
          __ZL12invertBufferPtijii(
            $tempbuffer$0,
            $$010,
            HEAP32[$spacesCountl >> 2] | 0,
            HEAP32[$spacesCountr >> 2] | 0,
          );
          HEAP16[$0 >> 1] = 8203;
          HEAP16[($0 + 2) >> 1] = 0;
          HEAP32[($0 + 4) >> 2] = 3;
          HEAP32[($0 + 8) >> 2] = 2;
          HEAP32[($0 + 12) >> 2] = 262144;
          HEAP32[($0 + 16) >> 2] = 393216;
          HEAP32[($0 + 20) >> 2] = 0;
          HEAP32[$$byval_copy >> 2] = HEAP32[$0 >> 2];
          HEAP32[($$byval_copy + 4) >> 2] = HEAP32[($0 + 4) >> 2];
          HEAP32[($$byval_copy + 8) >> 2] = HEAP32[($0 + 8) >> 2];
          HEAP32[($$byval_copy + 12) >> 2] = HEAP32[($0 + 12) >> 2];
          HEAP32[($$byval_copy + 16) >> 2] = HEAP32[($0 + 16) >> 2];
          HEAP32[($$byval_copy + 20) >> 2] = HEAP32[($0 + 20) >> 2];
          $45 =
            __ZL12shapeUnicodePtiijP10UErrorCodei15uShapeVariables(
              $tempbuffer$0,
              $$010,
              $pErrorCode,
              $$byval_copy,
            ) | 0;
          __ZL11countSpacesPtijPiS0_(
            $tempbuffer$0,
            $45,
            $spacesCountl,
            $spacesCountr,
          );
          __ZL12invertBufferPtijii(
            $tempbuffer$0,
            $45,
            HEAP32[$spacesCountl >> 2] | 0,
            HEAP32[$spacesCountr >> 2] | 0,
          );
          $48 = ($45 | 0) > ($destCapacity | 0);
          $49 = $48 ? $destCapacity : $45;
          if (($49 | 0) > 0)
            _memcpy($dest | 0, $tempbuffer$0 | 0, ($49 << 1) | 0) | 0;
          if (($tempbuffer$0 | 0) != ($buffer | 0))
            _uprv_free_58($tempbuffer$0);
          if ($48) {
            HEAP32[$pErrorCode >> 2] = 15;
            $$0 = $45;
            STACKTOP = sp;
            return $$0 | 0;
          } else {
            $$0 =
              _u_terminateUChars_58($dest, $destCapacity, $45, $pErrorCode) | 0;
            STACKTOP = sp;
            return $$0 | 0;
          }
        }
      }
      HEAP32[$pErrorCode >> 2] = 1;
      $$0 = 0;
      STACKTOP = sp;
      return $$0 | 0;
    }
    function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib(
      $this,
      $info,
      $current_ptr,
      $path_below,
      $use_strcmp,
    ) {
      $this = $this | 0;
      $info = $info | 0;
      $current_ptr = $current_ptr | 0;
      $path_below = $path_below | 0;
      $use_strcmp = $use_strcmp | 0;
      var $14 = 0,
        $20 = 0,
        $23 = 0,
        $24 = 0,
        $26 = 0,
        $33 = 0,
        $44 = 0,
        $6 = 0,
        $is_dst_type_derived_from_static_type$0$off01 = 0,
        label = 0;
      L1: do
        if (($this | 0) == (HEAP32[($info + 8) >> 2] | 0)) {
          if ((HEAP32[($info + 4) >> 2] | 0) == ($current_ptr | 0)) {
            $6 = ($info + 28) | 0;
            if ((HEAP32[$6 >> 2] | 0) != 1) HEAP32[$6 >> 2] = $path_below;
          }
        } else {
          if (($this | 0) != (HEAP32[$info >> 2] | 0)) {
            $44 = HEAP32[($this + 8) >> 2] | 0;
            FUNCTION_TABLE_viiiii[
              HEAP32[((HEAP32[$44 >> 2] | 0) + 24) >> 2] & 3
            ]($44, $info, $current_ptr, $path_below, $use_strcmp);
            break;
          }
          if ((HEAP32[($info + 16) >> 2] | 0) != ($current_ptr | 0)) {
            $14 = ($info + 20) | 0;
            if ((HEAP32[$14 >> 2] | 0) != ($current_ptr | 0)) {
              HEAP32[($info + 32) >> 2] = $path_below;
              $20 = ($info + 44) | 0;
              if ((HEAP32[$20 >> 2] | 0) == 4) break;
              $23 = ($info + 52) | 0;
              HEAP8[$23 >> 0] = 0;
              $24 = ($info + 53) | 0;
              HEAP8[$24 >> 0] = 0;
              $26 = HEAP32[($this + 8) >> 2] | 0;
              FUNCTION_TABLE_viiiiii[
                HEAP32[((HEAP32[$26 >> 2] | 0) + 20) >> 2] & 3
              ]($26, $info, $current_ptr, $current_ptr, 1, $use_strcmp);
              if (!(HEAP8[$24 >> 0] | 0)) {
                $is_dst_type_derived_from_static_type$0$off01 = 0;
                label = 13;
              } else if (!(HEAP8[$23 >> 0] | 0)) {
                $is_dst_type_derived_from_static_type$0$off01 = 1;
                label = 13;
              }
              do
                if ((label | 0) == 13) {
                  HEAP32[$14 >> 2] = $current_ptr;
                  $33 = ($info + 40) | 0;
                  HEAP32[$33 >> 2] = (HEAP32[$33 >> 2] | 0) + 1;
                  if ((HEAP32[($info + 36) >> 2] | 0) == 1)
                    if ((HEAP32[($info + 24) >> 2] | 0) == 2) {
                      HEAP8[($info + 54) >> 0] = 1;
                      if ($is_dst_type_derived_from_static_type$0$off01) break;
                    } else label = 16;
                  else label = 16;
                  if ((label | 0) == 16)
                    if ($is_dst_type_derived_from_static_type$0$off01) break;
                  HEAP32[$20 >> 2] = 4;
                  break L1;
                }
              while (0);
              HEAP32[$20 >> 2] = 3;
              break;
            }
          }
          if (($path_below | 0) == 1) HEAP32[($info + 32) >> 2] = 1;
        }
      while (0);
      return;
    }
    function ___dynamic_cast($static_ptr, $dst_type) {
      $static_ptr = $static_ptr | 0;
      $dst_type = $dst_type | 0;

      var $0 = 0,
        $10 = 0,
        $11 = 0,
        $12 = 0,
        $13 = 0,
        $14 = 0,
        $15 = 0,
        $16 = 0,
        $4 = 0,
        $6 = 0,
        $9 = 0,
        $dst_ptr$0 = 0,
        $info = 0,
        dest = 0,
        sp = 0,
        stop = 0;
      sp = STACKTOP;
      STACKTOP = (STACKTOP + 64) | 0;
      $info = sp;
      $0 = HEAP32[$static_ptr >> 2] | 0;
      $4 = ($static_ptr + (HEAP32[($0 + -8) >> 2] | 0)) | 0;
      $6 = HEAP32[($0 + -4) >> 2] | 0;
      HEAP32[$info >> 2] = $dst_type;
      HEAP32[($info + 4) >> 2] = $static_ptr;
      HEAP32[($info + 8) >> 2] = 16;
      $9 = ($info + 12) | 0;
      $10 = ($info + 16) | 0;
      $11 = ($info + 20) | 0;
      $12 = ($info + 24) | 0;
      $13 = ($info + 28) | 0;
      $14 = ($info + 32) | 0;
      $15 = ($info + 40) | 0;
      $16 = ($6 | 0) == ($dst_type | 0);
      dest = $9;
      stop = (dest + 40) | 0;
      do {
        HEAP32[dest >> 2] = 0;
        dest = (dest + 4) | 0;
      } while ((dest | 0) < (stop | 0));
      HEAP16[($9 + 40) >> 1] = 0;
      HEAP8[($9 + 42) >> 0] = 0;
      L1: do
        if ($16) {
          HEAP32[($info + 48) >> 2] = 1;
          FUNCTION_TABLE_viiiiii[
            HEAP32[((HEAP32[$dst_type >> 2] | 0) + 20) >> 2] & 3
          ]($dst_type, $info, $4, $4, 1, 0);
          $dst_ptr$0 = (HEAP32[$12 >> 2] | 0) == 1 ? $4 : 0;
        } else {
          FUNCTION_TABLE_viiiii[HEAP32[((HEAP32[$6 >> 2] | 0) + 24) >> 2] & 3](
            $6,
            $info,
            $4,
            1,
            0,
          );
          switch (HEAP32[($info + 36) >> 2] | 0) {
            case 0: {
              $dst_ptr$0 =
                ((HEAP32[$15 >> 2] | 0) == 1) &
                ((HEAP32[$13 >> 2] | 0) == 1) &
                ((HEAP32[$14 >> 2] | 0) == 1)
                  ? HEAP32[$11 >> 2] | 0
                  : 0;
              break L1;
              break;
            }
            case 1:
              break;
            default: {
              $dst_ptr$0 = 0;
              break L1;
            }
          }
          if ((HEAP32[$12 >> 2] | 0) != 1)
            if (
              !(
                ((HEAP32[$15 >> 2] | 0) == 0) &
                ((HEAP32[$13 >> 2] | 0) == 1) &
                ((HEAP32[$14 >> 2] | 0) == 1)
              )
            ) {
              $dst_ptr$0 = 0;
              break;
            }
          $dst_ptr$0 = HEAP32[$10 >> 2] | 0;
        }
      while (0);
      STACKTOP = sp;
      return $dst_ptr$0 | 0;
    }
    function _bracketInit($pBiDi, $bd) {
      $pBiDi = $pBiDi | 0;
      $bd = $bd | 0;
      var $$sink = 0,
        $$sink1 = 0,
        $$sink2 = 0,
        $$sink3 = 0,
        $10 = 0,
        $17 = 0,
        $22 = 0,
        $24 = 0,
        $29 = 0,
        $38 = 0,
        $7 = 0,
        $9 = 0;
      HEAP32[$bd >> 2] = $pBiDi;
      HEAP32[($bd + 492) >> 2] = 0;
      HEAP16[($bd + 500) >> 1] = 0;
      HEAP16[($bd + 502) >> 1] = 0;
      do
        if (!(HEAP8[($pBiDi + 98) >> 0] | 0)) {
          $7 = HEAP8[($pBiDi + 97) >> 0] | 0;
          HEAP8[($bd + 504) >> 0] = $7;
          $$sink1 = $7;
        } else {
          $9 = ($pBiDi + 140) | 0;
          $10 = HEAP32[$9 >> 2] | 0;
          if ((HEAP32[$10 >> 2] | 0) > 0)
            $$sink = HEAP8[($pBiDi + 97) >> 0] | 0;
          else
            $$sink =
              _ubidi_getParaLevelAtIndex_58(
                HEAP32[($pBiDi + 136) >> 2] | 0,
                $10,
                0,
              ) | 0;
          HEAP8[($bd + 504) >> 0] = $$sink;
          $17 = HEAP32[$9 >> 2] | 0;
          if ((HEAP32[$17 >> 2] | 0) > 0) {
            $$sink1 = HEAP8[($pBiDi + 97) >> 0] | 0;
            break;
          } else {
            $$sink1 =
              _ubidi_getParaLevelAtIndex_58(
                HEAP32[($pBiDi + 136) >> 2] | 0,
                $17,
                0,
              ) | 0;
            break;
          }
        }
      while (0);
      $22 = $$sink1 & 1;
      HEAP32[($bd + 508) >> 2] = $22;
      $24 = $22 & 255;
      HEAP8[($bd + 506) >> 0] = $24;
      HEAP8[($bd + 505) >> 0] = $24;
      HEAP32[($bd + 496) >> 2] = 0;
      $29 = HEAP32[($pBiDi + 56) >> 2] | 0;
      if (!$29) {
        $$sink2 = 20;
        $$sink3 = ($bd + 4) | 0;
      } else {
        $$sink2 = (((HEAP32[($pBiDi + 32) >> 2] | 0) >>> 0) / 24) | 0;
        $$sink3 = $29;
      }
      HEAP32[($bd + 484) >> 2] = $$sink3;
      HEAP32[($bd + 488) >> 2] = $$sink2;
      $38 = HEAP32[($pBiDi + 88) >> 2] | 0;
      HEAP8[($bd + 2528) >> 0] = ($38 | 0) == 1 ? 1 : (($38 | 0) == 6) & 1;
      return;
    }
    function _addPoint($pBiDi, $pos, $flag) {
      $pBiDi = $pBiDi | 0;
      $pos = $pos | 0;
      $flag = $flag | 0;
      var $$phi$trans$insert$pre$phiZZZZ2D = 0,
        $0 = 0,
        $1 = 0,
        $10 = 0,
        $11 = 0,
        $13 = 0,
        $19 = 0,
        $20 = 0,
        $3 = 0,
        $4 = 0,
        $7 = 0,
        $8 = 0,
        label = 0;
      $0 = ($pBiDi + 332) | 0;
      $1 = HEAP32[$0 >> 2] | 0;
      do
        if (!$1) {
          $3 = _uprv_malloc_58(80) | 0;
          $4 = ($pBiDi + 348) | 0;
          HEAP32[$4 >> 2] = $3;
          if (!$3) {
            HEAP32[($pBiDi + 344) >> 2] = 7;
            break;
          } else {
            HEAP32[$0 >> 2] = 10;
            $$phi$trans$insert$pre$phiZZZZ2D = $4;
            $10 = 10;
            label = 6;
            break;
          }
        } else {
          $$phi$trans$insert$pre$phiZZZZ2D = ($pBiDi + 348) | 0;
          $10 = $1;
          label = 6;
        }
      while (0);
      L7: do
        if ((label | 0) == 6) {
          $7 = ($pBiDi + 336) | 0;
          $8 = HEAP32[$7 >> 2] | 0;
          do
            if (($8 | 0) < ($10 | 0)) {
              $19 = HEAP32[$$phi$trans$insert$pre$phiZZZZ2D >> 2] | 0;
              $20 = $8;
            } else {
              $11 = HEAP32[$$phi$trans$insert$pre$phiZZZZ2D >> 2] | 0;
              $13 = _uprv_realloc_58($11, $10 << 4) | 0;
              HEAP32[$$phi$trans$insert$pre$phiZZZZ2D >> 2] = $13;
              if (!$13) {
                HEAP32[$$phi$trans$insert$pre$phiZZZZ2D >> 2] = $11;
                HEAP32[($pBiDi + 344) >> 2] = 7;
                break L7;
              } else {
                HEAP32[$0 >> 2] = HEAP32[$0 >> 2] << 1;
                $19 = $13;
                $20 = HEAP32[$7 >> 2] | 0;
                break;
              }
            }
          while (0);
          HEAP32[($19 + ($20 << 3)) >> 2] = $pos;
          HEAP32[($19 + ($20 << 3) + 4) >> 2] = $flag;
          HEAP32[$7 >> 2] = (HEAP32[$7 >> 2] | 0) + 1;
        }
      while (0);
      return;
    }
    function _ubidi_getVisualRun_58(
      $pBiDi,
      $runIndex,
      $pLogicalStart,
      $pLength,
    ) {
      $pBiDi = $pBiDi | 0;
      $runIndex = $runIndex | 0;
      $pLogicalStart = $pLogicalStart | 0;
      $pLength = $pLength | 0;
      var $$0 = 0,
        $1 = 0,
        $13 = 0,
        $15 = 0,
        $errorCode = 0,
        label = 0,
        sp = 0;
      sp = STACKTOP;
      STACKTOP = (STACKTOP + 16) | 0;
      $errorCode = sp;
      HEAP32[$errorCode >> 2] = 0;
      do
        if (!$pBiDi) label = 5;
        else {
          $1 = HEAP32[$pBiDi >> 2] | 0;
          if (($1 | 0) != ($pBiDi | 0)) {
            if (!$1) {
              label = 5;
              break;
            }
            if ((HEAP32[$1 >> 2] | 0) != ($1 | 0)) {
              label = 5;
              break;
            }
          }
          _ubidi_getRuns_58($pBiDi, $errorCode);
          if ((HEAP32[$errorCode >> 2] | 0) > 0) $$0 = 0;
          else {
            if (($runIndex | 0) >= 0)
              if ((HEAP32[($pBiDi + 224) >> 2] | 0) > ($runIndex | 0)) {
                $13 = HEAP32[($pBiDi + 228) >> 2] | 0;
                $15 = HEAP32[($13 + (($runIndex * 12) | 0)) >> 2] | 0;
                if ($pLogicalStart)
                  HEAP32[$pLogicalStart >> 2] = $15 & 2147483647;
                do
                  if ($pLength)
                    if (($runIndex | 0) > 0) {
                      HEAP32[$pLength >> 2] =
                        (HEAP32[($13 + (($runIndex * 12) | 0) + 4) >> 2] | 0) -
                        (HEAP32[
                          ($13 + (((($runIndex + -1) | 0) * 12) | 0) + 4) >> 2
                        ] |
                          0);
                      break;
                    } else {
                      HEAP32[$pLength >> 2] = HEAP32[($13 + 4) >> 2];
                      break;
                    }
                while (0);
                $$0 = $15 >>> 31;
                break;
              }
            HEAP32[$errorCode >> 2] = 1;
            $$0 = 0;
          }
        }
      while (0);
      if ((label | 0) == 5) {
        HEAP32[$errorCode >> 2] = 27;
        $$0 = 0;
      }
      STACKTOP = sp;
      return $$0 | 0;
    }
    function _bracketAddOpening($bd, $match, $position) {
      $bd = $bd | 0;
      $match = $match | 0;
      $position = $position | 0;
      var $$0 = 0,
        $1 = 0,
        $10 = 0,
        $14 = 0,
        $16 = 0,
        $19 = 0,
        $2 = 0,
        $23 = 0,
        $24 = 0,
        $26 = 0,
        $3 = 0,
        $4 = 0,
        $5 = 0,
        $8 = 0,
        $9 = 0,
        label = 0;
      $1 = HEAP32[($bd + 492) >> 2] | 0;
      $2 = ($bd + 496 + ($1 << 4) + 6) | 0;
      $3 = HEAP16[$2 >> 1] | 0;
      $4 = $3 & 65535;
      $5 = ($bd + 488) | 0;
      if (($4 | 0) < (HEAP32[$5 >> 2] | 0)) {
        $24 = $3;
        $26 = HEAP32[($bd + 484) >> 2] | 0;
        label = 7;
      } else {
        $8 = HEAP32[$bd >> 2] | 0;
        $9 = ($8 + 56) | 0;
        $10 = ($8 + 32) | 0;
        if (
          !(((_ubidi_getMemory_58($9, $10, 1, ($4 * 48) | 0) | 0) << 24) >> 24)
        )
          $$0 = 0;
        else {
          $14 = ($bd + 484) | 0;
          $16 = ($bd + 4) | 0;
          if ((HEAP32[$14 >> 2] | 0) == ($16 | 0))
            _memcpy(HEAP32[$9 >> 2] | 0, $16 | 0, 480) | 0;
          $19 = HEAP32[$9 >> 2] | 0;
          HEAP32[$14 >> 2] = $19;
          HEAP32[$5 >> 2] = (((HEAP32[$10 >> 2] | 0) >>> 0) / 24) | 0;
          $24 = HEAP16[$2 >> 1] | 0;
          $26 = $19;
          label = 7;
        }
      }
      if ((label | 0) == 7) {
        $23 = $24 & 65535;
        HEAP32[($26 + (($23 * 24) | 0)) >> 2] = $position;
        HEAP32[($26 + (($23 * 24) | 0) + 4) >> 2] = $match & 65535;
        HEAP32[($26 + (($23 * 24) | 0) + 16) >> 2] =
          HEAP32[($bd + 496 + ($1 << 4) + 12) >> 2];
        HEAP32[($26 + (($23 * 24) | 0) + 8) >> 2] =
          HEAP32[($bd + 496 + ($1 << 4)) >> 2];
        HEAP16[($26 + (($23 * 24) | 0) + 12) >> 1] = 0;
        HEAP16[$2 >> 1] = (($24 + 1) << 16) >> 16;
        $$0 = 1;
      }
      return $$0 | 0;
    }
    function _fixN0c($bd, $openingIndex, $newPropPosition, $newProp) {
      $bd = $bd | 0;
      $openingIndex = $openingIndex | 0;
      $newPropPosition = $newPropPosition | 0;
      $newProp = $newProp | 0;
      var $14 = 0,
        $20 = 0,
        $27 = 0,
        $32 = 0,
        $34 = 0,
        $4 = 0,
        $5 = 0,
        $6 = 0,
        $7 = 0,
        $8 = 0,
        $k$01 = 0,
        $qOpening$02 = 0;
      $4 = HEAP32[((HEAP32[$bd >> 2] | 0) + 76) >> 2] | 0;
      $5 = ($openingIndex + 1) | 0;
      $6 = $newProp & 255;
      $7 = ($bd + 496 + (HEAP32[($bd + 492) >> 2] << 4) + 6) | 0;
      $8 = HEAP16[$7 >> 1] | 0;
      L1: do
        if (($5 | 0) < (($8 & 65535) | 0)) {
          $34 = $8;
          $k$01 = $5;
          $qOpening$02 = ((HEAP32[($bd + 484) >> 2] | 0) + (($5 * 24) | 0)) | 0;
          while (1) {
            $14 = ($qOpening$02 + 4) | 0;
            if ((HEAP32[$14 >> 2] | 0) > -1) $32 = $34;
            else {
              if (
                (HEAP32[($qOpening$02 + 8) >> 2] | 0) >
                ($newPropPosition | 0)
              )
                break L1;
              $20 = HEAP32[$qOpening$02 >> 2] | 0;
              if (($20 | 0) > ($newPropPosition | 0)) {
                if (($6 | 0) == (HEAP32[($qOpening$02 + 16) >> 2] | 0))
                  break L1;
                HEAP8[($4 + $20) >> 0] = $newProp;
                $27 = (0 - (HEAP32[$14 >> 2] | 0)) | 0;
                HEAP8[($4 + $27) >> 0] = $newProp;
                HEAP32[$14 >> 2] = 0;
                _fixN0c($bd, $k$01, $20, $newProp);
                _fixN0c($bd, $k$01, $27, $newProp);
                $32 = HEAP16[$7 >> 1] | 0;
              } else $32 = $34;
            }
            $k$01 = ($k$01 + 1) | 0;
            if (($k$01 | 0) >= (($32 & 65535) | 0)) break;
            else {
              $34 = $32;
              $qOpening$02 = ($qOpening$02 + 24) | 0;
            }
          }
        }
      while (0);
      return;
    }
    function _ubidi_getLevels_58($pBiDi, $pErrorCode) {
      $pBiDi = $pBiDi | 0;
      $pErrorCode = $pErrorCode | 0;
      var $$0 = 0,
        $10 = 0,
        $12 = 0,
        $13 = 0,
        $17 = 0,
        $23 = 0,
        $25 = 0,
        $26 = 0,
        $4 = 0;
      L1: do
        if (!$pErrorCode) $$0 = 0;
        else if ((HEAP32[$pErrorCode >> 2] | 0) > 0) $$0 = 0;
        else {
          do
            if ($pBiDi) {
              $4 = HEAP32[$pBiDi >> 2] | 0;
              if (($4 | 0) != ($pBiDi | 0)) {
                if (!$4) break;
                if ((HEAP32[$4 >> 2] | 0) != ($4 | 0)) break;
              }
              $10 = HEAP32[($pBiDi + 16) >> 2] | 0;
              if (($10 | 0) < 1) {
                HEAP32[$pErrorCode >> 2] = 1;
                $$0 = 0;
                break L1;
              }
              $12 = ($pBiDi + 132) | 0;
              $13 = HEAP32[$12 >> 2] | 0;
              if (($10 | 0) == ($13 | 0)) {
                $$0 = HEAP32[($pBiDi + 80) >> 2] | 0;
                break L1;
              }
              $17 = ($pBiDi + 52) | 0;
              if (
                !(
                  ((_ubidi_getMemory_58(
                    $17,
                    ($pBiDi + 28) | 0,
                    HEAP8[($pBiDi + 72) >> 0] | 0,
                    $10,
                  ) |
                    0) <<
                    24) >>
                  24
                )
              ) {
                HEAP32[$pErrorCode >> 2] = 7;
                $$0 = 0;
                break L1;
              }
              $23 = HEAP32[$17 >> 2] | 0;
              $25 = ($pBiDi + 80) | 0;
              if (($13 | 0) > 0) {
                $26 = HEAP32[$25 >> 2] | 0;
                if (($23 | 0) != ($26 | 0))
                  _memcpy($23 | 0, $26 | 0, $13 | 0) | 0;
              }
              _memset(
                ($23 + $13) | 0,
                HEAP8[($pBiDi + 97) >> 0] | 0,
                ($10 - $13) | 0,
              ) | 0;
              HEAP32[$12 >> 2] = $10;
              HEAP32[$25 >> 2] = $23;
              $$0 = $23;
              break L1;
            }
          while (0);
          HEAP32[$pErrorCode >> 2] = 27;
          $$0 = 0;
        }
      while (0);
      return $$0 | 0;
    }
    function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(
      $info,
      $dst_ptr,
      $current_ptr,
      $path_below,
    ) {
      $info = $info | 0;
      $dst_ptr = $dst_ptr | 0;
      $current_ptr = $current_ptr | 0;
      $path_below = $path_below | 0;
      var $16 = 0,
        $17 = 0,
        $23 = 0,
        $25 = 0,
        $5 = 0,
        $6 = 0;
      HEAP8[($info + 53) >> 0] = 1;
      do
        if ((HEAP32[($info + 4) >> 2] | 0) == ($current_ptr | 0)) {
          HEAP8[($info + 52) >> 0] = 1;
          $5 = ($info + 16) | 0;
          $6 = HEAP32[$5 >> 2] | 0;
          if (!$6) {
            HEAP32[$5 >> 2] = $dst_ptr;
            HEAP32[($info + 24) >> 2] = $path_below;
            HEAP32[($info + 36) >> 2] = 1;
            if (
              !(($path_below | 0) == 1
                ? (HEAP32[($info + 48) >> 2] | 0) == 1
                : 0)
            )
              break;
            HEAP8[($info + 54) >> 0] = 1;
            break;
          }
          if (($6 | 0) != ($dst_ptr | 0)) {
            $25 = ($info + 36) | 0;
            HEAP32[$25 >> 2] = (HEAP32[$25 >> 2] | 0) + 1;
            HEAP8[($info + 54) >> 0] = 1;
            break;
          }
          $16 = ($info + 24) | 0;
          $17 = HEAP32[$16 >> 2] | 0;
          if (($17 | 0) == 2) {
            HEAP32[$16 >> 2] = $path_below;
            $23 = $path_below;
          } else $23 = $17;
          if (($23 | 0) == 1 ? (HEAP32[($info + 48) >> 2] | 0) == 1 : 0)
            HEAP8[($info + 54) >> 0] = 1;
        }
      while (0);
      return;
    }
    function __ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib(
      $this,
      $info,
      $current_ptr,
      $path_below,
      $use_strcmp,
    ) {
      $this = $this | 0;
      $info = $info | 0;
      $current_ptr = $current_ptr | 0;
      $path_below = $path_below | 0;
      $use_strcmp = $use_strcmp | 0;
      var $14 = 0,
        $20 = 0,
        $6 = 0;
      do
        if (($this | 0) == (HEAP32[($info + 8) >> 2] | 0)) {
          if ((HEAP32[($info + 4) >> 2] | 0) == ($current_ptr | 0)) {
            $6 = ($info + 28) | 0;
            if ((HEAP32[$6 >> 2] | 0) != 1) HEAP32[$6 >> 2] = $path_below;
          }
        } else if (($this | 0) == (HEAP32[$info >> 2] | 0)) {
          if ((HEAP32[($info + 16) >> 2] | 0) != ($current_ptr | 0)) {
            $14 = ($info + 20) | 0;
            if ((HEAP32[$14 >> 2] | 0) != ($current_ptr | 0)) {
              HEAP32[($info + 32) >> 2] = $path_below;
              HEAP32[$14 >> 2] = $current_ptr;
              $20 = ($info + 40) | 0;
              HEAP32[$20 >> 2] = (HEAP32[$20 >> 2] | 0) + 1;
              if ((HEAP32[($info + 36) >> 2] | 0) == 1)
                if ((HEAP32[($info + 24) >> 2] | 0) == 2)
                  HEAP8[($info + 54) >> 0] = 1;
              HEAP32[($info + 44) >> 2] = 4;
              break;
            }
          }
          if (($path_below | 0) == 1) HEAP32[($info + 32) >> 2] = 1;
        }
      while (0);
      return;
    }
    function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv(
      $this,
      $thrown_type,
      $adjustedPtr,
    ) {
      $this = $this | 0;
      $thrown_type = $thrown_type | 0;
      $adjustedPtr = $adjustedPtr | 0;
      var $$0 = 0,
        $$1 = 0,
        $2 = 0,
        $info = 0,
        dest = 0,
        sp = 0,
        stop = 0;
      sp = STACKTOP;
      STACKTOP = (STACKTOP + 64) | 0;
      $info = sp;
      if (($this | 0) == ($thrown_type | 0)) $$1 = 1;
      else if (!$thrown_type) $$1 = 0;
      else {
        $2 = ___dynamic_cast($thrown_type, 32) | 0;
        if (!$2) $$1 = 0;
        else {
          dest = $info;
          stop = (dest + 56) | 0;
          do {
            HEAP32[dest >> 2] = 0;
            dest = (dest + 4) | 0;
          } while ((dest | 0) < (stop | 0));
          HEAP32[$info >> 2] = $2;
          HEAP32[($info + 8) >> 2] = $this;
          HEAP32[($info + 12) >> 2] = -1;
          HEAP32[($info + 48) >> 2] = 1;
          FUNCTION_TABLE_viiii[HEAP32[((HEAP32[$2 >> 2] | 0) + 28) >> 2] & 3](
            $2,
            $info,
            HEAP32[$adjustedPtr >> 2] | 0,
            1,
          );
          if ((HEAP32[($info + 24) >> 2] | 0) == 1) {
            HEAP32[$adjustedPtr >> 2] = HEAP32[($info + 16) >> 2];
            $$0 = 1;
          } else $$0 = 0;
          $$1 = $$0;
        }
      }
      STACKTOP = sp;
      return $$1 | 0;
    }
    function __ZL13calculateSizePKtiij($source, $sourceLength) {
      $source = $source | 0;
      $sourceLength = $sourceLength | 0;
      var $$233 = 0,
        $$3 = 0,
        $$4 = 0,
        $0 = 0,
        $3 = 0,
        $i$135 = 0,
        $switch$tableidx$i12 = 0,
        label = 0;
      $0 = ($sourceLength + -1) | 0;
      if (($sourceLength | 0) > 0) {
        $$233 = $sourceLength;
        $i$135 = 0;
      } else {
        $$4 = $sourceLength;
        return $$4 | 0;
      }
      while (1) {
        $3 = HEAP16[($source + ($i$135 << 1)) >> 1] | 0;
        if ((($i$135 | 0) < ($0 | 0)) & (($3 << 16) >> 16 == 1604)) {
          $switch$tableidx$i12 =
            (((HEAP16[($source + (($i$135 + 1) << 1)) >> 1] | 0) + -1570) <<
              16) >>
            16;
          if (($switch$tableidx$i12 & 65535) < 6)
            if (!((43 >>> ($switch$tableidx$i12 & 63)) & 1)) $$3 = $$233;
            else label = 6;
          else label = 5;
        } else label = 5;
        if ((label | 0) == 5) {
          label = 0;
          if ((($3 & -16) << 16) >> 16 == -400) label = 6;
          else $$3 = $$233;
        }
        if ((label | 0) == 6) {
          label = 0;
          $$3 = ($$233 + -1) | 0;
        }
        $i$135 = ($i$135 + 1) | 0;
        if (($i$135 | 0) == ($sourceLength | 0)) {
          $$4 = $$3;
          break;
        } else $$233 = $$3;
      }
      return $$4 | 0;
    }
    function _getRunFromLogicalIndex(
      $pBiDi$0$40$val,
      $pBiDi$0$41$val,
      $logicalIndex,
      $pErrorCode,
    ) {
      $pBiDi$0$40$val = $pBiDi$0$40$val | 0;
      $pBiDi$0$41$val = $pBiDi$0$41$val | 0;
      $logicalIndex = $logicalIndex | 0;
      $pErrorCode = $pErrorCode | 0;
      var $$0 = 0,
        $5 = 0,
        $i$05 = 0,
        $visualStart$06 = 0,
        label = 0,
        $visualStart$06$looptemp = 0;
      L1: do
        if (($pBiDi$0$40$val | 0) > 0) {
          $i$05 = 0;
          $visualStart$06 = 0;
          while (1) {
            $visualStart$06$looptemp = $visualStart$06;
            $visualStart$06 =
              HEAP32[($pBiDi$0$41$val + (($i$05 * 12) | 0) + 4) >> 2] | 0;
            $5 =
              HEAP32[($pBiDi$0$41$val + (($i$05 * 12) | 0)) >> 2] & 2147483647;
            if (($5 | 0) <= ($logicalIndex | 0))
              if (
                (($visualStart$06 - $visualStart$06$looptemp + $5) | 0) >
                ($logicalIndex | 0)
              ) {
                $$0 = $i$05;
                break L1;
              }
            $i$05 = ($i$05 + 1) | 0;
            if (($i$05 | 0) >= ($pBiDi$0$40$val | 0)) {
              label = 5;
              break;
            }
          }
        } else label = 5;
      while (0);
      if ((label | 0) == 5) {
        HEAP32[$pErrorCode >> 2] = 27;
        $$0 = 0;
      }
      return $$0 | 0;
    }
    function _ubidi_getParagraph_58($pBiDi, $charIndex, $pErrorCode) {
      $pBiDi = $pBiDi | 0;
      $charIndex = $charIndex | 0;
      $pErrorCode = $pErrorCode | 0;
      var $$0 = 0,
        $14 = 0,
        $4 = 0,
        $paraIndex$0 = 0;
      L1: do
        if (!$pErrorCode) $$0 = -1;
        else if ((HEAP32[$pErrorCode >> 2] | 0) > 0) $$0 = -1;
        else {
          do
            if ($pBiDi) {
              $4 = HEAP32[$pBiDi >> 2] | 0;
              if (($4 | 0) != ($pBiDi | 0)) {
                if (!$4) break;
                if ((HEAP32[$4 >> 2] | 0) != ($4 | 0)) break;
              }
              if (($charIndex | 0) >= 0)
                if ((HEAP32[($4 + 16) >> 2] | 0) > ($charIndex | 0)) {
                  $14 = HEAP32[($4 + 140) >> 2] | 0;
                  $paraIndex$0 = 0;
                  while (1)
                    if (
                      (HEAP32[($14 + ($paraIndex$0 << 3)) >> 2] | 0) >
                      ($charIndex | 0)
                    )
                      break;
                    else $paraIndex$0 = ($paraIndex$0 + 1) | 0;
                  _ubidi_getParagraphByIndex_58(
                    $4,
                    $paraIndex$0,
                    0,
                    $pErrorCode,
                  );
                  $$0 = $paraIndex$0;
                  break L1;
                }
              HEAP32[$pErrorCode >> 2] = 1;
              $$0 = -1;
              break L1;
            }
          while (0);
          HEAP32[$pErrorCode >> 2] = 27;
          $$0 = -1;
        }
      while (0);
      return $$0 | 0;
    }
    function _ubidi_getPairedBracketType_58($bdp, $c) {
      $bdp = $bdp | 0;
      $c = $c | 0;
      var $35 = 0,
        $51 = 0;
      do
        if ($c >>> 0 < 55296)
          $51 =
            (((HEAPU16[
              ((HEAP32[($bdp + 20) >> 2] | 0) + (($c >> 5) << 1)) >> 1
            ] |
              0) <<
              2) +
              ($c & 31)) |
            0;
        else {
          if ($c >>> 0 < 65536) {
            $51 =
              (((HEAPU16[
                ((HEAP32[($bdp + 20) >> 2] | 0) +
                  (((($c | 0) < 56320 ? 320 : 0) + ($c >> 5)) << 1)) >>
                  1
              ] |
                0) <<
                2) +
                ($c & 31)) |
              0;
            break;
          }
          if ($c >>> 0 > 1114111) {
            $51 = ((HEAP32[($bdp + 32) >> 2] | 0) + 128) | 0;
            break;
          }
          if ((HEAP32[($bdp + 52) >> 2] | 0) > ($c | 0)) {
            $35 = HEAP32[($bdp + 20) >> 2] | 0;
            $51 =
              (((HEAPU16[
                ($35 +
                  (((HEAPU16[($35 + ((($c >> 11) + 2080) << 1)) >> 1] | 0) +
                    (($c >>> 5) & 63)) <<
                    1)) >>
                  1
              ] |
                0) <<
                2) +
                ($c & 31)) |
              0;
            break;
          } else {
            $51 = HEAP32[($bdp + 56) >> 2] | 0;
            break;
          }
        }
      while (0);
      return (
        (((HEAPU16[((HEAP32[($bdp + 20) >> 2] | 0) + ($51 << 1)) >> 1] | 0) >>>
          8) &
          3) |
        0
      );
    }
    function _ubidi_getClass_58($bdp, $c) {
      $bdp = $bdp | 0;
      $c = $c | 0;
      var $35 = 0,
        $51 = 0;
      do
        if ($c >>> 0 < 55296)
          $51 =
            (((HEAPU16[
              ((HEAP32[($bdp + 20) >> 2] | 0) + (($c >> 5) << 1)) >> 1
            ] |
              0) <<
              2) +
              ($c & 31)) |
            0;
        else {
          if ($c >>> 0 < 65536) {
            $51 =
              (((HEAPU16[
                ((HEAP32[($bdp + 20) >> 2] | 0) +
                  (((($c | 0) < 56320 ? 320 : 0) + ($c >> 5)) << 1)) >>
                  1
              ] |
                0) <<
                2) +
                ($c & 31)) |
              0;
            break;
          }
          if ($c >>> 0 > 1114111) {
            $51 = ((HEAP32[($bdp + 32) >> 2] | 0) + 128) | 0;
            break;
          }
          if ((HEAP32[($bdp + 52) >> 2] | 0) > ($c | 0)) {
            $35 = HEAP32[($bdp + 20) >> 2] | 0;
            $51 =
              (((HEAPU16[
                ($35 +
                  (((HEAPU16[($35 + ((($c >> 11) + 2080) << 1)) >> 1] | 0) +
                    (($c >>> 5) & 63)) <<
                    1)) >>
                  1
              ] |
                0) <<
                2) +
                ($c & 31)) |
              0;
            break;
          } else {
            $51 = HEAP32[($bdp + 56) >> 2] | 0;
            break;
          }
        }
      while (0);
      return (
        ((HEAPU16[((HEAP32[($bdp + 20) >> 2] | 0) + ($51 << 1)) >> 1] | 0) &
          31) |
        0
      );
    }
    function _bracketProcessBoundary(
      $bd,
      $lastCcPos,
      $contextLevel,
      $embeddingLevel,
    ) {
      $bd = $bd | 0;
      $lastCcPos = $lastCcPos | 0;
      $contextLevel = $contextLevel | 0;
      $embeddingLevel = $embeddingLevel | 0;
      var $1 = 0,
        $21 = 0,
        $23 = 0;
      $1 = HEAP32[($bd + 492) >> 2] | 0;
      if (
        !(
          (1 <<
            (HEAPU8[
              ((HEAP32[((HEAP32[$bd >> 2] | 0) + 76) >> 2] | 0) + $lastCcPos) >>
                0
            ] |
              0)) &
          7864320
        )
      ) {
        HEAP16[($bd + 496 + ($1 << 4) + 6) >> 1] =
          HEAP16[($bd + 496 + ($1 << 4) + 4) >> 1] | 0;
        HEAP8[($bd + 496 + ($1 << 4) + 8) >> 0] = $embeddingLevel;
        $21 =
          (($embeddingLevel & 127) >>> 0 > ($contextLevel & 127) >>> 0
            ? $embeddingLevel
            : $contextLevel) & 1;
        HEAP32[($bd + 496 + ($1 << 4) + 12) >> 2] = $21;
        $23 = $21 & 255;
        HEAP8[($bd + 496 + ($1 << 4) + 10) >> 0] = $23;
        HEAP8[($bd + 496 + ($1 << 4) + 9) >> 0] = $23;
        HEAP32[($bd + 496 + ($1 << 4)) >> 2] = $lastCcPos;
      }
      return;
    }
    function _bidi_getLine($start, $end) {
      $start = $start | 0;
      $end = $end | 0;
      var $$0 = 0,
        $0 = 0,
        $10 = 0,
        $2 = 0,
        $4 = 0,
        $7 = 0,
        $8 = 0,
        $errorCode = 0,
        sp = 0;
      sp = STACKTOP;
      STACKTOP = (STACKTOP + 16) | 0;
      $errorCode = sp;
      HEAP32[$errorCode >> 2] = 0;
      $0 = HEAP32[25] | 0;
      if (!$0) {
        $2 = _ubidi_open_58() | 0;
        HEAP32[25] = $2;
        $4 = $2;
      } else $4 = $0;
      _ubidi_setLine_58(HEAP32[24] | 0, $start, $end, $4, $errorCode);
      if ((HEAP32[$errorCode >> 2] | 0) > 0) $$0 = 0;
      else {
        $7 = _ubidi_getProcessedLength_58($4) | 0;
        $8 = ($7 + 1) | 0;
        $10 = _malloc($8 << 1) | 0;
        _ubidi_writeReordered_58(HEAP32[25] | 0, $10, $8, 10, $errorCode) | 0;
        if ((HEAP32[$errorCode >> 2] | 0) > 0) $$0 = 0;
        else {
          HEAP16[($10 + ($7 << 1)) >> 1] = 0;
          $$0 = $10;
        }
      }
      STACKTOP = sp;
      return $$0 | 0;
    }
    function _realloc($oldmem, $bytes) {
      $oldmem = $oldmem | 0;
      $bytes = $bytes | 0;
      var $12 = 0,
        $15 = 0,
        $20 = 0,
        $3 = 0,
        $9 = 0,
        $mem$0 = 0;
      if (!$oldmem) {
        $mem$0 = _malloc($bytes) | 0;
        return $mem$0 | 0;
      }
      if ($bytes >>> 0 > 4294967231) {
        $3 = ___errno_location() | 0;
        HEAP32[$3 >> 2] = 12;
        $mem$0 = 0;
        return $mem$0 | 0;
      }
      $9 =
        _try_realloc_chunk(
          ($oldmem + -8) | 0,
          $bytes >>> 0 < 11 ? 16 : ($bytes + 11) & -8,
        ) | 0;
      if ($9) {
        $mem$0 = ($9 + 8) | 0;
        return $mem$0 | 0;
      }
      $12 = _malloc($bytes) | 0;
      if (!$12) {
        $mem$0 = 0;
        return $mem$0 | 0;
      }
      $15 = HEAP32[($oldmem + -4) >> 2] | 0;
      $20 = (($15 & -8) - ((($15 & 3) | 0) == 0 ? 8 : 4)) | 0;
      _memcpy(
        $12 | 0,
        $oldmem | 0,
        ($20 >>> 0 < $bytes >>> 0 ? $20 : $bytes) | 0,
      ) | 0;
      _free($oldmem);
      $mem$0 = $12;
      return $mem$0 | 0;
    }
    function _ubidi_getParagraphByIndex_58(
      $pBiDi,
      $paraIndex,
      $pParaLimit,
      $pErrorCode,
    ) {
      $pBiDi = $pBiDi | 0;
      $paraIndex = $paraIndex | 0;
      $pParaLimit = $pParaLimit | 0;
      $pErrorCode = $pErrorCode | 0;
      var $4 = 0;
      L1: do
        if ($pErrorCode)
          if ((HEAP32[$pErrorCode >> 2] | 0) <= 0) {
            do
              if ($pBiDi) {
                $4 = HEAP32[$pBiDi >> 2] | 0;
                if (($4 | 0) != ($pBiDi | 0)) {
                  if (!$4) break;
                  if ((HEAP32[$4 >> 2] | 0) != ($4 | 0)) break;
                }
                if (($paraIndex | 0) >= 0)
                  if ((HEAP32[($pBiDi + 136) >> 2] | 0) > ($paraIndex | 0)) {
                    if (!$pParaLimit) break L1;
                    HEAP32[$pParaLimit >> 2] =
                      HEAP32[
                        ((HEAP32[($4 + 140) >> 2] | 0) + ($paraIndex << 3)) >> 2
                      ];
                    break L1;
                  }
                HEAP32[$pErrorCode >> 2] = 1;
                break L1;
              }
            while (0);
            HEAP32[$pErrorCode >> 2] = 27;
          }
      while (0);
      return;
    }
    function _ubidi_getMemory_58($bidiMem, $pSize, $mayAllocate, $sizeNeeded) {
      $bidiMem = $bidiMem | 0;
      $pSize = $pSize | 0;
      $mayAllocate = $mayAllocate | 0;
      $sizeNeeded = $sizeNeeded | 0;
      var $$0 = 0,
        $0 = 0,
        $3 = 0,
        $8 = 0;
      $0 = HEAP32[$bidiMem >> 2] | 0;
      if (!$0)
        if (!(($mayAllocate << 24) >> 24)) $$0 = 0;
        else {
          $3 = _uprv_malloc_58($sizeNeeded) | 0;
          HEAP32[$bidiMem >> 2] = $3;
          if (!$3) $$0 = 0;
          else {
            HEAP32[$pSize >> 2] = $sizeNeeded;
            $$0 = 1;
          }
        }
      else if ((HEAP32[$pSize >> 2] | 0) < ($sizeNeeded | 0))
        if (!(($mayAllocate << 24) >> 24)) $$0 = 0;
        else {
          $8 = _uprv_realloc_58($0, $sizeNeeded) | 0;
          if (!$8) $$0 = 0;
          else {
            HEAP32[$bidiMem >> 2] = $8;
            HEAP32[$pSize >> 2] = $sizeNeeded;
            $$0 = 1;
          }
        }
      else $$0 = 1;
      return $$0 | 0;
    }
    function _setLevelsOutsideIsolates(
      $pBiDi$0$20$val,
      $pBiDi$0$21$val,
      $start,
      $limit,
      $level,
    ) {
      $pBiDi$0$20$val = $pBiDi$0$20$val | 0;
      $pBiDi$0$21$val = $pBiDi$0$21$val | 0;
      $start = $start | 0;
      $limit = $limit | 0;
      $level = $level | 0;
      var $$isolateCount$0 = 0,
        $2 = 0,
        $isolateCount$01 = 0,
        $k$02 = 0;
      if (($start | 0) < ($limit | 0)) {
        $isolateCount$01 = 0;
        $k$02 = $start;
        while (1) {
          $2 = HEAP8[($pBiDi$0$20$val + $k$02) >> 0] | 0;
          $$isolateCount$0 =
            ((((($2 << 24) >> 24 == 22) << 31) >> 31) + $isolateCount$01) | 0;
          if (!$$isolateCount$0) HEAP8[($pBiDi$0$21$val + $k$02) >> 0] = $level;
          $k$02 = ($k$02 + 1) | 0;
          if (($k$02 | 0) == ($limit | 0)) break;
          else
            $isolateCount$01 =
              ($$isolateCount$0 + (((($2 & -2) << 24) >> 24 == 20) & 1)) | 0;
        }
      }
      return;
    }
    function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(
      $info,
      $adjustedPtr,
      $path_below,
    ) {
      $info = $info | 0;
      $adjustedPtr = $adjustedPtr | 0;
      $path_below = $path_below | 0;
      var $0 = 0,
        $1 = 0,
        $6 = 0,
        $9 = 0;
      $0 = ($info + 16) | 0;
      $1 = HEAP32[$0 >> 2] | 0;
      do
        if (!$1) {
          HEAP32[$0 >> 2] = $adjustedPtr;
          HEAP32[($info + 24) >> 2] = $path_below;
          HEAP32[($info + 36) >> 2] = 1;
        } else {
          if (($1 | 0) != ($adjustedPtr | 0)) {
            $9 = ($info + 36) | 0;
            HEAP32[$9 >> 2] = (HEAP32[$9 >> 2] | 0) + 1;
            HEAP32[($info + 24) >> 2] = 2;
            HEAP8[($info + 54) >> 0] = 1;
            break;
          }
          $6 = ($info + 24) | 0;
          if ((HEAP32[$6 >> 2] | 0) == 2) HEAP32[$6 >> 2] = $path_below;
        }
      while (0);
      return;
    }
    function __ZL11countSpacesPtijPiS0_(
      $dest,
      $size,
      $spacesCountl,
      $spacesCountr,
    ) {
      $dest = $dest | 0;
      $size = $size | 0;
      $spacesCountl = $spacesCountl | 0;
      $spacesCountr = $spacesCountr | 0;
      var $$0 = 0,
        $3 = 0,
        $countr$0 = 0,
        $countr$1 = 0,
        $i$0 = 0;
      $i$0 = 0;
      while (1) {
        $3 = ($i$0 | 0) < ($size | 0);
        if ($3 & ((HEAP16[($dest + ($i$0 << 1)) >> 1] | 0) == 32))
          $i$0 = ($i$0 + 1) | 0;
        else break;
      }
      if ($3) {
        $$0 = $size;
        $countr$0 = 0;
        while (1) {
          $$0 = ($$0 + -1) | 0;
          if ((HEAP16[($dest + ($$0 << 1)) >> 1] | 0) != 32) {
            $countr$1 = $countr$0;
            break;
          } else $countr$0 = ($countr$0 + 1) | 0;
        }
      } else $countr$1 = 0;
      HEAP32[$spacesCountl >> 2] = $i$0;
      HEAP32[$spacesCountr >> 2] = $countr$1;
      return;
    }
    function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib(
      $this,
      $info,
      $dst_ptr,
      $current_ptr,
      $path_below,
      $use_strcmp,
    ) {
      $this = $this | 0;
      $info = $info | 0;
      $dst_ptr = $dst_ptr | 0;
      $current_ptr = $current_ptr | 0;
      $path_below = $path_below | 0;
      $use_strcmp = $use_strcmp | 0;
      var $4 = 0;
      if (($this | 0) == (HEAP32[($info + 8) >> 2] | 0))
        __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(
          $info,
          $dst_ptr,
          $current_ptr,
          $path_below,
        );
      else {
        $4 = HEAP32[($this + 8) >> 2] | 0;
        FUNCTION_TABLE_viiiiii[HEAP32[((HEAP32[$4 >> 2] | 0) + 20) >> 2] & 3](
          $4,
          $info,
          $dst_ptr,
          $current_ptr,
          $path_below,
          $use_strcmp,
        );
      }
      return;
    }
    function _ubidi_getParaLevelAtIndex_58(
      $pBiDi$0$37$val,
      $pBiDi$0$38$val,
      $pindex,
    ) {
      $pBiDi$0$37$val = $pBiDi$0$37$val | 0;
      $pBiDi$0$38$val = $pBiDi$0$38$val | 0;
      $pindex = $pindex | 0;
      var $4 = 0,
        $7 = 0,
        $i$06 = 0,
        $i$09 = 0;
      L1: do
        if (($pBiDi$0$37$val | 0) > 0) {
          $i$09 = 0;
          while (1) {
            if (
              (HEAP32[($pBiDi$0$38$val + ($i$09 << 3)) >> 2] | 0) >
              ($pindex | 0)
            ) {
              $7 = 1;
              $i$06 = $i$09;
              break L1;
            }
            $4 = ($i$09 + 1) | 0;
            if (($4 | 0) < ($pBiDi$0$37$val | 0)) $i$09 = $4;
            else {
              $7 = 0;
              $i$06 = $4;
              break;
            }
          }
        } else {
          $7 = 0;
          $i$06 = 0;
        }
      while (0);
      return (
        (HEAP32[
          ($pBiDi$0$38$val +
            (($7 ? $i$06 : ($pBiDi$0$37$val + -1) | 0) << 3) +
            4) >>
            2
        ] &
          255) |
        0
      );
    }
    function runPostSets() {}
    function _memset(ptr, value, num) {
      ptr = ptr | 0;
      value = value | 0;
      num = num | 0;
      var stop = 0,
        value4 = 0,
        stop4 = 0,
        unaligned = 0;
      stop = (ptr + num) | 0;
      if ((num | 0) >= 20) {
        value = value & 255;
        unaligned = ptr & 3;
        value4 = value | (value << 8) | (value << 16) | (value << 24);
        stop4 = stop & ~3;
        if (unaligned) {
          unaligned = (ptr + 4 - unaligned) | 0;
          while ((ptr | 0) < (unaligned | 0)) {
            HEAP8[ptr >> 0] = value;
            ptr = (ptr + 1) | 0;
          }
        }
        while ((ptr | 0) < (stop4 | 0)) {
          HEAP32[ptr >> 2] = value4;
          ptr = (ptr + 4) | 0;
        }
      }
      while ((ptr | 0) < (stop | 0)) {
        HEAP8[ptr >> 0] = value;
        ptr = (ptr + 1) | 0;
      }
      return (ptr - num) | 0;
    }
    function _memcpy(dest, src, num) {
      dest = dest | 0;
      src = src | 0;
      num = num | 0;
      var ret = 0;
      if ((num | 0) >= 4096)
        return _emscripten_memcpy_big(dest | 0, src | 0, num | 0) | 0;
      ret = dest | 0;
      if ((dest & 3) == (src & 3)) {
        while (dest & 3) {
          if (!num) return ret | 0;
          HEAP8[dest >> 0] = HEAP8[src >> 0] | 0;
          dest = (dest + 1) | 0;
          src = (src + 1) | 0;
          num = (num - 1) | 0;
        }
        while ((num | 0) >= 4) {
          HEAP32[dest >> 2] = HEAP32[src >> 2];
          dest = (dest + 4) | 0;
          src = (src + 4) | 0;
          num = (num - 4) | 0;
        }
      }
      while ((num | 0) > 0) {
        HEAP8[dest >> 0] = HEAP8[src >> 0] | 0;
        dest = (dest + 1) | 0;
        src = (src + 1) | 0;
        num = (num - 1) | 0;
      }
      return ret | 0;
    }
    function _ubidi_close_58($pBiDi) {
      $pBiDi = $pBiDi | 0;
      var $11 = 0,
        $14 = 0,
        $17 = 0,
        $2 = 0,
        $20 = 0,
        $5 = 0,
        $8 = 0;
      if ($pBiDi) {
        HEAP32[$pBiDi >> 2] = 0;
        $2 = HEAP32[($pBiDi + 48) >> 2] | 0;
        if ($2) _uprv_free_58($2);
        $5 = HEAP32[($pBiDi + 52) >> 2] | 0;
        if ($5) _uprv_free_58($5);
        $8 = HEAP32[($pBiDi + 56) >> 2] | 0;
        if ($8) _uprv_free_58($8);
        $11 = HEAP32[($pBiDi + 60) >> 2] | 0;
        if ($11) _uprv_free_58($11);
        $14 = HEAP32[($pBiDi + 64) >> 2] | 0;
        if ($14) _uprv_free_58($14);
        $17 = HEAP32[($pBiDi + 68) >> 2] | 0;
        if ($17) _uprv_free_58($17);
        $20 = HEAP32[($pBiDi + 348) >> 2] | 0;
        if ($20) _uprv_free_58($20);
        _uprv_free_58($pBiDi);
      }
      return;
    }
    function _ubidi_getPairedBracket_58($c) {
      $c = $c | 0;
      var $$0 = 0,
        $35 = 0,
        $36 = 0;
      do
        if ($c >>> 0 < 55296)
          $35 =
            (((HEAPU16[(43702 + (($c >> 5) << 1)) >> 1] | 0) << 2) +
              ($c & 31)) |
            0;
        else {
          if ($c >>> 0 < 65536) {
            $35 =
              (((HEAPU16[
                (43702 + (((($c | 0) < 56320 ? 320 : 0) + ($c >> 5)) << 1)) >> 1
              ] |
                0) <<
                2) +
                ($c & 31)) |
              0;
            break;
          }
          if ($c >>> 0 > 1114111) $35 = 3624;
          else
            $35 =
              (((HEAPU16[
                (43702 +
                  (((HEAPU16[(43702 + ((($c >> 11) + 2080) << 1)) >> 1] | 0) +
                    (($c >>> 5) & 63)) <<
                    1)) >>
                  1
              ] |
                0) <<
                2) +
                ($c & 31)) |
              0;
        }
      while (0);
      $36 = HEAP16[(43702 + ($35 << 1)) >> 1] | 0;
      if (!($36 & 768)) $$0 = $c;
      else $$0 = _getMirror($c, $36) | 0;
      return $$0 | 0;
    }
    function _ubidi_countRuns_58($pBiDi, $pErrorCode) {
      $pBiDi = $pBiDi | 0;
      $pErrorCode = $pErrorCode | 0;
      var $$0 = 0,
        $4 = 0;
      L1: do
        if (!$pErrorCode) $$0 = -1;
        else if ((HEAP32[$pErrorCode >> 2] | 0) > 0) $$0 = -1;
        else {
          do
            if ($pBiDi) {
              $4 = HEAP32[$pBiDi >> 2] | 0;
              if (($4 | 0) != ($pBiDi | 0)) {
                if (!$4) break;
                if ((HEAP32[$4 >> 2] | 0) != ($4 | 0)) break;
              }
              _ubidi_getRuns_58($pBiDi, $pErrorCode);
              if ((HEAP32[$pErrorCode >> 2] | 0) > 0) {
                $$0 = -1;
                break L1;
              }
              $$0 = HEAP32[($pBiDi + 224) >> 2] | 0;
              break L1;
            }
          while (0);
          HEAP32[$pErrorCode >> 2] = 27;
          $$0 = -1;
        }
      while (0);
      return $$0 | 0;
    }
    function _u_terminateUChars_58($dest, $destCapacity, $length, $pErrorCode) {
      $dest = $dest | 0;
      $destCapacity = $destCapacity | 0;
      $length = $length | 0;
      $pErrorCode = $pErrorCode | 0;
      do
        if ($pErrorCode)
          if (!((($length | 0) < 0) | ((HEAP32[$pErrorCode >> 2] | 0) > 0))) {
            if (($length | 0) < ($destCapacity | 0)) {
              HEAP16[($dest + ($length << 1)) >> 1] = 0;
              if ((HEAP32[$pErrorCode >> 2] | 0) != -124) break;
              HEAP32[$pErrorCode >> 2] = 0;
              break;
            }
            if (($length | 0) == ($destCapacity | 0)) {
              HEAP32[$pErrorCode >> 2] = -124;
              break;
            } else {
              HEAP32[$pErrorCode >> 2] = 15;
              break;
            }
          }
      while (0);
      return $length | 0;
    }
    function _ushape_arabic($input, $input_length) {
      $input = $input | 0;
      $input_length = $input_length | 0;
      var $$0 = 0,
        $0 = 0,
        $1 = 0,
        $3 = 0,
        $errorCode = 0,
        sp = 0;
      sp = STACKTOP;
      STACKTOP = (STACKTOP + 16) | 0;
      $errorCode = sp;
      HEAP32[$errorCode >> 2] = 0;
      $0 = _u_shapeArabic_58($input, $input_length, 0, 0, $errorCode) | 0;
      $1 = ($0 + 1) | 0;
      HEAP32[$errorCode >> 2] = 0;
      $3 = _malloc($1 << 1) | 0;
      _u_shapeArabic_58($input, $input_length, $3, $1, $errorCode) | 0;
      if ((HEAP32[$errorCode >> 2] | 0) > 0) {
        _free($3);
        $$0 = 0;
      } else {
        HEAP16[($3 + ($0 << 1)) >> 1] = 0;
        $$0 = $3;
      }
      STACKTOP = sp;
      return $$0 | 0;
    }
    function __ZL12invertBufferPtijii($buffer, $size, $lowlimit, $highlimit) {
      $buffer = $buffer | 0;
      $size = $size | 0;
      $lowlimit = $lowlimit | 0;
      $highlimit = $highlimit | 0;
      var $2 = 0,
        $3 = 0,
        $4 = 0,
        $i$02 = 0,
        $j$01 = 0,
        $j$03 = 0;
      $j$01 = ($size - $highlimit + -1) | 0;
      if (($j$01 | 0) > ($lowlimit | 0)) {
        $i$02 = $lowlimit;
        $j$03 = $j$01;
      } else return;
      do {
        $2 = ($buffer + ($i$02 << 1)) | 0;
        $3 = HEAP16[$2 >> 1] | 0;
        $4 = ($buffer + ($j$03 << 1)) | 0;
        HEAP16[$2 >> 1] = HEAP16[$4 >> 1] | 0;
        HEAP16[$4 >> 1] = $3;
        $i$02 = ($i$02 + 1) | 0;
        $j$03 = ($j$03 + -1) | 0;
      } while (($i$02 | 0) < ($j$03 | 0));
      return;
    }
    function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi(
      $this,
      $info,
      $adjustedPtr,
      $path_below,
    ) {
      $this = $this | 0;
      $info = $info | 0;
      $adjustedPtr = $adjustedPtr | 0;
      $path_below = $path_below | 0;
      var $4 = 0;
      if (($this | 0) == (HEAP32[($info + 8) >> 2] | 0))
        __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(
          $info,
          $adjustedPtr,
          $path_below,
        );
      else {
        $4 = HEAP32[($this + 8) >> 2] | 0;
        FUNCTION_TABLE_viiii[HEAP32[((HEAP32[$4 >> 2] | 0) + 28) >> 2] & 3](
          $4,
          $info,
          $adjustedPtr,
          $path_below,
        );
      }
      return;
    }
    function _bidi_processText($input, $input_length) {
      $input = $input | 0;
      $input_length = $input_length | 0;
      var $$0 = 0,
        $0 = 0,
        $2 = 0,
        $3 = 0,
        $errorCode = 0,
        sp = 0;
      sp = STACKTOP;
      STACKTOP = (STACKTOP + 16) | 0;
      $errorCode = sp;
      $0 = HEAP32[24] | 0;
      if (!$0) {
        $2 = _ubidi_open_58() | 0;
        HEAP32[24] = $2;
        $3 = $2;
      } else $3 = $0;
      HEAP32[$errorCode >> 2] = 0;
      _ubidi_setPara_58($3, $input, $input_length, -2, $errorCode);
      if ((HEAP32[$errorCode >> 2] | 0) > 0) $$0 = 0;
      else $$0 = _ubidi_countParagraphs_58(HEAP32[24] | 0) | 0;
      STACKTOP = sp;
      return $$0 | 0;
    }
    function _ubidi_getMirror_58($c) {
      $c = $c | 0;
      var $35 = 0;
      do
        if ($c >>> 0 < 55296)
          $35 =
            (((HEAPU16[(43702 + (($c >> 5) << 1)) >> 1] | 0) << 2) +
              ($c & 31)) |
            0;
        else {
          if ($c >>> 0 < 65536) {
            $35 =
              (((HEAPU16[
                (43702 + (((($c | 0) < 56320 ? 320 : 0) + ($c >> 5)) << 1)) >> 1
              ] |
                0) <<
                2) +
                ($c & 31)) |
              0;
            break;
          }
          if ($c >>> 0 > 1114111) $35 = 3624;
          else
            $35 =
              (((HEAPU16[
                (43702 +
                  (((HEAPU16[(43702 + ((($c >> 11) + 2080) << 1)) >> 1] | 0) +
                    (($c >>> 5) & 63)) <<
                    1)) >>
                  1
              ] |
                0) <<
                2) +
                ($c & 31)) |
              0;
        }
      while (0);
      return _getMirror($c, HEAP16[(43702 + ($35 << 1)) >> 1] | 0) | 0;
    }
    function _getMirror($c, $props) {
      $c = $c | 0;
      $props = $props | 0;
      var $$0 = 0,
        $1 = 0,
        $6 = 0,
        $7 = 0,
        $i$0 = 0;
      $1 = (($props << 16) >> 16) >> 13;
      L1: do
        if (($1 | 0) == -4) {
          $i$0 = 0;
          while (1) {
            if (($i$0 | 0) >= 26) {
              $$0 = $c;
              break L1;
            }
            $6 = HEAP32[(424 + ($i$0 << 2)) >> 2] | 0;
            $7 = $6 & 2097151;
            if (($7 | 0) == ($c | 0)) break;
            if (($7 | 0) > ($c | 0)) {
              $$0 = $c;
              break L1;
            } else $i$0 = ($i$0 + 1) | 0;
          }
          $$0 = HEAP32[(424 + (($6 >>> 21) << 2)) >> 2] & 2097151;
        } else $$0 = ($1 + $c) | 0;
      while (0);
      return $$0 | 0;
    }
    function __ZL7getLinkt($ch) {
      $ch = $ch | 0;
      var $$0 = 0,
        $0 = 0;
      $0 = $ch & 65535;
      if ((($ch + -1570) & 65535) < 178) {
        $$0 = HEAP16[(1786 + (($0 + -1570) << 1)) >> 1] | 0;
        return $$0 | 0;
      }
      if (($ch << 16) >> 16 == 8205) {
        $$0 = 3;
        return $$0 | 0;
      }
      if ((($ch + -8301) & 65535) < 3) {
        $$0 = 4;
        return $$0 | 0;
      }
      if ((($ch + 1200) & 65535) < 275) {
        $$0 = HEAPU8[(67877 + ($0 + -64336)) >> 0] | 0;
        return $$0 | 0;
      }
      if ((($ch + 400) & 65535) >= 141) {
        $$0 = 0;
        return $$0 | 0;
      }
      $$0 = HEAPU8[(68152 + ($0 + -65136)) >> 0] | 0;
      return $$0 | 0;
    }
    function _u_charType_58($c) {
      $c = $c | 0;
      var $35 = 0;
      do
        if ($c >>> 0 < 55296)
          $35 =
            (((HEAPU16[(2142 + (($c >> 5) << 1)) >> 1] | 0) << 2) + ($c & 31)) |
            0;
        else {
          if ($c >>> 0 < 65536) {
            $35 =
              (((HEAPU16[
                (2142 + (((($c | 0) < 56320 ? 320 : 0) + ($c >> 5)) << 1)) >> 1
              ] |
                0) <<
                2) +
                ($c & 31)) |
              0;
            break;
          }
          if ($c >>> 0 > 1114111) $35 = 4536;
          else
            $35 =
              (((HEAPU16[
                (2142 +
                  (((HEAPU16[(2142 + ((($c >> 11) + 2080) << 1)) >> 1] | 0) +
                    (($c >>> 5) & 63)) <<
                    1)) >>
                  1
              ] |
                0) <<
                2) +
                ($c & 31)) |
              0;
        }
      while (0);
      return ((HEAPU16[(2142 + ($35 << 1)) >> 1] | 0) & 31) | 0;
    }
    function _ubidi_openSized_58($pErrorCode) {
      $pErrorCode = $pErrorCode | 0;
      var $$0 = 0,
        $3 = 0;
      do
        if (!$pErrorCode) $$0 = 0;
        else if ((HEAP32[$pErrorCode >> 2] | 0) > 0) $$0 = 0;
        else {
          $3 = _uprv_malloc_58(364) | 0;
          if (!$3) {
            HEAP32[$pErrorCode >> 2] = 7;
            $$0 = 0;
            break;
          }
          _memset($3 | 0, 0, 364) | 0;
          HEAP32[($3 + 4) >> 2] = 280;
          HEAP8[($3 + 72) >> 0] = 1;
          HEAP8[($3 + 73) >> 0] = 1;
          if ((HEAP32[$pErrorCode >> 2] | 0) < 1) $$0 = $3;
          else {
            _ubidi_close_58($3);
            $$0 = 0;
          }
        }
      while (0);
      return $$0 | 0;
    }
    function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib(
      $this,
      $info,
      $dst_ptr,
      $current_ptr,
      $path_below,
      $use_strcmp,
    ) {
      $this = $this | 0;
      $info = $info | 0;
      $dst_ptr = $dst_ptr | 0;
      $current_ptr = $current_ptr | 0;
      $path_below = $path_below | 0;
      $use_strcmp = $use_strcmp | 0;
      if (($this | 0) == (HEAP32[($info + 8) >> 2] | 0))
        __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(
          $info,
          $dst_ptr,
          $current_ptr,
          $path_below,
        );
      return;
    }
    function _bidi_getParagraphEndIndex($paragraphIndex) {
      $paragraphIndex = $paragraphIndex | 0;
      var $errorCode = 0,
        $paragraphEndIndex = 0,
        sp = 0;
      sp = STACKTOP;
      STACKTOP = (STACKTOP + 16) | 0;
      $errorCode = (sp + 4) | 0;
      $paragraphEndIndex = sp;
      HEAP32[$errorCode >> 2] = 0;
      HEAP32[$paragraphEndIndex >> 2] = 0;
      _ubidi_getParagraphByIndex_58(
        HEAP32[24] | 0,
        $paragraphIndex,
        $paragraphEndIndex,
        $errorCode,
      );
      STACKTOP = sp;
      return (
        ((HEAP32[$errorCode >> 2] | 0) > 0
          ? 0
          : HEAP32[$paragraphEndIndex >> 2] | 0) | 0
      );
    }
    function ___cxa_can_catch($catchType, $excpType, $thrown) {
      $catchType = $catchType | 0;
      $excpType = $excpType | 0;
      $thrown = $thrown | 0;
      var $4 = 0,
        $temp = 0,
        sp = 0;
      sp = STACKTOP;
      STACKTOP = (STACKTOP + 16) | 0;
      $temp = sp;
      HEAP32[$temp >> 2] = HEAP32[$thrown >> 2];
      $4 =
        FUNCTION_TABLE_iiii[
          HEAP32[((HEAP32[$catchType >> 2] | 0) + 16) >> 2] & 1
        ]($catchType, $excpType, $temp) | 0;
      if ($4) HEAP32[$thrown >> 2] = HEAP32[$temp >> 2];
      STACKTOP = sp;
      return ($4 & 1) | 0;
    }
    function copyTempDouble(ptr) {
      ptr = ptr | 0;
      HEAP8[tempDoublePtr >> 0] = HEAP8[ptr >> 0];
      HEAP8[(tempDoublePtr + 1) >> 0] = HEAP8[(ptr + 1) >> 0];
      HEAP8[(tempDoublePtr + 2) >> 0] = HEAP8[(ptr + 2) >> 0];
      HEAP8[(tempDoublePtr + 3) >> 0] = HEAP8[(ptr + 3) >> 0];
      HEAP8[(tempDoublePtr + 4) >> 0] = HEAP8[(ptr + 4) >> 0];
      HEAP8[(tempDoublePtr + 5) >> 0] = HEAP8[(ptr + 5) >> 0];
      HEAP8[(tempDoublePtr + 6) >> 0] = HEAP8[(ptr + 6) >> 0];
      HEAP8[(tempDoublePtr + 7) >> 0] = HEAP8[(ptr + 7) >> 0];
    }
    function _ubidi_getCustomizedClass_58($pBiDi, $c) {
      $pBiDi = $pBiDi | 0;
      $c = $c | 0;
      var $1 = 0,
        $5 = 0,
        $dir$0 = 0,
        label = 0;
      $1 = HEAP32[($pBiDi + 356) >> 2] | 0;
      if (!$1) label = 3;
      else {
        $5 =
          FUNCTION_TABLE_iii[$1 & 0](HEAP32[($pBiDi + 360) >> 2] | 0, $c) | 0;
        if (($5 | 0) == 23) label = 3;
        else $dir$0 = $5;
      }
      if ((label | 0) == 3)
        $dir$0 = _ubidi_getClass_58(HEAP32[($pBiDi + 4) >> 2] | 0, $c) | 0;
      return ($dir$0 >>> 0 > 22 ? 10 : $dir$0) | 0;
    }
    function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi(
      $this,
      $info,
      $adjustedPtr,
      $path_below,
    ) {
      $this = $this | 0;
      $info = $info | 0;
      $adjustedPtr = $adjustedPtr | 0;
      $path_below = $path_below | 0;
      if (($this | 0) == (HEAP32[($info + 8) >> 2] | 0))
        __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(
          $info,
          $adjustedPtr,
          $path_below,
        );
      return;
    }
    function _ubidi_getProcessedLength_58($pBiDi) {
      $pBiDi = $pBiDi | 0;
      var $$0 = 0,
        $1 = 0;
      do
        if (!$pBiDi) $$0 = 0;
        else {
          $1 = HEAP32[$pBiDi >> 2] | 0;
          if (($1 | 0) != ($pBiDi | 0)) {
            if (!$1) {
              $$0 = 0;
              break;
            }
            if ((HEAP32[$1 >> 2] | 0) != ($1 | 0)) {
              $$0 = 0;
              break;
            }
          }
          $$0 = HEAP32[($pBiDi + 16) >> 2] | 0;
        }
      while (0);
      return $$0 | 0;
    }
    function _ubidi_countParagraphs_58($pBiDi) {
      $pBiDi = $pBiDi | 0;
      var $$0 = 0,
        $1 = 0;
      do
        if (!$pBiDi) $$0 = 0;
        else {
          $1 = HEAP32[$pBiDi >> 2] | 0;
          if (($1 | 0) != ($pBiDi | 0)) {
            if (!$1) {
              $$0 = 0;
              break;
            }
            if ((HEAP32[$1 >> 2] | 0) != ($1 | 0)) {
              $$0 = 0;
              break;
            }
          }
          $$0 = HEAP32[($pBiDi + 136) >> 2] | 0;
        }
      while (0);
      return $$0 | 0;
    }
    function _directionFromFlags($pBiDi$0$34$val) {
      $pBiDi$0$34$val = $pBiDi$0$34$val | 0;
      var $$0 = 0,
        label = 0;
      if (!($pBiDi$0$34$val & 2154498))
        if (
          ((($pBiDi$0$34$val & 32) | 0) == 0) |
          ((($pBiDi$0$34$val & 8249304) | 0) == 0)
        )
          $$0 = 0;
        else label = 3;
      else label = 3;
      if ((label | 0) == 3)
        $$0 = (($pBiDi$0$34$val & 26220581) | 0) == 0 ? 1 : 2;
      return $$0 | 0;
    }
    function _uprv_realloc_58($buffer, $size) {
      $buffer = $buffer | 0;
      $size = $size | 0;
      var $$0 = 0;
      do
        if (($buffer | 0) == 256) $$0 = _uprv_malloc_58($size) | 0;
        else if (!$size) {
          _free($buffer);
          $$0 = 256;
          break;
        } else {
          $$0 = _realloc($buffer, $size) | 0;
          break;
        }
      while (0);
      return $$0 | 0;
    }
    function copyTempFloat(ptr) {
      ptr = ptr | 0;
      HEAP8[tempDoublePtr >> 0] = HEAP8[ptr >> 0];
      HEAP8[(tempDoublePtr + 1) >> 0] = HEAP8[(ptr + 1) >> 0];
      HEAP8[(tempDoublePtr + 2) >> 0] = HEAP8[(ptr + 2) >> 0];
      HEAP8[(tempDoublePtr + 3) >> 0] = HEAP8[(ptr + 3) >> 0];
    }
    function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
      index = index | 0;
      a1 = a1 | 0;
      a2 = a2 | 0;
      a3 = a3 | 0;
      a4 = a4 | 0;
      a5 = a5 | 0;
      a6 = a6 | 0;
      FUNCTION_TABLE_viiiiii[index & 3](
        a1 | 0,
        a2 | 0,
        a3 | 0,
        a4 | 0,
        a5 | 0,
        a6 | 0,
      );
    }
    function _ubidi_open_58() {
      var $0 = 0,
        $errorCode = 0,
        sp = 0;
      sp = STACKTOP;
      STACKTOP = (STACKTOP + 16) | 0;
      $errorCode = sp;
      HEAP32[$errorCode >> 2] = 0;
      $0 = _ubidi_openSized_58($errorCode) | 0;
      STACKTOP = sp;
      return $0 | 0;
    }
    function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
      index = index | 0;
      a1 = a1 | 0;
      a2 = a2 | 0;
      a3 = a3 | 0;
      a4 = a4 | 0;
      a5 = a5 | 0;
      FUNCTION_TABLE_viiiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0);
    }
    function dynCall_viiii(index, a1, a2, a3, a4) {
      index = index | 0;
      a1 = a1 | 0;
      a2 = a2 | 0;
      a3 = a3 | 0;
      a4 = a4 | 0;
      FUNCTION_TABLE_viiii[index & 3](a1 | 0, a2 | 0, a3 | 0, a4 | 0);
    }
    function ___errno_location() {
      var $$0 = 0,
        $3 = 0;
      if (!(HEAP32[152] | 0)) $$0 = 652;
      else {
        $3 = ((_pthread_self() | 0) + 60) | 0;
        $$0 = HEAP32[$3 >> 2] | 0;
      }
      return $$0 | 0;
    }
    function dynCall_iiii(index, a1, a2, a3) {
      index = index | 0;
      a1 = a1 | 0;
      a2 = a2 | 0;
      a3 = a3 | 0;
      return FUNCTION_TABLE_iiii[index & 1](a1 | 0, a2 | 0, a3 | 0) | 0;
    }
    function ___cxa_is_pointer_type($type) {
      $type = $type | 0;
      var $3 = 0;
      if (!$type) $3 = 0;
      else $3 = (___dynamic_cast($type, 64) | 0) != 0;
      return ($3 & 1) | 0;
    }
    function stackAlloc(size) {
      size = size | 0;
      var ret = 0;
      ret = STACKTOP;
      STACKTOP = (STACKTOP + size) | 0;
      STACKTOP = (STACKTOP + 15) & -16;
      return ret | 0;
    }
    function establishStackSpace(stackBase, stackMax) {
      stackBase = stackBase | 0;
      stackMax = stackMax | 0;
      STACKTOP = stackBase;
      STACK_MAX = stackMax;
    }
    function dynCall_iii(index, a1, a2) {
      index = index | 0;
      a1 = a1 | 0;
      a2 = a2 | 0;
      return FUNCTION_TABLE_iii[index & 0](a1 | 0, a2 | 0) | 0;
    }
    function setThrew(threw, value) {
      threw = threw | 0;
      value = value | 0;
      if (!__THREW__) {
        __THREW__ = threw;
        threwValue = value;
      }
    }
    function __ZL18expandCompositCharPtiijP10UErrorCodei15uShapeVariables(
      $destSize,
    ) {
      $destSize = $destSize | 0;
      return $destSize | 0;
    }
    function b3(p0, p1, p2, p3, p4, p5) {
      p0 = p0 | 0;
      p1 = p1 | 0;
      p2 = p2 | 0;
      p3 = p3 | 0;
      p4 = p4 | 0;
      p5 = p5 | 0;
      abort(3);
    }
    function _uprv_malloc_58($s) {
      $s = $s | 0;
      var $$0 = 0;
      if (!$s) $$0 = 256;
      else $$0 = _malloc($s) | 0;
      return $$0 | 0;
    }
    function b0(p0, p1, p2, p3, p4) {
      p0 = p0 | 0;
      p1 = p1 | 0;
      p2 = p2 | 0;
      p3 = p3 | 0;
      p4 = p4 | 0;
      abort(0);
    }
    function _uprv_free_58($buffer) {
      $buffer = $buffer | 0;
      if (($buffer | 0) != 256) _free($buffer);
      return;
    }
    function __ZN10__cxxabiv120__si_class_type_infoD0Ev($this) {
      $this = $this | 0;
      __ZdlPv($this);
      return;
    }
    function dynCall_vi(index, a1) {
      index = index | 0;
      a1 = a1 | 0;
      FUNCTION_TABLE_vi[index & 7](a1 | 0);
    }
    function __ZN10__cxxabiv117__class_type_infoD0Ev($this) {
      $this = $this | 0;
      __ZdlPv($this);
      return;
    }
    function b5(p0, p1, p2, p3) {
      p0 = p0 | 0;
      p1 = p1 | 0;
      p2 = p2 | 0;
      p3 = p3 | 0;
      abort(5);
    }
    function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($this) {
      $this = $this | 0;
      return;
    }
    function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($this) {
      $this = $this | 0;
      return;
    }
    function b2(p0, p1, p2) {
      p0 = p0 | 0;
      p1 = p1 | 0;
      p2 = p2 | 0;
      abort(2);
      return 0;
    }
    function __ZN10__cxxabiv116__shim_type_infoD2Ev($this) {
      $this = $this | 0;
      return;
    }
    function b4(p0, p1) {
      p0 = p0 | 0;
      p1 = p1 | 0;
      abort(4);
      return 0;
    }
    function setTempRet0(value) {
      value = value | 0;
      tempRet0 = value;
    }
    function __ZdlPv($ptr) {
      $ptr = $ptr | 0;
      _free($ptr);
      return;
    }
    function stackRestore(top) {
      top = top | 0;
      STACKTOP = top;
    }
    function getTempRet0() {
      return tempRet0 | 0;
    }
    function stackSave() {
      return STACKTOP | 0;
    }
    function b1(p0) {
      p0 = p0 | 0;
      abort(1);
    }
    var FUNCTION_TABLE_viiiii = [
      b0,
      __ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,
      __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,
      b0,
    ];
    var FUNCTION_TABLE_vi = [
      b1,
      __ZN10__cxxabiv116__shim_type_infoD2Ev,
      __ZN10__cxxabiv117__class_type_infoD0Ev,
      __ZNK10__cxxabiv116__shim_type_info5noop1Ev,
      __ZNK10__cxxabiv116__shim_type_info5noop2Ev,
      __ZN10__cxxabiv120__si_class_type_infoD0Ev,
      b1,
      b1,
    ];
    var FUNCTION_TABLE_iiii = [
      b2,
      __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,
    ];
    var FUNCTION_TABLE_viiiiii = [
      b3,
      __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,
      __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,
      b3,
    ];
    var FUNCTION_TABLE_iii = [b4];
    var FUNCTION_TABLE_viiii = [
      b5,
      __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,
      __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,
      b5,
    ];
    return {
      _bidi_getParagraphEndIndex: _bidi_getParagraphEndIndex,
      ___cxa_can_catch: ___cxa_can_catch,
      _free: _free,
      ___cxa_is_pointer_type: ___cxa_is_pointer_type,
      _memset: _memset,
      _malloc: _malloc,
      _memcpy: _memcpy,
      _bidi_getLine: _bidi_getLine,
      _ushape_arabic: _ushape_arabic,
      _bidi_processText: _bidi_processText,
      runPostSets: runPostSets,
      _emscripten_replace_memory: _emscripten_replace_memory,
      stackAlloc: stackAlloc,
      stackSave: stackSave,
      stackRestore: stackRestore,
      establishStackSpace: establishStackSpace,
      setThrew: setThrew,
      setTempRet0: setTempRet0,
      getTempRet0: getTempRet0,
      dynCall_viiiii: dynCall_viiiii,
      dynCall_vi: dynCall_vi,
      dynCall_iiii: dynCall_iiii,
      dynCall_viiiiii: dynCall_viiiiii,
      dynCall_iii: dynCall_iii,
      dynCall_viiii: dynCall_viiii,
    };
  })(Module.asmGlobalArg, Module.asmLibraryArg, buffer);
  var _bidi_getParagraphEndIndex = (Module['_bidi_getParagraphEndIndex'] =
    asm['_bidi_getParagraphEndIndex']);
  var ___cxa_can_catch = (Module['___cxa_can_catch'] = asm['___cxa_can_catch']);
  var _free = (Module['_free'] = asm['_free']);
  var runPostSets = (Module['runPostSets'] = asm['runPostSets']);
  var ___cxa_is_pointer_type = (Module['___cxa_is_pointer_type'] =
    asm['___cxa_is_pointer_type']);
  var _bidi_getLine = (Module['_bidi_getLine'] = asm['_bidi_getLine']);
  var _memset = (Module['_memset'] = asm['_memset']);
  var _malloc = (Module['_malloc'] = asm['_malloc']);
  var _memcpy = (Module['_memcpy'] = asm['_memcpy']);
  var _ushape_arabic = (Module['_ushape_arabic'] = asm['_ushape_arabic']);
  var _emscripten_replace_memory = (Module['_emscripten_replace_memory'] =
    asm['_emscripten_replace_memory']);
  var _bidi_processText = (Module['_bidi_processText'] =
    asm['_bidi_processText']);
  var dynCall_viiiii = (Module['dynCall_viiiii'] = asm['dynCall_viiiii']);
  var dynCall_vi = (Module['dynCall_vi'] = asm['dynCall_vi']);
  var dynCall_iiii = (Module['dynCall_iiii'] = asm['dynCall_iiii']);
  var dynCall_viiiiii = (Module['dynCall_viiiiii'] = asm['dynCall_viiiiii']);
  var dynCall_iii = (Module['dynCall_iii'] = asm['dynCall_iii']);
  var dynCall_viiii = (Module['dynCall_viiii'] = asm['dynCall_viiii']);
  Runtime.stackAlloc = asm['stackAlloc'];
  Runtime.stackSave = asm['stackSave'];
  Runtime.stackRestore = asm['stackRestore'];
  Runtime.establishStackSpace = asm['establishStackSpace'];
  Runtime.setTempRet0 = asm['setTempRet0'];
  Runtime.getTempRet0 = asm['getTempRet0'];
  function ExitStatus(status) {
    this.name = 'ExitStatus';
    this.message = 'Program terminated with exit(' + status + ')';
    this.status = status;
  }
  ExitStatus.prototype = new Error();
  ExitStatus.prototype.constructor = ExitStatus;
  var initialStackTop;
  var preloadStartTime = null;
  var calledMain = false;
  dependenciesFulfilled = function runCaller() {
    if (!Module['calledRun']) run();
    if (!Module['calledRun']) dependenciesFulfilled = runCaller;
  };
  Module['callMain'] = Module.callMain = function callMain(args) {
    args = args || [];
    ensureInitRuntime();
    var argc = args.length + 1;
    function pad() {
      for (var i = 0; i < 4 - 1; i++) {
        argv.push(0);
      }
    }
    var argv = [
      allocate(intArrayFromString(Module['thisProgram']), 'i8', ALLOC_NORMAL),
    ];
    pad();
    for (var i = 0; i < argc - 1; i = i + 1) {
      argv.push(allocate(intArrayFromString(args[i]), 'i8', ALLOC_NORMAL));
      pad();
    }
    argv.push(0);
    argv = allocate(argv, 'i32', ALLOC_NORMAL);
    try {
      var ret = Module['_main'](argc, argv, 0);
      exit(ret, true);
    } catch (e) {
      if (e instanceof ExitStatus) {
        return;
      } else if (e == 'SimulateInfiniteLoop') {
        Module['noExitRuntime'] = true;
        return;
      } else {
        if (e && typeof e === 'object' && e.stack)
          Module.printErr('exception thrown: ' + [e, e.stack]);
        throw e;
      }
    } finally {
      calledMain = true;
    }
  };
  function run(args) {
    args = args || Module['arguments'];
    if (preloadStartTime === null) preloadStartTime = Date.now();
    if (runDependencies > 0) {
      return;
    }
    preRun();
    if (runDependencies > 0) return;
    if (Module['calledRun']) return;
    function doRun() {
      if (Module['calledRun']) return;
      Module['calledRun'] = true;
      if (ABORT) return;
      ensureInitRuntime();
      preMain();
      if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();
      if (Module['_main'] && shouldRunNow) Module['callMain'](args);
      postRun();
    }
    if (Module['setStatus']) {
      Module['setStatus']('Running...');
      setTimeout(function () {
        setTimeout(function () {
          Module['setStatus']('');
        }, 1);
        doRun();
      }, 1);
    } else {
      doRun();
    }
  }
  Module['run'] = Module.run = run;
  function exit(status, implicit) {
    if (implicit && Module['noExitRuntime']) {
      return;
    }
    if (Module['noExitRuntime']) {
    } else {
      ABORT = true;
      EXITSTATUS = status;
      STACKTOP = initialStackTop;
      exitRuntime();
      if (Module['onExit']) Module['onExit'](status);
    }
    if (ENVIRONMENT_IS_NODE) {
      process['stdout']['once']('drain', function () {
        process['exit'](status);
      });
      console.log(' ');
      setTimeout(function () {
        process['exit'](status);
      }, 500);
    } else if (ENVIRONMENT_IS_SHELL && typeof quit === 'function') {
      quit(status);
    }
    throw new ExitStatus(status);
  }
  Module['exit'] = Module.exit = exit;
  var abortDecorators = [];
  function abort(what) {
    if (what !== undefined) {
      Module.print(what);
      Module.printErr(what);
      what = JSON.stringify(what);
    } else {
      what = '';
    }
    ABORT = true;
    EXITSTATUS = 1;
    var extra =
      '\nIf this abort() is unexpected, build with -s ASSERTIONS=1 which can give more information.';
    var output = 'abort(' + what + ') at ' + stackTrace() + extra;
    if (abortDecorators) {
      abortDecorators.forEach(function (decorator) {
        output = decorator(output, what);
      });
    }
    throw output;
  }
  Module['abort'] = Module.abort = abort;
  if (Module['preInit']) {
    if (typeof Module['preInit'] == 'function')
      Module['preInit'] = [Module['preInit']];
    while (Module['preInit'].length > 0) {
      Module['preInit'].pop()();
    }
  }
  var shouldRunNow = true;
  if (Module['noInitialRun']) {
    shouldRunNow = false;
  }
  Module['noExitRuntime'] = true;
  run();
  ('use strict');
  function applyArabicShaping(input) {
    if (!input) {
      return input;
    }
    var nDataBytes = (input.length + 1) * 2;
    var stringInputPtr = Module._malloc(nDataBytes);
    Module.stringToUTF16(input, stringInputPtr, nDataBytes);
    var returnStringPtr = Module.ccall(
      'ushape_arabic',
      'number',
      ['number', 'number'],
      [stringInputPtr, input.length],
    );
    Module._free(stringInputPtr);
    if (returnStringPtr === 0) {
      return input;
    }
    var result = Module.UTF16ToString(returnStringPtr);
    Module._free(returnStringPtr);
    return result;
  }
  function mergeParagraphLineBreakPoints(lineBreakPoints, paragraphCount) {
    var mergedParagraphLineBreakPoints = [];
    for (var i = 0; i < paragraphCount; i++) {
      var paragraphEndIndex = Module.ccall(
        'bidi_getParagraphEndIndex',
        'number',
        ['number'],
        [i],
      );
      for (var i$1 = 0, list = lineBreakPoints; i$1 < list.length; i$1 += 1) {
        var lineBreakPoint = list[i$1];
        if (
          lineBreakPoint < paragraphEndIndex &&
          (!mergedParagraphLineBreakPoints[
            mergedParagraphLineBreakPoints.length - 1
          ] ||
            lineBreakPoint >
              mergedParagraphLineBreakPoints[
                mergedParagraphLineBreakPoints.length - 1
              ])
        ) {
          mergedParagraphLineBreakPoints.push(lineBreakPoint);
        }
      }
      mergedParagraphLineBreakPoints.push(paragraphEndIndex);
    }
    for (var i$2 = 0, list$1 = lineBreakPoints; i$2 < list$1.length; i$2 += 1) {
      var lineBreakPoint$1 = list$1[i$2];
      if (
        lineBreakPoint$1 >
        mergedParagraphLineBreakPoints[
          mergedParagraphLineBreakPoints.length - 1
        ]
      ) {
        mergedParagraphLineBreakPoints.push(lineBreakPoint$1);
      }
    }
    return mergedParagraphLineBreakPoints;
  }
  function processBidirectionalText(input, lineBreakPoints) {
    if (!input) {
      return [input];
    }
    var nDataBytes = (input.length + 1) * 2;
    var stringInputPtr = Module._malloc(nDataBytes);
    Module.stringToUTF16(input, stringInputPtr, nDataBytes);
    var paragraphCount = Module.ccall(
      'bidi_processText',
      'number',
      ['number', 'number'],
      [stringInputPtr, input.length],
    );
    if (paragraphCount === 0) {
      Module._free(stringInputPtr);
      return [input];
    }
    var mergedParagraphLineBreakPoints = mergeParagraphLineBreakPoints(
      lineBreakPoints,
      paragraphCount,
    );
    var startIndex = 0;
    var lines = [];
    for (
      var i = 0, list = mergedParagraphLineBreakPoints;
      i < list.length;
      i += 1
    ) {
      var lineBreakPoint = list[i];
      var returnStringPtr = Module.ccall(
        'bidi_getLine',
        'number',
        ['number', 'number'],
        [startIndex, lineBreakPoint],
      );
      if (returnStringPtr === 0) {
        Module._free(stringInputPtr);
        return [];
      }
      lines.push(Module.UTF16ToString(returnStringPtr));
      Module._free(returnStringPtr);
      startIndex = lineBreakPoint;
    }
    Module._free(stringInputPtr);
    return lines;
  }
  self.registerRTLTextPlugin({
    applyArabicShaping: applyArabicShaping,
    processBidirectionalText: processBidirectionalText,
  });
})();
