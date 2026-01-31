// app/api/cron/sync-orders/route.ts
// Cron job to sync Shopify orders to local database
// Should be called every 15 minutes via Vercel Cron or external scheduler

import { NextRequest, NextResponse } from 'next/server';
import { syncShopifyOrders, getSyncStatus } from '@/lib/services/shopify-orders-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds max execution time

/**
 * POST /api/cron/sync-orders
 * Syncs Shopify orders to local database
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[Cron] Starting Shopify orders sync...');
    const startTime = Date.now();

    // Sync orders from Shopify
    const result = await syncShopifyOrders(250);

    const duration = Date.now() - startTime;

    console.log('[Cron] Sync completed:', {
      success: result.success,
      synced: result.synced,
      created: result.created,
      updated: result.updated,
      errors: result.errors.length,
      duration: `${duration}ms`,
    });

    // Get current sync status
    const status = await getSyncStatus();

    return NextResponse.json({
      success: result.success,
      synced: result.synced,
      created: result.created,
      updated: result.updated,
      errors: result.errors,
      duration,
      status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Sync failed:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Sync failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/sync-orders
 * Get sync status (for monitoring)
 */
export async function GET(request: NextRequest) {
  try {
    const status = await getSyncStatus();

    return NextResponse.json({
      status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Failed to get sync status:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to get status',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
