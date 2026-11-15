import { useState, type FormEvent } from 'react';
import { Egg, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function traduireErreurAuth(m: string): string {
  const s = m.toLowerCase();
  if (s.includes('invalid login')) return 'E-mail ou mot de passe incorrect.';
  if (s.includes('email not confirmed')) return "Adresse e-mail pas encore confirmée : ouvrez le lien reçu par e-mail.";
  if (s.includes('already registered') || s.includes('already been registered')) return 'Un compte existe déjà avec cet e-mail.';
  if (s.includes('password should be') || s.includes('weak')) return 'Mot de passe trop faible (6 caractères minimum).';
  if (s.includes('rate limit')) return 'Trop de tentatives, réessayez dans quelques minutes.';
  if (s.includes('fetch') || s.includes('network')) return 'Pas de connexion Internet. La première connexion nécessite Internet.';
  if (s.includes('signups not allowed')) return "Les inscriptions sont fermées. Demandez à l'administrateur.";
  return m;
}

export default function Connexion() {
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion');
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [attente, setAttente] = useState(false);

  async function valider(e: FormEvent) {
    e.preventDefault();
    setErreur(''); setInfo('');
    if (mode === 'inscription' && nom.trim().length < 2) { setErreur('Indiquez votre nom complet.'); return; }
    if (mdp.length < 6) { setErreur('Le mot de passe doit contenir au moins 6 caractères.'); return; }
    setAttente(true);
    try {
      if (mode === 'connexion') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: mdp });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password: mdp, options: { data: { nom: nom.trim() } },
        });
        if (error) throw error;
        if (!data.session) {
          setInfo("Compte créé. Ouvrez l'e-mail de confirmation reçu, puis revenez vous connecter.");
          setMode('connexion');
        }
      }
    } catch (err: any) {
      setErreur(traduireErreurAuth(err.message ?? String(err)));
    } finally {
      setAttente(false);
    }
  }

  return (
    <div className="connexion">
      <div className="logo"><Egg size={32} /></div>
      <h1 className="page-titre">Gestion Couvaison</h1>
      <p className="gris" style={{ marginTop: 6, marginBottom: 24 }}>
        {mode === 'connexion' ? 'Connectez-vous pour accéder aux couvaisons de votre élevage.' : "Créez votre compte. L'administrateur devra ensuite l'approuver."}
      </p>
      {erreur && <div className="erreurs">{erreur}</div>}
      {info && <div className="note mb">{info}</div>}
      <form onSubmit={valider}>
        {mode === 'inscription' && (
          <div className="champ">
            <label htmlFor="nom">Nom complet</label>
            <input id="nom" className="entree" value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" placeholder="Ex. : Awa Diop" />
          </div>
        )}
        <div className="champ">
          <label htmlFor="email">Adresse e-mail</label>
          <input id="email" className="entree" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </div>
        <div className="champ">
          <label htmlFor="mdp">Mot de passe</label>
          <input id="mdp" className="entree" type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'} required />
        </div>
        <button className="btn primaire plein" disabled={attente} type="submit">
          {attente && <Loader2 size={18} className="tourne" />}
          {mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'}
        </button>
      </form>
      <button className="btn plein mt" style={{ border: 0, background: 'none', color: 'var(--vert)' }}
        onClick={() => { setMode(mode === 'connexion' ? 'inscription' : 'connexion'); setErreur(''); }}>
        {mode === 'connexion' ? 'Pas encore de compte ? Créer un compte' : "J'ai déjà un compte"}
      </button>
    </div>
  );
}
