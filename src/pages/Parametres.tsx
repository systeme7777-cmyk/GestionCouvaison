import { useState } from 'react';
import { Bell, LogOut, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../hooks/useAuth';
import { useCouvaisons, useEspeces, useHorloge, useSync } from '../hooks/useData';
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { ajouter, modifier, supprimer, synchroniser } from '../lib/sync';
import { autorisationRappels, heureRappelQuotidien, rappelQuotidienActif, reglerRappelQuotidien } from '../lib/rappels';
import { estNatif } from '../lib/natif';
import { fmtRelatif } from '../lib/dates';
import { ROLES, type Espece } from '../lib/types';
import { Bascule, EnteteRetour, Feuille, entierOuNull, useDialogs } from '../components/ui';

export default function Parametres() {
  useHorloge();
  const { profil, peutEcrire, estAdmin, deconnexion, rechargerProfil } = useAuth();
  const { confirmer, toast } = useDialogs();
  const especes = useEspeces();
  const couvaisons = useCouvaisons();
  const sync = useSync();
  const erreurs = useLiveQuery(() => db.erreurs.orderBy('date').reverse().limit(10).toArray(), []) ?? [];
  const [nom, setNom] = useState(profil?.nom ?? '');
  const [mdp, setMdp] = useState('');
  const [edEspece, setEdEspece] = useState<Espece | 'nouvelle' | null>(null);
  const [rappelOn, setRappelOn] = useState(rappelQuotidienActif());
  const [heure, setHeure] = useState(heureRappelQuotidien());

  async function sauverNom() {
    if (nom.trim().length < 2) { toast('Nom trop court', true); return; }
    const { error } = await supabase.from('profiles').update({ nom: nom.trim() }).eq('id', profil!.id);
    if (error) { toast('Connexion nécessaire pour modifier le profil.', true); return; }
    await rechargerProfil();
    toast('Nom mis à jour');
  }

  async function changerMdp() {
    if (mdp.length < 6) { toast('6 caractères minimum', true); return; }
    const { error } = await supabase.auth.updateUser({ password: mdp });
    if (error) { toast(error.message, true); return; }
    setMdp('');
    toast('Mot de passe modifié');
  }

  async function quitter() {
    const msg = sync.enAttente
      ? `Attention : ${sync.enAttente} modification(s) n'ont pas encore été envoyées et seront perdues. Connectez-vous à Internet avant de vous déconnecter.`
      : 'Les données locales de ce téléphone seront effacées (elles restent sur le serveur).';
    if (await confirmer({ titre: 'Se déconnecter ?', message: msg, bouton: 'Se déconnecter' })) await deconnexion();
  }

  return (
    <div className="page">
      <EnteteRetour titre="Paramètres" />

      <div className="section-titre" style={{ marginTop: 0 }}><h2>Mon profil</h2><span className="info">{profil ? ROLES[profil.role] : ''}</span></div>
      <div className="carte">
        <div className="petit gris mb">{profil?.email}</div>
        <div className="champ"><label>Nom affiché</label>
          <div className="flex"><input className="entree" value={nom} onChange={(e) => setNom(e.target.value)} /><button className="btn" onClick={sauverNom}>OK</button></div>
        </div>
        <div className="champ" style={{ marginBottom: 0 }}><label>Nouveau mot de passe</label>
          <div className="flex"><input className="entree" type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} autoComplete="new-password" /><button className="btn" onClick={changerMdp}>OK</button></div>
        </div>
      </div>

      <div className="section-titre"><h2>Espèces et durées par défaut</h2>{peutEcrire && <button className="lien" onClick={() => setEdEspece('nouvelle')}><Plus size={14} /> Ajouter</button>}</div>
      <div className="carte liste">
        {especes.map((e) => (
          <div key={e.id} className="ligne">
            <div className="corps"><div className="titre">{e.nom}</div><div className="sous">{e.duree_defaut ? `${e.duree_defaut} jours par défaut` : 'Durée libre (saisie à chaque couvaison)'}</div></div>
            {peutEcrire && <button className="btn-rond" style={{ width: 36, height: 36 }} aria-label={`Modifier ${e.nom}`} onClick={() => setEdEspece(e)}><Pencil size={15} /></button>}
            {estAdmin && <button className="btn-rond" style={{ width: 36, height: 36 }} aria-label={`Supprimer ${e.nom}`} onClick={async () => {
              const n = couvaisons.filter((c) => c.espece === e.nom).length;
              if (await confirmer({ titre: `Supprimer l'espèce ${e.nom} ?`, message: n ? `${n} couvaison(s) utilisent cette espèce ; elles seront conservées.` : "Elle ne sera plus proposée à la création d'une couvaison." })) {
                await supprimer('especes', e.id); toast('Espèce supprimée');
              }
            }}><Trash2 size={15} /></button>}
          </div>
        ))}
      </div>
      <div className="aide petit gris mt-s">La durée reste modifiable librement pour chaque couvaison.</div>

      <div className="section-titre"><h2>Rappels</h2></div>
      <div className="carte">
        <div className="interrupteur">
          <div><div className="titre">Rappel quotidien de suivi</div><div className="sous">Température, humidité, retournements</div></div>
          <Bascule on={rappelOn} onChange={(v) => { setRappelOn(v); reglerRappelQuotidien(v, heure); }} label="Rappel quotidien" />
        </div>
        {rappelOn && (
          <div className="champ mt" style={{ marginBottom: 0 }}><label>Heure du rappel</label>
            <input type="time" className="entree" value={heure} onChange={(e) => { setHeure(e.target.value); if (e.target.value) reglerRappelQuotidien(true, e.target.value); }} />
          </div>
        )}
        {estNatif() ? (
          <button className="btn plein mt" onClick={async () => toast((await autorisationRappels()) ? 'Notifications autorisées' : 'Notifications refusées : activez-les dans les réglages Android', !(await autorisationRappels()))}>
            <Bell size={16} /> Vérifier l'autorisation des notifications
          </button>
        ) : <div className="petit gris mt">Les rappels fonctionnent dans l'application Android installée.</div>}
        <div className="petit gris mt-s">Les rappels de chaque opération se règlent dans le calendrier. Les rappels d'une couvaison peuvent être coupés dans sa fiche.</div>
      </div>

      <div className="section-titre"><h2>Synchronisation</h2></div>
      <div className="carte">
        <div className="petit">
          <div>État : <b>{sync.enLigne ? (sync.temps_reel ? 'connecté en temps réel' : 'en ligne') : 'hors ligne'}</b></div>
          <div>Modifications en attente : <b>{sync.enAttente}</b></div>
          <div>Dernière synchronisation : <b>{sync.derniereSync ? fmtRelatif(new Date(sync.derniereSync).toISOString()) : 'jamais'}</b></div>
        </div>
        <button className="btn plein mt" disabled={sync.synchronisation || !sync.enLigne} onClick={async () => { await synchroniser(); toast('Synchronisation terminée'); }}>
          <RefreshCw size={16} className={sync.synchronisation ? 'tourne' : ''} /> Synchroniser maintenant
        </button>
        {erreurs.length > 0 && (
          <div className="mt">
            <div className="entre"><b className="petit rouge-txt">Opérations refusées par le serveur</b><button className="lien petit" style={{ border: 0, background: 'none', color: 'var(--vert)' }} onClick={() => db.erreurs.clear()}>Effacer</button></div>
            {erreurs.map((e) => <div key={e.id} className="petit gris mt-s">{new Date(e.date).toLocaleString('fr-FR')} · {e.table} · {e.message}</div>)}
          </div>
        )}
      </div>

      <button className="btn danger-leger plein mt" onClick={quitter}><LogOut size={16} /> Se déconnecter</button>
      <div className="petit gris mt" style={{ textAlign: 'center' }}>Gestion Couvaison · version {__APP_VERSION__}</div>

      {edEspece && <FormEspece espece={edEspece === 'nouvelle' ? undefined : edEspece} ordre={especes.length} onFermer={() => setEdEspece(null)} />}
    </div>
  );
}

function FormEspece({ espece, ordre, onFermer }: { espece?: Espece; ordre: number; onFermer: () => void }) {
  const { toast } = useDialogs();
  const [nom, setNom] = useState(espece?.nom ?? '');
  const [duree, setDuree] = useState(espece?.duree_defaut ? String(espece.duree_defaut) : '');
  const [erreur, setErreur] = useState('');
  async function valider() {
    const d = entierOuNull(duree);
    if (!nom.trim()) { setErreur("Indiquez le nom de l'espèce."); return; }
    if (d != null && (d < 1 || d > 90)) { setErreur('Durée entre 1 et 90 jours (ou vide pour une durée libre).'); return; }
    const existe = await db.especes.filter((e) => e.nom.toLowerCase() === nom.trim().toLowerCase() && e.id !== espece?.id).count();
    if (existe) { setErreur('Cette espèce existe déjà.'); return; }
    if (espece) await modifier('especes', espece.id, { nom: nom.trim(), duree_defaut: d });
    else await ajouter('especes', { nom: nom.trim(), duree_defaut: d, ordre: ordre + 1 });
    toast('Espèce enregistrée');
    onFermer();
  }
  return (
    <Feuille titre={espece ? `Modifier ${espece.nom}` : 'Nouvelle espèce'} onFermer={onFermer}>
      {erreur && <div className="erreurs">{erreur}</div>}
      <div className="champ"><label>Nom</label><input className="entree" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. : Faisan" /></div>
      <div className="champ"><label>Durée d'incubation par défaut (jours)</label><input className="entree" inputMode="numeric" value={duree} onChange={(e) => setDuree(e.target.value.replace(/\D/g, ''))} placeholder="Vide = durée libre" /></div>
      <div className="rangee-btn"><button className="btn" onClick={onFermer}>Annuler</button><button className="btn primaire" onClick={valider}>Enregistrer</button></div>
    </Feuille>
  );
}
