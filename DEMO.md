# Runbook de démo

## La veille

1. `npm run balance` : le deployer a au moins 0,3 MON (sinon, envoyer du MON depuis MetaMask).
2. `npm run nonce -- <ton adresse MetaMask>` puis recouper avec l'explorer (vérification n° 3).
3. `npm test` : tout est vert.
4. Faire la **répétition complète deux fois**, en chronométrant (checklist en bas).

## Le jour J — mise en place (5 min)

```bash
npm run balance                 # fonds OK ? contrat présent ?
npm run threshold -- 5          # seuil démo (le pitch annonce 1000)
npm run demo                    # build de prod + serveur :3100 (plus fluide que dev)
npm run tunnel                  # autre terminal → URL https://….trycloudflare.com
```

- Écran de présentation : `http://localhost:3100/?host=<HOST_TOKEN>` (bouton **Start now**).
- Le réseau de la salle bloque souvent QUIC : le script force déjà `--protocol http2`.
- Afficher l'URL du tunnel en QR code sur l'écran pour le jury.

## Jury sur téléphone

MetaMask mobile n'injecte son wallet que dans **son propre navigateur** : ouvrir MetaMask →
onglet navigateur → coller l'URL du tunnel. Sur ordinateur : l'extension suffit.
Adresse neuve ? Faucet : https://faucet.monad.xyz, puis 5 × **Send a qualifying transaction**.

## Déroulé (≈ 3 min)

1. **Le problème** (20 s) — « Le contrat ne peut pas lire le nombre de tx d'une adresse. Pas d'opcode.
   Nous le lisons côté serveur en un appel, nous le signons en EIP-712, le contrat vérifie. Aucun indexeur. »
2. **Qualification** (40 s) — connecter MetaMask, envoyer les tx de qualification : le **chrono de
   finalité** affiche les millisecondes réelles, tx après tx.
3. **Ticket + entrée** (40 s) — `claimTicket` puis `joinRace`, deux signatures, confirmées en moins
   d'une seconde chacune. Le pion apparaît dans la grille ; les téléphones du jury aussi.
4. **Course** (60 s) — Start now. « Le classement existait avant la première image : la course est
   jouée d'un coup côté serveur à partir d'un seed, le client ne fait que rejouer. »
5. **Preuve** (20 s) — écran de résultats : seed, podium publié on-chain (lien explorer),
   `npm run simulate -- --seed …` redonne le même classement.

Points Monad à citer : gas facturé au **limit** (d'où estimation × 1,075, vérifié par
`npm run verify:fees`) · aucune fonction payable (reserve balance) · un seul slot `Player`
par adresse (pages MIP-8) · finalité ~600 ms visible à l'écran.

## Plans B

| Incident | Parade |
|---|---|
| Testnet réinitialisé (contrat effacé, nonces à 0) | `npm run deploy` puis relancer le serveur |
| RPC Monad en panne / wallet capricieux | `CHAIN_MODE=stub` dans `.env.local`, relancer : la boucle entière tourne sans chaîne |
| Tunnel en échec | Démo en local seulement ; le jury regarde l'écran |
| Personne ne rejoint | Start now : 50 bots, la course part quand même |
| Le podium ne se publie pas | Solde du deployer (`npm run balance`) ; la course et le classement ne sont pas bloqués |

## Checklist de répétition (×2)

- [ ] Adresse fraîche → faucet → 5 tx → qualifiée
- [ ] claimTicket et joinRace confirmés, temps affichés
- [ ] Deux navigateurs dans la même course, même départ
- [ ] Un téléphone via le tunnel (navigateur MetaMask)
- [ ] Course jusqu'au bout, résultats, podium on-chain cliquable
- [ ] Bascule stub testée (plan B) en moins d'une minute
