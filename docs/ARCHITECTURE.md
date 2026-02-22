# Architecture — AnalyseActualités

> Document de référence technique · Version 3.0 · 22 février 2026

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture multi-flux](#2-architecture-multi-flux)
3. [Flux de données détaillé](#3-flux-de-données-détaillé)
4. [Composants principaux](#4-composants-principaux)
5. [Modèle de données](#5-modèle-de-données)
6. [Intégrations externes — API EurIA](#6-intégrations-externes--api-euria)
7. [Infrastructure & Chemins](#7-infrastructure--chemins)
8. [Sécurité](#8-sécurité)
9. [Performance et scalabilité](#9-performance-et-scalabilité)
10. [Décisions architecturales](#10-décisions-architecturales)
11. [Roadmap](#11-roadmap)

---

## 1. Vue d'ensemble

### Objectif

Pipeline ETL automatisé qui **collecte** des flux d'actualités (JSON/RSS), **extrait** le contenu HTML, **enrichit** chaque article par un résumé IA (API EurIA, modèle Qwen3) et **produit** des sorties structurées (JSON + rapports Markdown), cloisonnées par flux.

### Principes architecturaux

| # | Principe | Implication |
|---|----------|-------------|
| 1 | **Séparation des préoccupations** | Scripts, config, données et rapports dans des dossiers dédiés |
| 2 | **Cloisonnement par flux** | Chaque source a ses propres dossiers de sortie et de cache |
| 3 | **Chemins absolus dynamiques** | Résolution via `__file__` — indépendant du `cwd` |
| 4 | **Résilience** | Retry automatique (3 tentatives), gestion exhaustive des erreurs |
| 5 | **Headless first** | Tout est pilotable en CLI ; GUI uniquement pour scripts utilitaires |
| 6 | **Langue française** | Clés JSON, messages, prompts IA — ne pas modifier sans mise à jour globale |

### Architecture générale

```mermaid
flowchart TB
    subgraph SOURCES["Sources de données"]
        F1["Flux JSON 1\n(ex: IA généraliste)"]
        F2["Flux JSON 2\n(ex: Tech & numérique)"]
        FN["... N flux\n(config/flux_json_sources.json)"]
        RSS["Flux RSS\n(data/Reeder.opml)"]
    end

    subgraph ORCHESTRATION["Orchestration"]
        CRON["Cron job\n(0 1 * * *)"]
        SCHED["scheduler_articles.py\nItère sur tous les flux"]
        CRON --> SCHED
    end

    subgraph PIPELINE["Pipeline ETL par flux"]
        COLLECT["Collecte HTTP\n(requests)"]
        EXTRACT["Extraction HTML\n(BeautifulSoup4)"]
        SUMMARIZE["Résumé IA\n(API EurIA · Qwen3 · 60s)"]
        IMAGES["Extraction images\n(top 3 · largeur > 500px)"]
    end

    subgraph STORAGE["Stockage (cloisonné par flux)"]
        JOUT["data/articles/<flux>/\narticles_generated_*.json"]
        CACHE["data/articles/cache/<flux>/\nCache réponses API"]
    end

    subgraph REPORTS["Génération de rapports"]
        REPORT["Rapport IA\n(API EurIA · 300s)"]
        MDOUT["rapports/markdown/<flux>/\nrapport_sommaire_*.md"]
        PDF["rapports/pdf/\n*.pdf"]
    end

    subgraph UTILS["Scripts utilitaires"]
        KEYWORD["get-keyword-from-rss.py"]
        THEMA["analyse_thematiques.py"]
        MD2["articles_json_to_markdown.py"]
    end

    SOURCES --> SCHED
    SCHED --> COLLECT
    COLLECT --> EXTRACT
    EXTRACT --> SUMMARIZE
    EXTRACT --> IMAGES
    SUMMARIZE --> JOUT
    IMAGES --> JOUT
    JOUT --> CACHE
    JOUT --> REPORT
    REPORT --> MDOUT
    MDOUT --> PDF
    RSS --> KEYWORD
    JOUT --> THEMA
    JOUT --> MD2

    classDef source fill:#e1f5ff,stroke:#0288d1,stroke-width:2px
    classDef process fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef storage fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef ai fill:#e8f5e9,stroke:#388e3c,stroke-width:3px
    classDef util fill:#fce4ec,stroke:#c62828,stroke-width:1px
    class F1,F2,FN,RSS source
    class COLLECT,EXTRACT,IMAGES process
    class JOUT,CACHE,MDOUT,PDF storage
    class SUMMARIZE,REPORT ai
    class KEYWORD,THEMA,MD2 util
```

---

## 2. Architecture multi-flux

### Principe de cloisonnement

Depuis février 2026, chaque flux est traité de manière totalement indépendante.
La configuration centralisée `config/flux_json_sources.json` définit la liste des flux et le scheduler les exécute séquentiellement (ou via cron).

```mermaid
flowchart LR
    CFG["config/flux_json_sources.json\n{ nom, url, fréquence }"]
    CFG --> S1["Flux: IA-generale"]
    CFG --> S2["Flux: Tech-numerique"]
    CFG --> SN["Flux: ..."]
    S1 --> D1["data/articles/IA-generale/"]
    S1 --> C1["cache/IA-generale/"]
    S1 --> R1["rapports/markdown/IA-generale/"]
    S2 --> D2["data/articles/Tech-numerique/"]
    S2 --> C2["cache/Tech-numerique/"]
    S2 --> R2["rapports/markdown/Tech-numerique/"]
    classDef flux fill:#fff9c4,stroke:#f9a825,stroke-width:2px
    classDef data fill:#f3e5f5,stroke:#7b1fa2,stroke-width:1px
    class S1,S2,SN flux
    class D1,D2,C1,C2,R1,R2 data
```

### Structure des dossiers de sortie

```
data/
├── articles/
│   ├── <nom-flux>/
│   │   └── articles_generated_YYYY-MM-DD_YYYY-MM-DD.json
│   └── cache/
│       └── <nom-flux>/
├── articles-from-rss/
│   └── <mot-clé>.json
└── raw/
    └── all_articles.txt

rapports/
├── markdown/
│   └── <nom-flux>/
│       └── rapport_sommaire_*.md
└── pdf/
    └── *.pdf
```

---

## 3. Flux de données détaillé

### Pipeline de traitement complet

```mermaid
flowchart TD
    START([Démarrage]) --> ARGS{Arguments CLI ?}
    ARGS -->|"--flux --date_debut --date_fin"| PARAMS[Paramètres fournis]
    ARGS -->|Absent| DEFAULTS["Dates par défaut\n1er du mois à aujourd'hui"]
    PARAMS --> ENV
    DEFAULTS --> ENV
    ENV["Chargement .env\nURL · BEARER · REEDER_JSON_URL"]
    ENV --> PATHS["Résolution chemins absolus\nvia __file__"]
    PATHS --> MKDIR["Création dossiers si absents\nos.makedirs(exist_ok=True)"]
    MKDIR --> FETCH["GET flux JSON\n(requests · timeout 30s)"]
    FETCH --> ITEMS["Extraction items du feed"]
    ITEMS --> FILTER["Filtrage par plage de dates\nverifier_date_entre()"]
    FILTER -->|Hors période| SKIP([Ignoré])
    FILTER -->|Dans période| HTML["Fetch HTML article\n(requests · timeout 10s)"]
    HTML --> BS4["Extraction texte\nBeautifulSoup4"]
    BS4 --> CACHE_CHK{Cache existant ?}
    CACHE_CHK -->|Oui| RESUME_CACHED["Résumé depuis cache"]
    CACHE_CHK -->|Non| EURIA1["POST API EurIA\nPrompt résumé · 60s · 3 essais"]
    EURIA1 --> RESUME_CACHED
    BS4 --> IMG["Extraction images\nimg width > 500px"]
    IMG --> SORT["Tri par surface\nwidth x height desc"]
    SORT --> TOP3["Top 3 images"]
    RESUME_CACHED --> BUILD["Construction objet article\n{Date · Sources · URL · Résumé · Images}"]
    TOP3 --> BUILD
    BUILD --> LOOP{Autre article ?}
    LOOP -->|Oui| FILTER
    LOOP -->|Non| SAVE["Sauvegarde JSON\ndata/articles/<flux>/articles_generated_*.json"]
    SAVE --> EURIA2["POST API EurIA\nPrompt rapport · 300s · 3 essais"]
    EURIA2 --> MDOUT["Rapport Markdown\nrapports/markdown/<flux>/rapport_*.md"]
    MDOUT --> DONE([Fin])
```

### Formats de données

**Entrée (flux JSON)**
```json
{
  "items": [
    {
      "url": "https://source.com/article",
      "date_published": "2026-01-23T10:00:00Z",
      "authors": [{ "name": "Auteur" }],
      "title": "Titre de l'article"
    }
  ]
}
```

**Sortie (JSON structuré)**
```json
[
  {
    "Date de publication": "2026-01-23T10:00:00Z",
    "Sources": "Nom de la source",
    "URL": "https://...",
    "Résumé": "Résumé généré par l'IA en français (max 20 lignes)...",
    "Images": [
      { "url": "https://image.jpg", "width": 1200, "height": 800, "area": 960000 }
    ]
  }
]
```

> ⚠️ **Format de date strict** : `YYYY-MM-DDTHH:MM:SSZ`
> Parser Python : `datetime.strptime(d, "%Y-%m-%dT%H:%M:%SZ")`

---

## 4. Composants principaux

### Vue d'ensemble des scripts

```mermaid
flowchart LR
    subgraph AUTO["Automatisés (cron / scheduler)"]
        SCHED["scheduler_articles.py\nOrchestration multi-flux"]
        MAIN["Get_data_from_JSONFile_AskSummary_v2.py\nScript ETL principal"]
        KW["get-keyword-from-rss.py\nExtraction par mot-clé RSS"]
    end

    subgraph UTIL["Utilitaires (CLI / GUI)"]
        TXT["Get_htmlText_From_JSONFile.py\nExtraction texte brut · GUI"]
        MD["articles_json_to_markdown.py\nConversion JSON vers MD · GUI"]
        TH["analyse_thematiques.py\nAnalyse thématique · CLI"]
        HEALTH["check_cron_health.py\nMonitoring cron"]
    end

    subgraph LIB["utils/ (bibliothèque partagée)"]
        API["api_client.py\nAppels EurIA"]
        CACHE_M["cache.py\nGestion cache"]
        CFG["config.py\nChargement config"]
        DATE["date_utils.py\nGestion dates"]
    end

    SCHED --> MAIN
    MAIN --> API
    MAIN --> CACHE_M
    MAIN --> CFG
    MAIN --> DATE
    KW --> API

    classDef auto fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    classDef util fill:#fff3e0,stroke:#f57c00,stroke-width:1px
    classDef lib fill:#e3f2fd,stroke:#1565c0,stroke-width:1px
    class SCHED,MAIN,KW auto
    class TXT,MD,TH,HEALTH util
    class API,CACHE_M,CFG,DATE lib
```

### Détail des scripts principaux

#### `Get_data_from_JSONFile_AskSummary_v2.py` — Script ETL central

```
Main Program
├── Configuration Loading    → load_dotenv() + utils/config.py
├── Path Detection & Setup   → SCRIPT_DIR, PROJECT_ROOT
├── Directory Creation       → os.makedirs(exist_ok=True)
├── Data Fetching            → requests.get(REEDER_JSON_URL)
├── Processing Loop
│   ├── Date Filtering       → verifier_date_entre()
│   ├── Text Extraction      → fetch_and_extract_text()   [requests + BS4]
│   ├── AI Summarization     → askForResume()             [API EurIA · 60s]
│   ├── Image Extraction     → extract_top_3_largest_images()
│   └── Cache Management     → utils/cache.py
├── Data Persistence         → json.dump vers data/articles/<flux>/
└── Report Generation        → create_report()            [API EurIA · 300s]
```

**Invocation :**
```bash
python scripts/Get_data_from_JSONFile_AskSummary_v2.py \
  --flux "Intelligence-artificielle" \
  --date_debut 2026-02-01 \
  --date_fin 2026-02-28
```

#### `scheduler_articles.py` — Orchestrateur multi-flux

- Lit `config/flux_json_sources.json`
- Lance le script ETL pour chaque flux et chaque période configurée
- Déclenchement via cron (`0 1 * * *`) ou manuellement

#### `get-keyword-from-rss.py` — Extraction par mot-clé

- Lit `data/Reeder.opml` (liste flux RSS)
- Filtre les articles des 7 derniers jours par mot-clé (`config/keyword-to-search.json`)
- Produit `data/articles-from-rss/<mot-clé>.json` sans doublon
- Résumé IA + image principale par article
- Cron : `0 1 * * *`

---

## 5. Modèle de données

### Schéma entité-relation

```mermaid
erDiagram
    FLUX ||--o{ ARTICLE : contient
    FLUX {
        string nom
        string url
        string frequence
    }
    ARTICLE {
        string flux_nom
        datetime date_publication
        string source
        string url
        string resume
    }
    ARTICLE ||--o{ IMAGE : illustre
    IMAGE {
        string url
        int width
        int height
        int area
    }
    ARTICLE }o--o{ AUTEUR : ecrit_par
    AUTEUR {
        string nom
    }
    ARTICLE }o--|| RAPPORT : inclus_dans
    RAPPORT {
        string fichier
        datetime date_generation
        string flux_nom
    }
```

### Contraintes métier

| Champ | Type | Contrainte |
|-------|------|------------|
| `Date de publication` | ISO 8601 String | Format `YYYY-MM-DDTHH:MM:SSZ` obligatoire |
| `Sources` | String | `authors[0].name` du flux |
| `Résumé` | Text | Max 20 lignes · Langue française |
| `Images[].url` | URL | Doit commencer par `https://` |
| `Images[].width` | Integer | > 500 px |
| Période | Dates | `date_debut < date_fin` |

---

## 6. Intégrations externes — API EurIA

### Appel API standard

```python
response = requests.post(
    URL,  # depuis .env
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

### Prompts utilisés

| Usage | Timeout | Tentatives | Prompt |
|-------|---------|------------|--------|
| Résumé article | 60 s | 3 | `faire un résumé de ce texte sur maximum 20 lignes en français, ne donne que le résumé, sans commentaire ni remarque : {texte}` |
| Génération rapport | 300 s | 3 | Analyse JSON, groupe par catégories, tableau références, intègre images |

### Gestion des erreurs & retry

```mermaid
flowchart TD
    CALL["Appel API EurIA"] --> OK{HTTP 200 ?}
    OK -->|Oui| RETURN["Retour contenu"]
    OK -->|Non| A1["Tentative 1/3"]
    A1 -->|Échec| A2["Tentative 2/3"]
    A2 -->|Échec| A3["Tentative 3/3"]
    A3 -->|Échec| FALLBACK["Message erreur standardisé\nstocké dans Résumé"]
    classDef ok fill:#e8f5e9,stroke:#388e3c
    classDef err fill:#ffebee,stroke:#c62828
    class RETURN ok
    class FALLBACK err
```

> Amélioration future : backoff exponentiel `time.sleep(2 ** attempt)` (2 s, 4 s, 8 s…)

---

## 7. Infrastructure & Chemins

### Résolution des chemins

Tous les scripts utilisent des chemins absolus construits depuis `__file__` :

```python
SCRIPT_DIR            = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT          = os.path.dirname(SCRIPT_DIR)
DATA_ARTICLES_DIR     = os.path.join(PROJECT_ROOT, "data", "articles")
DATA_RAW_DIR          = os.path.join(PROJECT_ROOT, "data", "raw")
RAPPORTS_MARKDOWN_DIR = os.path.join(PROJECT_ROOT, "rapports", "markdown")
```

Avantage : fonctionne depuis n'importe quel répertoire, compatible cron, raccourcis macOS et Docker.

### Cartographie des dossiers

```mermaid
flowchart TD
    ROOT["PROJECT_ROOT"]
    ROOT --> SCRIPTS["scripts/\nScripts Python exécutables"]
    ROOT --> CONFIG2["config/\nflux_json_sources.json\ncategories_actualite.json\nkeyword-to-search.json\nthematiques_societales.json"]
    ROOT --> DATA2["data/"]
    ROOT --> RAPPORTS2["rapports/"]
    ROOT --> UTILS2["utils/\nBibliothèque partagée"]
    ROOT --> ARCHIVES2["archives/\nSauvegardes horodatées"]
    ROOT --> TESTS2["tests/\npytest"]
    DATA2 --> ART["articles/<flux>/\narticles_generated_*.json\ncache/<flux>/"]
    DATA2 --> ARSS["articles-from-rss/\n<mot-clé>.json"]
    DATA2 --> RAW2["raw/\nall_articles.txt"]
    RAPPORTS2 --> MD3["markdown/<flux>/\nrapport_sommaire_*.md"]
    RAPPORTS2 --> PDF2["pdf/\n*.pdf"]
    classDef dir fill:#f5f5f5,stroke:#9e9e9e
    class ROOT,SCRIPTS,CONFIG2,DATA2,RAPPORTS2,UTILS2,ARCHIVES2,TESTS2,ART,ARSS,RAW2,MD3,PDF2 dir
```

### Déploiement Docker

Le projet inclut `Dockerfile` + `docker-compose.yml`. L'`entrypoint.sh` démarre le scheduler au lancement du conteneur.

---

## 8. Sécurité

### Gestion des secrets

- Toutes les credentials dans `.env` (jamais versionné — `.gitignore`)
- Chargement exclusif via `python-dotenv`
- Variables sensibles : `bearer`, `REEDER_JSON_URL`

### Validation des entrées

| Vecteur | Validation |
|---------|-----------|
| URLs | `startswith(('http://', 'https://'))` + `raise_for_status()` |
| Dates | `datetime.strptime()` strict + `date_debut < date_fin` |
| JSON | `try/except` sur `json.load()` et `response.json()` |
| Images | Largeur > 500 px + URL absolue |

---

## 9. Performance et scalabilité

### Métriques (traitement séquentiel actuel)

| Opération | Temps moyen |
|-----------|-------------|
| Fetch HTML | 1–3 s |
| Extraction texte (BS4) | < 100 ms |
| Résumé IA | 5–10 s |
| Extraction + tri images | 1–2 s |
| **Total / article** | **7–15 s** |

> 100 articles ≈ 12–25 minutes

### Priorité des optimisations

```mermaid
quadrantChart
    title Priorité des optimisations (effort vs impact)
    x-axis Effort faible --> Effort élevé
    y-axis Impact faible --> Impact élevé
    quadrant-1 Planifier
    quadrant-2 Priorité haute
    quadrant-3 Déprioritiser
    quadrant-4 Évaluer
    Filtrage anticipé par date: [0.15, 0.75]
    Cache HTTP requests-cache: [0.25, 0.65]
    Backoff exponentiel retry: [0.20, 0.50]
    Parallélisation asyncio: [0.55, 0.90]
    Migration PostgreSQL: [0.80, 0.60]
    Queue Celery+Redis: [0.85, 0.70]
```

---

## 10. Décisions architecturales

| ADR | Décision | Justification | Limite |
|-----|----------|---------------|--------|
| **ADR-001** | Chemins absolus via `__file__` | Compatible cron, macOS, Docker | Légèrement plus verbeux |
| **ADR-002** | JSON comme stockage primaire | Natif Python, lisible, sans setup DB | Pas de requêtes complexes |
| **ADR-003** | Résumés IA en français uniquement | Sources et utilisateurs francophones | Limite réutilisabilité |
| **ADR-004** | Retry sans backoff | Simple à implémenter | Risque surcharge API en erreur systémique |
| **ADR-005** | GUI tkinter (scripts utilitaires) | User-friendly en usage manuel | Incompatible headless / CI |
| **ADR-006** | Cloisonnement par flux (fév. 2026) | Isolation complète des données | Duplication de dossiers |

---

## 11. Roadmap

```mermaid
gantt
    title Roadmap technique AnalyseActualités
    dateFormat  YYYY-MM
    section Phase 1 — Stabilisation
    Tests unitaires pytest           :2026-01, 2026-03
    CI/CD GitHub Actions             :2026-02, 2026-03
    Backoff exponentiel retry        :2026-02, 2026-03
    section Phase 2 — Performance
    Filtrage anticipé par date       :2026-03, 2026-04
    Cache HTTP requests-cache        :2026-03, 2026-05
    Parallélisation asyncio          :2026-04, 2026-06
    section Phase 3 — Scalabilité
    Migration PostgreSQL              :2026-06, 2026-09
    Queue Celery + Redis              :2026-07, 2026-09
    section Phase 4 — Features
    Analyse de sentiment              :2026-09, 2026-12
    Export multi-formats PDF/EPUB     :2026-10, 2026-12
    API REST exposition données       :2026-10, 2026-12
```

---

## Références

| Ressource | Lien |
|-----------|------|
| Structure détaillée | [docs/STRUCTURE.md](STRUCTURE.md) |
| Guide déploiement | [docs/DEPLOY.md](DEPLOY.md) |
| Guide scripts | [scripts/USAGE.md](../scripts/USAGE.md) |
| Historique | [CHANGELOG.md](../CHANGELOG.md) |
| BeautifulSoup4 | https://www.crummy.com/software/BeautifulSoup/bs4/doc/ |
| API EurIA Infomaniak | https://euria.infomaniak.com |
| ISO 8601 | https://www.iso.org/iso-8601-date-and-time-format.html |

---

**Maintenu par** : Patrick Ostertag · patrick.ostertag@gmail.com
**Dernière mise à jour** : 22 février 2026 · Version 3.0
