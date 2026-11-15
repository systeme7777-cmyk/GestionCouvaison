// Test d'interface de bout en bout avec un serveur Supabase SIMULÉ (pour l'environnement sans accès réseau).
// Vérifie : connexion, tableau de bord, achat, contrôle du stock à la vente, vente, mode hors connexion,
// file d'attente persistante après rechargement, renvoi au retour du réseau, pages principales.
// Usage : node tests/ui-local.mjs <url-preview> <dossier-captures>
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }

const URL_APP = process.argv[2] ?? 'http://localhost:4173/';
const CAPTURES = process.argv[3] ?? '/tmp/captures';
const UID = '11111111-1111-4111-8111-111111111111';
const now = () => new Date().toISOString();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, email: 'admin@test.local' })}.sig`;

const base = () => ({ created_at: now(), updated_at: now(), created_by: UID, updated_by: UID, deleted_at: null });
const db = {
  ae_profils: [{ id: UID, ...base(), nom: 'Test', prenom: 'Admin', email: 'admin@test.local', role: 'admin_principal', permissions: {}, actif: true, supprime: false, doit_changer_mdp: false }],
  ae_especes: [{ id: 'e1', ...base(), nom: 'Poules', icone: '🐔', ordre: 1, actif: true }],
  ae_categories: [{ id: 'c1', ...base(), nom: 'Œufs', type: 'oeufs', ordre: 2 }, { id: 'c2', ...base(), nom: 'Animaux vivants', type: 'animaux', ordre: 1 }],
  ae_produits: [
    { id: 'p1', ...base(), nom: 'Œufs de consommation', espece_id: 'e1', categorie_id: 'c1', unite: 'œuf', stockable: true, seuil_alerte: 60, prix_vente: 75, categorie_revenu: "Vente d'œufs", actif: true },
    { id: 'p2', ...base(), nom: 'Poulets', espece_id: 'e1', categorie_id: 'c2', unite: 'tête', stockable: true, seuil_alerte: 0, prix_vente: 3000, categorie_revenu: 'Vente de poulets', actif: true },
  ],
  ae_parametres: [{ id: 'k1', ...base(), cle: 'devise', valeur: 'FCFA' }, { id: 'k2', ...base(), cle: 'nom_exploitation', valeur: 'ANSAR ELEVAGE' }],
};
const recus = [];
let horsLigne = false;

function erreur(r, code, msg) {
  return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code, message: msg, details: null, hint: null }) });
}

async function routeur(route) {
  const req = route.request();
  const u = new URL(req.url());
  if (horsLigne) return route.abort('internetdisconnected');
  if (u.pathname.startsWith('/auth/v1/token')) {
    const corps = req.postDataJSON?.() ?? {};
    if (corps.password && corps.password !== 'bonmotdepasse') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', message: 'Invalid login credentials' }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ access_token: JWT, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: UID, email: 'admin@test.local', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } }) });
  }
  if (u.pathname.startsWith('/auth/v1/user')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: UID, email: 'admin@test.local', aud: 'authenticated', role: 'authenticated' }) });
  if (u.pathname.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' });
  if (u.pathname === '/rest/v1/rpc/ae_connexion') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(db.ae_profils[0]) });
  if (u.pathname.startsWith('/rest/v1/ae_journal')) return route.fulfill({ contentType: 'application/json', body: '[]' });
  const m = u.pathname.match(/^\/rest\/v1\/(ae_[a-z_]+)$/);
  if (m) {
    const t = m[1];
    db[t] ??= [];
    if (req.method() === 'GET') {
      const idEq = u.searchParams.get('id')?.replace('eq.', '');
      const rows = idEq ? db[t].filter((r) => r.id === idEq) : db[t];
      const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(single ? rows[0] ?? null : rows) });
    }
    if (req.method() === 'POST') {
      const corps = req.postDataJSON();
      recus.push({ t, op: 'insert', corps });
      if (db[t].some((r) => r.id === corps.id)) return erreur(route, '23505', 'duplicate key');
      // Contrôle de stock comme le serveur réel
      if (t === 'ae_ventes') {
        const achat = (db.ae_achats ?? []).filter((a) => a.produit_id === corps.produit_id).reduce((s, a) => s + a.quantite, 0);
        const vendu = (db.ae_ventes ?? []).filter((a) => a.produit_id === corps.produit_id).reduce((s, a) => s + a.quantite, 0);
        if (corps.quantite > achat - vendu) return erreur(route, 'P0422', `AE_STOCK_INSUFFISANT: stock disponible : ${achat - vendu}`);
      }
      const row = { ...corps, updated_at: now(), updated_by: UID, created_by: UID };
      if ('quantite' in row && 'prix_unitaire' in row) row.montant_total = row.quantite * row.prix_unitaire;
      db[t].push(row);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(row) });
    }
    if (req.method() === 'PATCH') {
      const id = u.searchParams.get('id')?.replace('eq.', '');
      const corps = req.postDataJSON();
      recus.push({ t, op: 'update', corps });
      const r = db[t].find((x) => x.id === id);
      if (!r) return route.fulfill({ contentType: 'application/json', body: 'null' });
      Object.assign(r, corps, { updated_at: now() });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(r) });
    }
  }
  return route.fulfill({ contentType: 'application/json', body: '[]' });
}

const ok = [];
const verifier = (cond, msg) => { if (!cond) throw new Error('ÉCHEC : ' + msg); ok.push(msg); console.log('  ✔ ' + msg); };

const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ viewport: { width: 393, height: 851 }, deviceScaleFactor: 2, locale: 'fr-FR', hasTouch: true, isMobile: true });
await ctx.route(/supabase\.co/, routeur);
await ctx.routeWebSocket(/supabase\.co/, (ws) => ws.close());
const page = await ctx.newPage();
const erreursJs = [];
page.on('pageerror', (e) => erreursJs.push(e.message));
const capture = (n) => page.screenshot({ path: `${CAPTURES}/${n}.png` });

try {
  await page.goto(URL_APP);
  await page.getByText('Se connecter').waitFor();
  await capture('01-connexion');
  await page.getByLabel('Adresse e-mail').fill('admin@test.local');
  await page.getByLabel('Mot de passe').fill('mauvais');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByText('E-mail ou mot de passe incorrect.').waitFor();
  verifier(true, 'Mot de passe erroné refusé avec message en français');
  await page.getByLabel('Mot de passe').fill('bonmotdepasse');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByText('Effectif total').waitFor({ timeout: 15000 });
  verifier(true, 'Connexion puis tableau de bord');
  await page.getByText('Synchronisé').waitFor({ timeout: 15000 });
  await capture('02-tableau-de-bord');

  // Achat de 100 œufs à 50
  await page.goto(URL_APP + '#/achats?nouveau=1');
  await page.getByRole('dialog', { name: 'Nouvel achat' }).waitFor();
  await page.getByLabel('Fournisseur').fill('Ferme Diallo');
  await page.locator('.feuille select').nth(2).selectOption('p1');
  const champs = page.locator('.feuille input[type=number]');
  await champs.nth(0).fill('100');
  await champs.nth(1).fill('50');
  await page.getByText('Payé en totalité').click();
  await champs.nth(2).fill('3000');
  await capture('03-formulaire-achat');
  const recap = await page.locator('.recap').innerText();
  verifier(/5\s?000/.test(recap) && /2\s?000/.test(recap), 'Montant total (5 000) et reste à payer (2 000) calculés automatiquement');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Achat enregistré').waitFor();
  await page.waitForTimeout(1500);
  verifier(recus.some((r) => r.t === 'ae_achats' && r.op === 'insert' && r.corps.quantite === 100 && !('montant_total' in r.corps)), 'Achat envoyé au serveur (sans colonne calculée)');
  verifier(recus.some((r) => r.t === 'ae_fournisseurs' && r.corps.nom === 'Ferme Diallo'), 'Fiche fournisseur créée automatiquement');

  // Stock
  await page.goto(URL_APP + '#/stocks');
  await page.getByText('Œufs de consommation').waitFor();
  const ligneStock = await page.locator('.ligne', { hasText: 'Œufs de consommation' }).innerText();
  verifier(/100/.test(ligneStock), 'Stock des œufs = 100 après achat');
  await capture('04-stocks');

  // Vente supérieure au stock : bloquée
  await page.goto(URL_APP + '#/ventes?nouveau=1');
  await page.getByRole('dialog', { name: 'Nouvelle vente' }).waitFor();
  await page.locator('.feuille select').nth(2).selectOption('p1');
  await page.getByText('Stock disponible : 100').waitFor();
  const qv = page.locator('.feuille input[type=number]');
  await qv.nth(0).fill('120');
  await page.getByText('quantité trop élevée').waitFor();
  verifier(await page.getByRole('button', { name: 'Enregistrer la vente' }).isDisabled(), 'Vente de 120 > stock 100 bloquée');
  await capture('05-vente-bloquee');
  await qv.nth(0).fill('40');
  await page.getByLabel('Client').fill('Mme Ba');
  await page.getByText('Vente au comptant').click();
  await qv.nth(2).fill('0');
  await page.getByRole('button', { name: 'Enregistrer la vente' }).click();
  await page.getByText('Vente enregistrée').waitFor();
  await page.waitForTimeout(1200);
  verifier(recus.some((r) => r.t === 'ae_ventes' && r.corps.quantite === 40 && r.corps.montant_encaisse === 0), 'Vente à crédit de 40 œufs envoyée');
  await page.getByText(/crédit 3\s?000/).waitFor();
  verifier(true, 'Vente à crédit : reste à encaisser 3 000 affiché');
  await capture('06-ventes');

  // Hors connexion
  horsLigne = true;
  await ctx.setOffline(true);
  await page.goto(URL_APP + '#/depenses?nouveau=1').catch(() => {});
  await page.getByRole('dialog', { name: 'Nouvelle dépense' }).waitFor();
  await page.locator('.feuille input[type=number]').first().fill('15000');
  await page.getByLabel('Description').fill('Aliment ponte');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Dépense enregistrée').waitFor();
  await page.getByText(/Hors ligne · 1/).waitFor({ timeout: 10000 });
  verifier(true, 'Dépense enregistrée hors connexion, en attente (pastille « Hors ligne · 1 »)');
  await capture('07-hors-ligne');
  // Fermeture/réouverture de l'application (les fichiers de l'app sont locaux sur Android ;
  // seul le serveur Supabase reste injoignable)
  await ctx.setOffline(false);
  await page.reload();
  await page.getByText('Aliment ponte').waitFor({ timeout: 15000 });
  verifier(!recus.some((r) => r.t === 'ae_depenses'), 'Après fermeture/rechargement, la dépense est toujours là (non perdue)');

  // Retour du réseau
  horsLigne = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.getByText('Synchronisé').waitFor({ timeout: 20000 });
  verifier(recus.filter((r) => r.t === 'ae_depenses').length === 1, 'Retour d\'Internet : dépense envoyée une seule fois (pas de doublon)');

  // Pages principales
  for (const [chemin, texte, n] of [['#/finances', 'Compte de résultat', '08-finances'], ['#/elevage', 'Élevage', '09-elevage'], ['#/production', 'Ponte & production', '10-production'],
    ['#/menu', 'Raccourcis', '11-menu'], ['#/parametres', 'Gestion des utilisateurs', '12-parametres'], ['#/parametres/utilisateurs', 'Utilisateurs', '13-utilisateurs'],
    ['#/clients', 'Mme Ba', '14-clients'], ['#/revenus', 'Dont ventes', '15-revenus'], ['#/historique', 'Historique', '16-historique'], ['#/rapports', 'Rapport PDF', '17-rapports']]) {
    await page.goto(URL_APP + chemin);
    await page.getByText(texte).first().waitFor({ timeout: 10000 });
    await capture(n);
  }
  verifier(true, 'Toutes les rubriques s\'affichent');
  await page.goto(URL_APP + '#/finances');
  await page.locator('.carte', { hasText: 'Compte de résultat' }).getByText(/15\s000/).waitFor();
  const fin = await page.locator('.carte', { hasText: 'Compte de résultat' }).innerText();
  verifier(/3\s?000/.test(fin) && /5\s?000/.test(fin) && /15\s?000/.test(fin), 'Finances : ventes 3 000, achats 5 000, dépenses 15 000');

  // Nouvel utilisateur : formulaire et matrice de permissions
  await page.goto(URL_APP + '#/parametres/utilisateurs');
  await page.getByLabel('Ajouter un utilisateur').click();
  await page.getByText('Permissions individuelles').waitFor();
  await page.locator('.feuille select').selectOption('gestionnaire');
  verifier(await page.getByLabel('Achats Ajouter').isChecked(), 'Rôle Gestionnaire : droits par défaut appliqués (Achats > Ajouter)');
  await capture('18-ajout-utilisateur');

  verifier(erreursJs.length === 0, 'Aucune erreur JavaScript (' + erreursJs.join(' | ') + ')');
  console.log(`\n${ok.length} vérifications réussies.`);
} catch (e) {
  await capture('zz-echec').catch(() => {});
  console.error(e.message, '\nErreurs JS :', erreursJs);
  process.exitCode = 1;
} finally {
  await navigateur.close();
}
