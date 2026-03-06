"""Module d'estimation du temps de lecture des articles — WUDD.ai.

Priorité 6 — Temps de lecture estimé
=====================================
Calcule le temps de lecture estimé d'un résumé ou d'un texte d'article en
se basant sur la vitesse de lecture moyenne d'un lecteur francophone.

Les valeurs retournées sont :
  - ``temps_lecture_minutes`` : float arrondi à 1 décimale (ex: 2.5)
  - ``temps_lecture_label``   : str formaté (ex: "2 min 30 s")

Vitesse de référence : 230 mots/min (adulte francophone, lecture silencieuse)
Source : INSERM / études de lisibilité

Usage :
    from utils.reading_time import estimate_reading_time, enrich_reading_time

    result = estimate_reading_time("Texte de l'article…")
    # → {"temps_lecture_minutes": 1.3, "temps_lecture_label": "1 min 18 s"}

    articles = enrich_reading_time(articles)
    # Ajoute "temps_lecture_minutes" et "temps_lecture_label" à chaque article
"""

import re
from typing import Optional

# ── Constantes ───────────────────────────────────────────────────────────────

# Vitesse de lecture moyenne en mots par minute (adulte francophone)
_WPM: int = 230

# Champs à lire pour le calcul du temps de lecture (par ordre de priorité)
_TEXT_FIELDS: tuple[str, ...] = ("Résumé", "resume", "content", "texte")


# ── Fonctions utilitaires ────────────────────────────────────────────────────

def count_words(text: str) -> int:
    """Compte le nombre de mots dans un texte.

    Supprime les URLs, le Markdown et les balises HTML avant comptage.

    Args:
        text : texte brut ou Markdown

    Returns:
        Nombre entier de mots.
    """
    if not text or not isinstance(text, str):
        return 0

    # Supprimer les URLs
    text = re.sub(r"https?://\S+", "", text)
    # Supprimer les balises HTML
    text = re.sub(r"<[^>]+>", " ", text)
    # Supprimer les éléments Markdown (headers, bold, italic, links, tables)
    text = re.sub(r"[#*_`()\[\]>|~]", " ", text)
    # Supprimer la ponctuation isolée
    text = re.sub(r"[^\w\s]", " ", text)
    # Normaliser les espaces
    text = re.sub(r"\s+", " ", text).strip()

    return len(text.split()) if text else 0


def estimate_reading_time(
    text: str,
    wpm: int = _WPM,
) -> dict:
    """Estime le temps de lecture d'un texte.

    Args:
        text : texte à analyser
        wpm  : vitesse de lecture en mots/minute (défaut : 230 wpm)

    Returns:
        Dict avec les clés :
          - ``mots``                 : int, nombre de mots
          - ``temps_lecture_minutes``: float, durée en minutes
          - ``temps_lecture_label``  : str, durée formatée (ex: "2 min 30 s")
    """
    words = count_words(text)
    minutes_float = words / wpm if wpm > 0 else 0.0
    minutes = int(minutes_float)
    seconds = int((minutes_float - minutes) * 60)

    if minutes == 0 and seconds < 30:
        label = "< 1 min"
    elif minutes == 0:
        label = f"{seconds} s"
    elif seconds == 0:
        label = f"{minutes} min"
    else:
        label = f"{minutes} min {seconds} s"

    return {
        "mots": words,
        "temps_lecture_minutes": round(minutes_float, 1),
        "temps_lecture_label":   label,
    }


def get_article_text(article: dict) -> str:
    """Extrait le texte principal d'un article selon les champs connus."""
    for field in _TEXT_FIELDS:
        val = article.get(field)
        if isinstance(val, str) and len(val) > 20:
            return val
    return ""


def enrich_reading_time(
    articles: list[dict],
    wpm: int = _WPM,
    overwrite: bool = False,
) -> list[dict]:
    """Ajoute les champs de temps de lecture à chaque article.

    Ajoute en place :
      - ``temps_lecture_minutes`` : float (ex: 2.5)
      - ``temps_lecture_label``   : str   (ex: "2 min 30 s")

    Args:
        articles  : liste d'articles au format interne WUDD.ai
        wpm       : vitesse de lecture en mots/minute
        overwrite : si False, ne recalcule pas les articles déjà enrichis

    Returns:
        La même liste enrichie.
    """
    for article in articles:
        if not overwrite and "temps_lecture_minutes" in article:
            continue
        text = get_article_text(article)
        result = estimate_reading_time(text, wpm=wpm)
        article["temps_lecture_minutes"] = result["temps_lecture_minutes"]
        article["temps_lecture_label"]   = result["temps_lecture_label"]
    return articles
