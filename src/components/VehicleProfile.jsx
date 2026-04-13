/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/vintageroute/vintageroute
 */

import React, { useState, useEffect, useCallback } from 'react';
import vehiculesDB from '../data/vehicules.json';

const STORAGE_KEY = 'vintageroute-vehicle';
const CRR = 0.015; // Coefficient résistance au roulement (pneu ancien bitume)

/**
 * Calcule les seuils de pente pour un véhicule donné.
 * Valeurs bornées aux pentes réalistes des routes françaises :
 * - Départementales : 8-12% courant, 15% réglementaire
 * - Cols montagne : passages ponctuels à 18-20% (exceptionnel)
 * - Au-delà de 20% : quasiment inexistant sur route ouverte en France
 * @returns {{ confort: number, alerte: number, max: number }}
 */
function calculateSlopes(cv, poidsVide, charge) {
  const masseTotale = poidsVide + charge;
  // Formule calibrée sur les 218 véhicules de la base (ratio cv/masse)
  // Plus le ratio est élevé, plus la voiture grimpe facilement
  const ratio = cv / masseTotale;
  const confortBrut = Math.round(ratio * 200 + 5);

  // Bornes réalistes : confort 5-18%, alerte max 20%
  const confort = Math.min(18, Math.max(5, confortBrut));
  const alerte = Math.min(20, confort + 3);
  const max = Math.min(20, alerte + 2);

  return { confort, alerte, max };
}

/**
 * Charge le profil véhicule depuis localStorage.
 */
function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('VintageRoute: erreur lecture profil véhicule', e);
  }
  return null;
}

/**
 * Sauvegarde le profil véhicule dans localStorage.
 */
function saveProfile(profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.warn('VintageRoute: erreur sauvegarde profil véhicule', e);
  }
}

/**
 * Composant de sélection et gestion du profil véhicule.
 */
