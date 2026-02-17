// app/api/health/tables/route.ts
// Returns database table existence and row counts

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

// Tables to check
const TABLES_TO_CHECK = [
  'products',
  'variants', 
  'competitor_prices',
  'price_history',
  'price_sync_jobs',
  'margin_alerts',
  'margin_rules',
  'product_demand',
  'discovery_runs',
  'rejection_log',
  'orders',
  'cron_job_logs',
  'ai_scores',
  'unified_orders',
];

export async function GET() {
  try {
    const tables: Record<string, { exists: boolean; rows?: number; error?: string }> = {};
    
    for (const tableName of TABLES_TO_CHECK) {
      try {
        // Try to count rows in the table
        const { count, error } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true });
        
        if (error) {
          // Table doesn't exist or other error
          if (error.code === '42P01' || error.message.includes('does not exist')) {
            tables[tableName] = { exists: false };
          } else {
            tables[tableName] = { exists: true, error: error.message };
          }
        } else {
          tables[tableName] = { exists: true, rows: count || 0 };
        }
      } catch (err) {
        tables[tableName] = { 
          exists: false, 
          error: err instanceof Error ? err.message : 'Unknown error' 
        };
      }
    }
    
    const existingTables = Object.values(tables).filter(t => t.exists).length;
    const missingTables = Object.values(tables).filter(t => !t.exists).length;
    
    return NextResponse.json({
      success: true,
      tables,
      summary: {
        total: TABLES_TO_CHECK.length,
        existing: existingTables,
        missing: missingTables,
      },
    });
  } catch (error) {
    console.error('[Health/Tables] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check tables',
      tables: {},
    }, { status: 500 });
  }
}
