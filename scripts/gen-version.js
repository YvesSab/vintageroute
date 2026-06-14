/**
 * VintageRoute — Génération de public/version.json au build
 * © 2026 Yves — Tous droits réservés
 *
 * Emplacement : frontend/scripts/gen-version.js
 * Exécuté automatiquement par les scripts npm "prestart" et "prebuild".
 * 100 % Node, fonctionne en PowerShell sous Windows comme sur Netlify.
 *
 * Produit /public/version.json :
 *   { "version": "0.9.0", "commit": "a1b2c3d", "build": "2026-06-14T..." }
 * → consultable en prod sur https://vintageroute.netlify.app/version.json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkg = require(path.join(__dirname, '..', 'package.json'));

// Commit : sur Netlify la variable COMMIT_REF est fournie automatiquement.
// En local, on interroge git. Si rien ne marche, on retombe sur "inconnu".
let commit = process.env.COMMIT_REF || '';
if (!commit) {
  try {
    commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    commit = 'inconnu';
  }
}
commit = commit && commit !== 'inconnu' ? commit.slice(0, 7) : 'inconnu';

const data = {
  version: pkg.version,
  commit,
  build: new Date().toISOString(),
};

const outPath = path.join(__dirname, '..', 'public', 'version.json');
fs.writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n');

console.log(`VintageRoute: version.json généré → v${data.version} (${data.commit})`);
