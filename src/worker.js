// Cloudflare Worker : sert l'application (dossier public/) et relaie les appels
// Binance qui doivent être signés côté serveur (le navigateur ne peut pas les faire).
//
// Secrets à définir (npx wrangler secret put NOM) :
//   APP_TOKEN       mot de passe que l'app envoie pour utiliser le relais
//   BINANCE_KEY     clé API Binance (lecture seule)
//   BINANCE_SECRET  secret de la clé API Binance
//   EB_APP_ID       identifiant de l'application Enable Banking
//   EB_PRIVATE_KEY  contenu du fichier .pem Enable Banking

import { handleBank } from './eb.js';

export { SyncRoom } from './sync.js';

const HOSTS = ['https://api-gcp.binance.com', 'https://api.binance.com','https://api1.binance.com', 'https://api2.binance.com', 'https://api3.binance.com'];
const STABLES = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD', 'DAI'];
const enc = new TextEncoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Retour de la banque après validation : on renvoie vers l'app avec le code.
    if (url.pathname === '/bank/callback') {
      return Response.redirect(`${url.origin}/?bank_cb=1&${url.searchParams}`, 302);
    }
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (!(await authorized(request, env, url))) return json({ error: 'Mot de passe du relais incorrect.' }, 401);
      if (url.pathname === '/api/ping') {
        return json({ ok: true, binance: Boolean(env.BINANCE_KEY && env.BINANCE_SECRET), bank: Boolean(env.EB_APP_ID && env.EB_PRIVATE_KEY) });
      }
      if (url.pathname === '/api/binance') return json(await binanceHoldings(env));
      // Données synchronisées + boîte de dépôt + direct : gérés par le Durable Object.
      const room = { '/api/state': '/state', '/api/inbox': '/inbox', '/api/live': '/live' }[url.pathname];
      if (room) {
        const stub = env.SYNC.get(env.SYNC.idFromName('main'));
        const target = new URL(room + url.search, 'https://sync');
        return stub.fetch(new Request(target, request));
      }
      if (url.pathname.startsWith('/api/bank/')) return json(await handleBank(request, env, url));
      return json({ error: 'Route inconnue' }, 404);
    } catch (e) {
      return json({ error: e.message || String(e) }, e.status || 500);
    }
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// Mot de passe : en-tête Authorization, ou paramètre ?token= (WebSocket, qui n'accepte pas d'en-tête).
async function authorized(request, env, url) {
  if (!env.APP_TOKEN) throw Object.assign(new Error('Relais non configuré : secret APP_TOKEN manquant.'), { status: 500 });
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || '';
  const a = enc.encode(given);
  const b = enc.encode(env.APP_TOKEN);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}

const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function binanceFetch(path, init) {
  let lastErr;
  for (const host of HOSTS) {
    const res = await fetch(host + path, init);
    if (res.ok) return res.json();
    const raw = await res.text();
    let body = {};
    try { body = JSON.parse(raw); } catch { /* page HTML de pare-feu */ }
    if (res.status === 451 || res.status === 403 || res.status >= 500) {
      const why = body.msg || raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
      console.log('[diag binance]', host, res.status, why);
      lastErr = new Error(`Binance refuse la connexion depuis Cloudflare (${res.status}) ${why}`.trim());
      continue;
    }
    const msg = body.code === -2015 || body.code === -2014
      ? 'Clé API Binance refusée (clé, secret ou restriction IP).'
      : body.code === -1021
        ? 'Horloge décalée par rapport à Binance, réessaie.'
        : `Erreur Binance ${res.status} : ${body.msg || 'inconnue'}`;
    throw Object.assign(new Error(msg), { status: 502 });
  }
  throw Object.assign(lastErr || new Error('Binance injoignable'), { status: 502 });
}

async function binanceSigned(env, path, params = {}) {
  if (!env.BINANCE_KEY || !env.BINANCE_SECRET) {
    throw Object.assign(new Error('Clés Binance non configurées sur le relais.'), { status: 500 });
  }
  // Heure du serveur Binance : évite les refus si l'horloge locale dérive.
  const { serverTime } = await binanceFetch('/api/v3/time').catch(() => ({ serverTime: Date.now() }));
  const qs = new URLSearchParams({ ...params, recvWindow: '10000', timestamp: String(serverTime) }).toString();
  const key = await crypto.subtle.importKey('raw', enc.encode(env.BINANCE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = hex(await crypto.subtle.sign('HMAC', key, enc.encode(qs)));
  return binanceFetch(`${path}?${qs}&signature=${sig}`, { headers: { 'X-MBX-APIKEY': env.BINANCE_KEY } });
}

async function binanceHoldings(env) {
  const [account, tickers] = await Promise.all([
    binanceSigned(env, '/api/v3/account', { omitZeroBalances: 'true' }),
    binanceFetch('/api/v3/ticker/price'),
  ]);
  const px = new Map(tickers.map((t) => [t.symbol, parseFloat(t.price)]));
  const eurUsdt = px.get('EURUSDT');
  const usdtEur = eurUsdt ? 1 / eurUsdt : null;
  const btcEur = px.get('BTCEUR') ?? (px.get('BTCUSDT') && usdtEur ? px.get('BTCUSDT') * usdtEur : null);

  const eurPrice = (asset) => {
    if (asset === 'EUR') return 1;
    if (STABLES.includes(asset)) return px.has(`${asset}USDT`) && usdtEur ? px.get(`${asset}USDT`) * usdtEur : usdtEur;
    if (px.has(`${asset}EUR`)) return px.get(`${asset}EUR`);
    if (px.has(`${asset}USDT`) && usdtEur) return px.get(`${asset}USDT`) * usdtEur;
    if (px.has(`${asset}USDC`) && usdtEur) return px.get(`${asset}USDC`) * usdtEur;
    if (px.has(`${asset}BTC`) && btcEur) return px.get(`${asset}BTC`) * btcEur;
    return null;
  };

  const merged = new Map();
  for (const b of account.balances || []) {
    const qty = parseFloat(b.free) + parseFloat(b.locked);
    if (!qty) continue;
    let asset = b.asset;
    // Actifs « LD… » = Simple Earn flexible affiché en spot (sauf vrais tickers comme LDO).
    if (asset.startsWith('LD') && asset.length > 2 && eurPrice(asset) == null) asset = asset.slice(2);
    merged.set(asset, (merged.get(asset) || 0) + qty);
  }

  const holdings = [];
  let totalEur = 0;
  for (const [asset, qty] of merged) {
    const priceEur = eurPrice(asset);
    const valueEur = priceEur == null ? null : qty * priceEur;
    if (valueEur != null) totalEur += valueEur;
    holdings.push({ asset, qty, priceEur, valueEur });
  }
  holdings.sort((a, b) => (b.valueEur ?? -1) - (a.valueEur ?? -1));
  return { updatedAt: new Date().toISOString(), totalEur: Math.round(totalEur * 100) / 100, holdings };
}
