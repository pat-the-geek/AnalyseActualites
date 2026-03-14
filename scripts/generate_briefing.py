#!/usr/bin/env python3
"""
generate_briefing.py — Résumé exécutif automatisé (Priorité 5)

Génère un briefing quotidien ou hebdomadaire synthétisant :
  - Les Top 10 entités les plus mentionnées sur la période
  - Les articles les mieux scorés (pertinence)
  - Les tendances détectées (alertes actives)
  - Une synthèse narrative générée par l'API EurIA

Sortie : rapports/markdown/_BRIEFING_/briefing_YYYY-MM-DD.md

Usage :
    python3 scripts/generate_briefing.py
    python3 scripts/generate_briefing.py --period weekly  # 7 derniers jours
    python3 scripts/generate_briefing.py --period daily   # 24 dernières heures
    python3 scripts/generate_briefing.py --dry-run        # Affiche sans sauvegarder ni appeler l'API
    python3 scripts/generate_briefing.py --no-ai          # Briefing structuré sans synthèse IA
"""

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _SCRIPT_DIR.parent
sys.path.insert(0, str(_PROJECT_ROOT))

from utils.logging import print_console, default_logger
from utils.scoring import ScoringEngine

# ── Constantes ───────────────────────────────────────────────────────────────

_BRIEFING_DIR = _PROJECT_ROOT / "rapports" / "markdown" / "_BRIEFING_"
_ALERTS_FILE  = _PROJECT_ROOT / "data" / "alertes.json"

_ENTITY_TYPES_PERTINENTS = {"PERSON", "ORG", "GPE", "PRODUCT", "EVENT"}

_DATE_FMTS = (
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%d",
    "%d/%m/%Y",
)

_PERIOD_HOURS = {"daily": 24, "weekly": 168}


# ── Parsing de date ───────────────────────────────────────────────────────────

