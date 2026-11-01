const api = window.izsiz;
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

let settings = {};
const items = [];

let strings = window.STRINGS.tr;
const t = (key, ...args) => {
  const v = strings[key];
  return typeof v === 'function' ? v(...args) : v;
};

function applyLanguage() {
  const lang = settings.uiLang === 'tr' ? 'tr' : 'en';
  strings = window.STRINGS[lang];
  document.documentElement.lang = lang;
  document.title = t('appName');
  document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach((n) => { n.innerHTML = t(n.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((n) => { n.placeholder = t(n.dataset.i18nPlaceholder); });
  $('#cm-hint').textContent = t(settings.platform === 'darwin' ? 'contextHintMac' : 'contextHintWin');
  items.forEach(updateItem);
  updateSummary();
}

const BADGE = { jpeg: 'JPG', png: 'PNG', webp: 'WEBP', gif: 'GIF', svg: 'SVG', heif: 'HEIC', pdf: 'PDF', ooxml: 'OFFICE', odf: 'ODF', zip: 'ZIP', mp4: 'VIDEO', mp3: 'MP3', text: 'TXT' };
const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
}

const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

// ---------------------------------------------------------------- sekmeler

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
function selectTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== `tab-${name}`; });
}

// ---------------------------------------------------------------- ayarlar

function renderSettings() {
  document.querySelectorAll('[data-setting]').forEach((i) => { i.checked = !!settings[i.dataset.setting]; });
  $('#watch').checked = !!settings.clipboardWatch;
  $('#outdir-label').textContent = settings.outDir || t('outDefault');
  $('#outdir-reset').hidden = !settings.outDir;
  $('#lang').value = settings.lang || 'auto';
}

$('#lang').addEventListener('change', async (e) => {
  settings = await api.setSettings({ lang: e.target.value });
  applyLanguage();
  renderSettings();
});

document.querySelectorAll('[data-setting]').forEach((i) => i.addEventListener('change', async () => {
  settings = await api.setSettings({ [i.dataset.setting]: i.checked });
  renderSettings();
}));
$('#watch').addEventListener('change', async (e) => {
  settings = await api.setSettings({ clipboardWatch: e.target.checked });
  renderSettings();
  toast(t(e.target.checked ? 'watchOn' : 'watchOff'));
});
$('#outdir-change').addEventListener('click', async () => { settings = await api.pickOutDir(); renderSettings(); });
$('#outdir-reset').addEventListener('click', async () => { settings = await api.setSettings({ outDir: '' }); renderSettings(); });
api.onSettings((s) => {
  const langChanged = s.uiLang !== settings.uiLang;
  settings = s;
  if (langChanged) applyLanguage();
  renderSettings();
});

async function initContextMenu() {
  $('#contextmenu').checked = await api.contextMenuStatus();
  $('#contextmenu').addEventListener('change', async (e) => {
    const on = await api.setContextMenu(e.target.checked);
    e.target.checked = on;
    toast(t(on ? 'contextAdded' : 'contextRemoved'));
  });
}

// ---------------------------------------------------------------- dosyalar

const drop = $('#drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
  if (paths.length) { selectTab('files'); addPaths(paths); }
});
$('#pick-files').addEventListener('click', async () => addPaths(await api.pickFiles()));
$('#pick-folder').addEventListener('click', async () => addPaths(await api.pickFolder()));
$('#clear-list').addEventListener('click', () => {
  items.length = 0;
  $('#list').replaceChildren();
  updateSummary();
});
api.onExternalPaths((paths) => { selectTab('files'); addPaths(paths); });

let queue = Promise.resolve();
async function addPaths(paths) {
  if (!paths || !paths.length) return;
  const files = await api.expand(paths);
  if (!files.length) { toast(t('noSupported')); return; }
  for (const f of files) {
    const item = { ...f, status: 'wait' };
    items.push(item);
    item.node = renderItem(item);
    $('#list').append(item.node);
    queue = queue.then(() => processItem(item));
  }
  updateSummary();
}

async function reencode(data, type) {
  const blob = new Blob([data], { type: MIME[type] });
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  canvas.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close();
  const out = await canvas.convertToBlob({ type: MIME[type], quality: 0.92 });
  return new Uint8Array(await out.arrayBuffer());
}

async function processItem(item) {
  item.status = 'busy';
  updateItem(item);
  try {
    const r = await api.clean(item.path);
    Object.assign(item, r);
    if (r.ok && r.needsReencode) {
      const data = await reencode(r.data, r.type);
      const saved = await api.save(item.path, data);
      item.outPath = saved.outPath;
      item.removed = [...r.removed, t('redrawn')];
      delete item.data;
    }
    item.status = r.ok ? 'ok' : r.type ? 'err' : 'skip';
  } catch (e) {
    item.status = 'err';
    item.error = String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  }
  updateItem(item);
  updateSummary();
}

