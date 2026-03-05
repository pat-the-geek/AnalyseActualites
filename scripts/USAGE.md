### 6. get-keyword-from-rss.py

**Description** : Extraction quotidienne des articles contenant un mot-clé (défini dans `config/keyword-to-search.json`) depuis tous les flux RSS de WUDD.opml.
Pour chaque mot-clé, génère un fichier JSON dans `data/articles-from-rss/` (sans doublon), avec résumé IA et images principales.

**Filtrage avancé (OR / AND)**

Chaque entrée de `keyword-to-search.json` supporte deux collections optionnelles :

| Champ | Comportement |
|---|---|
| `or` | Si le mot-clé principal est absent du titre, sélectionne l'article si **au moins un** mot de la liste est présent |
| `and` | Après une présélection (mot-clé ou `or`), exige qu'**au moins un** mot de la liste soit présent dans le titre |

Exemples :
```json
{ "keyword": "David Bowie", "or": ["Ziggy Stardust", "Thin White Duke"] }
{ "keyword": "UBS", "and": ["banque", "bank"] }
{ "keyword": "Intelligence artificielle", "or": ["AI", "IA"] }
```

> La correspondance des mots `or`/`and` utilise des frontières de mot (`\b` regex) pour éviter les faux positifs.

**Utilisation** :
```bash
python3 get-keyword-from-rss.py
```

**Automatisation (cron)** :
```
0 1 * * * root cd /app && python3 scripts/get-keyword-from-rss.py 2>&1 | tee -a /app/rapports/cron_get_keyword.log
```

**Sortie** :
- `../data/articles-from-rss/<mot-clé>.json`

### 7. repair_failed_summaries.py

**Description** : Détecte et régénère les résumés d'articles contenant un message d'erreur (ex. `"Désolé, je n'ai pas pu obtenir de réponse…"`). Utile après une indisponibilité temporaire de l'API.

**Arguments** :

| Argument | Description | Défaut |
| --- | --- | --- |
| `--dir PATH` | Répertoire à scanner | `data/articles-from-rss/` |
| `--dry-run` | Simulation sans appel API ni écriture | désactivé |
| `--delay SECS` | Délai entre chaque appel API (secondes) | 1 |

**Utilisation** :

```bash
# Réparer tous les fichiers dans data/articles-from-rss/
python3 scripts/repair_failed_summaries.py

# Cibler un répertoire spécifique
python3 scripts/repair_failed_summaries.py --dir data/articles/Intelligence-artificielle

# Simulation sans appel API
python3 scripts/repair_failed_summaries.py --dry-run
```

**Sortie** : Sauvegarde atomique des fichiers JSON modifiés (écriture via `.tmp` puis remplacement).

---

### 8. generate_48h_report.py

**Description** : Génère chaque soir un rapport de veille analytique basé sur les **Top 10 entités nommées** des 48 dernières heures. Lit `data/articles-from-rss/_WUDD.AI_/48-heures.json` (produit par `get-keyword-from-rss.py`), pré-calcule les entités les plus citées (personnes, organisations, pays, produits, événements), sélectionne les 5 articles les plus récents par entité, et génère un rapport structuré via l'API EurIA.

**Arguments** :

| Argument | Description | Défaut |
|---|---|---|
| `--dry-run` | Affiche le prompt et le Top 10 entités sans appeler l'API | désactivé |

**Utilisation** :

```bash
# Génération réelle du rapport
python3 scripts/generate_48h_report.py

# Simulation — affiche le Top 10 et le prompt (sans appel API)
python3 scripts/generate_48h_report.py --dry-run
```

**Automatisation (cron)** — exécuté chaque jour à 23h00, après la dernière collecte RSS :
```
0 23 * * * root cd /app && python3 scripts/generate_48h_report.py 2>&1 | tee -a /app/rapports/cron_48h_report.log
```

**Sortie** :
- `rapports/markdown/_WUDD.AI_/rapport_48h.md` — fichier unique, écrasé chaque jour

