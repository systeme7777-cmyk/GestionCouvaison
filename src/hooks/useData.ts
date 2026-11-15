import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useSyncExternalStore } from 'react';
import { actifs, type Donnees } from '../lib/calc';
import { db } from '../lib/db';
import { definirDevise } from '../lib/format';
import { abonner, lireEtat } from '../lib/sync';
import type {
  Categorie, Espece, Parametre, Profil, Produit, Tiers,
} from '../lib/types';

export interface Tout extends Donnees {
  especes: Espece[];
  categories: Categorie[];
  clients: Tiers[];
  fournisseurs: Tiers[];
  profils: Profil[];
  parametres: Record<string, any>;
  pret: boolean;
}

const VIDE: Tout = {
  produits: [], lots: [], evenements: [], achats: [], ventes: [], paiements: [], mouvements: [],
  depenses: [], revenus: [], productions: [], especes: [], categories: [], clients: [], fournisseurs: [],
  profils: [], parametres: {}, pret: false,
};

/** Toutes les données locales, mises à jour automatiquement (base locale + synchronisation) */
export function useTout(): Tout {
  const brut = useLiveQuery(async () => {
    const [produits, lots, evenements, achats, ventes, paiements, mouvements, depenses, revenus, productions,
      especes, categories, clients, fournisseurs, profils, params] = await Promise.all([
      db.ae_produits.toArray(), db.ae_lots.toArray(), db.ae_lot_evenements.toArray(), db.ae_achats.toArray(),
      db.ae_ventes.toArray(), db.ae_paiements.toArray(), db.ae_mouvements.toArray(), db.ae_depenses.toArray(),
      db.ae_revenus.toArray(), db.ae_productions.toArray(), db.ae_especes.toArray(), db.ae_categories.toArray(),
      db.ae_clients.toArray(), db.ae_fournisseurs.toArray(), db.ae_profils.toArray(), db.ae_parametres.toArray(),
    ]);
    return { produits, lots, evenements, achats, ventes, paiements, mouvements, depenses, revenus, productions,
      especes, categories, clients, fournisseurs, profils, params };
  }, []);

  return useMemo(() => {
    if (!brut) return VIDE;
    const parametres: Record<string, any> = {};
    for (const p of actifs(brut.params as Parametre[])) parametres[p.cle] = p.valeur;
    definirDevise(parametres.devise ?? 'FCFA');
    const tri = <T extends { nom: string; ordre?: number }>(l: T[]) =>
      l.sort((a, b) => (a.ordre ?? 100) - (b.ordre ?? 100) || a.nom.localeCompare(b.nom, 'fr'));
    return {
      produits: tri(brut.produits as Produit[]),
      lots: brut.lots, evenements: brut.evenements, achats: brut.achats, ventes: brut.ventes,
      paiements: brut.paiements, mouvements: brut.mouvements, depenses: brut.depenses, revenus: brut.revenus,
      productions: brut.productions,
      especes: tri(brut.especes as Espece[]),
      categories: tri(brut.categories as Categorie[]),
      clients: (brut.clients as Tiers[]).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
      fournisseurs: (brut.fournisseurs as Tiers[]).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
      profils: brut.profils as Profil[],
      parametres,
      pret: true,
    } as Tout;
  }, [brut]);
}

export function useEtatSync() {
  return useSyncExternalStore(abonner, lireEtat, lireEtat);
}

export function nomUtilisateur(profils: Profil[], id?: string | null) {
  if (!id) return '—';
  const p = profils.find((x) => x.id === id);
  if (!p) return 'Utilisateur';
  return `${p.prenom} ${p.nom}`.trim() || p.email;
}

export function listeParam(t: Tout, cle: string, defaut: string[]): string[] {
  const v = t.parametres[cle];
  return Array.isArray(v) && v.length ? v : defaut;
}
