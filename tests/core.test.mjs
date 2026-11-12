// node tests/core.test.mjs
import assert from 'node:assert/strict';
import * as C from '../public/core.js';

let ok = 0;
const t = (name, fn) => { fn(); ok++; console.log('✓', name); };

t('parseAmount', () => {
  assert.equal(C.parseAmount('-1 234,56 €'), -1234.56);
  assert.equal(C.parseAmount('1,234.56'), 1234.56);
  assert.equal(C.parseAmount('2 150,00'), 2150);
  assert.equal(C.parseAmount('12,5'), 12.5);
  assert.equal(C.parseAmount(''), null);
});

t('libellés lisibles', () => {
  const cases = {
    'FACTURE CARTE DU 061026 PHARMACIE DU CENTRE CARTE 4974XXXXXXXX1234': 'Pharmacie du Centre',
    'VIR SEPA INST RECU /DE MME MOUSSAFIR SALMA /REF 019': 'Virement de Mme Moussafir Salma',
    'VIR SEPA INST EMIS /MOTIF VIREMENT DE M. X /BEN MOHAMED ELMEHDI MOBTAHIJ /REFDO F17': 'Virement à Mohamed Elmehdi Mobtahij',
    'PRLV SEPA FREE MOBILE ECH/031026': 'Free Mobile',
    'COMMISSIONS COTISATION A UNE OFFRE GROUPEE DE SERVICES ESPRIT LIBRE': 'Frais du forfait bancaire',
    'RETRAIT DAB // H A 2SF': 'Retrait d’espèces',
    'Carrefour City': 'Carrefour City',
    'NYX*LILLE': 'Nyx Lille',
  };
  for (const [raw, want] of Object.entries(cases)) assert.equal(C.prettyLabel(raw), want, raw);
  assert.equal(C.displayName({ label: 'PRLV SEPA FREE MOBILE', title: 'Forfait mobile' }), 'Forfait mobile');
  assert.ok(C.prettyLabel('X'.repeat(80)).length <= 60);
});

t('suggestKeyword', () => {
  assert.equal(C.suggestKeyword('PRLV SEPA FREE MOBILE ECH/031026'), 'free mobile');
  assert.equal(C.suggestKeyword('FACTURE CARTE DU 061026 PHARMACIE DU CENTRE CARTE 4974XXXXXXXX1234'), 'pharmacie');
  assert.equal(C.suggestKeyword('Carrefour City'), 'carrefour city');
});

t('règles : priorité utilisateur et limite de mot', () => {
  const s = C.defaultState();
  assert.equal(C.categorize('Uber Eats', s.rules), 'rst_livraison');
  assert.equal(C.categorize('Uber trip', s.rules), 'trp_vtc');
  assert.equal(C.rootOf(s, 'rst_livraison'), 'resto');
  assert.equal(C.rootOf(s, 'resto'), 'resto');
  s.rules.push({ id: 'x', pattern: 'uber', categoryId: 'loisirs' });
  assert.equal(C.categorize('Uber Eats', s.rules), 'loisirs');
  assert.equal(C.categorize('orangeade', s.rules), null);
  assert.equal(C.categorize('VIR SEPA RECU /MOTIF VIREMENT VERS COMPTE DE CHEQUES', s.rules), 'virement');
});

