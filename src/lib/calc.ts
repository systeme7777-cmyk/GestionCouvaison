// Calculs métier (identiques aux fonctions SQL ae_stock_disponible / ae_effectif_lot).
import type {
  Achat, Depense, Lot, LotEvenement, Mouvement, Paiement, Production, Produit, Revenu, Vente,
} from './types';

export interface Donnees {
  produits: Produit[];
  lots: Lot[];
  evenements: LotEvenement[];
  achats: Achat[];
  ventes: Vente[];
  paiements: Paiement[];
  mouvements: Mouvement[];
  depenses: Depense[];
  revenus: Revenu[];
  productions: Production[];
}

export const actifs = <T extends { deleted_at?: string | null }>(l: T[] | undefined) =>
  (l ?? []).filter((x) => !x.deleted_at);

const n = (v: any) => Number(v || 0);
const arr = (v: number) => Math.round(v * 1000) / 1000;

export interface LigneStock {
  produit_id: string;
  initial: number;
  achete: number;
  produit: number;
  vendu: number;
  perdu: number;
  mort: number;
  correction: number;
  disponible: number;
}

export function calculerStocks(d: Pick<Donnees, 'produits' | 'lots' | 'evenements' | 'achats' | 'ventes' | 'mouvements'>,
  exclureVente?: string): Map<string, LigneStock> {
  const m = new Map<string, LigneStock>();
  const ligne = (id: string) => {
    let l = m.get(id);
    if (!l) {
      l = { produit_id: id, initial: 0, achete: 0, produit: 0, vendu: 0, perdu: 0, mort: 0, correction: 0, disponible: 0 };
      m.set(id, l);
    }
    return l;
  };
  for (const p of actifs(d.produits)) ligne(p.id);
  const lots = actifs(d.lots);
  const lotParId = new Map(lots.map((l) => [l.id, l]));
  for (const l of lots) if (l.produit_id) ligne(l.produit_id).initial += n(l.effectif_initial);
  for (const e of actifs(d.evenements)) {
    const src = lotParId.get(e.lot_id);
    if (!src) continue;
    if (e.type === 'transfert') {
      const dst = e.lot_dest_id ? lotParId.get(e.lot_dest_id) : undefined;
      if (!dst) continue;
      if (src.produit_id && src.produit_id !== dst.produit_id) ligne(src.produit_id).correction -= n(e.quantite);
      if (dst.produit_id && dst.produit_id !== src.produit_id) ligne(dst.produit_id).correction += n(e.quantite);
      continue;
    }
    if (!src.produit_id) continue;
    const l = ligne(src.produit_id);
    if (e.type === 'naissance') l.produit += n(e.quantite);
    else if (e.type === 'deces') l.mort += n(e.quantite);
    else if (e.type === 'reforme') l.perdu += n(e.quantite);
    else if (e.type === 'ajustement') l.correction += n(e.quantite);
  }
  for (const a of actifs(d.achats)) if (a.ajoute_stock !== false) ligne(a.produit_id).achete += n(a.quantite);
  for (const v of actifs(d.ventes)) if (v.id !== exclureVente) ligne(v.produit_id).vendu += n(v.quantite);
  for (const mv of actifs(d.mouvements)) {
    const l = ligne(mv.produit_id);
    if (mv.type === 'initial') l.initial += n(mv.quantite);
    else if (mv.type === 'production') l.produit += n(mv.quantite);
    else if (mv.type === 'perte') l.perdu += n(mv.quantite);
    else if (mv.type === 'mort') l.mort += n(mv.quantite);
    else l.correction += n(mv.quantite);
  }
  for (const l of m.values()) {
    l.disponible = arr(l.initial + l.achete + l.produit - l.vendu - l.perdu - l.mort + l.correction);
  }
  return m;
}

