// app/api/import/test/route.ts
// Diagnostic endpoint to test import dependencies

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: {},
    database: {},
    rainforest: {},
    tests: []
  };

  // 1. Check environment variables
  diagnostics.environment = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    RAINFOREST_API_KEY: !!process.env.RAINFOREST_API_KEY,
    KEEPA_API_KEY: !!process.env.KEEPA_API_KEY,
  };

  // 2. Test Supabase connection
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      diagnostics.database = { 
        connected: false, 
        error: 'Missing Supabase credentials' 
      };
    } else {
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
      
      // Test query
      const { data, error } = await supabase
        .from('products')
        .select('id, title')
        .limit(1);

      if (error) {
        diagnostics.database = { 
          connected: false, 
          error: error.message,
          code: error.code 
        };
      } else {
        diagnostics.database = { 
          connected: true, 
          productCount: data?.length || 0,
          canQuery: true 
        };

        // Test insert capability (dry run - we'll rollback)
        const testId = `test-${Date.now()}`;
        const { error: insertError } = await supabase
          .from('products')
          .insert({
            id: testId,
            title: 'Test Product - DELETE ME',
            handle: 'test-product',
            status: 'draft',
            source: 'test',
          });

        if (insertError) {
          diagnostics.database.canInsert = false;
          diagnostics.database.insertError = insertError.message;
        } else {
          // Clean up test product
          await getSupabaseClient().from('products').delete().eq('id', testId);
          diagnostics.database.canInsert = true;
        }
      }
    }
  } catch (e: any) {
    diagnostics.database = { 
      connected: false, 
      error: e.message 
    };
  }

  // 3. Test Rainforest API (if key exists)
  if (process.env.RAINFOREST_API_KEY) {
    try {
      const testAsin = 'B0BSHF7WHW'; // A common Amazon product
      const response = await fetch(
        `https://api.rainforestapi.com/request?api_key=${process.env.RAINFOREST_API_KEY}&type=product&amazon_domain=amazon.com&asin=${testAsin}`
      );
      
      const data = await response.json();
      
      if (data.product) {
        diagnostics.rainforest = {
          connected: true,
          testAsin,
          productTitle: data.product.title?.substring(0, 50) + '...',
          hasPrice: !!data.product.buybox_winner?.price?.value,
          price: data.product.buybox_winner?.price?.value || null
        };
      } else if (data.request_info?.success === false) {
        diagnostics.rainforest = {
          connected: false,
          error: data.request_info?.message || 'API request failed',
          credits_remaining: data.request_info?.credits_remaining
        };
      } else {
        diagnostics.rainforest = {
          connected: true,
          testAsin,
          productFound: false,
          rawResponse: JSON.stringify(data).substring(0, 200)
        };
      }
    } catch (e: any) {
      diagnostics.rainforest = {
        connected: false,
        error: e.message
      };
    }
  } else {
    diagnostics.rainforest = {
      connected: false,
      error: 'RAINFOREST_API_KEY not configured'
    };
  }

  // 4. Check products table schema
  try {
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

    // Check if critical columns exist by trying to select them
    const { error: schemaError } = await supabase
      .from('products')
      .select('id, asin, cost_price, retail_price, amazon_price, profit_status, source')
      .limit(0);

    if (schemaError) {
      diagnostics.tests.push({
        name: 'Schema check',
        passed: false,
        error: schemaError.message
      });
    } else {
      diagnostics.tests.push({
        name: 'Schema check',
        passed: true,
        message: 'All critical columns exist'
      });
    }
  } catch (e: any) {
    diagnostics.tests.push({
      name: 'Schema check',
      passed: false,
      error: e.message
    });
  }

  // Summary
  const allPassed = 
    diagnostics.environment.NEXT_PUBLIC_SUPABASE_URL &&
    diagnostics.environment.SUPABASE_SERVICE_ROLE_KEY &&
    diagnostics.database.connected &&
    diagnostics.database.canInsert;

  diagnostics.summary = {
    ready: allPassed,
    issues: []
  };

  if (!diagnostics.environment.NEXT_PUBLIC_SUPABASE_URL) {
    diagnostics.summary.issues.push('Missing NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!diagnostics.environment.SUPABASE_SERVICE_ROLE_KEY) {
    diagnostics.summary.issues.push('Missing SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!diagnostics.environment.RAINFOREST_API_KEY) {
    diagnostics.summary.issues.push('Missing RAINFOREST_API_KEY - imports will work but without Amazon data');
  }
  if (!diagnostics.database.connected) {
    diagnostics.summary.issues.push('Cannot connect to Supabase');
  }
  if (!diagnostics.database.canInsert) {
    diagnostics.summary.issues.push('Cannot insert into products table - check RLS policies');
  }

  return NextResponse.json(diagnostics, { 
    status: allPassed ? 200 : 500 
  });
}

