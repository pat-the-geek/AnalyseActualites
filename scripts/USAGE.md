# Usage multi-flux (février 2026)

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

### 4. analyse_thematiques.py

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

2. **Analyse des thématiques sociétales**
   ```bash
   python3 analyse_thematiques.py
   ```

3. **Conversion en Markdown personnalisé** (optionnel)
   ```bash
   python3 articles_json_to_markdown.py
   # Sélectionner : ../data/articles/articles_generated_2026-01-01_2026-01-31.json
   ```

4. **Extraction texte brut** (pour analyse manuelle)
   ```bash
   python3 Get_htmlText_From_JSONFile.py
   # Sélectionner un flux JSON source
   ```

---

## 📧 Support

Pour toute question : patrick.ostertag@gmail.com
