// ═══ DELIVERY ENVELOPE ═══
// FILE: lib/pipeline/map.ts
// LINES: ~95
// IMPORTS FROM: None (pure function, no type imports needed — returns Record<string, string|null>)
// EXPORTS TO: lib/pipeline/clean.ts, lib/pipeline/index.ts
// DOES: Maps raw column headers to semantic field names. Handles 80+ column name variations across Matrixify, Shopify CSV, AutoDS, eBay, and generic formats. Also auto-detects ASIN columns by scanning cell values when header-based detection fails.
// DOES NOT: Extract data from cells. Clean values. Validate products. Run gates.
// BREAKS IF: All headers are unrecognizable (returns all nulls — safe, produces empty products).
// ASSUMES: Headers are the raw string keys from SheetJS sheet_to_json.
// LEVEL: 3 — Integrated. Single-responsibility. The mapper doesn't know what happens after it.
// VERIFIED: AI self-check. Tested against known Matrixify headers: Handle, Title, Body HTML, Vendor, Image Src, Variant Price, Variant Barcode, etc.
// ═══════════════════════════════════════════════════════════

export type ColumnMap = Record<string, string | null>;

export function mapColumns(headers: string[]): ColumnMap {
  const h = headers.map(x => (x || '').toLowerCase().trim());
  const map: ColumnMap = {};

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

  // Identity
  map.title = find(['title', 'product title', 'product name', 'item name', 'name', 'listing title'], ['option', 'meta', 'alt', 'type', 'id', 'code', 'sku']);
  map.asin = find(['variant sku', 'sku', 'asin', 'amazon asin', 'source_product_id', 'item number', 'product id'], ['image', 'order']);
  map.handle = find(['handle', 'slug', 'url handle']);
  map.barcode = find(['variant barcode', 'barcode', 'gtin', 'upc', 'ean', 'isbn']);

  // Pricing
  map.cost = find(['cost', 'source cost', 'amazon cost', 'unit cost', 'buy cost', 'purchase price', 'wholesale', 'supplier price', 'source price'], ['costco']);
  map.sellPrice = find(['sell price', 'selling price', 'our price', 'retail price', 'listed price']);
  map.price = find(['variant price', 'price', 'sale price'], ['compare', 'cost', 'sell', 'source', 'buy', 'wholesale', 'supplier', 'amazon', 'costco', 'ebay', 'sam', 'market', 'retail']);
  map.compareAt = find(['variant compare at price', 'compare at price', 'compare_at_price', 'msrp', 'list price', 'compare at']);
  map.amazonPrice = find(['amazon $', 'amazon price', 'price_amazon'], ['cost', 'source']);
  map.costcoPrice = find(['costco $', 'costco price', 'price_costco']);
  map.ebayPrice = find(['ebay $', 'ebay price', 'price_ebay']);
  map.samsPrice = find(["sam's $", 'sams $', 'sams price', 'price_samsclub']);
  map.marketPrice = find(['market $', 'market price', 'market_price']);
  map.profitCol = find(['profit $', 'profit_dollar', 'profit'], ['%', 'pct', 'percent', 'margin']);
  map.profitPctCol = find(['profit %', 'profit_pct', 'margin %', 'margin'], []);

  // Media
  map.image = find(['image src', 'image_src', 'image url', 'image_url', 'main image', 'image link', 'photo', 'thumbnail'], ['type', 'command', 'position', 'width', 'height', 'alt', 'all']);
  map.allImages = find(['all images', 'all_images', 'additional images', 'image gallery', 'extra images']);

  // Content
  map.description = find(['body (html)', 'body html', 'body_html', 'description', 'product description', 'details', 'item description']);
  map.vendor = find(['vendor', 'brand', 'manufacturer', 'supplier', 'maker', 'brand name', 'sold by']);
  map.category = find(['product type', 'product_type', 'type', 'category', 'department'], ['image', 'variant', 'meta']);
  map.tags = find(['tags', 'keywords', 'labels']);

  // Inventory
  map.status = find(['status', 'listing status', 'product status'], ['inventory', 'stock', 'order']);
  map.quantity = find(['variant inventory qty', 'inventory', 'quantity', 'stock', 'total inventory qty', 'qty', 'available'], ['status', 'out']);
  map.stockStatus = find(['stock', 'stock status', 'availability', 'in stock'], ['qty', 'quantity', 'inventory']);

  // Metrics
  map.rating = find(['rating', 'star rating', 'stars', 'avg rating']);
  map.reviews = find(['reviews', 'review count', 'number of reviews']);
  map.bsr = find(['bsr', 'best seller rank', 'sales rank'], ['date', 'page']);

  // Google Merchant
  map.googleCategory = find(['google product category', 'google_product_category', 'mc-facebook.google_product_category', 'google category']);
  map.seoTitle = find(['title_tag', 'seo title', 'meta title', 'metafield: title_tag']);
  map.seoDescription = find(['description_tag', 'seo description', 'meta description', 'metafield: description_tag']);
  map.weight = find(['variant weight', 'weight', 'shipping weight'], ['unit']);

  // Matrixify dedup
  map.topRow = find(['top row']);

  return map;
}

// Fallback: scan cell values for ASIN patterns when header detection fails
export function autoDetectASINColumn(headers: string[], rows: Record<string, unknown>[]): string | null {
  const sample = rows.slice(0, 20);
  let bestCol: string | null = null;
  let bestScore = 0;
  for (const col of headers) {
    let hits = 0;
    for (const row of sample) {
      const val = String(row[col] ?? '').trim().replace(/['"]/g, '').toUpperCase();
      if (/^B[0-9A-Z]{9}$/.test(val)) hits++;
      else if (/\/dp\/([A-Z0-9]{10})/i.test(val)) hits++;
    }
    if (hits > bestScore) { bestScore = hits; bestCol = col; }
  }
  return bestScore >= Math.max(3, sample.length * 0.3) ? bestCol : null;
}
