/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 *
 * DEC-060 — Enrichissement POI en cascade
 * DEC-065 — Phase 0 : Wikidata SPARQL batch par bbox
 * Sources : Wikidata SPARQL + Wikipedia GeoSearch + Photon (Komoot) + cache localStorage
 */

import { WIKIPEDIA_API, PHOTON_API, POI_CACHE_TTL, WIKIDATA_SPARQL_URL, SPARQL_MONUMENT_TYPES, TIMEOUT_WIKIDATA } from '../config';
import { fetchWikidataInfo } from './wikidata';
import { distMeters } from './utils';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ═══════════ CACHE LOCALSTORAGE ═══════════

function getCached(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > POI_CACHE_TTL) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function setCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); }
  catch { /* localStorage plein — ignorer */ }
}

// ═══════════ PHASE 0 : WIKIDATA SPARQL BATCH (DEC-065) ═══════════

/**
 * Arrondit la bbox à 0.1° (~11km) pour permettre le cache entre itinéraires proches.
 */
function roundBboxKey(minLat, minLon, maxLat, maxLon) {
  const r = (v) => (Math.floor(v * 10) / 10).toFixed(1);
  return `sparql_${r(minLat)}_${r(minLon)}_${r(maxLat)}_${r(maxLon)}`;
}

/**
 * Récupère les monuments patrimoniaux via SPARQL Wikidata dans une bbox.
 * Retourne un tableau de { qid, label, description, lat, lon, image, dateBuilt, wikipedia }.
 */
async function fetchWikidataSPARQL(minLat, minLon, maxLat, maxLon) {
  // Cache arrondi
  const cacheKey = roundBboxKey(minLat, minLon, maxLat, maxLon);
  const cached = getCached(cacheKey);
  if (cached) {
    console.log('VintageRoute SPARQL: cache hit', cached.length, 'monuments');
    return cached;
  }

  const types = SPARQL_MONUMENT_TYPES.map(t => `wd:${t}`).join(', ');
  const query = `SELECT ?item ?itemLabel ?itemDescription ?coord ?image ?inception ?article WHERE {
  SERVICE wikibase:box {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(${minLon.toFixed(4)} ${minLat.toFixed(4)})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(${maxLon.toFixed(4)} ${maxLat.toFixed(4)})"^^geo:wktLiteral .
  }
  ?item wdt:P31 ?type .
  FILTER(?type IN (${types}))
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P571 ?inception }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://fr.wikipedia.org/> . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}
LIMIT 200`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_WIKIDATA * 3); // 30s pour SPARQL
    const url = `${WIKIDATA_SPARQL_URL}?format=json&query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/sparql-results+json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) { console.warn('VintageRoute SPARQL:', res.status); return []; }
    const data = await res.json();

    const results = [];
    const seen = new Set(); // dédupliquer par QID
    for (const b of (data.results?.bindings || [])) {
      const qid = b.item?.value?.split('/').pop();
      if (!qid || seen.has(qid)) continue;
      seen.add(qid);

      // Parser les coordonnées WKT "Point(lon lat)"
      const coordStr = b.coord?.value || '';
      const m = coordStr.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
      if (!m) continue;
      const lon = parseFloat(m[1]);
      const lat = parseFloat(m[2]);
      if (isNaN(lon) || isNaN(lat)) continue;

      // Image Commons : transformer en URL de thumbnail
      let image = null;
      if (b.image?.value) {
        const filename = decodeURIComponent(b.image.value.split('/').pop());
        image = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=400`;
      }

      // Date de construction
      let dateBuilt = null;
      if (b.inception?.value) {
        const yr = b.inception.value.match(/(\d{4})/);
        if (yr) dateBuilt = yr[1];
      }

      // Lien Wikipedia FR
      let wikipedia = null;
      if (b.article?.value) {
        wikipedia = b.article.value;
      }

      results.push({
        qid,
        label: b.itemLabel?.value || qid,
        description: b.itemDescription?.value || null,
        lat, lon, image, dateBuilt, wikipedia,
      });
    }

    console.log('VintageRoute SPARQL:', results.length, 'monuments dans la bbox');
    if (results.length > 0) setCache(cacheKey, results);
    return results;
  } catch (e) {
    if (e.name === 'AbortError') console.warn('VintageRoute SPARQL: timeout');
    else console.warn('VintageRoute SPARQL:', e.message);
    return [];
  }
}

