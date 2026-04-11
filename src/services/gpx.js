/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */

/**
 * Exporte un itinéraire GeoJSON en fichier GPX.
 *
 * @param {object} routeGeoJSON - Feature GeoJSON avec geometry LineString
 * @param {object} [meta] - Métadonnées optionnelles
 * @param {string} [meta.name] - Nom du parcours
 * @param {number} [meta.distance] - Distance en km
 * @param {number} [meta.duration] - Durée en minutes
 * @param {Array} [meta.waypoints] - POI / étapes [{name, lat, lon}]
 */
export function exportGPX(routeGeoJSON, meta = {}) {
  const coords = routeGeoJSON?.geometry?.coordinates;
  if (!coords || coords.length < 2) return;

  const name = meta.name || 'VintageRoute - Itinéraire';
  const now = new Date().toISOString();

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1"
     creator="VintageRoute"
     version="1.1">
  <metadata>
    <name>${escapeXml(name)}</name>
    <desc>Itinéraire généré par VintageRoute — Navigation pour voitures anciennes</desc>
    <author><name>VintageRoute</name></author>
    <time>${now}</time>
  </metadata>
`;

  // Waypoints (étapes, POI)
  if (meta.waypoints && meta.waypoints.length > 0) {
    for (const wp of meta.waypoints) {
      gpx += `  <wpt lat="${wp.lat}" lon="${wp.lon}">
    <name>${escapeXml(wp.name || 'Étape')}</name>
    ${wp.type ? `<type>${escapeXml(wp.type)}</type>` : ''}
  </wpt>
`;
    }
  }

  // Track (itinéraire)
  gpx += `  <trk>
    <name>${escapeXml(name)}</name>
    ${meta.distance ? `<desc>Distance: ${meta.distance.toFixed(1)} km` +
      (meta.duration ? `, Durée: ${Math.round(meta.duration)} min` : '') + `</desc>` : ''}
    <trkseg>
`;

  for (const coord of coords) {
    const [lng, lat, alt] = coord;
    gpx += `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}">`;
    if (alt != null && alt > -9999) {
      gpx += `<ele>${alt.toFixed(1)}</ele>`;
    }
    gpx += `</trkpt>\n`;
  }

  gpx += `    </trkseg>
  </trk>
</gpx>`;

  downloadFile(gpx, `vintageroute-${dateString()}.gpx`, 'application/gpx+xml');
}

/**
 * Importe un fichier GPX et retourne le tracé en GeoJSON.
 *
 * @param {File} file - Fichier GPX
 * @returns {Promise<{geojson: object, name: string, waypoints: Array}>}
 */
export async function importGPX(file) {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Fichier GPX invalide');
  }

  const name = doc.querySelector('trk > name')?.textContent ||
               doc.querySelector('metadata > name')?.textContent ||
               file.name.replace(/\.gpx$/i, '');

  // Extraire les points du track
  const trkpts = doc.querySelectorAll('trkpt');
  const coordinates = [];

  for (const pt of trkpts) {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lng = parseFloat(pt.getAttribute('lon'));
    const ele = pt.querySelector('ele');
    if (!isNaN(lat) && !isNaN(lng)) {
      const coord = [lng, lat];
      if (ele) coord.push(parseFloat(ele.textContent));
      coordinates.push(coord);
    }
  }

  if (coordinates.length < 2) {
    // Essayer les routes (rte/rtept) si pas de track
    const rtepts = doc.querySelectorAll('rtept');
    for (const pt of rtepts) {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lng = parseFloat(pt.getAttribute('lon'));
      if (!isNaN(lat) && !isNaN(lng)) {
        coordinates.push([lng, lat]);
      }
    }
  }

  if (coordinates.length < 2) {
    throw new Error('Aucun tracé trouvé dans le fichier GPX');
  }

  // Extraire les waypoints
  const wpts = doc.querySelectorAll('wpt');
  const waypoints = [];
  for (const wp of wpts) {
    const lat = parseFloat(wp.getAttribute('lat'));
    const lng = parseFloat(wp.getAttribute('lon'));
    const wpName = wp.querySelector('name')?.textContent || 'Waypoint';
    if (!isNaN(lat) && !isNaN(lng)) {
      waypoints.push({ lat, lon: lng, name: wpName });
    }
  }

  return {
    geojson: {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: { name },
    },
    name,
    waypoints,
  };
}

/**
 * Échappe les caractères XML spéciaux.
 */
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Date au format YYYYMMDD pour les noms de fichier.
 */
function dateString() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Déclenche le téléchargement d'un fichier texte.
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