**Structure du rapport généré** :
1. Frontmatter YAML (titre, date, période, nombre d'articles analysés)
2. **10 sections entité** : Contexte · Actualité des 48h (sources citées inline) · Analyse stratégique · Image `![](URL)`
3. **Corrélations inter-entités** : liens significatifs entre les Top 10
4. **Constatations générales** : dynamiques, ruptures, signaux faibles
5. **Tableau de références** : tous les articles cités (date, source, URL)

**Prérequis** : `data/articles-from-rss/_WUDD.AI_/48-heures.json` doit exister (généré par `get-keyword-from-rss.py`). Pour un rapport enrichi, les articles doivent avoir été traités par `enrich_entities.py`.

---

## Générer les résumés d'un flux

```bash
python3 scripts/Get_data_from_JSONFile_AskSummary_v2.py --flux Economie-numerique --date_debut 2026-02-01 --date_fin 2026-02-17
```

## Générer le rapport Markdown d'un flux

```bash
python3 scripts/articles_json_to_markdown.py data/articles/Economie-numerique/articles_generated_2026-02-01_2026-02-17.json
```

## Lancer le scheduler sur tous les flux

```bash
python3 scripts/scheduler_articles.py
```

## Ajouter un nouveau flux

Ajouter une entrée dans `config/flux_json_sources.json` avec le titre et l'URL du flux.
# Guide d'utilisation des scripts

Ce guide explique comment utiliser les différents scripts du projet AnalyseActualités.

## 🚀 Lancement rapide

Tous les scripts doivent être exécutés **depuis le dossier `scripts/`** pour que les chemins relatifs fonctionnent correctement.

```bash
cd scripts/
```

---

## 📝 Scripts disponibles

### 1. Get_data_from_JSONFile_AskSummary.py

**Description** : Script principal qui collecte des articles depuis un flux JSON, génère des résumés via l'API EurIA, et crée un rapport Markdown.

**Utilisation** :
```bash
python3 Get_data_from_JSONFile_AskSummary.py [date_debut] [date_fin]
```

**Exemples** :
```bash
# Avec dates spécifiques
python3 Get_data_from_JSONFile_AskSummary.py 2026-01-01 2026-01-31

# Sans dates (demande interactive)
python3 Get_data_from_JSONFile_AskSummary.py
```

**Prérequis** :
- Fichier `.env` configuré avec `REEDER_JSON_URL`, `URL`, et `bearer`
- Connexion internet active

**Sorties** :
- `../data/articles/articles_generated_<date_debut>_<date_fin>.json`
- `../rapports/markdown/rapport_sommaire_articles_generated_<date_debut>_<date_fin>.md`

---

### 2. Get_htmlText_From_JSONFile.py

**Description** : Extrait le contenu texte brut de tous les articles d'un flux JSON.

**Utilisation** :
```bash
python3 Get_htmlText_From_JSONFile.py
```

**Fonctionnement** :
1. Une fenêtre s'ouvre pour sélectionner un fichier JSON (flux d'articles)
2. Le script récupère le HTML de chaque URL
3. Extrait le texte avec BeautifulSoup
4. Génère un fichier consolidé

**Sortie** :
- `../data/raw/all_articles.txt`

---

### 3. articles_json_to_markdown.py

**Description** : Convertit un fichier JSON d'articles en rapport Markdown formaté.

**Utilisation** :
```bash
python3 articles_json_to_markdown.py
```

**Fonctionnement** :
1. Sélectionnez un fichier JSON d'articles (depuis `../data/articles/`)
2. Choisissez le nom et l'emplacement du fichier Markdown de sortie
3. Le script génère un rapport avec dates, sources, URLs et résumés

**Format d'entrée attendu** :
```json
[
  {
    "Date de publication": "2026-01-23T10:00:00Z",
    "Sources": "Nom de la source",
    "URL": "https://...",
    "Résumé": "Texte du résumé..."
  }
]
```

---

## ⚙️ Configuration requise

### Fichier .env (racine du projet)

```env
# API Infomaniak EurIA
URL=https://api.infomaniak.com/euria/v1/chat/completions
bearer=VOTRE_TOKEN_API_ICI

# URL du flux JSON à traiter
REEDER_JSON_URL=https://votre-flux.com/feed.json

# Paramètres optionnels
max_attempts=5
default_error_message=Aucune information disponible
```

### Dépendances Python

Installez les dépendances depuis la racine du projet :
```bash
cd ..
pip install -r requirements.txt
cd scripts/
```

### 4. enrich_entities.py

**Description** : Enrichit les fichiers JSON d'articles existants avec les **entités nommées (NER)** extraites via l'API EurIA. Parcourt `data/articles/` (flux) et `data/articles-from-rss/` (mots-clés) et ajoute le champ `entities` à chaque article qui dispose d'un `Résumé`.

**Utilisation** :
```bash
# Tout traiter (flux + rss)
python3 scripts/enrich_entities.py

# Un flux spécifique uniquement
python3 scripts/enrich_entities.py --flux Intelligence-artificielle

# Un mot-clé spécifique uniquement
python3 scripts/enrich_entities.py --keyword anthropic

# Simulation (aucun appel API, aucune écriture)
python3 scripts/enrich_entities.py --dry-run

# Réduire la cadence (délai entre appels, défaut 1.0 s)
python3 scripts/enrich_entities.py --delay 2.0

# Ré-enrichir même les articles déjà traités
python3 scripts/enrich_entities.py --force
```

**Arguments** :

| Argument | Description | Défaut |
|---|---|---|
| `--flux NOM` | Restreindre au sous-dossier `data/articles/<NOM>/` | tous les flux |
| `--keyword MOT` | Restreindre au fichier `data/articles-from-rss/<MOT>.json` | tous les mots-clés |
| `--dry-run` | Mode simulation : aucun appel API, aucune sauvegarde | désactivé |
| `--delay SEC` | Pause en secondes entre chaque appel API | 1.0 |
| `--force` | Re-traiter les articles ayant déjà le champ `entities` | désactivé |

**Catégories NER extraites** (18 types) :

