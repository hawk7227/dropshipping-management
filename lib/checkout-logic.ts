/**
 * Checkout Logic
 * Handles $0 cart for members vs full price for guests
 * 
 * Core concept:
 * - Members pay $0 for products (wholesale cost covered by membership)
 * - Guests pay full retail price
 * - Different free shipping thresholds
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { checkMembership, getMemberBenefits } from './member-detection';
import { stripe } from './stripe-products';

// Initialize Supabase
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

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface CartItem {
  productId: string;
  variantId: string | null;
  quantity: number;
  title: string;
  price: number; // Retail price in cents
  compareAtPrice: number | null;
  imageUrl: string | null;
  sku: string | null;
}

export interface ShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface CheckoutPricing {
  subtotal: number;
  memberDiscount: number;
  shipping: number;
  tax: number;
  total: number;
  isMember: boolean;
  freeShippingEligible: boolean;
  totalSavings: number;
  itemCount: number;
}

export interface CheckoutSession {
  sessionId: string;
  url: string;
  pricing: CheckoutPricing;
}

export interface OrderSummary {
  orderId: string;
  status: string;
  pricing: CheckoutPricing;
  items: CartItem[];
  createdAt: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const SHIPPING_CONFIG = {
  standard: {
    price: 599, // $5.99
    name: 'Standard Shipping',
    estimate: '5-7 business days',
  },
  express: {
    price: 1299, // $12.99
    name: 'Express Shipping',
    estimate: '2-3 business days',
  },
};

const FREE_SHIPPING_MEMBER = 35_00; // $35
const FREE_SHIPPING_GUEST = 75_00; // $75
const TAX_RATE = 0.0875; // 8.75% example rate

// ============================================================================
// PRICING CALCULATION
// ============================================================================

/**
 * Calculate checkout pricing based on membership status
 */
export async function calculatePricing(
  items: CartItem[],
  userId: string | null,
  shippingMethod: 'standard' | 'express' = 'standard'
): Promise<CheckoutPricing> {
  console.log('[checkout] Calculating pricing for', items.length, 'items');

  // Check membership status
  const memberCheck = userId ? await checkMembership(userId) : { isMember: false };
  const isMember = memberCheck.isMember;

  // Calculate retail subtotal
  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  // Calculate item count
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  // Member discount: Members pay $0 for products
  const memberDiscount = isMember ? subtotal : 0;

  // Subtotal after discount
  const subtotalAfterDiscount = subtotal - memberDiscount;

  // Free shipping threshold
  const freeShippingThreshold = isMember
    ? FREE_SHIPPING_MEMBER
    : FREE_SHIPPING_GUEST;

  // Calculate shipping
  const freeShippingEligible = subtotal >= freeShippingThreshold;
  const shippingRate = SHIPPING_CONFIG[shippingMethod];
  const shipping = freeShippingEligible ? 0 : shippingRate.price;

  // Calculate tax on discounted subtotal
  const tax = Math.round(subtotalAfterDiscount * TAX_RATE);

  // Total
  const total = subtotalAfterDiscount + shipping + tax;

  // Calculate total savings
  const compareAtSavings = items.reduce((sum, item) => {
    if (item.compareAtPrice && item.compareAtPrice > item.price) {
      return sum + (item.compareAtPrice - item.price) * item.quantity;
    }
    return sum;
  }, 0);

  const shippingSavings = freeShippingEligible ? shippingRate.price : 0;
  const totalSavings = memberDiscount + compareAtSavings + shippingSavings;

  const pricing: CheckoutPricing = {
    subtotal,
    memberDiscount,
    shipping,
    tax,
    total,
    isMember,
    freeShippingEligible,
    totalSavings,
    itemCount,
  };

  console.log('[checkout] Pricing:', {
    subtotal: subtotal / 100,
    discount: memberDiscount / 100,
    total: total / 100,
    isMember,
  });

  return pricing;
}

/**
 * Get price display for an item (shows member vs non-member price)
 */
export function getItemPriceDisplay(
  item: CartItem,
  isMember: boolean
): {
  displayPrice: number;
  originalPrice: number;
  savings: number;
  label: string;
} {
  if (isMember) {
    return {
      displayPrice: 0,
      originalPrice: item.price,
      savings: item.price,
      label: 'Member Price',
    };
  }

  return {
    displayPrice: item.price,
    originalPrice: item.compareAtPrice || item.price,
    savings: item.compareAtPrice ? item.compareAtPrice - item.price : 0,
    label: 'Price',
  };
}

// ============================================================================
// CHECKOUT SESSIONS
// ============================================================================

/**
 * Create Stripe checkout session for order
 */