export function effectifLot(lot: Lot, d: Pick<Donnees, 'evenements' | 'achats' | 'ventes'>, exclureVente?: string) {
  let e = n(lot.effectif_initial);
  let naissances = 0, deces = 0, reformes = 0, transfertsIn = 0, transfertsOut = 0, ajustements = 0, achats = 0, ventes = 0;
  for (const ev of actifs(d.evenements)) {
    if (ev.lot_id === lot.id) {
      if (ev.type === 'naissance') naissances += n(ev.quantite);
      else if (ev.type === 'deces') deces += n(ev.quantite);
      else if (ev.type === 'reforme') reformes += n(ev.quantite);
      else if (ev.type === 'transfert') transfertsOut += n(ev.quantite);
      else if (ev.type === 'ajustement') ajustements += n(ev.quantite);
    } else if (ev.lot_dest_id === lot.id && ev.type === 'transfert') transfertsIn += n(ev.quantite);
  }
  for (const a of actifs(d.achats)) if (a.lot_id === lot.id) achats += n(a.quantite);
  for (const v of actifs(d.ventes)) if (v.lot_id === lot.id && v.id !== exclureVente) ventes += n(v.quantite);
  e += naissances + transfertsIn + ajustements + achats - deces - reformes - transfertsOut - ventes;
  return { actuel: e, naissances, deces, reformes, transfertsIn, transfertsOut, ajustements, achats, ventes };
}

// ---------------------------------------------------------------------------
// Paiements et dettes
// ---------------------------------------------------------------------------
export function resteVente(v: Vente, paiements: Paiement[]) {
  const total = n(v.montant_total ?? n(v.quantite) * n(v.prix_unitaire));
  const paye = n(v.montant_encaisse) + actifs(paiements).filter((p) => p.vente_id === v.id).reduce((s, p) => s + n(p.montant), 0);
  return { total, encaisse: paye, reste: Math.max(0, Math.round((total - paye) * 100) / 100) };
}

export function resteAchat(a: Achat, paiements: Paiement[]) {
  const total = n(a.montant_total ?? n(a.quantite) * n(a.prix_unitaire));
  const paye = n(a.montant_paye) + actifs(paiements).filter((p) => p.achat_id === a.id).reduce((s, p) => s + n(p.montant), 0);
  return { total, paye, reste: Math.max(0, Math.round((total - paye) * 100) / 100) };
}

// ---------------------------------------------------------------------------
// Filtres de période
// ---------------------------------------------------------------------------
export interface Filtre {
  du?: string | null;
  au?: string | null;
  espece_id?: string | null;
  produit_id?: string | null;
  lot_id?: string | null;
  user_id?: string | null;
}

export function dansPeriode(date: string | null | undefined, f: Filtre) {
  if (!date) return true;
  const d = date.slice(0, 10);
  if (f.du && d < f.du) return false;
  if (f.au && d > f.au) return false;
  return true;
}

export function filtrer<T extends Record<string, any>>(rows: T[], f: Filtre, champDate = 'date') {
  return actifs(rows).filter((r) =>
    dansPeriode(r[champDate], f)
    && (!f.espece_id || !('espece_id' in r) || r.espece_id === f.espece_id)
    && (!f.produit_id || !('produit_id' in r) || r.produit_id === f.produit_id)
    && (!f.lot_id || !('lot_id' in r) || r.lot_id === f.lot_id)
    && (!f.user_id || r.created_by === f.user_id));
}

// ---------------------------------------------------------------------------
// Finances
// ---------------------------------------------------------------------------
export interface Bilan {
  totalAchats: number;
  totalVentes: number;
  totalDepenses: number;
  autresRevenus: number;
  totalRevenus: number;
  coutLots: number;
  encaisse: number;
  paye: number;
  dettesClients: number;
  dettesFournisseurs: number;
  resultat: number;
  tresorerie: number;
  chargesTotales: number;
}

