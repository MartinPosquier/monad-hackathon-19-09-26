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

## Le jeu marble (circuit Cascade implémenté)

Lire `docs/CIRCUIT_3D.md`. Moteur Planck dans `src/sim/engine.ts`, géométrie partagée dans
`src/sim/track.ts`, scène Three.js dans `src/game/scene.ts`. Replay à 2 canaux (x, y), 30 Hz.
`RACE_ENGINE=planck` est indépendant de `CHAIN_MODE`. Démonstration sans wallet sur `/track`.
Les tests de physique sont dans `tests/physics.test.ts` ; conserver aussi les tests du stub.

## Règles Monad appliquées (ne pas les défaire)

Gas limit = `withGasMargin(estimateGas)` (Monad facture le limit) · aucune fonction `payable` ·
un seul struct `Player` par adresse · tx serveur sérialisées · le seuil fait foi sur le contrat.