export async function createOrderCheckout(params: {
  items: CartItem[];
  userId: string | null;
  customerEmail: string;
  shippingMethod?: 'standard' | 'express';
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutSession> {
  console.log('[checkout] Creating checkout session');

  const {
    items,
    userId,
    customerEmail,
    shippingMethod = 'standard',
    successUrl,
    cancelUrl,
  } = params;

  // Calculate pricing
  const pricing = await calculatePricing(items, userId, shippingMethod);

  // Build line items
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  if (pricing.isMember) {
    // Member checkout: Show as "$0 Member Order"
    if (pricing.total === 0) {
      // Completely free order - add a $0 line item for record keeping
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Member Order',
            description: `${pricing.itemCount} item${pricing.itemCount > 1 ? 's' : ''} at member pricing`,
          },
          unit_amount: 0,
        },
        quantity: 1,
      });
    } else {
      // Has shipping/tax - add those as line items
      if (pricing.shipping > 0) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: SHIPPING_CONFIG[shippingMethod].name,
              description: SHIPPING_CONFIG[shippingMethod].estimate,
            },
            unit_amount: pricing.shipping,
          },
          quantity: 1,
        });
      }
    }
  } else {
    // Guest checkout: Show individual items
    for (const item of items) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.title,
            images: item.imageUrl ? [item.imageUrl] : undefined,
          },
          unit_amount: item.price,
        },
        quantity: item.quantity,
      });
    }

    // Add shipping for guests if not free
    if (pricing.shipping > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: SHIPPING_CONFIG[shippingMethod].name,
            description: SHIPPING_CONFIG[shippingMethod].estimate,
          },
          unit_amount: pricing.shipping,
        },
        quantity: 1,
      });
    }
  }

  // For $0 orders, we handle differently
  if (pricing.total === 0 && pricing.isMember) {
    // Create free order directly without Stripe
    const orderId = await createFreeOrder({
      items,
      userId: userId!,
      email: customerEmail,
      pricing,
    });

    return {
      sessionId: `free_${orderId}`,
      url: `${successUrl}?order_id=${orderId}&free=true`,
      pricing,
    };
  }

  // Create Stripe checkout session
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: lineItems,
    customer_email: customerEmail,
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    shipping_address_collection: {
      allowed_countries: ['US'],
    },
    metadata: {
      user_id: userId || 'guest',
      is_member: pricing.isMember ? 'true' : 'false',
      item_count: pricing.itemCount.toString(),
      subtotal: pricing.subtotal.toString(),
      member_discount: pricing.memberDiscount.toString(),
      items_json: JSON.stringify(
        items.map((i) => ({
          id: i.productId,
          qty: i.quantity,
          price: i.price,
        }))
      ),
    },
  });

  console.log('[checkout] Session created:', session.id);

  return {
    sessionId: session.id,
    url: session.url!,
    pricing,
  };
}

/**
 * Create order for $0 member checkout (bypass Stripe)
 */
async function createFreeOrder(params: {
  items: CartItem[];
  userId: string;
  email: string;
  pricing: CheckoutPricing;
}): Promise<string> {
  console.log('[checkout] Creating free member order');

  const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const { error } = await getSupabaseClient().from('orders').insert({
    id: orderId,
    user_id: params.userId,
    email: params.email,
    status: 'confirmed',
    subtotal: params.pricing.subtotal,
    member_discount: params.pricing.memberDiscount,
    shipping: params.pricing.shipping,
    tax: params.pricing.tax,
    total: params.pricing.total,
    is_member_order: true,
    items: params.items.map((item) => ({
      product_id: item.productId,
      variant_id: item.variantId,
      title: item.title,
      quantity: item.quantity,
      price: item.price,
      sku: item.sku,
    })),
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[checkout] Failed to create free order:', error);
    throw error;
  }

  console.log('[checkout] Free order created:', orderId);
  return orderId;
}

/**
 * Process completed Stripe checkout
 */
export async function processCompletedCheckout(
  sessionId: string
): Promise<OrderSummary> {
  console.log('[checkout] Processing completed checkout:', sessionId);

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['line_items', 'shipping_details'],
  });

  if (session.payment_status !== 'paid') {
    throw new Error('Payment not completed');
  }

  const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const metadata = session.metadata || {};

  // Parse items from metadata
  let items: CartItem[] = [];
  try {
    const itemsData = JSON.parse(metadata.items_json || '[]');
    items = itemsData.map((i: any) => ({
      productId: i.id,
      variantId: null,
      quantity: i.qty,
      title: '',
      price: i.price,
      compareAtPrice: null,
      imageUrl: null,
      sku: null,
    }));
  } catch {
    console.error('[checkout] Failed to parse items metadata');
  }

  // Build shipping address
  const shippingDetails = session.shipping_details;
  const shippingAddress: ShippingAddress | null = shippingDetails?.address
    ? {
        name: shippingDetails.name || '',
        line1: shippingDetails.address.line1 || '',
        line2: shippingDetails.address.line2 || undefined,
        city: shippingDetails.address.city || '',
        state: shippingDetails.address.state || '',
        postalCode: shippingDetails.address.postal_code || '',
        country: shippingDetails.address.country || 'US',
      }
    : null;

  // Create order in database
  const { error } = await getSupabaseClient().from('orders').insert({
    id: orderId,
    user_id: metadata.user_id !== 'guest' ? metadata.user_id : null,
    email: session.customer_email || session.customer_details?.email || '',
    status: 'confirmed',
    subtotal: parseInt(metadata.subtotal || '0'),
    member_discount: parseInt(metadata.member_discount || '0'),
    shipping: 0,
    tax: 0,
    total: session.amount_total || 0,
    is_member_order: metadata.is_member === 'true',
    shipping_address: shippingAddress,
    stripe_session_id: sessionId,
    stripe_payment_intent_id: session.payment_intent as string,
    items,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[checkout] Failed to create order:', error);
    throw error;
  }

  const pricing: CheckoutPricing = {
    subtotal: parseInt(metadata.subtotal || '0'),
    memberDiscount: parseInt(metadata.member_discount || '0'),
    shipping: 0,
    tax: 0,
    total: session.amount_total || 0,
    isMember: metadata.is_member === 'true',
    freeShippingEligible: true,
    totalSavings: parseInt(metadata.member_discount || '0'),
    itemCount: parseInt(metadata.item_count || '0'),
  };

  console.log('[checkout] Order created:', orderId);

  return {
    orderId,
    status: 'confirmed',
    pricing,
    items,
    createdAt: new Date().toISOString(),
  };
}

