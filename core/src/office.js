// ZIP tabanlı belgeler: Word/Excel/PowerPoint (OOXML), LibreOffice (ODF),
// EPUB ve düz ZIP. Paket açılır, meta veri dosyaları sıfırlanır, içteki
// fotoğraflar da temizlenir ve sabit tarihlerle yeniden paketlenir.
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

const FIXED_DATE = new Date(1980, 0, 1, 0, 0, 0);
const ANON = 'Author';

const EMPTY_CORE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
  'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
  'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"></cp:coreProperties>';
const EMPTY_CUSTOM = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" ' +
  'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>';
const EMPTY_ODF_META = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.3"><office:meta/></office:document-meta>';

const CORE_LABELS = {
  'dc:creator': 'Yazar', 'cp:lastModifiedBy': 'Son değiştiren', 'dc:title': 'Başlık', 'dc:subject': 'Konu',
  'cp:keywords': 'Anahtar kelimeler', 'dc:description': 'Açıklama', 'dcterms:created': 'Oluşturma tarihi',
  'dcterms:modified': 'Değiştirilme tarihi', 'cp:lastPrinted': 'Son yazdırma', 'cp:category': 'Kategori',
};
const APP_FIELDS = ['Company', 'Manager', 'Template', 'HyperlinkBase', 'TotalTime', 'Application', 'AppVersion'];
const APP_LABELS = { Company: 'Şirket', Manager: 'Yönetici', Template: 'Şablon', HyperlinkBase: 'Bağlantı tabanı', TotalTime: 'Toplam düzenleme süresi (dk)', Application: 'Uygulama', AppVersion: 'Uygulama sürümü' };

const isXml = (name) => /\.(xml|rels)$/i.test(name);

function replaceCount(s, re, rep) {
  let n = 0;
  const out = s.replace(re, (...a) => { n++; return typeof rep === 'function' ? rep(...a) : rep; });
  return [out, n];
}

function cleanOoxmlPart(name, xml, report) {
  let s = xml, n;
  // Word: değişiklik izleme ve yorum yazarları, tarihleri, oturum kimlikleri
  [s, n] = replaceCount(s, /\b(w|w15|w16cex|w16du):author="([^"]*)"/g, (m, ns, v) => { report.addFound('Yorum / değişiklik yazarı', v); return `${ns}:author="${ANON}"`; });
  if (n) report.addRemoved('Yorum ve değişiklik izleme yazar adları');
  [s, n] = replaceCount(s, /\s(?:w|w16du):(?:date|dateUtc)="[^"]*"/g, '');
  if (n) report.addRemoved('Yorum ve değişiklik tarihleri');
  [s, n] = replaceCount(s, /\sw:initials="[^"]*"/g, '');
  if (n) report.addRemoved('Yorum baş harfleri');
  [s, n] = replaceCount(s, /\sw:rsid[A-Za-z]*="[^"]*"/g, '');
  [s] = replaceCount(s, /<w:rsids>[\s\S]*?<\/w:rsids>/g, '');
  if (n) report.addRemoved('Düzenleme oturumu kimlikleri (rsid)');
  // Kişi kayıtları (Word people.xml, Excel persons, PowerPoint authors)
  [s, n] = replaceCount(s, /<w15:presenceInfo[^>]*\/>/g, '');
  if (n) report.addRemoved('Hesap bilgileri (e-posta / kullanıcı kimliği)');
  [s, n] = replaceCount(s, /\s(userId|providerId)="[^"]+"/g, (m, k) => ` ${k}=""`);
  if (n) report.addRemoved('Hesap bilgileri (e-posta / kullanıcı kimliği)');
  if (/persons\/person\.xml$|ppt\/authors\.xml$|commentAuthors\.xml$/.test(name)) {
    [s, n] = replaceCount(s, /\s(displayName|name)="([^"]*)"/g, (m, k, v) => { report.addFound('Yorum yazarı', v); return ` ${k}="${ANON}"`; });
    [s] = replaceCount(s, /\sinitials="[^"]*"/g, ' initials="A"');
  }
  // Excel: eski yorum yazarları, dosyanın kaydedildiği tam yol
  if (/xl\/comments\d*\.xml$/.test(name)) {
    [s, n] = replaceCount(s, /<author>([^<]*)<\/author>/g, (m, v) => { report.addFound('Yorum yazarı', v); return `<author>${ANON}</author>`; });
    if (n) report.addRemoved('Yorum yazar adları');
  }
  const abs = /<x15ac:absPath[^>]*url="([^"]*)"/.exec(s);
  if (abs) {
    report.addFound('Dosyanın bilgisayardaki yolu', abs[1]);
    s = s.replace(/<mc:AlternateContent[^>]*>(?:(?!<\/mc:AlternateContent>)[\s\S])*?absPath(?:(?!<\/mc:AlternateContent>)[\s\S])*?<\/mc:AlternateContent>/g, '');
    s = s.replace(/<x15ac:absPath[^>]*\/>/g, '');
    report.addRemoved('Dosyanın kaydedildiği klasör yolu (kullanıcı adı içerebilir)');
  }
  [s, n] = replaceCount(s, /<xr:revisionPtr[^>]*\/>/g, '');
  if (n) report.addRemoved('Revizyon kimliği');
  return s;
}

