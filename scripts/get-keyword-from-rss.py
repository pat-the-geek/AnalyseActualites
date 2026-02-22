"""
Script : get-keyword-from-rss.py

Pour chaque flux RSS dans Reeder.opml :
- Consulte le flux RSS (xmlUrl)
- Pour chaque article publié il y a moins d'une semaine :
    - Si le titre contient un mot-clé de keyword-to-search.json :
        - Enregistre l'URL dans un fichier JSON nommé par mot-clé (sans doublon)
        - Format de sortie = articles_generated_YYYY-MM-DD_YYYY-MM-DD.json
        - Résumé généré par IA EurIA (Qwen3)
        - Images extraites selon la méthode du projet
        - Clés : Date de publication, Sources, URL, Résumé, Images
        - Fichiers créés dans data/articles-from-rss/
"""


import os
import re
import sys
import json
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path

# Ajout du dossier racine au sys.path pour les imports relatifs (utils.*)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from utils.api_client import EurIAClient
from utils.http_utils import fetch_and_extract_text, extract_top_n_largest_images
from utils.logging import print_console

# Constantes

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OPML_PATH = PROJECT_ROOT / "data/Reeder.opml"
KEYWORDS_PATH = PROJECT_ROOT / "config/keyword-to-search.json"
OUTPUT_DIR = PROJECT_ROOT / "data/articles-from-rss"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Fenêtre temporelle : 7 derniers jours
now = datetime.utcnow()
one_week_ago = now - timedelta(days=7)

one_week_ago = now - timedelta(days=7)

# Charger les mots-clés (objets complets pour accéder aux collections or/and)
print_console("Chargement des mots-clés depuis keyword-to-search.json...")
with open(KEYWORDS_PATH, "r", encoding="utf-8") as f:
    keywords = json.load(f)
print_console(f"{len(keywords)} mots-clés chargés : {[k['keyword'] for k in keywords]}")

# Charger les flux RSS depuis OPML
print_console("Chargement des flux RSS depuis Reeder.opml...")
with open(OPML_PATH, "r", encoding="utf-8") as f:
    tree = ET.parse(f)
    root = tree.getroot()
    outlines = root.findall(".//outline[@type='rss']")
    feeds = [(o.attrib["xmlUrl"], o.attrib.get("title", "Unknown")) for o in outlines]
print_console(f"{len(feeds)} flux RSS trouvés.")

# Fenêtre temporelle : 7 derniers jours
now = datetime.utcnow()
one_week_ago = now - timedelta(days=7)
print_console(f"Fenêtre temporelle : {one_week_ago.date()} à {now.date()}")

# Initialiser le client IA
print_console("Initialisation du client IA EurIA...")
api_client = EurIAClient()

# Index par mot-clé
results = {kw_obj["keyword"]: {} for kw_obj in keywords}

total_feeds = len(feeds)
for feed_idx, (feed_url, feed_title) in enumerate(feeds, 1):
    print_console(f"Lecture du flux {feed_idx} sur {total_feeds} : {feed_title} ({feed_url})")
    try:
        resp = requests.get(feed_url, timeout=15)
        resp.raise_for_status()
        print_console(f"  ✓ Flux chargé avec succès.")
        rss = ET.fromstring(resp.content)
        items = rss.findall(".//item")
        print_console(f"  {len(items)} articles trouvés dans le flux.")
        for idx, item in enumerate(items, 1):
            title = item.findtext("title") or ""
            link = item.findtext("link") or ""
            pub_date = item.findtext("pubDate") or ""
            # Parsing date RFC822
            try:
                pub_dt = datetime.strptime(pub_date[:25], "%a, %d %b %Y %H:%M:%S")
            except Exception:
                print_console(f"    [Article {idx}] Date non reconnue : '{pub_date}'", level="warning")
                continue
            if pub_dt < one_week_ago:
                continue
            for kw_obj in keywords:
                kw = kw_obj["keyword"]
                or_words = kw_obj.get("or", [])
                and_words = kw_obj.get("and", [])
                title_lower = title.lower()

                # 1. Correspondance sur le mot-clé principal
                matched = kw.lower() in title_lower

                # 2. Si pas trouvé, tester les mots de la collection "or" (frontière de mot)
                if not matched and or_words:
                    matched = any(re.search(r'\b' + re.escape(w.lower()) + r'\b', title_lower) for w in or_words)

                # 3. Si correspondance, vérifier la contrainte "and" (au moins un mot présent, frontière de mot)
                if matched and and_words:
                    matched = any(re.search(r'\b' + re.escape(w.lower()) + r'\b', title_lower) for w in and_words)

                if not matched:
                    continue

                out_path = OUTPUT_DIR / f"{kw.replace(' ', '-').lower()}.json"
                # Charger existant pour éviter doublons
                if out_path.exists():
                    with open(out_path, "r", encoding="utf-8") as f:
                        existing_urls = {a["URL"] for a in json.load(f)}
                else:
                    existing_urls = set()
                # Vérifier si déjà traité
                if link in existing_urls or link in results[kw]:
                    print_console(f"    [Article {idx}] Déjà présent pour '{kw}', ignoré.", level="debug")
                    continue
                print_console(f"    [Article {idx}] Mot-clé '{kw}' trouvé dans le titre.")
                print_console(f"      Extraction du texte de l'article...")
                text = fetch_and_extract_text(link)
                print_console(f"      Génération du résumé IA...")
                resume = api_client.generate_summary(text, max_lines=20)
                print_console(f"      Extraction de l'image principale...")
                images = extract_top_n_largest_images(link, n=1, min_width=500)
                article = {
                    "Date de publication": pub_date,
                    "Sources": feed_title,
                    "URL": link,
                    "Résumé": resume,
                    "Images": images
                }
                results[kw][link] = article
                print_console(f"      ✓ Article ajouté pour '{kw}'.")
    except Exception as e:
        print_console(f"Erreur flux {feed_url}: {e}", level="error")

# Sauvegarde par mot-clé
for kw, articles in results.items():
    if not articles:
        print_console(f"Aucun article pour le mot-clé '{kw}', aucun fichier généré.", level="info")
        continue
    out_path = OUTPUT_DIR / f"{kw.replace(' ', '-').lower()}.json"
    # Charger existant pour éviter doublons
    if out_path.exists():
        with open(out_path, "r", encoding="utf-8") as f:
            existing = {a["URL"]: a for a in json.load(f)}
        print_console(f"{len(existing)} articles déjà présents dans {out_path.name}")
    else:
        existing = {}
    # Fusionner sans doublon
    merged = {**existing, **articles}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(list(merged.values()), f, ensure_ascii=False, indent=4)
    print_console(f"✓ {len(merged)} articles pour le mot-clé '{kw}' dans {out_path}")
