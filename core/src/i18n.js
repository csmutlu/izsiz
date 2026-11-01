// Rapor metinleri kaynakta Türkçe yazılır; bu dosya İngilizce karşılıklarını tutar.
// Arayüzler sonucu göstermeden önce localizeResult / localizeTextResult ile çevirir.

export const LANGUAGES = ['tr', 'en'];

export function pickLanguage(locale) {
  return /^tr\b/i.test(String(locale || '')) ? 'tr' : 'en';
}

const EN = {
  // bulunan bilgiler
  'Açıklama': 'Description',
  'Kamera markası': 'Camera make',
  'Kamera modeli': 'Camera model',
  'Yazılım': 'Software',
  'Değiştirilme tarihi': 'Modified',
  'Sanatçı / Yazar': 'Artist / Author',
  'Telif hakkı': 'Copyright',
  'Çekim tarihi': 'Date taken',
  'Benzersiz görüntü kimliği': 'Unique image ID',
  'Kamera sahibi': 'Camera owner',
  'Cihaz seri numarası': 'Body serial number',
  'Lens markası': 'Lens make',
  'Lens modeli': 'Lens model',
  'GPS konumu': 'GPS location',
  'var': 'present',
  'Görünmez karakter': 'Invisible characters',
  'Metin': 'Text',
  'Değiştirilme zamanı': 'Modification time',
  'Yorum': 'Comment',
  'Yazar': 'Author',
  'Dosya adı / yolu': 'File name / path',
  'Cihaz markası': 'Device make',
  'Cihaz modeli': 'Device model',
  'Kodlayan yazılım': 'Encoder',
  'Sanatçı': 'Artist',
  'Başlık': 'Title',
  'Kodlayan': 'Encoded by',
  'Yorum / değişiklik yazarı': 'Comment / revision author',
  'Yorum yazarı': 'Comment author',
  'Dosyanın bilgisayardaki yolu': 'File path on disk',
  'Son değiştiren': 'Last modified by',
  'Konu': 'Subject',
  'Anahtar kelimeler': 'Keywords',
  'Oluşturma tarihi': 'Created',
  'Son yazdırma': 'Last printed',
  'Kategori': 'Category',
  'Şirket': 'Company',
  'Yönetici': 'Manager',
  'Şablon': 'Template',
  'Bağlantı tabanı': 'Hyperlink base',
  'Toplam düzenleme süresi (dk)': 'Total editing time (min)',
  'Uygulama': 'Application',
  'Uygulama sürümü': 'App version',
  'Oluşturan uygulama': 'Creator',
  'PDF üretici': 'PDF producer',
  'İmzalayan': 'Signer',

  // silinenler
  'Görünmez izleme karakterleri': 'Invisible tracking characters',
  'Alışılmadık boşluk karakterleri': 'Unusual space characters',
  'Dosya sistemi bilgileri (oluşturma tarihi, indirme kaynağı, etiketler)': 'File system info (creation date, download source, tags)',
  'Görüntü sonrası gizli ek veri (ek görüntüler, derinlik haritası vb.)': 'Hidden data after the image (extra images, depth map, etc.)',
  'JPEG yorumu': 'JPEG comment',
  'JFIF küçük resmi': 'JFIF thumbnail',
  'JFIF uzantısı / küçük resim': 'JFIF extension / thumbnail',
  'EXIF (kamera, tarih, GPS konumu, seri no, küçük resim)': 'EXIF (camera, date, GPS location, serial number, thumbnail)',
  'EXIF (kamera, tarih, GPS konumu, seri no)': 'EXIF (camera, date, GPS location, serial number)',
  'EXIF (kamera, tarih, GPS konumu)': 'EXIF (camera, date, GPS location)',
  'XMP meta verisi': 'XMP metadata',
  'ICC renk profili': 'ICC color profile',
  'Çoklu görüntü (MPF) bilgisi': 'Multi-picture (MPF) data',
  'IPTC / Photoshop bilgisi': 'IPTC / Photoshop data',
  'Metin bilgileri (yazar, açıklama, yazılım vb.)': 'Text chunks (author, description, software, etc.)',
  'Zaman damgası': 'Timestamp',
  'İçerik kimlik bilgisi (C2PA)': 'Content credentials (C2PA)',
  'Dosya sonrası gizli ek veri': 'Hidden data after the end of the file',
  'GIF yorumu': 'GIF comment',
  'Bilinmeyen GIF uzantısı': 'Unknown GIF extension',
  'SVG meta verisi (yazar, lisans, RDF)': 'SVG metadata (author, license, RDF)',
  'Yorumlar (oluşturan program bilgisi)': 'Comments (generator info)',
  'Inkscape görünüm ayarları': 'Inkscape view settings',
  'Belge adı ve dışa aktarma yolu': 'Document name and export path',
  'Video meta verisi (GPS konumu, cihaz, yazılım, tarih)': 'Video metadata (GPS location, device, software, date)',
  'Oluşturma / değiştirme tarihleri': 'Creation / modification dates',
  'ID3v2 etiketleri (sanatçı, albüm, kapak, yorum, yazılım)': 'ID3v2 tags (artist, album, cover, comment, software)',
  'ID3v1 etiketi': 'ID3v1 tag',
  'APE etiketleri': 'APE tags',
  'Şarkı sözü etiketi': 'Lyrics tag',
  'Yorum ve değişiklik izleme yazar adları': 'Comment and tracked-change author names',
  'Yorum ve değişiklik tarihleri': 'Comment and tracked-change dates',
  'Yorum baş harfleri': 'Comment initials',
  'Düzenleme oturumu kimlikleri (rsid)': 'Editing session IDs (rsid)',
  'Hesap bilgileri (e-posta / kullanıcı kimliği)': 'Account info (email / user ID)',
  'Yorum yazar adları': 'Comment author names',
  'Dosyanın kaydedildiği klasör yolu (kullanıcı adı içerebilir)': 'Folder the file was saved in (may contain your username)',
  'Revizyon kimliği': 'Revision ID',
  'Belge özellikleri (yazar, son değiştiren, tarihler)': 'Document properties (author, last modified by, dates)',
  'Uygulama bilgileri (şirket, yönetici, şablon, düzenleme süresi)': 'Application info (company, manager, template, editing time)',
  'Özel belge özellikleri': 'Custom document properties',
  'Belge özellikleri (yazar, uygulama, tarihler, düzenleme süresi)': 'Document properties (author, application, dates, editing time)',
  'Yorum ve değişiklik izleme yazar adları / tarihleri': 'Comment and tracked-change author names / dates',
  'Arşiv içi dosya tarihleri ve sistem bilgileri': 'File dates and system info inside the archive',
  'Belge bilgileri (yazar, başlık, program, tarihler)': 'Document info (author, title, program, dates)',
  'Benzersiz belge kimliği (ID)': 'Unique document ID',
  'Önceki kayıt sürümleri (artımlı kayıt geçmişi)': 'Earlier saved versions (incremental save history)',
  'Uygulama özel verileri (PieceInfo)': 'Application private data (PieceInfo)',
  'Yorum / not yazar adları ve tarihleri': 'Comment / note author names and dates',
  'Ekli dosya tarihleri': 'Attachment dates',
  'Dijital imza bilgileri (isim, yer, sebep)': 'Digital signature info (name, location, reason)',
  'Kullanılmayan artık nesneler': 'Unused leftover objects',
  'Görüntü sıfırdan yeniden çizildi (sıkı mod)': 'Image redrawn from scratch (strict mode)',
  'ürün adı / yönlendirme yolu': 'product name / referral path',

  // uyarılar ve hatalar
  'Metin UTF-8 değil; içerik değiştirilmeden yeni dosyaya yazıldı.': 'The text is not UTF-8, so it was copied to the new file unchanged.',
  'Arşiv içindeki PDF ve Office dosyaları ayrıca temizlenmez; onları ayrı ayrı temizleyin.': 'PDF and Office files inside the archive are not cleaned. Clean them separately.',
  'JPEG beklenmedik şekilde bitti; dosya eksik olabilir.': 'The JPEG ends unexpectedly; the file may be incomplete.',
  'Belgedeki dijital imza artık geçersiz olacaktır.': 'The digital signature in this document will no longer be valid.',
  'Bu dosya türü desteklenmiyor.': 'This file type is not supported.',
  'Şifreli PDF desteklenmiyor. Önce şifreyi kaldırın.': 'Encrypted PDFs are not supported. Remove the password first.',
  'Geçersiz JPEG dosyası': 'Not a valid JPEG file',
  'Bozuk JPEG yapısı': 'Corrupt JPEG structure',
  'Bozuk JPEG segmenti': 'Corrupt JPEG segment',
  'Arşiv açılamadı (şifreli veya bozuk olabilir)': 'Could not open the archive (it may be encrypted or corrupt)',
  'Bozuk PNG parçası': 'Corrupt PNG chunk',
  'Bozuk WebP parçası': 'Corrupt WebP chunk',
  'Bozuk GIF yapısı': 'Corrupt GIF structure',
  'HEIF meta kutusu bulunamadı': 'HEIF meta box not found',
  'HEIF iloc kutusu bulunamadı': 'HEIF iloc box not found',
};

