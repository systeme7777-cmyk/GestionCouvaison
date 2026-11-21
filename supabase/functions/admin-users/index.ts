// ANSAROUDINE ZIKR - Fonction sécurisée de gestion des comptes
// Toutes les opérations qui touchent aux comptes de connexion passent par ici,
// car elles nécessitent la clé de service (jamais présente dans l'application).
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EMAIL_DOMAIN = "ansaroudine-zikr.app";
const BAN_FOREVER = "876000h";

type Role = "admin" | "participant";

interface Profile {
  id: string;
  username: string;
  full_name: string;
  phone: string | null;
  role: Role;
  is_owner: boolean;
  is_active: boolean;
  deleted_at: string | null;
}

class AppError extends Error {}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalizeUsername(value: unknown): string {
  const u = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(u)) {
    throw new AppError(
      "L'identifiant doit contenir de 3 à 32 caractères : lettres minuscules sans accent, chiffres, point, tiret ou tiret bas.",
    );
  }
  return u;
}

function normalizeName(value: unknown): string {
  const n = String(value ?? "").trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 80) throw new AppError("Le nom complet doit contenir entre 2 et 80 caractères.");
  return n;
}

function normalizePhone(value: unknown): string | null {
  const p = String(value ?? "").trim();
  if (!p) return null;
  if (p.length > 30 || !/^[0-9+() .-]+$/.test(p)) throw new AppError("Le numéro de téléphone est invalide.");
  return p;
}

function checkPassword(value: unknown): string {
  const p = String(value ?? "");
  if (p.length < 6) throw new AppError("Le mot de passe doit contenir au moins 6 caractères.");
  if (p.length > 72) throw new AppError("Le mot de passe est trop long (72 caractères maximum).");
  return p;
}

function checkRole(value: unknown): Role {
  if (value === "admin" || value === "participant") return value;
  throw new AppError("Type de compte invalide.");
}

function emailFor(username: string): string {
  return `${username}@${EMAIL_DOMAIN}`;
}

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already") && (m.includes("registered") || m.includes("exists"))) {
    return "Cet identifiant est déjà utilisé.";
  }
  if (m.includes("password")) return "Le mot de passe n'est pas accepté (au moins 6 caractères).";
  return "Une erreur est survenue lors de la gestion du compte. Veuillez réessayer.";
}

async function getProfile(admin: SupabaseClient, id: string): Promise<Profile> {
  const { data, error } = await admin.from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.deleted_at) throw new AppError("Compte introuvable.");
  return data as Profile;
}

