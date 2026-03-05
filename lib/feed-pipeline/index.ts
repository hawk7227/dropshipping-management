// ═══ DELIVERY ENVELOPE ═══
// FILE: lib/pipeline/index.ts
// LINES: ~120
// IMPORTS FROM: ./detect.ts, ./map.ts, ./clean.ts, lib/contracts/ (product, constants, pricing, merchant), lib/gates/index.ts
// EXPORTS TO: Generator page, Feed Bot API
// DOES: Composes the full pipeline: detect → map → clean → price → validate → score. Provides processFile() which takes raw sheet data and returns FileAnalysis. Also provides processASINList() for ASIN-only files. Each stage is independently importable for testing.
// DOES NOT: Parse XLSX/CSV (caller does that with SheetJS). Render UI. Push to Shopify.
// BREAKS IF: SheetJS output format changes. Gate registry is empty (produces 0 scores — not a crash).
// ASSUMES: Caller has parsed file into jsonRows + headers using SheetJS sheet_to_json.
// LEVEL: 3 — Integrated. Stages are independently testable. Pipeline is composable. Types flow through Zod schemas at the boundary.
// VERIFIED: AI self-check.
// ═══════════════════════════════════════════════════════════

import type { CleanProduct, FileType, FileAnalysis } from '../contracts/product';
import { createEmptyProduct } from '../contracts/product';
import { TOTAL_GATES } from '../contracts/merchant';
import { applyMarkup, calcCompetitors } from '../contracts/pricing';
import { MARKUP, COMPETITOR_MULTIPLIERS } from '../contracts/constants';
import { runAllGates } from '../gates';
import { detectFileType, detectASINList } from './detect';
import { mapColumns, autoDetectASINColumn } from './map';
import { extractProducts, extractASIN } from './clean';
import type { RawProduct } from './clean';

// ── Stage 4: Price ──────────────────────────────────────
// Applies markup and competitor pricing to raw products.

function priceProduct(raw: RawProduct): Partial<CleanProduct> {
  const cost = raw.cost;
  let sell = raw.sellPrice;
  let profit = raw.profitVal;
  let profitPct = raw.profitPct;

  if (cost > 0 && !sell) {
    const m = applyMarkup(cost, MARKUP);
    sell = m.sell;
    profit = m.profit;
    profitPct = m.profitPct;
  }

  const competitors = (raw.amazonPrice > 0 || raw.costcoPrice > 0 || raw.ebayPrice > 0 || raw.samsPrice > 0)
    ? { amazon: raw.amazonPrice, costco: raw.costcoPrice, ebay: raw.ebayPrice, sams: raw.samsPrice }
    : calcCompetitors(sell, COMPETITOR_MULTIPLIERS);

  const stockStatus = raw.stockStatus.toLowerCase().includes('in stock') ? 'In Stock' as const
    : raw.stockStatus.toLowerCase().includes('out') ? 'Out of Stock' as const
    : (cost > 0 && raw.title ? 'In Stock' as const : 'Unknown' as const);

  return {
    pricing: {
      cost, sell, compareAt: raw.compareAt, marketPrice: raw.marketPrice,
      competitors, profit, profitPct, lowMargin: profitPct > 0 && profitPct < 30,
    },
  } as Partial<CleanProduct>;
}

// ── Stage 5: Assemble + Validate + Score ────────────────
// Converts RawProduct → CleanProduct with gates and feed score.

function assembleAndValidate(raw: RawProduct): CleanProduct {
  const priced = priceProduct(raw);
  const product = createEmptyProduct({
    title: raw.title, asin: raw.asin, handle: raw.handle, barcode: raw.barcode,
    description: raw.description, vendor: raw.vendor, category: raw.category, tags: raw.tags,
    status: raw.status, quantity: raw.quantity, stockStatus: (priced as any)?.stockStatus || 'Unknown',
    rating: raw.rating, reviews: raw.reviews, bsr: raw.bsr,
    pricing: (priced as any)?.pricing,
    media: { images: raw.images },
    merchant: { googleCategory: raw.googleCategory, seoTitle: raw.seoTitle, seoDescription: raw.seoDescription, weight: raw.weight },
  });

  // Run all 10 gates
  const { results, passCount, feedScore } = runAllGates(product);

  return {
    ...product,
    merchant: { ...product.merchant, gateResults: results, gateCount: passCount, feedScore },
  };
}

