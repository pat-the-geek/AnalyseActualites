# Configuration rapide : cron + Docker pour AnalyseActualités

## 1. Fonctionnement général
- L’image Docker utilise `python:3.10` (non-slim) pour garantir le support de cron.
- Les tâches planifiées sont définies dans `/etc/cron.d/scheduler_cron` (copiée depuis le fichier `crontab` du projet).
- Le service cron est lancé en mode foreground (`CMD ["cron", "-f"]`).
- Les logs des tâches sont redirigés vers des fichiers dans `/app/` (ex : `/app/cron_test.log`, `/app/rapports/cron_scheduler.log`).

## 2. Exemple de crontab (fichier `crontab`)
```
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Exécute le scheduler chaque lundi à 6h du matin
0 6 * * 1 root cd /app && python3 scripts/scheduler_articles.py >> /app/rapports/cron_scheduler.log 2>&1

# Tâche de test : écrit un fichier toutes les minutes
* * * * * root echo "cron ok $(date)" >> /app/cron_test.log
```

## 3. Build & run Docker
```bash
docker build -t wudd-ai .
docker run --env-file .env -d --name wudd-ai-final -v $(pwd)/rapports:/app/rapports -v $(pwd)/data:/app/data wudd-ai
```

## 4. Vérification du cron
- Le fichier `/app/cron_test.log` doit être créé et mis à jour chaque minute.
- Pour vérifier :
```bash
docker exec wudd-ai-final cat /app/cron_test.log
```

## 5. Logs et erreurs
- Les erreurs du scheduler sont loguées dans `/app/rapports/cron_scheduler.log`.
- En cas d’échec, une notification peut être envoyée (voir script de monitoring).

## 6. Bonnes pratiques
- Toujours utiliser le format `/etc/cron.d/` (avec l’utilisateur `root` sur chaque ligne).
- Redémarrer le service cron après modification de la crontab :
```bash
docker exec wudd-ai-final service cron reload
```

## 7. Surveillance
- Utiliser le script `scripts/check_cron_health.py` pour vérifier automatiquement le bon fonctionnement du cron et notifier en cas d’échec.
