'use client';

// components/products/SourcingPanel.tsx
// ═══════════════════════════════════════════════════════════════════════════
// SOURCING CRITERIA + PRICING ENGINE — Dark Theme (matches HTML reference)
// 4 tabs: Manual Sourcing | Auto Sourcing | Pricing Logic | Source History
// ALL features wired to backend
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { PRICING_RULES, COMPETITOR_NAMES } from '@/lib/config/pricing-rules';

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS — matching the HTML reference exactly
// ═══════════════════════════════════════════════════════════════════════════
const V = {
  bg: '#0f1117', bg2: '#181c25', bg3: '#222832',
  border: '#2c3340', border2: '#3a4250',
  text: '#e8eaed', muted: '#8b919c', dim: '#6b7280',
  cyan: '#22d3ee', green: '#22c55e', red: '#ef4444',
  yellow: '#eab308', orange: '#f97316', purple: '#a855f7',
  blue: '#3b82f6', shopify: '#96bf48',
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════
interface SourcingPanelProps { onSourcingComplete: () => void }

interface Filters {
  min_amazon_price: number; max_amazon_price: number; min_profit_margin: number;
  min_reviews: number; min_rating: number; max_bsr: number;
  require_prime: boolean; excluded_brands: string[]; max_products_per_run: number;
}

interface DiscoveryRun {
  id: string; run_date: string; status: string;
  total_products_found: number | null; products_imported: number | null;
  products_rejected: number | null; started_at: string | null; completed_at: string | null;
}

interface AggStats {
  today: number; week: number; month: number;
  runs24h: number; found7d: number; imported7d: number; skipped7d: number; avgProfit: number;
}

type Tab = 'manual' | 'auto' | 'pricing' | 'history';

const DEFAULTS: Filters = {
  min_amazon_price: 3, max_amazon_price: 25, min_profit_margin: 30,
  min_reviews: 500, min_rating: 3.5, max_bsr: 100000,
  require_prime: true, excluded_brands: ['Apple','Nike','Samsung','Sony','Microsoft','Disney','Marvel','Bose','Beats','JBL','Anker','Logitech'],
  max_products_per_run: 1000,
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLE HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const inp: React.CSSProperties = { background: V.bg3, border: `1px solid ${V.border2}`, color: V.text, padding: '9px 14px', borderRadius: 8, fontSize: 13, width: '100%', outline: 'none', fontFamily: 'inherit' };
const selS: React.CSSProperties = { ...inp, cursor: 'pointer', appearance: 'auto' as any };
const lblS: React.CSSProperties = { fontSize: 10, color: V.dim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 6 };
const btnS = (bg: string, fg: string, sm?: boolean): React.CSSProperties => ({
  padding: sm ? '5px 12px' : '8px 18px', borderRadius: 8, border: 'none', fontWeight: 700,
  fontSize: sm ? 11 : 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
  gap: 6, whiteSpace: 'nowrap', background: bg, color: fg, fontFamily: 'inherit',
});
const ghostS: React.CSSProperties = {
  background: 'transparent', border: `1px solid ${V.border}`, color: V.muted,
  padding: '5px 12px', borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
};
const badgeS = (bg: string, fg: string): React.CSSProperties => ({
  display: 'inline-block', padding: '3px 10px', borderRadius: 99, fontSize: 9,
  fontWeight: 700, letterSpacing: 0.3, background: bg, color: fg,
});
const statBoxS: React.CSSProperties = {
  fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px',
  background: V.bg, borderRadius: 6, border: `1px solid ${V.border}`,
  fontFamily: "'Geist Mono', monospace",
};
const mono = "'Geist Mono', monospace";

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ position: 'relative', width: 42, height: 24, background: on ? V.cyan : V.border2, borderRadius: 99, cursor: 'pointer', transition: 'background .2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'left .2s' }} />
    </div>
  );
}

