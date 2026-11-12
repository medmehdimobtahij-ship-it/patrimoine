import * as C from './core.js';
import { ICON_MAP, SVGS } from './icons.js';

/* ================================================================== */
/* Utilitaires d'affichage                                             */
/* ================================================================== */

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const qtyFmt = new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 6 });

// Icônes Lucide (via All SVG Icons), embarquées dans icons.js.
const svgIcon = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
const ico = (name) => svgIcon(SVGS[name] || '');
const ICONS = {
  wallet: ico('wallet'), pie: ico('chart-pie'), list: ico('list'), gear: ico('settings'), spark: ico('sparkles'),
  refresh: ico('refresh-cw'), eye: ico('eye'), eyeOff: ico('eye-off'), left: ico('chevron-left'), right: ico('chevron-right'), plus: ico('plus'),
};
// Pastille colorée avec l'icône d'une catégorie (repli sur l'emoji pour les catégories créées à la main).
const catSvg = (c) => { const n = ICON_MAP[c?.id] || ICON_MAP[c?.parent]; return n && SVGS[n] ? svgIcon(SVGS[n]) : null; };
const badge = (c, cls = '') => `<span class="cbadge ${cls}" style="--c:${c?.color || 'var(--muted)'}">${catSvg(c) || esc(c?.icon || '•')}</span>`;
// Montant « héros » : centimes plus petits, façon appli bancaire.
const moneyBig = (v, opt = {}) => {
  if (hidden()) return money(v);
  const s = eur.format(v).replace(/^-/, '−');
  const m = s.match(/^(.*?)(,\d{2})(\s*€)$/u);
  const sign = opt.sign && v > 0 ? '+' : '';
  return m ? `<span class="int">${sign}${m[1]}</span><span class="dec">${m[2]}${m[3]}</span>` : sign + s;
};


const TYPE_COLORS = { courant: '#5B8DEF', epargne: '#2FB67C', crypto: '#E0A526', invest: '#8E6CEF', autre: '#A3A9B5' };
const TYPE_GROUPS = { courant: 'Comptes courants', epargne: 'Épargne', crypto: 'Crypto', invest: 'Investissements', autre: 'Autres' };
const PALETTE = ['#5B8DEF', '#2FB67C', '#F08A4B', '#8E6CEF', '#E5577A', '#D9A020', '#2BB5C9', '#C26DD6', '#3FA0D9', '#8A94A6', '#EF6F6C', '#1F9D6B'];
const TITLES = { patrimoine: 'Patrimoine', depenses: 'Bilan', claude: 'Bilan Claude', operations: 'Opérations', reglages: 'Réglages' };
const BANK_SOURCES = new Set(['banque', 'releve', 'import', 'csv']);

const hidden = () => S.settings.hideAmounts;
const money = (v, opt = {}) => {
  if (hidden()) return '<span class="hidden-amount">•••• €</span>';
  const s = (opt.round ? eur0 : eur).format(v).replace(/^-/, '−');
  return opt.sign && v > 0 ? `+${s}` : s;
};

