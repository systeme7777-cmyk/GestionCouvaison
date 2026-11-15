import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useCouvaisons, useCouveuses, useOperations } from '../hooks/useData';
import { estActive, fmtPct } from '../lib/calc';
import { supprimer } from '../lib/sync';
import { EnteteRetour, Vide, useDialogs, versTexte } from '../components/ui';
import CarteCouvaison from '../components/CarteCouvaison';
import CouveuseForm from '../components/CouveuseForm';
import { ETATS } from './Couveuses';

export default function CouveuseDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { peutEcrire, estAdmin } = useAuth();
  const { confirmer, toast } = useDialogs();
  const couveuses = useCouveuses();
  const couvaisons = useCouvaisons();
  const ops = useOperations();
  const [form, setForm] = useState(false);
  const cv = couveuses.find((c) => c.id === id);
  if (!cv) return <div className="page"><EnteteRetour titre="Couveuse" retour="/couveuses" /><Vide titre="Couveuse introuvable" /></div>;

  const liste = couvaisons.filter((c) => c.couveuse_id === cv.id).sort((a, b) => b.date_debut.localeCompare(a.date_debut));
  const terminees = liste.filter((c) => c.statut === 'terminee' && c.oeufs_eclos != null);
  const mis = terminees.reduce((s, c) => s + c.nb_oeufs, 0);
  const eclos = terminees.reduce((s, c) => s + (c.oeufs_eclos ?? 0), 0);
  const e = ETATS[cv.etat];

  async function effacer() {
    const enCours = liste.filter(estActive).length;
    const ok = await confirmer({
      titre: 'Supprimer cette couveuse ?',
      message: `${cv!.nom} sera supprimée. ${liste.length ? `Les ${liste.length} couvaison(s) associée(s) seront conservées sans couveuse.` : ''}${enCours ? ` Attention : ${enCours} couvaison(s) en cours l'utilisent.` : ''}`,
    });
    if (!ok) return;
    await supprimer('couveuses', cv!.id);
    toast('Couveuse supprimée');
    nav('/couveuses', { replace: true });
  }

  return (
    <div className="page">
      <EnteteRetour titre={cv.nom} retour="/couveuses" droite={peutEcrire ? <button className="btn-rond" aria-label="Modifier" onClick={() => setForm(true)}><Pencil size={18} /></button> : undefined} />
      <div className="carte">
        <div className="entre"><span className="gris petit">{cv.type ?? 'Type non précisé'}</span><span className={`badge ${e.couleur}`}>{e.texte}</span></div>
        <div className="grille-3 mt">
          <div><div className="petit gris">Capacité</div><div className="gras">{cv.capacite} œufs</div></div>
          <div><div className="petit gris">Température</div><div className="gras">{cv.temperature != null ? `${versTexte(cv.temperature)} °C` : '—'}</div></div>
          <div><div className="petit gris">Humidité</div><div className="gras">{cv.humidite != null ? `${versTexte(cv.humidite)} %` : '—'}</div></div>
        </div>
        {cv.notes && <div className="petit mt" style={{ whiteSpace: 'pre-wrap' }}>{cv.notes}</div>}
      </div>
      <div className="grille-3 mt">
        <div className="kpi compact"><div className="label">Couvaisons</div><div className="valeur">{liste.length}</div></div>
        <div className="kpi compact"><div className="label">Poussins</div><div className="valeur">{eclos}</div></div>
        <div className="kpi compact"><div className="label">Éclosion</div><div className="valeur">{fmtPct(mis ? (eclos / mis) * 100 : null)}</div></div>
      </div>
      <div className="section-titre"><h2>Historique des couvaisons</h2></div>
      {liste.length === 0 ? <div className="carte"><Vide titre="Aucune couvaison dans cette couveuse" /></div>
        : liste.map((c) => <CarteCouvaison key={c.id} c={c} ops={ops} couveuses={couveuses} />)}
      {estAdmin && <button className="btn danger-leger plein mt" onClick={effacer}><Trash2 size={16} /> Supprimer la couveuse</button>}
      {form && <CouveuseForm couveuse={cv} onFermer={() => setForm(false)} />}
    </div>
  );
}
