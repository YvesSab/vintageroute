/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/vintageroute/vintageroute
 */

import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Centre par défaut : Guéret, Creuse
const DEFAULT_CENTER = [1.87, 46.17];
const DEFAULT_ZOOM = 10;

const ROUTE_SOURCE = 'vintageroute-route';
const ROUTE_OUTLINE_LAYER = 'vintageroute-route-outline';
const ROUTE_LAYER = 'vintageroute-route-line';

const FILTERED_SOURCE = 'vintageroute-filtered';
const FILTERED_LAYER = 'vintageroute-filtered-line';

// Couleurs par statut de filtrage (charte graphique)
const STATUS_COLORS = {
  ok: '#5b6b2d',        // vert olive
  warning: '#c97b32',   // orange
  forbidden: '#7a2e2e', // bordeaux
};

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

const Map = forwardRef(function Map({ routeGeoJSON, filteredGeoJSON, pois }, ref) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const markersRef = useRef([]);
  const poiMarkersRef = useRef([]);

  useImperativeHandle(ref, () => ({
    fitBounds(bbox) {
      if (mapRef.current && bbox) {
        let bounds;
        if (Array.isArray(bbox)) {
          bounds = [[bbox[0], bbox[1]], [bbox[2], bbox[3]]];
        } else {
          bounds = [[bbox.west, bbox.south], [bbox.east, bbox.north]];
        }
        mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 15 });
      }
    },
    flyTo(lon, lat) {
      if (mapRef.current) {
        mapRef.current.flyTo({ center: [lon, lat], zoom: 14 });
      }
    },
  }));

  // Initialisation de la carte
  useEffect(() => {
    if (mapRef.current) return;
    const container = mapContainer.current;
    if (!container) return;

    const initMap = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        requestAnimationFrame(initMap);
        return;
      }

      const map = new maplibregl.Map({
        container: container,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: true,
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(
        new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
          showUserHeading: true,
        }),
        'top-right'
      );
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

      map.on('load', () => {
        // Source itinéraire principal (contour)
        map.addSource(ROUTE_SOURCE, { type: 'geojson', data: EMPTY_FC });

        map.addLayer({
          id: ROUTE_OUTLINE_LAYER,
          type: 'line',
          source: ROUTE_SOURCE,
          paint: {
            'line-color': '#1e2d3a',
            'line-width': 8,
            'line-opacity': 0.3,
          },
          layout: { 'line-join': 'round', 'line-cap': 'round' },
        });

        // Ligne simple (visible si pas de filtrage)
        map.addLayer({
          id: ROUTE_LAYER,
          type: 'line',
          source: ROUTE_SOURCE,
          paint: {
            'line-color': '#5b6b2d',
            'line-width': 5,
            'line-opacity': 0.85,
          },
          layout: { 'line-join': 'round', 'line-cap': 'round' },
        });

        // Source segments filtrés (colorés par statut)
        map.addSource(FILTERED_SOURCE, { type: 'geojson', data: EMPTY_FC });

        map.addLayer({
          id: FILTERED_LAYER,
          type: 'line',
          source: FILTERED_SOURCE,
          paint: {
            'line-color': [
              'match', ['get', 'status'],
              'ok', STATUS_COLORS.ok,
              'warning', STATUS_COLORS.warning,
              'forbidden', STATUS_COLORS.forbidden,
              STATUS_COLORS.ok,
            ],
            'line-width': 5,
            'line-opacity': 0.9,
          },
          layout: { 'line-join': 'round', 'line-cap': 'round' },
        });

        setMapReady(true);
      });

      mapRef.current = map;
    };

    initMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Mise à jour itinéraire
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const source = map.getSource(ROUTE_SOURCE);
    if (!source) return;

    // Nettoyer les marqueurs
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!routeGeoJSON) {
      source.setData(EMPTY_FC);
      return;
    }

    source.setData({ type: 'FeatureCollection', features: [routeGeoJSON] });

    // Marqueurs départ / arrivée
    const coords = routeGeoJSON.geometry.coordinates;
    if (coords && coords.length >= 2) {
      const startMarker = new maplibregl.Marker({ color: '#5b6b2d' })
        .setLngLat(coords[0])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setText('Départ'))
        .addTo(map);

      const endMarker = new maplibregl.Marker({ color: '#7a2e2e' })
        .setLngLat(coords[coords.length - 1])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setText('Arrivée'))
        .addTo(map);

      markersRef.current = [startMarker, endMarker];
    }
  }, [routeGeoJSON, mapReady]);

  // Mise à jour segments filtrés
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const source = map.getSource(FILTERED_SOURCE);
    if (!source) return;

    if (!filteredGeoJSON) {
      source.setData(EMPTY_FC);
      // Rendre la ligne simple visible
      map.setPaintProperty(ROUTE_LAYER, 'line-opacity', 0.85);
      return;
    }

    source.setData(filteredGeoJSON);
    // Masquer la ligne simple car les segments colorés la remplacent
    map.setPaintProperty(ROUTE_LAYER, 'line-opacity', 0);
  }, [filteredGeoJSON, mapReady]);

  // Mise à jour POI markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Nettoyer les anciens
    poiMarkersRef.current.forEach((m) => m.remove());
    poiMarkersRef.current = [];

    if (!pois || pois.length === 0) return;

    const newMarkers = pois.map((poi) => {
      const el = document.createElement('div');
      el.textContent = poi.emoji;
      el.style.fontSize = '22px';
      el.style.cursor = 'pointer';

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([poi.lon, poi.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 20, maxWidth: '200px' })
            .setText(poi.name)
        )
        .addTo(map);

      return marker;
    });

    poiMarkersRef.current = newMarkers;
  }, [pois, mapReady]);

  return (
    <div
      ref={mapContainer}
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        width: '100%', height: '100%',
      }}
    >
      {!mapReady && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#f2edd8',
        }}>
          <p style={{ fontSize: '18px', color: '#5c3d2a' }}>Chargement de la carte…</p>
        </div>
      )}
    </div>
  );
});

export default Map;
