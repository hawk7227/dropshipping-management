// app/api/cron/trigger/route.ts
// Manual cron job trigger endpoint for testing and admin use
// Supports authentication and authorization for manual triggers

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Auth check for manual triggers
const CRON_SECRET = process.env.CRON_SECRET;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type CronJobType = 
  | 'product-discovery'    // P1.2 - Daily at 4 AM
  | 'price-sync'          // P2.2 - Every hour  
  | 'full-price-sync'     // P2.3 - Daily at 3 AM
  | 'shopify-sync'        // P2.4 - Every 6 hours
  | 'order-sync'          // P2.5 - Every 15 minutes
  | 'daily-stats'         // P2.6 - Daily at midnight
  | 'google-shopping'     // P3.3 - Daily at 5 AM
  | 'omnipresence'        // P3.2 - Daily at 6 AM
  | 'daily-learning'      // P3.4 - Daily at 11 PM
  | 'ai-scoring';         // Additional: AI scoring for new products

interface ManualTriggerRequest {
  job: CronJobType;
  dryRun?: boolean;
  limit?: number;
  searchTerms?: string[];
  triggeredBy?: string;
}

interface ManualTriggerResponse {
  success: boolean;
  message: string;
  jobId?: string;
  result?: any;
  error?: string;
}

/**
 * Verify authentication for manual triggers
 */
function verifyAuth(request: NextRequest): { authorized: boolean; error?: string } {
  // Check for cron secret (for system triggers)
  const cronAuth = request.headers.get('authorization');
  if (CRON_SECRET && cronAuth === `Bearer ${CRON_SECRET}`) {
    return { authorized: true };
  }

  // Check for admin API key (for manual admin triggers)
  const adminKey = request.headers.get('x-admin-api-key');
  if (ADMIN_API_KEY && adminKey === ADMIN_API_KEY) {
    return { authorized: true };
  }

  return { 
    authorized: false, 
    error: 'Unauthorized: Missing or invalid authentication' 
  };
}

/**
 * Log manual trigger attempt
 */
async function logManualTrigger(
  jobType: CronJobType, 
  triggeredBy: string, 
  success: boolean, 
  result?: any,
  error?: string
): Promise<void> {
  try {
    await supabase
      .from('cron_job_logs')
      .insert({
        job_type: jobType,
        status: success ? 'completed' : 'failed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        duration_seconds: 0,
        processed: result?.processed || 0,
        errors: result?.errors || (error ? 1 : 0),
        message: result?.message || error || 'Manual trigger',
        details: { 
          manualTrigger: true,
          triggeredBy,
          dryRun: result?.dryRun || false,
          ...result
        },
        error_log: error ? { error, timestamp: new Date().toISOString() } : null,
        triggered_by: triggeredBy
      });
  } catch (logError) {
    console.error('Failed to log manual trigger:', logError);
  }
}

/**
 * Execute manual cron job trigger
 */
