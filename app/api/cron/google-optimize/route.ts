// app/api/cron/google-optimize/route.ts
// Daily automated optimization of Google Merchant listings
// Schedule: Run once daily via Vercel Cron or external scheduler
// 
// This cron job:
// 1. Fetches performance data from Google Merchant Center
// 2. Identifies underperforming products (low CTR, low conversions)
// 3. Uses AI to rewrite titles/descriptions for better performance
// 4. Updates Google Merchant feed with optimized content
// 5. Updates Shopify product metafields for consistency
// 6. Reports results for monitoring

import { NextRequest, NextResponse } from 'next/server';
import { 
  getProductPerformance, 
  getUnderperformingProducts, 
  submitProduct,
  updateCustomLabels 
} from '@/lib/google-merchant';
import { optimizeProductForGoogle, analyzeAndImprove } from '@/lib/ai-seo-engine';
import { getShopifyProducts, updateMetafields } from '@/lib/shopify-admin';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase for logging (optional)
const supabase = process.env.SUPABASE_URL 
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  : null;

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results = {
    timestamp: new Date().toISOString(),
    performance_fetched: 0,
    underperforming_found: 0,
    optimized: 0,
    updated_google: 0,
    updated_shopify: 0,
    errors: [] as string[],
    improvements: [] as any[],
    duration_ms: 0
  };

  try {
    // Step 1: Get performance data from Google
    console.log('[CRON] Fetching Google Merchant performance data...');
    const performanceData = await getProductPerformance(30);
    results.performance_fetched = performanceData.length;
    console.log(`[CRON] Fetched performance for ${performanceData.length} products`);

    // Step 2: Identify underperformers
    const underperformers = performanceData.filter(p => {
      // Criteria for underperformance:
      // - Has significant impressions (>100) but low CTR (<2%)
      // - Or has clicks but low conversion rate (<1%)
      const hasImpressionsLowCTR = p.impressions > 100 && p.ctr < 0.02;
      const hasClicksLowConversion = p.clicks > 20 && (p.conversions / p.clicks) < 0.01;
      return hasImpressionsLowCTR || hasClicksLowConversion;
    }).sort((a, b) => b.impressions - a.impressions);

    results.underperforming_found = underperformers.length;
    console.log(`[CRON] Found ${underperformers.length} underperforming products`);

    // Step 3: Get full product data from Shopify
    const productIds = underperformers.slice(0, 25).map(p => p.product_id);
    const shopifyProducts = await getShopifyProducts(productIds);
    const productMap = new Map(shopifyProducts.map(p => [p.id.toString(), p]));

    // Step 4: Optimize each underperformer
    for (const perf of underperformers.slice(0, 25)) { // Limit to 25 per run
      const product = productMap.get(perf.product_id);
      if (!product) {
        results.errors.push(`Product ${perf.product_id} not found in Shopify`);
        continue;
      }

      try {
        // Analyze current issues
        const analysis = await analyzeAndImprove(product, {
          impressions: perf.impressions,
          clicks: perf.clicks,
          conversions: perf.conversions
        });

        // AI optimize
        const optimized = await optimizeProductForGoogle({
          id: product.id.toString(),
          title: product.title,
          description: product.body_html || '',
          price: parseFloat(product.variants[0].price),
          brand: product.vendor,
          category: product.product_type,
          tags: product.tags?.split(', '),
          images: product.images?.map((img: any) => img.src),
          metafields: product.metafields
        });

        // Only update if we have meaningful improvements
        if (optimized.seo_score > 60 && optimized.improvements_made.length > 0) {
          // Update Google Merchant
          const googleResult = await submitProduct({
            id: product.id.toString(),
            title: optimized.optimized_title,
            description: optimized.optimized_description,
            price: parseFloat(product.variants[0].price),
            brand: product.vendor,
            images: product.images?.map((img: any) => img.src)
          }, false);

          if (googleResult.success) {
            results.updated_google++;
          }

          // Update custom labels based on performance
          await updateCustomLabels(product.id.toString(), {
            label1: perf.conversions > 10 ? 'converting' : 'needs_attention'
          });

          // Optionally update Shopify title/description
          // (Uncomment if you want changes synced back)
          /*
          await updateMetafields(
            product.id.toString(),
            'seo',
            'google_optimized_title',
            optimized.optimized_title
          );
          results.updated_shopify++;
          */

          results.optimized++;
          results.improvements.push({
            product_id: product.id,
            original_title: product.title,
            optimized_title: optimized.optimized_title,
            previous_ctr: perf.ctr,
            seo_score: optimized.seo_score,
            changes: optimized.improvements_made,
            issues_found: analysis.issues
          });
        }

      } catch (error: any) {
        results.errors.push(`Error optimizing ${product.id}: ${error.message}`);
      }

      // Rate limiting between products
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Step 5: Log results to database (optional)
    if (supabase) {
      await supabase.from('optimization_logs').insert({
        timestamp: results.timestamp,
        products_analyzed: results.performance_fetched,
        underperforming: results.underperforming_found,
        optimized: results.optimized,
        errors: results.errors,
        improvements: results.improvements
      });
    }

    results.duration_ms = Date.now() - startTime;
    console.log(`[CRON] Optimization complete in ${results.duration_ms}ms`);

    return NextResponse.json({
      success: true,
      summary: {
        products_analyzed: results.performance_fetched,
        underperforming_found: results.underperforming_found,
        optimized: results.optimized,
        google_updated: results.updated_google,
        errors: results.errors.length,
        duration_seconds: Math.round(results.duration_ms / 1000)
      },
      details: results
    });

  } catch (error: any) {
    console.error('[CRON] Fatal error:', error);
    results.errors.push(`Fatal error: ${error.message}`);
    results.duration_ms = Date.now() - startTime;

    return NextResponse.json({
      success: false,
      error: error.message,
      results
    }, { status: 500 });
  }
}

// Also support POST for manual triggers
export async function POST(req: NextRequest) {
  return GET(req);
}
