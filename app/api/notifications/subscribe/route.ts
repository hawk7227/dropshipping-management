// ============================================================================
// PUSH SUBSCRIPTION API — Register/unregister push subscriptions
// Deploy to: src/app/api/notifications/subscribe/route.ts
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

// POST — Register a push subscription
export async function POST(request: NextRequest) {
  try {
    const { subscription, user_id, user_role, user_name } = await request.json();

    console.log('[SUBSCRIBE] Incoming:', { user_id, user_role, user_name, endpoint: subscription?.endpoint?.slice(0, 50) });

    if (!subscription || !subscription.endpoint || !user_id) {
      return NextResponse.json(
        { success: false, error: 'subscription and user_id required' },
        { status: 400 }
      );
    }

    const keys = subscription.keys || {};

    // Upsert — update if same endpoint exists
    const { data, error } = await getSupabaseClient()
      .from('push_subscriptions')
      .upsert(
        {
          user_id: String(user_id),
          user_role: user_role || 'provider',
          user_name: user_name || 'Unknown',
          endpoint: subscription.endpoint,
          p256dh: keys.p256dh || '',
          auth: keys.auth || '',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      )
      .select()
      .single();

    if (error) {
      console.error('[SUBSCRIBE] Supabase error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    console.log('[SUBSCRIBE] Success:', data?.id);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[SUBSCRIBE] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE — Unregister a push subscription
export async function DELETE(request: NextRequest) {
  try {
    const { endpoint } = await request.json();

    if (!endpoint) {
      return NextResponse.json({ success: false, error: 'endpoint required' }, { status: 400 });
    }

    const { error } = await getSupabaseClient()
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);

    if (error) {
      console.error('[UNSUBSCRIBE] Error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
