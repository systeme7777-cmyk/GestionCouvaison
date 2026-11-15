import { useSync } from '../hooks/useData';

export default function PastilleSync() {
  const s = useSync();
  if (!s.enLigne) {
    return <span className="pilule hors"><span className="point" />Hors ligne{s.enAttente ? ` · ${s.enAttente} modif. en attente` : ''}</span>;
  }
  if (s.synchronisation || s.enAttente) {
    return <span className="pilule"><span className="point" />Synchronisation…{s.enAttente ? ` (${s.enAttente})` : ''}</span>;
  }
  const n = Math.max(1, s.presents.length);
  return <span className="pilule"><span className="point" />Synchronisé · {n} téléphone{n > 1 ? 's' : ''}</span>;
}
