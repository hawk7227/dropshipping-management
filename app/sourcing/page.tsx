'use client';
import React, { useState, useCallback, useRef, useMemo } from 'react';

// ============================================================
// DISCOVERY CRITERIA — From Product Discovery Engine Doc
// ============================================================
const DC = {
  minAmazonPrice: 3, maxAmazonPrice: 25, minDollarProfit: 4,
  maxRetailPrice: 40, minMarkupPercent: 80,
  tiers: [
    { maxCost: 7, mult: 2.50, label: '$0-$7' },
    { maxCost: 12, mult: 2.00, label: '$8-$12' },
    { maxCost: 18, mult: 1.80, label: '$13-$18' },
    { maxCost: 25, mult: 1.80, label: '$19-$25' },
  ],
  minReviews: 500, minRating: 3.5, requirePrime: true, maxWeightLbs: 5,
  minPassingScore: 50, defaultQty: 50,
  priceCheck: 'Weekly 3AM Sunday', gracePeriod: 48,
  blocked: ['nike','adidas','apple','samsung','sony','lg','philips','bose','dyson','kitchenaid','ninja','instant pot','yeti','hydroflask','stanley','branded','official','licensed','authentic','disney','marvel','nintendo','refurbished','renewed','used','pre-owned','certified'],
  cats: ['Beauty & Personal Care','Kitchen Gadgets','Pet Products','Home & LED Lighting','Fitness & Wellness','Tech Accessories','Organization & Storage','Car Accessories'],
  terms: {
    'Beauty & Personal Care': ['ice roller face','jade roller gua sha set','led face mask therapy','hair straightener brush','heatless curling rod','scalp massager shampoo brush','facial steamer','dermaplaning tool','electric makeup brush cleaner','heated eyelash curler','pore vacuum','nail gel polish kit','hair oil serum','teeth whitening kit','blackhead remover tool'],
    'Kitchen Gadgets': ['portable blender usb','vegetable chopper dicer','milk frother handheld','egg separator tool','avocado slicer','herb scissors','oil sprayer for cooking','garlic press','silicone baking mat','mandoline slicer','electric can opener','spice grinder','kitchen scale digital','produce saver containers','pizza cutter wheel'],
    'Pet Products': ['cat backpack carrier','pet grooming glove','cat laser toy automatic','dog paw cleaner','pet water fountain','slow feeder dog bowl','dog bandana set','cat window perch','pet hair remover roller','dog treat pouch','interactive cat toy','dog seat belt','pet nail grinder','dog cooling mat','cat tunnel toy'],
    'Home & LED Lighting': ['led strip lights 16ft','sunset lamp projector','galaxy projector','mushroom lamp','moon lamp 3d','led candles flameless','smart light bulbs','neon sign custom','fairy lights bedroom','salt lamp','lava lamp','led desk lamp','star projector','color changing light bulb','under cabinet lights'],
    'Fitness & Wellness': ['resistance bands set','yoga mat','massage gun mini','foam roller','jump rope weighted','ankle weights','posture corrector','acupressure mat','ab roller wheel','grip strengthener','wrist wraps gym','pull up bands','balance board','knee sleeves','fitness tracker band'],
    'Tech Accessories': ['phone stand adjustable','laptop stand','wireless charger pad','ring light 10 inch','selfie stick tripod','usb hub multiport','mouse pad gaming xl','keyboard wrist rest','monitor light bar','headphone stand','cable organizer','webcam cover','screen cleaner kit','phone grip ring holder','portable charger 10000mah'],
    'Organization & Storage': ['drawer organizer set','closet organizer','makeup organizer rotating','jewelry organizer','desk organizer','shoe rack stackable','spice rack','under bed storage','cable management','bathroom organizer','pantry organizer bins'],
    'Car Accessories': ['car phone mount magnetic','seat gap filler','car vacuum mini','trunk organizer','blind spot mirrors','car air freshener','steering wheel cover','car trash can','sun shade windshield','car seat organizer'],
  } as Record<string, string[]>,
};

// ============================================================
// TYPES
// ============================================================
interface Comp { name: string; price: number; }
interface Product {
  id: string; asin: string; title: string; image: string; category: string;
  amazonPrice: number; costPrice: number; salePrice: number; compareAtPrice: number;
  multiplier: number; comps: Comp[]; dollarProfit: number; markupPct: number;
  rating: number; reviews: number; bsr: number; weight: number;
  avail: 'in_stock' | 'low_stock' | 'oos' | 'unavail';
  prime: boolean; score: number; shopId: string | null;
  shopStatus: 'none' | 'active' | 'draft' | 'pushing' | 'archived';
  qty: number; filter: string; sourcedAt: string; lastCheck: string;
  sel: boolean; src: 'auto' | 'manual' | 'bulk_asin' | 'bulk_shop' | 'pull';
}
interface BulkJob {
  id: string; file: string; fmt: 'asin' | 'shopify' | 'unknown';
  total: number; unique: number; done: number; pass: number; fail: number; flag: number;
  status: string; stage: string; at: string;
}
interface FStats {
  total: number; price: number; brand: number; reviews: number; rating: number;
  prime: number; weight: number; cat: number; markup: number; profit: number;
  retail: number; score: number; final: number;
}
type Tab = 'manual' | 'auto' | 'pricing' | 'bulk' | 'products' | 'history';

// ============================================================
// PRICING ENGINE
// ============================================================
function getMult(cost: number) {
  for (const t of DC.tiers) { if (cost <= t.maxCost) return t; }
  return DC.tiers[3];
}
function calcPrice(cost: number, maxRetail: number) {
  const t = getMult(cost);
  let raw = cost * t.mult;
  let sp = Math.floor(raw) + 0.99;
  if (sp > raw + 0.50) sp -= 1;
  const dp = Math.round((sp - cost) * 100) / 100;
  const mp = Math.round(((sp - cost) / cost) * 100);
  return { sp, dp, mp, mult: t.mult, tier: t.label, okMu: mp >= DC.minMarkupPercent, okPr: dp >= DC.minDollarProfit, okRt: sp <= maxRetail };
}
function scoreP(mp: number, rev: number, rat: number, bsr: number, cat: string) {
  let s = 0;
  s += mp >= 150 ? 25 : mp >= 100 ? 15 : 10;
  s += rev >= 10000 ? 20 : rev >= 5000 ? 15 : rev >= 1000 ? 10 : 5;
  s += rat >= 4.5 ? 10 : rat >= 4.0 ? 6 : 3;
  s += bsr > 0 && bsr <= 5000 ? 15 : bsr <= 20000 ? 10 : bsr <= 50000 ? 5 : 2;
  s += ['Beauty & Personal Care','Home & LED Lighting','Pet Products','Fitness & Wellness'].includes(cat) ? 10 : 5;
  s += 12; // stability + trend placeholder
  return Math.min(s, 100);
}

