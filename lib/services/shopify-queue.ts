// lib/services/shopify-queue.ts
// Shopify Queue service for managing product push to Shopify
// Handles batching, rate limiting, and retry logic

import type { ApiResponse } from '@/types/errors';
import type { ShopifyQueueItem, QueueStats, QueueStatus, QueueAction, Product } from '@/types';
import { createSuccessResponse, createResponseFromCode, logError } from '@/lib/utils/api-error-handler';
import { PRICING_RULES } from '@/lib/config/pricing-rules';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Shopify Admin API version
const SHOPIFY_API_VERSION = '2024-01';

// Rate limiting (Shopify allows 2 requests/second per app)
const RATE_LIMIT = {
  requestsPerSecond: 2,
  burstSize: 40,         // Shopify's bucket size
  costPerProduct: 1,     // API calls per product operation
  maxRetries: 3,
  retryDelayMs: 5000,    // 5 seconds between retries
} as const;

// Queue processing settings
const QUEUE_SETTINGS = {
  maxConcurrent: 1,              // Process one batch at a time
  batchSize: PRICING_RULES.shopifyQueue.batchSize,
  delayBetweenBatches: PRICING_RULES.shopifyQueue.delayBetweenBatchesMs,
  stuckThresholdMinutes: 30,     // Consider item stuck after 30 minutes
  maxAttempts: 5,                // Max retries before giving up
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ShopifyConfig {
  storeDomain: string | undefined;
  accessToken: string | undefined;
  isConfigured: boolean;
}

interface ShopifyProduct {
  id?: number;
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  handle?: string;
  status?: 'active' | 'draft' | 'archived';
  tags?: string;
  variants: ShopifyVariant[];
  images?: ShopifyImage[];
  metafields?: ShopifyMetafield[];
}

interface ShopifyVariant {
  id?: number;
  sku?: string;
  price: string;
  compare_at_price?: string | null;
  inventory_quantity?: number;
  inventory_management?: string;
  barcode?: string;
  weight?: number;
  weight_unit?: 'kg' | 'g' | 'lb' | 'oz';
}

interface ShopifyImage {
  src: string;
  alt?: string;
  position?: number;
}

interface ShopifyMetafield {
  namespace: string;
  key: string;
  value: string;
  type: string;
}

interface ShopifyAPIResponse {
  product?: ShopifyProduct;
  products?: ShopifyProduct[];
  errors?: Record<string, string[]> | string;
}

export interface QueueAddResult {
  added: number;
  skipped: number;
  errors: string[];
}

export interface QueueProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ productId: string; error: string }>;
  rateLimited: boolean;
  stoppedAt?: string;
}

