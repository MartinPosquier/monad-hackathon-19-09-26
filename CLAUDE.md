@AGENTS.md

# Monad Sperm Race — contexte projet

Hackathon Monad (testnet, chain 10143). Course de spectateurs : la chaîne sert à la qualification
et à l'ownership, jamais au gameplay. Lire `README.md` (architecture, commandes) et `PROGRESS.md`
(jalons) avant toute session.

- Langue : UI en **anglais** (jury), code, commentaires et commits en **français**.
- Dépôt git indépendant, ignoré par le dépôt parent SharpsCorners. Jamais de push sans demande.
- `.env.local` porte les clés du deployer et de l'attestor : jamais commité, jamais imprimé.
- Serveur : `preview_start` avec la config `monad-sperm-race` (port 3100 ; le 3000 est pris par Aviation for all).
- Scripts en ESM (`"type": "module"`) : `process.exitCode`, pas `process.exit()` après un appel réseau
  (assertion libuv sous Windows).
- Éditer les fichiers avec Edit/Write, jamais par un aller-retour PowerShell 5.1 (il lit l'UTF-8 en ANSI).

## Le jeu marble (pas encore construit)

Il se branche sans toucher au lobby ni à la chaîne :
- moteur : implémenter `RaceEngine` (`src/sim/index.ts`), l'enregistrer, `RACE_ENGINE=planck` ;
  replay `int16-v1`, `channels: 2` (x, y), 30 Hz ; passer `tests/sim.test.ts` ;
- rendu : remplacer le `<canvas>` 2D de `src/components/RaceView.tsx` par la scène Three.js,
  qui lit `RaceDetail.replay` via `ReplayReader` (`src/shared/replay.ts`).

## Règles Monad appliquées (ne pas les défaire)

Gas limit = `withGasMargin(estimateGas)` (Monad facture le limit) · aucune fonction `payable` ·
un seul struct `Player` par adresse · tx serveur sérialisées · le seuil fait foi sur le contrat.
