'use client';
import React, { useState, useCallback, useRef } from 'react';

// ============================================================
// TYPES — Contract-first design
// ============================================================
interface CompetitorPrice {
  name: string;
  price: number;
  url: string;
  lastChecked: string;
}

interface Product {
  id: string;
  asin: string;
  title: string;
  image: string;
  category: string;
  costPrice: number;
  salePrice: number;
  compareAtPrice: number;
  competitor1: CompetitorPrice;
  competitor2: CompetitorPrice;
  competitor3: CompetitorPrice;
  profit: number;
  marginPercent: number;
  rating: number;
  reviews: number;
  bsr: number;
  availability: 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown';
  primeEligible: boolean;
  shopifyId: string | null;
  shopifyStatus: 'not_pushed' | 'active' | 'draft' | 'archived' | 'pending';
  sourcedAt: string;
  lastPriceCheck: string;
  selected: boolean;
}

interface PricingRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  type: 'undercut' | 'margin_floor' | 'map_price' | 'free_shipping' | 'round_down' | 'custom';
  value: number;
  unit: 'dollar' | 'percent' | 'fixed';
}

interface SourcingCriteria {
  minPrice: number;
  maxPrice: number;
  minMargin: number;
  minReviews: number;
  minRating: number;
  maxBsr: number;
  productsToSource: number;
  primeOnly: boolean;
  excludedBrands: string;
  categories: string[];
}

interface AutoSourcingConfig {
  enabled: boolean;
  intervalMinutes: number;
  maxPerDay: number;
  sourcedToday: number;
  lastRun: string | null;
  nextRun: string | null;
}

interface BulkImportJob {
  id: string;
  filename: string;
  totalRows: number;
  processed: number;
  matched: number;
  failed: number;
  status: 'uploading' | 'processing' | 'checking_prices' | 'applying_rules' | 'complete' | 'error';
  startedAt: string;
}

type SubTab = 'manual' | 'auto' | 'pricing' | 'bulk' | 'history' | 'products';

// ============================================================
// PRICING LOGIC ENGINE
// ============================================================
function applyPricingRules(cost: number, competitors: number[], rules: PricingRule[]): { salePrice: number; compareAtPrice: number; margin: number } {
  const lowestCompetitor = Math.min(...competitors.filter(p => p > 0));
  let salePrice = lowestCompetitor;
  let compareAtPrice = Math.max(...competitors.filter(p => p > 0));

  for (const rule of rules.filter(r => r.enabled)) {
    switch (rule.type) {
      case 'undercut':
        salePrice = lowestCompetitor - (rule.unit === 'dollar' ? rule.value : lowestCompetitor * rule.value / 100);
        break;
      case 'margin_floor': {
        const floor = cost * (1 + rule.value / 100);
        if (salePrice < floor) salePrice = floor;
        break;
      }
      case 'round_down':
        salePrice = Math.floor(salePrice) + 0.99;
        break;
      case 'free_shipping': {
        const shippingCost = rule.value;
        if (salePrice < shippingCost) salePrice = salePrice + shippingCost;
        break;
      }
    }
  }

  salePrice = Math.round(salePrice * 100) / 100;
  const profit = salePrice - cost;
  const margin = cost > 0 ? (profit / salePrice) * 100 : 0;

  return { salePrice, compareAtPrice, margin };
}

