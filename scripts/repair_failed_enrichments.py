#!/usr/bin/env python3
"""
repair_failed_enrichments.py — Relance l'enrichissement des articles en échec

Scanne tous les fichiers JSON d'articles et réessaie l'enrichissement NER
pour les articles dont le champ enrichissement_statut vaut "echec_api".
Met également à jour l'entity_index après réparation réussie.

Usage :
    python3 scripts/repair_failed_enrichments.py
    python3 scripts/repair_failed_enrichments.py --type entities   # NER uniquement
    python3 scripts/repair_failed_enrichments.py --type sentiment  # Sentiment uniquement
    python3 scripts/repair_failed_enrichments.py --dry-run         # Sans appels API
    python3 scripts/repair_failed_enrichments.py --delay 2.0       # Délai entre appels
"""

import argparse
import json
import sys
import time
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _SCRIPT_DIR.parent
sys.path.insert(0, str(_PROJECT_ROOT))

from utils.logging import print_console
from utils.config import get_config


# ── Collecte des fichiers ─────────────────────────────────────────────────────

def collect_json_files(project_root: Path) -> list[Path]:
    """Retourne tous les fichiers JSON d'articles (hors cache)."""
    files = []
    for scan_dir in [
        project_root / "data" / "articles",
        project_root / "data" / "articles-from-rss",
    ]:
        if not scan_dir.exists():
            continue
        for json_file in sorted(scan_dir.rglob("*.json")):
            if "cache" not in json_file.relative_to(scan_dir).parts:
                files.append(json_file)
    return files


# ── Réparation NER ────────────────────────────────────────────────────────────

def repair_entities_file(
    json_file: Path,
    project_root: Path,
    api_client,
    dry_run: bool,
    delay: float,
) -> dict:
    """Réessaie l'enrichissement NER pour les articles en échec dans un fichier.

    Returns:
        Stats : {total_echecs, repares, toujours_echec}
    """
    stats = {"total_echecs": 0, "repares": 0, "toujours_echec": 0}

    try:
        articles = json.loads(json_file.read_text(encoding="utf-8"))
        if not isinstance(articles, list):
            return stats
    except (json.JSONDecodeError, OSError) as e:
        print_console(f"  Erreur lecture {json_file.name} : {e}", level="error")
        return stats

    modified = False
    repaired_articles = []

    for i, article in enumerate(articles):
        statut = article.get("enrichissement_statut", "")
        if statut not in ("echec_api", "echec_parse"):
            continue

        stats["total_echecs"] += 1
        resume = article.get("Résumé", "").strip()
        if not resume:
            stats["toujours_echec"] += 1
            continue

        if dry_run:
            print_console(
                f"    [DRY-RUN] Article {i+1} — {article.get('Sources', '?')} → serait réessayé",
                level="info",
            )
            stats["repares"] += 1
            continue

        entities = api_client.generate_entities(resume, timeout=60)
        if entities:
            article["entities"] = entities
            article["enrichissement_statut"] = "ok"
            modified = True
            stats["repares"] += 1
            repaired_articles.append(article)
            nb_entites = sum(len(v) for v in entities.values())
            print_console(
                f"    ✓ Article {i+1} — {article.get('Sources', '?')} → {nb_entites} entités",
                level="info",
            )
        else:
            stats["toujours_echec"] += 1
            print_console(
                f"    ✗ Article {i+1} — {article.get('Sources', '?')} → toujours en échec",
                level="warning",
            )

        if delay > 0:
            time.sleep(delay)

    if modified and not dry_run:
        tmp = json_file.with_suffix(".tmp")
        try:
            tmp.write_text(
                json.dumps(articles, ensure_ascii=False, indent=4),
                encoding="utf-8",
            )
            tmp.replace(json_file)
        except OSError as e:
            print_console(f"  Erreur sauvegarde {json_file.name} : {e}", level="error")
            if tmp.exists():
                tmp.unlink()
            return stats

        # Mettre à jour l'entity_index pour ce fichier
        if repaired_articles:
            try:
                from utils.entity_index import get_entity_index
                eidx = get_entity_index(project_root)
                rel_path = str(json_file.relative_to(project_root)).replace("\\", "/")
                eidx.update(articles, rel_path)
                print_console(
                    f"  entity_index mis à jour : {len(repaired_articles)} article(s) réparés",
                    level="info",
                )
            except Exception as e:
                print_console(f"  Avertissement : entity_index non mis à jour : {e}", level="warning")

    return stats


# ── Réparation sentiment ──────────────────────────────────────────────────────

