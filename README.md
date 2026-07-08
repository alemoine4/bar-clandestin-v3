# 🥃 Le Bar Clandestin — V3 (avec images de bouteilles)

Cave à whiskies personnelle : sommelier par ambiances et profils aromatiques, inventaire avec stock quantitatif, bon de commande avec pointage à réception, mode Soirée (kiosque invité). Toutes les données restent dans le navigateur (localStorage) — aucun serveur, aucun compte.

**Nouveauté V3 :** des illustrations de bouteilles (non officielles, sans marque lisible) dans les cartes du mode invité, pour aider les convives à reconnaître visuellement les whiskies. Fichiers WebP optimisés dans `public/bottles/`, mappés par `BOTTLE_IMAGE_BY_ID` ; fallback propre quand une bouteille n'a pas d'image.

**App en ligne : https://alemoine4.github.io/bar-clandestin-v3/**

## Modifier l'app

Toute modification poussée sur `main` est **automatiquement déployée** sur GitHub Pages (workflow `.github/workflows/deploy.yml`, ~1 à 2 minutes).

```bash
# travailler en local
npm install
npm run dev        # http://127.0.0.1:5173

# publier
git add -A
git commit -m "Ma modification"
git push
```

## Structure

| Fichier | Rôle |
|---|---|
| `whisky-bar-caviste.jsx` | Toute l'app (composants, données par défaut, styles) |
| `public/fond.jpg` | Photo d'arrière-plan |
| `public/logo.jpg` / `logo-icon.png` | Logo d'en-tête / favicon |
| `PLAN_V2.md` | Plan et périmètre de la V2 |

Réglages rapides dans `whisky-bar-caviste.jsx` : catalogue par défaut (`DEFAULT_WHISKIES`), profils/ambiances (`TASTE_PROFILES`, `MOODS`), pondérations du sommelier (`WEIGHT_PROFILE`, `WEIGHT_MOOD`), couleurs (`:root` en bas du fichier — l'assombrissement du fond se règle dans le `linear-gradient` du `body`).

---
🍷 L'abus d'alcool est dangereux pour la santé. À consommer avec modération.
