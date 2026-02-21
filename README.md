# WUDD.ai

Plateforme de génération de résumés d'actualités avec l'API EurIA (Infomaniak) et le modèle Qwen3. Collecte, analyse et synthèse d'articles depuis des flux RSS/JSON gérés par Reeder, avec export en JSON et Markdown.

---


## Orchestration et planification (Docker)

**Toutes les tâches planifiées (scheduler, extraction par mot-clé, monitoring, test cron) sont orchestrées exclusivement à l’intérieur du conteneur Docker via cron.**

**Aucune tâche n’est programmée sur l’hôte.**

### Tâches cron actives dans Docker

- **Extraction quotidienne par mot-clé** :
  - `0 1 * * * root cd /app && python3 scripts/get-keyword-from-rss.py 2>&1 | tee -a /app/rapports/cron_get_keyword.log`
- **Vérification santé du cron toutes les 10 minutes** :
  - `*/10 * * * * root cd /app && python3 scripts/check_cron_health.py 2>&1 | tee -a /app/rapports/cron_health.log`
- **Scheduler d’articles chaque lundi à 6h** :
  - `0 6 * * 1 root cd /app && python3 scripts/scheduler_articles.py 2>&1 | tee -a /app/rapports/cron_scheduler.log`
- **Tâche de test chaque minute** :
  - `* * * * * root touch /app/cron_test.log && echo "cron ok $(date)" | tee -a /app/cron_test.log`

**Note conformité :**
> _Vérifié le 21/02/2026 : aucune tâche cron n’est programmée sur l’hôte, toute l’automatisation est contenue dans Docker pour garantir l’isolation et la portabilité._

## 1. Présentation générale

WUDD.ai fait référence à la réplique « What's up, Doc? » de Bugs Bunny, symbole de curiosité et de veille, associée ici à l’IA. Le nom évoque une plateforme qui interroge l’actualité, synthétise et surveille l’information grâce à l’intelligence artificielle.

Il collecte, structure, résume et analyse des articles issus de Reeder, avec orchestration multi-flux et génération de rapports thématiques.

---

## 2. Architecture et organisation

- **Collecte** : flux RSS/JSON (Reeder, autres)
- **Extraction** : texte, images, métadonnées
- **Résumé IA** : API EurIA (Infomaniak/Qwen3)
- **Rapports** : Markdown, PDF, analyse thématique
- **Automatisation** : scheduler multi-flux, cron, Docker
- **Surveillance** : logs, monitoring, tests

### Arborescence du projet
```
AnalyseActualités/
├── scripts/           # Scripts Python exécutables
├── config/            # Configuration (sources, catégories, prompts)
├── data/              # Données générées (par flux)
├── rapports/          # Rapports générés (Markdown, PDF)
├── archives/          # Anciennes versions de scripts
├── tests/             # Tests unitaires
├── .github/           # Config Copilot/CI
├── .env               # Variables d’environnement
└── README.md          # Ce fichier
```

---

## 3. Fonctionnalités principales

- Veille intelligente multi-flux
- Extraction et structuration automatisée
- Résumés IA (français, Qwen3)
- Rapports thématiques et analyse sociétale
- Orchestration par scheduler multi-flux
- Export JSON, Markdown, PDF
- Interface CLI
- Cloisonnement des outputs par flux

---

## 4. Installation et configuration

### Prérequis
- Python 3.10+
- Compte Infomaniak avec accès à l’API EurIA
- .env à la racine (voir ci-dessous)

### Installation
```bash
pip install -r requirements.txt
```

### Configuration
Créez un fichier `.env` à la racine :
```env
URL=https://api.infomaniak.com/euria/v1/chat/completions
bearer=VOTRE_TOKEN_API_INFOMANIAK
```

---

## 5. Utilisation rapide (exemples)

### Générer un rapport annuel pour un flux (exemple : Intelligence-artificielle, année 2026)
```bash
python3 scripts/Get_data_from_JSONFile_AskSummary_v2.py --flux "Intelligence-artificielle" --date_debut 2026-01-01 --date_fin 2026-12-31
```

### Générer un rapport Markdown
```bash
python3 scripts/articles_json_to_markdown.py data/articles/Intelligence-artificielle/articles_generated_2026-02-01_2026-02-17.json
```

### Scheduler multi-flux (tous les flux)
```bash
python3 scripts/scheduler_articles.py
```

---

## 6. Structure des outputs et configuration des flux

- Outputs : `data/articles/<flux>/`, `rapports/markdown/<flux>/`, `data/articles/cache/<flux>/`
- Exemples de rapports : `samples/`

### Configuration des flux : `config/flux_json_sources.json`

Ce fichier centralise la liste des flux JSON à traiter. Chaque entrée définit :
- `title` : nom du flux (utilisé pour le cloisonnement des outputs)
- `url` : URL du flux JSON à collecter
- `scheduler` : paramètres de planification (cron, timeout)


Exemple :
```json
[
  {
    "title": "Intelligence artificielle",
    "url": "https://reederapp.net/flux1.json",
    "scheduler": {
      "cron": "0 6 * * *",
      "timeout": 60
    }
  },
  {
    "title": "Suisse",
    "url": "https://reederapp.net/flux2.json",
    "scheduler": {
      "cron": "0 6 * * *",
      "timeout": 60
    }
  }
]
```

Pour ajouter un flux, il suffit d’ajouter un objet à ce tableau. Le scheduler et tous les scripts multi-flux utiliseront automatiquement cette configuration pour traiter chaque flux de façon indépendante.

---

## 7. Fonctionnement technique détaillé

### Appel API EurIA
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

