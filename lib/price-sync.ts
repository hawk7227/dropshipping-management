// lib/price-sync.ts
// ═══════════════════════════════════════════════════════════════════════════
// Price Sync Logic
// Handles price synchronization with Keepa batch updates and demand tracking
// Supports tiered refresh based on price and demand
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import {
  PRICING_RULES,
  getRefreshInterval,
  getRefreshIntervalByDemand,
  calculateRetailPrice,
  calculateCompetitorPrices,
  meetsDemandCriteria,
  type DemandTier,
} from '@/lib/config/pricing-rules';
import {
  lookupProducts,
  saveDemandData,
  getDemandData,
  getRateLimitStatus,
  isKeepaConfigured,
  type KeepaProduct,
} from '@/lib/services/keepa';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PriceSyncOptions {
  productIds?: string[];
  asins?: string[];
  tier?: 'high' | 'medium' | 'low' | 'all';
  forceRefresh?: boolean;
  maxProducts?: number;
  jobType?: string;
  jobId?: string;
}

export interface PriceSyncResult {
  processed: number;
  updated: number;
  unchanged: number;
  errors: number;
  tokensUsed: number;
  alerts: PriceAlert[];
  details: SyncDetail[];
}

export interface PriceAlert {
  type: 'margin_warning' | 'margin_critical' | 'out_of_stock' | 'price_increase' | 'price_decrease';
  asin: string;
  productId: string;
  title: string;
  message: string;
  oldValue?: number;
  newValue?: number;
  threshold?: number;
}

export interface SyncDetail {
  asin: string;
  productId: string;
  success: boolean;
  priceChanged: boolean;
  oldPrice?: number;
  newPrice?: number;
  error?: string;
}

interface ProductToSync {
  id: string;
  asin: string;
  title: string;
  amazon_price: number | null;
  retail_price: number | null;
  last_price_check: string | null;
  demand_tier?: DemandTier;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get products that need price refresh based on tier and age
 */
async function getProductsNeedingRefresh(
  options: PriceSyncOptions
): Promise<ProductToSync[]> {
  const { tier = 'all', maxProducts = 100, forceRefresh = false } = options;

  let query = supabase
    .from('products')
    .select('id, asin, title, amazon_price, retail_price, last_price_check')
    .not('asin', 'is', null)
    .eq('status', 'active');

  // Filter by tier based on retail price
  if (tier !== 'all') {
    const { refreshTiers } = PRICING_RULES.priceSync;
    switch (tier) {
      case 'high':
        query = query.gte('retail_price', refreshTiers.highValue.minPrice);
        break;
      case 'medium':
        query = query.gte('retail_price', refreshTiers.mediumValue.minPrice)
          .lt('retail_price', refreshTiers.highValue.minPrice);
        break;
      case 'low':
        query = query.lt('retail_price', refreshTiers.mediumValue.minPrice);
        break;
    }
  }

  // Filter by last check date (unless force refresh)
  if (!forceRefresh) {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - PRICING_RULES.priceSync.staleDays);
    
    query = query.or(`last_price_check.is.null,last_price_check.lt.${staleDate.toISOString()}`);
  }

  // Order by oldest check first, then by price (higher value first)
  query = query
    .order('last_price_check', { ascending: true, nullsFirst: true })
    .order('retail_price', { ascending: false })
    .limit(maxProducts);

  const { data, error } = await query;

  if (error) {
    console.error('[PriceSync] Error fetching products:', error);
    return [];
  }

  return data || [];
}

/**
 * Calculate new prices and check for alerts
 */
