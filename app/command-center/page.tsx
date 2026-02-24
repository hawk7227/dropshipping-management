'use client';
import { useState, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════
type FileType = 'shopify-matrixify' | 'shopify-csv' | 'autods' | 'asin-list' | 'ebay-file-exchange' | 'generic-csv' | 'unknown';
type GateStatus = 'pass' | 'fail' | 'warn';
type ViewMode = 'table' | 'spreadsheet' | 'cards';

interface CleanProduct {
  title: string; asin: string; price: number; compareAt: number; image: string;
  description: string; vendor: string; category: string; tags: string; status: string; quantity: number;
  profit: number; profitPct: number; sellPrice: number;
  stockStatus: 'In Stock' | 'Out of Stock' | 'Unknown';
  dateChecked: string;
  rating: number; reviews: number; bsr: number;
  shopifyStatus: 'not_pushed' | 'pushing' | 'pushed' | 'failed';
  shopifyError: string;
  selected: boolean;
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

const MARKUP = 1.70; // 70% markup

function runGates(p: CleanProduct): CleanProduct {
  const g = { title:'fail' as GateStatus, image:'fail' as GateStatus, price:'fail' as GateStatus, asin:'fail' as GateStatus, description:'fail' as GateStatus };
  if (p.title && p.title.length > 5 && !p.title.includes('<') && p.title.toLowerCase() !== 'unknown product') g.title = 'pass';
  else if (p.title?.length > 0) g.title = 'warn';
  if (p.image?.startsWith('http')) g.image = 'pass';
  if (p.price > 0) g.price = 'pass'; else if (p.compareAt > 0) g.price = 'warn';
  if (p.asin && /^B[0-9A-Z]{9}$/.test(p.asin)) g.asin = 'pass';
  if (p.description?.length > 30) g.description = 'pass'; else if (p.description?.length > 0) g.description = 'warn';

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
    shopifyStatus: p.shopifyStatus || 'not_pushed', shopifyError: p.shopifyError || '', selected: p.selected || false,
    gates: g, gateCount: Object.values(g).filter(v => v === 'pass').length };
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
      profit: 0, profitPct: 0, sellPrice: 0,
      stockStatus: 'Unknown', dateChecked: '',
      rating: 0, reviews: 0, bsr: 0,
      shopifyStatus: 'not_pushed', shopifyError: '', selected: false,
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
    profit:0, profitPct:0, sellPrice:0,
    stockStatus:'Unknown' as const, dateChecked:'',
    rating:0, reviews:0, bsr:0,
    shopifyStatus:'not_pushed' as const, shopifyError:'', selected:false,
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
const COLS = ['title','asin','price','sellPrice','profit','profitPct','stockStatus','image','rating','reviews','bsr','vendor','category','description','dateChecked','status'] as const;
const COL_LABELS = ['Title','ASIN/SKU','Cost','Sell Price','Profit $','Profit %','Stock','Image URL','Rating','Reviews','BSR','Vendor','Category','Description','Checked','Status'];
const COL_WIDTHS = [280,120,70,80,70,70,85,200,60,80,80,120,140,300,90,70];

function SpreadsheetView({ products, onUpdate, perPage = 50, onToggleSelect, onSelectAll }: { products: CleanProduct[]; onUpdate: (idx: number, field: string, val: string) => void; perPage?: number; onToggleSelect?: (idx: number) => void; onSelectAll?: (val: boolean) => void }) {
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
                <tr key={globalIdx} style={{ borderBottom:'1px solid #0a0a0a', background: p.selected ? '#1a1a2e22' : 'transparent' }}>
                  <td style={{ padding:'4px 4px', textAlign:'center' }}>
                    <input type="checkbox" checked={p.selected || false} onChange={() => onToggleSelect?.(globalIdx)} style={{ cursor:'pointer' }} />
                  </td>
                  <td style={{ padding:'4px 6px', fontSize:'9px', color:'#333', textAlign:'center' }}>{globalIdx+1}</td>
                  <td style={{ padding:'4px 6px', textAlign:'center' }}>
                    <span style={{ fontSize:'9px', fontWeight:700, padding:'1px 6px', borderRadius:'3px',
                      background: p.gateCount===5?'rgba(22,163,74,0.15)':p.gateCount>=3?'rgba(245,158,11,0.15)':'rgba(239,68,68,0.15)',
                      color: p.gateCount===5?'#16a34a':p.gateCount>=3?'#f59e0b':'#ef4444',
                    }}>{p.gateCount}/5</span>
                  </td>
                  <td style={{ padding:'4px 6px', textAlign:'center' }}>
                    <span style={{ fontSize:'8px', fontWeight:600, padding:'1px 6px', borderRadius:'3px',
                      background: p.shopifyStatus==='pushed'?'rgba(22,163,74,0.15)':p.shopifyStatus==='pushing'?'rgba(245,158,11,0.15)':p.shopifyStatus==='failed'?'rgba(239,68,68,0.15)':'transparent',
                      color: p.shopifyStatus==='pushed'?'#16a34a':p.shopifyStatus==='pushing'?'#f59e0b':p.shopifyStatus==='failed'?'#ef4444':'#333',
                    }} title={p.shopifyError}>{p.shopifyStatus==='pushed'?'✅ Synced':p.shopifyStatus==='pushing'?'⏳':p.shopifyStatus==='failed'?'❌ Failed':'—'}</span>
                  </td>
                  {COLS.map((col, ci) => {
                    const val = String(p[col] ?? '');
                    const isGated = ['title','image','price','asin','description'].includes(col);
                    const gateKey = col === 'compareAt' ? null : col as keyof typeof p.gates;
                    const gateStatus = gateKey && p.gates[gateKey];
                    return (
                      <td key={ci} style={{ padding:0, borderLeft:'1px solid #111', position:'relative' }}>
                        <input
                          defaultValue={
                            ['price','sellPrice','profit','compareAt'].includes(col) ? (Number(val) > 0 ? `$${Number(val).toFixed(2)}` : '') :
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
                            color: col === 'profit' || col === 'profitPct' ? (Number(val) > 0 ? '#16a34a' : '#ef4444') :
                              col === 'stockStatus' ? (val === 'In Stock' ? '#16a34a' : val === 'Out of Stock' ? '#ef4444' : '#555') :
                              col === 'rating' ? (Number(val) >= 4 ? '#16a34a' : Number(val) >= 3 ? '#f59e0b' : '#ef4444') :
                              col === 'sellPrice' ? '#06b6d4' :
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
// XLSX EXPORT + DOWNLOAD
// ═══════════════════════════════════════════════════════════
async function exportAndDownload(products: CleanProduct[], filename: string) {
  const { utils, writeFile } = await import('xlsx');
  const data = products.map(p => ({
    'Title': p.title, 'ASIN/SKU': p.asin, 'Cost': p.price || '', 'Sell Price': p.sellPrice || '',
    'Profit $': p.profit || '', 'Profit %': p.profitPct ? `${p.profitPct}%` : '',
    'Stock': p.stockStatus, 'Image URL': p.image, 'Rating': p.rating || '', 'Reviews': p.reviews || '',
    'BSR': p.bsr || '', 'Vendor': p.vendor, 'Category': p.category,
    'Description': p.description, 'Date Checked': p.dateChecked, 'Status': p.status, 'Gates': `${p.gateCount}/5`,
  }));
  const ws = utils.json_to_sheet(data);
  ws['!cols'] = [55,14,10,12,10,10,12,60,8,10,10,20,25,80,12,10,8].map(w => ({ wch: w }));
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
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0, tokensLeft: 0, currentBatch: '', error: '' });
  const [criteria, setCriteria] = useState({ minPrice: 3, maxPrice: 25, minRating: 3.5, minReviews: 500, maxBSR: 100000, markup: 70, maxRetail: 40 });
  const [showCriteria, setShowCriteria] = useState(false);
  const [pushing, setPushing] = useState(false);
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

  // Bulk delete selected
  const deleteSelected = useCallback(() => {
    if (!analysis) return;
    const remaining = analysis.products.filter(p => !p.selected);
    const passed = remaining.filter(x => x.gateCount === 5).length;
    const failed = remaining.filter(x => x.gateCount < 3).length;
    setAnalysis({ ...analysis, products: remaining, uniqueProducts: remaining.length, passed, failed, warned: remaining.length - passed - failed });
  }, [analysis]);

  // Push selected or all passed to Shopify — one at a time
  const pushToShopify = useCallback(async (selectedOnly = false) => {
    if (!analysis) return;
    const toPush = selectedOnly
      ? analysis.products.filter(p => p.selected && p.gateCount === 5 && p.image && p.title)
      : analysis.products.filter(p => p.gateCount === 5 && p.image && p.title && p.shopifyStatus !== 'pushed');
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
              image: p.image, description: p.description, vendor: p.vendor, category: p.category,
              rating: p.rating, reviews: p.reviews, bsr: p.bsr, stockStatus: p.stockStatus,
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
    const toPush = analysis.products.filter(p => p.gateCount === 5 && p.image && p.title && p.shopifyStatus !== 'pushed');
    if (!toPush.length) return;

    setPushing(true);
    (window as Record<string, number>).__pushStart = Date.now();
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
                image: p.image, description: p.description, vendor: p.vendor, category: p.category,
                rating: p.rating, reviews: p.reviews, bsr: p.bsr,
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
    const unenriched = analysis.products.filter(p => p.asin && /^B[0-9A-Z]{9}$/.test(p.asin) && (p.gateCount < 5 || !p.title));
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
    const passed = updated.filter(x => x.gateCount === 5).length;
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
              {(['spreadsheet','cards','table'] as const).map(m => (
                <button key={m} onClick={() => setViewMode(m)} style={{
                  padding:'5px 12px', fontSize:'9px', fontWeight:600, border:'none', cursor:'pointer', textTransform:'uppercase', letterSpacing:'0.5px',
                  background: viewMode===m ? '#1a1a2e' : 'transparent', color: viewMode===m ? '#fff' : '#444',
                }}>{m === 'spreadsheet' ? '📊 Sheet' : m === 'cards' ? '🃏 Cards' : '📋 Table'}</button>
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
            {analysis.passed > 0 && !pushing && (
              <button onClick={bulkPushToShopify}
                style={{ padding:'6px 14px', borderRadius:'6px', border:'none', background:'#f59e0b', color:'#000', fontSize:'10px', fontWeight:700, cursor:'pointer' }}>
                🚀 Push All Passed ({analysis.products.filter(p => p.gateCount === 5 && p.image && p.title && p.shopifyStatus !== 'pushed').length})
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
                    ~{Math.ceil((pushProgress.total - pushProgress.done) / Math.max(1, pushProgress.done / ((Date.now() - (window as Record<string, number>).__pushStart || Date.now()) / 60000)))} min left
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
                <div key={i} style={{ background:'#111', borderRadius:'12px', border:'1px solid #1a1a2e', overflow:'hidden', position:'relative' }}>
                  {/* Stock badge */}
                  <div style={{ position:'absolute', top:8, left:8, zIndex:2 }}>
                    <span style={{ padding:'2px 8px', borderRadius:'4px', fontSize:'8px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px',
                      background: p.stockStatus === 'In Stock' ? 'rgba(22,163,74,0.9)' : p.stockStatus === 'Out of Stock' ? 'rgba(239,68,68,0.9)' : 'rgba(85,85,85,0.9)',
                      color:'#fff' }}>
                      {p.stockStatus === 'In Stock' ? 'In Stock' : p.stockStatus === 'Out of Stock' ? 'OOS' : 'Unknown'}
                    </span>
                  </div>
                  {/* Gate badge */}
                  <div style={{ position:'absolute', top:8, right:8, zIndex:2 }}>
                    <span style={{ padding:'2px 8px', borderRadius:'4px', fontSize:'8px', fontWeight:700,
                      background: p.gateCount===5?'rgba(22,163,74,0.9)':p.gateCount>=3?'rgba(245,158,11,0.9)':'rgba(239,68,68,0.9)',
                      color:'#fff' }}>{p.gateCount}/5</span>
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
            <SpreadsheetView products={filtered} onUpdate={handleUpdate} perPage={perPage} onToggleSelect={toggleSelect} onSelectAll={selectAll} />
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

          {/* Product Cards — always shown below spreadsheet/table */}
          {viewMode !== 'cards' && filtered.some(p => p.image) && (
            <div style={{ marginTop:'16px' }}>
              <h3 style={{ fontSize:'10px', color:'#555', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 10px' }}>
                Product Preview ({Math.min(filtered.filter(p => p.image).length, perPage)} of {filtered.filter(p => p.image).length} with images)
              </h3>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:'10px' }}>
                {filtered.filter(p => p.image).slice(0, perPage).map((p, i) => (
                  <div key={i} style={{ background:'#111', borderRadius:'10px', border:'1px solid #1a1a2e', overflow:'hidden', position:'relative' }}>
                    {/* Badges */}
                    <div style={{ position:'absolute', top:6, left:6, zIndex:2, display:'flex', gap:'4px' }}>
                      <span style={{ padding:'2px 6px', borderRadius:'3px', fontSize:'7px', fontWeight:700, textTransform:'uppercase',
                        background: p.stockStatus === 'In Stock' ? 'rgba(22,163,74,0.9)' : p.stockStatus === 'Out of Stock' ? 'rgba(239,68,68,0.9)' : 'rgba(85,85,85,0.9)', color:'#fff' }}>
                        {p.stockStatus === 'In Stock' ? 'In Stock' : p.stockStatus === 'Out of Stock' ? 'OOS' : '?'}
                      </span>
                      {p.rating > 0 && <span style={{ padding:'2px 6px', borderRadius:'3px', fontSize:'7px', fontWeight:700, background:'rgba(245,158,11,0.9)', color:'#000' }}>★{p.rating}</span>}
                    </div>
                    <div style={{ position:'absolute', top:6, right:6, zIndex:2 }}>
                      <span style={{ padding:'2px 6px', borderRadius:'3px', fontSize:'7px', fontWeight:700,
                        background: p.gateCount===5?'rgba(22,163,74,0.9)':p.gateCount>=3?'rgba(245,158,11,0.9)':'rgba(239,68,68,0.9)', color:'#fff' }}>{p.gateCount}/5</span>
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
      </div>
    </div>
  );
}