// ============================================================
// COMPONENT
// ============================================================
export default function SourcingEngine() {
  // Sub-tab navigation
  const [activeTab, setActiveTab] = useState<SubTab>('manual');

  // Sourcing criteria
  const [criteria, setCriteria] = useState<SourcingCriteria>({
    minPrice: 3, maxPrice: 25, minMargin: 30, minReviews: 500,
    minRating: 3.5, maxBsr: 100000, productsToSource: 1000,
    primeOnly: true, excludedBrands: 'Apple, Nike, Samsung, Sony, Microsoft, Disney, Marvel, Bose, Beats, JBL, Anker, Logitech',
    categories: ['Electronics', 'Home & Kitchen', 'Sports & Outdoors', 'Beauty', 'Toys & Games'],
  });

  // Products state
  const [products, setProducts] = useState<Product[]>([
    {
      id: 'p1', asin: 'B0CXYZ1234', title: 'Wireless Earbuds Pro TWS Bluetooth 5.3', image: '', category: 'Electronics',
      costPrice: 8.50, salePrice: 24.99, compareAtPrice: 39.99,
      competitor1: { name: 'Amazon', price: 29.99, url: 'https://amazon.com/dp/B0CXYZ1234', lastChecked: new Date().toISOString() },
      competitor2: { name: 'Walmart', price: 27.49, url: '', lastChecked: new Date().toISOString() },
      competitor3: { name: 'eBay', price: 31.99, url: '', lastChecked: new Date().toISOString() },
      profit: 16.49, marginPercent: 66, rating: 4.7, reviews: 12400, bsr: 1823,
      availability: 'in_stock', primeEligible: true, shopifyId: 'gid://shopify/Product/1', shopifyStatus: 'active',
      sourcedAt: new Date(Date.now() - 86400000 * 3).toISOString(), lastPriceCheck: new Date().toISOString(), selected: false
    },
    {
      id: 'p2', asin: 'B0CABC5678', title: 'USB-C Hub 7-in-1 Multiport Adapter', image: '', category: 'Electronics',
      costPrice: 6.20, salePrice: 18.49, compareAtPrice: 29.99,
      competitor1: { name: 'Amazon', price: 22.99, url: '', lastChecked: new Date().toISOString() },
      competitor2: { name: 'Walmart', price: 19.99, url: '', lastChecked: new Date().toISOString() },
      competitor3: { name: 'Target', price: 24.99, url: '', lastChecked: new Date().toISOString() },
      profit: 12.29, marginPercent: 66, rating: 4.5, reviews: 8700, bsr: 3421,
      availability: 'in_stock', primeEligible: true, shopifyId: 'gid://shopify/Product/2', shopifyStatus: 'active',
      sourcedAt: new Date(Date.now() - 86400000 * 2).toISOString(), lastPriceCheck: new Date().toISOString(), selected: false
    },
    {
      id: 'p3', asin: 'B0CDEF9012', title: 'LED Strip Lights 50ft RGB Color Changing', image: '', category: 'Home & Kitchen',
      costPrice: 4.80, salePrice: 12.99, compareAtPrice: 24.99,
      competitor1: { name: 'Amazon', price: 15.99, url: '', lastChecked: new Date().toISOString() },
      competitor2: { name: 'Walmart', price: 13.49, url: '', lastChecked: new Date().toISOString() },
      competitor3: { name: 'eBay', price: 14.99, url: '', lastChecked: new Date().toISOString() },
      profit: 8.19, marginPercent: 63, rating: 4.3, reviews: 15600, bsr: 892,
      availability: 'in_stock', primeEligible: true, shopifyId: null, shopifyStatus: 'not_pushed',
      sourcedAt: new Date(Date.now() - 86400000).toISOString(), lastPriceCheck: new Date().toISOString(), selected: false
    },
  ]);

  // Pricing rules
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([
    { id: 'r1', name: 'Undercut Lowest by $0.01', description: 'Beat the lowest competitor price by 1 cent', enabled: true, type: 'undercut', value: 0.01, unit: 'dollar' },
    { id: 'r2', name: 'Margin Floor 30%', description: 'Never sell below 30% margin over cost', enabled: true, type: 'margin_floor', value: 30, unit: 'percent' },
    { id: 'r3', name: 'Round Down to .99', description: 'Round sale price down to nearest .99', enabled: true, type: 'round_down', value: 0.99, unit: 'fixed' },
    { id: 'r4', name: 'Free Shipping Buffer', description: 'Add $2.50 shipping cost buffer if price < $15', enabled: false, type: 'free_shipping', value: 2.50, unit: 'dollar' },
  ]);

  // Auto sourcing
  const [autoConfig, setAutoConfig] = useState<AutoSourcingConfig>({
    enabled: false, intervalMinutes: 60, maxPerDay: 500, sourcedToday: 0,
    lastRun: null, nextRun: null,
  });

  // Bulk import
  const [bulkJobs, setBulkJobs] = useState<BulkImportJob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // UI state
  const [sourcingActive, setSourcingActive] = useState(false);
  const [priceCheckRunning, setPriceCheckRunning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectAll, setSelectAll] = useState(false);

  // Stats
  const todaySourced = products.filter(p => new Date(p.sourcedAt).toDateString() === new Date().toDateString()).length;
  const totalProducts = products.length;
  const activeInShopify = products.filter(p => p.shopifyStatus === 'active').length;
  const avgMargin = products.length > 0 ? Math.round(products.reduce((a, p) => a + p.marginPercent, 0) / products.length) : 0;

  // Handlers
  const toggleSelectAll = useCallback(() => {
    const next = !selectAll;
    setSelectAll(next);
    setProducts(prev => prev.map(p => ({ ...p, selected: next })));
  }, [selectAll]);

  const toggleSelect = useCallback((id: string) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, selected: !p.selected } : p));
  }, []);

  const runPriceCheck = useCallback(() => {
    setPriceCheckRunning(true);
    setTimeout(() => {
      setProducts(prev => prev.map(p => ({ ...p, lastPriceCheck: new Date().toISOString() })));
      setPriceCheckRunning(false);
    }, 3000);
  }, []);

  const pushToShopify = useCallback(() => {
    const selected = products.filter(p => p.selected);
    if (selected.length === 0) return;
    setProducts(prev => prev.map(p => p.selected ? { ...p, shopifyStatus: 'pending' as const, selected: false } : p));
    setTimeout(() => {
      setProducts(prev => prev.map(p => p.shopifyStatus === 'pending' ? { ...p, shopifyStatus: 'active' as const, shopifyId: p.shopifyId || `gid://shopify/Product/${Date.now()}` } : p));
    }, 2000);
  }, [products]);

  const handleBulkUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const job: BulkImportJob = {
      id: `job-${Date.now()}`, filename: file.name, totalRows: 0,
      processed: 0, matched: 0, failed: 0, status: 'uploading', startedAt: new Date().toISOString(),
    };
    setBulkJobs(prev => [job, ...prev]);
    // Simulate processing
    setTimeout(() => setBulkJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'processing', totalRows: 1247 } : j)), 1000);
    setTimeout(() => setBulkJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'checking_prices', processed: 623 } : j)), 3000);
    setTimeout(() => setBulkJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'applying_rules', processed: 1100, matched: 847 } : j)), 5000);
    setTimeout(() => setBulkJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'complete', processed: 1247, matched: 847, failed: 12 } : j)), 7000);
  }, []);

  const recalcPrices = useCallback(() => {
    setProducts(prev => prev.map(p => {
      const competitors = [p.competitor1.price, p.competitor2.price, p.competitor3.price];
      const result = applyPricingRules(p.costPrice, competitors, pricingRules);
      return { ...p, salePrice: result.salePrice, compareAtPrice: result.compareAtPrice, marginPercent: Math.round(result.margin), profit: Math.round((result.salePrice - p.costPrice) * 100) / 100 };
    }));
  }, [pricingRules]);

  // Filter products
  const filtered = products.filter(p => {
    if (searchQuery && !p.title.toLowerCase().includes(searchQuery.toLowerCase()) && !p.asin.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
    return true;
  });

  // Availability badge
  const availBadge = (a: Product['availability']) => {
    const m: Record<string, { bg: string; text: string; label: string }> = {
      in_stock: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'In Stock' },
      low_stock: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Low Stock' },
      out_of_stock: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Out of Stock' },
      unknown: { bg: 'bg-zinc-500/15', text: 'text-zinc-400', label: 'Unknown' },
    };
    const s = m[a] || m.unknown;
    return <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${s.bg} ${s.text}`}>{s.label}</span>;
  };

  const shopifyBadge = (s: Product['shopifyStatus']) => {
    const m: Record<string, { bg: string; text: string; label: string }> = {
      not_pushed: { bg: 'bg-zinc-500/10', text: 'text-zinc-500', label: 'Not Pushed' },
      active: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Active' },
      draft: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Draft' },
      pending: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', label: 'Pushing...' },
      archived: { bg: 'bg-zinc-500/15', text: 'text-zinc-400', label: 'Archived' },
    };
    const st = m[s] || m.not_pushed;
    return <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${st.bg} ${st.text}`}>{st.label}</span>;
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="min-h-screen p-4 lg:p-6" style={{ background: '#0a0a0f', color: '#fff', fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div className="max-w-[1600px] mx-auto">
        {/* HEADER */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)', boxShadow: '0 8px 20px rgba(6,182,212,0.25)' }}>🎯</div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Product Sourcing Engine</h1>
                <p className="text-sm text-zinc-500">Discover · Price · Push — Zero Friction</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-4 text-xs">
                <span className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700">Today: <strong className="text-cyan-400">{todaySourced}</strong> sourced</span>
                <span className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700">7d: <strong className="text-cyan-400">0</strong></span>
                <span className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700">30d: <strong className="text-cyan-400">0</strong></span>
              </div>
            </div>
          </div>

          {/* KPI BAR */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            {[
              { label: 'Total Products', value: String(totalProducts), color: '#06b6d4' },
              { label: 'Active in Shopify', value: String(activeInShopify), color: '#22c55e' },
              { label: 'Avg Margin', value: `${avgMargin}%`, color: '#8b5cf6' },
              { label: 'Auto Sourcing', value: autoConfig.enabled ? 'ON' : 'OFF', color: autoConfig.enabled ? '#22c55e' : '#ef4444' },
              { label: 'Price Checks', value: priceCheckRunning ? 'Running...' : 'Idle', color: priceCheckRunning ? '#f59e0b' : '#71717a' },
            ].map((k, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                <p className="text-xl font-bold" style={{ color: k.color }}>{k.value}</p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{k.label}</p>
              </div>
            ))}
          </div>

          {/* TAB NAV */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {([
              { id: 'manual' as SubTab, label: '🔍 Manual Sourcing' },
              { id: 'auto' as SubTab, label: '⚡ Auto Sourcing' },
              { id: 'pricing' as SubTab, label: '💰 Pricing Logic' },
              { id: 'bulk' as SubTab, label: '📦 Bulk Import' },
              { id: 'products' as SubTab, label: '📋 Products' },
              { id: 'history' as SubTab, label: '📜 Source History' },
            ]).map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${activeTab === t.id ? 'text-white shadow-lg' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'}`}
                style={activeTab === t.id ? { background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)', boxShadow: '0 4px 12px rgba(139,92,246,0.3)' } : {}}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ====== MANUAL SOURCING ====== */}
        {activeTab === 'manual' && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold flex items-center gap-2">🎯 Sourcing Criteria + Pricing Engine</h3>
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400">Auto Sourcing: {autoConfig.enabled ? 'ON' : 'OFF'}</span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {[
                  { label: 'MIN PRICE ($)', key: 'minPrice' as const, val: criteria.minPrice },
                  { label: 'MAX PRICE ($)', key: 'maxPrice' as const, val: criteria.maxPrice },
                  { label: 'MIN MARGIN (%)', key: 'minMargin' as const, val: criteria.minMargin },
                  { label: 'MIN REVIEWS', key: 'minReviews' as const, val: criteria.minReviews },
                ].map((f, i) => (
                  <div key={i}>
                    <label className="text-[9px] text-zinc-500 uppercase tracking-wider block mb-1">{f.label}</label>
                    <input type="number" value={f.val} onChange={e => setCriteria(prev => ({ ...prev, [f.key]: Number(e.target.value) }))}
                      className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none transition-colors" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="text-[9px] text-zinc-500 uppercase tracking-wider block mb-1">MIN RATING</label>
                  <input type="number" step="0.1" value={criteria.minRating} onChange={e => setCriteria(prev => ({ ...prev, minRating: Number(e.target.value) }))}
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-[9px] text-zinc-500 uppercase tracking-wider block mb-1">MAX BSR</label>
                  <input type="number" value={criteria.maxBsr} onChange={e => setCriteria(prev => ({ ...prev, maxBsr: Number(e.target.value) }))}
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-[9px] text-zinc-500 uppercase tracking-wider block mb-1">PRODUCTS TO SOURCE</label>
                  <select value={criteria.productsToSource} onChange={e => setCriteria(prev => ({ ...prev, productsToSource: Number(e.target.value) }))}
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none">
                    <option value={100}>100</option><option value={500}>500</option><option value={1000}>1,000</option><option value={5000}>5,000</option><option value={10000}>10,000</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <button onClick={() => setCriteria(prev => ({ ...prev, primeOnly: !prev.primeOnly }))}
                    className={`w-11 h-6 rounded-full transition-colors relative ${criteria.primeOnly ? 'bg-cyan-500' : 'bg-zinc-700'}`}>
                    <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${criteria.primeOnly ? 'left-[22px]' : 'left-0.5'}`}></div>
                  </button>
                  <span className="text-sm text-zinc-300">Prime Only</span>
                </div>
              </div>
              <div className="mb-4">
                <label className="text-[9px] text-zinc-500 uppercase tracking-wider block mb-1">EXCLUDED BRANDS (COMMA-SEPARATED)</label>
                <input value={criteria.excludedBrands} onChange={e => setCriteria(prev => ({ ...prev, excludedBrands: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <button onClick={() => setSourcingActive(true)}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all hover:shadow-lg"
                    style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', boxShadow: '0 4px 12px rgba(34,197,94,0.3)' }}>
                    🎯 Preview Products
                  </button>
                  <button className="px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all hover:shadow-lg"
                    style={{ background: 'linear-gradient(135deg, #06b6d4, #0891b2)', boxShadow: '0 4px 12px rgba(6,182,212,0.3)' }}>
                    ⬇️ Import All
                  </button>
                </div>
                <div className="flex gap-2">
                  <button className="px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-zinc-400 hover:text-white">↩️ Reset Defaults</button>
                  <button className="px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-zinc-400 hover:text-white">💾 Save as Cron Settings</button>
                </div>
              </div>
            </div>

            {/* SHOPIFY SYNC BAR */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-4 text-xs">
                <span className="text-zinc-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">🛒 Shopify Sync</span>
                <span className="text-zinc-500">Last sync: —</span>
                <span className="text-zinc-500">·</span>
                <span className="text-emerald-400 font-semibold">{activeInShopify} synced</span>
                <span className="text-zinc-500">·</span>
                <span className="text-red-400">0 failed</span>
                <span className="text-zinc-500">·</span>
                <span className="text-amber-400">{products.filter(p => p.shopifyStatus === 'pending').length} pending</span>
              </div>
              <div className="flex gap-2">
                <button onClick={pushToShopify}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                  ↑ Push All to Shopify
                </button>
                <button className="px-4 py-2 rounded-lg text-xs font-semibold bg-zinc-800 text-cyan-400 border border-cyan-500/30">↓ Pull from Shopify</button>
              </div>
            </div>
          </div>
        )}

        {/* ====== AUTO SOURCING ====== */}
        {activeTab === 'auto' && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-base font-bold">⚡ Automated Product Discovery</h3>
                <button onClick={() => setAutoConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${autoConfig.enabled ? 'text-white' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}
                  style={autoConfig.enabled ? { background: 'linear-gradient(135deg, #22c55e, #16a34a)' } : {}}>
                  {autoConfig.enabled ? '✅ Running' : '⏸️ Paused'}
                </button>
              </div>
              <p className="text-xs text-zinc-500 mb-4">AI discovers profitable products throughout the day using Rainforest + Keepa APIs. Products matching your criteria are auto-added to your pipeline.</p>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div>
                  <label className="text-[9px] text-zinc-500 uppercase tracking-wider block mb-1">CHECK INTERVAL</label>
                  <select value={autoConfig.intervalMinutes} onChange={e => setAutoConfig(prev => ({ ...prev, intervalMinutes: Number(e.target.value) }))}
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none">
                    <option value={15}>Every 15 min</option><option value={30}>Every 30 min</option><option value={60}>Every hour</option><option value={120}>Every 2 hours</option><option value={360}>Every 6 hours</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-zinc-500 uppercase tracking-wider block mb-1">MAX PER DAY</label>
                  <input type="number" value={autoConfig.maxPerDay} onChange={e => setAutoConfig(prev => ({ ...prev, maxPerDay: Number(e.target.value) }))}
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none" />
                </div>
                <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800 text-center">
                  <p className="text-xl font-bold text-cyan-400">{autoConfig.sourcedToday}</p>
                  <p className="text-[9px] text-zinc-500">Sourced Today</p>
                </div>
                <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800 text-center">
                  <p className="text-xl font-bold text-zinc-400">{autoConfig.lastRun ? new Date(autoConfig.lastRun).toLocaleTimeString() : 'Never'}</p>
                  <p className="text-[9px] text-zinc-500">Last Run</p>
                </div>
              </div>

              {/* Discovery schedule visual */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs font-semibold mb-3">📅 Discovery Schedule — Runs Throughout the Day</p>
                <div className="grid grid-cols-6 lg:grid-cols-12 gap-1">
                  {Array.from({ length: 24 }, (_, h) => {
                    const active = autoConfig.enabled && h >= 6 && h <= 23;
                    return (
                      <div key={h} className={`rounded-lg p-1.5 text-center text-[8px] ${active ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400' : 'bg-zinc-900 border border-zinc-800 text-zinc-600'}`}>
                        <p className="font-bold">{h}:00</p>
                        <p>{active ? '✓' : '—'}</p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[9px] text-zinc-500 mt-2">Active: 6 AM – 11 PM · Checks every {autoConfig.intervalMinutes} minutes · Uses Rainforest API for discovery + Keepa for price history</p>
              </div>
            </div>

            {/* API Keys */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h4 className="text-sm font-semibold mb-3">🔑 API Keys</h4>
              <div className="space-y-2">
                {[
                  { key: 'RAINFOREST_API_KEY', label: 'Rainforest API', desc: 'Product search, competitor prices, availability', status: 'set' },
                  { key: 'KEEPA_API_KEY', label: 'Keepa API', desc: 'Price history, BSR tracking, availability trends', status: 'set' },
                  { key: 'SHOPIFY_ACCESS_TOKEN', label: 'Shopify Admin API', desc: 'Product push, inventory sync, metafields', status: 'set' },
                ].map((k, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                    <code className="text-[10px] text-cyan-400 font-mono w-52">{k.key}</code>
                    <div className="flex-1"><p className="text-xs text-white">{k.label}</p><p className="text-[9px] text-zinc-500">{k.desc}</p></div>
                    <span className="text-[8px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">✅ {k.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ====== PRICING LOGIC ====== */}
        {activeTab === 'pricing' && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold">💰 Pricing Rules Engine</h3>
                <button onClick={recalcPrices}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                  🔄 Recalculate All Prices
                </button>
              </div>
              <p className="text-xs text-zinc-500 mb-4">Rules are applied in order from top to bottom. The pricing engine uses these when setting sale_price and compare_at_price before pushing to Shopify.</p>

              <div className="space-y-2">
                {pricingRules.map((rule, i) => (
                  <div key={rule.id} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${rule.enabled ? 'bg-zinc-950 border-cyan-500/20' : 'bg-zinc-950/50 border-zinc-800 opacity-60'}`}>
                    <span className="text-sm font-bold text-zinc-500 w-6">#{i + 1}</span>
                    <button onClick={() => setPricingRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r))}
                      className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${rule.enabled ? 'bg-cyan-500' : 'bg-zinc-700'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${rule.enabled ? 'left-[22px]' : 'left-0.5'}`}></div>
                    </button>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">{rule.name}</p>
                      <p className="text-[10px] text-zinc-500">{rule.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-700 text-cyan-400">
                        {rule.unit === 'dollar' ? `$${rule.value}` : rule.unit === 'percent' ? `${rule.value}%` : `${rule.value}`}
                      </span>
                      <button className="text-[10px] text-zinc-500 hover:text-white px-2 py-1 bg-zinc-800 rounded">Edit</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Price flow diagram */}
              <div className="mt-4 p-4 bg-zinc-950 border border-zinc-800 rounded-xl">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Pricing Flow</p>
                <div className="flex items-center gap-2 text-[10px] flex-wrap">
                  <span className="px-2 py-1 bg-cyan-500/10 rounded text-cyan-400">Cost from supplier</span>
                  <span className="text-zinc-600">→</span>
                  <span className="px-2 py-1 bg-violet-500/10 rounded text-violet-400">Fetch 3 competitor prices</span>
                  <span className="text-zinc-600">→</span>
                  <span className="px-2 py-1 bg-amber-500/10 rounded text-amber-400">Apply rules in order</span>
                  <span className="text-zinc-600">→</span>
                  <span className="px-2 py-1 bg-emerald-500/10 rounded text-emerald-400">sale_price = result</span>
                  <span className="text-zinc-600">→</span>
                  <span className="px-2 py-1 bg-rose-500/10 rounded text-rose-400">compare_at_price = highest competitor</span>
                  <span className="text-zinc-600">→</span>
                  <span className="px-2 py-1 bg-cyan-500/10 rounded text-white font-semibold">Push to Shopify</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====== BULK IMPORT ====== */}
        {activeTab === 'bulk' && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-base font-bold mb-2">📦 Bulk Spreadsheet Import</h3>
              <p className="text-xs text-zinc-500 mb-4">Upload CSV/XLSX with up to 100,000 ASINs or product URLs. The engine checks prices, availability, and profit against your pricing rules before import.</p>

              <div className="border-2 border-dashed border-zinc-700 rounded-2xl p-10 text-center hover:border-cyan-500/50 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <input type="file" ref={fileInputRef} onChange={handleBulkUpload} accept=".csv,.xlsx,.xls,.tsv" className="hidden" />
                <p className="text-3xl mb-2">📤</p>
                <p className="text-sm font-semibold text-zinc-300">Drop your spreadsheet here or click to browse</p>
                <p className="text-[10px] text-zinc-500 mt-1">CSV, XLSX, TSV · Max 100,000 rows · Columns: ASIN or URL (required), Title, Cost (optional)</p>
              </div>

              {/* Expected format */}
              <div className="mt-4 bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs font-semibold mb-2">Expected Columns</p>
                <div className="flex gap-2 flex-wrap">
                  {['ASIN *', 'Title', 'Cost Price', 'Category', 'Supplier URL', 'Notes'].map((col, i) => (
                    <span key={i} className={`text-[9px] px-2 py-1 rounded ${i === 0 ? 'bg-cyan-500/15 text-cyan-400 font-semibold' : 'bg-zinc-800 text-zinc-400'}`}>{col}</span>
                  ))}
                </div>
              </div>

              {/* Pipeline */}
              <div className="mt-4 bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs font-semibold mb-2">Processing Pipeline</p>
                <div className="flex items-center gap-2 text-[10px] flex-wrap">
                  {['Upload file', 'Parse rows', 'Lookup via Rainforest', 'Check availability', 'Fetch competitor prices', 'Apply pricing rules', 'Calculate margins', 'Filter by criteria', 'Add to product list'].map((step, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span className="text-zinc-600">→</span>}
                      <span className="px-2 py-1 bg-zinc-800 rounded text-zinc-300">{step}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>

            {/* Active jobs */}
            {bulkJobs.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <h4 className="text-sm font-semibold mb-3">Import Jobs</h4>
                <div className="space-y-3">
                  {bulkJobs.map(job => (
                    <div key={job.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-white">{job.filename}</p>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full ${job.status === 'complete' ? 'bg-emerald-500/15 text-emerald-400' : job.status === 'error' ? 'bg-red-500/15 text-red-400' : 'bg-cyan-500/15 text-cyan-400'}`}>{job.status}</span>
                      </div>
                      <div className="w-full bg-zinc-800 rounded-full h-2 mb-2">
                        <div className="h-2 rounded-full transition-all" style={{ width: job.totalRows > 0 ? `${(job.processed / job.totalRows) * 100}%` : '0%', background: 'linear-gradient(90deg, #06b6d4, #8b5cf6)' }}></div>
                      </div>
                      <div className="flex gap-4 text-[10px] text-zinc-500">
                        <span>{job.processed}/{job.totalRows} processed</span>
                        <span className="text-emerald-400">{job.matched} matched</span>
                        <span className="text-red-400">{job.failed} failed</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====== PRODUCTS TABLE ====== */}
        {activeTab === 'products' && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 flex items-center gap-3">
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search products or ASIN..."
                className="flex-1 px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none" />
              <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}
                className="px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-300 focus:border-cyan-500 focus:outline-none">
                <option value="all">All Categories</option>
                {['Electronics', 'Home & Kitchen', 'Sports & Outdoors', 'Beauty', 'Toys & Games'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={runPriceCheck} disabled={priceCheckRunning}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                {priceCheckRunning ? '⏳ Checking...' : '🔄 Check Prices'}
              </button>
              <button onClick={pushToShopify}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                ↑ Push Selected
              </button>
            </div>

            {/* Product table */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500 uppercase text-[9px]">
                      <th className="p-3 text-left"><input type="checkbox" checked={selectAll} onChange={toggleSelectAll} className="accent-cyan-500" /></th>
                      <th className="p-3 text-left">Product</th>
                      <th className="p-3 text-right">Cost</th>
                      <th className="p-3 text-right">Sale Price</th>
                      <th className="p-3 text-right">Compare At</th>
                      <th className="p-3 text-right">Profit</th>
                      <th className="p-3 text-right">Margin</th>
                      <th className="p-3 text-center">Competitor 1</th>
                      <th className="p-3 text-center">Competitor 2</th>
                      <th className="p-3 text-center">Competitor 3</th>
                      <th className="p-3 text-center">Stock</th>
                      <th className="p-3 text-center">Shopify</th>
                      <th className="p-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={13} className="p-8 text-center text-zinc-500">No products found. Start sourcing!</td></tr>
                    ) : filtered.map(p => (
                      <tr key={p.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${p.selected ? 'bg-cyan-500/5' : ''}`}>
                        <td className="p-3"><input type="checkbox" checked={p.selected} onChange={() => toggleSelect(p.id)} className="accent-cyan-500" /></td>
                        <td className="p-3 max-w-[200px]">
                          <p className="text-white font-medium truncate">{p.title}</p>
                          <p className="text-[9px] text-zinc-500">{p.asin} · ⭐ {p.rating} ({p.reviews.toLocaleString()}) · BSR #{p.bsr.toLocaleString()}</p>
                        </td>
                        <td className="p-3 text-right font-mono text-zinc-400">${p.costPrice.toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-emerald-400 font-semibold">${p.salePrice.toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-zinc-500 line-through">${p.compareAtPrice.toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-emerald-400">${p.profit.toFixed(2)}</td>
                        <td className="p-3 text-right"><span className={`font-semibold ${p.marginPercent >= 50 ? 'text-emerald-400' : p.marginPercent >= 30 ? 'text-amber-400' : 'text-red-400'}`}>{p.marginPercent}%</span></td>
                        <td className="p-3 text-center font-mono text-xs">{p.competitor1.name}<br /><span className="text-zinc-300">${p.competitor1.price.toFixed(2)}</span></td>
                        <td className="p-3 text-center font-mono text-xs">{p.competitor2.name}<br /><span className="text-zinc-300">${p.competitor2.price.toFixed(2)}</span></td>
                        <td className="p-3 text-center font-mono text-xs">{p.competitor3.name}<br /><span className="text-zinc-300">${p.competitor3.price.toFixed(2)}</span></td>
                        <td className="p-3 text-center">{availBadge(p.availability)}</td>
                        <td className="p-3 text-center">{shopifyBadge(p.shopifyStatus)}</td>
                        <td className="p-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button className="text-[9px] px-2 py-1 bg-zinc-800 text-zinc-400 rounded hover:text-white">🔄</button>
                            <button className="text-[9px] px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded hover:bg-emerald-500/20">↑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ====== HISTORY ====== */}
        {activeTab === 'history' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <h3 className="text-base font-bold mb-4">📜 Sourcing History</h3>
            <div className="space-y-2">
              {[
                { time: '10:15 AM', action: 'Manual source: 3 products imported', type: 'manual' },
                { time: '9:00 AM', action: 'Price check: 316 products updated', type: 'price' },
                { time: '8:30 AM', action: 'Auto source: 12 new products found', type: 'auto' },
                { time: '6:00 AM', action: 'Daily price sync completed', type: 'price' },
                { time: '2:00 AM', action: 'Feed rebuilt with updated prices', type: 'feed' },
              ].map((h, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                  <span className="text-[10px] font-mono text-zinc-500 w-16">{h.time}</span>
                  <span className={`text-[8px] px-2 py-0.5 rounded-full uppercase font-bold ${
                    h.type === 'manual' ? 'bg-cyan-500/15 text-cyan-400' :
                    h.type === 'auto' ? 'bg-violet-500/15 text-violet-400' :
                    h.type === 'price' ? 'bg-amber-500/15 text-amber-400' :
                    'bg-emerald-500/15 text-emerald-400'
                  }`}>{h.type}</span>
                  <span className="text-xs text-zinc-300">{h.action}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
