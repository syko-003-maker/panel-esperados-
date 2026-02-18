# 🎯 TEMPLATES DISCORD - GUIDE RAPIDE POUR STAFF

**Pour qui:** État Major (non-techniques)
**Durée:** 3 minutes
**Objectif:** Apprendre à créer/modifier templates

---

## 🚀 DÉMARRER EN 3 ÉTAPES

### 1️⃣ Ouvrir la page Templates
```
Staff Dashboard
  ↓
Discord  
  ↓
Templates
```

### 2️⃣ Sélectionner un template
Cliquer sur l'un dans la **liste gauche**

Exemples:
- welcome_message
- absence_notification
- sanction_alert
- etc.

### 3️⃣ Vous êtes prêt à éditer! ✅

---

## 📝 CRÉER UN NOUVEAU TEMPLATE

### Méthode 1: Utiliser un Exemple (Plus facile)

```
COLONNE GAUCHE:
┌─────────────────────┐
│ ⚡ Exemples Rapides │
├─────────────────────┤
│ ✓ Absence Approuvée │ ← CLICKER CELUI-CI
│ ✓ Recrutement       │
│ ✓ Sanction          │
│ ✓ Dettes            │
└─────────────────────┘

→ Titre s'auto-remplit: "Absence Approuvée"
→ Contenu s'auto-remplit avec:
   ✅ Absence validée
   👤 Membre : {{rpName}}
   📅 Du : {{date}}
   🎖 Grade : {{grade}}

→ Vous pouvez maintenant modifier
```

### Méthode 2: Écrire de Zéro (Plus flexible)

```
COLONNE GAUCHE:
├─ Titre: [votre texte]
├─ Activé: [Toggle ON/OFF]

COLONNE CENTRE:
├─ Contenu: [écrivez ici]
│
├─ Cliquer variable pour l'insérer:
│  [Nom RP du membre]  ← insère {{rpName}}
│  [Mention Discord]   ← insère {{discordId}}
│  [SteamID]          ← insère {{steamId}}
│  [Grade]            ← insère {{grade}}
│  [Date]             ← insère {{date}}
│  [Nom famille]      ← insère {{familyName}}
│
├─ OU Ajouter emoji:
   [😊 Emoji] ← affiche emojis courants

COLONNE DROITE:
└─ Preview en temps réel
   (Vous voyez le résultat final)
```

---

## 🎨 ÉLÉMENTS CLÉS

### Titre
```
Champ: [Ex: Absence Approuvée]

Usage: Nom du template
N'apparaît pas dans le message Discord
Juste pour vous organiser
```

### Contenu (Texte Principal)
```
Champ: [Grande zone d'édition]

✅ Écrivez ce que vous voulez
✅ Saut de lignes automatiques
✅ Emojis supportés
✅ Variables {{dynamiques}}

Compteur caractères: 245 / ∞
```

### Variables
```
6 variables disponibles:

1️⃣ {{rpName}}
   Insère: Nom RP du membre (Ex: Juan Morales)
   Usage: Personnaliser pour le membre

2️⃣ {{discordId}}
   Insère: Mention Discord (Ex: @JuanMorales)
   Usage: Pour mentionner en Discord

3️⃣ {{steamId}}
   Insère: SteamID (Ex: 76561198000000000)
   Usage: Identifier joueur

4️⃣ {{grade}}
   Insère: Grade actuel (Ex: Soldado)
   Usage: Afficher position

5️⃣ {{date}}
   Insère: Date d'aujourd'hui
   Usage: Automatique

6️⃣ {{familyName}}
   Insère: Nom de la famille (Los Esperados)
   Usage: Constante
```

### Emojis
```
Bouton: [😊 Emoji]

Affiche 10 emojis courants:
✅ ❌ 🎉 👤 📅 🎖 💰 ⚠️ 🔔 📌

Cliquer emoji → insérer au curseur
```

### Activé (Toggle)
```
Toggle: [ON] [OFF]

ON  = Template actif (utilisé)
OFF = Template inactif (pas utilisé)
```

### Preview
```
Colonne droite: Montre le résultat final

Exemple:
Vous écrivez: "Candidat : {{rpName}}"
Preview affiche: "Candidat : Juan Morales"

Variables:
- En surbrillance bleu
- Remplacées par fake data
```

---

## 💡 ASTUCES

### 💡 Utiliser les Exemples
```
⚡ Exemples Rapides = Les plus rapides

Au lieu de taper, simplement cliquer exemple
→ Titre + Contenu préremplis
→ Éditer si besoin
→ Enregistrer
```

### 💡 Copier Preview
```
Bouton [✓ Copier] dans la preview

Utile pour:
- Vérifier texte exact
- Partager avec collègues
- Garder en backup
```

### 💡 Tester Avant Enregistrer
```
La preview affiche le résultat final

Avant d'enregistrer:
- Vérifier la preview
- Voir les variables remplacées
- Rectifier si besoin
```

### 💡 Faire des Erreurs
```
C'est pas grave!

Bouton [Annuler]:
- Revenir à la version précédente
- Aucune donnée perdue
- Essayer à nouveau
```

---

## 📋 EXEMPLES COMPLETS

### Exemple 1: Absence Approuvée

```
TITRE: Absence Approuvée

CONTENU:
✅ Absence validée

👤 Membre : {{rpName}}
📅 Du : {{date}}
🎖 Grade : {{grade}}

PREVIEW AFFICHE:
✅ Absence validée

👤 Membre : Juan Morales
📅 Du : 05/02/2026
🎖 Grade : Soldado
```

