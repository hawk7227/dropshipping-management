// lib/price-sync.ts
// Price Intelligence: Rainforest API sync, competitor tracking, margin analysis

import { createClient } from '@supabase/supabase-js';
import type { CompetitorPrice, PriceSyncJob, MarginAlert } from '@/types/database';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY || '';
const RAINFOREST_BASE_URL = 'https://api.rainforestapi.com/request';
const RATE_LIMIT_MS = 1100;

interface RainforestProduct {
  asin: string;
  title: string;
  link: string;
  price?: { value: number; currency: string };
  buybox_winner?: { price: { value: number }; is_prime: boolean };
  availability?: { raw: string };
  fulfillment?: { is_prime_eligible: boolean };
}

// Rate limited Rainforest API request
let lastRequestTime = 0;
async function rainforestRequest(asin: string): Promise<RainforestProduct | null> {
  if (!RAINFOREST_API_KEY) {
    console.error('[PriceSync] Rainforest API key not configured');
    return null;
  }

  const now = Date.now();
  if (now - lastRequestTime < RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS - (now - lastRequestTime)));
  }
  lastRequestTime = Date.now();

  try {
    const params = new URLSearchParams({
      api_key: RAINFOREST_API_KEY,
      type: 'product',
      amazon_domain: 'amazon.com',
      asin: asin,
      include_html: 'false',
    });

    const response = await fetch(`${RAINFOREST_BASE_URL}?${params}`);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.request_info?.success) return null;

    return data.product;
  } catch (error) {
    console.error(`[PriceSync] Error fetching ASIN ${asin}:`, error);
    return null;
  }
}

