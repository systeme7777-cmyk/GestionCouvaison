const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** 1234567 -> « 1 234 567 » */
export function fmt(n: number | null | undefined): string {
  return nf.format(Number(n ?? 0)).replace(/[  ]/g, " ");
}

export function percentOf(done: number, goal: number): number {
  return goal <= 0 ? 0 : Math.floor((done * 100) / goal);
}

const dayLong = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const dayShort = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const dayHeader = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

function parseDate(iso: string): Date {
  // Dates « AAAA-MM-JJ » interprétées en heure locale
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(iso);
}

export const dateLabel = (iso: string) => dayLong.format(parseDate(iso));
export const dateShort = (iso: string) => dayShort.format(parseDate(iso));
export const timeOf = (iso: string) => time.format(new Date(iso));

export function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayLabel(key: string): string {
  const d = parseDate(key);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  const s = dayHeader.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function relativeTime(iso: string): string {
  const d = new Date(iso);
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  if (d.toDateString() === today.toDateString()) return `aujourd'hui à ${time.format(d)}`;
  if (d.toDateString() === yesterday.toDateString()) return `hier à ${time.format(d)}`;
  return `${dayShort.format(d)} à ${time.format(d)}`;
}

/** « Aïcha Ndiaye » -> « aicha.ndiaye » */
export function suggestUsername(fullName: string): string {
  return fullName
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}+/gu, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 32);
}

export const USERNAME_REGEX = /^[a-z0-9._-]{3,32}$/;

export function generatePassword(length = 8): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => chars[v % chars.length]).join("");
}

export function auditActionLabel(action: string): string {
  const labels: Record<string, string> = {
    campagne_creee: "Campagne créée",
    campagne_modifiee: "Campagne modifiée",
    campagne_cloturee: "Campagne clôturée",
    campagne_rouverte: "Campagne rouverte",
    campagne_supprimee: "Campagne supprimée",
    participant_ajoute: "Participant ajouté à une campagne",
    participant_reintegre: "Participant réintégré dans une campagne",
    participant_retire: "Participant retiré d'une campagne",
    objectif_modifie: "Objectif personnel modifié",
    objectif_personnel_atteint: "Objectif personnel atteint",
    objectif_global_atteint: "Objectif global atteint",
    mot_de_passe_modifie: "Mot de passe modifié",
    mot_de_passe_reinitialise: "Mot de passe réinitialisé",
    proprietaire_cree: "Application configurée (administrateur principal)",
    administrateur_cree: "Administrateur créé",
    participant_cree: "Participant créé",
    compte_modifie: "Informations du compte modifiées",
    compte_desactive: "Compte désactivé",
    compte_reactive: "Compte réactivé",
    promu_administrateur: "Nommé administrateur",
    droits_admin_retires: "Droits d'administrateur retirés",
    administrateur_supprime: "Administrateur supprimé",
    participant_supprime: "Participant supprimé",
  };
  return labels[action] ?? action.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}
