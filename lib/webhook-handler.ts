/**
 * Stripe Webhook Handler
 * Processes subscription lifecycle events
 * 
 * Events handled:
 * - customer.subscription.created
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - invoice.paid
 * - invoice.payment_failed
 * - checkout.session.completed
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  upsertMembership,
  updateMembershipStatus,
  updateMembershipPeriod,
  MembershipStatus,
  clearMembershipCache,
} from './member-detection';
import { stripe, constructWebhookEvent } from './stripe-products';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type WebhookEventType =
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'checkout.session.completed';

interface WebhookResult {
  success: boolean;
  message: string;
  eventId?: string;
}

// ============================================================================
// STATUS MAPPING
// ============================================================================

/**
 * Map Stripe subscription status to our membership status
 */
function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): MembershipStatus {
  const statusMap: Record<Stripe.Subscription.Status, MembershipStatus> = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'canceled',
    unpaid: 'unpaid',
    incomplete: 'incomplete',
    incomplete_expired: 'incomplete_expired',
    paused: 'canceled',
  };

  return statusMap[stripeStatus] || 'incomplete';
}

/**
 * Determine membership tier from price interval
 */
function getTierFromInterval(interval: string): 'monthly' | 'annual' {
  return interval === 'year' ? 'annual' : 'monthly';
}

// ============================================================================
// USER ID EXTRACTION
// ============================================================================

/**
 * Get user_id from subscription metadata or customer
 */
async function getUserIdFromSubscription(
  subscription: Stripe.Subscription
): Promise<string | null> {
  // Check subscription metadata
  if (subscription.metadata?.user_id) {
    return subscription.metadata.user_id;
  }

  // Check customer metadata
  const customerId = subscription.customer as string;
  const customer = await stripe.customers.retrieve(customerId);

  if ((customer as Stripe.DeletedCustomer).deleted) {
    console.error('[webhook] Customer was deleted');
    return null;
  }

  return (customer as Stripe.Customer).metadata?.user_id || null;
}

/**
 * Get user_id from checkout session
 */
async function getUserIdFromSession(
  session: Stripe.Checkout.Session
): Promise<string | null> {
  // Check session metadata
  if (session.metadata?.user_id) {
    return session.metadata.user_id;
  }

  // Check customer metadata
  if (session.customer) {
    const customer = await stripe.customers.retrieve(session.customer as string);
    if (!(customer as Stripe.DeletedCustomer).deleted) {
      return (customer as Stripe.Customer).metadata?.user_id || null;
    }
  }

  return null;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle subscription created event
 */
async function handleSubscriptionCreated(
  subscription: Stripe.Subscription
): Promise<void> {
  console.log('[webhook] subscription.created:', subscription.id);

  const userId = await getUserIdFromSubscription(subscription);
  if (!userId) {
    console.error('[webhook] No user_id found for subscription');
    return;
  }

  const customer = (await stripe.customers.retrieve(
    subscription.customer as string
  )) as Stripe.Customer;

  const priceItem = subscription.items.data[0];
  const interval = priceItem?.price.recurring?.interval || 'month';

  await upsertMembership({
    user_id: userId,
    email: customer.email || '',
    stripe_customer_id: customer.id,
    stripe_subscription_id: subscription.id,
    status: mapStripeStatus(subscription.status),
    tier: getTierFromInterval(interval),
    current_period_start: new Date(
      subscription.current_period_start * 1000
    ).toISOString(),
    current_period_end: new Date(
      subscription.current_period_end * 1000
    ).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : null,
  });

  console.log('[webhook] Membership created for user:', userId);
}

/**
 * Handle subscription updated event
 */
async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<void> {
  console.log('[webhook] subscription.updated:', subscription.id, '->', subscription.status);

  const userId = await getUserIdFromSubscription(subscription);
  if (!userId) {
    console.error('[webhook] No user_id found for subscription');
    return;
  }

  const customer = (await stripe.customers.retrieve(
    subscription.customer as string
  )) as Stripe.Customer;

  const priceItem = subscription.items.data[0];
  const interval = priceItem?.price.recurring?.interval || 'month';

  await upsertMembership({
    user_id: userId,
    email: customer.email || '',
    stripe_customer_id: customer.id,
    stripe_subscription_id: subscription.id,
    status: mapStripeStatus(subscription.status),
    tier: getTierFromInterval(interval),
    current_period_start: new Date(
      subscription.current_period_start * 1000
    ).toISOString(),
    current_period_end: new Date(
      subscription.current_period_end * 1000
    ).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : null,
  });

  console.log('[webhook] Membership updated for user:', userId);
}

/**
 * Handle subscription deleted event
 */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  console.log('[webhook] subscription.deleted:', subscription.id);

  await updateMembershipStatus(
    subscription.id,
    'canceled',
    false,
    new Date().toISOString()
  );

  console.log('[webhook] Membership canceled for subscription:', subscription.id);
}

