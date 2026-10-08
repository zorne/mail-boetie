# -*- coding: utf-8 -*-
"""Complète l'annuaire : commune par géocodage inverse, et nettoyage des adresses douteuses.

OSM renseigne rarement `addr:city`. On retrouve la commune à partir des coordonnées,
en un seul appel groupé à l'API Adresse de l'État. On écarte au passage les adresses
manifestement fausses — une même adresse partagée par des commerces sans lien, c'est
une extraction ratée, pas un contact.
"""
import json, re, csv, subprocess, io, collections

CAT = json.load(open("/dev/stdin")) if False else None
osm = json.load(open("/tmp/osm24.json"))["elements"]
deja = {e["n"]: e for e in json.load(open("dordogne.json"))["entreprises"]}

import importlib.util
spec = importlib.util.spec_from_file_location("c", "outils/contacts-osm.py")

CATEGORIES = {}
for ligne in open("outils/contacts-osm.py", encoding="utf-8"):
    for m in re.finditer(r'"([a-z_]+)": "([^"]+)"', ligne):
        if m.group(1) not in ("n","c","v","a","cp","tel","mail","site","source"):
            CATEGORIES[m.group(1)] = m.group(2)

def tag(e,k):
    t=e.get("tags") or {}
    return t.get(k) or t.get("contact:"+k)

fiches=[]
for e in osm:
    t=e.get("tags") or {}
    nom=t.get("name")
    cat=next((CATEGORIES[t[k]] for k in ("shop","amenity","tourism","office","craft")
              if t.get(k) in CATEGORIES), None)
    if not nom or not cat: continue
    if t.get("brand") or t.get("brand:wikidata"): continue
    nom=nom.strip()
    anc=deja.get(nom)
    lat = e.get("lat") or (e.get("center") or {}).get("lat")
    lon = e.get("lon") or (e.get("center") or {}).get("lon")
    fiches.append({"n":nom,"c":cat,"v":(t.get("addr:city") or "").strip(),
        "a":" ".join(x for x in (t.get("addr:housenumber"),t.get("addr:street")) if x).strip(),
        "cp":(t.get("addr:postcode") or "").strip(),
        "tel":(tag(e,"phone") or "").strip(),
        "mail":(anc or {}).get("mail","") or "",
        "lat":lat,"lon":lon})

# ── Adresses douteuses : partagées par plusieurs commerces, ou génériques sans domaine propre.
compte = collections.Counter(f["mail"] for f in fiches if f["mail"])
SUSPECT = re.compile(r"^(contact|info|mail|email|nom|prenom|votre|exemple|test|a)@(gmail|free|orange|wanadoo|hotmail|yahoo|outlook)\.", re.I)
retires = 0
for f in fiches:
    if f["mail"] and (compte[f["mail"]] > 1 or SUSPECT.match(f["mail"])):
        f["mail"] = ""; retires += 1
print(f"{retires} adresses douteuses écartées")

# ── Commune par géocodage inverse, en un seul appel groupé.
a_situer = [f for f in fiches if not f["v"] and f["lat"] and f["lon"]]
print(f"{len(a_situer)} commerces sans commune → géocodage inverse…", flush=True)
for debut in range(0, len(a_situer), 900):
    lot = a_situer[debut:debut+900]
    tampon = io.StringIO(); w = csv.writer(tampon)
    w.writerow(["latitude","longitude"])
    for f in lot: w.writerow([f["lat"], f["lon"]])
    open("/tmp/lot.csv","w",encoding="utf-8").write(tampon.getvalue())
    p = subprocess.run(["curl","-s","--max-time","180","-X","POST",
        "-F","data=@/tmp/lot.csv","-F","result_columns=result_city",
        "https://api-adresse.data.gouv.fr/reverse/csv/"], capture_output=True, text=True)
    if p.returncode != 0 or not p.stdout.strip(): 
        print("  lot non résolu"); continue
    for f, l in zip(lot, csv.DictReader(io.StringIO(p.stdout))):
        f["v"] = (l.get("result_city") or "").strip()

for f in fiches: f.pop("lat",None); f.pop("lon",None)
avec = [f for f in fiches if (f["mail"] or f["tel"]) and f["v"]]
avec.sort(key=lambda f:(f["v"],f["c"],f["n"]))
json.dump({"source":"OpenStreetMap (ODbL), communes via api-adresse.data.gouv.fr",
           "entreprises":avec}, open("dordogne.json","w",encoding="utf-8"),
          ensure_ascii=False, separators=(",",":"))
c = collections.Counter(f["v"] for f in avec)
print(f"\nANNUAIRE : {len(avec)} entreprises · {sum(1 for f in avec if f['mail'])} avec mail · "
      f"{sum(1 for f in avec if f['tel'])} avec téléphone · {len(c)} communes")
print("Principales :", c.most_common(10))
