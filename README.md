# ANSAR ELEVAGE — Gestion Avicole

Application Android professionnelle de gestion d'élevage avicole, partagée entre plusieurs utilisateurs,
avec base de données centrale **Supabase**, synchronisation en temps réel et fonctionnement **hors connexion**.

## Fonctionnalités

| Rubrique | Contenu |
|---|---|
| **Tableau de bord** | Effectif total, lots, ponte du jour, stocks, achats, ventes, dépenses, revenus, bénéfice/perte, dettes, trésorerie. Graphiques. Filtres par période (jour, semaine, mois, année, dates), espèce, produit, lot, utilisateur |
| **Élevage** | Lots (espèce, race, arrivée, effectif, mâles/femelles, âge, provenance, coût). Naissances, décès, réformes, transferts entre lots, ajustements. Effectif actuel et mortalité calculés |
| **Ponte & production** | Saisie quotidienne : œufs pondus, cassés, commercialisables, fécondés, mis en couveuse, viande, fientes. Validation → ajout automatique au stock. Statistiques par jour/semaine/mois/année, par espèce et lot |
| **Achats** | Fournisseur, espèce, catégorie, produit, quantité, unité, prix, total automatique, payé, reste, mode de paiement, photo de facture. Augmente le stock. Paiements ultérieurs |
| **Ventes** | Client, produit, quantité, prix, total, encaissé, reste. Comptant ou crédit. **Vente impossible au-delà du stock** (contrôlé sur le téléphone ET sur le serveur). Facture PDF |
| **Stocks** | Stock initial, acheté, produit, vendu, perdu, mort, corrections, disponible. Par espèce/catégorie/produit. Historique des mouvements. Alertes de stock faible |
| **Dépenses** | Aliments, vaccins, médicaments, matériel, transport, main-d'œuvre, eau, électricité, entretien, autres (catégories modifiables). Justificatif photo |
| **Revenus** | Les ventes y figurent automatiquement (pas de double saisie) + autres revenus |
| **Clients / Fournisseurs** | Fiches, recherche, historique, totaux, paiements, dettes |
| **Finances** | Chiffre d'affaires, revenus, charges, résultat, encaissements, paiements, dettes, trésorerie (distingués clairement) |
| **Historique** | Toutes les opérations : qui, quoi, date et heure, valeurs avant/après. Filtres date, utilisateur, rubrique, espèce, produit |
| **Rapports** | Rapports mensuels et annuels PDF, détail Excel. Export PDF / Excel / CSV de chaque rubrique. Impression via le partage Android |
| **Paramètres** | Utilisateurs, rôles et permissions ; espèces, catégories, produits (ajout libre) ; devise, trésorerie initiale ; sauvegarde complète |

### Utilisateurs, rôles et permissions
- Rôles : **Administrateur principal** (accès total), **Administrateur**, **Gestionnaire**, **Employé**.
- Permissions individuelles par rubrique : *Consulter, Ajouter, Modifier, Supprimer*.
- Seul l'administrateur principal crée, modifie, désactive, réactive, réinitialise ou supprime les comptes et attribue les droits.
- Aucune limite de nombre d'utilisateurs dans l'application.
- Les droits sont appliqués **par la base de données elle-même** (Row Level Security) : un téléphone modifié ne peut pas les contourner.
- Chaque opération enregistre automatiquement l'utilisateur, la date, l'heure et le type d'opération.

### Synchronisation et hors connexion
- Toute saisie est d'abord enregistrée sur le téléphone (IndexedDB), puis envoyée au serveur.
- Sans Internet, l'application fonctionne normalement ; la pastille en haut indique « Hors ligne · n ».
- Au retour d'Internet, l'envoi est automatique. Chaque opération a un identifiant unique : **aucun doublon**.
- Les autres téléphones reçoivent les changements **en temps réel**.
- Conflits (deux personnes modifient la même fiche) : détectés par le serveur ; l'utilisateur choisit la version à garder (Paramètres → Synchronisation).