async function executeManualTrigger(
  jobType: CronJobType, 
  options: {
    dryRun?: boolean;
    limit?: number;
    searchTerms?: string[];
    triggeredBy: string;
  }
): Promise<ManualTriggerResponse> {
  const { dryRun = false, limit, searchTerms, triggeredBy } = options;

  try {
    // Import the cron handler
    const { GET: cronHandler } = await import('../route');
    
    // Build query string
    const queryParams = new URLSearchParams({ job: jobType });
    if (dryRun) queryParams.set('dryRun', 'true');
    if (limit) queryParams.set('limit', limit.toString());
    if (searchTerms) queryParams.set('searchTerms', searchTerms.join(','));
    queryParams.set('triggeredBy', triggeredBy);

    // Create mock request
    const mockUrl = `http://localhost/api/cron?${queryParams.toString()}`;
    const mockRequest = new Request(mockUrl, {
      method: 'GET',
      headers: {
        'authorization': `Bearer ${CRON_SECRET}`,
        'x-manual-trigger': 'true',
        'x-triggered-by': triggeredBy
      }
    });

    // Execute the cron job
    const response = await cronHandler(mockRequest as any);
    const result = await response.json();

    if (response.status >= 400) {
      return {
        success: false,
        message: `Job ${jobType} failed`,
        error: result.error || 'Unknown error'
      };
    }

    return {
      success: true,
      message: `Job ${jobType} completed successfully`,
      jobId: result.jobId || `manual-${Date.now()}`,
      result
    };

  } catch (error) {
    return {
      success: false,
      message: `Failed to execute job ${jobType}`,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const auth = verifyAuth(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { 
          success: false, 
          error: auth.error,
          message: 'Authentication required for manual triggers'
        }, 
        { status: 401 }
      );
    }

    // Parse request body
    const body: ManualTriggerRequest = await request.json();
    const { job, dryRun = false, limit, searchTerms, triggeredBy = 'manual' } = body;

    // Validate job type
    const validJobs: CronJobType[] = [
      'product-discovery', 'price-sync', 'full-price-sync', 
      'shopify-sync', 'order-sync', 'daily-stats',
      'google-shopping', 'omnipresence', 'daily-learning', 'ai-scoring'
    ];

    if (!job || !validJobs.includes(job)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid or missing job type',
        availableJobs: validJobs
      }, { status: 400 });
    }

    console.log(`[MANUAL] Triggering ${job} job (dryRun: ${dryRun}, triggeredBy: ${triggeredBy})`);

    // Execute the job
    const result = await executeManualTrigger(job, {
      dryRun,
      limit,
      searchTerms,
      triggeredBy
    });

    // Log the manual trigger
    await logManualTrigger(
      job, 
      triggeredBy, 
      result.success, 
      result.result, 
      result.error
    );

    return NextResponse.json({
      ...result,
      job,
      dryRun,
      triggeredBy,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[MANUAL] Trigger failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Manual trigger failed',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const auth = verifyAuth(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { 
          success: false, 
          error: auth.error,
          message: 'Authentication required'
        }, 
        { status: 401 }
      );
    }

    // Return available jobs and recent triggers
    const { searchParams } = new URL(request.url);
    const showHistory = searchParams.get('history') === 'true';

    const availableJobs = [
      {
        job: 'product-discovery',
        description: 'Discover new products from Rainforest API',
        schedule: 'Daily at 4 AM',
        priority: 'P1.2'
      },
      {
        job: 'price-sync',
        description: 'Sync product prices from Rainforest API',
        schedule: 'Every hour',
        priority: 'P2.2'
      },
      {
        job: 'full-price-sync',
        description: 'Full price sync for all products',
        schedule: 'Daily at 3 AM',
        priority: 'P2.3'
      },
      {
        job: 'shopify-sync',
        description: 'Sync products to Shopify',
        schedule: 'Every 6 hours',
        priority: 'P2.4'
      },
      {
        job: 'order-sync',
        description: 'Sync orders from all channels',
        schedule: 'Every 15 minutes',
        priority: 'P2.5'
      },
      {
        job: 'daily-stats',
        description: 'Aggregate daily statistics',
        schedule: 'Daily at midnight',
        priority: 'P2.6'
      },
      {
        job: 'ai-scoring',
        description: 'Score products with AI analysis',
        schedule: 'Daily at 2 AM',
        priority: 'Additional'
      },
      {
        job: 'google-shopping',
        description: 'Sync to Google Shopping',
        schedule: 'Daily at 5 AM',
        priority: 'P3.3'
      },
      {
        job: 'omnipresence',
        description: 'Update omnipresence data',
        schedule: 'Daily at 6 AM',
        priority: 'P3.2'
      },
      {
        job: 'daily-learning',
        description: 'Daily learning and optimization',
        schedule: 'Daily at 11 PM',
        priority: 'P3.4'
      }
    ];

    let response: any = {
      success: true,
      availableJobs,
      message: 'Manual trigger endpoint ready'
    };

    if (showHistory) {
      // Get recent manual triggers
      const { data: recentTriggers } = await supabase
        .from('cron_job_logs')
        .select('*')
        .eq('triggered_by', 'manual')
        .order('started_at', { ascending: false })
        .limit(10);

      response.recentTriggers = recentTriggers || [];
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('[MANUAL] GET failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to get job information'
    }, { status: 500 });
  }
}
