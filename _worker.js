// Cloudflare Pages worker: gives each shared Sureo link its own WhatsApp / social preview.
// It runs ONLY for /l/... (listings) and /s/... (shops); see _routes.json. If anything fails,
// it falls back to the normal page, so links never break.
const SB = 'https://dgzltdkaumkprxijuoqv.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnemx0ZGthdW1rcHJ4aWp1b3F2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4OTc2OTksImV4cCI6MjEwOTQ3MzY5OX0.rDMF7Dwp3QddBoXzhBFDn_QWI5k-j2o9sRAqtHmntuQ';
const TYPES = { sell: 'For sale', rent: 'For rent', trade: 'Swap / trade', free: 'Free' };
const TIERS = { trusted: 'Trusted seller', verified: 'Verified seller', new: 'New seller' };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const naira = (k) => (k > 0 ? '\u20A6' + Math.round(k / 100).toLocaleString('en-US') : 'Free');

async function rpc(name, body) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 3000);
  try {
    const r = await fetch(SB + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    return r.ok ? await r.json() : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function asset(env, origin, path) {
  let r = await env.ASSETS.fetch(new Request(origin + path));
  if (r.status >= 300 && r.status < 400) {
    const loc = r.headers.get('Location');
    if (loc) r = await env.ASSETS.fetch(new Request(new URL(loc, origin)));
  }
  return r;
}

function withTags(html, url, title, desc, image) {
  const tags =
    '<meta name="description" content="' + esc(desc) + '">' +
    '<meta property="og:site_name" content="Sureo">' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:url" content="' + esc(url) + '">' +
    '<meta property="og:title" content="' + esc(title) + '">' +
    '<meta property="og:description" content="' + esc(desc) + '">' +
    '<meta property="og:image" content="' + esc(image) + '">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:title" content="' + esc(title) + '">' +
    '<meta name="twitter:image" content="' + esc(image) + '">';
  return html
    .replace(/<meta property="og:[^>]*>\s*/g, '')
    .replace(/<meta name="description"[^>]*>\s*/g, '')
    .replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(title) + '</title>')
    .replace('</head>', tags + '</head>');
}

function htmlResponse(html) {
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' } });
}

async function listingPage(env, url, key) {
  const base = await asset(env, url.origin, '/listing');
  const l = await rpc('public_listing', { p_id: key });
  if (!l || !l.id) return base;
  const img = (l.media || []).find((m) => m.kind === 'image');
  const title = l.title + ' \u00B7 ' + naira(l.price_kobo);
  const desc = [TYPES[l.type] || 'For sale', l.condition, 'by ' + l.seller + ' (' + (TIERS[l.tier] || 'seller') + ')', 'Buy safely on Sureo']
    .filter(Boolean).join(' \u00B7 ');
  return htmlResponse(withTags(await base.text(), url.origin + url.pathname, title, desc, img ? img.url : url.origin + '/icon-512.png'));
}

async function storePage(env, url, seg) {
  const base = await asset(env, url.origin, '/store');
  const key = seg.split('-').pop();
  if (!/^[0-9a-f]{8,36}$/i.test(key)) return base;
  const s = await rpc('public_store', { p_key: key });
  if (!s || !s.key) return base;
  const L = s.listings || [];
  const first = L.find((x) => x.img);
  const title = s.seller + '\u2019s shop on Sureo';
  const desc = L.length + ' active listing' + (L.length === 1 ? '' : 's') + ' \u00B7 ' + (TIERS[s.tier] || 'seller') + ' \u00B7 ' + s.handovers + ' confirmed handover' + (s.handovers === 1 ? '' : 's');
  return htmlResponse(withTags(await base.text(), url.origin + url.pathname, title, desc, first ? first.img : url.origin + '/icon-512.png'));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      const l = url.pathname.match(/^\/l\/([0-9a-f-]{8,36})\/?$/i);
      if (l) return await listingPage(env, url, l[1]);
      const s = url.pathname.match(/^\/s\/([^/]+)\/?$/);
      if (s) return await storePage(env, url, s[1]);
    } catch (e) {
      // fall through to the normal pages
    }
    return env.ASSETS.fetch(request);
  },
};
