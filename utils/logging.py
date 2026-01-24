"""Module de journalisation centralisé pour AnalyseActualités.

Fournit des fonctions de logging horodatées pour remplacer les print_console()
dupliqués dans les scripts.
"""

import logging
from datetime import datetime
from typing import Optional


def setup_logger(name: str = __name__, level: int = logging.INFO) -> logging.Logger:
    """Configure et retourne un logger formaté.
    
    Args:
        name: Nom du logger (généralement __name__)
        level: Niveau de logging (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    
    Returns:
        Logger configuré avec un format horodaté
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)
    
    # Éviter les doublons si déjà configuré
    if logger.handlers:
        return logger
    
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    
    return logger


def print_console(msg: str) -> None:
    """Affiche un message horodaté dans la console (fonction de compatibilité).
    
    Cette fonction maintient la compatibilité avec le code existant qui utilise
    print_console(). Format: "AAAA-MM-JJ HH:MM:SS message"
    
    Args:
        msg: Le message à afficher.
    
    Example:
        >>> print_console("Traitement en cours...")
        2026-01-24 22:00:00 Traitement en cours...
    """
    now = datetime.now()
    current_time = now.strftime("%Y-%m-%d %H:%M:%S")
    print(f"{current_time} {msg}")


# Logger par défaut pour le projet
default_logger = setup_logger("AnalyseActualites")
