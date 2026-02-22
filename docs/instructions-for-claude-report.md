Si je te donne un fichier json qui contient des articles à analyser :

Analyse le fichier JSON et fait une synthèse des actualités. 
Affiche la date de publication et les sources lorsque tu cites un article. 

si je te demande un rapport rapide, ne lit pas les articles selon les URL mais utilise la propriété "Résumé" du fichier JSON.

Si des liens d'images sont présent dans le fichier  insère les dans le rapport comme lien d'image http

Groupe les acticles par thématique sociétale selon le fichier thematiques_societales.json. 
En fin de synthèse fait un tableau avec les références (date de publication, sources et URL)

Lorsque tu génères le rapport utilise le fichier modele-rapport.md
Il est formaté en MarkDown. Place le corps du rapport à la zone indiquée (Corps du rapport à insérer), 
le tableau récapitulatif des articles à la zone indiquée (Tableau des références à insérer) 
et le résumé du rapport à la zone indiquée (Résumé du rapport à insérer)

le rapport final doit être généré en markdown pour être traité par iA Writer.

Filename: modele-rapport.md
File contents:
----- BEGIN FILE CONTENTS -----
---
Auteur: Patrick Ostertag
Titre: Titre du rapport
AuteurAdresse: patrick.ostertag@gmail.com
AuteurSite: http://patrickostertag.ch
Date: Date du rapport
IAEngine:
IAEngineURL: 
---

# [%Titre]

---

`(Résumé du rapport à insérer)`

---

Table des matières

{{TOC}}

===

`(Corps du rapport à insérer)`

===

`(Tableau des références à insérer)`
----- END FILE CONTENTS -----
