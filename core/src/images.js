import { unzlibSync, strFromU8 } from 'fflate';
import { be32, le32, ascii, startsWith, concat, writeLe32 } from './util.js';
import { readExif, addExifToReport } from './exif.js';

// ---------------------------------------------------------------- PNG

const PNG_KEEP = new Set([
  'IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'sBIT', 'bKGD', 'pHYs',
  'acTL', 'fcTL', 'fdAT', 'cICP', 'mDCV', 'cLLI', 'mDCv', 'cLLi',
]);

export function cleanPng(b, opts, report) {
  const out = [b.subarray(0, 8)];
  let pos = 8;
  while (pos + 12 <= b.length) {
    const len = be32(b, pos);
    const type = ascii(b, pos + 4, 4);
    const end = pos + 12 + len;
    if (end > b.length) throw new Error('Bozuk PNG parçası');
    const data = b.subarray(pos + 8, pos + 8 + len);
    const chunk = b.subarray(pos, end);
    pos = end;

    if (PNG_KEEP.has(type)) {
      out.push(chunk);
      if (type === 'IEND') break;
      continue;
    }
    if (type === 'iCCP' && opts.keepColorProfile) { out.push(chunk); continue; }

    switch (type) {
      case 'tEXt': case 'zTXt': case 'iTXt': {
        const z = data.indexOf(0);
        const key = ascii(data, 0, z);
        if (key === 'XML:com.adobe.xmp') { report.addRemoved('XMP meta verisi'); break; }
        let value = '';
        try {
          if (type === 'tEXt') value = ascii(data, z + 1, data.length);
          else if (type === 'zTXt') value = strFromU8(unzlibSync(data.subarray(z + 2)), true);
          else {
            let p = z + 3;
            p = data.indexOf(0, p) + 1; // dil
            p = data.indexOf(0, p) + 1; // çevrilmiş anahtar
            value = data[z + 1] ? strFromU8(unzlibSync(data.subarray(p))) : strFromU8(data.subarray(p));
          }
        } catch { /* yalnızca rapor için */ }
        report.addFound(key || 'Metin', value);
        report.addRemoved('Metin bilgileri (yazar, açıklama, yazılım vb.)');
        break;
      }
      case 'eXIf':
        addExifToReport(report, readExif(data, 0));
        report.addRemoved('EXIF (kamera, tarih, GPS konumu)');
        break;
      case 'tIME':
        report.addFound('Değiştirilme zamanı',
          `${(data[0] << 8) | data[1]}-${data[2]}-${data[3]} ${data[4]}:${data[5]}`);
        report.addRemoved('Zaman damgası');
        break;
      case 'iCCP': report.addRemoved('ICC renk profili'); break;
      case 'caBX': report.addRemoved('İçerik kimlik bilgisi (C2PA)'); break;
      default: report.addRemoved(`Ek PNG parçası (${type})`);
    }
  }
  if (pos < b.length) report.addRemoved('Dosya sonrası gizli ek veri');
  return concat(out);
}

// ---------------------------------------------------------------- WebP

export function cleanWebp(b, opts, report) {
  const chunks = [];
  let pos = 12;
  let vp8x = null;
  while (pos + 8 <= b.length) {
    const type = ascii(b, pos, 4);
    const len = le32(b, pos + 4);
    const end = pos + 8 + len + (len & 1);
    if (pos + 8 + len > b.length) throw new Error('Bozuk WebP parçası');
    const chunk = b.slice(pos, Math.min(end, b.length));
    pos = end;
    if (type === 'EXIF') {
      const data = chunk.subarray(8, 8 + len);
      const off = startsWith(data, 'Exif\0') ? 6 : 0;
      addExifToReport(report, readExif(data, off));
      report.addRemoved('EXIF (kamera, tarih, GPS konumu)');
    } else if (type === 'XMP ') {
      report.addRemoved('XMP meta verisi');
    } else if (type === 'ICCP' && !opts.keepColorProfile) {
      report.addRemoved('ICC renk profili');
    } else if (['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP'].includes(type)) {
      if (type === 'VP8X') vp8x = chunk;
      chunks.push(chunk);
    } else {
      report.addRemoved(`Ek WebP parçası (${type.trim()})`);
    }
  }
  if (vp8x) {
    let flags = vp8x[8] & ~(0x08 | 0x04); // EXIF ve XMP bayrakları
    if (!chunks.some((c) => ascii(c, 0, 4) === 'ICCP')) flags &= ~0x20;
    vp8x[8] = flags;
  }
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(b.subarray(0, 12));
  writeLe32(header, 4, body.length + 4);
  return concat([header, body]);
}

