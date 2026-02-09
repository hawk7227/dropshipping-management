// app/api/sync-reset/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// SYNC RESET + RE-PUSH API
// ═══════════════════════════════════════════════════════════════════════════
// POST /api/sync-reset?action=audit    → Check which products have fake IDs
// POST /api/sync-reset?action=reset    → Clear fake shopify_product_id values
// POST /api/sync-reset?action=push     → Push unsynced products to Shopify
// POST /api/sync-reset?action=full     → Reset + Push (both steps)
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SHOP_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_SHOP_DOMAIN || process.env.NEXT_PUBLIC_SHOPIFY_SHOP_DOMAIN;
const SHOP_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'audit';

  try {
    switch (action) {
      case 'audit':
        return await auditSync();
      case 'reset':
        return await resetFakeSync();
      case 'push':
        return await pushToShopify();
      case 'full':
        const resetResult = await resetFakeSyncInternal();
        const pushResult = await pushToShopifyInternal();
        return NextResponse.json({
          success: true,
          reset: resetResult,
          push: pushResult,
        });
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error('[SyncReset] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// ═══ AUDIT: Count products by sync status ═══

async function auditSync() {
  const { count: total } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });

  const { count: fakeSync } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .like('shopify_product_id', 'sync-%');

  const { count: realSync } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .not('shopify_product_id', 'is', null)
    .not('shopify_product_id', 'like', 'sync-%');

  const { count: noSync } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .is('shopify_product_id', null);

  return NextResponse.json({
    success: true,
    audit: {
      total_products: total || 0,
      fake_sync_ids: fakeSync || 0,
      real_shopify_ids: realSync || 0,
      never_synced: noSync || 0,
      needs_push: (fakeSync || 0) + (noSync || 0),
    },
    message: `${fakeSync || 0} products have fake sync IDs, ${noSync || 0} never synced, ${realSync || 0} have real Shopify IDs`,
  });
}

// ═══ RESET: Clear fake shopify_product_id values ═══

async function resetFakeSyncInternal() {
  const { data: fakeProducts } = await supabase
    .from('products')
    .select('id')
    .like('shopify_product_id', 'sync-%');

  if (!fakeProducts || fakeProducts.length === 0) {
    return { cleared: 0, message: 'No fake sync IDs found' };
  }

  const ids = fakeProducts.map(p => p.id);
  const { error } = await supabase
    .from('products')
    .update({ shopify_product_id: null, shopify_id: null, synced_at: null })
    .in('id', ids);

  if (error) throw new Error(`Reset failed: ${error.message}`);

  console.log(`[SyncReset] Cleared ${ids.length} fake sync IDs`);
  return { cleared: ids.length, message: `Cleared ${ids.length} fake sync IDs` };
}

async function resetFakeSync() {
  const result = await resetFakeSyncInternal();
  return NextResponse.json({ success: true, ...result });
}

// ═══ PUSH: Create products in Shopify Admin API ═══

async function pushToShopifyInternal() {
  if (!SHOP_DOMAIN || !SHOP_TOKEN) {
    return { pushed: 0, errors: ['Shopify credentials not configured'] };
  }

  const { data: products } = await supabase
    .from('products')
    .select('id, asin, title, brand, category, product_type, description, image_url, images, retail_price, cost_price, rating, review_count, status')
    .is('shopify_product_id', null)
    .not('title', 'is', null)
    .limit(50);

  if (!products || products.length === 0) {
    return { pushed: 0, errors: [], message: 'No products to push' };
  }

  let pushed = 0;
  const errors: string[] = [];

  for (const product of products) {
    try {
      const price = product.retail_price ? product.retail_price.toFixed(2) : '0.00';

      const res = await fetch(`https://${SHOP_DOMAIN}/admin/api/2024-01/products.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOP_TOKEN,
        },
        body: JSON.stringify({
          product: {
            title: product.title,
            body_html: product.description || product.title,
            vendor: product.brand || 'Unknown',
            product_type: product.product_type || product.category || 'General',
            tags: [product.asin ? `asin-${product.asin}` : null, product.category, 'auto-imported'].filter(Boolean).join(', '),
            status: product.status === 'active' ? 'active' : 'draft',
            variants: [{
              price,
              sku: product.asin || product.id,
              inventory_management: 'shopify',
              inventory_quantity: 100,
              requires_shipping: true,
            }],
            images: product.image_url ? [{ src: product.image_url }] : [],
          }
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const shopifyId = data.product?.id?.toString();

      if (shopifyId) {
        await supabase
          .from('products')
          .update({ shopify_product_id: shopifyId, shopify_id: shopifyId, synced_at: new Date().toISOString() })
          .eq('id', product.id);
        pushed++;
        console.log(`[SyncReset] Pushed ${product.asin || product.id} → Shopify #${shopifyId}`);
      }

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (err) {
      errors.push(`${product.asin || product.id}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  return { pushed, errors, message: `Pushed ${pushed}/${products.length} to Shopify` };
}

async function pushToShopify() {
  const result = await pushToShopifyInternal();
  return NextResponse.json({ success: true, ...result });
}
