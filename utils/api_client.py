"""Module client API pour l'interaction avec EurIA d'Infomaniak.

Fournit une interface robuste pour envoyer des prompts à l'API EurIA
avec retry automatique et gestion d'erreurs avancée.
"""

import json
import re
import time
import requests
from typing import Optional
from .logging import default_logger
from .config import get_config

# ── Extraction d'entités nommées (NER) ───────────────────────────────────────

_PROMPT_ENTITIES = """Tu es un extracteur d'entités nommées (NER). Analyse le texte suivant et extrait toutes les entités nommées.

Retourne UNIQUEMENT un objet JSON valide, sans aucun commentaire ni texte avant ou après.
Omets les catégories qui ne contiennent aucune entité.
Chaque valeur est un tableau de chaînes dédupliquées.

Catégories :
- PERSON : personnes physiques nommées
- NORP : nationalités, groupes religieux ou politiques
- ORG : organisations, entreprises, institutions
- GPE : pays, villes, régions géopolitiques
- LOC : lieux géographiques non géopolitiques
- FAC : bâtiments, aéroports, monuments nommés
- PRODUCT : produits, services, technologies nommés
- EVENT : événements nommés (conférences, sommets, crises…)
- WORK_OF_ART : titres d'œuvres (livres, films, rapports…)
- LAW : lois, règlements, articles de loi nommés
- LANGUAGE : langues nommées
- DATE : dates et périodes explicites
- TIME : heures et moments de la journée
- PERCENT : pourcentages et fractions
- MONEY : montants monétaires
- QUANTITY : quantités mesurables
- ORDINAL : ordinaux (premier, troisième…)
- CARDINAL : nombres cardinaux significatifs

Texte à analyser :
{resume}"""

_ENTITY_TYPES = [
    "PERSON", "NORP", "ORG", "GPE", "LOC", "FAC",
    "PRODUCT", "EVENT", "WORK_OF_ART", "LAW", "LANGUAGE",
    "DATE", "TIME", "PERCENT", "MONEY", "QUANTITY", "ORDINAL", "CARDINAL",
]


def _parse_entities_response(raw: str) -> dict:
    """Extrait un dict d'entités depuis une réponse brute de l'API.

    Gère les blocs ```json … ```, les balises <think>…</think> (Qwen3)
    et les réponses contenant du texte parasite autour du JSON.
    Retourne {} si l'extraction échoue.
    """
    # Supprimer les blocs <think>…</think>
    text = re.sub(r"<think>[\s\S]*?</think>", "", raw, flags=re.IGNORECASE).strip()

    # Extraire le contenu d'un bloc ```json … ``` ou ``` … ```
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()

    # Tentative de parsing direct
    try:
        raw_entities = json.loads(text)
    except json.JSONDecodeError:
        # Dernier recours : extraire le premier objet JSON du texte
        obj_match = re.search(r"\{[\s\S]*\}", text)
        if not obj_match:
            default_logger.warning("Impossible d'extraire du JSON depuis la réponse NER")
            return {}
        try:
            raw_entities = json.loads(obj_match.group(0))
        except json.JSONDecodeError:
            default_logger.warning("JSON NER invalide après extraction")
            return {}

    if not isinstance(raw_entities, dict):
        return {}

    # Normaliser : garder uniquement les types connus, dédupliquer
    result = {}
    for etype in _ENTITY_TYPES:
        values = raw_entities.get(etype, [])
        if not isinstance(values, list):
            continue
        seen: set[str] = set()
        dedup = []
        for v in values:
            if isinstance(v, str) and v.strip() and v.strip() not in seen:
                seen.add(v.strip())
                dedup.append(v.strip())
        if dedup:
            result[etype] = dedup

    return result


_SENTIMENT_VALUES = {"positif", "neutre", "négatif"}
_TON_VALUES = {"factuel", "alarmiste", "promotionnel", "critique", "analytique"}


def _parse_sentiment_response(raw: str) -> dict:
    """Extrait un dict sentiment/ton depuis une réponse brute de l'API."""
    text = re.sub(r"<think>[\s\S]*?</think>", "", raw, flags=re.IGNORECASE).strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        obj = re.search(r"\{[\s\S]*\}", text)
        if not obj:
            return {}
        try:
            data = json.loads(obj.group(0))
        except json.JSONDecodeError:
            return {}
    if not isinstance(data, dict):
        return {}
    result = {}
    sentiment = str(data.get("sentiment", "")).strip().lower()
    if sentiment in _SENTIMENT_VALUES:
        result["sentiment"] = sentiment
    score_s = data.get("score_sentiment")
    if isinstance(score_s, (int, float)) and 1 <= score_s <= 5:
        result["score_sentiment"] = int(score_s)
    ton = str(data.get("ton_editorial", "")).strip().lower()
    if ton in _TON_VALUES:
        result["ton_editorial"] = ton
    score_t = data.get("score_ton")
    if isinstance(score_t, (int, float)) and 1 <= score_t <= 5:
        result["score_ton"] = int(score_t)
    return result


