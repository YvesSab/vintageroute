/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */
import { distMeters as haversineMeters } from './utils';

/**
 * DEC-043 + DEC-068 — Scoring paysager combiné : sinuosité (40%) + POI (40%) + route type (20%)
 * DEC-068 : accepte un poiCount optionnel pour éviter la 2e requête Overpass redondante.
 * Si poiCount est fourni (nombre de POI déjà chargés par fetchPOIs), on l'utilise directement.
 * Sinuosité : algorithme Curvature (adamfranco/curvature) adapté aux voitures anciennes.
 */
export function calculateScenicScore(routeGeoJSON, poiCount = 0) {
  const coords = routeGeoJSON?.geometry?.coordinates;
  if (!coords || coords.length < 2) return { score: 0, details: {}, label: 'Inconnu' };

  // 1. Scoring sinuosité (sur les coordonnées de la route, pas d'appel API)
  const sinuosity = calculateSinuosity(coords);

  // 2. Scoring POI — DEC-068 : utilise le nombre de POI déjà chargés (plus de requête Overpass)
  const totalDist = routeDistance(coords);
  const totalElements = poiCount;
  const poiDensity = totalDist > 0 ? totalElements / totalDist : 0;

  // 3. Scoring route type (petites routes = bonus)
  // Basé sur la longueur moyenne des segments : segments courts = route sinueuse de campagne
  const avgSegment = totalDist > 0 ? (totalDist * 1000) / coords.length : 100;
  // < 50m par segment = route de campagne sinueuse, > 200m = grande ligne droite
  let routeTypeScore;
  if (avgSegment < 30) routeTypeScore = 5;
  else if (avgSegment < 60) routeTypeScore = 4;
  else if (avgSegment < 100) routeTypeScore = 3;
  else if (avgSegment < 200) routeTypeScore = 2;
  else routeTypeScore = 1;

  // Score combiné pondéré (1-5)
  const poiScore = poiDensity < 1 ? 1 : poiDensity < 3 ? 2 : poiDensity < 6 ? 3 : poiDensity < 10 ? 4 : 5;

  const combined = sinuosity.score * 0.4 + poiScore * 0.4 + routeTypeScore * 0.2;
  const finalScore = Math.max(1, Math.min(5, Math.round(combined)));

  const labels = { 1: 'Peu paysager', 2: 'Agréable', 3: 'Joli parcours', 4: 'Très beau', 5: 'Exceptionnel' };

  return {
    score: finalScore,
    details: {
      totalElements,
      distanceKm: Math.round(totalDist * 10) / 10,
      densityPerKm: Math.round(poiDensity * 10) / 10,
      sinuosity: sinuosity.label,
      sinuosityScore: sinuosity.score,
      gentleCurves: sinuosity.gentle,
      sharpTurns: sinuosity.sharp,
    },
    label: labels[finalScore],
  };
}

/**
 * Algorithme de sinuosité basé sur Curvature (adamfranco/curvature).
 * Pour chaque triplet de 3 points consécutifs, calcule le rayon du cercle
 * circonscrit. Adapté aux voitures anciennes :
 * - Courbes douces (100-500m) → +2 (route paysagère agréable)
 * - Courbes moyennes (50-100m) → +1 (intéressant, prudence)
 * - Virages serrés (<50m) → -1 (dangereux : freins à tambour, direction sans assistance)
 * - Ligne droite (>500m) → 0 (monotone)
 */
