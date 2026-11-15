import { describe, expect, it } from 'vitest';
import { bilan, calculerStocks, effectifLot, mouvementsProduit, resteAchat, resteVente, type Donnees } from '../src/lib/calc';

const base = { created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', deleted_at: null } as any;
const P_OEUF = 'p-oeuf', P_POULET = 'p-poulet', P_POUSSIN = 'p-poussin';

function donnees(): Donnees {
  return {
    produits: [
      { ...base, id: P_OEUF, nom: 'Œufs', unite: 'œuf', stockable: true, seuil_alerte: 10, categorie_revenu: "Vente d'œufs", actif: true },
      { ...base, id: P_POULET, nom: 'Poulets', unite: 'tête', stockable: true, seuil_alerte: 0, categorie_revenu: 'Vente de poulets', actif: true },
      { ...base, id: P_POUSSIN, nom: 'Poussins', unite: 'tête', stockable: true, seuil_alerte: 0, categorie_revenu: 'Vente de poussins', actif: true },
    ],
    lots: [
      { ...base, id: 'L1', nom: 'Lot 1', produit_id: P_POULET, date_arrivee: '2026-01-05', effectif_initial: 100, males: 0, femelles: 0, age_arrivee_jours: 0, cout_achat: 50000, statut: 'actif' },
      { ...base, id: 'L2', nom: 'Lot 2', produit_id: P_POUSSIN, date_arrivee: '2026-01-05', effectif_initial: 0, males: 0, femelles: 0, age_arrivee_jours: 0, cout_achat: 0, statut: 'actif' },
    ],
    evenements: [
      { ...base, id: 'E1', lot_id: 'L1', date: '2026-01-10', type: 'deces', quantite: 5 },
      { ...base, id: 'E2', lot_id: 'L2', date: '2026-01-11', type: 'naissance', quantite: 30 },
      { ...base, id: 'E3', lot_id: 'L2', date: '2026-02-01', type: 'transfert', quantite: 10, lot_dest_id: 'L1' },
      { ...base, id: 'E4', lot_id: 'L1', date: '2026-02-02', type: 'reforme', quantite: 2 },
      { ...base, id: 'E5', lot_id: 'L1', date: '2026-02-03', type: 'deces', quantite: 99, deleted_at: '2026-02-04' },
    ],
    achats: [
      { ...base, id: 'A1', date: '2026-01-06', produit_id: P_OEUF, quantite: 200, prix_unitaire: 50, montant_total: 10000, montant_paye: 6000, ajoute_stock: true },
      { ...base, id: 'A2', date: '2026-01-07', produit_id: P_POULET, lot_id: 'L1', quantite: 20, prix_unitaire: 1000, montant_total: 20000, montant_paye: 20000, ajoute_stock: true },
    ],
    ventes: [
      { ...base, id: 'V1', date: '2026-01-20', produit_id: P_OEUF, quantite: 150, prix_unitaire: 75, montant_total: 11250, montant_encaisse: 5000 },
      { ...base, id: 'V2', date: '2026-01-21', produit_id: P_POULET, lot_id: 'L1', quantite: 10, prix_unitaire: 3000, montant_total: 30000, montant_encaisse: 30000 },
    ],
    paiements: [
      { ...base, id: 'PA1', date: '2026-01-25', type: 'encaissement', vente_id: 'V1', montant: 2000 },
      { ...base, id: 'PA2', date: '2026-01-26', type: 'decaissement', achat_id: 'A1', montant: 1000 },
    ],
    mouvements: [
      { ...base, id: 'M1', date: '2026-01-02', produit_id: P_OEUF, type: 'initial', quantite: 30 },
      { ...base, id: 'M2', date: '2026-01-15', produit_id: P_OEUF, type: 'production', quantite: 45, source: 'production' },
      { ...base, id: 'M3', date: '2026-01-16', produit_id: P_OEUF, type: 'perte', quantite: 5 },
      { ...base, id: 'M4', date: '2026-01-17', produit_id: P_OEUF, type: 'correction', quantite: -2 },
    ],
    depenses: [{ ...base, id: 'D1', date: '2026-01-08', categorie: 'Aliments', montant: 15000 }],
    revenus: [{ ...base, id: 'R1', date: '2026-01-09', categorie: 'Autres revenus', montant: 3000 }],
    productions: [],
  } as any;
}

describe('stocks', () => {
  it('calcule le stock disponible des œufs', () => {
    const s = calculerStocks(donnees()).get(P_OEUF)!;
    // 30 initial + 200 achetés + 45 produits − 150 vendus − 5 perdus − 2 correction
    expect(s.initial).toBe(30);
    expect(s.achete).toBe(200);
    expect(s.produit).toBe(45);
    expect(s.vendu).toBe(150);
    expect(s.perdu).toBe(5);
    expect(s.correction).toBe(-2);
    expect(s.disponible).toBe(118);
  });

  it('intègre lots, décès, réformes, transferts et ignore les suppressions', () => {
    const st = calculerStocks(donnees());
    const poulets = st.get(P_POULET)!;
    // 100 initial lot + 20 achetés − 10 vendus − 5 morts − 2 réformés + 10 transférés depuis poussins
    expect(poulets.disponible).toBe(113);
    expect(poulets.mort).toBe(5);
    const poussins = st.get(P_POUSSIN)!;
    expect(poussins.disponible).toBe(20); // 30 naissances − 10 transférés
  });

  it('exclut une vente en cours de modification', () => {
    expect(calculerStocks(donnees(), 'V1').get(P_OEUF)!.disponible).toBe(268);
  });

  it("produit l'historique des mouvements avec signes", () => {
    const m = mouvementsProduit(P_OEUF, donnees());
    expect(m.reduce((s, x) => s + x.quantite, 0)).toBe(118);
  });
});

describe('effectifs', () => {
  it('calcule l\'effectif actuel du lot', () => {
    const d = donnees();
    const e = effectifLot(d.lots[0], d);
    expect(e.actuel).toBe(100 + 20 + 10 - 5 - 2 - 10);
    expect(effectifLot(d.lots[1], d).actuel).toBe(20);
  });
});

describe('finances', () => {
  it('calcule restes à payer / encaisser', () => {
    const d = donnees();
    expect(resteVente(d.ventes[0], d.paiements).reste).toBe(11250 - 5000 - 2000);
    expect(resteAchat(d.achats[0], d.paiements).reste).toBe(10000 - 6000 - 1000);
  });

  it('distingue chiffre d\'affaires, trésorerie et bénéfice', () => {
    const b = bilan(donnees(), {}, 100000);
    expect(b.totalVentes).toBe(41250);
    expect(b.totalAchats).toBe(30000);
    expect(b.totalDepenses).toBe(15000);
    expect(b.totalRevenus).toBe(44250);
    expect(b.coutLots).toBe(50000);
    expect(b.resultat).toBe(44250 - 30000 - 15000 - 50000);
    expect(b.dettesClients).toBe(4250);
    expect(b.dettesFournisseurs).toBe(3000);
    // trésorerie = 100000 + (5000 + 30000 + 2000 + 3000) − (6000 + 20000 + 1000 + 15000 + 50000)
    expect(b.tresorerie).toBe(100000 + 40000 - 92000);
  });

  it('filtre par période', () => {
    const b = bilan(donnees(), { du: '2026-01-20', au: '2026-01-31' }, 0);
    expect(b.totalVentes).toBe(41250);
    expect(b.totalAchats).toBe(0);
    expect(b.totalDepenses).toBe(0);
  });
});
