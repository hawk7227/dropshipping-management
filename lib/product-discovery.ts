// lib/product-discovery.ts
// Discovers products from Amazon via Rainforest API that meet 80%+ markup criteria
// Auto-publishes to Shopify with proper pricing

import { createClient } from '@supabase/supabase-js';
import { PRICING_RULES, meetsDiscoveryCriteria as rulesMeetsDiscoveryCriteria, getRefreshInterval } from '@/lib/config/pricing-rules';
import { getProductHistory } from '@/lib/services/keepa';

const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY!;
const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

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

// Discovery criteria
const DISCOVERY_CONFIG = {
  minPrice: 3,           // Minimum Amazon price
  maxPrice: 25,          // Maximum Amazon price
  minReviews: 500,       // Minimum review count
  minRating: 3.5,        // Minimum star rating
  primeOnly: true,       // Must be Prime eligible
  markupPercent: 70,     // Our markup: Cost × 1.70 = Sales price
  minProfitPercent: 80,  // Minimum profit margin to qualify
};

// Search terms for product discovery
const SEARCH_TERMS = [
  'kitchen gadgets',
  'phone accessories',
  'home organization',
  'pet supplies',
  'beauty tools',
  'fitness accessories',
  'car accessories',
  'office supplies',
  'outdoor gear',
  'tech accessories'
];

interface DiscoveredProduct {
  asin: string;
  title: string;
  amazonPrice: number;
  salesPrice: number;
  profitAmount: number;
  profitPercent: number;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  amazonUrl: string;
  category: string;
  isPrime: boolean;
}

interface DiscoveryResult {
  searched: number;
  found: number;
  published: number;
  skipped: number;
  products: DiscoveredProduct[];
  errors: string[];
}

/**
 * Search Rainforest API for products
 */
async function searchRainforest(searchTerm: string): Promise<any[]> {
  const params = new URLSearchParams({
    api_key: RAINFOREST_API_KEY,
    type: 'search',
    amazon_domain: 'amazon.com',
    search_term: searchTerm,
    sort_by: 'featured'
  });

  const response = await fetch(`https://api.rainforestapi.com/request?${params}`);
  const data = await response.json();

  return data.search_results || [];
}

/**
 * Get detailed product info by ASIN
 */
async function getProductDetails(asin: string): Promise<any> {
  const params = new URLSearchParams({
    api_key: RAINFOREST_API_KEY,
    type: 'product',
    amazon_domain: 'amazon.com',
    asin: asin
  });

  const response = await fetch(`https://api.rainforestapi.com/request?${params}`);
  const data = await response.json();

  return data.product || null;
}

/**
 * Check if product meets discovery criteria
 */
function meetsDiscoveryCriteria(product: any): boolean {
  const price = product.price?.value || product.buybox_winner?.price?.value || 0;
  const rating = product.rating || 0;
  const reviews = product.ratings_total || product.reviews_total || 0;
  const isPrime = product.is_prime || product.buybox_winner?.is_prime || false;
  const availability = product.buybox_winner?.availability?.raw || product.availability?.raw || '';

  // STOCK CHECK - Reject out of stock products
  if (!isInStock(availability)) return false;

  // Check all criteria
  if (price < DISCOVERY_CONFIG.minPrice || price > DISCOVERY_CONFIG.maxPrice) return false;
  if (rating < DISCOVERY_CONFIG.minRating) return false;
  if (reviews < DISCOVERY_CONFIG.minReviews) return false;
  if (DISCOVERY_CONFIG.primeOnly && !isPrime) return false;

  // Calculate profit margin
  const salesPrice = price * (1 + DISCOVERY_CONFIG.markupPercent / 100);
  const profit = salesPrice - price;
  const profitPercent = (profit / price) * 100;

  if (profitPercent < DISCOVERY_CONFIG.minProfitPercent) return false;

  return true;
}

/**
 * Check if product is in stock based on availability string
 */
