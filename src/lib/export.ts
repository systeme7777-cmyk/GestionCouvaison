import type { Couvaison, Couveuse, Mesure, Mirage, Operation, Profile } from './types';
import { TYPES_OPERATION } from './types';
import { STATUTS, suivi, taux, fmtPct } from './calc';
import { fmtNumerique, today } from './dates';
import { enregistrerFichier } from './natif';

export interface Contexte {
  profils: Profile[];
  couveuses: Couveuse[];
  operations: Operation[];
  mesures: Mesure[];
  mirages: Mirage[];
}

const nomProfil = (ctx: Contexte, id: string | null | undefined) => ctx.profils.find((p) => p.id === id)?.nom ?? '';
const nomCouveuse = (ctx: Contexte, id: string | null | undefined) => ctx.couveuses.find((c) => c.id === id)?.nom ?? '';
const libType = (t: string) => TYPES_OPERATION.find((x) => x.value === t)?.label ?? t;
const n = (x: number | null | undefined) => (x == null ? '' : x);

function ligneCouvaison(c: Couvaison, ctx: Contexte) {
  const s = suivi(c);
  const t = taux(c);
  return {
    'N°': c.numero ?? '(en attente)',
    Lot: c.nom_lot ?? '',
    Espèce: c.espece,
    Race: c.race ?? '',
    Couveuse: nomCouveuse(ctx, c.couveuse_id),
    Responsable: nomProfil(ctx, c.responsable_id),
    'Date de mise': fmtNumerique(c.date_debut),
    'Durée (j)': c.duree_jours,
    'Éclosion prévue': fmtNumerique(s.dateEclosion),
    'Jours écoulés': s.jour,
    'Jours restants': s.joursRestants,
    'Progression (%)': s.progression,
    Statut: STATUTS[s.statut],
    'Œufs mis': c.nb_oeufs,
    Fécondés: n(c.oeufs_fecondes),
    'Non fécondés': n(c.oeufs_non_fecondes),
    Retirés: n(c.oeufs_retires),
    Cassés: n(c.oeufs_casses),
    Éclos: n(c.oeufs_eclos),
    'Non éclos': n(c.oeufs_non_eclos),
    'Fertilité (%)': t.fertilite ?? '',
    'Éclosion / œufs mis (%)': t.eclosionTotale ?? '',
    'Éclosion / fécondés (%)': t.eclosionFeconds ?? '',
    Observations: c.observations ?? '',
  };
}

