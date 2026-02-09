'use client';
// app/products/page.tsx — DROPSHIP PRO Products Dashboard
// Manual & Auto Sourcing · Filtering · Bulk Actions · Shopify Sync
import { useState, useEffect, useCallback, useMemo } from 'react';

// ── TYPES ──
interface ProductItem {
  id: string; asin?: string|null; title: string; description?: string|null;
  image_url?: string|null; main_image?: string|null;
  cost_price: number|null; amazon_price?: number|null; retail_price: number|null;
  current_price?: number|null; compare_at_price?: number|null;
  profit_amount?: number|null; profit_percent?: number|null; profit_margin?: number|null;
  profit_status?: string; rating?: number|null; review_count?: number|null;
  is_prime?: boolean; category?: string|null; brand?: string|null; vendor?: string|null;
  status: string; source?: string; source_product_id?: string|null;
  shopify_product_id?: string|null; shopify_sync_status?: string;
  created_at: string; updated_at: string; last_price_check?: string|null; tags?: string[];
}
interface SourcingFilters {
  min_price: number; max_price: number; min_margin: number; min_reviews: number;
  min_rating: number; max_bsr: number; products_to_source: number;
  prime_only: boolean; excluded_brands: string;
}
interface AutoConfig extends SourcingFilters { enabled: boolean; interval_hours: number; last_run?: string|null; }
type SortField = 'created_at'|'cost_price'|'retail_price'|'profit_percent'|'title';
type SortDir = 'asc'|'desc';
type ViewTab = 'all'|'manual'|'auto'|'high_profit'|'low_profit'|'no_profit';

const DF: SourcingFilters = { min_price:3, max_price:25, min_margin:30, min_reviews:500, min_rating:3.5, max_bsr:100000, products_to_source:1000, prime_only:true, excluded_brands:'Apple, Nike, Samsung, Sony, Microsoft' };
const PCOUNTS = [100,500,1000,5000,10000];