export function bilan(d: Donnees, f: Filtre, tresorerieInitiale = 0): Bilan {
  const achats = filtrer(d.achats, f);
  const ventes = filtrer(d.ventes, f);
  const depenses = filtrer(d.depenses, f);
  const revenus = filtrer(d.revenus, f);
  const lots = filtrer(d.lots, { ...f, produit_id: null }, 'date_arrivee');
  const paiements = actifs(d.paiements);
  const paiementsPeriode = filtrer(paiements, { du: f.du, au: f.au, user_id: f.user_id });
  const idsVentes = new Set(ventes.map((v) => v.id));
  const idsAchats = new Set(achats.map((a) => a.id));
  const filtreTiers = !!(f.espece_id || f.produit_id || f.lot_id);

  const totalAchats = achats.reduce((s, a) => s + resteAchat(a, []).total, 0);
  const totalVentes = ventes.reduce((s, v) => s + resteVente(v, []).total, 0);
  const totalDepenses = depenses.reduce((s, x) => s + n(x.montant), 0);
  const autresRevenus = revenus.reduce((s, x) => s + n(x.montant), 0);
  const coutLots = lots.reduce((s, l) => s + n(l.cout_achat), 0);

  const encaisse = ventes.reduce((s, v) => s + n(v.montant_encaisse), 0)
    + paiementsPeriode.filter((p) => p.type === 'encaissement' && (!filtreTiers || idsVentes.has(p.vente_id!))).reduce((s, p) => s + n(p.montant), 0)
    + autresRevenus;
  const paye = achats.reduce((s, a) => s + n(a.montant_paye), 0)
    + paiementsPeriode.filter((p) => p.type === 'decaissement' && (!filtreTiers || idsAchats.has(p.achat_id!))).reduce((s, p) => s + n(p.montant), 0)
    + totalDepenses + coutLots;

  const dettesClients = ventes.reduce((s, v) => s + resteVente(v, paiements).reste, 0);
  const dettesFournisseurs = achats.reduce((s, a) => s + resteAchat(a, paiements).reste, 0);

  // Trésorerie : toujours depuis le début (solde réel en caisse à la date de fin)
  const fin = { au: f.au } as Filtre;
  const toutesVentes = filtrer(d.ventes, fin);
  const tousAchats = filtrer(d.achats, fin);
  const entrees = toutesVentes.reduce((s, v) => s + n(v.montant_encaisse), 0)
    + filtrer(paiements, fin).filter((p) => p.type === 'encaissement').reduce((s, p) => s + n(p.montant), 0)
    + filtrer(d.revenus, fin).reduce((s, x) => s + n(x.montant), 0);
  const sorties = tousAchats.reduce((s, a) => s + n(a.montant_paye), 0)
    + filtrer(paiements, fin).filter((p) => p.type === 'decaissement').reduce((s, p) => s + n(p.montant), 0)
    + filtrer(d.depenses, fin).reduce((s, x) => s + n(x.montant), 0)
    + filtrer(d.lots, fin, 'date_arrivee').reduce((s, l) => s + n(l.cout_achat), 0);

  const totalRevenus = totalVentes + autresRevenus;
  const chargesTotales = totalAchats + totalDepenses + coutLots;
  return {
    totalAchats, totalVentes, totalDepenses, autresRevenus, totalRevenus, coutLots,
    encaisse, paye, dettesClients, dettesFournisseurs,
    resultat: totalRevenus - chargesTotales,
    tresorerie: n(tresorerieInitiale) + entrees - sorties,
    chargesTotales,
  };
}

// ---------------------------------------------------------------------------
// Historique des mouvements d'un produit
// ---------------------------------------------------------------------------
export interface LigneMouvement {
  id: string;
  date: string;
  libelle: string;
  type: string;
  quantite: number; // signée
  source: string;
  created_by?: string | null;
  created_at?: string;
}

