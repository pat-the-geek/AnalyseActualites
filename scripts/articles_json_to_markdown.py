
import json
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
        import argparse
        parser = argparse.ArgumentParser(description="Convertit un fichier JSON d'articles en Markdown.")
        parser.add_argument('input_file', help='Chemin du fichier JSON source')
        parser.add_argument('output_file', help='Chemin du fichier Markdown de sortie')
        args = parser.parse_args()

        if not os.path.isfile(args.input_file):
            print_console(f"Fichier d'entrée introuvable : {args.input_file}", level="error")
            return

        json_to_markdown(args.input_file, args.output_file)
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
