export type Role = 'admin' | 'operateur' | 'lecteur' | 'en_attente' | 'desactive';

export interface Profile {
  id: string;
  nom: string;
  email: string | null;
  role: Role;
  appareil: string | null;
  derniere_connexion: string | null;
  created_at: string;
  updated_at: string;
}

interface Meta {
  id: string;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Espece extends Meta {
  nom: string;
  duree_defaut: number | null;
  ordre: number;
}

export type EtatCouveuse = 'disponible' | 'occupee' | 'maintenance';

export interface Couveuse extends Meta {
  nom: string;
  capacite: number;
  type: string | null;
  temperature: number | null;
  humidite: number | null;
  etat: EtatCouveuse;
  notes: string | null;
}

export type StatutStocke = 'auto' | 'preparation' | 'annulee' | 'terminee';

export interface Couvaison extends Meta {
  numero: string | null;
  nom_lot: string | null;
  espece: string;
  race: string | null;
  date_debut: string; // AAAA-MM-JJ
  duree_jours: number;
  nb_oeufs: number;
  couveuse_id: string | null;
  responsable_id: string | null;
  observations: string | null;
  statut: StatutStocke;
  date_fin: string | null;
  oeufs_fecondes: number | null;
  oeufs_non_fecondes: number | null;
  oeufs_retires: number;
  oeufs_casses: number;
  oeufs_eclos: number | null;
  oeufs_non_eclos: number | null;
  rappels_actifs: boolean;
}

export type TypeOperation =
  | 'retournement' | 'mirage' | 'temperature' | 'humidite'
  | 'arret_retournement' | 'preparation_eclosion' | 'eclosion' | 'autre';

export interface Operation extends Meta {
  couvaison_id: string;
  type: TypeOperation;
  titre: string | null;
  date_prevue: string;
  heure: string | null; // HH:MM[:SS]
  rappel: boolean;
  fait: boolean;
  fait_par: string | null;
  fait_le: string | null;
  notes: string | null;
  auto: boolean;
}

export interface Mesure extends Meta {
  couvaison_id: string;
  date_mesure: string;
  temperature: number | null;
  humidite: number | null;
  retournements: number;
  retournements_prevus: number;
  notes: string | null;
}

export interface Mirage extends Meta {
  couvaison_id: string;
  date_mirage: string;
  fecondes: number;
  clairs: number;
  morts: number;
  notes: string | null;
}

export interface Photo extends Meta {
  couvaison_id: string;
  chemin: string;
  legende: string | null;
}

export interface Historique {
  id: string;
  table_nom: string;
  enregistrement_id: string | null;
  couvaison_id: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  resume: string | null;
  libelle: string | null;
  utilisateur_id: string | null;
  utilisateur_nom: string | null;
  changements: Record<string, unknown> | null;
  created_at: string;
}

export type TableName =
  | 'profiles' | 'especes' | 'couveuses' | 'couvaisons'
  | 'operations' | 'mesures' | 'mirages' | 'photos' | 'historique';

export const TYPES_OPERATION: { value: TypeOperation; label: string }[] = [
  { value: 'retournement', label: 'Retournement des œufs' },
  { value: 'mirage', label: 'Contrôle à la lampe (mirage)' },
  { value: 'temperature', label: 'Contrôle de température' },
  { value: 'humidite', label: "Contrôle d'humidité" },
  { value: 'arret_retournement', label: 'Arrêt du retournement' },
  { value: 'preparation_eclosion', label: "Préparation à l'éclosion" },
  { value: 'eclosion', label: 'Éclosion' },
  { value: 'autre', label: 'Autre' },
];

export const ROLES: Record<Role, string> = {
  admin: 'Administrateur',
  operateur: 'Opérateur',
  lecteur: 'Lecteur',
  en_attente: 'En attente',
  desactive: 'Désactivé',
};
