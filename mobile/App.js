import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, AppState, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput,
  useColorScheme, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File, Directory, Paths } from 'expo-file-system';
import {
  cleanFile, cleanText, cleanName, DEFAULT_OPTIONS, localizeResult, localizeTextResult, CLEAN_SUFFIX,
} from '../core/src/index.js';
import { STRINGS, systemLanguage } from './strings.js';

const BADGE = { jpeg: 'JPG', png: 'PNG', webp: 'WEBP', gif: 'GIF', svg: 'SVG', heif: 'HEIC', pdf: 'PDF', ooxml: 'OFFICE', odf: 'ODF', zip: 'ZIP', mp4: 'VIDEO', mp3: 'MP3', text: 'TXT' };
const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heif: 'image/heic', pdf: 'application/pdf', mp4: 'video/mp4', mp3: 'audio/mpeg', svg: 'image/svg+xml', text: 'text/plain', zip: 'application/zip' };
const REENCODE = { jpeg: SaveFormat.JPEG, png: SaveFormat.PNG, webp: SaveFormat.WEBP, heif: SaveFormat.JPEG };
const MAX_SIZE = 400 * 1024 * 1024;

const outDir = () => {
  const d = new Directory(Paths.cache, 'izsiz');
  if (!d.exists) d.create({ intermediates: true });
  return d;
};
const settingsFile = () => new File(Paths.document, 'izsiz-ayarlar.json');
const nameFromUri = (uri) => decodeURIComponent(uri.split('?')[0].split('/').pop() || 'file');
const langOf = (settings) => (settings.lang === 'tr' || settings.lang === 'en' ? settings.lang : systemLanguage());
const translator = (lang) => (key, ...args) => {
  const v = STRINGS[lang][key];
  return typeof v === 'function' ? v(...args) : v;
};

