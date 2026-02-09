'use client';

/*
 * DROPSHIP PRO — Products Page
 * ─────────────────────────────
 * Manual/Auto sourcing from Amazon · Profit tracking · Shopify sync
 * Backend: /api/products, /api/cron/discovery/run
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

interface ProductItem {
  id: string;
  asin: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  cost_price: number | null;
  amazon_price: number | null;
  retail_price: number | null;
  current_price: number | null;
  compare_at_price: number | null;
  profit_amount: number | null;
  profit_percent: number | null;
  profit_margin: number | null;
  profit_status: string | null;
  rating: number | null;
  review_count: number | null;
  is_prime: boolean;
  category: string | null;
  brand: string | null;
  status: string;
  source: string | null;
  shopify_product_id: string | null;
  shopify_sync_status: string | null;
  created_at: string;
  updated_at: string;
  last_price_check: string | null;
}

interface DiscoveredProduct {
  asin: string;
  title: string;
  amazonPrice: number;
  salesPrice: number;
  profitAmount: number;
  profitPercent: number;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  amazonUrl: string;
  category: string;
  isPrime: boolean;
}

interface SourcingFilters {
  min_price: number;
  max_price: number;
  min_margin: number;
  min_reviews: number;
  min_rating: number;
  max_bsr: number;
  count: number;
  prime_only: boolean;
  excluded_brands: string;
}

interface AutoConfig extends SourcingFilters {
  enabled: boolean;
  interval_hours: number;
  last_run: string | null;
}

type SortField = 'created_at' | 'cost_price' | 'retail_price' | 'profit_percent';
type SortDir = 'asc' | 'desc';
type Tab = 'all' | 'manual' | 'auto' | 'high_profit' | 'low_profit' | 'no_profit';

const DEFAULTS: SourcingFilters = {
  min_price: 3, max_price: 25, min_margin: 30, min_reviews: 500,
  min_rating: 3.5, max_bsr: 100000, count: 1000,
  prime_only: true, excluded_brands: 'Apple, Nike, Samsung, Sony, Microsoft',
};
const COUNT_OPTS = [100, 500, 1000, 5000, 10000];
const PG = 25;

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

const $$ = (v: number | null | undefined) => v == null ? '—' : `$${v.toFixed(2)}`;
const pct = (v: number | null | undefined) => v == null ? '—' : `${v.toFixed(1)}%`;
const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const margin = (p: ProductItem) => p.profit_percent ?? p.profit_margin ?? null;
const tier = (m: number | null | undefined): 'high' | 'low' | 'none' => {
  if (m == null || m <= 0) return 'none';
  return m >= 30 ? 'high' : 'low';
};
const ago = (d: string | null | undefined) => {
  if (!d) return 'Never';
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
const img = (p: ProductItem) => p.image_url || '';

// ════════════════════════════════════════════════════════════════════════════
// ICONS (inline SVG – no deps)
// ════════════════════════════════════════════════════════════════════════════

function Ic({ d, cls }: { d: string; cls?: string }) {
  return <svg className={cls || 'w-4 h-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>;
}
const ISearch = () => <Ic d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />;
const IRefresh = ({ spin }: { spin?: boolean }) => <svg className={cn('w-4 h-4', spin && 'animate-spin')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;
const IPlus = () => <Ic d="M12 4v16m8-8H4" />;
const IX = () => <Ic d="M6 18L18 6M6 6l12 12" />;
const IUp = () => <Ic d="M5 15l7-7 7 7" cls="w-3 h-3" />;
const IDown = () => <Ic d="M19 9l-7 7-7-7" cls="w-3 h-3" />;
const ITrash = () => <Ic d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />;
const IClock = () => <Ic d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />;
const IBolt = () => <Ic d="M13 10V3L4 14h7v7l9-11h-7z" />;
const ICheck = () => <Ic d="M5 13l4 4L19 7" cls="w-5 h-5" />;
const IExt = () => <Ic d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" cls="w-3.5 h-3.5" />;
const IBox = () => <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>;
const IShopify = () => <svg className="w-4 h-4" viewBox="0 0 109 124" fill="currentColor"><path d="M95.6 28.4c-.1-.6-.6-1-1.1-1l-14.1-1.1-9.9-9.8c-.3-.3-.7-.4-1.1-.4l-5.5 85.9 38.2-8.2S96 32.9 95.6 28.4zM66.8 36.5l-5.5 1.7c-1.6-4.8-4.3-9.2-9.1-9.2h-.4C50 26.7 47.7 25 45.8 25c-14.1.2-20.8 17.6-22.9 26.5l-10 3.1c-3.1 1-3.2 1.1-3.6 4L2 101.5l65.2 12.2 .1-77.2h-.5zM51 42l-7.4 2.3c1.4-5.5 4.2-10.9 9.3-12.9C52.5 34.4 51.4 38 51 42zm8.6-14.5c.5 1.1.9 2.5 1.1 4.4L53.3 34c2.7-4 6.2-6.6 6.3-6.5zm-5-5.3c.8 0 1.5.3 2.1.9C51.4 25.6 47.4 32.4 45.5 42l-5.9 1.8C41.5 36.6 46.5 22.3 54.6 22.2z" /></svg>;
const IStar = () => <svg className="w-3.5 h-3.5 text-amber-400" viewBox="0 0 20 20" fill="currentColor"><path d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.07 3.29a1 1 0 00.95.69h3.46c.97 0 1.37 1.24.59 1.81l-2.8 2.03a1 1 0 00-.36 1.12l1.07 3.29c.3.92-.76 1.69-1.54 1.12l-2.8-2.03a1 1 0 00-1.18 0l-2.8 2.03c-.78.57-1.84-.2-1.54-1.12l1.07-3.29a1 1 0 00-.36-1.12L2.98 8.72c-.78-.57-.38-1.81.59-1.81h3.46a1 1 0 00.95-.69l1.07-3.29z" /></svg>;

// ════════════════════════════════════════════════════════════════════════════
// MICRO COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

function Badge({ children, v = 'default' }: { children: React.ReactNode; v?: string }) {
  const m: Record<string, string> = {
    default: 'bg-gray-100 text-gray-700', success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200', danger: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200', purple: 'bg-violet-50 text-violet-700 border-violet-200',
  };
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border', m[v] || m.default)}>{children}</span>;
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow">
      <div className={cn('w-8 h-1 rounded-full mb-3', color)} />
      <p className="text-2xl font-bold text-gray-900 tracking-tight">{value.toLocaleString()}</p>
      <p className="text-xs font-medium text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MANUAL SOURCING MODAL
// ════════════════════════════════════════════════════════════════════════════

function ManualSourcingModal({ open, onClose, onDone }: {
  open: boolean; onClose: () => void; onDone: () => void;
}) {
  const [f, setF] = useState<SourcingFilters>({ ...DEFAULTS });
  const [phase, setPhase] = useState<'config' | 'loading' | 'preview' | 'importing' | 'done'>('config');
  const [items, setItems] = useState<DiscoveredProduct[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [diag, setDiag] = useState<{ rejected: number; skipped: number; errors: string[]; rejectionReasons?: Record<string, number> } | null>(null);
  const [result, setResult] = useState<any>(null);

  // Reset when re-opened
  useEffect(() => {
    if (open) { setPhase('config'); setErr(null); setItems([]); setSel(new Set()); setResult(null); setDiag(null); }
  }, [open]);

  const preview = async () => {
    setPhase('loading');
    setErr(null);
    setDiag(null);
    try {
      const res = await fetch('/api/cron/discovery/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: {
            min_amazon_price: f.min_price,
            max_amazon_price: f.max_price,
            min_profit_margin: f.min_margin,
            min_reviews: f.min_reviews,
            min_rating: f.min_rating,
            max_bsr: f.max_bsr,
            require_prime: f.prime_only,
            excluded_brands: f.excluded_brands.split(',').map(b => b.trim()).filter(Boolean),
          },
          maxProducts: f.count,
          source: 'manual',
          dryRun: true,
        }),
      });
      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || 'Discovery failed');
      }

      const d = json.data || {};
      const found: DiscoveredProduct[] = d.products || d.preview || [];
      setItems(found);
      setSel(new Set(found.map(p => p.asin)));
      setDiag({ rejected: d.rejected || 0, skipped: d.skipped || 0, errors: d.errors || [], rejectionReasons: d.rejectionReasons || {} });
      setPhase('preview');
    } catch (e: any) {
      setErr(e.message);
      setPhase('config');
    }
  };

  const doImport = async () => {
    if (sel.size === 0) return;
    setPhase('importing');
    setErr(null);
    try {
      const res = await fetch('/api/cron/discovery/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: {
            min_amazon_price: f.min_price,
            max_amazon_price: f.max_price,
            min_profit_margin: f.min_margin,
            min_reviews: f.min_reviews,
            min_rating: f.min_rating,
            max_bsr: f.max_bsr,
            require_prime: f.prime_only,
            excluded_brands: f.excluded_brands.split(',').map(b => b.trim()).filter(Boolean),
          },
          maxProducts: sel.size,
          source: 'manual',
          dryRun: false,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Import failed');
      setResult(json.data);
      setPhase('done');
      setTimeout(() => { onDone(); onClose(); }, 2500);
    } catch (e: any) {
      setErr(e.message);
      setPhase('preview');
    }
  };

  const togAll = () => setSel(s => s.size === items.length ? new Set() : new Set(items.map(p => p.asin)));
  const tog = (a: string) => setSel(s => { const n = new Set(s); n.has(a) ? n.delete(a) : n.add(a); return n; });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center"><ISearch /></div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Manual Product Sourcing</h2>
              <p className="text-xs text-gray-500">Source products from Amazon matching your criteria</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/60 rounded-lg transition-colors"><IX /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* Error banner */}
          {err && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">Error</p>
                <p className="mt-0.5">{err}</p>
              </div>
              <button onClick={() => setErr(null)} className="flex-shrink-0 mt-0.5"><IX /></button>
            </div>
          )}

          {/* CONFIG PHASE */}
          {phase === 'config' && (
            <div className="space-y-5">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <IBolt />
                  <div>
                    <p className="font-medium text-blue-900">
                      Estimated Cost for {f.count.toLocaleString()} Products
                    </p>
                    <p className="text-xs text-blue-600">
                      ~{f.count.toLocaleString()} Keepa tokens &middot; ${(f.count * 0.0001).toFixed(2)}
                    </p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-blue-600">${(f.count * 0.0001).toFixed(2)}</span>
              </div>

              <p className="text-sm text-gray-500 bg-gray-50 border rounded-xl px-4 py-2.5">
                ℹ️ Click <strong>&quot;Preview Products&quot;</strong> to see matching products before importing. Uses Rainforest API to search Amazon.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {([
                  ['Min Price ($)', 'min_price'], ['Max Price ($)', 'max_price'],
                  ['Min Margin (%)', 'min_margin'], ['Min Reviews', 'min_reviews'],
                  ['Min Rating', 'min_rating'], ['Max BSR', 'max_bsr'],
                ] as [string, keyof SourcingFilters][]).map(([label, key]) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                    <input
                      type="number"
                      step={key === 'min_rating' ? '0.1' : '1'}
                      value={f[key] as number}
                      onChange={e => setF(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Products to Source</label>
                  <select
                    value={f.count}
                    onChange={e => setF(prev => ({ ...prev, count: +e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {COUNT_OPTS.map(n => (
                      <option key={n} value={n}>{n.toLocaleString()}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={f.prime_only}
                      onChange={e => setF(prev => ({ ...prev, prime_only: e.target.checked }))}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Prime Only</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Excluded Brands (comma-separated)</label>
                <input
                  value={f.excluded_brands}
                  onChange={e => setF(prev => ({ ...prev, excluded_brands: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          )}

          {/* LOADING */}
          {(phase === 'loading' || phase === 'importing') && (
            <div className="flex flex-col items-center py-20 gap-4">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-lg font-medium text-gray-900">
                {phase === 'loading' ? 'Searching Amazon...' : 'Importing Products...'}
              </p>
              <p className="text-sm text-gray-500">
                {phase === 'loading' ? 'Querying Rainforest API and filtering results' : `Importing ${sel.size} products to your catalog`}
              </p>
            </div>
          )}

          {/* PREVIEW */}
          {phase === 'preview' && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="font-medium text-gray-900">
                    Found {items.length} products &middot; {sel.size} selected
                  </p>
                  {diag && (diag.rejected > 0 || diag.skipped > 0) && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {diag.rejected > 0 && <span className="text-amber-600">{diag.rejected} rejected (didn&apos;t meet criteria)</span>}
                      {diag.rejected > 0 && diag.skipped > 0 && ' · '}
                      {diag.skipped > 0 && <span className="text-blue-600">{diag.skipped} already in catalog</span>}
                    </p>
                  )}
                  {diag && diag.rejectionReasons && Object.keys(diag.rejectionReasons).length > 0 && (
                    <div className="mt-1.5 text-xs text-gray-500">
                      <p className="font-medium text-gray-600 mb-0.5">Rejection breakdown:</p>
                      {Object.entries(diag.rejectionReasons).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([reason, count]) => (
                        <p key={reason} className="text-amber-600">· {reason}: {count}</p>
                      ))}
                    </div>
                  )}
                  {diag && diag.errors.length > 0 && (
                    <div className="mt-2 text-xs text-red-600">
                      {diag.errors.map((e, i) => <p key={i}>⚠ {e}</p>)}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={togAll} className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                    {sel.size === items.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <button onClick={() => setPhase('config')} className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                    ← Back to Filters
                  </button>
                </div>
              </div>

              {/* Table */}
              {items.length > 0 ? (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0 z-10">
                        <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wider">
                          <th className="px-3 py-2.5 w-8">
                            <input type="checkbox" checked={sel.size === items.length && items.length > 0} onChange={togAll} className="rounded border-gray-300" />
                          </th>
                          <th className="px-3 py-2.5">Product</th>
                          <th className="px-3 py-2.5 text-right">Buy Price</th>
                          <th className="px-3 py-2.5 text-right">Sell Price</th>
                          <th className="px-3 py-2.5 text-right">Margin</th>
                          <th className="px-3 py-2.5 text-center">Rating</th>
                          <th className="px-3 py-2.5 text-center">Prime</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {items.map(p => (
                          <tr key={p.asin} className={cn('hover:bg-blue-50/40 transition-colors', !sel.has(p.asin) && 'opacity-40')}>
                            <td className="px-3 py-2">
                              <input type="checkbox" checked={sel.has(p.asin)} onChange={() => tog(p.asin)} className="rounded border-gray-300" />
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2.5">
                                {p.imageUrl ? (
                                  <img src={p.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover bg-gray-100 flex-shrink-0" />
                                ) : (
                                  <div className="w-9 h-9 rounded-lg bg-gray-100 flex-shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-gray-900 max-w-[240px]">{p.title}</p>
                                  <p className="text-[11px] text-gray-400">{p.asin} &middot; {p.category}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs text-gray-900">{$$(p.amazonPrice)}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs text-gray-900">{$$(p.salesPrice)}</td>
                            <td className="px-3 py-2 text-right">
                              <Badge v={p.profitPercent >= 30 ? 'success' : p.profitPercent > 0 ? 'warning' : 'danger'}>
                                {pct(p.profitPercent)}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className="inline-flex items-center gap-0.5 text-xs"><IStar /> {p.rating.toFixed(1)}</span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              {p.isPrime ? <Badge v="info">Prime</Badge> : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                  <p className="font-medium text-amber-800 mb-1">No products matched all criteria</p>
                  <p className="text-sm text-amber-600">
                    {diag && diag.rejected > 0
                      ? `${diag.rejected} products were found but rejected. Try lowering Min Reviews, Min Rating, or Min Margin.`
                      : 'The Rainforest API returned no results. Check your price range or try again later.'}
                  </p>
                  <button onClick={() => setPhase('config')} className="mt-4 px-4 py-2 bg-amber-100 text-amber-800 text-sm font-medium rounded-lg hover:bg-amber-200 transition-colors">
                    Adjust Filters
                  </button>
                </div>
              )}
            </div>
          )}

          {/* DONE */}
          {phase === 'done' && result && (
            <div className="flex flex-col items-center py-16 gap-3">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><ICheck /></div>
              <p className="text-xl font-semibold text-gray-900">Import Complete!</p>
              <div className="flex gap-6 text-sm text-gray-600 mt-2">
                <span>Found: <strong>{result.found ?? 0}</strong></span>
                <span>Imported: <strong>{result.imported ?? 0}</strong></span>
                <span>Synced: <strong>{result.synced ?? 0}</strong></span>
              </div>
              {result.errors && result.errors.length > 0 && (
                <div className="mt-3 text-xs text-red-500">
                  {result.errors.map((e: string, i: number) => <p key={i}>⚠ {e}</p>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 flex-shrink-0">
          <button
            onClick={() => setF({ ...DEFAULTS })}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
          >
            <IRefresh /> Reset to Defaults
          </button>
          <div className="flex gap-3">
            {phase === 'config' && (
              <button
                onClick={preview}
                className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <ISearch /> Preview Products
              </button>
            )}
            {phase === 'preview' && items.length > 0 && (
              <button
                onClick={doImport}
                disabled={sel.size === 0}
                className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                <IPlus /> Import {sel.size} Products
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// AUTO SOURCING MODAL
// ════════════════════════════════════════════════════════════════════════════

function AutoSourcingModal({ open, onClose, cfg, onSave }: {
  open: boolean; onClose: () => void; cfg: AutoConfig; onSave: (c: AutoConfig) => void;
}) {
  const [l, setL] = useState<AutoConfig>({ ...cfg });
  useEffect(() => { if (open) setL({ ...cfg }); }, [open, cfg]);
  if (!open) return null;

  const ints = [
    { l: 'Every 6 hours', v: 6 }, { l: 'Every 12 hours', v: 12 },
    { l: 'Daily (24h)', v: 24 }, { l: 'Every 48 hours', v: 48 },
    { l: 'Every 72 hours', v: 72 }, { l: 'Weekly', v: 168 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-violet-50 to-purple-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center"><IClock /></div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Auto Sourcing Configuration</h2>
              <p className="text-xs text-gray-500">Auto-discover products at set intervals &middot; stored separately</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/60 rounded-lg"><IX /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-violet-50 border border-violet-200">
            <div>
              <p className="font-medium text-violet-900">Enable Auto Sourcing</p>
              <p className="text-xs text-violet-600">Products go into the &quot;Auto&quot; tab</p>
            </div>
            <button
              onClick={() => setL(x => ({ ...x, enabled: !x.enabled }))}
              className={cn('relative w-12 h-7 rounded-full transition-colors', l.enabled ? 'bg-violet-600' : 'bg-gray-300')}
            >
              <div className={cn('absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform', l.enabled ? 'translate-x-5' : 'translate-x-0.5')} />
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Run Interval</label>
            <select value={l.interval_hours} onChange={e => setL(x => ({ ...x, interval_hours: +e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-violet-500">
              {ints.map(i => <option key={i.v} value={i.v}>{i.l}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {([
              ['Min Price ($)', 'min_price'], ['Max Price ($)', 'max_price'],
              ['Min Margin (%)', 'min_margin'], ['Min Reviews', 'min_reviews'],
              ['Min Rating', 'min_rating'], ['Max BSR', 'max_bsr'],
            ] as [string, keyof SourcingFilters][]).map(([label, key]) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                <input type="number" step={key === 'min_rating' ? '0.1' : '1'}
                  value={l[key] as number}
                  onChange={e => setL(x => ({ ...x, [key]: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Products per Run</label>
              <select value={l.count} onChange={e => setL(x => ({ ...x, count: +e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-violet-500">
                {COUNT_OPTS.map(n => <option key={n} value={n}>{n.toLocaleString()}</option>)}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={l.prime_only}
                  onChange={e => setL(x => ({ ...x, prime_only: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-violet-600" />
                <span className="text-sm font-medium text-gray-700">Prime Only</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Excluded Brands</label>
            <input value={l.excluded_brands} onChange={e => setL(x => ({ ...x, excluded_brands: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-violet-500" />
          </div>

          {cfg.last_run && <p className="text-xs text-gray-400">Last run: {ago(cfg.last_run)}</p>}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={() => { onSave(l); onClose(); }} className="px-5 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PRODUCT DETAIL MODAL
// ════════════════════════════════════════════════════════════════════════════

function ProductDetail({ product: p, onClose, onSync }: {
  product: ProductItem | null; onClose: () => void; onSync: (ids: string[]) => void;
}) {
  if (!p) return null;
  const buy = p.cost_price ?? p.amazon_price ?? 0;
  const sell = p.retail_price ?? p.current_price ?? 0;
  const m = margin(p) ?? (sell > 0 ? ((sell - buy) / sell) * 100 : 0);
  const t = tier(m);
  const i = img(p);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-start gap-4 p-6 border-b">
          {i ? (
            <img src={i} alt="" className="w-24 h-24 rounded-xl object-cover bg-gray-100 flex-shrink-0" />
          ) : (
            <div className="w-24 h-24 rounded-xl bg-gray-100 flex items-center justify-center text-xs text-gray-400 flex-shrink-0">No img</div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900 leading-tight">{p.title}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {p.asin && (
                <a href={`https://amazon.com/dp/${p.asin}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  ASIN: {p.asin} <IExt />
                </a>
              )}
              <Badge v={p.status === 'active' ? 'success' : 'default'}>{p.status}</Badge>
              {p.is_prime && <Badge v="info">Prime</Badge>}
              {p.source && <Badge v="purple">{p.source}</Badge>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg flex-shrink-0"><IX /></button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-[11px] text-gray-500 mb-1 uppercase tracking-wide">Buy Price</p>
              <p className="text-xl font-bold text-gray-900">{$$(buy)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-[11px] text-gray-500 mb-1 uppercase tracking-wide">Sell Price</p>
              <p className="text-xl font-bold text-gray-900">{$$(sell)}</p>
            </div>
            <div className={cn('rounded-xl p-4 text-center', t === 'high' ? 'bg-emerald-50' : t === 'low' ? 'bg-amber-50' : 'bg-red-50')}>
              <p className="text-[11px] text-gray-500 mb-1 uppercase tracking-wide">Margin</p>
              <p className={cn('text-xl font-bold', t === 'high' ? 'text-emerald-700' : t === 'low' ? 'text-amber-700' : 'text-red-700')}>
                {pct(m)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Category</span><span className="font-medium text-gray-900">{p.category || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Rating</span><span className="font-medium text-gray-900">★ {p.rating?.toFixed(1) ?? '—'} ({(p.review_count ?? 0).toLocaleString()})</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Compare At</span><span className="font-medium text-gray-900">{$$(p.compare_at_price)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Price Check</span><span className="font-medium text-gray-900">{ago(p.last_price_check)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Created</span><span className="font-medium text-gray-900">{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Shopify</span><span className="font-medium text-gray-900">{p.shopify_product_id ? '✅ Synced' : '⬜ Not synced'}</span></div>
          </div>

          <div className="flex gap-3 pt-2">
            {!p.shopify_product_id && (
              <button onClick={() => onSync([p.id])}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2">
                <IShopify /> Sync to Shopify
              </button>
            )}
            {p.asin && (
              <a href={`https://amazon.com/dp/${p.asin}`} target="_blank" rel="noopener noreferrer"
                className="px-4 py-2 text-sm font-medium text-gray-700 border rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2">
                View on Amazon <IExt />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ════════════════════════════════════════════════════════════════════════════

export default function ProductsPage() {
  // --- State ---
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showManual, setShowManual] = useState(false);
  const [showAuto, setShowAuto] = useState(false);
  const [detail, setDetail] = useState<ProductItem | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [autoConfig, setAutoConfig] = useState<AutoConfig>({
    ...DEFAULTS, enabled: false, interval_hours: 24, last_run: null,
  });

  // Load auto config from localStorage
  useEffect(() => {
    try {
      const s = localStorage.getItem('dp_auto_cfg');
      if (s) setAutoConfig(JSON.parse(s));
    } catch { /* noop */ }
  }, []);

  // --- Fetch products ---
  const fetchProducts = useCallback(async (pg = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        action: 'list',
        page: String(pg),
        pageSize: String(PG),
        sortBy: sortField === 'cost_price' || sortField === 'retail_price' ? 'current_price' : sortField,
        sortOrder: sortDir,
      });
      if (search.trim()) params.set('search', search.trim());
      if (tab === 'high_profit') params.set('minMargin', '30');
      if (tab === 'low_profit') { params.set('minMargin', '0.01'); params.set('maxMargin', '29.99'); }

      const res = await fetch(`/api/products?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'API error');

      const raw = json.data?.products || json.data || [];
      const mapped: ProductItem[] = (Array.isArray(raw) ? raw : []).map((r: any) => ({
        id: r.id,
        asin: r.asin || r.source_product_id || null,
        title: r.title || 'Untitled',
        description: r.description || null,
        image_url: r.image_url || r.main_image || null,
        cost_price: r.cost_price ?? r.amazon_price ?? null,
        amazon_price: r.amazon_price ?? r.cost_price ?? null,
        retail_price: r.retail_price ?? r.current_price ?? null,
        current_price: r.current_price ?? null,
        compare_at_price: r.compare_at_price ?? null,
        profit_amount: r.profit_amount ?? null,
        profit_percent: r.profit_percent ?? r.profit_margin ?? null,
        profit_margin: r.profit_margin ?? r.profit_percent ?? null,
        profit_status: r.profit_status ?? null,
        rating: r.rating ?? null,
        review_count: r.review_count ?? null,
        is_prime: r.is_prime || false,
        category: r.category || null,
        brand: r.brand || null,
        status: r.status || 'active',
        source: r.source || null,
        shopify_product_id: r.shopify_product_id || null,
        shopify_sync_status: r.shopify_sync_status || null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        last_price_check: r.last_price_check || null,
      }));

      setProducts(mapped);
      setTotal(json.data?.total ?? json.pagination?.total ?? mapped.length);
      setPage(pg);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [sortField, sortDir, search, tab]);

  useEffect(() => { fetchProducts(1); }, [fetchProducts]);

  // --- Computed ---
  const filtered = useMemo(() => {
    let list = [...products];
    if (tab === 'manual') list = list.filter(p => p.source === 'manual' || !p.source || p.source === 'csv_upload' || p.source === 'import');
    if (tab === 'auto') list = list.filter(p => p.source === 'rainforest' || p.source === 'keepa' || p.source === 'cron');
    if (tab === 'no_profit') list = list.filter(p => tier(margin(p)) === 'none');
    // Client-side sort for fields the API may not map directly
    list.sort((a, b) => {
      let va = 0, vb = 0;
      if (sortField === 'cost_price') { va = a.cost_price ?? 0; vb = b.cost_price ?? 0; }
      else if (sortField === 'retail_price') { va = a.retail_price ?? 0; vb = b.retail_price ?? 0; }
      else if (sortField === 'profit_percent') { va = margin(a) ?? 0; vb = margin(b) ?? 0; }
      else { return 0; } // let server sort handle created_at
      return (va - vb) * (sortDir === 'asc' ? 1 : -1);
    });
    return list;
  }, [products, tab, sortField, sortDir]);

  const stats = useMemo(() => {
    const hp = products.filter(p => tier(margin(p)) === 'high').length;
    const lp = products.filter(p => tier(margin(p)) === 'low').length;
    const np = products.filter(p => tier(margin(p)) === 'none').length;
    const synced = products.filter(p => !!p.shopify_product_id).length;
    const auto = products.filter(p => p.source === 'rainforest' || p.source === 'keepa' || p.source === 'cron').length;
    return { total, hp, lp, np, synced, auto };
  }, [products, total]);

  const totalPages = Math.max(1, Math.ceil(total / PG));

  // --- Handlers ---
  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir('desc'); }
  };
  const selAll = () => setSelected(s => s.size === filtered.length ? new Set() : new Set(filtered.map(p => p.id)));
  const selOne = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const syncShopify = async (ids?: string[]) => {
    setSyncing(true);
    try {
      await fetch('/api/products?action=sync-shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: ids }),
      });
      await fetchProducts(page);
    } catch { /* */ }
    finally { setSyncing(false); }
  };

  const bulkDelete = async () => {
    if (selected.size === 0 || !confirm(`Delete ${selected.size} products?`)) return;
    try {
      await fetch('/api/products?bulk=true', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: [...selected] }),
      });
      setSelected(new Set());
      await fetchProducts(page);
    } catch { /* */ }
  };

  const saveAutoConfig = (c: AutoConfig) => {
    setAutoConfig(c);
    try { localStorage.setItem('dp_auto_cfg', JSON.stringify(c)); } catch { /* */ }
    fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert', settings: [{ category: 'discovery', key: 'auto_sourcing_config', value: JSON.stringify(c) }] }),
    }).catch(() => {});
  };

  // --- Sortable column header ---
  const SortTh = ({ field, children, right }: { field: SortField; children: React.ReactNode; right?: boolean }) => (
    <th
      className={cn('px-3 py-3 cursor-pointer select-none group', right ? 'text-right' : 'text-left')}
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
        {children}
        <span className={cn('transition-opacity', sortField === field ? 'opacity-100' : 'opacity-0 group-hover:opacity-30')}>
          {sortField === field && sortDir === 'asc' ? <IUp /> : <IDown />}
        </span>
      </span>
    </th>
  );

  // ═══════ RENDER ═══════
  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* HEADER */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Products</h1>
            <p className="text-sm text-gray-500 mt-0.5">Dropship Pro &middot; Manage catalog &amp; sourcing</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowAuto(true)}
              className="px-4 py-2 text-sm font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors flex items-center gap-2">
              <IClock /> Auto Source
              {autoConfig.enabled && <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />}
            </button>
            <button onClick={() => setShowManual(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
              <ISearch /> Manual Source
            </button>
            <button onClick={() => syncShopify()} disabled={syncing}
              className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors flex items-center gap-2">
              <IShopify /> {syncing ? 'Syncing...' : 'Sync Shopify'}
            </button>
            <button onClick={() => fetchProducts(page)} disabled={loading}
              className="px-3 py-2 text-gray-600 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
              <IRefresh spin={loading} />
            </button>
          </div>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="Total Products" value={stats.total} color="bg-slate-500" />
          <Stat label="High Profit (≥30%)" value={stats.hp} color="bg-emerald-500" />
          <Stat label="Low Profit (<30%)" value={stats.lp} color="bg-amber-500" />
          <Stat label="No Profit" value={stats.np} color="bg-red-500" />
          <Stat label="Shopify Synced" value={stats.synced} color="bg-blue-500" />
          <Stat label="Auto Sourced" value={stats.auto} color="bg-violet-500" />
        </div>

        {/* ERROR */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between text-sm text-red-700">
            <span>{error}</span>
            <button onClick={() => { setError(null); fetchProducts(1); }} className="font-medium hover:underline">Retry</button>
          </div>
        )}

        {/* LOADING SKELETON */}
        {loading && products.length === 0 && (
          <div className="space-y-3 animate-pulse">
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="h-12 bg-gray-50 border-b" />
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-14 border-b border-gray-50 flex items-center px-4 gap-3">
                  <div className="w-4 h-4 bg-gray-200 rounded" />
                  <div className="w-10 h-10 bg-gray-200 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-48 bg-gray-200 rounded" />
                    <div className="h-2.5 w-24 bg-gray-200 rounded" />
                  </div>
                  <div className="h-5 w-14 bg-gray-200 rounded-full" />
                  <div className="h-5 w-14 bg-gray-200 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EMPTY STATE */}
        {!loading && !error && products.length === 0 && total === 0 && (
          <div className="flex flex-col items-center py-20 bg-white rounded-2xl border border-gray-200">
            <IBox />
            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-2">No Products Yet</h3>
            <p className="text-gray-500 text-sm mb-8 max-w-md text-center">
              Source products from Amazon using Manual or Auto sourcing, or sync your existing Shopify catalog.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowManual(true)}
                className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
                <ISearch /> Source Products
              </button>
              <button onClick={() => syncShopify()}
                className="px-5 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg border hover:bg-gray-50 transition-colors flex items-center gap-2">
                <IShopify /> Sync Shopify
              </button>
            </div>
          </div>
        )}

        {/* PRODUCTS TABLE */}
        {(products.length > 0 || (total > 0 && !loading)) && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b bg-gray-50/60">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Tabs */}
                <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden text-xs font-medium">
                  {([
                    ['all', 'All'],
                    ['manual', 'Manual'],
                    ['auto', 'Auto'],
                    ['high_profit', '🟢 High'],
                    ['low_profit', '🟡 Low'],
                    ['no_profit', '🔴 None'],
                  ] as [Tab, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => { setTab(key); setPage(1); setSelected(new Set()); }}
                      className={cn(
                        'px-3 py-1.5 border-r last:border-r-0 transition-colors',
                        tab === key ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-50',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="relative">
                  <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"><ISearch /></div>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search products..."
                    className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-56 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                  />
                </div>
              </div>

              {/* Bulk actions */}
              {selected.size > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 font-medium">{selected.size} selected</span>
                  <button onClick={() => syncShopify([...selected])} disabled={syncing}
                    className="px-3 py-1.5 text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 text-xs font-medium flex items-center gap-1 transition-colors">
                    <IShopify /> Sync
                  </button>
                  <button onClick={bulkDelete}
                    className="px-3 py-1.5 text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 text-xs font-medium flex items-center gap-1 transition-colors">
                    <ITrash /> Delete
                  </button>
                </div>
              )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selected.size === filtered.length && filtered.length > 0}
                        onChange={selAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Source</th>
                    <SortTh field="cost_price" right>Buy Price</SortTh>
                    <SortTh field="retail_price" right>Sell Price</SortTh>
                    <SortTh field="profit_percent" right>Margin</SortTh>
                    <th className="px-3 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Rating</th>
                    <th className="px-3 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Prime</th>
                    <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                    <SortTh field="created_at">Added</SortTh>
                    <th className="px-3 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-4 py-12 text-center text-gray-500">
                        No products match the current filter.
                      </td>
                    </tr>
                  )}
                  {filtered.map(p => {
                    const m = margin(p);
                    const t = tier(m);
                    const i = img(p);
                    const isSel = selected.has(p.id);
                    return (
                      <tr
                        key={p.id}
                        className={cn(
                          'hover:bg-blue-50/20 transition-colors cursor-pointer',
                          t === 'none' && 'bg-red-50/30',
                          t === 'low' && 'bg-amber-50/20',
                        )}
                        onClick={() => setDetail(p)}
                      >
                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={isSel} onChange={() => selOne(p.id)} className="rounded border-gray-300" />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            {i ? (
                              <img src={i} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-100 flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-medium text-gray-900 max-w-[220px]">{p.title}</p>
                              <p className="text-[11px] text-gray-400 truncate max-w-[180px]">{p.asin || p.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge v={p.status === 'active' ? 'success' : p.status === 'pending' ? 'warning' : 'default'}>
                            {p.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge v={p.source === 'rainforest' || p.source === 'keepa' ? 'purple' : p.source === 'manual' ? 'info' : 'default'}>
                            {p.source || '—'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-900">{$$(p.cost_price ?? p.amazon_price)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-900">{$$(p.retail_price ?? p.current_price)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <Badge v={t === 'high' ? 'success' : t === 'low' ? 'warning' : 'danger'}>{pct(m)}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="inline-flex items-center gap-0.5 text-xs"><IStar /> {p.rating?.toFixed(1) ?? '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {p.is_prime ? <Badge v="info">✓</Badge> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-600 truncate max-w-[100px]">{p.category || '—'}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{ago(p.created_at)}</td>
                        <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            {!p.shopify_product_id ? (
                              <button onClick={() => syncShopify([p.id])} title="Sync to Shopify"
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                                <IShopify />
                              </button>
                            ) : (
                              <span className="text-[10px] text-green-600 font-medium">Synced</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50/50 text-sm">
                <p className="text-gray-500">
                  Page {page} of {totalPages} &middot; {total.toLocaleString()} products
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => fetchProducts(page - 1)}
                    disabled={page <= 1}
                    className="px-3 py-1 border rounded-lg hover:bg-gray-100 disabled:opacity-40 transition-colors"
                  >
                    Prev
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let n: number;
                    if (totalPages <= 5) n = i + 1;
                    else if (page <= 3) n = i + 1;
                    else if (page >= totalPages - 2) n = totalPages - 4 + i;
                    else n = page - 2 + i;
                    if (n < 1 || n > totalPages) return null;
                    return (
                      <button
                        key={n}
                        onClick={() => fetchProducts(n)}
                        className={cn(
                          'px-3 py-1 rounded-lg transition-colors',
                          n === page ? 'bg-blue-600 text-white' : 'border hover:bg-gray-100',
                        )}
                      >
                        {n}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => fetchProducts(page + 1)}
                    disabled={page >= totalPages}
                    className="px-3 py-1 border rounded-lg hover:bg-gray-100 disabled:opacity-40 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODALS */}
        <ManualSourcingModal open={showManual} onClose={() => setShowManual(false)} onDone={() => fetchProducts(1)} />
        <AutoSourcingModal open={showAuto} onClose={() => setShowAuto(false)} cfg={autoConfig} onSave={saveAutoConfig} />
        <ProductDetail product={detail} onClose={() => setDetail(null)} onSync={syncShopify} />
      </div>
    </div>
  );
}
