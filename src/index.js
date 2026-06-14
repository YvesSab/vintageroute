/**
 * VintageRoute — Application de navigation pour voitures anciennes
 * © 2026 Yves — Tous droits réservés
 * Licence : CC BY-NC-SA 4.0
 * https://github.com/YvesSab/vintagroute
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import VersionBadge from './components/VersionBadge';

// Enregistrement du Service Worker pour le mode hors ligne
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
    <VersionBadge />
  </React.StrictMode>
);
