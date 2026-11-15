import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, Check, Droplet, MoreVertical, Pencil, Plus, Thermometer, Trash2 } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../hooks/useAuth';
import {
  useCouvaison, useCouveuses, useEnAttente, useHistorique, useMesures, useMirages, useOperations, usePhotos, useProfils,
} from '../hooks/useData';
import { fmtPct, retournementActif, suivi, taux, verifierOeufs } from '../lib/calc';
import { diffDays, fmtCourt, fmtCourtAnnee, fmtLong, today } from '../lib/dates';
import { ajouter, ajouterPhoto, enregistrer, modifier, supprimer, urlPhoto } from '../lib/sync';
import { uuidDeterministe } from '../lib/uuid';
import { compresserImage } from '../lib/natif';
import { ficheCouvaisonPDF } from '../lib/export';
import { db } from '../lib/db';
import type { Couvaison, Mirage, Operation, Photo } from '../lib/types';
import {
  Anneau, BadgeStatut, Chargement, EnteteRetour, Feuille, Vide, entierOuNull, nombreOuNull, useDialogs, versTexte,
} from '../components/ui';
import OperationForm from '../components/OperationForm';
import Journal from '../components/Journal';

type Onglet = 'suivi' | 'oeufs' | 'operations' | 'photos' | 'journal';

