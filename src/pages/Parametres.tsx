import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bird, Boxes, ChevronRight, CloudCog, Database, KeyRound, LogOut, Pencil, RefreshCw, Settings2, Tags, Trash2, UserCog,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CAT_DEPENSES } from './Depenses';
import { CAT_REVENUS } from './Revenus';
import { MODES_DEFAUT } from '../components/Paiements';
import { nomEspece } from '../components/Selecteurs';
import {
  Alerte, BoutonAjout, Case, Choix, Feuille, Nombre, Page, Recherche, Texte, useConfirm, useToast, Vide,
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { listeParam, nomUtilisateur, useEtatSync, useTout, type Tout } from '../hooks/useData';
import { actifs } from '../lib/calc';
import { db, table } from '../lib/db';
import { partagerFichier, versExcel } from '../lib/export';
import { dateHeureFr, normaliser } from '../lib/format';
import { nomRole, peut } from '../lib/perms';
import { enregistrer, supprimer } from '../lib/repo';
import { annulerEntree, reessayer, synchroniser, viderLocal } from '../lib/sync';
import { LIBELLES_TABLES, TABLES, type Categorie, type Espece, type Produit } from '../lib/types';
import { ChangerMotDePasse } from './Connexion';

function LigneLien({ to, icone, titre, sous }: { to: string; icone: ReactNode; titre: string; sous?: string }) {
  return (
    <Link to={to} className="ligne" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="ico-rond">{icone}</div>
      <div className="corps"><b>{titre}</b>{sous && <small>{sous}</small>}</div>
      <ChevronRight size={18} color="#9aa79d" />
    </Link>
  );
}

export function ParametresIndex() {
  const { profil } = useAuth();
  const principal = profil?.role === 'admin_principal';
  return (
    <Page titre="Paramètres" retour>
      <div className="liste">
        {principal && <LigneLien to="/parametres/utilisateurs" icone={<UserCog size={18} />} titre="Gestion des utilisateurs" sous="Comptes, rôles et permissions" />}
        {peut(profil, 'parametres') && <LigneLien to="/parametres/general" icone={<Settings2 size={18} />} titre="Paramètres généraux" sous="Exploitation, devise, catégories, modes de paiement" />}
        {peut(profil, 'catalogue') && <LigneLien to="/parametres/especes" icone={<Bird size={18} />} titre="Espèces de volailles" />}
        {peut(profil, 'catalogue') && <LigneLien to="/parametres/categories" icone={<Tags size={18} />} titre="Catégories de produits" />}
        {peut(profil, 'catalogue') && <LigneLien to="/parametres/produits" icone={<Boxes size={18} />} titre="Produits et dérivés" sous="Unités, seuils d'alerte, prix" />}
        <LigneLien to="/parametres/synchronisation" icone={<CloudCog size={18} />} titre="Synchronisation" sous="État, opérations en attente, erreurs" />
        {peut(profil, 'historique') && <LigneLien to="/parametres/sauvegarde" icone={<Database size={18} />} titre="Sauvegarde des données" sous="Export complet Excel / JSON" />}
        <LigneLien to="/parametres/compte" icone={<KeyRound size={18} />} titre="Mon compte" sous={`${profil?.email} · ${nomRole(profil?.role ?? '')}`} />
      </div>
      <p className="plus-petit centre">ANSAR ELEVAGE · Gestion Avicole · version 1.0.0</p>
    </Page>
  );
}

// ---------------------------------------------------------------------------
function EditeurListe({ titre, valeurs, onChange }: { titre: string; valeurs: string[]; onChange: (v: string[]) => void }) {
  const [nouveau, setNouveau] = useState('');
  return (
    <div className="carte">
      <h2>{titre}</h2>
      {valeurs.map((v, i) => (
        <div key={v + i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <span style={{ flex: 1 }}>{v}</span>
          <button className="btn lien" aria-label="Retirer" onClick={() => onChange(valeurs.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
        </div>
      ))}
      <div className="outils mt">
        <input className="saisie" value={nouveau} placeholder="Ajouter…" onChange={(e) => setNouveau(e.target.value)} />
        <button className="btn petit" onClick={() => { if (nouveau.trim()) { onChange([...valeurs, nouveau.trim()]); setNouveau(''); } }}>Ajouter</button>
      </div>
    </div>
  );
}

async function sauverParam(t: Tout, cle: string, valeur: any) {
  const row = await db.ae_parametres.where('cle').equals(cle).first();
  await enregistrer('ae_parametres', row ? { id: row.id, valeur } : { cle, valeur });
}

export function ParametresGeneraux() {
  const t = useTout();
  const toast = useToast();
  const { profil } = useAuth();
  const p = t.parametres;
  const [v, setV] = useState<Record<string, any>>({});
  const val = (k: string, d: any = '') => (k in v ? v[k] : p[k] ?? d);
  const s = (k: string) => (x: any) => setV({ ...v, [k]: x });
  const ecrire = peut(profil, 'parametres', 'modifier');
  const enregistrerTout = async () => {
    for (const [k, x] of Object.entries(v)) await sauverParam(t, k, k === 'tresorerie_initiale' ? Number(x || 0) : x);
    setV({});
    toast('Paramètres enregistrés');
  };
  return (
    <Page titre="Paramètres généraux" retour>
      {!ecrire && <Alerte>Consultation seule : vous n'avez pas le droit de modifier les paramètres.</Alerte>}
      <div className="carte">
        <h2>Exploitation</h2>
        <Texte label="Nom de l'exploitation" valeur={val('nom_exploitation', 'ANSAR ELEVAGE')} onChange={s('nom_exploitation')} />
        <Texte label="Adresse" valeur={val('adresse')} onChange={s('adresse')} />
        <Texte label="Téléphone" valeur={val('telephone')} onChange={s('telephone')} />
        <div className="deux">
          <Texte label="Devise" valeur={val('devise', 'FCFA')} onChange={s('devise')} aide="Ex. : FCFA, DH, DA, €" />
          <Nombre label="Trésorerie initiale" valeur={val('tresorerie_initiale', 0)} onChange={s('tresorerie_initiale')} aide="Argent en caisse au démarrage" />
        </div>
      </div>
      <EditeurListe titre="Catégories de dépenses" valeurs={val('categories_depenses', CAT_DEPENSES)} onChange={s('categories_depenses')} />
      <EditeurListe titre="Catégories de revenus" valeurs={val('categories_revenus', CAT_REVENUS)} onChange={s('categories_revenus')} />
      <EditeurListe titre="Modes de paiement" valeurs={val('modes_paiement', MODES_DEFAUT)} onChange={s('modes_paiement')} />
      {ecrire && <button className="btn plein" disabled={!Object.keys(v).length} onClick={enregistrerTout}>Enregistrer les modifications</button>}
    </Page>
  );
}

// ---------------------------------------------------------------------------
export function Especes() {
  const t = useTout();
  const { profil } = useAuth();
  const toast = useToast();
  const confirmer = useConfirm();
  const [form, setForm] = useState<Partial<Espece> | null>(null);
  const valider = async () => {
    if (!form?.nom?.trim()) return toast('Nom obligatoire', true);
    await enregistrer('ae_especes', { ...form, nom: form.nom.trim(), ordre: Number(form.ordre ?? 100), actif: form.actif !== false } as any);
    setForm(null); toast('Espèce enregistrée');
  };
  return (
    <Page titre="Espèces" retour action={peut(profil, 'catalogue', 'ajouter') && <BoutonAjout onClick={() => setForm({ nom: '', icone: '🐤', ordre: 100, actif: true })} />}>
      <div className="liste">
        {actifs(t.especes).map((e) => (
          <button key={e.id} className="ligne" onClick={() => peut(profil, 'catalogue', 'modifier') && setForm(e)}>
            <div className="ico-rond">{e.icone || '🐤'}</div>
            <div className="corps"><b>{e.nom}</b><small>{actifs(t.produits).filter((p) => p.espece_id === e.id).length} produit(s) · {actifs(t.lots).filter((l) => l.espece_id === e.id).length} lot(s)</small></div>
            {!e.actif && <span className="badge gris">inactive</span>}
          </button>
        ))}
      </div>
      {form && (
        <Feuille titre={form.id ? "Modifier l'espèce" : 'Nouvelle espèce'} onFermer={() => setForm(null)}>
          <div className="deux">
            <Texte label="Nom" requis valeur={form.nom} onChange={(x) => setForm({ ...form, nom: x })} />
            <Texte label="Icône (emoji)" valeur={form.icone} onChange={(x) => setForm({ ...form, icone: x })} />
          </div>
          <Nombre label="Ordre d'affichage" entier valeur={form.ordre} onChange={(x) => setForm({ ...form, ordre: Number(x || 0) })} />
          <Case label="Active" valeur={form.actif !== false} onChange={(x) => setForm({ ...form, actif: x })} />
          <div className="actions">
            <button className="btn" onClick={valider}>Enregistrer</button>
            {form.id && peut(profil, 'catalogue', 'supprimer') && <button className="btn danger" onClick={async () => {
              const usage = actifs(t.produits).some((p) => p.espece_id === form.id) || actifs(t.lots).some((l) => l.espece_id === form.id);
              if (await confirmer(usage ? 'Cette espèce est utilisée. Préférez la désactiver. Supprimer quand même ?' : 'Supprimer cette espèce ?', 'Supprimer')) {
                await supprimer('ae_especes', form.id!); setForm(null);
              }
            }}><Trash2 size={16} /></button>}
          </div>
        </Feuille>
      )}
    </Page>
  );
}

export function Categories() {
  const t = useTout();
  const { profil } = useAuth();
  const toast = useToast();
  const confirmer = useConfirm();
  const [form, setForm] = useState<Partial<Categorie> | null>(null);
  const types = [{ v: 'animaux', t: 'Animaux vivants' }, { v: 'oeufs', t: 'Œufs' }, { v: 'derives', t: 'Produits dérivés' }, { v: 'autre', t: 'Autre' }];
  const valider = async () => {
    if (!form?.nom?.trim()) return toast('Nom obligatoire', true);
    await enregistrer('ae_categories', { ...form, nom: form.nom.trim(), ordre: Number(form.ordre ?? 100) } as any);
    setForm(null); toast('Catégorie enregistrée');
  };
  return (
    <Page titre="Catégories" retour action={peut(profil, 'catalogue', 'ajouter') && <BoutonAjout onClick={() => setForm({ nom: '', type: 'autre', ordre: 100 })} />}>
      <div className="liste">
        {actifs(t.categories).map((c) => (
          <button key={c.id} className="ligne" onClick={() => peut(profil, 'catalogue', 'modifier') && setForm(c)}>
            <div className="ico-rond"><Tags size={18} /></div>
            <div className="corps"><b>{c.nom}</b><small>{types.find((x) => x.v === c.type)?.t} · {actifs(t.produits).filter((p) => p.categorie_id === c.id).length} produit(s)</small></div>
          </button>
        ))}
      </div>
      {form && (
        <Feuille titre={form.id ? 'Modifier la catégorie' : 'Nouvelle catégorie'} onFermer={() => setForm(null)}>
          <Texte label="Nom" requis valeur={form.nom} onChange={(x) => setForm({ ...form, nom: x })} />
          <Choix label="Type" valeur={form.type} onChange={(x) => setForm({ ...form, type: x as any })} options={types} />
          <Nombre label="Ordre" entier valeur={form.ordre} onChange={(x) => setForm({ ...form, ordre: Number(x || 0) })} />
          <div className="actions">
            <button className="btn" onClick={valider}>Enregistrer</button>
            {form.id && peut(profil, 'catalogue', 'supprimer') && <button className="btn danger" onClick={async () => {
              if (await confirmer('Supprimer cette catégorie ?', 'Supprimer')) { await supprimer('ae_categories', form.id!); setForm(null); }
            }}><Trash2 size={16} /></button>}
          </div>
        </Feuille>
      )}
    </Page>
  );
}

export function Produits() {
  const t = useTout();
  const { profil } = useAuth();
  const toast = useToast();
  const confirmer = useConfirm();
  const [q, setQ] = useState('');
  const [form, setForm] = useState<Partial<Produit> | null>(null);
  const cats = listeParam(t, 'categories_revenus', CAT_REVENUS);
  const liste = actifs(t.produits).filter((p) => !q || normaliser(p.nom).includes(normaliser(q)));
  const valider = async () => {
    if (!form?.nom?.trim()) return toast('Nom obligatoire', true);
    if (!form.unite?.trim()) return toast('Unité obligatoire', true);
    await enregistrer('ae_produits', {
      ...form, nom: form.nom.trim(), unite: form.unite.trim(), seuil_alerte: Number(form.seuil_alerte || 0),
      prix_vente: form.prix_vente === null || (form.prix_vente as any) === '' ? null : Number(form.prix_vente),
      stockable: form.stockable !== false, actif: form.actif !== false, categorie_revenu: form.categorie_revenu || 'Autres revenus',
    } as any);
    setForm(null); toast('Produit enregistré');
  };
  return (
    <Page titre="Produits" retour action={peut(profil, 'catalogue', 'ajouter') && <BoutonAjout onClick={() => setForm({ nom: '', unite: 'unité', stockable: true, actif: true, seuil_alerte: 0, categorie_revenu: 'Autres revenus' })} />}>
      <div className="outils"><Recherche valeur={q} onChange={setQ} /></div>
      <div className="liste">
        {liste.map((p) => (
          <button key={p.id} className="ligne" onClick={() => peut(profil, 'catalogue', 'modifier') && setForm(p)}>
            <div className="corps"><b>{p.nom}</b><small>{nomEspece(t, p.espece_id)} · {t.categories.find((c) => c.id === p.categorie_id)?.nom ?? '—'} · {p.unite}</small></div>
            <div className="fin">{!p.actif && <span className="badge gris">inactif</span>}{!p.stockable && <span className="badge bleu">non stocké</span>}</div>
          </button>
        ))}
      </div>
      {form && (
        <Feuille titre={form.id ? 'Modifier le produit' : 'Nouveau produit'} onFermer={() => setForm(null)}>
          <Texte label="Nom" requis valeur={form.nom} onChange={(x) => setForm({ ...form, nom: x })} />
          <div className="deux">
            <Choix label="Espèce" valeur={form.espece_id ?? ''} vide="Toutes / aucune" options={actifs(t.especes).map((e) => ({ v: e.id, t: e.nom }))} onChange={(x) => setForm({ ...form, espece_id: x || null })} />
            <Choix label="Catégorie" valeur={form.categorie_id ?? ''} vide="—" options={actifs(t.categories).map((c) => ({ v: c.id, t: c.nom }))} onChange={(x) => setForm({ ...form, categorie_id: x || null })} />
          </div>
          <div className="trois">
            <Texte label="Unité" requis valeur={form.unite} onChange={(x) => setForm({ ...form, unite: x })} />
            <Nombre label="Seuil d'alerte" valeur={form.seuil_alerte} onChange={(x) => setForm({ ...form, seuil_alerte: Number(x || 0) })} />
            <Nombre label="Prix de vente" valeur={form.prix_vente} onChange={(x) => setForm({ ...form, prix_vente: x === '' ? null : x })} />
          </div>
          <Choix label="Catégorie de revenu (ventes)" valeur={form.categorie_revenu} onChange={(x) => setForm({ ...form, categorie_revenu: x })} options={cats.map((c) => ({ v: c, t: c }))} />
          <Case label="Produit géré en stock" valeur={form.stockable !== false} onChange={(x) => setForm({ ...form, stockable: x })} />
          <Case label="Actif (proposé dans les formulaires)" valeur={form.actif !== false} onChange={(x) => setForm({ ...form, actif: x })} />
          <div className="actions">
            <button className="btn" onClick={valider}>Enregistrer</button>
            {form.id && peut(profil, 'catalogue', 'supprimer') && <button className="btn danger" onClick={async () => {
              const usage = actifs(t.achats).some((a) => a.produit_id === form.id) || actifs(t.ventes).some((v) => v.produit_id === form.id);
              if (await confirmer(usage ? 'Ce produit a des achats/ventes. Préférez le désactiver. Supprimer quand même ?' : 'Supprimer ce produit ?', 'Supprimer')) {
                await supprimer('ae_produits', form.id!); setForm(null);
              }
            }}><Trash2 size={16} /></button>}
          </div>
        </Feuille>
      )}
    </Page>
  );
}

// ---------------------------------------------------------------------------
export function Synchronisation() {
  const e = useEtatSync();
  const t = useTout();
  const confirmer = useConfirm();
  const toast = useToast();
  const entrees = useLiveQuery(() => db.attente.toArray(), []) ?? [];
  const fichiers = useLiveQuery(() => db.fichiers.count(), []) ?? 0;
  const derniere = useLiveQuery(() => db.meta.get('derniere_sync'), []);
  return (
    <Page titre="Synchronisation" retour>
      <div className="grille-kpi">
        <div className={'kpi ' + (e.enLigne ? 'vert' : 'jaune')}><div className="lib">Connexion</div><div className="val">{e.enLigne ? 'En ligne' : 'Hors ligne'}</div><div className="sous">Temps réel : {e.tempsReel ? 'actif' : 'inactif'}</div></div>
        <div className="kpi"><div className="lib">En attente d'envoi</div><div className="val">{e.attente}</div><div className="sous">{fichiers} justificatif(s)</div></div>
        <div className={'kpi' + (e.erreurs ? ' negatif' : '')}><div className="lib">Erreurs</div><div className="val">{e.erreurs}</div></div>
        <div className="kpi"><div className="lib">Dernière synchro</div><div className="val" style={{ fontSize: 14 }}>{dateHeureFr(derniere?.valeur)}</div></div>
      </div>
      {e.message && <Alerte type="rouge">{e.message}</Alerte>}
      <button className="btn plein" onClick={async () => { await synchroniser(); toast('Synchronisation terminée'); }} disabled={e.enCours}>
        <RefreshCw size={17} />{e.enCours ? 'Synchronisation…' : 'Synchroniser maintenant'}
      </button>
      <p className="plus-petit">Les opérations sont enregistrées immédiatement sur le téléphone, même sans Internet, puis envoyées automatiquement dès que la connexion revient. Chaque opération possède un identifiant unique : aucun doublon n'est possible.</p>
      {entrees.length > 0 && <div className="section-titre">Opérations non envoyées</div>}
      {entrees.length > 0 && (
        <div className="liste">
          {entrees.map((x) => (
            <div key={x.seq} className="ligne" style={{ flexWrap: 'wrap' }}>
              <div className="corps">
                <b>{x.op === 'insert' ? 'Ajout' : x.payload.deleted_at ? 'Suppression' : 'Modification'} · {LIBELLES_TABLES[x.table]}</b>
                <small>{dateHeureFr(x.cree_le)} · {nomUtilisateur(t.profils, x.user_id)}</small>
                {x.statut === 'erreur' && <small className="rouge">⚠ {x.erreur}</small>}
              </div>
              {x.statut === 'erreur' ? (
                <div className="actions" style={{ width: '100%' }}>
                  <button className="btn petit second" onClick={() => reessayer(x.seq!)}>Réessayer</button>
                  {x.code === 'P0409' && <button className="btn petit jaune" onClick={() => reessayer(x.seq!, true)}>Imposer ma version</button>}
                  <button className="btn petit danger" onClick={async () => {
                    if (await confirmer(x.code === 'P0409' ? 'Garder la version du serveur et abandonner votre modification ?' : 'Abandonner cette opération ? Elle ne sera pas enregistrée.', 'Abandonner')) annulerEntree(x.seq!);
                  }}>{x.code === 'P0409' ? 'Garder la version serveur' : 'Abandonner'}</button>
                </div>
              ) : <span className="badge jaune">en attente</span>}
            </div>
          ))}
        </div>
      )}
      {entrees.some((x) => x.code === 'P0409') && <Alerte>Conflit : un autre utilisateur a modifié le même enregistrement. Choisissez la version à conserver.</Alerte>}
    </Page>
  );
}

export function Sauvegarde() {
  const toast = useToast();
  const [enCours, setEnCours] = useState(false);
  const exporterTout = async (format: 'xlsx' | 'json') => {
    setEnCours(true);
    try {
      const data: Record<string, any[]> = {};
      for (const tb of TABLES) data[tb] = ((await table(tb).toArray()) as any[]).map(({ _attente, _erreur, ...r }) => r);
      const date = new Date().toISOString().slice(0, 10);
      if (format === 'json') {
        await partagerFichier(`sauvegarde_ansar_${date}.json`, new Blob([JSON.stringify({ version: 1, date: new Date().toISOString(), data }, null, 1)], { type: 'application/json' }));
      } else {
        const feuilles = TABLES.filter((tb) => tb !== 'ae_profils' && data[tb].length).map((tb) => {
          const cles = [...new Set(data[tb].flatMap((r) => Object.keys(r)))];
          return { nom: LIBELLES_TABLES[tb], lignes: data[tb], colonnes: cles.map((k) => ({ titre: k, valeur: (r: any) => (typeof r[k] === 'object' && r[k] !== null ? JSON.stringify(r[k]) : r[k]) })) };
        });
        await partagerFichier(`sauvegarde_ansar_${date}.xlsx`, versExcel(feuilles));
      }
    } catch (e: any) { toast(String(e?.message ?? e), true); }
    setEnCours(false);
  };
  return (
    <Page titre="Sauvegarde" retour>
      <div className="carte">
        <h2>Sauvegarde complète</h2>
        <p className="plus-petit" style={{ marginTop: 0 }}>Les données sont stockées de façon centralisée dans la base Supabase. Vous pouvez en plus télécharger une copie complète à conserver (Google Drive, e-mail…).</p>
        <div className="actions">
          <button className="btn" disabled={enCours} onClick={() => exporterTout('xlsx')}>Excel complet</button>
          <button className="btn second" disabled={enCours} onClick={() => exporterTout('json')}>Fichier JSON</button>
        </div>
      </div>
      <Alerte type="vert">Conseil : faites une sauvegarde au moins une fois par mois.</Alerte>
    </Page>
  );
}

export function Compte() {
  const { profil, deconnexion } = useAuth();
  const toast = useToast();
  const confirmer = useConfirm();
  const [mdp, setMdp] = useState(false);
  const sortir = async () => {
    const r = await deconnexion();
    if (r && (await confirmer(r + ' Se déconnecter quand même ?', 'Se déconnecter'))) await deconnexion(true);
  };
  return (
    <Page titre="Mon compte" retour>
      <div className="carte">
        <dl className="kv">
          <dt>Nom</dt><dd>{profil?.prenom} {profil?.nom}</dd>
          <dt>E-mail</dt><dd>{profil?.email}</dd>
          <dt>Téléphone</dt><dd>{profil?.telephone || '—'}</dd>
          <dt>Rôle</dt><dd>{nomRole(profil?.role ?? '')}</dd>
          <dt>Dernière connexion</dt><dd>{dateHeureFr(profil?.derniere_connexion)}</dd>
        </dl>
      </div>
      {mdp ? <ChangerMotDePasse obligatoire={false} onFini={() => { setMdp(false); toast('Mot de passe modifié'); }} />
        : <button className="btn second plein" onClick={() => setMdp(true)}><Pencil size={16} />Changer mon mot de passe</button>}
      <button className="btn danger plein mt" onClick={sortir}><LogOut size={17} />Se déconnecter</button>
      <button className="btn lien plein mt" onClick={async () => {
        if (await confirmer('Recharger toutes les données depuis le serveur ? Les opérations non envoyées seront perdues.', 'Recharger')) { await viderLocal(); await synchroniser(); toast('Données rechargées'); }
      }}>Réinitialiser les données locales</button>
    </Page>
  );
}
