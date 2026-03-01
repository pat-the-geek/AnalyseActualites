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
            "top": [{"value": v, "count": c} for v, c in sorted_values[:50]],
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


@app.route("/api/entities/cooccurrences")
def api_entities_cooccurrences():
    """Retourne les entités co-occurrentes d'une entité donnée (via articles partagés).

    Paramètres :
      type, value  — entité centrale
      limit        — max d'entités niveau 1 (défaut 40)
      depth        — profondeur du graphe : 1 ou 2 (défaut 1)
      limit_l2     — max d'entités niveau 2 par nœud L1 (défaut 4)
    """
    entity_type = request.args.get("type", "").strip()
    entity_value = request.args.get("value", "").strip()
    depth = min(int(request.args.get("depth", 1)), 2)
    # Quand depth=2 on réduit L1 pour garder le graphe lisible
    limit_l1 = min(int(request.args.get("limit", 40)), 100)
    if depth >= 2:
        limit_l1 = min(limit_l1, 12)
    limit_l2 = min(int(request.args.get("limit_l2", 4)), 15)

    if not entity_type or not entity_value:
        return jsonify({"error": "Paramètres type et value requis"}), 400

    def node_id(t, v):
        return f"{t}:{v}"

    # ── Chargement unique de tous les articles ────────────────────────────────
    all_articles: list[dict] = []
    for data_dir in [PROJECT_ROOT / "data" / "articles", PROJECT_ROOT / "data" / "articles-from-rss"]:
        if not data_dir.exists():
            continue
        for json_file in sorted(data_dir.rglob("*.json")):
            if "cache" in json_file.relative_to(data_dir).parts:
                continue
            try:
                arts = json.loads(json_file.read_text(encoding="utf-8", errors="replace"))
                if isinstance(arts, list):
                    all_articles.extend(arts)
            except (json.JSONDecodeError, OSError):
                continue

    # ── Passe 1 : co-occurrences L1 ──────────────────────────────────────────
    cooc_l1: dict[tuple[str, str], int] = {}
    for article in all_articles:
        entities = article.get("entities", {})
        if not isinstance(entities, dict):
            continue
        values = entities.get(entity_type, [])
        if not isinstance(values, list) or entity_value not in values:
            continue
        for etype, evals in entities.items():
            if not isinstance(evals, list):
                continue
            for ev in evals:
                if etype == entity_type and ev == entity_value:
                    continue
                key = (etype, ev)
                cooc_l1[key] = cooc_l1.get(key, 0) + 1

    sorted_l1 = sorted(cooc_l1.items(), key=lambda x: x[1], reverse=True)[:limit_l1]
    top_l1_set: set[tuple[str, str]] = {k for k, _ in sorted_l1}

    # ── Construction des nœuds / arêtes L1 ───────────────────────────────────
    nodes = [{"type": entity_type, "value": entity_value, "count": 0,
               "central": True, "level": 0}]
    edges = []

    for (etype, ev), count in sorted_l1:
        nodes.append({"type": etype, "value": ev, "count": count,
                       "central": False, "level": 1})
        edges.append({"source": node_id(entity_type, entity_value),
                       "target": node_id(etype, ev), "weight": count})

    # ── Passe 2 : co-occurrences L2 (optionnel) ──────────────────────────────
    if depth >= 2 and top_l1_set:
        # Pour chaque article, identifie les entités L1 présentes, puis
        # accumule leurs co-occurrences (→ candidats L2).
        cooc_l2: dict[tuple[tuple, tuple], int] = {}
        for article in all_articles:
            entities = article.get("entities", {})
            if not isinstance(entities, dict):
                continue
            # Entités L1 présentes dans cet article
            l1_here = set()
            for etype, evals in entities.items():
                if not isinstance(evals, list):
                    continue
                for ev in evals:
                    if (etype, ev) in top_l1_set:
                        l1_here.add((etype, ev))
            if not l1_here:
                continue
            # Co-occurrences entre chaque nœud L1 et les autres entités
            for l1_key in l1_here:
                for etype, evals in entities.items():
                    if not isinstance(evals, list):
                        continue
                    for ev in evals:
                        co_key = (etype, ev)
                        if co_key == l1_key:
                            continue
                        if co_key == (entity_type, entity_value):
                            continue  # évite l'arête de retour vers le centre
                        cooc_l2[(l1_key, co_key)] = cooc_l2.get((l1_key, co_key), 0) + 1

        # Regroupe par nœud L1
        l1_coocs: dict[tuple, list] = {}
        for (l1_key, co_key), count in cooc_l2.items():
            l1_coocs.setdefault(l1_key, []).append((co_key, count))

        existing: set[tuple[str, str]] = {(entity_type, entity_value)} | top_l1_set
        added_l2: set[tuple[str, str]] = set()

        for l1_key, coocs in l1_coocs.items():
            top_for_l1 = sorted(
                [x for x in coocs if x[0] not in existing],
                key=lambda x: x[1],
                reverse=True,
            )[:limit_l2]
            for (etype, ev), count in top_for_l1:
                l2_key = (etype, ev)
                if l2_key not in added_l2:
                    nodes.append({"type": etype, "value": ev, "count": count,
                                   "central": False, "level": 2})
                    added_l2.add(l2_key)
                    existing.add(l2_key)
                edges.append({"source": node_id(*l1_key),
                               "target": node_id(etype, ev),
                               "weight": count})

    return jsonify({"nodes": nodes, "edges": edges, "total_cooc": len(cooc_l1)})


