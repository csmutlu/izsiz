import {
  PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFStream, PDFRawStream, PDFNumber,
} from 'pdf-lib';
import { cleanJpeg } from './jpeg.js';
import { Report, indexOf } from './util.js';

const N = (s) => PDFName.of(s);
const DROP_EVERYWHERE = ['Metadata', 'PieceInfo', 'LastModified'];
const ANNOT_PERSONAL = ['T', 'M', 'CreationDate'];
const SIG_PERSONAL = ['Name', 'M', 'Location', 'Reason', 'ContactInfo', 'Prop_Build'];

function countEof(b) {
  let n = 0, p = 0;
  while ((p = indexOf(b, '%%EOF', p)) !== -1) { n++; p += 5; }
  return n;
}

export async function cleanPdf(b, opts, report) {
  let doc;
  try {
    doc = await PDFDocument.load(b, { updateMetadata: false });
  } catch (e) {
    if (/encrypt/i.test(String(e && e.message))) throw new Error('Şifreli PDF desteklenmiyor. Önce şifreyi kaldırın.');
    throw new Error('PDF okunamadı: ' + (e && e.message));
  }
  const ctx = doc.context;

  // 1) Belge bilgileri (Info sözlüğü)
  const infoRef = ctx.trailerInfo.Info;
  if (infoRef) {
    const fmt = (d) => (d ? d.toLocaleString('tr-TR') : '');
    const safe = (fn) => { try { return fn(); } catch { return undefined; } };
    report.addFound('Başlık', safe(() => doc.getTitle()));
    report.addFound('Yazar', safe(() => doc.getAuthor()));
    report.addFound('Konu', safe(() => doc.getSubject()));
    report.addFound('Anahtar kelimeler', safe(() => doc.getKeywords()));
    report.addFound('Oluşturan uygulama', safe(() => doc.getCreator()));
    report.addFound('PDF üretici', safe(() => doc.getProducer()));
    report.addFound('Oluşturma tarihi', fmt(safe(() => doc.getCreationDate())));
    report.addFound('Değiştirilme tarihi', fmt(safe(() => doc.getModificationDate())));
    if (infoRef instanceof PDFRef) ctx.delete(infoRef);
    ctx.trailerInfo.Info = undefined;
    report.addRemoved('Belge bilgileri (yazar, başlık, program, tarihler)');
  }
  if (ctx.trailerInfo.ID) {
    ctx.trailerInfo.ID = undefined;
    report.addRemoved('Benzersiz belge kimliği (ID)');
  }
  if (countEof(b) > 1) report.addRemoved('Önceki kayıt sürümleri (artımlı kayıt geçmişi)');

  // 2) Tüm nesneleri gez
  let sigTouched = false;
  const visitDict = (dict) => {
    for (const k of DROP_EVERYWHERE) {
      if (dict.has(N(k))) {
        dict.delete(N(k));
        report.addRemoved(k === 'Metadata' ? 'XMP meta verisi' : 'Uygulama özel verileri (PieceInfo)');
      }
    }
    const type = dict.get(N('Type'));
    const subtype = dict.get(N('Subtype'));
    if (subtype instanceof PDFName && subtype !== N('Widget') && subtype !== N('Link') && (type === N('Annot') || dict.has(N('Rect')))) {
      for (const k of ANNOT_PERSONAL) {
        if (dict.has(N(k))) {
          if (k === 'T') {
            const t = dict.get(N('T'));
            try { report.addFound('Yorum yazarı', t.decodeText ? t.decodeText() : String(t)); } catch { /* yok */ }
          }
          dict.delete(N(k));
          report.addRemoved('Yorum / not yazar adları ve tarihleri');
        }
      }
    }
    if (type === N('Sig') || (dict.has(N('ByteRange')) && dict.has(N('Contents')))) {
      for (const k of SIG_PERSONAL) {
        if (dict.has(N(k))) {
          if (k === 'Name') {
            const v = dict.get(N('Name'));
            try { report.addFound('İmzalayan', v.decodeText ? v.decodeText() : String(v)); } catch { /* yok */ }
          }
          dict.delete(N(k));
          sigTouched = true;
        }
      }
    }
    if (dict.has(N('Params')) && type === N('EmbeddedFile')) {
      dict.delete(N('Params'));
      report.addRemoved('Ekli dosya tarihleri');
    }
    for (const [, v] of dict.entries()) visitValue(v);
  };
  const visitValue = (v) => {
    if (v instanceof PDFDict) visitDict(v);
    else if (v instanceof PDFArray) for (let i = 0; i < v.size(); i++) visitValue(v.get(i));
  };

  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFStream) {
      visitDict(obj.dict);
      const filter = obj.dict.get(N('Filter'));
      const isDct = filter === N('DCTDecode') ||
        (filter instanceof PDFArray && filter.size() === 1 && filter.get(0) === N('DCTDecode'));
      if (isDct && obj instanceof PDFRawStream) {
        try {
          const sub = new Report();
          const cleaned = cleanJpeg(obj.contents, { keepOrientation: false, keepColorProfile: false }, sub);
          if (sub.removed.length) {
            obj.dict.set(N('Length'), PDFNumber.of(cleaned.length));
            ctx.assign(ref, PDFRawStream.of(obj.dict, cleaned));
            report.merge(sub, 'Gömülü fotoğraf: ');
          }
        } catch { /* görüntü olduğu gibi bırakılır */ }
      }
    } else {
      visitValue(obj);
    }
  }
  if (sigTouched) {
    report.addRemoved('Dijital imza bilgileri (isim, yer, sebep)');
    report.warn('Belgedeki dijital imza artık geçersiz olacaktır.');
  }

  // 3) Artık hiçbir yerden başvurulmayan nesneleri (eski XMP, eski Info) sil
  const reachable = new Set();
  const stack = [ctx.trailerInfo.Root];
  if (ctx.trailerInfo.Encrypt) stack.push(ctx.trailerInfo.Encrypt);
  while (stack.length) {
    const v = stack.pop();
    if (!v) continue;
    if (v instanceof PDFRef) {
      if (reachable.has(v)) continue;
      reachable.add(v);
      stack.push(ctx.lookup(v));
    } else if (v instanceof PDFDict) {
      for (const [, x] of v.entries()) stack.push(x);
    } else if (v instanceof PDFArray) {
      for (let i = 0; i < v.size(); i++) stack.push(v.get(i));
    } else if (v instanceof PDFStream) {
      stack.push(v.dict);
    }
  }
  let orphans = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) {
    if (!reachable.has(ref)) { ctx.delete(ref); orphans++; }
  }
  if (orphans) report.addRemoved('Kullanılmayan artık nesneler');

  return doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
}
