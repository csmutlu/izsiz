# İzsiz

[English](README.md)

İzsiz, dosyalardaki meta verileri ve paylaştığın linklerdeki takip kodlarını siler. İnternete hiç bağlanmadan çalışır: macOS, Windows ve Android/iOS.

## Neden

Fotoğraflar çekildikleri yerin GPS koordinatını ve kameranın seri numarasını taşır. Word dosyası yazarın adını, şirketi, bazen de kaydedildiği klasörün yolunu tutar; bu yolda genelde kullanıcı adın da vardır. X'ten ya da Instagram'dan kopyalanan linklerin sonundaki `?s=19&t=...` ve `?igsh=...` gibi kodlar linki senin hesabına bağlar.

Bunları temizleyen araçların çoğu web sitesi, yani gizli tutmak istediğin dosyayı önce bir sunucuya yüklemen gerekiyor. İzsiz her şeyi cihazında yapar. Masaüstü uygulaması tüm ağ isteklerini engeller, Android sürümü internet izni bile istemez.

## Neler silinir

| Tür | Silinenler |
|---|---|
| JPG, PNG, WebP, GIF | EXIF (GPS, kamera marka/model, seri no, tarih, yazılım), XMP, IPTC, yorumlar, küçük resimler, görüntü sonuna gizlenmiş veriler |
| HEIC / AVIF | EXIF ve XMP |
| PDF | Yazar, başlık, oluşturan program, tarihler, XMP, belge kimliği, eski kayıt sürümleri, yorum yazarları, imza bilgileri, içteki fotoğrafların EXIF'i |
| DOCX / XLSX / PPTX | Yazar, son değiştiren, şirket, yönetici, düzenleme süresi, özel özellikler, değişiklik izleme ve yorum yazarları, hesap kimlikleri, dosyanın kaydedildiği klasör yolu, içteki fotoğrafların EXIF'i |
| ODT / ODS / ODP | Yazar, uygulama, tarihler, yorum yazarları |
| MP4 / MOV | GPS, cihaz modeli, yazılım, oluşturma tarihleri |
| MP3 | ID3v1/v2 ve APE etiketleri |
| SVG | Meta veri, yorumlar, Inkscape belge adı ve dışa aktarma yolu |
| TXT, CSV, MD... | Kopyalanan metni izlemek için kullanılabilen görünmez karakterler |
| ZIP | İçteki fotoğraf ve videolar temizlenir, dosya tarihleri sıfırlanır |

Orijinal dosyaya dokunulmaz. Temiz kopya `ad_temiz.uzantı` adıyla yepyeni bir dosya olarak kaydedilir. Bu yüzden oluşturma tarihi, "nereden indirildi" bilgisi ve etiketler gibi dosya sistemi bilgileri de taşınmaz.

Fotoğrafın yön bilgisi varsayılan olarak korunur, böylece fotoğraf yan dönmez. Ayarlardan kapatabilirsin.

### Linkler

X/Twitter, Instagram, TikTok, YouTube (`si`), Spotify, Threads, Reddit, Facebook, LinkedIn ve diğerlerinde takip kodları silinir. Geri kalan her yerde `utm_*`, `fbclid`, `gclid` gibi bilinen parametreler gider. Amazon linkleri `/dp/KOD` haline gelir. Google ve Facebook yönlendirme linkleri açılır.

```
https://x.com/kullanici/status/1234567890?s=19&t=AbCdEf  ->  https://x.com/kullanici/status/1234567890
https://www.instagram.com/reel/C8xyz/?igsh=MWQ1ZGUx      ->  https://www.instagram.com/reel/C8xyz/
```

`vm.tiktok.com` ve `t.co` gibi kısa linkler internete çıkmadan açılamaz. İzsiz bunları sessizce geçirmez, uyarı verir.

## İndir

Son sürüm [Releases](https://github.com/csmutlu/izsiz/releases) sayfasında:

- **macOS (Apple Silicon):** `Izsiz-<sürüm>-mac-arm64.dmg`
- **Windows 10/11 (x64):** `Izsiz-Setup-<sürüm>.exe`. Kurulum istemiyorsan `Izsiz-Portable-<sürüm>.exe`.
- **Android:** `Izsiz-<sürüm>-android.apk`

Paketler ücretli sertifikayla imzalı olmadığı için ilk açılışta bir adım daha gerekiyor:

- **macOS:** Uygulamaya sağ tık → Aç → Aç.
- **Windows:** "Windows bilgisayarınızı korudu" → Ek bilgi → Yine de çalıştır.
- **Android:** Sorulduğunda tarayıcıdan veya dosya yöneticisinden yüklemeye izin ver.

## Özellikler

**Masaüstü**
- Dosya veya klasörleri sürükleyip bırak.
- **Pano izleme:** Kopyaladığın her link anında temizlenir. Pencereyi kapatsan da tepside çalışmaya devam eder. macOS ilk seferde diğer uygulamalardan yapıştırma izni sorar.
- **Sağ tık menüsü:** Finder'da (Hızlı Eylemler) ve Windows Gezgini'nde ("Diğer seçenekleri göster") "İzsiz ile temizle".
- **Sıkı mod:** JPG/PNG/WebP görüntüler ham piksellerden yeniden çizilir. Böylece kodlamaya gizlenmiş izler de gider.

**Telefon**
- Fotoğraf, video veya dosya seç.
- **Paylaş menüsü:** Instagram/X/TikTok'ta bir gönderiyi İzsiz'e paylaş, temiz link panoya kopyalanır. Galeriden bir fotoğraf paylaşırsan temiz kopyası çıkar.
- Galeriye kaydet ya da temiz dosyayı paylaş.

İki uygulama da Türkçe ve İngilizce. Varsayılan olarak sistem dilini kullanır, ayarlardan değiştirilebilir.

## Klasörler

```
core/     temizleme motoru; saf JavaScript, iki uygulama da bunu kullanır
desktop/  Electron, macOS ve Windows
mobile/   Expo, Android ve iOS
```

## Derleme

Node 20 veya üstü gerekli. Testler örnek görüntüleri üretip kontrol etmek için Python 3 ve Pillow da ister (`pip install pillow`).

```bash
cd core && npm install && npm test
```

```bash
cd desktop && npm install && npm start
npm run dist:mac
npm run dist:win
```

```bash
cd mobile && npm install
npx expo run:android
```

İnternet izni olmayan Android sürümü:

```bash
cd mobile
IZSIZ_OFFLINE=1 npx expo prebuild --platform android
cd android && IZSIZ_OFFLINE=1 ./gradlew assembleRelease
```

## Sınırlar

- Şifreli PDF'ler ve şifreli arşivler atlanır.
- ZIP içindeki PDF ve Office dosyaları temizlenmez, onları ayrıca temizle.
- Dijital imzalı bir PDF temizlenince imzası geçersiz olur. İmza meta veriyi de kapsadığı için bu kaçınılmaz.
- Meta veri işin bir kısmı. Fotoğrafın içeriği yine de nerede olduğunu ele verebilir.

## Lisans

[MIT](LICENSE)
