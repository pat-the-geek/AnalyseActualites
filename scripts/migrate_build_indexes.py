#!/usr/bin/env python3
"""
migrate_build_indexes.py — Construction initiale des index WUDD.ai

Ce script est à exécuter UNE SEULE FOIS lors de la migration vers la
nouvelle architecture d'index (v2.4.0+). Il construit de zéro :

  - data/article_index.json  : index léger des métadonnées d'articles
                               (url, source, date, présence entités/sentiment/images, chemin fichier)
  - data/entity_index.json   : index inversé entité → articles
                               (PERSON:Macron → [{file, idx, date}, ...])

Ces index sont ensuite maintenus incrémentalement par flux_watcher.py
et enrich_entities.py à chaque nouvel article.

Usage :
    # Construction complète (recommandé pour la migration initiale)
    python3 scripts/migrate_build_indexes.py

    # Voir la progression sans écrire (dry-run)
    python3 scripts/migrate_build_indexes.py --dry-run

    # Reconstruire seulement l'index articles
    python3 scripts/migrate_build_indexes.py --only article

    # Reconstruire seulement l'index entités
    python3 scripts/migrate_build_indexes.py --only entity

    # Vérifier l'état des index existants
    python3 scripts/migrate_build_indexes.py --stats

Durée estimée :
    - 1 000 articles  :  ~5 secondes
    - 10 000 articles : ~30 secondes
    - 50 000 articles : ~2 minutes
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


# ── Utilitaires d'affichage ───────────────────────────────────────────────────

def _bar(done: int, total: int, width: int = 40) -> str:
    """Barre de progression ASCII."""
    if total == 0:
        return "[" + "-" * width + "] 0/0"
    filled = int(width * done / total)
    bar = "█" * filled + "░" * (width - filled)
    pct = done * 100 // total
    return f"[{bar}] {pct}% ({done}/{total})"


def _count_articles(project_root: Path) -> int:
    """Compte le nombre total d'articles dans data/ (aperçu avant migration)."""
    total = 0
    for scan_dir in [
        project_root / "data" / "articles",
        project_root / "data" / "articles-from-rss",
    ]:
        if not scan_dir.exists():
            continue
        for json_file in scan_dir.rglob("*.json"):
            if "cache" in json_file.relative_to(scan_dir).parts:
                continue
            try:
                data = json.loads(json_file.read_text(encoding="utf-8", errors="replace"))
                if isinstance(data, list):
                    total += len(data)
            except Exception:
                pass
    return total


# ── Affichage des stats des index existants ───────────────────────────────────

def show_stats(project_root: Path) -> None:
    """Affiche l'état actuel des index s'ils existent."""
    print_console("=== État des index WUDD.ai ===")

    # article_index.json
    article_idx_path = project_root / "data" / "article_index.json"
    if article_idx_path.exists():
        try:
            from utils.article_index import get_article_index
            aidx = get_article_index(project_root)
            s = aidx.stats()
            print_console(f"article_index.json :")
            print_console(f"  Articles indexés   : {s['total']}")
            print_console(f"  Avec entités NER   : {s['with_entities']}")
            print_console(f"  Avec sentiment     : {s['with_sentiment']}")
            print_console(f"  Avec images        : {s['with_images']}")
            print_console(f"  Généré le          : {s['generated_at']}")
        except Exception as e:
            print_console(f"  Erreur lecture : {e}", level="warning")
    else:
        print_console("article_index.json : absent")

    # entity_index.json
    entity_idx_path = project_root / "data" / "entity_index.json"
    if entity_idx_path.exists():
        try:
            from utils.entity_index import get_entity_index
            eidx = get_entity_index(project_root)
            s = eidx.stats()
            print_console(f"entity_index.json :")
            print_console(f"  Entités distinctes : {s['entities']}")
            print_console(f"  Références totales : {s['references']}")
            by_type_str = ", ".join(f"{t}: {c}" for t, c in sorted(s['by_type'].items()))
            print_console(f"  Par type           : {by_type_str or 'aucun'}")
            print_console(f"  Généré le          : {s['generated_at']}")
        except Exception as e:
            print_console(f"  Erreur lecture : {e}", level="warning")
    else:
        print_console("entity_index.json : absent")

    # synthesis_cache.json
    cache_path = project_root / "data" / "synthesis_cache.json"
    if cache_path.exists():
        try:
            from utils.synthesis_cache import get_synthesis_cache
            sc = get_synthesis_cache(project_root)
            s = sc.stats()
            print_console(f"synthesis_cache.json :")
            print_console(f"  Entrées valides    : {s['valid']}")
            print_console(f"  Entrées expirées   : {s['expired']}")
            print_console(f"  Total              : {s['total']}")
        except Exception as e:
            print_console(f"  Erreur lecture : {e}", level="warning")
    else:
        print_console("synthesis_cache.json : absent (sera créé à la première synthèse)")


