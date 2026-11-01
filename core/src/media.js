// Video (MP4/MOV), HEIC/AVIF ve MP3 temizleme.
// MP4/HEIC'de kutular silinmez, aynı boyutta "free" kutusuna çevrilip
// içi sıfırlanır; böylece video verisinin konumları (stco ofsetleri) bozulmaz.
import { be16, be32, beN, ascii, startsWith, fromAscii, indexOf } from './util.js';
import { readExif, addExifToReport } from './exif.js';

function boxes(b, start, end) {
  const list = [];
  let p = start;
  while (p + 8 <= end) {
    let size = be32(b, p);
    const type = ascii(b, p + 4, 4);
    let hdr = 8;
    if (size === 1) { size = beN(b, p + 8, 8); hdr = 16; }
    else if (size === 0) size = end - p;
    if (size < hdr || p + size > end) break;
    list.push({ type, start: p, hdr, end: p + size });
    p += size;
  }
  return list;
}

function toFree(b, box) {
  b.set(fromAscii('free'), box.start + 4);
  b.fill(0, box.start + box.hdr, box.end);
}

function zeroTimes(b, box) {
  const p = box.start + box.hdr;
  const v1 = b[p] === 1;
  b.fill(0, p + 4, p + 4 + (v1 ? 16 : 8));
}

const ISO6709 = /[+-]\d{1,2}(?:\.\d+)?[+-]\d{1,3}(?:\.\d+)?/;

function describeMeta(b, box, report) {
  const text = ascii(b, box.start, Math.min(box.end - box.start, 200000));
  const loc = ISO6709.exec(text);
  if (loc && (text.includes('©xyz') || text.includes('location'))) report.addFound('GPS konumu', loc[0]);
  for (const [key, label] of [['quicktime.make', 'Cihaz markası'], ['quicktime.model', 'Cihaz modeli'], ['quicktime.software', 'Yazılım']]) {
    if (text.includes(key)) report.addFound(label, 'var');
  }
  const enc = /©too.{0,12}?([ -~]{3,60})/.exec(text);
  if (enc) report.addFound('Kodlayan yazılım', enc[1]);
}

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'moof', 'traf', 'mvex']);
const XMP_UUID = 'be7acfcb97a942e89c71999491e3afac';

export function cleanMp4(input, opts, report) {
  const b = input.slice();
  const walk = (start, end, top) => {
    for (const box of boxes(b, start, end)) {
      if (box.type === 'udta' || box.type === 'meta' || box.type === 'XMP_') {
        describeMeta(b, box, report);
        toFree(b, box);
        report.addRemoved('Video meta verisi (GPS konumu, cihaz, yazılım, tarih)');
      } else if (box.type === 'uuid' && top) {
        let id = '';
        for (let i = 0; i < 16; i++) id += b[box.start + 8 + i].toString(16).padStart(2, '0');
        if (id === XMP_UUID) { toFree(b, box); report.addRemoved('XMP meta verisi'); }
      } else if (box.type === 'mvhd' || box.type === 'tkhd' || box.type === 'mdhd') {
        zeroTimes(b, box);
        report.addRemoved('Oluşturma / değiştirme tarihleri');
      } else if (CONTAINERS.has(box.type)) {
        walk(box.start + box.hdr, box.end, false);
      }
    }
  };
  walk(0, b.length, true);
  return b;
}

// ---------------------------------------------------------------- HEIC / AVIF