export async function exporterExcel(couvaisons: Couvaison[], ctx: Contexte, nomFichier = `rapport-couvaisons-${today()}.xlsx`) {
  const XLSX = await import('xlsx');
  const ids = new Set(couvaisons.map((c) => c.id));
  const lot = (id: string) => {
    const c = couvaisons.find((x) => x.id === id);
    return c ? `${c.numero ?? ''} ${c.nom_lot ?? ''}`.trim() : '';
  };
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(couvaisons.map((c) => ligneCouvaison(c, ctx)));
  ws1['!cols'] = Array(24).fill({ wch: 14 });
  XLSX.utils.book_append_sheet(wb, ws1, 'Couvaisons');

  const ops = ctx.operations.filter((o) => ids.has(o.couvaison_id)).sort((a, b) => a.date_prevue.localeCompare(b.date_prevue));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ops.map((o) => ({
    Couvaison: lot(o.couvaison_id), Opération: o.titre ?? libType(o.type), Type: libType(o.type),
    Date: fmtNumerique(o.date_prevue), Heure: o.heure?.slice(0, 5) ?? '', Rappel: o.rappel ? 'Oui' : 'Non',
    Fait: o.fait ? 'Oui' : 'Non', 'Fait par': nomProfil(ctx, o.fait_par), Notes: o.notes ?? '',
  }))), 'Opérations');

  const mes = ctx.mesures.filter((m) => ids.has(m.couvaison_id)).sort((a, b) => a.date_mesure.localeCompare(b.date_mesure));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mes.map((m) => ({
    Couvaison: lot(m.couvaison_id), Date: fmtNumerique(m.date_mesure), 'Température (°C)': n(m.temperature),
    'Humidité (%)': n(m.humidite), Retournements: m.retournements, 'Retournements prévus': m.retournements_prevus,
    'Saisi par': nomProfil(ctx, m.updated_by ?? m.created_by), Notes: m.notes ?? '',
  }))), 'Suivi journalier');

  const mir = ctx.mirages.filter((m) => ids.has(m.couvaison_id)).sort((a, b) => a.date_mirage.localeCompare(b.date_mirage));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mir.map((m) => ({
    Couvaison: lot(m.couvaison_id), Date: fmtNumerique(m.date_mirage), Fécondés: m.fecondes, Clairs: m.clairs,
    Morts: m.morts, 'Saisi par': nomProfil(ctx, m.created_by), Notes: m.notes ?? '',
  }))), 'Mirages');

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  await enregistrerFichier(nomFichier, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

const VERT: [number, number, number] = [31, 92, 64];

async function nouveauPdf(orientation: 'p' | 'l' = 'p') {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  return { doc, autoTable };
}

function entete(doc: any, titre: string, sousTitre: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...VERT);
  doc.rect(0, 0, w, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text('GESTION COUVAISON', 12, 10);
  doc.setFontSize(10);
  doc.text(titre, 12, 17);
  doc.text(`Édité le ${fmtNumerique(today())}`, w - 12, 17, { align: 'right' });
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(9);
  if (sousTitre) doc.text(sousTitre, 12, 28);
}

function piedDePage(doc: any) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Page ${i} / ${pages}`, doc.internal.pageSize.getWidth() - 12, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
  }
}

export async function exporterPDF(couvaisons: Couvaison[], ctx: Contexte, filtres: string) {
  const { doc, autoTable } = await nouveauPdf('l');
  entete(doc, 'Rapport des couvaisons', filtres ? `Filtres : ${filtres}` : 'Toutes les couvaisons');

  const totalMis = couvaisons.reduce((s, c) => s + c.nb_oeufs, 0);
  const terminees = couvaisons.filter((c) => c.statut === 'terminee' && c.oeufs_eclos != null);
  const misTermines = terminees.reduce((s, c) => s + c.nb_oeufs, 0);
  const eclos = terminees.reduce((s, c) => s + (c.oeufs_eclos ?? 0), 0);
  const fec = couvaisons.filter((c) => c.oeufs_fecondes != null);
  const fecMis = fec.reduce((s, c) => s + c.nb_oeufs, 0);
  const fecN = fec.reduce((s, c) => s + (c.oeufs_fecondes ?? 0), 0);

  autoTable(doc, {
    startY: 32,
    theme: 'plain',
    styles: { fontSize: 9 },
    body: [[
      `Couvaisons : ${couvaisons.length}`,
      `Œufs mis : ${totalMis}`,
      `Poussins éclos : ${eclos}`,
      `Taux de fertilité : ${fmtPct(fecMis ? (fecN / fecMis) * 100 : null, 1)}`,
      `Taux d'éclosion : ${fmtPct(misTermines ? (eclos / misTermines) * 100 : null, 1)}`,
    ]],
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 2,
    headStyles: { fillColor: VERT, fontSize: 8 },
    styles: { fontSize: 7.5, cellPadding: 1.5 },
    head: [['N°', 'Lot', 'Espèce / race', 'Couveuse', 'Responsable', 'Mise', 'Durée', 'Éclosion', 'Statut', 'Mis', 'Féc.', 'Non féc.', 'Ret.', 'Cass.', 'Éclos', 'Non écl.', 'Fertilité', 'Éclosion']],
    body: couvaisons.map((c) => {
      const s = suivi(c);
      const t = taux(c);
      return [
        c.numero ?? '—', c.nom_lot ?? '', [c.espece, c.race].filter(Boolean).join(' / '), nomCouveuse(ctx, c.couveuse_id),
        nomProfil(ctx, c.responsable_id), fmtNumerique(c.date_debut), `${c.duree_jours} j`, fmtNumerique(s.dateEclosion),
        STATUTS[s.statut], c.nb_oeufs, n(c.oeufs_fecondes), n(c.oeufs_non_fecondes), n(c.oeufs_retires), n(c.oeufs_casses),
        n(c.oeufs_eclos), n(c.oeufs_non_eclos), fmtPct(t.fertilite, 1), fmtPct(t.eclosionTotale, 1),
      ];
    }),
  });
  piedDePage(doc);
  await enregistrerFichier(`rapport-couvaisons-${today()}.pdf`, doc.output('blob'));
}

