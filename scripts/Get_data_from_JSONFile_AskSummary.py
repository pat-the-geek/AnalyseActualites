"""Script de génération de résumés d'articles d'actualité.

Ce module récupère un flux JSON d'articles depuis une URL, extrait le contenu HTML
de chaque article, génère des résumés via une API d'IA (EurIA/Qwen3), et produit
un fichier JSON structuré avec des clés en français ainsi qu'un rapport Markdown.
Pour chaque actualité, le programme extrait également les 3 plus grandes images 
de la page web (largeur > 500 pixels) triées par surface décroissante.

Usage:
    python Get_data_from_JSONFile_AskSummary.py [date_debut] [date_fin]
    
Exemple:
    python Get_data_from_JSONFile_AskSummary.py 2025-12-01 2025-12-31

Variables d'environnement requises (fichier .env):
    REEDER_JSON_URL : URL du flux JSON à traiter
    URL : Endpoint de l'API IA
    bearer : Token d'authentification pour l'API
    max_attempts : Nombre maximal de tentatives (défaut: 5)
    default_error_message : Message d'erreur par défaut

Dépendances:
    - requests : Requêtes HTTP
    - beautifulsoup4 : Parsing HTML
    - python-dotenv : Gestion des variables d'environnement
    - tkinter : Dialogues GUI (fourni avec Python)

Sorties:
    articles_generated_<date_debut>_<date_fin>.json : Données des articles
    rapport_sommaire_articles_generated_<date_debut>_<date_fin>.md : Rapport synthétique
"""

# Imports des bibliothèques tierces
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# Imports de la bibliothèque standard
import json
import os
import sys
import time
from datetime import datetime, timedelta

def ask_for_ia(prompt: str, max_attempts: int = 3, timeout: int = 60) -> str:
    """Envoie un prompt à l'API EurIA et retourne la réponse.
    
    Cette fonction interroge l'API EurIA (basée sur Qwen3) avec activation
    de la recherche web. Elle implémente une logique de retry automatique
    en cas d'échec.
    
    Args:
        prompt: Le texte du prompt à envoyer à l'API.
        max_attempts: Nombre maximal de tentatives en cas d'échec (défaut: 3).
        timeout: Délai d'attente maximal en secondes pour chaque requête (défaut: 60).
    
    Returns:
        La réponse textuelle de l'API, nettoyée des espaces superflus.
        En cas d'échec après toutes les tentatives, retourne un message d'erreur standard.
    
    Note:
        Utilise les variables globales URL et BEARER pour l'authentification.
    """
    data = {
        "messages": [{"content": prompt, "role": "user"}],
        "model": "qwen3",
        "enable_web_search": True
    }
    headers = {
        'Authorization': f'Bearer {BEARER}',
        'Content-Type': 'application/json',
    }

    for attempt in range(max_attempts):
        try:
            response = requests.post(URL, json=data, headers=headers, timeout=timeout)
            response.raise_for_status()
            json_data = response.json()

            if 'choices' in json_data and len(json_data['choices']) > 0:
                content = json_data['choices'][0]['message']['content']
                return content.strip()  # Nettoyage des espaces superflus

            raise ValueError("Réponse API invalide : champ 'choices' manquant ou vide.")

        except requests.exceptions.Timeout:
            continue  # Timeout: réessayer avec la prochaine tentative
        except requests.exceptions.RequestException:
            # Erreur réseau: passer à la tentative suivante
            continue
        except (ValueError, KeyError, TypeError):
            # Erreur de format de réponse JSON: passer à la tentative suivante
            continue

    return "Désolé, je n'ai pas pu obtenir de réponse. Veuillez réessayer plus tard."

def print_console(msg: str) -> None:
    """Affiche un message horodaté dans la console.
    
    Préfixe le message avec l'horodatage local au format AAAA-MM-JJ HH:MM:SS
    et l'affiche sur la sortie standard.
    
    Args:
        msg: Le message à afficher.
    """
    now = datetime.now()
    current_time = now.strftime("%Y-%m-%d %H:%M:%S")
    print(f"{current_time} {msg}")
    
