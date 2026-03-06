'use client';
import { useState, useCallback, useRef, useMemo } from 'react';
import MissionStatus from '@/components/MissionStatus';

// ═══════════════════════════════════════════════════════════
// FOUNDATION IMPORTS — Level 3 system
// All types, validators, constants, and pipeline logic from foundation packages
// ═══════════════════════════════════════════════════════════
import { TOTAL_GATES } from '@/lib/contracts/merchant';
import { MARKUP } from '@/lib/contracts/constants';
import { runAllGates } from '@/lib/gates';
import GateBadge from '@/components/feed/GateBadge';
import FeedScoreBadge from '@/components/feed/FeedScoreBadge';
import FeedBotPanel from '@/components/feed/FeedBotPanel';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════
type FileType = 'shopify-matrixify' | 'shopify-csv' | 'autods' | 'asin-list' | 'ebay-file-exchange' | 'generic-csv' | 'unknown';
type GateStatus = 'pass' | 'fail' | 'warn';
type ViewMode = 'table' | 'spreadsheet' | 'cards';

interface CompetitorPrices {
  amazon: number; costco: number; ebay: number; sams: number;
}

const COMPETITOR_MULTIPLIERS = {
  amazon: 1.85, costco: 1.82, ebay: 1.90, sams: 1.80,
};

function calcCompetitorPrices(sellPrice: number): CompetitorPrices {
  // Fallback: static multipliers when no market research has been done
  // Market research (researchPrices) will overwrite these with real data
  if (!sellPrice || sellPrice <= 0) return { amazon: 0, costco: 0, ebay: 0, sams: 0 };
  return {
    amazon: +(sellPrice * COMPETITOR_MULTIPLIERS.amazon).toFixed(2),
    costco: +(sellPrice * COMPETITOR_MULTIPLIERS.costco).toFixed(2),
    ebay: +(sellPrice * COMPETITOR_MULTIPLIERS.ebay).toFixed(2),
    sams: +(sellPrice * COMPETITOR_MULTIPLIERS.sams).toFixed(2),
  };
}

interface CleanProduct {
  title: string; asin: string; price: number; compareAt: number; image: string;
  images: string[];
  description: string; vendor: string; category: string; tags: string; status: string; quantity: number;
  profit: number; profitPct: number; sellPrice: number;
  marketPrice: number;
  competitorPrices: CompetitorPrices;
  lowMargin: boolean;
  stockStatus: 'In Stock' | 'Out of Stock' | 'Unknown';
  dateChecked: string;
  rating: number; reviews: number; bsr: number;
  // Google Merchant Center fields
  barcode: string; weight: string; googleCategory: string;
  seoTitle: string; seoDescription: string; handle: string; feedScore: number;
  shopifyStatus: 'not_pushed' | 'pushing' | 'pushed' | 'failed';
  shopifyError: string;
  selected: boolean;
  gates: { title: GateStatus; image: GateStatus; price: GateStatus; asin: GateStatus; description: GateStatus;
    googleCategory: GateStatus; titleLength: GateStatus; descClean: GateStatus; barcode: GateStatus; identifier: GateStatus; };
  gateCount: number;
}

interface FileAnalysis {
  type: FileType; totalRows: number; totalCols: number; uniqueProducts: number;
  removedRows: number; removedCols: number; detectedFeatures: string[];
  products: CleanProduct[]; passed: number; failed: number; warned: number; processingTime: number;
}

// ═══════════════════════════════════════════════════════════
// FILE TYPE DETECTION
// ═══════════════════════════════════════════════════════════
function detectFileType(headers: string[]): FileType {
  const h = headers.map(x => (x || '').toLowerCase().trim());
  const joined = h.join('|');
  if (h.includes('top row') && h.includes('handle') && joined.includes('image src')) return 'shopify-matrixify';
  if (h.includes('handle') && h.includes('title') && joined.includes('image')) return 'shopify-csv';
  if (joined.includes('autods') || (h.includes('source url') && h.includes('source price'))) return 'autods';
  if (h.includes('action') && (h.includes('itemid') || h.includes('category'))) return 'ebay-file-exchange';
  // Broad generic detection: any file with recognizable product-related columns
  if (h.some(x => ['title','name','product','product title','product name','item name'].includes(x))) return 'generic-csv';
  if (h.some(x => ['price','cost','sku','asin','variant price','sell price'].includes(x))) return 'generic-csv';
  // If we can't identify the format, still treat it as generic so processRows runs
  return 'generic-csv';
}

