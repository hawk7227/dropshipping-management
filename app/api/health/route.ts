// app/api/health/route.ts
// Main health check endpoint - aggregates all system health data
// Returns: APIs, Cron Jobs, Database, System Status

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ═══════════════════════════════════════════════════════════════════════════
// CRON JOB DEFINITIONS (from vercel.json)
// ═══════════════════════════════════════════════════════════════════════════

const CRON_DEFINITIONS: Record<string, { name: string; schedule: string; path: string }> = {
  priceSync: {
    name: 'Price Sync',
    schedule: '*/15 * * * *',  // Every 15 minutes
    path: '/api/cron/price-sync',
  },
  productDiscovery: {
    name: 'Product Discovery',
    schedule: '0 4 * * *',  // 4 AM daily
    path: '/api/cron/discovery',
  },
  inventoryCheck: {
    name: 'Inventory Check',
    schedule: '0 * * * *',  // Every hour
    path: '/api/cron/inventory',
  },
  shopifySync: {
    name: 'Shopify Sync',
    schedule: '*/30 * * * *',  // Every 30 minutes
    path: '/api/cron/shopify-sync',
  },
  alertDigest: {
    name: 'Alert Digest',
    schedule: '0 9 * * *',  // 9 AM daily
    path: '/api/cron/alerts',
  },
};

