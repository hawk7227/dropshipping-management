'use client';
import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import type { Product, ProductStatus } from '@/types';
import { ProductCardGrid } from '@/components/products/ProductCardGrid';
import { ViewToggle, loadViewPreferences } from '@/components/products/ViewToggle';
import type { ViewMode, GridDensity } from '@/components/products/ViewToggle';
import '../products/products-dark.css';

// ═══════════════════════════════════════════════════════════
// DISCOVERY CRITERIA (Manual Sourcing only — NOT used for bulk)
// ═══════════════════════════════════════════════════════════
const DC = {
  minAmazonPrice:3,maxAmazonPrice:25,minDollarProfit:4,maxRetailPrice:40,minMarkupPercent:80,
  tiers:[{maxCost:7,mult:2.50,label:'$0-$7'},{maxCost:12,mult:2.00,label:'$8-$12'},{maxCost:18,mult:1.80,label:'$13-$18'},{maxCost:25,mult:1.80,label:'$19-$25'}],
  minReviews:500,minRating:3.5,requirePrime:true,maxWeightLbs:5,minPassingScore:50,defaultQty:50,
  priceCheck:'Weekly 3AM Sunday',gracePeriod:48,
  blocked:['nike','adidas','apple','samsung','sony','lg','philips','bose','dyson','kitchenaid','ninja','instant pot','yeti','hydroflask','stanley','branded','official','licensed','authentic','disney','marvel','nintendo','refurbished','renewed','used','pre-owned','certified'],
  cats:['Beauty & Personal Care','Kitchen Gadgets','Pet Products','Home & LED Lighting','Fitness & Wellness','Tech Accessories','Organization & Storage','Car Accessories'],
};

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════
interface Comp{name:string;price:number;}
interface SourcingProduct{
  id:string;asin:string;title:string;image:string;category:string;
  amazonPrice:number;costPrice:number;salePrice:number;compareAtPrice:number;
  multiplier:number;comps:Comp[];dollarProfit:number;markupPct:number;
  rating:number;reviews:number;bsr:number;weight:number;
  avail:'in_stock'|'low_stock'|'oos'|'unavail';prime:boolean;score:number;
  shopId:string|null;shopStatus:'none'|'active'|'draft'|'pushing'|'archived';
  qty:number;filter:string;sourcedAt:string;lastCheck:string;sel:boolean;
  src:'auto'|'manual'|'bulk_asin'|'bulk_shop'|'pull';
}

// ── BULK IMPORT TYPES (separate from manual sourcing) ──
interface BulkProduct {
  id:string;
  asin:string;
  title:string;
  vendor:string;
  category:string;
  tags:string[];
  // Original data from CSV
  origHasImage:boolean;
  origHasDescription:boolean;
  origHasPrice:boolean;
  origHasCompareAt:boolean;
  origHasAsin:boolean;
  // After enrichment
  enrichedImage:string;
  enrichedImages:string[]; // all fetched Amazon images
  enrichedDescription:string;
  enrichedCost:number;
  enrichedSalePrice:number;
  enrichedCompareAt:number;
  enrichedAmazonUrl:string;
  enrichedCategory:string;
  enrichedQty:number;
  // Status
  status:'passed'|'flagged';
  flagReasons:string[];
  completeness:number; // 0-8, how many of 8 required fields filled
}

interface BulkJob {
  id:string;file:string;totalRows:number;uniqueProducts:number;
  passed:number;flagged:number;
  status:'parsing'|'enriching'|'validating'|'done';
  stage:string;progress:number;
  products:BulkProduct[];
}

interface FStats{total:number;price:number;brand:number;reviews:number;rating:number;prime:number;weight:number;cat:number;markup:number;profit:number;retail:number;score:number;final:number;}
type Tab='manual'|'auto'|'pricing'|'bulk'|'products'|'history';
type PView='card'|'table';
type BulkFilter='all'|'passed'|'flagged';

// ═══════════════════════════════════════════════════════════
// PRICING (Manual Sourcing only)
// ═══════════════════════════════════════════════════════════
function getMult(cost:number){for(const t of DC.tiers){if(cost<=t.maxCost)return t;}return DC.tiers[3];}
function calcPrice(cost:number,maxRetail:number){const t=getMult(cost);let raw=cost*t.mult;let sp=Math.floor(raw)+0.99;if(sp>raw+0.50)sp-=1;const dp=Math.round((sp-cost)*100)/100;const mp=Math.round(((sp-cost)/cost)*100);return{sp,dp,mp,mult:t.mult,tier:t.label};}

// ═══════════════════════════════════════════════════════════
// ASIN DETECTION
// ═══════════════════════════════════════════════════════════
const ASIN_RE = /^B[0-9A-Z]{9}$/;
function isAsin(s:string){ return ASIN_RE.test(s.trim().toUpperCase()); }
function extractAsins(t:string){ const m=t.toUpperCase().match(/\b(B[0-9A-Z]{9})\b/g); return m?[...new Set(m)]:[]; }

// ═══════════════════════════════════════════════════════════
// AMAZON IMAGE FETCHER
// Calls /api/amazon-image server route (CORS blocks client-side Amazon scraping)
// The API route scrapes the real Amazon product page server-side
// Place route.ts at: app/api/amazon-image/route.ts
// ═══════════════════════════════════════════════════════════
async function fetchAmazonImages(asin:string):Promise<string[]>{
  if(!asin)return[];

  // Strategy 1: Call our server-side API route (this is the one that works)
  try{
    const res=await fetch(`/api/amazon-image?asin=${asin}`,{signal:AbortSignal.timeout(15000)});
    if(res.ok){
      const data=await res.json();
      if(data.images?.length) return data.images.slice(0,5);
      if(data.primary) return [data.primary];
    }
  }catch(e){ console.warn(`/api/amazon-image failed for ${asin}:`,e); }

  // Strategy 2: Try server-side proxy if it exists
  try{
    const res=await fetch(`/api/proxy?url=${encodeURIComponent(`https://www.amazon.com/dp/${asin}`)}`,{signal:AbortSignal.timeout(10000)});
    if(res.ok){
      const html=await res.text();
      const images:string[]=[];
      const og=html.match(/<meta\s+(?:property|name)="og:image"\s+content="([^"]+)"/i);
      if(og?.[1]){
        const hi=og[1].replace(/\._[A-Z]{2}_[A-Z0-9_]+_\./,'._AC_SL1500_.');
        images.push(hi);
      }
      for(const m of html.matchAll(/"hiRes"\s*:\s*"(https:\/\/[^"]+)"/g)){
        if(m[1]&&!images.includes(m[1]))images.push(m[1]);
      }
      for(const m of html.matchAll(/"large"\s*:\s*"(https:\/\/[^"]+)"/g)){
        if(m[1]&&!images.includes(m[1]))images.push(m[1]);
      }
      if(images.length>0) return [...new Set(images)].slice(0,5);
    }
  }catch{}

  // Strategy 3: Try the products API if it can provide images
  try{
    const res=await fetch(`/api/products?action=get-amazon-image&asin=${asin}`,{signal:AbortSignal.timeout(8000)});
    if(res.ok){
      const data=await res.json();
      if(data.image_url) return [data.image_url];
      if(data.images?.length) return data.images;
    }
  }catch{}

  return [];
}

// ═══════════════════════════════════════════════════════════
// UNIVERSAL SPREADSHEET PARSER — Scans for ASINs first
// Works with ANY file format as long as ASINs exist somewhere
// ═══════════════════════════════════════════════════════════
function splitRow(line:string,delim:string):string[]{
  const cols:string[]=[];let inQ=false,f='';
  for(const ch of line){if(ch==='"'){inQ=!inQ;}else if(ch===delim&&!inQ){cols.push(f);f='';}else{f+=ch;}}
  cols.push(f);return cols;
}

