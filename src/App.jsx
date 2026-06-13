/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */

import React, { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import Map from './components/Map';
import RouteForm from './components/RouteForm';
import RouteSummary from './components/RouteSummary';
import VehicleProfile from './components/VehicleProfile';
import ElevationChart from './components/ElevationChart';
import GPSPanel from './components/GPSPanel';
import POIPanel from './components/POIPanel';
import WeatherPanel from './components/WeatherPanel';
import LoadingToast from './components/LoadingToast';
const LandingPage = lazy(() => import('./components/LandingPage'));
import { calculateRoute, calculateIsochrone, calculateAlternativeRoutes } from './services/routing';
import { analyzeRoute, segmentsToGeoJSON } from './services/filtering';
import { fetchElevationProfile } from './services/altitude';
import { fetchPOIs, fetchPOIsInBbox, selectPOIsForBis, sortWaypointsAlongRoute, sortWaypointsCircular, generateLoopVariants } from './services/poi';
import { exportGPX, importGPX } from './services/gpx';
import { exportPDF } from './services/pdf';
import { fetchWikidataInfo } from './services/wikidata';
import { enrichPOIs } from './services/enrichment';
import { fetchSP98Stations } from './services/sp98';
import { fetchRouteWeather } from './services/weather';
import { calculateScenicScore, calculateSinuosity, extractSteepDescents } from './services/scoring';
import { MODERN_CAR_AVG_SPEED, LOOP_ISOCHRONE_DIVISOR, BROUTER_VINTAGE_FACTOR, _vr } from './config';
import { decodeHashToRoute, copyShareURL } from './services/urlShare';

function App() {
  const [showLanding, setShowLanding] = useState(() => !localStorage.getItem('vintagroute-visited'));
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
  const [poisDoneAt, setPoisDoneAt] = useState(0);  // DEC-073 : timestamp fin de chargement (toast "✓")
  const [sp98Stations, setSp98Stations] = useState([]);
  const [routingWarning, setRoutingWarning] = useState(null);  // DEC-071 : message si fallback IGN utilisé
  const [weather, setWeather] = useState(null);
  const [scoring, setScoring] = useState(null);
  const [routeAlerts, setRouteAlerts] = useState([]); // Bloc E : [{lon, lat, type, label}]
  const [isochroneGeoJSON, setIsochroneGeoJSON] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [bisLoading, setBisLoading] = useState(false);
  const [bisRouteGeoJSON, setBisRouteGeoJSON] = useState(null);
  const [bisRouteInfo, setBisRouteInfo] = useState(null);
  const [bisAlternatives, setBisAlternatives] = useState(null); // DEC-046 : [{geojson, distance, duration, index}]
  const [highlightedPoiId, setHighlightedPoiId] = useState(null);

  // DEC-038 + DEC-040 — Variantes de boucle avec seed rotatif
  const [loopVariants, setLoopVariants] = useState(null); // { variants, departure, sf, duration, zonePois, isoPoints }
  const [loopCalculating, setLoopCalculating] = useState(false);
  const [loopSeed, setLoopSeed] = useState(0);
  const [loopProgress, setLoopProgress] = useState('');
  const [selectedLoopIndex, setSelectedLoopIndex] = useState(-1);

  const lastRouteRef = useRef(null);
  const lastIntermediatesRef = useRef([]);
  const mapRef = useRef(null);

  // DEC-064 — Partage via URL : état initial depuis le hash
  const [initialRoute, setInitialRoute] = useState(null);
  const hashProcessed = useRef(false);

  // Lire le hash au premier rendu
  useEffect(() => {
    if (hashProcessed.current) return;
    hashProcessed.current = true;
    const parsed = decodeHashToRoute(window.location.hash);
    if (parsed) {
      // Sauter la landing page si un itinéraire est dans l'URL
      setShowLanding(false);
      localStorage.setItem('vintagroute-visited', '1');
      setInitialRoute(parsed);
    }
  }, []);

  // Auto-calculer quand initialRoute est prêt
  const autoCalcDone = useRef(false);
  useEffect(() => {
    if (!initialRoute || autoCalcDone.current) return;
    autoCalcDone.current = true;
    // Petit délai pour laisser le formulaire se remplir
    const t = setTimeout(() => {
      handleRouteRequest({
        departure: initialRoute.departure,
        arrival: initialRoute.arrival,
        intermediates: initialRoute.intermediates || [],
      });
    }, 300);
    return () => clearTimeout(t);
  }, [initialRoute]);

  // DEC-067 — Mode hors-ligne : indicateur + sauvegarde/restauration
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  // Sauvegarder le dernier itinéraire pour consultation hors-ligne
  const saveOfflineRoute = useCallback((geojson, info, poisData, elevData) => {
    try {
      const data = {
        geojson, info, pois: poisData, elevation: elevData,
        ts: Date.now(),
      };
      localStorage.setItem('vr-offline-route', JSON.stringify(data));
      console.log('VintageRoute: itinéraire sauvegardé pour hors-ligne');
    } catch { /* localStorage plein */ }
  }, []);

  // Restaurer le dernier itinéraire si hors-ligne au démarrage
  const offlineRestored = useRef(false);
  useEffect(() => {
    if (offlineRestored.current || initialRoute) return;
    if (navigator.onLine) return; // en ligne, pas besoin de restaurer
    offlineRestored.current = true;
    try {
      const raw = localStorage.getItem('vr-offline-route');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data?.geojson?.geometry?.coordinates?.length) return;
      // Restaurer l'itinéraire sauvegardé
      setShowLanding(false);
      setRouteGeoJSON(data.geojson);
      setRouteInfo(data.info || null);
      if (data.pois?.length) setPois(data.pois);
      if (data.elevation) setElevationData(data.elevation);
      console.log('VintageRoute: itinéraire restauré depuis le cache hors-ligne');
    } catch { /* données corrompues */ }
  }, [initialRoute]);

  const clearAll = useCallback(() => {
    setRouteGeoJSON(null); setFilteredGeoJSON(null); setRouteInfo(null);
    setFilterStats(null); setElevationData(null); setPois([]); setPoisLoading(false); setPoisDoneAt(0);
    setSp98Stations([]); setWeather(null); setScoring(null); setRouteAlerts([]); setIsochroneGeoJSON(null);
    setBisRouteGeoJSON(null); setBisRouteInfo(null); setBisAlternatives(null); setHighlightedPoiId(null); setError(null);
    setLoopVariants(null); setLoopCalculating(false); setLoopSeed(0); setSelectedLoopIndex(-1);
    setRoutingWarning(null);  // DEC-071 — Effacer warning fallback IGN
    lastRouteRef.current = null; lastIntermediatesRef.current = [];
    // DEC-064 — Nettoyer le hash URL
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const processRoute = useCallback((result) => {
    const geojson = result.geojson;
    if (!geojson?.geometry?.coordinates?.length) return; // 2b.3 guard
    const coords = geojson.geometry.coordinates;
    const { segments, stats } = analyzeRoute(geojson);
    if (segments.length > 0) { setFilteredGeoJSON(segmentsToGeoJSON(segments)); setFilterStats(stats); }

    // Bloc E : alertes virages serrés (synchrone, pas d'API)
    const sinuosity = calculateSinuosity(coords);
    const alerts = (sinuosity.sharpCoords || []).map(c => ({
      lon: c.lon, lat: c.lat, type: 'sharp', label: `Virage serré (rayon ${c.radius}m)`,
    }));
    setRouteAlerts(alerts);

    // Altitude + alertes descente
    fetchElevationProfile(geojson).then(elev => {
      setElevationData(elev);
      // Bloc E : alertes descentes fortes (seuil véhicule ou 10% par défaut)
      const threshold = vehicle?.slopes?.alert || 10;
      const descents = extractSteepDescents(elev, threshold);
      if (descents.length > 0) {
        setRouteAlerts(prev => [
          ...prev,
          ...descents.map(d => ({ lon: d.lon, lat: d.lat, type: 'descent', label: `Descente ${Math.abs(d.slope).toFixed(0)}%` })),
        ]);
      }
    }).catch((e) => console.warn('Altitude:', e.message));

    // POI puis enrichissement + scoring (DEC-068 : scoring sans requête Overpass)
    setPoisLoading(true);
    fetchPOIs(geojson).then(async (r) => { console.log('VintageRoute POI chargés:', r.length); setPois(r);
      // DEC-060 + DEC-065 : Enrichissement en cascade (SPARQL + Wikidata + Wikipedia + Photon) en arrière-plan
      enrichPOIs(r, (updated) => setPois(updated), coords)
        .then((final) => { setPois(final); console.log('VintageRoute enrichissement terminé'); })
        .catch((e) => console.warn('Enrichissement:', e.message));
      // DEC-068 : Scoring utilise le nombre de POI déjà chargés (plus de 2e requête Overpass → plus de 429)
      setScoring(calculateScenicScore(geojson, r.length));
    }).catch((e) => console.error('POI:', e.message)).finally(() => {
      setPoisLoading(false);
      setPoisDoneAt(Date.now());
    });
    fetchSP98Stations(geojson).then((r) => { console.log('VintageRoute SP98:', r.length, 'stations'); setSp98Stations(r); })
      .catch((e) => console.error('SP98:', e.message));
    fetchRouteWeather(geojson).then(setWeather).catch((e) => console.warn('Météo:', e.message));
  }, [vehicle]);

  // DEC-067 — Sauvegarde automatique pour hors-ligne quand l'itinéraire est complet
  useEffect(() => {
    if (routeGeoJSON && routeInfo && pois.length > 0) {
      saveOfflineRoute(routeGeoJSON, routeInfo, pois, elevationData);
    }
  }, [routeGeoJSON, routeInfo, pois, elevationData, saveOfflineRoute]);

  // DEC-073 — Faire disparaître le toast "✓" 1.3s après la fin du chargement POI
  useEffect(() => {
    if (poisDoneAt === 0 || poisLoading) return;
    const t = setTimeout(() => setPoisDoneAt(0), 1300);
    return () => clearTimeout(t);
  }, [poisDoneAt, poisLoading]);

  const handleRouteRequest = useCallback(async ({ departure, arrival, intermediates }) => {
    setLoading(true); clearAll();
    try {
      const result = await calculateRoute(departure, arrival, intermediates || []);
      if (!result) return;
      setRouteGeoJSON(result.geojson);
      setRouteInfo({ distance: result.distance, duration: vehicle?.vmax ? result.duration * BROUTER_VINTAGE_FACTOR : result.duration });
      // DEC-071 — Si fallback IGN utilisé, afficher un bandeau pour avertir
      // que la route peut emprunter de grands axes (l'IGN ne respecte pas
      // strictement la contrainte autoroute sur les longues distances, DEC-039).
      if (result.engine === 'ign' && result.warning) {
        console.warn('VintageRoute routing fallback IGN actif:', result.warning);
        setRoutingWarning(result.warning);
      } else {
        setRoutingWarning(null);
      }
      lastRouteRef.current = { departure, arrival, result };
      lastIntermediatesRef.current = intermediates || [];
      processRoute(result);
      if (result.bbox && mapRef.current) mapRef.current.fitBounds(result.bbox);
    } catch (err) {
      console.error('Erreur itinéraire:', err);
      setError("Impossible de calculer l'itinéraire.");
    } finally { setLoading(false); }
  }, [clearAll, processRoute, vehicle]);

  const getSpeedFactor = useCallback(() => {
    if (!vehicle || !vehicle.vmax) return 1;
    const f = (vehicle.vmax * 0.55) / MODERN_CAR_AVG_SPEED;
    console.log('VintageRoute speed factor:', { vehicleVmax: vehicle.vmax, factor: Math.round(f * 100) / 100 });
    return Math.max(0.3, Math.min(1, f));
  }, [vehicle]);

  /**
   * DEC-042 — Calcul adaptatif d'une boucle : route initiale puis ajustement
   * itératif des waypoints si la durée est hors tolérance (±25%).
   */
  const calculateAdaptiveLoop = useCallback(async (departure, wps, targetMin) => {
    let currentWps = wps;
    let result = await calculateRoute(departure, departure, currentWps);
    if (!result) return null;

    let actualMin = result.duration * BROUTER_VINTAGE_FACTOR;
    console.log('VintageRoute boucle itération 0:', Math.round(actualMin), 'min (cible:', targetMin, ')');

    for (let i = 0; i < 2; i++) {
      const ratio = actualMin / targetMin;
      if (ratio > 0.75 && ratio < 1.30) break;

      const scaleFactor = Math.max(0.5, Math.min(1.8, Math.sqrt(targetMin / actualMin)));
      currentWps = currentWps.map(wp => ({
        ...wp,
        lng: departure.lng + (wp.lng - departure.lng) * scaleFactor,
        lat: departure.lat + (wp.lat - departure.lat) * scaleFactor,
      }));

      console.log('VintageRoute boucle ajustement', i + 1, ': scale', scaleFactor.toFixed(2));
      const newResult = await calculateRoute(departure, departure, currentWps);
      if (!newResult) break;
      result = newResult;
      actualMin = result.duration * BROUTER_VINTAGE_FACTOR;
      console.log('VintageRoute boucle itération', i + 1, ':', Math.round(actualMin), 'min');
    }

    return { result, duration: actualMin, distance: result.distance, waypoints: currentWps };
  }, []);

  /**
   * DEC-038 + DEC-040 + DEC-042 — Mode boucle complet :
   * 1. Isochrone + POI
   * 2. Génère 3 variantes
   * 3. Pré-calcule les 3 routes avec algo adaptatif (progression affichée)
   * 4. L'utilisateur choisit → affichage instantané
   */
  const handleLoopRequest = useCallback(async ({ departure, duration }) => {
    setLoading(true); clearAll();
    try {
      const sf = getSpeedFactor();
      const isoDur = Math.round((duration / LOOP_ISOCHRONE_DIVISOR) * sf);
      console.log('VintageRoute boucle:', { durationDemandee: duration, speedFactor: sf, isoDuration: isoDur });

      setLoopProgress('Calcul de la zone atteignable…');
      const isoResult = await calculateIsochrone(departure, isoDur);
      if (!isoResult?.geojson?.geometry) { setError("Pas de résultat. Essayez une durée plus longue."); return; }
      setIsochroneGeoJSON(isoResult.geojson);

      const geom = isoResult.geojson.geometry;
      let pts = [];
      if (geom.type === 'MultiPolygon') { for (const p of geom.coordinates) for (const r of p) pts = pts.concat(r); }
      else if (geom.type === 'Polygon') { for (const r of geom.coordinates) pts = pts.concat(r); }
      if (!pts.length) { setError("Zone vide."); return; }

      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const [lng, lat] of pts) { if (lng<minLng) minLng=lng; if (lng>maxLng) maxLng=lng; if (lat<minLat) minLat=lat; if (lat>maxLat) maxLat=lat; }
      if (mapRef.current) mapRef.current.fitBounds([minLng, minLat, maxLng, maxLat]);

      setLoopProgress('Recherche des points d\'intérêt…');
      let zonePois = [];
      try { zonePois = await fetchPOIsInBbox(minLat, minLng, maxLat, maxLng); console.log('VintageRoute boucle POI:', zonePois.length); }
      catch (err) { console.warn('VintageRoute boucle POI indispo:', err.message); }

      const dL = departure.lng, dA = departure.lat;
      const currentSeed = 0;
      setLoopSeed(currentSeed);
      const variants = generateLoopVariants(pts, zonePois, dL, dA, currentSeed);

      // Pré-calculer les 3 circuits avec l'algo adaptatif
      const preCalc = [];
      for (let i = 0; i < variants.length; i++) {
        setLoopProgress(`Calcul boucle ${i + 1}/${variants.length} (${variants[i].label})…`);
        const calc = await calculateAdaptiveLoop(departure, variants[i].waypoints, duration);
        preCalc.push(calc); // peut être null si erreur
      }

      // Enrichir les variantes avec les résultats pré-calculés
      const enriched = variants.map((v, i) => ({
        ...v,
        preCalc: preCalc[i], // { result, duration, distance, waypoints } ou null
      }));

      setLoopVariants({ variants: enriched, departure, sf, duration, zonePois, isoPoints: pts });
      setLoopProgress('');

    } catch (err) { console.error('Erreur boucle:', err); setError("Impossible de calculer la boucle."); }
    finally { setLoading(false); setLoopProgress(''); }
  }, [clearAll, getSpeedFactor, calculateAdaptiveLoop]);

  /**
   * DEC-042 — L'utilisateur a choisi une variante pré-calculée → affichage instantané.
   */
  const handleSelectLoopVariant = useCallback(async (variantIndex) => {
    if (!loopVariants) return;
    const { variants, departure } = loopVariants;
    const variant = variants[variantIndex];
    if (!variant?.preCalc) { setError("Ce circuit n'a pas pu être calculé."); return; }

    setSelectedLoopIndex(variantIndex);
    const { result, duration, waypoints } = variant.preCalc;
    setRouteGeoJSON(result.geojson);
    setRouteInfo({ distance: result.distance, duration });
    lastRouteRef.current = { departure, arrival: departure, result };
    lastIntermediatesRef.current = waypoints;
    processRoute(result);
    if (result.bbox && mapRef.current) mapRef.current.fitBounds(result.bbox);
  }, [loopVariants, processRoute]);

  /**
   * DEC-040 + DEC-042 — "Autres boucles" : régénère et pré-calcule 3 nouvelles variantes.
   */
  const handleRefreshLoopVariants = useCallback(async () => {
    if (!loopVariants?.isoPoints || !loopVariants?.departure) return;
    const newSeed = loopSeed + 1;
    setLoopSeed(newSeed);
    setLoopCalculating(true);
    setSelectedLoopIndex(-1);
    const { isoPoints, zonePois, departure, sf, duration } = loopVariants;
    const dL = departure.lng, dA = departure.lat;
    const variants = generateLoopVariants(isoPoints, zonePois || [], dL, dA, newSeed);

    const preCalc = [];
    for (let i = 0; i < variants.length; i++) {
      setLoopProgress(`Calcul boucle ${i + 1}/${variants.length} (${variants[i].label})…`);
      const calc = await calculateAdaptiveLoop(departure, variants[i].waypoints, duration);
      preCalc.push(calc);
    }

    const enriched = variants.map((v, i) => ({ ...v, preCalc: preCalc[i] }));
    setLoopVariants({ variants: enriched, departure, sf, duration, zonePois, isoPoints });
    setLoopCalculating(false); setLoopProgress('');
    console.log('VintageRoute boucle refresh seed:', newSeed);
  }, [loopVariants, loopSeed, calculateAdaptiveLoop]);

  const handleBisRequest = useCallback(async (selectedPois) => {
    if (!lastRouteRef.current) return;
    setBisLoading(true); setBisRouteGeoJSON(null); setBisRouteInfo(null); setBisAlternatives(null);
    try {
      const { departure, arrival, result: origResult } = lastRouteRef.current;

      // DEC-046 : Si pas de sélection manuelle → BRouter alternatives (3 vrais itinéraires)
      if (!selectedPois || selectedPois.length === 0) {
        const alts = await calculateAlternativeRoutes(departure, arrival, lastIntermediatesRef.current);
        if (alts.length <= 1) { setError("Aucune alternative trouvée."); return; }
        // Exclure l'alternative 0 (c'est la route principale), garder 1 et 2
        const others = alts.filter(a => a.index > 0);
        if (others.length === 0) { setError("Aucune alternative trouvée."); return; }
        const enriched = others.map(a => {
          const sinuosity = calculateSinuosity(a.geojson?.geometry?.coordinates || []);
          return {
            ...a,
            duration: vehicle?.vmax ? a.duration * BROUTER_VINTAGE_FACTOR : a.duration,
            sinuosity,
          };
        });
        setBisAlternatives(enriched);
        // Afficher la première alternative par défaut
        const first = enriched[0];
        setBisRouteGeoJSON(first.geojson);
        setBisRouteInfo({ distance: first.distance, duration: first.duration });
        if (first.bbox && mapRef.current) mapRef.current.fitBounds(first.bbox);
        return;
      }

      // Sélection manuelle de POI → bis via waypoints (comportement existant)
      let bisPois = selectedPois.map(p => ({ lng:p.lon, lat:p.lat, name:p.name, type:p.type, label:`${p.emoji} ${p.name}` }));
      const oc = origResult?.geojson?.geometry?.coordinates;
      if (oc) bisPois = sortWaypointsAlongRoute(bisPois, oc);
      const result = await calculateRoute(departure, arrival, bisPois);
      if (!result) return;
      let cd = vehicle?.vmax ? result.duration * BROUTER_VINTAGE_FACTOR : result.duration;
      setBisRouteGeoJSON(result.geojson);
      setBisRouteInfo({ distance: result.distance, duration: cd, pois: bisPois.map(p => p.label||p.name) });
      if (result.bbox && mapRef.current) mapRef.current.fitBounds(result.bbox);
    } catch (err) { console.error('Erreur bis:', err); setError("Impossible de calculer le bis."); }
    finally { setBisLoading(false); }
  }, [pois, vehicle]);

  const handleSelectBis = useCallback(() => {
    if (!bisRouteGeoJSON || !bisRouteInfo) return;
    setRouteGeoJSON(bisRouteGeoJSON); setRouteInfo(bisRouteInfo);
    setBisRouteGeoJSON(null); setBisRouteInfo(null);
    const { segments, stats } = analyzeRoute(bisRouteGeoJSON);
    if (segments.length > 0) { setFilteredGeoJSON(segmentsToGeoJSON(segments)); setFilterStats(stats); }
    fetchElevationProfile(bisRouteGeoJSON).then(setElevationData).catch(() => {});
  }, [bisRouteGeoJSON, bisRouteInfo]);

  const handleCancelBis = useCallback(() => { setBisRouteGeoJSON(null); setBisRouteInfo(null); setBisAlternatives(null); }, []);

  // Clic POI sur la carte → surligner dans la liste
  const handlePoiMarkerClick = useCallback((poi) => {
    setHighlightedPoiId(poi.id);
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
      // Les POI sont déjà enrichis par le pipeline enrichPOIs (Wikidata + Wikipedia + Photon)
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

  // DEC-064 — Partage via URL
  const handleShare = useCallback(async () => {
    if (!lastRouteRef.current) return false;
    const { departure, arrival } = lastRouteRef.current;
    const ok = await copyShareURL({
      departure,
      arrival,
      intermediates: lastIntermediatesRef.current,
      vehicleId: vehicle?.id || null,
    });
    // Mettre à jour le hash dans la barre d'adresse (sans recharger)
    if (ok) {
      const { encodeRouteToHash } = await import('./services/urlShare');
      const hash = encodeRouteToHash({
        departure, arrival,
        intermediates: lastIntermediatesRef.current,
        vehicleId: vehicle?.id || null,
      });
      window.history.replaceState(null, '', `#${hash}`);
    }
    return ok;
  }, [vehicle]);

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

  // Landing page : affichée au premier accès, accessible via le bouton "?"
  if (showLanding) {
    return <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{backgroundColor:'#f2edd8'}}><p className="text-xl text-[#5b6b2d] font-['Georgia',serif]">Chargement…</p></div>}><LandingPage onStart={() => { setShowLanding(false); localStorage.setItem('vintagroute-visited', '1'); }} /></Suspense>;
  }

  return (
    <div className={`vr-layout ${isFullscreen ? 'vr-fullscreen' : ''}`}>
      <header className="vr-header print-header" style={{
        background: 'linear-gradient(135deg, #3a4a1e 0%, #5b6b2d 40%, #4a5a24 100%)',
        borderBottom: '3px solid #c4a23d', padding: '20px 16px', textAlign: 'center',
        position: 'relative',
      }}>
        <div style={{ border: '2px solid #c4a23d', borderRadius: 8, padding: '8px 16px', display: 'inline-block' }}>
          <h1 style={{ fontFamily: "'Playfair Display','Georgia','Times New Roman',serif", fontSize: 28, fontWeight: 900, color: '#f2edd8', letterSpacing: 3, textShadow: '2px 2px 4px rgba(0,0,0,0.5), 0 0 8px rgba(196,162,61,0.3)', margin: 0, lineHeight: 1.2 }}>VintageRoute</h1>
          <p style={{ fontFamily: "'Georgia',serif", fontSize: 11, color: '#c4a23d', margin: '2px 0 0 0', letterSpacing: 1, opacity: 0.9 }}>Navigation GPS pour voitures anciennes</p>
        </div>
        <button
          onClick={() => setShowLanding(true)}
          title="Guide et présentation"
          className="no-print"
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', outline: 'none' }}
        >
          <img
            src={process.env.PUBLIC_URL + '/images/btn-informations.png'}
            alt="Informations"
            style={{ height: 100, width: 'auto', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.5))', transition: 'all 0.2s ease-out' }}
            onMouseOver={e => { e.currentTarget.style.filter = 'drop-shadow(0 5px 10px rgba(0,0,0,0.6)) brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseOut={e => { e.currentTarget.style.filter = 'drop-shadow(0 3px 6px rgba(0,0,0,0.5))'; e.currentTarget.style.transform = ''; }}
          />
        </button>
        {/* DEC-067 — Indicateur hors-ligne */}
        {!isOnline && (
          <div className="no-print" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', backgroundColor: '#c97b32', color: 'white', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: 'Georgia, serif' }}>
            📡 Hors-ligne
          </div>
        )}
      </header>

      <aside className={`vr-sidebar bg-[var(--vr-cream)] border-r border-[var(--vr-sand)] overflow-y-auto no-print ${isFullscreen ? 'vr-sidebar-hidden' : ''}`}>
        <div className="p-3 flex flex-col gap-3">
          <div className="flex justify-center py-2">
            <img src={process.env.PUBLIC_URL + '/logo-vintagroute.png'} alt="VintageRoute" className="w-40 h-auto" />
          </div>
          <VehicleProfile onProfileChange={setVehicle} />
          <RouteForm onRouteRequest={handleRouteRequest} onLoopRequest={handleLoopRequest} loading={loading} initialRoute={initialRoute} />
          <label className="w-full py-2 text-sm font-medium rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-[var(--vr-green)] hover:text-[var(--vr-green)] transition-colors text-center cursor-pointer">
            📂 Importer un fichier GPX
            <input type="file" accept=".gpx" onChange={handleImportGPX} className="hidden" />
          </label>
          {error && <div className="bg-red-100 border-2 border-[var(--vr-red)] text-[var(--vr-red)] rounded-lg p-3 text-senior text-center">⚠️ {error}</div>}
          {loopProgress && (
            <div className="bg-green-50 rounded-lg p-3 border border-[var(--vr-green)] text-center">
              <p className="text-sm text-[var(--vr-green)] animate-pulse font-semibold">⏳ {loopProgress}</p>
            </div>
          )}

          {/* DEC-038 + DEC-042 — Sélecteur de variantes de boucle */}
          {loopVariants && (
            <div className="bg-green-50 rounded-xl shadow p-4 border-2 border-[var(--vr-green)]">
              <p className="text-sm font-semibold text-[var(--vr-navy)] mb-3">
                🔄 Choisissez votre boucle
              </p>
              <p className="text-xs text-gray-500 mb-3">
                3 circuits pré-calculés. Cliquez pour afficher le tracé.
              </p>
              <div className="flex flex-col gap-2">
                {loopVariants.variants.map((variant, idx) => {
                  const pc = variant.preCalc;
                  const durText = pc ? `${Math.floor(pc.duration / 60)}h${String(Math.round(pc.duration % 60)).padStart(2, '0')}` : '—';
                  const distText = pc ? `${pc.distance.toFixed(0)} km` : '';
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectLoopVariant(idx)}
                      disabled={!pc || loopCalculating}
                      className={`w-full py-3 px-4 text-left rounded-lg border-2 transition-colors
                        ${!pc
                          ? 'bg-gray-100 border-gray-300 text-gray-400'
                          : selectedLoopIndex === idx
                            ? 'bg-green-100 border-[var(--vr-green)] text-[var(--vr-navy)] ring-2 ring-[var(--vr-green)]'
                            : 'bg-white border-[var(--vr-green)] text-[var(--vr-navy)] hover:bg-[var(--vr-cream)] active:bg-green-100'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-senior font-bold">
                          🧭 {variant.label}
                        </span>
                        <span className="text-sm font-bold text-[var(--vr-green)]">
                          {durText}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {pc
                          ? `${distText} — ${variant.waypoints.length} étapes${variant.hasPois ? ` via ${variant.poiCount} POI` : ''}`
                          : 'Calcul échoué'
                        }
                      </p>
                    </button>
                  );
                })}
              </div>
              {loopCalculating && (
                <p className="text-sm text-center text-[var(--vr-green)] mt-2 animate-pulse">
                  ⏳ Calcul du circuit en cours…
                </p>
              )}
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleRefreshLoopVariants}
                  disabled={loopCalculating}
                  className="flex-1 py-2 text-sm font-bold rounded-lg bg-[var(--vr-gold)] text-white hover:opacity-90 active:opacity-75 disabled:opacity-40"
                  title="Générer 3 nouvelles boucles dans d'autres directions"
                >
                  🔄 Autres boucles
                </button>
                <button
                  type="button"
                  onClick={() => { setLoopVariants(null); setIsochroneGeoJSON(null); setLoopSeed(0); setSelectedLoopIndex(-1); clearAll(); }}
                  className="py-2 px-3 text-sm rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {routeInfo && <RouteSummary distance={routeInfo.distance} duration={routeInfo.duration} filterStats={filterStats} scoring={scoring} onClear={clearAll} onExportGPX={handleExportGPX} onExportPDF={handleExportPDF} onPrint={handlePrint} onShare={handleShare} exportingPDF={exportingPDF} vehicle={vehicle} />}
          {bisRouteInfo && (
            <div className="bg-blue-50 rounded-xl shadow p-4 border-2 border-blue-400">
              <p className="text-sm font-semibold text-blue-700 mb-2">
                {bisAlternatives ? '🗺️ Itinéraires alternatifs BRouter' : '🗺️ Itinéraire bis (via POI)'}
              </p>

              {bisAlternatives && bisAlternatives.length > 0 && (
                <div className="flex flex-col gap-1 mb-2">
                  {bisAlternatives.map((alt, idx) => (
                    <button key={alt.index} type="button"
                      onClick={() => {
                        setBisRouteGeoJSON(alt.geojson);
                        setBisRouteInfo({ distance: alt.distance, duration: alt.duration });
                        if (alt.bbox && mapRef.current) mapRef.current.fitBounds(alt.bbox);
                      }}
                      className={`w-full py-2 px-3 text-left text-xs rounded-lg border transition-colors
                        ${bisRouteInfo.distance === alt.distance
                          ? 'bg-blue-100 border-blue-400 font-bold'
                          : 'bg-white border-gray-200 hover:bg-blue-50'}`}>
                      <div className="flex justify-between items-center">
                        <span className="text-blue-700 font-medium">Route {idx + 1}</span>
                        <span className="text-gray-500">
                          {alt.distance.toFixed(0)} km — {Math.floor(alt.duration/60)}h{String(Math.round(alt.duration%60)).padStart(2,'0')}
                        </span>
                      </div>
                      {alt.sinuosity && (
                        <div className="mt-0.5 text-gray-400">
                          {'★'.repeat(alt.sinuosity.score)}{'☆'.repeat(5-alt.sinuosity.score)} {alt.sinuosity.label}
                          {alt.sinuosity.sharp > 0 && <span className="ml-1 text-orange-500">· ⚠️ {alt.sinuosity.sharp} virage{alt.sinuosity.sharp>1?'s':''} serré{alt.sinuosity.sharp>1?'s':''}</span>}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-4 mb-2">
                <div className="text-center"><p className="text-xs text-gray-500">Distance</p><p className="text-sm font-bold text-blue-700">{bisRouteInfo.distance.toFixed(1)} km</p></div>
                <div className="text-center"><p className="text-xs text-gray-500">Durée</p><p className="text-sm font-bold text-blue-700">{Math.floor(bisRouteInfo.duration/60)} h {Math.round(bisRouteInfo.duration%60)} min</p></div>
                {routeInfo && <div className="text-center"><p className="text-xs text-gray-500">vs original</p><p className="text-sm font-bold text-blue-700">{bisRouteInfo.distance>routeInfo.distance?'+':''}{(bisRouteInfo.distance-routeInfo.distance).toFixed(1)} km</p></div>}
              </div>
              {bisRouteInfo.pois?.length > 0 && <p className="text-xs text-gray-500 mb-2">Via : {bisRouteInfo.pois.join(' → ')}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={handleSelectBis} className="flex-1 py-2 text-sm font-bold rounded-lg bg-blue-600 text-white active:bg-blue-800">✓ Choisir ce tracé</button>
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

      <div className={`vr-map ${isFullscreen ? 'vr-map-fullscreen' : ''}`} style={{ position: 'relative' }}>
        <Map ref={mapRef} routeGeoJSON={routeGeoJSON} filteredGeoJSON={filteredGeoJSON}
          bisRouteGeoJSON={bisRouteGeoJSON} pois={pois} sp98Stations={sp98Stations}
          isochroneGeoJSON={isochroneGeoJSON} routeAlerts={routeAlerts}
          onToggleFullscreen={handleToggleFullscreen}
          isFullscreen={isFullscreen} onPoiMarkerClick={handlePoiMarkerClick} />

        {/* DEC-071 — Bandeau warning si fallback IGN utilisé (route via grands axes) */}
        {routingWarning && (
          <div
            role="alert"
            style={{
              position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 16px', maxWidth: '92%',
              background: '#fdf6e3', border: '2px solid #c97b32', borderRadius: 6,
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              fontFamily: "Georgia, 'Playfair Display', serif", fontSize: 13, color: '#5c3d2a',
              zIndex: 30,
            }}
          >
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span>{routingWarning}</span>
            <button
              type="button"
              onClick={() => setRoutingWarning(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#8b6e4e', padding: '0 4px' }}
              aria-label="Fermer l'avertissement"
            >×</button>
          </div>
        )}

        {/* DEC-073 — Toast de progression POI : sablier pendant chargement, ✓ pendant 1.2s à la fin */}
        <LoadingToast
          visible={poisLoading || (poisDoneAt > 0 && Date.now() - poisDoneAt < 1200)}
          done={!poisLoading && poisDoneAt > 0}
          title={poisLoading ? "Recherche des points d'intérêt" : `${pois.length} ${pois.length > 1 ? 'lieux trouvés' : 'lieu trouvé'} sur le parcours`}
          subtitle={poisLoading && pois.length > 0 ? `${pois.length} ${pois.length > 1 ? 'déjà trouvés' : 'déjà trouvé'}…` : null}
        />
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
