// app/api/health/route.ts
// Main health check endpoint - aggregates all system health data
// UPDATED: Matches actual Vercel environment variable names

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabaseClient() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

// ═══════════════════════════════════════════════════════════════════════════
// CRON JOB DEFINITIONS (from vercel.json)
// ═══════════════════════════════════════════════════════════════════════════

const CRON_DEFINITIONS: Record<string, { name: string; schedule: string; path: string }> = {
  priceSync: {
    name: 'Price Sync',
    schedule: '*/15 * * * *',
    path: '/api/cron/price-sync',
  },
  productDiscovery: {
    name: 'Product Discovery',
    schedule: '0 4 * * *',
    path: '/api/cron/discovery',
  },
  inventoryCheck: {
    name: 'Inventory Check',
    schedule: '0 * * * *',
    path: '/api/cron/inventory',
  },
  shopifySync: {
    name: 'Shopify Sync',
    schedule: '*/30 * * * *',
    path: '/api/cron/shopify-sync',
  },
  alertDigest: {
    name: 'Alert Digest',
    schedule: '0 9 * * *',
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
      const { error } = await getSupabaseClient().from('products').select('count').limit(1).single();
      dbLatency = Date.now() - dbStart;
      dbConnected = !error || error.code === 'PGRST116';
    } catch {
      dbConnected = false;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CHECK API CONFIGURATIONS - Using YOUR actual variable names
    // ─────────────────────────────────────────────────────────────────────────
    
    const apis = {
      // ═══ CORE PRODUCT APIs ═══
      keepa: {
        name: 'Keepa API',
        configured: !!process.env.KEEPA_API_KEY,
        category: 'products',
      },
      shopify: {
        name: 'Shopify API',
        // YOUR variable is SHOPIFY_STORE_DOMAIN not SHOPIFY_SHOP_DOMAIN
        configured: !!(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
        category: 'products',
      },
      rainforest: {
        name: 'Rainforest API',
        configured: !!process.env.RAINFOREST_API_KEY,
        category: 'products',
      },
      
      // ═══ MARKETPLACE APIs ═══
      amazon: {
        name: 'Amazon SP-API',
        configured: !!(process.env.AMAZON_SELLER_ID && process.env.AMAZON_MWS_TOKEN),
        category: 'marketplace',
      },
      ebay: {
        name: 'eBay API',
        configured: !!process.env.EBAY_AUTH_TOKEN,
        category: 'marketplace',
      },
      tiktokShop: {
        name: 'TikTok Shop',
        configured: !!(process.env.TIKTOK_SHOP_ID && process.env.TIKTOK_ACCESS_TOKEN),
        category: 'marketplace',
      },
      googleMerchant: {
        name: 'Google Merchant',
        configured: !!(process.env.GOOGLE_MERCHANT_ID && process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
        category: 'marketplace',
      },
      
      // ═══ AI & SOCIAL APIs ═══
      openai: {
        name: 'OpenAI',
        configured: !!process.env.OPENAI_API_KEY,
        category: 'social',
      },
      zapier: {
        name: 'Zapier',
        configured: !!process.env.ZAPIER_WEBHOOK_URL,
        category: 'social',
      },
      
      // ═══ MESSAGING APIs ═══
      sendgrid: {
        name: 'SendGrid (Email)',
        configured: !!(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL),
        category: 'messaging',
      },
      mailgun: {
        name: 'Mailgun (Email)',
        configured: !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN),
        category: 'messaging',
      },
      twilio: {
        name: 'Twilio (SMS)',
        configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
        category: 'messaging',
      },
      clicksend: {
        name: 'ClickSend (SMS)',
        configured: !!(process.env.CLICKSEND_USERNAME && process.env.CLICKSEND_API_KEY),
        category: 'messaging',
      },
      
      // ═══ PAYMENT ═══
      stripe: {
        name: 'Stripe',
        configured: !!process.env.STRIPE_SECRET_KEY,
        category: 'payment',
      },
    };
    
    // Calculate category statuses
    const productApis = Object.values(apis).filter(a => a.category === 'products');
    const marketplaceApis = Object.values(apis).filter(a => a.category === 'marketplace');
    const socialApis = Object.values(apis).filter(a => a.category === 'social');
    const messagingApis = Object.values(apis).filter(a => a.category === 'messaging');
    
    const productsStatus = {
      configured: productApis.some(a => a.configured),
      count: productApis.filter(a => a.configured).length,
      total: productApis.length,
      message: `${productApis.filter(a => a.configured).length}/${productApis.length} configured`,
    };
    
    const marketplaceStatus = {
      configured: marketplaceApis.some(a => a.configured),
      count: marketplaceApis.filter(a => a.configured).length,
      total: marketplaceApis.length,
      message: `${marketplaceApis.filter(a => a.configured).length}/${marketplaceApis.length} configured`,
    };
    
    const socialMarketingStatus = {
      configured: socialApis.some(a => a.configured),
      count: socialApis.filter(a => a.configured).length,
      total: socialApis.length,
      message: `${socialApis.filter(a => a.configured).length}/${socialApis.length} configured`,
    };
    
    const campaignsStatus = {
      configured: messagingApis.some(a => a.configured),
      count: messagingApis.filter(a => a.configured).length,
      total: messagingApis.length,
      email: apis.sendgrid.configured,
      sms: apis.twilio.configured,
      message: `${messagingApis.filter(a => a.configured).length}/${messagingApis.length} configured`,
    };

    // ─────────────────────────────────────────────────────────────────────────
    // CHECK CRON JOB STATUS
    // ─────────────────────────────────────────────────────────────────────────
    const cronJobs: Record<string, any> = {};
    
    for (const [key, def] of Object.entries(CRON_DEFINITIONS)) {
      let lastRun = null;
      let lastError = null;
      let lastErrorTime = null;
      
      try {
        const { data } = await getSupabaseClient()
          .from('cron_job_logs')
          .select('*')
          .eq('job_name', key)
          .order('started_at', { ascending: false })
          .limit(1)
          .single();
        
        if (data) {
          lastRun = {
            status: data.status,
            timestamp: data.started_at,
            duration: data.duration_ms,
            processed: data.processed_count,
            errors: data.error_count,
          };
          if (data.status === 'failed' && data.error_message) {
            lastError = data.error_message;
            lastErrorTime = data.started_at;
          }
        }
      } catch {}
      
      cronJobs[key] = {
        name: def.name,
        schedule: def.schedule,
        path: def.path,
        configured: !!process.env.CRON_SECRET,
        status: process.env.CRON_SECRET ? 'active' : 'inactive',
        lastRun,
        lastError,
        lastErrorTime,
      };
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
      'scraper_jobs',
      'scraper_progress',
      'scraper_health',
    ];

    const tables: Record<string, any> = {};
    
    for (const table of tablesToCheck) {
      try {
        const { count, error } = await getSupabaseClient()
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
    // CHECK SCRAPER STATUS
    // ─────────────────────────────────────────────────────────────────────────
    let scraperStatus: any = {
      status: 'idle',
      configured: true,
      activeJob: null,
      health: null,
    };

    try {
      const { data: healthData } = await getSupabaseClient()
        .from('scraper_health')
        .select('*')
        .eq('id', 'current')
        .single();

      if (healthData) {
        scraperStatus.health = {
          status: healthData.status,
          lastCheck: healthData.last_check,
          metrics: healthData.metrics,
          warnings: healthData.warnings,
          errors: healthData.errors,
        };
        scraperStatus.status = healthData.status;
      }

      const { data: activeJob } = await getSupabaseClient()
        .from('scraper_jobs')
        .select('*')
        .in('status', ['running', 'paused'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (activeJob) {
        scraperStatus.activeJob = {
          id: activeJob.id,
          status: activeJob.status,
          totalAsins: activeJob.total_asins,
          processedCount: activeJob.processed_count,
          successCount: activeJob.success_count,
          failedCount: activeJob.failed_count,
          progressPercent: activeJob.total_asins > 0 
            ? Math.round((activeJob.processed_count / activeJob.total_asins) * 100) 
            : 0,
          currentBatch: activeJob.current_batch,
          totalBatches: activeJob.total_batches,
          avgProcessingTimeMs: activeJob.avg_processing_time_ms,
          consecutiveFailures: activeJob.consecutive_failures,
          circuitBreakerTripped: activeJob.circuit_breaker_tripped,
          todayCount: activeJob.today_count,
          startedAt: activeJob.started_at,
          lastActivityAt: activeJob.last_activity_at,
        };
        scraperStatus.status = activeJob.status;
      }
    } catch (e) {
      scraperStatus.configured = false;
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
    } else if (apiConfigured < 3 || tablesConnected < 5 || cronsWithErrors > 0) {
      status = 'degraded';
    }

    // Calculate completion percentage
    const maxScore = Object.keys(apis).length + tablesToCheck.length + Object.keys(CRON_DEFINITIONS).length;
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
      
      // Scraper status
      scraper: scraperStatus,
      
      // Category summaries
      products: productsStatus,
      marketplace: marketplaceStatus,
      socialMarketing: socialMarketingStatus,
      campaigns: campaignsStatus,
      
      summary: {
        apis: { configured: apiConfigured, total: Object.keys(apis).length },
        tables: { connected: tablesConnected, total: tablesToCheck.length },
        crons: { active: cronsActive, errors: cronsWithErrors, total: Object.keys(cronJobs).length },
        scraper: { status: scraperStatus.status, hasActiveJob: !!scraperStatus.activeJob },
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

