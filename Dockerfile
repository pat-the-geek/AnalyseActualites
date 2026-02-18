# Dockerfile pour AnalyseActualités (multi-flux)

FROM python:3.10-slim

# 1. Dépendances système minimales (inclut cron)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cron \
    && rm -rf /var/lib/apt/lists/*

# 2. Création des dossiers de travail
WORKDIR /app

# 3. Copie du code source et de la config
COPY scripts/ scripts/
COPY utils/ utils/
COPY config/ config/
COPY tests/ tests/

# Copie depuis archives/
COPY archives/requirements.txt ./requirements.txt
COPY .env.example .env.example
COPY README.md ./README.md

# 4. Installation des dépendances Python
RUN pip install --no-cache-dir -r requirements.txt

# 5. Création des dossiers de données et rapports (volumes)
RUN mkdir -p data/articles/cache data/articles/raw rapports/markdown rapports/pdf samples archives


# 6. Variables d'environnement (timezone aligné sur le host)
ENV TZ=Europe/Paris
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
ENV PYTHONUNBUFFERED=1


# 7. Commande par défaut : lancer cron en mode foreground
CMD ["cron", "-f"]

# Pour lancer un traitement manuel, overridez la commande :
# docker run --rm -v $(pwd)/data:/app/data -v $(pwd)/rapports:/app/rapports <image> python3 scripts/Get_data_from_JSONFile_AskSummary_v2.py --flux <nom_flux> --date_debut ... --date_fin ...
