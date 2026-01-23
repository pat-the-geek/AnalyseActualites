"""Script d'extraction de texte HTML depuis un flux JSON.

Ce script permet de:
- Sélectionner un fichier JSON contenant une liste d'articles (avec URLs)
- Récupérer le contenu HTML de chaque article via HTTP
- Extraire le texte brut de chaque page web
- Générer un fichier texte consolidé (all_articles.txt) avec toutes les informations

Format d'entrée attendu:
    Le fichier JSON doit contenir un tableau 'items' où chaque élément a:
    - 'url': l'URL de l'article à extraire
    - 'authors': liste d'auteurs avec au moins un objet contenant 'name'
    - 'date_published': date de publication au format ISO 8601

Format de sortie:
    Fichier texte (all_articles.txt) contenant pour chaque article:
    - Source (nom de l'auteur)
    - Date de parution
    - URL
    - Texte complet extrait
    - Séparateur (80 tirets)

Utilisation:
    python3 Get_htmlText_From_JSONFile.py
    (une boîte de dialogue s'ouvre pour sélectionner le fichier JSON)

Dépendances:
    - requests: pour récupérer le contenu HTML
    - beautifulsoup4: pour parser le HTML et extraire le texte
    - tkinter: pour l'interface de sélection de fichier (stdlib)
"""

import requests
from bs4 import BeautifulSoup
import json
import sys

import time
from datetime import datetime

import tkinter as tk
from tkinter import filedialog

def print_console(msg):
    """Affiche un message avec horodatage dans la console.
    
    Args:
        msg (str): Le message à afficher
        
    Exemple:
        >>> print_console("Traitement en cours...")
        2026-01-23 14:30:45 Traitement en cours...
    """
    now = datetime.now()
    current_time = now.strftime("%Y-%m-%d %H:%M:%S")
    print (current_time + " " + msg)
    

# ============================================================================
# Configuration et sélection du fichier d'entrée
# ============================================================================

# Créer une fenêtre racine Tkinter (elle ne sera pas affichée)
root = tk.Tk()
root.withdraw()  # Masquer la fenêtre racine

# Ouvrir une boîte de dialogue pour sélectionner un fichier JSON
file_path = filedialog.askopenfilename(
    title="Sélectionner un fichier JSON",
    filetypes=[("Fichiers JSON", "*.json"),("Tous les fichiers", "*.*") ]
)

# Vérifier si un fichier a été sélectionné
if file_path:
    print_console ("Fichier sélectionné : " + file_path)
else:
    # Aucun fichier sélectionné, on quitte le programme
    sys.exit()


# ============================================================================
# Chargement et parsing du fichier JSON
# ============================================================================

# Charger le fichier JSON contenant les articles
with open(file_path, 'r') as file:
    data = json.load(file)

# Extraire la liste des articles (tableau 'items')
items = data.get('items', [])

# ============================================================================
# Fonction d'extraction de texte HTML
# ============================================================================

def fetch_and_extract_text(url):
    """Récupère et extrait le texte brut d'une page web.
    
    Cette fonction:
    1. Effectue une requête HTTP GET vers l'URL fournie
    2. Parse le contenu HTML avec BeautifulSoup
    3. Extrait tout le texte visible (sans les balises HTML)
    
    Args:
        url (str): L'URL de la page web à extraire
        
    Returns:
        str: Le texte extrait de la page, ou un message d'erreur
            en cas d'échec (problème réseau, page inaccessible, etc.)
            
    Exemple:
        >>> text = fetch_and_extract_text('https://example.com/article')
        >>> print(text[:100])
        'Titre de l'article... contenu du texte...'
    """
    try:
        # Récupérer le contenu HTML de la page
        response = requests.get(url)
        print_console (url)
        
        # Vérifier que la requête a réussi (code 200)
        response.raise_for_status()
        
        # Parser le HTML et extraire le texte
        soup = BeautifulSoup(response.content, 'html.parser')
        return soup.get_text(separator=' ', strip=True)
    except Exception as e:
        # En cas d'erreur, retourner le message d'erreur comme texte
        return str(e)

# ============================================================================
# Extraction du texte de tous les articles
# ============================================================================

# Parcourir chaque article et extraire son texte
print_console ("Extraction des textes...")
texts = {item['url']: fetch_and_extract_text(item['url']) for item in items}

# ============================================================================
# Génération du fichier de sortie
# ============================================================================

# Nom du fichier où tous les textes seront consolidés
output_file = '../data/raw/all_articles.txt'

print_console ("Génération du fichier...")

# Sauvegarder tous les textes dans un seul fichier avec métadonnées
with open(output_file, 'w', encoding='utf-8') as file:
    for item in items:
        # Récupérer l'URL de l'article
        url = item['url']
        
        # Récupérer le texte extrait (ou message d'erreur)
        text = texts.get(url, "Failed to retrieve text.")
        
        # Extraire la source (premier auteur) ou 'Unknown Source' si absent
        source = item['authors'][0]['name'] if item['authors'] else 'Unknown Source'
        
        # Extraire la date de publication ou 'Unknown Date' si absente
        date_published = item.get('date_published', 'Unknown Date')
        
        print_console (source)

        # Écrire les métadonnées et le texte dans le fichier
        file.write(f"Source: {source}\n")
        file.write(f"Date de parution: {date_published}\n")
        file.write(f"URL: {url}\n")
        file.write(f"Text:\n{text}\n{'-'*80}\n")

# ============================================================================
# Fin du traitement
# ============================================================================

print_console ("")
print_console(f"Les textes de tous les articles ont été sauvés dans le fichier {output_file}")
