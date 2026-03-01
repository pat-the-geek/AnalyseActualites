# Analyse sémantique par entités nommées (NER)

> Documentation fonctionnelle · Version 1.0 · Mars 2026

---

## Table des matières

1. [Principe : la sémantique référentielle](#1-principe--la-sémantique-référentielle)
2. [Les 18 types d'entités reconnus](#2-les-18-types-dentités-reconnus)
3. [Pipeline d'extraction NER](#3-pipeline-dextraction-ner)
4. [Dashboard Entités — Vue Liste](#4-dashboard-entités--vue-liste)
5. [Dashboard Entités — Vue Carte](#5-dashboard-entités--vue-carte)
6. [Dashboard Entités — Vue Galerie](#6-dashboard-entités--vue-galerie)
7. [Panneau de détail d'une entité](#7-panneau-de-détail-dune-entité)
8. [Données techniques](#8-données-techniques)

---

## 1. Principe : la sémantique référentielle

WUDD.ai analyse l'information selon deux couches sémantiques complémentaires :

**La sémantique lexicale** (mots-clés) identifie le *sujet* d'un texte — son domaine, son champ thématique. C'est la couche la plus basique du sens : dire qu'un article parle d'intelligence artificielle ou de géopolitique.

**La sémantique référentielle** (entités) va plus loin : elle reconnaît qu'un mot désigne un *acteur du réel* — une personne précise, une organisation existante, un pays, un produit commercial. On ne cherche plus seulement le thème, mais les protagonistes que le texte convoque.

C'est ce qu'on appelle la **reconnaissance d'entités nommées** (NER — *Named Entity Recognition*). Là où la sémantique lexicale dit « cet article parle d'IA », la sémantique référentielle dit « cet article cite OpenAI, Sam Altman et les États-Unis ».

Cette distinction fonde l'architecture du Dashboard Entités de WUDD.ai : au-delà de la classification thématique, l'utilisateur peut interroger directement les acteurs de l'information — qui est mentionné, combien de fois, dans quels articles.

---

## 2. Les 18 types d'entités reconnus

L'extraction NER identifie 18 types d'entités couvrant les dimensions essentielles de l'information d'actualité :

| Catégorie | Types | Exemples |
| --- | --- | --- |
| **Acteurs** | `PERSON`, `ORG`, `NORP` | Sam Altman, OpenAI, Démocrates |
| **Géographie** | `GPE`, `LOC`, `FAC` | États-Unis, Alpes, Tour Eiffel |
| **Objets** | `PRODUCT`, `WORK_OF_ART`, `LAW` | ChatGPT, *Nature*, RGPD |
| **Événements** | `EVENT` | Forum de Davos |
| **Temporel** | `DATE`, `TIME` | 2026, 14h00 |
| **Quantitatif** | `MONEY`, `QUANTITY`, `PERCENT`, `CARDINAL`, `ORDINAL` | 150 M$, 3 milliards, 12 %, cinquième |
| **Linguistique** | `LANGUAGE` | français, anglais |

---

## 3. Pipeline d'extraction NER

### 3.1 Enrichissement a posteriori

L'extraction NER est assurée par `scripts/enrich_entities.py`, qui soumet le champ `Résumé` de chaque article à l'API EurIA (Qwen3) avec un prompt spécialisé.

```bash
# Enrichir tous les articles existants
python3 scripts/enrich_entities.py

# Un flux spécifique
python3 scripts/enrich_entities.py --flux Intelligence-artificielle

# Simulation sans appel API
python3 scripts/enrich_entities.py --dry-run
```

Le script ne ré-enrichit pas les articles déjà traités (sauf avec `--force`). La sauvegarde est atomique (`.tmp` → remplacement).

### 3.2 Enrichissement en temps réel

Le script `scripts/get-keyword-from-rss.py` (collecte quotidienne par mot-clé) intègre l'extraction NER directement lors de la génération du résumé : chaque article est enrichi sans étape séparée.

### 3.3 Format de stockage

Les entités sont ajoutées dans le JSON de l'article sous la clé `entities` :

```json
{
  "entities": {
    "PERSON": ["Sam Altman", "Elon Musk"],
    "ORG":    ["OpenAI", "Tesla"],
    "GPE":    ["États-Unis", "Europe"],
    "PRODUCT": ["ChatGPT", "Grok"],
    "DATE":   ["2026"],
    "MONEY":  ["150 millions de dollars"]
  }
}
```

Seuls les types effectivement détectés sont présents. Les types avec zéro entité sont omis.

---

## 4. Dashboard Entités — Vue Liste

**Accès** : bouton `Liste` dans le Dashboard Entités (barre de navigation du Viewer).

La vue Liste offre une lecture transversale de toutes les entités extraites de l'ensemble des fichiers JSON analysés.

![Dashboard Entités — Vue Liste](Screen-captures/WWUD.ai-Viewer-entities.png)

### En-tête de statistiques

Trois indicateurs globaux sont affichés en permanence :

| Indicateur | Signification |
| --- | --- |
| **Fichiers analysés** | Nombre de fichiers JSON parcourus |
| **Articles au total** | Nombre d'articles trouvés dans ces fichiers |
| **Articles enrichis** | Articles possédant un champ `entities` (avec taux de couverture) |

### Sections par type

Chaque type d'entité est présenté dans une section dédiée avec :

- **Compteur total** : nombre d'occurrences agrégées (toutes mentions de ce type dans tous les articles)
- **Compteur unique** : nombre d'entités distinctes
- **Barre de proportion** : largeur relative au type le plus fréquent
- **Nuage de tags cliquables** : top entités du type, avec compteur de mentions

Cliquer sur n'importe quelle entité ouvre le [panneau de détail](#7-panneau-de-détail-dune-entité).

---

## 5. Dashboard Entités — Vue Carte

**Accès** : bouton `Carte` dans le Dashboard Entités.

La vue Carte géolocalise les entités de type `GPE` (lieux géopolitiques : pays, villes, régions) et `LOC` (lieux géographiques : chaînes de montagnes, fleuves, zones) sur un planisphère interactif.

![Dashboard Entités — Vue Carte mondiale](Screen-captures/WWUD.ai-Viewer-entities-map-world.png)

![Dashboard Entités — Vue Carte zoomée (Europe centrale)](Screen-captures/WWUD.ai-Viewer-entities-map-zoom.png)

### Encodage visuel

| Élément | Signification |
| --- | --- |
| Couleur **bleue** | Entité `GPE` (lieu géopolitique) |
| Couleur **verte** | Entité `LOC` (lieu géographique) |
| **Taille du cercle** | Proportionnelle au nombre de mentions (échelle logarithmique) |

### Interactivité

- **Survol** : tooltip affichant le nom, le type et le nombre de mentions
- **Clic** : ouvre le [panneau de détail](#7-panneau-de-détail-dune-entité) de l'entité
- **Zoom** : molette ou boutons +/−, navigation libre sur la carte
- **Fond cartographique** : tuiles OpenStreetMap chargées à la volée

### Géocodage Wikipedia

Les coordonnées géographiques sont récupérées via l'API Wikipedia (`action=query&prop=coordinates`), avec priorité à `fr.wikipedia.org` et fallback sur `en.wikipedia.org`. Les résultats sont mis en cache dans `data/geocode_cache.json` (TTL illimité). Les entités sans coordonnées connues (lieux abstraits, zones vastes) n'apparaissent pas sur la carte.

> Si la carte est vide ou incomplète malgré des entités GPE/LOC présentes, supprimer `data/geocode_cache.json` pour forcer le re-géocodage (peut indiquer un cache pollué par des erreurs réseau antérieures).

---

## 6. Dashboard Entités — Vue Galerie

**Accès** : bouton `Galerie` dans le Dashboard Entités.

La vue Galerie affiche une représentation visuelle des entités de type `PERSON`, `ORG` et `PRODUCT`, organisée en trois sections alphabétiques avec images récupérées depuis Wikimedia.

![Dashboard Entités — Vue Galerie](Screen-captures/WWUD.ai-Viewer-entities-galerie.png)

### Organisation de la galerie

| Section | Type | Format des tuiles | Image source |
| --- | --- | --- | --- |
| **Personnes** | `PERSON` | Portrait (hauteur fixe, `object-cover`) | Wikipedia `pageimages` |
| **Organisations** | `ORG` | Carré (`aspect-ratio: 1`, `object-contain`) | Wikidata P154 (logo officiel) |
| **Produits / Tech** | `PRODUCT` | Carré (`aspect-ratio: 1`, `object-contain`) | Wikidata P154 → fallback Wikipedia |

Les tuiles sont triées **alphabétiquement** au sein de chaque section. L'en-tête de section indique le nombre d'images trouvées sur le total (`27 images / 50`).

### Contrôle du zoom

Un curseur en haut de la galerie permet d'ajuster le nombre de colonnes de 2 à 15 (défaut : 10). La hauteur des portraits s'adapte automatiquement au nombre de colonnes.

### Placeholder pour les entités sans image

Lorsqu'aucune image n'est disponible — soit parce que l'entité est absente de Wikipedia/Wikidata, soit parce que son nom est ambigu (voir ci-dessous) — la tuile affiche un **placeholder** coloré avec les initiales de l'entité :

| Type | Couleur du placeholder |
| --- | --- |
| `PERSON` | Fond violet, texte violet |
| `ORG` | Fond bleu, texte bleu |
| `PRODUCT` | Fond orange, texte orange |

### Stratégie d'images et filtrage des faux positifs

La recherche d'images utilise trois APIs Wikimedia selon le type d'entité :

**Pour PERSON** — Wikipedia `pageimages` (API `prop=pageimages&pithumbsize=200`) :
L'image principale de la page Wikipedia de la personne est retournée. Requête FR d'abord, EN en fallback.

**Pour ORG et PRODUCT** — Wikidata P154 (propriété « logo image ») :
La propriété P154 de Wikidata contient le fichier officiel du logo. Le nom du fichier est ensuite résolu via l'API `imageinfo` de Wikimedia Commons pour obtenir l'URL de la miniature. Si aucun P154 n'existe mais que l'entité est identifiée comme une organisation/produit (P31 ∈ liste blanche), un fallback vers `pageimages` est tenté.

**Règle de rejet des noms ambigus :**

Certains noms de produits ou d'organisations correspondent à des articles Wikipedia hors-scope. Pour éviter d'afficher une image incorrecte (ex. portrait d'une personne pour un produit IA, photo d'un manuscrit pour un logiciel), l'entité Wikidata trouvée est rejetée — et le placeholder initiales est affiché — si :

- son P31 (« instance de ») appartient aux types disqualifiants : `Q5` (humain), `Q202444` (prénom), `Q101352` (nom de famille), `Q4167410` (homonymie)
- son P31 est absent ou n'inclut aucun type compatible (entreprise, logiciel, organisation…)

Exemples de noms correctement filtrés vers le placeholder : *Claude* (prénom français), *Codex* (manuscrit médiéval), *Word* (mot du dictionnaire), *Gemini* (signe du zodiaque).

Les images acceptées sont mises en cache dans `data/images_cache.json` (TTL illimité). Supprimer ce fichier pour forcer un re-téléchargement complet.

---

## 7. Panneau de détail d'une entité

**Accès** : cliquer sur n'importe quelle entité dans les trois vues (Liste, Carte, Galerie).

![Panneau de détail — Digital Services Act](Screen-captures/WWUD.ai-Viewer-entity-detail.png)

Le panneau latéral affiche la liste de tous les articles mentionnant l'entité sélectionnée, avec :

- **Date** et **source** de l'article
- **Extrait** du résumé IA (début du champ `Résumé`)
- **Lien « Lire »** vers l'URL originale de l'article

### Actions disponibles

| Bouton | Action |
| --- | --- |
| **Générer un rapport** | Soumet les articles filtrés à l'API EurIA et télécharge un rapport Markdown thématique |
| **Exporter JSON** | Télécharge un fichier JSON contenant uniquement les articles mentionnant cette entité |

Ces deux exports permettent d'approfondir l'analyse sur un acteur précis — par exemple, générer un rapport sur toutes les mentions d'une organisation sur une période donnée.

---

## 8. Données techniques

### Fichiers impliqués

| Fichier / Module | Rôle |
| --- | --- |
| `scripts/enrich_entities.py` | Extraction NER a posteriori sur tous les articles |
| `scripts/get-keyword-from-rss.py` | Extraction NER intégrée lors de la collecte quotidienne |
| `utils/api_client.py` — `generate_entities()` | Client EurIA pour l'extraction NER |
| `viewer/app.py` — `/api/entities` | Agrégation cross-fichiers des entités (comptage, top par type) |
| `viewer/app.py` — `/api/entities/geocode` | Géocodage Wikipedia des entités GPE/LOC |
| `viewer/app.py` — `/api/entities/images` | Images Wikipedia/Wikidata pour la galerie |
| `viewer/app.py` — `/api/entities/articles` | Articles filtrés par entité (panneau de détail) |
| `viewer/src/components/EntityDashboard.jsx` | Composant React principal (statistiques + toggles) |
| `viewer/src/components/EntityWorldMap.jsx` | Carte interactive (react-leaflet + OpenStreetMap) |
| `viewer/src/components/EntityGallery.jsx` | Galerie d'images avec placeholders |
| `viewer/src/components/EntityArticlePanel.jsx` | Panneau de détail avec export |
| `data/geocode_cache.json` | Cache coordonnées Wikipedia (TTL illimité) |
| `data/images_cache.json` | Cache images Wikimedia (TTL illimité) |

### Performances et limites

- **Volume typique** : jusqu'à 50 entités par type sont affichées dans les vues Carte et Galerie
- **Batchs Wikimedia** : 50 entités par requête (Wikipedia, Wikidata, Commons)
- **Timeout API Wikimedia** : 10 s par requête
- **Couverture images** : variable selon la notoriété des entités — les personnalités mondiales et grandes entreprises tech ont quasi-systématiquement une image ; les entités locales ou récentes peuvent en manquer
- **Couverture géocodage** : limitée aux entités ayant une page Wikipedia avec coordonnées — les zones géographiques abstraites (« Europe », « Occident ») ne sont pas géolocalisables

### Caches et invalidation

```bash
# Forcer le re-géocodage de toutes les entités
docker exec analyse-actualites rm -f /app/data/geocode_cache.json

# Forcer le re-téléchargement de toutes les images
docker exec analyse-actualites rm -f /app/data/images_cache.json
```
