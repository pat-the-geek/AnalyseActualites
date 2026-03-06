"""Module de scoring de pertinence des articles.

Calcule un score composite (0–100) pour chaque article selon :
  - Fraîcheur      : pénalité exponentielle basée sur l'âge (24h=100, 7j=~20)
  - Richesse NER   : nombre et diversité des entités nommées
  - Densité mots-clés : occurrences des mots-clés de surveillance dans le résumé
  - Complétude     : présence d'un résumé valide et d'une image
  - Multiplicateur source : bonus si la source est fréquemment citée
"""

import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .logging import default_logger


# ── Constantes ──────────────────────────────────────────────────────────────

_ENTITY_WEIGHT: dict[str, float] = {
    "PERSON": 1.5,
    "ORG": 1.3,
    "GPE": 1.2,
    "PRODUCT": 1.2,
    "EVENT": 1.1,
    "NORP": 1.0,
    "LOC": 0.9,
    "MONEY": 0.8,
    "PERCENT": 0.5,
    "CARDINAL": 0.3,
    "DATE": 0.3,
    "TIME": 0.3,
}

_ERROR_PREFIXES = (
    "désolé",
    "je n'ai pas pu",
    "erreur",
    "échec",
    "aucune information",
)


def _parse_date(date_str: str) -> Optional[datetime]:
    """Tente de parser une date depuis les formats connus du projet."""
    if not date_str:
        return None
    for fmt in (
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%d",
        "%d/%m/%Y",
    ):
        try:
            return datetime.strptime(date_str, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    # RFC 822 (articles-from-rss)
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(date_str).astimezone(timezone.utc)
    except Exception:
        pass
    return None


def _freshness_score(date_str: str, now: datetime) -> float:
    """Retourne un score de fraîcheur entre 0 et 100.

    Décroissance exponentielle : 100 à t=0, ~50 à t=24h, ~20 à t=7j, ~5 à t=30j.
    """
    dt = _parse_date(date_str)
    if dt is None:
        return 20.0  # Score neutre si date inconnue
    age_hours = (now - dt).total_seconds() / 3600.0
    age_hours = max(0.0, age_hours)
    # Paramètre de décroissance : half-life ≈ 24h
    return 100.0 * math.exp(-0.693 * age_hours / 24.0)


def _entity_score(entities: dict) -> float:
    """Retourne un score basé sur la richesse des entités (0–100)."""
    if not isinstance(entities, dict):
        return 0.0
    total = 0.0
    for etype, values in entities.items():
        if not isinstance(values, list):
            continue
        weight = _ENTITY_WEIGHT.get(etype, 0.7)
        total += len(values) * weight
    # Normalise : 10 entités bien pondérées ≈ 100
    return min(100.0, total * 7.0)


def _keyword_score(resume: str, keywords: list[str]) -> float:
    """Retourne un score de densité mots-clés (0–100)."""
    if not resume or not keywords:
        return 0.0
    resume_lower = resume.lower()
    hits = sum(1 for kw in keywords if kw.lower() in resume_lower)
    # 3 mots-clés présents → score 100
    return min(100.0, hits * 33.3)


def _completeness_score(article: dict) -> float:
    """Retourne un score de complétude (0–100)."""
    score = 0.0
    resume = article.get("Résumé", "")
    if isinstance(resume, str) and len(resume) > 100:
        # Pénaliser les résumés d'erreur
        if not any(resume.lower().startswith(p) for p in _ERROR_PREFIXES):
            score += 50.0
    # Bonus si images présentes
    images = article.get("Images", [])
    if isinstance(images, list) and images:
        score += 25.0
    # Bonus si sentiment présent (enrichissement v2)
    if article.get("sentiment"):
        score += 12.5
    # Bonus si entités présentes
    if isinstance(article.get("entities"), dict) and article["entities"]:
        score += 12.5
    return score


def _extract_keywords_flat(keyword_config: list) -> list[str]:
    """Extrait la liste plate des mots-clés depuis keyword-to-search.json."""
    flat = []
    for entry in keyword_config:
        if not isinstance(entry, dict):
            continue
        for field in ("or", "and", "keyword"):
            vals = entry.get(field)
            if isinstance(vals, list):
                flat.extend([v for v in vals if isinstance(v, str)])
            elif isinstance(vals, str):
                flat.append(vals)
    return flat


class ScoringEngine:
    """Moteur de scoring de pertinence des articles.

    Usage :
        engine = ScoringEngine(project_root)
        score = engine.score_article(article)
        articles_scored = engine.score_and_sort(articles)
    """

    def __init__(self, project_root: Optional[Path] = None):
        if project_root is None:
            project_root = Path(__file__).parent.parent
        self.project_root = project_root
        self._keywords: list[str] = self._load_keywords()
        self._credibility = self._load_credibility()

    def _load_keywords(self) -> list[str]:
        kw_file = self.project_root / "config" / "keyword-to-search.json"
        if not kw_file.exists():
            return []
        try:
            data = json.loads(kw_file.read_text(encoding="utf-8"))
            return _extract_keywords_flat(data)
        except Exception as e:
            default_logger.warning(f"Impossible de charger les mots-clés pour scoring : {e}")
            return []

    def _load_credibility(self):
        """Charge le moteur de crédibilité des sources (optionnel)."""
        try:
            from .source_credibility import CredibilityEngine
            return CredibilityEngine(self.project_root)
        except Exception:
            return None

    def score_article(
        self,
        article: dict,
        now: Optional[datetime] = None,
        weights: Optional[dict] = None,
    ) -> float:
        """Calcule le score de pertinence d'un article (0–100).

        Intègre un multiplicateur de crédibilité de la source si disponible.

        Args:
            article : dict article (format interne WUDD.ai)
            now     : horodatage de référence (default: maintenant UTC)
            weights : poids optionnels pour chaque composante

        Returns:
            Score flottant entre 0 et 100.
        """
        if now is None:
            now = datetime.now(timezone.utc)

        w = {
            "freshness": 0.35,
            "entities": 0.25,
            "keywords": 0.25,
            "completeness": 0.15,
        }
        if weights:
            w.update(weights)

        freshness    = _freshness_score(article.get("Date de publication", ""), now)
        entities     = _entity_score(article.get("entities", {}))
        keywords     = _keyword_score(article.get("Résumé", ""), self._keywords)
        completeness = _completeness_score(article)

        score = (
            freshness * w["freshness"]
            + entities * w["entities"]
            + keywords * w["keywords"]
            + completeness * w["completeness"]
        )

        # Multiplicateur de crédibilité de la source (optionnel)
        if self._credibility is not None:
            source = article.get("Sources") or article.get("source") or ""
            multiplier = self._credibility.get_multiplier(str(source))
            score *= multiplier

        return round(min(100.0, max(0.0, score)), 1)

    def score_and_sort(
        self,
        articles: list[dict],
        now: Optional[datetime] = None,
        top_n: Optional[int] = None,
    ) -> list[dict]:
        """Calcule et attache le score à chaque article, les trie par score décroissant.

        Le champ `score_pertinence` est ajouté en place dans chaque article.
        Retourne la liste triée (et tronquée si top_n est fourni).
        """
        if now is None:
            now = datetime.now(timezone.utc)
        for article in articles:
            article["score_pertinence"] = self.score_article(article, now)
        articles.sort(key=lambda a: a.get("score_pertinence", 0), reverse=True)
        return articles[:top_n] if top_n else articles

    def get_top_articles(
        self,
        top_n: int = 10,
        hours: int = 48,
        include_rss: bool = True,
    ) -> list[dict]:
        """Agrège tous les articles récents et retourne les N meilleurs scorés.

        Args:
            top_n       : nombre d'articles à retourner
            hours       : fenêtre temporelle en heures (0 = pas de filtre)
            include_rss : inclure articles-from-rss/ en plus de articles/

        Returns:
            Liste d'articles triés par score décroissant, avec le chemin source ajouté.
        """
        now = datetime.now(timezone.utc)
        cutoff = None
        if hours > 0:
            from datetime import timedelta
            cutoff = now - timedelta(hours=hours)

        scan_dirs: list[Path] = [self.project_root / "data" / "articles"]
        if include_rss:
            scan_dirs.append(self.project_root / "data" / "articles-from-rss")

        seen_urls: set[str] = set()
        all_articles: list[dict] = []
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
                    rel_path = str(json_file.relative_to(self.project_root)).replace("\\", "/")
                    for article in data:
                        url = article.get("URL") or article.get("url", "")
                        if url and url in seen_urls:
                            continue
                        if cutoff:
                            dt = _parse_date(article.get("Date de publication", ""))
                            if dt and dt < cutoff:
                                continue
                        article.setdefault("_source_file", rel_path)
                        all_articles.append(article)
                        if url:
                            seen_urls.add(url)
                except (json.JSONDecodeError, OSError):
                    continue

        return self.score_and_sort(all_articles, now=now, top_n=top_n)
