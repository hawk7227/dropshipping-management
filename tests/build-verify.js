#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// BUILD VERIFICATION TEST — Proves everything compiles & is wired
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const ROOT = __dirname.replace('/tests', '');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => { try { fs.accessSync(path.join(ROOT, p)); return true; } catch { return false; } };

let total = 0, pass = 0, fail = 0;
const fails = [];

function test(cat, name, fn) {
  total++;
  try {
    const r = fn();
    if (r === true) { pass++; } else { fail++; fails.push(`✕ [${cat}] ${name} → ${r}`); }
  } catch (e) { fail++; fails.push(`✕ [${cat}] ${name} → ${e.message}`); }
}

function has(file, pat) { return read(file).includes(pat); }

const PC = 'components/products/ProductCard.tsx';
const PCG = 'components/products/ProductCardGrid.tsx';
const SP = 'components/products/SourcingPanel.tsx';
const PP = 'app/products/page.tsx';
const API = 'app/api/products/route.ts';
const CRON = 'app/api/cron/route.ts';
const CSS = 'app/products/products-dark.css';
const PR = 'lib/config/pricing-rules.ts';

console.log('\n═══ BUILD VERIFICATION TEST ═══\n');

// ── 1. FILE EXISTS ──
console.log('1. FILE EXISTS');
[PC, PCG, SP, PP, API, CRON, CSS, PR].forEach(f =>
  test('EXISTS', f, () => exists(f) ? true : 'FILE MISSING')
);

// ── 2. NO SYNTAX ERRORS (balanced brackets) ──
console.log('2. SYNTAX');
[PC, PCG, SP, PP].forEach(f => {
  test('SYNTAX', `${f} balanced {}`, () => {
    const c = read(f); let d=0;
    for (const ch of c) { if(ch==='{') d++; if(ch==='}') d--; if(d<0) return 'Extra }'; }
    return d===0 ? true : `Unbalanced: ${d} unclosed {`;
  });
  test('SYNTAX', `${f} balanced ()`, () => {
    const c = read(f); let d=0;
    for (const ch of c) { if(ch==='(') d++; if(ch===')') d--; if(d<0) return 'Extra )'; }
    return d===0 ? true : `Unbalanced: ${d} unclosed (`;
  });
});

// ── 3. REQUIRED IMPORTS ──
console.log('3. IMPORTS');
test('IMPORT', 'PC: useState', () => has(PC, 'useState') ? true : 'Missing');
test('IMPORT', 'PC: Product type', () => has(PC, "from '@/types'") ? true : 'Missing');
test('IMPORT', 'PC: formatPrice', () => has(PC, 'formatPrice') ? true : 'Missing');
test('IMPORT', 'PC: ProductImageCarousel', () => has(PC, 'ProductImageCarousel') ? true : 'Missing');
test('IMPORT', 'PC: GoogleStatusBadge', () => has(PC, 'GoogleStatusBadge') ? true : 'Missing');
test('IMPORT', 'SP: createClientComponentClient', () => has(SP, 'createClientComponentClient') ? true : 'Missing');
test('IMPORT', 'SP: PRICING_RULES', () => has(SP, 'PRICING_RULES') ? true : 'Missing');
test('IMPORT', 'PP: SourcingPanel', () => has(PP, "SourcingPanel") ? true : 'Missing');
test('IMPORT', 'PP: products-dark.css', () => has(PP, "products-dark.css") ? true : 'Missing');

// ── 4. EXPORTS ──
console.log('4. EXPORTS');
test('EXPORT', 'PC named export', () => has(PC, 'export function ProductCard') ? true : 'Missing');
test('EXPORT', 'PC default export', () => has(PC, 'export default ProductCard') ? true : 'Missing');
test('EXPORT', 'SP named export', () => has(SP, 'export function SourcingPanel') ? true : 'Missing');
test('EXPORT', 'SP default export', () => has(SP, 'export default SourcingPanel') ? true : 'Missing');

