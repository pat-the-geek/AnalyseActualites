#!/usr/bin/env python3
"""
fix_article_dates.py — Migration des dates articles-from-rss vers DD/MM/YYYY

Corrige les articles dont le champ "Date de publication" est stocké en format
RFC 2822 (ex: "Fri, 20 Feb 2026 04:24:00 +0100") au lieu du format standard
DD/MM/YYYY du projet (ex: "20/02/2026").

Usage:
    python3 scripts/fix_article_dates.py           # affiche un rapport + modifie
    python3 scripts/fix_article_dates.py --dry-run # rapport seul, aucune écriture
"""
import argparse
import json
import shutil
from datetime import datetime
from pathlib import Path
import sys

# ─── Chemins ─────────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
INPUT_DIR    = PROJECT_ROOT / "data" / "articles-from-rss"


def _parse_date_publication(date_str: str) -> datetime | None:
    """Tente de parser une date quel que soit son format.

    Formats gérés :
      - RFC 2822 : "Fri, 20 Feb 2026 04:24:00 +0100"
      - RFC 2822 sans timezone : "Fri, 20 Feb 2026 04:24:00"
      - DD/MM/YYYY (déjà correct) : "20/02/2026"
      - ISO 8601 : "2026-02-20T04:24:00Z" / "2026-02-20"
    Retourne None si aucun format ne correspond.
    """
    if not date_str:
        return None

    # RFC 2822 avec timezone offset (+HHMM)
    for fmt in ("%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S"):
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            return dt.replace(tzinfo=None)
        except ValueError:
            pass

    # RFC 2822 tronqué (25 premiers caractères, sans timezone)
    try:
        return datetime.strptime(date_str.strip()[:25], "%a, %d %b %Y %H:%M:%S")
    except ValueError:
        pass

    # DD/MM/YYYY — déjà correct
    try:
        return datetime.strptime(date_str.strip(), "%d/%m/%Y")
    except ValueError:
        pass

    # ISO 8601
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(date_str.strip()[:19], fmt)
        except ValueError:
            pass

    return None


def _is_already_ddmmyyyy(date_str: str) -> bool:
    """Retourne True si la date est déjà au format DD/MM/YYYY."""
    try:
        datetime.strptime(date_str.strip(), "%d/%m/%Y")
        return True
    except ValueError:
        return False


def process_file(json_path: Path, dry_run: bool) -> tuple[int, int, int]:
    """Traite un fichier JSON d'articles.

    Retourne (total, corrigés, erreurs).
    """
    try:
        raw = json_path.read_text(encoding="utf-8")
        articles = json.loads(raw)
    except Exception as e:
        print(f"  ✗ Erreur lecture {json_path.name} : {e}")
        return 0, 0, 0

    if not isinstance(articles, list):
        return 0, 0, 0

    total   = len(articles)
    fixed   = 0
    errors  = 0
    changed = False

    for article in articles:
        date_str = article.get("Date de publication", "")
        if not date_str:
            continue
        if _is_already_ddmmyyyy(date_str):
            continue  # déjà au bon format

        dt = _parse_date_publication(date_str)
        if dt is None:
            errors += 1
            print(f"    ⚠ Format inconnu non converti : {repr(date_str)}")
            continue

        new_date = dt.strftime("%d/%m/%Y")
        if not dry_run:
            article["Date de publication"] = new_date
        fixed   += 1
        changed  = True

    if changed and not dry_run:
        # Écriture atomique : fichier temporaire puis renommage
        tmp = json_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(articles, ensure_ascii=False, indent=4), encoding="utf-8")
        tmp.replace(json_path)

    return total, fixed, errors


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Corrige le format des dates dans data/articles-from-rss/"
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="Affiche le rapport sans écrire les fichiers")
    args = parser.parse_args()

    dry_run = args.dry_run
    if dry_run:
        print("=== MODE DRY-RUN — aucun fichier modifié ===\n")

    if not INPUT_DIR.exists():
        print(f"Dossier introuvable : {INPUT_DIR}")
        sys.exit(1)

    json_files = sorted(INPUT_DIR.glob("*.json"))
    if not json_files:
        print("Aucun fichier JSON trouvé.")
        sys.exit(0)

    total_all  = 0
    fixed_all  = 0
    errors_all = 0
    files_modified = 0

    for json_path in json_files:
        total, fixed, errors = process_file(json_path, dry_run)
        total_all  += total
        fixed_all  += fixed
        errors_all += errors
        if fixed > 0:
            files_modified += 1
            mode = "à corriger" if dry_run else "corrigés"
            print(f"  ✓ {json_path.name} : {fixed}/{total} articles {mode}")
        if errors > 0:
            print(f"  ⚠ {json_path.name} : {errors} dates non convertibles")

    print(f"\n{'=' * 60}")
    if dry_run:
        print(f"DRY-RUN — aucune modification effectuée")
        print(f"  Fichiers qui seraient modifiés : {files_modified}")
        print(f"  Articles qui seraient corrigés : {fixed_all}/{total_all}")
    else:
        print(f"Migration terminée")
        print(f"  Fichiers modifiés : {files_modified}")
        print(f"  Articles corrigés : {fixed_all}/{total_all}")
    if errors_all > 0:
        print(f"  ⚠ Dates non convertibles  : {errors_all}")


if __name__ == "__main__":
    main()
