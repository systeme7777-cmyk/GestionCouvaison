import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Minus, Plus, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useCouvaison, useCouvaisons, useCouveuses, useEspeces, useOperations, useProfils } from '../hooks/useData';
import { addDays, fmtCourtAnnee, today } from '../lib/dates';
import { estActive, oeufsEnCours, planOperations } from '../lib/calc';
import { ajouter, modifier } from '../lib/sync';
import type { Couvaison, StatutStocke } from '../lib/types';
import { Bascule, Chargement, entierOuNull, useDialogs } from '../components/ui';

export default function CouvaisonForm() {
  const { id } = useParams();
  const edition = !!id;
  const existante = useCouvaison(id);
  const nav = useNavigate();
  const { profil, peutEcrire } = useAuth();
  const { toast, confirmer } = useDialogs();
  const especes = useEspeces();
  const couveuses = useCouveuses();
  const profils = useProfils();
  const couvaisons = useCouvaisons();
  const opsCouv = useOperations(id);

  const [espece, setEspece] = useState('');
  const [especeLibre, setEspeceLibre] = useState('');
  const [nomLot, setNomLot] = useState('');
  const [race, setRace] = useState('');
  const [nbOeufs, setNbOeufs] = useState('');
  const [dateDebut, setDateDebut] = useState(today());
  const [duree, setDuree] = useState('');
  const [couveuseId, setCouveuseId] = useState('');
  const [responsableId, setResponsableId] = useState('');
  const [observations, setObservations] = useState('');
  const [rappels, setRappels] = useState(true);
  const [preparation, setPreparation] = useState(false);
  const [planifier, setPlanifier] = useState(true);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [initialise, setInitialise] = useState(false);

  // Valeurs initiales
  useEffect(() => {
    if (initialise) return;
    if (edition) {
      if (!existante || !especes.length) return;
      const connue = especes.some((e) => e.nom === existante.espece);
      setEspece(connue ? existante.espece : 'Autre');
      setEspeceLibre(connue ? '' : existante.espece);
      setNomLot(existante.nom_lot ?? '');
      setRace(existante.race ?? '');
      setNbOeufs(String(existante.nb_oeufs));
      setDateDebut(existante.date_debut);
      setDuree(String(existante.duree_jours));
      setCouveuseId(existante.couveuse_id ?? '');
      setResponsableId(existante.responsable_id ?? '');
      setObservations(existante.observations ?? '');
      setRappels(existante.rappels_actifs);
      setPreparation(existante.statut === 'preparation');
      setInitialise(true);
    } else if (especes.length && profil) {
      const premiere = especes[0];
      setEspece(premiere.nom);
      setDuree(premiere.duree_defaut ? String(premiere.duree_defaut) : '');
      setResponsableId(profil.id);
      setInitialise(true);
    }
  }, [edition, existante, especes, profil, initialise]);

  const choisirEspece = (nom: string) => {
    setEspece(nom);
    const e = especes.find((x) => x.nom === nom);
    if (e?.duree_defaut) setDuree(String(e.duree_defaut));
    else if (!edition) setDuree('');
  };

  const dureeN = entierOuNull(duree);
  const nbN = entierOuNull(nbOeufs);
  const eclosion = dureeN && dateDebut ? addDays(dateDebut, dureeN) : null;

  const occupation = useMemo(() => {
    const cv = couveuses.find((c) => c.id === couveuseId);
    if (!cv || !cv.capacite) return null;
    const autres = couvaisons.filter((c) => c.couveuse_id === cv.id && c.id !== id && estActive(c)).reduce((s, c) => s + oeufsEnCours(c), 0);
    return { cv, autres, total: autres + (nbN ?? 0) };
  }, [couveuses, couveuseId, couvaisons, id, nbN]);

  if (!peutEcrire) return <div className="page"><div className="erreurs">Votre compte est en lecture seule.</div></div>;
  if (edition && !existante) return <Chargement />;

  async function enregistrer() {
    const e: string[] = [];
    const nomEspece = espece === 'Autre' ? especeLibre.trim() || 'Autre' : espece;
    if (!espece) e.push("Choisissez l'espèce.");
    if (!dateDebut) e.push('Indiquez la date de mise en incubation.');
    if (dureeN == null || dureeN < 1 || dureeN > 90) e.push("La durée d'incubation doit être comprise entre 1 et 90 jours.");
    if (nbN == null || nbN < 0) e.push("Indiquez le nombre d'œufs mis en couveuse.");
    if (edition && existante && nbN != null) {
      const plusGrand = Math.max(existante.oeufs_fecondes ?? 0, existante.oeufs_eclos ?? 0,
        (existante.oeufs_fecondes ?? 0) + (existante.oeufs_non_fecondes ?? 0), (existante.oeufs_eclos ?? 0) + (existante.oeufs_non_eclos ?? 0));
      if (nbN < plusGrand) e.push(`Le nombre d'œufs ne peut pas être inférieur aux œufs déjà comptés (${plusGrand}).`);
    }
    setErreurs(e);
    if (e.length) { window.scrollTo(0, 0); return; }

    const donnees = {
      espece: nomEspece,
      nom_lot: nomLot.trim() || null,
      race: race.trim() || null,
      nb_oeufs: nbN!,
      date_debut: dateDebut,
      duree_jours: dureeN!,
      couveuse_id: couveuseId || null,
      responsable_id: responsableId || null,
      observations: observations.trim() || null,
      rappels_actifs: rappels,
    };

    setEnvoi(true);
    try {
      if (edition && existante) {
        const patch: Partial<Couvaison> = {};
        for (const [k, v] of Object.entries(donnees)) if ((existante as any)[k] !== v) (patch as any)[k] = v;
        if (existante.statut === 'auto' || existante.statut === 'preparation') {
          const st: StatutStocke = preparation ? 'preparation' : 'auto';
          if (st !== existante.statut) patch.statut = st;
        }
        if (Object.keys(patch).length) await modifier('couvaisons', existante.id, patch);
        // Recalage des opérations automatiques si la date ou la durée change
        if ((patch.date_debut || patch.duree_jours) && opsCouv.some((o) => o.auto && !o.fait)) {
          const ok = await confirmer({
            titre: 'Recalculer le calendrier ?',
            message: 'La date ou la durée a changé. Recaler les opérations automatiques non faites (mirages, arrêt du retournement, éclosion) ?',
            bouton: 'Recalculer', danger: false,
          });
          if (ok) {
            const plan = planOperations(dureeN!);
            const compteur: Record<string, number> = {};
            for (const o of [...opsCouv].filter((x) => x.auto).sort((a, b) => a.date_prevue.localeCompare(b.date_prevue))) {
              const rang = compteur[o.type] = (compteur[o.type] ?? -1) + 1;
              const p = plan.filter((x) => x.type === o.type)[rang];
              if (!p || o.fait) continue;
              const date = addDays(dateDebut, p.jour);
              if (date !== o.date_prevue || p.titre !== o.titre) await modifier('operations', o.id, { date_prevue: date, titre: p.titre });
            }
          }
        }
        toast('Couvaison modifiée');
        nav(`/couvaisons/${existante.id}`, { replace: true });
      } else {
        const c = await ajouter('couvaisons', { ...donnees, statut: preparation ? 'preparation' : 'auto', oeufs_retires: 0, oeufs_casses: 0 });
        if (planifier) {
          for (const p of planOperations(dureeN!)) {
            await ajouter('operations', {
              couvaison_id: c.id, type: p.type, titre: p.titre, date_prevue: addDays(dateDebut, p.jour),
              heure: '08:00', rappel: rappels, fait: false, auto: true,
            });
          }
        }
        toast('Couvaison démarrée');
        nav(`/couvaisons/${c.id}`, { replace: true });
      }
    } catch (err: any) {
      setErreurs([err.message ?? String(err)]);
    } finally {
      setEnvoi(false);
    }
  }

  const membres = profils.filter((p) => p.role === 'admin' || p.role === 'operateur' || p.role === 'lecteur' || p.id === responsableId);

  return (
    <div className="page avec-action">
      <div className="flex mb">
        <button className="btn-rond" aria-label="Fermer" onClick={() => nav(-1)}><X size={22} /></button>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>{edition ? `Modifier ${existante?.numero ?? 'la couvaison'}` : 'Nouvelle couvaison'}</h1>
      </div>

      {erreurs.length > 0 && <div className="erreurs">{erreurs.map((e) => <div key={e}>{e}</div>)}</div>}

      <div className="champ">
        <span className="label-champ">Espèce</span>
        <div className="choix-especes">
          {especes.map((e) => (
            <button key={e.id} type="button" className={`choix-espece ${espece === e.nom ? 'actif' : ''}`} onClick={() => choisirEspece(e.nom)}>
              <b>{e.nom}</b><span>{e.duree_defaut ? `${e.duree_defaut} j` : 'libre'}</span>
            </button>
          ))}
        </div>
        {espece === 'Autre' && (
          <input className="entree mt-s" value={especeLibre} onChange={(e) => setEspeceLibre(e.target.value)} placeholder="Nom de l'espèce (ex. : Faisan, Paon…)" />
        )}
      </div>

      <div className="grille-2">
        <div className="champ">
          <label htmlFor="lot">Nom du lot</label>
          <input id="lot" className="entree" value={nomLot} onChange={(e) => setNomLot(e.target.value)} placeholder={`Ex. : Lot ${espece || 'Poules'} D`} />
        </div>
        <div className="champ">
          <label htmlFor="race">Race</label>
          <input id="race" className="entree" value={race} onChange={(e) => setRace(e.target.value)} placeholder="Ex. : Sussex, Brahma…" />
        </div>
        <div className="champ">
          <label htmlFor="nb">Nombre d'œufs</label>
          <input id="nb" className="entree" inputMode="numeric" value={nbOeufs} onChange={(e) => setNbOeufs(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0" />
        </div>
        <div className="champ">
          <label htmlFor="debut">Date de mise en incubation</label>
          <input id="debut" type="date" className="entree" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
        </div>
      </div>

      <div className="champ">
        <label htmlFor="duree">Durée d'incubation (jours) — librement modifiable</label>
        <div className="duree">
          <button type="button" className="btn-rond" aria-label="Moins un jour" onClick={() => setDuree(String(Math.max(1, (dureeN ?? 1) - 1)))}><Minus size={18} /></button>
          <input id="duree" className="entree" inputMode="numeric" value={duree} onChange={(e) => setDuree(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Nombre de jours" />
          <button type="button" className="btn-rond" aria-label="Plus un jour" onClick={() => setDuree(String(Math.min(90, (dureeN ?? 0) + 1)))}><Plus size={18} /></button>
        </div>
        <div className="aide">Valeur par défaut de l'espèce modifiable dans Paramètres › Espèces.</div>
      </div>

      <div className="grille-2">
        <div className="champ">
          <label htmlFor="couveuse">Couveuse / emplacement</label>
          <select id="couveuse" className="entree" value={couveuseId} onChange={(e) => setCouveuseId(e.target.value)}>
            <option value="">— Aucune —</option>
            {couveuses.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}{c.etat === 'maintenance' ? ' (maintenance)' : ''}</option>
            ))}
          </select>
        </div>
        <div className="champ">
          <label htmlFor="resp">Responsable</label>
          <select id="resp" className="entree" value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
            <option value="">— Aucun —</option>
            {membres.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>
        </div>
      </div>
      {couveuses.length === 0 && <div className="aide gris petit mb" style={{ marginTop: -8 }}>Aucune couveuse enregistrée : ajoutez-en depuis Accueil › Couveuses.</div>}
      {occupation && occupation.total > occupation.cv.capacite && (
        <div className="avertissement">
          Capacité dépassée : {occupation.cv.nom} contient déjà {occupation.autres} œufs pour une capacité de {occupation.cv.capacite}.
        </div>
      )}
      {occupation?.cv.etat === 'maintenance' && <div className="avertissement">Cette couveuse est en maintenance.</div>}

      {eclosion && (
        <div className="bandeau-eclosion">
          <div><div className="label">Éclosion prévue</div><div className="date">{fmtCourtAnnee(eclosion)}</div></div>
          <span className="chip">{dureeN} jours</span>
        </div>
      )}

      <div className="champ">
        <label htmlFor="obs">Observations</label>
        <textarea id="obs" className="entree" value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="Origine des œufs, état, remarques…" />
      </div>

      <div className="carte">
        <div className="interrupteur">
          <div><div className="titre">Rappels automatiques</div><div className="sous">Retournement, mirage, éclosion</div></div>
          <Bascule on={rappels} onChange={setRappels} label="Rappels automatiques" />
        </div>
      </div>
      {!edition && (
        <div className="carte">
          <div className="interrupteur">
            <div><div className="titre">Créer le calendrier des opérations</div><div className="sous">Mirages, arrêt du retournement, éclosion (modifiables)</div></div>
            <Bascule on={planifier} onChange={setPlanifier} label="Créer le calendrier" />
          </div>
        </div>
      )}
      {(!edition || existante?.statut === 'auto' || existante?.statut === 'preparation') && (
        <div className="carte">
          <div className="interrupteur">
            <div><div className="titre">En préparation</div><div className="sous">Les œufs ne sont pas encore dans la couveuse</div></div>
            <Bascule on={preparation} onChange={setPreparation} label="En préparation" />
          </div>
        </div>
      )}

      <div className="barre-action">
        <div>
          <button className="btn primaire plein" disabled={envoi} onClick={enregistrer}>
            {envoi && <Loader2 size={18} className="tourne" />}
            {edition ? 'Enregistrer les modifications' : 'Démarrer la couvaison'}
          </button>
        </div>
      </div>
    </div>
  );
}