t('soldes, série, stats', () => {
  const s = C.defaultState();
  s.accounts[0].openingBalance = 100;
  s.transactions.push(
    { id: '1', accountId: 'revolut', date: '2026-10-01', label: 'a', amount: -30, categoryId: 'courses', labels: ['perso'] },
    { id: '2', accountId: 'revolut', date: '2026-10-10', label: 'b', amount: 1000, categoryId: 'salaire', labels: [] },
    { id: '3', accountId: 'revolut', date: '2026-10-11', label: 'c', amount: -200, categoryId: 'virement', labels: [] },
    { id: '4', accountId: 'bnp', date: '2026-10-11', label: 'c', amount: 200, categoryId: 'virement', labels: [] },
    { id: '5', accountId: 'revolut', date: '2026-10-12', label: 'd', amount: -5, categoryId: null, labels: [] },
  );
  s.crypto.binance = { totalEur: 500, holdings: [] };
  C.recordCryptoSnapshot(s, 'binance', 400, '2026-10-05');
  assert.equal(C.accountBalance(s, s.accounts[0]), 865);
  assert.equal(C.accountBalance(s, s.accounts[0], '2026-10-01'), 70);
  assert.equal(C.netWorth(s), 865 + 200 + 500);
  const series = C.netWorthSeries(s, '2026-10-01', '2026-10-12');
  assert.equal(series[0].value, 70);
  assert.equal(series.find((p) => p.date === '2026-10-05').value, 470);
  const dates = C.seriesDates('2026-10-01', '2026-10-12', 400);
  assert.equal(dates.length, 12);
  const perAcc = s.accounts.map((a) => C.accountSeries(s, a, dates));
  assert.deepEqual(perAcc[0].slice(0, 2), [70, 70]);
  assert.equal(perAcc[0].at(-1), 865);
  assert.equal(perAcc[2][4], 400); // Binance au 5 oct.
  // La somme des comptes = la série totale.
  const total = C.netWorthSeries(s, '2026-10-01', '2026-10-12', 400);
  dates.forEach((d, i) => assert.equal(C.round2(perAcc.reduce((x, v) => x + v[i], 0)), total[i].value));
  const m = C.monthStats(s, '2026-10');
  assert.equal(m.expense, 35);
  assert.equal(m.income, 1000);
  assert.equal(m.uncategorized, 1);
  assert.deepEqual(m.byLabel, [{ id: 'perso', amount: 30 }]);
});

t('migration', () => {
  const s = C.defaultState();
  const back = C.migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(back.accounts.length, 3);
  assert.throws(() => C.migrate({}));
  const old = C.defaultState();
  Object.assign(old.accounts[1], { name: 'Livret BNP', type: 'epargne' });
  assert.equal(C.migrate(JSON.parse(JSON.stringify(old))).accounts[1].type, 'courant');
});

t('boîte de dépôt : fusion sans doublon ni écrasement', () => {
  const s = C.defaultState();
  s.transactions.push({ id: 'x', accountId: 'bnp', date: '2026-11-03', label: 'VIR SEPA EMIS VERS COMPTE DE CHEQUES', amount: 500, categoryId: null, labels: [] });
  const item = {
    type: 'account', account: { id: 'livret-a', name: 'Livret A', type: 'epargne' },
    transactions: [{ accountId: 'livret-a', date: '2026-06-30', label: 'Dépôt initial', amount: 1500, categoryId: 'virement', importKey: 'k1' }],
  };
  assert.deepEqual(C.mergeInboxItem(s, item), ['compte « Livret A » ajouté', '1 opération ajoutée']);
  assert.deepEqual(C.mergeInboxItem(s, item), []);
  assert.equal(C.accountBalance(s, s.accounts.find((a) => a.id === 'livret-a')), 1500);
  assert.deepEqual(C.mergeInboxItem(s, { type: 'rule', pattern: 'compte de cheques', categoryId: 'virement' }), ['règle « compte de cheques » (1 op. classées)']);
});

t('bilan : sous-catégories, mois, commerçants, récurrents', () => {
  const s = C.defaultState();
  const tx = (id, date, amount, categoryId, label = 'x') => ({ id, accountId: 'revolut', date, label, amount, categoryId, labels: [] });
  s.transactions.push(
    tx('a', '2026-09-03', -120, 'voy_avion', 'Transavia'),
    tx('b', '2026-09-04', -40, 'voy_hebergement', 'Airbnb'),
    tx('c', '2026-10-05', -25, 'abo_sport', 'Basic Fit France'),
    tx('d', '2026-09-05', -25, 'abo_sport', 'Basic Fit France'),
    tx('e', '2026-08-05', -25, 'abo_sport', 'Basic Fit France'),
    tx('f', '2026-10-10', 1000, 'sal_salaire', 'Helix'),
    tx('g', '2026-10-11', -300, 'virement', 'To Compte d’épargne'),
  );
  const p = C.periodStats(s, '2026-08', '2026-10');
  assert.equal(p.expense, 235);
  assert.equal(p.income, 1000);
  assert.equal(p.net, 765);
  const voy = p.byCat.find((x) => x.id === 'voyages');
  assert.equal(voy.amount, 160);
  assert.deepEqual(voy.subs.map((x) => x.id), ['voy_avion', 'voy_hebergement']);
  assert.equal(p.byIncome[0].id, 'salaire');
  assert.equal(p.perMonth.length, 3);
  assert.equal(p.perMonth[1].byRoot.voyages, 160);
  assert.equal(p.merchants[0].name, 'Transavia');
  const groups = C.groupTree(p.byCat);
  assert.deepEqual(groups.map((g) => [g.id, g.amount]), [['g_mobilite', 160], ['g_logement', 75]]);
  assert.equal(C.groupOf('_none'), 'g_autres');
  const rec = C.recurring(s, '2026-10');
  assert.equal(rec.length, 1);
  assert.equal(rec[0].name, 'Basic Fit France');
  assert.equal(rec[0].monthly, 25);
});

