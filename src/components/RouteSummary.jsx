/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */

import React, { useState } from 'react';
import { formatDistance, formatDuration } from '../services/routing';

/**
 * Affichage du scoring paysager en étoiles.
 */
function ScenicBadge({ scoring }) {
  if (!scoring || scoring.score === 0) return null;

  const stars = '★'.repeat(scoring.score) + '☆'.repeat(5 - scoring.score);
  const details = [];
  if (scoring.details?.densityPerKm > 0) details.push(`${scoring.details.densityPerKm} élém./km`);
  if (scoring.details?.sinuosity) details.push(scoring.details.sinuosity);

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg
                    bg-[var(--vr-cream)] border border-[var(--vr-gold)]">
      <span className="text-sm" style={{ color: '#c4a23d' }}>{stars}</span>
      <span className="text-sm font-medium text-[var(--vr-brown-dark)]">
        {scoring.label}
      </span>
      {details.length > 0 && (
        <span className="text-xs text-gray-400">
          ({details.join(' · ')})
        </span>
      )}
    </div>
  );
}

/**
 * Résumé itinéraire + boutons export (Phase 2).
 */
function RouteSummary({
  distance, duration, filterStats, scoring,
  onClear, onExportGPX, onExportPDF, onPrint, onShare,
  exportingPDF,
}) {
  const hasWarnings = filterStats && (filterStats.warning > 0 || filterStats.forbidden > 0);
  const [shareCopied, setShareCopied] = useState(false);

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

      {/* Scoring paysager (tâche 2.9) */}
      <ScenicBadge scoring={scoring} />

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

      {/* Boutons export + partage (tâches 2.3, 2.4, 2.14, DEC-064) */}
      <div className="border-t border-gray-200 pt-3 flex gap-2 flex-wrap">
        {onExportGPX && (
          <button
            type="button"
            onClick={onExportGPX}
            className="flex-1 py-2 text-sm font-semibold rounded-lg
                       bg-[var(--vr-navy)] text-[var(--vr-cream)]
                       active:opacity-80 min-w-0"
          >
            📥 GPX
          </button>
        )}
        {onExportPDF && (
          <button
            type="button"
            onClick={onExportPDF}
            disabled={exportingPDF}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg min-w-0
              ${exportingPDF
                ? 'bg-gray-300 text-gray-500'
                : 'bg-[var(--vr-red)] text-white active:opacity-80'
              }`}
          >
            {exportingPDF ? '⏳ PDF…' : '📄 PDF'}
          </button>
        )}
        {onPrint && (
          <button
            type="button"
            onClick={onPrint}
            className="flex-1 py-2 text-sm font-semibold rounded-lg
                       bg-[var(--vr-brown)] text-white
                       active:opacity-80 min-w-0"
          >
            🖨️ Imprimer
          </button>
        )}
        {onShare && (
          <button
            type="button"
            onClick={async () => {
              const ok = await onShare();
              if (ok) {
                setShareCopied(true);
                setTimeout(() => setShareCopied(false), 2500);
              }
            }}
            className="flex-1 py-2 text-sm font-semibold rounded-lg
                       bg-[var(--vr-green)] text-white
                       active:opacity-80 min-w-0"
          >
            {shareCopied ? '✅ Copié !' : '🔗 Partager'}
          </button>
        )}
      </div>
    </div>
  );
}

export default RouteSummary;
