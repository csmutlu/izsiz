# Izsiz

[Türkçe](README.tr.md)

Izsiz strips metadata from your files and tracking junk from the links you share. It runs entirely offline on macOS, Windows and Android/iOS.

*İzsiz* is Turkish for "traceless".

## Why

Photos carry the GPS coordinates of where they were taken and the serial number of your camera. A Word file keeps the author's name, the company and sometimes the folder it was saved in, which usually includes your username. Links shared from X or Instagram end in things like `?s=19&t=...` or `?igsh=...`, which tie the link back to your account.

Most tools that clean this up are websites, so you have to upload the file you're trying to keep private. Izsiz does all of it locally. The desktop app blocks every network request, and the Android build doesn't ask for the internet permission.

## What it removes

| File type | Removed |
|---|---|
| JPG, PNG, WebP, GIF | EXIF (GPS, camera make/model, serial number, date, software), XMP, IPTC, comments, thumbnails, data hidden after the end of the image |
| HEIC / AVIF | EXIF and XMP |
| PDF | Author, title, creator app, dates, XMP, document ID, earlier saved versions, comment authors, signature details, EXIF in embedded photos |
| DOCX / XLSX / PPTX | Author, last modified by, company, manager, editing time, custom properties, tracked-change and comment authors, account IDs, the local path the file was saved in, EXIF in embedded photos |
| ODT / ODS / ODP | Author, generator, dates, comment authors |
| MP4 / MOV | GPS, device model, software, creation dates |
| MP3 | ID3v1/v2 and APE tags |
| SVG | Metadata, comments, Inkscape document name and export path |
| TXT, CSV, MD, ... | Invisible characters that can be used to fingerprint copied text (zero-width spaces, Unicode tag characters) |
| ZIP | Photos and videos inside are cleaned, and file dates are reset |

Originals are never touched. The cleaned copy is saved as `name_clean.ext`, as a brand-new file, so filesystem extras like the creation date, the "downloaded from" attribute and Finder tags don't come along.

The photo's orientation flag is kept by default, so pictures don't end up sideways. You can turn that off in settings.

### Links

Tracking parameters are stripped for X/Twitter, Instagram, TikTok, YouTube (`si`), Spotify, Threads, Reddit, Facebook, LinkedIn and others. `utm_*`, `fbclid`, `gclid` and the usual suspects go everywhere else. Amazon links are reduced to `/dp/ID`. Google and Facebook redirect links are unwrapped.

```
https://x.com/user/status/1234567890?s=19&t=AbCdEf   ->  https://x.com/user/status/1234567890
https://www.instagram.com/reel/C8xyz/?igsh=MWQ1ZGUx  ->  https://www.instagram.com/reel/C8xyz/
```

Short links (`vm.tiktok.com`, `t.co`, ...) can't be expanded without going online. Izsiz warns you about them instead of silently passing them through.

## Download

Grab the latest build from [Releases](https://github.com/csmutlu/izsiz/releases):

- **macOS (Apple Silicon):** `Izsiz-<version>-mac-arm64.dmg`
- **Windows 10/11 (x64):** `Izsiz-Setup-<version>.exe`, or `Izsiz-Portable-<version>.exe` if you'd rather not install anything
- **Android:** `Izsiz-<version>-android.apk`

The builds aren't signed with a paid certificate, so the first launch needs one extra step:

- **macOS:** right-click the app → Open → Open.
- **Windows:** "Windows protected your PC" → More info → Run anyway.
- **Android:** allow installing from your browser or file manager when asked.

## Features

**Desktop (Electron)**
- Drag and drop files or whole folders.
- **Clipboard watching:** every link you copy is cleaned on the spot. It keeps running from the tray after you close the window. On macOS you'll be asked once to allow pasting from other apps.
- **Right-click menu:** "Clean with Izsiz" shows up in Finder (Quick Actions) and in Windows Explorer ("Show more options").
- **Strict mode:** redraws JPG/PNG/WebP images from raw pixels, so anything hidden in the encoding is gone too.

**Mobile (Expo / React Native)**
- Pick photos, videos or files.
- **Share menu:** share a post from Instagram/X/TikTok to Izsiz, and the clean link lands in your clipboard. Share a photo from the gallery to get a clean copy.
- Save back to the gallery or share the cleaned file.

Both apps are available in English and Turkish, following the system language. You can switch in settings.

## Project layout

```
core/     cleaning engine, plain JavaScript with no Node or browser APIs; shared by both apps
desktop/  Electron app for macOS and Windows
mobile/   Expo app for Android and iOS
```

The core parses each format by hand, walking JPEG segments, PNG chunks and MP4 boxes, and drops what it doesn't need. Pixels are never re-encoded unless strict mode is on, so quality doesn't change. PDF goes through [pdf-lib](https://github.com/Hopding/pdf-lib) and ZIP-based formats through [fflate](https://github.com/101arrowz/fflate).

## Building

Requires Node 20+. The core tests also need Python 3 with Pillow (`pip install pillow`) to generate and verify sample images.

```bash
cd core && npm install && npm test
```

The tests generate sample files stuffed with GPS coordinates, author names and company info, clean them, then check that nothing leaked and that the files still open.

**Desktop**

```bash
cd desktop
npm install
npm start            # run in dev
npm run dist:mac     # .dmg
npm run dist:win     # .exe installer + portable (works from a Mac too)
```

**Mobile**

The share menu needs native code, so Expo Go won't work. Use a development build:

```bash
cd mobile
npm install
npx expo run:android
npx expo run:ios
```

For a release APK with no internet permission at all:

```bash
cd mobile
IZSIZ_OFFLINE=1 npx expo prebuild --platform android
cd android && IZSIZ_OFFLINE=1 ./gradlew assembleRelease
```

## Limits

- Encrypted PDFs and password-protected archives are skipped.
- PDF and Office files inside a ZIP aren't cleaned; clean them separately.
- A digitally signed PDF loses its signature when cleaned. That's unavoidable, since the signature covers the metadata.
- Metadata is only part of the story. A photo can still give away where you are through what's in it.

## License

[MIT](LICENSE)
