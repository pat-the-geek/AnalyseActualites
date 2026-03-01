# Prompts EurIA — WUDD.ai

> Documentation complète des prompts utilisés avec l'API EurIA (Qwen3)
> Dernière mise à jour : 28 février 2026

---

## Vue d'ensemble

Le projet utilise l'API EurIA d'Infomaniak (modèle Qwen3) pour trois opérations :

1. **Résumé d'article** — synthèse d'un texte HTML extrait, max 20 lignes
2. **Rapport synthétique** — rapport Markdown structuré à partir d'un JSON d'articles
3. **Extraction d'entités NER** — identification des entités nommées dans un résumé (18 types)

Toutes les opérations passent par `utils/api_client.py` via la méthode centrale `ask()`.

---

## Cycle de vie des prompts

```mermaid
flowchart TD
    subgraph P1["📝 Prompt 1 — Résumé d'article"]
        A1([Article HTML]) --> B1[Extraction BeautifulSoup]
        B1 --> C1[Nettoyage + troncature 15 000 chars]
        C1 --> D1[Assemblage prompt résumé]
        D1 --> E1{Appel API EurIA\ntimeout 60s}
        E1 -->|✅ Succès| F1[Résumé JSON\n≤ 20 lignes]
        E1 -->|❌ Erreur| G1{Tentative ≤ 3 ?}
        G1 -->|Oui| E1
        G1 -->|Non| H1[RuntimeError → article ignoré]
        F1 --> I1[(articles_generated_...json)]
    end

    subgraph P2["📊 Prompt 2 — Rapport synthétique"]
        A2([JSON articles]) --> B2[Sérialisation JSON]
        B2 --> C2[Assemblage prompt rapport]
        C2 --> D2{Appel API EurIA\ntimeout 300s}
        D2 -->|✅ Succès| E2[Rapport Markdown\npar catégories + images]
        D2 -->|❌ Erreur| F2{Tentative ≤ 3 ?}
        F2 -->|Oui| D2
        F2 -->|Non| G2[RuntimeError → rapport ignoré]
        E2 --> H2[(rapports/markdown/...md)]
    end

    subgraph P3["🏷️ Prompt 3 — Entités NER"]
        A3([Résumé article]) --> B3[Assemblage prompt NER]
        B3 --> C3{Appel API EurIA\ntimeout 60s}
        C3 -->|✅ Succès| D3[JSON entities\n18 types]
        C3 -->|❌ Erreur| E3{Tentative ≤ 3 ?}
        E3 -->|Oui| C3
        E3 -->|Non| F3[RuntimeError → article ignoré]
        D3 --> G3[(entities dans article JSON)]
    end

    P1 --> P2
    P1 --> P3
```

---

## Configuration API

### Endpoint

```
https://api.infomaniak.com/euria/v1/chat/completions
```

### Authentification

```http
Authorization: Bearer {bearer}
Content-Type: application/json
```

> La variable d'environnement est `bearer` (minuscules) — voir `.env.example`.

### Paramètres de base

```json
{
  "messages": [
    {
      "content": "Prompt...",
      "role": "user"
    }
  ],
  "model": "qwen3",
  "enable_web_search": true
}
```

---

## Prompt 1 : Résumé d'article

### Contexte d'utilisation

- **Méthode** : `APIClient.generate_summary(text, max_lines, language, timeout)`
- **Fichier** : `utils/api_client.py`
- **Appelé par** : `scripts/Get_data_from_JSONFile_AskSummary_v2.py`, `scripts/get-keyword-from-rss.py`, `scripts/repair_failed_summaries.py`
- **Objectif** : Résumer le contenu HTML extrait d'un article (max 20 lignes, en français)

### Template du prompt

```python
text_truncated = text[:15000]
prompt = (
    f"Faire un résumé de ce texte sur maximum {max_lines} lignes en {language}, "
    f"ne donne que le résumé, sans commentaire ni remarque : {text_truncated}"
)
```

