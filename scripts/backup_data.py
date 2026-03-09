#!/usr/bin/env python3
"""
backup_data.py — Sauvegarde incrémentale de data/ vers BACKUP_L1 et BACKUP_L2.

Séquence :
  1. Si BACKUP_L1 et BACKUP_L2 sont définis et que BACKUP_L1 existe →
       copie BACKUP_L1 → BACKUP_L2 (remplace, sans doublons)
  2. Si BACKUP_L1 est défini →
       copie data/ → BACKUP_L1 (remplace, sans doublons)

Variables d'environnement requises (dans .env) :
  BACKUP_L1  Chemin absolu de la destination principale
  BACKUP_L2  Chemin absolu de la destination secondaire (optionnel)

Usage :
  python3 scripts/backup_data.py
  python3 scripts/backup_data.py --dry-run
"""

import argparse
import datetime
import os
import shutil
import sys
from pathlib import Path

# ── Résolution du projet ───────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env", override=False)
except ImportError:
    pass


# ── Logging horodaté ──────────────────────────────────────────────────────────

def log(msg: str) -> None:
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ── Copie incrémentale (purge + copie) ────────────────────────────────────────

def sync_dirs(src: Path, dst: Path, dry_run: bool = False) -> dict:
    """
    Copie src → dst en remplaçant le contenu existant.
    - Supprime les fichiers dans dst absents de src (purge)
    - Copie les nouveaux fichiers et les fichiers modifiés
    Retourne un dict { copied, deleted, errors }.
    """
    stats = {"copied": 0, "deleted": 0, "errors": 0}

    if not src.exists():
        log(f"  ✗ Source introuvable : {src}")
        stats["errors"] += 1
        return stats

    if not dry_run:
        dst.mkdir(parents=True, exist_ok=True)

    # Index des fichiers sources
    src_files: dict[Path, Path] = {}
    for f in src.rglob("*"):
        if f.is_file():
            rel = f.relative_to(src)
            src_files[rel] = f

    # Purge : supprimer dans dst ce qui n'est plus dans src
    if dst.exists():
        for f in list(dst.rglob("*")):
            if f.is_file():
                rel = f.relative_to(dst)
                if rel not in src_files:
                    log(f"  - Suppression : {rel}")
                    if not dry_run:
                        try:
                            f.unlink()
                            stats["deleted"] += 1
                        except OSError as e:
                            log(f"  ✗ Erreur suppression {rel} : {e}")
                            stats["errors"] += 1
                    else:
                        stats["deleted"] += 1

    # Copie : nouveaux fichiers et fichiers modifiés
    for rel, src_f in src_files.items():
        dst_f = dst / rel
        need_copy = True
        if dst_f.exists():
            # Ne re-copier que si la taille ou la date diffère
            src_stat = src_f.stat()
            dst_stat = dst_f.stat()
            if (src_stat.st_size == dst_stat.st_size
                    and abs(src_stat.st_mtime - dst_stat.st_mtime) < 2):
                need_copy = False

        if need_copy:
            log(f"  + Copie : {rel}")
            if not dry_run:
                try:
                    dst_f.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src_f, dst_f)
                    stats["copied"] += 1
                except OSError as e:
                    log(f"  ✗ Erreur copie {rel} : {e}")
                    stats["errors"] += 1
            else:
                stats["copied"] += 1

    return stats


# ── Point d'entrée ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Backup data/ → BACKUP_L1 → BACKUP_L2")
    parser.add_argument("--dry-run", action="store_true",
                        help="Simulation : affiche les actions sans les exécuter")
    args = parser.parse_args()
    dry_run = args.dry_run

    backup_l1 = os.environ.get("BACKUP_L1", "").strip()
    backup_l2 = os.environ.get("BACKUP_L2", "").strip()
    data_dir = PROJECT_ROOT / "data"

    log("=" * 60)
    log(f"WUDD.ai Backup {'[DRY-RUN] ' if dry_run else ''}— démarrage")
    log(f"  data/     : {data_dir}")
    log(f"  BACKUP_L1 : {backup_l1 or '(non défini)'}")
    log(f"  BACKUP_L2 : {backup_l2 or '(non défini)'}")
    log("=" * 60)

    if not backup_l1:
        log("✗ BACKUP_L1 non défini — rien à faire. Configurez BACKUP_L1 dans .env.")
        sys.exit(0)

    errors_total = 0

    # Étape 1 : BACKUP_L1 → BACKUP_L2 (si L2 défini et L1 existe)
    if backup_l2:
        l1_path = Path(backup_l1)
        l2_path = Path(backup_l2)
        if l1_path.exists():
            log(f"Étape 1 : {l1_path} → {l2_path}")
            stats = sync_dirs(l1_path, l2_path, dry_run=dry_run)
            log(f"  → Copié : {stats['copied']}, Supprimé : {stats['deleted']}, Erreurs : {stats['errors']}")
            errors_total += stats["errors"]
        else:
            log(f"Étape 1 : BACKUP_L1 ({l1_path}) n'existe pas encore — saut de la copie L1→L2")
    else:
        log("Étape 1 : BACKUP_L2 non défini — saut de la copie L1→L2")

    # Étape 2 : data/ → BACKUP_L1
    l1_path = Path(backup_l1)
    log(f"Étape 2 : {data_dir} → {l1_path}")
    stats = sync_dirs(data_dir, l1_path, dry_run=dry_run)
    log(f"  → Copié : {stats['copied']}, Supprimé : {stats['deleted']}, Erreurs : {stats['errors']}")
    errors_total += stats["errors"]

    log("=" * 60)
    if errors_total == 0:
        log(f"✓ Backup {'simulé ' if dry_run else ''}terminé sans erreur.")
    else:
        log(f"✗ Backup terminé avec {errors_total} erreur(s).")
    log("=" * 60)

    sys.exit(1 if errors_total > 0 else 0)


if __name__ == "__main__":
    main()
