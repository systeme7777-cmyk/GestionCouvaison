import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Thermometer } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useCouvaisons, useCouveuses } from '../hooks/useData';
import { estActive, oeufsEnCours } from '../lib/calc';
import { Barre, EnteteRetour, Vide, versTexte } from '../components/ui';
import CouveuseForm from '../components/CouveuseForm';

export const ETATS = {
  disponible: { texte: 'Disponible', couleur: 'vert' },
  occupee: { texte: 'Occupée', couleur: 'orange' },
  maintenance: { texte: 'Maintenance', couleur: 'rouge' },
} as const;

export default function Couveuses() {
  const { peutEcrire } = useAuth();
  const couveuses = useCouveuses();
  const couvaisons = useCouvaisons();
  const [form, setForm] = useState(false);

  return (
    <div className="page">
      <EnteteRetour titre="Couveuses" retour="/" droite={peutEcrire ? <button className="btn-rond" aria-label="Ajouter" onClick={() => setForm(true)}><Plus size={20} /></button> : undefined} />
      {couveuses.length === 0 ? (
        <div className="carte"><Vide titre="Aucune couveuse" texte="Ajoutez vos couveuses pour les associer aux couvaisons." icone={<Thermometer size={30} />} /></div>
      ) : couveuses.map((cv) => {
        const actives = couvaisons.filter((c) => c.couveuse_id === cv.id && estActive(c));
        const oeufs = actives.reduce((s, c) => s + oeufsEnCours(c), 0);
        const pct = cv.capacite ? (oeufs / cv.capacite) * 100 : 0;
        const e = ETATS[cv.etat];
        return (
          <Link key={cv.id} to={`/couveuses/${cv.id}`} className="couv-carte">
            <div className="haut">
              <span className={`icone-oeuf ${e.couleur}`}><Thermometer size={20} /></span>
              <div style={{ flex: 1 }}>
                <div className="gras">{cv.nom}</div>
                <div className="gris petit">
                  {[cv.type, cv.temperature != null ? `${versTexte(cv.temperature)} °C` : null, cv.humidite != null ? `${versTexte(cv.humidite)} %` : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span className={`badge ${e.couleur}`}>{e.texte}</span>
            </div>
            <Barre valeur={pct} couleur={pct > 100 ? 'rouge' : ''} />
            <div className="bas"><span>{actives.length} lot(s) en cours</span><b>{oeufs} / {cv.capacite} œufs</b></div>
          </Link>
        );
      })}
      {peutEcrire && <button className="btn pointille vert plein mt" onClick={() => setForm(true)}><Plus size={18} /> Ajouter une couveuse</button>}
      {form && <CouveuseForm onFermer={() => setForm(false)} />}
    </div>
  );
}
