import { strFromU8, strToU8 } from 'fflate';
import { Report, ascii, startsWith, be32 } from './util.js';
import { cleanJpeg } from './jpeg.js';
import { cleanPng, cleanWebp, cleanGif, cleanSvg } from './images.js';
import { cleanPdf } from './pdf.js';
import { cleanMp4, cleanHeif, cleanMp3 } from './media.js';
import { cleanZip } from './office.js';
import { cleanInvisible, isUtf8 } from './text.js';

export { cleanUrl, cleanText } from './url.js';
export { cleanInvisible } from './text.js';
export { readExif } from './exif.js';
export { LANGUAGES, pickLanguage, localize, localizeResult, localizeTextResult, CLEAN_SUFFIX } from './i18n.js';

export const DEFAULT_OPTIONS = {
  keepOrientation: true,   // fotoğrafın yan dönmemesi için yalnızca "yön" bilgisini bırak
  keepColorProfile: false, // ICC renk profili (kişisel değil ama cihaz izi taşıyabilir)
  strict: false,           // görünmez karakterlerin yanında alışılmadık boşlukları da düzelt
};

const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'log', 'json', 'xml', 'html', 'htm', 'yaml', 'yml', 'ini', 'rtf', 'srt', 'vtt', 'tex', 'js', 'ts', 'py', 'css']);
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'avif', 'avis', 'mif2']);

export const TYPE_LABELS = {
  jpeg: 'JPEG', png: 'PNG', webp: 'WebP', gif: 'GIF', svg: 'SVG', heif: 'HEIC', pdf: 'PDF',
  ooxml: 'Office', odf: 'ODF', zip: 'ZIP', mp4: 'Video', mp3: 'MP3', text: 'Metin',
};

export const SUPPORTED_EXTENSIONS = [
  'jpg', 'jpeg', 'jfif', 'png', 'apng', 'webp', 'gif', 'svg', 'heic', 'heif', 'avif', 'pdf',
  'docx', 'docm', 'dotx', 'xlsx', 'xlsm', 'pptx', 'pptm', 'odt', 'ods', 'odp', 'epub', 'zip',
  'mp4', 'mov', 'm4v', 'm4a', '3gp', 'mp3', ...TEXT_EXT,
];

export const extOf = (name) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
};

export function detectType(b, name = '') {
  const ext = extOf(name);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (startsWith(b, '\x89PNG\r\n\x1a\n')) return 'png';
  if (startsWith(b, 'GIF8')) return 'gif';
  if (startsWith(b, 'RIFF') && startsWith(b, 'WEBP', 8)) return 'webp';
  if (ascii(b, 0, 1024).includes('%PDF-')) return 'pdf';
  if (startsWith(b, 'PK\x03\x04')) {
    const head = ascii(b, 0, 2000);
    if (head.includes('[Content_Types].xml') || /^(docx|docm|dotx|xlsx|xlsm|pptx|pptm)$/.test(ext)) return 'ooxml';
    if (head.includes('mimetypeapplication/vnd.oasis')) return 'odf';
    return 'zip';
  }
  if (startsWith(b, 'ftyp', 4)) {
    const size = be32(b, 0);
    for (let p = 8; p + 4 <= Math.min(size, 64); p += 4) {
      if (p === 12) continue; // minor_version
      if (HEIF_BRANDS.has(ascii(b, p, 4))) return 'heif';
    }
    return 'mp4';
  }
  if (startsWith(b, 'ID3') || (ext === 'mp3' && b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
  if (ext === 'svg') return 'svg';
  if (TEXT_EXT.has(ext)) return 'text';
  return null;
}

function cleanTextFile(b, opts, report) {
  if (!isUtf8(b)) {
    report.warn('Metin UTF-8 değil; içerik değiştirilmeden yeni dosyaya yazıldı.');
    return b;
  }
  const r = cleanInvisible(strFromU8(b), { strict: opts.strict, keepLeadingBom: true });
  if (r.removed) {
    report.addFound('Görünmez karakter', `${r.removed} adet`);
    report.addRemoved('Görünmez izleme karakterleri');
  }
  if (r.spaces) report.addRemoved('Alışılmadık boşluk karakterleri');
  return r.removed || r.spaces ? strToU8(r.text) : b;
}

// Senkron temizleyiciler (ZIP içindeki dosyalar için de kullanılır)
function cleanSync(type, b, opts, report) {
  switch (type) {
    case 'jpeg': return cleanJpeg(b, opts, report);
    case 'png': return cleanPng(b, opts, report);
    case 'webp': return cleanWebp(b, opts, report);
    case 'gif': return cleanGif(b, opts, report);
    case 'heif': return cleanHeif(b, opts, report);
    case 'mp4': return cleanMp4(b, opts, report);
    case 'mp3': return cleanMp3(b, opts, report);
    case 'svg': return strToU8(cleanSvg(strFromU8(b), report));
    case 'text': return cleanTextFile(b, opts, report);
    default: return null;
  }
}

const cleanInnerFor = (opts) => (data, name) => {
  const type = detectType(data, name);
  if (!type || type === 'text' || type === 'pdf' || type === 'ooxml' || type === 'odf' || type === 'zip') return null;
  const report = new Report();
  try {
    const out = cleanSync(type, data, { ...opts, keepOrientation: true }, report);
    return out ? { data: out, report } : null;
  } catch {
    return null;
  }
};

/**
 * Bir dosyanın tüm meta verisini temizler.
 * @param {Uint8Array} bytes  Dosya içeriği
 * @param {string} name       Dosya adı (tür tespiti için)
 * @returns {Promise<{ok, type, data?, error?, found, removed, warnings}>}
 */
export async function cleanFile(bytes, name, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const report = new Report();
  const type = detectType(b, name);
  if (!type) {
    return { ok: false, type: null, error: 'Bu dosya türü desteklenmiyor.', found: [], removed: [], warnings: [] };
  }
  try {
    let data;
    if (type === 'pdf') data = await cleanPdf(b, opts, report);
    else if (type === 'ooxml' || type === 'odf' || type === 'zip') {
      data = cleanZip(b, opts, report, cleanInnerFor(opts));
      if (type === 'zip') report.warn('Arşiv içindeki PDF ve Office dosyaları ayrıca temizlenmez; onları ayrı ayrı temizleyin.');
    } else data = cleanSync(type, b, opts, report);
    report.addRemoved('Dosya sistemi bilgileri (oluşturma tarihi, indirme kaynağı, etiketler)');
    return { ok: true, type, data, found: report.found, removed: report.removed, warnings: report.warnings };
  } catch (e) {
    return { ok: false, type, error: (e && e.message) || String(e), found: report.found, removed: [], warnings: report.warnings };
  }
}

export function cleanName(name, { random = false, suffix = '_temiz' } = {}) {
  const ext = extOf(name);
  const base = ext ? name.slice(0, -(ext.length + 1)) : name;
  if (random) {
    let r = '';
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 10; i++) r += chars[Math.floor(Math.random() * chars.length)];
    return ext ? `${r}.${ext}` : r;
  }
  return ext ? `${base}${suffix}.${ext}` : `${base}${suffix}`;
}