const EN_PATTERNS = [
  [/^APP(\d+) meta verisi$/, 'APP$1 metadata'],
  [/^Ek PNG parçası \((.+)\)$/, 'Extra PNG chunk ($1)'],
  [/^Ek WebP parçası \((.+)\)$/, 'Extra WebP chunk ($1)'],
  [/^Uygulama verisi \((.+)\)$/, 'Application data ($1)'],
  [/^(\d+) adet$/, '$1'],
  [/^PDF okunamadı: (.*)$/s, 'Could not read the PDF: $1'],
  [/^(.+) kısa paylaşım linki: .*$/s, '$1 short link: the code in it can point to the account that shared it, and it can’t be expanded offline. Open it in a browser, then clean the full address from the address bar.'],
];

const EN_PREFIXES = [['Gömülü fotoğraf: ', 'Embedded image: '], ['İçerideki dosya: ', 'Inner file: ']];

export function localize(text, lang) {
  if (lang !== 'en' || typeof text !== 'string') return text;
  for (const [tr, en] of EN_PREFIXES) if (text.startsWith(tr)) return en + localize(text.slice(tr.length), lang);
  if (Object.prototype.hasOwnProperty.call(EN, text)) return EN[text];
  for (const [re, rep] of EN_PATTERNS) if (re.test(text)) return text.replace(re, rep);
  return text;
}

export function localizeResult(r, lang) {
  if (lang !== 'en' || !r) return r;
  return {
    ...r,
    found: (r.found || []).map((f) => ({ label: localize(f.label, lang), value: localize(f.value, lang) })),
    removed: (r.removed || []).map((s) => localize(s, lang)),
    warnings: (r.warnings || []).map((s) => localize(s, lang)),
    error: r.error && localize(r.error, lang),
  };
}

export function localizeTextResult(r, lang) {
  if (lang !== 'en' || !r) return r;
  return {
    ...r,
    links: r.links.map((l) => ({
      ...l,
      removed: l.removed.map((s) => localize(s, lang)),
      warnings: l.warnings.map((s) => localize(s, lang)),
    })),
  };
}

export const CLEAN_SUFFIX = { tr: '_temiz', en: '_clean' };
