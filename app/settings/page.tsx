'use client';

// app/settings/page.tsx
// COMPLETE Settings Page - Cron Jobs, Keepa Tokens, Pricing, Filters, Export
// Allows real-time management of all system settings with "Run Now" functionality

import { useState, useEffect, useCallback } from 'react';
import { 
  Settings, Clock, Key, DollarSign, Filter, Download, 
  Play, Pause, RefreshCw, AlertCircle, CheckCircle, 
  ChevronRight, Save, RotateCcw, Zap, Database,
  Calendar, Activity, FileText, TrendingUp
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Setting {
  category: string;
  key: string;
  value: any;
  description: string;
  updated_at: string;
}

interface CronJob {
  id: string;
  name: string;
  description: string;
  schedule: string;
  enabled: boolean;
  lastRun: {
    status: string;
    timestamp: string;
    duration: number;
    processed: number;
    errors: number;
  } | null;
  nextRun: string;
  settingKey: string;
}

interface TokenUsage {
  used: number;
  remaining: number;
  limit: number;
  percentage: number;
}

type TabId = 'cron' | 'keepa' | 'pricing' | 'filters' | 'export';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const TABS: Array<{ id: TabId; label: string; icon: typeof Settings }> = [
  { id: 'cron', label: 'Cron Jobs', icon: Clock },
  { id: 'keepa', label: 'Keepa Tokens', icon: Zap },
  { id: 'pricing', label: 'Pricing', icon: DollarSign },
  { id: 'filters', label: 'Filters', icon: Filter },
  { id: 'export', label: 'Export', icon: Download },
];

const DEFAULT_CRON_JOBS: CronJob[] = [
  {
    id: 'discovery',
    name: 'Product Discovery',
    description: 'Discover new products matching your criteria from Amazon',
    schedule: '0 4 * * *',
    enabled: true,
    lastRun: null,
    nextRun: '',
    settingKey: 'discovery',
  },
  {
    id: 'price_sync',
    name: 'Price Sync',
    description: 'Update Amazon prices for all tracked products',
    schedule: '0 */6 * * *',
    enabled: true,
    lastRun: null,
    nextRun: '',
    settingKey: 'price_sync',
  },
  {
    id: 'margin_check',
    name: 'Margin Check',
    description: 'Check profit margins and generate alerts for low-margin products',
    schedule: '0 */12 * * *',
    enabled: true,
    lastRun: null,
    nextRun: '',
    settingKey: 'margin_check',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function parseSchedule(cron: string): string {
  // Simple cron to human readable
  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;
  
  const [min, hour, dayOfMonth, month, dayOfWeek] = parts;
  
  if (hour === '4' && min === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'Daily at 4:00 AM';
  }
  if (hour.startsWith('*/')) {
    return `Every ${hour.slice(2)} hours`;
  }
  if (min === '0' && hour !== '*') {
    return `Daily at ${hour}:00`;
  }
  
  return cron;
}

function getNextRun(schedule: string): string {
  // Calculate next run time based on cron schedule
  const now = new Date();
  const parts = schedule.split(' ');
  if (parts.length !== 5) return 'Unknown';
  
  const [min, hour] = parts;
  
  if (hour === '4' && min === '0') {
    const next = new Date(now);
    next.setHours(4, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.toLocaleString();
  }
  
  if (hour.startsWith('*/')) {
    const interval = parseInt(hour.slice(2));
    const next = new Date(now);
    const currentHour = next.getHours();
    const nextHour = Math.ceil(currentHour / interval) * interval;
    next.setHours(nextHour, 0, 0, 0);
    if (next <= now) next.setHours(next.getHours() + interval);
    return next.toLocaleString();
  }
  
  return 'Unknown';
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function SettingsPage() {
  // State
  const [activeTab, setActiveTab] = useState<TabId>('cron');
  const [settings, setSettings] = useState<Setting[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>(DEFAULT_CRON_JOBS);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({ used: 0, remaining: 10000, limit: 10000, percentage: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Form state for each tab
  const [cronSettings, setCronSettings] = useState({
    discovery_schedule: '0 4 * * *',
    discovery_enabled: true,
    price_sync_schedule: '0 */6 * * *',
    price_sync_enabled: true,
    margin_check_schedule: '0 */12 * * *',
    margin_check_enabled: true,
  });
  
  const [keepaSettings, setKeepaSettings] = useState({
    daily_token_limit: 10000,
    warn_threshold: 1000,
    price_cache_hours: 6,
    info_cache_days: 7,
    bsr_cache_hours: 24,
    skip_cached_on_import: true,
  });
  
  const [pricingSettings, setPricingSettings] = useState({
    default_markup_percent: 70,
    compare_at_multiplier: 2.0,
    round_to_99: true,
  });
  
  const [filterSettings, setFilterSettings] = useState({
    min_amazon_price: 3,
    max_amazon_price: 25,
    min_profit_margin: 30,
    min_reviews: 500,
    min_rating: 3.5,
    max_bsr: 100000,
    require_prime: true,
    excluded_brands: ['Apple', 'Nike', 'Samsung', 'Sony', 'Microsoft'],
    excluded_categories: ['Electronics', 'Clothing'],
    excluded_keywords: ['replica', 'counterfeit', 'fake', 'knockoff'],
    max_products_per_run: 1000,
  });
  
  const [exportSettings, setExportSettings] = useState({
    shopify_format: 'matrixify',
    ebay_default_condition: 1000,
    ebay_default_duration: 'GTC',
    include_sold_out_file: true,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ═══════════════════════════════════════════════════════════════════════════

  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/settings');
      if (!response.ok) throw new Error('Failed to fetch settings');
      
      const data = await response.json();
      if (data.success && data.data) {
        setSettings(data.data.settings || []);
        
        // Parse settings into form state
        const settingsMap = new Map(data.data.settings?.map((s: Setting) => [`${s.category}.${s.key}`, s.value]) || []);
        
        // Cron settings
        setCronSettings({
          discovery_schedule: JSON.parse(settingsMap.get('cron.discovery_schedule') || '"0 4 * * *"'),
          discovery_enabled: JSON.parse(settingsMap.get('cron.discovery_enabled') || 'true'),
          price_sync_schedule: JSON.parse(settingsMap.get('cron.price_sync_schedule') || '"0 */6 * * *"'),
          price_sync_enabled: JSON.parse(settingsMap.get('cron.price_sync_enabled') || 'true'),
          margin_check_schedule: JSON.parse(settingsMap.get('cron.margin_check_schedule') || '"0 */12 * * *"'),
          margin_check_enabled: JSON.parse(settingsMap.get('cron.margin_check_enabled') || 'true'),
        });
        
        // Keepa settings
        setKeepaSettings({
          daily_token_limit: JSON.parse(settingsMap.get('keepa.daily_token_limit') || '10000'),
          warn_threshold: JSON.parse(settingsMap.get('keepa.warn_threshold') || '1000'),
          price_cache_hours: JSON.parse(settingsMap.get('keepa.price_cache_hours') || '6'),
          info_cache_days: JSON.parse(settingsMap.get('keepa.info_cache_days') || '7'),
          bsr_cache_hours: JSON.parse(settingsMap.get('keepa.bsr_cache_hours') || '24'),
          skip_cached_on_import: JSON.parse(settingsMap.get('keepa.skip_cached_on_import') || 'true'),
        });
        
        // Token usage
        if (data.data.tokenUsage) {
          setTokenUsage(data.data.tokenUsage);
        }
        
        // Cron job status
        if (data.data.cronLogs) {
          setCronJobs(prev => prev.map(job => {
            const log = data.data.cronLogs.find((l: any) => l.job_type === job.id);
            return {
              ...job,
              lastRun: log ? {
                status: log.status,
                timestamp: log.completed_at || log.started_at,
                duration: log.duration_seconds || 0,
                processed: log.processed || 0,
                errors: log.errors || 0,
              } : null,
              nextRun: getNextRun(job.schedule),
            };
          }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const saveSettings = async (category: string, values: Record<string, any>) => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, settings: values }),
      });
      
      if (!response.ok) throw new Error('Failed to save settings');
      
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const runCronJob = async (jobId: string) => {
    setRunningJob(jobId);
    try {
      const response = await fetch(`/api/cron/${jobId}/run`, {
        method: 'POST',
      });
      
      if (!response.ok) throw new Error('Failed to start job');
      
      const data = await response.json();
      setMessage({ type: 'success', text: `${jobId} job started successfully!` });
      
      // Refresh to get updated status
      setTimeout(() => {
        fetchSettings();
        setRunningJob(null);
      }, 2000);
    } catch (error) {
      console.error('Failed to run job:', error);
      setMessage({ type: 'error', text: `Failed to start ${jobId} job` });
      setRunningJob(null);
    }
  };

  const toggleCronJob = async (jobId: string, enabled: boolean) => {
    const key = `${jobId}_enabled`;
    setCronSettings(prev => ({ ...prev, [key]: enabled }));
    await saveSettings('cron', { [key]: enabled });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER TABS
  // ═══════════════════════════════════════════════════════════════════════════

  const renderCronTab = () => (
    <div className="space-y-6">
      {/* Cron Jobs List */}
      {cronJobs.map((job) => {
        const scheduleKey = `${job.settingKey}_schedule` as keyof typeof cronSettings;
        const enabledKey = `${job.settingKey}_enabled` as keyof typeof cronSettings;
        const isEnabled = cronSettings[enabledKey] as boolean;
        const schedule = cronSettings[scheduleKey] as string;
        
        return (
          <div key={job.id} className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-gray-900">{job.name}</h3>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    isEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {isEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">{job.description}</p>
                
                {/* Schedule */}
                <div className="mt-4 flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">Schedule:</span>
                    <span className="font-medium">{parseSchedule(schedule)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">Next Run:</span>
                    <span className="font-medium">{getNextRun(schedule)}</span>
                  </div>
                </div>
                
                {/* Last Run Status */}
                {job.lastRun && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        {job.lastRun.status === 'success' ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className="text-gray-600">Last Run:</span>
                        <span className={`font-medium ${
                          job.lastRun.status === 'success' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {job.lastRun.status === 'success' ? 'Success' : 'Failed'}
                        </span>
                      </div>
                      <span className="text-gray-500">
                        {new Date(job.lastRun.timestamp).toLocaleString()}
                      </span>
                      <span className="text-gray-500">
                        {job.lastRun.processed} processed
                      </span>
                      {job.lastRun.errors > 0 && (
                        <span className="text-red-500">
                          {job.lastRun.errors} errors
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => runCronJob(job.id)}
                  disabled={runningJob === job.id}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {runningJob === job.id ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Run Now
                    </>
                  )}
                </button>
                <button
                  onClick={() => toggleCronJob(job.settingKey, !isEnabled)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                    isEnabled
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  {isEnabled ? (
                    <>
                      <Pause className="w-4 h-4" />
                      Disable
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Enable
                    </>
                  )}
                </button>
                <button
                  onClick={() => window.location.href = `/settings/logs?job=${job.id}`}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  <FileText className="w-4 h-4" />
                  View Logs
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderKeepaTab = () => (
    <div className="space-y-6">
      {/* Token Usage Card */}
      <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl p-6 text-white">
        <h3 className="text-lg font-semibold mb-4">Today's Token Usage</h3>
        <div className="flex items-end gap-8">
          <div>
            <div className="text-4xl font-bold">{tokenUsage.used.toLocaleString()}</div>
            <div className="text-purple-200">tokens used</div>
          </div>
          <div>
            <div className="text-4xl font-bold">{tokenUsage.remaining.toLocaleString()}</div>
            <div className="text-purple-200">remaining</div>
          </div>
          <div className="flex-1">
            <div className="h-4 bg-purple-400/30 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${tokenUsage.percentage}%` }}
              />
            </div>
            <div className="text-sm text-purple-200 mt-1 text-right">
              {tokenUsage.percentage.toFixed(1)}% of {tokenUsage.limit.toLocaleString()} daily limit
            </div>
          </div>
        </div>
      </div>
      
      {/* Keepa Settings */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Token Settings</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Daily Token Limit
            </label>
            <input
              type="number"
              value={keepaSettings.daily_token_limit}
              onChange={(e) => setKeepaSettings(prev => ({ ...prev, daily_token_limit: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Warn Before Using (tokens)
            </label>
            <input
              type="number"
              value={keepaSettings.warn_threshold}
              onChange={(e) => setKeepaSettings(prev => ({ ...prev, warn_threshold: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>
      
      {/* Cache Settings */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Cache Duration</h3>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Price Data (hours)
            </label>
            <input
              type="number"
              value={keepaSettings.price_cache_hours}
              onChange={(e) => setKeepaSettings(prev => ({ ...prev, price_cache_hours: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">How long to cache Amazon prices</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product Info (days)
            </label>
            <input
              type="number"
              value={keepaSettings.info_cache_days}
              onChange={(e) => setKeepaSettings(prev => ({ ...prev, info_cache_days: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Title, images, description</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              BSR/Rating (hours)
            </label>
            <input
              type="number"
              value={keepaSettings.bsr_cache_hours}
              onChange={(e) => setKeepaSettings(prev => ({ ...prev, bsr_cache_hours: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Sales rank and ratings</p>
          </div>
        </div>
        
        <div className="mt-4 flex items-center gap-3">
          <input
            type="checkbox"
            id="skip_cached"
            checked={keepaSettings.skip_cached_on_import}
            onChange={(e) => setKeepaSettings(prev => ({ ...prev, skip_cached_on_import: e.target.checked }))}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="skip_cached" className="text-sm text-gray-700">
            Skip cached ASINs on import (saves tokens)
          </label>
        </div>
      </div>
      
      <div className="flex justify-end">
        <button
          onClick={() => saveSettings('keepa', keepaSettings)}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );

  const renderPricingTab = () => (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Pricing Formula</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Markup (%)
            </label>
            <input
              type="number"
              value={pricingSettings.default_markup_percent}
              onChange={(e) => setPricingSettings(prev => ({ ...prev, default_markup_percent: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Your Price = Amazon Price × {((100 + pricingSettings.default_markup_percent) / 100).toFixed(2)}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Compare At Multiplier
            </label>
            <input
              type="number"
              step="0.1"
              value={pricingSettings.compare_at_multiplier}
              onChange={(e) => setPricingSettings(prev => ({ ...prev, compare_at_multiplier: parseFloat(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Compare At = Amazon Price × {pricingSettings.compare_at_multiplier}
            </p>
          </div>
        </div>
        
        <div className="mt-4 flex items-center gap-3">
          <input
            type="checkbox"
            id="round_99"
            checked={pricingSettings.round_to_99}
            onChange={(e) => setPricingSettings(prev => ({ ...prev, round_to_99: e.target.checked }))}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="round_99" className="text-sm text-gray-700">
            Round prices to .99 (e.g., $24.99 instead of $24.50)
          </label>
        </div>
      </div>
      
      {/* Preview */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h4 className="font-medium text-blue-900 mb-3">Preview</h4>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-blue-600">Amazon Price</div>
            <div className="text-2xl font-bold text-blue-900">$15.00</div>
          </div>
          <div>
            <div className="text-blue-600">Your Price</div>
            <div className="text-2xl font-bold text-green-600">
              ${((15 * (100 + pricingSettings.default_markup_percent) / 100)).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-blue-600">Compare At</div>
            <div className="text-2xl font-bold text-gray-500">
              ${(15 * pricingSettings.compare_at_multiplier).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-blue-600">Profit</div>
            <div className="text-2xl font-bold text-green-600">
              ${((15 * pricingSettings.default_markup_percent / 100)).toFixed(2)} ({pricingSettings.default_markup_percent}%)
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex justify-end">
        <button
          onClick={() => saveSettings('pricing', pricingSettings)}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );

  const renderFiltersTab = () => (
    <div className="space-y-6">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-yellow-600" />
          <p className="text-sm text-yellow-800">
            These filters are used by <strong>Cron Jobs</strong> AND <strong>Manual Sourcing</strong> on the Products page.
            Changes here will update both.
          </p>
        </div>
      </div>
      
      {/* Price Criteria */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Price Criteria</h3>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Min Amazon Price ($)
            </label>
            <input
              type="number"
              value={filterSettings.min_amazon_price}
              onChange={(e) => setFilterSettings(prev => ({ ...prev, min_amazon_price: parseFloat(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Amazon Price ($)
            </label>
            <input
              type="number"
              value={filterSettings.max_amazon_price}
              onChange={(e) => setFilterSettings(prev => ({ ...prev, max_amazon_price: parseFloat(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Min Profit Margin (%)
            </label>
            <input
              type="number"
              value={filterSettings.min_profit_margin}
              onChange={(e) => setFilterSettings(prev => ({ ...prev, min_profit_margin: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>
      
      {/* Quality Criteria */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quality Criteria</h3>
        <div className="grid grid-cols-4 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Min Reviews
            </label>
            <input
              type="number"
              value={filterSettings.min_reviews}
              onChange={(e) => setFilterSettings(prev => ({ ...prev, min_reviews: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Min Rating (out of 5)
            </label>
            <input
              type="number"
              step="0.1"
              value={filterSettings.min_rating}
              onChange={(e) => setFilterSettings(prev => ({ ...prev, min_rating: parseFloat(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max BSR
            </label>
            <input
              type="number"
              value={filterSettings.max_bsr}
              onChange={(e) => setFilterSettings(prev => ({ ...prev, max_bsr: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filterSettings.require_prime}
                onChange={(e) => setFilterSettings(prev => ({ ...prev, require_prime: e.target.checked }))}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Prime Required</span>
            </label>
          </div>
        </div>
      </div>
      
      {/* Exclusions */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Exclusions</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Excluded Brands (comma-separated)
            </label>
            <input
              type="text"
              value={filterSettings.excluded_brands.join(', ')}
              onChange={(e) => setFilterSettings(prev => ({ 
                ...prev, 
                excluded_brands: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Excluded Categories (comma-separated)
            </label>
            <input
              type="text"
              value={filterSettings.excluded_categories.join(', ')}
              onChange={(e) => setFilterSettings(prev => ({ 
                ...prev, 
                excluded_categories: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Excluded Keywords (comma-separated)
            </label>
            <input
              type="text"
              value={filterSettings.excluded_keywords.join(', ')}
              onChange={(e) => setFilterSettings(prev => ({ 
                ...prev, 
                excluded_keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>
      
      {/* Limits */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Limits</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Max Products Per Discovery Run
          </label>
          <input
            type="number"
            value={filterSettings.max_products_per_run}
            onChange={(e) => setFilterSettings(prev => ({ ...prev, max_products_per_run: parseInt(e.target.value) }))}
            className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>
      
      <div className="flex justify-end gap-3">
        <button
          onClick={() => setFilterSettings({
            min_amazon_price: 3,
            max_amazon_price: 25,
            min_profit_margin: 30,
            min_reviews: 500,
            min_rating: 3.5,
            max_bsr: 100000,
            require_prime: true,
            excluded_brands: ['Apple', 'Nike', 'Samsung', 'Sony', 'Microsoft'],
            excluded_categories: ['Electronics', 'Clothing'],
            excluded_keywords: ['replica', 'counterfeit', 'fake', 'knockoff'],
            max_products_per_run: 1000,
          })}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          <RotateCcw className="w-4 h-4" />
          Reset to Defaults
        </button>
        <button
          onClick={() => saveSettings('filters', filterSettings)}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );

  const renderExportTab = () => (
    <div className="space-y-6">
      {/* Shopify Settings */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Shopify Export</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Export Format
          </label>
          <select
            value={exportSettings.shopify_format}
            onChange={(e) => setExportSettings(prev => ({ ...prev, shopify_format: e.target.value }))}
            className="w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="matrixify">Matrixify (recommended)</option>
            <option value="native">Shopify Native CSV</option>
          </select>
        </div>
      </div>
      
      {/* eBay Settings */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">eBay Export</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Condition
            </label>
            <select
              value={exportSettings.ebay_default_condition}
              onChange={(e) => setExportSettings(prev => ({ ...prev, ebay_default_condition: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={1000}>New (1000)</option>
              <option value={1500}>New other (1500)</option>
              <option value={2000}>Certified refurbished (2000)</option>
              <option value={3000}>Used (3000)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Duration
            </label>
            <select
              value={exportSettings.ebay_default_duration}
              onChange={(e) => setExportSettings(prev => ({ ...prev, ebay_default_duration: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="GTC">Good 'Til Cancelled (GTC)</option>
              <option value="Days_30">30 Days</option>
              <option value="Days_7">7 Days</option>
              <option value="Days_3">3 Days</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Output Files */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Output Files</h3>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={exportSettings.include_sold_out_file}
            onChange={(e) => setExportSettings(prev => ({ ...prev, include_sold_out_file: e.target.checked }))}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">
            Generate separate file for sold out products
          </span>
        </label>
      </div>
      
      <div className="flex justify-end">
        <button
          onClick={() => saveSettings('export', exportSettings)}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6 text-gray-600" />
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          </div>
        </div>
      </div>
      
      {/* Message */}
      {message && (
        <div className={`max-w-7xl mx-auto px-6 pt-4`}>
          <div className={`p-4 rounded-lg flex items-center gap-2 ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            {message.text}
          </div>
        </div>
      )}
      
      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-6">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
        
        {/* Tab Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === 'cron' && renderCronTab()}
            {activeTab === 'keepa' && renderKeepaTab()}
            {activeTab === 'pricing' && renderPricingTab()}
            {activeTab === 'filters' && renderFiltersTab()}
            {activeTab === 'export' && renderExportTab()}
          </>
        )}
      </div>
    </div>
  );
}
