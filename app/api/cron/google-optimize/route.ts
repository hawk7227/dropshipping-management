// app/api/cron/google-optimize/route.ts
// Daily automated optimization of Google Merchant listings

import { NextRequest, NextResponse } from 'next/server';
import { 
  getProductPerformance, 
  getUnderperformingProducts, 
  submitProduct,
  updateCustomLabels 
} from '@/lib/google-merchant';
import { getShopifyProducts } from '@/lib/shopify-admin';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = process.env.SUPABASE_URL 
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  : null;

// Type for performance data
interface PerformanceData {
  product_id: string;
  title?: string;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  revenue: number;
}

// Optimize product title with AI
async function optimizeProductTitle(product: any, performance: PerformanceData): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{
        role: 'user',
        content: `Optimize this product title for Google Shopping (max 150 chars):
Title: ${product.title}
Category: ${product.product_type || 'General'}
Brand: ${product.vendor || 'Unknown'}
Current CTR: ${(performance.ctr * 100).toFixed(2)}%
Return JSON: { "optimized_title": "..." }`
      }],
      response_format: { type: 'json_object' },
    });
    
    const result = JSON.parse(response.choices[0].message.content || '{}');
    return result.optimized_title || product.title;
  } catch (error) {
    console.error('Error optimizing title:', error);
    return product.title;
  }
}

export async function GET(req: NextRequest) {
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
    errors: [] as string[],
    improvements: [] as any[],
    duration_ms: 0
  };

  try {
    console.log('[CRON] Fetching Google Merchant performance data...');
    const performanceData: PerformanceData[] = await getProductPerformance(30);
    results.performance_fetched = performanceData.length;
    console.log(`[CRON] Fetched performance for ${performanceData.length} products`);

    // Identify underperformers
    const underperformers = performanceData.filter((p: PerformanceData) => {
      const hasImpressionsLowCTR = p.impressions > 100 && p.ctr < 0.02;
      const hasClicksLowConversion = p.clicks > 20 && (p.conversions / p.clicks) < 0.01;
      return hasImpressionsLowCTR || hasClicksLowConversion;
    }).sort((a: PerformanceData, b: PerformanceData) => b.impressions - a.impressions);

    results.underperforming_found = underperformers.length;
    console.log(`[CRON] Found ${underperformers.length} underperforming products`);

    if (underperformers.length === 0) {
      results.duration_ms = Date.now() - startTime;
      return NextResponse.json({
        success: true,
        message: 'No underperforming products found',
        results
      });
    }

    // Get full product data from Shopify
    const productIds = underperformers.slice(0, 25).map((p: PerformanceData) => p.product_id);
    const shopifyProducts = await getShopifyProducts(productIds);
    const productMap = new Map(shopifyProducts.map((p: any) => [p.id.toString(), p]));

    // Optimize each underperformer
    for (const perf of underperformers.slice(0, 25)) {
      const product = productMap.get(perf.product_id);
      if (!product) {
        results.errors.push(`Product ${perf.product_id} not found in Shopify`);
        continue;
      }

      try {
        const optimizedTitle = await optimizeProductTitle(product, perf);

        // Update Google Merchant
        const googleResult = await submitProduct({
          id: product.id.toString(),
          title: optimizedTitle,
          description: product.body_html || product.title,
          price: parseFloat(product.variants?.[0]?.price || '0'),
          brand: product.vendor,
          images: product.images?.map((img: any) => img.src)
        });

        if (googleResult.success) {
          results.updated_google++;
        }

        // Update custom labels based on performance
        await updateCustomLabels(product.id.toString(), {
          label2: perf.conversions > 10 ? 'converting' : 'needs_attention'
        });

        results.optimized++;
        results.improvements.push({
          product_id: product.id,
          original_title: product.title,
          optimized_title: optimizedTitle,
          previous_ctr: perf.ctr,
        });

      } catch (error: any) {
        results.errors.push(`Error optimizing ${product.id}: ${error.message}`);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Log results
    if (supabase) {
      await supabase.from('optimization_logs').insert({
        timestamp: results.timestamp,
        products_analyzed: results.performance_fetched,
        underperforming: results.underperforming_found,
        optimized: results.optimized,
        errors: results.errors,
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

export async function POST(req: NextRequest) {
  return GET(req);
}

