import { useState } from 'react';
import type { Couvaison, Operation, TypeOperation } from '../lib/types';
import { TYPES_OPERATION } from '../lib/types';
import { estActive } from '../lib/calc';
import { today } from '../lib/dates';
import { ajouter, modifier } from '../lib/sync';
import { Bascule, Feuille, useDialogs } from './ui';

export default function OperationForm({ op, couvaisonId, couvaisons, dateDefaut, onFermer }: {
  op?: Operation;
  couvaisonId?: string;
  couvaisons?: Couvaison[];
  dateDefaut?: string;
  onFermer: () => void;
}) {
  const { toast } = useDialogs();
  const [couv, setCouv] = useState(op?.couvaison_id ?? couvaisonId ?? '');
  const [type, setType] = useState<TypeOperation>(op?.type ?? 'mirage');
  const [titre, setTitre] = useState(op?.titre ?? '');
  const [date, setDate] = useState(op?.date_prevue ?? dateDefaut ?? today());
  const [heure, setHeure] = useState(op?.heure?.slice(0, 5) ?? '08:00');
  const [rappel, setRappel] = useState(op?.rappel ?? true);
  const [notes, setNotes] = useState(op?.notes ?? '');
  const [erreur, setErreur] = useState('');

  const choix = (couvaisons ?? []).filter((c) => estActive(c) || c.id === couv);

  async function enregistrer() {
    if (!couv) { setErreur('Choisissez la couvaison concernée.'); return; }
    if (!date) { setErreur('Choisissez une date.'); return; }
    const libelle = titre.trim() || TYPES_OPERATION.find((t) => t.value === type)!.label;
    const data = { couvaison_id: couv, type, titre: libelle, date_prevue: date, heure: heure || null, rappel, notes: notes.trim() || null };
    if (op) {
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        const avant = k === 'heure' ? op.heure?.slice(0, 5) ?? null : (op as any)[k];
        if (avant !== v) patch[k] = v;
      }
      if (Object.keys(patch).length) await modifier('operations', op.id, patch);
      toast('Opération modifiée');
    } else {
      await ajouter('operations', { ...data, fait: false, auto: false });
      toast('Opération planifiée');
    }
    onFermer();
  }

  return (
    <Feuille titre={op ? "Modifier l'opération" : 'Planifier une opération'} onFermer={onFermer}>
      {erreur && <div className="erreurs">{erreur}</div>}
      {!couvaisonId && (
        <div className="champ">
          <label>Couvaison</label>
          <select className="entree" value={couv} onChange={(e) => setCouv(e.target.value)}>
            <option value="">— Choisir —</option>
            {choix.map((c) => <option key={c.id} value={c.id}>{c.nom_lot || c.numero} ({c.espece})</option>)}
          </select>
        </div>
      )}
      <div className="champ">
        <label>Type d'opération</label>
        <select className="entree" value={type} onChange={(e) => setType(e.target.value as TypeOperation)}>
          {TYPES_OPERATION.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className="champ">
        <label>Intitulé (facultatif)</label>
        <input className="entree" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder={TYPES_OPERATION.find((t) => t.value === type)?.label} />
      </div>
      <div className="grille-2">
        <div className="champ"><label>Date</label><input type="date" className="entree" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="champ"><label>Heure du rappel</label><input type="time" className="entree" value={heure} onChange={(e) => setHeure(e.target.value)} /></div>
      </div>
      <div className="carte mb">
        <div className="interrupteur">
          <div><div className="titre">Rappel sur le téléphone</div><div className="sous">Notification à la date et l'heure choisies</div></div>
          <Bascule on={rappel} onChange={setRappel} label="Rappel" />
        </div>
      </div>
      <div className="champ"><label>Notes</label><textarea className="entree" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <div className="rangee-btn">
        <button className="btn" onClick={onFermer}>Annuler</button>
        <button className="btn primaire" onClick={enregistrer}>Enregistrer</button>
      </div>
    </Feuille>
  );
}
