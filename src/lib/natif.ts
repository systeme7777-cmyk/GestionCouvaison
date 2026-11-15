import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const estNatif = () => Capacitor.isNativePlatform();

export async function nomAppareil(): Promise<string> {
  try {
    const i = await Device.getInfo();
    if (i.platform === 'web') return 'Navigateur web';
    const fab = i.manufacturer ? i.manufacturer.charAt(0).toUpperCase() + i.manufacturer.slice(1) : '';
    return `${fab} ${i.model ?? ''}`.trim();
  } catch {
    return '';
  }
}

function blobEnBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

/** Enregistre un fichier (PDF, Excel) : partage Android sur téléphone, téléchargement sur navigateur. */
export async function enregistrerFichier(nom: string, blob: Blob) {
  if (estNatif()) {
    const data = await blobEnBase64(blob);
    const res = await Filesystem.writeFile({ path: nom, data, directory: Directory.Cache });
    await Share.share({ title: nom, files: [res.uri], dialogTitle: 'Enregistrer ou partager le rapport' });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Réduit une photo (max 1600 px, JPEG) pour économiser les données mobiles. */
export async function compresserImage(fichier: File, max = 1600, qualite = 0.8): Promise<Blob> {
  const url = URL.createObjectURL(fichier);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const ratio = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * ratio);
    c.height = Math.round(img.height * ratio);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Image illisible'))), 'image/jpeg', qualite));
  } finally {
    URL.revokeObjectURL(url);
  }
}
