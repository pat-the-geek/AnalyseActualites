# Automatisation et surveillance du cron dans Docker

## 1. Vérification automatique
- Le script `scripts/check_cron_health.py` vérifie toutes les 10 minutes :
  - Que le cron s’exécute bien (fraîcheur de `/app/cron_test.log`)
  - Qu’il n’y a pas d’erreur dans `/app/rapports/cron_scheduler.log`
  - Envoie un mail d’alerte en cas de problème (configurable via variables d’environnement)

## 2. Notification d’échec
- En cas d’échec d’un job ou d’inactivité du cron, un mail est envoyé à l’administrateur.
- Les paramètres SMTP sont à définir dans `.env` :
```
CRON_ALERT_MAIL=admin@example.com
CRON_ALERT_FROM=cron-bot@example.com
CRON_ALERT_SMTP=smtp.example.com
CRON_ALERT_PORT=587
CRON_ALERT_USER=monuser
CRON_ALERT_PASS=motdepasse
```

## 3. Surveillance continue
- Le log de la surveillance est dans `/app/rapports/cron_health.log`.
- Pour vérifier :
```bash
docker exec wudd-ai-final tail -n 50 /app/rapports/cron_health.log
```

## 4. Automatisation du déploiement
- Pour automatiser build, run et surveillance :
```bash
docker build -t wudd-ai .
docker run --env-file .env -d --name wudd-ai-final -v $(pwd)/rapports:/app/rapports -v $(pwd)/data:/app/data wudd-ai
# Surveillance automatique via cron dans le conteneur
```

## 5. Bonnes pratiques
- Adapter la fréquence de la vérification selon vos besoins.
- Tester l’envoi de mail avec un SMTP de test avant production.
- Consulter régulièrement les logs de santé et du scheduler.
