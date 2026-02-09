/**
 * API Route: GET /api/membership/payment-method
 * Returns the user's default payment method
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getDefaultPaymentMethod } from '@/lib/stripe-products';
import { getMembershipDetails } from '@/lib/member-detection';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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

    // Get membership to find Stripe customer ID
    const membership = await getMembershipDetails(userId);

    if (!membership?.stripe_customer_id) {
      return NextResponse.json(null);
    }

    // Get default payment method from Stripe
    const paymentMethod = await getDefaultPaymentMethod(membership.stripe_customer_id);

    if (!paymentMethod) {
      return NextResponse.json(null);
    }

    // Format payment method for frontend
    const card = paymentMethod.card;

    if (!card) {
      return NextResponse.json(null);
    }

    return NextResponse.json({
      id: paymentMethod.id,
      brand: card.brand,
      last4: card.last4,
      expMonth: card.exp_month,
      expYear: card.exp_year,
    });
  } catch (error) {
    console.error('[api/membership/payment-method] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment method' },
      { status: 500 }
    );
  }
}
