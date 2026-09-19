# Monad Sperm Race — avancement

Mise à jour du 19 septembre 2026 : circuit Cascade intégré au lobby et disponible sur `/track`.
Le jeu utilise Planck pour les collisions en 2D et Three.js pour le parcours en relief,
les personnages et la caméra. Voir `docs/CIRCUIT_3D.md` pour les limites du modèle.

| # | Jalon | État | Preuve |
|---|---|---|---|
| 0 | Socle | ✅ | Next.js 16 + TS, deps (`viem`, `solc`, `three`, `planck`), types partagés, `BlockchainService` stub. `npm run dev` → :3100 |
| 1 | Sim + replay | ✅ | Moteur Planck seedé, collisions, replay Int16 30 Hz, premier à 40 s, dernier au plus tard à 52 s. Tests sur huit seeds fixes et contrôle du déterminisme |
| 2 | Rendu 3D + caméra | ✅ | Lance, tourbillon, Galton, échelle, hélices, entonnoir, arrivée et podium. Caméra du joueur, suivi du leader, vue globale, démonstration `/track` |
| 3 | Lobby + bots | ✅ | Rooms en mémoire, bots étiquetés BOT, compte à rebours, `startAt` commun, « Start now » hôte. Tests `tests/rooms.test.ts` |
| 4 | Blockchain réelle | 🟡 non déployée dans cette passe | Contrat et scripts présents ; les blocages de `AUDIT_MONAD_2026-09-19.md` restent à traiter avant déploiement |
| 5 | Résultat + leaderboard | ✅ | Podium, « #17 / 40 », temps, classement complet, preuve on-chain, `/leaderboard` |
| 6 | Polish + démo | 🟡 | Course sobre, rendu instancié, adaptation mobile, pause et curseur sur `/track`. Vérification visuelle desktop/mobile. Performance sur appareil physique et répétition testnet restent à faire |

## Vérifications du plan

| Vérification | État |
|---|---|
| 1. Déterminisme (`simulate --check`) | ✅ Planck ; également vérifié par test automatique |
| 2. Sanity multi-seeds | ✅ Planck : huit seeds fixes et vingt aléatoires, 40 arrivants, durée et collisions contrôlées |
| 3. Lecture du nonce (`npm run nonce -- 0x…`) | ✅ lu sur le testnet (bloc 63 853 980) — recoupement explorer à faire à la main |
| 4. Frais réels (`npm run verify:fees`) | ⏳ après financement du deployer |
| 5. Boucle complète sur adresse fraîche | ⏳ après déploiement (humain + MetaMask) |
| 6. Deux navigateurs + tunnel téléphone | ⏳ humain |
| 7. Répétition de démo ×2 | ⏳ humain |

## Validation locale

`npm test` : 59 tests réussis. `npm run lint` et `npm run build` : réussis.
Version `bed-slide-v3` : glisse par gravité, décor de lit défait, lance de pompier,
quatre salves de dix espacées d'une seconde, arrivée dans un ovule rond.
Le mode local reste `CHAIN_MODE=stub` : aucune transaction ni aucun déploiement effectué.
Il n'y a pas de surveillance automatique des fonds ni de déploiement programmé.
