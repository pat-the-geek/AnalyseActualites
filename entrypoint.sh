#!/bin/sh
# Entrypoint : génère .env, installe la crontab, démarre le viewer Flask,
# puis lance cron en foreground.
set -e

# ── 1. Exporter les variables d'environnement vers /app/.env ─────────────────
# Cron ne propage pas les vars injectées par docker-compose env_file.
# On les écrit dans /app/.env pour que load_dotenv() les retrouve à chaque job.
echo "Génération de /app/.env depuis l'environnement Docker..."
# Variables écrites dans un ordre explicite (reflété dans l'onglet Environnement des Réglages)
{
  [ -n "$URL" ]                  && echo "URL=$URL"
  [ -n "$bearer" ]               && echo "bearer=$bearer"
  [ -n "$max_attempts" ]         && echo "max_attempts=$max_attempts"
  [ -n "$MAX_RETRIES" ]          && echo "MAX_RETRIES=$MAX_RETRIES"
  [ -n "$timeout_resume" ]       && echo "timeout_resume=$timeout_resume"
  [ -n "$TIMEOUT_RESUME" ]       && echo "TIMEOUT_RESUME=$TIMEOUT_RESUME"
  [ -n "$timeout_rapport" ]      && echo "timeout_rapport=$timeout_rapport"
  [ -n "$TIMEOUT_RAPPORT" ]      && echo "TIMEOUT_RAPPORT=$TIMEOUT_RAPPORT"
  [ -n "$default_error_message" ] && echo "default_error_message=$default_error_message"
  [ -n "$CRON_ALERT_MAIL" ]      && echo "CRON_ALERT_MAIL=$CRON_ALERT_MAIL"
  [ -n "$CRON_ALERT_FROM" ]      && echo "CRON_ALERT_FROM=$CRON_ALERT_FROM"
  [ -n "$CRON_ALERT_SMTP" ]      && echo "CRON_ALERT_SMTP=$CRON_ALERT_SMTP"
  [ -n "$CRON_ALERT_PORT" ]      && echo "CRON_ALERT_PORT=$CRON_ALERT_PORT"
  [ -n "$CRON_ALERT_USER" ]      && echo "CRON_ALERT_USER=$CRON_ALERT_USER"
  [ -n "$CRON_ALERT_PASS" ]      && echo "CRON_ALERT_PASS=$CRON_ALERT_PASS"
  [ -n "$SMTP_HOST" ]            && echo "SMTP_HOST=$SMTP_HOST"
  [ -n "$SMTP_PORT" ]            && echo "SMTP_PORT=$SMTP_PORT"
  [ -n "$SMTP_USER" ]            && echo "SMTP_USER=$SMTP_USER"
  [ -n "$SMTP_PASSWORD" ]        && echo "SMTP_PASSWORD=$SMTP_PASSWORD"
  [ -n "$SMTP_FROM" ]            && echo "SMTP_FROM=$SMTP_FROM"
  [ -n "$SMTP_TO" ]              && echo "SMTP_TO=$SMTP_TO"
  [ -n "$WEBHOOK_DISCORD" ]      && echo "WEBHOOK_DISCORD=$WEBHOOK_DISCORD"
  [ -n "$WEBHOOK_SLACK" ]        && echo "WEBHOOK_SLACK=$WEBHOOK_SLACK"
  [ -n "$NTFY_URL" ]             && echo "NTFY_URL=$NTFY_URL"
  [ -n "$NTFY_TOKEN" ]           && echo "NTFY_TOKEN=$NTFY_TOKEN"
} > /app/.env
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
