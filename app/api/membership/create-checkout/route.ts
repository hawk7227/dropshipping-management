/**
 * API Route: POST /api/membership/create-checkout
 * Creates a Stripe checkout session for membership signup
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import Stripe from 'stripe';
import { createCheckoutSession, getOrCreateCustomer, MEMBERSHIP_TIERS } from '@/lib/stripe-products';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    if (!userEmail) {
      return NextResponse.json(
        { error: 'User email not found' },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { tier } = body as { tier: 'monthly' | 'annual' };

    // Validate tier
    if (!tier || !MEMBERSHIP_TIERS[tier]) {
      return NextResponse.json(
        { error: 'Invalid membership tier' },
        { status: 400 }
      );
    }

    // Check if user already has an active membership
    const { data: existingMembership } = await supabase
      .from('memberships')
      .select('status')
      .eq('user_id', userId)
      .single();

    if (existingMembership?.status && ['active', 'trialing'].includes(existingMembership.status)) {
      return NextResponse.json(
        { error: 'User already has an active membership' },
        { status: 400 }
      );
    }

    // Check for price IDs to determine checkout method
    const priceId = tier === 'monthly' 
      ? process.env.STRIPE_MONTHLY_PRICE_ID 
      : process.env.STRIPE_ANNUAL_PRICE_ID;

    // Get base URL for redirect
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    if (!priceId) {
      // Fallback: Use hosted Stripe Checkout (redirect flow)
      const checkoutResult = await createCheckoutSession({
        tier,
        userId,
        userEmail,
        successUrl: `${baseUrl}/membership/success`,
        cancelUrl: `${baseUrl}/membership/checkout?canceled=true`,
      });

      return NextResponse.json({
        url: checkoutResult.url,
        sessionId: checkoutResult.sessionId,
      });
    }

    // Primary: Use embedded Stripe Elements (clientSecret flow)
    // Get or create Stripe customer
    const customer = await getOrCreateCustomer(userEmail, userId);

    // Create subscription with incomplete status for embedded payment
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        user_id: userId,
        tier,
      },
    });

    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      subscriptionId: subscription.id,
      customerId: customer.id,
    });
  } catch (error) {
    console.error('[api/membership/create-checkout] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
