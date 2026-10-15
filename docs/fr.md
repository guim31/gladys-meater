# MEATER

Suivez vos sondes de cuisson sans fil MEATER dans Gladys : températures
interne et ambiante, cible, temps restant et état de la cuisson, et des scènes
qui se lancent au bon moment de la cuisson.

> Non affiliée à Apption Labs / MEATER. MEATER est une marque d'Apption Labs.
> **Développée sans le matériel : vos retours sont les bienvenus**, sur le
> [forum Gladys](https://community.gladysassistant.com) ou dans les
> [issues](https://github.com/guim31/gladys-meater/issues).

## Présentation

L'intégration lit vos sondes par l'**API officielle MEATER Cloud**, avec le
compte de l'application MEATER. Chaque sonde devient un appareil Gladys, avec
ses températures et sa cuisson. Trois déclencheurs de scène marquent les
moments d'une cuisson (presque prête, à retirer du feu, repos terminé), et un
widget de tableau de bord montre une cuisson d'un coup d'œil.

Tout est en **lecture seule** : Gladys ne démarre, ne modifie et n'arrête
jamais une cuisson. La cuisson se prépare dans l'application MEATER, comme
d'habitude.

## Prérequis

- Gladys **5.1.0** ou plus récent, avec un accès à Internet.
- Une sonde MEATER : MEATER, MEATER+, MEATER 2 Plus, MEATER Pro, MEATER Pro
  XL, ou un MEATER Block.
- Un compte **MEATER Cloud**, connecté dans l'application MEATER.
- Pendant la cuisson, l'application MEATER (téléphone ou tablette) ou le Block
  doit rester connecté à la sonde (Bluetooth) **et** à Internet : MEATER Cloud
  ne sait que ce que l'application ou le Block lui transmet.

## Configuration

Dans Gladys, ouvrez **Intégrations**, puis **MEATER**, onglet
**Configuration** :

| Champ                                | À saisir                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Adresse e-mail                       | L'adresse e-mail de votre compte MEATER Cloud.                                                                                   |
| Mot de passe                         | Son mot de passe.                                                                                                                |
| Langue                               | Langue des noms de fonctionnalités, des états de cuisson et des noms de morceaux envoyés par MEATER Cloud (français par défaut). |
| Rafraîchissement pendant une cuisson | Toutes les 15 s, 30 s (recommandé) ou 60 s pendant une cuisson. Toutes les minutes sinon.                                        |

Enregistrez, puis cliquez sur **Tester la connexion** : le message indique
combien de sondes MEATER Cloud voit en ce moment.

Ajoutez ensuite les sondes :

1. Lancez une cuisson dans l'application MEATER (une sonde n'apparaît dans
   MEATER Cloud que pendant une cuisson).
2. Dans l'onglet **Découverte**, cliquez sur le bouton de recherche, puis sur
   **Ajouter à Gladys** pour chaque sonde.

Une sonde vue une fois reste dans l'onglet Découverte, même entre deux
cuissons.

## Appareils

Un appareil par sonde, nommé « Sonde MEATER » suivi des 8 premiers caractères
de son identifiant (renommez-le dans Gladys). Toutes les fonctionnalités sont
en lecture seule.

| Fonctionnalité                | Contenu                                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Température interne           | Température à la pointe de la sonde, dans la viande (°C).                                                                                             |
| Température ambiante          | Température autour de la viande, dans le four ou sur le grill (°C).                                                                                   |
| Température cible             | La cible réglée dans l'application pour la cuisson (°C).                                                                                              |
| Température maximale atteinte | La plus haute température interne atteinte pendant la cuisson (°C).                                                                                   |
| Temps restant                 | Le temps restant estimé par MEATER (minutes). Garde sa dernière valeur tant que MEATER est en train d'estimer.                                        |
| Temps écoulé                  | Temps depuis le début de la cuisson (minutes).                                                                                                        |
| État de la cuisson            | Aucune cuisson, Pas démarrée, Préparée, En cuisson, À retirer du feu, Au repos, Terminée, Légèrement sous-cuite, Légèrement trop cuite, Trop cuite !. |
| Cuisson                       | Le nom du morceau, ou le nom donné à la cuisson dans l'application.                                                                                   |
| Cuisson en cours              | 1 du début de la cuisson à la fin du repos, 0 sinon.                                                                                                  |
| Sonde connectée               | 1 tant que MEATER Cloud voit la sonde, 0 sinon.                                                                                                       |

Quand une sonde n'est plus vue (cuisson terminée, sonde remise dans son
chargeur, téléphone hors de portée), « Sonde connectée » passe à 0 tout de
suite et les dernières mesures restent. Après 30 minutes sans nouvelles, la
cuisson est considérée comme terminée : « Cuisson en cours » revient à 0 et
« État de la cuisson » à « Aucune cuisson ».

## Widget de tableau de bord

**Cuisson MEATER** montre une sonde : le nom de la cuisson, les températures
interne, cible et ambiante (en direct), le temps restant, l'état de la
cuisson, le temps écoulé et si la sonde est connectée.

Dans ses réglages, choisissez une sonde, ou laissez vide : le widget montre
alors la sonde en train de cuire.

## Déclencheurs de scène

Dans une scène, **Ajouter déclencheur**, puis choisissez l'un des
déclencheurs MEATER. Chacun se déclenche **une fois par cuisson**, même si
Gladys redémarre au milieu.

