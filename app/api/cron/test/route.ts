// app/api/cron/test/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// CRON TEST ENDPOINT — Spec Item 30
// No CRON_SECRET auth check — designed for browser/UI "Test Now" buttons
// Limited scope: smaller batches, dry-run where possible
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type TestableJob = 
  | 'product-discovery'
  | 'price-sync'
  | 'shopify-sync'
  | 'stale-check'
  | 'demand-check'
  | 'google-shopping'
  | 'api-keys';

interface TestResult {
  job: string;
  success: boolean;
  message: string;
  duration_ms: number;
  details?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER (GET + POST both work, no auth required)
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  return handleTest(request);
}

export async function POST(request: NextRequest) {
  return handleTest(request);
}

async function handleTest(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const job = searchParams.get('job') as TestableJob | null;

  console.log(`[CronTest] Test request: job=${job || 'none'}`);

  if (!job) {
    return NextResponse.json({
      error: 'Missing job parameter',
      available_jobs: [
        'product-discovery',
        'price-sync',
        'shopify-sync',
        'stale-check',
        'demand-check',
        'google-shopping',
        'api-keys',
      ],
      usage: '/api/cron/test?job=price-sync',
    }, { status: 400 });
  }

  try {
    let result: TestResult;

    switch (job) {
      case 'product-discovery':
        result = await testProductDiscovery(startTime);
        break;
      case 'price-sync':
        result = await testPriceSync(startTime);
        break;
      case 'shopify-sync':
        result = await testShopifySync(startTime);
        break;
      case 'stale-check':
        result = await testStaleCheck(startTime);
        break;
      case 'demand-check':
        result = await testDemandCheck(startTime);
        break;
      case 'google-shopping':
        result = await testGoogleShopping(startTime);
        break;
      case 'api-keys':
        result = await testApiKeys(startTime);
        break;
      default:
        return NextResponse.json({
          error: `Unknown job: ${job}`,
          available_jobs: [
            'product-discovery', 'price-sync', 'shopify-sync',
            'stale-check', 'demand-check', 'google-shopping', 'api-keys',
          ],
        }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error(`[CronTest] Error testing ${job}:`, error);
    return NextResponse.json({
      job,
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: Date.now() - startTime,
    }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST: Product Discovery (dry run — search only, don't import)
// ═══════════════════════════════════════════════════════════════════════════

async function testProductDiscovery(startTime: number): Promise<TestResult> {
  const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY;
  
  if (!RAINFOREST_API_KEY) {
    return {
      job: 'product-discovery',
      success: false,
      message: 'RAINFOREST_API_KEY not configured',
      duration_ms: Date.now() - startTime,
      details: { env_var: 'RAINFOREST_API_KEY', status: 'missing' },
    };
  }

  try {
    // Test with a single search term, limit 5 results
    const params = new URLSearchParams({
      api_key: RAINFOREST_API_KEY,
      type: 'search',
      amazon_domain: 'amazon.com',
      search_term: 'kitchen gadgets',
      sort_by: 'reviews',
      output: 'json',
    });

    const response = await fetch(`https://api.rainforestapi.com/request?${params}`, {
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return {
        job: 'product-discovery',
        success: false,
        message: `Rainforest API returned ${response.status}: ${response.statusText}`,
        duration_ms: Date.now() - startTime,
        details: { status: response.status, statusText: response.statusText },
      };
    }

    const data = await response.json();
    const products = data.search_results || [];

    return {
      job: 'product-discovery',
      success: true,
      message: `Rainforest API connected — found ${products.length} products in test search`,
      duration_ms: Date.now() - startTime,
      details: {
        api_status: 'connected',
        products_returned: products.length,
        response_time_ms: Date.now() - startTime,
        sample: products.slice(0, 3).map((p: any) => ({
          title: p.title?.substring(0, 60),
          price: p.price?.value,
          rating: p.rating,
          reviews: p.reviews_total,
        })),
      },
    };
  } catch (error) {
    return {
      job: 'product-discovery',
      success: false,
      message: error instanceof Error ? error.message : 'Rainforest API test failed',
      duration_ms: Date.now() - startTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST: Price Sync (check 3 products, report stale ones)
// ═══════════════════════════════════════════════════════════════════════════

async function testPriceSync(startTime: number): Promise<TestResult> {
  try {
    // Get 3 products that need price checks
    const { data: products, error } = await supabase
      .from('products')
      .select('id, title, asin, retail_price, cost_price, last_price_check')
      .not('asin', 'is', null)
      .order('last_price_check', { ascending: true, nullsFirst: true })
      .limit(3);

    if (error) {
      return {
        job: 'price-sync',
        success: false,
        message: `DB error: ${error.message}`,
        duration_ms: Date.now() - startTime,
      };
    }

    const stale = (products || []).filter((p: any) => {
      if (!p.last_price_check) return true;
      const daysSince = (Date.now() - new Date(p.last_price_check).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 14;
    });

    return {
      job: 'price-sync',
      success: true,
      message: `DB connected — ${products?.length || 0} products checked, ${stale.length} stale`,
      duration_ms: Date.now() - startTime,
      details: {
        products_checked: products?.length || 0,
        stale_count: stale.length,
        sample: (products || []).slice(0, 3).map((p: any) => ({
          title: p.title?.substring(0, 50),
          asin: p.asin,
          last_check: p.last_price_check || 'never',
          retail: p.retail_price,
          cost: p.cost_price,
        })),
      },
    };
  } catch (error) {
    return {
      job: 'price-sync',
      success: false,
      message: error instanceof Error ? error.message : 'Price sync test failed',
      duration_ms: Date.now() - startTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST: Shopify Sync (verify connection, count synced/unsynced)
// ═══════════════════════════════════════════════════════════════════════════

async function testShopifySync(startTime: number): Promise<TestResult> {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN || process.env.NEXT_PUBLIC_SHOPIFY_STORE;
  const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!SHOPIFY_STORE || !SHOPIFY_TOKEN) {
    return {
      job: 'shopify-sync',
      success: false,
      message: `Missing env vars: ${!SHOPIFY_STORE ? 'SHOPIFY_STORE_DOMAIN' : ''} ${!SHOPIFY_TOKEN ? 'SHOPIFY_ACCESS_TOKEN' : ''}`.trim(),
      duration_ms: Date.now() - startTime,
      details: {
        SHOPIFY_STORE_DOMAIN: SHOPIFY_STORE ? 'set' : 'MISSING',
        SHOPIFY_ACCESS_TOKEN: SHOPIFY_TOKEN ? 'set' : 'MISSING',
      },
    };
  }

  try {
    // Test Shopify API connection
    const shopifyUrl = `https://${SHOPIFY_STORE}/admin/api/2024-01/products/count.json`;
    const response = await fetch(shopifyUrl, {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        job: 'shopify-sync',
        success: false,
        message: `Shopify API returned ${response.status}: ${response.statusText}`,
        duration_ms: Date.now() - startTime,
        details: { status: response.status },
      };
    }

    const data = await response.json();

    // Count synced vs unsynced in our DB
    const { count: synced } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .not('shopify_product_id', 'is', null);

    const { count: total } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    return {
      job: 'shopify-sync',
      success: true,
      message: `Shopify connected — ${data.count} products in Shopify, ${synced || 0}/${total || 0} synced in DB`,
      duration_ms: Date.now() - startTime,
      details: {
        shopify_product_count: data.count,
        db_total: total || 0,
        db_synced: synced || 0,
        db_unsynced: (total || 0) - (synced || 0),
        api_response_ms: Date.now() - startTime,
      },
    };
  } catch (error) {
    return {
      job: 'shopify-sync',
      success: false,
      message: error instanceof Error ? error.message : 'Shopify sync test failed',
      duration_ms: Date.now() - startTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST: Stale Check (count products past stale threshold)
// ═══════════════════════════════════════════════════════════════════════════

async function testStaleCheck(startTime: number): Promise<TestResult> {
  try {
    const staleThresholdDays = 14;
    const staleDate = new Date(Date.now() - staleThresholdDays * 24 * 60 * 60 * 1000).toISOString();

    // Products with no price check or last check before threshold
    const { data: staleProducts, error } = await supabase
      .from('products')
      .select('id, title, asin, last_price_check, retail_price')
      .or(`last_price_check.is.null,last_price_check.lt.${staleDate}`)
      .eq('status', 'active')
      .order('last_price_check', { ascending: true, nullsFirst: true })
      .limit(10);

    if (error) {
      return {
        job: 'stale-check',
        success: false,
        message: `DB error: ${error.message}`,
        duration_ms: Date.now() - startTime,
      };
    }

    const { count: totalStale } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .or(`last_price_check.is.null,last_price_check.lt.${staleDate}`)
      .eq('status', 'active');

    return {
      job: 'stale-check',
      success: true,
      message: `${totalStale || 0} stale products found (>${staleThresholdDays} days without price check)`,
      duration_ms: Date.now() - startTime,
      details: {
        stale_count: totalStale || 0,
        threshold_days: staleThresholdDays,
        sample: (staleProducts || []).slice(0, 5).map((p: any) => ({
          title: p.title?.substring(0, 50),
          asin: p.asin,
          last_check: p.last_price_check || 'never',
        })),
      },
    };
  } catch (error) {
    return {
      job: 'stale-check',
      success: false,
      message: error instanceof Error ? error.message : 'Stale check failed',
      duration_ms: Date.now() - startTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST: Demand Check (verify product_demand table, count scored)
// ═══════════════════════════════════════════════════════════════════════════

async function testDemandCheck(startTime: number): Promise<TestResult> {
  try {
    const { count: demandCount, error: demandErr } = await supabase
      .from('product_demand')
      .select('*', { count: 'exact', head: true });

    if (demandErr) {
      return {
        job: 'demand-check',
        success: false,
        message: `product_demand table error: ${demandErr.message}`,
        duration_ms: Date.now() - startTime,
        details: { error: demandErr.message, hint: demandErr.hint },
      };
    }

    const { count: productCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    const { data: topDemand } = await supabase
      .from('product_demand')
      .select('product_id, demand_score, bsr_rank')
      .order('demand_score', { ascending: false })
      .limit(5);

    return {
      job: 'demand-check',
      success: true,
      message: `${demandCount || 0}/${productCount || 0} products have demand scores`,
      duration_ms: Date.now() - startTime,
      details: {
        demand_records: demandCount || 0,
        total_products: productCount || 0,
        coverage: productCount ? Math.round(((demandCount || 0) / productCount) * 100) : 0,
        top_demand: (topDemand || []).map((d: any) => ({
          product_id: d.product_id?.substring(0, 8),
          score: d.demand_score,
          bsr: d.bsr_rank,
        })),
      },
    };
  } catch (error) {
    return {
      job: 'demand-check',
      success: false,
      message: error instanceof Error ? error.message : 'Demand check failed',
      duration_ms: Date.now() - startTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST: Google Shopping (verify feed generation)
// ═══════════════════════════════════════════════════════════════════════════

async function testGoogleShopping(startTime: number): Promise<TestResult> {
  try {
    // Check how many products have Shopify data (needed for feed)
    const { count: syncedCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .not('shopify_product_id', 'is', null)
      .eq('status', 'active');

    const { count: withImages } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .not('shopify_product_id', 'is', null)
      .not('image_url', 'is', null)
      .eq('status', 'active');

    return {
      job: 'google-shopping',
      success: true,
      message: `${syncedCount || 0} products ready for Google Shopping feed, ${withImages || 0} with images`,
      duration_ms: Date.now() - startTime,
      details: {
        feed_eligible: syncedCount || 0,
        with_images: withImages || 0,
        missing_images: (syncedCount || 0) - (withImages || 0),
        feed_url: '/api/feed/google-shopping',
      },
    };
  } catch (error) {
    return {
      job: 'google-shopping',
      success: false,
      message: error instanceof Error ? error.message : 'Google Shopping test failed',
      duration_ms: Date.now() - startTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST: API Keys (verify all required keys are set + test connections)
// ═══════════════════════════════════════════════════════════════════════════

async function testApiKeys(startTime: number): Promise<TestResult> {
  const keys: Record<string, { set: boolean; envVar: string; responseMs?: number; error?: string }> = {};

  // Check Keepa
  const keepaKey = process.env.KEEPA_API_KEY;
  keys['keepa'] = { set: !!keepaKey, envVar: 'KEEPA_API_KEY' };
  if (keepaKey) {
    try {
      const t0 = Date.now();
      const res = await fetch(`https://api.keepa.com/token?key=${keepaKey}`, {
        signal: AbortSignal.timeout(8000),
      });
      keys['keepa'].responseMs = Date.now() - t0;
      if (!res.ok) {
        keys['keepa'].error = `HTTP ${res.status}`;
      }
    } catch (err) {
      keys['keepa'].error = err instanceof Error ? err.message : 'Connection failed';
    }
  }

  // Check Rainforest
  const rainforestKey = process.env.RAINFOREST_API_KEY;
  keys['rainforest'] = { set: !!rainforestKey, envVar: 'RAINFOREST_API_KEY' };
  if (rainforestKey) {
    try {
      const t0 = Date.now();
      const res = await fetch(`https://api.rainforestapi.com/request?api_key=${rainforestKey}&type=search&amazon_domain=amazon.com&search_term=test&output=json`, {
        signal: AbortSignal.timeout(10000),
      });
      keys['rainforest'].responseMs = Date.now() - t0;
      if (!res.ok) {
        keys['rainforest'].error = `HTTP ${res.status}`;
      }
    } catch (err) {
      keys['rainforest'].error = err instanceof Error ? err.message : 'Connection failed';
    }
  }

  // Check Shopify
  const shopifyStore = process.env.SHOPIFY_STORE_DOMAIN || process.env.NEXT_PUBLIC_SHOPIFY_STORE;
  const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  keys['shopify'] = { set: !!(shopifyStore && shopifyToken), envVar: 'SHOPIFY_ACCESS_TOKEN + SHOPIFY_STORE_DOMAIN' };
  if (shopifyStore && shopifyToken) {
    try {
      const t0 = Date.now();
      const res = await fetch(`https://${shopifyStore}/admin/api/2024-01/shop.json`, {
        headers: { 'X-Shopify-Access-Token': shopifyToken },
        signal: AbortSignal.timeout(8000),
      });
      keys['shopify'].responseMs = Date.now() - t0;
      if (!res.ok) {
        keys['shopify'].error = `HTTP ${res.status}`;
      }
    } catch (err) {
      keys['shopify'].error = err instanceof Error ? err.message : 'Connection failed';
    }
  }

  // Check Supabase
  keys['supabase'] = { set: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY), envVar: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY' };
  try {
    const t0 = Date.now();
    const { error } = await supabase.from('products').select('id').limit(1);
    keys['supabase'].responseMs = Date.now() - t0;
    if (error) keys['supabase'].error = error.message;
  } catch (err) {
    keys['supabase'].error = err instanceof Error ? err.message : 'Connection failed';
  }

  const allSet = Object.values(keys).every(k => k.set);
  const allConnected = Object.values(keys).every(k => k.set && !k.error);
  const setCount = Object.values(keys).filter(k => k.set).length;
  const connectedCount = Object.values(keys).filter(k => k.set && !k.error).length;

  return {
    job: 'api-keys',
    success: allConnected,
    message: allConnected
      ? `All ${Object.keys(keys).length} API keys verified and connected`
      : `${connectedCount}/${Object.keys(keys).length} connected, ${setCount - connectedCount} errors, ${Object.keys(keys).length - setCount} missing`,
    duration_ms: Date.now() - startTime,
    details: { keys },
  };
}