def _parse_date(date_str: str) -> datetime | None:
    if not date_str:
        return None
    for fmt in _DATE_FMTS:
        try:
            return datetime.strptime(date_str[:len(fmt)], fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(date_str).astimezone(timezone.utc)
    except Exception:
        pass
    return None


# ── Collecte des données ──────────────────────────────────────────────────────

def collect_articles(project_root: Path, hours: int) -> list[dict]:
    """Retourne tous les articles publiés dans les dernières `hours` heures."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=hours)
    articles = []
    seen_urls: set[str] = set()

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
                url = article.get("URL") or article.get("url") or ""
                if url and url in seen_urls:
                    continue
                articles.append(article)
                if url:
                    seen_urls.add(url)
    return articles


def compute_top_entities(articles: list[dict], top_n: int = 10) -> list[tuple]:
    """Retourne les top_n entités (type, valeur, count) les plus mentionnées.

    O(n) — la capitalisation originale est mémorisée lors du premier passage,
    sans double boucle sur les articles.
    """
    counter: Counter = Counter()
    # key_to_meta[key_lower] = (nom_original, type)
    key_to_meta: dict[str, tuple[str, str]] = {}

    for article in articles:
        entities = article.get("entities", {})
        if not isinstance(entities, dict):
            continue
        for etype, names in entities.items():
            if etype not in _ENTITY_TYPES_PERTINENTS:
                continue
            if not isinstance(names, list):
                continue
            for name in names:
                if isinstance(name, str) and name.strip():
                    key = name.strip().lower()
                    counter[key] += 1
                    # Mémoriser la capitalisation originale dès le 1er passage (O(1))
                    if key not in key_to_meta:
                        key_to_meta[key] = (name.strip(), etype)

    return [
        (key_to_meta[key][1], key_to_meta[key][0], count)
        for key, count in counter.most_common(top_n)
        if key in key_to_meta
    ]


def load_alerts(project_root: Path) -> list[dict]:
    """Charge les alertes actives depuis data/alertes.json."""
    if not _ALERTS_FILE.exists():
        return []
    try:
        data = json.loads(_ALERTS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


# ── Génération du Markdown ────────────────────────────────────────────────────

def _sentiment_stats(articles: list[dict]) -> dict:
    """Calcule la répartition des sentiments."""
    counts: Counter = Counter()
    for a in articles:
        s = a.get("sentiment", "")
        if s:
            counts[s] += 1
    return dict(counts)


def _source_stats(articles: list[dict], top_n: int = 5) -> list[tuple]:
    """Retourne les top_n sources les plus représentées."""
    counter: Counter = Counter()
    for a in articles:
        src = a.get("Sources") or a.get("source") or "Inconnue"
        counter[str(src)] += 1
    return counter.most_common(top_n)


def build_briefing_markdown(
    period_label: str,
    date_debut: str,
    date_fin: str,
    articles: list[dict],
    top_articles: list[dict],
    top_entities: list[tuple],
    alerts: list[dict],
    ai_synthesis: str = "",
) -> str:
    """Génère le Markdown complet du briefing."""
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    total = len(articles)
    sentiment = _sentiment_stats(articles)
    sources = _source_stats(articles)

    # Répartition sentiments
    pos = sentiment.get("positif", 0)
    neu = sentiment.get("neutre", 0)
    neg = sentiment.get("négatif", 0)
    sent_total = pos + neu + neg
    def _pct(n): return f"{n/sent_total*100:.0f}%" if sent_total else "—"

    lines = [
        "---",
        f"title: \"Briefing {period_label} — {date_fin}\"",
        f"date: \"{date_fin}\"",
        f"period: \"{date_debut} → {date_fin}\"",
        f"articles_total: {total}",
        "tags: [briefing, veille, wudd]",
        "---",
        "",
        f"# 📋 Briefing {period_label} — {date_fin}",
        "",
        f"> Généré automatiquement le {now_str} par WUDD.ai  ",
        f"> Période : **{date_debut} → {date_fin}** | **{total} articles** analysés",
        "",
    ]

    # ── Synthèse IA ──────────────────────────────────────────────────────────
    if ai_synthesis:
        lines += [
            "## 🤖 Synthèse intelligente",
            "",
            ai_synthesis.strip(),
            "",
        ]

    # ── Alertes ──────────────────────────────────────────────────────────────
    if alerts:
        lines += ["## 🚨 Tendances & Alertes", ""]
        for a in alerts[:5]:
            em = {"critique": "🔴", "élevé": "🟠", "modéré": "🟡"}.get(a.get("niveau", ""), "🔔")
            lines.append(
                f"- {em} **{a['entity_value']}** ({a['entity_type']}) — "
                f"ratio {a['ratio']} | {a['count_24h']} mentions/24h"
            )
        lines.append("")

    # ── Top Entités ──────────────────────────────────────────────────────────
    lines += ["## 🏷️ Top 10 entités les plus mentionnées", ""]
    if top_entities:
        lines.append("| # | Entité | Type | Mentions |")
        lines.append("|---|--------|------|----------|")
        for i, (etype, name, count) in enumerate(top_entities, 1):
            lines.append(f"| {i} | {name} | {etype} | {count} |")
    else:
        lines.append("*Aucune entité nommée disponible sur la période.*")
    lines.append("")

    # ── Top Articles ─────────────────────────────────────────────────────────
    lines += ["## 📰 Articles les plus pertinents", ""]
    if top_articles:
        for i, article in enumerate(top_articles[:5], 1):
            title   = article.get("Titre") or ""
            url     = article.get("URL")   or article.get("url") or ""
            source  = article.get("Sources") or article.get("source") or "?"
            date    = article.get("Date de publication") or ""
            score   = article.get("score_pertinence", "")
            resume  = (article.get("Résumé") or "")[:300]

            title_or_url = f"[{title}]({url})" if title and url else (url or title or "Article sans titre")
            score_str    = f" *(score : {score})*" if score else ""
            lines += [
                f"### {i}. {title_or_url}{score_str}",
                f"**Source :** {source} | **Date :** {date}",
                "",
                resume + ("…" if len(article.get("Résumé") or "") > 300 else ""),
                "",
            ]
    else:
        lines.append("*Aucun article disponible sur la période.*")
        lines.append("")

    # ── Statistiques ─────────────────────────────────────────────────────────
    lines += ["## 📊 Statistiques", ""]
    lines += [
        f"- **Articles analysés :** {total}",
        f"- **Sentiment :** {_pct(pos)} positif · {_pct(neu)} neutre · {_pct(neg)} négatif",
    ]
    if sources:
        top_src_str = " · ".join(f"{s} ({n})" for s, n in sources[:3])
        lines.append(f"- **Sources principales :** {top_src_str}")
    lines.append("")

    # ── Footer ───────────────────────────────────────────────────────────────
    lines += [
        "---",
        f"*Rapport généré par WUDD.ai — {now_str}*",
    ]

    return "\n".join(lines)


# ── Synthèse IA ──────────────────────────────────────────────────────────────

def _build_ai_prompt(
    period_label: str,
    articles: list[dict],
    top_entities: list[tuple],
    alerts: list[dict],
) -> str:
    """Construit le prompt EurIA pour la synthèse narrative."""
    entity_lines = "\n".join(
        f"- {name} ({etype}) : {count} mentions"
        for etype, name, count in top_entities[:10]
    ) or "Aucune entité disponible."

    alert_lines = "\n".join(
        f"- [{a.get('niveau','?').upper()}] {a['entity_value']} ({a['entity_type']}) — ratio {a['ratio']}"
        for a in alerts[:5]
    ) or "Aucune alerte."

    # Résumés des 5 articles les mieux scorés
    sample_articles = articles[:5]
    resumes = "\n\n".join(
        f"**{a.get('Sources','?')} — {a.get('Date de publication','')}**\n"
        f"{(a.get('Résumé') or '')[:400]}"
        for a in sample_articles
    ) or "Aucun résumé disponible."

    return f"""Tu es un analyste senior en veille informationnelle pour WUDD.ai.

Rédige en français un résumé exécutif synthétique (200–350 mots) de l'actualité du {period_label}.
Adopte un ton factuel, neutre et professionnel. Structure ton texte en 2–3 paragraphes.
Mets en gras les entités et événements importants.

## Entités les plus mentionnées
{entity_lines}

## Alertes de tendance
{alert_lines}

## Extraits d'articles représentatifs
{resumes}

Rédige maintenant le résumé exécutif :"""


def generate_ai_synthesis(
    period_label: str,
    articles: list[dict],
    top_entities: list[tuple],
    alerts: list[dict],
) -> str:
    """Génère la synthèse narrative via l'API EurIA. Retourne '' en cas d'échec."""
    try:
        from utils.api_client import get_ai_client
        client = get_ai_client()
        prompt = _build_ai_prompt(period_label, articles, top_entities, alerts)
        return client.ask(prompt, timeout=120, max_tokens=8192) or ""
    except Exception as exc:
        default_logger.warning(f"Synthèse IA ignorée : {exc}")
        return ""


# ── Génération du texte podcast ──────────────────────────────────────────────

def build_podcast_markdown(
    period_label: str,
    date_debut: str,
    date_fin: str,
    articles: list[dict],
    top_articles: list[dict],
    top_entities: list[tuple],
    alerts: list[dict],
    ai_synthesis: str = "",
) -> str:
    """Génère un texte Markdown fluide adapté à la synthèse vocale (TTS)."""
    now_str = datetime.now(timezone.utc).strftime("%d/%m/%Y à %H:%M UTC")
    total = len(articles)
    sentiment = _sentiment_stats(articles)

    pos = sentiment.get("positif", 0)
    neu = sentiment.get("neutre", 0)
    neg = sentiment.get("négatif", 0)
    sent_total = pos + neu + neg
    def _pct(n): return f"{n * 100 // sent_total} pour cent" if sent_total else "non disponible"

    lines = [
        f"# Podcast WUDD point AI — Briefing {period_label} du {date_fin}",
        "",
        f"Bonjour. Voici votre briefing {period_label} WUDD point AI, généré le {now_str}.",
        f"Cette édition couvre la période du {date_debut} au {date_fin}",
        f"et synthétise {total} articles analysés par l'intelligence artificielle.",
        "",
        "---",
        "",
    ]

    # ── Synthèse IA ──────────────────────────────────────────────────────────
    if ai_synthesis:
        lines += [
            "## Synthèse de la semaine",
            "",
            ai_synthesis.strip(),
            "",
            "---",
            "",
        ]

    # ── Alertes ──────────────────────────────────────────────────────────────
    if alerts:
        lines += [
            "## Tendances et alertes",
            "",
            f"Cette semaine, {len(alerts[:5])} tendances ont été détectées.",
            "",
        ]
        for a in alerts[:5]:
            niveau = a.get("niveau", "modéré")
            lines.append(
                f"{a['entity_value']}, de type {a['entity_type']}, "
                f"présente un niveau d'alerte {niveau} avec {a['count_24h']} mentions sur les dernières 24 heures."
            )
        lines += ["", "---", ""]

    # ── Top Entités ──────────────────────────────────────────────────────────
    if top_entities:
        lines += [
            "## Les sujets les plus mentionnés",
            "",
            f"Voici les {len(top_entities)} entités qui ont le plus retenu l'attention cette semaine.",
            "",
        ]
        for i, (etype, name, count) in enumerate(top_entities, 1):
            mention_str = "mention" if count == 1 else "mentions"
            lines.append(f"{i}. {name}, avec {count} {mention_str}.")
        lines += ["", "---", ""]

    # ── Top Articles ─────────────────────────────────────────────────────────
    if top_articles:
        lines += [
            "## Les articles à la une",
            "",
            "Voici les cinq articles les plus pertinents de la période.",
            "",
        ]
        for i, article in enumerate(top_articles[:5], 1):
            source = article.get("Sources") or article.get("source") or "Source inconnue"
            date   = article.get("Date de publication") or ""
            resume = (article.get("Résumé") or "")[:500]
            titre  = article.get("Titre") or ""

            header = f"**Article {i}"
            if titre:
                header += f" — {titre}"
            header += f"** — {source}"
            if date:
                header += f", publié le {date}"
            header += "."

            lines += [
                header,
                "",
                resume + ("…" if len(article.get("Résumé") or "") > 500 else ""),
                "",
            ]
        lines += ["---", ""]

    # ── Statistiques ─────────────────────────────────────────────────────────
    lines += [
        "## En bref",
        "",
        f"Sur la période, {total} articles ont été analysés.",
    ]
    if sent_total:
        lines.append(
            f"La tonalité globale est {_pct(pos)} positive, "
            f"{_pct(neu)} neutre, et {_pct(neg)} négative."
        )
    sources = _source_stats(articles, top_n=3)
    if sources:
        src_str = ", ".join(f"{s}" for s, _ in sources)
        lines.append(f"Les sources les plus actives sont : {src_str}.")
    lines += [
        "",
        "---",
        "",
        f"Ce briefing a été généré automatiquement par WUDD point AI le {now_str}. À bientôt.",
    ]

    return "\n".join(lines)


# ── Point d'entrée ────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description="Génère un briefing exécutif WUDD.ai"
    )
    parser.add_argument(
        "--period", choices=["daily", "weekly"], default="daily",
        help="Période du briefing (daily=24h, weekly=7j). Défaut : daily"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Affiche le briefing sans sauvegarder ni appeler l'API"
    )
    parser.add_argument(
        "--no-ai", action="store_true",
        help="Génère le briefing sans synthèse IA"
    )
    return parser.parse_args()


def main():
    args = parse_args()
    project_root = _PROJECT_ROOT

    period_label = "hebdomadaire" if args.period == "weekly" else "quotidien"
    hours = _PERIOD_HOURS[args.period]

    now = datetime.now(timezone.utc)
    date_fin   = now.strftime("%Y-%m-%d")
    date_debut = (now - timedelta(hours=hours)).strftime("%Y-%m-%d")

    print_console(f"=== Briefing {period_label} WUDD.ai ({date_debut} → {date_fin}) ===")

    # Collecte
    print_console("Collecte des articles…")
    articles = collect_articles(project_root, hours=hours)
    print_console(f"  → {len(articles)} article(s) trouvé(s)")

    if not articles:
        print_console("Aucun article disponible sur la période. Briefing annulé.", "warning")
        return

    # Top articles par score de pertinence
    engine = ScoringEngine(project_root)
    top_articles = engine.score_and_sort(articles, top_n=10)

    # Top entités
    top_entities = compute_top_entities(articles, top_n=10)
    print_console(f"  → {len(top_entities)} entités identifiées")

    # Alertes
    alerts = load_alerts(project_root)
    print_console(f"  → {len(alerts)} alerte(s) active(s)")

    # Synthèse IA
    ai_synthesis = ""
    if not args.no_ai and not args.dry_run:
        print_console("Génération de la synthèse IA…")
        ai_synthesis = generate_ai_synthesis(period_label, top_articles, top_entities, alerts)

    # Markdown
    briefing_md = build_briefing_markdown(
        period_label=period_label,
        date_debut=date_debut,
        date_fin=date_fin,
        articles=articles,
        top_articles=top_articles,
        top_entities=top_entities,
        alerts=alerts,
        ai_synthesis=ai_synthesis,
    )

    if args.dry_run:
        print_console("[DRY-RUN] Briefing non sauvegardé.")
        print(briefing_md)
        print_console("[DRY-RUN] --- Texte podcast ---")
        podcast_md = build_podcast_markdown(
            period_label=period_label,
            date_debut=date_debut,
            date_fin=date_fin,
            articles=articles,
            top_articles=top_articles,
            top_entities=top_entities,
            alerts=alerts,
            ai_synthesis=ai_synthesis,
        )
        print(podcast_md)
        return

    # Sauvegarde
    _BRIEFING_DIR.mkdir(parents=True, exist_ok=True)

    filename = f"briefing_{date_fin}_{args.period}.md"
    output_path = _BRIEFING_DIR / filename
    output_path.write_text(briefing_md, encoding="utf-8")
    print_console(f"Briefing sauvegardé : {output_path}")

    # Texte podcast (TTS)
    podcast_md = build_podcast_markdown(
        period_label=period_label,
        date_debut=date_debut,
        date_fin=date_fin,
        articles=articles,
        top_articles=top_articles,
        top_entities=top_entities,
        alerts=alerts,
        ai_synthesis=ai_synthesis,
    )
    podcast_filename = f"podcast_{date_fin}_{args.period}.md"
    podcast_path = _BRIEFING_DIR / podcast_filename
    podcast_path.write_text(podcast_md, encoding="utf-8")
    print_console(f"Texte podcast sauvegardé : {podcast_path}")


if __name__ == "__main__":
    main()