export function mouvementsProduit(produitId: string, d: Donnees): LigneMouvement[] {
  const out: LigneMouvement[] = [];
  const lots = actifs(d.lots);
  const lotParId = new Map(lots.map((l) => [l.id, l]));
  for (const l of lots) if (l.produit_id === produitId && n(l.effectif_initial) > 0)
    out.push({ id: 'lot' + l.id, date: l.date_arrivee, libelle: `Effectif initial du lot ${l.nom}`, type: 'Stock initial', quantite: n(l.effectif_initial), source: 'Élevage', created_by: l.created_by, created_at: l.created_at });
  for (const e of actifs(d.evenements)) {
    const src = lotParId.get(e.lot_id);
    if (!src) continue;
    if (e.type === 'transfert') {
      const dst = e.lot_dest_id ? lotParId.get(e.lot_dest_id) : undefined;
      if (!dst || src.produit_id === dst.produit_id) continue;
      if (src.produit_id === produitId) out.push({ id: e.id + 'o', date: e.date, libelle: `Transfert ${src.nom} → ${dst.nom}`, type: 'Transfert', quantite: -n(e.quantite), source: 'Élevage', created_by: e.created_by, created_at: e.created_at });
      if (dst.produit_id === produitId) out.push({ id: e.id + 'i', date: e.date, libelle: `Transfert ${src.nom} → ${dst.nom}`, type: 'Transfert', quantite: n(e.quantite), source: 'Élevage', created_by: e.created_by, created_at: e.created_at });
      continue;
    }
    if (src.produit_id !== produitId) continue;
    const signe = e.type === 'naissance' || e.type === 'ajustement' ? 1 : -1;
    const lib = { naissance: 'Naissance', deces: 'Décès', reforme: 'Réforme', ajustement: 'Ajustement' }[e.type] ?? e.type;
    out.push({ id: e.id, date: e.date, libelle: `${lib} — lot ${src.nom}${e.cause ? ' (' + e.cause + ')' : ''}`, type: lib, quantite: signe * n(e.quantite), source: 'Élevage', created_by: e.created_by, created_at: e.created_at });
  }
  for (const a of actifs(d.achats)) if (a.produit_id === produitId && a.ajoute_stock !== false)
    out.push({ id: a.id, date: a.date, libelle: `Achat${a.fournisseur_nom ? ' — ' + a.fournisseur_nom : ''}`, type: 'Achat', quantite: n(a.quantite), source: 'Achats', created_by: a.created_by, created_at: a.created_at });
  for (const v of actifs(d.ventes)) if (v.produit_id === produitId)
    out.push({ id: v.id, date: v.date, libelle: `Vente${v.client_nom ? ' — ' + v.client_nom : ''}${v.numero ? ' (' + v.numero + ')' : ''}`, type: 'Vente', quantite: -n(v.quantite), source: 'Ventes', created_by: v.created_by, created_at: v.created_at });
  const libMvt: Record<string, string> = { initial: 'Stock initial', production: 'Production', perte: 'Perte', mort: 'Mortalité', correction: 'Correction' };
  for (const m of actifs(d.mouvements)) if (m.produit_id === produitId) {
    const signe = m.type === 'perte' || m.type === 'mort' ? -1 : 1;
    out.push({ id: m.id, date: m.date, libelle: `${libMvt[m.type]}${m.motif ? ' — ' + m.motif : ''}`, type: libMvt[m.type], quantite: signe * n(m.quantite), source: m.source === 'production' ? 'Production' : 'Stocks', created_by: m.created_by, created_at: m.created_at });
  }
  return out.sort((a, b) => (b.date + (b.created_at ?? '')).localeCompare(a.date + (a.created_at ?? '')));
}

/** Catégorie de revenu d'une vente (pour la rubrique Revenus) */
export function categorieRevenuVente(v: Vente, produits: Produit[]) {
  return produits.find((p) => p.id === v.produit_id)?.categorie_revenu || 'Autres revenus';
}
