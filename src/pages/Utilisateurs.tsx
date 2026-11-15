import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { KeyRound, Pencil, Power, Share2, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Alerte, BoutonAjout, Choix, Feuille, Page, Puces, Texte, useConfirm, useToast, Vide } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useEtatSync, useTout } from '../hooks/useData';
import { db } from '../lib/db';
import { dateFr, dateHeureFr } from '../lib/format';
import { ACTIONS, MODULES, nomRole, permissionsParDefaut, ROLES } from '../lib/perms';
import { supabase } from '../lib/supabase';
import { synchroniser } from '../lib/sync';
import type { Permissions, Profil, Role } from '../lib/types';

async function appeler(corps: Record<string, any>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('ae-utilisateurs', { body: corps });
  if (error) {
    let msg = error.message;
    try { const j = await (error as any).context?.json?.(); if (j?.erreur) msg = j.erreur; } catch { /* */ }
    if (/Failed to send|fetch/i.test(msg)) msg = 'Connexion Internet nécessaire pour gérer les utilisateurs.';
    throw new Error(msg);
  }
  if (data?.erreur) throw new Error(data.erreur);
  if (data?.profil) await db.ae_profils.put({ ...data.profil, _attente: false });
  return data;
}

async function partagerAcces(p: { prenom?: string; email: string }, mdp: string) {
  const texte = `Bonjour ${p.prenom ?? ''},\nVotre accès à l'application ANSAR ELEVAGE (Gestion Avicole) :\n• E-mail : ${p.email}\n• Mot de passe temporaire : ${mdp}\nÀ la première connexion, vous choisirez votre propre mot de passe.`;
  if (Capacitor.isNativePlatform()) await Share.share({ title: 'Accès ANSAR ELEVAGE', text: texte, dialogTitle: 'Envoyer les accès' });
  else if (navigator.share) await navigator.share({ title: 'Accès ANSAR ELEVAGE', text: texte }).catch(() => {});
  else await navigator.clipboard?.writeText(texte);
}

function MatricePermissions({ valeur, onChange, bloque }: { valeur: Permissions; onChange: (p: Permissions) => void; bloque?: boolean }) {
  const basculer = (m: string, a: string, v: boolean) => {
    const n: Permissions = JSON.parse(JSON.stringify(valeur ?? {}));
    n[m] = { ...(n[m] ?? {}), [a]: v };
    if (v && a !== 'lire') n[m].lire = true;
    if (!v && a === 'lire') n[m] = { lire: false, ajouter: false, modifier: false, supprimer: false };
    onChange(n);
  };
  return (
    <table className="permissions">
      <thead><tr><th style={{ textAlign: 'left' }}>Rubrique</th>{ACTIONS.map((a) => <th key={a.cle}>{a.nom}</th>)}</tr></thead>
      <tbody>{MODULES.map((m) => (
        <tr key={m.cle}><td>{m.nom}</td>{ACTIONS.map((a) => (
          <td key={a.cle}><input type="checkbox" disabled={bloque} checked={bloque || !!valeur?.[m.cle]?.[a.cle]}
            onChange={(e) => basculer(m.cle, a.cle, e.target.checked)} aria-label={`${m.nom} ${a.nom}`} /></td>
        ))}</tr>
      ))}</tbody>
    </table>
  );
}

