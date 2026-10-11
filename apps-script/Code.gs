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
// Le mail du camarade est demandé à l'installation : une constante vide ici
// resterait vide, et il ne recevrait jamais rien.
function enCopie_() {
  return PropertiesService.getScriptProperties().getProperty("camarade") || "";
}
const OBJECTIF_EUROS  = 1500;

const MAX_PAR_JOUR    = 35;   // Au-delà, Gmail classe les envois en indésirables.
const DELAI_RELANCE   = 5;    // Jours sans réponse avant la première relance.
const MAX_RELANCES    = 2;    // Après ça, on arrête. Insister dessert.
const JOURS_OUVRES    = true; // Pas d'envoi automatique le week-end.

const DEPOT = "https://raw.githubusercontent.com/zorne/mail-boetie/main/";

const COL = {
  nom: 1, categorie: 2, commune: 3, adresse: 4, telephone: 5, email: 6, type: 7,
  statut: 8, dateEnvoi: 9, relances: 10, dateReponse: 11, lectureAuto: 12,
  reponse: 13, montant: 14, fil: 15,
};
const NB_COLONNES = 15;

const STATUTS = {
  aContacter: "À contacter",
  aAppeler: "À appeler",
  envoye: "Envoyé",
  relance: "Relancé",
  repondu: "A répondu",
  accepte: "Accepté",
  refuse: "Refusé",
  invalide: "Adresse invalide",
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
    .addItem("S'envoyer un mail d'essai", "mailDEssai")
    .addItem("Simuler le lot du jour (sans envoyer)", "simulerLot")
    .addSeparator()
    .addItem("Envoyer le lot du jour", "envoyerLot")
    .addItem("Relever les réponses maintenant", "releverMaintenant")
    .addItem("Envoyer les relances dues", "relancerMaintenant")
    .addSeparator()
    .addItem("Préparer 15 appels", "preparerAppels")
    .addItem("Mettre à jour le tableau de bord", "tableauDeBord")
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
      "Entreprise", "Catégorie", "Commune", "Adresse", "Téléphone", "Adresse mail", "Type",
      "Statut", "Envoyé le", "Relances", "Répondu le", "Lecture auto",
      "Extrait de la réponse", "Montant (€)", "Fil Gmail",
    ]);
    f.getRange(1, 1, 1, NB_COLONNES).setFontWeight("bold").setBackground("#efefed");
    f.setFrozenRows(1);
    f.setColumnWidth(COL.reponse, 320);
    liste_(f, COL.statut, Object.keys(STATUTS).map(function (k) { return STATUTS[k]; }));
    liste_(f, COL.type, ["Nouveau", "Ancien partenaire"]);
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
  ScriptApp.newTrigger("tableauDeBord").timeBased().everyHours(4).create();

  const r = SpreadsheetApp.getUi().prompt(
    "Mail de votre camarade",
    "Pour qu'il reçoive aussi les alertes de réponse. Laissez vide si vous préférez.",
    SpreadsheetApp.getUi().ButtonSet.OK_CANCEL);
  const adresse = String(r.getResponseText() || "").trim();
  if (adresse.indexOf("@") !== -1) {
    PropertiesService.getScriptProperties().setProperty("camarade", adresse);
  }
  tableauDeBord();

  SpreadsheetApp.getUi().alert(
    "Installé.\n\n" +
    "Les réponses sont désormais relevées toutes les heures, et les relances partent " +
    "chaque matin à 9 h, automatiquement.\n\n" +
    "Étape suivante : « 2. Importer l'annuaire de Dordogne »."
  );
}

function liste_(f, colonne, valeurs) {
  f.getRange(2, colonne, f.getMaxRows() - 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(valeurs, true).build());
}

/* ══════════════════════════════════════════════════════════════════
   IMPORT DE L'ANNUAIRE
   ══════════════════════════════════════════════════════════════════ */

