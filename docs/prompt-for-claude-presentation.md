# **Prompt Claude pour générer une présentation depuis le fichier JSON**

```
Consulte le fichier [nom].json et génère une présentation markdown.

ÉTAPE 1 — ANALYSE
Pour chaque article, extrais :
- Les mots-clés du résumé (noms propres, concepts, entités)
- L'URL de la première image (ignore les articles sans image)
- La date de publication

ÉTAPE 2 — CLUSTERING
Regroupe les articles par sujet en te basant sur les mots-clés.
Un sujet = un cluster. Si plusieurs articles partagent les mêmes 
mots-clés dominants, ils appartiennent au même cluster.
Sélectionne UN seul article par cluster : celui avec l'image 
la plus pertinente et le résumé le plus synthétique.
Limite : 10 slides maximum.

ÉTAPE 3 — GÉNÉRATION
Pour chaque article sélectionné, génère :
- Un titre original représentatif (pas le titre de la source)
- Un résumé de 40 mots (3 phrases denses, faits essentiels)

MODÈLE MARKDOWN À RESPECTER :

# [Titre du rapport]
#### [Date]
		[Description ligne 1]
		[Description ligne 2]
		[Description ligne 3]
		[Description ligne 4]

---
# [Titre-article original]
#### [Source · Date]
		[Résumé 40 mots].
<img src='[image-url]' />

[répéter pour chaque article sélectionné]

---
		Python generated with love, for iA Presenter using EurIA AI from Infomaniak
```