export function cleanHeif(input, opts, report) {
  const b = input.slice();
  const meta = boxes(b, 0, b.length).find((x) => x.type === 'meta');
  if (!meta) throw new Error('HEIF meta kutusu bulunamadı');
  const inner = boxes(b, meta.start + meta.hdr + 4, meta.end);
  const targets = new Map(); // itemId -> 'exif' | 'xmp'

  const iinf = inner.find((x) => x.type === 'iinf');
  if (iinf) {
    const p = iinf.start + iinf.hdr;
    const off = b[p] === 0 ? 6 : 8;
    for (const infe of boxes(b, p + off, iinf.end)) {
      if (infe.type !== 'infe') continue;
      const q = infe.start + infe.hdr;
      const v = b[q];
      if (v < 2) continue;
      const idLen = v === 2 ? 2 : 4;
      const id = beN(b, q + 4, idLen);
      const itemType = ascii(b, q + 4 + idLen + 2, 4);
      if (itemType === 'Exif') targets.set(id, 'exif');
      else if (itemType === 'mime') {
        const ct = ascii(b, q + 4 + idLen + 6, Math.min(64, infe.end - (q + 4 + idLen + 6)));
        if (/rdf\+xml|xmp/i.test(ct)) targets.set(id, 'xmp');
      }
    }
  }
  if (!targets.size) return b;

  const idat = inner.find((x) => x.type === 'idat');
  const iloc = inner.find((x) => x.type === 'iloc');
  if (!iloc) throw new Error('HEIF iloc kutusu bulunamadı');
  let p = iloc.start + iloc.hdr;
  const v = b[p];
  p += 4;
  const offSize = b[p] >> 4, lenSize = b[p] & 15, baseSize = b[p + 1] >> 4;
  const idxSize = v === 1 || v === 2 ? b[p + 1] & 15 : 0;
  p += 2;
  const count = v < 2 ? be16(b, p) : be32(b, p);
  p += v < 2 ? 2 : 4;
  for (let i = 0; i < count; i++) {
    const id = v < 2 ? be16(b, p) : be32(b, p);
    p += v < 2 ? 2 : 4;
    let method = 0;
    if (v === 1 || v === 2) { method = b[p + 1] & 15; p += 2; }
    p += 2; // data_reference_index
    const base = beN(b, p, baseSize); p += baseSize;
    const extents = be16(b, p); p += 2;
    for (let e = 0; e < extents; e++) {
      p += idxSize;
      const eo = beN(b, p, offSize); p += offSize;
      const el = beN(b, p, lenSize); p += lenSize;
      const kind = targets.get(id);
      if (!kind) continue;
      const startAbs = (method === 1 && idat ? idat.start + idat.hdr : 0) + base + eo;
      const endAbs = Math.min(b.length, startAbs + el);
      if (method > 1 || startAbs >= endAbs) continue;
      if (kind === 'exif') {
        if (e === 0) {
          const tiff = startAbs + 4 + be32(b, startAbs);
          if (tiff < endAbs) addExifToReport(report, readExif(b, tiff, endAbs));
        }
        b.fill(0, startAbs, endAbs);
        if (e === 0 && endAbs - startAbs >= 18) {
          // Boş ama geçerli bir EXIF bırak (bazı görüntüleyiciler boş bloğa takılmasın)
          b.set([0, 0, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0], startAbs);
        }
        report.addRemoved('EXIF (kamera, tarih, GPS konumu, seri no)');
      } else {
        b.fill(0x20, startAbs, endAbs);
        report.addRemoved('XMP meta verisi');
      }
    }
  }
  return b;
}

// ---------------------------------------------------------------- MP3

export function cleanMp3(b, opts, report) {
  let start = 0;
  let end = b.length;
  while (startsWith(b, 'ID3', start)) {
    const size = ((b[start + 6] & 0x7f) << 21) | ((b[start + 7] & 0x7f) << 14) | ((b[start + 8] & 0x7f) << 7) | (b[start + 9] & 0x7f);
    const frames = ascii(b, start + 10, Math.min(size, 4000));
    for (const [id, label] of [['TPE1', 'Sanatçı'], ['TIT2', 'Başlık'], ['TENC', 'Kodlayan'], ['TSSE', 'Yazılım'], ['COMM', 'Yorum']]) {
      const i = frames.indexOf(id);
      if (i >= 0) report.addFound(label, frames.substr(i + 11, be32(b, start + 10 + i + 4) - 1).replace(/[^\x20-\x7e -ÿ]/g, ''));
    }
    start += 10 + size + (b[start + 5] & 0x10 ? 10 : 0);
    report.addRemoved('ID3v2 etiketleri (sanatçı, albüm, kapak, yorum, yazılım)');
  }
  if (end - 128 >= start && startsWith(b, 'TAG', end - 128)) {
    end -= 128;
    report.addRemoved('ID3v1 etiketi');
    if (end - 227 >= start && startsWith(b, 'TAG+', end - 227)) end -= 227;
  }
  if (end - 32 >= start && startsWith(b, 'APETAGEX', end - 32)) {
    const size = b[end - 20] | (b[end - 19] << 8) | (b[end - 18] << 16) | (b[end - 17] << 24);
    const hasHeader = b[end - 9] & 0x80;
    end = Math.max(start, end - size - (hasHeader ? 32 : 0));
    report.addRemoved('APE etiketleri');
  }
  const lyr = indexOf(b, 'LYRICSBEGIN', Math.max(start, end - 10000), end);
  if (lyr >= 0) { end = lyr; report.addRemoved('Şarkı sözü etiketi'); }
  return start === 0 && end === b.length ? b : b.slice(start, end);
}

