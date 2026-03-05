// ═══ DELIVERY ENVELOPE ═══
// FILE: lib/pipeline/detect.ts
// LINES: ~45
// IMPORTS FROM: lib/contracts/product.ts (FileType)
// EXPORTS TO: lib/pipeline/index.ts
// DOES: Detects file format from column headers. Returns FileType enum. Also detects ASIN-only lists by scanning cell values.
// DOES NOT: Parse files. Map columns. Clean data. Validate products.
// BREAKS IF: Headers are completely empty (returns 'generic-csv' — safe fallback).
// ASSUMES: Headers are string array from SheetJS sheet_to_json keys.
// LEVEL: 3 — Integrated. Single-responsibility. Independently testable.
// VERIFIED: AI self-check. Tested against known Matrixify headers (has 'Top Row' + 'Handle' + 'Image Src').
// ═══════════════════════════════════════════════════════════

import type { FileType } from '../contracts/product';

export function detectFileType(headers: string[]): FileType {
  const h = headers.map(x => (x || '').toLowerCase().trim());
  const joined = h.join('|');

  if (h.includes('top row') && h.includes('handle') && joined.includes('image src')) return 'shopify-matrixify';
  if (h.includes('handle') && h.includes('title') && joined.includes('image')) return 'shopify-csv';
  if (joined.includes('autods') || (h.includes('source url') && h.includes('source price'))) return 'autods';
  if (h.includes('action') && (h.includes('itemid') || h.includes('category'))) return 'ebay-file-exchange';
  if (h.some(x => ['title','name','product','product title','product name','item name'].includes(x))) return 'generic-csv';
  if (h.some(x => ['price','cost','sku','asin','variant price','sell price'].includes(x))) return 'generic-csv';

  return 'generic-csv';
}

export function detectASINList(rows: Record<string, unknown>[]): boolean {
  if (!rows.length) return false;
  if (Object.keys(rows[0]).length > 4) return false;
  let hits = 0;
  for (const row of rows.slice(0, 30)) {
    for (const v of Object.values(row)) {
      const s = String(v || '');
      if (/^B[0-9A-Z]{9}$/.test(s.trim().replace(/['"]/g, '').toUpperCase())) hits++;
      if (/amazon\.com.*\/dp\//.test(s)) hits++;
    }
  }
  return hits > 10;
}
