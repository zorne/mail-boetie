/**
 * Prospection La Boétie — moteur d'envoi et de suivi.
 *
 * Ce script tourne DANS le compte Gmail prixlaboetie@gmail.com. C'est la seule façon
 * d'avoir un vrai suivi : une page web ne peut pas lire une boîte mail, un script
 * Apps Script si. Il envoie, détecte les réponses tout seul, relance au bout de cinq
 * jours, et n'écrit jamais deux fois à quelqu'un qui a demandé qu'on le laisse.
 *
 * Installation : voir README.md à côté de ce fichier.
 */

const EXPEDITEUR      = "prixlaboetie@gmail.com";
const NOM_EXPEDITEUR  = "Association La Boétie";
const OBJECTIF_EUROS  = 1500;

const MAX_PAR_JOUR    = 35;   // Au-delà, Gmail classe les envois en indésirables.
const DELAI_RELANCE   = 5;    // Jours sans réponse avant la première relance.
const MAX_RELANCES    = 2;    // Après ça, on arrête. Insister dessert.

const DEPOT = "https://raw.githubusercontent.com/zorne/mail-boetie/main/";

const COL = {
  nom: 1, categorie: 2, commune: 3, adresse: 4, telephone: 5, email: 6,
  statut: 7, dateEnvoi: 8, relances: 9, dateReponse: 10, lectureAuto: 11,
  reponse: 12, montant: 13, fil: 14,
};
const NB_COLONNES = 14;

const STATUTS = {
  aContacter: "À contacter",
  envoye: "Envoyé",
  relance: "Relancé",
  repondu: "A répondu",
  accepte: "Accepté",
  refuse: "Refusé",
  stop: "Ne plus contacter",
};

/* ══════════════════════════════════════════════════════════════════
   MENU
   ══════════════════════════════════════════════════════════════════ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("La Boétie")
    .addItem("1. Installer (à faire une seule fois)", "installer")
    .addItem("2. Importer l'annuaire de Dordogne", "importerAnnuaire")
    .addSeparator()
    .addItem("Envoyer le lot du jour", "envoyerLot")
    .addItem("Relever les réponses maintenant", "verifierReponses")
    .addItem("Envoyer les relances dues", "envoyerRelances")
    .addSeparator()
    .addItem("Où en est-on ?", "bilan")
    .addToUi();
}

/* ══════════════════════════════════════════════════════════════════
   INSTALLATION
   ══════════════════════════════════════════════════════════════════ */

function installer() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();

  let f = classeur.getSheetByName("Entreprises");
  if (!f) f = classeur.insertSheet("Entreprises");
  if (f.getLastRow() === 0) {
    f.appendRow([
      "Entreprise", "Catégorie", "Commune", "Adresse", "Téléphone", "Adresse mail",
      "Statut", "Envoyé le", "Relances", "Répondu le", "Lecture auto",
      "Extrait de la réponse", "Montant (€)", "Fil Gmail",
    ]);
    f.getRange(1, 1, 1, NB_COLONNES).setFontWeight("bold").setBackground("#efefed");
    f.setFrozenRows(1);
    f.setColumnWidth(COL.reponse, 320);
    f.getRange(2, COL.statut, f.getMaxRows() - 1)
      .setDataValidation(SpreadsheetApp.newDataValidation()
        .requireValueInList(Object.keys(STATUTS).map(function (k) { return STATUTS[k]; }), true)
        .build());
  }

  let m = classeur.getSheetByName("Modèles");
  if (!m) m = classeur.insertSheet("Modèles");
  if (m.getLastRow() === 0) {
    m.appendRow(["Nom", "Pour qui", "Rang", "Objet", "Message"]);
    m.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#efefed");
    m.setFrozenRows(1);
    m.setColumnWidth(5, 520);
    importerModeles_();
  }

  // Les déclencheurs : c'est eux qui rendent le suivi automatique.
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("verifierReponses").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("envoyerRelances").timeBased().everyDays(1).atHour(9).create();

  SpreadsheetApp.getUi().alert(
    "Installé.\n\n" +
    "Les réponses sont désormais relevées toutes les heures, et les relances partent " +
    "chaque matin à 9 h, automatiquement.\n\n" +
    "Étape suivante : « 2. Importer l'annuaire de Dordogne »."
  );
}

/* ══════════════════════════════════════════════════════════════════
   IMPORT DE L'ANNUAIRE
   ══════════════════════════════════════════════════════════════════ */

