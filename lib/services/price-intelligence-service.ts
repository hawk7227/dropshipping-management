// lib/services/price-intelligence-service.ts
// Complete price intelligence service with Rainforest API integration

import { createClient } from '@supabase/supabase-js';

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabaseClient() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _supabase;
}

// ============================================================================
// TYPES
// ============================================================================

export interface CompetitorPrice {
  id?: string;
  product_id: string;
  competitor: 'amazon' | 'walmart' | 'ebay';
  price: number;
  currency: string;
  in_stock: boolean;
  rating?: number;
  reviews_count?: number;
  checked_at: string;
}

export interface PriceHistory {
  id?: string;
  product_id: string;
  our_price: number;
  competitor_amazon?: number;
  competitor_walmart?: number;
  competitor_ebay?: number;
  margin_percentage?: number;
  recorded_at: string;
}

export interface MarginAnalysis {
  product_id: string;
  product_title: string;
  cost_price: number;
  our_price: number;
  lowest_competitor: number;
  highest_competitor: number;
  avg_competitor: number;
  margin_percentage: number;
  margin_status: 'healthy' | 'warning' | 'critical';
  action_needed: boolean;
  suggested_price?: number;
}

export interface PriceAlert {
  id?: string;
  product_id: string;
  type: 'margin_low' | 'competitor_undercut' | 'price_drop' | 'stock_alert';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  data: Record<string, any>;
  created_at: string;
  resolved_at?: string;
}

export interface SyncJobStatus {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  total_products: number;
  processed: number;
  succeeded: number;
  failed: number;
  started_at: string;
  completed_at?: string;
  errors: Array<{ product_id: string; error: string }>;
}

// ============================================================================
// COMPETITOR PRICE TRACKING
// ============================================================================

/**
 * Fetch all competitor prices for a product
 */
export async function getCompetitorPrices(
  productId: string
): Promise<CompetitorPrice[]> {
  const { data, error } = await getSupabaseClient()
    .from('competitor_prices')
    .select('*')
    .eq('product_id', productId)
    .order('checked_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching competitor prices:', error);
    return [];
  }

  return (data || []) as CompetitorPrice[];
}

/**
 * Get latest competitor prices
 */
export async function getLatestCompetitorPrices(
  productId: string
): Promise<Record<string, CompetitorPrice | null>> {
  const { data, error } = await getSupabaseClient()
    .from('competitor_prices')
    .select('*')
    .eq('product_id', productId)
    .order('checked_at', { ascending: false })
    .limit(3);

  if (error) {
    return {};
  }

  const result: Record<string, CompetitorPrice | null> = {
    amazon: null,
    walmart: null,
    ebay: null,
  };

  for (const price of data || []) {
    if (price.competitor in result && !result[price.competitor]) {
      result[price.competitor] = price;
    }
  }

  return result;
}

/**
 * Sync competitor prices via Rainforest API
 */
