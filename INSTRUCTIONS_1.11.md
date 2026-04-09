# Tâche 1.11 — Déploiement GitHub Pages

## Fichiers livrés

| Fichier | Destination | Action |
|---------|-------------|--------|
| `package.json` | `frontend/package.json` | **Remplacer** |
| `public/404.html` | `frontend/public/404.html` | **Ajouter** (nouveau) |
| `.github/workflows/deploy.yml` | `.github/workflows/deploy.yml` (à la racine du repo Git) | **Ajouter** (nouveau) |

## Modifications dans package.json

- Ajout `"homepage": "https://vintagroute.github.io"`
- Ajout `"predeploy"` et `"deploy"` dans scripts
- Ajout `"gh-pages": "^6.3.0"` dans devDependencies

## Étapes pour déployer

### 1. Créer le dépôt GitHub

1. Va sur https://github.com/new
2. Nom du repo : `vintagroute` (sous le compte/org `vintagroute`)
3. Public (preuve d'antériorité visible)
4. Ne coche PAS "Initialize with README" (tu as déjà les fichiers)

### 2. Pousser le code

```bash
cd C:\Dev_VintagRoute\10_Programme
git init
git add .
git commit -m "v0.1.0 — MVP Creuse Phase 1 complète"
git branch -M main
git remote add origin https://github.com/vintagroute/vintagroute.git
git push -u origin main
```

### 3. Activer GitHub Pages

1. Sur GitHub → Settings → Pages
2. Source : **GitHub Actions** (pas "Deploy from a branch")
3. Le workflow `deploy.yml` se déclenche automatiquement à chaque push sur `main`

### 4. Vérifier

L'app sera accessible à : **https://vintagroute.github.io**

Le premier déploiement prend 2-3 minutes. Vérifie dans l'onglet Actions du repo.

### Alternative rapide (sans GitHub Actions)

Si tu préfères déployer manuellement :

```bash
cd C:\Dev_VintagRoute\10_Programme\frontend
npm install
npm run deploy
```

Cela build + pousse sur la branche `gh-pages` automatiquement.
Dans ce cas, dans Settings → Pages, choisis Source : **Deploy from a branch** → branche `gh-pages` → dossier `/ (root)`.

## Important

- Après `npm install`, vérifie que `npm run build` passe toujours ✅
- Ne publie PAS les source maps (React build ne les inclut pas par défaut dans le dossier déployé, c'est bon)
- Le fichier `404.html` assure que la PWA fonctionne même si l'utilisateur recharge la page
