#!/usr/bin/env python3
"""Détecteur de tendances : compare le volume de mentions des entités
sur les fenêtres 24h et 7j glissants et génère des alertes.

Sortie : data/alertes.json (liste d'alertes triées par ratio décroissant)

Usage :
    python3 scripts/trend_detector.py [--top N] [--threshold RATIO] [--dry-run]

Options :
    --top N           Nombre d'entités alertes à conserver (défaut: 20)
    --threshold RATIO Ratio minimal 24h/7j pour déclencher une alerte (défaut: 2.0)
    --dry-run         Affiche les alertes sans écrire alertes.json
"""

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Résolution robuste de la racine du projet
_SCRIPT_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _SCRIPT_DIR.parent
sys.path.insert(0, str(_PROJECT_ROOT))

from utils.logging import default_logger
from utils.config import get_config


# ── Constantes ───────────────────────────────────────────────────────────────

# Types d'entités à surveiller (on écarte les types trop génériques)
_MONITORED_TYPES = {
    "PERSON", "ORG", "GPE", "PRODUCT", "EVENT", "NORP", "LOC", "FAC"
}

_OUTPUT_FILE = _PROJECT_ROOT / "data" / "alertes.json"


# ── Parsing de date ───────────────────────────────────────────────────────────

def _parse_date(date_str: str):
    """Retourne un datetime UTC ou None."""
    if not date_str:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(date_str, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(date_str).astimezone(timezone.utc)
    except Exception:
        pass
    return None


# ── Collecte des entités ──────────────────────────────────────────────────────

def collect_entity_mentions(project_root: Path, window_days: int) -> dict[str, dict[str, int]]:
    """Compte les mentions de chaque entité dans la fenêtre temporelle.

    Returns:
        { "TYPE:valeur" : count }
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=window_days)
    counts: dict[str, int] = defaultdict(int)

    scan_dirs = [
        project_root / "data" / "articles",
        project_root / "data" / "articles-from-rss",
    ]

    for scan_dir in scan_dirs:
        if not scan_dir.exists():
            continue
        for json_file in scan_dir.rglob("*.json"):
            if "cache" in json_file.relative_to(scan_dir).parts:
                continue
            try:
                data = json.loads(json_file.read_text(encoding="utf-8", errors="replace"))
                if not isinstance(data, list):
                    continue
            except (json.JSONDecodeError, OSError):
                continue

            for article in data:
                dt = _parse_date(article.get("Date de publication", ""))
                if dt is None or dt < cutoff:
                    continue
                entities = article.get("entities")
                if not isinstance(entities, dict):
                    continue
                for etype, values in entities.items():
                    if etype not in _MONITORED_TYPES:
                        continue
                    if not isinstance(values, list):
                        continue
                    for v in values:
                        if isinstance(v, str) and v.strip():
                            counts[f"{etype}:{v.strip()}"] += 1

    return counts


# ── Génération des alertes ────────────────────────────────────────────────────

def detect_trends(
    counts_24h: dict[str, int],
    counts_7j: dict[str, int],
    threshold: float,
    top_n: int,
) -> list[dict]:
    """Compare les deux fenêtres et retourne les entités en tendance.

    Une alerte est déclenchée si ratio (count_24h / avg_per_day_7j) >= threshold.
    """
    alerts = []

    for key, count_24h in counts_24h.items():
        if count_24h < 2:
            continue  # Ignorer les hapax

        avg_per_day_7j = counts_7j.get(key, 0) / 7.0
        if avg_per_day_7j == 0:
            # Entité absente des 7j : nouveauté absolue
            ratio = float("inf") if count_24h >= 3 else 0.0
        else:
            ratio = count_24h / avg_per_day_7j

        if ratio < threshold:
            continue

        etype, value = key.split(":", 1)
        alerts.append({
            "entity_type": etype,
            "entity_value": value,
            "count_24h": count_24h,
            "count_7j": counts_7j.get(key, 0),
            "ratio": round(ratio, 2) if ratio != float("inf") else 999.9,
            "niveau": _niveau(ratio),
            "detected_at": datetime.now(timezone.utc).isoformat(),
        })

    alerts.sort(key=lambda a: a["ratio"], reverse=True)
    return alerts[:top_n]


def _niveau(ratio: float) -> str:
    """Retourne le niveau d'alerte selon le ratio."""
    if ratio >= 5.0:
        return "critique"
    if ratio >= 3.0:
        return "élevé"
    return "modéré"


# ── Point d'entrée ─────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(description="Détecteur de tendances WUDD.ai")
    parser.add_argument("--top", type=int, default=20, help="Nombre max d'alertes (défaut: 20)")
    parser.add_argument(
        "--threshold", type=float, default=2.0,
        help="Ratio 24h/7j minimal pour déclencher une alerte (défaut: 2.0)"
    )
    parser.add_argument("--dry-run", action="store_true", help="Affiche sans sauvegarder")
    return parser.parse_args()


def main():
    args = parse_args()
    config = get_config()
    project_root = config.project_root

    default_logger.info("=== Détecteur de tendances WUDD.ai ===")
    default_logger.info(f"Seuil : ratio ≥ {args.threshold} | Top {args.top}")

    default_logger.info("Collecte des mentions (fenêtre 24h)…")
    counts_24h = collect_entity_mentions(project_root, window_days=1)
    default_logger.info(f"  → {len(counts_24h)} entités trouvées sur 24h")

    default_logger.info("Collecte des mentions (fenêtre 7j)…")
    counts_7j = collect_entity_mentions(project_root, window_days=7)
    default_logger.info(f"  → {len(counts_7j)} entités trouvées sur 7j")

    alerts = detect_trends(counts_24h, counts_7j, args.threshold, args.top)
    default_logger.info(f"{len(alerts)} alerte(s) détectée(s)")

    if not alerts:
        default_logger.info("Aucune tendance significative détectée.")
    else:
        for a in alerts[:10]:
            default_logger.info(
                f"  [{a['niveau'].upper()}] {a['entity_type']}:{a['entity_value']} "
                f"— {a['count_24h']} mentions/24h vs {a['count_7j']} /7j "
                f"(ratio {a['ratio']})"
            )

    if args.dry_run:
        default_logger.info("[DRY-RUN] Résultats non sauvegardés.")
        print(json.dumps(alerts, ensure_ascii=False, indent=2))
        return

    _OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    _OUTPUT_FILE.write_text(
        json.dumps(alerts, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    default_logger.info(f"Alertes sauvegardées dans {_OUTPUT_FILE}")


if __name__ == "__main__":
    main()
