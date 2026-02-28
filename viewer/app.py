"""
WUDD.ai Viewer — Flask backend
Sert l'API de navigation de fichiers et le frontend React compilé.
"""

import json
import re
import datetime
from pathlib import Path
from flask import Flask, jsonify, send_file, request, abort, send_from_directory

app = Flask(__name__)

# La racine du projet est le dossier parent de viewer/
# resolve() AVANT parent.parent : __file__ peut être un chemin relatif
# ('app.py') quand Flask est lancé via `python3 app.py` depuis viewer/,
# auquel que (Path('app.py').parent.parent).resolve() → cwd au lieu de la racine.
PROJECT_ROOT = Path(__file__).resolve().parent.parent


# ── Utilitaires ───────────────────────────────────────────────────────────────

def safe_path(relative: str) -> Path:
    """Résout et valide un chemin pour qu'il reste dans PROJECT_ROOT."""
    resolved = (PROJECT_ROOT / relative).resolve()
    if not str(resolved).startswith(str(PROJECT_ROOT) + "/") and resolved != PROJECT_ROOT:
        abort(403, "Accès refusé")
    if not resolved.exists():
        abort(404, "Fichier non trouvé")
    return resolved


def collect_files() -> list:
    files = []

    def scan(directory: Path, file_type: str, flux_override: str | None = None):
        if not directory.exists():
            return
        exts = ["*.json"] if file_type == "json" else ["*.md", "*.markdown"]
        for ext in exts:
            for f in directory.rglob(ext):
                parts = f.relative_to(PROJECT_ROOT).parts
                if any(p in ("cache", ".git") for p in parts):
                    continue
                try:
                    stat = f.stat()
                    rel = f.relative_to(PROJECT_ROOT)
                    flux = flux_override or (f.parent.name if f.parent != directory else "")
                    files.append({
                        "name": f.name,
                        "path": str(rel).replace("\\", "/"),
                        "type": file_type,
                        "flux": flux,
                        "size": stat.st_size,
                        "modified": stat.st_mtime,
                    })
                except OSError:
                    continue

    # Scan large de data/ : couvre articles/, articles-from-rss/, et toute
    # autre structure que l'utilisateur pourrait avoir sous data/
    scan(PROJECT_ROOT / "data", "json")
    scan(PROJECT_ROOT / "rapports", "markdown")
    # Fichiers d'exemple (visibles tant que data/ et rapports/ sont vides)
    scan(PROJECT_ROOT / "samples", "json",     "Samples")
    scan(PROJECT_ROOT / "samples", "markdown", "Samples")
    return sorted(files, key=lambda x: x["modified"], reverse=True)


def parse_cron_field(s: str, lo: int, hi: int) -> list:
    if s == "*":
        return list(range(lo, hi + 1))
    if s.startswith("*/"):
        step = int(s[2:])
        return list(range(lo, hi + 1, step))
    if "," in s:
        return [int(x) for x in s.split(",")]
    if "-" in s:
        a, b = s.split("-", 1)
        return list(range(int(a), int(b) + 1))
    return [int(s)]


def next_cron_occurrence(cron: str, after: datetime.datetime | None = None) -> datetime.datetime | None:
    """Calcule la prochaine occurrence d'une expression cron à 5 champs."""
    if after is None:
        after = datetime.datetime.now()
    parts = cron.strip().split()
    if len(parts) != 5:
        return None
    try:
        minutes = parse_cron_field(parts[0], 0, 59)
        hours   = parse_cron_field(parts[1], 0, 23)
        doms    = parse_cron_field(parts[2], 1, 31)
        months  = parse_cron_field(parts[3], 1, 12)
        # cron DOW: 0=dim…6=sam ; Python isoweekday: 1=lun…7=dim
        if parts[4] == "*":
            dows = set(range(1, 8))
        else:
            raw = parse_cron_field(parts[4], 0, 7)
            # 0 et 7 = dimanche (isoweekday=7)
            dows = set(7 if d in (0, 7) else d for d in raw)

        current = after.replace(second=0, microsecond=0) + datetime.timedelta(minutes=1)
        end = after + datetime.timedelta(days=35)

        while current <= end:
            if (current.month in months
                    and current.day in doms
                    and current.isoweekday() in dows
                    and current.hour in hours
                    and current.minute in minutes):
                return current
            # Optimisation : avancer directement à la bonne minute
            valid_mins = sorted(m for m in minutes if m > current.minute)
            if not valid_mins:
                current = current.replace(minute=0) + datetime.timedelta(hours=1)
            else:
                current = current.replace(minute=valid_mins[0])
        return None
    except (ValueError, IndexError):
        return None