function calculatePriceUpdate(
  product: ProductToSync,
  keepaProduct: KeepaProduct
): {
  needsUpdate: boolean;
  newAmazonPrice: number | null;
  newRetailPrice: number | null;
  newCompetitorPrices: Record<string, number> | null;
  alerts: PriceAlert[];
} {
  const alerts: PriceAlert[] = [];
  const newAmazonPrice = keepaProduct.currentAmazonPrice;

  if (newAmazonPrice === null) {
    // Product is out of stock
    alerts.push({
      type: 'out_of_stock',
      asin: product.asin,
      productId: product.id,
      title: product.title,
      message: `Product ${product.asin} is out of stock on Amazon`,
    });

    return {
      needsUpdate: true,
      newAmazonPrice: null,
      newRetailPrice: null,
      newCompetitorPrices: null,
      alerts,
    };
  }

  // Check if price changed
  const priceChanged = product.amazon_price !== newAmazonPrice;
  
  if (!priceChanged) {
    return {
      needsUpdate: false,
      newAmazonPrice,
      newRetailPrice: product.retail_price,
      newCompetitorPrices: null,
      alerts,
    };
  }

  // Calculate new retail price
  const newRetailPrice = calculateRetailPrice(newAmazonPrice);
  const newCompetitorPrices = calculateCompetitorPrices(newRetailPrice);

  // Check for significant price changes
  if (product.amazon_price !== null) {
    const priceChange = ((newAmazonPrice - product.amazon_price) / product.amazon_price) * 100;
    
    if (priceChange > 10) {
      alerts.push({
        type: 'price_increase',
        asin: product.asin,
        productId: product.id,
        title: product.title,
        message: `Amazon price increased by ${priceChange.toFixed(1)}%`,
        oldValue: product.amazon_price,
        newValue: newAmazonPrice,
      });
    } else if (priceChange < -10) {
      alerts.push({
        type: 'price_decrease',
        asin: product.asin,
        productId: product.id,
        title: product.title,
        message: `Amazon price decreased by ${Math.abs(priceChange).toFixed(1)}%`,
        oldValue: product.amazon_price,
        newValue: newAmazonPrice,
      });
    }
  }

  // Check margin thresholds
  const margin = ((newRetailPrice - newAmazonPrice) / newRetailPrice) * 100;
  const { marginAlert } = PRICING_RULES.priceSync;

  if (margin < marginAlert.criticalThreshold) {
    alerts.push({
      type: 'margin_critical',
      asin: product.asin,
      productId: product.id,
      title: product.title,
      message: `Margin dropped to ${margin.toFixed(1)}% (critical threshold: ${marginAlert.criticalThreshold}%)`,
      oldValue: product.retail_price ? ((product.retail_price - (product.amazon_price || 0)) / product.retail_price) * 100 : undefined,
      newValue: margin,
      threshold: marginAlert.criticalThreshold,
    });
  } else if (margin < marginAlert.warningThreshold) {
    alerts.push({
      type: 'margin_warning',
      asin: product.asin,
      productId: product.id,
      title: product.title,
      message: `Margin dropped to ${margin.toFixed(1)}% (warning threshold: ${marginAlert.warningThreshold}%)`,
      oldValue: product.retail_price ? ((product.retail_price - (product.amazon_price || 0)) / product.retail_price) * 100 : undefined,
      newValue: margin,
      threshold: marginAlert.warningThreshold,
    });
  }

  return {
    needsUpdate: true,
    newAmazonPrice,
    newRetailPrice,
    newCompetitorPrices,
    alerts,
  };
}

/**
 * Update product in database
 */
