#!/bin/bash

# =============================================================================
# Script de Vérification de Sécurité Avant Déploiement GitHub
# =============================================================================
# 
# Usage : ./verify-security.sh
# 
# Ce script effectue une vérification complète de sécurité avant le premier
# commit GitHub pour s'assurer qu'aucune donnée sensible ne sera exposée.
#
# =============================================================================

set -e

# Couleurs
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   Vérification de Sécurité - Déploiement GitHub${NC}"
echo -e "${BLUE}   Projet : AnalyseActualités${NC}"
echo -e "${BLUE}   Date : $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""

# =============================================================================
# 1. Vérifier que .env existe et contient des données
# =============================================================================
echo -e "${BLUE}[1/8]${NC} Vérification du fichier .env..."

if [ ! -f ".env" ]; then
    echo -e "${RED}   ❌ ERREUR : Fichier .env introuvable${NC}"
    ((ERRORS++))
else
    echo -e "${GREEN}   ✅ Fichier .env trouvé${NC}"
    
    # Vérifier que .env contient des credentials
    if grep -q "bearer=.*[a-zA-Z0-9]" .env; then
        echo -e "${GREEN}   ✅ Token bearer trouvé dans .env${NC}"
    else
        echo -e "${YELLOW}   ⚠️  Token bearer non trouvé ou vide${NC}"
        ((WARNINGS++))
    fi
fi

echo ""

# =============================================================================
# 2. Vérifier que .env est bien ignoré
# =============================================================================
echo -e "${BLUE}[2/8]${NC} Vérification du .gitignore..."

if [ ! -f ".gitignore" ]; then
    echo -e "${RED}   ❌ ERREUR : Fichier .gitignore introuvable${NC}"
    ((ERRORS++))
else
    if grep -q "^\.env$" .gitignore; then
        echo -e "${GREEN}   ✅ .env est dans le .gitignore${NC}"
    else
        echo -e "${RED}   ❌ ERREUR : .env n'est PAS dans le .gitignore${NC}"
        ((ERRORS++))
    fi
    
    # Vérifier autres patterns importants
    REQUIRED_PATTERNS=("data/articles/*.json" "data/raw/" "rapports/markdown/" "archives/")
    for pattern in "${REQUIRED_PATTERNS[@]}"; do
        if grep -qF "$pattern" .gitignore; then
            echo -e "${GREEN}   ✅ Pattern protégé : $pattern${NC}"
        else
            echo -e "${YELLOW}   ⚠️  Pattern manquant : $pattern${NC}"
            ((WARNINGS++))
        fi
    done
fi

echo ""

# =============================================================================
# 3. Rechercher des credentials dans les fichiers Python
# =============================================================================
echo -e "${BLUE}[3/8]${NC} Recherche de credentials dans les scripts..."

CREDENTIAL_FOUND=0
if grep -r "bearer\s*=\s*['\"][a-zA-Z0-9_-]\{30,\}['\"]" scripts/ --include="*.py" 2>/dev/null; then
    echo -e "${RED}   ❌ ERREUR : Token hardcodé trouvé dans les scripts !${NC}"
    ((ERRORS++))
    CREDENTIAL_FOUND=1
fi

if grep -r "REEDER_JSON_URL\s*=\s*['\"]https://" scripts/ --include="*.py" 2>/dev/null; then
    echo -e "${RED}   ❌ ERREUR : URL privée hardcodée trouvée !${NC}"
    ((ERRORS++))
    CREDENTIAL_FOUND=1
fi

if [ $CREDENTIAL_FOUND -eq 0 ]; then
    echo -e "${GREEN}   ✅ Aucun credential hardcodé détecté${NC}"
fi

echo ""

# =============================================================================
# 4. Vérifier .env.example
# =============================================================================
echo -e "${BLUE}[4/8]${NC} Vérification du fichier .env.example..."

if [ ! -f ".env.example" ]; then
    echo -e "${YELLOW}   ⚠️  Fichier .env.example manquant${NC}"
    ((WARNINGS++))
else
    echo -e "${GREEN}   ✅ Fichier .env.example trouvé${NC}"
    
    # Vérifier qu'il ne contient PAS de vraies credentials
    if grep -q "bearer=.*[a-zA-Z0-9_-]\{30,\}" .env.example; then
        echo -e "${RED}   ❌ ERREUR : Vraies credentials dans .env.example !${NC}"
        ((ERRORS++))
    else
        echo -e "${GREEN}   ✅ Pas de vraies credentials dans .env.example${NC}"
    fi
fi

echo ""

# =============================================================================
# 5. Vérifier que les données sensibles existent mais sont protégées
# =============================================================================
echo -e "${BLUE}[5/8]${NC} Vérification des données sensibles..."

