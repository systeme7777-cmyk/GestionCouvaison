# Gestion Couvaison

Application Android de gestion des couvaisons d'un élevage, partagée entre **5 téléphones**, synchronisée en temps réel avec **Supabase** et utilisable **hors connexion**.

- Couvaisons : numéro unique automatique (`CV-2026-0001`), espèce, race, nombre d'œufs, couveuse, responsable, observations, photos. **Durée d'incubation entièrement libre** pour chaque couvaison (les durées par défaut des espèces se règlent dans Paramètres).
- Suivi automatique : jours écoulés, jours restants, date d'éclosion prévue, pourcentage, statut (en préparation, en incubation, proche de l'éclosion, éclosion terminée, annulée) et barre de progression.
- Œufs : fécondés, non fécondés, retirés, cassés, éclos, non éclos ; taux de fertilité et d'éclosion calculés ; mirages (fécondés / clairs / morts).
- Suivi du jour : température, humidité, retournements, notes, courbe d'évolution.
- Calendrier des opérations (retournement, mirage, contrôles, arrêt du retournement, préparation, éclosion) avec dates et heures personnalisables et **rappels par notification Android**.
- Couveuses : capacité, type, température, humidité, état (disponible / occupée / maintenance, mis à jour automatiquement), historique des couvaisons.
- Tableau de bord, statistiques et graphiques (par espèce, par mois, par couveuse, par responsable).
- Équipe : comptes individuels, administrateur, approbation des nouveaux comptes, **5 utilisateurs actifs maximum**, présence en ligne, historique complet des modifications avec leur auteur.
- Historique et recherche par espèce, race, date, numéro, couveuse, responsable, statut. **Exports PDF et Excel**.
- Confirmation avant toute suppression.

## Architecture

| Élément | Technologie |
|---|---|
| Interface | React 19 + TypeScript + Vite (`src/`) |
| Application Android | Capacitor 8 (`android/`) — paquet `com.gestioncouvaison.app` |
| Base de données, comptes, temps réel, photos | Supabase (Postgres + Auth + Realtime + Storage) |
| Stockage local hors ligne | IndexedDB (Dexie) |
| Rappels | Notifications locales Android |
| Exports | jsPDF (PDF), SheetJS (Excel) |

### Fonctionnement hors ligne

L'interface lit uniquement la base locale du téléphone. Chaque ajout, modification ou suppression est enregistré localement puis placé dans une file d'attente (`src/lib/sync.ts`). Dès que le réseau revient, la file est envoyée à Supabase dans l'ordre, puis le téléphone récupère les changements des autres. Pendant la connexion, Supabase Realtime transmet les modifications des autres téléphones en direct. Les données restent sur le téléphone après fermeture de l'application.

Le suivi du jour d'un lot porte un identifiant calculé à partir du lot et de la date. Si deux téléphones le saisissent hors ligne le même jour, il n'y a donc pas de doublon. En cas de modification simultanée d'un même champ, la dernière modification envoyée l'emporte. Le journal garde la trace des deux.

## Base de données Supabase

Projet : **Gestion Couvaison** (`brjygurugytgfbhioxkw`, région Francfort). Le script complet se trouve dans [`supabase/migrations/0001_schema.sql`](supabase/migrations/0001_schema.sql). Il a déjà été appliqué au projet.

| Table | Contenu |
|---|---|
| `profiles` | un profil par compte : nom, rôle, appareil, dernière connexion |
| `especes` | espèces et durée d'incubation par défaut (modifiable) |
| `couveuses` | couveuses : capacité, type, température, humidité, état |
| `couvaisons` | couvaisons et bilan des œufs |
| `operations` | calendrier des opérations et rappels |
| `mesures` | suivi journalier (température, humidité, retournements) |
| `mirages` | contrôles à la lampe |
| `photos` | photos (fichiers dans le bucket privé `photos`) |
| `historique` | journal automatique de toutes les modifications, avec l'auteur |

Sécurité (Row Level Security) :

| Rôle | Droits |
|---|---|
| `admin` | tout, y compris la gestion de l'équipe et les suppressions de couvaisons, couveuses et espèces |
| `operateur` | consulter, ajouter, modifier ; supprimer suivis, opérations, mirages, photos |
| `lecteur` | consultation seule |
| `en_attente` / `desactive` | aucun accès aux données |

