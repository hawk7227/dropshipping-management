// lib/ai/marketing-selection.ts
// AI-powered product selection for marketing channels
// Uses AI scores + availability to filter eligible products

import { createClient } from '@supabase/supabase-js';
import { getTopScoringProducts } from './ai-analysis-pipeline';

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

export interface MarketingProduct {
  id: string;
  asin: string;
  title: string;
  brand: string;
  category: string;
  description: string;
  main_image: string;
  images: string[];
  price?: number;
  cost_price?: number;
  rating?: number;
  review_count?: number;
  ai_score?: number;
  ai_tier?: string;
  availability: 'in_stock' | 'out_of_stock' | 'limited';
  last_price_check?: string;
  shopify_product_id?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface MarketingSelectionCriteria {
  min_ai_score?: number;           // Minimum AI score (0-100)
  min_rating?: number;             // Minimum rating (1-5)
  min_review_count?: number;       // Minimum review count
  availability?: ('in_stock' | 'out_of_stock' | 'limited')[];
  price_range?: { min?: number; max?: number };
  categories?: string[];           // Include only these categories
  exclude_categories?: string[];   // Exclude these categories
  brands?: string[];               // Include only these brands
  exclude_brands?: string[];       // Exclude these brands
  max_age_days?: number;           // Maximum age of product in days
  has_shopify_sync?: boolean;      // Must be synced to Shopify
  has_images?: boolean;            // Must have product images
  limit?: number;                  // Maximum number of products
}

export interface MarketingSelectionResult {
  products: MarketingProduct[];
  total_found: number;
  selection_criteria: MarketingSelectionCriteria;
  selection_stats: {
    avg_ai_score: number;
    avg_rating: number;
    total_reviews: number;
    price_range: { min: number; max: number };
    category_distribution: Record<string, number>;
    tier_distribution: Record<string, number>;
  };
  timestamp: string;
}

/**
 * Get products eligible for marketing based on AI scores and criteria
 */
export async function getMarketingEligibleProducts(
  criteria: MarketingSelectionCriteria = {}
): Promise<MarketingSelectionResult> {
  const {
    min_ai_score = 70,
    min_rating = 3.5,
    min_review_count = 10,
    availability = ['in_stock', 'limited'],
    price_range,
    categories,
    exclude_categories,
    brands,
    exclude_brands,
    max_age_days = 365,
    has_shopify_sync = true,
    has_images = true,
    limit = 50
  } = criteria;

  try {
    // Build query for eligible products
    let query = getSupabaseClient()
      .from('products')
      .select(`
        id,
        asin,
        title,
        brand,
        category,
        description,
        main_image,
        images,
        current_price,
        cost_price,
        rating,
        review_count,
        status,
        last_price_check,
        shopify_product_id,
        tags,
        created_at,
        updated_at,
        ai_scores!inner (
          overall_score,
          score_tier
        ),
        price_snapshots!inner (
          current_price,
          is_prime,
          availability
        )
      `)
      .gte('ai_scores.overall_score', min_ai_score)
      .gte('rating', min_rating)
      .gte('review_count', min_review_count)
      .in('price_snapshots.availability', availability)
      .eq('status', 'active');

    // Apply additional filters
    if (price_range?.min) query = query.gte('current_price', price_range.min);
    if (price_range?.max) query = query.lte('current_price', price_range.max);
    if (categories?.length) query = query.in('category', categories);
    if (exclude_categories?.length) query = query.not('category', 'in', exclude_categories);
    if (brands?.length) query = query.in('brand', brands);
    if (exclude_brands?.length) query = query.not('brand', 'in', exclude_brands);
    if (max_age_days) {
      const cutoffDate = new Date(Date.now() - max_age_days * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', cutoffDate);
    }
    if (has_shopify_sync) query = query.not('shopify_product_id', 'is', null);
    if (has_images) query = query.not('main_image', 'is', null);

    // Order by AI score and limit results
    query = query
      .order('ai_scores.overall_score', { ascending: false })
      .order('rating', { ascending: false })
      .limit(limit);

    const { data: products, error } = await query;

    if (error) throw error;

    // Transform to MarketingProduct format
    const marketingProducts: MarketingProduct[] = (products || []).map((product: any) => ({
      id: product.id,
      asin: product.asin,
      title: product.title,
      brand: product.brand,
      category: product.category,
      description: product.description,
      main_image: product.main_image,
      images: product.images || [],
      price: product.current_price,
      cost_price: product.cost_price,
      rating: product.rating,
      review_count: product.review_count,
      ai_score: product.ai_scores.overall_score,
      ai_tier: product.ai_scores.score_tier,
      availability: product.price_snapshots.availability,
      last_price_check: product.last_price_check,
      shopify_product_id: product.shopify_product_id,
      tags: product.tags,
      created_at: product.created_at,
      updated_at: product.updated_at
    }));

    // Calculate selection statistics
    const stats = calculateSelectionStats(marketingProducts);

    return {
      products: marketingProducts,
      total_found: marketingProducts.length,
      selection_criteria: criteria,
      selection_stats: stats,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Failed to get marketing eligible products:', error);
    throw error;
  }
}

/**
 * Get products specifically for social media posting
 */
export async function getSocialMediaProducts(
  platform: 'instagram' | 'facebook' | 'twitter' | 'tiktok',
  limit: number = 10
): Promise<MarketingSelectionResult> {
  const platformCriteria: Record<string, MarketingSelectionCriteria> = {
    instagram: {
      min_ai_score: 80,
      min_rating: 4.0,
      min_review_count: 25,
      availability: ['in_stock'],
      has_images: true,
      limit
    },
    facebook: {
      min_ai_score: 75,
      min_rating: 3.5,
      min_review_count: 20,
      availability: ['in_stock', 'limited'],
      has_images: true,
      limit
    },
    twitter: {
      min_ai_score: 70,
      min_rating: 3.5,
      min_review_count: 15,
      availability: ['in_stock'],
      limit: Math.min(limit, 5) // Twitter posts are shorter
    },
    tiktok: {
      min_ai_score: 85,
      min_rating: 4.5,
      min_review_count: 50,
      availability: ['in_stock'],
      has_images: true,
      categories: ['Electronics', 'Home & Kitchen', 'Beauty', 'Fashion'],
      limit
    }
  };

  return getMarketingEligibleProducts(platformCriteria[platform]);
}

/**
 * Get products specifically for Google Shopping
 */
export async function getGoogleShoppingProducts(
  limit: number = 100
): Promise<MarketingSelectionResult> {
  return getMarketingEligibleProducts({
    min_ai_score: 60, // Lower threshold for broader coverage
    min_rating: 3.0,
    min_review_count: 5,
    availability: ['in_stock'],
    has_shopify_sync: true,
    has_images: true,
    limit
  });
}

/**
 * Get products specifically for Zapier integrations
 */
export async function getZapierProducts(
  integration_type: 'email' | 'webhook' | 'slack' | 'discord',
  limit: number = 20
): Promise<MarketingSelectionResult> {
  const integrationCriteria: Record<string, MarketingSelectionCriteria> = {
    email: {
      min_ai_score: 75,
      min_rating: 4.0,
      min_review_count: 30,
      availability: ['in_stock'],
      limit
    },
    webhook: {
      min_ai_score: 70,
      min_rating: 3.5,
      min_review_count: 20,
      availability: ['in_stock'],
      limit
    },
    slack: {
      min_ai_score: 80,
      min_rating: 4.0,
      min_review_count: 25,
      availability: ['in_stock'],
      limit: Math.min(limit, 5) // Slack messages are concise
    },
    discord: {
      min_ai_score: 75,
      min_rating: 3.5,
      min_review_count: 20,
      availability: ['in_stock'],
      limit: Math.min(limit, 8)
    }
  };

  return getMarketingEligibleProducts(integrationCriteria[integration_type]);
}

/**
 * Calculate selection statistics
 */
function calculateSelectionStats(products: MarketingProduct[]) {
  if (products.length === 0) {
    return {
      avg_ai_score: 0,
      avg_rating: 0,
      total_reviews: 0,
      price_range: { min: 0, max: 0 },
      category_distribution: {},
      tier_distribution: {}
    };
  }

  const validScores = products.filter(p => p.ai_score !== undefined);
  const validRatings = products.filter(p => p.rating !== undefined);
  const validPrices = products.filter(p => p.price !== undefined);

  const avg_ai_score = validScores.length > 0 
    ? validScores.reduce((sum, p) => sum + p.ai_score!, 0) / validScores.length 
    : 0;

  const avg_rating = validRatings.length > 0 
    ? validRatings.reduce((sum, p) => sum + p.rating!, 0) / validRatings.length 
    : 0;

  const total_reviews = products.reduce((sum, p) => sum + (p.review_count || 0), 0);

  const prices = validPrices.map(p => p.price!);
  const price_range = {
    min: prices.length > 0 ? Math.min(...prices) : 0,
    max: prices.length > 0 ? Math.max(...prices) : 0
  };

  const category_distribution = products.reduce((acc, p) => {
    const category = p.category || 'Unknown';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const tier_distribution = products.reduce((acc, p) => {
    const tier = p.ai_tier || 'Unknown';
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    avg_ai_score: Math.round(avg_ai_score),
    avg_rating: Math.round(avg_rating * 10) / 10,
    total_reviews,
    price_range,
    category_distribution,
    tier_distribution
  };
}

/**
 * Refresh marketing product cache
 */
export async function refreshMarketingCache(): Promise<{ success: boolean; refreshed: number; error?: string }> {
  try {
    // Get fresh data for different marketing channels
    const [socialProducts, shoppingProducts, zapierProducts] = await Promise.all([
      getSocialMediaProducts('instagram', 20),
      getGoogleShoppingProducts(50),
      getZapierProducts('email', 30)
    ]);

    // Cache results in database for quick access
    const cacheData = {
      social_media: socialProducts,
      google_shopping: shoppingProducts,
      zapier: zapierProducts,
      refreshed_at: new Date().toISOString()
    };

    const { error } = await getSupabaseClient()
      .from('marketing_cache')
      .upsert({
        id: 'main_cache',
        data: cacheData,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (error) throw error;

    return {
      success: true,
      refreshed: socialProducts.products.length + shoppingProducts.products.length + zapierProducts.products.length
    };

  } catch (error) {
    return {
      success: false,
      refreshed: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
