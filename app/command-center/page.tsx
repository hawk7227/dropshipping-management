'use client';
import { useState, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════
type FileType = 'shopify-matrixify' | 'shopify-csv' | 'autods' | 'asin-list' | 'ebay-file-exchange' | 'generic-csv' | 'unknown';
type GateStatus = 'pass' | 'fail' | 'warn';

interface CleanProduct {
  title: string;
  asin: string;
  price: number;
  compareAt: number;
  image: string;
  description: string;
  vendor: string;
  category: string;
  tags: string;
  status: string;
  quantity: number;
  gates: { title: GateStatus; image: GateStatus; price: GateStatus; asin: GateStatus; description: GateStatus };
  gateCount: number;
  raw?: Record<string, string>;
}

interface FileAnalysis {
  type: FileType;
  totalRows: number;
  totalCols: number;
  uniqueProducts: number;
  removedRows: number;
  removedCols: number;
  columnMap: Record<string, number>;
  detectedFeatures: string[];
  products: CleanProduct[];
  passed: number;
  failed: number;
  warned: number;
  processingTime: number;
}

// ═══════════════════════════════════════════════════════════
// FILE TYPE DETECTION
// ═══════════════════════════════════════════════════════════
function detectFileType(headers: string[], sampleRows: string[][]): FileType {
  const h = headers.map(x => (x || '').toLowerCase().trim());
  const joined = h.join('|');

  // Shopify Matrixify: has 'top row', 'handle', 'image src', 'variant sku'
  if (h.includes('top row') && h.includes('handle') && joined.includes('image src'))
    return 'shopify-matrixify';

  // Shopify CSV export: has 'handle', 'title', 'body (html)', 'vendor'
  if (h.includes('handle') && h.includes('title') && (joined.includes('body') || joined.includes('vendor')) && joined.includes('image'))
    return 'shopify-csv';

  // AutoDS export: has 'autods' in headers or specific patterns
  if (joined.includes('autods') || (h.includes('source url') && h.includes('source price')))
    return 'autods';

  // eBay File Exchange: has 'action', 'itemid', 'category'
  if (h.includes('action') && (h.includes('itemid') || h.includes('category')))
    return 'ebay-file-exchange';

  // ASIN list: 1-2 columns, values look like ASINs or Amazon URLs
  if (headers.length <= 3) {
    const asinPattern = /^B[0-9A-Z]{9}$/;
    const urlPattern = /amazon\.com.*\/dp\//;
    let asinCount = 0;
    for (const row of sampleRows.slice(0, 20)) {
      for (const cell of row) {
        if (asinPattern.test(cell.trim()) || urlPattern.test(cell)) asinCount++;
      }
    }
    if (asinCount > 10) return 'asin-list';
  }

  // Generic CSV with some recognizable columns
  if (h.some(x => ['title', 'name', 'product'].includes(x)) && h.some(x => ['price', 'cost', 'sku'].includes(x)))
    return 'generic-csv';

  return 'unknown';
}

// ═══════════════════════════════════════════════════════════
// COLUMN MAPPER — finds the 11 essential columns by name
// ═══════════════════════════════════════════════════════════
function mapColumns(headers: string[]): Record<string, number> {
  const h = headers.map(x => (x || '').toLowerCase().trim());
  const map: Record<string, number> = {};

  const find = (keys: string[]): number => {
    // Exact match first
    for (const k of keys) { const i = h.indexOf(k); if (i >= 0) return i; }
    // Partial match
    for (let i = 0; i < h.length; i++) {
      for (const k of keys) { if (h[i].includes(k) && !h[i].includes('compare') && !h[i].includes('type') && !h[i].includes('command') && !h[i].includes('position') && !h[i].includes('width') && !h[i].includes('height') && !h[i].includes('alt')) return i; }
    }
    return -1;
  };

  // Strict ordering matters — more specific matches first
  map.title = find(['title', 'product title', 'product name', 'name', 'item name', 'item title']);
  map.asin = find(['variant sku', 'sku', 'asin', 'amazon asin', 'source_product_id', 'item number']);
  map.price = find(['variant price', 'price', 'sale price', 'selling price', 'retail price', 'current price']);
  map.compareAt = find(['variant compare at price', 'compare at price', 'compare_at_price', 'msrp', 'list price', 'original price']);
  // Image: must match 'image src' NOT 'image type', 'image command', etc.
  map.image = (() => {
    for (let i = 0; i < h.length; i++) {
      if (h[i] === 'image src' || h[i] === 'image_src' || h[i] === 'image url' || h[i] === 'image_url' || h[i] === 'main image') return i;
    }
    // Fallback: any column with 'image' that has URL-like values
    return -1;
  })();
  map.description = find(['body (html)', 'body html', 'body_html', 'description', 'product description', 'html description']);
  map.vendor = find(['vendor', 'brand', 'manufacturer', 'supplier']);
  map.category = find(['product type', 'product_type', 'type', 'category', 'department']);
  map.tags = find(['tags', 'keywords', 'labels']);
  map.status = find(['status', 'published', 'state']);
  map.quantity = find(['variant inventory qty', 'inventory', 'quantity', 'stock', 'qty']);
  map.handle = find(['handle', 'slug', 'url handle']);
  map.topRow = find(['top row']);

  return map;
}

// ═══════════════════════════════════════════════════════════
// HTML CLEANER — strips HTML to clean bullet points
// ═══════════════════════════════════════════════════════════
function cleanHTML(html: string): string {
  if (!html || html.length < 10) return html || '';
  // Extract list items first
  const bullets = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(b => b.length > 10 && b.length < 300);
  if (bullets.length >= 2) return bullets.slice(0, 6).join(' | ');
  // Fallback: strip all HTML
  let text = html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  // Remove common boilerplate
  const boilerplate = ['about us', 'shipping', 'returns', 'payment', 'contact us', 'customer satisfaction', 'we offer the best', 'copyright'];
  for (const bp of boilerplate) {
    const idx = text.toLowerCase().indexOf(bp);
    if (idx > 100 && idx < text.length - 50) { text = text.substring(0, idx).trim(); break; }
  }
  return text.substring(0, 500);
}

// ═══════════════════════════════════════════════════════════
// ASIN EXTRACTOR — finds ASIN in a string
// ═══════════════════════════════════════════════════════════
function extractASIN(val: string): string {
  if (!val) return '';
  const clean = val.trim().replace(/['"]/g, '').toUpperCase();
  if (/^B[0-9A-Z]{9}$/.test(clean)) return clean;
  // Extract from Amazon URL
  const match = val.match(/\/dp\/([A-Z0-9]{10})/i) || val.match(/\/(B[0-9A-Z]{9})/);
  if (match) return match[1].toUpperCase();
  return /^B[0-9A-Z]{9}$/.test(clean) ? clean : '';
}

// ═══════════════════════════════════════════════════════════
// 5-GATE CHECK
// ═══════════════════════════════════════════════════════════
function runGates(p: CleanProduct): CleanProduct {
  const g = { title: 'fail' as GateStatus, image: 'fail' as GateStatus, price: 'fail' as GateStatus, asin: 'fail' as GateStatus, description: 'fail' as GateStatus };
  if (p.title && p.title.length > 5 && !p.title.includes('<') && p.title.toLowerCase() !== 'unknown product') g.title = 'pass';
  else if (p.title && p.title.length > 0) g.title = 'warn';
  if (p.image && p.image.startsWith('http')) g.image = 'pass';
  if (p.price > 0) g.price = 'pass';
  else if (p.compareAt > 0) g.price = 'warn';
  if (p.asin && /^B[0-9A-Z]{9}$/.test(p.asin)) g.asin = 'pass';
  if (p.description && p.description.length > 30) g.description = 'pass';
  else if (p.description && p.description.length > 0) g.description = 'warn';
  const count = Object.values(g).filter(v => v === 'pass').length;
  return { ...p, gates: g, gateCount: count };
}

// ═══════════════════════════════════════════════════════════
// MAIN PROCESSOR
// ═══════════════════════════════════════════════════════════
function processFile(headers: string[], rows: string[][], fileType: FileType): FileAnalysis {
  const start = performance.now();
  const colMap = mapColumns(headers);
  const features: string[] = [];

  // Detect features
  if (colMap.topRow >= 0) features.push('Top Row dedup');
  if (colMap.handle >= 0) features.push('Handle dedup');
  if (colMap.image >= 0) features.push(`Image col: ${headers[colMap.image]}`);
  if (colMap.asin >= 0) features.push(`ASIN col: ${headers[colMap.asin]}`);
  if (colMap.description >= 0) features.push('Has descriptions');

  const products: CleanProduct[] = [];
  const seenHandles = new Set<string>();
  const seenASINs = new Set<string>();
  let removedRows = 0;

  for (const row of rows) {
    // Top Row filter for Matrixify
    if (colMap.topRow >= 0) {
      const tr = (row[colMap.topRow] || '').trim().toLowerCase();
      if (tr !== 'true' && tr !== '1' && tr !== 'yes') { removedRows++; continue; }
    }

    // Extract fields
    const title = colMap.title >= 0 ? (row[colMap.title] || '').trim().replace(/^["']|["']$/g, '') : '';
    const asin = colMap.asin >= 0 ? extractASIN(row[colMap.asin] || '') : '';
    const handle = colMap.handle >= 0 ? (row[colMap.handle] || '').trim() : '';

    // Skip empty rows
    if (!title && !asin && !handle) { removedRows++; continue; }

    // Deduplicate
    if (asin && seenASINs.has(asin)) { removedRows++; continue; }
    if (!asin && handle && seenHandles.has(handle)) { removedRows++; continue; }
    if (asin) seenASINs.add(asin);
    if (handle) seenHandles.add(handle);

    const rawImage = colMap.image >= 0 ? (row[colMap.image] || '').trim() : '';
    const rawDesc = colMap.description >= 0 ? (row[colMap.description] || '').trim() : '';
    const rawPrice = colMap.price >= 0 ? (row[colMap.price] || '0') : '0';
    const rawCompare = colMap.compareAt >= 0 ? (row[colMap.compareAt] || '0') : '0';
    const rawVendor = colMap.vendor >= 0 ? (row[colMap.vendor] || '').trim().replace(/^["']|["']$/g, '') : '';
    const rawCategory = colMap.category >= 0 ? (row[colMap.category] || '').trim().replace(/^["']|["']$/g, '') : '';
    const rawTags = colMap.tags >= 0 ? (row[colMap.tags] || '').trim() : '';
    const rawStatus = colMap.status >= 0 ? (row[colMap.status] || 'Active').trim() : 'Active';
    const rawQty = colMap.quantity >= 0 ? parseInt(row[colMap.quantity] || '999') || 999 : 999;

    const product: CleanProduct = {
      title: title || (asin ? `Amazon Product ${asin}` : 'Unknown Product'),
      asin,
      price: parseFloat(rawPrice.replace(/[^0-9.]/g, '')) || 0,
      compareAt: parseFloat(rawCompare.replace(/[^0-9.]/g, '')) || 0,
      image: rawImage.startsWith('http') ? rawImage : '',
      description: cleanHTML(rawDesc),
      vendor: rawVendor.substring(0, 30) || 'Unknown',
      category: rawCategory.substring(0, 40) || 'General',
      tags: rawTags,
      status: rawStatus,
      quantity: rawQty,
      gates: { title: 'fail', image: 'fail', price: 'fail', asin: 'fail', description: 'fail' },
      gateCount: 0,
    };

    products.push(runGates(product));
  }

  const passed = products.filter(p => p.gateCount === 5).length;
  const failed = products.filter(p => p.gateCount < 3).length;
  const warned = products.length - passed - failed;

  return {
    type: fileType,
    totalRows: rows.length,
    totalCols: headers.length,
    uniqueProducts: products.length,
    removedRows,
    removedCols: Math.max(0, headers.length - 11),
    columnMap: colMap,
    detectedFeatures: features,
    products,
    passed,
    failed,
    warned,
    processingTime: Math.round(performance.now() - start),
  };
}

// ═══════════════════════════════════════════════════════════
// ASIN-LIST PROCESSOR
// ═══════════════════════════════════════════════════════════
function processASINList(headers: string[], rows: string[][]): FileAnalysis {
  const start = performance.now();
  const asins = new Set<string>();
  const products: CleanProduct[] = [];

  // Extract ASINs from all cells (no headers, just data)
  const allRows = [[...headers.map(String)], ...rows];
  for (const row of allRows) {
    for (const cell of row) {
      const val = (cell || '').trim();
      // Direct ASIN
      const clean = val.replace(/['"]/g, '').toUpperCase();
      if (/^B[0-9A-Z]{9}$/.test(clean)) asins.add(clean);
      // ASINs from URLs
      const matches = val.matchAll(/\/dp\/([A-Z0-9]{10})/gi);
      for (const m of matches) asins.add(m[1].toUpperCase());
    }
  }

  for (const asin of asins) {
    const product: CleanProduct = {
      title: '', asin, price: 0, compareAt: 0, image: '', description: '',
      vendor: '', category: '', tags: '', status: 'Draft', quantity: 999,
      gates: { title: 'fail', image: 'fail', price: 'fail', asin: 'pass', description: 'fail' },
      gateCount: 1,
    };
    products.push(product);
  }

  return {
    type: 'asin-list',
    totalRows: allRows.length,
    totalCols: headers.length || 2,
    uniqueProducts: products.length,
    removedRows: allRows.length - products.length,
    removedCols: 0,
    columnMap: {},
    detectedFeatures: ['ASIN extraction', `${asins.size} unique ASINs`, 'Needs API enrichment (Keepa/Rainforest)'],
    products,
    passed: 0,
    failed: products.length,
    warned: 0,
    processingTime: Math.round(performance.now() - start),
  };
}

// ═══════════════════════════════════════════════════════════
// CSV SPLIT (handles quoted fields)
// ═══════════════════════════════════════════════════════════
function splitCSVRow(line: string, delim = ','): string[] {
  const cols: string[] = [];
  let inQ = false, f = '';
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === delim && !inQ) { cols.push(f); f = ''; }
    else f += ch;
  }
  cols.push(f);
  return cols;
}

// ═══════════════════════════════════════════════════════════
// XLSX EXPORT
// ═══════════════════════════════════════════════════════════
async function exportXLSX(products: CleanProduct[], filename: string) {
  const { utils, writeFile } = await import('xlsx');
  const data = products.map(p => ({
    'Title': p.title,
    'ASIN/SKU': p.asin,
    'Price': p.price || '',
    'Compare At Price': p.compareAt || '',
    'Image URL': p.image,
    'Description': p.description,
    'Vendor': p.vendor,
    'Category': p.category,
    'Tags': p.tags,
    'Status': p.status,
    'Quantity': p.quantity,
    'Gates Passed': `${p.gateCount}/5`,
  }));
  const ws = utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 55 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 60 }, { wch: 80 }, { wch: 20 }, { wch: 25 }, { wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Products');
  writeFile(wb, filename);
}

// ═══════════════════════════════════════════════════════════
// UI COMPONENT
// ═══════════════════════════════════════════════════════════
export default function CommandCenter() {
  const [analysis, setAnalysis] = useState<FileAnalysis | null>(null);
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed' | 'warned'>('all');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setProcessing(true);
    setFileName(file.name);
    setAnalysis(null);

    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { dense: true, cellStyles: false, cellNF: false, cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const csv = XLSX.utils.sheet_to_csv(ws);

      // Free memory
      wb.Sheets = {}; wb.SheetNames = [];

      const lines = csv.split('\n').filter(l => l.trim());
      if (lines.length < 2) { setProcessing(false); return; }

      const headers = splitCSVRow(lines[0]);
      const sampleRows = lines.slice(1, 30).map(l => splitCSVRow(l));
      const allRows = lines.slice(1).map(l => splitCSVRow(l));

      // Detect file type
      const fileType = detectFileType(headers, sampleRows);

      let result: FileAnalysis;
      if (fileType === 'asin-list') {
        result = processASINList(headers, allRows);
      } else {
        result = processFile(headers, allRows, fileType);
      }

      setAnalysis(result);
    } catch (e) {
      console.error('Processing error:', e);
    }
    setProcessing(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const filtered = analysis?.products?.filter(p => {
    if (filter === 'passed') return p.gateCount === 5;
    if (filter === 'failed') return p.gateCount < 3;
    if (filter === 'warned') return p.gateCount >= 3 && p.gateCount < 5;
    return true;
  }) || [];

  const gateIcon = (s: GateStatus) => s === 'pass' ? '✅' : s === 'warn' ? '⚠️' : '❌';
  const fileTypeLabel: Record<FileType, string> = {
    'shopify-matrixify': '🟢 Shopify Matrixify Export',
    'shopify-csv': '🟢 Shopify CSV Export',
    'autods': '🟡 AutoDS Export',
    'asin-list': '🔵 ASIN List (needs enrichment)',
    'ebay-file-exchange': '🟠 eBay File Exchange',
    'generic-csv': '⚪ Generic CSV',
    'unknown': '🔴 Unknown Format',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e5e5e5', fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace" }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1a1a2e', padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.5px' }}>⚡ Product Command Center</h1>
          <p style={{ fontSize: '11px', color: '#666', margin: '4px 0 0' }}>Drop any file. Auto-detect. Auto-clean. 5-gate validation.</p>
        </div>
        {analysis && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => exportXLSX(analysis.products.filter(p => p.gateCount === 5), `clean_passed_${Date.now()}.xlsx`)}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#16a34a', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
              📥 Export Passed ({analysis.passed})
            </button>
            <button onClick={() => exportXLSX(analysis.products, `clean_all_${Date.now()}.xlsx`)}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#1a1a2e', color: '#888', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: '1px solid #333' } as React.CSSProperties}>
              📥 Export All ({analysis.uniqueProducts})
            </button>
            <button onClick={() => { setAnalysis(null); setFileName(''); }}
              style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #333', background: 'transparent', color: '#666', fontSize: '11px', cursor: 'pointer' }}>
              🗑️ Clear
            </button>
          </div>
        )}
      </div>

      <div style={{ padding: '24px 32px' }}>
        {/* Drop Zone */}
        {!analysis && (
          <div
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? '#16a34a' : '#1a1a2e'}`,
              borderRadius: '16px',
              padding: '80px 40px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: dragOver ? 'rgba(22,163,74,0.05)' : 'transparent',
            }}
          >
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {processing ? (
              <div>
                <div style={{ fontSize: '32px', marginBottom: '16px' }}>⏳</div>
                <p style={{ color: '#888', fontSize: '13px' }}>Processing {fileName}...</p>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📂</div>
                <p style={{ color: '#fff', fontSize: '15px', fontWeight: 600, margin: '0 0 8px' }}>Drop any product file</p>
                <p style={{ color: '#555', fontSize: '11px', margin: 0 }}>
                  Shopify Matrixify · AutoDS · ASIN Lists · eBay · Generic CSV/XLSX
                </p>
                <p style={{ color: '#333', fontSize: '10px', margin: '12px 0 0' }}>
                  Auto-detects format · Strips junk columns/rows · 5-gate validation · Exports clean XLSX
                </p>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {analysis && (
          <div>
            {/* Stats Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              {/* File Detection */}
              <div style={{ background: '#111', borderRadius: '12px', padding: '16px', border: '1px solid #1a1a2e' }}>
                <p style={{ fontSize: '9px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px' }}>Detected Format</p>
                <p style={{ fontSize: '13px', color: '#fff', margin: 0, fontWeight: 600 }}>{fileTypeLabel[analysis.type]}</p>
                <p style={{ fontSize: '10px', color: '#444', margin: '4px 0 0' }}>{fileName}</p>
              </div>
              {/* Cleanup Stats */}
              <div style={{ background: '#111', borderRadius: '12px', padding: '16px', border: '1px solid #1a1a2e' }}>
                <p style={{ fontSize: '9px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px' }}>Cleanup</p>
                <p style={{ fontSize: '13px', color: '#fff', margin: 0 }}>
                  <span style={{ color: '#ef4444' }}>{analysis.removedCols}</span> cols · <span style={{ color: '#ef4444' }}>{analysis.removedRows.toLocaleString()}</span> rows removed
                </p>
                <p style={{ fontSize: '10px', color: '#444', margin: '4px 0 0' }}>
                  {analysis.totalCols} → 11 cols · {analysis.totalRows.toLocaleString()} → {analysis.uniqueProducts.toLocaleString()} rows
                </p>
              </div>
              {/* Gates */}
              <div style={{ background: '#111', borderRadius: '12px', padding: '16px', border: '1px solid #1a1a2e' }}>
                <p style={{ fontSize: '9px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px' }}>5-Gate Check</p>
                <p style={{ fontSize: '13px', margin: 0 }}>
                  <span style={{ color: '#16a34a', fontWeight: 700 }}>{analysis.passed}</span>
                  <span style={{ color: '#444' }}> pass · </span>
                  <span style={{ color: '#f59e0b', fontWeight: 700 }}>{analysis.warned}</span>
                  <span style={{ color: '#444' }}> warn · </span>
                  <span style={{ color: '#ef4444', fontWeight: 700 }}>{analysis.failed}</span>
                  <span style={{ color: '#444' }}> fail</span>
                </p>
              </div>
              {/* Speed */}
              <div style={{ background: '#111', borderRadius: '12px', padding: '16px', border: '1px solid #1a1a2e' }}>
                <p style={{ fontSize: '9px', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px' }}>Processing</p>
                <p style={{ fontSize: '13px', color: '#fff', margin: 0 }}>{analysis.processingTime}ms</p>
                <p style={{ fontSize: '10px', color: '#444', margin: '4px 0 0' }}>
                  {analysis.detectedFeatures.join(' · ')}
                </p>
              </div>
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
              {(['all', 'passed', 'failed', 'warned'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{
                    padding: '6px 14px', borderRadius: '6px', border: '1px solid',
                    borderColor: filter === f ? '#333' : 'transparent',
                    background: filter === f ? '#1a1a2e' : 'transparent',
                    color: filter === f ? '#fff' : '#555',
                    fontSize: '10px', fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>
                  {f} ({f === 'all' ? analysis.uniqueProducts : f === 'passed' ? analysis.passed : f === 'failed' ? analysis.failed : analysis.warned})
                </button>
              ))}
            </div>

            {/* Product Table */}
            <div style={{ background: '#111', borderRadius: '12px', border: '1px solid #1a1a2e', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1a1a2e' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', color: '#555', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px' }}>Gates</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', color: '#555', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px' }}>Product</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', color: '#555', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px' }}>ASIN</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', color: '#555', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px' }}>Price</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', color: '#555', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px' }}>Title</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', color: '#555', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px' }}>Image</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', color: '#555', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px' }}>Price</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', color: '#555', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px' }}>ASIN</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', color: '#555', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px' }}>Desc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 200).map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #0a0a0a' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                            background: p.gateCount === 5 ? 'rgba(22,163,74,0.15)' : p.gateCount >= 3 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                            color: p.gateCount === 5 ? '#16a34a' : p.gateCount >= 3 ? '#f59e0b' : '#ef4444',
                          }}>{p.gateCount}/5</span>
                        </td>
                        <td style={{ padding: '8px 12px', maxWidth: '300px' }}>
                          <p style={{ margin: 0, color: '#fff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px' }}>{p.title}</p>
                          <p style={{ margin: '2px 0 0', color: '#444', fontSize: '9px' }}>{p.vendor} · {p.category}</p>
                        </td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#06b6d4', fontSize: '10px' }}>{p.asin || '—'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{p.price > 0 ? `$${p.price.toFixed(2)}` : '—'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{gateIcon(p.gates.title)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{gateIcon(p.gates.image)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{gateIcon(p.gates.price)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{gateIcon(p.gates.asin)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{gateIcon(p.gates.description)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length > 200 && (
                  <p style={{ padding: '12px', textAlign: 'center', color: '#444', fontSize: '10px' }}>
                    Showing 200 of {filtered.length} products. Export to see all.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
