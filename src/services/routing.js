/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */

const ROUTING_URL = 'https://data.geopf.fr/navigation/itineraire';
const ISOCHRONE_URL = 'https://data.geopf.fr/navigation/isochrone';

// v2 : notre serveur
// const ROUTING_URL = 'https://api.vintagroute.fr/route';

let abortController = null;

/**
 * Calcule un itinéraire via l'API IGN Géoplateforme (resource bdtopo-osrm)
 * avec contrainte : autoroutes bannies.
 * Supporte les étapes intermédiaires (Phase 2 — DEC-016, max 5).
 *
 * @param {{lng: number, lat: number}} start
 * @param {{lng: number, lat: number}} end
 * @param {Array<{lng: number, lat: number}>} [intermediates]
 * @returns {Promise<{geojson: object, distance: number, duration: number, bbox: number[]}|null>}
 */
export async function calculateRoute(start, end, intermediates = []) {
  if (!start || !end) return null;

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

    // Étapes intermédiaires (DEC-016)
    const validSteps = (intermediates || []).filter(
      (s) => s && s.lng != null && s.lat != null
    );
    if (validSteps.length > 0) {
      params.set(
        'intermediates',
        validSteps.map((s) => `${s.lng},${s.lat}`).join('|')
      );
    }

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

    return {
      geojson: { type: 'Feature', geometry: data.geometry, properties: {} },
      distance: typeof data.distance === 'number' ? data.distance : parseFloat(data.distance) || 0,
      duration: typeof data.duration === 'number' ? data.duration : parseFloat(data.duration) || 0,
      bbox: data.bbox || null,
    };
  } catch (err) {
    if (err.name === 'AbortError') return null;
    console.error('VintageRoute routing error:', err.message);
    throw err;
  }
}

/**
 * Mode boucle via API isochrone IGN — Valhalla gratuit (DEC-013, tâche 2.8).
 *
 * @param {{lng: number, lat: number}} center
 * @param {number} durationMinutes - Durée souhaitée (aller simple, la boucle = x2)
 * @returns {Promise<{geojson: object}|null>}
 */
export async function calculateIsochrone(center, durationMinutes) {
  if (!center || !durationMinutes || durationMinutes < 5) return null;

  if (abortController) abortController.abort();
  abortController = new AbortController();

  try {
    const params = new URLSearchParams({
      resource: 'bdtopo-valhalla',
      point: `${center.lng},${center.lat}`,
      costType: 'time',
      costValue: String(Math.round(durationMinutes * 60)),
      profile: 'car',
      direction: 'departure',
      timeUnit: 'second',
      distanceUnit: 'meter',
      crs: 'EPSG:4326',
    });

    const response = await fetch(`${ISOCHRONE_URL}?${params}`, {
      signal: abortController.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`API IGN isochrone ${response.status}: ${text}`);
    }

    const data = await response.json();
    if (!data.geometry) throw new Error('Réponse isochrone sans géométrie');

    return {
      geojson: {
        type: 'Feature',
        geometry: data.geometry,
        properties: { costValue: durationMinutes },
      },
    };
  } catch (err) {
    if (err.name === 'AbortError') return null;
    console.error('VintageRoute isochrone error:', err.message);
    throw err;
  }
}

/**
 * Formate une distance en texte lisible.
 */
export function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/**
 * Formate une durée en texte lisible.
 */
export function formatDuration(minutes) {
  if (minutes < 1) return '< 1 min';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
