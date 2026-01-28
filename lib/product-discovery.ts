// lib/product-discovery.ts
// ═══════════════════════════════════════════════════════════════════════════
// Product Discovery Logic
// Discovers new products from Amazon that meet criteria and demand thresholds
// Uses PRICING_RULES as single source of truth
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import {
  PRICING_RULES,
  meetsDiscoveryCriteria,
  meetsDemandCriteria,
  meetsAllCriteria,
  containsExcludedBrand,
  calculateRetailPrice,
  calculateCompetitorPrices,
  getTodayDiscoveryCategories,
  getCategoryConfig,
  isValidASIN,
} from '@/lib/config/pricing-rules';
import {
  lookupProducts,
  saveDemandData,
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

const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY || '';
const RAINFOREST_BASE_URL = 'https://api.rainforestapi.com/request';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface DiscoveryOptions {
  categories?: string[];
  maxApiCalls?: number;
  maxProductsPerDay?: number;
  dryRun?: boolean;
  runId?: string;
}

export interface DiscoveryResult {
  discovered: number;
  rejected: number;
  alreadyExist: number;
  apiCalls: number;
  tokensUsed: number;
  errors: string[];
  products: DiscoveredProduct[];
}

export interface DiscoveredProduct {
  asin: string;
  title: string;
  amazonPrice: number;
  retailPrice: number;
  profitMargin: number;
  rating: number | null;
  reviewCount: number | null;
  bsr: number | null;
  demandScore: number;
  demandTier: string;
  category: string;
  imageUrl: string | null;
  competitorPrices: Record<string, number>;
}

interface RainforestProduct {
  asin: string;
  title: string;
  link: string;
  image: string;
  rating?: number;
  ratings_total?: number;
  price?: { value: number; currency: string };
  is_prime?: boolean;
  bestsellers_rank?: Array<{ category: string; rank: number }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// RAINFOREST API
// ═══════════════════════════════════════════════════════════════════════════

async function searchRainforest(
  searchTerm: string,
  options: { categoryId?: string; maxResults?: number } = {}
): Promise<{ success: boolean; products: RainforestProduct[]; error?: string }> {
  if (!RAINFOREST_API_KEY) {
    return { success: false, products: [], error: 'RAINFOREST_API_KEY not configured' };
  }

  try {
    const params = new URLSearchParams({
      api_key: RAINFOREST_API_KEY,
      type: 'search',
      amazon_domain: 'amazon.com',
      search_term: searchTerm,
      sort_by: 'featured',
      page: '1',
    });

    if (options.categoryId) params.set('category_id', options.categoryId);

    const response = await fetch(`${RAINFOREST_BASE_URL}?${params.toString()}`);
    const data = await response.json();

    if (!data.request_info?.success) {
      return { success: false, products: [], error: data.request_info?.message || 'Request failed' };
    }

    return { success: true, products: (data.search_results || []).slice(0, options.maxResults || 20) };
  } catch (error: any) {
    return { success: false, products: [], error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function asinExists(asin: string): Promise<boolean> {
  const { data } = await supabase.from('products').select('id').eq('asin', asin).single();
  return !!data;
}

async function isRecentlyRejected(asin: string): Promise<boolean> {
  const { data } = await supabase
    .from('rejection_log')
    .select('id')
    .eq('asin', asin)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .single();
  return !!data;
}

async function logRejection(
  asin: string, reason: string, details: Record<string, unknown>,
  productData: Record<string, unknown>, source: string, runId?: string
): Promise<void> {
  try {
    await supabase.from('rejection_log').upsert({
      asin, rejection_reason: reason, rejection_details: details,
      product_data: productData, source, discovery_run_id: runId || null,
      recheck_after: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    }, { onConflict: 'asin,source' });
  } catch (error) {
    console.error('[Discovery] Failed to log rejection:', error);
  }
}

async function saveDiscoveredProduct(
  product: DiscoveredProduct, keepaProduct: KeepaProduct | null, runId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('products').insert({
      asin: product.asin, title: product.title,
      amazon_price: product.amazonPrice, retail_price: product.retailPrice,
      member_price: Math.round(product.retailPrice * 0.9 * 100) / 100,
      image_url: product.imageUrl, rating: product.rating, review_count: product.reviewCount,
      category: product.category, is_prime: true, status: 'pending_sync',
      source: 'discovery', discovery_run_id: runId, created_at: new Date().toISOString(),
    });
    if (error) return { success: false, error: error.message };
    if (keepaProduct) await saveDemandData(keepaProduct);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

function transformAndValidateProduct(
  rfProduct: RainforestProduct, keepaProduct: KeepaProduct | null, categoryName: string
): { valid: boolean; product?: DiscoveredProduct; reasons?: string[] } {
  const price = rfProduct.price?.value || keepaProduct?.currentAmazonPrice;
  if (!price) return { valid: false, reasons: ['No price available'] };

  const productForValidation = {
    price, rating: rfProduct.rating || keepaProduct?.rating,
    reviewCount: rfProduct.ratings_total || keepaProduct?.reviewCount,
    isPrime: rfProduct.is_prime ?? keepaProduct?.isPrime ?? true,
    title: rfProduct.title || keepaProduct?.title || '',
    category: categoryName,
    bsr: rfProduct.bestsellers_rank?.[0]?.rank || keepaProduct?.currentBSR,
    demandScore: keepaProduct?.demandScore || 50,
  };

  const criteriaResult = meetsAllCriteria(productForValidation);
  if (!criteriaResult.passes) return { valid: false, reasons: criteriaResult.reasons };

  const retailPrice = calculateRetailPrice(price);
  const profitMargin = ((retailPrice - price) / retailPrice) * 100;

  return {
    valid: true,
    product: {
      asin: rfProduct.asin, title: rfProduct.title || keepaProduct?.title || '',
      amazonPrice: price, retailPrice,
      profitMargin: Math.round(profitMargin * 100) / 100,
      rating: rfProduct.rating || keepaProduct?.rating || null,
      reviewCount: rfProduct.ratings_total || keepaProduct?.reviewCount || null,
      bsr: productForValidation.bsr || null,
      demandScore: keepaProduct?.demandScore || 50,
      demandTier: criteriaResult.demandTier || 'medium',
      category: categoryName,
      imageUrl: rfProduct.image || keepaProduct?.imageUrl || null,
      competitorPrices: calculateCompetitorPrices(retailPrice),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DISCOVERY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export async function discoverProducts(options: DiscoveryOptions = {}): Promise<DiscoveryResult> {
  const {
    categories = getTodayDiscoveryCategories(),
    maxApiCalls = 50,
    maxProductsPerDay = PRICING_RULES.discovery.maxProductsPerDay,
    dryRun = false,
    runId,
  } = options;

  console.log(`[Discovery] Starting: categories=${categories.join(',')} maxApiCalls=${maxApiCalls} dryRun=${dryRun}`);

  const result: DiscoveryResult = {
    discovered: 0, rejected: 0, alreadyExist: 0,
    apiCalls: 0, tokensUsed: 0, errors: [], products: [],
  };

  let discoveryRunId = runId;
  if (!dryRun && !discoveryRunId) {
    const { data: run } = await supabase.from('discovery_runs').insert({
      run_type: 'manual', triggered_by: 'api', categories_searched: categories, status: 'running',
    }).select().single();
    discoveryRunId = run?.id;
  }

  const useKeepa = isKeepaConfigured();
  const collectedAsins: string[] = [];
  const searchTermsUsed: string[] = [];

  // Phase 1: Search for products
  for (const categoryName of categories) {
    if (result.apiCalls >= maxApiCalls) break;
    const categoryConfig = getCategoryConfig(categoryName);
    if (!categoryConfig) continue;

    for (const searchTerm of categoryConfig.searchTerms) {
      if (result.apiCalls >= maxApiCalls || result.discovered >= maxProductsPerDay) break;
      searchTermsUsed.push(searchTerm);

      const searchResult = await searchRainforest(searchTerm, {
        categoryId: categoryConfig.amazonCategoryId, maxResults: 10,
      });
      result.apiCalls++;

      if (!searchResult.success) {
        result.errors.push(`Search failed for "${searchTerm}": ${searchResult.error}`);
        continue;
      }

      for (const rfProduct of searchResult.products) {
        if (!isValidASIN(rfProduct.asin)) continue;
        if (containsExcludedBrand(rfProduct.title)) continue;
        if (rfProduct.price && (rfProduct.price.value < PRICING_RULES.discovery.minPrice ||
            rfProduct.price.value > PRICING_RULES.discovery.maxPrice)) continue;
        collectedAsins.push(rfProduct.asin);
      }
    }
  }

  const uniqueAsins = [...new Set(collectedAsins)];
  console.log(`[Discovery] Collected ${uniqueAsins.length} unique ASINs`);

  // Phase 2: Batch Keepa lookup
  let keepaProducts: Map<string, KeepaProduct> = new Map();
  if (useKeepa && uniqueAsins.length > 0) {
    const keepaResult = await lookupProducts(uniqueAsins, {
      includeHistory: true, jobType: 'discovery', jobId: discoveryRunId,
    });
    result.tokensUsed = keepaResult.tokensUsed;
    for (const product of keepaResult.products) keepaProducts.set(product.asin, product);
  }

  // Phase 3: Validate and save
  for (const categoryName of categories) {
    const categoryConfig = getCategoryConfig(categoryName);
    if (!categoryConfig) continue;

    for (const searchTerm of categoryConfig.searchTerms) {
      if (result.discovered >= maxProductsPerDay) break;

      const searchResult = await searchRainforest(searchTerm, {
        categoryId: categoryConfig.amazonCategoryId, maxResults: 10,
      });
      if (!searchResult.success) continue;

      for (const rfProduct of searchResult.products) {
        if (result.discovered >= maxProductsPerDay) break;
        if (!isValidASIN(rfProduct.asin)) continue;
        if (await asinExists(rfProduct.asin)) { result.alreadyExist++; continue; }
        if (await isRecentlyRejected(rfProduct.asin)) { result.rejected++; continue; }

        const keepaProduct = keepaProducts.get(rfProduct.asin) || null;
        const validation = transformAndValidateProduct(rfProduct, keepaProduct, categoryConfig.name);

        if (!validation.valid) {
          result.rejected++;
          if (!dryRun) {
            await logRejection(rfProduct.asin, validation.reasons?.[0] || 'Unknown',
              { reasons: validation.reasons },
              { title: rfProduct.title, price: rfProduct.price?.value, rating: rfProduct.rating },
              'discovery', discoveryRunId);
          }
          continue;
        }

        if (!dryRun && validation.product) {
          const saveResult = await saveDiscoveredProduct(validation.product, keepaProduct, discoveryRunId);
          if (!saveResult.success) {
            result.errors.push(`Failed to save ${rfProduct.asin}: ${saveResult.error}`);
            continue;
          }
        }

        if (validation.product) {
          result.products.push(validation.product);
          result.discovered++;
          console.log(`[Discovery] ✓ ${rfProduct.asin} - ${rfProduct.title?.substring(0, 50)}...`);
        }
      }
    }
  }

  if (!dryRun && discoveryRunId) {
    await supabase.from('discovery_runs').update({
      status: 'completed', products_evaluated: uniqueAsins.length,
      products_added: result.discovered, products_rejected: result.rejected,
      products_already_exist: result.alreadyExist, api_tokens_used: result.tokensUsed,
      api_calls_made: result.apiCalls, search_terms_used: searchTermsUsed,
      completed_at: new Date().toISOString(),
    }).eq('id', discoveryRunId);
  }

  console.log(`[Discovery] Complete: ${result.discovered} discovered, ${result.rejected} rejected`);
  return result;
}

export function validateProduct(product: {
  price?: number | null; rating?: number | null; reviewCount?: number | null;
  isPrime?: boolean; title?: string | null; category?: string | null;
  bsr?: number | null; demandScore?: number | null;
}): { passes: boolean; reasons: string[]; demandTier?: string } {
  return meetsAllCriteria(product);
}

export async function getDiscoveryStats(days: number = 30) {
  const { data } = await supabase
    .from('discovery_runs')
    .select('products_added, products_rejected, api_calls_made, api_tokens_used')
    .gte('run_date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

  if (!data || data.length === 0) {
    return { totalRuns: 0, totalDiscovered: 0, totalRejected: 0, totalApiCalls: 0, totalTokensUsed: 0, avgDiscoveredPerRun: 0 };
  }

  const stats = data.reduce((acc, run) => ({
    totalDiscovered: acc.totalDiscovered + (run.products_added || 0),
    totalRejected: acc.totalRejected + (run.products_rejected || 0),
    totalApiCalls: acc.totalApiCalls + (run.api_calls_made || 0),
    totalTokensUsed: acc.totalTokensUsed + (run.api_tokens_used || 0),
  }), { totalDiscovered: 0, totalRejected: 0, totalApiCalls: 0, totalTokensUsed: 0 });

  return { totalRuns: data.length, ...stats, avgDiscoveredPerRun: Math.round(stats.totalDiscovered / data.length * 10) / 10 };
}

export default { discoverProducts, validateProduct, getDiscoveryStats };

