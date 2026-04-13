/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */

import { OVERPASS_SERVERS, TIMEOUT_OVERPASS, POI_CATEGORIES, HISTORIC_FR, POI_MAX_DIST_M } from '../config';
import { fetchWithTimeout, distMeters, routeBbox, distToRoute, projectionAlongRoute } from './utils';

// ═══════════ OVERPASS FETCH AVEC FALLBACK ═══════════

async function fetchOverpass(query) {
  return fetchOverpassWithServers(query, OVERPASS_SERVERS);
}

/**
 * Envoie une requête Overpass en essayant les serveurs dans l'ordre donné.
 * Permet le round-robin : chaque segment peut commencer par un serveur différent.
 */
async function fetchOverpassWithServers(query, servers, timeout = TIMEOUT_OVERPASS) {
  let lastError = null;
  for (const serverUrl of servers) {
    try {
      const shortName = serverUrl.split('//')[1].split('/')[0];
      console.log('VintageRoute Overpass: essai', shortName);
      const response = await fetchWithTimeout(serverUrl, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }, timeout);
      if (!response.ok) { lastError = new Error(`Overpass ${response.status} (${shortName})`); console.warn('VintageRoute Overpass:', lastError.message, '→ fallback'); continue; }
      const data = await response.json();
      console.log('VintageRoute Overpass: succès via', shortName);
      return data;
    } catch (err) { lastError = err; console.warn('VintageRoute Overpass:', err.message, '→ fallback'); continue; }
  }
  throw lastError || new Error('Tous les serveurs Overpass sont indisponibles');
}

// ═══════════ HELPERS ═══════════

function poiDisplayName(tags, type, catLabel) {
  if (tags.name) return tags.name;
  if (type === 'historic' && tags.historic) return HISTORIC_FR[tags.historic] || tags.historic.replace(/_/g, ' ');
  return catLabel;
}

// ═══════════ FILTRAGE QUALITÉ POI ═══════════

// Types historiques à EXCLURE (bruit, très courants, peu d'intérêt touristique)
const HISTORIC_BLACKLIST = new Set([
  'wayside_cross', 'wayside_shrine', 'milestone', 'tomb', 'pillory', 'boundary_stone',
]);

// Les "memorial" sont gardés SEULEMENT s'ils ont un nom propre et un wikidataId
function isLowValueHistoric(tags) {
  if (!tags.historic) return false;
  if (HISTORIC_BLACKLIST.has(tags.historic)) return true;
  if (tags.historic === 'memorial' && !tags.wikidata && (!tags.name || /^(monument aux morts|war memorial|mémorial)/i.test(tags.name))) return true;
  return false;
}

// Score de complétude : POI avec + d'infos = prioritaires
function completenessScore(poi) {
  let score = 0;
  if (poi.name && poi.name !== poi.label) score += 2;
  if (poi.phone) score += 3;
  if (poi.website) score += 3;
  if (poi.address) score += 2;
  if (poi.openingHours) score += 2;
  if (poi.cuisine) score += 1;
  if (poi.stars) score += 2;
  if (poi.description) score += 3;
  if (poi.wikidataId) score += 4;
  if (poi.image) score += 2;
  // Bonus par type d'intérêt
  if (poi.type === 'viewpoint') score += 3;
  if (poi.subtype === 'Château' || poi.subtype === 'Église' || poi.subtype === 'Manoir') score += 3;
  if (poi.subtype === 'Ruines' || poi.subtype === 'Fort' || poi.subtype === 'Tour') score += 2;
  return score;
}

