// lib/pipelines/p1-price-sync-pipeline.ts
// P1 Price Sync Pipeline with real API integration
// Uses Rainforest API → Normalization → Persistence

import { 
  safeNormalizeRainforestPriceSync 
} from '../schemas/normalization';
import { 
  ProductPersistence, 
  PriceSnapshotPersistence 
} from '../db/persistence';

const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY!;

interface PriceSyncResult {
  processed: number;
  updated: number;
  errors: number;
  errorDetails: string[];
}

/**
 * Get price sync data for a single ASIN
 */
async function getPriceSyncData(asin: string): Promise<any> {
  const params = new URLSearchParams({
    api_key: RAINFOREST_API_KEY,
    type: 'product',
    amazon_domain: 'amazon.com',
    asin: asin
  });

  const response = await fetch(`https://api.rainforestapi.com/request?${params}`);
  const data = await response.json();

  if (!data.request_info?.success) {
    throw new Error(`Rainforest API error: ${data.error || 'Unknown error'}`);
  }

  return data;
}

/**
 * Get products that need price sync
 */
async function getProductsForSync(limit: number = 100): Promise<any[]> {
  const { createClient } = require('@supabase/supabase-js');
  let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabaseClient() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

  // Get products with ASIN that haven't been synced recently
  const { data, error } = await supabase
    .from('products')
    .select('id, asin, title, last_price_check')
    .not('asin', 'is', null)
    .or('last_price_check.is.null,last_price_check.lt.' + new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(limit);

  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }

  return data || [];
}

/**
 * Main P1 price sync pipeline
 */
export async function runP1PriceSync(options?: {
  productIds?: string[];
  limit?: number;
}): Promise<PriceSyncResult> {
  const { limit = 100 } = options || {};
  
  const result: PriceSyncResult = {
    processed: 0,
    updated: 0,
    errors: 0,
    errorDetails: []
  };

  console.log('Starting P1 Price Sync');

  try {
    // Get products to sync
    const products = await getProductsForSync(limit);
    console.log(`Found ${products.length} products for sync`);

    for (const product of products) {
      result.processed++;

      try {
        console.log(`Syncing price for ASIN: ${product.asin}`);
        
        // Get price sync data from Rainforest
        const priceData = await getPriceSyncData(product.asin);
        
        // Validate with schema
        const normalizedResult = safeNormalizeRainforestPriceSync(priceData, product.id);
        if (!normalizedResult.success) {
          result.errors++;
          result.errorDetails.push(`${product.asin}: Schema validation failed - ${normalizedResult.error}`);
          continue;
        }

        // Store price snapshot
        const persistResult = await PriceSnapshotPersistence.insertPriceSnapshot(normalizedResult.snapshot);
        if (!persistResult.success) {
          result.errors++;
          result.errorDetails.push(`${product.asin}: Failed to persist - ${persistResult.error}`);
          continue;
        }

        // Update product demand data if BSR available
        if (priceData.product.bestsellers_rank_flat) {
          const bsrMatch = priceData.product.bestsellers_rank_flat.match(/Rank: (\d+)/);
          const bsrCategoryMatch = priceData.product.bestsellers_rank_flat.match(/Category: ([^|]+)\s*\|/);
          
          await ProductPersistence.upsertProductDemand(
            product.id,
            product.asin,
            bsrMatch ? parseInt(bsrMatch[1]) : null,
            bsrCategoryMatch ? bsrCategoryMatch[1].trim() : null
          );
        }

        // Update product's last_price_check
        const { createClient } = require('@supabase/supabase-js');
        let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabaseClient() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

        const { error: updateError } = await supabase
          .from('products')
          .update({ 
            last_price_check: new Date().toISOString(),
            rating: normalizedResult.snapshot.rating,
            is_prime: normalizedResult.snapshot.is_prime
          })
          .eq('id', product.id);

        if (updateError) {
          result.errors++;
          result.errorDetails.push(`${product.asin}: Failed to update product - ${updateError.message}`);
          continue;
        }

        result.updated++;
        console.log(`✅ Synced: ${product.asin}`);

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors++;
        result.errorDetails.push(`${product.asin}: ${errorMsg}`);
        console.error(`Sync error for ${product.asin}:`, error);
      }

      // Rate limiting (Rainforest API limit)
      await new Promise(resolve => setTimeout(resolve, 1100));
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    result.errors++;
    result.errorDetails.push(`Pipeline error: ${errorMsg}`);
    console.error('P1 Price Sync pipeline error:', error);
  }

  console.log(`P1 Price Sync Complete - Processed: ${result.processed}, Updated: ${result.updated}, Errors: ${result.errors}`);
  return result;
}

/**
 * Sync specific products by ID
 */
export async function syncSpecificProducts(productIds: string[]): Promise<PriceSyncResult> {
  return runP1PriceSync({ productIds });
}

/**
 * Manual trigger for testing
 */
export async function triggerP1PriceSyncManually(): Promise<PriceSyncResult> {
  return runP1PriceSync({ limit: 5 });
}
