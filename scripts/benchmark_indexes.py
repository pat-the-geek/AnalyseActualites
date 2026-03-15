#!/usr/bin/env python3
"""
benchmark_indexes.py — Mesure des gains de performance des index WUDD.ai

Compare les opérations clés AVANT (scan rglob) et APRÈS (lecture index) :
  1. ScoringEngine.get_top_articles()      vs get_top_articles_from_index()
  2. EntityIndex.load_articles()           vs scan rglob complet
  3. compute_top_entities() O(n) fix       vs ancienne version O(n²) simulée
  4. Synthèse IA : état du cache

Usage :
    python3 scripts/benchmark_indexes.py
    python3 scripts/benchmark_indexes.py --iterations 5
"""

import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PROJECT_ROOT))

from utils.logging import print_console


# ── Utilitaires ───────────────────────────────────────────────────────────────

def _fmt(seconds: float) -> str:
    if seconds >= 1:
        return f"{seconds:.2f} s"
    return f"{seconds * 1000:.1f} ms"


def _gain(before: float, after: float) -> str:
    if after == 0 or before == 0:
        return "N/A"
    factor = before / after
    if factor >= 2:
        return f"×{factor:.0f} plus rapide"
    pct = (before - after) / before * 100
    return f"-{pct:.0f}%"


def _timer(fn, iterations=1):
    times = []
    result = None
    for _ in range(iterations):
        t0 = time.perf_counter()
        result = fn()
        times.append(time.perf_counter() - t0)
    return result, min(times)  # Retourne le meilleur temps


def _separator(title: str = "") -> None:
    if title:
        print(f"\n{'─' * 20} {title} {'─' * 20}")
    else:
        print("─" * 60)


# ── Benchmark 1 : ScoringEngine avec et sans index ───────────────────────────

def bench_scoring(project_root: Path, iterations: int) -> dict:
    _separator("1. Top articles — rglob vs index")

    from utils.scoring import ScoringEngine, get_scoring_engine

    # AVANT : scan rglob complet
    engine_old = ScoringEngine(project_root)
    _, t_before = _timer(
        lambda: engine_old.get_top_articles(top_n=10, hours=48),
        iterations
    )

    # APRÈS : lecture de l'index
    engine_new = get_scoring_engine(project_root)
    result, t_after = _timer(
        lambda: engine_new.get_top_articles_from_index(top_n=10, hours=48),
        iterations
    )

    print(f"  Méthode rglob (avant) : {_fmt(t_before)}")
    print(f"  Via article_index     : {_fmt(t_after)}  →  {_gain(t_before, t_after)}")
    print(f"  Articles retournés    : {len(result)}")
    return {"before": t_before, "after": t_after, "n": len(result)}


# ── Benchmark 2 : Recherche par entité avec et sans index ────────────────────

def bench_entity_search(project_root: Path, iterations: int) -> dict:
    _separator("2. Recherche entité — rglob vs entity_index")

    from utils.entity_index import get_entity_index

    eidx = get_entity_index(project_root)
    top = eidx.get_top_entities(top_n=1)
    if not top:
        print("  ⚠ Aucune entité dans l'index — migration non effectuée ?")
        print("    Lancez d'abord : python3 scripts/migrate_build_indexes.py")
        return {}

    entity_type  = top[0]["type"]
    entity_value = top[0]["value"]
    print(f"  Entité testée : {entity_type}:{entity_value} ({top[0]['count']} refs)")

    # AVANT : scan rglob complet de data/
    def scan_rglob():
        articles = []
        seen = set()
        for data_dir in [project_root / "data" / "articles",
                         project_root / "data" / "articles-from-rss"]:
            if not data_dir.exists():
                continue
            for json_file in sorted(data_dir.rglob("*.json")):
                if "cache" in json_file.relative_to(data_dir).parts:
                    continue
                try:
                    arts = json.loads(json_file.read_text(encoding="utf-8", errors="replace"))
                    if not isinstance(arts, list):
                        continue
                except Exception:
                    continue
                for article in arts:
                    ents = article.get("entities", {})
                    if not isinstance(ents, dict):
                        continue
                    if entity_value in ents.get(entity_type, []):
                        url = article.get("URL", "")
                        if url not in seen:
                            seen.add(url)
                            articles.append(article)
        return articles

    _, t_before = _timer(scan_rglob, iterations)

    # APRÈS : lecture de l'index
    _, t_after = _timer(
        lambda: eidx.load_articles(entity_type, entity_value),
        iterations
    )

    result = eidx.load_articles(entity_type, entity_value)
    print(f"  Scan rglob (avant)    : {_fmt(t_before)}")
    print(f"  Via entity_index      : {_fmt(t_after)}  →  {_gain(t_before, t_after)}")
    print(f"  Articles trouvés      : {len(result)}")
    return {"before": t_before, "after": t_after, "n": len(result)}


