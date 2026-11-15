import type { Action, Permissions, Profil, Role } from './types';

export const MODULES: { cle: string; nom: string }[] = [
  { cle: 'elevage', nom: 'Élevage (lots)' },
  { cle: 'production', nom: 'Ponte et production' },
  { cle: 'achats', nom: 'Achats' },
  { cle: 'ventes', nom: 'Ventes' },
  { cle: 'stocks', nom: 'Stocks' },
  { cle: 'depenses', nom: 'Dépenses' },
  { cle: 'revenus', nom: 'Revenus' },
  { cle: 'clients', nom: 'Clients' },
  { cle: 'fournisseurs', nom: 'Fournisseurs' },
  { cle: 'finances', nom: 'Finances' },
  { cle: 'historique', nom: 'Historique et rapports' },
  { cle: 'catalogue', nom: 'Espèces, catégories et produits' },
  { cle: 'parametres', nom: 'Paramètres généraux' },
];

export const ACTIONS: { cle: Action; nom: string }[] = [
  { cle: 'lire', nom: 'Consulter' },
  { cle: 'ajouter', nom: 'Ajouter' },
  { cle: 'modifier', nom: 'Modifier' },
  { cle: 'supprimer', nom: 'Supprimer' },
];

export const ROLES: { cle: Role; nom: string; description: string }[] = [
  { cle: 'admin_principal', nom: 'Administrateur principal', description: 'Accès total, gestion des utilisateurs et des permissions' },
  { cle: 'admin', nom: 'Administrateur', description: 'Gestion des opérations selon les permissions accordées' },
  { cle: 'gestionnaire', nom: 'Gestionnaire', description: 'Animaux, achats, ventes et stocks' },
  { cle: 'employe', nom: 'Employé', description: 'Uniquement les fonctions autorisées' },
];

export function nomRole(r: string) {
  return ROLES.find((x) => x.cle === r)?.nom ?? r;
}

const tout = { lire: true, ajouter: true, modifier: true, supprimer: true };
const lecture = { lire: true, ajouter: false, modifier: false, supprimer: false };
const saisie = { lire: true, ajouter: true, modifier: false, supprimer: false };
const gestion = { lire: true, ajouter: true, modifier: true, supprimer: false };

/** Permissions proposées par défaut pour chaque rôle (modifiables individuellement) */
export function permissionsParDefaut(role: Role): Permissions {
  const p: Permissions = {};
  for (const m of MODULES) p[m.cle] = { lire: false, ajouter: false, modifier: false, supprimer: false };
  if (role === 'admin_principal' || role === 'admin') {
    for (const m of MODULES) p[m.cle] = { ...tout };
    if (role === 'admin') p.parametres = { ...gestion };
    return p;
  }
  if (role === 'gestionnaire') {
    for (const m of ['elevage', 'production', 'achats', 'ventes', 'stocks', 'clients', 'fournisseurs']) p[m] = { ...tout };
    p.depenses = { ...gestion };
    p.revenus = { ...lecture };
    p.finances = { ...lecture };
    p.historique = { ...lecture };
    p.catalogue = { ...gestion };
    return p;
  }
  p.elevage = { ...saisie };
  p.production = { ...saisie };
  p.ventes = { ...saisie };
  p.stocks = { ...lecture };
  p.clients = { ...saisie };
  return p;
}

export function peut(profil: Profil | null | undefined, module: string, action: Action = 'lire'): boolean {
  if (!profil || !profil.actif || profil.supprime) return false;
  if (profil.role === 'admin_principal') return true;
  return Boolean(profil.permissions?.[module]?.[action]);
}

export function peutUn(profil: Profil | null | undefined, modules: string[], action: Action = 'lire') {
  return modules.some((m) => peut(profil, m, action));
}
