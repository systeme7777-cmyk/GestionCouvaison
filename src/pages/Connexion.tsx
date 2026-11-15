import { KeyRound, LogIn, LogOut, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Alerte, Texte } from '../components/ui';
import { useAuth } from '../hooks/useAuth';

export function Connexion() {
  const { connexion, reinitialiserParEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setInfo(null); setEnCours(true);
    const r = await connexion(email, mdp);
    setEnCours(false);
    if (r) setErr(r);
  };

  const oublie = async () => {
    if (!email) { setErr("Saisissez d'abord votre adresse e-mail."); return; }
    const r = await reinitialiserParEmail(email);
    if (r) setErr(r);
    else setInfo("Si cette adresse est enregistrée, un e-mail de réinitialisation a été envoyé. Vous pouvez aussi demander à l'administrateur de réinitialiser votre accès.");
  };

  return (
    <div className="ecran-connexion">
      <div className="marque">
        <img src="./icon.png" alt="ANSAR ELEVAGE" />
        <h1>ANSAR ELEVAGE</h1>
        <p>Gestion Avicole</p>
      </div>
      <form className="carte" onSubmit={valider}>
        <h2><LogIn size={18} />Connexion</h2>
        {err && <Alerte type="rouge">{err}</Alerte>}
        {info && <Alerte type="vert">{info}</Alerte>}
        <Texte label="Adresse e-mail" type="email" valeur={email} onChange={setEmail} autoComplete="username" inputMode="email" />
        <Texte label="Mot de passe" type="password" valeur={mdp} onChange={setMdp} autoComplete="current-password" />
        <button className="btn plein" disabled={enCours || !email || !mdp}>{enCours ? 'Connexion…' : 'Se connecter'}</button>
        <button type="button" className="btn lien plein mt" onClick={oublie}>Mot de passe oublié ?</button>
        <p className="plus-petit centre" style={{ marginBottom: 0 }}>
          Les comptes sont créés par l'administrateur depuis Paramètres → Utilisateurs.
        </p>
      </form>
    </div>
  );
}

export function ChangerMotDePasse({ obligatoire = true, onFini }: { obligatoire?: boolean; onFini?: () => void }) {
  const { changerMotDePasse, deconnexion } = useAuth();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (a !== b) { setErr('Les deux mots de passe ne correspondent pas.'); return; }
    setEnCours(true);
    const r = await changerMotDePasse(a);
    setEnCours(false);
    if (r) setErr(r); else onFini?.();
  };
  const contenu = (
    <form className="carte" onSubmit={valider}>
      <h2><KeyRound size={18} />{obligatoire ? 'Choisissez votre mot de passe' : 'Changer mon mot de passe'}</h2>
      {obligatoire && <p className="plus-petit" style={{ marginTop: 0 }}>Pour votre sécurité, remplacez le mot de passe temporaire fourni par l'administrateur par un mot de passe personnel (8 caractères minimum).</p>}
      {err && <Alerte type="rouge">{err}</Alerte>}
      <Texte label="Nouveau mot de passe" type="password" valeur={a} onChange={setA} autoComplete="new-password" />
      <Texte label="Confirmer le mot de passe" type="password" valeur={b} onChange={setB} autoComplete="new-password" />
      <button className="btn plein" disabled={enCours || a.length < 8}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
      {obligatoire && <button type="button" className="btn lien plein mt" onClick={() => deconnexion(true)}>Se déconnecter</button>}
    </form>
  );
  if (!obligatoire) return contenu;
  return (
    <div className="ecran-connexion">
      <div className="marque"><img src="./icon.png" alt="" /><h1>ANSAR ELEVAGE</h1><p>Première connexion</p></div>
      {contenu}
    </div>
  );
}

export function AccesRefuse({ raison }: { raison: string }) {
  const { deconnexion, email } = useAuth();
  return (
    <div className="ecran-connexion">
      <div className="marque"><img src="./icon.png" alt="" /><h1>ANSAR ELEVAGE</h1><p>Gestion Avicole</p></div>
      <div className="carte">
        <h2><ShieldAlert size={18} />Accès non autorisé</h2>
        <p>{raison}</p>
        <p className="plus-petit">Compte : {email}</p>
        <button className="btn plein" onClick={() => deconnexion(true)}><LogOut size={18} />Se déconnecter</button>
      </div>
    </div>
  );
}
