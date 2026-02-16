# Documentation de la structure du projet

Date de restructuration : 23 janvier 2026  
**Dernière mise à jour:** 23 janvier 2026 (v2.0 - chemins absolus)

## 📊 Vue d'ensemble

Ce document décrit l'organisation du projet AnalyseActualités après restructuration et l'implémentation des chemins absolus automatiques.

## 🗂️ Arborescence complète

```
AnalyseActualités/
│
├── .env                              # Variables d'environnement (non versionné)
├── .gitignore                        # Fichiers à ignorer par Git
├── README.md                         # Documentation principale du projet
├── requirements.txt                  # Dépendances Python
│
├── .github/                          # Configuration GitHub
│   └── copilot-instructions.md       # Instructions pour GitHub Copilot
│
├── scripts/                          # Scripts Python d'exécution
│   ├── Get_data_from_JSONFile_AskSummary.py    # Collecte + résumés IA
│   ├── Get_htmlText_From_JSONFile.py           # Extraction HTML
│   ├── articles_json_to_markdown.py            # Conversion JSON → MD
│   ├── analyse_thematiques.py                  # Analyse thématiques sociétales
│   └── USAGE.md                                # Guide d'utilisation des scripts
│
├── config/                           # Fichiers de configuration
│   ├── sites_actualite.json          # Liste des sources RSS/JSON (133 sources)
│   ├── categories_actualite.json     # Catégories d'articles (215 catégories)
│   ├── prompt-rapport.txt            # Template de prompt pour rapports
│   └── thematiques_societales.json   # Thématiques sociétales (12 thèmes avec stats)
│
├── data/                             # Données générées par les scripts
│   ├── articles/                     # Articles JSON structurés
│   │   ├── articles_generated_2025-12-01_2025-12-28.json
│   │   └── articles_generated_2026-01-01_2026-01-18.json
│   │
│   └── raw/                          # Données brutes (HTML, texte)
│       └── all_articles.txt          # Texte consolidé de tous les articles
│
├── rapports/                         # Rapports générés
│   ├── markdown/                     # Rapports au format Markdown
│   │   ├── rapport_complet_ia_gouvernement.md
│   │   ├── rapport_sommaire_articles_generated_2025-12-01_2025-12-28.md
│   │   └── rapport_sommaire_articles_generated_2026-01-01_2026-01-18.md
│   │
│   └── pdf/                          # Rapports PDF (si générés)
│       └── rapport_sommaire_articles_generated_2025-12-01_2025-12-28.pdf
│
├── archives/                         # Anciennes versions des scripts
│   ├── Get_data_from_JSONFile_AskSummary copie.py
│   ├── Get_data_from_JSONFile_AskSummary.py
│   ├── Get_data_from_JSONFile_AskSummary_20260118_112119.py
│   └── Get_htmlText_From_JSONFile_20260123_101156.py
│
└── tests/                            # Tests unitaires (à développer)
```

## 📁 Description des dossiers

### `/scripts/`
**Rôle** : Contient tous les scripts Python exécutables du projet.

**Points clés** :
- Les scripts utilisent des chemins relatifs (`../config/`, `../data/`, etc.)
- Doivent être exécutés depuis ce dossier : `cd scripts/ && python3 script.py`
- Chaque script a une documentation en en-tête (docstring)

### `/config/`
**Rôle** : Fichiers de configuration et paramétrage du projet.

**Fichiers** :
- `sites_actualite.json` : 133 sources d'actualités (RSS/JSON feeds)
- `categories_actualite.json` : 215 catégories prédéfinies pour la classification
- `prompt-rapport.txt` : Template de prompt pour la génération de rapports IA
- `thematiques_societales.json` : 12 thématiques sociétales avec mots-clés de détection, statistiques d'occurrence et rangs (utilisé pour catégorisation automatique)

**Usage** : Modifiez ces fichiers pour ajouter/retirer des sources, catégories ou thématiques.

### `/data/`
**Rôle** : Stockage des données générées par les scripts.

**Sous-dossiers** :
- `articles/` : Fichiers JSON structurés avec résumés IA et métadonnées
- `raw/` : Données brutes (texte HTML extrait, logs, etc.)

**Important** : Ce dossier grandit avec le temps. Archivez régulièrement les anciens articles.

### `/rapports/`
**Rôle** : Rapports générés automatiquement ou manuellement.

**Sous-dossiers** :
- `markdown/` : Rapports au format Markdown (lisibles, versionnables)
- `pdf/` : Rapports convertis en PDF (distribution, impression)

**Convention de nommage** :
- `rapport_sommaire_articles_generated_<date_debut>_<date_fin>.md`
- `rapport_complet_<sujet>.md`

### `/archives/`
**Rôle** : Sauvegarde des anciennes versions de scripts avant modification.

**Convention** :
- Format : `nom_script_YYYYMMDD_HHMMSS.py`
- Créer une sauvegarde avant toute modification : 
  ```bash
  cp script.py ../archives/script_$(date +%Y%m%d_%H%M%S).py
  ```

