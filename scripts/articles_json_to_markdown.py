import json
import tkinter as tk
from tkinter import filedialog
from datetime import datetime
import traceback
import os

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

        print(f"Le fichier Markdown '{output_file}' a été généré avec succès.")

    except json.JSONDecodeError as e:
        print(f"Erreur de décodage JSON : {e}")
    except FileNotFoundError as e:
        print(f"Fichier non trouvé : {e}")
    except Exception as e:
        print(f"Erreur inattendue : {e}")
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
            print("Aucun fichier sélectionné.")

    except Exception as e:
        import traceback
        print(f"Erreur avec l'interface graphique : {e}")
        traceback.print_exc()
        print("Essayez de lancer le script depuis un terminal local.")

if __name__ == "__main__":
    main()
