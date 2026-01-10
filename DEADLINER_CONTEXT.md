# 📱 Projet : Deadliner - Cahier des Charges

## 1. Identité du Projet
* **Nom :** Deadliner
* **Type :** Application de gestion de tâches (To-Do List) orientée "Échéances".
* **Format :** PWA (Progressive Web App).
    * *Cible principale :* Mobile iOS (via installation écran d'accueil).
    * *Cible secondaire :* Navigateur Desktop (Chrome).
* **Philosophie :** Design moderne, sobre et épuré avec des touches de "Gamification" visuelle (animations).

## 2. Stack Technique (Légère)
* **Frontend :** HTML5, CSS3 (Tailwind CSS recommandé), **JavaScript (Vanilla ES6+)**.
    * *Note :* Pas de framework complexe (React, Vue, etc.).
* **Backend & Base de données :** Firebase (Firestore + Authentication).
* **Hébergement :** Vercel.
* **Versioning :** Git.

## 3. Concepts Clés & Données

### A. Les Entités
L'application distingue deux concepts fondamentaux :
1.  **Deadlines (Objectifs datés) :**
    * Servent de conteneurs temporels et d'objectifs principaux.
    * Possèdent obligatoirement une date limite.
    * Ordonnées chronologiquement (du plus proche au plus lointain).
2.  **Tâches (Actions) :**
    * Peuvent être liées à une Deadline (visuellement groupées) ou être indépendantes ("Orphelines").

### B. Typologie des Tâches
1.  **Tâche Classique :**
    * *Données :* Nom, Description (optionnelle), Durée estimée (optionnelle).
    * *Action :* Case à cocher simple (Fait / À faire).
2.  **Tâche Graduelle (À progression) :**
    * *Données :* Nom, Valeur courante, **Valeur cible personnalisable** (définie par l'utilisateur).
    * *Exemple :* Lire 50 pages (0/50), Boire 5 verres d'eau (0/5), etc.
    * *Action :* Incrémentation progressive jusqu'à l'objectif.

### C. Organisation
* **Dossiers (Projets) :**
    * Système de classement par glisser-déposer (Drag & Drop).
    * Personnalisation : Nom et Couleur.
* **Étiquettes (Tags) :**
    * Système de classification transversale.
    * Personnalisation : Nom et Couleur.

## 4. Fonctionnalités & Interface

### Vues Principales
1.  **Vue Liste (Accueil) :**
    * **Barre de recherche** incluse pour filtrer rapidement.
    * **Tri par défaut :** Par Deadlines (Date croissante).
    * **Tri secondaire :** Par durée estimée.
2.  **Vue Calendrier :**
    * Visualisation mensuelle/hebdomadaire des Deadlines et tâches.

### Expérience Utilisateur (UX)
* **Authentification :** Nom d'utilisateur (ou Email) + Mot de passe.
* **Gamification :** Animations satisfaisantes à la complétion (confettis, checks animés), mais pas de système de points/niveaux.
* **Notifications :** Push Web (si l'application est installée sur l'appareil) pour les rappels de deadlines.

## 5. Structure de Données (Modèle JSON)
*Représentation simplifiée pour le stockage Firebase Firestore.*

```json
{
  "users": {
    "userId_xyz": {
      "profile": { "username": "Alex", "email": "..." },
      
      "deadlines": [
        { "id": "d1", "title": "Rendu Projet", "date": "2023-12-31", "color": "#FF0000" }
      ],
      
      "tasks": [
        { 
          "id": "t1", 
          "type": "CLASSIC", 
          "title": "Faire la maquette", 
          "done": false, 
          "deadlineId": "d1", 
          "folderId": "f_pro",
          "tags": ["urgent"] 
        },
        { 
          "id": "t2", 
          "type": "GRADUAL", 
          "title": "Pages lues", 
          "current": 12, 
          "target": 350, 
          "deadlineId": null 
        }
      ],
      
      "folders": [
        { "id": "f_pro", "name": "Travail", "color": "blue" }
      ],
      
      "tags": [
        { "id": "urgent", "name": "Urgent", "color": "red" }
      ]
    }
  }
}