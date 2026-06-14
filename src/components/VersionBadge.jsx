/**
 * VintageRoute — Badge de version (diagnostic prod)
 * © 2026 Yves — Tous droits réservés
 *
 * Emplacement : frontend/src/components/VersionBadge.jsx
 *
 * Affiche un petit "v0.9.0" en bas à gauche de l'écran.
 * Au clic : déplie le commit et la date de build.
 * Lit /version.json avec cache-bust → montre TOUJOURS la version réellement
 * déployée (pas une version figée dans le bundle).
 *
 * Aucune dépendance (ni Tailwind ni lucide) : se pose tel quel.
 */

import { useEffect, useState } from 'react';

export default function VersionBadge() {
  const [info, setInfo] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`/version.json?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInfo(d || { version: '?', commit: 'inconnu', build: '' }))
      .catch(() => setInfo({ version: '?', commit: 'inconnu', build: '' }));
  }, []);

  if (!info) return null;

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      title="Version de l'application"
      style={{
        position: 'fixed',
        bottom: 8,
        left: 8,
        zIndex: 9999,
        font: '600 12px Georgia, "Playfair Display", serif',
        color: '#5b6b2d',
        background: 'rgba(245, 240, 225, 0.92)',
        border: '1px solid #c9b98a',
        borderRadius: 6,
        padding: open ? '6px 10px' : '3px 8px',
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
        lineHeight: 1.4,
        textAlign: 'left',
      }}
    >
      v{info.version}
      {open && (
        <span
          style={{
            display: 'block',
            fontWeight: 400,
            fontSize: 11,
            color: '#5a5345',
          }}
        >
          commit {info.commit}
          {info.build ? ` · ${new Date(info.build).toLocaleString('fr-FR')}` : ''}
        </span>
      )}
    </button>
  );
}
