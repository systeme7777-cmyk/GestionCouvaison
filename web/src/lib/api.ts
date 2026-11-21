import { createClient } from "@supabase/supabase-js";
import { UserError } from "./errors";
import type {
  AddZikrResult, AdminOverview, AppNotification, AuditEntry, Campaign, DailyStat, MyOverview,
  Participation, Profile, ZikrEntry,
} from "./types";
import { todayIso } from "./types";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const LOGIN_EMAIL_DOMAIN = "ansaroudine-zikr.app";
export const PAGE_SIZE = 40;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "zikr-session" },
  realtime: { params: { eventsPerSecond: 20 } },
});

export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${LOGIN_EMAIL_DOMAIN}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function check<T>(res: { data: any; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  return check<T>(await supabase.rpc(fn, args));
}

const range = (page: number, size = PAGE_SIZE): [number, number] => [page * size, (page + 1) * size - 1];

// =====================================================================
// Authentification
// =====================================================================
export const auth = {
  ownerExists: () => rpc<boolean>("zk_owner_exists"),

  async signIn(username: string, password: string): Promise<Profile> {
    const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
    if (error) throw error;
    const p = await auth.loadProfile();
    if (!p || p.deleted_at) {
      await supabase.auth.signOut();
      throw new UserError("Ce compte n'est pas autorisé à utiliser ANSAROUDINE ZIKR.");
    }
    if (!p.is_active) {
      await supabase.auth.signOut();
      throw new UserError("Ce compte est désactivé. Contactez un administrateur.");
    }
    return p;
  },

  async loadProfile(): Promise<Profile | null> {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return null;
    return check(await supabase.from("zk_profiles").select("*").eq("id", uid).maybeSingle<Profile>());
  },

  async bootstrapOwner(fullName: string, username: string, phone: string, password: string) {
    await callAccounts({ action: "bootstrap_owner", full_name: fullName, username, phone, password });
    await auth.signIn(username, password);
  },

  async changePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    await rpc("zk_password_changed");
  },

  signOut: () => supabase.auth.signOut(),
};

// =====================================================================
// Fonction sécurisée de gestion des comptes
// =====================================================================
interface FunctionResult { ok: boolean; error?: string; user?: Profile }

async function callAccounts(body: Record<string, unknown>): Promise<FunctionResult> {
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token ?? SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/zk-comptes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  let json: FunctionResult;
  try {
    json = await res.json();
  } catch {
    throw new UserError("Réponse inattendue du serveur. Veuillez réessayer.");
  }
  if (!json.ok) throw new UserError(json.error ?? "Action impossible.");
  return json;
}

// =====================================================================
// Campagnes, participations, décomptes
// =====================================================================
export const zikr = {
  async myParticipations(userId: string): Promise<Participation[]> {
    return check(await supabase.from("zk_campaign_participants")
      .select("*, campaigns:zk_campaigns(*)")
      .eq("user_id", userId).is("removed_at", null)
      .order("created_at", { ascending: false }));
  },

  async participation(campaignId: string, userId: string): Promise<Participation | null> {
    return check(await supabase.from("zk_campaign_participants")
      .select("*, campaigns:zk_campaigns(*)")
      .eq("campaign_id", campaignId).eq("user_id", userId).maybeSingle<Participation>());
  },

  async campaign(id: string): Promise<Campaign | null> {
    return check(await supabase.from("zk_campaigns").select("*").eq("id", id).maybeSingle<Campaign>());
  },

  async campaigns(filter: string, search: string, page: number): Promise<Campaign[]> {
    const today = todayIso();
    let q = supabase.from("zk_campaigns").select("*");
    if (filter === "active") q = q.eq("status", "en_cours").lte("start_date", today).or(`end_date.is.null,end_date.gte.${today}`);
    else if (filter === "upcoming") q = q.eq("status", "en_cours").gt("start_date", today);
    else if (filter === "finished") q = q.or(`status.eq.terminee,end_date.lt.${today}`);
    const s = search.trim().replace(/[,()*%]/g, " ");
    if (s) q = q.or(`title.ilike.*${s}*,zikr_type.ilike.*${s}*`);
    return check(await q.order("created_at", { ascending: false }).range(...range(page)));
  },

  async campaignParticipants(campaignId: string): Promise<Participation[]> {
    return check(await supabase.from("zk_campaign_participants")
      .select("*, profiles:zk_profiles!zk_campaign_participants_user_id_fkey(id, full_name, username)")
      .eq("campaign_id", campaignId).is("removed_at", null)
      .order("count", { ascending: false }));
  },

  addZikr: (campaignId: string, amount: number, clientId: string) =>
    rpc<AddZikrResult>("zk_add_zikr", { p_campaign: campaignId, p_amount: amount, p_client_id: clientId }),

  async entries(userId: string | null, campaignId: string | null, page: number): Promise<ZikrEntry[]> {
    let q = supabase.from("zk_entries")
      .select("*, campaigns:zk_campaigns(id, title, zikr_type), profiles:zk_profiles(id, full_name, username)");
    if (userId) q = q.eq("user_id", userId);
    if (campaignId) q = q.eq("campaign_id", campaignId);
    return check(await q.order("id", { ascending: false }).range(...range(page)));
  },

  dailyStats: (campaignId: string, days: number, userId?: string) =>
    rpc<DailyStat[]>("zk_campaign_daily_stats", { p_campaign: campaignId, p_days: days, ...(userId ? { p_user: userId } : {}) }),

  myOverview: () => rpc<MyOverview>("zk_my_overview"),

  async audit(mode: "all" | "user" | "campaign", id: string | null, page: number): Promise<AuditEntry[]> {
    const columns = "*, actor:zk_profiles!zk_audit_log_actor_id_fkey(id, full_name, username), " +
      "target:zk_profiles!zk_audit_log_target_user_fkey(id, full_name, username), " +
      "campaign:zk_campaigns(id, title, zikr_type)";
    let q = supabase.from("zk_audit_log").select(columns as "*");
    if (mode === "user" && id) q = q.eq("target_user", id);
    if (mode === "campaign" && id) q = q.eq("campaign_id", id);
    return check<AuditEntry[]>(await q.order("id", { ascending: false }).range(...range(page)));
  },
};

