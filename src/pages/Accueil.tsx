import { Link, useNavigate } from 'react-router-dom';
import { Bell, CalendarDays, Check, ClipboardList, Egg, FileText, Settings, Thermometer } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useCouvaisons, useCouveuses, useEnAttente, useMesures, useOperations, useProfils } from '../hooks/useData';
import { estActive, estEnIncubation, fmtNombre, fmtPct, oeufsEnCours, suivi, retournementActif } from '../lib/calc';
import { fmtCourt, fmtLong, today } from '../lib/dates';
import { modifier } from '../lib/sync';
import CarteCouvaison from '../components/CarteCouvaison';
import PastilleSync from '../components/PastilleSync';
import { Vide, useDialogs } from '../components/ui';
import type { Operation } from '../lib/types';

export default function Accueil() {
  const { peutEcrire } = useAuth();
  const { toast } = useDialogs();
  const nav = useNavigate();
  const couvaisons = useCouvaisons();
  const ops = useOperations();
  const mesures = useMesures();
  const profils = useProfils();
  const couveuses = useCouveuses();
  const enAttente = useEnAttente();
  const auj = today();

  const actives = couvaisons.filter(estActive)
    .sort((a, b) => suivi(a).dateEclosion.localeCompare(suivi(b).dateEclosion));
  const enIncubation = couvaisons.filter(estEnIncubation);
  const terminees = couvaisons.filter((c) => c.statut === 'terminee');
  const oeufsIncub = enIncubation.reduce((s, c) => s + oeufsEnCours(c), 0);
  const eclos = terminees.reduce((s, c) => s + (c.oeufs_eclos ?? 0), 0);
  const nonEclos = terminees.reduce((s, c) => s + (c.oeufs_non_eclos ?? 0), 0);
  const avecResultat = terminees.filter((c) => c.oeufs_eclos != null);
  const misTermines = avecResultat.reduce((s, c) => s + c.nb_oeufs, 0);
  const tauxMoyen = misTermines ? (avecResultat.reduce((s, c) => s + (c.oeufs_eclos ?? 0), 0) / misTermines) * 100 : null;
  const retires = couvaisons.reduce((s, c) => s + (c.oeufs_retires ?? 0) + (c.oeufs_casses ?? 0), 0);
  const prochaine = actives.filter((c) => suivi(c).statut !== 'preparation')[0] ?? actives[0];

  const idsActifs = new Set(actives.map((c) => c.id));
  const nomCouv = (id: string) => { const c = couvaisons.find((x) => x.id === id); return c?.nom_lot || c?.numero || ''; };
  const aFaire = ops.filter((o) => idsActifs.has(o.couvaison_id) && (o.date_prevue === auj || (o.date_prevue < auj && !o.fait)))
    .sort((a, b) => Number(a.fait) - Number(b.fait) || a.date_prevue.localeCompare(b.date_prevue) || (a.heure ?? '').localeCompare(b.heure ?? ''));
  const suivisManquants = enIncubation.filter((c) => !mesures.some((m) => m.couvaison_id === c.id && m.date_mesure === auj));
  const nbUrgent = aFaire.filter((o) => !o.fait).length + suivisManquants.length;

  async function basculer(o: Operation) {
    if (!peutEcrire) { toast('Vous êtes en lecture seule.', true); return; }
    await modifier('operations', o.id, { fait: !o.fait });
  }

  const dateTitre = fmtLong(auj);

  return (
    <div className="page">
      <div className="entete" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="sur-titre" style={{ textTransform: 'capitalize' }}>{dateTitre}</div>
          <h1 className="page-titre">Ma couvaison</h1>
        </div>
        <div className="flex">
          <button className="btn-rond" aria-label="Calendrier et rappels" onClick={() => nav('/calendrier')}>
            <Bell size={20} />{nbUrgent > 0 && <span className="pastille" />}
          </button>
          <button className="btn-rond" aria-label="Paramètres" onClick={() => nav('/parametres')}><Settings size={20} /></button>
        </div>
      </div>
      <div className="mb"><PastilleSync /></div>

      <div className="carte-hero">
        <div className="entre" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="label">Œufs en incubation</div>
            <div className="grand">{fmtNombre(oeufsIncub)}</div>
          </div>
          <span className="chip">{enIncubation.length} lot{enIncubation.length > 1 ? 's' : ''} en cours</span>
        </div>
        {prochaine ? (
          <Link to={`/couvaisons/${prochaine.id}`} className="sous">
            <Egg size={20} />
            <div>
              <div className="gras">
                {(() => {
                  const s = suivi(prochaine);
                  if (s.statut === 'preparation') return `Mise en incubation le ${fmtCourt(prochaine.date_debut)}`;
                  if (s.enRetard) return 'Éclosion prévue dépassée';
                  return s.joursRestants === 0 ? "Éclosion prévue aujourd'hui" : `Prochaine éclosion dans ${s.joursRestants} jour${s.joursRestants > 1 ? 's' : ''}`;
                })()}
              </div>
              <div className="petit" style={{ opacity: 0.85 }}>{prochaine.nom_lot || prochaine.numero} · {fmtLong(suivi(prochaine).dateEclosion).replace(/^\S+ /, '')}</div>
            </div>
          </Link>
        ) : (
          <div className="sous"><Egg size={20} /><div className="petit">Aucune couvaison en cours.</div></div>
        )}
      </div>

      <div className="grille-2 mt">
        <div className="kpi"><div className="label">Taux d'éclosion moyen</div><div className="valeur">{fmtPct(tauxMoyen)}</div></div>
        <div className="kpi"><div className="label">Œufs retirés / cassés</div><div className="valeur">{fmtNombre(retires)}</div></div>
      </div>
      <div className="grille-3 mt-s" style={{ marginTop: 10 }}>
        <div className="kpi compact"><div className="label">Couvaisons</div><div className="valeur">{couvaisons.length}</div></div>
        <div className="kpi compact"><div className="label">En cours</div><div className="valeur">{actives.length}</div></div>
        <div className="kpi compact"><div className="label">Terminées</div><div className="valeur">{terminees.length}</div></div>
        <div className="kpi compact"><div className="label">Poussins éclos</div><div className="valeur">{fmtNombre(eclos)}</div></div>
        <div className="kpi compact"><div className="label">Non éclos</div><div className="valeur">{fmtNombre(nonEclos)}</div></div>
        <div className="kpi compact"><div className="label">Couveuses</div><div className="valeur">{couveuses.length}</div></div>
      </div>

      <div className="raccourcis mt">
        <Link to="/calendrier" className="raccourci"><span className="ic"><CalendarDays size={20} /></span>Calendrier</Link>
        <Link to="/couveuses" className="raccourci"><span className="ic"><Thermometer size={20} /></span>Couveuses</Link>
        <Link to="/rapports" className="raccourci"><span className="ic"><FileText size={20} /></span>Rapports</Link>
        <Link to="/couvaisons?vue=historique" className="raccourci"><span className="ic"><ClipboardList size={20} /></span>Historique</Link>
      </div>

      <div className="section-titre"><h2>À faire aujourd'hui</h2><Link to="/calendrier" className="lien">Calendrier</Link></div>
      {aFaire.length === 0 && suivisManquants.length === 0 ? (
        <div className="carte"><Vide titre="Rien à faire pour le moment" texte="Les opérations prévues apparaîtront ici." icone={<Check size={30} />} /></div>
      ) : (
        <div className="carte liste">
          {suivisManquants.map((c) => (
            <Link key={'s' + c.id} to={`/couvaisons/${c.id}`} className="ligne">
              <span className="coche" />
              <div className="corps">
                <div className="titre">Suivi du jour{retournementActif(c, ops) ? ' + retournements' : ''}</div>
                <div className="sous">{c.nom_lot || c.numero} · température, humidité</div>
              </div>
            </Link>
          ))}
          {aFaire.map((o) => {
            const par = profils.find((p) => p.id === o.fait_par)?.nom;
            const retard = !o.fait && o.date_prevue < auj;
            return (
              <div key={o.id} className={`ligne ${o.fait ? 'faite' : ''}`}>
                <button className={`coche ${o.fait ? 'ok' : ''}`} aria-label={o.fait ? 'Marquer non fait' : 'Marquer fait'} onClick={() => basculer(o)}>
                  {o.fait && <Check size={16} strokeWidth={3} />}
                </button>
                <Link to={`/couvaisons/${o.couvaison_id}`} className="corps">
                  <div className="titre">{o.titre}</div>
                  <div className="sous">
                    {nomCouv(o.couvaison_id)}
                    {o.fait ? (par ? ` · fait par ${par.split(' ')[0]}` : ' · fait') : o.heure ? ` · ${o.heure.slice(0, 5)}` : ''}
                    {enAttente.has(o.id) ? ' · en attente de synchro' : ''}
                  </div>
                </Link>
                {retard ? <span className="badge rouge">En retard</span> : !o.fait && (o.type === 'mirage' || o.type === 'eclosion') ? <span className="badge orange">Urgent</span> : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="section-titre"><h2>Couvaisons en cours</h2><Link to="/couvaisons" className="lien">Tout voir</Link></div>
      {actives.length === 0
        ? <div className="carte"><Vide titre="Aucune couvaison en cours" texte={peutEcrire ? 'Appuyez sur + pour démarrer une couvaison.' : undefined} /></div>
        : actives.map((c) => <CarteCouvaison key={c.id} c={c} ops={ops} couveuses={couveuses} enAttente={enAttente.has(c.id)} />)}
    </div>
  );
}
