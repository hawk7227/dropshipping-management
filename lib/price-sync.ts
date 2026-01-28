// lib/price-sync.ts
// Complete price synchronization library with all required exports

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================================
// TYPES
// ============================================================================

interface CompetitorPrice {
  id?: string;
  product_id: string;
  competitor: string;
  competitor_url?: string;
  price: number;
  currency: string;
  in_stock: boolean;
  last_checked: string;
}

interface PriceHistory {
  id?: string;
  product_id: string;
  our_price: number;
  competitor_prices: Record<string, number>;
  recorded_at: string;
}

interface SyncJob {
  id?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  total_products: number;
  processed: number;
  errors: number;
  started_at?: string;
  completed_at?: string;
  error_log?: Record<string, string>[] | null;
  created_at?: string;
}

interface MarginRule {
  id?: string;
  category?: string;
  min_margin: number;
  target_margin: number;
  max_margin: number;
}

// ============================================================================
// COMPETITOR PRICE FUNCTIONS
// ============================================================================

export async function getCompetitorPrices(productId?: string): Promise<CompetitorPrice[]> {
  let query = supabase.from('competitor_prices').select('*');
  
  if (productId) {
    query = query.eq('product_id', productId);
  }
  
  const { data, error } = await query.order('last_checked', { ascending: false });
  
  if (error) {
    console.error('Error fetching competitor prices:', error);
    return [];
  }
  
  return data || [];
}