def verifier_date_entre(date_a_verifier: str, date_debut: str, date_fin: str) -> bool:
    """Vérifie si une date se situe entre deux bornes incluses.
    
    Args:
        date_a_verifier: Date à tester au format "AAAA-MM-JJ".
        date_debut: Date de début au format "AAAA-MM-JJ".
        date_fin: Date de fin au format "AAAA-MM-JJ".
    
    Returns:
        True si la date est dans l'intervalle [date_debut, date_fin], False sinon.
        Retourne également False en cas d'erreur de format de date.
    """
    try:
        # Convertir les dates en objets datetime
        date_a_verifier_obj = datetime.strptime(date_a_verifier, "%Y-%m-%d")
        date_debut_obj = datetime.strptime(date_debut, "%Y-%m-%d")
        date_fin_obj = datetime.strptime(date_fin, "%Y-%m-%d")

        # Vérifier si la date à vérifier est entre la date de début et la date de fin
        if date_debut_obj <= date_a_verifier_obj <= date_fin_obj:
            return True
        else:
            return False
    except ValueError:
        print(date_a_verifier_obj)
        print(date_debut_obj)
        print(date_fin_obj)
        print("Format de date invalide. Veuillez utiliser le format AAAA-MM-JJ.")
        return False
    
def demander_dates() -> tuple[str, str]:
    """Détermine les dates de début et de fin pour le traitement.
    
    Récupère les dates depuis les arguments de ligne de commande (sys.argv[1] et sys.argv[2])
    ou utilise des valeurs par défaut (du 1er jour du mois courant à aujourd'hui).
    
    Returns:
        Un tuple (date_debut, date_fin) au format "AAAA-MM-JJ".
    
    Raises:
        ValueError: Si le format de date est invalide ou si date_debut >= date_fin.
    """

    if len(sys.argv) == 3:
        date_debut = sys.argv[1]
        date_fin = sys.argv[2]
        print(f"Dates prises en compte depuis les arguments : début={date_debut}, fin={date_fin}")
    else:
        today = datetime.today()
        date_debut = today.replace(day=1).strftime("%Y-%m-%d")
        date_fin = today.strftime("%Y-%m-%d")
        print(f"Aucun argument fourni. Utilisation des dates par défaut : début={date_debut}, fin={date_fin}")

    try:
        date_debut_obj = datetime.strptime(date_debut, "%Y-%m-%d")
        date_fin_obj = datetime.strptime(date_fin, "%Y-%m-%d")
    except ValueError:
        raise ValueError("Format de date invalide. Utilisez le format AAAA-MM-JJ.")

    if date_debut_obj >= date_fin_obj:
        raise ValueError("La date de début doit être antérieure à la date de fin.")

    return date_debut, date_fin
    
def fetch_and_extract_text(url: str) -> str:
    """Récupère le contenu HTML d'une URL et extrait le texte brut.
    
    Effectue une requête HTTP GET, parse le HTML avec BeautifulSoup,
    et extrait le texte visible en nettoyant les espaces.
    
    Args:
        url: L'adresse HTTP/HTTPS de la page à récupérer.
    
    Returns:
        Le texte extrait de la page. En cas d'erreur (réseau, parsing, etc.),
        retourne le message d'erreur sous forme de chaîne.
    
    Note:
        Cette fonction ne propage pas les exceptions ; elle les capture
        et retourne leur représentation textuelle.
    """
    try:
        response = requests.get(url)
        print_console(url)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')
        return soup.get_text(separator=' ', strip=True)
    except Exception as e:
        return str(e)
    
