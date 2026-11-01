import {
  app, BrowserWindow, ipcMain, dialog, shell, clipboard, Tray, Menu, Notification, nativeImage, session,
} from 'electron';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import {
  cleanFile, cleanName, cleanText, SUPPORTED_EXTENSIONS, extOf,
  pickLanguage, localizeResult, localizeTextResult, CLEAN_SUFFIX,
} from '../../core/src/index.js';
import { contextMenuInstalled, installContextMenu, removeContextMenu } from './contextmenu.js';

const SUPPORTED = new Set(SUPPORTED_EXTENSIONS);
const MAX_SIZE = 2 * 1024 * 1024 * 1024;
const REENCODABLE = new Set(['jpeg', 'png', 'webp']);

let win = null;
let tray = null;
let quitting = false;
let pendingPaths = [];
let rendererReady = false;

// ------------------------------------------------------------ ayarlar

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const DEFAULTS = {
  outDir: '', randomName: false, keepOrientation: true, keepColorProfile: false, strict: false, clipboardWatch: false, lang: 'auto',
};
let settings = { ...DEFAULTS };

const lang = () => (settings.lang === 'tr' || settings.lang === 'en' ? settings.lang : pickLanguage(app.getLocale()));
const publicSettings = () => ({ ...settings, uiLang: lang(), platform: process.platform });

const MSG = {
  tr: {
    open: 'İzsiz’i aç', watch: 'Panodaki linkleri otomatik temizle', quit: 'Çık',
    tipWatching: 'İzsiz — pano izleniyor', cleaned: 'Link temizlendi', invisible: (n) => `${n} görünmez karakter silindi`,
    tooBig: 'Dosya 2 GB’den büyük.',
  },
  en: {
    open: 'Open Izsiz', watch: 'Auto-clean copied links', quit: 'Quit',
    tipWatching: 'Izsiz — watching clipboard', cleaned: 'Link cleaned', invisible: (n) => `${n} invisible characters removed`,
    tooBig: 'The file is larger than 2 GB.',
  },
};
const msg = () => MSG[lang()];

function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(fss.readFileSync(settingsFile(), 'utf8')) }; } catch { /* ilk açılış */ }
}
function saveSettings() {
  try { fss.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch { /* yoksay */ }
}

// ------------------------------------------------------------ dışarıdan gelen dosyalar (sağ tık, "Birlikte aç")

function pathsFromArgv(argv) {
  const skip = new Set([process.execPath, app.getAppPath()].map((p) => path.resolve(p)));
  return argv.slice(1).filter((a) => {
    if (!a || a.startsWith('-')) return false;
    const p = path.resolve(a);
    return !skip.has(p) && p !== path.resolve('.') && fss.existsSync(p);
  });
}

function deliverPaths(paths) {
  if (!paths.length) return;
  if (win && rendererReady) {
    win.webContents.send('external-paths', paths);
    showWindow();
  } else {
    pendingPaths.push(...paths);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    deliverPaths(pathsFromArgv(argv));
    showWindow();
  });
}
app.on('open-file', (e, p) => { e.preventDefault(); deliverPaths([p]); });

// ------------------------------------------------------------ pencere ve tepsi

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  rendererReady = false;
  win = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 720,
    minHeight: 540,
    title: lang() === 'tr' ? 'İzsiz' : 'Izsiz',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0f1716',
    icon: path.join(__dirname, '..', 'renderer', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.on('close', (e) => {
    if (!quitting && settings.clipboardWatch) {
      e.preventDefault();
      win.hide();
      if (process.platform === 'darwin') app.dock?.hide();
    }
  });
  win.on('show', () => { if (process.platform === 'darwin') app.dock?.show(); });
  win.on('closed', () => { win = null; });
}

function trayIcon() {
  const name = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';
  const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'build');
  const img = nativeImage.createFromPath(path.join(base, name));
  if (process.platform === 'darwin') img.setTemplateImage(true);
  return img;
}

function updateTray() {
  if (!tray) return;
  const m = msg();
  tray.setToolTip(settings.clipboardWatch ? m.tipWatching : 'Izsiz');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: m.open, click: showWindow },
    { type: 'separator' },
    { label: m.watch, type: 'checkbox', checked: settings.clipboardWatch, click: (i) => setSettings({ clipboardWatch: i.checked }) },
    { type: 'separator' },
    { label: m.quit, click: () => { quitting = true; app.quit(); } },
  ]));
}

// ------------------------------------------------------------ pano izleme

let watchTimer = null;
let lastClip = '';

function clipboardTick() {
  const text = clipboard.readText();
  if (!text || text === lastClip || text.length > 20000) return;
  // Kopyalanan resim/dosya varsa panoya dokunma (yalnızca düz metin değiştirilir)
  if (!clipboard.readImage().isEmpty()) { lastClip = text; return; }
  lastClip = text;
  const r = localizeTextResult(cleanText(text, { strict: settings.strict }), lang());
  if (r.text === text) return;
  clipboard.writeText(r.text);
  lastClip = r.text;
  const removed = r.links.flatMap((l) => l.removed);
  const item = { at: Date.now(), original: text, cleaned: r.text, removed, invisible: r.invisibleRemoved, warnings: r.links.flatMap((l) => l.warnings) };
  win?.webContents.send('clipboard-cleaned', item);
  if (Notification.isSupported() && !(win && win.isFocused())) {
    new Notification({
      title: msg().cleaned,
      body: r.links.length ? r.links.map((l) => l.cleaned).join('\n').slice(0, 200) : msg().invisible(r.invisibleRemoved),
      silent: true,
    }).show();
  }
}

