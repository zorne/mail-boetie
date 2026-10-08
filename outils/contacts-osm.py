# -*- coding: utf-8 -*-
"""Construit l'annuaire de prospection à partir d'OpenStreetMap.

OSM publie les contacts réels des commerces. On garde les indépendants — une
succursale de chaîne ne décide jamais d'un parrainage local sur place — puis on
va chercher sur leur site les adresses mail que la carte n'a pas.
"""
import json, re, subprocess, concurrent.futures as cf, sys

CATEGORIES = {
    "bakery": "Boulangerie", "butcher": "Boucherie", "optician": "Opticien",
    "hairdresser": "Coiffeur", "books": "Librairie", "florist": "Fleuriste",
    "sports": "Magasin de sport", "jewelry": "Bijouterie", "greengrocer": "Primeur",
    "convenience": "Épicerie", "supermarket": "Supérette", "car_repair": "Garage",
    "car": "Concessionnaire", "hardware": "Quincaillerie", "clothes": "Prêt-à-porter",
    "shoes": "Chaussures", "furniture": "Ameublement", "garden_centre": "Jardinerie",
    "pastry": "Pâtisserie", "deli": "Traiteur", "wine": "Caviste", "cheese": "Fromagerie",
    "seafood": "Poissonnerie", "beauty": "Institut de beauté", "photo": "Photographe",
    "bicycle": "Vélociste", "toys": "Jouets", "stationery": "Papeterie",
    "pharmacy": "Pharmacie", "restaurant": "Restaurant", "cafe": "Café",
    "bar": "Bar", "fast_food": "Restauration rapide", "driving_school": "Auto-école",
    "bank": "Banque", "fuel": "Station-service", "veterinary": "Vétérinaire",
    "hotel": "Hôtel", "guest_house": "Chambre d'hôtes", "camp_site": "Camping",
    "estate_agent": "Agence immobilière", "insurance": "Assurance",
    "accountant": "Expert-comptable", "lawyer": "Avocat", "travel_agent": "Agence de voyage",
    "carpenter": "Menuisier", "plumber": "Plombier", "electrician": "Électricien",
    "painter": "Peintre", "builder": "Maçon", "roofer": "Couvreur",
    "photographer": "Photographe", "brewery": "Brasserie", "winery": "Vigneron",
}
# Mails de siège, de plateforme ou de chaîne : inutiles pour un parrainage local.
REJET_MAIL = re.compile(
    r"(mousquetaires|carrefour|leclerc|intermarche|lidl|auchan|casino|"
    r"ca-[a-z]+\.fr|creditagricole|banquepopulaire|caisse-epargne|sg\.fr|bnpparibas|"
    r"laposte\.fr|sfr\.fr|orange\.fr$|wanadoo|sentry|wixpress|example|"
    r"\.png|\.jpg|\.gif|\.svg|\.webp)", re.I)
MAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,6}")

def tag(e, k):
    t = e.get("tags") or {}
    return t.get(k) or t.get("contact:" + k)

def categorie(t):
    for cle in ("shop", "amenity", "tourism", "office", "craft"):
        v = t.get(cle)
        if v and v in CATEGORIES: return CATEGORIES[v]
    return None

def nettoyer(m):
    m = m.strip().strip(".,;:()<>\"'").lower()
    return None if (REJET_MAIL.search(m) or len(m) > 64) else m

def mail_du_site(url):
    """Télécharge l'accueil puis la page contact, et relève la première adresse."""
    base = url.rstrip("/")
    for u in (base, base + "/contact", base + "/contacts", base + "/nous-contacter"):
        try:
            p = subprocess.run(["curl", "-sL", "--max-time", "12", "--compressed",
                                "-A", "Mozilla/5.0 (compatible; LaBoetie/1.0)", u],
                               capture_output=True, text=True, errors="ignore")
            if p.returncode != 0 or not p.stdout: continue
            html = p.stdout
            # Les mailto: sont les plus fiables : c'est une adresse volontairement publiée.
            for trouve in re.findall(r'mailto:([^"\'?>\s]+)', html) + MAIL.findall(html):
                m = nettoyer(trouve)
                if m: return m
        except Exception:
            continue
    return None

def main():
    el = json.load(open("/tmp/osm24.json"))["elements"]
    fiches, a_visiter = [], []
    for e in el:
        t = e.get("tags") or {}
        nom, cat = t.get("name"), categorie(t)
        if not nom or not cat: continue
        if t.get("brand") or t.get("brand:wikidata"): continue      # chaîne nationale
        mail = nettoyer(tag(e, "email") or "") if tag(e, "email") else None
        f = {
            "n": nom.strip(), "c": cat,
            "v": (t.get("addr:city") or "").strip(),
            "a": " ".join(x for x in (t.get("addr:housenumber"), t.get("addr:street")) if x).strip(),
            "cp": (t.get("addr:postcode") or "").strip(),
            "tel": (tag(e, "phone") or "").strip(),
            "mail": mail or "",
            "site": (tag(e, "website") or "").strip(),
        }
        fiches.append(f)
        if not f["mail"] and f["site"].startswith("http"):
            a_visiter.append(f)

    print(f"{len(fiches)} commerces indépendants · {sum(1 for f in fiches if f['mail'])} mails déjà connus")
    print(f"{len(a_visiter)} sites à visiter pour trouver les mails manquants…", flush=True)

    trouves = 0
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        for f, m in zip(a_visiter, ex.map(lambda f: mail_du_site(f["site"]), a_visiter)):
            if m: f["mail"] = m; trouves += 1
    print(f"  → {trouves} adresses supplémentaires trouvées sur les sites")

    fiches.sort(key=lambda f: (f["v"], f["c"], f["n"]))
    avec = [f for f in fiches if f["mail"] or f["tel"]]
    json.dump({"source": "OpenStreetMap (ODbL) + sites des entreprises",
               "entreprises": avec},
              open("/Users/admin/mail-boetie/dordogne.json", "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    print(f"\nANNUAIRE : {len(avec)} entreprises joignables "
          f"({sum(1 for f in avec if f['mail'])} par mail, {sum(1 for f in avec if f['tel'])} par téléphone)")

main()