# ── Construction de l'index articles ─────────────────────────────────────────

def build_article_index(project_root: Path, dry_run: bool = False) -> int:
    """Construit data/article_index.json depuis zéro.

    Returns:
        Nombre d'articles indexés.
    """
    print_console("Construction de article_index.json…")
    t0 = time.time()

    if dry_run:
        total = _count_articles(project_root)
        print_console(f"  [DRY-RUN] {total} article(s) seraient indexés.")
        return total

    from utils.article_index import ArticleIndex
    aidx = ArticleIndex(project_root)

    # Comptage préalable pour la barre de progression
    scan_dirs = [
        project_root / "data" / "articles",
        project_root / "data" / "articles-from-rss",
    ]
    json_files = []
    for scan_dir in scan_dirs:
        if not scan_dir.exists():
            continue
        for f in sorted(scan_dir.rglob("*.json")):
            if "cache" not in f.relative_to(scan_dir).parts:
                json_files.append(f)

    print_console(f"  {len(json_files)} fichier(s) JSON à parcourir…")

    # Reconstruction complète (une seule passe)
    total_indexed = aidx.rebuild()

    elapsed = time.time() - t0
    print_console(f"  ✓ {total_indexed} article(s) indexés en {elapsed:.1f}s")
    return total_indexed


# ── Construction de l'index entités ──────────────────────────────────────────

def build_entity_index(project_root: Path, dry_run: bool = False) -> int:
    """Construit data/entity_index.json depuis zéro.

    Returns:
        Nombre de références entité-article indexées.
    """
    print_console("Construction de entity_index.json…")
    t0 = time.time()

    if dry_run:
        # Compter les articles avec entités
        count = 0
        for scan_dir in [
            project_root / "data" / "articles",
            project_root / "data" / "articles-from-rss",
        ]:
            if not scan_dir.exists():
                continue
            for json_file in scan_dir.rglob("*.json"):
                if "cache" in json_file.relative_to(scan_dir).parts:
                    continue
                try:
                    data = json.loads(json_file.read_text(encoding="utf-8", errors="replace"))
                    if isinstance(data, list):
                        count += sum(1 for a in data if a.get("entities"))
                except Exception:
                    pass
        print_console(f"  [DRY-RUN] {count} article(s) avec entités seraient indexés.")
        return count

    from utils.entity_index import EntityIndex
    eidx = EntityIndex(project_root)
    total_refs = eidx.rebuild()

    elapsed = time.time() - t0
    stats = eidx.stats()
    print_console(
        f"  ✓ {stats['entities']} entités distinctes, "
        f"{total_refs} références totales en {elapsed:.1f}s"
    )
    by_type_str = "  ".join(f"{t}={c}" for t, c in sorted(stats["by_type"].items()))
    if by_type_str:
        print_console(f"     Répartition : {by_type_str}")
    return total_refs


# ── Vérification de cohérence ─────────────────────────────────────────────────

