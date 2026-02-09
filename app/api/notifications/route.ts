// app/api/notifications/route.ts
// COMPLETE Notifications API - Manage notification settings, deliver alerts,
// handle SMS/email notifications, track delivery status

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ApiError } from '@/types/errors';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type NotificationChannel = 'sms' | 'email' | 'push' | 'in_app';
type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'failed';

interface NotificationSettings {
  channels: {
    sms: { enabled: boolean; destination: string; verified: boolean };
    email: { enabled: boolean; destination: string; verified: boolean };
    push: { enabled: boolean; verified: boolean };
    in_app: { enabled: boolean };
  };
  alerts: {
    margin_drop: { enabled: boolean; threshold: number; channels: NotificationChannel[] };
    price_change: { enabled: boolean; threshold: number; channels: NotificationChannel[] };
    sync_failure: { enabled: boolean; channels: NotificationChannel[] };
    daily_summary: { enabled: boolean; channels: NotificationChannel[] };
  };
  globalMute: boolean;
  muteUntil: string | null;
  timezone: string;
}

interface Notification {
  id: string;
  type: string;
  channel: NotificationChannel;
  recipient: string;
  subject?: string;
  message: string;
  status: NotificationStatus;
  sentAt?: string;
  deliveredAt?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface SendNotificationRequest {
  type: string;
  channel?: NotificationChannel;
  recipient?: string;
  subject?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_SETTINGS: NotificationSettings = {
  channels: {
    sms: { enabled: false, destination: '', verified: false },
    email: { enabled: true, destination: '', verified: false },
    push: { enabled: true, verified: true },
    in_app: { enabled: true },
  },
  alerts: {
    margin_drop: { enabled: true, threshold: 30, channels: ['email', 'in_app'] },
    price_change: { enabled: true, threshold: 10, channels: ['in_app'] },
    sync_failure: { enabled: true, channels: ['email'] },
    daily_summary: { enabled: true, channels: ['email'] },
  },
  globalMute: false,
  muteUntil: null,
  timezone: 'America/New_York',
};

// In-memory storage (use database in production)
let notificationSettings = { ...DEFAULT_SETTINGS };
const notifications: Notification[] = [];

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function generateId(): string {
  return `notif-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function errorResponse(error: ApiError, status: number = 400): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

function successResponse<T>(data: T, meta?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ success: true, data, ...(meta && { meta }) });
}

/**
 * Send SMS via Twilio (mock implementation)
 */
async function sendSms(to: string, message: string): Promise<{ success: boolean; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: 'SMS not configured' };
  }

  try {
    // In production, use Twilio SDK
    // const client = twilio(accountSid, authToken);
    // await client.messages.create({ body: message, from: fromNumber, to });
    
    console.log(`[SMS] To: ${to}, Message: ${message.slice(0, 50)}...`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'SMS send failed' };
  }
}

/**
 * Send email (mock implementation)
 */
async function sendEmail(to: string, subject: string, message: string): Promise<{ success: boolean; error?: string }> {
  try {
    // In production, use email service (SendGrid, SES, etc.)
    console.log(`[EMAIL] To: ${to}, Subject: ${subject}, Message: ${message.slice(0, 50)}...`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Email send failed' };
  }
}

/**
 * Deliver notification to channel
 */
async function deliverNotification(notification: Notification): Promise<void> {
  let result: { success: boolean; error?: string };

  switch (notification.channel) {
    case 'sms':
      result = await sendSms(notification.recipient, notification.message);
      break;
    case 'email':
      result = await sendEmail(notification.recipient, notification.subject || 'Notification', notification.message);
      break;
    case 'push':
      // Push notification would go here
      result = { success: true };
      break;
    case 'in_app':
      // In-app notifications are stored and retrieved
      result = { success: true };
      break;
    default:
      result = { success: false, error: 'Unknown channel' };
  }

  notification.status = result.success ? 'delivered' : 'failed';
  notification.deliveredAt = result.success ? new Date().toISOString() : undefined;
  notification.error = result.error;
}

// ═══════════════════════════════════════════════════════════════════════════
// GET - Get settings or notifications
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type');

  // Get notification settings
  if (type === 'settings') {
    return successResponse(notificationSettings);
  }

  // Get notification history
  const channel = request.nextUrl.searchParams.get('channel') as NotificationChannel | null;
  const status = request.nextUrl.searchParams.get('status') as NotificationStatus | null;
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');

  let filteredNotifications = [...notifications];

  if (channel) {
    filteredNotifications = filteredNotifications.filter(n => n.channel === channel);
  }
  if (status) {
    filteredNotifications = filteredNotifications.filter(n => n.status === status);
  }

  // Sort by createdAt desc and limit
  filteredNotifications = filteredNotifications
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);

  // Calculate stats
  const stats = {
    total: notifications.length,
    pending: notifications.filter(n => n.status === 'pending').length,
    sent: notifications.filter(n => n.status === 'sent').length,
    delivered: notifications.filter(n => n.status === 'delivered').length,
    failed: notifications.filter(n => n.status === 'failed').length,
    byChannel: {
      sms: notifications.filter(n => n.channel === 'sms').length,
      email: notifications.filter(n => n.channel === 'email').length,
      push: notifications.filter(n => n.channel === 'push').length,
      in_app: notifications.filter(n => n.channel === 'in_app').length,
    },
  };

  return successResponse(filteredNotifications, { stats });
}

// ═══════════════════════════════════════════════════════════════════════════
// POST - Send notification or update settings
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Update settings
    if (body.action === 'update_settings') {
      notificationSettings = {
        ...notificationSettings,
        ...body.settings,
        channels: {
          ...notificationSettings.channels,
          ...body.settings?.channels,
        },
        alerts: {
          ...notificationSettings.alerts,
          ...body.settings?.alerts,
        },
      };

      return successResponse(notificationSettings, { updated: true });
    }

    // Test notification
    if (body.action === 'test') {
      const channel = body.channel as NotificationChannel;
      
      if (!channel) {
        return errorResponse({
          code: 'NOTIF_001',
          message: 'Channel required for test',
        }, 400);
      }

      const testNotification: Notification = {
        id: generateId(),
        type: 'test',
        channel,
        recipient: body.recipient || notificationSettings.channels[channel]?.destination || 'test@example.com',
        subject: 'Test Notification',
        message: 'This is a test notification from Dropship Pro.',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      await deliverNotification(testNotification);
      notifications.push(testNotification);

      return successResponse({
        ...testNotification,
        message: testNotification.status === 'delivered'
          ? 'Test notification sent successfully'
          : `Test notification failed: ${testNotification.error}`,
      });
    }

    // Send notification
    const data = body as SendNotificationRequest;

    if (!data.message) {
      return errorResponse({
        code: 'NOTIF_002',
        message: 'Message is required',
      }, 400);
    }

    // Check global mute
    if (notificationSettings.globalMute) {
      if (!notificationSettings.muteUntil || new Date(notificationSettings.muteUntil) > new Date()) {
        return successResponse({
          status: 'muted',
          message: 'Notifications are currently muted',
          muteUntil: notificationSettings.muteUntil,
        });
      }
    }

    // Determine channels to use
    const channels: NotificationChannel[] = data.channel
      ? [data.channel]
      : (notificationSettings.alerts[data.type as keyof typeof notificationSettings.alerts]?.channels || ['in_app']);

    const results: Notification[] = [];

    for (const channel of channels) {
      const channelConfig = notificationSettings.channels[channel];
      
      if (!channelConfig?.enabled) {
        continue;
      }

      const notification: Notification = {
        id: generateId(),
        type: data.type,
        channel,
        recipient: data.recipient || channelConfig.destination || '',
        subject: data.subject,
        message: data.message,
        status: 'pending',
        metadata: data.metadata,
        createdAt: new Date().toISOString(),
      };

      await deliverNotification(notification);
      notifications.push(notification);
      results.push(notification);
    }

    return successResponse(results, {
      sent: results.filter(r => r.status === 'delivered').length,
      failed: results.filter(r => r.status === 'failed').length,
    });
  } catch (error) {
    console.error('Notifications POST error:', error);
    return errorResponse({
      code: 'NOTIF_003',
      message: 'Invalid request',
      details: error instanceof Error ? error.message : 'Failed to process request',
    }, 400);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PUT - Update notification settings
// ═══════════════════════════════════════════════════════════════════════════

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    notificationSettings = {
      ...notificationSettings,
      ...body,
      channels: {
        ...notificationSettings.channels,
        ...body.channels,
      },
      alerts: {
        ...notificationSettings.alerts,
        ...body.alerts,
      },
    };

    return successResponse(notificationSettings, { updated: true });
  } catch (error) {
    console.error('Notifications PUT error:', error);
    return errorResponse({
      code: 'NOTIF_004',
      message: 'Invalid request',
      details: error instanceof Error ? error.message : 'Failed to update settings',
    }, 400);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE - Clear notification history
// ═══════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type');

  if (type === 'all') {
    const count = notifications.length;
    notifications.length = 0;
    return successResponse({ cleared: count });
  }

  if (type === 'delivered') {
    const before = notifications.length;
    const remaining = notifications.filter(n => n.status !== 'delivered');
    notifications.length = 0;
    notifications.push(...remaining);
    return successResponse({ cleared: before - remaining.length });
  }

  return errorResponse({
    code: 'NOTIF_005',
    message: 'Invalid type parameter',
    suggestion: 'Use type=all or type=delivered',
  }, 400);
}