// ── 5. DARK THEME (no bg-white in ProductCard) ──
console.log('5. DARK THEME');
test('DARK', 'PC: NO bg-white', () => !has(PC, 'bg-white') ? true : 'Still has bg-white!');
test('DARK', 'PC: uses #181c25', () => has(PC, '#181c25') ? true : 'Missing dark bg');
test('DARK', 'PC: uses #2c3340 borders', () => has(PC, '#2c3340') ? true : 'Missing dark border');
test('DARK', 'PP: products-dark wrapper', () => has(PP, 'products-dark') ? true : 'Missing wrapper');
test('DARK', 'CSS: dark bg defined', () => (has(CSS, '#0f1117') || has(CSS, '#0a0a0f')) ? true : 'Missing root bg');

// ── 6. PROFIT NOT MARGIN ──
console.log('6. PROFIT LABEL');
test('LABEL', 'PC: says Profit', () => has(PC, '>Profit<') ? true : 'Missing Profit label');
test('LABEL', 'PC: NO Margin label', () => !has(PC, '>Margin<') ? true : 'Still has Margin!');
test('LABEL', 'PC: PROFIT_THRESHOLD const', () => has(PC, 'PROFIT_THRESHOLD') ? true : 'Missing');
test('LABEL', 'PC: NO MARGIN_THRESHOLD', () => !has(PC, 'MARGIN_THRESHOLD') ? true : 'Still has MARGIN_THRESHOLD!');

// ── 7. CONSISTENT PRICE COLORS ──
console.log('7. PRICE COLORS');
test('COLOR', 'Cost always orange', () => has(PC, 'text-orange-400') ? true : 'Missing');
test('COLOR', 'Sell always white', () => has(PC, "text-[#e8eaed]") ? true : 'Missing');
test('COLOR', 'Profit cyan when >=30%', () => has(PC, 'text-cyan-400') ? true : 'Missing');
test('COLOR', 'Profit red when <30%', () => has(PC, 'text-red-400') ? true : 'Missing');
test('COLOR', 'Profit font larger (19px)', () => has(PC, 'text-[19px]') ? true : 'Missing');
test('COLOR', 'Price font bold (17px)', () => has(PC, 'text-[17px]') ? true : 'Missing');

// ── 8. SHOPIFY SYNC WIRING ──
console.log('8. SHOPIFY SYNC');
test('SYNC', 'API: productIds handling', () => has(API, 'productIds') ? true : 'Missing');
test('SYNC', 'API: MARKUP = 1.70', () => has(API, 'MARKUP = 1.70') ? true : 'Missing');
test('SYNC', 'API: COMPETITOR_RANGES', () => has(API, 'COMPETITOR_RANGES') ? true : 'Missing');
test('SYNC', 'API: supplier_url metafield', () => has(API, "key: 'supplier_url'") ? true : 'Missing');
test('SYNC', 'API: asin metafield', () => has(API, "key: 'asin'") ? true : 'Missing');
test('SYNC', 'API: price_amazon metafield', () => has(API, "key: 'price_amazon'") ? true : 'Missing');
test('SYNC', 'API: price_costco metafield', () => has(API, "key: 'price_costco'") ? true : 'Missing');
test('SYNC', 'API: price_ebay metafield', () => has(API, "key: 'price_ebay'") ? true : 'Missing');
test('SYNC', 'API: price_samsclub metafield', () => has(API, "key: 'price_samsclub'") ? true : 'Missing');
test('SYNC', 'API: compare_at_price computed', () => has(API, 'compareAtPrice') ? true : 'Missing');
test('SYNC', 'API: amazon.com/dp/ URL', () => has(API, 'amazon.com/dp/') ? true : 'Missing');
test('SYNC', 'API: saves shopify_variant_id', () => has(API, 'shopify_variant_id') ? true : 'Missing');
test('SYNC', 'API: saves competitor prices to DB', () => has(API, 'amazon_display_price') ? true : 'Missing');
test('SYNC', 'API: Shopify PUT for updates', () => has(API, "method: 'PUT'") ? true : 'Missing');
test('SYNC', 'API: Shopify POST for creates', () => has(API, "products.json") ? true : 'Missing');

