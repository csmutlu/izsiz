// Çekirdek testleri: içinde "SECRET" geçen meta veriler üretilir, temizlenir,
// çıktıda hiçbir iz kalmadığı ve dosyanın hâlâ açılabildiği kontrol edilir.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, PDFName, PDFString, PDFHexString } from 'pdf-lib';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { cleanFile, cleanText, cleanUrl, detectType, localize, localizeResult, localizeTextResult } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'izsiz-'));
let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.log('  ✗ ' + msg); } };
const latin1 = (b) => { let s = ''; for (const c of b) s += String.fromCharCode(c); return s; };
const enc = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));

execFileSync('python3', [join(here, 'make_fixtures.py'), dir]);
const read = (n) => new Uint8Array(readFileSync(join(dir, n)));
const photo = read('photo.jpg');

// ---- sentetik dosyalar
async function makePdf() {
  const doc = await PDFDocument.create();
  doc.setAuthor('SECRET_AUTHOR'); doc.setCreator('SECRET_CREATOR'); doc.setProducer('SECRET_PRODUCER');
  doc.setTitle('SECRET_TITLE');
  const page = doc.addPage([300, 300]);
  const img = await doc.embedJpg(photo);
  page.drawImage(img, { x: 10, y: 10, width: 64, height: 48 });
  page.drawText('Merhaba', { x: 20, y: 200 });
  const xmp = doc.context.stream('<x:xmpmeta><dc:creator>SECRET_XMP</dc:creator></x:xmpmeta>', { Type: 'Metadata', Subtype: 'XML' });
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(xmp));
  const annot = doc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [0, 0, 10, 10], T: PDFString.of('SECRET_ANNOT_AUTHOR'), Contents: PDFString.of('not') });
  page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(annot)]));
  doc.context.trailerInfo.ID = doc.context.obj([PDFHexString.of('5345435245545f4944'), PDFHexString.of('5345435245545f4944')]);
  const bytes = await doc.save();
  // artımlı kayıt: eski sürüm sonda kalsın
  return new Uint8Array([...bytes, ...enc('\n% SECRET_OLD_REVISION\n%%EOF\n')]);
}

function makeDocx() {
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'docProps/core.xml': strToU8('<cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:creator>SECRET_AUTHOR</dc:creator><cp:lastModifiedBy>SECRET_EDITOR</cp:lastModifiedBy></cp:coreProperties>'),
    'docProps/app.xml': strToU8('<Properties><Company>SECRET_COMPANY</Company><Pages>1</Pages><TotalTime>42</TotalTime></Properties>'),
    'docProps/custom.xml': strToU8('<Properties><property name="Owner"><vt:lpwstr>SECRET_CUSTOM</vt:lpwstr></property></Properties>'),
    'word/document.xml': strToU8('<w:document><w:ins w:id="1" w:author="SECRET_TRACK" w:date="2024-01-01T00:00:00Z"><w:r w:rsidR="00AB12CD"><w:t>Merhaba</w:t></w:r></w:ins></w:document>'),
    'word/people.xml': strToU8('<w15:people><w15:person w15:author="SECRET_PERSON"><w15:presenceInfo w15:providerId="AD" w15:userId="SECRET@mail.com"/></w15:person></w15:people>'),
    'word/media/image1.jpg': photo,
  });
}

function makeXlsx() {
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'xl/workbook.xml': strToU8('<workbook><mc:AlternateContent xmlns:mc="m"><mc:Choice Requires="x15"><x15ac:absPath url="C:\\Users\\SECRET_USER\\Desktop\\" xmlns:x15ac="z"/></mc:Choice></mc:AlternateContent><sheets/></workbook>'),
    'xl/comments1.xml': strToU8('<comments><authors><author>SECRET_XL_AUTHOR</author></authors></comments>'),
  });
}

function box(type, ...parts) {
  const body = parts.flatMap((p) => [...(typeof p === 'string' ? enc(p) : p)]);
  const n = body.length + 8;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...enc(type), ...body];
}
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function makeMp4() {
  const mvhd = box('mvhd', [0, 0, 0, 0, ...u32(0xdeadbeef), ...u32(0xdeadbeef), ...u32(600), ...u32(0), ...new Array(80).fill(0)]);
  const udta = box('udta', box('\u00a9xyz', [0, 18, 0x15, 0xc7], '+41.0083+028.9784/'), box('\u00a9too', [0, 13, 0, 0], 'SECRET_ENCODER'));
  const meta = box('meta', [0, 0, 0, 0], 'com.apple.quicktime.model SECRET_IPHONE');
  const moov = box('moov', mvhd, udta, meta);
  return new Uint8Array([...box('ftyp', 'qt  ', u32(0), 'qt  '), ...moov, ...box('mdat', new Array(32).fill(7))]);
}

