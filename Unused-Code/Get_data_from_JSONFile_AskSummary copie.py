"""
Get_data_from_JSONFile_AskSummary.py

Outil simple pour récupérer un flux JSON d'articles, extraire le texte des pages
et générer des résumés via une API d'IA. Produit un fichier JSON d'articles avec
les clés françaises : "Date de publication", "Sources", "URL", "Résumé".
Finalement génère par IA un rapport sommaire des actualités dans un fichier Mardown.

Entrées : la variable d'environnement `REEDER_JSON_URL` (URL du flux JSON).
Sortie : `articles_generated_<date_debut>_<date_fin>.json`.
Usage : configurer `.env` (REEDER_JSON_URL, URL, bearer, max_attempts, ...);
optionnellement fournir deux arguments CLI `YYYY-MM-DD YYYY-MM-DD` pour filtrer
la période traitée.
"""

##############################################################################
# Dépendances et utilité des modules importés
"""
Résumé des dépendances et usage rapide :
- Python 3.10+ recommandé.
- requests : effectuer des requêtes HTTP (pip install requests).
- beautifulsoup4 (BeautifulSoup) : parser HTML pour extraire le texte (pip install beautifulsoup4).
- python-dotenv (load_dotenv) : charger les variables depuis `.env` (pip install python-dotenv).
- tkinter : dialogues GUI pour la sélection de fichiers (sur macOS inclus; en headless, prévoyez des arguments CLI).

Variables d'environnement utilisées :
- REEDER_JSON_URL (obligatoire) : URL du flux JSON à traiter
- URL, bearer : endpoint et token pour l'API IA
- max_attempts, default_error_message : paramètres optionnels

Installation rapide :
    pip install requests beautifulsoup4 python-dotenv
"""

# Dépendances essentielles (priorité haute)
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# Utilitaires standard (priorité normale)
import json
import os
import sys
import time
from datetime import datetime, timedelta

##############################################################################
# Appel générique à l'API EurIA (basée sur Qwen3) avec gestion des erreurs
def ask_for_ia(prompt: str, max_attempts: int = 3, timeout: int = 60) -> str:
    """
    Envoie un prompt à l'API EurIA (basée sur Qwen3) et retourne la réponse textuelle.
    Utilise la recherche web si nécessaire (enable_web_search=True).
    Gère les erreurs et les tentatives automatiques.
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
            continue  # Réessayer
        except requests.exceptions.RequestException as e:
            # Log implicite (à adapter selon votre système)
            pass
        except (ValueError, KeyError, TypeError) as e:
            # Erreur de format de réponse
            pass

    return "Désolé, je n'ai pas pu obtenir de réponse. Veuillez réessayer plus tard."

##############################################################################
def print_console(msg) :
    """
    Affiche un message horodaté dans la console.

    Cette fonction préfixe `msg` par un horodatage local au format
    AAAA-MM-JJ HH:MM:SS puis imprime la chaîne résultante sur la
    sortie standard. Utile pour produire des logs simples et lisibles
    lors de l'exécution du script.

    :param msg: Chaîne (str) contenant le message à afficher
    """
    # Récupère la date et l'heure courantes
    now = datetime.now()
    # Formate la date/heure au format ISO local lisible: AAAA-MM-JJ HH:MM:SS
    current_time = now.strftime("%Y-%m-%d %H:%M:%S")
    # Affiche l'horodatage suivi du message fourni
    print(current_time + " " + msg)
    
##############################################################################
def verifier_date_entre(date_a_verifier, date_debut, date_fin):
    """
    Vérifie si une date (chaîne) se situe entre deux bornes incluses.

    Paramètres attendus :
    - date_a_verifier (str) : date au format "AAAA-MM-JJ" à tester
    - date_debut (str) : date de début au format "AAAA-MM-JJ"
    - date_fin (str) : date de fin au format "AAAA-MM-JJ"

    Retourne :
    - True si `date_a_verifier` est comprise entre `date_debut` et `date_fin` (inclus)
    - False si elle n'est pas dans l'intervalle ou si le format des dates est invalide

    En cas d'erreur de format, la fonction affiche les objets partiellement créés
    et renvoie False.
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
    