def cron_label(cron: str) -> str:
    """Description humaine en français d'une expression cron courante."""
    p = cron.strip().split()
    if len(p) != 5:
        return cron
    minute, hour, _, _, dow = p
    jours = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]
    if minute.startswith("*/"):
        return f"Toutes les {minute[2:]} min"
    if minute == "0" and hour.isdigit() and _ == "*":
        t = f"{int(hour):02d}:00"
        if dow == "*":
            return f"Quotidien à {t}"
        try:
            return f"{jours[int(dow) % 7]} à {t}"
        except (ValueError, IndexError):
            pass
    return cron


def latest_mtime(directory: Path) -> datetime.datetime | None:
    """Retourne la date de modification du fichier JSON le plus récent dans directory."""
    if not directory.exists():
        return None
    candidates = [
        f for f in directory.rglob("*.json")
        if "cache" not in f.relative_to(directory).parts
    ]
    if not candidates:
        return None
    return datetime.datetime.fromtimestamp(max(f.stat().st_mtime for f in candidates))


# ── Routes API ────────────────────────────────────────────────────────────────

@app.route("/api/files")
def api_files():
    return jsonify(collect_files())


@app.route("/api/content")
def api_content():
    path = request.args.get("path", "")
    if not path:
        abort(400)
    f = safe_path(path)
    return jsonify({"path": path, "content": f.read_text(encoding="utf-8", errors="replace")})


@app.route("/api/content", methods=["POST"])
def api_save_content():
    data = request.get_json(force=True)
    if not data or "path" not in data or "content" not in data:
        abort(400, "Champs 'path' et 'content' requis")
    rel = data["path"]
    # Restriction : uniquement data/ et config/ sont modifiables
    if not (rel.startswith("data/") or rel.startswith("config/")):
        abort(403, "Modification non autorisée hors de data/ et config/")
    target = (PROJECT_ROOT / rel).resolve()
    if not str(target).startswith(str(PROJECT_ROOT) + "/"):
        abort(403, "Accès refusé")
    if not target.exists():
        abort(404, "Fichier non trouvé")
    # Validation JSON si extension .json
    content = data["content"]
    if target.suffix == ".json":
        try:
            json.loads(content)
        except json.JSONDecodeError as e:
            abort(400, f"JSON invalide : {e}")
    try:
        target.write_text(content, encoding="utf-8")
    except OSError as e:
        abort(500, f"Erreur d'écriture : {e}")
    return jsonify({"ok": True})


@app.route("/api/search")
def api_search():
    q = request.args.get("q", "").strip()
    if len(q) < 2:
        return jsonify([])
    pattern = re.compile(re.escape(q), re.IGNORECASE)
    results = []
    for info in collect_files():
        f = PROJECT_ROOT / info["path"]
        try:
            lines = f.read_text(encoding="utf-8", errors="replace").splitlines()
            matches = [
                {"line": i + 1, "text": line.strip()[:200]}
                for i, line in enumerate(lines)
                if pattern.search(line)
            ]
            if matches:
                results.append({**info, "matches": matches[:5]})
        except OSError:
            continue
    return jsonify(results)


@app.route("/api/download")
def api_download():
    path = request.args.get("path", "")
    if not path:
        abort(400)
    f = safe_path(path)
    return send_file(f, as_attachment=True, download_name=f.name)


