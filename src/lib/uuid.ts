export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  (globalThis.crypto as Crypto).getRandomValues(b);
  return formatUuid(b);
}

function formatUuid(b: Uint8Array): string {
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Identifiant déterministe : deux téléphones hors ligne qui saisissent le suivi du même lot
 * le même jour produisent le même id, ce qui évite les doublons lors de la synchronisation.
 */
export function uuidDeterministe(cle: string): string {
  const b = new Uint8Array(16);
  for (let k = 0; k < 4; k++) {
    let h = 0x811c9dc5 ^ (k * 0x9e3779b1);
    for (let i = 0; i < cle.length; i++) {
      h ^= cle.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
    b[k * 4] = h >>> 24; b[k * 4 + 1] = (h >>> 16) & 255; b[k * 4 + 2] = (h >>> 8) & 255; b[k * 4 + 3] = h & 255;
  }
  return formatUuid(b);
}