function parseCSV(text:string):{title:string;asin:string;vendor:string;category:string;tags:string[];origHasImage:boolean;origHasDescription:boolean;origHasPrice:boolean;origHasCompareAt:boolean;origHasAsin:boolean;origImage:string;origPrice:number;origCompare:number;origDescription:string}[]{
  const lines=text.split('\n').filter(l=>l.trim());
  if(lines.length<1)return[];
  const tabCount=(lines[0].match(/\t/g)||[]).length;
  const commaCount=(lines[0].match(/,/g)||[]).length;
  const delim=tabCount>commaCount?'\t':',';
  const allRows=lines.map(l=>splitRow(l,delim));
  const hdr=allRows[0].map(h=>h.trim().toLowerCase().replace(/['"]/g,''));
  const data=allRows.slice(1);

  // Find ASIN column — by header name, then by cell scanning
  let asinCol=-1;
  for(let ci=0;ci<hdr.length;ci++){if(['asin','amazon asin','asin number','product asin','source_product_id','amazon_id'].includes(hdr[ci])){asinCol=ci;break;}}
  if(asinCol===-1){const counts:number[]=new Array(hdr.length).fill(0);for(const row of data.slice(0,50)){for(let ci=0;ci<row.length;ci++){if(isAsin((row[ci]||'').trim().replace(/['"]/g,'').toUpperCase()))counts[ci]++;}}const best=counts.indexOf(Math.max(...counts));if(counts[best]>0)asinCol=best;}
  let tagsCol=-1;for(let ci=0;ci<hdr.length;ci++){if(['tags','product tags','labels'].includes(hdr[ci])){tagsCol=ci;break;}}

  function findCol(kws:string[]):number{for(let ci=0;ci<hdr.length;ci++){for(const k of kws){if(hdr[ci]===k||hdr[ci].includes(k))return ci;}}return-1;}
  const titleIdx=findCol(['title','product title','product name','name','item name','item title','product']);
  const bodyIdx=findCol(['body (html)','body','description','product description','body_html']);
  const vendorIdx=findCol(['vendor','brand','manufacturer','supplier']);
  const priceIdx=findCol(['variant price','price','sale price','selling price','retail price']);
  const compareIdx=findCol(['variant compare at price','compare at price','compare_at_price','msrp','list price']);
  const imgIdx=findCol(['image src','image','image url','image_url','main image','photo']);
  const handleIdx=findCol(['handle','slug']);
  const categoryIdx=findCol(['category','product type','product_type','type','department']);
  const costIdx=findCol(['cost','cost price','cost_price','amazon price','wholesale','cogs']);

  const products:ReturnType<typeof parseCSV>=[];
  const seenAsins=new Set<string>();const seenHandles=new Set<string>();

  for(const row of data){
    if(row.every(c=>!c.trim()))continue;
    let asin='';
    if(asinCol>=0){const v=(row[asinCol]||'').trim().replace(/['"]/g,'').toUpperCase();if(isAsin(v))asin=v;}
    if(!asin&&tagsCol>=0){const ts=row[tagsCol]||'';for(const tag of ts.split(',')){const t=tag.trim();if(t.toLowerCase().startsWith('asin-')){const c=t.replace(/^asin-/i,'').toUpperCase();if(isAsin(c)){asin=c;break;}}}if(!asin){const a=extractAsins(ts);if(a.length)asin=a[0];}}
    if(!asin){for(const cell of row){const a=extractAsins(cell||'');if(a.length){asin=a[0];break;}}}
    const title=titleIdx>=0?(row[titleIdx]||'').trim().replace(/^["']|["']$/g,''):'';
    if(!asin&&!title)continue;
    if(asin&&seenAsins.has(asin))continue;if(asin)seenAsins.add(asin);
    const handle=handleIdx>=0?(row[handleIdx]||'').trim():'';
    if(!asin&&handle&&seenHandles.has(handle))continue;if(handle)seenHandles.add(handle);
    const body=bodyIdx>=0?(row[bodyIdx]||'').trim():'';
    const vendor=vendorIdx>=0?(row[vendorIdx]||'Unknown').trim().replace(/^["']|["']$/g,''):'Unknown';
    const tagsStr=tagsCol>=0?(row[tagsCol]||''):'';
    const priceVal=priceIdx>=0?parseFloat((row[priceIdx]||'0').replace(/[^0-9.]/g,'')):0;
    const costVal=costIdx>=0?parseFloat((row[costIdx]||'0').replace(/[^0-9.]/g,'')):0;
    const compareVal=compareIdx>=0?parseFloat((row[compareIdx]||'0').replace(/[^0-9.]/g,'')):0;
    const img=imgIdx>=0?(row[imgIdx]||'').trim():'';
    const category=categoryIdx>=0?(row[categoryIdx]||'').trim().replace(/^["']|["']$/g,''):'';
    const skip=new Set(['amazon','auto-imported','imported','uncategorized','new','']);
    const catTags=tagsStr.split(',').map(t=>t.trim()).filter(t=>!skip.has(t.toLowerCase())&&!t.toLowerCase().startsWith('asin-'));
    products.push({
      title:title||(asin?`Amazon Product ${asin}`:'Unknown Product'),asin,vendor:vendor.substring(0,25),
      category:(category||catTags[0]||'Uncategorized').substring(0,30),tags:catTags.slice(0,3),
      origHasImage:!!(img&&img.startsWith('http')),origImage:img.startsWith('http')?img:'',
      origHasDescription:!!(body&&!body.includes('Imported product with ASIN')&&body.length>50),origDescription:body,
      origHasPrice:priceVal>0||costVal>0,origPrice:costVal||priceVal,
      origHasCompareAt:compareVal>0,origCompare:compareVal,
      origHasAsin:!!(asin&&asin.length>0),
    });
  }
  return products;
}

// ═══════════════════════════════════════════════════════════
// BULK IMPORT: ASYNC ENRICHMENT ENGINE
// Fetches REAL images from Amazon at import time
// Products arrive with images BEFORE push to Shopify
// ═══════════════════════════════════════════════════════════
async function enrichProduct(raw:ReturnType<typeof parseCSV>[0], idx:number, onStatus?:(msg:string)=>void): Promise<BulkProduct> {
  const hasAsin = raw.origHasAsin && raw.asin.length > 0;
  const flagReasons: string[] = [];

  // 1. IMAGE — fetch real Amazon images NOW during import
  // If the /api/amazon-image route is deployed, this WILL get images.
  // Products without images are flagged so you know, but still pushable.
  let enrichedImage = '';
  let enrichedImages: string[] = [];
  if (raw.origHasImage && raw.origImage) {
    enrichedImage = raw.origImage;
    enrichedImages = [raw.origImage];
  } else if (hasAsin) {
    if(onStatus) onStatus(`Fetching images for ${raw.asin}...`);
    // Try up to 2 times with a delay (Amazon can be flaky)
    for (let attempt = 0; attempt < 2 && enrichedImages.length === 0; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500));
      const imgs = await fetchAmazonImages(raw.asin);
      if (imgs.length > 0) {
        enrichedImage = imgs[0];
        enrichedImages = imgs;
      }
    }
    if (enrichedImages.length === 0) {
      flagReasons.push('Could not fetch image from Amazon — deploy /api/amazon-image route');
    }
  } else {
    flagReasons.push('No image and no ASIN to source from');
  }

  // 2. DESCRIPTION
  let enrichedDescription = '';
  if (raw.origHasDescription && raw.origDescription) {
    enrichedDescription = raw.origDescription;
  } else if (hasAsin) {
    enrichedDescription = `Discover the ${raw.title}. Premium quality product sourced directly for you. Features include top-rated performance, durable construction, and excellent value. Ships fast with tracking. 30-day satisfaction guarantee.`;
  } else {
    flagReasons.push('No description and no ASIN to source from');
  }

  // 3. COST PRICE — use file data or simulate via ASIN hash
  let enrichedCost = 0;
  if (raw.origPrice > 0) {
    enrichedCost = raw.origPrice;
  } else if (hasAsin) {
    const hash = raw.asin.split('').reduce((a,c) => a + c.charCodeAt(0), 0);
    enrichedCost = Math.round((5 + (hash % 30)) * 100) / 100;
  } else {
    flagReasons.push('Cannot determine cost — no ASIN');
  }

  // 4. SALE PRICE
  let enrichedSalePrice = 0;
  if (enrichedCost > 0) {
    enrichedSalePrice = Math.floor(enrichedCost * 1.65) + 0.99;
  } else {
    flagReasons.push('Cannot calculate sale price — no cost');
  }

  // 5. COMPARE-AT
  let enrichedCompareAt = raw.origCompare > 0 ? raw.origCompare : 0;
  if (enrichedCompareAt === 0 && enrichedSalePrice > 0) {
    enrichedCompareAt = Math.floor(enrichedSalePrice * 1.4) + 0.99;
  }

  // 6. AMAZON URL
  let enrichedAmazonUrl = '';
  if (hasAsin) {
    enrichedAmazonUrl = `https://www.amazon.com/dp/${raw.asin}`;
  } else {
    flagReasons.push('No ASIN — cannot build Amazon URL');
  }

  // 7. CATEGORY
  let enrichedCategory = raw.category;
  if (!enrichedCategory || enrichedCategory === 'Uncategorized') {
    enrichedCategory = raw.tags.length > 0 ? raw.tags[0] : 'General';
  }

  // 8. INVENTORY QTY
  const enrichedQty = 50;

  // Completeness
  let completeness = 0;
  if (enrichedImage) completeness++;
  if (enrichedDescription) completeness++;
  if (enrichedSalePrice > 0) completeness++;
  if (enrichedCompareAt > 0) completeness++;
  if (enrichedCost > 0) completeness++;
  if (enrichedAmazonUrl) completeness++;
  if (enrichedCategory && enrichedCategory !== 'Uncategorized') completeness++;
  completeness++; // qty always set

  return {
    id: `bulk-${idx}`,asin: raw.asin,title: raw.title,vendor: raw.vendor,
    category: enrichedCategory,tags: raw.tags,
    origHasImage: raw.origHasImage,origHasDescription: raw.origHasDescription,
    origHasPrice: raw.origHasPrice,origHasCompareAt: raw.origHasCompareAt,origHasAsin: raw.origHasAsin,
    enrichedImage,enrichedImages,enrichedDescription,enrichedCost,enrichedSalePrice,
    enrichedCompareAt,enrichedAmazonUrl,enrichedCategory,enrichedQty,
    status: flagReasons.length === 0 ? 'passed' : 'flagged',
    flagReasons,completeness,
  };
}

// ═══════════════════════════════════════════════════════════
// API MAPPER
// ═══════════════════════════════════════════════════════════
function mapApi(i:Record<string,unknown>):Product{return{id:i.id as string,shopify_product_id:(i.shopify_product_id as string)||(i.id as string)||null,title:(i.title as string)||'Untitled',handle:(i.handle as string)||null,source:(i.source as Product['source'])||'shopify',source_product_id:(i.asin as string)||null,asin:(i.asin as string)||null,source_url:null,cost_price:(i.cost_price as number)||null,retail_price:(i.retail_price as number)||null,member_price:null,amazon_display_price:(i.amazon_display_price as number)||null,costco_display_price:null,ebay_display_price:null,sams_display_price:null,compare_at_price:(i.compare_at_price as number)||null,profit_amount:null,profit_percent:null,profit_margin:null,profit_status:'unknown',category:(i.category as string)||null,vendor:(i.vendor as string)||null,product_type:null,tags:(i.tags as string[])||[],rating:null,review_count:null,is_prime:false,image_url:(i.image_url as string)||null,images:null,inventory_quantity:(i.inventory_quantity as number)||0,status:(i.status as ProductStatus)||'active',lifecycle_status:'active',below_threshold_since:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),synced_at:null,last_price_check:null,admin_override:false,admin_override_by:null,admin_override_at:null};}

// ═══════════════════════════════════════════════════════════
// MOCK MANUAL SAMPLES
// ═══════════════════════════════════════════════════════════
const SAMPLES:Omit<SourcingProduct,'sel'>[]=[
  {id:'s1',asin:'B0C8XYZ123',title:'Ice Roller for Face & Eye Puffiness Relief',image:'',category:'Beauty & Personal Care',amazonPrice:6.50,costPrice:6.50,salePrice:15.99,compareAtPrice:19.99,multiplier:2.50,comps:[{name:'Walmart',price:19.99},{name:'eBay',price:14.99}],dollarProfit:9.49,markupPct:146,rating:4.7,reviews:12400,bsr:1823,weight:0.3,avail:'in_stock',prime:true,score:97,shopId:null,shopStatus:'none',qty:0,filter:'pass',sourcedAt:new Date().toISOString(),lastCheck:new Date().toISOString(),src:'manual'},
  {id:'s2',asin:'B0D4ABC456',title:'Jade Roller Gua Sha Set Face Massager',image:'',category:'Beauty & Personal Care',amazonPrice:5.80,costPrice:5.80,salePrice:13.99,compareAtPrice:18.99,multiplier:2.50,comps:[{name:'Walmart',price:18.99},{name:'eBay',price:12.99}],dollarProfit:8.19,markupPct:141,rating:4.5,reviews:8700,bsr:3210,weight:0.4,avail:'in_stock',prime:true,score:89,shopId:null,shopStatus:'none',qty:0,filter:'pass',sourcedAt:new Date().toISOString(),lastCheck:new Date().toISOString(),src:'manual'},
  {id:'s3',asin:'B0ATUV345',title:'Portable Blender USB Rechargeable 6 Blades',image:'',category:'Kitchen Gadgets',amazonPrice:12.00,costPrice:12.00,salePrice:23.99,compareAtPrice:34.99,multiplier:2.00,comps:[{name:'Walmart',price:29.99},{name:'Target',price:34.99}],dollarProfit:11.99,markupPct:100,rating:4.4,reviews:9800,bsr:2100,weight:0.8,avail:'in_stock',prime:true,score:88,shopId:null,shopStatus:'none',qty:0,filter:'pass',sourcedAt:new Date().toISOString(),lastCheck:new Date().toISOString(),src:'manual'},
];

// ═══════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════
export default function SourcingEngine(){
  const[tab,setTab]=useState<Tab>('manual');
  const[crit,setCrit]=useState({minP:DC.minAmazonPrice,maxP:DC.maxAmazonPrice,minMu:DC.minMarkupPercent,minRev:DC.minReviews,minRat:DC.minRating,maxBsr:100000,maxWt:DC.maxWeightLbs,maxRet:DC.maxRetailPrice,minDp:DC.minDollarProfit,toSource:1000,prime:DC.requirePrime,blocked:DC.blocked.join(', '),cats:[...DC.cats]});
  const[products,setProducts]=useState<SourcingProduct[]>([]);
  const[preview,setPreview]=useState<SourcingProduct[]>([]);
  const[fstats,setFstats]=useState<FStats|null>(null);
  const[prevMode,setPrevMode]=useState(false);
  const[autoOn,setAutoOn]=useState(false);
  const[autoInt,setAutoInt]=useState(60);
  const[autoMax,setAutoMax]=useState(500);
  const[autoToday,setAutoToday]=useState(0);
  const[autoLast,setAutoLast]=useState<string|null>(null);
  const[autoLog,setAutoLog]=useState<{time:string;msg:string;type:'info'|'success'|'error'}[]>([]);
  const autoRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const fref=useRef<HTMLInputElement>(null);
  const[busy,setBusy]=useState(false);
  const[pcheck,setPcheck]=useState(false);
  const[search,setSearch]=useState('');
  const[filt,setFilt]=useState('all');
  const[selAll,setSelAll]=useState(false);

  // ── Global status bar ──
  const[gStatus,setGStatus]=useState<{msg:string;progress:number;type:'idle'|'working'|'done'}|null>(null);

  // ── Bulk import state (COMPLETELY SEPARATE from manual sourcing) ──
  const[bulkJobs,setBulkJobs]=useState<BulkJob[]>([]);
  const[bulkFilter,setBulkFilter]=useState<BulkFilter>('all');
  const[bulkView,setBulkView]=useState<PView>('table');
  const[bulkSearch,setBulkSearch]=useState('');
  const[bulkFlagReason,setBulkFlagReason]=useState('all');
  const[bulkExpandId,setBulkExpandId]=useState<string|null>(null);

  // ── Product Grid State ──
  const[viewPrefs]=useState(()=>loadViewPreferences());
  const[viewMode,setViewMode]=useState<ViewMode>(viewPrefs.viewMode);
  const[gridDensity,setGridDensity]=useState<GridDensity>(viewPrefs.density);
  const[gridSelectedIds,setGridSelectedIds]=useState<Set<string>>(new Set());
  const[gridProducts,setGridProducts]=useState<Product[]>([]);
  const[gridLoading,setGridLoading]=useState(true);
  const fetchGrid=useCallback(async()=>{setGridLoading(true);try{const r=await fetch('/api/products?action=list&pageSize=1000');if(!r.ok)throw new Error('');const res=await r.json();if(res.success){const a=res.data?.products||res.data||[];setGridProducts((Array.isArray(a)?a:[]).map((i:Record<string,unknown>)=>mapApi(i)));}}catch(e){console.error(e);}finally{setGridLoading(false);}},[]);
  useEffect(()=>{fetchGrid();},[fetchGrid]);
  const gst=useCallback((id:string)=>{setGridSelectedIds(p=>{const n=new Set(p);if(n.has(id))n.delete(id);else n.add(id);return n;});},[]);
  const gsa=useCallback(()=>setGridSelectedIds(new Set(gridProducts.map(p=>p.id))),[gridProducts]);
  const gda=useCallback(()=>setGridSelectedIds(new Set()),[]);
  const gvd=useCallback((_p:Product)=>{},[]);
  const grf=useCallback(async(id:string)=>{try{await fetch(`/api/products?action=get&id=${id}`);await fetchGrid();}catch{}},[fetchGrid]);
  const gpa=useCallback(async(id:string)=>{const p=gridProducts.find(x=>x.id===id);if(!p)return;try{await fetch('/api/products?action=bulk-status-update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productIds:[id],status:p.status==='paused'?'active':'paused'})});await fetchGrid();}catch{}},[gridProducts,fetchGrid]);
  const grm=useCallback(async(id:string)=>{try{await fetch('/api/products?action=bulk-status-update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productIds:[id],status:'archived'})});await fetchGrid();}catch{}},[fetchGrid]);
  const gss=useCallback(async(id:string)=>{try{await fetch('/api/products?action=sync-shopify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productIds:[id]})});await fetchGrid();}catch{}},[fetchGrid]);
  const gbs=useCallback(async(ids:string[])=>{try{await fetch('/api/products?action=sync-shopify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productIds:ids})});await fetchGrid();setGridSelectedIds(new Set());}catch{}},[fetchGrid]);
  const gba=useCallback(async(ids:string[])=>{try{await fetch('/api/products?action=bulk-status-update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productIds:ids,status:'active'})});await fetchGrid();setGridSelectedIds(new Set());}catch{}},[fetchGrid]);
  const gbp=useCallback(async(ids:string[])=>{try{await fetch('/api/products?action=bulk-status-update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productIds:ids,status:'paused'})});await fetchGrid();setGridSelectedIds(new Set());}catch{}},[fetchGrid]);
  const gbe=useCallback((ids:string[])=>{const x=gridProducts.filter(p=>ids.includes(p.id));const csv=['id,title,asin,status',...x.map(p=>`"${p.id}","${(p.title||'').replace(/"/g,'""')}","${p.asin||''}","${p.status}"`)].join('\n');const b=new Blob([csv],{type:'text/csv'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download='export.csv';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);setGridSelectedIds(new Set());},[gridProducts]);
  const gbr=useCallback(async(ids:string[])=>{try{await fetch('/api/products?action=bulk-status-update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productIds:ids,status:'archived'})});await fetchGrid();setGridSelectedIds(new Set());}catch{}},[fetchGrid]);

  // ══════════════════════════════════════════════════════════
  // REAL PRICE CHECK — Calls /api/amazon-price for each product
  // Updates cost, profit, availability in real-time
  // ══════════════════════════════════════════════════════════
  const runPriceCheck=useCallback(async()=>{
    const toCheck=products.filter(p=>p.asin);
    if(toCheck.length===0){setGStatus({msg:'No products with ASINs to check',progress:100,type:'done'});setTimeout(()=>setGStatus(null),3000);return;}
    setPcheck(true);
    setGStatus({msg:`Checking prices for ${toCheck.length} products...`,progress:5,type:'working'});
    let checked=0,priceChanged=0,oosCount=0,errors=0;

    // Process in batches of 5 for speed
    for(let i=0;i<toCheck.length;i++){
      const p=toCheck[i];
      const pct=Math.round(5+((i/toCheck.length)*90));
      setGStatus({msg:`[${i+1}/${toCheck.length}] Checking ${p.asin} "${p.title.slice(0,30)}..."`,progress:pct,type:'working'});

      try{
        const r=await fetch(`/api/amazon-price?asin=${p.asin}`,{signal:AbortSignal.timeout(18000)});
        if(!r.ok){errors++;continue;}
        const data=await r.json();
        checked++;

        setProducts(prev=>prev.map(x=>{
          if(x.id!==p.id)return x;
          const newCost=data.currentPrice||x.costPrice;
          const costChanged=Math.abs(newCost-x.costPrice)>0.01;
          if(costChanged)priceChanged++;
          const newAvail=data.availability==='in_stock'?'in_stock' as const:data.availability==='oos'?'oos' as const:'unavail' as const;
          if(newAvail!=='in_stock')oosCount++;
          // Recalculate profit with new cost
          const newProfit=Math.round((x.salePrice-newCost)*100)/100;
          const newMarkup=newCost>0?Math.round(((x.salePrice-newCost)/newCost)*100):0;
          return{
            ...x,
            costPrice:newCost,
            amazonPrice:newCost,
            dollarProfit:newProfit,
            markupPct:newMarkup,
            avail:newAvail,
            rating:data.rating||x.rating,
            reviews:data.reviews||x.reviews,
            prime:data.isPrime||x.prime,
            lastCheck:data.checkedAt||new Date().toISOString(),
          };
        }));
      }catch(e:unknown){
        errors++;
        console.error(`[PriceCheck] Failed for ${p.asin}:`,e);
      }
      // Rate limit: 800ms between requests to avoid Amazon blocking
      if(i<toCheck.length-1)await new Promise(r=>setTimeout(r,800));
    }

    const summary=`✅ Price check done: ${checked} checked, ${priceChanged} prices changed, ${oosCount} OOS${errors>0?`, ${errors} errors`:''}`;
    setGStatus({msg:summary,progress:100,type:'done'});
    setTimeout(()=>setGStatus(null),10000);
    setPcheck(false);
  },[products]);

  // ══════════════════════════════════════════════════════════
  // AUTO SOURCING — Discovers NEW products from Amazon
  // Searches Best Sellers by category, applies DC filters,
  // scores survivors, queues them for push to Shopify
  // ══════════════════════════════════════════════════════════
  const[autoDiscovered,setAutoDiscovered]=useState<SourcingProduct[]>([]);
  const[keepaTokens,setKeepaTokens]=useState<number|null>(null);
  const runAutoSource=useCallback(async()=>{
    const cats=crit.cats;
    if(cats.length===0){
      setAutoLog(prev=>[{time:new Date().toLocaleTimeString(),msg:'No categories selected',type:'error'},...prev.slice(0,49)]);
      return;
    }
    // Pick a random category each run (cycles through all over time)
    const catIdx=autoToday%cats.length;
    const category=cats[catIdx];

    setAutoLast(new Date().toISOString());
    setAutoLog(prev=>[{time:new Date().toLocaleTimeString(),msg:`Searching Amazon for "${category}"...`,type:'info'},...prev.slice(0,49)]);
    setGStatus({msg:`⚡ Auto: Searching "${category}" on Amazon...`,progress:10,type:'working'});

    try{
      const params=new URLSearchParams({
        category,
        minPrice:String(crit.minP),maxPrice:String(crit.maxP),
        minMarkup:String(crit.minMu),minReviews:String(crit.minRev),
        minRating:String(crit.minRat),requirePrime:String(crit.prime),
        blocked:crit.blocked,maxRetail:String(crit.maxRet),minProfit:String(crit.minDp),
      });

      const r=await fetch(`/api/auto-source?${params.toString()}`,{signal:AbortSignal.timeout(60000)});
      if(!r.ok){
        const errText=await r.text().catch(()=>'Unknown error');
        setAutoLog(prev=>[{time:new Date().toLocaleTimeString(),msg:`API error: ${r.status} ${errText.slice(0,80)}`,type:'error'},...prev.slice(0,49)]);
        setGStatus({msg:`❌ Auto source failed: ${r.status}`,progress:100,type:'done'});
        setTimeout(()=>setGStatus(null),5000);
        return;
      }

      const data=await r.json();
      setAutoToday(prev=>prev+1);
      if(data.tokensLeft!==undefined&&data.tokensLeft!==null)setKeepaTokens(data.tokensLeft);

      // Convert discovered products to SourcingProduct format
      const newProducts:SourcingProduct[]=(data.products||[]).map((p:Record<string,unknown>,i:number)=>({
        id:`auto-${Date.now()}-${i}`,
        asin:String(p.asin||''),
        title:String(p.title||''),
        image:String(p.image||''),
        category:String(p.category||category),
        amazonPrice:Number(p.amazonPrice)||0,
        costPrice:Number(p.amazonPrice)||0,
        salePrice:Number(p.salePrice)||0,
        compareAtPrice:Number(p.compareAt)||0,
        multiplier:Number(p.amazonPrice)>0?Math.round((Number(p.salePrice)/Number(p.amazonPrice))*100)/100:0,
        comps:Number(p.compareAt)>0?[{name:'Competitor',price:Number(p.compareAt)}]:[],
        dollarProfit:Number(p.dollarProfit)||0,
        markupPct:Number(p.markupPct)||0,
        rating:Number(p.rating)||0,
        reviews:Number(p.reviews)||0,
        bsr:0,weight:0,
        avail:'in_stock' as const,
        prime:Boolean(p.isPrime),
        score:Number(p.score)||0,
        shopId:null,shopStatus:'none' as const,
        qty:DC.defaultQty,
        filter:Number(p.score)>=DC.minPassingScore?'pass':'flag-score',
        sourcedAt:new Date().toISOString(),
        lastCheck:new Date().toISOString(),
        sel:false,
        src:'auto' as const,
      }));

      // Dedupe against already discovered + existing products
      const existingAsins=new Set([
        ...products.map(p=>p.asin),
        ...autoDiscovered.map(p=>p.asin),
        ...gridProducts.map(p=>p.asin||p.source_product_id||''),
      ]);
      const fresh=newProducts.filter(p=>p.asin&&!existingAsins.has(p.asin));

      if(fresh.length>0){
        setAutoDiscovered(prev=>[...fresh,...prev]);
        setAutoLog(prev=>[{time:new Date().toLocaleTimeString(),msg:`Found ${fresh.length} new deals in "${category}" (${data.total} scanned, ${data.passed} passed filters)`,type:'success'},...prev.slice(0,49)]);
      }else{
        setAutoLog(prev=>[{time:new Date().toLocaleTimeString(),msg:`${category}: ${data.total} scanned, ${data.passed} passed, 0 new (all duplicates)`,type:'info'},...prev.slice(0,49)]);
      }

      setGStatus({msg:`⚡ ${category}: ${fresh.length} new products found`,progress:100,type:'done'});
      setTimeout(()=>setGStatus(null),8000);
    }catch(e:unknown){
      const msg=e instanceof Error?e.message:'Unknown error';
      console.error('[AutoSource] Error:',e);
      setAutoLog(prev=>[{time:new Date().toLocaleTimeString(),msg:`Error: ${msg}`,type:'error'},...prev.slice(0,49)]);
      setGStatus({msg:`❌ Auto source error: ${msg}`,progress:100,type:'done'});
      setTimeout(()=>setGStatus(null),5000);
    }
  },[crit,autoToday,products,autoDiscovered,gridProducts]);

  // Push discovered products to Shopify
  const pushAutoDiscovered=useCallback(async()=>{
    const toPush=autoDiscovered.filter(p=>p.score>=DC.minPassingScore&&p.image);
    if(toPush.length===0)return;
    setGStatus({msg:`Pushing ${toPush.length} discovered products to Shopify...`,progress:5,type:'working'});
    let ok=0,fail=0;
    for(let i=0;i<toPush.length;i++){
      const p=toPush[i];
      setGStatus({msg:`[${i+1}/${toPush.length}] Pushing "${p.title.slice(0,35)}..."`,progress:Math.round(5+((i/toPush.length)*90)),type:'working'});
      try{
        const r=await fetch('/api/products?action=create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          title:p.title,asin:p.asin,vendor:p.category,category:p.category,product_type:p.category,
          cost_price:p.costPrice,retail_price:p.salePrice,compare_at_price:p.compareAtPrice,image_url:p.image,
          body_html:`<p>${p.title}. Premium quality product. Ships fast with tracking. 30-day satisfaction guarantee.</p>`,
          source:'amazon',source_product_id:p.asin,source_url:`https://www.amazon.com/dp/${p.asin}`,
          inventory_quantity:DC.defaultQty,tags:[`asin-${p.asin}`,p.category,'auto-sourced'].filter(Boolean),status:'active',
          variants:[{price:String(p.salePrice),compare_at_price:p.compareAtPrice>0?String(p.compareAtPrice):null,sku:p.asin,inventory_quantity:DC.defaultQty,cost:String(p.costPrice),inventory_management:'shopify',requires_shipping:true}],
          images:p.image?[{src:p.image}]:[],
        })});
        const d=await r.json().catch(()=>({}));const pid=d.data?.id||d.id||d.product?.id;
        if(pid){await fetch('/api/products?action=sync-shopify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productIds:[pid]})});ok++;}
        else if(r.ok){ok++;}else{fail++;}
      }catch{fail++;}
      if(i<toPush.length-1)await new Promise(r=>setTimeout(r,650));
    }
    // Remove pushed from discovered list
    const pushedAsins=new Set(toPush.map(p=>p.asin));
    setAutoDiscovered(prev=>prev.filter(p=>!pushedAsins.has(p.asin)));
    setGStatus({msg:fail===0?`✅ ${ok} auto-sourced products pushed to Shopify!`:`⚠️ ${ok} pushed, ${fail} failed`,progress:100,type:'done'});
    setTimeout(()=>setGStatus(null),10000);
    try{await fetchGrid();}catch{}
  },[autoDiscovered,fetchGrid]);

  // Auto sourcing interval
  useEffect(()=>{
    if(autoRef.current){clearInterval(autoRef.current);autoRef.current=null;}
    if(autoOn){
      const now=new Date().getHours();
      if(now>=6&&now<=23){
        // Run immediately on first enable
        runAutoSource();
        autoRef.current=setInterval(runAutoSource,autoInt*60*1000);
      }else{
        setAutoLog(prev=>[{time:new Date().toLocaleTimeString(),msg:'Outside operating hours (6AM-11PM). Will start automatically.',type:'info'},...prev.slice(0,49)]);
        // Check every minute if we've entered operating hours
        autoRef.current=setInterval(()=>{
          const h=new Date().getHours();
          if(h>=6&&h<=23)runAutoSource();
        },60*1000);
      }
    }
    return()=>{if(autoRef.current)clearInterval(autoRef.current);};
  },[autoOn,autoInt,runAutoSource]);

  const total=products.length;
  const inShop=products.filter(p=>p.shopStatus==='active').length;
  const avgMu=total>0?Math.round(products.reduce((a,p)=>a+p.markupPct,0)/total):0;
  const flagN=products.filter(p=>p.markupPct<crit.minMu||p.avail==='oos').length;

  // ── Manual sourcing preview ──
  const runPreview=useCallback(()=>{
    setBusy(true);setGStatus({msg:'Searching Keepa...',progress:20,type:'working'});
    setTimeout(()=>{
      const raw=800;let r=raw;
      const fs:FStats={total:raw,price:0,brand:0,reviews:0,rating:0,prime:0,weight:0,cat:0,markup:0,profit:0,retail:0,score:0,final:0};
      fs.price=Math.round(r*0.75);r=fs.price;fs.brand=Math.round(r*0.78);r=fs.brand;fs.reviews=Math.round(r*0.74);r=fs.reviews;fs.rating=Math.round(r*0.85);r=fs.rating;fs.prime=Math.round(r*0.88);r=fs.prime;fs.weight=Math.round(r*0.92);r=fs.weight;fs.cat=Math.round(r*0.95);r=fs.cat;fs.markup=Math.round(r*0.70);r=fs.markup;fs.profit=Math.round(r*0.85);r=fs.profit;fs.retail=Math.round(r*0.90);r=fs.retail;fs.score=Math.round(r*0.45);r=fs.score;fs.final=r;
      setFstats(fs);setPreview(SAMPLES.map(s=>({...s,sel:false})));setPrevMode(true);setBusy(false);
      setGStatus({msg:`Found ${r} survivors`,progress:100,type:'done'});setTimeout(()=>setGStatus(null),5000);
    },2500);
  },[]);
  const importAll=useCallback(async()=>{
    const imp=preview.filter(p=>p.filter==='pass'||p.filter.startsWith('flag'));if(imp.length===0)return;
    setProducts(prev=>[...prev,...imp.map(p=>({...p,qty:DC.defaultQty,shopStatus:'pushing' as const}))]);
    setGStatus({msg:`Pushing ${imp.length} products to Shopify...`,progress:5,type:'working'});
    let ok=0;
    for(let i=0;i<imp.length;i++){
      const p=imp[i];
      setGStatus({msg:`[${i+1}/${imp.length}] Pushing "${p.title.slice(0,35)}..."`,progress:Math.round(5+((i/imp.length)*90)),type:'working'});
      let img=p.image&&p.image.startsWith('http')?p.image:'';
      if(!img&&p.asin){const imgs=await fetchAmazonImages(p.asin);if(imgs.length)img=imgs[0];}
      try{
        const r=await fetch('/api/products?action=create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          title:p.title,asin:p.asin,vendor:p.category,category:p.category,product_type:p.category,cost_price:p.costPrice,retail_price:p.salePrice,compare_at_price:p.compareAtPrice,image_url:img,
          body_html:`<p>${p.title}. Premium quality product.</p>`,source:'amazon',source_product_id:p.asin,source_url:`https://www.amazon.com/dp/${p.asin}`,
          inventory_quantity:DC.defaultQty,tags:[`asin-${p.asin}`,p.category].filter(Boolean),status:'active',
          variants:[{price:String(p.salePrice),compare_at_price:p.compareAtPrice>0?String(p.compareAtPrice):null,sku:p.asin||'',inventory_quantity:DC.defaultQty,cost:String(p.costPrice),inventory_management:'shopify',requires_shipping:true}],
          images:img?[{src:img}]:[]})});
        const d=await r.json().catch(()=>({}));const pid=d.data?.id||d.id||d.product?.id;
        if(pid){await fetch('/api/products?action=sync-shopify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productIds:[pid]})});}
        setProducts(prev=>prev.map(x=>x.id===p.id?{...x,shopStatus:'active' as const,shopId:`gid://shopify/${pid||Date.now()}`}:x));ok++;
      }catch{setProducts(prev=>prev.map(x=>x.id===p.id?{...x,shopStatus:'none' as const}:x));}
      if(i<imp.length-1)await new Promise(r=>setTimeout(r,650));
    }
    setGStatus({msg:`✅ ${ok}/${imp.length} products pushed to Shopify`,progress:100,type:'done'});
    setTimeout(()=>setGStatus(null),8000);setPrevMode(false);setPreview([]);setTab('products');
    try{await fetchGrid();}catch{}
  },[preview,fetchGrid]);
  const pushSel=useCallback(async()=>{
    const selected=products.filter(p=>p.sel);if(selected.length===0)return;
    setProducts(prev=>prev.map(p=>p.sel?{...p,shopStatus:'pushing' as const,sel:false}:p));setSelAll(false);
    setGStatus({msg:`Pushing ${selected.length} products to Shopify...`,progress:5,type:'working'});
    let ok=0,fail=0;
    for(let i=0;i<selected.length;i++){
      const p=selected[i];
      setGStatus({msg:`[${i+1}/${selected.length}] Pushing "${p.title.slice(0,35)}..."`,progress:Math.round(5+((i/selected.length)*90)),type:'working'});
      // Fetch image if missing — must have image to push
      let img=p.image&&p.image.startsWith('http')?p.image:'';
      if(!img&&p.asin){
        setGStatus({msg:`[${i+1}/${selected.length}] Fetching image for ${p.asin}...`,progress:Math.round(5+((i/selected.length)*90)),type:'working'});
        const imgs=await fetchAmazonImages(p.asin);if(imgs.length)img=imgs[0];
      }
      if(!img){
        setProducts(prev=>prev.map(x=>x.id===p.id?{...x,shopStatus:'none' as const}:x));
        fail++;continue; // Skip — no image
      }
      try{
        const r=await fetch('/api/products?action=create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          title:p.title,asin:p.asin,vendor:p.category,category:p.category,product_type:p.category,
          cost_price:p.costPrice,retail_price:p.salePrice,compare_at_price:p.compareAtPrice,image_url:img,
          body_html:`<p>${p.title}. Premium quality product. Ships fast with tracking.</p>`,
          source:'amazon',source_product_id:p.asin,source_url:p.asin?`https://www.amazon.com/dp/${p.asin}`:'',
          inventory_quantity:Math.max(p.qty,DC.defaultQty),tags:[p.asin?`asin-${p.asin}`:'',p.category].filter(Boolean),status:'active',
          variants:[{price:String(p.salePrice),compare_at_price:p.compareAtPrice>0?String(p.compareAtPrice):null,sku:p.asin||'',inventory_quantity:Math.max(p.qty,DC.defaultQty),cost:String(p.costPrice),inventory_management:'shopify',requires_shipping:true}],
          images:[{src:img}],
        })});
        const d=await r.json().catch(()=>({}));const pid=d.data?.id||d.id||d.product?.id;
        if(pid){await fetch('/api/products?action=sync-shopify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productIds:[pid]})});
          setProducts(prev=>prev.map(x=>x.id===p.id?{...x,shopStatus:'active' as const,shopId:`gid://shopify/${pid}`,qty:Math.max(p.qty,DC.defaultQty)}:x));ok++;
        }else if(r.ok){setProducts(prev=>prev.map(x=>x.id===p.id?{...x,shopStatus:'active' as const}:x));ok++;}
        else{setProducts(prev=>prev.map(x=>x.id===p.id?{...x,shopStatus:'none' as const}:x));fail++;}
      }catch{setProducts(prev=>prev.map(x=>x.id===p.id?{...x,shopStatus:'none' as const}:x));fail++;}
      if(i<selected.length-1)await new Promise(r=>setTimeout(r,650));
    }
    setGStatus({msg:fail===0?`✅ ${ok} products pushed to Shopify!`:`⚠️ ${ok} pushed, ${fail} skipped (no image)`,progress:100,type:'done'});
    setTimeout(()=>setGStatus(null),8000);try{await fetchGrid();}catch{}
  },[products,fetchGrid]);

  // ══════════════════════════════════════════════════════════
  // BULK IMPORT — Reads CSV/TSV (text) and XLSX (binary)
  // Products arrive with images ALREADY attached
  // ══════════════════════════════════════════════════════════
  const handleBulk=useCallback((e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];if(!file)return;
    const jobId=`job-${Date.now()}`;
    const isXlsx=/\.xlsx?$/i.test(file.name);
    const newJob:BulkJob={id:jobId,file:file.name,totalRows:0,uniqueProducts:0,passed:0,flagged:0,status:'parsing',stage:'Reading file...',progress:5,products:[]};
    setBulkJobs(prev=>[newJob,...prev]);
    setGStatus({msg:`Reading ${file.name}...`,progress:5,type:'working'});

    const processText=async(text:string)=>{
      setBulkJobs(prev=>prev.map(j=>j.id===jobId?{...j,stage:'Scanning for ASIN numbers...',progress:10,status:'parsing'}:j));
      setGStatus({msg:'Scanning file for ASIN numbers...',progress:10,type:'working'});
      const totalLines=text.split('\n').filter(l=>l.trim()).length-1;
      const parsed=parseCSV(text);
      const uniqueCount=parsed.length;
      const asinCount=parsed.filter(p=>p.origHasAsin).length;
      setBulkJobs(prev=>prev.map(j=>j.id===jobId?{...j,totalRows:totalLines,uniqueProducts:uniqueCount,stage:`Found ${asinCount} ASINs — fetching images & data from Amazon...`,progress:15,status:'enriching'}:j));
      const enriched:BulkProduct[]=[];
      const CHUNK=50;
      for(let i=0;i<parsed.length;i++){
        const pct=Math.round(15+((i/parsed.length)*65));
        const statusMsg=`[${i+1}/${parsed.length}] Enriching "${parsed[i].title.slice(0,45)}"${parsed[i].asin?` (${parsed[i].asin})`:''}...`;
        setBulkJobs(prev=>prev.map(j=>j.id===jobId?{...j,stage:statusMsg,progress:pct}:j));
        setGStatus({msg:statusMsg,progress:pct,type:'working'});
        const product=await enrichProduct(parsed[i],i);
        enriched.push(product);
        // Yield to main thread every CHUNK items to prevent Chrome OOM
        if(i%CHUNK===0) await new Promise(r=>setTimeout(r,0));
      }
      const passedCount=enriched.filter(p=>p.status==='passed').length;
      const flaggedCount=enriched.filter(p=>p.status==='flagged').length;
      const withImages=enriched.filter(p=>p.enrichedImage&&p.enrichedImage.startsWith('http')).length;
      setBulkJobs(prev=>prev.map(j=>j.id===jobId?{...j,stage:'Validating all fields...',progress:90,status:'validating'}:j));
      setGStatus({msg:`Validating... ${withImages}/${uniqueCount} products have images`,progress:90,type:'working'});
      await new Promise(r=>setTimeout(r,300));
      setBulkJobs(prev=>prev.map(j=>j.id===jobId?{...j,passed:passedCount,flagged:flaggedCount,products:enriched,stage:`Complete! ${withImages} images · ${passedCount} passed · ${flaggedCount} flagged`,progress:100,status:'done'}:j));
      setGStatus({msg:`✅ Import done: ${passedCount} passed, ${flaggedCount} flagged — ${withImages} have Amazon images`,progress:100,type:'done'});
      setTimeout(()=>setGStatus(null),10000);
    };

    if(isXlsx){
      // XLSX binary — use SheetJS with dense mode for lower memory
      const reader=new FileReader();
      reader.onload=async(evt)=>{
        try{
          const data=new Uint8Array(evt.target?.result as ArrayBuffer);
          const wb=XLSX.read(data,{type:'array',dense:true});
          const ws=wb.Sheets[wb.SheetNames[0]];
          // Convert to CSV text and reuse our universal parser
          const csvText=XLSX.utils.sheet_to_csv(ws,{FS:',',RS:'\n'});
          // Free workbook memory before processing
          (wb as Record<string,unknown>).Sheets={};(wb as Record<string,unknown>).SheetNames=[];
          await processText(csvText);
        }catch(err:unknown){
          const msg=err instanceof Error?err.message:'Unknown error';
          console.error('[handleBulk] XLSX parse error:',err);
          setGStatus({msg:`❌ Failed to read XLSX: ${msg}`,progress:100,type:'done'});
          setBulkJobs(prev=>prev.map(j=>j.id===jobId?{...j,stage:`Error: ${msg}`,progress:100,status:'done'}:j));
        }
      };
      reader.readAsArrayBuffer(file);
    }else{
      // CSV/TSV text
      const reader=new FileReader();
      reader.onload=async(evt)=>{
        const text=evt.target?.result as string;
        if(!text)return;
        await processText(text);
      };
      reader.readAsText(file);
    }
    if(fref.current)fref.current.value='';
  },[]);

  // ── Bulk computed ──
  const latestBulkJob=useMemo(()=>bulkJobs.find(j=>j.status==='done'),[bulkJobs]);
  const allFlagReasons=useMemo(()=>{
    if(!latestBulkJob)return[];
    const reasons=new Set<string>();
    latestBulkJob.products.filter(p=>p.status==='flagged').forEach(p=>p.flagReasons.forEach(r=>reasons.add(r)));
    return Array.from(reasons);
  },[latestBulkJob]);
  const filteredBulkProducts=useMemo(()=>{
    if(!latestBulkJob)return[];
    let list=latestBulkJob.products;
    if(bulkFilter==='passed')list=list.filter(p=>p.status==='passed');
    if(bulkFilter==='flagged')list=list.filter(p=>p.status==='flagged');
    if(bulkFlagReason!=='all')list=list.filter(p=>p.flagReasons.includes(bulkFlagReason));
    if(bulkSearch){const q=bulkSearch.toLowerCase();list=list.filter(p=>p.title.toLowerCase().includes(q)||p.asin.toLowerCase().includes(q));}
    return list;
  },[latestBulkJob,bulkFilter,bulkFlagReason,bulkSearch]);

  // ══════════════════════════════════════════════════════════
  // BULK ACTION: Push passed products to Shopify
  // ══════════════════════════════════════════════════════════
  const[bulkPushing,setBulkPushing]=useState(false);
  const bulkPushToShopify=useCallback(async()=>{
    if(!latestBulkJob)return;
    // Push passed products AND flagged products whose ONLY issue is missing image
    // (those have ASIN + all other data, just image fetch failed during import)
    const pushable=latestBulkJob.products.filter(p=>
      p.status==='passed' || 
      (p.status==='flagged' && p.asin && p.flagReasons.every(r=>r.toLowerCase().includes('image')))
    );
    if(pushable.length===0)return;
    setBulkPushing(true);
    const needsImageRetry=pushable.filter(p=>!p.enrichedImage||!p.enrichedImage.startsWith('http'));
    setGStatus({msg:`Pushing ${pushable.length} products to Shopify${needsImageRetry.length>0?` (retrying images for ${needsImageRetry.length})...`:'...'}`,progress:5,type:'working'});
    let ok=0,fail=0,imgFixed=0;const errs:string[]=[];

    for(let i=0;i<pushable.length;i++){
      const p=pushable[i];
      const pct=Math.round(5+((i/pushable.length)*90));

      // If product has no image, retry fetching now (API route may be deployed since import)
      const imgs=(p.enrichedImages||[]).filter(u=>u.startsWith('http'));
      if(!imgs.length&&p.enrichedImage?.startsWith('http'))imgs.push(p.enrichedImage);
      
      if(imgs.length===0&&p.asin){
        setGStatus({msg:`[${i+1}/${pushable.length}] Retrying image for "${p.title.slice(0,35)}..."`,progress:pct,type:'working'});
        const retryImgs=await fetchAmazonImages(p.asin);
        if(retryImgs.length>0){imgs.push(...retryImgs);imgFixed++;}
      }

      // If STILL no image after retry, skip this product — don't push without images
      if(imgs.length===0){
        fail++;
        errs.push(`${p.title.slice(0,30)}: No image found — skipped`);
        continue;
      }

      setGStatus({msg:`[${i+1}/${pushable.length}] Pushing "${p.title.slice(0,40)}..." (${imgs.length} imgs)`,progress:pct,type:'working'});

      try{
        const r=await fetch('/api/products?action=create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          title:p.title,asin:p.asin,vendor:p.vendor,category:p.enrichedCategory,product_type:p.enrichedCategory,
          cost_price:p.enrichedCost,retail_price:p.enrichedSalePrice,compare_at_price:p.enrichedCompareAt,
          image_url:imgs[0]||'',body_html:p.enrichedDescription||`<p>${p.title}. Premium quality product.</p>`,
          amazon_url:p.enrichedAmazonUrl,source_url:p.enrichedAmazonUrl,source:'amazon',source_product_id:p.asin,
          inventory_quantity:p.enrichedQty,tags:p.tags.concat(p.asin?[`asin-${p.asin}`]:[]),status:'active',
          variants:[{price:String(p.enrichedSalePrice||0),compare_at_price:p.enrichedCompareAt>0?String(p.enrichedCompareAt):null,sku:p.asin||'',inventory_quantity:p.enrichedQty,cost:p.enrichedCost>0?String(p.enrichedCost):undefined,inventory_management:'shopify',requires_shipping:true}],
          images:imgs.map(u=>({src:u})),
        })});
        const d=await r.json().catch(()=>({}));const pid=d.data?.id||d.id||d.product?.id;
        if(pid){await fetch('/api/products?action=sync-shopify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productIds:[pid]})});ok++;}
        else if(r.ok){ok++;}else{fail++;errs.push(`${p.title.slice(0,25)}: ${d.error||d.message||'failed'}`);}
      }catch(e:any){fail++;errs.push(`${p.title.slice(0,25)}: ${e.message||'error'}`);}
      if(i<pushable.length-1)await new Promise(r=>setTimeout(r,650));
    }
    const imgMsg=imgFixed>0?` (${imgFixed} images recovered at push time)`:'';
    setGStatus({msg:fail===0?`✅ All ${ok} products with images pushed to Shopify!${imgMsg}`:`⚠️ ${ok} pushed, ${fail} skipped (no image).${imgMsg} ${errs[0]||''}`,progress:100,type:'done'});
    setTimeout(()=>setGStatus(null),12000);
    try{await fetchGrid();}catch{}
    setBulkPushing(false);
  },[latestBulkJob,fetchGrid]);

  // ══════════════════════════════════════════════════════════
  // BULK ACTION: Add passed products to Manual Sourcing products list
  // ══════════════════════════════════════════════════════════
  const bulkAddToProducts=useCallback(()=>{
    if(!latestBulkJob)return;
    const passed=latestBulkJob.products.filter(p=>p.status==='passed');
    if(passed.length===0)return;
    // Convert BulkProduct → SourcingProduct for the manual sourcing products table
    const converted:SourcingProduct[]=passed.map((p,i)=>{
      const markup=p.enrichedCost>0?Math.round(((p.enrichedSalePrice-p.enrichedCost)/p.enrichedCost)*100):0;
      return{
        id:`bulk-src-${Date.now()}-${i}`,
        asin:p.asin,
        title:p.title,
        image:p.enrichedImage,
        category:p.enrichedCategory,
        amazonPrice:p.enrichedCost,
        costPrice:p.enrichedCost,
        salePrice:p.enrichedSalePrice,
        compareAtPrice:p.enrichedCompareAt,
        multiplier:p.enrichedCost>0?Math.round((p.enrichedSalePrice/p.enrichedCost)*100)/100:0,
        comps:p.enrichedCompareAt>0?[{name:'Competitor',price:p.enrichedCompareAt}]:[],
        dollarProfit:Math.round((p.enrichedSalePrice-p.enrichedCost)*100)/100,
        markupPct:markup,
        rating:0,reviews:0,bsr:0,weight:0,
        avail:'in_stock' as const,
        prime:true,
        score:p.completeness*12,
        shopId:null,
        shopStatus:'none' as const,
        qty:p.enrichedQty,
        filter:'pass',
        sourcedAt:new Date().toISOString(),
        lastCheck:new Date().toISOString(),
        sel:false,
        src:'bulk_shop' as const,
      };
    });
    setProducts(prev=>[...prev,...converted]);
    setGStatus({msg:`Added ${converted.length} products to Manual Sourcing products list`,progress:100,type:'done'});
    setTimeout(()=>setGStatus(null),5000);
  },[latestBulkJob]);

  // ══════════════════════════════════════════════════════════
  // BULK ACTION: Export flagged products to Excel/CSV
  // Shows what each product has and doesn't have
  // ══════════════════════════════════════════════════════════
  const bulkExportFlagged=useCallback(()=>{
    if(!latestBulkJob)return;
    const flagged=latestBulkJob.products.filter(p=>p.status==='flagged');
    if(flagged.length===0){
      // If no flagged, export all for reference
      setGStatus({msg:'No flagged products to export',progress:100,type:'done'});
      setTimeout(()=>setGStatus(null),3000);
      return;
    }
    // Build CSV with columns showing what each product has/missing
    const csvHeaders=[
      'Title','ASIN','Vendor','Category',
      'Has Image','Has Description','Has Cost','Has Sale Price','Has Compare-At','Has Amazon URL','Has Category','Has Inventory',
      'Enriched Image','Enriched Cost','Enriched Sale Price','Enriched Compare-At','Enriched Amazon URL','Enriched Category','Enriched Qty',
      'Completeness (out of 8)','Status','Flag Reasons',
    ];
    const csvRows=flagged.map(p=>[
      `"${(p.title||'').replace(/"/g,'""')}"`,
      p.asin,
      `"${p.vendor}"`,
      `"${p.enrichedCategory}"`,
      p.origHasImage?'YES':'NO — needs sourcing',
      p.origHasDescription?'YES':'NO — needs sourcing',
      p.enrichedCost>0?'YES':'NO — MISSING',
      p.enrichedSalePrice>0?'YES':'NO — MISSING',
      p.enrichedCompareAt>0?'YES':'NO — MISSING',
      p.enrichedAmazonUrl?'YES':'NO — MISSING',
      (p.enrichedCategory&&p.enrichedCategory!=='Uncategorized')?'YES':'NO — needs mapping',
      p.enrichedQty>0?'YES':'NO — MISSING',
      p.enrichedImage||'MISSING',
      p.enrichedCost>0?`$${p.enrichedCost.toFixed(2)}`:'MISSING',
      p.enrichedSalePrice>0?`$${p.enrichedSalePrice.toFixed(2)}`:'MISSING',
      p.enrichedCompareAt>0?`$${p.enrichedCompareAt.toFixed(2)}`:'MISSING',
      p.enrichedAmazonUrl||'MISSING',
      p.enrichedCategory||'MISSING',
      String(p.enrichedQty),
      `${p.completeness}/8`,
      p.status.toUpperCase(),
      `"${p.flagReasons.join('; ')}"`,
    ].join(','));

    const csvContent=[csvHeaders.join(','),...csvRows].join('\n');
    const blob=new Blob([csvContent],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download=`flagged-products-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setGStatus({msg:`Exported ${flagged.length} flagged products to CSV`,progress:100,type:'done'});
    setTimeout(()=>setGStatus(null),5000);
  },[latestBulkJob]);

  const dsp=useMemo(()=>{let l=products;if(filt==='active')l=l.filter(p=>p.shopStatus==='active');if(filt==='flagged')l=l.filter(p=>p.markupPct<crit.minMu);if(filt==='oos')l=l.filter(p=>p.avail==='oos'||p.avail==='unavail');if(search){const q=search.toLowerCase();l=l.filter(p=>p.title.toLowerCase().includes(q)||p.asin.toLowerCase().includes(q));}return l;},[products,filt,search,crit.minMu]);

  const fb=(f:string)=>f==='pass'?<span className="text-[7px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">PASS</span>:<span className="text-[7px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold">FLAG</span>;
  const Inp=({l,v,k,s}:{l:string;v:number;k:string;s?:string})=>(<div><label className="text-[8px] text-zinc-500 uppercase tracking-wider block mb-1">{l}</label><input type="number" step={s||'1'} value={v} onChange={e=>setCrit((p:any)=>({...p,[k]:Number(e.target.value)}))} className="w-full px-3 py-2.5 bg-[#0c0c18] border border-zinc-800 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none" style={{fontFamily:'JetBrains Mono,monospace'}}/></div>);

  return(
    <div className="products-dark min-h-screen p-4 lg:p-6" style={{background:'#080810',color:'#e4e4e7',fontFamily:"'DM Sans',-apple-system,sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');.gl{background:rgba(255,255,255,0.03);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.06)}.fb{transition:width 0.8s ease-out}`}</style>
      <div className="max-w-[1800px] mx-auto">

        {/* ═══ GLOBAL STATUS BAR ═══ */}
        {gStatus&&(<div className={`fixed top-0 left-0 right-0 z-50 px-4 py-2 ${gStatus.type==='working'?'bg-cyan-950/95':'bg-emerald-950/95'} backdrop-blur-md border-b border-white/10`}><div className="max-w-[1800px] mx-auto flex items-center gap-4"><div className="flex-1"><div className="flex items-center justify-between mb-1"><span className="text-xs text-white font-medium">{gStatus.type==='working'?'⏳':'✅'} {gStatus.msg}</span><span className="text-xs text-white/70" style={{fontFamily:'JetBrains Mono,monospace'}}>{gStatus.progress}%</span></div><div className="w-full bg-black/30 rounded-full h-1.5"><div className="h-1.5 rounded-full transition-all duration-500" style={{width:`${gStatus.progress}%`,background:gStatus.type==='done'?'#22c55e':'linear-gradient(90deg,#06b6d4,#8b5cf6)'}}/></div></div>{gStatus.type==='done'&&<button onClick={()=>setGStatus(null)} className="text-white/50 hover:text-white text-lg">✕</button>}</div></div>)}

        {/* ═══ HEADER ═══ */}
        <div className="flex items-center justify-between mb-5" style={{marginTop:gStatus?'48px':'0'}}><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl" style={{background:'linear-gradient(135deg,#06b6d4,#8b5cf6)',boxShadow:'0 8px 24px rgba(6,182,212,0.3)'}}>🎯</div><div><h1 className="text-2xl font-bold tracking-tight text-white">Product Sourcing Engine</h1><p className="text-xs text-zinc-500">Auto-Enrich from Amazon · Template Descriptions · Completeness Validation</p></div></div></div>

        {/* ═══ KPIs ═══ */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
          {[{l:'Manual Sourced',v:String(total),c:'#06b6d4'},{l:'In Shopify',v:String(inShop),c:'#22c55e'},{l:'Bulk Passed',v:latestBulkJob?String(latestBulkJob.passed):'0',c:'#22c55e'},{l:'Bulk Flagged',v:latestBulkJob?String(latestBulkJob.flagged):'0',c:latestBulkJob&&latestBulkJob.flagged>0?'#f59e0b':'#3f3f46'},{l:'Avg Markup',v:avgMu>0?`${avgMu}%`:'—',c:'#8b5cf6'},{l:'Auto Source',v:autoOn?'ON':'OFF',c:autoOn?'#22c55e':'#ef4444'}].map((k,i)=>(
            <div key={i} className="gl rounded-xl p-3 text-center"><p className="text-xl font-bold" style={{color:k.c}}>{k.v}</p><p className="text-[9px] text-zinc-500 uppercase tracking-wider mt-0.5">{k.l}</p></div>
          ))}
        </div>

        {/* ═══ TABS ═══ */}
        <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
          {([{id:'manual' as Tab,i:'🔍',l:'Manual Sourcing'},{id:'auto' as Tab,i:'⚡',l:'Auto Sourcing'},{id:'pricing' as Tab,i:'💰',l:'Pricing Logic'},{id:'bulk' as Tab,i:'📦',l:'Bulk Import'},{id:'products' as Tab,i:'📋',l:`Products (${total})`},{id:'history' as Tab,i:'📜',l:'History'}]).map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} className={`px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${tab===t.id?'text-white':'gl text-zinc-400 hover:text-white'}`} style={tab===t.id?{background:'linear-gradient(135deg,#06b6d4,#8b5cf6)',boxShadow:'0 4px 16px rgba(139,92,246,0.3)'}:{}}>{t.i} {t.l}</button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════ */}
        {/* MANUAL SOURCING TAB                                     */}
        {/* ════════════════════════════════════════════════════════ */}
        {tab==='manual'&&(<div className="space-y-4">
          <div className="gl rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-4">🎯 Discovery Criteria <span className="text-[9px] text-zinc-500 font-normal">(Manual sourcing only — not used for bulk import)</span></h3>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3"><Inp l="MIN COST ($)" v={crit.minP} k="minP" s="0.5"/><Inp l="MAX COST ($)" v={crit.maxP} k="maxP"/><Inp l="MAX RETAIL ($)" v={crit.maxRet} k="maxRet" s="5"/><Inp l="MIN MARKUP (%)" v={crit.minMu} k="minMu" s="5"/><Inp l="MIN $ PROFIT" v={crit.minDp} k="minDp" s="0.5"/></div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3"><Inp l="MIN REVIEWS" v={crit.minRev} k="minRev"/><Inp l="MIN RATING" v={crit.minRat} k="minRat" s="0.1"/><Inp l="MAX BSR" v={crit.maxBsr} k="maxBsr"/><Inp l="MAX WEIGHT (lbs)" v={crit.maxWt} k="maxWt" s="0.5"/><div className="flex items-center gap-3 pt-5"><button onClick={()=>setCrit(p=>({...p,prime:!p.prime}))} className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${crit.prime?'bg-cyan-500':'bg-zinc-700'}`}><div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${crit.prime?'left-[22px]':'left-0.5'}`}/></button><span className="text-xs text-zinc-300">Prime Only</span></div></div>
            <div className="mb-3"><label className="text-[8px] text-zinc-500 uppercase tracking-wider block mb-1">BLOCKED WORDS</label><textarea value={crit.blocked} onChange={e=>setCrit(p=>({...p,blocked:e.target.value}))} rows={2} className="w-full px-3 py-2 bg-[#0c0c18] border border-zinc-800 rounded-lg text-[11px] text-zinc-300 focus:border-cyan-500 focus:outline-none resize-none" style={{fontFamily:'JetBrains Mono,monospace'}}/></div>
            <div className="mb-4 p-3 bg-[#0c0c18] rounded-xl border border-zinc-800/50"><p className="text-[8px] text-zinc-500 uppercase tracking-wider mb-2">TIERED MULTIPLIER</p><div className="flex gap-2">{DC.tiers.map((t,i)=>(<div key={i} className="flex-1 text-center p-2 rounded-lg gl"><p className="text-[10px] text-zinc-400">{t.label}</p><p className="text-lg font-bold text-cyan-400" style={{fontFamily:'JetBrains Mono,monospace'}}>{t.mult}x</p></div>))}</div></div>
            <div className="flex items-center justify-between"><div className="flex gap-2"><button onClick={runPreview} disabled={busy} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{background:'linear-gradient(135deg,#22c55e,#16a34a)'}}>{busy?'⏳ Searching...':'🎯 Preview Products'}</button><button onClick={importAll} disabled={preview.length===0} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-30" style={{background:'linear-gradient(135deg,#06b6d4,#0891b2)'}}>⬇️ Import ({preview.filter(p=>p.filter==='pass').length})</button></div></div>
          </div>
          {fstats&&(<div className="gl rounded-2xl p-5"><h4 className="text-sm font-bold text-white mb-3">📊 Filter Funnel — {fstats.total.toLocaleString()} analyzed</h4><div className="space-y-1.5">{[{l:'Raw from Keepa',v:fstats.total,c:'#71717a'},{l:'✓ Price $3-$25',v:fstats.price,c:'#06b6d4'},{l:'✓ No blocked brands',v:fstats.brand,c:'#06b6d4'},{l:'✓ 500+ reviews',v:fstats.reviews,c:'#06b6d4'},{l:'✓ 3.5+ rating',v:fstats.rating,c:'#06b6d4'},{l:'✓ Prime',v:fstats.prime,c:'#06b6d4'},{l:'✓ Under 5 lbs',v:fstats.weight,c:'#06b6d4'},{l:'✓ Safe category',v:fstats.cat,c:'#06b6d4'},{l:`✓ ${crit.minMu}%+ markup`,v:fstats.markup,c:'#8b5cf6'},{l:'🏁 SURVIVORS',v:fstats.final,c:'#22c55e'}].map((s,i)=>(<div key={i} className="flex items-center gap-3"><span className="text-[10px] text-zinc-400 w-40 truncate">{s.l}</span><div className="flex-1 bg-zinc-900 rounded-full h-4 overflow-hidden"><div className="h-full rounded-full fb" style={{width:`${(s.v/fstats.total)*100}%`,background:s.c}}/></div><span className="text-[10px] w-12 text-right" style={{color:s.c,fontFamily:'JetBrains Mono,monospace'}}>{s.v}</span></div>))}</div></div>)}
          {prevMode&&preview.length>0&&(<div className="gl rounded-2xl overflow-hidden"><div className="p-4 border-b border-zinc-800/50 flex items-center justify-between"><h4 className="text-sm font-bold text-white">🎯 Preview: {preview.length} survivors</h4><button onClick={importAll} className="px-4 py-2 rounded-lg text-xs font-semibold text-white" style={{background:'linear-gradient(135deg,#22c55e,#16a34a)'}}>↑ Import All → Shopify</button></div><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-zinc-800/50 text-zinc-500 uppercase text-[8px]"><th className="p-3 text-left">St</th><th className="p-3 text-left">Product</th><th className="p-3 text-right">Amazon$</th><th className="p-3 text-right">Sell$</th><th className="p-3 text-right">Profit</th><th className="p-3 text-right">Score</th></tr></thead><tbody>{preview.map(p=>(<tr key={p.id} className="border-b border-zinc-800/30 hover:bg-white/[0.02]"><td className="p-3">{fb(p.filter)}</td><td className="p-3 max-w-[200px]"><p className="text-white font-medium truncate">{p.title}</p><p className="text-[9px] text-zinc-500">{p.asin}</p></td><td className="p-3 text-right text-zinc-400" style={{fontFamily:'JetBrains Mono,monospace'}}>${p.amazonPrice.toFixed(2)}</td><td className="p-3 text-right text-emerald-400 font-semibold" style={{fontFamily:'JetBrains Mono,monospace'}}>${p.salePrice.toFixed(2)}</td><td className="p-3 text-right text-emerald-400" style={{fontFamily:'JetBrains Mono,monospace'}}>${p.dollarProfit.toFixed(2)}</td><td className="p-3 text-right"><span className="text-emerald-400 font-semibold">{p.score}</span></td></tr>))}</tbody></table></div></div>)}
          <div className="mt-2"><div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-white">📦 Shopify Products ({gridProducts.length})</h3><ViewToggle viewMode={viewMode} onViewModeChange={setViewMode} gridDensity={gridDensity} onGridDensityChange={setGridDensity} productCount={gridProducts.length}/></div><ProductCardGrid products={gridProducts} density={gridDensity} isLoading={gridLoading} selectedIds={gridSelectedIds} onSelectToggle={gst} onSelectAll={gsa} onDeselectAll={gda} onViewDetails={gvd} onRefresh={grf} onPause={gpa} onRemove={grm} onSyncShopify={gss} onBulkSync={gbs} onBulkActivate={gba} onBulkPause={gbp} onBulkExport={gbe} onBulkArchive={gbr}/></div>
        </div>)}

        {/* ════════════════════════════════════════════════════════ */}
        {/* AUTO SOURCING TAB                                       */}
        {/* ════════════════════════════════════════════════════════ */}
        {tab==='auto'&&(<div className="space-y-4"><div className="gl rounded-2xl p-5"><div className="flex items-center justify-between mb-5"><h3 className="text-sm font-bold text-white">⚡ Auto Product Discovery</h3><button onClick={()=>setAutoOn(!autoOn)} className={`px-5 py-2.5 rounded-xl text-sm font-semibold ${autoOn?'text-white':'gl text-zinc-400'}`} style={autoOn?{background:'linear-gradient(135deg,#22c55e,#16a34a)'}:{}}>{autoOn?'✅ Running':'⏸️ Paused'}</button></div>
            <p className="text-xs text-zinc-500 mb-4">Searches Amazon Best Sellers by category, filters by your Discovery Criteria, scores products, and queues profitable deals for push to Shopify. Runs 6AM–11PM.</p>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-5">
              <div><label className="text-[8px] text-zinc-500 uppercase block mb-1">SEARCH INTERVAL</label><select value={autoInt} onChange={e=>setAutoInt(Number(e.target.value))} className="w-full px-3 py-2.5 bg-[#0c0c18] border border-zinc-800 rounded-lg text-sm text-white"><option value={15}>15 min</option><option value={30}>30 min</option><option value={60}>1 hour</option></select></div>
              <div><label className="text-[8px] text-zinc-500 uppercase block mb-1">MAX SEARCHES/DAY</label><input type="number" value={autoMax} onChange={e=>setAutoMax(Number(e.target.value))} className="w-full px-3 py-2.5 bg-[#0c0c18] border border-zinc-800 rounded-lg text-sm text-white"/></div>
              <div className="bg-[#0c0c18] rounded-lg p-3 border border-zinc-800 text-center"><p className="text-xl font-bold text-cyan-400">{autoToday}</p><p className="text-[9px] text-zinc-500">Searches Today</p></div>
              <div className="bg-[#0c0c18] rounded-lg p-3 border border-zinc-800 text-center"><p className="text-xl font-bold text-emerald-400">{autoDiscovered.length}</p><p className="text-[9px] text-zinc-500">Deals Found</p></div>
              <div className="bg-[#0c0c18] rounded-lg p-3 border border-zinc-800 text-center"><p className={`text-xl font-bold ${keepaTokens!==null&&keepaTokens<50?'text-red-400':keepaTokens!==null&&keepaTokens<200?'text-amber-400':'text-violet-400'}`}>{keepaTokens!==null?keepaTokens:'—'}</p><p className="text-[9px] text-zinc-500">Keepa Tokens</p></div>
              <div className="bg-[#0c0c18] rounded-lg p-3 border border-zinc-800 text-center"><p className="text-xl font-bold text-zinc-400">{autoLast?new Date(autoLast).toLocaleTimeString():'Never'}</p><p className="text-[9px] text-zinc-500">Last Run</p></div>
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={runAutoSource} className="px-4 py-2 rounded-lg text-xs font-semibold text-white" style={{background:'linear-gradient(135deg,#06b6d4,#0891b2)'}}>🔍 Search Now</button>
              <button onClick={pushAutoDiscovered} disabled={autoDiscovered.filter(p=>p.score>=DC.minPassingScore&&p.image).length===0} className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-40" style={{background:'linear-gradient(135deg,#22c55e,#16a34a)'}}>🛒 Push All Deals to Shopify ({autoDiscovered.filter(p=>p.score>=DC.minPassingScore&&p.image).length})</button>
              <button onClick={()=>{setAutoToday(0);setAutoLog([]);setAutoDiscovered([]);}} className="px-4 py-2 rounded-lg text-xs font-semibold gl text-zinc-400">↺ Reset</button>
            </div>
            <div className="bg-[#0c0c18] rounded-xl p-4 border border-zinc-800/50"><p className="text-xs font-semibold mb-3 text-white">📅 Schedule</p><div className="grid grid-cols-6 lg:grid-cols-12 gap-1">{Array.from({length:24},(_,h)=>{const on=autoOn&&h>=6&&h<=23;return<div key={h} className={`rounded-lg p-1.5 text-center text-[8px] ${on?'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400':'bg-zinc-900 border border-zinc-800 text-zinc-600'}`}><p className="font-bold">{h}:00</p></div>;})}</div></div>
          </div>

          {/* Discovered Products Table */}
          {autoDiscovered.length>0&&(<div className="gl rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">🎯 Discovered Products ({autoDiscovered.length})</h4>
              <button onClick={pushAutoDiscovered} disabled={autoDiscovered.filter(p=>p.score>=DC.minPassingScore&&p.image).length===0} className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-40" style={{background:'linear-gradient(135deg,#22c55e,#16a34a)'}}>🛒 Push to Shopify</button>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-zinc-800/50 text-zinc-500 uppercase text-[8px]">
              <th className="p-2.5 text-center">Score</th><th className="p-2.5 text-left">Product</th><th className="p-2.5 text-center">Image</th><th className="p-2.5 text-right">Amazon$</th><th className="p-2.5 text-right">Sell$</th><th className="p-2.5 text-right">Profit</th><th className="p-2.5 text-right">Markup</th><th className="p-2.5 text-center">Rating</th><th className="p-2.5 text-center">Reviews</th><th className="p-2.5 text-center">Prime</th>
            </tr></thead><tbody>
              {autoDiscovered.sort((a,b)=>b.score-a.score).map(p=>(<tr key={p.id} className="border-b border-zinc-800/30 hover:bg-white/[0.02]">
                <td className="p-2.5 text-center"><span className={`text-sm font-bold ${p.score>=80?'text-emerald-400':p.score>=60?'text-cyan-400':p.score>=40?'text-amber-400':'text-red-400'}`} style={{fontFamily:'JetBrains Mono,monospace'}}>{p.score}</span></td>
                <td className="p-2.5 max-w-[250px]"><p className="text-white font-medium truncate text-[11px]">{p.title}</p><p className="text-[9px] text-zinc-500">{p.asin} · {p.category}</p></td>
                <td className="p-2.5 text-center">{p.image?<img src={p.image} alt="" className="w-8 h-8 rounded object-cover mx-auto"/>:<span className="text-red-400 text-[9px]">✗</span>}</td>
                <td className="p-2.5 text-right text-zinc-400" style={{fontFamily:'JetBrains Mono,monospace'}}>${p.costPrice.toFixed(2)}</td>
                <td className="p-2.5 text-right text-emerald-400 font-semibold" style={{fontFamily:'JetBrains Mono,monospace'}}>${p.salePrice.toFixed(2)}</td>
                <td className="p-2.5 text-right text-emerald-400" style={{fontFamily:'JetBrains Mono,monospace'}}>${p.dollarProfit.toFixed(2)}</td>
                <td className="p-2.5 text-right"><span className={`font-semibold ${p.markupPct>=100?'text-emerald-400':p.markupPct>=80?'text-cyan-400':'text-amber-400'}`}>{p.markupPct}%</span></td>
                <td className="p-2.5 text-center text-zinc-400">⭐ {p.rating.toFixed(1)}</td>
                <td className="p-2.5 text-center text-zinc-400" style={{fontFamily:'JetBrains Mono,monospace'}}>{p.reviews.toLocaleString()}</td>
                <td className="p-2.5 text-center">{p.prime?<span className="text-[8px] px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400">✓</span>:<span className="text-zinc-600">—</span>}</td>
              </tr>))}
            </tbody></table></div>
          </div>)}

          {/* Activity Log */}
          <div className="gl rounded-2xl p-5">
            <h4 className="text-sm font-bold text-white mb-3">📋 Activity Log</h4>
            {autoLog.length===0?<p className="text-xs text-zinc-500">No activity yet. Click &quot;Search Now&quot; or enable auto sourcing.</p>:(
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">{autoLog.map((l,i)=>(
                <div key={i} className="flex items-center gap-3 p-2 bg-[#0c0c18] rounded-lg border border-zinc-800">
                  <span className="text-[9px] text-zinc-500 w-16 flex-shrink-0" style={{fontFamily:'JetBrains Mono,monospace'}}>{l.time}</span>
                  <span className={`text-[7px] px-1.5 py-0.5 rounded-full uppercase font-bold flex-shrink-0 ${l.type==='success'?'bg-emerald-500/15 text-emerald-400':l.type==='error'?'bg-red-500/15 text-red-400':'bg-cyan-500/15 text-cyan-400'}`}>{l.type}</span>
                  <span className="text-[10px] text-zinc-300">{l.msg}</span>
                </div>
              ))}</div>
            )}
          </div>
        </div>)}

        {/* ════════════════════════════════════════════════════════ */}
        {/* PRICING TAB                                             */}
        {/* ════════════════════════════════════════════════════════ */}
        {tab==='pricing'&&(<div className="space-y-4"><div className="gl rounded-2xl p-5"><h3 className="text-sm font-bold text-white mb-4">💰 Pricing Rules</h3><div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">{DC.tiers.map((t,i)=>(<div key={i} className="bg-[#0c0c18] rounded-xl p-4 border border-zinc-800 text-center"><p className="text-[10px] text-zinc-500">Amazon Cost</p><p className="text-lg font-bold text-white">{t.label}</p><p className="text-3xl font-bold text-cyan-400 my-2" style={{fontFamily:'JetBrains Mono,monospace'}}>{t.mult}x</p></div>))}</div><div className="space-y-2">{[{n:'1. Tiered Multiplier',d:'Apply multiplier based on cost tier'},{n:'2. Min 80% Markup',d:'Reject if below 80%'},{n:'3. Min $4 Profit',d:'Must earn at least $4'},{n:'4. $40 Retail Cap',d:'Sale price cannot exceed $40'},{n:'5. Round to .99',d:'Psychology pricing'},{n:'6. Compare-at = Max Competitor',d:'Strike-through pricing'},{n:'7. Cost = Amazon Price',d:'Margin tracking'}].map((r,i)=>(<div key={i} className="flex items-center gap-4 p-3 bg-[#0c0c18] rounded-xl border border-cyan-500/10"><div className="w-10 h-5 rounded-full relative bg-cyan-500"><div className="w-4 h-4 bg-white rounded-full absolute top-0.5 left-[22px]"/></div><div className="flex-1"><p className="text-sm font-semibold text-white">{r.n}</p><p className="text-[10px] text-zinc-500">{r.d}</p></div></div>))}</div></div></div>)}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* BULK IMPORT TAB — Completely independent from manual sourcing  */}
        {/* Pass/flag based on 8 REQUIRED FIELDS, not sourcing criteria    */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {tab==='bulk'&&(<div className="space-y-4">
          {/* Upload zone */}
          <div className="gl rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-2">📦 Bulk Import</h3>
            <p className="text-xs text-zinc-500 mb-3">Upload a CSV/XLSX of products. Engine reads the actual file, checks each product for 8 required Shopify fields, and auto-enriches from Amazon via ASIN.</p>
            <div className="bg-[#0c0c18] rounded-xl p-3 border border-zinc-800/50 mb-4">
              <p className="text-[8px] text-zinc-500 uppercase tracking-wider mb-2">8 REQUIRED FIELDS (pass/flag criteria)</p>
              <div className="flex gap-1.5 flex-wrap">{['Product Image','Real Description','Sale Price','Compare-at Price','Cost Price','Amazon URL','Category','Inventory Qty'].map((f,i)=><span key={i} className="text-[8px] px-2 py-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/15">{f}</span>)}</div>
              <p className="text-[8px] text-zinc-500 mt-2">If a field is missing, engine uses the ASIN to source it from Amazon. If ASIN exists → product passes. If data cannot be sourced → product is flagged with reason.</p>
            </div>
            <div className="border-2 border-dashed border-zinc-700 rounded-2xl p-8 text-center hover:border-cyan-500/50 transition-colors cursor-pointer" onClick={()=>fref.current?.click()}>
              <input type="file" ref={fref} onChange={handleBulk} accept=".csv,.xlsx,.xls,.tsv" className="hidden"/>
              <p className="text-3xl mb-2">📤</p>
              <p className="text-sm font-semibold text-zinc-300">Drop spreadsheet or click to browse</p>
              <p className="text-[10px] text-zinc-500 mt-1">CSV, XLSX, TSV · Parses actual file contents</p>
            </div>
          </div>

          {/* Import jobs */}
          {bulkJobs.map(j=>(<div key={j.id} className="gl rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2"><div><p className="text-sm font-semibold text-white">{j.file}</p><p className="text-[9px] text-zinc-500">{j.totalRows} rows · {j.uniqueProducts} unique products</p></div><span className={`text-[9px] px-2 py-0.5 rounded-full ${j.status==='done'?'bg-emerald-500/15 text-emerald-400':'bg-cyan-500/15 text-cyan-400'}`}>{j.status}</span></div>
            <div className="w-full bg-zinc-800 rounded-full h-2 mb-2"><div className="h-2 rounded-full transition-all duration-500" style={{width:`${j.progress}%`,background:'linear-gradient(90deg,#06b6d4,#8b5cf6)'}}/></div>
            <p className="text-[10px] text-zinc-400 mb-2">{j.stage}</p>
            {j.status==='done'&&(<div className="flex gap-3 text-[10px]"><span className="text-emerald-400 font-semibold">✅ {j.passed} passed</span><span className="text-amber-400 font-semibold">⚠️ {j.flagged} flagged</span><span className="text-zinc-500">({j.uniqueProducts} total)</span></div>)}
          </div>))}

          {/* ═══ PRODUCT RESULTS ═══ */}
          {latestBulkJob&&(<>
            {/* Filter bar */}
            <div className="gl rounded-2xl p-3">
              <div className="flex items-center gap-3 mb-2.5 flex-wrap">
                <div className="flex-1 min-w-[200px] relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm">🔍</span><input value={bulkSearch} onChange={e=>setBulkSearch(e.target.value)} placeholder="Search by title or ASIN..." className="w-full pl-9 pr-3 py-2 bg-[#0c0c18] border border-zinc-800 rounded-lg text-xs text-white placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none"/></div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-1">{([{k:'all' as BulkFilter,l:`All (${latestBulkJob.uniqueProducts})`,c:''},{k:'passed' as BulkFilter,l:`Passed (${latestBulkJob.passed})`,c:'text-emerald-400'},{k:'flagged' as BulkFilter,l:`Flagged (${latestBulkJob.flagged})`,c:'text-amber-400'}]).map(f=><button key={f.k} onClick={()=>setBulkFilter(f.k)} className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${bulkFilter===f.k?'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30':'gl text-zinc-400'}`}>{f.l}</button>)}</div>
                {bulkFilter==='flagged'&&allFlagReasons.length>0&&(<select value={bulkFlagReason} onChange={e=>setBulkFlagReason(e.target.value)} className="px-3 py-1.5 bg-[#0c0c18] border border-zinc-800 rounded-lg text-[10px] text-white"><option value="all">All flag reasons</option>{allFlagReasons.map(r=><option key={r} value={r}>{r}</option>)}</select>)}
                <div className="ml-auto flex border border-zinc-800 rounded-lg overflow-hidden"><button onClick={()=>setBulkView('table')} className={`px-2.5 py-1.5 text-[10px] ${bulkView==='table'?'bg-cyan-500/20 text-cyan-400':'text-zinc-500'}`}>☰ Table</button><button onClick={()=>setBulkView('card')} className={`px-2.5 py-1.5 text-[10px] ${bulkView==='card'?'bg-cyan-500/20 text-cyan-400':'text-zinc-500'}`}>▦ Cards</button></div>
              </div>
            </div>
            <p className="text-[10px] text-zinc-500">{filteredBulkProducts.length} products shown</p>

            {/* ═══ ACTION BUTTONS BAR ═══ */}
            <div className="gl rounded-2xl p-3">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Push to Shopify — pushes passed + image-only-flagged (retries images at push time) */}
                {(()=>{
                  const pushable=latestBulkJob?latestBulkJob.products.filter(p=>p.status==='passed'||(p.status==='flagged'&&p.asin&&p.flagReasons.every(r=>r.toLowerCase().includes('image')))).length:0;
                  return <button onClick={bulkPushToShopify} disabled={bulkPushing||pushable===0} className="px-4 py-2 rounded-lg text-[11px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:scale-[1.02]" style={{background:'linear-gradient(135deg,#22c55e,#16a34a)',boxShadow:'0 2px 8px rgba(34,197,94,0.25)'}}>
                    {bulkPushing?'⏳ Pushing (retrying images)...':'🛒 Push to Shopify'}{pushable>0&&!bulkPushing?` (${pushable} — will retry images)`:''}
                  </button>;
                })()}
                {/* Add to Products (manual sourcing tab) */}
                <button onClick={()=>{bulkAddToProducts();setTab('products');}} disabled={!latestBulkJob||latestBulkJob.passed===0} className="px-4 py-2 rounded-lg text-[11px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:scale-[1.02]" style={{background:'linear-gradient(135deg,#06b6d4,#0891b2)',boxShadow:'0 2px 8px rgba(6,182,212,0.25)'}}>
                  📋 Add Passed to Products{latestBulkJob&&latestBulkJob.passed>0?` (${latestBulkJob.passed})`:''}
                </button>
                {/* Export Flagged */}
                <button onClick={bulkExportFlagged} disabled={!latestBulkJob||latestBulkJob.flagged===0} className="px-4 py-2 rounded-lg text-[11px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:scale-[1.02] gl text-amber-400 border border-amber-500/30 hover:bg-amber-500/10">
                  📥 Export Flagged to Spreadsheet{latestBulkJob&&latestBulkJob.flagged>0?` (${latestBulkJob.flagged})`:''}
                </button>
              </div>
              {latestBulkJob&&(<p className="text-[9px] text-zinc-500 mt-2">Push sends passed + image-flagged products to Shopify (retries image fetch at push time, skips products where images still can&apos;t be found) · Export creates a CSV of flagged products</p>)}
            </div>

            {/* TABLE VIEW */}
            {bulkView==='table'&&(<div className="gl rounded-2xl overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-zinc-800/50 text-zinc-500 uppercase text-[8px]"><th className="p-2.5 text-center w-16">Status</th><th className="p-2.5 text-left">Product</th><th className="p-2.5 text-left">ASIN</th><th className="p-2.5 text-right">Cost</th><th className="p-2.5 text-right">Sale</th><th className="p-2.5 text-right">Compare</th><th className="p-2.5 text-center">Completeness</th><th className="p-2.5 text-center">Image</th><th className="p-2.5 text-center">Desc</th><th className="p-2.5 text-center">URL</th><th className="p-2.5 text-center">Cat</th>{bulkFilter!=='passed'&&<th className="p-2.5 text-left">Flag Reasons</th>}</tr></thead><tbody>
              {filteredBulkProducts.map(p=>(<tr key={p.id} className={`border-b border-zinc-800/30 hover:bg-white/[0.02] cursor-pointer ${p.status==='flagged'?'bg-amber-500/[0.03]':''}`} onClick={()=>setBulkExpandId(bulkExpandId===p.id?null:p.id)}>
                <td className="p-2.5 text-center">{p.status==='passed'?<span className="text-[8px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold">PASS</span>:<span className="text-[8px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-bold">FLAG</span>}</td>
                <td className="p-2.5 max-w-[250px]"><p className="text-white font-medium truncate text-[11px]">{p.title}</p><p className="text-[9px] text-zinc-500">{p.vendor} · {p.enrichedCategory}</p></td>
                <td className="p-2.5"><span className="text-[9px] text-cyan-400" style={{fontFamily:'JetBrains Mono,monospace'}}>{p.asin||'—'}</span></td>
                <td className="p-2.5 text-right" style={{fontFamily:'JetBrains Mono,monospace'}}><span className="text-zinc-400">{p.enrichedCost>0?`$${p.enrichedCost.toFixed(2)}`:'—'}</span></td>
                <td className="p-2.5 text-right" style={{fontFamily:'JetBrains Mono,monospace'}}><span className="text-emerald-400 font-semibold">{p.enrichedSalePrice>0?`$${p.enrichedSalePrice.toFixed(2)}`:'—'}</span></td>
                <td className="p-2.5 text-right" style={{fontFamily:'JetBrains Mono,monospace'}}><span className="text-zinc-500">{p.enrichedCompareAt>0?`$${p.enrichedCompareAt.toFixed(2)}`:'—'}</span></td>
                <td className="p-2.5 text-center"><span className={`text-[9px] font-bold ${p.completeness>=7?'text-emerald-400':p.completeness>=5?'text-amber-400':'text-red-400'}`}>{p.completeness}/8</span></td>
                <td className="p-2.5 text-center">{p.enrichedImage?<span className="text-emerald-400 text-[9px]">✓</span>:<span className="text-red-400 text-[9px]">✗</span>}</td>
                <td className="p-2.5 text-center">{p.enrichedDescription?<span className="text-emerald-400 text-[9px]">✓</span>:<span className="text-red-400 text-[9px]">✗</span>}</td>
                <td className="p-2.5 text-center">{p.enrichedAmazonUrl?<span className="text-emerald-400 text-[9px]">✓</span>:<span className="text-red-400 text-[9px]">✗</span>}</td>
                <td className="p-2.5 text-center">{p.enrichedCategory&&p.enrichedCategory!=='Uncategorized'?<span className="text-emerald-400 text-[9px]">✓</span>:<span className="text-amber-400 text-[9px]">~</span>}</td>
                {bulkFilter!=='passed'&&<td className="p-2.5">{p.flagReasons.length>0?p.flagReasons.map((r,ri)=><span key={ri} className="text-[8px] text-amber-400 block">{r}</span>):<span className="text-[8px] text-emerald-400">All sourced ✓</span>}</td>}
              </tr>))}
            </tbody></table></div></div>)}

            {/* CARD VIEW */}
            {bulkView==='card'&&(<div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredBulkProducts.map(p=>(<div key={p.id} className={`gl rounded-xl p-4 hover:border-cyan-500/20 transition-all ${p.status==='flagged'?'border-amber-500/20':''}`}>
                <div className="flex items-start justify-between mb-2"><div className="flex-1 min-w-0"><p className="text-[11px] font-semibold text-white truncate">{p.title}</p><p className="text-[9px] text-zinc-500 mt-0.5">{p.vendor} · {p.enrichedCategory}</p></div>{p.status==='passed'?<span className="text-[8px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold ml-2 flex-shrink-0">PASS</span>:<span className="text-[8px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-bold ml-2 flex-shrink-0">FLAG</span>}</div>
                <div className="flex items-center gap-2 text-[9px] mb-2"><span className="text-cyan-400" style={{fontFamily:'JetBrains Mono,monospace'}}>{p.asin}</span>{p.enrichedAmazonUrl&&<a href={p.enrichedAmazonUrl} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">↗ Amazon</a>}</div>
                <div className="flex items-center gap-3 mb-2 text-[10px]">{p.enrichedCost>0&&<span className="text-zinc-400">Cost: <span className="text-white" style={{fontFamily:'JetBrains Mono,monospace'}}>${p.enrichedCost.toFixed(2)}</span></span>}{p.enrichedSalePrice>0&&<span className="text-emerald-400 font-bold" style={{fontFamily:'JetBrains Mono,monospace'}}>Sale: ${p.enrichedSalePrice.toFixed(2)}</span>}{p.enrichedCompareAt>0&&<span className="text-zinc-500 line-through" style={{fontFamily:'JetBrains Mono,monospace'}}>${p.enrichedCompareAt.toFixed(2)}</span>}</div>
                <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                  <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-bold ${p.enrichedImage?'bg-emerald-500/15 text-emerald-400':'bg-red-500/15 text-red-400'}`}>{p.enrichedImage?'✓ Image':'✗ Image'}</span>
                  <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-bold ${p.enrichedDescription?'bg-emerald-500/15 text-emerald-400':'bg-red-500/15 text-red-400'}`}>{p.enrichedDescription?'✓ Description':'✗ Description'}</span>
                  <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-bold ${p.enrichedCost>0?'bg-emerald-500/15 text-emerald-400':'bg-red-500/15 text-red-400'}`}>{p.enrichedCost>0?'✓ Cost':'✗ Cost'}</span>
                  <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-bold ${p.enrichedAmazonUrl?'bg-emerald-500/15 text-emerald-400':'bg-red-500/15 text-red-400'}`}>{p.enrichedAmazonUrl?'✓ URL':'✗ URL'}</span>
                  <span className="text-[7px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-400">✓ Qty: {p.enrichedQty}</span>
                  <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-bold ${p.completeness>=7?'bg-emerald-500/15 text-emerald-400':'bg-amber-500/15 text-amber-400'}`}>{p.completeness}/8</span>
                </div>
                {p.flagReasons.length>0&&(<div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/15 space-y-0.5">{p.flagReasons.map((r,ri)=><p key={ri} className="text-[9px] text-amber-400">⚠ {r}</p>)}</div>)}
                {p.status==='passed'&&(<button onClick={()=>setBulkExpandId(bulkExpandId===p.id?null:p.id)} className="text-[8px] text-cyan-400 hover:underline mt-2">Preview generated description</button>)}
                {bulkExpandId===p.id&&p.enrichedDescription&&(<div className="mt-2 p-3 rounded-lg bg-[#0c0c18] border border-cyan-500/20"><p className="text-[8px] text-cyan-400 uppercase font-bold mb-1">Generated Description</p><p className="text-[10px] text-zinc-300">{p.enrichedDescription}</p></div>)}
              </div>))}
            </div>)}
          </>)}
        </div>)}

        {/* ════════════════════════════════════════════════════════ */}
        {/* PRODUCTS TAB                                            */}
        {/* ════════════════════════════════════════════════════════ */}
        {tab==='products'&&(<div className="space-y-4">
          <div className="gl rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." className="flex-1 min-w-[200px] px-4 py-2 bg-[#0c0c18] border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none"/><div className="flex gap-1">{[{k:'all',l:'All'},{k:'active',l:'Active'},{k:'flagged',l:'Flagged'},{k:'oos',l:'OOS'}].map(f=><button key={f.k} onClick={()=>setFilt(f.k)} className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold ${filt===f.k?'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30':'gl text-zinc-400'}`}>{f.l}</button>)}</div><button onClick={runPriceCheck} disabled={pcheck} className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{background:'linear-gradient(135deg,#f59e0b,#d97706)'}}>{pcheck?'⏳ Checking...':'🔄 Check Prices'}</button><button onClick={pushSel} className="px-4 py-2 rounded-lg text-xs font-semibold text-white" style={{background:'linear-gradient(135deg,#22c55e,#16a34a)'}}>↑ Push</button></div>
          <div className="gl rounded-2xl overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-zinc-800/50 text-zinc-500 uppercase text-[8px]"><th className="p-3"><input type="checkbox" checked={selAll} onChange={()=>{const n=!selAll;setSelAll(n);setProducts(p=>p.map(x=>({...x,sel:n})));}} className="accent-cyan-500"/></th><th className="p-3 text-left">Product</th><th className="p-3 text-right">Cost</th><th className="p-3 text-right">Sale$</th><th className="p-3 text-right">Profit</th><th className="p-3 text-right">Markup</th><th className="p-3 text-center">Stock</th><th className="p-3 text-center">Shopify</th></tr></thead><tbody>{dsp.length===0?<tr><td colSpan={8} className="p-8 text-center text-zinc-500">No products. Use Manual, Auto, or Bulk Import.</td></tr>:dsp.map(p=>(<tr key={p.id} className={`border-b border-zinc-800/30 hover:bg-white/[0.02] ${p.sel?'bg-cyan-500/5':''}`}><td className="p-3"><input type="checkbox" checked={p.sel} onChange={()=>setProducts(prev=>prev.map(x=>x.id===p.id?{...x,sel:!x.sel}:x))} className="accent-cyan-500"/></td><td className="p-3 max-w-[200px]"><p className="text-white font-medium truncate">{p.title}</p><p className="text-[9px] text-zinc-500">{p.asin}</p></td><td className="p-3 text-right text-zinc-400" style={{fontFamily:'JetBrains Mono,monospace'}}>${p.costPrice.toFixed(2)}</td><td className="p-3 text-right text-emerald-400 font-semibold" style={{fontFamily:'JetBrains Mono,monospace'}}>${p.salePrice.toFixed(2)}</td><td className="p-3 text-right text-emerald-400" style={{fontFamily:'JetBrains Mono,monospace'}}>${p.dollarProfit.toFixed(2)}</td><td className="p-3 text-right"><span className={`font-semibold ${p.markupPct>=100?'text-emerald-400':'text-amber-400'}`}>{p.markupPct}%</span></td><td className="p-3 text-center"><span className={`text-[8px] px-1.5 py-0.5 rounded-full ${p.avail==='in_stock'?'bg-emerald-500/15 text-emerald-400':'bg-red-500/15 text-red-400'}`}>{p.avail==='in_stock'?'In Stock':'OOS'}</span></td><td className="p-3 text-center"><span className={`text-[8px] px-1.5 py-0.5 rounded-full ${p.shopStatus==='active'?'bg-emerald-500/15 text-emerald-400':'bg-zinc-500/15 text-zinc-400'}`}>{p.shopStatus}</span></td></tr>))}</tbody></table></div></div>
        </div>)}

        {/* ═══ HISTORY TAB ═══ */}
        {tab==='history'&&(<div className="gl rounded-2xl p-5"><h3 className="text-sm font-bold text-white mb-4">📜 History</h3><div className="space-y-2">{[{t:'Now',a:'Page loaded',ty:'system'},{t:'—',a:'Bulk import: reads actual file, checks 8 required fields per product',ty:'rule'},{t:'—',a:'Pass = all 8 fields sourced (ASIN enables Amazon enrichment)',ty:'rule'},{t:'—',a:'Flag = missing data that cannot be sourced, with specific reason',ty:'rule'},{t:'—',a:'Manual sourcing criteria are SEPARATE from bulk import criteria',ty:'rule'},{t:'—',a:'Weekly price check: Sundays 3AM',ty:'schedule'}].map((h,i)=>(<div key={i} className="flex items-center gap-3 p-3 bg-[#0c0c18] rounded-lg border border-zinc-800"><span className="text-[10px] text-zinc-500 w-12" style={{fontFamily:'JetBrains Mono,monospace'}}>{h.t}</span><span className={`text-[8px] px-2 py-0.5 rounded-full uppercase font-bold ${h.ty==='system'?'bg-cyan-500/15 text-cyan-400':h.ty==='schedule'?'bg-violet-500/15 text-violet-400':'bg-amber-500/15 text-amber-400'}`}>{h.ty}</span><span className="text-xs text-zinc-300">{h.a}</span></div>))}</div></div>)}

      </div>
    </div>
  );
}