def extract_top_3_largest_images(url: str) -> list[dict] | dict:
    """Extrait les 3 plus grandes images d'une page web.
    
    Parse le HTML de l'URL fournie, identifie toutes les images avec une largeur
    supérieure à 500 pixels, calcule leur surface, et retourne les 3 plus grandes
    triées par taille décroissante.
    
    Args:
        url: L'adresse de la page web à analyser.
    
    Returns:
        Une liste de 3 dictionnaires maximum, chacun contenant:
            - url: URL de l'image
            - title: Attribut title de l'image
            - alt: Attribut alt de l'image
            - width: Largeur en pixels
            - height: Hauteur en pixels
            - area: Surface calculée (width * height)
        En cas d'erreur, retourne un dictionnaire avec une clé 'error'.
    """
    try:
        # Récupérer le contenu de la page
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        # Parser le HTML
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Trouver toutes les balises <img>
        images = []
        for img in soup.find_all('img'):
            src = img.get('src', '').strip()
            title = img.get('title', '').strip()
            alt = img.get('alt', '').strip()
            width = img.get('width', '0')
            height = img.get('height', '0')
            
            # Convertir en entiers
            try:
                width = int(width)
                height = int(height)
            except ValueError:
                width = 0
                height = 0
            
            # Filtrer : width > 500 ET src commence par http:// ou https://
            if width > 500 and src.startswith(('http://', 'https://')):
                area = width * height
                images.append({
                    'url': src,
                    'title': title,
                    'alt': alt,
                    'width': width,
                    'height': height,
                    'area': area
                })
        
        # Trier par surface décroissante
        images.sort(key=lambda x: x['area'], reverse=True)
        
        # Retourner les 3 premières
        return images[:3]
    
    except Exception as e:
        return {"error": str(e)}

def askForResume(TextToResume: str) -> str:
    """Génère un résumé d'un texte via l'API IA.
    
    Construit un prompt demandant un résumé concis en français (maximum 20 lignes)
    et l'envoie à l'API EurIA.
    
    Args:
        TextToResume: Le texte à résumer.
    
    Returns:
        Le résumé généré par l'IA.
    """
    prompt_for_ai = (
        "faire un résumé de ce texte sur maximum 20 lignes en français, "
        "ne donne que le résumé, sans commentaire ni remarque : " + TextToResume
    )
    return ask_for_ia(prompt_for_ai)

def create_report(file_output: str) -> None:
    """Génère un rapport synthétique Markdown à partir des articles.
    
    Lit le fichier JSON d'articles, crée un prompt d'analyse pour l'IA,
    génère une synthèse structurée par catégories avec références et images,
    puis sauvegarde le résultat dans un fichier Markdown.
    
    Args:
        file_output: Chemin du fichier JSON source contenant les articles.
    
    Side Effects:
        Crée un fichier rapport_sommaire_<nom_fichier>.md dans le répertoire courant.
    """
    print_console("Génération du rapport en cours...")

    with open(file_output, 'r', encoding='utf-8') as jsonfile:
        data = json.load(jsonfile)

    json_str = json.dumps(data, indent=2, ensure_ascii=False)

    prompt_for_report = f"""
Analyse le fichier ce fichier JSON et fait une synthèse des actualités. 
Affiche la date de publication et les sources lorsque tu cites un article. 
Groupe les acticles par catégories que tu auras identifiées. 
En fin de synthèse fait un tableau avec les références (date de publication, sources et URL)
pour chaque article dans la rubrique "Images" il y a des liens d'images.
Lorsque cela est possible, publie le lien de l'image sous la forme <img src='{URL}' /> sur une nouvelle ligne en fin de paragraphe de catégorie. N'utilise qu'une image par paragraphe et assure-toi qu'une même URL d'image n'apparaisse qu'une seule fois dans tout le rapport.

Filename: {file_output}
File contents:
----- BEGIN FILE CONTENTS -----
{json_str}
----- END FILE CONTENTS -----
"""

    print_console(prompt_for_report)

    report = ask_for_ia(prompt_for_report, 3, 300)

    # Extraire juste le nom de fichier sans le chemin pour le rapport
    base_filename = os.path.basename(file_output)
    report_file = os.path.join(RAPPORTS_MARKDOWN_DIR, f"rapport_sommaire_{base_filename.replace('.json', '.md')}")

    with open(report_file, 'w', encoding='utf-8') as txtfile:
        txtfile.write(report)

    print_console(f"Le rapport a été sauvegardé dans le fichier {report_file}")


