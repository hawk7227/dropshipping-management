/**
 * POST /api/converter
 *
 * Accepts a Shopify/Matrixify product export + the eBay Seller Hub Reports
 * template (.xlsx), injects product data into the "Listings" sheet, and
 * returns the filled template as .xlsx — ready for eBay upload.
 *
 * Uses SheetJS (xlsx) which is already installed. No extra dependencies.
 *
 * Body: multipart/form-data
 *   - file:       Shopify product export (.xlsx or .csv)
 *   - template:   eBay category listing template (.xlsx)
 *   - settings:   JSON string of ConversionSettings
 */

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';

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

interface ProductData {
  sku: string;
  categoryName: string;
  title: string;
  epid: string;
  price: string;
  quantity: string;
  imageUrl: string;
  conditionId: string;
  description: string;
  format: string;
  duration: string;
  bestOffer: string;
  location: string;
  shippingProfile: string;
  returnProfile: string;
  paymentProfile: string;
  cType: string;
  manufacturer: string;
}

const DEFAULT_SETTINGS: ConversionSettings = {
  defaultQuantity: 1,
  conditionId: '1000',
  format: 'FixedPrice',
  duration: 'GTC',
  location: 'Scottsdale, AZ 85260',
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

// ═════════════════════════════════════════════════════════════════════
// TAG FREQUENCY + CATEGORY EXTRACTION
// ═════════════════════════════════════════════════════════════════════

const META_TAGS = new Set(['categorized', 'uncategorized', 'test']);

function buildTagFrequency(rows: ShopifyRow[]): Map<string, number> {
  const freq = new Map<string, number>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (row['Top Row'] !== 1 || !row.Tags || typeof row.Tags !== 'string') continue;
    const handle = row.Handle ?? '';
    if (seen.has(handle)) continue;
    seen.add(handle);
    for (const raw of row.Tags.split(',')) {
      const t = raw.trim();
      if (t && !META_TAGS.has(t.toLowerCase())) freq.set(t, (freq.get(t) ?? 0) + 1);
    }
  }
  return freq;
}

function extractCategoryFromTags(tags: unknown, tagFreq: Map<string, number>): string {
  if (!tags || typeof tags !== 'string') return '';
  const cleaned = tags.split(',').map((t) => t.trim()).filter((t) => t && !META_TAGS.has(t.toLowerCase()));
  if (cleaned.length === 0) return '';
  return cleaned.reduce((best, t) => (tagFreq.get(t) ?? 0) < (tagFreq.get(best) ?? 0) ? t : best);
}

// ═════════════════════════════════════════════════════════════════════
// CONVERT SHOPIFY ROWS → PRODUCT DATA
// ═════════════════════════════════════════════════════════════════════

function convertShopifyProducts(
  shopifyRows: ShopifyRow[],
  settings: ConversionSettings
): { products: ProductData[]; totalProducts: number; skippedNoSku: number; skippedNoTitle: number } {
  const tagFreq = buildTagFrequency(shopifyRows);
  const grouped = new Map<string, ShopifyRow[]>();
  for (const row of shopifyRows) {
    if (!row.Handle) continue;
    if (!grouped.has(row.Handle)) grouped.set(row.Handle, []);
    grouped.get(row.Handle)!.push(row);
  }

  const products: ProductData[] = [];
  let skippedNoSku = 0, skippedNoTitle = 0;

  for (const [, rows] of grouped) {
    const parent = rows.find((r) => r['Top Row'] === 1) ?? rows[0];
    if (!parent['Variant SKU']) { skippedNoSku++; continue; }
    if (!parent.Title) { skippedNoTitle++; continue; }

    const images = rows
      .filter((r) => r['Image Src'])
      .sort((a, b) => Number(a['Image Position'] ?? 999) - Number(b['Image Position'] ?? 999))
      .map((r) => String(r['Image Src']))
      .slice(0, 12);

    const barcode = cleanBarcode(parent['Variant Barcode']);
    const price = computePrice(parent, settings);
    const qty = parent['Total Inventory Qty'] && Number(parent['Total Inventory Qty']) > 0
      ? String(parent['Total Inventory Qty']) : String(settings.defaultQuantity);

    products.push({
      sku: String(parent['Variant SKU']),
      categoryName: extractCategoryFromTags(parent.Tags, tagFreq),
      title: truncateTitle(parent.Title),
      epid: (barcode.length === 12 || barcode.length === 13) ? barcode : '',
      price, quantity: qty,
      imageUrl: images.join('|'),
      conditionId: settings.conditionId,
      description: parent['Body HTML'] ?? '',
      format: settings.format, duration: settings.duration,
      bestOffer: settings.bestOfferEnabled ? '1' : '',
      location: settings.location,
      shippingProfile: settings.shippingProfileName,
      returnProfile: settings.returnProfileName,
      paymentProfile: settings.paymentProfileName,
      cType: barcode.length === 12 ? 'UPC' : barcode.length === 13 ? 'EAN' : '',
      manufacturer: parent.Vendor ?? '',
    });
  }

  return { products, totalProducts: grouped.size, skippedNoSku, skippedNoTitle };
}

// ═════════════════════════════════════════════════════════════════════
// INJECT PRODUCTS INTO EBAY TEMPLATE
// ═════════════════════════════════════════════════════════════════════

