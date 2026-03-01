"""
Script : articles_rss_to_markdown.py

Pour chaque fichier JSON dans data/articles-from-rss/ :
  - Convertit les articles en Markdown avec annotation inline des entités nommées
  - Sauvegarde dans rapports/markdown/keyword/<mot-clé>/<mot-clé>_<YYYY-MM-DD>.md

Usage :
    python3 scripts/articles_rss_to_markdown.py
    python3 scripts/articles_rss_to_markdown.py --keyword anthropic
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.articles_json_to_markdown import json_to_markdown
from utils.logging import print_console

ARTICLES_DIR = PROJECT_ROOT / "data" / "articles-from-rss"
RAPPORTS_BASE = PROJECT_ROOT / "rapports" / "markdown" / "keyword"


def process_file(json_file: Path) -> None:
    keyword_slug = json_file.stem          # ex: "intelligence-artificielle"
    today = datetime.now().strftime("%Y-%m-%d")
    rapport_dir = RAPPORTS_BASE / keyword_slug
    rapport_dir.mkdir(parents=True, exist_ok=True)
    output_file = rapport_dir / f"{keyword_slug}_{today}.md"
    print_console(f"Conversion : {json_file.name} → {output_file.relative_to(PROJECT_ROOT)}")
    json_to_markdown(str(json_file), str(output_file))


def main():
    parser = argparse.ArgumentParser(
        description="Convertit tous les fichiers articles-from-rss en Markdown (nouveau format)"
    )
    parser.add_argument(
        "--keyword",
        help="Traiter uniquement ce mot-clé (slug du nom de fichier, ex: anthropic)",
    )
    args = parser.parse_args()

    if args.keyword:
        target = ARTICLES_DIR / f"{args.keyword}.json"
        if not target.exists():
            print_console(f"Fichier introuvable : {target}", level="error")
            sys.exit(1)
        json_files = [target]
    else:
        json_files = sorted(ARTICLES_DIR.glob("*.json"))

    if not json_files:
        print_console("Aucun fichier JSON trouvé dans data/articles-from-rss/", level="warning")
        sys.exit(0)

    print_console(f"Début conversion RSS→Markdown ({len(json_files)} fichier(s))")
    for json_file in json_files:
        try:
            process_file(json_file)
        except Exception as e:
            print_console(f"Erreur sur {json_file.name} : {e}", level="error")

    print_console(f"Terminé — {len(json_files)} rapport(s) générés dans {RAPPORTS_BASE.relative_to(PROJECT_ROOT)}/")


if __name__ == "__main__":
    main()
