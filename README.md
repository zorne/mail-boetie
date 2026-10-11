# Prospection — Association La Boétie

Outil de prospection pour financer la conférence d'auteurs et le loto de l'association
**La Boétie**, qui fait découvrir la lecture aux jeunes.

**Objectif : 1 500 €**, levés auprès de commerces indépendants de Dordogne sous forme de
parrainages de 50 à 150 €. En échange, l'entreprise figure sur l'affiche de l'événement.

## Le calcul qui commande tout le reste

1 500 € à 85 € de don moyen, cela fait **18 accords**. Avec un taux d'acceptation de 15 à 25 %
en passage direct, il faut donc démarcher **80 à 120 entreprises**. Par mail seul, le taux tombe
à 3-5 % et il en faudrait 400 à 600.

C'est pourquoi l'outil automatise tout **sauf** le premier contact : la liste, le choix du
modèle, l'envoi, le suivi, les relances. Chez un commerçant, c'est la personne en face qui
décide, souvent en trente secondes.

## Ce que contient le dépôt

| Fichier | Rôle |
|---|---|
| `apps-script/Code.gs` | **Le moteur** : envoi, détection des réponses, relances automatiques |
| `apps-script/README.md` | La notice d'installation, pas à pas |
| `apps-script/test-lecture.mjs` | Éprouve la lecture automatique des réponses |
| `index.html` | L'application de consultation : registre, modèles, tournée d'envoi |
| `dordogne.json` | L'annuaire : 832 entreprises joignables, 252 communes |
| `modeles.json` | Les 5 modèles de mail (3 relances, 2 prospections) |
| `outils/contacts-osm.py` | Construit l'annuaire depuis OpenStreetMap et les sites |
| `outils/communes-et-tri.py` | Retrouve les communes et écarte les adresses douteuses |
| `outils/annuaire-dordogne.py` | Variante bâtie sur la base SIRENE (sans contacts) |

## L'annuaire — 832 entreprises réellement joignables

**330 avec une adresse mail, 757 avec un téléphone, 252 communes.** Périgueux 54, Bergerac 45,
Sarlat 43, Terrasson 39, Montignac 19, Brantôme 16, Eymet 16…

Les contacts viennent d'**OpenStreetMap** (licence ODbL), complétés en allant lire les sites
des entreprises quand la carte n'avait pas l'adresse mail — y compris leurs **mentions
légales**, obligatoires en France et qui doivent porter un contact. Les communes manquantes ont été
retrouvées par géocodage inverse via l'API Adresse de l'État.

Quatre filtres :

- **pas de chaîne nationale** — une succursale ne décide jamais d'un parrainage local sur place ;
- **joignable** — une fiche sans mail ni téléphone ne sert à rien ;
- **pas d'adresse partagée** — une même adresse sur plusieurs commerces sans lien, c'est une
  extraction ratée, pas un contact ;
- **pas d'adresse générique suspecte** — `contact@gmail.com` et consorts sont écartés.

Aucune adresse n'est devinée. Celles qui manquaient restent vides : un mail qui rebondit fait
classer tous les suivants en indésirables.

```bash
python3 outils/contacts-osm.py && python3 outils/communes-et-tri.py
```

## Le parrainage n'est pas un don

Comme il y a une contrepartie (l'affiche), la somme est juridiquement un **parrainage** : une
dépense de communication pour l'entreprise, et non un don. Cela change l'argument de vente, et
suppose que l'association puisse émettre une facture.

Trois paliers, parce qu'une fourchette « entre 50 et 150 € » fait que tout le monde donne 50 :

- **50 € — Soutien** : nom sur l'affiche
- **100 € — Partenaire** : logo sur l'affiche, un lot du loto annoncé à son nom
- **150 € — Partenaire principal** : logo en grand, flyers sur place, photo avec les auteurs

## Comment ça marche

⚠️ **Le tableur est la seule source de vérité.** Tout le suivi — envois, réponses, relances,
montants — y vit. Installation : [apps-script/README.md](apps-script/README.md).

`index.html` est une application séparée, utile pour **parcourir l'annuaire** et préparer des
envois à la main. Elle tient son propre registre, qui **ne communique pas** avec le tableur :
une page web ne peut pas lire une feuille Google. Tenir les deux à jour en parallèle finirait
par donner deux totaux différents, et on ne saurait plus lequel croire. Servez-vous-en pour
chercher et consulter, jamais pour suivre.

## L'application de consultation

L'envoi passe par Gmail plutôt que par une API d'envoi : cent mails identiques partis d'un
domaine neuf finissent en indésirables, alors qu'un mail parti d'une vraie adresse arrive en
boîte de réception.

## Licence

Code sous licence MIT. Les données de `dordogne.json` proviennent de la base SIRENE, diffusées
sous [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/).
