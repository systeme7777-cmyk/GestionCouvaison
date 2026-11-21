// Test de bout en bout de ANSAROUDINE ZIKR contre une instance Supabase réelle.
// Utilisation : SUPABASE_URL=... SUPABASE_ANON_KEY=... node supabase/tests/e2e.mjs
// Le test crée son propre jeu de données (préfixe « test- ») et le supprime à la fin
// sauf pour le compte propriétaire, qui n'est créé que si aucun n'existe (instance vide).
const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
if (!URL_ || !ANON) { console.error("SUPABASE_URL et SUPABASE_ANON_KEY sont requis"); process.exit(2); }
const DOMAIN = "ansaroudine-zikr.app";
const OWNER_USER = process.env.OWNER_USERNAME ?? "proprietaire";
const OWNER_PASS = process.env.OWNER_PASSWORD ?? "MotDePasse-Test-123";
const run = Date.now().toString(36);

let failures = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log("  OK  " + msg); } else { failures++; console.log("  ÉCHEC " + msg); } };

async function http(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(URL_ + path, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${token ?? ANON}`, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}
const rpc = (fn, args, token) => http("POST", `/rest/v1/rpc/${fn}`, { token, body: args ?? {} });
const select = (q, token) => http("GET", `/rest/v1/${q}`, { token });
const admin = (body, token) => http("POST", "/functions/v1/admin-users", { token, body });
async function login(username, password) {
  const r = await http("POST", "/auth/v1/token?grant_type=password", { body: { email: `${username}@${DOMAIN}`, password } });
  return r.json?.access_token ? { token: r.json.access_token, id: r.json.user.id } : null;
}

console.log("1. Configuration initiale");
const exists = (await rpc("owner_exists")).json;
if (!exists) {
  const b = await admin({ action: "bootstrap_owner", username: OWNER_USER, full_name: "Propriétaire Test", password: OWNER_PASS });
  ok(b.json?.ok === true, "création du propriétaire");
}
const again = await admin({ action: "bootstrap_owner", username: "pirate", full_name: "Pirate", password: "abcdef12" });
ok(again.json?.ok === false, "seconde configuration refusée : " + again.json?.error);
const owner = await login(OWNER_USER, OWNER_PASS);
ok(!!owner, "connexion du propriétaire");
if (!owner) process.exit(1);

console.log("2. Gestion des comptes");
const mk = async (role, name, token = owner.token) => {
  const username = `test-${name}-${run}`.toLowerCase();
  const r = await admin({ action: "create_user", username, full_name: `${name} Test`, password: "provisoire1", role }, token);
  return { ...r.json?.user, username, password: "provisoire1", res: r.json };
};
const adm = await mk("admin", "Admin");
ok(adm.res?.ok, "le propriétaire crée un administrateur");
const admS = await login(adm.username, "provisoire1");
ok(!!admS, "connexion de l'administrateur");
const forbidden = await mk("admin", "Interdit", admS.token);
ok(forbidden.res?.ok === false, "un administrateur ne peut pas créer d'administrateur : " + forbidden.res?.error);
const names = ["Ahmed", "Fatou", "Moussa", "Aicha"];
const parts = [];
for (const n of names) parts.push(await mk("participant", n, admS.token));
ok(parts.every((p) => p.res?.ok), "l'administrateur crée 4 participants");
const dup = await admin({ action: "create_user", username: parts[0].username, full_name: "Doublon", password: "abcdef12" }, admS.token);
ok(dup.json?.ok === false, "identifiant en double refusé : " + dup.json?.error);
const sessions = [];
for (const p of parts) sessions.push(await login(p.username, p.password));
ok(sessions.every(Boolean), "connexion des participants");
const pw = await http("PUT", "/auth/v1/user", { token: sessions[0].token, body: { password: "NouveauMdp-42" } });
ok(pw.status === 200, "changement de mot de passe du participant");
await rpc("password_changed", {}, sessions[0].token);
const me0 = await select(`profiles?id=eq.${sessions[0].id}&select=must_change_password`, sessions[0].token);
ok(me0.json?.[0]?.must_change_password === false, "indicateur de changement de mot de passe mis à jour");
const pAttack = await admin({ action: "create_user", username: `test-x-${run}`, full_name: "X", password: "abcdef12" }, sessions[1].token);
ok(pAttack.json?.ok === false, "un participant ne peut pas créer de compte");

console.log("3. Campagne et objectifs");
const cr = await rpc("create_campaign", { p_title: `Campagne test ${run}`, p_zikr_type: "Astaghfirullah", p_description: "Test", p_start_date: new Date().toISOString().slice(0, 10), p_end_date: null, p_global_goal: 4300 }, admS.token);
ok(cr.status === 200 && typeof cr.json === "string", "création de campagne");
const cid = cr.json;
const goals = [500, 1000, 2500, 300];
const sp = await rpc("set_campaign_participants", { p_campaign: cid, p_items: sessions.map((s, i) => ({ user_id: s.id, goal: goals[i] })) }, admS.token);
ok(sp.json?.ajoutes === 4, "4 participants cochés avec leurs objectifs");
const pc = await rpc("create_campaign", { p_title: "Pirate", p_zikr_type: "X", p_description: "", p_start_date: null, p_end_date: null, p_global_goal: 1 }, sessions[0].token);
ok(pc.status >= 400, "un participant ne peut pas créer de campagne");

console.log("4. Décomptes simultanés");
const tasks = [];
const perUser = [0, 0, 0, 0];
for (let i = 0; i < 4; i++) {
  for (let j = 0; j < 25; j++) {
    const amount = [1, 10, 33, 100][j % 4];
    perUser[i] += amount;
    tasks.push(rpc("add_zikr", { p_campaign: cid, p_amount: amount, p_client_id: crypto.randomUUID() }, sessions[i].token));
  }
}
const results = await Promise.all(tasks);
ok(results.every((r) => r.status === 200), `${tasks.length} envois simultanés acceptés`);
const cid0 = crypto.randomUUID();
await rpc("add_zikr", { p_campaign: cid, p_amount: 5, p_client_id: cid0 }, sessions[0].token);
const replay = await rpc("add_zikr", { p_campaign: cid, p_amount: 5, p_client_id: cid0 }, sessions[0].token);
ok(replay.json?.duplicate === true, "un envoi répété n'est pas compté deux fois");
perUser[0] += 5;
const undo = await rpc("add_zikr", { p_campaign: cid, p_amount: -1, p_client_id: crypto.randomUUID() }, sessions[0].token);
ok(undo.status === 200, "annulation (−1)");
perUser[0] -= 1;
const tooMuch = await rpc("add_zikr", { p_campaign: cid, p_amount: -999999, p_client_id: crypto.randomUUID() }, sessions[0].token);
ok(tooMuch.status >= 400, "annulation excessive refusée : " + tooMuch.json?.message);
const camp = (await select(`campaigns?id=eq.${cid}&select=total_count,goal_reached_at`, admS.token)).json[0];
const expected = perUser.reduce((a, b) => a + b, 0);
ok(Number(camp.total_count) === expected, `total global cohérent (${camp.total_count} = ${expected})`);
const rows = (await select(`campaign_participants?campaign_id=eq.${cid}&select=user_id,count,completed_at`, admS.token)).json;
ok(rows.every((r) => Number(r.count) === perUser[sessions.findIndex((s) => s.id === r.user_id)]), "compteurs personnels cohérents");

console.log("5. Sécurité (RLS)");
const seeProfiles = (await select("profiles?select=id", sessions[1].token)).json;
ok(seeProfiles.length === 1 && seeProfiles[0].id === sessions[1].id, "un participant ne voit que son propre profil");
const seeParts = (await select("campaign_participants?select=user_id", sessions[1].token)).json;
ok(seeParts.length === 1, "un participant ne voit que sa propre participation");
const seeEntries = (await select(`zikr_entries?select=user_id&user_id=neq.${sessions[1].id}`, sessions[1].token)).json;
ok(seeEntries.length === 0, "un participant ne voit pas les décomptes des autres");
const write = await http("PATCH", `/rest/v1/campaign_participants?user_id=eq.${sessions[1].id}`, { token: sessions[1].token, body: { count: 999999 } });
ok(write.status >= 400, "modification directe des compteurs interdite");
const anonRead = (await select("profiles?select=id")).json;
ok(Array.isArray(anonRead) ? anonRead.length === 0 : true, "aucune donnée visible sans connexion");
const notif = (await select("notifications?select=type", sessions[1].token)).json;
ok(notif.some((n) => n.type === "ajout_campagne"), "notification d'ajout à la campagne reçue");
const ownerNotifs = (await select("notifications?select=type", owner.token)).json;
ok(ownerNotifs.some((n) => n.type === "nouveau_participant"), "le propriétaire est notifié des nouveaux participants");
ok(ownerNotifs.some((n) => n.type === "campagne_creee"), "le propriétaire est notifié de la création de campagne");

console.log("6. Objectifs atteints");
const finish = await rpc("add_zikr", { p_campaign: cid, p_amount: 5000, p_client_id: crypto.randomUUID() }, sessions[3].token);
ok(finish.status === 200, "un participant dépasse son objectif");
const n3 = (await select("notifications?select=type", sessions[3].token)).json;
ok(n3.some((n) => n.type === "objectif_personnel_atteint"), "notification « objectif personnel atteint »");
ok(n3.some((n) => n.type === "objectif_global_atteint"), "notification « objectif global atteint »");

console.log("7. Rôles, désactivation, suppression");
const promo = await admin({ action: "set_role", user_id: sessions[2].id, role: "admin" }, owner.token);
ok(promo.json?.ok, "le propriétaire nomme un participant administrateur");
const n2 = (await select("notifications?select=type", sessions[2].token)).json;
ok(n2.some((n) => n.type === "administrateur_nomme"), "notification « administrateur nommé »");
const demoteByAdmin = await admin({ action: "set_role", user_id: sessions[2].id, role: "participant" }, admS.token);
ok(demoteByAdmin.json?.ok === false, "un administrateur ne peut pas retirer les droits d'un autre");
const demote = await admin({ action: "set_role", user_id: sessions[2].id, role: "participant" }, owner.token);
ok(demote.json?.ok, "le propriétaire retire les droits");
const touchOwner = await admin({ action: "set_active", user_id: owner.id, active: false }, admS.token);
ok(touchOwner.json?.ok === false, "le compte propriétaire est protégé");
const off = await admin({ action: "set_active", user_id: sessions[1].id, active: false }, admS.token);
ok(off.json?.ok, "désactivation d'un participant");
const blocked = await rpc("add_zikr", { p_campaign: cid, p_amount: 1, p_client_id: crypto.randomUUID() }, sessions[1].token);
ok(blocked.status >= 400, "un compte désactivé ne peut plus compter (même avec une session ouverte)");
ok((await login(parts[1].username, parts[1].password)) === null, "un compte désactivé ne peut plus se connecter");
const on = await admin({ action: "set_active", user_id: sessions[1].id, active: true }, admS.token);
ok(on.json?.ok && !!(await login(parts[1].username, parts[1].password)), "réactivation du compte");
const reset = await admin({ action: "reset_password", user_id: sessions[1].id, password: "Reinit-777" }, admS.token);
ok(reset.json?.ok && !!(await login(parts[1].username, "Reinit-777")), "réinitialisation du mot de passe");
const upd = await admin({ action: "update_user", user_id: sessions[1].id, full_name: "Fatou Modifiée", username: parts[1].username + "b", phone: "+221 77 000 00 00" }, admS.token);
ok(upd.json?.ok && !!(await login(parts[1].username + "b", "Reinit-777")), "modification des informations et de l'identifiant");
const del = await admin({ action: "delete_user", user_id: sessions[0].id }, admS.token);
ok(del.json?.ok, "suppression d'un participant");
const kept = (await select(`zikr_entries?user_id=eq.${sessions[0].id}&select=id`, admS.token)).json;
ok(kept.length > 0, "les décomptes du participant supprimé sont conservés");
const camp2 = (await select(`campaigns?id=eq.${cid}&select=total_count,participants_count`, admS.token)).json[0];
ok(Number(camp2.participants_count) === 3, "nombre de participants mis à jour après suppression");
const stats = await rpc("admin_overview", {}, admS.token);
ok(stats.status === 200 && Number(stats.json.total_zikr) >= expected, "statistiques générales");
const statsDenied = await rpc("admin_overview", {}, sessions[3].token);
ok(statsDenied.status >= 400, "statistiques générales refusées aux participants");
const audit = (await select(`audit_log?campaign_id=eq.${cid}&select=action`, admS.token)).json;
ok(audit.length >= 5, `journal des modifications (${audit.length} entrées)`);

console.log("8. Nettoyage des données de test");
await rpc("set_campaign_status", { p_id: cid, p_status: "terminee" }, admS.token);
const closedAdd = await rpc("add_zikr", { p_campaign: cid, p_amount: 1, p_client_id: crypto.randomUUID() }, sessions[3].token);
ok(closedAdd.status >= 400, "campagne clôturée : décompte refusé");
for (const s of sessions.slice(1)) await admin({ action: "delete_user", user_id: s.id }, owner.token);
await admin({ action: "delete_user", user_id: adm.id }, owner.token);

console.log(`\nRésultat : ${passes} réussis, ${failures} échecs`);
process.exit(failures ? 1 : 0);