export async function GET() {
  const startTime = Date.now();
  
  try {
    // ─────────────────────────────────────────────────────────────────────────
    // CHECK DATABASE CONNECTION
    // ─────────────────────────────────────────────────────────────────────────
    let dbConnected = false;
    let dbLatency = 0;
    
    try {
      const dbStart = Date.now();
      const { error } = await supabase.from('products').select('count').limit(1).single();
      dbLatency = Date.now() - dbStart;
      dbConnected = !error || error.code === 'PGRST116'; // No rows is still connected
    } catch {
      dbConnected = false;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CHECK API CONFIGURATIONS
    // ─────────────────────────────────────────────────────────────────────────
    
    // Core Product APIs
    const apis = {
      keepa: {
        configured: !!process.env.KEEPA_API_KEY,
        hasKey: !!process.env.KEEPA_API_KEY,
        category: 'products',
      },
      shopify: {
        configured: !!(process.env.SHOPIFY_SHOP_DOMAIN && process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
        hasKey: !!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
        category: 'products',
      },
      rainforest: {
        configured: !!process.env.RAINFOREST_API_KEY,
        hasKey: !!process.env.RAINFOREST_API_KEY,
        category: 'products',
      },
      // Social & Marketing APIs
      zapier: {
        configured: !!process.env.ZAPIER_WEBHOOK_URL,
        hasKey: !!process.env.ZAPIER_WEBHOOK_URL,
        category: 'social',
      },
      openai: {
        configured: !!process.env.OPENAI_API_KEY,
        hasKey: !!process.env.OPENAI_API_KEY,
        category: 'social',
      },
      // Campaign / Messaging APIs
      mailgun: {
        configured: !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN),
        hasKey: !!process.env.MAILGUN_API_KEY,
        category: 'campaigns',
      },
      clicksend: {
        configured: !!(process.env.CLICKSEND_USERNAME && process.env.CLICKSEND_API_KEY),
        hasKey: !!process.env.CLICKSEND_API_KEY,
        category: 'campaigns',
      },
      twilio: {
        configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
        hasKey: !!process.env.TWILIO_AUTH_TOKEN,
        category: 'campaigns',
      },
    };
    
    // Check Social & Marketing status (for Health Monitor display)
    const socialMarketingStatus = {
      configured: apis.zapier.configured || apis.openai.configured,
      zapier: apis.zapier.configured,
      openai: apis.openai.configured,
      message: apis.zapier.configured && apis.openai.configured 
        ? 'Fully configured' 
        : apis.zapier.configured || apis.openai.configured
          ? 'Partially configured'
          : 'Not configured',
    };
    
    // Check Campaigns status
    const campaignsStatus = {
      configured: apis.mailgun.configured || apis.clicksend.configured || apis.twilio.configured,
      email: apis.mailgun.configured,
      sms: apis.clicksend.configured || apis.twilio.configured,
      message: (apis.mailgun.configured || apis.clicksend.configured || apis.twilio.configured)
        ? 'Messaging configured'
        : 'Not configured',
    };

    // ─────────────────────────────────────────────────────────────────────────
    // CHECK CRON JOB STATUS
    // ─────────────────────────────────────────────────────────────────────────
    const cronJobs: Record<string, any> = {};
    
    try {
      // Get latest cron logs
      const { data: logs } = await supabase
        .from('cron_job_logs')
        .select('job_type, status, started_at, completed_at, errors, message')
        .order('started_at', { ascending: false })
        .limit(50);

      // Build latest log per job
      const latestLogs: Record<string, any> = {};
      for (const log of logs || []) {
        if (!latestLogs[log.job_type]) {
          latestLogs[log.job_type] = log;
        }
      }

      // Build cron job status - ACTIVE if schedule is configured
      for (const [key, def] of Object.entries(CRON_DEFINITIONS)) {
        const log = latestLogs[key];
        const hasError = log?.status === 'failed' || log?.errors > 0;
        
        cronJobs[key] = {
          name: def.name,
          schedule: def.schedule,
          path: def.path,
          configured: true, // Has schedule = configured
          status: hasError ? 'warning' : 'active',
          lastRun: log?.completed_at || log?.started_at,
          lastError: hasError ? (log?.message || 'Cron job failed') : undefined,
          lastErrorTime: hasError ? log?.started_at : undefined,
        };
      }
    } catch (cronError) {
      // Table might not exist - show as stub
      console.error('[Health] Cron check error:', cronError);
      for (const [key, def] of Object.entries(CRON_DEFINITIONS)) {
        cronJobs[key] = {
          name: def.name,
          schedule: def.schedule,
          configured: true,
          status: 'stub',
          message: 'cron_job_logs table not found',
        };
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CHECK DATABASE TABLES
    // ─────────────────────────────────────────────────────────────────────────
    const tablesToCheck = [
      'products',
      'price_history', 
      'product_demand',
      'discovery_runs',
      'rejection_log',
      'alerts',
      'cron_job_logs',
    ];

    const tables: Record<string, any> = {};
    
    for (const table of tablesToCheck) {
      try {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        
        if (error) {
          tables[table] = { name: table, status: 'missing', error: error.message };
        } else {
          tables[table] = { name: table, status: 'connected', rows: count || 0 };
        }
      } catch {
        tables[table] = { name: table, status: 'error' };
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CALCULATE OVERALL STATUS
    // ─────────────────────────────────────────────────────────────────────────
    const apiConfigured = Object.values(apis).filter(a => a.configured).length;
    const tablesConnected = Object.values(tables).filter(t => t.status === 'connected').length;
    const cronsActive = Object.values(cronJobs).filter(c => c.status === 'active').length;
    const cronsWithErrors = Object.values(cronJobs).filter(c => c.lastError).length;

    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    
    if (!dbConnected) {
      status = 'critical';
    } else if (apiConfigured < 2 || tablesConnected < 4 || cronsWithErrors > 0) {
      status = 'degraded';
    }

    // Calculate completion percentage
    const maxScore = 5 + 7 + 5; // APIs + Tables + Crons
    const actualScore = apiConfigured + tablesConnected + cronsActive;
    const completion = Math.round((actualScore / maxScore) * 100);

    // ─────────────────────────────────────────────────────────────────────────
    // RETURN RESPONSE
    // ─────────────────────────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      status,
      completion,
      latency: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      
      database: {
        connected: dbConnected,
        latency: dbLatency,
      },
      
      apis,
      cronJobs,
      tables,
      
      // Social & Marketing status for Health Monitor
      socialMarketing: socialMarketingStatus,
      campaigns: campaignsStatus,
      
      summary: {
        apis: { configured: apiConfigured, total: Object.keys(apis).length },
        tables: { connected: tablesConnected, total: tablesToCheck.length },
        crons: { active: cronsActive, errors: cronsWithErrors, total: Object.keys(cronJobs).length },
        social: { configured: socialMarketingStatus.configured },
        campaigns: { configured: campaignsStatus.configured },
      },
    });
  } catch (error) {
    console.error('[Health] Error:', error);
    return NextResponse.json({
      success: false,
      status: 'critical',
      error: error instanceof Error ? error.message : 'Health check failed',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