function importerAnnuaire() {
  const f = feuille_("Entreprises");
  const deja = {};
  if (f.getLastRow() > 1) {
    f.getRange(2, COL.nom, f.getLastRow() - 1, COL.commune).getValues()
      .forEach(function (l) { deja[cle_(l[0], l[2])] = true; });
  }

  const data = JSON.parse(UrlFetchApp.fetch(DEPOT + "dordogne.json").getContentText());
  const lignes = [];
  data.entreprises.forEach(function (e) {
    if (!e.mail && !e.tel) return;                 // injoignable : inutile en base
    if (deja[cle_(e.n, e.v)]) return;
    lignes.push([
      e.n, e.c, e.v || "", e.a || "", e.tel || "", e.mail || "",
      STATUTS.aContacter, "", 0, "", "", "", "", "",
    ]);
  });

  if (!lignes.length) {
    SpreadsheetApp.getUi().alert("Rien de nouveau : l'annuaire est déjà importé.");
    return;
  }
  f.getRange(f.getLastRow() + 1, 1, lignes.length, NB_COLONNES).setValues(lignes);

  const avecMail = lignes.filter(function (l) { return l[COL.email - 1]; }).length;
  SpreadsheetApp.getUi().alert(
    lignes.length + " entreprises ajoutées.\n\n" +
    avecMail + " ont une adresse mail et peuvent être démarchées tout de suite.\n" +
    (lignes.length - avecMail) + " n'ont qu'un téléphone — à appeler, ce qui convertit mieux."
  );
}

function importerModeles_() {
  const m = feuille_("Modèles");
  const data = JSON.parse(UrlFetchApp.fetch(DEPOT + "modeles.json").getContentText());
  const lignes = data.modeles.map(function (x, i) {
    return [x.nom, x.cible === "ancien" ? "ancien" : "nouveau",
            /relance|rappel/i.test(x.nom) ? 1 : 0, x.objet, x.corps];
  });
  if (lignes.length) m.getRange(2, 1, lignes.length, 5).setValues(lignes);
}

/* ══════════════════════════════════════════════════════════════════
   ENVOI
   ══════════════════════════════════════════════════════════════════ */

function envoyerLot() {
  const n = envoyer_(false);
  SpreadsheetApp.getUi().alert(
    n === 0
      ? "Aucun envoi.\n\nSoit tout est déjà contacté, soit le quota du jour est atteint."
      : n + " mail" + (n > 1 ? "s" : "") + " envoyé" + (n > 1 ? "s" : "") + ".\n\n" +
        "Les réponses seront relevées toutes les heures. Vous n'avez rien à saisir."
  );
}

function envoyerRelances() { envoyer_(true); }

/**
 * Envoie un lot. `relance` à vrai ne reprend que les entreprises déjà contactées,
 * restées sans réponse depuis plus de DELAI_RELANCE jours.
 */
function envoyer_(relance) {
  const f = feuille_("Entreprises");
  if (f.getLastRow() < 2) return 0;

  const lignes = f.getRange(2, 1, f.getLastRow() - 1, NB_COLONNES).getValues();
  const modeles = lireModeles_();
  if (!modeles.length) return 0;

  const quota = Math.min(MAX_PAR_JOUR, MailApp.getRemainingDailyQuota());
  const maintenant = new Date();
  let envoyes = 0;

  for (let i = 0; i < lignes.length && envoyes < quota; i++) {
    const l = lignes[i];
    const statut = l[COL.statut - 1];
    const email = String(l[COL.email - 1] || "").trim();
    if (!email || email.indexOf("@") === -1) continue;
    if (statut === STATUTS.stop || statut === STATUTS.accepte ||
        statut === STATUTS.refuse || statut === STATUTS.repondu) continue;

    let rang = 0;
    if (relance) {
      if (statut !== STATUTS.envoye && statut !== STATUTS.relance) continue;
      if ((l[COL.relances - 1] || 0) >= MAX_RELANCES) continue;
      const envoye = l[COL.dateEnvoi - 1];
      if (!(envoye instanceof Date)) continue;
      if ((maintenant - envoye) / 86400000 < DELAI_RELANCE) continue;
      rang = 1;
    } else {
      if (statut !== STATUTS.aContacter) continue;
    }

    const modele = choisirModele_(modeles, "nouveau", rang);
    if (!modele) continue;

    const donnees = {
      entreprise: l[COL.nom - 1],
      ville: l[COL.commune - 1],
      contact: "Madame, Monsieur",
    };
    const objet = remplir_(modele.objet, donnees);
    const corps = remplir_(modele.corps, donnees) + PIED_DE_MAIL;

    try {
      // createDraft().send() rend le message envoyé : c'est de lui qu'on tire
      // l'identifiant du fil, et c'est cet identifiant qui rend le suivi possible.
      const message = GmailApp.createDraft(email, objet, corps, {
        name: NOM_EXPEDITEUR, replyTo: EXPEDITEUR,
      }).send();

      const ligne = i + 2;
      f.getRange(ligne, COL.statut).setValue(relance ? STATUTS.relance : STATUTS.envoye);
      f.getRange(ligne, COL.dateEnvoi).setValue(maintenant);
      f.getRange(ligne, COL.relances).setValue((l[COL.relances - 1] || 0) + (relance ? 1 : 0));
      f.getRange(ligne, COL.fil).setValue(message.getThread().getId());
      envoyes++;
      Utilities.sleep(1500);    // On n'envoie pas en rafale : c'est le premier signal de spam.
    } catch (e) {
      f.getRange(i + 2, COL.reponse).setValue("Échec de l'envoi : " + e.message);
    }
  }
  return envoyes;
}