function uniqueFile(dir, name) {
  let f = new File(dir, name);
  const dot = name.lastIndexOf('.');
  for (let i = 2; f.exists; i++) f = new File(dir, dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`);
  return f;
}

// ------------------------------------------------------------ temizleme akışı

async function processAsset(asset, settings) {
  const lang = langOf(settings);
  const t = translator(lang);
  const src = new File(asset.uri);
  const size = asset.size ?? src.size ?? 0;
  if (size > MAX_SIZE) return { ok: false, error: t('tooBig') };
  const bytes = await src.bytes();
  const r = localizeResult(await cleanFile(bytes, asset.name, settings), lang);
  if (!r.ok) return r;

  let data = r.data;
  let name = cleanName(asset.name, { random: settings.randomName, suffix: CLEAN_SUFFIX[lang] });
  let removed = r.removed;

  if (settings.strict && REENCODE[r.type]) {
    // Sıkı mod: görüntüyü sıfırdan yeniden çiz (yön uygulanır), sonra bir kez daha temizle
    const tmp = uniqueFile(outDir(), `tmp-${Date.now()}.${r.type === 'heif' ? 'heic' : r.type}`);
    tmp.create();
    await tmp.write(data);
    const res = await manipulateAsync(tmp.uri, [], { compress: 0.92, format: REENCODE[r.type] });
    tmp.delete();
    const re = await cleanFile(await new File(res.uri).bytes(), name, { ...settings, keepOrientation: false });
    new File(res.uri).delete();
    if (re.ok) {
      data = re.data;
      if (r.type === 'heif') name = name.replace(/\.(heic|heif)$/i, '.jpg');
      removed = [...removed, t('redrawn')];
    }
  }

  const out = uniqueFile(outDir(), name);
  out.create();
  await out.write(data);
  return { ...r, data: undefined, removed, outUri: out.uri, outName: out.name };
}

// ------------------------------------------------------------ uygulama

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const dark = useColorScheme() === 'dark';
  const c = dark ? DARK : LIGHT;
  const s = makeStyles(c);

  const [tab, setTab] = useState('files');
  const [settings, setSettingsState] = useState({ ...DEFAULT_OPTIONS, randomName: false, lang: 'auto' });
  const [items, setItems] = useState([]);
  const [linkIn, setLinkIn] = useState('');
  const [linkRes, setLinkRes] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const toastAnim = useRef(new Animated.Value(0)).current;
  const settingsRef = useRef(settings);
  const queue = useRef(Promise.resolve());
  const lang = langOf(settings);
  const t = translator(lang);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(toastAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [toastAnim]);

  // Ayarları yükle / kaydet (yalnızca telefonda, uygulamanın kendi klasöründe)
  useEffect(() => {
    (async () => {
      try {
        const f = settingsFile();
        if (f.exists) {
          const saved = { ...settingsRef.current, ...JSON.parse(await f.text()) };
          settingsRef.current = saved;
          setSettingsState(saved);
        }
      } catch { /* ilk açılış */ }
    })();
  }, []);
  const setSetting = (key, value) => {
    const next = { ...settingsRef.current, [key]: value };
    settingsRef.current = next;
    setSettingsState(next);
    try {
      const f = settingsFile();
      if (!f.exists) f.create();
      f.write(JSON.stringify(next));
    } catch { /* yoksay */ }
  };

  const updateItem = (id, patch) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const addAssets = useCallback((assets) => {
    if (!assets.length) return;
    setTab('files');
    const fresh = assets.map((a, i) => ({ id: `${Date.now()}-${i}-${Math.random()}`, name: a.name, size: a.size, status: 'wait', asset: a }));
    setItems((list) => [...fresh, ...list]);
    for (const it of fresh) {
      queue.current = queue.current.then(async () => {
        updateItem(it.id, { status: 'busy' });
        try {
          const r = await processAsset(it.asset, settingsRef.current);
          updateItem(it.id, { ...r, status: r.ok ? 'ok' : r.type ? 'err' : 'skip' });
        } catch (e) {
          updateItem(it.id, { status: 'err', error: String((e && e.message) || e) });
        }
      });
    }
  }, []);

  const runLinkClean = useCallback((text, { copy = false } = {}) => {
    setLinkIn(text);
    if (!text.trim()) { setLinkRes(null); return null; }
    const st = settingsRef.current;
    const r = localizeTextResult(cleanText(text, { strict: st.strict }), langOf(st));
    setLinkRes(r);
    if (copy) {
      Clipboard.setStringAsync(r.text);
      toast(translator(langOf(st))('linkCopied'));
    }
    return r;
  }, [toast]);

  // Paylaş menüsünden gelenler (Instagram/X/Galeri → Paylaş → İzsiz).
  // Ağ isteği yapan "çözümleme" kullanılmaz; yalnızca ham veri okunur.
  const handleIncoming = useCallback(() => {
    let payloads = [];
    try { payloads = Sharing.getSharedPayloads?.() || []; } catch { return; }
    if (!payloads.length) return;
    try { Sharing.clearSharedPayloads(); } catch { /* yoksay */ }
    const texts = payloads.filter((p) => p.shareType === 'text' || p.shareType === 'url').map((p) => p.value);
    const files = payloads.filter((p) => !(p.shareType === 'text' || p.shareType === 'url') && p.value);
    if (texts.length) {
      setTab('links');
      runLinkClean(texts.join('\n'), { copy: true });
    }
    if (files.length) addAssets(files.map((p) => ({ uri: p.value, name: nameFromUri(p.value), size: null })));
  }, [addAssets, runLinkClean]);

  useEffect(() => {
    handleIncoming();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') handleIncoming(); });
    return () => sub.remove();
  }, [handleIncoming]);

  // ---------------------------------------------------------- eylemler

  const pickPhotos = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 1,
      exif: false,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
    });
    if (r.canceled) return;
    addAssets(r.assets.map((a) => ({ uri: a.uri, name: a.fileName || nameFromUri(a.uri), size: a.fileSize })));
  };

  const pickFiles = async () => {
    const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: '*/*' });
    if (r.canceled) return;
    addAssets(r.assets.map((a) => ({ uri: a.uri, name: a.name, size: a.size })));
  };

  const shareItem = async (it) => {
    try {
      await Sharing.shareAsync(it.outUri, { mimeType: MIME[it.type], dialogTitle: t('shareDialog') });
    } catch (e) {
      Alert.alert(t('shareFailed'), String(e.message || e));
    }
  };

  const saveToGallery = async (it) => {
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) { Alert.alert(t('permTitle'), t('permGallery')); return; }
    await MediaLibrary.saveToLibraryAsync(it.outUri);
    toast(t('savedGallery'));
  };

  const clearList = () => {
    setItems([]);
    try { const d = new Directory(Paths.cache, 'izsiz'); if (d.exists) d.delete(); } catch { /* yoksay */ }
  };

  const pasteAndClean = async () => {
    const text = await Clipboard.getStringAsync();
    if (!text) { toast(t('clipboardEmpty')); return; }
    runLinkClean(text, { copy: true });
  };

  // ---------------------------------------------------------- görünüm

  const done = items.filter((i) => i.status === 'ok').length;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={s.header}>
        <Text style={s.title}>{t('appName')}</Text>
        <Text style={s.subtitle}>{t('tagline')}</Text>
      </View>
      <View style={s.tabs}>
        {[['files', t('tabFiles')], ['links', t('tabLinks')], ['settings', t('tabSettings')]].map(([k, label]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && s.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            <Text style={[s.tabText, tab === k && s.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {tab === 'files' && (
          <>
            <View style={s.card}>
              <Text style={s.h}>{t('whatTitle')}</Text>
              <Text style={s.muted}>{t('whatDesc')}</Text>
              <View style={s.row}>
                <Btn s={s} primary label={t('pickPhotos')} onPress={pickPhotos} />
                <Btn s={s} label={t('pickFiles')} onPress={pickFiles} />
              </View>
              <Text style={s.hint}>{t('shareTip')}</Text>
            </View>

            {items.length > 0 && (
              <View style={s.listHead}>
                <Text style={s.muted}>{t('progress', done, items.length)}</Text>
                <Pressable onPress={clearList}><Text style={s.link}>{t('clearList')}</Text></Pressable>
              </View>
            )}
            {items.map((it) => <FileItem key={it.id} it={it} s={s} c={c} t={t} onShare={shareItem} onGallery={saveToGallery} />)}
          </>
        )}

        {tab === 'links' && (
          <>
            <View style={s.card}>
              <View style={s.rowBetween}>
                <Text style={s.h}>{t('linkOrText')}</Text>
                <Btn s={s} small primary label={t('pasteClean')} onPress={pasteAndClean} />
              </View>
              <TextInput
                style={s.input}
                multiline
                value={linkIn}
                onChangeText={(t) => runLinkClean(t)}
                placeholder="https://x.com/…/status/123?s=19&t=…"
                placeholderTextColor={c.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={s.rowBetween}>
                <Text style={s.h}>{t('cleanVersion')}</Text>
                <Btn s={s} small label={t('copy')} disabled={!linkRes} onPress={() => { Clipboard.setStringAsync(linkRes.text); toast(t('copied')); }} />
              </View>
              <Text selectable style={s.out}>{linkRes ? linkRes.text : t('outPlaceholder')}</Text>
              {linkRes && linkRes.links.map((l, i) => (
                <View key={i} style={{ gap: 6 }}>
                  <View style={s.tags}>
                    {l.site && <Text style={[s.tag, s.tagSite]}>{l.site}</Text>}
                    {l.removed.length
                      ? l.removed.map((k) => <Text key={k} style={s.tag}>{k}</Text>)
                      : <Text style={s.muted}>{t('noTracking')}</Text>}
                  </View>
                  {l.warnings.map((w) => <Text key={w} style={s.warn}>{w}</Text>)}
                </View>
              ))}
              {linkRes && linkRes.invisibleRemoved > 0 && (
                <Text style={s.warn}>{t('invisibleRemoved', linkRes.invisibleRemoved)}</Text>
              )}
            </View>
            <View style={s.card}>
              <Text style={s.h}>{t('fastestTitle')}</Text>
              <Text style={s.muted}>{t('fastestDesc')}</Text>
            </View>
          </>
        )}

        {tab === 'settings' && (
          <>
            <View style={s.card}>
              <Opt s={s} c={c} title={t('randomName')} desc={t('randomNameDesc')} value={settings.randomName} onChange={(v) => setSetting('randomName', v)} />
              <Opt s={s} c={c} title={t('keepOrientation')} desc={t('keepOrientationDesc')} value={settings.keepOrientation} onChange={(v) => setSetting('keepOrientation', v)} />
              <Opt s={s} c={c} title={t('keepColor')} desc={t('keepColorDesc')} value={settings.keepColorProfile} onChange={(v) => setSetting('keepColorProfile', v)} />
              <Opt s={s} c={c} title={t('strict')} desc={t('strictDesc')} value={settings.strict} onChange={(v) => setSetting('strict', v)} last />
            </View>
            <View style={s.card}>
              <Text style={s.h}>{t('languageTitle')}</Text>
              <View style={[s.tabs, { marginHorizontal: 0 }]}>
                {[['auto', t('languageAuto')], ['tr', 'Türkçe'], ['en', 'English']].map(([k, label]) => {
                  const on = (settings.lang || 'auto') === k;
                  return (
                    <Pressable key={k} onPress={() => setSetting('lang', k)} style={[s.tab, on && s.tabOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                      <Text style={[s.tabText, on && s.tabTextOn]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={s.card}>
              <Text style={s.h}>{t('offlineTitle')}</Text>
              <Text style={s.muted}>{t('offlineDesc')}</Text>
            </View>
          </>
        )}
      </ScrollView>

      <Animated.View pointerEvents="none" style={[s.toast, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
        <Text style={s.toastText}>{toastMsg}</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

function Btn({ s, label, onPress, primary, small, disabled }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.btn, primary && s.btnPrimary, small && s.btnSmall, (pressed || disabled) && { opacity: disabled ? 0.4 : 0.75 }]}>
      <Text style={[s.btnText, primary && s.btnTextPrimary, small && { fontSize: 13 }]}>{label}</Text>
    </Pressable>
  );
}

function Opt({ s, c, title, desc, value, onChange, last }) {
  return (
    <View style={[s.opt, last && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.optTitle}>{title}</Text>
        <Text style={s.muted}>{desc}</Text>
      </View>
      <Switch value={!!value} onValueChange={onChange} trackColor={{ true: c.accent }} />
    </View>
  );
}

function FileItem({ it, s, c, t, onShare, onGallery }) {
  const [open, setOpen] = useState(false);
  const found = it.found || [];
  const isMedia = ['jpeg', 'png', 'webp', 'gif', 'heif', 'mp4'].includes(it.type);
  let pill = { text: t('waiting'), style: s.pillWait };
  if (it.status === 'busy') pill = { text: t('cleaning'), style: s.pillWait };
  if (it.status === 'ok') pill = { text: t('cleaned'), style: s.pillOk };
  if (it.status === 'err') pill = { text: t('error'), style: s.pillErr };
  if (it.status === 'skip') pill = { text: t('unsupported'), style: s.pillSkip };

  return (
    <View style={s.item}>
      <Pressable onPress={() => it.status === 'ok' && setOpen(!open)} style={s.itemHead}>
        <Text style={s.badge}>{BADGE[it.type] || (it.name.split('.').pop() || '?').toUpperCase().slice(0, 5)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>{it.name}</Text>
          <Text style={s.sub} numberOfLines={2}>
            {it.status === 'ok'
              ? found.length ? t('foundN', found.length) : t('foundNone')
              : it.error || ''}
          </Text>
        </View>
        {it.status === 'busy' ? <ActivityIndicator color={c.accent} /> : <Text style={[s.pill, pill.style]}>{pill.text}</Text>}
      </Pressable>
      {it.status === 'ok' && (
        <View style={s.itemBody}>
          {open && (
            <>
              <Text style={s.sectionLabel}>{t('foundTitle')}</Text>
              {found.length === 0 && <Text style={s.muted}>{t('nothingReadable')}</Text>}
              {found.map((f, i) => (
                <Text key={i} style={s.foundRow}><Text style={s.foundLabel}>{f.label}: </Text><Text style={s.foundVal}>{f.value}</Text></Text>
              ))}
              <Text style={s.sectionLabel}>{t('removedTitle')}</Text>
              {it.removed.map((r) => <Text key={r} style={s.removed}>• {r}</Text>)}
              {it.warnings?.length > 0 && <Text style={s.warn}>{it.warnings.join(' ')}</Text>}
            </>
          )}
          <View style={s.row}>
            <Btn s={s} small primary label={t('shareSave')} onPress={() => onShare(it)} />
            {isMedia && <Btn s={s} small label={t('saveGallery')} onPress={() => onGallery(it)} />}
            <Btn s={s} small label={open ? t('hide') : t('details')} onPress={() => setOpen(!open)} />
          </View>
        </View>
      )}
    </View>
  );
}

// ------------------------------------------------------------ tema

const LIGHT = {
  bg: '#f4f7f6', surface: '#ffffff', surface2: '#eef3f2', border: '#dbe4e2', text: '#13201e', muted: '#5d6f6c',
  accent: '#0f7a6d', accentInk: '#ffffff', accentSoft: '#dff1ee', ok: '#18794e', okSoft: '#e1f4ea',
  warn: '#9a6100', warnSoft: '#fdf1dc', err: '#b42318', errSoft: '#fde7e5',
};
const DARK = {
  bg: '#0f1716', surface: '#162120', surface2: '#1c2928', border: '#2a3a38', text: '#e6efed', muted: '#93a7a3',
  accent: '#3cc3ae', accentInk: '#062521', accentSoft: '#153a35', ok: '#4fd08f', okSoft: '#143023',
  warn: '#f0b552', warnSoft: '#34290f', err: '#ff8a80', errSoft: '#3a1714',
};

const makeStyles = (c) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  title: { fontSize: 26, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
  subtitle: { color: c.muted, fontSize: 13 },
  tabs: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: c.surface2, borderRadius: 10, padding: 3, gap: 2 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabOn: { backgroundColor: c.surface },
  tabText: { color: c.muted, fontWeight: '600' },
  tabTextOn: { color: c.text },
  body: { padding: 16, gap: 12, paddingBottom: 60 },
  card: { backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14, gap: 10 },
  h: { fontSize: 15, fontWeight: '700', color: c.text },
  muted: { color: c.muted, fontSize: 13, lineHeight: 18 },
  hint: { color: c.muted, fontSize: 12, fontStyle: 'italic' },
  link: { color: c.accent, fontWeight: '600', fontSize: 13 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  btn: { borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  btnPrimary: { backgroundColor: c.accent, borderColor: c.accent },
  btnSmall: { paddingVertical: 6, paddingHorizontal: 10 },
  btnText: { color: c.text, fontWeight: '700' },
  btnTextPrimary: { color: c.accentInk },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  item: { backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  badge: { width: 52, textAlign: 'center', fontSize: 10, fontWeight: '800', color: c.muted, backgroundColor: c.surface2, paddingVertical: 4, borderRadius: 6, overflow: 'hidden' },
  name: { color: c.text, fontWeight: '600' },
  sub: { color: c.muted, fontSize: 12 },
  pill: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  pillWait: { backgroundColor: c.surface2, color: c.muted },
  pillOk: { backgroundColor: c.okSoft, color: c.ok },
  pillErr: { backgroundColor: c.errSoft, color: c.err },
  pillSkip: { backgroundColor: c.warnSoft, color: c.warn },
  itemBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 4 },
  sectionLabel: { color: c.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 6 },
  foundRow: { fontSize: 13 },
  foundLabel: { color: c.muted, fontWeight: '600' },
  foundVal: { color: c.err, fontWeight: '600' },
  removed: { color: c.text, fontSize: 13 },
  warn: { backgroundColor: c.warnSoft, color: c.warn, padding: 8, borderRadius: 8, fontSize: 12.5, overflow: 'hidden' },
  input: { minHeight: 90, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, color: c.text, borderRadius: 10, padding: 10, fontSize: 13, textAlignVertical: 'top', fontFamily: 'Menlo' },
  out: { backgroundColor: c.accentSoft, color: c.text, padding: 10, borderRadius: 10, fontSize: 13, overflow: 'hidden', fontFamily: 'Menlo' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  tag: { backgroundColor: c.errSoft, color: c.err, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, fontSize: 12, textDecorationLine: 'line-through', overflow: 'hidden' },
  tagSite: { backgroundColor: c.surface2, color: c.muted, textDecorationLine: 'none', fontWeight: '700' },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border },
  optTitle: { color: c.text, fontWeight: '700', marginBottom: 2 },
  toast: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: c.text, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  toastText: { color: c.bg, fontWeight: '700' },
});
