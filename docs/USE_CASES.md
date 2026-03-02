# Use Cases — WUDD.ai

> Cinq scénarios typiques d'utilisation de la plateforme, du point de vue de l'utilisateur.
> Chaque use case est illustré par un diagramme Mermaid.

---

## Table des matières

1. [Veille quotidienne par mots-clés](#1-veille-quotidienne-par-mots-clés)
2. [Rapport de synthèse hebdomadaire multi-flux](#2-rapport-de-synthèse-hebdomadaire-multi-flux)
3. [Recherche transversale sur une entité nommée](#3-recherche-transversale-sur-une-entité-nommée)
4. [Cartographie géopolitique des sujets](#4-cartographie-géopolitique-des-sujets)
5. [Exploration du réseau sémantique](#5-exploration-du-réseau-sémantique)

---

## 1. Veille quotidienne par mots-clés

**Contexte :** L'utilisateur suit un sujet précis (ex. « intelligence artificielle », « cybersécurité ») et veut être informé chaque matin des nouveaux articles correspondants, résumés en français par l'IA, sans lire les sources une par une.

**Acteurs :** Utilisateur · Docker/cron · API EurIA · Flux RSS (133+ sources)

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant V as Viewer (navigateur)
    participant F as Flask (app.py)
    participant S as get-keyword-from-rss.py
    participant E as API EurIA (Qwen3)
    participant R as Flux RSS

    Note over U,R: Configuration initiale (une fois)
    U->>V: Ouvre Réglages → onglet Mots-clés
    U->>V: Ajoute « intelligence artificielle »
    V->>F: POST /api/keywords
    F-->>V: { ok: true }

    Note over U,R: Extraction quotidienne (automatique ou manuelle)
    U->>V: Clique "Mots-clés RSS" → Démarrer
    V->>F: GET /api/scripts/keyword-rss/stream (SSE)
    F->>S: subprocess.Popen(get-keyword-from-rss.py)
    loop Pour chaque source RSS
        S->>R: GET feed (urllib)
        R-->>S: Articles des 7 derniers jours
        S->>S: Filtre par mot-clé (word-boundary)
        S->>E: POST résumé IA (60s)
        E-->>S: Résumé 20 lignes
        S->>E: POST extraction NER (18 types)
        E-->>S: { PERSON, ORG, GPE… }
        S-->>V: SSE log ligne par ligne
    end
    S-->>F: code retour 0
    F-->>V: { done: true, returncode: 0 }
    V->>F: GET /api/files (refresh auto)
    F-->>V: Liste mise à jour

    Note over U,R: Consultation
    U->>V: Sélectionne data/articles-from-rss/intelligence-artificielle.json
    V->>F: GET /api/content?path=…
    F-->>V: Contenu JSON
    U->>V: Bascule en vue "Articles"
    U->>U: Lit les résumés IA, consulte les images
```

**Valeur produite :** Un fichier JSON enrichi par flux de mots-clés, avec résumés IA et entités NER, consultable directement dans le viewer sans quitter l'interface.

---

## 2. Rapport de synthèse hebdomadaire multi-flux

**Contexte :** Chaque lundi, l'utilisateur veut recevoir un rapport de synthèse structuré couvrant l'ensemble de ses flux d'actualités (IA généraliste, Tech, Géopolitique…), rédigé et organisé automatiquement par l'IA.

**Acteurs :** Utilisateur · Docker/cron · scheduler_articles.py · API EurIA

```mermaid
flowchart TD
    START([Lundi 06h00 — cron déclenche]) --> SCHED[scheduler_articles.py\nlit flux_json_sources.json]
    SCHED --> LOOP{Pour chaque flux}
    LOOP --> FETCH[Collecte articles\nReeder JSON feed]
    FETCH --> FILTER[Filtre par date\n1er du mois → aujourd'hui]
    FILTER --> HTML[Extraction texte\nBeautifulSoup4]
    HTML --> CACHE{Cache API\n24h ?}
    CACHE -->|Oui| REUSE[Résumé en cache]
    CACHE -->|Non| EURIA1[POST EurIA\nRésumé 20 lignes · 60s]
    EURIA1 --> NER[POST EurIA\nExtraction NER]
    NER --> REUSE
    REUSE --> IMG[Images > 500px\nTop 3 par article]
    IMG --> JSON_OUT[data/articles/flux/\narticles_generated_*.json]
    JSON_OUT --> RAPPORT[POST EurIA\nRapport synthèse · 300s]
    RAPPORT --> MD[rapports/markdown/flux/\nrapport_sommaire_*.md]
    MD --> LOOP

    LOOP -->|Tous les flux traités| VIEWER

    subgraph VIEWER["Utilisateur — Viewer"]
        V1[Ouvre le viewer]
        V2[Sidebar → flux → rapport Markdown]
        V3[Lecture rendue avec images\net diagrammes Mermaid]
        V4[Télécharge le fichier MD]
        V1 --> V2 --> V3 --> V4
    end

    classDef auto fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    classDef storage fill:#f3e5f5,stroke:#7b1fa2,stroke-width:1px
    classDef viewer fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
    class START,SCHED,FETCH,FILTER,HTML,EURIA1,NER,IMG,RAPPORT auto
    class JSON_OUT,MD storage
    class VIEWER,V1,V2,V3,V4 viewer
```

**Valeur produite :** Un rapport Markdown hebdomadaire prêt à lire, structuré par catégories thématiques identifiées par l'IA, avec images et tableau de références, sans aucune intervention manuelle.

---

## 3. Recherche transversale sur une entité nommée

**Contexte :** L'utilisateur veut savoir tout ce que le corpus d'articles dit sur un acteur précis — une entreprise, une personnalité, un pays — en agrégeant les mentions à travers tous les flux et toutes les dates.

**Acteurs :** Utilisateur · Viewer · Flask · Wikipedia/Wikidata · API EurIA

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant D as EntityDashboard
    participant P as EntityArticlePanel
    participant F as Flask
    participant W as Wikipedia / Wikidata
    participant E as API EurIA

    U->>D: Clique "Entités" dans la barre principale
    D->>F: GET /api/entities/dashboard
    F-->>D: Stats agrégées (top 50 par type)
    D-->>U: Liste : PERSON · ORG · GPE · PRODUCT…

    U->>D: Clique sur "OpenAI" (ORG)
    D->>P: Ouvre EntityArticlePanel

    par Articles
        P->>F: GET /api/entities/articles?type=ORG&value=OpenAI
        F-->>P: 47 articles triés par date
    and Image
        P->>F: POST /api/entities/images [{name:"OpenAI", type:"ORG"}]
        F->>W: Wikidata P154 (logo officiel)
        W-->>F: Logo URL
        F-->>P: { url, width, height }
    end

    U->>P: Lit les résumés des articles
    U->>P: Clique onglet "Infos"
    P->>F: GET /api/entities/info?type=ORG&value=OpenAI (SSE)
    F->>E: POST EurIA — synthèse encyclopédique streaming
    E-->>F: Tokens en streaming
    F-->>P: SSE chunks (filtre <think>)
    P-->>U: Markdown rendu progressivement

    U->>P: Clique "Rapport"
    P-->>U: Téléchargement rapport_ORG_OpenAI_2026-03-02.md
```

**Valeur produite :** En quelques clics, l'utilisateur obtient une vue 360° sur n'importe quelle entité : tous les articles qui la mentionnent, une synthèse encyclopédique à jour (web search), un logo, et un rapport Markdown exportable.

---

## 4. Cartographie géopolitique des sujets

**Contexte :** L'utilisateur veut identifier les zones géographiques les plus présentes dans ses sources d'actualités, détecter des hotspots émergents et explorer rapidement les articles associés à une région.

**Acteurs :** Utilisateur · Viewer · Flask · Wikipedia API (géocodage)

```mermaid
flowchart LR
    U([Utilisateur]) --> DASH[EntityDashboard\nonglet 🗺 Carte]
    DASH --> API1[GET /api/entities/dashboard\nEntités GPE + LOC]
    API1 --> GEO[POST /api/entities/geocode\nliste de noms]

    subgraph GEO_CACHE["Géocodage (Wikipedia API + cache JSON)"]
        CHECK{Dans le\ncache ?}
        WIKI[Wikipedia API\nfr puis en]
        STORE[data/geocode_cache.json\nmise à jour]
        CHECK -->|Non| WIKI --> STORE
        CHECK -->|Oui| HIT[Coordonnées\nen cache]
    end

    GEO --> CHECK
    STORE --> MAP
    HIT --> MAP

    MAP[Carte Leaflet\nCircleMarker par entité\nrayon ∝ nb mentions]
    MAP --> U2([Utilisateur voit\nles hotspots])

    U2 -->|Clique sur un marqueur| PANEL[EntityArticlePanel\narticles filtrés par GPE/LOC]
    PANEL --> ART[Articles mentionnant\ncette zone géographique]
    ART --> EXPORT[Exporte JSON\nou génère rapport MD]

    classDef ui fill:#e3f2fd,stroke:#1565c0,stroke-width:1px
    classDef api fill:#fff3e0,stroke:#f57c00,stroke-width:1px
    classDef cache fill:#f3e5f5,stroke:#7b1fa2,stroke-width:1px
    class DASH,MAP,PANEL,ART,EXPORT ui
    class API1,GEO,WIKI api
    class CHECK,STORE,HIT cache
```

![Cartographie géopolitique — carte mondiale des entités](Screen-captures/WWUD.ai-Viewer-entities-map-world.png)

**Valeur produite :** Une carte mondiale interactive où chaque cercle représente une entité géopolitique mentionnée dans le corpus — sa taille reflète la fréquence des mentions. Un clic ouvre instantanément les articles correspondants.

---

## 5. Exploration du réseau sémantique

**Contexte :** L'utilisateur part d'une entité connue et veut découvrir quelles autres entités lui sont le plus souvent associées dans les articles — pour identifier des acteurs, des tendances ou des connexions inattendues.

**Acteurs :** Utilisateur · EntityArticlePanel · EntityGraph · Flask

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant P as EntityArticlePanel
    participant G as EntityGraph (SVG)
    participant F as Flask

    U->>P: Ouvre l'entité "Anthropic" (ORG)
    U->>P: Clique onglet "Graphe"

    P->>F: GET /api/entities/cooccurrences?type=ORG&value=Anthropic&depth=1&limit=40
    F-->>P: { nodes: [...], edges: [...], total_cooc: 312 }
    P->>G: Rendu SVG — algorithme Fruchterman-Reingold\n240 itérations · nœud central ancré

    G-->>U: Graphe interactif\n"Anthropic" au centre\nClaude · OpenAI · Sam Altman\nFrance · 2026 · IA… autour

    U->>G: Survole un nœud → tooltip (nb co-occurrences)
    U->>G: Active "Profondeur 2"
    G->>F: GET /api/entities/cooccurrences?depth=2&limit=12
    F-->>G: Nœuds L2 (entités des entités)
    G-->>U: Graphe étendu — réseau à 2 degrés

    U->>G: Clique sur "Sam Altman" (PERSON)
    Note over U,F: Navigation interne : nouvelle entité centrale
    G->>F: GET /api/entities/articles?type=PERSON&value=Sam Altman
    F-->>P: Articles mis à jour
    G->>F: GET /api/entities/cooccurrences?type=PERSON&value=Sam Altman
    F-->>G: Nouveau graphe centré sur Sam Altman

    U->>P: Revient à la liste → Exporte JSON des articles
```

![Exploration du réseau sémantique — graphe de co-occurrences](Screen-captures/WWUD.ai-Viewer-entities-relations.png)

**Valeur produite :** L'utilisateur navigue dans le réseau sémantique de son corpus comme dans une carte mentale vivante — chaque clic recentre le graphe sur une nouvelle entité, révélant progressivement la structure relationnelle de l'information collectée.

---

## 6. Rapport ad hoc avec Claude

**Contexte :** L'utilisateur dispose d'un fichier JSON d'articles (généré par le pipeline ou l'extraction RSS) et veut obtenir rapidement un rapport de synthèse structuré, rédigé par Claude, sans passer par le pipeline automatique. Il utilise le [prompt dédié](instructions-for-claude-report.md) qui groupe les articles par thématiques, insère les images et produit un Markdown compatible iA Writer.

**Acteurs :** Utilisateur · Viewer · Claude (IA) · [instructions-for-claude-report.md](instructions-for-claude-report.md)

**Exemple de résultat :** [claude-generated-rapport-anthropic-20-28-fev-2026.pdf](../samples/claude-generated-rapport-anthropic-20-28-fev-2026.pdf)

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant V as Viewer (navigateur)
    participant F as Flask
    participant C as Claude (IA)

    U->>V: Selectionne un fichier JSON d articles
    V->>F: GET /api/content?path=...
    F-->>V: Contenu JSON (articles + resumes + entites)
    U->>V: Telecharge le fichier JSON

    Note over U,C: Hors pipeline — interaction directe avec Claude
    U->>C: Soumet le JSON + prompt instructions-for-claude-report.md
    Note over C: Groupe par thematiques societales\nRedige intro + sections + tableau references\nInsere images (URL HTTP > 500px)

    C-->>U: Rapport Markdown structure\n(frontmatter iA Writer · TOC · corps · references)

    U->>U: Copie le Markdown dans iA Writer
    U->>U: Exporte en PDF / partage
```

**Valeur produite :** Un rapport de synthèse thématique complet en quelques minutes, sans configuration ni attente de pipeline — idéal pour un corpus ponctuel (mot-clé, entité, période) ou une demande urgente. Le [prompt dédié](instructions-for-claude-report.md) garantit une structure et un style cohérents à chaque génération.

---

## Synthèse des use cases

```mermaid
quadrantChart
    title Use cases - Frequence vs Profondeur d analyse
    x-axis Ponctuel --> Quotidien/hebdomadaire
    y-axis Exploration libre --> Resultat structure
    quadrant-1 Production automatisee
    quadrant-2 Veille operationnelle
    quadrant-3 Analyse ad hoc
    quadrant-4 Exploration ouverte
    UC1 Veille mots-cles: [0.80, 0.70]
    UC2 Rapport multi-flux: [0.90, 0.90]
    UC3 Recherche entite: [0.40, 0.75]
    UC4 Carte geopolitique: [0.30, 0.55]
    UC5 Reseau semantique: [0.20, 0.25]
    UC6 Rapport Claude ad hoc: [0.35, 0.85]
```

| # | Use Case | Déclencheur | Durée typique | Sortie |
|---|----------|-------------|---------------|--------|
| 1 | Veille mots-clés | Manuel ou cron 01h00 | 5–15 min (script) | JSON enrichi NER |
| 2 | Rapport multi-flux | Cron lundi 06h00 | 30–90 min (pipeline) | Rapport Markdown |
| 3 | Recherche entité | Ad hoc (viewer) | 2–5 min | Rapport MD / export JSON |
| 4 | Carte géopolitique | Ad hoc (viewer) | 1–3 min | Lecture + export |
| 5 | Réseau sémantique | Ad hoc (viewer) | 5–20 min | Découverte / navigation |
| 6 | Rapport Claude ad hoc | Ad hoc (Claude) | 2–5 min | Rapport Markdown / PDF |

---

**Maintenu par** : Patrick Ostertag · patrick.ostertag@gmail.com
**Créé le** : 2 mars 2026