function parseElement(el) {
  const lat = el.lat || el.center?.lat;
  const lon = el.lon || el.center?.lon;
  if (!lat || !lon) return null;
  const tags = el.tags || {};

  // Filtrer les types historiques sans intérêt
  if (isLowValueHistoric(tags)) return null;

  let type, emoji;
  if (tags.tourism === 'viewpoint') { type = 'viewpoint'; emoji = '📍'; }
  else if (tags.amenity === 'restaurant') { type = 'restaurant'; emoji = '🍽️'; }
  else if (tags.amenity === 'cafe') { type = 'restaurant'; emoji = '☕'; }
  else if (tags.tourism === 'hotel' || tags.tourism === 'guest_house') { type = 'hotel'; emoji = '🏨'; }
  else if (tags.tourism === 'museum') { type = 'historic'; emoji = '🏛️'; }
  else if (tags.tourism === 'attraction') { type = 'viewpoint'; emoji = '⭐'; }
  else if (tags.historic) { type = 'historic'; emoji = '🏛️'; }
  else if (tags.tourism === 'picnic_site') { type = 'picnic'; emoji = '🧺'; }
  else if (tags.shop === 'bakery') { type = 'restaurant'; emoji = '🥖'; }
  else if (tags.shop === 'convenience') { type = 'restaurant'; emoji = '🏪'; }
  else { type = 'historic'; emoji = '🏛️'; }
  const cat = POI_CATEGORIES[type];
  const name = poiDisplayName(tags, type, cat.label);
  const poi = {
    id: el.id, name, lat, lon, type, emoji, label: cat.label,
    subtype: type === 'historic' && tags.historic ? (HISTORIC_FR[tags.historic] || tags.historic.replace(/_/g, ' ')) : null,
    address: [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']].filter(Boolean).join(', ') || null,
    phone: tags.phone || tags['contact:phone'] || null,
    website: tags.website || tags['contact:website'] || null,
    openingHours: tags.opening_hours || null,
    cuisine: tags.cuisine || null, stars: tags.stars || null,
    description: tags['description:fr'] || tags.description || null,
    wheelchair: tags.wheelchair || null, outdoorSeating: tags.outdoor_seating || null,
    wikidataId: tags.wikidata || null, image: tags.image || null,
    internetAccess: tags.internet_access || null, takeaway: tags.takeaway || null,
    distToRoute: 0,
  };
  poi._score = completenessScore(poi);
  return poi;
}

// ═══════════ STRATÉGIE AROUND-POLYLINE (DEC-069) ═══════════

/**
 * Sous-échantillonne les coordonnées de la route (~1 point tous les intervalleM mètres).
 * Retourne une string "lat1,lon1,lat2,lon2,..." pour le filtre Overpass around.
 */
function sampleCoordsForOverpass(coords, intervalM = 2000) {
  if (!coords || coords.length < 2) return '';
  const sampled = [[coords[0][1], coords[0][0]]]; // [lat, lon]
  let accumDist = 0;

  for (let i = 1; i < coords.length; i++) {
    const d = distMeters(coords[i][0], coords[i][1], coords[i - 1][0], coords[i - 1][1]);
    accumDist += d;
    if (accumDist >= intervalM) {
      sampled.push([coords[i][1], coords[i][0]]);
      accumDist = 0;
    }
  }
  // Toujours inclure le dernier point
  const last = coords[coords.length - 1];
  const lastSampled = sampled[sampled.length - 1];
  if (Math.abs(last[1] - lastSampled[0]) > 0.0001 || Math.abs(last[0] - lastSampled[1]) > 0.0001) {
    sampled.push([last[1], last[0]]);
  }

  return sampled.map(([lat, lon]) => `${lat.toFixed(5)},${lon.toFixed(5)}`).join(',');
}

/**
 * Estime la longueur totale de la route en mètres (échantillonné).
 */
function estimateRouteLength(coords) {
  let total = 0;
  const step = Math.max(1, Math.floor(coords.length / 200));
  for (let i = step; i < coords.length; i += step) {
    total += distMeters(coords[i][0], coords[i][1], coords[i - step][0], coords[i - step][1]);
  }
  return total;
}

/**
 * Découpe les coordonnées en N segments à peu près égaux.
 */
function splitCoords(coords, n) {
  const segments = [];
  const segLen = Math.ceil(coords.length / n);
  for (let i = 0; i < n; i++) {
    const start = i * segLen;
    // Overlap de 5 points pour ne pas manquer des POI à la jointure
    const end = Math.min((i + 1) * segLen + 5, coords.length);
    if (start < coords.length) {
      segments.push(coords.slice(start, end));
    }
  }
  return segments;
}

/**
 * Construit la requête Overpass avec filtre around (corridor le long de la route).
 */
function buildAroundQuery(aroundStr, radiusM = 3000) {
  const around = `around:${radiusM},${aroundStr}`;
  return `[out:json][timeout:25];(
    nwr["tourism"="viewpoint"](${around});
    nwr["amenity"~"restaurant|cafe"](${around});
    nwr["tourism"~"hotel|guest_house"](${around});
    nwr["historic"]["historic"!="wayside_cross"]["historic"!="milestone"]["historic"!="wayside_shrine"]["historic"!="memorial"](${around});
    nwr["historic"="memorial"]["name"](${around});
    nwr["tourism"="picnic_site"](${around});
    nwr["shop"~"bakery|convenience"](${around});
    nwr["tourism"~"museum|attraction"](${around});
  );out body center;`;
}

/**
 * Calcule une bbox serrée autour d'un segment de route, avec un buffer en degrés.
 * Retourne une string Overpass "minLat,minLng,maxLat,maxLng".
 */
function segmentBbox(coords, bufferDeg = 0.03) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lng, lat] of coords) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return `${(minLat - bufferDeg).toFixed(5)},${(minLng - bufferDeg).toFixed(5)},${(maxLat + bufferDeg).toFixed(5)},${(maxLng + bufferDeg).toFixed(5)}`;
}