function importerAnnuaire() {
  const f = feuille_("Entreprises");
  const deja = {}, mailsPris = {};
  if (f.getLastRow() > 1) {
    f.getRange(2, 1, f.getLastRow() - 1, NB_COLONNES).getValues().forEach(function (l) {
      deja[cle_(l[COL.nom - 1], l[COL.commune - 1])] = true;
      const e = String(l[COL.email - 1] || "").toLowerCase();
      if (e) mailsPris[e] = true;
    });
  }

  let data;
  try {
    data = JSON.parse(UrlFetchApp.fetch(DEPOT + "dordogne.json").getContentText());
  } catch (e) {
    SpreadsheetApp.getUi().alert(
      "L'annuaire n'a pas pu être téléchargé.\n\n" +
      "Vérifiez votre connexion, puis réessayez. Détail : " + e.message);
    return;
  }
  const lignes = [];
  data.entreprises.forEach(function (e) {
    if (!e.mail && !e.tel) return;                       // injoignable : inutile en base
    if (deja[cle_(e.n, e.v)]) return;
    // Deux commerces d'un même propriétaire partagent souvent une adresse. On ne la
    // garde qu'une fois : recevoir deux fois le même mail, c'est se faire signaler.
    const mail = String(e.mail || "").toLowerCase();
    if (mail && mailsPris[mail]) return;
    if (mail) mailsPris[mail] = true;
    deja[cle_(e.n, e.v)] = true;
    lignes.push([
      e.n, e.c, e.v || "", e.a || "", e.tel || "", e.mail || "", "Nouveau",
      // ⚠️ 60 % de l'annuaire n'a QUE le téléphone. Les laisser en « À contacter » les
      // ferait attendre un mail qui ne partira jamais, et on les croirait traités.
      e.mail ? STATUTS.aContacter : STATUTS.aAppeler, "", 0, "", "", "", "", "",
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
    avecMail + " ont une adresse mail : elles passent en « À contacter ».\n" +
    (lignes.length - avecMail) + " n'ont qu'un téléphone : elles passent en « À appeler ».\n" +
    "Le téléphone convertit quatre à cinq fois mieux — ne les négligez pas.\n\n" +
    "Vos anciens partenaires : ajoutez-les à la main et mettez « Ancien partenaire » " +
    "dans la colonne Type. Ils recevront vos modèles de relance, pas ceux de prospection."
  );
}

function importerModeles_() {
  const m = feuille_("Modèles");
  const data = JSON.parse(UrlFetchApp.fetch(DEPOT + "modeles.json").getContentText());
  const compteurs = { nouveau: 0, ancien: 0 };
  const lignes = data.modeles.map(function (x) {
    const pour = x.cible === "ancien" ? "ancien" : "nouveau";
    // Le rang est l'ordre d'usage : 0 premier contact, 1 première relance, 2 la dernière.
    const rang = compteurs[pour]++;
    return [x.nom, pour, rang, x.objet, x.corps];
  });
  if (lignes.length) m.getRange(2, 1, lignes.length, 5).setValues(lignes);
}

/* ══════════════════════════════════════════════════════════════════
   ENVOI
   ══════════════════════════════════════════════════════════════════ */

function envoyerLot()       { dire_(envoyer_(false)); }
function relancerMaintenant() { dire_(envoyer_(true)); }
function envoyerRelances()  { if (ouvrable_()) envoyer_(true); }   // déclencheur quotidien

function dire_(n) {
  SpreadsheetApp.getUi().alert(
    n === 0
      ? "Aucun envoi.\n\nSoit tout est déjà contacté, soit le plafond du jour (" +
        MAX_PAR_JOUR + " mails) est atteint."
      : n + " mail" + (n > 1 ? "s" : "") + " envoyé" + (n > 1 ? "s" : "") + ".\n\n" +
        "Les réponses seront relevées toutes les heures. Vous n'avez rien à saisir."
  );
}

function ouvrable_() {
  if (!JOURS_OUVRES) return true;
  const j = new Date().getDay();
  return j !== 0 && j !== 6;
}

/**
 * Le compteur du jour, gardé entre deux exécutions.
 *
 * ⚠️ SANS LUI, LE PLAFOND NE PLAFONNE RIEN. Cliquer cinq fois « Envoyer le lot »
 * enverrait cinq fois trente-cinq mails — et la boîte serait grillée le premier jour,
 * sans que rien ne le signale.
 */
function compteur_() {
  const p = PropertiesService.getScriptProperties();
  const cle = "envois_" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  return {
    reste: function () {
      return Math.min(MAX_PAR_JOUR - Number(p.getProperty(cle) || 0),
                      MailApp.getRemainingDailyQuota());
    },
    ajouter: function (n) { p.setProperty(cle, String(Number(p.getProperty(cle) || 0) + n)); },
  };
}

/**
 * Envoie un lot. `relance` à vrai ne reprend que les entreprises déjà contactées,
 * restées sans réponse depuis plus de DELAI_RELANCE jours.
 */
/**
 * Qui recevrait quoi, et avec quel modèle.
 *
 * ⚠️ UNE SEULE SÉLECTION POUR LA SIMULATION ET POUR L'ENVOI. Deux fonctions séparées
 * finiraient par diverger, et la simulation annoncerait autre chose que ce qui part.
 */
function prochainLot_(relance) {
  const f = feuille_("Entreprises");
  if (f.getLastRow() < 2) return [];
  const lignes = f.getRange(2, 1, f.getLastRow() - 1, NB_COLONNES).getValues();
  const modeles = lireModeles_();
  if (!modeles.length) return [];

  const plafond = compteur_().reste();
  const maintenant = new Date();
  const dejaEcrit = {};
  const lot = [];

  for (let i = 0; i < lignes.length && lot.length < plafond; i++) {
    const l = lignes[i];
    const statut = l[COL.statut - 1];
    const email = String(l[COL.email - 1] || "").trim().toLowerCase();
    if (!email || email.indexOf("@") === -1 || dejaEcrit[email]) continue;

    let rang = 0;
    if (relance) {
      if (statut !== STATUTS.envoye && statut !== STATUTS.relance) continue;
      const faites = Number(l[COL.relances - 1]) || 0;
      if (faites >= MAX_RELANCES) continue;
      const envoye = l[COL.dateEnvoi - 1];
      if (!(envoye instanceof Date)) continue;
      if ((maintenant - envoye) / 86400000 < DELAI_RELANCE) continue;
      rang = faites + 1;
    } else {
      if (statut !== STATUTS.aContacter) continue;
    }

    const pour = String(l[COL.type - 1]).indexOf("ncien") !== -1 ? "ancien" : "nouveau";
    const modele = choisirModele_(modeles, pour, rang);
    if (!modele) continue;

    const d = { entreprise: l[COL.nom - 1], ville: l[COL.commune - 1], contact: "Madame, Monsieur" };
    dejaEcrit[email] = true;
    lot.push({
      ligne: i + 2, nom: l[COL.nom - 1], email: email, modele: modele.nom,
      relances: Number(l[COL.relances - 1]) || 0,
      objet: remplir_(modele.objet, d),
      corps: remplir_(modele.corps, d) + PIED_DE_MAIL,
    });
  }
  return lot;
}

/** Envoie le lot que `prochainLot_` a composé. */
function envoyer_(relance) {
  const f = feuille_("Entreprises");
  const budget = compteur_();
  const maintenant = new Date();
  let envoyes = 0;

  prochainLot_(relance).forEach(function (x) {
    if (budget.reste() <= 0) return;
    try {
      // createDraft().send() rend le message envoyé : c'est de lui qu'on tire
      // l'identifiant du fil, et c'est cet identifiant qui rend le suivi possible.
      const message = GmailApp.createDraft(x.email, x.objet, x.corps, {
        name: NOM_EXPEDITEUR, replyTo: EXPEDITEUR,
      }).send();

      f.getRange(x.ligne, COL.statut).setValue(relance ? STATUTS.relance : STATUTS.envoye);
      f.getRange(x.ligne, COL.dateEnvoi).setValue(maintenant);
      f.getRange(x.ligne, COL.relances).setValue(x.relances + (relance ? 1 : 0));
      f.getRange(x.ligne, COL.fil).setValue(message.getThread().getId());
      envoyes++;
      budget.ajouter(1);
      Utilities.sleep(1500);   // On n'envoie pas en rafale : c'est le premier signal de spam.
    } catch (e) {
      f.getRange(x.ligne, COL.reponse).setValue("Échec de l'envoi : " + e.message);
    }
  });
  return envoyes;
}

const PIED_DE_MAIL =
  "\n\n—\nAssociation La Boétie · " + EXPEDITEUR +
  "\nSi vous ne souhaitez plus recevoir de message de notre part, répondez « STOP » " +
  "à ce mail et nous vous retirerons de notre liste.";

/* ══════════════════════════════════════════════════════════════════
   SUIVI DES RÉPONSES — le cœur de l'affaire
   ══════════════════════════════════════════════════════════════════ */

function releverMaintenant() {
  const n = verifierReponses();
  SpreadsheetApp.getUi().alert(
    n === 0 ? "Aucune réponse nouvelle." :
    n + " réponse" + (n > 1 ? "s" : "") + " relevée" + (n > 1 ? "s" : "") + ".\n\n" + resume_());
}

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
  if (f.getLastRow() < 2) return 0;

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

    const ligne = i + 2;

    // ⚠️ UN REBOND N'EST PAS UNE RÉPONSE. Sans ce test, une adresse morte serait
    // comptée comme « a répondu » — et on croirait avoir touché quelqu'un.
    if (estUnRebond_(reponse)) {
      f.getRange(ligne, COL.statut).setValue(STATUTS.invalide);
      f.getRange(ligne, COL.lectureAuto).setValue("Adresse morte — le mail est revenu");
      f.getRange(ligne, 1, 1, NB_COLONNES).setBackground("#f0f0ee");
      continue;
    }

    const texte = sansCitation_(reponse.getPlainBody());
    const lecture = lire_(texte);

    f.getRange(ligne, COL.dateReponse).setValue(reponse.getDate());
    f.getRange(ligne, COL.lectureAuto).setValue(lecture.libelle);
    f.getRange(ligne, COL.reponse).setValue(texte.replace(/\s+/g, " ").trim().slice(0, 300));
    f.getRange(ligne, COL.statut).setValue(lecture.statut);
    if (lecture.montant) f.getRange(ligne, COL.montant).setValue(lecture.montant);

    f.getRange(ligne, 1, 1, NB_COLONNES).setBackground(
      lecture.statut === STATUTS.accepte ? "#e4f0e8" :
      lecture.statut === STATUTS.refuse  ? "#f6e7e7" : "#fdf6e3");
    nouvelles++;
  }

  if (nouvelles) {
    const copie = enCopie_();
    const pour = EXPEDITEUR + (copie ? "," + copie : "");
    GmailApp.sendEmail(pour,
      nouvelles + " réponse" + (nouvelles > 1 ? "s" : "") + " à vos mails de prospection",
      "Le tableau a été mis à jour tout seul.\n\n" + resume_() +
      "\n\nOuvrir : " + SpreadsheetApp.getActiveSpreadsheet().getUrl());
  }
  return nouvelles;
}

function estUnRebond_(message) {
  const de = message.getFrom().toLowerCase();
  if (/mailer-daemon|postmaster|no-?reply@google|mail delivery/i.test(de)) return true;
  return /delivery status notification|adresse introuvable|address not found|undeliverable|destinataire inconnu/i
    .test(message.getSubject() + " " + message.getPlainBody().slice(0, 400));
}

/**
 * Retire le mail d'origine cité sous la réponse.
 *
 * ⚠️ SANS CELA, LA LECTURE PORTE SUR NOTRE PROPRE TEXTE. Notre mail énumère
 * « 50 € / 100 € / 150 € » : le montant lu serait 50 à chaque fois, pour tout le monde.
 */
function sansCitation_(corps) {
  const coupures = [
    /^\s*Le .{0,80}a [ée]crit\s*:/m,
    /^\s*On .{0,80}wrote\s*:/m,
    /^\s*-{2,}\s*Message d'origine/mi,
    /^\s*De\s*:.*$/m,
    /^\s*>/m,
  ];
  let fin = corps.length;
  coupures.forEach(function (r) {
    const m = r.exec(corps);
    if (m && m.index < fin) fin = m.index;
  });
  return corps.slice(0, fin).slice(0, 1500);
}

/** Les mots qui tranchent. Une réponse qui n'en contient aucun reste « A répondu ». */
const ACCEPTE = /\b(d'accord|ok pour|nous participons|je participe|avec plaisir|comptez sur (nous|moi)|on vous soutient|nous vous soutenons|volontiers|c'est oui|je vous fais un ch[èe]que|on prend|je prends|int[ée]ress[ée])/i;
const REFUSE  = /\b(ne pouvons pas|ne peux pas|n'est pas possible|pas possible|d[ée]clinons|je d[ée]cline|pas cette ann[ée]e|pas en mesure|budget (est )?(d[ée]j[àa] )?(boucl|[ée]puis)|nous ne donnons pas|aucune suite|sans suite|non merci|pas int[ée]ress[ée]|ne souhaitons pas|ne souhaite pas|pas d'accord|refus[ée]?)/i;
const STOP    = /\b(stop|d[ée]sinscri|ne plus (me |nous )?(contacter|[ée]crire)|retirez[- ]moi|unsubscribe)/i;
/** Ce qui retourne le sens d'une tournure positive placée juste après. */
const NEGATION = /\b(pas|jamais|aucun|ne|n'|non|sans|malheureusement|d[ée]sol[ée]s?)\b[^.!?]{0,30}$/i;

function lire_(texte) {
  if (STOP.test(texte))
    return { statut: STATUTS.stop, libelle: "Demande à ne plus être contacté", montant: 0 };

  // ⚠️ « PAS INTÉRESSÉ » CONTIENT « INTÉRESSÉ ». Sans ce contrôle de la négation qui
  // précède, un refus net serait compté comme un accord — et le total affiché serait faux.
  const m = ACCEPTE.exec(texte);
  const oui = m ? !NEGATION.test(texte.slice(Math.max(0, m.index - 40), m.index)) : false;
  const non = REFUSE.test(texte);

  const somme = texte.match(/(\d{2,4})\s*(?:€|euros?\b)/i);
  const montant = somme && Number(somme[1]) <= 2000 ? Number(somme[1]) : 0;

  // Les deux à la fois (« d'accord mais pas cette année ») : on ne tranche pas.
  if (oui && !non) return { statut: STATUTS.accepte, libelle: "Semble accepter", montant: montant };
  if (non && !oui) return { statut: STATUTS.refuse,  libelle: "Semble refuser",  montant: 0 };
  if (montant)     return { statut: STATUTS.repondu, libelle: "Un montant est cité — à lire", montant: montant };
  return { statut: STATUTS.repondu, libelle: "À lire", montant: 0 };
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
  const joint = (n[STATUTS.envoye] || 0) + (n[STATUTS.relance] || 0) + (n[STATUTS.repondu] || 0) +
                (n[STATUTS.accepte] || 0) + (n[STATUTS.refuse] || 0);
  const repondu = (n[STATUTS.repondu] || 0) + (n[STATUTS.accepte] || 0) + (n[STATUTS.refuse] || 0);

  return total + " € sur " + OBJECTIF_EUROS + " € — il reste " +
    Math.max(0, OBJECTIF_EUROS - total) + " € à lever.\n\n" +
    (n[STATUTS.accepte] || 0) + " acceptés · " + (n[STATUTS.refuse] || 0) + " refusés · " +
    (n[STATUTS.repondu] || 0) + " à lire\n" +
    joint + " contactés · " + (n[STATUTS.aContacter] || 0) + " restent à contacter" +
    ((n[STATUTS.invalide] || 0) ? " · " + n[STATUTS.invalide] + " adresses mortes" : "") + "\n" +
    (joint ? "Taux de réponse : " + Math.round((repondu / joint) * 100) + " %" : "");
}


/* ══════════════════════════════════════════════════════════════════
   AVANT LE PREMIER ENVOI — essai et simulation
   ══════════════════════════════════════════════════════════════════ */

/**
 * S'envoie à soi-même le mail exact qu'une entreprise recevrait.
 *
 * ⚠️ À FAIRE AVANT LE PREMIER LOT. Une coquille dans un modèle, un {{entreprise}} mal
 * écrit, une signature oubliée : ça part trente-cinq fois et ça ne se rattrape pas.
 */
function mailDEssai() {
  const f = feuille_("Entreprises");
  const modeles = lireModeles_();
  if (!modeles.length) { alerte_("Aucun modèle. Lancez « 1. Installer » d'abord."); return; }

  const exemple = f.getLastRow() > 1
    ? f.getRange(2, 1, f.getLastRow() - 1, NB_COLONNES).getValues()
        .filter(function (l) { return l[COL.email - 1]; })[0]
    : null;
  const d = exemple
    ? { entreprise: exemple[COL.nom - 1], ville: exemple[COL.commune - 1], contact: "Madame, Monsieur" }
    : { entreprise: "Boulangerie du Marché", ville: "Périgueux", contact: "Madame, Monsieur" };

  const m = choisirModele_(modeles, "nouveau", 0);
  GmailApp.sendEmail(EXPEDITEUR, "[ESSAI] " + remplir_(m.objet, d),
    "Ceci est un essai. Le texte ci-dessous est exactement ce que recevrait " +
    d.entreprise + ".\n\n────────────────────\n\n" +
    remplir_(m.corps, d) + PIED_DE_MAIL,
    { name: NOM_EXPEDITEUR, replyTo: EXPEDITEUR });

  alerte_("Essai envoyé à " + EXPEDITEUR + ".\n\n" +
    "Relisez-le dans votre boîte : orthographe, ton, signature, et surtout que le nom de " +
    "l'entreprise apparaisse bien. Corrigez l'onglet « Modèles » si besoin.");
}

/** Montre qui recevrait quoi, sans rien envoyer. */
function simulerLot() {
  const lot = prochainLot_(false);
  if (!lot.length) { alerte_("Aucun envoi prévu.\n\nTout est contacté, ou le plafond du jour est atteint."); return; }
  const apercu = lot.slice(0, 12).map(function (x) {
    return "· " + x.nom + "  (" + x.email + ")\n     → " + x.modele;
  }).join("\n");
  alerte_(lot.length + " mail" + (lot.length > 1 ? "s partiraient" : " partirait") +
    " si vous lanciez le lot :\n\n" + apercu +
    (lot.length > 12 ? "\n\n…et " + (lot.length - 12) + " autres." : "") +
    "\n\nRien n'a été envoyé.");
}

/* ══════════════════════════════════════════════════════════════════
   LE TÉLÉPHONE — 60 % de l'annuaire
   ══════════════════════════════════════════════════════════════════ */

/**
 * Remonte quinze entreprises à appeler en tête du tableau.
 *
 * ⚠️ LE TÉLÉPHONE N'EST PAS LE PARENT PAUVRE. Six fiches sur dix n'ont pas d'adresse
 * mail, et un appel convertit quatre à cinq fois mieux qu'un envoi. Les ignorer, c'est
 * se priver de la majorité de l'annuaire et du meilleur canal.
 */
function preparerAppels() {
  const f = feuille_("Entreprises");
  if (f.getLastRow() < 2) { alerte_("Le tableau est vide."); return; }
  const lignes = f.getRange(2, 1, f.getLastRow() - 1, NB_COLONNES).getValues();

  const liste = [];
  for (let i = 0; i < lignes.length && liste.length < 15; i++) {
    const l = lignes[i];
    if (l[COL.statut - 1] !== STATUTS.aAppeler) continue;
    if (!String(l[COL.telephone - 1] || "").trim()) continue;
    if (l[COL.dateEnvoi - 1] instanceof Date) continue;      // déjà appelé
    liste.push({ ligne: i + 2, nom: l[COL.nom - 1], tel: l[COL.telephone - 1],
                 cat: l[COL.categorie - 1], ville: l[COL.commune - 1] });
  }
  if (!liste.length) { alerte_("Plus personne à appeler dans cette liste."); return; }

  liste.forEach(function (x) { f.getRange(x.ligne, 1, 1, NB_COLONNES).setBackground("#e8eef7"); });
  alerte_("Vos " + liste.length + " appels du jour, surlignés en bleu dans le tableau :\n\n" +
    liste.map(function (x) {
      return "· " + x.nom + " — " + x.tel + "\n     " + x.cat + ", " + x.ville;
    }).join("\n") +
    "\n\nAprès chaque appel, changez le statut de la ligne. La date se met toute seule.");
}

/* ══════════════════════════════════════════════════════════════════
   TABLEAU DE BORD
   ══════════════════════════════════════════════════════════════════ */

/** Écrit l'état du financement dans un onglet, rafraîchi toutes les quatre heures. */
function tableauDeBord() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  let b = classeur.getSheetByName("Tableau de bord");
  if (!b) { b = classeur.insertSheet("Tableau de bord", 0); }

  const c = chiffres_();
  b.clear();
  b.getRange("A1").setValue("La Boétie — où en est le financement")
    .setFontSize(16).setFontWeight("bold");
  b.getRange("A2").setValue("Mis à jour le " +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "d MMMM yyyy 'à' HH:mm"))
    .setFontColor("#777777");

  const lignes = [
    ["Promesses obtenues", c.total + " €"],
    ["Objectif", OBJECTIF_EUROS + " €"],
    ["Reste à lever", Math.max(0, OBJECTIF_EUROS - c.total) + " €"],
    ["", ""],
    ["Partenaires acquis", c.accepte],
    ["Refus", c.refuse],
    ["Réponses à lire", c.repondu],
    ["", ""],
    ["Mails envoyés", c.joint],
    ["Taux de réponse", c.joint ? Math.round((c.reponses / c.joint) * 100) + " %" : "—"],
    ["Taux d'accord", c.reponses ? Math.round((c.accepte / c.reponses) * 100) + " %" : "—"],
    ["", ""],
    ["Restent à contacter par mail", c.aContacter],
    ["Restent à appeler", c.aAppeler],
    ["Adresses mortes", c.invalide],
  ];
  b.getRange(4, 1, lignes.length, 2).setValues(lignes);
  b.getRange(4, 1, 3, 1).setFontWeight("bold");
  b.getRange(4, 2, 3, 1).setFontWeight("bold").setFontSize(13);
  b.setColumnWidth(1, 240); b.setColumnWidth(2, 130);

  // Combien d'entreprises il reste à démarcher pour atteindre l'objectif, au rythme constaté.
  const manque = Math.max(0, OBJECTIF_EUROS - c.total);
  const panier = c.accepte ? c.total / c.accepte : 85;
  const tauxAccord = c.reponses ? c.accepte / c.joint : 0.06;
  const aFaire = tauxAccord > 0 ? Math.ceil((manque / panier) / tauxAccord) : 0;
  b.getRange(4 + lignes.length + 1, 1).setValue(
    manque === 0 ? "Objectif atteint."
    : c.joint < 10 ? "Trop tôt pour projeter : il faut une dizaine de contacts pour un taux fiable."
    : "Au rythme actuel, il reste environ " + aFaire + " entreprises à démarcher."
  ).setFontStyle("italic").setFontColor("#555555");
}

