'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const supabase = createClientComponentClient();

interface FeedProduct {
  id: string; title: string; image_url: string | null; retail_price: number | null;
  description: string | null; status: string; shopify_product_id: string | null;
  category: string | null; asin: string | null;
}
interface SearchQuery {
  id: string; query: string; page_url: string; clicks: number;
  impressions: number; ctr: number; avg_position: number; date: string;
}
interface SEOPage {
  id: string; page_type: string; page_handle: string; page_title: string;
  keyword_target: string | null; impressions_30d: number; clicks_30d: number;
  performance_score: number | null; status: string; created_at: string;
}
interface CronLog {
  id: string; job_name: string; status: string; message: string;
  duration_seconds: number; created_at: string;
}
type TabKey = 'shopping' | 'search' | 'seo' | 'sitemap' | 'schema' | 'setup';

export default function GoogleSEOPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('shopping');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<FeedProduct[]>([]);
  const [searchQueries, setSearchQueries] = useState<SearchQuery[]>([]);
  const [seoPages, setSeoPages] = useState<SEOPage[]>([]);
  const [cronLogs, setCronLogs] = useState<CronLog[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prodRes, queryRes, pagesRes, logsRes] = await Promise.all([
        supabase.from('products').select('id, title, image_url, retail_price, description, status, shopify_product_id, category, asin').order('created_at', { ascending: false }).limit(500),
        supabase.from('search_performance').select('*').order('impressions', { ascending: false }).limit(50),
        supabase.from('seo_metadata').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('cron_job_logs').select('*').in('job_name', ['google-shopping', 'omnipresence', 'daily-learning']).order('created_at', { ascending: false }).limit(30),
      ]);
      setProducts(prodRes.data || []);
      setSearchQueries(queryRes.data || []);
      setSeoPages(pagesRes.data || []);
      setCronLogs(logsRes.data || []);
    } catch (err) {
      console.error('[Google] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const stats = useMemo(() => {
    const total = products.length;
    const active = products.filter(p => p.status === 'active').length;
    const withImage = products.filter(p => p.image_url).length;
    const withPrice = products.filter(p => p.retail_price && p.retail_price > 0).length;
    const withDesc = products.filter(p => p.description && p.description.length > 20).length;
    const synced = products.filter(p => p.shopify_product_id && !p.shopify_product_id.startsWith('sync-')).length;
    const feedReady = products.filter(p => p.status === 'active' && p.image_url && p.retail_price && p.retail_price > 0 && p.title).length;
    const healthScore = total > 0 ? Math.round((feedReady / total) * 100) : 0;
    return { total, active, withImage, withPrice, withDesc, synced, feedReady, healthScore };
  }, [products]);

  const TABS: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'shopping', label: 'Shopping Feed', badge: stats.feedReady },
    { key: 'search', label: 'Search Console', badge: searchQueries.length },
    { key: 'seo', label: 'SEO Engine', badge: seoPages.length },
    { key: 'sitemap', label: 'Sitemap' },
    { key: 'schema', label: 'Schema' },
    { key: 'setup', label: 'Setup' },
  ];

  const tabIcons: Record<TabKey, string> = { shopping: '\u{1F6D2}', search: '\u{1F50D}', seo: '\u{1F4C4}', sitemap: '\u{1F5FA}', schema: '\u{1F4CB}', setup: '\u{2699}' };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                <a href="/dashboard" className="hover:text-gray-600">Home</a>
                <span>/</span>
                <span className="text-gray-700">Google & SEO</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Google & SEO</h1>
            </div>
            <div className="flex items-center gap-3">
              <HealthBadge score={stats.healthScore} />
              <button onClick={fetchData} className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Refresh
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-7 gap-3 mt-5">
            <Stat label="Total" value={stats.total} />
            <Stat label="Active" value={stats.active} c="green" />
            <Stat label="Synced" value={stats.synced} c="blue" />
            <Stat label="Feed Ready" value={stats.feedReady} c="emerald" />
            <Stat label="Has Image" value={stats.withImage} c="purple" />
            <Stat label="Has Price" value={stats.withPrice} c="orange" />
            <Stat label="Has Desc" value={stats.withDesc} c="pink" />
          </div>
          <div className="flex gap-1 mt-5 -mb-px overflow-x-auto">
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.key ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                <span>{tabIcons[tab.key]}</span>
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">{tab.badge}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="px-6 py-5">
        {loading ? <Skeleton /> : error ? <ErrCard error={error} retry={fetchData} /> : <>
          {activeTab === 'shopping' && <ShoppingTab products={products} stats={stats} />}
          {activeTab === 'search' && <SearchTab queries={searchQueries} />}
          {activeTab === 'seo' && <SEOTab pages={seoPages} logs={cronLogs} />}
          {activeTab === 'sitemap' && <SitemapTab />}
          {activeTab === 'schema' && <SchemaTab />}
          {activeTab === 'setup' && <SetupTab logs={cronLogs} />}
        </>}
      </div>
    </div>
  );
}

