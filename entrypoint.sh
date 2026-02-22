#!/bin/sh
# Entrypoint pour installer la crontab personnalisée et lancer cron en foreground
set -e

# Installer la crontab personnalisée si présente
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

# Lancer cron en foreground
exec cron -f