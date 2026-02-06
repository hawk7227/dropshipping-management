// app/api/discovery/import/route.ts
// Direct product import from discovery preview - fetches full details and saves to DB

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY;

interface ImportProduct {
  asin: string;
  title: string;
  amazonPrice: number;
  salesPrice: number;
  profitAmount: number;
  profitPercent: number;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  isPrime: boolean;
  category: string;
}

interface ImportResult {
  asin: string;
  success: boolean;
  productId?: string;
  error?: string;
  data?: any;
}

// Generate a unique batch ID for this import session
function generateBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// Clear "new" status from previous batches
async function clearPreviousNewStatus(currentBatchId: string): Promise<void> {
  try {
    console.log('[Import] Clearing "new" status from previous batches...');
    
    const { error } = await supabase
      .from('products')
      .update({ 
        is_new: false,
        updated_at: new Date().toISOString()
      })
      .eq('is_new', true)
      .neq('import_batch_id', currentBatchId);

    if (error) {
      console.error('[Import] Error clearing previous new status:', error);
    } else {
      console.log('[Import] Previous batch "new" status cleared');
    }
  } catch (err) {
    console.error('[Import] Exception clearing new status:', err);
  }
}

// Fetch full product details from Rainforest API
async function fetchProductDetails(asin: string): Promise<any | null> {
  if (!RAINFOREST_API_KEY) {
    console.log('[Import] No Rainforest API key configured');
    return null;
  }

  try {
    console.log(`[Import] Fetching details for ASIN: ${asin}`);
    const url = `https://api.rainforestapi.com/request?api_key=${RAINFOREST_API_KEY}&type=product&amazon_domain=amazon.com&asin=${asin}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.request_info?.success === false) {
      console.error(`[Import] Rainforest API error for ${asin}:`, data.request_info);
      return null;
    }

    const product = data.product;
    if (!product) {
      console.log(`[Import] No product data returned for ${asin}`);
      return null;
    }

    console.log(`[Import] Got details for ${asin}:`, {
      title: product.title?.substring(0, 50),
      price: product.buybox_winner?.price?.value,
      image: product.main_image?.link ? 'yes' : 'no',
    });

    return product;
  } catch (error) {
    console.error(`[Import] Error fetching ${asin}:`, error);
    return null;
  }
}

// Calculate pricing based on Amazon cost
function calculatePricing(amazonPrice: number) {
  const retailPrice = Math.round(amazonPrice * 1.70 * 100) / 100;
  const profitAmount = Math.round((retailPrice - amazonPrice) * 100) / 100;
  const profitPercent = Math.round(((retailPrice - amazonPrice) / retailPrice) * 100 * 100) / 100;
  
  // Competitor display prices (80%+ higher than retail)
  const amazonDisplay = Math.round(retailPrice * (1.82 + Math.random() * 0.06) * 100) / 100;
  const costcoDisplay = Math.round(retailPrice * (1.80 + Math.random() * 0.05) * 100) / 100;
  const ebayDisplay = Math.round(retailPrice * (1.87 + Math.random() * 0.06) * 100) / 100;
  const samsDisplay = Math.round(retailPrice * (1.80 + Math.random() * 0.03) * 100) / 100;
  const compareAt = Math.max(amazonDisplay, costcoDisplay, ebayDisplay, samsDisplay);

  return {
    retailPrice,
    profitAmount,
    profitPercent,
    profitStatus: profitPercent >= 40 ? 'profitable' : profitPercent >= 30 ? 'marginal' : 'below_threshold',
    amazonDisplay,
    costcoDisplay,
    ebayDisplay,
    samsDisplay,
    compareAt,
  };
}

// Import a single product to the database
async function importProduct(
  product: ImportProduct, 
  details: any | null,
  batchId: string
): Promise<ImportResult> {
  try {
    // Use fetched details if available, otherwise use preview data
    const amazonPrice = details?.buybox_winner?.price?.value || product.amazonPrice;
    const title = details?.title || product.title;
    const imageUrl = details?.main_image?.link || details?.images?.[0]?.link || product.imageUrl;
    const rating = details?.rating || product.rating;
    const reviewCount = details?.ratings_total || product.reviewCount;
    const isPrime = details?.buybox_winner?.is_prime ?? product.isPrime;
    const brand = details?.brand || null;
    const category = details?.categories?.[0]?.name || product.category;
    const description = details?.description || details?.feature_bullets?.join('\n') || `Imported product with ASIN ${product.asin}`;

    // Calculate pricing
    const pricing = calculatePricing(amazonPrice);

    // Current timestamp for import tracking
    const now = new Date().toISOString();

    // Check if product already exists
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('asin', product.asin)
      .single();

    if (existing) {
      console.log(`[Import] Product ${product.asin} already exists, updating...`);
      
      // Update existing product - mark as new again since it's being re-imported
      const { data, error } = await supabase
        .from('products')
        .update({
          title,
          brand,
          category,
          description,
          main_image: imageUrl,
          cost_price: amazonPrice,
          amazon_price: amazonPrice,
          retail_price: pricing.retailPrice,
          current_price: pricing.retailPrice,
          profit_amount: pricing.profitAmount,
          profit_percent: pricing.profitPercent,
          profit_margin: pricing.profitPercent,
          profit_status: pricing.profitStatus,
          amazon_display_price: pricing.amazonDisplay,
          costco_display_price: pricing.costcoDisplay,
          ebay_display_price: pricing.ebayDisplay,
          sams_display_price: pricing.samsDisplay,
          compare_at_price: pricing.compareAt,
          rating,
          review_count: reviewCount,
          is_prime: isPrime,
          source: 'rainforest',
          source_product_id: product.asin,
          source_url: `https://amazon.com/dp/${product.asin}`,
          last_price_check: now,
          updated_at: now,
          // NEW product tracking
          is_new: true,
          imported_at: now,
          import_batch_id: batchId,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error(`[Import] Update error for ${product.asin}:`, error);
        return { asin: product.asin, success: false, error: error.message };
      }

      return { asin: product.asin, success: true, productId: existing.id, data };
    }

    // Insert new product
    const productId = `prod_${product.asin}_${Date.now()}`;
    
    // Set new_until to 48 hours from now for "NEW" badge
    const newUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('products')
      .insert({
        id: productId,
        asin: product.asin,
        title,
        handle: `product-${product.asin.toLowerCase()}`,
        brand,
        category,
        description,
        main_image: imageUrl,
        images: imageUrl ? [{ src: imageUrl }] : [],
        cost_price: amazonPrice,
        amazon_price: amazonPrice,
        retail_price: pricing.retailPrice,
        current_price: pricing.retailPrice,
        profit_amount: pricing.profitAmount,
        profit_percent: pricing.profitPercent,
        profit_margin: pricing.profitPercent,
        profit_status: pricing.profitStatus,
        amazon_display_price: pricing.amazonDisplay,
        costco_display_price: pricing.costcoDisplay,
        ebay_display_price: pricing.ebayDisplay,
        sams_display_price: pricing.samsDisplay,
        compare_at_price: pricing.compareAt,
        rating,
        review_count: reviewCount,
        is_prime: isPrime,
        source: 'rainforest',
        source_product_id: product.asin,
        source_url: `https://amazon.com/dp/${product.asin}`,
        status: 'draft',
        tags: ['amazon', `asin-${product.asin}`, 'imported', 'new'],
        last_price_check: now,
        created_at: now,
        updated_at: now,
        // NEW product tracking - badge shows for 48 hours
        is_new: true,
        new_until: newUntil,
        imported_at: now,
        import_batch_id: batchId,
      })
      .select()
      .single();

    if (error) {
      console.error(`[Import] Insert error for ${product.asin}:`, error);
      return { asin: product.asin, success: false, error: error.message };
    }

    console.log(`[Import] Successfully imported ${product.asin}`);
    return { asin: product.asin, success: true, productId, data };

  } catch (error) {
    console.error(`[Import] Exception for ${product.asin}:`, error);
    return { 
      asin: product.asin, 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { products, fetchDetails = true } = body as { 
      products: ImportProduct[]; 
      fetchDetails?: boolean;
    };

    if (!products || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No products provided',
      }, { status: 400 });
    }

    // Generate a unique batch ID for this import
    const batchId = generateBatchId();
    console.log(`[Import] Starting import of ${products.length} products, batchId=${batchId}, fetchDetails=${fetchDetails}`);

    // Clear "new" status from previous batches before importing
    await clearPreviousNewStatus(batchId);

    const results: ImportResult[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const product of products) {
      // Fetch full details from Rainforest if enabled
      let details = null;
      if (fetchDetails && RAINFOREST_API_KEY) {
        details = await fetchProductDetails(product.asin);
        // Rate limiting - wait 500ms between API calls
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Import the product with the batch ID
      const result = await importProduct(product, details, batchId);
      results.push(result);

      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    console.log(`[Import] Complete: ${successCount} success, ${failCount} failed, batchId=${batchId}`);

    return NextResponse.json({
      success: true,
      data: {
        total: products.length,
        imported: successCount,
        failed: failCount,
        batchId,
        results,
      },
    });

  } catch (error) {
    console.error('[Import] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Import failed',
    }, { status: 500 });
  }
}