@app.route("/api/scheduler")
def api_scheduler():
    now = datetime.datetime.now()
    tasks = []

    # Tâches cron fixes (issues de archives/crontab)
    fixed = [
        {
            "name": "Extraction mots-clés RSS",
            "script": "get-keyword-from-rss.py",
            "cron": "0 1 * * *",
            "data_dir": PROJECT_ROOT / "data" / "articles-from-rss",
        },
        {
            "name": "Collecte multi-flux",
            "script": "scheduler_articles.py",
            "cron": "0 6 * * 1",
            "data_dir": PROJECT_ROOT / "data" / "articles",
        },
        {
            "name": "Vérification santé cron",
            "script": "check_cron_health.py",
            "cron": "*/10 * * * *",
            "data_dir": None,
            "log_file": PROJECT_ROOT / "rapports" / "cron_health.log",
        },
        {
            "name": "Radar thématique",
            "script": "radar_wudd.py",
            "cron": "0 5 28-31 * *",
            "data_dir": None,
            "log_file": PROJECT_ROOT / "rapports" / "cron_radar.log",
        },
    ]
    for t in fixed:
        if t.get("data_dir"):
            last_run = latest_mtime(t["data_dir"])
        elif t.get("log_file") and t["log_file"].exists():
            last_run = datetime.datetime.fromtimestamp(t["log_file"].stat().st_mtime)
        else:
            last_run = None
        next_run = next_cron_occurrence(t["cron"], now)
        tasks.append({
            "name": t["name"],
            "script": t["script"],
            "cron": t["cron"],
            "label": cron_label(t["cron"]),
            "last_run": last_run.isoformat() if last_run else None,
            "next_run": next_run.isoformat() if next_run else None,
            "flux": None,
        })

    # Tâches par flux (flux_json_sources.json)
    for fname in ("flux_json_sources.json", "flux_json_sources.example.json"):
        flux_file = PROJECT_ROOT / "config" / fname
        if flux_file.exists():
            try:
                flux_list = json.loads(flux_file.read_text(encoding="utf-8"))
                for flux in flux_list:
                    title = flux.get("title", "Flux inconnu")
                    # Support format plat (cron) et format imbriqué (scheduler.cron)
                    cron = (flux.get("cron")
                            or flux.get("scheduler", {}).get("cron", "0 6 * * 1"))
                    flux_dir = PROJECT_ROOT / "data" / "articles" / title.strip().replace(" ", "-").replace("\u00a0", "-")
                    last_run = latest_mtime(flux_dir)
                    next_run = next_cron_occurrence(cron, now)
                    tasks.append({
                        "name": f"Flux : {title}",
                        "script": "Get_data_from_JSONFile_AskSummary_v2.py",
                        "cron": cron,
                        "label": cron_label(cron),
                        "last_run": last_run.isoformat() if last_run else None,
                        "next_run": next_run.isoformat() if next_run else None,
                        "flux": title,
                    })
            except (json.JSONDecodeError, KeyError, TypeError):
                pass
            break  # Utiliser uniquement le premier fichier de config existant

    return jsonify({"tasks": tasks, "now": now.isoformat()})


@app.route("/api/keywords", methods=["GET"])
def api_get_keywords():
    path = PROJECT_ROOT / "config" / "keyword-to-search.json"
    if not path.exists():
        return jsonify([])
    try:
        return jsonify(json.loads(path.read_text(encoding="utf-8")))
    except json.JSONDecodeError:
        return jsonify([])


@app.route("/api/keywords", methods=["POST"])
def api_save_keywords():
    data = request.get_json(force=True)
    if not isinstance(data, list):
        abort(400, "Format invalide : tableau attendu")
    path = PROJECT_ROOT / "config" / "keyword-to-search.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return jsonify({"ok": True})


@app.route("/api/flux-sources", methods=["GET"])
def api_get_flux_sources():
    path = PROJECT_ROOT / "config" / "flux_json_sources.json"
    if not path.exists():
        # Retourner le fichier exemple si disponible
        example = PROJECT_ROOT / "config" / "flux_json_sources.example.json"
        if example.exists():
            try:
                return jsonify(json.loads(example.read_text(encoding="utf-8")))
            except json.JSONDecodeError:
                pass
        return jsonify([])
    try:
        return jsonify(json.loads(path.read_text(encoding="utf-8")))
    except json.JSONDecodeError:
        return jsonify([])


@app.route("/api/flux-sources", methods=["POST"])
def api_save_flux_sources():
    data = request.get_json(force=True)
    if not isinstance(data, list):
        abort(400, "Format invalide : tableau attendu")
    path = PROJECT_ROOT / "config" / "flux_json_sources.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return jsonify({"ok": True})


@app.route("/api/search/entity")
def api_search_entity():
    """Recherche cross-fichiers d'une valeur d'entité nommée."""
    q = request.args.get("q", "").strip()
    entity_type = request.args.get("type", "").strip()
    if len(q) < 2:
        return jsonify([])

    q_lower = q.lower()
    results = []

    data_dirs = [
        PROJECT_ROOT / "data" / "articles",
        PROJECT_ROOT / "data" / "articles-from-rss",
    ]

    for data_dir in data_dirs:
        if not data_dir.exists():
            continue
        for json_file in sorted(data_dir.rglob("*.json")):
            if "cache" in json_file.relative_to(data_dir).parts:
                continue
            try:
                articles = json.loads(json_file.read_text(encoding="utf-8", errors="replace"))
                if not isinstance(articles, list):
                    continue
            except (json.JSONDecodeError, OSError):
                continue

            for article in articles:
                ents = article.get("entities")
                if not ents or not isinstance(ents, dict):
                    continue

                matched_types = []
                for etype, values in ents.items():
                    if entity_type and etype != entity_type:
                        continue
                    if not isinstance(values, list):
                        continue
                    if any(q_lower in str(v).lower() for v in values):
                        matched_types.append(etype)

                if not matched_types:
                    continue

                resume = article.get("Résumé", "")
                idx = resume.lower().find(q_lower)
                if idx >= 0:
                    start = max(0, idx - 80)
                    end = min(len(resume), idx + len(q) + 80)
                    excerpt = (
                        ("…" if start > 0 else "")
                        + resume[start:end]
                        + ("…" if end < len(resume) else "")
                    )
                else:
                    excerpt = resume[:160] + ("…" if len(resume) > 160 else "")

                rel = json_file.relative_to(PROJECT_ROOT)
                results.append({
                    "path": str(rel).replace("\\", "/"),
                    "name": json_file.name,
                    "source": article.get("Sources", ""),
                    "date": article.get("Date de publication", ""),
                    "url": article.get("URL", ""),
                    "excerpt": excerpt,
                    "types": matched_types,
                })

    results.sort(key=lambda r: r["date"], reverse=True)
    return jsonify(results[:100])


