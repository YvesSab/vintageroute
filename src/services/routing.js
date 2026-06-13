/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 *
 * DEC-041 — Architecture routing double-moteur :
 *   1. BRouter (brouter.de) — PRINCIPAL, avoid_motorways garanti dans le profil
 *   2. IGN bdtopo-valhalla — FALLBACK si BRouter indisponible
 *
 * DEC-071 — Timeouts BRouter adaptatifs selon distance + retry sur 5xx.
 * Le résultat retourné inclut maintenant `engine: 'brouter' | 'ign'` pour
 * que l'UI puisse afficher un bandeau "itinéraire de secours" si le fallback
 * IGN a été utilisé (qui ne respecte pas la contrainte autoroute, DEC-039).
 */

import {
  BROUTER_URL, IGN_ROUTING_URL, ISOCHRONE_URL,
  TIMEOUT_BROUTER_SHORT, TIMEOUT_BROUTER_MEDIUM, TIMEOUT_BROUTER_LONG, TIMEOUT_BROUTER_XLONG,
  BROUTER_RETRY_DELAY_MS, BROUTER_RETRY_COUNT,
  TIMEOUT_IGN,
} from '../config';
import { fetchWithTimeout, coordsFitBounds, distMeters } from './utils';

let abortController = null;

/**
 * Choisit un timeout BRouter selon la distance vol d'oiseau en km.
 */
function pickBrouterTimeout(distKm) {
  if (distKm < 100) return TIMEOUT_BROUTER_SHORT;
  if (distKm < 300) return TIMEOUT_BROUTER_MEDIUM;
  if (distKm < 600) return TIMEOUT_BROUTER_LONG;
  return TIMEOUT_BROUTER_XLONG;
}

/**
 * Distance vol d'oiseau totale via les waypoints (en km).
 */
function crowFlightKm(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distMeters(points[i - 1].lng, points[i - 1].lat, points[i].lng, points[i].lat);
  }
  return total / 1000;
}

/**
 * Pause asynchrone.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calcule un itinéraire via BRouter (principal) avec fallback IGN.
 * Retourne { geojson, distance, duration, bbox, engine, warning? }
 *   - engine: 'brouter' (cas normal) ou 'ign' (fallback de secours)
 *   - warning: message à afficher si fallback IGN utilisé
 */
export async function calculateRoute(start, end, intermediates = [], alternativeIdx = 0) {
  if (!start || !end) return null;

  if (abortController) abortController.abort();
  abortController = new AbortController();

  // Tentative principale + retry sur erreurs transitoires
  let lastBrouterError = null;
  for (let attempt = 0; attempt <= BROUTER_RETRY_COUNT; attempt++) {
    try {
      const result = await calculateRouteBRouter(start, end, intermediates, alternativeIdx);
      if (result) return { ...result, engine: 'brouter' };
    } catch (err) {
      lastBrouterError = err;
      // Erreurs définitives : ne pas retry
      const msg = err.message || '';
      const isTransient = /\b(503|502|504|offline|timeout|aborted)\b/i.test(msg);
      const isLastAttempt = attempt >= BROUTER_RETRY_COUNT;

      if (!isTransient || isLastAttempt) {
        console.warn('VintageRoute BRouter error:', msg, '→ fallback IGN');
        break;
      }

      console.warn(
        `VintageRoute BRouter erreur transitoire (tentative ${attempt + 1}/${BROUTER_RETRY_COUNT + 1}):`,
        msg, `— retry dans ${BROUTER_RETRY_DELAY_MS}ms`
      );
      // Recréer un controller car le précédent peut avoir été abort
      if (abortController.signal.aborted) {
        abortController = new AbortController();
      }
      await sleep(BROUTER_RETRY_DELAY_MS);
    }
  }

  // Fallback IGN avec warning visible côté UI
  try {
    const result = await calculateRouteIGN(start, end, intermediates);
    return {
      ...result,
      engine: 'ign',
      warning:
        "Itinéraire calculé via le serveur de secours (IGN). " +
        "Ce moteur peut emprunter de grands axes routiers. " +
        "Réessayez dans une minute pour utiliser le moteur principal.",
    };
  } catch (err) {
    console.error('VintageRoute routing error (tous moteurs):', err.message);
    throw lastBrouterError || err;
  }
}

/**
 * BRouter — Moteur principal. Profil car-eco, avoid_motorways garanti.
 */
async function calculateRouteBRouter(start, end, intermediates = [], alternativeIdx = 0) {
  const points = [start, ...intermediates.filter(s => s && s.lng != null && s.lat != null), end];
  const lonlats = points.map(p => `${p.lng},${p.lat}`).join('|');

  const url = `${BROUTER_URL}?lonlats=${encodeURIComponent(lonlats)}&profile=car-eco&alternativeidx=${alternativeIdx}&format=geojson&profile:avoid_motorways=1&profile:avoid_toll=1`;

  const distKm = crowFlightKm(points);
  const timeout = pickBrouterTimeout(distKm);

  console.log('VintageRoute BRouter:', { alternativeIdx, points: points.length, distKm: Math.round(distKm), timeoutMs: timeout });

  const response = await fetchWithTimeout(url, { signal: abortController.signal }, timeout);

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

  // Recréer un controller si le précédent a été abort par BRouter
  if (!abortController || abortController.signal.aborted) {
    abortController = new AbortController();
  }

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
 * Pas de retry ici (3 tentatives × 2 = 6 appels max), pas de fallback IGN
 * (les alternatives n'ont de sens qu'avec BRouter qui les supporte nativement).
 */
export async function calculateAlternativeRoutes(start, end, intermediates = []) {
  if (abortController) abortController.abort();
  abortController = new AbortController();

  const results = [];
  for (let idx = 0; idx < 3; idx++) {
    try {
      const result = await calculateRouteBRouter(start, end, intermediates, idx);
      if (result) results.push({ ...result, index: idx, engine: 'brouter' });
    } catch (err) {
      if (idx === 0) console.warn('VintageRoute alternatives: échec BRouter');
      break;
    }
  }
  if (results.length === 0) {
    try {
      const r = await calculateRouteIGN(start, end, intermediates);
      if (r) results.push({
        ...r, index: 0, engine: 'ign',
        warning: "Itinéraire calculé via le serveur de secours (IGN). Peut emprunter de grands axes.",
      });
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