### Paramètres techniques

| Paramètre | Valeur | Justification |
| --- | --- | --- |
| **Timeout** | 60s | Suffisant pour résumé d'un article |
| **Max attempts** | 3 | Retry avec backoff exponentiel (2s, 4s) |
| **enable_web_search** | True | Enrichissement contextuel possible |
| **Langue** | Français (`fr`) | Sources majoritairement francophones |
| **Troncature** | 15 000 chars | Limite de tokens de l'API |

### Variables d'entrée

- **`text`** : Texte brut extrait via BeautifulSoup (HTML stripped)
  - Longueur : variable, tronquée à 15 000 chars avant envoi
- **`max_lines`** : Nombre maximum de lignes (défaut : 20)
- **`language`** : Langue du résumé (défaut : `"français"`)

### Sortie attendue

```
Résumé concis de l'article en français, maximum 20 lignes,
sans commentaire ni remarque de l'IA.
```

### Comportement en cas d'erreur

`ask()` lève `RuntimeError` après épuisement des tentatives. Les callers catchent cette exception et ignorent l'article (pas de résumé vide sauvegardé en JSON).

```python
try:
    resume = api_client.generate_summary(text, max_lines=20)
except RuntimeError as e:
    logger.warning(f"Résumé impossible pour '{url}' : {e}")
    continue  # Article ignoré
```

---

## Prompt 2 : Rapport synthétique

### Contexte d'utilisation

- **Méthode** : `APIClient.generate_report(json_content, filename, timeout)`
- **Fichier** : `utils/api_client.py`
- **Appelé par** : `scripts/Get_data_from_JSONFile_AskSummary_v2.py`, `scripts/generate_keyword_reports.py`
- **Objectif** : Créer un rapport Markdown structuré à partir d'un fichier JSON d'articles

### Template du prompt

```python
prompt = f"""
Analyse le fichier ce fichier JSON et fait une synthèse des actualités.
Affiche la date de publication et les sources lorsque tu cites un article.
Groupe les articles par catégories que tu auras identifiées.
En fin de synthèse fait un tableau avec les références (date de publication, sources et URL).
Pour chaque article dans la rubrique "Images" il y a des liens d'images.
Lorsque cela est possible, publie le lien de l'image sous la forme <img src='URL' />
sur une nouvelle ligne en fin de paragraphe de catégorie.
N'utilise qu'une image par paragraphe et assure-toi qu'une même URL d'image
n'apparaisse qu'une seule fois dans tout le rapport.

Filename: {filename}
File contents:
----- BEGIN FILE CONTENTS -----
{json_content}
----- END FILE CONTENTS -----
"""
```

### Paramètres techniques

| Paramètre | Valeur | Justification |
| --- | --- | --- |
| **Timeout** | 300s (5 min) | Traitement de nombreux articles |
| **Max attempts** | 3 | Retry avec backoff exponentiel |
| **enable_web_search** | True | Enrichissement contextuel |
| **Langue** | Français | Rapport destiné à utilisateurs francophones |

### Variables d'entrée

