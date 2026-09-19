# Monad Sperm Race — avancement

Suivi des jalons du plan d'exécution. Périmètre de cette passe : **tout sauf le jeu marble**
(moteur planck, parcours, scène Three.js, caméra, replay 3D). Le jeu se branche sur
l'interface `RaceEngine` (`src/sim/index.ts`) et sur `RaceDetail.replay`.

| # | Jalon | État | Preuve |
|---|---|---|---|
| 0 | Socle | ✅ | Next.js 16 + TS, deps (`viem`, `solc`, `three`, `planck`), types partagés, `BlockchainService` stub. `npm run dev` → :3100 |
| 1 | Sim + replay | ⏸ hors périmètre | Contrat du moteur posé : `RaceEngine`, PRNG seedé, format replay Int16 30 Hz, moteur **stub** déterministe. `npm run simulate -- --seed 0xabc --check` → OK |
| 2 | Rendu 3D + caméra | ⏸ hors périmètre | Vue 2D provisoire (`RaceView.tsx`) qui lit le même replay |
| 3 | Lobby + bots | ✅ | Rooms en mémoire, bots étiquetés BOT, compte à rebours, `startAt` commun, « Start now » hôte. Tests `tests/rooms.test.ts` |
| 4 | Blockchain réelle | 🟡 code prêt, déploiement en attente de MON | `SpermRace.sol` (21 tests sur EVM en mémoire, chain 10143), compile/deploy viem, attestation EIP-712, `claimTicket` + `joinRace` signés par le joueur |
| 5 | Résultat + leaderboard | ✅ | Podium, « #17 / 50 », temps, classement complet, preuve on-chain, `/leaderboard` |
| 6 | Polish + démo | 🟡 | UI néon Monad, chrono de finalité, tunnel cloudflared testé (HTTP/2 forcé, QUIC bloqué sur ce réseau), `DEMO.md`, `npm run e2e`. Trails / SPECTATE 3D = jeu ; répétitions = humain |

## Vérifications du plan

| Vérification | État |
|---|---|
| 1. Déterminisme (`simulate --check`) | ✅ stub — à refaire avec le moteur planck |
| 2. Sanity 5 seeds (`simulate --sanity 5`) | ✅ stub — idem |
| 3. Lecture du nonce (`npm run nonce -- 0x…`) | ✅ lu sur le testnet (bloc 63 853 980) — recoupement explorer à faire à la main |
| 4. Frais réels (`npm run verify:fees`) | ⏳ après financement du deployer |
| 5. Boucle complète sur adresse fraîche | ⏳ après déploiement (humain + MetaMask) |
| 6. Deux navigateurs + tunnel téléphone | ⏳ humain |
| 7. Répétition de démo ×2 | ⏳ humain |

## En attente d'un humain

- **Envoyer ~2 MON testnet** au deployer `0x9Dc1B2d36b65D8a1E390ef8Ea82FfC93C0bB2e76`
  (depuis MetaMask). La boucle autonome détecte les fonds et lance `npm run deploy`.
