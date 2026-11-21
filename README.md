# ANSAROUDINE ZIKR

Application Android collaborative de décompte de Zikr, en temps réel, entièrement en français.

Plusieurs personnes participent à une ou plusieurs campagnes de Zikr (par exemple « 100 000 Astaghfirullah »). Chaque participant compte de son côté, et tous les téléphones sont synchronisés automatiquement.

## Fonctionnalités

### Comptes
- Deux types de comptes : **Administrateur** et **Participant**.
- **Administrateur principal** (propriétaire), créé au premier lancement depuis l'écran « Configurer l'application ». Il peut :
  créer et supprimer des administrateurs, nommer administrateur un participant, retirer les droits d'un administrateur,
  désactiver et réactiver n'importe quel compte.
- Les administrateurs créent, modifient, recherchent, désactivent et suppriment des participants, et réinitialisent leurs mots de passe.
- Connexion par **identifiant + mot de passe** (pas besoin d'adresse e-mail). Le mot de passe provisoire donné par l'administrateur doit être changé à la première connexion.

### Campagnes
- Titre, type de Zikr (avec suggestions), description, date de début, date de fin facultative, objectif global.
- L'administrateur **coche les participants** puis attribue un **objectif personnel** à chacun (outils : même objectif pour tous, répartition automatique de l'objectif global). La somme des objectifs est comparée en direct à l'objectif global.
- Objectifs modifiables à tout moment. Clôture, réouverture, suppression (uniquement s'il n'y a encore aucun décompte).

### Décompte
- Grand bouton **+1**, boutons **+10**, **+33**, **+100**, **valeur personnalisée**, bouton **Annuler** (dernier ajout) et correction manuelle.
- Option : compter avec les touches de volume ; vibration à chaque appui ; écran maintenu allumé.
- **Fonctionne hors ligne** : chaque appui est enregistré immédiatement sur le téléphone puis envoyé dès que le réseau revient (même application fermée). Chaque envoi porte un identifiant unique : il n'est **jamais compté deux fois**.

### Tableaux de bord
- **Participant** : son objectif, réalisé, restant, pourcentage, total général et progression globale de la campagne, graphique de ses 7 derniers jours.
- **Administrateur** : toutes les campagnes (en cours, à venir, terminées), tous les participants, objectifs attribués, réalisé / restant / pourcentage de chacun, statistiques générales, graphique sur 14 jours, journal d'activité.

### Historique (conservé définitivement)
- Tous les décomptes (y compris les annulations, enregistrées comme corrections), toutes les campagnes, toutes les participations et toutes les modifications importantes (journal d'audit).
- Un compte supprimé est conservé de façon anonyme dans l'historique : aucun décompte n'est perdu.

### Notifications
Envoyées lorsqu'un administrateur crée une campagne, lorsqu'un participant est ajouté à une campagne, lorsqu'un participant atteint son objectif, lorsque l'objectif global est atteint, lorsqu'un administrateur ajoute un nouveau participant et lorsqu'un administrateur est nommé. Elles arrivent en temps réel et, application fermée, sont vérifiées toutes les 15 minutes.

## Architecture

| Élément | Technologie |
|---|---|
| Application | Kotlin, Jetpack Compose (Material 3), Navigation Compose, WorkManager |
| Serveur | Supabase : PostgreSQL, Auth, Realtime, Edge Functions |
| Client Supabase | supabase-kt 3 (Postgrest, Auth, Realtime, Functions) |

```
app/                         Application Android
  data/                      Modèles, accès aux données, préférences
  sync/                      File d'attente hors ligne, synchronisation, temps réel
  notif/                     Notifications (temps réel + tâche périodique)
  ui/                        Écrans (connexion, participant, administration)
supabase/
  migrations/                Schéma complet : tables, index, fonctions, RLS, temps réel
  functions/admin-users/     Fonction sécurisée de gestion des comptes
  tests/                     Tests SQL de sécurité, de fonctionnement et de charge
.github/workflows/           Intégration continue : tests SQL, tests unitaires, APK
```

### Sécurité
- **Row Level Security** sur toutes les tables : un participant ne voit que son profil, ses participations, ses décomptes, ses notifications et les campagnes auxquelles il participe. Les administrateurs voient tout.
- **Aucune écriture directe** n'est autorisée depuis l'application : toutes les modifications passent par des fonctions SQL qui vérifient les droits, valident les données et journalisent les actions.
- Les opérations sur les comptes (création, mot de passe, désactivation, suppression, rôles) passent par la fonction Edge `admin-users`, seule détentrice de la clé de service. Les droits sont vérifiés côté serveur (seul l'administrateur principal gère les administrateurs ; le compte propriétaire est intouchable).
- Un compte désactivé est bloqué immédiatement (règles RLS) et ne peut plus se connecter.

### Performance
- Les appuis rapides sont regroupés avant envoi (une requête au lieu de dizaines).
- Mise à jour atomique des compteurs personnels et globaux dans une seule transaction, avec ordre de verrouillage constant (pas d'interblocage).
- Test de charge : 50 participants simultanés, 2 000 envois en moins de 3 secondes, totaux parfaitement cohérents.
- Listes paginées et recherche indexée (trigrammes) pour des centaines de participants.

## Installation du serveur Supabase

1. Appliquer `supabase/migrations/20261121000001_schema.sql` au projet.
2. Déployer la fonction `supabase/functions/admin-users` (vérification JWT désactivée : la fonction vérifie elle-même la session).
3. Renseigner l'URL du projet et la clé publique dans `supabase.properties`.

## Construction de l'APK

```bash
./gradlew testDebugUnitTest assembleRelease
```

L'APK est produit dans `app/build/outputs/apk/release/`. La signature utilise `keystore.properties` (non versionné) ou les secrets GitHub
`ZIKR_KEYSTORE_BASE64`, `ZIKR_KEYSTORE_PASSWORD`, `ZIKR_KEY_ALIAS`, `ZIKR_KEY_PASSWORD`. Sans ces éléments, l'APK est signé avec la clé de débogage.

## Tests

- `supabase/tests/rls_tests.sql` : sécurité (visibilité, écritures interdites, fonctions internes protégées), décomptes, idempotence, annulations, notifications, retrait de participants, clôture.
- `app/src/test` : file d'attente hors ligne (regroupement, annulation, ordre des mises à jour) et formats français.
