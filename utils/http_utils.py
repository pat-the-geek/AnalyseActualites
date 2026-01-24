"""Module utilitaires HTTP pour AnalyseActualités.

Fournit des fonctions robustes pour les requêtes HTTP avec:
- Gestion cohérente des timeouts
- Retry automatique avec backoff exponentiel
- Extraction de texte HTML
- Validation des réponses
"""

import time
import requests
from bs4 import BeautifulSoup
from typing import Optional, Tuple
from .logging import default_logger


class HTTPError(Exception):
    """Exception levée lors d'erreurs HTTP."""
    pass


def create_session_with_retries(
    total_retries: int = 3,
    backoff_factor: float = 0.5,
    status_forcelist: Tuple[int, ...] = (429, 500, 502, 503, 504)
) -> requests.Session:
    """Crée une session requests avec stratégie de retry.
    
    Args:
        total_retries: Nombre total de tentatives
        backoff_factor: Facteur multiplicateur pour le backoff (0.5 = 0.5s, 1s, 2s...)
        status_forcelist: Codes HTTP qui déclenchent un retry
    
    Returns:
        Session requests configurée
    """
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
    
    session = requests.Session()
    retry_strategy = Retry(
        total=total_retries,
        backoff_factor=backoff_factor,
        status_forcelist=status_forcelist,
        allowed_methods=["HEAD", "GET", "OPTIONS", "POST"]
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    
    return session


def fetch_and_extract_text(
    url: str,
    timeout: int = 10,
    max_retries: int = 3
) -> str:
    """Récupère le contenu HTML d'une URL et extrait le texte brut.
    
    Effectue une requête HTTP GET avec retry automatique, parse le HTML 
    avec BeautifulSoup, et extrait le texte visible en nettoyant les espaces.
    
    Args:
        url: L'adresse HTTP/HTTPS de la page à récupérer
        timeout: Délai d'attente maximal en secondes (défaut: 10)
        max_retries: Nombre maximal de tentatives (défaut: 3)
    
    Returns:
        Le texte extrait de la page. En cas d'erreur, retourne un message
        d'erreur descriptif.
    
    Example:
        >>> text = fetch_and_extract_text('https://example.com/article')
        >>> print(text[:100])
        'Ceci est le contenu de l'article...'
    """
    if not url or not isinstance(url, str):
        return "Erreur: URL invalide ou manquante"
    
    # Validation URL HTTPS recommandée
    if not url.startswith(('http://', 'https://')):
        default_logger.warning(f"URL sans protocole HTTP(S): {url}")
        return f"Erreur: URL invalide (pas de protocole HTTP): {url}"
    
    for attempt in range(max_retries):
        try:
            response = requests.get(url, timeout=timeout)
            response.raise_for_status()
            
            # Parser le HTML et extraire le texte
            soup = BeautifulSoup(response.content, 'html.parser')
            text = soup.get_text(separator=' ', strip=True)
            
            default_logger.debug(f"Texte extrait de {url}: {len(text)} caractères")
            return text
            
        except requests.exceptions.Timeout:
            default_logger.warning(f"Timeout lors de la récupération de {url} (tentative {attempt+1}/{max_retries})")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)  # Backoff exponentiel
            else:
                return f"Erreur: Timeout après {max_retries} tentatives pour {url}"
                
        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code if e.response else 'inconnu'
            default_logger.error(f"Erreur HTTP {status_code} pour {url}")
            return f"Erreur HTTP {status_code}: {url}"
            
        except requests.exceptions.ConnectionError:
            default_logger.error(f"Erreur de connexion pour {url} (tentative {attempt+1}/{max_retries})")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
            else:
                return f"Erreur: Impossible de se connecter à {url}"
                
        except Exception as e:
            default_logger.error(f"Erreur inattendue pour {url}: {type(e).__name__}: {e}")
            return f"Erreur: {type(e).__name__}: {str(e)}"
    
    return "Erreur: Échec après toutes les tentatives"


def extract_top_n_largest_images(
    url: str,
    n: int = 3,
    min_width: int = 500,
    timeout: int = 10
) -> list[dict] | dict:
    """Extrait les N plus grandes images d'une page web.
    
    Parse le HTML de l'URL fournie, identifie toutes les images avec une largeur
    supérieure à min_width pixels, calcule leur surface, et retourne les N plus 
    grandes triées par taille décroissante.
    
    Args:
        url: L'adresse de la page web à analyser
        n: Nombre d'images à retourner (défaut: 3)
        min_width: Largeur minimale en pixels (défaut: 500)
        timeout: Délai d'attente maximal en secondes (défaut: 10)
    
    Returns:
        Une liste de N dictionnaires maximum, chacun contenant:
            - url: URL de l'image
            - title: Attribut title de l'image
            - alt: Attribut alt de l'image
            - width: Largeur en pixels
            - height: Hauteur en pixels
            - area: Surface calculée (width * height)
        En cas d'erreur, retourne un dictionnaire avec une clé 'error'.
    """
    try:
        response = requests.get(url, timeout=timeout)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        images = []
        for img in soup.find_all('img'):
            src = img.get('src', '').strip()
            title = img.get('title', '').strip()
            alt = img.get('alt', '').strip()
            width = img.get('width', '0')
            height = img.get('height', '0')
            
            # Convertir en entiers avec validation
            try:
                width = int(width) if width else 0
                height = int(height) if height else 0
            except (ValueError, TypeError):
                width = 0
                height = 0
            
            # Filtrer : width > min_width ET src commence par http:// ou https://
            if width > min_width and src.startswith(('http://', 'https://')):
                area = width * height
                images.append({
                    'url': src,
                    'title': title,
                    'alt': alt,
                    'width': width,
                    'height': height,
                    'area': area
                })
        
        # Trier par surface décroissante et retourner les N premières
        images.sort(key=lambda x: x['area'], reverse=True)
        return images[:n]
    
    except requests.exceptions.Timeout:
        default_logger.error(f"Timeout lors de l'extraction d'images de {url}")
        return {"error": f"Timeout après {timeout}s"}
    except requests.exceptions.RequestException as e:
        default_logger.error(f"Erreur réseau lors de l'extraction d'images: {e}")
        return {"error": f"Erreur réseau: {str(e)}"}
    except Exception as e:
        default_logger.error(f"Erreur inattendue lors de l'extraction d'images: {e}")
        return {"error": str(e)}
