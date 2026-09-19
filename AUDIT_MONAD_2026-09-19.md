# Audit de préparation au déploiement Monad

Date : 19 septembre 2026. Revue initiale, sans correction du code ni transaction blockchain.

## Verdict

Le projet constitue un socle de démonstration testnet, pas encore un jeu prêt pour une ouverture publique. L'intégration wallet/attestation/contrat existe ; le moteur physique et la scène 3D annoncés restent à construire. Plusieurs défauts du parcours d'inscription peuvent consommer un ticket sans permettre de jouer.

L'architecture est hybride : Next.js héberge le site, les API et la simulation ; Monad reçoit les tickets, entrées et podiums. Déployer le contrat ne déploie donc pas le jeu web et son serveur.

## Périmètre et preuves

- Inventaire du dossier hackathon, documentation du jeu, contrat, scripts, serveur, intégration wallet, composants, simulation et tests. Lecture ciblée du PDF documentaire Monad de 82 pages, notamment synthèse et cycle des transactions ; ce PDF est un corpus technique, pas une spécification fonctionnelle du jeu.
- Configuration locale inspectée par liste de champs autorisés, sans afficher les secrets : `CHAIN_MODE=stub`, `RACE_ENGINE=stub`, adresse de contrat absente ; clés deployer/attestor et jeton hôte présents. Cela ne prouve pas l'absence d'un autre déploiement extérieur au dossier.
- `npm test` : **43 tests réussis, 3 fichiers**. Le premier essai était bloqué par les droits Windows d'esbuild ; la relance hors sandbox a réussi.
- `npm run typecheck`, `npm run lint` et `npm run build` : **réussis**. Avertissement de build non bloquant concernant un package-lock situé hors du dépôt.
- Deux reproductions exécutées directement contre la classe `Lobby`, avec horloge simulée : rejet après 16 minutes d'inactivité et réutilisation d'une transaction après recréation du lobby.
- Aucun test navigateur/MetaMask, test de charge ni parcours réel testnet exécuté. L'outil `preview_start` requis par les consignes locales n'est pas disponible dans cette session ; aucun serveur n'a été lancé par une autre méthode.
- Les tests EVM utilisent EthereumJS/Prague avec le chain ID Monad : ils valident la logique Solidity, pas les coûts de gas ni toutes les particularités d'exécution Monad.

## Défauts prioritaires

### 1. Ticket neuf rejeté après une période sans joueurs — P1, reproduit

Source : `src/server/rooms.ts:142`.

Le serveur évalue l'âge du ticket à partir du `raceId`, qui est la date de création du lobby, au lieu de la date du reçu blockchain. Une room vide reste ouverte indéfiniment. Après plus de 15 minutes, un joueur peut signer `joinRace` pour cette room, brûler son ticket, puis être refusé avec « transaction is too old ». Réclamer un nouveau ticket ne résout pas le problème tant que la room reste la même.

Reproduction : créer un lobby à T, avancer l'horloge de 16 minutes, soumettre une entrée portant son `openRaceId` courant. Le rejet est confirmé.

Correction : séparer identité de course et fraîcheur du reçu ; autoriser la room courante indépendamment de son ancienneté et valider l'admission de façon durable.

### 2. Inscription non récupérable après incident HTTP ou course pleine — P1, lecture du code

Sources : `src/lib/blockchain/viem.ts:242`, `src/server/rooms.ts:138`, `src/server/rooms.ts:149`.

Le ticket est consommé avant l'appel HTTP d'admission. Le client ne réessaie que les erreurs 404, ne conserve pas durablement le hash à reprendre et ne propose pas de récupération après rechargement. Si la room est pleine, une erreur 409 est renvoyée après consommation du ticket. Si l'admission réussit mais que la réponse est perdue, répéter la requête donne aussi 409 au lieu de rendre l'inscription existante.

Correction : admission idempotente par transaction, conservation du hash côté client, reprise après déconnexion et politique explicite de report sur la prochaine course. Tester les réponses perdues et les inscriptions concurrentes.

### 3. État perdu au redémarrage et anti-rejeu incomplet — P1, reproduit

Sources : `src/server/rooms.ts:76`, `src/server/game.ts`.

Rooms, replays, statistiques et transactions utilisées vivent uniquement en mémoire. Recréer le lobby une seconde après une admission accepte la même transaction, son raceId étant encore dans la fenêtre de 15 minutes. La protection annoncée contre le rejeu après redémarrage est donc insuffisante.

Plusieurs processus posséderaient chacun leur lobby, leur timer et leur file de transactions. Une architecture serverless/multi-instance ne peut pas compter sur ce singleton pour partager l'état.

Correction : stockage durable avec unicité des transactions consommées, reprise des courses et des publications. Pour une première démo, imposer un seul processus persistant ; pour la production, coordonner explicitement les workers.

### 4. Publication blockchain abandonnée au premier échec — P1 pour une promesse de résultats publiés

Sources : `src/server/rooms.ts:278`, `src/server/chain.ts`.

La course passe à `finished`, puis `onFinished` n'est appelé qu'une fois. Une panne RPC, un manque de gas ou un timeout laisse seulement `submitError`. Aucune file durable ne reprend l'envoi. Un timeout peut aussi cacher une transaction finalement confirmée : il faut conserver le hash et réconcilier avec la chaîne avant de renvoyer.

Correction : états de publication persistants, reprises bornées, suivi du hash dès diffusion, relecture de `raceSeeds` et de l'événement avant toute nouvelle soumission.

## Fonctionnalités et garanties encore absentes

### Moteur et rendu