export function calculateSinuosity(coords) {
  if (coords.length < 10) return { score: 3, label: 'Trop court', gentle: 0, sharp: 0, sharpCoords: [] };

  // Sous-échantillonner si trop de points (garder ~200 points pour performance)
  let pts = coords;
  if (coords.length > 300) {
    const step = Math.floor(coords.length / 200);
    pts = coords.filter((_, i) => i % step === 0 || i === coords.length - 1);
  }

  let totalScore = 0;
  let curveCount = 0;
  let gentleCount = 0;
  let sharpCount = 0;
  const sharpCoords = []; // DEC-046 Bloc E : coordonnées des virages serrés

  for (let i = 1; i < pts.length - 1; i++) {
    const p1 = pts[i - 1];
    const p2 = pts[i];
    const p3 = pts[i + 1];

    const radius = circumRadius(p1, p2, p3);
    if (radius === Infinity || radius > 2000) continue; // points alignés

    curveCount++;
    if (radius >= 100 && radius <= 500) {
      totalScore += 2; // courbe douce = paysager
      gentleCount++;
    } else if (radius >= 50 && radius < 100) {
      totalScore += 1; // courbe moyenne
    } else if (radius < 50) {
      totalScore -= 1; // virage serré = danger pour anciennes
      sharpCount++;
      sharpCoords.push({ lon: p2[0], lat: p2[1], radius: Math.round(radius) });
    }
    // radius 500-2000 → 0 (ni bonus ni malus)
  }

  if (curveCount === 0) return { score: 2, label: 'Ligne droite', gentle: 0, sharp: 0, sharpCoords: [] };

  // Normaliser : score moyen par courbe, ramené sur 1-5
  const avg = totalScore / curveCount;
  // avg typique : -1 à +2. Mapper sur 1-5 :
  // -1 → 1, 0 → 2.5, 1 → 3.5, 2 → 5
  const mapped = Math.max(1, Math.min(5, 2.5 + avg * 1.5));
  const score = Math.round(mapped);

  const labels = {
    1: 'Virages serrés — Prudence',
    2: 'Route directe',
    3: 'Route agréable',
    4: 'Très belle route',
    5: 'Route de charme',
  };

  return { score, label: labels[score] || '', gentle: gentleCount, sharp: sharpCount, sharpCoords };
}

/**
 * DEC-046 Bloc E : Extraire les descentes fortes depuis les données d'altitude.
 * @param {Object} elevationData — { points: [{dist, alt, lon, lat}], slopes: [{dist, slope}] }
 * @param {number} threshold — seuil de pente en % (ex: 10 = descente > 10%)
 * @returns {Array<{lon, lat, slope}>}
 */
export function extractSteepDescents(elevationData, threshold = 10) {
  if (!elevationData?.points || !elevationData?.slopes) return [];
  const descents = [];
  for (let i = 0; i < elevationData.slopes.length; i++) {
    const s = elevationData.slopes[i];
    if (s.slope < -threshold) {
      // Trouver le point correspondant (même index)
      const pt = elevationData.points[i] || elevationData.points[i + 1];
      if (pt?.lon && pt?.lat) {
        descents.push({ lon: pt.lon, lat: pt.lat, slope: s.slope });
      }
    }
  }
  return descents;
}

/**
 * Rayon du cercle circonscrit à 3 points (en mètres).
 * Utilise la formule : R = (a × b × c) / (4 × aire du triangle)
 * avec l'aire calculée par la formule de Héron.
 */
function circumRadius(p1, p2, p3) {
  const a = distPlane(p1, p2);
  const b = distPlane(p2, p3);
  const c = distPlane(p1, p3);

  const s = (a + b + c) / 2;
  const areaSquared = s * (s - a) * (s - b) * (s - c);
  if (areaSquared <= 0) return Infinity; // points alignés
  const area = Math.sqrt(areaSquared);
  if (area < 0.1) return Infinity;

  return (a * b * c) / (4 * area);
}

/**
 * Distance en mètres entre 2 points [lng, lat].
 * Approximation plane (suffisante pour des distances < 1 km, utilisée pour circumRadius).
 */
function distPlane(p1, p2) {
  const LAT_M = 111320; // mètres par degré de latitude
  const midLat = (p1[1] + p2[1]) / 2;
  const LNG_M = LAT_M * Math.cos(midLat * Math.PI / 180);
  const dx = (p2[0] - p1[0]) * LNG_M;
  const dy = (p2[1] - p1[1]) * LAT_M;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Distance totale de la route en km */
function routeDistance(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineMeters(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]) / 1000;
  }
  return total;
}
