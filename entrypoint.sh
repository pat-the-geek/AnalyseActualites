#!/bin/sh
# Entrypoint : génère .env, installe la crontab, démarre le viewer Flask,
# puis lance cron en foreground.
set -e

# ── 1. Exporter les variables d'environnement vers /app/.env ─────────────────
# Cron ne propage pas les vars injectées par docker-compose env_file.
# On les écrit dans /app/.env pour que load_dotenv() les retrouve à chaque job.
echo "Génération de /app/.env depuis l'environnement Docker..."
printenv | grep -E '^(URL|bearer|REEDER_JSON_URL|max_attempts|timeout_resume|timeout_rapport|default_error_message|CRON_ALERT_MAIL|CRON_ALERT_FROM|CRON_ALERT_SMTP|CRON_ALERT_PORT|CRON_ALERT_USER|CRON_ALERT_PASS)=' > /app/.env
echo "/app/.env généré avec $(wc -l < /app/.env) variable(s)."

# ── 2. Installer la crontab personnalisée ────────────────────────────────────
# Le fichier archives/crontab utilise le format /etc/cron.d/ (avec champ utilisateur)
# Il doit donc être copié dans /etc/cron.d/ et NON installé via 'crontab'
if [ -f /app/archives/crontab ]; then
    cp /app/archives/crontab /etc/cron.d/app-crontab
    chmod 644 /etc/cron.d/app-crontab
    chown root:root /etc/cron.d/app-crontab
    echo "Crontab personnalisée installée dans /etc/cron.d/app-crontab :"
    cat /etc/cron.d/app-crontab
else
    echo "Aucune crontab personnalisée trouvée."
fi

# ── 3. Démarrer le viewer Flask en arrière-plan ──────────────────────────────
echo "Démarrage du viewer WUDD.ai sur le port 5050..."
mkdir -p /app/rapports
python3 /app/viewer/app.py >> /app/rapports/viewer.log 2>&1 &
VIEWER_PID=$!
echo "Viewer démarré (PID : $VIEWER_PID) — http://localhost:5050"

# ── 4. Lancer cron en foreground ─────────────────────────────────────────────
exec cron -f
