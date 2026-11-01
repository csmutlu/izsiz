// Küçük bayt yardımcıları. Node, Electron ve React Native (Hermes) ortamlarında
// aynı şekilde çalışması için Buffer / TextDecoder kullanılmıyor.

export const be16 = (b, o) => (b[o] << 8) | b[o + 1];
export const le16 = (b, o) => b[o] | (b[o + 1] << 8);
export const be32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
export const le32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + ((b[o + 3] << 24) >>> 0);

export function beN(b, o, n) {
  let v = 0;
  for (let i = 0; i < n; i++) v = v * 256 + b[o + i];
  return v;
}

export function ascii(b, start, len) {
  let s = '';
  const end = Math.min(b.length, start + len);
  for (let i = start; i < end; i++) s += String.fromCharCode(b[i]);
  return s;
}

export function startsWith(b, str, off = 0) {
  if (off + str.length > b.length) return false;
  for (let i = 0; i < str.length; i++) if (b[off + i] !== str.charCodeAt(i)) return false;
  return true;
}

export function indexOf(b, str, from = 0, to = b.length) {
  const first = str.charCodeAt(0);
  const last = Math.min(to, b.length) - str.length;
  outer: for (let i = from; i <= last; i++) {
    if (b[i] !== first) continue;
    for (let j = 1; j < str.length; j++) if (b[i + j] !== str.charCodeAt(j)) continue outer;
    return i;
  }
  return -1;
}

export function concat(parts) {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function fromAscii(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

export function writeBe32(b, o, v) {
  b[o] = (v >>> 24) & 0xff; b[o + 1] = (v >>> 16) & 0xff; b[o + 2] = (v >>> 8) & 0xff; b[o + 3] = v & 0xff;
}

export function writeLe32(b, o, v) {
  b[o] = v & 0xff; b[o + 1] = (v >>> 8) & 0xff; b[o + 2] = (v >>> 16) & 0xff; b[o + 3] = (v >>> 24) & 0xff;
}

export const clip = (s, n = 120) => {
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

// Her dosya için ne bulunduğunu ve ne silindiğini toplayan rapor.
export class Report {
  constructor() {
    this.found = [];
    this.removed = [];
    this.warnings = [];
  }
  addFound(label, value) {
    if (value == null || value === '' || value === 'Author') return;
    const v = clip(value);
    if (!this.found.some((f) => f.label === label && f.value === v)) this.found.push({ label, value: v });
  }
  addRemoved(label) {
    if (!this.removed.includes(label)) this.removed.push(label);
  }
  warn(msg) {
    if (!this.warnings.includes(msg)) this.warnings.push(msg);
  }
  merge(other, prefix = '') {
    for (const f of other.found) this.addFound(prefix + f.label, f.value);
    for (const r of other.removed) this.addRemoved(prefix + r);
    for (const w of other.warnings) this.warn(prefix + w);
  }
  get count() {
    return this.removed.length;
  }
}
