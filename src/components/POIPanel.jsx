/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */
import React, { useState, useRef, useEffect } from 'react';
import { POI_CATEGORIES } from '../services/poi';

function formatDist(m) { return m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(1)} km`; }

function POIPanel({ pois, poisLoading, onPoiClick, onBisRequest, bisLoading, highlightedPoiId }) {
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const listRef = useRef(null);
  const itemRefs = useRef({});

  // Scroll vers le POI surligné (cliqué depuis la carte)
  useEffect(() => {
    if (highlightedPoiId && itemRefs.current[highlightedPoiId]) {
      // Ouvrir le panneau si fermé
      setOpen(true);
      // Réinitialiser le filtre pour être sûr que le POI est visible
      setFilter('all');
      // Scroll avec un petit délai pour laisser le temps au DOM de s'afficher
      setTimeout(() => {
        itemRefs.current[highlightedPoiId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [highlightedPoiId]);

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
        <ul ref={listRef} className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {displayed.map(poi => {
            const isSel = selectedIds.has(poi.id);
            const isHighlighted = highlightedPoiId === poi.id;
            return (
            <li key={poi.id} ref={el => { itemRefs.current[poi.id] = el; }}>
              <button type="button"
                onClick={() => { if (selectionMode) { toggleSel(poi.id); } else if (onPoiClick) { onPoiClick(poi); } }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-all duration-300
                  ${isHighlighted ? 'border-[var(--vr-gold)] bg-yellow-50 ring-2 ring-[var(--vr-gold)]'
                    : isSel ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0 flex items-center gap-1">
                    {selectionMode && <span className={`inline-flex items-center justify-center w-5 h-5 rounded border text-xs mr-1 ${isSel?'bg-blue-500 text-white border-blue-500':'bg-white border-gray-300'}`}>{isSel?'✓':''}</span>}
                    <span className="mr-1">{poi.emoji}</span>
                    <span className="font-medium truncate">{poi.name}</span>
                  </div>
                  {poi.distToRoute > 0 && <span className="text-xs text-gray-400 whitespace-nowrap">{formatDist(poi.distToRoute)}</span>}
                </div>
                {/* Description enrichie */}
                {(poi.subtype || poi.address || poi.cuisine || poi.openingHours) && (
                  <div className="mt-1 text-xs text-gray-400 leading-tight">
                    {poi.subtype && poi.name !== poi.subtype && <span className="mr-2">🏷️ {poi.subtype}</span>}
                    {poi.cuisine && <span className="mr-2">🍴 {poi.cuisine}</span>}
                    {poi.address && <span className="mr-2">📍 {poi.address}</span>}
                    {poi.openingHours && <span>🕐 {poi.openingHours}</span>}
                  </div>
                )}
              </button>
            </li>); })}
        </ul>
      </div>)}
    </div>
  );
}
export default POIPanel;