const PIED_DE_MAIL =
  "\n\n—\nAssociation La Boétie · " + EXPEDITEUR +
  "\nSi vous ne souhaitez plus recevoir de message de notre part, répondez « STOP » " +
  "à ce mail et nous vous retirerons de notre liste.";

/* ══════════════════════════════════════════════════════════════════
   SUIVI DES RÉPONSES — le cœur de l'affaire
   ══════════════════════════════════════════════════════════════════ */

/**
 * Relève les réponses. Tourne toute seule toutes les heures.
 *
 * La détection d'une réponse est certaine : on regarde si le fil contient un message
 * qui ne vient pas de nous. La LECTURE de cette réponse, elle, est une estimation —
 * d'où une colonne séparée, « Lecture auto », qui propose sans trancher. Le statut ne
 * passe à « Accepté » ou « Refusé » que si la réponse est sans ambiguïté.
 */
function verifierReponses() {
  const f = feuille_("Entreprises");
  if (f.getLastRow() < 2) return;

  const lignes = f.getRange(2, 1, f.getLastRow() - 1, NB_COLONNES).getValues();
  let nouvelles = 0;

  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    const fil = String(l[COL.fil - 1] || "");
    const statut = l[COL.statut - 1];
    if (!fil) continue;
    if (statut !== STATUTS.envoye && statut !== STATUTS.relance) continue;

    let messages;
    try { messages = GmailApp.getThreadById(fil).getMessages(); }
    catch (e) { continue; }

    const reponse = messages.filter(function (m) {
      return m.getFrom().toLowerCase().indexOf(EXPEDITEUR) === -1;
    })[0];
    if (!reponse) continue;

    const texte = reponse.getPlainBody().slice(0, 1200);
    const lecture = lire_(texte);
    const ligne = i + 2;

    f.getRange(ligne, COL.dateReponse).setValue(reponse.getDate());
    f.getRange(ligne, COL.lectureAuto).setValue(lecture.libelle);
    f.getRange(ligne, COL.reponse).setValue(extrait_(texte));
    f.getRange(ligne, COL.statut).setValue(lecture.statut);
    if (lecture.montant) f.getRange(ligne, COL.montant).setValue(lecture.montant);

    f.getRange(ligne, 1, 1, NB_COLONNES).setBackground(
      lecture.statut === STATUTS.accepte ? "#e4f0e8" :
      lecture.statut === STATUTS.refuse  ? "#f6e7e7" : "#fdf6e3");
    nouvelles++;
  }

  if (nouvelles) {
    GmailApp.sendEmail(EXPEDITEUR,
      nouvelles + " réponse" + (nouvelles > 1 ? "s" : "") + " à vos mails de prospection",
      "Le tableau a été mis à jour tout seul.\n\n" + resume_() +
      "\n\nOuvrir : " + SpreadsheetApp.getActiveSpreadsheet().getUrl());
  }
}

