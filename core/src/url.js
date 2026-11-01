// Paylaşım linklerindeki takip / hesap parametrelerini siler.
// Örn. https://x.com/a/status/1?s=19&t=AbC -> https://x.com/a/status/1
// React Native'in URL sınıfı eksik olduğu için kendi ayrıştırıcımızı kullanıyoruz.
import { cleanInvisible } from './text.js';

// Her sitede silinen genel takip parametreleri
const GENERIC = new Set([
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid', 'twclid', 'ttclid', 'li_fat_id',
  'igshid', 'igsh', 'mibextid', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi', '__hstc', '__hssc', '__hsfp', 'hsctatracking',
  'mkt_tok', 'oly_anon_id', 'oly_enc_id', 'rb_clickid', 's_cid', 'vero_conv', 'vero_id', 'wickedid', 'epik',
  'ref_src', 'ref_url', 'sc_cid', '_branch_match_id', '_branch_referrer', 'srsltid', 'share_id', 'shareid',
  'share_app_id', 'share_link_id', 'share_item_id', 'sender_device', 'sender_web_id', 'is_from_webapp',
  'cmpid', 'xtor', 'at_medium', 'at_campaign', 'spm', 'scm', 'trk', 'trkcampaign', 'trackingid', 'rcm', 'lipi',
]);
const isGeneric = (k) => GENERIC.has(k) || k.startsWith('utm_') || k.startsWith('pk_') || k.startsWith('mtm_');

// Siteye özel kurallar: keep = korunacak parametreler (geri kalan hepsi silinir)
const SITES = [
  { hosts: ['x.com', 'twitter.com', 'fixupx.com', 'fxtwitter.com', 'vxtwitter.com'], keep: [], name: 'X / Twitter' },
  { hosts: ['instagram.com'], keep: [], name: 'Instagram' },
  { hosts: ['threads.net', 'threads.com'], keep: [], name: 'Threads' },
  { hosts: ['tiktok.com'], keep: [], name: 'TikTok' },
  { hosts: ['youtube.com', 'youtube-nocookie.com'], keep: ['v', 't', 'list', 'index', 'start', 'search_query'], name: 'YouTube' },
  { hosts: ['youtu.be'], keep: ['t', 'list'], name: 'YouTube' },
  { hosts: ['facebook.com', 'fb.watch'], keep: ['v', 'story_fbid', 'id', 'fbid', 'set', 'q'], name: 'Facebook' },
  { hosts: ['spotify.com'], keep: [], name: 'Spotify' },
  { hosts: ['music.apple.com', 'podcasts.apple.com'], keep: ['i'], name: 'Apple' },
  { hosts: ['reddit.com', 'redd.it'], keep: [], name: 'Reddit' },
  { hosts: ['linkedin.com'], keep: ['currentjobid', 'keywords'], name: 'LinkedIn' },
  { hosts: ['pinterest.com', 'pinterest.co.uk'], keep: [], name: 'Pinterest' },
  { hosts: ['snapchat.com'], keep: [], name: 'Snapchat' },
  { hosts: ['twitch.tv'], keep: [], name: 'Twitch' },
  { hosts: ['soundcloud.com'], keep: [], name: 'SoundCloud' },
  { hosts: ['bsky.app'], keep: [], name: 'Bluesky' },
  { hosts: ['t.me', 'telegram.me'], keep: [], name: 'Telegram' },
  { hosts: ['open.substack.com', 'substack.com'], keep: [], name: 'Substack' },
  { hosts: ['medium.com'], keep: [], name: 'Medium' },
  { hosts: ['google.com', 'google.com.tr'], keep: ['q', 'tbm', 'hl', 'gl', 'cid', 'id'], name: 'Google' },
  { hosts: ['trendyol.com'], keep: ['boutiqueid', 'merchantid', 'q'], name: 'Trendyol' },
  { hosts: ['hepsiburada.com'], keep: ['q', 'magaza'], name: 'Hepsiburada' },
];

