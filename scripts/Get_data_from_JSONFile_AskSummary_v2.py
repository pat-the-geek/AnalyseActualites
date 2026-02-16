#!/usr/bin/env python3
"""Script optimisé de génération de résumés d'articles d'actualité.

Version améliorée avec:
- Traitement parallèle pour extraction de texte
- Cache pour éviter requêtes redondantes
- Gestion d'erreurs robuste
- Logging centralisé
- Configuration centralisée

Usage:
    python Get_data_from_JSONFile_AskSummary_v2.py [date_debut] [date_fin]
    
Exemple:
    python Get_data_from_JSONFile_AskSummary_v2.py 2026-01-01 2026-01-31
"""

import json
import os
import sys
from pathlib import Path

# Ajouter le répertoire parent au PYTHONPATH pour importer utils
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_ROOT))

import requests
from datetime import datetime

# Import des modules utilitaires
from utils.logging import print_console, setup_logger, default_logger
from utils.config import get_config
from utils.api_client import EurIAClient
from utils.http_utils import fetch_and_extract_text, extract_top_n_largest_images
from utils.date_utils import (
    parse_iso_date,
    verifier_date_entre,
    get_default_date_range,
    validate_date_range
)
from utils.parallel import fetch_articles_parallel
from utils.cache import get_cache


# Configuration du logger
logger = setup_logger(__name__)


def demander_dates() -> tuple[str, str]:
    """Détermine les dates de début et de fin pour le traitement.
    
    Récupère les dates depuis les arguments de ligne de commande (sys.argv[1] et sys.argv[2])
    ou utilise des valeurs par défaut (du 1er jour du mois courant à aujourd'hui).
    
    Returns:
        Un tuple (date_debut, date_fin) au format "YYYY-MM-DD".
    
    Raises:
        ValueError: Si le format de date est invalide ou si date_debut >= date_fin.
    """
    if len(sys.argv) == 3:
        date_debut = sys.argv[1]
        date_fin = sys.argv[2]
        print_console(f"Dates prises en compte depuis les arguments : début={date_debut}, fin={date_fin}", level="info")
        
        # Valider les dates
        validate_date_range(date_debut, date_fin)
    else:
        date_debut, date_fin = get_default_date_range()
        print_console(f"Aucun argument fourni. Utilisation des dates par défaut : début={date_debut}, fin={date_fin}", level="info")
    
    return date_debut, date_fin


