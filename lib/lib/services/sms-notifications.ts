// lib/services/sms-notifications.ts
// SMS notification service using Twilio for margin alerts and system notifications
// Falls back to dashboard-only alerts when Twilio is not configured

import type { ApiResponse } from '@/types/errors';
import type { Notification, NotificationSettings, NotificationCategory } from '@/types';
import { createSuccessResponse, createResponseFromCode, logError } from '@/lib/utils/api-error-handler';
import { PRICING_RULES } from '@/lib/config/pricing-rules';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

// Default notification settings
const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: false,
  phone_number: '',
  alerts: {
    margin_alerts: true,
    stock_alerts: true,
    import_completion: true,
    system_errors: true,
  },
  quiet_hours: {
    enabled: false,
    start: '22:00',
    end: '08:00',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface TwilioConfig {
  accountSid: string | undefined;
  authToken: string | undefined;
  phoneNumber: string | undefined;
  isConfigured: boolean;
}

interface TwilioMessageResponse {
  sid: string;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'undelivered';
  error_code?: number;
  error_message?: string;
  date_created?: string;
}

interface TwilioError {
  code: number;
  message: string;
  more_info?: string;
  status?: number;
}

export interface SendSmsResult {
  sent: boolean;
  messageSid?: string;
  status?: string;
  isMock: boolean;
}

export interface MarginAlert {
  productId: string;
  asin: string;
  title: string;
  currentMargin: number;
  previousMargin: number;
  threshold: number;
  amazonPrice: number;
  yourPrice: number;
}

export interface ImportAlert {
  jobId: string;
  totalProducts: number;
  successful: number;
  failed: number;
  duration: number; // seconds
}

export interface SystemAlert {
  code: string;
  message: string;
  severity: 'warning' | 'error' | 'critical';
  details?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION HELPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get Twilio configuration status
 */
export function getTwilioConfig(): TwilioConfig {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  
  return {
    accountSid,
    authToken,
    phoneNumber,
    isConfigured: !!(accountSid && authToken && phoneNumber),
  };
}

/**
 * Check if Twilio is configured
 */
export function hasTwilioConfig(): boolean {
  return getTwilioConfig().isConfigured;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHONE NUMBER VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate E.164 phone number format
 */
export function validatePhoneNumber(phone: string): boolean {
  // E.164 format: +[country code][number], 8-15 digits total
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

/**
 * Format phone number to E.164
 */
export function formatPhoneNumber(phone: string): string | null {
  // Remove all non-digit characters except leading +
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // If starts with +, validate as is
  if (cleaned.startsWith('+')) {
    return validatePhoneNumber(cleaned) ? cleaned : null;
  }
  
  // US number: assume 10 digits is US
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  
  // 11 digits starting with 1 is US
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }
  
  // Try adding +
  const withPlus = `+${cleaned}`;
  return validatePhoneNumber(withPlus) ? withPlus : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUIET HOURS CHECK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if current time is within quiet hours
 */
export function isInQuietHours(settings: NotificationSettings): boolean {
  if (!settings.quiet_hours.enabled) return false;
  
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  const [startHour, startMin] = settings.quiet_hours.start.split(':').map(Number);
  const [endHour, endMin] = settings.quiet_hours.end.split(':').map(Number);
  
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  
  // Handle overnight quiet hours (e.g., 22:00 - 08:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
  
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

// ═══════════════════════════════════════════════════════════════════════════
// TWILIO API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send SMS via Twilio API
 */
async function sendViaTwilio(
  to: string,
  message: string
): Promise<ApiResponse<TwilioMessageResponse>> {
  const config = getTwilioConfig();
  
  if (!config.isConfigured) {
    return createResponseFromCode('SMS_001');
  }

  // Validate destination number
  if (!validatePhoneNumber(to)) {
    return createResponseFromCode('SMS_002');
  }

  try {
    const url = `${TWILIO_API_BASE}/Accounts/${config.accountSid}/Messages.json`;
    
    const formData = new URLSearchParams();
    formData.append('To', to);
    formData.append('From', config.phoneNumber!);
    formData.append('Body', message);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json() as TwilioError;
      logError('SMS_004', new Error(`Twilio error ${errorData.code}: ${errorData.message}`));
      
      // Check for specific error types
      if (errorData.code === 21211 || errorData.code === 21614) {
        return createResponseFromCode('SMS_002');
      }
      
      return createResponseFromCode('SMS_004');
    }

    const data = await response.json() as TwilioMessageResponse;
    return createSuccessResponse(data);
  } catch (error) {
    logError('SMS_004', error instanceof Error ? error : new Error(String(error)));
    return createResponseFromCode('SMS_004');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION STORAGE (IN-MEMORY FOR DEMO)
// ═══════════════════════════════════════════════════════════════════════════

// In-memory notification storage (replace with database in production)
let notifications: Notification[] = [];
let notificationSettings: NotificationSettings = { ...DEFAULT_SETTINGS };

/**
 * Save notification to store
 */
function saveNotification(notification: Notification): void {
  notifications.unshift(notification);
  
  // Keep only last 1000 notifications
  if (notifications.length > 1000) {
    notifications = notifications.slice(0, 1000);
  }
}

/**
 * Create notification record
 */
function createNotificationRecord(
  category: NotificationCategory,
  title: string,
  message: string,
  data?: Record<string, unknown>
): Notification {
  return {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'dashboard', // Will be updated if SMS sent
    category,
    title,
    message,
    data,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API: SEND NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send SMS notification
 * Falls back to dashboard-only if Twilio not configured
 */
export async function sendSms(
  to: string,
  message: string
): Promise<ApiResponse<SendSmsResult>> {
  const config = getTwilioConfig();
  
  // MOCK MODE
  if (!config.isConfigured) {
    console.log(`[SMS MOCK] Would send to ${to}: ${message.slice(0, 50)}...`);
    return createSuccessResponse({
      sent: false,
      isMock: true,
    });
  }

  // LIVE MODE
  const response = await sendViaTwilio(to, message);
  
  if (!response.success) {
    return response as ApiResponse<SendSmsResult>;
  }

  return createSuccessResponse({
    sent: true,
    messageSid: response.data.sid,
    status: response.data.status,
    isMock: false,
  });
}

/**
 * Send margin alert notification
 */
export async function sendMarginAlert(
  alert: MarginAlert
): Promise<ApiResponse<{ notificationId: string; smsSent: boolean }>> {
  const message = formatMarginAlertMessage(alert);
  const notification = createNotificationRecord(
    'margin_alert',
    `Margin Alert: ${alert.asin}`,
    message,
    alert as unknown as Record<string, unknown>
  );

  // Check settings
  if (!notificationSettings.enabled || !notificationSettings.alerts.margin_alerts) {
    notification.status = 'sent'; // Logged only
    saveNotification(notification);
    return createSuccessResponse({ notificationId: notification.id, smsSent: false });
  }

  // Check quiet hours
  if (isInQuietHours(notificationSettings)) {
    notification.status = 'sent';
    saveNotification(notification);
    return createSuccessResponse({ notificationId: notification.id, smsSent: false });
  }

  // Try SMS
  const result = await sendSms(notificationSettings.phone_number, message);
  
  if (result.success && result.data.sent) {
    notification.type = 'sms';
    notification.status = 'sent';
    notification.sent_at = new Date().toISOString();
  } else if (!result.success) {
    notification.status = 'failed';
    notification.error_message = result.error?.message;
  } else {
    notification.status = 'sent'; // Dashboard only
  }

  saveNotification(notification);
  return createSuccessResponse({
    notificationId: notification.id,
    smsSent: notification.type === 'sms',
  });
}

/**
 * Send import completion alert
 */
export async function sendImportAlert(
  alert: ImportAlert
): Promise<ApiResponse<{ notificationId: string; smsSent: boolean }>> {
  const message = formatImportAlertMessage(alert);
  const notification = createNotificationRecord(
    'import_complete',
    'Import Completed',
    message,
    alert as unknown as Record<string, unknown>
  );

  if (!notificationSettings.enabled || !notificationSettings.alerts.import_completion) {
    notification.status = 'sent';
    saveNotification(notification);
    return createSuccessResponse({ notificationId: notification.id, smsSent: false });
  }

  if (isInQuietHours(notificationSettings)) {
    notification.status = 'sent';
    saveNotification(notification);
    return createSuccessResponse({ notificationId: notification.id, smsSent: false });
  }

  const result = await sendSms(notificationSettings.phone_number, message);
  
  if (result.success && result.data.sent) {
    notification.type = 'sms';
    notification.status = 'sent';
    notification.sent_at = new Date().toISOString();
  } else {
    notification.status = 'sent';
  }

  saveNotification(notification);
  return createSuccessResponse({
    notificationId: notification.id,
    smsSent: notification.type === 'sms',
  });
}

/**
 * Send system alert
 */
export async function sendSystemAlert(
  alert: SystemAlert
): Promise<ApiResponse<{ notificationId: string; smsSent: boolean }>> {
  const message = formatSystemAlertMessage(alert);
  const notification = createNotificationRecord(
    'system_error',
    `System Alert: ${alert.code}`,
    message,
    alert as unknown as Record<string, unknown>
  );

  if (!notificationSettings.enabled || !notificationSettings.alerts.system_errors) {
    notification.status = 'sent';
    saveNotification(notification);
    return createSuccessResponse({ notificationId: notification.id, smsSent: false });
  }

  // Always send critical alerts even in quiet hours
  if (alert.severity !== 'critical' && isInQuietHours(notificationSettings)) {
    notification.status = 'sent';
    saveNotification(notification);
    return createSuccessResponse({ notificationId: notification.id, smsSent: false });
  }

  const result = await sendSms(notificationSettings.phone_number, message);
  
  if (result.success && result.data.sent) {
    notification.type = 'sms';
    notification.status = 'sent';
    notification.sent_at = new Date().toISOString();
  } else {
    notification.status = 'sent';
  }

  saveNotification(notification);
  return createSuccessResponse({
    notificationId: notification.id,
    smsSent: notification.type === 'sms',
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE FORMATTERS
// ═══════════════════════════════════════════════════════════════════════════

function formatMarginAlertMessage(alert: MarginAlert): string {
  const dropAmount = Math.abs(alert.currentMargin - alert.previousMargin).toFixed(1);
  return (
    `⚠️ MARGIN ALERT\n` +
    `${alert.title.slice(0, 30)}...\n` +
    `ASIN: ${alert.asin}\n` +
    `Margin: ${alert.previousMargin.toFixed(1)}% → ${alert.currentMargin.toFixed(1)}% (-${dropAmount}%)\n` +
    `Below threshold: ${alert.threshold}%\n` +
    `Amazon: $${alert.amazonPrice.toFixed(2)} | Your: $${alert.yourPrice.toFixed(2)}`
  );
}

function formatImportAlertMessage(alert: ImportAlert): string {
  const minutes = Math.floor(alert.duration / 60);
  const seconds = alert.duration % 60;
  return (
    `✅ IMPORT COMPLETE\n` +
    `Total: ${alert.totalProducts}\n` +
    `Success: ${alert.successful}\n` +
    `Failed: ${alert.failed}\n` +
    `Time: ${minutes}m ${seconds}s`
  );
}

function formatSystemAlertMessage(alert: SystemAlert): string {
  const severityEmoji = {
    warning: '⚠️',
    error: '❌',
    critical: '🚨',
  };
  return (
    `${severityEmoji[alert.severity]} SYSTEM ALERT\n` +
    `Code: ${alert.code}\n` +
    `${alert.message}` +
    (alert.details ? `\n${alert.details.slice(0, 50)}` : '')
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get current notification settings
 */
export function getSettings(): NotificationSettings {
  return { ...notificationSettings };
}

/**
 * Update notification settings
 */
export async function updateSettings(
  updates: Partial<NotificationSettings>
): Promise<ApiResponse<NotificationSettings>> {
  // Validate phone number if provided
  if (updates.phone_number && updates.phone_number !== '') {
    const formatted = formatPhoneNumber(updates.phone_number);
    if (!formatted) {
      return createResponseFromCode('SMS_002');
    }
    updates.phone_number = formatted;
  }

  // Merge updates
  notificationSettings = {
    ...notificationSettings,
    ...updates,
    alerts: {
      ...notificationSettings.alerts,
      ...(updates.alerts || {}),
    },
    quiet_hours: {
      ...notificationSettings.quiet_hours,
      ...(updates.quiet_hours || {}),
    },
  };

  return createSuccessResponse(notificationSettings);
}

/**
 * Test SMS notification
 */
export async function sendTestSms(): Promise<ApiResponse<SendSmsResult>> {
  if (!notificationSettings.phone_number) {
    return createResponseFromCode('SMS_002');
  }

  const message = '🧪 Test notification from Dropship Pro. If you received this, SMS alerts are working!';
  const result = await sendSms(notificationSettings.phone_number, message);

  if (!result.success) {
    return createResponseFromCode('SMS_003');
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION HISTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get notification history
 */
export function getNotifications(options: {
  limit?: number;
  category?: NotificationCategory;
  status?: Notification['status'];
} = {}): Notification[] {
  const { limit = 50, category, status } = options;
  
  let filtered = notifications;
  
  if (category) {
    filtered = filtered.filter(n => n.category === category);
  }
  
  if (status) {
    filtered = filtered.filter(n => n.status === status);
  }
  
  return filtered.slice(0, limit);
}

/**
 * Get notification statistics
 */
export function getNotificationStats(): {
  total: number;
  sent: number;
  failed: number;
  byCategory: Record<NotificationCategory, number>;
} {
  const byCategory: Record<NotificationCategory, number> = {
    margin_alert: 0,
    stock_alert: 0,
    import_complete: 0,
    system_error: 0,
  };

  let sent = 0;
  let failed = 0;

  for (const notif of notifications) {
    byCategory[notif.category]++;
    if (notif.status === 'sent') sent++;
    if (notif.status === 'failed') failed++;
  }

  return {
    total: notifications.length,
    sent,
    failed,
    byCategory,
  };
}

/**
 * Clear notification history
 */
export function clearNotifications(): number {
  const count = notifications.length;
  notifications = [];
  return count;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE STATUS
// ═══════════════════════════════════════════════════════════════════════════

export interface SmsServiceStatus {
  twilioConfigured: boolean;
  mode: 'live' | 'mock';
  enabled: boolean;
  phoneConfigured: boolean;
  notificationCount: number;
}

/**
 * Get service status
 */
export function getServiceStatus(): SmsServiceStatus {
  const config = getTwilioConfig();
  
  return {
    twilioConfigured: config.isConfigured,
    mode: config.isConfigured ? 'live' : 'mock',
    enabled: notificationSettings.enabled,
    phoneConfigured: !!notificationSettings.phone_number && validatePhoneNumber(notificationSettings.phone_number),
    notificationCount: notifications.length,
  };
}

/**
 * Check product for margin alert
 * Call this when prices are updated
 */
export async function checkMarginAlert(
  product: {
    id: string;
    asin: string;
    title: string;
    amazon_price: number;
    retail_price: number;
    profit_margin: number;
  },
  previousMargin: number
): Promise<void> {
  const threshold = PRICING_RULES.profitThresholds.minimum;
  
  // Check if margin dropped below threshold
  if (
    product.profit_margin < threshold &&
    previousMargin >= threshold &&
    previousMargin - product.profit_margin >= 5 // At least 5% drop
  ) {
    await sendMarginAlert({
      productId: product.id,
      asin: product.asin,
      title: product.title,
      currentMargin: product.profit_margin,
      previousMargin,
      threshold,
      amazonPrice: product.amazon_price,
      yourPrice: product.retail_price,
    });
  }
}
