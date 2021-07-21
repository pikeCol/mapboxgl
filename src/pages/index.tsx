import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import MapboxLanguage from '@mapbox/mapbox-gl-language';

const styles = {
  width: '100vw',
  height: 'calc(100vh - 80px)',
  position: 'absolute',
};

const MapboxGLMap = () => {
  const [map, setMap] = useState(null);
  const mapContainer = useRef(null);

  useEffect(() => {
    mapboxgl.accessToken =
      'pk.eyJ1IjoicGlrZW1hbiIsImEiOiJja2R2ZmR3cjkwZmJpMzBvc2MzanRtZ3kzIn0.f5jHc6Y_3xUfKqzxTW1Fyg';
    const initializeMap = ({ setMap, mapContainer }) => {
      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/pikeman/ckrda36i31aon17ocldrx0hj9', // stylesheet location
        center: [119.19, 29.88],
        zoom: 10,
        maxZoom: 16,
        minZoom: 6,
        maxPitch: 60,
      });
      var language = new MapboxLanguage({
        defaultLanguage: 'zh',
      });
      map.addControl(language);

      map.on('load', () => {
        setMap(map);
        map.resize();
      });
    };

    if (!map) initializeMap({ setMap, mapContainer });
  }, [map]);

  return <div ref={(el) => (mapContainer.current = el)} style={styles} />;
};

export default MapboxGLMap;