export interface QueueOverview {
  stats: QueueStats;
  isProcessing: boolean;
  lastProcessedAt?: string;
  estimatedTimeRemaining?: number;
  isPaused: boolean;
  pauseReason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION HELPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get Shopify configuration status
 */
export function getShopifyConfig(): ShopifyConfig {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  
  return {
    storeDomain,
    accessToken,
    isConfigured: !!(storeDomain && accessToken),
  };
}

/**
 * Check if Shopify is configured
 */
export function hasShopifyConfig(): boolean {
  return getShopifyConfig().isConfigured;
}

/**
 * Build Shopify Admin API URL
 */
function buildShopifyUrl(endpoint: string): string {
  const config = getShopifyConfig();
  if (!config.storeDomain) {
    throw new Error('Shopify store domain not configured');
  }
  return `https://${config.storeDomain}/admin/api/${SHOPIFY_API_VERSION}/${endpoint}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// API REQUEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Make request to Shopify Admin API
 */
async function makeShopifyRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  body?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  const config = getShopifyConfig();
  
  if (!config.isConfigured) {
    return createResponseFromCode('SHOP_001');
  }

  try {
    const url = buildShopifyUrl(endpoint);
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': config.accessToken!,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // Check rate limit headers
    const rateLimitRemaining = response.headers.get('X-Shopify-Shop-Api-Call-Limit');
    if (rateLimitRemaining) {
      const [current, max] = rateLimitRemaining.split('/').map(Number);
      if (current >= max - 5) {
        console.warn(`[Shopify] Rate limit warning: ${current}/${max}`);
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        return createResponseFromCode('SHOP_003');
      }
      if (response.status === 429) {
        return createResponseFromCode('SHOP_002');
      }
      if (response.status === 404) {
        return createResponseFromCode('SHOP_005');
      }
      
      const errorBody = await response.text();
      logError('SHOP_004', new Error(`Shopify error ${response.status}: ${errorBody}`));
      return createResponseFromCode('SHOP_004');
    }

    const data = await response.json() as T;
    return createSuccessResponse(data);
  } catch (error) {
    logError('SHOP_004', error instanceof Error ? error : new Error(String(error)));
    return createResponseFromCode('SHOP_004');
  }
}

/**
 * Delay helper for rate limiting
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT TRANSFORMATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Transform our product format to Shopify product format
 */
export function transformToShopifyProduct(product: Product): ShopifyProduct {
  // Competitor prices for metafields
  const competitorPrices = product.competitor_prices || {};
  
  // Generate tags
  const tags: string[] = ['dropship-pro'];
  if (product.category) tags.push(product.category);
  if (product.status) tags.push(`status:${product.status}`);
  if (product.profit_margin && product.profit_margin >= 70) tags.push('high-margin');

  // Calculate compare_at price (highest competitor or 10% above list)
  const highestCompetitor = Math.max(
    competitorPrices.amazon || 0,
    competitorPrices.costco || 0,
    competitorPrices.ebay || 0,
    competitorPrices.sams_club || 0
  );
  const compareAtPrice = highestCompetitor > 0 
    ? highestCompetitor 
    : (product.retail_price || 0) * 1.1;

  return {
    title: product.title,
    body_html: product.description || `<p>${product.title}</p>`,
    vendor: 'Dropship Pro',
    product_type: product.category || 'General',
    handle: product.shopify_handle || generateHandle(product.title),
    status: product.status === 'paused' ? 'draft' : 'active',
    tags: tags.join(', '),
    variants: [
      {
        sku: product.asin,
        price: (product.retail_price || 0).toFixed(2),
        compare_at_price: compareAtPrice > (product.retail_price || 0) 
          ? compareAtPrice.toFixed(2) 
          : null,
        inventory_quantity: 100, // Default inventory
        inventory_management: null, // Don't track inventory
        barcode: product.upc || undefined,
      },
    ],
    images: product.image_url ? [{ src: product.image_url, alt: product.title }] : [],
    metafields: [
      {
        namespace: 'dropship_pro',
        key: 'asin',
        value: product.asin,
        type: 'single_line_text_field',
      },
      {
        namespace: 'dropship_pro',
        key: 'amazon_cost',
        value: (product.amazon_price || 0).toFixed(2),
        type: 'single_line_text_field',
      },
      {
        namespace: 'dropship_pro',
        key: 'profit_margin',
        value: (product.profit_margin || 0).toFixed(1),
        type: 'single_line_text_field',
      },
      {
        namespace: 'competitor_prices',
        key: 'amazon',
        value: (competitorPrices.amazon || 0).toFixed(2),
        type: 'single_line_text_field',
      },
      {
        namespace: 'competitor_prices',
        key: 'costco',
        value: (competitorPrices.costco || 0).toFixed(2),
        type: 'single_line_text_field',
      },
      {
        namespace: 'competitor_prices',
        key: 'ebay',
        value: (competitorPrices.ebay || 0).toFixed(2),
        type: 'single_line_text_field',
      },
      {
        namespace: 'competitor_prices',
        key: 'sams_club',
        value: (competitorPrices.sams_club || 0).toFixed(2),
        type: 'single_line_text_field',
      },
    ],
  };
}

/**
 * Generate URL-safe handle from title
 */
function generateHandle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 255);
}

// ═══════════════════════════════════════════════════════════════════════════
// SHOPIFY CRUD OPERATIONS (MOCK MODE SUPPORT)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create product in Shopify
 */
export async function createShopifyProduct(
  product: Product
): Promise<ApiResponse<{ shopifyId: string }>> {
  const config = getShopifyConfig();
  
  // MOCK MODE
  if (!config.isConfigured) {
    console.log(`[Shopify MOCK] Would create product: ${product.title}`);
    return createSuccessResponse({
      shopifyId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
  }

  // LIVE MODE
  const shopifyProduct = transformToShopifyProduct(product);
  
  const response = await makeShopifyRequest<ShopifyAPIResponse>(
    'POST',
    'products.json',
    { product: shopifyProduct }
  );

  if (!response.success) {
    return response as ApiResponse<{ shopifyId: string }>;
  }

  const createdProduct = response.data.product;
  if (!createdProduct?.id) {
    return createResponseFromCode('SHOP_004');
  }

  return createSuccessResponse({
    shopifyId: createdProduct.id.toString(),
  });
}

/**
 * Update product in Shopify
 */
export async function updateShopifyProduct(
  shopifyId: string,
  product: Product
): Promise<ApiResponse<{ updated: boolean }>> {
  const config = getShopifyConfig();
  
  // MOCK MODE
  if (!config.isConfigured) {
    console.log(`[Shopify MOCK] Would update product: ${shopifyId}`);
    return createSuccessResponse({ updated: true });
  }

  // LIVE MODE
  const shopifyProduct = transformToShopifyProduct(product);
  
  const response = await makeShopifyRequest<ShopifyAPIResponse>(
    'PUT',
    `products/${shopifyId}.json`,
    { product: shopifyProduct }
  );

  if (!response.success) {
    return response as ApiResponse<{ updated: boolean }>;
  }

  return createSuccessResponse({ updated: true });
}

/**
 * Delete product from Shopify
 */
export async function deleteShopifyProduct(
  shopifyId: string
): Promise<ApiResponse<{ deleted: boolean }>> {
  const config = getShopifyConfig();
  
  // MOCK MODE
  if (!config.isConfigured) {
    console.log(`[Shopify MOCK] Would delete product: ${shopifyId}`);
    return createSuccessResponse({ deleted: true });
  }

  // LIVE MODE
  const response = await makeShopifyRequest<Record<string, never>>(
    'DELETE',
    `products/${shopifyId}.json`
  );

  if (!response.success) {
    return response as ApiResponse<{ deleted: boolean }>;
  }

  return createSuccessResponse({ deleted: true });
}

/**
 * Pause/unpause product in Shopify (change status)
 */
export async function pauseShopifyProduct(
  shopifyId: string,
  paused: boolean
): Promise<ApiResponse<{ paused: boolean }>> {
  const config = getShopifyConfig();
  
  // MOCK MODE
  if (!config.isConfigured) {
    console.log(`[Shopify MOCK] Would ${paused ? 'pause' : 'unpause'} product: ${shopifyId}`);
    return createSuccessResponse({ paused });
  }

  // LIVE MODE
  const response = await makeShopifyRequest<ShopifyAPIResponse>(
    'PUT',
    `products/${shopifyId}.json`,
    { product: { status: paused ? 'draft' : 'active' } }
  );

  if (!response.success) {
    return response as ApiResponse<{ paused: boolean }>;
  }

  return createSuccessResponse({ paused });
}

// ═══════════════════════════════════════════════════════════════════════════
// QUEUE MANAGEMENT (IN-MEMORY FOR DEMO, USE DATABASE IN PRODUCTION)
// ═══════════════════════════════════════════════════════════════════════════

// In-memory queue storage (replace with database in production)
let queueItems: ShopifyQueueItem[] = [];
let isQueueProcessing = false;
let queuePaused = false;
let queuePauseReason: string | undefined;
let lastProcessedAt: string | undefined;

/**
 * Add products to the push queue
 */
export async function addToQueue(
  productIds: string[],
  action: QueueAction,
  options: {
    priority?: number;
    payload?: Record<string, unknown>;
  } = {}
): Promise<ApiResponse<QueueAddResult>> {
  const { priority = 0, payload } = options;
  
  if (productIds.length === 0) {
    return createSuccessResponse({ added: 0, skipped: 0, errors: [] });
  }

  const result: QueueAddResult = {
    added: 0,
    skipped: 0,
    errors: [],
  };

  for (const productId of productIds) {
    // Check for duplicates
    const existing = queueItems.find(
      item => item.product_id === productId && 
              item.status !== 'completed' && 
              item.status !== 'failed'
    );
    
    if (existing) {
      result.skipped++;
      continue;
    }

    const queueItem: ShopifyQueueItem = {
      id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      product_id: productId,
      action,
      status: 'pending',
      priority,
      attempts: 0,
      max_attempts: QUEUE_SETTINGS.maxAttempts,
      payload,
      created_at: new Date().toISOString(),
    };

    queueItems.push(queueItem);
    result.added++;
  }

  return createSuccessResponse(result);
}

/**
 * Get queue statistics
 */
export function getQueueStats(): QueueStats {
  const stats: QueueStats = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: queueItems.length,
  };

  for (const item of queueItems) {
    stats[item.status]++;
  }

  return stats;
}

/**
 * Get queue overview with additional status
 */
export async function getQueueOverview(): Promise<ApiResponse<QueueOverview>> {
  const stats = getQueueStats();
  
  // Estimate time remaining
  let estimatedTimeRemaining: number | undefined;
  if (stats.pending > 0) {
    // Rough estimate: 2 products per second with buffer
    const secondsPerProduct = 1.5;
    estimatedTimeRemaining = Math.ceil(stats.pending * secondsPerProduct);
  }

  return createSuccessResponse({
    stats,
    isProcessing: isQueueProcessing,
    lastProcessedAt,
    estimatedTimeRemaining,
    isPaused: queuePaused,
    pauseReason: queuePauseReason,
  });
}

/**
 * Process queue items in batches
 */
export async function processQueue(
  getProductById: (id: string) => Promise<Product | null>
): Promise<ApiResponse<QueueProcessResult>> {
  if (isQueueProcessing) {
    return createResponseFromCode('QUEUE_002');
  }

  if (queuePaused) {
    return createResponseFromCode('QUEUE_012');
  }

  isQueueProcessing = true;
  
  const result: QueueProcessResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
    rateLimited: false,
  };

  try {
    // Get pending items sorted by priority
    const pendingItems = queueItems
      .filter(item => item.status === 'pending')
      .sort((a, b) => b.priority - a.priority)
      .slice(0, QUEUE_SETTINGS.batchSize);

    if (pendingItems.length === 0) {
      isQueueProcessing = false;
      return createSuccessResponse(result);
    }

    for (const item of pendingItems) {
      // Mark as processing
      item.status = 'processing';
      item.processed_at = new Date().toISOString();
      item.attempts++;

      try {
        // Get product data
        const product = await getProductById(item.product_id);
        if (!product) {
          throw new Error(`Product not found: ${item.product_id}`);
        }

        // Execute action
        let actionResult: ApiResponse<unknown>;
        switch (item.action) {
          case 'create':
            actionResult = await createShopifyProduct(product);
            break;
          case 'update':
            if (!product.shopify_id) {
              throw new Error('Product not in Shopify yet');
            }
            actionResult = await updateShopifyProduct(product.shopify_id, product);
            break;
          case 'delete':
            if (!product.shopify_id) {
              throw new Error('Product not in Shopify');
            }
            actionResult = await deleteShopifyProduct(product.shopify_id);
            break;
          case 'pause':
            if (!product.shopify_id) {
              throw new Error('Product not in Shopify');
            }
            actionResult = await pauseShopifyProduct(product.shopify_id, true);
            break;
          default:
            throw new Error(`Unknown action: ${item.action}`);
        }

        if (actionResult.success) {
          item.status = 'completed';
          item.completed_at = new Date().toISOString();
          result.succeeded++;
        } else {
          // Check for rate limit
          if (actionResult.error?.code === 'SHOP_002') {
            result.rateLimited = true;
            item.status = 'pending'; // Put back to pending
            result.stoppedAt = item.product_id;
            break;
          }
          
          throw new Error(actionResult.error?.message || 'Unknown error');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        item.error_message = errorMessage;
        
        // Check if should retry
        if (item.attempts < item.max_attempts) {
          item.status = 'pending';
        } else {
          item.status = 'failed';
          result.failed++;
        }
        
        result.errors.push({ productId: item.product_id, error: errorMessage });
      }

      result.processed++;

      // Rate limit delay
      await delay(500); // 500ms between operations
    }

    lastProcessedAt = new Date().toISOString();
  } finally {
    isQueueProcessing = false;
  }

  return createSuccessResponse(result);
}

/**
 * Retry failed items
 */
export async function retryFailed(): Promise<ApiResponse<{ retryCount: number }>> {
  let retryCount = 0;
  
  for (const item of queueItems) {
    if (item.status === 'failed' && item.attempts < item.max_attempts + 2) {
      item.status = 'pending';
      item.error_message = null;
      item.attempts = 0;
      retryCount++;
    }
  }

  return createSuccessResponse({ retryCount });
}

/**
 * Clear completed items
 */
export async function clearCompleted(): Promise<ApiResponse<{ cleared: number }>> {
  const beforeCount = queueItems.length;
  queueItems = queueItems.filter(item => item.status !== 'completed');
  const cleared = beforeCount - queueItems.length;
  
  return createSuccessResponse({ cleared });
}

/**
 * Pause/resume queue
 */
export async function setQueuePaused(
  paused: boolean,
  reason?: string
): Promise<ApiResponse<{ paused: boolean }>> {
  queuePaused = paused;
  queuePauseReason = paused ? reason : undefined;
  
  return createSuccessResponse({ paused: queuePaused });
}

/**
 * Remove item from queue
 */
export async function removeFromQueue(
  itemIds: string[]
): Promise<ApiResponse<{ removed: number }>> {
  const beforeCount = queueItems.length;
  queueItems = queueItems.filter(item => !itemIds.includes(item.id));
  const removed = beforeCount - queueItems.length;
  
  return createSuccessResponse({ removed });
}

/**
 * Get stuck items (processing for too long)
 */
export function getStuckItems(): ShopifyQueueItem[] {
  const stuckThreshold = Date.now() - (QUEUE_SETTINGS.stuckThresholdMinutes * 60 * 1000);
  
  return queueItems.filter(item => {
    if (item.status !== 'processing') return false;
    if (!item.processed_at) return false;
    
    return new Date(item.processed_at).getTime() < stuckThreshold;
  });
}

/**
 * Reset stuck items
 */
export async function resetStuckItems(): Promise<ApiResponse<{ reset: number }>> {
  const stuckItems = getStuckItems();
  let reset = 0;
  
  for (const item of stuckItems) {
    item.status = 'pending';
    item.processed_at = null;
    reset++;
  }
  
  return createSuccessResponse({ reset });
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE STATUS
// ═══════════════════════════════════════════════════════════════════════════

export interface ShopifyQueueServiceStatus {
  shopifyConfigured: boolean;
  mode: 'live' | 'mock';
  queueStats: QueueStats;
  isProcessing: boolean;
  isPaused: boolean;
  rateLimits: typeof RATE_LIMIT;
}

/**
 * Get service status
 */
export async function getServiceStatus(): Promise<ShopifyQueueServiceStatus> {
  const config = getShopifyConfig();
  
  return {
    shopifyConfigured: config.isConfigured,
    mode: config.isConfigured ? 'live' : 'mock',
    queueStats: getQueueStats(),
    isProcessing: isQueueProcessing,
    isPaused: queuePaused,
    rateLimits: { ...RATE_LIMIT },
  };
}

/**
 * Test Shopify connection
 */
export async function testConnection(): Promise<ApiResponse<{ connected: boolean; storeName?: string }>> {
  const config = getShopifyConfig();
  
  if (!config.isConfigured) {
    return createSuccessResponse({ connected: false });
  }

  const response = await makeShopifyRequest<{ shop: { name: string } }>(
    'GET',
    'shop.json'
  );

  if (!response.success) {
    return response as ApiResponse<{ connected: boolean; storeName?: string }>;
  }

  return createSuccessResponse({
    connected: true,
    storeName: response.data.shop?.name,
  });
}
