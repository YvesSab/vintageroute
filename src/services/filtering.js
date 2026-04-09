/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/vintageroute/vintageroute
 */

import bdtopoData from '../data/bdtopo-creuse.json';

/**
 * Index spatial grille pour recherche rapide de tronçons BD TOPO.
 * Chaque cellule (clé "lat,lng" arrondi) contient les indices
 * des tronçons qui la traversent.
 */
const GRID_SIZE = 0.005; // ~500m par cellule
let gridIndex = null;
let features = null;

/**
 * Initialise l'index spatial (appelé une seule fois au chargement).
 */
function ensureIndex() {
  if (gridIndex) return;

  features = bdtopoData.features || [];
  gridIndex = {};

  for (let i = 0; i < features.length; i++) {
    const coords = features[i].c;
    // Indexer chaque point du tronçon dans la grille
    const visited = new Set();
    for (const [lng, lat] of coords) {
      const key = cellKey(lat, lng);
      if (visited.has(key)) continue;
      visited.add(key);
      if (!gridIndex[key]) gridIndex[key] = [];
      gridIndex[key].push(i);
    }
  }

  console.log(
    `VintageRoute BD TOPO: ${features.length} tronçons indexés, ` +
    `${Object.keys(gridIndex).length} cellules`
  );
}

function cellKey(lat, lng) {
  return `${Math.floor(lat / GRID_SIZE)},${Math.floor(lng / GRID_SIZE)}`;
}

/**
 * Distance point-segment au carré (approximation plane, suffisante pour du matching local).
 */
function distSqPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // Segment dégénéré (point)
    const ex = px - ax;
    const ey = py - ay;
    return ex * ex + ey * ey;
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

/**
 * Trouve le tronçon BD TOPO le plus proche d'un point donné.
 * Cherche dans la cellule du point + les 8 cellules voisines.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {{ status: string, nature: string, distance: number } | null}
 */
function findNearestSegment(lat, lng) {
  ensureIndex();

  if (!features || features.length === 0) return null;

  const ci = Math.floor(lat / GRID_SIZE);
  const cj = Math.floor(lng / GRID_SIZE);

  let bestDistSq = Infinity;
  let bestIdx = -1;

  // Chercher dans les 9 cellules autour
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const key = `${ci + di},${cj + dj}`;
      const indices = gridIndex[key];
      if (!indices) continue;

      for (const idx of indices) {
        const coords = features[idx].c;
        for (let k = 0; k < coords.length - 1; k++) {
          const d = distSqPointToSegment(
            lng, lat,
            coords[k][0], coords[k][1],
            coords[k + 1][0], coords[k + 1][1]
          );
          if (d < bestDistSq) {
            bestDistSq = d;
            bestIdx = idx;
          }
        }
      }
    }
  }

  if (bestIdx < 0) return null;

  // Seuil de proximité : ~50m (en degrés, approximatif)
  const THRESHOLD = 0.0005; // ~50m
  if (Math.sqrt(bestDistSq) > THRESHOLD) return null;

  const f = features[bestIdx];
  return {
    status: f.s === 'f' ? 'forbidden' : f.s === 'w' ? 'warning' : 'ok',
    nature: f.n,
  };
}

/**
 * Analyse un itinéraire GeoJSON et retourne les segments classifiés.
 *
 * @param {object} routeGeoJSON - Feature GeoJSON avec geometry LineString
 * @returns {{
 *   segments: Array<{ coords: [number,number][], status: string }>,
 *   stats: { ok: number, warning: number, forbidden: number, unknown: number }
 * }}
 */
export function analyzeRoute(routeGeoJSON) {
  ensureIndex();

  const coords = routeGeoJSON?.geometry?.coordinates;
  if (!coords || coords.length < 2) {
    return { segments: [], stats: { ok: 0, warning: 0, forbidden: 0, unknown: 0 } };
  }

  const segments = [];
  const stats = { ok: 0, warning: 0, forbidden: 0, unknown: 0 };

  let currentStatus = null;
  let currentCoords = [];

  for (let i = 0; i < coords.length; i++) {
    const [lng, lat] = coords[i];
    const match = findNearestSegment(lat, lng);

    // Déterminer le statut de ce point
    let status;
    if (!match) {
      // Pas de tronçon BD TOPO à problème à proximité → probablement OK
      status = 'ok';
    } else {
      status = match.status;
    }

    if (status !== currentStatus && currentCoords.length > 0) {
      // Changement de statut → sauvegarder le segment précédent
      segments.push({ coords: currentCoords, status: currentStatus });
      stats[currentStatus] = (stats[currentStatus] || 0) + currentCoords.length;
      // Garder le dernier point comme jonction
      currentCoords = [currentCoords[currentCoords.length - 1]];
    }

    currentStatus = status;
    currentCoords.push([lng, lat]);
  }

  // Dernier segment
  if (currentCoords.length > 1) {
    segments.push({ coords: currentCoords, status: currentStatus });
    stats[currentStatus] = (stats[currentStatus] || 0) + currentCoords.length;
  }

  return { segments, stats };
}

/**
 * Convertit les segments analysés en GeoJSON pour affichage sur la carte.
 *
 * @param {Array<{ coords: [number,number][], status: string }>} segments
 * @returns {object} FeatureCollection GeoJSON
 */
export function segmentsToGeoJSON(segments) {
  return {
    type: 'FeatureCollection',
    features: segments.map((seg, i) => ({
      type: 'Feature',
      id: i,
      geometry: {
        type: 'LineString',
        coordinates: seg.coords,
      },
      properties: {
        status: seg.status,
      },
    })),
  };
}
