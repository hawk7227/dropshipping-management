/**
 * Shopify → eBay File Exchange Converter
 *
 * Converts a Matrixify / Shopify product export (master_import_8k_products style)
 * into the eBay Seller Hub Reports "category listing template" format.
 *
 * Key behaviours
 * ─────────────────────────────────────────────────────────────────────
 * • Only "top rows" (Top Row === 1) are treated as products.
 *   Additional rows for the same Handle are image-only rows and get
 *   pipe-joined into the parent's Item photo URL field.
 * • Barcodes that start with an apostrophe (Shopify text-prefix) have
 *   it stripped so eBay receives a clean numeric UPC / EAN.
 * • HTML descriptions are passed through as-is (eBay accepts HTML).
 * • Quantity defaults to 1 when the source shows 0 (common for
 *   drop-ship / AutoDS stores that manage stock externally).
 * • ConditionID 1000 = "New" (default for drop-ship inventory).
 */

// ── eBay template columns (sheet 2, row 4) ──────────────────────────
export const EBAY_COLUMNS = [
  '*Action(SiteID=US|Country=US|Currency=USD|Version=1193)',
  'Custom label (SKU)',
  'Category ID',
  'Category name',
  'Title',
  'Relationship',
  'Relationship details',
  'Schedule Time',
  'P:EPID',
  'Start price',
  'Quantity',
  'Item photo URL',
  'VideoID',
  'Condition ID',
  'Description',
  'Format',
  'Duration',
  'Buy It Now price',
  'Best Offer Enabled',
  'Best Offer Auto Accept Price',
  'Minimum Best Offer Price',
  'Immediate pay required',
  'Location',
  'Shipping service 1 option',
  'Shipping service 1 cost',
  'Shipping service 1 priority',
  'Shipping service 2 option',
  'Shipping service 2 cost',
  'Shipping service 2 priority',
  'Max dispatch time',
  'Returns accepted option',
  'Returns within option',
  'Refund option',
  'Return shipping cost paid by',
  'Shipping profile name',
  'Return profile name',
  'Payment profile name',
  'ProductCompliancePolicyID',
  'Regional ProductCompliancePolicies',
  'C:Type',
  'Product Safety Pictograms',
  'Product Safety Statements',
  'Product Safety Component',
  'Regulatory Document Ids',
  'Manufacturer Name',
  'Manufacturer AddressLine1',
  'Manufacturer AddressLine2',
  'Manufacturer City',
  'Manufacturer Country',
  'Manufacturer PostalCode',
  'Manufacturer StateOrProvince',
  'Manufacturer Phone',
  'Manufacturer Email',
  'Manufacturer ContactURL',
  'Responsible Person 1',
  'Responsible Person 1 Type',
  'Responsible Person 1 AddressLine1',
  'Responsible Person 1 AddressLine2',
  'Responsible Person 1 City',
  'Responsible Person 1 Country',
  'Responsible Person 1 PostalCode',
  'Responsible Person 1 StateOrProvince',
  'Responsible Person 1 Phone',
  'Responsible Person 1 Email',
  'Responsible Person 1 ContactURL',
] as const;

export type EbayRow = Record<(typeof EBAY_COLUMNS)[number], string>;

// ── Shopify row shape (only the columns we actually read) ───────────
export interface ShopifyRow {
  Handle: string;
  Title: string;
  'Body HTML': string;
  Vendor: string;
  Tags: string;
  'Top Row': number | null;
  'Image Src': string;
  'Image Position': number | null;
  'Variant SKU': string;
  'Variant Barcode': string;
  'Variant Price': number | null;
  'Variant Compare At Price': number | null;
  'Total Inventory Qty': number | null;
  'Option1 Name': string;
  'Option1 Value': string;
  'Option2 Name': string;
  'Option2 Value': string;
  [key: string]: unknown;
}

// ── Conversion settings ─────────────────────────────────────────────
export interface ConversionSettings {
  defaultQuantity: number;
  conditionId: string;
  format: 'FixedPrice' | 'Auction';
  duration: 'GTC' | '3' | '5' | '7' | '10' | '30';
  location: string;
  shippingProfileName: string;
  returnProfileName: string;
  paymentProfileName: string;
  bestOfferEnabled: boolean;
  priceSource: 'variantPrice' | 'compareAtPrice';
  priceMarkupPercent: number;
}

export const DEFAULT_SETTINGS: ConversionSettings = {
  defaultQuantity: 1,
  conditionId: '1000',
  format: 'FixedPrice',
  duration: 'GTC',
  location: '',
  shippingProfileName: '',
  returnProfileName: '',
  paymentProfileName: '',
  bestOfferEnabled: false,
  priceSource: 'variantPrice',
  priceMarkupPercent: 0,
};

// ── Helpers ─────────────────────────────────────────────────────────

function cleanBarcode(raw: unknown): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  return s.startsWith("'") ? s.slice(1) : s;
}

function truncateTitle(title: string): string {
  if (!title) return '';
  // eBay max title length is 80 characters
  return title.length > 80 ? title.slice(0, 80) : title;
}

/**
 * Build a frequency map of all tags across all products.
 * Broad parent categories ("Beauty & Personal Care") appear on thousands
 * of products while leaf categories ("Lip Glosses") appear on very few.
 */
function buildTagFrequency(rows: ShopifyRow[]): Map<string, number> {
  const META_TAGS = new Set(['categorized', 'uncategorized', 'test']);
  const freq = new Map<string, number>();
  const seen = new Set<string>();

  for (const row of rows) {
    if (row['Top Row'] !== 1 || !row.Tags || typeof row.Tags !== 'string') continue;
    const handle = row.Handle ?? '';
    if (seen.has(handle)) continue;
    seen.add(handle);

    for (const raw of row.Tags.split(',')) {
      const t = raw.trim();
      if (t && !META_TAGS.has(t.toLowerCase())) {
        freq.set(t, (freq.get(t) ?? 0) + 1);
      }
    }
  }
  return freq;
}

