/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/vintageroute/vintageroute
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { startTracking, stopTracking, distanceRemaining } from '../services/geolocation';
import { formatDistance } from '../services/routing';

/**
 * Panneau GPS temps réel — affiché quand un itinéraire est actif.
 * Lance le suivi GPS et affiche : vitesse, distance restante, précision.
 */
function GPSPanel({ routeCoords }) {
  const [tracking, setTracking] = useState(false);
  const [gpsData, setGpsData] = useState(null);
  const [navInfo, setNavInfo] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const watchIdRef = useRef(null);

  const handleUpdate = useCallback((data) => {
    setGpsData(data);
    setGpsError(null);

    // Calculer distance restante si on a un itinéraire
    if (routeCoords && routeCoords.length >= 2) {
      const info = distanceRemaining(data.lon, data.lat, routeCoords);
      setNavInfo(info);
    }
  }, [routeCoords]);

  const handleError = useCallback((err) => {
    setGpsError(err.message || 'GPS indisponible');
  }, []);

  const toggleTracking = useCallback(() => {
    if (tracking) {
      stopTracking(watchIdRef.current);
      watchIdRef.current = null;
      setTracking(false);
      setGpsData(null);
      setNavInfo(null);
    } else {
      const id = startTracking(handleUpdate, handleError);
      watchIdRef.current = id;
      setTracking(id != null);
    }
  }, [tracking, handleUpdate, handleError]);

  // Nettoyer au démontage
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) {
        stopTracking(watchIdRef.current);
      }
    };
  }, []);

  const speedKmh = gpsData?.speed != null
    ? Math.round(gpsData.speed * 3.6)
    : null;

  return (
    <div className="bg-white rounded-xl shadow p-4">
      {/* Bouton démarrer/arrêter */}
      <button
        type="button"
        onClick={toggleTracking}
        className={`w-full py-3 text-senior font-bold rounded-lg transition-colors
          ${tracking
            ? 'bg-[var(--vr-red)] text-white'
            : 'bg-[var(--vr-navy)] text-[var(--vr-cream)]'
          }`}
      >
        {tracking ? '⏹ Arrêter la navigation' : '📍 Lancer le GPS'}
      </button>

      {gpsError && (
        <p className="mt-2 text-sm text-[var(--vr-red)] text-center">
          ⚠️ {gpsError}
        </p>
      )}

      {/* Infos GPS en cours */}
      {tracking && gpsData && (
        <div className="mt-3 flex gap-3">
          {/* Vitesse */}
          <div className="flex-1 text-center px-2 py-2 rounded-lg bg-[var(--vr-cream)]">
            <p className="text-xs text-gray-500">Vitesse</p>
            <p className="text-senior font-bold text-[var(--vr-navy)]">
              {speedKmh != null ? `${speedKmh} km/h` : '—'}
            </p>
          </div>

          {/* Distance restante */}
          {navInfo && (
            <div className="flex-1 text-center px-2 py-2 rounded-lg bg-[var(--vr-cream)]">
              <p className="text-xs text-gray-500">Restant</p>
              <p className="text-senior font-bold text-[var(--vr-navy)]">
                {formatDistance(navInfo.distRemaining / 1000)}
              </p>
            </div>
          )}

          {/* Précision */}
          <div className="flex-1 text-center px-2 py-2 rounded-lg bg-[var(--vr-cream)]">
            <p className="text-xs text-gray-500">Précision</p>
            <p className="text-sm font-bold text-[var(--vr-navy)]">
              ±{Math.round(gpsData.accuracy)} m
            </p>
          </div>
        </div>
      )}

      {/* Alerte hors itinéraire */}
      {tracking && navInfo && navInfo.distFromRoute > 100 && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-orange-50 border border-[var(--vr-orange)]
                        text-sm text-[var(--vr-orange)] text-center font-medium">
          ⚠️ Vous êtes à {Math.round(navInfo.distFromRoute)} m de l'itinéraire
        </div>
      )}
    </div>
  );
}

export default GPSPanel;