- **`json_content`** : Contenu JSON sérialisé (tableau d'articles)
- **`filename`** : Nom du fichier source (pour contextualiser le rapport)

Structure attendue du JSON d'entrée :

```json
[
  {
    "Date de publication": "23/01/2026",
    "Sources": "TechCrunch",
    "URL": "https://...",
    "Résumé": "...",
    "Images": [{ "URL": "https://...", "Width": 1200, "Height": 800 }],
    "entities": {
      "PERSON": ["Sam Altman"],
      "ORG": ["OpenAI"]
    }
  }
]
```

### Sortie attendue

```markdown
# Synthèse des actualités du 1er au 31 janvier 2026

## Intelligence Artificielle

Le 15 janvier 2026, **TechCrunch** rapporte...

<img src='https://exemple.com/image.jpg' />

## Tableau des références

| Date | Source | URL |
| --- | --- | --- |
| 2026-01-15 | TechCrunch | https://... |
```

---

## Prompt 3 : Extraction d'entités NER

- **Méthode** : `APIClient.generate_entities(resume, timeout)`
- **Fichier** : `utils/api_client.py`
- **Appelé par** : `scripts/enrich_entities.py`, `scripts/get-keyword-from-rss.py`
- **Objectif** : Extraire les entités nommées (personnes, organisations, lieux, produits…) d'un résumé

### Prompt NER

```python
prompt = (
    "Extrait les entités nommées du texte suivant et retourne un objet JSON "
    "avec les clés : PERSON, ORG, GPE, LOC, PRODUCT, EVENT, LAW, DATE, TIME, "
    "MONEY, PERCENT, QUANTITY, CARDINAL, ORDINAL, NORP, FAC, WORK_OF_ART, LANGUAGE. "
    "Chaque clé doit contenir une liste de chaînes (peut être vide []). "
    "Retourne UNIQUEMENT le JSON, sans explication ni balise markdown.\n\n"
    f"Texte : {resume}"
)
```

### Configuration NER

| Paramètre | Valeur | Justification |
| --- | --- | --- |
| **Timeout** | 60s | Résumé court, réponse rapide |
| **Max attempts** | 3 | Retry avec backoff exponentiel |
| **enable_web_search** | True | Paramètre global de la session |
| **Format sortie** | JSON strict | Parsé avec `json.loads()` |

### Les 18 types d'entités

Les types suivent la norme **OntoNotes 5.0** (UPenn / BBN / USC ISI), popularisée par spaCy — voir [ENTITIES.md §3](ENTITIES.md#3-les-18-types-dentités-reconnus) et [EXTERNAL_SERVICES.md §2](EXTERNAL_SERVICES.md#2-infomaniak-euria-llm) pour le détail de la norme et son statut légal.

| Type | Description | Exemples |
| --- | --- | --- |
| `PERSON` | Personnes physiques | Sam Altman, Emmanuel Macron |
| `ORG` | Organisations, entreprises | OpenAI, Infomaniak, ONU |
| `GPE` | Entités géopolitiques (pays, villes) | France, Paris, États-Unis |
| `LOC` | Lieux géographiques non-GPE | Alpes, Atlantique |
| `PRODUCT` | Produits, technologies | ChatGPT, iPhone 16, Qwen3 |
| `EVENT` | Événements | CES 2026, Davos |
| `LAW` | Lois, réglements | RGPD, AI Act |
| `DATE` | Expressions de date | 15 janvier 2026, Q1 2026 |
| `TIME` | Expressions d'heure | 14h00, ce matin |
| `MONEY` | Montants financiers | 110 milliards $, 50 M€ |
| `PERCENT` | Pourcentages | 13 %, hausse de 40% |
| `QUANTITY` | Quantités avec unité | 500 MW, 3 To |
| `CARDINAL` | Nombres cardinaux | cinq, 1000 |
| `ORDINAL` | Nombres ordinaux | premier, 3e |
| `NORP` | Nationalités, groupes politiques/religieux | Européens, Républicains |
| `FAC` | Sites, bâtiments, infrastructures | Tour Eiffel, Pentagone |
| `WORK_OF_ART` | Œuvres artistiques | Mona Lisa, Starship |
| `LANGUAGE` | Langues | français, mandarin |

### Format de sortie NER

```json
{
  "PERSON": ["Sam Altman", "Dario Amodei"],
  "ORG": ["OpenAI", "Anthropic"],
  "GPE": ["États-Unis"],
  "LOC": [],
  "PRODUCT": ["ChatGPT", "Claude"],
  "EVENT": [],
  "LAW": [],
  "DATE": ["février 2026"],
  "TIME": [],
  "MONEY": ["110 milliards $"],
  "PERCENT": [],
  "QUANTITY": [],
  "CARDINAL": [],
  "ORDINAL": [],
  "NORP": [],
  "FAC": [],
  "WORK_OF_ART": [],
  "LANGUAGE": []
}
```

### Intégration dans le JSON article

```json
{
  "Date de publication": "28/02/2026",
  "Sources": "Le Monde",
  "URL": "https://...",
  "Résumé": "...",
  "entities": {
    "PERSON": ["Sam Altman"],
    "ORG": ["OpenAI"],
    "GPE": ["États-Unis"],
    "PRODUCT": ["ChatGPT"]
  }
}
```

---

## Gestion des erreurs

### Implémentation actuelle (`utils/api_client.py`)

```python
def ask(self, prompt: str, timeout: int = 60) -> str:
    last_error = ""
    for attempt in range(self.max_attempts):
        try:
            response = requests.post(self.url, json=data, headers=headers, timeout=timeout)
            response.raise_for_status()
            return response.json()['choices'][0]['message']['content'].strip()
        except requests.exceptions.Timeout:
            last_error = f"Timeout après {timeout}s"
            if attempt < self.max_attempts - 1:
                time.sleep(2 ** attempt)  # Backoff exponentiel
        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response is not None else 'inconnu'
            last_error = f"Erreur HTTP {status}"
            return  # Pas de retry sur erreur HTTP
        except requests.exceptions.RequestException as e:
            last_error = str(e)
            if attempt < self.max_attempts - 1:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Échec API après {self.max_attempts} tentatives. {last_error}")
```

> **Important** : `if e.response is not None` (et non `if e.response`) — `bool(requests.Response)` retourne `False` pour tout code HTTP ≥ 400, ce qui masquerait le code d'erreur réel.

### Comportement des callers

Les scripts catchent `RuntimeError` et ignorent l'article concerné :

```python
try:
    resume = api_client.generate_summary(text)
except RuntimeError as e:
    logger.warning(f"Résumé impossible : {e}")
    continue  # Article ignoré, pas de résumé vide en JSON
```

---

## Métriques et performance

### Temps de réponse observés

| Opération | Temps moyen | Temps max (timeout) |
| --- | --- | --- |
| Résumé d'article | 8–12s | 60s |
| Génération de rapport | 30–90s | 300s |
| Extraction NER | 5–10s | 60s |

### Tokens estimés

| Opération | Tokens entrée | Tokens sortie |
| --- | --- | --- |
| Résumé (article 5 000 chars) | ~1 500 | ~300 |
| Résumé (article 15 000 chars) | ~4 500 | ~300 |
| Rapport (50 articles) | ~15 000 | ~2 000 |
| NER (résumé 500 chars) | ~200 | ~150 |

---

## Bonnes pratiques

### À faire

1. Pré-nettoyer le texte avant envoi (supprimer HTML, normaliser espaces)
2. Respecter la troncature à 15 000 chars avant `generate_summary()`
3. Vérifier la sortie NER avec `json.loads()` — la réponse doit être du JSON pur
4. Logger les erreurs API avec le code HTTP pour diagnostic
5. Utiliser `get_config()` pour les timeouts — ne pas hardcoder

### À éviter

1. Envoyer du HTML brut (extraire le texte d'abord avec BeautifulSoup)
2. Sauvegarder en JSON un résumé contenant un message d'erreur
3. Utiliser `if e.response` (falsy pour HTTP ≥ 400) — toujours `if e.response is not None`
4. Ignorer les `RuntimeError` sans logger le contexte

---

## Références

- [API EurIA Infomaniak](https://euria.infomaniak.com)
- [Qwen3 Model Documentation](https://huggingface.co/Qwen)

---

**Auteur** : Patrick Ostertag
**Email** : patrick.ostertag@gmail.com
**Dernière mise à jour** : 28 février 2026
