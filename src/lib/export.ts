// Exportation PDF / Excel / CSV et partage (Android : partage vers WhatsApp, Drive, impression…)
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { dateHeureFr } from './format';

export interface Colonne<T = any> {
  titre: string;
  valeur: (r: T) => string | number | null | undefined;
  /** valeur brute pour Excel (nombre) */
  brut?: (r: T) => string | number | null | undefined;
  droite?: boolean;
}

function blobVersBase64(b: Blob): Promise<string> {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] ?? '');
    r.onerror = ko;
    r.readAsDataURL(b);
  });
}

export async function partagerFichier(nom: string, blob: Blob, titre = 'ANSAR ELEVAGE') {
  const propre = nom.replace(/[^\w.\-]+/g, '_');
  if (Capacitor.isNativePlatform()) {
    const data = await blobVersBase64(blob);
    // Copie conservée dans Documents/ANSAR ELEVAGE + partage
    try {
      await Filesystem.writeFile({ path: `ANSAR_ELEVAGE/${propre}`, data, directory: Directory.Documents, recursive: true });
    } catch { /* l'accès Documents peut être refusé : le partage suffit */ }
    const res = await Filesystem.writeFile({ path: propre, data, directory: Directory.Cache });
    await Share.share({ title: titre, files: [res.uri], dialogTitle: 'Enregistrer ou envoyer' });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = propre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function versCSV<T>(lignes: T[], colonnes: Colonne<T>[]): Blob {
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const contenu = [colonnes.map((c) => esc(c.titre)).join(';'),
    ...lignes.map((r) => colonnes.map((c) => esc((c.brut ?? c.valeur)(r))).join(';'))].join('\r\n');
  return new Blob(['﻿' + contenu], { type: 'text/csv;charset=utf-8' });
}

export function versExcel(feuilles: { nom: string; lignes: any[]; colonnes: Colonne[] }[]): Blob {
  const wb = XLSX.utils.book_new();
  for (const f of feuilles) {
    const data = [f.colonnes.map((c) => c.titre), ...f.lignes.map((r) => f.colonnes.map((c) => {
      const v = (c.brut ?? c.valeur)(r);
      return v === undefined ? null : v;
    }))];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = f.colonnes.map((c) => ({ wch: Math.max(10, c.titre.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, f.nom.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const VERT: [number, number, number] = [31, 107, 53];

export function enTetePDF(doc: jsPDF, titre: string, sousTitre?: string, exploitation = 'ANSAR ELEVAGE') {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...VERT);
  doc.rect(0, 0, w, 22, 'F');
  doc.setFillColor(242, 201, 76);
  doc.rect(0, 22, w, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(exploitation.toUpperCase(), 12, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Gestion Avicole', 12, 16);
  doc.text(`Édité le ${dateHeureFr(new Date().toISOString())}`, w - 12, 16, { align: 'right' });
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(titre, 12, 33);
  if (sousTitre) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(sousTitre, 12, 39);
    doc.setTextColor(20, 20, 20);
  }
  return sousTitre ? 44 : 38;
}

export function piedPDF(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`ANSAR ELEVAGE — page ${i}/${pages}`, w / 2, h - 6, { align: 'center' });
  }
}

/** Remplace les espaces fines insécables (non gérées par la police PDF standard) */
export const pdfTxt = (s: any) => String(s ?? '').replace(/[  ]/g, ' ');

export function versPDF<T>(titre: string, lignes: T[], colonnes: Colonne<T>[], sousTitre?: string,
  totaux?: (string | number)[], exploitation?: string): Blob {
  const paysage = colonnes.length > 6;
  const doc = new jsPDF({ orientation: paysage ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const y = enTetePDF(doc, titre, sousTitre, exploitation);
  autoTable(doc, {
    startY: y,
    head: [colonnes.map((c) => c.titre)],
    body: lignes.map((r) => colonnes.map((c) => pdfTxt(c.valeur(r)))),
    foot: totaux ? [totaux.map(pdfTxt)] : undefined,
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: VERT, textColor: 255 },
    footStyles: { fillColor: [250, 240, 200], textColor: 20, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [244, 248, 244] },
    columnStyles: Object.fromEntries(colonnes.map((c, i) => [i, { halign: c.droite ? 'right' : 'left' }])),
    margin: { left: 10, right: 10 },
  });
  piedPDF(doc);
  return doc.output('blob');
}

export async function exporter<T>(format: 'pdf' | 'xlsx' | 'csv', nomFichier: string, titre: string,
  lignes: T[], colonnes: Colonne<T>[], sousTitre?: string, totaux?: (string | number)[]) {
  const date = new Date().toISOString().slice(0, 10);
  let blob: Blob;
  if (format === 'pdf') blob = versPDF(titre, lignes, colonnes, sousTitre, totaux);
  else if (format === 'xlsx') blob = versExcel([{ nom: titre, lignes, colonnes }]);
  else blob = versCSV(lignes, colonnes);
  await partagerFichier(`${nomFichier}_${date}.${format}`, blob, titre);
}
