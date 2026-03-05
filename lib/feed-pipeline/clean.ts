// ═══ DELIVERY ENVELOPE ═══
// FILE: lib/pipeline/clean.ts
// LINES: ~110
// IMPORTS FROM: lib/pipeline/map.ts (ColumnMap), lib/contracts/constants.ts (DESC_BOILERPLATE)
// EXPORTS TO: lib/pipeline/index.ts
// DOES: Takes raw JSON rows + ColumnMap and extracts clean values for each product. Cleans HTML from descriptions (strips meta, script, style, extracts bullets, removes boilerplate). Extracts ASINs from URLs or raw text. Builds image arrays from pipe-separated columns. Deduplicates by ASIN and Handle.
// DOES NOT: Validate products (that's the validate stage). Calculate prices (that's the price stage). Run gates. Render UI.
// BREAKS IF: ColumnMap has no mapped columns (produces empty products — not an error, just empty).
// ASSUMES: jsonRows is the output of SheetJS sheet_to_json. ColumnMap is from map.ts.
// LEVEL: 3 — Integrated. Single-responsibility stage. Independently testable with any ColumnMap.
// VERIFIED: AI self-check.
// ═══════════════════════════════════════════════════════════

import type { ColumnMap } from './map';
import { DESC_BOILERPLATE } from '../contracts/constants';

// ── Raw product shape (pre-validation, pre-pricing) ─────
export interface RawProduct {
  title: string; asin: string; handle: string; barcode: string;
  cost: number; sellPrice: number; compareAt: number;
  amazonPrice: number; costcoPrice: number; ebayPrice: number; samsPrice: number;
  marketPrice: number; profitVal: number; profitPct: number;
  images: string[]; description: string; vendor: string; category: string;
  googleCategory: string; tags: string; seoTitle: string; seoDescription: string;
  weight: string; status: string; quantity: number; stockStatus: string;
  rating: number; reviews: number; bsr: number;
}

// ── HTML cleaner ────────────────────────────────────────

export function cleanDescription(html: string): string {
  if (!html || html.length < 10) return html || '';
  let text = html
    .replace(/<meta[^>]*>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  const bullets = [...text.matchAll(/<li[^>]*>(.*?)<\/li>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, '').trim())
    .filter(b => b.length > 10 && b.length < 300);
  if (bullets.length >= 2) return bullets.slice(0, 6).join(' | ');
  text = text.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  for (const marker of DESC_BOILERPLATE) {
    const idx = text.toLowerCase().indexOf(marker);
    if (idx > 100) { text = text.substring(0, idx).trim(); break; }
  }
  return text.substring(0, 500);
}

// ── ASIN extractor ──────────────────────────────────────

export function extractASIN(val: string): string {
  if (!val) return '';
  const clean = String(val).trim().replace(/['"]/g, '').toUpperCase();
  if (/^B[0-9A-Z]{9}$/.test(clean)) return clean;
  const m = String(val).match(/\/dp\/([A-Z0-9]{10})/i) || String(val).match(/\b(B[0-9A-Z]{9})\b/);
  return m ? m[1].toUpperCase() : '';
}

// ── Main extraction function ────────────────────────────

export function extractProducts(
  jsonRows: Record<string, unknown>[],
  colMap: ColumnMap,
): { products: RawProduct[]; removedRows: number } {
  const products: RawProduct[] = [];
  const seenASINs = new Set<string>();
  const seenHandles = new Set<string>();
  let removedRows = 0;

  const get = (row: Record<string, unknown>, key: string | null) =>
    key ? String(row[key] ?? '').trim() : '';

  for (const row of jsonRows) {
    // Matrixify top-row filter
    if (colMap.topRow) {
      const tr = get(row, colMap.topRow).toLowerCase();
      if (tr !== 'true' && tr !== '1' && tr !== 'yes') { removedRows++; continue; }
    }

    const title = get(row, colMap.title).replace(/^["']|["']$/g, '');
    const asin = extractASIN(get(row, colMap.asin));
    const handle = get(row, colMap.handle);
    if (!title && !asin && !handle) { removedRows++; continue; }
    if (asin && seenASINs.has(asin)) { removedRows++; continue; }
    if (!asin && handle && seenHandles.has(handle)) { removedRows++; continue; }
    if (asin) seenASINs.add(asin);
    if (handle) seenHandles.add(handle);

    // Images
    const rawImg = get(row, colMap.image);
    const rawAll = get(row, colMap.allImages);
    const images: string[] = [];
    if (rawImg) for (const u of rawImg.split(/\s*\|\s*/).filter(s => s.startsWith('http'))) { if (!images.includes(u)) images.push(u); }
    if (rawAll) for (const u of rawAll.split(/\s*\|\s*/).filter(s => s.startsWith('http'))) { if (!images.includes(u)) images.push(u); }

    // Cost priority: cost column > price column
    const rawCost = get(row, colMap.cost);
    const rawPrice = get(row, colMap.price) || '0';
    const cost = parseFloat((rawCost || rawPrice).replace(/[^0-9.]/g, '')) || 0;
    const sellPrice = colMap.sellPrice ? parseFloat(get(row, colMap.sellPrice).replace(/[^0-9.]/g, '')) || 0 : 0;

    products.push({
      title: title || (asin ? `Amazon Product ${asin}` : 'Unknown Product'),
      asin, handle,
      barcode: get(row, colMap.barcode).replace(/[^0-9]/g, ''),
      cost, sellPrice,
      compareAt: parseFloat(get(row, colMap.compareAt).replace(/[^0-9.]/g, '')) || 0,
      amazonPrice: parseFloat(get(row, colMap.amazonPrice) || '0') || 0,
      costcoPrice: parseFloat(get(row, colMap.costcoPrice) || '0') || 0,
      ebayPrice: parseFloat(get(row, colMap.ebayPrice) || '0') || 0,
      samsPrice: parseFloat(get(row, colMap.samsPrice) || '0') || 0,
      marketPrice: parseFloat(get(row, colMap.marketPrice) || '0') || 0,
      profitVal: parseFloat(get(row, colMap.profitCol) || '0') || 0,
      profitPct: parseFloat((get(row, colMap.profitPctCol) || '0').replace('%', '')) || 0,
      images,
      description: cleanDescription(get(row, colMap.description)),
      vendor: (get(row, colMap.vendor) || 'Unknown').substring(0, 30),
      category: (get(row, colMap.category) || 'General').substring(0, 40),
      googleCategory: get(row, colMap.googleCategory),
      tags: get(row, colMap.tags),
      seoTitle: get(row, colMap.seoTitle),
      seoDescription: get(row, colMap.seoDescription),
      weight: get(row, colMap.weight),
      status: get(row, colMap.status) || 'Active',
      quantity: parseInt(get(row, colMap.quantity)) || 999,
      stockStatus: get(row, colMap.stockStatus),
      rating: parseFloat(get(row, colMap.rating)) || 0,
      reviews: parseInt(get(row, colMap.reviews)) || 0,
      bsr: parseInt(get(row, colMap.bsr).replace(/[^0-9]/g, '')) || 0,
    });
  }

  return { products, removedRows };
}
