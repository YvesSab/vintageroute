/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */

import bdtopoCreuse from '../data/bdtopo-creuse.json';

/**
 * Départements disponibles pour le chargement dynamique (DEC-026).
 * La Creuse (23) est embarquée dans le bundle, les autres sont chargés à la demande
 * depuis public/bdtopo/dept-XX.json.
 */
const AVAILABLE_DEPTS = new Set(['23', '87', '19', '36', '03', '63', '18']);

/**
 * Index spatial grille pour recherche rapide de tronçons BD TOPO.
 */
const GRID_SIZE = 0.005; // ~500m par cellule
let gridIndex = {};
let allFeatures = [];
let loadedDepts = new Set();
let indexDirty = false;

/**
 * Coordonnées approximatives des centres de départements
 * pour détecter quels départements un itinéraire traverse.
 */
const DEPT_BOUNDS = {
  '23': { minLat: 45.68, maxLat: 46.38, minLng: 1.37, maxLng: 2.61 },
  '87': { minLat: 45.43, maxLat: 46.23, minLng: 0.63, maxLng: 1.53 },
  '19': { minLat: 44.92, maxLat: 45.77, minLng: 1.22, maxLng: 2.52 },
  '36': { minLat: 46.30, maxLat: 47.15, minLng: 1.05, maxLng: 2.20 },
  '03': { minLat: 46.10, maxLat: 46.80, minLng: 2.28, maxLng: 3.98 },
  '63': { minLat: 45.28, maxLat: 46.27, minLng: 2.38, maxLng: 3.88 },
  '18': { minLat: 46.42, maxLat: 47.63, minLng: 1.77, maxLng: 3.08 },
};

/**
 * Détermine quels départements sont traversés par une bbox.
 */
function findDepartments(routeCoords) {
  if (!routeCoords || routeCoords.length === 0) return ['23'];

  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  // Échantillonner les coordonnées (pas besoin de toutes les parcourir)
  const step = Math.max(1, Math.floor(routeCoords.length / 50));
  for (let i = 0; i < routeCoords.length; i += step) {
    const [lng, lat] = routeCoords[i];
    if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }

  const depts = [];
  for (const [dept, bounds] of Object.entries(DEPT_BOUNDS)) {
    // Intersection de bboxes
    if (maxLat >= bounds.minLat && minLat <= bounds.maxLat &&
        maxLng >= bounds.minLng && minLng <= bounds.maxLng) {
      depts.push(dept);
    }
  }

  return depts.length > 0 ? depts : ['23'];
}

/**
 * Charge les données BD TOPO d'un département depuis public/bdtopo/.
 */
async function loadDepartment(dept) {
  if (loadedDepts.has(dept)) return;

  if (dept === '23') {
    // Creuse déjà embarquée dans le bundle
    const features = bdtopoCreuse.features || [];
    allFeatures = allFeatures.concat(features);
    loadedDepts.add('23');
    indexDirty = true;
    console.log(`VintageRoute BD TOPO: dept 23 (Creuse) — ${features.length} tronçons (embarqué)`);
    return;
  }

  if (!AVAILABLE_DEPTS.has(dept)) {
    console.warn(`VintageRoute BD TOPO: dept ${dept} non disponible`);
    return;
  }

  try {
    const url = `${process.env.PUBLIC_URL || ''}/bdtopo/dept-${dept}.json`;
    console.log(`VintageRoute BD TOPO: chargement dept ${dept}…`);
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`VintageRoute BD TOPO: dept ${dept} non trouvé (${response.status})`);
      return;
    }
    const data = await response.json();
    const features = data.features || [];
    allFeatures = allFeatures.concat(features);
    loadedDepts.add(dept);
    indexDirty = true;
    console.log(`VintageRoute BD TOPO: dept ${dept} — ${features.length} tronçons chargés`);
  } catch (err) {
    console.warn(`VintageRoute BD TOPO: erreur chargement dept ${dept}:`, err.message);
  }
}

/**
 * Reconstruit l'index spatial après ajout de nouveaux tronçons.
 */
function rebuildIndex() {
  gridIndex = {};
  for (let i = 0; i < allFeatures.length; i++) {
    const coords = allFeatures[i].c;
    const visited = new Set();
    for (const [lng, lat] of coords) {
      const key = cellKey(lat, lng);
      if (visited.has(key)) continue;
      visited.add(key);
      if (!gridIndex[key]) gridIndex[key] = [];
      gridIndex[key].push(i);
    }
  }
  indexDirty = false;
  console.log(`VintageRoute BD TOPO: ${allFeatures.length} tronçons indexés, ${Object.keys(gridIndex).length} cellules, ${loadedDepts.size} départements`);
}

