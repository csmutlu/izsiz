// EXIF (TIFF) bloğundan kullanıcıya gösterilecek özet bilgileri okur.
// Yalnızca rapor içindir; temizleme EXIF'i tamamen atarak yapılır.

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

const IFD0_TAGS = {
  0x010e: 'Açıklama',
  0x010f: 'Kamera markası',
  0x0110: 'Kamera modeli',
  0x0131: 'Yazılım',
  0x0132: 'Değiştirilme tarihi',
  0x013b: 'Sanatçı / Yazar',
  0x8298: 'Telif hakkı',
};
const EXIF_TAGS = {
  0x9003: 'Çekim tarihi',
  0xa420: 'Benzersiz görüntü kimliği',
  0xa430: 'Kamera sahibi',
  0xa431: 'Cihaz seri numarası',
  0xa433: 'Lens markası',
  0xa434: 'Lens modeli',
};

export function readExif(b, tiffStart, end = b.length) {
  const result = { orientation: 1, fields: [] };
  if (tiffStart + 8 > end) return result;
  const le = b[tiffStart] === 0x49;
  const r16 = (o) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const r32 = (o) =>
    le
      ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + ((b[o + 3] << 24) >>> 0)
      : ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

  const entries = (ifdOffset) => {
    const list = [];
    const p = tiffStart + ifdOffset;
    if (ifdOffset <= 0 || p + 2 > end) return list;
    const n = r16(p);
    for (let i = 0; i < n && i < 500; i++) {
      const e = p + 2 + i * 12;
      if (e + 12 > end) break;
      const tag = r16(e), type = r16(e + 2), count = r32(e + 4);
      const size = (TYPE_SIZE[type] || 1) * count;
      const pos = size > 4 ? tiffStart + r32(e + 8) : e + 8;
      if (pos + Math.min(size, 4) > end) continue;
      list.push({ tag, type, count, pos, size });
    }
    return list;
  };
  const str = (en) => {
    let s = '';
    for (let i = 0; i < en.count && en.pos + i < end; i++) {
      const c = b[en.pos + i];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  };
  const rational = (o) => {
    const d = r32(o + 4);
    return d ? r32(o) / d : 0;
  };
  const push = (label, value) => value && result.fields.push({ label, value });

  try {
    let exifPtr = 0, gpsPtr = 0;
    for (const en of entries(r32(tiffStart + 4))) {
      if (en.tag === 0x0112) result.orientation = r16(en.pos);
      else if (en.tag === 0x8769) exifPtr = r32(en.pos);
      else if (en.tag === 0x8825) gpsPtr = r32(en.pos);
      else if (IFD0_TAGS[en.tag] && en.type === 2) push(IFD0_TAGS[en.tag], str(en));
    }
    for (const en of entries(exifPtr)) {
      if (EXIF_TAGS[en.tag] && en.type === 2) push(EXIF_TAGS[en.tag], str(en));
    }
    if (gpsPtr) {
      const g = {};
      for (const en of entries(gpsPtr)) g[en.tag] = en;
      if (g[2] && g[4] && g[2].pos + 24 <= end && g[4].pos + 24 <= end) {
        const dms = (en) => rational(en.pos) + rational(en.pos + 8) / 60 + rational(en.pos + 16) / 3600;
        let lat = dms(g[2]), lon = dms(g[4]);
        if (g[1] && String.fromCharCode(b[g[1].pos]) === 'S') lat = -lat;
        if (g[3] && String.fromCharCode(b[g[3].pos]) === 'W') lon = -lon;
        push('GPS konumu', `${lat.toFixed(5)}, ${lon.toFixed(5)}`);
      } else if (Object.keys(g).length) {
        push('GPS konumu', 'var');
      }
    }
  } catch {
    // Bozuk EXIF: özet çıkarılamadı, yine de blok silinecek.
  }
  return result;
}

export function addExifToReport(report, info) {
  for (const f of info.fields) report.addFound(f.label, f.value);
}

// Yalnızca yön (Orientation) etiketi içeren en küçük EXIF APP1 yükü.
export function minimalExifPayload(orientation) {
  return new Uint8Array([
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF başlığı (little endian)
    0x01, 0x00, // 1 kayıt
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation & 0xff, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, // sonraki IFD yok
  ]);
}
