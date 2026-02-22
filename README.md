# WUDD.ai

<p align="left">
  <a href="https://github.com/pat-the-geek/WUDD.ai/actions">
    <img alt="Build" src="https://img.shields.io/github/actions/workflow/status/pat-the-geek/WUDD.ai/ci.yml?branch=main&label=build&logo=github" />
  </a>
  <a href="https://github.com/pat-the-geek/WUDD.ai/blob/main/LICENSE">
    <img alt="Licence" src="https://img.shields.io/github/license/pat-the-geek/WUDD.ai?color=blue" />
  </a>
  <a href="https://www.python.org/downloads/release/python-3100/">
    <img alt="Python" src="https://img.shields.io/badge/python-3.10%2B-blue.svg?logo=python&logoColor=white" />
  </a>
  <a href="https://github.com/pat-the-geek/WUDD.ai/commits/main">
    <img alt="Dernier commit" src="https://img.shields.io/github/last-commit/pat-the-geek/WUDD.ai?logo=github" />
  </a>
  <a href="https://github.com/pat-the-geek/WUDD.ai/issues">
    <img alt="Issues" src="https://img.shields.io/github/issues/pat-the-geek/WUDD.ai?color=orange" />
  </a>
</p>

> **What's up, Doc?** — Plateforme de veille intelligente inspirée de Bugs Bunny : collecte, analyse et synthèse d'actualités via l'API EurIA (Infomaniak / Qwen3), à partir de flux RSS/JSON gérés par Reeder.

---

## Table des matières

