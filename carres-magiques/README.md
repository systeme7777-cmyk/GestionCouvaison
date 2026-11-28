# Carrés Magiques

Application (français) qui calcule trois carrés magiques :

1. **Carré 1 (5×5, ÷65)** : nombre ÷ 65 → Q et R ; chaque case = k·Q (+R) (±1). Case centrale vide.
2. **Carré 2 (6×6, الله)** : (nombre − 46) ÷ 4 → Q et R ; 24 cases numérotées + 12 cases « الله ».
   Pour R ≠ 0, les cases n° 14, 15, 17, 20, 23, 24 (une par ligne, colonne et diagonale) sont augmentées.
3. **Carré 3 (5×5, 4 nombres)** : chaque nombre ÷ 4 → P (quotient) et S = 3P + reste ; coins = les 4 nombres.

Chaque résultat est vérifié automatiquement (toutes les lignes, colonnes, diagonales).

- `web/` : l'application (HTML autonome, installable comme PWA, fonctionne hors ligne).
- `android/` : emballage Android (WebView) ; l'APK est construit par le workflow
  « Build APK Carrés Magiques » (onglet Actions de GitHub → artefact `carres-magiques-apk`).