function renderItem(item) {
  const li = el('li', 'item');
  const head = el('div', 'item-head');
  head.append(el('span', 'badge'), el('div', 'meta'), el('span', 'pill'), el('span', 'chev', '›'));
  head.querySelector('.meta').append(el('div', 'name', item.name), el('div', 'sub'));
  head.addEventListener('click', () => li.classList.toggle('open'));
  li.append(head, el('div', 'item-body'));
  return li;
}

function updateItem(item) {
  const n = item.node;
  n.querySelector('.badge').textContent = BADGE[item.type] || item.name.split('.').pop().toUpperCase().slice(0, 5);
  const pill = n.querySelector('.pill');
  const sub = n.querySelector('.sub');
  const found = item.found || [];
  if (item.status === 'wait' || item.status === 'busy') {
    pill.className = 'pill wait';
    pill.textContent = t(item.status === 'busy' ? 'cleaning' : 'waiting');
    sub.textContent = fmtSize(item.size);
  } else if (item.status === 'ok') {
    pill.className = 'pill ok';
    pill.textContent = t('cleaned');
    const file = item.outPath.split(/[\\/]/).pop();
    sub.textContent = found.length ? t('foundN', found.length, file) : t('foundNone', file);
  } else {
    pill.className = item.status === 'skip' ? 'pill skip' : 'pill err';
    pill.textContent = t(item.status === 'skip' ? 'unsupported' : 'error');
    sub.textContent = item.error || '';
  }

  const body = n.querySelector('.item-body');
  body.replaceChildren();
  if (item.status !== 'ok') return;
  const left = el('div');
  left.append(el('h3', null, t('foundTitle')));
  const fl = el('ul', 'found');
  if (!found.length) fl.append(el('li', 'none', t('nothingReadable')));
  for (const f of found) {
    const li = el('li');
    li.append(el('b', null, f.label), el('span', 'val', f.value));
    fl.append(li);
  }
  left.append(fl);
  const right = el('div');
  right.append(el('h3', null, t('removedTitle')));
  const rl = el('ul');
  for (const r of item.removed || []) rl.append(el('li', null, r));
  right.append(rl);
  body.append(left, right);
  if (item.warnings && item.warnings.length) body.append(el('div', 'warns', item.warnings.join(' ')));
  const actions = el('div', 'actions');
  const show = el('button', 'btn small', t('showInFolder'));
  show.addEventListener('click', (e) => { e.stopPropagation(); api.show(item.outPath); });
  actions.append(show);
  body.append(actions);
}

function updateSummary() {
  $('#list-wrap').hidden = items.length === 0;
  drop.classList.toggle('compact', items.length > 0);
  const ok = items.filter((i) => i.status === 'ok').length;
  const err = items.filter((i) => i.status === 'err').length;
  const skip = items.filter((i) => i.status === 'skip').length;
  const pending = items.length - ok - err - skip;
  const parts = [t('sumCleaned', ok)];
  if (pending) parts.push(t('sumQueued', pending));
  if (err) parts.push(t('sumErrors', err));
  if (skip) parts.push(t('sumSkipped', skip));
  $('#summary').textContent = parts.join(' · ');
}

// ---------------------------------------------------------------- linkler

const linkIn = $('#link-in');
let lastCleaned = '';

async function runLinkClean() {
  const text = linkIn.value;
  const details = $('#link-details');
  details.replaceChildren();
  if (!text.trim()) { $('#link-out').textContent = ''; $('#copy-out').disabled = true; return null; }
  const r = await api.cleanText(text);
  lastCleaned = r.text;
  $('#link-out').textContent = r.text;
  $('#copy-out').disabled = false;
  for (const l of r.links) {
    const row = el('div', 'tagrow');
    if (l.site) row.append(el('span', 'tag site', l.site));
    if (l.removed.length) l.removed.forEach((k) => row.append(el('span', 'tag', k)));
    else row.append(el('span', 'muted', t('noTracking')));
    details.append(row);
    l.warnings.forEach((w) => details.append(el('div', 'note', w)));
  }
  if (r.invisibleRemoved) details.append(el('div', 'note', t('invisibleRemoved', r.invisibleRemoved)));
  return r;
}

linkIn.addEventListener('input', runLinkClean);
$('#copy-out').addEventListener('click', async () => {
  await api.writeClipboard(lastCleaned);
  toast(t('linkCopied'));
});
$('#paste-clean').addEventListener('click', async () => {
  linkIn.value = await api.readClipboard();
  const r = await runLinkClean();
  if (r) {
    await api.writeClipboard(r.text);
    toast(t('cleanedCopied'));
  } else {
    toast(t('clipboardEmpty'));
  }
});

api.onClipboardCleaned((it) => {
  $('#history-wrap').hidden = false;
  const li = el('li');
  const t = new Date(it.at);
  li.append(el('time', null, `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`), el('code', null, it.cleaned));
  $('#history').prepend(li);
});

// ---------------------------------------------------------------- başlat

(async () => {
  settings = await api.getSettings();
  if (settings.platform === 'darwin') document.body.classList.add('mac');
  applyLanguage();
  renderSettings();
  initContextMenu();
  const pending = await api.ready();
  if (pending.length) addPaths(pending);
})();
