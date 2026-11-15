import {
  BarChart3, Bird, Building2, ClipboardList, Egg, FileText, History, Package, Receipt, Settings, ShoppingBag,
  ShoppingCart, TrendingUp, Users, Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Page } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { nomRole, peut } from '../lib/perms';

export const RUBRIQUES = [
  { to: '/elevage', t: 'Élevage', m: 'elevage', i: Bird },
  { to: '/production', t: 'Ponte & production', m: 'production', i: Egg },
  { to: '/achats', t: 'Achats', m: 'achats', i: ShoppingBag },
  { to: '/ventes', t: 'Ventes', m: 'ventes', i: ShoppingCart },
  { to: '/stocks', t: 'Stocks', m: 'stocks', i: Package },
  { to: '/depenses', t: 'Dépenses', m: 'depenses', i: Receipt },
  { to: '/revenus', t: 'Revenus', m: 'revenus', i: TrendingUp },
  { to: '/clients', t: 'Clients', m: 'clients', i: Users },
  { to: '/fournisseurs', t: 'Fournisseurs', m: 'fournisseurs', i: Building2 },
  { to: '/finances', t: 'Finances', m: 'finances', i: Wallet },
  { to: '/historique', t: 'Historique', m: 'historique', i: History },
  { to: '/rapports', t: 'Rapports', m: 'historique', i: FileText },
];

export function Menu() {
  const { profil } = useAuth();
  return (
    <Page titre="Menu" sousTitre={`${profil?.prenom ?? ''} ${profil?.nom ?? ''} · ${nomRole(profil?.role ?? '')}`}>
      <div className="grille-menu">
        {RUBRIQUES.filter((r) => peut(profil, r.m)).map((r) => (
          <Link key={r.to} to={r.to} className="tuile"><span className="ico"><r.i size={24} /></span>{r.t}</Link>
        ))}
        <Link to="/parametres" className="tuile"><span className="ico"><Settings size={24} /></span>Paramètres</Link>
      </div>
      <div className="section-titre">Raccourcis</div>
      <div className="liste">
        {peut(profil, 'ventes', 'ajouter') && <Link to="/ventes?nouveau=1" className="ligne" style={{ textDecoration: 'none', color: 'inherit' }}><div className="ico-rond"><ShoppingCart size={18} /></div><div className="corps"><b>Nouvelle vente</b></div></Link>}
        {peut(profil, 'production', 'ajouter') && <Link to="/production?nouveau=1" className="ligne" style={{ textDecoration: 'none', color: 'inherit' }}><div className="ico-rond"><Egg size={18} /></div><div className="corps"><b>Saisir la ponte du jour</b></div></Link>}
        {peut(profil, 'achats', 'ajouter') && <Link to="/achats?nouveau=1" className="ligne" style={{ textDecoration: 'none', color: 'inherit' }}><div className="ico-rond"><ClipboardList size={18} /></div><div className="corps"><b>Nouvel achat</b></div></Link>}
        {peut(profil, 'depenses', 'ajouter') && <Link to="/depenses?nouveau=1" className="ligne" style={{ textDecoration: 'none', color: 'inherit' }}><div className="ico-rond"><Receipt size={18} /></div><div className="corps"><b>Nouvelle dépense</b></div></Link>}
        {peut(profil, 'finances') && <Link to="/finances" className="ligne" style={{ textDecoration: 'none', color: 'inherit' }}><div className="ico-rond"><BarChart3 size={18} /></div><div className="corps"><b>Situation financière</b></div></Link>}
      </div>
    </Page>
  );
}