# Compter les fichiers JSON dans data/articles/
JSON_COUNT=$(find data/articles/ -name "*.json" -not -name ".gitkeep" | wc -l | tr -d ' ')
if [ "$JSON_COUNT" -gt 0 ]; then
    echo -e "${GREEN}   ✅ $JSON_COUNT fichier(s) JSON trouvé(s) dans data/articles/${NC}"
    echo -e "${GREEN}   ✅ Ces fichiers seront protégés par .gitignore${NC}"
else
    echo -e "${YELLOW}   ⚠️  Aucun fichier JSON dans data/articles/${NC}"
    ((WARNINGS++))
fi

# Vérifier taille des données
DATA_SIZE=$(du -sh data/ 2>/dev/null | cut -f1)
echo -e "${BLUE}   ℹ️  Taille totale de data/ : $DATA_SIZE${NC}"

echo ""

# =============================================================================
# 6. Vérifier la présence des .gitkeep
# =============================================================================
echo -e "${BLUE}[6/8]${NC} Vérification des fichiers .gitkeep..."

GITKEEP_DIRS=("data/articles" "data/raw" "rapports/markdown" "rapports/pdf" "archives")
for dir in "${GITKEEP_DIRS[@]}"; do
    if [ -f "$dir/.gitkeep" ]; then
        echo -e "${GREEN}   ✅ $dir/.gitkeep présent${NC}"
    else
        echo -e "${YELLOW}   ⚠️  $dir/.gitkeep manquant${NC}"
        ((WARNINGS++))
    fi
done

echo ""

# =============================================================================
# 7. Vérifier les fichiers de documentation
# =============================================================================
echo -e "${BLUE}[7/8]${NC} Vérification de la documentation..."

DOCS=("README.md" "SECURITY.md" "DEPLOY.md" ".env.example" "pre-commit-hook.sh")
for doc in "${DOCS[@]}"; do
    if [ -f "$doc" ]; then
        echo -e "${GREEN}   ✅ $doc présent${NC}"
    else
        echo -e "${YELLOW}   ⚠️  $doc manquant${NC}"
        ((WARNINGS++))
    fi
done

echo ""

# =============================================================================
# 8. Test avec Git (si initialisé)
# =============================================================================
echo -e "${BLUE}[8/8]${NC} Test avec Git..."

if [ -d ".git" ]; then
    echo -e "${BLUE}   ℹ️  Git déjà initialisé${NC}"
    
    # Vérifier que .env n'est pas tracké
    if git ls-files --error-unmatch .env 2>/dev/null; then
        echo -e "${RED}   ❌ ERREUR CRITIQUE : .env est tracké par Git !${NC}"
        echo -e "${YELLOW}   Exécuter : git rm --cached .env${NC}"
        ((ERRORS++))
    else
        echo -e "${GREEN}   ✅ .env n'est pas tracké par Git${NC}"
    fi
    
    # Tester check-ignore
    if git check-ignore -q .env; then
        echo -e "${GREEN}   ✅ .env est correctement ignoré par Git${NC}"
    else
        echo -e "${RED}   ❌ ERREUR : .env n'est PAS ignoré par Git${NC}"
        ((ERRORS++))
    fi
else
    echo -e "${YELLOW}   ⚠️  Git non initialisé (normal avant premier commit)${NC}"
    echo -e "${BLUE}   ℹ️  Exécuter : git init${NC}"
fi

echo ""

# =============================================================================
# Résumé
# =============================================================================
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   Résumé de la Vérification${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ PARFAIT : Aucun problème détecté !${NC}"
    echo -e "${GREEN}   Le projet est prêt pour le déploiement GitHub.${NC}"
    EXIT_CODE=0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  AVERTISSEMENTS : $WARNINGS avertissement(s)${NC}"
    echo -e "${YELLOW}   Le projet peut être déployé, mais certains éléments pourraient être améliorés.${NC}"
    EXIT_CODE=0
else
    echo -e "${RED}❌ ERREURS CRITIQUES : $ERRORS erreur(s), $WARNINGS avertissement(s)${NC}"
    echo -e "${RED}   NE PAS déployer avant de corriger les erreurs !${NC}"
    EXIT_CODE=1
fi

echo ""
echo -e "${BLUE}Prochaines étapes :${NC}"
echo -e "   1. Consulter ${YELLOW}PRE_DEPLOY_CHECKLIST.md${NC}"
echo -e "   2. Consulter ${YELLOW}DEPLOY.md${NC}"
echo -e "   3. Installer le hook : ${YELLOW}cp pre-commit-hook.sh .git/hooks/pre-commit${NC}"
echo -e "   4. Premier commit : ${YELLOW}git init && git add . && git commit${NC}"
echo ""

exit $EXIT_CODE
