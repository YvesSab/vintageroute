/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 *
 * DEC-069 — SP98 : filtrage géographique par bbox de la route
 * (remplace l'ancien DEPT_BBOX figé à 7 départements autour de la Creuse).
 *
 * Stratégie :
 *   1. Calcul d'une bbox englobante de la route + buffer 0.05° (~5 km)
 *   2. Requête API ODS v2.1 avec in_bbox(geom, ...) dans le where (max 100 résultats)
 *   3. Filtrage côté client par distance Haversine au tracé (max 5 km)
 *   4. Tri par position le long de la route (du départ vers l'arrivée)
 */

import { distMeters, distToRoute, projectionAlongRoute } from './utils';

const SP98_URL = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records';

// Distance maximale d'une station à la route (en mètres)
const MAX_DIST_FROM_ROUTE_M = 5000;

// Buffer ajouté à la bbox de la route (en degrés, ~5 km)
const BBOX_BUFFER_DEG = 0.05;

// IMPORTANT : L'API ODS v2.1 plafonne le paramètre `limit` à 100.
// Au-delà, elle renvoie HTTP 400 InvalidRESTParameterError.
// On trie par sp98_maj desc pour récupérer les stations les plus
// récemment mises à jour (= les plus actives).
const API_MAX_LIMIT = 100;

/**
 * Calcule la bbox englobante d'un tracé GeoJSON, avec un buffer.
 * @returns {object} { minLat, maxLat, minLng, maxLng }
 */
function computeRouteBbox(coords, bufferDeg = BBOX_BUFFER_DEG) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lng, lat] of coords) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return {
    minLat: minLat - bufferDeg,
    maxLat: maxLat + bufferDeg,
    minLng: minLng - bufferDeg,
    maxLng: maxLng + bufferDeg,
  };
}

/**
 * Récupère les stations SP98 le long d'un itinéraire.
 *
 * @param {object} routeGeoJSON - Feature GeoJSON LineString
 * @param {object} options
 * @param {number} options.maxResults - nombre max de stations à retourner (défaut 30)
 * @param {number} options.maxFetch - nombre max à demander à l'API (max 100, plafond ODS v2.1)
 * @returns {Promise<Array>} stations triées le long du parcours
 */
export async function fetchSP98Stations(routeGeoJSON, options = {}) {
  const coords = routeGeoJSON?.geometry?.coordinates;
  if (!coords || coords.length < 2) return [];

  const { maxResults = 30, maxFetch = API_MAX_LIMIT } = options;
  // Garde-fou : ne jamais dépasser la limite API ODS v2.1
  const safeFetch = Math.min(maxFetch, API_MAX_LIMIT);

  // 1. Bbox de la route avec buffer
  const bbox = computeRouteBbox(coords);

  // 2. Requête ODS v2.1 avec in_bbox dans le where
  // Syntaxe validée : in_bbox(geom, minLat, minLng, maxLat, maxLng)
  const whereClause =
    `sp98_prix is not null AND ` +
    `in_bbox(geom, ${bbox.minLat.toFixed(5)}, ${bbox.minLng.toFixed(5)}, ` +
    `${bbox.maxLat.toFixed(5)}, ${bbox.maxLng.toFixed(5)})`;

  try {
    const params = new URLSearchParams({
      select: 'id,adresse,ville,cp,geom,sp98_prix,sp98_maj',
      where: whereClause,
      limit: String(safeFetch),
      order_by: 'sp98_maj desc',
    });

    const response = await fetch(`${SP98_URL}?${params}`);
    if (!response.ok) throw new Error(`API carburants ${response.status}`);

    const data = await response.json();
    const results = data?.results || [];
    if (results.length === 0) return [];

    // 3. Mapper en objets station + filtrer celles sans coordonnées valides
    const stations = results
      .map((r) => {
        const lat = r.geom?.lat;
        const lon = r.geom?.lon;
        if (typeof lat !== 'number' || typeof lon !== 'number') return null;

        // sp98_prix : en millièmes si > 100, sinon déjà en €
        const raw = typeof r.sp98_prix === 'number' ? r.sp98_prix : parseFloat(r.sp98_prix);
        if (!Number.isFinite(raw)) return null;
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

    // 4. Filtrage par distance à la route
    const onRoute = stations
      .map((s) => ({ ...s, distToRoute: distToRoute(s.lon, s.lat, coords) }))
      .filter((s) => s.distToRoute <= MAX_DIST_FROM_ROUTE_M);

    if (onRoute.length === 0) {
      console.log(`VintageRoute SP98: ${stations.length} stations dans la bbox, 0 à moins de ${MAX_DIST_FROM_ROUTE_M / 1000} km du tracé`);
      return [];
    }

    // 5. Tri par position le long de la route (départ → arrivée)
    onRoute.forEach((s) => {
      s._proj = projectionAlongRoute(s.lon, s.lat, coords);
    });
    onRoute.sort((a, b) => a._proj - b._proj);

    // Nettoyer les champs internes avant retour
    const final = onRoute.slice(0, maxResults).map(({ _proj, ...rest }) => rest);
    console.log(`VintageRoute SP98: ${stations.length} dans bbox → ${onRoute.length} sur trajet → ${final.length} retenues`);
    return final;

  } catch (err) {
    console.warn('VintageRoute SP98 error:', err.message);
    return [];
  }
}
