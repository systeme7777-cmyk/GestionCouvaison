import { Building2, Pencil, Phone, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { nomProduit } from '../components/Selecteurs';
import { BoutonAjout, Feuille, MenuExport, Page, Recherche, Texte, useConfirm, useToast, Vide, Zone } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useTout, type Tout } from '../hooks/useData';
import { actifs, resteAchat, resteVente } from '../lib/calc';
import { exporter } from '../lib/export';
import { argent, dateFr, nombre, normaliser } from '../lib/format';
import { peut } from '../lib/perms';
import { enregistrer, supprimer } from '../lib/repo';
import type { Tiers as T } from '../lib/types';
import { DetailAchat } from './Achats';
import { DetailVente } from './Ventes';

type Genre = 'clients' | 'fournisseurs';

function synthese(t: Tout, genre: Genre, x: T) {
  const memeNom = (nom?: string | null) => normaliser(nom) === normaliser(x.nom);
  if (genre === 'clients') {
    const ops = actifs(t.ventes).filter((v) => v.client_id === x.id || (!v.client_id && memeNom(v.client_nom)));
    let total = 0, paye = 0, reste = 0;
    for (const v of ops) { const r = resteVente(v, t.paiements); total += r.total; paye += r.encaisse; reste += r.reste; }
    return { ops, total, paye, reste };
  }
  const ops = actifs(t.achats).filter((a) => a.fournisseur_id === x.id || (!a.fournisseur_id && memeNom(a.fournisseur_nom)));
  let total = 0, paye = 0, reste = 0;
  for (const a of ops) { const r = resteAchat(a, t.paiements); total += r.total; paye += r.paye; reste += r.reste; }
  const dep = actifs(t.depenses).filter((d) => d.fournisseur_id === x.id).reduce((s, d) => s + Number(d.montant), 0);
  return { ops, total: total + dep, paye: paye + dep, reste };
}

