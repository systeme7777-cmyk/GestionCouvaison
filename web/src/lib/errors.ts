/** Erreur déjà rédigée pour l'utilisateur, en français. */
export class UserError extends Error {}

export function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  const msg = String((e as { message?: string })?.message ?? e ?? "").toLowerCase();
  return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("load failed");
}

const FRENCH_START = /^(Vous|Votre|Cette|Ce |Le |La |L'|Les |Chaque|Impossible|Action|Campagne|Participant|Identifiant|Liste|Compte|Seul|Une |Accès)/;

/** Traduit une erreur quelconque en message clair en français. */
export function toUserMessage(e: unknown): string {
  if (e instanceof UserError) return e.message;
  if (!navigator.onLine || isNetworkError(e)) return "Connexion impossible. Vérifiez votre accès à Internet.";
  const err = e as { message?: string; code?: string; status?: number };
  const raw = String(err?.message ?? e ?? "");
  const lower = raw.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Identifiant ou mot de passe incorrect.";
  if (lower.includes("banned")) return "Ce compte est désactivé. Contactez un administrateur.";
  if (lower.includes("should be different")) return "Le nouveau mot de passe doit être différent de l'ancien.";
  if (lower.includes("password should be")) return "Mot de passe trop faible (au moins 6 caractères).";
  if (lower.includes("rate limit")) return "Trop de tentatives. Patientez quelques minutes.";
  if (lower.includes("jwt") || lower.includes("refresh token")) return "Votre session a expiré. Veuillez vous reconnecter.";
  if (lower.includes("permission denied")) return "Vous n'avez pas l'autorisation d'effectuer cette action.";
  if (lower.includes("duplicate key")) return "Cet élément existe déjà.";
  if (FRENCH_START.test(raw)) return raw;
  return "Une erreur est survenue. Veuillez réessayer.";
}
