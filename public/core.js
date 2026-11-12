// Logique pure (sans DOM) : modèle de données, libellés, soldes, statistiques.
// Testable sous Node : `node tests/core.test.mjs`.

export const uid = () =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);

const z = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
export const todayISO = () => iso(new Date());
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return iso(new Date(y, m - 1, d + n));
}

export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}`;
}

export function norm(s) {
  return (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ------------------------------------------------------------------ */
/* État par défaut                                                     */
/* ------------------------------------------------------------------ */

// Catalogue : catégories principales et leurs sous-catégories (kind et couleur hérités du parent).
const CATALOG = [
  ['logement', 'Logement', '🏠', '#5B8DEF', 'depense', [
    ['log_loyer', 'Loyer & résidence', '🔑'], ['log_energie', 'Énergie & box', '💡'], ['log_laverie', 'Laverie', '🧺'], ['log_assurance', 'Assurance habitation', '🛡️']]],
  ['courses', 'Courses', '🛒', '#2FB67C', 'depense', [
    ['crs_super', 'Supermarché', '🛒'], ['crs_bouche', 'Boulangerie & boucherie', '🥖'], ['crs_livraison', 'Courses en ligne', '📦']]],
  ['resto', 'Restaurants', '🍽️', '#F08A4B', 'depense', [
    ['rst_resto', 'Restaurant', '🍽️'], ['rst_fastfood', 'Fast-food', '🍔'], ['rst_livraison', 'Livraison de repas', '🛵'], ['rst_snack', 'Distributeurs & cafés', '☕'], ['rst_cantine', 'Cantine & Crous', '🏫']]],
  ['transport', 'Transport', '🚆', '#8E6CEF', 'depense', [
    ['trp_commun', 'Métro, bus & tram', '🚇'], ['trp_train', 'Train', '🚆'], ['trp_car', 'Car longue distance', '🚌'], ['trp_vtc', 'VTC & taxi', '🚕'], ['trp_velo', 'Vélo & trottinette', '🚲'], ['trp_carburant', 'Carburant & péage', '⛽'], ['trp_amende', 'Amendes', '🚨']]],
  ['voyages', 'Voyages', '✈️', '#3FA0D9', 'depense', [
    ['voy_avion', 'Avion', '✈️'], ['voy_hebergement', 'Hébergement', '🏨'], ['voy_agence', 'Agences & réservations', '🧳'], ['voy_change', 'Change de devises', '💱']]],
  ['abos', 'Abonnements', '📱', '#E5577A', 'depense', [
    ['abo_tel', 'Téléphone & internet', '📱'], ['abo_sport', 'Salle de sport', '🏋️'], ['abo_logiciel', 'Logiciels & IA', '💻'], ['abo_streaming', 'Streaming & musique', '🎬']]],
  ['shopping', 'Shopping', '🛍️', '#D9A020', 'depense', [
    ['shp_vetements', 'Vêtements & chaussures', '👕'], ['shp_enligne', 'Achats en ligne', '📦'], ['shp_maison', 'Maison & déco', '🛋️'], ['shp_tech', 'High-tech', '🖥️']]],
  ['sante', 'Santé', '💊', '#2BB5C9', 'depense', [
    ['san_pharma', 'Pharmacie', '💊'], ['san_medecin', 'Médecin & téléconsultation', '🩺'], ['san_mutuelle', 'Mutuelle', '🛡️']]],
  ['soins', 'Beauté & soins', '💇', '#E07BB0', 'depense', [
    ['soi_coiffeur', 'Coiffeur & barbier', '💈'], ['soi_esthetique', 'Esthétique', '✨'], ['soi_parfum', 'Parfumerie', '🌸']]],
  ['loisirs', 'Loisirs', '🎉', '#C26DD6', 'depense', [
    ['lsr_cinema', 'Cinéma', '🎬'], ['lsr_sorties', 'Sorties & bars', '🍻'], ['lsr_jeux', 'Jeux', '🎮'], ['lsr_tabac', 'Tabac', '🚬']]],
  ['education', 'Formation', '🎓', '#4F8FBF', 'depense', [
    ['edu_formation', 'Cours & formations', '📚']]],
  ['famille', 'Famille & proches', '👪', '#B98454', 'depense', [
    ['fam_envoi', 'Aide à la famille', '💸']]],
  ['impots', 'Impôts & frais', '🧾', '#8A94A6', 'depense', [
    ['imp_banque', 'Frais bancaires', '🏦'], ['imp_admin', 'Démarches & timbres', '📄'], ['imp_poste', 'Courrier', '✉️'], ['imp_impots', 'Impôts', '🏛️']]],
  ['cadeaux', 'Cadeaux', '🎁', '#EF6F6C', 'depense', []],
  ['autre_dep', 'Autres dépenses', '❔', '#A3A9B5', 'depense', [
    ['aut_especes', 'Retraits d’espèces', '💵'], ['aut_litige', 'Prélèvements contestés', '⚠️']]],
  ['salaire', 'Salaire', '💼', '#1F9D6B', 'revenu', [
    ['sal_salaire', 'Salaire', '💼'], ['sal_prime', 'Primes', '🎯']]],
  ['aides', 'Aides & allocations', '🏛️', '#3BAA8F', 'revenu', [
    ['aid_logement', 'APL & aides au logement', '🏠'], ['aid_caf', 'CAF', '👶']]],
  ['autres_rev', 'Autres revenus', '💶', '#4CB98A', 'revenu', [
    ['rev_remb', 'Remboursements', '↩️'], ['rev_famille', 'Aide de la famille', '👪']]],
  ['virement', 'Virement interne', '🔁', '#7C8798', 'neutre', []],
  ['prets', 'Prêts & avances', '🤝', '#9C7BD1', 'neutre', []],
  ['invest', 'Épargne & invest.', '📈', '#5E7CE2', 'neutre', [
    ['inv_crypto', 'Crypto', '🪙']]],
];

export const DEFAULT_CATEGORIES = [
  ...CATALOG.flatMap(([id, name, icon, color, kind, subs]) => [
    { id, name, icon, color, kind },
    ...subs.map(([sid, sname, sicon]) => ({ id: sid, name: sname, icon: sicon, color, kind, parent: id })),
  ]),
  { id: 'ajust', name: 'Ajustement de solde', icon: '⚖️', color: '#9AA3B2', kind: 'neutre', system: true },
];
export const CATALOG_VERSION = 3;

// Mots-clés -> catégorie. La règle la plus longue gagne (« uber eats » avant « uber »).
const DEFAULT_RULES = {
  crs_super: ['carrefour', 'leclerc', 'auchan', 'lidl', 'aldi', 'monoprix', 'franprix', 'intermarche', 'super u', 'casino', 'picard', 'grand frais', 'biocoop', 'naturalia', 'netto', 'g20'],
  crs_bouche: ['boulangerie', 'boucherie', 'fournil', 'paul'],
  rst_livraison: ['uber eats', 'deliveroo', 'just eat'],
  rst_fastfood: ['mcdonald', 'mcdo', 'burger king', 'kfc', 'quick', 'subway', 'five guys', 'o tacos', 'otacos'],
  rst_resto: ['restaurant', 'sushi', 'brasserie', 'pizzeria'],
  rst_snack: ['starbucks', 'selecta', 'nyx'],
  rst_cantine: ['crous'],
  trp_vtc: ['uber', 'bolt', 'heetch', 'g7'],
  trp_train: ['sncf', 'ouigo', 'trainline', 'omio'],
  trp_car: ['blablacar', 'flixbus', 'flix'],
  trp_commun: ['ratp', 'navigo', 'ilevia', 'bibus', 'tcl', 'star rennes'],
  trp_velo: ['lime', 'velozef', 'dott', 'tier'],
  trp_carburant: ['totalenergies', 'esso', 'shell', 'avia', 'peage', 'autoroute'],
  trp_amende: ['amende', 'antai'],
  abo_streaming: ['netflix', 'spotify', 'amazon prime', 'disney plus', 'disney+', 'canal+', 'deezer', 'youtube premium'],
  abo_tel: ['free mobile', 'sfr', 'bouygues', 'sosh', 'orange', 'nrj mobile', 'free box', 'freebox', 'livebox'],
  abo_logiciel: ['chatgpt', 'openai', 'claude.ai', 'anthropic', 'icloud', 'google one', 'apple.com', 'grammarly'],
  abo_sport: ['basic fit', 'fitness park', 'on air'],
  shp_enligne: ['amazon', 'aliexpress', 'temu', 'cdiscount', 'rakuten', 'vinted', 'shein'],
  shp_vetements: ['zalando', 'zara', 'h&m', 'primark', 'uniqlo', 'pull and bear', 'newyorker', 'kiabi', 'celio', 'jules', 'eram', 'la redoute'],
  shp_maison: ['ikea', 'leroy merlin', 'action', 'gifi', 'maisons du monde'],
  shp_tech: ['fnac', 'darty', 'boulanger', 'apple store'],
  san_pharma: ['pharmacie', 'phcie'],
  san_medecin: ['doctolib', 'medecin', 'dentiste', 'opticien', 'laboratoire', 'teleconsultation'],
  san_mutuelle: ['mutuelle'],
  soi_coiffeur: ['coiffeur', 'barber', 'barbier'],
  soi_parfum: ['sephora', 'nocibe', 'marionnaud'],
  lsr_cinema: ['cinema', 'ugc', 'pathe', 'kinepolis'],
  lsr_jeux: ['steam', 'playstation', 'nintendo', 'xbox'],
  lsr_sorties: ['ticketmaster', 'fnac spectacles'],
  voy_avion: ['ryanair', 'easyjet', 'air france', 'transavia', 'vueling', 'kiwi.com'],
  voy_hebergement: ['airbnb', 'booking', 'hotel'],
  imp_impots: ['dgfip', 'impot', 'tresor public'],
  imp_admin: ['timbre fiscal', 'urssaf'],
  imp_poste: ['la poste', 'merci facteur'],
  log_loyer: ['loyer'],
  log_energie: ['edf', 'engie', 'veolia', 'totalenergies electricite'],
  log_assurance: ['assurance habitation'],
  log_laverie: ['laverie', 'lavanor'],
  fam_envoi: ['sendwave', 'taptap send', 'western union', 'remitly', 'wise'],
  aid_caf: ['caf du', 'caf de'],
  aid_logement: ['apl', 'action logement'],
  virement: ['livret', 'bnp', 'revolut', 'top-up', 'top up', 'virement interne', 'compte de cheques', 'depot initial', "compte d'epargne"],
  inv_crypto: ['binance', 'coinbase', 'kraken'],
  invest: ['trade republic', 'boursorama bourse', 'degiro'],
  sal_salaire: ['salaire', 'salary', 'payroll', 'paie', 'remuneration'],
};

export function defaultRules() {
  const rules = [];
  for (const [categoryId, patterns] of Object.entries(DEFAULT_RULES)) {
    for (const pattern of patterns) rules.push({ id: uid(), pattern, categoryId, auto: true });
  }
  return rules;
}

export function defaultState() {
  return {
    version: 1,
    updatedAt: 0,
    catalog: CATALOG_VERSION,
    accounts: [
      { id: 'revolut', name: 'Revolut', institution: 'Revolut', type: 'courant', openingBalance: 0, color: '#5B8DEF' },
      { id: 'bnp', name: 'BNP', institution: 'BNP Paribas', type: 'courant', openingBalance: 0, color: '#2FB67C' },
      { id: 'binance', name: 'Binance', institution: 'Binance', type: 'crypto', openingBalance: 0, color: '#E0A526' },
    ],
    transactions: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    labels: [],
    rules: defaultRules(),
    crypto: {}, // accountId -> { holdings, totalEur, updatedAt }
    cryptoHistory: {}, // accountId -> [{ date, value }]
    settings: { apiToken: '', hideAmounts: false, theme: 'auto' },
    budgets: {}, // catégorie principale -> plafond mensuel (€)
    claudeNote: null, // { date, title, sections: [{ h, p }] }
    bank: { links: [], pending: null }, // links: [{ uid, accountId, aspsp, country, name, iban, validUntil, lastSync }]
  };
}

// Catégorie principale d'une catégorie (elle-même si elle n'a pas de parent).
export function rootOf(state, id) {
  const c = state.categories.find((x) => x.id === id);
  return c?.parent && state.categories.some((x) => x.id === c.parent) ? c.parent : id;
}
export const childrenOf = (state, id) => state.categories.filter((c) => c.parent === id);

/* ------------------------------------------------------------------ */
/* Catégorisation                                                      */
/* ------------------------------------------------------------------ */

export function ruleMatches(rule, label) {
  const p = norm(rule.pattern);
  if (!p) return false;
  return new RegExp(`(^|[^a-z0-9])${escRe(p)}($|[^a-z0-9])`).test(norm(label));
}

export function categorize(label, rules) {
  const sorted = [...rules].sort((a, b) => {
    // Les règles créées par l'utilisateur passent avant les règles par défaut.
    if (!!a.auto !== !!b.auto) return a.auto ? 1 : -1;
    return norm(b.pattern).length - norm(a.pattern).length;
  });
  const hit = sorted.find((r) => ruleMatches(r, label));
  return hit ? hit.categoryId : null;
}

const NOISE = [
  'paiement par carte', 'paiement carte', 'facture carte', 'achat cb', 'carte x', 'carte', 'cb',
  'prlv sepa', 'prelevement sepa', 'prelevement', 'prlv', 'vir sepa recu', 'vir sepa emis', 'vir sepa',
  'virement sepa', 'virement recu', 'virement emis', 'virement', 'vir inst', 'vir', 'retrait dab', 'achat', 'paiement',
  'to', 'from', 'de', 'du', 'des', 'chez', 'payment', 'card',
];

// Propose un mot-clé lisible à partir d'un libellé bancaire bruité.
export function suggestKeyword(label) {
  let s = norm(label)
    .replace(/\d{2}[/.-]\d{2}([/.-]\d{2,4})?/g, ' ')
    .replace(/\bx{0,4}\d{3,}\b/g, ' ')
    .replace(/[*#:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of NOISE) {
      if (s === n) continue;
      if (s.startsWith(n + ' ')) {
        s = s.slice(n.length + 1).trim();
        changed = true;
      }
    }
  }
  const words = s.split(' ').filter((w) => w.length > 1 && !/^\d+$/.test(w));
  const stop = ['du', 'de', 'des', 'la', 'le', 'les', 'et', 'au', 'aux'];
  const kw = words.length > 1 && !stop.includes(words[1]) ? words.slice(0, 2) : words.slice(0, 1);
  return kw.join(' ') || norm(label).slice(0, 20);
}

/* ------------------------------------------------------------------ */
/* Montants & libellés                                                 */
/* ------------------------------------------------------------------ */

// Lit un montant saisi à la main (« 1 234,56 », « 12.5 », « -8,00 € »).
export function parseAmount(s) {
  let t = String(s ?? '').replace(/[\s  €]/g, '').replace(/eur$/i, '');
  if (!t) return null;
  const lc = t.lastIndexOf(',');
  const ld = t.lastIndexOf('.');
  if (lc > -1 && ld > -1) t = lc > ld ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (lc > -1) t = t.replace(',', '.');
  const v = parseFloat(t.replace(/[^0-9.+-]/g, ''));
  return Number.isNaN(v) ? null : v;
}

const SMALL = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'a', 'au', 'aux', 'sur', 'en', 'd', 'l']);
const UPPER = new Set(['sas', 'sarl', 'sa', 'sc', 'eurl', 'sncf', 'ratp', 'edf', 'bnp', 'sfr', 'kfc', 'eer']);
function titleCase(s) {
  return s.toLowerCase().split(' ').map((w, i) => {
    if (!w) return w;
    if (i > 0 && SMALL.has(w)) return w;
    if (UPPER.has(w)) return w.toUpperCase();
    if (w === 'mme') return 'Mme';
    if (w === 'mlle') return 'Mlle';
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

const PRETTY = [
  [/^FACTURE CARTE DU \d{6} (.+?) CARTE \d{4}X+\d{4}/i, (m) => m[1]],
  [/^RETRAIT DAB/i, () => 'Retrait d’espèces'],
  [/^VRST ESPECES/i, () => 'Dépôt d’espèces'],
  [/^PRLV SEPA (.+?)(?: ECH\/| \/| REF| ID |$)/i, (m) => m[1]],
  [/^VIRT? CPTE A CPTE EMIS SUR LE L\.?A/i, () => 'Virement vers le Livret A'],
  [/^VIR(?:EMENT)? SEPA(?: INST)? RECU \/DE (.+?) \/(?:REF|MOTIF)/i, (m) => `Virement de ${titleCase(m[1])}`],
  [/^VIR(?:EMENT)? SEPA(?: INST)? EMIS .*?\/BEN (.+?) \/(?:REF|MOTIF)/i, (m) => `Virement à ${titleCase(m[1])}`],
  [/^Virement \/DE .*?\/MOTIF VIREMENT VERS LIVRET A/i, () => 'Virement vers le Livret A'],
  [/^Virement à \/MOTIF VIREMENT VERS COMPTE DE CHEQUES/i, () => 'Virement vers le compte courant'],
  [/^COMMISSIONS COTISATION .*OFFRE GROUPEE/i, () => 'Frais du forfait bancaire'],
  [/^RETROCESSION .*COTISATION/i, () => 'Remise sur le forfait bancaire'],
  [/^REMBOURSEMENT ANTICIPE/i, () => 'Remboursement'],
];

// Transforme un libellé bancaire brut en nom lisible (« Pharmacie du Centre »).
export function prettyLabel(raw) {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return 'Opération';
  let out = s;
  for (const [re, fn] of PRETTY) {
    const m = s.match(re);
    if (m) { out = fn(m); break; }
  }
  out = out.replace(/[*_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (out === out.toUpperCase() && /[A-Z]/.test(out)) out = titleCase(out);
  return out.length > 60 ? `${out.slice(0, 58).trim()}…` : out;
}

// Nom affiché d'une opération : nom choisi par l'utilisateur, sinon libellé nettoyé.
export const displayName = (t) => t.title || prettyLabel(t.label);

/* ------------------------------------------------------------------ */
/* Synchro bancaire (Enable Banking)                                   */
/* ------------------------------------------------------------------ */

const BALANCE_ORDER = ['CLBD', 'ITBD', 'XPCD', 'CLAV', 'ITAV', 'OTHR', 'PRCD', 'INFO'];

// Soldes « comptabilisés » : n'incluent pas les opérations en attente.
const BOOKED_TYPES = new Set(['CLBD', 'ITBD', 'OPBD', 'PRCD']);

export function pickBalanceInfo(balances = []) {
  const eur = balances.filter((b) => b.balance_amount && (!b.balance_amount.currency || b.balance_amount.currency === 'EUR'));
  const rank = (b) => { const i = BALANCE_ORDER.indexOf(b.balance_type); return i < 0 ? 99 : i; };
  const best = [...eur].sort((a, b) => rank(a) - rank(b))[0];
  const v = best ? parseFloat(best.balance_amount.amount) : NaN;
  return Number.isNaN(v) ? null : { value: round2(v), booked: BOOKED_TYPES.has(best.balance_type), type: best.balance_type };
}
export const pickBalance = (balances) => pickBalanceInfo(balances)?.value ?? null;

export function ebLabel(x) {
  const rem = (Array.isArray(x.remittance_information) ? x.remittance_information : [x.remittance_information])
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const cp = (x.credit_debit_indicator === 'DBIT' ? x.creditor?.name : x.debtor?.name)?.trim();
  let label = rem || cp || x.bank_transaction_code?.description || 'Opération';
  if (cp && rem && !norm(rem).includes(norm(cp))) label = `${cp} · ${rem}`;
  return label.slice(0, 140);
}

// Transforme les opérations reçues de la banque en opérations de l'app, sans doublon
// (ni avec une synchro précédente, ni avec un import CSV / une saisie du même jour et montant).
export function buildBankImport(state, accountId, ebUid, txs) {
  const keys = new Set(state.transactions.map((t) => t.importKey).filter(Boolean));
  const soft = new Map();
  for (const t of state.transactions) {
    if (t.accountId !== accountId || String(t.importKey || '').startsWith('eb|') || t.source === 'ajustement') continue;
    const k = `${t.date}|${t.amount.toFixed(2)}`;
    soft.set(k, (soft.get(k) || 0) + 1);
  }
  const seen = new Map();
  const items = [];
  const stats = { duplicates: 0, pending: 0, pendingSum: 0, foreign: 0, invalid: 0 };
  for (const x of txs) {
    if (x.status && x.status !== 'BOOK') {
      // En attente : pas importé, mais on garde le montant pour recaler le solde.
      const v = parseFloat(x.transaction_amount?.amount);
      if (!Number.isNaN(v) && (!x.transaction_amount?.currency || x.transaction_amount.currency === 'EUR')) {
        const signed = round2((x.credit_debit_indicator === 'DBIT' ? -1 : 1) * Math.abs(v));
        stats.pendingSum += signed;
        (stats.pendingItems ||= []).push({ date: x.transaction_date || x.value_date || x.booking_date || todayISO(), label: ebLabel(x), amount: signed });
      }
      stats.pending++;
      continue;
    }
    const cur = x.transaction_amount?.currency;
    if (cur && cur !== 'EUR') { stats.foreign++; continue; }
    const raw = parseFloat(x.transaction_amount?.amount);
    const date = x.booking_date || x.value_date || x.transaction_date;
    if (Number.isNaN(raw) || !date) { stats.invalid++; continue; }
    const amount = round2((x.credit_debit_indicator === 'DBIT' ? -1 : 1) * Math.abs(raw));
    const label = ebLabel(x);
    let ref = x.entry_reference || x.transaction_id;
    if (!ref) {
      const base = `${date}|${amount.toFixed(2)}|${norm(label)}`;
      const n = seen.get(base) || 0;
      seen.set(base, n + 1);
      ref = `${base}|${n}`;
    }
    const importKey = `eb|${ebUid}|${ref}`;
    if (keys.has(importKey)) { stats.duplicates++; continue; }
    const sk = `${date}|${amount.toFixed(2)}`;
    if (soft.get(sk) > 0) { soft.set(sk, soft.get(sk) - 1); stats.duplicates++; continue; }
    keys.add(importKey);
    items.push({
      id: uid(), accountId, date, label, amount,
      categoryId: categorize(label, state.rules), labels: [], note: '', source: 'banque', importKey,
    });
  }
  stats.pendingSum = round2(stats.pendingSum);
  return { items, stats };
}

// Recale le solde d'ouverture sur la banque. Les opérations en attente ne sont pas dans l'historique :
// si le solde reçu les inclut (solde disponible), on les retire de l'historique et on les garde à part
// (acc.pending) pour qu'aujourd'hui affiche bien le même solde que l'appli bancaire.
export function alignBalance(state, accountId, bankBalance, date = todayISO(), pending = 0, booked = true) {
  const acc = state.accounts.find((a) => a.id === accountId);
  if (!acc || bankBalance == null) return;
  const sum = state.transactions.filter((t) => t.accountId === accountId && t.date <= date).reduce((s, t) => s + t.amount, 0);
  const bookedBalance = booked ? bankBalance : bankBalance - pending;
  acc.openingBalance = round2(bookedBalance - sum);
  acc.pending = round2(pending);
}
const pendingAt = (acc, date) => (!date || date >= todayISO() ? acc.pending || 0 : 0);

/* ------------------------------------------------------------------ */
/* Soldes & patrimoine                                                 */
/* ------------------------------------------------------------------ */

export function cryptoValueAt(state, accountId, date = null) {
  if (!date || date >= todayISO()) {
    const cur = state.crypto[accountId];
    if (cur) return cur.totalEur;
  }
  const hist = state.cryptoHistory[accountId] || [];
  let v = 0;
  for (const p of hist) { if (!date || p.date <= date) v = p.value; else break; }
  return v;
}

export function accountBalance(state, acc, date = null) {
  if (acc.type === 'crypto') return round2(cryptoValueAt(state, acc.id, date));
  let b = acc.openingBalance || 0;
  for (const t of state.transactions) {
    if (t.accountId === acc.id && (!date || t.date <= date)) b += t.amount;
  }
  return round2(b + pendingAt(acc, date));
}

export function netWorth(state) {
  return round2(state.accounts.reduce((s, a) => s + accountBalance(state, a), 0));
}

export const TYPE_LABELS = { courant: 'Compte courant', epargne: 'Épargne', crypto: 'Crypto', invest: 'Investissement', autre: 'Autre' };

export function allocation(state) {
  const groups = {};
  for (const a of state.accounts) {
    const v = accountBalance(state, a);
    groups[a.type] = (groups[a.type] || 0) + v;
  }
  return groups;
}

export function firstDate(state) {
  let d = todayISO();
  for (const t of state.transactions) if (t.date < d) d = t.date;
  for (const h of Object.values(state.cryptoHistory)) if (h[0] && h[0].date < d) d = h[0].date;
  return d;
}

// Série du patrimoine total entre deux dates (≈ points réguliers).
export function netWorthSeries(state, from, to = todayISO(), maxPoints = 90) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const days = Math.max(1, Math.round((new Date(ty, tm - 1, td) - new Date(fy, fm - 1, fd)) / 864e5));
  const step = Math.max(1, Math.ceil(days / maxPoints));
  const dates = [];
  for (let i = 0; i <= days; i += step) dates.push(addDays(from, i));
  if (dates[dates.length - 1] !== to) dates.push(to);

  const fiat = state.accounts.filter((a) => a.type !== 'crypto');
  const fiatIds = new Set(fiat.map((a) => a.id));
  const txs = state.transactions.filter((t) => fiatIds.has(t.accountId)).sort((a, b) => (a.date < b.date ? -1 : 1));
  let base = fiat.reduce((s, a) => s + (a.openingBalance || 0), 0);
  let k = 0;
  const cryptos = state.accounts.filter((a) => a.type === 'crypto');
  return dates.map((date) => {
    while (k < txs.length && txs[k].date <= date) base += txs[k++].amount;
    const c = cryptos.reduce((s, a) => s + cryptoValueAt(state, a.id, date), 0);
    const p = fiat.reduce((s, a) => s + pendingAt(a, date), 0);
    return { date, value: round2(base + c + p) };
  });
}

// Dates régulièrement espacées entre deux jours (au plus maxPoints points).
export function seriesDates(from, to = todayISO(), maxPoints = 120) {
  const days = Math.max(1, Math.round((toDay(to) - toDay(from)) / 864e5));
  const step = Math.max(1, Math.ceil(days / maxPoints));
  const dates = [];
  for (let i = 0; i <= days; i += step) dates.push(addDays(from, i));
  if (dates[dates.length - 1] !== to) dates.push(to);
  return dates;
}
const toDay = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); };

// Solde d'un compte à chaque date demandée.
export function accountSeries(state, acc, dates) {
  if (acc.type === 'crypto') return dates.map((d) => round2(cryptoValueAt(state, acc.id, d)));
  const txs = state.transactions.filter((t) => t.accountId === acc.id).sort((a, b) => (a.date < b.date ? -1 : 1));
  let b = acc.openingBalance || 0;
  let k = 0;
  return dates.map((d) => {
    while (k < txs.length && txs[k].date <= d) b += txs[k++].amount;
    return round2(b + pendingAt(acc, d));
  });
}

// Ce qui fait bouger la courbe entre deux points (from exclu, to inclus) : opérations, valeur crypto,
// opérations en attente. Triée par impact. skipInternal retire les virements internes (neutres sur le total).
export function changeSources(state, accountIds, from, to, { skipInternal = false } = {}) {
  const accs = state.accounts.filter((a) => accountIds.includes(a.id));
  const fiat = new Set(accs.filter((a) => a.type !== 'crypto').map((a) => a.id));
  const out = [];
  for (const t of state.transactions) {
    if (!fiat.has(t.accountId) || t.date <= from || t.date > to || !t.amount) continue;
    if (skipInternal && rootOf(state, t.categoryId) === 'virement') continue;
    out.push({ label: displayName(t), amount: t.amount, accountId: t.accountId });
  }
  for (const a of accs) {
    const d = a.type === 'crypto'
      ? round2(cryptoValueAt(state, a.id, to) - cryptoValueAt(state, a.id, from))
      : round2(pendingAt(a, to) - pendingAt(a, from));
    if (Math.abs(d) >= 0.01) out.push({ label: a.type === 'crypto' ? `${a.name} · valeur` : `${a.name} · en attente`, amount: d, accountId: a.id });
  }
  return out.sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount));
}

export function recordCryptoSnapshot(state, accountId, value, date = todayISO()) {
  const hist = (state.cryptoHistory[accountId] ||= []);
  const last = hist[hist.length - 1];
  if (last && last.date === date) last.value = round2(value);
  else {
    hist.push({ date, value: round2(value) });
    hist.sort((a, b) => (a.date < b.date ? -1 : 1));
  }
}

/* ------------------------------------------------------------------ */
/* Statistiques de dépenses                                            */
/* ------------------------------------------------------------------ */

// Une opération peut être ventilée : t.splits = [{ amount, categoryId, note?, counterparty? }] (somme = t.amount).
// Les statistiques travaillent sur les parts ; les soldes restent calculés sur l'opération entière.
export function expandTx(state) {
  const out = [];
  for (const t of state.transactions) {
    if (Array.isArray(t.splits) && t.splits.length) {
      t.splits.forEach((p, i) => out.push({ ...t, id: `${t.id}#${i}`, parentId: t.id, amount: p.amount, categoryId: p.categoryId ?? null, note: p.note || t.note, counterparty: p.counterparty || t.counterparty, splits: undefined }));
    } else out.push(t);
  }
  // Opérations encore « en attente » à la banque : comptées dans les statistiques, jamais stockées
  // (la liste est remplacée à chaque synchro, l'opération validée arrive ensuite normalement).
  for (const t of pendingTx(state)) out.push(t);
  return out;
}

