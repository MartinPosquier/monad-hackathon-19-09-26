# Déploiement testnet Monad — relevé du 19/09/2026

## Contrat

| | |
|---|---|
| Adresse | [`0x5f34Ba41075031c1BF5E8f24Bc19efA1f3EA9626`](https://testnet.monadvision.com/address/0x5f34Ba41075031c1BF5E8f24Bc19efA1f3EA9626) |
| Bloc | 63 895 829 |
| Owner (deployer) | `0x9Dc1B2d36b65D8a1E390ef8Ea82FfC93C0bB2e76` |
| Attestor | `0x6D8F26f4D74bC8688eDf0f419fD28CB81d00a011` |
| Seuil | 5 tx (`npm run threshold -- 1000` pour le pitch) |
| Compilateur | solc 0.8.37, evm prague, runtime 2 978 octets |

Un second contrat identique, [`0xFD1955C4020fB31aD87D17a90B59BFb519E42a8b`](https://testnet.monadvision.com/address/0xFD1955C4020fB31aD87D17a90B59BFb519E42a8b)
(bloc 63 895 884), est né d'un double lancement de `npm run deploy` à quelques secondes d'écart.
Il n'a jamais servi : aucun event hors constructeur. `deploy.ts` refuse désormais de redéployer
tant que `CONTRACT_ADDRESS` porte du code.

## Vérification n° 4 — frais réels

Transfert de 0 MON à soi-même (21 000 de gas exécutés), gas limit 105 000, prix 102 gwei :

| Hypothèse | Montant |
|---|---|
| Débit réel | **0,01071 MON** |
| Si Monad facturait le gas exécuté | 0,002142 MON |
| Si Monad facture le gas limit | 0,01071 MON |

Monad facture le **limit** : 5× le nécessaire ici. Confirmé aussi par le déploiement, débité de
834 442 × 102 gwei = 0,085113084 MON pour une estimation de 776 225.
**Particularité** : le champ `gasUsed` du reçu Monad vaut le gas limit, pas le gas exécuté.
[tx](https://testnet.monadvision.com/tx/0x7e77a45f50a44205a99599aaf2a57ecea692911276d157ddeaf14efc392ca04f)

## Boucle complète on-chain (`npm run e2e`)

Joueur = deployer, serveur local en `CHAIN_MODE=testnet`, moteur planck, 40 racers.

| Étape | Diffusion → reçu | Tx |
|---|---|---|
| Qualification 5/5 | 959 ms | [0x76b4…b3d4](https://testnet.monadvision.com/tx/0x76b4d3f37ad815e2fee843ebacedf47785a6577ba1af82eaec8ae5c37771b3d4) |
| `claimTicket` (attestation EIP-712 acceptée) | 447 ms | [0x68af…c7db](https://testnet.monadvision.com/tx/0x68af63f37168716d891640b63727689b1c5729d663e798b2afb1ce42575fc7db) |
| `joinRace` | 450 ms | [0x8213…b51b](https://testnet.monadvision.com/tx/0x82135a1b96fb43b5348f51adfbb7fe7ceb2a9b447e5ea252507b373fc7bab51b) |
| Admission serveur (event `RaceJoined` relu) | — | course 1789819126466 |
| Course | #31 / 40 en 41,389 s | — |
| `RaceFinished` publié par le serveur, relu et conforme au classement | — | [0x0ae7…c0](https://testnet.monadvision.com/tx/0x0ae76381b2761ccb83f4b60ffbb59972df3b8fe0a38e6405628dc791e0a7f4c0) |

Confirmation moyenne : **619 ms** (min 447, max 959).

## Reste à faire par un humain

- Vérification n° 5 avec MetaMask sur une adresse fraîche (faucet → 5 tx → ticket → course).
- Vérification n° 6 : deux navigateurs, puis un téléphone via `npm run tunnel` (navigateur intégré de MetaMask).
- Répétition de démo ×2 (`DEMO.md`).
