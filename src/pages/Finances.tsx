import { Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BarresGroupees } from '../components/Graphes';
import { bornesPeriode, ChoixPeriode, MenuExport, Page, type Periode } from '../components/ui';
import { useTout } from '../hooks/useData';
import { actifs, bilan, filtrer } from '../lib/calc';
import { exporter } from '../lib/export';
import { argent, dateFr, MOIS_COURTS } from '../lib/format';

export function Finances() {
  const t = useTout();
  const [periode, setPeriode] = useState<Periode>(bornesPeriode('annee'));
  const [espece, setEspece] = useState('');
  const f = { du: periode.du, au: periode.au, espece_id: espece || null };
  const b = useMemo(() => bilan(t, f, Number(t.parametres.tresorerie_initiale || 0)), [t, periode, espece]);
  const parMois = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    const add = (d: string, k: string, v: number) => {
      const c = d.slice(0, 7);
      const r = m.get(c) ?? { ventes: 0, achats: 0, depenses: 0 };
      r[k] += v; m.set(c, r);
    };
    filtrer(t.ventes, f).forEach((v) => add(v.date, 'ventes', Number(v.montant_total ?? 0)));
    filtrer(t.revenus, f).forEach((v) => add(v.date, 'ventes', Number(v.montant)));
    filtrer(t.achats, f).forEach((v) => add(v.date, 'achats', Number(v.montant_total ?? 0)));
    filtrer(t.depenses, f).forEach((v) => add(v.date, 'depenses', Number(v.montant)));
    return [...m.entries()].sort((a, c) => a[0].localeCompare(c[0])).slice(-12)
      .map(([k, v]) => ({ etiquette: `${MOIS_COURTS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`, valeurs: v }));
  }, [t, periode, espece]);

  const lignes: [string, number, string?][] = [
    ['Chiffre d\'affaires (ventes)', b.totalVentes, 'Montant total facturé, encaissé ou non'],
    ['Autres revenus', b.autresRevenus],
    ['Total des revenus', b.totalRevenus],
    ['Total des achats', b.totalAchats],
    ['Total des dépenses', b.totalDepenses],
    ["Coûts d'achat des lots", b.coutLots],
    ['Total des charges', b.chargesTotales],
    ['Résultat (bénéfice / perte)', b.resultat, 'Revenus − charges'],
    ['Montants encaissés', b.encaisse, 'Argent réellement reçu'],
    ['Montants payés', b.paye, 'Argent réellement sorti'],
    ['Dettes clients', b.dettesClients, 'Reste à encaisser'],
    ['Dettes fournisseurs', b.dettesFournisseurs, 'Reste à payer'],
    ['Trésorerie disponible', b.tresorerie, 'Solde initial + encaissements − paiements (depuis le début)'],
  ];
  const sous = `${periode.du ? `Du ${dateFr(periode.du)} au ${dateFr(periode.au)}` : 'Toutes périodes'}${espece ? ' · ' + t.especes.find((e) => e.id === espece)?.nom : ''}`;
  const exp = (fm: 'pdf' | 'xlsx' | 'csv') => exporter(fm, 'finances', 'Situation financière', lignes, [
    { titre: 'Indicateur', valeur: (l) => l[0] },
    { titre: 'Montant', valeur: (l) => argent(l[1]), brut: (l) => l[1], droite: true },
    { titre: 'Explication', valeur: (l) => l[2] ?? '' },
  ], sous);

  const Ligne = ({ l, v, gras, cls }: { l: string; v: number; gras?: boolean; cls?: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--bord)', fontWeight: gras ? 700 : 400 }}>
      <span>{l}</span><span className={cls} style={{ fontVariantNumeric: 'tabular-nums' }}>{argent(v)}</span>
    </div>
  );

  return (
    <Page titre="Finances" sousTitre={sous}>
      <ChoixPeriode periode={periode} onChange={setPeriode} />
      <div className="outils">
        <select className="saisie" value={espece} onChange={(e) => setEspece(e.target.value)} aria-label="Espèce" style={{ flex: 1 }}>
          <option value="">Toutes les espèces</option>{actifs(t.especes).map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
        </select>
        <MenuExport onExport={exp} />
      </div>
      <div className="grille-kpi">
        <div className={'kpi vert'}><div className="lib">{b.resultat >= 0 ? 'Bénéfice' : 'Perte'}</div><div className="val">{argent(b.resultat)}</div><div className="sous">Revenus − charges</div></div>
        <div className={'kpi' + (b.tresorerie < 0 ? ' negatif' : ' positif')}><div className="lib">Trésorerie disponible</div><div className="val">{argent(b.tresorerie)}</div><div className="sous">Argent en caisse</div></div>
        <div className="kpi"><div className="lib">Chiffre d'affaires</div><div className="val">{argent(b.totalVentes)}</div></div>
        <div className="kpi"><div className="lib">Dettes clients</div><div className="val">{argent(b.dettesClients)}</div></div>
        <div className="kpi"><div className="lib">Dettes fournisseurs</div><div className="val">{argent(b.dettesFournisseurs)}</div></div>
        <div className="kpi"><div className="lib">Encaissé − payé</div><div className="val">{argent(b.encaisse - b.paye)}</div><div className="sous">Flux de la période</div></div>
      </div>
      <div className="carte">
        <h2>Compte de résultat</h2>
        <Ligne l="Ventes (chiffre d'affaires)" v={b.totalVentes} />
        <Ligne l="+ Autres revenus" v={b.autresRevenus} />
        <Ligne l="= Total des revenus" v={b.totalRevenus} gras />
        <Ligne l="− Achats" v={b.totalAchats} />
        <Ligne l="− Dépenses" v={b.totalDepenses} />
        <Ligne l="− Coûts d'achat des lots" v={b.coutLots} />
        <Ligne l="= Résultat" v={b.resultat} gras cls={b.resultat < 0 ? 'rouge' : 'vert-t'} />
      </div>
      <div className="carte">
        <h2>Trésorerie et dettes</h2>
        <Ligne l="Montants encaissés (période)" v={b.encaisse} />
        <Ligne l="Montants payés (période)" v={b.paye} />
        <Ligne l="Dettes clients (à encaisser)" v={b.dettesClients} />
        <Ligne l="Dettes fournisseurs (à payer)" v={b.dettesFournisseurs} />
        <Ligne l="Trésorerie disponible" v={b.tresorerie} gras cls={b.tresorerie < 0 ? 'rouge' : ''} />
      </div>
      <div className="carte">
        <h2>Évolution mensuelle</h2>
        <BarresGroupees donnees={parMois} series={[
          { cle: 'ventes', nom: 'Revenus', couleur: 'var(--serie-ventes)' },
          { cle: 'achats', nom: 'Achats', couleur: 'var(--serie-achats)' },
          { cle: 'depenses', nom: 'Dépenses', couleur: 'var(--serie-depenses)' },
        ]} />
      </div>
      <div className="alerte vert"><Info size={17} /><div>
        <b>Chiffre d'affaires</b> = total vendu. <b>Trésorerie</b> = argent réellement disponible (les ventes à crédit n'y sont pas).
        <b> Bénéfice</b> = revenus − achats − dépenses − coût des lots. La trésorerie initiale se règle dans Paramètres.
      </div></div>
    </Page>
  );
}
