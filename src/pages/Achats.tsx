import { Pencil, ShoppingBag, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BlocPaiements, ChampPhoto, ChoixMode, enregistrerPhoto, VoirJustificatif } from '../components/Paiements';
import { nomEspece, nomLot, nomProduit, SelecteurLot, SelecteurProduit } from '../components/Selecteurs';
import {
  Alerte, bornesPeriode, BoutonAjout, Case, ChoixPeriode, DateChamp, Feuille, MenuExport, Nombre, Page, Recherche,
  Texte, TexteSuggestions, useConfirm, useToast, Vide, Zone, type Periode,
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { nomUtilisateur, useTout, type Tout } from '../hooks/useData';
import { actifs, filtrer, resteAchat } from '../lib/calc';
import { exporter } from '../lib/export';
import { argent, aujourdhui, dateFr, nombre, normaliser } from '../lib/format';
import { peut } from '../lib/perms';
import { enregistrer, nouvelId, supprimer } from '../lib/repo';
import type { Achat } from '../lib/types';

/** Retrouve ou crée la fiche d'un tiers à partir du nom saisi */
export async function resoudreTiers(t: Tout, genre: 'ae_clients' | 'ae_fournisseurs', nom: string | null | undefined) {
  const n = (nom ?? '').trim();
  if (!n) return null;
  const liste = genre === 'ae_clients' ? t.clients : t.fournisseurs;
  const ex = actifs(liste).find((x) => normaliser(x.nom) === normaliser(n));
  if (ex) return ex.id;
  return enregistrer(genre, { nom: n });
}

function FormAchat({ t, achat, onFermer }: { t: Tout; achat?: Achat | null; onFermer: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Partial<Achat>>(achat ?? {
    date: aujourdhui(), quantite: 1, prix_unitaire: 0, montant_paye: 0, ajoute_stock: true, mode_paiement: 'Espèces',
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [toutPaye, setToutPaye] = useState(!achat);
  const s = (k: keyof Achat) => (x: any) => setV((p) => ({ ...p, [k]: x }));
  const total = Math.round(Number(v.quantite || 0) * Number(v.prix_unitaire || 0) * 100) / 100;
  const paye = toutPaye ? total : Number(v.montant_paye || 0);
  const valider = async () => {
    if (!v.produit_id) return toast('Choisissez le produit acheté.', true);
    if (Number(v.quantite) <= 0) return toast('La quantité doit être positive.', true);
    if (paye > total) return toast('Le montant payé dépasse le total.', true);
    const id = achat?.id ?? nouvelId();
    const fournisseur_id = await resoudreTiers(t, 'ae_fournisseurs', v.fournisseur_nom);
    const path = await enregistrerPhoto('achats', id, photo);
    await enregistrer('ae_achats', {
      ...v, id, fournisseur_id, fournisseur_nom: v.fournisseur_nom?.trim() || null,
      quantite: Number(v.quantite), prix_unitaire: Number(v.prix_unitaire || 0), montant_paye: paye,
      unite: v.unite || t.produits.find((p) => p.id === v.produit_id)?.unite, ...(path ? { justificatif_path: path } : {}),
    } as any);
    toast(achat ? 'Achat modifié' : 'Achat enregistré');
    onFermer();
  };
  return (
    <Feuille titre={achat ? "Modifier l'achat" : 'Nouvel achat'} onFermer={onFermer}>
      <div className="deux">
        <DateChamp label="Date d'achat" valeur={v.date!} onChange={s('date')} />
        <TexteSuggestions label="Fournisseur" valeur={v.fournisseur_nom ?? ''} onChange={s('fournisseur_nom')} suggestions={actifs(t.fournisseurs).map((f) => f.nom)} />
      </div>
      <SelecteurProduit t={t} espece={v.espece_id} categorie={v.categorie_id} produit={v.produit_id}
        onChange={(x) => setV((p) => ({ ...p, espece_id: x.espece_id, categorie_id: x.categorie_id, produit_id: x.produit_id ?? undefined, unite: x.unite ?? p.unite }))} />
      <div className="trois">
        <Nombre label="Quantité" requis valeur={v.quantite} onChange={s('quantite')} />
        <Texte label="Unité" valeur={v.unite} onChange={s('unite')} />
        <Nombre label="Prix unitaire" valeur={v.prix_unitaire} onChange={s('prix_unitaire')} />
      </div>
      <Case label="Payé en totalité" valeur={toutPaye} onChange={setToutPaye} />
      {!toutPaye && <Nombre label="Montant payé" valeur={v.montant_paye} onChange={s('montant_paye')} />}
      <div className="recap">
        <div><span>Montant total</span><b>{argent(total)}</b></div>
        <div><span>Montant payé</span><b>{argent(paye)}</b></div>
        <div><span>Reste à payer</span><b className={total - paye > 0 ? 'rouge' : ''}>{argent(Math.max(0, total - paye))}</b></div>
      </div>
      <ChoixMode t={t} valeur={v.mode_paiement} onChange={s('mode_paiement')} />
      <SelecteurLot t={t} valeur={v.lot_id} onChange={s('lot_id')} espece={v.espece_id} label="Ajouter à un lot (animaux, facultatif)" />
      <Case label="Ajouter au stock" valeur={v.ajoute_stock !== false} onChange={s('ajoute_stock')} />
      <Zone label="Observations" valeur={v.observations} onChange={s('observations')} />
      <ChampPhoto fichier={photo} onChange={setPhoto} existant={v.justificatif_path} />
      <button className="btn plein" onClick={valider}>Enregistrer</button>
    </Feuille>
  );
}

export function DetailAchat({ t, achat, onFermer, onModifier }: { t: Tout; achat: Achat; onFermer: () => void; onModifier: () => void }) {
  const { profil } = useAuth();
  const confirmer = useConfirm();
  const toast = useToast();
  const r = resteAchat(achat, t.paiements);
  return (
    <Feuille titre="Détail de l'achat" onFermer={onFermer}>
      {achat._erreur && <Alerte type="rouge">Non synchronisé : {achat._erreur}</Alerte>}
      <dl className="kv">
        <dt>Date</dt><dd>{dateFr(achat.date)}</dd>
        <dt>Fournisseur</dt><dd>{achat.fournisseur_nom || '—'}</dd>
        <dt>Produit</dt><dd>{nomProduit(t, achat.produit_id)}</dd>
        <dt>Espèce</dt><dd>{nomEspece(t, achat.espece_id)}</dd>
        <dt>Quantité</dt><dd>{nombre(achat.quantite)} {achat.unite}</dd>
        <dt>Prix unitaire</dt><dd>{argent(achat.prix_unitaire)}</dd>
        <dt>Montant total</dt><dd className="gras">{argent(r.total)}</dd>
        <dt>Payé</dt><dd>{argent(r.paye)}</dd>
        <dt>Reste à payer</dt><dd className={r.reste > 0 ? 'rouge gras' : ''}>{argent(r.reste)}</dd>
        <dt>Mode</dt><dd>{achat.mode_paiement || '—'}</dd>
        <dt>Lot</dt><dd>{achat.lot_id ? nomLot(t, achat.lot_id) : '—'}</dd>
        <dt>Stock</dt><dd>{achat.ajoute_stock !== false ? 'Ajouté au stock' : 'Non stocké'}</dd>
        <dt>Saisi par</dt><dd>{nomUtilisateur(t.profils, achat.created_by)}</dd>
      </dl>
      {achat.observations && <p className="plus-petit">{achat.observations}</p>}
      {achat.justificatif_path && <div className="mt"><VoirJustificatif path={achat.justificatif_path} /></div>}
      <div className="mt" />
      <BlocPaiements t={t} type="decaissement" achatId={achat.id} reste={r.reste}
        peutAjouter={peut(profil, 'achats', 'ajouter')} peutSupprimer={peut(profil, 'achats', 'supprimer')} />
      <div className="actions">
        {peut(profil, 'achats', 'modifier') && <button className="btn second" onClick={onModifier}><Pencil size={16} />Modifier</button>}
        {peut(profil, 'achats', 'supprimer') && <button className="btn danger" onClick={async () => {
          if (!(await confirmer('Supprimer cet achat ? Le stock sera recalculé.', 'Supprimer'))) return;
          await supprimer('ae_achats', achat.id); toast('Achat supprimé'); onFermer();
        }}><Trash2 size={16} />Supprimer</button>}
      </div>
    </Feuille>
  );
}

export function Achats() {
  const t = useTout();
  const { profil } = useAuth();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [periode, setPeriode] = useState<Periode>(bornesPeriode('mois'));
  const [form, setForm] = useState<Achat | null | 'nouveau'>(null);
  const [detail, setDetail] = useState<Achat | null>(null);
  useEffect(() => { if (params.get('nouveau')) { setForm('nouveau'); setParams({}, { replace: true }); } }, [params]);

  const liste = useMemo(() => filtrer(t.achats, { du: periode.du, au: periode.au })
    .filter((a) => !q || normaliser(`${a.fournisseur_nom} ${nomProduit(t, a.produit_id)} ${a.observations}`).includes(normaliser(q)))
    .sort((a, b) => (b.date + b.created_at).localeCompare(a.date + a.created_at)), [t, q, periode]);
  const tot = liste.reduce((s, a) => { const r = resteAchat(a, t.paiements); return { total: s.total + r.total, reste: s.reste + r.reste }; }, { total: 0, reste: 0 });
  const detailFrais = detail ? t.achats.find((a) => a.id === detail.id) ?? detail : null;

  const exp = (f: 'pdf' | 'xlsx' | 'csv') => exporter(f, 'achats', 'Achats', liste, [
    { titre: 'Date', valeur: (a) => dateFr(a.date), brut: (a) => a.date },
    { titre: 'Fournisseur', valeur: (a) => a.fournisseur_nom ?? '' },
    { titre: 'Espèce', valeur: (a) => nomEspece(t, a.espece_id) },
    { titre: 'Produit', valeur: (a) => nomProduit(t, a.produit_id) },
    { titre: 'Qté', valeur: (a) => `${nombre(a.quantite)} ${a.unite ?? ''}`, brut: (a) => a.quantite, droite: true },
    { titre: 'P.U.', valeur: (a) => argent(a.prix_unitaire, false), brut: (a) => a.prix_unitaire, droite: true },
    { titre: 'Total', valeur: (a) => argent(resteAchat(a, t.paiements).total, false), brut: (a) => resteAchat(a, t.paiements).total, droite: true },
    { titre: 'Payé', valeur: (a) => argent(resteAchat(a, t.paiements).paye, false), brut: (a) => resteAchat(a, t.paiements).paye, droite: true },
    { titre: 'Reste', valeur: (a) => argent(resteAchat(a, t.paiements).reste, false), brut: (a) => resteAchat(a, t.paiements).reste, droite: true },
    { titre: 'Mode', valeur: (a) => a.mode_paiement ?? '' },
    { titre: 'Saisi par', valeur: (a) => nomUtilisateur(t.profils, a.created_by) },
  ], periode.du ? `Du ${dateFr(periode.du)} au ${dateFr(periode.au)}` : 'Toutes périodes',
  ['TOTAL', '', '', '', '', '', argent(tot.total, false), argent(tot.total - tot.reste, false), argent(tot.reste, false), '', '']);

  return (
    <Page titre="Achats" sousTitre={`${liste.length} achat(s) · ${argent(tot.total)}`}
      action={peut(profil, 'achats', 'ajouter') && <BoutonAjout onClick={() => setForm('nouveau')} />}>
      <ChoixPeriode periode={periode} onChange={setPeriode} />
      <div className="outils"><Recherche valeur={q} onChange={setQ} /><MenuExport onExport={exp} /></div>
      <div className="grille-kpi">
        <div className="kpi"><div className="lib">Total des achats</div><div className="val">{argent(tot.total)}</div></div>
        <div className="kpi"><div className="lib">Reste à payer</div><div className={'val' + (tot.reste > 0 ? ' rouge' : '')}>{argent(tot.reste)}</div></div>
      </div>
      {liste.length === 0 ? <Vide texte="Aucun achat sur cette période." /> : (
        <div className="liste">
          {liste.map((a) => {
            const r = resteAchat(a, t.paiements);
            return (
              <button key={a.id} className="ligne" onClick={() => setDetail(a)}>
                <div className="ico-rond"><ShoppingBag size={18} /></div>
                <div className="corps">
                  <b>{nomProduit(t, a.produit_id)} · {nombre(a.quantite)} {a.unite}</b>
                  <small>{dateFr(a.date)} · {a.fournisseur_nom || 'Sans fournisseur'}</small>
                  {a._erreur && <small className="rouge">⚠ {a._erreur}</small>}
                </div>
                <div className="fin"><b>{argent(r.total)}</b>
                  {r.reste > 0 ? <span className="badge rouge">reste {argent(r.reste)}</span> : <span className="badge">payé</span>}
                  {a._attente && <small>en attente</small>}</div>
              </button>
            );
          })}
        </div>
      )}
      {form && <FormAchat t={t} achat={form === 'nouveau' ? null : form} onFermer={() => setForm(null)} />}
      {detailFrais && !form && <DetailAchat t={t} achat={detailFrais} onFermer={() => setDetail(null)} onModifier={() => { setForm(detailFrais); setDetail(null); }} />}
    </Page>
  );
}
