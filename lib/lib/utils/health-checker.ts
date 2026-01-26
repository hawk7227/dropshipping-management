// lib/utils/health-checker.ts
// System health check utilities for verifying service status
// Used by PageHealthCheck and SystemHealthDashboard components

import type { 
  HealthStatus, 
  ServiceHealth, 
  SystemHealth 
} from '@/types';
import type { 
  FeatureStatus, 
  DependencyCheck, 
  DependencyCheckResult,
  ApiError 
} from '@/types/errors';
import { getErrorDefinition } from '@/lib/config/error-codes';
import { validatePricingConfig } from '@/lib/config/pricing-rules';

// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENT VARIABLE CHECKERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if Supabase environment variables are set
 */
export function hasSupabaseConfig(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && 
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Check if Shopify environment variables are set
 */
export function hasShopifyConfig(): boolean {
  return !!(
    process.env.SHOPIFY_STORE_DOMAIN && 
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
  );
}

/**
 * Check if Rainforest API key is set
 */
export function hasRainforestConfig(): boolean {
  return !!process.env.RAINFOREST_API_KEY;
}

/**
 * Check if Keepa API key is set
 */
export function hasKeepaConfig(): boolean {
  return !!process.env.KEEPA_API_KEY;
}

/**
 * Check if Twilio environment variables are set
 */
export function hasTwilioConfig(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID && 
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE HEALTH CHECKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check Supabase database connection
 */
export async function checkSupabaseConnection(): Promise<ServiceHealth> {
  const start = Date.now();
  
  if (!hasSupabaseConfig()) {
    return {
      name: 'Database',
      status: 'not_configured',
      message: 'Supabase credentials not configured',
      lastChecked: new Date().toISOString(),
    };
  }

  try {
    // Dynamic import to avoid issues when env vars aren't set
    const { supabase } = await import('@/lib/db/supabase');
    
    // Simple query to test connection
    const { error } = await supabase
      .from('products')
      .select('id')
      .limit(1);

    const responseTime = Date.now() - start;

    if (error) {
      // Check for specific error types
      if (error.message.includes('relation') || error.message.includes('does not exist')) {
        return {
          name: 'Database',
          status: 'error',
          message: 'Database schema not initialized',
          lastChecked: new Date().toISOString(),
          responseTime,
          details: { errorCode: 'DB_005', originalError: error.message },
        };
      }
      
      return {
        name: 'Database',
        status: 'error',
        message: error.message,
        lastChecked: new Date().toISOString(),
        responseTime,
        details: { errorCode: 'DB_001' },
      };
    }

    // Check if response time indicates degraded performance
    if (responseTime > 2000) {
      return {
        name: 'Database',
        status: 'degraded',
        message: `Connected but slow (${responseTime}ms)`,
        lastChecked: new Date().toISOString(),
        responseTime,
      };
    }

    return {
      name: 'Database',
      status: 'operational',
      message: 'Connected',
      lastChecked: new Date().toISOString(),
      responseTime,
    };
  } catch (error) {
    return {
      name: 'Database',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString(),
      responseTime: Date.now() - start,
      details: { errorCode: 'DB_001' },
    };
  }
}

/**
 * Check pricing rules configuration
 */
export function checkPricingConfig(): ServiceHealth {
  const validation = validatePricingConfig();
  
  if (!validation.valid) {
    return {
      name: 'Pricing Engine',
      status: 'error',
      message: 'Configuration invalid',
      lastChecked: new Date().toISOString(),
      details: { 
        errorCode: 'CONFIG_001', 
        errors: validation.errors 
      },
    };
  }

  return {
    name: 'Pricing Engine',
    status: 'operational',
    message: 'Rules loaded',
    lastChecked: new Date().toISOString(),
  };
}

/**
 * Check Shopify API connection (if configured)
 */
export async function checkShopifyConnection(): Promise<ServiceHealth> {
  const start = Date.now();
  
  if (!hasShopifyConfig()) {
    return {
      name: 'Shopify',
      status: 'not_configured',
      message: 'Credentials not configured',
      lastChecked: new Date().toISOString(),
      details: { errorCode: 'SHOP_001' },
    };
  }

  try {
    const domain = process.env.SHOPIFY_STORE_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    
    const response = await fetch(
      `https://${domain}/admin/api/2024-01/shop.json`,
      {
        headers: {
          'X-Shopify-Access-Token': token!,
          'Content-Type': 'application/json',
        },
      }
    );

    const responseTime = Date.now() - start;

    if (response.status === 401) {
      return {
        name: 'Shopify',
        status: 'error',
        message: 'Authentication failed',
        lastChecked: new Date().toISOString(),
        responseTime,
        details: { errorCode: 'SHOP_003' },
      };
    }

    if (response.status === 429) {
      return {
        name: 'Shopify',
        status: 'degraded',
        message: 'Rate limited',
        lastChecked: new Date().toISOString(),
        responseTime,
        details: { errorCode: 'SHOP_002' },
      };
    }

    if (!response.ok) {
      return {
        name: 'Shopify',
        status: 'error',
        message: `API error: ${response.status}`,
        lastChecked: new Date().toISOString(),
        responseTime,
        details: { errorCode: 'SHOP_005' },
      };
    }

    return {
      name: 'Shopify',
      status: 'operational',
      message: 'Connected',
      lastChecked: new Date().toISOString(),
      responseTime,
    };
  } catch (error) {
    return {
      name: 'Shopify',
      status: 'error',
      message: error instanceof Error ? error.message : 'Connection failed',
      lastChecked: new Date().toISOString(),
      responseTime: Date.now() - start,
      details: { errorCode: 'SHOP_001' },
    };
  }
}

/**
 * Check Rainforest API (just config check, no API call to save credits)
 */
export function checkRainforestConfig(): ServiceHealth {
  if (!hasRainforestConfig()) {
    return {
      name: 'Rainforest API',
      status: 'not_configured',
      message: 'API key not configured (using mock data)',
      lastChecked: new Date().toISOString(),
      details: { errorCode: 'DISC_001' },
    };
  }

  return {
    name: 'Rainforest API',
    status: 'operational',
    message: 'API key configured',
    lastChecked: new Date().toISOString(),
  };
}

/**
 * Check Keepa API (just config check)
 */
export function checkKeepaConfig(): ServiceHealth {
  if (!hasKeepaConfig()) {
    return {
      name: 'Keepa API',
      status: 'not_configured',
      message: 'API key not configured',
      lastChecked: new Date().toISOString(),
      details: { errorCode: 'KEEPA_001' },
    };
  }

  return {
    name: 'Keepa API',
    status: 'operational',
    message: 'API key configured',
    lastChecked: new Date().toISOString(),
  };
}

/**
 * Check Twilio configuration
 */
export function checkTwilioConfig(): ServiceHealth {
  if (!hasTwilioConfig()) {
    return {
      name: 'SMS Notifications',
      status: 'not_configured',
      message: 'Twilio not configured',
      lastChecked: new Date().toISOString(),
      details: { errorCode: 'SMS_001' },
    };
  }

  return {
    name: 'SMS Notifications',
    status: 'operational',
    message: 'Twilio configured',
    lastChecked: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM-WIDE HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run all health checks and return combined status
 */
export async function checkSystemHealth(): Promise<SystemHealth> {
  const checks = await Promise.all([
    checkSupabaseConnection(),
    Promise.resolve(checkPricingConfig()),
    checkShopifyConnection(),
    Promise.resolve(checkRainforestConfig()),
    Promise.resolve(checkKeepaConfig()),
    Promise.resolve(checkTwilioConfig()),
  ]);

  // Determine overall status
  const hasError = checks.some(c => c.status === 'error');
  const hasCriticalError = checks.some(
    c => c.status === 'error' && 
    (c.name === 'Database' || c.name === 'Pricing Engine')
  );
  const hasDegraded = checks.some(c => c.status === 'degraded');

  let overall: HealthStatus = 'operational';
  if (hasCriticalError) {
    overall = 'error';
  } else if (hasError || hasDegraded) {
    overall = 'degraded';
  }

  return {
    overall,
    services: checks,
    timestamp: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE DEPENDENCY CHECKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run dependency checks for a page
 */
export async function runDependencyChecks(
  dependencies: DependencyCheck[]
): Promise<DependencyCheckResult[]> {
  const results: DependencyCheckResult[] = [];

  for (const dep of dependencies) {
    const start = Date.now();
    
    try {
      const passed = await dep.check();
      const duration = Date.now() - start;
      
      if (passed) {
        results.push({
          id: dep.id,
          name: dep.name,
          passed: true,
          duration,
        });
      } else {
        const errorDef = getErrorDefinition(dep.errorCode);
        results.push({
          id: dep.id,
          name: dep.name,
          passed: false,
          duration,
          error: {
            code: dep.errorCode,
            message: dep.errorMessage || errorDef.message,
            details: dep.errorDetails || errorDef.details,
            suggestion: dep.suggestion || errorDef.suggestion,
            severity: errorDef.severity,
            blocking: !dep.nonBlocking,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      const duration = Date.now() - start;
      const errorDef = getErrorDefinition(dep.errorCode);
      
      results.push({
        id: dep.id,
        name: dep.name,
        passed: false,
        duration,
        error: {
          code: dep.errorCode,
          message: errorDef.message,
          details: error instanceof Error 
            ? `${errorDef.details} Error: ${error.message}`
            : errorDef.details,
          suggestion: errorDef.suggestion,
          severity: errorDef.severity,
          blocking: !dep.nonBlocking,
          technical: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  return results;
}

/**
 * Convert dependency check results to feature statuses
 */
export function toFeatureStatuses(results: DependencyCheckResult[]): FeatureStatus[] {
  return results.map(r => ({
    featureId: r.id,
    featureName: r.name,
    status: r.passed 
      ? 'operational' 
      : (r.error?.blocking ? 'error' : 'degraded'),
    error: r.error,
    lastChecked: new Date().toISOString(),
  }));
}

/**
 * Check if all blocking dependencies passed
 */
export function hasBlockingFailures(results: DependencyCheckResult[]): boolean {
  return results.some(r => !r.passed && r.error?.blocking);
}

/**
 * Get all blocking errors from results
 */
export function getBlockingErrors(results: DependencyCheckResult[]): ApiError[] {
  return results
    .filter(r => !r.passed && r.error?.blocking)
    .map(r => r.error!)
    .filter(Boolean);
}

/**
 * Get all warnings (non-blocking errors) from results
 */
export function getWarnings(results: DependencyCheckResult[]): ApiError[] {
  return results
    .filter(r => !r.passed && !r.error?.blocking)
    .map(r => r.error!)
    .filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════════════════
// PREDEFINED PAGE DEPENDENCIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Common dependencies for pages that need database access
 */
export const DATABASE_DEPENDENCY: DependencyCheck = {
  id: 'db_connection',
  name: 'Database Connection',
  check: async () => {
    const health = await checkSupabaseConnection();
    return health.status === 'operational' || health.status === 'degraded';
  },
  errorCode: 'DB_001',
};

/**
 * Common dependencies for pages that need pricing rules
 */
export const PRICING_CONFIG_DEPENDENCY: DependencyCheck = {
  id: 'pricing_rules',
  name: 'Pricing Rules',
  check: async () => {
    const validation = validatePricingConfig();
    return validation.valid;
  },
  errorCode: 'CONFIG_001',
};

/**
 * Dependencies for the Products page
 */
export const PRODUCTS_PAGE_DEPENDENCIES: DependencyCheck[] = [
  DATABASE_DEPENDENCY,
  PRICING_CONFIG_DEPENDENCY,
  {
    id: 'shopify_connection',
    name: 'Shopify Connection',
    check: async () => hasShopifyConfig(),
    errorCode: 'SHOP_001',
    nonBlocking: true, // Page works without Shopify
  },
];

/**
 * Dependencies for the Price Intelligence page
 */
export const PRICES_PAGE_DEPENDENCIES: DependencyCheck[] = [
  DATABASE_DEPENDENCY,
  PRICING_CONFIG_DEPENDENCY,
];

/**
 * Dependencies for the Import panel
 */
export const IMPORT_DEPENDENCIES: DependencyCheck[] = [
  DATABASE_DEPENDENCY,
  {
    id: 'rainforest_api',
    name: 'Rainforest API',
    check: async () => hasRainforestConfig(),
    errorCode: 'DISC_001',
    nonBlocking: true, // Can use mock data
  },
  {
    id: 'keepa_api',
    name: 'Keepa API',
    check: async () => hasKeepaConfig(),
    errorCode: 'KEEPA_001',
    nonBlocking: true, // Optional
  },
];
