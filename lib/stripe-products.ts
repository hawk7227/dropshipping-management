/**
 * Stripe Products & Pricing Management
 * Membership tiers: Monthly ($9.99/mo) and Annual ($99/yr)
 * 
 * Features:
 * - Product and price creation/retrieval
 * - Checkout session management
 * - Billing portal integration
 * - Subscription lifecycle management
 */

import Stripe from 'stripe';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
  typescript: true,
});

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface MembershipTier {
  id: 'monthly' | 'annual';
  name: string;
  shortName: string;
  description: string;
  interval: 'month' | 'year';
  intervalCount: number;
  price: number;
  priceFormatted: string;
  monthlyEquivalent: string;
  features: string[];
  savings?: string;
  popular?: boolean;
}

export interface StripeProductIds {
  productId: string;
  monthlyPriceId: string;
  annualPriceId: string;
}

export interface CreateCheckoutParams {
  tier: 'monthly' | 'annual';
  userId: string;
  userEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  sessionId: string;
  url: string;
}

export interface CustomerSubscription {
  id: string;
  status: Stripe.Subscription.Status;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  tier: 'monthly' | 'annual';
  priceId: string;
  customerId: string;
}

// ============================================================================
// MEMBERSHIP TIER CONFIGURATION
// ============================================================================

export const MEMBERSHIP_TIERS: Record<string, MembershipTier> = {
  monthly: {
    id: 'monthly',
    name: 'Monthly Membership',
    shortName: 'Monthly',
    description: 'Flexible month-to-month membership',
    interval: 'month',
    intervalCount: 1,
    price: 999,
    priceFormatted: '$9.99',
    monthlyEquivalent: '$9.99/mo',
    features: [
      'Pay $0 on every product',
      'Access wholesale pricing',
      'Free shipping on orders over $35',
      'Member-exclusive deals',
      'Cancel anytime',
    ],
  },
  annual: {
    id: 'annual',
    name: 'Annual Membership',
    shortName: 'Annual',
    description: 'Best value with annual savings',
    interval: 'year',
    intervalCount: 1,
    price: 9900,
    priceFormatted: '$99.00',
    monthlyEquivalent: '$8.25/mo',
    features: [
      'Pay $0 on every product',
      'Access wholesale pricing',
      'Free shipping on orders over $35',
      'Member-exclusive deals',
      'Early access to new products',
      'Priority customer support',
    ],
    savings: 'Save $20.88 vs monthly',
    popular: true,
  },
};

// ============================================================================
// PRODUCT & PRICE MANAGEMENT
// ============================================================================

/**
 * Initialize Stripe products and prices for membership tiers
 * Run this once during initial setup
 */
export async function initializeStripeProducts(): Promise<StripeProductIds> {
  console.log('[stripe-products] Initializing Stripe products...');

  // Check for existing membership product
  const existingProducts = await stripe.products.list({
    active: true,
    limit: 100,
  });

  let product = existingProducts.data.find(
    (p) => p.metadata?.type === 'membership'
  );

  // Create product if not exists
  if (!product) {
    console.log('[stripe-products] Creating membership product...');
    product = await stripe.products.create({
      name: 'Premium Membership',
      description: 'Access wholesale prices and pay $0 at checkout on every order',
      metadata: {
        type: 'membership',
      },
      tax_code: 'txcd_10000000', // General services
    });
    console.log('[stripe-products] Product created:', product.id);
  } else {
    console.log('[stripe-products] Product exists:', product.id);
  }

  // Get existing prices
  const existingPrices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 10,
  });

  // Create or find monthly price
  let monthlyPrice = existingPrices.data.find(
    (p) => p.recurring?.interval === 'month' && p.unit_amount === 999
  );

  if (!monthlyPrice) {
    console.log('[stripe-products] Creating monthly price...');
    monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 999,
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
      metadata: {
        tier: 'monthly',
      },
    });
    console.log('[stripe-products] Monthly price created:', monthlyPrice.id);
  }

  // Create or find annual price
  let annualPrice = existingPrices.data.find(
    (p) => p.recurring?.interval === 'year' && p.unit_amount === 9900
  );

  if (!annualPrice) {
    console.log('[stripe-products] Creating annual price...');
    annualPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 9900,
      currency: 'usd',
      recurring: {
        interval: 'year',
      },
      metadata: {
        tier: 'annual',
      },
    });
    console.log('[stripe-products] Annual price created:', annualPrice.id);
  }

  const result = {
    productId: product.id,
    monthlyPriceId: monthlyPrice.id,
    annualPriceId: annualPrice.id,
  };

  console.log('[stripe-products] Initialization complete:', result);
  return result;
}

/**
 * Get price ID for a tier
 */
export function getPriceId(tier: 'monthly' | 'annual'): string {
  const priceId =
    tier === 'monthly'
      ? process.env.STRIPE_MONTHLY_PRICE_ID
      : process.env.STRIPE_ANNUAL_PRICE_ID;

  if (!priceId) {
    throw new Error(`Missing Stripe price ID for tier: ${tier}`);
  }

  return priceId;
}

// ============================================================================
// CHECKOUT SESSION MANAGEMENT
// ============================================================================

/**
 * Create a Stripe Checkout session for membership subscription
 */
