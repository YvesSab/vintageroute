/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 *
 * DEC-046 — Affichage POI enrichi (accordéon, phone, website, cuisine FR)
 * DEC-047 — Enrichissement Wikidata pour monuments historiques
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { POI_CATEGORIES } from '../services/poi';
import { CUISINE_FR } from '../config';
import { fetchWikidataInfo } from '../services/wikidata';

function formatDist(m) { return m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(1)} km`; }

function formatCuisine(raw) {
  if (!raw) return '';
  return raw.split(/[;,]/).map(c => { const k = c.trim().toLowerCase(); return CUISINE_FR[k] || (k.charAt(0).toUpperCase() + k.slice(1)); }).join(', ');
}

/**
 * Composant POI individuel avec panneau dépliable (accordéon).
 * Chargement lazy de Wikidata pour les monuments historiques.
 */
function POIItem({ poi, isExpanded, onToggle, onPoiClick, selectionMode, isSel, onToggleSel, isHighlighted }) {
  const [wikidata, setWikidata] = useState(null);
  const [wikiLoading, setWikiLoading] = useState(false);

  // DEC-047 : charger Wikidata quand on déplie un POI historic avec wikidataId
  useEffect(() => {
    if (isExpanded && poi.wikidataId && poi.type === 'historic' && !wikidata && !wikiLoading) {
      setWikiLoading(true);
      fetchWikidataInfo(poi.wikidataId)
        .then(info => { if (info) setWikidata(info); })
        .finally(() => setWikiLoading(false));
    }
  }, [isExpanded, poi.wikidataId, poi.type, wikidata, wikiLoading]);

  const handleClick = () => {
    if (selectionMode) { onToggleSel(poi.id); }
    else { onToggle(poi.id); }
  };

  const handleZoom = (e) => {
    e.stopPropagation();
    if (onPoiClick) onPoiClick(poi);
  };

  const hasDetails = poi.subtype || poi.address || poi.cuisine || poi.openingHours
    || poi.phone || poi.website || poi.description || poi.stars || poi.wikidataId || poi.wikiImage || poi.dateBuilt;

  return (
    <div className={`rounded-lg border transition-all duration-300
      ${isHighlighted ? 'border-[var(--vr-gold)] bg-yellow-50 ring-2 ring-[var(--vr-gold)]'
        : isSel ? 'border-blue-400 bg-blue-50'
        : isExpanded ? 'border-[var(--vr-green)] bg-green-50'
        : 'border-gray-200 hover:bg-gray-50'}`}>

      {/* Ligne compacte — toujours visible */}
      <button type="button" onClick={handleClick} className="w-full text-left px-3 py-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-1">
            {selectionMode && <span className={`inline-flex items-center justify-center w-5 h-5 rounded border text-xs mr-1 ${isSel?'bg-blue-500 text-white border-blue-500':'bg-white border-gray-300'}`}>{isSel?'✓':''}</span>}
            <span className="mr-1">{poi.emoji}</span>
            <span className="font-medium truncate">{poi.name}</span>
          </div>
          <div className="flex items-center gap-1">
            {poi.distToRoute > 0 && <span className="text-xs text-gray-400 whitespace-nowrap">{formatDist(poi.distToRoute)}</span>}
            {hasDetails && !selectionMode && <span className="text-xs text-gray-300 ml-1">{isExpanded ? '▲' : '▼'}</span>}
          </div>
        </div>
        {/* Sous-titre compact — visible quand fermé */}
        {!isExpanded && (
          <div className="mt-0.5 text-xs text-gray-400">
            <div className="flex items-start gap-2">
              {/* Thumbnail Wikidata si disponible */}
              {poi.wikiImage && (
                <img src={poi.wikiImage} alt="" className="w-10 h-10 object-cover rounded shrink-0 mt-0.5"
                  onError={(e) => { e.target.style.display = 'none'; }} loading="lazy" />
              )}
              <div className="min-w-0 flex-1">
                {poi.subtype && poi.name !== poi.subtype && <span className="mr-2">🏷️ {poi.subtype}</span>}
                {poi.cuisine && <span className="mr-2">🍴 {formatCuisine(poi.cuisine)}</span>}
                {poi.stars && <span className="mr-2">{'⭐'.repeat(Math.min(5, parseInt(poi.stars, 10) || 0))}</span>}
                {poi.dateBuilt && <span className="mr-2">🗓️ {poi.dateBuilt}</span>}
                {!poi.subtype && !poi.cuisine && poi.phone && <span className="mr-2">📞 {poi.phone}</span>}
                {poi.description && (
                  <div className="text-gray-500 italic truncate">{poi.description}</div>
                )}
              </div>
            </div>
          </div>
        )}
      </button>

      {/* Panneau dépliable — détails complets */}
      {isExpanded && (
        <div className="px-3 pb-3 text-xs text-gray-500 leading-relaxed border-t border-gray-100">
          {poi.subtype && poi.name !== poi.subtype && <div className="mt-2">🏷️ {poi.subtype}</div>}
          {poi.stars && <div className="mt-1">{'⭐'.repeat(Math.min(5,parseInt(poi.stars,10)||0))}</div>}
          {poi.cuisine && <div className="mt-1">🍴 {formatCuisine(poi.cuisine)}</div>}
          {poi.address && <div className="mt-1">📍 {poi.address}</div>}
          {poi.openingHours && <div className="mt-1">🕐 {poi.openingHours}</div>}
          {poi.phone && <div className="mt-1">📞 <a href={`tel:${poi.phone}`} className="text-[var(--vr-green)] underline" onClick={e => e.stopPropagation()}>{poi.phone}</a></div>}
          {poi.website && <div className="mt-1">🌐 <a href={poi.website.startsWith('http')?poi.website:`https://${poi.website}`} target="_blank" rel="noopener noreferrer" className="text-[var(--vr-green)] underline" onClick={e => e.stopPropagation()}>Site web</a></div>}
          {poi.description && <div className="mt-1 italic">{poi.description.length>150?poi.description.substring(0,150)+'…':poi.description}</div>}

          {/* DEC-047+060 : Infos Wikidata — pré-chargées OU lazy */}
          {wikiLoading && !poi.wikiImage && <div className="mt-2 text-gray-400 animate-pulse">⏳ Chargement infos Wikipedia…</div>}
          {(poi.wikiImage || poi.wikipedia || poi.dateBuilt || wikidata) && (
            <div className="mt-2 bg-white rounded-lg p-2 border border-gray-100">
              {(poi.wikiImage || wikidata?.image) && (
                <img src={poi.wikiImage || wikidata.image} alt={poi.name}
                  className="w-full h-32 object-cover rounded mb-2"
                  loading="lazy"
                  onError={(e) => { e.target.style.display = 'none'; }} />
              )}
              {poi.dateBuilt && <p className="mt-1">🗓️ Construit en {poi.dateBuilt}</p>}
              {wikidata?.dateBuilt && !poi.dateBuilt && <p className="mt-1">🗓️ Construit en {wikidata.dateBuilt}</p>}
              {(poi.wikipedia || wikidata?.wikipedia) && (
                <a href={poi.wikipedia || wikidata.wikipedia} target="_blank" rel="noopener noreferrer"
                  className="mt-1 inline-block text-[var(--vr-green)] underline font-medium"
                  onClick={e => e.stopPropagation()}>
                  📖 Voir sur Wikipedia
                </a>
              )}
              {wikidata?.website && !poi.website && (
                <div className="mt-1">🌐 <a href={wikidata.website} target="_blank" rel="noopener noreferrer"
                  className="text-[var(--vr-green)] underline" onClick={e => e.stopPropagation()}>Site officiel</a></div>
              )}
            </div>
          )}

          {/* Bouton zoom carte */}
          <button type="button" onClick={handleZoom}
            className="mt-2 w-full py-1.5 text-xs font-medium rounded bg-[var(--vr-cream)] border border-[var(--vr-sand)] text-[var(--vr-navy)] hover:bg-[var(--vr-sand)] transition-colors">
            🔍 Voir sur la carte
          </button>
        </div>
      )}
    </div>
  );
}

