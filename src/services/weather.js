/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */

const METEO_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * Codes météo WMO → texte + emoji.
 */
const WMO_CODES = {
  0: { text: 'Ciel dégagé', emoji: '☀️' },
  1: { text: 'Peu nuageux', emoji: '🌤️' },
  2: { text: 'Partiellement nuageux', emoji: '⛅' },
  3: { text: 'Couvert', emoji: '☁️' },
  45: { text: 'Brouillard', emoji: '🌫️' },
  48: { text: 'Brouillard givrant', emoji: '🌫️' },
  51: { text: 'Bruine légère', emoji: '🌦️' },
  53: { text: 'Bruine', emoji: '🌦️' },
  55: { text: 'Bruine forte', emoji: '🌧️' },
  61: { text: 'Pluie légère', emoji: '🌦️' },
  63: { text: 'Pluie', emoji: '🌧️' },
  65: { text: 'Pluie forte', emoji: '🌧️' },
  71: { text: 'Neige légère', emoji: '🌨️' },
  73: { text: 'Neige', emoji: '❄️' },
  75: { text: 'Neige forte', emoji: '❄️' },
  80: { text: 'Averses', emoji: '🌦️' },
  81: { text: 'Averses modérées', emoji: '🌧️' },
  82: { text: 'Averses violentes', emoji: '⛈️' },
  95: { text: 'Orage', emoji: '⛈️' },
  96: { text: 'Orage grêle', emoji: '⛈️' },
  99: { text: 'Orage grêle forte', emoji: '⛈️' },
};

/**
 * Récupère la météo actuelle et prévisions pour un point (tâche 2.11).
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{current: object, hourly: Array}|null>}
 */
export async function fetchWeather(lat, lon) {
  if (lat == null || lon == null) return null;

  try {
    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      current: 'temperature_2m,weather_code,wind_speed_10m,precipitation',
      hourly: 'temperature_2m,weather_code,precipitation_probability',
      forecast_days: '1',
      timezone: 'Europe/Paris',
    });

    const response = await fetch(`${METEO_URL}?${params}`);
    if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);

    const data = await response.json();

    const code = data.current?.weather_code ?? 0;
    const wmo = WMO_CODES[code] || WMO_CODES[0];

    const current = {
      temperature: Math.round(data.current?.temperature_2m ?? 0),
      weatherCode: code,
      weatherText: wmo.text,
      weatherEmoji: wmo.emoji,
      windSpeed: Math.round(data.current?.wind_speed_10m ?? 0),
      precipitation: data.current?.precipitation ?? 0,
    };

    // Prévisions horaires (prochaines 12h)
    const hourly = [];
    if (data.hourly?.time) {
      const now = new Date();
      for (let i = 0; i < data.hourly.time.length && hourly.length < 12; i++) {
        const t = new Date(data.hourly.time[i]);
        if (t < now) continue;
        const hCode = data.hourly.weather_code?.[i] ?? 0;
        const hWmo = WMO_CODES[hCode] || WMO_CODES[0];
        hourly.push({
          time: t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          temperature: Math.round(data.hourly.temperature_2m?.[i] ?? 0),
          emoji: hWmo.emoji,
          precipProb: data.hourly.precipitation_probability?.[i] ?? 0,
        });
      }
    }

    return { current, hourly };
  } catch (err) {
    console.warn('VintageRoute weather error:', err.message);
    return null;
  }
}

/**
 * Récupère la météo au point milieu d'un itinéraire.
 */
export async function fetchRouteWeather(routeGeoJSON) {
  const coords = routeGeoJSON?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;

  const mid = coords[Math.floor(coords.length / 2)];
  return fetchWeather(mid[1], mid[0]);
}

export { WMO_CODES };
