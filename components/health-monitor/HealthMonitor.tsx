// components/health-monitor/HealthMonitor.tsx
// Production Health Monitor - Full featured widget matching reference design
// Features: Boot sequence, 3 view modes, tabs (APIs/Crons/DB/Pages/Alerts), completion ring, priority alerts

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type ViewMode = 'micro' | 'summary' | 'full';
type TabType = 'apis' | 'crons' | 'database' | 'pages' | 'alerts';
type SystemState = 'healthy' | 'warning' | 'critical';
type ServiceStatus = 'connected' | 'warning' | 'error' | 'mock' | 'stub' | 'inactive' | 'missing';

interface ServiceInfo {
  name: string;
  status: ServiceStatus;
  latency?: number;
  lastCheck?: string;
}

interface CronJob {
  name: string;
  status: ServiceStatus;
  schedule: string;
  lastRun?: string;
  nextRun?: string;
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
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIAL STATE
// ═══════════════════════════════════════════════════════════════════════════

const initialState: HealthState = {
  systemState: 'warning',
  completion: 40,
  apis: {
    supabase: { name: 'Supabase', status: 'connected', latency: 45 },
    keepa: { name: 'Keepa API', status: 'mock' },
    rainforest: { name: 'Rainforest API', status: 'mock' },
    shopify: { name: 'Shopify API', status: 'connected' },
    stripe: { name: 'Stripe', status: 'mock' },
    zapier: { name: 'Zapier', status: 'inactive' },
  },
  cronJobs: {
    priceSync: { name: 'Price Sync', status: 'stub', schedule: '*/15 * * * *' },
    productDiscovery: { name: 'Product Discovery', status: 'missing', schedule: '0 */6 * * *' },
    inventoryCheck: { name: 'Inventory Check', status: 'stub', schedule: '0 * * * *' },
    shopifySync: { name: 'Shopify Sync', status: 'stub', schedule: '*/30 * * * *' },
    alertDigest: { name: 'Alert Digest', status: 'stub', schedule: '0 9 * * *' },
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
    analytics: { name: 'Analytics', status: 'warning', percent: 70, message: 'Basic charts only' },
  },
  alerts: [
    { id: '1', priority: 'P1', message: 'Keepa API not configured - AI sourcing disabled', icon: '🔴', time: '2 hours ago' },
    { id: '2', priority: 'P1', message: 'Missing database tables for product discovery', icon: '🗄️', time: '2 hours ago' },
    { id: '3', priority: 'P2', message: 'Cron jobs running as stubs only', icon: '⏰', time: '1 day ago' },
    { id: '4', priority: 'P3', message: 'Zapier integration not connected', icon: '🔗', time: '3 days ago' },
  ],
  lastCheck: null,
};

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

  // Health check
  const checkHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error('Health check failed');
      const data = await response.json();
      