/**
 * Cross-référence les résultats SPARQL avec les POI Overpass.
 * Si un monument SPARQL est à < 150m d'un POI existant → enrichir le POI.
 * Si non → le monument est ignoré (il n'est pas sur le parcours).
 */
function matchSparqlToPois(sparqlResults, enriched) {
  let matchCount = 0;
  for (const sp of sparqlResults) {
    let bestIdx = -1, bestDist = 150; // seuil 150m
    for (let i = 0; i < enriched.length; i++) {
      const p = enriched[i];
      if (p.type !== 'historic' && p.type !== 'viewpoint') continue;
      const d = distMeters(sp.lon, sp.lat, p.lon, p.lat);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx >= 0) {
      const existing = enriched[bestIdx];
      enriched[bestIdx] = {
        ...existing,
        description: existing.description || sp.description || '',
        wikiImage: existing.wikiImage || sp.image || null,
        wikipedia: existing.wikipedia || sp.wikipedia || null,
        dateBuilt: existing.dateBuilt || sp.dateBuilt || null,
        wikidataId: existing.wikidataId || sp.qid || null,
      };
      matchCount++;
    }
  }
  return matchCount;
}

// ═══════════ WIKIPEDIA GEOSEARCH ═══════════

/**
 * Cherche un article Wikipedia FR près d'un point géographique.
 * Retourne : { description, image, title, url } ou null
 */
async function fetchWikipediaGeo(lat, lon) {
  try {
    const url = `${WIKIPEDIA_API}?action=query&prop=extracts|pageimages&exintro=1&explaintext=1&exchars=250&pithumbsize=400&generator=geosearch&ggsradius=200&ggscoord=${lat}|${lon}&format=json&origin=*`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.query?.pages) return null;

    const pages = Object.values(data.query.pages);
    if (!pages.length) return null;
    const page = pages[0];

    return {
      description: page.extract || null,
      image: page.thumbnail?.source || null,
      title: page.title || null,
      url: page.title ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(page.title)}` : null,
    };
  } catch (e) {
    console.warn('VintageRoute Wikipedia:', e.message);
    return null;
  }
}

// ═══════════ PHOTON REVERSE GEOCODING ═══════════

/**
 * Reverse geocoding via Photon (Komoot) — plus rapide que Nominatim, pas de 1 req/sec strict.
 * Retourne une adresse formatée ou null.
 */
async function fetchPhotonAddress(lat, lon) {
  try {
    const res = await fetch(`${PHOTON_API}?lon=${lon}&lat=${lat}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.features?.length) return null;

    const p = data.features[0].properties;
    const parts = [];
    if (p.street) parts.push(p.housenumber ? `${p.street} ${p.housenumber}` : p.street);
    if (p.postcode || p.city || p.town || p.village) {
      parts.push([p.postcode, p.city || p.town || p.village].filter(Boolean).join(' '));
    }
    return parts.join(', ') || null;
  } catch (e) {
    console.warn('VintageRoute Photon:', e.message);
    return null;
  }
}

// ═══════════ PIPELINE D'ENRICHISSEMENT ═══════════

/**
 * Enrichit une liste de POI en cascade (arrière-plan, progressif).
 * 0. SPARQL Wikidata batch (monuments par bbox) — DEC-065
 * 1. Cache localStorage
 * 2. Wikidata (monuments avec QID)
 * 3. Wikipedia GeoSearch (monuments/viewpoints sans description)
 * 4. Photon (adresses manquantes)
 *
 * @param {Array} pois — POI bruts depuis Overpass
 * @param {function} onUpdate — callback(enrichedPois) appelé progressivement
 * @param {Array<[number,number]>} [routeCoords] — coordonnées de la route pour le SPARQL bbox
 * @returns {Promise<Array>} POI enrichis
 */
