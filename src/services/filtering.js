/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */


/**
 * Départements disponibles pour le chargement dynamique (DEC-026).
 * Tous les départements (Creuse incluse) sont chargés à la demande
 * depuis public/bdtopo/dept-XX.json.
 * 96 départements métropolitains couverts.
 */
const AVAILABLE_DEPTS = new Set([
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '2A', '2B',
  '30', '31', '32', '33', '34', '35', '36', '37', '38', '39',
  '40', '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '50', '51', '52', '53', '54', '55', '56', '57', '58', '59',
  '60', '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '70', '71', '72', '73', '74', '75', '76', '77', '78', '79',
  '80', '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '90', '91', '92', '93', '94', '95',
]);

/**
 * Index spatial grille pour recherche rapide de tronçons BD TOPO.
 */
const GRID_SIZE = 0.005; // ~500m par cellule
let gridIndex = {};
let allFeatures = [];
let loadedDepts = new Set();
let indexDirty = false;

/**
 * Bounding boxes des départements métropolitains.
 * Générées automatiquement par download-bdtopo.py --bounds.
 */
const DEPT_BOUNDS = {
  '01': { minLat: 45.57, maxLat: 46.57, minLng: 4.66, maxLng: 6.17 },
  '02': { minLat: 48.79, maxLat: 50.11, minLng: 2.89, maxLng: 4.33 },
  '03': { minLat: 45.89, maxLat: 46.85, minLng: 2.21, maxLng: 4.07 },
  '04': { minLat: 43.62, maxLat: 44.72, minLng: 5.43, maxLng: 7.05 },
  '05': { minLat: 44.14, maxLat: 45.18, minLng: 5.36, maxLng: 7.08 },
  '06': { minLat: 43.44, maxLat: 44.42, minLng: 6.57, maxLng: 7.72 },
  '07': { minLat: 44.22, maxLat: 45.42, minLng: 3.8, maxLng: 4.95 },
  '08': { minLat: 49.18, maxLat: 50.17, minLng: 3.95, maxLng: 5.44 },
  '09': { minLat: 42.52, maxLat: 43.36, minLng: 0.76, maxLng: 2.25 },
  '10': { minLat: 47.87, maxLat: 48.76, minLng: 3.31, maxLng: 4.94 },
  '11': { minLat: 42.6, maxLat: 43.51, minLng: 1.63, maxLng: 3.28 },
  '12': { minLat: 43.64, maxLat: 45.0, minLng: 1.78, maxLng: 3.52 },
  '13': { minLat: 43.14, maxLat: 43.97, minLng: 4.17, maxLng: 5.88 },
  '14': { minLat: 48.71, maxLat: 49.48, minLng: -1.23, maxLng: 0.52 },
  '15': { minLat: 44.57, maxLat: 45.53, minLng: 1.99, maxLng: 3.44 },
  '16': { minLat: 45.15, maxLat: 46.19, minLng: -0.53, maxLng: 1.01 },
  '17': { minLat: 45.04, maxLat: 46.42, minLng: -1.56, maxLng: 0.07 },
  '18': { minLat: 46.37, maxLat: 47.68, minLng: 1.71, maxLng: 3.15 },
  '19': { minLat: 44.87, maxLat: 45.81, minLng: 1.16, maxLng: 2.6 },
  '21': { minLat: 46.85, maxLat: 48.08, minLng: 4.0, maxLng: 5.59 },
  '22': { minLat: 47.99, maxLat: 48.88, minLng: -3.74, maxLng: -1.84 },
  '23': { minLat: 45.68, maxLat: 46.38, minLng: 1.37, maxLng: 2.61 },
  '24': { minLat: 44.52, maxLat: 45.76, minLng: -0.11, maxLng: 1.51 },
  '25': { minLat: 46.51, maxLat: 47.63, minLng: 5.62, maxLng: 7.06 },
  '26': { minLat: 44.06, maxLat: 45.39, minLng: 4.58, maxLng: 5.9 },
  '27': { minLat: 48.62, maxLat: 49.53, minLng: 0.23, maxLng: 1.87 },
  '28': { minLat: 47.9, maxLat: 48.99, minLng: 0.69, maxLng: 2.07 },
  '29': { minLat: 47.7, maxLat: 48.75, minLng: -5.14, maxLng: -3.32 },
  '2A': { minLat: 41.33, maxLat: 42.42, minLng: 8.55, maxLng: 9.41 },
  '2B': { minLat: 41.77, maxLat: 43.03, minLng: 8.61, maxLng: 9.56 },
  '30': { minLat: 43.46, maxLat: 44.51, minLng: 3.19, maxLng: 4.91 },
  '31': { minLat: 42.68, maxLat: 43.97, minLng: 0.38, maxLng: 2.11 },
  '32': { minLat: 43.27, maxLat: 44.13, minLng: -0.35, maxLng: 1.27 },
  '33': { minLat: 44.14, maxLat: 45.62, minLng: -1.26, maxLng: 0.38 },
  '34': { minLat: 43.18, maxLat: 44.02, minLng: 2.48, maxLng: 4.26 },
  '35': { minLat: 47.58, maxLat: 48.71, minLng: -2.36, maxLng: -0.94 },
  '36': { minLat: 46.3, maxLat: 47.32, minLng: 0.8, maxLng: 2.27 },
  '37': { minLat: 46.69, maxLat: 47.75, minLng: -0.02, maxLng: 1.44 },
  '38': { minLat: 44.64, maxLat: 45.93, minLng: 4.68, maxLng: 6.43 },
  '39': { minLat: 46.21, maxLat: 47.35, minLng: 5.18, maxLng: 6.27 },
  '40': { minLat: 43.44, maxLat: 44.58, minLng: -1.56, maxLng: 0.2 },
  '41': { minLat: 47.14, maxLat: 48.18, minLng: 0.51, maxLng: 2.32 },
  '42': { minLat: 45.18, maxLat: 46.32, minLng: 3.62, maxLng: 4.83 },
  '43': { minLat: 44.7, maxLat: 45.47, minLng: 3.01, maxLng: 4.56 },
  '44': { minLat: 46.81, maxLat: 47.88, minLng: -2.56, maxLng: -0.88 },
  '45': { minLat: 47.43, maxLat: 48.4, minLng: 1.44, maxLng: 3.27 },
  '46': { minLat: 44.16, maxLat: 45.1, minLng: 0.92, maxLng: 2.28 },
  '47': { minLat: 43.92, maxLat: 44.81, minLng: -0.21, maxLng: 1.15 },
  '48': { minLat: 44.06, maxLat: 45.02, minLng: 2.91, maxLng: 4.06 },
  '49': { minLat: 46.92, maxLat: 47.85, minLng: -1.42, maxLng: 0.31 },
  '50': { minLat: 48.41, maxLat: 49.73, minLng: -1.95, maxLng: -0.67 },
  '51': { minLat: 48.47, maxLat: 49.46, minLng: 3.33, maxLng: 5.12 },
  '52': { minLat: 47.53, maxLat: 48.74, minLng: 4.56, maxLng: 5.96 },
  '53': { minLat: 47.69, maxLat: 48.61, minLng: -1.31, maxLng: 0.02 },
  '54': { minLat: 48.3, maxLat: 49.57, minLng: 5.35, maxLng: 7.2 },
  '55': { minLat: 48.36, maxLat: 49.65, minLng: 4.81, maxLng: 5.92 },
  '56': { minLat: 47.28, maxLat: 48.26, minLng: -3.8, maxLng: -1.96 },
  '57': { minLat: 48.48, maxLat: 49.53, minLng: 5.82, maxLng: 7.71 },
  '58': { minLat: 46.61, maxLat: 47.64, minLng: 2.78, maxLng: 4.31 },
  '59': { minLat: 49.92, maxLat: 51.09, minLng: 2.01, maxLng: 4.24 },
  '60': { minLat: 49.01, maxLat: 49.81, minLng: 1.61, maxLng: 3.24 },
  '61': { minLat: 48.13, maxLat: 49.03, minLng: -0.93, maxLng: 1.05 },
  '62': { minLat: 49.97, maxLat: 51.02, minLng: 1.55, maxLng: 3.27 },
  '63': { minLat: 45.24, maxLat: 46.31, minLng: 2.32, maxLng: 4.05 },
  '64': { minLat: 42.78, maxLat: 43.64, minLng: -1.8, maxLng: 0.09 },
  '65': { minLat: 42.68, maxLat: 43.66, minLng: -0.41, maxLng: 0.72 },
  '66': { minLat: 42.33, maxLat: 42.97, minLng: 1.71, maxLng: 3.18 },
  '67': { minLat: 48.07, maxLat: 49.12, minLng: 6.87, maxLng: 8.23 },
  '68': { minLat: 47.42, maxLat: 48.36, minLng: 6.76, maxLng: 7.62 },
  '69': { minLat: 45.41, maxLat: 46.35, minLng: 4.18, maxLng: 5.23 },
  '70': { minLat: 47.2, maxLat: 48.08, minLng: 5.3, maxLng: 6.9 },
  '71': { minLat: 46.11, maxLat: 47.2, minLng: 3.56, maxLng: 5.53 },
  '72': { minLat: 47.52, maxLat: 48.53, minLng: -0.51, maxLng: 0.98 },
  '73': { minLat: 45.0, maxLat: 45.98, minLng: 5.55, maxLng: 7.15 },
  '74': { minLat: 45.63, maxLat: 46.41, minLng: 5.73, maxLng: 7.13 },
  '75': { minLat: 48.77, maxLat: 48.95, minLng: 2.16, maxLng: 2.54 },
  '76': { minLat: 49.2, maxLat: 50.12, minLng: 0.07, maxLng: 1.87 },
  '77': { minLat: 48.07, maxLat: 49.17, minLng: 2.32, maxLng: 3.63 },
  '78': { minLat: 48.39, maxLat: 49.13, minLng: 1.37, maxLng: 2.3 },
  '79': { minLat: 45.92, maxLat: 47.16, minLng: -0.97, maxLng: 0.29 },
  '80': { minLat: 49.52, maxLat: 50.41, minLng: 1.33, maxLng: 3.29 },
  '81': { minLat: 43.33, maxLat: 44.25, minLng: 1.47, maxLng: 3.01 },
  '82': { minLat: 43.72, maxLat: 44.44, minLng: 0.67, maxLng: 2.06 },
  '83': { minLat: 42.98, maxLat: 43.87, minLng: 5.59, maxLng: 6.97 },
  '84': { minLat: 43.61, maxLat: 44.49, minLng: 4.58, maxLng: 5.83 },
  '85': { minLat: 46.25, maxLat: 47.13, minLng: -2.4, maxLng: -0.47 },
  '86': { minLat: 46.0, maxLat: 47.22, minLng: -0.17, maxLng: 1.28 },
  '87': { minLat: 45.39, maxLat: 46.45, minLng: 0.56, maxLng: 1.98 },
  '88': { minLat: 47.77, maxLat: 48.56, minLng: 5.32, maxLng: 7.27 },
  '89': { minLat: 47.26, maxLat: 48.45, minLng: 2.78, maxLng: 4.41 },
  '90': { minLat: 47.39, maxLat: 47.87, minLng: 6.69, maxLng: 7.21 },
  '91': { minLat: 48.23, maxLat: 48.82, minLng: 1.84, maxLng: 2.66 },
  '92': { minLat: 48.68, maxLat: 49.0, minLng: 2.08, maxLng: 2.4 },
  '93': { minLat: 48.76, maxLat: 49.06, minLng: 2.22, maxLng: 2.67 },
  '94': { minLat: 48.64, maxLat: 48.91, minLng: 2.24, maxLng: 2.69 },
  '95': { minLat: 48.86, maxLat: 49.28, minLng: 1.54, maxLng: 2.67 },
};