function VehicleProfile({ onProfileChange }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [charge, setCharge] = useState(150);
  const [mode, setMode] = useState('list'); // 'list' | 'manual'
  const [searchFilter, setSearchFilter] = useState('');

  // Champs saisie manuelle
  const [manualMarque, setManualMarque] = useState('');
  const [manualModele, setManualModele] = useState('');
  const [manualCV, setManualCV] = useState('');
  const [manualPoids, setManualPoids] = useState('');
  const [manualVmax, setManualVmax] = useState('');

  // Charger le profil au démarrage
  useEffect(() => {
    const saved = loadProfile();
    if (saved) {
      setProfile(saved);
      setCharge(saved.charge || 150);
      if (onProfileChange) onProfileChange(saved);
    }
  }, [onProfileChange]);

  // Mettre à jour les pentes quand la charge change
  useEffect(() => {
    if (!profile) return;
    const slopes = calculateSlopes(profile.cv, profile.poids, charge);
    const updated = { ...profile, charge, slopes };
    setProfile(updated);
    saveProfile(updated);
    if (onProfileChange) onProfileChange(updated);
  }, [charge]); // charge change triggers recalculation

  const handleSelectVehicle = useCallback((vehicule) => {
    const slopes = calculateSlopes(vehicule.cv, vehicule.poids, charge);
    const newProfile = {
      id: vehicule.id,
      marque: vehicule.marque,
      modele: vehicule.modele,
      annees: vehicule.annees,
      cv: vehicule.cv,
      poids: vehicule.poids,
      vmax: vehicule.vmax,
      charge,
      carburant: 'SP98',
      slopes,
      manual: false,
    };
    setProfile(newProfile);
    saveProfile(newProfile);
    if (onProfileChange) onProfileChange(newProfile);
    setOpen(false);
  }, [charge, onProfileChange]);

  const handleManualSave = useCallback(() => {
    const cv = parseInt(manualCV, 10);
    const poids = parseInt(manualPoids, 10);
    const vmax = parseInt(manualVmax, 10);
    if (!manualMarque || !manualModele || !cv || !poids) return;

    const slopes = calculateSlopes(cv, poids, charge);
    const newProfile = {
      id: 'manual',
      marque: manualMarque,
      modele: manualModele,
      annees: '',
      cv,
      poids,
      vmax: vmax || 80,
      charge,
      carburant: 'SP98',
      slopes,
      manual: true,
    };
    setProfile(newProfile);
    saveProfile(newProfile);
    if (onProfileChange) onProfileChange(newProfile);
    setOpen(false);
  }, [manualMarque, manualModele, manualCV, manualPoids, manualVmax, charge, onProfileChange]);

  const handleClearProfile = useCallback(() => {
    setProfile(null);
    localStorage.removeItem(STORAGE_KEY);
    if (onProfileChange) onProfileChange(null);
  }, [onProfileChange]);

  // Regrouper les véhicules par marque
  const byMarque = {};
  vehiculesDB.forEach((v) => {
    if (!byMarque[v.marque]) byMarque[v.marque] = [];
    byMarque[v.marque].push(v);
  });

  return (
    <div className="bg-white rounded-xl shadow p-4">
      {/* En-tête cliquable */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left min-h-0"
      >
        <div>
          <span className="text-sm font-semibold text-gray-500">🚗 Véhicule</span>
          {profile ? (
            <p className="text-senior font-bold text-[var(--vr-navy)]">
              {profile.marque} {profile.modele}
            </p>
          ) : (
            <p className="text-senior text-gray-400">Aucun véhicule sélectionné</p>
          )}
        </div>
        <span className="text-xl text-gray-400">{open ? '▲' : '▼'}</span>
      </button>

      {/* Panneau déplié */}
      {open && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          {/* Onglets Liste / Manuel */}
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setMode('list')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg
                ${mode === 'list'
                  ? 'bg-[var(--vr-green)] text-white'
                  : 'bg-gray-100 text-gray-600'
                }`}
            >
              Modèles connus
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg
                ${mode === 'manual'
                  ? 'bg-[var(--vr-green)] text-white'
                  : 'bg-gray-100 text-gray-600'
                }`}
            >
              Saisie manuelle
            </button>
          </div>

          {mode === 'list' ? (
            /* Liste des modèles par marque avec recherche */
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="🔍 Rechercher une marque ou un modèle..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm
                  focus:border-[var(--vr-green)] focus:outline-none"
              />
              <div className="max-h-60 overflow-y-auto flex flex-col gap-2">
              {Object.entries(byMarque)
                .filter(([marque, vehicules]) => {
                  if (!searchFilter.trim()) return true;
                  const s = searchFilter.toLowerCase();
                  return marque.toLowerCase().includes(s) ||
                    vehicules.some(v => v.modele.toLowerCase().includes(s));
                })
                .map(([marque, vehicules]) => {
                  const s = searchFilter.toLowerCase().trim();
                  const filtered = s
                    ? vehicules.filter(v =>
                        marque.toLowerCase().includes(s) ||
                        v.modele.toLowerCase().includes(s) ||
                        `${marque} ${v.modele}`.toLowerCase().includes(s)
                      )
                    : vehicules;
                  if (filtered.length === 0) return null;
                  return (
                <div key={marque}>
                  <p className="text-sm font-semibold text-gray-500 mb-1">{marque} ({filtered.length})</p>
                  {filtered.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => { handleSelectVehicle(v); setSearchFilter(''); }}
                      className={`w-full text-left px-3 py-2 rounded-lg mb-1 text-sm
                        border transition-colors
                        ${profile && profile.id === v.id
                          ? 'border-[var(--vr-green)] bg-green-50 font-bold'
                          : 'border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                      <span className="font-medium">{v.modele}</span>
                      <span className="text-gray-400 ml-2">{v.annees} — {v.cv} CV, {v.poids} kg</span>
                    </button>
                  ))}
                </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 text-center">{vehiculesDB.length} véhicules disponibles</p>
            </div>
          ) : (
            /* Saisie manuelle */
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="Marque"
                value={manualMarque}
                onChange={(e) => setManualMarque(e.target.value)}
                className="px-3 py-2 border-2 border-[var(--vr-brown)] rounded-lg text-sm"
              />
              <input
                type="text"
                placeholder="Modèle"
                value={manualModele}
                onChange={(e) => setManualModele(e.target.value)}
                className="px-3 py-2 border-2 border-[var(--vr-brown)] rounded-lg text-sm"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="CV"
                  value={manualCV}
                  onChange={(e) => setManualCV(e.target.value)}
                  className="flex-1 px-3 py-2 border-2 border-[var(--vr-brown)] rounded-lg text-sm"
                />
                <input
                  type="number"
                  placeholder="Poids (kg)"
                  value={manualPoids}
                  onChange={(e) => setManualPoids(e.target.value)}
                  className="flex-1 px-3 py-2 border-2 border-[var(--vr-brown)] rounded-lg text-sm"
                />
                <input
                  type="number"
                  placeholder="V.max"
                  value={manualVmax}
                  onChange={(e) => setManualVmax(e.target.value)}
                  className="flex-1 px-3 py-2 border-2 border-[var(--vr-brown)] rounded-lg text-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleManualSave}
                disabled={!manualMarque || !manualModele || !manualCV || !manualPoids}
                className="py-2 rounded-lg text-sm font-bold
                  bg-[var(--vr-green)] text-white
                  disabled:bg-gray-300 disabled:text-gray-500"
              >
                Enregistrer
              </button>
            </div>
          )}
        </div>
      )}

      {/* Curseur de charge + seuils (toujours visible si profil sélectionné) */}
      {profile && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          {/* Charge — Bloc K : curseur adapté au véhicule */}
          {(() => {
            // Charge max = estimation basée sur le poids à vide du véhicule
            // PTAC typique ≈ poids × 1.30 à 1.40, donc chargeMax ≈ poids × 0.30 à 0.40
            const chargeMax = Math.max(200, Math.min(600, Math.round(profile.poids * 0.35)));
            const chargeStep = 10;
            const chargeVal = Math.min(charge, chargeMax);
            return (
              <>
                <label className="block text-sm font-semibold text-gray-500 mb-1">
                  Charge embarquée : {chargeVal} kg
                  <span className="text-xs font-normal text-gray-400 ml-1">(max {chargeMax} kg)</span>
                </label>
                <p className="text-xs text-gray-400 mb-2 leading-relaxed">
                  💡 Conducteur (~75 kg) + passager(s) + bagages + plein d'essence (~40 kg).
                  La charge modifie les seuils de pente.
                </p>
                <input
                  type="range"
                  min="0"
                  max={chargeMax}
                  step={chargeStep}
                  value={chargeVal}
                  onChange={(e) => setCharge(parseInt(e.target.value, 10))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer
                             bg-gray-200 accent-[var(--vr-green)]"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0 kg</span>
                  <span>{chargeMax} kg</span>
                </div>
              </>
            );
          })()}

          {/* Jauge de pente style compteur vintage */}
          {profile.slopes && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 text-center mb-1">Capacité en pente (montée & descente)</p>
              <SlopeGauge slopes={profile.slopes} />
            </div>
          )}

          {/* Bouton supprimer */}
          <button
            type="button"
            onClick={handleClearProfile}
            className="mt-3 w-full py-2 text-sm rounded-lg
                       bg-gray-100 text-gray-500 hover:bg-gray-200"
          >
            Supprimer le véhicule
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Jauge de pente style compteur vintage années 50 (SVG).
 * Design Gemini — cerclage chrome, cadran ivoire, aiguille effilée, reflet verre.
 */
function SlopeGauge({ slopes }) {
  if (!slopes) return null;
  const { confort, alerte, max } = slopes;
  // Échelle fixe 0-25% : couvre toutes les routes françaises réelles
  // (aucune route ouverte ne dépasse 20% en France)
  const maxGauge = 25;
  const cx = 100, cy = 110;

  const polarToCartesian = (radius, value) => {
    const angleInDegrees = 180 + (value / maxGauge) * 180;
    const angleInRadians = angleInDegrees * (Math.PI / 180);
    return { x: cx + radius * Math.cos(angleInRadians), y: cy + radius * Math.sin(angleInRadians) };
  };

  const describeArc = (radius, startVal, endVal) => {
    const start = polarToCartesian(radius, startVal);
    const end = polarToCartesian(radius, endVal);
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
  };

  const needleRotation = 180 + (confort / maxGauge) * 180 - 270;

  const ticks = [];
  const numbers = [];
  for (let i = 0; i <= maxGauge; i++) {
    const isMajor = i % 5 === 0;
    const pOuter = polarToCartesian(86, i);
    const pInner = polarToCartesian(isMajor ? 78 : 82, i);
    ticks.push(<line key={`t${i}`} x1={pInner.x} y1={pInner.y} x2={pOuter.x} y2={pOuter.y} stroke="#2c2c2c" strokeWidth={isMajor ? 1.5 : 0.5} />);
    if (isMajor) {
      const pText = polarToCartesian(65, i);
      numbers.push(<text key={`n${i}`} x={pText.x} y={pText.y + 3} textAnchor="middle" fill="#1a1a1a" fontSize="10" fontFamily="Georgia, serif" fontWeight="bold">{i}</text>);
    }
  }

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 128" width="100%">
        <defs>
          <radialGradient id="vrDialGrad" cx="50%" cy="100%" r="100%">
            <stop offset="0%" stopColor="#fdfbf7" />
            <stop offset="80%" stopColor="#f0ecd9" />
            <stop offset="100%" stopColor="#dcd5bc" />
          </radialGradient>
          <linearGradient id="vrChromeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e8e8e8" />
            <stop offset="25%" stopColor="#ffffff" />
            <stop offset="50%" stopColor="#999" />
            <stop offset="75%" stopColor="#555" />
            <stop offset="100%" stopColor="#bbb" />
          </linearGradient>
          <linearGradient id="vrGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e8d07d" />
            <stop offset="50%" stopColor="#c4a23d" />
            <stop offset="100%" stopColor="#8a6e1c" />
          </linearGradient>
          <filter id="vrNeedleSh" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0.8" dy="1.2" stdDeviation="1" floodOpacity="0.3" />
          </filter>
        </defs>

        {/* Cerclage chrome */}
        <path d="M 10 110 A 90 90 0 0 1 190 110 Z" fill="url(#vrDialGrad)" stroke="url(#vrChromeGrad)" strokeWidth="5" strokeLinejoin="round" />
        <path d="M 14 110 A 86 86 0 0 1 186 110" fill="none" stroke="#000" strokeWidth="0.4" opacity="0.2" />

        {/* Vis décoratives */}
        <circle cx="28" cy="102" r="1.8" fill="#aaa" stroke="#777" strokeWidth="0.4" />
        <circle cx="172" cy="102" r="1.8" fill="#aaa" stroke="#777" strokeWidth="0.4" />

        {/* Zones colorées */}
        <path d={describeArc(73, 0, confort)} fill="none" stroke="#5b6b2d" strokeWidth="6" />
        <path d={describeArc(73, confort, alerte)} fill="none" stroke="#c97b32" strokeWidth="6" />
        <path d={describeArc(73, alerte, maxGauge)} fill="none" stroke="#7a2e2e" strokeWidth="6" />

        {/* Graduations et chiffres */}
        {ticks}
        {numbers}

        {/* Labels cadran */}
        <text x="100" y="78" textAnchor="middle" fill="#2a2a2a" fontSize="7" fontFamily="Georgia, serif" letterSpacing="1.5">% PENTE</text>
        <text x="100" y="90" textAnchor="middle" fill="#555" fontSize="5.5" fontFamily="Georgia, serif">Seuil véhicule : {confort}%</text>

        {/* Aiguille effilée + pivot doré */}
        <g transform={`translate(${cx}, ${cy}) rotate(${needleRotation})`} filter="url(#vrNeedleSh)">
          <polygon points="-1.5,16 1.5,16 0.5,-74 -0.5,-74" fill="#1c1c1c" />
          <circle cx="0" cy="0" r="5.5" fill="url(#vrGoldGrad)" stroke="#665213" strokeWidth="0.4" />
          <circle cx="0" cy="0" r="1.8" fill="#222" />
        </g>

        {/* Reflet verre */}
        <path d="M 16 108 A 84 84 0 0 1 184 108 Q 100 32 16 108 Z" fill="#ffffff" opacity="0.07" pointerEvents="none" />
      </svg>

      {/* Légende */}
      <div className="flex justify-center gap-3 mt-1 text-xs">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full border" style={{ backgroundColor: '#5b6b2d', borderColor: '#3f4a1f' }}></span>
          Confort
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full border" style={{ backgroundColor: '#c97b32', borderColor: '#8e5622' }}></span>
          Vigilance
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full border" style={{ backgroundColor: '#7a2e2e', borderColor: '#4a1c1c' }}></span>
          Prudence
        </span>
      </div>

      {/* Conseils */}
      <div className="mt-2 text-xs text-gray-500 space-y-1 px-1">
        <p>💡 <b>En descente</b> : rétrograder au-delà de {confort}%</p>
        <p>💡 <b>Virages</b> : anticiper, direction non assistée</p>
      </div>
    </div>
  );
}

export default VehicleProfile;
