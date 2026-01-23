# AnalyseActualités

Pipeline de collecte et d'analyse d'actualités utilisant des flux RSS/JSON et l'API EurIA d'Infomaniak (modèle Qwen3) pour générer des résumés automatiques d'articles.

## 📋 Description

Ce projet collecte automatiquement des articles depuis des flux RSS/JSON, extrait leur contenu HTML, et génère des résumés intelligents via l'API EurIA. Les résultats sont exportés en JSON et peuvent être convertis en rapports Markdown.

## 🚀 Fonctionnalités

- **Collecte de flux RSS/JSON** : Récupération automatique d'articles depuis des sources configurables
- **Extraction de contenu** : Analyse HTML et extraction du texte principal des articles
- **Génération de résumés IA** : Utilisation de l'API EurIA (Qwen3) pour créer des résumés pertinents
- **Export multi-formats** : JSON structuré et rapports Markdown
- **Interface GUI** : Sélection de fichiers via interface graphique (tkinter)

## 📁 Structure du projet

```
AnalyseActualités/
├── scripts/                              # Scripts Python
│   ├── Get_data_from_JSONFile_AskSummary.py  # Script principal (collecte + résumés IA)
│   ├── Get_htmlText_From_JSONFile.py         # Extraction de texte HTML
│   ├── articles_json_to_markdown.py          # Conversion JSON → Markdown
│   └── analyse_thematiques.py                # Analyse thématiques sociétales
│
├── config/                               # Configuration
│   ├── sites_actualite.json              # Liste des sources RSS/JSON
│   ├── categories_actualite.json         # Catégories d'articles
│   ├── prompt-rapport.txt                # Template de prompt pour rapports
│   └── thematiques_societales.json       # Thématiques sociétales (12 thèmes)
│
├── data/                                 # Données générées
│   ├── articles/                         # Articles JSON par période
│   └── raw/                              # Données brutes (HTML, texte)
│
├── rapports/                             # Rapports générés
│   ├── markdown/                         # Rapports .md
│   └── pdf/                              # Rapports PDF (si générés)
│
├── archives/                             # Anciennes versions de scripts
├── tests/                                # Tests unitaires
├── .github/                              # Configuration GitHub/Copilot
├── .env                                  # Variables d'environnement (non versionné)
└── README.md                             # Ce fichier
```

## 🔧 Installation

### Prérequis

- Python 3.10+
- Compte Infomaniak avec accès à l'API EurIA
- Environnement graphique (pour tkinter)

### Installation des dépendances

```bash
pip install -r requirements.txt
```

### Configuration

Créez un fichier `.env` à la racine avec :

```env
URL=https://api.infomaniak.com/euria/v1/chat/completions
bearer=VOTRE_TOKEN_API_INFOMANIAK
REEDER_JSON_URL=URL_DE_VOTRE_FLUX_JSON
```

## � Utilisation

### 1. Générer des résumés d'articles

```bash
# Depuis n'importe quel répertoire (v2.0+)
python3 scripts/Get_data_from_JSONFile_AskSummary.py [date_debut] [date_fin]

# Exemples
python3 scripts/Get_data_from_JSONFile_AskSummary.py 2026-01-01 2026-01-31
python3 scripts/Get_data_from_JSONFile_AskSummary.py  # dates par défaut
```

- Récupère articles depuis `REEDER_JSON_URL` (configuré dans `.env`)
- Génère résumés via l'API EurIA
- Sauvegarde dans `data/articles/articles_generated_YYYY-MM-DD_YYYY-MM-DD.json`
- Génère rapport dans `rapports/markdown/rapport_sommaire_*.md`

**Nouveauté v2.0 :** Les scripts utilisent maintenant des chemins absolus et fonctionnent depuis n'importe quel répertoire.

**Format d'entrée attendu** : JSON avec un tableau `items` contenant :
```json
{
  "items": [
    {
      "url": "https://...",
      "date_published": "2025-01-23T10:00:00Z",
      "authors": [{"name": "Auteur"}]
    }
  ]
}
```

**Format de sortie** : Liste d'objets avec clés françaises :
```json
[
  {
    "Date de publication": "23/01/2025",
    "Sources": "Nom de la source",
    "URL": "https://...",
    "Résumé": "Résumé généré par l'IA..."
  }
]
```

### 2. Extraire le texte HTML brut

```bash
python3 scripts/Get_htmlText_From_JSONFile.py
```

- Sélectionnez un fichier JSON de flux
- Génère `data/raw/all_articles.txt` avec le contenu texte de chaque article

### 3. Convertir en Markdown

```bash
python3 scripts/articles_json_to_markdown.py
```Chemins absolus automatiques (v2.0)
Les scripts détectent automatiquement leur emplacement et construisent des chemins absolus :
```python
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_ARTICLES_DIR = os.path.join(PROJECT_ROOT, "data", "articles")
```
**Avantages :**
- ✅ Fonctionne depuis n'importe quel répertoire
- ✅ Compatible raccourcis macOS, cron, automatisation
- ✅ Pas de dépendance au répertoire courant (`cwd`)

### 

- Sélectionnez un fichier JSON d'articles
- Choisissez le nom/emplacement du fichier Markdown de sortie
- Génère un rapport lisible avec références

## 🔑 Points clés techniques

### Format de dates
Les dates sont au format ISO 8601 : `YYYY-MM-DDTHH:MM:SSZ`
```python
datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%SZ")
```

### API EurIA (Infomaniak)
- Endpoint : `/euria/v1/chat/completions`
- Modèle : Qwen3
- Authentification : Bearer token
- Retry automatique avec backoff exponentiel

### Sauvegarde automatique
Conformément à la politique du projet, **toute modification de script Python doit être précédée d'une sauvegarde** dans `archives/` avec timestamp :
```bash
cp "script.py" "archives/script_$(date +%Y%m%d_%H%M%S).py"
```

## 🛠️ Développement

### Ajouter une nouvelle source

Modifiez `config/sites_actualite.json` :
```json
{
  "Titre": "Nom de la source",
  "URL": "https://exemple.com/feed.rss"
}
```

### Ajouter une catégorie

Modifiez `config/categories_actualite.json` :
```json
{
  "Catégories": "Nouvelle catégorie"
}
```

### Logs et debugging

Utilisez la fonction `print_console()` définie dans les scripts pour des logs horodatés :
```python
print_console("Message de débogage")
```

## ⚠️ Limitations

- **Interface GUI requise** : Les scripts utilisent `tkinter` pour la sélection de fichiers (ne fonctionne pas en headless)
- **Noms de fichiers fixes** : Certains scripts écrivent dans des fichiers prédéfinis (à adapter si besoin)
- **Langue française** : Les clés JSON et messages sont en français

## 📝 Licence

Projet personnel - Patrick Ostertag

## 📧 Contact

- **Auteur** : Patrick Ostertag
- **Email** : patrick.ostertag@gmail.com
- **Site** : http://patrickostertag.ch

## 🤖 IA utilisée

- **Moteur** : EurIA (Infomaniak)
- **Modèle** : Qwen3
- **URL** : https://euria.infomaniak.com
- **Documentation prompts** : [PROMPTS.md](PROMPTS.md)
