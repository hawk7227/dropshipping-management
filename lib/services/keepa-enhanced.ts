// lib/services/keepa-enhanced.ts
// ENHANCED Keepa Service - Full product data extraction with caching & guardrails
// Fetches: Title, Images, Price, Rating, Reviews, BSR, Prime, Brand, Category, etc.

import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const KEEPA_API_BASE = 'https://api.keepa.com';
const KEEPA_EPOCH = new Date('2011-01-01T00:00:00Z').getTime();

// Supabase client for caching
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Default cache durations (hours)
const DEFAULT_CACHE = {
  price: 6,      // Price data refreshes every 6 hours
  info: 168,     // Product info refreshes every 7 days (168 hours)
  bsr: 24,       // BSR/rating refreshes every 24 hours
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface KeepaFullProduct {
  asin: string;
  
  // Basic Info
  title: string | null;
  brand: string | null;
  manufacturer: string | null;
  description: string | null;
  features: string[] | null;
  
  // Images
  mainImage: string | null;
  images: string[] | null;
  
  // Pricing
  amazonPrice: number | null;
  newPrice: number | null;
  usedPrice: number | null;
  
  // Calculated prices
  yourPrice: number | null;
  compareAtPrice: number | null;
  profitAmount: number | null;
  profitPercent: number | null;
  
  // Metrics
  rating: number | null;
  reviewCount: number | null;
  bsr: number | null;
  salesRankCategory: string | null;
  
  // Prime & Availability
  isPrime: boolean;
  isFba: boolean;
  availability: string | null;
  sellerCount: number | null;
  
  // Category & Classification
  category: string | null;
  categoryTree: string[] | null;
  productGroup: string | null;
  
  // Physical
  dimensions: {
    length: number | null;
    width: number | null;
    height: number | null;
    weight: number | null;
  } | null;
  
  // Identifiers
  upc: string | null;
  ean: string | null;
  parentAsin: string | null;
  variationCount: number | null;
  
  // Metadata
  fetchedAt: string;
  dataSource: 'keepa' | 'cache';
  tokensUsed: number;
}

export interface KeepaEnrichmentResult {
  success: boolean;
  products: KeepaFullProduct[];
  tokensUsed: number;
  tokensSaved: number;
  fromCache: number;
  fromApi: number;
  errors: Array<{ asin: string; error: string }>;
}

interface CacheCheckResult {
  cached: Map<string, KeepaFullProduct>;
  needsFetch: string[];
  stale: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function keepaTimeToDate(keepaTime: number): Date {
  return new Date(KEEPA_EPOCH + (keepaTime * 60 * 1000));
}

function keepaPriceToDollars(keepaPrice: number): number | null {
  if (keepaPrice < 0) return null;
  return keepaPrice / 100;
}

function buildAmazonImageUrl(imageCode: string): string {
  // Keepa provides image codes like "51ABC123" - build full URL
  if (!imageCode) return '';
  if (imageCode.startsWith('http')) return imageCode;
  return `https://images-na.ssl-images-amazon.com/images/I/${imageCode}._SL500_.jpg`;
}

function calculatePricing(amazonPrice: number, markupPercent: number = 70): {
  yourPrice: number;
  compareAtPrice: number;
  profitAmount: number;
  profitPercent: number;
} {
  const yourPrice = Math.round(amazonPrice * (1 + markupPercent / 100) * 100) / 100;
  const compareAtPrice = Math.round(amazonPrice * 2 * 100) / 100;
  const profitAmount = Math.round((yourPrice - amazonPrice) * 100) / 100;
  const profitPercent = Math.round(((yourPrice - amazonPrice) / yourPrice) * 100 * 100) / 100;
  
  return { yourPrice, compareAtPrice, profitAmount, profitPercent };
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

async function checkCache(asins: string[]): Promise<CacheCheckResult> {
  const cached = new Map<string, KeepaFullProduct>();
  const needsFetch: string[] = [];
  const stale: string[] = [];
  
  try {
    const { data, error } = await supabase
      .from('keepa_cache')
      .select('*')
      .in('asin', asins);
    
    if (error) {
      console.error('[Keepa Cache] Error checking cache:', error);
      return { cached, needsFetch: asins, stale: [] };
    }
    
    const cacheMap = new Map((data || []).map(d => [d.asin, d]));
    const now = new Date();
    
    for (const asin of asins) {
      const cacheEntry = cacheMap.get(asin);
      
      if (!cacheEntry) {
        needsFetch.push(asin);
        continue;
      }
      
      const priceExpires = cacheEntry.price_expires_at ? new Date(cacheEntry.price_expires_at) : null;
      
      if (priceExpires && priceExpires > now) {
        // Cache is fresh - use it
        cached.set(asin, transformCacheToProduct(cacheEntry));
      } else {
        // Cache is stale - needs refresh
        stale.push(asin);
        needsFetch.push(asin);
      }
    }
  } catch (error) {
    console.error('[Keepa Cache] Exception:', error);
    return { cached, needsFetch: asins, stale: [] };
  }
  
  return { cached, needsFetch, stale };
}

function transformCacheToProduct(cache: any): KeepaFullProduct {
  return {
    asin: cache.asin,
    title: cache.title,
    brand: cache.brand,
    manufacturer: cache.brand,
    description: cache.description,
    features: cache.features,
    mainImage: cache.images?.[0] || null,
    images: cache.images,
    amazonPrice: cache.amazon_price,
    newPrice: cache.amazon_price,
    usedPrice: null,
    yourPrice: cache.amazon_price ? calculatePricing(cache.amazon_price).yourPrice : null,
    compareAtPrice: cache.amazon_price ? calculatePricing(cache.amazon_price).compareAtPrice : null,
    profitAmount: cache.amazon_price ? calculatePricing(cache.amazon_price).profitAmount : null,
    profitPercent: cache.amazon_price ? calculatePricing(cache.amazon_price).profitPercent : null,
    rating: cache.rating,
    reviewCount: cache.review_count,
    bsr: cache.bsr,
    salesRankCategory: cache.category,
    isPrime: cache.is_prime || false,
    isFba: cache.is_prime || false,
    availability: cache.availability,
    sellerCount: cache.seller_count,
    category: cache.category,
    categoryTree: null,
    productGroup: null,
    dimensions: cache.dimensions,
    upc: cache.upc,
    ean: null,
    parentAsin: cache.parent_asin,
    variationCount: null,
    fetchedAt: cache.fetched_at,
    dataSource: 'cache',
    tokensUsed: 0,
  };
}

async function saveToCache(products: KeepaFullProduct[]): Promise<void> {
  if (products.length === 0) return;
  
  const now = new Date();
  const priceExpires = new Date(now.getTime() + DEFAULT_CACHE.price * 60 * 60 * 1000);
  const infoExpires = new Date(now.getTime() + DEFAULT_CACHE.info * 60 * 60 * 1000);
  
  const cacheEntries = products.map(p => ({
    asin: p.asin,
    title: p.title,
    amazon_price: p.amazonPrice,
    rating: p.rating,
    review_count: p.reviewCount,
    bsr: p.bsr,
    is_prime: p.isPrime,
    images: p.images,
    category: p.category,
    brand: p.brand,
    description: p.description,
    features: p.features,
    dimensions: p.dimensions,
    upc: p.upc,
    parent_asin: p.parentAsin,
    availability: p.availability,
    seller_count: p.sellerCount,
    raw_response: null, // Could store full response for debugging
    tokens_used: p.tokensUsed,
    fetched_at: now.toISOString(),
    price_expires_at: priceExpires.toISOString(),
    info_expires_at: infoExpires.toISOString(),
  }));
  
  try {
    const { error } = await supabase
      .from('keepa_cache')
      .upsert(cacheEntries, { onConflict: 'asin' });
    
    if (error) {
      console.error('[Keepa Cache] Error saving to cache:', error);
    } else {
      console.log(`[Keepa Cache] Saved ${products.length} products to cache`);
    }
  } catch (error) {
    console.error('[Keepa Cache] Exception saving:', error);
  }
}

async function logTokenUsage(tokensUsed: number, requestType: string = 'product'): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    await supabase.rpc('log_keepa_tokens', {
      p_tokens: tokensUsed,
      p_request_type: requestType,
    });
  } catch (error) {
    console.error('[Keepa Tokens] Error logging:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// KEEPA API TRANSFORMATION
// ═══════════════════════════════════════════════════════════════════════════

function transformKeepaApiProduct(apiProduct: any): KeepaFullProduct {
  // Extract current Amazon price from csv array (index 0 = Amazon price)
  let amazonPrice: number | null = null;
  if (apiProduct.csv && apiProduct.csv[0]) {
    const priceArray = apiProduct.csv[0];
    // Get the last (most recent) price
    for (let i = priceArray.length - 1; i >= 0; i -= 2) {
      if (priceArray[i] > 0) {
        amazonPrice = keepaPriceToDollars(priceArray[i]);
        break;
      }
    }
  }
  
  // Extract rating
  let rating: number | null = null;
  if (apiProduct.csv && apiProduct.csv[16]) {
    const ratingArray = apiProduct.csv[16];
    for (let i = ratingArray.length - 1; i >= 0; i -= 2) {
      if (ratingArray[i] > 0) {
        rating = ratingArray[i] / 10; // Keepa stores as 45 for 4.5
        break;
      }
    }
  }
  
  // Extract review count
  let reviewCount: number | null = null;
  if (apiProduct.csv && apiProduct.csv[17]) {
    const reviewArray = apiProduct.csv[17];
    for (let i = reviewArray.length - 1; i >= 0; i -= 2) {
      if (reviewArray[i] > 0) {
        reviewCount = reviewArray[i];
        break;
      }
    }
  }
  
  // Extract BSR
  let bsr: number | null = null;
  if (apiProduct.csv && apiProduct.csv[3]) {
    const bsrArray = apiProduct.csv[3];
    for (let i = bsrArray.length - 1; i >= 0; i -= 2) {
      if (bsrArray[i] > 0) {
        bsr = bsrArray[i];
        break;
      }
    }
  }
  
  // Build images array
  const images: string[] = [];
  if (apiProduct.imagesCSV) {
    const imageCodes = apiProduct.imagesCSV.split(',');
    for (const code of imageCodes) {
      if (code.trim()) {
        images.push(buildAmazonImageUrl(code.trim()));
      }
    }
  }
  
  // Calculate pricing if we have Amazon price
  let pricing = {
    yourPrice: null as number | null,
    compareAtPrice: null as number | null,
    profitAmount: null as number | null,
    profitPercent: null as number | null,
  };
  if (amazonPrice && amazonPrice > 0) {
    pricing = calculatePricing(amazonPrice);
  }
  
  // Build category tree
  const categoryTree: string[] = [];
  if (apiProduct.categoryTree) {
    for (const cat of apiProduct.categoryTree) {
      if (cat.name) categoryTree.push(cat.name);
    }
  }
  
  // Extract features
  const features: string[] = [];
  if (apiProduct.features && Array.isArray(apiProduct.features)) {
    features.push(...apiProduct.features);
  }
  
  // Dimensions
  let dimensions = null;
  if (apiProduct.packageLength || apiProduct.packageWidth || apiProduct.packageHeight || apiProduct.packageWeight) {
    dimensions = {
      length: apiProduct.packageLength ? apiProduct.packageLength / 100 : null, // cm to inches
      width: apiProduct.packageWidth ? apiProduct.packageWidth / 100 : null,
      height: apiProduct.packageHeight ? apiProduct.packageHeight / 100 : null,
      weight: apiProduct.packageWeight ? apiProduct.packageWeight / 1000 : null, // grams to kg
    };
  }
  
  return {
    asin: apiProduct.asin,
    title: apiProduct.title || null,
    brand: apiProduct.brand || null,
    manufacturer: apiProduct.manufacturer || apiProduct.brand || null,
    description: apiProduct.description || null,
    features: features.length > 0 ? features : null,
    mainImage: images[0] || null,
    images: images.length > 0 ? images : null,
    amazonPrice,
    newPrice: amazonPrice,
    usedPrice: null,
    yourPrice: pricing.yourPrice,
    compareAtPrice: pricing.compareAtPrice,
    profitAmount: pricing.profitAmount,
    profitPercent: pricing.profitPercent,
    rating,
    reviewCount,
    bsr,
    salesRankCategory: categoryTree[0] || null,
    isPrime: Boolean(apiProduct.fbaFees || apiProduct.isAmazonFulfilled),
    isFba: Boolean(apiProduct.fbaFees || apiProduct.isAmazonFulfilled),
    availability: apiProduct.availabilityAmazon >= 0 ? 'in_stock' : 'out_of_stock',
    sellerCount: apiProduct.newOfferCount || null,
    category: categoryTree.join(' > ') || null,
    categoryTree: categoryTree.length > 0 ? categoryTree : null,
    productGroup: apiProduct.productGroup || null,
    dimensions,
    upc: apiProduct.upcList?.[0] || null,
    ean: apiProduct.eanList?.[0] || null,
    parentAsin: apiProduct.parentAsin || null,
    variationCount: apiProduct.variations?.length || null,
    fetchedAt: new Date().toISOString(),
    dataSource: 'keepa',
    tokensUsed: 1,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN API FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export async function enrichProductsWithKeepa(
  asins: string[],
  options: {
    skipCache?: boolean;
    markupPercent?: number;
    domain?: number;
  } = {}
): Promise<KeepaEnrichmentResult> {
  const { skipCache = false, markupPercent = 70, domain = 1 } = options;
  
  const result: KeepaEnrichmentResult = {
    success: true,
    products: [],
    tokensUsed: 0,
    tokensSaved: 0,
    fromCache: 0,
    fromApi: 0,
    errors: [],
  };
  
  if (asins.length === 0) {
    return result;
  }
  
  // Deduplicate ASINs
  const uniqueAsins = [...new Set(asins.map(a => a.toUpperCase()))];
  console.log(`[Keepa Enhanced] Processing ${uniqueAsins.length} unique ASINs`);
  
  // Check cache first (unless skipCache)
  let cachedProducts = new Map<string, KeepaFullProduct>();
  let asinsToFetch = uniqueAsins;
  
  if (!skipCache) {
    const cacheResult = await checkCache(uniqueAsins);
    cachedProducts = cacheResult.cached;
    asinsToFetch = cacheResult.needsFetch;
    
    result.fromCache = cachedProducts.size;
    result.tokensSaved = cachedProducts.size; // Each cached product saves 1 token
    
    console.log(`[Keepa Enhanced] Cache: ${cachedProducts.size} cached, ${asinsToFetch.length} need fetch`);
  }
  
  // Fetch from Keepa API if needed
  if (asinsToFetch.length > 0) {
    const apiKey = process.env.KEEPA_API_KEY;
    
    if (!apiKey) {
      console.error('[Keepa Enhanced] No API key configured');
      result.errors.push({ asin: 'ALL', error: 'Keepa API key not configured' });
      
      // Return cached products even if API fails
      result.products = Array.from(cachedProducts.values());
      result.success = cachedProducts.size > 0;
      return result;
    }
    
    // Batch ASINs (max 100 per request)
    const batches: string[][] = [];
    for (let i = 0; i < asinsToFetch.length; i += 100) {
      batches.push(asinsToFetch.slice(i, i + 100));
    }
    
    for (const batch of batches) {
      try {
        const url = new URL(`${KEEPA_API_BASE}/product`);
        url.searchParams.set('key', apiKey);
        url.searchParams.set('domain', domain.toString());
        url.searchParams.set('asin', batch.join(','));
        url.searchParams.set('history', '1');
        url.searchParams.set('rating', '1');
        url.searchParams.set('offers', '0');
        url.searchParams.set('stats', '90');
        
        console.log(`[Keepa Enhanced] Fetching batch of ${batch.length} ASINs...`);
        
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Keepa Enhanced] API error: ${response.status}`, errorText);
          
          for (const asin of batch) {
            result.errors.push({ asin, error: `API error: ${response.status}` });
          }
          continue;
        }
        
        const data = await response.json();
        
        if (data.error) {
          console.error('[Keepa Enhanced] API returned error:', data.error);
          for (const asin of batch) {
            result.errors.push({ asin, error: data.error.message || 'Unknown error' });
          }
          continue;
        }
        
        // Track tokens
        result.tokensUsed += batch.length;
        result.fromApi += data.products?.length || 0;
        
        // Transform products
        if (data.products && Array.isArray(data.products)) {
          for (const apiProduct of data.products) {
            try {
              const transformed = transformKeepaApiProduct(apiProduct);
              cachedProducts.set(transformed.asin, transformed);
            } catch (err) {
              console.error(`[Keepa Enhanced] Error transforming ${apiProduct.asin}:`, err);
              result.errors.push({ asin: apiProduct.asin, error: 'Transform error' });
            }
          }
        }
        
        // Rate limiting - wait between batches
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
      } catch (error) {
        console.error('[Keepa Enhanced] Fetch error:', error);
        for (const asin of batch) {
          result.errors.push({ asin, error: error instanceof Error ? error.message : 'Fetch error' });
        }
      }
    }
    
    // Save new products to cache
    const newProducts = Array.from(cachedProducts.values()).filter(p => p.dataSource === 'keepa');
    await saveToCache(newProducts);
    
    // Log token usage
    if (result.tokensUsed > 0) {
      await logTokenUsage(result.tokensUsed, 'batch');
    }
  }
  
  // Compile final results
  result.products = Array.from(cachedProducts.values());
  result.success = result.products.length > 0 || result.errors.length === 0;
  
  console.log(`[Keepa Enhanced] Complete: ${result.products.length} products, ${result.tokensUsed} tokens used, ${result.tokensSaved} saved from cache`);
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE PRODUCT LOOKUP
// ═══════════════════════════════════════════════════════════════════════════

export async function getProductFromKeepa(
  asin: string,
  options: { skipCache?: boolean } = {}
): Promise<KeepaFullProduct | null> {
  const result = await enrichProductsWithKeepa([asin], options);
  return result.products[0] || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN USAGE CHECK
// ═══════════════════════════════════════════════════════════════════════════

export async function getTokenUsage(): Promise<{
  used: number;
  remaining: number;
  limit: number;
  percentage: number;
}> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { data: tokenData } = await supabase
      .from('keepa_token_log')
      .select('tokens_used, tokens_limit')
      .eq('date', today)
      .single();
    
    const { data: settingsData } = await supabase
      .from('system_settings')
      .select('value')
      .eq('category', 'keepa')
      .eq('key', 'daily_token_limit')
      .single();
    
    const limit = settingsData?.value ? JSON.parse(settingsData.value) : 10000;
    const used = tokenData?.tokens_used || 0;
    
    return {
      used,
      remaining: limit - used,
      limit,
      percentage: (used / limit) * 100,
    };
  } catch (error) {
    console.error('[Keepa Tokens] Error getting usage:', error);
    return { used: 0, remaining: 10000, limit: 10000, percentage: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT DEFAULT
// ═══════════════════════════════════════════════════════════════════════════

export default {
  enrichProductsWithKeepa,
  getProductFromKeepa,
  getTokenUsage,
};

