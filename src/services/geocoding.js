/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/vintageroute/vintageroute
 */

const COMPLETION_URL = 'https://data.geopf.fr/geocodage/completion/';
const GEOCODE_URL = 'https://data.geopf.fr/geocodage/search';

// Délai anti-rebond en ms
const DEBOUNCE_MS = 300;

let abortController = null;

/**
 * Autocomplétion d'adresse via API IGN Géoplateforme
 * @param {string} text - Texte saisi par l'utilisateur (min 3 caractères)
 * @returns {Promise<Array<{label: string, lng: number, lat: number}>>}
 */
export async function autocomplete(text) {
  if (!text || text.trim().length < 3) return [];

  // Annuler la requête précédente si elle est encore en cours
  if (abortController) abortController.abort();
  abortController = new AbortController();

  try {
    const params = new URLSearchParams({
      text: text.trim(),
      type: 'StreetAddress,PositionOfInterest',
      maximumResponses: '5',
      terr: 'METROPOLE',
    });

    const response = await fetch(`${COMPLETION_URL}?${params}`, {
      signal: abortController.signal,
    });

    if (!response.ok) throw new Error(`IGN API ${response.status}`);

    const data = await response.json();

    if (!data.results || !Array.isArray(data.results)) return [];

    return data.results.map((r) => ({
      label: r.fulltext || r.street || r.city || '',
      lng: r.x,
      lat: r.y,
    }));
  } catch (err) {
    if (err.name === 'AbortError') return [];
    console.warn('VintageRoute geocoding error:', err.message);
    return [];
  }
}

/**
 * Géocodage direct : adresse → coordonnées
 * @param {string} address
 * @returns {Promise<{lng: number, lat: number}|null>}
 */
export async function geocode(address) {
  if (!address || address.trim().length < 3) return null;

  try {
    const params = new URLSearchParams({
      q: address.trim(),
      limit: '1',
    });

    const response = await fetch(`${GEOCODE_URL}?${params}`);
    if (!response.ok) return null;

    const data = await response.json();

    if (!data.features || data.features.length === 0) return null;

    const [lng, lat] = data.features[0].geometry.coordinates;
    return { lng, lat };
  } catch (err) {
    console.warn('VintageRoute geocode error:', err.message);
    return null;
  }
}

export { DEBOUNCE_MS };