# ── Benchmark 3 : Co-occurrences avec et sans index ──────────────────────────

def bench_cooccurrences(project_root: Path, iterations: int) -> dict:
    _separator("3. Co-occurrences — scan complet vs entity_index")

    from utils.entity_index import get_entity_index

    eidx = get_entity_index(project_root)
    top = eidx.get_top_entities(top_n=1)
    if not top:
        print("  ⚠ Index entités absent.")
        return {}

    entity_type  = top[0]["type"]
    entity_value = top[0]["value"]

    # AVANT : scan rglob + calcul co-occ O(F×A×E²)
    def cooc_rglob():
        cooc = Counter()
        for data_dir in [project_root / "data" / "articles",
                         project_root / "data" / "articles-from-rss"]:
            if not data_dir.exists():
                continue
            for json_file in data_dir.rglob("*.json"):
                if "cache" in json_file.relative_to(data_dir).parts:
                    continue
                try:
                    arts = json.loads(json_file.read_text(encoding="utf-8", errors="replace"))
                except Exception:
                    continue
                for article in arts:
                    ents = article.get("entities", {})
                    if not isinstance(ents, dict):
                        continue
                    if entity_value not in ents.get(entity_type, []):
                        continue
                    for etype, evals in ents.items():
                        if isinstance(evals, list):
                            for ev in evals:
                                if not (etype == entity_type and ev == entity_value):
                                    cooc[(etype, ev)] += 1
        return cooc.most_common(15)

    _, t_before = _timer(cooc_rglob, iterations)

    # APRÈS : via entity_index (charge uniquement les articles pertinents)
    _, t_after = _timer(
        lambda: eidx.get_cooccurrences(entity_type, entity_value, top_n=15),
        iterations
    )

    print(f"  Scan rglob O(F×A×E²) : {_fmt(t_before)}")
    print(f"  Via entity_index      : {_fmt(t_after)}  →  {_gain(t_before, t_after)}")
    return {"before": t_before, "after": t_after}


# ── Benchmark 4 : compute_top_entities O(n) vs O(n²) simulé ─────────────────

def bench_compute_top_entities(iterations: int) -> dict:
    _separator("4. compute_top_entities — O(n²) simulé vs O(n) corrigé")

    from scripts.generate_briefing import compute_top_entities

    # Jeu de données : 2000 articles avec 10 entités chacun
    N = 2000
    articles = [
        {"entities": {
            "PERSON": [f"Personne{i % 80}", f"Personne{(i + 1) % 80}"],
            "ORG":    [f"Org{i % 40}"],
            "GPE":    [f"Pays{i % 20}"],
        }}
        for i in range(N)
    ]

    # AVANT : version O(n²) simulée (double boucle — ancienne implémentation)
    def old_compute_top_entities(articles_in, top_n=10):
        counter = Counter()
        type_map = {}
        for article in articles_in:
            ents = article.get("entities", {})
            for etype, names in ents.items():
                if not isinstance(names, list):
                    continue
                for name in names:
                    if isinstance(name, str) and name.strip():
                        key = name.strip().lower()
                        counter[key] += 1
                        type_map.setdefault(key, etype)
        results = []
        for key, count in counter.most_common(top_n):
            orig_name = key
            for article in articles_in:          # ← double boucle O(n²)
                for etype, names in (article.get("entities") or {}).items():
                    if isinstance(names, list):
                        for name in names:
                            if isinstance(name, str) and name.strip().lower() == key:
                                orig_name = name.strip()
                                break
            results.append((type_map.get(key, "?"), orig_name, count))
        return results

    _, t_before = _timer(lambda: old_compute_top_entities(articles, 10), iterations)
    _, t_after  = _timer(lambda: compute_top_entities(articles, 10), iterations)

    print(f"  Ancienne version O(n²) : {_fmt(t_before)}  ({N} articles)")
    print(f"  Version corrigée O(n)  : {_fmt(t_after)}  →  {_gain(t_before, t_after)}")
    return {"before": t_before, "after": t_after, "n": N}