| Déclencheur           | Quand                                                                                    | Filtres                                 | Informations transmises à la scène                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| Cuisson presque prête | Le temps restant estimé par MEATER passe sous 5, 10, 15 ou 30 minutes, viande sur le feu | Sonde (facultatif), seuil (obligatoire) | Cuisson, temps restant, seuil, températures interne et cible                        |
| À retirer du feu      | MEATER dit de retirer la viande du feu et de la laisser reposer                          | Sonde (facultatif)                      | Cuisson, températures interne et cible                                              |
| Repos terminé         | Le repos est terminé et MEATER donne son verdict                                         | Sonde, résultat (tous deux facultatifs) | Cuisson, résultat (Terminée, Légèrement sous-cuite…), températures interne et cible |

Les textes transmis (état de la cuisson, résultat) suivent la langue de la
configuration.

## Action

**Tester la connexion** (onglet Configuration) se connecte à MEATER Cloud et
indique combien de sondes il voit en ce moment, ou ce qui ne va pas (mot de
passe refusé, service injoignable, trop de requêtes). Après un mot de passe
refusé, c'est aussi le moyen de réessayer sans enregistrer la configuration.

## Exemples de scènes

Les mots entre crochets sont des informations du déclencheur, insérées dans le
texte avec le sélecteur de variables de l'éditeur de scène.

- **Mettre la table** : déclencheur « Cuisson presque prête » avec le seuil
  « 10 minutes », action « Envoyer un message » : « [Cuisson] est prête dans
  10 minutes, on met la table. »
- **Hors du feu** : déclencheur « À retirer du feu », actions « Faire
  clignoter les lumières » de la cuisine et « Parler sur une enceinte » :
  « Retirez [Cuisson] du feu, elle est à [Température interne] °C. »
- **À table** : déclencheur « Repos terminé » avec le résultat « Terminée »,
  action « Envoyer un message » à toute la famille : « À table ! »
- **Grill trop chaud** : déclencheur « Changement d'état de l'appareil » sur
  la « Température ambiante » de la sonde, au-dessus de 300 °C : un message
  pour aller voir le grill.

## Rafraîchissement et quotas

MEATER Cloud autorise **60 requêtes par minute au plus, et en recommande 2**.
L'intégration lit le compte :

- au rythme choisi dans la configuration pendant qu'une cuisson est préparée
  ou en cours (toutes les 30 s par défaut) ;
- toutes les minutes sinon, comme le conseille la documentation de l'API ;
- jamais deux fois en moins de 2 secondes ;
- après un échec, au bout de 1, 2, 4… minutes, jusqu'à 10 minutes (5 minutes
  au moins quand MEATER Cloud demande de ralentir).

Une requête répond pour toutes les sondes du compte. L'intégration n'envoie à
Gladys que les valeurs qui ont changé (et chaque valeur au moins toutes les
6 heures, pour qu'aucune ne paraisse périmée), et elle se rafraîchit
elle-même : elle ne dépend pas du planificateur de Gladys.

Ce qui est conservé dans le volume de données de l'intégration : le jeton
MEATER Cloud (il n'expire pas) avec une empreinte du compte, et la liste des
sondes vues avec la mémoire de leur cuisson en cours. Ni l'adresse e-mail ni
le mot de passe n'y sont écrits ; le mot de passe reste dans la configuration
de Gladys.

## Dépannage

- **« MEATER Cloud a refusé l'adresse e-mail ou le mot de passe »** : utilisez
  l'adresse et le mot de passe de l'application MEATER, puis enregistrez de
  nouveau la configuration. L'intégration ne réessaie pas d'elle-même, pour ne
  pas bloquer le compte.
- **Aucune sonde dans l'onglet Découverte** : une sonde n'apparaît que pendant
  une cuisson, quand l'application MEATER ou le Block y est connecté et a
  accès à Internet. Lancez une cuisson, cliquez sur **Tester la connexion**,
  puis relancez la recherche.
- **Les valeurs ne bougent plus** : le téléphone qui fait tourner
  l'application MEATER est hors de portée Bluetooth, en veille ou sans
  Internet. « Sonde connectée » indique si MEATER Cloud voit encore la sonde.
- **« MEATER Cloud demande de ralentir »** : un autre programme lit le même
  compte trop souvent. Choisissez un rafraîchissement plus lent pendant une
  cuisson.
- **Plus de détails** : les journaux de l'intégration (onglet Supervision).
  La variable d'environnement `LOG_LEVEL=debug` montre chaque
  rafraîchissement.

## Limites

- Cloud uniquement : Gladys ne parle pas à la sonde en Bluetooth. Les données
  arrivent avec le délai de l'application MEATER, de MEATER Cloud et du
  rythme de rafraîchissement (30 s par défaut).
- L'API MEATER Cloud est en bêta : MEATER peut la modifier.
- L'API donne un seul nom par cuisson (le morceau, ou le nom que vous avez
  saisi) : il n'y a pas de nom de recette séparé.
- Le temps restant est l'estimation de MEATER ; il est inconnu au début de la
  cuisson.
- Les températures arrivent en degrés Celsius.
- Lecture seule : ni réglage de cuisson ni alarme depuis Gladys.
- Développée sans le matériel ni compte : le comportement a été écrit d'après
  la documentation officielle de l'API et l'intégration Home Assistant. Vos
  retours sont les bienvenus.
