/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/vintageroute/vintageroute
 */

import React from 'react';
import { formatDistance, formatDuration } from '../services/routing';

/**
 * Résumé de l'itinéraire calculé (distance, durée, alertes surface)
 */
function RouteSummary({ distance, duration, filterStats, onClear }) {
  const hasWarnings = filterStats && (filterStats.warning > 0 || filterStats.forbidden > 0);

  return (
    <div className="bg-white rounded-xl shadow p-4 flex flex-col gap-3">
      {/* Distance et durée */}
      <div className="flex items-center justify-between">
        <div className="flex gap-6">
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-500">Distance</p>
            <p className="text-senior-lg font-bold text-[var(--vr-navy)]">
              {formatDistance(distance)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-500">Durée estimée</p>
            <p className="text-senior-lg font-bold text-[var(--vr-navy)]">
              {formatDuration(duration)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="px-4 py-3 text-senior rounded-lg
                     bg-gray-200 text-[var(--vr-navy)]
                     active:bg-gray-300"
          aria-label="Effacer l'itinéraire"
        >
          ✕
        </button>
      </div>

      {/* Alertes filtrage surface */}
      {hasWarnings && (
        <div className="border-t border-gray-200 pt-3 flex flex-col gap-2">
          <p className="text-sm font-semibold text-gray-500">Surface des routes</p>

          {filterStats.forbidden > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg
                            bg-red-50 border border-[var(--vr-red)]">
              <span className="inline-block w-3 h-3 rounded-full"
                    style={{ backgroundColor: '#7a2e2e' }} />
              <span className="text-sm text-[var(--vr-red)] font-medium">
                Chemins / sentiers détectés sur le parcours
              </span>
            </div>
          )}

          {filterStats.warning > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg
                            bg-orange-50 border border-[var(--vr-orange)]">
              <span className="inline-block w-3 h-3 rounded-full"
                    style={{ backgroundColor: '#c97b32' }} />
              <span className="text-sm text-[var(--vr-orange)] font-medium">
                Routes empierrées détectées sur le parcours
              </span>
            </div>
          )}
        </div>
      )}

      {/* Tout OK */}
      {filterStats && !hasWarnings && (
        <div className="border-t border-gray-200 pt-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg
                          bg-green-50 border border-[var(--vr-green)]">
            <span className="inline-block w-3 h-3 rounded-full"
                  style={{ backgroundColor: '#5b6b2d' }} />
            <span className="text-sm text-[var(--vr-green)] font-medium">
              Toutes les routes sont goudronnées ✓
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default RouteSummary;
