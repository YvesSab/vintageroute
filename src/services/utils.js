/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 *
 * Utilitaires partagés — fetch, géo, formatage
 */

// ═══════════ FETCH AVEC TIMEOUT ═══════════

/**
 * Fetch avec timeout automatique (AbortController).
 * @param {string} url
 * @param {object} options - options fetch (method, headers, body, signal…)
 * @param {number} timeoutMs - timeout en ms (défaut 15000)
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Si un signal externe est passé, le chaîner
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Fetch avec fallback sur plusieurs serveurs (ex: Overpass).
 * Essaie chaque serveur dans l'ordre, retourne la première réponse OK.
 * @param {string[]} servers - URLs des serveurs
 * @param {Function} buildRequest - (serverUrl) => { url, options }
 * @param {number} timeoutMs - timeout par serveur
 * @returns {Promise<Response>}
 */
export async function fetchWithFallback(servers, buildRequest, timeoutMs = 20000) {
  let lastError = null;
  for (const serverUrl of servers) {
    try {
      const shortName = serverUrl.split('//')[1].split('/')[0];
      console.log('VintageRoute fetch fallback:', shortName);
      const { url, options } = buildRequest(serverUrl);
      const response = await fetchWithTimeout(url || serverUrl, options || {}, timeoutMs);
      if (!response.ok) throw new Error(`${shortName} ${response.status}`);
      return response;
    } catch (err) {
      lastError = err;
      console.warn('VintageRoute fallback échec:', err.message);
    }
  }
  throw lastError || new Error('Tous les serveurs ont échoué');
}

// ═══════════ CALCULS GÉO ═══════════

/**
 * Distance en mètres entre 2 points GPS (Haversine).
 * Utilisé par : poi.js, altitude.js, scoring.js
 */
export function distMeters(lon1, lat1, lon2, lat2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Bounding box d'un ensemble de coordonnées avec buffer en km.
 * Format Overpass : "south,west,north,east"
 * @param {Array<[number,number]>} coords - [[lng, lat], ...]
 * @param {number} bufferKm
 * @returns {string}
 */
export function routeBbox(coords, bufferKm = 5) {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const b = bufferKm * 0.009;
  return `${(minLat - b).toFixed(5)},${(minLng - b).toFixed(5)},${(maxLat + b).toFixed(5)},${(maxLng + b).toFixed(5)}`;
}

/**
 * Bounding box sous forme d'objet { minLng, maxLng, minLat, maxLat }.
 * @param {Array<[number,number]>} coords
 * @returns {{ minLng, maxLng, minLat, maxLat }}
 */
export function coordsBounds(coords) {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, maxLng, minLat, maxLat };
}

/**
 * Bbox en tableau [minLng, minLat, maxLng, maxLat] pour MapLibre fitBounds.
 */
export function coordsFitBounds(coords) {
  const { minLng, maxLng, minLat, maxLat } = coordsBounds(coords);
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Distance minimale d'un point à une route (sous-échantillonnée).
 */
export function distToRoute(poiLon, poiLat, routeCoords) {
  let minD = Infinity;
  const step = Math.max(1, Math.floor(routeCoords.length / 100));
  for (let i = 0; i < routeCoords.length; i += step) {
    const d = distMeters(poiLon, poiLat, routeCoords[i][0], routeCoords[i][1]);
    if (d < minD) minD = d;
  }
  return minD;
}

/**
 * Position relative d'un POI le long de la route (0=départ, 1=arrivée).
 */
export function projectionAlongRoute(poiLon, poiLat, routeCoords) {
  let minD = Infinity, bestIdx = 0;
  const step = Math.max(1, Math.floor(routeCoords.length / 200));
  for (let i = 0; i < routeCoords.length; i += step) {
    const d = distMeters(poiLon, poiLat, routeCoords[i][0], routeCoords[i][1]);
    if (d < minD) { minD = d; bestIdx = i; }
  }
  return bestIdx / Math.max(1, routeCoords.length - 1);
}

/**
 * Sous-échantillonne un tableau de coordonnées pour garder ~maxSamples points.
 */
export function sampleCoords(coords, maxSamples = 200) {
  if (coords.length <= maxSamples) return coords;
  const step = coords.length / maxSamples;
  const sampled = [];
  for (let i = 0; i < maxSamples; i++) {
    sampled.push(coords[Math.min(Math.floor(i * step), coords.length - 1)]);
  }
  if (sampled[sampled.length - 1] !== coords[coords.length - 1]) {
    sampled.push(coords[coords.length - 1]);
  }
  return sampled;
}

// ═══════════ FORMATAGE ═══════════

/**
 * Formate une distance en km ou m.
 */
export function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/**
 * Formate une durée en heures/minutes.
 */
export function formatDuration(minutes) {
  if (minutes < 1) return '< 1 min';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
