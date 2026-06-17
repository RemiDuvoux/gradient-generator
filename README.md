# Blob Gradient Generator

Générateur de fonds en blob gradient avec textures (Pixels, Points, ASCII, Aucun). Rendu Canvas 2D, 100 % local.

## Développement

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Déploiement GitHub Pages

1. Crée un dépôt GitHub (ex. `gradient-generator`) et pousse le code sur la branche `main` :

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<ton-user>/gradient-generator.git
git push -u origin main
```

2. Dans le dépôt GitHub : **Settings → Pages → Build and deployment → Source** : choisis **GitHub Actions**.

3. À chaque push sur `main`, le workflow `.github/workflows/deploy.yml` build et déploie automatiquement.

4. L’app sera disponible à : `https://<ton-user>.github.io/gradient-generator/`
