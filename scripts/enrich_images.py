#!/usr/bin/env python3
"""Script d'enrichissement des articles existants avec les images.

Parcourt les fichiers JSON dans data/articles/ et data/articles-from-rss/
et ajoute le champ "Images" aux articles qui n'en ont pas, en fetchant
la page HTML de chaque article et en extrayant og:image / twitter:image.

Usage:
    # Tout traiter (dry-run : aucun fetch, aucune sauvegarde)
    python3 scripts/enrich_images.py --dry-run

    # Tout traiter pour de vrai (flux + rss)
    python3 scripts/enrich_images.py

    # Un flux spécifique (data/articles/<flux>/)
    python3 scripts/enrich_images.py --flux Intelligence-artificielle

    # Un mot-clé spécifique (data/articles-from-rss/<keyword>.json)
    python3 scripts/enrich_images.py --keyword anthropic

    # Délai entre requêtes HTTP (secondes, défaut 0.5)
    python3 scripts/enrich_images.py --delay 1.0

    # Re-forcer même les articles qui ont déjà des images
    python3 scripts/enrich_images.py --force
"""

import json
import sys
import time
import argparse
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_ROOT))

from utils.logging import print_console, setup_logger
from utils.config import get_config

logger = setup_logger(__name__)

HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; WUDD.ai/2.2; +https://wudd.ai)"
}
HTTP_TIMEOUT = 15  # secondes

# Domaines de stockage générique dont les URLs og:image sont peu fiables (pas de contexte visuel)
GENERIC_IMAGE_HOSTS = {"filepicker.io", "filestack.com", "cloudinary.com"}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Enrichit les articles JSON existants avec les images (og:image)."
    )
    parser.add_argument(
        "--flux",
        type=str,
        default=None,
        help="Traiter uniquement ce flux (sous-répertoire de data/articles/). "
             "Si absent et --keyword absent : tous les flux sont traités.",
    )
    parser.add_argument(
        "--keyword",
        type=str,
        default=None,
        help="Traiter uniquement ce mot-clé (fichier dans data/articles-from-rss/). "
             "Si absent et --flux absent : tous les mots-clés sont traités.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Affiche ce qui serait traité sans fetcher ni sauvegarder.",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.5,
        help="Délai en secondes entre chaque requête HTTP (défaut : 0.5).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-fetcher les images même si le champ 'Images' existe déjà.",
    )
    return parser.parse_args()


def collect_flux_files(articles_dir: Path, flux_filter: str | None) -> list[tuple[Path, str]]:
    """Retourne les fichiers de data/articles/ avec leur label d'affichage."""
    if not articles_dir.is_dir():
        return []

    if flux_filter:
        flux_dir = articles_dir / flux_filter
        if not flux_dir.is_dir():
            print_console(f"Flux introuvable : {flux_dir}", level="error")
            sys.exit(1)
        dirs = [flux_dir]
    else:
        dirs = sorted([d for d in articles_dir.iterdir() if d.is_dir() and d.name != "cache"])

    result = []
    for d in dirs:
        for f in sorted(d.glob("articles_generated_*.json")):
            result.append((f, f"flux/{d.name}"))
    return result


def collect_rss_files(rss_dir: Path, keyword_filter: str | None) -> list[tuple[Path, str]]:
    """Retourne les fichiers de data/articles-from-rss/ avec leur label d'affichage."""
    if not rss_dir.is_dir():
        return []

    if keyword_filter:
        candidate = rss_dir / f"{keyword_filter}.json"
        if not candidate.is_file():
            print_console(f"Mot-clé introuvable : {candidate}", level="error")
            sys.exit(1)
        return [(candidate, f"rss/{keyword_filter}")]

    return [
        (f, f"rss/{f.stem}")
        for f in sorted(rss_dir.glob("*.json"))
        if f.is_file() and not f.name.startswith("_")
    ]


def _is_generic_host(img_url: str) -> bool:
    """Retourne True si l'URL pointe vers un CDN de stockage générique peu fiable."""
    from urllib.parse import urlparse
    host = urlparse(img_url).netloc.lower()
    return any(h in host for h in GENERIC_IMAGE_HOSTS)


def fetch_images(url: str) -> list[dict]:
    """Fetche une page HTML et retourne les images extraites (og:image en priorité).

    Retourne une liste de dicts {"URL": ..., "Width": ...}, vide si aucune trouvée.
    Si og:image pointe vers un hébergeur générique (filepicker, filestack…),
    on préfère la première <img> CDN trouvée dans le corps de la page.
    """
    try:
        resp = requests.get(url, headers=HTTP_HEADERS, timeout=HTTP_TIMEOUT)
        resp.raise_for_status()
    except requests.RequestException:
        return []

    soup = BeautifulSoup(resp.content, "html.parser")
    images = []
    fallback_og = None  # og:image générique conservé comme dernier recours

    # Priorité 1 : Open Graph / Twitter card (sauf hébergeurs génériques)
    for prop in ("og:image", "twitter:image"):
        meta = soup.find("meta", property=prop) or soup.find("meta", attrs={"name": prop})
        if meta:
            img_url = meta.get("content", "").strip()
            if img_url:
                img_url = urljoin(url, img_url)
                try:
                    w_tag = soup.find("meta", property="og:image:width")
                    width = int(w_tag.get("content", 1200)) if w_tag else 1200
                except (ValueError, TypeError):
                    width = 1200
                if _is_generic_host(img_url):
                    fallback_og = {"URL": img_url, "Width": width}
                else:
                    images.append({"URL": img_url, "Width": width})
                break

    # Priorité 2 : première <img> pertinente dans le corps de l'article
    if not images:
        for img_tag in soup.find_all("img", src=True):
            src = img_tag.get("src", "").strip()
            if not src or src.startswith("data:"):
                continue
            src = urljoin(url, src)
            if not src.startswith("http"):
                continue
            try:
                w = int(img_tag.get("width", 0))
            except (ValueError, TypeError):
                w = 0
            if w >= 300 or w == 0:
                images.append({"URL": src, "Width": w if w > 0 else 800})
                break

    # Dernier recours : og:image générique si aucune meilleure image trouvée
    if not images and fallback_og:
        images.append(fallback_og)

    return images


