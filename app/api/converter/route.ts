/**
 * POST /api/converter
 *
 * Accepts a Shopify/Matrixify product export (.xlsx or .csv),
 * converts it to eBay File Exchange format, and returns the
 * result as a downloadable CSV.
 *
 * Body: multipart/form-data
 *   - file:     the upload
 *   - settings: JSON string of ConversionSettings
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  convertShopifyToEbay,
  toEbayCsv,
  DEFAULT_SETTINGS,
  type ConversionSettings,
  type ShopifyRow,
} from '@/lib/ebay-converter';

export const runtime = 'nodejs';

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

    // Read the file
    const buffer = Buffer.from(await file.arrayBuffer());
    let rows: ShopifyRow[];

    if (file.name.endsWith('.csv')) {
      // Parse CSV
      const text = buffer.toString('utf-8');
      rows = parseCsv(text);
    } else {
      // Parse XLSX using SheetJS (must be installed: npm i xlsx)
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName =
        workbook.SheetNames.find((n: string) => n.toLowerCase() === 'products') ??
        workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json<ShopifyRow>(sheet, { defval: null });
    }

    // Convert
    const result = convertShopifyToEbay(rows, settings);
    const csv = toEbayCsv(result.rows);

    // Return CSV as download
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

// ── Simple CSV parser ───────────────────────────────────────────────

function parseCsv(text: string): ShopifyRow[] {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  const headers = parseRow(lines[0]);
  const rows: ShopifyRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseRow(line);
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? null;
    });
    rows.push(row as unknown as ShopifyRow);
  }

  return rows;
}

function parseRow(line: string): string[] {
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
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}