function POIPanel({ pois, poisLoading, onPoiClick, onBisRequest, bisLoading, highlightedPoiId }) {
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [expandedPoiId, setExpandedPoiId] = useState(null);
  const listRef = useRef(null);
  const itemRefs = useRef({});

  // Scroll vers le POI surligné (cliqué depuis la carte)
  useEffect(() => {
    if (highlightedPoiId && itemRefs.current[highlightedPoiId]) {
      setOpen(true);
      setFilter('all');
      setExpandedPoiId(highlightedPoiId);
      setTimeout(() => {
        itemRefs.current[highlightedPoiId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [highlightedPoiId]);

  const toggleExpand = useCallback((id) => {
    setExpandedPoiId(prev => prev === id ? null : id);
  }, []);

  if (poisLoading && (!pois || pois.length === 0)) {
    return (<div className="bg-white rounded-xl shadow p-4 text-center">
      <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
        <span className="animate-spin text-lg">⏳</span><span>Recherche des points d'intérêt…</span>
      </div></div>);
  }
  if (!pois || pois.length === 0) return null;

  const counts = {}; for (const p of pois) counts[p.type] = (counts[p.type]||0)+1;
  const displayed = filter === 'all' ? pois : pois.filter(p => p.type === filter);
  const availableTypes = Object.keys(counts);
  const toggleSel = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.size < 5 && n.add(id); return n; });
  const handleBis = () => { if (!onBisRequest) return; onBisRequest(selectionMode && selectedIds.size > 0 ? pois.filter(p => selectedIds.has(p.id)) : null); };
  const toggleMode = () => { setSelectionMode(p => !p); if (selectionMode) setSelectedIds(new Set()); };

  return (
    <div className="bg-white rounded-xl shadow p-4">
      {onBisRequest && (<div className="mb-3">
        <button type="button" onClick={handleBis} disabled={bisLoading||(selectionMode&&selectedIds.size===0)}
          className={`w-full py-3 text-senior font-bold rounded-lg transition-colors mb-2 ${bisLoading||(selectionMode&&selectedIds.size===0)?'bg-gray-300 text-gray-500':'bg-[var(--vr-gold)] text-white active:bg-yellow-700'}`}>
          {bisLoading ? '⏳ Calcul…' : selectionMode ? `🗺️ Bis via ${selectedIds.size} POI` : '🗺️ Itinéraire bis auto'}
        </button>
        <button type="button" onClick={toggleMode}
          className={`w-full py-2 text-xs font-medium rounded-lg border transition-colors ${selectionMode?'bg-blue-50 border-blue-400 text-blue-700':'bg-gray-50 border-gray-300 text-gray-500'}`}>
          {selectionMode ? `✓ Sélection (${selectedIds.size}/5) — cliquer pour désactiver` : '☐ Choisir mes POI (max 5)'}
        </button>
      </div>)}

      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left min-h-0">
        <div>
          <span className="text-sm font-semibold text-gray-500">Points d'intérêt ({pois.length}){poisLoading && <span className="ml-1 animate-spin inline-block">⏳</span>}</span>
          <p className="text-xs text-gray-400">{availableTypes.map(t => { const c=POI_CATEGORIES[t]; return c?`${c.emoji} ${counts[t]} ${c.label.toLowerCase()}${counts[t]>1?'s':''}`:null; }).filter(Boolean).join(' · ')}</p>
        </div>
        <span className="text-xl text-gray-400">{open?'▲':'▼'}</span>
      </button>

      {open && (<div className="mt-3">
        {availableTypes.length > 1 && (<div className="flex gap-1 flex-wrap mb-2">
          <button type="button" onClick={() => setFilter('all')} className={`px-2 py-1 text-xs rounded-full border ${filter==='all'?'bg-[var(--vr-navy)] text-white border-[var(--vr-navy)]':'bg-white text-gray-500 border-gray-300'}`}>Tous ({pois.length})</button>
          {availableTypes.map(t => { const c=POI_CATEGORIES[t]; return c?<button key={t} type="button" onClick={() => setFilter(t)} className={`px-2 py-1 text-xs rounded-full border ${filter===t?'bg-[var(--vr-navy)] text-white border-[var(--vr-navy)]':'bg-white text-gray-500 border-gray-300'}`}>{c.emoji} {counts[t]}</button>:null; })}
        </div>)}
        <ul ref={listRef} className="flex flex-col gap-1 max-h-80 overflow-y-auto">
          {displayed.map(poi => (
            <li key={poi.id} ref={el => { itemRefs.current[poi.id] = el; }}>
              <POIItem
                poi={poi}
                isExpanded={expandedPoiId === poi.id}
                onToggle={toggleExpand}
                onPoiClick={onPoiClick}
                selectionMode={selectionMode}
                isSel={selectedIds.has(poi.id)}
                onToggleSel={toggleSel}
                isHighlighted={highlightedPoiId === poi.id}
              />
            </li>
          ))}
        </ul>
      </div>)}
    </div>
  );
}
export default POIPanel;