function detectASINList(rows: Record<string,unknown>[]): boolean {
  if (!rows.length) return false;
  const keys = Object.keys(rows[0]);
  if (keys.length > 4) return false;
  let asinCount = 0;
  for (const row of rows.slice(0, 30)) {
    for (const v of Object.values(row)) {
      const s = String(v || '');
      if (/^B[0-9A-Z]{9}$/.test(s.trim().replace(/['"]/g,'').toUpperCase())) asinCount++;
      if (/amazon\.com.*\/dp\//.test(s)) asinCount++;
    }
  }
  return asinCount > 10;
}

// ═══════════════════════════════════════════════════════════
// ASIN AUTO-DETECT: Scans cell values to find which column contains ASINs
// Used as fallback when mapColumns can't find ASIN by header name
// ═══════════════════════════════════════════════════════════
function autoDetectASINColumn(headers: string[], rows: Record<string, unknown>[]): string | null {
  const sample = rows.slice(0, 20);
  let bestCol: string | null = null;
  let bestScore = 0;

  for (const col of headers) {
    let asinHits = 0;
    for (const row of sample) {
      const val = String(row[col] ?? '').trim().replace(/['"]/g, '').toUpperCase();
      if (/^B[0-9A-Z]{9}$/.test(val)) asinHits++;
      else if (/\/dp\/([A-Z0-9]{10})/i.test(val)) asinHits++;
    }
    if (asinHits > bestScore) { bestScore = asinHits; bestCol = col; }
  }

  // Need at least 30% of sampled rows to have ASINs to be confident
  return (bestScore >= Math.max(3, sample.length * 0.3)) ? bestCol : null;
}

// ═══════════════════════════════════════════════════════════
// COLUMN MAPPER
// ═══════════════════════════════════════════════════════════
function mapColumns(headers: string[]): Record<string, string | null> {
  const h = headers.map(x => (x || '').toLowerCase().trim());
  const map: Record<string, string | null> = {};

  const find = (keys: string[], exclude: string[] = []): string | null => {
    for (const k of keys) {
      const i = h.findIndex(x => {
        if (x === k) return true;
        if (x.includes(k) && !exclude.some(ex => x.includes(ex))) return true;
        return false;
      });
      if (i >= 0) return headers[i];
    }
    return null;
  };

  map.title = find(['title', 'product title', 'product name', 'item name', 'item title', 'name', 'listing title', 'product'], ['option', 'meta', 'alt', 'type', 'id', 'code', 'sku']);
  map.asin = find(['variant sku', 'sku', 'asin', 'amazon asin', 'source_product_id', 'item number', 'product id', 'amazon id', 'item asin', 'item sku', 'product sku', 'source sku', 'fnsku', 'product code', 'id', 'upc', 'ean', 'item id', 'listing id'], ['image', 'order', 'tracking']);
  map.cost = find(['cost', 'source cost', 'source_cost', 'amazon cost', 'item cost', 'unit cost', 'buy cost', 'purchase price', 'wholesale', 'supplier price', 'source price'], ['costco']);
  map.sellPrice = find(['sell price', 'sell_price', 'selling price', 'our price', 'your price', 'retail price', 'listed price'], []);
  map.price = find(['variant price', 'price', 'sale price'], ['compare', 'cost', 'sell', 'source', 'buy', 'wholesale', 'supplier', 'amazon', 'costco', 'ebay', 'sam', 'market', 'retail', 'listed']);
  map.compareAt = find(['variant compare at price', 'compare at price', 'compare_at_price', 'msrp', 'list price', 'compare at', 'rrp', 'retail price']);
  map.amazonPrice = find(['amazon $', 'amazon price', 'price_amazon'], ['cost', 'source']);
  map.costcoPrice = find(['costco $', 'costco price', 'price_costco'], []);
  map.ebayPrice = find(['ebay $', 'ebay price', 'price_ebay'], []);
  map.samsPrice = find(["sam's $", 'sams $', 'sams price', 'sam\'s club price', 'price_samsclub', "sam's club $"], []);
  map.marketPrice = find(['market $', 'market price', 'market_price', 'avg market', 'market avg'], []);
  map.profitCol = find(['profit $', 'profit_dollar', 'profit'], ['%', 'pct', 'percent', 'margin']);
  map.profitPctCol = find(['profit %', 'profit_pct', 'profit_percent', 'margin %', 'margin', 'profit margin'], []);
  map.image = find(['image src', 'image_src', 'image url', 'image_url', 'main image', 'image link', 'photo', 'thumbnail', 'picture', 'img'], ['type', 'command', 'position', 'width', 'height', 'alt', 'all', 'count']);
  map.allImages = find(['all images', 'all_images', 'additional images', 'image gallery', 'extra images', 'gallery'], []);
  map.description = find(['body (html)', 'body html', 'body_html', 'description', 'product description', 'details', 'item description', 'long description']);
  map.vendor = find(['vendor', 'brand', 'manufacturer', 'supplier', 'maker', 'brand name', 'sold by']);
  map.category = find(['product type', 'product_type', 'type', 'category', 'department', 'product category'], ['image', 'variant', 'meta']);
  map.tags = find(['tags', 'keywords', 'labels']);
  map.status = find(['status', 'listing status', 'product status'], ['inventory', 'stock', 'order']);
  map.quantity = find(['variant inventory qty', 'inventory', 'quantity', 'stock', 'total inventory qty', 'qty', 'available', 'stock qty', 'in stock'], ['status', 'out']);
  map.handle = find(['handle', 'slug', 'url handle']);
  map.topRow = find(['top row']);
  map.rating = find(['rating', 'star rating', 'stars', 'avg rating'], []);
  map.reviews = find(['reviews', 'review count', 'number of reviews', 'ratings count'], []);
  map.bsr = find(['bsr', 'best seller rank', 'sales rank', 'best sellers rank', 'rank'], ['date', 'page']);
  map.stockStatus = find(['stock', 'stock status', 'availability', 'in stock'], ['qty', 'quantity', 'inventory']);
  // Google Merchant Center columns
  map.barcode = find(['variant barcode', 'barcode', 'gtin', 'upc', 'ean', 'isbn']);
  map.weight = find(['variant weight', 'weight', 'shipping weight'], ['unit']);
  map.googleCategory = find(['google product category', 'google_product_category', 'mc-facebook.google_product_category', 'google category']);
  map.seoTitle = find(['title_tag', 'seo title', 'meta title', 'metafield: title_tag']);
  map.seoDescription = find(['description_tag', 'seo description', 'meta description', 'metafield: description_tag']);
  return map;
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
function cleanHTML(html: string): string {
  if (!html || html.length < 10) return html || '';
  const bullets = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/gi)].map(m => m[1].replace(/<[^>]+>/g,'').trim()).filter(b => b.length > 10 && b.length < 300);
  if (bullets.length >= 2) return bullets.slice(0, 6).join(' | ');
  let text = html.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
  const bp = ['about us','shipping','returns','payment','contact us','customer satisfaction','we offer the best','copyright'];
  for (const b of bp) { const idx = text.toLowerCase().indexOf(b); if (idx > 100) { text = text.substring(0, idx).trim(); break; } }
  return text.substring(0, 500);
}

function extractASIN(val: string): string {
  if (!val) return '';
  const clean = String(val).trim().replace(/['"]/g,'').toUpperCase();
  if (/^B[0-9A-Z]{9}$/.test(clean)) return clean;
  const m = String(val).match(/\/dp\/([A-Z0-9]{10})/i) || String(val).match(/\b(B[0-9A-Z]{9})\b/);
  return m ? m[1].toUpperCase() : '';
}

// MARKUP imported from @/lib/contracts/constants

function runGates(p: CleanProduct): CleanProduct {
  const g = {
    title:'fail' as GateStatus, image:'fail' as GateStatus, price:'fail' as GateStatus, asin:'fail' as GateStatus, description:'fail' as GateStatus,
    googleCategory:'fail' as GateStatus, titleLength:'fail' as GateStatus, descClean:'fail' as GateStatus, barcode:'fail' as GateStatus, identifier:'fail' as GateStatus,
  };
  // Original 5 gates
  if (p.title && p.title.length > 5 && !p.title.includes('<') && p.title.toLowerCase() !== 'unknown product') g.title = 'pass';
  else if (p.title?.length > 0) g.title = 'warn';
  if ((p.images?.length || 0) >= 3) g.image = 'pass'; else if (p.image?.startsWith('http')) g.image = 'warn';
  if (p.price > 0) g.price = 'pass'; else if (p.compareAt > 0) g.price = 'warn';
  if (p.asin && /^B[0-9A-Z]{9}$/.test(p.asin)) g.asin = 'pass';
  if (p.description?.length > 30) g.description = 'pass'; else if (p.description?.length > 0) g.description = 'warn';

  // Google Merchant Gate 6: Google Product Category
  if (p.googleCategory && p.googleCategory.length > 5) g.googleCategory = 'pass';
  else g.googleCategory = 'fail';

  // Gate 7: Title length + compliance (≤150 chars, no promo text)
  if (p.title && p.title.length <= 150 && p.title.length > 5) g.titleLength = 'pass';
  else if (p.title && p.title.length > 150 && p.title.length <= 180) g.titleLength = 'warn';
  else if (p.title && p.title.length > 180) g.titleLength = 'fail';

  // Gate 8: Description clean (no HTML, no Amazon junk)
  if (p.description && p.description.length >= 50 && !/<[a-z][^>]*>/i.test(p.description) && !/content="width=device-width/i.test(p.description)) g.descClean = 'pass';
  else if (p.description && p.description.length >= 20) g.descClean = 'warn';

  // Gate 9: Barcode/GTIN valid
  if (p.barcode && /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(p.barcode)) g.barcode = 'pass';
  else if (p.barcode && p.barcode.length >= 8) g.barcode = 'warn';

  // Gate 10: Identifier (GTIN+Brand or Brand+MPN)
  const hasBrand = p.vendor && p.vendor !== 'Unknown' && p.vendor.length > 1;
  if ((g.barcode === 'pass' && hasBrand) || (p.asin && hasBrand)) g.identifier = 'pass';
  else if (hasBrand) g.identifier = 'warn';

  // Calculate feed score (0-100)
  let feedScore = 0;
  if (g.titleLength === 'pass') feedScore += 20;
  if (g.descClean === 'pass') feedScore += 15;
  if (g.image !== 'fail') feedScore += 15;
  if (g.price === 'pass') feedScore += 15;
  if (g.barcode === 'pass') feedScore += 15;
  if (g.googleCategory === 'pass') feedScore += 10;
  if (hasBrand) feedScore += 5;
  feedScore += 5; // Free shipping = always pass

  // Auto-calculate sell price and profit if not already set
  let { sellPrice, profit, profitPct, stockStatus } = p;
  if (p.price > 0 && !sellPrice) {
    sellPrice = +(p.price * MARKUP).toFixed(2);
    profit = +(sellPrice - p.price).toFixed(2);
    profitPct = +((profit / p.price) * 100).toFixed(1);
  }
  // Default stock status
  if (stockStatus === 'Unknown' && p.price > 0 && p.title) stockStatus = 'In Stock';

  return { ...p, sellPrice, profit, profitPct, stockStatus,
    marketPrice: p.marketPrice || 0,
    competitorPrices: (p.competitorPrices?.amazon > 0) ? p.competitorPrices : calcCompetitorPrices(sellPrice || p.sellPrice),
    lowMargin: (profitPct > 0 && profitPct < 30) ? true : (p.lowMargin || false),
    shopifyStatus: p.shopifyStatus || 'not_pushed', shopifyError: p.shopifyError || '', selected: p.selected || false,
    feedScore,
    gates: g, gateCount: Object.values(g).filter(v => v === 'pass').length };
}

// ═══════════════════════════════════════════════════════════
// MAIN PROCESSOR — uses sheet_to_json (NOT sheet_to_csv)
// ═══════════════════════════════════════════════════════════
function processRows(jsonRows: Record<string,unknown>[], headers: string[], fileType: FileType): FileAnalysis {
  const start = performance.now();
  const colMap = mapColumns(headers);

  // ASIN auto-detect fallback: if mapColumns didn't find an ASIN column by name,
  // scan actual cell values to find which column contains B0XXXXXXXXX patterns
  if (!colMap.asin) {
    const detected = autoDetectASINColumn(headers, jsonRows);
    if (detected) colMap.asin = detected;
  }

  const features: string[] = [];
  if (colMap.topRow) features.push('Top Row dedup');
  if (colMap.handle) features.push('Handle dedup');
  if (colMap.image) features.push(`Image: ${colMap.image}`);
  if (colMap.asin) features.push(`ASIN: ${colMap.asin}`);
  if (colMap.description) features.push('Has descriptions');

  const products: CleanProduct[] = [];
  const seenHandles = new Set<string>();
  const seenASINs = new Set<string>();
  let removedRows = 0;

  for (const row of jsonRows) {
    const get = (key: string | null) => key ? String(row[key] ?? '').trim() : '';

    // Top Row filter
    if (colMap.topRow) {
      const tr = get(colMap.topRow).toLowerCase();
      if (tr !== 'true' && tr !== '1' && tr !== 'yes' && tr !== 'TRUE') { removedRows++; continue; }
    }

    const title = get(colMap.title).replace(/^["']|["']$/g,'');
    const asin = extractASIN(get(colMap.asin));
    const handle = get(colMap.handle);
    if (!title && !asin && !handle) { removedRows++; continue; }
    if (asin && seenASINs.has(asin)) { removedRows++; continue; }
    if (!asin && handle && seenHandles.has(handle)) { removedRows++; continue; }
    if (asin) seenASINs.add(asin);
    if (handle) seenHandles.add(handle);

    const rawImage = get(colMap.image);
    const rawAllImages = get(colMap.allImages);
    // Priority: cost column > price column (cost is the Amazon source cost)
    const rawCost = get(colMap.cost) || '';
    const rawPrice = get(colMap.price) || '0';
    const rawSellPrice = get(colMap.sellPrice) || '';
    const rawCompare = get(colMap.compareAt) || '0';

    // PRICING LOGIC — depends on file format:
    // Matrixify/Shopify exports: "Variant Price" = retail sell price (NOT Amazon cost)
    //   "Variant Compare At Price" = strikethrough price. No cost column exists.
    //   Reverse-calculate: cost = sellPrice / MARKUP
    // Other files (AutoDS, ASIN enrichment): may have explicit Cost column
    const costVal = rawCost ? parseFloat(rawCost.replace(/[^0-9.]/g,'')) || 0 : 0;
    const priceVal = parseFloat(rawPrice.replace(/[^0-9.]/g,'')) || 0;
    const sellVal = rawSellPrice ? parseFloat(rawSellPrice.replace(/[^0-9.]/g,'')) || 0 : 0;

    let importedCost: number;
    let importedSell: number;

    if (costVal > 0) {
      // Explicit cost column found (AutoDS, enriched files) — cost is cost, sell is sell
      importedCost = costVal;
      importedSell = sellVal > 0 ? sellVal : 0;
    } else if (fileType === 'shopify-matrixify' || fileType === 'shopify-csv') {
      // Shopify exports: "Variant Price" = retail sell price, no cost column
      // Reverse-calculate the Amazon cost from sell price
      importedSell = priceVal;
      importedCost = priceVal > 0 ? +(priceVal / MARKUP).toFixed(2) : 0;
    } else {
      // Generic: treat price as cost if no explicit cost column
      importedCost = priceVal;
      importedSell = sellVal > 0 ? sellVal : 0;
    }

    // Read competitor prices from file if present
    const rawAmazon = parseFloat(get(colMap.amazonPrice) || '0') || 0;
    const rawCostco = parseFloat(get(colMap.costcoPrice) || '0') || 0;
    const rawEbay = parseFloat(get(colMap.ebayPrice) || '0') || 0;
    const rawSams = parseFloat(get(colMap.samsPrice) || '0') || 0;
    const rawMarket = parseFloat(get(colMap.marketPrice) || '0') || 0;
    const rawProfitVal = parseFloat(get(colMap.profitCol) || '0') || 0;
    const rawProfitPct = parseFloat((get(colMap.profitPctCol) || '0').replace('%','')) || 0;

    // Build full images array: main image + all images column (pipe-separated)
    // Handles both old exports (separate columns) and new exports (single pipe-separated column)
    const allImgs: string[] = [];
    // Parse rawImage — may be single URL or pipe-separated list
    if (rawImage) {
      const parts = rawImage.split(/\s*\|\s*/).filter((u: string) => u.startsWith('http'));
      for (const url of parts) { if (!allImgs.includes(url)) allImgs.push(url); }
    }
    // Parse rawAllImages — pipe-separated (from old exports or external files)
    if (rawAllImages) {
      const parsed = rawAllImages.split(/\s*\|\s*/).filter((u: string) => u.startsWith('http'));
      for (const url of parsed) { if (!allImgs.includes(url)) allImgs.push(url); }
    }

    const product: CleanProduct = {
      title: title || (asin ? `Amazon Product ${asin}` : 'Unknown Product'),
      asin,
      price: importedCost,
      compareAt: parseFloat(rawCompare.replace(/[^0-9.]/g,'')) || 0,
      image: allImgs[0] || '',
      images: allImgs,
      description: cleanHTML(get(colMap.description)),
      vendor: (get(colMap.vendor) || 'Unknown').substring(0, 30),
      category: (get(colMap.category) || 'General').substring(0, 40),
      tags: get(colMap.tags),
      status: get(colMap.status) || 'Active',
      quantity: parseInt(get(colMap.quantity)) || 999,
      profit: rawProfitVal, profitPct: rawProfitPct, sellPrice: importedSell,
      marketPrice: rawMarket,
      competitorPrices: (rawAmazon > 0 || rawCostco > 0 || rawEbay > 0 || rawSams > 0)
        ? { amazon: rawAmazon, costco: rawCostco, ebay: rawEbay, sams: rawSams }
        : { amazon: 0, costco: 0, ebay: 0, sams: 0 },
      lowMargin: false,
      stockStatus: (get(colMap.stockStatus) || '').toLowerCase().includes('in stock') ? 'In Stock' as const
        : (get(colMap.stockStatus) || '').toLowerCase().includes('out') ? 'Out of Stock' as const
        : 'Unknown' as const,
      dateChecked: '',
      rating: parseFloat(get(colMap.rating)) || 0,
      reviews: parseInt(get(colMap.reviews)) || 0,
      bsr: parseInt(String(get(colMap.bsr)).replace(/[^0-9]/g, '')) || 0,
      shopifyStatus: 'not_pushed', shopifyError: '', selected: false,
      barcode: get(colMap.barcode).replace(/[^0-9]/g, ''),
      weight: get(colMap.weight), googleCategory: get(colMap.googleCategory),
      seoTitle: get(colMap.seoTitle), seoDescription: get(colMap.seoDescription),
      handle: get(colMap.handle), feedScore: 0,
      gates: { title:'fail', image:'fail', price:'fail', asin:'fail', description:'fail', googleCategory:'fail', titleLength:'fail', descClean:'fail', barcode:'fail', identifier:'fail' }, gateCount: 0,
    };
    products.push(runGates(product));
  }

  const passed = products.filter(p => p.gateCount === 10).length;
  const failed = products.filter(p => p.gateCount < 3).length;
  return {
    type: fileType, totalRows: jsonRows.length, totalCols: headers.length,
    uniqueProducts: products.length, removedRows, removedCols: Math.max(0, headers.length - 11),
    detectedFeatures: features, products, passed, failed, warned: products.length - passed - failed,
    processingTime: Math.round(performance.now() - start),
  };
}

function processASINList(jsonRows: Record<string,unknown>[]): FileAnalysis {
  const start = performance.now();
  const asins = new Set<string>();
  for (const row of jsonRows) {
    for (const v of Object.values(row)) {
      const s = String(v || '');
      const clean = s.trim().replace(/['"]/g,'').toUpperCase();
      if (/^B[0-9A-Z]{9}$/.test(clean)) asins.add(clean);
      for (const m of s.matchAll(/\/dp\/([A-Z0-9]{10})/gi)) asins.add(m[1].toUpperCase());
    }
  }
  const products: CleanProduct[] = [...asins].map(asin => runGates({
    title:'', asin, price:0, compareAt:0, image:'', images:[], description:'',
    vendor:'', category:'', tags:'', status:'Draft', quantity:999,
    profit:0, profitPct:0, sellPrice:0,
    marketPrice:0,
    competitorPrices:{ amazon:0, costco:0, ebay:0, sams:0 },
    lowMargin:false,
    stockStatus:'Unknown' as const, dateChecked:'',
    rating:0, reviews:0, bsr:0,
    shopifyStatus:'not_pushed' as const, shopifyError:'', selected:false,
    barcode:'', weight:'', googleCategory:'', seoTitle:'', seoDescription:'', handle:'', feedScore:0,
    gates:{title:'fail',image:'fail',price:'fail',asin:'fail',description:'fail',googleCategory:'fail',titleLength:'fail',descClean:'fail',barcode:'fail',identifier:'fail'}, gateCount:0,
  }));
  return {
    type:'asin-list', totalRows:jsonRows.length, totalCols:Object.keys(jsonRows[0]||{}).length,
    uniqueProducts:products.length, removedRows:jsonRows.length-products.length, removedCols:0,
    detectedFeatures:['ASIN extraction',`${asins.size} unique ASINs`,'Needs Keepa/Rainforest enrichment'],
    products, passed:0, failed:products.length, warned:0,
    processingTime: Math.round(performance.now() - start),
  };
}

// ═══════════════════════════════════════════════════════════
// SPREADSHEET VIEWER/EDITOR
// ═══════════════════════════════════════════════════════════
const COLS = ['title','asin','barcode','price','sellPrice','compareAt','profit','profitPct','marketPrice','amazonPrice','costcoPrice','ebayPrice','samsPrice','stockStatus','image','rating','reviews','bsr','vendor','category','googleCategory','description','dateChecked','status'] as const;
const COL_LABELS = ['Title','ASIN/SKU','GTIN','Cost','Sell $','Compare At','Profit $','Profit %','Market $','Amazon $','Costco $','eBay $','Sam\'s $','Stock','Image URL','Rating','Reviews','BSR','Vendor','Category','Google Cat','Description','Checked','Status'];
const COL_WIDTHS = [280,120,130,70,80,80,70,70,80,80,80,80,80,85,200,60,80,80,120,140,200,300,90,70];

function SpreadsheetView({ products, onUpdate, perPage = 50, onToggleSelect, onSelectAll, onProductClick }: { products: CleanProduct[]; onUpdate: (idx: number, field: string, val: string) => void; perPage?: number; onToggleSelect?: (idx: number) => void; onSelectAll?: (val: boolean) => void; onProductClick?: (p: CleanProduct) => void }) {
  const [page, setPage] = useState(0);
  const PAGE = perPage;
  const total = products.length;
  const pages = Math.ceil(total / PAGE);
  const slice = products.slice(page * PAGE, (page + 1) * PAGE);

  return (
    <div style={{ border:'1px solid #1a1a2e', borderRadius:'12px', overflow:'hidden', background:'#0d0d0d' }}>
      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', borderBottom:'1px solid #1a1a2e', background:'#111' }}>
        <span style={{ fontSize:'10px', color:'#666' }}>Showing {page*PAGE+1}–{Math.min((page+1)*PAGE, total)} of {total}</span>
        <div style={{ display:'flex', gap:'4px' }}>
          <button onClick={() => setPage(Math.max(0, page-1))} disabled={page===0}
            style={{ padding:'4px 10px', borderRadius:'4px', border:'1px solid #222', background:'#1a1a2e', color: page===0?'#333':'#888', fontSize:'10px', cursor:'pointer' }}>← Prev</button>
          <span style={{ padding:'4px 8px', fontSize:'10px', color:'#555' }}>Page {page+1}/{pages}</span>
          <button onClick={() => setPage(Math.min(pages-1, page+1))} disabled={page>=pages-1}
            style={{ padding:'4px 10px', borderRadius:'4px', border:'1px solid #222', background:'#1a1a2e', color: page>=pages-1?'#333':'#888', fontSize:'10px', cursor:'pointer' }}>Next →</button>
        </div>
      </div>
      {/* Grid */}
      <div style={{ overflowX:'auto' }}>
        <table style={{ borderCollapse:'collapse', width:'max-content', minWidth:'100%' }}>
          <thead>
            <tr>
              <th style={{ padding:'8px 4px', fontSize:'9px', color:'#444', textAlign:'center', borderBottom:'1px solid #1a1a2e', background:'#0f0f0f', position:'sticky', top:0, width:28 }}>
                <input type="checkbox" onChange={e => onSelectAll?.(e.target.checked)} style={{ cursor:'pointer' }} />
              </th>
              <th style={{ padding:'8px 6px', fontSize:'9px', color:'#444', textAlign:'center', borderBottom:'1px solid #1a1a2e', background:'#0f0f0f', position:'sticky', top:0, width:36 }}>#</th>
              <th style={{ padding:'8px 6px', fontSize:'9px', color:'#444', textAlign:'center', borderBottom:'1px solid #1a1a2e', background:'#0f0f0f', position:'sticky', top:0, width:50 }}>Gate</th>
              <th style={{ padding:'8px 6px', fontSize:'9px', color:'#444', textAlign:'center', borderBottom:'1px solid #1a1a2e', background:'#0f0f0f', position:'sticky', top:0, width:70 }}>Shopify</th>
              {COL_LABELS.map((label, ci) => (
                <th key={ci} style={{ padding:'8px 6px', fontSize:'9px', color:'#555', textAlign:'left', borderBottom:'1px solid #1a1a2e', background:'#0f0f0f', position:'sticky', top:0, width:COL_WIDTHS[ci], letterSpacing:'0.5px', textTransform:'uppercase' }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((p, ri) => {
              const globalIdx = page * PAGE + ri;
              return (
                <tr key={globalIdx} style={{ borderBottom:'1px solid #0a0a0a', background: p.selected ? '#1a1a2e22' : p.lowMargin ? '#f59e0b08' : 'transparent' }}>
                  <td style={{ padding:'4px 4px', textAlign:'center' }}>
                    <input type="checkbox" checked={p.selected || false} onChange={() => onToggleSelect?.(globalIdx)} style={{ cursor:'pointer' }} />
                  </td>
                  <td onClick={() => onProductClick?.(products[globalIdx])}
                    style={{ padding:'4px 6px', fontSize:'9px', color:'#06b6d4', textAlign:'center', cursor:'pointer', textDecoration:'underline' }}>{globalIdx+1}</td>
                  <td style={{ padding:'4px 6px', textAlign:'center' }}>
                    <span style={{ fontSize:'9px', fontWeight:700, padding:'1px 6px', borderRadius:'3px',
                      background: p.gateCount===10?'rgba(22,163,74,0.15)':p.gateCount>=3?'rgba(245,158,11,0.15)':'rgba(239,68,68,0.15)',
                      color: p.gateCount===10?'#16a34a':p.gateCount>=3?'#f59e0b':'#ef4444',
                    }}>{p.gateCount}/10</span>
                  </td>
                  <td style={{ padding:'4px 6px', textAlign:'center' }}>
                    <span style={{ fontSize:'8px', fontWeight:600, padding:'1px 6px', borderRadius:'3px',
                      background: p.shopifyStatus==='pushed'?'rgba(22,163,74,0.15)':p.shopifyStatus==='pushing'?'rgba(245,158,11,0.15)':p.shopifyStatus==='failed'?'rgba(239,68,68,0.15)':'transparent',
                      color: p.shopifyStatus==='pushed'?'#16a34a':p.shopifyStatus==='pushing'?'#f59e0b':p.shopifyStatus==='failed'?'#ef4444':'#333',
                    }} title={p.shopifyError}>{p.shopifyStatus==='pushed'?'✅ Synced':p.shopifyStatus==='pushing'?'⏳':p.shopifyStatus==='failed'?'❌ Failed':'—'}</span>
                  </td>
                  {COLS.map((col, ci) => {
                    const val = col === 'marketPrice' ? String(p.marketPrice || '')
                      : col === 'amazonPrice' ? String(p.competitorPrices?.amazon || '')
                      : col === 'costcoPrice' ? String(p.competitorPrices?.costco || '')
                      : col === 'ebayPrice' ? String(p.competitorPrices?.ebay || '')
                      : col === 'samsPrice' ? String(p.competitorPrices?.sams || '')
                      : String(p[col as keyof CleanProduct] ?? '');
                    const isGated = ['title','image','price','asin','description'].includes(col);
                    const gateKey = col === 'compareAt' ? null : col as keyof typeof p.gates;
                    const gateStatus = gateKey && p.gates[gateKey];
                    return (
                      <td key={ci} style={{ padding:0, borderLeft:'1px solid #111', position:'relative' }}>
                        <input
                          defaultValue={
                            ['price','sellPrice','profit','compareAt','marketPrice','amazonPrice','costcoPrice','ebayPrice','samsPrice'].includes(col) ? (Number(val) > 0 ? `$${Number(val).toFixed(2)}` : '') :
                            col === 'profitPct' ? (Number(val) > 0 ? `${Number(val).toFixed(0)}%` : '') :
                            col === 'bsr' ? (Number(val) > 0 ? Number(val).toLocaleString() : '') :
                            col === 'reviews' ? (Number(val) > 0 ? Number(val).toLocaleString() : '') :
                            col === 'rating' ? (Number(val) > 0 ? `★${val}` : '') :
                            col === 'stockStatus' ? (val === 'In Stock' ? '✅ In Stock' : val === 'Out of Stock' ? '❌ OOS' : '—') :
                            val
                          }
                          onBlur={e => onUpdate(globalIdx, col, e.target.value)}
                          style={{
                            width:'100%', padding:'6px 8px', background:'transparent', border:'none', outline:'none',
                            color: col === 'profit' || col === 'profitPct' ? (Number(val) > 0 ? (p.lowMargin ? '#f59e0b' : '#16a34a') : '#ef4444') :
                              col === 'stockStatus' ? (val === 'In Stock' ? '#16a34a' : val === 'Out of Stock' ? '#ef4444' : '#555') :
                              col === 'rating' ? (Number(val) >= 4 ? '#16a34a' : Number(val) >= 3 ? '#f59e0b' : '#ef4444') :
                              col === 'sellPrice' ? '#06b6d4' :
                              col === 'marketPrice' ? '#06b6d4' :
                              ['amazonPrice','costcoPrice','ebayPrice','samsPrice'].includes(col) ? '#f59e0b' :
                              col === 'bsr' ? '#8b5cf6' :
                              gateStatus === 'fail' ? '#ef4444' : gateStatus === 'warn' ? '#f59e0b' : '#ccc',
                            fontSize:'11px', fontFamily:'inherit',
                            borderLeft: isGated ? `2px solid ${gateStatus==='pass'?'#16a34a33':gateStatus==='warn'?'#f59e0b33':'#ef444433'}` : 'none',
                          }}
                          title={val}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPLIANCE GATE CARD — expandable dropdown with full Google requirements
// ═══════════════════════════════════════════════════════════
function ComplianceGateCard({ icon, gate, category, severity, desc, details, rules, disapproval, fix }: {
  icon: string; gate: string; category: string; severity: string; desc: string;
  details: string; rules: string[]; disapproval: string; fix: string;
}) {
  const [open, setOpen] = useState(false);
  const isGoogle = category === 'google';
  const borderColor = isGoogle ? '#3b82f622' : '#16a34a22';
  const accentColor = isGoogle ? '#3b82f6' : '#16a34a';
  const sevColor = severity.includes('Critical') ? '#ef4444' : severity.includes('Major') ? '#f59e0b' : '#06b6d4';

  return (
    <div style={{ background:'#0a0a0a', borderRadius:'8px', border: `1px solid ${open ? accentColor + '44' : '#1a1a2e'}`, overflow:'hidden', transition:'border-color 0.15s' }}>
      {/* Header — always visible */}
      <button onClick={() => setOpen(!open)} style={{ width:'100%', display:'flex', alignItems:'flex-start', gap:'8px', padding:'10px 12px', border:'none', background:'transparent', cursor:'pointer', textAlign:'left' }}>
        <span style={{ fontSize:'14px', flexShrink:0, marginTop:'1px' }}>{icon}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'2px' }}>
            <span style={{ fontSize:'11px', color: accentColor, fontWeight:700 }}>{gate}</span>
            <span style={{ fontSize:'7px', padding:'1px 5px', borderRadius:'3px', background: sevColor + '15', color: sevColor, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.3px' }}>{severity}</span>
          </div>
          <p style={{ fontSize:'9px', color:'#666', margin:0, lineHeight:'1.4' }}>{desc}</p>
        </div>
        <span style={{ fontSize:'10px', color:'#333', flexShrink:0, transform: open ? 'rotate(180deg)' : 'rotate(0)', transition:'transform 0.15s' }}>▼</span>
      </button>

      {/* Dropdown — full compliance details */}
      {open && (
        <div style={{ padding:'0 12px 12px', borderTop:'1px solid #1a1a2e' }}>
          {/* What Google checks */}
          <div style={{ marginTop:'10px', marginBottom:'10px' }}>
            <p style={{ fontSize:'8px', color: accentColor, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', margin:'0 0 4px' }}>What Google Checks</p>
            <p style={{ fontSize:'9px', color:'#888', margin:0, lineHeight:'1.5' }}>{details}</p>
          </div>

          {/* Rules */}
          <div style={{ marginBottom:'10px' }}>
            <p style={{ fontSize:'8px', color:'#06b6d4', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', margin:'0 0 6px' }}>Requirements</p>
            <div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
              {rules.map((rule, i) => (
                <div key={i} style={{ display:'flex', gap:'6px', alignItems:'flex-start' }}>
                  <span style={{ fontSize:'8px', color:'#333', marginTop:'2px', flexShrink:0 }}>•</span>
                  <span style={{ fontSize:'9px', color:'#999', lineHeight:'1.4' }}>{rule}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Disapproval Risk */}
          <div style={{ marginBottom:'10px', padding:'8px', background: sevColor + '08', borderRadius:'6px', border: `1px solid ${sevColor}15` }}>
            <p style={{ fontSize:'8px', color: sevColor, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', margin:'0 0 3px' }}>Disapproval Risk</p>
            <p style={{ fontSize:'9px', color:'#999', margin:0, lineHeight:'1.4' }}>{disapproval}</p>
          </div>

          {/* How to Fix */}
          <div style={{ padding:'8px', background:'#16a34a08', borderRadius:'6px', border:'1px solid #16a34a15' }}>
            <p style={{ fontSize:'8px', color:'#16a34a', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', margin:'0 0 3px' }}>How to Fix</p>
            <p style={{ fontSize:'9px', color:'#999', margin:0, lineHeight:'1.4' }}>{fix}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// XLSX EXPORT + DOWNLOAD
// ═══════════════════════════════════════════════════════════
async function exportAndDownload(products: CleanProduct[], filename: string) {
  const { utils, writeFile } = await import('xlsx');
  const gateIds = ['title','image','price','asin','description','googleCategory','titleLength','descClean','barcode','identifier'] as const;
  const data = products.map(p => {
    // Build failing gates summary
    const failingGates = gateIds.filter(g => p.gates[g] !== 'pass').map(g => {
      const labels: Record<string,string> = { title:'Title', image:'Image', price:'Price', asin:'ASIN', description:'Desc', googleCategory:'Google Cat', titleLength:'Title Len', descClean:'Desc Clean', barcode:'Barcode', identifier:'Identifier' };
      return `${labels[g]}:${p.gates[g]}`;
    });
    return {
      'Title': p.title, 'Handle': p.handle || '', 'ASIN/SKU': p.asin, 'Barcode/GTIN': p.barcode || '',
      'Cost': p.price || '', 'Sell Price': p.sellPrice || '', 'Compare At': p.compareAt || '',
      'Profit $': p.profit || '', 'Profit %': p.profitPct ? `${p.profitPct}%` : '',
      'Market $': p.marketPrice || '',
      'Amazon $': p.competitorPrices?.amazon || '', 'Costco $': p.competitorPrices?.costco || '',
      'eBay $': p.competitorPrices?.ebay || '', "Sam's $": p.competitorPrices?.sams || '',
      'Low Margin': p.lowMargin ? '⚠️ <30%' : '',
      'Stock': p.stockStatus,
      'Image URL': (p.images && p.images.length > 0) ? p.images.join(' | ') : (p.image || ''),
      'Image Count': (p.images || []).length,
      'Rating': p.rating || '', 'Reviews': p.reviews || '', 'BSR': p.bsr || '',
      'Vendor': p.vendor, 'Category': p.category,
      'Google Category': p.googleCategory || '', 'Weight': p.weight || '',
      'SEO Title': p.seoTitle || '', 'Feed Score': p.feedScore || 0,
      'Gates': `${p.gateCount}/10`,
      'Failing Gates': failingGates.join(', ') || 'ALL PASS',
      'Description': p.description, 'Date Checked': p.dateChecked, 'Status': p.status,
    };
  });
  const ws = utils.json_to_sheet(data);
  ws['!cols'] = [55,20,14,15,10,12,12,10,10,10,10,10,10,10,10,12,80,8,8,10,10,20,25,10,12,8,40,80,12,10].map(w => ({ wch: w }));
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Products');
  writeFile(wb, filename);
}

// ═══════════════════════════════════════════════════════════
// MAIN UI
// ═══════════════════════════════════════════════════════════
export default function CommandCenter() {
  // ═══ TAB STATE ═══
  const [activeTab, setActiveTab] = useState<'import'|'compliance'|'guide'>('import');
  // ═══ AUTO-FIX STATE ═══
  const [autoFixing, setAutoFixing] = useState(false);
  const [autoFixProgress, setAutoFixProgress] = useState({ done: 0, total: 0, fixed: { titles: 0, descriptions: 0, categories: 0, barcodes: 0 } });
  const [analysis, setAnalysis] = useState<FileAnalysis | null>(null);
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [filter, setFilter] = useState<'all'|'passed'|'failed'|'warned'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('spreadsheet');
  const [stockFilter, setStockFilter] = useState<'all'|'instock'|'oos'>('all');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [profitMin, setProfitMin] = useState('');
  const [ratingMin, setRatingMin] = useState('');
  const [bsrMax, setBsrMax] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'default'|'profit'|'price'|'rating'|'bsr'|'reviews'>('default');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [perPage, setPerPage] = useState(50);
  const [enriching, setEnriching] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [pricingProgress, setPricingProgress] = useState({ done: 0, total: 0, currentBatch: '', priced: 0, lowMarginCount: 0, avgProfit: 0, lastAsin: '', lastPrice: 0, lastProfit: 0, lastProfitPct: 0, lastMarket: 0, tokensLeft: 0 });
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0, tokensLeft: 0, currentBatch: '', error: '' });
  const [criteria, setCriteria] = useState({ minPrice: 3, maxPrice: 25, minRating: 3.5, minReviews: 500, maxBSR: 100000, markup: 70, maxRetail: 40 });
  const [showCriteria, setShowCriteria] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<CleanProduct | null>(null);
  const [modalImageIdx, setModalImageIdx] = useState(0);
  // Feed Bot state — AI agent for real-time fix suggestions
  const [botOpen, setBotOpen] = useState(false);
  const [botPrompt, setBotPrompt] = useState<string | null>(null);
  const [botContext, setBotContext] = useState<Record<string, unknown> | null>(null);
  const [pushProgress, setPushProgress] = useState({ done: 0, total: 0, pushed: 0, errors: 0, lastError: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  // Toggle select
  const toggleSelect = useCallback((idx: number) => {
    if (!analysis) return;
    const updated = [...analysis.products];
    updated[idx] = { ...updated[idx], selected: !updated[idx].selected };
    setAnalysis({ ...analysis, products: updated });
  }, [analysis]);

  const selectAll = useCallback((val: boolean) => {
    if (!analysis) return;
    const updated = analysis.products.map(p => ({ ...p, selected: val }));
    setAnalysis({ ...analysis, products: updated });
  }, [analysis]);

  const selectedCount = analysis?.products.filter(p => p.selected).length || 0;

  // ═══ AUTO-FIX ALL — resolves failing gates without manual intervention ═══
  const autoFixAll = useCallback(() => {
    if (!analysis) return;
    setAutoFixing(true);
    const updated = [...analysis.products];
    const fixed = { titles: 0, descriptions: 0, categories: 0, barcodes: 0 };
    const total = updated.length;

    for (let i = 0; i < updated.length; i++) {
      const p = { ...updated[i] };
      let changed = false;

      // FIX 1: Title over 150 chars → trim at word boundary
      if (p.title && p.title.length > 150) {
        const cut = p.title.substring(0, 147);
        const lastSpace = cut.lastIndexOf(' ');
        p.title = (lastSpace > 80 ? cut.substring(0, lastSpace) : cut).trim();
        fixed.titles++;
        changed = true;
      }

      // FIX 2: Title has banned promotional words → remove them
      const banned = ['free shipping', 'best seller', '#1', 'sale', 'discount', 'cheap', 'buy now', 'limited time', 'hot deal', 'clearance', 'lowest price'];
      const lowerTitle = p.title.toLowerCase();
      for (const word of banned) {
        if (lowerTitle.includes(word)) {
          p.title = p.title.replace(new RegExp(word, 'gi'), '').replace(/\s+/g, ' ').trim();
          if (!changed) fixed.titles++;
          changed = true;
        }
      }

      // FIX 3: Description has HTML → strip it
      if (p.description && (/<[a-z][^>]*>/i.test(p.description) || /content="width=device-width/i.test(p.description))) {
        let desc = p.description
          .replace(/<meta[^>]*>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        // Extract bullet points if present
        const bullets = [...desc.matchAll(/<li[^>]*>(.*?)<\/li>/gi)]
          .map(m => m[1].replace(/<[^>]+>/g, '').trim())
          .filter(b => b.length > 10 && b.length < 300);
        if (bullets.length >= 2) {
          desc = bullets.slice(0, 6).join(' | ');
        } else {
          desc = desc.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        }
        // Cut at Amazon boilerplate markers
        const boilerplate = ['about us', 'shipping', 'returns', 'payment', 'contact us', 'customer satisfaction', 'copyright', 'disclaimer', 'warranty information'];
        for (const marker of boilerplate) {
          const idx = desc.toLowerCase().indexOf(marker);
          if (idx > 100) { desc = desc.substring(0, idx).trim(); break; }
        }
        p.description = desc.substring(0, 500);
        fixed.descriptions++;
        changed = true;
      }

      // FIX 4: Missing Google Category → auto-map from tags/category/title
      if (!p.googleCategory || p.googleCategory.length < 5) {
        const combined = `${p.tags || ''} ${p.category || ''} ${p.title || ''}`.toLowerCase();
        // Use the constants map (imported at top) — inline subset for the auto-fixer
        const CATEGORY_MAP: Record<string, string> = {
          'lip gloss': 'Health & Beauty > Personal Care > Cosmetics > Makeup > Lip Makeup > Lip Glosses',
          'lipstick': 'Health & Beauty > Personal Care > Cosmetics > Makeup > Lip Makeup > Lipstick',
          'eye shadow': 'Health & Beauty > Personal Care > Cosmetics > Makeup > Eye Makeup > Eye Shadow',
          'mascara': 'Health & Beauty > Personal Care > Cosmetics > Makeup > Eye Makeup > Mascara',
          'foundation': 'Health & Beauty > Personal Care > Cosmetics > Makeup > Face Makeup > Foundation',
          'nail polish': 'Health & Beauty > Personal Care > Cosmetics > Nail Care > Nail Polish',
          'moisturizer': 'Health & Beauty > Personal Care > Cosmetics > Skin Care > Facial Moisturizers',
          'sunscreen': 'Health & Beauty > Personal Care > Cosmetics > Skin Care > Sunscreen',
          'serum': 'Health & Beauty > Personal Care > Cosmetics > Skin Care > Facial Serums',
          'cleanser': 'Health & Beauty > Personal Care > Cosmetics > Skin Care > Facial Cleansers',
          'skin care': 'Health & Beauty > Personal Care > Cosmetics > Skin Care',
          'makeup': 'Health & Beauty > Personal Care > Cosmetics > Makeup',
          'shampoo': 'Health & Beauty > Personal Care > Hair Care > Shampoo',
          'conditioner': 'Health & Beauty > Personal Care > Hair Care > Conditioner',
          'hair care': 'Health & Beauty > Personal Care > Hair Care',
          'beauty': 'Health & Beauty > Personal Care',
          'personal care': 'Health & Beauty > Personal Care',
          'health': 'Health & Beauty',
          'earbuds': 'Electronics > Audio > Headphones & Earbuds',
          'headphone': 'Electronics > Audio > Headphones & Earbuds',
          'speaker': 'Electronics > Audio > Speakers',
          'charger': 'Electronics > Electronics Accessories > Power Adapters & Chargers',
          'phone case': 'Electronics > Communications > Phones > Phone Cases',
          'phone': 'Electronics > Communications > Phones',
          'electronics': 'Electronics',
          'kitchen': 'Home & Garden > Kitchen & Dining',
          'vacuum': 'Home & Garden > Household Supplies > Cleaning > Vacuum Cleaners',
          'cleaning': 'Home & Garden > Household Supplies > Cleaning',
          'storage': 'Home & Garden > Household Supplies > Storage & Organization',
          'pillow': 'Home & Garden > Bedding > Pillows',
          'home': 'Home & Garden',
          'yoga': 'Sporting Goods > Exercise & Fitness > Yoga & Pilates',
          'resistance band': 'Sporting Goods > Exercise & Fitness > Resistance Bands',
          'fitness': 'Sporting Goods > Exercise & Fitness',
          'exercise': 'Sporting Goods > Exercise & Fitness',
          'dog': 'Animals & Pet Supplies > Pet Supplies > Dog Supplies',
          'cat': 'Animals & Pet Supplies > Pet Supplies > Cat Supplies',
          'pet': 'Animals & Pet Supplies',
          'baby': 'Baby & Toddler',
          'toys': 'Toys & Games',
          'clothing': 'Apparel & Accessories > Clothing',
          'shoes': 'Apparel & Accessories > Shoes',
          'jewelry': 'Apparel & Accessories > Jewelry',
          'watch': 'Apparel & Accessories > Jewelry > Watches',
          'bag': 'Apparel & Accessories > Handbags, Wallets & Cases',
          'office': 'Office Supplies',
          'automotive': 'Vehicles & Parts > Vehicle Parts & Accessories',
          'supplement': 'Health & Beauty > Health Care > Fitness & Nutrition > Vitamins & Supplements',
          'vitamin': 'Health & Beauty > Health Care > Fitness & Nutrition > Vitamins & Supplements',
          'protein': 'Health & Beauty > Health Care > Fitness & Nutrition > Vitamins & Supplements',
        };
        let bestMatch = '';
        let bestKeyLen = 0;
        for (const [key, val] of Object.entries(CATEGORY_MAP)) {
          if (combined.includes(key) && key.length > bestKeyLen) { bestMatch = val; bestKeyLen = key.length; }
        }
        if (bestMatch) {
          p.googleCategory = bestMatch;
          fixed.categories++;
          changed = true;
        }
      }

      if (changed) {
        // Re-run the FULL gate evaluation (not manual patches)
        updated[i] = runGates(p);
      }

      if (i % 100 === 0) setAutoFixProgress({ done: i, total, fixed: { ...fixed } });
    }

    const passed = updated.filter(x => x.gateCount === 10).length;
    const failed = updated.filter(x => x.gateCount < 5).length;
    setAnalysis({ ...analysis, products: updated, passed, failed, warned: updated.length - passed - failed });
    setAutoFixProgress({ done: total, total, fixed });
    setAutoFixing(false);
  }, [analysis]);

  // Open Feed Bot with targeted prompt for a specific product + gate
  const askAI = useCallback((product: CleanProduct, gateName?: string, gateStatus?: string) => {
    const context = {
      title: product.title, asin: product.asin, vendor: product.vendor,
      category: product.category, tags: product.tags, barcode: product.barcode,
      googleCategory: product.googleCategory, description: product.description?.substring(0, 300),
      price: product.price, sellPrice: product.sellPrice, feedScore: product.feedScore,
      gateCount: product.gateCount, gates: product.gates,
    };
    setBotContext(context);
    if (gateName && gateStatus !== 'pass') {
      const prompts: Record<string, string> = {
        title: `Fix the title for "${product.title.substring(0, 50)}...". Current title is ${product.title.length} chars. Rewrite it using the best Google Shopping formula. Show the optimized title with character count.`,
        image: `Product "${product.title.substring(0, 50)}..." has ${product.images?.length || 0} images. What are the Google image requirements and how can I get more images for this product?`,
        price: `Product "${product.title.substring(0, 50)}..." has price $${product.price}. Verify this will match the Shopify landing page price. What price-related disapprovals should I watch for?`,
        asin: `Product "${product.title.substring(0, 50)}..." has ASIN "${product.asin || 'MISSING'}". ${product.asin ? 'Verify this ASIN format.' : 'How do I find the ASIN for this product?'}`,
        description: `Rewrite the description for "${product.title.substring(0, 50)}..." to be Google Shopping compliant. Current description is ${product.description?.length || 0} chars. Make it clean, factual, keyword-rich, and 150-300 words.`,
        googleCategory: `Assign the most specific Google Product Category for: "${product.title}". Tags: ${product.tags?.substring(0, 100) || 'none'}. Brand: ${product.vendor}. Current category: ${product.category || 'none'}. Show the full taxonomy path.`,
        titleLength: `The title "${product.title}" is ${product.title.length} chars (max 150). Rewrite it under 150 chars using formula: Brand + Product Type + Key Feature + Size. Show the character count.`,
        descClean: `Clean the description for "${product.title.substring(0, 50)}...". Current description contains ${/<[a-z]/i.test(product.description || '') ? 'HTML tags' : 'possible boilerplate'}. Strip all HTML, remove Amazon junk, and rewrite as clean factual text.`,
        barcode: `Product "${product.title.substring(0, 50)}..." has barcode "${product.barcode || 'MISSING'}". ${product.barcode ? `Validate this GTIN. Is it a valid ${product.barcode.length}-digit code?` : 'This product has no barcode. Where can I find the GTIN? Products with GTINs get 20-40% more clicks.'}`,
        identifier: `Product "${product.title.substring(0, 50)}..." — Brand: "${product.vendor}", ASIN: "${product.asin || 'none'}", Barcode: "${product.barcode || 'none'}". Does this product have sufficient identifiers for Google Shopping? What's missing?`,
      };
      setBotPrompt(prompts[gateName] || `Analyze the "${gateName}" gate failure for product "${product.title.substring(0, 60)}". How do I fix it to pass Google Merchant Center validation?`);
    } else {
      setBotPrompt(`Run a full Google Merchant Center compliance check on this product: "${product.title.substring(0, 60)}". Score: ${product.feedScore}/100, Gates: ${product.gateCount}/10. Show every issue and how to fix each one.`);
    }
    setBotOpen(true);
  }, []);

  // Bulk delete selected
  const deleteSelected = useCallback(() => {
    if (!analysis) return;
    const remaining = analysis.products.filter(p => !p.selected);
    const passed = remaining.filter(x => x.gateCount === 10).length;
    const failed = remaining.filter(x => x.gateCount < 3).length;
    setAnalysis({ ...analysis, products: remaining, uniqueProducts: remaining.length, passed, failed, warned: remaining.length - passed - failed });
  }, [analysis]);

  // Push selected or all passed to Shopify — one at a time
  const pushToShopify = useCallback(async (selectedOnly = false) => {
    if (!analysis) return;
    const toPush = selectedOnly
      ? analysis.products.filter(p => p.selected && p.gateCount === 10 && p.image && p.title)
      : analysis.products.filter(p => p.gateCount === 10 && p.image && p.title && p.shopifyStatus !== 'pushed');
    if (!toPush.length) return;
    setPushing(true);
    setPushProgress({ done: 0, total: toPush.length, pushed: 0, errors: 0, lastError: '' });

    let pushedCount = 0, errorCount = 0, lastErr = '';
    const updated = [...analysis.products];

    for (let i = 0; i < toPush.length; i++) {
      const p = toPush[i];
      const globalIdx = updated.findIndex(u => u.asin === p.asin);

      // Mark as pushing
      if (globalIdx >= 0) updated[globalIdx] = { ...updated[globalIdx], shopifyStatus: 'pushing' };
      setAnalysis(prev => prev ? { ...prev, products: [...updated] } : prev);
      setPushProgress(prev => ({ ...prev, done: i, lastError: `Pushing: ${p.title.substring(0, 40)}...` }));

      try {
        const res = await fetch('/api/command-center', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product: {
              title: p.title, asin: p.asin, price: p.price, sellPrice: p.sellPrice, profit: p.profit,
              image: p.image, images: p.images || [], description: p.description, vendor: p.vendor, category: p.category,
              rating: p.rating, reviews: p.reviews, bsr: p.bsr, stockStatus: p.stockStatus,
              competitorPrices: p.competitorPrices,
              barcode: p.barcode, googleCategory: p.googleCategory, weight: p.weight, handle: p.handle,
              seoTitle: p.seoTitle, seoDescription: p.seoDescription, feedScore: p.feedScore,
            },
            action: 'push',
          }),
        });
        const data = await res.json();
        if (data.pushed) {
          pushedCount++;
          if (globalIdx >= 0) updated[globalIdx] = { ...updated[globalIdx], shopifyStatus: 'pushed', shopifyError: '' };
        } else {
          errorCount++; lastErr = data.error || 'Unknown error';
          if (globalIdx >= 0) updated[globalIdx] = { ...updated[globalIdx], shopifyStatus: 'failed', shopifyError: lastErr };
        }
      } catch (e) {
        errorCount++; lastErr = String(e);
        if (globalIdx >= 0) updated[globalIdx] = { ...updated[globalIdx], shopifyStatus: 'failed', shopifyError: lastErr };
      }

      setPushProgress({ done: i + 1, total: toPush.length, pushed: pushedCount, errors: errorCount, lastError: lastErr });
      await new Promise(r => setTimeout(r, 600));
    }

    setAnalysis(prev => prev ? { ...prev, products: [...updated] } : prev);
    setPushing(false);
  }, [analysis]);

  // ═══════════════════════════════════════════════════════════════
  // BULK PUSH — parallel waves, 5 products per API call, 4 concurrent calls = 20 products/wave
  // Shopify rate limit: 40 bucket / 2 per sec → 4 concurrent calls safe
  // ═══════════════════════════════════════════════════════════════
  const bulkPushToShopify = useCallback(async () => {
    if (!analysis) return;
    const toPush = analysis.products.filter(p => p.gateCount === 10 && p.image && p.title && p.shopifyStatus !== 'pushed');
    if (!toPush.length) return;

    setPushing(true);
    (window as unknown as Record<string, number>).__pushStart = Date.now();
    setPushProgress({ done: 0, total: toPush.length, pushed: 0, errors: 0, lastError: '' });

    const BATCH = 3; // products per API call
    const CONCURRENT = 4; // parallel API calls per wave = 12 products/wave
    const updated = [...analysis.products];
    let totalDone = 0, pushedCount = 0, errorCount = 0;

    // Build batches
    const batches: typeof toPush[] = [];
    for (let i = 0; i < toPush.length; i += BATCH) {
      batches.push(toPush.slice(i, i + BATCH));
    }

    // Process in waves
    for (let wave = 0; wave < batches.length; wave += CONCURRENT) {
      const waveBatches = batches.slice(wave, wave + CONCURRENT);
      const waveNum = Math.floor(wave / CONCURRENT) + 1;
      const totalWaves = Math.ceil(batches.length / CONCURRENT);

      setPushProgress(prev => ({ ...prev, done: totalDone, lastError: `Wave ${waveNum}/${totalWaves} — pushing ${waveBatches.length * BATCH} products...` }));

      // Mark all in this wave as pushing
      for (const batch of waveBatches) {
        for (const p of batch) {
          const idx = updated.findIndex(u => u.asin === p.asin);
          if (idx >= 0) updated[idx] = { ...updated[idx], shopifyStatus: 'pushing' };
        }
      }
      setAnalysis(prev => prev ? { ...prev, products: [...updated] } : prev);

      // Fire all batches in wave concurrently
      const waveResults = await Promise.allSettled(
        waveBatches.map(batch =>
          fetch('/api/bulk-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              products: batch.map(p => ({
                title: p.title, asin: p.asin, price: p.price, sellPrice: p.sellPrice,
                image: p.image, images: p.images || [], description: p.description, vendor: p.vendor, category: p.category,
                rating: p.rating, reviews: p.reviews, bsr: p.bsr, competitorPrices: p.competitorPrices,
                barcode: p.barcode, googleCategory: p.googleCategory, weight: p.weight, handle: p.handle,
                seoTitle: p.seoTitle, seoDescription: p.seoDescription, feedScore: p.feedScore,
              })),
            }),
          }).then(r => r.json())
        )
      );

      // Process results
      for (const result of waveResults) {
        if (result.status === 'rejected') {
          errorCount += BATCH;
          continue;
        }
        const data = result.value;
        if (data.error) {
          errorCount += BATCH;
          continue;
        }
        const results = data.results || [];
        for (const r of results) {
          const idx = updated.findIndex(u => u.asin === r.asin);
          if (r.success) {
            pushedCount++;
            if (idx >= 0) updated[idx] = { ...updated[idx], shopifyStatus: 'pushed', shopifyError: '' };
          } else {
            errorCount++;
            if (idx >= 0) updated[idx] = { ...updated[idx], shopifyStatus: 'failed', shopifyError: r.error || 'Unknown' };
          }
        }
      }

      totalDone += waveBatches.reduce((sum, b) => sum + b.length, 0);
      setAnalysis(prev => prev ? { ...prev, products: [...updated] } : prev);
      setPushProgress({ done: totalDone, total: toPush.length, pushed: pushedCount, errors: errorCount, lastError: `Wave ${waveNum} done: ${pushedCount} pushed, ${errorCount} errors` });

      // Delay between waves to respect Shopify rate limits
      if (wave + CONCURRENT < batches.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    setAnalysis(prev => prev ? { ...prev, products: [...updated] } : prev);
    setPushing(false);
  }, [analysis]);

  // Enrich ASINs via Keepa API in batches of 100
  const enrichProducts = useCallback(async (testOnly = false) => {
    if (!analysis) return;
    const unenriched = analysis.products.filter(p => p.asin && /^B[0-9A-Z]{9}$/.test(p.asin));
    if (!unenriched.length) return;
    setEnriching(true);
    setEnrichProgress({ done: 0, total: testOnly ? Math.min(50, unenriched.length) : unenriched.length, tokensLeft: 0, currentBatch: 'Starting...', error: '' });

    const allAsins = unenriched.map(p => p.asin);
    const maxAsins = testOnly ? allAsins.slice(0, 10) : allAsins;
    const BATCH = 5; // ASINs per API call (Vercel 10s timeout safe)
    const CONCURRENT = 20; // 20 parallel API calls × 5 = 100 ASINs/wave ≈ 2000/min
    const updated = [...analysis.products];
    let totalDone = 0;

    // Build all batches upfront
    const batches: string[][] = [];
    for (let i = 0; i < maxAsins.length; i += BATCH) {
      batches.push(maxAsins.slice(i, i + BATCH));
    }

    // Process CONCURRENT batches at a time
    for (let wave = 0; wave < batches.length; wave += CONCURRENT) {
      const waveBatches = batches.slice(wave, wave + CONCURRENT);
      const waveNum = Math.floor(wave / CONCURRENT) + 1;
      const totalWaves = Math.ceil(batches.length / CONCURRENT);
      setEnrichProgress(prev => ({ ...prev, done: totalDone, currentBatch: `Wave ${waveNum}/${totalWaves} — ${waveBatches.length}×${BATCH} parallel (${totalDone}/${maxAsins.length})`, error: '' }));

      // Fire all batches in this wave concurrently
      const waveResults = await Promise.allSettled(
        waveBatches.map(batch =>
          fetch('/api/enrich', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ asins: batch, criteria }),
          }).then(r => r.json())
        )
      );

      let waveEnriched = 0, wavePassed = 0, waveErrors = 0;
      for (const result of waveResults) {
        if (result.status === 'rejected') {
          waveErrors++;
          console.error('Wave batch failed:', result.reason);
          if (testOnly) { setEnriching(false); return; }
          continue;
        }
        const data = result.value;
        if (data.error) {
          waveErrors++;
          console.error('Enrich error:', data.error);
          if (testOnly) { setEnrichProgress(prev => ({ ...prev, error: `API Error: ${data.error}` })); setEnriching(false); return; }
          continue;
        }

        const enriched = data.enriched || {};
        waveEnriched += Object.keys(enriched).length;
        wavePassed += data.summary?.passed || 0;

        // Merge enriched data into products
        for (let j = 0; j < updated.length; j++) {
          const p = updated[j];
          const e = enriched[p.asin];
          if (!e) continue;
          const merged: CleanProduct = {
            ...p,
            title: e.title || p.title,
            price: e.price || p.price,
            image: e.image || p.image,
            images: (e.images && e.images.length > 0) ? e.images : (p.images || []),
            description: e.description || p.description,
            vendor: e.vendor || p.vendor,
            category: e.category || p.category,
            status: e.isAvailable ? (e.passed ? 'Active' : 'Rejected') : 'Out of Stock',
            quantity: e.isAvailable ? 999 : 0,
            compareAt: e.sellPrice || p.compareAt,
            sellPrice: e.sellPrice || 0,
            profit: e.profit || 0,
            profitPct: e.profitPct || 0,
            stockStatus: e.isAvailable ? 'In Stock' : 'Out of Stock',
            dateChecked: new Date().toISOString().split('T')[0],
            rating: e.rating || 0,
            reviews: e.reviews || 0,
            bsr: e.bsr || 0,
            tags: [e.isPrime ? 'Prime' : '', e.bsr > 0 ? `BSR:${e.bsr.toLocaleString()}` : '', e.rating > 0 ? `★${e.rating}` : '', e.reviews > 0 ? `${e.reviews.toLocaleString()} reviews` : ''].filter(Boolean).join(', '),
            gates: p.gates, gateCount: p.gateCount,
          };
          updated[j] = runGates(merged);
        }
      }

      totalDone += waveBatches.reduce((sum, b) => sum + b.length, 0);
      setEnrichProgress(prev => ({ ...prev, done: totalDone, currentBatch: `Wave ${waveNum} done: ${waveEnriched} enriched, ${wavePassed} passed${waveErrors ? `, ${waveErrors} errors` : ''}` }));

      // Brief delay between waves to avoid rate limits
      if (wave + CONCURRENT < batches.length) {
        await new Promise(r => setTimeout(r, 50));
      }
    }

    const passed = updated.filter(x => x.gateCount === 10).length;
    const failed = updated.filter(x => x.gateCount < 3).length;
    setAnalysis({ ...analysis, products: updated, passed, failed, warned: updated.length - passed - failed });
    setEnrichProgress(prev => ({ ...prev, done: maxAsins.length, currentBatch: `Done! ${passed} passed all 10 gates.` }));
    setEnriching(false);
  }, [analysis, criteria]);

  // ═══════════════════════════════════════════════════════════════════════
  // MARKET PRICE RESEARCH — Searches Amazon for real market average prices
  // ═══════════════════════════════════════════════════════════════════════
  const researchPrices = useCallback(async () => {
    if (!analysis) return;
    const eligible = analysis.products.filter(p => p.price > 0 && p.title && p.asin);
    if (!eligible.length) return;

    setPricing(true);
    setPricingProgress({ done: 0, total: eligible.length, currentBatch: 'Starting market price research...', priced: 0, lowMarginCount: 0, avgProfit: 0, lastAsin: '', lastPrice: 0, lastProfit: 0, lastProfitPct: 0, lastMarket: 0, tokensLeft: 0 });

    const BATCH = 50;
    const updated = [...analysis.products];
    let totalPriced = 0;
    let totalLowMargin = 0;
    let profitSum = 0;
    let lastTokens = 0;

    for (let i = 0; i < eligible.length; i += BATCH) {
      const batch = eligible.slice(i, i + BATCH);
      const batchNum = Math.floor(i / BATCH) + 1;
      const totalBatches = Math.ceil(eligible.length / BATCH);
      setPricingProgress(prev => ({ ...prev, currentBatch: `Batch ${batchNum}/${totalBatches} — fetching Keepa data for ${batch.length} ASINs...` }));

      try {
        const res = await fetch('/api/market-price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            products: batch.map(p => ({ asin: p.asin, title: p.title, price: p.price })),
          }),
        });
        const data = await res.json();
        if (data.tokensLeft) lastTokens = data.tokensLeft;

        if (data.results) {
          // Process each result and update live
          for (let j = 0; j < updated.length; j++) {
            const p = updated[j];
            const r = data.results[p.asin];
            if (!r) continue;

            const newCost = r.amazonCost || p.price; // Keepa's real price, Rainforest fallback
            const newSell = r.adjustedSellPrice || p.sellPrice;
            const newProfit = +(newSell - newCost).toFixed(2);
            const newProfitPct = newCost > 0 ? +((newSell - newCost) / newCost * 100).toFixed(1) : 0;
            const newMarket = r.averageMarketPrice || 0;
            const isLowMargin = newProfitPct < 30;

            totalPriced++;
            profitSum += newProfit;
            if (isLowMargin) totalLowMargin++;

            const merged: CleanProduct = {
              ...p,
              price: newCost, // Update Amazon cost with Keepa's accurate price
              sellPrice: newSell,
              profit: newProfit,
              profitPct: newProfitPct,
              marketPrice: newMarket,
              lowMargin: isLowMargin,
              competitorPrices: r.competitorPrices || { amazon: 0, costco: 0, ebay: 0, sams: 0 },
              compareAt: Math.max(r.competitorPrices?.amazon || 0, r.competitorPrices?.costco || 0, r.competitorPrices?.ebay || 0, r.competitorPrices?.sams || 0),
            };
            updated[j] = runGates(merged);

            // Live update progress with last product details
            setPricingProgress(prev => ({
              ...prev,
              done: Math.min(i + totalPriced - (i > 0 ? eligible.slice(0, i).length : 0), eligible.length),
              priced: totalPriced,
              lowMarginCount: totalLowMargin,
              avgProfit: totalPriced > 0 ? +(profitSum / totalPriced).toFixed(2) : 0,
              lastAsin: p.asin,
              lastPrice: newSell,
              lastProfit: newProfit,
              lastProfitPct: newProfitPct,
              lastMarket: newMarket,
              tokensLeft: lastTokens,
            }));
          }

          // Live update products in UI after each batch
          const passed = updated.filter(x => x.gateCount === 10).length;
          const failed = updated.filter(x => x.gateCount < 3).length;
          setAnalysis(prev => prev ? { ...prev, products: [...updated], passed, failed, warned: updated.length - passed - failed } : null);
        }
      } catch (err) {
        setPricingProgress(prev => ({ ...prev, currentBatch: `Error on batch ${batchNum}: ${String(err).substring(0, 80)}` }));
      }

      setPricingProgress(prev => ({ ...prev, done: Math.min(i + BATCH, eligible.length) }));
      if (i + BATCH < eligible.length) await new Promise(r => setTimeout(r, 500));
    }

    // Final pass: flag all low margin products
    for (let j = 0; j < updated.length; j++) {
      if (updated[j].profitPct > 0 && updated[j].profitPct < 30) {
        updated[j] = { ...updated[j], lowMargin: true };
      }
    }

    const passed = updated.filter(x => x.gateCount === 10).length;
    const failed = updated.filter(x => x.gateCount < 3).length;
    setAnalysis(prev => prev ? { ...prev, products: updated, passed, failed, warned: updated.length - passed - failed } : null);
    setPricingProgress(prev => ({ ...prev, done: eligible.length, priced: totalPriced, lowMarginCount: totalLowMargin, currentBatch: `Done! ${totalPriced} priced · ${totalLowMargin} low margin (<30%)` }));
    setPricing(false);
  }, [analysis]);

  const handleFile = useCallback(async (file: File) => {
    setProcessing(true); setFileName(file.name); setAnalysis(null);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellStyles: false, cellNF: false, cellDates: false, cellHTML: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string,unknown>>(ws, { defval: '' });
      wb.Sheets = {}; wb.SheetNames = [];

      if (!jsonRows.length) { setProcessing(false); return; }
      const headers = Object.keys(jsonRows[0]);

      if (detectASINList(jsonRows.slice(0, 30))) {
        setAnalysis(processASINList(jsonRows));
      } else {
        const fileType = detectFileType(headers);
        setAnalysis(processRows(jsonRows, headers, fileType));
      }
    } catch (e) { console.error('Processing error:', e); }
    setProcessing(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  // Edit handler
  const handleUpdate = useCallback((idx: number, field: string, val: string) => {
    if (!analysis) return;
    const updated = [...analysis.products];
    const p = { ...updated[idx] };
    if (field === 'price' || field === 'compareAt' || field === 'quantity') {
      (p as Record<string,unknown>)[field] = parseFloat(val) || 0;
    } else {
      (p as Record<string,unknown>)[field] = val;
    }
    updated[idx] = runGates(p);
    const passed = updated.filter(x => x.gateCount === 10).length;
    const failed = updated.filter(x => x.gateCount < 3).length;
    setAnalysis({ ...analysis, products: updated, passed, failed, warned: updated.length - passed - failed });
  }, [analysis]);

  const filtered = (analysis?.products || []).filter(p => {
    // Gate filter
    if (filter === 'passed' && p.gateCount !== 5) return false;
    if (filter === 'failed' && p.gateCount >= 3) return false;
    if (filter === 'warned' && (p.gateCount < 3 || p.gateCount >= 5)) return false;
    // Stock filter
    if (stockFilter === 'instock' && p.stockStatus !== 'In Stock') return false;
    if (stockFilter === 'oos' && p.stockStatus !== 'Out of Stock') return false;
    // Price range
    if (priceMin && p.price < parseFloat(priceMin)) return false;
    if (priceMax && p.price > parseFloat(priceMax)) return false;
    // Profit min
    if (profitMin && p.profitPct < parseFloat(profitMin)) return false;
    // Rating min
    if (ratingMin && p.rating > 0 && p.rating < parseFloat(ratingMin)) return false;
    // BSR max
    if (bsrMax && p.bsr > 0 && p.bsr > parseFloat(bsrMax)) return false;
    // Search
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      if (!p.title.toLowerCase().includes(s) && !p.asin.toLowerCase().includes(s) && !p.vendor.toLowerCase().includes(s) && !p.category.toLowerCase().includes(s)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === 'default') return 0;
    const aVal = sortBy === 'profit' ? a.profitPct : sortBy === 'price' ? a.price : sortBy === 'rating' ? a.rating : sortBy === 'bsr' ? a.bsr : a.reviews;
    const bVal = sortBy === 'profit' ? b.profitPct : sortBy === 'price' ? b.price : sortBy === 'rating' ? b.rating : sortBy === 'bsr' ? b.bsr : b.reviews;
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
  });

  const gateIcon = (s: GateStatus) => s === 'pass' ? '✅' : s === 'warn' ? '⚠️' : '❌';
  const typeLabel: Record<FileType, string> = {
    'shopify-matrixify': '🟢 Shopify Matrixify Export', 'shopify-csv': '🟢 Shopify CSV Export',
    'autods': '🟡 AutoDS Export', 'asin-list': '🔵 ASIN List (needs enrichment)',
    'ebay-file-exchange': '🟠 eBay File Exchange', 'generic-csv': '⚪ Generic CSV', 'unknown': '🔴 Unknown Format',
  };

  return (
    <div style={{ minHeight:'100vh', background:'#0a0a0a', color:'#e5e5e5', fontFamily:"'JetBrains Mono','SF Mono','Fira Code',monospace" }}>
      {/* Mission Status — Real-time system dashboard */}
      <MissionStatus pageName="Command Center" />
      {/* Header */}
      <div style={{ borderBottom:'1px solid #1a1a2e', padding:'16px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:'16px', fontWeight:700, color:'#fff', margin:0 }}>⚡ Product Command Center</h1>
          <p style={{ fontSize:'10px', color:'#555', margin:'2px 0 0' }}>Drop any file. Auto-detect. Auto-clean. 10-gate Google Merchant validation. AI-powered fixes.</p>
        </div>
        {/* AI Bot toggle — always visible */}
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <button onClick={() => { setBotOpen(!botOpen); if (!botOpen) { setBotPrompt(null); setBotContext(null); } }}
            style={{ padding:'6px 14px', borderRadius:'6px', border: botOpen ? 'none' : '1px solid #3b82f644', background: botOpen ? '#3b82f6' : 'transparent', color: botOpen ? '#fff' : '#3b82f6', fontSize:'10px', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:'4px', transition:'all 0.15s' }}>
            🤖 {botOpen ? 'Close AI Bot' : 'AI Feed Bot'}
          </button>
        </div>
      </div>
      {/* Tab Navigation */}
      <div style={{ borderBottom:'1px solid #1a1a2e', padding:'0 24px', display:'flex', gap:'0' }}>
        {([
          { key: 'import' as const, icon: '📦', label: 'Import & Process', desc: 'Upload, enrich, price, push' },
          { key: 'compliance' as const, icon: '🛡️', label: 'Feed Compliance', desc: 'Auto-fix Google gates' },
          { key: 'guide' as const, icon: '📖', label: 'Guide', desc: 'Features & gates explained' },
        ]).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              padding:'10px 20px', border:'none', borderBottom: activeTab === tab.key ? '2px solid #3b82f6' : '2px solid transparent',
              background:'transparent', color: activeTab === tab.key ? '#fff' : '#555', cursor:'pointer',
              display:'flex', alignItems:'center', gap:'6px', transition:'all 0.15s',
            }}>
            <span style={{ fontSize:'14px' }}>{tab.icon}</span>
            <div style={{ textAlign:'left' }}>
              <div style={{ fontSize:'10px', fontWeight:700 }}>{tab.label}</div>
              <div style={{ fontSize:'8px', color: activeTab === tab.key ? '#888' : '#333' }}>{tab.desc}</div>
            </div>
          </button>
        ))}
        {/* Auto-fix button — visible when products loaded and on compliance tab */}
        {analysis && activeTab === 'compliance' && (
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'8px', padding:'8px 0' }}>
            <button onClick={autoFixAll} disabled={autoFixing}
              style={{ padding:'8px 16px', borderRadius:'6px', border:'none', background: autoFixing ? '#333' : '#16a34a', color:'#fff', fontSize:'10px', fontWeight:700, cursor: autoFixing ? 'wait' : 'pointer' }}>
              {autoFixing ? `⏳ Fixing ${autoFixProgress.done}/${autoFixProgress.total}...` : `🔧 Auto-Fix All ${analysis.products.filter(p => p.gateCount < 10).length} Failing Products`}
            </button>
          </div>
        )}
      </div>
      {/* Import tab toolbar */}
      {activeTab === 'import' && (
      <div style={{ borderBottom:'1px solid #1a1a2e', padding:'0 24px', display:'flex', alignItems:'center', justifyContent:'flex-end' }}>
        {analysis && (
          <div style={{ display:'flex', gap:'6px', alignItems:'center', padding:'8px 0' }}>
            {/* View toggle */}
            <div style={{ display:'flex', border:'1px solid #222', borderRadius:'6px', overflow:'hidden', marginRight:'8px' }}>
              {(['spreadsheet','cards','table'] as const).map(m => (
                <button key={m} onClick={() => setViewMode(m)} style={{
                  padding:'5px 12px', fontSize:'9px', fontWeight:600, border:'none', cursor:'pointer', textTransform:'uppercase', letterSpacing:'0.5px',
                  background: viewMode===m ? '#1a1a2e' : 'transparent', color: viewMode===m ? '#fff' : '#444',
                }}>{m === 'spreadsheet' ? '📊 Sheet' : m === 'cards' ? '🃏 Cards' : '📋 Table'}</button>
              ))}
            </div>
            {/* Enrich buttons — always available */}
            <>
              <button onClick={() => setShowCriteria(!showCriteria)}
                style={{ padding:'6px 14px', borderRadius:'6px', border:'1px solid #06b6d4', background:'transparent', color:'#06b6d4', fontSize:'10px', fontWeight:600, cursor:'pointer' }}>
                ⚙️ Criteria
              </button>
              <button onClick={() => enrichProducts(true)} disabled={enriching}
                style={{ padding:'6px 14px', borderRadius:'6px', border:'1px solid #7c3aed', background:'transparent', color:'#7c3aed', fontSize:'10px', fontWeight:600, cursor: enriching ? 'wait' : 'pointer' }}>
                🧪 Test First 50
              </button>
              <button onClick={() => enrichProducts(false)} disabled={enriching}
                style={{ padding:'6px 14px', borderRadius:'6px', border:'none', background: enriching ? '#333' : '#7c3aed', color:'#fff', fontSize:'10px', fontWeight:600, cursor: enriching ? 'wait' : 'pointer' }}>
                {enriching ? `⏳ ${enrichProgress.done}/${enrichProgress.total}` : `🔍 Enrich All (${analysis.products.filter(p=>p.asin&&/^B[0-9A-Z]{9}$/.test(p.asin)).length})`}
              </button>
            </>
            <button onClick={researchPrices} disabled={pricing || !analysis?.products.some(p => p.price > 0 && p.title)}
              style={{ padding:'6px 14px', borderRadius:'6px', border:'none', background: pricing ? '#333' : '#f59e0b', color: pricing ? '#888' : '#000', fontSize:'10px', fontWeight:600, cursor: pricing ? 'wait' : 'pointer' }}>
              {pricing ? `⏳ ${pricingProgress.done}/${pricingProgress.total}` : `💰 Price Research (${analysis.products.filter(p => p.price > 0 && p.title).length})`}
            </button>
            <button onClick={() => exportAndDownload(analysis.products.filter(p => p.gateCount === 10), `clean_passed_${Date.now()}.xlsx`)}
              disabled={analysis.passed === 0}
              style={{ padding:'6px 14px', borderRadius:'6px', border:'none', background: analysis.passed > 0 ? '#16a34a' : '#333', color: analysis.passed > 0 ? '#fff' : '#555', fontSize:'10px', fontWeight:600, cursor: analysis.passed > 0 ? 'pointer' : 'not-allowed' }}>
              📥 Passed ({analysis.passed})
            </button>
            <button onClick={() => exportAndDownload(analysis.products.filter(p => p.gateCount >= 3 && p.gateCount < 10), `export_warned_${Date.now()}.xlsx`)}
              disabled={analysis.warned === 0}
              style={{ padding:'6px 14px', borderRadius:'6px', border:'none', background: analysis.warned > 0 ? '#f59e0b' : '#333', color: analysis.warned > 0 ? '#000' : '#555', fontSize:'10px', fontWeight:600, cursor: analysis.warned > 0 ? 'pointer' : 'not-allowed' }}>
              📥 Warned ({analysis.warned})
            </button>
            <button onClick={() => exportAndDownload(analysis.products.filter(p => p.gateCount < 3), `export_failed_${Date.now()}.xlsx`)}
              disabled={analysis.failed === 0}
              style={{ padding:'6px 14px', borderRadius:'6px', border:'none', background: analysis.failed > 0 ? '#ef4444' : '#333', color: analysis.failed > 0 ? '#fff' : '#555', fontSize:'10px', fontWeight:600, cursor: analysis.failed > 0 ? 'pointer' : 'not-allowed' }}>
              📥 Failed ({analysis.failed})
            </button>
            <button onClick={() => exportAndDownload(analysis.products, `export_all_${analysis.uniqueProducts}_products_${Date.now()}.xlsx`)}
              style={{ padding:'6px 14px', borderRadius:'6px', border:'none', background:'#06b6d4', color:'#fff', fontSize:'10px', fontWeight:600, cursor:'pointer' }}>
              📥 All ({analysis.uniqueProducts})
            </button>
            {analysis.passed > 0 && !pushing && (
              <button onClick={bulkPushToShopify}
                style={{ padding:'6px 14px', borderRadius:'6px', border:'none', background:'#f59e0b', color:'#000', fontSize:'10px', fontWeight:700, cursor:'pointer' }}>
                🚀 Push All Passed ({analysis.products.filter(p => p.gateCount === 10 && p.image && p.title && p.shopifyStatus !== 'pushed').length})
              </button>
            )}
            {pushing && (
              <span style={{ padding:'6px 14px', borderRadius:'6px', background:'#333', color:'#f59e0b', fontSize:'10px', fontWeight:700 }}>
                ⏳ {pushProgress.done}/{pushProgress.total}
              </span>
            )}
            {/* Bulk actions */}
            {selectedCount > 0 && (
              <button onClick={deleteSelected}
                style={{ padding:'6px 14px', borderRadius:'6px', border:'1px solid #ef4444', background:'transparent', color:'#ef4444', fontSize:'10px', fontWeight:600, cursor:'pointer' }}>
                🗑️ Delete ({selectedCount})
              </button>
            )}
            <button onClick={() => { setAnalysis(null); setFileName(''); setFilter('all'); }}
              style={{ padding:'6px 14px', borderRadius:'6px', border:'1px solid #222', background:'transparent', color:'#555', fontSize:'10px', cursor:'pointer' }}>
              🗑️ Clear
            </button>
          </div>
        )}
      </div>
      )}

      <div style={{ padding:'20px 24px' }}>
        {/* ═══ GUIDE TAB ═══ */}
        {activeTab === 'guide' && (
          <div style={{ maxWidth: 900 }}>
            <h2 style={{ fontSize:'14px', color:'#fff', fontWeight:700, margin:'0 0 16px' }}>📖 Command Center Guide</h2>

            {/* Feature Guide */}
            {[
              { title: '📦 Import & Process', items: [
                { name: 'File Upload (Drag & Drop)', desc: 'Accepts XLSX/CSV from Shopify Matrixify, Shopify CSV, AutoDS, eBay File Exchange, ASIN lists, or any generic spreadsheet. Auto-detects the format from column headers — no configuration needed.' },
                { name: '80+ Column Mapping', desc: 'Automatically maps columns like "Variant Barcode" → barcode, "Body (HTML)" → description, "Variant Price" → price. Handles 80+ column name variations across different export formats.' },
                { name: 'Top Row Dedup (Matrixify)', desc: 'Matrixify exports have ~70K rows for 7K products because each variant is a row. The processor filters to only "Top Row = TRUE" to get unique products.' },
                { name: 'ASIN Auto-Detection', desc: 'If header-based detection fails, scans cell values for ASIN patterns (B0XXXXXXXXX or amazon.com/dp/ URLs) to find the ASIN column automatically.' },
                { name: 'Enrichment (Keepa/Rainforest)', desc: 'For ASIN lists or sparse products: calls Keepa API (batch of 100) and Rainforest API to pull title, price, images, brand, category, BSR, rating, stock status. Criteria filters applied BEFORE enrichment to save API tokens.' },
                { name: 'Price Research', desc: 'Pulls real market prices from Keepa. Applies your 1.70x markup formula. Calculates competitor display prices (Amazon ×1.85, Costco ×1.82, eBay ×1.90, Sam\'s ×1.80). Flags products below 30% profit margin.' },
                { name: 'Bulk Push to Shopify', desc: 'Pushes passed products to your Shopify store via /api/command-center and /api/bulk-push. Batched with concurrency control. Includes all Google Merchant fields (barcode, Google category, weight, handle, SEO title).' },
                { name: 'XLSX Export', desc: 'Downloads a spreadsheet with all product data including Google Category, Barcode/GTIN, Feed Score, Handle, Weight, SEO Title, and gate results.' },
              ]},
              { title: '🛡️ Feed Compliance (10-Gate System)', items: [
                { name: 'Auto-Fix All', desc: 'One button fixes every failing product: trims titles to 150 chars, strips HTML from descriptions, auto-maps Google categories from tags, validates GTIN format. Re-runs all gates after fixing.' },
              ]},
              { title: '🤖 AI Feed Bot', items: [
                { name: 'Fix with AI (per gate)', desc: 'Each failing gate shows a "🤖 Fix with AI" button. Opens the Feed Bot with the product context and a targeted prompt for that specific issue. Bot rewrites titles, assigns categories, cleans descriptions, validates GTINs.' },
                { name: 'Full AI Audit', desc: 'Runs a complete Google Merchant Center compliance check on a product. Shows every issue and the fix for each one.' },
                { name: 'Quick Actions', desc: 'Pre-built prompts: Feed Health Report (overall status + top issues), Optimize Titles (worst 10 with before/after), Assign Categories (bulk mapping), Find Disapprovals (what Google will reject), Check GTINs (validation report).' },
                { name: 'Tool Approval', desc: 'Destructive actions (bulk title changes, category assignments, product fixes) show an amber approval card. You must click "Approve & Execute" before changes are saved.' },
              ]},
            ].map(section => (
              <div key={section.title} style={{ background:'#111', borderRadius:'10px', padding:'16px', border:'1px solid #1a1a2e', marginBottom:'12px' }}>
                <p style={{ fontSize:'11px', color:'#fff', fontWeight:700, margin:'0 0 12px' }}>{section.title}</p>
                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  {section.items.map(item => (
                    <div key={item.name} style={{ background:'#0a0a0a', borderRadius:'8px', padding:'10px 12px', border:'1px solid #1a1a2e' }}>
                      <p style={{ fontSize:'10px', color:'#06b6d4', fontWeight:700, margin:'0 0 3px' }}>{item.name}</p>
                      <p style={{ fontSize:'9px', color:'#888', margin:0, lineHeight:'1.4' }}>{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* 10-Gate Reference */}
            <div style={{ background:'#111', borderRadius:'10px', padding:'16px', border:'1px solid #1a1a2e', marginBottom:'12px' }}>
              <p style={{ fontSize:'11px', color:'#fff', fontWeight:700, margin:'0 0 12px' }}>🔒 10-Gate Reference (what each gate checks)</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
                {[
                  { gate: 'Title', icon: '✅', severity: 'Critical', rule: 'Exists, >5 chars, no HTML, not placeholder', fix: 'Auto: none. AI: rewrites from scratch.' },
                  { gate: 'Image', icon: '✅', severity: 'Critical', rule: '1+ image URL (3+ for full pass). HTTPS, min 800×800px', fix: 'Cannot auto-fix. Source images from Amazon listing.' },
                  { gate: 'Price', icon: '✅', severity: 'Critical', rule: 'Price > $0. Must match Shopify landing page exactly', fix: 'Auto: applies 1.70x markup. AI: validates against Shopify.' },
                  { gate: 'ASIN', icon: '✅', severity: 'Major', rule: 'B followed by 9 alphanumeric chars', fix: 'Auto: extracts from URLs. AI: looks up on Amazon.' },
                  { gate: 'Description', icon: '✅', severity: 'Major', rule: '>30 chars of real content', fix: 'Auto: strips HTML. AI: rewrites clean description.' },
                  { gate: 'Google Category', icon: '🔵', severity: 'Major', rule: 'Google Product Category taxonomy path assigned', fix: 'Auto: maps from tags/title (50+ keywords). AI: assigns specific path.' },
                  { gate: 'Title Length', icon: '🔵', severity: 'Major', rule: '≤150 chars, no promotional words, no ALL CAPS', fix: 'Auto: trims at word boundary. AI: rewrites with formula.' },
                  { gate: 'Desc Clean', icon: '🔵', severity: 'Critical', rule: 'No HTML, no <meta> tags, no Amazon boilerplate', fix: 'Auto: strips all HTML + boilerplate. AI: rewrites from scratch.' },
                  { gate: 'Barcode/GTIN', icon: '🔵', severity: 'Major', rule: '8/12/13/14 digits, valid checksum, no reserved prefix', fix: 'Auto: validates format. Cannot generate GTINs — must come from product.' },
                  { gate: 'Identifier', icon: '🔵', severity: 'Critical', rule: 'GTIN+Brand or Brand+ASIN combination', fix: 'Auto: checks combo. Requires brand name ≠ "Unknown" + valid GTIN or ASIN.' },
                ].map(g => (
                  <div key={g.gate} style={{ background:'#0a0a0a', borderRadius:'6px', padding:'8px 10px', border:'1px solid #1a1a2e' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'4px', marginBottom:'3px' }}>
                      <span style={{ fontSize:'10px' }}>{g.icon}</span>
                      <span style={{ fontSize:'10px', color:'#fff', fontWeight:700 }}>{g.gate}</span>
                      <span style={{ fontSize:'7px', padding:'1px 4px', borderRadius:'3px', background: g.severity === 'Critical' ? '#ef444415' : '#f59e0b15', color: g.severity === 'Critical' ? '#ef4444' : '#f59e0b' }}>{g.severity}</span>
                    </div>
                    <p style={{ fontSize:'8px', color:'#888', margin:'0 0 2px', lineHeight:'1.3' }}>{g.rule}</p>
                    <p style={{ fontSize:'8px', color:'#16a34a', margin:0, lineHeight:'1.3' }}>Fix: {g.fix}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ COMPLIANCE TAB ═══ */}
        {activeTab === 'compliance' && analysis && (
          <div>
            {/* Auto-Fix Results */}
            {autoFixProgress.done > 0 && (
              <div style={{ background:'#111', borderRadius:'10px', padding:'16px', border: `1px solid ${autoFixing ? '#f59e0b33' : '#16a34a33'}`, marginBottom:'16px' }}>
                <p style={{ fontSize:'11px', color: autoFixing ? '#f59e0b' : '#16a34a', fontWeight:700, margin:'0 0 10px' }}>
                  {autoFixing ? `🔧 Auto-fixing products... ${autoFixProgress.done}/${autoFixProgress.total}` : `✅ Auto-fix complete`}
                </p>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'8px' }}>
                  {[
                    { label: 'Titles Trimmed', value: autoFixProgress.fixed.titles, color: '#06b6d4' },
                    { label: 'Descriptions Cleaned', value: autoFixProgress.fixed.descriptions, color: '#8b5cf6' },
                    { label: 'Categories Assigned', value: autoFixProgress.fixed.categories, color: '#16a34a' },
                    { label: 'Barcodes Validated', value: autoFixProgress.fixed.barcodes, color: '#f59e0b' },
                  ].map(s => (
                    <div key={s.label} style={{ background:'#0a0a0a', borderRadius:'8px', padding:'10px', textAlign:'center', border:'1px solid #1a1a2e' }}>
                      <div style={{ fontSize:'20px', fontWeight:800, color: s.color }}>{s.value.toLocaleString()}</div>
                      <div style={{ fontSize:'8px', color:'#555', marginTop:'2px' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Compliance Summary */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:'8px', marginBottom:'16px' }}>
              {[
                { label: 'Total', value: analysis.products.length, color: '#fff' },
                { label: '10/10 Passed', value: analysis.products.filter(p => p.gateCount === 10).length, color: '#16a34a' },
                { label: 'Title >150', value: analysis.products.filter(p => p.gates.titleLength !== 'pass').length, color: '#ef4444' },
                { label: 'No Category', value: analysis.products.filter(p => p.gates.googleCategory !== 'pass').length, color: '#ef4444' },
                { label: 'Dirty Desc', value: analysis.products.filter(p => p.gates.descClean !== 'pass').length, color: '#ef4444' },
              ].map(s => (
                <div key={s.label} style={{ background:'#111', borderRadius:'8px', padding:'12px', textAlign:'center', border:'1px solid #1a1a2e' }}>
                  <div style={{ fontSize:'24px', fontWeight:800, color: s.color }}>{s.value.toLocaleString()}</div>
                  <div style={{ fontSize:'9px', color:'#555', marginTop:'2px' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Gate-by-gate breakdown */}
            <div style={{ background:'#111', borderRadius:'10px', padding:'16px', border:'1px solid #1a1a2e', marginBottom:'16px' }}>
              <p style={{ fontSize:'11px', color:'#fff', fontWeight:700, margin:'0 0 12px' }}>Gate-by-Gate Compliance</p>
              {(['title','image','price','asin','description','googleCategory','titleLength','descClean','barcode','identifier'] as const).map(gateId => {
                const passed = analysis.products.filter(p => p.gates[gateId] === 'pass').length;
                const warned = analysis.products.filter(p => p.gates[gateId] === 'warn').length;
                const failed = analysis.products.filter(p => p.gates[gateId] === 'fail').length;
                const total = analysis.products.length;
                const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
                const labels: Record<string, string> = { title:'Title', image:'Image', price:'Price', asin:'ASIN', description:'Description', googleCategory:'Google Category', titleLength:'Title Length', descClean:'Desc Clean', barcode:'Barcode/GTIN', identifier:'Identifier' };
                return (
                  <div key={gateId} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 0', borderBottom:'1px solid #0f0f0f' }}>
                    <span style={{ width:120, fontSize:'10px', color:'#ccc', fontWeight:600 }}>{labels[gateId]}</span>
                    <div style={{ flex:1, height:8, background:'#1a1a2e', borderRadius:'4px', overflow:'hidden' }}>
                      <div style={{ width:`${pct}%`, height:'100%', background: pct >= 90 ? '#16a34a' : pct >= 50 ? '#f59e0b' : '#ef4444', borderRadius:'4px', transition:'width 0.3s' }} />
                    </div>
                    <span style={{ width:40, fontSize:'9px', color: pct >= 90 ? '#16a34a' : pct >= 50 ? '#f59e0b' : '#ef4444', fontWeight:700, textAlign:'right' }}>{pct}%</span>
                    <span style={{ width:100, fontSize:'8px', color:'#555', textAlign:'right' }}>✅{passed} ⚠️{warned} ❌{failed}</span>
                  </div>
                );
              })}
            </div>

            {/* Failing products list */}
            <div style={{ background:'#111', borderRadius:'10px', padding:'16px', border:'1px solid #1a1a2e' }}>
              <p style={{ fontSize:'11px', color:'#fff', fontWeight:700, margin:'0 0 12px' }}>
                Products Needing Fixes ({analysis.products.filter(p => p.gateCount < 10).length} of {analysis.products.length})
              </p>
              <div style={{ maxHeight:400, overflowY:'auto' }}>
                {analysis.products.filter(p => p.gateCount < 10).slice(0, 50).map((p, i) => {
                  const failingGates = Object.entries(p.gates).filter(([_, s]) => s !== 'pass').map(([g]) => g);
                  return (
                    <div key={i} onClick={() => { setSelectedProduct(p); setModalImageIdx(0); }}
                      style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 8px', borderBottom:'1px solid #0f0f0f', cursor:'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#151515')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <span style={{ fontSize:'10px', fontWeight:700, color: p.gateCount >= 7 ? '#f59e0b' : '#ef4444', width:40 }}>{p.gateCount}/10</span>
                      <span style={{ fontSize:'9px', color:'#ccc', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.title.substring(0, 60)}</span>
                      <div style={{ display:'flex', gap:'3px' }}>
                        {failingGates.slice(0, 3).map(g => (
                          <span key={g} style={{ padding:'1px 4px', borderRadius:'3px', fontSize:'7px', background:'#ef444415', color:'#ef4444' }}>{g}</span>
                        ))}
                        {failingGates.length > 3 && <span style={{ fontSize:'7px', color:'#555' }}>+{failingGates.length - 3}</span>}
                      </div>
                      <button onClick={e => { e.stopPropagation(); askAI(p); }}
                        style={{ padding:'2px 6px', borderRadius:'4px', border:'none', background:'#3b82f6', color:'#fff', fontSize:'7px', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                        🤖 AI Fix
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'compliance' && !analysis && (
          <div style={{ textAlign:'center', padding:'60px 0', color:'#555' }}>
            <p style={{ fontSize:'48px', margin:'0 0 12px' }}>🛡️</p>
            <p style={{ fontSize:'12px', fontWeight:600, color:'#888' }}>No products loaded</p>
            <p style={{ fontSize:'10px' }}>Switch to the Import tab and upload your product file first.</p>
          </div>
        )}

        {/* ═══ IMPORT TAB (original content) ═══ */}
        {activeTab === 'import' && <>
        {/* Drop Zone + Onboarding */}
        {!analysis && (
          <div>
            {/* Hero */}
            <div style={{ marginBottom:'24px' }}>
              <h2 style={{ fontSize:'14px', color:'#fff', fontWeight:700, margin:'0 0 6px' }}>Smart Product File Processor</h2>
              <p style={{ fontSize:'11px', color:'#555', margin:0, lineHeight:'1.6' }}>
                Upload any product file — this tool auto-detects the format, strips unnecessary data, validates every product against 10 listing requirements, 
                and lets you enrich missing data via Keepa/Rainforest APIs. No configuration needed.
              </p>
            </div>

            {/* Use Case Cards */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:'12px', marginBottom:'24px' }}>
              {/* Use Case 1 */}
              <div style={{ background:'#111', borderRadius:'10px', padding:'16px', border:'1px solid #1a1a2e' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
                  <span style={{ fontSize:'20px' }}>🧹</span>
                  <div>
                    <p style={{ fontSize:'11px', color:'#16a34a', fontWeight:700, margin:0 }}>USE CASE 1: Clean & Strip</p>
                    <p style={{ fontSize:'9px', color:'#444', margin:'2px 0 0' }}>Shopify Matrixify / CSV exports</p>
                  </div>
                </div>
                <p style={{ fontSize:'10px', color:'#777', margin:'0 0 8px', lineHeight:'1.5' }}>
                  Got a 50MB Shopify export with 166 columns and 70K rows? Drop it here. 
                  Strips to 11 essential columns, removes duplicate/variant rows, cleans HTML descriptions, 
                  validates every product.
                </p>
                <div style={{ fontSize:'9px', color:'#333', display:'flex', flexWrap:'wrap', gap:'4px' }}>
                  {['166 → 11 cols','70K → 2.5K rows','HTML cleanup','Dedup','10-gate check'].map(t => (
                    <span key={t} style={{ padding:'2px 6px', borderRadius:'3px', background:'#16a34a15', color:'#16a34a', border:'1px solid #16a34a22' }}>{t}</span>
                  ))}
                </div>
              </div>

              {/* Use Case 2 */}
              <div style={{ background:'#111', borderRadius:'10px', padding:'16px', border:'1px solid #1a1a2e' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
                  <span style={{ fontSize:'20px' }}>🔍</span>
                  <div>
                    <p style={{ fontSize:'11px', color:'#7c3aed', fontWeight:700, margin:0 }}>USE CASE 2: ASIN Enrichment</p>
                    <p style={{ fontSize:'9px', color:'#444', margin:'2px 0 0' }}>ASIN lists / Amazon URL lists</p>
                  </div>
                </div>
                <p style={{ fontSize:'10px', color:'#777', margin:'0 0 8px', lineHeight:'1.5' }}>
                  Have a list of 15K ASINs? Drop it. Auto-extracts all ASINs, then hit &quot;Enrich via Rainforest&quot; to pull 
                  title, image, price, brand, category, BSR, rating, availability — with criteria-first filtering 
                  to save API tokens.
                </p>
                <div style={{ fontSize:'9px', color:'#333', display:'flex', flexWrap:'wrap', gap:'4px' }}>
                  {['Auto-extract ASINs','Keepa batch (100/req)','Criteria filter','Price/BSR/Rating','Profit calc'].map(t => (
                    <span key={t} style={{ padding:'2px 6px', borderRadius:'3px', background:'#7c3aed15', color:'#7c3aed', border:'1px solid #7c3aed22' }}>{t}</span>
                  ))}
                </div>
              </div>

              {/* Use Case 3 */}
              <div style={{ background:'#111', borderRadius:'10px', padding:'16px', border:'1px solid #1a1a2e' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
                  <span style={{ fontSize:'20px' }}>📤</span>
                  <div>
                    <p style={{ fontSize:'11px', color:'#f59e0b', fontWeight:700, margin:0 }}>USE CASE 3: Multi-Platform Export</p>
                    <p style={{ fontSize:'9px', color:'#444', margin:'2px 0 0' }}>Coming soon</p>
                  </div>
                </div>
                <p style={{ fontSize:'10px', color:'#777', margin:'0 0 8px', lineHeight:'1.5' }}>
                  Once products pass 10-gate validation, export in the exact format each platform requires — 
                  eBay File Exchange, TikTok Shop template, Walmart feed, Shopify CSV. Image compliance per platform.
                </p>
                <div style={{ fontSize:'9px', color:'#333', display:'flex', flexWrap:'wrap', gap:'4px' }}>
                  {['eBay format','TikTok Shop','Walmart feed','Image validation','Title limits'].map(t => (
                    <span key={t} style={{ padding:'2px 6px', borderRadius:'3px', background:'#f59e0b15', color:'#f59e0b', border:'1px solid #f59e0b22' }}>{t}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* The 10 Gates — with compliance dropdown */}
            <div style={{ background:'#111', borderRadius:'10px', padding:'16px', border:'1px solid #1a1a2e', marginBottom:'24px' }}>
              <p style={{ fontSize:'10px', color:'#fff', fontWeight:700, margin:'0 0 4px', textTransform:'uppercase', letterSpacing:'1px' }}>10-Gate Google Merchant Compliance System</p>
              <p style={{ fontSize:'10px', color:'#555', margin:'0 0 12px' }}>Every product must pass all 10 gates before Google Merchant Center will approve it. Click any gate to see full compliance details.</p>
              
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                {[
                  { icon:'✅', gate:'Title', category:'core', severity:'Critical — Disapproval', desc:'Product title exists, is descriptive, and contains no HTML.',
                    details:'Google requires every product to have a title. Titles must accurately describe the product without promotional language. HTML tags cause immediate disapproval.',
                    rules:['Min 6 characters, max 150 characters','No HTML tags (<b>, <br>, etc.)','Must not be a generic placeholder like "Unknown Product"','Should include the product type (what it IS)'],
                    disapproval:'Products without a title are rejected. Products with HTML in titles are disapproved.',
                    fix:'Use formula: Brand + Product Type + Key Feature + Size/Color' },
                  { icon:'✅', gate:'Image', category:'core', severity:'Critical — Disapproval', desc:'Product has at least 1 image. 3+ images for full pass.',
                    details:'Google requires a main product image. Images must be real product photos on clean backgrounds. No watermarks, no promotional text overlays, no placeholder images.',
                    rules:['Minimum 1 image URL (https://)','3+ images = full pass, 1-2 = warning','Minimum 800×800px resolution','No text overlays, watermarks, or promotional badges','No placeholder/stock images'],
                    disapproval:'Products without images are rejected. Products with promotional overlays may be disapproved.',
                    fix:'Use the main product photo from Amazon. Ensure minimum 800×800px resolution.' },
                  { icon:'✅', gate:'Price', category:'core', severity:'Critical — Disapproval', desc:'Product has a price greater than $0.',
                    details:'Google requires an accurate price that EXACTLY matches what the customer sees on your landing page. Even a $0.01 mismatch causes disapproval.',
                    rules:['Price must be > $0','Must match the price on your Shopify product page exactly','Currency must be specified (USD)','Tax should NOT be included in the price (US/Canada)'],
                    disapproval:'Price mismatch between feed and landing page is the #1 cause of disapproval. Products with no price are rejected.',
                    fix:'Ensure your feed pulls from the same Shopify price field that displays on the product page.' },
                  { icon:'✅', gate:'ASIN/SKU', category:'core', severity:'Major — Reduced visibility', desc:'Valid Amazon ASIN (B0XXXXXXXXX format).',
                    details:'ASIN serves as your Manufacturer Part Number (MPN) for Google. Combined with the brand, it helps Google identify your product in their catalog.',
                    rules:['Must be B followed by exactly 9 alphanumeric characters','Used as MPN (Manufacturer Part Number) in Google feed','Combined with brand name for product identification'],
                    disapproval:'Missing ASIN does not cause disapproval but significantly reduces product visibility and search matching.',
                    fix:'Extract ASIN from the Amazon product page URL (/dp/B0XXXXXXXXX).' },
                  { icon:'✅', gate:'Description', category:'core', severity:'Major — Reduced visibility', desc:'Minimum 30 characters, cleaned of HTML/boilerplate.',
                    details:'Google uses descriptions for search matching. Descriptions must be plain text — no HTML, no Amazon boilerplate, no promotional language.',
                    rules:['Minimum 30 chars (150+ recommended)','Maximum 5,000 characters','No HTML tags','No promotional text (same banned words as titles)','First sentence should contain the primary product keyword'],
                    disapproval:'Empty descriptions cause disapproval. Short descriptions reduce visibility.',
                    fix:'Write a factual description: what it is, key features, materials, dimensions, who it is for.' },
                  { icon:'🔵', gate:'Google Category', category:'google', severity:'Major — Poor matching', desc:'Google Product Category taxonomy path assigned.',
                    details:'Google uses this to match your product to search queries. Without it, Google guesses — and often guesses wrong. The more specific your category, the better your placement.',
                    rules:['Must use Google\'s official taxonomy','Use the MOST SPECIFIC path available','Example: "Health & Beauty > Personal Care > Cosmetics > Makeup > Lip Glosses"','NOT just "Health & Beauty"','Auto-mapped from your product tags when possible'],
                    disapproval:'Missing category does not cause disapproval but severely limits where your product appears. Google may place it in the wrong category entirely.',
                    fix:'The Feed Bot auto-maps from tags. For unmapped products, assign manually using Google\'s taxonomy.' },
                  { icon:'🔵', gate:'Title Length', category:'google', severity:'Major — Truncation', desc:'≤150 characters, no promo text, no ALL CAPS.',
                    details:'Google truncates titles at 150 characters. Everything after is invisible. Promotional text (best, sale, free shipping) is flagged. ALL CAPS is treated as spam.',
                    rules:['Maximum 150 characters (hard limit)','No promotional words: best, cheap, sale, discount, free shipping, #1, buy now, limited time, hot deal, clearance, lowest price','No ALL CAPS words (Title Case only)','No exclamation marks','Front-load the most important search keyword'],
                    disapproval:'Titles with promotional text may be disapproved. Titles over 150 chars are truncated (not disapproved but lose keywords). ALL CAPS titles are flagged as spam.',
                    fix:'Use title formula: Brand + Product Type + Key Feature + Size. Keep under 150 chars.' },
                  { icon:'🔵', gate:'Desc Clean', category:'google', severity:'Critical — Disapproval', desc:'No HTML, no Amazon <meta> tags, no boilerplate.',
                    details:'Descriptions imported from Amazon often contain raw HTML, <meta> viewport tags, <script> tags, and Amazon-specific boilerplate. Google rejects all of this.',
                    rules:['No HTML tags of any kind','No <meta> or <script> tags (common in Amazon imports)','No "charset=" declarations','No Amazon boilerplate ("About Us", "Shipping", "Returns", etc.)','Must be plain, factual text only'],
                    disapproval:'HTML in descriptions causes disapproval. Meta tags cause disapproval. This is the most common issue with Amazon-sourced products.',
                    fix:'The pipeline auto-strips HTML and Amazon junk. If it still fails, rewrite the description from scratch.' },
                  { icon:'🔵', gate:'Barcode/GTIN', category:'google', severity:'Major — 20-40% less clicks', desc:'Valid 8/12/13/14 digit GTIN with checksum.',
                    details:'Products WITH valid GTINs get 20-40% more clicks than products without. Google uses GTINs to match your product to their global product catalog. This is your biggest competitive advantage — most dropshippers don\'t have GTINs.',
                    rules:['Must be exactly 8, 12, 13, or 14 digits (numeric only)','Must pass GS1 checksum validation','Prefix must NOT start with 2, 02, or 04 (reserved by GS1)','Must be the REAL barcode from the manufacturer','Never make up or guess a GTIN — Google validates against GS1 database'],
                    disapproval:'Invalid GTIN causes disapproval. Missing GTIN shows "Limited performance due to missing identifiers" warning. Products with valid GTINs get 20-40% more clicks.',
                    fix:'Use the barcode from the product packaging or Amazon listing. Your Matrixify export has barcodes in the "Variant Barcode" column.' },
                  { icon:'🔵', gate:'Identifier', category:'google', severity:'Critical — Limited visibility', desc:'GTIN + Brand, or Brand + MPN (ASIN) required.',
                    details:'Google requires product identifiers to catalog your product. The strongest combo is GTIN + Brand. Fallback is Brand + MPN (your ASIN). Without identifiers, Google can\'t match your product to searches.',
                    rules:['Best: Valid GTIN + Brand name (vendor) → full visibility','Good: ASIN (as MPN) + Brand name → decent visibility','Weak: Brand only, no GTIN or MPN → limited visibility','Fail: No brand, no GTIN, no MPN → product may not appear at all','Brand must be the REAL brand name, not "Unknown" or your store name'],
                    disapproval:'Missing identifiers shows "Limited performance" warning. Products without any identifiers may not appear in Shopping results at all.',
                    fix:'Ensure the vendor/brand field is set to the real manufacturer name. Add barcode/GTIN from the product packaging.' },
                ].map(g => (
                  <ComplianceGateCard key={g.gate} {...g} />
                ))}
              </div>
            </div>

            {/* Accepted File Types */}
            <div style={{ background:'#111', borderRadius:'10px', padding:'16px', border:'1px solid #1a1a2e', marginBottom:'24px' }}>
              <p style={{ fontSize:'10px', color:'#fff', fontWeight:700, margin:'0 0 10px', textTransform:'uppercase', letterSpacing:'1px' }}>Accepted File Types</p>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'8px' }}>
                {[
                  { icon:'🟢', type:'Shopify Matrixify Export', ext:'.xlsx', auto:'Strips 155+ cols, dedup by Top Row' },
                  { icon:'🟢', type:'Shopify CSV Export', ext:'.csv', auto:'Maps Handle/Title/Image columns' },
                  { icon:'🔵', type:'ASIN List', ext:'.xlsx/.csv', auto:'Extracts ASINs from URLs or cells' },
                  { icon:'🟡', type:'AutoDS Export', ext:'.csv/.xlsx', auto:'Maps source URL and pricing' },
                  { icon:'🟠', type:'eBay File Exchange', ext:'.csv', auto:'Maps ItemID, Category, Action' },
                  { icon:'⚪', type:'Generic CSV/XLSX', ext:'.csv/.xlsx', auto:'Best-effort column matching' },
                ].map(f => (
                  <div key={f.type} style={{ display:'flex', gap:'8px', alignItems:'flex-start', padding:'6px 0' }}>
                    <span style={{ fontSize:'14px' }}>{f.icon}</span>
                    <div>
                      <p style={{ fontSize:'10px', color:'#ccc', fontWeight:600, margin:0 }}>{f.type} <span style={{ color:'#333' }}>{f.ext}</span></p>
                      <p style={{ fontSize:'9px', color:'#444', margin:'1px 0 0' }}>{f.auto}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Drop Zone */}
            <div onDrop={onDrop} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              onClick={() => fileRef.current?.click()}
              style={{ border:`2px dashed ${dragOver ? '#16a34a' : '#1a1a2e'}`, borderRadius:'16px', padding:'48px 40px', textAlign:'center', cursor:'pointer', transition:'all 0.2s', background: dragOver ? 'rgba(22,163,74,0.05)' : 'transparent' }}>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" style={{ display:'none' }} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
              {processing ? (
                <div><div style={{ fontSize:'32px', marginBottom:'12px' }}>⏳</div><p style={{ color:'#888', fontSize:'13px' }}>Processing {fileName}...</p></div>
              ) : (
                <div>
                  <div style={{ fontSize:'36px', marginBottom:'12px' }}>📂</div>
                  <p style={{ color:'#fff', fontSize:'14px', fontWeight:600, margin:'0 0 6px' }}>Drop your file here or click to browse</p>
                  <p style={{ color:'#444', fontSize:'10px', margin:0 }}>.xlsx · .xls · .csv · .tsv — up to 50MB</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        {analysis && (<div>
          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:'10px', marginBottom:'16px' }}>
            <div style={{ background:'#111', borderRadius:'10px', padding:'14px', border:'1px solid #1a1a2e' }}>
              <p style={{ fontSize:'8px', color:'#444', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 4px' }}>Format</p>
              <p style={{ fontSize:'12px', color:'#fff', margin:0, fontWeight:600 }}>{typeLabel[analysis.type]}</p>
              <p style={{ fontSize:'9px', color:'#333', margin:'2px 0 0' }}>{fileName}</p>
            </div>
            <div style={{ background:'#111', borderRadius:'10px', padding:'14px', border:'1px solid #1a1a2e' }}>
              <p style={{ fontSize:'8px', color:'#444', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 4px' }}>Cleanup</p>
              <p style={{ fontSize:'12px', color:'#fff', margin:0 }}>
                <span style={{ color:'#ef4444' }}>{analysis.removedCols}</span> cols · <span style={{ color:'#ef4444' }}>{analysis.removedRows.toLocaleString()}</span> rows removed
              </p>
              <p style={{ fontSize:'9px', color:'#333', margin:'2px 0 0' }}>{analysis.totalCols} → 11 cols · {analysis.totalRows.toLocaleString()} → {analysis.uniqueProducts.toLocaleString()}</p>
            </div>
            <div style={{ background:'#111', borderRadius:'10px', padding:'14px', border:'1px solid #1a1a2e' }}>
              <p style={{ fontSize:'8px', color:'#444', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 4px' }}>10-Gate Check</p>
              <p style={{ fontSize:'12px', margin:0 }}>
                <span style={{ color:'#16a34a', fontWeight:700 }}>{analysis.passed}</span><span style={{ color:'#333' }}> pass · </span>
                <span style={{ color:'#f59e0b', fontWeight:700 }}>{analysis.warned}</span><span style={{ color:'#333' }}> warn · </span>
                <span style={{ color:'#ef4444', fontWeight:700 }}>{analysis.failed}</span><span style={{ color:'#333' }}> fail</span>
              </p>
            </div>
            <div style={{ background:'#111', borderRadius:'10px', padding:'14px', border:'1px solid #1a1a2e' }}>
              <p style={{ fontSize:'8px', color:'#444', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 4px' }}>Speed</p>
              <p style={{ fontSize:'12px', color:'#fff', margin:0 }}>{analysis.processingTime}ms</p>
              <p style={{ fontSize:'9px', color:'#333', margin:'2px 0 0' }}>{analysis.detectedFeatures.join(' · ')}</p>
            </div>
          </div>

          {/* Criteria Panel */}
          {showCriteria && (
            <div style={{ background:'#111', borderRadius:'10px', padding:'16px', border:'1px solid #7c3aed33', marginBottom:'12px' }}>
              <p style={{ fontSize:'10px', color:'#7c3aed', fontWeight:600, margin:'0 0 10px', textTransform:'uppercase', letterSpacing:'1px' }}>⚙️ Discovery Criteria (Criteria-First, Demand-Filtered)</p>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:'8px' }}>
                {[
                  { key:'minPrice', label:'Min Price ($)', type:'number', step:0.5 },
                  { key:'maxPrice', label:'Max Price ($)', type:'number', step:1 },
                  { key:'minRating', label:'Min Rating', type:'number', step:0.1 },
                  { key:'minReviews', label:'Min Reviews', type:'number', step:50 },
                  { key:'maxBSR', label:'Max BSR', type:'number', step:10000 },
                  { key:'markup', label:'Markup (%)', type:'number', step:5 },
                  { key:'maxRetail', label:'Max Retail ($)', type:'number', step:5 },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize:'8px', color:'#555', textTransform:'uppercase', letterSpacing:'0.5px' }}>{f.label}</label>
                    <input type={f.type} step={f.step} value={(criteria as Record<string,number>)[f.key]}
                      onChange={e => setCriteria(prev => ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }))}
                      style={{ width:'100%', padding:'6px 8px', borderRadius:'4px', border:'1px solid #222', background:'#0a0a0a', color:'#fff', fontSize:'11px', fontFamily:'inherit', marginTop:'2px' }}
                    />
                  </div>
                ))}
              </div>
              <p style={{ fontSize:'9px', color:'#444', margin:'10px 0 0' }}>
                Products are filtered BEFORE Keepa enrichment to save API tokens. Only products passing these criteria will show as &quot;passed&quot;.
              </p>
            </div>
          )}

          {/* Enrichment Progress */}
          {(enriching || enrichProgress.error || enrichProgress.done > 0) && (
            <div style={{ background:'#111', borderRadius:'10px', padding:'12px 16px', border:`1px solid ${enrichProgress.error ? '#ef444433' : '#7c3aed33'}`, marginBottom:'12px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
                <span style={{ fontSize:'10px', color: enrichProgress.error ? '#ef4444' : '#7c3aed', fontWeight:600 }}>
                  {enrichProgress.error ? '❌ Enrichment Error' : enriching ? '🔍 Enriching via Rainforest API...' : '✅ Enrichment Complete'}
                </span>
                <span style={{ fontSize:'9px', color:'#555' }}>
                  {enrichProgress.tokensLeft > 0 ? `Cost: ${enrichProgress.tokensLeft.toLocaleString()}` : ''}
                </span>
              </div>
              <div style={{ background:'#1a1a2e', borderRadius:'4px', height:'6px', overflow:'hidden' }}>
                <div style={{ width:`${enrichProgress.total > 0 ? (enrichProgress.done/enrichProgress.total)*100 : 0}%`, height:'100%', background: enrichProgress.error ? '#ef4444' : '#7c3aed', borderRadius:'4px', transition:'width 0.3s' }} />
              </div>
              <p style={{ fontSize:'9px', color: enrichProgress.error ? '#ef4444' : '#444', margin:'4px 0 0' }}>
                {enrichProgress.error || `${enrichProgress.done}/${enrichProgress.total} ASINs · ${enrichProgress.currentBatch}`}
              </p>
            </div>
          )}

          {/* Pricing Progress */}
          {(pricing || pricingProgress.done > 0) && (
            <div style={{ background:'#111', borderRadius:'10px', padding:'12px 16px', border:`1px solid ${pricing ? '#f59e0b33' : pricingProgress.lowMarginCount > 0 ? '#f59e0b33' : '#16a34a33'}`, marginBottom:'12px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
                <span style={{ fontSize:'10px', color: pricing ? '#f59e0b' : '#16a34a', fontWeight:600 }}>
                  {pricing ? '💰 Dynamic Pricing Engine Running...' : `✅ Price Research Complete — ${pricingProgress.priced} products priced`}
                </span>
                <span style={{ fontSize:'9px', color:'#555' }}>
                  {pricingProgress.tokensLeft > 0 ? `Keepa tokens: ${pricingProgress.tokensLeft.toLocaleString()}` : ''}
                </span>
              </div>
              <div style={{ height:4, background:'#1a1a2e', borderRadius:'4px', overflow:'hidden', marginBottom:'8px' }}>
                <div style={{ width:`${pricingProgress.total > 0 ? (pricingProgress.done/pricingProgress.total)*100 : 0}%`, height:'100%', background: pricing ? '#f59e0b' : '#16a34a', borderRadius:'4px', transition:'width 0.3s' }} />
              </div>
              {/* Live stats row */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:'6px', marginBottom:'6px' }}>
                <div style={{ background:'#0a0a0f', borderRadius:'6px', padding:'6px 8px', textAlign:'center' }}>
                  <p style={{ fontSize:'14px', fontWeight:800, color:'#f59e0b', margin:0 }}>{pricingProgress.priced}</p>
                  <p style={{ fontSize:'7px', color:'#555', margin:'2px 0 0', textTransform:'uppercase', letterSpacing:'0.5px' }}>Priced</p>
                </div>
                <div style={{ background:'#0a0a0f', borderRadius:'6px', padding:'6px 8px', textAlign:'center' }}>
                  <p style={{ fontSize:'14px', fontWeight:800, color:'#16a34a', margin:0 }}>${pricingProgress.avgProfit.toFixed(2)}</p>
                  <p style={{ fontSize:'7px', color:'#555', margin:'2px 0 0', textTransform:'uppercase', letterSpacing:'0.5px' }}>Avg Profit</p>
                </div>
                <div style={{ background:'#0a0a0f', borderRadius:'6px', padding:'6px 8px', textAlign:'center' }}>
                  <p style={{ fontSize:'14px', fontWeight:800, color: pricingProgress.lowMarginCount > 0 ? '#f59e0b' : '#16a34a', margin:0 }}>{pricingProgress.lowMarginCount}</p>
                  <p style={{ fontSize:'7px', color:'#555', margin:'2px 0 0', textTransform:'uppercase', letterSpacing:'0.5px' }}>Low Margin</p>
                </div>
                <div style={{ background:'#0a0a0f', borderRadius:'6px', padding:'6px 8px', textAlign:'center' }}>
                  <p style={{ fontSize:'14px', fontWeight:800, color:'#06b6d4', margin:0 }}>${pricingProgress.lastMarket > 0 ? pricingProgress.lastMarket.toFixed(2) : '—'}</p>
                  <p style={{ fontSize:'7px', color:'#555', margin:'2px 0 0', textTransform:'uppercase', letterSpacing:'0.5px' }}>Last Mkt Price</p>
                </div>
                <div style={{ background:'#0a0a0f', borderRadius:'6px', padding:'6px 8px', textAlign:'center' }}>
                  <p style={{ fontSize:'14px', fontWeight:800, color: pricingProgress.lastProfitPct >= 30 ? '#16a34a' : '#f59e0b', margin:0 }}>{pricingProgress.lastProfitPct > 0 ? `${pricingProgress.lastProfitPct}%` : '—'}</p>
                  <p style={{ fontSize:'7px', color:'#555', margin:'2px 0 0', textTransform:'uppercase', letterSpacing:'0.5px' }}>Last Margin</p>
                </div>
              </div>
              {/* Last processed ASIN */}
              {pricing && pricingProgress.lastAsin && (
                <div style={{ background:'#0a0a0f', borderRadius:'6px', padding:'6px 10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:'9px', color:'#7c3aed', fontFamily:'monospace' }}>{pricingProgress.lastAsin}</span>
                  <span style={{ fontSize:'9px', color:'#555' }}>
                    Cost: ${pricingProgress.lastPrice > 0 ? (pricingProgress.lastPrice - pricingProgress.lastProfit).toFixed(2) : '—'} → Sell: <span style={{ color:'#06b6d4' }}>${pricingProgress.lastPrice.toFixed(2)}</span> → Profit: <span style={{ color: pricingProgress.lastProfitPct >= 30 ? '#16a34a' : '#f59e0b' }}>${pricingProgress.lastProfit.toFixed(2)} ({pricingProgress.lastProfitPct}%)</span>
                  </span>
                </div>
              )}
              <p style={{ fontSize:'9px', color:'#444', margin:'6px 0 0' }}>
                {`${pricingProgress.done}/${pricingProgress.total} products · ${pricingProgress.currentBatch}`}
              </p>
            </div>
          )}

          {/* Push Progress */}
          {(pushing || pushProgress.pushed > 0) && (
            <div style={{ background:'linear-gradient(135deg, #0a0a1a, #111)', borderRadius:'12px', padding:'16px 20px', border:`1px solid ${pushing ? '#f59e0b44' : pushProgress.errors > 0 ? '#f59e0b33' : '#16a34a44'}`, marginBottom:'12px', boxShadow: pushing ? '0 0 20px rgba(245,158,11,0.1)' : 'none' }}>
              {/* Header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <span style={{ fontSize:'16px' }}>{pushing ? '🚀' : pushProgress.errors > 0 ? '⚠️' : '✅'}</span>
                  <span style={{ fontSize:'13px', color: pushing ? '#f59e0b' : pushProgress.errors > 0 ? '#f59e0b' : '#16a34a', fontWeight:700 }}>
                    {pushing ? 'Pushing to Shopify...' : 'Push Complete!'}
                  </span>
                </div>
                <span style={{ fontSize:'11px', color:'#888', fontWeight:600 }}>
                  {pushProgress.done} / {pushProgress.total}
                </span>
              </div>

              {/* Progress bar */}
              <div style={{ background:'#1a1a2e', borderRadius:'8px', height:'14px', overflow:'hidden', position:'relative' }}>
                <div style={{
                  width: `${pushProgress.total > 0 ? (pushProgress.done / pushProgress.total) * 100 : 0}%`,
                  height: '100%',
                  background: pushing ? 'linear-gradient(90deg, #f59e0b, #f97316)' : pushProgress.errors > 0 ? 'linear-gradient(90deg, #f59e0b, #eab308)' : 'linear-gradient(90deg, #16a34a, #22c55e)',
                  borderRadius: '8px',
                  transition: 'width 0.3s ease',
                  boxShadow: pushing ? '0 0 10px rgba(245,158,11,0.4)' : 'none',
                }} />
                <span style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  fontSize: '9px', fontWeight: 800, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                }}>
                  {pushProgress.total > 0 ? `${((pushProgress.done / pushProgress.total) * 100).toFixed(1)}%` : '0%'}
                </span>
              </div>

              {/* Stats row */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'10px', gap:'12px' }}>
                <div style={{ display:'flex', gap:'16px' }}>
                  <span style={{ fontSize:'10px', color:'#16a34a', fontWeight:600 }}>✅ {pushProgress.pushed} pushed</span>
                  {pushProgress.errors > 0 && <span style={{ fontSize:'10px', color:'#ef4444', fontWeight:600 }}>❌ {pushProgress.errors} failed</span>}
                  <span style={{ fontSize:'10px', color:'#666' }}>{pushProgress.total - pushProgress.done} remaining</span>
                </div>
                {pushing && pushProgress.done > 0 && (
                  <span style={{ fontSize:'9px', color:'#555' }}>
                    ~{Math.ceil((pushProgress.total - pushProgress.done) / Math.max(1, pushProgress.done / ((Date.now() - (window as unknown as Record<string, number>).__pushStart || Date.now()) / 60000)))} min left
                  </span>
                )}
              </div>

              {/* Status message */}
              {pushProgress.lastError && (
                <p style={{ fontSize:'9px', color:'#555', margin:'8px 0 0', fontStyle:'italic' }}>{pushProgress.lastError}</p>
              )}

              {/* Completion message */}
              {!pushing && pushProgress.pushed > 0 && (
                <div style={{ marginTop:'10px', padding:'8px 12px', background:'rgba(22,163,74,0.1)', border:'1px solid rgba(22,163,74,0.2)', borderRadius:'8px' }}>
                  <p style={{ fontSize:'11px', color:'#16a34a', fontWeight:600, margin:0 }}>
                    🎉 {pushProgress.pushed} products are now live on your Shopify store!
                  </p>
                  <p style={{ fontSize:'9px', color:'#555', margin:'4px 0 0' }}>
                    Go to Shopify Admin → Products to see them. All products tagged with &quot;command-center&quot; + &quot;bulk-push&quot;.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Enterprise Filter Bar */}
          <div style={{ background:'#111', borderRadius:'10px', padding:'10px 14px', border:'1px solid #1a1a2e', marginBottom:'12px' }}>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', alignItems:'center' }}>
              {/* Gate filter */}
              <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)}
                style={{ padding:'5px 8px', borderRadius:'4px', border:'1px solid #222', background:'#0a0a0a', color:'#ccc', fontSize:'10px', fontFamily:'inherit' }}>
                <option value="all">All ({analysis.uniqueProducts})</option>
                <option value="passed">✅ Passed ({analysis.passed})</option>
                <option value="warned">⚠️ Warned ({analysis.warned})</option>
                <option value="failed">❌ Failed ({analysis.failed})</option>
              </select>
              {/* Stock */}
              <select value={stockFilter} onChange={e => setStockFilter(e.target.value as typeof stockFilter)}
                style={{ padding:'5px 8px', borderRadius:'4px', border:'1px solid #222', background:'#0a0a0a', color:'#ccc', fontSize:'10px', fontFamily:'inherit' }}>
                <option value="all">All Stock</option>
                <option value="instock">✅ In Stock</option>
                <option value="oos">❌ Out of Stock</option>
              </select>
              {/* Price range */}
              <div style={{ display:'flex', alignItems:'center', gap:'2px' }}>
                <input placeholder="Min $" value={priceMin} onChange={e => setPriceMin(e.target.value)}
                  style={{ width:'55px', padding:'5px 6px', borderRadius:'4px', border:'1px solid #222', background:'#0a0a0a', color:'#ccc', fontSize:'10px', fontFamily:'inherit' }} />
                <span style={{ color:'#333', fontSize:'10px' }}>–</span>
                <input placeholder="Max $" value={priceMax} onChange={e => setPriceMax(e.target.value)}
                  style={{ width:'55px', padding:'5px 6px', borderRadius:'4px', border:'1px solid #222', background:'#0a0a0a', color:'#ccc', fontSize:'10px', fontFamily:'inherit' }} />
              </div>
              {/* Profit min */}
              <input placeholder="Min Profit %" value={profitMin} onChange={e => setProfitMin(e.target.value)}
                style={{ width:'75px', padding:'5px 6px', borderRadius:'4px', border:'1px solid #222', background:'#0a0a0a', color:'#ccc', fontSize:'10px', fontFamily:'inherit' }} />
              {/* Rating min */}
              <input placeholder="Min ★" value={ratingMin} onChange={e => setRatingMin(e.target.value)}
                style={{ width:'50px', padding:'5px 6px', borderRadius:'4px', border:'1px solid #222', background:'#0a0a0a', color:'#ccc', fontSize:'10px', fontFamily:'inherit' }} />
              {/* BSR max */}
              <input placeholder="Max BSR" value={bsrMax} onChange={e => setBsrMax(e.target.value)}
                style={{ width:'70px', padding:'5px 6px', borderRadius:'4px', border:'1px solid #222', background:'#0a0a0a', color:'#ccc', fontSize:'10px', fontFamily:'inherit' }} />
              {/* Search */}
              <input placeholder="🔍 Search title, ASIN, brand..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                style={{ flex:'1', minWidth:'150px', padding:'5px 8px', borderRadius:'4px', border:'1px solid #222', background:'#0a0a0a', color:'#ccc', fontSize:'10px', fontFamily:'inherit' }} />
              {/* Sort */}
              <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
                style={{ padding:'5px 8px', borderRadius:'4px', border:'1px solid #222', background:'#0a0a0a', color:'#ccc', fontSize:'10px', fontFamily:'inherit' }}>
                <option value="default">Sort by</option>
                <option value="profit">Profit %</option>
                <option value="price">Price</option>
                <option value="rating">Rating</option>
                <option value="bsr">BSR</option>
                <option value="reviews">Reviews</option>
              </select>
              <button onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                style={{ padding:'5px 8px', borderRadius:'4px', border:'1px solid #222', background:'#0a0a0a', color:'#888', fontSize:'10px', cursor:'pointer' }}>
                {sortDir === 'desc' ? '↓' : '↑'}
              </button>
              {/* Per page */}
              <select value={perPage} onChange={e => setPerPage(Number(e.target.value))}
                style={{ padding:'5px 8px', borderRadius:'4px', border:'1px solid #222', background:'#0a0a0a', color:'#ccc', fontSize:'10px', fontFamily:'inherit' }}>
                <option value={25}>25/page</option>
                <option value={50}>50/page</option>
                <option value={100}>100/page</option>
                <option value={200}>200/page</option>
              </select>
              <span style={{ fontSize:'9px', color:'#555' }}>{filtered.length} results</span>
            </div>
          </div>

          {/* Views */}
          {viewMode === 'cards' ? (
            /* Product Card Grid */
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:'12px' }}>
              {filtered.slice(0, 100).map((p, i) => (
                <div key={i} onClick={() => { setSelectedProduct(p); setModalImageIdx(0); }} style={{ background:'#111', borderRadius:'12px', border:'1px solid #1a1a2e', overflow:'hidden', position:'relative', cursor:'pointer', transition:'border-color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#333')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#1a1a2e')}>
                  {/* Stock badge */}
                  <div style={{ position:'absolute', top:8, left:8, zIndex:2 }}>
                    <span style={{ padding:'2px 8px', borderRadius:'4px', fontSize:'8px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px',
                      background: p.stockStatus === 'In Stock' ? 'rgba(22,163,74,0.9)' : p.stockStatus === 'Out of Stock' ? 'rgba(239,68,68,0.9)' : 'rgba(85,85,85,0.9)',
                      color:'#fff' }}>
                      {p.stockStatus === 'In Stock' ? 'In Stock' : p.stockStatus === 'Out of Stock' ? 'OOS' : 'Unknown'}
                    </span>
                  </div>
                  {/* Gate badge + image count */}
                  <div style={{ position:'absolute', top:8, right:8, zIndex:2, display:'flex', gap:'4px' }}>
                    {(p.images || []).length > 1 && (
                      <span style={{ padding:'2px 8px', borderRadius:'4px', fontSize:'8px', fontWeight:700, background:'rgba(6,182,212,0.9)', color:'#fff' }}>
                        📷 {(p.images || []).length}
                      </span>
                    )}
                    <span style={{ padding:'2px 8px', borderRadius:'4px', fontSize:'8px', fontWeight:700,
                      background: p.gateCount===10?'rgba(22,163,74,0.9)':p.gateCount>=3?'rgba(245,158,11,0.9)':'rgba(239,68,68,0.9)',
                      color:'#fff' }}>{p.gateCount}/10</span>
                  </div>
                  {/* Image */}
                  <div style={{ height:180, background:'#0a0a0a', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                    {p.image ? (
                      <img src={p.image} alt={p.title} style={{ maxHeight:'100%', maxWidth:'100%', objectFit:'contain' }}
                        onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                    ) : (
                      <span style={{ color:'#222', fontSize:'36px' }}>📦</span>
                    )}
                  </div>
                  {/* Info */}
                  <div style={{ padding:'12px' }}>
                    <p style={{ fontSize:'11px', color:'#fff', fontWeight:600, margin:'0 0 4px', lineHeight:'1.3',
                      overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as const }}>{p.title || 'Untitled'}</p>
                    <p style={{ fontSize:'9px', color:'#06b6d4', margin:'0 0 8px', fontFamily:'monospace' }}>{p.asin}</p>
                    {/* Rating */}
                    {p.rating > 0 && (
                      <div style={{ display:'flex', alignItems:'center', gap:'4px', marginBottom:'8px' }}>
                        <span style={{ color:'#f59e0b', fontSize:'10px' }}>{'★'.repeat(Math.round(p.rating))}{'☆'.repeat(5-Math.round(p.rating))}</span>
                        <span style={{ color:'#555', fontSize:'9px' }}>{p.rating} ({p.reviews.toLocaleString()})</span>
                      </div>
                    )}
                    {/* Pricing */}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:'6px' }}>
                      <div>
                        <span style={{ fontSize:'8px', color:'#555', textTransform:'uppercase', letterSpacing:'0.5px' }}>Cost</span>
                        <p style={{ fontSize:'14px', color:'#ccc', fontWeight:700, margin:0 }}>{p.price > 0 ? `$${p.price.toFixed(2)}` : '—'}</p>
                      </div>
                      <div style={{ textAlign:'center' }}>
                        <span style={{ fontSize:'8px', color:'#555', textTransform:'uppercase', letterSpacing:'0.5px' }}>Sell</span>
                        <p style={{ fontSize:'14px', color:'#06b6d4', fontWeight:700, margin:0 }}>{p.sellPrice > 0 ? `$${p.sellPrice.toFixed(2)}` : '—'}</p>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <span style={{ fontSize:'8px', color:'#555', textTransform:'uppercase', letterSpacing:'0.5px' }}>Profit</span>
                        <p style={{ fontSize:'14px', color:'#16a34a', fontWeight:700, margin:0 }}>{p.profitPct > 0 ? `${p.profitPct.toFixed(0)}%` : '—'}</p>
                      </div>
                    </div>
                    {/* Meta row */}
                    <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                      {p.bsr > 0 && <span style={{ padding:'2px 6px', borderRadius:'3px', background:'#8b5cf615', color:'#8b5cf6', fontSize:'8px', border:'1px solid #8b5cf622' }}>BSR {p.bsr.toLocaleString()}</span>}
                      {p.vendor && p.vendor !== 'Unknown' && <span style={{ padding:'2px 6px', borderRadius:'3px', background:'#06b6d415', color:'#06b6d4', fontSize:'8px', border:'1px solid #06b6d422' }}>{p.vendor}</span>}
                      {p.category && p.category !== 'General' && <span style={{ padding:'2px 6px', borderRadius:'3px', background:'#33333333', color:'#888', fontSize:'8px', border:'1px solid #33333355' }}>{p.category.substring(0,25)}</span>}
                      {p.dateChecked && <span style={{ padding:'2px 6px', borderRadius:'3px', background:'#33333333', color:'#555', fontSize:'8px' }}>📅 {p.dateChecked}</span>}
                    </div>
                  </div>
                </div>
              ))}
              {filtered.length > 100 && <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'20px', color:'#333', fontSize:'10px' }}>Showing 100 of {filtered.length}. Use filters or export to see all.</div>}
            </div>
          ) : viewMode === 'spreadsheet' ? (
            <SpreadsheetView products={filtered} onUpdate={handleUpdate} perPage={perPage} onToggleSelect={toggleSelect} onSelectAll={selectAll} onProductClick={(p) => { setSelectedProduct(p); setModalImageIdx(0); }} />
          ) : (
            <div style={{ background:'#111', borderRadius:'12px', border:'1px solid #1a1a2e', overflow:'hidden' }}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid #1a1a2e' }}>
                      <th style={{ padding:'8px', color:'#444', fontSize:'8px', textTransform:'uppercase', letterSpacing:'1px' }}>Gates</th>
                      <th style={{ padding:'8px', color:'#444', fontSize:'8px', textTransform:'uppercase', letterSpacing:'1px', textAlign:'left' }}>Product</th>
                      <th style={{ padding:'8px', color:'#444', fontSize:'8px', textTransform:'uppercase', letterSpacing:'1px' }}>ASIN</th>
                      <th style={{ padding:'8px', color:'#444', fontSize:'8px', textTransform:'uppercase', letterSpacing:'1px', textAlign:'right' }}>Price</th>
                      <th style={{ padding:'8px', color:'#444', fontSize:'8px', textTransform:'uppercase' }}>Title</th>
                      <th style={{ padding:'8px', color:'#444', fontSize:'8px', textTransform:'uppercase' }}>Img</th>
                      <th style={{ padding:'8px', color:'#444', fontSize:'8px', textTransform:'uppercase' }}>Price</th>
                      <th style={{ padding:'8px', color:'#444', fontSize:'8px', textTransform:'uppercase' }}>ASIN</th>
                      <th style={{ padding:'8px', color:'#444', fontSize:'8px', textTransform:'uppercase' }}>Desc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 200).map((p, i) => (
                      <tr key={i} onClick={() => { setSelectedProduct(p); setModalImageIdx(0); }} style={{ borderBottom:'1px solid #0a0a0a', cursor:'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#1a1a2e22')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td style={{ padding:'6px 8px', textAlign:'center' }}>
                          <span style={{ fontSize:'9px', fontWeight:700, padding:'2px 6px', borderRadius:'3px',
                            background: p.gateCount===10?'rgba(22,163,74,0.15)':p.gateCount>=3?'rgba(245,158,11,0.15)':'rgba(239,68,68,0.15)',
                            color: p.gateCount===10?'#16a34a':p.gateCount>=3?'#f59e0b':'#ef4444' }}>{p.gateCount}/10</span>
                        </td>
                        <td style={{ padding:'6px 8px', maxWidth:250 }}>
                          <p style={{ margin:0, color:'#fff', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:'11px' }}>{p.title}</p>
                          <p style={{ margin:'1px 0 0', color:'#333', fontSize:'9px' }}>{p.vendor} · {p.category}</p>
                        </td>
                        <td style={{ padding:'6px 8px', color:'#06b6d4', fontSize:'10px', fontFamily:'monospace' }}>{p.asin || '—'}</td>
                        <td style={{ padding:'6px 8px', textAlign:'right', color:'#16a34a', fontWeight:600 }}>{p.price > 0 ? `$${p.price.toFixed(2)}` : '—'}</td>
                        <td style={{ padding:'6px 8px', textAlign:'center' }}>{gateIcon(p.gates.title)}</td>
                        <td style={{ padding:'6px 8px', textAlign:'center' }}>{gateIcon(p.gates.image)}</td>
                        <td style={{ padding:'6px 8px', textAlign:'center' }}>{gateIcon(p.gates.price)}</td>
                        <td style={{ padding:'6px 8px', textAlign:'center' }}>{gateIcon(p.gates.asin)}</td>
                        <td style={{ padding:'6px 8px', textAlign:'center' }}>{gateIcon(p.gates.description)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length > 200 && <p style={{ padding:'12px', textAlign:'center', color:'#333', fontSize:'10px' }}>Showing 200 of {filtered.length}. Export to see all.</p>}
              </div>
            </div>
          )}

          {/* Product Cards — always shown below spreadsheet/table */}
          {viewMode !== 'cards' && filtered.some(p => p.image) && (
            <div style={{ marginTop:'16px' }}>
              <h3 style={{ fontSize:'10px', color:'#555', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 10px' }}>
                Product Preview ({Math.min(filtered.filter(p => p.image).length, perPage)} of {filtered.filter(p => p.image).length} with images)
              </h3>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:'10px' }}>
                {filtered.filter(p => p.image).slice(0, perPage).map((p, i) => (
                  <div key={i} onClick={() => { setSelectedProduct(p); setModalImageIdx(0); }} style={{ background:'#111', borderRadius:'10px', border:'1px solid #1a1a2e', overflow:'hidden', position:'relative', cursor:'pointer', transition:'border-color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#333')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#1a1a2e')}>
                    {/* Badges */}
                    <div style={{ position:'absolute', top:6, left:6, zIndex:2, display:'flex', gap:'4px' }}>
                      <span style={{ padding:'2px 6px', borderRadius:'3px', fontSize:'7px', fontWeight:700, textTransform:'uppercase',
                        background: p.stockStatus === 'In Stock' ? 'rgba(22,163,74,0.9)' : p.stockStatus === 'Out of Stock' ? 'rgba(239,68,68,0.9)' : 'rgba(85,85,85,0.9)', color:'#fff' }}>
                        {p.stockStatus === 'In Stock' ? 'In Stock' : p.stockStatus === 'Out of Stock' ? 'OOS' : '?'}
                      </span>
                      {p.rating > 0 && <span style={{ padding:'2px 6px', borderRadius:'3px', fontSize:'7px', fontWeight:700, background:'rgba(245,158,11,0.9)', color:'#000' }}>★{p.rating}</span>}
                    </div>
                    <div style={{ position:'absolute', top:6, right:6, zIndex:2, display:'flex', gap:'4px' }}>
                      {(p.images || []).length > 1 && (
                        <span style={{ padding:'2px 6px', borderRadius:'3px', fontSize:'7px', fontWeight:700, background:'rgba(6,182,212,0.9)', color:'#fff' }}>📷 {(p.images || []).length}</span>
                      )}
                      <span style={{ padding:'2px 6px', borderRadius:'3px', fontSize:'7px', fontWeight:700,
                        background: p.gateCount===10?'rgba(22,163,74,0.9)':p.gateCount>=3?'rgba(245,158,11,0.9)':'rgba(239,68,68,0.9)', color:'#fff' }}>{p.gateCount}/10</span>
                      {p.shopifyStatus === 'pushed' && <span style={{ padding:'2px 6px', borderRadius:'3px', fontSize:'7px', fontWeight:700, background:'rgba(22,163,74,0.9)', color:'#fff' }}>✅ Synced</span>}
                      {p.shopifyStatus === 'failed' && <span style={{ padding:'2px 6px', borderRadius:'3px', fontSize:'7px', fontWeight:700, background:'rgba(239,68,68,0.9)', color:'#fff' }}>❌ Failed</span>}
                    </div>
                    {/* Image */}
                    <div style={{ height:160, background:'#0a0a0a', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                      <img src={p.image} alt="" style={{ maxHeight:'100%', maxWidth:'100%', objectFit:'contain' }}
                        onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                    </div>
                    {/* Info */}
                    <div style={{ padding:'10px' }}>
                      <p style={{ fontSize:'10px', color:'#fff', fontWeight:600, margin:'0 0 3px', lineHeight:'1.3',
                        overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as const }}>{p.title || 'Untitled'}</p>
                      <p style={{ fontSize:'8px', color:'#06b6d4', margin:'0 0 6px', fontFamily:'monospace' }}>{p.asin} · {p.vendor}</p>
                      {/* Pricing row */}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                        <div>
                          <p style={{ fontSize:'7px', color:'#555', margin:0, textTransform:'uppercase' }}>Cost</p>
                          <p style={{ fontSize:'13px', color:'#ccc', fontWeight:700, margin:0 }}>${p.price.toFixed(2)}</p>
                        </div>
                        <div style={{ textAlign:'center' }}>
                          <p style={{ fontSize:'7px', color:'#555', margin:0, textTransform:'uppercase' }}>Sell</p>
                          <p style={{ fontSize:'13px', color:'#06b6d4', fontWeight:700, margin:0 }}>${p.sellPrice.toFixed(2)}</p>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <p style={{ fontSize:'7px', color:'#555', margin:0, textTransform:'uppercase' }}>Profit</p>
                          <p style={{ fontSize:'13px', color:'#16a34a', fontWeight:700, margin:0 }}>{p.profitPct.toFixed(0)}%</p>
                        </div>
                      </div>
                      {/* Tags */}
                      {p.bsr > 0 && (
                        <div style={{ marginTop:'6px', display:'flex', gap:'4px', flexWrap:'wrap' }}>
                          <span style={{ padding:'1px 5px', borderRadius:'3px', background:'#8b5cf615', color:'#8b5cf6', fontSize:'7px' }}>BSR {p.bsr.toLocaleString()}</span>
                          {p.reviews > 0 && <span style={{ padding:'1px 5px', borderRadius:'3px', background:'#33333333', color:'#888', fontSize:'7px' }}>{p.reviews.toLocaleString()} reviews</span>}
                          {p.dateChecked && <span style={{ padding:'1px 5px', borderRadius:'3px', background:'#33333333', color:'#555', fontSize:'7px' }}>📅 {p.dateChecked}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>)}
        </>}{/* end Import tab */}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PRODUCT DETAIL MODAL (accessible from any tab)            */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {selectedProduct && (
          <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={() => { setSelectedProduct(null); setModalImageIdx(0); }}>
            <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(8px)' }} />
            <div style={{ position:'relative', background:'#111', borderRadius:'16px', border:'1px solid #1a1a2e', width:'92%', maxWidth:700, maxHeight:'90vh', overflow:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.6)' }}
              onClick={e => e.stopPropagation()}>

              {/* Close */}
              <button onClick={() => { setSelectedProduct(null); setModalImageIdx(0); }}
                style={{ position:'sticky', top:12, float:'right', marginRight:12, zIndex:10, width:32, height:32, borderRadius:'999px', border:'1px solid #333', background:'#1a1a2e', color:'#888', fontSize:'16px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>

              {/* Header */}
              <div style={{ padding:'20px 24px 14px', borderBottom:'1px solid #1a1a2e', display:'flex', alignItems:'center', gap:'10px' }}>
                <h2 style={{ fontSize:'14px', color:'#fff', fontWeight:700, margin:0 }}>Product Details</h2>
                <span style={{ padding:'3px 10px', borderRadius:'999px', fontSize:'9px', fontWeight:700,
                  background: selectedProduct.stockStatus === 'In Stock' ? 'rgba(22,163,74,0.15)' : 'rgba(239,68,68,0.15)',
                  color: selectedProduct.stockStatus === 'In Stock' ? '#16a34a' : '#ef4444',
                  border: `1px solid ${selectedProduct.stockStatus === 'In Stock' ? '#16a34a33' : '#ef444433'}`,
                }}>{selectedProduct.stockStatus === 'In Stock' ? 'Active' : 'Out of Stock'}</span>
                <span style={{ padding:'3px 10px', borderRadius:'999px', fontSize:'9px', fontWeight:700,
                  background: selectedProduct.gateCount===10?'rgba(22,163,74,0.15)':selectedProduct.gateCount>=3?'rgba(245,158,11,0.15)':'rgba(239,68,68,0.15)',
                  color: selectedProduct.gateCount===10?'#16a34a':selectedProduct.gateCount>=3?'#f59e0b':'#ef4444',
                }}>{selectedProduct.gateCount}/10 Gates</span>
              </div>

              <div style={{ display:'flex', flexWrap:'wrap' }}>
                {/* LEFT — Image gallery */}
                <div style={{ flex:'0 0 260px', padding:'20px', borderRight:'1px solid #1a1a2e' }}>
                  {/* Main image */}
                  <div style={{ width:'100%', height:200, background:'#0a0a0a', borderRadius:'12px', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', marginBottom:'10px', border:'1px solid #1a1a2e', position:'relative' }}>
                    {(selectedProduct.images?.length > 0 || selectedProduct.image) ? (
                      <img src={selectedProduct.images?.[modalImageIdx] || selectedProduct.image} alt={selectedProduct.title}
                        style={{ maxHeight:'100%', maxWidth:'100%', objectFit:'contain' }}
                        onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                    ) : (
                      <span style={{ color:'#333', fontSize:'48px' }}>📦</span>
                    )}
                    {/* Arrow nav */}
                    {(selectedProduct.images?.length || 0) > 1 && (
                      <>
                        <button onClick={() => setModalImageIdx(i => i > 0 ? i - 1 : (selectedProduct.images?.length || 1) - 1)}
                          style={{ position:'absolute', left:4, top:'50%', transform:'translateY(-50%)', width:28, height:28, borderRadius:'999px', border:'none', background:'rgba(0,0,0,0.6)', color:'#fff', fontSize:'14px', cursor:'pointer' }}>‹</button>
                        <button onClick={() => setModalImageIdx(i => i < (selectedProduct.images?.length || 1) - 1 ? i + 1 : 0)}
                          style={{ position:'absolute', right:4, top:'50%', transform:'translateY(-50%)', width:28, height:28, borderRadius:'999px', border:'none', background:'rgba(0,0,0,0.6)', color:'#fff', fontSize:'14px', cursor:'pointer' }}>›</button>
                      </>
                    )}
                  </div>
                  {/* Thumbnails */}
                  {(selectedProduct.images?.length || 0) > 1 && (
                    <div style={{ display:'flex', gap:'5px', flexWrap:'wrap', justifyContent:'center' }}>
                      {(selectedProduct.images || []).map((img, idx) => (
                        <div key={idx} onClick={() => setModalImageIdx(idx)}
                          style={{ width:40, height:40, borderRadius:'8px', border: idx === modalImageIdx ? '2px solid #7c3aed' : '1px solid #222', background:'#0a0a0a', cursor:'pointer', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', opacity: idx === modalImageIdx ? 1 : 0.5, transition:'opacity 0.15s' }}>
                          <img src={img} alt="" style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }}
                            onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                        </div>
                      ))}
                    </div>
                  )}
                  <p style={{ fontSize:'9px', color:'#555', textAlign:'center', margin:'8px 0 0' }}>
                    {modalImageIdx + 1} / {selectedProduct.images?.length || (selectedProduct.image ? 1 : 0)} images
                  </p>

                  {/* Actions */}
                  <div style={{ display:'flex', gap:'6px', marginTop:'14px' }}>
                    {selectedProduct.asin && (
                      <a href={`https://www.amazon.com/dp/${selectedProduct.asin}`} target="_blank" rel="noopener noreferrer"
                        style={{ flex:1, padding:'8px', borderRadius:'8px', background:'#1a1a2e', border:'1px solid #333', color:'#06b6d4', fontSize:'10px', fontWeight:600, textAlign:'center', textDecoration:'none' }}>
                        View on Amazon →
                      </a>
                    )}
                  </div>
                </div>

                {/* RIGHT — Details */}
                <div style={{ flex:1, minWidth:280, padding:'20px' }}>
                  {/* Title */}
                  <div style={{ marginBottom:'14px' }}>
                    <p style={{ fontSize:'8px', color:'#555', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 4px' }}>Title</p>
                    <p style={{ fontSize:'13px', color:'#fff', fontWeight:600, margin:0, lineHeight:'1.4' }}>{selectedProduct.title || 'Untitled'}</p>
                  </div>

                  {/* Info grid */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'16px' }}>
                    <div>
                      <p style={{ fontSize:'8px', color:'#555', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 3px' }}>ASIN</p>
                      <p style={{ fontSize:'11px', color:'#06b6d4', fontWeight:600, margin:0, fontFamily:'monospace' }}>{selectedProduct.asin || '—'}</p>
                    </div>
                    <div>
                      <p style={{ fontSize:'8px', color:'#555', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 3px' }}>Category</p>
                      <p style={{ fontSize:'11px', color:'#ccc', margin:0 }}>{selectedProduct.category || '—'}</p>
                    </div>
                    <div>
                      <p style={{ fontSize:'8px', color:'#555', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 3px' }}>Rating</p>
                      <p style={{ fontSize:'11px', margin:0 }}>
                        <span style={{ color:'#f59e0b' }}>{'★'.repeat(Math.round(selectedProduct.rating))}{'☆'.repeat(Math.max(0, 5 - Math.round(selectedProduct.rating)))}</span>
                        <span style={{ color:'#888', marginLeft:'4px' }}>{selectedProduct.rating || 0}</span>
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize:'8px', color:'#555', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 3px' }}>Reviews</p>
                      <p style={{ fontSize:'11px', color:'#ccc', fontWeight:600, margin:0 }}>{(selectedProduct.reviews || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p style={{ fontSize:'8px', color:'#555', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 3px' }}>BSR</p>
                      <p style={{ fontSize:'11px', color:'#8b5cf6', fontWeight:600, margin:0 }}>{selectedProduct.bsr > 0 ? `#${selectedProduct.bsr.toLocaleString()}` : '—'}</p>
                    </div>
                    <div>
                      <p style={{ fontSize:'8px', color:'#555', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 3px' }}>Vendor</p>
                      <p style={{ fontSize:'11px', color:'#ccc', margin:0 }}>{selectedProduct.vendor || '—'}</p>
                    </div>
                  </div>

                  {/* Google Merchant Fields */}
                  <div style={{ background:'#0a0a0a', borderRadius:'12px', padding:'14px', border:'1px solid #3b82f622', marginBottom:'16px' }}>
                    <p style={{ fontSize:'8px', color:'#3b82f6', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 10px', fontWeight:700 }}>Google Merchant Center</p>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                      <div>
                        <p style={{ fontSize:'8px', color:'#555', margin:'0 0 2px' }}>Barcode / GTIN</p>
                        <p style={{ fontSize:'11px', color: selectedProduct.barcode ? '#06b6d4' : '#ef4444', fontWeight:600, margin:0, fontFamily:'monospace' }}>
                          {selectedProduct.barcode || '❌ Missing'}
                        </p>
                      </div>
                      <div>
                        <p style={{ fontSize:'8px', color:'#555', margin:'0 0 2px' }}>Feed Score</p>
                        <p style={{ fontSize:'16px', fontWeight:800, margin:0,
                          color: (selectedProduct.feedScore || 0) >= 80 ? '#16a34a' : (selectedProduct.feedScore || 0) >= 50 ? '#f59e0b' : '#ef4444'
                        }}>{selectedProduct.feedScore || 0}<span style={{ fontSize:'10px', color:'#555' }}>/100</span></p>
                      </div>
                      <div style={{ gridColumn:'span 2' }}>
                        <p style={{ fontSize:'8px', color:'#555', margin:'0 0 2px' }}>Google Product Category</p>
                        <p style={{ fontSize:'10px', color: selectedProduct.googleCategory ? '#16a34a' : '#ef4444', margin:0, lineHeight:'1.3' }}>
                          {selectedProduct.googleCategory || '❌ Not assigned — Feed Bot can auto-map this'}
                        </p>
                      </div>
                      {selectedProduct.handle && (
                        <div>
                          <p style={{ fontSize:'8px', color:'#555', margin:'0 0 2px' }}>Handle</p>
                          <p style={{ fontSize:'10px', color:'#888', margin:0, fontFamily:'monospace' }}>{selectedProduct.handle}</p>
                        </div>
                      )}
                      {selectedProduct.weight && (
                        <div>
                          <p style={{ fontSize:'8px', color:'#555', margin:'0 0 2px' }}>Weight</p>
                          <p style={{ fontSize:'10px', color:'#888', margin:0 }}>{selectedProduct.weight}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pricing box */}
                  <div style={{ background:'#0a0a0a', borderRadius:'12px', padding:'14px', border: selectedProduct.lowMargin ? '1px solid #f59e0b33' : '1px solid #1a1a2e', marginBottom:'16px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                      <p style={{ fontSize:'8px', color:'#555', textTransform:'uppercase', letterSpacing:'1px', margin:0 }}>Pricing</p>
                      {selectedProduct.lowMargin && (
                        <span style={{ fontSize:'8px', color:'#f59e0b', background:'#f59e0b15', padding:'2px 8px', borderRadius:999, fontWeight:700, border:'1px solid #f59e0b33' }}>⚠️ LOW MARGIN &lt;30%</span>
                      )}
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px' }}>
                      <div>
                        <p style={{ fontSize:'8px', color:'#555', margin:'0 0 2px' }}>Amazon Cost</p>
                        <p style={{ fontSize:'16px', color:'#ccc', fontWeight:700, margin:0 }}>{selectedProduct.price > 0 ? `$${selectedProduct.price.toFixed(2)}` : '—'}</p>
                      </div>
                      <div>
                        <p style={{ fontSize:'8px', color:'#555', margin:'0 0 2px' }}>Your Price</p>
                        <p style={{ fontSize:'16px', color:'#06b6d4', fontWeight:700, margin:0 }}>{selectedProduct.sellPrice > 0 ? `$${selectedProduct.sellPrice.toFixed(2)}` : '—'}</p>
                      </div>
                      <div>
                        <p style={{ fontSize:'8px', color:'#555', margin:'0 0 2px' }}>Market Price</p>
                        <p style={{ fontSize:'16px', color:'#06b6d4', fontWeight:700, margin:0 }}>{selectedProduct.marketPrice > 0 ? `$${selectedProduct.marketPrice.toFixed(2)}` : '—'}</p>
                      </div>
                      <div>
                        <p style={{ fontSize:'8px', color:'#555', margin:'0 0 2px' }}>Profit $</p>
                        <p style={{ fontSize:'16px', color: selectedProduct.profit > 0 ? (selectedProduct.lowMargin ? '#f59e0b' : '#16a34a') : '#ef4444', fontWeight:700, margin:0 }}>
                          {selectedProduct.profit > 0 ? `$${selectedProduct.profit.toFixed(2)}` : '—'}
                        </p>
                      </div>
                      <div>
                        <p style={{ fontSize:'8px', color:'#555', margin:'0 0 2px' }}>Profit %</p>
                        <p style={{ fontSize:'16px', color: selectedProduct.profitPct > 0 ? (selectedProduct.lowMargin ? '#f59e0b' : '#16a34a') : '#ef4444', fontWeight:700, margin:0 }}>
                          {selectedProduct.profitPct > 0 ? `${selectedProduct.profitPct.toFixed(1)}%` : '—'}
                        </p>
                      </div>
                      <div>
                        <p style={{ fontSize:'8px', color:'#555', margin:'0 0 2px' }}>Compare At</p>
                        <p style={{ fontSize:'16px', color:'#888', fontWeight:700, margin:0 }}>{selectedProduct.compareAt > 0 ? `$${selectedProduct.compareAt.toFixed(2)}` : '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Competitor Prices */}
                  {selectedProduct.sellPrice > 0 && (
                    <div style={{ background:'#0a0a0a', borderRadius:'12px', padding:'14px', border:'1px solid #f59e0b22', marginBottom:'16px' }}>
                      <p style={{ fontSize:'8px', color:'#f59e0b', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 10px' }}>Competitor Prices</p>
                      <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                        {[
                          { name: 'Amazon', price: selectedProduct.competitorPrices?.amazon, color: '#f59e0b', mult: '1.85×' },
                          { name: 'Costco', price: selectedProduct.competitorPrices?.costco, color: '#ef4444', mult: '1.82×' },
                          { name: 'eBay', price: selectedProduct.competitorPrices?.ebay, color: '#8b5cf6', mult: '1.90×' },
                          { name: 'Sam\'s Club', price: selectedProduct.competitorPrices?.sams, color: '#06b6d4', mult: '1.80×' },
                        ].map(c => (
                          <div key={c.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 10px', background:'#111', borderRadius:'8px', border:'1px solid #1a1a2e' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                              <span style={{ width:8, height:8, borderRadius:'999px', background: c.color }} />
                              <span style={{ fontSize:'11px', color:'#ccc', fontWeight:500 }}>{c.name}</span>
                              <span style={{ fontSize:'8px', color:'#444' }}>{c.mult}</span>
                            </div>
                            <div style={{ textAlign:'right' }}>
                              <span style={{ fontSize:'13px', color: c.color, fontWeight:700 }}>{c.price ? `$${c.price.toFixed(2)}` : '—'}</span>
                              {c.price > 0 && selectedProduct.sellPrice > 0 && (
                                <span style={{ fontSize:'9px', color:'#555', marginLeft:'6px' }}>
                                  Save {((1 - selectedProduct.sellPrice / c.price) * 100).toFixed(0)}%
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop:'8px', padding:'8px 10px', background:'#16a34a11', borderRadius:'8px', border:'1px solid #16a34a22', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:'11px', color:'#16a34a', fontWeight:700 }}>✓ Your Price (Best)</span>
                        <span style={{ fontSize:'14px', color:'#16a34a', fontWeight:800 }}>${selectedProduct.sellPrice.toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  {/* Shopify status */}
                  <div style={{ background:'#0a0a0a', borderRadius:'12px', padding:'14px', border:'1px solid #1a1a2e', marginBottom:'16px' }}>
                    <p style={{ fontSize:'8px', color:'#555', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 10px' }}>Shopify</p>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                      <div>
                        <p style={{ fontSize:'8px', color:'#555', margin:'0 0 2px' }}>Synced</p>
                        <p style={{ fontSize:'12px', fontWeight:600, margin:0,
                          color: selectedProduct.shopifyStatus === 'pushed' ? '#16a34a' : selectedProduct.shopifyStatus === 'failed' ? '#ef4444' : '#555'
                        }}>{selectedProduct.shopifyStatus === 'pushed' ? 'Yes ✅' : selectedProduct.shopifyStatus === 'failed' ? 'Failed ❌' : 'No'}</p>
                      </div>
                      <div>
                        <p style={{ fontSize:'8px', color:'#555', margin:'0 0 2px' }}>Stock</p>
                        <p style={{ fontSize:'12px', fontWeight:600, margin:0,
                          color: selectedProduct.stockStatus === 'In Stock' ? '#16a34a' : '#ef4444'
                        }}>{selectedProduct.stockStatus}</p>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {selectedProduct.description && (
                    <div style={{ marginBottom:'16px' }}>
                      <p style={{ fontSize:'8px', color:'#555', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 6px' }}>Description</p>
                      <p style={{ fontSize:'10px', color:'#888', margin:0, lineHeight:'1.5' }}>{selectedProduct.description}</p>
                    </div>
                  )}

                  {/* Timestamps */}
                  <div style={{ marginBottom:'16px' }}>
                    <p style={{ fontSize:'8px', color:'#555', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 6px' }}>Timestamps</p>
                    <p style={{ fontSize:'10px', color:'#555', margin:0 }}>
                      Last Checked: {selectedProduct.dateChecked || 'Never'}
                    </p>
                  </div>

                  {/* Google Feed Health — AI-powered compliance breakdown */}
                  <div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
                      <p style={{ fontSize:'8px', color:'#3b82f6', textTransform:'uppercase', letterSpacing:'1px', margin:0, fontWeight:700 }}>Google Feed Health</p>
                      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                        <span style={{ fontSize:'18px', fontWeight:800, color: (selectedProduct.feedScore || 0) >= 80 ? '#16a34a' : (selectedProduct.feedScore || 0) >= 50 ? '#f59e0b' : '#ef4444' }}>
                          {selectedProduct.feedScore || 0}
                        </span>
                        <span style={{ fontSize:'9px', color:'#555' }}>/100</span>
                        <button onClick={() => askAI(selectedProduct)} style={{ padding:'3px 8px', borderRadius:'6px', border:'none', background:'#3b82f6', color:'#fff', fontSize:'8px', fontWeight:700, cursor:'pointer', marginLeft:'4px' }}>
                          🤖 Full AI Audit
                        </button>
                      </div>
                    </div>

                    {/* Gate results — each failing gate has a "Fix with AI" button */}
                    <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                      {Object.entries(selectedProduct.gates).map(([gate, status]) => {
                        const gateInfo: Record<string, { label: string; severity: string }> = {
                          title: { label: 'Product Title', severity: 'Critical' },
                          image: { label: 'Product Images', severity: 'Critical' },
                          price: { label: 'Product Price', severity: 'Critical' },
                          asin: { label: 'ASIN / MPN', severity: 'Major' },
                          description: { label: 'Description', severity: 'Major' },
                          googleCategory: { label: 'Google Category', severity: 'Major' },
                          titleLength: { label: 'Title Compliance', severity: 'Major' },
                          descClean: { label: 'Description Quality', severity: 'Critical' },
                          barcode: { label: 'GTIN / Barcode', severity: 'Major' },
                          identifier: { label: 'Product Identifier', severity: 'Critical' },
                        };
                        const info = gateInfo[gate] || { label: gate, severity: 'Info' };
                        const statusColor = status === 'pass' ? '#16a34a' : status === 'warn' ? '#f59e0b' : '#ef4444';
                        const statusBg = status === 'pass' ? 'rgba(22,163,74,0.06)' : status === 'warn' ? 'rgba(245,158,11,0.06)' : 'rgba(239,68,68,0.06)';
                        const statusIcon = status === 'pass' ? '✅' : status === 'warn' ? '⚠️' : '❌';

                        return (
                          <div key={gate} style={{ background: statusBg, borderRadius:'6px', padding:'6px 8px', border:`1px solid ${statusColor}15` }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                                <span style={{ fontSize:'10px' }}>{statusIcon}</span>
                                <span style={{ fontSize:'9px', fontWeight:600, color: statusColor }}>{info.label}</span>
                                <span style={{ fontSize:'7px', padding:'1px 4px', borderRadius:'3px', background:'#ffffff08', color:'#555' }}>{info.severity}</span>
                              </div>
                              <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                                <span style={{ fontSize:'8px', fontWeight:700, color: statusColor, textTransform:'uppercase' }}>{status}</span>
                                {status !== 'pass' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); askAI(selectedProduct, gate, status); }}
                                    style={{ padding:'2px 6px', borderRadius:'4px', border:'none', background:'#3b82f6', color:'#fff', fontSize:'7px', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}
                                  >
                                    🤖 Fix with AI
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Feed Bot slide-out panel — AI agent for real-time fix suggestions */}
        {botOpen && (
          <div style={{ position:'fixed', right:0, top:0, height:'100vh', width:380, borderLeft:'1px solid #1a1a2e', background:'#fff', boxShadow:'-4px 0 30px rgba(0,0,0,0.3)', zIndex:10000, display:'flex', flexDirection:'column' }}>
            <FeedBotPanel
              productContext={botContext}
              initialPrompt={botPrompt}
              onClose={() => { setBotOpen(false); setBotPrompt(null); setBotContext(null); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
