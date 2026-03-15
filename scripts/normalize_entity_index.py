#!/usr/bin/env python3
"""Script de normalisation des noms d'entités dans entity_index.json.

Migration v1 → v2 : les clés de l'index sont normalisées en minuscules
et un dictionnaire `caps` est ajouté pour conserver la forme d'affichage
canonique de chaque entité (ex. "OpenAI" pour la clé "org:openai").

Cas traités :
  - "OpenAI", "openai", "OPENAI" → clé "ORG:openai", caps "OpenAI"
  - "Emmanuel Macron" vs "emmanuel macron" → clé "PERSON:emmanuel macron"

Usage :
    python3 scripts/normalize_entity_index.py
    python3 scripts/normalize_entity_index.py --dry-run   # Affiche les stats sans écrire
    python3 scripts/normalize_entity_index.py --backup    # Sauvegarde entity_index.json.bak avant
"""

import argparse
import json
import shutil
import sys
from collections import Counter
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_ROOT))

from utils.entity_index import _cap_score, _normalize_entity_key, _update_caps

_INDEX_V1 = 1
_INDEX_V2 = 2
_INDEX_FILE = PROJECT_ROOT / "data" / "entity_index.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Normalise les clés de l'index d'entités (migration v1 → v2)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Affiche les stats et les conflits sans modifier le fichier.",
    )
    parser.add_argument(
        "--backup",
        action="store_true",
        help="Crée entity_index.json.bak avant la migration.",
    )
    return parser.parse_args()


def normalize_index(raw_index: dict) -> tuple[dict, dict, dict]:
    """Normalise les clés de l'index et construit le dict caps.

    Args:
        raw_index : dict {entity_key: [{file, idx, date}, ...]}

    Returns:
        Tuple (normalized_index, caps, merge_stats) où :
          - normalized_index : dict avec clés en minuscules
          - caps             : dict {clé_normalisée: forme_d_affichage}
          - merge_stats      : {clé_normalisée: nb_clés_fusionnées}
    """
    new_index: dict[str, list[dict]] = {}
    caps: dict[str, str] = {}
    # Compter combien de clés sources ont été fusionnées dans chaque clé normalisée
    source_keys: dict[str, set[str]] = {}

    for key, refs in raw_index.items():
        if ":" not in key:
            continue
        etype, _, name = key.partition(":")
        if not name:
            continue

        norm_key = _normalize_entity_key(etype, name)
        _update_caps(caps, norm_key, name)

        if not isinstance(refs, list):
            continue
        new_index.setdefault(norm_key, []).extend(refs)
        source_keys.setdefault(norm_key, set()).add(key)

    # Dédupliquer les références par (file, idx) pour chaque clé normalisée
    dedup_index: dict[str, list[dict]] = {}
    for key, refs in new_index.items():
        seen: set[tuple] = set()
        deduped = []
        for ref in refs:
            sig = (ref.get("file", ""), ref.get("idx", -1))
            if sig not in seen:
                seen.add(sig)
                deduped.append(ref)
        dedup_index[key] = deduped

    merge_stats = {
        k: len(v) for k, v in source_keys.items() if len(v) > 1
    }
    return dedup_index, caps, merge_stats


def main() -> None:
    args = parse_args()

    if not _INDEX_FILE.exists():
        print(f"Fichier introuvable : {_INDEX_FILE}")
        print("Lancez d'abord une reconstruction via `enrich_entities.py` ou `rebuild()`.")
        sys.exit(1)

    try:
        data = json.loads(_INDEX_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        print(f"Impossible de lire {_INDEX_FILE} : {e}")
        sys.exit(1)

    version = data.get("version", 0)
    raw_index = data.get("index", {})

    print(f"Version actuelle : {version}")
    print(f"Entités distinctes (avant) : {len(raw_index)}")
    total_refs_before = sum(len(v) for v in raw_index.values())
    print(f"Références totales (avant) : {total_refs_before}")

    if version == _INDEX_V2:
        # Déjà v2 : re-normaliser quand même (idempotent) pour corriger d'éventuelles
        # incohérences introduites manuellement ou par d'anciennes versions de code.
        print("\nIndex déjà en version 2 — re-normalisation idempotente.")
    elif version == _INDEX_V1:
        print("\nMigration v1 → v2 en cours…")
    else:
        print(f"\nVersion inconnue ({version}) — migration non supportée.")
        sys.exit(1)

    new_index, caps, merge_stats = normalize_index(raw_index)
    total_refs_after = sum(len(v) for v in new_index.values())

    print(f"\nEntités distinctes (après) : {len(new_index)}")
    print(f"Références totales (après) : {total_refs_after}")
    print(f"Références dédupliquées    : {total_refs_before - total_refs_after}")
    print(f"Fusions (plusieurs casses) : {len(merge_stats)}")

    if merge_stats:
        print("\nTop 20 fusions :")
        for key, count in sorted(merge_stats.items(), key=lambda x: -x[1])[:20]:
            display = caps.get(key, key)
            print(f"  {display!r:40s} ({count} variantes fusionnées) → {key!r}")

    if args.dry_run:
        print("\n[DRY-RUN] Aucune modification écrite.")
        return

    if args.backup and not args.dry_run:
        bak = _INDEX_FILE.with_suffix(".json.bak")
        shutil.copy2(_INDEX_FILE, bak)
        print(f"\nSauvegarde créée : {bak}")

    new_data = {
        "version": _INDEX_V2,
        "generated_at": data.get("generated_at", ""),
        "index": new_index,
        "caps": caps,
    }

    tmp = _INDEX_FILE.with_suffix(".tmp")
    try:
        tmp.write_text(
            json.dumps(new_data, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        tmp.replace(_INDEX_FILE)
        print(f"\nIndex normalisé écrit → {_INDEX_FILE}")
    except OSError as e:
        print(f"Erreur d'écriture : {e}")
        if tmp.exists():
            tmp.unlink()
        sys.exit(1)


if __name__ == "__main__":
    main()
