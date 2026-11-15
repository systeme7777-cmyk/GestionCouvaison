import { useState } from 'react';
import { MoreVertical, Plus, RefreshCw, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useHistorique, useHorloge, useProfils, useSync } from '../hooks/useData';
import { fmtMoment, fmtRelatif } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { synchroniser } from '../lib/sync';
import { db } from '../lib/db';
import { ROLES, type Profile, type Role } from '../lib/types';
import { Avatar, Feuille, useDialogs } from '../components/ui';
import Journal from '../components/Journal';

const MAX = 5;
const ACTIFS: Role[] = ['admin', 'operateur', 'lecteur'];

export default function Equipe() {
  useHorloge(5000);
  const nav = useNavigate();
  const { profil, estAdmin } = useAuth();
  const { confirmer, toast } = useDialogs();
  const sync = useSync();
  const profils = useProfils();
  const [menu, setMenu] = useState<string | null>(null);
  const [invite, setInvite] = useState(false);
  const [toutVoir, setToutVoir] = useState(false);
  const activite = useHistorique(undefined, toutVoir ? 300 : 8);

  const actifs = profils.filter((p) => ACTIFS.includes(p.role));
  const attente = profils.filter((p) => p.role === 'en_attente');
  const desactives = profils.filter((p) => p.role === 'desactive');
  const places = MAX - actifs.length;

  async function changerRole(p: Profile, role: Role) {
    setMenu(null);
    if (role === 'desactive' && !(await confirmer({ titre: `Désactiver ${p.nom} ?`, message: "Cette personne ne pourra plus consulter ni modifier les données. Vous pourrez la réactiver plus tard.", bouton: 'Désactiver' }))) return;
    if (role === 'admin' && !(await confirmer({ titre: `Nommer ${p.nom} administrateur ?`, message: 'Un administrateur peut gérer les membres et supprimer des données.', bouton: 'Confirmer', danger: false }))) return;
    if (!sync.enLigne) { toast('La gestion des membres nécessite une connexion Internet.', true); return; }
    const { data, error } = await supabase.from('profiles').update({ role }).eq('id', p.id).select().maybeSingle();
    if (error) { toast(error.message.includes('Limite') ? 'Limite de 5 utilisateurs actifs atteinte.' : error.message, true); return; }
    if (data) await db.profiles.put(data);
    toast(`${p.nom} : ${ROLES[role]}`);
  }

  const statut = (p: Profile) => {
    if (sync.presents.includes(p.id) || p.id === profil?.id && sync.enLigne) return 'En ligne';
    return p.derniere_connexion ? `Vu ${fmtRelatif(p.derniere_connexion)}` : 'Jamais connecté';
  };

  const carte = (p: Profile, i: number) => (
    <div key={p.id} className="ligne" style={{ position: 'relative' }}>
      <Avatar nom={p.nom} index={i} />
      <div className="corps">
        <div className="titre">{p.nom}{p.id === profil?.id ? ' (vous)' : ''}</div>
        <div className="sous">{p.role === 'en_attente' ? p.email : [statut(p), p.appareil].filter(Boolean).join(' · ')}</div>
      </div>
      {p.role === 'admin' ? <span className="badge vert">Admin</span>
        : p.role === 'lecteur' ? <span className="badge bleu">Lecteur</span>
        : p.role === 'en_attente' ? <span className="badge orange">En attente</span>
        : p.role === 'desactive' ? <span className="badge gris">Désactivé</span> : null}
      {estAdmin && p.id !== profil?.id && (
        <button className="btn-rond" style={{ border: 0, width: 36, height: 36 }} aria-label={`Gérer ${p.nom}`} onClick={() => setMenu(menu === p.id ? null : p.id)}>
          <MoreVertical size={20} />
        </button>
      )}
      {menu === p.id && (
        <div className="menu-contexte" style={{ top: 50 }}>
          {p.role !== 'operateur' && <button onClick={() => changerRole(p, 'operateur')}>{ACTIFS.includes(p.role) ? 'Rôle : Opérateur' : 'Approuver comme opérateur'}</button>}
          {p.role !== 'lecteur' && <button onClick={() => changerRole(p, 'lecteur')}>{ACTIFS.includes(p.role) ? 'Rôle : Lecteur (consultation)' : 'Approuver en lecture seule'}</button>}
          {p.role !== 'admin' && <button onClick={() => changerRole(p, 'admin')}>Rôle : Administrateur</button>}
          {p.role !== 'desactive' && <button className="danger" onClick={() => changerRole(p, 'desactive')}>{p.role === 'en_attente' ? 'Refuser' : 'Désactiver'}</button>}
        </div>
      )}
    </div>
  );

  return (
    <div className="page" onClick={(e) => { if (!(e.target as HTMLElement).closest('.ligne')) setMenu(null); }}>
      <div className="entete">
        <h1 className="page-titre">Équipe</h1>
        <button className="btn-rond" aria-label="Paramètres" onClick={() => nav('/parametres')}><Settings size={20} /></button>
      </div>

      <button className="carte-hero flex" style={{ width: '100%', border: 0, textAlign: 'left', padding: 18, gap: 14 }} onClick={() => synchroniser()}>
        <span className="chip" style={{ padding: 10, borderRadius: 12 }}><RefreshCw size={20} className={sync.synchronisation ? 'tourne' : ''} /></span>
        <span style={{ flex: 1 }}>
          <span className="gras" style={{ display: 'block' }}>{!sync.enLigne ? 'Hors ligne' : sync.temps_reel ? 'Synchronisation en temps réel' : 'Connexion au temps réel…'}</span>
          <span className="petit" style={{ opacity: 0.85 }}>
            {!sync.enLigne ? `${sync.enAttente} modification(s) en attente d'envoi` : sync.derniereSync ? `Dernière mise à jour ${fmtRelatif(new Date(sync.derniereSync).toISOString())}` : 'Première synchronisation…'}
          </span>
        </span>
        <span className="chip">{actifs.length} / {MAX}</span>
      </button>

      <div className="section-titre"><h2>Membres</h2><span className="info">{sync.presents.length} en ligne</span></div>
      <div className="carte liste" style={{ overflow: 'visible' }}>{actifs.map(carte)}</div>

      {attente.length > 0 && (
        <>
          <div className="section-titre"><h2>Demandes d'accès</h2></div>
          {estAdmin && places <= 0 && <div className="avertissement">Les 5 places sont occupées : désactivez un membre pour en approuver un autre.</div>}
          <div className="carte liste" style={{ overflow: 'visible' }}>{attente.map((p, i) => carte(p, i + actifs.length))}</div>
        </>
      )}

      {places > 0 && (
        <button className="btn pointille vert plein mt" onClick={() => setInvite(true)}>
          <Plus size={18} /> Inviter un téléphone ({places} place{places > 1 ? 's' : ''} libre{places > 1 ? 's' : ''})
        </button>
      )}

      {estAdmin && desactives.length > 0 && (
        <>
          <div className="section-titre"><h2>Comptes désactivés</h2></div>
          <div className="carte liste" style={{ overflow: 'visible' }}>{desactives.map((p, i) => carte(p, i))}</div>
        </>
      )}

      <div className="section-titre">
        <h2>Activité récente</h2>
        <button className="lien" onClick={() => setToutVoir(!toutVoir)}>{toutVoir ? 'Réduire' : 'Historique complet'}</button>
      </div>
      {toutVoir ? <Journal lignes={activite} avecLibelle /> : activite.length === 0 ? <div className="gris petit">Aucune activité pour le moment.</div> : activite.map((h) => {
        const idx = profils.findIndex((p) => p.id === h.utilisateur_id);
        const couleurs = ['var(--vert)', 'var(--orange)', 'var(--bleu)', 'var(--gris)', '#7d2f6f'];
        return (
          <div key={h.id} className="activite">
            <span className="puce-couleur" style={{ background: couleurs[Math.max(0, idx) % 5] }} />
            <span><b>{(h.utilisateur_nom ?? 'Système').split(' ')[0]}</b> {h.resume}{h.libelle ? ` · ${h.libelle}` : ''} <span className="temps">· {fmtMoment(h.created_at)}</span></span>
          </div>
        );
      })}

      {invite && (
        <Feuille titre="Ajouter un téléphone" onFermer={() => setInvite(false)}>
          <ol className="petit" style={{ paddingLeft: 18, lineHeight: 1.6, marginTop: 0 }}>
            <li>Envoyez le fichier <b>GestionCouvaison.apk</b> à la personne (WhatsApp, Bluetooth, câble…).</li>
            <li>Elle installe l'application et appuie sur <b>« Créer un compte »</b> avec son nom, son e-mail et un mot de passe.</li>
            <li>Si un e-mail de confirmation est reçu, elle l'ouvre puis se connecte.</li>
            <li>Sa demande apparaît ici dans <b>« Demandes d'accès »</b> : {estAdmin ? 'touchez ⋮ pour l’approuver comme opérateur ou lecteur.' : "l'administrateur doit l'approuver."}</li>
          </ol>
          <div className="note">Places disponibles : {places} sur {MAX}. Les opérateurs peuvent saisir et modifier ; les lecteurs consultent seulement ; seuls les administrateurs suppriment et gèrent l'équipe.</div>
          <button className="btn primaire plein mt" onClick={() => setInvite(false)}>Compris</button>
        </Feuille>
      )}
    </div>
  );
}