`src/sim/index.ts` ne référence que `stubEngine`. Celui-ci tire des temps d'arrivée et fabrique des trajectoires sans physique. `RaceView.tsx` affiche un canvas 2D explicitement provisoire. Planck et Three.js sont installés mais le moteur, le parcours à obstacles et la scène 3D décrits dans la documentation ne sont pas implémentés. Ce manque ne bloque pas un contrat testnet de démonstration ; il bloque la livraison du jeu annoncé.

### Résultat enregistré, équité non prouvée

`contracts/SpermRace.sol:119` autorise l'owner à publier un seed et trois adresses arbitraires. Le contrat empêche leur réécriture mais ne vérifie ni la simulation, ni la participation du podium, ni un engagement préalable du seed. Le serveur choisit l'aléa et connaît tout le classement avant publication. Le calcul côté serveur empêche un navigateur de modifier le résultat officiel, mais ne protège pas contre un opérateur malhonnête.

Si une équité vérifiable est requise : définir un protocole d'aléa, engager la liste ordonnée des participants, les paramètres et la version du moteur, conserver les éléments permettant la reproduction. Un simple engagement de seed ne garantit pas à lui seul l'impartialité de son choix.

Le seed et le replay complet sont accessibles dès `starting` (`rooms.ts:106`). Masquer uniquement le champ `ranking` ne cache pas le vainqueur à un utilisateur technique. Acceptable pour une animation de spectateurs si assumé ; incompatible avec des décisions censées être prises sans connaître l'arrivée.

### Testnet uniquement

`src/shared/chain.ts`, `src/server/config.ts` et `ChainMode` ne gèrent que simulation/testnet. `CHAIN_MODE=mainnet` retomberait silencieusement sur la simulation ; changer seulement le RPC ne suffit pas. Il faut une configuration de réseau explicite, validée au démarrage, avant de viser le mainnet.

### Portée de l'ownership

Le contrat conserve des compteurs de tickets et de courses. Il ne crée ni NFT de personnage ni actif transférable. C'est cohérent pour des droits de participation ; si « posséder son racer » fait partie du produit, cette fonctionnalité n'existe pas encore.

## Durcissements avant ouverture publique — P2

- **Charge RPC :** le statut joueur est interrogé toutes les 2 secondes ; chaque lecture appelle le nonce et `players`, plus le seuil lorsqu'il expire. À 50 clients connectés, l'ordre de grandeur est déjà 50 appels RPC/s hors transactions. Prévoir cache par adresse, mutualisation, temporisation et tests de charge.
- **API :** pas de limitation applicative des requêtes sur les preuves et vérifications de reçus. `/api/join` accepte une transaction publique sans signature de la requête HTTP : un tiers peut devancer l'admission d'un joueur sous un pseudo choisi. Il ne peut pas pour autant fabriquer l'événement blockchain ni obtenir une entrée sous sa propre adresse.
- **RPC privé :** `/api/config` retourne intégralement `cfg.rpcUrl`. Une future URL contenant une clé fournisseur serait donc exposée aux visiteurs. Séparer les endpoints serveur et navigateur.
- **Erreurs :** `src/server/http.ts` renvoie le message brut des exceptions internes aux clients. Masquer les détails d'infrastructure, conserver un identifiant de diagnostic.
- **Finalité :** le « Finality clock » mesure l'attente du reçu après retour du hash. Cela ne mesure pas explicitement le passage du bloc à `Finalized`. Renommer la métrique ou vérifier réellement cet état. Le backend accepte aussi le reçu sans contrôle explicite de finalisation.
- **Wallets :** 21 000 gas pour un transfert à soi-même suppose un compte sans code exécuté ; traiter ou exclure explicitement les comptes délégués EIP-7702. Le nonce compte les transactions sortantes du compte, pas toutes ses interactions, réceptions de tokens ou opérations de smart wallet.
- **Affichage de l'arrivée :** le classement live utilise les arrivées quantifiées à 10 Hz, alors que le podium utilise les millisecondes exactes. Deux arrivées dans la même tranche de 100 ms peuvent être affichées dans un ordre différent du podium.
- **Mémoire :** les anciens replays sont purgés, mais `usedTxs`, `stats` et `rankSums` croissent sans borne pendant la vie du processus.
- **Mode sûr :** refuser les valeurs inconnues de `CHAIN_MODE` au lieu de basculer en stub ; vérifier au démarrage contrat, réseau, attestor et droits de publication.
- **Contrat/seuil :** le script accepte un seuil nul, mais `claimTicket` refuse un nonce nul à cause du contrôle anti-rejeu initial. Définir explicitement le comportement attendu pour cette configuration.

## Ordre de réalisation proposé

1. Corriger l'expiration, rendre l'admission récupérable/idempotente et couvrir les cas limites par des tests.
2. Persister les courses, transactions utilisées et publications à reprendre ; choisir l'hébergement adapté au serveur de jeu.
3. Construire le moteur physique et le rendu attendus, ou acter un périmètre de démo 2D.
4. Déployer et vérifier le contrat sur testnet ; tester avec deux navigateurs et MetaMask mobile, puis coupure réseau, redémarrage et course pleine.
5. Formaliser les garanties d'équité et d'ownership ; ajouter le mainnet seulement lorsque ces choix et les essais testnet sont validés.

## Références réseau consultées

- [Réseaux et chain IDs officiels](https://docs.monad.xyz/ai/current-facts) : mainnet 143, testnet 10143.
- [Résumé développeur Monad](https://docs.monad.xyz/developer-essentials/summary) : compatibilité EVM, coûts spécifiques, reçus et états de finalisation, EIP-7702.
- [Gas Pricing](https://docs.monad.xyz/developer-essentials/gas-pricing) : la facturation sur la limite de gas utilisée dans le projet est conforme au principe documenté.

Cette revue identifie des défauts concrets et les travaux de préparation ; elle ne constitue pas un audit de sécurité exhaustif du contrat ni une validation mainnet.
