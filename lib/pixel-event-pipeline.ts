// lib/pixel-event-pipeline.ts
// ═══════════════════════════════════════════════════════════════════════════
// PIXEL EVENT PIPELINE — Spec Item 45
// Server-side event forwarding to ad platform APIs
// ═══════════════════════════════════════════════════════════════════════════
// Receives events from storefront → forwards to:
//   - Facebook Conversions API (CAPI)
//   - TikTok Events API
//   - Pinterest Conversions API
// Benefits: 1st party data, no ad blocker issues, better attribution
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Platform credentials
const FB_PIXEL_ID = process.env.FB_PIXEL_ID || '';
const FB_ACCESS_TOKEN = process.env.FB_CONVERSIONS_API_TOKEN || '';
const TIKTOK_PIXEL_ID = process.env.TIKTOK_PIXEL_ID || '';
const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_EVENTS_API_TOKEN || '';
const PINTEREST_TAG_ID = process.env.PINTEREST_TAG_ID || '';
const PINTEREST_ACCESS_TOKEN = process.env.PINTEREST_CONVERSIONS_TOKEN || '';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PixelEvent {
  event_name: 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase';
  event_id: string; // For deduplication with client-side pixel
  event_time: number; // Unix timestamp
  user_data: {
    email?: string;
    phone?: string;
    ip_address?: string;
    user_agent?: string;
    fbc?: string; // Facebook click ID
    fbp?: string; // Facebook browser ID
    external_id?: string;
  };
  custom_data?: {
    content_ids?: string[];
    content_name?: string;
    content_type?: string;
    currency?: string;
    value?: number;
    num_items?: number;
    order_id?: string;
  };
  source_url?: string;
}

interface PipelineResult {
  event_id: string;
  facebook: { sent: boolean; error?: string };
  tiktok: { sent: boolean; error?: string };
  pinterest: { sent: boolean; error?: string };
}

// ═══════════════════════════════════════════════════════════════════════════
// HASH HELPER (SHA-256 for PII)
// ═══════════════════════════════════════════════════════════════════════════

