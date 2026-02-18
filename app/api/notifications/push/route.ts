// ============================================================================
// PUSH NOTIFICATION API — Send push notifications to users
// Deploy to: src/app/api/notifications/push/route.ts
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as webpush from 'web-push';

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

// Configure VAPID (lazy init to avoid build errors)
let vapidConfigured = false;
function ensureVapid() {
  if (!vapidConfigured && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      `mailto:${process.env.VAPID_EMAIL || 'admin@medazonhealth.com'}`,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    vapidConfigured = true;
  }
}

// POST — Send a push notification
export async function POST(request: NextRequest) {
  try {
    ensureVapid();
    const { recipient_id, recipient_role, title, body, url, type, tag } = await request.json();

    console.log('[PUSH] Sending:', { recipient_id, recipient_role, title });

    if (!title || !body) {
      return NextResponse.json({ success: false, error: 'title and body required' }, { status: 400 });
    }

    // Get push subscriptions for the recipient
    let query = getSupabaseClient().from('push_subscriptions').select('*');

    if (recipient_id) {
      query = query.eq('user_id', String(recipient_id));
    } else if (recipient_role) {
      query = query.eq('user_role', recipient_role);
    } else {
      return NextResponse.json({ success: false, error: 'recipient_id or recipient_role required' }, { status: 400 });
    }

    const { data: subscriptions, error: fetchError } = await query;

    if (fetchError) {
      console.error('[PUSH] Fetch subscriptions error:', fetchError);
      return NextResponse.json({ success: false, error: 'Failed to fetch subscriptions' }, { status: 500 });
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('[PUSH] No subscriptions found for', { recipient_id, recipient_role });
      return NextResponse.json({ success: true, sent: 0, message: 'No subscriptions found' });
    }

    // Build payload
    const payload = JSON.stringify({
      title,
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      url: url || '/',
      type: type || 'general',
      tag: tag || `medazon-${Date.now()}`,
      requireInteraction: true,
    });

    let sent = 0;
    let failed = 0;
    const expiredSubscriptions: string[] = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload
        );
        sent++;
        console.log('[PUSH] Sent to:', sub.user_name);
      } catch (err: any) {
        console.error('[PUSH] Send error:', err.statusCode, err.body);
        failed++;
        // If subscription is expired/invalid, mark for cleanup
        if (err.statusCode === 404 || err.statusCode === 410) {
          expiredSubscriptions.push(sub.id);
        }
      }
    }

    // Clean up expired subscriptions
    if (expiredSubscriptions.length > 0) {
      await getSupabaseClient().from('push_subscriptions').delete().in('id', expiredSubscriptions);
      console.log(`[PUSH] Cleaned up ${expiredSubscriptions.length} expired subscriptions`);
    }

    console.log(`[PUSH] Done: sent=${sent}, failed=${failed}`);
    return NextResponse.json({ success: true, sent, failed });

  } catch (error: any) {
    console.error('[PUSH] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
