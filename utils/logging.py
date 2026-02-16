"""Module de journalisation centralisé pour AnalyseActualités.

Fournit des fonctions de logging horodatées pour remplacer les print_console()
dupliqués dans les scripts.
"""

import logging
import logging.config
import os
from datetime import datetime
from typing import Optional


def setup_logger(name: str = "AnalyseActualites", level: int = logging.INFO) -> logging.Logger:
    """Configure et retourne un logger formaté selon logging.conf si présent.
    Si le script tourne dans Docker (env DOCKER=1), log en niveau INFO sur stdout.
    """
    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config", "logging.conf")
    if os.path.exists(config_path):
        logging.config.fileConfig(config_path, disable_existing_loggers=False)
    else:
        # Fallback simple
        logging.basicConfig(
            level=level,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
    logger = logging.getLogger(name)
    # Si on est dans Docker, forcer le niveau INFO
    if os.environ.get("DOCKER") == "1":
        logger.setLevel(logging.INFO)
    return logger


def print_console(msg: str, level: str = "info") -> None:
    """Affiche un message horodaté dans la console et loggue via le logger principal.
    Args:
        msg: Le message à afficher.
        level: Niveau de log ('info', 'warning', 'error', 'debug', 'critical')
    """
    logger = logging.getLogger("AnalyseActualites")
    now = datetime.now()
    current_time = now.strftime("%Y-%m-%d %H:%M:%S")
    # Affichage console pour compatibilité
    print(f"{current_time} {msg}")
    # Logging structuré
    if level == "info":
        logger.info(msg)
    elif level == "warning":
        logger.warning(msg)
    elif level == "error":
        logger.error(msg)
    elif level == "debug":
        logger.debug(msg)
    elif level == "critical":
        logger.critical(msg)
    else:
        logger.info(msg)


# Logger par défaut pour le projet
default_logger = setup_logger("AnalyseActualites")
