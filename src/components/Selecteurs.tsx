import type { Tout } from '../hooks/useData';
import { actifs } from '../lib/calc';
import { Choix } from './ui';

/** Espèce -> catégorie -> produit, avec filtrage en cascade */
export function SelecteurProduit({ t, espece, categorie, produit, onChange, requis = true }: {
  t: Tout; espece?: string | null; categorie?: string | null; produit?: string | null;
  onChange: (v: { espece_id: string | null; categorie_id: string | null; produit_id: string | null; unite?: string; prix?: number | null }) => void;
  requis?: boolean;
}) {
  const produits = actifs(t.produits).filter((p) => p.actif !== false || p.id === produit);
  const filtres = produits.filter((p) =>
    (!espece || !p.espece_id || p.espece_id === espece) && (!categorie || p.categorie_id === categorie));
  const choisirProduit = (id: string) => {
    const p = produits.find((x) => x.id === id);
    onChange({
      espece_id: espece || p?.espece_id || null,
      categorie_id: p?.categorie_id || categorie || null,
      produit_id: id || null,
      unite: p?.unite,
      prix: p?.prix_vente ?? null,
    });
  };
  return (
    <>
      <div className="deux">
        <Choix label="Espèce" valeur={espece ?? ''} vide="Toutes" options={actifs(t.especes).map((e) => ({ v: e.id, t: `${e.icone ?? ''} ${e.nom}`.trim() }))}
          onChange={(v) => {
            const p = produits.find((x) => x.id === produit);
            const garde = p && (!v || !p.espece_id || p.espece_id === v);
            onChange({ espece_id: v || null, categorie_id: categorie ?? null, produit_id: garde ? produit ?? null : null });
          }} />
        <Choix label="Catégorie" valeur={categorie ?? ''} vide="Toutes" options={actifs(t.categories).map((c) => ({ v: c.id, t: c.nom }))}
          onChange={(v) => {
            const p = produits.find((x) => x.id === produit);
            const garde = p && (!v || p.categorie_id === v);
            onChange({ espece_id: espece ?? null, categorie_id: v || null, produit_id: garde ? produit ?? null : null });
          }} />
      </div>
      <Choix label="Produit" requis={requis} valeur={produit ?? ''} vide="— Choisir le produit —"
        options={filtres.map((p) => ({ v: p.id, t: `${p.nom} (${p.unite})` }))} onChange={choisirProduit} />
    </>
  );
}

export function SelecteurLot({ t, valeur, onChange, label = 'Lot (facultatif)', espece }: {
  t: Tout; valeur?: string | null; onChange: (v: string | null) => void; label?: string; espece?: string | null;
}) {
  const lots = actifs(t.lots).filter((l) => (l.statut === 'actif' || l.id === valeur) && (!espece || !l.espece_id || l.espece_id === espece));
  return <Choix label={label} valeur={valeur ?? ''} vide="Aucun lot" options={lots.map((l) => ({ v: l.id, t: l.nom }))} onChange={(v) => onChange(v || null)} />;
}

export function SelecteurEspece({ t, valeur, onChange, label = 'Espèce', vide = 'Toutes les espèces' }: {
  t: Tout; valeur?: string | null; onChange: (v: string | null) => void; label?: string; vide?: string;
}) {
  return <Choix label={label} valeur={valeur ?? ''} vide={vide} options={actifs(t.especes).map((e) => ({ v: e.id, t: `${e.icone ?? ''} ${e.nom}`.trim() }))} onChange={(v) => onChange(v || null)} />;
}

export function nomProduit(t: Tout, id?: string | null) {
  return t.produits.find((p) => p.id === id)?.nom ?? '—';
}
export function uniteProduit(t: Tout, id?: string | null) {
  return t.produits.find((p) => p.id === id)?.unite ?? '';
}
export function nomEspece(t: Tout, id?: string | null) {
  const e = t.especes.find((x) => x.id === id);
  return e ? `${e.icone ?? ''} ${e.nom}`.trim() : '—';
}
export function nomLot(t: Tout, id?: string | null) {
  return t.lots.find((l) => l.id === id)?.nom ?? '—';
}
