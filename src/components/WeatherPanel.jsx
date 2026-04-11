/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */

import React, { useState } from 'react';

/**
 * Panneau météo le long du parcours (tâche 2.11).
 */
function WeatherPanel({ weather }) {
  const [showHourly, setShowHourly] = useState(false);

  if (!weather || !weather.current) return null;

  const { current, hourly } = weather;

  return (
    <div className="bg-white rounded-xl shadow p-4">
      <button
        type="button"
        onClick={() => setShowHourly(!showHourly)}
        className="w-full flex items-center justify-between text-left min-h-0"
      >
        <div className="flex items-center gap-2">
          <span className="text-2xl">{current.weatherEmoji}</span>
          <div>
            <p className="text-senior font-bold text-[var(--vr-navy)]">
              {current.temperature}°C
            </p>
            <p className="text-xs text-gray-500">{current.weatherText}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">💨 {current.windSpeed} km/h</p>
          {current.precipitation > 0 && (
            <p className="text-xs text-[var(--vr-orange)]">🌧️ {current.precipitation} mm</p>
          )}
          <span className="text-xs text-gray-400">{showHourly ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Prévisions horaires */}
      {showHourly && hourly && hourly.length > 0 && (
        <div className="mt-3 border-t border-gray-200 pt-2">
          <p className="text-xs font-semibold text-gray-500 mb-2">Prévisions</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {hourly.slice(0, 8).map((h, i) => (
              <div key={i} className="flex-shrink-0 text-center px-2 py-1 rounded-lg bg-[var(--vr-cream)]"
                   style={{ minWidth: 56 }}>
                <p className="text-xs text-gray-500">{h.time}</p>
                <p className="text-base">{h.emoji}</p>
                <p className="text-xs font-bold text-[var(--vr-navy)]">{h.temperature}°</p>
                {h.precipProb > 20 && (
                  <p className="text-xs text-[var(--vr-orange)]">{h.precipProb}%</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default WeatherPanel;
