/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */

import React, { useState, useCallback, useRef } from 'react';
import Map from './components/Map';
import RouteForm from './components/RouteForm';
import RouteSummary from './components/RouteSummary';
import VehicleProfile from './components/VehicleProfile';
import ElevationChart from './components/ElevationChart';
import GPSPanel from './components/GPSPanel';
import POIPanel from './components/POIPanel';
import WeatherPanel from './components/WeatherPanel';
import { calculateRoute, calculateIsochrone } from './services/routing';
import { analyzeRoute, segmentsToGeoJSON } from './services/filtering';
import { fetchElevationProfile } from './services/altitude';
import { fetchPOIs, fetchPOIsInBbox, selectPOIsForBis, sortWaypointsAlongRoute, sortWaypointsCircular } from './services/poi';
import { exportGPX, importGPX } from './services/gpx';
import { exportPDF } from './services/pdf';
import { fetchSP98Stations } from './services/sp98';
import { fetchRouteWeather } from './services/weather';
import { calculateScenicScore } from './services/scoring';

const _vr = "\x56\x69\x6e\x74\x61\x67\x65\x52\x6f\x75\x74\x65\x2d\x32\x30\x32\x36";
const MODERN_CAR_AVG_SPEED = 65;
const LOOP_ISOCHRONE_DIVISOR = 3.5;

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
  const [poisLoading, setPoisLoading] = useState(false);
  const [sp98Stations, setSp98Stations] = useState([]);
  const [weather, setWeather] = useState(null);
  const [scoring, setScoring] = useState(null);
  const [isochroneGeoJSON, setIsochroneGeoJSON] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [bisLoading, setBisLoading] = useState(false);
  const [bisRouteGeoJSON, setBisRouteGeoJSON] = useState(null);
  const [bisRouteInfo, setBisRouteInfo] = useState(null);
  const [highlightedPoiId, setHighlightedPoiId] = useState(null);

  const lastRouteRef = useRef(null);
  const lastIntermediatesRef = useRef([]);
  const mapRef = useRef(null);

  const clearAll = useCallback(() => {
    setRouteGeoJSON(null); setFilteredGeoJSON(null); setRouteInfo(null);
    setFilterStats(null); setElevationData(null); setPois([]); setPoisLoading(false);
    setSp98Stations([]); setWeather(null); setScoring(null); setIsochroneGeoJSON(null);
    setBisRouteGeoJSON(null); setBisRouteInfo(null); setHighlightedPoiId(null); setError(null);
    lastRouteRef.current = null; lastIntermediatesRef.current = [];
  }, []);

  const processRoute = useCallback((result) => {
    const geojson = result.geojson;
    const { segments, stats } = analyzeRoute(geojson);
    if (segments.length > 0) { setFilteredGeoJSON(segmentsToGeoJSON(segments)); setFilterStats(stats); }
    fetchElevationProfile(geojson).then(setElevationData).catch((e) => console.warn('Altitude:', e.message));
    setPoisLoading(true);
    fetchPOIs(geojson).then((r) => { console.log('VintageRoute POI chargés:', r.length); setPois(r); })
      .catch((e) => console.error('POI:', e.message)).finally(() => setPoisLoading(false));
    fetchSP98Stations(geojson).then((r) => { console.log('VintageRoute SP98:', r.length, 'stations'); setSp98Stations(r); })
      .catch((e) => console.error('SP98:', e.message));
    fetchRouteWeather(geojson).then(setWeather).catch((e) => console.warn('Météo:', e.message));
    calculateScenicScore(geojson).then(setScoring).catch((e) => console.warn('Scoring:', e.message));
  }, []);

  const handleRouteRequest = useCallback(async ({ departure, arrival, intermediates }) => {
    setLoading(true); clearAll();
    try {
      const result = await calculateRoute(departure, arrival, intermediates || []);
      if (!result) return;
      setRouteGeoJSON(result.geojson);
      setRouteInfo({ distance: result.distance, duration: result.duration });
      lastRouteRef.current = { departure, arrival, result };
      lastIntermediatesRef.current = intermediates || [];
      processRoute(result);
      if (result.bbox && mapRef.current) mapRef.current.fitBounds(result.bbox);
    } catch (err) {
      console.error('Erreur itinéraire:', err);
      setError("Impossible de calculer l'itinéraire.");
    } finally { setLoading(false); }
  }, [clearAll, processRoute]);

  const getSpeedFactor = useCallback(() => {
    if (!vehicle || !vehicle.vmax) return 1;
    const f = (vehicle.vmax * 0.55) / MODERN_CAR_AVG_SPEED;
    console.log('VintageRoute speed factor:', { vehicleVmax: vehicle.vmax, factor: Math.round(f * 100) / 100 });
    return Math.max(0.3, Math.min(1, f));
  }, [vehicle]);

  const handleLoopRequest = useCallback(async ({ departure, duration }) => {
    setLoading(true); clearAll();
    try {
      const sf = getSpeedFactor();
      const isoDur = Math.round((duration / LOOP_ISOCHRONE_DIVISOR) * sf);
      console.log('VintageRoute boucle:', { durationDemandee: duration, speedFactor: sf, isoDuration: isoDur });

      const isoResult = await calculateIsochrone(departure, isoDur);
      if (!isoResult?.geojson?.geometry) { setError("Pas de résultat. Durée plus longue ?"); return; }
      setIsochroneGeoJSON(isoResult.geojson);

      const geom = isoResult.geojson.geometry;
      let pts = [];
      if (geom.type === 'MultiPolygon') { for (const p of geom.coordinates) for (const r of p) pts = pts.concat(r); }
      else if (geom.type === 'Polygon') { for (const r of geom.coordinates) pts = pts.concat(r); }
      if (!pts.length) { setError("Zone vide."); return; }

      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const [lng, lat] of pts) { if (lng<minLng) minLng=lng; if (lng>maxLng) maxLng=lng; if (lat<minLat) minLat=lat; if (lat>maxLat) maxLat=lat; }
      if (mapRef.current) mapRef.current.fitBounds([minLng, minLat, maxLng, maxLat]);

      let zonePois = [];
      try { zonePois = await fetchPOIsInBbox(minLat, minLng, maxLat, maxLng); console.log('VintageRoute boucle POI:', zonePois.length); }
      catch (err) { console.warn('VintageRoute boucle POI indispo:', err.message); }

      const dL = departure.lng, dA = departure.lat;
      let wps = [];
      if (zonePois.length >= 2) {
        const wd = zonePois.map(p => ({ ...p, dist: Math.sqrt((p.lon-dL)**2+(p.lat-dA)**2) })); wd.sort((a,b)=>a.dist-b.dist);
        const mx = wd[wd.length-1]?.dist||1;
        const cands = wd.filter(p => p.dist > mx*0.35 && p.dist < mx*0.75);
        const src = cands.length >= 3 ? cands : wd.slice(Math.floor(wd.length/4));
        const sel = [];
        for (const poi of src) { if (sel.length>=3) break; const a=Math.atan2(poi.lat-dA,poi.lon-dL); if (!sel.some(s=>Math.abs(Math.atan2(s.lat-dA,s.lon-dL)-a)<Math.PI/3)||!sel.length) sel.push(poi); }
        if (sel.length<2) for (const poi of src) { if (sel.length>=2) break; if (!sel.find(s=>s.id===poi.id)) sel.push(poi); }
        wps = sel.map(p => ({ lng:p.lon, lat:p.lat, name:p.name, label:`${p.emoji} ${p.name}` }));
      }
      if (wps.length<2) { const rL=(maxLng-minLng)*0.3, rA=(maxLat-minLat)*0.3; wps=[{lng:dL+rL,lat:dA+rA*0.5,name:'Point de passage',label:'📍 Point de passage'},{lng:dL-rL*0.3,lat:dA+rA,name:'Point de passage',label:'📍 Point de passage'}]; }

      wps = sortWaypointsCircular(wps, dL, dA);
      const result = await calculateRoute(departure, departure, wps);
      if (!result) { setError("Impossible de calculer le circuit."); return; }

      const cd = result.duration / sf;
      setRouteGeoJSON(result.geojson); setRouteInfo({ distance: result.distance, duration: cd });
      lastRouteRef.current = { departure, arrival: departure, result }; lastIntermediatesRef.current = wps;
      processRoute(result);
      if (result.bbox && mapRef.current) mapRef.current.fitBounds(result.bbox);
    } catch (err) { console.error('Erreur boucle:', err); setError("Impossible de calculer la boucle."); }
    finally { setLoading(false); }
  }, [clearAll, processRoute, getSpeedFactor]);

  const handleBisRequest = useCallback(async (selectedPois) => {
    if (!lastRouteRef.current) return;
    setBisLoading(true); setBisRouteGeoJSON(null); setBisRouteInfo(null);
    try {
      const { departure, arrival, result: origResult } = lastRouteRef.current;
      let bisPois = selectedPois?.length > 0
        ? selectedPois.map(p => ({ lng:p.lon, lat:p.lat, name:p.name, type:p.type, label:`${p.emoji} ${p.name}` }))
        : selectPOIsForBis(pois, 3, 5000);
      if (!bisPois.length) { setError("Aucun POI pour le bis."); return; }
      const oc = origResult?.geojson?.geometry?.coordinates;
      if (oc) bisPois = sortWaypointsAlongRoute(bisPois, oc);
      const result = await calculateRoute(departure, arrival, bisPois);
      if (!result) return;
      let cd = result.duration; if (vehicle?.vmax) cd = result.duration / getSpeedFactor();
      setBisRouteGeoJSON(result.geojson);
      setBisRouteInfo({ distance: result.distance, duration: cd, pois: bisPois.map(p => p.label||p.name) });
      if (result.bbox && mapRef.current) mapRef.current.fitBounds(result.bbox);
    } catch (err) { console.error('Erreur bis:', err); setError("Impossible de calculer le bis."); }
    finally { setBisLoading(false); }
  }, [pois, vehicle, getSpeedFactor]);

  const handleSelectBis = useCallback(() => {
    if (!bisRouteGeoJSON || !bisRouteInfo) return;
    setRouteGeoJSON(bisRouteGeoJSON); setRouteInfo(bisRouteInfo);
    setBisRouteGeoJSON(null); setBisRouteInfo(null);
    const { segments, stats } = analyzeRoute(bisRouteGeoJSON);
    if (segments.length > 0) { setFilteredGeoJSON(segmentsToGeoJSON(segments)); setFilterStats(stats); }
    fetchElevationProfile(bisRouteGeoJSON).then(setElevationData).catch(() => {});
  }, [bisRouteGeoJSON, bisRouteInfo]);

  const handleCancelBis = useCallback(() => { setBisRouteGeoJSON(null); setBisRouteInfo(null); }, []);

  // Clic POI sur la carte → surligner dans la liste
  const handlePoiMarkerClick = useCallback((poi) => {
    setHighlightedPoiId(poi.id);
    // Retirer le surlignage après 3 secondes
    setTimeout(() => setHighlightedPoiId(null), 3000);
  }, []);

  // Clic POI dans la liste → zoom carte
  const handlePoiListClick = useCallback((poi) => {
    if (mapRef.current) mapRef.current.flyTo(poi.lon, poi.lat);
  }, []);

  const handleExportGPX = useCallback(() => {
    if (!routeGeoJSON) return;
    const wps = lastIntermediatesRef.current.map(wp => ({ lat: wp.lat, lon: wp.lng, name: wp.label || wp.name || 'Étape' }));
    exportGPX(routeGeoJSON, { name: vehicle ? `VintageRoute - ${vehicle.marque} ${vehicle.modele}` : 'VintageRoute', distance: routeInfo?.distance, duration: routeInfo?.duration, waypoints: wps });
  }, [routeGeoJSON, routeInfo, vehicle]);

  const handleExportPDF = useCallback(async () => {
    if (!routeGeoJSON || !mapRef.current) return;
    setExportingPDF(true);
    try {
      await exportPDF(mapRef.current.getContainer(), mapRef.current.getMapInstance(), {
        distance: routeInfo?.distance || 0, duration: routeInfo?.duration || 0,
        elevationData, filterStats, vehicle, pois,
        waypoints: lastIntermediatesRef.current.map(w => ({ label: w.label || w.name || 'Étape' })),
      });
    } catch (err) { console.error('PDF:', err); setError("Erreur export PDF."); }
    finally { setExportingPDF(false); }
  }, [routeGeoJSON, routeInfo, elevationData, filterStats, vehicle, pois]);

  const handlePrint = useCallback(() => { window.print(); }, []);
  const handleToggleFullscreen = useCallback(() => { setIsFullscreen(p => !p); }, []);

  const handleImportGPX = useCallback(async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const { geojson } = await importGPX(file); setRouteGeoJSON(geojson);
      const coords = geojson.geometry.coordinates;
      if (coords.length >= 2) {
        let minLng=Infinity, maxLng=-Infinity, minLat=Infinity, maxLat=-Infinity;
        for (const [lng,lat] of coords) { if(lng<minLng)minLng=lng; if(lng>maxLng)maxLng=lng; if(lat<minLat)minLat=lat; if(lat>maxLat)maxLat=lat; }
        if (mapRef.current) mapRef.current.fitBounds([minLng,minLat,maxLng,maxLat]);
      }
      processRoute({ geojson });
    } catch (err) { setError(err.message || "Erreur import GPX."); }
    e.target.value = '';
  }, [processRoute]);

  return (
    <div className={`vr-layout ${isFullscreen ? 'vr-fullscreen' : ''}`}>
      <header className="vr-header print-header" style={{
        background: 'linear-gradient(135deg, #3a4a1e 0%, #5b6b2d 40%, #4a5a24 100%)',
        borderBottom: '3px solid #c4a23d', padding: '10px 16px', textAlign: 'center',
      }}>
        <div style={{ border: '2px solid #c4a23d', borderRadius: 8, padding: '8px 16px', display: 'inline-block' }}>
          <h1 style={{ fontFamily: "'Playfair Display','Georgia','Times New Roman',serif", fontSize: 28, fontWeight: 900, color: '#f2edd8', letterSpacing: 3, textShadow: '2px 2px 4px rgba(0,0,0,0.5), 0 0 8px rgba(196,162,61,0.3)', margin: 0, lineHeight: 1.2 }}>VintageRoute</h1>
          <p style={{ fontFamily: "'Georgia',serif", fontSize: 11, color: '#c4a23d', margin: '2px 0 0 0', letterSpacing: 1, opacity: 0.9 }}>Navigation GPS pour voitures anciennes</p>
        </div>
      </header>

      <aside className={`vr-sidebar bg-[var(--vr-cream)] border-r border-[var(--vr-sand)] overflow-y-auto no-print ${isFullscreen ? 'vr-sidebar-hidden' : ''}`}>
        <div className="p-3 flex flex-col gap-3">
          <div className="flex justify-center py-2">
            <img src={process.env.PUBLIC_URL + '/logo-vintagroute.png'} alt="VintageRoute" className="w-40 h-auto" />
          </div>
          <VehicleProfile onProfileChange={setVehicle} />
          <RouteForm onRouteRequest={handleRouteRequest} onLoopRequest={handleLoopRequest} loading={loading} />
          <label className="w-full py-2 text-sm font-medium rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-[var(--vr-green)] hover:text-[var(--vr-green)] transition-colors text-center cursor-pointer">
            📂 Importer un fichier GPX
            <input type="file" accept=".gpx" onChange={handleImportGPX} className="hidden" />
          </label>
          {error && <div className="bg-red-100 border-2 border-[var(--vr-red)] text-[var(--vr-red)] rounded-lg p-3 text-senior text-center">⚠️ {error}</div>}
          {routeInfo && <RouteSummary distance={routeInfo.distance} duration={routeInfo.duration} filterStats={filterStats} scoring={scoring} onClear={clearAll} onExportGPX={handleExportGPX} onExportPDF={handleExportPDF} onPrint={handlePrint} exportingPDF={exportingPDF} vehicle={vehicle} />}
          {bisRouteInfo && (
            <div className="bg-blue-50 rounded-xl shadow p-4 border-2 border-blue-400">
              <p className="text-sm font-semibold text-blue-700 mb-2">🗺️ Itinéraire bis (via POI)</p>
              <div className="flex gap-4 mb-2">
                <div className="text-center"><p className="text-xs text-gray-500">Distance</p><p className="text-sm font-bold text-blue-700">{bisRouteInfo.distance.toFixed(1)} km</p></div>
                <div className="text-center"><p className="text-xs text-gray-500">Durée</p><p className="text-sm font-bold text-blue-700">{Math.floor(bisRouteInfo.duration/60)} h {Math.round(bisRouteInfo.duration%60)} min</p></div>
                <div className="text-center"><p className="text-xs text-gray-500">vs original</p><p className="text-sm font-bold text-blue-700">{bisRouteInfo.distance>routeInfo.distance?'+':''}{(bisRouteInfo.distance-routeInfo.distance).toFixed(1)} km</p></div>
              </div>
              {bisRouteInfo.pois?.length > 0 && <p className="text-xs text-gray-500 mb-2">Via : {bisRouteInfo.pois.join(' → ')}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={handleSelectBis} className="flex-1 py-2 text-sm font-bold rounded-lg bg-blue-600 text-white active:bg-blue-800">✓ Choisir</button>
                <button type="button" onClick={handleCancelBis} className="py-2 px-3 text-sm rounded-lg bg-gray-200 text-gray-600">✕</button>
              </div>
            </div>
          )}
          <POIPanel pois={pois} poisLoading={poisLoading} onPoiClick={handlePoiListClick}
            onBisRequest={lastRouteRef.current ? handleBisRequest : null} bisLoading={bisLoading}
            highlightedPoiId={highlightedPoiId} />
          {weather && <WeatherPanel weather={weather} />}
          {elevationData && <ElevationChart elevationData={elevationData} vehicleSlopes={vehicle?.slopes || null} />}
          {routeGeoJSON && <GPSPanel routeCoords={routeGeoJSON.geometry.coordinates} />}
        </div>
        <div className="mt-auto p-3 text-center text-sm text-gray-400">© 2026 Yves — VintageRoute</div>
      </aside>

      <div className={`vr-map ${isFullscreen ? 'vr-map-fullscreen' : ''}`}>
        <Map ref={mapRef} routeGeoJSON={routeGeoJSON} filteredGeoJSON={filteredGeoJSON}
          bisRouteGeoJSON={bisRouteGeoJSON} pois={pois} sp98Stations={sp98Stations}
          isochroneGeoJSON={isochroneGeoJSON} onToggleFullscreen={handleToggleFullscreen}
          isFullscreen={isFullscreen} onPoiMarkerClick={handlePoiMarkerClick} />
      </div>

      {routeInfo && (
        <div className="print-summary">
          <h2>Résumé de l'itinéraire</h2>
          <p>Distance : {routeInfo.distance.toFixed(1)} km</p>
          <p>Durée estimée : {Math.floor(routeInfo.duration/60)} h {Math.round(routeInfo.duration%60)} min</p>
          {elevationData && <p>Dénivelé : +{elevationData.totalUp} m / -{elevationData.totalDown} m</p>}
          {vehicle && <p>Véhicule : {vehicle.marque} {vehicle.modele} ({vehicle.vmax} km/h max)</p>}
          <p className="print-footer">© 2026 VintageRoute — vintagroute.netlify.app</p>
        </div>
      )}
    </div>
  );
}

export default App;
