/**
 * API Route: PUT /api/account/notifications
 * Updates user notification preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { preferences } = body;

    // Update notification preferences in user metadata
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        notification_preferences: preferences,
      }
    });

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update notification preferences' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/account/notifications] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update notification preferences' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get notification preferences from user metadata
    const preferences = session.user.user_metadata?.notification_preferences || {
      emailNotifications: true,
      smsNotifications: false,
      marketingEmails: false,
      priceAlerts: true,
      orderUpdates: true,
      membershipRenewals: true,
    };

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error('[api/account/notifications] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notification preferences' },
      { status: 500 }
    );
  }
}
