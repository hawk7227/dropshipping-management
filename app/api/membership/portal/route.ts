/**
 * API Route: POST /api/membership/portal
 * Creates a Stripe Billing Portal session for subscription management
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createPortalSession } from '@/lib/stripe-products';
import { getMembershipDetails } from '@/lib/member-detection';

export const dynamic = 'force-dynamic';

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

    // Get membership to find Stripe customer ID
    const membership = await getMembershipDetails(userId);

    if (!membership?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No active membership found' },
        { status: 404 }
      );
    }

    // Parse request body for return URL
    const body = await request.json();
    const { returnUrl } = body as { returnUrl?: string };

    // Default return URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const finalReturnUrl = returnUrl || `${baseUrl}/account`;

    // Create portal session
    const portalUrl = await createPortalSession(
      membership.stripe_customer_id,
      finalReturnUrl
    );

    return NextResponse.json({ url: portalUrl });
  } catch (error) {
    console.error('[api/membership/portal] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create billing portal session' },
      { status: 500 }
    );
  }
}
