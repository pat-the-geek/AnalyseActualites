# Guide de sécurité AnalyseActualités

## Objectif
Ce document décrit les bonnes pratiques de sécurité pour le projet AnalyseActualités.

## Points clés
- Les credentials (API, tokens) doivent être stockés dans `.env` (non versionné).
- Les données sensibles (sources, articles, rapports) ne doivent pas être exposées publiquement.
- Les scripts ne doivent jamais écrire de credentials dans les logs ou outputs.
- Les accès à l’API EurIA sont limités par token.
- Les sauvegardes sont à stocker dans `archives/` (hors cloud public).

## Surveillance
- Vérification régulière des logs pour détecter toute activité anormale.
- Utilisation du script `check_cron_health.py` pour surveiller l’activité du scheduler.

## Mise à jour
- Ce guide doit être complété à chaque évolution majeure du projet.

## Contact
patrick.ostertag@gmail.com
