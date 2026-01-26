// lib/services/keepa.ts
// Keepa API service for Amazon historical price and sales rank data
// Falls back to mock data when API key is not configured

import type { ApiResponse } from '@/types/errors';
import type { KeepaProductData } from '@/types';
import { createSuccessResponse, createResponseFromCode, logError } from '@/lib/utils/api-error-handler';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const KEEPA_API_BASE = 'https://api.keepa.com';

// Token costs per request type
export const KEEPA_COSTS = {
  product: 1,           // Single product lookup
  productBatch: 1,      // Per product in batch (up to 100)
  deals: 10,            // Deals endpoint
  categories: 0,        // Free
  trackingAdd: 1,       // Add product tracking
  trackingList: 0,      // Free
} as const;

// Rate limiting
const RATE_LIMIT = {
  maxBatchSize: 100,    // Max ASINs per batch request
  requestsPerMinute: 60,
} as const;

// Keepa uses minutes since epoch (Jan 1, 2011)
const KEEPA_EPOCH = new Date('2011-01-01T00:00:00Z').getTime();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface KeepaConfig {
  apiKey: string | undefined;
  isConfigured: boolean;
}

// Keepa API response format
interface KeepaAPIProduct {
  asin: string;
  title?: string;
  domainId?: number;
  csv?: Array<number[] | null>; // Price history arrays
  salesRankReference?: number;
  salesRanks?: Record<string, number[]>;
  stats?: {
    avg30?: number[];
    avg90?: number[];
    avg180?: number[];
    avg365?: number[];
    current?: number[];
  };
}

interface KeepaAPIResponse {
  timestamp?: number;
  tokensLeft?: number;
  refillIn?: number;
  refillRate?: number;
  products?: KeepaAPIProduct[];
  error?: {
    message: string;
    type?: string;
  };
}

export interface KeepaServiceResult {
  products: KeepaProductData[];
  tokensUsed: number;
  tokensRemaining?: number;
  isMock: boolean;
  found: number;
  notFound: string[];
}

export interface SingleKeepaResult {
  product: KeepaProductData | null;
  tokensUsed: number;
  isMock: boolean;
}

export interface PriceHistoryPoint {
  timestamp: number;
  price: number;
  date: Date;
}