// ---------------------------------------------------------------- GIF

function skipSubBlocks(b, p) {
  while (p < b.length) {
    const n = b[p];
    p += 1 + n;
    if (n === 0) break;
  }
  return p;
}

export function cleanGif(b, opts, report) {
  const out = [];
  let pos = 13;
  if (b[10] & 0x80) pos += 3 * (1 << ((b[10] & 7) + 1));
  out.push(b.subarray(0, pos));
  while (pos < b.length) {
    const t = b[pos];
    if (t === 0x3b) { out.push(new Uint8Array([0x3b])); pos++; break; }
    if (t === 0x2c) {
      let p = pos + 10;
      const flags = b[pos + 9];
      if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1));
      p = skipSubBlocks(b, p + 1);
      out.push(b.subarray(pos, p));
      pos = p;
    } else if (t === 0x21) {
      const label = b[pos + 1];
      const end = skipSubBlocks(b, pos + 2);
      if (label === 0xf9 || label === 0x01) {
        out.push(b.subarray(pos, end));
      } else if (label === 0xff) {
        const id = ascii(b, pos + 3, 11);
        if (id === 'NETSCAPE2.0' || id === 'ANIMEXTS1.0') out.push(b.subarray(pos, end));
        else if (id.startsWith('XMP')) report.addRemoved('XMP meta verisi');
        else if (id.startsWith('ICCRGBG1') && opts.keepColorProfile) out.push(b.subarray(pos, end));
        else report.addRemoved(`Uygulama verisi (${id.trim()})`);
      } else if (label === 0xfe) {
        let s = '', p = pos + 2;
        while (b[p]) { s += ascii(b, p + 1, b[p]); p += b[p] + 1; }
        report.addFound('Yorum', s);
        report.addRemoved('GIF yorumu');
      } else {
        report.addRemoved('Bilinmeyen GIF uzantısı');
      }
      pos = end;
    } else {
      throw new Error('Bozuk GIF yapısı');
    }
  }
  if (pos < b.length) report.addRemoved('Dosya sonrası gizli ek veri');
  return concat(out);
}

// ---------------------------------------------------------------- SVG

export function cleanSvg(text, report) {
  let s = text;
  const meta = s.match(/<metadata[\s\S]*?<\/metadata>|<metadata\s*\/>/gi);
  if (meta) {
    const creator = /<dc:creator>[\s\S]*?<dc:title>([^<]*)/i.exec(meta.join(''));
    if (creator) report.addFound('Yazar', creator[1]);
    s = s.replace(/<metadata[\s\S]*?<\/metadata>|<metadata\s*\/>/gi, '');
    report.addRemoved('SVG meta verisi (yazar, lisans, RDF)');
  }
  if (/<!--[\s\S]*?-->/.test(s)) {
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    report.addRemoved('Yorumlar (oluşturan program bilgisi)');
  }
  if (/<sodipodi:namedview/i.test(s)) {
    s = s.replace(/<sodipodi:namedview[\s\S]*?(\/>|<\/sodipodi:namedview>)/gi, '');
    report.addRemoved('Inkscape görünüm ayarları');
  }
  const attr = /\s(?:sodipodi|inkscape):(?:docname|export-filename|export-xdpi|export-ydpi|version)="([^"]*)"/gi;
  let m;
  while ((m = attr.exec(s))) if (/docname|filename/i.test(m[0])) report.addFound('Dosya adı / yolu', m[1]);
  if (attr.test(s)) {
    s = s.replace(attr, '');
    report.addRemoved('Belge adı ve dışa aktarma yolu');
  }
  return s;
}