function FormTiers({ genre, tiers, onFermer }: { genre: Genre; tiers?: T | null; onFermer: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Partial<T>>(tiers ?? { nom: '' });
  const s = (k: keyof T) => (x: any) => setV({ ...v, [k]: x });
  const valider = async () => {
    if (!v.nom?.trim()) return toast('Le nom est obligatoire.', true);
    await enregistrer(genre === 'clients' ? 'ae_clients' : 'ae_fournisseurs', { ...v, nom: v.nom.trim() } as any);
    toast('Fiche enregistrée');
    onFermer();
  };
  return (
    <Feuille titre={tiers ? 'Modifier la fiche' : genre === 'clients' ? 'Nouveau client' : 'Nouveau fournisseur'} onFermer={onFermer}>
      <Texte label="Nom" requis valeur={v.nom} onChange={s('nom')} />
      <Texte label="Téléphone" type="tel" inputMode="tel" valeur={v.telephone} onChange={s('telephone')} />
      <Texte label="Adresse" valeur={v.adresse} onChange={s('adresse')} />
      <Zone label="Notes" valeur={v.notes} onChange={s('notes')} />
      <button className="btn plein" onClick={valider}>Enregistrer</button>
    </Feuille>
  );
}

export function Tiers({ genre }: { genre: Genre }) {
  const t = useTout();
  const { profil } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [form, setForm] = useState(false);
  const [dettes, setDettes] = useState(false);
  const liste = useMemo(() => actifs(genre === 'clients' ? t.clients : t.fournisseurs)
    .filter((x) => !q || normaliser(`${x.nom} ${x.telephone} ${x.adresse}`).includes(normaliser(q)))
    .map((x) => ({ x, s: synthese(t, genre, x) }))
    .filter((l) => !dettes || l.s.reste > 0), [t, q, genre, dettes]);
  const totalDettes = liste.reduce((s, l) => s + l.s.reste, 0);
  const titre = genre === 'clients' ? 'Clients' : 'Fournisseurs';

  const exp = (f: 'pdf' | 'xlsx' | 'csv') => exporter(f, genre, titre, liste, [
    { titre: 'Nom', valeur: (l) => l.x.nom },
    { titre: 'Téléphone', valeur: (l) => l.x.telephone ?? '' },
    { titre: 'Adresse', valeur: (l) => l.x.adresse ?? '' },
    { titre: genre === 'clients' ? 'Total achats' : 'Total commandes', valeur: (l) => argent(l.s.total, false), brut: (l) => l.s.total, droite: true },
    { titre: genre === 'clients' ? 'Paiements reçus' : 'Paiements effectués', valeur: (l) => argent(l.s.paye, false), brut: (l) => l.s.paye, droite: true },
    { titre: 'Dette restante', valeur: (l) => argent(l.s.reste, false), brut: (l) => l.s.reste, droite: true },
  ]);

  return (
    <Page titre={titre} sousTitre={`${liste.length} fiche(s) · dettes ${argent(totalDettes)}`}
      action={peut(profil, genre, 'ajouter') && <BoutonAjout onClick={() => setForm(true)} />}>
      <div className="outils"><Recherche valeur={q} onChange={setQ} /><MenuExport onExport={exp} /></div>
      <label className="case"><input type="checkbox" checked={dettes} onChange={(e) => setDettes(e.target.checked)} />Uniquement avec dette</label>
      {liste.length === 0 ? <Vide texte={`Aucun ${genre === 'clients' ? 'client' : 'fournisseur'}. Ils sont aussi créés automatiquement lors des ${genre === 'clients' ? 'ventes' : 'achats'}.`} /> : (
        <div className="liste">
          {liste.map(({ x, s }) => (
            <button key={x.id} className="ligne" onClick={() => nav(`/${genre}/${x.id}`)}>
              <div className="ico-rond">{genre === 'clients' ? <Users size={18} /> : <Building2 size={18} />}</div>
              <div className="corps"><b>{x.nom}</b><small>{x.telephone || 'Pas de téléphone'} · {s.ops.length} opération(s)</small></div>
              <div className="fin"><b>{argent(s.total)}</b>{s.reste > 0 ? <span className="badge rouge">dette {argent(s.reste)}</span> : <small>à jour</small>}</div>
            </button>
          ))}
        </div>
      )}
      {form && <FormTiers genre={genre} onFermer={() => setForm(false)} />}
    </Page>
  );
}

export function ClientDetail({ genre }: { genre: Genre }) {
  const { id } = useParams();
  const t = useTout();
  const { profil } = useAuth();
  const nav = useNavigate();
  const confirmer = useConfirm();
  const [form, setForm] = useState(false);
  const [op, setOp] = useState<string | null>(null);
  const [modif, setModif] = useState(false);
  const x = (genre === 'clients' ? t.clients : t.fournisseurs).find((c) => c.id === id);
  if (!x || x.deleted_at) return <Page titre="Fiche" retour><Vide texte="Fiche introuvable." /></Page>;
  const s = synthese(t, genre, x);
  const ops = [...s.ops].sort((a, b) => b.date.localeCompare(a.date));
  const vente = genre === 'clients' && op ? t.ventes.find((v) => v.id === op) : null;
  const achat = genre === 'fournisseurs' && op ? t.achats.find((a) => a.id === op) : null;

  return (
    <Page titre={x.nom} sousTitre={genre === 'clients' ? 'Fiche client' : 'Fiche fournisseur'} retour>
      <div className="grille-kpi">
        <div className="kpi"><div className="lib">{genre === 'clients' ? 'Total des achats' : 'Total des commandes'}</div><div className="val">{argent(s.total)}</div></div>
        <div className="kpi"><div className="lib">{genre === 'clients' ? 'Paiements reçus' : 'Paiements effectués'}</div><div className="val">{argent(s.paye)}</div></div>
        <div className={'kpi' + (s.reste > 0 ? ' negatif' : '')}><div className="lib">Dette restante</div><div className="val">{argent(s.reste)}</div></div>
      </div>
      <div className="carte">
        <dl className="kv">
          <dt>Téléphone</dt><dd>{x.telephone ? <a href={`tel:${x.telephone}`}><Phone size={13} /> {x.telephone}</a> : '—'}</dd>
          <dt>Adresse</dt><dd>{x.adresse || '—'}</dd>
        </dl>
        {x.notes && <p className="plus-petit">{x.notes}</p>}
        <div className="actions mt">
          {peut(profil, genre, 'modifier') && <button className="btn second" onClick={() => setForm(true)}><Pencil size={16} />Modifier</button>}
          {peut(profil, genre, 'supprimer') && <button className="btn danger" onClick={async () => {
            if (await confirmer(`Supprimer la fiche « ${x.nom} » ? L'historique des opérations est conservé.`, 'Supprimer')) {
              await supprimer(genre === 'clients' ? 'ae_clients' : 'ae_fournisseurs', x.id); nav(-1);
            }
          }}><Trash2 size={16} />Supprimer</button>}
        </div>
      </div>
      <div className="section-titre">Historique ({ops.length})</div>
      {ops.length === 0 ? <Vide texte="Aucune opération." /> : (
        <div className="liste">
          {ops.map((o: any) => {
            const r = genre === 'clients' ? resteVente(o, t.paiements) : resteAchat(o, t.paiements);
            return (
              <button key={o.id} className="ligne" onClick={() => setOp(o.id)}>
                <div className="corps"><b>{nomProduit(t, o.produit_id)} · {nombre(o.quantite)} {o.unite}</b><small>{dateFr(o.date)}{o.numero ? ' · ' + o.numero : ''}</small></div>
                <div className="fin"><b>{argent(r.total)}</b>{r.reste > 0 ? <span className="badge rouge">reste {argent(r.reste)}</span> : <small>soldé</small>}</div>
              </button>
            );
          })}
        </div>
      )}
      {form && <FormTiers genre={genre} tiers={x} onFermer={() => setForm(false)} />}
      {vente && !modif && <DetailVente t={t} vente={vente} onFermer={() => setOp(null)} onModifier={() => nav('/ventes')} />}
      {achat && !modif && <DetailAchat t={t} achat={achat} onFermer={() => setOp(null)} onModifier={() => nav('/achats')} />}
    </Page>
  );
}
