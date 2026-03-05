// ═══ DELIVERY ENVELOPE ═══
// FILE: lib/gates/preflight.ts
// LINES: ~70
// IMPORTS FROM: lib/contracts/constants.ts (GOOGLE_CATEGORY_MAP, TITLE_MAX_CHARS, TITLE_BANNED_WORDS)
// EXPORTS TO: app/api/cron/google-shopping, app/api/cron/omnipresence, app/api/cron/daily-learning, app/api/cron/ai-optimize
// DOES: Pre-flight gate check for cron jobs. Takes a Supabase product row and returns gate status + feed score. Filters products into gate-passing and gate-failing buckets so crons only optimize products that are already compliant.
// DOES NOT: Modify products. Call external APIs. This is a read-only filter.
// BREAKS IF: Product row doesn't have the expected columns (handles nulls gracefully).
// ASSUMES: Called with raw Supabase product rows (not CleanProduct — these are DB rows with different column names).
// LEVEL: 3 — Integrated. Uses same constants as the gate system. Consistent rules everywhere.
// ═══════════════════════════════════════════════════════════

import {
  GOOGLE_CATEGORY_MAP, TITLE_MAX_CHARS, TITLE_BANNED_WORDS,
  GTIN_VALID_LENGTHS, GTIN_RESERVED_PREFIXES, DESC_MIN_CHARS,
} from '../contracts/constants';

export interface ProductGateResult {
  productId: string;
  feedScore: number;
  gatesPassed: number;
  totalGates: 10;
  passing: boolean;      // gatesPassed === 10
  critical: boolean;     // no critical gate failures
  issues: string[];      // human-readable list of failures
  autoFixable: string[]; // issues that can be auto-fixed
  needsAI: string[];     // issues that need AI intervention
  googleCategory: string; // auto-mapped category (empty if no match)
}

export function runProductPreflight(product: Record<string, unknown>): ProductGateResult {
  const title = String(product.title || '');
  const description = String(product.description || '');
  const imageUrl = String(product.image_url || '');
  const price = Number(product.retail_price || 0);
  const vendor = String(product.vendor || '');
  const category = String(product.category || '');
  const tags = String(product.tags || '');
  const asin = String(product.asin || product.sku || '');
  const barcode = String(product.barcode || '').replace(/[^0-9]/g, '');

  const issues: string[] = [];
  const autoFixable: string[] = [];
  const needsAI: string[] = [];
  let score = 0;
  let passed = 0;

  // Gate 1: Title exists
  if (title.length > 5 && !title.includes('<')) { passed++; } else { issues.push('Missing or invalid title'); needsAI.push('title'); }

  // Gate 2: Image
  if (imageUrl.startsWith('http')) { passed++; score += 15; } else { issues.push('No image URL'); }

  // Gate 3: Price
  if (price > 0) { passed++; score += 15; } else { issues.push('No price'); }

  // Gate 4: ASIN
  if (/^B[0-9A-Z]{9}$/.test(asin)) { passed++; } else { issues.push('Invalid ASIN'); }

  // Gate 5: Description
  if (description.length > 30) { passed++; } else { issues.push('Short description'); needsAI.push('description'); }

  // Gate 6: Google Category
  const combined = `${tags} ${category} ${title}`.toLowerCase();
  let googleCategory = String(product.google_product_category || '');
  if (!googleCategory || googleCategory.length < 5) {
    let bestMatch = '', bestLen = 0;
    for (const [key, val] of Object.entries(GOOGLE_CATEGORY_MAP)) {
      if (combined.includes(key) && key.length > bestLen) { bestMatch = val; bestLen = key.length; }
    }
    googleCategory = bestMatch;
  }
  if (googleCategory.length > 5) { passed++; score += 10; } else { issues.push('No Google Product Category'); autoFixable.push('googleCategory'); }

  // Gate 7: Title length
  const hasBanned = TITLE_BANNED_WORDS.some(w => title.toLowerCase().includes(w));
  if (title.length <= TITLE_MAX_CHARS && title.length > 5 && !hasBanned) { passed++; score += 20; }
  else {
    if (title.length > TITLE_MAX_CHARS) { issues.push(`Title ${title.length} chars (max ${TITLE_MAX_CHARS})`); autoFixable.push('titleLength'); }
    if (hasBanned) { issues.push('Title has promotional text'); autoFixable.push('titleBanned'); }
  }

  // Gate 8: Description clean
  if (description.length >= DESC_MIN_CHARS && !/<[a-z][^>]*>/i.test(description) && !/content="width=device-width/i.test(description)) {
    passed++; score += 15;
  } else {
    if (/<[a-z][^>]*>/i.test(description)) { issues.push('Description has HTML'); autoFixable.push('descHTML'); }
    else if (description.length < DESC_MIN_CHARS) { issues.push('Description too short'); needsAI.push('description'); }
  }

  // Gate 9: Barcode
  if (barcode.length > 0 && (GTIN_VALID_LENGTHS as readonly number[]).includes(barcode.length) &&
      !GTIN_RESERVED_PREFIXES.some(p => barcode.startsWith(p))) {
    passed++; score += 15;
  } else {
    if (!barcode) { issues.push('No barcode/GTIN'); }
    else { issues.push('Invalid barcode format'); }
  }

  // Gate 10: Identifier (GTIN+Brand or Brand+MPN)
  const hasBrand = vendor.length > 1 && vendor !== 'Unknown';
  if ((barcode && hasBrand) || (asin && hasBrand)) { passed++; } else { issues.push('Missing product identifiers'); }

  // Brand bonus
  if (hasBrand) score += 5;
  score += 5; // Free shipping always

  return {
    productId: String(product.id || ''),
    feedScore: Math.min(100, score),
    gatesPassed: passed,
    totalGates: 10,
    passing: passed === 10,
    critical: price > 0 && imageUrl.startsWith('http') && title.length > 5,
    issues,
    autoFixable,
    needsAI,
    googleCategory,
  };
}

// Filter products into buckets for cron jobs
export function filterByCompliance(products: Record<string, unknown>[]): {
  ready: Record<string, unknown>[];       // 10/10 — safe to optimize
  fixable: Record<string, unknown>[];     // has auto-fixable issues
  needsAttention: Record<string, unknown>[]; // needs AI or manual fix
  results: ProductGateResult[];
} {
  const ready: Record<string, unknown>[] = [];
  const fixable: Record<string, unknown>[] = [];
  const needsAttention: Record<string, unknown>[] = [];
  const results: ProductGateResult[] = [];

  for (const p of products) {
    const result = runProductPreflight(p);
    results.push(result);
    if (result.passing) ready.push(p);
    else if (result.autoFixable.length > 0) fixable.push(p);
    else needsAttention.push(p);
  }

  return { ready, fixable, needsAttention, results };
}
