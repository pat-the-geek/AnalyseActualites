import os
import smtplib
from email.message import EmailMessage
from datetime import datetime, timedelta

# Paramètres de vérification
CRON_LOG = "/app/cron_test.log"
SCHEDULER_LOG = "/app/rapports/cron_scheduler.log"
MAX_MINUTES = 5  # délai max sans update du cron_test.log

# Paramètres de notification (adapter pour votre SMTP)
MAIL_ENABLED = True
MAIL_TO = os.getenv("CRON_ALERT_MAIL", "admin@example.com")
MAIL_FROM = os.getenv("CRON_ALERT_FROM", "cron-bot@example.com")
MAIL_SERVER = os.getenv("CRON_ALERT_SMTP", "smtp.example.com")
MAIL_PORT = int(os.getenv("CRON_ALERT_PORT", "587"))
MAIL_USER = os.getenv("CRON_ALERT_USER", "")
MAIL_PASS = os.getenv("CRON_ALERT_PASS", "")


def send_mail(subject, body):
    if not MAIL_ENABLED:
        return
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = MAIL_FROM
    msg["To"] = MAIL_TO
    msg.set_content(body)
    try:
        with smtplib.SMTP(MAIL_SERVER, MAIL_PORT) as server:
            server.starttls()
            if MAIL_USER:
                server.login(MAIL_USER, MAIL_PASS)
            server.send_message(msg)
    except Exception as e:
        print(f"Erreur envoi mail: {e}")


def check_cron_health():
    # Vérifie la fraîcheur du cron_test.log
    try:
        mtime = os.path.getmtime(CRON_LOG)
        last = datetime.fromtimestamp(mtime)
        if datetime.now() - last > timedelta(minutes=MAX_MINUTES):
            send_mail(
                "[ALERTE] Cron ne s'exécute plus !",
                f"Le fichier {CRON_LOG} n'a pas été mis à jour depuis {last}."
            )
            print(f"[ALERTE] Cron inactif depuis {last}")
        else:
            print(f"[OK] Cron actif, dernière exécution: {last}")
    except Exception as e:
        send_mail(
            "[ALERTE] Cron log introuvable !",
            f"Impossible de lire {CRON_LOG}: {e}"
        )
        print(f"[ERREUR] Impossible de lire {CRON_LOG}: {e}")

    # Vérifie la présence d'erreurs dans le log du scheduler
    try:
        if os.path.exists(SCHEDULER_LOG):
            with open(SCHEDULER_LOG, "r") as f:
                lines = f.readlines()[-20:]
                for line in lines:
                    if "Traceback" in line or "Error" in line or "Exception" in line:
                        send_mail(
                            "[ALERTE] Erreur dans le scheduler !",
                            f"Erreur détectée dans {SCHEDULER_LOG} :\n{line}"
                        )
                        print(f"[ALERTE] Erreur détectée dans le scheduler : {line}")
    except Exception as e:
        print(f"[ERREUR] Lecture du log scheduler: {e}")

if __name__ == "__main__":
    check_cron_health()