| Type | Contenu |
|---|---|
| `PERSON` | Personnes physiques nommées |
| `ORG` | Organisations, entreprises, institutions |
| `GPE` | Pays, villes, régions géopolitiques |
| `LOC` | Lieux géographiques non géopolitiques |
| `PRODUCT` | Produits, services, technologies |
| `EVENT` | Événements nommés (conférences, crises…) |
| `NORP` | Nationalités, groupes politiques/religieux |
| `FAC` | Bâtiments, monuments nommés |
| `WORK_OF_ART` | Titres d'œuvres (livres, films, rapports…) |
| `LAW` | Lois, règlements nommés |
| `DATE` / `TIME` | Dates et heures explicites |
| `MONEY` / `PERCENT` | Montants et pourcentages |
| `QUANTITY` / `CARDINAL` / `ORDINAL` | Mesures et nombres |

**Format ajouté dans chaque article** :
```json
"entities": {
  "PERSON": ["Emmanuel Macron", "Sam Altman"],
  "ORG": ["OpenAI", "Infomaniak"],
  "GPE": ["France", "États-Unis"],
  "PRODUCT": ["ChatGPT", "Qwen3"]
}
```

**Comportement** :
- Sauvegarde atomique (écriture dans `.tmp` puis remplacement) pour éviter la corruption
- Les articles sans champ `Résumé` sont ignorés
- Les articles ayant déjà `entities` sont ignorés (sauf avec `--force`)
- Rapport de stats en fin d'exécution : total / enrichis / déjà présents / erreurs / ignorés

**Prérequis** :
- Fichiers JSON dans `data/articles/` ou `data/articles-from-rss/`
- Fichier `.env` avec `URL` et `bearer` configurés

---

### 5. analyse_thematiques.py

**Description** : Analyse les thématiques sociétales présentes dans tous les articles collectés et génère un rapport statistique détaillé.

**Utilisation** :
```bash
python3 analyse_thematiques.py
```

**Prérequis** :
- Fichiers JSON dans `../data/articles/`
- Fichier `../config/thematiques_societales.json` (créé automatiquement si absent)

**Sorties** :
- Rapport console avec statistiques par thématique
- 12 thématiques analysées : IA & Technologie, Économie, Santé, Politique, etc.
- Pourcentages d'occurrence et exemples d'articles par thème

**Exemple de sortie** :
```
═══════════════════════════════════════════════════════════════════════
                    ANALYSE DES THÉMATIQUES SOCIÉTALES
═══════════════════════════════════════════════════════════════════════

📊 Corpus analysé: 72 articles valides
📅 Période: Décembre 2025 - Janvier 2026

1. INTELLIGENCE ARTIFICIELLE & TECHNOLOGIE (100.0%)
   Mentions: 72
   Exemples d'articles (3):
   [1] Numerama - En 2025, ChatGPT perd du terrain...
```

---

## 📂 Structure des chemins

Les scripts utilisent des chemins relatifs depuis le dossier `scripts/` :

```
scripts/
├── script.py           # Script en cours d'exécution
│
├── ../config/          # Configuration
│   ├── sites_actualite.json
│   ├── categories_actualite.json
│   ├── prompt-rapport.txt
│   └── thematiques_societales.json  # Thématiques + mots-clés
│
├── ../data/            # Données générées
│   ├── articles/       # JSON des articles
│   └── raw/            # Données brutes (txt)
│
└── ../rapports/        # Rapports générés
    ├── markdown/       # Rapports .md
    └── pdf/            # Rapports PDF
```

---

## 🔧 Dépannage

### Erreur : "No module named 'requests'"
```bash
pip install requests beautifulsoup4 python-dotenv
```

### Erreur : "FileNotFoundError: ../data/articles/..."
Assurez-vous d'exécuter les scripts **depuis le dossier scripts/** :
```bash
cd scripts/
python3 nom_du_script.py
```

### Interface graphique ne s'affiche pas
Les scripts utilisent `tkinter` qui nécessite un environnement graphique. Sur serveur headless, adaptez le code pour passer les chemins en arguments.

### Erreur API EurIA
Vérifiez :
- Le token `bearer` dans le fichier `.env`
- La validité de l'URL de l'API
- Votre connexion internet

---

## 📊 Workflow typique

1. **Collecte et analyse** (génère articles JSON + rapport)
   ```bash
   python3 Get_data_from_JSONFile_AskSummary.py 2026-01-01 2026-01-31
   ```

2. **Enrichissement avec entités nommées (NER)** (optionnel)
   ```bash
   python3 scripts/enrich_entities.py
   # Ou pour un flux spécifique :
   python3 scripts/enrich_entities.py --flux Intelligence-artificielle
   ```

3. **Analyse des thématiques sociétales**
   ```bash
   python3 analyse_thematiques.py
   ```

4. **Conversion en Markdown personnalisé** (optionnel)
   ```bash
   python3 articles_json_to_markdown.py
   # Sélectionner : ../data/articles/articles_generated_2026-01-01_2026-01-31.json
   ```

5. **Extraction texte brut** (pour analyse manuelle)
   ```bash
   python3 Get_htmlText_From_JSONFile.py
   # Sélectionner un flux JSON source
   ```

---

## 📧 Support

Pour toute question : patrick.ostertag@gmail.com
