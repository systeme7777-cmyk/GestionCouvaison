import { useLiveQuery } from 'dexie-react-hooks';
import { History } from 'lucide-react';
import { useMemo, useState } from 'react';
import { nomProduit } from '../components/Selecteurs';
import { Feuille, MenuExport, Page, Puces, Recherche, Vide } from '../components/ui';
import { nomUtilisateur, useTout, type Tout } from '../hooks/useData';
import { actifs } from '../lib/calc';
import { db } from '../lib/db';
import { exporter } from '../lib/export';
import { dateHeureFr, normaliser } from '../lib/format';
import { LIBELLES_TABLES, type JournalEntree } from '../lib/types';

const ACTIONS: Record<string, string> = {
  creation: 'Création', modification: 'Modification', suppression: 'Suppression', restauration: 'Restauration',
  suppression_definitive: 'Suppression définitive', reinitialisation_acces: 'Réinitialisation d\'accès',
};
const CHAMPS: Record<string, string> = {
  date: 'Date', quantite: 'Quantité', prix_unitaire: 'Prix unitaire', montant: 'Montant', montant_paye: 'Montant payé',
  montant_encaisse: 'Montant encaissé', nom: 'Nom', produit_id: 'Produit', client_nom: 'Client', fournisseur_nom: 'Fournisseur',
  categorie: 'Catégorie', description: 'Description', observations: 'Observations', mode_paiement: 'Mode de paiement',
  valide: 'Validée', oeufs_pondus: 'Œufs pondus', role: 'Rôle', actif: 'Actif', permissions: 'Permissions', effectif_initial: 'Effectif initial',
  deleted_at: 'Supprimé le', statut: 'Statut', seuil_alerte: "Seuil d'alerte", type: 'Type', telephone: 'Téléphone',
};

function resume(t: Tout, j: JournalEntree): string {
  const d = j.donnees ?? j.anciennes ?? {};
  const parts: string[] = [];
  if (d.produit_id) parts.push(nomProduit(t, d.produit_id));
  if (d.quantite !== undefined && d.quantite !== null) parts.push(`qté ${d.quantite}`);
  if (d.montant !== undefined) parts.push(`${d.montant}`);
  if (d.nom) parts.push(d.nom);
  if (d.categorie) parts.push(d.categorie);
  if (d.client_nom) parts.push(d.client_nom);
  if (d.fournisseur_nom) parts.push(d.fournisseur_nom);
  if (d.cle) parts.push(d.cle);
  if (d.email && j.table_nom === 'ae_profils') parts.push(d.email);
  return parts.join(' · ');
}

function valeurLisible(t: Tout, k: string, v: any) {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'produit_id') return nomProduit(t, v);
  if (k.endsWith('_id')) return '…';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 80);
  return String(v);
}

