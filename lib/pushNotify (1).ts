// ============================================================================
// PUSH NOTIFICATION HELPER — Send push from any server-side route
// Deploy to: src/lib/pushNotify.ts
// ============================================================================

import * as webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Configure VAPID (safe to call multiple times)
let vapidConfigured = false;
function ensureVapid() {
  if (vapidConfigured) return;
  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      `mailto:${process.env.VAPID_EMAIL || 'admin@medazonhealth.com'}`,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    vapidConfigured = true;
  }
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  type?: string;
  tag?: string;
  icon?: string;
  requireInteraction?: boolean;
}

// Send push to a specific user by their user_id
export async function pushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  ensureVapid();
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', String(userId));
  return sendToSubscriptions(subscriptions || [], payload);
}

// Send push to all users with a specific role ('admin' or 'provider')
export async function pushToRole(role: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  ensureVapid();
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_role', role);
  return sendToSubscriptions(subscriptions || [], payload);
}

// Internal: send to list of subscriptions
async function sendToSubscriptions(
  subscriptions: any[],
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  if (subscriptions.length === 0) {
    console.log('[pushNotify] No subscriptions found');
    return { sent: 0, failed: 0 };
  }

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/icon-192.png',
    badge: '/icon-192.png',
    url: payload.url || '/',
    type: payload.type || 'general',
    tag: payload.tag || `medazon-${Date.now()}`,
    requireInteraction: payload.requireInteraction ?? true,
  });

  let sent = 0;
  let failed = 0;
  const expired: string[] = [];

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message
      );
      sent++;
    } catch (err: any) {
      failed++;
      if (err.statusCode === 404 || err.statusCode === 410) {
        expired.push(sub.id);
      }
    }
  }

  // Cleanup expired subscriptions
  if (expired.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', expired);
  }

  console.log(`[pushNotify] sent=${sent}, failed=${failed}, cleaned=${expired.length}`);
  return { sent, failed };
}
