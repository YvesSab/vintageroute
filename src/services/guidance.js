/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 *
 * DEC-066 — Guidage basique GPS (Bloc P)
 * Projection sur route, détection virages, instructions textuelles, alerte sonore.
 */

// ═══════════ DISTANCE HAVERSINE ═══════════

function distM(lon1, lat1, lon2, lat2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ═══════════ PROJECTION SUR ROUTE ═══════════

/**
 * Projette un point GPS sur le segment de route le plus proche.
 * Retourne l'index du segment, la distance cumulée depuis le départ,
 * la distance au segment, et les distances cumulées du tableau.
 *
 * @param {number} lon - Longitude GPS
 * @param {number} lat - Latitude GPS
 * @param {Array<[number,number]>} coords - Coordonnées de la route [lng, lat]
 * @returns {{ segIndex, distAlong, distFromRoute, cumDists }}
 */
export function projectOnRoute(lon, lat, coords) {
  if (!coords || coords.length < 2) return null;

  // Pré-calculer distances cumulées
  const cumDists = [0];
  for (let i = 1; i < coords.length; i++) {
    cumDists[i] = cumDists[i - 1] + distM(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  }

  let bestDist = Infinity;
  let bestSegIdx = 0;
  let bestT = 0; // paramètre de projection [0,1] sur le segment

  for (let i = 0; i < coords.length - 1; i++) {
    const [ax, ay] = coords[i];
    const [bx, by] = coords[i + 1];

    // Projection du point sur le segment AB (en coordonnées plates approx)
    const cosLat = Math.cos(ay * Math.PI / 180);
    const dxAB = (bx - ax) * cosLat;
    const dyAB = by - ay;
    const dxAP = (lon - ax) * cosLat;
    const dyAP = lat - ay;
    const lenSq = dxAB * dxAB + dyAB * dyAB;

    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, (dxAP * dxAB + dyAP * dyAB) / lenSq));
    }

    // Point projeté
    const px = ax + t * (bx - ax);
    const py = ay + t * (by - ay);
    const d = distM(lon, lat, px, py);

    if (d < bestDist) {
      bestDist = d;
      bestSegIdx = i;
      bestT = t;
    }
  }

  // Distance le long de la route jusqu'au point projeté
  const segLen = cumDists[bestSegIdx + 1] - cumDists[bestSegIdx];
  const distAlong = cumDists[bestSegIdx] + segLen * bestT;

  return {
    segIndex: bestSegIdx,
    distAlong,
    distFromRoute: bestDist,
    totalDist: cumDists[cumDists.length - 1],
    cumDists,
  };
}

// ═══════════ DÉTECTION DES VIRAGES ═══════════

/**
 * Calcule l'angle de virage entre 3 points successifs (en degrés).
 * Positif = virage à droite, Négatif = virage à gauche.
 */
function turnAngle(coords, i) {
  if (i <= 0 || i >= coords.length - 1) return 0;
  const [ax, ay] = coords[i - 1];
  const [bx, by] = coords[i];
  const [cx, cy] = coords[i + 1];
  const cosLat = Math.cos(by * Math.PI / 180);

  const bearing1 = Math.atan2((bx - ax) * cosLat, by - ay);
  const bearing2 = Math.atan2((cx - bx) * cosLat, cy - by);
  let angle = (bearing2 - bearing1) * 180 / Math.PI;

  // Normaliser entre -180 et 180
  while (angle > 180) angle -= 360;
  while (angle < -180) angle += 360;
  return angle;
}

/**
 * Classification d'un virage par angle.
 */
export function classifyTurn(angleDeg) {
  const abs = Math.abs(angleDeg);
  const isRight = angleDeg > 0;

  if (abs < 20) return { direction: 'straight', label: 'Continuez tout droit', arrow: '⬆️' };
  if (abs < 50) return isRight
    ? { direction: 'slight_right', label: 'Légèrement à droite', arrow: '↗️' }
    : { direction: 'slight_left', label: 'Légèrement à gauche', arrow: '↖️' };
  if (abs < 120) return isRight
    ? { direction: 'right', label: 'Tournez à droite', arrow: '➡️' }
    : { direction: 'left', label: 'Tournez à gauche', arrow: '⬅️' };
  if (abs < 160) return isRight
    ? { direction: 'sharp_right', label: 'Virage serré à droite', arrow: '↘️' }
    : { direction: 'sharp_left', label: 'Virage serré à gauche', arrow: '↙️' };
  return { direction: 'u_turn', label: 'Demi-tour', arrow: '🔄' };
}

