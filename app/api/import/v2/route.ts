// app/api/import/v2/route.ts
// ENHANCED Import API v2 - Uses Keepa to fetch ALL product data
// Fixes the issue: Products now have title, image, price, rating, etc.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enrichProductsWithKeepa, getTokenUsage } from '@/lib/services/keepa-enhanced';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

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

const BATCH_SIZE = 50;
const MAX_ITEMS_PER_IMPORT = 1000;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ImportRequest {
  asins: string[];
  mode: 'full_import' | 'verify_prices';
  options?: {
    skipCache?: boolean;
    autoApprove?: boolean;
    markupPercent?: number;
    goToStaging?: boolean; // If true, products go to staging table first
  };
  // For verify mode - existing product data
  existingData?: Array<{
    asin: string;
    title?: string;
    yourPrice?: number;
    yourCost?: number;
    images?: string[];
    [key: string]: any;
  }>;
}

interface ImportResult {
  success: boolean;
  jobId: string;
  totalProducts: number;
  imported: number;
  updated: number;
  rejected: number;
  soldOut: number;
  errors: Array<{ asin: string; error: string }>;
  tokensUsed: number;
  tokensSaved: number;
  products: Array<{
    asin: string;
    title: string;
    image: string | null;
    amazonPrice: number | null;
    yourPrice: number | null;
    profitPercent: number | null;
    status: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function isValidAsin(asin: string): boolean {
  return /^[A-Z0-9]{10}$/.test(asin.toUpperCase());
}

function extractAsinFromUrl(url: string): string | null {
  // Match ASIN in Amazon URLs
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
    /asin=([A-Z0-9]{10})/i,
    /\b(B[A-Z0-9]{9})\b/i, // Standalone B0xxxxxxxx
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  
  return null;
}

function generateJobId(): string {
  return `import-v2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST - Start Import
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body: ImportRequest = await request.json();
    const { asins: rawAsins, mode, options = {}, existingData } = body;
    
    if (!rawAsins || !Array.isArray(rawAsins) || rawAsins.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No ASINs provided' },
        { status: 400 }
      );
    }
    
    // Validate and extract ASINs
    const validAsins: string[] = [];
    const invalidAsins: Array<{ input: string; error: string }> = [];
    
    for (const input of rawAsins) {
      const trimmed = String(input).trim().toUpperCase();
      
      if (isValidAsin(trimmed)) {
        validAsins.push(trimmed);
      } else {
        // Try extracting from URL
        const extracted = extractAsinFromUrl(trimmed);
        if (extracted) {
          validAsins.push(extracted);
        } else if (trimmed.length > 0) {
          invalidAsins.push({ input: trimmed, error: 'Invalid ASIN format' });
        }
      }
    }
    
    // Deduplicate
    const uniqueAsins = [...new Set(validAsins)];
    
    if (uniqueAsins.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid ASINs found', invalidAsins },
        { status: 400 }
      );
    }
    
    // Limit batch size
    const asinsToProcess = uniqueAsins.slice(0, MAX_ITEMS_PER_IMPORT);
    
    console.log(`[Import V2] Starting ${mode} for ${asinsToProcess.length} ASINs`);
    
    // Check token availability
    const tokenUsage = await getTokenUsage();
    const estimatedTokens = asinsToProcess.length;
    
    if (tokenUsage.remaining < estimatedTokens) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Insufficient Keepa tokens. Need ${estimatedTokens}, have ${tokenUsage.remaining}`,
          tokenUsage,
        },
        { status: 400 }
      );
    }
    
    // Create import batch record
    const jobId = generateJobId();
    const now = new Date().toISOString();
    
    await getSupabaseClient().from('import_batches').insert({
      id: jobId,
      job_type: mode,
      status: 'processing',
      total_products: asinsToProcess.length,
      started_at: now,
      settings_snapshot: options,
    });
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Fetch data from Keepa
    // ═══════════════════════════════════════════════════════════════════════
    
    const keepaResult = await enrichProductsWithKeepa(asinsToProcess, {
      skipCache: options.skipCache,
      markupPercent: options.markupPercent || 70,
    });
    
    console.log(`[Import V2] Keepa returned ${keepaResult.products.length} products`);
    
    // Build product map
    const keepaMap = new Map(keepaResult.products.map(p => [p.asin, p]));
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Merge with existing data (for verify mode)
    // ═══════════════════════════════════════════════════════════════════════
    
    const existingDataMap = new Map(
      (existingData || []).map(d => [d.asin?.toUpperCase(), d])
    );
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Check for existing products in database
    // ═══════════════════════════════════════════════════════════════════════
    
    const { data: existingProducts } = await getSupabaseClient()
      .from('products')
      .select('asin')
      .in('asin', asinsToProcess);
    
    const existingDbAsins = new Set((existingProducts || []).map(p => p.asin));
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: Build products to insert/update
    // ═══════════════════════════════════════════════════════════════════════
    
    const result: ImportResult = {
      success: true,
      jobId,
      totalProducts: asinsToProcess.length,
      imported: 0,
      updated: 0,
      rejected: 0,
      soldOut: 0,
      errors: [],
      tokensUsed: keepaResult.tokensUsed,
      tokensSaved: keepaResult.tokensSaved,
      products: [],
    };
    
    const productsToInsert: any[] = [];
    const productsToUpdate: any[] = [];
    
    for (const asin of asinsToProcess) {
      const keepaData = keepaMap.get(asin);
      const existingFileData = existingDataMap.get(asin);
      const existsInDb = existingDbAsins.has(asin);
      
      // If no Keepa data, mark as error
      if (!keepaData) {
        result.errors.push({ asin, error: 'No data from Keepa' });
        continue;
      }
      
      // Check if sold out
      if (keepaData.availability === 'out_of_stock' || keepaData.amazonPrice === null) {
        result.soldOut++;
        result.products.push({
          asin,
          title: keepaData.title || `Product ${asin}`,
          image: keepaData.mainImage,
          amazonPrice: keepaData.amazonPrice,
          yourPrice: existingFileData?.yourPrice || keepaData.yourPrice,
          profitPercent: null,
          status: 'sold_out',
        });
        continue;
      }
      
      // Determine status based on mode and data
      let status = options.autoApprove ? 'active' : 'pending_review';
      
      // Build product record
      const productRecord = {
        asin: asin,
        title: keepaData.title || existingFileData?.title || `Product ${asin}`,
        handle: `product-${asin.toLowerCase()}`,
        description: keepaData.description || null,
        
        // AI-optimized title (Spec Item 33) — set below after optimization
        original_title: keepaData.title || existingFileData?.title || `Product ${asin}`,
        
        // Images - THIS IS THE KEY FIX
        image_url: keepaData.mainImage,
        images: keepaData.images,
        
        // Pricing
        amazon_price: keepaData.amazonPrice,
        cost: keepaData.amazonPrice,
        price: existingFileData?.yourPrice || keepaData.yourPrice,
        compare_at_price: keepaData.compareAtPrice,
        profit_amount: keepaData.profitAmount,
        profit_percent: keepaData.profitPercent,
        
        // Metrics from Keepa
        rating: keepaData.rating,
        reviews: keepaData.reviewCount,
        bsr: keepaData.bsr,
        is_prime: keepaData.isPrime,
        
        // Category & Brand
        category: keepaData.category,
        vendor: keepaData.brand,
        tags: keepaData.categoryTree?.slice(0, 3).join(', ') || null,
        
        // Additional data
        features: keepaData.features,
        upc: keepaData.upc,
        weight: keepaData.dimensions?.weight,
        parent_asin: keepaData.parentAsin,
        seller_count: keepaData.sellerCount,
        
        // URLs
        source_url: `https://www.amazon.com/dp/${asin}`,
        source: 'imported',
        
        // Status
        status: status,
        
        // Tracking
        has_keepa_data: true,
        keepa_cached_at: keepaData.fetchedAt,
        last_price_check: now,
        import_batch_id: jobId,
        
        // Timestamps
        updated_at: now,
      };
      
      if (existsInDb) {
        productsToUpdate.push(productRecord);
      } else {
        productsToInsert.push({
          ...productRecord,
          created_at: now,
        });
      }
      
      result.products.push({
        asin,
        title: productRecord.title,
        image: productRecord.image_url,
        amazonPrice: productRecord.amazon_price,
        yourPrice: productRecord.price,
        profitPercent: productRecord.profit_percent,
        status: status,
      });
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4.5: AI Title Optimization (Spec Item 33)
    // Optimizes titles for Google Shopping + SEO if OPENAI_API_KEY is set
    // Falls back to raw title if AI unavailable or fails
    // ═══════════════════════════════════════════════════════════════════════
    
    const allProducts = [...productsToInsert, ...productsToUpdate];
    if (process.env.OPENAI_API_KEY && allProducts.length > 0) {
      console.log(`[Import V2] Optimizing ${allProducts.length} titles with AI...`);
      try {
        const { optimizeTitle } = await import('@/lib/ai-optimization');
        
        // Process in parallel batches of 5 to avoid rate limits
        const BATCH_SIZE = 5;
        for (let i = 0; i < allProducts.length; i += BATCH_SIZE) {
          const batch = allProducts.slice(i, i + BATCH_SIZE);
          const optimizations = await Promise.allSettled(
            batch.map(async (prod) => {
              const aiProduct = {
                id: prod.asin,
                title: prod.original_title || prod.title,
                description: prod.description || '',
                price: prod.price || 0,
                costPrice: prod.cost || prod.amazon_price,
                category: prod.category,
              };
              const result = await optimizeTitle(aiProduct);
              return { asin: prod.asin, optimizedTitle: result.title, score: result.score };
            })
          );
          
          // Apply successful optimizations
          for (const opt of optimizations) {
            if (opt.status === 'fulfilled' && opt.value.optimizedTitle) {
              const target = allProducts.find(p => p.asin === opt.value.asin);
              if (target && opt.value.score > 40) {
                target.title = opt.value.optimizedTitle;
                target.ai_title_score = opt.value.score;
                target.ai_optimized_at = new Date().toISOString();
              }
            }
          }
        }
        console.log(`[Import V2] AI title optimization complete`);
      } catch (aiErr) {
        // Non-fatal — continue with raw titles
        console.warn('[Import V2] AI title optimization skipped:', aiErr instanceof Error ? aiErr.message : aiErr);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: Insert/Update database
    // ═══════════════════════════════════════════════════════════════════════
    
    // Insert new products
    if (productsToInsert.length > 0) {
      const { error: insertError } = await getSupabaseClient()
        .from('products')
        .insert(productsToInsert);
      
      if (insertError) {
        console.error('[Import V2] Insert error:', insertError);
        result.errors.push({ asin: 'BATCH_INSERT', error: insertError.message });
      } else {
        result.imported = productsToInsert.length;
        console.log(`[Import V2] Inserted ${productsToInsert.length} new products`);
      }
    }
    
    // Update existing products
    if (productsToUpdate.length > 0) {
      for (const product of productsToUpdate) {
        const { error: updateError } = await getSupabaseClient()
          .from('products')
          .update(product)
          .eq('asin', product.asin);
        
        if (updateError) {
          console.error(`[Import V2] Update error for ${product.asin}:`, updateError);
          result.errors.push({ asin: product.asin, error: updateError.message });
        } else {
          result.updated++;
        }
      }
      console.log(`[Import V2] Updated ${result.updated} existing products`);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: Update import batch record
    // ═══════════════════════════════════════════════════════════════════════
    
    await getSupabaseClient()
      .from('import_batches')
      .update({
        status: 'completed',
        processed: asinsToProcess.length,
        new_count: result.imported,
        cached_count: keepaResult.fromCache,
        refreshed_count: keepaResult.fromApi,
        sold_out_count: result.soldOut,
        error_count: result.errors.length,
        errors: result.errors,
        keepa_tokens_used: keepaResult.tokensUsed,
        keepa_tokens_saved: keepaResult.tokensSaved,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    
    // ═══════════════════════════════════════════════════════════════════════
    // RETURN RESULTS
    // ═══════════════════════════════════════════════════════════════════════
    
    result.success = result.errors.length < asinsToProcess.length;
    
    return NextResponse.json({
      success: result.success,
      data: result,
      meta: {
        invalidAsins: invalidAsins.slice(0, 10),
        truncated: uniqueAsins.length > MAX_ITEMS_PER_IMPORT,
        tokenUsage: await getTokenUsage(),
      },
    });
    
  } catch (error) {
    console.error('[Import V2] Fatal error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Import failed',
      },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET - Check import status
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  
  if (!jobId) {
    // Return token usage info
    const tokenUsage = await getTokenUsage();
    return NextResponse.json({
      success: true,
      data: { tokenUsage },
    });
  }
  
  // Get job status
  const { data: job, error } = await getSupabaseClient()
    .from('import_batches')
    .select('*')
    .eq('id', jobId)
    .single();
  
  if (error || !job) {
    return NextResponse.json(
      { success: false, error: 'Job not found' },
      { status: 404 }
    );
  }
  
  return NextResponse.json({
    success: true,
    data: job,
  });
}