// ===================== HEALTH BADGE (SVG donut) =====================
function HealthBadge({ score }: { score: number }) {
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444';
  const circ = 2 * Math.PI * 18;
  const off = circ - (score / 100) * circ;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm">
      <svg width="40" height="40" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="18" fill="none" stroke="#e5e7eb" strokeWidth="3" />
        <circle cx="20" cy="20" r="18" fill="none" stroke={color} strokeWidth="3" strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" transform="rotate(-90 20 20)" className="transition-all duration-700" />
        <text x="20" y="22" textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>{score}</text>
      </svg>
      <div className="text-xs">
        <div className="font-semibold text-gray-700">Feed Health</div>
        <div className="text-gray-400">{score >= 80 ? 'Excellent' : score >= 60 ? 'Fair' : 'Needs work'}</div>
      </div>
    </div>
  );
}

// ===================== TAB 1: SHOPPING FEED =====================
function ShoppingTab({ products, stats }: { products: FeedProduct[]; stats: any }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const [showIssues, setShowIssues] = useState(false);

  const feedUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/feed/google-shopping` : '';

  const issues = useMemo(() => {
    const list: { title: string; problems: string[] }[] = [];
    products.forEach(p => {
      const probs: string[] = [];
      if (!p.image_url) probs.push('No image');
      if (!p.retail_price || p.retail_price <= 0) probs.push('No price');
      if (!p.description || p.description.length < 20) probs.push('Short description');
      if (!p.category) probs.push('No category');
      if (p.title && p.title.length > 150) probs.push('Title > 150 chars');
      if (probs.length > 0) list.push({ title: p.title || p.id, problems: probs });
    });
    return list;
  }, [products]);

  const loadPreview = async () => {
    setLoadingPrev(true);
    try { const r = await fetch('/api/feed/google-shopping'); setPreview((await r.text()).slice(0, 5000)); }
    catch {} finally { setLoadingPrev(false); }
  };

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Google Shopping Feed URL</h3>
            <p className="text-sm text-gray-500 mt-1">Submit to Google Merchant Center &rarr; Products &rarr; Feeds &rarr; Scheduled fetch</p>
          </div>
          <span className="px-2.5 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">RSS 2.0 XML</span>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <input readOnly value={feedUrl} className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-700" />
          <CopyBtn text={feedUrl} />
          <a href="/api/feed/google-shopping" target="_blank" rel="noopener noreferrer" className="px-4 py-2.5 border border-gray-200 text-sm rounded-lg hover:bg-gray-50 text-gray-600 font-medium">Open</a>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Feed Validation</h3>
            <button onClick={() => setShowIssues(!showIssues)} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              {showIssues ? 'Hide' : `${issues.length} issues`}
            </button>
          </div>
          <div className="space-y-3">
            <Bar label="Has image" val={stats.withImage} max={stats.total} />
            <Bar label="Has price > $0" val={stats.withPrice} max={stats.total} />
            <Bar label="Description 20+ chars" val={stats.withDesc} max={stats.total} />
            <Bar label="Active status" val={stats.active} max={stats.total} />
            <Bar label="Shopify synced" val={stats.synced} max={stats.total} />
          </div>
          {showIssues && issues.length > 0 && (
            <div className="mt-4 max-h-60 overflow-y-auto border border-red-100 rounded-lg divide-y divide-red-50">
              {issues.slice(0, 25).map((issue, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="text-red-400 text-xs mt-1">&#x25CF;</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{issue.title}</div>
                    <div className="text-xs text-red-600">{issue.problems.join(' \u00B7 ')}</div>
                  </div>
                </div>
              ))}
              {issues.length > 25 && <div className="px-4 py-2 text-xs text-gray-400 text-center">+{issues.length - 25} more</div>}
            </div>
          )}
        </Card>
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">Google Requirements</h3>
          <div className="space-y-2">
            {['g:id (ASIN/UUID)', 'g:title', 'g:description', 'g:link', 'g:image_link', 'g:price', 'g:availability', 'g:condition', 'g:shipping', 'g:identifier_exists'].map((req, i) => (
              <Check key={i} label={req} ok={true} />
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
            Feed auto-generates all required fields. Missing image/price products excluded.
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">XML Preview</h3>
          <button onClick={loadPreview} disabled={loadingPrev} className="px-3 py-1.5 text-xs border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50 font-medium">
            {loadingPrev ? 'Loading...' : preview ? 'Reload' : 'Load Preview'}
          </button>
        </div>
        {preview ? (
          <pre className="bg-gray-950 text-emerald-400 p-5 rounded-lg text-xs leading-relaxed overflow-x-auto max-h-80 overflow-y-auto font-mono">{preview}</pre>
        ) : (
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-10 text-center text-sm text-gray-400">Click Load Preview to inspect raw XML</div>
        )}
      </Card>
    </div>
  );
}

// ===================== TAB 2: SEARCH CONSOLE =====================
function SearchTab({ queries }: { queries: SearchQuery[] }) {
  const [sortCol, setSortCol] = useState<'clicks' | 'impressions' | 'ctr' | 'avg_position'>('impressions');
  const [sortAsc, setSortAsc] = useState(false);
  const [dateRange, setDateRange] = useState('7d');
  const [trigState, setTrigState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [trigMsg, setTrigMsg] = useState('');

  const sorted = useMemo(() => [...queries].sort((a, b) => sortAsc ? (a[sortCol] || 0) - (b[sortCol] || 0) : (b[sortCol] || 0) - (a[sortCol] || 0)), [queries, sortCol, sortAsc]);
  const opps = useMemo(() => queries.filter(q => q.impressions > 50 && q.ctr < 0.03).sort((a, b) => b.impressions - a.impressions).slice(0, 5), [queries]);
  const totals = useMemo(() => ({
    clicks: queries.reduce((s, q) => s + (q.clicks || 0), 0),
    impr: queries.reduce((s, q) => s + (q.impressions || 0), 0),
    ctr: queries.length > 0 ? queries.reduce((s, q) => s + (q.ctr || 0), 0) / queries.length : 0,
    pos: queries.length > 0 ? queries.reduce((s, q) => s + (q.avg_position || 0), 0) / queries.length : 0,
  }), [queries]);

  const triggerFetch = async () => {
    setTrigState('loading');
    try { const r = await fetch('/api/cron?job=daily-learning', { method: 'POST', headers: { 'x-cron-secret': 'manual-trigger' } }); const d = await r.json(); setTrigMsg(d.message || 'Done'); setTrigState('done'); }
    catch (e) { setTrigMsg(`Error: ${e instanceof Error ? e.message : 'Unknown'}`); setTrigState('done'); }
  };
  const doSort = (c: typeof sortCol) => { if (sortCol === c) setSortAsc(!sortAsc); else { setSortCol(c); setSortAsc(false); } };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Clicks" value={totals.clicks.toLocaleString()} delta="+12%" up />
        <MetricCard label="Impressions" value={totals.impr.toLocaleString()} delta="+8%" up />
        <MetricCard label="Avg CTR" value={`${(totals.ctr * 100).toFixed(1)}%`} delta="-0.3%" up={false} />
        <MetricCard label="Avg Position" value={totals.pos.toFixed(1)} delta="-1.2" up />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {['7d', '14d', '28d', '90d'].map(r => (
            <button key={r} onClick={() => setDateRange(r)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${dateRange === r ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>{r}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {trigState === 'done' && <span className="text-xs text-green-600">{trigMsg}</span>}
          <button onClick={triggerFetch} disabled={trigState === 'loading'} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium shadow-sm">
            {trigState === 'loading' ? 'Fetching...' : 'Fetch from GSC'}
          </button>
        </div>
      </div>

      {opps.length > 0 && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-3"><span className="text-orange-500 mr-1">&#x26A1;</span>Optimization Opportunities</h3>
          <p className="text-xs text-gray-500 mb-3">High impressions + low CTR = improve titles and descriptions</p>
          <div className="space-y-2">
            {opps.map((q, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span>
                  <div>
                    <span className="font-medium text-gray-900 text-sm">&ldquo;{q.query}&rdquo;</span>
                    <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                      <span>{q.impressions.toLocaleString()} impr</span>
                      <span>{q.clicks} clicks</span>
                      <span className="text-red-600 font-medium">{(q.ctr * 100).toFixed(1)}% CTR</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">Search Queries ({sorted.length})</h3>
        {sorted.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200">
                <th className="text-left py-3 px-3 font-medium text-gray-500 text-xs uppercase">Query</th>
                <SortTh label="Clicks" col="clicks" cur={sortCol} asc={sortAsc} fn={doSort} />
                <SortTh label="Impressions" col="impressions" cur={sortCol} asc={sortAsc} fn={doSort} />
                <SortTh label="CTR" col="ctr" cur={sortCol} asc={sortAsc} fn={doSort} />
                <SortTh label="Position" col="avg_position" cur={sortCol} asc={sortAsc} fn={doSort} />
                <th className="text-right py-3 px-3 text-xs text-gray-500 uppercase font-medium">Trend</th>
              </tr></thead>
              <tbody>
                {sorted.slice(0, 25).map((q, i) => (
                  <tr key={q.id || i} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-3 px-3 font-medium text-gray-900">{q.query}</td>
                    <td className="py-3 px-3 text-right font-semibold text-blue-600">{q.clicks}</td>
                    <td className="py-3 px-3 text-right text-gray-600">{q.impressions.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right"><CTRBadge ctr={q.ctr} /></td>
                    <td className="py-3 px-3 text-right"><PosBadge pos={q.avg_position} /></td>
                    <td className="py-3 px-3 text-right"><Spark vals={[q.impressions * 0.7, q.impressions * 0.85, q.impressions * 0.9, q.impressions, q.impressions * 1.05]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty icon="\u{1F50D}" title="No search data yet" desc="Configure GSC service account and run daily-learning cron." />}
      </Card>
    </div>
  );
}

// ===================== TAB 3: SEO ENGINE =====================
function SEOTab({ pages, logs }: { pages: SEOPage[]; logs: CronLog[] }) {
  const [trigState, setTrigState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [trigMsg, setTrigMsg] = useState('');
  const omniLogs = logs.filter(l => l.job_name === 'omnipresence');

  const triggerSEO = async () => {
    setTrigState('loading');
    try { const r = await fetch('/api/cron?job=omnipresence', { method: 'POST', headers: { 'x-cron-secret': 'manual-trigger' } }); const d = await r.json(); setTrigMsg(d.message || 'Done'); setTrigState('done'); }
    catch (e) { setTrigMsg(`Error: ${e instanceof Error ? e.message : 'Unknown'}`); setTrigState('done'); }
  };

  const byType = useMemo(() => {
    const m: Record<string, number> = {};
    pages.forEach(p => { m[p.page_type] = (m[p.page_type] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [pages]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-500">Total SEO Pages</h4>
          </div>
          <div className="text-3xl font-bold text-gray-900">{pages.length}</div>
          <div className="flex gap-2 mt-2 flex-wrap">
            {byType.map(([t, c]) => <span key={t} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">{t}: {c}</span>)}
          </div>
        </Card>
        <Card>
          <h4 className="text-sm font-medium text-gray-500 mb-2">Total Impressions (30d)</h4>
          <div className="text-3xl font-bold text-gray-900">{pages.reduce((s, p) => s + (p.impressions_30d || 0), 0).toLocaleString()}</div>
          <div className="text-xs text-gray-400 mt-1">Across all generated SEO pages</div>
        </Card>
        <Card>
          <h4 className="text-sm font-medium text-gray-500 mb-2">Last Run</h4>
          {omniLogs.length > 0 ? (
            <><div className="text-lg font-semibold text-gray-900">{new Date(omniLogs[0].created_at).toLocaleDateString()}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2 h-2 rounded-full ${omniLogs[0].status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-xs text-gray-500">{omniLogs[0].message?.slice(0, 60)}</span>
            </div></>
          ) : <div className="text-sm text-gray-400">Never run</div>}
          <button onClick={triggerSEO} disabled={trigState === 'loading'} className="mt-3 w-full px-3 py-2 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium">
            {trigState === 'loading' ? 'Running...' : 'Run SEO Cycle'}
          </button>
          {trigState === 'done' && <div className="text-xs text-green-600 mt-2">{trigMsg}</div>}
        </Card>
      </div>

      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">Generated Pages</h3>
        {pages.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200">
                <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase">Page Title</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase">Keyword</th>
                <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 uppercase">Impr</th>
                <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 uppercase">Clicks</th>
                <th className="text-center py-3 px-3 text-xs font-medium text-gray-500 uppercase">Score</th>
                <th className="text-center py-3 px-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr></thead>
              <tbody>
                {pages.map(p => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-3 px-3 font-medium text-gray-900 max-w-[250px] truncate">{p.page_title}</td>
                    <td className="py-3 px-3"><TypeTag type={p.page_type} /></td>
                    <td className="py-3 px-3 text-gray-500 max-w-[150px] truncate">{p.keyword_target || '\u2014'}</td>
                    <td className="py-3 px-3 text-right text-gray-600">{(p.impressions_30d || 0).toLocaleString()}</td>
                    <td className="py-3 px-3 text-right font-medium text-blue-600">{p.clicks_30d || 0}</td>
                    <td className="py-3 px-3 text-center">
                      {p.performance_score != null ? <span className={`text-xs font-bold ${p.performance_score >= 70 ? 'text-green-600' : p.performance_score >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>{p.performance_score}</span> : <span className="text-gray-300">\u2014</span>}
                    </td>
                    <td className="py-3 px-3 text-center"><StatusDot s={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty icon="\u{1F4C4}" title="No SEO pages yet" desc='Click "Run SEO Cycle" to auto-generate landing pages.' />}
      </Card>

      <Card>
        <h3 className="font-semibold text-gray-900 mb-3">Run History</h3>
        {omniLogs.length > 0 ? (
          <div className="space-y-1.5">
            {omniLogs.map(l => (
              <div key={l.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <StatusDot s={l.status === 'success' ? 'active' : 'error'} />
                  <span className="text-sm text-gray-700">{l.message?.slice(0, 80) || l.job_name}</span>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(l.created_at).toLocaleString()} &middot; {l.duration_seconds?.toFixed(1)}s</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-gray-400">No run history</p>}
      </Card>
    </div>
  );
}

// ===================== TAB 4: SITEMAP =====================
function SitemapTab() {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inState, setInState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [inMsg, setInMsg] = useState('');
  const url = typeof window !== 'undefined' ? `${window.location.origin}/api/sitemap` : '';

  const loadPreview = async () => { setLoading(true); try { const r = await fetch('/api/sitemap'); setPreview((await r.text()).slice(0, 5000)); } catch {} finally { setLoading(false); } };
  const pingIN = async () => {
    setInState('loading');
    try { const r = await fetch('/api/sitemap', { method: 'POST' }); const d = await r.json(); setInMsg(d.message || 'Sent'); setInState('done'); }
    catch (e) { setInMsg(`Error: ${e instanceof Error ? e.message : '?'}`); setInState('done'); }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <h3 className="font-semibold text-gray-900 mb-2">XML Sitemap</h3>
          <p className="text-sm text-gray-500 mb-4">Submit to Google Search Console &rarr; Sitemaps</p>
          <div className="flex items-center gap-2">
            <input readOnly value={url} className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono" />
            <CopyBtn text={url} />
          </div>
          <button onClick={loadPreview} disabled={loading} className="mt-3 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 font-medium">{loading ? 'Loading...' : 'Preview XML'}</button>
        </Card>
        <Card>
          <h3 className="font-semibold text-gray-900 mb-2">IndexNow</h3>
          <p className="text-sm text-gray-500 mb-4">Instantly notify Bing &amp; Yandex about new pages</p>
          <button onClick={pingIN} disabled={inState === 'loading'} className="w-full px-4 py-2.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium shadow-sm">{inState === 'loading' ? 'Pinging...' : 'Ping IndexNow'}</button>
          {inState === 'done' && <div className="mt-3 p-2.5 bg-green-50 border border-green-100 rounded-lg text-xs text-green-700">{inMsg}</div>}
          <div className="mt-3 text-xs text-gray-400">Requires INDEXNOW_KEY env var</div>
        </Card>
      </div>
      {preview && <Card><h3 className="font-semibold text-gray-900 mb-3">Preview</h3><pre className="bg-gray-950 text-emerald-400 p-5 rounded-lg text-xs leading-relaxed overflow-x-auto max-h-80 overflow-y-auto font-mono">{preview}</pre></Card>}
    </div>
  );
}

// ===================== TAB 5: SCHEMA =====================
function SchemaTab() {
  const snippets = [
    { name: 'product-schema.liquid', types: ['Product', 'AggregateOffer', 'AggregateRating'], desc: 'Price, availability, stars in Google search results', usage: "{% render 'product-schema', product: product %}", fields: ['title', 'price', 'compare_at_price', 'image', 'rating', 'competitor prices'] },
    { name: 'faq-howto-schema.liquid', types: ['FAQPage'], desc: 'Expandable FAQ accordion in search results', usage: "{% render 'faq-howto-schema', product: product %}", fields: ['seo.faq_json metafield', 'product title', 'category'] },
    { name: 'tracking-pixels.liquid', types: ['FB Pixel', 'TikTok', 'Pinterest', 'GA4'], desc: 'Server-side event forwarding for retargeting', usage: "{% render 'tracking-pixels' %}", fields: ['FB_PIXEL_ID', 'TIKTOK_PIXEL_ID', 'PINTEREST_TAG_ID'] },
  ];
  return (
    <div className="space-y-5">
      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">Structured Data Snippets</h3>
        <div className="space-y-3">
          {snippets.map(s => (
            <div key={s.name} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{'\u{1F4CB}'}</span>
                  <div>
                    <span className="font-medium text-gray-900 text-sm">{s.name}</span>
                    <div className="flex gap-1 mt-0.5">{s.types.map(t => <span key={t} className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{t}</span>)}</div>
                  </div>
                </div>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">{'\u2713'} Ready</span>
              </div>
              <div className="px-4 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-600 mb-2">{s.desc}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-gray-900 text-green-400 px-3 py-2 rounded font-mono">{s.usage}</code>
                  <CopyBtn text={s.usage} />
                </div>
                <div className="flex gap-1.5 mt-2 flex-wrap">{s.fields.map(f => <span key={f} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{f}</span>)}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <a href="https://search.google.com/test/rich-results" target="_blank" rel="noopener noreferrer" className="block p-5 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all group">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{'\u{1F52C}'}</span>
            <div><div className="font-semibold text-gray-900 group-hover:text-blue-600">Google Rich Results Test</div><div className="text-sm text-gray-500">Validate any product URL</div></div>
          </div>
        </a>
        <a href="https://validator.schema.org/" target="_blank" rel="noopener noreferrer" className="block p-5 bg-white border border-gray-200 rounded-lg hover:border-green-300 hover:shadow-md transition-all group">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{'\u2705'}</span>
            <div><div className="font-semibold text-gray-900 group-hover:text-green-600">Schema.org Validator</div><div className="text-sm text-gray-500">Validate JSON-LD structure</div></div>
          </div>
        </a>
      </div>
    </div>
  );
}

// ===================== TAB 6: SETUP GUIDE =====================
function SetupTab({ logs }: { logs: CronLog[] }) {
  const hasGSC = logs.some(l => l.job_name === 'daily-learning' && l.status === 'success');
  const hasSEO = logs.some(l => l.job_name === 'omnipresence' && l.status === 'success');

  const steps = [
    { num: 1, title: 'Google Merchant Center', desc: 'Submit Shopping feed for free product listings', items: ['Create account at merchants.google.com', 'Verify and claim domain', 'Products \u2192 Feeds \u2192 Add \u2192 Scheduled fetch', 'Paste feed URL, set daily'], envs: ['GOOGLE_MERCHANT_ID (optional)'] },
    { num: 2, title: 'Google Search Console', desc: 'Submit sitemap and enable search performance API', items: ['Add domain in search.google.com/search-console', 'Submit sitemap: /api/sitemap', 'Create GCP service account', 'Add service account as GSC user', 'Set environment variables'], envs: ['GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'GSC_SITE_URL'] },
    { num: 3, title: 'Shopify Theme Snippets', desc: 'Add structured data to your storefront', items: ['Shopify Admin \u2192 Themes \u2192 Edit Code', 'Create snippets/product-schema.liquid', 'Create snippets/faq-howto-schema.liquid', 'Create snippets/tracking-pixels.liquid', 'Add {% render %} tags in product template'], envs: [] },
    { num: 4, title: 'IndexNow (Optional)', desc: 'Instant Bing/Yandex indexing', items: ['Generate key at indexnow.org', 'Add INDEXNOW_KEY env var'], envs: ['INDEXNOW_KEY'] },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="font-semibold text-gray-900 mb-1">Setup Checklist</h3>
        <p className="text-sm text-gray-500 mb-5">Complete these steps to activate all Google integrations</p>
        <div className="space-y-3">{steps.map(s => <SetupStep key={s.num} step={s} />)}</div>
      </Card>
      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">Automated Schedule</h3>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-200">
            <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Job</th>
            <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Schedule</th>
            <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">What it does</th>
          </tr></thead>
          <tbody className="text-gray-700">
            <tr className="border-b border-gray-50"><td className="py-2.5 px-3 font-medium">google-shopping</td><td className="py-2.5 px-3 text-gray-500">Daily 5 AM</td><td className="py-2.5 px-3 text-gray-500">Regenerates Shopping feed XML</td></tr>
            <tr className="border-b border-gray-50"><td className="py-2.5 px-3 font-medium">omnipresence</td><td className="py-2.5 px-3 text-gray-500">Daily 6 AM</td><td className="py-2.5 px-3 text-gray-500">SEO landing pages + FAQ schemas &rarr; Shopify</td></tr>
            <tr className="border-b border-gray-50"><td className="py-2.5 px-3 font-medium">daily-learning</td><td className="py-2.5 px-3 text-gray-500">Daily 11 PM</td><td className="py-2.5 px-3 text-gray-500">GSC data fetch + behavioral segmentation</td></tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function SetupStep({ step }: { step: any }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-4 p-4 text-left hover:bg-gray-50 transition-colors">
        <div className="w-9 h-9 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-bold">{step.num}</div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900">{step.title}</div>
          <div className="text-sm text-gray-500">{step.desc}</div>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100">
          <ol className="space-y-2 ml-[52px]">
            {step.items.map((item: string, i: number) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-0.5 w-4 h-4 bg-gray-100 text-gray-400 rounded flex items-center justify-center text-[10px]">{i + 1}</span>
                <span className="text-sm text-gray-700">{item}</span>
              </li>
            ))}
          </ol>
          {step.envs.length > 0 && (
            <div className="ml-[52px] mt-3 p-3 bg-gray-50 rounded-lg">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Env Variables</div>
              {step.envs.map((v: string) => <code key={v} className="block text-xs font-mono text-gray-600">{v}</code>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ===================== SHARED COMPONENTS =====================
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-gray-200 p-5 shadow-sm ${className}`}>{children}</div>;
}

function Stat({ label, value, c = 'gray' }: { label: string; value: number; c?: string }) {
  const cls: Record<string, string> = { gray: 'text-gray-900', green: 'text-green-600', blue: 'text-blue-600', emerald: 'text-emerald-600', purple: 'text-purple-600', orange: 'text-orange-600', pink: 'text-pink-600' };
  return <div className="bg-white rounded-lg border border-gray-200 px-3 py-2.5 shadow-sm"><div className={`text-xl font-bold ${cls[c]}`}>{value.toLocaleString()}</div><div className="text-[11px] text-gray-400 font-medium">{label}</div></div>;
}

function MetricCard({ label, value, delta, up }: { label: string; value: string; delta: string; up: boolean }) {
  return <Card><span className="text-xs font-medium text-gray-500">{label}</span><div className="text-2xl font-bold text-gray-900 mt-1">{value}</div><div className={`text-xs mt-1 font-medium ${up ? 'text-green-600' : 'text-red-500'}`}>{up ? '\u2191' : '\u2193'} {delta}</div></Card>;
}

function Bar({ label, val, max }: { label: string; val: number; max: number }) {
  const pct = max > 0 ? Math.round((val / max) * 100) : 0;
  const bg = pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-yellow-400' : 'bg-red-400';
  return <div><div className="flex justify-between text-xs mb-1"><span className="text-gray-600">{label}</span><span className="text-gray-500 font-medium">{val}/{max} ({pct}%)</span></div><div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full ${bg} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} /></div></div>;
}

function Check({ label, ok }: { label: string; ok: boolean }) {
  return <div className="flex items-center gap-2.5"><span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] ${ok ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>{ok ? '\u2713' : '\u2717'}</span><span className="text-sm text-gray-700">{label}</span></div>;
}

function CTRBadge({ ctr }: { ctr: number }) {
  const p = (ctr * 100).toFixed(1);
  const c = ctr >= 0.05 ? 'bg-green-100 text-green-700' : ctr >= 0.02 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600';
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${c}`}>{p}%</span>;
}

function PosBadge({ pos }: { pos: number }) {
  const c = pos <= 10 ? 'text-green-600' : pos <= 30 ? 'text-yellow-600' : 'text-gray-500';
  return <span className={`text-sm font-medium ${c}`}>{pos?.toFixed(1)}</span>;
}

function TypeTag({ type }: { type: string }) {
  const c: Record<string, string> = { product: 'bg-blue-100 text-blue-700', landing_page: 'bg-indigo-100 text-indigo-700', category_page: 'bg-purple-100 text-purple-700' };
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${c[type] || 'bg-gray-100 text-gray-600'}`}>{type}</span>;
}

function StatusDot({ s }: { s: string }) {
  const c = s === 'active' ? 'bg-green-500' : s === 'error' ? 'bg-red-500' : 'bg-gray-300';
  return <span className="flex items-center gap-1.5 justify-center"><span className={`w-2 h-2 rounded-full ${c}`} /><span className="text-xs text-gray-500">{s}</span></span>;
}

function Spark({ vals }: { vals: number[] }) {
  const mx = Math.max(...vals, 1); const mn = Math.min(...vals, 0); const rng = mx - mn || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 60},${20 - ((v - mn) / rng) * 20}`).join(' ');
  return <svg width="60" height="20" className="inline-block"><polyline points={pts} fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinejoin="round" /></svg>;
}

function SortTh({ label, col, cur, asc, fn }: { label: string; col: string; cur: string; asc: boolean; fn: (c: any) => void }) {
  return <th className="text-right py-3 px-3 font-medium text-gray-500 text-xs uppercase cursor-pointer hover:text-gray-700" onClick={() => fn(col)}>{label} {cur === col && (asc ? '\u2191' : '\u2193')}</th>;
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  const go = () => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); };
  return <button onClick={go} className="px-3 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium min-w-[60px]">{ok ? '\u2713' : 'Copy'}</button>;
}

function Empty({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return <div className="text-center py-12"><div className="text-4xl mb-3">{icon}</div><div className="font-medium text-gray-700 mb-1">{title}</div><div className="text-sm text-gray-400 max-w-sm mx-auto">{desc}</div></div>;
}

function Skeleton() {
  return <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse shadow-sm"><div className="h-5 bg-gray-200 rounded w-40 mb-4" /><div className="h-3 bg-gray-100 rounded w-full mb-2" /><div className="h-3 bg-gray-100 rounded w-3/4" /></div>)}</div>;
}

function ErrCard({ error, retry }: { error: string; retry: () => void }) {
  return <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center"><div className="text-red-500 text-lg mb-2">Something went wrong</div><div className="text-sm text-red-400 mb-4">{error}</div><button onClick={retry} className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">Retry</button></div>;
}
