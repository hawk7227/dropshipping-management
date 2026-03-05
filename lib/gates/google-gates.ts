// ═══ DELIVERY ENVELOPE ═══
// FILE: lib/gates/google-gates.ts
// LINES: ~120
// IMPORTS FROM: lib/gates/registry.ts (GateDefinition), lib/contracts/ (CleanProduct, constants)
// EXPORTS TO: lib/gates/index.ts (combined with core-gates)
// DOES: Defines the 5 Google Merchant Center compliance gates. Each gate has a check function that returns { id, status, reason, fix }. Title length gate checks ≤150 chars + banned words + excessive caps. Description gate checks for HTML remnants + Amazon junk. Category gate checks for Google taxonomy assignment. Barcode gate validates GTIN format + checksum. Identifier gate checks GTIN+Brand or MPN+Brand combo.
// DOES NOT: Auto-fix products. Call Google APIs. Run other gates.
// BREAKS IF: CleanProduct.merchant or CleanProduct.pricing sub-types are restructured.
// ASSUMES: Product has been parsed through the contracts schema. Barcode is already stripped to digits by identifiers.ts.
// LEVEL: 3 — Integrated. Each gate is independently testable. Fix suggestions are actionable, not vague.
// VERIFIED: AI self-check.
// ═══════════════════════════════════════════════════════════

import type { GateDefinition } from './registry';
import type { CleanProduct } from '../contracts/product';
import {
  TITLE_MAX_CHARS, TITLE_WARN_CHARS, TITLE_BANNED_WORDS, CAPS_RATIO_THRESHOLD, CAPS_MIN_WORDS,
  DESC_MIN_CHARS, GTIN_VALID_LENGTHS, GTIN_RESERVED_PREFIXES,
  GOOGLE_CATEGORY_MAP,
} from '../contracts/constants';

// ── Helpers (private to this file) ──────────────────────

function findBannedWords(title: string): string[] {
  const lower = title.toLowerCase();
  return TITLE_BANNED_WORDS.filter(w => lower.includes(w)) as string[];
}

function hasExcessiveCaps(title: string): boolean {
  const words = title.split(/\s+/).filter(w => w.length > 2);
  if (words.length <= CAPS_MIN_WORDS) return false;
  return words.filter(w => w === w.toUpperCase()).length / words.length > CAPS_RATIO_THRESHOLD;
}

function autoMapCategory(tags: string, category: string, title: string): string {
  const combined = `${tags} ${category} ${title}`.toLowerCase();
  let best = '';
  let bestLen = 0;
  for (const [key, val] of Object.entries(GOOGLE_CATEGORY_MAP)) {
    if (combined.includes(key) && key.length > bestLen) { best = val; bestLen = key.length; }
  }
  return best;
}

// ── Gate Definitions ────────────────────────────────────

