// lib/utils/api-cost-estimator.ts
// API Cost Estimator - Tracks and estimates costs for external API calls
// Helps users understand costs before executing operations

// ═══════════════════════════════════════════════════════════════════════════
// API PRICING (as of January 2026)
// ═══════════════════════════════════════════════════════════════════════════

export interface ApiPricing {
  name: string;
  costPerRequest: number;
  currency: 'USD';
  freeCredits?: number;
  monthlyFreeRequests?: number;
  notes?: string;
}

export const API_PRICING: Record<string, ApiPricing> = {
  rainforest: {
    name: 'Rainforest API',
    costPerRequest: 0.01, // $0.01 per request (product lookup)
    currency: 'USD',
    freeCredits: 100, // 100 free credits on signup
    notes: 'Product search/lookup costs 1 credit each',
  },
  keepa: {
    name: 'Keepa API',
    costPerRequest: 0.001, // ~$0.001 per token (approx)
    currency: 'USD',
    monthlyFreeRequests: 0, // No free tier
    notes: 'Price history costs vary by data depth',
  },
  shopify: {
    name: 'Shopify Admin API',
    costPerRequest: 0, // Free with store subscription
    currency: 'USD',
    notes: 'Rate limited but no per-request cost',
  },
  twilio: {
    name: 'Twilio SMS',
    costPerRequest: 0.0079, // ~$0.0079 per SMS segment
    currency: 'USD',
    notes: 'Price varies by country/carrier',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// COST ESTIMATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CostEstimate {
  api: string;
  operation: string;
  requestCount: number;
  costPerRequest: number;
  totalCost: number;
  currency: 'USD';
  isFree: boolean;
  notes?: string;
}

export interface BulkCostEstimate {
  estimates: CostEstimate[];
  totalCost: number;
  currency: 'USD';
  breakdown: Record<string, number>;
  warnings: string[];
}

export interface OperationCost {
  operation: string;
  api: string;
  requestsPerItem: number;
  description: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// OPERATION DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export const OPERATION_COSTS: Record<string, OperationCost> = {
  // Rainforest operations
  product_search: {
    operation: 'product_search',
    api: 'rainforest',
    requestsPerItem: 1,
    description: 'Search Amazon for products',
  },
  product_lookup: {
    operation: 'product_lookup',
    api: 'rainforest',
    requestsPerItem: 1,
    description: 'Look up single product by ASIN',
  },
  price_refresh: {
    operation: 'price_refresh',
    api: 'rainforest',
    requestsPerItem: 1,
    description: 'Refresh product price from Amazon',
  },
  
  // Keepa operations
  price_history: {
    operation: 'price_history',
    api: 'keepa',
    requestsPerItem: 1,
    description: 'Get historical price data',
  },
  
  // Shopify operations
  shopify_create: {
    operation: 'shopify_create',
    api: 'shopify',
    requestsPerItem: 1,
    description: 'Create product in Shopify',
  },
  shopify_update: {
    operation: 'shopify_update',
    api: 'shopify',
    requestsPerItem: 1,
    description: 'Update product in Shopify',
  },
  
  // Twilio operations
  sms_alert: {
    operation: 'sms_alert',
    api: 'twilio',
    requestsPerItem: 1,
    description: 'Send SMS notification',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// COST ESTIMATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Estimate cost for a single operation
 */
export function estimateOperationCost(
  operationType: keyof typeof OPERATION_COSTS,
  itemCount: number
): CostEstimate {
  const operation = OPERATION_COSTS[operationType];
  if (!operation) {
    return {
      api: 'unknown',
      operation: operationType,
      requestCount: 0,
      costPerRequest: 0,
      totalCost: 0,
      currency: 'USD',
      isFree: true,
      notes: 'Unknown operation type',
    };
  }

  const pricing = API_PRICING[operation.api];
  const requestCount = itemCount * operation.requestsPerItem;
  const totalCost = requestCount * pricing.costPerRequest;
  const isFree = pricing.costPerRequest === 0;

  return {
    api: operation.api,
    operation: operationType,
    requestCount,
    costPerRequest: pricing.costPerRequest,
    totalCost: roundToFourDecimals(totalCost),
    currency: 'USD',
    isFree,
    notes: operation.description,
  };
}

/**
 * Estimate costs for multiple operations
 */
export function estimateBulkCost(
  operations: Array<{ operation: keyof typeof OPERATION_COSTS; itemCount: number }>
): BulkCostEstimate {
  const estimates: CostEstimate[] = [];
  const breakdown: Record<string, number> = {};
  const warnings: string[] = [];
  let totalCost = 0;

  for (const op of operations) {
    const estimate = estimateOperationCost(op.operation, op.itemCount);
    estimates.push(estimate);
    totalCost += estimate.totalCost;

    // Track per-API breakdown
    if (!breakdown[estimate.api]) {
      breakdown[estimate.api] = 0;
    }
    breakdown[estimate.api] += estimate.totalCost;

    // Add warnings for high costs
    if (estimate.totalCost > 10) {
      warnings.push(
        `${estimate.api}: ${op.operation} will cost $${estimate.totalCost.toFixed(2)} for ${op.itemCount} items`
      );
    }
  }

  // Add overall warning if total is high
  if (totalCost > 50) {
    warnings.unshift(`Total estimated cost: $${totalCost.toFixed(2)} - consider processing in smaller batches`);
  }

  return {
    estimates,
    totalCost: roundToFourDecimals(totalCost),
    currency: 'USD',
    breakdown,
    warnings,
  };
}

/**
 * Estimate cost for import operation based on source
 */
export function estimateImportCost(
  source: 'rainforest' | 'keepa' | 'csv' | 'paste',
  itemCount: number
): CostEstimate {
  switch (source) {
    case 'rainforest':
      return estimateOperationCost('product_lookup', itemCount);
    case 'keepa':
      return estimateOperationCost('price_history', itemCount);
    case 'csv':
    case 'paste':
      // No API cost for file/paste imports
      return {
        api: 'none',
        operation: 'file_import',
        requestCount: 0,
        costPerRequest: 0,
        totalCost: 0,
        currency: 'USD',
        isFree: true,
        notes: 'File imports have no API cost',
      };
    default:
      return {
        api: 'unknown',
        operation: 'unknown',
        requestCount: 0,
        costPerRequest: 0,
        totalCost: 0,
        currency: 'USD',
        isFree: true,
        notes: 'Unknown import source',
      };
  }
}

/**
 * Estimate cost for discovery operation
 */
export function estimateDiscoveryCost(
  searchCount: number,
  productsPerSearch: number = 10
): BulkCostEstimate {
  const totalProducts = searchCount * productsPerSearch;
  
  return estimateBulkCost([
    { operation: 'product_search', itemCount: searchCount },
    { operation: 'product_lookup', itemCount: totalProducts },
  ]);
}

/**
 * Estimate cost for price refresh operation
 */
export function estimatePriceRefreshCost(productCount: number): CostEstimate {
  return estimateOperationCost('price_refresh', productCount);
}

/**
 * Estimate cost for Shopify sync operation
 */
export function estimateShopifySyncCost(
  createCount: number,
  updateCount: number
): BulkCostEstimate {
  return estimateBulkCost([
    { operation: 'shopify_create', itemCount: createCount },
    { operation: 'shopify_update', itemCount: updateCount },
  ]);
}

/**
 * Estimate monthly SMS notification cost
 */
export function estimateMonthlySMSCost(
  alertsPerDay: number,
  daysInMonth: number = 30
): CostEstimate {
  return estimateOperationCost('sms_alert', alertsPerDay * daysInMonth);
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMATTING HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Round to 4 decimal places for accurate cost tracking
 */
function roundToFourDecimals(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Format cost as human-readable string
 */
export function formatCost(cost: number): string {
  if (cost === 0) {
    return 'Free';
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(2)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Format cost estimate as summary text
 */
export function formatCostEstimate(estimate: CostEstimate): string {
  if (estimate.isFree) {
    return `${estimate.operation}: Free (${estimate.requestCount} requests)`;
  }
  return `${estimate.operation}: ${formatCost(estimate.totalCost)} (${estimate.requestCount} requests @ ${formatCost(estimate.costPerRequest)} each)`;
}

/**
 * Format bulk estimate as summary text
 */
export function formatBulkCostEstimate(estimate: BulkCostEstimate): string {
  const lines = [
    `Total Estimated Cost: ${formatCost(estimate.totalCost)}`,
    '',
    'Breakdown by API:',
  ];

  for (const [api, cost] of Object.entries(estimate.breakdown)) {
    lines.push(`  ${api}: ${formatCost(cost)}`);
  }

  if (estimate.warnings.length > 0) {
    lines.push('', 'Warnings:');
    for (const warning of estimate.warnings) {
      lines.push(`  ⚠️ ${warning}`);
    }
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// BUDGET TRACKING
// ═══════════════════════════════════════════════════════════════════════════

export interface BudgetStatus {
  api: string;
  used: number;
  budget: number;
  remaining: number;
  percentUsed: number;
  isOverBudget: boolean;
}

/**
 * Check if operation would exceed budget
 */
export function checkBudget(
  api: string,
  currentSpend: number,
  budget: number,
  additionalCost: number
): BudgetStatus {
  const projectedTotal = currentSpend + additionalCost;
  const remaining = Math.max(0, budget - projectedTotal);
  const percentUsed = budget > 0 ? (projectedTotal / budget) * 100 : 0;

  return {
    api,
    used: projectedTotal,
    budget,
    remaining,
    percentUsed: Math.round(percentUsed * 10) / 10,
    isOverBudget: projectedTotal > budget,
  };
}

/**
 * Format budget status as human-readable text
 */
export function formatBudgetStatus(status: BudgetStatus): string {
  if (status.isOverBudget) {
    return `⚠️ ${status.api}: Over budget by ${formatCost(status.used - status.budget)} (${status.percentUsed.toFixed(1)}% of ${formatCost(status.budget)} budget)`;
  }
  return `${status.api}: ${formatCost(status.used)} of ${formatCost(status.budget)} used (${status.percentUsed.toFixed(1)}%), ${formatCost(status.remaining)} remaining`;
}

// ═══════════════════════════════════════════════════════════════════════════
// USAGE TRACKING (for display in UI)
// ═══════════════════════════════════════════════════════════════════════════

export interface UsageRecord {
  api: string;
  operation: string;
  requestCount: number;
  cost: number;
  timestamp: Date;
}

export interface DailyUsageSummary {
  date: string;
  totalCost: number;
  requestCount: number;
  byApi: Record<string, { requests: number; cost: number }>;
}

/**
 * Aggregate usage records into daily summary
 */
export function aggregateDailyUsage(records: UsageRecord[]): DailyUsageSummary[] {
  const byDate: Record<string, DailyUsageSummary> = {};

  for (const record of records) {
    const date = record.timestamp.toISOString().split('T')[0];
    
    if (!byDate[date]) {
      byDate[date] = {
        date,
        totalCost: 0,
        requestCount: 0,
        byApi: {},
      };
    }

    byDate[date].totalCost += record.cost;
    byDate[date].requestCount += record.requestCount;

    if (!byDate[date].byApi[record.api]) {
      byDate[date].byApi[record.api] = { requests: 0, cost: 0 };
    }
    byDate[date].byApi[record.api].requests += record.requestCount;
    byDate[date].byApi[record.api].cost += record.cost;
  }

  // Sort by date descending
  return Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
}
