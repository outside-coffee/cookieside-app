# Inside — gestion du laboratoire

Application React reliée à Supabase pour gérer produits, recettes, achats, production, ventes et stocks. Les familles prises en charge sont cookies, brownies, cinnamon rolls, croissants, cheesecakes et autres produits. Les cookies restent la première gamme à mettre en production.

Application en production : https://inside-lab-app.vercel.app/

## Mise en route

1. Utiliser le projet Supabase **Cookieside** existant. La migration `supabase/migrations/20260926_inside_product_families.sql` ajoute famille, unité de vente et rendement de lot. Elle conserve les tables, données et politiques RLS actuelles.
2. Copier `.env.example` vers `.env.local` et renseigner l'URL et la clé publique Supabase du projet. `REACT_APP_URL` doit contenir l'URL publique de l'environnement ; en production : `https://inside-lab-app.vercel.app`. Ne jamais mettre de clé `service_role` dans l'application React.
3. Exécuter `npm install`, puis `npm start`. Pour une version de production, exécuter `npm run build`.

La migration doit être appliquée **avant** de déployer cette version : le formulaire Produit enregistre trois nouveaux champs et la production appelle les fonctions SQL `create_production_batch` et `delete_production_batch`.

## Règles de gestion

- Une référence a une famille, une unité de vente (`pièce`, `part`, `boîte`...) et un rendement en unités par lot.
- Une recette indique la quantité d'ingrédient **par unité vendue**, dans l'unité de stock de cet ingrédient. Les colonnes historiques `qty_per_cookie` et `cost_per_cookie` sont conservées en base pour ne pas casser les données et écrans existants ; leur sens devient « par unité vendue ».
- La création d'une production vérifie les ingrédients et déduit leur stock dans une seule transaction Supabase. Une suppression rétablit les ingrédients et est refusée si les unités correspondantes ont déjà été vendues.
- Les ventes sont enregistrées dans Supabase. Le Google Sheets Inside est un support de préparation ; saisir la même vente dans les deux outils créerait des chiffres divergents.
- Les quantités de fourrage et les coûts de recettes non validés doivent être complétés avant de s'appuyer sur la marge estimée.

## Données existantes

La migration classe les références préexistantes en `Cookies`, avec `pièce` et 28 unités par lot. Les autres familles sont créées depuis l'écran Recettes et produits. L'application ne présume pas qu'une plaque de brownie ou qu'un cheesecake entier correspond à une unité vendue : choisir la portion commercialisée dans la fiche produit.

## Points à approfondir

Le modèle actuel suit le stock de produits finis par différence entre production et ventes. Il ne suit pas encore les pâtes congelées, les produits en cours, les pertes de produits finis, les dates limites ou les numéros de lots liés aux ventes. Ces flux demandent des tables dédiées avant une exploitation complète du laboratoire.
