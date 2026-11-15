import { describe, expect, it } from 'vitest';
import { suivi, taux, verifierOeufs, planOperations, dateEclosionPrevue, oeufsEnCours } from '../src/lib/calc';
import { addDays, diffDays, fmtRelatif } from '../src/lib/dates';
import { uuidDeterministe } from '../src/lib/uuid';
import type { Couvaison } from '../src/lib/types';

const base: Couvaison = {
  id: 'x', numero: 'CV-2026-0001', nom_lot: 'Lot Poules A', espece: 'Poule', race: null, date_debut: '2026-11-03',
  duree_jours: 21, nb_oeufs: 72, couveuse_id: null, responsable_id: null, observations: null, statut: 'auto', date_fin: null,
  oeufs_fecondes: null, oeufs_non_fecondes: null, oeufs_retires: 0, oeufs_casses: 0, oeufs_eclos: null, oeufs_non_eclos: null,
  rappels_actifs: true,
};

describe('dates', () => {
  it('ajoute des jours à travers les mois et années', () => {
    expect(addDays('2026-11-15', 21)).toBe('2026-12-06');
    expect(addDays('2026-12-20', 21)).toBe('2027-01-10');
    expect(addDays('2028-02-20', 10)).toBe('2028-03-01'); // année bissextile
  });
  it('compte les jours sans être affecté par le changement d’heure', () => {
    expect(diffDays('2026-03-20', '2026-04-05')).toBe(16);
    expect(diffDays('2026-10-20', '2026-11-05')).toBe(16);
  });
  it('formate les durées relatives', () => {
    const now = new Date('2026-11-15T10:00:12').getTime();
    expect(fmtRelatif('2026-11-15T10:00:00', now)).toBe('il y a 12 s');
    expect(fmtRelatif('2026-11-15T08:00:00', now)).toBe('il y a 2 h');
  });
});

describe('suivi', () => {
  it('correspond à la maquette : Lot Poules A J12/21, éclosion 24 nov.', () => {
    const s = suivi(base, '2026-11-15');
    expect(s.jour).toBe(12);
    expect(s.joursRestants).toBe(9);
    expect(s.dateEclosion).toBe('2026-11-24');
    expect(s.progression).toBe(57);
    expect(s.statut).toBe('incubation');
  });
  it('respecte une durée personnalisée (pintade 26 j)', () => {
    const c = { ...base, date_debut: '2026-10-22', duree_jours: 26 };
    expect(dateEclosionPrevue(c)).toBe('2026-11-17');
    expect(suivi(c, '2026-11-15').statut).toBe('proche');
    expect(suivi(c, '2026-11-15').joursRestants).toBe(2);
  });
  it('gère préparation, dépassement, annulation et fin', () => {
    expect(suivi({ ...base, date_debut: '2026-11-20' }, '2026-11-15').statut).toBe('preparation');
    expect(suivi({ ...base, statut: 'preparation' }, '2026-11-15').progression).toBe(0);
    const tard = suivi(base, '2026-11-27');
    expect(tard.statut).toBe('proche');
    expect(tard.enRetard).toBe(true);
    expect(tard.progression).toBe(100);
    expect(suivi({ ...base, statut: 'annulee' }, '2026-11-15').statut).toBe('annulee');
    expect(suivi({ ...base, statut: 'terminee' }, '2026-11-15').progression).toBe(100);
  });
});

describe('œufs', () => {
  it('calcule fertilité et éclosion (Lot Poules Z : 51/60 = 85 %)', () => {
    const t = taux({ ...base, nb_oeufs: 60, oeufs_fecondes: 55, oeufs_eclos: 51 });
    expect(t.eclosionTotale).toBe(85);
    expect(t.fertilite).toBe(91.7);
    expect(t.eclosionFeconds).toBe(92.7);
  });
  it('détecte les incohérences', () => {
    expect(verifierOeufs({ ...base, oeufs_fecondes: 70, oeufs_non_fecondes: 6 })).toHaveLength(1);
    expect(verifierOeufs({ ...base, oeufs_fecondes: 60, oeufs_eclos: 61 }).length).toBeGreaterThan(0);
    expect(verifierOeufs({ ...base, oeufs_fecondes: 64, oeufs_non_fecondes: 6, oeufs_eclos: 60, oeufs_non_eclos: 4 })).toEqual([]);
  });
  it('compte les œufs encore en couveuse', () => {
    expect(oeufsEnCours({ ...base, oeufs_retires: 8, oeufs_casses: 2 })).toBe(62);
  });
});

describe('plan des opérations', () => {
  it('poule 21 j : mirages J7 et J14, arrêt J18, éclosion J21', () => {
    const p = planOperations(21);
    expect(p.map((x) => x.jour)).toEqual([7, 14, 18, 18, 21]);
  });
  it('caille 17 j', () => {
    expect(planOperations(17).map((x) => x.jour)).toEqual([6, 11, 14, 14, 17]);
  });
});

describe('uuid déterministe', () => {
  it('est stable et au format UUID', () => {
    const a = uuidDeterministe('abc|2026-11-15');
    expect(a).toBe(uuidDeterministe('abc|2026-11-15'));
    expect(a).not.toBe(uuidDeterministe('abc|2026-11-16'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
