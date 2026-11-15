// Types des enregistrements (miroir des tables Supabase ae_*)

export interface Base {
  id: string;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
  deleted_at?: string | null;
  /** Indicateurs locaux (non envoyés au serveur) */
  _attente?: boolean;
  _erreur?: string | null;
}

export type Role = 'admin_principal' | 'admin' | 'gestionnaire' | 'employe';
export type Action = 'lire' | 'ajouter' | 'modifier' | 'supprimer';
export type Permissions = Record<string, Partial<Record<Action, boolean>>>;

export interface Profil extends Base {
  nom: string;
  prenom: string;
  telephone?: string | null;
  email: string;
  role: Role;
  permissions: Permissions;
  actif: boolean;
  supprime: boolean;
  doit_changer_mdp: boolean;
  derniere_connexion?: string | null;
}

export interface Parametre extends Base { cle: string; valeur: any; }
export interface Espece extends Base { nom: string; icone?: string | null; ordre: number; actif: boolean; }
export interface Categorie extends Base { nom: string; type: 'animaux' | 'oeufs' | 'derives' | 'autre'; ordre: number; }
export interface Produit extends Base {
  nom: string; espece_id?: string | null; categorie_id?: string | null; unite: string;
  stockable: boolean; seuil_alerte: number; prix_vente?: number | null; categorie_revenu: string; actif: boolean;
}
export interface Tiers extends Base { nom: string; telephone?: string | null; adresse?: string | null; notes?: string | null; }
export interface Lot extends Base {
  nom: string; espece_id?: string | null; produit_id?: string | null; race?: string | null;
  date_arrivee: string; effectif_initial: number; males: number; femelles: number;
  age_arrivee_jours: number; provenance?: string | null; cout_achat: number;
  statut: 'actif' | 'cloture'; observations?: string | null;
}
export type TypeEvenement = 'naissance' | 'deces' | 'reforme' | 'transfert' | 'ajustement';
export interface LotEvenement extends Base {
  lot_id: string; date: string; type: TypeEvenement; quantite: number;
  lot_dest_id?: string | null; cause?: string | null; observations?: string | null;
}
export interface Achat extends Base {
  date: string; fournisseur_id?: string | null; fournisseur_nom?: string | null;
  espece_id?: string | null; categorie_id?: string | null; produit_id: string; lot_id?: string | null;
  quantite: number; unite?: string | null; prix_unitaire: number; montant_total?: number;
  montant_paye: number; mode_paiement?: string | null; ajoute_stock: boolean;
  observations?: string | null; justificatif_path?: string | null;
}
export interface Vente extends Base {
  numero?: string | null; date: string; client_id?: string | null; client_nom?: string | null;
  espece_id?: string | null; categorie_id?: string | null; produit_id: string; lot_id?: string | null;
  quantite: number; unite?: string | null; prix_unitaire: number; montant_total?: number;
  montant_encaisse: number; mode_paiement?: string | null; observations?: string | null;
}
export interface Paiement extends Base {
  date: string; type: 'encaissement' | 'decaissement'; vente_id?: string | null; achat_id?: string | null;
  montant: number; mode_paiement?: string | null; observations?: string | null;
}
export interface Depense extends Base {
  date: string; categorie: string; description?: string | null; montant: number;
  mode_paiement?: string | null; fournisseur_id?: string | null; fournisseur_nom?: string | null;
  espece_id?: string | null; lot_id?: string | null; justificatif_path?: string | null;
}
export interface Revenu extends Base {
  date: string; categorie: string; description?: string | null; montant: number;
  mode_paiement?: string | null; client_id?: string | null; client_nom?: string | null; espece_id?: string | null;
}
export interface Production extends Base {
  date: string; lot_id?: string | null; espece_id?: string | null;
  oeufs_pondus: number; oeufs_casses: number; oeufs_commercialisables: number;
  oeufs_fecondes: number; oeufs_couveuse: number; viande_kg: number; fientes_kg: number;
  produit_oeufs_id?: string | null; produit_fecondes_id?: string | null;
  produit_viande_id?: string | null; produit_fientes_id?: string | null;
  valide: boolean; valide_le?: string | null; valide_par?: string | null; observations?: string | null;
}
export type TypeMouvement = 'initial' | 'production' | 'perte' | 'mort' | 'correction';
export interface Mouvement extends Base {
  date: string; produit_id: string; type: TypeMouvement; quantite: number; lot_id?: string | null;
  source?: string | null; source_id?: string | null; motif?: string | null;
}
export interface JournalEntree {
  id: number; table_nom: string; enregistrement_id: string | null; action: string;
  user_id: string | null; fait_le: string; donnees: any; anciennes: any;
}

export const TABLES = [
  'ae_profils', 'ae_parametres', 'ae_especes', 'ae_categories', 'ae_produits',
  'ae_clients', 'ae_fournisseurs', 'ae_lots', 'ae_lot_evenements', 'ae_achats',
  'ae_ventes', 'ae_paiements', 'ae_depenses', 'ae_revenus', 'ae_productions', 'ae_mouvements',
] as const;
export type TableNom = typeof TABLES[number];

/** Colonnes calculées par le serveur : jamais envoyées */
export const COLONNES_SERVEUR: Partial<Record<TableNom, string[]>> = {
  ae_achats: ['montant_total'],
  ae_ventes: ['montant_total'],
};

export const LIBELLES_TABLES: Record<string, string> = {
  ae_profils: 'Utilisateurs', ae_parametres: 'Paramètres', ae_especes: 'Espèces',
  ae_categories: 'Catégories', ae_produits: 'Produits', ae_clients: 'Clients',
  ae_fournisseurs: 'Fournisseurs', ae_lots: 'Lots', ae_lot_evenements: 'Évènements de lot',
  ae_achats: 'Achats', ae_ventes: 'Ventes', ae_paiements: 'Paiements', ae_depenses: 'Dépenses',
  ae_revenus: 'Revenus', ae_productions: 'Production', ae_mouvements: 'Mouvements de stock',
};
