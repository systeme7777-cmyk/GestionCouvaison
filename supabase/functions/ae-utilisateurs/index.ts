// ANSAR ELEVAGE — Gestion sécurisée des comptes utilisateurs.
// Seul un Administrateur principal actif peut appeler ces actions.
// La clé service_role reste côté serveur (variable d'environnement Supabase),
// elle n'est jamais présente dans l'application Android.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES = ["admin_principal", "admin", "gestionnaire", "employe"];

function rep(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function motDePasseTemporaire(): string {
  const lettres = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const chiffres = "23456789";
  const tout = lettres + chiffres;
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < 8; i++) s += tout[buf[i] % tout.length];
  s += chiffres[buf[8] % chiffres.length] + chiffres[buf[9] % chiffres.length];
  return s;
}

function nettoyerPermissions(p: unknown): Record<string, Record<string, boolean>> {
  const out: Record<string, Record<string, boolean>> = {};
  if (!p || typeof p !== "object") return out;
  for (const [mod, acts] of Object.entries(p as Record<string, unknown>)) {
    if (!/^[a-z_]{2,30}$/.test(mod) || !acts || typeof acts !== "object") continue;
    out[mod] = {};
    for (const a of ["lire", "ajouter", "modifier", "supprimer"]) {
      out[mod][a] = Boolean((acts as Record<string, unknown>)[a]);
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return rep({ erreur: "Méthode non autorisée" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // 1. Identifier l'appelant à partir de son jeton
  const client = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: u, error: ue } = await client.auth.getUser();
  if (ue || !u?.user) return rep({ erreur: "Session invalide, reconnectez-vous." }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: moi } = await admin.from("ae_profils").select("*").eq("id", u.user.id).maybeSingle();
  if (!moi || !moi.actif || moi.supprime || moi.role !== "admin_principal") {
    return rep({ erreur: "Action réservée à l'Administrateur principal." }, 403);
  }

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return rep({ erreur: "Requête invalide" }, 400);
  }
  const action = String(corps.action ?? "");
  const id = corps.id ? String(corps.id) : null;

  const nbPrincipauxActifs = async (sauf?: string) => {
    let q = admin.from("ae_profils").select("id", { count: "exact", head: true })
      .eq("role", "admin_principal").eq("actif", true).eq("supprime", false);
    if (sauf) q = q.neq("id", sauf);
    const { count } = await q;
    return count ?? 0;
  };

  const journal = async (enrId: string, act: string, donnees: unknown) => {
    await admin.from("ae_journal").insert({
      table_nom: "ae_profils", enregistrement_id: enrId, action: act,
      user_id: moi.id, donnees,
    });
  };

  try {
    if (action === "creer") {
      const email = String(corps.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return rep({ erreur: "Adresse e-mail invalide" }, 400);
      const role = String(corps.role ?? "employe");
      if (!ROLES.includes(role)) return rep({ erreur: "Rôle invalide" }, 400);
      const mdp = corps.mot_de_passe ? String(corps.mot_de_passe) : motDePasseTemporaire();
      if (mdp.length < 8) return rep({ erreur: "Le mot de passe doit contenir au moins 8 caractères" }, 400);

      let userId: string | null = null;
      let existant = false;
      const { data: cree, error: ce } = await admin.auth.admin.createUser({
        email, password: mdp, email_confirm: true,
        user_metadata: { nom: corps.nom ?? "", prenom: corps.prenom ?? "" },
      });
      if (ce) {
        // Le compte existe peut-être déjà dans ce projet Supabase
        for (let page = 1; page <= 20 && !userId; page++) {
          const { data: lst } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          const t = lst?.users?.find((x) => (x.email ?? "").toLowerCase() === email);
          if (t) userId = t.id;
          if (!lst || lst.users.length < 1000) break;
        }
        if (!userId) return rep({ erreur: "Création impossible : " + ce.message }, 400);
        existant = true;
      } else {
        userId = cree.user.id;
      }

      const { data: deja } = await admin.from("ae_profils").select("*").eq("id", userId).maybeSingle();
      if (deja && !deja.supprime) return rep({ erreur: "Cet utilisateur fait déjà partie d'ANSAR ELEVAGE." }, 409);

      const profil = {
        id: userId, email,
        nom: String(corps.nom ?? ""), prenom: String(corps.prenom ?? ""),
        telephone: corps.telephone ? String(corps.telephone) : null,
        role, permissions: nettoyerPermissions(corps.permissions),
        actif: corps.actif === undefined ? true : Boolean(corps.actif),
        supprime: false, doit_changer_mdp: !existant, created_by: moi.id, updated_by: moi.id,
        updated_at: new Date().toISOString(), deleted_at: null,
      };
      const { data: p, error: pe } = await admin.from("ae_profils").upsert(profil).select().single();
      if (pe) return rep({ erreur: pe.message }, 400);
      // Compte déjà existant dans le projet : son mot de passe actuel est conservé
      return rep({ ok: true, profil: p, existant, mot_de_passe_temporaire: existant ? null : mdp });
    }

    if (!id) return rep({ erreur: "Identifiant manquant" }, 400);
    const { data: cible } = await admin.from("ae_profils").select("*").eq("id", id).maybeSingle();
    if (!cible) return rep({ erreur: "Utilisateur introuvable" }, 404);

    if (action === "modifier") {
      const maj: Record<string, unknown> = { updated_by: moi.id, updated_at: new Date().toISOString() };
      for (const k of ["nom", "prenom", "telephone"]) if (k in corps) maj[k] = corps[k] ?? null;
      if ("permissions" in corps) maj.permissions = nettoyerPermissions(corps.permissions);
      if ("role" in corps) {
        const role = String(corps.role);
        if (!ROLES.includes(role)) return rep({ erreur: "Rôle invalide" }, 400);
        if (cible.role === "admin_principal" && role !== "admin_principal" && (await nbPrincipauxActifs(id)) === 0) {
          return rep({ erreur: "Il doit rester au moins un Administrateur principal." }, 400);
        }
        maj.role = role;
      }
      if ("email" in corps) {
        const email = String(corps.email).trim().toLowerCase();
        if (email !== cible.email) {
          const { error } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
          if (error) return rep({ erreur: "E-mail : " + error.message }, 400);
          maj.email = email;
        }
      }
      const { data: p, error } = await admin.from("ae_profils").update(maj).eq("id", id).select().single();
      if (error) return rep({ erreur: error.message }, 400);
      return rep({ ok: true, profil: p });
    }

    if (action === "activer" || action === "desactiver") {
      const actif = action === "activer";
      if (!actif && id === moi.id) return rep({ erreur: "Vous ne pouvez pas désactiver votre propre compte." }, 400);
      if (!actif && cible.role === "admin_principal" && (await nbPrincipauxActifs(id)) === 0) {
        return rep({ erreur: "Il doit rester au moins un Administrateur principal actif." }, 400);
      }
      const { data: p, error } = await admin.from("ae_profils")
        .update({ actif, updated_by: moi.id, updated_at: new Date().toISOString() })
        .eq("id", id).select().single();
      if (error) return rep({ erreur: error.message }, 400);
      return rep({ ok: true, profil: p });
    }

    if (action === "reinitialiser") {
      const mdp = motDePasseTemporaire();
      const { error } = await admin.auth.admin.updateUserById(id, { password: mdp });
      if (error) return rep({ erreur: error.message }, 400);
      const { data: p } = await admin.from("ae_profils")
        .update({ doit_changer_mdp: true, updated_by: moi.id, updated_at: new Date().toISOString() })
        .eq("id", id).select().single();
      await journal(id, "reinitialisation_acces", { email: cible.email });
      return rep({ ok: true, profil: p, mot_de_passe_temporaire: mdp });
    }

    if (action === "supprimer") {
      if (id === moi.id) return rep({ erreur: "Vous ne pouvez pas supprimer votre propre compte." }, 400);
      if (cible.role === "admin_principal" && (await nbPrincipauxActifs(id)) === 0) {
        return rep({ erreur: "Il doit rester au moins un Administrateur principal." }, 400);
      }
      // Suppression logique : l'historique des opérations conserve le nom de l'auteur.
      // Le compte de connexion est retiré d'ANSAR ELEVAGE (il peut être partagé avec d'autres applications du projet).
      const { data: p, error } = await admin.from("ae_profils")
        .update({ supprime: true, actif: false, deleted_at: new Date().toISOString(),
                  updated_by: moi.id, updated_at: new Date().toISOString() })
        .eq("id", id).select().single();
      if (error) return rep({ erreur: error.message }, 400);
      return rep({ ok: true, profil: p });
    }

    return rep({ erreur: "Action inconnue" }, 400);
  } catch (e) {
    return rep({ erreur: (e as Error).message ?? String(e) }, 500);
  }
});
