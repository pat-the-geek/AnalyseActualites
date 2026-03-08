#!/usr/bin/env python3
"""
generate_reading_notes.py — Notes de lecture quotidiennes par tag (08h00)

Agrège les articles collectés par mot-clé (data/articles-from-rss/*.json)
sur les dernières 24 heures et génère un rapport Markdown organisé par tag.

Sources de données (lecture seule) :
  - data/articles-from-rss/<tag>.json  (un fichier par mot-clé/tag)

Sortie :
  - rapports/markdown/_WUDD.AI_/notes_lecture_YYYY-MM-DD.md

Usage :
    python3 scripts/generate_reading_notes.py
    python3 scripts/generate_reading_notes.py --hours 48    # fenêtre 48h
    python3 scripts/generate_reading_notes.py --dry-run     # affiche sans sauvegarder
"""

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_ROOT))

from utils.config import get_config
from utils.logging import print_console

# Répertoires exclus dans data/articles-from-rss/
EXCLUDED_DIRS = {"_WUDD.AI_"}


# ── Chargement ────────────────────────────────────────────────────────────────

def load_keyword_articles(project_root: Path) -> dict[str, list]:
    """
    Charge tous les fichiers data/articles-from-rss/<tag>.json.
    Retourne un dict {tag: [articles]}.
    """
    rss_dir = project_root / "data" / "articles-from-rss"
    result: dict[str, list] = {}

    if not rss_dir.exists():
        print_console(f"Répertoire introuvable : {rss_dir}", level="warning")
        return result

    for f in sorted(rss_dir.glob("*.json")):
        tag = f.stem  # nom du fichier sans extension
        try:
            articles = json.loads(f.read_text(encoding="utf-8"))
            if isinstance(articles, list) and articles:
                result[tag] = articles
        except Exception as e:
            print_console(f"Erreur lecture {f.name} : {e}", level="warning")

    return result


