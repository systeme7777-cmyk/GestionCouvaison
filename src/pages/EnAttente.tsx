import { useEffect, useState } from 'react';
import { Clock, Loader2, ShieldOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function EnAttente() {
  const { profil, rechargerProfil, deconnexion } = useAuth();
  const [attente, setAttente] = useState(false);
  const desactive = profil?.role === 'desactive';

  useEffect(() => {
    const t = setInterval(() => rechargerProfil().catch(() => undefined), 15000);
    return () => clearInterval(t);
  }, [rechargerProfil]);

  return (
    <div className="connexion">
      <div className="logo" style={{ background: desactive ? 'var(--rouge)' : 'var(--orange)' }}>
        {desactive ? <ShieldOff size={30} /> : <Clock size={30} />}
      </div>
      <h1 className="page-titre">{desactive ? 'Compte désactivé' : 'Compte en attente'}</h1>
      <p className="gris" style={{ margin: '8px 0 24px' }}>
        {desactive
          ? "Votre accès a été désactivé par l'administrateur. Contactez-le si c'est une erreur."
          : `Bonjour ${profil?.nom ?? ''}. Votre compte a bien été créé. L'administrateur doit maintenant l'approuver depuis l'onglet « Équipe » de son téléphone. Cette page se mettra à jour automatiquement.`}
      </p>
      <button className="btn primaire plein" disabled={attente} onClick={async () => {
        setAttente(true);
        await rechargerProfil().catch(() => undefined);
        setAttente(false);
      }}>
        {attente && <Loader2 size={18} className="tourne" />} Vérifier maintenant
      </button>
      <button className="btn plein mt" onClick={deconnexion}>Se déconnecter</button>
    </div>
  );
}
