// Mode démo : un profil fictif (alternant en région parisienne), 14 mois d'opérations inventées.
// Les dates sont recalculées à partir d'aujourd'hui pour que la démo paraisse toujours à jour.
// Rien n'est enregistré : l'app tourne en mémoire, sans cloud ni banque.
import * as C from './core.js';

// Générateur pseudo-aléatoire à graine fixe : la démo est identique à chaque ouverture.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS = 14;

export function demoState() {
  const r = rng(42);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const between = (a, b) => C.round2(a + r() * (b - a));
  const today = C.todayISO();
  const s = C.defaultState();

  s.accounts = [
    { id: 'courant', name: 'Compte courant', institution: 'Néobanque', type: 'courant', openingBalance: 640, color: '#5B8DEF' },
    { id: 'livret', name: 'Livret A', institution: 'Banque', type: 'epargne', openingBalance: 2100, color: '#2FB67C' },
    { id: 'crypto', name: 'Crypto', institution: 'Plateforme crypto', type: 'crypto', openingBalance: 0, color: '#E0A526' },
  ];
  s.labels = ['vacances', 'anniversaire'];
  s.budgets = { courses: 260, resto: 160, shopping: 120, loisirs: 80 };
  s.settings.theme = 'auto';

  const tx = [];
  let n = 0;
  const add = (date, accountId, label, amount, categoryId, labels = []) => {
    if (date > today) return;
    tx.push({ id: `demo-${++n}`, accountId, date, label, amount: C.round2(amount), categoryId, labels, source: 'csv' });
  };

  const start = C.addMonths(today.slice(0, 7), -(MONTHS - 1));
  for (let m = 0; m < MONTHS; m++) {
    const ym = C.addMonths(start, m);
    const day = (d) => `${ym}-${String(Math.min(d, 28)).padStart(2, '0')}`;

    // Revenus et charges fixes
    add(day(1), 'courant', 'VIR SEPA SALAIRE ATELIER DUVAL SAS', 1328.4, 'sal_salaire');
    if (m % 6 === 5) add(day(1), 'courant', 'VIR SEPA PRIME EXCEPTIONNELLE', 250, 'sal_prime');
    add(day(5), 'courant', 'VIR CAF DU VAL DE MARNE APL', 182, 'aid_logement');
    add(day(3), 'courant', 'PRLV SEPA LOYER RESIDENCE LES TILLEULS', -520, 'log_loyer');
    add(day(8), 'courant', 'PRLV SEPA FREE MOBILE', -9.99, 'abo_tel');
    add(day(10), 'courant', 'PRLV SEPA EDF', -38.5, 'log_energie');
    add(day(2), 'courant', 'CB NAVIGO MOIS', -88.8, 'trp_commun');
    add(day(12), 'courant', 'CB SPOTIFY', -11.12, 'abo_streaming');
    add(day(15), 'courant', 'PRLV BASIC FIT', -29.99, 'abo_sport');
    if (m >= 4) add(day(18), 'courant', 'CB CLAUDE.AI SUBSCRIPTION', -21.6, 'abo_logiciel');

    // Épargne : virement automatique vers le livret
    add(day(6), 'courant', 'VIR VERS LIVRET A', -150, 'virement');
    add(day(6), 'livret', 'VIR DEPUIS COMPTE COURANT', 150, 'virement');
    if (m === MONTHS - 1 || m === 5) add(day(1), 'livret', 'INTERETS CREDITES', between(18, 32), 'rev_remb');

    // Achat de crypto un mois sur deux
    if (m % 2 === 0) add(day(20), 'courant', 'CB PLATEFORME CRYPTO ACHAT', -50, 'inv_crypto');

    // Dépenses courantes
    for (let i = 0; i < 7 + Math.floor(r() * 4); i++) {
      add(day(1 + Math.floor(r() * 28)), 'courant', `CB ${pick(['CARREFOUR CITY', 'LIDL', 'MONOPRIX', 'FRANPRIX', 'PICARD'])}`, -between(9, 68), 'crs_super');
    }
    for (let i = 0; i < 3; i++) add(day(1 + Math.floor(r() * 28)), 'courant', 'CB BOULANGERIE DU MARCHE', -between(2.5, 9), 'crs_bouche');
    for (let i = 0; i < 3 + Math.floor(r() * 4); i++) {
      const [label, cat, lo, hi] = pick([
        ['CB UBER EATS', 'rst_livraison', 14, 32], ['CB MCDONALDS', 'rst_fastfood', 8, 16], ['CB SUSHI SHOP', 'rst_resto', 15, 34],
        ['CB STARBUCKS', 'rst_snack', 4, 8], ['CB CROUS RESTAURATION', 'rst_cantine', 3.3, 3.3], ['CB PIZZERIA NAPOLI', 'rst_resto', 12, 28],
      ]);
      add(day(1 + Math.floor(r() * 28)), 'courant', label, -between(lo, hi), cat);
    }
    if (r() < 0.7) add(day(1 + Math.floor(r() * 28)), 'courant', `CB ${pick(['ZARA', 'UNIQLO', 'KIABI', 'DECATHLON'])}`, -between(19, 75), 'shp_vetements');
    if (r() < 0.6) add(day(1 + Math.floor(r() * 28)), 'courant', 'CB AMAZON MARKETPLACE', -between(9, 45), 'shp_enligne');
    if (r() < 0.5) add(day(1 + Math.floor(r() * 28)), 'courant', 'CB UGC CINE CITE', -between(7, 12), 'lsr_cinema');
    if (r() < 0.5) add(day(1 + Math.floor(r() * 28)), 'courant', 'CB LE COMPTOIR BAR', -between(12, 35), 'lsr_sorties');
    if (r() < 0.4) add(day(1 + Math.floor(r() * 28)), 'courant', 'CB PHARMACIE CENTRALE', -between(4, 22), 'san_pharma');
    if (r() < 0.3) add(day(1 + Math.floor(r() * 28)), 'courant', 'CB UBER TRIP', -between(9, 24), 'trp_vtc');
    if (m % 3 === 1) add(day(14), 'courant', 'CB SNCF CONNECT', -between(29, 79), 'trp_train');
    if (m % 2 === 1) add(day(25), 'courant', 'VIR WISE AIDE FAMILLE', -100, 'fam_envoi');
    if (m % 4 === 2) add(day(9), 'courant', 'CB DOCTOLIB TELECONSULTATION', -25, 'san_medecin');
    if (m % 4 === 2) add(day(19), 'courant', 'VIR CPAM REMBOURSEMENT', 17.5, 'rev_remb');

    // Un voyage et un cadeau, marqués par des labels
    if (m === MONTHS - 5) {
      add(day(4), 'courant', 'CB TRANSAVIA PARIS-LISBONNE', -142.3, 'voy_avion', ['vacances']);
      add(day(4), 'courant', 'CB AIRBNB LISBONNE', -236, 'voy_hebergement', ['vacances']);
      for (let i = 0; i < 4; i++) add(day(16 + i), 'courant', 'CB RESTAURANTE LISBOA', -between(14, 31), 'rst_resto', ['vacances']);
    }
    if (m === MONTHS - 3) add(day(21), 'courant', 'CB FNAC CADEAU', -64.9, 'cadeaux', ['anniversaire']);
  }

  // Quelques opérations récentes « à classer », pour montrer la boîte de tri.
  add(C.addDays(today, -1), 'courant', 'CB HELLOASSO ASSOCIATION', -15, null);
  add(C.addDays(today, -2), 'courant', 'CB TABAC PRESSE DE LA GARE', -6.8, null);
  add(C.addDays(today, -3), 'courant', 'PAIEMENT PAR CARTE LEROY', -23.4, null);

  s.transactions = tx.sort((a, b) => (a.date < b.date ? -1 : 1));

  // Crypto : marche aléatoire hebdomadaire, valeur actuelle = somme des avoirs.
  const holdings = [
    { asset: 'BTC', qty: 0.0124, valueEur: 0 },
    { asset: 'ETH', qty: 0.31, valueEur: 0 },
    { asset: 'USDC', qty: 120, valueEur: 120 },
  ];
  holdings[0].valueEur = C.round2(holdings[0].qty * 61200);
  holdings[1].valueEur = C.round2(holdings[1].qty * 2480);
  const total = C.round2(holdings.reduce((x, h) => x + h.valueEur, 0));
  const first = `${start}-01`;
  const weeks = Math.round((Date.parse(today) - Date.parse(first)) / (7 * 864e5));
  let v = 300;
  for (let w = 0; w <= weeks; w++) {
    const date = C.addDays(first, w * 7);
    if (date >= today) break;
    v = Math.max(120, v + (total - v) / Math.max(1, weeks - w) + (r() - 0.45) * 60);
    C.recordCryptoSnapshot(s, 'crypto', v, date);
  }
  C.recordCryptoSnapshot(s, 'crypto', total, today);
  s.crypto = { crypto: { holdings, totalEur: total, updatedAt: new Date().toISOString() } };

  s.claudeNote = {
    date: today,
    title: 'Analyse du mois (exemple)',
    sections: [
      { h: 'En bref', p: 'Tu épargnes environ 150 € par mois et ton patrimoine progresse régulièrement. Les restaurants et la livraison de repas restent le premier poste variable.' },
      { h: 'À surveiller', p: 'Le budget restaurants est dépassé deux mois sur trois. Regrouper les commandes ou fixer un plafond hebdomadaire suffirait à revenir dans le budget.' },
      { h: 'Idée', p: 'Le livret A dépasse trois mois de dépenses : la part au-delà pourrait aller vers un placement de plus long terme.' },
    ],
  };

  s.updatedAt = Date.now();
  return C.migrate(s);
}