function isInStock(availability: string | null | undefined): boolean {
  if (!availability) return true; // Assume in stock if no data
  
  const availLower = availability.toLowerCase();
  
  // Out of stock indicators
  const outOfStockPhrases = [
    'out of stock',
    'currently unavailable',
    'unavailable',
    'not available',
    'no longer available',
    'discontinued',
    'sold out',
    'temporarily out of stock',
    'we don\'t know when or if this item will be back in stock'
  ];
  
  for (const phrase of outOfStockPhrases) {
    if (availLower.includes(phrase)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Calculate pricing for a product
 */
function calculatePricing(amazonPrice: number): { salesPrice: number; profitAmount: number; profitPercent: number } {
  const salesPrice = Math.round(amazonPrice * (1 + DISCOVERY_CONFIG.markupPercent / 100) * 100) / 100;
  const profitAmount = Math.round((salesPrice - amazonPrice) * 100) / 100;
  const profitPercent = Math.round((profitAmount / amazonPrice) * 100);

  return { salesPrice, profitAmount, profitPercent };
}

/**
 * Push product to Shopify
 */
async function pushToShopify(product: DiscoveredProduct): Promise<string | null> {
  const shopifyProduct = {
    product: {
      title: product.title,
      body_html: `<p>Discovered from Amazon - ${product.category}</p>`,
      vendor: 'Auto-Discovered',
      product_type: product.category,
      status: 'active', // AUTO-PUBLISH
      tags: [
        'auto-discovered',
        '80-percent-markup',
        product.category.toLowerCase().replace(/\s+/g, '-'),
        `asin-${product.asin}`
      ].join(', '),
      variants: [{
        price: product.salesPrice.toFixed(2),
        compare_at_price: (product.salesPrice * 1.85).toFixed(2), // Show "was" price
        sku: product.asin,
        inventory_management: null,
        inventory_policy: 'continue'
      }],
      images: [{
        src: product.imageUrl
      }],
      metafields: [
        {
          namespace: 'discovery',
          key: 'asin',
          value: product.asin,
          type: 'single_line_text_field'
        },
        {
          namespace: 'discovery',
          key: 'cost_price',
          value: product.amazonPrice.toString(),
          type: 'number_decimal'
        },
        {
          namespace: 'discovery',
          key: 'profit_percent',
          value: product.profitPercent.toString(),
          type: 'number_decimal'
        },
        {
          namespace: 'discovery',
          key: 'amazon_url',
          value: product.amazonUrl,
          type: 'single_line_text_field'
        },
        {
          namespace: 'social_proof',
          key: 'rating',
          value: product.rating.toString(),
          type: 'number_decimal'
        },
        {
          namespace: 'social_proof',
          key: 'review_count',
          value: product.reviewCount.toString(),
          type: 'number_integer'
        }
      ]
    }
  };

  try {
    const response = await fetch(
      `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/products.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        },
        body: JSON.stringify(shopifyProduct)
      }
    );

    const data = await response.json();
    
    if (data.product?.id) {
      return data.product.id.toString();
    }

    console.error('Shopify push error:', data);
    return null;
  } catch (error) {
    console.error('Shopify push error:', error);
    return null;
  }
}

/**
 * Check if product already exists in Shopify (by ASIN)
 */
async function productExistsInShopify(asin: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/products.json?tag=asin-${asin}`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        }
      }
    );

    const data = await response.json();
    return (data.products?.length || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Main discovery function - finds and publishes products meeting 80%+ markup
 */
export async function discoverProducts(options?: {
  searchTerms?: string[];
  maxProducts?: number;
  dryRun?: boolean;
  runId?: string | null;
}): Promise<DiscoveryResult> {
  const {
    searchTerms = SEARCH_TERMS,
    maxProducts = 50,
    dryRun = false
  } = options || {};

  const result: DiscoveryResult = {
    searched: 0,
    found: 0,
    published: 0,
    skipped: 0,
    products: [],
    errors: []
  };

  for (const term of searchTerms) {
    if (result.found >= maxProducts) break;

    try {
      console.log(`Searching: ${term}`);
      const searchResults = await searchRainforest(term);
      result.searched += searchResults.length;

      for (const item of searchResults) {
        if (result.found >= maxProducts) break;

        // Prefer Keepa lookup for robust data; fallback to Rainforest item data
        const asin = item.asin;
        let keepaRes;
        try {
          keepaRes = await getProductHistory(asin, { days: 90 });
        } catch (e) {
          keepaRes = null;
        }

        let price = item.price?.value || 0;
        let rating = item.rating || null;
        let reviews = item.ratings_total || item.reviews_total || null;
        let isPrime = item.is_prime || false;
        let imageUrl = item.main_image?.link || '';
        let title = item.title || term;

        if (keepaRes && keepaRes.success && keepaRes.data.product) {
          const kp = keepaRes.data.product;
          price = kp.amazon_price ?? price;
          rating = kp.rating ?? rating;
          reviews = kp.review_count ?? reviews;
          isPrime = kp.is_prime ?? isPrime;
          imageUrl = kp.priceHistory?.[0]?.imageUrl || imageUrl;
          title = kp.title ?? title;
        }

        // Validate against configured rules
        const { meets, reasons } = rulesMeetsDiscoveryCriteria({
          price: price ?? null,
          rating: rating ?? null,
          reviews: reviews ?? null,
          isPrime: Boolean(isPrime),
          title: title || term,
        });

        if (!meets) {
          // Log rejection
          await getSupabaseClient().from('rejection_log').insert({
            asin,
            reason: 'FAILED_DISCOVERY_CRITERIA',
            details: { reasons },
            created_at: new Date().toISOString(),
          });
          result.skipped++;
          continue;
        }

        // Calculate pricing
        const amazonPrice = price || 0;
        const { salesPrice, profitAmount, profitPercent } = calculatePricing(amazonPrice);

        const discoveredProduct: DiscoveredProduct = {
          asin,
          title,
          amazonPrice,
          salesPrice,
          profitAmount,
          profitPercent,
          rating: rating || 0,
          reviewCount: reviews || 0,
          imageUrl: imageUrl || '',
          amazonUrl: `https://amazon.com/dp/${asin}`,
          category: term,
          isPrime: Boolean(isPrime)
        };

        result.products.push(discoveredProduct);
        result.found++;

        // Import into our DB (upsert products & product_demand)
        if (!dryRun) {
          try {
            const pid = await importDiscoveredProduct(discoveredProduct, options?.runId ?? undefined);
            if (!pid) {
              result.skipped++;
              result.errors.push(`DB import failed for ${discoveredProduct.asin}`);
              continue;
            }
          } catch (e: any) {
            result.errors.push(`DB import error for ${discoveredProduct.asin}: ${e.message || String(e)}`);
            continue;
          }
        }

        // Check if already in Shopify
        const exists = await productExistsInShopify(product.asin);
        if (exists) {
          result.skipped++;
          console.log(`Skipped (exists): ${product.title}`);
          continue;
        }

        // Push to Shopify
        if (!dryRun) {
          const shopifyId = await pushToShopify(discoveredProduct);
          if (shopifyId) {
            result.published++;
            console.log(`Published: ${product.title} → Shopify ID: ${shopifyId}`);
          } else {
            result.errors.push(`Failed to publish: ${product.title}`);
          }
        } else {
          console.log(`[DRY RUN] Would publish: ${product.title} @ $${salesPrice}`);
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error: any) {
      result.errors.push(`Search "${term}" failed: ${error.message}`);
    }

    // Rate limiting between searches
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return result;
}

/**
 * Insert discovered product and related demand/run records
 */
export async function importDiscoveredProduct(product: DiscoveredProduct, runId?: string) {
  // Upsert product record
  const productId = `prod_${product.asin}_${Date.now()}`;
  const { data, error } = await getSupabaseClient().from('products').upsert({
    id: productId,
    title: product.title,
    asin: product.asin,
    source: 'keepa',
    cost_price: product.amazonPrice,
    retail_price: product.salesPrice,
    rating: product.rating,
    review_count: product.reviewCount,
    is_prime: product.isPrime,
    image_url: product.imageUrl,
    category: product.category,
    status: 'draft',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' }).select().single();

  if (error) {
    await getSupabaseClient().from('rejection_log').insert({ asin: product.asin, reason: 'DB_UPSERT_FAILED', details: { error: error.message }, created_at: new Date().toISOString(), run_id: runId });
    return null;
  }

  const pid = data.id;

  // Insert/update product_demand
  const demandScore = Math.round((100000 / (product.profitPercent + 1)) * 100) / 100; // simplistic score
  const demandTier = product.profitPercent >= 70 ? 'high' : (product.profitPercent >= 40 ? 'medium' : 'low');

  await getSupabaseClient().from('product_demand').upsert({
    product_id: pid,
    asin: product.asin,
    demand_tier: demandTier,
    demand_score: demandScore,
    volatility: 0,
    current_bsr: null,
    last_evaluated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'product_id' });

  // Associate to discovery_runs counts
  if (runId) {
    await getSupabaseClient().from('discovery_runs').update({ products_imported: (getSupabaseClient().raw('products_imported + 1') as any) }).eq('id', runId);
  }

  return pid;
}

/**
 * Validate existing products still meet 80% markup
 */
export async function validateProfitMargins(): Promise<{
  validated: number;
  alerts: { productId: string; title: string; currentProfit: number; requiredProfit: number }[];
}> {
  // This would check all discovered products against current Amazon prices
  // and create alerts if profit drops below threshold
  
  const alerts: { productId: string; title: string; currentProfit: number; requiredProfit: number }[] = [];
  
  // Implementation would fetch products with discovery.asin metafield,
  // check current Amazon price via Rainforest,
  // compare against current sales price
  
  return {
    validated: 0,
    alerts
  };
}

