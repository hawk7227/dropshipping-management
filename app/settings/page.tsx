'use client';

// app/settings/page.tsx
// COMPLETE Settings Page - Cron Jobs, Keepa Tokens, Pricing, Filters, Export, Batch Scraper
// Allows real-time management of all system settings with "Run Now" functionality
// FIXED: Using inline SVG icons instead of lucide-react

import { useState, useEffect, useCallback } from 'react';
import ScraperSettings from '@/components/settings/ScraperSettings';

// ═══════════════════════════════════════════════════════════════════════════
// INLINE SVG ICONS (replacing lucide-react)
// ═══════════════════════════════════════════════════════════════════════════

const Icons = {
  Settings: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Key: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  ),
  DollarSign: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Filter: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  ),
  Download: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  ),
  Play: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Pause: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  RefreshCw: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  AlertCircle: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  CheckCircle: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  ChevronRight: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  Save: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
    </svg>
  ),
  RotateCcw: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  ),
  Zap: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  Database: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
  Calendar: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  Activity: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  FileText: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  TrendingUp: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
};

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

type TabId = 'cron' | 'keepa' | 'pricing' | 'filters' | 'export' | 'scraper';

// ═══════════════════════════════════════════════════════════════════════════
// TABS CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const TABS: { id: TabId; label: string; icon: keyof typeof Icons; description: string }[] = [
  { id: 'cron', label: 'Cron Jobs', icon: 'Clock', description: 'Automated job schedules' },
  { id: 'scraper', label: 'Batch Scraper', icon: 'Database', description: 'Amazon product scraper' },
  { id: 'keepa', label: 'Keepa Tokens', icon: 'Key', description: 'API token management' },
  { id: 'pricing', label: 'Pricing', icon: 'DollarSign', description: 'Markup and pricing rules' },
  { id: 'filters', label: 'Filters', icon: 'Filter', description: 'Product discovery criteria' },
  { id: 'export', label: 'Export', icon: 'Download', description: 'Export format settings' },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function parseSettingValue(value: any): any {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function formatSchedule(cron: string): string {
  const schedules: Record<string, string> = {
    '0 4 * * *': 'Daily at 4:00 AM',
    '0 */6 * * *': 'Every 6 hours',
    '0 */12 * * *': 'Every 12 hours',
    '0 * * * *': 'Every hour',
    '*/30 * * * *': 'Every 30 minutes',
  };
  return schedules[cron] || cron;
}

function formatTimestamp(ts: string): string {
  if (!ts) return 'Never';
  const date = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('cron');
  const [settings, setSettings] = useState<Setting[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [runningJob, setRunningJob] = useState<string | null>(null);

  // Modified settings (unsaved changes)
  const [modifiedSettings, setModifiedSettings] = useState<Record<string, any>>({});

  // ─────────────────────────────────────────────────────────────────────────
  // FETCH DATA
  // ─────────────────────────────────────────────────────────────────────────

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/settings');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch settings');
      }

      setSettings(data.data.settings || []);
      setTokenUsage(data.data.tokenUsage || null);

      // Build cron jobs from settings and logs
      const cronSettings = (data.data.settings || []).filter((s: Setting) => s.category === 'cron');
      const cronLogs = data.data.cronLogs || {};

      const jobs: CronJob[] = [
        {
          id: 'discovery',
          name: 'Product Discovery',
          description: 'Find new products matching your criteria',
          schedule: parseSettingValue(cronSettings.find((s: Setting) => s.key === 'discovery_schedule')?.value) || '0 4 * * *',
          enabled: parseSettingValue(cronSettings.find((s: Setting) => s.key === 'discovery_enabled')?.value) ?? true,
          lastRun: cronLogs.discovery || null,
          nextRun: 'Calculating...',
          settingKey: 'discovery',
        },
        {
          id: 'price_sync',
          name: 'Price Sync',
          description: 'Update prices from Amazon/Keepa',
          schedule: parseSettingValue(cronSettings.find((s: Setting) => s.key === 'price_sync_schedule')?.value) || '0 */6 * * *',
          enabled: parseSettingValue(cronSettings.find((s: Setting) => s.key === 'price_sync_enabled')?.value) ?? true,
          lastRun: cronLogs.price_sync || null,
          nextRun: 'Calculating...',
          settingKey: 'price_sync',
        },
        {
          id: 'margin_check',
          name: 'Margin Check',
          description: 'Verify profit margins and flag issues',
          schedule: parseSettingValue(cronSettings.find((s: Setting) => s.key === 'margin_check_schedule')?.value) || '0 */12 * * *',
          enabled: parseSettingValue(cronSettings.find((s: Setting) => s.key === 'margin_check_enabled')?.value) ?? true,
          lastRun: cronLogs.margin_check || null,
          nextRun: 'Calculating...',
          settingKey: 'margin_check',
        },
      ];

      setCronJobs(jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // ─────────────────────────────────────────────────────────────────────────
  // SAVE SETTINGS
  // ─────────────────────────────────────────────────────────────────────────

  const saveSettings = async (category: string) => {
    setIsSaving(true);
    setError(null);

    try {
      const categorySettings = Object.entries(modifiedSettings)
        .filter(([key]) => key.startsWith(`${category}.`))
        .reduce((acc, [key, value]) => {
          const settingKey = key.replace(`${category}.`, '');
          acc[settingKey] = value;
          return acc;
        }, {} as Record<string, any>);

      if (Object.keys(categorySettings).length === 0) {
        setSuccess('No changes to save');
        setTimeout(() => setSuccess(null), 3000);
        return;
      }

      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, settings: categorySettings }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save settings');
      }

      // Clear modified settings for this category
      const newModified = { ...modifiedSettings };
      Object.keys(newModified)
        .filter(k => k.startsWith(`${category}.`))
        .forEach(k => delete newModified[k]);
      setModifiedSettings(newModified);

      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(null), 3000);

      // Refresh settings
      fetchSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RUN CRON JOB
  // ─────────────────────────────────────────────────────────────────────────

  const runCronJob = async (jobId: string) => {
    setRunningJob(jobId);
    setError(null);

    try {
      const response = await fetch(`/api/cron/${jobId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'manual' }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to run job');
      }

      setSuccess(`Job "${jobId}" completed successfully!`);
      setTimeout(() => setSuccess(null), 3000);

      // Refresh to get new stats
      fetchSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run job');
    } finally {
      setRunningJob(null);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // TOGGLE CRON JOB
  // ─────────────────────────────────────────────────────────────────────────

  const toggleCronJob = async (job: CronJob) => {
    const key = `cron.${job.settingKey}_enabled`;
    const newValue = !job.enabled;

    setModifiedSettings(prev => ({ ...prev, [key]: newValue }));

    // Auto-save immediately for toggle
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'cron',
          settings: { [`${job.settingKey}_enabled`]: newValue },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update');
      }

      fetchSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SETTING HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  const getSetting = (category: string, key: string): any => {
    const modKey = `${category}.${key}`;
    if (modifiedSettings[modKey] !== undefined) {
      return modifiedSettings[modKey];
    }

    const setting = settings.find(s => s.category === category && s.key === key);
    return setting ? parseSettingValue(setting.value) : null;
  };

  const updateSetting = (category: string, key: string, value: any) => {
    setModifiedSettings(prev => ({
      ...prev,
      [`${category}.${key}`]: value,
    }));
  };

  const hasChanges = (category: string): boolean => {
    return Object.keys(modifiedSettings).some(k => k.startsWith(`${category}.`));
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const IconComponent = Icons[TABS.find(t => t.id === activeTab)?.icon || 'Settings'];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
            <Icons.Settings />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-500">Manage cron jobs, pricing rules, and system configuration</p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
          <Icons.AlertCircle />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {success && (
        <div className="mx-6 mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3 text-green-700">
          <Icons.CheckCircle />
          <span>{success}</span>
        </div>
      )}

      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-73px)]">
          <nav className="p-4 space-y-1">
            {TABS.map(tab => {
              const TabIcon = Icons[tab.icon];
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <TabIcon />
                  <div>
                    <div className="font-medium">{tab.label}</div>
                    <div className="text-xs text-gray-500">{tab.description}</div>
                  </div>
                  {activeTab === tab.id && (
                    <div className="ml-auto">
                      <Icons.ChevronRight />
                    </div>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* Cron Jobs Tab */}
              {activeTab === 'cron' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-gray-900">Cron Jobs</h2>
                    <button
                      onClick={() => fetchSettings()}
                      className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900"
                    >
                      <Icons.RefreshCw />
                      Refresh
                    </button>
                  </div>

                  <div className="grid gap-4">
                    {cronJobs.map(job => (
                      <div
                        key={job.id}
                        className="bg-white border border-gray-200 rounded-lg p-5"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <h3 className="font-semibold text-gray-900">{job.name}</h3>
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                job.enabled 
                                  ? 'bg-green-100 text-green-700' 
                                  : 'bg-gray-100 text-gray-500'
                              }`}>
                                {job.enabled ? 'Active' : 'Paused'}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">{job.description}</p>
                            
                            <div className="mt-3 flex items-center gap-4 text-sm">
                              <div className="flex items-center gap-1 text-gray-600">
                                <Icons.Calendar />
                                {formatSchedule(job.schedule)}
                              </div>
                              {job.lastRun && (
                                <div className="flex items-center gap-1 text-gray-600">
                                  <Icons.Activity />
                                  Last: {formatTimestamp(job.lastRun.timestamp)}
                                  {job.lastRun.status === 'success' ? (
                                    <span className="text-green-600 ml-1">✓</span>
                                  ) : (
                                    <span className="text-red-600 ml-1">✗</span>
                                  )}
                                </div>
                              )}
                            </div>

                            {job.lastRun && (
                              <div className="mt-2 text-xs text-gray-500">
                                Processed: {job.lastRun.processed} | Errors: {job.lastRun.errors} | Duration: {job.lastRun.duration}s
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => runCronJob(job.id)}
                              disabled={runningJob === job.id}
                              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                            >
                              {runningJob === job.id ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                  Running...
                                </>
                              ) : (
                                <>
                                  <Icons.Play />
                                  Run Now
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => toggleCronJob(job)}
                              className={`p-2 rounded-lg ${
                                job.enabled
                                  ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                              title={job.enabled ? 'Pause job' : 'Enable job'}
                            >
                              {job.enabled ? <Icons.Pause /> : <Icons.Play />}
                            </button>

                            <button
                              className="p-2 text-gray-400 hover:text-gray-600"
                              title="View logs"
                            >
                              <Icons.FileText />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Keepa Tokens Tab */}
              {activeTab === 'keepa' && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900">Keepa Token Management</h2>

                  {/* Token Usage */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="font-medium text-gray-900 mb-4">Today's Usage</h3>
                    
                    {tokenUsage ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Tokens Used</span>
                          <span className="font-medium">{tokenUsage.used.toLocaleString()} / {tokenUsage.limit.toLocaleString()}</span>
                        </div>
                        
                        <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              tokenUsage.percentage > 80 ? 'bg-red-500' :
                              tokenUsage.percentage > 60 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(tokenUsage.percentage, 100)}%` }}
                          />
                        </div>

                        <div className="flex justify-between text-xs text-gray-500">
                          <span>{tokenUsage.remaining.toLocaleString()} remaining</span>
                          <span>{tokenUsage.percentage.toFixed(1)}% used</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-500">No usage data available</p>
                    )}
                  </div>

                  {/* Keepa Settings */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="font-medium text-gray-900 mb-4">Token Limits</h3>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Daily Token Limit
                        </label>
                        <input
                          type="number"
                          value={getSetting('keepa', 'daily_token_limit') || 10000}
                          onChange={(e) => updateSetting('keepa', 'daily_token_limit', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Warning Threshold
                        </label>
                        <input
                          type="number"
                          value={getSetting('keepa', 'warn_threshold') || 1000}
                          onChange={(e) => updateSetting('keepa', 'warn_threshold', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Warn before using this many tokens</p>
                      </div>
                    </div>
                  </div>

                  {/* Cache Settings */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="font-medium text-gray-900 mb-4">Cache Duration</h3>
                    
                    <div className="grid grid-cols-3 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Price Cache (hours)
                        </label>
                        <input
                          type="number"
                          value={getSetting('keepa', 'price_cache_hours') || 6}
                          onChange={(e) => updateSetting('keepa', 'price_cache_hours', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Product Info Cache (days)
                        </label>
                        <input
                          type="number"
                          value={getSetting('keepa', 'info_cache_days') || 7}
                          onChange={(e) => updateSetting('keepa', 'info_cache_days', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          BSR/Rating Cache (hours)
                        </label>
                        <input
                          type="number"
                          value={getSetting('keepa', 'bsr_cache_hours') || 24}
                          onChange={(e) => updateSetting('keepa', 'bsr_cache_hours', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Save Button */}
                  {hasChanges('keepa') && (
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setModifiedSettings({})}
                        className="px-4 py-2 text-gray-600 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveSettings('keepa')}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Icons.Save />
                        Save Changes
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Pricing Tab */}
              {activeTab === 'pricing' && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900">Pricing Rules</h2>

                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="font-medium text-gray-900 mb-4">Markup Settings</h3>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Default Markup (%)
                        </label>
                        <input
                          type="number"
                          value={getSetting('pricing', 'default_markup_percent') || 70}
                          onChange={(e) => updateSetting('pricing', 'default_markup_percent', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Your Price = Amazon × {1 + (getSetting('pricing', 'default_markup_percent') || 70) / 100}</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Compare-At Multiplier
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={getSetting('pricing', 'compare_at_multiplier') || 2.0}
                          onChange={(e) => updateSetting('pricing', 'compare_at_multiplier', parseFloat(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Compare-At = Your Price × {getSetting('pricing', 'compare_at_multiplier') || 2.0}</p>
                      </div>
                    </div>

                    <div className="mt-6">
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={getSetting('pricing', 'round_to_99') ?? true}
                          onChange={(e) => updateSetting('pricing', 'round_to_99', e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Round prices to .99 (e.g., $19.99 instead of $20.00)</span>
                      </label>
                    </div>
                  </div>

                  {/* Price Preview */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                    <h3 className="font-medium text-blue-900 mb-4">Preview</h3>
                    <div className="text-sm text-blue-800">
                      <p>If Amazon Price = $10.00:</p>
                      <ul className="mt-2 space-y-1">
                        <li>→ Your Price = ${((10 * (1 + (getSetting('pricing', 'default_markup_percent') || 70) / 100)) - 0.01).toFixed(2)}</li>
                        <li>→ Compare-At = ${((10 * (1 + (getSetting('pricing', 'default_markup_percent') || 70) / 100) * (getSetting('pricing', 'compare_at_multiplier') || 2)) - 0.01).toFixed(2)}</li>
                        <li>→ Your Profit = ${(10 * (getSetting('pricing', 'default_markup_percent') || 70) / 100).toFixed(2)} ({getSetting('pricing', 'default_markup_percent') || 70}%)</li>
                      </ul>
                    </div>
                  </div>

                  {hasChanges('pricing') && (
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setModifiedSettings({})}
                        className="px-4 py-2 text-gray-600 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveSettings('pricing')}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Icons.Save />
                        Save Changes
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Filters Tab */}
              {activeTab === 'filters' && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900">Product Discovery Filters</h2>
                  <p className="text-gray-500">These filters are used by both the 4AM cron job and manual sourcing.</p>

                  {/* Price Criteria */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="font-medium text-gray-900 mb-4">Price Criteria</h3>
                    
                    <div className="grid grid-cols-3 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Min Amazon Price ($)
                        </label>
                        <input
                          type="number"
                          value={getSetting('filters', 'min_amazon_price') || 3}
                          onChange={(e) => updateSetting('filters', 'min_amazon_price', parseFloat(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Max Amazon Price ($)
                        </label>
                        <input
                          type="number"
                          value={getSetting('filters', 'max_amazon_price') || 25}
                          onChange={(e) => updateSetting('filters', 'max_amazon_price', parseFloat(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Min Profit Margin (%)
                        </label>
                        <input
                          type="number"
                          value={getSetting('filters', 'min_profit_margin') || 30}
                          onChange={(e) => updateSetting('filters', 'min_profit_margin', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Quality Criteria */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="font-medium text-gray-900 mb-4">Quality Criteria</h3>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Min Reviews
                        </label>
                        <input
                          type="number"
                          value={getSetting('filters', 'min_reviews') || 500}
                          onChange={(e) => updateSetting('filters', 'min_reviews', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Min Rating
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="1"
                          max="5"
                          value={getSetting('filters', 'min_rating') || 3.5}
                          onChange={(e) => updateSetting('filters', 'min_rating', parseFloat(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Max BSR (Best Seller Rank)
                        </label>
                        <input
                          type="number"
                          value={getSetting('filters', 'max_bsr') || 100000}
                          onChange={(e) => updateSetting('filters', 'max_bsr', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Max Products Per Run
                        </label>
                        <input
                          type="number"
                          value={getSetting('filters', 'max_products_per_run') || 1000}
                          onChange={(e) => updateSetting('filters', 'max_products_per_run', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="mt-6">
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={getSetting('filters', 'require_prime') ?? true}
                          onChange={(e) => updateSetting('filters', 'require_prime', e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Require Prime eligibility</span>
                      </label>
                    </div>
                  </div>

                  {/* Exclusions */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="font-medium text-gray-900 mb-4">Exclusions</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Excluded Brands (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={(getSetting('filters', 'excluded_brands') || []).join(', ')}
                          onChange={(e) => updateSetting('filters', 'excluded_brands', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="Apple, Nike, Samsung..."
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Excluded Keywords (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={(getSetting('filters', 'excluded_keywords') || []).join(', ')}
                          onChange={(e) => updateSetting('filters', 'excluded_keywords', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="replica, counterfeit, fake..."
                        />
                      </div>
                    </div>
                  </div>

                  {hasChanges('filters') && (
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setModifiedSettings({})}
                        className="px-4 py-2 text-gray-600 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveSettings('filters')}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Icons.Save />
                        Save Changes
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Scraper Tab */}
              {activeTab === 'scraper' && (
                <ScraperSettings />
              )}

              {/* Export Tab */}
              {activeTab === 'export' && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900">Export Settings</h2>

                  {/* Shopify Settings */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="font-medium text-gray-900 mb-4">Shopify Export</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Export Format
                      </label>
                      <select
                        value={getSetting('export', 'shopify_format') || 'matrixify'}
                        onChange={(e) => updateSetting('export', 'shopify_format', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="matrixify">Matrixify (Recommended)</option>
                        <option value="native">Shopify Native CSV</option>
                      </select>
                    </div>
                  </div>

                  {/* eBay Settings */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="font-medium text-gray-900 mb-4">eBay Export</h3>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Default Condition
                        </label>
                        <select
                          value={getSetting('export', 'ebay_default_condition') || '1000'}
                          onChange={(e) => updateSetting('export', 'ebay_default_condition', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="1000">New</option>
                          <option value="1500">New (Other)</option>
                          <option value="2000">Refurbished</option>
                          <option value="3000">Used</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Listing Duration
                        </label>
                        <select
                          value={getSetting('export', 'ebay_default_duration') || 'GTC'}
                          onChange={(e) => updateSetting('export', 'ebay_default_duration', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="GTC">Good 'Til Cancelled</option>
                          <option value="Days_30">30 Days</option>
                          <option value="Days_7">7 Days</option>
                          <option value="Days_3">3 Days</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Export Options */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="font-medium text-gray-900 mb-4">Export Options</h3>
                    
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={getSetting('export', 'include_sold_out_file') ?? true}
                        onChange={(e) => updateSetting('export', 'include_sold_out_file', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Generate separate file for sold-out products</span>
                    </label>
                  </div>

                  {hasChanges('export') && (
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setModifiedSettings({})}
                        className="px-4 py-2 text-gray-600 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveSettings('export')}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Icons.Save />
                        Save Changes
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