### Exemple 2: Recrutement Accepté

```
TITRE: Recrutement Accepté

CONTENU:
🎉 Recrutement accepté !

👤 Candidat : {{rpName}}
🆔 Steam : {{steamId}}
📌 Bienvenue chez {{familyName}}

PREVIEW AFFICHE:
🎉 Recrutement accepté !

👤 Candidat : Juan Morales
🆔 Steam : 76561198000000000
📌 Bienvenue chez Los Esperados
```

### Exemple 3: Sanction

```
TITRE: Sanction

CONTENU:
⚠️ Sanction appliquée

👤 Membre : {{rpName}}
🎖 Grade : {{grade}}
📋 Discord : {{discordId}}

Raison : Comportement inadéquat

PREVIEW AFFICHE:
⚠️ Sanction appliquée

👤 Membre : Juan Morales
🎖 Grade : Soldado
📋 Discord : @JuanMorales

Raison : Comportement inadéquat
```

---

## ⏱️ WORKFLOW TYPIQUE

```
1️⃣ OUVRIR PAGE
   Staff Dashboard → Templates Discord
   ⏱️ 5 secondes

2️⃣ SÉLECTIONNER EXEMPLE
   Colonne gauche → Clicker "Absence Approuvée"
   ⏱️ 3 secondes

3️⃣ AJUSTER SI BESOIN
   Modifier titre/contenu/emoji
   ⏱️ 10 secondes

4️⃣ VÉRIFIER PREVIEW
   Colonne droite → Voir résultat
   ⏱️ 5 secondes

5️⃣ ACTIVER ET ENREGISTRER
   Toggle ON → Clicker [Enregistrer]
   ⏱️ 2 secondes

TOTAL: 25 secondes ✅
```

---

## ❓ FAQ

### Q: Je veux ajouter un emoji?
A: 
1. Clicker [😊 Emoji]
2. Picker affiche emojis courants
3. Cliquer emoji pour l'insérer
4. Continuer édition

### Q: Que signifie {{rpName}}?
A:
C'est une variable = placeholder
Sera remplacé automatiquement
Ex: {{rpName}} → Juan Morales

### Q: Qu'est-ce qu'un toggle "Activé"?
A:
- ON  = Template utilisé
- OFF = Template désactivé (pas utilisé)

### Q: Puis-je avoir des erreurs?
A:
Non, impossible!
Tout est cliquable/sélectionnable
Aucun code technique à écrire

### Q: J'ai enregistré par erreur?
A:
Pas grave!
Bouton [Annuler] revient à l'ancienne version

### Q: Comment copier la preview?
A:
Clicker [✓ Copier] dans la preview
Texte copié dans presse-papiers

### Q: Combien de variables?
A:
6 variables au total:
1. Nom RP
2. Mention Discord  
3. SteamID
4. Grade
5. Date
6. Nom famille

### Q: Puis-je créer 100 templates?
A:
Oui! Autant que vous voulez
Chaque template = cliquable + éditable

---

## 🎓 CONSEILS PRO

### 💡 Conseil 1: Utiliser Exemples
Gain de temps énorme
Exemples = templates testés et approuvés

### 💡 Conseil 2: Tester sur Discord
Avant d'enregistrer:
- Copier preview
- Poster sur Discord de test
- Vérifier résultat
- Puis enregistrer

### 💡 Conseil 3: Coder en Français
Plutôt que anglais:
- ✅ "Recrutement accepté"
- ❌ "Recruitment accepted"

### 💡 Conseil 4: Être Cohérent
Tous les templates doivent avoir:
- même format
- même style emojis
- même ton (professionnels)

### 💡 Conseil 5: Documenter
Méta-note pour vous-même:
- À quoi ce template sert?
- Quand le déclencher?
- Exemple: "Quand absence approuvée par État Major"

---

## 🆘 BESOIN D'AIDE?

### Si template n'apparaît pas
1. Vérifier toggle "Activé" = ON
2. Vérifier que vous l'avez enregistré
3. Rechager la page
4. Contacter admin si persiste

### Si variables ne s'insèrent pas
1. Cliquer directement sur le bouton variable
2. Ou cliquer dans textarea puis variable
3. Ou utiliser Ctrl+Z pour annuler
4. Réessayer

### Si preview vide
1. Vérifier que contenu n'est pas vide
2. Cliquer [Enregistrer]
3. Preview s'actualise

### Si save ne marche pas
1. Vérifier connexion internet
2. Vérifier que toggle "Activé" = ON
3. Attendre 2 secondes (sauvegarde en cours)
4. Contacter admin

---

## 📞 SUPPORT

**Questions?**
- Demander à l'État Major
- Contacter administrateur panel
- Chercher dans documentation complète

**Bugs?**
- Signaler à administrateur
- Fournir screenshot
- Décrire actions avant bug

---

## ✅ VOUS ÊTES PRÊT!

Vous savez maintenant:
✅ Ouvrir templates
✅ Sélectionner exemplaires
✅ Éditer contenu
✅ Insérer variables
✅ Ajouter emojis
✅ Vérifier preview
✅ Enregistrer

🎉 Allez créer de beaux templates!

---

*Guide rapide - 3 minutes*
*Plus d'infos? Voir TEMPLATES-STAFF-FRIENDLY-UX.md*
