// lib/multichannel.ts
// Multi-Channel: eBay sync, TikTok Shop, Google Merchant, order routing

import { createClient } from '@supabase/supabase-js';
import type { ChannelConfig, ChannelListing, UnifiedOrder, OrderRoutingRule } from '@/types/database';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Channel credentials
const EBAY_AUTH_TOKEN = process.env.EBAY_AUTH_TOKEN || '';
const EBAY_SANDBOX = process.env.EBAY_SANDBOX === 'true';
const TIKTOK_SHOP_TOKEN = process.env.TIKTOK_SHOP_ACCESS_TOKEN || '';
const TIKTOK_SHOP_ID = process.env.TIKTOK_SHOP_ID || '';
const GOOGLE_MERCHANT_ID = process.env.GOOGLE_MERCHANT_ID || '';

const EBAY_API_BASE = EBAY_SANDBOX 
  ? 'https://api.sandbox.ebay.com'
  : 'https://api.ebay.com';

// =====================
// EBAY INTEGRATION
// =====================

async function ebayRequest<T>(endpoint: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!EBAY_AUTH_TOKEN) throw new Error('eBay auth token not configured');

  const response = await fetch(`${EBAY_API_BASE}${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${EBAY_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`eBay API error: ${response.status} - ${error}`);
  }

  return response.json();
}

// Create eBay listing
export async function createEbayListing(product: {
  title: string;
  description: string;
  price: number;
  quantity: number;
  sku: string;
  images: string[];
  categoryId: string;
}): Promise<{ listingId: string }> {
  // Create inventory item
  await ebayRequest(`/sell/inventory/v1/inventory_item/${product.sku}`, {
    method: 'PUT',
    body: {
      availability: { shipToLocationAvailability: { quantity: product.quantity } },
      condition: 'NEW',
      product: {
        title: product.title,
        description: product.description,
        imageUrls: product.images,
      },
    },
  });

  // Create offer
  const offer = await ebayRequest<{ offerId: string }>('/sell/inventory/v1/offer', {
    method: 'POST',
    body: {
      sku: product.sku,
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      listingDescription: product.description,
      availableQuantity: product.quantity,
      pricingSummary: { price: { value: product.price.toString(), currency: 'USD' } },
      categoryId: product.categoryId,
    },
  });

  // Publish offer
  const publish = await ebayRequest<{ listingId: string }>(
    `/sell/inventory/v1/offer/${offer.offerId}/publish`,
    { method: 'POST' }
  );

  return { listingId: publish.listingId };
}

// Get eBay orders
export async function getEbayOrders(options: { limit?: number; offset?: number } = {}): Promise<UnifiedOrder[]> {
  const params = new URLSearchParams({
    limit: (options.limit || 50).toString(),
    offset: (options.offset || 0).toString(),
  });

  const response = await ebayRequest<{ orders: any[] }>(`/sell/fulfillment/v1/order?${params}`);

  return (response.orders || []).map((o: any) => ({
    id: crypto.randomUUID(),
    channel: 'ebay' as const,
    channel_order_id: o.orderId,
    status: o.orderFulfillmentStatus === 'FULFILLED' ? 'shipped' : 'pending',
    customer_name: o.buyer?.username || null,
    customer_email: null,
    customer_phone: null,
    shipping_name: o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.fullName || null,
    shipping_address1: o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.contactAddress?.addressLine1 || null,
    shipping_address2: o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.contactAddress?.addressLine2 || null,
    shipping_city: o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.contactAddress?.city || null,
    shipping_state: o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.contactAddress?.stateOrProvince || null,
    shipping_postal: o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.contactAddress?.postalCode || null,
    shipping_country: o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.contactAddress?.countryCode || null,
    subtotal: parseFloat(o.pricingSummary?.total?.value || '0'),
    shipping_cost: 0,
    tax: 0,
    total: parseFloat(o.pricingSummary?.total?.value || '0'),
    items: (o.lineItems || []).map((item: any) => ({
      product_id: item.legacyItemId,
      sku: item.sku,
      title: item.title,
      quantity: item.quantity,
      price: parseFloat(item.lineItemCost?.value || '0'),
    })),
    tracking_number: null,
    tracking_carrier: null,
    fulfilled_at: null,
    channel_created_at: o.creationDate,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
}

// =====================
// TIKTOK SHOP INTEGRATION
// =====================

async function tiktokRequest<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!TIKTOK_SHOP_TOKEN || !TIKTOK_SHOP_ID) {
    throw new Error('TikTok Shop credentials not configured');
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params = new URLSearchParams({
    app_key: process.env.TIKTOK_APP_KEY || '',
    timestamp,
    shop_id: TIKTOK_SHOP_ID,
    access_token: TIKTOK_SHOP_TOKEN,
  });

  const response = await fetch(`https://open-api.tiktokglobalshop.com${path}?${params}`, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) throw new Error(`TikTok API error: ${response.status}`);
  return response.json();
}