/**
 * Extract the most specific category from Tags using tag frequency.
 * The least common tag is the most specific (leaf-level) category.
 */
function extractCategoryFromTags(tags: unknown, tagFreq: Map<string, number>): string {
  if (!tags || typeof tags !== 'string') return '';
  const META_TAGS = new Set(['categorized', 'uncategorized', 'test']);
  const cleaned = tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t && !META_TAGS.has(t.toLowerCase()));
  if (cleaned.length === 0) return '';
  return cleaned.reduce((best, t) =>
    (tagFreq.get(t) ?? 0) < (tagFreq.get(best) ?? 0) ? t : best
  );
}

function computePrice(row: ShopifyRow, settings: ConversionSettings): string {
  const raw =
    settings.priceSource === 'compareAtPrice'
      ? row['Variant Compare At Price'] ?? row['Variant Price']
      : row['Variant Price'];
  if (raw == null || isNaN(Number(raw))) return '';
  let price = Number(raw);
  if (settings.priceMarkupPercent !== 0) {
    price = price * (1 + settings.priceMarkupPercent / 100);
  }
  return price.toFixed(2);
}

// ── Core converter ──────────────────────────────────────────────────

export interface ConversionResult {
  rows: EbayRow[];
  totalProducts: number;
  skippedNoSku: number;
  skippedNoTitle: number;
}

export function convertShopifyToEbay(
  shopifyRows: ShopifyRow[],
  settings: ConversionSettings = DEFAULT_SETTINGS
): ConversionResult {
  // First pass: build tag frequency for smart category extraction
  const tagFreq = buildTagFrequency(shopifyRows);

  // Group rows by Handle to consolidate images
  const grouped = new Map<string, ShopifyRow[]>();
  for (const row of shopifyRows) {
    const handle = row.Handle;
    if (!handle) continue;
    if (!grouped.has(handle)) grouped.set(handle, []);
    grouped.get(handle)!.push(row);
  }

  const ebayRows: EbayRow[] = [];
  let skippedNoSku = 0;
  let skippedNoTitle = 0;

  for (const [, rows] of grouped) {
    // Find the top/parent row
    const parent = rows.find((r) => r['Top Row'] === 1) ?? rows[0];

    if (!parent['Variant SKU']) {
      skippedNoSku++;
      continue;
    }
    if (!parent.Title) {
      skippedNoTitle++;
      continue;
    }

    // Collect all image URLs (pipe-separated for eBay, max 12)
    const images = rows
      .filter((r) => r['Image Src'])
      .sort((a, b) => {
        const pa = Number(a['Image Position'] ?? 999);
        const pb = Number(b['Image Position'] ?? 999);
        return pa - pb;
      })
      .map((r) => r['Image Src'] as string)
      .slice(0, 12);

    const imageUrl = images.join('|');

    const barcode = cleanBarcode(parent['Variant Barcode']);
    const price = computePrice(parent, settings);
    const qty =
      parent['Total Inventory Qty'] && Number(parent['Total Inventory Qty']) > 0
        ? String(parent['Total Inventory Qty'])
        : String(settings.defaultQuantity);

    // Build the eBay row
    const ebayRow: Record<string, string> = {};
    for (const col of EBAY_COLUMNS) {
      ebayRow[col] = '';
    }

    ebayRow['*Action(SiteID=US|Country=US|Currency=USD|Version=1193)'] = 'Add';
    ebayRow['Custom label (SKU)'] = String(parent['Variant SKU']);
    ebayRow['Category name'] = extractCategoryFromTags(parent.Tags, tagFreq);
    ebayRow['Title'] = truncateTitle(parent.Title);
    ebayRow['Start price'] = price;
    ebayRow['Quantity'] = qty;
    ebayRow['Item photo URL'] = imageUrl;
    ebayRow['Condition ID'] = settings.conditionId;
    ebayRow['Description'] = parent['Body HTML'] ?? '';
    ebayRow['Format'] = settings.format;
    ebayRow['Duration'] = settings.duration;
    ebayRow['Location'] = settings.location;
    ebayRow['Shipping profile name'] = settings.shippingProfileName;
    ebayRow['Return profile name'] = settings.returnProfileName;
    ebayRow['Payment profile name'] = settings.paymentProfileName;
    ebayRow['Manufacturer Name'] = parent.Vendor ?? '';

    if (settings.bestOfferEnabled) {
      ebayRow['Best Offer Enabled'] = '1';
    }

    // UPC goes into C:Type / P:EPID depending on whether it's a UPC
    if (barcode.length === 12 || barcode.length === 13) {
      ebayRow['P:EPID'] = barcode;
      ebayRow['C:Type'] = barcode.length === 12 ? 'UPC' : 'EAN';
    }

    ebayRows.push(ebayRow as EbayRow);
  }

  return {
    rows: ebayRows,
    totalProducts: grouped.size,
    skippedNoSku,
    skippedNoTitle,
  };
}

// ── CSV generator (eBay File Exchange format) ───────────────────────

export function toEbayCsv(rows: EbayRow[]): string {
  const header = EBAY_COLUMNS.join(',');
  const dataLines = rows.map((row) =>
    EBAY_COLUMNS.map((col) => {
      const val = row[col] ?? '';
      // Escape for CSV: wrap in quotes if contains comma, quote, or newline
      if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('|')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(',')
  );
  return [header, ...dataLines].join('\n');
}
