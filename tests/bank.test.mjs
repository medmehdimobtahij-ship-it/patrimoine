// node tests/bank.test.mjs
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import * as C from '../public/core.js';
import { ebJwt, handleBank } from '../src/eb.js';

let ok = 0;
const t = async (name, fn) => { await fn(); ok++; console.log('✓', name); };

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pkcs8 = privateKey.export({ type: 'pkcs8', format: 'pem' });
const pkcs1 = privateKey.export({ type: 'pkcs1', format: 'pem' });

const checkJwt = (jwt) => {
  const [h, p, s] = jwt.split('.');
  const v = createVerify('RSA-SHA256');
  v.update(`${h}.${p}`);
  assert.ok(v.verify(publicKey, Buffer.from(s, 'base64url')), 'signature invalide');
  const head = JSON.parse(Buffer.from(h, 'base64url'));
  const body = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(head.alg, 'RS256');
  assert.equal(head.kid, 'app-123');
  assert.equal(body.aud, 'api.enablebanking.com');
  assert.equal(body.iss, 'enablebanking.com');
  assert.ok(body.exp > body.iat);
};

await t('JWT signé avec une clé PKCS#8', async () => checkJwt(await ebJwt({ EB_APP_ID: 'app-123', EB_PRIVATE_KEY: pkcs8 })));
await t('JWT signé avec une clé PKCS#1', async () => checkJwt(await ebJwt({ EB_APP_ID: 'app-123', EB_PRIVATE_KEY: pkcs1 })));
await t('JWT : clé collée sur une seule ligne', async () => checkJwt(await ebJwt({ EB_APP_ID: 'app-123 ', EB_PRIVATE_KEY: pkcs8.replace(/\n/g, '\\n') })));

const env = { EB_APP_ID: 'app-123', EB_PRIVATE_KEY: pkcs8 };
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url, init });
  const u = new URL(url);
  const reply = (o, status = 200) => new Response(JSON.stringify(o), { status });
  if (u.pathname === '/auth') return reply({ url: 'https://bank.example/consent' });
  if (u.pathname === '/sessions') {
    return reply({
      session_id: 'sess', aspsp: { name: 'BNP Paribas', country: 'FR' }, access: { valid_until: '2027-05-01T00:00:00Z' },
      accounts: [{ uid: 'u1', name: 'Livret A', account_id: { iban: 'FR7612345678901234' }, currency: 'EUR', cash_account_type: 'SVGS' }],
    });
  }
  if (u.pathname.endsWith('/balances')) return reply({ balances: [{ balance_type: 'ITAV', balance_amount: { amount: '99', currency: 'EUR' } }, { balance_type: 'CLBD', balance_amount: { amount: '5200.50', currency: 'EUR' } }] });
  if (u.pathname.endsWith('/transactions')) {
    if (u.pathname.includes('bad')) return reply({ message: 'Session expired' }, 401);
    const page2 = u.searchParams.get('continuation_key') === 'k2';
    return reply(page2 ? { transactions: [{ entry_reference: 'r2' }] } : { transactions: [{ entry_reference: 'r1' }], continuation_key: 'k2' });
  }
  return reply({ message: 'not found' }, 404);
};
const req = (path, body) => new Request(`https://patrimoine.test${path}`, body ? { method: 'POST', body: JSON.stringify(body) } : {});

await t('route /auth : redirect_url et durée du consentement', async () => {
  const r = await handleBank(req('/api/bank/auth', { name: 'BNP Paribas', country: 'FR', state: 's1', maxConsent: 999999999 }), env, new URL('https://patrimoine.test/api/bank/auth'));
  assert.equal(r.url, 'https://bank.example/consent');
  const sent = JSON.parse(calls.at(-1).init.body);
  assert.equal(sent.redirect_url, 'https://patrimoine.test/bank/callback');
  assert.equal(sent.psu_type, 'personal');
  assert.equal(sent.state, 's1');
  const days = (new Date(sent.access.valid_until) - Date.now()) / 864e5;
  assert.ok(days > 179 && days <= 180, `durée ${days}`);
  assert.match(calls.at(-1).init.headers.authorization, /^Bearer ey/);
});

await t('route /session : comptes normalisés', async () => {
  const r = await handleBank(req('/api/bank/session', { code: 'abc' }), env, new URL('https://patrimoine.test/api/bank/session'));
  assert.equal(r.accounts[0].uid, 'u1');
  assert.equal(r.accounts[0].iban, 'FR7612345678901234');
  assert.equal(r.accounts[0].type, 'SVGS');
});

