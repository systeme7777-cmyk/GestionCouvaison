import { CheckCircle2, Egg, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Courbe } from '../components/Graphes';
import { nomEspece, nomLot, SelecteurEspece, SelecteurLot } from '../components/Selecteurs';
import {
  Alerte, bornesPeriode, BoutonAjout, Case, Choix, ChoixPeriode, DateChamp, Feuille, MenuExport, Nombre, Page, Puces,
  useConfirm, useToast, Vide, Zone, type Periode,
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { nomUtilisateur, useTout, type Tout } from '../hooks/useData';
import { actifs, filtrer } from '../lib/calc';
import { exporter } from '../lib/export';
import { aujourdhui, dateFr, MOIS, nombre, normaliser, semaineIso } from '../lib/format';
import { peut } from '../lib/perms';
import { enregistrer, supprimer } from '../lib/repo';
import type { Production as Prod, Produit } from '../lib/types';

function produitParDefaut(t: Tout, especeId: string | null | undefined, genre: 'oeufs' | 'fecondes' | 'viande' | 'fientes'): string | null {
  const ps = actifs(t.produits);
  const typeCat = (p: Produit) => t.categories.find((c) => c.id === p.categorie_id)?.type;
  const espece = t.especes.find((e) => e.id === especeId);
  if (genre === 'viande') return ps.find((p) => normaliser(p.nom).includes('viande'))?.id ?? null;
  if (genre === 'fientes') return ps.find((p) => normaliser(p.nom).includes('fiente'))?.id ?? null;
  const oeufs = ps.filter((p) => typeCat(p) === 'oeufs');
  if (genre === 'fecondes') return oeufs.find((p) => normaliser(p.nom).includes('fecond') && (!especeId || p.espece_id === especeId))?.id ?? null;
  if (espece && normaliser(espece.nom).startsWith('poule')) {
    return oeufs.find((p) => normaliser(p.nom).includes('consommation'))?.id ?? null;
  }
  const radical = espece ? normaliser(espece.nom).replace(/s$/, '') : '';
  return oeufs.find((p) => p.espece_id === especeId && !normaliser(p.nom).includes('fecond') && !normaliser(p.nom).includes('couver'))?.id
    ?? oeufs.find((p) => radical && normaliser(p.nom).includes(radical))?.id ?? oeufs.find((p) => normaliser(p.nom).includes('autres'))?.id ?? null;
}

function FormProduction({ t, prod, onFermer }: { t: Tout; prod?: Prod | null; onFermer: () => void }) {
  const toast = useToast();
  const { profil } = useAuth();
  const [v, setV] = useState<Partial<Prod>>(prod ?? {
    date: aujourdhui(), oeufs_pondus: 0, oeufs_casses: 0, oeufs_commercialisables: 0, oeufs_fecondes: 0,
    oeufs_couveuse: 0, viande_kg: 0, fientes_kg: 0, valide: false,
  });
  const [auto, setAuto] = useState(!prod);
  const s = (k: keyof Prod) => (x: any) => setV((p) => {
    const n = { ...p, [k]: x };
    if (auto && (k === 'oeufs_pondus' || k === 'oeufs_casses')) n.oeufs_commercialisables = Math.max(0, Number(n.oeufs_pondus || 0) - Number(n.oeufs_casses || 0) - Number(n.oeufs_fecondes || 0));
    if (auto && k === 'oeufs_fecondes') n.oeufs_commercialisables = Math.max(0, Number(n.oeufs_pondus || 0) - Number(n.oeufs_casses || 0) - Number(x || 0));
    return n;
  });
  const choisirLot = (id: string | null) => {
    const l = t.lots.find((x) => x.id === id);
    setV((p) => ({ ...p, lot_id: id, espece_id: l?.espece_id ?? p.espece_id }));
  };
  const peutValider = prod ? peut(profil, 'production', 'modifier') : peut(profil, 'production', 'ajouter');
  const basculerValide = (val: boolean) => setV((p) => ({
    ...p, valide: val,
    produit_oeufs_id: p.produit_oeufs_id ?? produitParDefaut(t, p.espece_id, 'oeufs'),
    produit_fecondes_id: p.produit_fecondes_id ?? produitParDefaut(t, p.espece_id, 'fecondes'),
    produit_viande_id: p.produit_viande_id ?? produitParDefaut(t, p.espece_id, 'viande'),
    produit_fientes_id: p.produit_fientes_id ?? produitParDefaut(t, p.espece_id, 'fientes'),
  }));
  const optionsProduits = (type?: string) => actifs(t.produits).filter((p) => !type || t.categories.find((c) => c.id === p.categorie_id)?.type === type).map((p) => ({ v: p.id, t: p.nom }));

  const valider = async () => {
    const n = (k: keyof Prod) => Number(v[k] || 0);
    if (n('oeufs_casses') + n('oeufs_commercialisables') > n('oeufs_pondus') && n('oeufs_pondus') > 0)
      return toast('Cassés + commercialisables ne peut pas dépasser les œufs pondus.', true);
    if (n('oeufs_couveuse') > n('oeufs_fecondes') && n('oeufs_fecondes') > 0)
      return toast('Les œufs mis en couveuse ne peuvent pas dépasser les œufs fécondés.', true);
    if (!v.lot_id && !v.espece_id) return toast('Choisissez un lot ou une espèce.', true);
    await enregistrer('ae_productions', {
      ...v, oeufs_pondus: n('oeufs_pondus'), oeufs_casses: n('oeufs_casses'), oeufs_commercialisables: n('oeufs_commercialisables'),
      oeufs_fecondes: n('oeufs_fecondes'), oeufs_couveuse: n('oeufs_couveuse'), viande_kg: n('viande_kg'), fientes_kg: n('fientes_kg'),
    } as any);
    toast(v.valide ? 'Production validée et ajoutée au stock' : 'Production enregistrée');
    onFermer();
  };

  return (
    <Feuille titre={prod ? 'Modifier la production' : 'Production du jour'} onFermer={onFermer}>
      <div className="deux">
        <DateChamp label="Date" valeur={v.date!} onChange={s('date')} />
        <SelecteurLot t={t} valeur={v.lot_id} onChange={choisirLot} label="Lot" />
      </div>
      {!v.lot_id && <SelecteurEspece t={t} valeur={v.espece_id} onChange={s('espece_id')} vide="— Choisir —" />}
      <div className="section-titre">Œufs</div>
      <div className="deux">
        <Nombre label="Œufs pondus" entier valeur={v.oeufs_pondus} onChange={s('oeufs_pondus')} />
        <Nombre label="Œufs cassés" entier valeur={v.oeufs_casses} onChange={s('oeufs_casses')} />
      </div>
      <div className="deux">
        <Nombre label="Œufs fécondés" entier valeur={v.oeufs_fecondes} onChange={s('oeufs_fecondes')} />
        <Nombre label="Mis en couveuse" entier valeur={v.oeufs_couveuse} onChange={s('oeufs_couveuse')} aide="Parmi les fécondés" />
      </div>
      <Nombre label="Œufs commercialisables" entier valeur={v.oeufs_commercialisables} onChange={(x) => { setAuto(false); s('oeufs_commercialisables')(x); }}
        aide={auto ? 'Calcul automatique : pondus − cassés − fécondés' : 'Saisie manuelle'} />
      <div className="section-titre">Autres productions</div>
      <div className="deux">
        <Nombre label="Viande produite (kg)" valeur={v.viande_kg} onChange={s('viande_kg')} />
        <Nombre label="Fientes produites (kg)" valeur={v.fientes_kg} onChange={s('fientes_kg')} />
      </div>
      <Zone label="Observations" valeur={v.observations} onChange={s('observations')} />
      {peutValider && <Case label={<b>Valider et ajouter au stock</b>} valeur={!!v.valide} onChange={basculerValide} />}
      {v.valide && (
        <div className="carte" style={{ background: 'var(--vert-clair)', boxShadow: 'none' }}>
          <div className="plus-petit" style={{ marginBottom: 8 }}>Affectation au stock (modifiable) :</div>
          <Choix label={`${nombre(v.oeufs_commercialisables)} œufs commercialisables →`} valeur={v.produit_oeufs_id ?? ''} vide="Ne pas stocker" options={optionsProduits('oeufs')} onChange={(x) => s('produit_oeufs_id')(x || null)} />
          <Choix label={`${nombre(Number(v.oeufs_fecondes || 0) - Number(v.oeufs_couveuse || 0))} œufs fécondés hors couveuse →`} valeur={v.produit_fecondes_id ?? ''} vide="Ne pas stocker" options={optionsProduits('oeufs')} onChange={(x) => s('produit_fecondes_id')(x || null)} />
          <Choix label={`${nombre(v.viande_kg)} kg de viande →`} valeur={v.produit_viande_id ?? ''} vide="Ne pas stocker" options={optionsProduits()} onChange={(x) => s('produit_viande_id')(x || null)} />
          <Choix label={`${nombre(v.fientes_kg)} kg de fientes →`} valeur={v.produit_fientes_id ?? ''} vide="Ne pas stocker" options={optionsProduits()} onChange={(x) => s('produit_fientes_id')(x || null)} />
        </div>
      )}
      <button className="btn plein" onClick={valider}>Enregistrer</button>
    </Feuille>
  );
}

type Groupe = 'jour' | 'semaine' | 'mois' | 'annee';
const cleGroupe = (d: string, g: Groupe) => g === 'jour' ? d : g === 'semaine' ? semaineIso(d) : g === 'mois' ? d.slice(0, 7) : d.slice(0, 4);
const libGroupe = (k: string, g: Groupe) => g === 'jour' ? dateFr(k) : g === 'mois' ? `${MOIS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}` : k;

export function Production() {
  const t = useTout();
  const { profil } = useAuth();
  const toast = useToast();
  const confirmer = useConfirm();
  const [params, setParams] = useSearchParams();
  const [periode, setPeriode] = useState<Periode>(bornesPeriode('mois'));
  const [vue, setVue] = useState<'saisies' | 'stats'>('saisies');
  const [groupe, setGroupe] = useState<Groupe>('jour');
  const [espece, setEspece] = useState('');
  const [lot, setLot] = useState('');
  const [form, setForm] = useState<Prod | null | 'nouveau'>(null);
  useEffect(() => { if (params.get('nouveau')) { setForm('nouveau'); setParams({}, { replace: true }); } }, [params]);

  const liste = useMemo(() => filtrer(t.productions, { du: periode.du, au: periode.au, espece_id: espece || null, lot_id: lot || null })
    .sort((a, b) => (b.date + b.created_at).localeCompare(a.date + a.created_at)), [t, periode, espece, lot]);
  const stats = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const p of liste) {
      const k = cleGroupe(p.date, groupe);
      const r = m.get(k) ?? { pondus: 0, casses: 0, comm: 0, fecondes: 0, couveuse: 0, viande: 0, fientes: 0, jours: 0 };
      r.pondus += Number(p.oeufs_pondus); r.casses += Number(p.oeufs_casses); r.comm += Number(p.oeufs_commercialisables);
      r.fecondes += Number(p.oeufs_fecondes); r.couveuse += Number(p.oeufs_couveuse); r.viande += Number(p.viande_kg); r.fientes += Number(p.fientes_kg);
      m.set(k, r);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, r]) => ({ k, lib: libGroupe(k, groupe), ...r } as { k: string; lib: string; pondus: number; casses: number; comm: number; fecondes: number; couveuse: number; viande: number; fientes: number }));
  }, [liste, groupe]);
  const tot = stats.reduce((s, r) => ({ pondus: s.pondus + r.pondus, casses: s.casses + r.casses, comm: s.comm + r.comm, fecondes: s.fecondes + r.fecondes, couveuse: s.couveuse + r.couveuse, viande: s.viande + r.viande, fientes: s.fientes + r.fientes }),
    { pondus: 0, casses: 0, comm: 0, fecondes: 0, couveuse: 0, viande: 0, fientes: 0 });

  const exp = (f: 'pdf' | 'xlsx' | 'csv') => exporter(f, 'production', 'Production', stats, [
    { titre: 'Période', valeur: (r) => r.lib, brut: (r) => r.k },
    { titre: 'Pondus', valeur: (r) => nombre(r.pondus), brut: (r) => r.pondus, droite: true },
    { titre: 'Cassés', valeur: (r) => nombre(r.casses), brut: (r) => r.casses, droite: true },
    { titre: 'Commerc.', valeur: (r) => nombre(r.comm), brut: (r) => r.comm, droite: true },
    { titre: 'Fécondés', valeur: (r) => nombre(r.fecondes), brut: (r) => r.fecondes, droite: true },
    { titre: 'Couveuse', valeur: (r) => nombre(r.couveuse), brut: (r) => r.couveuse, droite: true },
    { titre: 'Viande kg', valeur: (r) => nombre(r.viande), brut: (r) => r.viande, droite: true },
    { titre: 'Fientes kg', valeur: (r) => nombre(r.fientes), brut: (r) => r.fientes, droite: true },
  ], `Regroupement : ${groupe}${periode.du ? ` · du ${dateFr(periode.du)} au ${dateFr(periode.au)}` : ''}`,
  ['TOTAL', nombre(tot.pondus), nombre(tot.casses), nombre(tot.comm), nombre(tot.fecondes), nombre(tot.couveuse), nombre(tot.viande), nombre(tot.fientes)]);

  const valider = async (p: Prod) => {
    if (!(await confirmer('Valider cette production et l\'ajouter au stock ?', 'Valider', false))) return;
    await enregistrer('ae_productions', {
      id: p.id, valide: true,
      produit_oeufs_id: p.produit_oeufs_id ?? produitParDefaut(t, p.espece_id, 'oeufs'),
      produit_fecondes_id: p.produit_fecondes_id ?? produitParDefaut(t, p.espece_id, 'fecondes'),
      produit_viande_id: p.produit_viande_id ?? produitParDefaut(t, p.espece_id, 'viande'),
      produit_fientes_id: p.produit_fientes_id ?? produitParDefaut(t, p.espece_id, 'fientes'),
    });
    toast('Production validée : le stock sera mis à jour à la synchronisation');
  };

  return (
    <Page titre="Ponte & production" sousTitre={`${nombre(tot.pondus)} œufs sur la période`}
      action={peut(profil, 'production', 'ajouter') && <BoutonAjout onClick={() => setForm('nouveau')} />}>
      <Puces valeur={vue} onChange={setVue} options={[{ v: 'saisies', t: 'Saisies' }, { v: 'stats', t: 'Statistiques' }]} />
      <ChoixPeriode periode={periode} onChange={setPeriode} />
      <div className="filtres-grille">
        <select className="saisie" value={espece} onChange={(e) => setEspece(e.target.value)} aria-label="Espèce">
          <option value="">Toutes espèces</option>{actifs(t.especes).map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
        </select>
        <select className="saisie" value={lot} onChange={(e) => setLot(e.target.value)} aria-label="Lot">
          <option value="">Tous les lots</option>{actifs(t.lots).map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
        </select>
      </div>
      <div className="grille-kpi">
        <div className="kpi jaune"><div className="lib">Œufs pondus</div><div className="val">{nombre(tot.pondus)}</div><div className="sous">Casse : {tot.pondus ? ((tot.casses / tot.pondus) * 100).toFixed(1).replace('.', ',') : 0} %</div></div>
        <div className="kpi"><div className="lib">Commercialisables</div><div className="val">{nombre(tot.comm)}</div><div className="sous">Fécondés {nombre(tot.fecondes)} · couveuse {nombre(tot.couveuse)}</div></div>
      </div>
      {vue === 'stats' ? (
        <>
          <Puces valeur={groupe} onChange={setGroupe} options={[{ v: 'jour', t: 'Par jour' }, { v: 'semaine', t: 'Par semaine' }, { v: 'mois', t: 'Par mois' }, { v: 'annee', t: 'Par année' }]} />
          <div className="carte"><Courbe points={stats.map((r) => ({ etiquette: groupe === 'jour' ? r.lib.slice(0, 5) : r.lib.slice(0, 8), valeur: r.pondus }))} nom="Œufs pondus" unite="œufs" /></div>
          <div className="carte">
            <h2>Détail <span className="droite"><MenuExport onExport={exp} /></span></h2>
            <div className="tableau-wrap">
              <table className="tableau">
                <thead><tr><th>Période</th><th className="n">Pondus</th><th className="n">Cassés</th><th className="n">Comm.</th><th className="n">Féc.</th><th className="n">Couv.</th><th className="n">Viande</th><th className="n">Fientes</th></tr></thead>
                <tbody>
                  {stats.map((r) => <tr key={r.k}><td>{r.lib}</td><td className="n">{nombre(r.pondus)}</td><td className="n">{nombre(r.casses)}</td><td className="n">{nombre(r.comm)}</td><td className="n">{nombre(r.fecondes)}</td><td className="n">{nombre(r.couveuse)}</td><td className="n">{nombre(r.viande)}</td><td className="n">{nombre(r.fientes)}</td></tr>)}
                  <tr className="total"><td>Total</td><td className="n">{nombre(tot.pondus)}</td><td className="n">{nombre(tot.casses)}</td><td className="n">{nombre(tot.comm)}</td><td className="n">{nombre(tot.fecondes)}</td><td className="n">{nombre(tot.couveuse)}</td><td className="n">{nombre(tot.viande)}</td><td className="n">{nombre(tot.fientes)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : liste.length === 0 ? <Vide texte="Aucune production saisie sur cette période." /> : (
        <div className="liste">
          {liste.map((p) => (
            <div key={p.id} className="ligne">
              <div className="ico-rond"><Egg size={18} /></div>
              <div className="corps">
                <b>{dateFr(p.date)} · {nombre(p.oeufs_pondus)} œufs</b>
                <small>{p.lot_id ? nomLot(t, p.lot_id) : nomEspece(t, p.espece_id)} · cassés {p.oeufs_casses} · comm. {p.oeufs_commercialisables}{Number(p.viande_kg) ? ` · viande ${nombre(p.viande_kg)} kg` : ''}{Number(p.fientes_kg) ? ` · fientes ${nombre(p.fientes_kg)} kg` : ''}</small>
                <small>{nomUtilisateur(t.profils, p.created_by)}{p._attente ? ' · en attente' : ''}</small>
                {p._erreur && <small className="rouge">⚠ {p._erreur}</small>}
              </div>
              <div className="fin">
                {p.valide ? <span className="badge"><CheckCircle2 size={12} />validée</span>
                  : peut(profil, 'production', 'modifier') ? <button className="btn petit" onClick={() => valider(p)}>Valider</button> : <span className="badge gris">à valider</span>}
                <div className="actions" style={{ marginTop: 4, justifyContent: 'flex-end' }}>
                  {peut(profil, 'production', 'modifier') && <button className="btn lien" aria-label="Modifier" onClick={() => setForm(p)}><Pencil size={16} /></button>}
                  {peut(profil, 'production', 'supprimer') && <button className="btn lien" aria-label="Supprimer" onClick={async () => {
                    if (await confirmer('Supprimer cette saisie ? Si elle était validée, le stock sera corrigé.', 'Supprimer')) await supprimer('ae_productions', p.id);
                  }}><Trash2 size={16} /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {liste.some((p) => !p.valide) && vue === 'saisies' && <Alerte type="vert">Les productions non validées n'alimentent pas encore les stocks.</Alerte>}
      {form && <FormProduction t={t} prod={form === 'nouveau' ? null : form} onFermer={() => setForm(null)} />}
    </Page>
  );
}