/**
 * Construit la requête Overpass classique avec bbox (pour routes courtes).
 */
function buildBboxQuery(bbox) {
  return `[out:json][timeout:25];(
    nwr["tourism"="viewpoint"](${bbox});
    nwr["amenity"~"restaurant|cafe"](${bbox});
    nwr["tourism"~"hotel|guest_house"](${bbox});
    nwr["historic"]["historic"!="wayside_cross"]["historic"!="milestone"]["historic"!="wayside_shrine"]["historic"!="memorial"](${bbox});
    nwr["historic"="memorial"]["name"](${bbox});
    nwr["tourism"="picnic_site"](${bbox});
    nwr["shop"~"bakery|convenience"](${bbox});
    nwr["tourism"~"museum|attraction"](${bbox});
  );out body center;`;
}

// ═══════════ EXPORTS ═══════════

export async function fetchPOIs(routeGeoJSON) {
  const coords = routeGeoJSON?.geometry?.coordinates;
  if (!coords || coords.length < 2) return [];

  const routeLengthM = estimateRouteLength(coords);
  const routeLengthKm = routeLengthM / 1000;

  let allElements = [];

  if (routeLengthKm < 60) {
    // Route courte : bbox classique (plus rapide, moins de données dans la requête)
    const bbox = routeBbox(coords);
    console.log(`VintageRoute POI: route courte (${routeLengthKm.toFixed(0)} km), bbox classique`);
    const query = buildBboxQuery(bbox);
    const data = await fetchOverpass(query);
    allElements = data.elements || [];

  } else {
    // Route longue : découper en petites bboxes serrées (DEC-069)
    // Chaque segment a sa propre bbox avec buffer 3km → beaucoup plus petit qu'un bbox global
    // Round-robin sur les serveurs Overpass pour éviter les 429
    const numSegments = routeLengthKm < 150 ? 2 : routeLengthKm < 300 ? 3 : 4;
    const segments = splitCoords(coords, numSegments);
    console.log(`VintageRoute POI: route longue (${routeLengthKm.toFixed(0)} km), ${numSegments} segments bbox (round-robin)`);

    // Préparer les requêtes — chaque segment a sa propre petite bbox
    const queries = segments.map((seg, i) => {
      const bbox = segmentBbox(seg, 0.03); // buffer ~3km
      const query = buildBboxQuery(bbox);
      console.log(`VintageRoute POI segment ${i + 1}/${numSegments}: bbox ${bbox}`);
      return query;
    });

    // Round-robin : chaque segment envoie à un serveur différent en parallèle
    const results = await Promise.allSettled(
      queries.map((query, i) => {
        const rotatedServers = [
          ...OVERPASS_SERVERS.slice(i % OVERPASS_SERVERS.length),
          ...OVERPASS_SERVERS.slice(0, i % OVERPASS_SERVERS.length),
        ];
        return fetchOverpassWithServers(query, rotatedServers, 30000);
      })
    );

    // Fusionner les résultats réussis, dédupliquer par id
    const seenIds = new Set();
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value?.elements) {
        for (const el of result.value.elements) {
          if (!seenIds.has(el.id)) {
            seenIds.add(el.id);
            allElements.push(el);
          }
        }
      }
    }
    console.log(`VintageRoute POI: ${allElements.length} éléments après fusion/déduplication`);
  }

  if (!allElements.length) return [];

  const pois = allElements.map(parseElement).filter(Boolean);
  const depLon = coords[0][0], depLat = coords[0][1];
  const arrLon = coords[coords.length - 1][0], arrLat = coords[coords.length - 1][1];

  for (const poi of pois) poi.distToRoute = distToRoute(poi.lon, poi.lat, coords);

  const MIN_DIST_DEPART = 500;
  const nearby = pois.filter(p => {
    if (p.distToRoute > POI_MAX_DIST_M) return false;
    const distDep = distMeters(p.lon, p.lat, depLon, depLat);
    const distArr = distMeters(p.lon, p.lat, arrLon, arrLat);
    if (distDep < MIN_DIST_DEPART && distArr < MIN_DIST_DEPART) return false;
    return true;
  });
  // Tri par score de complétude (meilleurs POI en premier), puis par distance
  nearby.sort((a, b) => (b._score - a._score) || (a.distToRoute - b.distToRoute));
  console.log('VintageRoute POI qualité:', nearby.slice(0, 5).map(p => `${p.name} (score:${p._score})`));
  return nearby.slice(0, 30);
}

