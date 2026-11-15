import { AlertTriangle, Package, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { nomEspece, SelecteurLot } from '../components/Selecteurs';
import {
  Alerte, Choix, DateChamp, Feuille, MenuExport, Nombre, Page, Puces, Recherche, Texte, useConfirm, useToast, Vide,
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { nomUtilisateur, useTout, type Tout } from '../hooks/useData';
import { actifs, calculerStocks, mouvementsProduit, type LigneStock } from '../lib/calc';
import { exporter } from '../lib/export';
import { aujourdhui, dateFr, nombre, normaliser } from '../lib/format';
import { peut } from '../lib/perms';
import { enregistrer, supprimer } from '../lib/repo';
import type { Produit, TypeMouvement } from '../lib/types';

function FormMouvement({ t, produit, onFermer, dispo }: { t: Tout; produit: Produit; dispo: number; onFermer: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<TypeMouvement>('perte');
  const [q, setQ] = useState<number | ''>(1);
  const [date, setDate] = useState(aujourdhui());
  const [motif, setMotif] = useState('');
  const [lot, setLot] = useState<string | null>(null);
  const valider = async () => {
    const n = Number(q || 0);
    if (type !== 'correction' && n <= 0) return toast('La quantité doit être positive.', true);
    if (type === 'correction' && n === 0) return toast('Indiquez la correction (+ ou −).', true);
    if ((type === 'perte' || type === 'mort') && n > dispo) return toast(`Le stock n'est que de ${nombre(dispo)}.`, true);
    if (type === 'correction' && !motif.trim()) return toast('Indiquez le motif de la correction.', true);
    await enregistrer('ae_mouvements', { produit_id: produit.id, type, quantite: n, date, motif: motif || null, lot_id: lot, source: 'manuel' });
    toast('Mouvement enregistré');
    onFermer();
  };
  return (
    <Feuille titre={`Mouvement — ${produit.nom}`} onFermer={onFermer}>
      <Choix label="Type de mouvement" valeur={type} onChange={(v) => setType(v as TypeMouvement)} options={[
        { v: 'initial', t: 'Stock initial (+)' }, { v: 'production', t: 'Production (+)' },
        { v: 'perte', t: 'Perte (−)' }, { v: 'mort', t: 'Mortalité (−)' }, { v: 'correction', t: 'Correction autorisée (±)' },
      ]} />
      <div className="deux">
        <Nombre label={type === 'correction' ? 'Quantité (+/−)' : `Quantité (${produit.unite})`} min={type === 'correction' ? -1e9 : 0} valeur={q} onChange={setQ} aide={`Stock actuel : ${nombre(dispo)}`} />
        <DateChamp label="Date" valeur={date} onChange={setDate} />
      </div>
      <SelecteurLot t={t} valeur={lot} onChange={setLot} />
      <Texte label={type === 'correction' ? 'Motif (obligatoire)' : 'Motif'} valeur={motif} onChange={setMotif} placeholder="Ex. : inventaire, casse, vol…" />
      <button className="btn plein" onClick={valider}>Enregistrer</button>
    </Feuille>
  );
}

export function Stocks() {
  const t = useTout();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [espece, setEspece] = useState('');
  const [filtre, setFiltre] = useState<'tous' | 'dispo' | 'alerte'>('dispo');
  const stocks = useMemo(() => calculerStocks(t), [t]);
  const lignes = useMemo(() => actifs(t.produits)
    .filter((p) => p.stockable && (!cat || p.categorie_id === cat) && (!espece || p.espece_id === espece)
      && (!q || normaliser(p.nom).includes(normaliser(q))))
    .map((p) => ({ p, s: stocks.get(p.id)! }))
    .filter(({ p, s }) => filtre === 'tous'
      || (filtre === 'dispo' && (s.disponible !== 0 || s.achete + s.vendu + s.produit + s.initial > 0))
      || (filtre === 'alerte' && Number(p.seuil_alerte) > 0 && s.disponible <= Number(p.seuil_alerte))), [t, stocks, q, cat, espece, filtre]);

  const groupes = new Map<string, typeof lignes>();
  for (const l of lignes) {
    const c = t.categories.find((x) => x.id === l.p.categorie_id)?.nom ?? 'Sans catégorie';
    groupes.set(c, [...(groupes.get(c) ?? []), l]);
  }

  const exp = (f: 'pdf' | 'xlsx' | 'csv') => exporter(f, 'stocks', 'État des stocks', lignes, [
    { titre: 'Produit', valeur: (x) => x.p.nom },
    { titre: 'Espèce', valeur: (x) => nomEspece(t, x.p.espece_id) },
    { titre: 'Unité', valeur: (x) => x.p.unite },
    { titre: 'Initial', valeur: (x) => nombre(x.s.initial), brut: (x) => x.s.initial, droite: true },
    { titre: 'Acheté', valeur: (x) => nombre(x.s.achete), brut: (x) => x.s.achete, droite: true },
    { titre: 'Produit', valeur: (x) => nombre(x.s.produit), brut: (x) => x.s.produit, droite: true },
    { titre: 'Vendu', valeur: (x) => nombre(x.s.vendu), brut: (x) => x.s.vendu, droite: true },
    { titre: 'Perdu', valeur: (x) => nombre(x.s.perdu), brut: (x) => x.s.perdu, droite: true },
    { titre: 'Mort', valeur: (x) => nombre(x.s.mort), brut: (x) => x.s.mort, droite: true },
    { titre: 'Corr.', valeur: (x) => nombre(x.s.correction), brut: (x) => x.s.correction, droite: true },
    { titre: 'Disponible', valeur: (x) => nombre(x.s.disponible), brut: (x) => x.s.disponible, droite: true },
  ], `Au ${dateFr(aujourdhui())}`);

  return (
    <Page titre="Stocks" sousTitre={`${lignes.length} produit(s)`}>
      <div className="outils"><Recherche valeur={q} onChange={setQ} placeholder="Rechercher un produit…" /><MenuExport onExport={exp} /></div>
      <Puces valeur={filtre} onChange={setFiltre} options={[{ v: 'dispo', t: 'Avec mouvements' }, { v: 'alerte', t: '⚠ Stock faible' }, { v: 'tous', t: 'Tous' }]} />
      <div className="filtres-grille">
        <select className="saisie" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Catégorie">
          <option value="">Toutes catégories</option>{actifs(t.categories).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <select className="saisie" value={espece} onChange={(e) => setEspece(e.target.value)} aria-label="Espèce">
          <option value="">Toutes espèces</option>{actifs(t.especes).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
      </div>
      {lignes.length === 0 ? <Vide texte={filtre === 'dispo' ? 'Aucun mouvement de stock. Les achats, la production validée et les lots alimentent les stocks.' : 'Aucun produit.'} /> : (
        [...groupes.entries()].map(([g, ls]) => (
          <div key={g}>
            <div className="section-titre">{g}</div>
            <div className="liste">
              {ls.map(({ p, s }) => {
                const alerte = Number(p.seuil_alerte) > 0 && s.disponible <= Number(p.seuil_alerte);
                return (
                  <button key={p.id} className="ligne" onClick={() => nav(`/stocks/${p.id}`)}>
                    <div className="ico-rond">{alerte ? <AlertTriangle size={18} color="#b9770e" /> : <Package size={18} />}</div>
                    <div className="corps"><b>{p.nom}</b><small>{nomEspece(t, p.espece_id)} · entrées {nombre(s.initial + s.achete + s.produit)} · sorties {nombre(s.vendu + s.perdu + s.mort)}</small></div>
                    <div className="fin"><b className={s.disponible <= 0 ? 'rouge' : ''}>{nombre(s.disponible)}</b><small>{p.unite}</small>
                      {alerte && <span className="badge jaune">faible</span>}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
    </Page>
  );
}

export function StockDetail() {
  const { id } = useParams();
  const t = useTout();
  const { profil } = useAuth();
  const confirmer = useConfirm();
  const [form, setForm] = useState(false);
  const p = t.produits.find((x) => x.id === id);
  const s: LigneStock | undefined = useMemo(() => (p ? calculerStocks(t).get(p.id) : undefined), [t, p]);
  const mvts = useMemo(() => (p ? mouvementsProduit(p.id, t) : []), [t, p]);
  if (!p || !s) return <Page titre="Stock" retour><Vide texte="Produit introuvable." /></Page>;
  const alerte = Number(p.seuil_alerte) > 0 && s.disponible <= Number(p.seuil_alerte);

  const exp = (f: 'pdf' | 'xlsx' | 'csv') => exporter(f, 'mouvements_' + p.nom, `Mouvements — ${p.nom}`, mvts, [
    { titre: 'Date', valeur: (m) => dateFr(m.date), brut: (m) => m.date },
    { titre: 'Type', valeur: (m) => m.type },
    { titre: 'Libellé', valeur: (m) => m.libelle },
    { titre: 'Quantité', valeur: (m) => (m.quantite > 0 ? '+' : '') + nombre(m.quantite), brut: (m) => m.quantite, droite: true },
    { titre: 'Utilisateur', valeur: (m) => nomUtilisateur(t.profils, m.created_by) },
  ], `Stock disponible : ${nombre(s.disponible)} ${p.unite}`);

  return (
    <Page titre={p.nom} sousTitre={`${nomEspece(t, p.espece_id)} · stock`} retour>
      {alerte && <Alerte>Stock faible : seuil d'alerte {nombre(p.seuil_alerte)} {p.unite}</Alerte>}
      <div className="grille-kpi">
        <div className="kpi vert"><div className="lib">Stock disponible</div><div className="val">{nombre(s.disponible)} {p.unite}</div></div>
        <div className="kpi"><div className="lib">Seuil d'alerte</div><div className="val">{nombre(p.seuil_alerte)}</div></div>
      </div>
      <div className="carte">
        <h2>Récapitulatif</h2>
        <dl className="kv">
          <dt>Stock initial</dt><dd>{nombre(s.initial)}</dd>
          <dt>+ Quantités achetées</dt><dd>{nombre(s.achete)}</dd>
          <dt>+ Quantités produites</dt><dd>{nombre(s.produit)}</dd>
          <dt>− Quantités vendues</dt><dd>{nombre(s.vendu)}</dd>
          <dt>− Quantités perdues</dt><dd>{nombre(s.perdu)}</dd>
          <dt>− Quantités mortes</dt><dd>{nombre(s.mort)}</dd>
          <dt>± Corrections / transferts</dt><dd>{nombre(s.correction)}</dd>
          <dt className="gras">= Stock disponible</dt><dd className="gras">{nombre(s.disponible)} {p.unite}</dd>
        </dl>
        <div className="actions mt">
          {peut(profil, 'stocks', 'ajouter') && <button className="btn" onClick={() => setForm(true)}><Plus size={17} />Mouvement</button>}
          <MenuExport onExport={exp} />
        </div>
      </div>
      <div className="section-titre">Historique des mouvements ({mvts.length})</div>
      {mvts.length === 0 ? <Vide texte="Aucun mouvement." /> : (
        <div className="liste">
          {mvts.map((m) => {
            const manuel = m.source === 'Stocks' && t.mouvements.some((x) => x.id === m.id);
            return (
              <div key={m.id} className="ligne">
                <div className="corps"><b>{m.libelle}</b><small>{dateFr(m.date)} · {m.source} · {nomUtilisateur(t.profils, m.created_by)}</small></div>
                <div className="fin"><b className={m.quantite < 0 ? 'rouge' : 'vert-t'}>{m.quantite > 0 ? '+' : ''}{nombre(m.quantite)}</b></div>
                {manuel && peut(profil, 'stocks', 'supprimer') && (
                  <button className="btn lien" aria-label="Supprimer" onClick={async () => {
                    if (await confirmer('Supprimer ce mouvement de stock ?', 'Supprimer')) await supprimer('ae_mouvements', m.id);
                  }}><Trash2 size={16} /></button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {form && <FormMouvement t={t} produit={p} dispo={s.disponible} onFermer={() => setForm(false)} />}
    </Page>
  );
}
