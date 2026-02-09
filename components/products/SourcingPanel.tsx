'use client';

// components/products/SourcingPanel.tsx
// ═══════════════════════════════════════════════════════════════════════════
// COLLAPSIBLE SOURCING PANEL — Spec Item 3
// 4 tabs: Manual Sourcing | Auto Sourcing | Pricing Logic | Source History
// ═══════════════════════════════════════════════════════════════════════════
// - Manual tab: renders existing ManualSourcingBar
// - Auto tab: cron config, run now, toggle auto-sync, rejection log summary
// - Pricing Logic tab: reads from PRICING_RULES and displays all rules
// - Source History tab: fetches discovery_runs from Supabase
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { ManualSourcingBar } from './ManualSourcingBar';
import { CronTestPanel } from './CronTestPanel';
import { PRICING_RULES, COMPETITOR_NAMES } from '@/lib/config/pricing-rules';

// ═══════════════════════════════════════════════════════════════════════════
// INLINE SVG ICONS (matching the rest of the codebase)
// ═══════════════════════════════════════════════════════════════════════════

const Icons = {
  Search: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  Zap: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  DollarSign: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Clock: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Play: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  RefreshCw: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  Check: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  X: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  AlertTriangle: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  ArrowRight: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  ),
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type SourcingTab = 'manual' | 'auto' | 'pricing' | 'history' | 'testing';

interface DiscoveryRun {
  id: string;
  run_date: string;
  status: 'running' | 'completed' | 'failed';
  total_products_found: number | null;
  products_imported: number | null;
  products_rejected: number | null;
  started_at: string | null;
  completed_at: string | null;
}

interface AutoSourcingConfig {
  enabled: boolean;
  cronInterval: string;
  autoSyncShopify: boolean;
  lastRun: string | null;
  nextRun: string | null;
}

