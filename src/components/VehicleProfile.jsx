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
 * @returns {{ confort: number, alerte: number, max: number }}
 */
function calculateSlopes(cv, poidsVide, charge) {
  const puissanceW = cv * 735.5;
  const masseTotale = poidsVide + charge;
  // Vitesse en 1ère ≈ 15 km/h = 4.17 m/s
  const vitesse1ere = 4.17;

  const forceTraction = puissanceW / vitesse1ere;
  const forceRoulement = masseTotale * 9.81 * CRR;
  const forceDispo = forceTraction - forceRoulement;
  const penteMaxTheorique = (forceDispo / (masseTotale * 9.81)) * 100;

  // Pente réaliste = ~40-45% de la théorique (marge moteur, refroidissement)
  const penteMax = Math.round(penteMaxTheorique * 0.42);
  const confort = Math.round(penteMax * 0.6);
  const alerte = Math.round(penteMax * 0.85);

  return {
    confort: Math.max(5, confort),
    alerte: Math.max(8, alerte),
    max: Math.max(10, penteMax),
  };
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
            /* Liste des modèles par marque */
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
              {Object.entries(byMarque).map(([marque, vehicules]) => (
                <div key={marque}>
                  <p className="text-sm font-semibold text-gray-500 mb-1">{marque}</p>
                  {vehicules.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleSelectVehicle(v)}
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
              ))}
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
          {/* Charge */}
          <label className="block text-sm font-semibold text-gray-500 mb-1">
            Charge embarquée : {charge} kg
          </label>
          <input
            type="range"
            min="0"
            max="200"
            step="10"
            value={charge}
            onChange={(e) => setCharge(parseInt(e.target.value, 10))}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer
                       bg-gray-200 accent-[var(--vr-green)]"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>0 kg</span>
            <span>200 kg</span>
          </div>

          {/* Seuils de pente */}
          {profile.slopes && (
            <div className="mt-3 flex gap-2">
              <div className="flex-1 text-center px-2 py-2 rounded-lg bg-green-50 border border-[var(--vr-green)]">
                <p className="text-xs text-gray-500">Confort</p>
                <p className="text-sm font-bold text-[var(--vr-green)]">≤ {profile.slopes.confort}%</p>
              </div>
              <div className="flex-1 text-center px-2 py-2 rounded-lg bg-orange-50 border border-[var(--vr-orange)]">
                <p className="text-xs text-gray-500">Alerte</p>
                <p className="text-sm font-bold text-[var(--vr-orange)]">{profile.slopes.confort}-{profile.slopes.alerte}%</p>
              </div>
              <div className="flex-1 text-center px-2 py-2 rounded-lg bg-red-50 border border-[var(--vr-red)]">
                <p className="text-xs text-gray-500">Max</p>
                <p className="text-sm font-bold text-[var(--vr-red)]">&gt; {profile.slopes.alerte}%</p>
              </div>
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

export default VehicleProfile;
