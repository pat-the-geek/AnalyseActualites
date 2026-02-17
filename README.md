

```
WUDD.ai/
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
├── samples/                              # Exemples de rapports générés (voir ci-dessous)
│
├── archives/                             # Anciennes versions de scripts
├── tests/                                # Tests unitaires
├── .github/                              # Configuration GitHub/Copilot
├── .env                                  # Variables d'environnement (non versionné)
└── README.md                             # Ce fichier
```

### Dossier `samples/` — Exemples de rapports générés

Le dossier `samples/` contient des exemples de rapports générés par le pipeline (par exemple : `articles_generated_2026-02-01_2026-02-28.json`). Ces fichiers servent de référence pour la structure de sortie attendue et sont utilisés pour illustrer le fonctionnement du projet. Certains de ces exemples sont également publiés sur GitHub pour faciliter la démonstration et la validation du pipeline.
### Exemple de crontab (à inclure dans l'image Docker)

```cron
0 6 * * 1 cd /app && python3 scripts/scheduler_articles.py >> /app/rapports/cron_scheduler.log 2>&1
```

### Intégration Docker

Dans le `Dockerfile`, ajouter :

```dockerfile
COPY scripts/scheduler_articles.py scripts/
COPY crontab /etc/cron.d/scheduler_cron
RUN chmod 0644 /etc/cron.d/scheduler_cron \
  && crontab /etc/cron.d/scheduler_cron
CMD ["cron", "-f"]
```

Le scheduler sera ainsi exécuté automatiquement dans l'environnement Docker, sans intervention manuelle.

---
# Scheduler intelligent d'articles

Un script `scheduler_articles.py` permet de planifier automatiquement l'exécution de la génération de résumés d'actualités :

- **Exécution mensuelle obligatoire** : du 1er au dernier jour du mois (détection automatique du dernier jour)
- **Révision hebdomadaire** : chaque semaine, le scheduler compte le nombre de nouveaux articles. Si >10 nouveaux articles, il lance une édition intermédiaire (semaine en cours)
- **Planification intelligente** : le scheduler interroge l'IA EurIA pour recommander une fréquence optimale selon le volume d'actualités
- **Historique** : la fréquence d'exécution est ajustée selon l'historique et les recommandations IA

### Utilisation

```bash
python scripts/scheduler_articles.py
```

Le script utilise la configuration centrale (`config/`), le cache, et le client API EurIA. Il logge toutes les actions dans la console.

**Remarque :** Le scheduler ne modifie pas la logique métier de génération des résumés, il orchestre simplement les appels au script principal.

---
# 📡 Utilisation de l'IA EurIA (Infomaniak)

Le projet utilise l'API EurIA d'Infomaniak (modèle Qwen3) pour générer automatiquement des résumés d'articles et des rapports thématiques à partir des flux d'actualités. L'intégration se fait principalement dans le script `Get_data_from_JSONFile_AskSummary.py`.

## 🔑 Configuration requise

1. **Variables d'environnement** (dans `.env` à la racine) :
   - `URL` : URL de l'API EurIA (ex : https://api.infomaniak.com/euria/v1/chat/completions)
   - `bearer` : Token API Infomaniak (à obtenir sur le portail Infomaniak)
   - `REEDER_JSON_URL` : URL du flux JSON à analyser

2. **Dépendances** :
   - `requests`, `python-dotenv` (voir `requirements.txt`)

## ⚙️ Fonctionnement de l'appel API

L'appel à l'API se fait via une requête POST :

```python
response = requests.post(
  URL,
  json={
    "messages": [{"content": prompt, "role": "user"}],
    "model": "qwen3",
    "enable_web_search": True
  },
  headers={'Authorization': f'Bearer {BEARER}'},
  timeout=60
)
content = response.json()['choices'][0]['message']['content']
```

## 📝 Prompts utilisés

### 1. Résumé d'article
Utilisé pour générer un résumé concis (max 20 lignes) en français à partir du texte brut d'un article.

**Prompt :**
```
faire un résumé de ce texte sur maximum 20 lignes en français, 
ne donne que le résumé, sans commentaire ni remarque : {texte}
```

**Timeout** : 60s (3 tentatives en cas d'échec)

### 2. Génération de rapport thématique
Utilisé pour synthétiser un ensemble d'articles en un rapport structuré, avec regroupement par catégories, tableau de références et inclusion d'images.

**Prompt :**
```
Analyse le fichier ce fichier JSON et fait une synthèse des actualités. 
Affiche la date de publication et les sources lorsque tu cites un article. 
Groupe les acticles par catégories que tu auras identifiées. 
En fin de synthèse fait un tableau avec les références.
Inclus des images pertinentes (<img src='URL' />).
```

**Timeout** : 300s (3 tentatives en cas d'échec)

## 🔄 Gestion des erreurs et retries

- **3 tentatives** automatiques en cas d'échec ou de timeout
- **Timeouts** : 60s pour les résumés, 300s pour les rapports
- **Fallback** : message d'erreur standardisé si l'API échoue après 3 essais

## 📋 Bonnes pratiques

- Toujours utiliser les prompts en français
- Ne jamais modifier les clés de sortie (`Résumé`, `Date de publication`, etc.) sans mise à jour globale
- Respecter le format de date ISO 8601 strict (`%Y-%m-%dT%H:%M:%SZ`)
- Utiliser la fonction `print_console()` pour les logs

Pour plus de détails, voir la documentation dans `docs/` et les instructions dans `.github/copilot-instructions.md`.
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
