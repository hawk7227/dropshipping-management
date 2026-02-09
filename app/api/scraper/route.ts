// app/api/scraper/route.ts
// API endpoint for controlling the batch scraper
// Supports: start, stop, pause, resume, status

import { NextRequest, NextResponse } from 'next/server';
import {
  startBatchScrape,
  stopBatchScrape,
  pauseBatchScrape,
  resumeBatchScrape,
  getCurrentJob,
  getJob,
  getScraperHealth,
  updateScraperHealth,
  SCRAPER_CONFIG,
  type BatchJob,
  type ScraperHealth,
} from '@/lib/services/batch-scraper';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ScraperResponse {
  success: boolean;
  action: string;
  job?: BatchJob | null;
  health?: ScraperHealth | null;
  config?: typeof SCRAPER_CONFIG;
  message?: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// GET - Get scraper status and health
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest): Promise<NextResponse<ScraperResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    
    let job: BatchJob | null = null;
    
    if (jobId) {
      job = await getJob(jobId);
    } else {
      job = getCurrentJob();
    }
    
    const health = await getScraperHealth();
    
    return NextResponse.json({
      success: true,
      action: 'status',
      job,
      health,
      config: SCRAPER_CONFIG,
    });
    
  } catch (error) {
    console.error('[ScraperAPI] GET error:', error);
    return NextResponse.json({
      success: false,
      action: 'status',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST - Control scraper actions
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest): Promise<NextResponse<ScraperResponse>> {
  try {
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      return NextResponse.json({
        success: false,
        action: 'unknown',
        error: 'Invalid JSON in request body',
      }, { status: 400 });
    }
    
    const { action, asins, jobId } = body as {
      action: 'start' | 'stop' | 'pause' | 'resume';
      asins?: string[];
      jobId?: string;
    };
    
    if (!action) {
      return NextResponse.json({
        success: false,
        action: 'unknown',
        error: 'No action specified',
      }, { status: 400 });
    }
    
    switch (action) {
      case 'start': {
        if (!asins || !Array.isArray(asins) || asins.length === 0) {
          return NextResponse.json({
            success: false,
            action: 'start',
            error: 'No ASINs provided',
          }, { status: 400 });
        }
        
        // Validate ASINs
        const validAsins = asins.filter(asin => 
          typeof asin === 'string' && 
          /^B[0-9A-Z]{9}$/.test(asin.toUpperCase())
        );
        
        if (validAsins.length === 0) {
          return NextResponse.json({
            success: false,
            action: 'start',
            error: 'No valid ASINs provided (format: B followed by 9 alphanumeric characters)',
          }, { status: 400 });
        }
        
        console.log(`[ScraperAPI] Starting batch scrape with ${validAsins.length} ASINs`);
        
        try {
          const job = await startBatchScrape(validAsins.map(a => a.toUpperCase()));
          
          return NextResponse.json({
            success: true,
            action: 'start',
            job,
            message: `Started scraping ${validAsins.length} products. Estimated time: ${estimateTime(validAsins.length)}`,
          });
        } catch (startError) {
          console.error('[ScraperAPI] Start error:', startError);
          return NextResponse.json({
            success: false,
            action: 'start',
            error: startError instanceof Error ? startError.message : 'Failed to start scraper',
          }, { status: 500 });
        }
      }
      
      case 'stop': {
        try {
          await stopBatchScrape();
          const job = getCurrentJob();
          
          return NextResponse.json({
            success: true,
            action: 'stop',
            job,
            message: 'Scraper stopped. Progress has been saved and can be resumed.',
          });
        } catch (stopError) {
          console.error('[ScraperAPI] Stop error:', stopError);
          return NextResponse.json({
            success: false,
            action: 'stop',
            error: stopError instanceof Error ? stopError.message : 'Failed to stop scraper',
          }, { status: 500 });
        }
      }
      
      case 'pause': {
        try {
          await pauseBatchScrape();
          const job = getCurrentJob();
          
          return NextResponse.json({
            success: true,
            action: 'pause',
            job,
            message: 'Scraper paused. Use resume to continue.',
          });
        } catch (pauseError) {
          console.error('[ScraperAPI] Pause error:', pauseError);
          return NextResponse.json({
            success: false,
            action: 'pause',
            error: pauseError instanceof Error ? pauseError.message : 'Failed to pause scraper',
          }, { status: 500 });
        }
      }
      
      case 'resume': {
        try {
          const job = await resumeBatchScrape(jobId);
          
          return NextResponse.json({
            success: true,
            action: 'resume',
            job,
            message: 'Scraper resumed.',
          });
        } catch (resumeError) {
          console.error('[ScraperAPI] Resume error:', resumeError);
          return NextResponse.json({
            success: false,
            action: 'resume',
            error: resumeError instanceof Error ? resumeError.message : 'Failed to resume scraper',
          }, { status: 500 });
        }
      }
      
      default:
        return NextResponse.json({
          success: false,
          action: action || 'unknown',
          error: `Invalid action: ${action}. Valid actions: start, stop, pause, resume`,
        }, { status: 400 });
    }
    
  } catch (error) {
    console.error('[ScraperAPI] POST error:', error);
    return NextResponse.json({
      success: false,
      action: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function estimateTime(asinCount: number): string {
  // Average 5 seconds per ASIN + batch pauses
  const avgTimePerAsin = 5000; // 5 seconds
  const batchSize = SCRAPER_CONFIG.batchSize;
  const batchPause = SCRAPER_CONFIG.batchPauseMs;
  const batches = Math.ceil(asinCount / batchSize);
  
  const totalMs = (asinCount * avgTimePerAsin) + (batches * batchPause);
  
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `~${days} day${days > 1 ? 's' : ''}`;
  } else if (hours > 0) {
    return `~${hours}h ${minutes}m`;
  } else {
    return `~${minutes} minutes`;
  }
}

