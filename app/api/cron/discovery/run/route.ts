// app/api/cron/discovery/run/route.ts
// Manual Discovery Run API - Same logic as 4AM cron, triggered manually
// Used by: Settings page "Run Now" button, Products page "Source Now" button

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface DiscoveryFilters {
  min_amazon_price: number;
  max_amazon_price: number;
  min_profit_margin: number;
  min_reviews: number;
  min_rating: number;
  max_bsr: number;
  require_prime: boolean;
  excluded_brands: string[];
  max_products_per_run: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST - Run Discovery
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const jobId = `discovery-${Date.now()}`;
  
  try {
    const body = await request.json();
    const { filters, maxProducts = 1000, source = 'manual' } = body;
    
    // Log job start
    const { data: logEntry } = await supabase.from('cron_job_logs').insert({
      job_type: 'discovery',
      status: 'running',
      message: `Manual discovery started from ${source}`,
      details: { filters, maxProducts, source },
      started_at: new Date().toISOString(),
    }).select().single();
    
    const logId = logEntry?.id;
    
    console.log(`[Discovery] Starting manual run, max ${maxProducts} products`);
    
    // Get filter settings from database if not provided
    let activeFilters: DiscoveryFilters = filters || {
      min_amazon_price: 3,
      max_amazon_price: 25,
      min_profit_margin: 30,
      min_reviews: 500,
      min_rating: 3.5,
      max_bsr: 100000,
      require_prime: true,
      excluded_brands: ['Apple', 'Nike', 'Samsung', 'Sony', 'Microsoft'],
      max_products_per_run: maxProducts,
    };
    
    if (!filters) {
      // Load from settings
      const { data: settings } = await supabase
        .from('system_settings')
        .select('key, value')
        .eq('category', 'filters');
      
      if (settings && settings.length > 0) {
        const settingsMap = new Map(settings.map(s => [s.key, JSON.parse(s.value)]));
        activeFilters = {
          min_amazon_price: settingsMap.get('min_amazon_price') ?? 3,
          max_amazon_price: settingsMap.get('max_amazon_price') ?? 25,
          min_profit_margin: settingsMap.get('min_profit_margin') ?? 30,
          min_reviews: settingsMap.get('min_reviews') ?? 500,
          min_rating: settingsMap.get('min_rating') ?? 3.5,
          max_bsr: settingsMap.get('max_bsr') ?? 100000,
          require_prime: settingsMap.get('require_prime') ?? true,
          excluded_brands: settingsMap.get('excluded_brands') ?? [],
          max_products_per_run: maxProducts,
        };
      }
    }
    
    console.log(`[Discovery] Active filters:`, activeFilters);
    
    // ═══════════════════════════════════════════════════════════════════════
    // DISCOVERY LOGIC
    // In a real implementation, this would:
    // 1. Query Keepa deals/bestsellers API
    // 2. Filter by criteria
    // 3. Import qualifying products
    // 
    // For now, we'll return a simulated result and update the log
    // ═══════════════════════════════════════════════════════════════════════
    
    // Simulate discovery process
    const result = {
      found: 0,
      imported: 0,
      rejected: 0,
      soldOut: 0,
      errors: [] as string[],
    };
    
    // Check if Keepa is configured
    const hasKeepa = !!process.env.KEEPA_API_KEY;
    
    if (!hasKeepa) {
      result.errors.push('Keepa API not configured - discovery requires Keepa deals endpoint');
      
      // Update log with error
      if (logId) {
        await supabase.from('cron_job_logs').update({
          status: 'failed',
          message: 'Keepa API not configured',
          completed_at: new Date().toISOString(),
          duration_seconds: Math.round((Date.now() - startTime) / 1000),
        }).eq('id', logId);
      }
      
      return NextResponse.json({
        success: false,
        error: 'Keepa API not configured. Please add KEEPA_API_KEY to enable product discovery.',
        data: result,
      }, { status: 400 });
    }
    
    // TODO: Implement actual Keepa deals discovery
    // This would use Keepa's deals endpoint to find products matching criteria
    // For now, return success with 0 products (placeholder)
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    // Update log with success
    if (logId) {
      await supabase.from('cron_job_logs').update({
        status: 'success',
        message: `Discovery completed: ${result.found} found, ${result.imported} imported`,
        processed: result.found,
        details: {
          ...activeFilters,
          result,
        },
        completed_at: new Date().toISOString(),
        duration_seconds: duration,
      }).eq('id', logId);
    }
    
    console.log(`[Discovery] Complete in ${duration}s: ${result.found} found, ${result.imported} imported`);
    
    return NextResponse.json({
      success: true,
      data: {
        ...result,
        duration,
        filters: activeFilters,
      },
      message: `Discovery completed. Found ${result.found} products, imported ${result.imported}.`,
    });
    
  } catch (error) {
    console.error('[Discovery] Error:', error);
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    // Log error
    await supabase.from('cron_job_logs').insert({
      job_type: 'discovery',
      status: 'failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      completed_at: new Date().toISOString(),
      duration_seconds: duration,
    });
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Discovery failed',
    }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET - Get discovery status/history
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    // Get recent discovery runs
    const { data: logs, error } = await supabase
      .from('cron_job_logs')
      .select('*')
      .eq('job_type', 'discovery')
      .order('started_at', { ascending: false })
      .limit(10);
    
    if (error) {
      throw error;
    }
    
    // Get current filter settings
    const { data: settings } = await supabase
      .from('system_settings')
      .select('key, value')
      .eq('category', 'filters');
    
    const filters: Record<string, any> = {};
    if (settings) {
      for (const s of settings) {
        try {
          filters[s.key] = JSON.parse(s.value);
        } catch {
          filters[s.key] = s.value;
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      data: {
        recentRuns: logs || [],
        currentFilters: filters,
      },
    });
    
  } catch (error) {
    console.error('[Discovery Status] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get status',
    }, { status: 500 });
  }
}