async function updateProduct(
  productId: string,
  updates: {
    amazonPrice?: number | null;
    retailPrice?: number | null;
    competitorPrices?: Record<string, number> | null;
    isOutOfStock?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: Record<string, unknown> = {
      last_price_check: new Date().toISOString(),
    };

    if (updates.amazonPrice !== undefined) {
      updateData.amazon_price = updates.amazonPrice;
    }

    if (updates.retailPrice !== undefined) {
      updateData.retail_price = updates.retailPrice;
      // Also update member price (10% discount)
      if (updates.retailPrice !== null) {
        updateData.member_price = Math.round(updates.retailPrice * 0.9 * 100) / 100;
      }
    }

    if (updates.competitorPrices) {
      updateData.amazon_display_price = updates.competitorPrices.amazon;
      updateData.costco_display_price = updates.competitorPrices.costco;
      updateData.ebay_display_price = updates.competitorPrices.ebay;
      updateData.sams_display_price = updates.competitorPrices.sams;
      updateData.walmart_display_price = updates.competitorPrices.walmart;
      updateData.target_display_price = updates.competitorPrices.target;
    }

    if (updates.isOutOfStock) {
      updateData.status = 'out_of_stock';
    }

    const { error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', productId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Save alerts to database
 */
async function saveAlerts(alerts: PriceAlert[]): Promise<void> {
  if (alerts.length === 0) return;

  try {
    const alertRecords = alerts.map(alert => ({
      type: alert.type,
      asin: alert.asin,
      product_id: alert.productId,
      title: alert.title,
      message: alert.message,
      old_value: alert.oldValue,
      new_value: alert.newValue,
      threshold: alert.threshold,
      created_at: new Date().toISOString(),
      status: 'active',
    }));

    await supabase.from('price_alerts').insert(alertRecords);
  } catch (error) {
    console.error('[PriceSync] Failed to save alerts:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SYNC FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sync prices for products using Keepa batch API
 */
export async function syncPrices(options: PriceSyncOptions = {}): Promise<PriceSyncResult> {
  const result: PriceSyncResult = {
    processed: 0,
    updated: 0,
    unchanged: 0,
    errors: 0,
    tokensUsed: 0,
    alerts: [],
    details: [],
  };

  if (!isKeepaConfigured()) {
    console.warn('[PriceSync] Keepa not configured, skipping sync');
    return result;
  }

  // Get products to sync
  let productsToSync: ProductToSync[];

  if (options.productIds && options.productIds.length > 0) {
    const { data } = await supabase
      .from('products')
      .select('id, asin, title, amazon_price, retail_price, last_price_check')
      .in('id', options.productIds);
    productsToSync = data || [];
  } else if (options.asins && options.asins.length > 0) {
    const { data } = await supabase
      .from('products')
      .select('id, asin, title, amazon_price, retail_price, last_price_check')
      .in('asin', options.asins);
    productsToSync = data || [];
  } else {
    productsToSync = await getProductsNeedingRefresh(options);
  }

  if (productsToSync.length === 0) {
    console.log('[PriceSync] No products need price sync');
    return result;
  }

  console.log(`[PriceSync] Syncing ${productsToSync.length} products`);

  // Batch lookup with Keepa
  const asins = productsToSync.map(p => p.asin).filter(Boolean) as string[];
  
  const keepaResult = await lookupProducts(asins, {
    includeHistory: true,
    jobType: options.jobType || 'price_sync',
    jobId: options.jobId,
  });

  result.tokensUsed = keepaResult.tokensUsed;

  // Create lookup map
  const keepaMap = new Map<string, KeepaProduct>();
  for (const product of keepaResult.products) {
    keepaMap.set(product.asin, product);
  }

  // Process each product
  for (const product of productsToSync) {
    result.processed++;

    const keepaProduct = keepaMap.get(product.asin);

    if (!keepaProduct) {
      result.errors++;
      result.details.push({
        asin: product.asin,
        productId: product.id,
        success: false,
        priceChanged: false,
        error: 'No Keepa data available',
      });
      continue;
    }

    // Calculate price updates
    const priceUpdate = calculatePriceUpdate(product, keepaProduct);

    // Add alerts
    result.alerts.push(...priceUpdate.alerts);

    if (!priceUpdate.needsUpdate) {
      result.unchanged++;
      result.details.push({
        asin: product.asin,
        productId: product.id,
        success: true,
        priceChanged: false,
      });

      // Still update last_price_check
      await updateProduct(product.id, {});
      continue;
    }

    // Update product
    const updateResult = await updateProduct(product.id, {
      amazonPrice: priceUpdate.newAmazonPrice,
      retailPrice: priceUpdate.newRetailPrice,
      competitorPrices: priceUpdate.newCompetitorPrices,
      isOutOfStock: priceUpdate.newAmazonPrice === null,
    });

    if (updateResult.success) {
      result.updated++;
      result.details.push({
        asin: product.asin,
        productId: product.id,
        success: true,
        priceChanged: true,
        oldPrice: product.amazon_price || undefined,
        newPrice: priceUpdate.newAmazonPrice || undefined,
      });

      // Save demand data
      await saveDemandData(keepaProduct);
    } else {
      result.errors++;
      result.details.push({
        asin: product.asin,
        productId: product.id,
        success: false,
        priceChanged: false,
        error: updateResult.error,
      });
    }
  }

  // Save alerts to database
  await saveAlerts(result.alerts);

  console.log(`[PriceSync] Complete: ${result.updated} updated, ${result.unchanged} unchanged, ${result.errors} errors`);

  return result;
}

/**
 * Scheduled price sync - called by cron job
 * Syncs products by tier based on configured refresh intervals
 */
export async function scheduledPriceSync(tier: 'high' | 'medium' | 'low' | 'all' = 'all'): Promise<PriceSyncResult> {
  console.log(`[PriceSync] Starting scheduled sync for tier: ${tier}`);

  return syncPrices({
    tier,
    maxProducts: PRICING_RULES.keepa.batchSize,
    jobType: 'scheduled_sync',
  });
}

/**
 * Full price sync - syncs all products regardless of last check
 */
export async function fullPriceSync(): Promise<PriceSyncResult> {
  console.log('[PriceSync] Starting full price sync');

  const allResults: PriceSyncResult = {
    processed: 0,
    updated: 0,
    unchanged: 0,
    errors: 0,
    tokensUsed: 0,
    alerts: [],
    details: [],
  };

  // Process in batches to respect rate limits
  let hasMore = true;
  let offset = 0;
  const batchSize = PRICING_RULES.keepa.batchSize;

  while (hasMore) {
    const result = await syncPrices({
      tier: 'all',
      forceRefresh: true,
      maxProducts: batchSize,
      jobType: 'full_sync',
    });

    allResults.processed += result.processed;
    allResults.updated += result.updated;
    allResults.unchanged += result.unchanged;
    allResults.errors += result.errors;
    allResults.tokensUsed += result.tokensUsed;
    allResults.alerts.push(...result.alerts);
    allResults.details.push(...result.details);

    hasMore = result.processed === batchSize;
    offset += batchSize;

    // Respect rate limits
    if (hasMore) {
      const status = getRateLimitStatus();
      if (!status.canProceed) {
        console.log(`[PriceSync] Rate limit reached, waiting ${status.msUntilReset}ms`);
        await new Promise(resolve => setTimeout(resolve, status.msUntilReset + 1000));
      }
    }
  }

  return allResults;
}

/**
 * Get price sync statistics
 */
export async function getPriceSyncStats(days: number = 7): Promise<{
  totalSyncs: number;
  productsUpdated: number;
  alertsGenerated: number;
  avgTokensPerSync: number;
}> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data: products } = await supabase
    .from('products')
    .select('id')
    .gte('last_price_check', since.toISOString());

  const { data: alerts } = await supabase
    .from('price_alerts')
    .select('id')
    .gte('created_at', since.toISOString());

  const { data: apiLogs } = await supabase
    .from('keepa_api_log')
    .select('tokens_used')
    .eq('job_type', 'price_sync')
    .gte('created_at', since.toISOString());

  const totalTokens = apiLogs?.reduce((sum, log) => sum + (log.tokens_used || 0), 0) || 0;

  return {
    totalSyncs: apiLogs?.length || 0,
    productsUpdated: products?.length || 0,
    alertsGenerated: alerts?.length || 0,
    avgTokensPerSync: apiLogs?.length ? Math.round(totalTokens / apiLogs.length) : 0,
  };
}

export default {
  syncPrices,
  scheduledPriceSync,
  fullPriceSync,
  getPriceSyncStats,
};


