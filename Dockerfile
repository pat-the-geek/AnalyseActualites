# Dockerfile (extrait) pour intégrer le cron scheduler dans l'image AnalyseActualités

FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Ajout du cron scheduler
COPY crontab /etc/cron.d/scheduler_cron
RUN chmod 0644 /etc/cron.d/scheduler_cron \
    && crontab /etc/cron.d/scheduler_cron

# Lancer cron en mode foreground
CMD ["cron", "-f"]
