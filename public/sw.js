/**
 * VintageRoute — Service Worker amélioré (DEC-067 — Bloc N)
 * © 2026 Yves — Tous droits réservés
 *
 * Stratégies de cache :
 * - App shell : precache à l'installation
 * - Tuiles carte : CacheFirst (longue durée)
 * - APIs externes : NetworkFirst (fallback cache)
 * - Assets statiques : StaleWhileRevalidate
 */

const CACHE_VERSION = 'vr-v0.9.0';
const CACHE_SHELL = `${CACHE_VERSION}-shell`;
const CACHE_TILES = `${CACHE_VERSION}-tiles`;
const CACHE_API = `${CACHE_VERSION}-api`;
const CACHE_ASSETS = `${CACHE_VERSION}-assets`;

// Taille max du cache tuiles (~200 MB de tuiles = ~2000 tuiles)
const MAX_TILES = 2000;

// App shell — fichiers essentiels pré-cachés à l'installation
const SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo-vintagroute.png',
];

// ═══════════ INSTALLATION ═══════════

self.addEventListener('install', (event) => {
  console.log('VintageRoute SW: install', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_SHELL).then((cache) => {
      return cache.addAll(SHELL_FILES).catch((err) => {
        console.warn('VintageRoute SW: shell cache partiel', err.message);
      });
    })
  );
  // Activer immédiatement sans attendre la fermeture des onglets
  self.skipWaiting();
});

// ═══════════ ACTIVATION ═══════════

self.addEventListener('activate', (event) => {
  console.log('VintageRoute SW: activate', CACHE_VERSION);
  // Supprimer les anciens caches
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION))
            .map((k) => { console.log('VintageRoute SW: purge', k); return caches.delete(k); })
      );
    })
  );
  // Prendre le contrôle de tous les onglets
  self.clients.claim();
});

// ═══════════ FETCH ═══════════

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignorer les requêtes non-GET
  if (event.request.method !== 'GET') return;

  // Ignorer chrome-extension, etc.
  if (!url.protocol.startsWith('http')) return;

  // Routing : geré par son propre timeout adaptatif (DEC-071). Ne PAS intercepter,
  // sinon le timeout API 10s du SW coupe BRouter avant la fin sur les longs trajets
  // -> fallback IGN qui repasse par l'autoroute (le bug que F3 corrige).
  if (url.hostname.includes('brouter.de') || url.pathname.includes('/navigation/itineraire')) return;

  // Version : toujours lire la prod réelle, jamais le cache.
  if (url.pathname === '/version.json') return;

  // ── Tuiles carte (CacheFirst) ──
  if (isTileRequest(url)) {
    event.respondWith(cacheFirst(event.request, CACHE_TILES, MAX_TILES));
    return;
  }

  // ── APIs externes (NetworkFirst avec fallback cache) ──
  if (isAPIRequest(url)) {
    event.respondWith(networkFirst(event.request, CACHE_API, 10000));
    return;
  }

  // ── Assets statiques JS/CSS/images (StaleWhileRevalidate) ──
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(event.request, CACHE_ASSETS));
    return;
  }

  // ── Navigation (app shell) ──
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }
});

// ═══════════ CLASSIFICATION DES REQUÊTES ═══════════

function isTileRequest(url) {
  const host = url.hostname;
  return (
    host.includes('tile') ||
    host.includes('openfreemap') ||
    host.includes('stadia') ||
    host.includes('basemaps') ||
    // Tuiles PBF/PNG typiques
    /\/\d+\/\d+\/\d+\.(pbf|png|jpg|mvt)/.test(url.pathname)
  );
}

function isAPIRequest(url) {
  const host = url.hostname;
  return (
    host.includes('data.geopf.fr') ||
    host.includes('brouter.de') ||
    host.includes('overpass') ||
    host.includes('wikidata.org') ||
    host.includes('wikipedia.org') ||
    host.includes('open-meteo.com') ||
    host.includes('data.economie.gouv.fr') ||
    host.includes('photon.komoot.io')
  );
}

function isStaticAsset(url) {
  return /\.(js|css|woff2?|ttf|svg|png|jpg|jpeg|gif|webp|ico|json)(\?|$)/.test(url.pathname);
}

// ═══════════ STRATÉGIES DE CACHE ═══════════

/**
 * CacheFirst — Idéal pour les tuiles (ne changent quasi jamais).
 * Avec limite de taille du cache.
 */
async function cacheFirst(request, cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      // Limiter la taille du cache
      if (maxItems) {
        const keys = await cache.keys();
        if (keys.length >= maxItems) {
          // Supprimer les 100 plus anciennes entrées
          const toDelete = keys.slice(0, 100);
          await Promise.all(toDelete.map((k) => cache.delete(k)));
        }
      }
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Hors ligne, pas de cache — retourner une réponse vide pour les tuiles
    return new Response('', { status: 408, statusText: 'Offline' });
  }
}

/**
 * NetworkFirst — Idéal pour les APIs (données fraîches, fallback cache).
 * Timeout configurable : si le réseau est trop lent, on sert le cache.
 */
async function networkFirst(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);

    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Réseau indisponible ou timeout — servir le cache
    const cached = await cache.match(request);
    if (cached) {
      console.log('VintageRoute SW: serving cached', request.url.substring(0, 80));
      return cached;
    }
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * StaleWhileRevalidate — Sert le cache immédiatement ET rafraîchit en arrière-plan.
 * Idéal pour JS/CSS qui peuvent avoir changé mais dont l'ancienne version fonctionne.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || (await fetchPromise) || new Response('', { status: 408 });
}
