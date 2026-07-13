# Le Bar Clandestin — Design System MASTER

> Document de référence **basé sur l'existant** (v0.9.x). Il décrit les règles telles qu'elles sont
> réellement appliquées dans `whisky-bar-caviste.jsx` — pas une cible idéale. Toute nouvelle UI doit
> piocher ici plutôt qu'inventer. Stack : React 19 + Tailwind 3 (classes utilitaires) + variables CSS
> dans le `<style>` global du composant racine (`GlobalStyles` implicite via le rendu principal).

## 1. Identité

**Speakeasy premium** : fond photo sombre de bar (bois, bouteilles) sous un voile chaud, or fin sur
brun profond, serif classique pour les noms, petites capitales espacées pour les métadonnées.
- **Ne jamais** : passer en thème clair, introduire une teinte froide dominante, utiliser des emoji
  (remplacés par Lucide en v0.4.0), ajouter une police via CDN.
- Le logo : emblème carré texturé (bouteille dans une maison, or). Header = emblème + wordmark H1
  serif ; favicon/PWA = emblème seul (`logo-icon.png`, `pwa-192/512.png`).

## 2. Couleurs (tokens CSS — source de vérité `:root` du style global)

| Token | Valeur | Usage |
|---|---|---|
| `--whisky-bg` | `#0a0705` | Fond de secours du body, overlays plein écran |
| `--whisky-surface` | `rgba(52,39,27,.92)` | Cartes (WhiskyCard, cartes kiosque) |
| `--whisky-panel` | `rgba(60,44,31,.90)` | Panneaux plus saillants (reco, lignes inventaire/soirée) |
| `--whisky-body` | `#ded0b2` | Texte courant |
| `--whisky-cream` | `#e8dcc4` | Titres clairs (dégustation, kiosque) |
| `--whisky-gold` | `#d4af37` | Or de marque : H1, onglet actif (littéral `#d4af37` dans les onglets — voir §9 piège transition) |
| `--whisky-highlight` | `#f4e4c8` | Nom du whisky sur la carte reco |
| `--whisky-note` | `#c0a070` | Citation de l'écran dégustation |
| `--whisky-muted-gold` | `#c8b79a` | Textes secondaires dorés |
| `--whisky-focus` | `#f59e0b` | Anneau de focus clavier (= amber-500) |

**Palette Tailwind autorisée** : `stone` (fonds/bordures/textes neutres), `amber` (accents, CTA,
états actifs), `red` (destructif, rupture), `green` (servi/succès). Pas d'autre teinte.
- Bordures : `stone-600` (défaut interactif), `stone-700` (séparateurs), `amber-500/600` (actif).
- Fond photo : `body` → `linear-gradient(rgba(26,15,7,.35), rgba(12,7,4,.72)) + url('fond.jpg')`,
  `background-attachment: fixed`. C'est LE réglage de luminosité globale de l'app.

## 3. Typographie

- **Serif d'affichage** : Georgia, "Times New Roman" — via `.font-serif` et h1–h4. Noms de
  bouteilles, titres, prénoms invités, chiffres de compteur.
- **Sans-texte courant** : Inter, system-ui (défaut body). Métadonnées, labels, boutons.
- Échelle réellement utilisée : `text-[10px]` (décoratif uniquement : footer), `text-[11px]`
  (labels utiles : catégories, métas de liste), `text-xs` (chips, boutons), `text-sm` (métas de
  carte, sous-titres), `text-lg/2xl` serif (noms), `text-5xl→7xl` serif (H1/héros).
- **Règle capitales** : `uppercase tracking-wider/widest/[0.2-0.3em]` réservé aux titres de section
  courts et libellés ≤ 3 mots. Jamais pour du texte long. Minimum 11px pour un libellé utile.

## 4. Espacement, rayons, ombres

- Grille d'espacement Tailwind ; padding de carte `p-4`/`p-5` (listes) et `p-6→p-12` (héros).
- Rayons : `rounded` (cartes, boutons rectangulaires), `rounded-full` (pills, steppers, badges),
  `rounded-2xl/3xl` (chips prénom, conteneur nav mobile), `rounded-[22%]` (logo/tuiles image).
- Ombres : douces et sombres — `shadow-2xl` ponctuel, lueur or `shadow-[0_0_20px_rgba(212,175,55,0.25)]`
  pour l'élément actif « en avant ». Vignettes bouteilles : `drop-shadow-[0_6px_14px_rgba(0,0,0,0.6)]`.
- Séparateur décoratif : filet dégradé `h-px bg-gradient-to-r from-transparent via-[#d4af37]/70
  to-transparent` (JAMAIS de trait plein `amber-800` — retiré en v0.7.4 car disharmonieux).

## 5. Composants canoniques (à réutiliser tels quels)