export async function ficheCouvaisonPDF(c: Couvaison, ctx: Contexte) {
  const { doc, autoTable } = await nouveauPdf('p');
  const s = suivi(c);
  const t = taux(c);
  entete(doc, `Fiche ${c.numero ?? ''} — ${c.nom_lot ?? c.espece}`, '');
  autoTable(doc, {
    startY: 28,
    theme: 'grid',
    styles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 }, 2: { fontStyle: 'bold', cellWidth: 45 } },
    body: [
      ['Numéro', c.numero ?? '—', 'Statut', STATUTS[s.statut]],
      ['Espèce', c.espece, 'Race', c.race ?? '—'],
      ['Date de mise', fmtNumerique(c.date_debut), "Durée d'incubation", `${c.duree_jours} jours`],
      ['Éclosion prévue', fmtNumerique(s.dateEclosion), 'Progression', `J${s.jour} / ${c.duree_jours} (${s.progression} %)`],
      ['Couveuse', nomCouveuse(ctx, c.couveuse_id) || '—', 'Responsable', nomProfil(ctx, c.responsable_id) || '—'],
      ['Œufs mis', String(c.nb_oeufs), 'Fécondés / non fécondés', `${n(c.oeufs_fecondes) || '—'} / ${n(c.oeufs_non_fecondes) || '—'}`],
      ['Retirés / cassés', `${c.oeufs_retires} / ${c.oeufs_casses}`, 'Éclos / non éclos', `${n(c.oeufs_eclos) || '—'} / ${n(c.oeufs_non_eclos) || '—'}`],
      ['Taux de fertilité', fmtPct(t.fertilite, 1), "Taux d'éclosion", `${fmtPct(t.eclosionTotale, 1)} (sur fécondés : ${fmtPct(t.eclosionFeconds, 1)})`],
      ['Observations', { content: c.observations || '—', colSpan: 3 } as any],
    ],
  });
  const ops = ctx.operations.filter((o) => o.couvaison_id === c.id).sort((a, b) => a.date_prevue.localeCompare(b.date_prevue));
  if (ops.length) autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    headStyles: { fillColor: VERT }, styles: { fontSize: 8.5 },
    head: [['Opération', 'Date', 'Heure', 'Fait', 'Par']],
    body: ops.map((o) => [o.titre ?? libType(o.type), fmtNumerique(o.date_prevue), o.heure?.slice(0, 5) ?? '', o.fait ? 'Oui' : 'Non', nomProfil(ctx, o.fait_par)]),
  });
  const mes = ctx.mesures.filter((m) => m.couvaison_id === c.id).sort((a, b) => a.date_mesure.localeCompare(b.date_mesure));
  if (mes.length) autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    headStyles: { fillColor: VERT }, styles: { fontSize: 8.5 },
    head: [['Date', 'Température (°C)', 'Humidité (%)', 'Retournements', 'Saisi par', 'Notes']],
    body: mes.map((m) => [fmtNumerique(m.date_mesure), n(m.temperature), n(m.humidite), `${m.retournements}/${m.retournements_prevus}`, nomProfil(ctx, m.updated_by ?? m.created_by), m.notes ?? '']),
  });
  const mir = ctx.mirages.filter((m) => m.couvaison_id === c.id).sort((a, b) => a.date_mirage.localeCompare(b.date_mirage));
  if (mir.length) autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    headStyles: { fillColor: VERT }, styles: { fontSize: 8.5 },
    head: [['Mirage', 'Fécondés', 'Clairs', 'Morts', 'Notes']],
    body: mir.map((m) => [fmtNumerique(m.date_mirage), m.fecondes, m.clairs, m.morts, m.notes ?? '']),
  });
  piedDePage(doc);
  await enregistrerFichier(`fiche-${c.numero ?? c.id.slice(0, 8)}.pdf`, doc.output('blob'));
}
