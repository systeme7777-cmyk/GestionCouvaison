import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCouvaisons, useCouveuses, useProfils } from '../hooks/useData';
import { estActive, fmtNombre, fmtPct, taux } from '../lib/calc';
import { fmtCourt } from '../lib/dates';
import type { Couvaison } from '../lib/types';
import { Barre, Vide } from '../components/ui';

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

interface Agregat { couvaisons: number; mis: number; eclos: number; misTermines: number; fec: number; misFec: number; }

function agreger(cs: Couvaison[]): Agregat {
  const a: Agregat = { couvaisons: cs.length, mis: 0, eclos: 0, misTermines: 0, fec: 0, misFec: 0 };
  for (const c of cs) {
    a.mis += c.nb_oeufs;
    if (c.statut === 'terminee' && c.oeufs_eclos != null) { a.eclos += c.oeufs_eclos; a.misTermines += c.nb_oeufs; }
    if (c.oeufs_fecondes != null) { a.fec += c.oeufs_fecondes; a.misFec += c.nb_oeufs; }
  }
  return a;
}
const tauxEclosion = (a: Agregat) => (a.misTermines ? (a.eclos / a.misTermines) * 100 : null);
const tauxFertilite = (a: Agregat) => (a.misFec ? (a.fec / a.misFec) * 100 : null);

