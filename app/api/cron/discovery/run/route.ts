// app/api/cron/discovery/run/route.ts
// Manual Discovery Run API - Uses Rainforest API to find products matching criteria
// Workflow: Search Amazon → Filter by criteria → Preview/Import → Sync to Shopify

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY;
const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// Default search categories for discovery
const DEFAULT_SEARCH_TERMS = [
  'kitchen gadgets under 25',
  'phone accessories',
  'home organization',
  'pet supplies under 20',
  'beauty tools',
  'fitness accessories',
  'car accessories under 25',
  'office supplies',
  'travel accessories',
  'tech accessories under 20'
];

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface DiscoveryFilters {
  min_amazon_price: number;
  max_amazon_price: number;
  min_profit_margin: number;
  min_reviews: number;
  min_rating: number;
  max_bsr: number;
  require_prime: boolean;
  excluded_brands: string[];
  max_products_per_run: number;
  search_terms?: string[];
}

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
  bsr?: number;
  availability?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// RAINFOREST API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function searchRainforest(searchTerm: string, filters: DiscoveryFilters): Promise<any[]> {
  if (!RAINFOREST_API_KEY) {
    throw new Error('Rainforest API key not configured');
  }

  const params = new URLSearchParams({
    api_key: RAINFOREST_API_KEY,
    type: 'search',
    amazon_domain: 'amazon.com',
    search_term: searchTerm,
    sort_by: 'featured',
    // Price filter in cents
    min_price: (filters.min_amazon_price * 100).toString(),
    max_price: (filters.max_amazon_price * 100).toString(),
  });

  console.log(`[Discovery] Searching: "${searchTerm}"`);
  
  const response = await fetch(`https://api.rainforestapi.com/request?${params}`);
  const data = await response.json();

  if (data.error) {
    console.error(`[Discovery] Rainforest error:`, data.error);
    return [];
  }

  return data.search_results || [];
}