export interface EnrichedKeepaData extends KeepaProductData {
  priceHistoryDates: PriceHistoryPoint[];
  lowestPrice30d?: number;
  highestPrice30d?: number;
  priceStability: 'stable' | 'volatile' | 'unknown';
  salesRankTrend: 'improving' | 'declining' | 'stable' | 'unknown';
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION HELPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get Keepa API configuration status
 */
export function getKeepaConfig(): KeepaConfig {
  const apiKey = process.env.KEEPA_API_KEY;
  return {
    apiKey,
    isConfigured: !!apiKey && apiKey.length > 0,
  };
}

/**
 * Check if Keepa API is configured
 */
export function hasKeepaConfig(): boolean {
  return getKeepaConfig().isConfigured;
}

// ═══════════════════════════════════════════════════════════════════════════
// TIME CONVERSION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert Keepa time (minutes since Jan 1, 2011) to JavaScript timestamp
 */
export function keepaTimeToTimestamp(keepaTime: number): number {
  return KEEPA_EPOCH + (keepaTime * 60 * 1000);
}

/**
 * Convert JavaScript timestamp to Keepa time
 */
export function timestampToKeepaTime(timestamp: number): number {
  return Math.floor((timestamp - KEEPA_EPOCH) / (60 * 1000));
}

/**
 * Convert Keepa price (in cents) to dollars
 */
export function keepaPriceToDollars(keepaPrice: number): number {
  if (keepaPrice < 0) return 0; // Keepa uses -1 for unavailable
  return keepaPrice / 100;
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DATA GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate seeded random number for consistent mock data
 */
function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs((Math.sin(hash) + 1) / 2);
}

/**
 * Generate mock price history for a product
 */
function generateMockPriceHistory(
  asin: string,
  basePrice: number,
  days: number = 90
): Array<{ timestamp: number; price: number }> {
  const history: Array<{ timestamp: number; price: number }> = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  
  // Generate price points every 3 days for volatility
  for (let i = days; i >= 0; i -= 3) {
    const timestamp = now - (i * dayMs);
    // Price varies by ±15% around base price
    const random = seededRandom(asin + i.toString());
    const variance = (random - 0.5) * 0.3; // -15% to +15%
    const price = Math.round((basePrice * (1 + variance)) * 100) / 100;
    
    history.push({ timestamp, price: Math.max(price, 1) });
  }
  
  return history;
}

/**
 * Generate mock Keepa product data
 */
function generateMockKeepaProduct(asin: string): KeepaProductData {
  const random = seededRandom(asin);
  const basePrice = 5 + (random * 20); // $5-$25
  const history = generateMockPriceHistory(asin, basePrice, 90);
  
  // Calculate averages from mock history
  const last30Days = history.filter(h => h.timestamp > Date.now() - (30 * 24 * 60 * 60 * 1000));
  const last90Days = history;
  
  const avg30d = last30Days.length > 0
    ? Math.round((last30Days.reduce((sum, h) => sum + h.price, 0) / last30Days.length) * 100) / 100
    : undefined;
  
  const avg90d = last90Days.length > 0
    ? Math.round((last90Days.reduce((sum, h) => sum + h.price, 0) / last90Days.length) * 100) / 100
    : undefined;

  // Sales rank between 1000 and 100000
  const salesRank = Math.floor(1000 + (random * 99000));

  return {
    asin,
    priceHistory: history,
    salesRank,
    avgPrice30d: avg30d,
    avgPrice90d: avg90d,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// API RESPONSE TRANSFORMER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Transform Keepa API response to our format
 * Keepa uses array indices for different price types:
 * 0: Amazon Price
 * 1: New 3rd Party
 * 2: Used
 * etc.
 */
function transformKeepaProduct(apiProduct: KeepaAPIProduct): KeepaProductData {
  const priceHistory: Array<{ timestamp: number; price: number }> = [];
  
  // Extract Amazon price history (index 0 in csv array)
  if (apiProduct.csv && apiProduct.csv[0]) {
    const amazonPrices = apiProduct.csv[0];
    // Keepa stores as [time, price, time, price, ...]
    for (let i = 0; i < amazonPrices.length - 1; i += 2) {
      const keepaTime = amazonPrices[i];
      const keepaPrice = amazonPrices[i + 1];
      
      if (keepaTime !== -1 && keepaPrice !== -1) {
        priceHistory.push({
          timestamp: keepaTimeToTimestamp(keepaTime),
          price: keepaPriceToDollars(keepaPrice),
        });
      }
    }
  }

  // Extract averages
  let avgPrice30d: number | undefined;
  let avgPrice90d: number | undefined;
  
  if (apiProduct.stats) {
    // Amazon price average is index 0
    if (apiProduct.stats.avg30?.[0] && apiProduct.stats.avg30[0] > 0) {
      avgPrice30d = keepaPriceToDollars(apiProduct.stats.avg30[0]);
    }
    if (apiProduct.stats.avg90?.[0] && apiProduct.stats.avg90[0] > 0) {
      avgPrice90d = keepaPriceToDollars(apiProduct.stats.avg90[0]);
    }
  }

  return {
    asin: apiProduct.asin,
    priceHistory,
    salesRank: apiProduct.salesRankReference ?? null,
    avgPrice30d,
    avgPrice90d,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// API REQUEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Make request to Keepa API
 */
async function makeKeepaRequest(
  endpoint: string,
  params: Record<string, string>
): Promise<ApiResponse<KeepaAPIResponse>> {
  const config = getKeepaConfig();
  
  if (!config.isConfigured) {
    return createResponseFromCode('KEEPA_001');
  }

  try {
    const url = new URL(`${KEEPA_API_BASE}/${endpoint}`);
    url.searchParams.set('key', config.apiKey!);
    
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return createResponseFromCode('KEEPA_002');
      }
      if (response.status === 429) {
        return createResponseFromCode('KEEPA_004');
      }
      if (response.status === 402) {
        return createResponseFromCode('KEEPA_003');
      }
      return createResponseFromCode('KEEPA_001');
    }

    const data = await response.json() as KeepaAPIResponse;

    if (data.error) {
      logError('KEEPA_002', new Error(data.error.message));
      if (data.error.type === 'UNAUTHORIZED') {
        return createResponseFromCode('KEEPA_002');
      }
      if (data.error.type === 'INSUFFICIENT_TOKENS') {
        return createResponseFromCode('KEEPA_003');
      }
      return createResponseFromCode('KEEPA_004');
    }

    return createSuccessResponse(data);
  } catch (error) {
    logError('KEEPA_004', error instanceof Error ? error : new Error(String(error)));
    return createResponseFromCode('KEEPA_004');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API: SINGLE PRODUCT LOOKUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get historical price data for a single ASIN
 */
export async function getProductHistory(
  asin: string,
  options: {
    domain?: number; // 1 = US (amazon.com)
    days?: number;   // History days (default 90)
  } = {}
): Promise<ApiResponse<SingleKeepaResult>> {
  const { domain = 1, days = 90 } = options;
  const config = getKeepaConfig();

  // Validate ASIN format
  if (!/^B[A-Z0-9]{9}$/.test(asin)) {
    return createSuccessResponse({
      product: null,
      tokensUsed: 0,
      isMock: !config.isConfigured,
    });
  }

  // MOCK MODE
  if (!config.isConfigured) {
    console.log(`[Keepa] Using mock data for ASIN: ${asin}`);
    
    return createSuccessResponse({
      product: generateMockKeepaProduct(asin),
      tokensUsed: 0,
      isMock: true,
    });
  }

  // LIVE MODE
  const response = await makeKeepaRequest('product', {
    domain: domain.toString(),
    asin: asin,
    history: '1',
    days: days.toString(),
    stats: days.toString(),
  });

  if (!response.success) {
    return response as ApiResponse<SingleKeepaResult>;
  }

  const data = response.data;
  const product = data.products?.[0] ? transformKeepaProduct(data.products[0]) : null;

  return createSuccessResponse({
    product,
    tokensUsed: KEEPA_COSTS.product,
    isMock: false,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API: BATCH PRODUCT LOOKUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get historical price data for multiple ASINs
 * Automatically batches for efficiency
 */
export async function getProductsHistory(
  asins: string[],
  options: {
    domain?: number;
    days?: number;
  } = {}
): Promise<ApiResponse<KeepaServiceResult>> {
  const { domain = 1, days = 90 } = options;
  const config = getKeepaConfig();

  // Filter valid ASINs
  const validAsins = asins.filter(asin => /^B[A-Z0-9]{9}$/.test(asin));
  const invalidAsins = asins.filter(asin => !/^B[A-Z0-9]{9}$/.test(asin));

  if (validAsins.length === 0) {
    return createSuccessResponse({
      products: [],
      tokensUsed: 0,
      tokensRemaining: undefined,
      isMock: !config.isConfigured,
      found: 0,
      notFound: invalidAsins,
    });
  }

  // MOCK MODE
  if (!config.isConfigured) {
    console.log(`[Keepa] Using mock data for ${validAsins.length} ASINs`);
    
    const products = validAsins.map(asin => generateMockKeepaProduct(asin));
    
    return createSuccessResponse({
      products,
      tokensUsed: 0,
      tokensRemaining: undefined,
      isMock: true,
      found: products.length,
      notFound: invalidAsins,
    });
  }

  // LIVE MODE: Process in batches
  const products: KeepaProductData[] = [];
  const notFound: string[] = [...invalidAsins];
  let totalTokens = 0;
  let tokensRemaining: number | undefined;

  // Split into batches
  const batches: string[][] = [];
  for (let i = 0; i < validAsins.length; i += RATE_LIMIT.maxBatchSize) {
    batches.push(validAsins.slice(i, i + RATE_LIMIT.maxBatchSize));
  }

  // Process each batch
  for (const batch of batches) {
    const response = await makeKeepaRequest('product', {
      domain: domain.toString(),
      asin: batch.join(','),
      history: '1',
      days: days.toString(),
      stats: days.toString(),
    });

    if (!response.success) {
      // On error, mark all batch items as not found but continue
      notFound.push(...batch);
      continue;
    }

    const data = response.data;
    tokensRemaining = data.tokensLeft;
    totalTokens += batch.length * KEEPA_COSTS.productBatch;

    if (data.products) {
      const foundAsins = new Set<string>();
      for (const apiProduct of data.products) {
        products.push(transformKeepaProduct(apiProduct));
        foundAsins.add(apiProduct.asin);
      }
      
      // Track ASINs not returned
      for (const asin of batch) {
        if (!foundAsins.has(asin)) {
          notFound.push(asin);
        }
      }
    }
  }

  return createSuccessResponse({
    products,
    tokensUsed: totalTokens,
    tokensRemaining,
    isMock: false,
    found: products.length,
    notFound,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API: PRICE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyze price history and return enriched data
 */
export function analyzeHistory(product: KeepaProductData): EnrichedKeepaData {
  const now = Date.now();
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
  
  // Filter to last 30 days
  const recent = product.priceHistory.filter(h => h.timestamp >= thirtyDaysAgo);
  
  // Convert to dates
  const priceHistoryDates: PriceHistoryPoint[] = product.priceHistory.map(h => ({
    ...h,
    date: new Date(h.timestamp),
  }));
  
  // Calculate 30-day min/max
  let lowestPrice30d: number | undefined;
  let highestPrice30d: number | undefined;
  
  if (recent.length > 0) {
    const prices = recent.map(h => h.price);
    lowestPrice30d = Math.min(...prices);
    highestPrice30d = Math.max(...prices);
  }
  
  // Calculate price stability
  let priceStability: 'stable' | 'volatile' | 'unknown' = 'unknown';
  
  if (recent.length >= 3 && lowestPrice30d && highestPrice30d) {
    const avgPrice = recent.reduce((sum, h) => sum + h.price, 0) / recent.length;
    const variance = (highestPrice30d - lowestPrice30d) / avgPrice;
    
    if (variance < 0.10) {
      priceStability = 'stable'; // Less than 10% variance
    } else {
      priceStability = 'volatile';
    }
  }
  
  // Determine sales rank trend (simplified)
  let salesRankTrend: 'improving' | 'declining' | 'stable' | 'unknown' = 'unknown';
  
  if (product.salesRank !== null && product.salesRank !== undefined) {
    // Lower sales rank = better
    // Without historical rank data, we can't determine trend
    // In a real implementation, we'd compare against historical rank
    salesRankTrend = 'stable';
  }

  return {
    ...product,
    priceHistoryDates,
    lowestPrice30d,
    highestPrice30d,
    priceStability,
    salesRankTrend,
  };
}

/**
 * Check if current price is a good deal based on history
 */
export function isPriceGoodDeal(
  currentPrice: number,
  history: KeepaProductData
): { isGoodDeal: boolean; savingsPercent: number; reason: string } {
  const enriched = analyzeHistory(history);
  
  if (!enriched.avgPrice90d) {
    return {
      isGoodDeal: false,
      savingsPercent: 0,
      reason: 'Insufficient price history',
    };
  }
  
  const avgPrice = enriched.avgPrice90d;
  const savingsPercent = Math.round(((avgPrice - currentPrice) / avgPrice) * 100);
  
  if (savingsPercent >= 15) {
    return {
      isGoodDeal: true,
      savingsPercent,
      reason: `${savingsPercent}% below 90-day average ($${avgPrice.toFixed(2)})`,
    };
  }
  
  if (enriched.lowestPrice30d && currentPrice <= enriched.lowestPrice30d * 1.05) {
    return {
      isGoodDeal: true,
      savingsPercent,
      reason: `Near 30-day low of $${enriched.lowestPrice30d.toFixed(2)}`,
    };
  }
  
  return {
    isGoodDeal: false,
    savingsPercent,
    reason: savingsPercent < 0 
      ? `${Math.abs(savingsPercent)}% above average` 
      : 'Price within normal range',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COST ESTIMATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Estimate token cost for a Keepa operation
 */
export function estimateTokenCost(options: {
  singleLookups?: number;
  batchLookups?: number;
  dealsRequests?: number;
}): number {
  const { singleLookups = 0, batchLookups = 0, dealsRequests = 0 } = options;
  
  return (
    singleLookups * KEEPA_COSTS.product +
    batchLookups * KEEPA_COSTS.productBatch +
    dealsRequests * KEEPA_COSTS.deals
  );
}

/**
 * Get rate limit information
 */
export function getRateLimitInfo(): typeof RATE_LIMIT {
  return { ...RATE_LIMIT };
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE STATUS
// ═══════════════════════════════════════════════════════════════════════════

export interface KeepaServiceStatus {
  isConfigured: boolean;
  mode: 'live' | 'mock';
  tokenCostPerProduct: number;
  maxBatchSize: number;
}

/**
 * Get service status information
 */
export function getServiceStatus(): KeepaServiceStatus {
  const config = getKeepaConfig();
  
  return {
    isConfigured: config.isConfigured,
    mode: config.isConfigured ? 'live' : 'mock',
    tokenCostPerProduct: KEEPA_COSTS.product,
    maxBatchSize: RATE_LIMIT.maxBatchSize,
  };
}

/**
 * Get current token balance (requires API call)
 */
export async function getTokenBalance(): Promise<ApiResponse<{ tokensLeft: number; refillIn: number }>> {
  const config = getKeepaConfig();
  
  if (!config.isConfigured) {
    return createSuccessResponse({
      tokensLeft: 0,
      refillIn: 0,
    });
  }
  
  // Make a minimal request just to get token info
  const response = await makeKeepaRequest('token', {});
  
  if (!response.success) {
    return response as ApiResponse<{ tokensLeft: number; refillIn: number }>;
  }
  
  return createSuccessResponse({
    tokensLeft: response.data.tokensLeft ?? 0,
    refillIn: response.data.refillIn ?? 0,
  });
}
