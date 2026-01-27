/**
 * API Route: GET /api/membership/status
 * Returns the current user's membership status
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getMembershipDetails, checkMembership } from '@/lib/member-detection';

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

    // Get full membership details
    const membership = await getMembershipDetails(userId);

    if (!membership) {
      return NextResponse.json(null);
    }

    // Get quick check for computed fields
    const check = await checkMembership(userId);

    // Return membership status
    return NextResponse.json({
      id: membership.id,
      status: membership.status,
      tier: membership.tier,
      currentPeriodStart: membership.current_period_start,
      currentPeriodEnd: membership.current_period_end,
      cancelAtPeriodEnd: membership.cancel_at_period_end,
      canceledAt: membership.canceled_at,
      stripeCustomerId: membership.stripe_customer_id,
      isMember: check.isMember,
      daysRemaining: check.daysRemaining,
    });
  } catch (error) {
    console.error('[api/membership/status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch membership status' },
      { status: 500 }
    );
  }
}
