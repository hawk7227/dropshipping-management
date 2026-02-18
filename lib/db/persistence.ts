import { createClient } from '@supabase/supabase-js';
import { 
  NormalizedProduct, 
  NormalizedPriceSnapshot, 
  NormalizedShopifyProduct 
} from '../schemas/normalized-schema';

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

/**
 * Product persistence operations
 */
export class ProductPersistence {
  /**
   * Upsert product using ASIN as stable identifier
   * Never overwrite non-null existing values with null
   */
  static async upsertProduct(product: NormalizedProduct): Promise<{ success: boolean; error?: string; id?: string }> {
    try {
      // First check if product exists by ASIN
      const { data: existing, error: fetchError } = await getSupabaseClient()
        .from('products')
        .select('id, asin, title, brand, category, description, image_url, rating, review_count, source')
        .eq('asin', product.asin)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = not found
        return { success: false, error: `Fetch error: ${fetchError.message}` };
      }

      if (existing) {
        // Update existing product, preserving non-null values
        const updateData: any = {
          id: existing.id, // Keep existing ID
          asin: product.asin,
          title: product.title || existing.title,
          brand: product.brand || existing.brand,
          category: product.category || existing.category,
          description: product.description || existing.description,
          image_url: product.main_image || existing.image_url,
          rating: product.rating ?? existing.rating,
          review_count: product.ratings_total ?? existing.review_count,
          source: product.source || existing.source,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await getSupabaseClient()
          .from('products')
          .update(updateData)
          .eq('id', existing.id)
          .select('id')
          .single();

        if (error) {
          return { success: false, error: `Update error: ${error.message}` };
        }

        return { success: true, id: data.id };
      } else {
        // Insert new product
        const insertData = {
          id: product.id,
          asin: product.asin,
          title: product.title,
          brand: product.brand,
          category: product.category,
          description: product.description,
          image_url: product.main_image,
          rating: product.rating,
          review_count: product.ratings_total,
          source: product.source,
          status: product.status,
          created_at: product.created_at,
          updated_at: product.updated_at,
        };

        const { data, error } = await getSupabaseClient()
          .from('products')
          .insert(insertData)
          .select('id')
          .single();

        if (error) {
          return { success: false, error: `Insert error: ${error.message}` };
        }

        return { success: true, id: data.id };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Store product demand data
   */
  static async upsertProductDemand(
    productId: string,
    asin: string,
    bsrRank: number | null,
    bsrCategory: string | null
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const demandData = {
        product_id: productId,
        asin,
        current_bsr: bsrRank,
        bsr_category: bsrCategory,
        demand_tier: bsrRank ? this.calculateDemandTier(bsrRank) : null,
        last_updated: new Date().toISOString(),
      };

      const { error } = await getSupabaseClient()
        .from('product_demand')
        .upsert(demandData, { onConflict: 'asin' });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Calculate demand tier based on BSR rank
   * Lower BSR = Higher demand
   */
  private static calculateDemandTier(bsrRank: number): 'high' | 'medium' | 'low' {
    if (bsrRank <= 1000) return 'high';
    if (bsrRank <= 10000) return 'medium';
    return 'low';
  }
}

/**
 * Price Snapshot persistence operations
 */
export class PriceSnapshotPersistence {
  /**
   * Store price snapshot data
   */
  static async insertPriceSnapshot(snapshot: NormalizedPriceSnapshot): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await getSupabaseClient()
        .from('price_history')
        .insert({
          product_id: snapshot.product_id,
          source: 'amazon',
          price: snapshot.current_price,
          competitor_prices: snapshot.competitor_prices,
          recorded_at: snapshot.sync_date,
        });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}

/**
 * Shopify Product persistence operations
 */
export class ShopifyProductPersistence {
  /**
   * Link Shopify product to internal product
   */
  static async upsertShopifyProduct(shopifyProduct: NormalizedShopifyProduct): Promise<{ success: boolean; error?: string }> {
    try {
      // Update the main product with Shopify info
      const { error } = await getSupabaseClient()
        .from('products')
        .update({
          shopify_product_id: shopifyProduct.shopify_id.toString(),
          shopify_id: shopifyProduct.shopify_id.toString(),
          shopify_handle: shopifyProduct.handle,
          synced_at: new Date().toISOString(),
        })
        .eq('id', shopifyProduct.product_id);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}

/**
 * Discovery logging operations
 */
export class DiscoveryPersistence {
  /**
   * Create or update a discovery run
   */
  static async upsertDiscoveryRun(
    runDate: string,
    status: 'running' | 'completed' | 'failed' = 'running'
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const { data, error } = await getSupabaseClient()
        .from('discovery_runs')
        .upsert({
          run_date: runDate,
          status,
          started_at: status === 'running' ? new Date().toISOString() : undefined,
          completed_at: status === 'completed' || status === 'failed' ? new Date().toISOString() : undefined,
        }, { onConflict: 'run_date' })
        .select('id')
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, id: data.id };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Log rejected product
   */
  static async logRejection(
    asin: string,
    title: string,
    reason: string,
    category: string,
    confidence?: number,
    rawData?: any,
    discoveryRunId?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await getSupabaseClient()
        .from('rejection_log')
        .insert({
          asin,
          title,
          rejection_reason: reason,
          rejection_category: category,
          confidence_score: confidence,
          raw_data: rawData,
          discovery_run_id: discoveryRunId,
        });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Update discovery run statistics
   */
  static async updateDiscoveryStats(
    runId: string,
    stats: { found?: number; imported?: number; rejected?: number }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const updateData: any = {};
      if (stats.found !== undefined) updateData.total_products_found = stats.found;
      if (stats.imported !== undefined) updateData.products_imported = stats.imported;
      if (stats.rejected !== undefined) updateData.products_rejected = stats.rejected;

      const { error } = await getSupabaseClient()
        .from('discovery_runs')
        .update(updateData)
        .eq('id', runId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}