def enrich_file(
    json_file: Path,
    dry_run: bool,
    delay: float,
    force: bool,
) -> dict:
    """Enrichit un fichier JSON avec les images. Retourne les stats du fichier."""
    stats = {"total": 0, "enrichis": 0, "deja_presents": 0, "erreurs": 0, "ignores": 0}

    with open(json_file, "r", encoding="utf-8") as f:
        try:
            articles = json.load(f)
        except json.JSONDecodeError as e:
            print_console(f"  JSON invalide ({json_file.name}) : {e}", level="error")
            return stats

    if not isinstance(articles, list):
        print_console(f"  Format inattendu (pas une liste) : {json_file.name}", level="warning")
        return stats

    modified = False

    for i, article in enumerate(articles):
        stats["total"] += 1

        article_url = article.get("URL", "").strip()
        if not article_url or not article_url.startswith("http"):
            stats["ignores"] += 1
            continue

        # Vérifier si des images existent déjà (champ "Images" ou "images")
        has_images = bool(article.get("Images") or article.get("images"))
        if has_images and not force:
            stats["deja_presents"] += 1
            continue

        if dry_run:
            print_console(
                f"    [DRY-RUN] Article {i+1}/{len(articles)} — "
                f"{article.get('Sources', '?')} → serait fetché",
                level="info",
            )
            stats["enrichis"] += 1
            continue

        images = fetch_images(article_url)
        if images:
            article["Images"] = images
            # Supprimer l'éventuel champ "images" (minuscule) pour homogénéiser
            article.pop("images", None)
            modified = True
            stats["enrichis"] += 1
            print_console(
                f"    Article {i+1}/{len(articles)} — {article.get('Sources', '?')} "
                f"→ {len(images)} image(s) extraite(s)",
                level="debug",
            )
        else:
            stats["erreurs"] += 1
            print_console(
                f"    Article {i+1}/{len(articles)} — {article.get('Sources', '?')} "
                f"→ aucune image trouvée",
                level="warning",
            )

        if delay > 0:
            time.sleep(delay)

    # Sauvegarder uniquement si le fichier a été modifié
    if modified and not dry_run:
        tmp = json_file.with_suffix(".tmp")
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(articles, f, ensure_ascii=False, indent=4)
            tmp.replace(json_file)
        except Exception as e:
            print_console(f"  Erreur de sauvegarde : {e}", level="error")
            if tmp.exists():
                tmp.unlink()

    return stats


def main():
    print_console("=" * 70, level="info")
    print_console("Enrichissement des articles avec les images (og:image)", level="info")
    print_console("=" * 70, level="info")

    args = parse_args()

    try:
        config = get_config()
    except ValueError as e:
        logger.error(f"Erreur de configuration : {e}")
        sys.exit(1)

    articles_dir = config.data_articles_dir
    rss_dir = articles_dir.parent / "articles-from-rss"

    process_flux = args.flux is not None or args.keyword is None
    process_rss = args.keyword is not None or args.flux is None

    tagged_files: list[tuple[Path, str]] = []
    if process_flux:
        tagged_files += collect_flux_files(articles_dir, args.flux)
    if process_rss:
        tagged_files += collect_rss_files(rss_dir, args.keyword)

    if not tagged_files:
        print_console("Aucun fichier JSON trouvé.", level="warning")
        sys.exit(0)

    nb_flux = sum(1 for _, lbl in tagged_files if lbl.startswith("flux/"))
    nb_rss = sum(1 for _, lbl in tagged_files if lbl.startswith("rss/"))
    print_console(
        f"{len(tagged_files)} fichier(s) à traiter "
        f"({nb_flux} flux, {nb_rss} rss)",
        level="info",
    )
    if args.dry_run:
        print_console("[MODE DRY-RUN — aucun fetch, aucune sauvegarde]", level="info")
    print_console("", level="info")

    totaux = {"total": 0, "enrichis": 0, "deja_presents": 0, "erreurs": 0, "ignores": 0}

    for json_file, label in tagged_files:
        print_console(f"[{label}] {json_file.name}", level="info")

        stats = enrich_file(json_file, args.dry_run, args.delay, args.force)

        print_console(
            f"  total={stats['total']}  enrichis={stats['enrichis']}  "
            f"existants={stats['deja_presents']}  erreurs={stats['erreurs']}  "
            f"ignorés={stats['ignores']}",
            level="info",
        )
        for k in totaux:
            totaux[k] += stats[k]

    print_console("", level="info")
    print_console("=" * 70, level="info")
    print_console(
        f"Terminé — {totaux['enrichis']} article(s) enrichi(s) sur {totaux['total']} "
        f"({totaux['erreurs']} sans image, {totaux['deja_presents']} déjà présent(s))",
        level="info",
    )
    print_console("=" * 70, level="info")


if __name__ == "__main__":
    main()
