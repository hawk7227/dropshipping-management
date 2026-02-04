/**
 * POST /api/converter
 *
 * Accepts a Shopify/Matrixify product export (.xlsx or .csv),
 * converts it to eBay Seller Hub Reports (File Exchange) format,
 * and returns the result as a downloadable CSV.
 *
 * Body: multipart/form-data
 *   - file:     the upload (.xlsx or .csv)
 *   - settings: JSON string of ConversionSettings (optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';

// ═════════════════════════════════════════════════════════════════════
// EBAY TEMPLATE COLUMNS (matches your eBay category listing template)
// ═════════════════════════════════════════════════════════════════════

const EBAY_COLUMNS = [
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

// ═════════════════════════════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════════════════════════════

interface ConversionSettings {
  defaultQuantity: number;
  conditionId: string;
  format: 'FixedPrice' | 'Auction';
  duration: string;
  location: string;
  shippingProfileName: string;
  returnProfileName: string;
  paymentProfileName: string;
  bestOfferEnabled: boolean;
  priceSource: 'variantPrice' | 'compareAtPrice';
  priceMarkupPercent: number;
}

interface ShopifyRow {
  Handle?: string;
  Title?: string;
  'Body HTML'?: string;
  Vendor?: string;
  Tags?: string;
  'Top Row'?: number | null;
  'Image Src'?: string;
  'Image Position'?: number | null;
  'Variant SKU'?: string;
  'Variant Barcode'?: string;
  'Variant Price'?: number | null;
  'Variant Compare At Price'?: number | null;
  'Total Inventory Qty'?: number | null;
  [key: string]: unknown;
}

type EbayRow = Record<string, string>;

const DEFAULT_SETTINGS: ConversionSettings = {
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

// ═════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════

function cleanBarcode(raw: unknown): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  return s.startsWith("'") ? s.slice(1) : s;
}

function truncateTitle(title: string): string {
  if (!title) return '';
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
  const seen = new Set<string>(); // track per-handle to avoid image rows inflating counts

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
  // Pick the least frequent tag → most specific category
  return cleaned.reduce((best, t) =>
    (tagFreq.get(t) ?? 0) < (tagFreq.get(best) ?? 0) ? t : best
  );
}

function computePrice(row: ShopifyRow, settings: ConversionSettings): string {
  const raw =
    settings.priceSource === 'compareAtPrice'
      ? (row['Variant Compare At Price'] ?? row['Variant Price'])
      : row['Variant Price'];
  if (raw == null || isNaN(Number(raw))) return '';
  let price = Number(raw);
  if (settings.priceMarkupPercent !== 0) {
    price = price * (1 + settings.priceMarkupPercent / 100);
  }
  return price.toFixed(2);
}

function escapeCsvField(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('|')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

// ═════════════════════════════════════════════════════════════════════
// CORE CONVERTER
// ═════════════════════════════════════════════════════════════════════

function convertShopifyToEbay(
  shopifyRows: ShopifyRow[],
  settings: ConversionSettings
): { rows: EbayRow[]; totalProducts: number; skippedNoSku: number; skippedNoTitle: number } {
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
    const parent = rows.find((r) => r['Top Row'] === 1) ?? rows[0];

    if (!parent['Variant SKU']) {
      skippedNoSku++;
      continue;
    }
    if (!parent.Title) {
      skippedNoTitle++;
      continue;
    }

    const images = rows
      .filter((r) => r['Image Src'])
      .sort((a, b) => Number(a['Image Position'] ?? 999) - Number(b['Image Position'] ?? 999))
      .map((r) => String(r['Image Src']))
      .slice(0, 12);

    const imageUrl = images.join('|');
    const barcode = cleanBarcode(parent['Variant Barcode']);
    const price = computePrice(parent, settings);

    const qty =
      parent['Total Inventory Qty'] && Number(parent['Total Inventory Qty']) > 0
        ? String(parent['Total Inventory Qty'])
        : String(settings.defaultQuantity);

    const ebayRow: EbayRow = {};
    for (const col of EBAY_COLUMNS) ebayRow[col] = '';

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

    if (settings.bestOfferEnabled) ebayRow['Best Offer Enabled'] = '1';

    if (barcode.length === 12 || barcode.length === 13) {
      ebayRow['P:EPID'] = barcode;
      ebayRow['C:Type'] = barcode.length === 12 ? 'UPC' : 'EAN';
    }

    ebayRows.push(ebayRow);
  }

  return { rows: ebayRows, totalProducts: grouped.size, skippedNoSku, skippedNoTitle };
}

// ═════════════════════════════════════════════════════════════════════
// CSV GENERATOR
// ═════════════════════════════════════════════════════════════════════

function toEbayCsv(rows: EbayRow[]): string {
  const header = EBAY_COLUMNS.map((c) => escapeCsvField(c)).join(',');
  const dataLines = rows.map((row) =>
    EBAY_COLUMNS.map((col) => escapeCsvField(row[col] ?? '')).join(',')
  );
  return [header, ...dataLines].join('\n');
}

// ═════════════════════════════════════════════════════════════════════
// ROUTE HANDLER
// ═════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const settingsJson = formData.get('settings') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const settings: ConversionSettings = settingsJson
      ? { ...DEFAULT_SETTINGS, ...JSON.parse(settingsJson) }
      : DEFAULT_SETTINGS;

    const buffer = Buffer.from(await file.arrayBuffer());
    let rows: ShopifyRow[];

    if (file.name.endsWith('.csv')) {
      const text = buffer.toString('utf-8');
      rows = parseCsv(text);
    } else {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName =
        workbook.SheetNames.find((n: string) => n.toLowerCase() === 'products') ??
        workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json<ShopifyRow>(sheet, { defval: null });
    }

    const result = convertShopifyToEbay(rows, settings);
    const csv = toEbayCsv(result.rows);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ebay-upload-${Date.now()}.csv"`,
        'X-Total-Products': String(result.totalProducts),
        'X-Converted': String(result.rows.length),
        'X-Skipped-No-SKU': String(result.skippedNoSku),
        'X-Skipped-No-Title': String(result.skippedNoTitle),
      },
    });
  } catch (err) {
    console.error('[converter] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Conversion failed' },
      { status: 500 }
    );
  }
}

// ═════════════════════════════════════════════════════════════════════
// CSV PARSER (for .csv uploads)
// ═════════════════════════════════════════════════════════════════════

function parseCsv(text: string): ShopifyRow[] {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: ShopifyRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      const val = values[idx] ?? null;
      if (
        val !== null && val !== '' && !isNaN(Number(val)) &&
        (h.includes('Price') || h.includes('Qty') || h === 'Top Row' || h.includes('Position'))
      ) {
        row[h] = Number(val);
      } else {
        row[h] = val;
      }
    });
    rows.push(row as unknown as ShopifyRow);
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