# ── Benchmark 5 : état du cache de synthèse ──────────────────────────────────

def bench_synthesis_cache(project_root: Path) -> None:
    _separator("5. Cache de synthèse IA")

    from utils.synthesis_cache import get_synthesis_cache
    sc = get_synthesis_cache(project_root)
    stats = sc.stats()

    print(f"  Entrées valides   : {stats['valid']}")
    print(f"  Entrées expirées  : {stats['expired']}")
    print(f"  Total             : {stats['total']}")

    if stats["valid"] > 0:
        print(f"  → {stats['valid']} entité(s) évitent 210s d'appels IA à la prochaine consultation")
    else:
        print("  → Cache vide (se remplit à chaque clic 'Contexte entité' dans le viewer)")


# ── Rapport de taille des index ───────────────────────────────────────────────

def bench_index_sizes(project_root: Path) -> None:
    _separator("6. Taille des index sur disque")

    files = {
        "article_index.json" : project_root / "data" / "article_index.json",
        "entity_index.json"  : project_root / "data" / "entity_index.json",
        "synthesis_cache.json": project_root / "data" / "synthesis_cache.json",
    }

    for name, path in files.items():
        if path.exists():
            size = path.stat().st_size
            if size >= 1_000_000:
                size_str = f"{size / 1_000_000:.1f} Mo"
            elif size >= 1_000:
                size_str = f"{size / 1_000:.0f} Ko"
            else:
                size_str = f"{size} o"
            print(f"  {name:<25} : {size_str}")

            # Charger et compter pour valider
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if name == "article_index.json":
                    n = len(data.get("articles", []))
                    print(f"    → {n} articles indexés")
                elif name == "entity_index.json":
                    n = len(data.get("index", {}))
                    print(f"    → {n} entités distinctes")
                elif name == "synthesis_cache.json":
                    print(f"    → {len(data)} entrées")
            except Exception:
                pass
        else:
            print(f"  {name:<25} : absent (lancez migrate_build_indexes.py)")


# ── Résumé ────────────────────────────────────────────────────────────────────

def print_summary(results: dict) -> None:
    _separator()
    print("\n  RÉSUMÉ DES GAINS\n")
    headers = ("Opération", "Avant", "Après", "Gain")
    rows = []
    for label, r in results.items():
        if r and "before" in r and "after" in r:
            rows.append((label, _fmt(r["before"]), _fmt(r["after"]), _gain(r["before"], r["after"])))

    col_w = [max(len(h), max((len(r[i]) for r in rows), default=0)) for i, h in enumerate(headers)]
    fmt = "  " + "  ".join(f"{{:<{w}}}" for w in col_w)
    print(fmt.format(*headers))
    print("  " + "  ".join("─" * w for w in col_w))
    for row in rows:
        print(fmt.format(*row))
    print()


# ── Point d'entrée ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Benchmark des gains de performance WUDD.ai")
    parser.add_argument("--iterations", type=int, default=3,
                        help="Nombre de répétitions par mesure (défaut: 3)")
    args = parser.parse_args()

    project_root = _PROJECT_ROOT
    it = args.iterations

    print(f"\n  WUDD.ai — Benchmark des index (×{it} itérations)\n")

    results = {}
    results["Top articles (scoring)"]    = bench_scoring(project_root, it)
    results["Recherche par entité"]      = bench_entity_search(project_root, it)
    results["Co-occurrences entités"]    = bench_cooccurrences(project_root, it)
    results["compute_top_entities O(n)"] = bench_compute_top_entities(it)

    bench_synthesis_cache(project_root)
    bench_index_sizes(project_root)
    print_summary(results)


if __name__ == "__main__":
    main()
