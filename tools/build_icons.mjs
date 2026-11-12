// Télécharge les icônes Lucide depuis All SVG Icons et génère public/icons.js (fonctionne hors ligne ensuite).
// node tools/build_icons.mjs
import fs from 'node:fs';

// Icônes par catégorie / sous-catégorie / groupe / type de compte / interface.
export const MAP = {
  // Interface
  ui_wallet: 'wallet', ui_pie: 'chart-pie', ui_list: 'list', ui_gear: 'settings', ui_spark: 'sparkles', ui_refresh: 'refresh-cw',
  ui_eye: 'eye', ui_eyeoff: 'eye-off', ui_left: 'chevron-left', ui_right: 'chevron-right', ui_plus: 'plus', ui_up: 'arrow-up-right',
  ui_down: 'arrow-down-right', ui_bank: 'landmark', ui_search: 'search', ui_check: 'check', ui_alert: 'triangle-alert', ui_target: 'target',
  ui_shield: 'shield-check', ui_bulb: 'lightbulb', ui_cal: 'calendar', ui_trend_up: 'trending-up', ui_trend_down: 'trending-down', ui_help: 'circle-help',
  ui_handshake: 'handshake', ui_repeat: 'repeat', ui_receipt: 'receipt', ui_flame: 'flame', ui_info: 'info', ui_tag: 'tag', ui_lock: 'lock', ui_inbox: 'inbox',
  // Types de compte
  t_courant: 'credit-card', t_epargne: 'piggy-bank', t_crypto: 'bitcoin', t_invest: 'chart-line', t_autre: 'wallet',
  // Groupes
  g_quotidien: 'shopping-basket', g_logement: 'house', g_mobilite: 'plane', g_plaisirs: 'shopping-bag', g_famille: 'users', g_autres: 'shapes',
  // Catégories et sous-catégories
  logement: 'house', log_loyer: 'key-round', log_energie: 'zap', log_laverie: 'washing-machine', log_assurance: 'shield',
  courses: 'shopping-cart', crs_super: 'shopping-basket', crs_bouche: 'croissant', crs_livraison: 'package',
  resto: 'utensils', rst_resto: 'utensils-crossed', rst_fastfood: 'sandwich', rst_livraison: 'bike', rst_snack: 'coffee', rst_cantine: 'school',
  transport: 'train-front', trp_commun: 'tram-front', trp_train: 'train-front', trp_car: 'bus', trp_vtc: 'car-taxi-front', trp_velo: 'bike', trp_carburant: 'fuel', trp_amende: 'siren',
  voyages: 'plane', voy_avion: 'plane-takeoff', voy_hebergement: 'bed-double', voy_agence: 'luggage', voy_change: 'arrow-right-left',
  abos: 'repeat', abo_tel: 'smartphone', abo_sport: 'dumbbell', abo_logiciel: 'laptop', abo_streaming: 'tv',
  shopping: 'shopping-bag', shp_vetements: 'shirt', shp_enligne: 'package-open', shp_maison: 'sofa', shp_tech: 'monitor-smartphone',
  sante: 'heart-pulse', san_pharma: 'pill', san_medecin: 'stethoscope', san_mutuelle: 'shield-plus',
  soins: 'flower-2', soi_coiffeur: 'scissors', soi_esthetique: 'sparkles', soi_parfum: 'spray-can',
  loisirs: 'party-popper', lsr_cinema: 'clapperboard', lsr_sorties: 'beer', lsr_jeux: 'gamepad-2', lsr_tabac: 'cigarette',
  education: 'graduation-cap', edu_formation: 'book-open',
  famille: 'users', fam_envoi: 'hand-heart',
  impots: 'receipt', imp_banque: 'landmark', imp_admin: 'file-text', imp_poste: 'mail', imp_impots: 'building-2',
  cadeaux: 'gift', autre_dep: 'circle-ellipsis', aut_especes: 'banknote', aut_litige: 'triangle-alert',
  salaire: 'briefcase', sal_salaire: 'briefcase-business', sal_prime: 'award',
  aides: 'hand-coins', aid_logement: 'house-plus', aid_caf: 'baby',
  autres_rev: 'coins', rev_remb: 'undo-2', rev_famille: 'heart-handshake',
  virement: 'arrow-left-right', prets: 'handshake', invest: 'trending-up', inv_crypto: 'bitcoin', ajust: 'scale', _none: 'circle-help',
};

const names = [...new Set(Object.values(MAP))];
const svgs = {};
const missing = [];
for (const n of names) {
  const res = await fetch(`https://i.allsvgicons.com/lucide/${n}.svg`);
  const txt = res.ok ? await res.text() : '';
  const inner = txt.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1];
  if (!inner) { missing.push(n); continue; }
  svgs[n] = inner.replace(/\s+/g, ' ').trim();
}
if (missing.length) {
  console.error('Icônes introuvables :', missing.join(', '));
  process.exit(1);
}
const out = `// Généré par tools/build_icons.mjs — icônes Lucide (ISC) via All SVG Icons. Ne pas modifier à la main.
export const ICON_MAP = ${JSON.stringify(MAP)};
export const SVGS = ${JSON.stringify(svgs)};
`;
fs.writeFileSync(new URL('../public/icons.js', import.meta.url), out);
console.log(`${names.length} icônes → public/icons.js (${Math.round(out.length / 1024)} Ko)`);
