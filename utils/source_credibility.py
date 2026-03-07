"""Module de crédibilité des sources médiatiques pour WUDD.ai.

Priorité 4 — Score de crédibilité des sources
==============================================
Attribue un score de crédibilité (0–100) à chaque source d'article en se basant
sur une base de données configurable (config/sources_credibility.json).

Le score influence le calcul de pertinence dans `utils/scoring.py` via un
multiplicateur.

Usage :
    from utils.source_credibility import CredibilityEngine

    engine = CredibilityEngine(project_root)
    score = engine.get_score("Le Monde")         # 92
    multiplier = engine.get_multiplier("BFM TV") # 0.95
    rated = engine.rate_articles(articles)       # ajoute "score_source" à chaque article
"""

import json
import re
import unicodedata
from pathlib import Path
from typing import Optional

from .logging import default_logger

# ── Constantes ───────────────────────────────────────────────────────────────

_CREDIBILITY_FILE = "config/sources_credibility.json"

# Score par défaut pour les sources inconnues
_DEFAULT_SCORE: int = 50

# Bornes du multiplicateur de scoring (évite des valeurs extrêmes)
_MULTIPLIER_MIN: float = 0.60
_MULTIPLIER_MAX: float = 1.20


# ── Normalisation ─────────────────────────────────────────────────────────────

def _normalize_source(name: str) -> str:
    """Normalise un nom de source pour la comparaison (minuscules, sans accents)."""
    text = unicodedata.normalize("NFKD", name)
    text = text.encode("ascii", errors="ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


# ── Moteur de crédibilité ────────────────────────────────────────────────────

class CredibilityEngine:
    """Évalue la crédibilité des sources d'articles WUDD.ai.

    Utilise une base de données configurable chargée depuis
    ``config/sources_credibility.json``. Les sources inconnues reçoivent
    le score par défaut (50/100).

    Args:
        project_root : racine du projet (auto-détectée si None)

    Example::

        engine = CredibilityEngine(project_root)
        score = engine.get_score("Le Monde")      # 92
        mult  = engine.get_multiplier("Le Monde") # 1.18
    """

    def __init__(self, project_root: Optional[Path] = None):
        if project_root is None:
            project_root = Path(__file__).parent.parent
        self.project_root = project_root
        self._db: dict[str, dict] = self._load_db()
        # Index normalisé → clé originale
        self._index: dict[str, str] = {
            _normalize_source(k): k for k in self._db
        }

    def _load_db(self) -> dict[str, dict]:
        """Charge config/sources_credibility.json."""
        path = self.project_root / _CREDIBILITY_FILE
        if not path.exists():
            default_logger.warning(
                f"Base de crédibilité introuvable : {path}. "
                "Score par défaut utilisé pour toutes les sources."
            )
            return {}
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
            default_logger.warning("Format de sources_credibility.json invalide (attendu: dict).")
            return {}
        except json.JSONDecodeError as exc:
            default_logger.error(f"Erreur de lecture sources_credibility.json : {exc}")
            return {}

    def _lookup(self, source: str) -> Optional[dict]:
        """Recherche une source par nom normalisé. Retourne None si inconnue."""
        norm = _normalize_source(source)
        # Correspondance exacte
        if norm in self._index:
            return self._db[self._index[norm]]
        # Correspondance partielle : la source contient-elle un nom connu ?
        for norm_key, orig_key in self._index.items():
            if norm_key in norm or norm in norm_key:
                return self._db[orig_key]
        return None

    def get_score(self, source: str) -> int:
        """Retourne le score de crédibilité (0–100) d'une source.

        Args:
            source : nom de la source (ex: "Le Monde", "BFM TV")

        Returns:
            Entier entre 0 et 100. 50 si source inconnue.
        """
        if not source or not source.strip():
            return _DEFAULT_SCORE
        entry = self._lookup(source.strip())
        if entry is None:
            return _DEFAULT_SCORE
        return int(entry.get("score", _DEFAULT_SCORE))

    def get_multiplier(self, source: str) -> float:
        """Retourne le multiplicateur de scoring (0.60–1.20) pour une source.

        Formule : score_source / 100 * (max - min) + min
        → score 100 → 1.20, score 50 → 0.90, score 0 → 0.60

        Returns:
            Float entre _MULTIPLIER_MIN et _MULTIPLIER_MAX.
        """
        score = self.get_score(source) / 100.0
        mult = _MULTIPLIER_MIN + score * (_MULTIPLIER_MAX - _MULTIPLIER_MIN)
        return round(mult, 3)

    def get_metadata(self, source: str) -> dict:
        """Retourne toutes les métadonnées d'une source (score, biais, type…)."""
        entry = self._lookup(source.strip()) if source else None
        if entry is None:
            return {
                "score": _DEFAULT_SCORE,
                "biais": "inconnu",
                "type": "inconnu",
                "pays": "inconnu",
                "fiabilite": "non évalué",
            }
        return {
            "score":     entry.get("score", _DEFAULT_SCORE),
            "biais":     entry.get("biais", "inconnu"),
            "type":      entry.get("type", "inconnu"),
            "pays":      entry.get("pays", "inconnu"),
            "fiabilite": entry.get("fiabilite", "non évalué"),
        }

    def rate_articles(self, articles: list[dict]) -> list[dict]:
        """Ajoute le champ ``score_source`` à chaque article.

        Le champ contient le score de crédibilité (0–100) de la source.
        La liste est modifiée en place et retournée.

        Args:
            articles : liste d'articles au format interne WUDD.ai

        Returns:
            La même liste avec ``score_source`` ajouté.
        """
        for article in articles:
            source = article.get("Sources") or article.get("source") or ""
            article["score_source"] = self.get_score(str(source))
        return articles

    def reload(self) -> None:
        """Recharge la base de crédibilité depuis le disque."""
        self._db = self._load_db()
        self._index = {_normalize_source(k): k for k in self._db}
        default_logger.info(
            f"Base de crédibilité rechargée : {len(self._db)} sources"
        )
