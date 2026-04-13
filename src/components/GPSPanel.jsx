/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 *
 * DEC-066 — Guidage basique GPS (Bloc P)
 * Panneau GPS + guidage virage par virage.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { startTracking, stopTracking } from '../services/geolocation';
import { projectOnRoute, findNextTurn, generateInstruction, playBeep, playDoubleBeep } from '../services/guidance';
import { formatDistance } from '../services/routing';

/**
 * Panneau GPS + guidage — affiché quand un itinéraire est actif.
 * Lance le suivi GPS, affiche instructions de navigation, alerte sonore.
 */
function GPSPanel({ routeCoords }) {
  const [tracking, setTracking] = useState(false);
  const [gpsData, setGpsData] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [instruction, setInstruction] = useState(null);
  const [distFromRoute, setDistFromRoute] = useState(0);
  const [distRemaining, setDistRemaining] = useState(null);
  const watchIdRef = useRef(null);

  // Anti-spam beep : ne pas biper 2 fois pour le même virage
  const lastBeepRef = useRef({ segIndex: -1, level: 0 }); // level: 1=loin, 2=proche

  const handleUpdate = useCallback((data) => {
    setGpsData(data);
    setGpsError(null);

    if (!routeCoords || routeCoords.length < 2) return;

    // Projeter la position sur la route
    const proj = projectOnRoute(data.lon, data.lat, routeCoords);
    if (!proj) return;

    setDistFromRoute(proj.distFromRoute);
    const remaining = proj.totalDist - proj.distAlong;
    setDistRemaining(remaining);

    // Trouver le prochain virage
    const turn = findNextTurn(proj.segIndex, routeCoords, proj.cumDists, 25);
    const instr = generateInstruction(turn, remaining);
    setInstruction(instr);

    // Alertes sonores
    if (turn) {
      const beepRef = lastBeepRef.current;
      if (turn.distFromHere < 100 && (beepRef.segIndex !== turn.index || beepRef.level < 2)) {
        playDoubleBeep();
        lastBeepRef.current = { segIndex: turn.index, level: 2 };
      } else if (turn.distFromHere < 300 && turn.distFromHere >= 100 && (beepRef.segIndex !== turn.index || beepRef.level < 1)) {
        playBeep();
        lastBeepRef.current = { segIndex: turn.index, level: 1 };
      }
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
      setInstruction(null);
      setDistFromRoute(0);
      setDistRemaining(null);
      lastBeepRef.current = { segIndex: -1, level: 0 };
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
        {tracking ? '⏹ Arrêter la navigation' : '🧭 Lancer le guidage'}
      </button>

      {gpsError && (
        <p className="mt-2 text-sm text-[var(--vr-red)] text-center">
          ⚠️ {gpsError}
        </p>
      )}

      {/* ═══════ PANNEAU GUIDAGE (DEC-066) ═══════ */}
      {tracking && instruction && (
        <div
          className={`mt-3 rounded-xl p-4 text-center transition-colors ${
            instruction.isVeryClose
              ? 'bg-orange-100 border-2 border-[var(--vr-orange)]'
              : instruction.isClose
                ? 'bg-yellow-50 border-2 border-[var(--vr-gold)]'
                : 'bg-[var(--vr-cream)] border-2 border-[var(--vr-green)]'
          }`}
        >
          {/* Flèche directionnelle */}
          <div className="text-5xl mb-1" aria-hidden="true">
            {instruction.arrow}
          </div>

          {/* Instruction principale */}
          <p className="text-senior font-bold text-[var(--vr-navy)] leading-tight">
            {instruction.text}
          </p>

          {/* Distance restante totale */}
          {distRemaining != null && distRemaining > 50 && (
            <p className="text-sm text-gray-500 mt-1">
              Arrivée dans {formatDistance(distRemaining / 1000)}
            </p>
          )}
        </div>
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
          {distRemaining != null && (
            <div className="flex-1 text-center px-2 py-2 rounded-lg bg-[var(--vr-cream)]">
              <p className="text-xs text-gray-500">Restant</p>
              <p className="text-senior font-bold text-[var(--vr-navy)]">
                {formatDistance(distRemaining / 1000)}
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
      {tracking && distFromRoute > 100 && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-orange-50 border border-[var(--vr-orange)]
                        text-sm text-[var(--vr-orange)] text-center font-medium">
          ⚠️ Vous êtes à {Math.round(distFromRoute)} m de l'itinéraire
        </div>
      )}
    </div>
  );
}

export default GPSPanel;
