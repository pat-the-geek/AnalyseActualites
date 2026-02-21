# 21/02/2026 - Vérification conformité orchestrations

- Toutes les tâches planifiées (scheduler, extraction par mot-clé, monitoring, test cron) sont orchestrées exclusivement dans Docker (cron du conteneur analyse-actualites).
- Aucune tâche cron n’est programmée sur l’hôte.
### Ajout du script get-keyword-from-rss.py (20/02/2026)

- Nouveau script : `get-keyword-from-rss.py` (extraction quotidienne par mot-clé depuis tous les flux RSS)
- Génère un fichier JSON par mot-clé dans `data/articles-from-rss/`, sans doublon
- Résumé IA et images principales extraites
- Intégration au scheduler via cron (1h00 chaque jour)
- Documentation mise à jour (README.md, USAGE.md, ARCHITECTURE.md)

# Changements apportés - Restructuration du 23 janvier 2026

## 🎯 Objectif
Réorganisation complète du projet AnalyseActualités pour améliorer la maintenabilité, l'évolutivité et la clarté de la structure, avec implémentation de chemins absolus automatiques.

## ✅ Actions réalisées

### Version 2.0 - Chemins absolus (23/01/2026 - après-midi)

#### Problème résolu
Scripts v1.0 (chemins relatifs) causaient des erreurs `FileNotFoundError` quand exécutés depuis un autre répertoire ou via raccourcis macOS.

#### Solution implémentée
Détection automatique du répertoire du projet via `__file__` :
```python
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_ARTICLES_DIR = os.path.join(PROJECT_ROOT, "data", "articles")
# ...
```

#### Fichiers modifiés
- ✅ `scripts/Get_data_from_JSONFile_AskSummary.py` : Chemins absolus + création auto dossiers
- ✅ `.github/copilot-instructions.md` : Mise à jour complète (v2.0)
- ✅ `STRUCTURE.md` : Documentation chemins absolus
- ✅ `README.md` : Clarification utilisation v2.0
- ✅ `ARCHITECTURE.md` : Documentation technique complète (NOUVEAU)

#### Nouveaux fichiers
- ✅ `ARCHITECTURE.md` - Documentation architecturale complète (diagrammes, flux, ADRs)

#### Bénéfices
- ✅ Scripts fonctionnent depuis n'importe quel répertoire
- ✅ Compatible raccourcis macOS
- ✅ Compatible automatisation (cron, GitHub Actions)
- ✅ Création automatique des dossiers manquants

### Version 1.0 - Restructuration initiale (23/01/2026 - matin)

### 1. Création de la structure de dossiers
- ✅ `scripts/` - Scripts Python exécutables
- ✅ `config/` - Fichiers de configuration
- ✅ `data/articles/` - Articles JSON générés
- ✅ `data/raw/` - Données brutes (texte, HTML)
- ✅ `rapports/markdown/` - Rapports Markdown
- ✅ `rapports/pdf/` - Rapports PDF
- ✅ Renommage : `Anciennes versions/` → `archives/`

### 2. Migration des fichiers

#### Scripts (→ `scripts/`)
- `Get_data_from_JSONFile_AskSummary.py`
- `Get_htmlText_From_JSONFile.py`
- `articles_json_to_markdown.py`

#### Configuration (→ `config/`)
- `sites_actualite.json` (133 sources)
- `categories_actualite.json` (215 catégories)
- `prompt-rapport.txt`

#### Données (→ `data/articles/`)
- `articles_generated_2025-12-01_2025-12-28.json`
- `articles_generated_2026-01-01_2026-01-18.json`

#### Rapports (→ `rapports/`)
- `rapport_complet_ia_gouvernement.md` → `rapports/markdown/`
- `rapport_sommaire_articles_generated_2025-12-01_2025-12-28.md` → `rapports/markdown/`
- `rapport_sommaire_articles_generated_2026-01-01_2026-01-18.md` → `rapports/markdown/`
- `rapport_sommaire_articles_generated_2025-12-01_2025-12-28.pdf` → `rapports/pdf/`

### 3. Mise à jour des scripts

#### `Get_htmlText_From_JSONFile.py`
**Avant** :
```python
output_file = 'all_articles.txt'
```
**Après** :
```python
output_file = '../data/raw/all_articles.txt'
```

#### `Get_data_from_JSONFile_AskSummary.py`
**Avant** :
```python
file_output = f"articles_generated_{date_debut}_{date_fin}.json"
report_file = f"rapport_sommaire_{file_output.replace('.json', '.md')}"
```
**Après** :
```python
file_output = f"../data/articles/articles_generated_{date_debut}_{date_fin}.json"
base_filename = os.path.basename(file_output)
report_file = f"../rapports/markdown/rapport_sommaire_{base_filename.replace('.json', '.md')}"
```

