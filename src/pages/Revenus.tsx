import { Pencil, ShoppingCart, Trash2, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ChoixMode } from '../components/Paiements';
import { nomProduit, SelecteurEspece } from '../components/Selecteurs';
import {
  Alerte, bornesPeriode, BoutonAjout, Choix, ChoixPeriode, DateChamp, Feuille, MenuExport, Nombre, Page, Puces,
  Texte, TexteSuggestions, useConfirm, useToast, Vide, type Periode,
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { listeParam, nomUtilisateur, useTout, type Tout } from '../hooks/useData';
import { actifs, categorieRevenuVente, filtrer, resteVente } from '../lib/calc';
import { exporter } from '../lib/export';
import { argent, aujourdhui, dateFr } from '../lib/format';
import { peut } from '../lib/perms';
import { enregistrer, supprimer } from '../lib/repo';
import type { Revenu } from '../lib/types';
import { resoudreTiers } from './Achats';

export const CAT_REVENUS = ["Vente d'œufs", 'Vente de poussins', 'Vente de poulets', 'Vente de canards', "Vente d'oies", 'Vente de dindes', 'Vente de cailles', 'Vente de pintades', 'Vente de viande', 'Vente de fientes', 'Autres revenus'];

function FormRevenu({ t, rev, onFermer }: { t: Tout; rev?: Revenu | null; onFermer: () => void }) {
  const toast = useToast();
  const cats = listeParam(t, 'categories_revenus', CAT_REVENUS);
  const [v, setV] = useState<Partial<Revenu>>(rev ?? { date: aujourdhui(), categorie: 'Autres revenus', montant: 0, mode_paiement: 'Espèces' });
  const s = (k: keyof Revenu) => (x: any) => setV((p) => ({ ...p, [k]: x }));
  const valider = async () => {
    if (Number(v.montant) <= 0) return toast('Le montant doit être positif.', true);
    const client_id = await resoudreTiers(t, 'ae_clients', v.client_nom);
    await enregistrer('ae_revenus', { ...v, client_id, client_nom: v.client_nom?.trim() || null, montant: Number(v.montant) } as any);
    toast('Revenu enregistré');
    onFermer();
  };
  return (
    <Feuille titre={rev ? 'Modifier le revenu' : 'Nouveau revenu'} onFermer={onFermer}>
      <Alerte type="jaune">Les ventes enregistrées dans « Ventes » sont déjà comptées automatiquement. Utilisez ce formulaire uniquement pour les autres revenus (subvention, location, prestation…).</Alerte>
      <div className="deux">
        <DateChamp label="Date" valeur={v.date!} onChange={s('date')} />
        <Choix label="Catégorie" valeur={v.categorie} onChange={s('categorie')} options={cats.map((c) => ({ v: c, t: c }))} />
      </div>
      <Texte label="Description" valeur={v.description} onChange={s('description')} />
      <div className="deux">
        <Nombre label="Montant" requis valeur={v.montant} onChange={s('montant')} />
        <ChoixMode t={t} valeur={v.mode_paiement} onChange={s('mode_paiement')} />
      </div>
      <TexteSuggestions label="Client / payeur (facultatif)" valeur={v.client_nom ?? ''} onChange={s('client_nom')} suggestions={actifs(t.clients).map((c) => c.nom)} />
      <SelecteurEspece t={t} valeur={v.espece_id} onChange={s('espece_id')} />
      <button className="btn plein" onClick={valider}>Enregistrer</button>
    </Feuille>
  );
}

interface Ligne { id: string; date: string; categorie: string; libelle: string; montant: number; auto: boolean; created_by?: string | null; rev?: Revenu }

export function Revenus() {
  const t = useTout();
  const { profil } = useAuth();
  const confirmer = useConfirm();
  const [periode, setPeriode] = useState<Periode>(bornesPeriode('mois'));
  const [cat, setCat] = useState('');
  const [form, setForm] = useState<Revenu | null | 'nouveau'>(null);
  const cats = listeParam(t, 'categories_revenus', CAT_REVENUS);
  const lignes: Ligne[] = useMemo(() => {
    const f = { du: periode.du, au: periode.au };
    const auto = filtrer(t.ventes, f).map((v) => ({
      id: v.id, date: v.date, categorie: categorieRevenuVente(v, t.produits),
      libelle: `${nomProduit(t, v.produit_id)} — ${v.client_nom || 'client comptant'}${resteVente(v, t.paiements).reste > 0 ? ' (crédit)' : ''}`,
      montant: resteVente(v, []).total, auto: true, created_by: v.created_by,
    }));
    const manuels = filtrer(t.revenus, f).map((r) => ({
      id: r.id, date: r.date, categorie: r.categorie, libelle: r.description || r.client_nom || r.categorie, montant: Number(r.montant), auto: false, created_by: r.created_by, rev: r,
    }));
    return [...auto, ...manuels].filter((l) => !cat || l.categorie === cat).sort((a, b) => b.date.localeCompare(a.date));
  }, [t, periode, cat]);
  const total = lignes.reduce((s, l) => s + l.montant, 0);
  const totVentes = lignes.filter((l) => l.auto).reduce((s, l) => s + l.montant, 0);
  const parCat = cats.map((c) => ({ c, m: lignes.filter((l) => l.categorie === c).reduce((s, l) => s + l.montant, 0) })).filter((x) => x.m > 0);

  const exp = (f: 'pdf' | 'xlsx' | 'csv') => exporter(f, 'revenus', 'Revenus', lignes, [
    { titre: 'Date', valeur: (l) => dateFr(l.date), brut: (l) => l.date },
    { titre: 'Catégorie', valeur: (l) => l.categorie },
    { titre: 'Libellé', valeur: (l) => l.libelle },
    { titre: 'Origine', valeur: (l) => (l.auto ? 'Vente' : 'Autre revenu') },
    { titre: 'Montant', valeur: (l) => argent(l.montant, false), brut: (l) => l.montant, droite: true },
  ], periode.du ? `Du ${dateFr(periode.du)} au ${dateFr(periode.au)}` : 'Toutes périodes', ['TOTAL', '', '', '', argent(total, false)]);

  return (
    <Page titre="Revenus" sousTitre={`Total ${argent(total)}`}
      action={peut(profil, 'revenus', 'ajouter') && <BoutonAjout onClick={() => setForm('nouveau')} />}>
      <ChoixPeriode periode={periode} onChange={setPeriode} />
      <div className="outils"><div style={{ flex: 1 }} /><MenuExport onExport={exp} /></div>
      <Puces valeur={cat} onChange={setCat} options={[{ v: '', t: 'Toutes' }, ...cats.map((c) => ({ v: c, t: c }))]} />
      <div className="grille-kpi">
        <div className="kpi vert"><div className="lib">Total des revenus</div><div className="val">{argent(total)}</div></div>
        <div className="kpi"><div className="lib">Dont ventes</div><div className="val">{argent(totVentes)}</div><div className="sous">Autres : {argent(total - totVentes)}</div></div>
      </div>
      {parCat.length > 0 && (
        <div className="carte">
          <h2>Par catégorie</h2>
          {parCat.map((x) => (
            <div key={x.c} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{x.c}</span><b>{argent(x.m)}</b></div>
              <div style={{ height: 6, background: 'var(--fond)', borderRadius: 4 }}><div style={{ height: 6, borderRadius: 4, background: 'var(--serie-ventes)', width: `${(x.m / total) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      )}
      {lignes.length === 0 ? <Vide texte="Aucun revenu sur cette période." /> : (
        <div className="liste">
          {lignes.map((l) => (
            <div key={l.id} className="ligne">
              <div className="ico-rond">{l.auto ? <ShoppingCart size={18} /> : <TrendingUp size={18} />}</div>
              <div className="corps"><b>{l.categorie}</b><small>{dateFr(l.date)} · {l.libelle}</small>
                <small>{l.auto ? 'Vente (automatique)' : 'Autre revenu'} · {nomUtilisateur(t.profils, l.created_by)}</small></div>
              <div className="fin"><b>{argent(l.montant)}</b>
                {!l.auto && l.rev && (
                  <div className="actions" style={{ justifyContent: 'flex-end' }}>
                    {peut(profil, 'revenus', 'modifier') && <button className="btn lien" aria-label="Modifier" onClick={() => setForm(l.rev!)}><Pencil size={15} /></button>}
                    {peut(profil, 'revenus', 'supprimer') && <button className="btn lien" aria-label="Supprimer" onClick={async () => {
                      if (await confirmer('Supprimer ce revenu ?', 'Supprimer')) await supprimer('ae_revenus', l.id);
                    }}><Trash2 size={15} /></button>}
                  </div>
                )}</div>
            </div>
          ))}
        </div>
      )}
      {form && <FormRevenu t={t} rev={form === 'nouveau' ? null : form} onFermer={() => setForm(null)} />}
    </Page>
  );
}