function applyWatch() {
  clearInterval(watchTimer);
  watchTimer = null;
  if (settings.clipboardWatch) {
    lastClip = clipboard.readText();
    watchTimer = setInterval(clipboardTick, 700);
  }
  updateTray();
}

function setSettings(patch) {
  settings = { ...settings, ...patch };
  saveSettings();
  if ('clipboardWatch' in patch || 'strict' in patch || 'lang' in patch) applyWatch();
  if ('lang' in patch) {
    contextMenuInstalled().then((on) => on && installContextMenu(lang())); // menü adı da yeni dilde olsun
  }
  const pub = publicSettings();
  win?.webContents.send('settings', pub);
  return pub;
}

// ------------------------------------------------------------ dosya işlemleri

async function expand(paths, out = [], depth = 0) {
  for (const p of paths) {
    let st;
    try { st = await fs.stat(p); } catch { continue; }
    const name = path.basename(p);
    if (st.isDirectory()) {
      if (depth > 8 || name.startsWith('.')) continue;
      const entries = await fs.readdir(p);
      await expand(entries.filter((e) => !e.startsWith('.')).map((e) => path.join(p, e)), out, depth + 1);
    } else if (st.isFile()) {
      if (depth > 0 && !SUPPORTED.has(extOf(name))) continue; // klasör içindeki desteklenmeyenleri atla
      out.push({ path: p, name, size: st.size });
    }
  }
  return out;
}

async function uniquePath(p) {
  const ext = path.extname(p);
  const base = p.slice(0, p.length - ext.length);
  let candidate = p;
  for (let i = 2; fss.existsSync(candidate); i++) candidate = `${base} (${i})${ext}`;
  return candidate;
}

async function writeOutput(srcPath, data) {
  const dir = settings.outDir && fss.existsSync(settings.outDir) ? settings.outDir : path.dirname(srcPath);
  const target = await uniquePath(path.join(dir, cleanName(path.basename(srcPath), { random: settings.randomName, suffix: CLEAN_SUFFIX[lang()] })));
  // Yeni dosya: orijinalin oluşturma tarihi, "nereden indirildi" bilgisi ve etiketleri taşınmaz
  await fs.writeFile(target, data, { flag: 'wx' });
  return target;
}

ipcMain.handle('settings:get', () => publicSettings());
ipcMain.handle('settings:set', (_e, patch) => setSettings(patch));

ipcMain.handle('files:pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('folder:pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('outdir:pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled) return publicSettings();
  return setSettings({ outDir: r.filePaths[0] });
});
ipcMain.handle('files:expand', (_e, paths) => expand(paths));

ipcMain.handle('file:clean', async (_e, filePath) => {
  const st = await fs.stat(filePath);
  if (st.size > MAX_SIZE) return { ok: false, error: msg().tooBig };
  const bytes = new Uint8Array(await fs.readFile(filePath));
  const r = localizeResult(await cleanFile(bytes, path.basename(filePath), settings), lang());
  if (!r.ok) return r;
  if (settings.strict && REENCODABLE.has(r.type)) {
    return { ...r, needsReencode: true }; // görüntü arayüzde yeniden çizilip kaydedilecek
  }
  const outPath = await writeOutput(filePath, r.data);
  return { ...r, data: undefined, outPath };
});

ipcMain.handle('file:save', async (_e, srcPath, data) => {
  // Yeniden çizilen görüntüye tarayıcının eklediği profil vb. de kalmasın
  const r = await cleanFile(new Uint8Array(data), path.basename(srcPath), { ...settings, keepOrientation: false });
  return { outPath: await writeOutput(srcPath, r.ok ? r.data : new Uint8Array(data)) };
});
ipcMain.handle('file:show', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('text:clean', (_e, text) => localizeTextResult(cleanText(text, { strict: settings.strict }), lang()));
ipcMain.handle('clipboard:read', () => clipboard.readText());
ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(text); lastClip = text; return true; });
ipcMain.handle('renderer:ready', () => {
  rendererReady = true;
  const p = pendingPaths;
  pendingPaths = [];
  return p;
});

ipcMain.handle('contextmenu:status', () => contextMenuInstalled());
ipcMain.handle('contextmenu:set', async (_e, on) => {
  if (on) await installContextMenu(lang());
  else await removeContextMenu();
  return contextMenuInstalled();
});

// ------------------------------------------------------------ başlat

app.whenReady().then(() => {
  // Uygulama tamamen çevrimdışı: her türlü ağ isteği engellenir.
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] },
    (_d, cb) => cb({ cancel: true }),
  );
  app.on('web-contents-created', (_e, wc) => {
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-navigate', (e) => e.preventDefault());
  });

  loadSettings();
  pendingPaths.push(...pathsFromArgv(process.argv));
  tray = new Tray(trayIcon());
  tray.on('click', () => { if (process.platform !== 'darwin') showWindow(); });
  createWindow();
  applyWatch();

  // Geliştirme: IZSIZ_CAPTURE=yol.png ile pencerenin ekran görüntüsünü alıp kapanır
  if (!app.isPackaged && process.env.IZSIZ_CAPTURE) {
    setTimeout(async () => {
      if (process.env.IZSIZ_JS) await win.webContents.executeJavaScript(process.env.IZSIZ_JS);
      await new Promise((r) => setTimeout(r, 1500));
      const img = await win.webContents.capturePage();
      fss.writeFileSync(process.env.IZSIZ_CAPTURE, img.toPNG());
      quitting = true;
      app.quit();
    }, 2500);
  }
});

app.on('activate', showWindow);
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => {
  if (!settings.clipboardWatch) app.quit();
});