export function pendingTx(state) {
  const out = [];
  for (const l of state.bank?.links || []) {
    (l.pendingTx || []).forEach((p, i) => out.push({
      id: `pending:${l.uid}:${i}`, accountId: l.accountId, date: p.date, label: p.label, amount: p.amount,
      categoryId: categorize(p.label, state.rules), labels: [], note: '', source: 'attente', pending: true,
    }));
  }
  return out;
}

export function txKind(state, t) {
  const cat = state.categories.find((c) => c.id === t.categoryId);
  if (cat) return cat.kind || state.categories.find((c) => c.id === cat.parent)?.kind || 'depense';
  return t.amount < 0 ? 'depense' : 'revenu';
}

export function isSpendingAccount(state, accountId) {
  const a = state.accounts.find((x) => x.id === accountId);
  return a && a.type !== 'crypto';
}

// Nom de commerçant servant à regrouper (sans numéros de référence).
export const merchantOf = (t) => (t.title || prettyLabel(t.label)).replace(/\s+[\dA-Z]*\d{3,}.*$/, '').trim();

const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
const sortList = (m) => [...m.entries()].map(([id, amount]) => ({ id, amount: round2(amount) })).filter((x) => Math.abs(x.amount) >= 0.005).sort((a, b) => b.amount - a.amount);