// ============================================================
// MOCK DATA — sample survivors for preview
// ============================================================
const SAMPLES: Omit<Product, 'sel'>[] = [
  { id:'s1', asin:'B0C8XYZ123', title:'Ice Roller for Face & Eye Puffiness Relief', image:'', category:'Beauty & Personal Care', amazonPrice:6.50, costPrice:6.50, salePrice:15.99, compareAtPrice:19.99, multiplier:2.50, comps:[{name:'Walmart',price:19.99},{name:'eBay',price:14.99},{name:'Target',price:0}], dollarProfit:9.49, markupPct:146, rating:4.7, reviews:12400, bsr:1823, weight:0.3, avail:'in_stock', prime:true, score:97, shopId:null, shopStatus:'none', qty:0, filter:'pass', sourcedAt:new Date().toISOString(), lastCheck:new Date().toISOString(), src:'manual' },
  { id:'s2', asin:'B0D4ABC456', title:'Jade Roller Gua Sha Set Face Massager', image:'', category:'Beauty & Personal Care', amazonPrice:5.80, costPrice:5.80, salePrice:13.99, compareAtPrice:18.99, multiplier:2.50, comps:[{name:'Walmart',price:18.99},{name:'eBay',price:12.99},{name:'Amazon',price:5.80}], dollarProfit:8.19, markupPct:141, rating:4.5, reviews:8700, bsr:3210, weight:0.4, avail:'in_stock', prime:true, score:89, shopId:null, shopStatus:'none', qty:0, filter:'pass', sourcedAt:new Date().toISOString(), lastCheck:new Date().toISOString(), src:'manual' },
  { id:'s3', asin:'B0B9DEF789', title:'LED Face Mask Light Therapy 7 Colors', image:'', category:'Beauty & Personal Care', amazonPrice:18.00, costPrice:18.00, salePrice:31.99, compareAtPrice:44.99, multiplier:1.80, comps:[{name:'Walmart',price:44.99},{name:'Target',price:39.99},{name:'eBay',price:35.99}], dollarProfit:13.99, markupPct:78, rating:4.3, reviews:5600, bsr:5100, weight:1.2, avail:'in_stock', prime:true, score:72, shopId:null, shopStatus:'none', qty:0, filter:'pass', sourcedAt:new Date().toISOString(), lastCheck:new Date().toISOString(), src:'manual' },
  { id:'s4', asin:'B0CQRS012', title:'Scalp Massager Shampoo Brush Hair Growth', image:'', category:'Beauty & Personal Care', amazonPrice:4.20, costPrice:4.20, salePrice:9.99, compareAtPrice:14.99, multiplier:2.50, comps:[{name:'Walmart',price:12.99},{name:'eBay',price:9.99},{name:'Target',price:0}], dollarProfit:5.79, markupPct:138, rating:4.6, reviews:22000, bsr:890, weight:0.2, avail:'in_stock', prime:true, score:94, shopId:null, shopStatus:'none', qty:0, filter:'pass', sourcedAt:new Date().toISOString(), lastCheck:new Date().toISOString(), src:'manual' },
  { id:'s5', asin:'B0ATUV345', title:'Portable Blender USB Rechargeable 6 Blades', image:'', category:'Kitchen Gadgets', amazonPrice:12.00, costPrice:12.00, salePrice:23.99, compareAtPrice:34.99, multiplier:2.00, comps:[{name:'Walmart',price:29.99},{name:'Target',price:34.99},{name:'eBay',price:27.99}], dollarProfit:11.99, markupPct:100, rating:4.4, reviews:9800, bsr:2100, weight:0.8, avail:'in_stock', prime:true, score:88, shopId:null, shopStatus:'none', qty:0, filter:'pass', sourcedAt:new Date().toISOString(), lastCheck:new Date().toISOString(), src:'manual' },
  { id:'s6', asin:'B0EWXY678', title:'Galaxy Star Projector Night Light Bluetooth', image:'', category:'Home & LED Lighting', amazonPrice:8.50, costPrice:8.50, salePrice:16.99, compareAtPrice:24.99, multiplier:2.00, comps:[{name:'Walmart',price:22.99},{name:'eBay',price:19.99},{name:'Target',price:0}], dollarProfit:8.49, markupPct:100, rating:4.2, reviews:15000, bsr:1500, weight:0.6, avail:'in_stock', prime:true, score:85, shopId:null, shopStatus:'none', qty:0, filter:'pass', sourcedAt:new Date().toISOString(), lastCheck:new Date().toISOString(), src:'manual' },
  { id:'s7', asin:'B0FZAB901', title:'Dog Paw Cleaner Portable Washer Cup', image:'', category:'Pet Products', amazonPrice:7.00, costPrice:7.00, salePrice:16.99, compareAtPrice:22.99, multiplier:2.50, comps:[{name:'Walmart',price:16.99},{name:'eBay',price:14.99},{name:'Amazon',price:7.00}], dollarProfit:9.99, markupPct:143, rating:4.3, reviews:6200, bsr:4800, weight:0.5, avail:'in_stock', prime:true, score:78, shopId:null, shopStatus:'none', qty:0, filter:'flag_comp', sourcedAt:new Date().toISOString(), lastCheck:new Date().toISOString(), src:'manual' },
  { id:'s8', asin:'B0GHIJ234', title:'Resistance Bands Set 5 Levels Exercise', image:'', category:'Fitness & Wellness', amazonPrice:9.00, costPrice:9.00, salePrice:17.99, compareAtPrice:29.99, multiplier:2.00, comps:[{name:'Walmart',price:14.99},{name:'Target',price:19.99},{name:'eBay',price:16.99}], dollarProfit:8.99, markupPct:100, rating:4.5, reviews:31000, bsr:600, weight:0.3, avail:'in_stock', prime:true, score:92, shopId:null, shopStatus:'none', qty:0, filter:'flag_comp', sourcedAt:new Date().toISOString(), lastCheck:new Date().toISOString(), src:'manual' },
  { id:'s9', asin:'B0KLMNO567', title:'Sunset Lamp Projector 360 Degree Rotation', image:'', category:'Home & LED Lighting', amazonPrice:7.50, costPrice:7.50, salePrice:17.99, compareAtPrice:24.99, multiplier:2.50, comps:[{name:'Walmart',price:19.99},{name:'eBay',price:16.99},{name:'Target',price:0}], dollarProfit:10.49, markupPct:140, rating:4.1, reviews:7800, bsr:3400, weight:0.4, avail:'in_stock', prime:true, score:81, shopId:null, shopStatus:'none', qty:0, filter:'pass', sourcedAt:new Date().toISOString(), lastCheck:new Date().toISOString(), src:'manual' },
  { id:'s10', asin:'B0PQRST890', title:'Pet Hair Remover Roller Reusable Lint', image:'', category:'Pet Products', amazonPrice:5.00, costPrice:5.00, salePrice:11.99, compareAtPrice:17.99, multiplier:2.50, comps:[{name:'Walmart',price:12.99},{name:'Target',price:14.99},{name:'eBay',price:11.99}], dollarProfit:6.99, markupPct:140, rating:4.4, reviews:18000, bsr:1200, weight:0.3, avail:'in_stock', prime:true, score:90, shopId:null, shopStatus:'none', qty:0, filter:'flag_comp', sourcedAt:new Date().toISOString(), lastCheck:new Date().toISOString(), src:'manual' },
];