t('reclassement depuis la boîte : respecte les changements faits entre-temps', () => {
  const s = C.defaultState();
  s.transactions.push(
    { id: '1', accountId: 'revolut', date: '2026-10-01', label: 'Lavanor', amount: -2, categoryId: null, labels: [] },
    { id: '2', accountId: 'revolut', date: '2026-10-01', label: 'Timgad', amount: -9, categoryId: 'cadeaux', labels: [] },
  );
  const out = C.mergeInboxItem(s, {
    type: 'recat',
    categories: [{ id: 'test_sub', name: 'Test', parent: 'loisirs', kind: 'depense' }],
    assignments: [{ id: '1', from: null, to: 'log_laverie' }, { id: '2', from: null, to: 'rst_resto' }],
    rules: [{ pattern: 'lavanor', categoryId: 'log_laverie' }],
  });
  assert.equal(s.transactions[0].categoryId, 'log_laverie');
  assert.equal(s.transactions[1].categoryId, 'cadeaux'); // modifié par l'utilisateur : on ne touche pas
  assert.ok(s.categories.some((c) => c.id === 'test_sub'));
  assert.ok(s.rules.some((r) => !r.auto && r.pattern === 'lavanor'));
  assert.deepEqual(out, ['1 catégorie ajoutée', '1 opération classée']);
});

t('migration du catalogue (ancien état sans sous-catégories)', () => {
  const old = C.defaultState();
  old.catalog = 1;
  old.categories = old.categories.filter((c) => !c.parent);
  old.rules = [{ id: 'u', pattern: 'perso', categoryId: 'loisirs' }, { id: 'a', pattern: 'carrefour', categoryId: 'courses', auto: true }];
  const m = C.migrate(JSON.parse(JSON.stringify(old)));
  assert.ok(m.categories.some((c) => c.id === 'voy_avion' && c.parent === 'voyages'));
  assert.ok(m.rules.some((r) => r.pattern === 'perso' && !r.auto));
  assert.equal(m.rules.find((r) => r.auto && r.pattern === 'carrefour').categoryId, 'crs_super');
  assert.equal(m.catalog, C.CATALOG_VERSION);
});

t('Bilan Claude : moyennes, prêts, budgets, actions', () => {
  const s = C.defaultState();
  const tx = (id, date, amount, categoryId, label = 'x', extra = {}) => ({ id, accountId: 'revolut', date, label, amount, categoryId, labels: [], ...extra });
  s.accounts[1].openingBalance = 0;
  s.accounts.push({ id: 'la', name: 'Livret A', type: 'epargne', openingBalance: 3000 });
  for (const m of ['2026-08', '2026-09', '2026-10']) {
    s.transactions.push(tx(`s${m}`, `${m}-01`, 1500, 'sal_salaire', 'Helix'), tx(`h${m}`, `${m}-05`, -400, 'shp_enligne', 'Amazon'), tx(`f${m}`, `${m}-06`, -50, 'trp_amende', 'Ilevia Pv'));
  }
  s.transactions.push(tx('p1', '2026-09-10', -100, 'prets', 'AYMANE EL AZHARI · To AYMANE E'), tx('p2', '2026-09-11', -130, 'prets', 'To Damarez steveen'), tx('p3', '2026-09-12', 130, 'prets', 'Payment from M. Damarez Steveen'));
  const a = C.analysis(s, '2026-11');
  assert.equal(a.from, '2026-08');
  assert.equal(a.avgIncome, 1500);
  assert.equal(a.avgExpense, 450);
  assert.deepEqual(a.loans.map((l) => [l.name, l.owed]), [['Aymane El Azhari', 100]]);
  assert.equal(a.avoidable[0].id, 'trp_amende');
  assert.ok(a.actions.some((x) => /shopping/.test(x.title) && x.gain === 3000));
  assert.ok(a.score > 0 && a.score <= 100);
  s.budgets = { shopping: 300 };
  s.transactions.push(tx('n1', `${C.todayISO().slice(0, 7)}-01`, -150, 'shp_vetements', 'Zara'));
  const b = C.budgetStatus(s);
  assert.equal(b[0].id, 'shopping');
  assert.equal(b[0].spent, 150);
  assert.equal(b[0].ratio, 0.5);
});

