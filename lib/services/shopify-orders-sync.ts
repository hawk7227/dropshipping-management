// lib/services/shopify-orders-sync.ts
// Utility to sync Shopify orders to local database for dashboard performance

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ShopifyOrder {
  id: number;
  order_number: string;
  email: string;
  created_at: string;
  updated_at: string;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  total_shipping_price_set?: {
    shop_money: {
      amount: string;
    };
  };
  financial_status: string;
  fulfillment_status: string | null;
  customer?: {
    first_name: string;
    last_name: string;
    email: string;
  };
  shipping_address?: {
    name: string;
    address1: string;
    address2: string;
    city: string;
    province: string;
    zip: string;
    country: string;
  };
  line_items: Array<{
    id: number;
    product_id: number;
    variant_id: number;
    title: string;
    quantity: number;
    price: string;
    sku: string;
  }>;
  fulfillments?: Array<{
    created_at: string;
    tracking_number: string;
    tracking_company: string;
  }>;
}

interface SyncResult {
  success: boolean;
  synced: number;
  created: number;
  updated: number;
  errors: string[];
}

/**
 * Fetch orders from Shopify API
 */
async function fetchShopifyOrders(
  limit: number = 250,
  sinceId?: string
): Promise<ShopifyOrder[]> {
  try {
    const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN;
    const shopifyStore = process.env.SHOPIFY_STORE_DOMAIN;

    if (!shopifyToken || !shopifyStore) {
      throw new Error('Shopify credentials not configured');
    }

    const url = new URL(
      `https://${shopifyStore}/admin/api/2024-01/orders.json`
    );
    url.searchParams.append('limit', Math.min(limit, 250).toString());
    url.searchParams.append('status', 'any');
    if (sinceId) {
      url.searchParams.append('since_id', sinceId);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'X-Shopify-Access-Token': shopifyToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.orders || [];
  } catch (error) {
    console.error('Error fetching Shopify orders:', error);
    throw error;
  }
}

/**
 * Convert Shopify order to local database format
 */
function convertShopifyOrder(shopifyOrder: ShopifyOrder) {
  const customerName = shopifyOrder.customer
    ? `${shopifyOrder.customer.first_name} ${shopifyOrder.customer.last_name}`.trim()
    : shopifyOrder.shipping_address?.name || 'Guest';

  const shippingCost = shopifyOrder.total_shipping_price_set?.shop_money?.amount
    ? parseFloat(shopifyOrder.total_shipping_price_set.shop_money.amount)
    : 0;

  return {
    shopify_order_id: shopifyOrder.id.toString(),
    order_number: shopifyOrder.order_number,
    customer_email: shopifyOrder.email || shopifyOrder.customer?.email,
    customer_name: customerName,
    total: parseFloat(shopifyOrder.total_price),
    subtotal: parseFloat(shopifyOrder.subtotal_price),
    tax: parseFloat(shopifyOrder.total_tax),
    shipping: shippingCost,
    status: shopifyOrder.fulfillment_status || 'pending',
    fulfillment_status: shopifyOrder.fulfillment_status,
    financial_status: shopifyOrder.financial_status,
    items: shopifyOrder.line_items.map(item => ({
      product_id: item.product_id,
      variant_id: item.variant_id,
      title: item.title,
      quantity: item.quantity,
      price: parseFloat(item.price),
      sku: item.sku,
    })),
    shipping_address: shopifyOrder.shipping_address || null,
    ordered_at: shopifyOrder.created_at,
    fulfilled_at: shopifyOrder.fulfillments?.[0]?.created_at || null,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Sync orders from Shopify to local database
 */
export async function syncShopifyOrders(
  limit: number = 250
): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    synced: 0,
    created: 0,
    updated: 0,
    errors: [],
  };

  try {
    // Get the last synced order ID to fetch only new orders
    const { data: lastOrder } = await supabase
      .from('orders')
      .select('shopify_order_id')
      .order('synced_at', { ascending: false })
      .limit(1)
      .single();

    const sinceId = lastOrder?.shopify_order_id;

    // Fetch orders from Shopify
    const shopifyOrders = await fetchShopifyOrders(limit, sinceId);

    if (shopifyOrders.length === 0) {
      result.success = true;
      return result;
    }

    // Convert and upsert orders
    for (const shopifyOrder of shopifyOrders) {
      try {
        const localOrder = convertShopifyOrder(shopifyOrder);

        // Check if order exists
        const { data: existingOrder } = await supabase
          .from('orders')
          .select('id')
          .eq('shopify_order_id', localOrder.shopify_order_id)
          .single();

        if (existingOrder) {
          // Update existing order
          const { error } = await supabase
            .from('orders')
            .update(localOrder)
            .eq('shopify_order_id', localOrder.shopify_order_id);

          if (error) {
            result.errors.push(
              `Failed to update order ${localOrder.order_number}: ${error.message}`
            );
          } else {
            result.updated++;
          }
        } else {
          // Insert new order
          const { error } = await supabase
            .from('orders')
            .insert(localOrder);

          if (error) {
            result.errors.push(
              `Failed to insert order ${localOrder.order_number}: ${error.message}`
            );
          } else {
            result.created++;
          }
        }

        result.synced++;
      } catch (error) {
        result.errors.push(
          `Error processing order ${shopifyOrder.order_number}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }

    result.success = result.errors.length === 0;
    return result;
  } catch (error) {
    result.errors.push(
      `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    return result;
  }
}

/**
 * Sync orders for a specific date range
 */
export async function syncOrdersByDateRange(
  startDate: string,
  endDate: string
): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    synced: 0,
    created: 0,
    updated: 0,
    errors: [],
  };

  try {
    const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN;
    const shopifyStore = process.env.SHOPIFY_STORE_DOMAIN;

    if (!shopifyToken || !shopifyStore) {
      throw new Error('Shopify credentials not configured');
    }

    const url = new URL(
      `https://${shopifyStore}/admin/api/2024-01/orders.json`
    );
    url.searchParams.append('status', 'any');
    url.searchParams.append('created_at_min', startDate);
    url.searchParams.append('created_at_max', endDate);
    url.searchParams.append('limit', '250');

    const response = await fetch(url.toString(), {
      headers: {
        'X-Shopify-Access-Token': shopifyToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();
    const shopifyOrders = data.orders || [];

    // Process orders
    for (const shopifyOrder of shopifyOrders) {
      try {
        const localOrder = convertShopifyOrder(shopifyOrder);

        const { error } = await supabase
          .from('orders')
          .upsert(localOrder, {
            onConflict: 'shopify_order_id',
          });

        if (error) {
          result.errors.push(
            `Failed to sync order ${localOrder.order_number}: ${error.message}`
          );
        } else {
          result.synced++;
        }
      } catch (error) {
        result.errors.push(
          `Error processing order: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }

    result.success = result.errors.length === 0;
    return result;
  } catch (error) {
    result.errors.push(
      `Date range sync failed: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
    return result;
  }
}

/**
 * Get sync status
 */
export async function getSyncStatus() {
  try {
    const { data: lastSync } = await supabase
      .from('orders')
      .select('synced_at')
      .order('synced_at', { ascending: false })
      .limit(1)
      .single();

    const { count: totalOrders } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });

    const today = new Date().toISOString().split('T')[0];
    const { count: todayOrders } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('ordered_at', `${today}T00:00:00Z`);

    return {
      lastSyncAt: lastSync?.synced_at || null,
      totalOrders: totalOrders || 0,
      todayOrders: todayOrders || 0,
    };
  } catch (error) {
    console.error('Error getting sync status:', error);
    return {
      lastSyncAt: null,
      totalOrders: 0,
      todayOrders: 0,
    };
  }
}