export default function Statistiques() {
  const couvaisons = useCouvaisons();
  const couveuses = useCouveuses();
  const profils = useProfils();
  const annees = useMemo(() => {
    const s = new Set(couvaisons.map((c) => Number(c.date_debut.slice(0, 4))));
    s.add(new Date().getFullYear());
    return [...s].sort((a, b) => b - a);
  }, [couvaisons]);
  const [annee, setAnnee] = useState<number | 0>(new Date().getFullYear());

  const deLAnnee = annee ? couvaisons.filter((c) => Number(c.date_debut.slice(0, 4)) === annee) : couvaisons;
  const precedente = annee ? couvaisons.filter((c) => Number(c.date_debut.slice(0, 4)) === annee - 1) : [];
  const g = agreger(deLAnnee);
  const gp = agreger(precedente);
  const t = tauxEclosion(g);
  const tp = tauxEclosion(gp);
  const delta = t != null && tp != null ? Math.round(t - tp) : null;

  const groupe = (cle: (c: Couvaison) => string | null) => {
    const m = new Map<string, Couvaison[]>();
    for (const c of deLAnnee) { const k = cle(c); if (!k) continue; m.set(k, [...(m.get(k) ?? []), c]); }
    return [...m.entries()].map(([k, cs]) => ({ k, a: agreger(cs) })).sort((x, y) => (tauxEclosion(y.a) ?? -1) - (tauxEclosion(x.a) ?? -1));
  };
  const parEspece = groupe((c) => c.espece);
  const parCouveuse = groupe((c) => couveuses.find((x) => x.id === c.couveuse_id)?.nom ?? null);
  const parResponsable = groupe((c) => profils.find((x) => x.id === c.responsable_id)?.nom ?? null);

  const mensuel = MOIS.map((m, i) => {
    const cs = deLAnnee.filter((c) => Number(c.date_debut.slice(5, 7)) === i + 1);
    const a = agreger(cs);
    return { mois: m, 'Œufs mis': a.mis, Éclos: a.eclos };
  });

  const dernier = [...deLAnnee].filter((c) => c.statut === 'terminee' && c.oeufs_eclos != null)
    .sort((a, b) => (b.date_fin ?? '').localeCompare(a.date_fin ?? ''))[0];

  const blocTaux = (titre: string, lignes: { k: string; a: Agregat }[]) => (
    <div className="carte mt">
      <div className="gras mb">{titre}</div>
      {lignes.length === 0 ? <div className="gris petit">Pas encore de données.</div> : lignes.map(({ k, a }) => {
        const v = tauxEclosion(a);
        return (
          <div key={k} style={{ marginBottom: 12 }}>
            <div className="entre petit" style={{ marginBottom: 5 }}>
              <span>{k} <span className="gris">· {a.couvaisons} lot(s), {a.mis} œufs</span></span>
              <b>{fmtPct(v)}</b>
            </div>
            <Barre valeur={v ?? 0} />
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="page">
      <div className="entete">
        <h1 className="page-titre">Statistiques</h1>
        <select className="entree petite" style={{ width: 'auto', fontWeight: 700 }} value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>
          {annees.map((a) => <option key={a} value={a}>Année {a}</option>)}
          <option value={0}>Toutes les années</option>
        </select>
      </div>

      {deLAnnee.length === 0 ? <div className="carte"><Vide titre="Aucune couvaison sur cette période" /></div> : (
        <>
          <div className="carte">
            <div className="entre">
              <div>
                <div className="petit gris">Taux d'éclosion global</div>
                <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em' }}>{fmtPct(t)}</div>
              </div>
              {delta != null && <span className={`badge ${delta >= 0 ? 'vert' : 'rouge'}`}>{delta >= 0 ? '+' : ''}{delta} pts vs {annee - 1}</span>}
            </div>
            <div style={{ borderTop: '1px solid var(--bord)', margin: '12px 0' }} />
            <div className="grille-3">
              <div><div className="gras" style={{ fontSize: 19 }}>{g.couvaisons}</div><div className="petit gris">Couvaisons</div></div>
              <div><div className="gras" style={{ fontSize: 19 }}>{fmtNombre(g.mis)}</div><div className="petit gris">Œufs mis</div></div>
              <div><div className="gras" style={{ fontSize: 19 }}>{fmtNombre(g.eclos)}</div><div className="petit gris">Naissances</div></div>
            </div>
          </div>

          <div className="grille-2 mt">
            <div className="kpi"><div className="label">Taux de fertilité</div><div className="valeur">{fmtPct(tauxFertilite(g))}</div></div>
            <div className="kpi"><div className="label">En cours / terminées</div><div className="valeur">{deLAnnee.filter(estActive).length} / {deLAnnee.filter((c) => c.statut === 'terminee').length}</div></div>
          </div>

          {blocTaux("Taux d'éclosion par espèce", parEspece)}

          <div className="carte mt" style={{ paddingRight: 6 }}>
            <div className="gras mb">Œufs mis et éclos par mois</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mensuel} barGap={2}>
                <CartesianGrid stroke="#eef0ea" vertical={false} />
                <XAxis dataKey="mois" tick={{ fontSize: 10 }} interval={0} />
                <YAxis tick={{ fontSize: 11 }} width={34} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar isAnimationActive={false} dataKey="Œufs mis" fill="#bcd8c7" radius={[4, 4, 0, 0]} />
                <Bar isAnimationActive={false} dataKey="Éclos" fill="#1f5c40" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {blocTaux("Performance par couveuse", parCouveuse)}
          {blocTaux("Performance par responsable", parResponsable)}

          {dernier && (
            <>
              <div className="section-titre"><h2>Dernier résultat</h2></div>
              <Link to={`/couvaisons/${dernier.id}`} className="carte" style={{ display: 'block' }}>
                <div className="entre">
                  <div>
                    <div className="gras">{dernier.nom_lot || dernier.numero}</div>
                    <div className="petit gris">Terminé le {fmtCourt(dernier.date_fin)} · {dernier.nb_oeufs} œufs</div>
                  </div>
                  <div className="vert-txt" style={{ fontSize: 24, fontWeight: 800 }}>{fmtPct(taux(dernier).eclosionTotale)}</div>
                </div>
                <div className="empile mt">
                  <div style={{ width: `${((dernier.oeufs_eclos ?? 0) / dernier.nb_oeufs) * 100}%`, background: 'var(--vert)' }} />
                  <div style={{ width: `${((dernier.oeufs_non_fecondes ?? 0) / dernier.nb_oeufs) * 100}%`, background: 'var(--orange)' }} />
                  <div style={{ width: `${((dernier.oeufs_non_eclos ?? 0) / dernier.nb_oeufs) * 100}%`, background: 'var(--rouge)' }} />
                </div>
                <div className="legende">
                  <span><i style={{ background: 'var(--vert)' }} />{dernier.oeufs_eclos} éclos</span>
                  <span><i style={{ background: 'var(--orange)' }} />{dernier.oeufs_non_fecondes ?? 0} clairs</span>
                  <span><i style={{ background: 'var(--rouge)' }} />{dernier.oeufs_non_eclos ?? 0} non éclos</span>
                </div>
              </Link>
            </>
          )}
        </>
      )}
    </div>
  );
}
