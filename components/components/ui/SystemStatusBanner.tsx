'use client';

// components/ui/SystemStatusBanner.tsx
// Global system status banner shown at top of app
// Shows aggregated health status of all services

import { useState, useEffect, useCallback } from 'react';
import type { ServiceHealth, ApiError } from '@/types/errors';
import { FeatureStatusIndicator, StatusBadge } from './FeatureStatusIndicator';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ServiceStatus {
  name: string;
  status: ServiceHealth;
  message?: string;
  error?: ApiError | null;
  lastChecked?: string;
}

interface SystemStatusBannerProps {
  services?: ServiceStatus[];
  onRefresh?: () => Promise<void>;
  refreshInterval?: number | null;
  showWhenHealthy?: boolean;
  collapsible?: boolean;
  position?: 'top' | 'bottom';
  className?: string;
}

interface SystemHealth {
  overall: 'operational' | 'degraded' | 'outage' | 'unknown';
  services: ServiceStatus[];
  healthyCount: number;
  degradedCount: number;
  errorCount: number;
  notConfiguredCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function calculateOverallHealth(services: ServiceStatus[]): SystemHealth {
  let healthyCount = 0;
  let degradedCount = 0;
  let errorCount = 0;
  let notConfiguredCount = 0;

  for (const service of services) {
    switch (service.status) {
      case 'operational':
        healthyCount++;
        break;
      case 'degraded':
        degradedCount++;
        break;
      case 'error':
        errorCount++;
        break;
      case 'not_configured':
        notConfiguredCount++;
        break;
    }
  }

  let overall: SystemHealth['overall'] = 'operational';
  if (errorCount > 0) {
    overall = 'outage';
  } else if (degradedCount > 0) {
    overall = 'degraded';
  } else if (healthyCount === 0 && notConfiguredCount > 0) {
    overall = 'unknown';
  }

  return {
    overall,
    services,
    healthyCount,
    degradedCount,
    errorCount,
    notConfiguredCount,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function SystemStatusBanner({
  services = [],
  onRefresh,
  refreshInterval = null,
  showWhenHealthy = false,
  collapsible = true,
  position = 'top',
  className = '',
}: SystemStatusBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const health = calculateOverallHealth(services);

  // Auto-refresh
  useEffect(() => {
    if (!refreshInterval || !onRefresh) return;

    const interval = setInterval(async () => {
      try {
        await onRefresh();
        setLastRefresh(new Date());
      } catch (error) {
        console.error('[SystemStatusBanner] Refresh failed:', error);
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval, onRefresh]);

  // Manual refresh
  const handleRefresh = useCallback(async () => {
    if (!onRefresh || isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await onRefresh();
      setLastRefresh(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh, isRefreshing]);

  // Don't show if healthy and showWhenHealthy is false
  if (health.overall === 'operational' && !showWhenHealthy) {
    return null;
  }

  // Determine banner style based on overall health
  const bannerStyles = {
    operational: 'bg-green-50 border-green-200 text-green-800',
    degraded: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    outage: 'bg-red-50 border-red-200 text-red-800',
    unknown: 'bg-gray-50 border-gray-200 text-gray-800',
  };

  const statusLabels = {
    operational: 'All Systems Operational',
    degraded: 'Some Systems Degraded',
    outage: 'System Outage Detected',
    unknown: 'System Status Unknown',
  };

  return (
    <div
      className={`
        border-b px-4 py-2
        ${bannerStyles[health.overall]}
        ${position === 'bottom' ? 'border-t border-b-0' : ''}
        ${className}
      `}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between">
        {/* Left: Status indicator and message */}
        <div className="flex items-center gap-3">
          <FeatureStatusIndicator
            status={health.overall === 'outage' ? 'error' : health.overall}
            showLabel={false}
            size="md"
          />
          
          <span className="font-medium text-sm">
            {statusLabels[health.overall]}
          </span>

          {/* Summary badges */}
          <div className="hidden sm:flex items-center gap-2">
            {health.errorCount > 0 && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                {health.errorCount} error{health.errorCount !== 1 ? 's' : ''}
              </span>
            )}
            {health.degradedCount > 0 && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                {health.degradedCount} degraded
              </span>
            )}
            {health.notConfiguredCount > 0 && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {health.notConfiguredCount} not configured
              </span>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Refresh button */}
          {onRefresh && (
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded hover:bg-black/5 disabled:opacity-50 transition-colors"
              title="Refresh status"
            >
              <svg
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          )}

          {/* Expand/collapse toggle */}
          {collapsible && services.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded hover:bg-black/5 transition-colors"
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse details' : 'Expand details'}
            >
              <svg
                className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Expanded service list */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-current/10">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {services.map((service) => (
              <div
                key={service.name}
                className="flex items-center gap-2 bg-white/50 rounded px-2 py-1.5"
              >
                <FeatureStatusIndicator
                  status={service.status}
                  showLabel={false}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{service.name}</p>
                  {service.message && (
                    <p className="text-xs opacity-75 truncate">{service.message}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Last refresh time */}
          {lastRefresh && (
            <p className="text-xs opacity-50 mt-2">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPACT VERSION
// ═══════════════════════════════════════════════════════════════════════════

export function CompactSystemStatus({
  services = [],
  className = '',
}: {
  services?: ServiceStatus[];
  className?: string;
}) {
  const health = calculateOverallHealth(services);

  if (health.overall === 'operational') {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <FeatureStatusIndicator status="operational" label="All systems operational" size="sm" />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <StatusBadge
        status={health.overall === 'outage' ? 'error' : health.overall}
        label={
          health.overall === 'outage'
            ? `${health.errorCount} issue${health.errorCount !== 1 ? 's' : ''}`
            : `${health.degradedCount} degraded`
        }
        size="sm"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FLOATING STATUS INDICATOR
// ═══════════════════════════════════════════════════════════════════════════

export function FloatingSystemStatus({
  services = [],
  position = 'bottom-right',
  onClick,
}: {
  services?: ServiceStatus[];
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  onClick?: () => void;
}) {
  const health = calculateOverallHealth(services);

  if (health.overall === 'operational') {
    return null;
  }

  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
  };

  return (
    <button
      onClick={onClick}
      className={`
        fixed ${positionClasses[position]} z-50
        flex items-center gap-2 px-3 py-2 rounded-full shadow-lg
        ${health.overall === 'outage' ? 'bg-red-500 text-white' : 'bg-yellow-500 text-white'}
        hover:opacity-90 transition-opacity
      `}
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
      </span>
      <span className="text-sm font-medium">
        {health.overall === 'outage'
          ? `${health.errorCount} issue${health.errorCount !== 1 ? 's' : ''}`
          : 'System degraded'}
      </span>
    </button>
  );
}

export default SystemStatusBanner;