const ymNow = () => C.todayISO().slice(0, 7);
const toDate = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd || 1); };
const monthLabel = (ym) => toDate(ym).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const monthShort = (ym) => toDate(ym).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
const shortDate = (d) => toDate(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const dayLabel = (d) => {
  if (d === C.todayISO()) return "Aujourd'hui";
  if (d === C.addDays(C.todayISO(), -1)) return 'Hier';
  const opts = { weekday: 'long', day: 'numeric', month: 'long' };
  if (toDate(d).getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return toDate(d).toLocaleDateString('fr-FR', opts);
};
const ago = (ts) => {
  if (!ts) return 'jamais';
  const min = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (min < 1440) return `il y a ${Math.round(min / 60)} h`;
  return `il y a ${Math.round(min / 1440)} j`;
};
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

/* ================================================================== */
/* Stockage local (IndexedDB)                                          */
/* ================================================================== */

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('patrimoine', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
// Mode démo : ?demo dans l'adresse, ou toute copie publiée sur GitHub Pages. Données inventées, rien n'est enregistré.
const DEMO = new URLSearchParams(location.search).has('demo') || location.hostname.endsWith('github.io');

async function loadState() {
  if (DEMO) return (await import('./demo.js')).demoState();
  try {
    const db = await idb();
    const v = await new Promise((res, rej) => {
      const q = db.transaction('kv').objectStore('kv').get('state');
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    if (v) return C.migrate(v);
  } catch { /* stockage indisponible : état neuf */ }
  return C.defaultState();
}
async function writeLocal() {
  if (DEMO) return;
  const snapshot = JSON.parse(JSON.stringify(S));
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(snapshot, 'state');
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch { /* le cloud reste la référence */ }
}

/* ================================================================== */
/* État                                                                */
/* ================================================================== */

let S;
let tab = 'patrimoine';
const ui = {
  range: '6M',
  scope: 'total',
  period: 'mois',
  anchor: ymNow(),
  openCats: new Set(),
  ops: { q: '', account: null, cat: null, exact: false, label: null, from: null, to: null, todo: false },
  opsLimit: 150,
  draft: null,
};
const clientId = C.uid();

const catById = (id) => S.categories.find((c) => c.id === id);
const accById = (id) => S.accounts.find((a) => a.id === id);
const linkFor = (accountId) => S.bank.links.find((l) => l.accountId === accountId);
const visibleCats = () => S.categories.filter((c) => !c.system);
const fiatAccounts = () => S.accounts.filter((a) => a.type !== 'crypto');
const todoCount = () => S.transactions.filter((t) => !t.categoryId && C.isSpendingAccount(S, t.accountId)).length;
const cryptoAccount = () => S.accounts.find((a) => a.type === 'crypto' && /binance/i.test(`${a.institution} ${a.name}`)) || S.accounts.find((a) => a.type === 'crypto');
const isEmptyState = (s) => !s.transactions.length && !s.bank.links.length && !Object.keys(s.crypto).length && s.accounts.every((a) => !a.openingBalance);

/* ================================================================== */
/* Synchronisation : enregistrement, cloud, temps réel                 */
/* ================================================================== */

let saveTimer;
let cloudTimer;
let dirty = false;
const cloud = { at: null, error: null, live: false };

async function saveNow() {
  clearTimeout(saveTimer);
  dirty = false;
  S.updatedAt = Date.now();
  await writeLocal();
  scheduleCloud();
}
function save() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}
function commit() { save(); render(); }

const authHeaders = () => ({ authorization: `Bearer ${S.settings.apiToken}`, 'content-type': 'application/json' });

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, { method, headers: authHeaders(), body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  let data = {};
  try { data = await res.json(); } catch { data = { error: `Réponse invalide (${res.status})` }; }
  if (!res.ok) throw Object.assign(new Error(data.error || `Erreur ${res.status}`), { status: res.status });
  return data;
}

function scheduleCloud(delay = 600) {
  if (!S.settings.apiToken) return;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(cloudPush, delay);
}

async function adoptRemote(remote) {
  const token = S.settings.apiToken;
  S = C.migrate(remote.data);
  S.updatedAt = remote.updatedAt;
  S.settings.apiToken = token;
  await writeLocal();
  applyTheme();
  if (sheetOpen) refreshSheetSafe(); else render();
}

async function cloudPush() {
  clearTimeout(cloudTimer);
  cloudTimer = null;
  // Une app vide (nouvel appareil) n'écrase jamais le cloud.
  if (!S.settings.apiToken || isEmptyState(S)) return;
  try {
    const d = await api(`/api/state?client=${clientId}`, { method: 'PUT', body: { updatedAt: S.updatedAt || Date.now(), data: S } });
    if (d.stored === false && d.data) await adoptRemote(d);
    cloud.at = new Date().toISOString();
    cloud.error = null;
  } catch (e) {
    cloud.error = e.message;
  }
  paintStatus();
}

async function cloudPull() {
  if (!S.settings.apiToken) return;
  try {
    const d = await api('/api/state');
    const local = S.updatedAt || 0;
    const remoteEmpty = !d.data || isEmptyState(C.migrate(d.data));
    const localEmpty = isEmptyState(S);
    cloud.at = new Date().toISOString();
    cloud.error = null;
    if (remoteEmpty && localEmpty) return paintStatus();
    if (!remoteEmpty && (localEmpty || d.updatedAt > local)) await adoptRemote(d);
    else if (remoteEmpty || d.updatedAt < local) await cloudPush();
  } catch (e) {
    cloud.error = e.message;
    if (e.status === 401) onBadToken();
    return paintStatus();
  }
  await pullInbox();
  paintStatus();
}

// Ajouts déposés depuis l'extérieur (comptes, opérations, règles).
async function pullInbox() {
  if (!S.settings.apiToken || isEmptyState(S)) return;
  try {
    const { items } = await api('/api/inbox');
    if (!items?.length) return;
    const done = [];
    for (const it of items) done.push(...C.mergeInboxItem(S, it));
    await saveNow();
    await api('/api/inbox', { method: 'DELETE', body: { ids: items.map((x) => x.id) } });
    render();
    if (done.length) toast(`Ajouté : ${done.join(', ')}`);
  } catch { /* nouvel essai au prochain signal */ }
}

// Connexion en direct : le serveur prévient dès qu'un autre appareil modifie les données.
let ws = null;
let wsBackoff = 1000;
let wsPing = null;
function connectLive() {
  if (!S.settings.apiToken || document.hidden) return;
  if (ws && ws.readyState <= 1) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/api/live?token=${encodeURIComponent(S.settings.apiToken)}&client=${clientId}`);
  ws.onopen = () => {
    cloud.live = true;
    wsBackoff = 1000;
    clearInterval(wsPing);
    wsPing = setInterval(() => { if (ws?.readyState === 1) ws.send('ping'); }, 25000);
    paintStatus();
    cloudPull(); // rattrape ce qui a pu changer pendant la coupure
  };
  ws.onmessage = (e) => {
    if (e.data === 'pong') return;
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === 'state' && m.origin !== clientId && m.updatedAt > (S.updatedAt || 0)) cloudPull();
    if (m.type === 'inbox') pullInbox();
  };
  ws.onclose = () => {
    cloud.live = false;
    clearInterval(wsPing);
    paintStatus();
    if (!document.hidden) setTimeout(connectLive, wsBackoff);
    wsBackoff = Math.min(wsBackoff * 2, 30000);
  };
  ws.onerror = () => { try { ws.close(); } catch { /* déjà fermé */ } };
}

/* ================================================================== */
/* Données externes : Binance et banques                               */
/* ================================================================== */

let refreshing = 0;
function busy(delta) {
  refreshing = Math.max(0, refreshing + delta);
  $('#btn-refresh')?.classList.toggle('spin', refreshing > 0);
}

async function syncBinance({ silent = true } = {}) {
  if (!S.settings.apiToken || !cryptoAccount()) return;
  busy(1);
  try {
    const data = await api('/api/binance');
    const acc = cryptoAccount();
    if (!acc) return;
    const prev = S.crypto[acc.id];
    data.savedAt = prev?.savedAt || 0;
    S.crypto[acc.id] = data;
    C.recordCryptoSnapshot(S, acc.id, data.totalEur);
    // On n'envoie au cloud que si la valeur a bougé, ou toutes les 10 min.
    if (!prev || Math.abs((prev.totalEur || 0) - data.totalEur) >= 0.01 || Date.now() - data.savedAt > 600e3) {
      data.savedAt = Date.now();
      save();
    }
    if (sheetOpen) refreshSheetSafe(); else render();
    if (!silent) toast(`Binance à jour${hidden() ? '' : ` : ${eur.format(data.totalEur)}`}`);
  } catch (e) {
    if (!silent) toast(e.message);
  } finally {
    busy(-1);
  }
}

const banksStale = (minutes) => S.bank.links.some((l) => !l.lastSyncAt || Date.now() - new Date(l.lastSyncAt).getTime() > minutes * 60e3);

async function syncBanks({ silent = true } = {}) {
  if (!S.bank.links.length || !S.settings.apiToken) return;
  busy(1);
  const today = C.todayISO();
  const req = (l, short) => ({ uid: l.uid, dateFrom: l.lastSync && !short ? C.addDays(l.lastSync, -10) : C.addDays(today, short ? -89 : -365) });
  try {
    let { results } = await api('/api/bank/sync', { method: 'POST', body: { accounts: S.bank.links.map((l) => req(l)) } });
    const retry = results.filter((r) => r.error && !S.bank.links.find((l) => l.uid === r.uid)?.lastSync);
    if (retry.length) {
      const again = await api('/api/bank/sync', { method: 'POST', body: { accounts: retry.map((r) => req(S.bank.links.find((l) => l.uid === r.uid), true)) } });
      results = results.map((r) => again.results.find((x) => x.uid === r.uid) || r);
    }
    let added = 0;
    const errors = [];
    for (const r of results) {
      const link = S.bank.links.find((l) => l.uid === r.uid); // relu après l'attente : l'état a pu être remplacé
      if (!link) continue;
      if (r.error) {
        link.error = r.ebStatus === 401 || r.ebStatus === 403 || /expired|consent|session/i.test(r.error) ? 'Accès expiré : renouvelle-le' : r.error;
        errors.push(link.aspsp);
        continue;
      }
      const imp = C.buildBankImport(S, link.accountId, link.uid, r.transactions || []);
      S.transactions.push(...imp.items);
      added += imp.items.length;
      const bal = C.pickBalanceInfo(r.balances);
      link.lastBalance = bal?.value ?? null;
      link.pending = imp.stats.pendingSum;
      link.pendingTx = imp.stats.pendingItems || [];
      if (bal) C.alignBalance(S, link.accountId, bal.value, C.todayISO(), imp.stats.pendingSum, bal.booked);
      link.lastSync = today;
      link.lastSyncAt = new Date().toISOString();
      link.error = null;
    }
    save();
    if (sheetOpen) refreshSheetSafe(); else render();
    if (errors.length) toast(`Problème de synchro : ${[...new Set(errors)].join(', ')}`);
    else if (!silent || added) toast(added ? plural(added, 'nouvelle opération') : 'Banques à jour');
  } catch (e) {
    if (!silent) toast(e.message);
  } finally {
    busy(-1);
  }
}

async function refreshAll({ silent = true, banks = false } = {}) {
  if (!S.settings.apiToken) return;
  const jobs = [syncBinance({ silent })];
  if (banks || banksStale(30)) jobs.push(syncBanks({ silent }));
  await Promise.allSettled(jobs);
}

/* ================================================================== */
/* Graphiques                                                          */
/* ================================================================== */

// Une couleur distincte par compte (deux comptes de même couleur seraient indiscernables sur la courbe).
function accountColors() {
  // Palette validée (daltonisme) dans l'ordre fixe des comptes : la couleur suit le compte, jamais son rang.
  const out = {};
  S.accounts.forEach((a, i) => { out[a.id] = `var(--s${(i % 5) + 1})`; });
  return out;
}

// Données de la courbe selon le périmètre choisi : total, tous les comptes, ou un compte.
function chartData() {
  const today = C.todayISO();
  const first = C.firstDate(S);
  const days = RANGES[ui.range];
  let from = days ? C.addDays(today, -days) : first;
  if (from < first) from = first;
  const desktop = window.innerWidth >= 960;
  const dates = C.seriesDates(from, today, desktop ? 366 : 140);
  if (ui.scope !== 'total' && ui.scope !== 'all' && !accById(ui.scope)) ui.scope = 'total';
  let series;
  if (ui.scope === 'total') {
    const values = C.netWorthSeries(S, from, today, desktop ? 366 : 140).map((p) => p.value);
    series = [{ id: 'total', name: 'Patrimoine net', color: 'var(--chart-line)', values }];
  } else {
    const accs = ui.scope === 'all' ? S.accounts : [accById(ui.scope)];
    const colors = accountColors();
    series = accs.map((a) => ({ id: a.id, name: a.name, color: colors[a.id], values: C.accountSeries(S, a, dates) }))
      .filter((s) => ui.scope !== 'all' || s.values.some((v) => Math.abs(v) >= 0.5));
  }
  const sumAt = (i) => series.reduce((s, x) => s + x.values[i], 0);
  return { dates, series, start: C.round2(sumAt(0)), end: C.round2(sumAt(dates.length - 1)), from };
}

// Courbe lissée « monotone » (Fritsch–Carlson) : arrondie sans jamais dépasser les vraies valeurs.
function smoothPath(pts) {
  const n = pts.length;
  if (n < 3) return pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
  const m = [];
  for (let i = 0; i < n - 1; i++) m.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0] || 1));
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const dx = (x1 - x0) / 3;
    d += `C${(x0 + dx).toFixed(1)},${(y0 + t[i] * dx).toFixed(1)} ${(x1 - dx).toFixed(1)},${(y1 - t[i + 1] * dx).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

function niceTicks(min, max, count) {
  const raw = (max - min || 1) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const r = raw / mag;
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { lo, hi: hi === lo ? lo + step : hi, ticks };
}
const compactEur = (v) => {
  const a = Math.abs(v);
  if (a >= 1000) return `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: a >= 10000 ? 0 : 1 })} k€`;
  return `${(Math.round(v) || 0).toLocaleString('fr-FR')} €`;
};

// Dessine la courbe à la taille réelle du conteneur (textes nets, pas de déformation).
function drawChart() {
  const box = $('#chart-box');
  const cd = ui.chartData;
  if (!box || !cd) return;
  const W = box.clientWidth;
  if (!W) return;
  const desktop = W > 560;
  const H = desktop ? Math.round(Math.min(440, Math.max(340, window.innerHeight * 0.42))) : 260;
  if (cd.dates.length < 2 || !cd.series.length) {
    box.innerHTML = '<div class="empty small">Pas encore assez d’historique pour tracer une courbe.</div>';
    return;
  }
  const padL = hidden() ? 6 : desktop ? 62 : 46;
  const padR = 10;
  const padT = 12;
  const padB = 26;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const n = cd.dates.length;
  const all = cd.series.flatMap((s) => s.values);
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (cd.series.length > 1) min = Math.min(0, min);
  else { const p = (max - min) * 0.12 || Math.max(1, Math.abs(max) * 0.05); min -= p; max += p; }
  // Pas d'axe négatif si les valeurs ne passent jamais (vraiment) sous zéro.
  if (Math.min(...all) > -1 && min < 0) min = 0;
  const { lo, hi, ticks } = niceTicks(min, max, desktop ? 5 : 4);
  const x = (i) => padL + (i / (n - 1)) * iw;
  const y = (v) => padT + ih - ((v - lo) / (hi - lo)) * ih;

  const span = (toDate(cd.dates[n - 1]) - toDate(cd.dates[0])) / 864e5;
  const fmtX = (d) => toDate(d).toLocaleDateString('fr-FR', span <= 100 ? { day: 'numeric', month: 'short' } : { month: 'short', year: '2-digit' });
  const nx = Math.min(n, desktop ? 7 : 4);
  const xIdx = [...new Set(Array.from({ length: nx }, (_, j) => Math.round((j * (n - 1)) / (nx - 1))))];

  const grid = ticks.map((v) => `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>${hidden() ? '' : `<text class="axis" x="${padL - 8}" y="${y(v) + 4}" text-anchor="end">${esc(compactEur(v))}</text>`}`).join('');
  const xl = xIdx.map((i, j) => `<text class="axis" x="${x(i)}" y="${H - 6}" text-anchor="${j === 0 ? 'start' : j === xIdx.length - 1 ? 'end' : 'middle'}">${esc(fmtX(cd.dates[i]))}</text>`).join('');
  const single = cd.series.length === 1;
  const base = padT + ih;
  const paths = cd.series.map((s) => {
    const d = smoothPath(s.values.map((v, i) => [x(i), y(v)]));
    const area = single ? `<path class="area" d="${d}L${x(n - 1).toFixed(1)},${base}L${padL},${base}Z"/>` : '';
    return `${area}<path class="line" pathLength="1" d="${d}" fill="none" stroke="${s.color}" stroke-width="${single ? 2.6 : 2}" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join('');
  const dots = cd.series.map((s, k) => `<circle class="hover-dot" data-k="${k}" r="4.5" fill="${s.color}" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>`).join('');
  // Point du jour (courbe seule) : pastille + valeur.
  let end = '';
  if (single) {
    const ex = x(n - 1);
    const ey = y(cd.series[0].values[n - 1]);
    const txt = hidden() ? '' : eur0.format(cd.series[0].values[n - 1]);
    const tw = txt.length * 7.2 + 16;
    const ly = ey - 34 < padT ? ey + 14 : ey - 34;
    end = `<circle class="end-halo" cx="${ex}" cy="${ey}" r="11"/><circle class="end-dot" cx="${ex}" cy="${ey}" r="5"/>
      ${txt ? `<rect class="end-pill" x="${ex - tw}" y="${ly}" width="${tw}" height="22" rx="11"/><text class="end-label" x="${ex - tw / 2}" y="${ly + 15}" text-anchor="middle">${esc(txt)}</text>` : ''}`;
  }

  box.innerHTML = `<svg width="${W}" height="${H}" class="chart-svg" role="img" aria-label="Évolution">
    ${grid}${xl}<line class="baseline" x1="${padL}" x2="${W - padR}" y1="${base}" y2="${base}"/>${paths}${end}
    <line class="hover-line" x1="0" x2="0" y1="${padT}" y2="${padT + ih}" visibility="hidden"/>${dots}
    <rect x="${padL}" y="0" width="${iw}" height="${H}" fill="transparent" class="hit"/>
  </svg><div class="chart-tooltip" hidden></div>`;

  const svgEl = box.querySelector('svg');
  const tip = box.querySelector('.chart-tooltip');
  const line = box.querySelector('.hover-line');
  const dotEls = [...box.querySelectorAll('.hover-dot')];
  const hide = () => { line.setAttribute('visibility', 'hidden'); dotEls.forEach((d) => d.setAttribute('visibility', 'hidden')); tip.hidden = true; };
  // D'où vient la variation depuis le point précédent : discret, sous les valeurs.
  const ids = cd.series.map((s) => s.id === 'total' ? S.accounts.map((a) => a.id) : [s.id]).flat();
  const whyCache = new Map();
  const why = (i) => {
    if (i < 1) return '';
    if (whyCache.has(i)) return whyCache.get(i);
    const delta = C.round2(cd.series.reduce((t, s) => t + s.values[i] - s.values[i - 1], 0));
    let html = '';
    if (Math.abs(delta) >= 0.5) {
      const src = C.changeSources(S, ids, cd.dates[i - 1], cd.dates[i], { skipInternal: ui.scope === 'total' });
      const top = src.slice(0, 3);
      const rest = src.length - top.length;
      const oneDay = C.addDays(cd.dates[i - 1], 1) === cd.dates[i];
      html = `<div class="tt-why">
        <div class="tt-why-head"><span class="${delta > 0 ? 'pos' : 'neg'} num">${money(delta, { sign: true })}</span> ${oneDay ? 'sur la journée' : `depuis le ${esc(toDate(cd.dates[i - 1]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }))}`}</div>
        ${top.map((x) => `<div class="tt-src"><span>${esc(x.label)}</span><span class="num">${money(x.amount, { sign: true })}</span></div>`).join('')}
        ${rest > 0 ? `<div class="tt-src tt-more">+ ${rest} autre${rest > 1 ? 's' : ''}</div>` : ''}
      </div>`;
    }
    whyCache.set(i, html);
    return html;
  };
  const show = (e) => {
    const r = svgEl.getBoundingClientRect();
    const i = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left - padL) / iw)) * (n - 1));
    const px = x(i);
    line.setAttribute('x1', px);
    line.setAttribute('x2', px);
    line.setAttribute('visibility', 'visible');
    dotEls.forEach((dEl, k) => { dEl.setAttribute('cx', px); dEl.setAttribute('cy', y(cd.series[k].values[i])); dEl.setAttribute('visibility', 'visible'); });
    const rows = cd.series.map((s) => ({ s, v: s.values[i] })).sort((a, b) => b.v - a.v);
    tip.innerHTML = `<div class="tt-date">${esc(dayLabel(cd.dates[i]))}</div>
      ${rows.map(({ s, v }) => `<div class="tt-row"><i style="background:${s.color}"></i><span>${esc(s.name)}</span><strong class="num">${money(v)}</strong></div>`).join('')}
      ${rows.length > 1 ? `<div class="tt-row tt-total"><span>Total</span><strong class="num">${money(rows.reduce((t, r2) => t + r2.v, 0))}</strong></div>` : ''}
      ${why(i)}`;
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = `${px + 14 + tw > W ? px - tw - 14 : px + 14}px`;
    tip.style.top = `${padT}px`;
  };
  svgEl.addEventListener('pointermove', show);
  svgEl.addEventListener('pointerdown', show);
  svgEl.addEventListener('pointerleave', hide);
  svgEl.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') setTimeout(hide, 1800); });
}

function donut(segments, total) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  let cum = 0;
  const gap = segments.length > 1 ? 2 : 0;
  const arcs = segments.map((s) => {
    const frac = total ? s.value / total : 0;
    const arc = `<circle r="${r}" cx="70" cy="70" fill="none" stroke="${s.color}" stroke-width="18" stroke-dasharray="${Math.max(0, frac * circ - gap)} ${circ}" stroke-dashoffset="${-cum * circ}" transform="rotate(-90 70 70)"/>`;
    cum += frac;
    return arc;
  });
  return `<svg viewBox="0 0 140 140" width="170" height="170" aria-hidden="true"><circle r="${r}" cx="70" cy="70" fill="none" stroke="var(--surface-2)" stroke-width="18"/>${arcs.join('')}</svg>`;
}

/* ================================================================== */
/* Vues                                                                */
/* ================================================================== */

const RANGES = { '1M': 30, '3M': 91, '6M': 182, '1A': 365, Tout: null };

function accountSub(a) {
  const parts = [a.institution && a.institution !== a.name ? a.institution : C.TYPE_LABELS[a.type]];
  const link = linkFor(a.id);
  if (a.type === 'crypto') parts.push(S.crypto[a.id] ? `à jour ${ago(S.crypto[a.id].updatedAt)}` : 'en attente');
  else if (link) parts.push(link.error ? '⚠️ synchro en échec' : `à jour ${ago(link.lastSyncAt)}`);
  else parts.push('saisie manuelle');
  return parts.filter(Boolean).join(' · ');
}

function accountRow(a) {
  const bal = C.accountBalance(S, a);
  return `<li><button class="row" data-act="account" data-id="${a.id}">
    ${badge({ id: `t_${a.type}`, color: a.color || TYPE_COLORS[a.type] }, 'solid')}
    <span class="grow"><span class="title">${esc(a.name)}</span><span class="sub">${esc(accountSub(a))}</span></span>
    <span class="amt num ${bal < 0 ? 'neg' : ''}">${money(bal)}</span></button></li>`;
}

function viewPatrimoine() {
  const cd = chartData();
  ui.chartData = cd;
  const acc = accById(ui.scope);
  const current = acc ? C.accountBalance(S, acc) : C.netWorth(S);
  ui.heroValue = current;
  const delta = C.round2(current - cd.start);
  const pct = cd.start ? (delta / Math.abs(cd.start)) * 100 : 0;
  const scopeLabel = acc ? acc.name : ui.scope === 'all' ? 'Patrimoine net · par compte' : 'Patrimoine net';
  const colors = accountColors();
  const scopes = [['total', 'Total', null], ['all', 'Par compte', null], ...S.accounts.map((a) => [a.id, a.name, colors[a.id]])];

  const alloc = C.allocation(S);
  const positive = Object.entries(alloc).filter(([, v]) => v > 0);
  const posTotal = positive.reduce((s, [, v]) => s + v, 0);
  const groups = Object.keys(TYPE_GROUPS).map((type) => ({ type, accounts: S.accounts.filter((a) => a.type === type) })).filter((g) => g.accounts.length);

  const ca = cryptoAccount();
  const holdings = (ca && S.crypto[ca.id]?.holdings?.filter((h) => (h.valueEur ?? 0) >= 0.5)) || [];

  return `${!S.bank.links.length ? `<button class="banner" data-act="bank-pick">${ico('landmark')} Connecte tes banques pour suivre tes comptes automatiquement</button>` : ''}
  <div class="card hero">
    <div class="hero-top">
      <div>
        <div class="label">${esc(scopeLabel)}</div>
        <div class="big num">${moneyBig(current)}</div>
        <div class="delta ${delta >= 0 ? 'pos' : 'neg'} num">${hidden() ? '&nbsp;' : `${delta >= 0 ? '▲' : '▼'} ${money(Math.abs(delta))}${cd.start > 0 && Math.abs(cd.start) >= Math.abs(current) * 0.1 ? ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1).replace('.', ',')} %)` : ''} <span class="muted" style="font-weight:500">${ui.range === 'Tout' ? `depuis le ${esc(shortDate(cd.from))}` : `sur ${ui.range}`}</span>`}</div>
      </div>
      <div class="segmented ranges">${Object.keys(RANGES).map((r) => `<button data-act="range" data-r="${r}" class="${r === ui.range ? 'on' : ''}">${r}</button>`).join('')}</div>
    </div>
    <div class="chips scope-chips">${scopes.map(([id, name, color]) => `<button class="chip ${ui.scope === id ? 'on' : ''}" data-act="scope" data-id="${id}">${color ? `<i class="sw" style="background:${color}"></i>` : ''}${esc(name)}</button>`).join('')}</div>
    <div id="chart-box" class="chart-box"></div>
  </div>
  <div class="layout"><div class="col-main">
  <div class="card">
    <div class="card-head"><h2>Comptes</h2><button class="link-btn" data-act="new-account">+ Ajouter</button></div>
    ${posTotal > 0 ? `<div class="alloc">${positive.map(([t, v]) => `<span style="width:${(v / posTotal) * 100}%;background:${TYPE_COLORS[t] || '#999'}"></span>`).join('')}</div>` : ''}
    ${groups.map((g) => {
      const sub = g.accounts.reduce((s, a) => s + C.accountBalance(S, a), 0);
      return `<div class="group-head"><span><i style="background:${TYPE_COLORS[g.type]}"></i>${esc(TYPE_GROUPS[g.type])}</span><span class="num">${money(sub)}${posTotal > 0 && sub > 0 && !hidden() ? ` <span class="muted">· ${Math.round((sub / posTotal) * 100)} %</span>` : ''}</span></div>
        <ul class="list">${g.accounts.map(accountRow).join('')}</ul>`;
    }).join('')}
  </div>
  </div><div class="col-side">
  ${holdings.length ? `<div class="card">
    <div class="card-head"><h2>${esc(ca.name)}</h2><span class="muted small">${esc(ago(S.crypto[ca.id].updatedAt))}</span></div>
    ${holdings.slice(0, 8).map((h) => `<div class="holding"><span><strong>${esc(h.asset)}</strong> <span class="muted num">${hidden() ? '' : qtyFmt.format(h.qty)}</span></span><span class="num">${money(h.valueEur)}</span></div>`).join('')}
  </div>` : ''}
  </div></div>`;
}

/* --- Bilan --- */

const PERIODS = { mois: 'Mois', '3m': '3 mois', '12m': '12 mois', annee: 'Année' };
const NONE = { id: '_none', name: 'Non classé', icon: '❔', color: 'var(--s-other)' };
const catOrNone = (id) => (id === '_none' ? NONE : catById(id) || NONE);
// Nom complet « Voyages › Avion ».
const catPath = (id) => {
  const c = catById(id);
  if (!c) return '';
  const p = c.parent && catById(c.parent);
  return p ? `${p.name} › ${c.name}` : c.name;
};

function periodRange() {
  const a = ui.anchor;
  const y = Number(a.slice(0, 4));
  if (ui.period === '3m') return { from: C.addMonths(a, -2), to: a };
  if (ui.period === '12m') return { from: C.addMonths(a, -11), to: a };
  if (ui.period === 'annee') {
    const end = `${y}-12`;
    return { from: `${y}-01`, to: end > ymNow() ? ymNow() : end, year: y };
  }
  return { from: a, to: a };
}
const shortYm = (ym) => `${monthShort(ym)} ${ym.slice(2, 4)}`;
function periodLabel(r) {
  if (ui.period === 'mois') return monthLabel(r.from);
  if (ui.period === 'annee') return String(r.year);
  return `${shortYm(r.from)} → ${shortYm(r.to)}`;
}

function deltaBadge(cur, prev, higherIsGood) {
  // Pas de comparaison si la période précédente est quasi vide (pourcentage sans intérêt).
  if (!prev || hidden() || Math.abs(prev) < Math.abs(cur) * 0.2) return '';
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.5) return '<span class="kd muted">= période préc.</span>';
  const good = higherIsGood ? pct > 0 : pct < 0;
  return `<span class="kd ${good ? 'pos' : 'neg'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)} %</span>`;
}

function treeRows(nodes, total, kind) {
  return nodes.map((node) => {
    const c = catOrNone(node.id);
    const multi = node.subs.length > 1 || (node.subs.length === 1 && node.subs[0].id !== node.id);
    const open = ui.openCats.has(`${kind}:${node.id}`);
    const pct = total ? Math.round((node.amount / total) * 100) : 0;
    return `<li class="tree ${open ? 'open' : ''}">
      <button class="row" data-act="${multi ? 'toggle-cat' : 'cat-ops'}" data-id="${node.id}" data-k="${kind}">
        ${badge(c)}
        <span class="grow"><span class="title">${esc(c.name)} <span class="muted small" style="font-weight:500">${pct} %</span></span>
          <span class="bar"><span style="width:${total ? (node.amount / total) * 100 : 0}%;background:${c.color}"></span></span></span>
        <span class="amt num ${kind === 'rev' ? 'pos' : ''}">${money(node.amount)}</span>
        ${multi ? `<span class="chev">${ICONS.right}</span>` : ''}
      </button>
      ${open ? `<ul class="subs">${node.subs.map((s) => {
        const sc = s.id === node.id ? { name: 'Sans précision', icon: '·' } : catOrNone(s.id);
        return `<li><button class="row" data-act="cat-ops" data-id="${s.id}" data-exact="1">
          ${badge({ ...sc, color: sc.color || c.color }, 'sm')}
          <span class="grow"><span class="title">${esc(sc.name)}</span>
            <span class="bar thin"><span style="width:${node.amount ? (s.amount / node.amount) * 100 : 0}%;background:${c.color}"></span></span></span>
          <span class="amt num">${money(s.amount)}</span></button></li>`;
      }).join('')}
        <li><button class="link-btn" data-act="cat-ops" data-id="${node.id}">Voir toutes les opérations ${esc(c.name)} ›</button></li></ul>` : ''}
    </li>`;
  }).join('');
}

const groupInfo = (id) => C.GROUPS.find((g) => g.id === id) || C.GROUPS[C.GROUPS.length - 1];

// Grands groupes dépliables : groupe → catégories (avec le détail des sous-catégories).
function groupRows(groups, total) {
  return groups.map((g) => {
    const info = groupInfo(g.id);
    const open = ui.openCats.has(`grp:${g.id}`);
    const pct = total ? Math.round((g.amount / total) * 100) : 0;
    return `<li class="tree ${open ? 'open' : ''}">
      <button class="row" data-act="toggle-cat" data-id="${g.id}" data-k="grp">
        ${badge(info)}
        <span class="grow"><span class="title">${esc(info.name)} <span class="muted small" style="font-weight:500">${pct} %</span></span>
          <span class="bar"><span style="width:${total ? (g.amount / total) * 100 : 0}%;background:${info.color}"></span></span></span>
        <span class="amt num">${money(g.amount)}</span><span class="chev">${ICONS.right}</span>
      </button>
      ${open ? `<ul class="subs">${g.cats.map((c) => {
        const cat = catOrNone(c.id);
        const detail = c.subs.filter((s) => s.id !== c.id || c.subs.length > 1).map((s) => `${s.id === c.id ? 'Autre' : catOrNone(s.id).name} ${hidden() ? '' : eur0.format(s.amount)}`).join(' · ');
        return `<li><button class="row" data-act="cat-ops" data-id="${c.id}">
          ${badge(cat, 'sm')}
          <span class="grow"><span class="title">${esc(cat.name)}</span>
            ${detail ? `<span class="sub">${esc(detail)}</span>` : ''}
            <span class="bar thin"><span style="width:${g.amount ? (c.amount / g.amount) * 100 : 0}%;background:${info.color}"></span></span></span>
          <span class="amt num">${money(c.amount)}</span></button></li>`;
      }).join('')}</ul>` : ''}
    </li>`;
  }).join('');
}

function monthColumns(p) {
  const max = Math.max(1, ...p.perMonth.map((m) => Math.max(m.expense, m.income)));
  const legend = C.GROUPS.filter((g) => p.byCat.some((c) => C.groupOf(c.id) === g.id));
  const cols = p.perMonth.map((m, idx) => {
    const byGroup = {};
    for (const [id, v] of Object.entries(m.byRoot)) { const gid = C.groupOf(id); byGroup[gid] = (byGroup[gid] || 0) + v; }
    const segs = C.GROUPS.map((g) => ({ v: byGroup[g.id] || 0, color: g.color }));
    const tip = hidden() ? monthLabel(m.ym) : `${monthLabel(m.ym)} — dépenses ${eur.format(m.expense)}, revenus ${eur.format(m.income)}`;
    return `<button class="mcol" style="--i:${idx}" data-act="goto-month" data-ym="${m.ym}" title="${esc(tip)}">
      <span class="mval num">${hidden() ? '' : esc(compactEur(m.expense))}</span>
      <span class="marea">
        <span class="mstack" style="height:${(m.expense / max) * 100}%">${segs.filter((s) => s.v > 0).map((s) => `<i style="flex:${s.v};background:${s.color}"></i>`).join('')}</span>
        <span class="minc" style="height:${(m.income / max) * 100}%"></span>
      </span>
      <span class="mlabel">${esc(monthShort(m.ym))}</span></button>`;
  }).join('');
  return `<div class="mbars">${cols}</div>
    <div class="legend" style="margin-top:10px">${legend.map((c) => `<span><i style="background:${c.color}"></i>${esc(c.name)}</span>`).join('')}<span><i style="background:var(--pos)"></i>Revenus</span></div>`;
}

function viewBilan() {
  const r = periodRange();
  const p = C.periodStats(S, r.from, r.to);
  const len = p.months.length;
  const prev = C.periodStats(S, C.addMonths(r.from, -len), C.addMonths(r.from, -1));
  const atEnd = r.to >= ymNow();
  const rate = p.savingsRate;
  const rec = C.recurring(S, r.to > ymNow() ? ymNow() : r.to);
  const recTotal = rec.reduce((s, x) => s + x.monthly, 0);
  const maxMerchant = p.merchants[0]?.amount || 1;
  const avg = len > 1 ? p.expense / len : null;

  return `
  <div class="period-bar">
    <div class="segmented">${Object.entries(PERIODS).map(([k, l]) => `<button data-act="period" data-p="${k}" class="${ui.period === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="month-nav">
      <button class="icon-btn" data-act="period-nav" data-d="-1" aria-label="Période précédente">${ICONS.left}</button>
      <strong>${esc(periodLabel(r))}</strong>
      <button class="icon-btn" data-act="period-nav" data-d="1" aria-label="Période suivante" ${atEnd ? 'disabled' : ''}>${ICONS.right}</button>
    </div>
  </div>
  ${p.uncategorized ? `<button class="banner" data-act="todo-period">${ico('inbox')} ${plural(p.uncategorized, 'opération')} à classer sur cette période</button>` : ''}
  <div class="kpis four">
    <div class="kpi"><div class="k">Revenus</div><div class="v num pos">${money(p.income, { round: true })}</div>${deltaBadge(p.income, prev.income, true)}</div>
    <div class="kpi"><div class="k">Dépenses</div><div class="v num">${money(p.expense, { round: true })}</div>${deltaBadge(p.expense, prev.expense, false)}</div>
    <div class="kpi"><div class="k">Épargne</div><div class="v num ${p.net < 0 ? 'neg' : ''}">${money(p.net, { round: true, sign: true })}</div>${avg != null && !hidden() ? `<span class="kd muted">${esc(eur0.format(avg))} dépensés / mois</span>` : ''}</div>
    <div class="kpi"><div class="k">Taux d’épargne</div><div class="v num ${rate != null && rate < 0 ? 'neg' : ''}">${rate == null || hidden() ? '—' : `${Math.round(rate * 100)} %`}</div>${rate != null && !hidden() ? `<span class="rate-bar"><span style="width:${Math.max(0, Math.min(100, rate * 100))}%"></span></span>` : ''}</div>
  </div>

  <div class="layout"><div class="col-main">
    <div class="card">
      <div class="card-head"><h2>Où va ton argent</h2><span class="muted small hint">touche un groupe pour le détail</span></div>
      ${p.byCat.length ? (() => {
        const groups = C.groupTree(p.byCat);
        return `<div class="donut-wrap">${donut(groups.map((g) => ({ value: Math.max(0, g.amount), color: groupInfo(g.id).color })), p.expense)}<div class="donut-center"><div class="muted small">Dépenses</div><div class="v num">${money(p.expense, { round: true })}</div></div></div>
      <ul class="list">${groupRows(groups, p.expense)}</ul>`;
      })() : `<div class="empty"><div class="e-icon">${ico('receipt')}</div>Aucune dépense sur cette période.</div>`}
    </div>
    ${len > 1 ? `<div class="card"><div class="card-head"><h2>Mois par mois</h2><span class="muted small hint">touche un mois pour l’ouvrir</span></div>${monthColumns(p)}</div>` : ''}
  </div><div class="col-side">
    ${p.byIncome.length ? `<div class="card"><h2>Revenus</h2><ul class="list">${treeRows(p.byIncome, p.income, 'rev')}</ul></div>` : ''}
    ${p.merchants.length ? `<div class="card"><h2>Principaux commerçants</h2><ul class="list">${p.merchants.slice(0, 8).map((m) => {
      const c = catOrNone(m.categoryId ? C.rootOf(S, m.categoryId) : '_none');
      return `<li><button class="row" data-act="merchant-ops" data-q="${esc(m.name)}">${badge(c)}
        <span class="grow"><span class="title">${esc(m.name)} <span class="muted small" style="font-weight:500">${m.count}×</span></span>
          <span class="bar thin"><span style="width:${(m.amount / maxMerchant) * 100}%;background:${c.color}"></span></span></span>
        <span class="amt num">${money(m.amount)}</span></button></li>`;
    }).join('')}</ul></div>` : ''}
    ${rec.length ? `<div class="card"><div class="card-head"><h2>Dépenses récurrentes</h2><span class="muted small num">≈ ${money(recTotal, { round: true })} / mois</span></div>
      <ul class="list">${rec.slice(0, 10).map((x) => {
        const c = catOrNone(x.categoryId || '_none');
        return `<li><button class="row" data-act="merchant-ops" data-q="${esc(x.name)}">${badge(c)}
          <span class="grow"><span class="title">${esc(x.name)}</span><span class="sub">${x.months} mois sur 6 · ${esc(catPath(x.categoryId) || 'Non classé')}</span></span>
          <span class="amt num">${money(x.monthly)}<span class="muted small"> /mois</span></span></button></li>`;
      }).join('')}</ul></div>` : ''}
    ${p.byLabel.length ? `<div class="card"><h2>Par label</h2><ul class="list">${p.byLabel.map((l) => `<li><button class="row" data-act="label-ops" data-l="${esc(l.id)}">
      ${badge({ id: 'ui_tag', color: 'var(--muted)' })}<span class="grow title">#${esc(l.id)}</span><span class="amt num">${money(l.amount)}</span></button></li>`).join('')}</ul></div>` : ''}
  </div></div>`;
}

/* --- Opérations --- */

function filteredOps() {
  const f = ui.ops;
  const q = C.norm(f.q);
  return S.transactions
    .filter((t) => {
      if (f.account && t.accountId !== f.account) return false;
      if (f.from && t.date.slice(0, 7) < f.from) return false;
      if (f.to && t.date.slice(0, 7) > f.to) return false;
      if (f.todo && t.categoryId) return false;
      if (f.cat) {
        if (f.cat === '_none') { if (t.categoryId) return false; }
        else {
          const ids = t.splits?.length ? t.splits.map((p) => p.categoryId) : [t.categoryId];
          if (!ids.some((id) => (f.exact ? id === f.cat : id === f.cat || C.rootOf(S, id) === f.cat))) return false;
        }
      }
      if (f.label && !(t.labels || []).includes(f.label)) return false;
      if (q) {
        const hay = C.norm(`${C.displayName(t)} ${t.label} ${t.note || ''} ${(t.labels || []).join(' ')} ${catPath(t.categoryId)} ${Math.abs(t.amount).toFixed(2).replace('.', ',')}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
}

function opRow(t) {
  const c = catById(t.categoryId);
  const subs = [esc(accById(t.accountId)?.name || '?')];
  if (t.splits?.length) subs.push(`<span class="tag">Ventilée · ${t.splits.length} parts</span>`);
  else if (c) subs.push(esc(catPath(t.categoryId)));
  if (t.labels?.length) subs.push(t.labels.map((l) => `#${esc(l)}`).join(' '));
  return `<li><button class="row" data-act="tx" data-id="${t.id}">
    ${badge(c || NONE)}
    <span class="grow"><span class="title">${esc(C.displayName(t))}</span>
      <span class="sub">${subs.join(' · ')}${c ? '' : ' <span class="tag todo-tag">À classer</span>'}</span></span>
    <span class="amt num ${t.amount > 0 ? 'pos' : ''} ${C.txKind(S, t) === 'neutre' && c ? 'faded' : ''}">${money(t.amount, { sign: true })}</span>
  </button></li>`;
}

function viewOperations() {
  const f = ui.ops;
  const list = filteredOps();
  const shown = list.slice(0, ui.opsLimit);
  const todo = todoCount();
  const parts = [];
  let lastDay = null;
  for (const t of shown) {
    if (t.date !== lastDay) {
      if (lastDay) parts.push('</ul>');
      parts.push(`<div class="day-head">${esc(dayLabel(t.date))}</div><ul class="list card day-card">`);
      lastDay = t.date;
    }
    parts.push(opRow(t));
  }
  if (lastDay) parts.push('</ul>');
  // Opérations en attente à la banque (pas encore validées) : affichées en tête.
  const q = C.norm(f.q);
  const pend = f.todo || f.cat || f.label ? [] : C.pendingTx(S)
    .filter((t) => (!f.account || t.accountId === f.account) && (!q || C.norm(`${t.label} ${Math.abs(t.amount).toFixed(2).replace('.', ',')}`).includes(q)))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const pendingHtml = pend.length ? `<div class="day-head">En attente de validation</div><ul class="list card day-card pending">${pend.map((t) => {
    const c = catById(t.categoryId);
    return `<li class="row">${badge(c || NONE)}<span class="grow"><span class="title">${esc(C.prettyLabel(t.label))}</span>
      <span class="sub">${esc(accById(t.accountId)?.name || '?')} · ${esc(dayLabel(t.date))} <span class="tag">En attente</span></span></span>
      <span class="amt num ${t.amount > 0 ? 'pos' : ''}">${money(t.amount, { sign: true })}</span></li>`;
  }).join('')}</ul>` : '';
  const total = C.round2(list.reduce((s, t) => s + t.amount, 0));
  const hasFilter = f.account || f.cat || f.label || f.from || f.todo || f.q;
  const catName = f.cat && (f.cat === '_none' ? 'Non classé' : catPath(f.cat));
  const range = f.from ? (f.from === f.to ? monthLabel(f.from) : `${shortYm(f.from)} → ${shortYm(f.to)}`) : '';
  return `
  <input class="search" id="ops-search" type="search" placeholder="Rechercher un nom, un montant, une catégorie…" value="${esc(f.q)}" autocomplete="off">
  <div class="chips">
    <button class="chip ${f.todo ? 'on' : ''}" data-act="f-todo">À classer${todo ? ` · ${todo}` : ''}</button>
    ${fiatAccounts().map((a) => `<button class="chip ${f.account === a.id ? 'on' : ''}" data-act="f-account" data-id="${a.id}">${esc(a.name)}</button>`).join('')}
    ${range ? `<button class="chip on" data-act="f-clear" data-k="range">${esc(range)} ✕</button>` : ''}
    ${catName ? `<button class="chip on" data-act="f-clear" data-k="cat">${esc(catName)} ✕</button>` : ''}
    ${f.label ? `<button class="chip on" data-act="f-clear" data-k="label">#${esc(f.label)} ✕</button>` : ''}
  </div>
  ${hasFilter && list.length ? `<p class="muted small" style="margin:0 2px 4px">${plural(list.length, 'opération')} · total <span class="num">${money(total, { sign: true })}</span></p>` : ''}
  ${pendingHtml}${list.length ? parts.join('') : `<div class="empty"><div class="e-icon">${S.transactions.length ? ico('search') : ico('landmark')}</div>${S.transactions.length ? 'Aucune opération ne correspond.' : 'Tes opérations apparaîtront ici dès qu’une banque sera connectée.'}</div>`}
  ${list.length > ui.opsLimit ? `<button class="btn" style="margin-top:14px" data-act="more">Afficher plus (${list.length - ui.opsLimit})</button>` : ''}`;
}

/* --- Bilan Claude --- */

const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const pctTxt = (v) => `${Math.round(v * 100)} %`;
const scoreColor = (v, max = 100) => (v / max >= 0.75 ? 'var(--pos)' : v / max >= 0.5 ? 'var(--warn)' : 'var(--neg)');

function ring(score) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 100 100" width="118" height="118" aria-hidden="true">
    <circle r="${r}" cx="50" cy="50" fill="none" stroke="var(--surface-2)" stroke-width="9"/>
    <circle r="${r}" cx="50" cy="50" fill="none" stroke="${scoreColor(score)}" stroke-width="9" stroke-linecap="round"
      stroke-dasharray="${(score / 100) * c} ${c}" transform="rotate(-90 50 50)"/></svg>`;
}

function gauge(value, target, label, sub) {
  const ratio = target ? Math.max(0, Math.min(1, value / target)) : 0;
  return `<div class="gauge"><div class="gauge-head"><span>${label}</span><strong class="num">${sub}</strong></div>
    <span class="gauge-bar"><span style="width:${ratio * 100}%;background:${scoreColor(ratio, 1)}"></span></span></div>`;
}

function viewClaude() {
  const a = C.analysis(S);
  const note = S.claudeNote;
  const bud = C.budgetStatus(S);
  const months = `${shortYm(a.from)} → ${shortYm(a.to)}`;
  const trend = (t) => (Math.abs(t) < 0.1 ? '<span class="muted">stable</span>' : `<span class="${t > 0 ? 'neg' : 'pos'}">${t > 0 ? '▲' : '▼'} ${Math.round(Math.abs(t) * 100)} %</span>`);
  const gainTotal = a.actions.reduce((s, x) => s + (x.gain || 0), 0);

  const noteCard = note ? `<div class="card claude-note">
      <div class="card-head"><h2>${ico('sparkles')} ${esc(note.title || 'Mon analyse')}</h2><span class="muted small">${esc(shortDate(note.date))}</span></div>
      ${(note.sections || []).map((s) => `${s.h ? `<h3 class="note-h">${esc(s.h)}</h3>` : ''}<p>${rich(s.p)}</p>`).join('')}
    </div>` : '';

  const actions = `<div class="card">
    <div class="card-head"><h2>Actions recommandées</h2>${gainTotal && !hidden() ? `<span class="muted small num">jusqu’à ${eur0.format(gainTotal)} / an</span>` : ''}</div>
    <ol class="actions">${a.actions.map((x) => `<li><div><strong>${esc(x.title)}</strong><p class="muted small">${esc(x.detail)}</p></div>
      ${x.gain && !hidden() ? `<span class="gain num">+${eur0.format(x.gain)}<small>/an</small></span>` : ''}</li>`).join('')}</ol>
  </div>`;

  const cats = `<div class="card">
    <div class="card-head"><h2>Dépenses moyennes par mois</h2><span class="muted small">12 mois · 3 derniers</span></div>
    <div class="ctable">
      <div class="ct-row ct-head"><span>Catégorie</span><span>Moyenne</span><span>Récemment</span><span>Tendance</span></div>
      ${a.categories.map((c) => {
        const cat = catOrNone(c.id);
        return `<button class="ct-row" data-act="cat-year" data-id="${c.id}"><span class="ct-name">${badge(cat, 'sm')}${esc(cat.name)}<span class="ct-share"><span style="width:${c.share * 100}%;background:${cat.color}"></span></span></span>
          <span class="num">${money(c.avg, { round: true })}</span><span class="num muted">${money(c.last3, { round: true })}</span><span class="num small">${trend(c.trend)}</span></button>`;
      }).join('')}
    </div></div>`;

  const deficits = a.deficits.length ? `<div class="card"><h2>Mois où tu as dépensé plus que gagné</h2><ul class="list">${a.deficits.map((d) => {
    const c = catOrNone(d.mainCat || '_none');
    return `<li><button class="row" data-act="goto-bilan-month" data-ym="${d.ym}">${badge(c)}
      <span class="grow"><span class="title" style="text-transform:capitalize">${esc(monthLabel(d.ym))}</span><span class="sub">surtout ${esc(c.name)} (${money(d.mainAmount, { round: true })})</span></span>
      <span class="amt num neg">−${money(d.gap, { round: true })}</span></button></li>`;
  }).join('')}</ul></div>` : '';

  const big = a.big.length ? `<div class="card"><h2>Grosses dépenses ponctuelles</h2><ul class="list">${a.big.map((b) => {
    const c = catOrNone(b.categoryId ? C.rootOf(S, b.categoryId) : '_none');
    return `<li><button class="row" data-act="tx" data-id="${b.id}">${badge(c)}
      <span class="grow"><span class="title">${esc(b.name)}</span><span class="sub">${esc(shortDate(b.date))} · ${esc(catPath(b.categoryId) || 'Non classé')}</span></span>
      <span class="amt num">${money(b.amount, { round: true })}</span></button></li>`;
  }).join('')}</ul></div>` : '';

  const scoreCard = `<div class="card score-card">
    <div class="score-top">${ring(a.score)}<div class="score-val"><span class="num" style="color:${scoreColor(a.score)}">${a.score}</span><small>/100</small></div>
      <div><h2>Santé financière</h2><p class="muted small">${a.score >= 75 ? 'Solide. Garde le cap.' : a.score >= 50 ? 'Correcte, avec des points à renforcer.' : 'Fragile : quelques changements feront une grosse différence.'}</p></div></div>
    ${a.parts.map((p) => `<div class="part"><span>${esc(p.key)}</span><span class="part-bar"><span style="width:${(p.pts / p.max) * 100}%;background:${scoreColor(p.pts, p.max)}"></span></span><span class="num small muted">${p.pts}/${p.max}</span></div>`).join('')}
  </div>`;

  const kpis = `<div class="card"><div class="card-head"><h2>En moyenne chaque mois</h2><span class="muted small">${esc(months)}</span></div>
    <div class="mini-kpis">
      <div><span class="k">Revenus</span><strong class="num pos">${money(a.avgIncome, { round: true })}</strong></div>
      <div><span class="k">Dépenses</span><strong class="num">${money(a.avgExpense, { round: true })}</strong></div>
      <div><span class="k">Épargne</span><strong class="num ${a.avgSavings < 0 ? 'neg' : ''}">${money(a.avgSavings, { round: true, sign: true })}</strong></div>
      <div><span class="k">Taux d’épargne</span><strong class="num">${a.rate == null || hidden() ? '—' : pctTxt(a.rate)}</strong></div>
    </div></div>`;

  const safety = `<div class="card"><h2>Sécurité</h2>
    ${gauge(a.emergencyMonths || 0, 6, 'Matelas de sécurité (objectif 3 à 6 mois)', `${(a.emergencyMonths || 0).toFixed(1).replace('.', ',')} mois`)}
    ${gauge(a.bufferMonths || 0, 1, 'Trésorerie sur les comptes courants (objectif 1 mois)', `${(a.bufferMonths || 0).toFixed(1).replace('.', ',')} mois`)}
    ${gauge(1 - Math.min(1, a.cryptoShare / 0.4), 1, 'Part de crypto dans ton patrimoine (idéal ≤ 20 %)', pctTxt(a.cryptoShare))}
  </div>`;

  const budgets = `<div class="card"><div class="card-head"><h2>Budgets du mois</h2><button class="link-btn" data-act="budgets">${bud.length ? 'Modifier' : 'Définir'}</button></div>
    ${bud.length ? bud.map((b) => {
      const c = catOrNone(b.id);
      const color = b.ratio >= 1 ? 'var(--neg)' : b.pace > 1.1 ? 'var(--warn)' : 'var(--pos)';
      return `<div class="gauge"><div class="gauge-head"><span>${badge(c, 'sm')}${esc(c.name)}</span><strong class="num">${money(b.spent, { round: true })} <span class="muted">/ ${money(b.limit, { round: true })}</span></strong></div>
        <span class="gauge-bar"><span style="width:${Math.min(1, b.ratio) * 100}%;background:${color}"></span></span>
        ${b.ratio >= 1 ? '<span class="small neg">Budget dépassé</span>' : b.pace > 1.1 ? '<span class="small" style="color:var(--warn)">En avance sur le rythme du mois</span>' : ''}</div>`;
    }).join('') : '<p class="muted small">Fixe un plafond mensuel par catégorie pour suivre tes dépenses au fil du mois.</p>'}
  </div>`;

  const rec = a.recurring.length ? `<div class="card"><div class="card-head"><h2>Charges récurrentes</h2><span class="muted small num">${money(a.recurring.reduce((s, x) => s + x.monthly, 0), { round: true })} / mois</span></div>
    <ul class="list">${a.recurring.slice(0, 8).map((x) => `<li class="row"><span class="grow"><span class="title">${esc(x.name)}</span><span class="sub">${esc(catPath(x.categoryId) || 'Non classé')} · ${money(x.monthly * 12, { round: true })} / an</span></span><span class="amt num">${money(x.monthly, { round: true })}</span></li>`).join('')}</ul></div>` : '';

  const avoid = a.avoidable.length ? `<div class="card"><div class="card-head"><h2>Dépenses évitables</h2><span class="muted small num">${money(a.avoidable.reduce((s, x) => s + x.total, 0), { round: true })} / an</span></div>
    <ul class="list">${a.avoidable.map((x) => `<li class="row"><span class="grow title">${esc(x.name)}</span><span class="amt num">${money(x.total, { round: true })}</span></li>`).join('')}</ul></div>` : '';

  const loans = a.loans.length ? `<div class="card"><h2>Prêts & avances</h2><ul class="list">${a.loans.map((l) => `<li class="row"><span class="grow"><span class="title">${esc(l.name)}</span><span class="sub">${l.notes?.length ? `${esc(l.notes.join(' · '))} · ` : ''}avancé ${money(l.lent, { round: true })} · rendu ou dû ${money(l.back, { round: true })}</span></span>
    <span class="amt num ${l.owed > 0 ? 'pos' : 'neg'}">${l.owed > 0 ? 'te doit ' : 'tu dois '}${money(Math.abs(l.owed), { round: true })}</span></li>`).join('')}</ul></div>` : '';

  const proj = `<div class="card"><h2>Dans 12 mois</h2>
    <div class="proj"><div><span class="k">Aujourd’hui</span><strong class="num">${money(a.projection.now, { round: true })}</strong></div><span class="arrow">→</span>
      <div><span class="k">Au rythme actuel</span><strong class="num">${money(a.projection.in12, { round: true })}</strong></div>
      ${a.shopGain ? `<div><span class="k">Avec le shopping à 150 €/mois</span><strong class="num pos">${money(a.projection.in12Better, { round: true })}</strong></div>` : ''}</div>
    <p class="muted small" style="margin:8px 0 0">Projection simple : épargne moyenne des 12 derniers mois, sans rendement ni variation de la crypto.</p></div>`;

  const quality = `<div class="card"><h2>Fiabilité de ce bilan</h2><ul class="dots">
    <li>${a.uncategorized ? `<strong>${plural(a.uncategorized, 'opération')}</strong> encore à classer : <button class="link-btn" data-act="goto-todo">les classer</button>` : 'Toutes les opérations sont classées.'}</li>
    <li>Le compte d’épargne Revolut n’est pas transmis par la banque : s’il contient de l’argent, ton patrimoine est sous-estimé.</li>
    <li>Le Livret A est saisi à la main : pense à mettre son solde à jour de temps en temps.</li></ul></div>`;

  // Sur mobile, le score et les moyennes passent en tête (copie masquée sur grand écran).
  return `<div class="layout"><div class="col-main"><div class="mobile-only">${scoreCard}${kpis}</div>${noteCard}${actions}${cats}${deficits}${big}</div>
    <div class="col-side"><div class="desktop-only">${scoreCard}${kpis}</div>${budgets}${safety}${proj}${rec}${avoid}${loans}${quality}</div></div>`;
}

function budgetsSheet() {
  const a = C.analysis(S);
  const avg = new Map(a.categories.map((c) => [c.id, c.avg]));
  const roots = visibleCats().filter((c) => !c.parent && c.kind === 'depense');
  return `<h3>Budgets mensuels</h3>
  <p class="muted small" style="margin-top:-8px">Laisse vide pour ne pas suivre une catégorie. La moyenne de tes 12 derniers mois est indiquée.</p>
  ${roots.map((c) => `<label class="budget-row">${badge(c)}
    <span class="grow"><span class="title">${esc(c.name)}</span><span class="sub">moyenne ${money(avg.get(c.id) || 0, { round: true })}/mois</span></span>
    <input class="input num" data-budget="${c.id}" inputmode="decimal" placeholder="—" value="${S.budgets[c.id] ? S.budgets[c.id] : ''}"></label>`).join('')}
  <button class="btn primary" data-act="save-budgets">Enregistrer</button>`;
}

function viewReglages() {
  const userRules = S.rules.filter((r) => !r.auto).length;
  const theme = S.settings.theme;
  return `<div class="settings-wrap">
  <div class="settings-group"><h4>Comptes</h4><div class="card"><ul class="list">${S.accounts.map(accountRow).join('')}
    <li><button class="row" data-act="new-account"><span class="grow title accent">+ Ajouter un compte</span></button></li></ul></div></div>

  <div class="settings-group"><h4>Banques</h4><div class="card"><ul class="list">
    ${S.bank.links.map((l) => {
      const dl = l.validUntil ? Math.floor((new Date(l.validUntil).getTime() - Date.now()) / 864e5) : null;
      return `<li><button class="row" data-act="bank"><span class="grow"><span class="title">${esc(l.aspsp)}</span>
        <span class="sub">${l.error ? `<span class="neg">${esc(l.error)}</span>` : `${esc(accById(l.accountId)?.name || '?')} · à jour ${esc(ago(l.lastSyncAt))}`}${dl != null ? ` · accès ${dl < 0 ? '<span class="neg">expiré</span>' : `${dl} j`}` : ''}</span></span><span class="muted">›</span></button></li>`;
    }).join('')}
    <li><button class="row" data-act="bank-pick"><span class="grow title accent">+ Connecter une banque</span></button></li>
  </ul></div></div>

  <div class="settings-group"><h4>Classement</h4><div class="card"><ul class="list">
    <li><button class="row" data-act="categories"><span class="grow title">Catégories</span><span class="muted">${visibleCats().length} ›</span></button></li>
    <li><button class="row" data-act="labels"><span class="grow title">Labels</span><span class="muted">${S.labels.length} ›</span></button></li>
    <li><button class="row" data-act="rules"><span class="grow"><span class="title">Règles automatiques</span><span class="sub">${userRules} perso · ${S.rules.length - userRules} par défaut</span></span><span class="muted">›</span></button></li>
  </ul></div></div>

  <div class="settings-group"><h4>Apparence</h4><div class="card pad">
    <div class="segmented" style="margin:0">${[['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map(([k, l]) => `<button data-act="theme" data-t="${k}" class="${theme === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  </div></div>
  </div>
  <p class="muted small footer-note"><span class="dot ${cloud.live ? 'on' : ''}"></span>${cloud.live ? 'Synchronisé en direct' : cloud.error ? `Hors ligne : ${esc(cloud.error)}` : 'Connexion…'} · ${plural(S.transactions.length, 'opération')}</p>`;
}

function viewConnect() {
  return `<div class="card connect">
    <div class="e-icon">${ico('lock')}</div>
    <h2>Connecte cet appareil</h2>
    <p class="muted small">Ouvre le lien d’installation (QR code) sur cet appareil, ou saisis le mot de passe de ton relais.</p>
    <input class="input" id="connect-token" type="password" placeholder="Mot de passe" autocomplete="off">
    <button class="btn primary" data-act="connect" style="margin-top:10px">Se connecter</button>
  </div>`;
}

const VIEWS = { patrimoine: viewPatrimoine, depenses: viewBilan, claude: viewClaude, operations: viewOperations, reglages: viewReglages };

function render() {
  document.querySelectorAll('.tabbar button[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  document.body.dataset.view = tab;
  $('#title').textContent = TITLES[tab];
  $('#view').innerHTML = (S.settings.apiToken || DEMO) ? VIEWS[tab]() : viewConnect();
  $('#btn-eye').innerHTML = hidden() ? ICONS.eyeOff : ICONS.eye;
  const n = todoCount();
  $('#badge-todo').hidden = !n;
  $('#badge-todo').textContent = n > 99 ? '99+' : n;
  $('#fab').hidden = tab === 'reglages' || !(S.settings.apiToken || DEMO);
  paintStatus();
  if (tab === 'patrimoine') drawChart();
  // Animations d'entrée : seulement quand on arrive sur un écran, pas à chaque rafraîchissement.
  if (ui.animate) {
    ui.animate = false;
    const view = $('#view');
    view.classList.remove('animate');
    void view.offsetWidth; // relance l'animation
    view.classList.add('animate');
    clearTimeout(ui.animTimer);
    ui.animTimer = setTimeout(() => view.classList.remove('animate'), 1400);
    countUp();
  }
}

// Le grand montant défile jusqu'à sa valeur (façon appli bancaire).
function countUp() {
  const el = $('.hero .big');
  const target = ui.heroValue;
  if (!el || hidden() || target == null || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const final = el.innerHTML;
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 750);
    const ease = 1 - (1 - k) ** 3;
    if (k < 1) { el.innerHTML = moneyBig(target * ease); requestAnimationFrame(step); } else el.innerHTML = final;
  };
  requestAnimationFrame(step);
}

function paintStatus() {
  const el = $('#live');
  if (!el) return;
  el.classList.toggle('on', cloud.live);
  el.title = cloud.live ? 'Synchronisé en direct' : cloud.error ? `Hors ligne : ${cloud.error}` : 'Connexion…';
}

function go(t) {
  tab = t;
  ui.opsLimit = 150;
  ui.animate = true;
  render();
  window.scrollTo(0, 0);
}

/* ================================================================== */
/* Fenêtres (feuilles)                                                 */
/* ================================================================== */

let sheetOpen = false;
let sheetRender = null;
function openSheet(fn) {
  sheetRender = fn;
  $('#sheet-body').innerHTML = fn();
  $('#sheet').hidden = false;
  $('#backdrop').hidden = false;
  document.body.style.overflow = 'hidden';
  if (!sheetOpen) {
    history.pushState({ sheet: true }, '');
    sheetOpen = true;
    $('#sheet').scrollTop = 0;
  }
}
function refreshSheet() {
  if (!sheetOpen || !sheetRender) return;
  const sc = $('#sheet').scrollTop;
  const active = document.activeElement?.dataset?.f;
  $('#sheet-body').innerHTML = sheetRender();
  $('#sheet').scrollTop = sc;
  const el = active && $(`#sheet [data-f="${active}"]`);
  if (el) {
    el.focus();
    if (typeof el.value === 'string' && el.setSelectionRange && !['date', 'select-one'].includes(el.type)) {
      try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* pas de sélection */ }
    }
  }
}
// Rafraîchit une fenêtre suite à un changement extérieur, sans perturber une saisie en cours.
function refreshSheetSafe() {
  const a = document.activeElement;
  const typing = a && ['INPUT', 'TEXTAREA'].includes(a.tagName) && $('#sheet').contains(a);
  if (!typing && [accountSheet, bankSheet].includes(sheetRender)) refreshSheet();
}
function hideSheet() {
  $('#sheet').hidden = true;
  $('#backdrop').hidden = true;
  document.body.style.overflow = '';
  sheetRender = null;
  render();
}
function closeSheet() { if (sheetOpen) history.back(); }
window.addEventListener('popstate', () => { if (sheetOpen) { sheetOpen = false; hideSheet(); } });

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

const colorRow = (current) => `<div class="color-row">${PALETTE.map((c) => `<button data-act="pick-color" data-c="${c}" class="${c === current ? 'on' : ''}" style="background:${c}" aria-label="Couleur"></button>`).join('')}</div>`;
const typeSelect = (current) => `<select class="input" data-f="type">${Object.entries(C.TYPE_LABELS).map(([k, l]) => `<option value="${k}" ${k === current ? 'selected' : ''}>${l}</option>`).join('')}</select>`;

/* --- Opération --- */

function openTx(id) {
  const t = id ? S.transactions.find((x) => x.id === id) : null;
  const defAcc = ui.ops.account || fiatAccounts().find((a) => !linkFor(a.id))?.id || fiatAccounts()[0]?.id;
  const fromBank = !!t && BANK_SOURCES.has(t.source);
  ui.draft = t
    ? { id: t.id, fromBank, sign: t.amount < 0 ? -1 : 1, amount: String(Math.abs(t.amount)).replace('.', ','), raw: t.label, label: t.title || (fromBank ? '' : t.label), date: t.date, accountId: t.accountId, categoryId: t.categoryId, labels: [...(t.labels || [])], note: t.note || '', origCat: t.categoryId, newLabel: '', splits: t.splits || null }
    : { id: null, fromBank: false, sign: -1, amount: '', raw: '', label: '', date: C.todayISO(), accountId: defAcc, categoryId: null, labels: [], note: '', origCat: null, newLabel: '' };
  ui.draft.makeRule = !!t && !t.categoryId;
  ui.draft.ruleKw = C.suggestKeyword(ui.draft.raw || ui.draft.label);
  openSheet(txSheet);
  if (!t) setTimeout(() => $('#sheet [data-f="amount"]')?.focus(), 60);
}

function txSheet() {
  const d = ui.draft;
  const cat = catById(d.categoryId);
  const showRule = d.categoryId && d.categoryId !== d.origCat && (d.raw || d.label).trim() && !cat?.system;
  const want = d.sign < 0 ? 'depense' : 'revenu';
  const order = (c) => (c.kind === want ? 0 : c.kind === 'neutre' ? 2 : 1);
  const cats = visibleCats().filter((c) => !c.parent).sort((a, b) => order(a) - order(b));
  if (cat?.system) cats.push(cat);
  const root = d.categoryId ? C.rootOf(S, d.categoryId) : null;
  const kids = root ? C.childrenOf(S, root) : [];
  const amount = C.parseAmount(d.amount) || 0;

  const head = d.fromBank
    ? `<div class="tx-head">
        <div class="big num ${d.sign > 0 ? 'pos' : ''}">${moneyBig(d.sign * amount, { sign: true })}</div>
        <div class="muted small">${esc(dayLabel(d.date))} · ${esc(accById(d.accountId)?.name || '')}</div>
        <div class="raw">${esc(d.raw)}</div>
      </div>
      <label class="field"><span>Nom affiché</span><input class="input" data-f="label" value="${esc(d.label)}" placeholder="${esc(C.prettyLabel(d.raw))}" autocomplete="off"></label>`
    : `<div class="sign-toggle">
        <button class="dep ${d.sign < 0 ? 'on' : ''}" data-act="sign" data-s="-1">Dépense</button>
        <button class="rev ${d.sign > 0 ? 'on' : ''}" data-act="sign" data-s="1">Revenu</button>
      </div>
      <input class="input amount-input num ${d.sign < 0 ? 'neg' : 'pos'}" data-f="amount" inputmode="decimal" placeholder="0,00 €" value="${esc(d.amount)}" autocomplete="off">
      <label class="field"><span>Nom</span><input class="input" data-f="label" value="${esc(d.label)}" placeholder="Ex. Marché, espèces…" autocomplete="off"></label>
      <div class="two">
        <label class="field"><span>Date</span><input class="input" type="date" data-f="date" value="${esc(d.date)}"></label>
        <label class="field"><span>Compte</span><select class="input" data-f="accountId">${fiatAccounts().map((a) => `<option value="${a.id}" ${a.id === d.accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      </div>`;

  const splitBlock = d.splits?.length ? `<div class="field"><span>Ventilation</span></div>
    <div class="split-box">${d.splits.map((p) => {
      const c = catById(p.categoryId) || NONE;
      return `<div class="split-row">${badge(c, 'sm')}<div class="grow"><span class="title">${esc(catPath(p.categoryId) || 'Non classé')}</span>${p.note ? `<span class="sub">${esc(p.note)}</span>` : ''}</div><strong class="num">${money(p.amount)}</strong></div>`;
    }).join('')}
    <button class="link-btn neg" data-act="unsplit">Retirer la ventilation</button></div>` : '';
  return `<h3>${d.id ? (d.fromBank ? 'Opération' : 'Modifier l’opération') : 'Nouvelle opération'}</h3>
  ${head}${splitBlock}
  <div class="field"><span>Catégorie</span></div>
  <div class="cat-grid">${cats.map((c) => `<button class="cat-opt ${c.id === root ? 'on' : ''}" data-act="pick-cat" data-id="${c.id}">${badge(c)}<span>${esc(c.name)}</span></button>`).join('')}</div>
  ${kids.length ? `<div class="field"><span>Précision</span></div>
  <div class="chips wrap sub-picker">
    <button class="chip ${d.categoryId === root ? 'on' : ''}" data-act="pick-sub" data-id="${root}">Général</button>
    ${kids.map((k) => `<button class="chip ${d.categoryId === k.id ? 'on' : ''}" data-act="pick-sub" data-id="${k.id}">${esc(k.name)}</button>`).join('')}
  </div>` : ''}
  ${showRule ? `<label class="check"><input type="checkbox" data-f="makeRule" ${d.makeRule ? 'checked' : ''}>
    <span style="flex:1">Classer aussi en <strong>${esc(catPath(d.categoryId))}</strong> toutes les opérations contenant :
    <input class="input" data-f="ruleKw" value="${esc(d.ruleKw)}" autocomplete="off"></span></label>` : ''}
  <div class="field"><span>Labels</span></div>
  <div class="chips wrap">
    ${S.labels.map((l) => `<button class="chip ${d.labels.includes(l) ? 'on' : ''}" data-act="toggle-label" data-l="${esc(l)}">#${esc(l)}</button>`).join('')}
    <span class="chip-input"><input data-f="newLabel" placeholder="+ nouveau label" value="${esc(d.newLabel)}" autocomplete="off" aria-label="Nouveau label"></span>
  </div>
  <label class="field"><span>Note</span><textarea class="input" data-f="note" rows="2" placeholder="Facultatif">${esc(d.note)}</textarea></label>
  <button class="btn primary" data-act="save-tx">Enregistrer</button>
  ${d.id && !d.fromBank ? '<button class="btn danger" data-act="delete-tx">Supprimer</button>' : ''}`;
}

function saveTx() {
  const d = ui.draft;
  if (d.newLabel.trim()) A['add-label']();
  let msg = 'Enregistré';
  if (d.fromBank) {
    const t = S.transactions.find((x) => x.id === d.id);
    Object.assign(t, { categoryId: d.categoryId, labels: d.labels, note: d.note.trim() });
    if (d.label.trim()) t.title = d.label.trim(); else delete t.title;
  } else {
    const amount = C.parseAmount(d.amount);
    if (!amount) return toast('Indique un montant');
    const value = C.round2(Math.abs(amount) * d.sign);
    const label = d.label.trim() || catById(d.categoryId)?.name || 'Opération';
    if (d.id) Object.assign(S.transactions.find((x) => x.id === d.id), { amount: value, label, date: d.date, accountId: d.accountId, categoryId: d.categoryId, labels: d.labels, note: d.note.trim() });
    else S.transactions.push({ id: C.uid(), accountId: d.accountId, date: d.date, label, amount: value, categoryId: d.categoryId, labels: d.labels, note: d.note.trim(), source: 'manuel' });
  }
  if (d.makeRule && d.categoryId && d.categoryId !== d.origCat && d.ruleKw.trim()) {
    const rule = { id: C.uid(), pattern: d.ruleKw.trim(), categoryId: d.categoryId };
    S.rules.push(rule);
    const n = C.applyRuleToUncategorized(S, rule);
    msg = n ? `Règle créée · ${n > 1 ? `${n} autres opérations classées` : '1 autre opération classée'}` : 'Règle créée';
  }
  closeSheet();
  save();
  toast(msg);
}

/* --- Comptes --- */

function openAccount(id) {
  const a = accById(id);
  ui.draft = { ...a, balanceInput: String(C.accountBalance(S, a)).replace('.', ',') };
  openSheet(accountSheet);
}

function accountSheet() {
  const d = ui.draft;
  const a = accById(d.id);
  if (!a) return '<p>Compte supprimé.</p>';
  const bal = C.accountBalance(S, a);
  const link = linkFor(a.id);
  const nOps = S.transactions.filter((t) => t.accountId === a.id).length;
  const holdings = a.type === 'crypto' ? (S.crypto[a.id]?.holdings || []).filter((h) => (h.valueEur ?? 0) >= 0.01) : [];
  let body;
  if (a.type === 'crypto') {
    body = `${holdings.length ? `<div class="preview">${holdings.map((h) => `<div class="holding"><span><strong>${esc(h.asset)}</strong> <span class="muted num">${qtyFmt.format(h.qty)}</span></span><span class="num">${money(h.valueEur)}</span></div>`).join('')}</div>` : ''}
      <p class="muted small">Mis à jour automatiquement chaque minute quand l’app est ouverte.</p>`;
  } else if (link) {
    body = `<p class="muted small">Synchronisé avec ${esc(link.aspsp)} · ${esc(ago(link.lastSyncAt))}${link.error ? ` · <span class="neg">${esc(link.error)}</span>` : ''}</p>
      <button class="btn" data-act="acc-ops">Voir les ${nOps} opérations</button>`;
  } else {
    body = `<div class="field"><span>Mettre à jour le solde</span></div>
      <div class="two" style="grid-template-columns:1fr auto">
        <input class="input" data-f="balanceInput" inputmode="decimal" value="${esc(d.balanceInput)}" aria-label="Nouveau solde">
        <button class="btn" style="width:auto" data-act="adjust">Valider</button>
      </div>
      ${nOps ? `<button class="btn" style="margin-top:8px" data-act="acc-ops">Voir les ${nOps} opérations</button>` : ''}`;
  }
  return `<h3>${esc(a.name)}</h3>
  <div class="tx-head"><div class="big num">${moneyBig(bal)}</div></div>
  ${body}
  <hr class="sep">
  <label class="field"><span>Nom</span><input class="input" data-f="name" value="${esc(d.name)}"></label>
  <div class="two">
    <label class="field"><span>Établissement</span><input class="input" data-f="institution" value="${esc(d.institution || '')}"></label>
    <label class="field"><span>Type</span>${typeSelect(d.type)}</label>
  </div>
  ${colorRow(d.color)}
  <button class="btn primary" data-act="save-account">Enregistrer</button>
  <button class="btn danger" data-act="delete-account">Supprimer le compte</button>`;
}

function openNewAccount() {
  ui.draft = { name: '', institution: '', type: 'epargne', color: PALETTE[S.accounts.length % PALETTE.length], balanceInput: '' };
  openSheet(() => {
    const d = ui.draft;
    return `<h3>Nouveau compte</h3>
    <p class="muted small" style="margin-top:-8px">Pour un compte que la banque ne transmet pas (Livret A, PEA, espèces…). Les comptes bancaires se connectent depuis Réglages → Banques.</p>
    <label class="field"><span>Nom</span><input class="input" data-f="name" value="${esc(d.name)}" placeholder="Ex. LDDS, PEA…"></label>
    <div class="two">
      <label class="field"><span>Établissement</span><input class="input" data-f="institution" value="${esc(d.institution)}"></label>
      <label class="field"><span>Type</span>${typeSelect(d.type)}</label>
    </div>
    <label class="field"><span>Solde actuel (€)</span><input class="input" data-f="balanceInput" inputmode="decimal" value="${esc(d.balanceInput)}" placeholder="0,00"></label>
    ${colorRow(d.color)}
    <button class="btn primary" data-act="create-account">Créer le compte</button>`;
  });
}

/* --- Banques --- */

const last4 = (iban) => (iban ? `••${String(iban).replace(/\s/g, '').slice(-4)}` : '');

function bankSheet() {
  const byBank = new Map();
  for (const l of S.bank.links) { if (!byBank.has(l.aspsp)) byBank.set(l.aspsp, []); byBank.get(l.aspsp).push(l); }
  return `<h3>Banques connectées</h3>
  <p class="muted small" style="margin-top:-8px">Lecture seule via Enable Banking. Synchro automatique toutes les 30 minutes quand l’app est ouverte. L’accès se renouvelle dans l’appli de la banque tous les 180 jours.</p>
  ${[...byBank.entries()].map(([bank, ls]) => {
    const dl = ls[0].validUntil ? Math.floor((new Date(ls[0].validUntil).getTime() - Date.now()) / 864e5) : null;
    const warn = dl != null && dl < 10;
    return `<div class="card pad">
      <div class="card-head" style="margin-bottom:4px"><h2>${esc(bank)}</h2><span class="small ${warn ? 'neg' : 'muted'}">${dl == null ? '' : dl < 0 ? 'accès expiré' : `accès ${dl} j`}</span></div>
      ${ls.map((l) => `<div class="link-row">
        <div><span class="title">${esc(l.name || 'Compte')} <span class="muted small">${esc(last4(l.iban))}</span></span>
        <span class="sub">${l.error ? `<span class="neg">${esc(l.error)}</span>` : `${esc(ago(l.lastSyncAt))}${l.lastBalance != null ? ` · solde ${money(l.lastBalance)}` : ''}`}</span></div>
        <select class="input" data-link="${esc(l.uid)}" aria-label="Compte de l'app">
          ${fiatAccounts().map((a) => `<option value="${a.id}" ${a.id === l.accountId ? 'selected' : ''}>→ ${esc(a.name)}</option>`).join('')}
          <option value="__unlink">Délier</option></select></div>`).join('')}
      ${warn || ls.some((l) => l.error) ? `<button class="btn" style="margin-top:8px" data-act="bank-auth" data-name="${esc(bank)}" data-country="${esc(ls[0].country)}">Renouveler l’accès</button>` : ''}
    </div>`;
  }).join('')}
  ${S.bank.links.length ? '<button class="btn primary" data-act="bank-sync">Synchroniser maintenant</button>' : ''}
  <button class="btn ${S.bank.links.length ? '' : 'primary'}" data-act="bank-pick">+ Connecter une banque</button>`;
}

const COUNTRIES = [['FR', 'France'], ['LT', 'Lituanie (Revolut)'], ['IE', 'Irlande'], ['BE', 'Belgique'], ['DE', 'Allemagne'], ['ES', 'Espagne'], ['IT', 'Italie'], ['NL', 'Pays-Bas']];

function bankPickSheet() {
  const d = ui.draft;
  const q = C.norm(d.q || '');
  const fav = (a) => (/revolut|bnp/i.test(a.name) ? 0 : 1);
  const list = (d.aspsps || []).filter((a) => !q || C.norm(a.name).includes(q)).sort((a, b) => fav(a) - fav(b) || a.name.localeCompare(b.name));
  return `<h3>Choisir la banque</h3>
  <div class="two" style="grid-template-columns:1fr 1.3fr">
    <select class="input" data-f="country" data-bank-country>${COUNTRIES.map(([c, l]) => `<option value="${c}" ${c === d.country ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <input class="input" data-f="q" placeholder="Rechercher…" value="${esc(d.q || '')}" autocomplete="off">
  </div>
  <p class="muted small" style="margin:8px 0">${d.loading ? 'Chargement…' : d.error ? `<span class="neg">${esc(d.error)}</span>` : plural(list.length, 'banque')}</p>
  <ul class="list">${list.slice(0, 80).map((a) => `<li><button class="row" data-act="bank-auth" data-name="${esc(a.name)}" data-country="${esc(a.country)}" data-max="${a.maxConsent || ''}">
    ${a.logo ? `<img class="bank-logo" src="${esc(a.logo)}" alt="" width="34" height="34">` : badge({ id: 'ui_bank', color: 'var(--accent)' })}
    <span class="grow title">${esc(a.name)}</span><span class="muted">›</span></button></li>`).join('')}</ul>`;
}

async function loadAspsps() {
  const d = ui.draft;
  Object.assign(d, { loading: true, error: '' });
  refreshSheet();
  try { d.aspsps = await api(`/api/bank/aspsps?country=${d.country}`); } catch (e) { d.error = e.message; d.aspsps = []; }
  d.loading = false;
  refreshSheet();
}

async function startBankAuth(name, country, maxConsent) {
  toast(`Redirection vers ${name}…`);
  try {
    const state = C.uid();
    const r = await api('/api/bank/auth', { method: 'POST', body: { name, country, state, maxConsent: Number(maxConsent) || null } });
    S.bank.pending = { state, aspsp: name, country, validUntil: r.validUntil };
    await saveNow();
    await cloudPush();
    location.href = r.url;
  } catch (e) {
    toast(e.message);
  }
}

function guessAccountFor(acc, aspsp, used) {
  const isSaving = /livret|epargne|savings|ldd|pel\b/i.test(C.norm(`${acc.name} ${acc.type}`)) || acc.type === 'SVGS';
  const pool = fiatAccounts().filter((a) => !used.has(a.id));
  const bank = C.norm(aspsp).split(' ')[0];
  const same = pool.filter((a) => C.norm(`${a.institution} ${a.name}`).includes(bank));
  const pick = same.find((a) => (a.type === 'epargne') === isSaving) || same[0];
  return pick ? pick.id : '__new';
}

async function handleBankCallback() {
  const p = new URLSearchParams(location.search);
  if (!p.has('bank_cb')) return;
  history.replaceState(null, '', location.pathname);
  const pending = S.bank.pending;
  if (p.get('error')) return toast(`Connexion annulée (${p.get('error_description') || p.get('error')})`);
  if (!pending || pending.state !== p.get('state')) return toast('Retour de banque inattendu, recommence la connexion.');
  toast('Récupération des comptes…');
  try {
    const r = await api('/api/bank/session', { method: 'POST', body: { code: p.get('code') } });
    const used = new Set();
    const accounts = r.accounts.map((a) => {
      const target = guessAccountFor(a, pending.aspsp, used);
      if (target !== '__new') used.add(target);
      return { ...a, target };
    });
    ui.draft = { aspsp: r.aspsp?.name || pending.aspsp, country: r.aspsp?.country || pending.country, validUntil: r.validUntil || pending.validUntil, accounts };
    openSheet(bankMapSheet);
  } catch (e) {
    toast(e.message);
  }
}

function bankMapSheet() {
  const d = ui.draft;
  return `<h3>${esc(d.aspsp)} connecté ✅</h3>
  <p class="muted small" style="margin-top:-8px">Associe chaque compte bancaire à un compte de l’app.</p>
  ${d.accounts.length ? d.accounts.map((a, i) => `<label class="field"><span>${esc(a.name || 'Compte')} ${esc(last4(a.iban))}</span>
    <select class="input" data-map="${i}">
      ${fiatAccounts().map((x) => `<option value="${x.id}" ${x.id === a.target ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
      <option value="__new" ${a.target === '__new' ? 'selected' : ''}>+ Nouveau compte</option>
      <option value="__skip" ${a.target === '__skip' ? 'selected' : ''}>Ignorer</option></select></label>`).join('')
    : '<p>Aucun compte renvoyé par la banque.</p>'}
  <button class="btn primary" data-act="bank-map-save">Valider</button>`;
}

/* --- Catégories, labels, règles --- */

function categoriesSheet() {
  const groups = [['depense', 'Dépenses'], ['revenu', 'Revenus'], ['neutre', 'Hors budget (virements, épargne)']];
  const count = (id) => S.transactions.filter((t) => t.categoryId === id).length;
  return `<h3>Catégories</h3>
  ${groups.map(([k, l]) => `<div class="field"><span>${l}</span></div><ul class="list" style="margin-bottom:12px">${visibleCats().filter((c) => c.kind === k && !c.parent).map((c) => {
    const kids = C.childrenOf(S, c.id);
    const n = count(c.id) + kids.reduce((s, x) => s + count(x.id), 0);
    return `<li><button class="row" data-act="edit-cat" data-id="${c.id}">${badge(c)}<span class="grow"><span class="title">${esc(c.name)}</span>${kids.length ? `<span class="sub">${kids.map((x) => esc(x.name)).join(' · ')}</span>` : ''}</span><span class="muted small">${n} ›</span></button></li>`;
  }).join('')}</ul>`).join('')}
  <button class="btn primary" data-act="edit-cat">+ Nouvelle catégorie</button>`;
}

function openCategory(id, parent = null) {
  const c = id ? catById(id) : null;
  const p = parent && catById(parent);
  ui.draft = c ? { ...c } : { id: null, name: '', icon: p ? '•' : '🏷️', color: p ? p.color : PALETTE[S.categories.length % PALETTE.length], kind: p ? p.kind : 'depense', parent: parent || null };
  openSheet(() => {
    const d = ui.draft;
    const kids = d.id ? C.childrenOf(S, d.id) : [];
    const parents = visibleCats().filter((x) => !x.parent && x.id !== d.id);
    return `<h3>${d.id ? (d.parent ? 'Modifier la sous-catégorie' : 'Modifier la catégorie') : d.parent ? 'Nouvelle sous-catégorie' : 'Nouvelle catégorie'}</h3>
    <div class="two" style="grid-template-columns:auto 1fr">
      <label class="field"><span>Icône</span><input class="input emoji-input" data-f="icon" value="${esc(d.icon)}" maxlength="4"></label>
      <label class="field"><span>Nom</span><input class="input" data-f="name" value="${esc(d.name)}" placeholder="Ex. Sport"></label>
    </div>
    ${kids.length ? '' : `<label class="field"><span>Rangée dans</span><select class="input" data-f="parent">
      <option value="">— Catégorie principale —</option>
      ${parents.map((x) => `<option value="${x.id}" ${x.id === d.parent ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`}
    ${d.parent ? '' : `<label class="field"><span>Type</span><select class="input" data-f="kind">
      <option value="depense" ${d.kind === 'depense' ? 'selected' : ''}>Dépense</option>
      <option value="revenu" ${d.kind === 'revenu' ? 'selected' : ''}>Revenu</option>
      <option value="neutre" ${d.kind === 'neutre' ? 'selected' : ''}>Hors budget (virement, épargne…)</option></select></label>
    ${colorRow(d.color)}`}
    ${d.id && !d.parent ? `<div class="field"><span>Sous-catégories</span></div>
    <div class="chips wrap">${kids.map((x) => `<button class="chip" data-act="edit-cat" data-id="${x.id}">${esc(x.name)}</button>`).join('')}
      <button class="chip ghost" data-act="new-sub" data-id="${d.id}">+ Ajouter</button></div>` : ''}
    <button class="btn primary" data-act="save-cat">Enregistrer</button>
    ${d.id ? '<button class="btn danger" data-act="delete-cat">Supprimer</button>' : ''}`;
  });
}

// Liste déroulante catégories + sous-catégories (indentées).
const catOptions = (selected) => visibleCats().filter((c) => !c.parent).map((c) => [c, ...C.childrenOf(S, c.id)]).flat()
  .map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${c.parent ? '   ↳ ' : ''}${esc(c.name)}</option>`).join('');

function labelsSheet() {
  return `<h3>Labels</h3>
  <p class="muted small" style="margin-top:-8px">En plus des catégories : un voyage, un projet, une personne… Une opération peut en avoir plusieurs.</p>
  <ul class="list" style="margin-bottom:12px">${S.labels.map((l) => {
    const n = S.transactions.filter((t) => (t.labels || []).includes(l)).length;
    return `<li class="row"><span class="grow title">#${esc(l)} <span class="muted small" style="font-weight:500">${n} op.</span></span>
      <button class="link-btn" data-act="rename-label" data-l="${esc(l)}">Renommer</button>
      <button class="link-btn neg" style="margin-left:12px" data-act="delete-label" data-l="${esc(l)}">Supprimer</button></li>`;
  }).join('') || '<li class="muted small" style="padding:8px 0">Aucun label pour le moment.</li>'}</ul>
  <div class="two" style="grid-template-columns:1fr auto">
    <input class="input" data-f="newLabel" placeholder="Nouveau label" value="${esc(ui.draft?.newLabel || '')}" autocomplete="off">
    <button class="btn" style="width:auto" data-act="add-label-global">Ajouter</button>
  </div>`;
}

function rulesSheet() {
  const row = (r) => {
    const c = catById(r.categoryId);
    return `<li class="row"><span class="grow"><span class="title">« ${esc(r.pattern)} »</span><span class="sub">→ ${c ? esc(catPath(c.id)) : 'catégorie supprimée'}</span></span>
      <button class="link-btn neg" data-act="delete-rule" data-id="${r.id}">Supprimer</button></li>`;
  };
  const user = S.rules.filter((r) => !r.auto);
  const def = S.rules.filter((r) => r.auto);
  return `<h3>Règles automatiques</h3>
  <p class="muted small" style="margin-top:-8px">Une opération dont le libellé contient le mot-clé reçoit la catégorie. Tes règles passent avant celles par défaut.</p>
  <div class="two">
    <input class="input" data-f="ruleKw" placeholder="Mot-clé (ex. basic fit)" value="${esc(ui.draft?.ruleKw || '')}" autocomplete="off">
    <select class="input" data-f="ruleCat">${catOptions(ui.draft?.ruleCat)}</select>
  </div>
  <button class="btn primary" style="margin:10px 0 16px" data-act="add-rule">Ajouter la règle</button>
  <div class="field"><span>Mes règles (${user.length})</span></div>
  <ul class="list" style="margin-bottom:12px">${user.map(row).join('') || '<li class="muted small" style="padding:8px 0">Elles se créent aussi quand tu classes une opération.</li>'}</ul>
  <details><summary class="muted small">Règles par défaut (${def.length})</summary><ul class="list">${def.map(row).join('')}</ul></details>`;
}

/* ================================================================== */
/* Actions                                                             */
/* ================================================================== */

const opsFilter = (o) => ({ q: '', account: null, cat: null, exact: false, label: null, from: null, to: null, todo: false, ...o });

const A = {
  range: (el) => { ui.range = el.dataset.r; ui.animate = true; render(); },
  scope: (el) => { ui.scope = el.dataset.id; ui.animate = true; render(); },
  period: (el) => { ui.period = el.dataset.p; ui.animate = true; render(); },
  'period-nav': (el) => {
    const d = Number(el.dataset.d);
    const step = { mois: 1, '3m': 3, '12m': 12, annee: 12 }[ui.period];
    let n = C.addMonths(ui.anchor, d * step);
    if (ui.period === 'annee') n = `${Number(ui.anchor.slice(0, 4)) + d}-12`;
    ui.anchor = n > ymNow() ? ymNow() : n;
    ui.animate = true;
    render();
  },
  'cat-year': (el) => { const a = C.analysis(S); ui.ops = opsFilter({ cat: el.dataset.id, from: a.from, to: a.to }); go('operations'); },
  'goto-bilan-month': (el) => { ui.period = 'mois'; ui.anchor = el.dataset.ym; go('depenses'); },
  'goto-todo': () => { ui.ops = opsFilter({ todo: true }); go('operations'); },
  budgets: () => openSheet(budgetsSheet),
  'save-budgets': () => {
    const b = {};
    document.querySelectorAll('#sheet [data-budget]').forEach((el) => { const v = C.parseAmount(el.value); if (v > 0) b[el.dataset.budget] = Math.round(v); });
    S.budgets = b;
    closeSheet();
    save();
    toast('Budgets enregistrés');
  },
  'goto-month': (el) => { ui.period = 'mois'; ui.anchor = el.dataset.ym; render(); window.scrollTo(0, 0); },
  'toggle-cat': (el) => { const k = `${el.dataset.k}:${el.dataset.id}`; if (ui.openCats.has(k)) ui.openCats.delete(k); else ui.openCats.add(k); render(); },
  'todo-period': () => { const r = periodRange(); ui.ops = opsFilter({ from: r.from, to: r.to, todo: true }); go('operations'); },
  'cat-ops': (el) => { const r = periodRange(); ui.ops = opsFilter({ cat: el.dataset.id, exact: !!el.dataset.exact, from: r.from, to: r.to }); go('operations'); },
  'merchant-ops': (el) => { const r = periodRange(); ui.ops = opsFilter({ q: el.dataset.q, from: r.from, to: r.to }); go('operations'); },
  'label-ops': (el) => { const r = periodRange(); ui.ops = opsFilter({ label: el.dataset.l, from: r.from, to: r.to }); go('operations'); },
  'f-todo': () => { ui.ops.todo = !ui.ops.todo; render(); },
  'f-account': (el) => { ui.ops.account = ui.ops.account === el.dataset.id ? null : el.dataset.id; render(); },
  'f-clear': (el) => { if (el.dataset.k === 'range') { ui.ops.from = null; ui.ops.to = null; } else ui.ops[el.dataset.k] = null; render(); },
  more: () => { ui.opsLimit += 150; render(); },
  refresh: () => refreshAll({ silent: false, banks: true }),
  connect: () => {
    const v = $('#connect-token')?.value.trim();
    if (!v) return;
    S.settings.apiToken = v;
    writeLocal().then(start);
  },

  tx: (el) => openTx(el.dataset.id),
  sign: (el) => { ui.draft.sign = Number(el.dataset.s); refreshSheet(); },
  'pick-sub': (el) => { ui.draft.categoryId = el.dataset.id; refreshSheet(); },
  'pick-cat': (el) => {
    const d = ui.draft;
    const same = d.categoryId && C.rootOf(S, d.categoryId) === el.dataset.id;
    d.categoryId = same ? null : el.dataset.id;
    const c = catById(d.categoryId);
    if (c && !d.id && c.kind !== 'neutre') d.sign = c.kind === 'revenu' ? 1 : -1;
    refreshSheet();
  },
  'toggle-label': (el) => {
    const l = el.dataset.l;
    ui.draft.labels = ui.draft.labels.includes(l) ? ui.draft.labels.filter((x) => x !== l) : [...ui.draft.labels, l];
    refreshSheet();
  },
  'add-label': () => {
    const l = ui.draft.newLabel.trim().replace(/^#/, '');
    if (!l) return;
    if (!S.labels.includes(l)) S.labels.push(l);
    if (!ui.draft.labels.includes(l)) ui.draft.labels.push(l);
    ui.draft.newLabel = '';
    refreshSheet();
  },
  'save-tx': saveTx,
  unsplit: () => {
    if (!confirm('Retirer la ventilation ? L’opération redevient une seule ligne, dans la catégorie choisie ci-dessous.')) return;
    const t = S.transactions.find((x) => x.id === ui.draft.id);
    if (t) delete t.splits;
    ui.draft.splits = null;
    save();
    refreshSheet();
  },
  'delete-tx': () => {
    if (!confirm('Supprimer cette opération ?')) return;
    S.transactions = S.transactions.filter((t) => t.id !== ui.draft.id);
    closeSheet();
    save();
  },

  account: (el) => openAccount(el.dataset.id),
  'new-account': openNewAccount,
  'pick-color': (el) => { ui.draft.color = el.dataset.c; refreshSheet(); },
  'create-account': () => {
    const d = ui.draft;
    if (!d.name.trim()) return toast('Donne un nom au compte');
    S.accounts.push({ id: C.uid(), name: d.name.trim(), institution: d.institution.trim(), type: d.type, color: d.color, openingBalance: C.round2(C.parseAmount(d.balanceInput) || 0) });
    closeSheet();
    save();
  },
  'save-account': () => {
    const d = ui.draft;
    if (!d.name.trim()) return toast('Donne un nom au compte');
    Object.assign(accById(d.id), { name: d.name.trim(), institution: (d.institution || '').trim(), type: d.type, color: d.color });
    closeSheet();
    save();
  },
  'delete-account': () => {
    const a = accById(ui.draft.id);
    if (!confirm(`Supprimer « ${a.name} » et ses opérations ?`)) return;
    S.accounts = S.accounts.filter((x) => x.id !== a.id);
    S.transactions = S.transactions.filter((t) => t.accountId !== a.id);
    S.bank.links = S.bank.links.filter((l) => l.accountId !== a.id);
    delete S.crypto[a.id];
    delete S.cryptoHistory[a.id];
    closeSheet();
    save();
  },
  adjust: () => {
    const d = ui.draft;
    const a = accById(d.id);
    const target = C.parseAmount(d.balanceInput);
    if (target == null) return toast('Montant invalide');
    if (!S.transactions.some((t) => t.accountId === a.id)) a.openingBalance = C.round2(target);
    else {
      const diff = C.round2(target - C.accountBalance(S, a));
      if (!diff) return toast('Le solde est déjà à jour');
      S.transactions.push({ id: C.uid(), accountId: a.id, date: C.todayISO(), label: 'Ajustement de solde', amount: diff, categoryId: 'ajust', labels: [], note: '', source: 'ajustement' });
    }
    save();
    refreshSheet();
    toast('Solde mis à jour');
  },
  'acc-ops': () => { ui.ops = opsFilter({ account: ui.draft.id }); closeSheet(); go('operations'); },

  bank: () => openSheet(bankSheet),
  'bank-pick': () => { ui.draft = { country: 'FR', q: '', aspsps: [] }; openSheet(bankPickSheet); loadAspsps(); },
  'bank-auth': (el) => startBankAuth(el.dataset.name, el.dataset.country, el.dataset.max),
  'bank-sync': () => syncBanks({ silent: false }),
  'bank-map-save': () => {
    const d = ui.draft;
    for (const a of d.accounts) {
      if (a.target === '__skip') continue;
      let accountId = a.target;
      if (accountId === '__new') {
        accountId = C.uid();
        const saving = /livret|epargne|savings/i.test(C.norm(a.name)) || a.type === 'SVGS';
        S.accounts.push({ id: accountId, name: (a.name ? `${d.aspsp} ${a.name}` : d.aspsp).slice(0, 40), institution: d.aspsp, type: saving ? 'epargne' : 'courant', openingBalance: 0, color: PALETTE[S.accounts.length % PALETTE.length] });
      }
      S.bank.links = S.bank.links.filter((l) => l.uid !== a.uid);
      S.bank.links.push({ uid: a.uid, accountId, aspsp: d.aspsp, country: d.country, name: a.name, iban: a.iban, validUntil: d.validUntil, lastSync: null, lastSyncAt: null, error: null });
    }
    S.bank.pending = null;
    closeSheet();
    commit();
    syncBanks({ silent: false });
  },

  categories: () => openSheet(categoriesSheet),
  'edit-cat': (el) => openCategory(el.dataset.id),
  'new-sub': (el) => openCategory(null, el.dataset.id),
  'save-cat': () => {
    const d = ui.draft;
    if (!d.name.trim()) return toast('Donne un nom à la catégorie');
    const parent = d.parent ? catById(d.parent) : null;
    const data = { name: d.name.trim(), icon: d.icon || '🏷️', color: parent ? parent.color : d.color, kind: parent ? parent.kind : d.kind, parent: parent ? parent.id : undefined };
    if (!parent) delete data.parent;
    if (d.id) {
      const c = catById(d.id);
      Object.assign(c, data);
      if (!parent) delete c.parent;
      // Les sous-catégories suivent la couleur et le type du parent.
      for (const k of C.childrenOf(S, c.id)) Object.assign(k, { color: c.color, kind: c.kind });
    } else S.categories.push({ id: C.uid(), ...data });
    save();
    if (parent) openCategory(parent.id); else openSheet(categoriesSheet);
  },
  'delete-cat': () => {
    const id = ui.draft.id;
    const n = S.transactions.filter((t) => t.categoryId === id).length;
    if (!confirm(`Supprimer cette catégorie ?${n ? ` ${plural(n, 'opération')} repasseront « à classer ».` : ''}`)) return;
    const parent = catById(id)?.parent || null;
    const kids = C.childrenOf(S, id).map((k) => k.id);
    const gone = new Set([id, ...kids]);
    S.categories = S.categories.filter((c) => !gone.has(c.id));
    S.rules = S.rules.filter((r) => !gone.has(r.categoryId));
    for (const t of S.transactions) if (gone.has(t.categoryId)) t.categoryId = parent;
    save();
    openSheet(categoriesSheet);
  },

  labels: () => { ui.draft = { newLabel: '' }; openSheet(labelsSheet); },
  'add-label-global': () => {
    const l = (ui.draft.newLabel || '').trim().replace(/^#/, '');
    if (!l) return;
    if (!S.labels.includes(l)) S.labels.push(l);
    ui.draft.newLabel = '';
    save();
    refreshSheet();
  },
  'rename-label': (el) => {
    const old = el.dataset.l;
    const nv = (prompt('Nouveau nom du label', old) || '').trim().replace(/^#/, '');
    if (!nv || nv === old) return;
    S.labels = [...new Set(S.labels.map((l) => (l === old ? nv : l)))];
    for (const t of S.transactions) if (t.labels?.includes(old)) t.labels = [...new Set(t.labels.map((l) => (l === old ? nv : l)))];
    save();
    refreshSheet();
  },
  'delete-label': (el) => {
    const l = el.dataset.l;
    if (!confirm(`Supprimer le label #${l} ?`)) return;
    S.labels = S.labels.filter((x) => x !== l);
    for (const t of S.transactions) if (t.labels?.includes(l)) t.labels = t.labels.filter((x) => x !== l);
    save();
    refreshSheet();
  },

  rules: () => { ui.draft = { ruleKw: '', ruleCat: visibleCats()[0]?.id }; openSheet(rulesSheet); },
  'add-rule': () => {
    const d = ui.draft;
    if (!d.ruleKw?.trim()) return toast('Indique un mot-clé');
    const rule = { id: C.uid(), pattern: d.ruleKw.trim(), categoryId: d.ruleCat || visibleCats()[0].id };
    S.rules.push(rule);
    const n = C.applyRuleToUncategorized(S, rule);
    d.ruleKw = '';
    save();
    refreshSheet();
    toast(n ? `Règle ajoutée · ${plural(n, 'opération')} classée${n > 1 ? 's' : ''}` : 'Règle ajoutée');
  },
  'delete-rule': (el) => { S.rules = S.rules.filter((r) => r.id !== el.dataset.id); save(); refreshSheet(); },

  theme: (el) => { S.settings.theme = el.dataset.t; applyTheme(); commit(); },
};

/* ================================================================== */
/* Branchements                                                        */
/* ================================================================== */

function applyTheme() {
  const t = S.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

document.addEventListener('click', (e) => {
  const tabBtn = e.target.closest('button[data-tab]');
  if (tabBtn) return go(tabBtn.dataset.tab);
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = A[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'ops-search') {
    ui.ops.q = el.value;
    const pos = el.selectionStart;
    render();
    const s = $('#ops-search');
    s.focus();
    s.setSelectionRange(pos, pos);
    return;
  }
  if (el.dataset.f && ui.draft) {
    ui.draft[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.f === 'ruleKw') ui.draft.ruleKwTouched = true;
    if (el.dataset.f === 'label' && !ui.draft.ruleKwTouched && !ui.draft.raw) ui.draft.ruleKw = C.suggestKeyword(el.value);
    if (el.dataset.f === 'q' && sheetRender === bankPickSheet) refreshSheet();
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.f && ui.draft && (el.tagName === 'SELECT' || el.type === 'checkbox')) {
    ui.draft[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
  }
  if (el.dataset.bankCountry !== undefined && ui.draft) { ui.draft.country = el.value; loadAspsps(); return; }
  if (el.dataset.map !== undefined && ui.draft?.accounts) { ui.draft.accounts[Number(el.dataset.map)].target = el.value; return; }
  if (el.dataset.link) {
    const l = S.bank.links.find((x) => x.uid === el.dataset.link);
    if (el.value === '__unlink') {
      if (confirm('Délier ce compte ? Les opérations déjà importées sont conservées.')) S.bank.links = S.bank.links.filter((x) => x !== l);
    } else if (l) l.accountId = el.value;
    save();
    refreshSheet();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetOpen) return closeSheet();
  if (e.key !== 'Enter') return;
  const f = e.target.dataset?.f;
  if (f === 'newLabel') { e.preventDefault(); A[sheetRender === labelsSheet ? 'add-label-global' : 'add-label'](); }
  if (e.target.id === 'connect-token') A.connect();
});

$('#backdrop').addEventListener('click', closeSheet);
$('#fab').addEventListener('click', () => openTx(null));
$('#side-add').addEventListener('click', () => openTx(null));
$('#btn-eye').addEventListener('click', () => { S.settings.hideAmounts = !S.settings.hideAmounts; commit(); });
document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = ICONS[el.dataset.icon]; });

function onBadToken() {
  S.settings.apiToken = '';
  writeLocal();
  render();
  toast('Mot de passe du relais refusé');
}

// Retour au premier plan : on rattrape tout.
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (tab === 'patrimoine' && !sheetOpen) render(); }, 150); });

document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    if (dirty) await saveNow();
    if (cloudTimer) await cloudPush();
    return;
  }
  if (!S?.settings.apiToken) return;
  connectLive();
  await cloudPull();
  refreshAll();
});

let ticker = null;
async function start() {
  ui.animate = true;
  render();
  if (!S.settings.apiToken) return;
  connectLive();
  await cloudPull();
  render();
  await handleBankCallback();
  refreshAll();
  clearInterval(ticker);
  // Binance chaque minute, banques toutes les 30 min, tant que l'app est visible.
  ticker = setInterval(() => { if (!document.hidden) refreshAll(); }, 60e3);
}

async function boot() {
  S = await loadState();
  const tok = !DEMO && new URLSearchParams(location.hash.slice(1)).get('token');
  if (DEMO) {
    document.body.classList.add('demo');
    const t = new URLSearchParams(location.search).get('tab');
    if (t && TITLES[t]) tab = t;
    $('.topbar').insertAdjacentHTML('afterend', '<div class="demo-ribbon" role="note">Mode démo : données inventées, rien n’est enregistré.</div>');
  }
  if (tok) {
    S.settings.apiToken = tok;
    history.replaceState(null, '', location.pathname + location.search);
    await writeLocal(); // sans horodatage : ne doit pas écraser le cloud
  }
  applyTheme();
  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator && !DEMO) navigator.serviceWorker.register('sw.js').catch(() => {});
  await start();
}
boot();
