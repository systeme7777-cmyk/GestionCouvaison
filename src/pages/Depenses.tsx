import { Pencil, Receipt, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChampPhoto, ChoixMode, enregistrerPhoto, VoirJustificatif } from '../components/Paiements';
import { nomEspece, nomLot, SelecteurEspece, SelecteurLot } from '../components/Selecteurs';
import {
  Alerte, bornesPeriode, BoutonAjout, Choix, ChoixPeriode, DateChamp, Feuille, MenuExport, Nombre, Page, Puces, Recherche,
  Texte, TexteSuggestions, useConfirm, useToast, Vide, type Periode,
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { listeParam, nomUtilisateur, useTout, type Tout } from '../hooks/useData';
import { actifs, filtrer } from '../lib/calc';
import { exporter } from '../lib/export';
import { argent, aujourdhui, dateFr, normaliser } from '../lib/format';
import { peut } from '../lib/perms';
import { enregistrer, nouvelId, supprimer } from '../lib/repo';
import type { Depense } from '../lib/types';
import { resoudreTiers } from './Achats';

export const CAT_DEPENSES = ['Aliments', 'Vaccins', 'Médicaments', 'Matériel', 'Transport', "Main-d'œuvre", 'Eau', 'Électricité', 'Entretien', 'Autres dépenses'];

function FormDepense({ t, dep, onFermer }: { t: Tout; dep?: Depense | null; onFermer: () => void }) {
  const toast = useToast();
  const cats = listeParam(t, 'categories_depenses', CAT_DEPENSES);
  const [v, setV] = useState<Partial<Depense>>(dep ?? { date: aujourdhui(), categorie: cats[0], montant: 0, mode_paiement: 'Espèces' });
  const [photo, setPhoto] = useState<File | null>(null);
  const s = (k: keyof Depense) => (x: any) => setV((p) => ({ ...p, [k]: x }));
  const valider = async () => {
    if (!v.categorie) return toast('Choisissez une catégorie.', true);
    if (Number(v.montant) <= 0) return toast('Le montant doit être positif.', true);
    const id = dep?.id ?? nouvelId();
    const fournisseur_id = await resoudreTiers(t, 'ae_fournisseurs', v.fournisseur_nom);
    const path = await enregistrerPhoto('depenses', id, photo);
    await enregistrer('ae_depenses', { ...v, id, fournisseur_id, fournisseur_nom: v.fournisseur_nom?.trim() || null, montant: Number(v.montant), ...(path ? { justificatif_path: path } : {}) } as any);
    toast(dep ? 'Dépense modifiée' : 'Dépense enregistrée');
    onFermer();
  };
  return (
    <Feuille titre={dep ? 'Modifier la dépense' : 'Nouvelle dépense'} onFermer={onFermer}>
      <div className="deux">
        <DateChamp label="Date" valeur={v.date!} onChange={s('date')} />
        <Choix label="Catégorie" requis valeur={v.categorie} onChange={s('categorie')} options={cats.map((c) => ({ v: c, t: c }))} />
      </div>
      <Texte label="Description" valeur={v.description} onChange={s('description')} placeholder="Ex. : 10 sacs d'aliment ponte" />
      <div className="deux">
        <Nombre label="Montant" requis valeur={v.montant} onChange={s('montant')} />
        <ChoixMode t={t} valeur={v.mode_paiement} onChange={s('mode_paiement')} />
      </div>
      <TexteSuggestions label="Fournisseur (facultatif)" valeur={v.fournisseur_nom ?? ''} onChange={s('fournisseur_nom')} suggestions={actifs(t.fournisseurs).map((f) => f.nom)} />
      <div className="deux">
        <SelecteurEspece t={t} valeur={v.espece_id} onChange={s('espece_id')} vide="Toutes" />
        <SelecteurLot t={t} valeur={v.lot_id} onChange={s('lot_id')} />
      </div>
      <ChampPhoto fichier={photo} onChange={setPhoto} existant={v.justificatif_path} />
      <button className="btn plein" onClick={valider}>Enregistrer</button>
    </Feuille>
  );
}

export function Depenses() {
  const t = useTout();
  const { profil } = useAuth();
  const confirmer = useConfirm();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [periode, setPeriode] = useState<Periode>(bornesPeriode('mois'));
  const [form, setForm] = useState<Depense | null | 'nouveau'>(null);
  const [detail, setDetail] = useState<Depense | null>(null);
  useEffect(() => { if (params.get('nouveau')) { setForm('nouveau'); setParams({}, { replace: true }); } }, [params]);
  const cats = listeParam(t, 'categories_depenses', CAT_DEPENSES);

  const liste = useMemo(() => filtrer(t.depenses, { du: periode.du, au: periode.au })
    .filter((d) => (!cat || d.categorie === cat) && (!q || normaliser(`${d.description} ${d.fournisseur_nom} ${d.categorie}`).includes(normaliser(q))))
    .sort((a, b) => (b.date + b.created_at).localeCompare(a.date + a.created_at)), [t, q, cat, periode]);
  const total = liste.reduce((s, d) => s + Number(d.montant), 0);
  const parCat = cats.map((c) => ({ c, m: liste.filter((d) => d.categorie === c).reduce((s, d) => s + Number(d.montant), 0) })).filter((x) => x.m > 0);
  const det = detail ? t.depenses.find((d) => d.id === detail.id) ?? detail : null;

  const exp = (f: 'pdf' | 'xlsx' | 'csv') => exporter(f, 'depenses', 'Dépenses', liste, [
    { titre: 'Date', valeur: (d) => dateFr(d.date), brut: (d) => d.date },
    { titre: 'Catégorie', valeur: (d) => d.categorie },
    { titre: 'Description', valeur: (d) => d.description ?? '' },
    { titre: 'Fournisseur', valeur: (d) => d.fournisseur_nom ?? '' },
    { titre: 'Montant', valeur: (d) => argent(d.montant, false), brut: (d) => Number(d.montant), droite: true },
    { titre: 'Mode', valeur: (d) => d.mode_paiement ?? '' },
    { titre: 'Saisi par', valeur: (d) => nomUtilisateur(t.profils, d.created_by) },
  ], periode.du ? `Du ${dateFr(periode.du)} au ${dateFr(periode.au)}` : 'Toutes périodes', ['TOTAL', '', '', '', argent(total, false), '', '']);

  return (
    <Page titre="Dépenses" sousTitre={`${liste.length} dépense(s) · ${argent(total)}`}
      action={peut(profil, 'depenses', 'ajouter') && <BoutonAjout onClick={() => setForm('nouveau')} />}>
      <ChoixPeriode periode={periode} onChange={setPeriode} />
      <div className="outils"><Recherche valeur={q} onChange={setQ} /><MenuExport onExport={exp} /></div>
      <Puces valeur={cat} onChange={setCat} options={[{ v: '', t: 'Toutes' }, ...cats.map((c) => ({ v: c, t: c }))]} />
      <div className="carte">
        <h2>Total : {argent(total)}</h2>
        {parCat.map((x) => (
          <div key={x.c} style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{x.c}</span><b>{argent(x.m)}</b></div>
            <div style={{ height: 6, background: 'var(--fond)', borderRadius: 4 }}><div style={{ height: 6, borderRadius: 4, background: 'var(--serie-depenses)', width: `${(x.m / total) * 100}%` }} /></div>
          </div>
        ))}
      </div>
      {liste.length === 0 ? <Vide texte="Aucune dépense sur cette période." /> : (
        <div className="liste">
          {liste.map((d) => (
            <button key={d.id} className="ligne" onClick={() => setDetail(d)}>
              <div className="ico-rond"><Receipt size={18} /></div>
              <div className="corps"><b>{d.categorie}{d.description ? ' · ' + d.description : ''}</b>
                <small>{dateFr(d.date)} · {d.fournisseur_nom || nomUtilisateur(t.profils, d.created_by)}</small>
                {d._erreur && <small className="rouge">⚠ {d._erreur}</small>}</div>
              <div className="fin"><b>{argent(d.montant)}</b>{d._attente && <small>en attente</small>}</div>
            </button>
          ))}
        </div>
      )}
      {form && <FormDepense t={t} dep={form === 'nouveau' ? null : form} onFermer={() => setForm(null)} />}
      {det && !form && (
        <Feuille titre="Détail de la dépense" onFermer={() => setDetail(null)}>
          {det._erreur && <Alerte type="rouge">{det._erreur}</Alerte>}
          <dl className="kv">
            <dt>Date</dt><dd>{dateFr(det.date)}</dd>
            <dt>Catégorie</dt><dd>{det.categorie}</dd>
            <dt>Description</dt><dd>{det.description || '—'}</dd>
            <dt>Montant</dt><dd className="gras">{argent(det.montant)}</dd>
            <dt>Mode</dt><dd>{det.mode_paiement || '—'}</dd>
            <dt>Fournisseur</dt><dd>{det.fournisseur_nom || '—'}</dd>
            <dt>Espèce</dt><dd>{nomEspece(t, det.espece_id)}</dd>
            <dt>Lot</dt><dd>{det.lot_id ? nomLot(t, det.lot_id) : '—'}</dd>
            <dt>Responsable</dt><dd>{nomUtilisateur(t.profils, det.created_by)}</dd>
          </dl>
          {det.justificatif_path && <div className="mt"><VoirJustificatif path={det.justificatif_path} /></div>}
          <div className="actions mt">
            {peut(profil, 'depenses', 'modifier') && <button className="btn second" onClick={() => { setForm(det); setDetail(null); }}><Pencil size={16} />Modifier</button>}
            {peut(profil, 'depenses', 'supprimer') && <button className="btn danger" onClick={async () => {
              if (await confirmer('Supprimer cette dépense ?', 'Supprimer')) { await supprimer('ae_depenses', det.id); setDetail(null); }
            }}><Trash2 size={16} />Supprimer</button>}
          </div>
        </Feuille>
      )}
    </Page>
  );
}
