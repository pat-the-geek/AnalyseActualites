#!/bin/bash
# Démarre le viewer WUDD.ai en mode développement (Flask + Vite dev server).
# Usage : bash viewer/start.sh  (depuis la racine du projet)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Vérification des dépendances
command -v python3 >/dev/null || { echo "Erreur : python3 requis"; exit 1; }
command -v node    >/dev/null || { echo "Erreur : node requis (https://nodejs.org)"; exit 1; }
command -v npm     >/dev/null || { echo "Erreur : npm requis"; exit 1; }

# Installation des dépendances npm si nécessaire
if [ ! -d node_modules ]; then
    echo "Installation des dépendances npm..."
    npm install
fi

# Installation de Flask si nécessaire
python3 -c "import flask" 2>/dev/null || pip install flask

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        WUDD.ai Viewer — Dev mode         ║"
echo "╠══════════════════════════════════════════╣"
echo "║  Backend Flask  →  http://localhost:5050  ║"
echo "║  Frontend Vite  →  http://localhost:5173  ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Démarrer Flask en arrière-plan
python3 app.py &
FLASK_PID=$!

# Démarrer Vite en avant-plan
npm run dev

# Arrêter Flask à la fermeture
kill $FLASK_PID 2>/dev/null || true