// Create TikTok Shop product
export async function createTikTokProduct(product: {
  name: string;
  description: string;
  categoryId: string;
  images: string[];
  price: number;
  stock: number;
}): Promise<{ productId: string }> {
  const response = await tiktokRequest<{ data: { product_id: string } }>('/api/products/create', {
    method: 'POST',
    body: {
      product_name: product.name,
      description: product.description,
      category_id: product.categoryId,
      images: product.images.map(uri => ({ uri })),
      skus: [{
        stock_info: { available_stock: product.stock },
        price_info: { currency: 'USD', price: product.price.toString() },
      }],
    },
  });

  return { productId: response.data.product_id };
}

// Get TikTok orders
export async function getTikTokOrders(): Promise<UnifiedOrder[]> {
  const response = await tiktokRequest<{ data: { order_list: any[] } }>('/api/orders/search', {
    method: 'POST',
    body: { page_size: 50 },
  });

  return (response.data?.order_list || []).map((o: any) => ({
    id: crypto.randomUUID(),
    channel: 'tiktok' as const,
    channel_order_id: o.order_id,
    status: o.order_status === 'DELIVERED' ? 'delivered' : o.order_status === 'SHIPPED' ? 'shipped' : 'pending',
    customer_name: o.recipient_address?.name || null,
    customer_email: null,
    customer_phone: o.recipient_address?.phone || null,
    shipping_name: o.recipient_address?.name || null,
    shipping_address1: o.recipient_address?.address_line || null,
    shipping_address2: null,
    shipping_city: o.recipient_address?.city || null,
    shipping_state: o.recipient_address?.state || null,
    shipping_postal: o.recipient_address?.postal_code || null,
    shipping_country: o.recipient_address?.country || null,
    subtotal: parseFloat(o.payment_info?.total_amount || '0'),
    shipping_cost: 0,
    tax: 0,
    total: parseFloat(o.payment_info?.total_amount || '0'),
    items: (o.item_list || []).map((item: any) => ({
      product_id: item.product_id,
      sku: item.sku_id,
      title: item.product_name,
      quantity: item.quantity,
      price: parseFloat(item.sku_sale_price || '0'),
    })),
    tracking_number: null,
    tracking_carrier: null,
    fulfilled_at: null,
    channel_created_at: new Date(o.create_time * 1000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
}

// =====================
// GOOGLE MERCHANT CENTER
// =====================

// Generate Google Shopping feed
export async function generateGoogleFeed(products: Array<{
  id: string;
  title: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  imageUrl: string;
  sku?: string;
  barcode?: string;
  vendor?: string;
  inventory: number;
  handle: string;
}>): Promise<string> {
  const storeUrl = process.env.NEXT_PUBLIC_STORE_URL || 'https://example.com';

  const items = products.map(p => ({
    'g:id': p.sku || p.id,
    'g:title': p.title,
    'g:description': p.description.replace(/<[^>]*>/g, ''),
    'g:link': `${storeUrl}/products/${p.handle}`,
    'g:image_link': p.imageUrl,
    'g:availability': p.inventory > 0 ? 'in_stock' : 'out_of_stock',
    'g:price': `${p.price.toFixed(2)} USD`,
    ...(p.compareAtPrice && p.compareAtPrice > p.price ? {
      'g:sale_price': `${p.price.toFixed(2)} USD`,
      'g:price': `${p.compareAtPrice.toFixed(2)} USD`,
    } : {}),
    'g:brand': p.vendor || '',
    'g:gtin': p.barcode || '',
    'g:condition': 'new',
  }));

  // Generate XML feed
  const xmlItems = items.map(item => {
    const entries = Object.entries(item)
      .filter(([, v]) => v)
      .map(([k, v]) => `<${k}>${escapeXml(String(v))}</${k}>`)
      .join('\n      ');
    return `    <item>\n      ${entries}\n    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Product Feed</title>
    <link>${storeUrl}</link>
    <description>Product catalog</description>
${xmlItems}
  </channel>
</rss>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// =====================
// CHANNEL LISTINGS
// =====================

// Sync product to a channel
export async function syncProductToChannel(
  productId: string,
  channel: string,
  listingData: { price: number; quantity: number }
): Promise<ChannelListing> {
  // Get product from database
  const { data: product, error } = await supabase
    .from('products')
    .select('*, variants(*)')
    .eq('id', productId)
    .single();

  if (error || !product) throw new Error('Product not found');

  let channelListingId: string;

  switch (channel) {
    case 'ebay':
      const ebayResult = await createEbayListing({
        title: product.title,
        description: product.body_html || product.title,
        price: listingData.price,
        quantity: listingData.quantity,
        sku: product.variants?.[0]?.sku || product.id,
        images: product.images?.map((i: any) => i.src) || [],
        categoryId: '9355', // Default category
      });
      channelListingId = ebayResult.listingId;
      break;

    case 'tiktok':
      const tiktokResult = await createTikTokProduct({
        name: product.title,
        description: product.body_html || product.title,
        categoryId: '1',
        images: product.images?.map((i: any) => i.src) || [],
        price: listingData.price,
        stock: listingData.quantity,
      });
      channelListingId = tiktokResult.productId;
      break;

    default:
      throw new Error(`Unsupported channel: ${channel}`);
  }

  // Save listing to database
  const { data: listing, error: listingError } = await supabase
    .from('channel_listings')
    .upsert({
      product_id: productId,
      channel,
      channel_listing_id: channelListingId,
      status: 'active',
      price: listingData.price,
      quantity: listingData.quantity,
      last_synced_at: new Date().toISOString(),
    }, { onConflict: 'channel,channel_listing_id' })
    .select()
    .single();

  if (listingError) throw listingError;
  return listing;
}

// Get channel listings
export async function getChannelListings(options: {
  channel?: string;
  productId?: string;
}): Promise<ChannelListing[]> {
  let query = supabase.from('channel_listings').select('*');

  if (options.channel) query = query.eq('channel', options.channel);
  if (options.productId) query = query.eq('product_id', options.productId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// =====================
// UNIFIED ORDERS
// =====================

// Sync orders from all channels
export async function syncAllOrders(): Promise<{ total: number; byChannel: Record<string, number> }> {
  const results: Record<string, number> = {};
  let total = 0;

  // eBay orders
  if (EBAY_AUTH_TOKEN) {
    try {
      const ebayOrders = await getEbayOrders();
      for (const order of ebayOrders) {
        await supabase.from('unified_orders').upsert(order, {
          onConflict: 'channel,channel_order_id',
        });
      }
      results.ebay = ebayOrders.length;
      total += ebayOrders.length;
    } catch (error) {
      console.error('[OrderSync] eBay error:', error);
      results.ebay = 0;
    }
  }

  // TikTok orders
  if (TIKTOK_SHOP_TOKEN) {
    try {
      const tiktokOrders = await getTikTokOrders();
      for (const order of tiktokOrders) {
        await supabase.from('unified_orders').upsert(order, {
          onConflict: 'channel,channel_order_id',
        });
      }
      results.tiktok = tiktokOrders.length;
      total += tiktokOrders.length;
    } catch (error) {
      console.error('[OrderSync] TikTok error:', error);
      results.tiktok = 0;
    }
  }

  return { total, byChannel: results };
}

// Get unified orders
export async function getUnifiedOrders(options: {
  channel?: string;
  status?: string;
  limit?: number;
}): Promise<UnifiedOrder[]> {
  let query = supabase
    .from('unified_orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (options.channel) query = query.eq('channel', options.channel);
  if (options.status) query = query.eq('status', options.status);
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// =====================
// ORDER ROUTING
// =====================

// Create routing rule
export async function createRoutingRule(
  rule: Omit<OrderRoutingRule, 'id' | 'created_at'>
): Promise<OrderRoutingRule> {
  const { data, error } = await supabase
    .from('order_routing_rules')
    .insert(rule)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get routing rules
export async function getRoutingRules(): Promise<OrderRoutingRule[]> {
  const { data, error } = await supabase
    .from('order_routing_rules')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (error) throw error;
  return data || [];
}

// Apply routing rules to an order
export async function routeOrder(order: UnifiedOrder): Promise<{ action: string; params: Record<string, unknown> } | null> {
  const rules = await getRoutingRules();

  for (const rule of rules) {
    if (evaluateConditions(order, rule.conditions)) {
      return { action: rule.action, params: rule.action_params || {} };
    }
  }

  return null;
}

function evaluateConditions(order: UnifiedOrder, conditions: any[]): boolean {
  return conditions.every(cond => {
    const value = (order as any)[cond.field];
    
    switch (cond.operator) {
      case 'equals':
        return value === cond.value;
      case 'contains':
        return String(value).includes(String(cond.value));
      case 'greater_than':
        return Number(value) > Number(cond.value);
      case 'less_than':
        return Number(value) < Number(cond.value);
      case 'in':
        return Array.isArray(cond.value) && cond.value.includes(value);
      default:
        return false;
    }
  });
}

// =====================
// CHANNEL CONFIG
// =====================

// Get channel status
export async function getChannelStatus(): Promise<Record<string, { configured: boolean; lastSync: string | null }>> {
  const { data, error } = await supabase.from('channel_configs').select('*');

  const configs = data || [];
  
  return {
    ebay: {
      configured: !!EBAY_AUTH_TOKEN,
      lastSync: configs.find(c => c.channel === 'ebay')?.last_sync_at || null,
    },
    tiktok: {
      configured: !!(TIKTOK_SHOP_TOKEN && TIKTOK_SHOP_ID),
      lastSync: configs.find(c => c.channel === 'tiktok')?.last_sync_at || null,
    },
    google: {
      configured: !!GOOGLE_MERCHANT_ID,
      lastSync: configs.find(c => c.channel === 'google')?.last_sync_at || null,
    },
  };
}

// Update channel config
export async function updateChannelConfig(
  channel: string,
  updates: Partial<ChannelConfig>
): Promise<void> {
  await supabase
    .from('channel_configs')
    .upsert({ channel, ...updates }, { onConflict: 'channel' });
}

// Wrapper for cron compatibility
export async function syncAllChannelOrders(): Promise<{ synced: number; errors: string[] }> {
  const result = await syncAllOrders();
  const errors: string[] = [];
  
  // Check for channels that might have failed (0 orders when configured)
  if (EBAY_AUTH_TOKEN && result.byChannel.ebay === 0) {
    errors.push('eBay sync returned 0 orders');
  }
  if (TIKTOK_SHOP_TOKEN && result.byChannel.tiktok === 0) {
    errors.push('TikTok sync returned 0 orders');
  }
  
  return {
    synced: result.total,
    errors
  };
}