async function getProductDetails(asin: string): Promise<any> {
  if (!RAINFOREST_API_KEY) return null;

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

// ═══════════════════════════════════════════════════════════════════════════
// FILTERING & PRICING LOGIC
// ═══════════════════════════════════════════════════════════════════════════

function isInStock(availability: string | undefined): boolean {
  if (!availability) return false;
  const lower = availability.toLowerCase();
  return lower.includes('in stock') || 
         lower.includes('available') || 
         lower.includes('left in stock') ||
         lower.includes('ships from');
}

function isExcludedBrand(title: string, excludedBrands: string[]): boolean {
  const lowerTitle = title.toLowerCase();
  return excludedBrands.some(brand => lowerTitle.includes(brand.toLowerCase()));
}

function meetsDiscoveryCriteria(product: any, filters: DiscoveryFilters): { 
  meets: boolean; 
  reason?: string;
  data?: any;
} {
  const price = product.price?.value || product.prices?.[0]?.value || 0;
  const rating = product.rating || 0;
  const reviews = product.ratings_total || product.reviews_total || 0;
  const isPrime = product.is_prime || false;
  const title = product.title || '';
  const availability = product.availability?.raw || '';

  // Extract data for return
  const data = { price, rating, reviews, isPrime, title, availability };

  // Stock check
  if (!isInStock(availability)) {
    return { meets: false, reason: 'Out of stock', data };
  }

  // Price range check
  if (price < filters.min_amazon_price) {
    return { meets: false, reason: `Price $${price} below minimum $${filters.min_amazon_price}`, data };
  }
  if (price > filters.max_amazon_price) {
    return { meets: false, reason: `Price $${price} above maximum $${filters.max_amazon_price}`, data };
  }

  // Rating check
  if (rating < filters.min_rating) {
    return { meets: false, reason: `Rating ${rating} below minimum ${filters.min_rating}`, data };
  }

  // Review count check
  if (reviews < filters.min_reviews) {
    return { meets: false, reason: `Reviews ${reviews} below minimum ${filters.min_reviews}`, data };
  }

  // Prime check
  if (filters.require_prime && !isPrime) {
    return { meets: false, reason: 'Not Prime eligible', data };
  }

  // Brand exclusion check
  if (isExcludedBrand(title, filters.excluded_brands)) {
    return { meets: false, reason: 'Excluded brand', data };
  }

  return { meets: true, data };
}

function calculatePricing(amazonPrice: number): {
  salesPrice: number;
  profitAmount: number;
  profitPercent: number;
} {
  // Your pricing rule: salesPrice = amazonPrice × 1.70 (70% markup)
  const salesPrice = Math.round(amazonPrice * 1.70 * 100) / 100;
  const profitAmount = Math.round((salesPrice - amazonPrice) * 100) / 100;
  // Profit percent based on sales price: (profit / salesPrice) × 100
  const profitPercent = Math.round(((salesPrice - amazonPrice) / salesPrice) * 100 * 100) / 100;
  
  return { salesPrice, profitAmount, profitPercent };
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function productExistsInDB(asin: string): Promise<boolean> {
  const { data } = await supabase
    .from('products')
    .select('id')
    .eq('asin', asin)
    .single();
  
  return !!data;
}

async function importProductToDB(product: DiscoveredProduct): Promise<string | null> {
  const productId = `prod_${product.asin}_${Date.now()}`;
  
  const { data, error } = await supabase.from('products').upsert({
    id: productId,
    asin: product.asin,
    title: product.title,
    handle: `product-${product.asin.toLowerCase()}`,
    
    // Pricing
    cost_price: product.amazonPrice,
    amazon_price: product.amazonPrice,
    retail_price: product.salesPrice,
    current_price: product.salesPrice,
    compare_at_price: Math.round(product.salesPrice * 1.85 * 100) / 100, // "Was" price
    
    // Profit tracking
    profit_amount: product.profitAmount,
    profit_percent: product.profitPercent,
    profit_margin: product.profitPercent,
    profit_status: product.profitPercent >= 40 ? 'profitable' : 'below_threshold',
    
    // Product attributes
    rating: product.rating,
    review_count: product.reviewCount,
    is_prime: product.isPrime,
    main_image: product.imageUrl,
    category: product.category,
    
    // Source tracking
    source: 'rainforest',
    source_product_id: product.asin,
    source_url: product.amazonUrl,
    
    // Status
    status: 'pending', // Will be 'active' after Shopify sync
    last_price_check: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'asin'
  }).select().single();

  if (error) {
    console.error(`[Discovery] DB insert error for ${product.asin}:`, error);
    return null;
  }

  return data?.id || productId;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHOPIFY SYNC FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function pushToShopify(product: DiscoveredProduct): Promise<string | null> {
  if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
    console.log('[Discovery] Shopify not configured, skipping sync');
    return null;
  }

  const shopifyProduct = {
    product: {
      title: product.title,
      body_html: `<p>High-quality product sourced for our members.</p>
        <ul>
          <li>★ ${product.rating} rating from ${product.reviewCount.toLocaleString()} reviews</li>
          ${product.isPrime ? '<li>✓ Prime eligible</li>' : ''}
        </ul>`,
      vendor: 'Dropship Pro',
      product_type: product.category,
      status: 'active',
      tags: [
        'auto-discovered',
        'dropship-pro',
        product.category.toLowerCase().replace(/\s+/g, '-'),
        `asin-${product.asin}`,
        product.profitPercent >= 40 ? 'high-margin' : 'standard-margin'
      ].join(', '),
      variants: [{
        price: product.salesPrice.toFixed(2),
        compare_at_price: (product.salesPrice * 1.85).toFixed(2),
        sku: product.asin,
        inventory_management: null,
        inventory_policy: 'continue'
      }],
      images: product.imageUrl ? [{ src: product.imageUrl }] : [],
      metafields: [
        { namespace: 'discovery', key: 'asin', value: product.asin, type: 'single_line_text_field' },
        { namespace: 'discovery', key: 'cost_price', value: product.amazonPrice.toString(), type: 'number_decimal' },
        { namespace: 'discovery', key: 'profit_percent', value: product.profitPercent.toString(), type: 'number_decimal' },
        { namespace: 'discovery', key: 'amazon_url', value: product.amazonUrl, type: 'single_line_text_field' },
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
      // Update our DB with Shopify ID
      await supabase.from('products')
        .update({ 
          shopify_product_id: data.product.id.toString(),
          status: 'active',
          synced_at: new Date().toISOString()
        })
        .eq('asin', product.asin);
      
      return data.product.id.toString();
    }

    console.error('[Discovery] Shopify error:', data.errors || data);
    return null;
  } catch (error) {
    console.error('[Discovery] Shopify push error:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DISCOVERY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

async function runDiscovery(filters: DiscoveryFilters, options: {
  maxProducts: number;
  dryRun: boolean;
  source: string;
}): Promise<{
  found: number;
  imported: number;
  synced: number;
  skipped: number;
  rejected: number;
  products: DiscoveredProduct[];
  errors: string[];
}> {
  const result = {
    found: 0,
    imported: 0,
    synced: 0,
    skipped: 0,
    rejected: 0,
    products: [] as DiscoveredProduct[],
    errors: [] as string[],
  };

  const searchTerms = filters.search_terms?.length ? filters.search_terms : DEFAULT_SEARCH_TERMS;
  const seenAsins = new Set<string>();

  for (const term of searchTerms) {
    if (result.found >= options.maxProducts) break;

    try {
      const searchResults = await searchRainforest(term, filters);
      console.log(`[Discovery] Found ${searchResults.length} results for "${term}"`);

      for (const product of searchResults) {
        if (result.found >= options.maxProducts) break;

        const asin = product.asin;
        if (!asin || seenAsins.has(asin)) continue;
        seenAsins.add(asin);

        // Check criteria
        const criteriaCheck = meetsDiscoveryCriteria(product, filters);
        if (!criteriaCheck.meets) {
          result.rejected++;
          continue;
        }

        // Check if already in DB
        const exists = await productExistsInDB(asin);
        if (exists) {
          result.skipped++;
          continue;
        }

        // Calculate pricing
        const price = criteriaCheck.data.price;
        const pricing = calculatePricing(price);

        // Check minimum profit margin
        if (pricing.profitPercent < filters.min_profit_margin) {
          result.rejected++;
          continue;
        }

        const discoveredProduct: DiscoveredProduct = {
          asin,
          title: product.title || `Product ${asin}`,
          amazonPrice: price,
          salesPrice: pricing.salesPrice,
          profitAmount: pricing.profitAmount,
          profitPercent: pricing.profitPercent,
          rating: criteriaCheck.data.rating || 0,
          reviewCount: criteriaCheck.data.reviews || 0,
          imageUrl: product.image || '',
          amazonUrl: `https://amazon.com/dp/${asin}`,
          category: term.split(' ')[0], // First word of search term
          isPrime: criteriaCheck.data.isPrime || false,
        };

        result.products.push(discoveredProduct);
        result.found++;

        // Import to DB (if not dry run)
        if (!options.dryRun) {
          const productId = await importProductToDB(discoveredProduct);
          if (productId) {
            result.imported++;

            // Sync to Shopify
            const shopifyId = await pushToShopify(discoveredProduct);
            if (shopifyId) {
              result.synced++;
            }
          }
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error: any) {
      result.errors.push(`Search "${term}" failed: ${error.message}`);
    }

    // Rate limiting between searches
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST - Run Discovery
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { 
      filters, 
      maxProducts = 100, 
      source = 'manual',
      dryRun = false 
    } = body;
    
    // Check if Rainforest is configured
    if (!RAINFOREST_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'Rainforest API not configured. Please add RAINFOREST_API_KEY to enable product discovery.',
        data: {
          found: 0,
          imported: 0,
          products: [],
          errors: ['Rainforest API key missing'],
        },
      }, { status: 400 });
    }
    
    // Default filters
    const activeFilters: DiscoveryFilters = {
      min_amazon_price: filters?.min_amazon_price ?? 3,
      max_amazon_price: filters?.max_amazon_price ?? 25,
      min_profit_margin: filters?.min_profit_margin ?? 40,
      min_reviews: filters?.min_reviews ?? 500,
      min_rating: filters?.min_rating ?? 3.5,
      max_bsr: filters?.max_bsr ?? 100000,
      require_prime: filters?.require_prime ?? true,
      excluded_brands: filters?.excluded_brands ?? ['Apple', 'Nike', 'Samsung', 'Sony', 'Microsoft'],
      max_products_per_run: maxProducts,
      search_terms: filters?.search_terms,
    };
    
    console.log(`[Discovery] Starting ${dryRun ? 'PREVIEW' : 'IMPORT'} run, max ${maxProducts} products`);
    console.log(`[Discovery] Filters:`, activeFilters);
    
    // Log job start
    const { data: logEntry } = await supabase.from('cron_job_logs').insert({
      job_type: 'discovery',
      status: 'running',
      message: `${dryRun ? 'Preview' : 'Discovery'} started from ${source}`,
      details: { filters: activeFilters, maxProducts, source, dryRun },
      started_at: new Date().toISOString(),
    }).select().single();
    
    // Run discovery
    const result = await runDiscovery(activeFilters, {
      maxProducts,
      dryRun,
      source,
    });
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    // Update log
    if (logEntry?.id) {
      await supabase.from('cron_job_logs').update({
        status: result.errors.length > 0 ? 'partial' : 'success',
        message: `Found ${result.found}, imported ${result.imported}, synced ${result.synced}`,
        processed: result.found,
        details: { ...activeFilters, result },
        completed_at: new Date().toISOString(),
        duration_seconds: duration,
      }).eq('id', logEntry.id);
    }
    
    console.log(`[Discovery] Complete in ${duration}s: ${result.found} found, ${result.imported} imported, ${result.synced} synced`);
    
    return NextResponse.json({
      success: true,
      data: {
        totalFound: result.found,
        found: result.found,
        imported: result.imported,
        synced: result.synced,
        skipped: result.skipped,
        rejected: result.rejected,
        preview: result.products, // For preview mode
        products: result.products,
        errors: result.errors,
        duration,
        filters: activeFilters,
        estimatedTokens: result.found, // For cost estimation
      },
      message: dryRun 
        ? `Preview: Found ${result.found} products matching criteria.`
        : `Discovery completed. Found ${result.found} products, imported ${result.imported}, synced ${result.synced} to Shopify.`,
    });
    
  } catch (error) {
    console.error('[Discovery] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Discovery failed',
      data: {
        found: 0,
        imported: 0,
        products: [],
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      },
    }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET - Get discovery status/history
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    // Get recent discovery runs
    const { data: logs, error } = await supabase
      .from('cron_job_logs')
      .select('*')
      .eq('job_type', 'discovery')
      .order('started_at', { ascending: false })
      .limit(10);
    
    if (error) throw error;
    
    // Check API configuration
    const hasRainforest = !!RAINFOREST_API_KEY;
    const hasShopify = !!(SHOPIFY_SHOP_DOMAIN && SHOPIFY_ACCESS_TOKEN);
    
    return NextResponse.json({
      success: true,
      data: {
        recentRuns: logs || [],
        configuration: {
          rainforestConfigured: hasRainforest,
          shopifyConfigured: hasShopify,
        },
      },
    });
    
  } catch (error) {
    console.error('[Discovery Status] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get status',
    }, { status: 500 });
  }
}