async function usernameTaken(admin: SupabaseClient, username: string, exceptId?: string): Promise<boolean> {
  let q = admin.from("profiles").select("id").eq("username", username).is("deleted_at", null);
  if (exceptId) q = q.neq("id", exceptId);
  const { data, error } = await q.limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

async function audit(
  admin: SupabaseClient,
  actor: string | null,
  action: string,
  target: string | null,
  details: Record<string, unknown> = {},
) {
  await admin.rpc("log_audit", {
    p_actor: actor,
    p_action: action,
    p_target: target,
    p_campaign: null,
    p_details: details,
  });
}

async function notifyUser(admin: SupabaseClient, user: string, type: string, title: string, body: string) {
  await admin.rpc("notify_user", { p_user: user, p_type: type, p_title: title, p_body: body, p_data: {} });
}

async function notifyAdmins(admin: SupabaseClient, type: string, title: string, body: string, except: string | null) {
  await admin.rpc("notify_admins", { p_type: type, p_title: title, p_body: body, p_data: {}, p_except: except });
}

// Vérifie que l'auteur a le droit d'agir sur le compte ciblé
function assertCanManage(actor: Profile, target: Profile, opts: { allowSelf?: boolean } = {}) {
  if (target.id === actor.id) {
    if (opts.allowSelf) return;
    throw new AppError("Vous ne pouvez pas effectuer cette action sur votre propre compte.");
  }
  if (target.is_owner) throw new AppError("Le compte du propriétaire ne peut pas être modifié.");
  if (target.role === "admin" && !actor.is_owner) {
    throw new AppError("Seul l'administrateur principal peut gérer les administrateurs.");
  }
}

async function createAccount(
  admin: SupabaseClient,
  input: { username: string; full_name: string; phone: string | null; password: string; role: Role; is_owner: boolean },
  createdBy: string | null,
): Promise<Profile> {
  if (await usernameTaken(admin, input.username)) throw new AppError("Cet identifiant est déjà utilisé.");

  const { data: created, error } = await admin.auth.admin.createUser({
    email: emailFor(input.username),
    password: input.password,
    email_confirm: true,
    app_metadata: { app: "ansaroudine-zikr" },
    user_metadata: { full_name: input.full_name },
  });
  if (error || !created?.user) throw new AppError(translateAuthError(error?.message ?? ""));

  const { data: profile, error: pErr } = await admin.from("profiles").insert({
    id: created.user.id,
    username: input.username,
    full_name: input.full_name,
    phone: input.phone,
    role: input.role,
    is_owner: input.is_owner,
    is_active: true,
    must_change_password: !input.is_owner,
    created_by: createdBy,
  }).select("*").single();

  if (pErr || !profile) {
    await admin.auth.admin.deleteUser(created.user.id);
    if (pErr?.code === "23505") throw new AppError("Cet identifiant est déjà utilisé.");
    throw new Error(pErr?.message ?? "Création du profil impossible");
  }
  return profile as Profile;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ ok: false, error: "Méthode non autorisée." }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ ok: false, error: "Requête invalide." }, 400);
  }
  const action = String(body.action ?? "");

  try {
    // -----------------------------------------------------------------
    // Configuration initiale : création du compte propriétaire.
    // Possible une seule fois, tant qu'aucun propriétaire n'existe.
    // -----------------------------------------------------------------
    if (action === "bootstrap_owner") {
      const { data: exists, error } = await admin.rpc("owner_exists");
      if (error) throw new Error(error.message);
      if (exists) throw new AppError("L'application est déjà configurée. Connectez-vous avec votre compte.");
      const profile = await createAccount(admin, {
        username: normalizeUsername(body.username),
        full_name: normalizeName(body.full_name),
        phone: normalizePhone(body.phone),
        password: checkPassword(body.password),
        role: "admin",
        is_owner: true,
      }, null);
      await audit(admin, profile.id, "proprietaire_cree", profile.id, { identifiant: profile.username });
      return reply({ ok: true, user: profile });
    }

    // -----------------------------------------------------------------
    // Toutes les autres actions exigent un administrateur connecté et actif
    // -----------------------------------------------------------------
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return reply({ ok: false, error: "Vous devez être connecté." }, 401);
    const { data: authData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !authData?.user) return reply({ ok: false, error: "Session expirée. Veuillez vous reconnecter." }, 401);

    const { data: actorRow } = await admin.from("profiles").select("*").eq("id", authData.user.id).maybeSingle();
    const actor = actorRow as Profile | null;
    if (!actor || actor.deleted_at || !actor.is_active) {
      return reply({ ok: false, error: "Votre compte est désactivé." }, 403);
    }
    if (actor.role !== "admin") {
      return reply({ ok: false, error: "Action réservée aux administrateurs." }, 403);
    }

    switch (action) {
      case "create_user": {
        const role = checkRole(body.role ?? "participant");
        if (role === "admin" && !actor.is_owner) {
          throw new AppError("Seul l'administrateur principal peut créer des administrateurs.");
        }
        const profile = await createAccount(admin, {
          username: normalizeUsername(body.username),
          full_name: normalizeName(body.full_name),
          phone: normalizePhone(body.phone),
          password: checkPassword(body.password),
          role,
          is_owner: false,
        }, actor.id);

        await audit(admin, actor.id, role === "admin" ? "administrateur_cree" : "participant_cree", profile.id, {
          identifiant: profile.username,
          nom: profile.full_name,
        });
        if (role === "admin") {
          await notifyUser(admin, profile.id, "administrateur_nomme", "Vous êtes administrateur",
            `${actor.full_name} vous a nommé administrateur de ANSAROUDINE ZIKR.`);
          await notifyAdmins(admin, "administrateur_nomme", "Nouvel administrateur",
            `${profile.full_name} a été nommé administrateur par ${actor.full_name}.`, profile.id);
        } else {
          await notifyUser(admin, profile.id, "bienvenue", "Bienvenue",
            `Bienvenue dans ANSAROUDINE ZIKR, ${profile.full_name}. Qu'Allah facilite vos Zikr.`);
          await notifyAdmins(admin, "nouveau_participant", "Nouveau participant",
            `${actor.full_name} a ajouté le participant ${profile.full_name}.`, actor.id);
        }
        return reply({ ok: true, user: profile });
      }

      case "update_user": {
        const target = await getProfile(admin, String(body.user_id ?? ""));
        assertCanManage(actor, target, { allowSelf: true });
        const username = body.username !== undefined ? normalizeUsername(body.username) : target.username;
        const fullName = body.full_name !== undefined ? normalizeName(body.full_name) : target.full_name;
        const phone = body.phone !== undefined ? normalizePhone(body.phone) : target.phone;

        if (username !== target.username) {
          if (await usernameTaken(admin, username, target.id)) throw new AppError("Cet identifiant est déjà utilisé.");
          const { error } = await admin.auth.admin.updateUserById(target.id, {
            email: emailFor(username),
            email_confirm: true,
          });
          if (error) throw new AppError(translateAuthError(error.message));
        }
        const { data, error } = await admin.from("profiles").update({
          username,
          full_name: fullName,
          phone,
          updated_at: new Date().toISOString(),
        }).eq("id", target.id).select("*").single();
        if (error) throw new Error(error.message);

        await audit(admin, actor.id, "compte_modifie", target.id, {
          avant: { identifiant: target.username, nom: target.full_name, telephone: target.phone },
          apres: { identifiant: username, nom: fullName, telephone: phone },
        });
        return reply({ ok: true, user: data });
      }

      case "reset_password": {
        const target = await getProfile(admin, String(body.user_id ?? ""));
        assertCanManage(actor, target);
        const password = checkPassword(body.password);
        const { error } = await admin.auth.admin.updateUserById(target.id, { password });
        if (error) throw new AppError(translateAuthError(error.message));
        await admin.from("profiles").update({ must_change_password: true, updated_at: new Date().toISOString() })
          .eq("id", target.id);
        await audit(admin, actor.id, "mot_de_passe_reinitialise", target.id, {});
        return reply({ ok: true });
      }

      case "set_active": {
        const target = await getProfile(admin, String(body.user_id ?? ""));
        assertCanManage(actor, target);
        const active = body.active === true;
        const { error } = await admin.auth.admin.updateUserById(target.id, {
          ban_duration: active ? "none" : BAN_FOREVER,
        });
        if (error) throw new Error(error.message);
        const { data, error: uErr } = await admin.from("profiles")
          .update({ is_active: active, updated_at: new Date().toISOString() })
          .eq("id", target.id).select("*").single();
        if (uErr) throw new Error(uErr.message);
        await audit(admin, actor.id, active ? "compte_reactive" : "compte_desactive", target.id, {});
        if (active) {
          await notifyUser(admin, target.id, "compte_reactive", "Compte réactivé",
            "Votre compte ANSAROUDINE ZIKR a été réactivé.");
        }
        return reply({ ok: true, user: data });
      }

      case "set_role": {
        if (!actor.is_owner) throw new AppError("Seul l'administrateur principal peut modifier les droits d'administration.");
        const target = await getProfile(admin, String(body.user_id ?? ""));
        if (target.id === actor.id || target.is_owner) {
          throw new AppError("Le compte du propriétaire ne peut pas être modifié.");
        }
        const role = checkRole(body.role);
        if (role === target.role) return reply({ ok: true, user: target });
        const { data, error } = await admin.from("profiles")
          .update({ role, updated_at: new Date().toISOString() })
          .eq("id", target.id).select("*").single();
        if (error) throw new Error(error.message);

        if (role === "admin") {
          await audit(admin, actor.id, "promu_administrateur", target.id, {});
          await notifyUser(admin, target.id, "administrateur_nomme", "Vous êtes administrateur",
            `${actor.full_name} vous a nommé administrateur de ANSAROUDINE ZIKR.`);
          await notifyAdmins(admin, "administrateur_nomme", "Nouvel administrateur",
            `${target.full_name} a été nommé administrateur par ${actor.full_name}.`, target.id);
        } else {
          await audit(admin, actor.id, "droits_admin_retires", target.id, {});
          await notifyUser(admin, target.id, "droits_retires", "Droits modifiés",
            "Vos droits d'administrateur ont été retirés. Vous restez participant.");
        }
        return reply({ ok: true, user: data });
      }

      case "delete_user": {
        const target = await getProfile(admin, String(body.user_id ?? ""));
        assertCanManage(actor, target);
        const now = new Date().toISOString();

        // Le profil est conservé (marqué supprimé) pour garder l'historique des décomptes
        const { error: pErr } = await admin.from("profiles").update({
          deleted_at: now,
          is_active: false,
          username: `supprime-${target.id}`,
          updated_at: now,
        }).eq("id", target.id);
        if (pErr) throw new Error(pErr.message);

        const { data: parts } = await admin.from("campaign_participants")
          .update({ removed_at: now, updated_at: now })
          .eq("user_id", target.id).is("removed_at", null)
          .select("campaign_id");
        for (const p of parts ?? []) {
          const { count } = await admin.from("campaign_participants")
            .select("*", { count: "exact", head: true })
            .eq("campaign_id", p.campaign_id).is("removed_at", null);
          await admin.from("campaigns").update({ participants_count: count ?? 0 }).eq("id", p.campaign_id);
        }

        const { error } = await admin.auth.admin.deleteUser(target.id);
        if (error && !error.message.toLowerCase().includes("not found")) throw new Error(error.message);

        await audit(admin, actor.id, target.role === "admin" ? "administrateur_supprime" : "participant_supprime",
          target.id, { identifiant: target.username, nom: target.full_name });
        return reply({ ok: true });
      }

      default:
        return reply({ ok: false, error: "Action inconnue." }, 400);
    }
  } catch (e) {
    if (e instanceof AppError) return reply({ ok: false, error: e.message });
    console.error(action, e);
    return reply({ ok: false, error: "Une erreur inattendue est survenue. Veuillez réessayer." });
  }
});
