import { useState } from 'react';
import type { Couveuse, EtatCouveuse } from '../lib/types';
import { ajouter, modifier } from '../lib/sync';
import { Feuille, entierOuNull, nombreOuNull, useDialogs, versTexte } from './ui';

const TYPES = ['Automatique', 'Semi-automatique', 'Manuelle', 'Éclosoir', 'Couveuse naturelle (poule)', 'Autre'];

export default function CouveuseForm({ couveuse, onFermer }: { couveuse?: Couveuse; onFermer: () => void }) {
  const { toast } = useDialogs();
  const [nom, setNom] = useState(couveuse?.nom ?? '');
  const [capacite, setCapacite] = useState(couveuse ? String(couveuse.capacite) : '');
  const [type, setType] = useState(couveuse?.type ?? 'Automatique');
  const [temp, setTemp] = useState(versTexte(couveuse?.temperature));
  const [hum, setHum] = useState(versTexte(couveuse?.humidite));
  const [etat, setEtat] = useState<EtatCouveuse>(couveuse?.etat ?? 'disponible');
  const [notes, setNotes] = useState(couveuse?.notes ?? '');
  const [erreur, setErreur] = useState('');

  async function valider() {
    if (!nom.trim()) { setErreur('Indiquez le nom ou le numéro de la couveuse.'); return; }
    const cap = entierOuNull(capacite);
    if (cap == null || cap < 0) { setErreur('Indiquez la capacité maximale (nombre d’œufs).'); return; }
    const t = nombreOuNull(temp), h = nombreOuNull(hum);
    if (t != null && (t < 20 || t > 45)) { setErreur('Température de consigne invraisemblable (20 à 45 °C).'); return; }
    if (h != null && (h < 0 || h > 100)) { setErreur("L'humidité doit être entre 0 et 100 %."); return; }
    const data = { nom: nom.trim(), capacite: cap, type: type || null, temperature: t, humidite: h, etat, notes: notes.trim() || null };
    if (couveuse) {
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) if ((couveuse as any)[k] !== v) patch[k] = v;
      if (Object.keys(patch).length) await modifier('couveuses', couveuse.id, patch);
      toast('Couveuse modifiée');
    } else {
      await ajouter('couveuses', data);
      toast('Couveuse ajoutée');
    }
    onFermer();
  }

  return (
    <Feuille titre={couveuse ? 'Modifier la couveuse' : 'Nouvelle couveuse'} onFermer={onFermer}>
      {erreur && <div className="erreurs">{erreur}</div>}
      <div className="champ"><label>Nom ou numéro</label><input className="entree" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. : Couveuse 1" /></div>
      <div className="grille-2">
        <div className="champ"><label>Capacité max. (œufs)</label><input className="entree" inputMode="numeric" value={capacite} onChange={(e) => setCapacite(e.target.value.replace(/\D/g, ''))} /></div>
        <div className="champ"><label>Type</label>
          <select className="entree" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
            {type && !TYPES.includes(type) && <option>{type}</option>}
          </select>
        </div>
        <div className="champ"><label>Température (°C)</label><input className="entree" inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="37,7" /></div>
        <div className="champ"><label>Humidité (%)</label><input className="entree" inputMode="decimal" value={hum} onChange={(e) => setHum(e.target.value)} placeholder="55" /></div>
      </div>
      <div className="champ"><label>État</label>
        <select className="entree" value={etat} onChange={(e) => setEtat(e.target.value as EtatCouveuse)}>
          <option value="disponible">Disponible</option>
          <option value="occupee">Occupée</option>
          <option value="maintenance">En maintenance</option>
        </select>
        <div className="aide">L'état passe automatiquement à « occupée » / « disponible » selon les couvaisons en cours (sauf en maintenance).</div>
      </div>
      <div className="champ"><label>Notes</label><textarea className="entree" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <div className="rangee-btn">
        <button className="btn" onClick={onFermer}>Annuler</button>
        <button className="btn primaire" onClick={valider}>Enregistrer</button>
      </div>
    </Feuille>
  );
}
