/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */

/**
 * Service de partage d'itinéraire via URL (DEC-064 — Bloc O).
 *
 * Format du hash :
 *   #dep=LAT,LON,NOM&arr=LAT,LON,NOM&wp1=LAT,LON,NOM&wp2=...&v=vehicle-id
 *
 * Les coordonnées sont arrondies à 5 décimales (~1m de précision).
 * Les noms sont encodés avec encodeURIComponent.
 */

/**
 * Encode un itinéraire en hash URL.
 * @param {Object} params
 * @param {Object} params.departure  - { lat, lng, label }
 * @param {Object} params.arrival    - { lat, lng, label }
 * @param {Array}  params.intermediates - [{ lat, lng, label }]
 * @param {string} [params.vehicleId] - ID du véhicule (ex: "peugeot-201")
 * @returns {string} Hash URL (sans le #)
 */
export function encodeRouteToHash({ departure, arrival, intermediates = [], vehicleId }) {
  if (!departure || !arrival) return '';

  const encPt = (pt) => {
    const lat = Number(pt.lat).toFixed(5);
    const lon = Number(pt.lng).toFixed(5);
    const name = pt.label ? encodeURIComponent(pt.label) : '';
    return `${lat},${lon},${name}`;
  };

  const parts = [];
  parts.push(`dep=${encPt(departure)}`);
  parts.push(`arr=${encPt(arrival)}`);

  intermediates.forEach((wp, i) => {
    if (wp && wp.lat != null && wp.lng != null) {
      parts.push(`wp${i + 1}=${encPt(wp)}`);
    }
  });

  if (vehicleId) {
    parts.push(`v=${encodeURIComponent(vehicleId)}`);
  }

  return parts.join('&');
}

/**
 * Décode un hash URL en paramètres d'itinéraire.
 * @param {string} hash - Le hash (avec ou sans le #)
 * @returns {Object|null} { departure, arrival, intermediates, vehicleId } ou null si invalide
 */
export function decodeHashToRoute(hash) {
  if (!hash) return null;

  const clean = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!clean) return null;

  const params = {};
  clean.split('&').forEach((pair) => {
    const eqIdx = pair.indexOf('=');
    if (eqIdx < 1) return;
    const key = pair.substring(0, eqIdx);
    const val = pair.substring(eqIdx + 1);
    params[key] = val;
  });

  const parsePt = (str) => {
    if (!str) return null;
    const parts = str.split(',');
    if (parts.length < 2) return null;
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lon)) return null;
    // Le nom est tout ce qui suit le 2e virgule (peut contenir des virgules)
    const label = parts.length > 2
      ? decodeURIComponent(parts.slice(2).join(','))
      : `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    return { lat, lng: lon, label };
  };

  const departure = parsePt(params.dep);
  const arrival = parsePt(params.arr);
  if (!departure || !arrival) return null;

  // Collecter les waypoints (wp1, wp2, ... wp5)
  const intermediates = [];
  for (let i = 1; i <= 5; i++) {
    const wp = parsePt(params[`wp${i}`]);
    if (wp) intermediates.push(wp);
  }

  const vehicleId = params.v ? decodeURIComponent(params.v) : null;

  return { departure, arrival, intermediates, vehicleId };
}

/**
 * Génère l'URL complète de partage.
 * @param {Object} routeParams - Mêmes paramètres que encodeRouteToHash
 * @returns {string} URL complète (ex: https://vintageroute.netlify.app/#dep=...)
 */
export function generateShareURL(routeParams) {
  const hash = encodeRouteToHash(routeParams);
  if (!hash) return '';
  // Utiliser l'URL courante sans hash
  const base = window.location.origin + window.location.pathname;
  return `${base}#${hash}`;
}

/**
 * Copie l'URL de partage dans le presse-papier.
 * @param {Object} routeParams
 * @returns {Promise<boolean>} true si copié avec succès
 */
export async function copyShareURL(routeParams) {
  const url = generateShareURL(routeParams);
  if (!url) return false;

  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // Fallback pour les navigateurs anciens
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    document.body.removeChild(ta);
    return ok;
  }
}