export function cleanZip(b, opts, report, cleanInner) {
  let files;
  try {
    files = unzipSync(b);
  } catch (e) {
    throw new Error('Arşiv açılamadı (şifreli veya bozuk olabilir)');
  }
  const names = Object.keys(files);
  const isOoxml = names.includes('[Content_Types].xml');
  const mimetype = files.mimetype ? strFromU8(files.mimetype) : '';
  const isOdf = mimetype.startsWith('application/vnd.oasis.opendocument');

  const out = {};
  if (files.mimetype) out.mimetype = [files.mimetype, { level: 0, mtime: FIXED_DATE }];

  for (const name of names) {
    if (name === 'mimetype') continue;
    let data = files[name];
    if (name.endsWith('/')) { out[name] = [data, { mtime: FIXED_DATE }]; continue; }

    if (isOoxml && name === 'docProps/core.xml') {
      const xml = strFromU8(data);
      for (const [tag, label] of Object.entries(CORE_LABELS)) {
        const m = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`).exec(xml);
        if (m) report.addFound(label, m[1]);
      }
      data = strToU8(EMPTY_CORE);
      report.addRemoved('Belge özellikleri (yazar, son değiştiren, tarihler)');
    } else if (isOoxml && name === 'docProps/app.xml') {
      let xml = strFromU8(data);
      for (const f of APP_FIELDS) {
        const re = new RegExp(`<${f}>([^<]*)</${f}>|<${f}\\s*/>`, 'g');
        const m = new RegExp(`<${f}>([^<]*)</${f}>`).exec(xml);
        if (m) report.addFound(APP_LABELS[f], m[1]);
        xml = xml.replace(re, '');
      }
      data = strToU8(xml);
      report.addRemoved('Uygulama bilgileri (şirket, yönetici, şablon, düzenleme süresi)');
    } else if (isOoxml && name === 'docProps/custom.xml') {
      const xml = strFromU8(data);
      const props = [...xml.matchAll(/name="([^"]*)"[^>]*>\s*<vt:[^>]*>([^<]*)</g)];
      for (const p of props) report.addFound(p[1], p[2]);
      data = strToU8(EMPTY_CUSTOM);
      if (props.length) report.addRemoved('Özel belge özellikleri');
    } else if (isOdf && name === 'meta.xml') {
      const xml = strFromU8(data);
      for (const [re, label] of [[/<dc:creator>([^<]*)/, 'Son değiştiren'], [/<meta:initial-creator>([^<]*)/, 'Yazar'], [/<meta:generator>([^<]*)/, 'Uygulama'], [/<meta:creation-date>([^<]*)/, 'Oluşturma tarihi'], [/<dc:date>([^<]*)/, 'Değiştirilme tarihi']]) {
        const m = re.exec(xml);
        if (m) report.addFound(label, m[1]);
      }
      data = strToU8(EMPTY_ODF_META);
      report.addRemoved('Belge özellikleri (yazar, uygulama, tarihler, düzenleme süresi)');
    } else if (isOoxml && isXml(name)) {
      const xml = strFromU8(data);
      const cleaned = cleanOoxmlPart(name, xml, report);
      if (cleaned !== xml) data = strToU8(cleaned);
    } else if (isOdf && (name === 'content.xml' || name === 'styles.xml')) {
      let xml = strFromU8(data);
      let n;
      [xml, n] = replaceCount(xml, /<dc:creator>([^<]*)<\/dc:creator>/g, (m, v) => { report.addFound('Yorum / değişiklik yazarı', v); return `<dc:creator>${ANON}</dc:creator>`; });
      [xml] = replaceCount(xml, /<dc:date>[^<]*<\/dc:date>/g, '<dc:date>1980-01-01T00:00:00</dc:date>');
      if (n) report.addRemoved('Yorum ve değişiklik izleme yazar adları / tarihleri');
      data = strToU8(xml);
    } else if (cleanInner) {
      const inner = cleanInner(data, name);
      if (inner) {
        data = inner.data;
        if (inner.report.removed.length) report.merge(inner.report, 'İçerideki dosya: ');
      }
    }
    out[name] = [data, { mtime: FIXED_DATE }];
  }
  report.addRemoved('Arşiv içi dosya tarihleri ve sistem bilgileri');
  return zipSync(out, { level: 6, mtime: FIXED_DATE });
}