// Bilan d'une période (mois inclus) : totaux, catégories avec sous-catégories, mois par mois, commerçants.
export function periodStats(state, fromYm, toYm = fromYm) {
  const months = [];
  for (let m = fromYm; m <= toYm; m = addMonths(m, 1)) months.push(m);
  const perMonth = months.map((ym) => ({ ym, expense: 0, income: 0, byRoot: {} }));
  const exp = new Map();
  const inc = new Map();
  const labels = new Map();
  const merchants = new Map();
  let expense = 0;
  let income = 0;
  let uncategorized = 0;
  for (const t of expandTx(state)) {
    const ym = t.date.slice(0, 7);
    if (ym < fromYm || ym > toYm || !isSpendingAccount(state, t.accountId)) continue;
    if (!t.categoryId) uncategorized++;
    const kind = txKind(state, t);
    if (kind === 'neutre') continue;
    const root = t.categoryId ? rootOf(state, t.categoryId) : '_none';
    const sub = t.categoryId && t.categoryId !== root ? t.categoryId : root;
    const pm = perMonth[months.indexOf(ym)];
    if (kind === 'depense') {
      const v = -t.amount;
      expense += v;
      if (!exp.has(root)) exp.set(root, new Map());
      add(exp.get(root), sub, v);
      pm.expense += v;
      pm.byRoot[root] = (pm.byRoot[root] || 0) + v;
      for (const l of t.labels || []) add(labels, l, v);
      const key = merchantOf(t);
      const mm = merchants.get(key) || { name: key, amount: 0, count: 0, categoryId: t.categoryId };
      mm.amount += v;
      mm.count++;
      merchants.set(key, mm);
    } else {
      const v = t.amount;
      income += v;
      if (!inc.has(root)) inc.set(root, new Map());
      add(inc.get(root), sub, v);
      pm.income += v;
    }
  }
  const tree = (m) => [...m.entries()].map(([id, subs]) => {
    const list = sortList(subs);
    return { id, amount: round2(list.reduce((s, x) => s + x.amount, 0)), subs: list };
  }).filter((x) => Math.abs(x.amount) >= 0.005).sort((a, b) => b.amount - a.amount);
  const net = round2(income - expense);
  return {
    months,
    expense: round2(expense),
    income: round2(income),
    net,
    savingsRate: income > 0 ? net / income : null,
    byCat: tree(exp),
    byIncome: tree(inc),
    byLabel: sortList(labels),
    perMonth: perMonth.map((p) => ({ ...p, expense: round2(p.expense), income: round2(p.income) })),
    merchants: [...merchants.values()].filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount).map((x) => ({ ...x, amount: round2(x.amount) })),
    uncategorized,
  };
}