// ============================================================
// COMPONENT
// ============================================================
export default function SourcingEngine() {
  const [tab, setTab] = useState<Tab>('manual');
  const [crit, setCrit] = useState({ minP: DC.minAmazonPrice, maxP: DC.maxAmazonPrice, minMu: DC.minMarkupPercent, minRev: DC.minReviews, minRat: DC.minRating, maxBsr: 100000, maxWt: DC.maxWeightLbs, maxRet: DC.maxRetailPrice, minDp: DC.minDollarProfit, toSource: 1000, prime: DC.requirePrime, blocked: DC.blocked.join(', '), cats: [...DC.cats] });
  const [products, setProducts] = useState<Product[]>([]);
  const [preview, setPreview] = useState<Product[]>([]);
  const [fstats, setFstats] = useState<FStats | null>(null);
  const [prevMode, setPrevMode] = useState(false);
  const [autoOn, setAutoOn] = useState(false);
  const [autoInt, setAutoInt] = useState(60);
  const [autoMax, setAutoMax] = useState(500);
  const [autoToday, setAutoToday] = useState(0);
  const [autoLast, setAutoLast] = useState<string | null>(null);
  const [jobs, setJobs] = useState<BulkJob[]>([]);
  const fref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pcheck, setPcheck] = useState(false);
  const [search, setSearch] = useState('');
  const [filt, setFilt] = useState('all');
  const [selAll, setSelAll] = useState(false);

  const total = products.length;
  const inShop = products.filter(p => p.shopStatus === 'active').length;
  const avgMu = total > 0 ? Math.round(products.reduce((a, p) => a + p.markupPct, 0) / total) : 0;
  const oosN = products.filter(p => p.avail === 'oos' || p.avail === 'unavail').length;
  const flagN = products.filter(p => p.markupPct < crit.minMu || p.avail === 'oos').length;

  // Preview handler
  const runPreview = useCallback(() => {
    setBusy(true);
    setTimeout(() => {
      const raw = 800;
      let r = raw;
      const fs: FStats = { total: raw, price:0, brand:0, reviews:0, rating:0, prime:0, weight:0, cat:0, markup:0, profit:0, retail:0, score:0, final:0 };
      fs.price = Math.round(r * 0.75); r = fs.price;
      fs.brand = Math.round(r * 0.78); r = fs.brand;
      fs.reviews = Math.round(r * 0.74); r = fs.reviews;
      fs.rating = Math.round(r * 0.85); r = fs.rating;
      fs.prime = Math.round(r * 0.88); r = fs.prime;
      fs.weight = Math.round(r * 0.92); r = fs.weight;
      fs.cat = Math.round(r * 0.95); r = fs.cat;
      fs.markup = Math.round(r * 0.70); r = fs.markup;
      fs.profit = Math.round(r * 0.85); r = fs.profit;
      fs.retail = Math.round(r * 0.90); r = fs.retail;
      fs.score = Math.round(r * 0.45); r = fs.score;
      fs.final = r;
      setFstats(fs);
      setPreview(SAMPLES.map(s => ({ ...s, sel: false })));
      setPrevMode(true);
      setBusy(false);
    }, 2500);
  }, []);

  const importAll = useCallback(() => {
    const imp = preview.filter(p => p.filter === 'pass' || p.filter.startsWith('flag'));
    setProducts(prev => [...prev, ...imp.map(p => ({ ...p, qty: DC.defaultQty, shopStatus: 'pushing' as const }))]);
    setTimeout(() => {
      setProducts(prev => prev.map(p => p.shopStatus === 'pushing' ? { ...p, shopStatus: 'active' as const, shopId: `gid://shopify/${Date.now()}-${p.id}` } : p));
    }, 2000);
    setPrevMode(false); setPreview([]);
    setTab('products');
  }, [preview]);

  const pushSel = useCallback(() => {
    setProducts(prev => prev.map(p => p.sel ? { ...p, shopStatus: 'pushing' as const, qty: Math.max(p.qty, DC.defaultQty), sel: false } : p));
    setSelAll(false);
    setTimeout(() => { setProducts(prev => prev.map(p => p.shopStatus === 'pushing' ? { ...p, shopStatus: 'active' as const, shopId: p.shopId || `gid://shopify/${Date.now()}` } : p)); }, 2000);
  }, []);

  const handleBulk = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const isAsin = f.name.toLowerCase().includes('15k') || f.name.toLowerCase().includes('asin');
    const j: BulkJob = { id:`j-${Date.now()}`, file:f.name, fmt:isAsin?'asin':'shopify', total:0, unique:0, done:0, pass:0, fail:0, flag:0, status:'detecting', stage:'Detecting format...', at:new Date().toISOString() };
    setJobs(prev => [j, ...prev]);
    const tot = isAsin ? 15248 : 70073;
    const uni = isAsin ? 15248 : 7648;
    setTimeout(() => setJobs(p => p.map(x => x.id===j.id ? { ...x, status:'parsing', stage:isAsin ? 'ASIN-Only (2 cols: URL + ASIN). Extracting ASINs...' : 'Shopify Export (166 cols). Parsing unique products from variant rows...', total:tot, unique:uni } : x)), 800);
    setTimeout(() => setJobs(p => p.map(x => x.id===j.id ? { ...x, status:'keepa', stage:isAsin ? `Keepa batch: ${Math.ceil(uni/100)} calls for ${uni.toLocaleString()} ASINs...` : `Keepa batch: ${Math.ceil(uni/100)} calls for ${uni.toLocaleString()} products...`, done:Math.round(uni*0.3) } : x)), 2500);
    setTimeout(() => setJobs(p => p.map(x => x.id===j.id ? { ...x, status:'filter', stage:'Hard filters: price→brand→reviews→rating→prime→weight→category→markup→profit→retail cap...', done:Math.round(uni*0.6) } : x)), 5000);
    setTimeout(() => setJobs(p => p.map(x => x.id===j.id ? { ...x, status:'score', stage:'Scoring survivors (need 50+) + tiered multiplier calc...', done:Math.round(uni*0.85) } : x)), 7500);
    setTimeout(() => setJobs(p => p.map(x => x.id===j.id ? { ...x, status:'rainforest', stage:isAsin ? `Rainforest deep check on ~142 survivors (95% savings!)` : `Price-checking ${uni.toLocaleString()} products for current availability...`, done:uni } : x)), 10000);
    setTimeout(() => {
      const pa = isAsin ? 89 : 4200;
      const fa = isAsin ? 15106 : 2800;
      const fl = isAsin ? 53 : 648;
      setJobs(p => p.map(x => x.id===j.id ? { ...x, status:'done', stage:'Complete! Review results in Products tab.', done:uni, pass:pa, fail:fa, flag:fl } : x));
    }, 13000);
    if (fref.current) fref.current.value = '';
  }, []);

  const dsp = useMemo(() => {
    let l = products;
    if (filt === 'active') l = l.filter(p => p.shopStatus === 'active');
    if (filt === 'flagged') l = l.filter(p => p.markupPct < crit.minMu);
    if (filt === 'oos') l = l.filter(p => p.avail === 'oos' || p.avail === 'unavail');
    if (search) { const q = search.toLowerCase(); l = l.filter(p => p.title.toLowerCase().includes(q) || p.asin.toLowerCase().includes(q)); }
    return l;
  }, [products, filt, search, crit.minMu]);

  // Badges
  const ab = (a: Product['avail']) => { const m: Record<string,[string,string]> = { in_stock:['bg-emerald-500/15 text-emerald-400','In Stock'], low_stock:['bg-amber-500/15 text-amber-400','Low'], oos:['bg-red-500/15 text-red-400','OOS'], unavail:['bg-red-500/15 text-red-400','Unavail'] }; const [c,l]=m[a]||m.unavail; return <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${c}`}>{l}</span>; };
  const sb = (s: Product['shopStatus']) => { const m: Record<string,[string,string]> = { none:['bg-zinc-500/10 text-zinc-500','None'], active:['bg-emerald-500/15 text-emerald-400','Active'], draft:['bg-amber-500/15 text-amber-400','Draft'], pushing:['bg-cyan-500/15 text-cyan-400','Pushing...'], archived:['bg-zinc-500/15 text-zinc-400','Archived'] }; const [c,l]=m[s]||m.none; return <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${c}`}>{l}</span>; };
  const fb = (f: string) => f === 'pass' ? <span className="text-[7px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">PASS</span> : f.startsWith('flag') ? <span className="text-[7px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold">FLAG</span> : <span className="text-[7px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-bold">FAIL</span>;

  // Input helper
  const Inp = ({ l, v, k, s }: { l: string; v: number; k: string; s?: string }) => (
    <div>
      <label className="text-[8px] text-zinc-500 uppercase tracking-wider block mb-1">{l}</label>
      <input type="number" step={s||'1'} value={v} onChange={e => setCrit((p: any) => ({ ...p, [k]: Number(e.target.value) }))}
        className="w-full px-3 py-2.5 bg-[#0c0c18] border border-zinc-800 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none" style={{fontFamily:'JetBrains Mono,monospace'}} />
    </div>
  );

  return (
    <div className="min-h-screen p-4 lg:p-6" style={{ background:'#080810', color:'#e4e4e7', fontFamily:"'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');.gl{background:rgba(255,255,255,0.03);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.06)}.fb{transition:width 0.8s ease-out}`}</style>
      <div className="max-w-[1800px] mx-auto">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl" style={{background:'linear-gradient(135deg,#06b6d4,#8b5cf6)',boxShadow:'0 8px 24px rgba(6,182,212,0.3)'}}>🎯</div>
            <div><h1 className="text-2xl font-bold tracking-tight text-white">Product Sourcing Engine</h1><p className="text-xs text-zinc-500">Criteria-First · Demand-Filtered · 80%+ Profit</p></div>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="px-3 py-1.5 rounded-lg gl">Today: <strong className="text-cyan-400">{autoToday}</strong></span>
            <span className="px-3 py-1.5 rounded-lg gl">7d: <strong className="text-cyan-400">0</strong></span>
            <span className="px-3 py-1.5 rounded-lg gl">30d: <strong className="text-cyan-400">0</strong></span>
            {oosN > 0 && <span className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 font-semibold">{oosN} OOS</span>}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
          {[{l:'Total Products',v:String(total),c:'#06b6d4'},{l:'In Shopify',v:String(inShop),c:'#22c55e'},{l:'Avg Markup',v:avgMu>0?`${avgMu}%`:'—',c:'#8b5cf6'},{l:'Flagged',v:String(flagN),c:flagN>0?'#f59e0b':'#3f3f46'},{l:'Auto Source',v:autoOn?'ON':'OFF',c:autoOn?'#22c55e':'#ef4444'},{l:'Price Check',v:pcheck?'Running':DC.priceCheck,c:pcheck?'#f59e0b':'#3f3f46'}].map((k,i)=>(
            <div key={i} className="gl rounded-xl p-3 text-center"><p className="text-xl font-bold" style={{color:k.c}}>{k.v}</p><p className="text-[9px] text-zinc-500 uppercase tracking-wider mt-0.5">{k.l}</p></div>
          ))}
        </div>

        {/* TABS */}
        <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
          {([{id:'manual' as Tab,i:'🔍',l:'Manual Sourcing'},{id:'auto' as Tab,i:'⚡',l:'Auto Sourcing'},{id:'pricing' as Tab,i:'💰',l:'Pricing Logic'},{id:'bulk' as Tab,i:'📦',l:'Bulk Import'},{id:'products' as Tab,i:'📋',l:`Products (${total})`},{id:'history' as Tab,i:'📜',l:'History'}]).map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} className={`px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${tab===t.id?'text-white':'gl text-zinc-400 hover:text-white'}`} style={tab===t.id?{background:'linear-gradient(135deg,#06b6d4,#8b5cf6)',boxShadow:'0 4px 16px rgba(139,92,246,0.3)'}:{}}>{t.i} {t.l}</button>
          ))}
        </div>

        {/* ══════ MANUAL SOURCING ══════ */}
        {tab === 'manual' && (<div className="space-y-4">
          <div className="gl rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">🎯 Discovery Criteria <span className="text-[9px] text-zinc-500 font-normal">(Criteria-First, Demand-Filtered)</span></h3>
              <span className="text-[9px] px-2.5 py-1 rounded-full gl text-zinc-400">Auto: {autoOn?'ON':'OFF'}</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
              <Inp l="MIN COST ($)" v={crit.minP} k="minP" s="0.5" />
              <Inp l="MAX COST ($)" v={crit.maxP} k="maxP" />
              <Inp l="MAX RETAIL PRICE ($)" v={crit.maxRet} k="maxRet" s="5" />
              <Inp l="MIN MARKUP (%)" v={crit.minMu} k="minMu" s="5" />
              <Inp l="MIN $ PROFIT" v={crit.minDp} k="minDp" s="0.5" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
              <Inp l="MIN REVIEWS" v={crit.minRev} k="minRev" />
              <Inp l="MIN RATING" v={crit.minRat} k="minRat" s="0.1" />
              <Inp l="MAX BSR" v={crit.maxBsr} k="maxBsr" />
              <Inp l="MAX WEIGHT (lbs)" v={crit.maxWt} k="maxWt" s="0.5" />
              <div className="flex items-center gap-3 pt-5">
                <button onClick={()=>setCrit(p=>({...p,prime:!p.prime}))} className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${crit.prime?'bg-cyan-500':'bg-zinc-700'}`}><div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${crit.prime?'left-[22px]':'left-0.5'}`}></div></button>
                <span className="text-xs text-zinc-300">Prime Only</span>
              </div>
            </div>
            <div className="mb-3">
              <label className="text-[8px] text-zinc-500 uppercase tracking-wider block mb-1">BLOCKED TITLE WORDS (case-insensitive)</label>
              <textarea value={crit.blocked} onChange={e=>setCrit(p=>({...p,blocked:e.target.value}))} rows={2} className="w-full px-3 py-2.5 bg-[#0c0c18] border border-zinc-800 rounded-lg text-[11px] text-zinc-300 focus:border-cyan-500 focus:outline-none resize-none" style={{fontFamily:'JetBrains Mono,monospace'}} />
            </div>
            {/* Multiplier tiers */}
            <div className="mb-4 p-3 bg-[#0c0c18] rounded-xl border border-zinc-800/50">
              <p className="text-[8px] text-zinc-500 uppercase tracking-wider mb-2">TIERED MULTIPLIER RULES</p>
              <div className="flex gap-2">{DC.tiers.map((t,i)=>(<div key={i} className="flex-1 text-center p-2 rounded-lg gl"><p className="text-[10px] text-zinc-400">{t.label}</p><p className="text-lg font-bold text-cyan-400" style={{fontFamily:'JetBrains Mono,monospace'}}>{t.mult}x</p></div>))}</div>
            </div>
            {/* Actions */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button onClick={runPreview} disabled={busy} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{background:'linear-gradient(135deg,#22c55e,#16a34a)',boxShadow:'0 4px 16px rgba(34,197,94,0.25)'}}>{busy?'⏳ Searching Keepa...':'🎯 Preview Products'}</button>
                <button onClick={importAll} disabled={preview.length===0} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-30" style={{background:'linear-gradient(135deg,#06b6d4,#0891b2)'}}>⬇️ Import All ({preview.filter(p=>p.filter==='pass'||p.filter.startsWith('flag')).length})</button>
              </div>
              <div className="flex gap-2">
                <button onClick={()=>setCrit({minP:3,maxP:25,minMu:80,minRev:500,minRat:3.5,maxBsr:100000,maxWt:5,maxRet:40,minDp:4,toSource:1000,prime:true,blocked:DC.blocked.join(', '),cats:[...DC.cats]})} className="px-3 py-2 gl rounded-lg text-[10px] text-zinc-400 hover:text-white">↩️ Reset</button>
                <button className="px-3 py-2 gl rounded-lg text-[10px] text-zinc-400 hover:text-white">💾 Save Cron</button>
              </div>
            </div>
          </div>

          {/* FUNNEL */}
          {fstats && (<div className="gl rounded-2xl p-5">
            <h4 className="text-sm font-bold text-white mb-3">📊 Filter Funnel — {fstats.total.toLocaleString()} analyzed</h4>
            <div className="space-y-1.5">{[
              {l:'Raw from Keepa',v:fstats.total,c:'#71717a'},{l:'✓ Price $3-$25',v:fstats.price,c:'#06b6d4'},{l:'✓ No blocked brands',v:fstats.brand,c:'#06b6d4'},{l:'✓ 500+ reviews',v:fstats.reviews,c:'#06b6d4'},{l:'✓ 3.5+ rating',v:fstats.rating,c:'#06b6d4'},{l:'✓ Prime eligible',v:fstats.prime,c:'#06b6d4'},{l:'✓ Under 5 lbs',v:fstats.weight,c:'#06b6d4'},{l:'✓ Safe category',v:fstats.cat,c:'#06b6d4'},{l:`✓ ${crit.minMu}%+ markup`,v:fstats.markup,c:'#8b5cf6'},{l:`✓ $${crit.minDp}+ profit`,v:fstats.profit,c:'#8b5cf6'},{l:`✓ Under $${crit.maxRet} retail`,v:fstats.retail,c:'#8b5cf6'},{l:'✓ Score 50+',v:fstats.score,c:'#22c55e'},{l:'🏁 SURVIVORS',v:fstats.final,c:'#22c55e'},
            ].map((s,i)=>(<div key={i} className="flex items-center gap-3"><span className="text-[10px] text-zinc-400 w-40 truncate">{s.l}</span><div className="flex-1 bg-zinc-900 rounded-full h-4 overflow-hidden"><div className="h-full rounded-full fb" style={{width:`${(s.v/fstats.total)*100}%`,background:s.c}}></div></div><span className="text-[10px] w-12 text-right" style={{color:s.c,fontFamily:'JetBrains Mono,monospace'}}>{s.v}</span></div>))}</div>
            <p className="text-[9px] text-zinc-500 mt-2">💡 95% API savings: {fstats.total} Keepa batch → {fstats.final} Rainforest calls</p>
          </div>)}

          {/* PREVIEW TABLE */}
          {prevMode && preview.length > 0 && (<div className="gl rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">🎯 Preview: {preview.length} survivors</h4>
              <button onClick={importAll} className="px-4 py-2 rounded-lg text-xs font-semibold text-white" style={{background:'linear-gradient(135deg,#22c55e,#16a34a)'}}>↑ Import All → Shopify (qty={DC.defaultQty})</button>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-zinc-800/50 text-zinc-500 uppercase text-[8px]"><th className="p-3 text-left">St</th><th className="p-3 text-left">Product</th><th className="p-3 text-right">Amazon$</th><th className="p-3 text-right">Sell$</th><th className="p-3 text-right">Profit</th><th className="p-3 text-right">Markup</th><th className="p-3 text-right">Score</th><th className="p-3 text-center">Tier</th><th className="p-3 text-center">Comp1</th><th className="p-3 text-center">Comp2</th><th className="p-3 text-center">Comp3</th></tr></thead>
            <tbody>{preview.map(p=>(<tr key={p.id} className="border-b border-zinc-800/30 hover:bg-white/[0.02]">
              <td className="p-3">{fb(p.filter)}</td>
              <td className="p-3 max-w-[200px]"><p className="text-white font-medium truncate">{p.title}</p><p className="text-[9px] text-zinc-500">{p.asin} · ⭐{p.rating} ({p.reviews.toLocaleString()}) · BSR #{p.bsr.toLocaleString()}</p></td>
              <td className="p-3 text-right text-zinc-400" style={{fontFamily:'JetBrains Mono,monospace'}}>${p.amazonPrice.toFixed(2)}</td>
              <td className="p-3 text-right text-emerald-400 font-semibold" style={{fontFamily:'JetBrains Mono,monospace'}}>${p.salePrice.toFixed(2)}</td>
              <td className="p-3 text-right text-emerald-400" style={{fontFamily:'JetBrains Mono,monospace'}}>${p.dollarProfit.toFixed(2)}</td>
              <td className="p-3 text-right"><span className={`font-semibold ${p.markupPct>=100?'text-emerald-400':p.markupPct>=80?'text-amber-400':'text-red-400'}`}>{p.markupPct}%</span></td>
              <td className="p-3 text-right"><span className={`font-semibold ${p.score>=80?'text-emerald-400':p.score>=50?'text-amber-400':'text-red-400'}`}>{p.score}</span></td>
              <td className="p-3 text-center text-[9px] text-cyan-400">{p.multiplier}x</td>
              <td className="p-3 text-center text-[9px]">{p.comps[0]?.name}<br/><span className="text-zinc-300">${p.comps[0]?.price.toFixed(2)||'—'}</span></td>
              <td className="p-3 text-center text-[9px]">{p.comps[1]?.name}<br/><span className="text-zinc-300">${p.comps[1]?.price.toFixed(2)||'—'}</span></td>
              <td className="p-3 text-center text-[9px]">{p.comps[2]?.name}<br/><span className="text-zinc-300">{p.comps[2]?.price ? `$${p.comps[2].price.toFixed(2)}` : '—'}</span></td>
            </tr>))}</tbody></table></div>
          </div>)}

          {/* Shopify sync bar */}
          <div className="gl rounded-2xl px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs">
              <span className="text-zinc-400 font-semibold uppercase tracking-wider">🛒 Shopify Sync</span>
              <span className="text-emerald-400 font-semibold">{inShop} active</span>
              <span className="text-zinc-500">·</span>
              <span className="text-amber-400">{products.filter(p=>p.shopStatus==='pushing').length} pushing</span>
            </div>
            <div className="flex gap-2">
              <button onClick={pushSel} className="px-4 py-2 rounded-lg text-xs font-semibold text-white" style={{background:'linear-gradient(135deg,#22c55e,#16a34a)'}}>↑ Push All</button>
              <button className="px-4 py-2 rounded-lg text-xs font-semibold gl text-cyan-400 border border-cyan-500/30">↓ Pull from Shopify</button>
            </div>
          </div>
        </div>)}

        {/* ══════ AUTO SOURCING ══════ */}
        {tab === 'auto' && (<div className="space-y-4">
          <div className="gl rounded-2xl p-5">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold text-white">⚡ Automated Product Discovery</h3>
              <button onClick={()=>setAutoOn(!autoOn)} className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${autoOn?'text-white':'gl text-zinc-400'}`} style={autoOn?{background:'linear-gradient(135deg,#22c55e,#16a34a)'}:{}}>{autoOn?'✅ Running':'⏸️ Paused'}</button>
            </div>
            <p className="text-xs text-zinc-500 mb-4">AI discovers products throughout the day (6AM–11PM) using Keepa batch → local filter → Rainforest on survivors only. Products matching criteria auto-push to Shopify with qty={DC.defaultQty}.</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              <div><label className="text-[8px] text-zinc-500 uppercase tracking-wider block mb-1">CHECK INTERVAL</label>
                <select value={autoInt} onChange={e=>setAutoInt(Number(e.target.value))} className="w-full px-3 py-2.5 bg-[#0c0c18] border border-zinc-800 rounded-lg text-sm text-white"><option value={15}>Every 15 min</option><option value={30}>Every 30 min</option><option value={60}>Every hour</option><option value={120}>Every 2 hours</option></select></div>
              <div><label className="text-[8px] text-zinc-500 uppercase tracking-wider block mb-1">MAX PER DAY</label>
                <input type="number" value={autoMax} onChange={e=>setAutoMax(Number(e.target.value))} className="w-full px-3 py-2.5 bg-[#0c0c18] border border-zinc-800 rounded-lg text-sm text-white" /></div>
              <div className="bg-[#0c0c18] rounded-lg p-3 border border-zinc-800 text-center"><p className="text-xl font-bold text-cyan-400">{autoToday}</p><p className="text-[9px] text-zinc-500">Sourced Today</p></div>
              <div className="bg-[#0c0c18] rounded-lg p-3 border border-zinc-800 text-center"><p className="text-xl font-bold text-zinc-400">{autoLast?new Date(autoLast).toLocaleTimeString():'Never'}</p><p className="text-[9px] text-zinc-500">Last Run</p></div>
            </div>
            {/* Schedule visual */}
            <div className="bg-[#0c0c18] rounded-xl p-4 border border-zinc-800/50">
              <p className="text-xs font-semibold mb-3 text-white">📅 Discovery Schedule — 6AM to 11PM</p>
              <div className="grid grid-cols-6 lg:grid-cols-12 gap-1">{Array.from({length:24},(_,h)=>{const on=autoOn&&h>=6&&h<=23; return <div key={h} className={`rounded-lg p-1.5 text-center text-[8px] ${on?'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400':'bg-zinc-900 border border-zinc-800 text-zinc-600'}`}><p className="font-bold">{h}:00</p><p>{on?'✓':'—'}</p></div>;})}</div>
              <p className="text-[9px] text-zinc-500 mt-2">Category rotation: each hour searches next category from {DC.cats.length} targets · Keepa batch (cheap) → filter (free) → Rainforest survivors only</p>
            </div>
          </div>
          {/* API Keys */}
          <div className="gl rounded-2xl p-5">
            <h4 className="text-sm font-semibold text-white mb-3">🔑 API Keys</h4>
            <div className="space-y-2">{[{k:'RAINFOREST_API_KEY',l:'Rainforest API',d:'Competitor prices, availability, deep product data'},{k:'KEEPA_API_KEY',l:'Keepa API',d:'Batch product data, BSR history, price trends (100 ASINs/request)'},{k:'SHOPIFY_ACCESS_TOKEN',l:'Shopify Admin API',d:'Product push with qty=50, sale_price, compare_at, cost, metafields'}].map((a,i)=>(
              <div key={i} className="flex items-center gap-3 p-3 bg-[#0c0c18] rounded-lg border border-zinc-800"><code className="text-[10px] text-cyan-400 w-48" style={{fontFamily:'JetBrains Mono,monospace'}}>{a.k}</code><div className="flex-1"><p className="text-xs text-white">{a.l}</p><p className="text-[9px] text-zinc-500">{a.d}</p></div><span className="text-[8px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">✅ Set</span></div>
            ))}</div>
          </div>
        </div>)}

        {/* ══════ PRICING LOGIC ══════ */}
        {tab === 'pricing' && (<div className="space-y-4">
          <div className="gl rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">💰 Pricing Rules Engine</h3>
              <button onClick={()=>{setProducts(prev=>prev.map(p=>{const r=calcPrice(p.amazonPrice,crit.maxRet);return{...p,salePrice:r.sp,dollarProfit:r.dp,markupPct:r.mp,multiplier:r.mult};}));}} className="px-4 py-2 rounded-xl text-xs font-semibold text-white" style={{background:'linear-gradient(135deg,#f59e0b,#d97706)'}}>🔄 Recalculate All</button>
            </div>
            <p className="text-xs text-zinc-500 mb-4">From the Product Discovery Engine doc — every product priced using tiered multipliers with 80% minimum markup floor.</p>
            {/* Tier cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">{DC.tiers.map((t,i)=>(<div key={i} className="bg-[#0c0c18] rounded-xl p-4 border border-zinc-800 text-center"><p className="text-[10px] text-zinc-500 uppercase">Amazon Cost</p><p className="text-lg font-bold text-white">{t.label}</p><p className="text-3xl font-bold text-cyan-400 my-2" style={{fontFamily:'JetBrains Mono,monospace'}}>{t.mult}x</p><p className="text-[10px] text-zinc-500">= {Math.round((t.mult-1)*100)}% markup</p></div>))}</div>
            {/* Rules list */}
            <div className="space-y-2">{[
              {n:'1. Tiered Multiplier',d:'Apply multiplier based on Amazon cost tier (2.50x/2.00x/1.80x)',on:true,v:'See tiers above'},
              {n:'2. Minimum 80% Markup',d:'Reject any product where markup falls below 80%',on:true,v:'80% floor'},
              {n:'3. Minimum $4 Profit',d:'Reject if dollar profit is less than $4.00 (not worth listing)',on:true,v:'$4.00 min'},
              {n:'4. Retail Cap $40',d:'Sale price cannot exceed $40 (consistent with online deal positioning)',on:true,v:`$${crit.maxRet} cap`},
              {n:'5. Round to .99',d:'Round sale price down to nearest .99 for psychology pricing',on:true,v:'.99'},
              {n:'6. Compare-at = Highest Competitor',d:'Set compare_at_price to the highest competitor price (creates strike-through)',on:true,v:'Max comp'},
              {n:'7. Cost = Amazon Price',d:'Store Amazon price as cost_per_item in Shopify for margin tracking',on:true,v:'Auto'},
            ].map((r,i)=>(<div key={i} className="flex items-center gap-4 p-4 bg-[#0c0c18] rounded-xl border border-cyan-500/10"><span className="text-sm font-bold text-zinc-500 w-6">#{i+1}</span><div className={`w-10 h-5 rounded-full relative flex-shrink-0 ${r.on?'bg-cyan-500':'bg-zinc-700'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 ${r.on?'left-[22px]':'left-0.5'}`}></div></div><div className="flex-1"><p className="text-sm font-semibold text-white">{r.n}</p><p className="text-[10px] text-zinc-500">{r.d}</p></div><span className="text-xs px-3 py-1.5 rounded-lg gl text-cyan-400" style={{fontFamily:'JetBrains Mono,monospace'}}>{r.v}</span></div>))}</div>
            {/* Price flow */}
            <div className="mt-4 p-4 bg-[#0c0c18] rounded-xl border border-zinc-800/50">
              <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-2">SHOPIFY PUSH FORMAT</p>
              <div className="flex items-center gap-2 text-[10px] flex-wrap">{['Cost (Amazon $)','→','Apply tier multiplier','→','Check 80% floor','→','Check $4 profit','→','Check $40 cap','→','Round .99','→','sale_price','→','compare_at = max competitor','→','qty = 50','→','Push to Shopify'].map((s,i)=>s==='→'?<span key={i} className="text-zinc-600">→</span>:<span key={i} className="px-2 py-1 rounded bg-zinc-800 text-zinc-300">{s}</span>)}</div>
            </div>
          </div>
        </div>)}

        {/* ══════ BULK IMPORT ══════ */}
        {tab === 'bulk' && (<div className="space-y-4">
          <div className="gl rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-2">📦 Bulk Spreadsheet Import</h3>
            <p className="text-xs text-zinc-500 mb-4">Upload CSV/XLSX in either format. The engine auto-detects and routes accordingly.</p>
            {/* Format cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
              <div className="bg-[#0c0c18] rounded-xl p-4 border border-cyan-500/20">
                <p className="text-xs font-bold text-cyan-400 mb-1">Format A: ASIN-Only</p>
                <p className="text-[9px] text-zinc-500 mb-2">2 columns: Amazon URL + ASIN. Engine does full enrichment.</p>
                <div className="flex gap-1 flex-wrap">{['Amazon URL *','ASIN *'].map((c,i)=><span key={i} className="text-[8px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400">{c}</span>)}</div>
                <p className="text-[8px] text-zinc-600 mt-2">Route: Parse ASINs → Keepa batch → hard filter → score → Rainforest survivors → push</p>
              </div>
              <div className="bg-[#0c0c18] rounded-xl p-4 border border-violet-500/20">
                <p className="text-xs font-bold text-violet-400 mb-1">Format B: Shopify Export</p>
                <p className="text-[9px] text-zinc-500 mb-2">166 columns: full product data. Engine price-checks + fills gaps.</p>
                <div className="flex gap-1 flex-wrap">{['Title','SKU (ASIN)','Price','Compare At','Cost','Competitor Prices','Supplier URL'].map((c,i)=><span key={i} className="text-[8px] px-2 py-0.5 rounded bg-violet-500/10 text-violet-400">{c}</span>)}</div>
                <p className="text-[8px] text-zinc-600 mt-2">Route: Parse unique products → Keepa current price → fill cost → apply rules → flag OOS → update</p>
              </div>
            </div>
            {/* Upload zone */}
            <div className="border-2 border-dashed border-zinc-700 rounded-2xl p-10 text-center hover:border-cyan-500/50 transition-colors cursor-pointer" onClick={()=>fref.current?.click()}>
              <input type="file" ref={fref} onChange={handleBulk} accept=".csv,.xlsx,.xls,.tsv" className="hidden" />
              <p className="text-3xl mb-2">📤</p>
              <p className="text-sm font-semibold text-zinc-300">Drop spreadsheet or click to browse</p>
              <p className="text-[10px] text-zinc-500 mt-1">CSV, XLSX, TSV · Up to 100K rows · Auto-detects format</p>
            </div>
            {/* Pipeline */}
            <div className="mt-4 bg-[#0c0c18] rounded-xl p-4 border border-zinc-800/50">
              <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-2">PROCESSING PIPELINE</p>
              <div className="flex items-center gap-1.5 text-[9px] flex-wrap">{['Detect format','→','Parse rows','→','Extract ASINs','→','Keepa batch (100/req)','→','Hard filter (FREE)','→','Score 50+','→','Rainforest (survivors)','→','Apply pricing rules','→','Flag OOS (auto-remove)','→','Results'].map((s,i)=>s==='→'?<span key={i} className="text-zinc-600">→</span>:<span key={i} className="px-2 py-1 rounded bg-zinc-800 text-zinc-300">{s}</span>)}</div>
            </div>
          </div>
          {/* Active jobs */}
          {jobs.length > 0 && (<div className="gl rounded-2xl p-5">
            <h4 className="text-sm font-semibold text-white mb-3">Import Jobs</h4>
            <div className="space-y-3">{jobs.map(j=>(<div key={j.id} className="bg-[#0c0c18] rounded-xl p-4 border border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <div><p className="text-sm font-semibold text-white">{j.file}</p><p className="text-[9px] text-zinc-500">{j.fmt==='asin'?'ASIN-Only Format':'Shopify Export Format'} · {j.unique.toLocaleString()} unique products</p></div>
                <span className={`text-[9px] px-2 py-0.5 rounded-full ${j.status==='done'?'bg-emerald-500/15 text-emerald-400':j.status==='error'?'bg-red-500/15 text-red-400':'bg-cyan-500/15 text-cyan-400'}`}>{j.status}</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2.5 mb-2"><div className="h-2.5 rounded-full transition-all" style={{width:j.unique>0?`${(j.done/j.unique)*100}%`:'0%',background:'linear-gradient(90deg,#06b6d4,#8b5cf6)'}}></div></div>
              <p className="text-[10px] text-zinc-400 mb-1">{j.stage}</p>
              {j.status==='done' && <div className="flex gap-4 text-[10px]"><span className="text-emerald-400">✅ {j.pass.toLocaleString()} passed</span><span className="text-red-400">✗ {j.fail.toLocaleString()} failed filters</span><span className="text-amber-400">⚠️ {j.flag.toLocaleString()} flagged</span></div>}
            </div>))}</div>
          </div>)}
        </div>)}

        {/* ══════ PRODUCTS ══════ */}
        {tab === 'products' && (<div className="space-y-4">
          <div className="gl rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search products or ASIN..." className="flex-1 min-w-[200px] px-4 py-2 bg-[#0c0c18] border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none" />
            <div className="flex gap-1">{[{k:'all',l:'All'},{k:'active',l:'Active'},{k:'flagged',l:'Flagged'},{k:'oos',l:'OOS'}].map(f=><button key={f.k} onClick={()=>setFilt(f.k)} className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${filt===f.k?'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30':'gl text-zinc-400'}`}>{f.l}</button>)}</div>
            <button onClick={()=>{setPcheck(true);setTimeout(()=>{setProducts(p=>p.map(x=>({...x,lastCheck:new Date().toISOString()})));setPcheck(false);},3000);}} disabled={pcheck} className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{background:'linear-gradient(135deg,#f59e0b,#d97706)'}}>{pcheck?'⏳ Checking...':'🔄 Check Prices'}</button>
            <button onClick={pushSel} className="px-4 py-2 rounded-lg text-xs font-semibold text-white" style={{background:'linear-gradient(135deg,#22c55e,#16a34a)'}}>↑ Push Selected</button>
          </div>
          <div className="gl rounded-2xl overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-zinc-800/50 text-zinc-500 uppercase text-[8px]">
            <th className="p-3"><input type="checkbox" checked={selAll} onChange={()=>{const n=!selAll;setSelAll(n);setProducts(p=>p.map(x=>({...x,sel:n})));}} className="accent-cyan-500" /></th>
            <th className="p-3 text-left">Product</th><th className="p-3 text-right">Cost</th><th className="p-3 text-right">Sale$</th><th className="p-3 text-right">Compare</th><th className="p-3 text-right">Profit</th><th className="p-3 text-right">Markup</th><th className="p-3 text-center">Comp1</th><th className="p-3 text-center">Comp2</th><th className="p-3 text-center">Comp3</th><th className="p-3 text-center">Stock</th><th className="p-3 text-center">Shopify</th><th className="p-3 text-center">Qty</th><th className="p-3 text-center">Act</th>
          </tr></thead><tbody>
            {dsp.length === 0 ? (<tr><td colSpan={14} className="p-8 text-center text-zinc-500">No products yet. Use Manual Sourcing, Auto Sourcing, or Bulk Import to add products.</td></tr>) : dsp.map(p=>(
              <tr key={p.id} className={`border-b border-zinc-800/30 hover:bg-white/[0.02] ${p.sel?'bg-cyan-500/5':''} ${p.avail==='oos'||p.avail==='unavail'?'opacity-50':''}`}>
                <td className="p-3"><input type="checkbox" checked={p.sel} onChange={()=>setProducts(prev=>prev.map(x=>x.id===p.id?{...x,sel:!x.sel}:x))} className="accent-cyan-500" /></td>
                <td className="p-3 max-w-[200px]"><p className="text-white font-medium truncate">{p.title}</p><p className="text-[9px] text-zinc-500">{p.asin} · ⭐{p.rating} ({p.reviews.toLocaleString()}) · BSR #{p.bsr.toLocaleString()}</p></td>
                <td className="p-3 text-right text-zinc-400" style={{fontFamily:'JetBrains Mono,monospace'}}>${p.costPrice.toFixed(2)}</td>
                <td className="p-3 text-right text-emerald-400 font-semibold" style={{fontFamily:'JetBrains Mono,monospace'}}>${p.salePrice.toFixed(2)}</td>
                <td className="p-3 text-right text-zinc-500 line-through" style={{fontFamily:'JetBrains Mono,monospace'}}>${p.compareAtPrice.toFixed(2)}</td>
                <td className="p-3 text-right text-emerald-400" style={{fontFamily:'JetBrains Mono,monospace'}}>${p.dollarProfit.toFixed(2)}</td>
                <td className="p-3 text-right"><span className={`font-semibold ${p.markupPct>=100?'text-emerald-400':p.markupPct>=80?'text-amber-400':'text-red-400'}`}>{p.markupPct}%</span></td>
                <td className="p-3 text-center text-[9px]">{p.comps[0]?.name}<br/><span className="text-zinc-300">${p.comps[0]?.price.toFixed(2)}</span></td>
                <td className="p-3 text-center text-[9px]">{p.comps[1]?.name}<br/><span className="text-zinc-300">${p.comps[1]?.price.toFixed(2)}</span></td>
                <td className="p-3 text-center text-[9px]">{p.comps[2]?.name}<br/><span className="text-zinc-300">{p.comps[2]?.price?`$${p.comps[2].price.toFixed(2)}`:'—'}</span></td>
                <td className="p-3 text-center">{ab(p.avail)}</td>
                <td className="p-3 text-center">{sb(p.shopStatus)}</td>
                <td className="p-3 text-center text-zinc-400" style={{fontFamily:'JetBrains Mono,monospace'}}>{p.qty}</td>
                <td className="p-3 text-center"><div className="flex gap-1 justify-center"><button className="text-[8px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded hover:text-white">🔄</button><button className="text-[8px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded hover:bg-emerald-500/20">↑</button></div></td>
              </tr>
            ))}</tbody></table></div></div>
        </div>)}

        {/* ══════ HISTORY ══════ */}
        {tab === 'history' && (<div className="gl rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white mb-4">📜 Sourcing History</h3>
          <div className="space-y-2">{[
            {t:'Now',a:'Page loaded — ready for sourcing',ty:'system'},
            {t:'—',a:'Weekly price check: Sundays 3AM on all listed products',ty:'schedule'},
            {t:'—',a:'Auto-source: runs every 60min (6AM-11PM) when enabled',ty:'schedule'},
            {t:'—',a:'Out of stock products auto-removed from Shopify',ty:'rule'},
            {t:'—',a:'Below 80% markup: 48hr grace → auto-disable or reprice',ty:'rule'},
          ].map((h,i)=>(<div key={i} className="flex items-center gap-3 p-3 bg-[#0c0c18] rounded-lg border border-zinc-800">
            <span className="text-[10px] text-zinc-500 w-12" style={{fontFamily:'JetBrains Mono,monospace'}}>{h.t}</span>
            <span className={`text-[8px] px-2 py-0.5 rounded-full uppercase font-bold ${h.ty==='system'?'bg-cyan-500/15 text-cyan-400':h.ty==='schedule'?'bg-violet-500/15 text-violet-400':'bg-amber-500/15 text-amber-400'}`}>{h.ty}</span>
            <span className="text-xs text-zinc-300">{h.a}</span>
          </div>))}</div>
        </div>)}

      </div>
    </div>
  );
}
