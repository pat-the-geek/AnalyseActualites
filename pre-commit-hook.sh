#!/bin/bash

# =============================================================================
# Script de vérification avant commit (pre-commit hook)
# =============================================================================
# 
# Ce script empêche le commit de fichiers sensibles et recherche des patterns
# de credentials dans les fichiers à commiter.
#
# Installation :
#   chmod +x pre-commit-hook.sh
#   cp pre-commit-hook.sh .git/hooks/pre-commit
#
# =============================================================================

set -e

# Couleurs pour l'affichage
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "🔍 Vérification de sécurité avant commit..."

# =============================================================================
# 1. Vérifier que .env n'est pas commité
# =============================================================================
if git diff --cached --name-only | grep -q "^\.env$"; then
    echo -e "${RED}❌ ERREUR CRITIQUE : Tentative de commit de .env bloquée !${NC}"
    echo -e "${YELLOW}Le fichier .env contient des credentials sensibles.${NC}"
    echo ""
    echo "Pour retirer .env du commit :"
    echo "  git reset HEAD .env"
    echo ""
    exit 1
fi

# =============================================================================
# 2. Vérifier les fichiers sensibles
# =============================================================================
SENSITIVE_FILES=(
    "\.env$"
    "\.env\.local$"
    "\.env\.production$"
    "data/articles/.*\.json$"
    "data/raw/"
    "archives/.*\.py$"
    "rapports/markdown/.*\.md$"
)

for pattern in "${SENSITIVE_FILES[@]}"; do
    if git diff --cached --name-only | grep -qE "$pattern"; then
        echo -e "${YELLOW}⚠️  ATTENTION : Fichier potentiellement sensible détecté${NC}"
        echo "Pattern: $pattern"
        git diff --cached --name-only | grep -E "$pattern"
        echo ""
        read -p "Êtes-vous sûr de vouloir commiter ce fichier ? (y/N) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${RED}❌ Commit annulé${NC}"
            exit 1
        fi
    fi
done

# =============================================================================
# 3. Rechercher des patterns de credentials dans le diff
# =============================================================================
CREDENTIAL_PATTERNS=(
    "bearer.*=.*[a-zA-Z0-9_-]{30,}"
    "api[_-]?key.*=.*[a-zA-Z0-9]{20,}"
    "password.*=.*[a-zA-Z0-9]{8,}"
    "secret.*=.*[a-zA-Z0-9]{20,}"
    "token.*=.*[a-zA-Z0-9]{20,}"
    "REEDER_JSON_URL=https://reederapp\.net/[a-zA-Z0-9_-]+"
)

for pattern in "${CREDENTIAL_PATTERNS[@]}"; do
    if git diff --cached | grep -qiE "$pattern"; then
        echo -e "${RED}⚠️  ALERTE SÉCURITÉ : Pattern de credential détecté !${NC}"
        echo "Pattern: $pattern"
        echo ""
        echo "Lignes concernées :"
        git diff --cached | grep -iE "$pattern" --color=always
        echo ""
        echo -e "${YELLOW}Il est fortement déconseillé de commiter des credentials.${NC}"
        read -p "Continuer MALGRÉ TOUT ? (y/N) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${RED}❌ Commit annulé${NC}"
            exit 1
        fi
    fi
done

# =============================================================================
# 4. Vérifier les fichiers volumineux
# =============================================================================
MAX_FILE_SIZE=5242880  # 5 MB
LARGE_FILES=$(git diff --cached --name-only | while read file; do
    if [ -f "$file" ]; then
        size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
        if [ "$size" -gt "$MAX_FILE_SIZE" ]; then
            echo "$file ($((size / 1024 / 1024)) MB)"
        fi
    fi
done)

if [ -n "$LARGE_FILES" ]; then
    echo -e "${YELLOW}⚠️  ATTENTION : Fichiers volumineux détectés (> 5 MB)${NC}"
    echo "$LARGE_FILES"
    echo ""
    read -p "Continuer ? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}❌ Commit annulé${NC}"
        exit 1
    fi
fi

# =============================================================================
# 5. Vérifier la présence de .DS_Store
# =============================================================================
if git diff --cached --name-only | grep -q "\.DS_Store$"; then
    echo -e "${YELLOW}⚠️  Fichier .DS_Store détecté (métadonnées macOS)${NC}"
    echo "Retrait automatique..."
    git reset HEAD .DS_Store
    git clean -f .DS_Store
fi

# =============================================================================
# Validation finale
# =============================================================================
echo -e "${GREEN}✅ Toutes les vérifications sont passées !${NC}"
echo ""
echo "Fichiers à commiter :"
git diff --cached --name-only
echo ""

exit 0