/**
 * Handle invoice paid event (subscription renewal)
 */
async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  console.log('[webhook] invoice.paid:', invoice.id);

  if (!invoice.subscription) {
    console.log('[webhook] Invoice not for subscription, skipping');
    return;
  }

  // Retrieve subscription to get updated period dates
  const subscription = await stripe.subscriptions.retrieve(
    invoice.subscription as string
  );

  // Update period dates
  await updateMembershipPeriod(
    subscription.id,
    new Date(subscription.current_period_start * 1000).toISOString(),
    new Date(subscription.current_period_end * 1000).toISOString()
  );

  // Ensure status is active after successful payment
  await updateMembershipStatus(
    subscription.id,
    'active',
    subscription.cancel_at_period_end
  );

  console.log('[webhook] Membership renewed:', subscription.id);
}

/**
 * Handle invoice payment failed event
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  console.log('[webhook] invoice.payment_failed:', invoice.id);

  if (!invoice.subscription) {
    console.log('[webhook] Invoice not for subscription, skipping');
    return;
  }

  // Update status to past_due
  await updateMembershipStatus(invoice.subscription as string, 'past_due', false);

  console.log('[webhook] Payment failed for subscription:', invoice.subscription);

  // TODO: Send payment failed notification email
}

/**
 * Handle checkout session completed event
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  console.log('[webhook] checkout.session.completed:', session.id);

  if (session.mode !== 'subscription') {
    console.log('[webhook] Not a subscription checkout, skipping');
    return;
  }

  const userId = await getUserIdFromSession(session);
  if (!userId) {
    console.log('[webhook] No user_id in checkout session');
    return;
  }

  // The subscription.created event handles the actual membership creation
  // This event can be used for additional actions like:
  // - Sending welcome email
  // - Triggering onboarding flow
  // - Analytics tracking

  console.log('[webhook] Checkout completed for user:', userId);

  // TODO: Send welcome email
}

// ============================================================================
// MAIN WEBHOOK HANDLER
// ============================================================================

/**
 * Process incoming Stripe webhook
 */
export async function handleStripeWebhook(
  request: NextRequest
): Promise<NextResponse> {
  console.log('[webhook] Received webhook request');

  // Get raw body for signature verification
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    console.error('[webhook] Missing stripe-signature header');
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  // Verify webhook signature
  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(body, signature);
    console.log('[webhook] Event verified:', event.type, event.id);
  } catch (error) {
    console.error('[webhook] Signature verification failed:', error);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Process event
  try {
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'checkout.session.completed':
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;

      default:
        console.log('[webhook] Unhandled event type:', event.type);
    }

    return NextResponse.json({ received: true, eventId: event.id });
  } catch (error) {
    console.error('[webhook] Error processing event:', error);

    // Return 200 to prevent Stripe retries for our application errors
    // The error is logged for investigation
    return NextResponse.json(
      { received: true, error: 'Processing error logged' },
      { status: 200 }
    );
  }
}

/**
 * Verify webhook signature without processing (for testing)
 */
export function verifyWebhookSignature(
  body: string,
  signature: string
): Stripe.Event | null {
  try {
    return constructWebhookEvent(body, signature);
  } catch {
    return null;
  }
}

// ============================================================================
// API ROUTE HANDLER
// ============================================================================

/**
 * Next.js API Route export
 * Place this in: app/api/webhooks/stripe/route.ts
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleStripeWebhook(request);
}

// Disable body parsing for raw body access
export const config = {
  api: {
    bodyParser: false,
  },
};