## Installation sur un téléphone Android (Samsung)

1. Sur le téléphone, ouvrez la page **Releases** du dépôt GitHub (connecté à votre compte) et téléchargez **`ANSAR-ELEVAGE.apk`**
   (ou recevez le fichier par WhatsApp / e-mail).
2. Ouvrez le fichier téléchargé. Si Android le demande : **Paramètres → Autoriser cette source** (Chrome ou Mes fichiers), puis revenez et touchez **Installer**.
3. Si « Play Protect » affiche un avertissement : **Plus de détails → Installer quand même** (l'application n'est pas sur le Play Store).
4. Ouvrez **ANSAR ELEVAGE**.

Les nouvelles versions s'installent par-dessus l'ancienne, sans perte de données.

## Connexion des utilisateurs

- **Administrateur principal** : se connecte avec son adresse e-mail et son mot de passe Supabase existant.
- **Ajouter un utilisateur** : Menu → Paramètres → Gestion des utilisateurs → **+**. Renseignez nom, prénom, téléphone, e-mail et rôle, puis ajustez les permissions.
  L'application génère un **mot de passe temporaire** à envoyer (bouton *Envoyer* → WhatsApp / SMS).
- **Première connexion** de l'utilisateur : e-mail + mot de passe temporaire, puis il **choisit son propre mot de passe**.
- **Mot de passe oublié** : l'administrateur utilise *Réinitialiser l'accès* (nouveau mot de passe temporaire).

## Architecture technique

- **Application** : React 18 + TypeScript + Vite, empaquetée pour Android avec **Capacitor 7** (`android/`).
- **Données locales** : IndexedDB (Dexie) + file d'attente d'envoi persistante.
- **Serveur** : Supabase (PostgreSQL, Auth, Realtime, Storage, Edge Functions) — projet « Gestion ».
  - Schéma : `supabase/migrations/` (tables `ae_*`, règles RLS, journal, contrôles de stock et de paiement).
  - Gestion des comptes : fonction serveur `supabase/functions/ae-utilisateurs` (la clé *service_role* reste sur le serveur, jamais dans l'APK).
- **Compilation** : GitHub Actions (`.github/workflows/build-apk.yml`) : tests, puis APK signé publié en artefact et dans *Releases*.

### Développement
```bash
npm ci
npm run dev            # application dans le navigateur
npm test               # tests des calculs
npm run build && npx cap sync android && node scripts/icones.mjs
cd android && ./gradlew assembleRelease
```

## Signature de l'APK

L'APK est signé avec une clé fixe incluse dans le dépôt (`android/app/ansar.keystore`), ce qui permet d'installer
les mises à jour par-dessus l'ancienne version. Pour une publication sur le **Google Play Store**, créez une clé privée :

1. Sur un ordinateur avec Java : `keytool -genkeypair -keystore ansar-prod.keystore -alias ansar -keyalg RSA -keysize 2048 -validity 10000`
2. Convertissez-la : `base64 -w0 ansar-prod.keystore > cle.txt`
3. Sur GitHub : **Settings → Secrets and variables → Actions → New repository secret**, créez
   `ANDROID_KEYSTORE_BASE64` (contenu de cle.txt), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (ansar), `ANDROID_KEY_PASSWORD`.
4. Les compilations suivantes utiliseront automatiquement cette clé. Conservez-la précieusement (sa perte empêche les mises à jour).
   Attention : changer de clé oblige à désinstaller une fois l'ancienne application.

## Sauvegardes

- Les données sont centralisées dans Supabase. Le forfait gratuit ne propose pas de sauvegarde automatique téléchargeable :
  utilisez **Paramètres → Sauvegarde des données** (Excel / JSON) régulièrement, ou passez au forfait Pro (sauvegardes quotidiennes).
- Le forfait gratuit Supabase met en pause un projet inactif pendant 7 jours : une utilisation régulière l'évite.
