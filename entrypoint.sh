#!/bin/sh
# Entrypoint pour installer la crontab personnalisée et lancer cron en foreground
set -e

# Installer la crontab personnalisée si présente
if [ -f /app/archives/crontab ]; then
    crontab /app/archives/crontab
    echo "Crontab personnalisée installée :"
    crontab -l
else
    echo "Aucune crontab personnalisée trouvée."
fi

# Lancer cron en foreground
exec cron -f