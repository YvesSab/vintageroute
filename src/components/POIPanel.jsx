/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/vintageroute/vintageroute
 */

import React, { useState } from 'react';

/**
 * Panneau listant les POI trouvés le long de l'itinéraire.
 */
function POIPanel({ pois, onPoiClick }) {
  const [open, setOpen] = useState(false);

  if (!pois || pois.length === 0) return null;

  const counts = {
    viewpoint: pois.filter(p => p.type === 'viewpoint').length,
    historic: pois.filter(p => p.type === 'historic').length,
    picnic: pois.filter(p => p.type === 'picnic').length,
  };

  return (
    <div className="bg-white rounded-xl shadow p-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left min-h-0"
      >
        <div>
          <span className="text-sm font-semibold text-gray-500">
            Points d'intérêt ({pois.length})
          </span>
          <p className="text-xs text-gray-400">
            {counts.viewpoint > 0 && `📍 ${counts.viewpoint} points de vue`}
            {counts.historic > 0 && ` · 🏛️ ${counts.historic} monuments`}
            {counts.picnic > 0 && ` · 🧺 ${counts.picnic} aires`}
          </p>
        </div>
        <span className="text-xl text-gray-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <ul className="mt-3 flex flex-col gap-1 max-h-48 overflow-y-auto">
          {pois.map((poi) => (
            <li key={poi.id}>
              <button
                type="button"
                onClick={() => onPoiClick && onPoiClick(poi)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm
                           border border-gray-200 hover:bg-gray-50"
              >
                <span className="mr-2">{poi.emoji}</span>
                <span className="font-medium">{poi.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default POIPanel;
