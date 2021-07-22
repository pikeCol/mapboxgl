import { defineConfig } from 'umi';

export default defineConfig({
  nodeModulesTransform: {
    type: 'none',
  },
  publicPath: '/',
  routes: [{ path: '/', component: '@/pages/index' }],
  fastRefresh: {},
  webpack5: {},
  headScripts: [
    'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-language/v0.10.0/mapbox-gl-language.js',
  ],
});