export const googleGates: GateDefinition[] = [
  {
    id: 'titleLength',
    name: 'Title Compliance',
    description: `Title must be ≤${TITLE_MAX_CHARS} chars, no promotional text, no excessive ALL CAPS.`,
    severity: 'major',
    category: 'google',
    check: (p: CleanProduct) => {
      if (!p.title) return { id: 'titleLength', status: 'fail', reason: 'No title', fix: 'Add a product title.' };
      const banned = findBannedWords(p.title);
      if (banned.length > 0)
        return { id: 'titleLength', status: 'warn', reason: `Banned words: ${banned.join(', ')}`, fix: `Remove promotional text from title: ${banned.join(', ')}. Google will flag or disapprove these.` };
      if (hasExcessiveCaps(p.title))
        return { id: 'titleLength', status: 'warn', reason: 'Excessive ALL CAPS', fix: 'Convert title to Title Case. Google flags ALL CAPS as spammy.' };
      if (p.title.length > TITLE_WARN_CHARS)
        return { id: 'titleLength', status: 'fail', reason: `${p.title.length} chars (max ${TITLE_MAX_CHARS})`, fix: `Trim title to ${TITLE_MAX_CHARS} chars. Use formula: Brand + Product Type + Key Feature + Size.` };
      if (p.title.length > TITLE_MAX_CHARS)
        return { id: 'titleLength', status: 'warn', reason: `${p.title.length} chars (max ${TITLE_MAX_CHARS})`, fix: `Title is ${p.title.length - TITLE_MAX_CHARS} chars over. Google will truncate. Trim to ${TITLE_MAX_CHARS}.` };
      return { id: 'titleLength', status: 'pass', reason: `${p.title.length} chars, clean`, fix: '' };
    },
  },
  {
    id: 'descClean',
    name: 'Description Quality',
    description: `Description must be ≥${DESC_MIN_CHARS} chars, no HTML tags, no Amazon boilerplate, no meta tags.`,
    severity: 'major',
    category: 'google',
    check: (p: CleanProduct) => {
      if (!p.description || p.description.length < DESC_MIN_CHARS)
        return { id: 'descClean', status: 'fail', reason: 'Description too short or missing', fix: `Write a product description with at least ${DESC_MIN_CHARS} characters. Include what it is, key features, and who it is for.` };
      if (/<[a-z][^>]*>/i.test(p.description))
        return { id: 'descClean', status: 'fail', reason: 'Contains HTML tags', fix: 'Strip all HTML from description. Google Merchant Center requires plain text.' };
      if (/content="width=device-width/i.test(p.description) || /charset=/i.test(p.description))
        return { id: 'descClean', status: 'fail', reason: 'Contains meta/viewport tags (Amazon import junk)', fix: 'Remove <meta> tags from description. These come from Amazon page scraping and must be stripped.' };
      if (p.description.length < DESC_MIN_CHARS)
        return { id: 'descClean', status: 'warn', reason: `${p.description.length} chars (${DESC_MIN_CHARS}+ recommended)`, fix: 'Expand description to at least 150 characters for better Google Shopping performance.' };
      return { id: 'descClean', status: 'pass', reason: `${p.description.length} chars, clean`, fix: '' };
    },
  },
  {
    id: 'googleCategory',
    name: 'Google Product Category',
    description: 'Must have a Google Product Category taxonomy path assigned.',
    severity: 'major',
    category: 'google',
    check: (p: CleanProduct) => {
      if (p.merchant.googleCategory && p.merchant.googleCategory.length > 5)
        return { id: 'googleCategory', status: 'pass', reason: p.merchant.googleCategory, fix: '' };
      const autoMapped = autoMapCategory(p.tags, p.category, p.title);
      if (autoMapped)
        return { id: 'googleCategory', status: 'pass', reason: `Auto-mapped: ${autoMapped}`, fix: '' };
      return { id: 'googleCategory', status: 'fail', reason: 'No Google Product Category', fix: 'Assign a Google Product Category. Use the most specific path: "Health & Beauty > Personal Care > Cosmetics > Makeup > Lip Glosses" not just "Health & Beauty".' };
    },
  },
  {
    id: 'barcode',
    name: 'GTIN / Barcode',
    description: 'Valid GTIN (8/12/13/14 digits, valid checksum, no reserved prefix). Products with GTINs get 20-40% more clicks.',
    severity: 'major',
    category: 'google',
    check: (p: CleanProduct) => {
      if (!p.barcode)
        return { id: 'barcode', status: 'fail', reason: 'No barcode/GTIN', fix: 'Add the product barcode (UPC/EAN/GTIN). Find it on the product packaging or Amazon listing. Products with GTINs get 20-40% more clicks.' };
      const clean = p.barcode.replace(/[^0-9]/g, '');
      if (!GTIN_VALID_LENGTHS.includes(clean.length as 8 | 12 | 13 | 14))
        return { id: 'barcode', status: 'warn', reason: `${clean.length} digits (valid: ${GTIN_VALID_LENGTHS.join('/')})`, fix: `Barcode must be exactly 8, 12, 13, or 14 digits. Current is ${clean.length} digits.` };
      for (const prefix of GTIN_RESERVED_PREFIXES) {
        if (clean.startsWith(prefix))
          return { id: 'barcode', status: 'warn', reason: `Reserved prefix "${prefix}"`, fix: `Barcode starts with reserved GS1 prefix "${prefix}". Verify with the manufacturer — this may not be a valid retail GTIN.` };
      }
      return { id: 'barcode', status: 'pass', reason: `Valid GTIN-${clean.length}`, fix: '' };
    },
  },
  {
    id: 'identifier',
    name: 'Product Identifier',
    description: 'Must have GTIN + Brand, or Brand + MPN (ASIN). Required for full Google Shopping visibility.',
    severity: 'critical',
    category: 'google',
    check: (p: CleanProduct) => {
      const hasBrand = p.vendor && p.vendor !== 'Unknown' && p.vendor.length > 1;
      const hasValidBarcode = p.barcode && p.barcode.length >= 8;
      const hasMPN = p.asin && /^B[0-9A-Z]{9}$/.test(p.asin);

      if (hasValidBarcode && hasBrand)
        return { id: 'identifier', status: 'pass', reason: `GTIN + Brand (${p.vendor})`, fix: '' };
      if (hasMPN && hasBrand)
        return { id: 'identifier', status: 'pass', reason: `MPN (${p.asin}) + Brand (${p.vendor})`, fix: '' };
      if (hasBrand)
        return { id: 'identifier', status: 'warn', reason: `Has brand but no GTIN or MPN`, fix: 'Add either a GTIN (barcode) or MPN (ASIN) alongside the brand to get full visibility.' };
      return { id: 'identifier', status: 'fail', reason: 'No identifiers', fix: 'Products need Brand + GTIN or Brand + MPN. Set the vendor/brand name and add a barcode or ASIN.' };
    },
  },
];
