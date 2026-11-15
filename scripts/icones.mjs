// Génère l'icône et l'écran de démarrage ANSAR ELEVAGE (web + Android) à partir de resources/logo.svg
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const racine = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const logo = fs.readFileSync(path.join(racine, 'resources/logo.svg'));
const res = path.join(racine, 'android/app/src/main/res');

await sharp(logo).resize(512, 512).png().toFile(path.join(racine, 'public/icon.png'));

const ecran = (w, h) => {
  const t = Math.min(w, h);
  const ic = Math.round(t * 0.34);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1F6B35"/><stop offset="1" stop-color="#0F3A1C"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <image href="data:image/svg+xml;base64,${logo.toString('base64')}" x="${(w - ic) / 2}" y="${h / 2 - ic * 0.85}" width="${ic}" height="${ic}"/>
  <text x="${w / 2}" y="${h / 2 + ic * 0.42}" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="${Math.round(t * 0.075)}" fill="#FFFFFF" text-anchor="middle" letter-spacing="${Math.round(t * 0.006)}">ANSAR ELEVAGE</text>
  <text x="${w / 2}" y="${h / 2 + ic * 0.42 + t * 0.065}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${Math.round(t * 0.04)}" fill="#F2C94C" text-anchor="middle" letter-spacing="${Math.round(t * 0.008)}">GESTION AVICOLE</text>
</svg>`);
};
await sharp(ecran(1080, 1920)).png().toFile(path.join(racine, 'resources/splash.png'));

if (fs.existsSync(res)) {
  const tailles = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  const premier = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
  for (const [d, s] of Object.entries(tailles)) {
    const dir = path.join(res, `mipmap-${d}`);
    fs.mkdirSync(dir, { recursive: true });
    await sharp(logo).resize(s, s).png().toFile(path.join(dir, 'ic_launcher.png'));
    const rond = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="#fff"/></svg>`);
    await sharp(logo).resize(s, s).composite([{ input: rond, blend: 'dest-in' }]).png().toFile(path.join(dir, 'ic_launcher_round.png'));
    // Premier plan de l'icône adaptative : logo sans fond, réduit dans la zone de sécurité (66 %)
    const f = premier[d];
    const interieur = Math.round(f * 0.62);
    const sansFond = logo.toString().replace(/<rect[^>]*\/>/, '');
    const fg = await sharp(Buffer.from(sansFond)).resize(interieur, interieur).png().toBuffer();
    await sharp({ create: { width: f, height: f, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: fg, left: Math.round((f - interieur) / 2), top: Math.round((f - interieur) / 2) }]).png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'));
  }
  fs.writeFileSync(path.join(res, 'values/ic_launcher_background.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1F6B35</color>\n</resources>\n');
  // Écrans de démarrage
  for (const dir of fs.readdirSync(res).filter((x) => x.startsWith('drawable'))) {
    const f = path.join(res, dir, 'splash.png');
    if (!fs.existsSync(f)) continue;
    const m = await sharp(f).metadata();
    await sharp(ecran(m.width, m.height)).png().toFile(f);
  }
  console.log('Icônes Android générées');
}
console.log('OK');
