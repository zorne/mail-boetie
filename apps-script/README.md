# Le moteur d'envoi et de suivi

Ce script tourne **dans le compte Gmail `prixlaboetie@gmail.com`**. C'est la seule façon
d'obtenir un vrai suivi automatique : une page web ne peut pas lire une boîte mail, un script
Google Apps Script le peut.

Il envoie, **détecte les réponses tout seul**, relance au bout de cinq jours, et n'écrit jamais
deux fois à quelqu'un qui a demandé qu'on le laisse tranquille.

## Installation — une quinzaine de minutes, une seule fois

1. Connectez-vous à Google avec **prixlaboetie@gmail.com**.
2. Allez sur [sheets.new](https://sheets.new) : un tableur vide s'ouvre.
3. Nommez-le **Prospection La Boétie**.
4. Menu **Extensions → Apps Script**.
5. Effacez le contenu de `Code.gs` et collez à la place tout le contenu de
   [`Code.gs`](Code.gs) de ce dossier.
6. Cliquez sur l'icône **Enregistrer**.
7. Revenez au tableur et **rechargez la page**. Un menu **La Boétie** apparaît à droite
   du menu « Aide ».
8. **La Boétie → 1. Installer**. Google demande une autorisation : c'est normal, le script
   va lire et écrire dans votre boîte. Cliquez *Autoriser*. Si un écran « Google n'a pas
   validé cette application » apparaît, cliquez *Paramètres avancés* puis *Accéder à
   Prospection La Boétie* — c'est votre propre script, pas celui d'un tiers.
9. **La Boétie → 2. Importer l'annuaire de Dordogne**.

C'est fini. À partir de là, tout tourne seul.

## Avant le premier envoi — deux minutes bien employées

**La Boétie → S'envoyer un mail d'essai.** Vous recevez le mail exact qu'une entreprise
recevrait. Relisez-le : orthographe, ton, signature, et surtout que le nom de l'entreprise
apparaisse bien à la place de `{{entreprise}}`. Une coquille part trente-cinq fois et ne se
rattrape pas.

**La Boétie → Simuler le lot du jour.** Montre qui recevrait quoi, sans rien envoyer. La
simulation utilise exactement le même code de sélection que l'envoi réel — sinon elle
annoncerait autre chose que ce qui part.

## Ce qui se passe ensuite, sans vous

| Quand | Quoi |
|---|---|
| Toutes les heures | Le script relève les réponses et met le tableau à jour |
| Chaque matin à 9 h | Les relances dues partent toutes seules |
| À chaque réponse | Vous recevez un mail récapitulatif avec l'état du financement |

Pour envoyer un lot : **La Boétie → Envoyer le lot du jour**. Le script en envoie jusqu'à 35,
espacés de quelques secondes.

## Le téléphone, qui est la majorité de l'annuaire

**Six fiches sur dix n'ont pas d'adresse mail** — 502 sur 832. Elles arrivent en statut
*À appeler*, pas *À contacter* : sans ça, elles attendraient un mail qui ne partirait jamais,
et on les croirait traitées.

**La Boétie → Préparer 15 appels** surligne en bleu les quinze suivantes et vous donne la
liste avec les numéros. Après chaque appel, changez le statut de la ligne.

L'onglet **Script d'appel** contient l'ouverture en quinze secondes, les sept objections que
vous allez entendre avec quoi répondre à chacune, et les heures où appeler selon le métier.
Lisez-le avant le premier appel. Ce n'est pas du code, et c'est probablement ce qui pèsera le
plus sur votre taux d'accord.

Trois règles y sont rappelées, parce qu'elles comptent plus que le texte : ne jamais raccrocher
sans une date, ne jamais demander « ça vous intéresse ? » (on répond non par réflexe) mais
« je vous mets sur quelle formule ? », et traiter un non comme une information — il faut une
centaine d'appels pour dix-huit accords.

Ne négligez pas ce canal : un appel convertit quatre à cinq fois mieux qu'un mail. C'est le
meilleur de vos deux canaux, et c'est aussi le plus gros.

## Le tableau de bord

Un onglet **Tableau de bord**, rafraîchi toutes les quatre heures : promesses obtenues, reste à
lever, taux de réponse, taux d'accord, et — au-delà d'une dizaine de contacts — une estimation
du nombre d'entreprises qu'il reste à démarcher au rythme constaté.

## Ce qui est automatique, et ce qui ne l'est pas

**Détecter qu'une entreprise a répondu est fiable à 100 %.** Le script regarde si le fil de
discussion contient un message qui ne vient pas de vous. Il n'y a pas d'approximation possible.

**Lire cette réponse est une estimation.** Le script repère les tournures qui tranchent
(« avec plaisir », « nous ne pouvons pas », « pas cette année ») et remplit une colonne
**Lecture auto**. Le statut ne bascule sur *Accepté* ou *Refusé* que si la réponse est sans
ambiguïté. Une réponse du type « d'accord, mais pas cette année » contient les deux : le script
ne tranche pas et laisse *A répondu*, en colorant la ligne en jaune.

Vous n'avez donc **jamais à saisir qui a répondu**. Il vous reste à jeter un œil aux lignes
jaunes, qui sont une minorité.

Si la réponse cite une somme (« 100 € »), elle est reportée dans la colonne Montant. Le mail
d'origine cité sous la réponse est retiré avant lecture : sans cela, les « 50 € / 100 € / 150 € »
de nos propres paliers seraient relevés comme la promesse du commerçant.

**Un rebond n'est pas une réponse.** Une adresse morte renvoie un message automatique ; il est
reconnu comme tel et la ligne passe en *Adresse invalide*, au lieu d'être comptée comme un
contact établi.

## Les garde-fous, et pourquoi ils existent

**35 mails par jour maximum.** Gmail en autorise 500, mais une boîte neuve qui en envoie cent
d'un coup est classée en indésirables — et vos mails suivants n'arrivent plus, sans que rien ne
vous le signale. Trente-cinq par jour, espacés, passent.

**Deux relances au maximum.** Au-delà, insister dessert : on ne décroche pas un parrainage à la
quatrième relance, on se fait signaler comme spam.

**« STOP » est respecté immédiatement.** Chaque mail porte une ligne expliquant comment se
désinscrire. Une réponse contenant « stop », « désinscrire » ou « ne plus me contacter » passe
la ligne en *Ne plus contacter*, et plus rien ne part. C'est une obligation légale pour la
prospection par mail, et c'est aussi ce qui protège votre réputation d'expéditeur.

**Aucune adresse n'est devinée.** Celles de l'annuaire ont été relevées sur OpenStreetMap et
sur les sites des entreprises. Une adresse inventée rebondit, et dix rebonds suffisent à faire
classer tous vos envois en indésirables.

## Éprouver la lecture automatique

Les tournures reconnues sont testées sur de vraies phrases de réponse :

```bash
node apps-script/test-lecture.mjs
```

À relancer après toute retouche des expressions. Un refus lu comme un accord fausse le total
affiché, et rien ne le signalerait.

## Deux filets de sécurité discrets

**Un « Accepté » sans montant ne compte pour rien dans le total.** C'est l'erreur de saisie la
plus coûteuse : la ligne a l'air traitée, le total reste en dessous de la réalité, et personne
ne comprend pourquoi. Dès que vous passez une ligne à *Accepté*, la case Montant devient jaune
avec une note, tant qu'elle est vide.

**Le relevé des réponses tient la charge.** Il fait une seule recherche Gmail par passage, pas
un appel par mail envoyé. L'ancienne version coûtait 7 200 appels par jour à 300 envois et
aurait fini par dépasser le temps d'exécution — elle aurait donc cassé au moment précis où la
campagne marchait.

## Les colonnes du tableau

| Colonne | Remplie par |
|---|---|
| Entreprise, Catégorie, Commune, Adresse, Téléphone, Adresse mail | L'import de l'annuaire |
| Type | « Nouveau » par défaut ; mettez « Ancien partenaire » pour vos partenaires de l'an dernier |
| Statut | Le script, à chaque envoi et à chaque réponse |
| Envoyé le, Relances, Fil Gmail | Le script |
| Répondu le, Lecture auto, Extrait de la réponse | Le script |
| Montant | Le script s'il trouve une somme, vous sinon |

## Les modèles de mail

Ils sont dans l'onglet **Modèles** du tableur, modifiables directement. `{{entreprise}}`,
`{{contact}}` et `{{ville}}` sont remplacés à l'envoi. La colonne **Rang** vaut `0` pour un
premier contact et `1` pour une relance.
