// components/health-monitor/HealthMonitor.tsx
// Production Health Monitor - Full featured widget
// UPDATED: Removed Stripe, Crons show ACTIVE if configured, Failure alerts, Refresh button

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type ViewMode = 'micro' | 'summary' | 'full';
type TabType = 'apis' | 'crons' | 'database' | 'pages' | 'alerts';
type SystemState = 'healthy' | 'warning' | 'critical';
type ServiceStatus = 'connected' | 'warning' | 'error' | 'mock' | 'stub' | 'inactive' | 'missing' | 'active';

interface ServiceInfo {
  name: string;
  status: ServiceStatus;
  latency?: number;
  lastCheck?: string;
  message?: string;
}

interface CronJob {
  name: string;
  status: ServiceStatus;
  schedule: string;
  lastRun?: string;
  nextRun?: string;
  configured?: boolean;
  lastError?: string;
  lastErrorTime?: string;
}

interface DbTable {
  name: string;
  status: ServiceStatus;
  rows?: number;
}

interface PageHealth {
  name: string;
  status: ServiceStatus;
  percent: number;
  message: string;
}

interface Alert {
  id: string;
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  message: string;
  icon: string;
  time: string;
  type?: 'cron_failure' | 'api_error' | 'general';
}

interface HealthState {
  systemState: SystemState;
  completion: number;
  apis: Record<string, ServiceInfo>;
  cronJobs: Record<string, CronJob>;
  dbTables: Record<string, DbTable>;
  pages: Record<string, PageHealth>;
  alerts: Alert[];
  lastCheck: Date | null;
  isRefreshing: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIAL STATE - Includes Social & Campaign APIs
// ═══════════════════════════════════════════════════════════════════════════

const initialState: HealthState = {
  systemState: 'warning',
  completion: 40,
  apis: {
    // Core Product APIs
    supabase: { name: 'Supabase', status: 'connected', latency: 45 },
    keepa: { name: 'Keepa API', status: 'mock' },
    rainforest: { name: 'Rainforest API', status: 'mock' },
    shopify: { name: 'Shopify API', status: 'connected' },
    // Social & Marketing APIs
    zapier: { name: 'Zapier (Social)', status: 'inactive', message: 'Not configured' },
    openai: { name: 'OpenAI (AI Gen)', status: 'inactive', message: 'Not configured' },
    // Campaign / Messaging APIs
    mailgun: { name: 'Mailgun (Email)', status: 'inactive', message: 'Not configured' },
    clicksend: { name: 'ClickSend (SMS)', status: 'inactive', message: 'Not configured' },
    twilio: { name: 'Twilio (SMS/MMS)', status: 'inactive', message: 'Not configured' },
  },
  cronJobs: {
    priceSync: { name: 'Price Sync', status: 'stub', schedule: '*/15 * * * *', configured: false },
    productDiscovery: { name: 'Product Discovery', status: 'missing', schedule: '0 */6 * * *', configured: false },
    inventoryCheck: { name: 'Inventory Check', status: 'stub', schedule: '0 * * * *', configured: false },
    shopifySync: { name: 'Shopify Sync', status: 'stub', schedule: '*/30 * * * *', configured: false },
    alertDigest: { name: 'Alert Digest', status: 'stub', schedule: '0 9 * * *', configured: false },
  },
  dbTables: {
    products: { name: 'products', status: 'connected', rows: 156 },
    priceHistory: { name: 'price_history', status: 'connected', rows: 4521 },
    productDemand: { name: 'product_demand', status: 'missing' },
    discoveryRuns: { name: 'discovery_runs', status: 'missing' },
    rejectionLog: { name: 'rejection_log', status: 'missing' },
    alerts: { name: 'alerts', status: 'connected', rows: 23 },
  },
  pages: {
    dashboard: { name: 'Dashboard', status: 'connected', percent: 95, message: 'Fully functional' },
    products: { name: 'Products', status: 'connected', percent: 90, message: 'Working' },
    prices: { name: 'Price Intelligence', status: 'warning', percent: 60, message: 'Missing competitor data' },
    sourcing: { name: 'AI Sourcing', status: 'error', percent: 20, message: 'Needs Keepa API' },
    socialMarketing: { name: 'Social & Marketing', status: 'warning', percent: 50, message: 'Needs Zapier/OpenAI' },
    campaigns: { name: 'Campaigns', status: 'warning', percent: 40, message: 'Needs messaging API' },
    analytics: { name: 'Analytics', status: 'warning', percent: 70, message: 'Basic charts only' },
  },
  alerts: [
    { id: '1', priority: 'P1', message: 'Keepa API not configured - AI sourcing disabled', icon: '🔴', time: '2 hours ago' },
    { id: '2', priority: 'P1', message: 'Missing database tables for product discovery', icon: '🗄️', time: '2 hours ago' },
    { id: '3', priority: 'P2', message: 'Cron jobs running as stubs only', icon: '⏰', time: '1 day ago' },
    { id: '4', priority: 'P3', message: 'Zapier integration not connected - Social posting disabled', icon: '🔗', time: '3 days ago' },
    { id: '5', priority: 'P3', message: 'No messaging service configured - Campaigns disabled', icon: '📧', time: '3 days ago' },
  ],
  lastCheck: null,
  isRefreshing: false,
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function getStatusColor(status: ServiceStatus): string {
  const colors: Record<ServiceStatus, string> = {
    connected: 'bg-green-500',
    active: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500',
    mock: 'bg-orange-500',
    stub: 'bg-purple-500',
    inactive: 'bg-gray-500',
    missing: 'bg-red-500',
  };
  return colors[status] || 'bg-gray-500';
}

function getStatusText(status: ServiceStatus): string {
  const colors: Record<ServiceStatus, string> = {
    connected: 'text-green-400',
    active: 'text-green-400',
    warning: 'text-yellow-400',
    error: 'text-red-400',
    mock: 'text-orange-400',
    stub: 'text-purple-400',
    inactive: 'text-gray-400',
    missing: 'text-red-400',
  };
  return colors[status] || 'text-gray-400';
}

function getStatusLabel(status: ServiceStatus): string {
  const labels: Record<ServiceStatus, string> = {
    connected: 'OK',
    active: 'ACTIVE',
    warning: 'Warning',
    error: 'Error',
    mock: 'Mock',
    stub: 'Stub',
    inactive: 'N/A',
    missing: 'MISSING',
  };
  return labels[status] || status;
}

function getBorderColor(state: SystemState): string {
  const colors: Record<SystemState, string> = {
    healthy: 'border-green-500 shadow-green-500/20',
    warning: 'border-yellow-500 shadow-yellow-500/20',
    critical: 'border-red-500 shadow-red-500/30 animate-pulse',
  };
  return colors[state];
}

function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    P1: 'bg-red-500',
    P2: 'bg-orange-500',
    P3: 'bg-blue-500',
    P4: 'bg-gray-500',
  };
  return colors[priority] || 'bg-gray-500';
}

