# -*- coding: utf-8 -*-
"""Vérifie que les domaines des adresses mail acceptent bien du courrier.

Un domaine sans enregistrement MX ne peut RIEN recevoir : le mail rebondit
immédiatement. Quelques dizaines de rebonds suffisent à faire classer tous les
envois suivants en indésirables — et plus rien n'arrive, sans que personne ne le
voie. Autant les écarter avant d'envoyer plutôt qu'après.
"""
import json, subprocess, concurrent.futures as cf, collections, re

fiches = json.load(open("dordogne.json", encoding="utf-8"))
liste = fiches["entreprises"]
domaines = sorted({e["mail"].split("@")[-1] for e in liste if "@" in (e["mail"] or "")})
print(f"{len(domaines)} domaines à vérifier…", flush=True)

def accepte_du_courrier(d):
    try:
        p = subprocess.run(["dig", "+short", "+time=3", "+tries=1", "MX", d],
                           capture_output=True, text=True, timeout=12)
        if p.stdout.strip(): return True
        # Sans MX, un domaine peut encore recevoir via son adresse A (RFC 5321).
        p = subprocess.run(["dig", "+short", "+time=3", "+tries=1", "A", d],
                           capture_output=True, text=True, timeout=12)
        return bool(p.stdout.strip())
    except Exception:
        return True            # Dans le doute on garde : mieux vaut un rebond qu'un contact perdu.

with cf.ThreadPoolExecutor(max_workers=20) as ex:
    etat = dict(zip(domaines, ex.map(accepte_du_courrier, domaines)))

morts = [d for d, ok in etat.items() if not ok]
retires = 0
for e in liste:
    d = (e["mail"] or "").split("@")[-1]
    if d and not etat.get(d, True):
        e["mail"] = ""; retires += 1

garde = [e for e in liste if e["mail"] or e["tel"]]
fiches["entreprises"] = garde
json.dump(fiches, open("dordogne.json", "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))

print(f"{len(morts)} domaines ne reçoivent pas de courrier : {', '.join(morts[:8])}"
      + (" …" if len(morts) > 8 else ""))
print(f"{retires} adresses retirées · annuaire : {len(garde)} entreprises, "
      f"{sum(1 for e in garde if e['mail'])} avec mail, {sum(1 for e in garde if e['tel'])} avec téléphone")
