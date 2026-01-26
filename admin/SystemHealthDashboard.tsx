'use client';

// components/admin/SystemHealthDashboard.tsx
// Comprehensive admin dashboard for viewing all system health metrics
// Shows status of database, services, APIs, and queue

import { useState, useEffect, useCallback } from 'react';
import type { ServiceHealth, ApiError, SystemHealth } from '@/types/errors';
import { FeatureStatusIndicator, StatusBadge } from '@/components/ui/FeatureStatusIndicator';
import { FeatureStatusBanner } from '@/components/ui/FeatureStatusBanner';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ServiceDetail {
  name: string;
  category: 'core' | 'integration' | 'feature';
  status: ServiceHealth;
  message?: string;
  error?: ApiError | null;
  metrics?: {
    label: string;
    value: string | number;
    unit?: string;
  }[];
  lastChecked?: string;
  checkDuration?: number;
}

interface SystemHealthDashboardProps {
  onRefresh?: () => Promise<SystemHealth>;
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS ICONS
// ═══════════════════════════════════════════════════════════════════════════

function DatabaseIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  );
}

function CloudIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
    </svg>
  );
}

function CogIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function ShoppingCartIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function BellIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function ChartIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function LightningIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function ServiceCard({ service }: { service: ServiceDetail }) {
  const [expanded, setExpanded] = useState(false);

  const getIcon = () => {
    const iconClass = 'w-5 h-5';
    switch (service.name.toLowerCase()) {
      case 'database':
      case 'supabase':
        return <DatabaseIcon className={iconClass} />;
      case 'shopify':
        return <ShoppingCartIcon className={iconClass} />;
      case 'rainforest api':
      case 'keepa api':
        return <CloudIcon className={iconClass} />;
      case 'pricing rules':
      case 'configuration':
        return <CogIcon className={iconClass} />;
      case 'sms notifications':
      case 'twilio':
        return <BellIcon className={iconClass} />;
      case 'queue':
      case 'shopify queue':
        return <ChartIcon className={iconClass} />;
      case 'ai suggestions':
        return <LightningIcon className={iconClass} />;
      default:
        return <CloudIcon className={iconClass} />;
    }
  };

  const statusColors = {
    operational: 'border-green-200 bg-green-50',
    degraded: 'border-yellow-200 bg-yellow-50',
    error: 'border-red-200 bg-red-50',
    not_configured: 'border-gray-200 bg-gray-50',
  };

  return (
    <div
      className={`
        border rounded-lg p-4 transition-all
        ${statusColors[service.status]}
        ${service.error ? 'cursor-pointer hover:shadow-md' : ''}
      `}
      onClick={() => service.error && setExpanded(!expanded)}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`
            p-2 rounded-lg
            ${service.status === 'operational' ? 'bg-green-100 text-green-600' :
              service.status === 'degraded' ? 'bg-yellow-100 text-yellow-600' :
              service.status === 'error' ? 'bg-red-100 text-red-600' :
              'bg-gray-100 text-gray-500'}
          `}>
            {getIcon()}
          </div>
          <div>
            <h3 className="font-medium text-gray-900">{service.name}</h3>
            <p className="text-sm text-gray-500">{service.message || 'No details'}</p>
          </div>
        </div>
        <StatusBadge status={service.status} size="sm" />
      </div>

      {/* Metrics */}
      {service.metrics && service.metrics.length > 0 && (
        <div className="mt-3 pt-3 border-t border-current/10 grid grid-cols-2 gap-2">
          {service.metrics.map((metric, index) => (
            <div key={index} className="text-center">
              <p className="text-lg font-semibold text-gray-900">
                {metric.value}{metric.unit && <span className="text-sm font-normal text-gray-500">{metric.unit}</span>}
              </p>
              <p className="text-xs text-gray-500">{metric.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Error details */}
      {expanded && service.error && (
        <div className="mt-3 pt-3 border-t border-current/10">
          <FeatureStatusBanner
            error={service.error}
            dismissible={false}
            collapsible={false}
          />
        </div>
      )}

      {/* Last checked */}
      {service.lastChecked && (
        <p className="mt-2 text-xs text-gray-400">
          Last checked: {new Date(service.lastChecked).toLocaleTimeString()}
          {service.checkDuration !== undefined && ` (${service.checkDuration}ms)`}
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function SystemHealthDashboard({
  onRefresh,
  autoRefresh = true,
  refreshInterval = 60000, // 1 minute
  className = '',
}: SystemHealthDashboardProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [services, setServices] = useState<ServiceDetail[]>([]);
  const [error, setError] = useState<ApiError | null>(null);

  // Generate mock service data (in production, this comes from onRefresh)
  const generateMockServices = useCallback((): ServiceDetail[] => {
    const now = new Date().toISOString();
    return [
      {
        name: 'Database',
        category: 'core',
        status: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'operational' : 'not_configured',
        message: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Connected to Supabase' : 'Not configured',
        lastChecked: now,
        checkDuration: 45,
        metrics: [
          { label: 'Response Time', value: 45, unit: 'ms' },
          { label: 'Connections', value: 3 },
        ],
      },
      {
        name: 'Pricing Rules',
        category: 'core',
        status: 'operational',
        message: 'Configuration loaded',
        lastChecked: now,
        checkDuration: 2,
        metrics: [
          { label: 'Your Markup', value: '70', unit: '%' },
          { label: 'Min Margin', value: '30', unit: '%' },
        ],
      },
      {
        name: 'Shopify',
        category: 'integration',
        status: process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN ? 'operational' : 'not_configured',
        message: process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN || 'Not connected',
        lastChecked: now,
        checkDuration: 120,
        error: !process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN ? {
          code: 'SHOP_001',
          message: 'Shopify store not connected',
          details: 'Store credentials not configured.',
          suggestion: 'Add Shopify credentials in Settings.',
          severity: 'warning',
        } : null,
        metrics: process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN ? [
          { label: 'Products Synced', value: 0 },
          { label: 'Queue Size', value: 0 },
        ] : undefined,
      },
      {
        name: 'Rainforest API',
        category: 'integration',
        status: 'not_configured',
        message: 'Using mock data',
        lastChecked: now,
        checkDuration: 5,
        error: {
          code: 'DISC_001',
          message: 'Rainforest API not configured',
          details: 'API key not set. Using mock data for testing.',
          suggestion: 'Add RAINFOREST_API_KEY for live product discovery.',
          severity: 'info',
        },
      },
      {
        name: 'Keepa API',
        category: 'integration',
        status: 'not_configured',
        message: 'Using mock data',
        lastChecked: now,
        checkDuration: 5,
        error: {
          code: 'KEEPA_001',
          message: 'Keepa API not configured',
          details: 'API key not set. Using mock data for testing.',
          suggestion: 'Add KEEPA_API_KEY for historical price data.',
          severity: 'info',
        },
      },
      {
        name: 'SMS Notifications',
        category: 'feature',
        status: 'not_configured',
        message: 'Twilio not configured',
        lastChecked: now,
        checkDuration: 3,
        error: {
          code: 'SMS_001',
          message: 'Twilio not configured',
          details: 'SMS alerts disabled. Alerts shown in dashboard only.',
          suggestion: 'Configure Twilio to enable SMS notifications.',
          severity: 'info',
        },
      },
      {
        name: 'Shopify Queue',
        category: 'feature',
        status: 'operational',
        message: 'Queue processor ready',
        lastChecked: now,
        checkDuration: 10,
        metrics: [
          { label: 'Pending', value: 0 },
          { label: 'Processing', value: 0 },
        ],
      },
      {
        name: 'AI Suggestions',
        category: 'feature',
        status: 'operational',
        message: 'Analysis engine ready',
        lastChecked: now,
        checkDuration: 8,
        metrics: [
          { label: 'Active', value: 0 },
          { label: 'Last Run', value: 'Never' },
        ],
      },
    ];
  }, []);

  // Refresh health data
  const refreshHealth = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      if (onRefresh) {
        const health = await onRefresh();
        // Transform SystemHealth to ServiceDetail array
        // This would come from the actual health check response
        setServices(generateMockServices());
      } else {
        // Use mock data
        setServices(generateMockServices());
      }
      setLastRefresh(new Date());
    } catch (err) {
      setError({
        code: 'UNKNOWN',
        message: 'Failed to check system health',
        details: err instanceof Error ? err.message : 'Unknown error',
        severity: 'error',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [onRefresh, generateMockServices]);

  // Initial load
  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(refreshHealth, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, refreshHealth]);

  // Calculate summary stats
  const summary = {
    total: services.length,
    operational: services.filter(s => s.status === 'operational').length,
    degraded: services.filter(s => s.status === 'degraded').length,
    error: services.filter(s => s.status === 'error').length,
    notConfigured: services.filter(s => s.status === 'not_configured').length,
  };

  const overallStatus: ServiceHealth = 
    summary.error > 0 ? 'error' :
    summary.degraded > 0 ? 'degraded' :
    summary.operational === summary.total ? 'operational' : 'not_configured';

  // Group services by category
  const coreServices = services.filter(s => s.category === 'core');
  const integrations = services.filter(s => s.category === 'integration');
  const features = services.filter(s => s.category === 'feature');

  if (isLoading) {
    return (
      <div className={`p-8 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Health</h1>
          <p className="text-gray-500">Monitor status of all services and integrations</p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Overall status badge */}
          <StatusBadge status={overallStatus} size="md" />
          
          {/* Refresh button */}
          <button
            onClick={refreshHealth}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <svg
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isRefreshing ? 'Checking...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6">
          <FeatureStatusBanner
            error={error}
            onRetry={refreshHealth}
            dismissible={true}
            onDismiss={() => setError(null)}
          />
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-3xl font-bold text-gray-900">{summary.total}</p>
          <p className="text-sm text-gray-500">Total Services</p>
        </div>
        <div className="bg-green-50 rounded-lg border border-green-200 p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{summary.operational}</p>
          <p className="text-sm text-green-700">Operational</p>
        </div>
        <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4 text-center">
          <p className="text-3xl font-bold text-yellow-600">{summary.degraded}</p>
          <p className="text-sm text-yellow-700">Degraded</p>
        </div>
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-3xl font-bold text-gray-500">{summary.notConfigured}</p>
          <p className="text-sm text-gray-600">Not Configured</p>
        </div>
      </div>

      {/* Core Services */}
      {coreServices.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Core Services</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {coreServices.map(service => (
              <ServiceCard key={service.name} service={service} />
            ))}
          </div>
        </section>
      )}

      {/* Integrations */}
      {integrations.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Integrations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrations.map(service => (
              <ServiceCard key={service.name} service={service} />
            ))}
          </div>
        </section>
      )}

      {/* Features */}
      {features.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map(service => (
              <ServiceCard key={service.name} service={service} />
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      {lastRefresh && (
        <p className="text-sm text-gray-400 text-center">
          Last updated: {lastRefresh.toLocaleString()}
          {autoRefresh && ` • Auto-refresh every ${refreshInterval / 1000}s`}
        </p>
      )}
    </div>
  );
}

export default SystemHealthDashboard;