export function Historique() {
  const t = useTout();
  const journal = useLiveQuery(() => db.journal.orderBy('id').reverse().limit(5000).toArray(), []) ?? [];
  const [q, setQ] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [user, setUser] = useState('');
  const [table, setTable] = useState('');
  const [action, setAction] = useState('');
  const [espece, setEspece] = useState('');
  const [produit, setProduit] = useState('');
  const [detail, setDetail] = useState<JournalEntree | null>(null);

  const liste = useMemo(() => journal.filter((j) => {
    const d = j.donnees ?? j.anciennes ?? {};
    const jour = j.fait_le.slice(0, 10);
    return (!du || jour >= du) && (!au || jour <= au) && (!user || j.user_id === user) && (!table || j.table_nom === table)
      && (!action || j.action === action) && (!espece || d.espece_id === espece) && (!produit || d.produit_id === produit)
      && (!q || normaliser(`${resume(t, j)} ${LIBELLES_TABLES[j.table_nom]} ${nomUtilisateur(t.profils, j.user_id)}`).includes(normaliser(q)));
  }).slice(0, 500), [journal, q, du, au, user, table, action, espece, produit, t]);

  const exp = (f: 'pdf' | 'xlsx' | 'csv') => exporter(f, 'historique', 'Historique des opérations', liste, [
    { titre: 'Date et heure', valeur: (j) => dateHeureFr(j.fait_le), brut: (j) => j.fait_le },
    { titre: 'Utilisateur', valeur: (j) => nomUtilisateur(t.profils, j.user_id) },
    { titre: 'Opération', valeur: (j) => ACTIONS[j.action] ?? j.action },
    { titre: 'Rubrique', valeur: (j) => LIBELLES_TABLES[j.table_nom] ?? j.table_nom },
    { titre: 'Détail', valeur: (j) => resume(t, j) },
  ]);

  return (
    <Page titre="Historique" sousTitre={`${liste.length} opération(s) affichée(s)`}>
      <div className="outils"><Recherche valeur={q} onChange={setQ} /><MenuExport onExport={exp} /></div>
      <Puces valeur={action} onChange={setAction} options={[{ v: '', t: 'Toutes' }, { v: 'creation', t: 'Créations' }, { v: 'modification', t: 'Modifications' }, { v: 'suppression', t: 'Suppressions' }]} />
      <div className="filtres-grille">
        <input className="saisie" type="date" value={du} onChange={(e) => setDu(e.target.value)} aria-label="Du" />
        <input className="saisie" type="date" value={au} onChange={(e) => setAu(e.target.value)} aria-label="Au" />
        <select className="saisie" value={user} onChange={(e) => setUser(e.target.value)} aria-label="Utilisateur">
          <option value="">Tous les utilisateurs</option>{t.profils.map((p) => <option key={p.id} value={p.id}>{nomUtilisateur(t.profils, p.id)}</option>)}
        </select>
        <select className="saisie" value={table} onChange={(e) => setTable(e.target.value)} aria-label="Rubrique">
          <option value="">Toutes les rubriques</option>{Object.entries(LIBELLES_TABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="saisie" value={espece} onChange={(e) => setEspece(e.target.value)} aria-label="Espèce">
          <option value="">Toutes les espèces</option>{actifs(t.especes).map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
        </select>
        <select className="saisie" value={produit} onChange={(e) => setProduit(e.target.value)} aria-label="Produit">
          <option value="">Tous les produits</option>{actifs(t.produits).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
      </div>
      {liste.length === 0 ? <Vide texte="Aucune opération (l'historique se remplit après synchronisation)." /> : (
        <div className="liste">
          {liste.map((j) => (
            <button key={j.id} className="ligne" onClick={() => setDetail(j)}>
              <div className="ico-rond"><History size={17} /></div>
              <div className="corps">
                <b>{ACTIONS[j.action] ?? j.action} · {LIBELLES_TABLES[j.table_nom] ?? j.table_nom}</b>
                <small>{resume(t, j) || '—'}</small>
                <small>{nomUtilisateur(t.profils, j.user_id)} · {dateHeureFr(j.fait_le)}</small>
              </div>
              <div className="fin">
                <span className={'badge ' + (j.action === 'creation' ? '' : j.action === 'modification' ? 'bleu' : 'rouge')}>{ACTIONS[j.action]?.slice(0, 5) ?? ''}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      {detail && (
        <Feuille titre={`${ACTIONS[detail.action] ?? detail.action} — ${LIBELLES_TABLES[detail.table_nom] ?? ''}`} onFermer={() => setDetail(null)}>
          <dl className="kv">
            <dt>Utilisateur</dt><dd>{nomUtilisateur(t.profils, detail.user_id)}</dd>
            <dt>Date et heure</dt><dd>{dateHeureFr(detail.fait_le)}</dd>
          </dl>
          {detail.action === 'modification' && detail.anciennes && (
            <>
              <div className="section-titre">Modifications</div>
              <table className="tableau">
                <thead><tr><th>Champ</th><th>Avant</th><th>Après</th></tr></thead>
                <tbody>{Object.keys(detail.anciennes).filter((k) => !['updated_at', 'updated_by'].includes(k)).map((k) => (
                  <tr key={k}><td>{CHAMPS[k] ?? k}</td><td>{valeurLisible(t, k, detail.anciennes[k])}</td><td>{valeurLisible(t, k, detail.donnees?.[k])}</td></tr>
                ))}</tbody>
              </table>
            </>
          )}
          {detail.donnees && detail.action !== 'modification' && (
            <>
              <div className="section-titre">Données</div>
              <table className="tableau"><tbody>
                {Object.entries(detail.donnees).filter(([k, v]) => v !== null && !['id', 'created_at', 'updated_at', 'created_by', 'updated_by'].includes(k)).map(([k, v]) => (
                  <tr key={k}><td>{CHAMPS[k] ?? k}</td><td>{valeurLisible(t, k, v)}</td></tr>
                ))}
              </tbody></table>
            </>
          )}
        </Feuille>
      )}
    </Page>
  );
}