function hashPII(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. FACEBOOK CONVERSIONS API
// ═══════════════════════════════════════════════════════════════════════════

async function sendToFacebook(event: PixelEvent): Promise<{ sent: boolean; error?: string }> {
  if (!FB_PIXEL_ID || !FB_ACCESS_TOKEN) {
    return { sent: false, error: 'FB credentials not configured' };
  }

  try {
    const fbEvent = {
      event_name: event.event_name,
      event_time: event.event_time,
      event_id: event.event_id,
      event_source_url: event.source_url,
      action_source: 'website',
      user_data: {
        em: hashPII(event.user_data.email) ? [hashPII(event.user_data.email)] : undefined,
        ph: hashPII(event.user_data.phone) ? [hashPII(event.user_data.phone)] : undefined,
        client_ip_address: event.user_data.ip_address,
        client_user_agent: event.user_data.user_agent,
        fbc: event.user_data.fbc,
        fbp: event.user_data.fbp,
        external_id: event.user_data.external_id ? [hashPII(event.user_data.external_id)] : undefined,
      },
      custom_data: event.custom_data ? {
        content_ids: event.custom_data.content_ids,
        content_name: event.custom_data.content_name,
        content_type: event.custom_data.content_type,
        currency: event.custom_data.currency || 'USD',
        value: event.custom_data.value,
        num_items: event.custom_data.num_items,
        order_id: event.custom_data.order_id,
      } : undefined,
    };

    const res = await fetch(
      `https://graph.facebook.com/v18.0/${FB_PIXEL_ID}/events?access_token=${FB_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [fbEvent] }),
      }
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return { sent: false, error: `HTTP ${res.status}: ${errBody.slice(0, 200)}` };
    }

    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : 'Unknown' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. TIKTOK EVENTS API
// ═══════════════════════════════════════════════════════════════════════════

async function sendToTikTok(event: PixelEvent): Promise<{ sent: boolean; error?: string }> {
  if (!TIKTOK_PIXEL_ID || !TIKTOK_ACCESS_TOKEN) {
    return { sent: false, error: 'TikTok credentials not configured' };
  }

  const eventNameMap: Record<string, string> = {
    PageView: 'Pageview',
    ViewContent: 'ViewContent',
    AddToCart: 'AddToCart',
    InitiateCheckout: 'InitiateCheckout',
    Purchase: 'PlaceAnOrder',
  };

  try {
    const ttEvent = {
      pixel_code: TIKTOK_PIXEL_ID,
      event: eventNameMap[event.event_name] || event.event_name,
      event_id: event.event_id,
      timestamp: new Date(event.event_time * 1000).toISOString(),
      context: {
        user_agent: event.user_data.user_agent,
        ip: event.user_data.ip_address,
        user: {
          email: hashPII(event.user_data.email),
          phone_number: hashPII(event.user_data.phone),
          external_id: hashPII(event.user_data.external_id),
        },
        page: { url: event.source_url },
      },
      properties: event.custom_data ? {
        content_id: event.custom_data.content_ids?.[0],
        content_name: event.custom_data.content_name,
        content_type: event.custom_data.content_type || 'product',
        currency: event.custom_data.currency || 'USD',
        value: event.custom_data.value,
        quantity: event.custom_data.num_items,
      } : undefined,
    };

    const res = await fetch('https://business-api.tiktok.com/open_api/v1.3/pixel/track/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': TIKTOK_ACCESS_TOKEN,
      },
      body: JSON.stringify({ data: [ttEvent] }),
    });

    return res.ok ? { sent: true } : { sent: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : 'Unknown' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. PINTEREST CONVERSIONS API
// ═══════════════════════════════════════════════════════════════════════════

async function sendToPinterest(event: PixelEvent): Promise<{ sent: boolean; error?: string }> {
  if (!PINTEREST_TAG_ID || !PINTEREST_ACCESS_TOKEN) {
    return { sent: false, error: 'Pinterest credentials not configured' };
  }

  const eventNameMap: Record<string, string> = {
    PageView: 'page_visit',
    ViewContent: 'page_visit',
    AddToCart: 'add_to_cart',
    InitiateCheckout: 'checkout',
    Purchase: 'checkout',
  };

  try {
    const pinEvent = {
      event_name: eventNameMap[event.event_name] || 'custom',
      action_source: 'web',
      event_time: event.event_time,
      event_id: event.event_id,
      event_source_url: event.source_url,
      user_data: {
        em: hashPII(event.user_data.email) ? [hashPII(event.user_data.email)] : undefined,
        client_ip_address: event.user_data.ip_address,
        client_user_agent: event.user_data.user_agent,
        external_id: event.user_data.external_id ? [hashPII(event.user_data.external_id)] : undefined,
      },
      custom_data: event.custom_data ? {
        currency: event.custom_data.currency || 'USD',
        value: event.custom_data.value?.toString(),
        content_ids: event.custom_data.content_ids,
        num_items: event.custom_data.num_items,
        order_id: event.custom_data.order_id,
      } : undefined,
    };

    const res = await fetch(`https://api.pinterest.com/v5/ad_accounts/${PINTEREST_TAG_ID}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PINTEREST_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ data: [pinEvent] }),
    });

    return res.ok ? { sent: true } : { sent: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : 'Unknown' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. PIPELINE ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════

export async function processPixelEvent(event: PixelEvent): Promise<PipelineResult> {
  const [facebook, tiktok, pinterest] = await Promise.allSettled([
    sendToFacebook(event),
    sendToTikTok(event),
    sendToPinterest(event),
  ]);

  const result: PipelineResult = {
    event_id: event.event_id,
    facebook: facebook.status === 'fulfilled' ? facebook.value : { sent: false, error: 'Promise rejected' },
    tiktok: tiktok.status === 'fulfilled' ? tiktok.value : { sent: false, error: 'Promise rejected' },
    pinterest: pinterest.status === 'fulfilled' ? pinterest.value : { sent: false, error: 'Promise rejected' },
  };

  // Log to Supabase for audit
  await supabase.from('pixel_events').insert({
    event_id: event.event_id,
    event_name: event.event_name,
    fb_sent: result.facebook.sent,
    tt_sent: result.tiktok.sent,
    pin_sent: result.pinterest.sent,
    value: event.custom_data?.value || null,
    source_url: event.source_url || null,
    created_at: new Date().toISOString(),
  }).catch(() => { /* table may not exist yet */ });

  return result;
}

// Batch processor for webhook-triggered events
export async function processBatchEvents(events: PixelEvent[]): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];
  for (const event of events) {
    const result = await processPixelEvent(event);
    results.push(result);
  }
  return results;
}

export default { processPixelEvent, processBatchEvents };
