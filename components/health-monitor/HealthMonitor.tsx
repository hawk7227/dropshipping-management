// components/health-monitor/HealthMonitor.tsx
// Production Health Monitor - Dynamic monitoring for APIs, Crons, and Database Tables
// Features: Real-time health checks, cron job status from logs, table existence verification

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type ViewMode = 'micro' | 'expanded';
type TabType = 'overview' | 'apis' | 'crons' | 'database' | 'pages' | 'alerts';
type ServiceStatus = 'connected' | 'warning' | 'error' | 'mock' | 'stub' | 'inactive' | 'missing' | 'unknown';

interface ApiService {
  name: string;
  status: ServiceStatus;
  latency?: number;
  configured?: boolean;
}

interface CronJob {
  name: string;
  status: ServiceStatus;
  schedule: string;
  path: string;
  lastRun?: string;
  lastStatus?: 'completed' | 'failed' | 'running' | null;
}

interface DbTable {
  name: string;
  status: ServiceStatus;
  rows?: number;
  exists?: boolean;
}

interface PageHealth {
  name: string;
  path: string;
  status: ServiceStatus;
  percent: number;
  message: string;
}

interface Alert {
  id: string;
  priority: 'P1' | 'P2' | 'P3';
  message: string;
  time: string;
}

interface HealthState {
  loading: boolean;
  error: string | null;
  completion: number;
  overallStatus: 'healthy' | 'warning' | 'critical';
  apis: Record<string, ApiService>;
  cronJobs: Record<string, CronJob>;
  dbTables: Record<string, DbTable>;
  pages: Record<string, PageHealth>;
  alerts: Alert[];
  lastCheck: Date | null;
  dbLatency?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CRON JOBS FROM vercel.json - Will be updated dynamically
// ═══════════════════════════════════════════════════════════════════════════

const CRON_JOBS_CONFIG: Record<string, { name: string; schedule: string; path: string }> = {
  'product-discovery': { name: 'Product Discovery', schedule: '0 4 * * *', path: '/api/cron?job=product-discovery' },
  'price-sync': { name: 'Price Sync', schedule: '0 * * * *', path: '/api/cron?job=price-sync' },
  'full-price-sync': { name: 'Full Price Sync', schedule: '0 3 * * *', path: '/api/cron?job=full-price-sync' },
  'shopify-sync': { name: 'Shopify Sync', schedule: '0 */6 * * *', path: '/api/cron?job=shopify-sync' },
  'order-sync': { name: 'Order Sync', schedule: '*/15 * * * *', path: '/api/cron?job=order-sync' },
  'daily-stats': { name: 'Daily Stats', schedule: '0 0 * * *', path: '/api/cron?job=daily-stats' },
  'ai-scoring': { name: 'AI Scoring', schedule: '0 2 * * *', path: '/api/cron?job=ai-scoring' },
  'google-shopping': { name: 'Google Shopping', schedule: '0 5 * * *', path: '/api/cron?job=google-shopping' },
  'omnipresence': { name: 'Omnipresence', schedule: '0 6 * * *', path: '/api/cron?job=omnipresence' },
  'daily-learning': { name: 'Daily Learning', schedule: '0 23 * * *', path: '/api/cron?job=daily-learning' },
};

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE TABLES TO CHECK
// ═══════════════════════════════════════════════════════════════════════════

const DB_TABLES_CONFIG = [
  'products', 'variants', 'competitor_prices', 'price_history', 
  'price_sync_jobs', 'margin_alerts', 'margin_rules',
  'product_demand', 'discovery_runs', 'rejection_log', 
  'orders', 'cron_job_logs'
];

// ═══════════════════════════════════════════════════════════════════════════
// PAGES TO MONITOR
// ═══════════════════════════════════════════════════════════════════════════

const PAGES_CONFIG: Record<string, { name: string; path: string; basePercent: number; message: string }> = {
  dashboard: { name: 'Dashboard', path: '/dashboard', basePercent: 95, message: 'Fully functional' },
  products: { name: 'Products', path: '/products', basePercent: 90, message: 'Working' },
  prices: { name: 'Price Intelligence', path: '/prices', basePercent: 60, message: 'Needs competitor data' },
  sourcing: { name: 'AI Sourcing', path: '/sourcing', basePercent: 20, message: 'Needs Keepa API' },
  analytics: { name: 'Analytics', path: '/analytics', basePercent: 70, message: 'Basic charts' },
  social: { name: 'Social & Marketing', path: '/social', basePercent: 15, message: 'Not wired' },
  channels: { name: 'Sales Channels', path: '/channels', basePercent: 50, message: 'Partial' },
  ai: { name: 'AI Tools', path: '/ai', basePercent: 40, message: 'Limited' },
  membership: { name: 'Membership', path: '/membership', basePercent: 85, message: 'Working' },
  account: { name: 'Account', path: '/account', basePercent: 90, message: 'Working' },
};

// ═══════════════════════════════════════════════════════════════════════════
// INITIAL STATE
// ═══════════════════════════════════════════════════════════════════════════

const buildInitialCronJobs = (): Record<string, CronJob> => {
  const jobs: Record<string, CronJob> = {};
  for (const [key, config] of Object.entries(CRON_JOBS_CONFIG)) {
    jobs[key] = { ...config, status: 'unknown' };
  }
  return jobs;
};

const buildInitialDbTables = (): Record<string, DbTable> => {
  const tables: Record<string, DbTable> = {};
  for (const name of DB_TABLES_CONFIG) {
    tables[name] = { name, status: 'unknown' };
  }
  return tables;
};

const buildInitialPages = (): Record<string, PageHealth> => {
  const pages: Record<string, PageHealth> = {};
  for (const [key, config] of Object.entries(PAGES_CONFIG)) {
    pages[key] = { ...config, status: 'unknown', percent: config.basePercent };
  }
  return pages;
};

const initialState: HealthState = {
  loading: true,
  error: null,
  completion: 40,
  overallStatus: 'warning',
  apis: {
    supabase: { name: 'Supabase', status: 'unknown' },
    keepa: { name: 'Keepa', status: 'unknown' },
    rainforest: { name: 'Rainforest', status: 'unknown' },
    shopify: { name: 'Shopify', status: 'unknown' },
    stripe: { name: 'Stripe', status: 'inactive' },
    openai: { name: 'OpenAI', status: 'inactive' },
    zapier: { name: 'Zapier', status: 'inactive' },
  },
  cronJobs: buildInitialCronJobs(),
  dbTables: buildInitialDbTables(),
  pages: buildInitialPages(),
  alerts: [],
  lastCheck: null,
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function HealthMonitor() {
  const [state, setState] = useState<HealthState>(initialState);
  const [viewMode, setViewMode] = useState<ViewMode>('micro');
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isMinimized, setIsMinimized] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);