// Create a new sync job
export async function createSyncJob(totalProducts: number): Promise<PriceSyncJob> {
  const { data, error } = await supabase
    .from('price_sync_jobs')
    .insert({
      status: 'pending',
      total_products: totalProducts,
      processed: 0,
      errors: 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Update sync job progress
export async function updateSyncJob(
  jobId: string,
  updates: Partial<PriceSyncJob>
): Promise<void> {
  await supabase.from('price_sync_jobs').update(updates).eq('id', jobId);
}

// Fetch competitor price for a single product
export async function fetchCompetitorPrice(
  productId: string,
  asin: string,
  ourPrice: number,
  memberPrice: number
): Promise<CompetitorPrice | null> {
  const product = await rainforestRequest(asin);
  if (!product) return null;

  const competitorPrice = product.buybox_winner?.price?.value || product.price?.value;
  if (!competitorPrice) return null;

  const priceDiff = ourPrice - competitorPrice;
  const priceDiffPct = (priceDiff / competitorPrice) * 100;

  const record: Omit<CompetitorPrice, 'id' | 'created_at' | 'updated_at'> = {
    product_id: productId,
    sku: null,
    asin: asin,
    competitor_name: 'Amazon',
    competitor_price: competitorPrice,
    competitor_url: product.link,
    our_price: ourPrice,
    member_price: memberPrice,
    price_difference: priceDiff,
    price_difference_pct: priceDiffPct,
    is_prime: product.buybox_winner?.is_prime || product.fulfillment?.is_prime_eligible || false,
    availability: product.availability?.raw || null,
    fetched_at: new Date().toISOString(),
  };

  // Upsert to database
  const { data, error } = await supabase
    .from('competitor_prices')
    .upsert(record, { onConflict: 'product_id,asin' })
    .select()
    .single();

  if (error) {
    console.error('[PriceSync] Error saving competitor price:', error);
    return null;
  }

  // Record price history
  await supabase.from('price_history').insert([
    { product_id: productId, source: 'us', price: ourPrice },
    { product_id: productId, source: 'competitor', price: competitorPrice },
  ]);

  return data;
}

// Batch sync prices for multiple products
export async function syncPrices(
  products: Array<{
    product_id: string;
    asin: string;
    our_price: number;
    member_price: number;
  }>,
  jobId?: string
): Promise<{ success: number; failed: number; alerts: MarginAlert[] }> {
  let success = 0;
  let failed = 0;
  const alerts: MarginAlert[] = [];

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    
    try {
      const result = await fetchCompetitorPrice(
        product.product_id,
        product.asin,
        product.our_price,
        product.member_price
      );

      if (result) {
        success++;
        
        // Check for margin alerts
        const alertsForProduct = checkMarginAlerts(result);
        if (alertsForProduct.length > 0) {
          await supabase.from('margin_alerts').insert(alertsForProduct);
          alerts.push(...alertsForProduct);
        }
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`[PriceSync] Error processing product ${product.product_id}:`, error);
      failed++;
    }

    // Update job progress
    if (jobId) {
      await updateSyncJob(jobId, {
        processed: i + 1,
        errors: failed,
        status: 'running',
      });
    }
  }

  // Complete job
  if (jobId) {
    await updateSyncJob(jobId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      processed: products.length,
      errors: failed,
    });
  }

  return { success, failed, alerts };
}

// Check for margin alerts based on competitor price
function checkMarginAlerts(price: CompetitorPrice): Omit<MarginAlert, 'id' | 'created_at'>[] {
  const alerts: Omit<MarginAlert, 'id' | 'created_at'>[] = [];

  if (!price.our_price || !price.competitor_price) return alerts;

  const priceDiffPct = price.price_difference_pct || 0;

  // We're more than 20% more expensive
  if (priceDiffPct > 20) {
    alerts.push({
      product_id: price.product_id,
      alert_type: 'critical',
      alert_code: 'PRICE_TOO_HIGH',
      message: `Our price ($${price.our_price}) is ${priceDiffPct.toFixed(1)}% higher than Amazon ($${price.competitor_price})`,
      recommendation: 'Consider lowering price to remain competitive or highlighting unique value.',
      is_resolved: false,
      resolved_at: null,
    });
  }
  // We're 10-20% more expensive
  else if (priceDiffPct > 10) {
    alerts.push({
      product_id: price.product_id,
      alert_type: 'warning',
      alert_code: 'PRICE_ELEVATED',
      message: `Our price is ${priceDiffPct.toFixed(1)}% above Amazon`,
      recommendation: 'Monitor sales velocity. Price premium may be acceptable with membership value.',
      is_resolved: false,
      resolved_at: null,
    });
  }
  // We're significantly cheaper - opportunity
  else if (priceDiffPct < -15) {
    alerts.push({
      product_id: price.product_id,
      alert_type: 'info',
      alert_code: 'PRICE_OPPORTUNITY',
      message: `Our price is ${Math.abs(priceDiffPct).toFixed(1)}% below Amazon - opportunity to increase margin`,
      recommendation: 'Consider raising price while maintaining competitive position.',
      is_resolved: false,
      resolved_at: null,
    });
  }

  return alerts;
}

// Get recent competitor prices
export async function getCompetitorPrices(options: {
  limit?: number;
  offset?: number;
  productId?: string;
}): Promise<{ prices: CompetitorPrice[]; total: number }> {
  let query = supabase
    .from('competitor_prices')
    .select('*', { count: 'exact' })
    .order('fetched_at', { ascending: false });

  if (options.productId) {
    query = query.eq('product_id', options.productId);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { prices: data || [], total: count || 0 };
}

// Get active margin alerts
export async function getMarginAlerts(options: {
  resolved?: boolean;
  alertType?: 'critical' | 'warning' | 'info';
  limit?: number;
}): Promise<MarginAlert[]> {
  let query = supabase
    .from('margin_alerts')
    .select('*')
    .order('created_at', { ascending: false });

  if (options.resolved !== undefined) {
    query = query.eq('is_resolved', options.resolved);
  }

  if (options.alertType) {
    query = query.eq('alert_type', options.alertType);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;

  return data || [];
}

// Resolve an alert
export async function resolveAlert(alertId: string): Promise<void> {
  await supabase
    .from('margin_alerts')
    .update({ is_resolved: true, resolved_at: new Date().toISOString() })
    .eq('id', alertId);
}

// Get price history for a product
export async function getPriceHistory(
  productId: string,
  days: number = 30
): Promise<PriceHistory[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .eq('product_id', productId)
    .gte('recorded_at', since.toISOString())
    .order('recorded_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

// Get sync job status
export async function getSyncJob(jobId: string): Promise<PriceSyncJob | null> {
  const { data, error } = await supabase
    .from('price_sync_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) return null;
  return data;
}

// Get recent sync jobs
export async function getRecentSyncJobs(limit: number = 10): Promise<PriceSyncJob[]> {
  const { data, error } = await supabase
    .from('price_sync_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// Test Rainforest connection
export async function testRainforestConnection(): Promise<{ success: boolean; message: string }> {
  if (!RAINFOREST_API_KEY) {
    return { success: false, message: 'Rainforest API key not configured' };
  }

  try {
    const product = await rainforestRequest('B0BDHWDR12'); // Test ASIN
    if (product) {
      return { success: true, message: 'Rainforest API connected successfully' };
    }
    return { success: false, message: 'Failed to fetch test product' };
  } catch (error) {
    return { success: false, message: `Connection error: ${error}` };
  }
}

// Alias for backward compatibility
export const syncProductPrices = syncPrices;

// Get stale products (not synced within specified hours)
export async function getStaleProducts(hours: number = 24): Promise<Array<{ id: string; title: string; last_synced: string | null }>> {
  const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('products')
    .select('id, title, price_synced_at')
    .or(`price_synced_at.is.null,price_synced_at.lt.${cutoffDate}`)
    .eq('status', 'active')
    .limit(100);
  
  if (error) {
    console.error('[PriceSync] Error getting stale products:', error);
    return [];
  }
  
  return (data || []).map(p => ({
    id: p.id,
    title: p.title,
    last_synced: p.price_synced_at
  }));
}

// Get latest sync job
export async function getLatestSyncJob(): Promise<PriceSyncJob | null> {
  const { data, error } = await supabase
    .from('price_sync_jobs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('[PriceSync] Error getting latest sync job:', error);
  }
  
  return data;
}