### 4. Nouveaux fichiers créés

#### Documentation
- ✅ `README.md` - Documentation principale (5866 octets)
- ✅ `STRUCTURE.md` - Documentation de la structure du projet
- ✅ `scripts/USAGE.md` - Guide d'utilisation des scripts

#### Configuration projet
- ✅ `.gitignore` - Fichiers à ignorer (Python + macOS + projet)
- ✅ `requirements.txt` - Dépendances Python
  ```
  requests>=2.31.0
  beautifulsoup4>=4.12.0
  python-dotenv>=1.0.0
  ```

#### Historique
- ✅ `CHANGELOG.md` - Ce fichier

## 📊 Comparaison avant/après

### Avant (structure plate)
```
AnalyseActualités/
├── Get_data_from_JSONFile_AskSummary.py
├── Get_htmlText_From_JSONFile.py
├── articles_json_to_markdown.py
├── sites_actualite.json
├── categories_actualite.json
├── articles_generated_*.json (×2)
├── rapport_*.md (×3)
├── rapport_*.pdf (×1)
└── Anciennes versions/
```
**Problèmes** :
- Tous les fichiers mélangés à la racine
- Difficile de distinguer scripts, config, données, rapports
- Pas de documentation centralisée

### Après (structure organisée)
```
AnalyseActualités/
├── scripts/          # Scripts exécutables
├── config/           # Configuration
├── data/            # Données (articles, raw)
├── rapports/        # Rapports (md, pdf)
├── archives/        # Anciennes versions
├── tests/           # Tests (vide)
├── .github/         # Config GitHub
├── README.md        # Documentation
├── STRUCTURE.md     # Structure détaillée
├── CHANGELOG.md     # Historique
├── .gitignore       # Exclusions Git
└── requirements.txt # Dépendances
```
**Avantages** :
- ✅ Séparation claire des responsabilités
- ✅ Chemins prévisibles et standardisés
- ✅ Documentation complète
- ✅ Facile à versionner avec Git
- ✅ Prêt pour collaboration

## 🔧 Compatibilité et rétrocompatibilité

### ⚠️ Breaking changes
Les scripts doivent maintenant être exécutés depuis le dossier `scripts/` :
```bash
# ❌ Ancien (ne fonctionne plus)
python3 Get_data_from_JSONFile_AskSummary.py

# ✅ Nouveau
cd scripts/
python3 Get_data_from_JSONFile_AskSummary.py
```

### 🔄 Migration pour les utilisateurs

Si vous avez des scripts personnalisés qui référencent les anciens chemins :

1. **Mettre à jour les chemins absolus** :
   ```python
   # Avant
   with open('sites_actualite.json', 'r') as f:
   
   # Après
   with open('../config/sites_actualite.json', 'r') as f:
   ```

2. **Mettre à jour les commandes** :
   ```bash
   # Ajouter 'cd scripts/' avant l'exécution
   cd scripts/
   python3 votre_script.py
   ```

## 📈 Bénéfices mesurables

1. **Organisation** : 100% des fichiers dans des dossiers logiques
2. **Documentation** : 3 nouveaux fichiers de documentation
3. **Maintenabilité** : Chemins relatifs cohérents
4. **Versioning** : `.gitignore` complet pour Git
5. **Onboarding** : Guide d'utilisation pour nouveaux contributeurs

## 🚀 Prochaines étapes recommandées

1. **Tests** : Créer des tests unitaires dans `/tests/`
2. **CI/CD** : Configurer GitHub Actions pour tests automatiques
3. **Docker** : Créer un Dockerfile pour faciliter le déploiement
4. **Documentation API** : Documenter les fonctions avec Sphinx
5. **Versioning** : Initialiser un dépôt Git si pas déjà fait

## 🐛 Problèmes connus

Aucun problème connu après la restructuration. Les dépendances sont installées et les imports fonctionnent correctement.

## 📝 Checklist de vérification

- ✅ Tous les dossiers créés
- ✅ Tous les fichiers déplacés
- ✅ Scripts mis à jour avec nouveaux chemins
- ✅ Documentation créée (README, STRUCTURE, USAGE)
- ✅ .gitignore créé
- ✅ requirements.txt créé
- ✅ Dépendances Python vérifiées
- ✅ Imports des scripts testés

## 🔒 Sauvegardes

Tous les fichiers originaux ont été préservés dans le dossier `archives/` avant toute modification.

## 📧 Support

Pour toute question sur cette restructuration :
- **Auteur** : Patrick Ostertag
- **Email** : patrick.ostertag@gmail.com
- **Date** : 23 janvier 2026

---

*Restructuration effectuée avec succès - Projet AnalyseActualités v2.0*