def fetch_json_feed(url: str, timeout: int = 10) -> dict:
    """Récupère et parse le flux JSON depuis une URL.
    
    Args:
        url: URL du flux JSON
        timeout: Timeout en secondes
    
    Returns:
        Données JSON parsées
    
    Raises:
        SystemExit: En cas d'erreur réseau ou de parsing
    """
    print_console(f"Chargement du flux JSON depuis : {url}", level="info")
    
    try:
        response = requests.get(url, timeout=timeout)
        response.raise_for_status()
        data = response.json()
        print_console(f"Flux JSON chargé avec succès ({len(data.get('items', []))} articles)", level="info")
        return data
        
    except requests.exceptions.HTTPError as e:
        logger.error(f"Erreur HTTP : {e}")
        sys.exit(1)
    except requests.exceptions.ConnectionError:
        logger.error("Erreur de connexion au serveur")
        sys.exit(1)
    except requests.exceptions.Timeout:
        logger.error("La requête a expiré")
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        logger.error(f"Erreur générale de requête : {e}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        logger.error(f"Erreur de parsing JSON : {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Erreur inattendue : {e}")
        sys.exit(1)


def create_report(file_output: Path, api_client: EurIAClient) -> None:
    """Génère un rapport synthétique Markdown à partir des articles.
    
    Args:
        file_output: Chemin du fichier JSON source contenant les articles
        api_client: Client API pour générer le rapport
    """
    print_console("Génération du rapport en cours...", level="info")
    
    try:
        with open(file_output, 'r', encoding='utf-8') as jsonfile:
            data = json.load(jsonfile)
        
        json_str = json.dumps(data, indent=2, ensure_ascii=False)
        
        # Générer le rapport via l'API
        config = get_config()
        report = api_client.generate_report(
            json_str,
            file_output.name,
            timeout=config.timeout_rapport
        )
        
        # Sauvegarder le rapport
        report_file = config.rapports_markdown_dir / f"rapport_sommaire_{file_output.stem}.md"
        
        with open(report_file, 'w', encoding='utf-8') as txtfile:
            txtfile.write(report)
        
        print_console(f"Le rapport a été sauvegardé dans le fichier {report_file}", level="info")
        
    except Exception as e:
        logger.error(f"Erreur lors de la génération du rapport : {e}")


def main():
    """Fonction principale du script."""
    print_console("=" * 80, level="info")
    print_console("Démarrage du script de génération de résumés d'articles", level="info")
    print_console("Version 2.0 - Optimisée avec traitement parallèle et cache", level="info")
    print_console("=" * 80, level="info")
    
    # Charger la configuration
    try:
        config = get_config()
        logger.info("Configuration chargée avec succès")
    except ValueError as e:
        logger.error(f"Erreur de configuration : {e}")
        sys.exit(1)
    
    # Initialiser le cache
    cache = get_cache()
    stats = cache.get_stats()
    logger.info(f"Cache : {stats['entries']} entrées, {stats['total_size_mb']:.2f} MB")
    
    # Récupération des dates de traitement
    try:
        date_debut, date_fin = demander_dates()
    except ValueError as e:
        logger.error(f"Erreur de dates : {e}")
        sys.exit(1)
    
    # Chargement du flux JSON
    data = fetch_json_feed(config.reeder_json_url)
    items = data.get('items', [])
    
    if not items:
        logger.warning("Aucun article trouvé dans le flux JSON")
        sys.exit(0)
    
    # Filtrer les articles par date d'abord pour optimiser
    print_console(f"Filtrage des articles entre {date_debut} et {date_fin}...", level="info")
    filtered_items = []
    
    for item in items:
        date_published = item.get('date_published', 'Unknown Date')
        date_obj = parse_iso_date(date_published)
        
        if date_obj:
            date_formatee = date_obj.strftime("%Y-%m-%d")
            if verifier_date_entre(date_formatee, date_debut, date_fin):
                filtered_items.append(item)
    
    print_console(f"{len(filtered_items)} articles correspondent aux dates spécifiées", level="info")
    
    if not filtered_items:
        logger.warning("Aucun article ne correspond aux dates spécifiées")
        sys.exit(0)
    
    # Extraction des textes en parallèle avec cache
    print_console("Extraction des textes en parallèle...", level="info")
    
    def fetch_with_cache(url: str) -> str:
        """Fonction wrapper pour fetch avec cache."""
        # Vérifier le cache d'abord
        cached_text = cache.get(f"text:{url}", ttl=86400)  # 24h
        if cached_text:
            return cached_text
        
        # Sinon extraire et cacher
        text = fetch_and_extract_text(url, timeout=10, max_retries=3)
        cache.set(f"text:{url}", text)
        return text
    
    texts = fetch_articles_parallel(
        filtered_items,
        fetch_with_cache,
        max_workers=5  # 5 requêtes en parallèle
    )
    
    # Initialiser le client API
    api_client = EurIAClient()
    
    # Traitement de chaque article : résumé IA et extraction d'images
    print_console("Génération des résumés...", level="info")
    articles_data = []
    
    for i, item in enumerate(filtered_items, 1):
        url = item.get('url')
        date_published = item.get('date_published', 'Unknown Date')
        
        # Récupérer le texte extrait
        text = texts.get(url, "Failed to retrieve text.")
        
        # Vérifier le cache pour le résumé
        resume_cache_key = f"resume:{url}:{date_published}"
        resume = cache.get(resume_cache_key, ttl=604800)  # 7 jours
        
        if not resume:
            # Générer le résumé via l'API
            resume = api_client.generate_summary(
                text,
                max_lines=20,
                timeout=config.timeout_resume
            )
            cache.set(resume_cache_key, resume)
        
        # Extraire la source
        authors = item.get('authors', [])
        if authors and isinstance(authors, list) and len(authors) > 0:
            source = authors[0].get('name', 'Unknown Source')
        else:
            source = 'Unknown Source'
        
        # Extraire les images (pas de cache car rapide)
        images = extract_top_n_largest_images(url, n=3, min_width=500, timeout=10)
        
        print_console(f"[{i}/{len(filtered_items)}] {source}: {len(resume)} car. | {len(images) if isinstance(images, list) else 0} images", level="debug")
        
        articles_data.append({
            "Date de publication": date_published,
            "Sources": source,
            "URL": url,
            "Résumé": resume,
            "Images": images
        })
    
    # Sauvegarde des résultats dans un fichier JSON
    file_output = config.data_articles_dir / f"articles_generated_{date_debut}_{date_fin}.json"
    
    with open(file_output, 'w', encoding='utf-8') as jsonfile:
        json.dump(articles_data, jsonfile, ensure_ascii=False, indent=4)
    
    print_console("", level="info")
    print_console(f"✓ Les textes de tous les articles ont été sauvés dans {file_output}", level="info")
    
    # Générer le rapport
    create_report(file_output, api_client)
    
    print_console("=" * 80)
    print_console("Traitement terminé avec succès!")
    print_console("=" * 80)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print_console("\nInterruption par l'utilisateur")
        sys.exit(130)
    except Exception as e:
        logger.exception(f"Erreur fatale : {e}")
        sys.exit(1)
