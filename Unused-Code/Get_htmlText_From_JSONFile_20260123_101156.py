import requests
from bs4 import BeautifulSoup
import json
import sys

import time
from datetime import datetime

import tkinter as tk
from tkinter import filedialog

def print_console(msg) :
    now = datetime.now()
    current_time = now.strftime("%Y-%m-%d %H:%M:%S")
    print (current_time + " " + msg)
    

# Créer une fenêtre racine Tkinter (elle ne sera pas affichée)
root = tk.Tk()
root.withdraw()  # Masquer la fenêtre racine

# Ouvrir une boîte de dialogue pour sélectionner un fichier
file_path = filedialog.askopenfilename(
    title="Sélectionner un fichier JSON",
    filetypes=[("Fichiers JSON", "*.json"),("Tous les fichiers", "*.*") ]
)

# Vérifier si un fichier a été sélectionné
if file_path:
    print_console ("Fichier sélectionné : " + file_path)
else:
    sys.exit()


# Charger le fichier JSON
with open(file_path, 'r') as file:
    data = json.load(file)

# Extraire les URLs et les informations associées
items = data.get('items', [])

# Fonction pour extraire le texte d'une URL
def fetch_and_extract_text(url):
    try:
        response = requests.get(url)
        print_console (url)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')
        return soup.get_text(separator=' ', strip=True)
    except Exception as e:
        return str(e)

# Extraire le texte de chaque URL
print_console ("Extraction des textes...")
texts = {item['url']: fetch_and_extract_text(item['url']) for item in items}

# Chemin du fichier où les textes seront sauvegardés
output_file = 'all_articles.txt'

print_console ("Génération du fichier...")
# Sauvegarder tous les textes dans un seul fichier avec source et date de parution
with open(output_file, 'w', encoding='utf-8') as file:
    for item in items:
      
        url = item['url']
        
        text = texts.get(url, "Failed to retrieve text.")
        source = item['authors'][0]['name'] if item['authors'] else 'Unknown Source'
        date_published = item.get('date_published', 'Unknown Date')
        
        print_console (source)

        file.write(f"Source: {source}\n")
        file.write(f"Date de parution: {date_published}\n")
        file.write(f"URL: {url}\n")
        file.write(f"Text:\n{text}\n{'-'*80}\n")

print_console ("")
print_console(f"Les textes de tous les articles ont été sauvés dans le fichier {output_file}")