t('ventilation et dettes : cas machine à laver / loyer', () => {
  const s = C.defaultState();
  s.accounts[0].openingBalance = 1000;
  s.transactions.push(
    { id: 'm', accountId: 'revolut', date: '2026-10-26', label: 'To Haitam', amount: -500, categoryId: 'prets', labels: [],
      splits: [{ amount: -120, categoryId: 'shp_maison', note: 'Ma part' }, { amount: -380, categoryId: 'prets', counterparty: 'Haitam Moumen' }] },
    { id: 'l', accountId: 'revolut', date: '2026-10-05', label: 'To Haitam', amount: -350, categoryId: 'log_loyer', labels: [] },
  );
  s.debts = [{ who: 'Haitam Moumen', amount: -200, note: 'Loyer de décembre' }];
  // Le solde garde l'opération entière.
  assert.equal(C.accountBalance(s, s.accounts[0]), 150);
  // Les stats ne comptent que ma part de la machine comme dépense.
  const p = C.periodStats(s, '2026-10');
  assert.equal(p.expense, 470);
  assert.equal(p.byCat.find((c) => c.id === 'shopping').amount, 120);
  // Haitam me doit 380, je lui dois 200 → solde 180.
  const a = C.analysis(s, '2026-11');
  const h = a.loans.find((l) => l.name === 'Haitam Moumen');
  assert.equal(h.owed, 180);
});

t('opérations en attente : visibles dans les stats, sans toucher au solde', () => {
  const s = C.defaultState();
  const ym = C.todayISO().slice(0, 7);
  s.bank.links = [{ uid: 'u', accountId: 'revolut', aspsp: 'Revolut', pendingTx: [{ date: C.todayISO(), label: 'Carrefour City', amount: -12.5 }] }];
  const imp = C.buildBankImport(s, 'revolut', 'u', [{ status: 'PDNG', transaction_amount: { amount: '7', currency: 'EUR' }, credit_debit_indicator: 'DBIT', transaction_date: '2026-11-09', remittance_information: ['Uber Eats'] }]);
  assert.deepEqual(imp.stats.pendingItems, [{ date: '2026-11-09', label: 'Uber Eats', amount: -7 }]);
  const pend = C.pendingTx(s);
  assert.equal(pend[0].categoryId, 'crs_super');
  assert.equal(C.periodStats(s, ym).expense, 12.5);
  assert.equal(C.accountBalance(s, s.accounts[0]), 0);
});

t('origine d’une variation de la courbe', () => {
  const s = C.defaultState();
  s.transactions = [
    { id: 'a', accountId: 'bnp', date: '2026-10-01', label: 'Loyer', amount: -700 },
    { id: 'b', accountId: 'bnp', date: '2026-10-05', label: 'Salaire ACME', amount: 1800, categoryId: 'sal_salaire' },
    { id: 'c', accountId: 'bnp', date: '2026-10-05', label: 'Vers Revolut', amount: -200, categoryId: 'virement' },
    { id: 'd', accountId: 'revolut', date: '2026-10-06', label: 'Carrefour City', amount: -42.3 },
    { id: 'e', accountId: 'binance', date: '2026-10-06', label: 'ignorée (crypto)', amount: 999 },
  ];
  s.cryptoHistory.binance = [{ date: '2026-10-01', value: 1000 }, { date: '2026-10-06', value: 1150 }];
  const all = s.accounts.map((a) => a.id);
  const src = C.changeSources(s, all, '2026-10-01', '2026-10-06', { skipInternal: true });
  assert.deepEqual(src.map((x) => [x.label, x.amount]), [['Salaire ACME', 1800], ['Binance · valeur', 150], ['Carrefour City', -42.3]]);
  // Sans filtre, le virement interne apparaît ; sur un seul compte, seules ses opérations comptent.
  assert.equal(C.changeSources(s, all, '2026-10-01', '2026-10-06').length, 4);
  assert.deepEqual(C.changeSources(s, ['revolut'], '2026-10-01', '2026-10-06').map((x) => x.amount), [-42.3]);
  // La date de départ est exclue : le loyer du 1er n'explique pas la variation suivante.
  assert.ok(!src.some((x) => x.label === 'Loyer'));
});

console.log(`\n${ok} tests OK`);
