// app/api/cron/scraper/route.ts
// Vercel Cron Job for Amazon Batch Scraper
// Runs every 5 minutes, processes 5 products per run
// Stays under 60 second Vercel Pro timeout

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { scrapeAmazonProduct } from '@/lib/services/amazon-scraper';
import { SCRAPER_CONFIG } from '@/lib/services/batch-scraper';

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT
// ═══════════════════════════════════════════════════════════════════════════

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CRON JOB HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const supabase = getSupabase();
  
  console.log('[ScraperCron] Starting cron job...');
  
  try {
    // 1. Check if there's an active job
    const { data: activeJob, error: jobError } = await supabase
      .from('scraper_jobs')
      .select('*')
      .in('status', ['running', 'paused'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (jobError || !activeJob) {
      console.log('[ScraperCron] No active scraper job found');
      return NextResponse.json({
        success: true,
        message: 'No active scraper job',
        processed: 0,
      });
    }
    
    console.log(`[ScraperCron] Found job ${activeJob.id}, status: ${activeJob.status}`);
    
    // 2. Check daily/hourly limits
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    if (activeJob.today_count >= SCRAPER_CONFIG.maxPerDay) {
      console.log('[ScraperCron] Daily limit reached');
      return NextResponse.json({
        success: true,
        message: 'Daily limit reached',
        processed: 0,
        todayCount: activeJob.today_count,
      });
    }
    
    if (activeJob.hour_count >= SCRAPER_CONFIG.maxPerHour) {
      // Check if we should reset hourly count
      const lastReset = new Date(activeJob.last_hour_reset);
      if (now.getTime() - lastReset.getTime() >= 60 * 60 * 1000) {
        // Reset hourly count
        await supabase
          .from('scraper_jobs')
          .update({ hour_count: 0, last_hour_reset: now.toISOString() })
          .eq('id', activeJob.id);
      } else {
        console.log('[ScraperCron] Hourly limit reached');
        return NextResponse.json({
          success: true,
          message: 'Hourly limit reached',
          processed: 0,
          hourCount: activeJob.hour_count,
        });
      }
    }
    
    // 3. Get pending ASINs to process
    const { data: pendingItems, error: pendingError } = await supabase
      .from('scraper_progress')
      .select('*')
      .eq('job_id', activeJob.id)
      .eq('status', 'pending')
      .order('batch_number', { ascending: true })
      .limit(SCRAPER_CONFIG.batchSize);
    
    if (pendingError || !pendingItems || pendingItems.length === 0) {
      // No more pending items - mark job as completed
      console.log('[ScraperCron] No pending items, marking job complete');
      
      await supabase
        .from('scraper_jobs')
        .update({ 
          status: 'completed',
          completed_at: now.toISOString(),
        })
        .eq('id', activeJob.id);
      
      return NextResponse.json({
        success: true,
        message: 'Job completed - no more pending items',
        processed: 0,
      });
    }
    
    console.log(`[ScraperCron] Processing ${pendingItems.length} items...`);
    
    // 4. Update job status to running
    await supabase
      .from('scraper_jobs')
      .update({ 
        status: 'running',
        last_activity_at: now.toISOString(),
      })
      .eq('id', activeJob.id);
    
    // 5. Process each ASIN
    let successCount = 0;
    let failedCount = 0;
    const results: any[] = [];
    
    for (const item of pendingItems) {
      const itemStart = Date.now();
      
      // Check if we're approaching timeout (leave 10s buffer)
      if (Date.now() - startTime > 50000) {
        console.log('[ScraperCron] Approaching timeout, stopping early');
        break;
      }
      
      try {
        console.log(`[ScraperCron] Scraping ${item.asin}...`);
        
        // Scrape the product
        const product = await scrapeAmazonProduct(item.asin);
        
        if (product) {
          // Update or insert product
          const { error: upsertError } = await supabase
            .from('products')
            .upsert({
              asin: item.asin,
              title: product.title,
              amazon_cost: product.price,
              images: product.images,
              description: product.description,
              bullet_points: product.bulletPoints,
              brand: product.brand,
              category: product.category,
              availability: product.availability,
              in_stock: product.inStock,
              amazon_url: product.amazonUrl,
              last_scraped_at: now.toISOString(),
              updated_at: now.toISOString(),
            }, {
              onConflict: 'asin',
            });
          
          if (upsertError) {
            console.error(`[ScraperCron] Upsert error for ${item.asin}:`, upsertError);
          }
          
          // Mark as success
          await supabase
            .from('scraper_progress')
            .update({
              status: 'success',
              scraped_at: now.toISOString(),
              processing_time_ms: Date.now() - itemStart,
            })
            .eq('id', item.id);
          
          successCount++;
          results.push({ asin: item.asin, status: 'success' });
        } else {
          throw new Error('No product data returned');
        }
        
      } catch (error) {
        console.error(`[ScraperCron] Error scraping ${item.asin}:`, error);
        
        const attempts = (item.attempts || 0) + 1;
        const maxRetries = SCRAPER_CONFIG.maxRetries;
        
        // Update attempts or mark as failed
        if (attempts >= maxRetries) {
          await supabase
            .from('scraper_progress')
            .update({
              status: 'failed',
              attempts,
              last_error: error instanceof Error ? error.message : 'Unknown error',
            })
            .eq('id', item.id);
          
          failedCount++;
          results.push({ asin: item.asin, status: 'failed', error: String(error) });
        } else {
          await supabase
            .from('scraper_progress')
            .update({
              attempts,
              last_error: error instanceof Error ? error.message : 'Unknown error',
            })
            .eq('id', item.id);
          
          results.push({ asin: item.asin, status: 'retry', attempts });
        }
      }
      
      // Delay between requests
      const delay = SCRAPER_CONFIG.minDelayMs + 
        Math.random() * (SCRAPER_CONFIG.maxDelayMs - SCRAPER_CONFIG.minDelayMs);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    // 6. Update job counters
    const { data: updatedStats } = await supabase
      .from('scraper_progress')
      .select('status')
      .eq('job_id', activeJob.id);
    
    const stats = {
      success: updatedStats?.filter(p => p.status === 'success').length || 0,
      failed: updatedStats?.filter(p => p.status === 'failed').length || 0,
      pending: updatedStats?.filter(p => p.status === 'pending').length || 0,
    };
    
    await supabase
      .from('scraper_jobs')
      .update({
        processed_count: stats.success + stats.failed,
        success_count: stats.success,
        failed_count: stats.failed,
        today_count: (activeJob.today_count || 0) + successCount + failedCount,
        hour_count: (activeJob.hour_count || 0) + successCount + failedCount,
        last_activity_at: now.toISOString(),
      })
      .eq('id', activeJob.id);
    
    // 7. Update health status
    await supabase
      .from('scraper_health')
      .upsert({
        id: 'current',
        status: failedCount > successCount ? 'degraded' : 'healthy',
        active_job_id: activeJob.id,
        metrics: {
          successRate: successCount / (successCount + failedCount) * 100,
          requestsLastHour: activeJob.hour_count + successCount + failedCount,
          requestsToday: activeJob.today_count + successCount + failedCount,
        },
        last_check: now.toISOString(),
        updated_at: now.toISOString(),
      }, {
        onConflict: 'id',
      });
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    console.log(`[ScraperCron] Completed: ${successCount} success, ${failedCount} failed in ${duration}s`);
    
    return NextResponse.json({
      success: true,
      jobId: activeJob.id,
      processed: successCount + failedCount,
      successCount,
      failedCount,
      remaining: stats.pending,
      duration_seconds: duration,
      results,
    });
    
  } catch (error) {
    console.error('[ScraperCron] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
