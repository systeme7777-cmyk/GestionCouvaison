export type Role = "admin" | "participant";

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  phone: string | null;
  role: Role;
  is_owner: boolean;
  is_active: boolean;
  must_change_password: boolean;
  deleted_at: string | null;
  created_at?: string;
}

export interface ProfileRef {
  id?: string;
  full_name: string;
  username: string;
}

export interface Campaign {
  id: string;
  title: string;
  zikr_type: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  global_goal: number;
  total_count: number;
  participants_count: number;
  status: "en_cours" | "terminee";
  goal_reached_at: string | null;
  closed_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CampaignRef {
  id?: string;
  title: string;
  zikr_type: string;
}

export interface Participation {
  campaign_id: string;
  user_id: string;
  personal_goal: number;
  count: number;
  completed_at: string | null;
  last_entry_at: string | null;
  removed_at: string | null;
  created_at?: string;
  updated_at?: string;
  campaigns?: Campaign | null;
  profiles?: ProfileRef | null;
}

export interface ZikrEntry {
  id: number;
  campaign_id: string;
  user_id: string;
  amount: number;
  kind: "ajout" | "annulation";
  count_after: number;
  created_at: string;
  campaigns?: CampaignRef | null;
  profiles?: ProfileRef | null;
}

export interface AuditEntry {
  id: number;
  actor_id: string | null;
  action: string;
  target_user: string | null;
  campaign_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  actor?: ProfileRef | null;
  target?: ProfileRef | null;
  campaign?: CampaignRef | null;
}

export interface AppNotification {
  id: number;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface AdminOverview {
  campagnes_en_cours: number;
  campagnes_terminees: number;
  participants: number;
  participants_actifs: number;
  administrateurs: number;
  total_zikr: number;
  zikr_aujourdhui: number;
  objectifs_personnels_atteints: number;
}

export interface MyOverview {
  total_zikr: number;
  zikr_aujourdhui: number;
  campagnes: number;
  objectifs_atteints: number;
}

export interface DailyStat {
  day: string;
  total: number;
}

export interface AddZikrResult {
  entry_id: number;
  personal_count: number;
  personal_goal: number;
  campaign_total: number;
  global_goal: number;
  updated_at: string | null;
  duplicate: boolean;
}

export type Phase = "active" | "upcoming" | "ended" | "closed";

export const PHASE_LABEL: Record<Phase, string> = {
  active: "En cours",
  upcoming: "À venir",
  ended: "Terminée",
  closed: "Clôturée",
};

export function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function campaignPhase(c: Campaign, today = todayIso()): Phase {
  if (c.status === "terminee") return "closed";
  if (c.end_date && c.end_date < today) return "ended";
  if (c.start_date > today) return "upcoming";
  return "active";
}

export const isFinished = (p: Phase) => p === "ended" || p === "closed";
export const isAdmin = (p: Profile) => p.role === "admin";
export const roleLabel = (p: Profile) =>
  p.is_owner ? "Administrateur principal" : p.role === "admin" ? "Administrateur" : "Participant";
