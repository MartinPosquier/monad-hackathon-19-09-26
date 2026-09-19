# Monad Sperm Race

Course de spectateurs sur le testnet Monad. Jusqu'à 40 racers avancent seuls dans un parcours
chaotique ; le joueur ne contrôle rien et regarde le sien. La blockchain sert **exclusivement** à la
qualification et à l'ownership, jamais au gameplay :

```
N tx sur le testnet → attestation serveur → claimTicket() → joinRace() → lobby → course → podium publié on-chain
```

Interface en anglais (jury), code et documentation en français.

## Démarrage

```bash
npm install
npm run setup      # crée .env.local, génère deployer / attestor / jeton hôte
npm run dev        # http://localhost:3100 — mode stub par défaut, aucun réseau
```

Lien hôte (bouton « Start now ») : `http://localhost:3100/?host=<HOST_TOKEN>`, imprimé par `npm run setup`.

## Passer sur le testnet

1. Envoyer ~2 MON testnet au **deployer** (adresse imprimée par `npm run setup` / `npm run balance`).
2. `npm run deploy` — compile, déploie (gas = estimation × 1,075), relit owner/attestor/seuil,
   écrit `CONTRACT_ADDRESS` et `CHAIN_MODE=testnet` dans `.env.local`.
3. Redémarrer `npm run dev`.

Le testnet est réinitialisé ? Même commande : `npm run deploy`. Le stub reste disponible
(`CHAIN_MODE=stub`) pour démontrer sans chaîne.

| Commande | Rôle |
|---|---|
| `npm run balance` | Solde, nonce du deployer, prix du gas. Code de sortie 0 si le déploiement est finançable |
| `npm run threshold -- 1000` | Seuil du pitch. `-- 5` pour la démo live. Sans redéploiement |
| `npm run nonce -- 0x…` | Équivalent de `cast nonce` : ce que l'attestation lira |
| `npm run verify:fees` | Prouve que Monad facture le gas **limit** (~0,01 MON) |
| `npm run simulate -- --seed 0xabc --check` | Joue une course sans UI, vérifie le déterminisme |
| `npm run simulate -- --sanity 5` | 5 seeds aléatoires : tout le monde finit, écart < 20 s |
| `npm test` | Contrat (EVM en mémoire, chain 10143), lobby, moteur |
| `npm run e2e` | Boucle complète sur le testnet sans navigateur (le deployer joue le joueur), serveur lancé |
| `npm run demo` | Build de production + serveur sur :3100 (plus rapide que `dev` le jour J) |
| `npm run tunnel` | Tunnel cloudflared (HTTP/2 forcé : QUIC est souvent bloqué) → URL https publique |

Déroulé de la démo, pitch et plans B : [DEMO.md](DEMO.md).

## Architecture

Un seul projet Next.js. Pas de backend séparé, pas de WebSocket, pas de base : l'état du lobby vit
en mémoire (singleton porté par `globalThis`), les clients interrogent en polling 1 s et se calent
sur l'horloge du serveur.

```
contracts/SpermRace.sol       qualification + ownership, ~120 lignes, aucune fonction payable
scripts/                      compile (solc npm), deploy (viem), setup, balance, threshold, nonce, verify-fees, simulate
src/shared/                   types front/serveur, constantes Monad, EIP-712, codec du replay
src/sim/index.ts              interface RaceEngine, sélection du moteur planck par défaut
src/sim/engine.ts             collisions Planck, classement et replay déterministes
src/sim/track.ts              géométrie commune de Cascade
src/sim/stubEngine.ts         moteur provisoire : progression seedée, sans physique
src/game/                    scène Three.js, caméra et lecture du replay
src/sim/prng.ts               mulberry32 seedé
src/server/rooms.ts           lobby : rooms, bots, compte à rebours, classement, leaderboard
src/server/attest.ts          nonce → attestation EIP-712
src/server/chain.ts           lectures, vérification des joinRace, publication des podiums
src/lib/blockchain/           BlockchainService : stub ↔ viem (MetaMask), bascule par CHAIN_MODE
src/app/api/                  config · player · proof · lobby · join · race · host · leaderboard
src/components/               UI : parcours joueur, chrono de finalité, grille, course 3D, résultats
```

### Pourquoi une attestation

Un contrat ne peut pas lire le nombre de tx d'une adresse (aucun opcode `NONCE(addr)`).
`eth_getTransactionCount` le donne en un appel. Le serveur le lit, signe
`Attestation(player, txCount, deadline)` en EIP-712, et `claimTicket()` vérifie la signature.
Aucun indexeur. Anti-rejeu : `txCount` doit dépasser strictement la dernière attestation consommée —
réclamer un ticket consomme une tx, donc chaque signature ne sert qu'une fois et le joueur peut rejouer.

### Règles Monad appliquées

| Règle | Dans le code |
|---|---|
| Le gas facturé est le **limit** | `withGasMargin()` = estimation × 1,075 ; transfert simple à 21 000 pile |
| Reserve balance (10 MON) | Aucune fonction `payable` (vérifié par un test) |
| Pages de stockage MIP-8 | Un seul struct `Player` par adresse (`joinRace` < 40 000 gas) |
| Pas d'état ancien au-delà de ~40 000 blocs | Le front ne lit que l'état courant et les events |
| Testnet réinitialisable | Seuil modifiable on-chain, redéploiement en une commande, mode stub |
| Pas de mempool global | Les tx serveur sont sérialisées, reçu compris, avant la suivante |

### Anti-triche

La course est jouée **entièrement côté serveur au lancement**, à partir d'un seed tiré au hasard ;
le classement existe avant la première image, le client ne fait que rejouer des trajectoires.
Le seed et le podium sont publiés par `submitResult()`, qui refuse toute réécriture d'une course.

## Circuit 3D Cascade

Le circuit est implémenté : lance → tourbillon → Galton → échelle → hélices → entonnoir → arrivée.
Le toboggan coloré surplombe un lit défait. Une lance de pompier émet quatre salves de dix
à 0, 1, 2 et 3 secondes ; la glisse suit la gravité et les collisions jusqu'à un ovule rond.
Le classement reste celui de l'ordre d'arrivée, sans compensation du départ décalé.
Ouvrir **http://localhost:3100/track** pour la démonstration sans wallet, avec pause et curseur de replay.
Un lien « Explore the 3D track » est également présent dans le lobby.

`RACE_ENGINE=planck` active le moteur physique (par défaut si la variable est absente).
`CHAIN_MODE=stub` continue de permettre le jeu sans blockchain ; les deux réglages sont indépendants.
La caméra suit le participant inscrit à la troisième personne. Premier à 40 s, dernier au plus tard à 52 s.

Détails de la physique, réglage du rythme, fichiers et contrôles : [docs/CIRCUIT_3D.md](docs/CIRCUIT_3D.md).
