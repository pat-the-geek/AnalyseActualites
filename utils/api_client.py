"""Module client API pour l'interaction avec EurIA d'Infomaniak.

Fournit une interface robuste pour envoyer des prompts à l'API EurIA
avec retry automatique et gestion d'erreurs avancée.
"""

import time
import requests
from typing import Optional
from .logging import default_logger
from .config import get_config


class EurIAClient:
    """Client pour l'API EurIA (Qwen3) d'Infomaniak.
    
    Gère les requêtes vers l'API avec retry automatique, timeouts configurables,
    et validation des réponses.
    
    Attributes:
        url: URL de l'endpoint API
        headers: Headers HTTP incluant l'authentification
        model: Nom du modèle IA à utiliser
        enable_web_search: Active la recherche web pour le contexte
    """
    
    def __init__(
        self,
        url: Optional[str] = None,
        bearer: Optional[str] = None,
        model: str = "qwen3",
        enable_web_search: bool = True
    ):
        """Initialise le client API.
        
        Args:
            url: URL de l'API (utilise la config si None)
            bearer: Token d'authentification (utilise la config si None)
            model: Nom du modèle IA à utiliser (défaut: qwen3)
            enable_web_search: Active la recherche web (défaut: True)
        """
        config = get_config()
        
        self.url = url or config.url
        self.bearer = bearer or config.bearer
        self.model = model
        self.enable_web_search = enable_web_search
        
        self.headers = {
            'Authorization': f'Bearer {self.bearer}',
            'Content-Type': 'application/json',
        }
        
        if not self.url or not self.bearer:
            raise ValueError("URL et bearer token requis pour le client API")
    
    def ask(
        self,
        prompt: str,
        max_attempts: int = 3,
        timeout: int = 60,
        backoff_factor: float = 2.0
    ) -> str:
        """Envoie un prompt à l'API EurIA et retourne la réponse.
        
        Cette fonction interroge l'API EurIA avec retry automatique en cas d'échec.
        Un backoff exponentiel est appliqué entre les tentatives.
        
        Args:
            prompt: Le texte du prompt à envoyer à l'API
            max_attempts: Nombre maximal de tentatives en cas d'échec (défaut: 3)
            timeout: Délai d'attente maximal en secondes pour chaque requête (défaut: 60)
            backoff_factor: Facteur multiplicateur pour le backoff entre tentatives (défaut: 2.0)
        
        Returns:
            La réponse textuelle de l'API, nettoyée des espaces superflus.
            En cas d'échec après toutes les tentatives, retourne un message d'erreur.
        
        Example:
            >>> client = EurIAClient()
            >>> reponse = client.ask("Résume cet article: ...")
            >>> print(reponse)
        """
        if not prompt or not isinstance(prompt, str):
            default_logger.error("Prompt invalide ou vide")
            return "Erreur: Prompt invalide"
        
        data = {
            "messages": [{"content": prompt, "role": "user"}],
            "model": self.model,
            "enable_web_search": self.enable_web_search
        }
        
        last_error = None
        
        for attempt in range(max_attempts):
            try:
                default_logger.info(
                    f"Envoi de prompt à l'API (tentative {attempt + 1}/{max_attempts}, "
                    f"timeout={timeout}s)"
                )
                
                response = requests.post(
                    self.url,
                    json=data,
                    headers=self.headers,
                    timeout=timeout
                )
                response.raise_for_status()
                json_data = response.json()
                
                # Valider la structure de la réponse
                if 'choices' not in json_data or len(json_data['choices']) == 0:
                    raise ValueError("Réponse API invalide : champ 'choices' manquant ou vide")
                
                content = json_data['choices'][0]['message']['content']
                
                if not content:
                    raise ValueError("Réponse API vide")
                
                default_logger.info(f"Réponse reçue de l'API: {len(content)} caractères")
                return content.strip()
            
            except requests.exceptions.Timeout as e:
                last_error = f"Timeout après {timeout}s"
                default_logger.warning(
                    f"Timeout lors de la tentative {attempt + 1}/{max_attempts}"
                )
                
            except requests.exceptions.HTTPError as e:
                status_code = e.response.status_code if e.response else 'inconnu'
                last_error = f"Erreur HTTP {status_code}"
                default_logger.error(
                    f"Erreur HTTP {status_code} lors de la tentative {attempt + 1}/{max_attempts}"
                )
                
                # Ne pas retry pour certains codes d'erreur
                if status_code in [400, 401, 403, 404]:
                    default_logger.error("Erreur non récupérable, arrêt des tentatives")
                    break
                
            except requests.exceptions.ConnectionError as e:
                last_error = "Erreur de connexion"
                default_logger.error(
                    f"Erreur de connexion lors de la tentative {attempt + 1}/{max_attempts}: {e}"
                )
                
            except (ValueError, KeyError, TypeError) as e:
                last_error = f"Erreur de format de réponse: {e}"
                default_logger.error(
                    f"Erreur de parsing de la réponse lors de la tentative "
                    f"{attempt + 1}/{max_attempts}: {e}"
                )
            
            except Exception as e:
                last_error = f"Erreur inattendue: {type(e).__name__}: {e}"
                default_logger.error(
                    f"Erreur inattendue lors de la tentative {attempt + 1}/{max_attempts}: {e}"
                )
            
            # Backoff exponentiel avant la prochaine tentative
            if attempt < max_attempts - 1:
                wait_time = backoff_factor ** attempt
                default_logger.info(f"Attente de {wait_time:.1f}s avant nouvelle tentative...")
                time.sleep(wait_time)
        
        # Toutes les tentatives ont échoué
        error_message = (
            f"Échec après {max_attempts} tentatives. "
            f"Dernière erreur: {last_error}"
        )
        default_logger.error(error_message)
        
        return f"Désolé, je n'ai pas pu obtenir de réponse. {last_error}. Veuillez réessayer plus tard."
    
    def generate_summary(
        self,
        text: str,
        max_lines: int = 20,
        language: str = "français",
        timeout: int = 60
    ) -> str:
        """Génère un résumé d'un texte via l'API IA.
        
        Args:
            text: Le texte à résumer
            max_lines: Nombre maximal de lignes pour le résumé (défaut: 20)
            language: Langue du résumé (défaut: français)
            timeout: Timeout en secondes (défaut: 60)
        
        Returns:
            Le résumé généré par l'IA
        """
        prompt = (
            f"Faire un résumé de ce texte sur maximum {max_lines} lignes en {language}, "
            f"ne donne que le résumé, sans commentaire ni remarque : {text}"
        )
        return self.ask(prompt, timeout=timeout)
    
    def generate_report(
        self,
        json_content: str,
        filename: str,
        timeout: int = 300
    ) -> str:
        """Génère un rapport synthétique à partir de données JSON.
        
        Args:
            json_content: Contenu JSON des articles
            filename: Nom du fichier source
            timeout: Timeout en secondes (défaut: 300)
        
        Returns:
            Rapport formaté en Markdown
        """
        prompt = f"""
Analyse le fichier ce fichier JSON et fait une synthèse des actualités. 
Affiche la date de publication et les sources lorsque tu cites un article. 
Groupe les articles par catégories que tu auras identifiées. 
En fin de synthèse fait un tableau avec les références (date de publication, sources et URL)
pour chaque article dans la rubrique "Images" il y a des liens d'images.
Lorsque cela est possible, publie le lien de l'image sous la forme <img src='{{URL}}' /> sur une nouvelle ligne en fin de paragraphe de catégorie. N'utilise qu'une image par paragraphe et assure-toi qu'une même URL d'image n'apparaisse qu'une seule fois dans tout le rapport.

Filename: {filename}
File contents:
----- BEGIN FILE CONTENTS -----
{json_content}
----- END FILE CONTENTS -----
"""
        return self.ask(prompt, max_attempts=3, timeout=timeout)