// =====================================================================
// Administration
// =====================================================================
export const admin = {
  overview: () => rpc<AdminOverview>("zk_admin_overview"),

  async members(search: string, filter: string, page: number): Promise<Profile[]> {
    let q = supabase.from("zk_profiles").select("*").is("deleted_at", null);
    if (filter === "participants") q = q.eq("role", "participant");
    else if (filter === "admins") q = q.eq("role", "admin");
    else if (filter === "inactive") q = q.eq("is_active", false);
    const s = search.trim().replace(/[,()*%]/g, " ");
    if (s) q = q.or(`full_name.ilike.*${s}*,username.ilike.*${s}*,phone.ilike.*${s}*`);
    return check(await q.order("full_name").range(...range(page)));
  },

  async allActiveMembers(): Promise<Profile[]> {
    const out: Profile[] = [];
    for (let page = 0; ; page++) {
      const chunk = check<Profile[]>(await supabase.from("zk_profiles").select("*")
        .is("deleted_at", null).eq("is_active", true).order("full_name").range(...range(page, 500)));
      out.push(...chunk);
      if (chunk.length < 500) break;
    }
    return out;
  },

  async member(id: string): Promise<Profile | null> {
    return check(await supabase.from("zk_profiles").select("*").eq("id", id).maybeSingle<Profile>());
  },

  async createMember(fullName: string, username: string, phone: string, password: string, role: string): Promise<Profile> {
    const r = await callAccounts({ action: "create_user", full_name: fullName, username, phone, password, role });
    if (!r.user) throw new UserError("Création impossible.");
    return r.user;
  },
  updateMember: (id: string, fullName: string, username: string, phone: string) =>
    callAccounts({ action: "update_user", user_id: id, full_name: fullName, username, phone }),
  resetPassword: (id: string, password: string) => callAccounts({ action: "reset_password", user_id: id, password }),
  setActive: (id: string, active: boolean) => callAccounts({ action: "set_active", user_id: id, active }),
  setRole: (id: string, role: string) => callAccounts({ action: "set_role", user_id: id, role }),
  deleteMember: (id: string) => callAccounts({ action: "delete_user", user_id: id }),

  createCampaign: (title: string, type: string, description: string, start: string, end: string | null, goal: number) =>
    rpc<string>("zk_create_campaign", {
      p_title: title, p_zikr_type: type, p_description: description, p_start_date: start, p_end_date: end, p_global_goal: goal,
    }),
  updateCampaign: (id: string, title: string, type: string, description: string, start: string, end: string | null, goal: number) =>
    rpc<void>("zk_update_campaign", {
      p_id: id, p_title: title, p_zikr_type: type, p_description: description, p_start_date: start, p_end_date: end, p_global_goal: goal,
    }),
  setCampaignStatus: (id: string, status: "en_cours" | "terminee") => rpc<void>("zk_set_campaign_status", { p_id: id, p_status: status }),
  deleteCampaign: (id: string) => rpc<void>("zk_delete_campaign", { p_id: id }),
  setParticipants: (campaignId: string, items: { user_id: string; goal: number }[]) =>
    rpc<{ ajoutes: number; modifies: number; retires: number }>("zk_set_campaign_participants", { p_campaign: campaignId, p_items: items }),
  updateGoal: (campaignId: string, userId: string, goal: number) =>
    rpc<void>("zk_update_participant_goal", { p_campaign: campaignId, p_user: userId, p_goal: goal }),
};

// =====================================================================
// Notifications
// =====================================================================
export const notifications = {
  async list(userId: string, page: number): Promise<AppNotification[]> {
    return check(await supabase.from("zk_notifications").select("*").eq("user_id", userId)
      .order("id", { ascending: false }).range(...range(page)));
  },
  async unreadCount(userId: string): Promise<number> {
    const { count, error } = await supabase.from("zk_notifications")
      .select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
    if (error) throw error;
    return count ?? 0;
  },
  markRead: (ids: number[] | null) => rpc<number>("zk_mark_notifications_read", ids ? { p_ids: ids } : {}),
};
