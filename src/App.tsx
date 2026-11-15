import { useEffect } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { SplashScreen } from '@capacitor/splash-screen';
import { BarChart3, Egg, Home, Plus, Users } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Chargement, DialogProvider } from './components/ui';
import { estNatif } from './lib/natif';
import { planifierRappels } from './lib/rappels';
import { db } from './lib/db';
import Connexion from './pages/Connexion';
import EnAttente from './pages/EnAttente';
import Accueil from './pages/Accueil';
import Couvaisons from './pages/Couvaisons';
import CouvaisonForm from './pages/CouvaisonForm';
import CouvaisonDetail from './pages/CouvaisonDetail';
import Calendrier from './pages/Calendrier';
import Couveuses from './pages/Couveuses';
import CouveuseDetail from './pages/CouveuseDetail';
import Statistiques from './pages/Statistiques';
import Equipe from './pages/Equipe';
import Parametres from './pages/Parametres';
import Rapports from './pages/Rapports';

function Navigation() {
  const { peutEcrire } = useAuth();
  const nav = useNavigate();
  return (
    <nav className="nav">
      <div>
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'actif' : '')}><Home size={22} />Accueil</NavLink>
        <NavLink to="/couvaisons" className={({ isActive }) => (isActive ? 'actif' : '')}><Egg size={22} />Couvaisons</NavLink>
        {peutEcrire
          ? <button className="fab" aria-label="Nouvelle couvaison" onClick={() => nav('/couvaisons/nouvelle')}><Plus size={28} /></button>
          : <span />}
        <NavLink to="/statistiques" className={({ isActive }) => (isActive ? 'actif' : '')}><BarChart3 size={22} />Statistiques</NavLink>
        <NavLink to="/equipe" className={({ isActive }) => (isActive ? 'actif' : '')}><Users size={22} />Équipe</NavLink>
      </div>
    </nav>
  );
}

/** Bouton retour Android, ouverture depuis une notification, reprogrammation des rappels. */
function IntegrationAndroid() {
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (!estNatif()) return;
    const h1 = CapApp.addListener('backButton', ({ canGoBack }) => {
      if (window.location.hash === '#/' || window.location.hash === '') CapApp.exitApp();
      else if (canGoBack) window.history.back();
      else nav('/');
    });
    const h2 = LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
      const id = a.notification.extra?.couvaison_id;
      nav(id ? `/couvaisons/${id}` : '/');
    });
    return () => { h1.then((h) => h.remove()); h2.then((h) => h.remove()); };
  }, [nav]);

  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  // Reprogramme les rappels quand les couvaisons ou opérations changent
  const signature = useLiveQuery(async () => {
    const ops = await db.operations.toArray();
    const cs = await db.couvaisons.toArray();
    return ops.map((o) => o.id + o.date_prevue + o.heure + o.fait + o.rappel).join() + cs.map((c) => c.id + c.statut + c.rappels_actifs + c.date_debut + c.duree_jours).join();
  }, []);
  useEffect(() => {
    if (signature === undefined) return;
    const t = setTimeout(() => planifierRappels(), 1500);
    return () => clearTimeout(t);
  }, [signature]);

  return null;
}

function Contenu() {
  const { pret, session, profil, role } = useAuth();

  useEffect(() => { if (pret && estNatif()) SplashScreen.hide(); }, [pret]);

  if (!pret) return <Chargement />;
  if (!session) return <Connexion />;
  if (!profil) return <Chargement />;
  if (role === 'en_attente' || role === 'desactive') return <EnAttente />;

  return (
    <>
      <IntegrationAndroid />
      <Routes>
        <Route path="/" element={<Accueil />} />
        <Route path="/couvaisons" element={<Couvaisons />} />
        <Route path="/couvaisons/nouvelle" element={<CouvaisonForm />} />
        <Route path="/couvaisons/:id" element={<CouvaisonDetail />} />
        <Route path="/couvaisons/:id/modifier" element={<CouvaisonForm />} />
        <Route path="/calendrier" element={<Calendrier />} />
        <Route path="/couveuses" element={<Couveuses />} />
        <Route path="/couveuses/:id" element={<CouveuseDetail />} />
        <Route path="/statistiques" element={<Statistiques />} />
        <Route path="/equipe" element={<Equipe />} />
        <Route path="/parametres" element={<Parametres />} />
        <Route path="/rapports" element={<Rapports />} />
        <Route path="*" element={<Accueil />} />
      </Routes>
      <RoutesAvecNav />
    </>
  );
}

function RoutesAvecNav() {
  const loc = useLocation();
  const sansNav = /\/(nouvelle|modifier)$/.test(loc.pathname);
  return sansNav ? null : <Navigation />;
}

export default function App() {
  return (
    <HashRouter>
      <DialogProvider>
        <AuthProvider>
          <div className="app"><Contenu /></div>
        </AuthProvider>
      </DialogProvider>
    </HashRouter>
  );
}
