import { NextRequest, NextResponse } from 'next/server';
import { syncProductPrices, getStaleProducts, createSyncJob, updateSyncJob } from '@/lib/price-sync';
import { syncProductsFromShopify } from '@/lib/product-management';
import { syncAllChannelOrders } from '@/lib/multichannel';
import { captureDailyStats } from '@/lib/analytics';

// Verify cron secret
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret) {
    console.warn('CRON_SECRET not set - allowing request in development');
    return process.env.NODE_ENV === 'development';
  }
  
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  try {
    if (!verifyCronSecret(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const job = searchParams.get('job');

    switch (job) {
      // Run every hour - sync stale product prices
      case 'price-sync': {
        console.log('[CRON] Starting price sync job');
        const staleProducts = await getStaleProducts(24, 100);
        
        if (staleProducts.length === 0) {
          console.log('[CRON] No stale products to sync');
          return NextResponse.json({ data: { message: 'No stale products', synced: 0 } });
        }

        const productIds = staleProducts.map(p => p.product_id);
        const syncJob = await createSyncJob(productIds.length, 'cron');
        
        try {
          const result = await syncProductPrices(productIds);
          await updateSyncJob(syncJob.id, {
            status: 'completed',
            products_synced: result.synced,
            errors: result.errors.length > 0 ? result.errors : null,
          });
          console.log(`[CRON] Price sync completed: ${result.synced} synced, ${result.errors.length} errors`);
          return NextResponse.json({ data: result });
        } catch (error) {
          await updateSyncJob(syncJob.id, {
            status: 'failed',
            errors: [error instanceof Error ? error.message : 'Unknown error'],
          });
          throw error;
        }
      }

      // Run every 6 hours - sync products from Shopify
      case 'shopify-sync': {
        console.log('[CRON] Starting Shopify product sync');
        const result = await syncProductsFromShopify(false);
        console.log(`[CRON] Shopify sync completed: ${result.synced} synced, ${result.errors.length} errors`);
        return NextResponse.json({ data: result });
      }

      // Run every 15 minutes - sync orders from all channels
      case 'order-sync': {
        console.log('[CRON] Starting order sync from all channels');
        const result = await syncAllChannelOrders();
        console.log(`[CRON] Order sync completed: ${result.synced} synced, ${result.errors.length} errors`);
        return NextResponse.json({ data: result });
      }

      // Run daily at midnight - capture daily stats
      case 'daily-stats': {
        console.log('[CRON] Capturing daily stats');
        const stats = await captureDailyStats();
        console.log('[CRON] Daily stats captured');
        return NextResponse.json({ data: stats });
      }

      // Run daily - full price sync (more thorough)
      case 'full-price-sync': {
        console.log('[CRON] Starting full price sync job');
        const staleProducts = await getStaleProducts(48, 500);
        
        if (staleProducts.length === 0) {
          return NextResponse.json({ data: { message: 'No products to sync', synced: 0 } });
        }

        const productIds = staleProducts.map(p => p.product_id);
        const syncJob = await createSyncJob(productIds.length, 'cron-full');
        
        try {
          const result = await syncProductPrices(productIds);
          await updateSyncJob(syncJob.id, {
            status: 'completed',
            products_synced: result.synced,
            errors: result.errors.length > 0 ? result.errors : null,
          });
          console.log(`[CRON] Full price sync completed: ${result.synced} synced`);
          return NextResponse.json({ data: result });
        } catch (error) {
          await updateSyncJob(syncJob.id, {
            status: 'failed',
            errors: [error instanceof Error ? error.message : 'Unknown error'],
          });
          throw error;
        }
      }

      default:
        return NextResponse.json({ error: 'Invalid job' }, { status: 400 });
    }
  } catch (error) {
    console.error('[CRON] Job error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