###############################################################################
# Fonction pour demander les dates de début et de fin
def demander_dates():
    """
    Détermine et retourne les dates de début et de fin utilisées par le script.

    Comportement :
    - Si deux arguments sont passés en ligne de commande, ils sont pris
        respectivement comme `date_debut` et `date_fin` (format attendu
        : "AAAA-MM-JJ").
    - Sinon, la période par défaut est du premier jour du mois courant
        jusqu'à la date du jour.

    Retour :
    - tuple(str, str) : (date_debut, date_fin) sous forme de chaînes
        au format "AAAA-MM-JJ".

    Exceptions :
    - Lève `ValueError` si une date n'est pas au format attendu ou si
        `date_debut` est postérieure ou égale à `date_fin`.
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
    
##############################################################################
# Fonction pour extraire le texte d'une URL
def fetch_and_extract_text(url):
    """
    Récupère le HTML d'une URL et en extrait le texte brut.

    Cette fonction effectue une requête HTTP GET sur `url`, vérifie
    que la réponse est correcte, puis utilise BeautifulSoup pour
    extraire et retourner le texte visible de la page. Le texte
    retourné est nettoyé en remplaçant les séparateurs par des espaces
    et en supprimant les espaces superflus.

    Paramètres:
    - url (str): adresse HTTP/HTTPS de la page à récupérer.

    Retourne:
    - str: texte extrait de la page si la récupération et le parsing
        réussissent; en cas d'erreur, renvoie la représentation en chaîne
        de l'exception rencontrée.

    Remarques:
    - La fonction ne lève pas d'exception vers l'appelant; elle capture
        toute exception et renvoie son message sous forme de chaîne.
    - Utilise `requests` (timeout géré par l'appelant si nécessaire)
        et `BeautifulSoup` pour le parsing HTML.
    """
    try:
        response = requests.get(url)
        print_console (url)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')
            
        return soup.get_text(separator=' ', strip=True)
    except Exception as e:
        return str(e)
    
##############################################################################
# Fonction pour extraire les 3 plus grandes images d'une URL   
def extract_top_3_largest_images(url):
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

##############################################################################
# Fonction pour demander le résumé d'un texte à l'IA
def askForResume(TextToResume):

    prompt_for_ai = "faire un résumé de ce texte sur maximum 20 lignes en français, ne donne que le résumé, sans commentaire ni remarque : "+ TextToResume

    return ask_for_ia (prompt_for_ai)
         
def create_report (file_output) :
    """
    Crée un rapport sommaire à partir du fichier JSON généré.

    Cette fonction lit le fichier JSON spécifié par `file_output`,
    extrait les résumés des articles, et génère un rapport sommaire
    en utilisant l'API EurIA. Le rapport est ensuite sauvegardé dans
    un fichier texte.

    Paramètres:
    - file_output (str): chemin du fichier JSON contenant les articles
        et leurs résumés.

    Retourne:
    - None: le rapport est sauvegardé dans un fichier texte.
    """
    
    print_console (f"Génération du rapport en cours...")

    with open(file_output, 'r', encoding='utf-8') as jsonfile:
        data = json.load(jsonfile)

    # Convertis en chaîne formatée
    json_str = json.dumps(data, indent=2, ensure_ascii=False)

    prompt_for_report = f"""
Analyse le fichier ce fichier JSON et fait une synthèse des actualités. 
Affiche la date de publication et les sources lorsque tu cites un article. 
Groupe les acticles par catégories que tu auras identifiées. 
En fin de synthèse fait un tableau avec les références (date de publication, sources et URL)
pour chaque article dans la rubrique "Images" il y a des liens d'images.
Lorsque cela est possible, publie le lien de l'image sous la forme <img src='{URL}' /> sur une nouvelle ligne en fin de paragraphe de catégorie. N'utilise qu'une image par paragraphe.

Filename: {file_output}
File contents:
----- BEGIN FILE CONTENTS -----
{json_str}
----- END FILE CONTENTS -----
"""

    print_console (prompt_for_report)

    report = ask_for_ia(prompt_for_report,3,300)

    report_file = f"rapport_sommaire_{file_output.replace('.json', '.md')}"

    with open(report_file, 'w', encoding='utf-8') as txtfile:
        txtfile.write(report)

    print_console (f"Le rapport a été sauvegardé dans le fichier {report_file}")

##############################################################################
# Main loop
##############################################################################

# Charger les variables d'environnement depuis le fichier .env
load_dotenv()

# Vérifier les valeurs chargées
URL = os.getenv("URL")
BEARER = os.getenv("bearer")
MAX_ATTEMPTS = int(os.getenv("max_attempts", "5"))
DEFAULT_ERROR_MESSAGE = os.getenv("default_error_message", "Aucune information disponible")
REEDER_JSON_URL = os.getenv("REEDER_JSON_URL")

# Charger le fichier JSON depuis l'URL, si le chargement échoue, quitter le programme
print_console (f"Fichier sélectionné " + REEDER_JSON_URL)

try:
    response = requests.get(REEDER_JSON_URL, timeout=10)  # Timeout de 10 secondes
    response.raise_for_status()  # Lève une exception si code HTTP >= 400
    data = response.json()  # Décode automatiquement le JSON
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

# Appeler la fonction et afficher les dates saisies
date_debut, date_fin = demander_dates()

# Extraire les URLs et les informations associées
items = data.get('items', [])

# Extraire le texte de chaque URL
# TODO: optimiser la sélection sur les dates de début et de fin : déjà essayé mais abandonné car pose trop de problème. À reprendre plus tard.
print_console ("Extraction des textes...")
texts = {item['url']: fetch_and_extract_text(item['url']) for item in items}

print_console ("Génération du fichier...")
data = []

# Génération du fichier JSON
for item in items:

    date_published = item.get('date_published', 'Unknown Date')

    # Conversion en objet datetime
    date_obj = datetime.strptime(date_published, "%Y-%m-%dT%H:%M:%SZ")

    # Conversion au format "%Y-%m-%d"
    date_formatee = date_obj.strftime("%Y-%m-%d")
 
    if verifier_date_entre(date_formatee, date_debut, date_fin):
        url = item['url']
                
        text = texts.get(url, "Failed to retrieve text.")
        resume = askForResume(text)
        source = item['authors'][0]['name'] if item['authors'] else 'Unknown Source'

        # TODO: réfléchir sur comment extraire les images et les exploiter dans le résumé
        images = extract_top_3_largest_images(url)

        print_console (str(resume))
        print_console (f"Image(s) trouvée(s) pour l'URL {url}  : {len(images)}")

        data.append({
                    "Date de publication": date_published,
                    "Sources": source,
                    "URL": url,
                    "Résumé": resume,
                    "Images": images
                     })

# Chemin du fichier où les textes seront sauvegardés
file_output = f"articles_generated_{date_debut}_{date_fin}.json"

with open(file_output, 'w', encoding='utf-8') as jsonfile:
    json.dump(data, jsonfile, ensure_ascii=False, indent=4)

print_console ("")
print_console(f"Les textes de tous les articles ont été sauvés dans le fichier " + file_output)

create_report (file_output)

##############################################################################