function countByStatus(items: Record<string, { status: ServiceStatus }>): { connected: number; total: number } {
  const values = Object.values(items);
  return {
    connected: values.filter(v => v.status === 'connected' || v.status === 'active').length,
    total: values.length,
  };
}

function formatTime(date: Date | null): string {
  if (!date) return 'Never';
  return date.toLocaleTimeString();
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function HealthMonitor() {
  const [state, setState] = useState<HealthState>(initialState);
  const [viewMode, setViewMode] = useState<ViewMode>('micro');
  const [activeTab, setActiveTab] = useState<TabType>('apis');
  const [isBooting, setIsBooting] = useState(true);
  const [bootStep, setBootStep] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);

  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  // Boot sequence
  useEffect(() => {
    if (!isBooting) return;
    const bootSteps = ['Initializing...', 'Checking APIs...', 'Loading database...', 'Scanning crons...', 'Ready!'];
    const interval = setInterval(() => {
      setBootStep(prev => {
        if (prev >= bootSteps.length - 1) {
          clearInterval(interval);
          setTimeout(() => setIsBooting(false), 500);
          return prev;
        }
        return prev + 1;
      });
    }, 400);
    return () => clearInterval(interval);
  }, [isBooting]);

  // Health check - UPDATED to handle crons with configured status
  const checkHealth = useCallback(async () => {
    setState(prev => ({ ...prev, isRefreshing: true }));
    
    try {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error('Health check failed');
      const data = await response.json();

      // Build alerts from cron failures
      const cronFailureAlerts: Alert[] = [];
      if (data.cronJobs) {
        Object.entries(data.cronJobs).forEach(([key, cron]: [string, any]) => {
          if (cron.lastError) {
            cronFailureAlerts.push({
              id: `cron-failure-${key}`,
              priority: 'P2',
              message: `Cron "${cron.name}" failed: ${cron.lastError}`,
              icon: '⚠️',
              time: cron.lastErrorTime || 'Recently',
              type: 'cron_failure',
            });
          }
        });
      }

      setState(prev => ({
        ...prev,
        apis: {
          // Core APIs
          supabase: { 
            name: 'Supabase', 
            status: data.database?.connected ? 'connected' : 'error', 
            latency: data.database?.latency 
          },
          keepa: { 
            name: 'Keepa API', 
            status: data.apis?.keepa?.configured ? 'connected' : 'mock',
            message: data.apis?.keepa?.configured ? 'Connected' : 'Not configured'
          },
          shopify: { 
            name: 'Shopify API', 
            status: data.apis?.shopify?.configured ? 'connected' : 'mock',
            message: data.apis?.shopify?.configured ? 'Connected' : 'Not configured'
          },
          rainforest: { 
            name: 'Rainforest API', 
            status: data.apis?.rainforest?.configured ? 'connected' : 'mock',
            message: data.apis?.rainforest?.configured ? 'Connected' : 'Not configured'
          },
          // Social & Marketing APIs
          zapier: { 
            name: 'Zapier (Social)', 
            status: data.apis?.zapier?.configured ? 'connected' : 'inactive',
            message: data.apis?.zapier?.configured ? 'Connected' : 'Not configured'
          },
          openai: { 
            name: 'OpenAI (AI Gen)', 
            status: data.apis?.openai?.configured ? 'connected' : 'inactive',
            message: data.apis?.openai?.configured ? 'Connected' : 'Not configured'
          },
          // Campaign / Messaging APIs
          mailgun: { 
            name: 'Mailgun (Email)', 
            status: data.apis?.mailgun?.configured ? 'connected' : 'inactive',
            message: data.apis?.mailgun?.configured ? 'Connected' : 'Not configured'
          },
          clicksend: { 
            name: 'ClickSend (SMS)', 
            status: data.apis?.clicksend?.configured ? 'connected' : 'inactive',
            message: data.apis?.clicksend?.configured ? 'Connected' : 'Not configured'
          },
          twilio: { 
            name: 'Twilio (SMS/MMS)', 
            status: data.apis?.twilio?.configured ? 'connected' : 'inactive',
            message: data.apis?.twilio?.configured ? 'Connected' : 'Not configured'
          },
        },
        // Update pages with Social & Campaign status
        pages: {
          ...prev.pages,
          socialMarketing: {
            name: 'Social & Marketing',
            status: data.socialMarketing?.configured ? 'connected' : 'warning',
            percent: data.socialMarketing?.configured ? (data.socialMarketing?.zapier && data.socialMarketing?.openai ? 100 : 50) : 20,
            message: data.socialMarketing?.message || 'Not configured',
          },
          campaigns: {
            name: 'Campaigns',
            status: data.campaigns?.configured ? 'connected' : 'warning',
            percent: data.campaigns?.configured ? (data.campaigns?.email && data.campaigns?.sms ? 100 : 60) : 20,
            message: data.campaigns?.message || 'Not configured',
          },
        },
        // Update cron jobs - show ACTIVE if configured with schedule
        cronJobs: data.cronJobs ? Object.entries(data.cronJobs).reduce((acc, [key, cron]: [string, any]) => {
          acc[key] = {
            name: cron.name,
            status: cron.configured ? 'active' : (cron.status || 'stub'),
            schedule: cron.schedule,
            lastRun: cron.lastRun,
            nextRun: cron.nextRun,
            configured: cron.configured,
            lastError: cron.lastError,
            lastErrorTime: cron.lastErrorTime,
          };
          return acc;
        }, {} as Record<string, CronJob>) : prev.cronJobs,
        // Merge cron failure alerts with existing alerts
        alerts: [
          ...cronFailureAlerts,
          ...prev.alerts.filter(a => a.type !== 'cron_failure'),
        ],
        systemState: data.status === 'healthy' ? 'healthy' : data.status === 'degraded' ? 'warning' : 'critical',
        lastCheck: new Date(),
        isRefreshing: false,
      }));
    } catch (error) {
      console.error('[HealthMonitor] Check failed:', error);
      setState(prev => ({ ...prev, systemState: 'critical', lastCheck: new Date(), isRefreshing: false }));
    }
  }, []);

  useEffect(() => {
    if (!isBooting) {
      checkHealth();
      const interval = setInterval(checkHealth, 30000);
      return () => clearInterval(interval);
    }
  }, [isBooting, checkHealth]);

  // Dragging logic
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
        x: dragRef.current.startPosX - (e.clientX - dragRef.current.startX),
        y: dragRef.current.startPosY - (e.clientY - dragRef.current.startY),
      });
    };
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Minimized view
  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        style={{ right: 20, bottom: 20 }}
        className={`fixed z-[9000] w-12 h-12 rounded-full flex items-center justify-center transition-all ${
          state.systemState === 'healthy' ? 'bg-green-500/20 border-2 border-green-500' :
          state.systemState === 'warning' ? 'bg-yellow-500/20 border-2 border-yellow-500 animate-pulse' :
          'bg-red-500/20 border-2 border-red-500 animate-pulse'
        }`}
      >
        <span className={`w-4 h-4 rounded-full shadow-lg ${getStatusColor(state.systemState === 'healthy' ? 'connected' : state.systemState === 'warning' ? 'warning' : 'error')}`} />
      </button>
    );
  }

  // Boot screen
  if (isBooting) {
    const bootSteps = ['Initializing...', 'Checking APIs...', 'Loading database...', 'Scanning crons...', 'Ready!'];
    return (
      <div
        style={{ right: position.x, bottom: position.y }}
        className="fixed z-[9000] w-52 bg-[#12121a] rounded-2xl border-2 border-purple-500 p-4"
      >
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-white">{bootSteps[bootStep]}</p>
          <div className="flex justify-center gap-1 mt-2">
            {bootSteps.map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= bootStep ? 'bg-purple-500' : 'bg-gray-600'}`} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Tab content renderer
  const renderTabContent = () => {
    switch (activeTab) {
      case 'apis':
        return (
          <div className="space-y-2">
            {Object.entries(state.apis).map(([key, api]) => (
              <div key={key} className="flex items-center justify-between bg-[#1a1a24] rounded-lg p-2.5">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full shadow ${getStatusColor(api.status)}`} />
                  <span className="text-sm text-white">{api.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {api.latency && <span className="text-xs text-gray-500">{api.latency}ms</span>}
                  <span className={`text-xs font-medium ${getStatusText(api.status)}`}>{getStatusLabel(api.status)}</span>
                </div>
              </div>
            ))}
          </div>
        );

      case 'crons':
        // Check for any cron failures
        const hasFailures = Object.values(state.cronJobs).some(c => c.lastError);
        return (
          <div className="space-y-2">
            {hasFailures && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 mb-3">
                <div className="flex items-center gap-2 text-red-400 text-xs">
                  <span>⚠️</span>
                  <span>Some cron jobs have failed - check Alerts tab</span>
                </div>
              </div>
            )}
            {Object.entries(state.cronJobs).map(([key, cron]) => (
              <div key={key} className={`bg-[#1a1a24] rounded-lg p-2.5 ${cron.lastError ? 'border border-red-500/30' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full shadow ${getStatusColor(cron.status)}`} />
                    <span className="text-sm text-white">{cron.name}</span>
                  </div>
                  <span className={`text-xs font-medium ${getStatusText(cron.status)}`}>
                    {cron.configured ? 'ACTIVE' : getStatusLabel(cron.status)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                  <span>📅 {cron.schedule}</span>
                  {cron.lastRun && <span>Last: {cron.lastRun}</span>}
                </div>
                {cron.lastError && (
                  <div className="mt-2 text-xs text-red-400 bg-red-500/10 rounded p-1.5">
                    ⚠️ {cron.lastError}
                  </div>
                )}
              </div>
            ))}
          </div>
        );

      case 'database':
        return (
          <div className="space-y-2">
            {Object.entries(state.dbTables).map(([key, table]) => (
              <div key={key} className="flex items-center justify-between bg-[#1a1a24] rounded-lg p-2.5">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full shadow ${getStatusColor(table.status)}`} />
                  <span className="text-sm text-white font-mono">{table.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {table.rows !== undefined && <span className="text-xs text-gray-500">{table.rows} rows</span>}
                  <span className={`text-xs font-medium ${getStatusText(table.status)}`}>{getStatusLabel(table.status)}</span>
                </div>
              </div>
            ))}
          </div>
        );

      case 'pages':
        return (
          <div className="space-y-2">
            {Object.entries(state.pages).map(([key, page]) => (
              <div key={key} className="bg-[#1a1a24] rounded-lg p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-white">{page.name}</span>
                  <span className={`text-xs font-medium ${getStatusText(page.status)}`}>{page.percent}%</span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      page.percent >= 80 ? 'bg-green-500' :
                      page.percent >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${page.percent}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">{page.message}</p>
              </div>
            ))}
          </div>
        );

      case 'alerts':
        const criticalAlerts = state.alerts.filter(a => a.priority === 'P1');
        const cronFailureAlerts = state.alerts.filter(a => a.type === 'cron_failure');
        const otherAlerts = state.alerts.filter(a => a.priority !== 'P1' && a.type !== 'cron_failure');
        return (
          <div className="space-y-3">
            {criticalAlerts.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-red-400 mb-2">🚨 Critical ({criticalAlerts.length})</div>
                <div className="space-y-2">
                  {criticalAlerts.map(alert => (
                    <div key={alert.id} className="bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                      <div className="flex items-start gap-2">
                        <span>{alert.icon}</span>
                        <div className="flex-1">
                          <p className="text-xs text-white">{alert.message}</p>
                          <p className="text-xs text-gray-500">{alert.time}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {cronFailureAlerts.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-orange-400 mb-2">⏰ Cron Failures ({cronFailureAlerts.length})</div>
                <div className="space-y-2">
                  {cronFailureAlerts.map(alert => (
                    <div key={alert.id} className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-2">
                      <div className="flex items-start gap-2">
                        <span>{alert.icon}</span>
                        <div className="flex-1">
                          <p className="text-xs text-white">{alert.message}</p>
                          <p className="text-xs text-gray-500">{alert.time}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {otherAlerts.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-yellow-400 mb-2">⚠️ Other Alerts ({otherAlerts.length})</div>
                <div className="space-y-2">
                  {otherAlerts.map(alert => (
                    <div key={alert.id} className="bg-[#1a1a24] rounded-lg p-2">
                      <div className="flex items-start gap-2">
                        <span>{alert.icon}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-white">{alert.message}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold text-white ${getPriorityColor(alert.priority)}`}>{alert.priority}</span>
                          </div>
                          <p className="text-xs text-gray-500">{alert.time}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {state.alerts.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <span className="text-3xl">✅</span>
                <p className="text-sm mt-2">No active alerts</p>
              </div>
            )}
          </div>
        );
    }
  };

  // Widget sizes
  const widgetSize = viewMode === 'micro' ? 'w-52' : viewMode === 'summary' ? 'w-80' : 'w-[420px]';

  return (
    <div
      ref={widgetRef}
      onMouseDown={handleMouseDown}
      style={{ right: position.x, bottom: position.y }}
      className={`fixed z-[9000] ${widgetSize} bg-[#12121a] rounded-2xl border-2 ${getBorderColor(state.systemState)} overflow-hidden transition-all duration-300 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
    >
      {/* Header */}
      <div className="p-3 bg-[#1a1a24] border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full shadow-lg ${getStatusColor(state.systemState === 'healthy' ? 'connected' : state.systemState === 'warning' ? 'warning' : 'error')}`} />
          <span className="text-white font-semibold text-sm">Health Monitor</span>
        </div>
        <div className="flex items-center gap-1">
          {/* View mode buttons */}
          <div className="flex bg-[#0a0a0f] rounded-lg p-0.5">
            {(['micro', 'summary', 'full'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  viewMode === mode ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {mode === 'micro' ? '•' : mode === 'summary' ? '▪▪' : '▪▪▪'}
              </button>
            ))}
          </div>
          <button onClick={() => setSoundEnabled(!soundEnabled)} className={`p-1.5 rounded text-xs ${soundEnabled ? 'text-purple-400' : 'text-gray-500'}`}>
            {soundEnabled ? '🔔' : '🔕'}
          </button>
          <button onClick={() => setIsMinimized(true)} className="p-1.5 hover:bg-gray-800 rounded text-gray-400 text-sm">—</button>
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {/* Micro View */}
        {viewMode === 'micro' && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {Object.values(state.apis).slice(0, 4).map((api, i) => (
                <span key={i} className={`w-2.5 h-2.5 rounded-full shadow ${getStatusColor(api.status)}`} title={`${api.name}: ${api.status}`} />
              ))}
            </div>
            <span className="text-xs text-gray-500">{formatTime(state.lastCheck)}</span>
          </div>
        )}

        {/* Summary View */}
        {viewMode === 'summary' && (
          <div className="space-y-3">
            {/* Completion Ring */}
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: `conic-gradient(#10b981 ${state.completion}%, #1a1a24 0)` }}
              >
                <div className="w-11 h-11 rounded-full bg-[#12121a] flex items-center justify-center">
                  <span className="text-sm font-bold text-white">{state.completion}%</span>
                </div>
              </div>
              <div>
                <p className="text-white font-medium">System Health</p>
                <p className="text-xs text-gray-500">
                  {countByStatus(state.apis).connected}/{countByStatus(state.apis).total} APIs connected
                </p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#1a1a24] rounded-lg p-2">
                <p className="text-xs text-gray-500">APIs</p>
                <p className="text-lg font-bold text-green-400">{countByStatus(state.apis).connected}/{countByStatus(state.apis).total}</p>
              </div>
              <div className="bg-[#1a1a24] rounded-lg p-2">
                <p className="text-xs text-gray-500">Alerts</p>
                <p className="text-lg font-bold text-red-400">{state.alerts.length}</p>
              </div>
            </div>

            <div className="text-xs text-gray-500 text-center">
              Last check: {formatTime(state.lastCheck)}
            </div>
          </div>
        )}

        {/* Full View */}
        {viewMode === 'full' && (
          <div className="space-y-3">
            {/* Completion + Stats Header */}
            <div className="flex items-center justify-between bg-[#1a1a24] rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: `conic-gradient(#10b981 ${state.completion}%, #1a1a24 0)` }}
                >
                  <div className="w-9 h-9 rounded-full bg-[#12121a] flex items-center justify-center">
                    <span className="text-xs font-bold text-white">{state.completion}%</span>
                  </div>
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Overall Health</p>
                  <p className={`text-xs font-medium ${getStatusText(state.systemState === 'healthy' ? 'connected' : state.systemState === 'warning' ? 'warning' : 'error')}`}>
                    {state.systemState.toUpperCase()}
                  </p>
                </div>
              </div>
              <button 
                onClick={checkHealth} 
                disabled={state.isRefreshing}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors flex items-center gap-1.5"
              >
                {state.isRefreshing ? (
                  <>
                    <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                    <span>Checking...</span>
                  </>
                ) : (
                  <>
                    <span>🔄</span>
                    <span>Refresh</span>
                  </>
                )}
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-[#0a0a0f] rounded-lg p-1">
              {(['apis', 'crons', 'database', 'pages', 'alerts'] as TabType[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-2 py-1.5 text-xs rounded-md transition-colors capitalize ${
                    activeTab === tab ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {tab === 'alerts' && state.alerts.length > 0 && (
                    <span className="inline-block w-1.5 h-1.5 bg-red-500 rounded-full mr-1" />
                  )}
                  {tab === 'crons' && Object.values(state.cronJobs).some(c => c.lastError) && (
                    <span className="inline-block w-1.5 h-1.5 bg-orange-500 rounded-full mr-1" />
                  )}
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="max-h-64 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 #1a1a24' }}>
              {renderTabContent()}
            </div>

            {/* Footer with Refresh Info */}
            <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-800">
              <span>Last: {formatTime(state.lastCheck)}</span>
              <span>Auto-refresh: 30s</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default HealthMonitor;

