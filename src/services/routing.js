/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 *
 * DEC-041 — Architecture routing double-moteur :
 *   1. BRouter (brouter.de) — PRINCIPAL, avoid_motorways garanti dans le profil
 *   2. IGN bdtopo-valhalla — FALLBACK si BRouter indisponible
 */

import {
  BROUTER_URL, IGN_ROUTING_URL, ISOCHRONE_URL,
  TIMEOUT_BROUTER, TIMEOUT_IGN,
} from '../config';
import { fetchWithTimeout, coordsFitBounds } from './utils';

let abortController = null;

/**
 * Calcule un itinéraire via BRouter (principal) avec fallback IGN.
 */
export async function calculateRoute(start, end, intermediates = [], alternativeIdx = 0) {
  if (!start || !end) return null;

  if (abortController) abortController.abort();
  abortController = new AbortController();

  try {
    const result = await calculateRouteBRouter(start, end, intermediates, alternativeIdx);
    if (result) return result;
  } catch (err) {
    console.warn('VintageRoute BRouter error:', err.message, '→ fallback IGN');
  }

  try {
    return await calculateRouteIGN(start, end, intermediates);
  } catch (err) {
    console.error('VintageRoute routing error (tous moteurs):', err.message);
    throw err;
  }
}

/**
 * BRouter — Moteur principal. Profil car-eco, avoid_motorways garanti.
 */
async function calculateRouteBRouter(start, end, intermediates = [], alternativeIdx = 0) {
  const points = [start, ...intermediates.filter(s => s && s.lng != null && s.lat != null), end];
  const lonlats = points.map(p => `${p.lng},${p.lat}`).join('|');

  const url = `${BROUTER_URL}?lonlats=${encodeURIComponent(lonlats)}&profile=car-eco&alternativeidx=${alternativeIdx}&format=geojson&profile:avoid_motorways=1&profile:avoid_toll=1`;

  console.log('VintageRoute BRouter:', { alternativeIdx, points: points.length });

  const response = await fetchWithTimeout(url, { signal: abortController.signal }, TIMEOUT_BROUTER);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`BRouter ${response.status}: ${text.substring(0, 200)}`);
  }

  const data = await response.json();

  if (!data.features || !data.features.length || !data.features[0].geometry) {
    throw new Error('BRouter: réponse sans géométrie');
  }

  const feature = data.features[0];
  const props = feature.properties || {};
  const distanceKm = (props['track-length'] || 0) / 1000;
  const durationMin = (props['total-time'] || 0) / 60;

  const coords = feature.geometry.coordinates;
  const bbox = coords?.length > 0 ? coordsFitBounds(coords) : null;

  console.log('VintageRoute BRouter OK:', distanceKm.toFixed(1) + ' km,', Math.round(durationMin) + ' min');

  return {
    geojson: { type: 'Feature', geometry: feature.geometry, properties: {} },
    distance: distanceKm,
    duration: durationMin,
    bbox,
  };
}

/**
 * IGN Géoplateforme — Fallback uniquement.
 */
async function calculateRouteIGN(start, end, intermediates = []) {
  const constraints = JSON.stringify({
    constraintType: 'banned', key: 'wayType', operator: '=', value: 'autoroute',
  });

  const params = new URLSearchParams({
    resource: 'bdtopo-valhalla',
    start: `${start.lng},${start.lat}`,
    end: `${end.lng},${end.lat}`,
    profile: 'car', optimization: 'shortest',
    constraints, getSteps: 'true', getBbox: 'true',
    distanceUnit: 'kilometer', timeUnit: 'minute', crs: 'EPSG:4326',
  });

  const validSteps = (intermediates || []).filter(s => s && s.lng != null && s.lat != null);
  if (validSteps.length > 0) {
    params.set('intermediates', validSteps.map(s => `${s.lng},${s.lat}`).join('|'));
  }

  console.log('VintageRoute IGN fallback:', { intermediates: validSteps.length });

  const response = await fetchWithTimeout(
    `${IGN_ROUTING_URL}?${params}`,
    { signal: abortController.signal },
    TIMEOUT_IGN
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`IGN routing ${response.status}: ${text}`);
  }

  const data = await response.json();
  if (!data.geometry) throw new Error('IGN: réponse sans géométrie');

  return {
    geojson: { type: 'Feature', geometry: data.geometry, properties: {} },
    distance: typeof data.distance === 'number' ? data.distance : parseFloat(data.distance) || 0,
    duration: typeof data.duration === 'number' ? data.duration : parseFloat(data.duration) || 0,
    bbox: data.bbox || null,
  };
}

/**
 * Calcule des itinéraires alternatifs via BRouter (alternativeidx 0,1,2).
 */
export async function calculateAlternativeRoutes(start, end, intermediates = []) {
  const results = [];
  for (let idx = 0; idx < 3; idx++) {
    try {
      const result = await calculateRouteBRouter(start, end, intermediates, idx);
      if (result) results.push({ ...result, index: idx });
    } catch (err) {
      if (idx === 0) console.warn('VintageRoute alternatives: échec BRouter');
      break;
    }
  }
  if (results.length === 0) {
    try {
      const r = await calculateRouteIGN(start, end, intermediates);
      if (r) results.push({ ...r, index: 0 });
    } catch (err) { /* silencieux */ }
  }
  return results;
}

/**
 * Isochrone IGN — Pour le mode boucle uniquement.
 */
export async function calculateIsochrone(center, durationMinutes) {
  if (!center || !durationMinutes || durationMinutes < 5) return null;

  if (abortController) abortController.abort();
  abortController = new AbortController();

  try {
    const constraints = JSON.stringify({
      constraintType: 'banned', key: 'wayType', operator: '=', value: 'autoroute',
    });

    const params = new URLSearchParams({
      resource: 'bdtopo-valhalla',
      point: `${center.lng},${center.lat}`,
      costType: 'time', costValue: String(Math.round(durationMinutes * 60)),
      profile: 'car', direction: 'departure',
      timeUnit: 'second', distanceUnit: 'meter', crs: 'EPSG:4326',
      constraints,
    });

    const response = await fetchWithTimeout(
      `${ISOCHRONE_URL}?${params}`,
      { signal: abortController.signal },
      TIMEOUT_IGN
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`IGN isochrone ${response.status}: ${text}`);
    }

    const data = await response.json();
    if (!data.geometry) throw new Error('Isochrone sans géométrie');

    return {
      geojson: { type: 'Feature', geometry: data.geometry, properties: { costValue: durationMinutes } },
    };
  } catch (err) {
    if (err.name === 'AbortError') return null;
    console.error('VintageRoute isochrone error:', err.message);
    throw err;
  }
}

// Ré-exporter les formatages depuis utils (rétrocompatibilité)
export { formatDistance, formatDuration } from './utils';
