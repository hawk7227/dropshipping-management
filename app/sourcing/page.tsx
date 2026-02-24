'use client';
import { useState, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════
type FileType = 'shopify-matrixify' | 'shopify-csv' | 'autods' | 'asin-list' | 'ebay-file-exchange' | 'generic-csv' | 'unknown';
type GateStatus = 'pass' | 'fail' | 'warn';
type ViewMode = 'table' | 'spreadsheet';

interface CleanProduct {
  title: string; asin: string; price: number; compareAt: number; image: string;
  description: string; vendor: string; category: string; tags: string; status: string; quantity: number;
  gates: { title: GateStatus; image: GateStatus; price: GateStatus; asin: GateStatus; description: GateStatus };
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
  if (h.some(x => ['title','name','product'].includes(x)) && h.some(x => ['price','cost','sku'].includes(x))) return 'generic-csv';
  return 'unknown';
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

  map.title = find(['title', 'product title', 'product name', 'item name', 'item title', 'name'], ['option', 'meta', 'alt']);
  map.asin = find(['variant sku', 'sku', 'asin', 'amazon asin', 'source_product_id', 'item number']);
  map.price = find(['variant price', 'price', 'sale price', 'selling price'], ['compare', 'cost']);
  map.compareAt = find(['variant compare at price', 'compare at price', 'compare_at_price', 'msrp', 'list price']);
  map.image = find(['image src', 'image_src', 'image url', 'image_url', 'main image'], ['type', 'command', 'position', 'width', 'height', 'alt']);
  map.description = find(['body (html)', 'body html', 'body_html', 'description', 'product description']);
  map.vendor = find(['vendor', 'brand', 'manufacturer', 'supplier']);
  map.category = find(['product type', 'product_type', 'type', 'category', 'department'], ['image', 'variant', 'meta']);
  map.tags = find(['tags', 'keywords']);
  map.status = find(['status'], ['inventory']);
  map.quantity = find(['variant inventory qty', 'inventory', 'quantity', 'stock', 'total inventory qty']);
  map.handle = find(['handle', 'slug']);
  map.topRow = find(['top row']);
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

function runGates(p: CleanProduct): CleanProduct {
  const g = { title:'fail' as GateStatus, image:'fail' as GateStatus, price:'fail' as GateStatus, asin:'fail' as GateStatus, description:'fail' as GateStatus };
  if (p.title && p.title.length > 5 && !p.title.includes('<') && p.title.toLowerCase() !== 'unknown product') g.title = 'pass';
  else if (p.title?.length > 0) g.title = 'warn';
  if (p.image?.startsWith('http')) g.image = 'pass';
  if (p.price > 0) g.price = 'pass'; else if (p.compareAt > 0) g.price = 'warn';
  if (p.asin && /^B[0-9A-Z]{9}$/.test(p.asin)) g.asin = 'pass';
  if (p.description?.length > 30) g.description = 'pass'; else if (p.description?.length > 0) g.description = 'warn';
  return { ...p, gates: g, gateCount: Object.values(g).filter(v => v === 'pass').length };
}

// ═══════════════════════════════════════════════════════════
// MAIN PROCESSOR — uses sheet_to_json (NOT sheet_to_csv)
// ═══════════════════════════════════════════════════════════
function processRows(jsonRows: Record<string,unknown>[], headers: string[], fileType: FileType): FileAnalysis {
  const start = performance.now();
  const colMap = mapColumns(headers);
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
    const rawPrice = get(colMap.price) || '0';
    const rawCompare = get(colMap.compareAt) || '0';

    const product: CleanProduct = {
      title: title || (asin ? `Amazon Product ${asin}` : 'Unknown Product'),
      asin,
      price: parseFloat(rawPrice.replace(/[^0-9.]/g,'')) || 0,
      compareAt: parseFloat(rawCompare.replace(/[^0-9.]/g,'')) || 0,
      image: rawImage.startsWith('http') ? rawImage : '',
      description: cleanHTML(get(colMap.description)),
      vendor: (get(colMap.vendor) || 'Unknown').substring(0, 30),
      category: (get(colMap.category) || 'General').substring(0, 40),
      tags: get(colMap.tags),
      status: get(colMap.status) || 'Active',
      quantity: parseInt(get(colMap.quantity)) || 999,
      gates: { title:'fail', image:'fail', price:'fail', asin:'fail', description:'fail' }, gateCount: 0,
    };
    products.push(runGates(product));
  }

  const passed = products.filter(p => p.gateCount === 5).length;
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
    title:'', asin, price:0, compareAt:0, image:'', description:'',
    vendor:'', category:'', tags:'', status:'Draft', quantity:999,
    gates:{title:'fail',image:'fail',price:'fail',asin:'fail',description:'fail'}, gateCount:0,
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
const COLS = ['title','asin','price','compareAt','image','description','vendor','category','tags','status','quantity'] as const;
const COL_LABELS = ['Title','ASIN/SKU','Price','Compare At','Image URL','Description','Vendor','Category','Tags','Status','Qty'];
const COL_WIDTHS = [300,120,80,100,250,350,130,150,200,80,60];

function SpreadsheetView({ products, onUpdate }: { products: CleanProduct[]; onUpdate: (idx: number, field: string, val: string) => void }) {
  const [page, setPage] = useState(0);
  const PAGE = 50;
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
              <th style={{ padding:'8px 6px', fontSize:'9px', color:'#444', textAlign:'center', borderBottom:'1px solid #1a1a2e', background:'#0f0f0f', position:'sticky', top:0, width:36 }}>#</th>
              <th style={{ padding:'8px 6px', fontSize:'9px', color:'#444', textAlign:'center', borderBottom:'1px solid #1a1a2e', background:'#0f0f0f', position:'sticky', top:0, width:50 }}>Gate</th>
              {COL_LABELS.map((label, ci) => (
                <th key={ci} style={{ padding:'8px 6px', fontSize:'9px', color:'#555', textAlign:'left', borderBottom:'1px solid #1a1a2e', background:'#0f0f0f', position:'sticky', top:0, width:COL_WIDTHS[ci], letterSpacing:'0.5px', textTransform:'uppercase' }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((p, ri) => {
              const globalIdx = page * PAGE + ri;
              return (
                <tr key={globalIdx} style={{ borderBottom:'1px solid #0a0a0a' }}>
                  <td style={{ padding:'4px 6px', fontSize:'9px', color:'#333', textAlign:'center' }}>{globalIdx+1}</td>
                  <td style={{ padding:'4px 6px', textAlign:'center' }}>
                    <span style={{ fontSize:'9px', fontWeight:700, padding:'1px 6px', borderRadius:'3px',
                      background: p.gateCount===5?'rgba(22,163,74,0.15)':p.gateCount>=3?'rgba(245,158,11,0.15)':'rgba(239,68,68,0.15)',
                      color: p.gateCount===5?'#16a34a':p.gateCount>=3?'#f59e0b':'#ef4444',
                    }}>{p.gateCount}/5</span>
                  </td>
                  {COLS.map((col, ci) => {
                    const val = String(p[col] ?? '');
                    const isGated = ['title','image','price','asin','description'].includes(col);
                    const gateKey = col === 'compareAt' ? null : col as keyof typeof p.gates;
                    const gateStatus = gateKey && p.gates[gateKey];
                    return (
                      <td key={ci} style={{ padding:0, borderLeft:'1px solid #111', position:'relative' }}>
                        <input
                          defaultValue={col === 'price' || col === 'compareAt' ? (Number(val) > 0 ? Number(val).toFixed(2) : '') : val}
                          onBlur={e => onUpdate(globalIdx, col, e.target.value)}
                          style={{
                            width:'100%', padding:'6px 8px', background:'transparent', border:'none', outline:'none',
                            color: gateStatus === 'fail' ? '#ef4444' : gateStatus === 'warn' ? '#f59e0b' : '#ccc',
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
// XLSX EXPORT + DOWNLOAD
// ═══════════════════════════════════════════════════════════
async function exportAndDownload(products: CleanProduct[], filename: string) {
  const { utils, writeFile } = await import('xlsx');
  const data = products.map(p => ({
    'Title': p.title, 'ASIN/SKU': p.asin, 'Price': p.price || '', 'Compare At Price': p.compareAt || '',
    'Image URL': p.image, 'Description': p.description, 'Vendor': p.vendor, 'Category': p.category,
    'Tags': p.tags, 'Status': p.status, 'Quantity': p.quantity, 'Gates': `${p.gateCount}/5`,
  }));
  const ws = utils.json_to_sheet(data);
  ws['!cols'] = [55,14,10,14,60,80,20,25,40,10,10,8].map(w => ({ wch: w }));
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Products');
  writeFile(wb, filename);
}

// ═══════════════════════════════════════════════════════════
// MAIN UI
// ═══════════════════════════════════════════════════════════
export default function CommandCenter() {
  const [analysis, setAnalysis] = useState<FileAnalysis | null>(null);
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [filter, setFilter] = useState<'all'|'passed'|'failed'|'warned'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('spreadsheet');
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0, tokensLeft: 0, currentBatch: '', error: '' });
  const [criteria, setCriteria] = useState({ minPrice: 3, maxPrice: 25, minRating: 3.5, minReviews: 500, maxBSR: 100000, markup: 70, maxRetail: 40 });
  const [showCriteria, setShowCriteria] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Enrich ASINs via Keepa API in batches of 100
  const enrichProducts = useCallback(async (testOnly = false) => {
    if (!analysis) return;
    const unenriched = analysis.products.filter(p => p.asin && /^B[0-9A-Z]{9}$/.test(p.asin) && (p.gateCount < 5 || !p.title));
    if (!unenriched.length) return;
    setEnriching(true);
    setEnrichProgress({ done: 0, total: testOnly ? Math.min(50, unenriched.length) : unenriched.length, tokensLeft: 0, currentBatch: 'Starting...', error: '' });

    const allAsins = unenriched.map(p => p.asin);
    const maxAsins = testOnly ? allAsins.slice(0, 10) : allAsins;
    const BATCH = 5; // Small batches to avoid Vercel 10s timeout
    const updated = [...analysis.products];
    let totalDone = 0;

    for (let i = 0; i < maxAsins.length; i += BATCH) {
      const batch = maxAsins.slice(i, i + BATCH);
      setEnrichProgress(prev => ({ ...prev, done: totalDone, currentBatch: `Batch ${Math.floor(i/BATCH)+1}: ${batch[0]}...${batch[batch.length-1]}`, error: '' }));
      
      try {
        const res = await fetch('/api/enrich', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ asins: batch, criteria }),
        });
        const data = await res.json();
        
        if (data.error) {
          setEnrichProgress(prev => ({ ...prev, error: `API Error: ${data.error}` }));
          console.error('Enrich error:', data.error);
          if (testOnly) { setEnriching(false); return; }
          continue;
        }
        
        const enriched = data.enriched || {};
        const enrichedCount = Object.keys(enriched).length;
        const errors = data.summary?.errors || [];
        
        // Debug: show what we got back
        const sampleKey = Object.keys(enriched)[0];
        const sample = sampleKey ? enriched[sampleKey] : null;
        const debugInfo = sample 
          ? `Sample: "${(sample.title||'no title').substring(0,40)}" $${sample.price} img:${sample.image ? 'YES' : 'NO'} desc:${sample.description ? 'YES' : 'NO'}`
          : `No products returned. Errors: ${errors.length ? errors.slice(0,2).join('; ') : 'none'}`;
        
        setEnrichProgress(prev => ({ ...prev, tokensLeft: 0, currentBatch: `Batch ${Math.floor(i/BATCH)+1}: ${enrichedCount} returned, ${data.summary?.passed || 0} passed. ${debugInfo}` }));

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
            description: e.description || p.description,
            vendor: e.vendor || p.vendor,
            category: e.category || p.category,
            status: e.isAvailable ? (e.passed ? 'Active' : 'Rejected') : 'Out of Stock',
            quantity: e.isAvailable ? 999 : 0,
            compareAt: e.sellPrice || p.compareAt,
            tags: [e.isPrime ? 'Prime' : '', e.bsr > 0 ? `BSR:${e.bsr}` : '', e.rating > 0 ? `Rating:${e.rating}` : ''].filter(Boolean).join(', '),
            gates: p.gates, gateCount: p.gateCount,
          };
          updated[j] = runGates(merged);
        }
        totalDone += batch.length;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setEnrichProgress(prev => ({ ...prev, error: `Fetch error: ${msg}` }));
        console.error('Batch failed:', err);
        if (testOnly) { setEnriching(false); return; }
      }

      // Small delay between batches
      if (i + BATCH < maxAsins.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    const passed = updated.filter(x => x.gateCount === 5).length;
    const failed = updated.filter(x => x.gateCount < 3).length;
    setAnalysis({ ...analysis, products: updated, passed, failed, warned: updated.length - passed - failed });
    setEnrichProgress(prev => ({ ...prev, done: maxAsins.length, currentBatch: `Done! ${passed} passed all 5 gates.` }));
    setEnriching(false);
  }, [analysis, criteria]);

  const handleFile = useCallback(async (file: File) => {
    setProcessing(true); setFileName(file.name); setAnalysis(null);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { dense: true, cellStyles: false, cellNF: false, cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];

      // Use sheet_to_json — handles newlines in cells correctly (unlike sheet_to_csv + split)
      const jsonRows = XLSX.utils.sheet_to_json<Record<string,unknown>>(ws, { defval: '' });
      wb.Sheets = {}; wb.SheetNames = []; // free memory

      if (!jsonRows.length) { setProcessing(false); return; }
      const headers = Object.keys(jsonRows[0]);

      // Detect: ASIN list or structured file?
      if (detectASINList(jsonRows)) {
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
    const passed = updated.filter(x => x.gateCount === 5).length;
    const failed = updated.filter(x => x.gateCount < 3).length;
    setAnalysis({ ...analysis, products: updated, passed, failed, warned: updated.length - passed - failed });
  }, [analysis]);

  const filtered = analysis?.products?.filter(p => {
    if (filter === 'passed') return p.gateCount === 5;
    if (filter === 'failed') return p.gateCount < 3;
    if (filter === 'warned') return p.gateCount >= 3 && p.gateCount < 5;
    return true;
  }) || [];

  const gateIcon = (s: GateStatus) => s === 'pass' ? '✅' : s === 'warn' ? '⚠️' : '❌';
  const typeLabel: Record<FileType, string> = {
    'shopify-matrixify': '🟢 Shopify Matrixify Export', 'shopify-csv': '🟢 Shopify CSV Export',
    'autods': '🟡 AutoDS Export', 'asin-list': '🔵 ASIN List (needs enrichment)',
    'ebay-file-exchange': '🟠 eBay File Exchange', 'generic-csv': '⚪ Generic CSV', 'unknown': '🔴 Unknown Format',
  };

  return (
    <div style={{ minHeight:'100vh', background:'#0a0a0a', color:'#e5e5e5', fontFamily:"'JetBrains Mono','SF Mono','Fira Code',monospace" }}>
      {/* Header */}
      <div style={{ borderBottom:'1px solid #1a1a2e', padding:'16px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:'16px', fontWeight:700, color:'#fff', margin:0 }}>⚡ Product Command Center</h1>
          <p style={{ fontSize:'10px', color:'#555', margin:'2px 0 0' }}>Drop any file. Auto-detect. Auto-clean. 5-gate validation. Edit inline.</p>
        </div>
        {analysis && (
          <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
            {/* View toggle */}
            <div style={{ display:'flex', border:'1px solid #222', borderRadius:'6px', overflow:'hidden', marginRight:'8px' }}>
              {(['spreadsheet','table'] as const).map(m => (
                <button key={m} onClick={() => setViewMode(m)} style={{
                  padding:'5px 12px', fontSize:'9px', fontWeight:600, border:'none', cursor:'pointer', textTransform:'uppercase', letterSpacing:'0.5px',
                  background: viewMode===m ? '#1a1a2e' : 'transparent', color: viewMode===m ? '#fff' : '#444',
                }}>{m === 'spreadsheet' ? '📊 Sheet' : '📋 Table'}</button>
              ))}
            </div>
            {/* Enrich button for ASIN lists or products missing data */}
            {analysis.products.some(p => p.gateCount < 5 && p.asin && /^B[0-9A-Z]{9}$/.test(p.asin)) && (
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
            )}
            <button onClick={() => exportAndDownload(analysis.products.filter(p => p.gateCount === 5), `clean_passed_${Date.now()}.xlsx`)}
              style={{ padding:'6px 14px', borderRadius:'6px', border:'none', background:'#16a34a', color:'#fff', fontSize:'10px', fontWeight:600, cursor:'pointer' }}>
              📥 Export Passed ({analysis.passed})
            </button>
            <button onClick={() => exportAndDownload(analysis.products, `clean_all_${Date.now()}.xlsx`)}
              style={{ padding:'6px 14px', borderRadius:'6px', border:'1px solid #333', background:'transparent', color:'#888', fontSize:'10px', fontWeight:600, cursor:'pointer' }}>
              📥 All ({analysis.uniqueProducts})
            </button>
            <button onClick={() => { setAnalysis(null); setFileName(''); setFilter('all'); }}
              style={{ padding:'6px 14px', borderRadius:'6px', border:'1px solid #222', background:'transparent', color:'#555', fontSize:'10px', cursor:'pointer' }}>
              🗑️ Clear
            </button>
          </div>
        )}
      </div>

      <div style={{ padding:'20px 24px' }}>
        {/* Drop Zone + Onboarding */}
        {!analysis && (
          <div>
            {/* Hero */}
            <div style={{ marginBottom:'24px' }}>
              <h2 style={{ fontSize:'14px', color:'#fff', fontWeight:700, margin:'0 0 6px' }}>Smart Product File Processor</h2>
              <p style={{ fontSize:'11px', color:'#555', margin:0, lineHeight:'1.6' }}>
                Upload any product file — this tool auto-detects the format, strips unnecessary data, validates every product against 5 listing requirements, 
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
                  {['166 → 11 cols','70K → 2.5K rows','HTML cleanup','Dedup','5-gate check'].map(t => (
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
                  Once products pass 5-gate validation, export in the exact format each platform requires — 
                  eBay File Exchange, TikTok Shop template, Walmart feed, Shopify CSV. Image compliance per platform.
                </p>
                <div style={{ fontSize:'9px', color:'#333', display:'flex', flexWrap:'wrap', gap:'4px' }}>
                  {['eBay format','TikTok Shop','Walmart feed','Image validation','Title limits'].map(t => (
                    <span key={t} style={{ padding:'2px 6px', borderRadius:'3px', background:'#f59e0b15', color:'#f59e0b', border:'1px solid #f59e0b22' }}>{t}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* The 5 Gates */}
            <div style={{ background:'#111', borderRadius:'10px', padding:'16px', border:'1px solid #1a1a2e', marginBottom:'24px' }}>
              <p style={{ fontSize:'10px', color:'#fff', fontWeight:700, margin:'0 0 10px', textTransform:'uppercase', letterSpacing:'1px' }}>5-Gate Listing Requirements</p>
              <p style={{ fontSize:'10px', color:'#555', margin:'0 0 12px' }}>Every product must pass all 5 gates before it can be listed on any platform. No exceptions.</p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'10px' }}>
                {[
                  { icon:'✅', gate:'Title', desc:'Min 6 chars, no HTML, not generic', required:true },
                  { icon:'✅', gate:'Image', desc:'Valid URL (http), eBay needs 1600×1600', required:true },
                  { icon:'✅', gate:'Price', desc:'Greater than $0, within criteria range', required:true },
                  { icon:'✅', gate:'ASIN/SKU', desc:'Valid Amazon ASIN (B0XXXXXXXXX format)', required:true },
                  { icon:'✅', gate:'Description', desc:'Min 30 chars, cleaned of HTML/boilerplate', required:true },
                ].map(g => (
                  <div key={g.gate} style={{ flex:'1 1 160px', background:'#0a0a0a', borderRadius:'6px', padding:'10px', border:'1px solid #1a1a2e' }}>
                    <p style={{ fontSize:'11px', color:'#16a34a', fontWeight:700, margin:'0 0 4px' }}>{g.icon} {g.gate}</p>
                    <p style={{ fontSize:'9px', color:'#555', margin:0 }}>{g.desc}</p>
                  </div>
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
              <p style={{ fontSize:'8px', color:'#444', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 4px' }}>5-Gate Check</p>
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

          {/* Filters */}
          <div style={{ display:'flex', gap:'4px', marginBottom:'12px' }}>
            {(['all','passed','failed','warned'] as const).map(f => {
              const count = f==='all'?analysis.uniqueProducts:f==='passed'?analysis.passed:f==='failed'?analysis.failed:analysis.warned;
              return <button key={f} onClick={() => setFilter(f)} style={{
                padding:'5px 12px', borderRadius:'5px', border: filter===f ? '1px solid #333' : '1px solid transparent',
                background: filter===f ? '#1a1a2e' : 'transparent', color: filter===f ? '#fff' : '#444',
                fontSize:'9px', fontWeight:600, cursor:'pointer', textTransform:'uppercase', letterSpacing:'0.5px',
              }}>{f} ({count})</button>;
            })}
          </div>

          {/* Spreadsheet or Table view */}
          {viewMode === 'spreadsheet' ? (
            <SpreadsheetView products={filtered} onUpdate={handleUpdate} />
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
                      <tr key={i} style={{ borderBottom:'1px solid #0a0a0a' }}>
                        <td style={{ padding:'6px 8px', textAlign:'center' }}>
                          <span style={{ fontSize:'9px', fontWeight:700, padding:'2px 6px', borderRadius:'3px',
                            background: p.gateCount===5?'rgba(22,163,74,0.15)':p.gateCount>=3?'rgba(245,158,11,0.15)':'rgba(239,68,68,0.15)',
                            color: p.gateCount===5?'#16a34a':p.gateCount>=3?'#f59e0b':'#ef4444' }}>{p.gateCount}/5</span>
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
        </div>)}
      </div>
    </div>
  );
}
