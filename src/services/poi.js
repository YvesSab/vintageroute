/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */
const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
];
const HISTORIC_FR = {
  memorial: 'Mémorial', castle: 'Château', church: 'Église', chapel: 'Chapelle',
  ruins: 'Ruines', archaeological_site: 'Site archéologique', monument: 'Monument',
  wayside_cross: 'Croix de chemin', wayside_shrine: 'Oratoire', manor: 'Manoir',
  tower: 'Tour', bridge: 'Pont historique', tomb: 'Tombe', pillory: 'Pilori',
  milestone: 'Borne kilométrique', city_gate: 'Porte de ville',
  building: 'Bâtiment historique', battlefield: 'Champ de bataille', fort: 'Fort', yes: 'Site historique',
};
function routeBbox(coords, bufferKm = 5) {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) { if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng; if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat; }
  const b = bufferKm * 0.009;
  return `${(minLat-b).toFixed(5)},${(minLng-b).toFixed(5)},${(maxLat+b).toFixed(5)},${(maxLng+b).toFixed(5)}`;
}
function distMeters(lon1, lat1, lon2, lat2) {
  const R = 6371000, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function distToRoute(poiLon, poiLat, routeCoords) {
  let minD = Infinity; const step = Math.max(1, Math.floor(routeCoords.length/100));
  for (let i=0; i<routeCoords.length; i+=step) { const d = distMeters(poiLon, poiLat, routeCoords[i][0], routeCoords[i][1]); if (d<minD) minD=d; }
  return minD;
}
function projectionAlongRoute(poiLon, poiLat, routeCoords) {
  let minD = Infinity, bestIdx = 0; const step = Math.max(1, Math.floor(routeCoords.length/200));
  for (let i=0; i<routeCoords.length; i+=step) { const d = distMeters(poiLon, poiLat, routeCoords[i][0], routeCoords[i][1]); if (d<minD) { minD=d; bestIdx=i; } }
  return bestIdx / Math.max(1, routeCoords.length-1);
}
function poiDisplayName(tags, type, catLabel) {
  if (tags.name) return tags.name;
  if (type === 'historic' && tags.historic) return HISTORIC_FR[tags.historic] || tags.historic.replace(/_/g, ' ');
  return catLabel;
}
const POI_CATEGORIES = {
  viewpoint: { emoji: '📍', label: 'Point de vue' }, restaurant: { emoji: '🍽️', label: 'Restaurant' },
  hotel: { emoji: '🏨', label: 'Hôtel' }, historic: { emoji: '🏛️', label: 'Monument' },
  picnic: { emoji: '🧺', label: 'Aire de pique-nique' }, village: { emoji: '🏘️', label: 'Village classé' },
};
async function fetchOverpass(query) {
  let lastError = null;
  for (const serverUrl of OVERPASS_SERVERS) {
    try {
      const shortName = serverUrl.split('//')[1].split('/')[0];
      console.log('VintageRoute Overpass: essai', shortName);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(serverUrl, { method: 'POST', body: `data=${encodeURIComponent(query)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) { lastError = new Error(`Overpass ${response.status} (${shortName})`); console.warn('VintageRoute Overpass:', lastError.message, '→ fallback'); continue; }
      const data = await response.json(); console.log('VintageRoute Overpass: succès via', shortName); return data;
    } catch (err) { lastError = err; console.warn('VintageRoute Overpass:', err.message, '→ fallback'); continue; }
  }
  throw lastError || new Error('Tous les serveurs Overpass sont indisponibles');
}
export async function fetchPOIs(routeGeoJSON) {
  const coords = routeGeoJSON?.geometry?.coordinates; if (!coords || coords.length < 2) return [];
  const bbox = routeBbox(coords);
  const query = `[out:json][timeout:15];(node["tourism"="viewpoint"](${bbox});node["amenity"="restaurant"](${bbox});node["tourism"="hotel"](${bbox});node["historic"](${bbox});node["tourism"="picnic_site"](${bbox}););out body;`;
  const data = await fetchOverpass(query); if (!data.elements) return [];
  const pois = data.elements.filter(el => el.lat && el.lon).map(el => {
    const tags = el.tags || {}; let type, emoji;
    if (tags.tourism === 'viewpoint') { type='viewpoint'; emoji='📍'; }
    else if (tags.amenity === 'restaurant') { type='restaurant'; emoji='🍽️'; }
    else if (tags.tourism === 'hotel') { type='hotel'; emoji='🏨'; }
    else if (tags.historic) { type='historic'; emoji='🏛️'; }
    else if (tags.tourism === 'picnic_site') { type='picnic'; emoji='🧺'; }
    else { type='historic'; emoji='🏛️'; }
    const cat = POI_CATEGORIES[type]; const name = poiDisplayName(tags, type, cat.label);
    return { id: el.id, name, lat: el.lat, lon: el.lon, type, emoji, label: cat.label,
      subtype: type==='historic'&&tags.historic ? (HISTORIC_FR[tags.historic]||tags.historic.replace(/_/g,' ')) : null,
      address: [tags['addr:street'],tags['addr:city']].filter(Boolean).join(', ')||null,
      phone: tags.phone||null, website: tags.website||null, openingHours: tags.opening_hours||null,
      cuisine: tags.cuisine||null, stars: tags.stars||null, description: tags.description||null, distToRoute: 0 };
  });
  for (const poi of pois) poi.distToRoute = distToRoute(poi.lon, poi.lat, coords);
  pois.sort((a,b) => a.distToRoute - b.distToRoute);
  return pois.slice(0, 50);
}
export async function fetchPOIsInBbox(minLat, minLng, maxLat, maxLng) {
  const bbox = `${minLat.toFixed(5)},${minLng.toFixed(5)},${maxLat.toFixed(5)},${maxLng.toFixed(5)}`;
  const query = `[out:json][timeout:15];(node["tourism"="viewpoint"](${bbox});node["historic"]["name"](${bbox});node["tourism"="picnic_site"](${bbox}););out body;`;
  const data = await fetchOverpass(query); if (!data.elements) return [];
  return data.elements.filter(el => el.lat&&el.lon&&el.tags).map(el => {
    const tags = el.tags; let type='historic', emoji='🏛️';
    if (tags.tourism==='viewpoint') { type='viewpoint'; emoji='📍'; }
    else if (tags.tourism==='picnic_site') { type='picnic'; emoji='🧺'; }
    return { id: el.id, name: poiDisplayName(tags, type, POI_CATEGORIES[type].label), lat: el.lat, lon: el.lon, type, emoji };
  });
}
export function selectPOIsForBis(pois, maxPois=3, maxDistM=5000) {
  if (!pois || !pois.length) return [];
  const nearby = pois.filter(p => p.distToRoute <= maxDistM); if (!nearby.length) return [];
  const selected = [], usedTypes = new Set();
  for (const poi of nearby) { if (selected.length >= maxPois) break; if (!usedTypes.has(poi.type)) { selected.push(poi); usedTypes.add(poi.type); } }
  if (selected.length < maxPois) { for (const poi of nearby) { if (selected.length >= maxPois) break; if (!selected.find(s => s.id===poi.id)) selected.push(poi); } }
  return selected.map(p => ({ lng: p.lon, lat: p.lat, name: p.name, type: p.type, label: `${p.emoji} ${p.name}` }));
}
export function sortWaypointsAlongRoute(waypoints, routeCoords) {
  if (!waypoints || waypoints.length <= 1 || !routeCoords) return waypoints;
  const sorted = waypoints.map(wp => ({ ...wp, _proj: projectionAlongRoute(wp.lng, wp.lat, routeCoords) })).sort((a,b) => a._proj - b._proj);
  console.log('VintageRoute tri bis:', sorted.map(w => `${w.name||'?'} @${(w._proj*100).toFixed(0)}%`));
  return sorted.map(({ _proj, ...rest }) => rest);
}
export function sortWaypointsCircular(waypoints, centerLng, centerLat) {
  if (!waypoints || waypoints.length <= 1) return waypoints;
  const sorted = waypoints.map(wp => ({ ...wp, _angle: Math.atan2(wp.lat - centerLat, wp.lng - centerLng) })).sort((a,b) => a._angle - b._angle);
  console.log('VintageRoute tri boucle:', sorted.map(w => `${w.name||'?'} @${(w._angle*180/Math.PI).toFixed(0)}°`));
  return sorted.map(({ _angle, ...rest }) => rest);
}
export { POI_CATEGORIES, fetchOverpass };
