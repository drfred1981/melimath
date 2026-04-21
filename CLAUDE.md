# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

**MeliMath** est une application web éducative (Flask) destinée aux enfants de primaire (CE1/CE2) pour s'entraîner au calcul mental, aux fractions, à la géométrie et au français. Toute l'UI est en français et l'interface est optimisée pour un usage enfant (keypad tactile, feedback visuel, gamification).

## Commandes

| Action | Commande |
|---|---|
| Lancer en dev (debug + reload) | `python app.py` (écoute sur `0.0.0.0:8080`) |
| Lancer en prod (comme dans l'image) | `gunicorn -b 0.0.0.0:8080 app:app` |
| Installer les deps | `pip install -r requirements.txt` |
| Build image Docker | `docker build -t melimath .` |
| Déployer | créer un tag git `vX.Y.Z` → GitHub Actions pousse automatiquement sur `ghcr.io/<repo>` (workflow `.github/workflows/build.yml`) |

Pas de tests, pas de linter configuré, pas d'étape de build frontend. **Bootstrap 5.3.3 est chargé via CDN**, le CSS/JS custom sont servis statiquement par Flask.

## Architecture

### Vue d'ensemble (3 briques)

1. **`app.py`** — serveur Flask minimaliste (~70 lignes). 4 routes : `/` (rend `index.html`), `GET/POST /api/profile` (lire/sauvegarder le profil JSON), `GET /api/health`.
2. **`templates/index.html`** — **template monolithique (~2840 lignes)** qui contient **la totalité de l'UI et de la logique de jeu** sous forme de JS inline (à partir de la ligne ~824). **Tous les modes d'exercice, le timer, le keypad, la validation, le feedback sont ici.** C'est le fichier principal à éditer pour toute modification fonctionnelle des exercices.
3. **`static/js/rewards.js` + `static/css/rewards.css`** — module **auto-contenu** exposé via `window.Rewards`. Gère XP / niveaux / 14 badges / 6 thèmes / HUD / toasts / confettis / modal. **C'est la seule dépendance externe du template** : `index.html` appelle `window.Rewards.onAnswer(mode, correct)` et `window.Rewards.resetSession(mode)` dans chaque mode.

### Les 13 modes d'exercice

Déclarés par les onglets Bootstrap `data-mode="..."` vers les lignes 482-530 de `index.html` :

```
addition, soustraction, multiplication, calcul_ligne,
addition_colonne, soustraction_colonne, conversions,
fractions, problemes, diagrammes, geometrie, francais, pluriels
```

Chaque mode a sa propre fonction `generateXxx()` + `validateXxx()` + `showXxxFeedback()` dans le JS inline. Le dispatcher central est `showMode()` (~ligne 987) qui affiche/masque les zones DOM selon `mode`. `startTimer()` / `stopTimer()` gèrent un timer commun à tous les modes.

**Pour ajouter un mode** : ajouter un onglet `<button data-mode="...">`, les conditions `mode === '...'` dans `showMode()` et `startTimer()`, puis les trois fonctions `generate/validate/showFeedback`. Ne pas oublier d'appeler `window.Rewards.onAnswer(mode, correct)` dans le feedback et `window.Rewards.resetSession(mode)` au changement d'onglet.

### Système de récompense (`rewards.js`)

Un seul IIFE qui expose `window.Rewards` avec :

- **État** stocké dans `localStorage` sous la clé `melimath.rewards.v1` — forme : `{ xp, level, streak, bestStreak, totalCorrect, totalAnswered, badges[], byMode{}, dailyStreak, lastPlayDate, sessionCorrect, sessionTotal, sessionMode, theme, history[], updatedAt }`. `history` est plafonné à 500 entrées (`HISTORY_MAX`).
- **XP** : +10 par bonne réponse + bonus de streak (`(streak-2) * 2` à partir de streak≥3). Progression de niveau quadratique : `xpForLevel(n) = round(50 * n * (n+1) / 2)`.
- **14 badges** déclarés par id dans `BADGE_IDS` (premiers pas, séries, totaux, explorateur, daily streak, perfectionniste, niveaux). Chaque **thème** fournit son propre icône/label/desc via `THEMES[theme].badges[id]`.
- **6 thèmes** dans la const `THEMES` : `default, princesses, sirenes, espace, dinosaures, animaux`. Chaque thème a `label`, `hudIcon`, `accent`, `accent2` (variables CSS `--rw-accent`, `--rw-accent2` appliquées au `:root`).
- **Sync serveur** : après chaque `save()` local, un timer de debounce (`SERVER_SAVE_DEBOUNCE_MS = 1500`) envoie l'état à `POST /api/profile`. `serverLoad()` est appelé après chaque réponse pour récupérer l'état le plus récent (last-write-wins via `updatedAt`).

**Points de vigilance** :
- Ne pas changer la clé `STORAGE_KEY = "melimath.rewards.v1"` sans plan de migration — les enfants perdraient leur progression.
- `BADGE_IDS` est la source de vérité de l'ordre d'affichage. Les thèmes doivent fournir tous les ids, sinon `currentBadges()` retombe silencieusement sur le thème `default`.
- `explorer_all` se déclenche à `modesUsed >= 13` ; si on ajoute un mode, mettre à jour ce seuil.

### Persistance serveur (`app.py`)

- Chemin du fichier : `MELIMATH_DATA_DIR / profile.json` (défaut `/home/melimath/profile.json`).
- Écriture atomique : `tmp.write_text(...)` puis `tmp.replace(PROFILE_FILE)` sous `threading.Lock`.
- En production K8s ce répertoire est monté sur un **PVC NFS** pour que la progression survive aux redémarrages du pod. **Ne jamais écrire ailleurs** — c'est le seul endroit persistant.
- L'endpoint `/api/profile` n'a **aucune auth ni isolation par utilisateur** : le fichier est global au pod. C'est un choix assumé (usage familial mono-utilisateur), à ne pas changer sans consigne explicite.

## Conventions du projet

- **Langue** : tout est en français (UI, commentaires, messages de commit). Les commits suivent un style `type: description` proche de conventional commits (`feat:`, `fix:`, `feat(scope):`...).
- **Pas de framework frontend** : vanilla JS + Bootstrap 5.3 CDN. Garder cette contrainte, ne pas introduire React/Vue/etc.
- **JS inline dans `index.html`** : ne pas extraire dans des fichiers séparés sauf demande explicite. Le seul module externe est `rewards.js`, volontairement isolé parce qu'il est transverse.
- **Accents dans les strings JS** : `rewards.js` utilise volontairement des strings **sans accent** (`"Bravo"`, `"Reussir"`, `"Debloque"`). `index.html` par contre les contient. Respecter le style du fichier qu'on édite.
- **Pas de tests** : valider visuellement dans un navigateur (Flask en debug recharge automatiquement).

## Déploiement

Le repo est déployé dans le homelab K8s via le repo `apps-in-k8s` (GitOps FluxCD). Le tag git déclenche le build/push ghcr.io, puis bumper la version d'image dans `apps-in-k8s` fait que FluxCD déploie. Le PVC NFS monté sur `/home/melimath` préserve `profile.json` entre les versions.
