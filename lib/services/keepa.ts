// lib/services/keepa.ts
// ═══════════════════════════════════════════════════════════════════════════
// Complete Keepa API client with rate limiting, queue management, and batch processing
// Handles 60 tokens/minute limit for batch product processing
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { 
  PRICING_RULES, 
  isValidASIN, 
  calculateDemandScore,
  estimateMonthlySales,
  calculateProcessingPriority,
} from '@/lib/config/pricing-rules';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const KEEPA_API_KEY = process.env.KEEPA_API_KEY || '';
const KEEPA_BASE_URL = 'https://api.keepa.com';

// Keepa uses minutes since epoch (Jan 1, 2011)
const KEEPA_EPOCH = new Date('2011-01-01T00:00:00Z').getTime();

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface KeepaProduct {
  asin: string;
  title: string;
  brand: string | null;
  category: string | null;
  categoryTree: string[];
  
  // Current prices (in dollars)
  currentAmazonPrice: number | null;
  currentNewPrice: number | null;
  currentUsedPrice: number | null;
  
  // Price history (recent values in dollars)
  priceHistory: { timestamp: Date; price: number }[];
  
  // Sales rank / BSR
  currentBSR: number | null;
  bsrCategory: string | null;
  bsrHistory: { timestamp: Date; rank: number }[];
  
  // Stock status
  isInStock: boolean;
  stockStatus: 'in_stock' | 'out_of_stock' | 'limited' | 'unknown';
  
  // Prime and sellers
  isPrime: boolean;
  sellerCount: number;
  
  // Reviews
  rating: number | null;
  reviewCount: number | null;
  
  // Demand metrics (calculated)
  demandScore: number;
  bsrVolatility: number;
  estimatedMonthlySales: number;
  
  // Metadata
  lastUpdate: Date;
  imageUrl: string | null;
  amazonUrl: string;
}

interface KeepaQueueItem {
  asin: string;
  priority: number;
  originalCost: number;
  originalPrice: number;
  addedAt: Date;
  jobId?: string;
  jobType?: string;
}

interface QueueStatus {
  queueLength: number;
  isProcessing: boolean;
  tokensUsed: number;
  tokensRemaining: number;
  canProceed: boolean;
  estimatedTimeMinutes: number;
  nextResetAt: Date | null;
}

interface KeepaRawProduct {
  asin: string;
  title?: string;
  brand?: string;
  categoryTree?: Array<{ catId: number; name: string }>;
  rootCategory?: number;
  csv?: Array<number[] | null>;
  salesRanks?: Record<string, number[]>;
  lastUpdate?: number;
  imagesCSV?: string;
  stats?: {
    avg30?: number[];
    avg90?: number[];
    current?: number[];
  };
}

interface KeepaRawResponse {
  timestamp?: number;
  tokensLeft?: number;
  refillIn?: number;
  refillRate?: number;
  products?: KeepaRawProduct[];
  error?: { type: string; message: string };
}

