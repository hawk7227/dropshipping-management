// app/api/prices/intelligence/route.ts
// Price Intelligence API with competitor tracking, margin analysis, and alerts

import { NextRequest, NextResponse } from 'next/server';
import {
  getCompetitorPrices,
  getLatestCompetitorPrices,
  syncCompetitorPrice,
  syncBulkCompetitorPrices,
  analyzeProductMargin,
  applyMarginRule,
  applyMarginRuleBulk,
  checkPriceAlerts,
  storeAlerts,
  getPriceHistory,
  getPriceTrend,
  recordPriceHistory,
  getPriceTrackingStats,
} from '@/lib/services/price-intelligence-service';
import { createClient } from '@supabase/supabase-js';

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

export const runtime = 'nodejs';
export const maxDuration = 60;

// ============================================================================
// POST ENDPOINTS (Mutations)
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const { productId, productIds, asin, dryRun = false, ...body } = await request.json();

    switch (action) {
      // ============================================================
      // SYNC SINGLE PRODUCT
      // ============================================================
      case 'sync-product': {
        if (!productId || !asin) {
          return NextResponse.json(
            { error: 'productId and asin are required' },
            { status: 400 }
          );
        }

        const result = await syncCompetitorPrice(productId, asin, dryRun);

        return NextResponse.json({
          success: result.success,
          data: result.data,
          error: result.error,
        });
      }

      // ============================================================
      // SYNC BULK PRODUCTS
      // ============================================================
      case 'sync-bulk': {
        if (!productIds || !Array.isArray(productIds)) {
          return NextResponse.json(
            { error: 'productIds array is required' },
            { status: 400 }
          );
        }

        const products = productIds.map((id: string) => ({
          id,
          asin: body.asins?.[id] || '',
          title: body.titles?.[id] || '',
        }));

        const jobStatus = await syncBulkCompetitorPrices(products, dryRun);

        return NextResponse.json({
          success: jobStatus.status === 'completed',
          jobStatus,
        });
      }

      // ============================================================
      // APPLY MARGIN RULE (single product)
      // ============================================================
      case 'apply-margin': {
        if (!productId) {
          return NextResponse.json(
            { error: 'productId is required' },
            { status: 400 }
          );
        }

        const { minMargin = 0.25, targetMargin = 0.35, maxMargin = 0.5 } = body;

        const result = await applyMarginRule(
          productId,
          minMargin,
          targetMargin,
          maxMargin,
          dryRun
        );

        return NextResponse.json(result);
      }

      // ============================================================
      // APPLY MARGIN RULE (bulk)
      // ============================================================
      case 'apply-margin-bulk': {
        if (!productIds || !Array.isArray(productIds)) {
          return NextResponse.json(
            { error: 'productIds array is required' },
            { status: 400 }
          );
        }

        const { minMargin = 0.25, targetMargin = 0.35, maxMargin = 0.5 } = body;

        const result = await applyMarginRuleBulk(
          productIds,
          minMargin,
          targetMargin,
          maxMargin,
          dryRun
        );

        return NextResponse.json(result);
      }

      // ============================================================
      // CHECK & STORE ALERTS
      // ============================================================
      case 'check-alerts': {
        const alerts = await checkPriceAlerts();
        const stored = await storeAlerts(alerts);

        return NextResponse.json({
          success: stored,
          alerts_found: alerts.length,
          alerts,
        });
      }

      // ============================================================
      // RECORD PRICE HISTORY
      // ============================================================
      case 'record-history': {
        if (!productId) {
          return NextResponse.json(
            { error: 'productId is required' },
            { status: 400 }
          );
        }

        const success = await recordPriceHistory(productId);

        return NextResponse.json({
          success,
          message: success ? 'Price recorded' : 'Failed to record price',
        });
      }

      // ============================================================
      // BULK RECORD PRICE HISTORY
      // ============================================================
      case 'record-history-bulk': {
        if (!productIds || !Array.isArray(productIds)) {
          return NextResponse.json(
            { error: 'productIds array is required' },
            { status: 400 }
          );
        }

        let recorded = 0;
        let failed = 0;

        for (const id of productIds) {
          const success = await recordPriceHistory(id);
          if (success) recorded++;
          else failed++;
        }

        return NextResponse.json({
          success: failed === 0,
          recorded,
          failed,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Price Intelligence API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET ENDPOINTS (Queries)
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const productId = searchParams.get('productId');

    switch (action) {
      // ============================================================
      // GET COMPETITOR PRICES
      // ============================================================
      case 'competitor-prices': {
        if (!productId) {
          return NextResponse.json(
            { error: 'productId is required' },
            { status: 400 }
          );
        }

        const prices = await getCompetitorPrices(productId);
        const latest = await getLatestCompetitorPrices(productId);

        return NextResponse.json({
          success: true,
          data: {
            all_prices: prices,
            latest_prices: latest,
          },
        });
      }

      // ============================================================
      // ANALYZE MARGIN
      // ============================================================
      case 'margin-analysis': {
        if (!productId) {
          return NextResponse.json(
            { error: 'productId is required' },
            { status: 400 }
          );
        }

        const analysis = await analyzeProductMargin(productId);

        if (!analysis) {
          return NextResponse.json(
            { error: 'Product not found' },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          data: analysis,
        });
      }

      // ============================================================
      // GET PRICE HISTORY
      // ============================================================
      case 'history': {
        if (!productId) {
          return NextResponse.json(
            { error: 'productId is required' },
            { status: 400 }
          );
        }

        const days = parseInt(searchParams.get('days') || '30');
        const history = await getPriceHistory(productId, days);

        return NextResponse.json({
          success: true,
          data: history,
        });
      }

      // ============================================================
      // GET PRICE TREND
      // ============================================================
      case 'trend': {
        if (!productId) {
          return NextResponse.json(
            { error: 'productId is required' },
            { status: 400 }
          );
        }

        const days = parseInt(searchParams.get('days') || '30');
        const trend = await getPriceTrend(productId, days);

        return NextResponse.json({
          success: true,
          data: trend,
        });
      }

      // ============================================================
      // GET DASHBOARD STATS
      // ============================================================
      case 'stats': {
        const stats = await getPriceTrackingStats();

        return NextResponse.json({
          success: true,
          data: stats,
        });
      }

      // ============================================================
      // GET PRICE ALERTS
      // ============================================================
      case 'alerts': {
        const limit = parseInt(searchParams.get('limit') || '20');
        const severity = searchParams.get('severity');

        let query = getSupabaseClient()
          .from('price_alerts')
          .select('*')
          .is('resolved_at', null)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (severity) {
          query = query.eq('severity', severity);
        }

        const { data, error } = await query;

        if (error) {
          return NextResponse.json(
            { error: error.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          data: data || [],
        });
      }

      // ============================================================
      // GET MARGIN RULES
      // ============================================================
      case 'margin-rules': {
        const { data, error } = await getSupabaseClient()
          .from('margin_rules')
          .select('*')
          .eq('is_active', true)
          .order('priority', { ascending: false });

        if (error) {
          return NextResponse.json(
            { error: error.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          data: data || [],
        });
      }

      // ============================================================
      // GET PRICE COMPARISON (dashboard view)
      // ============================================================
      case 'comparison': {
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');
        const marginStatus = searchParams.get('marginStatus');

        let query = getSupabaseClient()
          .from('price_comparison')
          .select('*', { count: 'exact' })
          .order('last_updated', { ascending: false })
          .range(offset, offset + limit - 1);

        if (marginStatus) {
          query = query.eq('margin_status', marginStatus);
        }

        const { data, count, error } = await query;

        if (error) {
          return NextResponse.json(
            { error: error.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          data: data || [],
          total: count || 0,
          limit,
          offset,
        });
      }

      // ============================================================
      // GET BULK SYNC JOB STATUS
      // ============================================================
      case 'sync-job-status': {
        const jobId = searchParams.get('jobId');

        if (!jobId) {
          return NextResponse.json(
            { error: 'jobId is required' },
            { status: 400 }
          );
        }

        const { data, error } = await getSupabaseClient()
          .from('price_sync_jobs')
          .select('*')
          .eq('job_id', jobId)
          .single();

        if (error) {
          return NextResponse.json(
            { error: 'Job not found' },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          data,
        });
      }

      default:
        return NextResponse.json(
          { success: true, message: 'Price Intelligence API' },
          { status: 200 }
        );
    }
  } catch (error: any) {
    console.error('Price Intelligence GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