### Prompts utilisés
**Résumé d’article** :
```
faire un résumé de ce texte sur maximum 20 lignes en français, 
ne donne que le résumé, sans commentaire ni remarque : {texte}
```
**Rapport thématique** :
```
Analyse le fichier ce fichier JSON et fait une synthèse des actualités. 
Affiche la date de publication et les sources lorsque tu cites un article. 
Groupe les acticles par catégories que tu auras identifiées. 
En fin de synthèse fait un tableau avec les références.
Inclus des images pertinentes (<img src='URL' />).
```

### Bonnes pratiques
- Prompts et clés en français
- Format de date ISO 8601 strict (`%Y-%m-%dT%H:%M:%SZ`)
- Utiliser `print_console()` pour les logs

### Extraction quotidienne par mot-clé (nouveau)

Le script `get-keyword-from-rss.py` collecte chaque jour à 1h00 (via cron) les articles dont le titre contient un mot-clé défini dans `config/keyword-to-search.json`.
Pour chaque mot-clé, il génère un fichier JSON dans `data/articles-from-rss/` (sans doublon), avec résumé IA et images principales.

Exécution manuelle :
```bash
python3 scripts/get-keyword-from-rss.py
```
Exécution automatique (cron) :
```
0 1 * * * root cd /app && python3 scripts/get-keyword-from-rss.py 2>&1 | tee -a /app/rapports/cron_get_keyword.log
```

---

## 8. Développement et extension

### Ajouter une source ou catégorie
- Modifiez `config/sites_actualite.json` ou `config/categories_actualite.json`

### Sauvegarde automatique des scripts
Avant toute modification :
```bash
cp "script.py" "archives/script_$(date +%Y%m%d_%H%M%S).py"
```

### Tests
```bash
pytest tests/
```

---

## 9. Limitations et points d’attention

- Certains scripts écrivent dans des fichiers prédéfinis (adapter si besoin)
- Langue française obligatoire pour les clés et messages
- README.md et fichiers critiques doivent rester à la racine

---

## 10. Contact et licence

- Auteur : Patrick Ostertag
- Email : patrick.ostertag@gmail.com
- Site : http://patrickostertag.ch
- Licence : Projet personnel

---

## 11. Références IA

- Moteur : EurIA (Infomaniak)
- Modèle : Qwen3
- URL : https://euria.infomaniak.com
- Documentation prompts : [docs/PROMPTS.md](docs/PROMPTS.md)

Pipeline de collecte et d'analyse d'actualités utilisant des flux RSS/JSON et l'API EurIA d'Infomaniak (modèle Qwen3) pour générer des résumés automatiques d'articles.

## 📋 Description

Ce projet collecte automatiquement des articles depuis des flux RSS/JSON, extrait leur contenu HTML, et génère des résumés intelligents via l'API EurIA. Les résultats sont exportés en JSON et peuvent être convertis en rapports Markdown.

## 🚀 Fonctionnalités

- **Collecte de flux RSS/JSON** : Récupération automatique d'articles depuis des sources configurables
- **Extraction de contenu** : Analyse HTML et extraction du texte principal des articles
- **Génération de résumés IA** : Utilisation de l'API EurIA (Qwen3) pour créer des résumés pertinents
- **Export multi-formats** : JSON structuré et rapports Markdown

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

# Exemples d'usage multi-flux (février 2026)

## Génération de résumés pour un flux spécifique

```bash
python3 scripts/Get_data_from_JSONFile_AskSummary_v2.py --flux Intelligence-artificielle --date_debut 2026-02-01 --date_fin 2026-02-17
```

## Génération de rapports Markdown pour un flux

```bash
python3 scripts/articles_json_to_markdown.py data/articles/Intelligence-artificielle/articles_generated_2026-02-01_2026-02-17.json
```

## Scheduler multi-flux (tous les flux configurés)

```bash
python3 scripts/scheduler_articles.py
```

## Structure des outputs

- Les fichiers sont générés dans :
  - `data/articles/<nom-flux>/`
  - `rapports/markdown/<nom-flux>/`
  - `data/articles/cache/<nom-flux>/`

## Configuration des flux

Voir et éditer : `config/flux_json_sources.json`

## 📦 Exemples de sortie

Des exemples de rapports générés sont disponibles dans le dossier `samples/`.

- Exemple de rapport Markdown : [samples/rapport_sommaire_articles_generated_2026-02-01_2026-02-28.md](samples/rapport_sommaire_articles_generated_2026-02-01_2026-02-28.md)

Vous pouvez consulter ce fichier pour visualiser le format et la structure d'un rapport produit automatiquement par l'application.

## 🔧 Installation

### Prérequis

- Python 3.10+
- Compte Infomaniak avec accès à l'API EurIA

### Installation des dépendances

```bash
pip install -r requirements.txt
```

### Configuration

Créez un fichier `.env` à la racine avec :

```env
URL=https://api.infomaniak.com/euria/v1/chat/completions
bearer=VOTRE_TOKEN_API_INFOMANIAK
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

# 🐳 Maintenance Docker et déploiement

## Nettoyage des anciens conteneurs

Après plusieurs déploiements, il peut rester d'anciens conteneurs Docker inutilisés (ex : `wudd-ai-final`, `wuddai`).

**Seul le conteneur `analyse-actualites` doit être actif pour ce projet.**

Pour supprimer un ancien conteneur :

```bash
docker rm -f wudd-ai-final
```

Le déploiement officiel s'effectue toujours via :

```bash
docker-compose up --build -d
```

Ce qui (re)lance uniquement le conteneur `analyse-actualites` défini dans `docker-compose.yml`.


## ⚠️ Limitations

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
- **Documentation prompts** : [docs/PROMPTS.md](docs/PROMPTS.md)

---