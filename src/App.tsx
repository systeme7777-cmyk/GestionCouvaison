import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Bird, Home, LayoutGrid, Package, ShoppingCart } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ConfirmProvider, ToastProvider } from './components/ui';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { peut } from './lib/perms';
import { Accueil } from './pages/Accueil';
import { Achats } from './pages/Achats';
import { ClientDetail, Tiers } from './pages/Tiers';
import { AccesRefuse, ChangerMotDePasse, Connexion } from './pages/Connexion';
import { Depenses } from './pages/Depenses';
import { Elevage, LotDetail } from './pages/Elevage';
import { Finances } from './pages/Finances';
import { Historique } from './pages/Historique';
import { Menu } from './pages/Menu';
import {
  Categories, Compte, Especes, ParametresGeneraux, ParametresIndex, Produits, Sauvegarde, Synchronisation,
} from './pages/Parametres';
import { Production } from './pages/Production';
import { Rapports } from './pages/Rapports';
import { Revenus } from './pages/Revenus';
import { StockDetail, Stocks } from './pages/Stocks';
import { Utilisateurs } from './pages/Utilisateurs';
import { Ventes } from './pages/Ventes';

function BarreNav() {
  const { profil } = useAuth();
  const onglets = [
    { to: '/', t: 'Accueil', i: <Home size={22} />, ok: true },
    { to: '/elevage', t: 'Élevage', i: <Bird size={22} />, ok: peut(profil, 'elevage') },
    { to: '/ventes', t: 'Ventes', i: <ShoppingCart size={22} />, ok: peut(profil, 'ventes') },
    { to: '/stocks', t: 'Stocks', i: <Package size={22} />, ok: peut(profil, 'stocks') },
    { to: '/menu', t: 'Menu', i: <LayoutGrid size={22} />, ok: true },
  ];
  return (
    <nav className="barre-nav">
      {onglets.map((o) => o.ok ? (
        <NavLink key={o.to} to={o.to} end={o.to === '/'} className={({ isActive }) => (isActive ? 'actif' : '')}>{o.i}{o.t}</NavLink>
      ) : <span key={o.to} />)}
    </nav>
  );
}

function Garde({ module, children }: { module: string; children: ReactNode }) {
  const { profil } = useAuth();
  if (!peut(profil, module)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RetourAndroid() {
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const h = CapApp.addListener('backButton', () => {
      // Une feuille ouverte se ferme d'abord
      const ev = new Event('ae-retour', { cancelable: true });
      if (!window.dispatchEvent(ev)) return;
      if (loc.pathname === '/' || loc.pathname === '') CapApp.minimizeApp();
      else nav(-1);
    });
    return () => { h.then((x) => x.remove()); };
  }, [nav, loc.pathname]);
  return null;
}

function Coquille() {
  const { chargement, userId, profil } = useAuth();
  if (chargement) return <div className="chargement"><div className="centre"><img src="./icon.png" alt="" width={80} /><p>ANSAR ELEVAGE</p></div></div>;
  if (!userId) return <Connexion />;
  if (!profil) return <div className="chargement"><p>Chargement du profil…</p></div>;
  if (profil.supprime) return <AccesRefuse raison="Ce compte a été retiré d'ANSAR ELEVAGE par l'administrateur." />;
  if (!profil.actif) return <AccesRefuse raison="Votre compte est désactivé. Contactez l'administrateur principal." />;
  if (profil.doit_changer_mdp) return <ChangerMotDePasse />;
  return (
    <div className="app">
      <RetourAndroid />
      <Routes>
        <Route path="/" element={<Accueil />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/elevage" element={<Garde module="elevage"><Elevage /></Garde>} />
        <Route path="/elevage/:id" element={<Garde module="elevage"><LotDetail /></Garde>} />
        <Route path="/production" element={<Garde module="production"><Production /></Garde>} />
        <Route path="/achats" element={<Garde module="achats"><Achats /></Garde>} />
        <Route path="/ventes" element={<Garde module="ventes"><Ventes /></Garde>} />
        <Route path="/stocks" element={<Garde module="stocks"><Stocks /></Garde>} />
        <Route path="/stocks/:id" element={<Garde module="stocks"><StockDetail /></Garde>} />
        <Route path="/depenses" element={<Garde module="depenses"><Depenses /></Garde>} />
        <Route path="/revenus" element={<Garde module="revenus"><Revenus /></Garde>} />
        <Route path="/clients" element={<Garde module="clients"><Tiers genre="clients" /></Garde>} />
        <Route path="/clients/:id" element={<Garde module="clients"><ClientDetail genre="clients" /></Garde>} />
        <Route path="/fournisseurs" element={<Garde module="fournisseurs"><Tiers genre="fournisseurs" /></Garde>} />
        <Route path="/fournisseurs/:id" element={<Garde module="fournisseurs"><ClientDetail genre="fournisseurs" /></Garde>} />
        <Route path="/finances" element={<Garde module="finances"><Finances /></Garde>} />
        <Route path="/historique" element={<Garde module="historique"><Historique /></Garde>} />
        <Route path="/rapports" element={<Garde module="historique"><Rapports /></Garde>} />
        <Route path="/parametres" element={<ParametresIndex />} />
        <Route path="/parametres/general" element={<Garde module="parametres"><ParametresGeneraux /></Garde>} />
        <Route path="/parametres/especes" element={<Garde module="catalogue"><Especes /></Garde>} />
        <Route path="/parametres/categories" element={<Garde module="catalogue"><Categories /></Garde>} />
        <Route path="/parametres/produits" element={<Garde module="catalogue"><Produits /></Garde>} />
        <Route path="/parametres/utilisateurs" element={<Utilisateurs />} />
        <Route path="/parametres/synchronisation" element={<Synchronisation />} />
        <Route path="/parametres/sauvegarde" element={<Sauvegarde />} />
        <Route path="/parametres/compte" element={<Compte />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BarreNav />
    </div>
  );
}

export function App() {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      StatusBar.setBackgroundColor({ color: '#1F6B35' }).catch(() => {});
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      SplashScreen.hide().catch(() => {});
    }
  }, []);
  return (
    <HashRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <Coquille />
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </HashRouter>
  );
}