class EurIAClient:
    """Client pour l'API EurIA (Qwen3) d'Infomaniak.
    
    Gère les requêtes vers l'API avec retry automatique, timeouts configurables,
    et validation des réponses.
    
    Attributes:
        url: URL de l'endpoint API
        headers: Headers HTTP incluant l'authentification
        model: Nom du modèle IA à utiliser
        enable_web_search: Active la recherche web pour le contexte
    """
    
    def __init__(
        self,
        url: Optional[str] = None,
        bearer: Optional[str] = None,
        model: str = "qwen3",
        enable_web_search: bool = True
    ):
        """Initialise le client API.
        
        Args:
            url: URL de l'API (utilise la config si None)
            bearer: Token d'authentification (utilise la config si None)
            model: Nom du modèle IA à utiliser (défaut: qwen3)
            enable_web_search: Active la recherche web (défaut: True)
        """
        config = get_config()
        
        self.url = url or config.url
        self.bearer = bearer or config.bearer
        self.model = model
        self.enable_web_search = enable_web_search
        
        self.headers = {
            'Authorization': f'Bearer {self.bearer}',
            'Content-Type': 'application/json',
        }
        
        if not self.url or not self.bearer:
            raise ValueError("URL et bearer token requis pour le client API")
    
    def ask(
        self,
        prompt: str,
        max_attempts: int = 3,
        timeout: int = 60,
        backoff_factor: float = 2.0,
        max_tokens: Optional[int] = None
    ) -> str:
        """Envoie un prompt à l'API EurIA et retourne la réponse.
        
        Cette fonction interroge l'API EurIA avec retry automatique en cas d'échec.
        Un backoff exponentiel est appliqué entre les tentatives.
        
        Args:
            prompt: Le texte du prompt à envoyer à l'API
            max_attempts: Nombre maximal de tentatives en cas d'échec (défaut: 3)
            timeout: Délai d'attente maximal en secondes pour chaque requête (défaut: 60)
            backoff_factor: Facteur multiplicateur pour le backoff entre tentatives (défaut: 2.0)
            max_tokens: Nombre maximal de tokens en sortie (None = valeur par défaut de l'API)
        
        Returns:
            La réponse textuelle de l'API, nettoyée des espaces superflus.
            En cas d'échec après toutes les tentatives, retourne un message d'erreur.
        
        Example:
            >>> client = EurIAClient()
            >>> reponse = client.ask("Résume cet article: ...")
            >>> print(reponse)
        """
        if not prompt or not isinstance(prompt, str):
            default_logger.error("Prompt invalide ou vide")
            return "Erreur: Prompt invalide"
        
        data = {
            "messages": [{"content": prompt, "role": "user"}],
            "model": self.model,
            "enable_web_search": self.enable_web_search
        }
        if max_tokens is not None:
            data["max_tokens"] = max_tokens
        
        last_error = None
        
        for attempt in range(max_attempts):
            try:
                default_logger.info(
                    f"Envoi de prompt à l'API (tentative {attempt + 1}/{max_attempts}, "
                    f"timeout={timeout}s)"
                )
                
                response = requests.post(
                    self.url,
                    json=data,
                    headers=self.headers,
                    timeout=timeout
                )
                response.raise_for_status()
                json_data = response.json()
                
                # Valider la structure de la réponse
                if 'choices' not in json_data or len(json_data['choices']) == 0:
                    raise ValueError("Réponse API invalide : champ 'choices' manquant ou vide")
                
                content = json_data['choices'][0]['message']['content']
                
                if not content:
                    raise ValueError("Réponse API vide")
                
                default_logger.info(f"Réponse reçue de l'API: {len(content)} caractères")
                return content.strip()
            
            except requests.exceptions.Timeout as e:
                last_error = f"Timeout après {timeout}s"
                default_logger.warning(
                    f"Timeout lors de la tentative {attempt + 1}/{max_attempts}"
                )
                
            except requests.exceptions.HTTPError as e:
                status_code = e.response.status_code if e.response is not None else 'inconnu'
                last_error = f"Erreur HTTP {status_code}"
                default_logger.error(
                    f"Erreur HTTP {status_code} lors de la tentative {attempt + 1}/{max_attempts}"
                )
                
                # Ne pas retry pour certains codes d'erreur
                if status_code in [400, 401, 403, 404]:
                    default_logger.error("Erreur non récupérable, arrêt des tentatives")
                    break
                
            except requests.exceptions.ConnectionError as e:
                last_error = "Erreur de connexion"
                default_logger.error(
                    f"Erreur de connexion lors de la tentative {attempt + 1}/{max_attempts}: {e}"
                )
                
            except (ValueError, KeyError, TypeError) as e:
                last_error = f"Erreur de format de réponse: {e}"
                default_logger.error(
                    f"Erreur de parsing de la réponse lors de la tentative "
                    f"{attempt + 1}/{max_attempts}: {e}"
                )
            
            except Exception as e:
                last_error = f"Erreur inattendue: {type(e).__name__}: {e}"
                default_logger.error(
                    f"Erreur inattendue lors de la tentative {attempt + 1}/{max_attempts}: {e}"
                )
            
            # Backoff exponentiel avant la prochaine tentative
            if attempt < max_attempts - 1:
                wait_time = backoff_factor ** attempt
                default_logger.info(f"Attente de {wait_time:.1f}s avant nouvelle tentative...")
                time.sleep(wait_time)
        
        # Toutes les tentatives ont échoué
        error_message = (
            f"Échec après {max_attempts} tentatives. "
            f"Dernière erreur: {last_error}"
        )
        default_logger.error(error_message)

        raise RuntimeError(f"Échec API après {max_attempts} tentatives. {last_error}")
    
    def generate_summary(
        self,
        text: str,
        max_lines: int = 20,
        language: str = "français",
        timeout: int = 60
    ) -> str:
        """Génère un résumé d'un texte via l'API IA.
        
        Args:
            text: Le texte à résumer
            max_lines: Nombre maximal de lignes pour le résumé (défaut: 20)
            language: Langue du résumé (défaut: français)
            timeout: Timeout en secondes (défaut: 60)
        
        Returns:
            Le résumé généré par l'IA
        """
        # Tronquer le texte à 15 000 chars pour rester dans les limites de l'API
        text_truncated = text[:15000]
        prompt = (
            f"Faire un résumé de ce texte sur maximum {max_lines} lignes en {language}, "
            f"ne donne que le résumé, sans commentaire ni remarque : {text_truncated}"
        )
        return self.ask(prompt, timeout=timeout)
    
    def generate_entities(
        self,
        resume: str,
        timeout: int = 60
    ) -> dict:
        """Extrait les entités nommées (NER) d'un texte via l'API IA.

        Args:
            resume: Texte à analyser (typiquement le champ "Résumé" d'un article)
            timeout: Timeout en secondes (défaut : 60)

        Returns:
            Dictionnaire { type_entité: [valeur, …] }.
            Retourne {} silencieusement en cas d'échec (ne bloque pas le pipeline).
        """
        if not resume or not isinstance(resume, str) or not resume.strip():
            return {}

        prompt = _PROMPT_ENTITIES.format(resume=resume.strip())
        try:
            raw = self.ask(prompt, max_attempts=3, timeout=timeout, max_tokens=800)
            return _parse_entities_response(raw)
        except Exception as e:
            default_logger.warning(f"Extraction NER échouée : {e}")
            return {}

    def generate_sentiment(
        self,
        resume: str,
        timeout: int = 30
    ) -> dict:
        """Analyse le sentiment et le ton éditorial d'un article.

        Args:
            resume  : Résumé ou texte de l'article (champ "Résumé")
            timeout : Timeout en secondes (défaut: 30)

        Returns:
            {
              "sentiment"     : "positif" | "neutre" | "négatif",
              "score_sentiment": int 1-5  (1=très négatif, 3=neutre, 5=très positif),
              "ton_editorial" : "factuel" | "alarmiste" | "promotionnel" | "critique" | "analytique",
              "score_ton"     : int 1-5  (1=très biaisé, 5=très factuel)
            }
            Retourne {} silencieusement si l'analyse échoue.
        """
        if not resume or not isinstance(resume, str) or not resume.strip():
            return {}

        prompt = (
            "Analyse le ton et le sentiment de ce texte journalistique. "
            "Réponds UNIQUEMENT avec un objet JSON valide, sans commentaire ni texte autour.\n\n"
            "Champs attendus :\n"
            '- "sentiment" : une des valeurs exactes : "positif", "neutre", "négatif"\n'
            '- "score_sentiment" : entier entre 1 (très négatif) et 5 (très positif), 3=neutre\n'
            '- "ton_editorial" : une des valeurs exactes : "factuel", "alarmiste", "promotionnel", "critique", "analytique"\n'
            '- "score_ton" : entier entre 1 (très biaisé/sensationnaliste) et 5 (très factuel/neutre)\n\n'
            f"Texte :\n{resume.strip()[:3000]}"
        )
        try:
            raw = self.ask(prompt, max_attempts=2, timeout=timeout, max_tokens=150)
            return _parse_sentiment_response(raw)
        except Exception as e:
            default_logger.warning(f"Analyse sentiment échouée : {e}")
            return {}

    def synthesize_topic(
        self,
        topic: str,
        articles: list,
        timeout: int = 120,
    ) -> str:
        """Génère une synthèse comparative multi-sources sur un sujet ou une entité.

        Construit un prompt consolidé depuis N résumés d'articles et demande à
        Qwen3 une analyse structurée : convergences, divergences, sources favorables/critiques.

        Args:
            topic    : Sujet ou entité centrale (ex: "OpenAI", "Emmanuel Macron")
            articles : Liste de dicts article avec au moins "Résumé", "Sources", "Date de publication"
            timeout  : Timeout en secondes (défaut: 120)

        Returns:
            Texte Markdown de la synthèse.
        """
        if not articles:
            return "Aucun article disponible pour cette synthèse."

        # Construire le bloc source
        sources_block = ""
        for i, a in enumerate(articles[:20], 1):  # Limiter à 20 articles
            source = a.get("Sources", "Source inconnue")
            date = a.get("Date de publication", "")
            resume = (a.get("Résumé") or "")[:800]
            sources_block += f"\n--- Article {i} ({source}, {date}) ---\n{resume}\n"

        prompt = (
            f"Tu es un analyste de presse. Voici {len(articles[:20])} articles de sources différentes "
            f"traitant du sujet : **{topic}**.\n\n"
            "Génère une synthèse comparative structurée en Markdown comprenant :\n"
            "1. **Résumé de la situation** (2-3 phrases)\n"
            "2. **Points de convergence** entre les sources\n"
            "3. **Points de divergence ou contradictions**\n"
            "4. **Positionnement éditorial** : quelles sources sont favorables, neutres ou critiques\n"
            "5. **Éléments clés manquants** (ce que les articles ne couvrent pas)\n\n"
            "Cite les sources (nom + date) à chaque point. Sois concis et factuel.\n\n"
            f"Articles :\n{sources_block}"
        )
        return self.ask(prompt, max_attempts=2, timeout=timeout)

    def generate_report(
        self,
        json_content: str,
        filename: str,
        timeout: int = 300
    ) -> str:
        """Génère un rapport synthétique à partir de données JSON.

        Args:
            json_content: Contenu JSON des articles
            filename: Nom du fichier source
            timeout: Timeout en secondes (défaut: 300)

        Returns:
            Rapport formaté en Markdown
        """
        prompt = f"""
Analyse le fichier ce fichier JSON et fait une synthèse des actualités.
Affiche la date de publication et les sources lorsque tu cites un article.
Groupe les articles par catégories que tu auras identifiées.
En fin de synthèse fait un tableau avec les références (date de publication, sources et URL)
pour chaque article dans la rubrique "Images" il y a des liens d'images.
Lorsque cela est possible, publie le lien de l'image sous la forme <img src='{{URL}}' /> sur une nouvelle ligne en fin de paragraphe de catégorie. N'utilise qu'une image par paragraphe et assure-toi qu'une même URL d'image n'apparaisse qu'une seule fois dans tout le rapport.

Filename: {filename}
File contents:
----- BEGIN FILE CONTENTS -----
{json_content}
----- END FILE CONTENTS -----
"""
        return self.ask(prompt, max_attempts=3, timeout=timeout)


