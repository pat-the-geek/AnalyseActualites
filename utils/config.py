"""Module de configuration centralisée pour AnalyseActualités.

Gère le chargement et la validation des variables d'environnement
et des chemins du projet.
"""

import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
from .logging import default_logger


class Config:
    """Configuration centralisée de l'application.
    
    Charge les variables d'environnement depuis le fichier .env
    et fournit un accès typé et validé aux paramètres de configuration.
    
    Attributes:
        project_root: Chemin racine du projet
        url: URL de l'API EurIA
        bearer: Token d'authentification API
        reeder_json_url: URL du flux JSON d'articles
        max_attempts: Nombre maximal de tentatives pour les requêtes
        timeout_resume: Timeout pour génération de résumés (secondes)
        timeout_rapport: Timeout pour génération de rapports (secondes)
    """
    
    def __init__(self, project_root: Optional[Path] = None):
        """Initialise la configuration.
        
        Args:
            project_root: Chemin racine du projet (détecté automatiquement si None)
        """
        # Détecter la racine du projet
        if project_root is None:
            # Remonter depuis utils/ vers la racine
            self.project_root = Path(__file__).parent.parent
        else:
            self.project_root = Path(project_root)
        
        # Charger les variables d'environnement
        env_file = self.project_root / ".env"
        if env_file.exists():
            load_dotenv(env_file)
            default_logger.info(f"Configuration chargée depuis {env_file}")
        else:
            default_logger.warning(f"Fichier .env non trouvé: {env_file}")
        
        # Charger et valider les variables
        self._load_config()
        self._validate_config()
    
    def _load_config(self):
        """Charge les variables d'environnement."""
        self.url = os.getenv("URL")
        self.bearer = os.getenv("bearer")
        self.reeder_json_url = os.getenv("REEDER_JSON_URL")
        
        # Paramètres avec valeurs par défaut
        self.max_attempts = int(os.getenv("max_attempts", "5"))
        self.timeout_resume = int(os.getenv("timeout_resume", "60"))
        self.timeout_rapport = int(os.getenv("timeout_rapport", "300"))
        self.default_error_message = os.getenv(
            "default_error_message",
            "Aucune information disponible"
        )
        
        # Chemins des répertoires
        self.data_articles_dir = self.project_root / "data" / "articles"
        self.data_raw_dir = self.project_root / "data" / "raw"
        self.rapports_markdown_dir = self.project_root / "rapports" / "markdown"
        self.rapports_pdf_dir = self.project_root / "rapports" / "pdf"
        self.config_dir = self.project_root / "config"
    
    def _validate_config(self):
        """Valide que les variables obligatoires sont présentes."""
        errors = []
        
        if not self.url:
            errors.append("Variable d'environnement manquante: URL")
        if not self.bearer:
            errors.append("Variable d'environnement manquante: bearer")
        if not self.reeder_json_url:
            errors.append("Variable d'environnement manquante: REEDER_JSON_URL")
        
        # Validation des timeouts
        if self.timeout_resume < 10 or self.timeout_resume > 600:
            default_logger.warning(
                f"timeout_resume hors limites recommandées (10-600s): {self.timeout_resume}"
            )
        if self.timeout_rapport < 60 or self.timeout_rapport > 600:
            default_logger.warning(
                f"timeout_rapport hors limites recommandées (60-600s): {self.timeout_rapport}"
            )
        
        if errors:
            error_msg = "\n".join(errors)
            default_logger.error(f"Erreurs de configuration:\n{error_msg}")
            raise ValueError(f"Configuration invalide:\n{error_msg}")
        
        default_logger.info("Configuration validée avec succès")
    
    def setup_directories(self):
        """Crée les répertoires nécessaires s'ils n'existent pas."""
        directories = [
            self.data_articles_dir,
            self.data_raw_dir,
            self.rapports_markdown_dir,
            self.rapports_pdf_dir
        ]
        
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
            default_logger.debug(f"Répertoire vérifié/créé: {directory}")
    
    def get_api_headers(self) -> dict:
        """Retourne les headers pour l'API EurIA.
        
        Returns:
            Dictionnaire avec les headers d'authentification
        """
        return {
            'Authorization': f'Bearer {self.bearer}',
            'Content-Type': 'application/json',
        }
    
    def __repr__(self) -> str:
        """Représentation string de la configuration (sans le token)."""
        return (
            f"Config(url={self.url}, "
            f"reeder_json_url={self.reeder_json_url[:50]}..., "
            f"max_attempts={self.max_attempts})"
        )


# Instance globale de configuration (lazy loading)
_config_instance: Optional[Config] = None


def get_config(force_reload: bool = False) -> Config:
    """Retourne l'instance unique de configuration.
    
    Args:
        force_reload: Force le rechargement de la configuration
    
    Returns:
        Instance Config
    """
    global _config_instance
    
    if _config_instance is None or force_reload:
        _config_instance = Config()
        _config_instance.setup_directories()
    
    return _config_instance
