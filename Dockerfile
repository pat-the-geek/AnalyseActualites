# Dockerfile (extrait) pour intégrer le cron scheduler dans l'image AnalyseActualités


FROM python:3.10
RUN apt-get update && apt-get install -y cron procps && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Ajout du cron scheduler
COPY crontab /etc/cron.d/scheduler_cron
RUN chmod 0644 /etc/cron.d/scheduler_cron

# Lancer cron en mode foreground
CMD ["sh", "-c", "cron && tail -f /app/cron_test.log /app/rapports/cron_scheduler.log"]
