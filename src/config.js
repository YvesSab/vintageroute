/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 *
 * Configuration centralisée — URLs API, constantes, dictionnaires
 */

// ─── APIs Routing ───
export const BROUTER_URL = 'https://brouter.de/brouter';
export const IGN_ROUTING_URL = 'https://data.geopf.fr/navigation/itineraire';
export const ISOCHRONE_URL = 'https://data.geopf.fr/navigation/isochrone';

// ─── APIs IGN ───
export const IGN_ALTI_URL = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json';
export const IGN_COMPLETION_URL = 'https://data.geopf.fr/geocodage/completion/';
export const IGN_GEOCODE_URL = 'https://data.geopf.fr/geocodage/search';

// ─── Overpass (3 serveurs fallback — DEC-068) ───
// nchc.org.tw retiré (DNS en panne permanente depuis 04/2026)
// kumi.systems redirige vers private.coffee depuis 2025
export const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',           // Principal (Allemagne)
  'https://overpass.private.coffee/api/interpreter',    // Fallback 1 (Autriche, ex-kumi.systems)
  'https://overpass.kumi.systems/api/interpreter',      // Fallback 2 (redirige → private.coffee, DNS indépendant)
];

// ─── Timeouts (ms) ───
export const TIMEOUT_BROUTER = 15000;
export const TIMEOUT_IGN = 15000;
export const TIMEOUT_OVERPASS = 20000;
export const TIMEOUT_WIKIDATA = 10000;

// ─── Constantes routing ───
export const MODERN_CAR_AVG_SPEED = 65;       // km/h référence départementale
export const LOOP_ISOCHRONE_DIVISOR = 3.5;     // ratio isochrone/durée demandée
export const BROUTER_VINTAGE_FACTOR = 1.15;    // BRouter car-eco ≈ 50 km/h, ancienne ≈ 15% plus lente
export const MAX_INTERMEDIATES = 5;

// ─── Constantes altitude ───
export const ALTI_MAX_SAMPLES = 200;

// ─── Constantes POI ───
export const POI_BUFFER_KM = 5;       // buffer bbox autour de la route
export const POI_MAX_DIST_M = 3000;   // distance max POI ↔ route

// ─── Catégories POI ───
export const POI_CATEGORIES = {
  viewpoint:   { emoji: '📍', label: 'Point de vue' },
  restaurant:  { emoji: '🍽️', label: 'Restaurant' },
  hotel:       { emoji: '🏨', label: 'Hôtel' },
  historic:    { emoji: '🏛️', label: 'Monument' },
  picnic:      { emoji: '🧺', label: 'Aire de pique-nique' },
  village:     { emoji: '🏘️', label: 'Village classé' },
};

// ─── Traductions historiques OSM → FR ───
export const HISTORIC_FR = {
  memorial: 'Mémorial', castle: 'Château', church: 'Église', chapel: 'Chapelle',
  ruins: 'Ruines', archaeological_site: 'Site archéologique', monument: 'Monument',
  wayside_cross: 'Croix de chemin', wayside_shrine: 'Oratoire', manor: 'Manoir',
  tower: 'Tour', bridge: 'Pont historique', tomb: 'Tombe', pillory: 'Pilori',
  milestone: 'Borne kilométrique', city_gate: 'Porte de ville',
  building: 'Bâtiment historique', battlefield: 'Champ de bataille',
  fort: 'Fort', yes: 'Site historique',
};

// ─── Traductions cuisines OSM → FR ───
export const CUISINE_FR = {
  regional: 'Cuisine régionale', french: 'Française',
  pizza: 'Pizzeria', italian: 'Italienne',
  chinese: 'Chinoise', japanese: 'Japonaise',
  indian: 'Indienne', thai: 'Thaïlandaise', vietnamese: 'Vietnamienne',
  kebab: 'Kebab', burger: 'Burger', steak_house: 'Grillade',
  seafood: 'Fruits de mer', sushi: 'Sushi',
  crepe: 'Crêperie', galette: 'Galettes',
  ice_cream: 'Glaces', sandwich: 'Sandwichs',
  coffee_shop: 'Café', tea: 'Salon de thé',
  mexican: 'Mexicaine', turkish: 'Turque', greek: 'Grecque',
  spanish: 'Espagnole', asian: 'Asiatique', african: 'Africaine',
  american: 'Américaine', portuguese: 'Portugaise',
  lebanese: 'Libanaise', moroccan: 'Marocaine', korean: 'Coréenne',
  vegetarian: 'Végétarien', vegan: 'Végan',
  pastry: 'Pâtisserie', bakery: 'Boulangerie',
  tapas: 'Tapas', fish: 'Poisson', chicken: 'Poulet',
  european: 'Européenne',
};

// ─── APIs Enrichissement POI (DEC-060) ───
export const WIKIPEDIA_API = 'https://fr.wikipedia.org/w/api.php';
export const PHOTON_API = 'https://photon.komoot.io/reverse';
export const POI_CACHE_TTL = 7 * 24 * 3600 * 1000; // 7 jours

// ─── Wikidata SPARQL batch (DEC-065 — Bloc M) ───
export const WIKIDATA_SPARQL_URL = 'https://query.wikidata.org/sparql';
export const SPARQL_MONUMENT_TYPES = [
  'Q23413',   // château
  'Q16970',   // église
  'Q44613',   // abbaye
  'Q879050',  // manoir
  'Q1081138', // château fort
  'Q120560',  // chapelle
  'Q33506',   // musée
  'Q12518',   // tour
];

// ─── Watermark ───
export const _vr = "\x56\x69\x6e\x74\x61\x67\x65\x52\x6f\x75\x74\x65\x2d\x32\x30\x32\x36";
