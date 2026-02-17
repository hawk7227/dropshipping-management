// lib/services/channels-service.ts
// Comprehensive channels service for Shopify, eBay, TikTok, Google integration

import { createClient } from '@supabase/supabase-js';
import type {
  ChannelConfig,
  ChannelListing,
  UnifiedOrder,
  OrderItem,
} from '@/types/database';

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

// =====================
// SHOPIFY INTEGRATION
// =====================

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  vendor?: string;
  product_type?: string;
  status: 'active' | 'draft' | 'archived';
  body_html?: string;
  images: Array<{ src: string; alt?: string }>;
  variants: Array<{
    id: string;
    title: string;
    sku?: string;
    price: string;
    inventory_quantity: number;
  }>;
}

export async function syncProductToShopify(
  productId: string,
  productData: Partial<ShopifyProduct>
): Promise<{ success: boolean; shopifyId?: string; error?: string }> {
  try {
    const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN;
    const shopifyStore = process.env.SHOPIFY_STORE;

    if (!shopifyToken || !shopifyStore) {
      throw new Error('Shopify credentials not configured');
    }

    // Check if product already exists in Shopify (by SKU)
    const existingUrl = `https://${shopifyStore}.myshopify.com/admin/api/2024-01/products.json?status=any&fields=id,handle,variants`;
    const searchRes = await fetch(existingUrl, {
      headers: { 'X-Shopify-Access-Token': shopifyToken },
    });
    const searchData = (await searchRes.json()) as { products: ShopifyProduct[] };
    
    const existingProduct = searchData.products.find(p =>
      p.variants?.some(v => v.sku === productData.variants?.[0]?.sku)
    );

    const endpoint = existingProduct
      ? `https://${shopifyStore}.myshopify.com/admin/api/2024-01/products/${existingProduct.id}.json`
      : `https://${shopifyStore}.myshopify.com/admin/api/2024-01/products.json`;

    const method = existingProduct ? 'PUT' : 'POST';

    const response = await fetch(endpoint, {
      method,
      headers: {
        'X-Shopify-Access-Token': shopifyToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ product: productData }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify sync failed: ${response.status} - ${error}`);
    }

    const result = (await response.json()) as { product: ShopifyProduct };
    const shopifyId = result.product.id;

    // Update platform_listings
    await getSupabaseClient().from('platform_listings').upsert(
      {
        product_id: productId,
        platform: 'shopify',
        platform_listing_id: shopifyId,
        platform_url: `https://${shopifyStore}.myshopify.com/products/${result.product.handle}`,
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'product_id,platform' }
    );

    return { success: true, shopifyId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getShopifyOrders(
  limit: number = 100,
  cursor?: string
): Promise<UnifiedOrder[]> {
  try {
    const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN;
    const shopifyStore = process.env.SHOPIFY_STORE;

    if (!shopifyToken || !shopifyStore) {
      throw new Error('Shopify credentials not configured');
    }

    const url = new URL(
      `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders.json`
    );
    url.searchParams.append('limit', Math.min(limit, 250).toString());
    url.searchParams.append('status', 'any');
    if (cursor) url.searchParams.append('limit_key_set', cursor);

    const response = await fetch(url.toString(), {
      headers: { 'X-Shopify-Access-Token': shopifyToken },
    });

    if (!response.ok) {
      throw new Error(`Shopify fetch failed: ${response.status}`);
    }

    const data = (await response.json()) as { orders: any[] };
    return data.orders.map(order => convertShopifyOrder(order));
  } catch (error) {
    console.error('Error fetching Shopify orders:', error);
    return [];
  }
}

function convertShopifyOrder(shopifyOrder: any): UnifiedOrder {
  const items: OrderItem[] = shopifyOrder.line_items.map((item: any) => ({
    product_id: item.product_id,
    sku: item.sku || item.product_id,
    title: item.title,
    quantity: item.quantity,
    price: parseFloat(item.price),
  }));

  return {
    id: `shopify-${shopifyOrder.id}`,
    channel: 'shopify',
    channel_order_id: shopifyOrder.id.toString(),
    status: shopifyOrder.fulfillment_status || 'pending',
    customer_name: shopifyOrder.customer?.first_name + ' ' + shopifyOrder.customer?.last_name,
    customer_email: shopifyOrder.customer?.email,
    customer_phone: shopifyOrder.customer?.phone,
    shipping_name: shopifyOrder.shipping_address?.name,
    shipping_address1: shopifyOrder.shipping_address?.address1,
    shipping_address2: shopifyOrder.shipping_address?.address2,
    shipping_city: shopifyOrder.shipping_address?.city,
    shipping_state: shopifyOrder.shipping_address?.province,
    shipping_postal: shopifyOrder.shipping_address?.zip,
    shipping_country: shopifyOrder.shipping_address?.country,
    subtotal: parseFloat(shopifyOrder.subtotal_price || 0),
    shipping_cost: parseFloat(shopifyOrder.total_shipping_price || 0),
    tax: parseFloat(shopifyOrder.total_tax || 0),
    total: parseFloat(shopifyOrder.total_price),
    items,
    tracking_number:
      shopifyOrder.fulfillments?.[0]?.tracking_info?.number || null,
    tracking_carrier:
      shopifyOrder.fulfillments?.[0]?.tracking_info?.company || null,
    fulfilled_at: shopifyOrder.fulfilled_at,
    channel_created_at: shopifyOrder.created_at,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// =====================
// QUEUE MANAGEMENT
// =====================

export async function createShopifyQueueJob(
  productIds: string[]
): Promise<{ job_id: string; status: string }> {
  const { data, error } = await supabase
    .from('shopify_queue')
    .insert({
      product_ids: productIds,
      status: 'pending',
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return { job_id: data.id, status: data.status };
}

export async function getShopifyQueueStatus(
  jobId: string
): Promise<{
  total: number;
  processed: number;
  created: number;
  updated: number;
  failed: number;
  status: string;
  estimated_remaining_seconds: number;
}> {
  const { data } = await supabase
    .from('shopify_queue')
    .select('*')
    .eq('id', jobId)
    .single();

  if (!data) {
    return {
      total: 0,
      processed: 0,
      created: 0,
      updated: 0,
      failed: 0,
      status: 'not_found',
      estimated_remaining_seconds: 0,
    };
  }

  const processed = (data.processed || 0) as number;
  const total = (data.product_ids || []).length;
  const rate = 2; // 2 requests per second

  return {
    total,
    processed,
    created: data.created || 0,
    updated: data.updated || 0,
    failed: data.failed || 0,
    status: data.status,
    estimated_remaining_seconds: Math.ceil((total - processed) / rate),
  };
}

// =====================
// EBAY INTEGRATION
// =====================

export async function generateEbayExport(
  productIds?: string[]
): Promise<string> {
  let query = getSupabaseClient().from('products').select('*,variants(*)');

  if (productIds && productIds.length > 0) {
    query = query.in('id', productIds);
  } else {
    query = query.eq('status', 'active');
  }

  const { data: products } = await query;

  if (!products || products.length === 0) {
    return generateEbayCsvHeader() + '\n';
  }

  let csv = generateEbayCsvHeader() + '\n';

  for (const product of products) {
    const row = generateEbayRow(product);
    csv += row + '\n';
  }

  return csv;
}

function generateEbayCsvHeader(): string {
  // 102-column eBay File Exchange format
  return [
    '*Action(SiteID=US|Country=US|Currency=USD|Version=LatestSupported)',
    'Locale=en_US',
    'Title',
    'Category',
    'ProductID',
    'ProductID-Type',
    'ConditionID',
    'Description',
    'Duration',
    'StartPrice',
    'Quantity',
    'Location-State',
    'Location-PostalCode',
    'Location-City',
    'ReservePrice',
    'BuyItNowPrice',
    'Currency',
    'AutoPay',
    'PaymentMethods',
    'Refund-Days',
    'RefundMethod',
    'StoreCategory',
    'STO',
    'ExcludeShipping',
    'DomesticShippingCost',
    'DomesticShippingType',
    'InternationalShippingCost',
    'IntlShippingType',
    'ShipToLocations',
    'PayPalEmailAddress',
    'Item-MaxBids',
    'ReturnPolicyDetails-ReturnsAccepted',
    'ReturnPolicyDetails-RestockingFeePercent',
    'ReturnPolicyDetails-Refund',
    'ReturnPolicyDetails-ReturnsWithin',
    'Item-GlobalShipping',
    'Picture-URL',
    'DispatchTimeMax',
    'HandlingTime',
    'Variations-Enabled',
    'Variation-SKU-0',
    'Variation-Quantity-0',
    'Variation-Price-0',
    'Variation-Name-0',
    'Variation-Value-0',
  ].join('\t');
}

function generateEbayRow(product: any): string {
  const fields = [
    'Revise', // Action
    'US', // SiteID
    product.title,
    '11232', // Electronics category
    product.id, // ProductID (SKU)
    'SKU',
    '3000', // Used condition
    product.description || product.title,
    'Days_30', // Duration
    product.retail_price || product.price || '0',
    '1', // Quantity
    '', // State
    '', // PostalCode
    '', // City
    '0', // ReservePrice
    product.retail_price || product.price || '0', // BuyItNowPrice
    'USD',
    'Yes', // AutoPay
    'PayPal', // PaymentMethods
    '30', // RefundDays
    'MoneyBack', // RefundMethod
    '', // StoreCategory
    '', // STO
    'No', // ExcludeShipping
    '4.99', // DomesticShippingCost
    'Flat', // DomesticShippingType
    '9.99', // InternationalShippingCost
    'Flat', // IntlShippingType
    'US', // ShipToLocations
    process.env.PAYPAL_EMAIL || 'seller@example.com',
    '', // MaxBids
    'ReturnsAccepted', // ReturnsAccepted
    '0', // RestockingFeePercent
    'MoneyBack', // Refund
    'Days_30', // ReturnsWithin
    'Yes', // GlobalShipping
    product.image_url || '', // Picture-URL
    '1', // DispatchTimeMax
    '0', // HandlingTime
    'No', // VariationsEnabled
    '', // VariationSKU
    '', // VariationQuantity
    '', // VariationPrice
    '', // VariationName
    '', // VariationValue
  ];

  return fields.map(f => `"${f}"`).join('\t');
}

// =====================
// UNIFIED ORDER SYNC
// =====================

export async function syncChannelOrders(): Promise<{
  synced: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let synced = 0;

  try {
    // Fetch from all channels
    const shopifyOrders = await getShopifyOrders(250);
    synced += shopifyOrders.length;

    // Save to unified_orders table
    if (shopifyOrders.length > 0) {
      const { error } = await supabase
        .from('unified_orders')
        .upsert(shopifyOrders, {
          onConflict: 'channel,channel_order_id',
        });

      if (error) {
        errors.push(`Failed to sync Shopify orders: ${error.message}`);
      }
    }
  } catch (error) {
    errors.push(
      `Channel sync error: ${error instanceof Error ? error.message : 'Unknown'}`
    );
  }

  return { synced, errors };
}

export async function getUnifiedOrders(
  limit: number = 50,
  offset: number = 0,
  filters?: {
    channel?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
  }
): Promise<{ orders: UnifiedOrder[]; total: number }> {
  let query = getSupabaseClient().from('unified_orders').select('*', { count: 'exact' });

  if (filters?.channel) {
    query = query.eq('channel', filters.channel);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.date_from) {
    query = query.gte('channel_created_at', filters.date_from);
  }
  if (filters?.date_to) {
    query = query.lte('channel_created_at', filters.date_to);
  }

  const { data, count } = await query
    .order('channel_created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  return {
    orders: data as UnifiedOrder[],
    total: count || 0,
  };
}

// =====================
// CHANNEL LISTINGS
// =====================

export async function getChannelListings(
  limit: number = 50,
  offset: number = 0,
  filters?: {
    channel?: string;
    status?: string;
  }
): Promise<{ listings: ChannelListing[]; total: number }> {
  let query = supabase
    .from('platform_listings')
    .select('*,products(title,images)', { count: 'exact' });

  if (filters?.channel) {
    query = query.eq('platform', filters.channel);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, count } = await query
    .order('synced_at', { ascending: false })
    .range(offset, offset + limit - 1);

  return {
    listings: data as ChannelListing[],
    total: count || 0,
  };
}

// =====================
// CHANNEL STATUS
// =====================

export async function getChannelsStatus(): Promise<
  Record<
    string,
    {
      name: string;
      configured: boolean;
      active: boolean;
      listings_count: number;
      last_sync: string | null;
      monthly_revenue: number;
    }
  >
> {
  const { data: configs } = await getSupabaseClient().from('channel_configs').select('*');

  const channels: Record<string, any> = {
    shopify: { name: 'Shopify', configured: !!process.env.SHOPIFY_ACCESS_TOKEN },
    ebay: { name: 'eBay', configured: !!process.env.EBAY_AUTH_TOKEN },
    tiktok: { name: 'TikTok Shop', configured: !!process.env.TIKTOK_SHOP_TOKEN },
    google: {
      name: 'Google Shopping',
      configured: !!process.env.GOOGLE_MERCHANT_ID,
    },
  };

  for (const channel of Object.keys(channels)) {
    const config = configs?.find(c => c.channel === channel);
    channels[channel].active = config?.is_enabled || false;
    channels[channel].last_sync = config?.last_sync_at;

    const { count } = await supabase
      .from('platform_listings')
      .select('*', { count: 'exact', head: true })
      .eq('platform', channel);

    channels[channel].listings_count = count || 0;

    // Get monthly revenue from orders
    const { data: orders } = await supabase
      .from('unified_orders')
      .select('total')
      .eq('channel', channel)
      .gte(
        'channel_created_at',
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      );

    channels[channel].monthly_revenue = (orders || []).reduce(
      (sum, order) => sum + (order.total || 0),
      0
    );
  }

  return channels;
}
