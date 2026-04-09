/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/vintageroute/vintageroute
 */

const ALTI_URL = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json';
const MAX_SAMPLES = 200; // Nombre max de points à échantillonner

/**
 * Distance approx en mètres entre 2 points GPS (formule Haversine simplifiée).
 */
function distMeters(lon1, lat1, lon2, lat2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Échantillonne les coordonnées d'un itinéraire pour garder ~MAX_SAMPLES points.
 * @param {Array<[number,number]>} coords - [[lng, lat], ...]
 * @returns {Array<[number,number]>}
 */
function sampleCoords(coords) {
  if (coords.length <= MAX_SAMPLES) return coords;
  const step = (coords.length - 1) / (MAX_SAMPLES - 1);
  const sampled = [];
  for (let i = 0; i < MAX_SAMPLES; i++) {
    sampled.push(coords[Math.round(i * step)]);
  }
  return sampled;
}

/**
 * Récupère le profil altimétrique le long d'un itinéraire GeoJSON.
 *
 * @param {object} routeGeoJSON - Feature GeoJSON avec geometry LineString
 * @returns {Promise<{
 *   points: Array<{dist: number, alt: number, lon: number, lat: number}>,
 *   slopes: Array<{dist: number, slope: number}>,
 *   totalUp: number,
 *   totalDown: number,
 *   minAlt: number,
 *   maxAlt: number
 * }>}
 */
export async function fetchElevationProfile(routeGeoJSON) {
  const coords = routeGeoJSON?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;

  const sampled = sampleCoords(coords);

  // Construire les paramètres lon/lat séparés par |
  const lons = sampled.map(c => c[0].toFixed(6)).join('|');
  const lats = sampled.map(c => c[1].toFixed(6)).join('|');

  const params = new URLSearchParams({
    lon: lons,
    lat: lats,
    resource: 'ign_rge_alti_wld',
    delimiter: '|',
    indent: 'false',
    measures: 'false',
    zonly: 'false',
  });

  const response = await fetch(`${ALTI_URL}?${params}`);
  if (!response.ok) {
    throw new Error(`API IGN altitude ${response.status}`);
  }

  const data = await response.json();
  if (!data.elevations || !Array.isArray(data.elevations)) {
    throw new Error('Réponse IGN altitude invalide');
  }

  // Construire le profil avec distances cumulées
  const points = [];
  let cumDist = 0;
  let totalUp = 0;
  let totalDown = 0;
  let minAlt = Infinity;
  let maxAlt = -Infinity;

  for (let i = 0; i < data.elevations.length; i++) {
    const elev = data.elevations[i];
    const alt = elev.z != null ? elev.z : 0;

    // Ignorer les points sans données (-99999)
    if (alt <= -9999) continue;

    if (i > 0 && points.length > 0) {
      const prev = sampled[i - 1] || sampled[0];
      const curr = sampled[i];
      cumDist += distMeters(prev[0], prev[1], curr[0], curr[1]);

      const dAlt = alt - points[points.length - 1].alt;
      if (dAlt > 0) totalUp += dAlt;
      else totalDown += Math.abs(dAlt);
    }

    if (alt < minAlt) minAlt = alt;
    if (alt > maxAlt) maxAlt = alt;

    points.push({
      dist: cumDist,
      alt,
      lon: elev.lon,
      lat: elev.lat,
    });
  }

  // Calculer les pentes entre points consécutifs
  const slopes = [];
  for (let i = 1; i < points.length; i++) {
    const dDist = points[i].dist - points[i - 1].dist;
    const dAlt = points[i].alt - points[i - 1].alt;
    const slope = dDist > 0 ? (dAlt / dDist) * 100 : 0;
    slopes.push({
      dist: (points[i - 1].dist + points[i].dist) / 2,
      slope: Math.round(slope * 10) / 10,
    });
  }

  return {
    points,
    slopes,
    totalUp: Math.round(totalUp),
    totalDown: Math.round(totalDown),
    minAlt: Math.round(minAlt),
    maxAlt: Math.round(maxAlt),
  };
}