/**
 * eBay template "Listings" sheet layout:
 *   Row 1-3:  #INFO metadata rows
 *   Row 4:    Column headers
 *   Row 5+:   Data rows (row 5 has a VLOOKUP formula in col C)
 *
 * Column mapping (from row 4):
 *   A = *Action           B = Custom label (SKU)   C = Category ID (formula)
 *   D = Category name     E = Title                I = P:EPID
 *   J = Start price       K = Quantity             L = Item photo URL
 *   N = Condition ID      O = Description          P = Format
 *   Q = Duration          S = Best Offer Enabled   W = Location
 *   AI = Shipping profile AJ = Return profile      AK = Payment profile
 *   AN = C:Type           AS = Manufacturer Name
 */
function injectIntoTemplate(templateBuffer: Buffer, products: ProductData[]): Buffer {
  // Read the template workbook — preserve everything
  const wb = XLSX.read(templateBuffer, { type: 'buffer', cellFormula: true, cellStyles: true });

  // Find the Listings sheet
  const listingsName = wb.SheetNames.find((n) => n === 'Listings') ?? wb.SheetNames[1];
  const ws = wb.Sheets[listingsName];
  if (!ws) throw new Error('Could not find Listings sheet in eBay template');

  // Column letter helper (handles AA, AB, etc.)
  function colIdx(col: string): number {
    let idx = 0;
    for (let i = 0; i < col.length; i++) {
      idx = idx * 26 + (col.charCodeAt(i) - 64);
    }
    return idx - 1; // 0-based
  }

  // Set a cell value (string)
  function setCell(col: string, row: number, value: string) {
    if (!value) return;
    const ref = `${col}${row}`;
    ws[ref] = { t: 's', v: value };
  }

  // Set a cell value (number)
  function setNumCell(col: string, row: number, value: string) {
    if (!value) return;
    const ref = `${col}${row}`;
    ws[ref] = { t: 'n', v: Number(value) };
  }

  // Inject each product starting at row 5
  for (let i = 0; i < products.length; i++) {
    const row = i + 5;
    const p = products[i];

    setCell('A', row, 'Add');
    setCell('B', row, p.sku);
    // C = Category ID — keep the existing VLOOKUP formula if present,
    // or add one that references the Category name in column D
    const cRef = `C${row}`;
    if (!ws[cRef] || !ws[cRef].f) {
      ws[cRef] = {
        t: 'str',
        f: `IF(NOT(ISBLANK(D${row})), VLOOKUP(D${row},Categories!$A$2:$B$51,2,FALSE), "")`,
        v: '',
      };
    }
    setCell('D', row, p.categoryName);
    setCell('E', row, p.title);
    setCell('I', row, p.epid);
    setNumCell('J', row, p.price);
    setNumCell('K', row, p.quantity);
    setCell('L', row, p.imageUrl);
    setNumCell('N', row, p.conditionId);
    setCell('O', row, p.description);
    setCell('P', row, p.format);
    setCell('Q', row, p.duration);
    if (p.bestOffer) setCell('S', row, p.bestOffer);
    setCell('W', row, p.location);
    setCell('AI', row, p.shippingProfile);
    setCell('AJ', row, p.returnProfile);
    setCell('AK', row, p.paymentProfile);
    setCell('AN', row, p.cType);
    setCell('AS', row, p.manufacturer);
  }

  // Update the sheet range to include all injected rows
  const lastRow = Math.max(products.length + 4, 100000);
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:BM100000');
  range.e.r = lastRow - 1;
  ws['!ref'] = XLSX.utils.encode_range(range);

  // Write back to buffer
  const output = XLSX.write(wb, {
    type: 'buffer',
    bookType: 'xlsx',
    cellFormula: true,
  });

  return Buffer.from(output);
}

// ═════════════════════════════════════════════════════════════════════
// ROUTE HANDLER
// ═════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const templateFile = formData.get('template') as File | null;
    const settingsJson = formData.get('settings') as string | null;

    if (!file) return NextResponse.json({ error: 'No product file uploaded' }, { status: 400 });
    if (!templateFile) return NextResponse.json({ error: 'No eBay template uploaded. Download your template from Seller Hub and upload it here.' }, { status: 400 });

    const settings: ConversionSettings = settingsJson
      ? { ...DEFAULT_SETTINGS, ...JSON.parse(settingsJson) }
      : DEFAULT_SETTINGS;

    // Read product data
    const buffer = Buffer.from(await file.arrayBuffer());
    let rows: ShopifyRow[];

    if (file.name.endsWith('.csv')) {
      rows = parseCsv(buffer.toString('utf-8'));
    } else {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames.find((n: string) => n.toLowerCase() === 'products') ?? workbook.SheetNames[0];
      rows = XLSX.utils.sheet_to_json<ShopifyRow>(workbook.Sheets[sheetName], { defval: null });
    }

    // Convert
    const result = convertShopifyProducts(rows, settings);

    // Read template and inject
    const templateBuffer = Buffer.from(await templateFile.arrayBuffer());
    const outputBuffer = injectIntoTemplate(templateBuffer, result.products);

    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="ebay-upload-${Date.now()}.xlsx"`,
        'X-Total-Products': String(result.totalProducts),
        'X-Converted': String(result.products.length),
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
// CSV PARSER
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
      if (val !== null && val !== '' && !isNaN(Number(val)) &&
          (h.includes('Price') || h.includes('Qty') || h === 'Top Row' || h.includes('Position')))
        row[h] = Number(val);
      else row[h] = val;
    });
    rows.push(row as unknown as ShopifyRow);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else current += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { result.push(current); current = ''; }
    else current += c;
  }
  result.push(current);
  return result;
}