interface SourcingPanelProps {
  onSourcingComplete: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const TABS = [
  { id: 'manual' as SourcingTab, label: 'Manual Sourcing', icon: Icons.Search },
  { id: 'auto' as SourcingTab, label: 'Auto Sourcing', icon: Icons.Zap },
  { id: 'pricing' as SourcingTab, label: 'Pricing Logic', icon: Icons.DollarSign },
  { id: 'history' as SourcingTab, label: 'Source History', icon: Icons.Clock },
  { id: 'testing' as SourcingTab, label: 'Test Now', icon: Icons.Play },
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function SourcingPanel({ onSourcingComplete }: SourcingPanelProps) {
  const [activeTab, setActiveTab] = useState<SourcingTab>('manual');

  return (
    <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* ── Tab Bar ──────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-200 bg-gray-50/60">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all
                border-b-2 -mb-px
                ${isActive
                  ? 'border-blue-500 text-blue-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/50'
                }
              `}
              aria-selected={isActive}
              role="tab"
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────── */}
      {/* Manual tab: ManualSourcingBar has its own bg/border/shadow — render directly */}
      {/* Other tabs: wrap in bg-white for consistent look */}
      {activeTab === 'manual' && (
        <ManualSourcingBar onSourcingComplete={onSourcingComplete} />
      )}
      {activeTab === 'auto' && (
        <div className="bg-white">
          <AutoSourcingTab onSourcingComplete={onSourcingComplete} />
        </div>
      )}
      {activeTab === 'pricing' && (
        <div className="bg-white">
          <PricingLogicTab />
        </div>
      )}
      {activeTab === 'history' && (
        <div className="bg-white">
          <SourceHistoryTab />
        </div>
      )}
      {activeTab === 'testing' && (
        <div className="bg-white p-5">
          <CronTestPanel />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 2: AUTO SOURCING
// ═══════════════════════════════════════════════════════════════════════════

function AutoSourcingTab({ onSourcingComplete }: { onSourcingComplete: () => void }) {
  const supabase = createClientComponentClient();
  const [config, setConfig] = useState<AutoSourcingConfig>({
    enabled: false,
    cronInterval: '6h',
    autoSyncShopify: false,
    lastRun: null,
    nextRun: null,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectionCount, setRejectionCount] = useState<number | null>(null);

  // Load rejection count + last run from Supabase directly
  useEffect(() => {
    loadRejectionCount();
    loadLastRun();
  }, []);

  const loadRejectionCount = async () => {
    try {
      const { count, error: countErr } = await supabase
        .from('rejection_log')
        .select('*', { count: 'exact', head: true });
      if (!countErr) {
        setRejectionCount(count ?? 0);
      }
    } catch (err) {
      console.log('[AutoSourcing] Could not load rejection count:', err);
      setRejectionCount(0);
    }
  };

  const loadLastRun = async () => {
    try {
      const { data, error: runErr } = await supabase
        .from('discovery_runs')
        .select('started_at, completed_at, status')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!runErr && data?.completed_at) {
        setConfig(prev => ({ ...prev, lastRun: data.completed_at }));
      }
    } catch (err) {
      console.log('[AutoSourcing] Could not load last run:', err);
    }
  };

  const handleRunNow = async () => {
    setIsRunning(true);
    setRunResult(null);
    setError(null);
    try {
      // Cron route is GET-based; POST delegates to GET
      const res = await fetch('/api/cron?job=product-discovery');
      const data = await res.json();
      if (res.status === 401) {
        setRunResult({
          success: false,
          message: 'CRON_SECRET is set — browser calls are blocked. Use the Test Now buttons (Item 22-24) or remove CRON_SECRET from env to test locally.',
        });
        return;
      }
      if (res.ok && data.success !== false) {
        setRunResult({
          success: true,
          message: data.message || `Discovery completed: ${data.processed ?? 0} processed`,
        });
        onSourcingComplete();
        loadLastRun();
      } else {
        setRunResult({
          success: false,
          message: data.error || data.message || 'Run failed',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsRunning(false);
    }
  };

  const handleToggleEnabled = () => {
    setConfig(prev => ({ ...prev, enabled: !prev.enabled }));
    // TODO: persist to sourcing_settings table (Item 31)
  };

  const handleToggleAutoSync = () => {
    setConfig(prev => ({ ...prev, autoSyncShopify: !prev.autoSyncShopify }));
    // TODO: persist to sourcing_settings table (Item 31)
  };

  const intervalOptions = [
    { value: '1h', label: 'Every hour' },
    { value: '3h', label: 'Every 3 hours' },
    { value: '6h', label: 'Every 6 hours' },
    { value: '12h', label: 'Every 12 hours' },
    { value: '24h', label: 'Daily' },
  ];

  return (
    <div className="p-5 space-y-5">
      {/* Status Banner */}
      <div className={`flex items-center justify-between p-4 rounded-lg border ${
        config.enabled
          ? 'bg-green-50 border-green-200'
          : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${config.enabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Auto Sourcing {config.enabled ? 'Active' : 'Disabled'}
            </p>
            <p className="text-xs text-gray-500">
              {config.enabled
                ? `Runs ${intervalOptions.find(o => o.value === config.cronInterval)?.label?.toLowerCase() || 'every 6 hours'} • Same criteria as Manual tab`
                : 'Enable to automatically discover and import products on a schedule'
              }
            </p>
          </div>
        </div>
        <button
          onClick={handleToggleEnabled}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            config.enabled ? 'bg-green-500' : 'bg-gray-300'
          }`}
          role="switch"
          aria-checked={config.enabled}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${
            config.enabled ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>

      {/* Config Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Interval */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Cron Interval</label>
          <select
            value={config.cronInterval}
            onChange={(e) => setConfig(prev => ({ ...prev, cronInterval: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {intervalOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Auto-Sync Shopify */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Auto-Sync to Shopify</label>
          <div className="flex items-center gap-3 h-[38px]">
            <button
              onClick={handleToggleAutoSync}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config.autoSyncShopify ? 'bg-blue-500' : 'bg-gray-300'
              }`}
              role="switch"
              aria-checked={config.autoSyncShopify}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${
                config.autoSyncShopify ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
            <span className="text-sm text-gray-600">
              {config.autoSyncShopify ? 'Push to Shopify on import' : 'Manual sync only'}
            </span>
          </div>
        </div>

        {/* Rejection Log */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Rejection Log</label>
          <div className="flex items-center gap-2 h-[38px]">
            <Icons.X className="w-4 h-4 text-red-400" />
            <span className="text-sm text-gray-600">
              {rejectionCount !== null ? `${rejectionCount} ASINs rejected` : 'Loading...'}
            </span>
            <span className="text-xs text-gray-400">(won{"'"}t re-evaluate)</span>
          </div>
        </div>
      </div>

      {/* Run Now Section */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        <button
          onClick={handleRunNow}
          disabled={isRunning}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            isRunning
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm'
          }`}
        >
          {isRunning ? (
            <>
              <Icons.RefreshCw className="w-4 h-4 animate-spin" />
              Running Discovery...
            </>
          ) : (
            <>
              <Icons.Play className="w-4 h-4" />
              Run Now
            </>
          )}
        </button>

        <p className="text-xs text-gray-400">
          Runs the same pipeline as the cron job: Rainforest search → criteria filter → Keepa demand → import
        </p>
      </div>

      {/* Run Result */}
      {runResult && (
        <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
          runResult.success
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {runResult.success ? <Icons.Check className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <Icons.AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          {runResult.message}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
          <Icons.AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Last/Next Run Info */}
      {config.lastRun && (
        <div className="text-xs text-gray-400 flex gap-4">
          <span>Last run: {new Date(config.lastRun).toLocaleString()}</span>
          {config.nextRun && <span>Next run: {new Date(config.nextRun).toLocaleString()}</span>}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 3: PRICING LOGIC (read-only display of PRICING_RULES)
// ═══════════════════════════════════════════════════════════════════════════

function PricingLogicTab() {
  const rules = PRICING_RULES;

  return (
    <div className="p-5 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Active Pricing Rules</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            All rules from <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">lib/config/pricing-rules.ts</code> — single source of truth
          </p>
        </div>
      </div>

      {/* Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Your Markup */}
        <RuleCard
          title="Your Markup"
          color="blue"
          items={[
            { label: 'Multiplier', value: `${rules.yourMarkup.multiplier}x` },
            { label: 'Description', value: rules.yourMarkup.description },
            { label: 'Example', value: `$10 Amazon → $${(10 * rules.yourMarkup.multiplier).toFixed(2)} sell price` },
          ]}
        />

        {/* Competitor Display Prices */}
        <RuleCard
          title="Competitor Display Prices"
          color="orange"
          items={[
            { label: 'Minimum Markup', value: `${rules.competitors.minimumMarkup}x (${((rules.competitors.minimumMarkup - 1) * 100).toFixed(0)}% higher)` },
            ...Object.entries(rules.competitors.ranges).map(([key, range]) => ({
              label: COMPETITOR_NAMES[key as keyof typeof COMPETITOR_NAMES] || key,
              value: `${((range.min - 1) * 100).toFixed(0)}–${((range.max - 1) * 100).toFixed(0)}% higher`,
            })),
          ]}
        />

        {/* Profit Thresholds */}
        <RuleCard
          title="Profit Thresholds"
          color="green"
          items={[
            { label: 'Minimum Alert', value: `${rules.profitThresholds.minimum}%` },
            { label: 'Target', value: `${rules.profitThresholds.target}%` },
            { label: 'Grace Period', value: `${rules.profitThresholds.gracePeriodDays} days before auto-pause` },
          ]}
        />

        {/* Discovery Criteria */}
        <RuleCard
          title="Discovery Criteria"
          color="purple"
          items={[
            { label: 'Price Range', value: `$${rules.discovery.minAmazonPrice} – $${rules.discovery.maxAmazonPrice}` },
            { label: 'Min Reviews', value: `${rules.discovery.minReviews.toLocaleString()}+` },
            { label: 'Min Rating', value: `${rules.discovery.minRating}+` },
            { label: 'Prime Required', value: rules.discovery.requirePrime ? 'Yes' : 'No' },
            { label: 'Excluded Brands', value: `${rules.discovery.excludeTitleWords.length} words` },
          ]}
        />

        {/* Refresh Tiers */}
        <RuleCard
          title="Price Refresh Tiers"
          color="cyan"
          items={[
            { label: 'Stale Threshold', value: `${rules.refresh.staleThresholdDays} days` },
            { label: `High ($${rules.refresh.tiers.high.minPrice}+)`, value: `Every ${rules.refresh.tiers.high.intervalDays} day(s)` },
            { label: `Medium ($${rules.refresh.tiers.medium.minPrice}–$${rules.refresh.tiers.high.minPrice - 1})`, value: `Every ${rules.refresh.tiers.medium.intervalDays} days` },
            { label: `Low (< $${rules.refresh.tiers.medium.minPrice})`, value: `Every ${rules.refresh.tiers.low.intervalDays} days` },
          ]}
        />

        {/* API Costs */}
        <RuleCard
          title="API Cost Rates"
          color="gray"
          items={[
            { label: 'Rainforest Search', value: `$${rules.apiCosts.rainforest.search}/request` },
            { label: 'Rainforest Product', value: `$${rules.apiCosts.rainforest.product}/request` },
            { label: 'Keepa', value: `${rules.apiCosts.keepa.tokensPerProduct} tokens/product ($${rules.apiCosts.keepa.tokenCostUsd}/token)` },
          ]}
        />
      </div>

      {/* Price Example Flow */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">Example Price Flow</h4>
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <PriceStep label="Amazon Cost" value="$10.00" color="gray" />
          <Icons.ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <PriceStep label="Your Price" value={`$${(10 * rules.yourMarkup.multiplier).toFixed(2)}`} color="blue" />
          <Icons.ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <PriceStep label="Amazon Display" value={`$${(10 * rules.yourMarkup.multiplier * rules.competitors.ranges.amazon.min).toFixed(2)}–$${(10 * rules.yourMarkup.multiplier * rules.competitors.ranges.amazon.max).toFixed(2)}`} color="orange" />
          <Icons.ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <PriceStep label="Profit" value={`$${(10 * rules.yourMarkup.multiplier - 10).toFixed(2)} (${((rules.yourMarkup.multiplier - 1) * 100).toFixed(0)}%)`} color="green" />
        </div>
      </div>
    </div>
  );
}

// ── Rule Card Component ─────────────────────────────────────────────────

function RuleCard({ title, color, items }: {
  title: string;
  color: 'blue' | 'green' | 'orange' | 'purple' | 'cyan' | 'gray';
  items: { label: string; value: string }[];
}) {
  const colorMap = {
    blue: 'border-l-blue-500 bg-blue-50/30',
    green: 'border-l-green-500 bg-green-50/30',
    orange: 'border-l-orange-500 bg-orange-50/30',
    purple: 'border-l-purple-500 bg-purple-50/30',
    cyan: 'border-l-cyan-500 bg-cyan-50/30',
    gray: 'border-l-gray-400 bg-gray-50/30',
  };

  return (
    <div className={`border border-gray-200 border-l-4 rounded-lg p-4 ${colorMap[color]}`}>
      <h4 className="text-sm font-semibold text-gray-800 mb-3">{title}</h4>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-gray-500">{item.label}</span>
            <span className="font-medium text-gray-900 text-right">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Price Step Badge ─────────────────────────────────────────────────────

function PriceStep({ label, value, color }: {
  label: string;
  value: string;
  color: 'blue' | 'green' | 'orange' | 'gray';
}) {
  const colorMap = {
    blue: 'bg-blue-100 text-blue-800 border-blue-200',
    green: 'bg-green-100 text-green-800 border-green-200',
    orange: 'bg-orange-100 text-orange-800 border-orange-200',
    gray: 'bg-gray-100 text-gray-700 border-gray-200',
  };

  return (
    <div className={`px-3 py-1.5 rounded-lg border ${colorMap[color]}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 4: SOURCE HISTORY (fetches from discovery_runs)
// ═══════════════════════════════════════════════════════════════════════════

function SourceHistoryTab() {
  const supabase = createClientComponentClient();
  const [runs, setRuns] = useState<DiscoveryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRuns();
  }, []);

  const fetchRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: dbErr } = await supabase
        .from('discovery_runs')
        .select('id, run_date, status, total_products_found, products_imported, products_rejected, started_at, completed_at')
        .order('started_at', { ascending: false })
        .limit(25);
      
      if (dbErr) {
        throw new Error(dbErr.message);
      }
      setRuns((data as DiscoveryRun[]) || []);
    } catch (err) {
      console.error('[SourceHistory] Failed to fetch runs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load');
      setRuns([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (start: string | null, end: string | null): string => {
    if (!start || !end) return '—';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 0) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="p-5 space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5">
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          <Icons.AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Failed to load history</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
          <button
            onClick={fetchRuns}
            className="ml-auto flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800"
          >
            <Icons.RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="p-8 text-center">
        <Icons.Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-500">No sourcing runs yet</p>
        <p className="text-xs text-gray-400 mt-1">
          Run Manual or Auto sourcing to start building history
        </p>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-1">
      {/* Header Row */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Recent Discovery Runs</h3>
        <button
          onClick={fetchRuns}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          <Icons.RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="text-left py-2 pr-3 font-medium">Date</th>
              <th className="text-left py-2 px-3 font-medium">Status</th>
              <th className="text-right py-2 px-3 font-medium">Found</th>
              <th className="text-right py-2 px-3 font-medium">Imported</th>
              <th className="text-right py-2 px-3 font-medium">Rejected</th>
              <th className="text-right py-2 pl-3 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {runs.map((run) => (
              <tr key={run.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="py-2.5 pr-3 text-gray-900 font-medium whitespace-nowrap">
                  {formatDate(run.started_at || run.run_date)}
                </td>
                <td className="py-2.5 px-3">
                  <StatusBadge status={run.status} />
                </td>
                <td className="py-2.5 px-3 text-right text-gray-700 tabular-nums">
                  {run.total_products_found ?? '—'}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums">
                  <span className={run.products_imported && run.products_imported > 0 ? 'text-green-700 font-medium' : 'text-gray-500'}>
                    {run.products_imported ?? '—'}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right text-gray-500 tabular-nums">
                  {run.products_rejected ?? '—'}
                </td>
                <td className="py-2.5 pl-3 text-right text-gray-500 tabular-nums whitespace-nowrap">
                  {formatDuration(run.started_at, run.completed_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Status Badge ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    completed: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
    running: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500 animate-pulse' },
    failed: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  };
  const style = map[status] || { bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default SourcingPanel;