export async function fetchPOIsInBbox(minLat, minLng, maxLat, maxLng) {
  const bbox = `${minLat.toFixed(5)},${minLng.toFixed(5)},${maxLat.toFixed(5)},${maxLng.toFixed(5)}`;
  const query = `[out:json][timeout:15];(nwr["tourism"="viewpoint"](${bbox});nwr["historic"]["name"](${bbox});nwr["tourism"="picnic_site"](${bbox}););out body center;`;
  const data = await fetchOverpass(query);
  if (!data.elements) return [];
  return data.elements.map(el => {
    const lat = el.lat || el.center?.lat;
    const lon = el.lon || el.center?.lon;
    if (!lat || !lon || !el.tags) return null;
    const tags = el.tags;
    let type = 'historic', emoji = '🏛️';
    if (tags.tourism === 'viewpoint') { type = 'viewpoint'; emoji = '📍'; }
    else if (tags.tourism === 'picnic_site') { type = 'picnic'; emoji = '🧺'; }
    return { id: el.id, name: poiDisplayName(tags, type, POI_CATEGORIES[type].label), lat, lon, type, emoji };
  }).filter(Boolean);
}

export function selectPOIsForBis(pois, maxPois = 3, maxDistM = 5000) {
  if (!pois || !pois.length) return [];
  const nearby = pois.filter(p => p.distToRoute <= maxDistM);
  if (!nearby.length) return [];
  const selected = [], usedTypes = new Set();
  for (const poi of nearby) { if (selected.length >= maxPois) break; if (!usedTypes.has(poi.type)) { selected.push(poi); usedTypes.add(poi.type); } }
  if (selected.length < maxPois) { for (const poi of nearby) { if (selected.length >= maxPois) break; if (!selected.find(s => s.id === poi.id)) selected.push(poi); } }
  return selected.map(p => ({ lng: p.lon, lat: p.lat, name: p.name, type: p.type, label: `${p.emoji} ${p.name}` }));
}

export function sortWaypointsAlongRoute(waypoints, routeCoords) {
  if (!waypoints || waypoints.length <= 1 || !routeCoords) return waypoints;
  const sorted = waypoints.map(wp => ({ ...wp, _proj: projectionAlongRoute(wp.lng, wp.lat, routeCoords) })).sort((a, b) => a._proj - b._proj);
  console.log('VintageRoute tri bis:', sorted.map(w => `${w.name || '?'} @${(w._proj * 100).toFixed(0)}%`));
  return sorted.map(({ _proj, ...rest }) => rest);
}

export function sortWaypointsCircular(waypoints, centerLng, centerLat) {
  if (!waypoints || waypoints.length <= 1) return waypoints;
  const sorted = waypoints.map(wp => ({ ...wp, _angle: Math.atan2(wp.lat - centerLat, wp.lng - centerLng) })).sort((a, b) => a._angle - b._angle);
  console.log('VintageRoute tri boucle:', sorted.map(w => `${w.name || '?'} @${(w._angle * 180 / Math.PI).toFixed(0)}°`));
  return sorted.map(({ _angle, ...rest }) => rest);
}

/**
 * DEC-038 + DEC-040 — Génération de 3 variantes de boucle avec randomisation.
 */