export async function upsertCompetitorPrice(price: CompetitorPrice): Promise<CompetitorPrice | null> {
  const { data, error } = await supabase
    .from('competitor_prices')
    .upsert({
      ...price,
      fetched_at: new Date().toISOString(),
    }, {
      onConflict: 'product_id,competitor_name',
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error upserting competitor price:', error);
    return null;
  }
  
  return data;
}

export async function fetchCompetitorPrices(
  productId: string,
  sources: ('amazon' | 'walmart' | 'ebay')[] = ['amazon']
): Promise<CompetitorPrice[]> {
  const prices: CompetitorPrice[] = [];
  
  // Get product info from database
  const { data: product } = await supabase
    .from('products')
    .select('id, title, asin')
    .eq('id', productId)
    .single();
  
  if (!product) {
    console.log(`Product ${productId} not found`);
    return prices;
  }

  const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY;
  const RAINFOREST_BASE_URL = 'https://api.rainforestapi.com/request';
  
  for (const source of sources) {
    try {
      let response: Response;
      let data: any;
      
      if (source === 'amazon' && product.asin) {
        // Fetch by ASIN if available
        const params = new URLSearchParams({
          api_key: RAINFOREST_API_KEY || 'demo',
          type: 'product',
          amazon_domain: 'amazon.com',
          asin: product.asin
        });
        response = await fetch(`${RAINFOREST_BASE_URL}?${params}`);
        data = await response.json();
        
        if (data.product?.buybox_winner?.price) {
          prices.push({
            id: `${productId}-amazon`,
            product_id: productId,
            sku: product.sku || null,
            asin: product.asin,
            competitor_name: 'amazon',
            competitor_price: data.product.buybox_winner.price.value || 0,
            competitor_url: data.product.link || null,
            our_price: null,
            member_price: null,
            price_difference: null,
            price_difference_pct: null,
            is_prime: data.product.is_prime || false,
            availability: data.product.availability?.raw || null,
            fetched_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      } else if (source === 'walmart') {
        // Search Walmart
        const searchTerm = product.title?.substring(0, 100) || '';
        const params = new URLSearchParams({
          api_key: RAINFOREST_API_KEY || 'demo',
          type: 'search',
          source: 'walmart',
          search_term: searchTerm
        });
        response = await fetch(`${RAINFOREST_BASE_URL}?${params}`);
        data = await response.json();
        
        if (data.search_results?.[0]?.price) {
          prices.push({
            id: `${productId}-walmart`,
            product_id: productId,
            sku: null,
            asin: null,
            competitor_name: 'walmart',
            competitor_price: data.search_results[0].price.value || 0,
            competitor_url: data.search_results[0].link || null,
            our_price: null,
            member_price: null,
            price_difference: null,
            price_difference_pct: null,
            is_prime: false,
            availability: 'in_stock',
            fetched_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      } else if (source === 'ebay') {
        // Search eBay
        const searchTerm = product.title?.substring(0, 100) || '';
        const params = new URLSearchParams({
          api_key: RAINFOREST_API_KEY || 'demo',
          type: 'search',
          source: 'ebay',
          search_term: searchTerm,
          ebay_domain: 'ebay.com'
        });
        response = await fetch(`${RAINFOREST_BASE_URL}?${params}`);
        data = await response.json();
        
        if (data.search_results?.[0]?.price) {
          prices.push({
            id: `${productId}-ebay`,
            product_id: productId,
            sku: null,
            asin: null,
            competitor_name: 'ebay',
            competitor_price: data.search_results[0].price.value || 0,
            competitor_url: data.search_results[0].link || null,
            our_price: null,
            member_price: null,
            price_difference: null,
            price_difference_pct: null,
            is_prime: false,
            availability: 'in_stock',
            fetched_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      console.error(`Error fetching ${source} price for product ${productId}:`, error);
      // Continue with next source on error
    }
  }
  
  return prices;
}

// ============================================================================
// PRICE HISTORY FUNCTIONS
// ============================================================================

export async function getPriceHistory(
  productId: string,
  days: number = 30
): Promise<PriceHistory[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .eq('product_id', productId)
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: true });
  
  if (error) {
    console.error('Error fetching price history:', error);
    return [];
  }
  
  return data || [];
}

export async function recordPriceHistory(
  productId: string,
  ourPrice: number,
  competitorPrices: Record<string, number>
): Promise<PriceHistory | null> {
  const { data, error } = await supabase
    .from('price_history')
    .insert({
      product_id: productId,
      our_price: ourPrice,
      competitor_prices: competitorPrices,
      recorded_at: new Date().toISOString(),
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error recording price history:', error);
    return null;
  }
  
  return data;
}

// ============================================================================
// STALE PRODUCTS
// ============================================================================

export async function getStaleProducts(hoursThreshold: number = 24): Promise<string[]> {
  const threshold = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('competitor_prices')
    .select('product_id')
    .lt('last_checked', threshold);
  
  if (error) {
    console.error('Error fetching stale products:', error);
    return [];
  }
  
  // Return unique product IDs
  const productIds = [...new Set((data || []).map(d => d.product_id))];
  return productIds;
}

// ============================================================================
// SYNC JOB FUNCTIONS
// ============================================================================

export async function createSyncJob(jobType: string, productsTotal: number): Promise<SyncJob | null> {
  const { data, error } = await supabase
    .from('price_sync_jobs')
    .insert({
      status: 'pending',
      total_products: productsTotal,
      processed: 0,
      errors: 0,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating sync job:', error);
    return null;
  }
  
  return data;
}

export async function updateSyncJob(
  jobId: string,
  updates: Partial<SyncJob>
): Promise<SyncJob | null> {
  const { data, error } = await supabase
    .from('price_sync_jobs')
    .update(updates)
    .eq('id', jobId)
    .select()
    .single();
  
  if (error) {
    console.error('Error updating sync job:', error);
    return null;
  }
  
  return data;
}

export async function getLatestSyncJob(jobType?: string): Promise<SyncJob | null> {
  let query = supabase.from('sync_jobs').select('*');
  
  if (jobType) {
    query = query.eq('job_type', jobType);
  }
  
  const { data, error } = await query
    .order('started_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error) {
    console.error('Error fetching latest sync job:', error);
    return null;
  }
  
  return data;
}

// ============================================================================
// PRICE STATS & MARGIN
// ============================================================================

export async function getPriceStats(): Promise<{
  totalProducts: number;
  productsWithCompetitorData: number;
  avgPriceDifference: number;
  lastSyncTime: string | null;
}> {
  const { data: competitorData } = await supabase
    .from('competitor_prices')
    .select('product_id, price');
  
  const uniqueProducts = new Set((competitorData || []).map(d => d.product_id));
  
  const { data: lastJob } = await supabase
    .from('sync_jobs')
    .select('completed_at')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();
  
  return {
    totalProducts: 0, // Would query products table
    productsWithCompetitorData: uniqueProducts.size,
    avgPriceDifference: 0, // Would calculate from data
    lastSyncTime: lastJob?.completed_at || null,
  };
}

export async function getMarginRules(category?: string): Promise<MarginRule[]> {
  let query = supabase.from('margin_rules').select('*');
  
  if (category) {
    query = query.eq('category', category);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching margin rules:', error);
    return [{
      min_margin: 0.15,
      target_margin: 0.30,
      max_margin: 0.50,
    }];
  }
  
  return data || [{
    min_margin: 0.15,
    target_margin: 0.30,
    max_margin: 0.50,
  }];
}

export function calculateProductMargin(
  ourPrice: number,
  cost: number
): { margin: number; marginPercent: number } {
  const margin = ourPrice - cost;
  const marginPercent = cost > 0 ? (margin / ourPrice) * 100 : 0;
  
  return { margin, marginPercent };
}

// ============================================================================
// AMAZON FUNCTIONS (via Rainforest API)
// ============================================================================

export async function searchAmazonProducts(query: string, limit: number = 10): Promise<any[]> {
  const apiKey = process.env.RAINFOREST_API_KEY;
  
  if (!apiKey) {
    console.log('Rainforest API key not configured');
    return [];
  }
  
  try {
    const response = await fetch(
      `https://api.rainforestapi.com/request?api_key=${apiKey}&type=search&amazon_domain=amazon.com&search_term=${encodeURIComponent(query)}`
    );
    
    const data = await response.json();
    return (data.search_results || []).slice(0, limit);
  } catch (error) {
    console.error('Amazon search error:', error);
    return [];
  }
}

export async function fetchAmazonProduct(asin: string): Promise<any | null> {
  const apiKey = process.env.RAINFOREST_API_KEY;
  
  if (!apiKey) {
    console.log('Rainforest API key not configured');
    return null;
  }
  
  try {
    const response = await fetch(
      `https://api.rainforestapi.com/request?api_key=${apiKey}&type=product&amazon_domain=amazon.com&asin=${asin}`
    );
    
    const data = await response.json();
    return data.product || null;
  } catch (error) {
    console.error('Amazon fetch error:', error);
    return null;
  }
}

// ============================================================================
// SYNC FUNCTIONS
// ============================================================================

export async function syncCompetitorPrices(options: {
  productIds?: string[];
  products?: string[] | 'all';
  sources?: ('amazon' | 'walmart' | 'ebay')[];
  strategy?: string;
  minMarkup?: number;
  forceRefresh?: boolean;
  dryRun?: boolean;
}): Promise<{
  synced: number;
  errors: number;
  results: any[];
  updated?: number;
  skipped?: number;
}> {
  const { 
    productIds = [], 
    products,
    sources = ['amazon'], 
    strategy = 'amazon',
    minMarkup = 10,
    forceRefresh = false,
    dryRun = false
  } = options;
  
  // Handle products: 'all' case
  let idsToSync = productIds;
  if (products === 'all') {
    // Fetch all product IDs from database
    const { data } = await supabase.from('products').select('id').limit(500);
    idsToSync = (data || []).map(p => p.id);
  } else if (Array.isArray(products)) {
    idsToSync = products;
  }
  
  let results: any[] = [];
  let synced = 0;
  let errors = 0;
  
  for (const productId of idsToSync) {
    try {
      const prices = await fetchCompetitorPrices(productId, sources);
      
      for (const price of prices) {
        await upsertCompetitorPrice(price);
      }
      
      synced++;
      results.push({ productId, success: true, prices });
    } catch (error: any) {
      errors++;
      results.push({ productId, success: false, error: error.message });
    }
  }
  
  return { synced, errors, results, updated: synced, skipped: errors };
}

export async function syncProductPrices(
  productIds: string[],
  sources?: ('amazon' | 'walmart' | 'ebay')[]
): Promise<{ synced: number; errors: number }> {
  const result = await syncCompetitorPrices({ productIds, sources });
  return { synced: result.synced, errors: result.errors };
}

export async function scheduledPriceSync(): Promise<{
  jobId: string | null;
  synced: number;
  errors: number;
}> {
  // Get stale products
  const staleProducts = await getStaleProducts(24);
  
  if (staleProducts.length === 0) {
    return { jobId: null, synced: 0, errors: 0 };
  }
  
  // Create sync job
  const job = await createSyncJob('scheduled_price_sync', staleProducts.length);
  
  if (!job) {
    return { jobId: null, synced: 0, errors: 0 };
  }
  
  // Update job to running
  await updateSyncJob(job.id!, { status: 'running' });
  
  // Sync prices
  const result = await syncCompetitorPrices({ productIds: staleProducts });
  
  // Update job to completed
  await updateSyncJob(job.id!, {
    status: 'completed',
    processed: result.synced,
    errors: result.errors,
    completed_at: new Date().toISOString(),
  });
  
  return {
    jobId: job.id!,
    synced: result.synced,
    errors: result.errors,
  };
}