// ── UTILS ──
const fmt$ = (v:number|null|undefined) => v==null?'—':`$${v.toFixed(2)}`;
const fmtP = (v:number|null|undefined) => v==null?'—':`${v.toFixed(1)}%`;
const fmtN = (v:number|null|undefined) => v==null?'—':v.toLocaleString();
const cn = (...c:(string|false|null|undefined)[]) => c.filter(Boolean).join(' ');
const gm = (p:ProductItem) => p.profit_percent ?? p.profit_margin ?? null;
const pt = (m:number|null|undefined):'high'|'low'|'none' => { if(m==null) return 'none'; if(m>=30) return 'high'; if(m>0) return 'low'; return 'none'; };
const ta = (d:string|null|undefined) => { if(!d) return 'Never'; const ms=Date.now()-new Date(d).getTime(); const m=Math.floor(ms/60000); if(m<60) return `${m}m ago`; const h=Math.floor(m/60); if(h<24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`; };
const pI = (p:ProductItem) => p.image_url||p.main_image||'';

// ── ICONS ──
const Ic = {
  Search:()=><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>,
  Refresh:({spin}:{spin?:boolean})=><svg className={cn('w-4 h-4',spin&&'animate-spin')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>,
  Plus:()=><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>,
  X:()=><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>,
  Up:()=><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7"/></svg>,
  Dn:()=><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>,
  Trash:()=><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>,
  Shop:()=><svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M15.34 3.18c-.04-.02-.08-.04-.13-.04s-.58.04-.58.04-.45-.45-.5-.5c-.04-.04-.13-.04-.17-.02l-.7.21c-.17-.5-.37-.87-.75-.87h-.13c-.13-.21-.3-.34-.46-.34-1.1 0-1.61 1.37-1.78 2.07l-.81.25c-.25.08-.27.09-.29.33l-.69 5.28L12.31 10.5l3.37-.73s-.3-6.55-.34-6.59z"/></svg>,
  Star:()=><svg className="w-3.5 h-3.5 text-amber-400" viewBox="0 0 20 20" fill="currentColor"><path d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.07 3.29a1 1 0 00.95.69h3.46c.97 0 1.37 1.24.59 1.81l-2.8 2.03a1 1 0 00-.36 1.12l1.07 3.29c.3.92-.76 1.69-1.54 1.12l-2.8-2.03a1 1 0 00-1.18 0l-2.8 2.03c-.78.57-1.84-.2-1.54-1.12l1.07-3.29a1 1 0 00-.36-1.12L2.98 8.72c-.78-.57-.38-1.81.59-1.81h3.46a1 1 0 00.95-.69l1.07-3.29z"/></svg>,
  Clock:()=><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  Ext:()=><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>,
  Bolt:()=><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>,
  Check:()=><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>,
  Box:()=><svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>,
};

// ── UI PIECES ──
function Badge({children,v='default'}:{children:React.ReactNode;v?:'default'|'success'|'warning'|'danger'|'info'|'purple'}){
  const s:Record<string,string>={default:'bg-gray-100 text-gray-700',success:'bg-emerald-50 text-emerald-700',warning:'bg-amber-50 text-amber-700',danger:'bg-red-50 text-red-700',info:'bg-blue-50 text-blue-700',purple:'bg-violet-50 text-violet-700'};
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold',s[v])}>{children}</span>;
}
function Stat({label,value,accent}:{label:string;value:string|number;accent:string}){
  return <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow"><div className={cn('w-8 h-1 rounded-full mb-3',accent)}/><p className="text-2xl font-bold text-gray-900 tracking-tight">{typeof value==='number'?value.toLocaleString():value}</p><p className="text-xs font-medium text-gray-500 mt-0.5">{label}</p></div>;
}


// ══ MANUAL SOURCING MODAL ══
function ManualSourcingModal({open,onClose,onDone}:{open:boolean;onClose:()=>void;onDone:()=>void}){
  const [f,setF]=useState<SourcingFilters>({...DF});
  const [phase,setPhase]=useState<'config'|'loading'|'preview'|'importing'|'done'>('config');
  const [prev,setPrev]=useState<any[]>([]);
  const [sel,setSel]=useState<Set<string>>(new Set());
  const [prog,setProg]=useState('');
  const [err,setErr]=useState<string|null>(null);
  const [res,setRes]=useState<any>(null);
  useEffect(()=>{if(open){setPhase('config');setErr(null);setPrev([]);setSel(new Set());setRes(null);}},[open]);
  const cost=(f.products_to_source*0.0001).toFixed(2);

  const doPreview=async()=>{
    setPhase('loading');setErr(null);setProg('Searching Amazon via Rainforest API...');
    try{
      const r=await fetch('/api/cron/discovery/run',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({filters:{min_amazon_price:f.min_price,max_amazon_price:f.max_price,min_profit_margin:f.min_margin,min_reviews:f.min_reviews,min_rating:f.min_rating,max_bsr:f.max_bsr,require_prime:f.prime_only,excluded_brands:f.excluded_brands.split(',').map(b=>b.trim()).filter(Boolean)},maxProducts:Math.min(f.products_to_source,50),source:'manual',dryRun:true})});
      const j=await r.json();
      if(!j.success) throw new Error(j.error||'Preview failed');
      const items=j.data?.products||j.data?.preview||[];
      setPrev(items);setSel(new Set(items.map((p:any)=>p.asin)));setPhase('preview');
    }catch(e:any){setErr(e.message);setPhase('config');}
  };

  const doImport=async()=>{
    setPhase('importing');setErr(null);setProg(`Importing ${sel.size} products...`);
    try{
      const r=await fetch('/api/cron/discovery/run',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({filters:{min_amazon_price:f.min_price,max_amazon_price:f.max_price,min_profit_margin:f.min_margin,min_reviews:f.min_reviews,min_rating:f.min_rating,max_bsr:f.max_bsr,require_prime:f.prime_only,excluded_brands:f.excluded_brands.split(',').map(b=>b.trim()).filter(Boolean)},maxProducts:sel.size,source:'manual',dryRun:false})});
      const j=await r.json();
      if(!j.success) throw new Error(j.error||'Import failed');
      setRes(j.data);setPhase('done');setTimeout(()=>{onDone();onClose();},2000);
    }catch(e:any){setErr(e.message);setPhase('preview');}
  };

  const tAll=()=>setSel(s=>s.size===prev.length?new Set():new Set(prev.map((p:any)=>p.asin)));
  const tOne=(a:string)=>setSel(s=>{const n=new Set(s);n.has(a)?n.delete(a):n.add(a);return n;});
  if(!open) return null;

  return(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center"><Ic.Search/></div>
            <div><h2 className="text-lg font-semibold text-gray-900">Manual Product Sourcing</h2><p className="text-xs text-gray-500">Source products from Amazon matching your criteria</p></div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/60 rounded-lg"><Ic.X/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {err&&<div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex justify-between"><span>{err}</span><button onClick={()=>setErr(null)}><Ic.X/></button></div>}

          {phase==='config'&&(
            <div className="space-y-5">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3"><Ic.Bolt/><div><p className="font-medium text-blue-900">Estimated Cost for {f.products_to_source.toLocaleString()} Products</p><p className="text-xs text-blue-600">~{f.products_to_source} Keepa tokens · ${cost}</p></div></div>
                <span className="text-2xl font-bold text-blue-600">${cost}</span>
              </div>
              <p className="text-sm text-gray-500 bg-gray-50 border rounded-lg px-4 py-2.5">ℹ️ Click <strong>&quot;Preview Products&quot;</strong> to see matching products before importing.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {([['Min Price ($)','min_price'],['Max Price ($)','max_price'],['Min Margin (%)','min_margin'],['Min Reviews','min_reviews'],['Min Rating','min_rating'],['Max BSR','max_bsr']] as [string,keyof SourcingFilters][]).map(([l,k])=>(
                  <div key={k}><label className="block text-xs font-medium text-gray-700 mb-1">{l}</label><input type="number" step={k==='min_rating'?'0.1':undefined} value={f[k] as number} onChange={e=>setF(x=>({...x,[k]:+e.target.value}))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"/></div>
                ))}
                <div><label className="block text-xs font-medium text-gray-700 mb-1">Products to Source</label><select value={f.products_to_source} onChange={e=>setF(x=>({...x,products_to_source:+e.target.value}))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none">{PCOUNTS.map(n=><option key={n} value={n}>{n.toLocaleString()}</option>)}</select></div>
                <div className="flex items-end pb-1"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={f.prime_only} onChange={e=>setF(x=>({...x,prime_only:e.target.checked}))} className="w-4 h-4 rounded border-gray-300 text-blue-600"/><span className="text-sm font-medium text-gray-700">Prime Only</span></label></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Excluded Brands (comma-separated)</label><input value={f.excluded_brands} onChange={e=>setF(x=>({...x,excluded_brands:e.target.value}))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none"/></div>
            </div>
          )}

          {(phase==='loading'||phase==='importing')&&(
            <div className="flex flex-col items-center py-16 gap-4">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/>
              <p className="text-lg font-medium text-gray-900">{phase==='loading'?'Searching Amazon...':'Importing Products...'}</p>
              <p className="text-sm text-gray-500">{prog}</p>
            </div>
          )}

          {phase==='preview'&&(
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-900">Found {prev.length} products · {sel.size} selected</p>
                <div className="flex gap-2"><button onClick={tAll} className="px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-gray-50">{sel.size===prev.length?'Deselect All':'Select All'}</button><button onClick={()=>setPhase('config')} className="px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-gray-50">← Filters</button></div>
              </div>
              <div className="border rounded-xl overflow-hidden max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10"><tr className="text-left text-xs text-gray-500 uppercase"><th className="px-3 py-2 w-8"><input type="checkbox" checked={sel.size===prev.length&&prev.length>0} onChange={tAll} className="rounded"/></th><th className="px-3 py-2">Product</th><th className="px-3 py-2 text-right">Buy Price</th><th className="px-3 py-2 text-right">Sell Price</th><th className="px-3 py-2 text-right">Margin</th><th className="px-3 py-2 text-center">Rating</th><th className="px-3 py-2 text-center">Prime</th></tr></thead>
                  <tbody>
                    {prev.map((p:any)=>{const mg=p.profitPercent??p.potentialMargin??0;return(
                      <tr key={p.asin} className={cn('border-t hover:bg-blue-50/30',!sel.has(p.asin)&&'opacity-40')}>
                        <td className="px-3 py-2"><input type="checkbox" checked={sel.has(p.asin)} onChange={()=>tOne(p.asin)} className="rounded"/></td>
                        <td className="px-3 py-2"><div className="flex items-center gap-2">{(p.imageUrl||p.image_url)&&<img src={p.imageUrl||p.image_url} alt="" className="w-8 h-8 rounded object-cover bg-gray-100"/>}<div className="min-w-0"><p className="truncate font-medium text-gray-900 max-w-[220px]">{p.title}</p><p className="text-[11px] text-gray-500">{p.asin} · {p.category}</p></div></div></td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{fmt$(p.amazonPrice??p.price)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{fmt$(p.salesPrice??p.potentialRetailPrice)}</td>
                        <td className="px-3 py-2 text-right"><Badge v={mg>=30?'success':mg>0?'warning':'danger'}>{fmtP(mg)}</Badge></td>
                        <td className="px-3 py-2 text-center"><span className="inline-flex items-center gap-0.5 text-xs"><Ic.Star/>{(p.rating??0).toFixed(1)}</span></td>
                        <td className="px-3 py-2 text-center">{p.isPrime||p.is_prime?<Badge v="info">Prime</Badge>:<span className="text-gray-400">—</span>}</td>
                      </tr>);})}
                    {prev.length===0&&<tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">No products matched your criteria.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {phase==='done'&&res&&(
            <div className="flex flex-col items-center py-12 gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><Ic.Check/></div>
              <p className="text-lg font-semibold text-gray-900">Import Complete!</p>
              <p className="text-sm text-gray-600">Found {res.found??0} · Imported {res.imported??0} · Synced {res.synced??0}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          <button onClick={()=>setF({...DF})} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"><Ic.Refresh spin={false}/> Reset</button>
          {phase==='config'&&<button onClick={doPreview} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 flex items-center gap-2"><Ic.Search/> Preview Products</button>}
          {phase==='preview'&&<button onClick={doImport} disabled={sel.size===0} className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"><Ic.Plus/> Import {sel.size} Products</button>}
        </div>
      </div>
    </div>
  );
}

// ══ AUTO SOURCING MODAL ══
function AutoSourcingModal({open,onClose,config,onSave}:{open:boolean;onClose:()=>void;config:AutoConfig;onSave:(c:AutoConfig)=>void}){
  const [l,setL]=useState<AutoConfig>({...config});
  useEffect(()=>{if(open)setL({...config});},[open,config]);
  if(!open) return null;
  const ivs=[{t:'Every 6 hours',v:6},{t:'Every 12 hours',v:12},{t:'Daily (24h)',v:24},{t:'Every 48 hours',v:48},{t:'Every 72 hours',v:72},{t:'Weekly',v:168}];
  return(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-violet-50 to-purple-50">
          <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center"><Ic.Clock/></div><div><h2 className="text-lg font-semibold text-gray-900">Auto Sourcing Configuration</h2><p className="text-xs text-gray-500">Auto-discover products at set intervals (stored separately)</p></div></div>
          <button onClick={onClose} className="p-2 hover:bg-white/60 rounded-lg"><Ic.X/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="flex items-center justify-between p-4 rounded-xl bg-violet-50 border border-violet-200">
            <div><p className="font-medium text-violet-900">Enable Auto Sourcing</p><p className="text-xs text-violet-600">Products stored in &quot;Auto&quot; tab, separate from manual</p></div>
            <button onClick={()=>setL(x=>({...x,enabled:!x.enabled}))} className={cn('relative w-12 h-7 rounded-full transition-colors',l.enabled?'bg-violet-600':'bg-gray-300')}><div className={cn('absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform',l.enabled?'translate-x-5':'translate-x-0.5')}/></button>
          </div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Run Interval</label><select value={l.interval_hours} onChange={e=>setL(x=>({...x,interval_hours:+e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-violet-500">{ivs.map(i=><option key={i.v} value={i.v}>{i.t}</option>)}</select></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {([['Min Price ($)','min_price'],['Max Price ($)','max_price'],['Min Margin (%)','min_margin'],['Min Reviews','min_reviews'],['Min Rating','min_rating'],['Max BSR','max_bsr']] as [string,keyof SourcingFilters][]).map(([lb,k])=>(
              <div key={k}><label className="block text-xs font-medium text-gray-700 mb-1">{lb}</label><input type="number" step={k==='min_rating'?'0.1':undefined} value={l[k] as number} onChange={e=>setL(x=>({...x,[k]:+e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-violet-500"/></div>
            ))}
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Products per Run</label><select value={l.products_to_source} onChange={e=>setL(x=>({...x,products_to_source:+e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm outline-none">{PCOUNTS.map(n=><option key={n} value={n}>{n.toLocaleString()}</option>)}</select></div>
            <div className="flex items-end pb-1"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={l.prime_only} onChange={e=>setL(x=>({...x,prime_only:e.target.checked}))} className="w-4 h-4 rounded border-gray-300 text-violet-600"/><span className="text-sm font-medium text-gray-700">Prime Only</span></label></div>
          </div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Excluded Brands</label><input value={l.excluded_brands} onChange={e=>setL(x=>({...x,excluded_brands:e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm outline-none"/></div>
          {config.last_run&&<p className="text-xs text-gray-400">Last run: {ta(config.last_run)}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={()=>{onSave(l);onClose();}} className="px-5 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">Save Configuration</button>
        </div>
      </div>
    </div>
  );
}

// ══ PRODUCT DETAIL MODAL ══
function ProductDetail({product:p,onClose,onSync}:{product:ProductItem|null;onClose:()=>void;onSync:(ids:string[])=>void}){
  if(!p) return null;
  const buy=p.cost_price??p.amazon_price??0, sell=p.retail_price??p.current_price??0;
  const margin=gm(p)??(sell>0?((sell-buy)/sell)*100:0);
  const tier=pt(margin), img=pI(p);
  return(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-start gap-4 p-6 border-b">
          {img?<img src={img} alt="" className="w-24 h-24 rounded-xl object-cover bg-gray-100 flex-shrink-0"/>:<div className="w-24 h-24 rounded-xl bg-gray-100 flex items-center justify-center text-xs text-gray-400 flex-shrink-0">No img</div>}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900 leading-tight">{p.title}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {p.asin&&<a href={`https://amazon.com/dp/${p.asin}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">ASIN: {p.asin} <Ic.Ext/></a>}
              <Badge v={p.status==='active'?'success':'default'}>{p.status}</Badge>
              {p.is_prime&&<Badge v="info">Prime</Badge>}
              {p.source&&<Badge v="purple">{p.source}</Badge>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg flex-shrink-0"><Ic.X/></button>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-xl p-4 text-center"><p className="text-[11px] text-gray-500 mb-1 uppercase">Buy Price</p><p className="text-xl font-bold text-gray-900">{fmt$(buy)}</p></div>
            <div className="bg-gray-50 rounded-xl p-4 text-center"><p className="text-[11px] text-gray-500 mb-1 uppercase">Sell Price</p><p className="text-xl font-bold text-gray-900">{fmt$(sell)}</p></div>
            <div className={cn('rounded-xl p-4 text-center',tier==='high'?'bg-emerald-50':tier==='low'?'bg-amber-50':'bg-red-50')}><p className="text-[11px] text-gray-500 mb-1 uppercase">Margin</p><p className={cn('text-xl font-bold',tier==='high'?'text-emerald-700':tier==='low'?'text-amber-700':'text-red-700')}>{fmtP(margin)}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            {([['Category',p.category||'—'],['Rating',`★ ${p.rating?.toFixed(1)??'—'} (${fmtN(p.review_count)})`],['Compare At',fmt$(p.compare_at_price)],['Price Check',ta(p.last_price_check)],['Created',p.created_at?new Date(p.created_at).toLocaleDateString():'—'],['Shopify',p.shopify_product_id?'✅ Synced':'⬜ Not synced']] as [string,string][]).map(([k,v])=>(
              <div key={k} className="flex justify-between"><span className="text-gray-500">{k}</span><span className="font-medium text-gray-900">{v}</span></div>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            {!p.shopify_product_id&&<button onClick={()=>onSync([p.id])} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 flex items-center gap-2"><Ic.Shop/> Sync to Shopify</button>}
            {p.asin&&<a href={`https://amazon.com/dp/${p.asin}`} target="_blank" rel="noopener noreferrer" className="px-4 py-2 text-sm font-medium text-gray-700 border rounded-lg hover:bg-gray-50 flex items-center gap-2">Amazon <Ic.Ext/></a>}
          </div>
        </div>
      </div>
    </div>
  );
}


// == MAIN PAGE ==
export default function ProductsPage(){
  const [products,setProducts]=useState<ProductItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [tab,setTab]=useState<ViewTab>('all');
  const [sf,setSf]=useState<SortField>('created_at');
  const [sd,setSd]=useState<SortDir>('desc');
  const [search,setSearch]=useState('');
  const [sel,setSel]=useState<Set<string>>(new Set());
  const [pg,setPg]=useState(1);
  const [total,setTotal]=useState(0);
  const PS=25;
  const [showManual,setShowManual]=useState(false);
  const [showAuto,setShowAuto]=useState(false);
  const [detail,setDetail]=useState<ProductItem|null>(null);
  const [syncing,setSyncing]=useState(false);
  const [ac,setAc]=useState<AutoConfig>({...DF,enabled:false,interval_hours:24,last_run:null});
  useEffect(()=>{try{const s=localStorage.getItem('dp_auto_cfg');if(s)setAc(JSON.parse(s));}catch{}},[]);

  const fetchProducts=useCallback(async(p=1)=>{
    setLoading(true);setError(null);
    try{
      const params=new URLSearchParams({action:'list',page:String(p),pageSize:String(PS),sortBy:sf==='cost_price'||sf==='retail_price'?'current_price':sf,sortOrder:sd});
      if(search.trim())params.set('search',search.trim());
      if(tab==='high_profit')params.set('minMargin','30');
      if(tab==='low_profit'){params.set('minMargin','0.01');params.set('maxMargin','29.99');}
      const r=await fetch('/api/products?'+params);
      const j=await r.json();
      if(!j.success)throw new Error(j.error||'Fetch failed');
      const raw=j.data?.products||j.data||[];
      const mapped:ProductItem[]=(Array.isArray(raw)?raw:[]).map((r:any)=>({
        id:r.id,asin:r.asin||r.source_product_id,title:r.title||'Untitled',description:r.description,
        image_url:r.image_url||r.main_image,main_image:r.main_image,
        cost_price:r.cost_price||r.amazon_price,amazon_price:r.amazon_price||r.cost_price,
        retail_price:r.retail_price||r.current_price,current_price:r.current_price,
        compare_at_price:r.compare_at_price,profit_amount:r.profit_amount,
        profit_percent:r.profit_percent||r.profit_margin,profit_margin:r.profit_margin||r.profit_percent,
        profit_status:r.profit_status,rating:r.rating,review_count:r.review_count,is_prime:r.is_prime,
        category:r.category,brand:r.brand,vendor:r.vendor,status:r.status||'active',source:r.source,
        source_product_id:r.source_product_id,shopify_product_id:r.shopify_product_id,
        shopify_sync_status:r.shopify_sync_status,created_at:r.created_at,updated_at:r.updated_at,
        last_price_check:r.last_price_check,tags:r.tags,
      }));
      setProducts(mapped);setTotal(j.data?.total||j.pagination?.total||mapped.length);setPg(p);
    }catch(e:any){setError(e.message);}finally{setLoading(false);}
  },[sf,sd,search,tab]);

  useEffect(()=>{fetchProducts(1);},[fetchProducts]);

  const filtered=useMemo(()=>{
    let list=[...products];
    if(tab==='manual')list=list.filter(p=>p.source==='manual'||!p.source||p.source==='csv_upload'||p.source==='import');
    if(tab==='auto')list=list.filter(p=>p.source==='rainforest'||p.source==='keepa'||p.source==='cron'||p.source==='auto');
    if(tab==='no_profit')list=list.filter(p=>pt(gm(p))==='none');
    if(sf==='cost_price')list.sort((a,b)=>((a.cost_price??0)-(b.cost_price??0))*(sd==='asc'?1:-1));
    if(sf==='retail_price')list.sort((a,b)=>((a.retail_price??0)-(b.retail_price??0))*(sd==='asc'?1:-1));
    if(sf==='profit_percent')list.sort((a,b)=>((gm(a)??0)-(gm(b)??0))*(sd==='asc'?1:-1));
    return list;
  },[products,tab,sf,sd]);

  const stats=useMemo(()=>{
    const hp=products.filter(p=>pt(gm(p))==='high').length;
    const lp=products.filter(p=>pt(gm(p))==='low').length;
    const np=products.filter(p=>pt(gm(p))==='none').length;
    const sy=products.filter(p=>p.shopify_product_id).length;
    const au=products.filter(p=>p.source==='rainforest'||p.source==='keepa'||p.source==='cron'||p.source==='auto').length;
    return{total,hp,lp,np,sy,au};
  },[products,total]);

  const tp=Math.max(1,Math.ceil(total/PS));
  const doSort=(f:SortField)=>{if(sf===f)setSd(d=>d==='asc'?'desc':'asc');else{setSf(f);setSd('desc');}};
  const selAll=()=>setSel(s=>s.size===filtered.length?new Set():new Set(filtered.map(p=>p.id)));
  const selOne=(id:string)=>setSel(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});

  const syncShopify=async(ids?:string[])=>{
    setSyncing(true);
    try{await fetch('/api/products?action=sync-shopify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productIds:ids})});await fetchProducts(pg);}catch{}finally{setSyncing(false);}
  };
  const bulkDel=async()=>{
    if(sel.size===0||!confirm('Delete '+sel.size+' products?'))return;
    try{await fetch('/api/products?bulk=true',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({productIds:[...sel]})});setSel(new Set());await fetchProducts(pg);}catch{}
  };
  const saveAc=(c:AutoConfig)=>{setAc(c);try{localStorage.setItem('dp_auto_cfg',JSON.stringify(c));}catch{}
    fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'upsert',settings:[{category:'discovery',key:'auto_sourcing_config',value:JSON.stringify(c)}]})}).catch(()=>{});
  };

  const SortTh=({field,children,align='left'}:{field:SortField;children:React.ReactNode;align?:string})=>(
    <th className={cn('px-3 py-3 cursor-pointer select-none group','text-'+align)} onClick={()=>doSort(field)}>
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{children}
        <span className={cn('transition-opacity',sf===field?'opacity-100':'opacity-0 group-hover:opacity-30')}>{sf===field&&sd==='asc'?<Ic.Up/>:<Ic.Dn/>}</span>
      </span>
    </th>
  );

  return(
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* HEADER */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="text-2xl font-bold text-gray-900 tracking-tight">Products</h1><p className="text-sm text-gray-500 mt-0.5">Dropship Pro &middot; Manage catalog &amp; sourcing</p></div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={()=>setShowAuto(true)} className="px-4 py-2 text-sm font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 flex items-center gap-2"><Ic.Clock/> Auto Source {ac.enabled&&<span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse"/>}</button>
            <button onClick={()=>setShowManual(true)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2"><Ic.Search/> Manual Source</button>
            <button onClick={()=>syncShopify()} disabled={syncing} className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50 flex items-center gap-2"><Ic.Shop/> {syncing?'Syncing...':'Sync Shopify'}</button>
            <button onClick={()=>fetchProducts(pg)} disabled={loading} className="px-3 py-2 text-gray-600 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50"><Ic.Refresh spin={loading}/></button>
          </div>
        </div>
        {/* STATS */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="Total Products" value={stats.total} accent="bg-slate-500"/>
          <Stat label="High Profit (&ge;30%)" value={stats.hp} accent="bg-emerald-500"/>
          <Stat label="Low Profit (&lt;30%)" value={stats.lp} accent="bg-amber-500"/>
          <Stat label="No Profit" value={stats.np} accent="bg-red-500"/>
          <Stat label="Shopify Synced" value={stats.sy} accent="bg-blue-500"/>
          <Stat label="Auto Sourced" value={stats.au} accent="bg-violet-500"/>
        </div>
        {/* ERROR */}
        {error&&<div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between text-sm text-red-700"><span>{error}</span><button onClick={()=>{setError(null);fetchProducts(1);}} className="font-medium hover:underline">Retry</button></div>}
        {/* LOADING */}
        {loading&&products.length===0&&(
          <div className="space-y-4 animate-pulse"><div className="grid grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="h-20 bg-gray-100 rounded-xl"/>)}</div><div className="bg-white rounded-xl border overflow-hidden"><div className="h-12 bg-gray-50 border-b"/>{Array.from({length:8}).map((_,i)=><div key={i} className="h-14 border-b border-gray-50"/>)}</div></div>
        )}
        {/* EMPTY */}
        {!loading&&!error&&products.length===0&&total===0&&(
          <div className="flex flex-col items-center py-20 bg-white rounded-2xl border">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-50 to-violet-50 flex items-center justify-center mb-6"><Ic.Box/></div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Products Yet</h3>
            <p className="text-gray-500 text-sm mb-8 max-w-md text-center">Source products from Amazon or sync your Shopify catalog to get started.</p>
            <div className="flex gap-3">
              <button onClick={()=>setShowManual(true)} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 flex items-center gap-2"><Ic.Search/> Source Products</button>
              <button onClick={()=>syncShopify()} className="px-5 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg border hover:bg-gray-50 flex items-center gap-2"><Ic.Shop/> Sync Shopify</button>
            </div>
          </div>
        )}
        {/* TABLE */}
        {(products.length>0||total>0)&&(
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b bg-gray-50/50">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex rounded-lg border bg-white overflow-hidden text-xs font-medium">
                  {([['all','All'],['manual','Manual'],['auto','Auto'],['high_profit','\u{1F7E2} High'],['low_profit','\u{1F7E1} Low'],['no_profit','\u{1F534} None']] as [ViewTab,string][]).map(([k,lb])=>(
                    <button key={k} onClick={()=>{setTab(k);setPg(1);}} className={cn('px-3 py-1.5 border-r last:border-r-0 transition-colors',tab===k?'bg-blue-50 text-blue-700 font-semibold':'text-gray-600 hover:bg-gray-50')}>{lb}</button>
                  ))}
                </div>
                <div className="relative"><div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"><Ic.Search/></div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search products..." className="pl-8 pr-3 py-1.5 text-sm border rounded-lg w-56 focus:ring-2 focus:ring-blue-500 outline-none"/></div>
              </div>
              {sel.size>0&&(
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 font-medium">{sel.size} selected</span>
                  <button onClick={()=>syncShopify([...sel])} disabled={syncing} className="px-3 py-1.5 text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 text-xs font-medium flex items-center gap-1"><Ic.Shop/> Sync</button>
                  <button onClick={bulkDel} className="px-3 py-1.5 text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 text-xs font-medium flex items-center gap-1"><Ic.Trash/> Delete</button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="px-3 py-3 w-10"><input type="checkbox" checked={sel.size===filtered.length&&filtered.length>0} onChange={selAll} className="rounded border-gray-300"/></th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Source</th>
                    <SortTh field="cost_price" align="right">Buy Price</SortTh>
                    <SortTh field="retail_price" align="right">Sell Price</SortTh>
                    <SortTh field="profit_percent" align="right">Margin</SortTh>
                    <th className="px-3 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Rating</th>
                    <th className="px-3 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Prime</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                    <SortTh field="created_at">Added</SortTh>
                    <th className="px-3 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length===0&&<tr><td colSpan={12} className="px-4 py-12 text-center text-gray-500">No products match the current filter.</td></tr>}
                  {filtered.map(p=>{const margin=gm(p);const tier=pt(margin);const img=pI(p);const isSel=sel.has(p.id);return(
                    <tr key={p.id} className={cn('border-t border-gray-100 hover:bg-blue-50/20 transition-colors cursor-pointer',tier==='none'&&'bg-red-50/30',tier==='low'&&'bg-amber-50/20')} onClick={()=>setDetail(p)}>
                      <td className="px-3 py-2.5" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={isSel} onChange={()=>selOne(p.id)} className="rounded border-gray-300"/></td>
                      <td className="px-3 py-2.5"><div className="flex items-center gap-2.5">{img?<img src={img} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-100 flex-shrink-0"/>:<div className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0"/>}<div className="min-w-0"><p className="truncate font-medium text-gray-900 max-w-[220px]">{p.title}</p><p className="text-[11px] text-gray-400 truncate max-w-[180px]">{p.asin||p.id}</p></div></div></td>
                      <td className="px-3 py-2.5"><Badge v={p.status==='active'?'success':p.status==='draft'?'default':'warning'}>{p.status}</Badge></td>
                      <td className="px-3 py-2.5"><Badge v={p.source==='rainforest'||p.source==='keepa'?'purple':p.source==='manual'?'info':'default'}>{p.source||'\u2014'}</Badge></td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-900">{fmt$(p.cost_price??p.amazon_price)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-900">{fmt$(p.retail_price??p.current_price)}</td>
                      <td className="px-3 py-2.5 text-right"><Badge v={tier==='high'?'success':tier==='low'?'warning':'danger'}>{fmtP(margin)}</Badge></td>
                      <td className="px-3 py-2.5 text-center"><span className="inline-flex items-center gap-0.5 text-xs"><Ic.Star/> {p.rating?.toFixed(1)??'\u2014'}</span></td>
                      <td className="px-3 py-2.5 text-center">{p.is_prime?<Badge v="info">{'\u2713'}</Badge>:<span className="text-gray-300">{'\u2014'}</span>}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 truncate max-w-[100px]">{p.category||'\u2014'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{ta(p.created_at)}</td>
                      <td className="px-3 py-2.5 text-center" onClick={e=>e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {!p.shopify_product_id&&<button onClick={()=>syncShopify([p.id])} title="Sync to Shopify" className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><Ic.Shop/></button>}
                          {p.shopify_product_id&&<span className="text-[10px] text-green-600 font-medium">Synced</span>}
                        </div>
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
            {tp>1&&(
              <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50/50 text-sm">
                <p className="text-gray-500">Page {pg} of {tp} &middot; {total} products</p>
                <div className="flex gap-1">
                  <button onClick={()=>fetchProducts(pg-1)} disabled={pg<=1} className="px-3 py-1 border rounded-lg hover:bg-gray-100 disabled:opacity-40">Prev</button>
                  {Array.from({length:Math.min(5,tp)},(_,i)=>{const n=pg<=3?i+1:pg+i-2;if(n<1||n>tp)return null;return<button key={n} onClick={()=>fetchProducts(n)} className={cn('px-3 py-1 rounded-lg',n===pg?'bg-blue-600 text-white':'border hover:bg-gray-100')}>{n}</button>;}).filter(Boolean)}
                  <button onClick={()=>fetchProducts(pg+1)} disabled={pg>=tp} className="px-3 py-1 border rounded-lg hover:bg-gray-100 disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </div>
        )}
        <ManualSourcingModal open={showManual} onClose={()=>setShowManual(false)} onDone={()=>fetchProducts(1)}/>
        <AutoSourcingModal open={showAuto} onClose={()=>setShowAuto(false)} config={ac} onSave={saveAc}/>
        <ProductDetail product={detail} onClose={()=>setDetail(null)} onSync={syncShopify}/>
      </div>
    </div>
  );
}
