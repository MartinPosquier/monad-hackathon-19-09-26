# Circuit Cascade — course 3D

## Jouer et inspecter

Ouvrir `/track` pour une course de démonstration de 40 participants, sans wallet ni transaction. Le bouton **Release the racers** lance le compte à rebours. Pause, reprise, remise à zéro et curseur temporel permettent d'inspecter chaque obstacle. La démonstration utilise une graine fixe : relancer rejoue volontairement la même course.

Dans une course réelle du lobby, la caméra suit automatiquement l'adresse inscrite. Sans participant connecté, elle suit le leader. **Full track** montre le circuit entier ; le sélecteur **Camera target** permet de suivre un autre participant et de revenir au sien. Le podium existant s'affiche après la course.

La simulation blockchain (`CHAIN_MODE=stub`) est indépendante de la simulation physique (`RACE_ENGINE=planck`). On peut donc jouer au vrai circuit 3D sans blockchain, puis utiliser le même circuit sur testnet.

## Parcours

1. Lance de pompier noire avec embout argenté, poignée, tuyau et recul par à-coups, inspirée de la photo fournie et accompagnée de cette photo au départ. Quatre salves de dix à 0, 1, 2 et 3 secondes ; leur composition est mélangée avec la graine.
2. Bassin du tourbillon : cuvette inclinée ; le passage dépend de l'élan et du relief, sans orbite imposée.
3. Galton : six rangées décalées de picots, collisions avec restitution, sorties ouvertes.
4. Échelle : cinq barreaux en cascade, passages alternés à droite et à gauche.
5. Deux hélices croisées en rotation, avec collisions.
6. Entonnoir divisé en deux passages, qui se rejoignent.
7. Sprint final, ligne à damier devant l'image d'ovule fournie, puis podium. Les deux images originales sont conservées dans `public/images/`.

Décor inspiré de la photo de référence : chambre de nuit, lit double défait, couette bordeaux froissée, oreillers décalés, tête de lit sombre, lampe articulée chaude et plante dans le coin. Un éclairage violet complète la lumière orangée du chevet. Le circuit garde ses couleurs corail, turquoise, lilas et laiton. La vue d'ouverture montre la chambre entière avant de suivre le participant. Les participants ont une tête 3D et une queue qui suit leurs déplacements ; leurs couleurs reprennent celles du lobby. Un cercle et un marqueur désignent le participant suivi.

## Physique et durée

- Planck calcule les positions sur le plan du circuit à **60 pas/s**, côté serveur. Il s'agit d'une physique 2D projetée sur une piste et des modèles 3D, pas d'un solveur de corps rigides 3D libres.
- Les têtes heurtent les picots, barreaux, parois et hélices. Les participants ne se heurtent jamais entre eux et ne se poussent pas. La queue est visuelle ; elle ne produit pas de collisions.
- Après l'impulsion de la lance, la gravité tangentielle calculée à partir du gradient de la surface et un amortissement uniforme gouvernent la descente. Aucun courant moteur, objectif de vitesse, guidage individuel ou téléportation. La sortie de lance ajoute une hauteur balistique visuelle ; elle ne constitue pas un solveur complet de vol 3D. Une simulation qui n'aboutit pas lève une erreur.
- Les arrivées sont détectées par le franchissement physique de la ligne. Les ex aequo au pas de simulation sont départagés par l'identifiant.
- Les quatre premières secondes restent à vitesse réelle pour respecter les salves. Ensuite, une **horloge commune** étire la course jusqu'à la première arrivée à 40 secondes. L'écart final est conservé à cette échelle, ou comprimé à 12 secondes maximum. Ce réglage du rythme ne change ni l'ordre ni les collisions. Les hélices utilisent la même conversion d'horloge que le replay. Le classement suit l'ordre d'arrivée, sans déduire le délai de départ de chaque salve.
- Le replay enregistre `(x, y)` à **30 Hz**, encodé en Int16/base64 ; `finishTimes` conserve les temps exacts et `releaseTimes` les départs. Version de piste : `bed-slide-v3`.
- Une graine et une liste ordonnée d'inscrits identiques reproduisent le même replay dans l'environnement testé. Les mises à jour du moteur ou de Planck nécessitent une nouvelle validation/version ; ce déterminisme n'est pas une preuve d'équité cryptographique.

## Rendu et caméra

Three.js est chargé uniquement lorsque la scène est montée. Le client ne simule pas la physique. La caméra amortit la direction, anticipe légèrement le déplacement et conserve une hauteur minimale au-dessus de la piste. À l'arrivée, elle passe au cadre de fin ; les trois premiers apparaissent sur les supports du podium après la dernière arrivée.

Les têtes, queues et ombres sont dessinées par instanciation GPU. Sur téléphone, moins de segments de queue et une résolution plafonnée réduisent la charge. Le canvas suit sa taille réelle via `ResizeObserver`. L'animation suspend son rendu quand l'onglet est caché et se recale ensuite sur l'horloge. La préférence de réduction des mouvements éloigne et amortit davantage la caméra.

Les ressources GPU, observateurs et boucles d'animation sont libérés au démontage. Le démontage ne force pas la perte du contexte WebGL : React StrictMode et le rechargement à chaud peuvent réutiliser le même canvas.

## Fichiers

| Fichier | Fonction |
|---|---|
| `src/sim/track.ts` | Géométrie et relief communs à la physique et au dessin |
| `src/sim/engine.ts` | Simulation Planck déterministe, classement et replay |
| `src/game/replay.ts` | Positions, temps d'arrivée, classement et horloge des obstacles |
| `src/game/scene.ts` | Scène Three.js, modèles procéduraux et caméra |
| `src/game/bedroom.ts` | Lit, tissus déformés, oreillers, mobilier et lampes |
| `src/components/RaceStage.tsx` | Vue 3D commune, HUD et commandes caméra |
| `src/components/RaceView.tsx` | Connexion au replay d'une course du lobby |
| `src/app/track/page.tsx` | Démonstration indépendante de la chaîne |
| `tests/physics.test.ts` | Arrivées, déterminisme, collisions, limites de piste et intégration lobby |

## Vérification autonome

```
npm test
npm run lint
npm run build
npm run simulate -- --engine planck --seed 0xabc --check
npm run simulate -- --engine planck --sanity 12
```

Le serveur existant a permis d'inspecter visuellement le départ, le tourbillon, Galton, la vue d'ensemble et le format mobile. La validation on-chain reste distincte : cette réalisation ne déploie aucun contrat et ne corrige pas les problèmes de persistance/admission décrits dans l'audit initial.