function FormUtilisateur({ profil, onFermer, onMdp }: { profil?: Profil | null; onFermer: () => void; onMdp: (p: any, m: string) => void }) {
  const toast = useToast();
  const [v, setV] = useState<Partial<Profil>>(profil ?? { nom: '', prenom: '', telephone: '', email: '', role: 'employe', actif: true, permissions: permissionsParDefaut('employe') });
  const [enCours, setEnCours] = useState(false);
  const s = (k: keyof Profil) => (x: any) => setV({ ...v, [k]: x });
  const valider = async () => {
    if (!v.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return toast('Adresse e-mail invalide.', true);
    if (!v.nom?.trim() && !v.prenom?.trim()) return toast('Indiquez au moins le nom ou le prénom.', true);
    setEnCours(true);
    try {
      if (profil) {
        await appeler({ action: 'modifier', id: profil.id, nom: v.nom, prenom: v.prenom, telephone: v.telephone, email: v.email, role: v.role, permissions: v.permissions });
        toast('Utilisateur modifié');
        onFermer();
      } else {
        const r = await appeler({ action: 'creer', ...v });
        if (r.existant) toast('Compte existant ajouté : il garde son mot de passe actuel.');
        else onMdp(r.profil, r.mot_de_passe_temporaire);
        onFermer();
      }
    } catch (e: any) { toast(e.message, true); }
    setEnCours(false);
  };
  return (
    <Feuille titre={profil ? "Modifier l'utilisateur" : 'Ajouter un utilisateur'} onFermer={onFermer}>
      <div className="deux">
        <Texte label="Prénom" valeur={v.prenom} onChange={s('prenom')} />
        <Texte label="Nom" valeur={v.nom} onChange={s('nom')} />
      </div>
      <Texte label="Téléphone" type="tel" inputMode="tel" valeur={v.telephone} onChange={s('telephone')} />
      <Texte label="Adresse e-mail" requis type="email" inputMode="email" valeur={v.email} onChange={s('email')} aide="Sert d'identifiant de connexion" />
      <Choix label="Rôle" valeur={v.role} onChange={(r) => setV({ ...v, role: r as Role, permissions: permissionsParDefaut(r as Role) })}
        options={ROLES.map((r) => ({ v: r.cle, t: r.nom }))} aide={ROLES.find((r) => r.cle === v.role)?.description} />
      <div className="section-titre">Permissions individuelles</div>
      {v.role === 'admin_principal' ? <Alerte type="vert">L'administrateur principal a tous les droits.</Alerte>
        : <MatricePermissions valeur={v.permissions ?? {}} onChange={(p) => setV({ ...v, permissions: p })} />}
      {!profil && <p className="plus-petit">Un mot de passe temporaire sera créé. Vous pourrez l'envoyer par WhatsApp ou SMS ; l'utilisateur choisira son propre mot de passe à la première connexion.</p>}
      <button className="btn plein mt" disabled={enCours} onClick={valider}>{enCours ? 'Enregistrement…' : profil ? 'Enregistrer' : 'Créer le compte'}</button>
    </Feuille>
  );
}

export function Utilisateurs() {
  const t = useTout();
  const { profil: moi } = useAuth();
  const sync = useEtatSync();
  const toast = useToast();
  const confirmer = useConfirm();
  const [filtre, setFiltre] = useState<'tous' | 'actifs' | 'inactifs'>('tous');
  const [form, setForm] = useState<Profil | null | 'nouveau'>(null);
  const [detail, setDetail] = useState<Profil | null>(null);
  const [mdp, setMdp] = useState<{ p: any; m: string } | null>(null);
  if (moi?.role !== 'admin_principal') return <Page titre="Utilisateurs" retour><Alerte type="rouge">Réservé à l'administrateur principal.</Alerte></Page>;

  const liste = t.profils.filter((p) => !p.supprime && (filtre === 'tous' || (filtre === 'actifs' ? p.actif : !p.actif)))
    .sort((a, b) => Number(b.actif) - Number(a.actif) || `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, 'fr'));
  const nbActifs = t.profils.filter((p) => !p.supprime && p.actif).length;
  const action = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); toast(ok); setDetail(null); synchroniser(); } catch (e: any) { toast(e.message, true); }
  };
  const d = detail ? t.profils.find((p) => p.id === detail.id) ?? detail : null;

  return (
    <Page titre="Utilisateurs" sousTitre={`${nbActifs} actif(s) · ${t.profils.filter((p) => !p.supprime).length} au total`} retour
      action={<BoutonAjout onClick={() => setForm('nouveau')} libelle="Ajouter un utilisateur" />}>
      {!sync.enLigne && <Alerte>Hors connexion : la gestion des comptes nécessite Internet.</Alerte>}
      <Puces valeur={filtre} onChange={setFiltre} options={[{ v: 'tous', t: 'Tous' }, { v: 'actifs', t: 'Actifs' }, { v: 'inactifs', t: 'Inactifs' }]} />
      {liste.length === 0 ? <Vide texte="Aucun utilisateur." /> : (
        <div className="liste">
          {liste.map((p) => (
            <button key={p.id} className="ligne" onClick={() => setDetail(p)}>
              <div className="ico-rond">{(p.prenom?.[0] ?? p.email[0]).toUpperCase()}</div>
              <div className="corps"><b>{`${p.prenom} ${p.nom}`.trim() || p.email}{p.id === moi.id ? ' (vous)' : ''}</b>
                <small>{nomRole(p.role)} · {p.email}</small>
                <small>Dernière connexion : {p.derniere_connexion ? dateHeureFr(p.derniere_connexion) : 'jamais'}</small></div>
              <div className="fin">{p.actif ? <span className="badge">actif</span> : <span className="badge gris">inactif</span>}
                {p.doit_changer_mdp && <small>invitation en cours</small>}</div>
            </button>
          ))}
        </div>
      )}
      <p className="plus-petit">Aucune limite de comptes n'est imposée par l'application (limite éventuelle : forfait Supabase, 50 000 utilisateurs actifs/mois en gratuit).</p>

      {d && !form && (
        <Feuille titre={`${d.prenom} ${d.nom}`.trim() || d.email} onFermer={() => setDetail(null)}>
          <dl className="kv">
            <dt>E-mail</dt><dd>{d.email}</dd>
            <dt>Téléphone</dt><dd>{d.telephone || '—'}</dd>
            <dt>Rôle</dt><dd>{nomRole(d.role)}</dd>
            <dt>Statut</dt><dd>{d.actif ? 'Actif' : 'Inactif'}</dd>
            <dt>Créé le</dt><dd>{dateFr(d.created_at)}</dd>
            <dt>Dernière connexion</dt><dd>{d.derniere_connexion ? dateHeureFr(d.derniere_connexion) : 'jamais'}</dd>
            <dt>Mot de passe</dt><dd>{d.doit_changer_mdp ? 'Temporaire (à changer)' : 'Personnel'}</dd>
          </dl>
          <div className="actions mt">
            <button className="btn second" onClick={() => { setForm(d); setDetail(null); }}><Pencil size={16} />Modifier / droits</button>
            {d.id !== moi.id && (d.actif
              ? <button className="btn second" onClick={async () => { if (await confirmer(`Désactiver le compte de ${d.email} ? Il ne pourra plus accéder aux données.`, 'Désactiver')) action(() => appeler({ action: 'desactiver', id: d.id }), 'Compte désactivé'); }}><Power size={16} />Désactiver</button>
              : <button className="btn" onClick={() => action(() => appeler({ action: 'activer', id: d.id }), 'Compte réactivé')}><Power size={16} />Réactiver</button>)}
          </div>
          <div className="actions mt">
            <button className="btn jaune" onClick={async () => {
              if (!(await confirmer(`Générer un nouveau mot de passe temporaire pour ${d.email} ? L'ancien ne fonctionnera plus.`, 'Réinitialiser', false))) return;
              try { const r = await appeler({ action: 'reinitialiser', id: d.id }); setDetail(null); setMdp({ p: r.profil, m: r.mot_de_passe_temporaire }); } catch (e: any) { toast(e.message, true); }
            }}><KeyRound size={16} />Réinitialiser l'accès</button>
            {d.id !== moi.id && <button className="btn danger" onClick={async () => {
              if (await confirmer(`Supprimer définitivement l'accès de ${d.email} à ANSAR ELEVAGE ? L'historique de ses opérations est conservé.`, 'Supprimer')) action(() => appeler({ action: 'supprimer', id: d.id }), 'Utilisateur supprimé');
            }}><Trash2 size={16} />Supprimer</button>}
          </div>
        </Feuille>
      )}
      {form && <FormUtilisateur profil={form === 'nouveau' ? null : form} onFermer={() => setForm(null)} onMdp={(p, m) => setMdp({ p, m })} />}
      {mdp && (
        <Feuille titre="Accès à transmettre" onFermer={() => setMdp(null)}>
          <p style={{ marginTop: 0 }}>Compte : <b>{mdp.p.email}</b></p>
          <div className="mdp-temp">{mdp.m}</div>
          <p className="plus-petit">Ce mot de passe temporaire ne sera plus affiché. Transmettez-le à l'utilisateur : il devra choisir son propre mot de passe à sa première connexion.</p>
          <button className="btn plein" onClick={() => partagerAcces(mdp.p, mdp.m)}><Share2 size={17} />Envoyer (WhatsApp, SMS…)</button>
          <button className="btn second plein mt" onClick={() => setMdp(null)}><UserPlus size={16} />Terminé</button>
        </Feuille>
      )}
    </Page>
  );
}