export function generateLoopVariants(isochronePoints, zonePois, centerLng, centerLat, seed = 0) {
  const TWO_PI = 2 * Math.PI;

  function seededRandom(s) {
    let x = Math.sin(s * 9301 + 49297) * 49297;
    return x - Math.floor(x);
  }

  function shuffleWithSeed(arr, s) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(seededRandom(s + i) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function normalizeAngle(a) {
    while (a < 0) a += TWO_PI;
    while (a >= TWO_PI) a -= TWO_PI;
    return a;
  }

  function angleFromCenter(lng, lat) {
    return normalizeAngle(Math.atan2(lat - centerLat, lng - centerLng));
  }

  function directionLabel(angleDeg) {
    const bearing = ((90 - angleDeg) % 360 + 360) % 360;
    const dirs = ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Ouest', 'Nord-Ouest'];
    return dirs[Math.round(bearing / 45) % 8];
  }

  function findBoundaryPoint(targetAngle, isoPts) {
    let best = null, bestScore = Infinity;
    for (const [lng, lat] of isoPts) {
      const a = angleFromCenter(lng, lat);
      const angleDiff = Math.abs(normalizeAngle(a - targetAngle));
      const diff = Math.min(angleDiff, TWO_PI - angleDiff);
      if (diff > Math.PI / 4) continue;
      const dist = Math.sqrt((lng - centerLng) ** 2 + (lat - centerLat) ** 2);
      const score = diff * 3 + Math.abs(dist - 0.65);
      if (score < bestScore) { bestScore = score; best = { lng, lat }; }
    }
    return best;
  }

  const SECTOR_ROTATION = seed * 40;
  const SECTORS = [0, 120, 240].map(base => {
    const startDeg = (base + SECTOR_ROTATION) % 360;
    const midDeg = (startDeg + 60) % 360;
    return { startDeg, endDeg: (startDeg + 120) % 360, midDeg, label: directionLabel(midDeg) };
  });

  let maxDist = 0;
  for (const [lng, lat] of isochronePoints) {
    const d = Math.sqrt((lng - centerLng) ** 2 + (lat - centerLat) ** 2);
    if (d > maxDist) maxDist = d;
  }

  const annotatedPois = zonePois.map(p => ({
    ...p, angle: angleFromCenter(p.lon, p.lat),
    dist: Math.sqrt((p.lon - centerLng) ** 2 + (p.lat - centerLat) ** 2),
  }));

  const variants = [];
  for (let s = 0; s < 3; s++) {
    const sector = SECTORS[s];
    const startRad = normalizeAngle(sector.startDeg * Math.PI / 180);
    const endRad = normalizeAngle(sector.endDeg * Math.PI / 180);

    const sectorPois = annotatedPois.filter(p => {
      const inRange = p.dist > maxDist * 0.35 && p.dist < maxDist * 0.75;
      if (!inRange) return false;
      if (startRad < endRad) return p.angle >= startRad && p.angle < endRad;
      return p.angle >= startRad || p.angle < endRad;
    });

    let wps = [];
    if (sectorPois.length >= 2) {
      const shuffled = shuffleWithSeed(sectorPois, seed * 7 + s * 13);
      const candidates = shuffled.slice(0, Math.min(8, shuffled.length));
      candidates.sort((a, b) => b.dist - a.dist);
      const selected = [candidates[0]];
      for (const poi of candidates.slice(1)) {
        if (selected.length >= 3) break;
        const minAngleDiff = selected.reduce((min, sel) => {
          const diff = Math.abs(normalizeAngle(sel.angle - poi.angle));
          return Math.min(min, diff, TWO_PI - diff);
        }, Infinity);
        if (minAngleDiff > Math.PI / 4 || selected.length < 2) selected.push(poi);
      }
      if (selected.length < 2) {
        for (const poi of candidates) {
          if (selected.length >= 3) break;
          if (!selected.find(sel => sel.id === poi.id)) selected.push(poi);
        }
      }
      wps = selected.map(p => ({ lng: p.lon, lat: p.lat, name: p.name, label: `${p.emoji} ${p.name}` }));
    }

    if (wps.length < 2) {
      const angles = [(sector.startDeg + 36) * Math.PI / 180, (sector.startDeg + 84) * Math.PI / 180];
      for (const targetAngle of angles) {
        if (wps.length >= 3) break;
        const bp = findBoundaryPoint(normalizeAngle(targetAngle), isochronePoints);
        if (bp && !wps.some(w => Math.abs(w.lng - bp.lng) < 0.005 && Math.abs(w.lat - bp.lat) < 0.005)) {
          wps.push({ lng: bp.lng, lat: bp.lat, name: 'Point de passage', label: '📍 Point de passage' });
        }
      }
    }

    if (wps.length < 2) {
      const r = maxDist * 0.60;
      const a1 = (sector.startDeg + 40) * Math.PI / 180;
      const a2 = (sector.startDeg + 80) * Math.PI / 180;
      wps = [
        { lng: centerLng + r * Math.cos(a1), lat: centerLat + r * Math.sin(a1), name: 'Point de passage', label: '📍 Point de passage' },
        { lng: centerLng + r * Math.cos(a2), lat: centerLat + r * Math.sin(a2), name: 'Point de passage', label: '📍 Point de passage' },
      ];
    }

    wps = sortWaypointsCircular(wps, centerLng, centerLat);
    variants.push({ label: sector.label, emoji: '🧭', waypoints: wps, hasPois: sectorPois.length >= 2, poiCount: sectorPois.length });
  }

  console.log('VintageRoute boucle variantes (seed=' + seed + '):', variants.map(v => `${v.label}: ${v.waypoints.length} wps, ${v.poiCount} POI`));
  return variants;
}

export { POI_CATEGORIES } from '../config';
export { fetchOverpass };
