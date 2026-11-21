import { useState } from "react";
import { HashRouter, NavLink, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { Bell, History, Home, LayoutDashboard, Megaphone, User, Users, HeartHandshake } from "./components/icons";
import { Spinner, TopBar } from "./components/ui";
import { SessionProvider, useSession } from "./lib/session";
import { ChangePasswordScreen, ForcedPasswordScreen, LoginScreen, SetupOwnerScreen } from "./screens/auth";
import { CounterScreen, HomeScreen } from "./screens/participant";
import { AuditScreen, HistoryScreen, NotificationsScreen, ProfileScreen } from "./screens/shared";
import {
  AssignScreen, CampaignDetailScreen, CampaignFormScreen, CampaignsScreen, DashboardScreen, MemberDetailScreen, MemberFormScreen, MembersScreen,
} from "./screens/admin";

export default function App() {
  return (
    <SessionProvider>
      <HashRouter>
        <Root />
      </HashRouter>
    </SessionProvider>
  );
}

function Root() {
  const { state, recheckOwner } = useSession();
  const [setup, setSetup] = useState(false);
  if (state.kind === "loading") return <div className="splash"><img src="/icons/logo.svg" alt="" width={140} height={140} /><Spinner /></div>;
  if (state.kind === "signedOut") {
    if (setup && state.ownerExists !== true) return <SetupOwnerScreen onBack={() => setSetup(false)} />;
    return <LoginScreen ownerExists={state.ownerExists} onSetup={() => setSetup(true)} onRetry={() => void recheckOwner()} />;
  }
  if (state.profile.must_change_password) return <ForcedPasswordScreen />;
  const isAdmin = state.profile.role === "admin";
  return (
    <Routes>
      <Route path="/" element={<Tabbed />} />
      <Route path="/onglet/:tab" element={<Tabbed />} />
      <Route path="/compteur/:id" element={<CounterScreen />} />
      <Route path="/notifications" element={<NotificationsScreen withTopBar />} />
      <Route path="/historique" element={<HistoryScreen withTopBar />} />
      <Route path="/mot-de-passe" element={<ChangePasswordScreen />} />
      {isAdmin && (
        <>
          <Route path="/journal" element={<AuditScreen />} />
          <Route path="/campagne-nouvelle" element={<CampaignFormScreen />} />
          <Route path="/campagne/:id" element={<CampaignDetailScreen />} />
          <Route path="/campagne/:id/modifier" element={<CampaignFormScreen />} />
          <Route path="/campagne/:id/participants" element={<AssignScreen />} />
          <Route path="/membre-nouveau" element={<MemberFormScreen />} />
          <Route path="/membre/:id" element={<MemberDetailScreen />} />
          <Route path="/membre/:id/modifier" element={<MemberFormScreen />} />
        </>
      )}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const ADMIN_TABS = [
  { key: "accueil", label: "Accueil", icon: LayoutDashboard, title: "Tableau de bord" },
  { key: "campagnes", label: "Campagnes", icon: Megaphone, title: "Campagnes" },
  { key: "membres", label: "Membres", icon: Users, title: "Membres" },
  { key: "zikr", label: "Mon Zikr", icon: HeartHandshake, title: "Mon Zikr" },
  { key: "profil", label: "Profil", icon: User, title: "Profil" },
];
const PARTICIPANT_TABS = [
  { key: "accueil", label: "Accueil", icon: Home, title: "ANSAROUDINE ZIKR" },
  { key: "historique", label: "Historique", icon: History, title: "Historique" },
  { key: "notifications", label: "Notifications", icon: Bell, title: "Notifications" },
  { key: "profil", label: "Profil", icon: User, title: "Profil" },
];

function Tabbed() {
  const { state, unread } = useSession();
  const navigate = useNavigate();
  const profile = state.kind === "signedIn" ? state.profile : null;
  const isAdmin = profile?.role === "admin";
  const tabs = isAdmin ? ADMIN_TABS : PARTICIPANT_TABS;
  const current = useParams().tab ?? "accueil";
  const tab = tabs.find((t) => t.key === current) ?? tabs[0]!;

  const bell = tab.key !== "notifications" && (
    <button className="icon-btn badge-wrap" aria-label="Notifications"
      onClick={() => (isAdmin ? navigate("/notifications") : navigate("/onglet/notifications"))}>
      <Bell size={22} />
      {unread > 0 && <span className="badge">{unread > 99 ? "99+" : unread}</span>}
    </button>
  );

  return (
    <div className="tabbed">
      <TopBar title={tab.title} actions={bell} />
      <main className="tab-content">
        {tab.key === "accueil" && (isAdmin ? <DashboardScreen /> : <HomeScreen />)}
        {tab.key === "campagnes" && <CampaignsScreen />}
        {tab.key === "membres" && <MembersScreen />}
        {tab.key === "zikr" && <HomeScreen />}
        {tab.key === "historique" && <HistoryScreen />}
        {tab.key === "notifications" && <NotificationsScreen />}
        {tab.key === "profil" && <ProfileScreen />}
      </main>
      <nav className="bottom-nav">
        {tabs.map((t) => (
          <NavLink key={t.key} to={`/onglet/${t.key}`} replace className={() => (t.key === tab.key ? "on" : "")}>
            <span className="nav-icon">
              <t.icon size={22} />
              {t.key === "notifications" && unread > 0 && <span className="badge">{unread > 99 ? "99+" : unread}</span>}
            </span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
