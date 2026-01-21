/**
 * API Route: POST /api/webhooks/stripe
 * Handles incoming Stripe webhook events
 */

import { handleStripeWebhook } from '@/lib/webhook-handler';
import { NextRequest } from 'next/server';

// Export the webhook handler
export const POST = handleStripeWebhook;

// Disable body parsing for raw body access (required for signature verification)
export const dynamic = 'force-dynamic';
