import type { Couveuse, Espece, Profile } from '../lib/types';
import { STATUTS } from '../lib/calc';
import type { Filtres } from '../lib/filtres';

export default function PanneauFiltres({ f, setF, especes, couveuses, profils, avecStatut = true }: {
  f: Filtres; setF: (f: Filtres) => void; especes: Espece[]; couveuses: Couveuse[]; profils: Profile[]; avecStatut?: boolean;
}) {
  const maj = (p: Partial<Filtres>) => setF({ ...f, ...p });
  return (
    <div>
      <div className="grille-2">
        <div className="champ">
          <label>Espèce</label>
          <select className="entree petite" value={f.espece} onChange={(e) => maj({ espece: e.target.value })}>
            <option value="">Toutes</option>
            {especes.map((e) => <option key={e.id} value={e.nom}>{e.nom}</option>)}
          </select>
        </div>
        <div className="champ">
          <label>Race</label>
          <input className="entree petite" value={f.race} onChange={(e) => maj({ race: e.target.value })} placeholder="Toutes" />
        </div>
        <div className="champ">
          <label>Mise en incubation du</label>
          <input type="date" className="entree petite" value={f.du} onChange={(e) => maj({ du: e.target.value })} />
        </div>
        <div className="champ">
          <label>au</label>
          <input type="date" className="entree petite" value={f.au} onChange={(e) => maj({ au: e.target.value })} />
        </div>
        <div className="champ">
          <label>Couveuse</label>
          <select className="entree petite" value={f.couveuse} onChange={(e) => maj({ couveuse: e.target.value })}>
            <option value="">Toutes</option>
            {couveuses.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
        <div className="champ">
          <label>Responsable</label>
          <select className="entree petite" value={f.responsable} onChange={(e) => maj({ responsable: e.target.value })}>
            <option value="">Tous</option>
            {profils.filter((p) => p.role !== 'en_attente').map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>
        </div>
      </div>
      {avecStatut && (
        <div className="champ">
          <label>Statut</label>
          <select className="entree petite" value={f.statut} onChange={(e) => maj({ statut: e.target.value as Filtres['statut'] })}>
            <option value="">Tous</option>
            {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
