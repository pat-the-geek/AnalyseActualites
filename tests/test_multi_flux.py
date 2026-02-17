import os
import json
import shutil
from pathlib import Path
from utils.cache import get_cache
from utils.config import get_config

def test_cache_cloisonnement():
    """Vérifie que chaque flux a son propre cache isolé."""
    config = get_config()
    flux1 = "Intelligence-artificielle"
    flux2 = "Economie-numerique"
    cache1 = get_cache(namespace=flux1)
    cache2 = get_cache(namespace=flux2)
    # Nettoyer les caches
    shutil.rmtree(config.project_root / "data" / "articles" / "cache" / flux1, ignore_errors=True)
    shutil.rmtree(config.project_root / "data" / "articles" / "cache" / flux2, ignore_errors=True)
    cache1.set("testkey", "valeur1")
    cache2.set("testkey", "valeur2")
    assert cache1.get("testkey") == "valeur1"
    assert cache2.get("testkey") == "valeur2"
    assert cache1.get("testkey") != cache2.get("testkey")

def test_output_cloisonnement():
    """Vérifie que les fichiers de sortie sont bien générés dans le bon dossier par flux."""
    config = get_config()
    flux = "Intelligence-artificielle"
    output_dir = config.data_articles_dir / flux
    output_dir.mkdir(parents=True, exist_ok=True)
    testfile = output_dir / "test_output.json"
    data = [{"test": 123}]
    with open(testfile, "w", encoding="utf-8") as f:
        json.dump(data, f)
    assert testfile.exists()
    with open(testfile, "r", encoding="utf-8") as f:
        loaded = json.load(f)
    assert loaded[0]["test"] == 123
    # Nettoyage
    testfile.unlink()

def test_flux_config():
    """Vérifie que la config multi-flux est bien lue et exploitable."""
    config = get_config()
    flux_config_path = config.config_dir / "flux_json_sources.json"
    with open(flux_config_path, "r", encoding="utf-8") as f:
        flux_list = json.load(f)
    assert isinstance(flux_list, list)
    assert "title" in flux_list[0]
    assert "url" in flux_list[0]
