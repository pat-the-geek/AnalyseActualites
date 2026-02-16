#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Analyse des thématiques sociétales dans les articles collectés
"""


import json
import os
from collections import Counter
from datetime import datetime
import sys

# Import du logger centralisé
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.logging import print_console, setup_logger
logger = setup_logger("AnalyseActualites")

# Définir le répertoire du projet
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, 'data', 'articles')

# print_console est importé depuis utils.logging

def charger_articles():
    """Charge tous les fichiers JSON du répertoire articles"""
    articles = []
    fichiers = [f for f in os.listdir(DATA_DIR) if f.endswith('.json')]
    
    print_console(f"Chargement de {len(fichiers)} fichier(s) JSON...")
    
    for fichier in fichiers:
        chemin = os.path.join(DATA_DIR, fichier)
        try:
            with open(chemin, 'r', encoding='utf-8') as f:
                data = json.load(f)
                articles.extend(data)
                print_console(f"  ✓ {fichier}: {len(data)} articles")
        except Exception as e:
            print_console(f"  ✗ Erreur lors du chargement de {fichier}: {e}", level="error")
    
    return articles

def analyser_thematiques(articles):
    """Analyse les thématiques sociétales présentes dans les articles"""
    
    # Définir des mots-clés pour différentes thématiques sociétales
    thematiques = {
        'Intelligence Artificielle & Technologie': [
            'ia', 'intelligence artificielle', 'chatgpt', 'gemini', 'mistral', 'openai',
            'modèle', 'algorithme', 'llm', 'machine learning', 'deepseek', 'anthropic',
            'claude', 'grok', 'siri', 'apple intelligence'
        ],
        'Santé': [
            'santé', 'médical', 'cancer', 'suicide', 'mental', 'patient', 'maladie', 
            'thérapie', 'diagnostic', 'traitement', 'test hépatiques'
        ],
        'Éthique & Droits': [
            'éthique', 'droit', 'droits d\'auteur', 'propriété intellectuelle', 'plagiat',
            'données protégées', 'vie privée', 'confidentialité', 'rgpd', 'transparence'
        ],
        'Sécurité & Cybersécurité': [
            'sécurité', 'cyberattaque', 'piratage', 'hackeurs', 'vulnérabilité', 
            'ransomware', 'protection', 'garde-fou'
        ],
        'Politique & Géopolitique': [
            'gouvernement', 'état', 'ministère', 'chine', 'censure', 'souveraineté',
            'régulation', 'loi', 'sénat', 'autorités', 'militaire', 'armées', 'national'
        ],
        'Économie & Entreprises': [
            'économie', 'entreprise', 'marché', 'investissement', 'revenus', 'valorisation',
            'compétitivité', 'start-up', 'licorne', 'productivité', 'financier', 'gain'
        ],
        'Éducation & Formation': [
            'éducation', 'formation', 'enseignement', 'apprentissage', 'étudiant', 
            'pédagogique', 'école'
        ],
        'Environnement': [
            'environnement', 'co2', 'carbone', 'énergie', 'énergétique', 'empreinte',
            'climat', 'écologique'
        ],
        'Emploi & Travail': [
            'emploi', 'travail', 'salarié', 'professionnel', 'métier', 'compétence',
            'poste', 'carrière'
        ],
        'Protection des Consommateurs': [
            'consommateur', 'utilisateur', 'client', 'responsabilité', 'vulnérable'
        ],
        'Médias & Information': [
            'média', 'information', 'presse', 'journalisme', 'contenu', 'désinformation',
            'résumé', 'fake news'
        ],
        'Justice & Réglementation': [
            'justice', 'procès', 'plainte', 'poursuite', 'tribunal', 'légal', 'juridique',
            'amende', 'condamnation'
        ]
    }
    
    # Compter les occurrences par thématique
    compteur_thematiques = Counter()
    articles_par_thematique = {theme: [] for theme in thematiques.keys()}
    articles_valides = 0
    
    for article in articles:
        resume = article.get('Résumé', '').lower()
        source = article.get('Sources', 'N/A')
        url = article.get('URL', 'N/A')
        date = article.get('Date de publication', 'N/A')
        
        # Ignorer les articles sans résumé valide
        if 'impossible de résumer' in resume or 'accès refusé' in resume or 'erreur' in resume:
            continue
        
        articles_valides += 1
        
        # Identifier les thématiques pour cet article
        for theme, mots_cles in thematiques.items():
            trouve = False
            for mot in mots_cles:
                if mot in resume:
                    compteur_thematiques[theme] += 1
                    trouve = True
                    break
            
            if trouve and len(articles_par_thematique[theme]) < 3:
                articles_par_thematique[theme].append({
                    'date': date,
                    'source': source,
                    'url': url,
                    'extrait': resume[:200] + '...' if len(resume) > 200 else resume
                })
    
    return compteur_thematiques, articles_par_thematique, articles_valides

def afficher_resultats(compteur, exemples, total, total_valides):
    """Affiche les résultats de l'analyse"""
    
    print("\n" + "=" * 90)
    print(" " * 20 + "ANALYSE DES THÉMATIQUES SOCIÉTALES")
    print("=" * 90)
    print(f"\n📊 Corpus analysé: {total} articles totaux, {total_valides} articles avec résumés valides")
    print(f"📅 Période: Décembre 2025 - Janvier 2026")
    print("\n" + "=" * 90)
    
    # Trier par nombre d'occurrences décroissant
    for i, (theme, count) in enumerate(compteur.most_common(), 1):
        pourcentage = (count / total_valides * 100) if total_valides > 0 else 0
        print(f"\n{i}. {theme.upper()}")
        print("─" * 90)
        print(f"   Mentions: {count} ({pourcentage:.1f}% des articles)")
        
        if exemples[theme]:
            print(f"   Exemples d'articles ({len(exemples[theme])}):")
            for j, ex in enumerate(exemples[theme], 1):
                print(f"\n   [{j}] {ex['source']}")
                print(f"       Date: {ex['date'][:10]}")
                print(f"       {ex['extrait']}")
    
    print("\n" + "=" * 90)
    print("Analyse terminée.")
    print("=" * 90)

def main():
    """Fonction principale"""
    print_console("Démarrage de l'analyse des thématiques sociétales...")
    
    # Charger les articles
    articles = charger_articles()
    print_console(f"Total: {len(articles)} articles chargés")
    
    if not articles:
        print_console("Aucun article à analyser.")
        return
    
    # Analyser les thématiques
    print_console("Analyse en cours...")
    compteur, exemples, articles_valides = analyser_thematiques(articles)
    
    # Afficher les résultats
    afficher_resultats(compteur, exemples, len(articles), articles_valides)

if __name__ == '__main__':
    main()
