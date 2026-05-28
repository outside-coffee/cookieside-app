# 🍪 Cookieside — Application de gestion

Cookieside — Application React + Supabase pour gérer la production, les ventes et les stocks de cookies.
**Partageable** : tous les utilisateurs voient et modifient les mêmes données en temps réel.

---

## 🚀 Installation en 5 étapes

### Étape 1 — Créer un projet Supabase (gratuit)
1. Allez sur [supabase.com](https://supabase.com) et créez un compte
2. Cliquez **New Project**, choisissez un nom et une région proche (ex: EU West)
3. Notez votre **Project URL** et **anon public key** (dans Settings > API)

### Étape 2 — Créer la base de données
1. Dans votre projet Supabase, ouvrez **SQL Editor**
2. Copiez-collez le contenu du fichier `supabase_schema.sql`
3. Cliquez **Run** — toutes les tables et données initiales sont créées

### Étape 3 — Configurer l'application
```bash
# Clonez ou téléchargez ce projet
cd outside-cookies

# Copiez le fichier d'environnement
cp .env.example .env.local

# Ouvrez .env.local et remplissez vos clés :
# REACT_APP_SUPABASE_URL=https://VOTRE_ID.supabase.co
# REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

### Étape 4 — Lancer l'application
```bash
npm install
npm start
```
L'app s'ouvre sur http://localhost:3000

### Étape 5 — Déployer pour partager
```bash
npm run build
```
Déployez le dossier `build/` sur :
- **[Vercel](https://vercel.com)** (gratuit, recommandé) : importez le repo GitHub, ajoutez les variables d'env
- **[Netlify](https://netlify.com)** (gratuit) : drag & drop du dossier `build/`
- **[Render](https://render.com)** : Static Site

---

## 📋 Fonctionnalités

### 📊 Dashboard
- KPIs en temps réel : stock, CA, marge, en attente livraison
- Graphique CA par variété
- Alertes automatiques stock cookies et matières premières
- Barre de stock visuelle par variété

### 🍪 Production
- Enregistrer un lot avec déduction automatique des MP
- Vérification des stocks avant production
- Calcul automatique du coût de revient
- Historique complet avec suppression

### 💰 Ventes
- Saisie avec prix conseillés B2B/B2C auto-remplis
- Calcul de marge en direct
- Marquer livré (unitaire ou tout d'un coup)
- Filtrage par statut (Vendu / Livré)
- Badge compteur sur l'onglet pour les ventes en attente

### 🥣 Matières premières
- Ajout, modification, suppression d'ingrédients
- Entrées de stock avec historique
- Alertes visuelles selon seuils configurables
- Prix par unité pour calcul de coût

### 📖 Recettes & Variétés
- Créer des variétés avec recette personnalisée
- Modifier les ingrédients et quantités par cookie
- Configurer les prix B2B/B2C par variété
- Calcul de marge automatique
- 10 couleurs disponibles pour identifier chaque variété

---

## 🏗️ Architecture technique

```
React 18 (Create React App)
├── src/
│   ├── lib/
│   │   ├── supabase.js     ← Client Supabase
│   │   └── api.js          ← Toutes les requêtes DB
│   ├── components/
│   │   └── UI.jsx          ← Composants partagés
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── Production.jsx
│   │   ├── Sales.jsx
│   │   ├── Ingredients.jsx
│   │   └── Varieties.jsx
│   ├── App.jsx             ← Routing + data fetching
│   └── index.css           ← Design system complet
└── public/
    └── index.html

Supabase PostgreSQL
├── ingredients             ← Matières premières
├── varieties               ← Types de cookies
├── recipes                 ← Recettes (variety ↔ ingredients)
├── sale_prices             ← Prix B2B/B2C
├── production              ← Historique production
├── sales                   ← Historique ventes
└── stock_movements         ← Mouvements de stock
```

---

## 🔐 Accès multi-utilisateurs

Par défaut, l'app est ouverte (pas d'authentification) — idéal pour une petite équipe de confiance.

Pour ajouter de l'authentification :
1. Activez **Auth** dans Supabase
2. Modifiez les **Row Level Security policies** dans `supabase_schema.sql`
3. Ajoutez un composant de login dans `App.jsx`

---

## 📦 Stack
- **React 18** — UI
- **Supabase** — PostgreSQL + API REST auto-générée
- **Recharts** — Graphiques
- **react-hot-toast** — Notifications
- **lucide-react** — Icônes
- **DM Serif Display + DM Sans** — Typographie
