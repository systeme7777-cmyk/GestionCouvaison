import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { db, getMeta, setMeta } from '../lib/db';
import { supabase } from '../lib/supabase';
import {
  arreterSynchronisation, definirUtilisateur, demarrerSynchronisation, estErreurReseau, traduireErreur, viderLocal,
} from '../lib/sync';
import type { Profil } from '../lib/types';

interface CtxAuth {
  chargement: boolean;
  userId: string | null;
  email: string | null;
  profil: Profil | null;
  connexion: (email: string, mdp: string) => Promise<string | null>;
  deconnexion: (forcer?: boolean) => Promise<string | null>;
  changerMotDePasse: (mdp: string) => Promise<string | null>;
  reinitialiserParEmail: (email: string) => Promise<string | null>;
}

const Ctx = createContext<CtxAuth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [chargement, setChargement] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const profil = useLiveQuery(async () => (userId ? ((await db.ae_profils.get(userId)) as Profil) ?? null : null), [userId]) ?? null;

  const initialiser = useCallback(async (uid: string, mail: string | null) => {
    const precedent = await getMeta<string | null>('user_id', null);
    if (precedent && precedent !== uid) await viderLocal();
    await setMeta('user_id', uid);
    definirUtilisateur(uid);
    setUserId(uid);
    setEmail(mail);
    try {
      const { data, error } = await supabase.rpc('ae_connexion');
      if (!error && data && (data as any).id) await db.ae_profils.put({ ...(data as any), _attente: false });
    } catch { /* hors connexion : profil en cache */ }
    demarrerSynchronisation();
  }, []);

  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const s = data.session;
        if (s?.user && actif) await initialiser(s.user.id, s.user.email ?? null);
      } finally {
        if (actif) setChargement(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((evt) => {
      if (evt === 'SIGNED_OUT') {
        arreterSynchronisation();
        definirUtilisateur(null);
        setUserId(null);
      }
    });
    return () => { actif = false; sub.subscription.unsubscribe(); arreterSynchronisation(); };
  }, [initialiser]);

  const connexion = async (mail: string, mdp: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: mail.trim().toLowerCase(), password: mdp });
    if (error) {
      if (estErreurReseau(error)) return 'Pas de connexion Internet. La première connexion nécessite Internet.';
      if (/invalid login/i.test(error.message)) return 'E-mail ou mot de passe incorrect.';
      return traduireErreur(error);
    }
    await initialiser(data.user.id, data.user.email ?? null);
    return null;
  };

  const deconnexion = async (forcer = false) => {
    const attente = await db.attente.count();
    if (attente > 0 && !forcer) {
      return `${attente} opération(s) ne sont pas encore synchronisées. Connectez-vous à Internet avant de vous déconnecter, sinon elles seront perdues.`;
    }
    arreterSynchronisation();
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    await viderLocal();
    await setMeta('user_id', null);
    definirUtilisateur(null);
    setUserId(null);
    setEmail(null);
    return null;
  };

  const changerMotDePasse = async (mdp: string) => {
    if (mdp.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
    const { error } = await supabase.auth.updateUser({ password: mdp });
    if (error) {
      if (/different from the old/i.test(error.message)) return "Le nouveau mot de passe doit être différent de l'ancien.";
      if (/weak|short/i.test(error.message)) return 'Mot de passe trop faible : utilisez lettres et chiffres.';
      return traduireErreur(error);
    }
    await supabase.rpc('ae_mot_de_passe_change');
    if (userId) {
      const p = await db.ae_profils.get(userId);
      if (p) await db.ae_profils.put({ ...p, doit_changer_mdp: false });
    }
    return null;
  };

  const reinitialiserParEmail = async (mail: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(mail.trim().toLowerCase());
    return error ? traduireErreur(error) : null;
  };

  return (
    <Ctx.Provider value={{ chargement, userId, email, profil, connexion, deconnexion, changerMotDePasse, reinitialiserParEmail }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider manquant');
  return c;
}