      setState(prev => ({
        ...prev,
        apis: {
          ...prev.apis,
          supabase: { ...prev.apis.supabase, status: data.database?.connected ? 'connected' : 'error', latency: data.database?.latency },
          keepa: { ...prev.apis.keepa, status: data.apis?.keepa?.configured ? 'connected' : 'mock' },
          shopify: { ...prev.apis.shopify, status: data.apis?.shopify?.configured ? 'connected' : 'mock' },
          rainforest: { ...prev.apis.rainforest, status: data.apis?.rainforest?.configured ? 'connected' : 'mock' },
        },
        systemState: data.status === 'healthy' ? 'healthy' : data.status === 'degraded' ? 'warning' : 'critical',
        lastCheck: new Date(),
      }));
    } catch (error) {
      console.error('[HealthMonitor] Check failed:', error);
      setState(prev => ({ ...prev, systemState: 'critical', lastCheck: new Date() }));
    }
  }, []);

  useEffect(() => {
    if (!isBooting) {
      checkHealth();
      const interval = setInterval(checkHealth, 30000);
      return () => clearInterval(interval);
    }
  }, [isBooting, checkHealth]);

  // Dragging
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

  // Helpers
  const getStatusColor = (status: ServiceStatus) => {
    switch (status) {
      case 'connected': return 'bg-green-500 shadow-green-500/50';
      case 'warning': return 'bg-yellow-500 shadow-yellow-500/50';
      case 'error': case 'missing': return 'bg-red-500 shadow-red-500/50 animate-pulse';
      case 'mock': return 'bg-orange-500 shadow-orange-500/50';
      case 'stub': return 'bg-purple-500 shadow-purple-500/50';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: ServiceStatus) => {
    switch (status) {
      case 'connected': return 'text-green-400';
      case 'warning': return 'text-yellow-400';
      case 'error': case 'missing': return 'text-red-400';
      case 'mock': return 'text-orange-400';
      case 'stub': return 'text-purple-400';
      default: return 'text-gray-400';
    }
  };

  const getBorderColor = (systemState: SystemState) => {
    switch (systemState) {
      case 'healthy': return 'border-green-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]';
      case 'warning': return 'border-yellow-500 shadow-[0_0_20px_rgba(245,158,11,0.3)]';
      case 'critical': return 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.5)] animate-pulse';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'P1': return 'bg-red-500';
      case 'P2': return 'bg-orange-500';
      case 'P3': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const countByStatus = (items: Record<string, { status: ServiceStatus }>) => {
    const values = Object.values(items);
    return {
      total: values.length,
      connected: values.filter(v => v.status === 'connected').length,
      issues: values.filter(v => ['error', 'missing'].includes(v.status)).length,
    };
  };

  // Boot screen
  if (isBooting) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0f] z-[10000] flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-6">🔧</div>
          <h2 className="text-xl font-bold text-white mb-2">System Health Monitor</h2>
          <p className="text-gray-500 text-sm mb-6">Dropship Pro</p>
          <div className="space-y-3 text-left w-72">
            {['Initializing...', 'Checking APIs...', 'Loading database...', 'Scanning crons...', 'Ready!'].map((step, i) => (
              <div key={i} className={`flex items-center gap-3 text-sm transition-all duration-300 ${i <= bootStep ? 'opacity-100' : 'opacity-30'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i < bootStep ? 'bg-green-500 text-white' : 
                  i === bootStep ? 'bg-purple-500 text-white animate-pulse' : 'bg-gray-800 text-gray-500'
                }`}>
                  {i < bootStep ? '✓' : i === bootStep ? '...' : i + 1}
                </span>
                <span className={i <= bootStep ? 'text-white' : 'text-gray-600'}>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Minimized
  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        style={{ right: position.x, bottom: position.y }}
        className={`fixed z-[9000] w-14 h-14 rounded-full bg-[#12121a] border-2 ${getBorderColor(state.systemState)} flex items-center justify-center hover:scale-110 transition-transform`}
      >
        <span className={`w-4 h-4 rounded-full ${getStatusColor(state.systemState === 'healthy' ? 'connected' : state.systemState === 'warning' ? 'warning' : 'error')}`} />
      </button>
    );
  }

  // Render tabs content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'apis':
        return (
          <div className="space-y-2">
            {Object.entries(state.apis).map(([key, api]) => (
              <div key={key} className="flex items-center justify-between bg-[#1a1a24] rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full shadow-lg ${getStatusColor(api.status)}`} />
                  <span className="text-sm text-white">{api.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs uppercase font-medium ${getStatusText(api.status)}`}>{api.status}</span>
                  {api.latency && <span className="text-xs text-gray-500">{api.latency}ms</span>}
                </div>
              </div>
            ))}
          </div>
        );
      
      case 'crons':
        return (
          <div className="space-y-2">
            {Object.entries(state.cronJobs).map(([key, cron]) => (
              <div key={key} className="bg-[#1a1a24] rounded-lg px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full shadow-lg ${getStatusColor(cron.status)}`} />
                    <span className="text-sm text-white">{cron.name}</span>
                  </div>
                  <span className={`text-xs uppercase font-medium ${getStatusText(cron.status)}`}>{cron.status}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1 ml-5">{cron.schedule}</div>
              </div>
            ))}
          </div>
        );
      
      case 'database':
        return (
          <div className="space-y-2">
            {Object.entries(state.dbTables).map(([key, table]) => (
              <div key={key} className="flex items-center justify-between bg-[#1a1a24] rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full shadow-lg ${getStatusColor(table.status)}`} />
                  <span className="text-sm text-white font-mono">{table.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs uppercase font-medium ${getStatusText(table.status)}`}>{table.status}</span>
                  {table.rows !== undefined && <span className="text-xs text-gray-500">{table.rows.toLocaleString()} rows</span>}
                </div>
              </div>
            ))}
          </div>
        );
      
      case 'pages':
        return (
          <div className="space-y-2">
            {Object.entries(state.pages).map(([key, page]) => (
              <div key={key} className="bg-[#1a1a24] rounded-lg px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full shadow-lg ${getStatusColor(page.status)}`} />
                    <span className="text-sm text-white">{page.name}</span>
                  </div>
                  <span className="text-xs text-gray-400">{page.percent}%</span>
                </div>
                <div className="h-1.5 bg-[#0a0a0f] rounded-full overflow-hidden mb-1">
                  <div 
                    className={`h-full rounded-full transition-all ${
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
      
      case 'alerts':
        const p1Alerts = state.alerts.filter(a => a.priority === 'P1');
        const otherAlerts = state.alerts.filter(a => a.priority !== 'P1');
        return (
          <div className="space-y-3">
            {p1Alerts.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-red-400 mb-2">🔴 P1 Critical ({p1Alerts.length})</div>
                <div className="space-y-2">
                  {p1Alerts.map(alert => (
                    <div key={alert.id} className="bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                      <div className="flex items-start gap-2">
                        <span>{alert.icon}</span>
                        <div>
                          <p className="text-xs font-medium text-red-300">{alert.message}</p>
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
            <span className="text-xs text-gray-500">
              {state.lastCheck ? state.lastCheck.toLocaleTimeString() : '—'}
            </span>
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
              Last check: {state.lastCheck ? state.lastCheck.toLocaleTimeString() : 'Never'}
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
              <button onClick={checkHealth} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-lg transition-colors">
                Refresh
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
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="max-h-64 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 #1a1a24' }}>
              {renderTabContent()}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-800">
              <span>Last: {state.lastCheck ? state.lastCheck.toLocaleTimeString() : 'Never'}</span>
              <span>Auto-refresh: 30s</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default HealthMonitor;