1. [Présentation](#1-présentation)
2. [Architecture](#2-architecture)
3. [Installation](#3-installation)
4. [Utilisation](#4-utilisation)
5. [Configuration des flux](#5-configuration-des-flux)
6. [Fonctionnement technique](#6-fonctionnement-technique)
7. [Orchestration Docker](#7-orchestration-docker)
8. [Développement et extension](#8-développement-et-extension)
9. [Limitations](#9-limitations)
10. [FAQ / Dépannage](#10-faq--dépannage)
11. [Contribuer](#11-contribuer)
12. [Contact et licence](#12-contact-et-licence)

---

## 1. Présentation

WUDD.ai est une plateforme de veille intelligente qui agrège et analyse automatiquement des flux d'actualités. À partir de sources RSS/JSON gérées via Reeder, le pipeline collecte les articles, extrait leur contenu HTML brut, puis soumet chaque texte à l'API EurIA d'Infomaniak (modèle Qwen3) pour en produire un résumé synthétique en français, limité à vingt lignes. Les résultats sont consolidés dans des fichiers JSON structurés, organisés par flux et par période, avec extraction automatique des trois images les plus représentatives de l'article (largeur supérieure à 500 px, triées par surface).

Au-delà de la collecte unitaire, WUDD.ai intègre un moteur d'analyse thématique qui classifie les articles selon douze thématiques sociétales prédéfinies (IA, géopolitique, économie, santé, etc.) et produit des statistiques de couverture. Un module d'extraction par mot-clé permet également de surveiller des sujets spécifiques en interrogeant les flux RSS quotidiennement : chaque mot-clé configuré génère son propre rapport JSON enrichi d'un résumé IA. L'ensemble des sorties — JSON, Markdown et PDF — est structuré par flux dans des répertoires dédiés, facilitant l'archivage et la consultation.

L'automatisation complète est assurée par un orchestrateur Docker utilisant des tâches cron internes au conteneur : collecte hebdomadaire des articles, extraction quotidienne par mot-clé, et surveillance régulière de la santé du service. Aucune dépendance n'est requise côté hôte. La configuration des flux, catégories et prompts repose sur des fichiers JSON éditables dans `config/`, et l'ajout d'une nouvelle source de veille ne nécessite qu'une ligne de configuration supplémentaire.

Un exemple de rapport est disponible dans : [`samples/rapport_sommaire_articles_generated_2026-02-01_2026-02-28.md`](samples/rapport_sommaire_articles_generated_2026-02-01_2026-02-28.md)

```mermaid
mindmap
  root((WUDD.ai))
    Collecte multi-flux
      Sources RSS / JSON
      Gestion via Reeder
      Multi-flux cloisonnés
    Résumé IA
      API EurIA · Qwen3
      20 lignes · français
      3 images par article
    Analyse thématique
      12 thématiques sociétales
      Statistiques de couverture
      Classement automatique
    Mots-clés & alertes
      Surveillance quotidienne
      Rapport JSON + résumé IA
      Configurable dans config/
    Automatisation Docker
      Cron intégré au conteneur
      Sorties JSON · Markdown · PDF
      Zéro dépendance côté hôte
```

---

## 2. Architecture

> 📐 Documentation technique complète : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — diagrammes Mermaid, flux de données, modèle de données, ADRs, roadmap.

### Pipeline de traitement

```
Reeder (RSS/JSON) → Extraction HTML → Résumé EurIA/Qwen3 → JSON → Markdown/PDF
```

### Arborescence du projet

```
WUDD.ai/
├── scripts/           # Scripts Python exécutables
│   ├── Get_data_from_JSONFile_AskSummary_v2.py  # Collecte + résumés IA
│   ├── Get_htmlText_From_JSONFile.py             # Extraction texte HTML
│   ├── articles_json_to_markdown.py              # Conversion JSON → Markdown
│   ├── analyse_thematiques.py                    # Analyse sociétale
│   ├── scheduler_articles.py                     # Scheduler multi-flux
│   ├── get-keyword-from-rss.py                   # Extraction par mot-clé
│   └── check_cron_health.py                      # Monitoring cron
├── config/            # Sources, catégories, prompts, thématiques
├── data/              # Articles JSON générés (par flux)
│   ├── articles/<flux>/
│   ├── articles/cache/<flux>/
│   └── raw/
├── rapports/          # Rapports générés
│   ├── markdown/<flux>/
│   └── pdf/
├── archives/          # Sauvegardes versionnées de scripts
├── samples/           # Exemples de rapports produits
├── tests/             # Tests unitaires
├── .github/           # Config GitHub Actions / Copilot
├── .env               # Variables d'environnement (non versionné)
└── README.md
```

### Fichiers de configuration clés

| Fichier | Rôle |
|---|---|
| `config/flux_json_sources.json` | Liste des flux RSS/JSON et paramètres cron |
| `config/sites_actualite.json` | Sources RSS disponibles |
| `config/categories_actualite.json` | Catégories d'articles |
| `config/keyword-to-search.json` | Mots-clés pour extraction quotidienne (avec filtres OR/AND optionnels) |
| `config/thematiques_societales.json` | 12 thématiques sociétales |
| `config/prompt-rapport.txt` | Template de prompt pour rapports |

---

## 3. Installation

### Prérequis

- Python 3.10+
- Compte Infomaniak avec accès à l'API EurIA
- Docker (pour l'orchestration automatisée)

### Dépendances

```bash
pip install -r requirements.txt
```

### Configuration

Créez un fichier `.env` à la racine :

```env
URL=https://api.infomaniak.com/euria/v1/chat/completions
bearer=VOTRE_TOKEN_API_INFOMANIAK
```

---

## 4. Utilisation

### Générer des résumés pour un flux

```bash
python3 scripts/Get_data_from_JSONFile_AskSummary_v2.py \
  --flux "Intelligence-artificielle" \
  --date_debut 2026-02-01 \
  --date_fin 2026-02-17
```

Sortie :
- `data/articles/Intelligence-artificielle/articles_generated_2026-02-01_2026-02-17.json`
- `rapports/markdown/Intelligence-artificielle/rapport_sommaire_*.md`

### Convertir un fichier JSON en rapport Markdown

```bash
python3 scripts/articles_json_to_markdown.py \
  data/articles/Intelligence-artificielle/articles_generated_2026-02-01_2026-02-17.json
```

### Lancer le scheduler multi-flux

```bash
python3 scripts/scheduler_articles.py
```

Traite automatiquement tous les flux définis dans `config/flux_json_sources.json`.

### Extraction par mot-clé (manuelle)

```bash
python3 scripts/get-keyword-from-rss.py
```

Génère un fichier JSON dans `data/articles-from-rss/` pour chaque mot-clé configuré, avec résumé IA et images principales.

#### Filtrage avancé OR / AND dans `config/keyword-to-search.json`

Chaque entrée du fichier accepte deux collections optionnelles pour affiner la sélection des articles :

- **`or`** : si le mot-clé principal n'est pas trouvé dans le titre, l'article est quand même sélectionné si **au moins un** des mots de la liste est présent.
- **`and`** : si l'article est présélectionné (via le mot-clé ou via `or`), il n'est retenu que si **au moins un** des mots de cette liste est également présent dans le titre.

```json
[
  { "keyword": "Trump" },
  { "keyword": "David Bowie", "or": ["Ziggy Stardust", "Thin White Duke"] },
  { "keyword": "UBS", "and": ["banque", "bank"] },
  { "keyword": "Intelligence artificielle", "or": ["AI", "IA"] }
]
```

> Les mots des collections `or` et `and` utilisent une correspondance par **frontière de mot** (`\b` regex) pour éviter les faux positifs (ex. `AI` ne matche pas `semaine`).

### Analyse manuelle avec Claude

Il est possible d'utiliser un fichier JSON généré par WUDD.ai directement dans Claude (ou tout autre LLM) pour produire un rapport, indépendamment de l'automatisation. Les instructions détaillées pour cette utilisation (format du rapport, modèle Markdown, regroupement thématique) sont disponibles dans :

→ [`docs/instructions-for-claude-report.md`](docs/instructions-for-claude-report.md)

### Exemples de présentations générées par Claude

Le prompt utilisé pour générer ces présentations est disponible dans : [docs/prompt-for-claude-presentation.md](docs/prompt-for-claude-presentation.md)

Exemples de présentations générées par Claude à partir des données collectées :
- [Présentation Markdown](samples/claude-generated-presentation.md)
- [Présentation PDF](samples/claude-generated-presentation.pdf)

## 5. Configuration des flux

### Format `config/flux_json_sources.json`

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

Chaque objet définit un flux indépendant. Le scheduler et tous les scripts multi-flux utilisent ce fichier comme source de vérité unique. Pour ajouter un flux, il suffit d'ajouter un objet au tableau.

---

## 6. Fonctionnement technique

### Appel API EurIA

```python
response = requests.post(
    URL,
    json={
        "messages": [{"content": prompt, "role": "user"}],
        "model": "qwen3",
        "enable_web_search": True
    },
    headers={"Authorization": f"Bearer {BEARER}"},
    timeout=60
)
content = response.json()["choices"][0]["message"]["content"]
```

L'API intègre un mécanisme de retry avec backoff exponentiel.

### Prompts

**Résumé d'article :**
```
Faire un résumé de ce texte sur maximum 20 lignes en français,
ne donne que le résumé, sans commentaire ni remarque : {texte}
```

**Rapport thématique :**
```
Analyse ce fichier JSON et fait une synthèse des actualités.
Affiche la date de publication et les sources lorsque tu cites un article.
Groupe les articles par catégories que tu auras identifiées.
En fin de synthèse fait un tableau avec les références.
Inclus des images pertinentes (<img src='URL' />).
```

### Formats de données

**Format d'entrée attendu (flux JSON) :**
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

**Format de sortie (articles résumés) :**
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

### Chemins absolus (v2.0+)

Depuis la v2.0, tous les scripts utilisent des chemins absolus et fonctionnent depuis n'importe quel répertoire :

```python
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_ARTICLES_DIR = os.path.join(PROJECT_ROOT, "data", "articles")
```

### Bonnes pratiques de développement

- Langue française obligatoire pour les clés JSON et messages
- Format de date ISO 8601 strict : `YYYY-MM-DDTHH:MM:SSZ`
- Utiliser `print_console()` pour les logs horodatés
- **Toujours sauvegarder avant de modifier un script :**
  ```bash
  cp "script.py" "archives/script_$(date +%Y%m%d_%H%M%S).py"
  ```

---

## 7. Orchestration Docker

### Principe

**Toute l'automatisation est contenue dans le conteneur Docker.** Aucune tâche cron n'est programmée sur l'hôte, garantissant isolation et portabilité.

> _Vérifié le 21/02/2026 : conformité confirmée._

### Déploiement

```bash
docker-compose up --build -d
```

Seul le conteneur `analyse-actualites` (défini dans `docker-compose.yml`) doit être actif. Pour supprimer un ancien conteneur résiduel :

```bash
docker rm -f wudd-ai-final   # ou wuddai, etc.
```

### Tâches cron actives dans le conteneur

| Planification | Tâche |
|---|---|
| `0 1 * * *` | Extraction par mot-clé (`get-keyword-from-rss.py`) |
| `0 6 * * 1` | Scheduler articles chaque lundi (`scheduler_articles.py`) |
| `*/10 * * * *` | Vérification santé du cron (`check_cron_health.py`) |
| `* * * * *` | Test cron (écriture dans `cron_test.log`) |

Tous les logs sont disponibles dans `rapports/`.

---

## 8. Développement et extension

### Ajouter une source RSS

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

### Lancer les tests

```bash
pytest tests/
```

---

## 9. Limitations

- Certains scripts écrivent dans des fichiers prédéfinis — à adapter selon les besoins
- Langue française requise pour les clés et messages (non configurable)
- `README.md` et fichiers critiques doivent rester à la racine du projet

---

## 10. FAQ / Dépannage

**Q : Le README n'est pas à jour sur GitHub ?**  
Vérifiez que vous êtes sur la branche `main` et que le push a été effectué. Actualisez ou videz le cache du navigateur.

**Q : Erreur de parsing de date ?**  
Les dates doivent être au format ISO 8601 strict : `YYYY-MM-DDTHH:MM:SSZ`.

**Q : Les scripts ne trouvent pas les fichiers de données ?**  
Depuis la v2.0, tous les chemins sont absolus. Les scripts fonctionnent depuis n'importe quel répertoire.

**Q : Comment ajouter un flux ou une catégorie ?**  
Modifiez les fichiers dans `config/` (voir [Section 5](#5-configuration-des-flux) et [Section 8](#8-développement-et-extension)).

**Q : Comment sauvegarder avant une modification ?**  
Copiez le script dans `archives/` avec timestamp (voir [Section 6](#6-fonctionnement-technique)).

---

## 11. Contribuer

Les contributions sont les bienvenues !

1. Forkez le dépôt
2. Créez une branche : `git checkout -b feature/ma-nouvelle-fonction`
3. Commitez : `git commit -am 'Ajout nouvelle fonction'`
4. Poussez : `git push origin feature/ma-nouvelle-fonction`
5. Ouvrez une Pull Request

Merci de respecter : la structure du projet, la langue française pour les clés/messages, et la politique de sauvegarde avant modification.

---

## 12. Contact et licence

- **Auteur** : Patrick Ostertag
- **Email** : patrick.ostertag@gmail.com
- **Site** : [patrickostertag.ch](http://patrickostertag.ch)
- **Moteur IA** : EurIA (Infomaniak) — Modèle : Qwen3 — [euria.infomaniak.com](https://euria.infomaniak.com)
- **Licence** : Projet personnel

---

*Documentation prompts : [docs/PROMPTS.md](docs/PROMPTS.md)*