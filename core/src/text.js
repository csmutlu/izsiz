// Metinlerdeki görünmez karakterler. Sızdırılan metnin kime ait olduğunu
// bulmak için kopyalanan yazılara gizlice eklenebilirler.

const isEmoji = (cp) => cp >= 0x1f000 || (cp >= 0x2600 && cp <= 0x27bf) || cp === 0xfe0f || (cp >= 0x2190 && cp <= 0x21ff) || (cp >= 0x2b00 && cp <= 0x2bff) || (cp >= 0x2300 && cp <= 0x23ff);

function isInvisible(cp) {
  return (
    (cp >= 0x200b && cp <= 0x200f) || // sıfır genişlikli boşluk, ZWNJ, ZWJ, yön işaretleri
    (cp >= 0x202a && cp <= 0x202e) || // yön gömme / geçersiz kılma
    (cp >= 0x2060 && cp <= 0x2064) || // kelime birleştirici, görünmez operatörler
    (cp >= 0x2066 && cp <= 0x206f) || // yön izolasyonu, kullanımdan kalkmış biçim karakterleri
    cp === 0xfeff || cp === 0x00ad || cp === 0x180e || cp === 0x034f || cp === 0x061c ||
    (cp >= 0xfff9 && cp <= 0xfffb) ||
    (cp >= 0xe0000 && cp <= 0xe007f) || // Unicode etiket karakterleri (gizli metin taşıyabilir)
    (cp >= 0xe0100 && cp <= 0xe01ef) || // ek varyasyon seçicileri (gizli veri taşıyabilir)
    (cp >= 0x1d173 && cp <= 0x1d17a)
  );
}

const ODD_SPACE = (cp) => cp === 0x00a0 || (cp >= 0x2000 && cp <= 0x200a) || cp === 0x202f || cp === 0x205f || cp === 0x3000;

// strict: alışılmadık boşlukları da normal boşluğa çevirir (parmak izi için kullanılabilirler).
export function cleanInvisible(text, { strict = false, keepLeadingBom = false } = {}) {
  const cps = Array.from(text, (c) => c.codePointAt(0));
  const out = [];
  let removed = 0, spaces = 0;
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];
    if (cp === 0xfeff && i === 0 && keepLeadingBom) { out.push(cp); continue; }
    if (cp === 0x200d && i > 0 && i < cps.length - 1 && isEmoji(cps[i - 1]) && isEmoji(cps[i + 1])) {
      out.push(cp); // emoji birleştirici (👨‍👩‍👧) kalmalı
      continue;
    }
    if (isInvisible(cp)) { removed++; continue; }
    if (strict && ODD_SPACE(cp)) { out.push(0x20); spaces++; continue; }
    out.push(cp);
  }
  let s = '';
  for (let i = 0; i < out.length; i += 4096) s += String.fromCodePoint(...out.slice(i, i + 4096));
  return { text: s, removed, spaces };
}

// Geçerli UTF-8 mi? (Değilse metin dosyası olduğu gibi bırakılır.)
export function isUtf8(b) {
  let i = 0;
  while (i < b.length) {
    const c = b[i];
    if (c < 0x80) { i++; continue; }
    let n = 0;
    if ((c & 0xe0) === 0xc0 && c >= 0xc2) n = 1;
    else if ((c & 0xf0) === 0xe0) n = 2;
    else if ((c & 0xf8) === 0xf0 && c <= 0xf4) n = 3;
    else return false;
    if (i + n >= b.length) return false;
    for (let k = 1; k <= n; k++) if ((b[i + k] & 0xc0) !== 0x80) return false;
    i += n + 1;
  }
  return true;
}