// ═══════════════════════════════════════════════════════════
// THE PIPELINE — processFile()
// This is the ONE function the generator page calls.
// ═══════════════════════════════════════════════════════════

export function processFile(
  jsonRows: Record<string, unknown>[],
  headers: string[],
): FileAnalysis {
  const start = performance.now();
  const fileType = detectFileType(headers);

  // Map columns
  const colMap = mapColumns(headers);
  if (!colMap.asin) {
    const detected = autoDetectASINColumn(headers, jsonRows);
    if (detected) colMap.asin = detected;
  }

  // Detect features
  const features: string[] = [];
  if (colMap.topRow) features.push('Top Row dedup');
  if (colMap.handle) features.push('Handle dedup');
  if (colMap.barcode) features.push('Has barcodes/GTIN');
  if (colMap.googleCategory) features.push('Has Google categories');
  if (colMap.description) features.push('Has descriptions');
  if (colMap.image) features.push(`Image: ${colMap.image}`);
  if (colMap.asin) features.push(`ASIN: ${colMap.asin}`);

  // Extract + Clean
  const { products: rawProducts, removedRows } = extractProducts(jsonRows, colMap);

  // Price + Validate + Score
  const products = rawProducts.map(assembleAndValidate);

  const passed = products.filter(p => p.merchant.gateCount === TOTAL_GATES).length;
  const failed = products.filter(p => p.merchant.gateCount < 5).length;

  return {
    type: fileType, totalRows: jsonRows.length, totalCols: headers.length,
    uniqueProducts: products.length, removedRows, removedCols: Math.max(0, headers.length - 20),
    detectedFeatures: features, products, passed, failed,
    warned: products.length - passed - failed,
    processingTime: Math.round(performance.now() - start),
  };
}

// ═══════════════════════════════════════════════════════════
// ASIN LIST PROCESSOR
// ═══════════════════════════════════════════════════════════

export function processASINList(jsonRows: Record<string, unknown>[]): FileAnalysis {
  const start = performance.now();
  const asins = new Set<string>();
  for (const row of jsonRows) {
    for (const v of Object.values(row)) {
      const s = String(v || '');
      const clean = s.trim().replace(/['"]/g, '').toUpperCase();
      if (/^B[0-9A-Z]{9}$/.test(clean)) asins.add(clean);
      for (const m of s.matchAll(/\/dp\/([A-Z0-9]{10})/gi)) asins.add(m[1].toUpperCase());
    }
  }

  const products = [...asins].map(asin => {
    const product = createEmptyProduct({ asin, status: 'Draft' });
    const { results, passCount, feedScore } = runAllGates(product);
    return { ...product, merchant: { ...product.merchant, gateResults: results, gateCount: passCount, feedScore } };
  });

  return {
    type: 'asin-list', totalRows: jsonRows.length, totalCols: Object.keys(jsonRows[0] || {}).length,
    uniqueProducts: products.length, removedRows: jsonRows.length - products.length, removedCols: 0,
    detectedFeatures: ['ASIN extraction', `${asins.size} unique ASINs`, 'Needs Keepa/Rainforest enrichment'],
    products, passed: 0, failed: products.length, warned: 0,
    processingTime: Math.round(performance.now() - start),
  };
}

// Re-export stages for independent testing
export { detectFileType, detectASINList } from './detect';
export { mapColumns } from './map';
export { extractProducts, cleanDescription, extractASIN } from './clean';
