/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { autocomplete, DEBOUNCE_MS } from '../services/geocoding';

const MAX_WAYPOINTS = 5;

/**
 * Champ de saisie avec autocomplétion IGN.
 */
function AddressInput({ label, placeholder, onSelect, value: externalValue }) {
  const [text, setText] = useState(externalValue || '');
  const [suggestions, setSuggestions] = useState([]);
  const [showList, setShowList] = useState(false);
  const [selected, setSelected] = useState(false);
  const timerRef = useRef(null);
  const wrapperRef = useRef(null);

  // Sync si valeur externe change (ex: mode boucle)
  useEffect(() => {
    if (externalValue != null && externalValue !== text) {
      setText(externalValue);
      setSelected(!!externalValue);
    }
  }, [externalValue]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowList(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleChange = useCallback((e) => {
    const value = e.target.value;
    setText(value);
    setSelected(false);

    if (timerRef.current) clearTimeout(timerRef.current);

    if (value.trim().length < 3) {
      setSuggestions([]);
      setShowList(false);
      return;
    }

    timerRef.current = setTimeout(async () => {
      const results = await autocomplete(value);
      setSuggestions(results);
      setShowList(results.length > 0);
    }, DEBOUNCE_MS);
  }, []);

  const handleSelect = useCallback((suggestion) => {
    setText(suggestion.label);
    setSuggestions([]);
    setShowList(false);
    setSelected(true);
    onSelect({ label: suggestion.label, lng: suggestion.lng, lat: suggestion.lat });
  }, [onSelect]);

  const handleClear = useCallback(() => {
    setText('');
    setSuggestions([]);
    setShowList(false);
    setSelected(false);
    onSelect(null);
  }, [onSelect]);

  return (
    <div ref={wrapperRef} className="relative mb-3">
      <label className="block text-sm font-semibold text-[var(--vr-navy)] mb-1">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={handleChange}
          onFocus={() => { if (suggestions.length > 0 && !selected) setShowList(true); }}
          placeholder={placeholder}
          className="flex-1 px-3 py-3 text-senior border-2 rounded-lg
                     border-[var(--vr-brown)] bg-white
                     focus:outline-none focus:border-[var(--vr-brown-dark)]
                     placeholder:text-gray-400"
          autoComplete="off"
        />
        {text && (
          <button
            type="button"
            onClick={handleClear}
            className="px-4 py-3 text-senior rounded-lg
                       bg-gray-200 text-[var(--vr-navy)]
                       active:bg-gray-300"
            aria-label="Effacer"
          >
            ✕
          </button>
        )}
      </div>

      {showList && suggestions.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border-2
                        border-[var(--vr-brown)] rounded-lg shadow-lg
                        max-h-60 overflow-y-auto">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => handleSelect(s)}
                className="w-full text-left px-3 py-3 text-senior
                           hover:bg-[var(--vr-cream)]
                           active:bg-[var(--vr-brown)] active:text-white
                           border-b border-gray-100 last:border-b-0"
              >
                📍 {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Formulaire départ / étapes / arrivée + mode boucle (Phase 2).
 */
function RouteForm({ onRouteRequest, onLoopRequest, loading }) {
  const [departure, setDeparture] = useState(null);
  const [arrival, setArrival] = useState(null);
  const [waypoints, setWaypoints] = useState([]); // [{label, lng, lat} | null]
  const [loopMode, setLoopMode] = useState(false);
  const [loopDuration, setLoopDuration] = useState(120); // minutes

  const canSubmit = departure && (loopMode || arrival) && !loading;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;

    if (loopMode && onLoopRequest) {
      onLoopRequest({ departure, duration: loopDuration });
    } else {
      // Filtrer les waypoints valides
      const validWaypoints = waypoints.filter(
        (w) => w && w.lng != null && w.lat != null
      );
      onRouteRequest({ departure, arrival, intermediates: validWaypoints });
    }
  }, [departure, arrival, waypoints, canSubmit, onRouteRequest, onLoopRequest, loopMode, loopDuration]);

  // Ajouter une étape (max 5 — DEC-016)
  const addWaypoint = useCallback(() => {
    if (waypoints.length < MAX_WAYPOINTS) {
      setWaypoints((prev) => [...prev, null]);
    }
  }, [waypoints.length]);

  // Supprimer une étape
  const removeWaypoint = useCallback((index) => {
    setWaypoints((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Mettre à jour une étape
  const updateWaypoint = useCallback((index, value) => {
    setWaypoints((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  // Toggle mode boucle
  const toggleLoop = useCallback(() => {
    setLoopMode((prev) => !prev);
    if (!loopMode) {
      setArrival(null);
      setWaypoints([]);
    }
  }, [loopMode]);

  return (
    <div className="bg-white rounded-xl shadow p-4">
      {/* Toggle mode boucle / itinéraire */}
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => { if (loopMode) toggleLoop(); }}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors
            ${!loopMode
              ? 'bg-[var(--vr-green)] text-white'
              : 'bg-gray-100 text-gray-600'
            }`}
        >
          🛣️ Itinéraire
        </button>
        <button
          type="button"
          onClick={() => { if (!loopMode) toggleLoop(); }}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors
            ${loopMode
              ? 'bg-[var(--vr-green)] text-white'
              : 'bg-gray-100 text-gray-600'
            }`}
        >
          🔄 Boucle
        </button>
      </div>

      {/* Départ */}
      <AddressInput
        label="🟢 Départ"
        placeholder="Ville ou adresse de départ…"
        onSelect={setDeparture}
      />

      {/* Mode boucle : durée */}
      {loopMode ? (
        <div className="mb-3">
          <label className="block text-sm font-semibold text-[var(--vr-navy)] mb-1">
            ⏱️ Durée souhaitée (aller-retour)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="30"
              max="480"
              step="30"
              value={loopDuration}
              onChange={(e) => setLoopDuration(parseInt(e.target.value, 10))}
              className="flex-1 h-2 rounded-lg appearance-none cursor-pointer
                         bg-gray-200 accent-[var(--vr-green)]"
            />
            <span className="text-senior font-bold text-[var(--vr-navy)] w-20 text-center">
              {Math.floor(loopDuration / 60)} h {loopDuration % 60 > 0 ? `${loopDuration % 60} min` : ''}
            </span>
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>30 min</span>
            <span>8 h</span>
          </div>
        </div>
      ) : (
        <>
          {/* Étapes intermédiaires (DEC-016) */}
          {waypoints.map((wp, index) => (
            <div key={index} className="flex items-start gap-1">
              <div className="flex-1">
                <AddressInput
                  label={`📌 Étape ${index + 1}`}
                  placeholder={`Étape intermédiaire ${index + 1}…`}
                  onSelect={(val) => updateWaypoint(index, val)}
                />
              </div>
              <button
                type="button"
                onClick={() => removeWaypoint(index)}
                className="mt-6 px-3 py-3 text-sm rounded-lg
                           bg-red-50 text-[var(--vr-red)]
                           active:bg-red-100"
                aria-label={`Supprimer étape ${index + 1}`}
              >
                ✕
              </button>
            </div>
          ))}

          {/* Bouton ajouter étape */}
          {waypoints.length < MAX_WAYPOINTS && (
            <button
              type="button"
              onClick={addWaypoint}
              className="w-full py-2 mb-3 text-sm font-medium rounded-lg
                         border-2 border-dashed border-gray-300
                         text-gray-500 hover:border-[var(--vr-green)]
                         hover:text-[var(--vr-green)] transition-colors"
            >
              + Ajouter une étape (max {MAX_WAYPOINTS})
            </button>
          )}

          {/* Arrivée */}
          <AddressInput
            label="🔴 Arrivée"
            placeholder="Ville ou adresse d'arrivée…"
            onSelect={setArrival}
          />
        </>
      )}

      {/* Bouton calcul */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`w-full py-3 text-senior font-bold rounded-lg mt-1
                    transition-colors duration-200
                    ${canSubmit
                      ? 'bg-[var(--vr-green)] text-white active:bg-green-800'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
      >
        {loading
          ? '⏳ Calcul en cours…'
          : loopMode
            ? '🔄 Calculer la boucle'
            : '🚗 Calculer l\'itinéraire'
        }
      </button>
    </div>
  );
}

export default RouteForm;
