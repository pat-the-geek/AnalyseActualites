#!/bin/bash
# Démarre le Viewer WUDD.ai — mode dev local ou production Docker
# Usage :
#   bash start-viewer.sh          # mode développement (Flask + Vite)
#   bash start-viewer.sh docker   # mode production (Docker Compose)
#   bash start-viewer.sh stop     # arrêter le conteneur Docker

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MODE="${1:-dev}"

case "$MODE" in

  docker)
    echo ""
    echo "╔══════════════════════════════════════════════╗"
    echo "║      WUDD.ai Viewer — Production Docker      ║"
    echo "╠══════════════════════════════════════════════╣"
    echo "║  Viewer  →  http://localhost:5050             ║"
    echo "╚══════════════════════════════════════════════╝"
    echo ""
    cd "$ROOT"
    docker compose up -d
    echo ""
    echo "Conteneur démarré. Logs en direct (Ctrl+C pour quitter les logs) :"
    docker compose logs -f
    ;;

  stop)
    echo "Arrêt du conteneur Docker..."
    cd "$ROOT"
    docker compose down
    echo "Conteneur arrêté."
    ;;

  dev|*)
    echo ""
    echo "╔══════════════════════════════════════════════╗"
    echo "║       WUDD.ai Viewer — Mode développement    ║"
    echo "╠══════════════════════════════════════════════╣"
    echo "║  Backend Flask  →  http://localhost:5050      ║"
    echo "║  Frontend Vite  →  http://localhost:5173      ║"
    echo "╚══════════════════════════════════════════════╝"
    echo ""
    bash "$ROOT/viewer/start.sh"
    ;;

esac
