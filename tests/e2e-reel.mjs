// Tests de bout en bout sur la VRAIE base Supabase (exécutés dans GitHub Actions).
// Nécessite un compte administrateur principal de test : E2E_EMAIL / E2E_PASSWORD.
// Couvre : connexion, création d'utilisateurs, mots de passe temporaires, permissions (RLS),
// achats, ventes, contrôle de stock serveur, production validée -> stock, paiements, conflits,
// synchronisation temps réel entre deux téléphones, mode hors connexion, désactivation, suppression.
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()]));
const URL_SB = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY;
const APP = process.argv[2] ?? 'http://localhost:4173/';
const CAPT = process.argv[3] ?? 'captures-e2e';
const EMAIL = process.env.E2E_EMAIL, MDP = process.env.E2E_PASSWORD;
if (!EMAIL || !MDP) { console.log('E2E_EMAIL / E2E_PASSWORD absents : tests réels ignorés.'); process.exit(0); }
fs.mkdirSync(CAPT, { recursive: true });

const MARQUE = 'E2E-' + Date.now().toString(36);
const resultats = [];
const verifier = (cond, msg, detail = '') => {
  resultats.push({ ok: !!cond, msg });
  console.log(`  ${cond ? '✔' : '✘'} ${msg}${!cond && detail ? ' — ' + detail : ''}`);
  if (!cond) process.exitCode = 1;
};
const client = () => createClient(URL_SB, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
async function jusqua(fn, ms = 20000, pas = 500) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { try { if (await fn()) return true; } catch { /* */ } await attendre(pas); }
  return false;
}

const admin = client();
const { data: s0, error: e0 } = await admin.auth.signInWithPassword({ email: EMAIL, password: MDP });
if (e0) { console.error('Connexion admin impossible :', e0.message); process.exit(1); }
const ADMIN_ID = s0.user.id;
console.log('Administrateur de test connecté :', ADMIN_ID);

const fn = async (sb, corps) => {
  const { data, error } = await sb.functions.invoke('ae-utilisateurs', { body: corps });
  if (error) { let m = error.message; try { m = (await error.context.json()).erreur ?? m; } catch { /* */ } return { erreur: m }; }
  return data;
};
const produit = async (nom) => (await admin.from('ae_produits').select('*').eq('nom', nom).single()).data;
const creesUsers = [];