@app.route("/api/entities/geocode", methods=["POST"])
def api_entities_geocode():
    """Géocode une liste d'entités via Wikipedia API avec cache JSON local."""
    import requests as req

    names = request.get_json(force=True) or []
    if not names or not isinstance(names, list):
        return jsonify({})

    cache_path = PROJECT_ROOT / "data" / "geocode_cache.json"
    cache = {}
    if cache_path.exists():
        try:
            cache = json.loads(cache_path.read_text(encoding="utf-8"))
        except Exception:
            cache = {}

    to_fetch = [n for n in names if n not in cache]

    WIKIPEDIA_UA = (
        "WUDD.ai/2.1.0 (news monitoring tool; "
        "https://github.com/patrickostertag) python-requests"
    )

    BATCH = 50
    for i in range(0, len(to_fetch), BATCH):
        batch = to_fetch[i : i + BATCH]
        titles_str = "|".join(batch)
        fetched_coords: dict[str, dict] = {}

        for lang in ("fr", "en"):
            try:
                r = req.get(
                    f"https://{lang}.wikipedia.org/w/api.php",
                    params={
                        "action": "query",
                        "titles": titles_str,
                        "prop": "coordinates",
                        "format": "json",
                        "origin": "*",
                    },
                    headers={"User-Agent": WIKIPEDIA_UA},
                    timeout=10,
                )
                data = r.json()
                pages = data.get("query", {}).get("pages", {})
                # normalizations : associe les redirections aux noms originaux
                normalized = {
                    n["from"]: n["to"]
                    for n in data.get("query", {}).get("normalized", [])
                }
                for page in pages.values():
                    if "coordinates" not in page:
                        continue
                    title = page.get("title", "")
                    coords = {
                        "lat": page["coordinates"][0]["lat"],
                        "lon": page["coordinates"][0]["lon"],
                    }
                    fetched_coords[title] = coords
                    # mappe aussi la forme originale si redirigée
                    for orig, norm in normalized.items():
                        if norm == title:
                            fetched_coords[orig] = coords
            except Exception:
                continue

            if lang == "fr" and len(fetched_coords) >= len(batch):
                break  # tout trouvé en FR

        for name in batch:
            if name not in cache:
                cache[name] = fetched_coords.get(name)  # None si introuvable

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    return jsonify({n: cache.get(n) for n in names})