# ── Client Anthropic Claude ───────────────────────────────────────────────────

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"


class ClaudeClient:
    """Client pour l'API Anthropic Claude.

    Utilise deux modèles distincts selon le type de tâche :
    - model_batch     (Haiku) : tâches volumineuses — résumé, NER, sentiment
    - model_synthesis (Sonnet): synthèses user-facing — rapport, RAG, encyclopédique

    Fournit les mêmes méthodes publiques qu'EurIAClient pour une substituabilité totale.
    """

    def __init__(self, api_key: Optional[str] = None):
        config = get_config()
        self.api_key = api_key or config.anthropic_api_key
        self.model_batch = config.claude_model_batch
        self.model_synthesis = config.claude_model_synthesis
        self.headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY requis pour le client Claude")

    def ask(
        self,
        prompt: str,
        model: Optional[str] = None,
        max_attempts: int = 3,
        timeout: int = 60,
        backoff_factor: float = 2.0,
        max_tokens: int = 2048,
    ) -> str:
        """Envoie un prompt à l'API Claude et retourne la réponse texte.

        Args:
            prompt      : Texte du prompt
            model       : Modèle à utiliser (None = model_synthesis par défaut)
            max_attempts: Nombre maximal de tentatives
            timeout     : Timeout en secondes
            backoff_factor: Facteur de backoff exponentiel
            max_tokens  : Nombre maximal de tokens en sortie (obligatoire pour Claude)

        Returns:
            Réponse texte nettoyée.

        Raises:
            RuntimeError: Après épuisement de toutes les tentatives.
        """
        if not prompt or not isinstance(prompt, str):
            default_logger.error("Prompt invalide ou vide")
            return "Erreur: Prompt invalide"

        active_model = model or self.model_synthesis
        data = {
            "model": active_model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        last_error = None

        for attempt in range(max_attempts):
            try:
                default_logger.info(
                    f"[Claude/{active_model}] Envoi prompt (tentative {attempt + 1}/{max_attempts}, "
                    f"timeout={timeout}s)"
                )
                response = requests.post(
                    CLAUDE_API_URL, json=data, headers=self.headers, timeout=timeout
                )
                response.raise_for_status()
                json_data = response.json()

                content_blocks = json_data.get("content", [])
                if not content_blocks:
                    raise ValueError("Réponse Claude vide (aucun bloc content)")
                content = content_blocks[0].get("text", "")
                if not content:
                    raise ValueError("Texte Claude vide")

                default_logger.info(f"[Claude] Réponse reçue : {len(content)} caractères")
                return content.strip()

            except requests.exceptions.Timeout:
                last_error = f"Timeout après {timeout}s"
                default_logger.warning(f"[Claude] Timeout tentative {attempt + 1}/{max_attempts}")

            except requests.exceptions.HTTPError as e:
                status_code = e.response.status_code if e.response is not None else "inconnu"
                last_error = f"Erreur HTTP {status_code}"
                default_logger.error(f"[Claude] Erreur HTTP {status_code}")
                if status_code in [400, 401, 403]:
                    break

            except requests.exceptions.ConnectionError as e:
                last_error = "Erreur de connexion"
                default_logger.error(f"[Claude] Erreur de connexion : {e}")

            except (ValueError, KeyError, TypeError) as e:
                last_error = f"Erreur de format de réponse: {e}"
                default_logger.error(f"[Claude] Erreur parsing : {e}")

            except Exception as e:
                last_error = f"Erreur inattendue: {type(e).__name__}: {e}"
                default_logger.error(f"[Claude] Erreur inattendue : {e}")

            if attempt < max_attempts - 1:
                wait_time = backoff_factor ** attempt
                default_logger.info(f"[Claude] Attente {wait_time:.1f}s avant prochaine tentative…")
                time.sleep(wait_time)

        raise RuntimeError(f"Échec Claude après {max_attempts} tentatives. {last_error}")

    def generate_summary(
        self,
        text: str,
        max_lines: int = 20,
        language: str = "français",
        timeout: int = 60,
    ) -> str:
        """Résumé d'article — utilise Haiku (tâche batch)."""
        text_truncated = text[:15000]
        prompt = (
            f"Faire un résumé de ce texte sur maximum {max_lines} lignes en {language}, "
            f"ne donne que le résumé, sans commentaire ni remarque : {text_truncated}"
        )
        return self.ask(prompt, model=self.model_batch, timeout=timeout, max_tokens=512)

    def generate_entities(self, resume: str, timeout: int = 60) -> dict:
        """Extraction NER — utilise Haiku (tâche batch)."""
        if not resume or not isinstance(resume, str) or not resume.strip():
            return {}
        prompt = _PROMPT_ENTITIES.format(resume=resume.strip())
        try:
            raw = self.ask(
                prompt, model=self.model_batch, max_attempts=3, timeout=timeout, max_tokens=800
            )
            return _parse_entities_response(raw)
        except Exception as e:
            default_logger.warning(f"[Claude] Extraction NER échouée : {e}")
            return {}

    def generate_sentiment(self, resume: str, timeout: int = 30) -> dict:
        """Sentiment & ton éditorial — utilise Haiku (tâche batch)."""
        if not resume or not isinstance(resume, str) or not resume.strip():
            return {}
        prompt = (
            "Analyse le ton et le sentiment de ce texte journalistique. "
            "Réponds UNIQUEMENT avec un objet JSON valide, sans commentaire ni texte autour.\n\n"
            "Champs attendus :\n"
            '- "sentiment" : une des valeurs exactes : "positif", "neutre", "négatif"\n'
            '- "score_sentiment" : entier entre 1 (très négatif) et 5 (très positif), 3=neutre\n'
            '- "ton_editorial" : une des valeurs exactes : "factuel", "alarmiste", "promotionnel", "critique", "analytique"\n'
            '- "score_ton" : entier entre 1 (très biaisé/sensationnaliste) et 5 (très factuel/neutre)\n\n'
            f"Texte :\n{resume.strip()[:3000]}"
        )
        try:
            raw = self.ask(
                prompt, model=self.model_batch, max_attempts=2, timeout=timeout, max_tokens=150
            )
            return _parse_sentiment_response(raw)
        except Exception as e:
            default_logger.warning(f"[Claude] Analyse sentiment échouée : {e}")
            return {}

    def synthesize_topic(self, topic: str, articles: list, timeout: int = 120) -> str:
        """Synthèse RAG multi-sources — utilise Sonnet (user-facing)."""
        if not articles:
            return "Aucun article disponible pour cette synthèse."
        sources_block = ""
        for i, a in enumerate(articles[:20], 1):
            source = a.get("Sources", "Source inconnue")
            date = a.get("Date de publication", "")
            resume = (a.get("Résumé") or "")[:800]
            sources_block += f"\n--- Article {i} ({source}, {date}) ---\n{resume}\n"
        prompt = (
            f"Tu es un analyste de presse. Voici {len(articles[:20])} articles de sources différentes "
            f"traitant du sujet : **{topic}**.\n\n"
            "Génère une synthèse comparative structurée en Markdown comprenant :\n"
            "1. **Résumé de la situation** (2-3 phrases)\n"
            "2. **Points de convergence** entre les sources\n"
            "3. **Points de divergence ou contradictions**\n"
            "4. **Positionnement éditorial** : quelles sources sont favorables, neutres ou critiques\n"
            "5. **Éléments clés manquants** (ce que les articles ne couvrent pas)\n\n"
            "Cite les sources (nom + date) à chaque point. Sois concis et factuel.\n\n"
            f"Articles :\n{sources_block}"
        )
        return self.ask(prompt, model=self.model_synthesis, max_attempts=2, timeout=timeout, max_tokens=2048)

    def generate_report(self, json_content: str, filename: str, timeout: int = 300) -> str:
        """Rapport synthétique Markdown — utilise Sonnet (user-facing)."""
        prompt = f"""
Analyse le fichier ce fichier JSON et fait une synthèse des actualités.
Affiche la date de publication et les sources lorsque tu cites un article.
Groupe les articles par catégories que tu auras identifiées.
En fin de synthèse fait un tableau avec les références (date de publication, sources et URL)
pour chaque article dans la rubrique "Images" il y a des liens d'images.
Lorsque cela est possible, publie le lien de l'image sous la forme <img src='{{URL}}' /> sur une nouvelle ligne en fin de paragraphe de catégorie. N'utilise qu'une image par paragraphe et assure-toi qu'une même URL d'image n'apparaisse qu'une seule fois dans tout le rapport.

Filename: {filename}
File contents:
----- BEGIN FILE CONTENTS -----
{json_content}
----- END FILE CONTENTS -----
"""
        return self.ask(prompt, model=self.model_synthesis, max_attempts=3, timeout=timeout, max_tokens=4096)


# ── Factory ───────────────────────────────────────────────────────────────────

def get_ai_client():
    """Retourne le client IA actif selon AI_PROVIDER dans .env.

    Returns:
        EurIAClient si AI_PROVIDER=euria (ou non défini),
        ClaudeClient si AI_PROVIDER=claude.
    """
    provider = get_config().ai_provider
    if provider == "claude":
        return ClaudeClient()
    return EurIAClient()
