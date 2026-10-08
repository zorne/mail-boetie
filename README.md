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
| `index.html` | L'application complète : registre, modèles de mail, tournée d'envoi |
| `dordogne.json` | L'annuaire : 639 entreprises indépendantes, 197 communes de Dordogne |
| `modeles.json` | Sauvegarde des 5 modèles de mail (3 relances, 2 prospections) |
| `outils/annuaire-dordogne.py` | Le script qui reconstruit l'annuaire depuis la base SIRENE |

## L'annuaire

Il vient du **registre public des entreprises** (base SIRENE, données ouvertes de l'État), via
l'API `recherche-entreprises.api.gouv.fr`. Trois filtres sont appliqués :

- **siège en Dordogne** — une succursale de chaîne nationale ne décide jamais d'un parrainage
  local sur place ;
- **au plus trois établissements** — des indépendants, pas des groupes régionaux ;
- **pas de nom de personne seul** — les entrepreneurs individuels sans enseigne commerciale sont
  écartés : inexploitables, et ce sont des données personnelles.

Le registre public ne publie **pas** les adresses mail. Elles doivent être relevées une par une
sur le site ou la fiche Google de chaque entreprise. L'application signale en rouge toute fiche
qui en manque.

Pour reconstruire l'annuaire :

```bash
python3 outils/annuaire-dordogne.py
```

## Le parrainage n'est pas un don

Comme il y a une contrepartie (l'affiche), la somme est juridiquement un **parrainage** : une
dépense de communication pour l'entreprise, et non un don. Cela change l'argument de vente, et
suppose que l'association puisse émettre une facture.

Trois paliers, parce qu'une fourchette « entre 50 et 150 € » fait que tout le monde donne 50 :

- **50 € — Soutien** : nom sur l'affiche
- **100 € — Partenaire** : logo sur l'affiche, un lot du loto annoncé à son nom
- **150 € — Partenaire principal** : logo en grand, flyers sur place, photo avec les auteurs

## L'application

Elle est publiée comme Artifact Claude et s'appuie sur son stockage partagé : les deux membres
du binôme voient le même registre, mis à jour en direct.

- **Registre** — statut et montant se changent directement dans le tableau. Passer une ligne à
  « Accepté » place le curseur dans la case montant.
- **Relances** — la date d'envoi est enregistrée ; au bout de cinq jours la ligne remonte en
  tête sous « À relancer ».
- **Tournée d'envoi** — parcourt les entreprises du filtre en cours qui ont une adresse,
  choisit le bon modèle pour chacune, ouvre Gmail pré-rempli, marque l'envoi et passe à la
  suivante.

L'envoi passe par Gmail plutôt que par une API d'envoi : cent mails identiques partis d'un
domaine neuf finissent en indésirables, alors qu'un mail parti d'une vraie adresse arrive en
boîte de réception.

## Licence

Code sous licence MIT. Les données de `dordogne.json` proviennent de la base SIRENE, diffusées
sous [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/).