### `/tests/`
**Rôle** : Tests unitaires et d'intégration (à développer).

**Status** : Actuellement vide. À implémenter pour :
- Tests de parsing JSON
- Tests de l'extraction HTML
- Tests de validation des résumés IA
- Tests des chemins relatifs

## 🔄 Flux de données

```
Source RSS/JSON
     ↓
[Get_data_from_JSONFile_AskSummary.py]
     ↓
Extraction HTML + Résumé IA
     ↓
data/articles/*.json
     ↓
[articles_json_to_markdown.py]
     ↓
rapports/markdown/*.md
```

## 🛠️ Conventions de développement
absolus (Architecture v2.0)
**IMPORTANT :** Depuis la v2.0, les scripts utilisent des chemins absolus détectés automatiquement :
```python
# Détection automatique du répertoire du projet
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_ARTICLES_DIR = os.path.join(PROJECT_ROOT, "data", "articles")
```

**Avantages :**
- ✅ Fonctionne depuis n'importe quel répertoire (racine, scripts/, ou autre)
- ✅ Compatible avec raccourcis macOS
- ✅ Compatible avec cron jobs et automatisation
- ✅ Création automatique des dossiers si absents

**Exemple d'exécution :**
```bash
# Depuis la racine
cd /Users/.../AnalyseActualités
python3 scripts/Get_data_from_JSONFile_AskSummary.py

# Depuis scripts/
cd /Users/.../AnalyseActualités/scripts
python3 Get_data_from_JSONFile_AskSummary.py

# Via raccourci macOS (depuis n'importe où)
/Library/Frameworks/Python.framework/Versions/3.14/bin/python3 scripts/Get_data_from_JSONFile_AskSummary.py
```

### Chemins relatifs (OBSOLÈTE - ne plus utiliser)
~~Tous les scripts utilisent des chemins relatifs depuis le dossier `scripts/` :~~
```python
# ❌ ANCIEN (ne fonctionne que depuis scripts/)
with open('../config/sites_actualite.json', 'r') as f:

# ✅ NOUVEAU (fonctionne partout)
with open(os.path.join(PROJECT_ROOT, 'config', 'sites_actualite.json')
with open('/Users/.../AnalyseActualités/config/sites_actualite.json', 'r') as f:
```

### Nommage des fichiers
- **Articles JSON** : `articles_generated_YYYY-MM-DD_YYYY-MM-DD.json`
- **Rapports** : `rapport_sommaire_<description>.md`
- **Archives** : `<nom_script>_YYYYMMDD_HHMMSS.py`

### Sauvegarde obligatoire
**TOUJOURS** créer une sauvegarde avant de modifier un script :
```bash
cp script.py ../archives/script_$(date +%Y%m%d_%H%M%S).py
```

## 📦 Formats de données

### Format d'entrée (flux JSON)
```json
{
  "items": [
    {
      "url": "https://exemple.com/article",
      "date_published": "2026-01-23T10:00:00Z",
      "authors": [{"name": "Nom Auteur"}]
    }
  ]
}
```

### Format de sortie (articles JSON)
```json
[
  {
    "Date de publication": "2026-01-23T10:00:00Z",
    "Sources": "Nom de la source",
    "URL": "https://...",
    "Résumé": "Résumé généré par l'IA...",
    "Images": ["url1", "url2", "url3"]
  }
]
```

## 🔐 Sécurité

### Fichiers sensibles (`.gitignore`)
- `.env` : Contient les tokens API (ne JAMAIS versionner)
- `data/raw/*.txt` : Peut contenir des données volumineuses
- `.DS_Store` : Fichiers système macOS

### Variables d'environnement requises
```env
URL=https://api.infomaniak.com/euria/v1/chat/completions
bearer=VOTRE_TOKEN_SECRET
REEDER_JSON_URL=https://votre-flux.com/feed.json
```

## 📊 Statistiques du projet

- **Scripts Python** : 3 principaux
- **Sources d'actualités** : 133 flux RSS/JSON
- **Catégories** : 215 catégories prédéfinies
- **Articles archivés** : 2 périodes (déc. 2025 - jan. 2026)
- **Rapports générés** : 3 rapports Markdown + 1 PDF

## 🚀 Améliorations futures

1. **Tests automatisés** : Implémenter des tests dans `/tests/`
2. **CLI unifié** : Créer un script principal avec argparse
3. **Docker** : Conteneuriser l'application pour déploiement
4. **CI/CD** : Automatiser la génération de rapports quotidiens
5. **Base de données** : Migrer de JSON vers SQLite/PostgreSQL
6. **API REST** : Exposer les données via une API

## 📞 Contact

**Auteur** : Patrick Ostertag  
**Email** : patrick.ostertag@gmail.com  
**Site** : http://patrickostertag.ch

---

*Document généré le 23 janvier 2026 - Version 1.0*
