import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { useState } from 'react';
import { nomEspece, nomProduit } from '../components/Selecteurs';
import { Choix, Page, useToast } from '../components/ui';
import { useTout, type Tout } from '../hooks/useData';
import { actifs, bilan, calculerStocks, effectifLot, filtrer, resteAchat, resteVente } from '../lib/calc';
import { enTetePDF, partagerFichier, pdfTxt, piedPDF, versExcel } from '../lib/export';
import { argent, dateFr, MOIS, nombre } from '../lib/format';

function bornes(type: 'mois' | 'annee', annee: number, mois: number) {
  if (type === 'annee') return { du: `${annee}-01-01`, au: `${annee}-12-31`, titre: `Rapport annuel ${annee}` };
  const fin = new Date(annee, mois, 0).getDate();
  const m = String(mois).padStart(2, '0');
  return { du: `${annee}-${m}-01`, au: `${annee}-${m}-${fin}`, titre: `Rapport mensuel — ${MOIS[mois - 1]} ${annee}` };
}

function rapportPDF(t: Tout, du: string, au: string, titre: string) {
  const f = { du, au };
  const b = bilan(t, f, Number(t.parametres.tresorerie_initiale || 0));
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = enTetePDF(doc, titre, `Période du ${dateFr(du)} au ${dateFr(au)}`, t.parametres.nom_exploitation || 'ANSAR ELEVAGE');
  const vert: [number, number, number] = [31, 107, 53];
  const table = (titreT: string, head: string[], body: any[][], droite: number[] = []) => {
    if (y > 250) { doc.addPage(); y = 15; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(titreT, 12, y + 4);
    autoTable(doc, {
      startY: y + 7, head: [head], body: body.map((r) => r.map(pdfTxt)), headStyles: { fillColor: vert }, styles: { fontSize: 8.5, cellPadding: 1.6 },
      columnStyles: Object.fromEntries(droite.map((i) => [i, { halign: 'right' }])), margin: { left: 12, right: 12 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  };
  table('1. Synthèse financière', ['Indicateur', 'Montant'], [
    ["Chiffre d'affaires (ventes)", argent(b.totalVentes)], ['Autres revenus', argent(b.autresRevenus)],
    ['Total des revenus', argent(b.totalRevenus)], ['Total des achats', argent(b.totalAchats)],
    ['Total des dépenses', argent(b.totalDepenses)], ["Coûts d'achat des lots", argent(b.coutLots)],
    ['Résultat (bénéfice / perte)', argent(b.resultat)], ['Montants encaissés', argent(b.encaisse)],
    ['Montants payés', argent(b.paye)], ['Dettes clients', argent(b.dettesClients)],
    ['Dettes fournisseurs', argent(b.dettesFournisseurs)], ['Trésorerie disponible (fin de période)', argent(b.tresorerie)],
  ], [1]);

  const lots = actifs(t.lots).filter((l) => l.date_arrivee <= au);
  table('2. Élevage — lots', ['Lot', 'Espèce', 'Initial', 'Décès', 'Actuel'],
    lots.map((l) => { const e = effectifLot(l, t); return [l.nom, nomEspece(t, l.espece_id).replace(/^\S+\s/, ''), nombre(l.effectif_initial), nombre(e.deces), nombre(e.actuel)]; }), [2, 3, 4]);

  const prods = filtrer(t.productions, f);
  const s = (k: string) => prods.reduce((x, p: any) => x + Number(p[k] || 0), 0);
  table('3. Production', ['Indicateur', 'Quantité'], [
    ['Œufs pondus', nombre(s('oeufs_pondus'))], ['Œufs cassés', nombre(s('oeufs_casses'))],
    ['Œufs commercialisables', nombre(s('oeufs_commercialisables'))], ['Œufs fécondés', nombre(s('oeufs_fecondes'))],
    ['Œufs mis en couveuse', nombre(s('oeufs_couveuse'))], ['Viande (kg)', nombre(s('viande_kg'))], ['Fientes (kg)', nombre(s('fientes_kg'))],
  ], [1]);

  const ventes = filtrer(t.ventes, f);
  const parProduit = new Map<string, { q: number; m: number }>();
  ventes.forEach((v) => { const r = parProduit.get(v.produit_id) ?? { q: 0, m: 0 }; r.q += Number(v.quantite); r.m += resteVente(v, []).total; parProduit.set(v.produit_id, r); });
  table('4. Ventes par produit', ['Produit', 'Quantité', 'Montant'], [...parProduit.entries()].map(([p, r]) => [nomProduit(t, p), nombre(r.q), argent(r.m)]), [1, 2]);

  const achats = filtrer(t.achats, f);
  const parProduitA = new Map<string, { q: number; m: number }>();
  achats.forEach((a) => { const r = parProduitA.get(a.produit_id) ?? { q: 0, m: 0 }; r.q += Number(a.quantite); r.m += resteAchat(a, []).total; parProduitA.set(a.produit_id, r); });
  table('5. Achats par produit', ['Produit', 'Quantité', 'Montant'], [...parProduitA.entries()].map(([p, r]) => [nomProduit(t, p), nombre(r.q), argent(r.m)]), [1, 2]);

  const deps = filtrer(t.depenses, f);
  const parCat = new Map<string, number>();
  deps.forEach((d) => parCat.set(d.categorie, (parCat.get(d.categorie) ?? 0) + Number(d.montant)));
  table('6. Dépenses par catégorie', ['Catégorie', 'Montant'], [...parCat.entries()].map(([c, m]) => [c, argent(m)]), [1]);

  const st = calculerStocks(t);
  table('7. Stocks actuels', ['Produit', 'Disponible'], actifs(t.produits).filter((p) => p.stockable && (st.get(p.id)?.disponible ?? 0) !== 0)
    .map((p) => [p.nom, `${nombre(st.get(p.id)?.disponible)} ${p.unite}`]), [1]);
  piedPDF(doc);
  return doc.output('blob');
}

export function Rapports() {
  const t = useTout();
  const toast = useToast();
  const now = new Date();
  const [type, setType] = useState<'mois' | 'annee'>('mois');
  const [annee, setAnnee] = useState(now.getFullYear());
  const [mois, setMois] = useState(now.getMonth() + 1);
  const annees = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);
  const { du, au, titre } = bornes(type, annee, mois);

  const pdf = async () => {
    try { await partagerFichier(`${titre.replace(/\W+/g, '_')}.pdf`, rapportPDF(t, du, au, titre), titre); }
    catch (e: any) { toast(String(e?.message ?? e), true); }
  };
  const excel = async () => {
    const f = { du, au };
    const blob = versExcel([
      { nom: 'Ventes', lignes: filtrer(t.ventes, f), colonnes: [
        { titre: 'Date', valeur: (v: any) => v.date }, { titre: 'N°', valeur: (v: any) => v.numero }, { titre: 'Client', valeur: (v: any) => v.client_nom },
        { titre: 'Produit', valeur: (v: any) => nomProduit(t, v.produit_id) }, { titre: 'Quantité', valeur: (v: any) => Number(v.quantite) },
        { titre: 'Prix unitaire', valeur: (v: any) => Number(v.prix_unitaire) }, { titre: 'Total', valeur: (v: any) => resteVente(v, []).total },
        { titre: 'Reste', valeur: (v: any) => resteVente(v, t.paiements).reste }] },
      { nom: 'Achats', lignes: filtrer(t.achats, f), colonnes: [
        { titre: 'Date', valeur: (v: any) => v.date }, { titre: 'Fournisseur', valeur: (v: any) => v.fournisseur_nom },
        { titre: 'Produit', valeur: (v: any) => nomProduit(t, v.produit_id) }, { titre: 'Quantité', valeur: (v: any) => Number(v.quantite) },
        { titre: 'Prix unitaire', valeur: (v: any) => Number(v.prix_unitaire) }, { titre: 'Total', valeur: (v: any) => resteAchat(v, []).total },
        { titre: 'Reste', valeur: (v: any) => resteAchat(v, t.paiements).reste }] },
      { nom: 'Dépenses', lignes: filtrer(t.depenses, f), colonnes: [
        { titre: 'Date', valeur: (v: any) => v.date }, { titre: 'Catégorie', valeur: (v: any) => v.categorie },
        { titre: 'Description', valeur: (v: any) => v.description }, { titre: 'Montant', valeur: (v: any) => Number(v.montant) }] },
      { nom: 'Revenus', lignes: filtrer(t.revenus, f), colonnes: [
        { titre: 'Date', valeur: (v: any) => v.date }, { titre: 'Catégorie', valeur: (v: any) => v.categorie },
        { titre: 'Description', valeur: (v: any) => v.description }, { titre: 'Montant', valeur: (v: any) => Number(v.montant) }] },
      { nom: 'Production', lignes: filtrer(t.productions, f), colonnes: [
        { titre: 'Date', valeur: (v: any) => v.date }, { titre: 'Pondus', valeur: (v: any) => v.oeufs_pondus }, { titre: 'Cassés', valeur: (v: any) => v.oeufs_casses },
        { titre: 'Commercialisables', valeur: (v: any) => v.oeufs_commercialisables }, { titre: 'Fécondés', valeur: (v: any) => v.oeufs_fecondes },
        { titre: 'Couveuse', valeur: (v: any) => v.oeufs_couveuse }, { titre: 'Viande kg', valeur: (v: any) => Number(v.viande_kg) }, { titre: 'Fientes kg', valeur: (v: any) => Number(v.fientes_kg) }] },
    ]);
    await partagerFichier(`${titre.replace(/\W+/g, '_')}.xlsx`, blob, titre);
  };

  return (
    <Page titre="Rapports" sousTitre="Mensuels et annuels">
      <div className="carte">
        <h2>Choisir la période</h2>
        <Choix label="Type de rapport" valeur={type} onChange={(v) => setType(v as any)} options={[{ v: 'mois', t: 'Rapport mensuel' }, { v: 'annee', t: 'Rapport annuel' }]} />
        <div className="deux">
          <Choix label="Année" valeur={String(annee)} onChange={(v) => setAnnee(Number(v))} options={annees.map((a) => ({ v: String(a), t: String(a) }))} />
          {type === 'mois' && <Choix label="Mois" valeur={String(mois)} onChange={(v) => setMois(Number(v))} options={MOIS.map((m, i) => ({ v: String(i + 1), t: m }))} />}
        </div>
        <p className="plus-petit">{titre} · du {dateFr(du)} au {dateFr(au)}</p>
        <div className="actions">
          <button className="btn" onClick={pdf}><FileText size={17} />Rapport PDF</button>
          <button className="btn second" onClick={excel}><FileSpreadsheet size={17} />Détail Excel</button>
        </div>
      </div>
      <p className="plus-petit">Le PDF peut être imprimé directement depuis le téléphone (Partager → Imprimer) ou envoyé par WhatsApp / e-mail. Chaque rubrique possède aussi un bouton « Exporter » (PDF, Excel, CSV).</p>
    </Page>
  );
}
