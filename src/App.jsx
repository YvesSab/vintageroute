/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/vintageroute/vintageroute
 */

import React, { useState, useCallback, useRef } from 'react';
import Map from './components/Map';
import RouteForm from './components/RouteForm';
import RouteSummary from './components/RouteSummary';
import VehicleProfile from './components/VehicleProfile';
import ElevationChart from './components/ElevationChart';
import GPSPanel from './components/GPSPanel';
import POIPanel from './components/POIPanel';
import { calculateRoute } from './services/routing';
import { analyzeRoute, segmentsToGeoJSON } from './services/filtering';
import { fetchElevationProfile } from './services/altitude';
import { fetchPOIs } from './services/poi';

// Watermark VintageRoute (protection propriété intellectuelle)
const _vr = "\x56\x69\x6e\x74\x61\x67\x65\x52\x6f\x75\x74\x65\x2d\x32\x30\x32\x36";

function App() {
  const [routeGeoJSON, setRouteGeoJSON] = useState(null);
  const [filteredGeoJSON, setFilteredGeoJSON] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [filterStats, setFilterStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [elevationData, setElevationData] = useState(null);
  const [pois, setPois] = useState([]);
  const mapRef = useRef(null);

  const handleRouteRequest = useCallback(async ({ departure, arrival }) => {
    setLoading(true);
    setError(null);
    setRouteGeoJSON(null);
    setFilteredGeoJSON(null);
    setRouteInfo(null);
    setFilterStats(null);
    setElevationData(null);
    setPois([]);

    try {
      const result = await calculateRoute(departure, arrival);
      if (!result) return;

      setRouteGeoJSON(result.geojson);
      setRouteInfo({ distance: result.distance, duration: result.duration });

      // Filtrage BD TOPO
      const { segments, stats } = analyzeRoute(result.geojson);
      if (segments.length > 0) {
        setFilteredGeoJSON(segmentsToGeoJSON(segments));
        setFilterStats(stats);
      }

      // Profil altimétrique (en parallèle, ne bloque pas)
      fetchElevationProfile(result.geojson)
        .then(setElevationData)
        .catch((err) => console.warn('Altitude non disponible:', err.message));

      // POI le long de l'itinéraire (en parallèle)
      fetchPOIs(result.geojson)
        .then(setPois)
        .catch((err) => console.warn('POI non disponibles:', err.message));

      if (result.bbox && mapRef.current) {
        mapRef.current.fitBounds(result.bbox);
      }
    } catch (err) {
      console.error('Erreur calcul itinéraire:', err);
      setError("Impossible de calculer l'itinéraire. Vérifiez les adresses et réessayez.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClearRoute = useCallback(() => {
    setRouteGeoJSON(null);
    setFilteredGeoJSON(null);
    setRouteInfo(null);
    setFilterStats(null);
    setElevationData(null);
    setPois([]);
    setError(null);
  }, []);

  return (
    <div className="vr-layout">
      <header className="vr-header bg-[var(--vr-navy)] text-[var(--vr-cream)] p-3 text-center">
        <h1 className="text-2xl font-bold tracking-wider" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
          VintageRoute
        </h1>
      </header>

      <aside className="vr-sidebar bg-[var(--vr-cream)] border-r border-[var(--vr-sand)] overflow-y-auto">
        <div className="p-3 flex flex-col gap-3">
          <div className="flex justify-center py-2">
            <img
              src={process.env.PUBLIC_URL + '/logo-vintageroute.png'}
              alt="VintageRoute"
              className="w-40 h-auto"
            />
          </div>

          <VehicleProfile onProfileChange={setVehicle} />

          <RouteForm onRouteRequest={handleRouteRequest} loading={loading} />

          {error && (
            <div className="bg-red-100 border-2 border-[var(--vr-red)] text-[var(--vr-red)]
                            rounded-lg p-3 text-senior text-center">
              ⚠️ {error}
            </div>
          )}

          {routeInfo && (
            <RouteSummary
              distance={routeInfo.distance}
              duration={routeInfo.duration}
              filterStats={filterStats}
              onClear={handleClearRoute}
            />
          )}

          {elevationData && (
            <ElevationChart
              elevationData={elevationData}
              vehicleSlopes={vehicle?.slopes || null}
            />
          )}

          {routeGeoJSON && (
            <GPSPanel routeCoords={routeGeoJSON.geometry.coordinates} />
          )}

          {pois.length > 0 && (
            <POIPanel
              pois={pois}
              onPoiClick={(poi) => mapRef.current?.flyTo(poi.lon, poi.lat)}
            />
          )}
        </div>

        <div className="mt-auto p-3 text-center text-sm text-gray-400">
          © 2026 Yves — VintageRoute
        </div>
      </aside>

      <div className="vr-map">
        <Map ref={mapRef} routeGeoJSON={routeGeoJSON} filteredGeoJSON={filteredGeoJSON} pois={pois} />
      </div>
    </div>
  );
}

export default App;