// Kısa paylaşım linkleri: içindeki kod çoğu zaman paylaşan hesaba bağlıdır.
const SHORT = [
  [/^(vm|vt)\.tiktok\.com$/, 'TikTok'], [/^(www\.)?tiktok\.com$/, 'TikTok', /^\/t\//],
  [/^t\.co$/, 'X'], [/^(www\.)?instagram\.com$/, 'Instagram', /^\/share\//],
  [/^(www\.|m\.)?facebook\.com$/, 'Facebook', /^\/share\//], [/^fb\.me$/, 'Facebook'],
  [/^(www\.)?reddit\.com$/, 'Reddit', /^\/r\/[^/]+\/s\//], [/^pin\.it$/, 'Pinterest'],
  [/^spotify\.link$/, 'Spotify'], [/^(amzn\.to|a\.co|amzn\.eu)$/, 'Amazon'], [/^ty\.gl$/, 'Trendyol'],
  [/^(bit\.ly|tinyurl\.com|ow\.ly|buff\.ly|lnkd\.in|goo\.gl|shorturl\.at|rb\.gy|is\.gd)$/, 'Kısa link'],
];

const REDIRECTS = [
  ['l.facebook.com', /^\/l\.php/, ['u']], ['lm.facebook.com', /^\/l\.php/, ['u']], ['l.instagram.com', /^\/?$/, ['u']],
  ['l.threads.net', /^\/?$/, ['u']], ['l.threads.com', /^\/?$/, ['u']],
  ['google.com', /^\/url$/, ['q', 'url']], ['google.com.tr', /^\/url$/, ['q', 'url']],
  ['youtube.com', /^\/redirect$/, ['q']], ['out.reddit.com', /./, ['url']], ['t.umblr.com', /^\/redirect$/, ['z']],
  ['steamcommunity.com', /^\/linkfilter/, ['url', 'u']], ['vk.com', /^\/away\.php$/, ['to']],
];

const AMAZON =/(^|\.)amazon\.(com|com\.tr|co\.uk|de|fr|it|es|nl|ca|co\.jp|in|ae|sa)$/;

function hostMatch(host, h) {
  return host === h || host.endsWith('.' + h);
}

function decode(s) {
  try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; }
}

export function cleanUrl(raw) {
  const m = /^(https?:\/\/)([^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(raw);
  if (!m) return { original: raw, cleaned: raw, removed: [], warnings: [], site: null };
  let [, scheme, host, path, query = '', hash = ''] = m;
  const removed = [];
  const warnings = [];
  const lhost = host.toLowerCase();

  // Yönlendirme sarmalayıcıları (l.facebook.com/l.php?u=..., google.com/url?q=...) -> asıl link
  const wrapped = REDIRECTS.find(([h, p]) => hostMatch(lhost, h) && p.test(path));
  if (wrapped) {
    for (const part of query.slice(1).split('&')) {
      const [k, ...v] = part.split('=');
      if (wrapped[2].includes(k) && /^https?%3A|^https?:/i.test(v.join('='))) {
        const inner = cleanUrl(decode(v.join('=')));
        inner.original = raw;
        inner.removed.unshift('yönlendirme sarmalayıcısı');
        return inner;
      }
    }
  }

  let site = SITES.find((s) => s.hosts.some((h) => hostMatch(lhost, h)));
  const params = query.slice(1).split('&').filter(Boolean);
  let kept = [];

  if (AMAZON.test(lhost)) {
    site = { name: 'Amazon' };
    const asin = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i.exec(path);
    if (asin) {
      if (path !== `/dp/${asin[1]}`) removed.push('ürün adı / yönlendirme yolu');
      path = `/dp/${asin[1]}`;
    }
    for (const p of params) removed.push(decode(p.split('=')[0]));
  } else {
    for (const p of params) {
      const key = decode(p.split('=')[0]);
      const k = key.toLowerCase();
      const drop = site ? !site.keep.includes(k) : isGeneric(k);
      if (drop) removed.push(key);
      else kept.push(p);
    }
    // Amazon tarzı ".../ref=xxx" yolu
    const ref = /\/ref=[^/]*$/.exec(path);
    if (ref && !site) { path = path.slice(0, ref.index); removed.push('ref'); }
  }

  // X/Twitter, mobil alt alan adını kaldır
  if (site && site.name === 'X / Twitter' && /^mobile\./i.test(host)) host = host.replace(/^mobile\./i, '');
  if (site && site.name === 'Facebook' && /^(m|mbasic|web)\./i.test(host)) host = 'www.facebook.com';

  // Takip içeren hash parçaları
  if (/^#(echobox|xtor|at_medium|utm_)/i.test(hash)) { removed.push(hash); hash = ''; }

  for (const [hre, name, pre] of SHORT) {
    if (hre.test(lhost) && (!pre || pre.test(path))) {
      warnings.push(`${name} kısa paylaşım linki: içindeki kod paylaşan hesabı gösterebilir ve internetsiz açılamaz. Linki tarayıcıda açıp adres çubuğundaki tam adresi tekrar temizleyin.`);
      break;
    }
  }

  const cleaned = scheme + host + path + (kept.length ? '?' + kept.join('&') : '') + hash;
  return { original: raw, cleaned, removed, warnings, site: site ? site.name : null };
}

const URL_RE = new RegExp('\\bhttps?:\\/\\/[^\\s<>"\'`{}|\\\\^\\u00a0\\u2000-\\u200f\\u2028-\\u202f\\u3000]+', 'gi');

// Metindeki tüm linkleri ve görünmez karakterleri temizler.
export function cleanText(input, { strict = false } = {}) {
  const inv = cleanInvisible(input, { strict });
  const links = [];
  const text = inv.text.replace(URL_RE, (u) => {
    // Sondaki noktalama işaretleri linkin parçası değil
    const tail = /[.,;:!?)\]>»"'’]+$/.exec(u);
    let trail = '';
    if (tail) {
      trail = tail[0];
      u = u.slice(0, -trail.length);
      const opens = (u.match(/\(/g) || []).length, closes = (u.match(/\)/g) || []).length;
      if (trail.startsWith(')') && opens > closes) { u += ')'; trail = trail.slice(1); }
    }
    const r = cleanUrl(u);
    links.push(r);
    return r.cleaned + trail;
  });
  return { text, links, invisibleRemoved: inv.removed, spacesNormalized: inv.spaces };
}