/** Les mots qui tranchent. Une réponse qui n'en contient aucun reste « A répondu ». */
const ACCEPTE = /\b(d'accord|ok pour|nous participons|je participe|avec plaisir|comptez sur (nous|moi)|on vous soutient|nous vous soutenons|volontiers|c'est oui|je vous fais un ch[èe]que|on prend|je prends|int[ée]ress[ée])\b/i;
const REFUSE  = /\b(ne pouvons pas|ne peux pas|n'est pas possible|pas possible|nous d[ée]clinons|je d[ée]cline|pas cette ann[ée]e|pas en mesure|budget (est )?(d[ée]j[àa] )?(boucl|[ée]puis)|malheureusement|nous ne donnons pas|aucune suite)\b/i;
const STOP    = /\b(stop|d[ée]sinscri|ne plus (me |nous )?(contacter|[ée]crire)|retirez[- ]moi|unsubscribe)\b/i;

function lire_(texte) {
  if (STOP.test(texte))
    return { statut: STATUTS.stop, libelle: "Demande à ne plus être contacté", montant: 0 };

  const oui = ACCEPTE.test(texte), non = REFUSE.test(texte);
  const somme = texte.match(/(\d{2,4})\s*(?:€|euros?)/i);
  const montant = somme ? Number(somme[1]) : 0;

  // Les deux à la fois (« d'accord mais pas cette année ») : on ne tranche pas.
  if (oui && !non) return { statut: STATUTS.accepte, libelle: "Semble accepter", montant: montant };
  if (non && !oui) return { statut: STATUTS.refuse,  libelle: "Semble refuser",  montant: 0 };
  if (montant)     return { statut: STATUTS.repondu, libelle: "Un montant est cité — à lire", montant: montant };
  return { statut: STATUTS.repondu, libelle: "À lire", montant: 0 };
}

function extrait_(texte) {
  return texte.replace(/^>.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, 300);
}

/* ══════════════════════════════════════════════════════════════════
   BILAN
   ══════════════════════════════════════════════════════════════════ */

function bilan() { SpreadsheetApp.getUi().alert(resume_()); }

function resume_() {
  const f = feuille_("Entreprises");
  if (f.getLastRow() < 2) return "Le tableau est vide.";
  const lignes = f.getRange(2, 1, f.getLastRow() - 1, NB_COLONNES).getValues();

  const n = {}; let total = 0;
  lignes.forEach(function (l) {
    const s = l[COL.statut - 1] || STATUTS.aContacter;
    n[s] = (n[s] || 0) + 1;
    if (s === STATUTS.accepte) total += Number(l[COL.montant - 1]) || 0;
  });
  const contactes = (n[STATUTS.envoye] || 0) + (n[STATUTS.relance] || 0) +
                    (n[STATUTS.repondu] || 0) + (n[STATUTS.accepte] || 0) + (n[STATUTS.refuse] || 0);
  const repondu = (n[STATUTS.repondu] || 0) + (n[STATUTS.accepte] || 0) + (n[STATUTS.refuse] || 0);

  return total + " € sur " + OBJECTIF_EUROS + " € — il reste " +
         Math.max(0, OBJECTIF_EUROS - total) + " € à lever.\n\n" +
         (n[STATUTS.accepte] || 0) + " acceptés · " + (n[STATUTS.refuse] || 0) + " refusés · " +
         (n[STATUTS.repondu] || 0) + " à lire\n" +
         contactes + " contactés · " + (n[STATUTS.aContacter] || 0) + " restent à contacter\n" +
         (contactes ? "Taux de réponse : " + Math.round((repondu / contactes) * 100) + " %" : "");
}

/* ══════════════════════════════════════════════════════════════════
   OUTILS
   ══════════════════════════════════════════════════════════════════ */

function feuille_(nom) {
  const f = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nom);
  if (!f) throw new Error("Feuille « " + nom + " » absente. Lancez « 1. Installer » d'abord.");
  return f;
}

function cle_(nom, commune) {
  return (String(nom) + "|" + String(commune)).toLowerCase().replace(/\s+/g, "");
}

function lireModeles_() {
  const m = feuille_("Modèles");
  if (m.getLastRow() < 2) return [];
  return m.getRange(2, 1, m.getLastRow() - 1, 5).getValues()
    .filter(function (l) { return l[0] && l[3]; })
    .map(function (l) {
      return { nom: l[0], cible: l[1], rang: Number(l[2]) || 0, objet: l[3], corps: l[4] };
    });
}

function choisirModele_(modeles, cible, rang) {
  const pour = modeles.filter(function (m) { return m.cible === cible; });
  const liste = pour.length ? pour : modeles;
  return liste.filter(function (m) { return m.rang === rang; })[0] || liste[0];
}

function remplir_(texte, d) {
  return String(texte || "")
    .replace(/\{\{entreprise\}\}/g, d.entreprise || "")
    .replace(/\{\{contact\}\}/g, d.contact || "Madame, Monsieur")
    .replace(/\{\{ville\}\}/g, d.ville || "");
}