export default function CouvaisonDetail() {
  const { id } = useParams();
  const c = useCouvaison(id);
  const nav = useNavigate();
  const { peutEcrire, estAdmin } = useAuth();
  const { confirmer, toast } = useDialogs();
  const couveuses = useCouveuses();
  const profils = useProfils();
  const ops = useOperations(id);
  const mesures = useMesures(id);
  const mirages = useMirages(id);
  const enAttente = useEnAttente();
  const [onglet, setOnglet] = useState<Onglet>('suivi');
  const [menu, setMenu] = useState(false);
  const [cloture, setCloture] = useState(false);
  const [charge, setCharge] = useState(false);

  useEffect(() => { const t = setTimeout(() => setCharge(true), 600); return () => clearTimeout(t); }, []);

  if (!c) return charge ? <div className="page"><EnteteRetour titre="Couvaison" retour="/couvaisons" /><Vide titre="Couvaison introuvable" texte="Elle a peut-être été supprimée." /></div> : <Chargement />;

  const s = suivi(c);
  const couveuse = couveuses.find((x) => x.id === c.couveuse_id);
  const responsable = profils.find((p) => p.id === c.responsable_id);

  async function supprimerCouvaison() {
    setMenu(false);
    const ok = await confirmer({
      titre: 'Supprimer cette couvaison ?',
      message: `${c!.nom_lot || c!.numero} sera supprimée définitivement avec ses opérations, suivis, mirages et photos, sur tous les téléphones.`,
    });
    if (!ok) return;
    await supprimer('couvaisons', c!.id);
    toast('Couvaison supprimée');
    nav('/couvaisons', { replace: true });
  }

  async function changerStatut(statut: Couvaison['statut'], message: string, bouton: string) {
    setMenu(false);
    if (!(await confirmer({ titre: bouton, message, bouton, danger: statut === 'annulee' }))) return;
    const patch: Partial<Couvaison> = { statut };
    if (statut === 'annulee') patch.date_fin = today();
    if (statut === 'auto') patch.date_fin = null;
    await modifier('couvaisons', c!.id, patch);
    toast('Statut mis à jour');
  }

  async function demarrer() {
    setMenu(false);
    const ok = await confirmer({
      titre: "Démarrer l'incubation",
      message: `Les œufs sont mis en couveuse aujourd'hui ? La date de début passera au ${fmtCourt(today())} (sinon, modifiez la date dans la fiche).`,
      bouton: 'Démarrer', danger: false,
    });
    if (!ok) return;
    await modifier('couvaisons', c!.id, { statut: 'auto', date_debut: today() });
    toast("Incubation démarrée — pensez à vérifier le calendrier des opérations");
  }

  async function fiche() {
    setMenu(false);
    try {
      const [operations, mes, mir] = await Promise.all([db.operations.toArray(), db.mesures.toArray(), db.mirages.toArray()]);
      await ficheCouvaisonPDF(c!, { profils, couveuses, operations, mesures: mes, mirages: mir });
    } catch (e: any) { toast(`Export impossible : ${e.message ?? e}`, true); }
  }

  const actif = c.statut === 'auto' || c.statut === 'preparation';

  return (
    <div className="page">
      <EnteteRetour titre={c.nom_lot || c.numero || 'Couvaison'} droite={
        <div style={{ position: 'relative' }}>
          <button className="btn-rond" aria-label="Actions" onClick={() => setMenu(!menu)}><MoreVertical size={20} /></button>
          {menu && (
            <div className="menu-contexte">
              {peutEcrire && <button onClick={() => nav(`/couvaisons/${c.id}/modifier`)}>Modifier la fiche</button>}
              <button onClick={fiche}>Exporter la fiche PDF</button>
              {peutEcrire && s.statut === 'preparation' && <button onClick={demarrer}>Démarrer l'incubation</button>}
              {peutEcrire && actif && <button onClick={() => { setMenu(false); setCloture(true); }}>Clôturer l'éclosion</button>}
              {peutEcrire && actif && <button onClick={() => changerStatut('annulee', 'La couvaison sera marquée comme annulée. Vous pourrez la réactiver.', 'Annuler la couvaison')}>Annuler la couvaison</button>}
              {peutEcrire && !actif && <button onClick={() => changerStatut('auto', 'La couvaison redeviendra « en cours ».', 'Réactiver')}>Réactiver la couvaison</button>}
              {estAdmin && <button className="danger" onClick={supprimerCouvaison}>Supprimer</button>}
            </div>
          )}
        </div>
      } />

      <div className="carte" onClick={() => setMenu(false)}>
        <div className="flex" style={{ gap: 16, alignItems: 'center' }}>
          <Anneau valeur={s.progression} haut={s.statut === 'preparation' ? 'J0' : `J${Math.min(s.jour, c.duree_jours)}`} bas={`sur ${c.duree_jours}`} />
          <div className="infos">
            <div><div className="k">Espèce</div><div className="v">{c.espece}</div></div>
            <div><div className="k">Œufs</div><div className="v">{c.nb_oeufs}</div></div>
            <div><div className="k">Début</div><div className="v">{fmtCourt(c.date_debut)}</div></div>
            <div><div className="k">Éclosion</div><div className="v">{fmtCourt(s.dateEclosion)}</div></div>
          </div>
        </div>
        <div className="entre mt" style={{ flexWrap: 'wrap', gap: 6 }}>
          <span className="petit gris">
            {c.numero ?? (enAttente.has(c.id) ? 'N° à la synchro' : '')}
            {c.race ? ` · ${c.race}` : ''}{couveuse ? ` · ${couveuse.nom}` : ''}{responsable ? ` · ${responsable.nom}` : ''}
          </span>
          <BadgeStatut statut={s.statut} texte={
            s.statut === 'incubation' ? `${s.joursRestants} j restants` :
            s.statut === 'proche' ? (s.enRetard ? 'Éclosion dépassée' : s.joursRestants === 0 ? "Éclosion aujourd'hui" : `Éclosion J-${s.joursRestants}`) : undefined} />
        </div>
        {c.observations && <div className="petit mt-s" style={{ whiteSpace: 'pre-wrap' }}>{c.observations}</div>}
      </div>

      <div className="onglets petits">
        {([['suivi', 'Suivi'], ['oeufs', 'Œufs'], ['operations', 'Opérations'], ['photos', 'Photos'], ['journal', 'Journal']] as [Onglet, string][]).map(([k, l]) => (
          <button key={k} className={onglet === k ? 'actif' : ''} onClick={() => setOnglet(k)}>{l}</button>
        ))}
      </div>

      {onglet === 'suivi' && <OngletSuivi c={c} ops={ops} mesures={mesures} peutEcrire={peutEcrire} profils={profils} />}
      {onglet === 'oeufs' && <OngletOeufs c={c} mirages={mirages} peutEcrire={peutEcrire} onCloture={() => setCloture(true)} />}
      {onglet === 'operations' && <OngletOperations c={c} ops={ops} peutEcrire={peutEcrire} profils={profils} />}
      {onglet === 'photos' && <OngletPhotos c={c} peutEcrire={peutEcrire} enAttente={enAttente} />}
      {onglet === 'journal' && <OngletJournal id={c.id} />}

      {cloture && <ClotureEclosion c={c} onFermer={() => setCloture(false)} />}
    </div>
  );
}

/* ============================== SUIVI ============================== */

function OngletSuivi({ c, ops, mesures, peutEcrire, profils }: {
  c: Couvaison; ops: Operation[]; mesures: ReturnType<typeof useMesures>; peutEcrire: boolean; profils: ReturnType<typeof useProfils>;
}) {
  const { toast, confirmer } = useDialogs();
  const [date, setDate] = useState(today());
  const existante = mesures.find((m) => m.date_mesure === date);
  const [temp, setTemp] = useState('');
  const [hum, setHum] = useState('');
  const [tours, setTours] = useState(0);
  const [prevus, setPrevus] = useState(3);
  const [notes, setNotes] = useState('');
  const [modifie, setModifie] = useState(false);
  const cle = `${date}|${existante?.updated_at ?? ''}`;
  const derniereCle = useRef('');

  useEffect(() => {
    if (derniereCle.current === cle && modifie) return;
    derniereCle.current = cle;
    setTemp(versTexte(existante?.temperature));
    setHum(versTexte(existante?.humidite));
    setTours(existante?.retournements ?? 0);
    const precedente = [...mesures].filter((m) => m.date_mesure < date).sort((a, b) => b.date_mesure.localeCompare(a.date_mesure))[0];
    setPrevus(existante?.retournements_prevus ?? precedente?.retournements_prevus ?? 3);
    setNotes(existante?.notes ?? '');
    setModifie(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  const tourne = retournementActif(c, ops, date);
  const prochain = (() => {
    if (!tourne || tours >= prevus || date !== today()) return null;
    const restant = prevus - tours;
    const h = new Date().getHours();
    const fin = 20;
    const pas = Math.max(1, Math.floor((fin - h) / restant));
    return Math.min(fin, h + pas);
  })();

  async function sauver() {
    const t = nombreOuNull(temp);
    const h = nombreOuNull(hum);
    if (t != null && (t < 20 || t > 45)) { toast('Température invraisemblable (20 à 45 °C).', true); return; }
    if (h != null && (h < 0 || h > 100)) { toast("L'humidité doit être comprise entre 0 et 100 %.", true); return; }
    await enregistrer('mesures', {
      id: uuidDeterministe(`${c.id}|${date}`), couvaison_id: c.id, date_mesure: date,
      temperature: t, humidite: h, retournements: tours, retournements_prevus: prevus, notes: notes.trim() || null,
    });
    setModifie(false);
    toast('Suivi enregistré');
  }

  const historique = [...mesures].sort((a, b) => b.date_mesure.localeCompare(a.date_mesure));
  const courbe = [...mesures].sort((a, b) => a.date_mesure.localeCompare(b.date_mesure))
    .map((m) => ({ j: `J${diffDays(c.date_debut, m.date_mesure)}`, temperature: m.temperature, humidite: m.humidite }));
  const auteur = (id?: string | null) => profils.find((p) => p.id === id)?.nom.split(' ')[0];

  return (
    <>
      <div className="section-titre" style={{ marginTop: 4 }}>
        <h2>Suivi du jour</h2>
        <input type="date" className="entree petite" style={{ width: 160, height: 36, fontSize: 13 }} value={date} max={today()}
          onChange={(e) => { if (e.target.value) setDate(e.target.value); }} />
      </div>
      {date !== today() && <div className="note mb petit">Saisie pour le {fmtLong(date)} (J{diffDays(c.date_debut, date)}).</div>}
      <div className="grille-2">
        <label className="mesure">
          <span className="k"><Thermometer size={15} color="#b3261e" />Température</span>
          <span className="flex" style={{ gap: 6 }}>
            <input inputMode="decimal" value={temp} placeholder="—" disabled={!peutEcrire} onChange={(e) => { setTemp(e.target.value); setModifie(true); }} />
            <span className="unite">°C</span>
          </span>
        </label>
        <label className="mesure">
          <span className="k"><Droplet size={15} color="#2b4c8c" />Humidité</span>
          <span className="flex" style={{ gap: 6 }}>
            <input inputMode="decimal" value={hum} placeholder="—" disabled={!peutEcrire} onChange={(e) => { setHum(e.target.value); setModifie(true); }} />
            <span className="unite">%</span>
          </span>
        </label>
      </div>
      <div className="carte mt-s entre" style={{ marginTop: 12 }}>
        <div>
          <div className="gras">Retournements</div>
          <div className="petit gris">
            {!tourne ? 'Retournement arrêté' : prochain ? `Prochain vers ${prochain} h` : tours >= prevus ? 'Objectif atteint' : `Objectif ${prevus} / jour`}
          </div>
        </div>
        <div className="compteur">
          <button aria-label="Moins" disabled={!peutEcrire} onClick={() => { setTours(Math.max(0, tours - 1)); setModifie(true); }}>−</button>
          <b onClick={() => { if (!peutEcrire) return; const v = prompt('Retournements prévus par jour', String(prevus)); const n = v ? parseInt(v, 10) : NaN; if (n >= 0 && n <= 24) { setPrevus(n); setModifie(true); } }}>{tours}/{prevus}</b>
          <button className="plus" aria-label="Plus" disabled={!peutEcrire} onClick={() => { setTours(tours + 1); setModifie(true); }}>+</button>
        </div>
      </div>
      {peutEcrire && (
        <>
          <div className="champ mt">
            <textarea className="entree" style={{ minHeight: 60 }} placeholder="Note du jour (facultatif)" value={notes} onChange={(e) => { setNotes(e.target.value); setModifie(true); }} />
          </div>
          <button className="btn primaire plein" onClick={sauver}>
            {existante && !modifie ? <><Check size={18} /> Suivi enregistré — mettre à jour</> : 'Enregistrer le suivi'}
          </button>
        </>
      )}

      {courbe.length > 1 && (
        <>
          <div className="section-titre"><h2>Évolution</h2><span className="info">— °C  ··· %</span></div>
          <div className="carte" style={{ padding: '12px 4px 4px 0' }}>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={courbe}>
                <CartesianGrid stroke="#eef0ea" vertical={false} />
                <XAxis dataKey="j" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="t" domain={['dataMin - 0.5', 'dataMax + 0.5']} tick={{ fontSize: 11 }} width={36} />
                <YAxis yAxisId="h" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} width={30} />
                <Tooltip />
                <Line isAnimationActive={false} yAxisId="t" type="monotone" dataKey="temperature" name="Température (°C)" stroke="#b3261e" strokeWidth={2} dot={false} connectNulls />
                <Line isAnimationActive={false} yAxisId="h" type="monotone" dataKey="humidite" name="Humidité (%)" stroke="#2b4c8c" strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <div className="section-titre"><h2>Relevés</h2><span className="info">{mesures.length} jour(s)</span></div>
      {historique.length === 0 ? <div className="carte"><Vide titre="Aucun relevé" /></div> : (
        <div className="carte liste">
          {historique.map((m) => (
            <div key={m.id} className="ligne">
              <div className="corps" onClick={() => setDate(m.date_mesure)}>
                <div className="titre">{fmtCourt(m.date_mesure)} · J{diffDays(c.date_debut, m.date_mesure)}</div>
                <div className="sous">
                  {m.temperature != null ? `${versTexte(m.temperature)} °C` : '— °C'} · {m.humidite != null ? `${versTexte(m.humidite)} %` : '— %'} · {m.retournements}/{m.retournements_prevus} retournements
                  {auteur(m.updated_by ?? m.created_by) ? ` · ${auteur(m.updated_by ?? m.created_by)}` : ''}
                </div>
              </div>
              {peutEcrire && (
                <button className="btn-rond" style={{ width: 36, height: 36 }} aria-label="Supprimer le relevé" onClick={async () => {
                  if (await confirmer({ titre: 'Supprimer ce relevé ?', message: `Le suivi du ${fmtCourt(m.date_mesure)} sera supprimé.` })) {
                    await supprimer('mesures', m.id); toast('Relevé supprimé');
                  }
                }}><Trash2 size={16} /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ============================== ŒUFS ============================== */

function OngletOeufs({ c, mirages, peutEcrire, onCloture }: { c: Couvaison; mirages: Mirage[]; peutEcrire: boolean; onCloture: () => void }) {
  const { toast, confirmer } = useDialogs();
  const [formMirage, setFormMirage] = useState<Mirage | 'nouveau' | null>(null);
  const tries = [...mirages].sort((a, b) => b.date_mirage.localeCompare(a.date_mirage));
  const dernier = tries[0];
  const t = taux(c);
  const jourMirage = Math.max(0, Math.min(diffDays(c.date_debut, today()), c.duree_jours));

  const [vals, setVals] = useState(() => valeursOeufs(c));
  useEffect(() => { setVals(valeursOeufs(c)); }, [c.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const [erreurs, setErreurs] = useState<string[]>([]);

  async function sauverBilan() {
    const patch: Partial<Couvaison> = {
      oeufs_fecondes: entierOuNull(vals.oeufs_fecondes), oeufs_non_fecondes: entierOuNull(vals.oeufs_non_fecondes),
      oeufs_retires: entierOuNull(vals.oeufs_retires) ?? 0, oeufs_casses: entierOuNull(vals.oeufs_casses) ?? 0,
      oeufs_eclos: entierOuNull(vals.oeufs_eclos), oeufs_non_eclos: entierOuNull(vals.oeufs_non_eclos),
    };
    const e = verifierOeufs({ ...c, ...patch });
    setErreurs(e);
    if (e.length) return;
    const diff: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if ((c as any)[k] !== v) diff[k] = v;
    if (!Object.keys(diff).length) { toast('Aucun changement'); return; }
    await modifier('couvaisons', c.id, diff);
    toast('Bilan des œufs enregistré');
  }

  const LIGNES: [keyof ReturnType<typeof valeursOeufs>, string][] = [
    ['oeufs_fecondes', 'Œufs fécondés'], ['oeufs_non_fecondes', 'Œufs non fécondés (clairs)'], ['oeufs_retires', 'Œufs retirés'],
    ['oeufs_casses', 'Œufs cassés'], ['oeufs_eclos', 'Œufs éclos'], ['oeufs_non_eclos', 'Œufs non éclos'],
  ];

  const eclos = c.oeufs_eclos ?? 0;
  const nonEclos = c.oeufs_non_eclos ?? 0;
  const clairs = c.oeufs_non_fecondes ?? 0;

  return (
    <>
      <div className="section-titre" style={{ marginTop: 4 }}>
        <h2>Contrôle des œufs</h2>
        <span className="info">{dernier ? `Mirage J${diffDays(c.date_debut, dernier.date_mirage)} · ${fmtCourt(dernier.date_mirage)}` : 'Aucun mirage'}</span>
      </div>
      <div className="grille-3">
        <div className="tuile vert"><b>{dernier?.fecondes ?? '—'}</b><span>Fécondés</span></div>
        <div className="tuile orange"><b>{dernier?.clairs ?? '—'}</b><span>Clairs</span></div>
        <div className="tuile rouge"><b>{dernier?.morts ?? '—'}</b><span>Morts</span></div>
      </div>
      {peutEcrire && <button className="btn pointille plein mt" onClick={() => setFormMirage('nouveau')}>Nouveau mirage (J{jourMirage})</button>}
      {tries.length > 0 && (
        <div className="carte liste mt">
          {tries.map((m) => (
            <div className="ligne" key={m.id}>
              <div className="corps">
                <div className="titre">Mirage J{diffDays(c.date_debut, m.date_mirage)} · {fmtCourt(m.date_mirage)}</div>
                <div className="sous">{m.fecondes} fécondés · {m.clairs} clairs · {m.morts} morts{m.notes ? ` · ${m.notes}` : ''}</div>
              </div>
              {peutEcrire && <button className="btn-rond" style={{ width: 36, height: 36 }} aria-label="Modifier" onClick={() => setFormMirage(m)}><Pencil size={15} /></button>}
              {peutEcrire && <button className="btn-rond" style={{ width: 36, height: 36 }} aria-label="Supprimer" onClick={async () => {
                if (await confirmer({ titre: 'Supprimer ce mirage ?', message: 'Le bilan des œufs de la couvaison ne sera pas modifié.' })) { await supprimer('mirages', m.id); toast('Mirage supprimé'); }
              }}><Trash2 size={15} /></button>}
            </div>
          ))}
        </div>
      )}

      <div className="section-titre"><h2>Taux</h2></div>
      <div className="grille-3">
        <div className="kpi compact"><div className="label">Fertilité</div><div className="valeur">{fmtPct(t.fertilite)}</div></div>
        <div className="kpi compact"><div className="label">Éclosion / mis</div><div className="valeur">{fmtPct(t.eclosionTotale)}</div></div>
        <div className="kpi compact"><div className="label">Éclosion / féc.</div><div className="valeur">{fmtPct(t.eclosionFeconds)}</div></div>
      </div>
      {c.oeufs_eclos != null && c.nb_oeufs > 0 && (
        <div className="carte mt">
          <div className="empile">
            <div style={{ width: `${(eclos / c.nb_oeufs) * 100}%`, background: 'var(--vert)' }} />
            <div style={{ width: `${(clairs / c.nb_oeufs) * 100}%`, background: 'var(--orange)' }} />
            <div style={{ width: `${(nonEclos / c.nb_oeufs) * 100}%`, background: 'var(--rouge)' }} />
          </div>
          <div className="legende">
            <span><i style={{ background: 'var(--vert)' }} />{eclos} éclos</span>
            <span><i style={{ background: 'var(--orange)' }} />{clairs} clairs</span>
            <span><i style={{ background: 'var(--rouge)' }} />{nonEclos} non éclos</span>
          </div>
        </div>
      )}

      <div className="section-titre"><h2>Bilan des œufs</h2><span className="info">{c.nb_oeufs} mis en couveuse</span></div>
      {erreurs.length > 0 && <div className="erreurs">{erreurs.map((e) => <div key={e}>{e}</div>)}</div>}
      <div className="carte tableau-oeufs">
        {LIGNES.map(([k, l]) => (
          <div className="ligne-o" key={k}>
            <span>{l}</span>
            <input className="entree petite" inputMode="numeric" value={vals[k]} disabled={!peutEcrire} placeholder="—"
              onChange={(e) => setVals({ ...vals, [k]: e.target.value.replace(/[^0-9]/g, '') })} />
          </div>
        ))}
      </div>
      {peutEcrire && (
        <div className="rangee-btn mt">
          <button className="btn primaire" onClick={sauverBilan}>Enregistrer le bilan</button>
          {(c.statut === 'auto' || c.statut === 'preparation') && <button className="btn" onClick={onCloture}>Clôturer l'éclosion</button>}
        </div>
      )}

      {formMirage && <FormMirage c={c} mirage={formMirage === 'nouveau' ? undefined : formMirage} onFermer={() => setFormMirage(null)} />}
    </>
  );
}

function valeursOeufs(c: Couvaison) {
  const s = (n: number | null | undefined) => (n == null ? '' : String(n));
  return {
    oeufs_fecondes: s(c.oeufs_fecondes), oeufs_non_fecondes: s(c.oeufs_non_fecondes), oeufs_retires: s(c.oeufs_retires),
    oeufs_casses: s(c.oeufs_casses), oeufs_eclos: s(c.oeufs_eclos), oeufs_non_eclos: s(c.oeufs_non_eclos),
  };
}

function FormMirage({ c, mirage, onFermer }: { c: Couvaison; mirage?: Mirage; onFermer: () => void }) {
  const { toast } = useDialogs();
  const [date, setDate] = useState(mirage?.date_mirage ?? today());
  const [fec, setFec] = useState(mirage ? String(mirage.fecondes) : '');
  const [clairs, setClairs] = useState(mirage ? String(mirage.clairs) : '');
  const [morts, setMorts] = useState(mirage ? String(mirage.morts) : '');
  const [notes, setNotes] = useState(mirage?.notes ?? '');
  const [majBilan, setMajBilan] = useState(!mirage);
  const [retirer, setRetirer] = useState(true);
  const [erreur, setErreur] = useState('');

  const f = entierOuNull(fec) ?? 0, cl = entierOuNull(clairs) ?? 0, m = entierOuNull(morts) ?? 0;
  const disponibles = c.nb_oeufs - (c.oeufs_casses ?? 0);

  async function valider() {
    if (f + cl + m > disponibles) { setErreur(`Total (${f + cl + m}) supérieur aux œufs disponibles (${disponibles}).`); return; }
    if (f + cl + m === 0) { setErreur('Saisissez au moins un nombre.'); return; }
    const data = { couvaison_id: c.id, date_mirage: date, fecondes: f, clairs: cl, morts: m, notes: notes.trim() || null };
    if (mirage) await modifier('mirages', mirage.id, data);
    else await ajouter('mirages', data);
    if (majBilan) {
      // Les embryons morts proviennent d'œufs fécondés : fertilité = (fécondés vivants + morts) / œufs mis
      const patch: Partial<Couvaison> = { oeufs_fecondes: f + m, oeufs_non_fecondes: cl };
      if (retirer) patch.oeufs_retires = cl + m;
      await modifier('couvaisons', c.id, patch);
    }
    // Valide l'opération de mirage prévue la plus proche
    const op = (await db.operations.where('couvaison_id').equals(c.id).toArray())
      .filter((o) => o.type === 'mirage' && !o.fait && Math.abs(diffDays(o.date_prevue, date)) <= 3)[0];
    if (op && !mirage) await modifier('operations', op.id, { fait: true });
    toast('Mirage enregistré');
    onFermer();
  }

  return (
    <Feuille titre={mirage ? 'Modifier le mirage' : `Mirage J${diffDays(c.date_debut, date)}`} onFermer={onFermer}>
      {erreur && <div className="erreurs">{erreur}</div>}
      <div className="champ"><label>Date du mirage</label><input type="date" className="entree" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="grille-3">
        <div className="champ"><label>Fécondés</label><input className="entree" inputMode="numeric" value={fec} onChange={(e) => setFec(e.target.value.replace(/\D/g, ''))} /></div>
        <div className="champ"><label>Clairs</label><input className="entree" inputMode="numeric" value={clairs} onChange={(e) => setClairs(e.target.value.replace(/\D/g, ''))} /></div>
        <div className="champ"><label>Morts</label><input className="entree" inputMode="numeric" value={morts} onChange={(e) => setMorts(e.target.value.replace(/\D/g, ''))} /></div>
      </div>
      <div className="aide petit gris mb">Comptages cumulés à cette date, sur {disponibles} œufs. Total saisi : {f + cl + m}.</div>
      <div className="champ"><label>Notes</label><input className="entree" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <div className="carte mb">
        <label className="interrupteur"><span><span className="titre">Mettre à jour le bilan des œufs</span><br /><span className="sous">Fécondés = {f + m}, non fécondés = {cl}</span></span>
          <input type="checkbox" checked={majBilan} onChange={(e) => setMajBilan(e.target.checked)} style={{ width: 22, height: 22 }} /></label>
        {majBilan && (
          <label className="interrupteur mt"><span><span className="titre">Œufs clairs et morts retirés</span><br /><span className="sous">Retirés = {cl + m}</span></span>
            <input type="checkbox" checked={retirer} onChange={(e) => setRetirer(e.target.checked)} style={{ width: 22, height: 22 }} /></label>
        )}
      </div>
      <div className="rangee-btn">
        <button className="btn" onClick={onFermer}>Annuler</button>
        <button className="btn primaire" onClick={valider}>Enregistrer</button>
      </div>
    </Feuille>
  );
}

function ClotureEclosion({ c, onFermer }: { c: Couvaison; onFermer: () => void }) {
  const { toast } = useDialogs();
  const [eclos, setEclos] = useState(versTexte(c.oeufs_eclos));
  const [nonEclos, setNonEclos] = useState(versTexte(c.oeufs_non_eclos));
  const [date, setDate] = useState(today());
  const [erreurs, setErreurs] = useState<string[]>([]);
  const restants = c.nb_oeufs - (c.oeufs_retires ?? 0) - (c.oeufs_casses ?? 0);

  async function valider() {
    const e = entierOuNull(eclos);
    if (e == null) { setErreurs(["Indiquez le nombre d'œufs éclos."]); return; }
    const ne = nonEclos === '' ? Math.max(0, restants - e) : entierOuNull(nonEclos)!;
    const patch: Partial<Couvaison> = { oeufs_eclos: e, oeufs_non_eclos: ne, statut: 'terminee', date_fin: date };
    if (c.oeufs_fecondes == null) patch.oeufs_fecondes = Math.min(c.nb_oeufs, e + ne);
    const errs = verifierOeufs({ ...c, ...patch });
    setErreurs(errs);
    if (errs.length) return;
    await modifier('couvaisons', c.id, patch);
    const op = (await db.operations.where('couvaison_id').equals(c.id).toArray()).find((o) => o.type === 'eclosion' && !o.fait);
    if (op) await modifier('operations', op.id, { fait: true });
    toast('Éclosion clôturée');
    onFermer();
  }

  return (
    <Feuille titre="Clôturer l'éclosion" onFermer={onFermer}>
      {erreurs.length > 0 && <div className="erreurs">{erreurs.map((x) => <div key={x}>{x}</div>)}</div>}
      <p className="petit gris" style={{ marginTop: 0 }}>{restants} œuf(s) encore en couveuse sur {c.nb_oeufs} mis.</p>
      <div className="grille-2">
        <div className="champ"><label>Œufs éclos (poussins)</label><input className="entree" inputMode="numeric" value={eclos} onChange={(e) => setEclos(e.target.value.replace(/\D/g, ''))} /></div>
        <div className="champ"><label>Œufs non éclos</label><input className="entree" inputMode="numeric" value={nonEclos} placeholder={eclos ? String(Math.max(0, restants - (entierOuNull(eclos) ?? 0))) : ''} onChange={(e) => setNonEclos(e.target.value.replace(/\D/g, ''))} /></div>
      </div>
      <div className="champ"><label>Date de fin d'éclosion</label><input type="date" className="entree" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      {eclos && <div className="note mb">Taux d'éclosion : {fmtPct(((entierOuNull(eclos) ?? 0) / Math.max(1, c.nb_oeufs)) * 100, 1)} des œufs mis.</div>}
      <div className="rangee-btn">
        <button className="btn" onClick={onFermer}>Annuler</button>
        <button className="btn primaire" onClick={valider}>Clôturer</button>
      </div>
    </Feuille>
  );
}

/* ============================== OPÉRATIONS ============================== */

function OngletOperations({ c, ops, peutEcrire, profils }: { c: Couvaison; ops: Operation[]; peutEcrire: boolean; profils: ReturnType<typeof useProfils> }) {
  const { confirmer, toast } = useDialogs();
  const [edition, setEdition] = useState<Operation | 'nouvelle' | null>(null);
  const triees = useMemo(() => [...ops].sort((a, b) => a.date_prevue.localeCompare(b.date_prevue) || (a.heure ?? '').localeCompare(b.heure ?? '')), [ops]);
  const auj = today();

  return (
    <>
      {peutEcrire && <button className="btn pointille vert plein mb" onClick={() => setEdition('nouvelle')}><Plus size={18} /> Planifier une opération</button>}
      {triees.length === 0 ? <div className="carte"><Vide titre="Aucune opération planifiée" /></div> : (
        <div className="carte liste">
          {triees.map((o) => {
            const par = profils.find((p) => p.id === o.fait_par)?.nom;
            const retard = !o.fait && o.date_prevue < auj;
            return (
              <div key={o.id} className={`ligne ${o.fait ? 'faite' : ''}`}>
                <button className={`coche ${o.fait ? 'ok' : ''}`} disabled={!peutEcrire} aria-label="Fait" onClick={() => modifier('operations', o.id, { fait: !o.fait })}>
                  {o.fait && <Check size={16} strokeWidth={3} />}
                </button>
                <div className="corps" onClick={() => peutEcrire && setEdition(o)}>
                  <div className="titre">{o.titre}</div>
                  <div className="sous">
                    J{diffDays(c.date_debut, o.date_prevue)} · {fmtCourtAnnee(o.date_prevue)}{o.heure ? ` · ${o.heure.slice(0, 5)}` : ''}{o.rappel ? ' · 🔔' : ''}
                    {o.fait && par ? ` · fait par ${par}` : ''}
                  </div>
                </div>
                {retard && <span className="badge rouge">En retard</span>}
                {peutEcrire && (
                  <button className="btn-rond" style={{ width: 36, height: 36 }} aria-label="Supprimer" onClick={async () => {
                    if (await confirmer({ titre: "Supprimer l'opération ?", message: `« ${o.titre} » sera supprimée.` })) { await supprimer('operations', o.id); toast('Opération supprimée'); }
                  }}><Trash2 size={15} /></button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {edition && <OperationForm op={edition === 'nouvelle' ? undefined : edition} couvaisonId={c.id} dateDefaut={auj} onFermer={() => setEdition(null)} />}
    </>
  );
}

/* ============================== PHOTOS ============================== */

function Vignette({ p, onClick, attente }: { p: Photo; onClick: () => void; attente: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    urlPhoto(p.id, p.chemin).then((x) => { u = x; setUrl(x); });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [p.id, p.chemin]);
  return (
    <button className="photo" onClick={onClick}>
      {url ? <img src={url} alt={p.legende ?? 'Photo'} /> : <span className="petit gris">Hors ligne</span>}
      {attente && <span className="attente">À envoyer</span>}
    </button>
  );
}

function OngletPhotos({ c, peutEcrire, enAttente }: { c: Couvaison; peutEcrire: boolean; enAttente: Set<string> }) {
  const photos = usePhotos(c.id);
  const { toast, confirmer } = useDialogs();
  const entree = useRef<HTMLInputElement>(null);
  const [vue, setVue] = useState<Photo | null>(null);
  const [urlVue, setUrlVue] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!vue) { setUrlVue(null); return; }
    let u: string | null = null;
    urlPhoto(vue.id, vue.chemin).then((x) => { u = x; setUrlVue(x); });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [vue]);

  async function choisir(fichiers: FileList | null) {
    if (!fichiers?.length) return;
    setEnvoi(true);
    try {
      for (const f of Array.from(fichiers)) {
        const blob = await compresserImage(f);
        await ajouterPhoto(c.id, blob, null);
      }
      toast(`${fichiers.length} photo(s) ajoutée(s)`);
    } catch (e: any) {
      toast(`Photo illisible : ${e.message ?? e}`, true);
    } finally {
      setEnvoi(false);
      if (entree.current) entree.current.value = '';
    }
  }

  return (
    <>
      {peutEcrire && (
        <>
          <input ref={entree} type="file" accept="image/*" multiple hidden onChange={(e) => choisir(e.target.files)} />
          <button className="btn pointille vert plein mb" disabled={envoi} onClick={() => entree.current?.click()}><Camera size={18} /> Prendre ou ajouter une photo</button>
        </>
      )}
      {photos.length === 0 ? <div className="carte"><Vide titre="Aucune photo" icone={<Camera size={30} />} /></div> : (
        <div className="photos">
          {photos.map((p) => <Vignette key={p.id} p={p} attente={enAttente.has(p.id)} onClick={() => setVue(p)} />)}
        </div>
      )}
      {vue && (
        <Feuille titre={vue.legende || `Photo du ${fmtCourt((vue.created_at ?? '').slice(0, 10))}`} onFermer={() => setVue(null)}>
          <div className="visionneuse">{urlVue ? <img src={urlVue} alt="" /> : <Chargement />}</div>
          {peutEcrire && (
            <div className="rangee-btn mt">
              <button className="btn" onClick={async () => {
                const l = prompt('Légende de la photo', vue.legende ?? '');
                if (l !== null) { await modifier('photos', vue.id, { legende: l.trim() || null }); setVue({ ...vue, legende: l.trim() || null }); }
              }}><Pencil size={16} /> Légende</button>
              <button className="btn danger-leger" onClick={async () => {
                if (await confirmer({ titre: 'Supprimer la photo ?', message: 'Elle sera supprimée sur tous les téléphones.' })) {
                  await supprimer('photos', vue.id); setVue(null); toast('Photo supprimée');
                }
              }}><Trash2 size={16} /> Supprimer</button>
            </div>
          )}
        </Feuille>
      )}
    </>
  );
}

/* ============================== JOURNAL ============================== */

function OngletJournal({ id }: { id: string }) {
  const lignes = useHistorique(id, 200);
  return (
    <>
      <p className="petit gris" style={{ marginTop: 0 }}>Toutes les modifications de cette couvaison, avec leur auteur.</p>
      <Journal lignes={lignes} />
    </>
  );
}
