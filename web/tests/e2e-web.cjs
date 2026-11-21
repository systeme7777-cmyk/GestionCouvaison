// Test de bout en bout de la version web (deux iPhone simulés)
const { chromium, devices } = require("playwright");
const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const SHOTS = process.env.SHOTS || "/tmp/web-shots";
require("fs").mkdirSync(SHOTS, { recursive: true });
let step = 0;
const ok = (m) => console.log(`  OK  ${m}`);
async function shot(page, name) { await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, "0")}-${name}.png` }); }

(async () => {
  const browser = await chromium.launch();
  const iphone = { ...devices["iPhone 13"], locale: "fr-FR", timezoneId: "Africa/Dakar" };
  const admin = await (await browser.newContext(iphone)).newPage();
  const errors = [];
  admin.on("pageerror", (e) => errors.push(e.message));

  // 1. Configuration initiale
  await admin.goto(BASE);
  await admin.getByText("Configurer l'application").click();
  await shot(admin, "configuration");
  await admin.getByLabel("Nom complet").fill("Ousmane Diallo");
  await admin.getByLabel("Identifiant de connexion").fill("ousmane");
  await admin.getByRole("textbox", { name: /^Mot de passe/ }).fill("Secret-2026");
  await admin.getByRole("textbox", { name: /^Confirmer le mot de passe/ }).fill("Secret-2026");
  await admin.getByRole("button", { name: "Créer le compte administrateur" }).click();
  await admin.getByText("Tableau de bord").waitFor();
  await shot(admin, "tableau-de-bord");
  ok("configuration initiale et tableau de bord administrateur");

  // 2. Création d'un participant
  await admin.getByRole("link", { name: "Membres" }).click();
  await admin.getByRole("button", { name: /Nouveau membre/ }).click();
  await admin.getByLabel("Nom complet").fill("Fatou Diop");
  const pwd = await admin.getByRole("textbox", { name: /^Mot de passe provisoire/ }).inputValue();
  await admin.getByRole("button", { name: "Créer le compte" }).click();
  await admin.getByText("Compte créé").waitFor();
  await shot(admin, "compte-cree");
  await admin.getByRole("button", { name: "Terminé" }).click();
  await admin.getByText("@fatou.diop").waitFor();
  ok(`participant créé (identifiant fatou.diop, mot de passe ${pwd})`);

  // 3. Création d'une campagne et attribution des objectifs
  await admin.getByRole("link", { name: "Campagnes" }).click();
  await admin.getByRole("button", { name: /Nouvelle campagne/ }).click();
  await admin.getByLabel("Titre de la campagne").fill("Campagne du Mawlid");
  await admin.getByRole("button", { name: "Salat Ala Nabi ﷺ" }).click();
  await admin.getByRole("button", { name: "50 000" }).click();
  await shot(admin, "nouvelle-campagne");
  await admin.getByRole("button", { name: "Créer et choisir les participants" }).click();
  await admin.getByText("Participants et objectifs").waitFor();
  await admin.getByRole("checkbox", { name: "Fatou Diop" }).check();
  await admin.getByRole("checkbox", { name: "Ousmane Diallo" }).check();
  await admin.getByRole("button", { name: "Répartir l'objectif global" }).click();
  await shot(admin, "attribution");
  await admin.getByRole("button", { name: "Enregistrer" }).click();
  await admin.getByText("Total des objectifs individuels").waitFor();
  await shot(admin, "suivi-campagne");
  ok("campagne créée, 2 participants cochés, objectifs répartis (25 000 chacun)");

  // 4. Le participant se connecte sur un autre iPhone
  const part = await (await browser.newContext(iphone)).newPage();
  part.on("pageerror", (e) => errors.push(e.message));
  await part.goto(BASE);
  await part.getByLabel("Identifiant").fill("fatou.diop");
  await part.getByRole("textbox", { name: /^Mot de passe/ }).fill(pwd);
  await part.getByRole("button", { name: "Se connecter" }).click();
  await part.getByText("Choisissez votre mot de passe").waitFor();
  await part.getByRole("textbox", { name: /^Nouveau mot de passe/ }).fill("Fatou-2026");
  await part.getByRole("textbox", { name: /^Confirmer le mot de passe/ }).fill("Fatou-2026");
  await part.getByRole("button", { name: "Enregistrer" }).click();
  await part.getByText("As-salamou alaykoum, Fatou").waitFor();
  await part.getByText("Campagne du Mawlid").waitFor();
  await shot(part, "accueil-participant");
  ok("participant connecté, mot de passe personnel choisi, campagne visible");

  // 5. Décompte
  await part.getByText("Campagne du Mawlid").click();
  await part.getByRole("button", { name: "Ajouter un" }).waitFor();
  for (let i = 0; i < 3; i++) await part.getByRole("button", { name: "Ajouter un" }).click();
  await part.getByRole("button", { name: "+33", exact: true }).click();
  await part.getByText("Synchronisé").waitFor({ timeout: 15000 });
  await part.locator(".count-number", { hasText: "36" }).waitFor();
  await shot(part, "compteur");
  ok("décompte +1 ×3 et +33 = 36, synchronisé");

  // 6. Temps réel côté administrateur (sans recharger)
  await admin.getByText("36 / 50 000").waitFor({ timeout: 15000 });
  await shot(admin, "temps-reel-admin");
  ok("l'administrateur voit 36 / 50 000 en temps réel");

  // 7. Annuler
  await part.getByRole("button", { name: "Annuler le dernier ajout" }).click();
  await part.locator(".count-number", { hasText: /^3$/ }).waitFor();
  await part.getByText("Synchronisé").waitFor({ timeout: 15000 });
  await admin.getByText("3 / 50 000").waitFor({ timeout: 15000 });
  ok("annulation du dernier ajout (−33) répercutée chez l'administrateur");

  // 8. Hors ligne puis reconnexion : rien n'est perdu
  await part.context().setOffline(true);
  await part.getByRole("button", { name: "+10", exact: true }).click();
  await part.getByText("Hors ligne").waitFor({ timeout: 15000 });
  await shot(part, "hors-ligne");
  await part.context().setOffline(false);
  await part.evaluate(() => window.dispatchEvent(new Event("online")));
  await part.getByText("Synchronisé").waitFor({ timeout: 20000 });
  await admin.getByText("13 / 50 000").waitFor({ timeout: 15000 });
  ok("décompte fait hors ligne envoyé au retour du réseau (13)");

  // 9. Notifications et historique du participant
  await part.getByRole("button", { name: "Retour" }).click();
  await part.getByRole("link", { name: "Notifications" }).click();
  await part.getByText("Nouvelle campagne de Zikr").waitFor();
  await shot(part, "notifications");
  await part.getByRole("link", { name: "Historique" }).click();
  await part.getByText("Annulation / correction").waitFor();
  await shot(part, "historique");
  ok("notifications et historique affichés");

  // 10. Sécurité : le participant n'a pas accès à l'administration
  await part.goto(`${BASE}/#/membre-nouveau`);
  await part.getByText("As-salamou alaykoum, Fatou").waitFor();
  ok("les pages d'administration sont inaccessibles au participant");

  if (errors.length) { console.log("ERREURS JS :", errors); process.exit(1); }
  console.log("\nTOUS LES TESTS WEB SONT PASSÉS");
  await browser.close();
})().catch(async (e) => { console.error("ÉCHEC :", e.message); process.exit(1); });
