import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

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
      'pk.eyJ1IjoicGlrZW1hbiIsImEiOiJja2RzZ29sbnkwOXh4MzRuMjZ5NDhiN3V6In0.CzfkUypNYwZT0YHvwMsVag';
    const initializeMap = ({ setMap, mapContainer }) => {
      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/pikeman/ckrda36i31aon17ocldrx0hj9',
        center: [119.19, 29.88],
        zoom: 10,
        maxZoom: 16,
        minZoom: 8,
        maxPitch: 60,
      });

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
