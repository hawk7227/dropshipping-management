// app/api/cron/price-sync/route.ts
// Scheduled price sync cron job
// Runs daily to refresh competitor prices

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateAllPrices } from '@/lib/utils/pricing-calculator';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify cron secret (optional security)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Sync prices
    const result = await syncAllPrices();
    const duration = Math.round((Date.now() - startTime) / 1000);

    return NextResponse.json({
      success: true,
      duration_seconds: duration,
      total_products: result.synced + result.errors,
      synced: result.synced,
      updated: result.updated || 0,
      skipped: result.skipped || 0,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Price sync cron error:', error);
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    return NextResponse.json({
      success: false,
      duration_seconds: duration,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

async function syncAllPrices() {
  const results: any[] = [];
  let synced = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  // Fetch all products with cost price
  const { data: products, error } = await supabase
    .from('products')
    .select('id, asin, amazon_cost, list_price')
    .not('amazon_cost', 'is', null)
    .gt('amazon_cost', 0);

  if (error) {
    console.error('Error fetching products:', error);
    throw error;
  }

  if (!products || products.length === 0) {
    return { synced: 0, errors: 0, results: [], updated: 0, skipped: 0 };
  }

  // Process each product
  for (const product of products) {
    try {
      // Calculate new prices
      const priceResult = calculateAllPrices(product.amazon_cost);
      
      if (!priceResult.success || !priceResult.data) {
        console.error(`Price calculation failed for ${product.asin}:`, priceResult.errorDetails);
        errors++;
        continue;
      }

      const { listPrice, competitors, profit } = priceResult.data;

      // Update product prices
      const { error: updateError } = await supabase
        .from('products')
        .update({
          list_price: listPrice,
          compare_at_price: competitors.highest,
          amazon_price: competitors.amazon,
          costco_price: competitors.costco,
          ebay_price: competitors.ebay,
          sams_price: competitors.sams,
          profit_amount: profit.amount,
          profit_percent: profit.percent,
          prices_updated_at: new Date().toISOString(),
        })
        .eq('id', product.id);

      if (updateError) {
        console.error(`Error updating ${product.asin}:`, updateError);
        errors++;
        results.push({ asin: product.asin, status: 'error', error: updateError.message });
      } else {
        synced++;
        // Check if price actually changed
        if (product.list_price !== listPrice) {
          updated++;
        } else {
          skipped++;
        }
        results.push({ asin: product.asin, status: 'success', listPrice });
      }
    } catch (err) {
      console.error(`Exception processing ${product.asin}:`, err);
      errors++;
      results.push({ asin: product.asin, status: 'error', error: String(err) });
    }
  }

  return { synced, errors, results, updated, skipped };
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
