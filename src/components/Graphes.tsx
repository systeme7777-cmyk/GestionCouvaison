// Graphiques SVG légers : barres groupées et courbe, avec infobulle au toucher et vue tableau.
import { useMemo, useRef, useState } from 'react';
import { argent, nombre } from '../lib/format';

export interface Serie { cle: string; nom: string; couleur: string }

function echelle(max: number) {
  if (max <= 0) return { max: 1, pas: [0, 1] };
  const brut = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(brut)));
  const m = [1, 2, 2.5, 5, 10].find((k) => k * p >= brut)! * p;
  const haut = Math.ceil(max / m) * m;
  const pas: number[] = [];
  for (let v = 0; v <= haut + 1e-9; v += m) pas.push(v);
  return { max: haut, pas };
}

const court = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M';
  if (a >= 1e3) return (v / 1e3).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k';
  return v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
};

export function BarresGroupees({ donnees, series, monnaie = true, hauteur = 190 }: {
  donnees: { etiquette: string; valeurs: Record<string, number> }[];
  series: Serie[]; monnaie?: boolean; hauteur?: number;
}) {
  const [survol, setSurvol] = useState<number | null>(null);
  const [tableau, setTableau] = useState(false);
  const L = 340, H = hauteur, g = 34, b = 22, h = 8;
  const max = Math.max(0, ...donnees.flatMap((d) => series.map((s) => d.valeurs[s.cle] || 0)));
  const ech = echelle(max);
  const largeurGroupe = (L - g - 4) / Math.max(1, donnees.length);
  const larg = Math.max(3, Math.min(14, (largeurGroupe - 6) / series.length - 2));
  const y = (v: number) => H - b - ((H - b - h) * v) / ech.max;
  const fmt = (v: number) => (monnaie ? argent(v) : nombre(v));

  return (
    <div className="graphe">
      <div className="legende">
        {series.map((s) => <span key={s.cle}><i style={{ background: s.couleur }} />{s.nom}</span>)}
        <button className="btn lien petit" style={{ marginLeft: 'auto' }} onClick={() => setTableau(!tableau)}>
          {tableau ? 'Voir le graphique' : 'Voir le tableau'}
        </button>
      </div>
      {tableau ? (
        <div className="tableau-wrap">
          <table className="tableau">
            <thead><tr><th>Période</th>{series.map((s) => <th key={s.cle} className="n">{s.nom}</th>)}</tr></thead>
            <tbody>{donnees.map((d) => (
              <tr key={d.etiquette}><td>{d.etiquette}</td>{series.map((s) => <td key={s.cle} className="n">{fmt(d.valeurs[s.cle] || 0)}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Graphique en barres" onMouseLeave={() => setSurvol(null)}>
            <g className="grille">{ech.pas.map((v) => <line key={v} x1={g} x2={L} y1={y(v)} y2={y(v)} />)}</g>
            <g className="axe">
              {ech.pas.map((v) => <text key={v} x={g - 5} y={y(v) + 3} textAnchor="end">{court(v)}</text>)}
              {donnees.map((d, i) => (donnees.length <= 12 || i % 2 === 0) && (
                <text key={i} x={g + largeurGroupe * i + largeurGroupe / 2} y={H - 7} textAnchor="middle">{d.etiquette}</text>
              ))}
            </g>
            {donnees.map((d, i) => {
              const x0 = g + largeurGroupe * i + (largeurGroupe - series.length * (larg + 2) + 2) / 2;
              return (
                <g key={i}>
                  {series.map((s, j) => {
                    const v = d.valeurs[s.cle] || 0;
                    const hy = y(v), hb = H - b - hy;
                    if (hb <= 0) return null;
                    const r = Math.min(4, larg / 2, hb);
                    const x = x0 + j * (larg + 2);
                    return (
                      <path key={s.cle} fill={s.couleur} opacity={survol === null || survol === i ? 1 : 0.45}
                        d={`M${x},${H - b} V${hy + r} Q${x},${hy} ${x + r},${hy} H${x + larg - r} Q${x + larg},${hy} ${x + larg},${hy + r} V${H - b} Z`} />
                    );
                  })}
                  <rect x={g + largeurGroupe * i} y={0} width={largeurGroupe} height={H - b} fill="transparent"
                    onMouseEnter={() => setSurvol(i)} onClick={() => setSurvol(survol === i ? null : i)} />
                </g>
              );
            })}
            <line x1={g} x2={L} y1={H - b} y2={H - b} stroke="#c9d3cb" />
          </svg>
          {survol !== null && donnees[survol] && (
            <div className="infobulle" style={{ left: `${((g + largeurGroupe * survol + largeurGroupe / 2) / L) * 100}%`, top: 4 }}>
              <b>{donnees[survol].etiquette}</b>
              {series.map((s) => <div key={s.cle}><i style={{ background: s.couleur }} />{s.nom} : {fmt(donnees[survol].valeurs[s.cle] || 0)}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Courbe({ points, nom, couleur = '#1f6b35', unite = '', hauteur = 170 }: {
  points: { etiquette: string; valeur: number }[]; nom: string; couleur?: string; unite?: string; hauteur?: number;
}) {
  const [survol, setSurvol] = useState<number | null>(null);
  const [tableau, setTableau] = useState(false);
  const ref = useRef<SVGSVGElement>(null);
  const L = 340, H = hauteur, g = 34, b = 22, h = 8;
  const max = Math.max(0, ...points.map((p) => p.valeur));
  const ech = echelle(max);
  const x = (i: number) => g + (points.length <= 1 ? (L - g) / 2 : ((L - g - 6) * i) / (points.length - 1));
  const y = (v: number) => H - b - ((H - b - h) * v) / ech.max;
  const chemin = useMemo(() => points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.valeur)}`).join(' '), [points, ech.max]);
  const pas = Math.max(1, Math.ceil(points.length / 6));

  const surMouvement = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || points.length === 0) return;
    const px = ((clientX - r.left) / r.width) * L;
    let best = 0, d = Infinity;
    points.forEach((_, i) => { const dd = Math.abs(x(i) - px); if (dd < d) { d = dd; best = i; } });
    setSurvol(best);
  };

  return (
    <div className="graphe">
      <div className="legende">
        <span style={{ fontWeight: 600 }}>{nom}</span>
        <button className="btn lien petit" style={{ marginLeft: 'auto' }} onClick={() => setTableau(!tableau)}>
          {tableau ? 'Voir le graphique' : 'Voir le tableau'}
        </button>
      </div>
      {tableau ? (
        <div className="tableau-wrap">
          <table className="tableau">
            <thead><tr><th>Date</th><th className="n">{nom}</th></tr></thead>
            <tbody>{points.map((p) => <tr key={p.etiquette}><td>{p.etiquette}</td><td className="n">{nombre(p.valeur)} {unite}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg ref={ref} viewBox={`0 0 ${L} ${H}`} role="img" aria-label={nom}
            onMouseMove={(e) => surMouvement(e.clientX)} onMouseLeave={() => setSurvol(null)}
            onTouchStart={(e) => surMouvement(e.touches[0].clientX)} onTouchMove={(e) => surMouvement(e.touches[0].clientX)}>
            <g className="grille">{ech.pas.map((v) => <line key={v} x1={g} x2={L} y1={y(v)} y2={y(v)} />)}</g>
            <g className="axe">
              {ech.pas.map((v) => <text key={v} x={g - 5} y={y(v) + 3} textAnchor="end">{court(v)}</text>)}
              {points.map((p, i) => i % pas === 0 && <text key={i} x={x(i)} y={H - 7} textAnchor="middle">{p.etiquette}</text>)}
            </g>
            <line x1={g} x2={L} y1={H - b} y2={H - b} stroke="#c9d3cb" />
            {points.length > 0 && <path d={`${chemin} L${x(points.length - 1)},${H - b} L${x(0)},${H - b} Z`} fill={couleur} opacity={0.08} />}
            <path d={chemin} fill="none" stroke={couleur} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {survol !== null && points[survol] && (
              <>
                <line x1={x(survol)} x2={x(survol)} y1={h} y2={H - b} stroke="#9aa79d" strokeDasharray="3 3" />
                <circle cx={x(survol)} cy={y(points[survol].valeur)} r={4.5} fill={couleur} stroke="#fff" strokeWidth={2} />
              </>
            )}
          </svg>
          {survol !== null && points[survol] && (
            <div className="infobulle" style={{ left: `${(x(survol) / L) * 100}%`, top: 4 }}>
              <b>{points[survol].etiquette}</b><div>{nombre(points[survol].valeur)} {unite}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
