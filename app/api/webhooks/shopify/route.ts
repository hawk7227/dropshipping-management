// app/api/webhooks/shopify/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// SHOPIFY WEBHOOK RECEIVER — Spec Item 36
// Handles: orders/create, products/update, products/delete, inventory_levels/update
// ═══════════════════════════════════════════════════════════════════════════
// - HMAC signature verification (X-Shopify-Hmac-Sha256)
// - Idempotent processing (checks X-Shopify-Webhook-Id)
// - Syncs Shopify state back to Supabase
// - Logging for audit trail
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabaseClient() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || '';

// ═══════════════════════════════════════════════════════════════════════════
// HMAC VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

function verifyShopifyHmac(body: string, hmacHeader: string): boolean {
  if (!SHOPIFY_WEBHOOK_SECRET) {
    console.warn('[Webhook] SHOPIFY_WEBHOOK_SECRET not set — skipping HMAC verification');
    return true; // Allow in dev
  }
  const digest = crypto
    .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
    .update(body, 'utf8')
    .digest('base64');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const rawBody = await request.text();
    const topic = request.headers.get('x-shopify-topic') || 'unknown';
    const shopDomain = request.headers.get('x-shopify-shop-domain') || 'unknown';
    const webhookId = request.headers.get('x-shopify-webhook-id') || '';
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256') || '';

    console.log(`[Webhook] Received ${topic} from ${shopDomain} (id: ${webhookId})`);

    // Verify HMAC
    if (hmacHeader && !verifyShopifyHmac(rawBody, hmacHeader)) {
      console.error('[Webhook] HMAC verification failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse body
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Check idempotency — skip if we already processed this webhook
    if (webhookId) {
      const { data: existing } = await getSupabaseClient()
        .from('webhook_logs')
        .select('id')
        .eq('webhook_id', webhookId)
        .maybeSingle();

      if (existing) {
        console.log(`[Webhook] Already processed ${webhookId} — skipping`);
        return NextResponse.json({ status: 'already_processed' });
      }
    }

    // Route to handler
    let result: { success: boolean; message: string; details?: any };

    switch (topic) {
      case 'orders/create':
        result = await handleOrderCreate(payload);
        break;
      case 'orders/paid':
        result = await handleOrderPaid(payload);
        break;
      case 'products/update':
        result = await handleProductUpdate(payload);
        break;
      case 'products/delete':
        result = await handleProductDelete(payload);
        break;
      case 'inventory_levels/update':
        result = await handleInventoryUpdate(payload);
        break;
      default:
        result = { success: true, message: `Unhandled topic: ${topic}` };
        console.log(`[Webhook] Unhandled topic: ${topic}`);
    }

    // Log the webhook
    await getSupabaseClient().from('webhook_logs').insert({
      webhook_id: webhookId || `manual-${Date.now()}`,
      topic,
      shop_domain: shopDomain,
      success: result.success,
      message: result.message,
      payload_summary: JSON.stringify(payload).slice(0, 500),
      processing_ms: Date.now() - startTime,
      created_at: new Date().toISOString(),
    }).then(({ error: logErr }) => {
      if (logErr) console.warn('[Webhook] Log insert error:', logErr.message);
    });

    return NextResponse.json(result);

  } catch (err) {
    console.error('[Webhook] Unhandled error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

async function handleOrderCreate(payload: any) {
  const orderId = payload.id;
  const orderNumber = payload.order_number || payload.name;
  const totalPrice = parseFloat(payload.total_price || '0');
  const lineItems = payload.line_items || [];

  console.log(`[Webhook] Order created: #${orderNumber} — $${totalPrice} — ${lineItems.length} items`);

  try {
    // Insert order into unified_orders
    await getSupabaseClient().from('unified_orders').insert({
      shopify_order_id: orderId?.toString(),
      order_number: orderNumber?.toString(),
      total_price: totalPrice,
      currency: payload.currency || 'USD',
      financial_status: payload.financial_status || 'pending',
      fulfillment_status: payload.fulfillment_status || null,
      customer_email: payload.email || null,
      line_item_count: lineItems.length,
      source: 'shopify_webhook',
      raw_data: JSON.stringify(payload).slice(0, 5000),
      created_at: payload.created_at || new Date().toISOString(),
    });

    // Update product demand scores
    for (const item of lineItems) {
      if (item.product_id) {
        await getSupabaseClient().rpc('increment_demand_score', {
          p_shopify_product_id: item.product_id.toString(),
          p_quantity: item.quantity || 1,
        }).catch(() => { /* RPC may not exist yet */ });
      }
    }

    return { success: true, message: `Order #${orderNumber} processed (${lineItems.length} items, $${totalPrice})` };
  } catch (err) {
    return { success: false, message: `Order error: ${err instanceof Error ? err.message : 'Unknown'}` };
  }
}

async function handleOrderPaid(payload: any) {
  const orderId = payload.id;
  console.log(`[Webhook] Order paid: ${orderId}`);

  try {
    await getSupabaseClient()
      .from('unified_orders')
      .update({ financial_status: 'paid', updated_at: new Date().toISOString() })
      .eq('shopify_order_id', orderId?.toString());

    return { success: true, message: `Order ${orderId} marked as paid` };
  } catch (err) {
    return { success: false, message: `Order paid error: ${err instanceof Error ? err.message : 'Unknown'}` };
  }
}

async function handleProductUpdate(payload: any) {
  const shopifyId = payload.id;
  const title = payload.title;
  const status = payload.status;

  console.log(`[Webhook] Product updated: ${shopifyId} — ${title}`);

  try {
    // Find product by shopify_product_id
    const { data: product } = await getSupabaseClient()
      .from('products')
      .select('id')
      .or(`shopify_product_id.eq.${shopifyId},shopify_id.eq.${shopifyId}`)
      .maybeSingle();

    if (product) {
      const variant = payload.variants?.[0];
      const updateData: any = {
        title: title,
        updated_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      };

      // Sync price if Shopify changed it
      if (variant?.price) {
        updateData.retail_price = parseFloat(variant.price);
      }
      if (variant?.compare_at_price) {
        updateData.compare_at_price = parseFloat(variant.compare_at_price);
      }

      // Map Shopify status to our status
      if (status === 'archived') updateData.status = 'paused';
      if (status === 'draft') updateData.status = 'draft';

      await getSupabaseClient().from('products').update(updateData).eq('id', product.id);
    }

    return { success: true, message: `Product ${shopifyId} synced` };
  } catch (err) {
    return { success: false, message: `Product update error: ${err instanceof Error ? err.message : 'Unknown'}` };
  }
}

async function handleProductDelete(payload: any) {
  const shopifyId = payload.id;
  console.log(`[Webhook] Product deleted from Shopify: ${shopifyId}`);

  try {
    await getSupabaseClient()
      .from('products')
      .update({
        status: 'removed',
        shopify_product_id: null,
        updated_at: new Date().toISOString(),
      })
      .or(`shopify_product_id.eq.${shopifyId},shopify_id.eq.${shopifyId}`);

    return { success: true, message: `Product ${shopifyId} marked as removed` };
  } catch (err) {
    return { success: false, message: `Product delete error: ${err instanceof Error ? err.message : 'Unknown'}` };
  }
}

async function handleInventoryUpdate(payload: any) {
  const inventoryItemId = payload.inventory_item_id;
  const available = payload.available;

  console.log(`[Webhook] Inventory update: item ${inventoryItemId} → ${available} available`);

  // Inventory updates are informational — logged but not directly synced
  // The inventory_levels Shopify API is the source of truth
  return { success: true, message: `Inventory ${inventoryItemId}: ${available} available` };
}