export async function createCheckoutSession(
  params: CreateCheckoutParams
): Promise<CheckoutResult> {
  console.log('[stripe-products] Creating checkout session:', params.tier);

  const priceId = getPriceId(params.tier);

  // Check for existing customer
  const existingCustomers = await stripe.customers.list({
    email: params.userEmail,
    limit: 1,
  });

  let customerId: string | undefined;

  if (existingCustomers.data.length > 0) {
    customerId = existingCustomers.data[0].id;

    // Update customer metadata with user ID
    await stripe.customers.update(customerId, {
      metadata: {
        user_id: params.userId,
      },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    customer: customerId,
    customer_email: customerId ? undefined : params.userEmail,
    success_url: `${params.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: params.cancelUrl,
    metadata: {
      user_id: params.userId,
      tier: params.tier,
    },
    subscription_data: {
      metadata: {
        user_id: params.userId,
        tier: params.tier,
      },
    },
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    customer_creation: customerId ? undefined : 'always',
  });

  console.log('[stripe-products] Checkout session created:', session.id);

  return {
    sessionId: session.id,
    url: session.url!,
  };
}

/**
 * Retrieve a checkout session by ID
 */
export async function getCheckoutSession(
  sessionId: string
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'customer'],
  });
}

// ============================================================================
// BILLING PORTAL
// ============================================================================

/**
 * Create a Stripe Billing Portal session
 */
export async function createPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string> {
  console.log('[stripe-products] Creating portal session for:', customerId);

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session.url;
}

// ============================================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================================

/**
 * Get subscription by ID
 */
export async function getSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['default_payment_method', 'latest_invoice'],
  });
}

/**
 * Get active subscription for a customer
 */
export async function getCustomerActiveSubscription(
  customerId: string
): Promise<CustomerSubscription | null> {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 1,
    expand: ['data.default_payment_method'],
  });

  const sub = subscriptions.data[0];
  if (!sub) return null;

  return formatSubscription(sub);
}

/**
 * Cancel subscription at period end
 */
export async function cancelSubscription(
  subscriptionId: string
): Promise<CustomerSubscription> {
  console.log('[stripe-products] Canceling subscription:', subscriptionId);

  const subscription = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });

  return formatSubscription(subscription);
}

/**
 * Reactivate a subscription that was set to cancel
 */
export async function reactivateSubscription(
  subscriptionId: string
): Promise<CustomerSubscription> {
  console.log('[stripe-products] Reactivating subscription:', subscriptionId);

  const subscription = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });

  return formatSubscription(subscription);
}

/**
 * Change subscription tier (upgrade/downgrade)
 */
export async function changeSubscriptionTier(
  subscriptionId: string,
  newTier: 'monthly' | 'annual'
): Promise<CustomerSubscription> {
  console.log('[stripe-products] Changing subscription tier to:', newTier);

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const newPriceId = getPriceId(newTier);

  const updated = await stripe.subscriptions.update(subscriptionId, {
    items: [
      {
        id: subscription.items.data[0].id,
        price: newPriceId,
      },
    ],
    proration_behavior: 'create_prorations',
    metadata: {
      tier: newTier,
    },
  });

  return formatSubscription(updated);
}

/**
 * Format Stripe subscription to our interface
 */
function formatSubscription(sub: Stripe.Subscription): CustomerSubscription {
  const priceId = sub.items.data[0]?.price.id;
  const monthlyPriceId = process.env.STRIPE_MONTHLY_PRICE_ID;

  return {
    id: sub.id,
    status: sub.status,
    currentPeriodStart: new Date(sub.current_period_start * 1000),
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
    tier: priceId === monthlyPriceId ? 'monthly' : 'annual',
    priceId: priceId || '',
    customerId: sub.customer as string,
  };
}

// ============================================================================
// CUSTOMER MANAGEMENT
// ============================================================================

/**
 * Get or create Stripe customer
 */
export async function getOrCreateCustomer(
  email: string,
  userId: string,
  name?: string
): Promise<Stripe.Customer> {
  // Check for existing customer
  const existing = await stripe.customers.list({
    email,
    limit: 1,
  });

  if (existing.data.length > 0) {
    // Update metadata
    return stripe.customers.update(existing.data[0].id, {
      metadata: { user_id: userId },
      name: name || existing.data[0].name || undefined,
    });
  }

  // Create new customer
  return stripe.customers.create({
    email,
    name,
    metadata: { user_id: userId },
  });
}

/**
 * Get customer by ID
 */
export async function getCustomer(
  customerId: string
): Promise<Stripe.Customer | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    return customer as Stripe.Customer;
  } catch {
    return null;
  }
}

/**
 * Get customer invoices
 */
export async function getCustomerInvoices(
  customerId: string,
  limit: number = 12
): Promise<Stripe.Invoice[]> {
  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit,
  });

  return invoices.data;
}

/**
 * Get customer's default payment method
 */
export async function getDefaultPaymentMethod(
  customerId: string
): Promise<Stripe.PaymentMethod | null> {
  const customer = await stripe.customers.retrieve(customerId);

  if (customer.deleted) return null;

  const defaultPM = (customer as Stripe.Customer).invoice_settings
    ?.default_payment_method;

  if (!defaultPM) return null;

  if (typeof defaultPM === 'string') {
    return stripe.paymentMethods.retrieve(defaultPM);
  }

  return defaultPM;
}

// ============================================================================
// WEBHOOK SIGNATURE VERIFICATION
// ============================================================================

/**
 * Construct and verify Stripe webhook event
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format amount in cents to display string
 */
export function formatAmount(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/**
 * Format date for display
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/**
 * Get tier details by ID
 */
export function getTierDetails(tierId: 'monthly' | 'annual'): MembershipTier {
  return MEMBERSHIP_TIERS[tierId];
}

// Export stripe instance for direct access if needed
export { stripe };