function chiffres_() {
  const f = feuille_("Entreprises");
  const c = { total: 0, accepte: 0, refuse: 0, repondu: 0, aContacter: 0,
              aAppeler: 0, invalide: 0, joint: 0, reponses: 0 };
  if (f.getLastRow() < 2) return c;
  f.getRange(2, 1, f.getLastRow() - 1, NB_COLONNES).getValues().forEach(function (l) {
    const s = l[COL.statut - 1] || STATUTS.aContacter;
    if (s === STATUTS.accepte)        { c.accepte++; c.total += Number(l[COL.montant - 1]) || 0; }
    else if (s === STATUTS.refuse)     c.refuse++;
    else if (s === STATUTS.repondu)    c.repondu++;
    else if (s === STATUTS.aContacter) c.aContacter++;
    else if (s === STATUTS.aAppeler)   c.aAppeler++;
    else if (s === STATUTS.invalide)   c.invalide++;
  });
  c.reponses = c.accepte + c.refuse + c.repondu;
  c.joint = c.reponses + compter_(f, [STATUTS.envoye, STATUTS.relance]);
  return c;
}

function compter_(f, statuts) {
  if (f.getLastRow() < 2) return 0;
  return f.getRange(2, COL.statut, f.getLastRow() - 1, 1).getValues()
    .filter(function (l) { return statuts.indexOf(l[0]) !== -1; }).length;
}

function alerte_(texte) { SpreadsheetApp.getUi().alert(texte); }

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
      return { nom: l[0], cible: String(l[1]).indexOf("ncien") !== -1 ? "ancien" : "nouveau",
               rang: Number(l[2]) || 0, objet: l[3], corps: l[4] };
    });
}

/** Le bon modèle, et à défaut le plus proche : jamais rien plutôt que le mauvais ton. */
function choisirModele_(modeles, cible, rang) {
  const pour = modeles.filter(function (m) { return m.cible === cible; });
  const liste = pour.length ? pour : modeles;
  liste.sort(function (a, b) { return a.rang - b.rang; });
  for (let r = rang; r >= 0; r--) {
    const trouve = liste.filter(function (m) { return m.rang === r; })[0];
    if (trouve) return trouve;
  }
  return liste[liste.length - 1] || null;
}

function remplir_(texte, d) {
  return String(texte || "")
    .replace(/\{\{entreprise\}\}/g, d.entreprise || "")
    .replace(/\{\{contact\}\}/g, d.contact || "Madame, Monsieur")
    .replace(/\{\{ville\}\}/g, d.ville || "");
}