  // ═══════════════════════════════════════════════════════════════════════════
  // DYNAMIC HEALTH CHECK - Fetches real status from APIs
  // ═══════════════════════════════════════════════════════════════════════════

  const checkHealth = useCallback(async () => {
    try {
      // Fetch main health API
      const healthResponse = await fetch('/api/health');
      const healthData = await healthResponse.json();
      
      // Fetch cron job logs (dynamic cron status)
      let cronLogs: any[] = [];
      try {
        const cronResponse = await fetch('/api/health/crons');
        if (cronResponse.ok) {
          const cronData = await cronResponse.json();
          cronLogs = cronData.logs || [];
        }
      } catch {
        // Cron logs endpoint may not exist yet
      }

      // Fetch table status (dynamic table check)
      let tableStatus: Record<string, { exists: boolean; rows?: number }> = {};
      try {
        const tablesResponse = await fetch('/api/health/tables');
        if (tablesResponse.ok) {
          const tablesData = await tablesResponse.json();
          tableStatus = tablesData.tables || {};
        }
      } catch {
        // Tables endpoint may not exist yet
      }
      
      // Map API response to state
      const dbConnected = healthData.database?.connected === true;
      const dbLatency = healthData.database?.latency;
      
      const keepaConfigured = healthData.apis?.keepa?.configured === true;
      const shopifyConfigured = healthData.apis?.shopify?.configured === true;
      const rainforestConfigured = healthData.apis?.rainforest?.configured === true;
      const stripeConfigured = healthData.apis?.stripe?.configured === true;

      // Build alerts based on API status
      const alerts: Alert[] = [];
      
      if (!keepaConfigured) {
        alerts.push({ id: 'keepa', priority: 'P1', message: 'Keepa API not configured - AI sourcing disabled', time: 'Now' });
      }
      if (!dbConnected) {
        alerts.push({ id: 'db', priority: 'P1', message: 'Database connection failed', time: 'Now' });
      }
      if (!shopifyConfigured) {
        alerts.push({ id: 'shopify', priority: 'P2', message: 'Shopify API not connected', time: 'Now' });
      }

      // Build dynamic cron status
      const cronJobs: Record<string, CronJob> = {};
      for (const [key, config] of Object.entries(CRON_JOBS_CONFIG)) {
        const lastLog = cronLogs.find((log: any) => log.job_type === key);
        let status: ServiceStatus = 'stub'; // Default to stub if no logs
        let lastRun: string | undefined;
        let lastStatus: 'completed' | 'failed' | 'running' | null = null;
        
        if (lastLog) {
          lastRun = lastLog.completed_at || lastLog.started_at;
          lastStatus = lastLog.status;
          if (lastLog.status === 'completed') {
            status = 'connected';
          } else if (lastLog.status === 'failed') {
            status = 'error';
          } else if (lastLog.status === 'running') {
            status = 'warning';
          }
        }
        
        cronJobs[key] = { ...config, status, lastRun, lastStatus };
      }

      // Build dynamic table status
      const dbTables: Record<string, DbTable> = {};
      for (const tableName of DB_TABLES_CONFIG) {
        const tableInfo = tableStatus[tableName];
        let status: ServiceStatus = 'unknown';
        
        if (tableInfo) {
          status = tableInfo.exists ? 'connected' : 'missing';
        } else if (dbConnected) {
          // If DB is connected but we don't have specific table info, assume connected for core tables
          const coreTables = ['products', 'variants', 'price_history', 'orders'];
          status = coreTables.includes(tableName) ? 'connected' : 'missing';
        }
        
        dbTables[tableName] = { 
          name: tableName, 
          status, 
          rows: tableInfo?.rows,
          exists: tableInfo?.exists 
        };
      }

      // Build page status (adjusted by API availability)
      const pages: Record<string, PageHealth> = {};
      for (const [key, config] of Object.entries(PAGES_CONFIG)) {
        let percent = config.basePercent;
        let status: ServiceStatus = 'connected';
        let message = config.message;

        // Adjust based on dependencies
        if (key === 'sourcing' && !keepaConfigured) {
          percent = 20;
          status = 'error';
          message = 'Needs Keepa API';
        } else if (key === 'prices' && !rainforestConfigured) {
          percent = 60;
          status = 'warning';
          message = 'Needs competitor data';
        } else if (percent < 50) {
          status = 'error';
        } else if (percent < 80) {
          status = 'warning';
        }

        pages[key] = { ...config, status, percent, message };
      }

      // Calculate completion based on what's configured
      let completion = 30; // Base
      if (dbConnected) completion += 15;
      if (keepaConfigured) completion += 20;
      if (shopifyConfigured) completion += 15;
      if (rainforestConfigured) completion += 10;
      
      // Add points for working crons
      const workingCrons = Object.values(cronJobs).filter(c => c.status === 'connected').length;
      completion += Math.min(10, workingCrons);

      // Determine overall status
      let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (!dbConnected) overallStatus = 'critical';
      else if (!keepaConfigured || alerts.length > 0) overallStatus = 'warning';
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: null,
        completion: Math.min(100, completion),
        overallStatus,
        dbLatency,
        apis: {
          supabase: { name: 'Supabase', status: dbConnected ? 'connected' : 'error', latency: dbLatency, configured: dbConnected },
          keepa: { name: 'Keepa', status: keepaConfigured ? 'connected' : 'mock', configured: keepaConfigured },
          rainforest: { name: 'Rainforest', status: rainforestConfigured ? 'connected' : 'mock', configured: rainforestConfigured },
          shopify: { name: 'Shopify', status: shopifyConfigured ? 'connected' : 'warning', configured: shopifyConfigured },
          stripe: { name: 'Stripe', status: stripeConfigured ? 'connected' : 'inactive', configured: stripeConfigured },
          openai: { name: 'OpenAI', status: 'inactive', configured: false },
          zapier: { name: 'Zapier', status: 'inactive', configured: false },
        },
        cronJobs,
        dbTables,
        pages,
        alerts,
        lastCheck: new Date(),
      }));
    } catch (error) {
      console.error('[HealthMonitor] Check failed:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Health check failed',
        overallStatus: 'critical',
        lastCheck: new Date(),
      }));
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // ═══════════════════════════════════════════════════════════════════════════
  // DRAGGING
  // ═══════════════════════════════════════════════════════════════════════════

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, select, input')) return;
    setIsDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: position.x, startPosY: position.y };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setPosition({
        x: Math.max(0, dragRef.current.startPosX - (e.clientX - dragRef.current.startX)),
        y: Math.max(0, dragRef.current.startPosY - (e.clientY - dragRef.current.startY)),
      });
    };
    const handleMouseUp = () => { setIsDragging(false); dragRef.current = null; };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
  }, [isDragging]);

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  const getStatusDot = (status: ServiceStatus) => {
    switch (status) {
      case 'connected': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'error': case 'missing': return 'bg-red-500';
      case 'mock': return 'bg-orange-500';
      case 'stub': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: ServiceStatus) => {
    switch (status) {
      case 'connected': return '✅';
      case 'warning': return '⚠️';
      case 'error': case 'missing': return '🔴';
      case 'mock': return '🟠';
      default: return '⚪';
    }
  };

  const getStatusColor = (status: ServiceStatus) => {
    switch (status) {
      case 'connected': return 'text-green-400';
      case 'warning': return 'text-yellow-400';
      case 'error': case 'missing': return 'text-red-400';
      case 'mock': return 'text-orange-400';
      case 'stub': return 'text-purple-400';
      default: return 'text-gray-400';
    }
  };

  const countStats = () => {
    const apis = Object.values(state.apis);
    const crons = Object.values(state.cronJobs);
    const tables = Object.values(state.dbTables);
    const pages = Object.values(state.pages);
    
    return {
      apis: { ok: apis.filter(a => a.status === 'connected').length, total: apis.length },
      crons: { ok: crons.filter(c => c.status === 'connected').length, total: crons.length },
      tables: { ok: tables.filter(t => t.status === 'connected').length, total: tables.length },
      pages: { ok: pages.filter(p => p.status === 'connected').length, total: pages.length },
    };
  };

  const stats = countStats();
  const p1Alerts = state.alerts.filter(a => a.priority === 'P1');
  const borderColor = state.overallStatus === 'healthy' ? 'border-green-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]' :
    state.overallStatus === 'warning' ? 'border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.3)]' :
    'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]';

  // ═══════════════════════════════════════════════════════════════════════════
  // MINIMIZED VIEW
  // ═══════════════════════════════════════════════════════════════════════════

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        style={{ right: position.x, bottom: position.y }}
        className={`fixed z-[9000] w-12 h-12 rounded-full bg-[#1a1a2e] border-2 ${borderColor} flex items-center justify-center hover:scale-110 transition-transform`}
        title="Open Health Monitor"
      >
        <span className="text-lg">🔧</span>
      </button>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MICRO VIEW
  // ═══════════════════════════════════════════════════════════════════════════

  if (viewMode === 'micro') {
    return (
      <div
        onMouseDown={handleMouseDown}
        style={{ right: position.x, bottom: position.y }}
        className={`fixed z-[9000] bg-[#1a1a2e] rounded-xl border-2 ${borderColor} overflow-hidden transition-all duration-300 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        <div className="px-3 py-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${state.overallStatus === 'healthy' ? 'bg-green-500' : state.overallStatus === 'warning' ? 'bg-orange-500' : 'bg-red-500'}`} />
            <span className="text-white font-semibold text-sm">Health Monitor</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="flex bg-[#0f0f1a] rounded-md p-0.5">
              <button onClick={() => setViewMode('micro')} className="px-2 py-0.5 text-xs rounded bg-purple-600 text-white">•</button>
              <button onClick={() => setViewMode('expanded')} className="px-2 py-0.5 text-xs rounded text-gray-400 hover:text-white">▪▪▪</button>
            </div>
            <button onClick={() => setSoundEnabled(!soundEnabled)} className={`p-1 text-xs ${soundEnabled ? 'text-orange-400' : 'text-gray-500'}`}>
              {soundEnabled ? '🔔' : '🔕'}
            </button>
            <button onClick={() => setIsMinimized(true)} className="p-1 text-gray-400 hover:text-white text-xs">—</button>
          </div>
        </div>
        <div className="px-3 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {Object.values(state.apis).slice(0, 4).map((api, i) => (
              <span key={i} className={`w-2.5 h-2.5 rounded-full ${getStatusDot(api.status)}`} title={`${api.name}: ${api.status}`} />
            ))}
          </div>
          <span className="text-xs text-gray-500">
            {state.lastCheck ? state.lastCheck.toLocaleTimeString() : '—'}
          </span>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPANDED VIEW - TABS
  // ═══════════════════════════════════════════════════════════════════════════

  const renderOverviewTab = () => (
    <div className="space-y-4">
      {/* System Completion */}
      <div className="bg-[#0f0f1a] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-400 uppercase tracking-wider">System Completion</span>
          <span className="text-white font-bold">{state.completion}%</span>
        </div>
        <div className="mb-3">
          <div className="text-sm text-white mb-2">Overall Progress</div>
          <div className="h-3 bg-[#1a1a2e] rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500"
              style={{ width: `${state.completion}%` }}
            />
          </div>
        </div>
        <div className="flex justify-between text-xs">
          <div className="text-center"><div className="text-orange-400 font-bold">40%</div><div className="text-gray-500">Current</div></div>
          <div className="text-center"><div className="text-yellow-400 font-bold">60%</div><div className="text-gray-500">After P1</div></div>
          <div className="text-center"><div className="text-lime-400 font-bold">75%</div><div className="text-gray-500">After P2</div></div>
          <div className="text-center"><div className="text-green-400 font-bold">100%</div><div className="text-gray-500">Complete</div></div>
        </div>
      </div>

      {/* Priority Breakdown */}
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-3">Priority Breakdown</div>
        
        <div className="bg-[#0f0f1a] rounded-lg p-3 mb-2 border-l-4 border-red-500">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">P1</span>
              <span className="text-white text-sm font-medium">AI Product Sourcing</span>
            </div>
            <span className={`text-xs font-semibold ${state.apis.keepa.status === 'connected' ? 'text-green-400' : 'text-red-400'}`}>
              {state.apis.keepa.status === 'connected' ? 'CONNECTED' : 'NOT CONNECTED'}
            </span>
          </div>
          <div className="text-xs text-gray-400">
            Keepa {state.apis.keepa.status} • {Object.values(state.dbTables).filter(t => t.status === 'missing').length} tables missing • Discovery {state.cronJobs['product-discovery']?.status || 'unknown'}
          </div>
        </div>

        <div className="bg-[#0f0f1a] rounded-lg p-3 mb-2 border-l-4 border-orange-500">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">P2</span>
              <span className="text-white text-sm font-medium">Cron Jobs & Automation</span>
            </div>
            <span className="text-orange-400 text-xs font-semibold">
              {stats.crons.ok}/{stats.crons.total} ACTIVE
            </span>
          </div>
          <div className="text-xs text-gray-400">{stats.crons.total} cron jobs defined • {stats.crons.ok} working</div>
        </div>

        <div className="bg-[#0f0f1a] rounded-lg p-3 border-l-4 border-blue-500">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">P3</span>
              <span className="text-white text-sm font-medium">AI Social & Marketing</span>
            </div>
            <span className="text-blue-400 text-xs font-semibold">NOT WIRED</span>
          </div>
          <div className="text-xs text-gray-400">Zapier {state.apis.zapier.status} • OpenAI {state.apis.openai.status}</div>
        </div>
      </div>
    </div>
  );

  const renderApisTab = () => (
    <div className="space-y-2">
      {Object.entries(state.apis).map(([key, api]) => (
        <div key={key} className="flex items-center justify-between bg-[#0f0f1a] rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${getStatusDot(api.status)}`} />
            <span className="text-sm text-white">{api.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs uppercase font-medium ${getStatusColor(api.status)}`}>{api.status}</span>
            {api.latency && <span className="text-xs text-gray-500">{api.latency}ms</span>}
          </div>
        </div>
      ))}
    </div>
  );

  const renderCronsTab = () => (
    <div className="space-y-2">
      {Object.entries(state.cronJobs).map(([key, cron]) => (
        <div key={key} className="bg-[#0f0f1a] rounded-lg px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${getStatusDot(cron.status)}`} />
              <span className="text-sm text-white">{cron.name}</span>
            </div>
            <span className={`text-xs uppercase font-medium ${getStatusColor(cron.status)}`}>{cron.status}</span>
          </div>
          <div className="flex items-center justify-between mt-1 ml-5">
            <span className="text-xs text-gray-500 font-mono">{cron.schedule}</span>
            {cron.lastRun && (
              <span className="text-xs text-gray-500">Last: {new Date(cron.lastRun).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const renderDatabaseTab = () => (
    <div className="space-y-2">
      {state.dbLatency && (
        <div className="bg-[#0f0f1a] rounded-lg px-3 py-2 mb-3 flex items-center justify-between">
          <span className="text-xs text-gray-400">Database Latency</span>
          <span className={`text-sm font-mono ${state.dbLatency < 100 ? 'text-green-400' : state.dbLatency < 500 ? 'text-yellow-400' : 'text-red-400'}`}>
            {state.dbLatency}ms
          </span>
        </div>
      )}
      {Object.entries(state.dbTables).map(([key, table]) => (
        <div key={key} className="flex items-center justify-between bg-[#0f0f1a] rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${getStatusDot(table.status)}`} />
            <span className="text-sm text-white font-mono">{table.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs uppercase font-medium ${getStatusColor(table.status)}`}>{table.status}</span>
            {table.rows !== undefined && <span className="text-xs text-gray-500">{table.rows.toLocaleString()} rows</span>}
          </div>
        </div>
      ))}
    </div>
  );

  const renderPagesTab = () => (
    <div className="space-y-2">
      {Object.entries(state.pages).map(([key, page]) => (
        <div key={key} className="bg-[#0f0f1a] rounded-lg px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${getStatusDot(page.status)}`} />
              <span className="text-sm text-white">{page.name}</span>
            </div>
            <span className="text-xs text-gray-400">{page.percent}%</span>
          </div>
          <div className="h-1.5 bg-[#1a1a2e] rounded-full overflow-hidden mb-1">
            <div 
              className={`h-full rounded-full ${
                page.percent >= 70 ? 'bg-gradient-to-r from-green-500 to-emerald-500' :
                page.percent >= 40 ? 'bg-gradient-to-r from-yellow-500 to-orange-500' :
                'bg-gradient-to-r from-red-500 to-orange-500'
              }`}
              style={{ width: `${page.percent}%` }}
            />
          </div>
          <div className="text-xs text-gray-500">{page.message}</div>
        </div>
      ))}
    </div>
  );

  const renderAlertsTab = () => (
    <div className="space-y-3">
      {p1Alerts.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-red-400">🔴</span>
            <span className="text-sm font-semibold text-red-400">{p1Alerts.length} P1 Critical Issues</span>
          </div>
          <div className="text-xs text-gray-300">{p1Alerts.map(a => a.message).join(' • ')}</div>
        </div>
      )}
      {state.alerts.filter(a => a.priority !== 'P1').map(alert => (
        <div key={alert.id} className="bg-[#0f0f1a] rounded-lg p-3">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold text-white ${alert.priority === 'P2' ? 'bg-orange-500' : 'bg-blue-500'}`}>{alert.priority}</span>
            <span className="text-xs text-white">{alert.message}</span>
          </div>
        </div>
      ))}
      {state.alerts.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <span className="text-3xl">✅</span>
          <p className="text-sm mt-2">No active alerts</p>
        </div>
      )}
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview': return renderOverviewTab();
      case 'apis': return renderApisTab();
      case 'crons': return renderCronsTab();
      case 'database': return renderDatabaseTab();
      case 'pages': return renderPagesTab();
      case 'alerts': return renderAlertsTab();
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPANDED VIEW RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{ right: position.x, bottom: position.y }}
      className={`fixed z-[9000] w-[420px] bg-[#1a1a2e] rounded-xl border-2 ${borderColor} overflow-hidden transition-all duration-300 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
    >
      {/* Header */}
      <div className="px-4 py-3 bg-[#0f0f1a] border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-gray-400">⠿</span>
          <span className="text-white font-bold tracking-wide">DROPSHIP PRO HEALTH</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-10 h-10">
            <svg className="w-10 h-10 -rotate-90">
              <circle cx="20" cy="20" r="16" fill="none" stroke="#0f0f1a" strokeWidth="4" />
              <circle cx="20" cy="20" r="16" fill="none" stroke="#10b981" strokeWidth="4" strokeDasharray={`${state.completion * 1.005} 100`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">{state.completion}%</span>
          </div>
          <button onClick={() => setViewMode('micro')} className="p-1 text-gray-400 hover:text-white">∧</button>
          <button onClick={() => setIsMinimized(true)} className="p-1 text-gray-400 hover:text-white">—</button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-2 p-3 bg-[#0f0f1a] border-b border-gray-800">
        <div className="text-center">
          <div className={`text-lg font-bold ${stats.apis.ok > 0 ? 'text-green-400' : 'text-red-400'}`}>{stats.apis.ok}/{stats.apis.total}</div>
          <div className="text-[10px] text-gray-500">APIs</div>
        </div>
        <div className="text-center">
          <div className={`text-lg font-bold ${stats.crons.ok > 0 ? 'text-green-400' : 'text-red-400'}`}>{stats.crons.ok}/{stats.crons.total}</div>
          <div className="text-[10px] text-gray-500">Crons</div>
        </div>
        <div className="text-center">
          <div className={`text-lg font-bold ${stats.tables.ok === stats.tables.total ? 'text-green-400' : 'text-yellow-400'}`}>{stats.tables.ok}/{stats.tables.total}</div>
          <div className="text-[10px] text-gray-500">Tables</div>
        </div>
        <div className="text-center">
          <div className={`text-lg font-bold ${stats.pages.ok === stats.pages.total ? 'text-green-400' : 'text-yellow-400'}`}>{stats.pages.ok}/{stats.pages.total}</div>
          <div className="text-[10px] text-gray-500">Pages</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-2 bg-[#0f0f1a]">
        {(['overview', 'apis', 'crons', 'database', 'pages', 'alerts'] as TabType[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-2 py-1.5 text-[11px] rounded-md transition-colors capitalize ${
              activeTab === tab ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white hover:bg-[#1a1a2e]'
            }`}
          >
            {tab === 'alerts' && p1Alerts.length > 0 && <span className="text-yellow-400 mr-1">⚠</span>}
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-3 max-h-[350px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 #0f0f1a' }}>
        {state.loading ? (
          <div className="text-center py-8 text-gray-500">
            <div className="animate-spin text-2xl mb-2">⚙️</div>
            <p className="text-sm">Loading health data...</p>
          </div>
        ) : state.error ? (
          <div className="text-center py-8 text-red-400">
            <span className="text-2xl">❌</span>
            <p className="text-sm mt-2">{state.error}</p>
            <button onClick={checkHealth} className="mt-3 px-3 py-1 bg-purple-600 text-white text-xs rounded">Retry</button>
          </div>
        ) : (
          renderTabContent()
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-[#0f0f1a] border-t border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs">
          <span>Stripe: {getStatusIcon(state.apis.stripe.status)}</span>
          <span>Supabase: {getStatusIcon(state.apis.supabase.status)}</span>
          <span>Shopify: {getStatusIcon(state.apis.shopify.status)}</span>
          <span>Keepa: {getStatusIcon(state.apis.keepa.status)}</span>
        </div>
      </div>
    </div>
  );
}

export default HealthMonitor;
