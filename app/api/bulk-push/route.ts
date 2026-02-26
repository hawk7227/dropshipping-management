// app/api/bulk-push/route.ts
// Batch product push to Shopify — handles multiple products per API call
// Called by: CommandCenter → bulkPushToShopify() → fetch('/api/bulk-push', { products: [...] })
// Processes 3-5 products per call, with 4 concurrent calls = 12-20 products/wave

import { NextRequest, NextResponse } from 'next/server';

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
const SHOPIFY_API_VERSION = '2024-01';

// ============================================================================
// SHOPIFY REST API HELPER (with rate limit awareness)
// ============================================================================
async function shopifyREST(endpoint: string, method = 'GET', body?: unknown) {
  const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`;

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  // Rate limit handling
  const callLimit = res.headers.get('X-Shopify-Shop-Api-Call-Limit');
  if (callLimit) {
    const [used, max] = callLimit.split('/').map(Number);
    if (used >= max - 2) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Shopify ${res.status}: ${errBody}`);
  }

  return res.json();
}

// ============================================================================
// BUILD PRODUCT PAYLOAD (same logic as single push)
// ============================================================================
function buildProduct(p: {
  title: string; asin: string; price: number; sellPrice: number;
  image: string; description: string; vendor: string; category: string;
  rating: number; reviews: number; bsr: number;
}) {
  const tags: string[] = ['command-center', 'bulk-push'];
  if (p.asin) tags.push(`ASIN:${p.asin}`);
  if (p.bsr > 0) tags.push(`BSR:${p.bsr}`);
  if (p.rating > 0) tags.push(`Rating:${p.rating}`);

  const profit = p.sellPrice > 0 && p.price > 0 ? p.sellPrice - p.price : 0;

  return {
    product: {
      title: p.title,
      body_html: p.description ? `<p>${p.description}</p>` : '',
      vendor: p.vendor || 'Unknown',
      product_type: p.category || 'General',
      tags: tags.join(', '),
      status: 'active',
      variants: [{
        price: p.sellPrice > 0 ? p.sellPrice.toFixed(2) : (p.price > 0 ? (p.price * 1.7).toFixed(2) : '0.00'),
        compare_at_price: p.sellPrice > 0 ? (p.sellPrice * 1.2).toFixed(2) : null,
        sku: p.asin || undefined,
        inventory_management: 'shopify',
        inventory_quantity: 999,
        requires_shipping: true,
        taxable: true,
      }],
      images: p.image ? [{ src: p.image, alt: p.title }] : [],
      metafields: [
        { namespace: 'command_center', key: 'asin', value: p.asin || '', type: 'single_line_text_field' },
        { namespace: 'command_center', key: 'source_cost', value: p.price > 0 ? p.price.toFixed(2) : '0', type: 'number_decimal' },
        { namespace: 'command_center', key: 'profit', value: profit > 0 ? profit.toFixed(2) : '0', type: 'number_decimal' },
        { namespace: 'command_center', key: 'bsr', value: String(p.bsr || 0), type: 'number_integer' },
        { namespace: 'command_center', key: 'pushed_at', value: new Date().toISOString(), type: 'single_line_text_field' },
      ],
    },
  };
}

// ============================================================================
// POST HANDLER — Push batch of products sequentially
// ============================================================================
export async function POST(req: NextRequest) {
  try {
    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
      return NextResponse.json(
        { error: 'Shopify credentials not configured' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { products } = body;

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        { error: 'Expected { products: [...] } with at least 1 product' },
        { status: 400 }
      );
    }

    // Cap at 5 products per request (Vercel 10s timeout safety)
    const batch = products.slice(0, 5);
    const results: Array<{
      asin: string;
      title: string;
      success: boolean;
      shopifyId?: number;
      handle?: string;
      error?: string;
    }> = [];

    // Process sequentially within the batch to respect rate limits
    for (const p of batch) {
      try {
        if (!p.title && !p.asin) {
          results.push({ asin: p.asin || '', title: p.title || '', success: false, error: 'Missing title and ASIN' });
          continue;
        }

        const payload = buildProduct(p);
        const result = await shopifyREST('/products.json', 'POST', payload);

        results.push({
          asin: p.asin || '',
          title: p.title || '',
          success: true,
          shopifyId: result.product?.id,
          handle: result.product?.handle,
        });

        // Brief delay between products to stay within rate limits
        // Shopify REST: 40 bucket, 2/sec refill
        await new Promise(r => setTimeout(r, 250));

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          asin: p.asin || '',
          title: p.title || '',
          success: false,
          error: message,
        });
      }
    }

    const pushed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({
      results,
      summary: { total: batch.length, pushed, failed },
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[bulk-push] Batch failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
