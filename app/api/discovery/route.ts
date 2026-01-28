// app/api/discovery/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// Product Discovery API Route
// Handles product discovery requests with proper criteria filtering
// Uses meetsDiscoveryCriteria() from pricing-rules.ts
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  PRICING_RULES,
  meetsDiscoveryCriteria,
  meetsDemandCriteria,
  meetsAllCriteria,
  getTodayDiscoveryCategories,
  getCategoryConfig,
  validatePricingConfig,
} from '@/lib/config/pricing-rules';
import {
  discoverProducts,
  validateProduct,
  getDiscoveryStats,
  type DiscoveryOptions,
  type DiscoveryResult,
} from '@/lib/product-discovery';
import {
  isKeepaConfigured,
  testKeepaConnection,
  getRateLimitStatus,
} from '@/lib/services/keepa';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// ═══════════════════════════════════════════════════════════════════════════
// GET - Discovery Status and Configuration
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'status';

  try {
    switch (action) {
      // ─────────────────────────────────────────────────────────────────────
      // Get current discovery status and configuration
      // ─────────────────────────────────────────────────────────────────────
      case 'status': {
        const todayCategories = getTodayDiscoveryCategories();
        const configValidation = validatePricingConfig();
        const keepaConfigured = isKeepaConfigured();
        const rainforestConfigured = !!process.env.RAINFOREST_API_KEY;

        // Get recent runs
        const { data: recentRuns } = await supabase
          .from('discovery_runs')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(5);

        // Get today's stats
        const { data: todayRuns } = await supabase
          .from('discovery_runs')
          .select('products_added, products_rejected')
          .eq('run_date', new Date().toISOString().split('T')[0]);

        const todayDiscovered = todayRuns?.reduce((sum, r) => sum + (r.products_added || 0), 0) || 0;

        return NextResponse.json({
          success: true,
          data: {
            config: {
              valid: configValidation.valid,
              errors: configValidation.errors,
              discovery: PRICING_RULES.discovery,
              demand: PRICING_RULES.demand,
            },
            apis: {
              keepa: keepaConfigured,
              rainforest: rainforestConfigured,
              keepaRateLimit: keepaConfigured ? getRateLimitStatus() : null,
            },
            today: {
              categories: todayCategories,
              discovered: todayDiscovered,
              maxAllowed: PRICING_RULES.discovery.maxProductsPerDay,
              remaining: Math.max(0, PRICING_RULES.discovery.maxProductsPerDay - todayDiscovered),
            },
            recentRuns,
          },
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // Get discovery statistics
      // ─────────────────────────────────────────────────────────────────────
      case 'stats': {
        const days = parseInt(searchParams.get('days') || '30');
        const stats = await getDiscoveryStats(days);

        return NextResponse.json({
          success: true,
          data: stats,
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // Get available categories
      // ─────────────────────────────────────────────────────────────────────
      case 'categories': {
        const categories = Object.entries(PRICING_RULES.discoveryCategories.categories).map(
          ([key, config]) => ({
            key,
            name: config.name,
            amazonCategoryId: config.amazonCategoryId,
            searchTermsCount: config.searchTerms.length,
          })
        );

        const schedule = PRICING_RULES.discoveryCategories.schedule;

        return NextResponse.json({
          success: true,
          data: {
            categories,
            schedule,
            todayCategories: getTodayDiscoveryCategories(),
          },
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // Test API connections
      // ─────────────────────────────────────────────────────────────────────
      case 'test-apis': {
        const results: Record<string, { success: boolean; message: string }> = {};

        // Test Keepa
        if (isKeepaConfigured()) {
          results.keepa = await testKeepaConnection();
        } else {
          results.keepa = { success: false, message: 'KEEPA_API_KEY not configured' };
        }

        // Test Rainforest (simple check)
        if (process.env.RAINFOREST_API_KEY) {
          results.rainforest = { success: true, message: 'RAINFOREST_API_KEY is configured' };
        } else {
          results.rainforest = { success: false, message: 'RAINFOREST_API_KEY not configured' };
        }

        return NextResponse.json({
          success: true,
          data: results,
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // Validate a single product
      // ─────────────────────────────────────────────────────────────────────
      case 'validate': {
        const product = {
          price: parseFloat(searchParams.get('price') || '0') || null,
          rating: parseFloat(searchParams.get('rating') || '0') || null,
          reviewCount: parseInt(searchParams.get('reviews') || '0') || null,
          isPrime: searchParams.get('prime') !== 'false',
          title: searchParams.get('title') || null,
          category: searchParams.get('category') || null,
          bsr: parseInt(searchParams.get('bsr') || '0') || null,
          demandScore: parseFloat(searchParams.get('demandScore') || '50') || 50,
        };

        const validation = validateProduct(product);

        return NextResponse.json({
          success: true,
          data: {
            input: product,
            ...validation,
          },
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // Get rejection log
      // ─────────────────────────────────────────────────────────────────────
      case 'rejections': {
        const limit = parseInt(searchParams.get('limit') || '50');
        const asin = searchParams.get('asin');

        let query = supabase
          .from('rejection_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (asin) {
          query = query.eq('asin', asin);
        }

        const { data, error } = await query;

        if (error) {
          return NextResponse.json({
            success: false,
            error: error.message,
          }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          data,
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}`,
        }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[Discovery API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST - Run Discovery
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      action = 'discover',
      categories,
      maxApiCalls,
      maxProducts,
      dryRun = false,
    } = body;

    switch (action) {
      // ─────────────────────────────────────────────────────────────────────
      // Run product discovery
      // ─────────────────────────────────────────────────────────────────────
      case 'discover': {
        // Check if we've hit daily limit
        const { data: todayRuns } = await supabase
          .from('discovery_runs')
          .select('products_added')
          .eq('run_date', new Date().toISOString().split('T')[0]);

        const todayDiscovered = todayRuns?.reduce((sum, r) => sum + (r.products_added || 0), 0) || 0;
        const remaining = PRICING_RULES.discovery.maxProductsPerDay - todayDiscovered;

        if (remaining <= 0 && !dryRun) {
          return NextResponse.json({
            success: false,
            error: `Daily discovery limit reached (${PRICING_RULES.discovery.maxProductsPerDay} products)`,
            data: {
              todayDiscovered,
              maxAllowed: PRICING_RULES.discovery.maxProductsPerDay,
            },
          }, { status: 429 });
        }

        const options: DiscoveryOptions = {
          categories: categories || getTodayDiscoveryCategories(),
          maxApiCalls: maxApiCalls || 50,
          maxProductsPerDay: Math.min(maxProducts || remaining, remaining),
          dryRun,
        };

        console.log(`[Discovery API] Starting discovery with options:`, options);

        const result = await discoverProducts(options);

        return NextResponse.json({
          success: true,
          data: {
            ...result,
            dryRun,
          },
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // Validate multiple products
      // ─────────────────────────────────────────────────────────────────────
      case 'validate-batch': {
        const { products } = body;

        if (!Array.isArray(products)) {
          return NextResponse.json({
            success: false,
            error: 'products must be an array',
          }, { status: 400 });
        }

        const results = products.map((product: any) => ({
          input: product,
          ...validateProduct(product),
        }));

        return NextResponse.json({
          success: true,
          data: {
            total: results.length,
            passed: results.filter(r => r.passes).length,
            failed: results.filter(r => !r.passes).length,
            results,
          },
        });
      }

      // ─────────────────────────────────────────────────────────────────────
      // Clear rejection log for re-evaluation
      // ─────────────────────────────────────────────────────────────────────
      case 'clear-rejections': {
        const { asins, olderThan } = body;

        let query = supabase.from('rejection_log').delete();

        if (asins && Array.isArray(asins)) {
          query = query.in('asin', asins);
        } else if (olderThan) {
          query = query.lt('created_at', olderThan);
        } else {
          return NextResponse.json({
            success: false,
            error: 'Must specify asins array or olderThan date',
          }, { status: 400 });
        }

        const { error, count } = await query;

        if (error) {
          return NextResponse.json({
            success: false,
            error: error.message,
          }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          data: {
            cleared: count || 0,
          },
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}`,
        }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[Discovery API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}