Le **premier compte créé devient administrateur**. Les comptes suivants sont « en attente » jusqu'à leur approbation par l'administrateur. La limite de 5 comptes actifs est contrôlée par la base elle-même.

### Réglage Supabase à faire (une fois)

Dans le tableau de bord Supabase → **Authentication → Sign In / Providers → Email** :

- **Désactivez « Confirm email »**. Le service d'e-mail intégré de Supabase n'envoie qu'aux adresses des membres de votre organisation Supabase : sans ce réglage, vos collègues ne pourraient pas créer leur compte. L'approbation par l'administrateur protège déjà l'accès.
- Si vous préférez garder la confirmation par e-mail, configurez votre propre serveur d'envoi (Authentication → Emails → SMTP Settings).

Mot de passe oublié : l'administrateur peut réinitialiser un compte dans Authentication → Users. Chaque utilisateur peut changer son mot de passe dans l'application (Paramètres).

Pour recréer la base dans un autre projet : exécutez `supabase/migrations/0001_schema.sql` dans le SQL Editor, puis remplacez l'URL et la clé dans `.env.production`.

## Installer l'application sur les 5 téléphones

1. Récupérez `GestionCouvaison.apk` : onglet **Actions** du dépôt GitHub → dernière exécution « Construire l'APK Android » → artefact `GestionCouvaison-apk` (fichier zip contenant l'APK).
2. Envoyez le fichier sur chaque téléphone (WhatsApp, Bluetooth, câble USB, Google Drive…).
3. Sur le téléphone, ouvrez le fichier. Android demande d'**autoriser l'installation depuis cette source** : acceptez, puis « Installer ».
4. **Administrateur, en premier** : ouvrez l'application → « Créer un compte » (nom, e-mail, mot de passe). Ce premier compte devient administrateur.
5. **Chacune des 4 autres personnes** : installe l'APK et crée son compte.
6. L'administrateur ouvre l'onglet **Équipe** → « Demandes d'accès » → ⋮ → « Approuver comme opérateur » (ou « en lecture seule »).
7. Au premier lancement, acceptez les **notifications** pour recevoir les rappels.

La première connexion nécessite Internet. Ensuite, l'application fonctionne aussi sans réseau.

### Mettre à jour l'application

Augmentez `versionCode` / `versionName` dans `android/app/build.gradle` et `version` dans `package.json`, poussez sur GitHub, puis installez le nouvel APK **par-dessus** l'ancien : les données sont conservées. Un tag `v1.0.1` publie aussi l'APK dans les Releases.

### Signature de l'APK

Toutes les versions sont signées avec la même clé (`android/app/debug.keystore`), ce qui permet les mises à jour. **Le dépôt étant public, cette clé l'est aussi.** Pour une signature privée, créez une clé et ajoutez quatre secrets GitHub (Settings → Secrets → Actions) ; le workflow l'utilisera automatiquement :

```bash
keytool -genkeypair -keystore gestion.keystore -alias gestion -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 gestion.keystore   # valeur du secret KEYSTORE_BASE64
```

Secrets : `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`. Attention : un APK signé avec une nouvelle clé ne s'installe pas par-dessus l'ancien. Il faut désinstaller l'ancienne version (après synchronisation, les données sont sur le serveur), donc faites ce changement au tout début.

## Développement

```bash
npm install
npm run dev          # application dans le navigateur (http://localhost:5173)
npm test             # tests des calculs (dates, statuts, taux, plan d'opérations)
npm run build        # application web dans dist/
npx cap sync android # copie dans le projet Android
cd android && ./gradlew assembleRelease   # APK : android/app/build/outputs/apk/release/
```

La construction locale de l'APK nécessite le JDK 21 et le SDK Android (plateforme 36).

Structure :

```
src/lib/        calculs (calc.ts), dates, base locale (db.ts), synchronisation (sync.ts),
                rappels, exports PDF/Excel, filtres
src/pages/      écrans : Accueil, Couvaisons, fiche couvaison, formulaire, Calendrier,
                Couveuses, Statistiques, Équipe, Paramètres, Rapports, Connexion
src/components/ éléments communs
supabase/       script SQL
android/        projet Android (Capacitor)
tests/          tests unitaires
```
