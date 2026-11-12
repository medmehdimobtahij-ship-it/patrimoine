// Client Enable Banking (open banking DSP2) pour le Worker.
// Secrets : EB_APP_ID (identifiant de l'application) et EB_PRIVATE_KEY (contenu du fichier .pem).

const EB = 'https://api.enablebanking.com';
const enc = new TextEncoder();

const b64url = (bytes) => {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlJson = (o) => b64url(enc.encode(JSON.stringify(o)));

function derLen(n) {
  if (n < 128) return [n];
  const out = [];
  while (n) { out.unshift(n & 255); n >>= 8; }
  return [0x80 | out.length, ...out];
}
const tlv = (tag, bytes) => [tag, ...derLen(bytes.length), ...bytes];

// Clé « BEGIN RSA PRIVATE KEY » (PKCS#1) -> PKCS#8, seul format accepté par WebCrypto.
function pkcs1ToPkcs8(pk1) {
  const algo = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  return new Uint8Array(tlv(0x30, [0x02, 0x01, 0x00, ...algo, ...tlv(0x04, [...pk1])]));
}

export function pemToPkcs8(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return /BEGIN RSA PRIVATE KEY/.test(pem) ? pkcs1ToPkcs8(der) : der;
}

let keyCache = { pem: null, key: null };

export async function ebJwt(env, now = Math.floor(Date.now() / 1000)) {
  if (!env.EB_APP_ID || !env.EB_PRIVATE_KEY) {
    throw Object.assign(new Error('Banques non configurées sur le relais (EB_APP_ID / EB_PRIVATE_KEY).'), { status: 500 });
  }
  if (keyCache.pem !== env.EB_PRIVATE_KEY) {
    const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(env.EB_PRIVATE_KEY), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    keyCache = { pem: env.EB_PRIVATE_KEY, key };
  }
  const head = b64urlJson({ typ: 'JWT', alg: 'RS256', kid: env.EB_APP_ID.trim() });
  const body = b64urlJson({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600 });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyCache.key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

async function eb(env, path, init = {}) {
  const res = await fetch(EB + path, {
    ...init,
    headers: { authorization: `Bearer ${await ebJwt(env)}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { message: text.slice(0, 300) }; }
  if (!res.ok) {
    let msg = body.message || body.detail || body.error || `HTTP ${res.status}`;
    if (typeof msg !== 'string') msg = JSON.stringify(msg);
    throw Object.assign(new Error(`Enable Banking (${res.status}) : ${msg}`), { status: 502, ebStatus: res.status });
  }
  return body;
}

const MAX_CONSENT = 180 * 86400;

export async function handleBank(request, env, url) {
  const path = url.pathname.replace(/^\/api\/bank/, '');
  const input = request.method === 'POST' ? await request.json().catch(() => ({})) : {};

  if (path === '/aspsps') {
    const country = (url.searchParams.get('country') || 'FR').toUpperCase();
    const r = await eb(env, `/aspsps?country=${encodeURIComponent(country)}&psu_type=personal`);
    return (r.aspsps || []).map((a) => ({
      name: a.name, country: a.country, logo: a.logo, maxConsent: a.maximum_consent_validity || null,
    }));
  }

  if (path === '/auth') {
    if (!input.name || !input.country) throw Object.assign(new Error('Banque manquante'), { status: 400 });
    const seconds = Math.min(MAX_CONSENT, input.maxConsent || 90 * 86400);
    const validUntil = new Date(Date.now() + (seconds - 3600) * 1000).toISOString();
    const r = await eb(env, '/auth', {
      method: 'POST',
      body: JSON.stringify({
        access: { valid_until: validUntil },
        aspsp: { name: input.name, country: input.country },
        state: input.state || crypto.randomUUID(),
        redirect_url: `${url.origin}/bank/callback`,
        psu_type: 'personal',
      }),
    });
    return { url: r.url, validUntil };
  }

  if (path === '/session') {
    if (!input.code) throw Object.assign(new Error('Code d’autorisation manquant'), { status: 400 });
    const r = await eb(env, '/sessions', { method: 'POST', body: JSON.stringify({ code: input.code }) });
    const data = r.accounts_data || [];
    const accounts = (r.accounts || []).map((a) => {
      const acc = typeof a === 'string' ? data.find((d) => d.uid === a) || { uid: a } : a;
      return {
        uid: acc.uid,
        name: acc.name || acc.product || acc.details || '',
        iban: acc.account_id?.iban || acc.account_id?.other?.identification || '',
        currency: acc.currency || 'EUR',
        type: acc.cash_account_type || '',
      };
    });
    return { sessionId: r.session_id, aspsp: r.aspsp, validUntil: r.access?.valid_until, accounts };
  }

  if (path === '/sync') {
    const list = Array.isArray(input.accounts) ? input.accounts.slice(0, 10) : [];
    // Utilisateur présent devant l'app : la banque n'applique pas la limite des accès en arrière-plan.
    const psu = {
      'psu-ip-address': request.headers.get('cf-connecting-ip') || '',
      'psu-user-agent': request.headers.get('user-agent') || '',
    };
    if (!psu['psu-ip-address']) delete psu['psu-ip-address'];
    const results = await Promise.all(list.map(async ({ uid, dateFrom }) => {
      try {
        const bal = await eb(env, `/accounts/${encodeURIComponent(uid)}/balances`, { headers: psu });
        const transactions = [];
        let key = null;
        for (let page = 0; page < 40; page++) {
          const qs = new URLSearchParams({ date_from: dateFrom });
          if (key) qs.set('continuation_key', key);
          const r = await eb(env, `/accounts/${encodeURIComponent(uid)}/transactions?${qs}`, { headers: psu });
          transactions.push(...(r.transactions || []));
          key = r.continuation_key;
          if (!key) break;
        }
        return { uid, balances: bal.balances || [], transactions };
      } catch (e) {
        return { uid, error: e.message, ebStatus: e.ebStatus || null };
      }
    }));
    return { results };
  }

  throw Object.assign(new Error('Route bancaire inconnue'), { status: 404 });
}