interface RateLimitState {
  tokensUsed: number;
  windowStart: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

let rateLimitState: RateLimitState = {
  tokensUsed: 0,
  windowStart: Date.now(),
};

let processingQueue: KeepaQueueItem[] = [];
let isProcessing = false;

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════

function resetRateLimitIfNeeded(): void {
  const now = Date.now();
  const windowDuration = 60 * 1000; // 1 minute
  
  if (now - rateLimitState.windowStart >= windowDuration) {
    rateLimitState = {
      tokensUsed: 0,
      windowStart: now,
    };
  }
}

function recordTokenUsage(tokens: number): void {
  resetRateLimitIfNeeded();
  rateLimitState.tokensUsed += tokens;
}

export function getRateLimitStatus(): {
  tokensUsed: number;
  tokensRemaining: number;
  msUntilReset: number;
  canProceed: boolean;
} {
  resetRateLimitIfNeeded();
  
  const tokensRemaining = PRICING_RULES.keepa.tokensPerMinute - rateLimitState.tokensUsed;
  const msUntilReset = Math.max(0, 60000 - (Date.now() - rateLimitState.windowStart));
  
  return {
    tokensUsed: rateLimitState.tokensUsed,
    tokensRemaining,
    msUntilReset,
    canProceed: tokensRemaining > 0,
  };
}

async function waitForRateLimit(tokensNeeded: number): Promise<void> {
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  while (true) {
    resetRateLimitIfNeeded();
    const status = getRateLimitStatus();
    
    if (status.tokensRemaining >= tokensNeeded) {
      return;
    }
    
    console.log(`[Keepa] Rate limit: waiting ${status.msUntilReset}ms for reset...`);
    await sleep(Math.min(status.msUntilReset + 100, 60000));
  }
}

export function checkRateLimit(): { canProceed: boolean; waitMs: number } {
  const status = getRateLimitStatus();
  return {
    canProceed: status.canProceed,
    waitMs: status.canProceed ? 0 : status.msUntilReset,
  };
}

export function recordApiCall(tokens: number): void {
  recordTokenUsage(tokens);
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA PARSING
// ═══════════════════════════════════════════════════════════════════════════

export function keepaTimeToDate(keepaTime: number): Date {
  if (keepaTime < 0) return new Date(0);
  return new Date(KEEPA_EPOCH + keepaTime * 60 * 1000);
}

export function parseKeepaTimestamp(keepaTime: number): Date {
  return keepaTimeToDate(keepaTime);
}

export function keepaPriceToUSD(keepaPrice: number): number | null {
  if (keepaPrice < 0) return null;
  return keepaPrice / 100;
}

export function parseKeepaPrice(keepaPrice: number): number {
  const result = keepaPriceToUSD(keepaPrice);
  return result ?? 0;
}

function parseKeepaTimeSeries(
  csv: number[] | undefined,
  valueTransform: (v: number) => number | null = (v) => v
): { timestamp: Date; value: number }[] {
  if (!csv || csv.length < 2) return [];
  
  const result: { timestamp: Date; value: number }[] = [];
  
  for (let i = 0; i < csv.length - 1; i += 2) {
    const time = csv[i];
    const value = csv[i + 1];
    
    if (time < 0 || value < 0) continue;
    
    const transformedValue = valueTransform(value);
    if (transformedValue !== null) {
      result.push({
        timestamp: keepaTimeToDate(time),
        value: transformedValue,
      });
    }
  }
  
  return result;
}

function calculateBSRVolatility(bsrHistory: { timestamp: Date; value: number }[]): number {
  if (bsrHistory.length < 2) return 0;
  
  const values = bsrHistory.map(h => h.value).filter(v => v > 0);
  if (values.length < 2) return 0;
  
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const maxDeviation = Math.max(...values.map(v => Math.abs(v - avg)));
  
  return Math.round((maxDeviation / avg) * 100);
}

function detectSeasonality(salesRankHistory: number[]): {
  isSeasonalProduct: boolean;
  peakMonth: number | null;
  lowMonth: number | null;
  seasonalityScore: number;
} {
  if (salesRankHistory.length < 30) {
    return { isSeasonalProduct: false, peakMonth: null, lowMonth: null, seasonalityScore: 0 };
  }
  
  // Group by month and calculate averages
  const monthlyAvg: Record<number, { sum: number; count: number }> = {};
  
  salesRankHistory.forEach((rank, index) => {
    const month = index % 12;
    if (!monthlyAvg[month]) monthlyAvg[month] = { sum: 0, count: 0 };
    monthlyAvg[month].sum += rank;
    monthlyAvg[month].count++;
  });
  
  const monthlyAverages = Object.entries(monthlyAvg).map(([month, data]) => ({
    month: parseInt(month),
    avg: data.sum / data.count,
  }));
  
  if (monthlyAverages.length < 4) {
    return { isSeasonalProduct: false, peakMonth: null, lowMonth: null, seasonalityScore: 0 };
  }
  
  const sorted = [...monthlyAverages].sort((a, b) => a.avg - b.avg);
  const peakMonth = sorted[0].month; // Lowest BSR = peak sales
  const lowMonth = sorted[sorted.length - 1].month; // Highest BSR = low sales
  
  const overallAvg = monthlyAverages.reduce((a, b) => a + b.avg, 0) / monthlyAverages.length;
  const variance = monthlyAverages.reduce((a, b) => a + Math.pow(b.avg - overallAvg, 2), 0) / monthlyAverages.length;
  const seasonalityScore = Math.min(100, Math.round((Math.sqrt(variance) / overallAvg) * 100));
  
  return {
    isSeasonalProduct: seasonalityScore > 30,
    peakMonth,
    lowMonth,
    seasonalityScore,
  };
}

function transformKeepaProduct(raw: KeepaRawProduct): KeepaProduct {
  // Parse price history (Amazon price is index 0)
  const amazonPriceHistory = raw.csv?.[0] 
    ? parseKeepaTimeSeries(raw.csv[0], keepaPriceToUSD)
    : [];
  
  // Parse BSR history
  const bsrData = raw.salesRanks 
    ? Object.values(raw.salesRanks)[0] 
    : undefined;
  const bsrHistory = bsrData 
    ? parseKeepaTimeSeries(bsrData, (v) => v > 0 ? v : null)
    : [];
  
  // Get current values
  const currentAmazonPrice = amazonPriceHistory.length > 0 
    ? amazonPriceHistory[amazonPriceHistory.length - 1].value 
    : null;
  
  const currentBSR = bsrHistory.length > 0 
    ? bsrHistory[bsrHistory.length - 1].value 
    : null;
  
  // Calculate demand metrics
  const bsrVolatility = calculateBSRVolatility(bsrHistory);
  const estimatedSales = estimateMonthlySales(currentBSR);
  const demandScore = calculateDemandScore({
    currentBSR,
    bsrHistory: bsrHistory.map(h => h.value),
    priceHistory: amazonPriceHistory.map(h => h.price),
  });
  
  // Get category info
  const categoryTree = raw.categoryTree?.map(c => c.name) || [];
  const category = categoryTree.length > 0 ? categoryTree[0] : null;
  const bsrCategory = raw.salesRanks ? Object.keys(raw.salesRanks)[0] : null;
  
  // Get image URL
  const imageUrl = raw.imagesCSV 
    ? `https://images-na.ssl-images-amazon.com/images/I/${raw.imagesCSV.split(',')[0]}`
    : null;
  
  // Determine stock status
  const isInStock = currentAmazonPrice !== null && currentAmazonPrice > 0;
  let stockStatus: 'in_stock' | 'out_of_stock' | 'limited' | 'unknown' = 'unknown';
  if (isInStock) {
    stockStatus = 'in_stock';
  } else if (currentAmazonPrice === null) {
    stockStatus = 'out_of_stock';
  }
  
  // Get rating and review count from stats
  const rating = raw.stats?.current?.[18] ? raw.stats.current[18] / 10 : null;
  const reviewCount = raw.stats?.current?.[19] || null;
  
  return {
    asin: raw.asin,
    title: raw.title || '',
    brand: raw.brand || null,
    category,
    categoryTree,
    
    currentAmazonPrice,
    currentNewPrice: raw.csv?.[1] ? keepaPriceToUSD(raw.csv[1][raw.csv[1].length - 1]) : null,
    currentUsedPrice: raw.csv?.[2] ? keepaPriceToUSD(raw.csv[2][raw.csv[2].length - 1]) : null,
    
    priceHistory: amazonPriceHistory.map(h => ({ timestamp: h.timestamp, price: h.value })),
    
    currentBSR,
    bsrCategory,
    bsrHistory: bsrHistory.map(h => ({ timestamp: h.timestamp, rank: h.value })),
    
    isInStock,
    stockStatus,
    
    isPrime: isInStock, // Assume Prime if Amazon has stock
    sellerCount: 1, // Would need additional API call for accurate count
    
    rating,
    reviewCount,
    demandScore,
    bsrVolatility,
    estimatedMonthlySales: estimatedSales,
    
    lastUpdate: raw.lastUpdate ? keepaTimeToDate(raw.lastUpdate) : new Date(),
    imageUrl,
    amazonUrl: `https://www.amazon.com/dp/${raw.asin}`,
  };
}

export function keepaToProduct(keepaData: any): KeepaProduct {
  return transformKeepaProduct(keepaData);
}

// ═══════════════════════════════════════════════════════════════════════════
// API CALLS
// ═══════════════════════════════════════════════════════════════════════════

async function keepaRequest(
  endpoint: string,
  params: Record<string, string | number>
): Promise<KeepaRawResponse> {
  if (!KEEPA_API_KEY) {
    throw new Error('KEEPA_API_KEY not configured');
  }
  
  const url = new URL(`${KEEPA_BASE_URL}/${endpoint}`);
  url.searchParams.set('key', KEEPA_API_KEY);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  
  console.log(`[Keepa] Request: ${endpoint}`, Object.keys(params));
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PRICING_RULES.keepa.requestTimeoutMs);
  
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      throw new Error(`Keepa API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json() as KeepaRawResponse;
    
    if (data.error) {
      throw new Error(`Keepa API error: ${data.error.type} - ${data.error.message}`);
    }
    
    return data;
  } catch (error: any) {
    clearTimeout(timeout);
    
    if (error.name === 'AbortError') {
      throw new Error('Keepa API request timed out');
    }
    
    throw error;
  }
}

async function logApiCall(
  tokensUsed: number,
  asinsRequested: number,
  asinsReturned: number,
  jobType: string | null,
  jobId: string | null,
  success: boolean,
  errorMessage: string | null = null,
  durationMs: number = 0
): Promise<void> {
  try {
    await supabase.from('keepa_api_log').insert({
      tokens_used: tokensUsed,
      asins_requested: asinsRequested,
      asins_returned: asinsReturned,
      asin_count: asinsRequested,
      job_type: jobType,
      job_id: jobId,
      success,
      error_message: errorMessage,
      duration_ms: durationMs,
      estimated_cost_usd: tokensUsed * PRICING_RULES.apiCosts.keepa.tokenCostUsd,
      requested_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Keepa] Failed to log API call:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function lookupProduct(
  asin: string,
  options: {
    includeHistory?: boolean;
    jobType?: string;
    jobId?: string;
  } = {}
): Promise<{ success: boolean; product?: KeepaProduct; error?: string }> {
  if (!isValidASIN(asin)) {
    return { success: false, error: `Invalid ASIN format: ${asin}` };
  }
  
  const tokensNeeded = PRICING_RULES.keepa.tokenCosts.product;
  await waitForRateLimit(tokensNeeded);
  
  const startTime = Date.now();
  
  try {
    const historyDays = options.includeHistory ? PRICING_RULES.keepa.historyDays : 0;
    
    const response = await keepaRequest('product', {
      domain: PRICING_RULES.keepa.domains.US,
      asin,
      stats: historyDays,
      history: options.includeHistory ? 1 : 0,
      offers: 0,
    });
    
    recordTokenUsage(tokensNeeded);
    
    const duration = Date.now() - startTime;
    
    if (!response.products || response.products.length === 0) {
      await logApiCall(tokensNeeded, 1, 0, options.jobType || null, options.jobId || null, false, 'Product not found', duration);
      return { success: false, error: 'Product not found' };
    }
    
    const product = transformKeepaProduct(response.products[0]);
    
    await logApiCall(tokensNeeded, 1, 1, options.jobType || null, options.jobId || null, true, null, duration);
    
    return { success: true, product };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    await logApiCall(tokensNeeded, 1, 0, options.jobType || null, options.jobId || null, false, error.message, duration);
    return { success: false, error: error.message };
  }
}

export async function lookupSingleProduct(asin: string): Promise<KeepaProduct | null> {
  const result = await lookupProduct(asin, { includeHistory: true });
  return result.success && result.product ? result.product : null;
}

export async function lookupProducts(
  asins: string[],
  options: {
    includeHistory?: boolean;
    jobType?: string;
    jobId?: string;
  } = {}
): Promise<{
  success: boolean;
  products: KeepaProduct[];
  errors: Array<{ asin: string; error: string }>;
  tokensUsed: number;
}> {
  // Validate and dedupe ASINs
  const validAsins = [...new Set(asins.filter(isValidASIN))];
  
  if (validAsins.length === 0) {
    return { success: false, products: [], errors: [], tokensUsed: 0 };
  }
  
  // Split into batches of max 100
  const batchSize = PRICING_RULES.keepa.batchSize;
  const batches: string[][] = [];
  
  for (let i = 0; i < validAsins.length; i += batchSize) {
    batches.push(validAsins.slice(i, i + batchSize));
  }
  
  const allProducts: KeepaProduct[] = [];
  const allErrors: Array<{ asin: string; error: string }> = [];
  let totalTokensUsed = 0;
  
  for (const batch of batches) {
    const tokensNeeded = batch.length * PRICING_RULES.keepa.tokenCosts.productBatch;
    await waitForRateLimit(tokensNeeded);
    
    const startTime = Date.now();
    
    try {
      const historyDays = options.includeHistory ? PRICING_RULES.keepa.historyDays : 0;
      
      const response = await keepaRequest('product', {
        domain: PRICING_RULES.keepa.domains.US,
        asin: batch.join(','),
        stats: historyDays,
        history: options.includeHistory ? 1 : 0,
        offers: 0,
      });
      
      recordTokenUsage(tokensNeeded);
      totalTokensUsed += tokensNeeded;
      
      const duration = Date.now() - startTime;
      
      if (response.products) {
        const products = response.products.map(transformKeepaProduct);
        allProducts.push(...products);
        
        // Track which ASINs weren't found
        const foundAsins = new Set(products.map(p => p.asin));
        for (const asin of batch) {
          if (!foundAsins.has(asin)) {
            allErrors.push({ asin, error: 'Product not found' });
          }
        }
      }
      
      await logApiCall(
        tokensNeeded,
        batch.length,
        response.products?.length || 0,
        options.jobType || null,
        options.jobId || null,
        true,
        null,
        duration
      );
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      for (const asin of batch) {
        allErrors.push({ asin, error: error.message });
      }
      
      await logApiCall(
        tokensNeeded,
        batch.length,
        0,
        options.jobType || null,
        options.jobId || null,
        false,
        error.message,
        duration
      );
    }
  }
  
  return {
    success: allProducts.length > 0,
    products: allProducts,
    errors: allErrors,
    tokensUsed: totalTokensUsed,
  };
}

export async function getBestSellers(
  categoryId: string,
  options: {
    jobType?: string;
    jobId?: string;
  } = {}
): Promise<{ success: boolean; products: KeepaProduct[]; error?: string }> {
  const tokensNeeded = PRICING_RULES.keepa.tokenCosts.bestSellers;
  await waitForRateLimit(tokensNeeded);
  
  const startTime = Date.now();
  
  try {
    const response = await keepaRequest('bestsellers', {
      domain: PRICING_RULES.keepa.domains.US,
      category: categoryId,
    });
    
    recordTokenUsage(tokensNeeded);
    
    const duration = Date.now() - startTime;
    
    // Best sellers returns ASIN list, need to look up details
    if (response.products) {
      const products = response.products.map(transformKeepaProduct);
      await logApiCall(tokensNeeded, products.length, products.length, options.jobType || null, options.jobId || null, true, null, duration);
      return { success: true, products };
    }
    
    return { success: false, products: [], error: 'No best sellers found' };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    await logApiCall(tokensNeeded, 0, 0, options.jobType || null, options.jobId || null, false, error.message, duration);
    return { success: false, products: [], error: error.message };
  }
}

export async function getDeals(options: {
  priceMin?: number;
  priceMax?: number;
  percentOff?: number;
  jobType?: string;
  jobId?: string;
} = {}): Promise<{ success: boolean; products: KeepaProduct[]; error?: string }> {
  const tokensNeeded = PRICING_RULES.keepa.tokenCosts.deals;
  await waitForRateLimit(tokensNeeded);
  
  const startTime = Date.now();
  
  try {
    const params: Record<string, string | number> = {
      domain: PRICING_RULES.keepa.domains.US,
    };
    
    if (options.priceMin) params.priceMin = Math.round(options.priceMin * 100);
    if (options.priceMax) params.priceMax = Math.round(options.priceMax * 100);
    if (options.percentOff) params.percentOff = options.percentOff;
    
    const response = await keepaRequest('deals', params);
    
    recordTokenUsage(tokensNeeded);
    
    const duration = Date.now() - startTime;
    
    if (response.products) {
      const products = response.products.map(transformKeepaProduct);
      await logApiCall(tokensNeeded, products.length, products.length, options.jobType || null, options.jobId || null, true, null, duration);
      return { success: true, products };
    }
    
    return { success: false, products: [], error: 'No deals found' };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    await logApiCall(tokensNeeded, 0, 0, options.jobType || null, options.jobId || null, false, error.message, duration);
    return { success: false, products: [], error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// QUEUE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add items to the processing queue
 * Items are sorted by priority (higher = process first)
 */
export function addToQueue(items: Array<{
  asin: string;
  originalCost?: number;
  originalPrice?: number;
  jobId?: string;
  jobType?: string;
}>): void {
  const queueItems: KeepaQueueItem[] = items.map(item => ({
    asin: item.asin,
    priority: calculateProcessingPriority(
      item.originalCost || 0,
      item.originalPrice || 0,
      'high-margin-first'
    ),
    originalCost: item.originalCost || 0,
    originalPrice: item.originalPrice || 0,
    addedAt: new Date(),
    jobId: item.jobId,
    jobType: item.jobType,
  }));
  
  // Add to queue and sort by priority (highest first)
  processingQueue.push(...queueItems);
  processingQueue.sort((a, b) => b.priority - a.priority);
  
  console.log(`[Keepa] Added ${items.length} items to queue. Queue size: ${processingQueue.length}`);
}

/**
 * Get current queue status
 */
export function getQueueStatus(): QueueStatus {
  const status = getRateLimitStatus();
  const tokensPerItem = PRICING_RULES.keepa.tokenCosts.productBatch;
  const tokensPerMinute = PRICING_RULES.keepa.tokensPerMinute;
  const itemsPerMinute = Math.floor(tokensPerMinute / tokensPerItem);
  
  return {
    queueLength: processingQueue.length,
    isProcessing,
    tokensUsed: status.tokensUsed,
    tokensRemaining: status.tokensRemaining,
    canProceed: status.canProceed,
    estimatedTimeMinutes: Math.ceil(processingQueue.length / itemsPerMinute),
    nextResetAt: status.msUntilReset > 0 
      ? new Date(Date.now() + status.msUntilReset) 
      : null,
  };
}

/**
 * Process the next batch from the queue
 */
export async function processNextBatch(
  options: {
    jobType?: string;
    jobId?: string;
    onProgress?: (processed: number, total: number) => void;
  } = {}
): Promise<{
  processed: KeepaProduct[];
  errors: { asin: string; error: string }[];
  remaining: number;
}> {
  const { jobType = 'queue', jobId = null, onProgress } = options;
  
  if (processingQueue.length === 0) {
    return { processed: [], errors: [], remaining: 0 };
  }
  
  if (isProcessing) {
    console.log('[Keepa] Already processing, skipping');
    return { processed: [], errors: [], remaining: processingQueue.length };
  }
  
  isProcessing = true;
  
  try {
    // Take up to batchSize items from queue
    const batchSize = PRICING_RULES.keepa.batchSize;
    const batch = processingQueue.splice(0, batchSize);
    
    console.log(`[Keepa] Processing batch of ${batch.length} items`);
    
    const asins = batch.map(item => item.asin);
    const result = await lookupProducts(asins, { includeHistory: true, jobType, jobId: jobId || undefined });
    
    if (onProgress) {
      onProgress(batch.length, processingQueue.length + batch.length);
    }
    
    return {
      processed: result.products,
      errors: result.errors,
      remaining: processingQueue.length,
    };
    
  } finally {
    isProcessing = false;
  }
}

/**
 * Process entire queue with progress callback
 */
export async function processQueue(
  options: {
    jobType?: string;
    jobId?: string;
    onProgress?: (processed: number, total: number, products: KeepaProduct[]) => void;
    onComplete?: (totalProcessed: number, totalErrors: number) => void;
  } = {}
): Promise<{
  totalProcessed: number;
  totalErrors: number;
  products: KeepaProduct[];
}> {
  const allProducts: KeepaProduct[] = [];
  let totalProcessed = 0;
  let totalErrors = 0;
  const originalTotal = processingQueue.length;
  
  while (processingQueue.length > 0) {
    const result = await processNextBatch({
      jobType: options.jobType,
      jobId: options.jobId,
    });
    
    allProducts.push(...result.processed);
    totalProcessed += result.processed.length;
    totalErrors += result.errors.length;
    
    if (options.onProgress) {
      options.onProgress(totalProcessed, originalTotal, result.processed);
    }
    
    // Respect rate limits between batches
    const status = getRateLimitStatus();
    if (!status.canProceed && processingQueue.length > 0) {
      console.log(`[Keepa] Waiting ${status.msUntilReset}ms for rate limit reset`);
      await new Promise(resolve => setTimeout(resolve, status.msUntilReset + 100));
    }
  }
  
  if (options.onComplete) {
    options.onComplete(totalProcessed, totalErrors);
  }
  
  return { totalProcessed, totalErrors, products: allProducts };
}

/**
 * Clear the processing queue
 */
export function clearQueue(): void {
  const count = processingQueue.length;
  processingQueue = [];
  console.log(`[Keepa] Cleared ${count} items from queue`);
}

/**
 * Pause queue processing
 */
export function pauseQueue(): void {
  isProcessing = false;
  console.log('[Keepa] Processing paused');
}

export function pauseProcessing(): void {
  pauseQueue();
}

/**
 * Resume queue processing
 */
export function resumeQueue(): void {
  console.log('[Keepa] Processing resumed');
}

// ═══════════════════════════════════════════════════════════════════════════
// DEMAND DATA MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Save or update demand data for a product
 */
export async function saveDemandData(product: KeepaProduct): Promise<void> {
  try {
    const bsrHistoryJson = product.bsrHistory.map(h => ({
      timestamp: h.timestamp.toISOString(),
      value: h.rank,
    }));
    
    const priceHistoryJson = product.priceHistory.map(h => ({
      timestamp: h.timestamp.toISOString(),
      value: h.price,
    }));
    
    // Calculate 30-day and 90-day averages from history
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    
    const recent30 = product.bsrHistory.filter(h => h.timestamp >= thirtyDaysAgo);
    const recent90 = product.bsrHistory.filter(h => h.timestamp >= ninetyDaysAgo);
    
    const avg30 = recent30.length > 0 
      ? Math.round(recent30.reduce((a, b) => a + b.rank, 0) / recent30.length)
      : null;
    
    const avg90 = recent90.length > 0
      ? Math.round(recent90.reduce((a, b) => a + b.rank, 0) / recent90.length)
      : null;
    
    // Determine BSR trend
    let bsrTrend: 'improving' | 'declining' | 'stable' = 'stable';
    if (avg30 !== null && avg90 !== null) {
      const changePercent = ((avg90 - avg30) / avg90) * 100;
      if (changePercent > 10) bsrTrend = 'improving';
      else if (changePercent < -10) bsrTrend = 'declining';
    }
    
    await supabase.from('product_demand').upsert({
      asin: product.asin,
      current_bsr: product.currentBSR,
      avg_bsr_30d: avg30,
      avg_bsr_90d: avg90,
      bsr_volatility: product.bsrVolatility,
      bsr_trend: bsrTrend,
      demand_score: product.demandScore,
      estimated_monthly_sales: product.estimatedMonthlySales,
      stock_status: product.stockStatus,
      bsr_history: bsrHistoryJson.slice(-90),
      price_history: priceHistoryJson.slice(-90),
      last_updated: new Date().toISOString(),
      last_checked_at: new Date().toISOString(),
    }, {
      onConflict: 'asin',
    });
  } catch (error) {
    console.error('[Keepa] Failed to save demand data:', error);
  }
}

export async function getDemandData(asin: string): Promise<{
  currentBSR: number | null;
  demandScore: number | null;
  estimatedMonthlySales: number | null;
  lastUpdated: Date | null;
  bsrTrend: string | null;
  stockStatus: string | null;
} | null> {
  try {
    const { data, error } = await supabase
      .from('product_demand')
      .select('current_bsr, demand_score, estimated_monthly_sales, last_updated, bsr_trend, stock_status')
      .eq('asin', asin)
      .single();
    
    if (error || !data) return null;
    
    return {
      currentBSR: data.current_bsr,
      demandScore: data.demand_score,
      estimatedMonthlySales: data.estimated_monthly_sales,
      lastUpdated: data.last_updated ? new Date(data.last_updated) : null,
      bsrTrend: data.bsr_trend,
      stockStatus: data.stock_status,
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// API STATUS
// ═══════════════════════════════════════════════════════════════════════════

export function isKeepaConfigured(): boolean {
  return !!KEEPA_API_KEY;
}

export async function testKeepaConnection(): Promise<{
  success: boolean;
  message: string;
  tokensRemaining?: number;
}> {
  if (!KEEPA_API_KEY) {
    return {
      success: false,
      message: 'KEEPA_API_KEY not configured in environment variables',
    };
  }
  
  try {
    // Test with a known ASIN (Amazon Basics product)
    const result = await lookupProduct('B07K5CXQJT', { jobType: 'test' });
    
    if (result.success) {
      const status = getRateLimitStatus();
      return {
        success: true,
        message: `Keepa API connected successfully. Tokens remaining: ${status.tokensRemaining}`,
        tokensRemaining: status.tokensRemaining,
      };
    } else {
      return {
        success: false,
        message: `Keepa API test failed: ${result.error}`,
      };
    }
    
  } catch (error: any) {
    return {
      success: false,
      message: `Keepa API connection failed: ${error.message}`,
    };
  }
}

export default {
  // API Functions
  lookupProduct,
  lookupSingleProduct,
  lookupProducts,
  getBestSellers,
  getDeals,
  
  // Queue Management
  addToQueue,
  getQueueStatus,
  processQueue,
  processNextBatch,
  clearQueue,
  pauseQueue,
  pauseProcessing,
  resumeQueue,
  
  // Rate Limiting
  checkRateLimit,
  recordApiCall,
  getRateLimitStatus,
  
  // Demand Analysis
  calculateDemandScore,
  detectSeasonality,
  estimateMonthlySales,
  saveDemandData,
  getDemandData,
  
  // Data Transformation
  keepaToProduct,
  parseKeepaTimestamp,
  parseKeepaPrice,
  keepaTimeToDate,
  keepaPriceToUSD,
  
  // Status
  isKeepaConfigured,
  testKeepaConnection,
};
