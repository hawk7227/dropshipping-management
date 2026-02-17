// app/api/import/quick/route.ts
// Minimal synchronous import - standalone with no complex dependencies

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  console.log('[Quick Import] Starting...');
  
  try {
    const body = await request.json();
    const { items = [], options = {} } = body;

    console.log('[Quick Import] Received items:', items.length);

    if (!items.length) {
      return NextResponse.json({ 
        success: false, 
        error: 'No items provided' 
      }, { status: 400 });
    }

    // Get Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing database configuration' 
      }, { status: 500 });
    }

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
    
    const results = [];
    const errors = [];

    for (const item of items.slice(0, 10)) { // Max 10 items
      const asin = (item.asin || '').toUpperCase().trim();
      
      if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) {
        errors.push({ asin: asin || 'UNKNOWN', error: 'Invalid ASIN' });
        continue;
      }

      try {
        // Check if exists
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('asin', asin)
          .single();

        if (existing) {
          results.push({ asin, status: 'exists', id: existing.id });
          continue;
        }

        // Fetch from Rainforest API if configured
        let title = item.title || `Product ${asin}`;
        let amazonPrice = item.amazon_price || null;
        let imageUrl = null;
        let rating = null;
        let reviewCount = null;

        const rainforestKey = process.env.RAINFOREST_API_KEY;
        if (rainforestKey && options.fetchDetails !== false) {
          console.log(`[Quick Import] Fetching Amazon data for ${asin}`);
          try {
            const res = await fetch(
              `https://api.rainforestapi.com/request?api_key=${rainforestKey}&type=product&amazon_domain=amazon.com&asin=${asin}`
            );
            const data = await res.json();
            
            if (data.product) {
              title = data.product.title || title;
              amazonPrice = data.product.buybox_winner?.price?.value || amazonPrice;
              imageUrl = data.product.main_image?.link;
              rating = data.product.rating;
              reviewCount = data.product.ratings_total;
              console.log(`[Quick Import] Got price: $${amazonPrice}`);
            }
          } catch (e) {
            console.error(`[Quick Import] Rainforest error for ${asin}:`, e);
          }
        }

        // Calculate prices (70% markup)
        const retailPrice = amazonPrice ? Math.round(amazonPrice * 1.7 * 100) / 100 : null;
        const profitAmount = amazonPrice && retailPrice ? Math.round((retailPrice - amazonPrice) * 100) / 100 : null;
        const profitPercent = amazonPrice ? 70 : null;

        const now = new Date().toISOString();
        const productId = crypto.randomUUID();

        // Insert product
        const { error: insertError } = await supabase
          .from('products')
          .insert({
            id: productId,
            title: title.substring(0, 255),
            handle: `product-${asin.toLowerCase()}`,
            asin,
            source: 'rainforest',
            source_product_id: asin,
            source_url: `https://www.amazon.com/dp/${asin}`,
            cost_price: amazonPrice,
            retail_price: retailPrice,
            amazon_price: amazonPrice,
            profit_amount: profitAmount,
            profit_percent: profitPercent,
            profit_status: profitPercent >= 70 ? 'high_profit' : 'profitable',
            rating: rating,
            review_count: reviewCount,
            image_url: imageUrl,
            status: 'active',
            lifecycle_status: 'active',
            inventory_quantity: 0,
            vendor: 'Amazon',
            product_type: 'Imported',
            tags: ['amazon', `asin-${asin}`],
            created_at: now,
            updated_at: now,
            synced_at: now,
          });

        if (insertError) {
          console.error(`[Quick Import] Insert error for ${asin}:`, insertError);
          errors.push({ asin, error: insertError.message });
        } else {
          console.log(`[Quick Import] Created product ${asin}`);
          results.push({ 
            asin, 
            status: 'created', 
            id: productId,
            title: title.substring(0, 50),
            amazonPrice,
            retailPrice
          });
        }

      } catch (itemError: any) {
        console.error(`[Quick Import] Error for ${asin}:`, itemError);
        errors.push({ asin, error: itemError.message });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        processed: items.length,
        created: results.filter(r => r.status === 'created').length,
        existing: results.filter(r => r.status === 'exists').length,
        failed: errors.length,
        results,
        errors
      }
    });

  } catch (error: any) {
    console.error('[Quick Import] Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Import failed'
    }, { status: 500 });
  }
}

// Also support GET for testing
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/import/quick',
    method: 'POST',
    example: {
      items: [{ asin: 'B0BSHF7WHW' }],
      options: { fetchDetails: true }
    }
  });
}
