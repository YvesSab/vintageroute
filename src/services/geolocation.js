/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/vintageroute/vintageroute
 */

/**
 * Distance approx en mètres entre 2 points GPS.
 */
export function distMeters(lon1, lat1, lon2, lat2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Trouve le point le plus proche sur un itinéraire et retourne
 * la distance restante jusqu'à la fin.
 * @param {number} lon - Longitude actuelle
 * @param {number} lat - Latitude actuelle
 * @param {Array<[number,number]>} routeCoords - Coordonnées de l'itinéraire
 * @returns {{ distRemaining: number, nearestIndex: number, distFromRoute: number }}
 */
export function distanceRemaining(lon, lat, routeCoords) {
  if (!routeCoords || routeCoords.length < 2) return null;

  let minDist = Infinity;
  let nearestIndex = 0;

  // Trouver le point le plus proche
  for (let i = 0; i < routeCoords.length; i++) {
    const d = distMeters(lon, lat, routeCoords[i][0], routeCoords[i][1]);
    if (d < minDist) {
      minDist = d;
      nearestIndex = i;
    }
  }

  // Calculer la distance restante depuis ce point
  let remaining = 0;
  for (let i = nearestIndex; i < routeCoords.length - 1; i++) {
    remaining += distMeters(
      routeCoords[i][0], routeCoords[i][1],
      routeCoords[i + 1][0], routeCoords[i + 1][1]
    );
  }

  return {
    distRemaining: remaining,
    nearestIndex,
    distFromRoute: minDist,
  };
}

/**
 * Démarre le suivi GPS continu.
 * @param {function} onUpdate - Callback avec { lat, lon, speed, heading, accuracy, timestamp }
 * @param {function} onError - Callback erreur
 * @returns {number} watchId pour arrêter le suivi
 */
export function startTracking(onUpdate, onError) {
  if (!navigator.geolocation) {
    onError(new Error('Géolocalisation non disponible'));
    return null;
  }

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      onUpdate({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        speed: pos.coords.speed, // m/s ou null
        heading: pos.coords.heading, // degrés ou null
        accuracy: pos.coords.accuracy, // mètres
        timestamp: pos.timestamp,
      });
    },
    (err) => {
      onError(err);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
    }
  );

  return watchId;
}

/**
 * Arrête le suivi GPS.
 * @param {number} watchId
 */
export function stopTracking(watchId) {
  if (watchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
  }
}
