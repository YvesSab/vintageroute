/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */

const SP98_URL = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records';

/**
 * Départements Limousin + voisins avec bbox approximatifs.
 */
const DEPT_BBOX = [
  { code: '23', minLat: 45.66, maxLat: 46.50, minLng: 1.37, maxLng: 2.61 },
  { code: '87', minLat: 45.43, maxLat: 46.23, minLng: 0.63, maxLng: 1.71 },
  { code: '19', minLat: 45.05, maxLat: 45.77, minLng: 1.22, maxLng: 2.52 },
  { code: '36', minLat: 46.31, maxLat: 47.28, minLng: 0.86, maxLng: 2.20 },
  { code: '03', minLat: 46.04, maxLat: 46.80, minLng: 2.28, maxLng: 3.98 },
  { code: '63', minLat: 45.28, maxLat: 46.26, minLng: 2.38, maxLng: 3.98 },
  { code: '18', minLat: 46.42, maxLat: 47.63, minLng: 1.77, maxLng: 3.07 },
];

function getDepartments(coords) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lng, lat] of coords) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  const matching = DEPT_BBOX.filter((d) =>
    minLat <= d.maxLat && maxLat >= d.minLat && minLng <= d.maxLng && maxLng >= d.minLng
  );
  return matching.length > 0 ? matching.map((d) => d.code) : ['23'];
}

/**
 * Récupère les stations SP98 le long d'un itinéraire (tâche 2.10).
 * Filtre par départements traversés (fiable, pas de filtre géo complexe).
 */
export async function fetchSP98Stations(routeGeoJSON, options = {}) {
  const coords = routeGeoJSON?.geometry?.coordinates;
  if (!coords || coords.length < 2) return [];

  const { maxResults = 30 } = options;
  const deptCodes = getDepartments(coords);
  const deptFilter = deptCodes.map((c) => `code_departement="${c}"`).join(' or ');

  try {
    const params = new URLSearchParams({
      select: 'id,adresse,ville,cp,geom,sp98_prix,sp98_maj',
      where: `sp98_prix is not null and (${deptFilter})`,
      limit: String(maxResults),
      order_by: 'sp98_maj desc',
    });

    const response = await fetch(`${SP98_URL}?${params}`);
    if (!response.ok) throw new Error(`API carburants ${response.status}`);

    const data = await response.json();
    if (!data.results) return [];

    return data.results
      .filter((r) => r.sp98_prix && r.geom)
      .map((r) => {
        const lat = r.geom.lat;
        const lon = r.geom.lon;
        if (!lat || !lon) return null;

        // sp98_prix : en millièmes si > 100, sinon déjà en €
        const raw = typeof r.sp98_prix === 'number' ? r.sp98_prix : parseFloat(r.sp98_prix);
        const price = raw > 100 ? raw / 1000 : raw;

        return {
          id: r.id || `sp98-${lat}-${lon}`,
          lat, lon,
          name: 'Station SP98',
          address: [r.adresse, r.cp, r.ville].filter(Boolean).join(', '),
          price,
          updated: r.sp98_maj ? new Date(r.sp98_maj).toLocaleDateString('fr-FR') : null,
          type: 'sp98', emoji: '⛽', label: 'Station SP98',
        };
      })
      .filter(Boolean);
  } catch (err) {
    console.warn('VintageRoute SP98 error:', err.message);
    return [];
  }
}
