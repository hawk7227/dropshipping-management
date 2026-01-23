// app/api/cron/price-sync/route.ts
// Daily cron job to fetch competitor prices and update compare_at_price
// Schedule in vercel.json: "0 5 * * *" (5 AM daily)

import { NextRequest, NextResponse } from 'next/server';
import { syncCompetitorPrices } from '@/lib/price-sync';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('Starting daily price sync cron...');
    const startTime = Date.now();

    const result = await syncCompetitorPrices({
      products: 'all',
      sources: ['amazon'], // Primary source
      strategy: 'amazon',
      minMarkup: 10, // Only update if we're at least 10% cheaper
      dryRun: false
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    // Log summary
    const summary = {
      success: true,
      duration_seconds: duration,
      total_products: result.total,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
      timestamp: new Date().toISOString()
    };

    console.log('Price sync complete:', summary);

    // Optional: Log to Supabase for tracking
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        await fetch(`${process.env.SUPABASE_URL}/rest/v1/price_sync_logs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({
            ...summary,
            results_sample: result.results.slice(0, 20) // Store first 20 for debugging
          })
        });
      } catch (logError) {
        console.error('Failed to log to Supabase:', logError);
      }
    }

    return NextResponse.json(summary);

  } catch (error: any) {
    console.error('Price sync cron error:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Also allow POST for manual triggers
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    
    const {
      productIds,
      sources = ['amazon'],
      strategy = 'amazon',
      minMarkup = 10,
      dryRun = false
    } = body;

    // If specific product IDs provided, filter
    let products: any[] | 'all' = 'all';
    if (productIds && Array.isArray(productIds)) {
      const { getShopifyProducts } = await import('@/lib/shopify-admin');
      const allProducts = await getShopifyProducts();
      products = allProducts.filter(p => productIds.includes(p.id.toString()));
    }

    const result = await syncCompetitorPrices({
      products,
      sources,
      strategy,
      minMarkup,
      dryRun
    });

    return NextResponse.json({
      success: true,
      dryRun,
      ...result
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
