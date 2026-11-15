import { AlertTriangle, Bird, Egg, Package, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarresGroupees, Courbe } from '../components/Graphes';
import { nomProduit } from '../components/Selecteurs';
import { bornesPeriode, ChoixPeriode, Kpi, Page, type Periode } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { nomUtilisateur, useTout } from '../hooks/useData';
import { actifs, bilan, calculerStocks, effectifLot, filtrer, type Filtre } from '../lib/calc';
import { argent, aujourdhui, dateFr, MOIS_COURTS, nombre } from '../lib/format';
import { peut, peutUn } from '../lib/perms';

export function Accueil() {
  const t = useTout();
  const { profil } = useAuth();
  const [periode, setPeriode] = useState<Periode>(bornesPeriode('mois'));
  const [voirFiltres, setVoirFiltres] = useState(false);
  const [f, setF] = useState<Filtre>({});
  const filtre: Filtre = { ...f, du: periode.du, au: periode.au };

  const calc = useMemo(() => {
    const lots = actifs(t.lots).filter((l) => l.statut === 'actif'
      && (!f.espece_id || l.espece_id === f.espece_id) && (!f.lot_id || l.id === f.lot_id)
      && (!f.produit_id || l.produit_id === f.produit_id));
    const effectif = lots.reduce((s, l) => s + effectifLot(l, t).actuel, 0);
    const prods = filtrer(t.productions, filtre);
    const oeufsPeriode = prods.reduce((s, p) => s + Number(p.oeufs_pondus || 0), 0);
    const oeufsJour = filtrer(t.productions, { ...f, du: aujourdhui(), au: aujourdhui() }).reduce((s, p) => s + Number(p.oeufs_pondus || 0), 0);
    const stocks = calculerStocks(t);
    const produits = actifs(t.produits).filter((p) => p.stockable && (!f.espece_id || !p.espece_id || p.espece_id === f.espece_id) && (!f.produit_id || p.id === f.produit_id));
    const enStock = produits.filter((p) => (stocks.get(p.id)?.disponible ?? 0) > 0);
    const faibles = produits.filter((p) => Number(p.seuil_alerte) > 0 && (stocks.get(p.id)?.disponible ?? 0) <= Number(p.seuil_alerte));
    const b = bilan(t, filtre, Number(t.parametres.tresorerie_initiale || 0));

    // Graphique financier : par jour si la période est courte, sinon par mois
    const ventes = filtrer(t.ventes, filtre), achats = filtrer(t.achats, filtre), depenses = filtrer(t.depenses, filtre);
    const toutes = [...ventes, ...achats, ...depenses].map((x) => x.date).sort();
    const debut = filtre.du ?? toutes[0] ?? aujourdhui();
    const fin = filtre.au ?? aujourdhui();
    const jours = Math.round((Date.parse(fin) - Date.parse(debut)) / 86400000) + 1;
    const parJour = jours <= 31;
    const cle = (d: string) => (parJour ? d.slice(0, 10) : d.slice(0, 7));
    const groupes = new Map<string, Record<string, number>>();
    if (parJour) {
      for (let i = 0; i < Math.max(1, jours); i++) {
        const d = new Date(Date.parse(debut) + i * 86400000).toISOString().slice(0, 10);
        groupes.set(d, { ventes: 0, achats: 0, depenses: 0 });
      }
    } else {
      let [y, m] = debut.slice(0, 7).split('-').map(Number);
      const [yf, mf] = fin.slice(0, 7).split('-').map(Number);
      let garde = 0;
      while ((y < yf || (y === yf && m <= mf)) && garde++ < 120) {
        groupes.set(`${y}-${String(m).padStart(2, '0')}`, { ventes: 0, achats: 0, depenses: 0 });
        m++; if (m > 12) { m = 1; y++; }
      }
    }
    const ajouter = (d: string, k: string, v: number) => { const g = groupes.get(cle(d)); if (g) g[k] += v; };
    ventes.forEach((v) => ajouter(v.date, 'ventes', Number(v.montant_total ?? v.quantite * v.prix_unitaire)));
    achats.forEach((a) => ajouter(a.date, 'achats', Number(a.montant_total ?? a.quantite * a.prix_unitaire)));
    depenses.forEach((x) => ajouter(x.date, 'depenses', Number(x.montant)));
    const barres = [...groupes.entries()].slice(-24).map(([k, v]) => ({
      etiquette: parJour ? k.slice(8, 10) : `${MOIS_COURTS[Number(k.slice(5, 7)) - 1]}${k.slice(2, 4) !== aujourdhui().slice(2, 4) ? ' ' + k.slice(2, 4) : ''}`,
      valeurs: v,
    }));

    // Courbe de ponte (30 derniers jours de la période)
    const finPonte = filtre.au ?? aujourdhui();
    const debutPonte = filtre.du && Date.parse(finPonte) - Date.parse(filtre.du) < 30 * 86400000 ? filtre.du : new Date(Date.parse(finPonte) - 29 * 86400000).toISOString().slice(0, 10);
    const ponte = new Map<string, number>();
    for (let d = Date.parse(debutPonte); d <= Date.parse(finPonte); d += 86400000) ponte.set(new Date(d).toISOString().slice(0, 10), 0);
    filtrer(t.productions, { ...f, du: debutPonte, au: finPonte }).forEach((p) => ponte.set(p.date, (ponte.get(p.date) ?? 0) + Number(p.oeufs_pondus || 0)));
    const courbe = [...ponte.entries()].map(([d, v]) => ({ etiquette: dateFr(d).slice(0, 5), valeur: v }));

    return { lots, effectif, oeufsPeriode, oeufsJour, enStock, faibles, stocks, b, barres, courbe };
  }, [t, periode, f]);

  const voitFinances = peut(profil, 'finances');
  const nomExploitation = t.parametres.nom_exploitation || 'ANSAR ELEVAGE';

  return (
    <Page titre={nomExploitation} sousTitre={`Bonjour ${profil?.prenom || ''} · Tableau de bord`}>
      <ChoixPeriode periode={periode} onChange={setPeriode} />
      <button className="btn second petit" style={{ marginBottom: 10 }} onClick={() => setVoirFiltres(!voirFiltres)}>
        <SlidersHorizontal size={15} />Filtres{Object.values(f).some(Boolean) ? ' (actifs)' : ''}
      </button>
      {voirFiltres && (
        <div className="carte">
          <div className="filtres-grille">
            <select className="saisie" value={f.espece_id ?? ''} onChange={(e) => setF({ ...f, espece_id: e.target.value || null })} aria-label="Espèce">
              <option value="">Toutes les espèces</option>
              {actifs(t.especes).map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
            <select className="saisie" value={f.produit_id ?? ''} onChange={(e) => setF({ ...f, produit_id: e.target.value || null })} aria-label="Produit">
              <option value="">Tous les produits</option>
              {actifs(t.produits).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
            <select className="saisie" value={f.lot_id ?? ''} onChange={(e) => setF({ ...f, lot_id: e.target.value || null })} aria-label="Lot">
              <option value="">Tous les lots</option>
              {actifs(t.lots).map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
            </select>
            <select className="saisie" value={f.user_id ?? ''} onChange={(e) => setF({ ...f, user_id: e.target.value || null })} aria-label="Utilisateur">
              <option value="">Tous les utilisateurs</option>
              {t.profils.filter((p) => !p.supprime).map((p) => <option key={p.id} value={p.id}>{nomUtilisateur(t.profils, p.id)}</option>)}
            </select>
          </div>
          <button className="btn lien petit" onClick={() => setF({})}>Effacer les filtres</button>
        </div>
      )}

      <div className="grille-kpi">
        {peut(profil, 'elevage') && <Kpi cls="vert" icone={<Bird size={14} />} lib="Effectif total" val={nombre(calc.effectif)} sous={`${calc.lots.length} lot${calc.lots.length > 1 ? 's' : ''} actif${calc.lots.length > 1 ? 's' : ''}`} />}
        {peut(profil, 'production') && <Kpi cls="jaune" icone={<Egg size={14} />} lib="Œufs aujourd'hui" val={nombre(calc.oeufsJour)} sous={`${nombre(calc.oeufsPeriode)} sur la période`} />}
        {peut(profil, 'stocks') && <Kpi icone={<Package size={14} />} lib="Produits en stock" val={nombre(calc.enStock.length)} sous={calc.faibles.length ? `${calc.faibles.length} alerte(s) stock faible` : 'Aucune alerte'} cls={calc.faibles.length ? 'negatif' : ''} />}
        {peutUn(profil, ['ventes', 'finances']) && <Kpi lib="Total des ventes" val={argent(calc.b.totalVentes)} />}
        {peutUn(profil, ['achats', 'finances']) && <Kpi lib="Total des achats" val={argent(calc.b.totalAchats)} />}
        {peutUn(profil, ['depenses', 'finances']) && <Kpi lib="Total des dépenses" val={argent(calc.b.totalDepenses)} />}
        {peutUn(profil, ['revenus', 'finances']) && <Kpi lib="Total des revenus" val={argent(calc.b.totalRevenus)} sous="Ventes + autres revenus" />}
        {voitFinances && <Kpi lib={calc.b.resultat >= 0 ? 'Bénéfice' : 'Perte'} val={argent(calc.b.resultat)} cls={calc.b.resultat >= 0 ? 'positif' : 'negatif'} sous="Revenus − charges" />}
        {voitFinances && <Kpi lib="Dettes clients" val={argent(calc.b.dettesClients)} sous="Reste à encaisser" />}
        {voitFinances && <Kpi lib="Dettes fournisseurs" val={argent(calc.b.dettesFournisseurs)} sous="Reste à payer" />}
        {voitFinances && <Kpi lib="Trésorerie" val={argent(calc.b.tresorerie)} sous="Solde disponible" cls={calc.b.tresorerie < 0 ? 'negatif' : ''} />}
      </div>

      {calc.faibles.length > 0 && peut(profil, 'stocks') && (
        <div className="carte">
          <h2><AlertTriangle size={17} color="#b9770e" />Stocks faibles</h2>
          {calc.faibles.slice(0, 6).map((p) => (
            <Link key={p.id} to={`/stocks/${p.id}`} className="ligne" style={{ textDecoration: 'none', color: 'inherit', padding: '8px 0' }}>
              <div className="corps"><b>{p.nom}</b><small>Seuil : {nombre(p.seuil_alerte)} {p.unite}</small></div>
              <div className="fin"><span className="badge rouge">{nombre(calc.stocks.get(p.id)?.disponible)} {p.unite}</span></div>
            </Link>
          ))}
        </div>
      )}

      {peutUn(profil, ['finances', 'ventes', 'achats', 'depenses']) && (
        <div className="carte">
          <h2>Ventes, achats et dépenses</h2>
          <BarresGroupees donnees={calc.barres} series={[
            ...(peutUn(profil, ['ventes', 'finances']) ? [{ cle: 'ventes', nom: 'Ventes', couleur: 'var(--serie-ventes)' }] : []),
            ...(peutUn(profil, ['achats', 'finances']) ? [{ cle: 'achats', nom: 'Achats', couleur: 'var(--serie-achats)' }] : []),
            ...(peutUn(profil, ['depenses', 'finances']) ? [{ cle: 'depenses', nom: 'Dépenses', couleur: 'var(--serie-depenses)' }] : []),
          ]} />
        </div>
      )}

      {peut(profil, 'production') && (
        <div className="carte">
          <h2>Ponte quotidienne</h2>
          <Courbe points={calc.courbe} nom="Œufs pondus par jour" unite="œufs" />
        </div>
      )}

      {f.produit_id && peut(profil, 'stocks') && (
        <div className="carte">
          <h2>Stock : {nomProduit(t, f.produit_id)}</h2>
          <div className="kpi"><div className="val">{nombre(calc.stocks.get(f.produit_id)?.disponible)}</div></div>
        </div>
      )}
    </Page>
  );
}
