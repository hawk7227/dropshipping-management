// app/api/cron/ai-optimize/route.ts
// Daily AI optimization cron - optimizes product titles, descriptions, SEO, and pricing
// Schedule: "0 4 * * *" (4 AM daily)

import { NextRequest, NextResponse } from 'next/server';
import {
  batchOptimizeProducts,
  analyzeOptimizationOpportunities,
  calculateCompetitorPrices
} from '@/lib/ai-optimization';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

/**
 * Fetch products from Shopify
 */
async function getShopifyProducts(limit: number = 50): Promise<any[]> {
  const response = await fetch(
    `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/products.json?limit=${limit}&status=active`,
    {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
      }
    }
  );

  const data = await response.json();
  return data.products || [];
}

/**
 * Fetch products that haven't been optimized recently
 */
async function getUnoptimizedProducts(limit: number = 25): Promise<any[]> {
  const allProducts = await getShopifyProducts(250);
  
  // Filter to products not optimized in last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const unoptimized = allProducts.filter(product => {
    const lastOptimized = product.metafields?.find(
      (m: any) => m.namespace === 'ai_optimization' && m.key === 'last_optimized'
    )?.value;
    
    if (!lastOptimized) return true;
    return new Date(lastOptimized) < sevenDaysAgo;
  });

  return unoptimized.slice(0, limit);
}

/**
 * Update competitor prices only (for products already optimized)
 */
async function updateCompetitorPrices(productId: string, salesPrice: number): Promise<boolean> {
  const competitorPrices = calculateCompetitorPrices(salesPrice);

  try {
    const response = await fetch(
      `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/products/${productId}/metafields.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        },
        body: JSON.stringify({
          metafield: {
            namespace: 'compare_prices',
            key: 'amazon_price',
            value: competitorPrices.amazon.toString(),
            type: 'number_decimal'
          }
        })
      }
    );

    // Add other competitor prices
    const competitors = [
      { key: 'costco_price', value: competitorPrices.costco },
      { key: 'ebay_price', value: competitorPrices.ebay },
      { key: 'sams_price', value: competitorPrices.sams }
    ];

    for (const comp of competitors) {
      await fetch(
        `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/products/${productId}/metafields.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
          },
          body: JSON.stringify({
            metafield: {
              namespace: 'compare_prices',
              key: comp.key,
              value: comp.value.toString(),
              type: 'number_decimal'
            }
          })
        }
      );
    }

    return true;
  } catch (error) {
    console.error('Update competitor prices error:', error);
    return false;
  }
}

// GET - Cron job execution
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('Starting AI optimization cron...');
    const startTime = Date.now();

    // Get products needing optimization
    const products = await getUnoptimizedProducts(25);
    
    if (products.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All products recently optimized',
        timestamp: new Date().toISOString()
      });
    }

    // Transform to optimization format
    const productsToOptimize = products.map(p => ({
      id: p.id.toString(),
      title: p.title,
      description: p.body_html || '',
      price: parseFloat(p.variants[0]?.price || '0'),
      costPrice: parseFloat(
        p.metafields?.find((m: any) => m.namespace === 'discovery' && m.key === 'cost_price')?.value || '0'
      ) || undefined,
      category: p.product_type || undefined,
      tags: p.tags?.split(', ') || []
    }));

    // Run batch optimization
    const result = await batchOptimizeProducts(productsToOptimize, {
      applyChanges: true,
      minScoreToApply: 60
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    const summary = {
      success: true,
      duration_seconds: duration,
      total_products: result.total,
      optimized: result.optimized,
      failed: result.failed,
      avg_score: result.results.length > 0
        ? Math.round(result.results.reduce((sum, r) => sum + r.scores.overallScore, 0) / result.results.length)
        : 0,
      timestamp: new Date().toISOString()
    };

    console.log('AI optimization complete:', summary);

    return NextResponse.json(summary);

  } catch (error: any) {
    console.error('AI optimization cron error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// POST - Manual optimization trigger
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    
    const {
      productIds,          // Specific products to optimize
      limit = 25,          // Max products
      applyChanges = false, // Whether to apply changes
      minScore = 60,       // Minimum score to apply
      priceUpdateOnly = false // Only update competitor prices
    } = body;

    let products: any[];

    if (productIds && Array.isArray(productIds)) {
      // Fetch specific products
      const allProducts = await getShopifyProducts(250);
      products = allProducts.filter(p => productIds.includes(p.id.toString()));
    } else {
      products = await getUnoptimizedProducts(limit);
    }

    // Price update only mode
    if (priceUpdateOnly) {
      let updated = 0;
      for (const product of products) {
        const price = parseFloat(product.variants[0]?.price || '0');
        if (price > 0) {
          await updateCompetitorPrices(product.id.toString(), price);
          updated++;
        }
      }
      return NextResponse.json({
        success: true,
        mode: 'priceUpdateOnly',
        updated
      });
    }

    // Full optimization
    const productsToOptimize = products.map(p => ({
      id: p.id.toString(),
      title: p.title,
      description: p.body_html || '',
      price: parseFloat(p.variants[0]?.price || '0'),
      costPrice: parseFloat(
        p.metafields?.find((m: any) => m.namespace === 'discovery' && m.key === 'cost_price')?.value || '0'
      ) || undefined,
      category: p.product_type || undefined,
      tags: p.tags?.split(', ') || []
    }));

    const result = await batchOptimizeProducts(productsToOptimize, {
      applyChanges,
      minScoreToApply: minScore
    });

    return NextResponse.json({
      success: true,
      ...result,
      sample: result.results.slice(0, 3).map(r => ({
        productId: r.productId,
        originalTitle: r.original.title,
        optimizedTitle: r.optimized.title,
        score: r.scores.overallScore,
        competitorPrices: r.optimized.competitorPrices
      }))
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
