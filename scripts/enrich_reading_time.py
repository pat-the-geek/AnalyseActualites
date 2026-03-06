#!/usr/bin/env python3
"""
enrich_reading_time.py — Enrichissement du temps de lecture des articles (Priorité 6)

Ajoute les champs `temps_lecture_minutes` et `temps_lecture_label` à tous les
articles existants en estimant le temps de lecture à partir du résumé.

Usage :
    python3 scripts/enrich_reading_time.py
    python3 scripts/enrich_reading_time.py --flux Intelligence-artificielle
    python3 scripts/enrich_reading_time.py --keyword openai
    python3 scripts/enrich_reading_time.py --dry-run
    python3 scripts/enrich_reading_time.py --force   # Recalcule même si déjà enrichi
"""

import argparse
import json
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _SCRIPT_DIR.parent
sys.path.insert(0, str(_PROJECT_ROOT))

from utils.logging import print_console
from utils.reading_time import enrich_reading_time

# ── Constantes ───────────────────────────────────────────────────────────────

_ARTICLES_DIR     = _PROJECT_ROOT / "data" / "articles"
_ARTICLES_RSS_DIR = _PROJECT_ROOT / "data" / "articles-from-rss"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _collect_json_files(
    flux: str | None,
    keyword: str | None,
) -> list[Path]:
    """Retourne la liste des fichiers JSON à enrichir."""
    files: list[Path] = []

    if keyword:
        # Articles-from-rss : un fichier par mot-clé
        pattern = f"{keyword.replace(' ', '-').lower()}.json"
        candidate = _ARTICLES_RSS_DIR / pattern
        if candidate.exists():
            files.append(candidate)
        else:
            # Recherche approximative
            for f in _ARTICLES_RSS_DIR.glob("*.json"):
                if keyword.lower() in f.stem.lower():
                    files.append(f)
    elif flux:
        flux_dir = _ARTICLES_DIR / flux
        if flux_dir.exists():
            files.extend(f for f in flux_dir.rglob("*.json") if "cache" not in f.parts)
        else:
            print_console(f"Flux introuvable : {flux_dir}", "warning")
    else:
        # Tous les articles
        if _ARTICLES_DIR.exists():
            files.extend(
                f for f in _ARTICLES_DIR.rglob("*.json")
                if "cache" not in f.relative_to(_ARTICLES_DIR).parts
            )
        if _ARTICLES_RSS_DIR.exists():
            files.extend(_ARTICLES_RSS_DIR.glob("*.json"))

    return sorted(set(files))


def _process_file(path: Path, dry_run: bool, force: bool) -> tuple[int, int]:
    """Enrichit un fichier JSON. Retourne (total, enrichis)."""
    try:
        data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
        if not isinstance(data, list):
            return 0, 0
    except (json.JSONDecodeError, OSError) as exc:
        print_console(f"Erreur lecture {path.name} : {exc}", "error")
        return 0, 0

    before = sum(1 for a in data if "temps_lecture_minutes" in a)
    enriched = enrich_reading_time(data, overwrite=force)
    after = sum(1 for a in enriched if "temps_lecture_minutes" in a)
    nb_enriched = after - before

    if not dry_run and nb_enriched > 0:
        try:
            path.write_text(
                json.dumps(enriched, ensure_ascii=False, indent=4),
                encoding="utf-8",
            )
        except OSError as exc:
            print_console(f"Erreur écriture {path.name} : {exc}", "error")

    return len(data), nb_enriched


# ── Point d'entrée ────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description="Enrichit les articles avec le temps de lecture estimé"
    )
    parser.add_argument("--flux",    type=str, default=None,
                        help="Traiter uniquement un flux spécifique")
    parser.add_argument("--keyword", type=str, default=None,
                        help="Traiter uniquement un mot-clé spécifique")
    parser.add_argument("--dry-run", action="store_true",
                        help="Simule sans modifier les fichiers")
    parser.add_argument("--force",   action="store_true",
                        help="Recalcule même si le champ est déjà présent")
    return parser.parse_args()


def main():
    args = parse_args()

    print_console("=== Enrichissement temps de lecture WUDD.ai ===")

    files = _collect_json_files(args.flux, args.keyword)
    print_console(f"{len(files)} fichier(s) à traiter")

    total_articles  = 0
    total_enriched  = 0

    for path in files:
        n_total, n_enriched = _process_file(path, args.dry_run, args.force)
        total_articles += n_total
        total_enriched += n_enriched
        if n_enriched > 0:
            dry_tag = "[DRY-RUN] " if args.dry_run else ""
            print_console(f"  {dry_tag}{path.name} : {n_enriched}/{n_total} article(s) enrichi(s)")

    print_console(
        f"Terminé : {total_enriched} article(s) enrichi(s) sur {total_articles} au total"
        + (" [DRY-RUN]" if args.dry_run else "")
    )


if __name__ == "__main__":
    main()
