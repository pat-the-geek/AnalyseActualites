
import json
import tkinter as tk
from tkinter import filedialog
from datetime import datetime
import traceback
import os
import sys

# Import du logger centralisé
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.logging import print_console, setup_logger
logger = setup_logger("AnalyseActualites")

def json_to_markdown(input_file, output_file):
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        markdown_content = []

        # Gestion des structures de données JSON
        if isinstance(data, dict) and "articles" in data:
            articles = data["articles"]
        elif isinstance(data, list):
            articles = data
        else:
            raise ValueError("Format JSON non supporté : doit contenir une liste d'articles ou un dictionnaire avec une clé 'articles'.")

        for article in articles:
            # Parser et reformater la date
            date_str = article.get('Date de publication')
            try:
                date_obj = datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%SZ")
                formatted_date = date_obj.strftime("%d-%m-%Y %H:%M")
            except (ValueError, TypeError):
                formatted_date = date_str if date_str else "Date inconnue"

            # Titre1 avec la date et la source
            source = article.get('Sources', 'Source inconnue')
            titre = f"# {formatted_date} — {source}\n"
            url = f"[Lien sur l'article]({article.get('URL', '#')})\n"
            resume = f"\n\n{article.get('Résumé', '')}\n\n"

            markdown_content.extend([titre, url, resume, "---\n\n"])

        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(''.join(markdown_content))

        print_console(f"Le fichier Markdown '{output_file}' a été généré avec succès.")

    except json.JSONDecodeError as e:
        print_console(f"Erreur de décodage JSON : {e}", level="error")
    except FileNotFoundError as e:
        print_console(f"Fichier non trouvé : {e}", level="error")
    except Exception as e:
        print_console(f"Erreur inattendue : {e}", level="error")
        traceback.print_exc()

def main():

    try:
        root = tk.Tk()
        root.withdraw()
        input_file = filedialog.askopenfilename(
            title="Choisissez un fichier JSON",
            filetypes=[("Fichiers JSON", "*.json")]
        )
        root.destroy()

        # Extraire le répertoire et le nom de fichier sans extension
        initialdir = os.path.dirname(input_file)
        initialfile = os.path.splitext(os.path.basename(input_file))[0] + ".md"

        output_file = filedialog.asksaveasfilename(
            title="Enregistrer le fichier Markdown sous...",
            initialdir=initialdir,
            initialfile=initialfile,
            defaultextension=".md",
            filetypes=[("Fichiers Markdown", "*.md"), ("Tous les fichiers", "*.*")]
        )
        if output_file:
            json_to_markdown(input_file, output_file)

        else:
            print_console("Aucun fichier sélectionné.", level="warning")

    except Exception as e:
        import traceback
        print_console(f"Erreur avec l'interface graphique : {e}", level="error")
        traceback.print_exc()
        print_console("Essayez de lancer le script depuis un terminal local.", level="warning")

if __name__ == "__main__":
    main()
