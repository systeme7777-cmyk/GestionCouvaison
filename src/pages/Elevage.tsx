import { Bird, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { nomEspece, nomLot, nomProduit, SelecteurEspece } from '../components/Selecteurs';
import {
  Alerte, BoutonAjout, Choix, DateChamp, Feuille, MenuExport, Nombre, Page, Puces, Recherche, Texte, useConfirm, useToast, Vide, Zone,
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { nomUtilisateur, useTout, type Tout } from '../hooks/useData';
import { actifs, effectifLot } from '../lib/calc';
import { exporter } from '../lib/export';
import { ageTexte, argent, aujourdhui, dateFr, joursDepuis, nombre, normaliser } from '../lib/format';
import { peut } from '../lib/perms';
import { enregistrer, supprimer } from '../lib/repo';
import type { Lot, LotEvenement, TypeEvenement } from '../lib/types';

const TYPES_EV: { v: TypeEvenement; t: string; signe: string }[] = [
  { v: 'naissance', t: 'Naissance / éclosion', signe: '+' },
  { v: 'deces', t: 'Décès (mortalité)', signe: '−' },
  { v: 'reforme', t: 'Réforme', signe: '−' },
  { v: 'transfert', t: 'Transfert vers un autre lot', signe: '→' },
  { v: 'ajustement', t: 'Ajustement (comptage)', signe: '±' },
];
export const libelleEv = (t: string) => TYPES_EV.find((x) => x.v === t)?.t ?? t;

export function FormLot({ t, lot, onFermer }: { t: Tout; lot?: Lot | null; onFermer: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Partial<Lot>>(lot ?? {
    nom: '', date_arrivee: aujourdhui(), effectif_initial: 0, males: 0, femelles: 0, age_arrivee_jours: 0,
    cout_achat: 0, statut: 'actif',
  });
  const s = (k: keyof Lot) => (x: any) => setV({ ...v, [k]: x });
  const produitsAnimaux = actifs(t.produits).filter((p) => {
    const c = t.categories.find((c) => c.id === p.categorie_id);
    return c?.type === 'animaux' && (!v.espece_id || !p.espece_id || p.espece_id === v.espece_id);
  });
  const valider = async () => {
    if (!v.nom?.trim()) return toast('Indiquez le nom ou numéro du lot.', true);
    if (Number(v.males || 0) + Number(v.femelles || 0) > Number(v.effectif_initial || 0) && Number(v.effectif_initial) > 0)
      return toast('Mâles + femelles dépasse l\'effectif initial.', true);
    await enregistrer('ae_lots', {
      ...v, nom: v.nom.trim(), effectif_initial: Number(v.effectif_initial || 0), males: Number(v.males || 0),
      femelles: Number(v.femelles || 0), age_arrivee_jours: Number(v.age_arrivee_jours || 0), cout_achat: Number(v.cout_achat || 0),
    } as any);
    toast(lot ? 'Lot modifié' : 'Lot créé');
    onFermer();
  };
  return (
    <Feuille titre={lot ? 'Modifier le lot' : 'Nouveau lot'} onFermer={onFermer}>
      <Texte label="Nom ou numéro du lot" requis valeur={v.nom} onChange={s('nom')} placeholder="Ex. : Lot P-2026-01" />
      <div className="deux">
        <SelecteurEspece t={t} valeur={v.espece_id} onChange={s('espece_id')} vide="— Choisir —" />
        <Texte label="Race" valeur={v.race} onChange={s('race')} placeholder="Ex. : Goliath" />
      </div>
      <Choix label="Produit de stock correspondant" valeur={v.produit_id ?? ''} vide="Aucun (ne pas relier au stock)"
        options={produitsAnimaux.map((p) => ({ v: p.id, t: p.nom }))} onChange={(x) => s('produit_id')(x || null)}
        aide="Si renseigné, l'effectif, les naissances et les décès du lot alimentent le stock de ce produit." />
      <div className="deux">
        <DateChamp label="Date d'arrivée" valeur={v.date_arrivee!} onChange={s('date_arrivee')} />
        <Nombre label="Âge à l'arrivée (jours)" entier valeur={v.age_arrivee_jours} onChange={s('age_arrivee_jours')} />
      </div>
      <Nombre label="Effectif initial" entier requis valeur={v.effectif_initial} onChange={s('effectif_initial')}
        aide="Hors achats enregistrés dans « Achats » avec ce lot (ils s'ajoutent automatiquement)." />
      <div className="deux">
        <Nombre label="Nombre de mâles" entier valeur={v.males} onChange={s('males')} />
        <Nombre label="Nombre de femelles" entier valeur={v.femelles} onChange={s('femelles')} />
      </div>
      <div className="deux">
        <Texte label="Provenance" valeur={v.provenance} onChange={s('provenance')} />
        <Nombre label="Coût d'achat du lot" valeur={v.cout_achat} onChange={s('cout_achat')} aide="Compté dans les charges" />
      </div>
      <Choix label="Statut" valeur={v.statut} onChange={s('statut')} options={[{ v: 'actif', t: 'Actif' }, { v: 'cloture', t: 'Clôturé' }]} />
      <Zone label="Observations" valeur={v.observations} onChange={s('observations')} />
      <button className="btn plein" onClick={valider}>Enregistrer</button>
    </Feuille>
  );
}

export function FormEvenement({ t, lot, ev, onFermer }: { t: Tout; lot: Lot; ev?: LotEvenement | null; onFermer: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Partial<LotEvenement>>(ev ?? { lot_id: lot.id, date: aujourdhui(), type: 'deces', quantite: 1 });
  const s = (k: keyof LotEvenement) => (x: any) => setV({ ...v, [k]: x });
  const eff = effectifLot(lot, t).actuel + (ev && ev.type !== 'naissance' && ev.type !== 'ajustement' ? Number(ev.quantite) : 0);
  const valider = async () => {
    const q = Number(v.quantite || 0);
    if (v.type !== 'ajustement' && q <= 0) return toast('La quantité doit être positive.', true);
    if (v.type === 'ajustement' && q === 0) return toast("Indiquez l'ajustement (positif ou négatif).", true);
    if (['deces', 'reforme', 'transfert'].includes(v.type!) && q > eff) return toast(`Effectif insuffisant : ${eff} dans le lot.`, true);
    if (v.type === 'transfert' && !v.lot_dest_id) return toast('Choisissez le lot de destination.', true);
    await enregistrer('ae_lot_evenements', { ...v, quantite: Math.round(q), lot_dest_id: v.type === 'transfert' ? v.lot_dest_id : null } as any);
    toast('Évènement enregistré');
    onFermer();
  };
  return (
    <Feuille titre={`Évènement — ${lot.nom}`} onFermer={onFermer}>
      <Choix label="Type" valeur={v.type} onChange={s('type')} options={TYPES_EV.map((x) => ({ v: x.v, t: x.t }))} />
      <div className="deux">
        <DateChamp label="Date" valeur={v.date!} onChange={s('date')} />
        <Nombre label={v.type === 'ajustement' ? 'Ajustement (+/−)' : 'Quantité'} entier min={v.type === 'ajustement' ? -1e9 : 0}
          valeur={v.quantite} onChange={s('quantite')} aide={`Effectif actuel : ${nombre(eff)}`} />
      </div>
      {v.type === 'transfert' && (
        <Choix label="Lot de destination" requis valeur={v.lot_dest_id ?? ''} vide="— Choisir —"
          options={actifs(t.lots).filter((l) => l.id !== lot.id && l.statut === 'actif').map((l) => ({ v: l.id, t: l.nom }))} onChange={s('lot_dest_id')} />
      )}
      {(v.type === 'deces' || v.type === 'reforme') && <Texte label="Cause" valeur={v.cause} onChange={s('cause')} placeholder="Ex. : maladie, chaleur…" />}
      <Zone label="Observations" valeur={v.observations} onChange={s('observations')} />
      <button className="btn plein" onClick={valider}>Enregistrer</button>
    </Feuille>
  );
}

export function Elevage() {
  const t = useTout();
  const { profil } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState<'actif' | 'cloture' | 'tous'>('actif');
  const [espece, setEspece] = useState('');
  const [form, setForm] = useState(false);
  const lots = useMemo(() => actifs(t.lots)
    .filter((l) => (statut === 'tous' || l.statut === statut) && (!espece || l.espece_id === espece)
      && (!q || normaliser(l.nom + ' ' + (l.race ?? '') + ' ' + (l.provenance ?? '')).includes(normaliser(q))))
    .map((l) => ({ l, e: effectifLot(l, t) }))
    .sort((a, b) => b.l.date_arrivee.localeCompare(a.l.date_arrivee)), [t, q, statut, espece]);
  const total = lots.reduce((s, x) => s + x.e.actuel, 0);

  const exp = (fmt: 'pdf' | 'xlsx' | 'csv') => exporter(fmt, 'lots', 'Lots d\'élevage', lots, [
    { titre: 'Lot', valeur: (x) => x.l.nom },
    { titre: 'Espèce', valeur: (x) => nomEspece(t, x.l.espece_id) },
    { titre: 'Race', valeur: (x) => x.l.race ?? '' },
    { titre: 'Arrivée', valeur: (x) => dateFr(x.l.date_arrivee), brut: (x) => x.l.date_arrivee },
    { titre: 'Âge', valeur: (x) => ageTexte(joursDepuis(x.l.date_arrivee) + x.l.age_arrivee_jours) },
    { titre: 'Initial', valeur: (x) => x.l.effectif_initial, droite: true },
    { titre: 'Naiss.', valeur: (x) => x.e.naissances, droite: true },
    { titre: 'Décès', valeur: (x) => x.e.deces, droite: true },
    { titre: 'Réformes', valeur: (x) => x.e.reformes, droite: true },
    { titre: 'Vendus', valeur: (x) => x.e.ventes, droite: true },
    { titre: 'Actuel', valeur: (x) => x.e.actuel, droite: true },
  ], `${lots.length} lots — effectif total ${nombre(total)}`);

  return (
    <Page titre="Élevage" sousTitre={`${lots.length} lot(s) · effectif ${nombre(total)}`}
      action={peut(profil, 'elevage', 'ajouter') && <BoutonAjout onClick={() => setForm(true)} libelle="Nouveau lot" />}>
      <div className="outils"><Recherche valeur={q} onChange={setQ} placeholder="Rechercher un lot…" /><MenuExport onExport={exp} /></div>
      <Puces valeur={statut} onChange={setStatut} options={[{ v: 'actif', t: 'Actifs' }, { v: 'cloture', t: 'Clôturés' }, { v: 'tous', t: 'Tous' }]} />
      <Puces valeur={espece} onChange={setEspece} options={[{ v: '', t: 'Toutes espèces' }, ...actifs(t.especes).map((e) => ({ v: e.id, t: `${e.icone ?? ''} ${e.nom}` }))]} />
      {lots.length === 0 ? <Vide texte="Aucun lot. Touchez + pour créer votre premier lot." /> : (
        <div className="liste">
          {lots.map(({ l, e }) => (
            <button key={l.id} className="ligne" onClick={() => nav(`/elevage/${l.id}`)}>
              <div className="ico-rond">{t.especes.find((x) => x.id === l.espece_id)?.icone ?? <Bird size={18} />}</div>
              <div className="corps">
                <b>{l.nom} {l._attente && <span className="badge jaune">non synchronisé</span>}</b>
                <small>{nomEspece(t, l.espece_id)}{l.race ? ' · ' + l.race : ''} · {ageTexte(joursDepuis(l.date_arrivee) + Number(l.age_arrivee_jours || 0))}</small>
              </div>
              <div className="fin"><b>{nombre(e.actuel)}</b><small>sujets</small></div>
            </button>
          ))}
        </div>
      )}
      {form && <FormLot t={t} onFermer={() => setForm(false)} />}
    </Page>
  );
}

export function LotDetail() {
  const { id } = useParams();
  const t = useTout();
  const { profil } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const confirmer = useConfirm();
  const [form, setForm] = useState(false);
  const [ev, setEv] = useState<LotEvenement | null | 'nouveau'>(null);
  const lot = t.lots.find((l) => l.id === id);
  if (!t.pret) return <Page titre="Lot" retour><div /></Page>;
  if (!lot || lot.deleted_at) return <Page titre="Lot" retour><Vide texte="Lot introuvable ou supprimé." /></Page>;
  const e = effectifLot(lot, t);
  const evs = actifs(t.evenements).filter((x) => x.lot_id === lot.id || x.lot_dest_id === lot.id).sort((a, b) => b.date.localeCompare(a.date));
  const ventes = actifs(t.ventes).filter((v) => v.lot_id === lot.id);
  const achats = actifs(t.achats).filter((a) => a.lot_id === lot.id);
  const depenses = actifs(t.depenses).filter((d) => d.lot_id === lot.id);
  const prod = actifs(t.productions).filter((p) => p.lot_id === lot.id);
  const age = joursDepuis(lot.date_arrivee) + Number(lot.age_arrivee_jours || 0);
  const mortalite = Number(lot.effectif_initial) + e.achats + e.naissances > 0
    ? (e.deces / (Number(lot.effectif_initial) + e.achats + e.naissances)) * 100 : 0;

  const suppr = async () => {
    if (evs.length || ventes.length || achats.length) {
      if (!(await confirmer('Ce lot a des opérations liées. Elles seront conservées mais le lot n\'apparaîtra plus. Supprimer quand même ?', 'Supprimer'))) return;
    } else if (!(await confirmer(`Supprimer le lot « ${lot.nom} » ?`, 'Supprimer'))) return;
    await supprimer('ae_lots', lot.id);
    toast('Lot supprimé');
    nav('/elevage', { replace: true });
  };

  return (
    <Page titre={lot.nom} sousTitre={`${nomEspece(t, lot.espece_id)} · ${lot.statut === 'actif' ? 'Actif' : 'Clôturé'}`} retour
      action={peut(profil, 'elevage', 'ajouter') && <BoutonAjout onClick={() => setEv('nouveau')} libelle="Nouvel évènement" />}>
      {lot._erreur && <Alerte type="rouge">Synchronisation refusée : {lot._erreur}</Alerte>}
      <div className="grille-kpi">
        <div className="kpi vert"><div className="lib">Effectif actuel</div><div className="val">{nombre(e.actuel)}</div><div className="sous">Âge : {ageTexte(age)}</div></div>
        <div className="kpi"><div className="lib">Mortalité</div><div className="val">{mortalite.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</div><div className="sous">{nombre(e.deces)} décès</div></div>
      </div>
      <div className="carte">
        <h2>Détail des effectifs</h2>
        <dl className="kv">
          <dt>Effectif initial</dt><dd>{nombre(lot.effectif_initial)}</dd>
          <dt>Mâles / femelles</dt><dd>{nombre(lot.males)} / {nombre(lot.femelles)}</dd>
          <dt>+ Achats liés</dt><dd>{nombre(e.achats)}</dd>
          <dt>+ Naissances</dt><dd>{nombre(e.naissances)}</dd>
          <dt>+ Transferts reçus</dt><dd>{nombre(e.transfertsIn)}</dd>
          <dt>± Ajustements</dt><dd>{nombre(e.ajustements)}</dd>
          <dt>− Décès</dt><dd>{nombre(e.deces)}</dd>
          <dt>− Réformes</dt><dd>{nombre(e.reformes)}</dd>
          <dt>− Transferts sortis</dt><dd>{nombre(e.transfertsOut)}</dd>
          <dt>− Ventes</dt><dd>{nombre(e.ventes)}</dd>
          <dt className="gras">= Effectif actuel</dt><dd className="gras">{nombre(e.actuel)}</dd>
        </dl>
      </div>
      <div className="carte">
        <h2>Informations</h2>
        <dl className="kv">
          <dt>Race</dt><dd>{lot.race || '—'}</dd>
          <dt>Arrivée</dt><dd>{dateFr(lot.date_arrivee)}</dd>
          <dt>Provenance</dt><dd>{lot.provenance || '—'}</dd>
          <dt>Coût d'achat</dt><dd>{argent(lot.cout_achat)}</dd>
          <dt>Produit de stock</dt><dd>{lot.produit_id ? nomProduit(t, lot.produit_id) : '—'}</dd>
          <dt>Œufs produits</dt><dd>{nombre(prod.reduce((s, p) => s + Number(p.oeufs_pondus || 0), 0))}</dd>
          <dt>Ventes liées</dt><dd>{argent(ventes.reduce((s, v) => s + Number(v.montant_total ?? 0), 0))}</dd>
          <dt>Dépenses liées</dt><dd>{argent(depenses.reduce((s, d) => s + Number(d.montant), 0))}</dd>
          <dt>Créé par</dt><dd>{nomUtilisateur(t.profils, lot.created_by)}</dd>
        </dl>
        {lot.observations && <p className="plus-petit">{lot.observations}</p>}
        <div className="actions mt">
          {peut(profil, 'elevage', 'modifier') && <button className="btn second" onClick={() => setForm(true)}><Pencil size={16} />Modifier</button>}
          {peut(profil, 'elevage', 'supprimer') && <button className="btn danger" onClick={suppr}><Trash2 size={16} />Supprimer</button>}
        </div>
      </div>
      <div className="section-titre">Évènements ({evs.length})</div>
      {evs.length === 0 ? <Vide texte="Aucun évènement (naissances, décès, réformes, transferts)." /> : (
        <div className="liste">
          {evs.map((x) => {
            const entrant = x.lot_dest_id === lot.id;
            const signe = x.type === 'naissance' || entrant ? '+' : x.type === 'ajustement' ? (x.quantite >= 0 ? '+' : '') : '−';
            return (
              <button key={x.id} className="ligne" onClick={() => peut(profil, 'elevage', 'modifier') && !entrant && setEv(x)}>
                <div className="corps">
                  <b>{entrant ? `Transfert reçu de ${nomLot(t, x.lot_id)}` : libelleEv(x.type)}{x.type === 'transfert' && !entrant ? ` → ${nomLot(t, x.lot_dest_id)}` : ''}</b>
                  <small>{dateFr(x.date)} · {nomUtilisateur(t.profils, x.created_by)}{x.cause ? ' · ' + x.cause : ''}</small>
                </div>
                <div className="fin"><b className={signe === '−' ? 'rouge' : 'vert-t'}>{signe}{nombre(Math.abs(x.quantite))}</b></div>
              </button>
            );
          })}
        </div>
      )}
      {form && <FormLot t={t} lot={lot} onFermer={() => setForm(false)} />}
      {ev && <FormEvenementAvecSuppression t={t} lot={lot} ev={ev === 'nouveau' ? null : ev} onFermer={() => setEv(null)} />}
    </Page>
  );
}

function FormEvenementAvecSuppression({ t, lot, ev, onFermer }: { t: Tout; lot: Lot; ev: LotEvenement | null; onFermer: () => void }) {
  const { profil } = useAuth();
  const confirmer = useConfirm();
  return (
    <>
      <FormEvenement t={t} lot={lot} ev={ev} onFermer={onFermer} />
      {ev && peut(profil, 'elevage', 'supprimer') && (
        <div style={{ position: 'fixed', bottom: 20, left: 16, zIndex: 60 }}>
          <button className="btn danger petit" onClick={async () => {
            if (await confirmer('Supprimer cet évènement ?', 'Supprimer')) { await supprimer('ae_lot_evenements', ev.id); onFermer(); }
          }}><Trash2 size={15} />Supprimer l'évènement</button>
        </div>
      )}
    </>
  );
}
