import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useLiveQuery } from 'dexie-react-hooks';
import { supabase } from '../lib/supabase';
import { db, viderBaseLocale } from '../lib/db';
import { arreterSync, demarrerSync } from '../lib/sync';
import { nomAppareil } from '../lib/natif';
import type { Profile, Role } from '../lib/types';

interface AuthCtx {
  pret: boolean;
  session: Session | null;
  profil: Profile | null;
  role: Role | null;
  peutEcrire: boolean;
  estAdmin: boolean;
  rechargerProfil: () => Promise<void>;
  deconnexion: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [pret, setPret] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const uid = session?.user.id;
  const profil = useLiveQuery(() => (uid ? db.profiles.get(uid) : undefined), [uid]) ?? null;

  const rechargerProfil = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (data) await db.profiles.put(data);
  }, [uid]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      // Si un autre compte était utilisé sur ce téléphone, on repart d'une base vide
      const precedent = (await db.meta.get('utilisateur'))?.value;
      if (data.session && precedent && precedent !== data.session.user.id) await viderBaseLocale();
      setSession(data.session);
      setPret(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      if (evt === 'SIGNED_OUT') { arreterSync(); setSession(null); return; }
      if (s) setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!uid) return;
    (async () => {
      const precedent = (await db.meta.get('utilisateur'))?.value;
      if (precedent && precedent !== uid) await viderBaseLocale();
      await db.meta.put({ key: 'utilisateur', value: uid });
      await rechargerProfil().catch(() => undefined); // hors ligne : on garde le profil local
    })();
  }, [uid, rechargerProfil]);

  const role = profil?.role ?? null;
  const membre = role === 'admin' || role === 'operateur' || role === 'lecteur';

  useEffect(() => {
    if (!uid || !membre) return;
    let annule = false;
    nomAppareil().then((app) => { if (!annule) demarrerSync(uid, app); });
    return () => { annule = true; };
  }, [uid, membre]);

  const deconnexion = useCallback(async () => {
    arreterSync();
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    await viderBaseLocale();
    setSession(null);
  }, []);

  return (
    <Ctx.Provider value={{
      pret, session, profil, role,
      peutEcrire: role === 'admin' || role === 'operateur',
      estAdmin: role === 'admin',
      rechargerProfil, deconnexion,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