export async function syncCompetitorPrice(
  productId: string,
  asin: string,
  dryRun: boolean = false
): Promise<{ success: boolean; data?: CompetitorPrice[]; error?: string }> {
  if (!process.env.RAINFOREST_API_KEY) {
    return { success: false, error: 'Rainforest API key not configured' };
  }

  if (dryRun) {
    return {
      success: true,
      data: [
        {
          product_id: productId,
          competitor: 'amazon',
          price: 19.99,
          currency: 'USD',
          in_stock: true,
          checked_at: new Date().toISOString(),
        },
      ],
    };
  }

  try {
    // Call Rainforest API
    const response = await fetch('https://api.rainforestapi.com/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.RAINFOREST_API_KEY,
        type: 'product',
        amazon_domain: 'amazon.com',
        asin: asin,
      }),
    });

    if (!response.ok) {
      throw new Error(`Rainforest API error: ${response.status}`);
    }

    const rainforestData = await response.json();

    // Extract prices
    const prices: CompetitorPrice[] = [];

    if (rainforestData.product) {
      const product = rainforestData.product;

      // Amazon price (primary)
      if (product.price) {
        prices.push({
          product_id: productId,
          competitor: 'amazon',
          price: product.price,
          currency: 'USD',
          in_stock: product.in_stock === true,
          rating: product.rating,
          reviews_count: product.review_count,
          checked_at: new Date().toISOString(),
        });
      }

      // Get Walmart price if available
      if (product.competitors?.walmart) {
        prices.push({
          product_id: productId,
          competitor: 'walmart',
          price: product.competitors.walmart.price,
          currency: 'USD',
          in_stock: product.competitors.walmart.in_stock,
          checked_at: new Date().toISOString(),
        });
      }

      // Get eBay price if available
      if (product.competitors?.ebay) {
        prices.push({
          product_id: productId,
          competitor: 'ebay',
          price: product.competitors.ebay.price,
          currency: 'USD',
          in_stock: product.competitors.ebay.in_stock,
          checked_at: new Date().toISOString(),
        });
      }
    }

    // Store in database
    if (prices.length > 0) {
      const { error: insertError } = await getSupabaseClient()
        .from('competitor_prices')
        .upsert(prices, { onConflict: 'product_id,competitor' });

      if (insertError) {
        console.error('Error storing competitor prices:', insertError);
        return { success: false, error: insertError.message };
      }
    }

    return { success: true, data: prices };
  } catch (error: any) {
    console.error('Error syncing competitor prices:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Bulk sync prices for multiple products
 */
export async function syncBulkCompetitorPrices(
  products: Array<{ id: string; asin: string; title: string }>,
  dryRun: boolean = false
): Promise<SyncJobStatus> {
  const jobId = `price_sync_${Date.now()}`;
  const errors: Array<{ product_id: string; error: string }> = [];
  let processed = 0;
  let succeeded = 0;

  for (const product of products) {
    try {
      processed++;

      // Rate limit: 1 request per 1100ms (about 1 per second)
      await new Promise(resolve => setTimeout(resolve, 1100));

      const result = await syncCompetitorPrice(product.id, product.asin, dryRun);

      if (result.success) {
        succeeded++;
      } else {
        errors.push({ product_id: product.id, error: result.error || 'Unknown error' });
      }
    } catch (error: any) {
      errors.push({ product_id: product.id, error: error.message });
    }
  }

  return {
    job_id: jobId,
    status: errors.length === 0 ? 'completed' : 'completed',
    total_products: products.length,
    processed,
    succeeded,
    failed: errors.length,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    errors,
  };
}

// ============================================================================
// MARGIN ANALYSIS & REPRICING
// ============================================================================

/**
 * Analyze margins for a product
 */
export async function analyzeProductMargin(
  productId: string
): Promise<MarginAnalysis | null> {
  // Get product data
  const { data: product, error: productError } = await getSupabaseClient()
    .from('products')
    .select('id, title, cost_price, retail_price')
    .eq('id', productId)
    .single();

  if (productError || !product) {
    console.error('Product not found:', productId);
    return null;
  }

  // Get latest competitor prices
  const competitorPrices = await getLatestCompetitorPrices(productId);

  const prices = Object.values(competitorPrices)
    .filter(p => p !== null)
    .map(p => p!.price);

  const lowestCompetitor = Math.min(...prices, product.retail_price);
  const highestCompetitor = Math.max(...prices, product.retail_price);
  const avgCompetitor = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : product.retail_price;

  const marginPercentage = product.cost_price > 0
    ? ((product.retail_price - product.cost_price) / product.cost_price) * 100
    : 0;

  let marginStatus: 'healthy' | 'warning' | 'critical';
  if (marginPercentage >= 35) {
    marginStatus = 'healthy';
  } else if (marginPercentage >= 25) {
    marginStatus = 'warning';
  } else {
    marginStatus = 'critical';
  }

  return {
    product_id: productId,
    product_title: product.title,
    cost_price: product.cost_price,
    our_price: product.retail_price,
    lowest_competitor: lowestCompetitor,
    highest_competitor: highestCompetitor,
    avg_competitor: avgCompetitor,
    margin_percentage: marginPercentage,
    margin_status: marginStatus,
    action_needed: marginStatus !== 'healthy',
    suggested_price: product.cost_price * 1.35, // 35% margin rule
  };
}

/**
 * Apply margin rule to product
 */
export async function applyMarginRule(
  productId: string,
  minMargin: number = 0.25,
  targetMargin: number = 0.35,
  maxMargin: number = 0.5,
  dryRun: boolean = false
): Promise<{ success: boolean; newPrice?: number; oldPrice?: number; error?: string }> {
  // Get product
  const { data: product, error } = await getSupabaseClient()
    .from('products')
    .select('cost_price, retail_price')
    .eq('id', productId)
    .single();

  if (error || !product) {
    return { success: false, error: 'Product not found' };
  }

  // Calculate prices based on margin rule
  const minPrice = product.cost_price * (1 + minMargin);
  const targetPrice = product.cost_price * (1 + targetMargin);
  const maxPrice = product.cost_price * (1 + maxMargin);

  // New price is target, but constrained by min/max
  const newPrice = Math.max(minPrice, Math.min(targetPrice, maxPrice));

  if (dryRun) {
    return {
      success: true,
      newPrice,
      oldPrice: product.retail_price,
    };
  }

  // Update product
  const { error: updateError } = await getSupabaseClient()
    .from('products')
    .update({
      retail_price: newPrice,
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Record price history
  const { data: productFull } = await getSupabaseClient()
    .from('products')
    .select('id, retail_price')
    .eq('id', productId)
    .single();

  const competitorPrices = await getLatestCompetitorPrices(productId);

  await getSupabaseClient().from('price_history').insert({
    product_id: productId,
    our_price: newPrice,
    competitor_amazon: competitorPrices.amazon?.price,
    competitor_walmart: competitorPrices.walmart?.price,
    competitor_ebay: competitorPrices.ebay?.price,
    margin_percentage: ((newPrice - product.cost_price) / product.cost_price) * 100,
    recorded_at: new Date().toISOString(),
  });

  return {
    success: true,
    newPrice,
    oldPrice: product.retail_price,
  };
}

/**
 * Bulk apply margin rule
 */
export async function applyMarginRuleBulk(
  productIds: string[],
  minMargin: number = 0.25,
  targetMargin: number = 0.35,
  maxMargin: number = 0.5,
  dryRun: boolean = false
): Promise<{
  success: boolean;
  updated: number;
  failed: number;
  errors: Array<{ product_id: string; error: string }>;
}> {
  const errors: Array<{ product_id: string; error: string }> = [];
  let updated = 0;

  for (const productId of productIds) {
    const result = await applyMarginRule(productId, minMargin, targetMargin, maxMargin, dryRun);

    if (result.success) {
      updated++;
    } else {
      errors.push({ product_id: productId, error: result.error || 'Unknown error' });
    }
  }

  return {
    success: errors.length === 0,
    updated,
    failed: errors.length,
    errors,
  };
}

// ============================================================================
// PRICE ALERTS
// ============================================================================

/**
 * Check for price alerts
 */
export async function checkPriceAlerts(): Promise<PriceAlert[]> {
  const alerts: PriceAlert[] = [];

  // Get all active products with competitor prices
  const { data: products } = await getSupabaseClient()
    .from('products')
    .select('id, title, cost_price, retail_price')
    .eq('status', 'active');

  if (!products) return alerts;

  for (const product of products) {
    // Margin check
    const marginPercentage = product.cost_price > 0
      ? ((product.retail_price - product.cost_price) / product.cost_price) * 100
      : 0;

    if (marginPercentage < 20) {
      alerts.push({
        product_id: product.id,
        type: 'margin_low',
        severity: 'critical',
        message: `Margin critically low: ${marginPercentage.toFixed(1)}%`,
        data: { margin_percentage: marginPercentage },
        created_at: new Date().toISOString(),
      });
    } else if (marginPercentage < 25) {
      alerts.push({
        product_id: product.id,
        type: 'margin_low',
        severity: 'high',
        message: `Margin below target: ${marginPercentage.toFixed(1)}%`,
        data: { margin_percentage: marginPercentage },
        created_at: new Date().toISOString(),
      });
    }

    // Competitor undercut check
    const competitorPrices = await getLatestCompetitorPrices(product.id);
    const lowestCompetitor = Math.min(
      ...[competitorPrices.amazon, competitorPrices.walmart, competitorPrices.ebay]
        .filter(p => p !== null)
        .map(p => p!.price),
      product.retail_price
    );

    if (lowestCompetitor < product.retail_price * 0.9) {
      alerts.push({
        product_id: product.id,
        type: 'competitor_undercut',
        severity: 'high',
        message: `Undercut by competitors: $${lowestCompetitor.toFixed(2)} vs $${product.retail_price.toFixed(2)}`,
        data: { lowest_competitor: lowestCompetitor },
        created_at: new Date().toISOString(),
      });
    }
  }

  return alerts;
}

/**
 * Store alerts in database
 */
export async function storeAlerts(alerts: PriceAlert[]): Promise<boolean> {
  if (alerts.length === 0) return true;

  const { error } = await getSupabaseClient().from('price_alerts').insert(alerts);

  if (error) {
    console.error('Error storing alerts:', error);
    return false;
  }

  return true;
}

// ============================================================================
// PRICE HISTORY & TRENDS
// ============================================================================

/**
 * Get price history for a product
 */
export async function getPriceHistory(
  productId: string,
  days: number = 30
): Promise<PriceHistory[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await getSupabaseClient()
    .from('price_history')
    .select('*')
    .eq('product_id', productId)
    .gte('recorded_at', startDate.toISOString())
    .order('recorded_at', { ascending: true });

  if (error) {
    console.error('Error fetching price history:', error);
    return [];
  }

  return (data || []) as PriceHistory[];
}

/**
 * Get price trends
 */
export async function getPriceTrend(productId: string, days: number = 30): Promise<{
  avg_our_price: number;
  avg_competitor: number;
  price_change_percent: number;
  trend: 'up' | 'down' | 'stable';
}> {
  const history = await getPriceHistory(productId, days);

  if (history.length === 0) {
    return {
      avg_our_price: 0,
      avg_competitor: 0,
      price_change_percent: 0,
      trend: 'stable',
    };
  }

  const ourPrices = history.map(h => h.our_price);
  const competitorPrices = history
    .flatMap(h => [h.competitor_amazon, h.competitor_walmart, h.competitor_ebay])
    .filter(p => p !== null) as number[];

  const avgOurPrice = ourPrices.reduce((a, b) => a + b) / ourPrices.length;
  const avgCompetitor = competitorPrices.length > 0
    ? competitorPrices.reduce((a, b) => a + b) / competitorPrices.length
    : 0;

  const firstPrice = ourPrices[0];
  const lastPrice = ourPrices[ourPrices.length - 1];
  const priceChange = ((lastPrice - firstPrice) / firstPrice) * 100;

  let trend: 'up' | 'down' | 'stable';
  if (priceChange > 2) {
    trend = 'up';
  } else if (priceChange < -2) {
    trend = 'down';
  } else {
    trend = 'stable';
  }

  return {
    avg_our_price: avgOurPrice,
    avg_competitor: avgCompetitor,
    price_change_percent: priceChange,
    trend,
  };
}

/**
 * Record price in history
 */
export async function recordPriceHistory(productId: string): Promise<boolean> {
  // Get product current state
  const { data: product } = await getSupabaseClient()
    .from('products')
    .select('retail_price')
    .eq('id', productId)
    .single();

  if (!product) return false;

  // Get latest competitor prices
  const competitorPrices = await getLatestCompetitorPrices(productId);

  const { error } = await getSupabaseClient().from('price_history').insert({
    product_id: productId,
    our_price: product.retail_price,
    competitor_amazon: competitorPrices.amazon?.price,
    competitor_walmart: competitorPrices.walmart?.price,
    competitor_ebay: competitorPrices.ebay?.price,
    recorded_at: new Date().toISOString(),
  });

  return !error;
}

// ============================================================================
// PRICE DASHBOARD STATS
// ============================================================================

/**
 * Get price tracking stats
 */
export async function getPriceTrackingStats(): Promise<{
  tracked_products: number;
  avg_margin: number;
  stale_prices: number;
  critical_alerts: number;
  margin_status: {
    healthy: number;
    warning: number;
    critical: number;
  };
}> {
  // Get all products
  const { data: products, error } = await getSupabaseClient()
    .from('products')
    .select('id, cost_price, retail_price')
    .eq('status', 'active');

  if (error || !products) {
    return {
      tracked_products: 0,
      avg_margin: 0,
      stale_prices: 0,
      critical_alerts: 0,
      margin_status: { healthy: 0, warning: 0, critical: 0 },
    };
  }

  let totalMargin = 0;
  const marginStatusCounts = { healthy: 0, warning: 0, critical: 0 };

  for (const product of products) {
    const marginPercentage = product.cost_price > 0
      ? ((product.retail_price - product.cost_price) / product.cost_price) * 100
      : 0;

    totalMargin += marginPercentage;

    if (marginPercentage >= 35) {
      marginStatusCounts.healthy++;
    } else if (marginPercentage >= 25) {
      marginStatusCounts.warning++;
    } else {
      marginStatusCounts.critical++;
    }
  }

  // Check for stale prices (>24 hours old)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: stalePrices } = await getSupabaseClient()
    .from('competitor_prices')
    .select('*', { count: 'exact', head: true })
    .lt('checked_at', oneDayAgo);

  // Get critical alerts
  const { count: criticalAlerts } = await getSupabaseClient()
    .from('price_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('severity', 'critical')
    .is('resolved_at', null);

  return {
    tracked_products: products.length,
    avg_margin: products.length > 0 ? totalMargin / products.length : 0,
    stale_prices: stalePrices || 0,
    critical_alerts: criticalAlerts || 0,
    margin_status: marginStatusCounts,
  };
}