/**
 * S'assure que les départements nécessaires sont chargés et l'index est à jour.
 */
async function ensureLoaded(routeCoords) {
  const depts = findDepartments(routeCoords);
  const toLoad = depts.filter((d) => !loadedDepts.has(d));

  if (toLoad.length > 0) {
    await Promise.all(toLoad.map(loadDepartment));
  }

  // Premier chargement ou nouveaux départements ajoutés
  if (indexDirty || Object.keys(gridIndex).length === 0) {
    // S'assurer que la Creuse est toujours chargée
    if (!loadedDepts.has('23')) {
      await loadDepartment('23');
    }
    rebuildIndex();
  }
}

function cellKey(lat, lng) {
  return `${Math.floor(lat / GRID_SIZE)},${Math.floor(lng / GRID_SIZE)}`;
}

function distSqPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) { const ex = px - ax, ey = py - ay; return ex * ex + ey * ey; }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx - px, cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

function findNearestSegment(lat, lng) {
  if (!allFeatures || allFeatures.length === 0) return null;

  const ci = Math.floor(lat / GRID_SIZE);
  const cj = Math.floor(lng / GRID_SIZE);
  let bestDistSq = Infinity;
  let bestIdx = -1;

  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const key = `${ci + di},${cj + dj}`;
      const indices = gridIndex[key];
      if (!indices) continue;
      for (const idx of indices) {
        const coords = allFeatures[idx].c;
        for (let k = 0; k < coords.length - 1; k++) {
          const d = distSqPointToSegment(lng, lat, coords[k][0], coords[k][1], coords[k + 1][0], coords[k + 1][1]);
          if (d < bestDistSq) { bestDistSq = d; bestIdx = idx; }
        }
      }
    }
  }

  if (bestIdx < 0) return null;
  const THRESHOLD = 0.0005;
  if (Math.sqrt(bestDistSq) > THRESHOLD) return null;

  const f = allFeatures[bestIdx];
  return { status: f.s === 'f' ? 'forbidden' : f.s === 'w' ? 'warning' : 'ok', nature: f.n };
}

/**
 * Analyse un itinéraire GeoJSON. Charge dynamiquement les départements nécessaires.
 */
export async function analyzeRouteAsync(routeGeoJSON) {
  const coords = routeGeoJSON?.geometry?.coordinates;
  if (!coords || coords.length < 2) {
    return { segments: [], stats: { ok: 0, warning: 0, forbidden: 0, unknown: 0 } };
  }

  await ensureLoaded(coords);
  return analyzeRouteSync(coords);
}

/**
 * Version synchrone pour compatibilité (utilise uniquement les départements déjà chargés).
 */
export function analyzeRoute(routeGeoJSON) {
  const coords = routeGeoJSON?.geometry?.coordinates;
  if (!coords || coords.length < 2) {
    return { segments: [], stats: { ok: 0, warning: 0, forbidden: 0, unknown: 0 } };
  }

  // Charger les départements en arrière-plan (non bloquant)
  ensureLoaded(coords).catch((e) => console.warn('BD TOPO async load:', e.message));

  // Analyser avec ce qui est déjà chargé
  return analyzeRouteSync(coords);
}

function analyzeRouteSync(coords) {
  const segments = [];
  const stats = { ok: 0, warning: 0, forbidden: 0, unknown: 0 };

  let currentStatus = null;
  let currentCoords = [];

  for (let i = 0; i < coords.length; i++) {
    const [lng, lat] = coords[i];
    const match = findNearestSegment(lat, lng);
    const status = match ? match.status : 'ok';

    if (status !== currentStatus && currentCoords.length > 0) {
      segments.push({ coords: currentCoords, status: currentStatus });
      stats[currentStatus] = (stats[currentStatus] || 0) + currentCoords.length;
      currentCoords = [currentCoords[currentCoords.length - 1]];
    }

    currentStatus = status;
    currentCoords.push([lng, lat]);
  }

  if (currentCoords.length > 1) {
    segments.push({ coords: currentCoords, status: currentStatus });
    stats[currentStatus] = (stats[currentStatus] || 0) + currentCoords.length;
  }

  return { segments, stats };
}

export function segmentsToGeoJSON(segments) {
  return {
    type: 'FeatureCollection',
    features: segments.map((seg, i) => ({
      type: 'Feature', id: i,
      geometry: { type: 'LineString', coordinates: seg.coords },
      properties: { status: seg.status },
    })),
  };
}
