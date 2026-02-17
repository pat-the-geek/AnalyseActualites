
import json
from datetime import datetime
import traceback
import os
import sys

# Import du logger centralisé
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.logging import print_console, setup_logger
logger = setup_logger("AnalyseActualites")

def json_to_markdown(input_file, output_file=None):
    try:
        if not os.path.isfile(input_file):
            print_console(f"Fichier d'entrée introuvable : {input_file}", level="error")
            return

        with open(input_file, 'r', encoding='utf-8') as f:
            articles = json.load(f)

        # Déduire le nom du flux à partir du chemin du fichier JSON (data/articles/<nom-flux>/...)
        flux_nom = os.path.basename(os.path.dirname(input_file))
        # Générer le répertoire de sortie Markdown
        from utils.config import get_config
        config = get_config()
        markdown_dir = config.rapports_markdown_dir / flux_nom
        markdown_dir.mkdir(parents=True, exist_ok=True)

        # Nom de fichier Markdown par défaut
        if output_file is None:
            base = os.path.splitext(os.path.basename(input_file))[0]
            output_file = markdown_dir / f"{base}.md"

        markdown_content = []
        for article in articles:
            markdown_content.append(f"## {article.get('Sources', 'Source inconnue')} - {article.get('Date de publication', '')}\n")
            markdown_content.append(f"**URL**: {article.get('URL', '')}\n\n")
            markdown_content.append(f"**Résumé**:\n{article.get('Résumé', '')}\n\n")
            images = article.get('Images')
            if images:
                # Si c'est une liste d'images
                if isinstance(images, list):
                    for img in images:
                        if isinstance(img, dict) and 'url' in img:
                            markdown_content.append(f"![]({img['url']})\n")
                # Si c'est un dict (erreur ou image unique)
                elif isinstance(images, dict):
                    if 'url' in images:
                        markdown_content.append(f"![]({images['url']})\n")
                    elif 'error' in images:
                        markdown_content.append(f"_Image non disponible : {images['error']}_\n")
                # Si c'est une chaîne (erreur ou url brute)
                elif isinstance(images, str):
                    if images.startswith('http'):
                        markdown_content.append(f"![]({images})\n")
                    else:
                        markdown_content.append(f"_Image non disponible : {images}_\n")
            markdown_content.append("---\n\n")

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
    import argparse
    parser = argparse.ArgumentParser(description="Convertit un fichier JSON d'articles en Markdown (multi-flux)")
    parser.add_argument('input_file', help='Chemin du fichier JSON source')
    parser.add_argument('--output_file', help='Chemin du fichier Markdown de sortie (optionnel)')
    args = parser.parse_args()
    json_to_markdown(args.input_file, args.output_file)

if __name__ == "__main__":
    main()
