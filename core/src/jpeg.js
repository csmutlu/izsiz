import { be16, startsWith, concat } from './util.js';
import { readExif, addExifToReport, minimalExifPayload } from './exif.js';

function segment(marker, payload) {
  const len = payload.length + 2;
  return concat([new Uint8Array([0xff, marker, len >> 8, len & 0xff]), payload]);
}

// JPEG: SOI'den EOI'ye kadar segmentleri gezer; görüntü için gerekli olanları
// (tablolar, çerçeve, tarama verisi, Adobe renk dönüşümü) tutar, gerisini atar.
export function cleanJpeg(b, opts, report) {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('Geçersiz JPEG dosyası');
  const out = [b.subarray(0, 2)];
  let insertAt = 1;
  let orientation = 1;
  let pos = 2;
  let inScan = false;
  let ended = false;

  while (pos < b.length) {
    if (inScan) {
      let p = pos;
      while (p < b.length - 1) {
        if (b[p] === 0xff) {
          const m = b[p + 1];
          if (m === 0x00 || (m >= 0xd0 && m <= 0xd7)) { p += 2; continue; }
          break;
        }
        p++;
      }
      if (p >= b.length - 1) { out.push(b.subarray(pos)); pos = b.length; break; }
      out.push(b.subarray(pos, p));
      pos = p;
      inScan = false;
    }
    if (b[pos] !== 0xff) throw new Error('Bozuk JPEG yapısı');
    while (b[pos + 1] === 0xff) pos++;
    const marker = b[pos + 1];

    if (marker === 0xd9) {
      out.push(new Uint8Array([0xff, 0xd9]));
      if (pos + 2 < b.length) report.addRemoved('Görüntü sonrası gizli ek veri (ek görüntüler, derinlik haritası vb.)');
      ended = true;
      break;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(b.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }
    const len = be16(b, pos + 2);
    const segEnd = pos + 2 + len;
    if (segEnd > b.length) throw new Error('Bozuk JPEG segmenti');
    const payload = b.subarray(pos + 4, segEnd);
    const seg = b.subarray(pos, segEnd);
    pos = segEnd;

    if (marker === 0xda) { out.push(seg); inScan = true; continue; }
    if (marker === 0xfe) { report.addRemoved('JPEG yorumu'); continue; }
    if (marker < 0xe0 || marker > 0xef) { out.push(seg); continue; }

    // APPn segmentleri
    if (marker === 0xe0) {
      if (startsWith(payload, 'JFIF\0') && payload.length >= 14) {
        const p = payload.slice(0, 14);
        if (p[12] || p[13]) report.addRemoved('JFIF küçük resmi');
        p[12] = 0; p[13] = 0;
        out.push(segment(0xe0, p));
        if (insertAt === 1) insertAt = out.length;
      } else {
        report.addRemoved('JFIF uzantısı / küçük resim');
      }
    } else if (marker === 0xe1) {
      if (startsWith(payload, 'Exif\0')) {
        const info = readExif(payload, 6);
        if (info.orientation >= 1 && info.orientation <= 8) orientation = info.orientation;
        addExifToReport(report, info);
        report.addRemoved('EXIF (kamera, tarih, GPS konumu, seri no, küçük resim)');
      } else if (startsWith(payload, 'http://ns.adobe.com/')) {
        report.addRemoved('XMP meta verisi');
      } else {
        report.addRemoved('APP1 meta verisi');
      }
    } else if (marker === 0xe2) {
      if (startsWith(payload, 'ICC_PROFILE\0')) {
        if (opts.keepColorProfile) out.push(seg);
        else report.addRemoved('ICC renk profili');
      } else if (startsWith(payload, 'MPF\0')) {
        report.addRemoved('Çoklu görüntü (MPF) bilgisi');
      } else {
        report.addRemoved('APP2 meta verisi');
      }
    } else if (marker === 0xed) {
      report.addRemoved('IPTC / Photoshop bilgisi');
    } else if (marker === 0xee && startsWith(payload, 'Adobe')) {
      out.push(seg); // CMYK JPEG'lerin doğru renkte açılması için gerekli
    } else {
      report.addRemoved(`APP${marker - 0xe0} meta verisi`);
    }
  }

  if (!ended && !inScan) report.warn('JPEG beklenmedik şekilde bitti; dosya eksik olabilir.');
  if (opts.keepOrientation && orientation !== 1) {
    out.splice(insertAt, 0, segment(0xe1, minimalExifPayload(orientation)));
  }
  return concat(out);
}
