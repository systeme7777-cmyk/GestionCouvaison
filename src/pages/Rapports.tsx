import { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { useCouvaisons, useCouveuses, useEspeces, useProfils } from '../hooks/useData';
import { FILTRES_VIDES, decrireFiltres, filtrer, trier, type Filtres } from '../lib/filtres';
import { exporterExcel, exporterPDF } from '../lib/export';
import { db } from '../lib/db';
import { STATUTS, suivi } from '../lib/calc';
import { fmtCourt } from '../lib/dates';
import PanneauFiltres from '../components/PanneauFiltres';
import { EnteteRetour, useDialogs } from '../components/ui';

export default function Rapports() {
  const { toast } = useDialogs();
  const couvaisons = useCouvaisons();
  const especes = useEspeces();
  const couveuses = useCouveuses();
  const profils = useProfils();
  const [f, setF] = useState<Filtres>(FILTRES_VIDES);
  const [enCours, setEnCours] = useState<'pdf' | 'xlsx' | null>(null);

  const noms = useMemo(() => ({
    couveuse: (id: string | null) => couveuses.find((c) => c.id === id)?.nom ?? '',
    responsable: (id: string | null) => profils.find((p) => p.id === id)?.nom ?? '',
  }), [couveuses, profils]);
  const liste = trier(filtrer(couvaisons, f, noms), true);

  async function exporter(type: 'pdf' | 'xlsx') {
    if (!liste.length) { toast('Aucune couvaison à exporter', true); return; }
    setEnCours(type);
    try {
      const [operations, mesures, mirages] = await Promise.all([db.operations.toArray(), db.mesures.toArray(), db.mirages.toArray()]);
      const ctx = { profils, couveuses, operations, mesures, mirages };
      if (type === 'pdf') await exporterPDF(liste, ctx, decrireFiltres(f, noms as any));
      else await exporterExcel(liste, ctx);
    } catch (e: any) {
      if (!String(e?.message ?? e).toLowerCase().includes('cancel')) toast(`Export impossible : ${e.message ?? e}`, true);
    } finally {
      setEnCours(null);
    }
  }

  return (
    <div className="page">
      <EnteteRetour titre="Rapports et exports" retour="/" />
      <div className="carte">
        <div className="champ">
          <label>Recherche (n°, lot, race…)</label>
          <input className="entree petite" value={f.texte} onChange={(e) => setF({ ...f, texte: e.target.value })} />
        </div>
        <PanneauFiltres f={f} setF={setF} especes={especes} couveuses={couveuses} profils={profils} />
        <button className="btn petit" onClick={() => setF(FILTRES_VIDES)}>Réinitialiser les filtres</button>
      </div>
      <div className="rangee-btn mt">
        <button className="btn primaire" disabled={!!enCours} onClick={() => exporter('pdf')}>
          {enCours === 'pdf' ? <Loader2 size={18} className="tourne" /> : <FileText size={18} />} PDF
        </button>
        <button className="btn primaire" disabled={!!enCours} onClick={() => exporter('xlsx')}>
          {enCours === 'xlsx' ? <Loader2 size={18} className="tourne" /> : <FileSpreadsheet size={18} />} Excel
        </button>
      </div>
      <div className="petit gris mt-s">Le fichier Excel contient 4 feuilles : couvaisons, opérations, suivi journalier et mirages.</div>
      <div className="section-titre"><h2>{liste.length} couvaison(s)</h2></div>
      <div className="carte liste">
        {liste.slice(0, 100).map((c) => {
          const s = suivi(c);
          return (
            <div key={c.id} className="ligne">
              <div className="corps">
                <div className="titre">{c.numero ?? '—'} · {c.nom_lot || c.espece}</div>
                <div className="sous">{c.espece}{c.race ? ` ${c.race}` : ''} · {fmtCourt(c.date_debut)} · {c.nb_oeufs} œufs · {noms.couveuse(c.couveuse_id) || 'sans couveuse'}</div>
              </div>
              <span className="badge gris">{STATUTS[s.statut]}</span>
            </div>
          );
        })}
        {liste.length === 0 && <div className="vide">Aucune couvaison ne correspond.</div>}
      </div>
    </div>
  );
}
