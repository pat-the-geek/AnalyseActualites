"""tests/test_rolling_window.py — Tests pour utils/rolling_window.py

Couvre :
  - Mode incrémental (ajout de nouveaux articles)
  - Mode rebuild (reconstruction depuis un répertoire source)
  - Déduplication par URL
  - Élague des articles anciens
  - Écriture atomique (fichier tmp → replace)
  - Fichier absent (création)
  - Cas limite : liste vide, articles tous anciens
"""

import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from utils.rolling_window import update_rolling_window


# ── Fixtures ────────────────────────────────────────────────────────────────

def _make_article(url: str, days_ago: int = 0, source: str = "TestSource") -> dict:
    """Crée un article de test avec une date relative à aujourd'hui."""
    dt = datetime.utcnow() - timedelta(days=days_ago)
    return {
        "URL": url,
        "Sources": source,
        "Date de publication": dt.strftime("%d/%m/%Y"),
        "Résumé": f"Résumé de {url}",
    }


# ── Tests mode incrémental ─────────────────────────────────────────────────

class TestRollingWindowIncremental:
    """Mode incrémental : new_articles + fichier existant, sans source_dir."""

    def test_creates_file_if_absent(self, tmp_path):
        output = tmp_path / "48-heures.json"
        articles = [_make_article("https://a.com/1", days_ago=0)]
        n = update_rolling_window(articles, output, hours=48)
        assert output.exists()
        assert n == 1

    def test_returns_count_of_articles_in_window(self, tmp_path):
        output = tmp_path / "48-heures.json"
        articles = [_make_article(f"https://a.com/{i}", days_ago=0) for i in range(5)]
        n = update_rolling_window(articles, output, hours=48)
        assert n == 5

    def test_appends_to_existing_file(self, tmp_path):
        output = tmp_path / "48-heures.json"
        # Premier run : 3 articles
        first = [_make_article(f"https://a.com/{i}", days_ago=0) for i in range(3)]
        update_rolling_window(first, output, hours=48)
        # Deuxième run : 2 nouveaux articles
        second = [_make_article(f"https://a.com/{i}", days_ago=0) for i in range(3, 5)]
        n = update_rolling_window(second, output, hours=48)
        assert n == 5
        data = json.loads(output.read_text())
        assert len(data) == 5

    def test_deduplication_by_url(self, tmp_path):
        output = tmp_path / "48-heures.json"
        a1 = _make_article("https://a.com/1", days_ago=0)
        update_rolling_window([a1], output, hours=48)
        # Même URL dans le deuxième run
        n = update_rolling_window([a1], output, hours=48)
        assert n == 1  # Pas de doublon

    def test_prunes_old_articles(self, tmp_path):
        output = tmp_path / "48-heures.json"
        recent = _make_article("https://a.com/recent", days_ago=0)
        old = _make_article("https://a.com/old", days_ago=3)
        update_rolling_window([recent, old], output, hours=48)
        data = json.loads(output.read_text())
        urls = [a["URL"] for a in data]
        assert "https://a.com/recent" in urls
        assert "https://a.com/old" not in urls

    def test_all_articles_pruned_produces_empty_file(self, tmp_path):
        output = tmp_path / "48-heures.json"
        old = _make_article("https://a.com/old", days_ago=5)
        n = update_rolling_window([old], output, hours=48)
        assert n == 0
        data = json.loads(output.read_text())
        assert data == []

    def test_empty_new_articles_preserves_existing(self, tmp_path):
        output = tmp_path / "48-heures.json"
        recent = _make_article("https://a.com/1", days_ago=0)
        update_rolling_window([recent], output, hours=48)
        n = update_rolling_window([], output, hours=48)
        assert n == 1

    def test_atomic_write_no_tmp_left(self, tmp_path):
        output = tmp_path / "48-heures.json"
        articles = [_make_article("https://a.com/1")]
        update_rolling_window(articles, output, hours=48)
        assert not output.with_suffix(".tmp").exists()

    def test_sorted_by_date_descending(self, tmp_path):
        output = tmp_path / "48-heures.json"
        old_recent = _make_article("https://a.com/older", days_ago=1)
        very_recent = _make_article("https://a.com/newer", days_ago=0)
        update_rolling_window([old_recent, very_recent], output, hours=48)
        data = json.loads(output.read_text())
        assert data[0]["URL"] == "https://a.com/newer"


# ── Tests mode rebuild ─────────────────────────────────────────────────────

class TestRollingWindowRebuild:
    """Mode rebuild : source_dir fourni, reconstruction depuis les fichiers JSON."""

    def _write_keyword_file(self, path: Path, articles: list):
        path.write_text(json.dumps(articles, ensure_ascii=False), encoding="utf-8")

    def test_rebuild_from_source_dir(self, tmp_path):
        src = tmp_path / "articles-from-rss"
        src.mkdir()
        self._write_keyword_file(
            src / "ia.json",
            [_make_article("https://a.com/1", days_ago=0),
             _make_article("https://a.com/2", days_ago=1)],
        )
        output = tmp_path / "48-heures.json"
        n = update_rolling_window([], output, hours=48, source_dir=src)
        assert n == 2

    def test_rebuild_skips_old_articles(self, tmp_path):
        src = tmp_path / "articles-from-rss"
        src.mkdir()
        self._write_keyword_file(
            src / "ia.json",
            [_make_article("https://a.com/new", days_ago=0),
             _make_article("https://a.com/old", days_ago=5)],
        )
        output = tmp_path / "48-heures.json"
        n = update_rolling_window([], output, hours=48, source_dir=src)
        assert n == 1

    def test_rebuild_deduplicates_across_files(self, tmp_path):
        src = tmp_path / "articles-from-rss"
        src.mkdir()
        shared = _make_article("https://a.com/shared", days_ago=0)
        self._write_keyword_file(src / "ia.json", [shared])
        self._write_keyword_file(src / "ml.json", [shared])
        output = tmp_path / "48-heures.json"
        n = update_rolling_window([], output, hours=48, source_dir=src)
        assert n == 1  # Un seul exemplaire de l'article partagé

    def test_rebuild_ignores_cache_dirs(self, tmp_path):
        src = tmp_path / "articles-from-rss"
        (src / "cache").mkdir(parents=True)
        (src / "cache" / "cached.json").write_text(
            json.dumps([_make_article("https://cached.com/1", days_ago=0)]),
            encoding="utf-8",
        )
        self._write_keyword_file(
            src / "ia.json",
            [_make_article("https://a.com/1", days_ago=0)],
        )
        output = tmp_path / "48-heures.json"
        n = update_rolling_window([], output, hours=48, source_dir=src)
        assert n == 1  # L'article du cache n'est pas inclus

    def test_rebuild_empty_dir_produces_empty_file(self, tmp_path):
        src = tmp_path / "empty-dir"
        src.mkdir()
        output = tmp_path / "48-heures.json"
        n = update_rolling_window([], output, hours=48, source_dir=src)
        assert n == 0
        data = json.loads(output.read_text())
        assert data == []