@app.route("/api/entities/images", methods=["POST"])
def api_entities_images():
    """Récupère les images Wikipedia d'une liste d'entités.

    Accepte [{name, type}] ou [str] (compat. ascendante).
    Stratégie :
      - PERSON               → Wikipedia pageimages (portrait)
      - ORG / PRODUCT        → Wikidata P154 (logo officiel) + fallback pageimages
      - autres / inconnus    → Wikipedia pageimages
    """
    import requests as req

    body = request.get_json(force=True) or []
    if not body or not isinstance(body, list):
        return jsonify({})

    # Normalise l'entrée en [{name, type}]
    entities: list[dict] = []
    for item in body:
        if isinstance(item, dict):
            entities.append({"name": item.get("name", "").strip(), "type": item.get("type", "").upper()})
        elif isinstance(item, str):
            entities.append({"name": item.strip(), "type": ""})
    entities = [e for e in entities if e["name"]]

    UA = "WUDD.ai/2.1.0 (news monitoring tool; https://github.com/patrickostertag) python-requests"
    THUMB = 200
    BATCH = 50

    cache_path = PROJECT_ROOT / "data" / "images_cache.json"
    cache: dict = {}
    if cache_path.exists():
        try:
            cache = json.loads(cache_path.read_text(encoding="utf-8"))
        except Exception:
            cache = {}

    to_fetch = [e for e in entities if e["name"] not in cache]
    if not to_fetch:
        return jsonify({e["name"]: cache.get(e["name"]) for e in entities})

    # ── Séparer PERSON vs ORG/PRODUCT vs autres ──────────────────────────────
    person_names = [e["name"] for e in to_fetch if e["type"] == "PERSON"]
    logo_names   = [e["name"] for e in to_fetch if e["type"] in ("ORG", "PRODUCT")]
    other_names  = [e["name"] for e in to_fetch if e["type"] not in ("PERSON", "ORG", "PRODUCT")]

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _pageimages(names_batch: list[str]) -> dict[str, dict]:
        """Retourne {name: {url,width,height}} via Wikipedia pageimages."""
        result: dict[str, dict] = {}
        for i in range(0, len(names_batch), BATCH):
            batch = names_batch[i : i + BATCH]
            titles_str = "|".join(batch)
            for lang in ("fr", "en"):
                try:
                    r = req.get(
                        f"https://{lang}.wikipedia.org/w/api.php",
                        params={"action": "query", "titles": titles_str,
                                "prop": "pageimages", "pithumbsize": THUMB,
                                "pilicense": "any", "format": "json", "origin": "*"},
                        headers={"User-Agent": UA}, timeout=10,
                    )
                    pages = r.json().get("query", {})
                    normalized = {n["from"]: n["to"] for n in pages.get("normalized", [])}
                    for page in pages.get("pages", {}).values():
                        if "thumbnail" not in page:
                            continue
                        title = page["title"]
                        img = {"url": page["thumbnail"]["source"],
                               "width": page["thumbnail"].get("width", THUMB),
                               "height": page["thumbnail"].get("height", THUMB)}
                        result[title] = img
                        for orig, norm in normalized.items():
                            if norm == title:
                                result[orig] = img
                except Exception:
                    continue
                if lang == "fr" and len(result) >= len(batch):
                    break
        return result

    def _wikidata_logos(names_batch: list[str]) -> tuple[dict[str, str], set[str]]:
        """Retourne ({name: logo_filename}, rejected) via Wikidata P154.

        rejected : entités dont l'article Wikipedia correspond à une personne,
        un prénom, un concept sans lien avec une ORG/PRODUCT → pas de fallback.

        Règle :
          - P31 ∈ WRONG_TYPES (humain, prénom, homonymie…) → rejet définitif
          - P31 existe mais ∉ OK_TYPES (entreprise, logiciel…) → rejet implicite
            (ex. "Codex" → manuscrit, "Claude" → prénom français)
          - P31 absent (entité introuvable) → laisse le fallback pageimages agir
        """
        logos: dict[str, str] = {}
        rejected: set[str] = set()
        P154 = "P154"

        # Types P31 qui disqualifient explicitement une entité ORG/PRODUCT
        WRONG_TYPES = {
            "Q5",        # human / personne
            "Q202444",   # given name / prénom
            "Q101352",   # family name / nom de famille
            "Q4167410",  # Wikimedia disambiguation page
            "Q11266439", # Wikimedia template
        }
        # Types P31 compatibles avec une entité ORG/PRODUCT
        # (autorise le fallback pageimages si pas de P154)
        OK_TYPES = {
            "Q4830453", "Q783794", "Q891723", "Q43229", "Q167037",  # entreprises/orgs
            "Q7397", "Q166142", "Q9143", "Q9135", "Q7889",           # logiciels/tech
            "Q18127206", "Q18662854", "Q1331793", "Q17155032",       # tech/média
        }

        for i in range(0, len(names_batch), BATCH):
            batch = names_batch[i : i + BATCH]
            titles_str = "|".join(batch)
            for site in ("enwiki", "frwiki"):
                try:
                    r = req.get(
                        "https://www.wikidata.org/w/api.php",
                        params={"action": "wbgetentities", "sites": site,
                                "titles": titles_str, "props": "claims|sitelinks",
                                "format": "json", "origin": "*"},
                        headers={"User-Agent": UA}, timeout=10,
                    )
                    for eid, entity in r.json().get("entities", {}).items():
                        if eid.startswith("-"):
                            continue
                        wiki_title = entity.get("sitelinks", {}).get(site, {}).get("title", "")
                        claims = entity.get("claims", {})
                        p31_ids = {
                            claim["mainsnak"]["datavalue"]["value"]["id"]
                            for claim in claims.get("P31", [])
                            if claim["mainsnak"].get("datavalue")
                        }
                        for orig in batch:
                            if orig.lower() == wiki_title.lower() and orig not in logos and orig not in rejected:
                                if p31_ids & WRONG_TYPES:
                                    # Personne, prénom, homonymie → rejet définitif
                                    rejected.add(orig)
                                elif P154 in claims:
                                    logos[orig] = claims[P154][0]["mainsnak"]["datavalue"]["value"]
                                elif p31_ids & OK_TYPES:
                                    # Type ORG/PRODUCT confirmé mais sans P154 → fallback pageimages
                                    pass
                                else:
                                    # P31 absent ou type inconnu (manuscrit, mot, concept…)
                                    # → rejet : pas de fallback pageimages pour éviter fausses images
                                    rejected.add(orig)
                                break
                except Exception:
                    continue
        return logos, rejected

    def _resolve_logo_urls(filenames: list[str]) -> dict[str, str]:
        """Retourne {filename: url_miniature} depuis Wikimedia Commons."""
        urls: dict[str, str] = {}
        for i in range(0, len(filenames), BATCH):
            batch = filenames[i : i + BATCH]
            titles = "|".join(f"File:{f}" for f in batch)
            try:
                r = req.get(
                    "https://commons.wikimedia.org/w/api.php",
                    params={"action": "query", "titles": titles,
                            "prop": "imageinfo", "iiprop": "url",
                            "iiurlwidth": THUMB, "format": "json", "origin": "*"},
                    headers={"User-Agent": UA}, timeout=10,
                )
                for page in r.json().get("query", {}).get("pages", {}).values():
                    fname = page.get("title", "").removeprefix("File:")
                    info = page.get("imageinfo", [])
                    if info:
                        url = info[0].get("thumburl") or info[0].get("url")
                        if url:
                            urls[fname] = url
            except Exception:
                pass
        return urls

    # ── PERSON & autres : pageimages ──────────────────────────────────────────
    pageimg = _pageimages(person_names + other_names)
    for name in person_names + other_names:
        if name not in cache:
            cache[name] = pageimg.get(name)

    # ── ORG / PRODUCT : Wikidata P154 + fallback pageimages (si type compatible) ──
    if logo_names:
        wikidata, rejected = _wikidata_logos(logo_names)
        # Résout les URLs des logos trouvés via P154
        resolved = _resolve_logo_urls(list(set(wikidata.values()))) if wikidata else {}
        # Fallback pageimages uniquement pour les entités ni trouvées ni rejetées
        # (rejetées = prénom, humain, manuscrit, concept hors-scope → None)
        fallback_names = [n for n in logo_names if n not in wikidata and n not in rejected]
        fallback = _pageimages(fallback_names) if fallback_names else {}

        for name in logo_names:
            if name not in cache:
                logo_file = wikidata.get(name)
                if logo_file and logo_file in resolved:
                    cache[name] = {"url": resolved[logo_file], "width": THUMB, "height": THUMB}
                elif name in rejected:
                    cache[name] = None  # type hors-scope confirmé → pas d'image
                else:
                    cache[name] = fallback.get(name)

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")

    return jsonify({e["name"]: cache.get(e["name"]) for e in entities})


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