await t('route /sync : pagination + erreur isolée par compte', async () => {
  const r = await handleBank(req('/api/bank/sync', { accounts: [{ uid: 'u1', dateFrom: '2026-01-01' }, { uid: 'bad', dateFrom: '2026-01-01' }] }), env, new URL('https://patrimoine.test/api/bank/sync'));
  assert.equal(r.results[0].transactions.length, 2);
  assert.equal(C.pickBalance(r.results[0].balances), 5200.5);
  assert.match(r.results[1].error, /401/);
  assert.equal(r.results[1].ebStatus, 401);
});

await t('conversion des opérations bancaires + doublons', async () => {
  const s = C.defaultState();
  s.transactions.push({ id: 'csv1', accountId: 'revolut', date: '2026-11-02', label: 'Basic Fit', amount: -29.99, categoryId: 'abos', labels: [], source: 'csv', importKey: 'revolut|x' });
  const txs = [
    { entry_reference: 'a', transaction_amount: { amount: '23.40', currency: 'EUR' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: '2026-11-01', creditor: { name: 'CARREFOUR' }, remittance_information: ['CARREFOUR CITY PARIS'] },
    { entry_reference: 'b', transaction_amount: { amount: '1500', currency: 'EUR' }, credit_debit_indicator: 'CRDT', status: 'BOOK', booking_date: '2026-11-03', debtor: { name: 'ACME' }, remittance_information: ['SALAIRE OCTOBRE'] },
    { entry_reference: 'c', transaction_amount: { amount: '29.99', currency: 'EUR' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: '2026-11-02', remittance_information: ['BASIC FIT'] },
    { entry_reference: 'd', transaction_amount: { amount: '5', currency: 'EUR' }, credit_debit_indicator: 'DBIT', status: 'PDNG', booking_date: '2026-11-04' },
    { entry_reference: 'e', transaction_amount: { amount: '10', currency: 'USD' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: '2026-11-04' },
  ];
  const r = C.buildBankImport(s, 'revolut', 'u1', txs);
  assert.deepEqual(r.items.map((x) => x.amount), [-23.4, 1500]);
  assert.equal(r.items[0].label, 'CARREFOUR CITY PARIS');
  assert.equal(r.items[0].categoryId, 'crs_super');
  assert.equal(r.items[1].label, 'ACME · SALAIRE OCTOBRE');
  assert.equal(r.items[1].categoryId, 'sal_salaire');
  assert.equal(r.stats.duplicates, 1); // Basic Fit déjà importé par CSV
  assert.equal(r.stats.pending, 1);
  assert.equal(r.stats.foreign, 1);
  s.transactions.push(...r.items);
  const again = C.buildBankImport(s, 'revolut', 'u1', txs);
  assert.equal(again.items.length, 0);
  C.alignBalance(s, 'revolut', 2000);
  assert.equal(C.accountBalance(s, s.accounts[0]), 2000);
  // Solde « disponible » (ITAV) qui inclut 123,40 € d'achats en attente : l'historique ne doit pas être décalé.
  const s2 = C.defaultState();
  s2.transactions.push(
    { id: '1', accountId: 'revolut', date: '2026-01-01', label: 'Salaire', amount: 500, categoryId: null, labels: [] },
    { id: '2', accountId: 'revolut', date: '2026-02-01', label: 'Courses', amount: -100, categoryId: null, labels: [] },
  );
  const imp = C.buildBankImport(s2, 'revolut', 'u9', [
    { status: 'PDNG', transaction_amount: { amount: '105', currency: 'EUR' }, credit_debit_indicator: 'DBIT', booking_date: '2026-11-08' },
    { status: 'PDNG', transaction_amount: { amount: '18.40', currency: 'EUR' }, credit_debit_indicator: 'DBIT', booking_date: '2026-11-08' },
  ]);
  assert.equal(imp.stats.pendingSum, -123.4);
  const info = C.pickBalanceInfo([{ balance_type: 'ITAV', balance_amount: { amount: '276.60', currency: 'EUR' } }]);
  assert.equal(info.booked, false);
  C.alignBalance(s2, 'revolut', info.value, C.todayISO(), imp.stats.pendingSum, info.booked);
  const acc = s2.accounts[0];
  assert.equal(acc.openingBalance, 0); // 276,60 + 123,40 − 400 : aucun faux découvert au début
  assert.equal(C.accountBalance(s2, acc), 276.6); // aujourd'hui = solde affiché par la banque
  assert.equal(C.accountBalance(s2, acc, '2026-01-15'), 500);
  assert.equal(C.netWorthSeries(s2, '2026-01-01', C.todayISO()).at(-1).value, 276.6 + 0);
});

console.log(`\n${ok} tests OK`);