def verify_indexes(project_root: Path) -> bool:
    """Vérifie la cohérence basique des index générés.

    Retourne True si tout est OK, False si des anomalies sont détectées.
    """
    print_console("Vérification de la cohérence des index…")
    ok = True

    # Vérifier que l'index articles est lisible
    try:
        from utils.article_index import get_article_index
        aidx = get_article_index(project_root)
        # Forcer le rechargement
        aidx._loaded = False
        aidx._load()
        count = aidx.count()
        print_console(f"  article_index : {count} entrées — OK")
    except Exception as e:
        print_console(f"  article_index : ERREUR — {e}", level="error")
        ok = False

    # Vérifier que l'index entités est lisible
    try:
        from utils.entity_index import get_entity_index
        eidx = get_entity_index(project_root)
        eidx._loaded = False
        eidx._load()
        n = eidx.count_entities()
        print_console(f"  entity_index  : {n} entités — OK")
    except Exception as e:
        print_console(f"  entity_index  : ERREUR — {e}", level="error")
        ok = False

    # Vérifier un échantillon de références (les 5 premières entités)
    try:
        from utils.entity_index import get_entity_index
        eidx = get_entity_index(project_root)
        top = eidx.get_top_entities(top_n=5)
        broken = 0
        for entry in top:
            articles = eidx.load_articles(entry["type"], entry["value"], max_articles=1)
            if not articles:
                broken += 1
        if broken:
            print_console(
                f"  Références brisées : {broken}/5 entités testées n'ont pas d'articles chargés",
                level="warning"
            )
            ok = False
        else:
            print_console(f"  Références : 5/5 entités testées — OK")
    except Exception as e:
        print_console(f"  Test références : ERREUR — {e}", level="warning")

    return ok


# ── Point d'entrée ────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Migration WUDD.ai : construction initiale des index articles et entités"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Simule la migration sans écrire de fichiers"
    )
    parser.add_argument(
        "--only", choices=["article", "entity"],
        help="Reconstruire uniquement l'index spécifié"
    )
    parser.add_argument(
        "--stats", action="store_true",
        help="Affiche l'état des index existants et quitte"
    )
    parser.add_argument(
        "--no-verify", action="store_true",
        help="Sauter la vérification de cohérence après construction"
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    project_root = _PROJECT_ROOT

    print_console("=" * 60)
    print_console("WUDD.ai — Migration des index (v2.4.0)")
    print_console("=" * 60)

    if args.stats:
        show_stats(project_root)
        return

    if args.dry_run:
        print_console("[MODE DRY-RUN — aucun fichier ne sera écrit]")

    t_total = time.time()

    # Construction article_index
    if args.only in (None, "article"):
        n_articles = build_article_index(project_root, dry_run=args.dry_run)
    else:
        n_articles = 0

    # Construction entity_index
    if args.only in (None, "entity"):
        n_refs = build_entity_index(project_root, dry_run=args.dry_run)
    else:
        n_refs = 0

    elapsed_total = time.time() - t_total
    print_console("-" * 60)
    print_console(f"Migration terminée en {elapsed_total:.1f}s")

    if not args.dry_run:
        if args.only in (None, "article"):
            print_console(f"  article_index.json : {n_articles} articles indexés")
        if args.only in (None, "entity"):
            print_console(f"  entity_index.json  : {n_refs} références entité-article")

        # Vérification de cohérence (sauf si --no-verify)
        if not args.no_verify:
            print_console("")
            ok = verify_indexes(project_root)
            if ok:
                print_console("✓ Index cohérents — migration réussie.")
            else:
                print_console(
                    "⚠ Des anomalies ont été détectées. "
                    "Relancez avec --only article ou --only entity pour reconstruire.",
                    level="warning"
                )
                sys.exit(1)
    else:
        print_console("[DRY-RUN] Aucun fichier écrit.")

    print_console("")
    print_console("Prochaines étapes :")
    if not args.dry_run:
        print_console("  1. Les index seront maintenus automatiquement par flux_watcher.py")
        print_console("  2. Pour vérifier l'état : python3 scripts/migrate_build_indexes.py --stats")
        print_console("  3. Pour reconstruire après une corruption :")
        print_console("       python3 scripts/migrate_build_indexes.py --only article")
        print_console("       python3 scripts/migrate_build_indexes.py --only entity")


if __name__ == "__main__":
    main()