# ==============================================================================
# Programme principal
# ==============================================================================

# Détection automatique du répertoire du projet (peu importe d'où le script est lancé)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)  # Remonte d'un niveau depuis scripts/
DATA_ARTICLES_DIR = os.path.join(PROJECT_ROOT, "data", "articles")
DATA_RAW_DIR = os.path.join(PROJECT_ROOT, "data", "raw")
RAPPORTS_MARKDOWN_DIR = os.path.join(PROJECT_ROOT, "rapports", "markdown")

# Créer les dossiers s'ils n'existent pas
os.makedirs(DATA_ARTICLES_DIR, exist_ok=True)
os.makedirs(DATA_RAW_DIR, exist_ok=True)
os.makedirs(RAPPORTS_MARKDOWN_DIR, exist_ok=True)

# Chargement de la configuration depuis le fichier .env (à la racine du projet)
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))
URL = os.getenv("URL")
BEARER = os.getenv("bearer")
MAX_ATTEMPTS = int(os.getenv("max_attempts", "5"))
DEFAULT_ERROR_MESSAGE = os.getenv("default_error_message", "Aucune information disponible")
REEDER_JSON_URL = os.getenv("REEDER_JSON_URL")

# Chargement du fichier JSON depuis l'URL distante
print_console(f"Fichier sélectionné : {REEDER_JSON_URL}")

try:
    response = requests.get(REEDER_JSON_URL, timeout=10)
    response.raise_for_status()
    data = response.json()
except requests.exceptions.HTTPError as e:
    print(f"Erreur HTTP : {e}")
    sys.exit()
except requests.exceptions.ConnectionError:
    print("Erreur de connexion au serveur.")
    sys.exit()
except requests.exceptions.Timeout:
    print("La requête a expiré.")
    sys.exit()
except requests.exceptions.RequestException as e:
    print(f"Erreur générale de requête : {e}")
    sys.exit()
except json.JSONDecodeError as e:
    print(f"Erreur de parsing JSON : {e}")
    sys.exit()      
except Exception as e:
    print(f"Erreur inattendue : {e}")
    sys.exit()  

# Récupération des dates de traitement
date_debut, date_fin = demander_dates()

# Extraction de la liste des articles depuis le flux JSON
items = data.get('items', [])

# TODO: Optimiser le filtrage par dates avant l'extraction des textes
#       (actuellement filtré après extraction pour éviter les problèmes de format)
print_console("Extraction des textes...")
texts = {item['url']: fetch_and_extract_text(item['url']) for item in items}

print_console("Génération du fichier...")
data = []

# Traitement de chaque article : résumé IA et extraction d'images
for item in items:

    date_published = item.get('date_published', 'Unknown Date')
    date_obj = datetime.strptime(date_published, "%Y-%m-%dT%H:%M:%SZ")
    date_formatee = date_obj.strftime("%Y-%m-%d")
 
    if verifier_date_entre(date_formatee, date_debut, date_fin):
        url = item['url']
                
        text = texts.get(url, "Failed to retrieve text.")
        resume = askForResume(text)
        source = item['authors'][0]['name'] if item['authors'] else 'Unknown Source'

        # TODO: Intégrer les images directement dans le résumé IA
        images = extract_top_3_largest_images(url)

        print_console(str(resume))
        print_console(f"Image(s) trouvée(s) pour l'URL {url} : {len(images)}")

        data.append({
                    "Date de publication": date_published,
                    "Sources": source,
                    "URL": url,
                    "Résumé": resume,
                    "Images": images
                     })

# Sauvegarde des résultats dans un fichier JSON
file_output = os.path.join(DATA_ARTICLES_DIR, f"articles_generated_{date_debut}_{date_fin}.json")

with open(file_output, 'w', encoding='utf-8') as jsonfile:
    json.dump(data, jsonfile, ensure_ascii=False, indent=4)

print_console("")
print_console(f"Les textes de tous les articles ont été sauvés dans le fichier {file_output}")

create_report(file_output)