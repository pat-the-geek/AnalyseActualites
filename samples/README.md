# Documentation du dossier `samples/`

Le dossier `samples/` contient des exemples de fichiers générés par le pipeline WUDD.ai pour la période **février 2026**. Ces fichiers servent de référence pour la structure de sortie attendue et illustrent le fonctionnement complet du projet.

## Fichiers présents

| Fichier | Type | Description |
|---|---|---|
| `articles_generated_2026-02-01_2026-02-28.json` | JSON | Données structurées du pipeline : articles collectés avec résumés IA, sources, dates et images (février 2026) |
| `rapport_sommaire_articles_generated_2026-02-01_2026-02-28.md` | Markdown | Rapport de synthèse thématique des actualités IA de février 2026, généré depuis le JSON ci-dessus |
| `claude-generated-presentation.md` | Markdown | Présentation type diaporama générée par Claude à partir des articles — exemple de prompt avancé |
| `claude-generated-presentation.pdf` | PDF | Version PDF exportée de la présentation Claude |
| `NotebookLM - Presentation.pdf` | PDF | Présentation générée par NotebookLM à partir du même corpus d'articles |
| `NotebookLM - infographie.png` | Image | Infographie synthétique produite par NotebookLM |

## Usage

Ces exemples peuvent être utilisés pour :
- Valider la structure de sortie du script `Get_data_from_JSONFile_AskSummary.py`
- Tester les scripts de conversion (`articles_json_to_markdown.py`)
- Démontrer les capacités de synthèse et de présentation du pipeline
- Démontrer comment les fichiers Markdown et JSON peuvent être utilisés avec différents outils IA (Claude, NotebookLM)
