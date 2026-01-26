// app/api/cron/price-sync/route.ts
// Scheduled price synchronization endpoint for Vercel cron jobs
// This syncs prices from Amazon/competitors to keep margins accurate

import { NextRequest, NextResponse } from 'next/server';

// Simple auth check for cron jobs
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Verify cron secret if configured
    const authHeader = request.headers.get('authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // For now, return a mock successful response
    // In production, this would call your price sync service
    const result = {
      synced: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      results: [] as { productId: string; status: string; error?: string }[]
    };

    // TODO: Implement actual price sync logic
    // const result = await syncAllPrices();

    const duration = Math.round((Date.now() - startTime) / 1000);

    return NextResponse.json({
      success: true,
      duration_seconds: duration,
      total_products: result.synced + result.skipped, // Calculate total from synced + skipped
      synced: result.synced,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error('Price sync cron error:', error);
    
    return NextResponse.json({
      success: false,
      duration_seconds: duration,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
