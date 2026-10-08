import json, time, subprocess, urllib.parse, re, sys

CATS = [
  ("Boulangerie",["10.71C","47.24Z"]), ("Boucherie",["47.22Z"]), ("Opticien",["47.78A"]),
  ("Coiffeur",["96.02A"]), ("Pharmacie",["47.73Z"]), ("Librairie",["47.61Z","47.62Z"]),
  ("Auto-école",["85.53Z"]), ("Agence immobilière",["68.31Z"]), ("Restaurant",["56.10A"]),
  ("Imprimerie",["18.12Z"]), ("Fleuriste",["47.76Z"]), ("Magasin de sport",["47.64Z"]),
  ("Garage",["45.20A"]), ("Assurance",["66.22Z"]), ("Épicerie",["47.11B"]),
  ("Bijouterie",["47.77Z"]), ("Traiteur",["56.21Z"]), ("Hôtel",["55.10Z"]), ("Caviste",["47.25Z"]),
]
MAX_PAR_CAT, MAX_PAGES = 34, 16

def get(**kw):
    u = "https://recherche-entreprises.api.gouv.fr/search?" + urllib.parse.urlencode(kw)
    for essai in range(3):
        p = subprocess.run(["curl","-s","--max-time","30",u], capture_output=True, text=True)
        if p.returncode == 0 and p.stdout.strip().startswith("{"):
            try: return json.loads(p.stdout)
            except Exception: pass
        time.sleep(1.5)
    print("  !! échec requête", kw.get("activite_principale"), kw.get("page"), file=sys.stderr)
    return None

PETITS = {"de","du","des","la","le","les","sur","sous","en","et","au","aux","d","l","a"}
def titre(s):
    s = re.sub(r"\s+"," ",(s or "").strip())
    if not s: return ""
    out=[]
    for i,mot in enumerate(s.split(" ")):
        b = re.split(r"([-'])", mot.lower())
        b = [x if x in "-'" else (x if (i>0 and len(b)==1 and x in PETITS) else x.capitalize()) for x in b]
        out.append("".join(b))
    return " ".join(out)

vus, fiches = set(), []
for nom_cat, nafs in CATS:
    pris = 0
    for naf in nafs:
        for page in range(1, MAX_PAGES+1):
            if pris >= MAX_PAR_CAT: break
            d = get(departement="24", activite_principale=naf, per_page=25, page=page)
            if not d or not d.get("results"): break
            for r in d["results"]:
                if pris >= MAX_PAR_CAT: break
                s = r.get("siege") or {}
                if s.get("departement") != "24": continue
                if (r.get("nombre_etablissements_ouverts") or 1) > 3: continue
                if s.get("etat_administratif") != "A": continue
                if s.get("statut_diffusion_etablissement") == "P": continue
                siren = r.get("siren")
                if not siren or siren in vus: continue
                ens = (s.get("liste_enseignes") or [None])[0] or s.get("nom_commercial")
                if r.get("nature_juridique") == "1000" and not ens: continue
                brut = ens or r.get("nom_complet") or ""
                if not brut.strip(): continue
                rue = re.sub(r"\s*\d{5}\s+.*$","", s.get("adresse") or "").strip()
                vus.add(siren); pris += 1
                fiches.append({"n":titre(brut),"c":nom_cat,"v":titre(s.get("libelle_commune") or ""),
                               "a":titre(rue),"cp":s.get("code_postal") or ""})
            if len(d["results"]) < 25: break
    print(f"{nom_cat:20s}{pris:4d}", flush=True)

com={}
for f in fiches: com[f["v"]]=com.get(f["v"],0)+1
fiches.sort(key=lambda f:(f["v"],f["c"],f["n"]))
json.dump({"source":"Base SIRENE (annuaire-entreprises.data.gouv.fr)","maj":time.strftime("%Y-%m-%d"),
           "entreprises":fiches}, open("dordogne.json","w",encoding="utf-8"),
          ensure_ascii=False, separators=(",",":"))
print("\nTOTAL",len(fiches),"entreprises ·",len(com),"communes")
print("Communes:", sorted(com.items(), key=lambda x:-x[1])[:12])