def parse_date(date_str: str) -> datetime | None:
    """Tente de parser une date dans plusieurs formats courants."""
    if not date_str:
        return None
    # RFC 2822 : "Fri, 20 Feb 2026 13:06:25 +0100"
    try:
        dt = parsedate_to_datetime(date_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        pass
    # ISO 8601 strict
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(date_str[:len(fmt) + 5], fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            continue
    return None


def filter_recent(articles: list, cutoff: datetime) -> list:
    """Filtre les articles publiés après `cutoff`."""
    recent = []
    for a in articles:
        dt = parse_date(a.get("Date de publication", ""))
        if dt and dt >= cutoff:
            recent.append((dt, a))
    # Plus récents en premier
    recent.sort(key=lambda x: x[0], reverse=True)
    return [a for _, a in recent]


def extract_title(article: dict) -> str:
    """Extrait un titre depuis le champ Titre ou la première phrase du Résumé."""
    titre = article.get("Titre", "").strip()
    if titre:
        return titre[:150]
    resume = article.get("Résumé", "").strip()
    # Première ligne non vide
    for line in resume.split("\n"):
        line = line.strip().lstrip("*_#").strip()
        if len(line) > 10:
            return line[:150]
    return "Sans titre"


def format_datetime(article: dict) -> tuple[str, str]:
    """Retourne (date_label, heure_label) lisibles."""
    dt = parse_date(article.get("Date de publication", ""))
    if dt:
        return dt.strftime("%d/%m/%Y"), dt.strftime("%H:%M")
    return article.get("Date de publication", "")[:10], ""


# ── Construction du Markdown ──────────────────────────────────────────────────

def build_reading_notes_markdown(
    articles_by_tag: dict[str, list],
    today_str: str,
    today_iso: str,
    hours: int,
) -> str:
    total = sum(len(v) for v in articles_by_tag.values())
    nb_tags = len(articles_by_tag)

    lines = [
        "---",
        f'title: "Notes de lecture WUDD.ai — {today_str}"',
        f"date: {today_iso}",
        f"période: Dernières {hours}h",
        f"articles: {total}",
        f"tags: {nb_tags}",
        "---",
        "",
        f"# Notes de lecture — {today_str}",
        "",
        f"> {total} articles · {nb_tags} tags · fenêtre {hours}h · généré par WUDD.ai",
        "",
        "## Sommaire",
        "",
    ]

    # Table des matières
    for tag in articles_by_tag:
        anchor = tag.lower().replace(" ", "-").replace("_", "-")
        nb = len(articles_by_tag[tag])
        lines.append(f"- [{tag}](#{anchor}) ({nb})")
    lines.append("")

    # Sections par tag
    for tag, articles in articles_by_tag.items():
        lines.append(f"## {tag}")
        lines.append("")
        for a in articles:
            date_label, heure_label = format_datetime(a)
            titre = extract_title(a)
            url = a.get("URL", "")
            source = a.get("Sources", "")

            # Ligne de référence : date · heure · source · [titre](url)
            meta_parts = []
            if date_label:
                meta_parts.append(date_label)
            if heure_label:
                meta_parts.append(heure_label)
            if source:
                meta_parts.append(f"*{source}*")
            meta = " · ".join(meta_parts)

            if url:
                lines.append(f"- {meta} — [{titre}]({url})")
            else:
                lines.append(f"- {meta} — {titre}")

        lines.append("")

    return "\n".join(lines)


# ── Point d'entrée ────────────────────────────────────────────────────────────

def generate_reading_notes(hours: int = 24, dry_run: bool = False) -> None:
    config = get_config()
    config.setup_directories()

    now = datetime.now(timezone.utc)
    today_iso = now.strftime("%Y-%m-%d")
    today_str = now.strftime("%-d %B %Y")
    cutoff = now - timedelta(hours=hours)

    print_console(f"=== Notes de lecture {today_str} (fenêtre {hours}h) ===")

    # 1. Charger tous les fichiers keyword
    all_keyword_articles = load_keyword_articles(PROJECT_ROOT)
    print_console(f"{len(all_keyword_articles)} tags chargés")

    # 2. Filtrer les articles récents par tag
    articles_by_tag: dict[str, list] = {}
    for tag, articles in all_keyword_articles.items():
        recent = filter_recent(articles, cutoff)
        if recent:
            articles_by_tag[tag] = recent

    # Trier les tags alphabétiquement
    articles_by_tag = dict(sorted(articles_by_tag.items(), key=lambda x: x[0].lower()))

    total = sum(len(v) for v in articles_by_tag.values())
    print_console(f"{total} articles récents répartis sur {len(articles_by_tag)} tags")

    if not articles_by_tag:
        print_console("Aucun article dans la fenêtre temporelle — rapport annulé", level="warning")
        sys.exit(0)

    # 3. Construire le Markdown
    notes_md = build_reading_notes_markdown(
        articles_by_tag=articles_by_tag,
        today_str=today_str,
        today_iso=today_iso,
        hours=hours,
    )

    if dry_run:
        print_console("=== MODE DRY-RUN — aperçu ===")
        print(notes_md[:3000])
        if len(notes_md) > 3000:
            print(f"\n[...tronqué — {len(notes_md)} caractères au total]")
        return

    # 4. Sauvegarder
    output_dir = PROJECT_ROOT / "rapports" / "markdown" / "_WUDD.AI_"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / f"notes_lecture_{today_iso}.md"
    output_file.write_text(notes_md, encoding="utf-8")
    print_console(f"✓ Notes sauvegardées : {output_file}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Génère les notes de lecture quotidiennes WUDD.ai")
    parser.add_argument("--hours", type=int, default=24, help="Fenêtre temporelle en heures (défaut: 24)")
    parser.add_argument("--dry-run", action="store_true", help="Affiche sans sauvegarder")
    args = parser.parse_args()

    generate_reading_notes(hours=args.hours, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