// ============================================================================
// CART VALIDATION
// ============================================================================

/**
 * Validate cart items before checkout
 */
export async function validateCart(items: CartItem[]): Promise<{
  valid: boolean;
  errors: string[];
  updatedItems: CartItem[];
}> {
  console.log('[checkout] Validating', items.length, 'cart items');

  const errors: string[] = [];
  const updatedItems: CartItem[] = [];

  for (const item of items) {
    // Fetch current product data
    const { data: product, error } = await getSupabaseClient()
      .from('products')
      .select('*')
      .eq('id', item.productId)
      .single();

    if (error || !product) {
      errors.push(`"${item.title}" is no longer available`);
      continue;
    }

    if (!product.active) {
      errors.push(`"${item.title}" is no longer available`);
      continue;
    }

    // Check inventory
    if (product.inventory_quantity !== null) {
      if (product.inventory_quantity === 0) {
        errors.push(`"${item.title}" is out of stock`);
        continue;
      }
      if (product.inventory_quantity < item.quantity) {
        errors.push(
          `Only ${product.inventory_quantity} of "${item.title}" available`
        );
        item.quantity = product.inventory_quantity;
      }
    }

    // Update price if changed
    if (product.price !== item.price) {
      item.price = product.price;
    }

    updatedItems.push(item);
  }

  return {
    valid: errors.length === 0,
    errors,
    updatedItems,
  };
}

// ============================================================================
// MEMBERSHIP UPSELL
// ============================================================================

/**
 * Get membership upsell data for non-member checkout
 */
export function getMembershipUpsell(
  pricing: CheckoutPricing
): {
  potentialSavings: number;
  membershipCost: number;
  worthIt: boolean;
  breakEvenOrders: number;
} {
  const monthlyMembership = 999; // $9.99

  // How much would they save on this order
  const potentialSavings = pricing.subtotal;

  // Is membership worth it for this order alone?
  const worthIt = potentialSavings >= monthlyMembership;

  // How many orders at this value to break even
  const breakEvenOrders =
    potentialSavings > 0 ? Math.ceil(monthlyMembership / potentialSavings) : 99;

  return {
    potentialSavings,
    membershipCost: monthlyMembership,
    worthIt,
    breakEvenOrders,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format price for display
 */
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/**
 * Get shipping options with prices
 */
export function getShippingOptions(
  subtotal: number,
  isMember: boolean
): Array<{
  id: 'standard' | 'express';
  name: string;
  price: number;
  estimate: string;
  isFree: boolean;
}> {
  const threshold = isMember ? FREE_SHIPPING_MEMBER : FREE_SHIPPING_GUEST;
  const freeShipping = subtotal >= threshold;

  return [
    {
      id: 'standard' as const,
      name: SHIPPING_CONFIG.standard.name,
      price: freeShipping ? 0 : SHIPPING_CONFIG.standard.price,
      estimate: SHIPPING_CONFIG.standard.estimate,
      isFree: freeShipping,
    },
    {
      id: 'express' as const,
      name: SHIPPING_CONFIG.express.name,
      price: SHIPPING_CONFIG.express.price,
      estimate: SHIPPING_CONFIG.express.estimate,
      isFree: false,
    },
  ];
}

export { SHIPPING_CONFIG, FREE_SHIPPING_MEMBER, FREE_SHIPPING_GUEST, TAX_RATE };
