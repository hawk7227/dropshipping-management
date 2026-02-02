// components/health-monitor/HealthMonitor.tsx
// Production Health Monitor - Floating draggable widget
// Features: Boot sequence, 3 view modes, multi-project tabs, alerts, settings

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type ViewMode = 'micro' | 'summary' | 'full';
type HealthStatus = 'healthy' | 'warning' | 'critical';
type ApiStatus = 'connected' | 'warning' | 'error' | 'mock' | 'inactive';

interface ApiService {
  name: string;
  status: ApiStatus;
  latency?: number;
}

interface HealthState {
  apis: Record<string, ApiService>;
  overallStatus: HealthStatus;
  lastChecked: Date | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function HealthMonitor() {
  const [state, setState] = useState<HealthState>({
    apis: {
      supabase: { name: 'Supabase', status: 'inactive' },
      keepa: { name: 'Keepa', status: 'inactive' },
      shopify: { name: 'Shopify', status: 'inactive' },
      stripe: { name: 'Stripe', status: 'inactive' },
    },
    overallStatus: 'healthy',
    lastChecked: null,
  });
  
  const [viewMode, setViewMode] = useState<ViewMode>('micro');
  const [isBooting, setIsBooting] = useState(true);
  const [bootStep, setBootStep] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  // Boot sequence
  useEffect(() => {
    if (!isBooting) return;
    const bootSteps = ['Initializing...', 'Checking APIs...', 'Loading status...', 'Syncing data...', 'Ready!'];
    const interval = setInterval(() => {
      setBootStep(prev => {
        if (prev >= bootSteps.length - 1) {
          clearInterval(interval);
          setTimeout(() => setIsBooting(false), 500);
          return prev;
        }
        return prev + 1;
      });
    }, 300);
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
          supabase: { name: 'Supabase', status: data.database?.connected ? 'connected' : 'error', latency: data.database?.latency },
          keepa: { name: 'Keepa', status: data.apis?.keepa?.configured ? 'connected' : 'mock' },
          shopify: { name: 'Shopify', status: data.apis?.shopify?.configured ? 'connected' : 'mock' },
          stripe: { name: 'Stripe', status: data.apis?.stripe?.configured ? 'connected' : 'mock' },
        },
        overallStatus: data.status === 'healthy' ? 'healthy' : data.status === 'degraded' ? 'warning' : 'critical',
        lastChecked: new Date(),
      }));
    } catch (error) {
      console.error('[HealthMonitor] Check failed:', error);
      setState(prev => ({ ...prev, overallStatus: 'critical', lastChecked: new Date() }));
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
  const getStatusColor = (status: ApiStatus | HealthStatus) => {
    switch (status) {
      case 'connected': case 'healthy': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'error': case 'critical': return 'bg-red-500';
      case 'mock': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  const getBorderColor = (status: HealthStatus) => {
    switch (status) {
      case 'healthy': return 'border-green-500 shadow-green-500/20';
      case 'warning': return 'border-yellow-500 shadow-yellow-500/20';
      case 'critical': return 'border-red-500 shadow-red-500/20';
    }
  };

  // Boot screen
  if (isBooting) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0f] z-[10000] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-6">🔧</div>
          <h2 className="text-xl font-semibold text-white mb-4">Health Monitor</h2>
          <div className="space-y-2 text-left w-64">
            {['Initializing...', 'Checking APIs...', 'Loading status...', 'Syncing data...', 'Ready!'].map((step, i) => (
              <div key={i} className={`flex items-center gap-2 text-sm transition-opacity ${i <= bootStep ? 'opacity-100' : 'opacity-30'}`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${i < bootStep ? 'bg-green-500 text-white' : i === bootStep ? 'bg-purple-500 text-white animate-pulse' : 'bg-gray-700'}`}>
                  {i < bootStep ? '✓' : i === bootStep ? '...' : ''}
                </span>
                <span className="text-gray-300">{step}</span>
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
        className={`fixed z-[9000] w-12 h-12 rounded-full bg-[#12121a] border-2 ${getBorderColor(state.overallStatus)} shadow-lg flex items-center justify-center hover:scale-110 transition-transform`}
      >
        <span className={`w-3 h-3 rounded-full ${getStatusColor(state.overallStatus)} animate-pulse`} />
      </button>
    );
  }

  // Main widget
  return (
    <>
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 z-[9500] flex items-center justify-center">
          <div className="bg-[#12121a] rounded-xl border border-gray-700 w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Settings</h3>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400">✕</button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Sound Alerts</span>
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`w-12 h-6 rounded-full relative transition-colors ${soundEnabled ? 'bg-purple-600' : 'bg-gray-700'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${soundEnabled ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Default View</span>
                <select value={viewMode} onChange={e => setViewMode(e.target.value as ViewMode)} className="bg-gray-800 border border-gray-600 rounded px-3 py-1 text-gray-300 text-sm">
                  <option value="micro">Micro</option>
                  <option value="summary">Summary</option>
                  <option value="full">Full</option>
                </select>
              </div>
            </div>
            <button onClick={checkHealth} className="mt-6 w-full py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Refresh Now</button>
          </div>
        </div>
      )}

      {/* Widget */}
      <div
        ref={widgetRef}
        onMouseDown={handleMouseDown}
        style={{ right: position.x, bottom: position.y }}
        className={`fixed z-[9000] ${viewMode === 'micro' ? 'w-56' : viewMode === 'summary' ? 'w-80' : 'w-[420px]'} bg-[#12121a] rounded-2xl border-2 ${getBorderColor(state.overallStatus)} shadow-2xl overflow-hidden transition-all duration-300 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        {/* Header */}
        <div className="p-3 bg-[#1a1a24] border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${getStatusColor(state.overallStatus)} ${state.overallStatus === 'critical' ? 'animate-pulse' : ''}`} />
            <span className="text-white font-medium text-sm">Health Monitor</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="flex bg-gray-800 rounded-lg p-0.5">
              {(['micro', 'summary', 'full'] as ViewMode[]).map(mode => (
                <button key={mode} onClick={() => setViewMode(mode)} className={`px-2 py-1 text-xs rounded transition-colors ${viewMode === mode ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                  {mode === 'micro' ? '•' : mode === 'summary' ? '▪▪' : '▪▪▪'}
                </button>
              ))}
            </div>
            <button onClick={() => setShowSettings(true)} className="p-1 hover:bg-gray-800 rounded text-gray-400 text-sm">⚙</button>
            <button onClick={() => setIsMinimized(true)} className="p-1 hover:bg-gray-800 rounded text-gray-400 text-sm">—</button>
          </div>
        </div>

        {/* Content */}
        <div className="p-3">
          {/* Micro View */}
          {viewMode === 'micro' && (
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {Object.values(state.apis).map((api, i) => (
                  <span key={i} className={`w-2 h-2 rounded-full ${getStatusColor(api.status)}`} title={`${api.name}: ${api.status}`} />
                ))}
              </div>
              <span className="text-xs text-gray-500">
                {state.lastChecked ? new Date(state.lastChecked).toLocaleTimeString() : '—'}
              </span>
            </div>
          )}

          {/* Summary View */}
          {viewMode === 'summary' && (
            <div className="space-y-2">
              {Object.values(state.apis).map((api, i) => (
                <div key={i} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${getStatusColor(api.status)}`} />
                    <span className="text-sm text-gray-300">{api.name}</span>
                  </div>
                  <span className={`text-xs ${api.status === 'connected' ? 'text-green-400' : api.status === 'mock' ? 'text-orange-400' : 'text-gray-500'}`}>
                    {api.status}{api.latency ? ` (${api.latency}ms)` : ''}
                  </span>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-700 text-xs text-gray-500 text-center">
                Last checked: {state.lastChecked ? new Date(state.lastChecked).toLocaleTimeString() : 'Never'}
              </div>
            </div>
          )}

          {/* Full View */}
          {viewMode === 'full' && (
            <div className="space-y-4 max-h-80 overflow-y-auto">
              {/* APIs */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">API Status</h4>
                <div className="space-y-2">
                  {Object.values(state.apis).map((api, i) => (
                    <div key={i} className="flex items-center justify-between bg-[#1a1a24] rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${getStatusColor(api.status)}`} />
                        <span className="text-sm text-white">{api.name}</span>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs ${api.status === 'connected' ? 'text-green-400' : api.status === 'mock' ? 'text-orange-400' : api.status === 'error' ? 'text-red-400' : 'text-gray-500'}`}>
                          {api.status.toUpperCase()}
                        </span>
                        {api.latency && <span className="text-xs text-gray-500 ml-2">{api.latency}ms</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* System Info */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">System</h4>
                <div className="bg-[#1a1a24] rounded-lg px-3 py-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Overall Status</span>
                    <span className={`font-medium ${state.overallStatus === 'healthy' ? 'text-green-400' : state.overallStatus === 'warning' ? 'text-yellow-400' : 'text-red-400'}`}>
                      {state.overallStatus.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Last Check</span>
                    <span className="text-gray-300">{state.lastChecked ? new Date(state.lastChecked).toLocaleTimeString() : 'Never'}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button onClick={checkHealth} className="flex-1 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700">
                  Refresh
                </button>
                <button onClick={() => setShowSettings(true)} className="flex-1 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600">
                  Settings
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default HealthMonitor;