/**
 * Détermine quels départements sont traversés par une route.
 *
 * DEC-070 — L'ancien algorithme prenait la bbox englobante de la route
 * et chargait tous les départements dans cette bbox, ce qui surcharge
 * massivement sur les longs trajets diagonaux (ex: Paris→Barcelonnette
 * = 41 départements au lieu de 12, crash mémoire navigateur).
 *
 * Nouvel algorithme : test point-par-point. On échantillonne ~150 points
 * le long de la route et on regarde dans quel département chaque point tombe.
 * Résultat équivalent en temps (≤200 × 96 = 19 200 comparaisons), mais
 * ne charge QUE les départements réellement traversés (+ quelques limitrophes
 * dus aux bbox rectangulaires des départements, ce qui reste acceptable).
 */
function findDepartments(routeCoords) {
  if (!routeCoords || routeCoords.length === 0) return ['23'];

  const targetSamples = Math.min(200, Math.max(20, Math.floor(routeCoords.length / 10)));
  const step = Math.max(1, Math.floor(routeCoords.length / targetSamples));
  const depts = new Set();

  // Test de chaque point échantillonné contre les bbox des départements
  const entries = Object.entries(DEPT_BOUNDS);
  for (let i = 0; i < routeCoords.length; i += step) {
    const [lng, lat] = routeCoords[i];
    for (const [dept, b] of entries) {
      if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) {
        depts.add(dept);
      }
    }
  }

  // Toujours inclure le dernier point (échantillonnage peut le manquer)
  const [lastLng, lastLat] = routeCoords[routeCoords.length - 1];
  for (const [dept, b] of entries) {
    if (lastLat >= b.minLat && lastLat <= b.maxLat && lastLng >= b.minLng && lastLng <= b.maxLng) {
      depts.add(dept);
    }
  }

  return depts.size > 0 ? Array.from(depts).sort() : ['23'];
}

/**
 * Charge les données BD TOPO d'un département depuis public/bdtopo/.
 */
async function loadDepartment(dept) {
  if (loadedDepts.has(dept)) return;

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

  // Reconstruire l'index si de nouveaux tronçons ont été ajoutés
  if (indexDirty) {
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
