import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useCouvaisons, useCouveuses, useEnAttente, useEspeces, useOperations, useProfils } from '../hooks/useData';
import { FILTRES_VIDES, filtrer, separer, trier, type Filtres } from '../lib/filtres';
import CarteCouvaison from '../components/CarteCouvaison';
import PanneauFiltres from '../components/PanneauFiltres';
import { Feuille, Vide } from '../components/ui';

export default function Couvaisons() {
  const [params, setParams] = useSearchParams();
  const vue = params.get('vue') === 'historique' ? 'historique' : 'enCours';
  const couvaisons = useCouvaisons();
  const ops = useOperations();
  const especes = useEspeces();
  const couveuses = useCouveuses();
  const profils = useProfils();
  const enAttente = useEnAttente();
  const [f, setF] = useState<Filtres>(FILTRES_VIDES);
  const [panneau, setPanneau] = useState(false);

  const noms = useMemo(() => ({
    couveuse: (id: string | null) => couveuses.find((c) => c.id === id)?.nom ?? '',
    responsable: (id: string | null) => profils.find((p) => p.id === id)?.nom ?? '',
  }), [couveuses, profils]);

  const filtrees = filtrer(couvaisons, f, noms);
  const { enCours, historique } = separer(filtrees);
  const liste = trier(vue === 'historique' ? historique : enCours, vue === 'historique');
  const nbAvances = [f.race, f.du, f.au, f.couveuse, f.responsable, f.statut].filter(Boolean).length;
  const especesUtilisees = especes.filter((e) => couvaisons.some((c) => c.espece === e.nom) || e.nom !== 'Autre');

  return (
    <div className="page">
      <h1 className="page-titre mb">Couvaisons</h1>
      <div className="flex">
        <label className="recherche" style={{ flex: 1 }}>
          <Search size={20} color="#646b66" />
          <input value={f.texte} onChange={(e) => setF({ ...f, texte: e.target.value })} placeholder="Rechercher un lot, un n°, une race…" />
          {f.texte && <button className="btn-rond" style={{ width: 28, height: 28, border: 0 }} onClick={() => setF({ ...f, texte: '' })} aria-label="Effacer"><X size={16} /></button>}
        </label>
        <button className="btn-rond" style={{ width: 50, height: 50, borderRadius: 14, background: nbAvances ? 'var(--vert-clair)' : undefined }} onClick={() => setPanneau(true)} aria-label="Filtres">
          <SlidersHorizontal size={20} />{nbAvances > 0 && <span className="pastille" />}
        </button>
      </div>
      <div className="puces">
        <button className={`puce ${f.espece === '' ? 'active' : ''}`} onClick={() => setF({ ...f, espece: '' })}>Toutes</button>
        {especesUtilisees.map((e) => (
          <button key={e.id} className={`puce ${f.espece === e.nom ? 'active' : ''}`} onClick={() => setF({ ...f, espece: e.nom })}>{e.nom}</button>
        ))}
      </div>
      <div className="onglets">
        <button className={vue === 'enCours' ? 'actif' : ''} onClick={() => setParams({})}>En cours ({enCours.length})</button>
        <button className={vue === 'historique' ? 'actif' : ''} onClick={() => setParams({ vue: 'historique' })}>Historique ({historique.length})</button>
      </div>
      {nbAvances > 0 && (
        <div className="entre mb petit">
          <span className="gris">{liste.length} résultat(s) avec {nbAvances} filtre(s)</span>
          <button className="btn petit" onClick={() => setF({ ...FILTRES_VIDES, texte: f.texte })}>Effacer les filtres</button>
        </div>
      )}
      {liste.length === 0
        ? <div className="carte"><Vide titre={couvaisons.length ? 'Aucun résultat' : 'Aucune couvaison'} texte={couvaisons.length ? 'Modifiez la recherche ou les filtres.' : 'Créez votre première couvaison avec le bouton +.'} /></div>
        : liste.map((c) => <CarteCouvaison key={c.id} c={c} ops={ops} couveuses={couveuses} enAttente={enAttente.has(c.id)} />)}

      {panneau && (
        <Feuille titre="Filtrer les couvaisons" onFermer={() => setPanneau(false)}>
          <PanneauFiltres f={f} setF={setF} especes={especes} couveuses={couveuses} profils={profils} />
          <div className="rangee-btn">
            <button className="btn" onClick={() => setF({ ...FILTRES_VIDES, texte: f.texte, espece: f.espece })}>Réinitialiser</button>
            <button className="btn primaire" onClick={() => setPanneau(false)}>Voir {liste.length} résultat(s)</button>
          </div>
        </Feuille>
      )}
    </div>
  );
}
