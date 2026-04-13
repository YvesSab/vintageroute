/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 *
 * DEC-047 — Enrichissement Wikidata pour monuments historiques
 * Source : OsmAPP (github.com/zbycz/osmapp), MapComplete (github.com/pietervdvn/MapComplete)
 */

const cache = new Map();

/**
 * Récupère les infos Wikidata pour un monument historique.
 * Appel lazy (uniquement quand l'utilisateur déplie le POI).
 * Cache en mémoire pour éviter les appels répétés.
 *
 * @param {string} qid — Wikidata ID (ex: "Q12345")
 * @returns {Promise<{description, image, website, wikipedia}|null>}
 */
export async function fetchWikidataInfo(qid) {
  if (!qid || !qid.startsWith('Q')) return null;
  if (cache.has(qid)) return cache.get(qid);

  try {
    const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
    const resp = await fetch(url);
    if (!resp.ok) { console.warn('Wikidata', resp.status, qid); return null; }
    const data = await resp.json();
    const entity = data?.entities?.[qid];
    if (!entity) return null;

    // Description : français prioritaire, anglais en fallback
    const description = entity.descriptions?.fr?.value
      || entity.descriptions?.en?.value
      || null;

    // Image principale (Wikidata P18 → Wikimedia Commons)
    const imageFile = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    const image = imageFile
      ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imageFile)}?width=300`
      : null;

    // Site officiel (P856)
    const website = entity.claims?.P856?.[0]?.mainsnak?.datavalue?.value || null;

    // Lien Wikipedia français
    const wikipedia = entity.sitelinks?.frwiki?.url || null;

    // Date de construction (P571) — année seulement
    let dateBuilt = null;
    const p571 = entity.claims?.P571?.[0]?.mainsnak?.datavalue?.value?.time;
    if (p571) {
      const match = p571.match(/\+(\d{4})/);
      if (match) dateBuilt = match[1];
    }

    // Style architectural (P149) — label FR via l'ID
    // On ne résout pas le Q-ID ici (trop d'appels), on stocke juste le label si dispo
    const styleId = entity.claims?.P149?.[0]?.mainsnak?.datavalue?.value?.id;

    const info = { description, image, website, wikipedia, dateBuilt, styleId };
    cache.set(qid, info);
    return info;
  } catch (err) {
    console.warn('Wikidata erreur:', qid, err.message);
    return null;
  }
}