function makeHeic() {
  // EXIF verisini fotoğrafın APP1 segmentinden al
  const app1 = latin1(photo).indexOf('Exif\0\0');
  const len = (photo[app1 - 2] << 8) | photo[app1 - 1];
  const tiff = photo.subarray(app1 + 6, app1 - 2 + len);
  const exifItem = [0, 0, 0, 0, ...tiff];
  const ftyp = box('ftyp', 'heic', u32(0), 'mif1heic');
  const build = (off) => box('meta', [0, 0, 0, 0],
    box('hdlr', [0, 0, 0, 0], u32(0), 'pict', new Array(13).fill(0)),
    box('iinf', [0, 0, 0, 0], [0, 1], box('infe', [2, 0, 0, 0], [0, 1], [0, 0], 'Exif', [0])),
    box('iloc', [0, 0, 0, 0], [0x44, 0x00], [0, 1], [0, 1], [0, 0], [0, 1], u32(off), u32(exifItem.length)));
  const metaLen = build(0).length;
  const off = ftyp.length + metaLen + 8;
  return new Uint8Array([...ftyp, ...build(off), ...box('mdat', exifItem)]);
}

function makeMp3() {
  const frame = (id, text) => { const d = [0, ...enc(text)]; return [...enc(id), ...u32(d.length), 0, 0, ...d]; };
  const frames = [...frame('TPE1', 'SECRET_ARTIST'), ...frame('TSSE', 'SECRET_SOFT')];
  const sz = frames.length;
  const id3 = [...enc('ID3'), 4, 0, 0, (sz >> 21) & 127, (sz >> 14) & 127, (sz >> 7) & 127, sz & 127, ...frames];
  const audio = new Array(400).fill(0).map((_, i) => (i % 4 === 0 ? 0xff : i % 4 === 1 ? 0xfb : 0x90));
  const v1 = [...enc('TAG'), ...enc('SECRET_V1'.padEnd(125, '\0'))];
  return new Uint8Array([...id3, ...audio, ...v1]);
}

const svg = enc('<?xml version="1.0"?><!-- Created with SECRET_TOOL --><svg xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="s" xmlns:inkscape="i" sodipodi:docname="SECRET_NAME.svg" inkscape:export-filename="/Users/SECRET_USER/a.png"><metadata><rdf:RDF><cc:Work><dc:creator><cc:Agent><dc:title>SECRET_SVG_AUTHOR</dc:title></cc:Agent></dc:creator></cc:Work></rdf:RDF></metadata><sodipodi:namedview id="n" inkscape:window-width="SECRET"/><rect width="10" height="10"/></svg>');
const txt = strToU8('Merhaba\u200b dünya\u2063 gi\u200dzli 👨‍👩‍👧 ' + String.fromCodePoint(0xe0053, 0xe0045));

const cases = [
  ['photo.jpg', photo, 'jpeg'], ['image.png', read('image.png'), 'png'], ['image.webp', read('image.webp'), 'webp'],
  ['anim.gif', read('anim.gif'), 'gif'], ['belge.pdf', await makePdf(), 'pdf'], ['belge.docx', makeDocx(), 'ooxml'],
  ['tablo.xlsx', makeXlsx(), 'ooxml'], ['video.mov', makeMp4(), 'mp4'], ['foto.heic', makeHeic(), 'heif'],
  ['sarki.mp3', makeMp3(), 'mp3'], ['cizim.svg', svg, 'svg'], ['not.txt', txt, 'text'],
];

