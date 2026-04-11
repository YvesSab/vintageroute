/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */
import { fetchOverpass } from './poi';
export async function calculateScenicScore(routeGeoJSON) {
  const coords = routeGeoJSON?.geometry?.coordinates;
  if (!coords || coords.length < 2) return { score: 0, details: {}, label: 'Inconnu' };
  const bbox = routeBbox(coords, 3);
  const query = `[out:json][timeout:10];(way["waterway"~"river|stream"](${bbox});way["natural"="wood"](${bbox});node["tourism"="viewpoint"](${bbox});node["historic"](${bbox}););out count;`;
  try {
    const data = await fetchOverpass(query);
    let total = 0;
    if (data.elements?.length > 0) { const el = data.elements[0]; total = (el.tags?.total) ? parseInt(el.tags.total,10)||0 : data.elements.length; }
    let totalDist = 0;
    for (let i=1; i<coords.length; i++) totalDist += haversine(coords[i-1][1],coords[i-1][0],coords[i][1],coords[i][0]);
    const d = totalDist > 0 ? total/totalDist : 0;
    let score; if (d<1) score=1; else if (d<3) score=2; else if (d<6) score=3; else if (d<10) score=4; else score=5;
    const labels = {1:'Peu paysager',2:'Agréable',3:'Joli parcours',4:'Très beau',5:'Exceptionnel'};
    return { score, details: { totalElements: total, distanceKm: Math.round(totalDist*10)/10, densityPerKm: Math.round(d*10)/10 }, label: labels[score] };
  } catch (err) { console.warn('VintageRoute scoring error:', err.message); return { score: 0, details: {}, label: 'Indisponible' }; }
}
function routeBbox(coords, bKm) {
  let minLng=Infinity, maxLng=-Infinity, minLat=Infinity, maxLat=-Infinity;
  for (const [lng,lat] of coords) { if(lng<minLng) minLng=lng; if(lng>maxLng) maxLng=lng; if(lat<minLat) minLat=lat; if(lat>maxLat) maxLat=lat; }
  const b=bKm*0.009; return `${(minLat-b).toFixed(5)},${(minLng-b).toFixed(5)},${(maxLat+b).toFixed(5)},${(maxLng+b).toFixed(5)}`;
}
function haversine(lat1,lon1,lat2,lon2) {
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