// Grands groupes de dépenses (affichés dans le camembert du bilan).
export const GROUPS = [
  { id: 'g_quotidien', name: 'Vie quotidienne', icon: '🧺', color: 'var(--s1)', cats: ['courses', 'resto', 'sante', 'soins'] },
  { id: 'g_logement', name: 'Logement & charges', icon: '🏠', color: 'var(--s2)', cats: ['logement', 'abos', 'impots'] },
  { id: 'g_mobilite', name: 'Transport & voyages', icon: '🚆', color: 'var(--s3)', cats: ['transport', 'voyages'] },
  { id: 'g_plaisirs', name: 'Shopping & loisirs', icon: '🛍️', color: 'var(--s4)', cats: ['shopping', 'loisirs', 'cadeaux'] },
  { id: 'g_famille', name: 'Famille', icon: '👪', color: 'var(--s5)', cats: ['famille'] },
  { id: 'g_autres', name: 'Autres', icon: '📦', color: 'var(--s-other)', cats: ['education', 'autre_dep', '_none'] },
];
export const groupOf = (rootId) => GROUPS.find((g) => g.cats.includes(rootId))?.id || 'g_autres';

// Regroupe la liste « byCat » d'un bilan par grand groupe.
export function groupTree(byCat) {
  const map = new Map();
  for (const c of byCat) {
    const gid = groupOf(c.id);
    const e = map.get(gid) || { id: gid, amount: 0, cats: [] };
    e.amount += c.amount;
    e.cats.push(c);
    map.set(gid, e);
  }
  return [...map.values()].map((e) => ({ ...e, amount: round2(e.amount) })).filter((e) => Math.abs(e.amount) >= 0.005).sort((a, b) => b.amount - a.amount);
}

