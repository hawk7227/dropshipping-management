'use client';

// components/ui/PageHealthCheck.tsx
// Checks page dependencies before rendering content
// Shows full-page error for blocking issues, warning banners for degraded features

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import type { ApiError, DependencyCheckResult, FeatureStatus } from '@/types/errors';
import { FeatureStatusBanner, MultiErrorBanner, FullPageError } from './FeatureStatusBanner';
import { FeatureStatusIndicator } from './FeatureStatusIndicator';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface PageDependency {
  name: string;
  description: string;
  check: () => Promise<DependencyCheckResult>;
  required: boolean; // If true, blocks page render on failure
}

interface PageHealthCheckProps {
  dependencies: PageDependency[];
  children: ReactNode;
  loadingFallback?: ReactNode;
  onHealthChange?: (health: PageHealthStatus) => void;
  showHealthIndicator?: boolean;
  checkInterval?: number | null; // Auto-recheck interval in ms, null to disable
  pageName?: string;
}

interface PageHealthStatus {
  status: 'loading' | 'healthy' | 'degraded' | 'error';
  blockingErrors: ApiError[];
  warnings: ApiError[];
  allResults: DependencyCheckResult[];
  lastChecked: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADING FALLBACK
// ═══════════════════════════════════════════════════════════════════════════

function DefaultLoadingFallback({ pageName }: { pageName?: string }) {
  return (
    <div className="min-h-[400px] flex flex-col items-center justify-center p-8">
      {/* Spinner */}
      <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
      
      {/* Loading text */}
      <p className="mt-4 text-gray-600">
        {pageName ? `Loading ${pageName}...` : 'Checking system health...'}
      </p>
      
      {/* Checklist animation */}
      <div className="mt-6 space-y-2 w-48">
        {['Database', 'Configuration', 'Services'].map((item, index) => (
          <div
            key={item}
            className="flex items-center gap-2 text-sm text-gray-500"
            style={{ animationDelay: `${index * 200}ms` }}
          >
            <div className="w-4 h-4 border-2 border-gray-300 rounded animate-pulse" />
            <span>Checking {item}...</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH INDICATOR
// ═══════════════════════════════════════════════════════════════════════════

function HealthIndicatorBar({
  status,
  results,
  onRecheck,
  isRechecking,
}: {
  status: PageHealthStatus;
  results: DependencyCheckResult[];
  onRecheck: () => void;
  isRechecking: boolean;
}) {
  if (status.status === 'healthy') {
    return null; // Don't show indicator when all is well
  }

  return (
    <div 
      className="bg-gray-50 border-b border-gray-200 px-4 py-2" 
      role="status" 
      aria-label="System health status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4" role="list" aria-label="Service statuses">
          {results.map((result) => (
            <div key={result.name} className="flex items-center gap-1.5" role="listitem">
              <FeatureStatusIndicator
                status={result.status}
                label={result.name}
                size="sm"
              />
            </div>
          ))}
        </div>
        
        <button
          onClick={onRecheck}
          disabled={isRechecking}
          aria-label={isRechecking ? 'Checking system health' : 'Recheck system health'}
          className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
        >
          {isRechecking ? 'Checking...' : 'Recheck'}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function PageHealthCheck({
  dependencies,
  children,
  loadingFallback,
  onHealthChange,
  showHealthIndicator = true,
  checkInterval = null,
  pageName,
}: PageHealthCheckProps) {
  const [healthStatus, setHealthStatus] = useState<PageHealthStatus>({
    status: 'loading',
    blockingErrors: [],
    warnings: [],
    allResults: [],
    lastChecked: null,
  });
  const [isRechecking, setIsRechecking] = useState(false);

  // Run health checks
  const runHealthChecks = useCallback(async (isRecheck = false) => {
    if (isRecheck) {
      setIsRechecking(true);
    } else {
      setHealthStatus(prev => ({ ...prev, status: 'loading' }));
    }

    try {
      const results: DependencyCheckResult[] = [];
      const blockingErrors: ApiError[] = [];
      const warnings: ApiError[] = [];

      // Run all dependency checks
      const depsArray = Array.isArray(dependencies) ? dependencies : [];
      for (const dep of depsArray) {
        try {
          const result = await dep.check();
          results.push(result);

          // Check for errors
          if (result.status === 'error' || result.status === 'not_configured') {
            const error: ApiError = result.error || {
              code: 'UNKNOWN',
              message: `${dep.name} check failed`,
              details: result.message,
              severity: dep.required ? 'error' : 'warning',
            };

            if (dep.required) {
              blockingErrors.push(error);
            } else {
              warnings.push(error);
            }
          } else if (result.status === 'degraded') {
            if (result.error) {
              warnings.push(result.error);
            }
          }
        } catch (error) {
          const apiError: ApiError = {
            code: 'UNKNOWN',
            message: `Failed to check ${dep.name}`,
            details: error instanceof Error ? error.message : String(error),
            severity: dep.required ? 'error' : 'warning',
          };

          results.push({
            name: dep.name,
            status: 'error',
            message: apiError.message,
            error: apiError,
          });

          if (dep.required) {
            blockingErrors.push(apiError);
          } else {
            warnings.push(apiError);
          }
        }
      }

      // Determine overall status
      let status: PageHealthStatus['status'] = 'healthy';
      if (blockingErrors.length > 0) {
        status = 'error';
      } else if (warnings.length > 0) {
        status = 'degraded';
      }

      const newStatus: PageHealthStatus = {
        status,
        blockingErrors,
        warnings,
        allResults: results,
        lastChecked: new Date().toISOString(),
      };

      setHealthStatus(newStatus);
      onHealthChange?.(newStatus);
    } finally {
      setIsRechecking(false);
    }
  }, [dependencies, onHealthChange]);

  // Initial health check
  useEffect(() => {
    runHealthChecks();
  }, [runHealthChecks]);

  // Auto-recheck interval
  useEffect(() => {
    if (!checkInterval) return;

    const interval = setInterval(() => {
      runHealthChecks(true);
    }, checkInterval);

    return () => clearInterval(interval);
  }, [checkInterval, runHealthChecks]);

  // Handle recheck button
  const handleRecheck = useCallback(() => {
    runHealthChecks(true);
  }, [runHealthChecks]);

  // Loading state
  if (healthStatus.status === 'loading') {
    return loadingFallback || <DefaultLoadingFallback pageName={pageName} />;
  }

  // Blocking error state
  if (healthStatus.status === 'error' && healthStatus.blockingErrors.length > 0) {
    if (healthStatus.blockingErrors.length === 1) {
      return (
        <FullPageError
          error={healthStatus.blockingErrors[0]}
          onRetry={handleRecheck}
        />
      );
    }

    return (
      <div className="min-h-[400px] flex items-center justify-center p-8" role="alert" aria-live="assertive">
        <div className="max-w-2xl w-full">
          <MultiErrorBanner
            errors={healthStatus.blockingErrors}
            title={`Cannot load ${pageName || 'page'}`}
            onRetryAll={handleRecheck}
            dismissible={false}
          />
        </div>
      </div>
    );
  }

  // Render content with warnings
  return (
    <>
      {/* Health indicator bar */}
      {showHealthIndicator && healthStatus.status === 'degraded' && (
        <HealthIndicatorBar
          status={healthStatus}
          results={healthStatus.allResults}
          onRecheck={handleRecheck}
          isRechecking={isRechecking}
        />
      )}

      {/* Warning banners for degraded features */}
      {healthStatus.warnings.length > 0 && (
        <div className="space-y-2 p-4" role="region" aria-label="Feature warnings">
          {healthStatus.warnings.map((warning, index) => (
            <FeatureStatusBanner
              key={`${warning.code}-${index}`}
              error={warning}
              dismissible={true}
              collapsible={true}
              defaultCollapsed={healthStatus.warnings.length > 1}
            />
          ))}
        </div>
      )}

      {/* Main content */}
      {children}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PRE-BUILT DEPENDENCY CHECKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Database connection check
 */
export const DATABASE_CHECK: PageDependency = {
  name: 'Database',
  description: 'Check Supabase connection',
  required: true,
  check: async () => {
    // In real implementation, this would call an API endpoint
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    if (!supabaseUrl) {
      return {
        name: 'Database',
        status: 'not_configured',
        message: 'Supabase URL not configured',
        error: {
          code: 'DB_001',
          message: 'Database not connected',
          details: 'NEXT_PUBLIC_SUPABASE_URL environment variable is not set.',
          suggestion: 'Configure Supabase credentials in environment variables.',
          severity: 'critical',
        },
      };
    }

    return {
      name: 'Database',
      status: 'operational',
      message: 'Connected to Supabase',
    };
  },
};

/**
 * Pricing config check
 */
export const PRICING_CONFIG_CHECK: PageDependency = {
  name: 'Pricing Rules',
  description: 'Verify pricing configuration',
  required: true,
  check: async () => {
    try {
      // Dynamic import to check if config loads
      const { PRICING_RULES, validatePricingConfig } = await import('@/lib/config/pricing-rules');
      const validationResult = validatePricingConfig();
      
      if (!validationResult.valid) {
        return {
          name: 'Pricing Rules',
          status: 'error',
          message: 'Invalid pricing configuration',
          error: {
            code: 'CONFIG_001',
            message: 'Pricing rules not loaded',
            details: validationResult.errors.join(', '),
            suggestion: 'Check lib/config/pricing-rules.ts for configuration errors.',
            severity: 'critical',
          },
        };
      }

      return {
        name: 'Pricing Rules',
        status: 'operational',
        message: `Markup: ${PRICING_RULES.yourMarkup.multiplier}x`,
      };
    } catch (error) {
      return {
        name: 'Pricing Rules',
        status: 'error',
        message: 'Failed to load pricing rules',
        error: {
          code: 'CONFIG_001',
          message: 'Pricing rules not loaded',
          details: error instanceof Error ? error.message : 'Unknown error',
          suggestion: 'Verify lib/config/pricing-rules.ts exists and exports correctly.',
          severity: 'critical',
        },
      };
    }
  },
};

/**
 * Shopify connection check (non-blocking)
 */
export const SHOPIFY_CHECK: PageDependency = {
  name: 'Shopify',
  description: 'Check Shopify integration',
  required: false,
  check: async () => {
    const domain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
    
    if (!domain) {
      return {
        name: 'Shopify',
        status: 'not_configured',
        message: 'Shopify not connected',
        error: {
          code: 'SHOP_001',
          message: 'Shopify store not connected',
          details: 'Store domain not configured. Product push will be disabled.',
          suggestion: 'Add Shopify credentials in Settings to enable product sync.',
          severity: 'warning',
        },
      };
    }

    return {
      name: 'Shopify',
      status: 'operational',
      message: `Connected to ${domain}`,
    };
  },
};

/**
 * Rainforest API check (non-blocking)
 */
export const RAINFOREST_CHECK: PageDependency = {
  name: 'Rainforest API',
  description: 'Check product discovery API',
  required: false,
  check: async () => {
    const apiKey = process.env.RAINFOREST_API_KEY;
    
    if (!apiKey) {
      return {
        name: 'Rainforest API',
        status: 'not_configured',
        message: 'Using mock data',
        error: {
          code: 'DISC_001',
          message: 'Rainforest API not configured',
          details: 'API key not set. System will use mock data for testing.',
          suggestion: 'Add RAINFOREST_API_KEY for live product discovery.',
          severity: 'info',
        },
      };
    }

    return {
      name: 'Rainforest API',
      status: 'operational',
      message: 'API configured',
    };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// PAGE-SPECIFIC DEPENDENCY SETS
// ═══════════════════════════════════════════════════════════════════════════

export const PRODUCTS_PAGE_DEPENDENCIES: PageDependency[] = [
  DATABASE_CHECK,
  PRICING_CONFIG_CHECK,
  SHOPIFY_CHECK,
];

export const PRICES_PAGE_DEPENDENCIES: PageDependency[] = [
  DATABASE_CHECK,
  PRICING_CONFIG_CHECK,
];

export const IMPORT_PAGE_DEPENDENCIES: PageDependency[] = [
  DATABASE_CHECK,
  PRICING_CONFIG_CHECK,
  RAINFOREST_CHECK,
];

export default PageHealthCheck;