def repair_sentiment_file(
    json_file: Path,
    api_client,
    dry_run: bool,
    delay: float,
) -> dict:
    """Réessaie l'analyse de sentiment pour les articles en échec dans un fichier."""
    stats = {"total_echecs": 0, "repares": 0, "toujours_echec": 0}

    try:
        articles = json.loads(json_file.read_text(encoding="utf-8"))
        if not isinstance(articles, list):
            return stats
    except (json.JSONDecodeError, OSError) as e:
        print_console(f"  Erreur lecture {json_file.name} : {e}", level="error")
        return stats

    modified = False

    for i, article in enumerate(articles):
        statut = article.get("enrichissement_statut", "")
        if statut not in ("echec_api", "echec_parse"):
            continue
        if "sentiment" in article:
            continue  # Déjà enrichi par les entités

        stats["total_echecs"] += 1
        resume = article.get("Résumé", "").strip()
        if len(resume) < 50:
            stats["toujours_echec"] += 1
            continue

        if dry_run:
            print_console(
                f"    [DRY-RUN] Article {i+1} — {article.get('Sources', '?')} → serait réessayé",
                level="info",
            )
            stats["repares"] += 1
            continue

        result = api_client.generate_sentiment(resume)
        if result:
            article.update(result)
            article["enrichissement_statut"] = "ok"
            modified = True
            stats["repares"] += 1
            print_console(
                f"    ✓ Article {i+1} — {article.get('Sources', '?')} "
                f"→ {result.get('sentiment', '?')}",
                level="info",
            )
        else:
            stats["toujours_echec"] += 1
            print_console(
                f"    ✗ Article {i+1} — {article.get('Sources', '?')} → toujours en échec",
                level="warning",
            )

        if delay > 0:
            time.sleep(delay)

    if modified and not dry_run:
        try:
            json_file.write_text(
                json.dumps(articles, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except OSError as e:
            print_console(f"  Erreur sauvegarde {json_file.name} : {e}", level="error")

    return stats


# ── Point d'entrée ────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description="Répare les enrichissements échoués dans les articles WUDD.ai"
    )
    parser.add_argument(
        "--type",
        choices=["entities", "sentiment", "all"],
        default="all",
        help="Type d'enrichissement à réparer (défaut: all)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simule sans appeler l'API ni sauvegarder",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.0,
        help="Délai en secondes entre les appels API (défaut: 1.0)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    try:
        config = get_config()
    except ValueError as e:
        print_console(f"Erreur de configuration : {e}", level="error")
        sys.exit(1)

    project_root = _PROJECT_ROOT
    print_console("=" * 60)
    print_console("WUDD.ai — Réparation des enrichissements échoués")
    if args.dry_run:
        print_console("[MODE DRY-RUN — aucun appel API, aucune sauvegarde]")
    print_console("=" * 60)

    files = collect_json_files(project_root)
    print_console(f"{len(files)} fichier(s) JSON à inspecter")

    api_client = None if args.dry_run else None

    # Identifier les fichiers contenant des articles en échec
    files_with_failures = []
    total_failures = 0
    for json_file in files:
        try:
            articles = json.loads(json_file.read_text(encoding="utf-8"))
            if not isinstance(articles, list):
                continue
            n = sum(
                1 for a in articles
                if a.get("enrichissement_statut") in ("echec_api", "echec_parse")
            )
            if n > 0:
                files_with_failures.append((json_file, n))
                total_failures += n
        except Exception:
            continue

    print_console(f"{total_failures} article(s) en échec dans {len(files_with_failures)} fichier(s)")

    if total_failures == 0:
        print_console("✓ Aucun article en échec — tout est propre.")
        return

    if not args.dry_run:
        from utils.api_client import get_ai_client
        api_client = get_ai_client()

    totaux = {"total_echecs": 0, "repares": 0, "toujours_echec": 0}

    for json_file, n_echecs in files_with_failures:
        rel = json_file.relative_to(project_root)
        print_console(f"\n[{rel}] — {n_echecs} article(s) en échec")

        if args.type in ("entities", "all"):
            stats = repair_entities_file(
                json_file, project_root, api_client, args.dry_run, args.delay
            )
            for k in totaux:
                totaux[k] += stats[k]

        if args.type in ("sentiment", "all"):
            stats = repair_sentiment_file(
                json_file, api_client, args.dry_run, args.delay
            )
            for k in totaux:
                totaux[k] += stats[k]

    print_console("\n" + "=" * 60)
    print_console(
        f"Terminé — {totaux['repares']} réparés / {totaux['total_echecs']} en échec "
        f"({totaux['toujours_echec']} toujours en échec)"
    )
    if args.dry_run:
        print_console("[DRY-RUN] Aucun fichier modifié.")


if __name__ == "__main__":
    main()