export function monthStats(state, ym) {
  return periodStats(state, ym, ym);
}

export function monthlyTotals(state, endYm, n = 6) {
  const p = periodStats(state, addMonths(endYm, -(n - 1)), endYm);
  return p.perMonth.map(({ ym, expense, income }) => ({ ym, expense, income }));
}

// Dépenses qui reviennent chaque mois (abonnements, loyer…) sur les 6 derniers mois.
export function recurring(state, endYm, months = 6) {
  const fromYm = addMonths(endYm, -(months - 1));
  const g = new Map();
  for (const t of expandTx(state)) {
    const ym = t.date.slice(0, 7);
    if (ym < fromYm || ym > endYm || t.amount >= 0 || !isSpendingAccount(state, t.accountId) || txKind(state, t) !== 'depense') continue;
    const key = merchantOf(t);
    const e = g.get(key) || { name: key, months: new Set(), total: 0, last: t.date, categoryId: t.categoryId };
    e.months.add(ym);
    e.total -= t.amount;
    if (t.date > e.last) e.last = t.date;
    g.set(key, e);
  }
  return [...g.values()]
    .filter((e) => e.months.size >= 3)
    .map((e) => ({ name: e.name, categoryId: e.categoryId, monthly: round2(e.total / e.months.size), months: e.months.size, last: e.last }))
    .sort((a, b) => b.monthly - a.monthly);
}

