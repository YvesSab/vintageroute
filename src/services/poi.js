/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/vintageroute/vintageroute
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Calcule la bounding box élargie autour d'un itinéraire.
 * @param {Array<[number,number]>} coords - [[lng, lat], ...]
 * @param {number} bufferKm - Buffer en km autour de la route
 * @returns {string} "south,west,north,east"
 */
function routeBbox(coords, bufferKm = 5) {
  let minLng = Infinity, maxLng = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;

  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  // ~0.009° ≈ 1 km en latitude
  const bufDeg = bufferKm * 0.009;
  return `${(minLat - bufDeg).toFixed(5)},${(minLng - bufDeg).toFixed(5)},${(maxLat + bufDeg).toFixed(5)},${(maxLng + bufDeg).toFixed(5)}`;
}

/**
 * Récupère les points d'intérêt (viewpoints) le long d'un itinéraire.
 * @param {object} routeGeoJSON - Feature GeoJSON LineString
 * @returns {Promise<Array<{id: number, name: string, lat: number, lon: number, type: string}>>}
 */
export async function fetchPOIs(routeGeoJSON) {
  const coords = routeGeoJSON?.geometry?.coordinates;
  if (!coords || coords.length < 2) return [];

  const bbox = routeBbox(coords);

  const query = `
    [out:json][timeout:15];
    (
      node["tourism"="viewpoint"](${bbox});
      node["historic"](${bbox});
      node["tourism"="picnic_site"](${bbox});
    );
    out body;
  `;

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!response.ok) {
    throw new Error(`Overpass API ${response.status}`);
  }

  const data = await response.json();
  if (!data.elements) return [];

  return data.elements
    .filter((el) => el.lat && el.lon)
    .map((el) => {
      let type = 'viewpoint';
      let emoji = '📍';
      if (el.tags?.historic) {
        type = 'historic';
        emoji = '🏛️';
      } else if (el.tags?.tourism === 'picnic_site') {
        type = 'picnic';
        emoji = '🧺';
      }

      return {
        id: el.id,
        name: el.tags?.name || el.tags?.historic || type,
        lat: el.lat,
        lon: el.lon,
        type,
        emoji,
      };
    })
    .slice(0, 50); // Limiter à 50 POI max
}