@app.route("/api/entities/dashboard")
def api_entities_dashboard():
    """Agrège les entités de tous les fichiers JSON et retourne des stats globales."""
    data_dirs = [
        PROJECT_ROOT / "data" / "articles",
        PROJECT_ROOT / "data" / "articles-from-rss",
    ]

    total_files = 0
    total_articles = 0
    total_with_entities = 0
    # { type: { value: count } }
    by_type: dict[str, dict[str, int]] = {}

    for data_dir in data_dirs:
        if not data_dir.exists():
            continue
        for json_file in sorted(data_dir.rglob("*.json")):
            if "cache" in json_file.relative_to(data_dir).parts:
                continue
            try:
                articles = json.loads(json_file.read_text(encoding="utf-8", errors="replace"))
                if not isinstance(articles, list):
                    continue
            except (json.JSONDecodeError, OSError):
                continue

            total_files += 1
            total_articles += len(articles)

            for article in articles:
                ents = article.get("entities")
                if not ents or not isinstance(ents, dict):
                    continue
                has_ent = False
                for etype, values in ents.items():
                    if not isinstance(values, list) or not values:
                        continue
                    has_ent = True
                    if etype not in by_type:
                        by_type[etype] = {}
                    for v in values:
                        if isinstance(v, str) and v.strip():
                            key = v.strip()
                            by_type[etype][key] = by_type[etype].get(key, 0) + 1
                if has_ent:
                    total_with_entities += 1

    result_types = []
    for etype, value_counts in by_type.items():
        sorted_values = sorted(value_counts.items(), key=lambda x: x[1], reverse=True)
        result_types.append({
            "type": etype,
            "unique_count": len(sorted_values),
            "mention_count": sum(c for _, c in sorted_values),
            "top": [{"value": v, "count": c} for v, c in sorted_values[:15]],
        })
    result_types.sort(key=lambda x: x["mention_count"], reverse=True)

    return jsonify({
        "total_files": total_files,
        "total_articles": total_articles,
        "total_with_entities": total_with_entities,
        "by_type": result_types,
    })


@app.route("/api/entities/articles")
def api_entities_articles():
    """Retourne tous les articles contenant une entité donnée (type + valeur)."""
    entity_type = request.args.get("type", "").strip()
    entity_value = request.args.get("value", "").strip()
    if not entity_type or not entity_value:
        return jsonify({"error": "Paramètres type et value requis"}), 400

    results = []
    for data_dir in [PROJECT_ROOT / "data" / "articles", PROJECT_ROOT / "data" / "articles-from-rss"]:
        if not data_dir.exists():
            continue
        for json_file in sorted(data_dir.rglob("*.json")):
            if "cache" in json_file.relative_to(data_dir).parts:
                continue
            try:
                articles = json.loads(json_file.read_text(encoding="utf-8", errors="replace"))
                if not isinstance(articles, list):
                    continue
            except (json.JSONDecodeError, OSError):
                continue
            for article in articles:
                entities = article.get("entities", {})
                if not isinstance(entities, dict):
                    continue
                values = entities.get(entity_type, [])
                if isinstance(values, list) and entity_value in values:
                    results.append(article)

    results.sort(key=lambda a: a.get("Date de publication", ""), reverse=True)
    return jsonify(results)


# ── Serveur frontend React (production) ──────────────────────────────────────

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_app(path):
    dist = Path(__file__).parent / "dist"
    if not dist.exists():
        return (
            "<h1>Frontend non compilé</h1>"
            "<p>Exécutez <code>npm run build</code> dans le dossier <code>viewer/</code></p>",
            503,
        )
    target = dist / path
    if path and target.exists() and target.is_file():
        return send_from_directory(str(dist), path)
    # SPA fallback : toutes les routes renvoient index.html
    return send_from_directory(str(dist), "index.html")


if __name__ == "__main__":
    print(f"WUDD.ai Viewer — racine projet : {PROJECT_ROOT}")
    print("API disponible sur http://localhost:5050/api/files")
    app.run(host="0.0.0.0", port=5050, debug=False, threaded=True)