/* ------------------------------------------------------------------ */
/* Bilan Claude : analyse détaillée, recalculée à chaque ouverture     */
/* ------------------------------------------------------------------ */

const AVOIDABLE = {
  trp_amende: 'Amendes de transport',
  imp_banque: 'Frais bancaires',
  rst_livraison: 'Livraison de repas',
  rst_snack: 'Distributeurs & cafés',
  aut_litige: 'Prélèvements contestés',
};
const DISCRETIONARY = ['shopping', 'resto', 'loisirs', 'soins', 'voyages'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r10 = (v) => Math.round(v / 10) * 10;

export function analysis(state, endYm = todayISO().slice(0, 7)) {
  // 12 derniers mois complets (le mois en cours, incomplet, fausserait les moyennes).
  const to = addMonths(endYm, -1);
  // On ignore le tout premier mois s'il est incomplet (historique commencé en cours de mois).
  const first = firstDate(state);
  const firstFull = Number(first.slice(8, 10)) <= 3 ? first.slice(0, 7) : addMonths(first.slice(0, 7), 1);
  const from = addMonths(endYm, -12) > firstFull ? addMonths(endYm, -12) : firstFull;
  const year = periodStats(state, from, to);
  const active = year.perMonth.filter((m) => m.income > 0 || m.expense > 0);
  const nb = Math.max(1, active.length);
  const recentFrom = addMonths(endYm, -3);
  const recent = periodStats(state, recentFrom, to);
  const nbRecent = Math.max(1, recent.perMonth.filter((m) => m.income > 0 || m.expense > 0).length);

  const avgIncome = year.income / nb;
  const avgExpense = year.expense / nb;
  const avgSavings = avgIncome - avgExpense;
  const rate = avgIncome > 0 ? avgSavings / avgIncome : null;

  const byType = {};
  for (const a of state.accounts) byType[a.type] = (byType[a.type] || 0) + accountBalance(state, a);
  const liquid = byType.courant || 0;
  const savings = (byType.epargne || 0) + (byType.invest || 0);
  const crypto = byType.crypto || 0;
  const worth = netWorth(state);
  const emergencyMonths = avgExpense > 0 ? savings / avgExpense : null;
  const bufferMonths = avgExpense > 0 ? liquid / avgExpense : null;
  const cryptoShare = worth > 0 ? crypto / worth : 0;

  // Catégories : moyenne mensuelle sur 12 mois vs 3 derniers mois.
  const recentMap = new Map(recent.byCat.map((c) => [c.id, c.amount / nbRecent]));
  const categories = year.byCat.map((c) => {
    const avg = c.amount / nb;
    const last3 = recentMap.get(c.id) || 0;
    return { id: c.id, total: c.amount, avg: round2(avg), last3: round2(last3), trend: avg > 0 ? (last3 - avg) / avg : 0, share: year.expense ? c.amount / year.expense : 0, subs: c.subs };
  });

  // Dépenses évitables.
  const avoidable = [];
  for (const c of year.byCat) for (const s of c.subs) if (AVOIDABLE[s.id] && s.amount > 0) avoidable.push({ id: s.id, name: AVOIDABLE[s.id], total: s.amount });
  avoidable.sort((a, b) => b.total - a.total);

  const rec = recurring(state, to);
  const deficits = year.perMonth.filter((m) => m.expense > m.income && (m.income > 0 || m.expense > 0)).map((m) => {
    const main = Object.entries(m.byRoot).sort((a, b) => b[1] - a[1])[0];
    return { ym: m.ym, gap: round2(m.expense - m.income), income: m.income, expense: m.expense, mainCat: main?.[0] || null, mainAmount: round2(main?.[1] || 0) };
  });

  // Grosses dépenses ponctuelles (≥ 150 €).
  const big = expandTx(state)
    .filter((t) => t.date.slice(0, 7) >= from && t.date.slice(0, 7) <= to && t.amount <= -150 && isSpendingAccount(state, t.accountId) && txKind(state, t) === 'depense')
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 10)
    .map((t) => ({ id: t.parentId || t.id, date: t.date, name: merchantOf(t), amount: -t.amount, categoryId: t.categoryId }));

  // Prêts & avances : solde par personne (positif = on te doit).
  const loanMap = new Map();
  for (const t of expandTx(state)) {
    if (rootOf(state, t.categoryId) !== 'prets') continue;
    // Personne concernée : champ « counterparty » s'il existe, sinon le nom tiré du libellé.
    const raw = t.counterparty || merchantOf(t).replace(/^(virement (de|à)|to|from|payment from|envoyé depuis revolut to)\s+/i, '').replace(/\s·.*$/, '');
    const who = raw.replace(/^(m|mme|mlle|mr|monsieur|madame)\.?\s+/i, '').trim() || 'Inconnu';
    const key = norm(who);
    const pretty = who.toLowerCase().replace(/(^|[\s(-])(\p{L})/gu, (m0, a, b) => a + b.toUpperCase());
    const e = loanMap.get(key) || { name: pretty, lent: 0, back: 0 };
    if (t.amount < 0) e.lent -= t.amount; else e.back += t.amount;
    loanMap.set(key, e);
  }
  for (const dbt of state.debts || []) {
    const key = norm(dbt.who);
    const e = loanMap.get(key) || { name: dbt.who, lent: 0, back: 0 };
    if (dbt.amount > 0) e.lent += dbt.amount; else e.back -= dbt.amount;
    (e.notes ||= []).push(dbt.note);
    loanMap.set(key, e);
  }
  const loans = [...loanMap.values()].map((e) => ({ ...e, owed: round2(e.lent - e.back) })).filter((e) => Math.abs(e.owed) >= 1).sort((a, b) => b.owed - a.owed);

  // Projection à 12 mois.
  const shopping = categories.find((c) => c.id === 'shopping');
  const shopTarget = 150;
  const shopGain = shopping && shopping.avg > shopTarget ? (shopping.avg - shopTarget) * 12 : 0;
  const projection = { now: worth, in12: round2(worth + avgSavings * 12), in12Better: round2(worth + avgSavings * 12 + shopGain) };

  // Score de santé financière sur 100.
  const parts = [
    { key: 'Taux d’épargne', pts: rate == null ? 0 : clamp((rate / 0.2) * 30, 0, 30), max: 30 },
    { key: 'Matelas de sécurité', pts: emergencyMonths == null ? 0 : clamp((emergencyMonths / 3) * 25, 0, 25), max: 25 },
    { key: 'Trésorerie courante', pts: bufferMonths == null ? 0 : clamp(bufferMonths * 15, 0, 15), max: 15 },
    { key: 'Régularité', pts: clamp(15 - deficits.length * 3, 0, 15), max: 15 },
    { key: 'Risque (crypto)', pts: cryptoShare <= 0.2 ? 10 : cryptoShare <= 0.4 ? 5 : 0, max: 10 },
    { key: 'Suivi des données', pts: year.uncategorized === 0 ? 5 : clamp(5 - year.uncategorized / 20, 0, 5), max: 5 },
  ].map((p) => ({ ...p, pts: Math.round(p.pts) }));
  const score = parts.reduce((s, p) => s + p.pts, 0);

  // Actions recommandées, chiffrées.
  const actions = [];
  if (bufferMonths != null && bufferMonths < 1) {
    actions.push({ prio: 1, title: 'Garde un mois de dépenses sur ton compte courant', detail: `Tes comptes courants ne contiennent que ${Math.round(liquid)} € pour environ ${Math.round(avgExpense)} € de dépenses par mois : un imprévu et c’est le découvert. Vise ${r10(avgExpense)} € en permanence.`, gain: null });
  }
  if (rate != null && rate < 0.2 && avgIncome > 0) {
    const auto = Math.max(50, r10(avgIncome * 0.1));
    actions.push({ prio: 2, title: `Programme un virement automatique de ${auto} € vers ton livret`, detail: 'Le jour où ton salaire arrive, pas à la fin du mois : on épargne ce qu’on met de côté d’abord, pas ce qui reste.', gain: auto * 12 });
  }
  if (shopGain > 0) {
    actions.push({ prio: 2, title: `Plafonne le shopping à ${shopTarget} € par mois`, detail: `Tu y mets en moyenne ${Math.round(shopping.avg)} € par mois, dont une grosse part en achats en ligne. Attendre 48 h avant un achat non essentiel suffit souvent.`, gain: Math.round(shopGain) });
  }
  const fines = avoidable.find((a) => a.id === 'trp_amende');
  if (fines) actions.push({ prio: 2, title: 'Plus aucune amende de transport', detail: `${Math.round(fines.total)} € d’amendes sur l’année : un abonnement ou un ticket validé à chaque trajet revient moins cher.`, gain: Math.round(fines.total) });
  const eatOut = categories.find((c) => c.id === 'resto');
  if (eatOut && eatOut.avg > 80) actions.push({ prio: 3, title: 'Réduis les repas et snacks dehors', detail: `${Math.round(eatOut.avg)} € par mois en restaurants, distributeurs et livraisons. Préparer quelques repas et en-cas à l’avance divise souvent ce poste par deux.`, gain: Math.round(eatOut.avg * 0.4 * 12) });
  if (emergencyMonths != null && emergencyMonths < 3) actions.push({ prio: 2, title: 'Monte ton matelas de sécurité à 3 mois', detail: `Il te manque ${Math.round(3 * avgExpense - savings)} € sur ton épargne de précaution.`, gain: null });
  if (cryptoShare > 0.25) actions.push({ prio: 3, title: 'Limite la crypto à 20–25 % de ton patrimoine', detail: `Elle en représente ${Math.round(cryptoShare * 100)} %. Tant que le livret n’est pas plus gros, évite d’y ajouter de l’argent.`, gain: null });
  for (const l of loans.filter((x) => x.owed > 0)) actions.push({ prio: 3, title: `${l.name} te doit ${Math.round(l.owed)} €`, detail: 'Pense à te faire rembourser : c’est de l’argent qui manque à ton épargne.', gain: Math.round(l.owed) });
  if (year.uncategorized > 0) actions.push({ prio: 4, title: `Classe les ${year.uncategorized} opérations restantes`, detail: 'Les moyennes et le score seront plus justes.', gain: null });
  actions.sort((a, b) => a.prio - b.prio || (b.gain || 0) - (a.gain || 0));

  return {
    from, to, months: nb, income: year.income, expense: year.expense,
    avgIncome: round2(avgIncome), avgExpense: round2(avgExpense), avgSavings: round2(avgSavings), rate,
    liquid: round2(liquid), savings: round2(savings), crypto: round2(crypto), worth, emergencyMonths, bufferMonths, cryptoShare,
    categories, avoidable, recurring: rec, deficits, big, loans, projection, shopGain: Math.round(shopGain),
    score, parts, actions, uncategorized: year.uncategorized, perMonth: year.perMonth,
  };
}

// Budgets mensuels par catégorie principale : dépensé ce mois-ci vs plafond.
export function budgetStatus(state, ym = todayISO().slice(0, 7)) {
  const p = periodStats(state, ym, ym);
  const [y, m] = ym.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = todayISO();
  const elapsed = ym === today.slice(0, 7) ? Number(today.slice(8, 10)) / daysInMonth : 1;
  return Object.entries(state.budgets || {}).filter(([, v]) => v > 0).map(([id, limit]) => {
    const spent = p.byCat.find((c) => c.id === id)?.amount || 0;
    return { id, limit, spent: round2(spent), ratio: spent / limit, pace: elapsed ? spent / (limit * elapsed) : 0 };
  }).sort((a, b) => b.ratio - a.ratio);
}

// Fusionne un élément de la boîte de dépôt sans rien écraser. Renvoie un résumé lisible.
export function mergeInboxItem(state, item) {
  const out = [];
  if (Array.isArray(item.categories)) {
    let n = 0;
    for (const c of item.categories) if (c?.id && !state.categories.some((x) => x.id === c.id)) { state.categories.push({ ...c }); n++; }
    if (n) out.push(`${n} catégorie${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''}`);
  }
  if (item.type === 'recat') {
    let n = 0;
    for (const a of item.assignments || []) {
      const t = state.transactions.find((x) => x.id === a.id);
      // Uniquement si l'opération n'a pas été reclassée entre-temps.
      if (t && (t.categoryId ?? null) === (a.from ?? null) && state.categories.some((c) => c.id === a.to)) { t.categoryId = a.to; n++; }
    }
    for (const r of item.rules || []) {
      const ex = state.rules.find((x) => !x.auto && norm(x.pattern) === norm(r.pattern));
      if (ex) ex.categoryId = r.categoryId; else state.rules.push({ id: uid(), pattern: r.pattern, categoryId: r.categoryId });
    }
    if (n) out.push(`${n} opération${n > 1 ? 's' : ''} classée${n > 1 ? 's' : ''}`);
  }
  if (item.type === 'account' && item.account?.id) {
    if (!state.accounts.some((a) => a.id === item.account.id)) {
      state.accounts.push({ openingBalance: 0, ...item.account });
      out.push(`compte « ${item.account.name} » ajouté`);
    }
  }
  if (item.type === 'rule' && item.pattern && item.categoryId) {
    if (!state.rules.some((r) => !r.auto && norm(r.pattern) === norm(item.pattern))) {
      const rule = { id: uid(), pattern: item.pattern, categoryId: item.categoryId };
      state.rules.push(rule);
      const n = applyRuleToUncategorized(state, rule);
      out.push(`règle « ${item.pattern} »${n ? ` (${n} op. classées)` : ''}`);
    }
  }
  const txs = item.transactions || [];
  if (txs.length) {
    const keys = new Set(state.transactions.map((t) => t.importKey).filter(Boolean));
    let n = 0;
    for (const t of txs) {
      if (!t.accountId || !state.accounts.some((a) => a.id === t.accountId) || (t.importKey && keys.has(t.importKey))) continue;
      state.transactions.push({
        id: uid(), labels: [], note: '', source: 'import', ...t,
        categoryId: t.categoryId ?? categorize(t.label, state.rules),
      });
      if (t.importKey) keys.add(t.importKey);
      n++;
    }
    if (n) out.push(`${n} opération${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''}`);
  }
  return out;
}

export function applyRuleToUncategorized(state, rule) {
  let n = 0;
  for (const t of state.transactions) {
    if (!t.categoryId && ruleMatches(rule, t.label)) { t.categoryId = rule.categoryId; n++; }
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Sauvegarde                                                          */
/* ------------------------------------------------------------------ */

export function migrate(raw) {
  const def = defaultState();
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.accounts)) throw new Error('Fichier de sauvegarde invalide');
  const s = { ...def, ...raw, settings: { ...def.settings, ...(raw.settings || {}) } };
  for (const c of def.categories) if (c.system && !s.categories.some((x) => x.id === c.id)) s.categories.push({ ...c });
  s.crypto ||= {};
  s.cryptoHistory ||= {};
  s.labels ||= [];
  s.budgets ||= {};
  s.debts ||= [];
  s.rules ||= [];
  s.bank = { links: [], pending: null, ...(raw.bank || {}) };
  if ((raw.catalog || 1) < CATALOG_VERSION) {
    for (const c of def.categories) if (!s.categories.some((x) => x.id === c.id)) s.categories.push({ ...c });
    s.rules = [...s.rules.filter((r) => !r.auto), ...defaultRules()];
    s.catalog = CATALOG_VERSION;
  }
  // Ancien compte par défaut « Livret BNP » encore vide -> compte courant BNP.
  const bnp = s.accounts.find((a) => a.id === 'bnp');
  if (bnp && bnp.name === 'Livret BNP' && bnp.type === 'epargne' && !bnp.openingBalance
    && !s.transactions.some((t) => t.accountId === 'bnp') && !s.bank.links.some((l) => l.accountId === 'bnp')) {
    Object.assign(bnp, { name: 'BNP', type: 'courant' });
  }
  return s;
}
