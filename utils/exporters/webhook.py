"""Notifications webhook — Discord, Slack, Ntfy.

Envoie des alertes de tendance (ou tout message structuré) vers
les plateformes configurées dans .env.

Variables .env supportées :
  WEBHOOK_DISCORD   : URL webhook Discord
  WEBHOOK_SLACK     : URL webhook Slack (Incoming Webhooks)
  NTFY_URL          : URL Ntfy (ex: https://ntfy.sh/wudd-alerts)
  NTFY_TOKEN        : Token Ntfy (optionnel)

Usage :
    from utils.exporters.webhook import notify_alerts
    notify_alerts(alerts)  # alerts = liste retournée par trend_detector.py
"""

import json
import os
from typing import Optional

import requests

from ..logging import default_logger


# ── Helpers ───────────────────────────────────────────────────────────────────

_NIVEAU_EMOJI = {
    "critique": "🔴",
    "élevé": "🟠",
    "modéré": "🟡",
}

_ENTITY_TYPE_FR = {
    "PERSON": "Personne",
    "ORG": "Organisation",
    "GPE": "Lieu/Pays",
    "PRODUCT": "Produit",
    "EVENT": "Événement",
    "NORP": "Groupe",
    "LOC": "Lieu",
    "FAC": "Lieu",
}


def _format_alert_text(alert: dict) -> str:
    emoji = _NIVEAU_EMOJI.get(alert.get("niveau", "modéré"), "⚪")
    etype = _ENTITY_TYPE_FR.get(alert.get("entity_type", ""), alert.get("entity_type", ""))
    value = alert.get("entity_value", "")
    count_24h = alert.get("count_24h", 0)
    count_7j = alert.get("count_7j", 0)
    ratio = alert.get("ratio", 0)
    return f"{emoji} **{value}** ({etype}) — {count_24h} mentions/24h vs {count_7j}/7j · ratio {ratio}x"


# ── Discord ──────────────────────────────────────────────────────────────────

def send_discord(
    alerts: list,
    webhook_url: Optional[str] = None,
    title: str = "WUDD.ai · Tendances détectées",
    top_n: int = 10,
) -> bool:
    """Envoie les alertes vers un webhook Discord.

    Returns:
        True si l'envoi a réussi.
    """
    url = webhook_url or os.getenv("WEBHOOK_DISCORD", "")
    if not url:
        default_logger.debug("WEBHOOK_DISCORD non configuré — Discord ignoré")
        return False

    lines = [f"**{title}**", ""]
    for a in alerts[:top_n]:
        lines.append(_format_alert_text(a))

    payload = {"content": "\n".join(lines)}
    try:
        r = requests.post(url, json=payload, timeout=10)
        r.raise_for_status()
        default_logger.info(f"Notification Discord envoyée ({len(alerts[:top_n])} alertes)")
        return True
    except Exception as e:
        default_logger.warning(f"Erreur Discord : {e}")
        return False


# ── Slack ─────────────────────────────────────────────────────────────────────

def send_slack(
    alerts: list,
    webhook_url: Optional[str] = None,
    title: str = "WUDD.ai · Tendances détectées",
    top_n: int = 10,
) -> bool:
    """Envoie les alertes vers un webhook Slack Incoming Webhooks.

    Returns:
        True si l'envoi a réussi.
    """
    url = webhook_url or os.getenv("WEBHOOK_SLACK", "")
    if not url:
        default_logger.debug("WEBHOOK_SLACK non configuré — Slack ignoré")
        return False

    blocks = [
        {"type": "header", "text": {"type": "plain_text", "text": title}},
        {"type": "divider"},
    ]
    for a in alerts[:top_n]:
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": _format_alert_text(a)},
        })

    payload = {"blocks": blocks}
    try:
        r = requests.post(url, json=payload, timeout=10)
        r.raise_for_status()
        default_logger.info(f"Notification Slack envoyée ({len(alerts[:top_n])} alertes)")
        return True
    except Exception as e:
        default_logger.warning(f"Erreur Slack : {e}")
        return False


# ── Ntfy ──────────────────────────────────────────────────────────────────────

def send_ntfy(
    alerts: list,
    ntfy_url: Optional[str] = None,
    ntfy_token: Optional[str] = None,
    top_n: int = 5,
) -> bool:
    """Envoie les alertes vers un serveur Ntfy.

    Returns:
        True si l'envoi a réussi.
    """
    url = ntfy_url or os.getenv("NTFY_URL", "")
    token = ntfy_token or os.getenv("NTFY_TOKEN", "")
    if not url:
        default_logger.debug("NTFY_URL non configuré — Ntfy ignoré")
        return False

    top = alerts[:top_n]
    if not top:
        return True

    # Niveau le plus élevé parmi les alertes
    niveaux_order = {"critique": 3, "élevé": 2, "modéré": 1}
    max_niveau = max(top, key=lambda a: niveaux_order.get(a.get("niveau", "modéré"), 1))
    priority_map = {"critique": "urgent", "élevé": "high", "modéré": "default"}
    priority = priority_map.get(max_niveau.get("niveau", "modéré"), "default")

    title = f"WUDD.ai · {len(top)} tendance(s)"
    lines = [_format_alert_text(a).replace("**", "") for a in top]
    message = "\n".join(lines)

    headers = {
        "Title": title,
        "Priority": priority,
        "Tags": "newspaper,chart_increasing",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        r = requests.post(url, data=message.encode("utf-8"), headers=headers, timeout=10)
        r.raise_for_status()
        default_logger.info(f"Notification Ntfy envoyée ({len(top)} alertes)")
        return True
    except Exception as e:
        default_logger.warning(f"Erreur Ntfy : {e}")
        return False


# ── API publique ──────────────────────────────────────────────────────────────

def notify_alerts(
    alerts: list,
    title: str = "WUDD.ai · Tendances détectées",
    top_n: int = 10,
) -> dict[str, bool]:
    """Envoie les alertes vers toutes les plateformes configurées.

    Returns:
        Dictionnaire {plateforme: bool} indiquant le statut d'envoi.
    """
    if not alerts:
        default_logger.info("Aucune alerte à notifier")
        return {}

    results = {}
    discord_url = os.getenv("WEBHOOK_DISCORD", "")
    slack_url = os.getenv("WEBHOOK_SLACK", "")
    ntfy_url = os.getenv("NTFY_URL", "")

    if discord_url:
        results["discord"] = send_discord(alerts, discord_url, title, top_n)
    if slack_url:
        results["slack"] = send_slack(alerts, slack_url, title, top_n)
    if ntfy_url:
        results["ntfy"] = send_ntfy(alerts, ntfy_url, top_n=min(top_n, 5))

    if not results:
        default_logger.info(
            "Aucune plateforme webhook configurée. "
            "Ajoutez WEBHOOK_DISCORD, WEBHOOK_SLACK ou NTFY_URL dans .env"
        )

    return results