| Composant | Où | Règles |
|---|---|---|
| **Onglet nav** | Nav principale | Pill `rounded-full min-h-[44px]` ; actif `bg-[#d4af37] text-black` + lueur ; inactif `text-stone-200 hover:bg-white/5` ; badge compteur ambre en surimpression ; `aria-pressed` |
| **FilterButton (tuile ambiance)** | Sommelier | Tuile verticale icône+label, `flex-wrap` centré à largeur fixe (`w-[calc(50%-.375rem)] sm:w-[152px]`) pour rangées équilibrées |
| **Chip filtre** | Sommelier (profils), kiosque | `rounded-full`, gabarit UNIFORME par groupe (`w-40` desktop / `calc(50%-.25rem)` mobile kiosque) ; actif `bg-amber-500 border-amber-500 text-black` ; inactif `border-stone-500 text-stone-200` |
| **Chip attribut (carte)** | Cartes kiosque | Petit `text-xs rounded-full bg-stone-800/80 border-stone-600` ; **matché = `bg-amber-500/20 border-amber-500 text-amber-100 font-bold`** (montre pourquoi la carte remonte) |
| **CTA primaire** | Partout | `bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase tracking-widest rounded min-h-[48px]` (un seul par écran : Surprenez-moi, Ajouter, Commande reçue…) |
| **Bouton secondaire** | Partout | Contour `border-stone-500/600 text-stone-200 hover:border-amber-500` ; destructif = palette `red-300/800/950` + confirmation `window.confirm` |
| **Stepper quantité** | Inventaire, commande | Pill `border-stone-600` avec `[−] n [+]`, boutons 44px, valeur serif ambre (rouge si 0) |
| **Carte bouteille kiosque** | Mode invité | Rangée haute : nom serif 2xl + méta à gauche, **image bouteille h-20 en haut à droite** (`object-contain`, lazy, 512×768, `alt=""`) OU pastille de robe si pas d'image ; rangée basse : chips pleine largeur ; sélection = tap carte entière |
| **SearchInput** | Inventaire, kiosque | `min-h-[48px]`, label `sr-only` + placeholder **dérivé du label** (`${label}...`) ; prop `fullWidth` |
| **Toast** | Global | Coin bas-droit, `role=status/alert`, auto-fermeture 4 s + bouton fermer 44px |
| **Modal / overlay plein écran** | Formulaire, kiosque, dégustation | `role="dialog" aria-modal`, piège de focus Tab, Échap ferme, fond app en `inert`, restaure le focus |
| **Menu Gestion** | Inventaire | `<details>/<summary>` natif (pas de JS), actions secondaires + destructif séparé par un filet |

## 6. Iconographie & imagerie

- **Icônes : Lucide uniquement**, `strokeWidth 1.5`, tailles 12–26px selon contexte ; couleur
  `text-stone-300` (neutre) / `text-amber-400` (actif/accent). Jamais d'emoji.
- Approximations actées : Sherry→`Wine`, Miel→`Hexagon`, Doux→`Candy`, Épicé→`Zap`.
- **Images bouteilles** : WebP 512×768 (~20-30 Ko), illustrations non officielles sans marque
  lisible, fond sombre intégré, dans `public/bottles/<slug>.webp`, mappées par `BOTTLE_IMAGE_BY_ID`.
  Affichées UNIQUEMENT dans le kiosque invité (+ écran de confirmation). `loading="lazy"`,
  `width/height` aux vraies dimensions.

## 7. Interactions & états

- **Focus clavier** : règle globale `button/input/select:focus-visible → outline 2px var(--whisky-focus), offset 3px`. Ne jamais la neutraliser.
- **Cibles tactiles ≥ 44px** partout (`min-h-[44px] min-w-[44px]` ; CTA 48–56px ; chips kiosque 52px).
- **États systèmes** : vide (message serif italique + CTA d'orientation), erreur (toast rouge),
  écriture localStorage échouée (toast via event `ls-write-error`), hors-ligne (PWA : précache
  intégral par service worker Workbox — v0.9.x).
- **Motion** : `fadeIn .8s` (entrées de vue), `slideIn .5s` (toasts), transitions ≤ 300ms couleurs.
  `prefers-reduced-motion` neutralise tout (règle globale).
- **Multi-sélection** : les filtres sont cumulables (OU + tri par pertinence via `scoreWhisky`,
  ambiance ×4 > arôme ×3 + bonus favori ×2 — moteur UNIQUE partagé Sommelier/kiosque).

## 8. Voix & ton (UX writing)

Français, tutoiement chaleureux côté invité (« Dis-moi qui tu es, je te sers », « C'est noté, Marie ! »),
neutre efficace côté barman (« Marquer servi », « Réinitialiser le stock »). Mentions légales :
« L'abus d'alcool est dangereux pour la santé » toujours présente au footer.

## 9. Pièges connus (ne pas réintroduire)

1. `transition-all` sur un toggle de fond → la transition de `background-color` peut se bloquer
   (bug onglets v0.4.2). Utiliser `transition-[color,box-shadow]` sur les éléments à état.
2. `position: fixed` dans un conteneur animé par `transform` (animate-fadeIn) → l'élément fixe est
   piégé. Mettre l'animation sur un wrapper interne (bug croix kiosque v0.3.4).
3. Tailwind : config chargée depuis le cwd → `postcss.config.js` doit pointer la config en absolu
   et `content.relative: true` (sinon CSS purgé en dev lancé d'ailleurs).
4. `slice()` avant filtrage des tags → cache l'attribut qui a fait matcher (bug cartes v0.5.3).
5. Clés localStorage `whisky_*` et `whisky_v2_*` = **contrat**. Ne jamais renommer.
6. PowerShell 5.1 `Set-Content -Encoding utf8` ajoute un BOM → casse `npm run build` en CI.
   Écrire les JSON avec `[IO.File]::WriteAllText` + `UTF8Encoding($false)`.

## 10. Décisions actées (ne pas rouvrir sans raison)

- Icônes Lucide monochromes plutôt qu'emoji (v0.4.0) ; header = emblème + wordmark serif (v0.7.3) ;
  filet séparateur en dégradé or (v0.7.4) ; « Tourbe X/5 » en texte, pas en barres (v0.7.5) ;
  pastille de robe = fallback des cartes sans image uniquement (v0.9.0) ; pas de composant externe
  (21st.dev ou autre) — tout est artisanal Tailwind ; localStorage mono-appareil assumé (Supabase
  seulement si le besoin multi-téléphones devient réel).