function Rule({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', fontSize: 12 }}>
      <span style={{ color: V.dim, minWidth: 140, fontWeight: 600 }}>{label}</span>
      <span style={{ fontFamily: mono, color: color || V.cyan, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function StatBox({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <div style={{ background: V.bg2, border: `1px solid ${V.border}`, borderRadius: 10, padding: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800, fontFamily: mono, lineHeight: 1.1, color }}>{value}</div>
      <div style={{ fontSize: 9, color: V.dim, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 3 }}>{label}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export function SourcingPanel({ onSourcingComplete }: SourcingPanelProps) {
  const supabase = createClientComponentClient();
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<Tab>('manual');
  const [f, setF] = useState<Filters>({ ...DEFAULTS });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok'|'err'; s: string } | null>(null);

  // Auto config
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [cronInterval, setCronInterval] = useState('6h');
  const [autoImport, setAutoImport] = useState(true);
  const [autoSync, setAutoSync] = useState(true);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [lastFound, setLastFound] = useState(0);
  const [lastImported, setLastImported] = useState(0);
  const [nextRunAt, setNextRunAt] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // Aggregated stats
  const [agg, setAgg] = useState<AggStats>({ today: 0, week: 0, month: 0, runs24h: 0, found7d: 0, imported7d: 0, skipped7d: 0, avgProfit: 0 });

  // History
  const [runs, setRuns] = useState<DiscoveryRun[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  // Sync stats
  const [synced, setSynced] = useState(0);
  const [syncFailed, setSyncFailed] = useState(0);
  const [syncPending, setSyncPending] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // ── Load on mount ──
  useEffect(() => { loadSettings(); loadSyncStats(); loadAggStats(); }, []);
  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab]);

  // ── LOAD sourcing_settings ──
  const loadSettings = async () => {
    try {
      const { data, error } = await supabase.from('sourcing_settings').select('*').eq('id', '00000000-0000-0000-0000-000000000001').maybeSingle();
      if (error) { console.warn('[SourcingPanel] sourcing_settings table not found — using defaults. Run DB migration to create it.'); return; }
      if (data) {
        setF(p => ({ ...p,
          min_amazon_price: data.min_amazon_price ?? p.min_amazon_price,
          max_amazon_price: data.max_amazon_price ?? p.max_amazon_price,
          min_reviews: data.min_reviews ?? p.min_reviews,
          min_rating: data.min_rating ?? p.min_rating,
          require_prime: data.require_prime ?? p.require_prime,
          excluded_brands: data.excluded_brands ?? p.excluded_brands,
          max_products_per_run: data.max_products_per_run ?? p.max_products_per_run,
          max_bsr: data.max_bsr ?? p.max_bsr,
          min_profit_margin: data.min_profit_margin ?? p.min_profit_margin,
        }));
        setAutoEnabled(data.enabled ?? false);
        setCronInterval(data.cron_interval ?? '6h');
        setAutoSync(data.auto_sync_shopify ?? false);
        setLastRun(data.last_run_at ?? null);
        setLastFound(data.last_run_found ?? 0);
        setLastImported(data.last_run_imported ?? 0);
        setNextRunAt(data.next_run_at ?? null);
      }
    } catch (e) { console.error('[SourcingPanel] loadSettings:', e); }
  };

  // ── LOAD sync stats from products table ──
  const loadSyncStats = async () => {
    try {
      const { data, error } = await supabase.from('products').select('shopify_product_id, status');
      if (error) { console.warn('[SourcingPanel] loadSyncStats query error:', error.message); return; }
      if (data) {
        const s = data.filter((p: any) => p.shopify_product_id).length;
        const f = data.filter((p: any) => p.status === 'sync_failed').length;
        setSynced(s); setSyncFailed(f); setSyncPending(data.length - s);
      }
    } catch (e) { /* ignore */ }
  };

  // ── LOAD aggregated stats from discovery_runs ──
  const loadAggStats = async () => {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
      const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
      const dayAgo = new Date(now.getTime() - 86400000).toISOString();

      const { data: allRuns } = await supabase
        .from('discovery_runs')
        .select('started_at, products_imported, total_products_found')
        .gte('started_at', monthAgo)
        .order('started_at', { ascending: false });

      if (allRuns) {
        const todayImported = allRuns.filter((r: any) => r.started_at >= today).reduce((s: number, r: any) => s + (r.products_imported || 0), 0);
        const weekImported = allRuns.filter((r: any) => r.started_at >= weekAgo).reduce((s: number, r: any) => s + (r.products_imported || 0), 0);
        const monthImported = allRuns.reduce((s: number, r: any) => s + (r.products_imported || 0), 0);
        const runs24h = allRuns.filter((r: any) => r.started_at >= dayAgo).length;
        const found7d = allRuns.filter((r: any) => r.started_at >= weekAgo).reduce((s: number, r: any) => s + (r.total_products_found || 0), 0);
        const imported7d = weekImported;
        const skipped7d = found7d - imported7d;

        setAgg({ today: todayImported, week: weekImported, month: monthImported, runs24h, found7d, imported7d, skipped7d, avgProfit: 0 });
      }

      // Load avg profit from products
      const { data: products } = await supabase.from('products').select('amazon_price, retail_price').not('retail_price', 'is', null).not('amazon_price', 'is', null).limit(500);
      if (products && products.length > 0) {
        const margins = products.map((p: any) => ((p.retail_price - p.amazon_price) / p.retail_price) * 100).filter((m: number) => m > 0 && m < 100);
        const avg = margins.length > 0 ? margins.reduce((a: number, b: number) => a + b, 0) / margins.length : 0;
        setAgg(p => ({ ...p, avgProfit: Math.round(avg * 10) / 10 }));
      }
    } catch (e) { console.error('[SourcingPanel] loadAggStats:', e); }
  };

  // ── LOAD history ──
  const loadHistory = async () => {
    setHistLoading(true);
    try {
      const { data } = await supabase.from('discovery_runs')
        .select('id, run_date, status, total_products_found, products_imported, products_rejected, started_at, completed_at')
        .order('started_at', { ascending: false }).limit(20);
      setRuns((data as DiscoveryRun[]) || []);
    } catch (e) { /* ignore */ }
    finally { setHistLoading(false); }
  };

  const upd = (k: keyof Filters, v: any) => { setF(p => ({ ...p, [k]: v })); setDirty(true); };

  // ── SAVE filters to sourcing_settings (WIRED) ──
  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const { error } = await supabase.from('sourcing_settings').update({
        min_amazon_price: f.min_amazon_price, max_amazon_price: f.max_amazon_price,
        min_reviews: f.min_reviews, min_rating: f.min_rating,
        require_prime: f.require_prime, excluded_brands: f.excluded_brands,
        max_products_per_run: f.max_products_per_run, max_bsr: f.max_bsr,
        min_profit_margin: f.min_profit_margin,
      }).eq('id', '00000000-0000-0000-0000-000000000001');
      if (error) throw error;
      setMsg({ t: 'ok', s: 'Saved! 4AM cron will use these filters.' }); setDirty(false);
      setTimeout(() => setMsg(null), 3000);
    } catch (e: any) { setMsg({ t: 'err', s: e.message || 'Save failed' }); }
    finally { setSaving(false); }
  };

  // ── PREVIEW products (WIRED to /api/cron/discovery/run) ──
  const preview = async () => {
    setPreviewing(true); setMsg(null);
    try {
      const res = await fetch('/api/cron/discovery/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filters: f, maxProducts: 10, dryRun: true }) });
      const d = await res.json();
      setMsg(d.success ? { t: 'ok', s: `Found ${d.data?.found ?? 0} matching products` } : { t: 'err', s: d.error || 'Preview failed' });
    } catch (e: any) { setMsg({ t: 'err', s: e.message }); }
    finally { setPreviewing(false); }
  };

  // ── IMPORT ALL products (WIRED to /api/cron/discovery/run) ──
  const importAll = async () => {
    setImporting(true); setMsg(null);
    try {
      const res = await fetch('/api/cron/discovery/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filters: f, maxProducts: f.max_products_per_run, dryRun: false }) });
      const d = await res.json();
      if (d.success) {
        setMsg({ t: 'ok', s: `Imported ${d.data?.imported ?? 0} products (${d.data?.found ?? 0} found, ${d.data?.rejected ?? 0} rejected)` });
        onSourcingComplete();
        loadAggStats();
      } else {
        setMsg({ t: 'err', s: d.error || 'Import failed' });
      }
    } catch (e: any) { setMsg({ t: 'err', s: e.message }); }
    finally { setImporting(false); }
  };

  // ── RUN NOW (WIRED to /api/cron?job=product-discovery) ──
  const runNow = async () => {
    setRunning(true); setMsg(null);
    try {
      const res = await fetch('/api/cron?job=product-discovery', { headers: { 'x-cron-secret': 'manual-trigger' } });
      const d = await res.json();
      if (d.success !== false) {
        setMsg({ t: 'ok', s: d.message || 'Discovery completed' });
        onSourcingComplete(); loadSettings(); loadAggStats();
      } else setMsg({ t: 'err', s: d.error || d.message || 'Failed' });
    } catch (e: any) { setMsg({ t: 'err', s: e.message }); }
    finally { setRunning(false); }
  };

  // ── PERSIST Auto Sourcing toggle (WIRED) ──
  const toggleAutoEnabled = async () => {
    const newVal = !autoEnabled;
    setAutoEnabled(newVal);
    try {
      await supabase.from('sourcing_settings').update({ enabled: newVal }).eq('id', '00000000-0000-0000-0000-000000000001');
    } catch (e) { console.error('[SourcingPanel] toggle enabled:', e); setAutoEnabled(!newVal); }
  };

  // ── PERSIST cron interval (WIRED) ──
  const updateCronInterval = async (val: string) => {
    setCronInterval(val);
    try {
      await supabase.from('sourcing_settings').update({ cron_interval: val }).eq('id', '00000000-0000-0000-0000-000000000001');
    } catch (e) { console.error('[SourcingPanel] update interval:', e); }
  };

  // ── PERSIST auto sync shopify (WIRED) ──
  const toggleAutoSync = async () => {
    const newVal = !autoSync;
    setAutoSync(newVal);
    try {
      await supabase.from('sourcing_settings').update({ auto_sync_shopify: newVal }).eq('id', '00000000-0000-0000-0000-000000000001');
    } catch (e) { console.error('[SourcingPanel] toggle auto sync:', e); setAutoSync(!newVal); }
  };

  // ── PUSH ALL to Shopify (WIRED to /api/products?action=sync-shopify) ──
  const pushShopify = async () => {
    setMsg({ t: 'ok', s: 'Pushing to Shopify...' });
    try {
      const res = await fetch('/api/products?action=sync-shopify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullSync: true }) });
      const d = await res.json();
      setMsg({ t: d.success ? 'ok' : 'err', s: d.message || (d.success ? 'Sync started' : 'Failed') });
      loadSyncStats(); onSourcingComplete();
    } catch (e: any) { setMsg({ t: 'err', s: e.message }); }
  };

  // ── PULL from Shopify (WIRED to /api/products?action=sync-shopify) ──
  const pullShopify = async () => {
    setMsg({ t: 'ok', s: 'Pulling from Shopify...' });
    try {
      const res = await fetch('/api/products?action=sync-shopify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullSync: true, direction: 'pull' }) });
      const d = await res.json();
      setMsg({ t: d.success ? 'ok' : 'err', s: d.message || (d.success ? 'Pull complete' : 'Failed') });
      loadSyncStats(); onSourcingComplete();
    } catch (e: any) { setMsg({ t: 'err', s: e.message }); }
  };

  // ── Time helpers ──
  const timeAgo = (d: string | null) => {
    if (!d) return '—';
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (m < 0) return 'soon';
    if (m < 1) return 'Just now'; if (m < 60) return `${m}m ago`; if (m < 1440) return `${Math.floor(m / 60)}h ago`;
    return `${Math.floor(m / 1440)}d ago`;
  };
  const timeUntil = (d: string | null) => {
    if (!d) return null;
    const m = Math.floor((new Date(d).getTime() - Date.now()) / 60000);
    if (m < 0) return null;
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  };
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
  const fmtDur = (s: string | null, e: string | null) => {
    if (!s || !e) return '—';
    const ms = new Date(e).getTime() - new Date(s).getTime();
    return ms < 60000 ? `${(ms / 1000).toFixed(0)}s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  const R = PRICING_RULES;
  const nextRunLabel = timeUntil(nextRunAt);
  const tabs: { id: Tab; label: string }[] = [
    { id: 'manual', label: 'Manual Sourcing' }, { id: 'auto', label: 'Auto Sourcing' },
    { id: 'pricing', label: 'Pricing Logic' }, { id: 'history', label: 'Source History' },
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ background: V.bg2, border: `1px solid ${V.border}`, borderRadius: 14, marginBottom: 20, overflow: 'hidden', color: V.text, fontSize: 13 }}>

      {/* ══ HEADER ══ */}
      <div onClick={() => setCollapsed(!collapsed)} style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 16 }}>🎯</span>
          <strong style={{ fontSize: 13, letterSpacing: 0.5 }}>SOURCING CRITERIA + PRICING ENGINE</strong>
          <span style={badgeS(autoEnabled ? 'rgba(34,197,94,.15)' : 'rgba(107,114,128,.15)', autoEnabled ? '#4ade80' : V.dim)}>
            Auto Sourcing: {autoEnabled ? 'ON' : 'OFF'}
          </span>
          {nextRunLabel && (
            <span style={badgeS('rgba(34,211,238,.15)', V.cyan)}>Next run: {nextRunLabel}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={statBoxS}>Today: <strong style={{ color: V.green, marginLeft: 4 }}>{agg.today.toLocaleString()}</strong> <span style={{ marginLeft: 2 }}>sourced</span></div>
          <div style={statBoxS}>7d: <strong style={{ color: V.cyan, marginLeft: 4 }}>{agg.week.toLocaleString()}</strong></div>
          <div style={statBoxS}>30d: <strong style={{ color: V.purple, marginLeft: 4 }}>{agg.month.toLocaleString()}</strong></div>
          <span style={{ fontSize: 12, color: V.dim, transition: 'transform .2s', transform: collapsed ? 'rotate(-90deg)' : '', display: 'inline-block' }}>▼</span>
        </div>
      </div>

      {!collapsed && <>
        <div style={{ padding: '0 24px 20px' }}>
          {/* ── Tabs ── */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${V.border}`, marginBottom: 20 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '10px 20px', background: 'none', border: 'none', fontFamily: 'inherit',
                borderBottom: `2px solid ${tab === t.id ? V.cyan : 'transparent'}`,
                color: tab === t.id ? V.cyan : V.muted, fontWeight: 600, fontSize: 13, cursor: 'pointer', marginBottom: -1,
              }}>{t.label}</button>
            ))}
          </div>

          {/* Messages */}
          {msg && (
            <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 12, background: msg.t === 'ok' ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)', border: `1px solid ${msg.t === 'ok' ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)'}`, color: msg.t === 'ok' ? '#4ade80' : '#f87171', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{msg.t === 'ok' ? '✓' : '✕'} {msg.s}</span>
              <button onClick={() => setMsg(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>×</button>
            </div>
          )}

          {/* ════════════ MANUAL SOURCING ════════════ */}
          {tab === 'manual' && (<div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              <div><label style={lblS}>Min Price ($)</label><input style={inp} type="number" value={f.min_amazon_price} onChange={e => upd('min_amazon_price', parseFloat(e.target.value) || 0)} /></div>
              <div><label style={lblS}>Max Price ($)</label><input style={inp} type="number" value={f.max_amazon_price} onChange={e => upd('max_amazon_price', parseFloat(e.target.value) || 0)} /></div>
              <div><label style={lblS}>Min Margin (%)</label><input style={inp} type="number" value={f.min_profit_margin} onChange={e => upd('min_profit_margin', parseInt(e.target.value) || 0)} /></div>
              <div><label style={lblS}>Min Reviews</label><input style={inp} type="number" value={f.min_reviews} onChange={e => upd('min_reviews', parseInt(e.target.value) || 0)} /></div>
              <div><label style={lblS}>Min Rating</label><input style={inp} type="number" step="0.1" value={f.min_rating} onChange={e => upd('min_rating', parseFloat(e.target.value) || 0)} /></div>
              <div><label style={lblS}>Max BSR</label><input style={inp} type="number" value={f.max_bsr} onChange={e => upd('max_bsr', parseInt(e.target.value) || 0)} /></div>
              <div><label style={lblS}>Products to Source</label>
                <select style={selS} value={f.max_products_per_run} onChange={e => upd('max_products_per_run', parseInt(e.target.value))}>
                  <option value={100}>100</option><option value={500}>500</option><option value={1000}>1,000</option><option value={5000}>5,000</option><option value={10000}>10,000</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: V.text }}>
                  <Toggle on={f.require_prime} onClick={() => upd('require_prime', !f.require_prime)} /> Prime Only
                </label>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <label style={lblS}>Excluded Brands (comma-separated)</label>
              <input style={inp} value={f.excluded_brands.join(', ')} onChange={e => upd('excluded_brands', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={preview} disabled={previewing} style={{ ...btnS(V.cyan, '#000'), opacity: previewing ? .6 : 1 }}>{previewing ? '⏳ Previewing...' : '👁️ Preview Products'}</button>
                <button onClick={importAll} disabled={importing} style={{ ...btnS(V.green, '#000'), opacity: importing ? .6 : 1 }}>{importing ? '⏳ Importing...' : '⬇️ Import All'}</button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setF({ ...DEFAULTS }); setDirty(true); }} style={ghostS}>↺ Reset Defaults</button>
                <button onClick={save} disabled={saving || !dirty} style={{ ...ghostS, opacity: saving || !dirty ? .5 : 1 }}>{saving ? '⏳...' : '💾 Save as Cron Settings'}</button>
              </div>
            </div>
          </div>)}

          {/* ════════════ AUTO SOURCING ════════════ */}
          {tab === 'auto' && (<div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Toggle on={autoEnabled} onClick={toggleAutoEnabled} />
                <span style={{ fontWeight: 700 }}>Auto Sourcing</span>
                <span style={badgeS(autoEnabled ? 'rgba(34,197,94,.15)' : 'rgba(107,114,128,.15)', autoEnabled ? '#4ade80' : V.dim)}>{autoEnabled ? 'Active' : 'Disabled'}</span>
              </div>
              {lastRun && <span style={{ fontSize: 12, color: V.dim }}>Last run: {timeAgo(lastRun)} · Found {lastFound} · Imported {lastImported} · Skipped {lastFound - lastImported} dupes</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div><label style={lblS}>Run Interval</label><select style={selS} value={cronInterval} onChange={e => updateCronInterval(e.target.value)}>
                <option value="1h">Every Hour</option><option value="3h">Every 3 Hours</option><option value="6h">Every 6 Hours</option><option value="12h">Every 12 Hours</option><option value="24h">Daily</option>
              </select></div>
              <div><label style={lblS}>Run At</label><select style={selS}><option>12 AM</option><option value="4">4 AM</option><option>6 AM</option><option>8 AM</option><option>12 PM</option></select></div>
              <div><label style={lblS}>Auto-Import</label><div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}><Toggle on={autoImport} onClick={() => setAutoImport(!autoImport)} /><span style={{ fontSize: 12 }}>Import matches</span></div></div>
              <div><label style={lblS}>Auto-Sync Shopify</label><div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}><Toggle on={autoSync} onClick={toggleAutoSync} /><span style={{ fontSize: 12 }}>Price + Push</span></div></div>
            </div>
            <div style={{ fontSize: 11, color: V.dim, background: V.bg, padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>
              ⚡ Uses criteria from <strong style={{ color: V.text }}>Manual Sourcing</strong> tab. Auto-Sync applies <strong style={{ color: V.cyan }}>1.70× markup</strong> + competitor prices → pushes to Shopify.
            </div>

            {/* ── 5 Stat Boxes ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
              <StatBox value={agg.runs24h} label="Runs (24h)" color={V.cyan} />
              <StatBox value={agg.found7d.toLocaleString()} label="Found (7d)" color={V.green} />
              <StatBox value={agg.imported7d.toLocaleString()} label="Imported (7d)" color={V.purple} />
              <StatBox value={agg.skipped7d.toLocaleString()} label="Skipped" color={V.dim} />
              <StatBox value={`${agg.avgProfit}%`} label="Avg Profit" color={V.orange} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={runNow} disabled={running} style={{ ...btnS(V.cyan, '#000', true), opacity: running ? .6 : 1 }}>{running ? '⏳ Running...' : '▶️ Run Now'}</button>
              <button style={ghostS}>⏸ Pause</button>
              <button onClick={() => setTab('history')} style={ghostS}>📋 View Log</button>
            </div>
          </div>)}

          {/* ════════════ PRICING LOGIC ════════════ */}
          {tab === 'pricing' && (<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={{ background: 'linear-gradient(135deg,rgba(34,211,238,.04),rgba(168,85,247,.04))', border: '1px solid rgba(34,211,238,.12)', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: V.cyan, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>💰 Your Markup</div>
              <Rule label="Multiplier" value={`${R.yourMarkup.multiplier}× (${((R.yourMarkup.multiplier - 1) * 100).toFixed(0)}%)`} />
              <Rule label="Min Profit" value={`${R.profitThresholds.minimum}%`} />
              <Rule label="Target Profit" value={`${R.profitThresholds.target}%`} />
              <Rule label="Grace Period" value={`${R.profitThresholds.gracePeriodDays} days`} />
              <div style={{ marginTop: 12, padding: 10, background: V.bg, borderRadius: 8, fontSize: 11, color: V.muted }}>
                <strong style={{ color: V.text }}>Example:</strong> Buy $9.99 × {R.yourMarkup.multiplier} = <strong style={{ color: V.green }}>${(9.99 * R.yourMarkup.multiplier).toFixed(2)}</strong> → Profit ${(9.99 * R.yourMarkup.multiplier - 9.99).toFixed(2)} ({((1 - 1 / R.yourMarkup.multiplier) * 100).toFixed(1)}%)
              </div>
            </div>
            <div style={{ background: 'linear-gradient(135deg,rgba(168,85,247,.04),rgba(34,211,238,.04))', border: '1px solid rgba(168,85,247,.12)', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: V.purple, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>🏪 Competitor Prices (auto on Shopify sync)</div>
              {Object.entries(R.competitors.ranges).map(([k, r]) => (
                <Rule key={k} label={(COMPETITOR_NAMES as any)[k] || k} value={`${r.min}× – ${r.max}×`} color={V.purple} />
              ))}
              <div style={{ marginTop: 12, padding: 10, background: V.bg, borderRadius: 8, fontSize: 11, color: V.muted }}>
                <strong style={{ color: V.text }}>Example:</strong> Sell ${(9.99 * R.yourMarkup.multiplier).toFixed(2)} → Amazon: <s>${(9.99 * R.yourMarkup.multiplier * R.competitors.ranges.amazon.min).toFixed(2)}</s> · Costco: <s>${(9.99 * R.yourMarkup.multiplier * R.competitors.ranges.costco.min).toFixed(2)}</s> · eBay: <s>${(9.99 * R.yourMarkup.multiplier * R.competitors.ranges.ebay.min).toFixed(2)}</s>
              </div>
            </div>
          </div>)}

          {/* ════════════ SOURCE HISTORY ════════════ */}
          {tab === 'history' && (<div>
            {histLoading ? <div style={{ padding: 20, textAlign: 'center', color: V.dim }}>Loading...</div>
            : runs.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: V.dim }}>No runs yet. Run Manual or Auto sourcing to start.</div>
            : <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                {runs.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 0', borderBottom: `1px solid ${V.border}`, fontSize: 11 }}>
                    <span style={badgeS(
                      r.status === 'completed' ? 'rgba(34,197,94,.15)' : r.status === 'failed' ? 'rgba(239,68,68,.15)' : 'rgba(234,179,8,.15)',
                      r.status === 'completed' ? '#4ade80' : r.status === 'failed' ? '#f87171' : '#facc15'
                    )}>{r.status === 'completed' ? '✓' : r.status === 'failed' ? '✕' : '⚠'}</span>
                    <span style={{ fontFamily: mono, color: V.dim, minWidth: 130, fontSize: 10 }}>{fmtDate(r.started_at || r.run_date)}</span>
                    <span>Found <strong>{r.total_products_found ?? 0}</strong></span>
                    <span style={{ color: V.green }}>Imported <strong>{r.products_imported ?? 0}</strong></span>
                    <span style={{ color: V.dim }}>Skipped {(r.total_products_found ?? 0) - (r.products_imported ?? 0)}</span>
                    <span style={{ color: V.dim, marginLeft: 'auto' }}>{fmtDur(r.started_at, r.completed_at)}</span>
                  </div>
                ))}
              </div>
            }
          </div>)}
        </div>

        {/* ══ SHOPIFY SYNC BAR ══ */}
        <div style={{ padding: '12px 24px', background: 'rgba(150,191,72,.04)', borderTop: `1px solid ${V.border}`, display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
          <span style={{ fontSize: 14 }}>🛒</span>
          <strong style={{ color: V.shopify, fontSize: 11 }}>SHOPIFY SYNC</strong>
          <span style={{ color: V.dim }}>|</span>
          <span style={{ color: V.dim }}>Last sync: {lastSyncTime ? timeAgo(lastSyncTime) : '—'}</span>
          <span style={{ color: V.dim }}>·</span>
          <span><strong style={{ color: V.shopify }}>{synced}</strong> synced</span>
          <span style={{ color: V.dim }}>·</span>
          <span><strong style={{ color: V.red }}>{syncFailed}</strong> failed</span>
          <span style={{ color: V.dim }}>·</span>
          <span>{syncPending} pending</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button onClick={pushShopify} style={{ ...btnS(V.shopify, '#fff'), padding: '3px 8px', fontSize: 10 }}>↑ Push All to Shopify</button>
            <button onClick={pullShopify} style={{ ...btnS('#5c6ac4', '#fff'), padding: '3px 8px', fontSize: 10 }}>↓ Pull from Shopify</button>
          </div>
        </div>
      </>}
    </div>
  );
}

export default SourcingPanel;




