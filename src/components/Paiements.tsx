import { Camera, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Tout } from '../hooks/useData';
import { nomUtilisateur, listeParam } from '../hooks/useData';
import { actifs } from '../lib/calc';
import { db } from '../lib/db';
import { argent, aujourdhui, dateFr } from '../lib/format';
import { ajouterJustificatif, enregistrer, supprimer } from '../lib/repo';
import { supabase } from '../lib/supabase';
import { Choix, DateChamp, Feuille, Nombre, Texte, useConfirm, useToast } from './ui';

export const MODES_DEFAUT = ['Espèces', 'Mobile Money', 'Virement bancaire', 'Chèque', 'Crédit'];

export function ChoixMode({ t, valeur, onChange, label = 'Mode de paiement' }: { t: Tout; valeur?: string | null; onChange: (v: string) => void; label?: string }) {
  const modes = listeParam(t, 'modes_paiement', MODES_DEFAUT);
  return <Choix label={label} valeur={valeur ?? ''} vide="—" options={modes.map((m) => ({ v: m, t: m }))} onChange={onChange} />;
}

/** Liste et ajout de paiements ultérieurs (encaissements clients / règlements fournisseurs) */
export function BlocPaiements({ t, type, venteId, achatId, reste, peutAjouter, peutSupprimer }: {
  t: Tout; type: 'encaissement' | 'decaissement'; venteId?: string; achatId?: string; reste: number;
  peutAjouter: boolean; peutSupprimer: boolean;
}) {
  const toast = useToast();
  const confirmer = useConfirm();
  const [ouvert, setOuvert] = useState(false);
  const [montant, setMontant] = useState<number | ''>(reste);
  const [date, setDate] = useState(aujourdhui());
  const [mode, setMode] = useState('Espèces');
  const [obs, setObs] = useState('');
  const liste = actifs(t.paiements).filter((p) => (venteId && p.vente_id === venteId) || (achatId && p.achat_id === achatId))
    .sort((a, b) => b.date.localeCompare(a.date));
  const valider = async () => {
    const m = Number(montant || 0);
    if (m <= 0) return toast('Montant invalide.', true);
    if (m > reste + 0.001) return toast(`Le reste dû est de ${argent(reste)}.`, true);
    await enregistrer('ae_paiements', { type, vente_id: venteId ?? null, achat_id: achatId ?? null, montant: m, date, mode_paiement: mode, observations: obs || null });
    toast(type === 'encaissement' ? 'Encaissement enregistré' : 'Paiement enregistré');
    setOuvert(false);
  };
  return (
    <div className="carte">
      <h2>{type === 'encaissement' ? 'Encaissements ultérieurs' : 'Paiements ultérieurs'}
        {peutAjouter && reste > 0 && <button className="btn petit droite" onClick={() => { setMontant(reste); setOuvert(true); }}>+ Ajouter</button>}
      </h2>
      {liste.length === 0 ? <p className="plus-petit" style={{ margin: 0 }}>Aucun.</p> : liste.map((p) => (
        <div key={p.id} className="ligne" style={{ padding: '8px 0' }}>
          <div className="corps"><b>{argent(p.montant)}</b><small>{dateFr(p.date)} · {p.mode_paiement ?? ''} · {nomUtilisateur(t.profils, p.created_by)}{p._attente ? ' · en attente' : ''}</small>
            {p._erreur && <small className="rouge">{p._erreur}</small>}</div>
          {peutSupprimer && <button className="btn lien" aria-label="Supprimer" onClick={async () => {
            if (await confirmer('Supprimer ce paiement ?', 'Supprimer')) await supprimer('ae_paiements', p.id);
          }}><Trash2 size={16} /></button>}
        </div>
      ))}
      {ouvert && (
        <Feuille titre={type === 'encaissement' ? 'Encaisser un paiement' : 'Payer le fournisseur'} onFermer={() => setOuvert(false)}>
          <div className="recap"><div><span>Reste dû</span><b>{argent(reste)}</b></div></div>
          <div className="deux">
            <Nombre label="Montant" valeur={montant} onChange={setMontant} />
            <DateChamp label="Date" valeur={date} onChange={setDate} />
          </div>
          <ChoixMode t={t} valeur={mode} onChange={setMode} />
          <Texte label="Observations" valeur={obs} onChange={setObs} />
          <button className="btn plein" onClick={valider}>Enregistrer</button>
        </Feuille>
      )}
    </div>
  );
}

/** Sélection d'une photo / facture (appareil photo ou galerie) */
export function ChampPhoto({ fichier, onChange, existant }: { fichier: File | null; onChange: (f: File | null) => void; existant?: string | null }) {
  return (
    <div className="champ">
      <label>Photo ou facture (facultatif)</label>
      <label className="btn second plein" style={{ cursor: 'pointer' }}>
        <Camera size={18} />{fichier ? fichier.name : existant ? 'Remplacer le justificatif' : 'Prendre une photo / choisir'}
        <input type="file" accept="image/*,application/pdf" capture="environment" style={{ display: 'none' }}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      </label>
      {existant && !fichier && <div className="aide">Un justificatif est déjà joint.</div>}
    </div>
  );
}

export async function enregistrerPhoto(dossier: string, id: string, f: File | null) {
  if (!f) return undefined;
  return ajouterJustificatif(dossier, id, f);
}

export function VoirJustificatif({ path }: { path: string }) {
  const toast = useToast();
  const ouvrir = async () => {
    const local = await db.fichiers.get(path);
    if (local) { window.open(URL.createObjectURL(local.blob), '_blank'); return; }
    const { data, error } = await supabase.storage.from('ae-justificatifs').createSignedUrl(path, 600);
    if (error || !data) return toast('Justificatif indisponible hors connexion.', true);
    window.open(data.signedUrl, '_blank');
  };
  return <button className="btn second petit" onClick={ouvrir}><Camera size={15} />Voir le justificatif</button>;
}
