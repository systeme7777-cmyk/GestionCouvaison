import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileText, Pencil, ShoppingCart, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BlocPaiements, ChoixMode } from '../components/Paiements';
import { nomEspece, nomLot, nomProduit, SelecteurLot, SelecteurProduit } from '../components/Selecteurs';
import {
  Alerte, bornesPeriode, BoutonAjout, Case, ChoixPeriode, DateChamp, Feuille, MenuExport, Nombre, Page, Recherche,
  Texte, TexteSuggestions, useConfirm, useToast, Vide, Zone, type Periode,
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { nomUtilisateur, useTout, type Tout } from '../hooks/useData';
import { actifs, calculerStocks, effectifLot, filtrer, resteVente } from '../lib/calc';
import { enTetePDF, exporter, partagerFichier, pdfTxt, piedPDF } from '../lib/export';
import { argent, aujourdhui, dateFr, nombre, normaliser } from '../lib/format';
import { peut } from '../lib/perms';
import { enregistrer, nouvelId, supprimer } from '../lib/repo';
import type { Vente } from '../lib/types';
import { resoudreTiers } from './Achats';

function FormVente({ t, vente, onFermer }: { t: Tout; vente?: Vente | null; onFermer: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Partial<Vente>>(vente ?? { date: aujourdhui(), quantite: 1, prix_unitaire: 0, montant_encaisse: 0, mode_paiement: 'Espèces' });
  const [comptant, setComptant] = useState(!vente);
  const s = (k: keyof Vente) => (x: any) => setV((p) => ({ ...p, [k]: x }));
  const produit = t.produits.find((p) => p.id === v.produit_id);
  const dispo = useMemo(() => (v.produit_id ? calculerStocks(t, vente?.id).get(v.produit_id)?.disponible ?? 0 : 0), [t, v.produit_id]);
  const lot = t.lots.find((l) => l.id === v.lot_id);
  const dispoLot = lot ? effectifLot(lot, t, vente?.id).actuel : null;
  const total = Math.round(Number(v.quantite || 0) * Number(v.prix_unitaire || 0) * 100) / 100;
  const encaisse = comptant ? total : Number(v.montant_encaisse || 0);
  const trop = produit?.stockable !== false && Number(v.quantite || 0) > dispo;
  const tropLot = dispoLot !== null && Number(v.quantite || 0) > dispoLot;

  const valider = async () => {
    if (!v.produit_id) return toast('Choisissez le produit vendu.', true);
    if (Number(v.quantite) <= 0) return toast('La quantité doit être positive.', true);
    if (trop) return toast(`Stock insuffisant : ${nombre(dispo)} ${produit?.unite} disponible(s).`, true);
    if (tropLot) return toast(`Effectif du lot insuffisant : ${nombre(dispoLot)}.`, true);
    if (encaisse > total) return toast('Le montant encaissé dépasse le total.', true);
    const client_id = await resoudreTiers(t, 'ae_clients', v.client_nom);
    const id = vente?.id ?? nouvelId();
    await enregistrer('ae_ventes', {
      ...v, id, client_id, client_nom: v.client_nom?.trim() || null, quantite: Number(v.quantite),
      prix_unitaire: Number(v.prix_unitaire || 0), montant_encaisse: encaisse, unite: v.unite || produit?.unite,
      numero: v.numero || `F-${(v.date ?? aujourdhui()).replace(/-/g, '')}-${id.slice(0, 4).toUpperCase()}`,
      mode_paiement: encaisse < total && !v.mode_paiement ? 'Crédit' : v.mode_paiement,
    } as any);
    toast(vente ? 'Vente modifiée' : 'Vente enregistrée');
    onFermer();
  };

  return (
    <Feuille titre={vente ? 'Modifier la vente' : 'Nouvelle vente'} onFermer={onFermer}>
      <div className="deux">
        <DateChamp label="Date de vente" valeur={v.date!} onChange={s('date')} />
        <TexteSuggestions label="Client" valeur={v.client_nom ?? ''} onChange={s('client_nom')} suggestions={actifs(t.clients).map((c) => c.nom)} />
      </div>
      <SelecteurProduit t={t} espece={v.espece_id} categorie={v.categorie_id} produit={v.produit_id}
        onChange={(x) => setV((p) => ({ ...p, espece_id: x.espece_id, categorie_id: x.categorie_id, produit_id: x.produit_id ?? undefined,
          unite: x.unite ?? p.unite, prix_unitaire: p.prix_unitaire || x.prix || 0 }))} />
      {v.produit_id && produit?.stockable !== false && (
        <Alerte type={trop ? 'rouge' : 'vert'}>Stock disponible : <b>{nombre(dispo)} {produit?.unite}</b>{trop ? ' — quantité trop élevée' : ''}</Alerte>
      )}
      <SelecteurLot t={t} valeur={v.lot_id} onChange={s('lot_id')} espece={v.espece_id} label="Animaux pris dans le lot (facultatif)" />
      {tropLot && <Alerte type="rouge">Effectif du lot : {nombre(dispoLot)}</Alerte>}
      <div className="trois">
        <Nombre label="Quantité" requis valeur={v.quantite} onChange={s('quantite')} />
        <Texte label="Unité" valeur={v.unite} onChange={s('unite')} />
        <Nombre label="Prix unitaire" valeur={v.prix_unitaire} onChange={s('prix_unitaire')} />
      </div>
      <Case label="Vente au comptant (payée en totalité)" valeur={comptant} onChange={setComptant} />
      {!comptant && <Nombre label="Montant encaissé (0 = vente à crédit)" valeur={v.montant_encaisse} onChange={s('montant_encaisse')} />}
      <div className="recap">
        <div><span>Montant total</span><b>{argent(total)}</b></div>
        <div><span>Montant encaissé</span><b>{argent(encaisse)}</b></div>
        <div><span>Reste à encaisser</span><b className={total - encaisse > 0 ? 'rouge' : ''}>{argent(Math.max(0, total - encaisse))}</b></div>
      </div>
      <ChoixMode t={t} valeur={v.mode_paiement} onChange={s('mode_paiement')} />
      <Zone label="Observations" valeur={v.observations} onChange={s('observations')} />
      <button className="btn plein" onClick={valider} disabled={trop || tropLot}>Enregistrer la vente</button>
    </Feuille>
  );
}

export async function imprimerFacture(t: Tout, v: Vente) {
  const r = resteVente(v, t.paiements);
  const p = t.parametres;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = enTetePDF(doc, `FACTURE N° ${v.numero ?? v.id.slice(0, 8).toUpperCase()}`, `Date : ${dateFr(v.date)}`, p.nom_exploitation || 'ANSAR ELEVAGE');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const infos = [p.adresse, p.telephone ? 'Tél. ' + p.telephone : ''].filter(Boolean).join(' · ');
  if (infos) { doc.text(pdfTxt(infos), 12, y); y += 6; }
  doc.setFont('helvetica', 'bold');
  doc.text('Client :', 12, y + 2);
  doc.setFont('helvetica', 'normal');
  const client = t.clients.find((c) => c.id === v.client_id);
  doc.text(pdfTxt([v.client_nom || 'Client comptant', client?.telephone, client?.adresse].filter(Boolean).join(' — ')), 30, y + 2);
  autoTable(doc, {
    startY: y + 8,
    head: [['Désignation', 'Quantité', 'Prix unitaire', 'Montant']],
    body: [[pdfTxt(`${nomProduit(t, v.produit_id)}${v.espece_id ? ' — ' + nomEspece(t, v.espece_id).replace(/^\S+\s/, '') : ''}`),
      pdfTxt(`${nombre(v.quantite)} ${v.unite ?? ''}`), pdfTxt(argent(v.prix_unitaire)), pdfTxt(argent(r.total))]],
    headStyles: { fillColor: [31, 107, 53] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: 12, right: 12 },
  });
  let yy = (doc as any).lastAutoTable.finalY + 8;
  const ligne = (l: string, val: string, gras = false) => {
    doc.setFont('helvetica', gras ? 'bold' : 'normal');
    doc.text(l, 120, yy); doc.text(pdfTxt(val), 198, yy, { align: 'right' }); yy += 6;
  };
  ligne('Total', argent(r.total), true);
  ligne('Montant encaissé', argent(r.encaisse));
  ligne('Reste à payer', argent(r.reste), true);
  doc.setFont('helvetica', 'normal');
  doc.text(pdfTxt(`Mode de paiement : ${v.mode_paiement ?? '—'}`), 12, yy + 4);
  if (v.observations) doc.text(pdfTxt(`Observations : ${v.observations}`), 12, yy + 10, { maxWidth: 186 });
  doc.text('Merci pour votre confiance.', 12, yy + 22);
  piedPDF(doc);
  await partagerFichier(`facture_${v.numero ?? v.id.slice(0, 8)}.pdf`, doc.output('blob'), 'Facture');
}

export function DetailVente({ t, vente, onFermer, onModifier }: { t: Tout; vente: Vente; onFermer: () => void; onModifier: () => void }) {
  const { profil } = useAuth();
  const confirmer = useConfirm();
  const toast = useToast();
  const r = resteVente(vente, t.paiements);
  return (
    <Feuille titre={`Vente ${vente.numero ?? ''}`} onFermer={onFermer}>
      {vente._erreur && <Alerte type="rouge">Vente refusée par le serveur : {vente._erreur}</Alerte>}
      <dl className="kv">
        <dt>Date</dt><dd>{dateFr(vente.date)}</dd>
        <dt>Client</dt><dd>{vente.client_nom || 'Client comptant'}</dd>
        <dt>Produit</dt><dd>{nomProduit(t, vente.produit_id)}</dd>
        <dt>Espèce</dt><dd>{nomEspece(t, vente.espece_id)}</dd>
        <dt>Quantité</dt><dd>{nombre(vente.quantite)} {vente.unite}</dd>
        <dt>Prix unitaire</dt><dd>{argent(vente.prix_unitaire)}</dd>
        <dt>Montant total</dt><dd className="gras">{argent(r.total)}</dd>
        <dt>Encaissé</dt><dd>{argent(r.encaisse)}</dd>
        <dt>Reste à encaisser</dt><dd className={r.reste > 0 ? 'rouge gras' : ''}>{argent(r.reste)}</dd>
        <dt>Mode</dt><dd>{vente.mode_paiement || '—'}</dd>
        <dt>Lot</dt><dd>{vente.lot_id ? nomLot(t, vente.lot_id) : '—'}</dd>
        <dt>Saisi par</dt><dd>{nomUtilisateur(t.profils, vente.created_by)}</dd>
      </dl>
      {vente.observations && <p className="plus-petit">{vente.observations}</p>}
      <button className="btn jaune plein mt" onClick={() => imprimerFacture(t, vente).catch((e) => toast(String(e), true))}><FileText size={17} />Facture PDF / imprimer</button>
      <div className="mt" />
      <BlocPaiements t={t} type="encaissement" venteId={vente.id} reste={r.reste}
        peutAjouter={peut(profil, 'ventes', 'ajouter')} peutSupprimer={peut(profil, 'ventes', 'supprimer')} />
      <div className="actions">
        {peut(profil, 'ventes', 'modifier') && <button className="btn second" onClick={onModifier}><Pencil size={16} />Modifier</button>}
        {peut(profil, 'ventes', 'supprimer') && <button className="btn danger" onClick={async () => {
          if (!(await confirmer('Supprimer cette vente ? La quantité revient en stock.', 'Supprimer'))) return;
          await supprimer('ae_ventes', vente.id); toast('Vente supprimée'); onFermer();
        }}><Trash2 size={16} />Supprimer</button>}
      </div>
    </Feuille>
  );
}

export function Ventes() {
  const t = useTout();
  const { profil } = useAuth();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [periode, setPeriode] = useState<Periode>(bornesPeriode('mois'));
  const [form, setForm] = useState<Vente | null | 'nouveau'>(null);
  const [detail, setDetail] = useState<Vente | null>(null);
  const [credit, setCredit] = useState(false);
  useEffect(() => { if (params.get('nouveau')) { setForm('nouveau'); setParams({}, { replace: true }); } }, [params]);

  const liste = useMemo(() => filtrer(t.ventes, { du: periode.du, au: periode.au })
    .filter((v) => !q || normaliser(`${v.client_nom} ${nomProduit(t, v.produit_id)} ${v.numero} ${v.observations}`).includes(normaliser(q)))
    .filter((v) => !credit || resteVente(v, t.paiements).reste > 0)
    .sort((a, b) => (b.date + b.created_at).localeCompare(a.date + a.created_at)), [t, q, periode, credit]);
  const tot = liste.reduce((s, v) => { const r = resteVente(v, t.paiements); return { total: s.total + r.total, reste: s.reste + r.reste }; }, { total: 0, reste: 0 });
  const detailFrais = detail ? t.ventes.find((v) => v.id === detail.id) ?? detail : null;

  const exp = (f: 'pdf' | 'xlsx' | 'csv') => exporter(f, 'ventes', 'Ventes', liste, [
    { titre: 'Date', valeur: (v) => dateFr(v.date), brut: (v) => v.date },
    { titre: 'N°', valeur: (v) => v.numero ?? '' },
    { titre: 'Client', valeur: (v) => v.client_nom ?? '' },
    { titre: 'Produit', valeur: (v) => nomProduit(t, v.produit_id) },
    { titre: 'Qté', valeur: (v) => `${nombre(v.quantite)} ${v.unite ?? ''}`, brut: (v) => v.quantite, droite: true },
    { titre: 'P.U.', valeur: (v) => argent(v.prix_unitaire, false), brut: (v) => v.prix_unitaire, droite: true },
    { titre: 'Total', valeur: (v) => argent(resteVente(v, t.paiements).total, false), brut: (v) => resteVente(v, t.paiements).total, droite: true },
    { titre: 'Encaissé', valeur: (v) => argent(resteVente(v, t.paiements).encaisse, false), brut: (v) => resteVente(v, t.paiements).encaisse, droite: true },
    { titre: 'Reste', valeur: (v) => argent(resteVente(v, t.paiements).reste, false), brut: (v) => resteVente(v, t.paiements).reste, droite: true },
    { titre: 'Mode', valeur: (v) => v.mode_paiement ?? '' },
    { titre: 'Saisi par', valeur: (v) => nomUtilisateur(t.profils, v.created_by) },
  ], periode.du ? `Du ${dateFr(periode.du)} au ${dateFr(periode.au)}` : 'Toutes périodes',
  ['TOTAL', '', '', '', '', '', argent(tot.total, false), argent(tot.total - tot.reste, false), argent(tot.reste, false), '', '']);

  return (
    <Page titre="Ventes" sousTitre={`${liste.length} vente(s) · ${argent(tot.total)}`}
      action={peut(profil, 'ventes', 'ajouter') && <BoutonAjout onClick={() => setForm('nouveau')} libelle="Nouvelle vente" />}>
      <ChoixPeriode periode={periode} onChange={setPeriode} />
      <div className="outils"><Recherche valeur={q} onChange={setQ} /><MenuExport onExport={exp} /></div>
      <Case label="Uniquement les ventes à crédit non soldées" valeur={credit} onChange={setCredit} />
      <div className="grille-kpi">
        <div className="kpi"><div className="lib">Chiffre d'affaires</div><div className="val">{argent(tot.total)}</div></div>
        <div className="kpi"><div className="lib">Reste à encaisser</div><div className={'val' + (tot.reste > 0 ? ' rouge' : '')}>{argent(tot.reste)}</div></div>
      </div>
      {liste.length === 0 ? <Vide texte="Aucune vente sur cette période." /> : (
        <div className="liste">
          {liste.map((v) => {
            const r = resteVente(v, t.paiements);
            return (
              <button key={v.id} className="ligne" onClick={() => setDetail(v)}>
                <div className="ico-rond"><ShoppingCart size={18} /></div>
                <div className="corps">
                  <b>{nomProduit(t, v.produit_id)} · {nombre(v.quantite)} {v.unite}</b>
                  <small>{dateFr(v.date)} · {v.client_nom || 'Client comptant'}</small>
                  {v._erreur && <small className="rouge">⚠ {v._erreur}</small>}
                </div>
                <div className="fin"><b>{argent(r.total)}</b>
                  {r.reste > 0 ? <span className="badge rouge">crédit {argent(r.reste)}</span> : <span className="badge">payée</span>}
                  {v._attente && <small>en attente</small>}</div>
              </button>
            );
          })}
        </div>
      )}
      {form && <FormVente t={t} vente={form === 'nouveau' ? null : form} onFermer={() => setForm(null)} />}
      {detailFrais && !form && <DetailVente t={t} vente={detailFrais} onFermer={() => setDetail(null)} onModifier={() => { setForm(detailFrais); setDetail(null); }} />}
    </Page>
  );
}
