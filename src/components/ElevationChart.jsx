/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/vintageroute/vintageroute
 */

import React from 'react';

const CHART_W = 360;
const CHART_H = 140;
const PAD = { top: 10, right: 10, bottom: 25, left: 40 };
const INNER_W = CHART_W - PAD.left - PAD.right;
const INNER_H = CHART_H - PAD.top - PAD.bottom;

// Couleurs charte graphique
const COLORS = {
  ok: '#5b6b2d',
  warning: '#c97b32',
  forbidden: '#7a2e2e',
};

/**
 * Retourne la couleur selon la pente et les seuils véhicule.
 */
function slopeColor(absSlope, slopes) {
  if (!slopes) return COLORS.ok;
  if (absSlope <= slopes.confort) return COLORS.ok;
  if (absSlope <= slopes.alerte) return COLORS.warning;
  return COLORS.forbidden;
}

/**
 * Profil altimétrique SVG avec coloration par pente.
 */
function ElevationChart({ elevationData, vehicleSlopes }) {
  if (!elevationData || !elevationData.points || elevationData.points.length < 2) {
    return null;
  }

  const { points, totalUp, totalDown, minAlt, maxAlt } = elevationData;
  const totalDist = points[points.length - 1].dist;

  // Marge altitude pour l'affichage
  const altRange = maxAlt - minAlt || 1;
  const displayMin = minAlt - altRange * 0.1;
  const displayMax = maxAlt + altRange * 0.1;
  const displayRange = displayMax - displayMin;

  // Fonctions de conversion
  const x = (dist) => PAD.left + (dist / totalDist) * INNER_W;
  const y = (alt) => PAD.top + INNER_H - ((alt - displayMin) / displayRange) * INNER_H;

  // Construire le path de remplissage
  const areaPath = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${x(p.dist).toFixed(1)},${y(p.alt).toFixed(1)}`
  ).join(' ') +
    ` L${x(totalDist).toFixed(1)},${(PAD.top + INNER_H).toFixed(1)}` +
    ` L${PAD.left},${(PAD.top + INNER_H).toFixed(1)} Z`;

  // Segments colorés par pente
  const slopeSegments = [];
  for (let i = 1; i < points.length; i++) {
    const dDist = points[i].dist - points[i - 1].dist;
    const dAlt = points[i].alt - points[i - 1].alt;
    const slope = dDist > 0 ? Math.abs(dAlt / dDist) * 100 : 0;
    const color = slopeColor(slope, vehicleSlopes);

    slopeSegments.push(
      <line
        key={i}
        x1={x(points[i - 1].dist)}
        y1={y(points[i - 1].alt)}
        x2={x(points[i].dist)}
        y2={y(points[i].alt)}
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    );
  }

  // Graduations altitude (3-4 labels)
  const altSteps = [];
  const nSteps = 4;
  for (let i = 0; i <= nSteps; i++) {
    const alt = displayMin + (i / nSteps) * displayRange;
    altSteps.push(alt);
  }

  // Graduations distance (tous les ~5 km)
  const distSteps = [];
  const kmStep = Math.max(1, Math.ceil(totalDist / 1000 / 5)) * 1000;
  for (let d = 0; d <= totalDist; d += kmStep) {
    distSteps.push(d);
  }
  if (distSteps[distSteps.length - 1] < totalDist * 0.9) {
    distSteps.push(totalDist);
  }

  return (
    <div className="bg-white rounded-xl shadow p-3">
      <p className="text-sm font-semibold text-gray-500 mb-2">Profil altimétrique</p>

      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ maxHeight: '160px' }}>
        {/* Zone remplie sous la courbe */}
        <path d={areaPath} fill="#e6dcc6" opacity="0.5" />

        {/* Grille horizontale */}
        {altSteps.map((alt, i) => (
          <g key={`alt-${i}`}>
            <line
              x1={PAD.left} y1={y(alt)}
              x2={CHART_W - PAD.right} y2={y(alt)}
              stroke="#ddd" strokeWidth="0.5"
            />
            <text x={PAD.left - 4} y={y(alt) + 3}
                  textAnchor="end" fontSize="8" fill="#999">
              {Math.round(alt)} m
            </text>
          </g>
        ))}

        {/* Graduations distance */}
        {distSteps.map((d, i) => (
          <text key={`dist-${i}`}
                x={x(d)} y={CHART_H - 4}
                textAnchor="middle" fontSize="8" fill="#999">
            {Math.round(d / 1000)} km
          </text>
        ))}

        {/* Segments colorés par pente */}
        {slopeSegments}
      </svg>

      {/* Résumé dénivelé */}
      <div className="flex justify-center gap-4 mt-2">
        <span className="text-sm text-[var(--vr-green)] font-semibold">
          ▲ +{totalUp} m
        </span>
        <span className="text-sm text-[var(--vr-red)] font-semibold">
          ▼ −{totalDown} m
        </span>
        <span className="text-xs text-gray-400">
          {minAlt} – {maxAlt} m
        </span>
      </div>
    </div>
  );
}

export default ElevationChart;
