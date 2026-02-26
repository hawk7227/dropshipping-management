// app/api/command-center/route.ts
// Single product push to Shopify via Admin REST API
// Called by: CommandCenter → pushToShopify() → fetch('/api/command-center', { action: 'push' })

import { NextRequest, NextResponse } from 'next/server';

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
const SHOPIFY_API_VERSION = '2024-01';

// ============================================================================
// SHOPIFY REST API HELPER
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

  // Rate limit handling — Shopify bucket: 40 max, 2/sec refill
  const callLimit = res.headers.get('X-Shopify-Shop-Api-Call-Limit');
  if (callLimit) {
    const [used, max] = callLimit.split('/').map(Number);
    if (used >= max - 2) {
      // Approaching rate limit — pause 1s to let bucket refill
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
// BUILD SHOPIFY PRODUCT PAYLOAD
// ============================================================================
function buildShopifyProduct(product: {
  title: string;
  asin: string;
  price: number;
  sellPrice: number;
  profit: number;
  image: string;
  images: string[];
  description: string;
  vendor: string;
  category: string;
  rating: number;
  reviews: number;
  bsr: number;
  stockStatus: string;
}) {
  const {
    title, asin, price, sellPrice, profit, image,
    description, vendor, category, rating, reviews, bsr, stockStatus,
  } = product;

  // Build tags for filtering in Shopify
  const tags: string[] = ['command-center'];
  if (asin) tags.push(`ASIN:${asin}`);
  if (bsr > 0) tags.push(`BSR:${bsr}`);
  if (rating > 0) tags.push(`Rating:${rating}`);
  if (reviews > 0) tags.push(`Reviews:${reviews}`);
  if (profit > 0) tags.push(`Profit:$${profit.toFixed(2)}`);
  if (stockStatus === 'In Stock') tags.push('in-stock');
  if (stockStatus === 'Out of Stock') tags.push('out-of-stock');

  // Build HTML description with product details
  const descHTML = `
    <div>
      ${description ? `<p>${description}</p>` : ''}
      <ul>
        ${asin ? `<li><strong>ASIN:</strong> ${asin}</li>` : ''}
        ${rating > 0 ? `<li><strong>Rating:</strong> ${rating}/5 (${reviews.toLocaleString()} reviews)</li>` : ''}
        ${bsr > 0 ? `<li><strong>Best Seller Rank:</strong> #${bsr.toLocaleString()}</li>` : ''}
      </ul>
    </div>
  `.trim();

  return {
    product: {
      title,
      body_html: descHTML,
      vendor: vendor || 'Unknown',
      product_type: category || 'General',
      tags: tags.join(', '),
      status: 'active', // Publish immediately — no manual review needed
      variants: [
        {
          price: sellPrice > 0 ? sellPrice.toFixed(2) : (price > 0 ? (price * 1.7).toFixed(2) : '0.00'),
          compare_at_price: sellPrice > 0 && price > 0 ? (sellPrice * 1.2).toFixed(2) : null,
          sku: asin || undefined,
          inventory_management: 'shopify',
          inventory_quantity: stockStatus === 'In Stock' ? 999 : 0,
          requires_shipping: true,
          taxable: true,
          weight: 1.0,
          weight_unit: 'lb',
        },
      ],
      images: image
        ? [{ src: image, alt: title }, ...(product.images || []).filter((img: string) => img !== image).map((img: string) => ({ src: img, alt: title }))]
        : (product.images || []).map((img: string) => ({ src: img, alt: title })),
      metafields: [
        { namespace: 'command_center', key: 'asin', value: asin || '', type: 'single_line_text_field' },
        { namespace: 'command_center', key: 'source_cost', value: price > 0 ? price.toFixed(2) : '0', type: 'number_decimal' },
        { namespace: 'command_center', key: 'profit', value: profit > 0 ? profit.toFixed(2) : '0', type: 'number_decimal' },
        { namespace: 'command_center', key: 'bsr', value: String(bsr || 0), type: 'number_integer' },
        { namespace: 'command_center', key: 'rating', value: rating > 0 ? rating.toFixed(1) : '0', type: 'number_decimal' },
        { namespace: 'command_center', key: 'reviews', value: String(reviews || 0), type: 'number_integer' },
        { namespace: 'command_center', key: 'pushed_at', value: new Date().toISOString(), type: 'single_line_text_field' },
      ],
    },
  };
}

// ============================================================================
// POST HANDLER — Push single product
// ============================================================================
export async function POST(req: NextRequest) {
  try {
    // Validate env vars
    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
      return NextResponse.json(
        { pushed: false, error: 'Shopify credentials not configured. Add SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN to environment variables.' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { product, action } = body;

    if (action !== 'push' || !product) {
      return NextResponse.json({ pushed: false, error: 'Invalid request. Expected { product, action: "push" }' }, { status: 400 });
    }

    // Validate minimum required fields
    if (!product.title && !product.asin) {
      return NextResponse.json({ pushed: false, error: 'Product must have at least a title or ASIN' }, { status: 400 });
    }

    // Check for duplicate ASIN before pushing
    if (product.asin) {
      try {
        const existing = await shopifyREST(`/products.json?fields=id,variants&limit=1&vendor=${encodeURIComponent(product.vendor || '')}`);
        // Search by SKU (ASIN)
        const searchResult = await shopifyREST(
          `/products.json?fields=id,title,variants&limit=5`
        );
        const duplicate = searchResult.products?.find((p: { variants: Array<{ sku: string }> }) =>
          p.variants?.some((v: { sku: string }) => v.sku === product.asin)
        );
        if (duplicate) {
          return NextResponse.json({
            pushed: false,
            error: `Duplicate: ASIN ${product.asin} already exists as "${duplicate.title}" (ID: ${duplicate.id})`,
            shopifyId: duplicate.id,
          });
        }
      } catch {
        // Non-blocking — proceed with push even if dupe check fails
      }
    }

    // Build and push
    const payload = buildShopifyProduct(product);
    const result = await shopifyREST('/products.json', 'POST', payload);

    return NextResponse.json({
      pushed: true,
      shopifyId: result.product?.id,
      handle: result.product?.handle,
      status: result.product?.status,
      adminUrl: `https://${SHOPIFY_STORE_DOMAIN}/admin/products/${result.product?.id}`,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[command-center] Push failed:', message);
    return NextResponse.json({ pushed: false, error: message }, { status: 500 });
  }
}

// ============================================================================
// GET HANDLER — Health check + store info
// ============================================================================
export async function GET() {
  try {
    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
      return NextResponse.json({
        connected: false,
        error: 'Shopify credentials not configured',
      });
    }

    const shop = await shopifyREST('/shop.json');
    const countData = await shopifyREST('/products/count.json');

    return NextResponse.json({
      connected: true,
      store: shop.shop?.name,
      domain: shop.shop?.domain,
      productCount: countData.count,
      plan: shop.shop?.plan_display_name,
    });
  } catch (error) {
    return NextResponse.json({
      connected: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    });
  }
}
