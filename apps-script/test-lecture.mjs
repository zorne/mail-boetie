/**
 * Éprouve la lecture automatique des réponses.
 *
 * ⚠️ CE TEST GARDE LE CHIFFRE AFFICHÉ EN HAUT DU TABLEAU. Une réponse mal lue, et le
 * total des promesses est faux — sans que rien ne le signale. Le piège est réel : « pas
 * intéressé » CONTIENT « intéressé », et sans contrôle de la négation un refus net était
 * compté comme un accord.
 *
 * À lancer depuis la racine du dépôt, après toute retouche des expressions :
 *     node apps-script/test-lecture.mjs
 */
import fs from "node:fs";
const src = fs.readFileSync("apps-script/Code.gs", "utf8");

// On évalue les expressions telles qu'elles sont DANS le script, pas une recopie :
// une copie finirait par diverger de ce qui tourne réellement.
function pick(nom) {
  const m = src.match(new RegExp("^const " + nom + "\\s*=\\s*(/[\\s\\S]*?/i);", "m"));
  if (!m) throw new Error("expression " + nom + " introuvable");
  return eval(m[1]);
}
const ACCEPTE = pick("ACCEPTE"), REFUSE = pick("REFUSE"),
      STOP = pick("STOP"), NEGATION = pick("NEGATION");

function lire(t) {
  if (STOP.test(t)) return "STOP";
  const m = ACCEPTE.exec(t);
  const oui = m ? !NEGATION.test(t.slice(Math.max(0, m.index - 40), m.index)) : false;
  const non = REFUSE.test(t);
  const s = t.match(/(\d{2,4})\s*(?:€|euros?\b)/i);
  const montant = s && Number(s[1]) <= 2000 ? Number(s[1]) : 0;
  if (oui && !non) return "ACCEPTE" + (montant ? " " + montant + "€" : "");
  if (non && !oui) return "REFUSE";
  if (montant) return "A LIRE (" + montant + "€)";
  return "A LIRE";
}

const cas = [
  ["Bonjour, nous ne sommes pas intéressés. Cordialement.",            "REFUSE"],
  ["Je ne suis pas d'accord avec cette démarche.",                     "REFUSE"],
  ["Bonjour, c'est d'accord pour 100 €. Passez à la boutique.",        "ACCEPTE 100€"],
  ["Avec plaisir ! Comptez sur nous pour 50 euros.",                   "ACCEPTE 50€"],
  ["Malheureusement notre budget est déjà bouclé cette année.",        "REFUSE"],
  ["D'accord sur le principe mais pas cette année.",                   "A LIRE"],
  ["Merci de votre message, je transmets à ma direction.",             "A LIRE"],
  ["Non merci.",                                                       "REFUSE"],
  ["STOP",                                                             "STOP"],
  ["Merci de ne plus nous contacter.",                                 "STOP"],
  ["Volontiers, je vous fais un chèque de 150 euros.",                 "ACCEPTE 150€"],
  ["Nous ne souhaitons pas donner suite.",                             "REFUSE"],
  ["Pouvez-vous repasser en septembre ?",                              "A LIRE"],
  ["Je prends la formule à 150 euros, envoyez la facture.",            "ACCEPTE 150€"],
];

let ko = 0;
for (const [t, attendu] of cas) {
  const r = lire(t), ok = r === attendu;
  if (!ok) ko++;
  console.log((ok ? "  ok   " : "  RATÉ "), r.padEnd(16), "|", t.slice(0, 54),
              ok ? "" : "   (attendu : " + attendu + ")");
}
console.log("\n" + (cas.length - ko) + "/" + cas.length + " cas corrects");