export async function enrichPOIs(pois, onUpdate, routeCoords) {
  if (!pois?.length) return pois;

  const enriched = [...pois];
  let updated = false;

  // ── Phase 0 : Wikidata SPARQL batch par bbox (DEC-065) ──
  if (routeCoords?.length >= 2) {
    try {
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const [lng, lat] of routeCoords) {
        if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
      }
      // Buffer léger (0.02° ≈ 2km) car les POI sont déjà filtrés par Overpass à 5km
      const b = 0.02;
      const sparqlResults = await fetchWikidataSPARQL(minLat - b, minLng - b, maxLat + b, maxLng + b);
      if (sparqlResults.length > 0) {
        const matched = matchSparqlToPois(sparqlResults, enriched);
        if (matched > 0) {
          updated = true;
          if (onUpdate) onUpdate([...enriched]);
          console.log('VintageRoute SPARQL enrichi:', matched, '/', sparqlResults.length, 'monuments matchés');
        }
      }
    } catch (e) {
      console.warn('VintageRoute SPARQL Phase 0:', e.message);
    }
  }

  // ── Phase 1 : Wikidata batch (monuments avec QID) ──
  const wikidataPois = pois.filter((p, i) => p.wikidataId && p.type === 'historic' && !enriched[i].description);
  if (wikidataPois.length > 0) {
    const wikiResults = await Promise.allSettled(
      wikidataPois.map(p => {
        const cached = getCached(`wd_${p.wikidataId}`);
        if (cached) return Promise.resolve(cached);
        return fetchWikidataInfo(p.wikidataId).then(r => { if (r) setCache(`wd_${p.wikidataId}`, r); return r; });
      })
    );
    wikidataPois.forEach((p, wi) => {
      if (wikiResults[wi].status !== 'fulfilled' || !wikiResults[wi].value) return;
      const w = wikiResults[wi].value;
      const idx = pois.indexOf(p);
      enriched[idx] = { ...enriched[idx],
        description: enriched[idx].description || w.description || '',
        wikiImage: w.image || null,
        wikipedia: w.wikipedia || null,
        dateBuilt: w.dateBuilt || null,
      };
      updated = true;
    });
    if (updated && onUpdate) onUpdate([...enriched]);
    console.log('VintageRoute enrichissement Wikidata:', wikidataPois.length, 'monuments');
  }

  // ── Phase 2 : Wikipedia GeoSearch (POI sans description) ──
  const needsWiki = [];
  for (let i = 0; i < enriched.length; i++) {
    const p = enriched[i];
    if (!p.description && !p.wikiImage && (p.type === 'historic' || p.type === 'viewpoint')) {
      needsWiki.push(i);
    }
  }
  if (needsWiki.length > 0) {
    let wikiCount = 0;
    for (const idx of needsWiki.slice(0, 15)) { // max 15 appels Wikipedia
      const p = enriched[idx];
      const cacheKey = `wp_${p.lat.toFixed(4)}_${p.lon.toFixed(4)}`;
      let wiki = getCached(cacheKey);
      if (!wiki) {
        wiki = await fetchWikipediaGeo(p.lat, p.lon);
        if (wiki) setCache(cacheKey, wiki);
        await sleep(150); // throttle léger
      }
      if (wiki) {
        enriched[idx] = { ...enriched[idx],
          description: enriched[idx].description || wiki.description || '',
          wikiImage: enriched[idx].wikiImage || wiki.image || null,
          wikipedia: enriched[idx].wikipedia || wiki.url || null,
        };
        wikiCount++;
      }
    }
    if (wikiCount > 0) { updated = true; if (onUpdate) onUpdate([...enriched]); }
    console.log('VintageRoute enrichissement Wikipedia:', wikiCount, '/', needsWiki.length);
  }

  // ── Phase 3 : Photon reverse geocoding (adresses manquantes) ──
  const needsAddr = [];
  for (let i = 0; i < enriched.length; i++) {
    if (!enriched[i].address && (enriched[i].type === 'restaurant' || enriched[i].type === 'hotel')) {
      needsAddr.push(i);
    }
  }
  if (needsAddr.length > 0) {
    let addrCount = 0;
    for (const idx of needsAddr.slice(0, 15)) { // max 15 appels Photon
      const p = enriched[idx];
      const cacheKey = `ph_${p.lat.toFixed(4)}_${p.lon.toFixed(4)}`;
      let addr = getCached(cacheKey);
      if (!addr) {
        addr = await fetchPhotonAddress(p.lat, p.lon);
        if (addr) setCache(cacheKey, addr);
        await sleep(200); // throttle Photon
      }
      if (addr) {
        enriched[idx] = { ...enriched[idx], address: addr };
        addrCount++;
      }
    }
    if (addrCount > 0) { updated = true; if (onUpdate) onUpdate([...enriched]); }
    console.log('VintageRoute enrichissement Photon:', addrCount, 'adresses');
  }

  return enriched;
}
