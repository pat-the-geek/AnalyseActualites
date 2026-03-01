
import json
import re
from datetime import datetime
import traceback
import os
import sys
from collections import defaultdict

# Mapping type NER → (étiquette française, catégorie officielle)
# Source : docs/ENTITIES.md § 3 — Les 18 types d'entités reconnus
_ENTITY_META = {
    "PERSON":      ("Personne",                          "Acteurs"),
    "ORG":         ("Organisation",                      "Acteurs"),
    "NORP":        ("Groupe nat./pol./religieux",        "Acteurs"),
    "GPE":         ("Lieu géopolitique",                 "Géographie"),
    "LOC":         ("Lieu géographique",                 "Géographie"),
    "FAC":         ("Infrastructure / lieu",             "Géographie"),
    "PRODUCT":     ("Produit / technologie",             "Objets"),
    "WORK_OF_ART": ("Œuvre",                            "Objets"),
    "LAW":         ("Loi / réglementation",              "Objets"),
    "EVENT":       ("Événement",                         "Événements"),
    "DATE":        ("Date",                              "Temporel"),
    "TIME":        ("Heure",                             "Temporel"),
    "MONEY":       ("Montant",                           "Quantitatif"),
    "QUANTITY":    ("Quantité",                          "Quantitatif"),
    "PERCENT":     ("Pourcentage",                       "Quantitatif"),
    "CARDINAL":    ("Cardinal",                          "Quantitatif"),
    "ORDINAL":     ("Ordinal",                           "Quantitatif"),
    "LANGUAGE":    ("Langue",                            "Linguistique"),
}

_CATEGORY_ORDER = [
    "Acteurs", "Géographie", "Objets",
    "Événements", "Temporel", "Quantitatif", "Linguistique",
]

# Abréviations inline pour l'annotation dans le corps du résumé
_ENTITY_ABBR = {
    "PERSON":      "pers.",
    "ORG":         "org.",
    "NORP":        "grp.",
    "GPE":         "géo.",
    "LOC":         "loc.",
    "FAC":         "infra.",
    "PRODUCT":     "prod.",
    "WORK_OF_ART": "œuvre",
    "LAW":         "loi",
    "EVENT":       "évén.",
    "DATE":        "date",
    "TIME":        "heure",
    "MONEY":       "mont.",
    "QUANTITY":    "qté",
    "PERCENT":     "%",
    "CARDINAL":    "card.",
    "ORDINAL":     "ord.",
    "LANGUAGE":    "lang.",
}

# Longueur minimale pour annoter une entité (évite les acronymes trop courts)
_MIN_ENTITY_LEN = 3


def _annotate_resume(resume: str, entities: dict) -> str:
    """
    Annote les mentions d'entités directement dans le texte du résumé.
    Notation : ==entité==^[abbr.]^  (highlight iA Writer + type en exposant)
    Stratégie : remplacement par marqueurs temporaires (plus long d'abord)
    pour éviter les sous-correspondances et les doubles annotations.
    """
    to_annotate = []
    for etype, values in entities.items():
        if not isinstance(values, list):
            continue
        abbr = _ENTITY_ABBR.get(etype, etype.lower())
        for val in values:
            val = val.strip()
            if len(val) >= _MIN_ENTITY_LEN:
                to_annotate.append((val, abbr))

    if not to_annotate:
        return resume

    # Trier du plus long au plus court — évite les sous-correspondances
    to_annotate.sort(key=lambda x: len(x[0]), reverse=True)

    # Passe 1 : remplacer les mentions par des marqueurs temporaires (octets nuls)
    placeholders = {}
    result = resume
    for i, (val, abbr) in enumerate(to_annotate):
        ph = f"\x00{i:04d}\x00"
        placeholders[ph] = f"**{val}** [{abbr}]"
        result = re.sub(r'\b' + re.escape(val) + r'\b', ph, result, flags=re.IGNORECASE)

    # Passe 2 : substituer les marqueurs par la forme annotée finale
    for ph, annotated in placeholders.items():
        result = result.replace(ph, annotated)

    return result


def _format_entities_md(entities: dict) -> str:
    """
    Formate le bloc entités nommées selon la notation officielle de ENTITIES.md §3 :
    regroupement par catégorie, libellés français, format Markdown lisible.
    """
    # Regrouper par catégorie officielle
    by_cat = defaultdict(list)          # catégorie → [(label_fr, valeurs)]
    unknown = []                        # types inconnus, affichés sans catégorie

    for etype, values in entities.items():
        if not isinstance(values, list) or not values:
            continue
        if etype in _ENTITY_META:
            label_fr, cat = _ENTITY_META[etype]
            by_cat[cat].append((label_fr, values))
        else:
            unknown.append((etype, values))

    if not by_cat and not unknown:
        return ""

    lines = ["**Entités nommées** :\n"]

    for cat in _CATEGORY_ORDER:
        if cat not in by_cat:
            continue
        # Trier les types dans l'ordre du mapping pour chaque catégorie
        type_strs = []
        for label_fr, values in by_cat[cat]:
            type_strs.append(f"*{label_fr}* : {', '.join(values)}")
        lines.append(f"- **{cat}** — {' · '.join(type_strs)}\n")

    for etype, values in unknown:
        lines.append(f"- **{etype}** : {', '.join(values)}\n")

    lines.append("\n")
    return "".join(lines)

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
            titre = article.get('Titre', '').strip()
            source_line = f"{article.get('Sources', 'Source inconnue')} - {article.get('Date de publication', '')}"
            markdown_content.append(f"## {titre if titre else source_line}\n")
            if titre:
                markdown_content.append(f"*{source_line}*\n\n")
            markdown_content.append(f"**URL**: {article.get('URL', '')}\n\n")

            # Résumé — avec annotation inline des entités nommées
            entities = article.get('entities')
            resume_text = article.get('Résumé', '')
            if entities and isinstance(entities, dict):
                resume_text = _annotate_resume(resume_text, entities)
            markdown_content.append(f"**Résumé**:\n{resume_text}\n\n")

            # Entités nommées — notation officielle ENTITIES.md §3
            if entities and isinstance(entities, dict):
                block = _format_entities_md(entities)
                if block:
                    markdown_content.append(block)

            images = article.get('Images')
            if images:
                # Si c'est une liste d'images
                if isinstance(images, list):
                    for img in images:
                        if isinstance(img, dict) and 'url' in img:
                            alt = img.get('alt') or img.get('title') or ''
                            markdown_content.append(f"![{alt}]({img['url']})\n")
                # Si c'est un dict (erreur ou image unique)
                elif isinstance(images, dict):
                    if 'url' in images:
                        alt = images.get('alt') or images.get('title') or ''
                        markdown_content.append(f"![{alt}]({images['url']})\n")
                    # 'error' ignoré silencieusement (ex: 403 Forbidden)
                # Si c'est une chaîne URL brute (les erreurs textuelles sont ignorées)
                elif isinstance(images, str) and images.startswith('http'):
                    markdown_content.append(f"![]({images})\n")
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
