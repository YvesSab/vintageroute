/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/vintageroute/vintageroute
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { autocomplete, DEBOUNCE_MS } from '../services/geocoding';

/**
 * Champ de saisie avec autocomplétion IGN
 */
function AddressInput({ label, placeholder, onSelect }) {
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showList, setShowList] = useState(false);
  const [selected, setSelected] = useState(false);
  const timerRef = useRef(null);
  const wrapperRef = useRef(null);

  // Fermer la liste si clic extérieur
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

  const handleChange = useCallback(
    (e) => {
      const value = e.target.value;
      setText(value);
      setSelected(false);

      // Annuler le timer précédent
      if (timerRef.current) clearTimeout(timerRef.current);

      if (value.trim().length < 3) {
        setSuggestions([]);
        setShowList(false);
        return;
      }

      // Debounce
      timerRef.current = setTimeout(async () => {
        const results = await autocomplete(value);
        setSuggestions(results);
        setShowList(results.length > 0);
      }, DEBOUNCE_MS);
    },
    []
  );

  const handleSelect = useCallback(
    (suggestion) => {
      setText(suggestion.label);
      setSuggestions([]);
      setShowList(false);
      setSelected(true);
      onSelect({ label: suggestion.label, lng: suggestion.lng, lat: suggestion.lat });
    },
    [onSelect]
  );

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

      {/* Liste de suggestions */}
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
 * Formulaire départ / arrivée
 */
function RouteForm({ onRouteRequest, loading }) {
  const [departure, setDeparture] = useState(null);
  const [arrival, setArrival] = useState(null);

  const canSubmit = departure && arrival && !loading;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    onRouteRequest({ departure, arrival });
  }, [departure, arrival, canSubmit, onRouteRequest]);

  return (
    <div className="bg-white rounded-xl shadow p-4">
      <AddressInput
        label="🟢 Départ"
        placeholder="Ville ou adresse de départ…"
        onSelect={setDeparture}
      />
      <AddressInput
        label="🔴 Arrivée"
        placeholder="Ville ou adresse d'arrivée…"
        onSelect={setArrival}
      />
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
        {loading ? '⏳ Calcul en cours…' : '🚗 Calculer l\'itinéraire'}
      </button>
    </div>
  );
}

export default RouteForm;
