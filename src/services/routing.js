/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/vintageroute/vintageroute
 */

const ROUTING_URL = 'https://data.geopf.fr/navigation/itineraire';

// v2 : notre serveur
// const ROUTING_URL = 'https://api.vintagroute.fr/route';

let abortController = null;

/**
 * Calcule un itinéraire via l'API IGN Géoplateforme (resource bdtopo-osrm)
 * avec contrainte : autoroutes bannies.
 *
 * @param {{lng: number, lat: number}} start - Point de départ
 * @param {{lng: number, lat: number}} end   - Point d'arrivée
 * @returns {Promise<{geojson: object, distance: number, duration: number, bbox: number[]}|null>}
 */
export async function calculateRoute(start, end) {
  if (!start || !end) return null;

  // Annuler toute requête précédente en cours
  if (abortController) abortController.abort();
  abortController = new AbortController();

  try {
    const constraints = JSON.stringify({
      constraintType: 'banned',
      key: 'wayType',
      operator: '=',
      value: 'autoroute',
    });

    const params = new URLSearchParams({
      resource: 'bdtopo-osrm',
      start: `${start.lng},${start.lat}`,
      end: `${end.lng},${end.lat}`,
      profile: 'car',
      optimization: 'fastest',
      constraints: constraints,
      getSteps: 'true',
      getBbox: 'true',
      distanceUnit: 'kilometer',
      timeUnit: 'minute',
      crs: 'EPSG:4326',
    });

    const response = await fetch(`${ROUTING_URL}?${params}`, {
      signal: abortController.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`API IGN routing ${response.status}: ${text}`);
    }

    const data = await response.json();

    if (!data.geometry) {
      throw new Error('Réponse IGN sans géométrie');
    }

    const geojson = {
      type: 'Feature',
      geometry: data.geometry,
      properties: {},
    };

    const distance = typeof data.distance === 'number'
      ? data.distance
      : parseFloat(data.distance) || 0;

    const duration = typeof data.duration === 'number'
      ? data.duration
      : parseFloat(data.duration) || 0;

    const bbox = data.bbox || null;

    return { geojson, distance, duration, bbox };
  } catch (err) {
    if (err.name === 'AbortError') return null;
    console.error('VintageRoute routing error:', err.message);
    throw err;
  }
}

/**
 * Formate une distance en texte lisible
 * @param {number} km
 * @returns {string}
 */
export function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/**
 * Formate une durée en texte lisible
 * @param {number} minutes
 * @returns {string}
 */
export function formatDuration(minutes) {
  if (minutes < 1) return '< 1 min';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