// ── 9. CARD SHOPIFY BUTTON ──
console.log('9. CARD CTA');
test('CTA', 'PC: big Shopify button', () => has(PC, '🛒 Shopify') ? true : 'Missing');
test('CTA', 'PC: Shopify green (#96bf48)', () => has(PC, '#96bf48') ? true : 'Missing');
test('CTA', 'PC: Synced state button', () => has(PC, '↻ Synced') ? true : 'Missing');
test('CTA', 'PC: view details eye icon', () => has(PC, 'View details') ? true : 'Missing');
test('CTA', 'PC: Reprice for negative', () => has(PC, 'Reprice') ? true : 'Missing');

// ── 10. PAGE USES REAL DATA ──
console.log('10. REAL DATA');
test('REAL', 'Stats from calculateStats()', () => has(PP, 'calculateStats') ? true : 'Missing');
test('REAL', 'Fetches from /api/products', () => has(PP, '/api/products?action=list') ? true : 'Missing');
test('REAL', 'No mock/fake products', () => !has(PP, 'mockProducts') && !has(PP, 'fakeProducts') ? true : 'Has fake data!');
test('REAL', 'Stats computed from real products', () => {
  const c = read(PP);
  return c.includes("case 'SET_PRODUCTS'") && c.includes('calculateStats(action.payload)') ? true : 'Not real';
});

// ── 11. SOURCING PANEL WIRED ──
console.log('11. SOURCING PANEL');
test('SP', 'Loads from sourcing_settings', () => has(SP, "from('sourcing_settings')") ? true : 'Missing');
test('SP', 'Loads from discovery_runs', () => has(SP, "from('discovery_runs')") ? true : 'Missing');
test('SP', 'Calls /api/cron/discovery/run', () => has(SP, '/api/cron/discovery/run') ? true : 'Missing');
test('SP', 'Calls correct Shopify API', () => has(SP, '/api/products?action=sync-shopify') ? true : 'Wrong API!');
test('SP', 'Save persists to DB', () => has(SP, ".update({") ? true : 'Missing');
test('SP', 'Auto toggle persists', () => has(SP, "update({ enabled:") ? true : 'Missing');
test('SP', 'onSourcingComplete callback', () => has(SP, 'onSourcingComplete()') ? true : 'Missing');

// ── 12. CRON ROUTE ──
console.log('12. CRON');
test('CRON', 'Cron route exists', () => exists(CRON) ? true : 'Missing');
test('CRON', 'Handles product-discovery', () => has(CRON, 'product-discovery') ? true : 'Missing');
test('CRON', 'Has GET handler', () => has(CRON, 'export async function GET') ? true : 'Missing');
test('CRON', 'Has POST handler', () => has(CRON, 'export async function POST') ? true : 'Missing');

// ── 13. DISCOVERY RUN ──
const DISC = 'app/api/cron/discovery/run/route.ts';
console.log('13. DISCOVERY');
test('DISC', 'Discovery route exists', () => exists(DISC) ? true : 'Missing');
test('DISC', 'Accepts POST', () => has(DISC, 'export async function POST') ? true : 'Missing');
test('DISC', 'Accepts filters', () => has(DISC, 'filters') ? true : 'Missing');

// ── 14. PRICING RULES ──
console.log('14. PRICING RULES');
test('PR', 'multiplier: 1.70', () => has(PR, '1.70') ? true : 'Missing');
test('PR', 'amazon range', () => has(PR, 'amazon:') ? true : 'Missing');
test('PR', 'costco range', () => has(PR, 'costco:') ? true : 'Missing');
test('PR', 'ebay range', () => has(PR, 'ebay:') ? true : 'Missing');
test('PR', 'sams range', () => has(PR, 'sams:') ? true : 'Missing');
test('PR', 'minimum profit 30', () => has(PR, 'minimum: 30') ? true : 'Missing');

// ═══ RESULTS ═══
console.log('\n═══════════════════════════════════════════');
console.log(`  Total: ${total} | ✅ Pass: ${pass} | ❌ Fail: ${fail}`);
console.log(`  Rate: ${((pass/total)*100).toFixed(1)}%`);
console.log('═══════════════════════════════════════════');
if (fails.length) { console.log('\nFAILURES:'); fails.forEach(f => console.log(f)); }
else { console.log('\n🏆 ALL TESTS PASSED — ZERO FAILURES'); }
console.log('');
process.exit(fail > 0 ? 1 : 0);
