/**
 * API Route: POST /api/membership/reactivate
 * Reactivates a membership that was set to cancel
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { reactivateSubscription } from '@/lib/stripe-products';
import { getMembershipDetails, clearMembershipCache } from '@/lib/member-detection';

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

    // Get membership
    const membership = await getMembershipDetails(userId);

    if (!membership) {
      return NextResponse.json(
        { error: 'No membership found' },
        { status: 404 }
      );
    }

    if (!membership.cancel_at_period_end) {
      return NextResponse.json(
        { error: 'Membership is not scheduled to cancel' },
        { status: 400 }
      );
    }

    if (!['active', 'trialing'].includes(membership.status)) {
      return NextResponse.json(
        { error: 'Cannot reactivate non-active membership' },
        { status: 400 }
      );
    }

    // Reactivate subscription
    const updated = await reactivateSubscription(membership.stripe_subscription_id);

    // Clear cache to reflect changes
    clearMembershipCache(userId);

    // Return updated membership status
    return NextResponse.json({
      id: membership.id,
      status: updated.status,
      tier: updated.tier,
      currentPeriodStart: updated.currentPeriodStart.toISOString(),
      currentPeriodEnd: updated.currentPeriodEnd.toISOString(),
      cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
      canceledAt: updated.canceledAt?.toISOString() || null,
      stripeCustomerId: membership.stripe_customer_id,
    });
  } catch (error) {
    console.error('[api/membership/reactivate] Error:', error);
    return NextResponse.json(
      { error: 'Failed to reactivate membership' },
      { status: 500 }
    );
  }
}