for (const [name, bytes, type] of cases) {
  console.log(`• ${name}`);
  ok(latin1(bytes).includes('SECRET') || type === 'ooxml' || type === 'text' || type === 'pdf', 'fixture should contain SECRET');
  ok(detectType(bytes, name) === type, `detectType -> ${detectType(bytes, name)}`);
  const r = await cleanFile(bytes, name);
  ok(r.ok, 'clean failed: ' + r.error);
  if (!r.ok) continue;
  console.log('   bulunan:', r.found.map((f) => `${f.label}=${f.value}`).join(' | '));
  const en = localizeResult(r, 'en');
  for (const s of [...en.found.map((f) => f.label), ...en.removed, ...en.warnings]) ok(!/[ğüşıöçİĞÜŞÖÇ]/.test(s), 'missing English text: ' + s);
  let haystack = latin1(r.data);
  if (type === 'ooxml') haystack = Object.values(unzipSync(r.data)).map(latin1).join('\n');
  if (type === 'text') haystack = strFromU8(r.data);
  if (type === 'pdf') {
    const d = await PDFDocument.load(r.data, { updateMetadata: false });
    ok(d.getPageCount() === 1, 'pdf page count');
    // akışlar sıkıştırılmış olabilir: sıkıştırmasız kaydedip ara
    haystack += latin1(await d.save({ useObjectStreams: false }));
    ok(!haystack.includes('/Info'), 'pdf still has /Info');
    ok(!/\/ID\s*\[/.test(latin1(r.data)), 'pdf still has /ID');
  }
  const leftover = haystack.match(/SECRET[\w@.]*/g);
  ok(!leftover, 'leftover: ' + (leftover || []).join(','));
  if (type === 'text') {
    ok(haystack.includes('👨‍👩‍👧'), 'emoji ZWJ sequence must be preserved');
    ok(!/[\u200b\u2063]/.test(haystack), 'invisible chars remain');
  }
  if (['jpeg', 'png', 'webp', 'gif'].includes(type)) {
    const f = join(dir, 'out_' + name);
    writeFileSync(f, r.data);
    const check = execFileSync('python3', ['-c', `import sys;from PIL import Image;i=Image.open(sys.argv[1]);i.load();e=i.getexif();print(i.size, dict(e), sorted(k for k in i.info if k not in ('dpi','transparency','duration','loop','background','version')))`, f]).toString().trim();
    console.log('   PIL:', check);
    ok(check.startsWith('(64, 48)') || type === 'gif', 'image should decode with same size');
    if (type === 'jpeg') ok(check.includes('{274: 6}'), 'orientation should be kept');
  }
  const again = await cleanFile(r.data, name);
  ok(again.ok && again.found.length === 0, 'second pass still found: ' + JSON.stringify(again.found));
}

// ---- linkler
console.log('• linkler');
const links = [
  ['https://x.com/elonmusk/status/1790000000000000000?s=19&t=AbCdEf123', 'https://x.com/elonmusk/status/1790000000000000000'],
  ['https://twitter.com/user/status/123?s=46&t=xyz', 'https://twitter.com/user/status/123'],
  ['https://mobile.twitter.com/user/status/123?ref_src=twsrc', 'https://twitter.com/user/status/123'],
  ['https://www.instagram.com/reel/C8abcDEF/?igsh=MWQ1ZGUxMzBkMA==', 'https://www.instagram.com/reel/C8abcDEF/'],
  ['https://www.instagram.com/p/C8abc/?utm_source=ig_web_copy_link&igshid=MzRlODBiNWFlZA==', 'https://www.instagram.com/p/C8abc/'],
  ['https://www.tiktok.com/@kisi/video/7300000000000000000?is_from_webapp=1&sender_device=pc&_r=1&_t=8k', 'https://www.tiktok.com/@kisi/video/7300000000000000000'],
  ['https://youtu.be/dQw4w9WgXcQ?si=Zk3abc&t=42', 'https://youtu.be/dQw4w9WgXcQ?t=42'],
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&pp=ygU&si=abc&feature=shared', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
  ['https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=a1b2c3&context=x', 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'],
  ['https://www.threads.net/@kisi/post/C8xyz?xmt=AQGz', 'https://www.threads.net/@kisi/post/C8xyz'],
  ['https://www.reddit.com/r/turkey/comments/abc/baslik/?share_id=XYZ&utm_medium=android_app', 'https://www.reddit.com/r/turkey/comments/abc/baslik/'],
  ['https://www.facebook.com/watch?v=12345&mibextid=abc&rdid=xyz', 'https://www.facebook.com/watch?v=12345'],
  ['https://www.amazon.com.tr/Urun-Adi/dp/B0ABCDEFGH/ref=sr_1_1?crid=X&keywords=y', 'https://www.amazon.com.tr/dp/B0ABCDEFGH'],
  ['https://l.facebook.com/l.php?u=https%3A%2F%2Fornek.com%2Fhaber%3Futm_source%3Dfb%26id%3D5&h=AT0', 'https://ornek.com/haber?id=5'],
  ['https://ornek.com/sayfa?id=7&utm_source=x&fbclid=IwAR0', 'https://ornek.com/sayfa?id=7'],
  ['https://www.linkedin.com/posts/kisi_activity-123?utm_source=share&rcm=ACoAA', 'https://www.linkedin.com/posts/kisi_activity-123'],
];
for (const [inp, want] of links) {
  const r = cleanUrl(inp);
  ok(r.cleaned === want, `${inp}\n      -> ${r.cleaned}\n      want ${want}`);
}
const t = cleanText('Şuna bak: https://x.com/a/status/1?s=19&t=Q (çok iyi)\u200b https://vm.tiktok.com/ZMabc/');
ok(t.text === 'Şuna bak: https://x.com/a/status/1 (çok iyi) https://vm.tiktok.com/ZMabc/', 'cleanText: ' + t.text);
ok(t.links[1].warnings.length === 1, 'short link warning');
ok(t.invisibleRemoved === 1, 'invisible count');

// İngilizce çeviri
ok(localize('APP13 meta verisi', 'en') === 'APP13 metadata', 'localize pattern');
ok(localize('GPS konumu', 'tr') === 'GPS konumu', 'localize tr passthrough');
ok(/^TikTok short link:/.test(localizeTextResult(t, 'en').links[1].warnings[0]), 'localize short link warning');

console.log(failed ? `\n${failed} HATA` : '\nTüm testler geçti ✓');
process.exit(failed ? 1 : 0);