/**
 * Trouve le prochain virage significatif à partir d'un index de segment.
 * Agrège les petits segments consécutifs pour détecter les vrais virages.
 *
 * @param {number} fromSegIndex - Index segment courant
 * @param {Array} coords - Coordonnées route
 * @param {Array} cumDists - Distances cumulées
 * @param {number} [minAngle=25] - Angle minimum pour compter comme virage
 * @returns {{ index, angle, distFromHere, classification } | null}
 */
export function findNextTurn(fromSegIndex, coords, cumDists, minAngle = 25) {
  if (!coords || fromSegIndex >= coords.length - 2) return null;

  const startDist = cumDists[fromSegIndex] || 0;

  // Chercher en avançant sur la route, agrégation par fenêtre glissante
  for (let i = fromSegIndex + 1; i < coords.length - 1; i++) {
    // Angle cumulé sur une fenêtre de ~50m
    let cumAngle = 0;
    let windowStart = i;
    let windowDist = 0;

    for (let j = i; j < Math.min(i + 5, coords.length - 1); j++) {
      cumAngle += turnAngle(coords, j);
      windowDist += (cumDists[j + 1] || 0) - (cumDists[j] || 0);
      if (windowDist > 80) break; // fenêtre max 80m
    }

    if (Math.abs(cumAngle) >= minAngle) {
      const distFromHere = (cumDists[windowStart] || 0) - startDist;
      // Ignorer les virages trop proches (< 15m, bruit GPS)
      if (distFromHere < 15) continue;

      return {
        index: windowStart,
        angle: cumAngle,
        distFromHere,
        classification: classifyTurn(cumAngle),
      };
    }
  }
  return null;
}

// ═══════════ INSTRUCTIONS TEXTUELLES ═══════════

/**
 * Formate la distance de manière naturelle en français.
 */
function formatDistFR(meters) {
  if (meters < 100) return `${Math.round(meters / 10) * 10} m`;
  if (meters < 1000) return `${Math.round(meters / 50) * 50} m`;
  if (meters < 10000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}

/**
 * Génère l'instruction complète de guidage.
 * @param {Object} nextTurn - Résultat de findNextTurn
 * @param {number} distRemaining - Distance totale restante
 * @returns {{ text, arrow, distance, distText, isClose, isVeryClose }}
 */
export function generateInstruction(nextTurn, distRemaining) {
  // Arrivée imminente
  if (distRemaining != null && distRemaining < 50) {
    return {
      text: 'Vous êtes arrivé à destination',
      arrow: '🏁', distance: 0, distText: '',
      isClose: true, isVeryClose: true,
    };
  }

  // Pas de virage détecté → tout droit
  if (!nextTurn) {
    return {
      text: 'Continuez tout droit',
      arrow: '⬆️',
      distance: distRemaining || 0,
      distText: distRemaining ? `encore ${formatDistFR(distRemaining)}` : '',
      isClose: false, isVeryClose: false,
    };
  }

  const dist = nextTurn.distFromHere;
  const cls = nextTurn.classification;
  const distText = formatDistFR(dist);

  return {
    text: dist < 50 ? cls.label : `${cls.label} dans ${distText}`,
    arrow: cls.arrow,
    distance: dist,
    distText,
    isClose: dist < 300,
    isVeryClose: dist < 100,
  };
}

// ═══════════ ALERTE SONORE ═══════════

let audioCtx = null;

/**
 * Joue un bip court d'alerte (Web Audio API).
 * @param {number} [freq=880] - Fréquence en Hz
 * @param {number} [duration=0.15] - Durée en secondes
 */
export function playBeep(freq = 880, duration = 0.15) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duration);
  } catch { /* Web Audio non disponible */ }
}

/**
 * Double bip (virage imminent).
 */
export function playDoubleBeep() {
  playBeep(880, 0.12);
  setTimeout(() => playBeep(1100, 0.12), 180);
}