let navigateur;
try {
  // ---------------------------------------------------------------- Utilisateurs
  console.log('\n[Utilisateurs]');
  const rG = await fn(admin, { action: 'creer', email: `${MARQUE.toLowerCase()}-g@ansar-test.dev`, prenom: 'Gestion', nom: MARQUE, role: 'gestionnaire',
    permissions: { elevage: { lire: true, ajouter: true, modifier: true }, achats: { lire: true, ajouter: true, modifier: true }, ventes: { lire: true, ajouter: true, modifier: true }, stocks: { lire: true, ajouter: true }, production: { lire: true, ajouter: true, modifier: true }, clients: { lire: true, ajouter: true }, fournisseurs: { lire: true, ajouter: true } } });
  verifier(rG.ok && rG.mot_de_passe_temporaire?.length >= 8, 'Création d\'un gestionnaire avec mot de passe temporaire', JSON.stringify(rG));
  const rE = await fn(admin, { action: 'creer', email: `${MARQUE.toLowerCase()}-e@ansar-test.dev`, prenom: 'Employe', nom: MARQUE, role: 'employe',
    permissions: { ventes: { lire: true, ajouter: true }, stocks: { lire: true }, production: { lire: true, ajouter: true } } });
  verifier(rE.ok, 'Création d\'un employé', JSON.stringify(rE));
  creesUsers.push(rG.profil?.id, rE.profil?.id);
  const doublon = await fn(admin, { action: 'creer', email: `${MARQUE.toLowerCase()}-e@ansar-test.dev`, role: 'employe' });
  verifier(!!doublon.erreur, 'Refus de créer deux fois le même utilisateur');

  const emp = client();
  const { error: le } = await emp.auth.signInWithPassword({ email: `${MARQUE.toLowerCase()}-e@ansar-test.dev`, password: rE.mot_de_passe_temporaire });
  verifier(!le, 'Connexion de l\'employé avec le mot de passe temporaire');
  const { data: pe } = await emp.rpc('ae_connexion');
  verifier(pe?.doit_changer_mdp === true && pe?.derniere_connexion, 'Changement de mot de passe exigé + dernière connexion enregistrée');
  const nouveauMdp = 'Perso-' + MARQUE + '9';
  const { error: ue } = await emp.auth.updateUser({ password: nouveauMdp });
  await emp.rpc('ae_mot_de_passe_change');
  const { data: pe2 } = await emp.from('ae_profils').select('doit_changer_mdp').eq('id', pe.id).single();
  verifier(!ue && pe2?.doit_changer_mdp === false, 'L\'employé définit son propre mot de passe');

  const pirate = await fn(emp, { action: 'creer', email: 'pirate@ansar-test.dev', role: 'admin_principal' });
  verifier(/réservée/.test(pirate.erreur ?? ''), 'Un employé ne peut pas créer de compte ni s\'attribuer des droits');

  // ---------------------------------------------------------------- Permissions (RLS)
  console.log('\n[Permissions]');
  const { error: d1 } = await emp.from('ae_depenses').insert({ categorie: 'Eau', montant: 1, description: MARQUE });
  verifier(d1 && /row-level security/i.test(d1.message), 'Employé sans droit « Dépenses » : ajout refusé par la base');
  const { data: lecture } = await emp.from('ae_depenses').select('id');
  verifier(Array.isArray(lecture) && lecture.length === 0, 'Employé sans droit « Dépenses » : aucune dépense visible');
  const rp = await fn(admin, { action: 'modifier', id: rE.profil.id, permissions: { ...rE.profil.permissions, depenses: { lire: true, ajouter: true } } });
  verifier(rp.ok, 'L\'administrateur accorde le droit « Dépenses > Ajouter »');
  const { error: d2 } = await emp.from('ae_depenses').insert({ categorie: 'Eau', montant: 1500, description: MARQUE });
  verifier(!d2, 'Après modification des permissions, l\'employé peut ajouter une dépense', d2?.message);

  // ---------------------------------------------------------------- Achats / ventes / stocks
  console.log('\n[Achats, ventes, stocks]');
  const pOeuf = await produit('Œufs de caille');
  const { data: av } = await admin.rpc('ae_peut', { m: 'stocks', a: 'lire' });
  verifier(av === true, 'Administrateur principal : accès total');
  const stockAvant = async () => {
    const somme = async (t, f = (q) => q) => ((await f(admin.from(t).select('quantite').eq('produit_id', pOeuf.id).is('deleted_at', null))).data ?? []).reduce((s, r) => s + Number(r.quantite), 0);
    const ach = await somme('ae_achats', (q) => q.eq('ajoute_stock', true));
    const ven = await somme('ae_ventes');
    const mv = ((await admin.from('ae_mouvements').select('type,quantite').eq('produit_id', pOeuf.id).is('deleted_at', null)).data ?? [])
      .reduce((s, r) => s + (['perte', 'mort'].includes(r.type) ? -1 : 1) * Number(r.quantite), 0);
    return ach - ven + mv;
  };
  const s0b = await stockAvant();
  const ges = client();
  await ges.auth.signInWithPassword({ email: `${MARQUE.toLowerCase()}-g@ansar-test.dev`, password: rG.mot_de_passe_temporaire });
  const { data: achat, error: ea } = await ges.from('ae_achats').insert({ produit_id: pOeuf.id, quantite: 100, prix_unitaire: 25, montant_paye: 1000, fournisseur_nom: MARQUE, observations: MARQUE }).select().single();
  verifier(!ea && Number(achat.montant_total) === 2500, 'Achat par le gestionnaire : montant total calculé par le serveur (2 500)', ea?.message);
  verifier(achat.created_by === rG.profil.id, 'L\'achat enregistre automatiquement l\'utilisateur responsable');
  verifier(await stockAvant() === s0b + 100, 'Le stock augmente de 100 après l\'achat');
  const { error: ev1 } = await emp.from('ae_ventes').insert({ produit_id: pOeuf.id, quantite: s0b + 101, prix_unitaire: 40, client_nom: MARQUE });
  verifier(ev1 && /AE_STOCK_INSUFFISANT/.test(ev1.message), 'Vente supérieure au stock refusée par le serveur', ev1?.message);
  const { data: vente, error: ev2 } = await emp.from('ae_ventes').insert({ produit_id: pOeuf.id, quantite: 30, prix_unitaire: 40, montant_encaisse: 200, client_nom: MARQUE, observations: MARQUE }).select().single();
  verifier(!ev2 && vente.numero?.startsWith('F-'), 'Vente à crédit acceptée, numéro de facture attribué', ev2?.message);
  verifier(await stockAvant() === s0b + 70, 'Le stock diminue de 30 après la vente');
  const { error: ep1 } = await admin.from('ae_paiements').insert({ type: 'encaissement', vente_id: vente.id, montant: 5000 });
  verifier(ep1 && /PAIEMENT_EXCESSIF/.test(ep1.message), 'Encaissement supérieur au reste dû refusé');
  const { error: ep2 } = await admin.from('ae_paiements').insert({ type: 'encaissement', vente_id: vente.id, montant: 1000, observations: MARQUE });
  verifier(!ep2, 'Encaissement partiel de la dette client accepté');
  const { error: ed } = await emp.from('ae_ventes').update({ deleted_at: new Date().toISOString() }).eq('id', vente.id);
  verifier(ed && /suppression non autorisée|row-level/i.test(ed.message), 'Employé sans droit « Supprimer » : suppression refusée', ed?.message);

  // ---------------------------------------------------------------- Production -> stock
  console.log('\n[Production]');
  const { data: prod, error: epr } = await ges.from('ae_productions').insert({ espece_id: pOeuf.espece_id, oeufs_pondus: 60, oeufs_casses: 5, oeufs_commercialisables: 55, produit_oeufs_id: pOeuf.id, valide: false, observations: MARQUE }).select().single();
  verifier(!epr && await stockAvant() === s0b + 70, 'Production non validée : stock inchangé', epr?.message);
  await ges.from('ae_productions').update({ valide: true, updated_at: prod.updated_at }).eq('id', prod.id);
  verifier(await stockAvant() === s0b + 125, 'Production validée : +55 œufs commercialisables en stock');

  // ---------------------------------------------------------------- Conflit
  console.log('\n[Conflits]');
  const { data: a2 } = await admin.from('ae_achats').select('updated_at').eq('id', achat.id).single();
  await admin.from('ae_achats').update({ observations: MARQUE + ' admin', updated_at: a2.updated_at }).eq('id', achat.id);
  const { error: ec } = await ges.from('ae_achats').update({ observations: MARQUE + ' gestionnaire', updated_at: achat.updated_at }).eq('id', achat.id);
  verifier(ec && /AE_CONFLIT/.test(ec.message), 'Modification concurrente détectée (conflit) au lieu d\'écraser silencieusement');

  // ---------------------------------------------------------------- Historique
  const { data: hist } = await admin.from('ae_journal').select('*').eq('enregistrement_id', achat.id);
  verifier(hist?.some((h) => h.action === 'creation' && h.user_id === rG.profil.id) && hist?.some((h) => h.action === 'modification' && h.user_id === ADMIN_ID),
    'Historique : création et modification avec utilisateur, date et heure');

  // ---------------------------------------------------------------- Application : deux téléphones
  console.log('\n[Application : synchronisation entre téléphones et hors connexion]');
  navigateur = await chromium.launch();
  const tel = async () => {
    const ctx = await navigateur.newContext({ viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true, locale: 'fr-FR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('   [erreur JS]', e.message));
    return { ctx, page };
  };
  const t1 = await tel(), t2 = await tel();
  const connecter = async ({ page }, email, mdp) => {
    await page.goto(APP);
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe').fill(mdp);
    await page.getByRole('button', { name: 'Se connecter' }).click();
  };
  await connecter(t1, EMAIL, MDP);
  await t1.page.getByText('Effectif total').waitFor({ timeout: 30000 });
  verifier(true, 'Téléphone 1 (administrateur) connecté à la vraie base');
  await connecter(t2, `${MARQUE.toLowerCase()}-g@ansar-test.dev`, rG.mot_de_passe_temporaire);
  await t2.page.getByText('Choisissez votre mot de passe').waitFor({ timeout: 30000 });
  const nmdpG = 'Gest-' + MARQUE + '7';
  await t2.page.getByLabel('Nouveau mot de passe').fill(nmdpG);
  await t2.page.getByLabel('Confirmer le mot de passe').fill(nmdpG);
  await t2.page.getByRole('button', { name: 'Enregistrer' }).click();
  await t2.page.getByText('Œufs aujourd').waitFor({ timeout: 30000 });
  verifier(true, 'Téléphone 2 (gestionnaire) : première connexion, choix du mot de passe, accès');
  await t1.page.screenshot({ path: `${CAPT}/tel1-accueil.png` });
  await t2.page.screenshot({ path: `${CAPT}/tel2-accueil.png` });

  // Téléphone 2 regarde le stock ; téléphone 1 fait un achat -> mise à jour en temps réel
  await t2.page.goto(APP + '#/stocks/' + pOeuf.id);
  await t2.page.getByText('Récapitulatif').waitFor({ timeout: 20000 });
  const lireStock = async (p) => (await p.locator('.kpi.vert .val').innerText()).replace(/\D/g, '');
  await jusqua(async () => (await lireStock(t2.page)) === String(s0b + 125), 20000);
  const avantRT = await lireStock(t2.page);
  await t1.page.goto(APP + '#/achats?nouveau=1');
  await t1.page.getByRole('dialog', { name: 'Nouvel achat' }).waitFor();
  await t1.page.getByLabel('Fournisseur').fill(MARQUE);
  await t1.page.locator('.feuille select').nth(2).selectOption(pOeuf.id);
  await t1.page.locator('.feuille input[type=number]').nth(0).fill('12');
  await t1.page.locator('.feuille input[type=number]').nth(1).fill('30');
  await t1.page.getByRole('dialog').getByLabel('Observations').fill(MARQUE);
  await t1.page.getByRole('button', { name: 'Enregistrer' }).click();
  const rt = await jusqua(async () => (await lireStock(t2.page)) === String(Number(avantRT) + 12), 30000);
  verifier(rt, `Synchronisation temps réel : le téléphone 2 voit le stock passer de ${avantRT} à ${Number(avantRT) + 12} sans recharger`);
  await t2.page.screenshot({ path: `${CAPT}/tel2-stock-temps-reel.png` });

  // Hors connexion sur le téléphone 2
  await t2.page.route(/supabase\.co/, (r) => r.abort('internetdisconnected'));
  await t2.page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await t2.page.goto(APP + '#/production?nouveau=1');
  await t2.page.getByRole('dialog', { name: 'Production du jour' }).waitFor();
  const dlg = t2.page.getByRole('dialog', { name: 'Production du jour' });
  await dlg.getByLabel('Espèce').selectOption(pOeuf.espece_id);
  await dlg.getByLabel('Œufs pondus').fill('77');
  await dlg.getByLabel('Observations').fill(MARQUE + ' horsligne');
  await dlg.getByRole('button', { name: 'Enregistrer' }).click();
  await t2.page.getByText(/Hors ligne · 1/).waitFor({ timeout: 15000 });
  verifier(true, 'Téléphone 2 hors connexion : saisie de production conservée en attente');
  await t2.page.screenshot({ path: `${CAPT}/tel2-hors-ligne.png` });
  const absent = (await admin.from('ae_productions').select('id').eq('observations', MARQUE + ' horsligne')).data;
  verifier(absent.length === 0, 'Pendant la coupure, rien n\'est arrivé sur le serveur');
  await t2.page.reload();
  await t2.page.getByText(/Hors ligne · 1/).waitFor({ timeout: 20000 });
  verifier(true, 'Application fermée et rouverte hors connexion : l\'opération n\'a pas disparu');
  await t2.page.unroute(/supabase\.co/);
  await t2.page.evaluate(() => window.dispatchEvent(new Event('online')));
  const arrive = await jusqua(async () => (await admin.from('ae_productions').select('id').eq('observations', MARQUE + ' horsligne')).data.length > 0, 30000);
  await attendre(4000);
  const nb = (await admin.from('ae_productions').select('id').eq('observations', MARQUE + ' horsligne')).data.length;
  verifier(arrive && nb === 1, `Retour d'Internet : opération envoyée automatiquement, une seule fois (${nb})`);
  const vu1 = await jusqua(async () => {
    await t1.page.goto(APP + '#/production');
    return (await t1.page.getByText('77 œufs').count()) > 0;
  }, 30000, 3000);
  verifier(vu1, 'La production saisie hors ligne sur le téléphone 2 apparaît sur le téléphone 1');

  // Erreur de stock sur une vente faite hors ligne, signalée dans l'application
  await t2.page.goto(APP + '#/parametres/synchronisation');
  await t2.page.getByText('Synchroniser maintenant').waitFor();
  await t2.page.screenshot({ path: `${CAPT}/tel2-synchronisation.png` });

  // ---------------------------------------------------------------- Désactivation / réinitialisation / suppression
  console.log('\n[Cycle de vie des comptes]');
  const rd = await fn(admin, { action: 'desactiver', id: rE.profil.id });
  const { data: vuDes } = await emp.from('ae_produits').select('id');
  verifier(rd.ok && vuDes.length === 0, 'Compte désactivé : plus aucun accès aux données');
  const ra = await fn(admin, { action: 'activer', id: rE.profil.id });
  const { data: vuRe } = await emp.from('ae_produits').select('id');
  verifier(ra.ok && vuRe.length > 0, 'Compte réactivé : accès rétabli');
  const rr = await fn(admin, { action: 'reinitialiser', id: rE.profil.id });
  const emp2 = client();
  const { error: lr } = await emp2.auth.signInWithPassword({ email: `${MARQUE.toLowerCase()}-e@ansar-test.dev`, password: rr.mot_de_passe_temporaire });
  verifier(rr.ok && !lr, 'Réinitialisation de l\'accès : nouveau mot de passe temporaire fonctionnel');
  const { error: lo } = await client().auth.signInWithPassword({ email: `${MARQUE.toLowerCase()}-e@ansar-test.dev`, password: nouveauMdp });
  verifier(!!lo, 'L\'ancien mot de passe ne fonctionne plus');
  const auto = await fn(admin, { action: 'supprimer', id: ADMIN_ID });
  verifier(!!auto.erreur, 'L\'administrateur ne peut pas supprimer son propre compte');
} catch (e) {
  console.error('Erreur inattendue :', e);
  process.exitCode = 1;
} finally {
  // Nettoyage des comptes de test
  for (const id of creesUsers.filter(Boolean)) await fn(admin, { action: 'supprimer', id });
  if (navigateur) await navigateur.close();
  const ok = resultats.filter((r) => r.ok).length;
  console.log(`\nRésultat : ${ok}/${resultats.length} vérifications réussies. Marqueur des données de test : ${MARQUE}`);
  fs.writeFileSync(`${CAPT}/resultats.json`, JSON.stringify({ marque: MARQUE, resultats }, null, 1));
}
