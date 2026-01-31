// app/api/products/route.ts
// Full product management API - CRUD, Shopify sync, inventory, bulk operations

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  syncProductsFromShopify,
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  getProductVariants,
  updateInventory,
  getInventoryLogs,
  getLowStockProducts,
  createImportBatch,
  processImportRow,
  updateImportBatch,
  getImportBatches,
  getProductStats,
} from '@/lib/product-management';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Enhanced product query with AI scores, sync status, and price freshness
async function getProductsWithDetails({
  page = 1,
  pageSize = 25,
  status,
  search,
  vendor,
  productType,
  sortBy = 'updated_at',
  sortOrder = 'desc',
  showStaleOnly = false,
  showSyncedOnly = false,
  minPrice,
  maxPrice,
  minMargin,
  maxMargin,
}: {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
  vendor?: string;
  productType?: string;
  sortBy?: string;
  sortOrder?: string;
  showStaleOnly?: boolean;
  showSyncedOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  minMargin?: number;
  maxMargin?: number;
}) {
  const offset = (page - 1) * pageSize;

  // Build the main query - removed joins to avoid foreign key relationship errors
  let query = supabase
    .from('products')
    .select(`
      id,
      asin,
      title,
      brand,
      category,
      description,
      main_image,
      images,
      current_price,
      cost_price,
      rating,
      review_count,
      status,
      last_price_check,
      shopify_product_id,
      tags,
      created_at,
      updated_at
    `, { count: 'exact' });

  // Apply filters
  if (search) {
    query = query.or(`title.ilike.%${search}%,asin.ilike.%${search}%,description.ilike.%${search}%`);
  }

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  if (vendor) {
    query = query.eq('brand', vendor);
  }

  if (productType) {
    query = query.eq('category', productType);
  }

  if (minPrice) {
    query = query.gte('current_price', minPrice);
  }

  if (maxPrice) {
    query = query.lte('current_price', maxPrice);
  }

  if (showSyncedOnly) {
    query = query.not('shopify_product_id', 'is', null);
  }

  // Apply sorting
  const validSortFields = [
    'title', 'created_at', 'updated_at', 'current_price', 
    'rating', 'review_count', 'ai_scores.overall_score'
  ];
  
  if (validSortFields.includes(sortBy)) {
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
  } else {
    query = query.order('updated_at', { ascending: false });
  }

  // Apply pagination
  query = query.range(offset, offset + pageSize - 1);

  const { data: products, error, count } = await query;

  if (error) throw error;

  // Fetch AI scores separately for all products
  const productIds = (products || []).map((p: any) => p.id);
  let aiScoresMap: Record<string, any> = {};
  
  if (productIds.length > 0) {
    try {
      const { data: aiScores } = await supabase
        .from('ai_scores')
        .select('product_id, overall_score, score_tier')
        .in('product_id', productIds);
      
      if (aiScores) {
        aiScores.forEach((score: any) => {
          aiScoresMap[score.product_id] = score;
        });
      }
    } catch (aiError) {
      // Silently fail if ai_scores table doesn't exist or has issues
      console.warn('[Products API] Could not fetch AI scores:', aiError);
    }
  }

  // Fetch latest price snapshots separately for all products
  let priceSnapshotsMap: Record<string, any> = {};
  
  if (productIds.length > 0) {
    try {
      const { data: priceSnapshots } = await supabase
        .from('price_snapshots')
        .select('product_id, current_price, competitor_price, availability, fetched_at, is_latest')
        .in('product_id', productIds)
        .eq('is_latest', true);
      
      if (priceSnapshots) {
        priceSnapshots.forEach((snapshot: any) => {
          priceSnapshotsMap[snapshot.product_id] = snapshot;
        });
      }
    } catch (priceError) {
      // Silently fail if price_snapshots table doesn't exist or has issues
      console.warn('[Products API] Could not fetch price snapshots:', priceError);
    }
  }

  // Fetch variants for all products in a single query and map them by product_id
  let variantsMap: Record<string, any[]> = {};
  if (productIds.length > 0) {
    try {
      const { data: variants } = await supabase
        .from('variants')
        .select(
          'id, product_id, title, sku, barcode, price, compare_at_price, cost, inventory_item_id, inventory_quantity, weight, weight_unit, requires_shipping, taxable, created_at, updated_at'
        )
        .in('product_id', productIds)
        .order('created_at', { ascending: true });

      if (variants) {
        variants.forEach((v: any) => {
          if (!variantsMap[v.product_id]) variantsMap[v.product_id] = [];
          variantsMap[v.product_id].push(v);
        });
      }
    } catch (varError) {
      // Silently fail if variants table doesn't exist or has issues
      console.warn('[Products API] Could not fetch variants:', varError);
    }
  }

  // Enrich products with additional calculated data
  const enrichedProducts = (products || []).map((product: any) => {
    // Get AI score for this product
    const aiScore = aiScoresMap[product.id] || null;
    
    // Get price snapshot for this product
    const priceSnapshot = priceSnapshotsMap[product.id] || null;

    // Calculate price freshness
    let priceFreshness: 'fresh' | 'stale' | 'very_stale' = 'fresh';
    let daysSinceCheck = 0;
    
    if (priceSnapshot?.fetched_at) {
      const now = new Date();
      const lastCheck = new Date(priceSnapshot.fetched_at);
      daysSinceCheck = Math.floor((now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSinceCheck > 7) {
        priceFreshness = 'very_stale';
      } else if (daysSinceCheck > 3) {
        priceFreshness = 'stale';
      }
    } else if (product.last_price_check) {
      // Fallback to product's last_price_check if no snapshot
      const now = new Date();
      const lastCheck = new Date(product.last_price_check);
      daysSinceCheck = Math.floor((now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSinceCheck > 7) {
        priceFreshness = 'very_stale';
      } else if (daysSinceCheck > 3) {
        priceFreshness = 'stale';
      }
    }

    // Calculate sync status
    let shopifySyncStatus: 'synced' | 'pending' | 'failed' = 'pending';
    if (product.shopify_product_id) {
      shopifySyncStatus = 'synced';
    }

    // Calculate demand level based on rating and reviews
    let demandLevel: 'high' | 'medium' | 'low' = 'low';
    if (product.rating >= 4.5 && product.review_count >= 100) {
      demandLevel = 'high';
    } else if (product.rating >= 4.0 && product.review_count >= 50) {
      demandLevel = 'medium';
    }

    // Calculate profit margin
    const profitMargin = product.cost_price && product.current_price 
      ? ((product.current_price - product.cost_price) / product.current_price) * 100
      : null;

    let profitStatus: 'profitable' | 'below_threshold' | 'unknown' = 'unknown';
    if (profitMargin !== null) {
      if (profitMargin >= 30) {
        profitStatus = 'profitable';
      } else if (profitMargin >= 15) {
        profitStatus = 'below_threshold';
      }
    }

    return {
      id: product.id,
      asin: product.asin,
      title: product.title,
      brand: product.brand,
      category: product.category,
      description: product.description,
      main_image: product.main_image,
      images: product.images || [],
      variants: variantsMap[product.id] || [],
      current_price: product.current_price,
      cost_price: product.cost_price,
      rating: product.rating || 0,
      review_count: product.review_count || 0,
      status: product.status,
      last_price_check: product.last_price_check,
      shopify_product_id: product.shopify_product_id,
      tags: product.tags || [],
      created_at: product.created_at,
      updated_at: product.updated_at,
      // AI scoring - handle null case
      ai_score: aiScore?.overall_score || null,
      ai_tier: aiScore?.score_tier || null,
      // Price freshness
      price_freshness: priceFreshness,
      days_since_price_check: daysSinceCheck,
      // Sync status
      shopify_sync_status: shopifySyncStatus,
      // Demand badge
      demand_level: demandLevel,
      // Margin calculation
      profit_margin: profitMargin,
      profit_status: profitStatus,
    };
  });

  // Apply client-side filters that need calculated values
  let filteredProducts = enrichedProducts;

  if (showStaleOnly) {
    filteredProducts = filteredProducts.filter(p => p.price_freshness !== 'fresh');
  }

  if (minMargin) {
    filteredProducts = filteredProducts.filter(p => 
      p.profit_margin !== null && p.profit_margin >= minMargin
    );
  }

  if (maxMargin) {
    filteredProducts = filteredProducts.filter(p => 
      p.profit_margin !== null && p.profit_margin <= maxMargin
    );
  }

  return {
    products: filteredProducts,
    total: count || 0,
    page,
    pageSize,
    totalPages: Math.ceil((count || 0) / pageSize),
  };
}

// GET /api/products
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'list';

    switch (action) {
      case 'list': {
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '25');
        const status = searchParams.get('status') || undefined;
        const search = searchParams.get('search') || undefined;
        const vendor = searchParams.get('vendor') || undefined;
        const productType = searchParams.get('productType') || undefined;
        const sortBy = searchParams.get('sortBy') as 'title' | 'created_at' | 'updated_at' | 'price' || 'updated_at';
        const sortOrder = searchParams.get('sortOrder') as 'asc' | 'desc' || 'desc';
        const showStaleOnly = searchParams.get('showStaleOnly') === 'true';
        const showSyncedOnly = searchParams.get('showSyncedOnly') === 'true';
        const minPrice = searchParams.get('minPrice');
        const maxPrice = searchParams.get('maxPrice');
        const minMargin = searchParams.get('minMargin');
        const maxMargin = searchParams.get('maxMargin');

        const result = await getProductsWithDetails({
          page,
          pageSize,
          status,
          search,
          vendor,
          productType: productType,
          sortBy,
          sortOrder,
          showStaleOnly,
          showSyncedOnly,
          minPrice: minPrice ? parseFloat(minPrice) : undefined,
          maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
          minMargin: minMargin ? parseFloat(minMargin) : undefined,
          maxMargin: maxMargin ? parseFloat(maxMargin) : undefined,
        });

        return NextResponse.json({
          success: true,
          data: result,
          pagination: {
            page,
            pageSize,
            total: result.total,
            totalPages: Math.ceil(result.total / pageSize),
          },
        });
      }

      case 'get': {
        const id = searchParams.get('id');
        if (!id) {
          return NextResponse.json(
            { success: false, error: 'Product ID required' },
            { status: 400 }
          );
        }

        const product = await getProduct(id);
        if (!product) {
          return NextResponse.json(
            { success: false, error: 'Product not found' },
            { status: 404 }
          );
        }

        return NextResponse.json({ success: true, data: product });
      }

      case 'variants': {
        const productId = searchParams.get('productId');
        if (!productId) {
          return NextResponse.json(
            { success: false, error: 'Product ID required' },
            { status: 400 }
          );
        }

        const variants = await getProductVariants(productId);
        return NextResponse.json({ success: true, data: variants });
      }

      case 'inventory-logs': {
        const productId = searchParams.get('productId');
        const variantId = searchParams.get('variantId') || undefined;
        const limit = parseInt(searchParams.get('limit') || '50');

        if (!productId) {
          return NextResponse.json(
            { success: false, error: 'Product ID required' },
            { status: 400 }
          );
        }

        const logs = await getInventoryLogs(productId, variantId, limit);
        return NextResponse.json({ success: true, data: logs });
      }

      case 'low-stock': {
        const threshold = parseInt(searchParams.get('threshold') || '10');
        const products = await getLowStockProducts(threshold);
        return NextResponse.json({ success: true, data: products });
      }

      case 'stats': {
        const stats = await getProductStats();
        return NextResponse.json({ success: true, data: stats });
      }

      case 'import-batches': {
        const batches = await getImportBatches();
        return NextResponse.json({ success: true, data: batches });
      }

      case 'vendors': {
        const { data } = await supabase
          .from('products')
          .select('vendor')
          .not('vendor', 'is', null)
          .order('vendor');

        const vendors = [...new Set((data || []).map(p => p.vendor).filter(Boolean))];
        return NextResponse.json({ success: true, data: vendors });
      }

      case 'product-types': {
        const { data } = await supabase
          .from('products')
          .select('product_type')
          .not('product_type', 'is', null)
          .order('product_type');

        const types = [...new Set((data || []).map(p => p.product_type).filter(Boolean))];
        return NextResponse.json({ success: true, data: types });
      }

       // Get discovered products (from Rainforest/80% markup discovery)
            case 'discovered': {
              const limit = parseInt(searchParams.get('limit') || '500');
              const category = searchParams.get('category') || undefined;
              const minProfit = parseFloat(searchParams.get('minProfit') || '0');
              const profitStatus = searchParams.get('profitStatus') || undefined;
      
              let query = supabase
                .from('products')
                .select('*')
                .eq('source', 'rainforest')
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(limit);
      
              if (category) {
                query = query.eq('category', category);
              }
              if (minProfit > 0) {
                query = query.gte('current_profit_percent', minProfit);
              }
              if (profitStatus) {
                query = query.eq('profit_status', profitStatus);
              }
      
              const { data, error } = await query;
      
              if (error) {
                return NextResponse.json(
                  { success: false, error: error.message },
                  { status: 500 }
                );
              }
      
              return NextResponse.json({ 
                success: true, 
                data: data || [],
                count: data?.length || 0,
              });
            }
      
            // Get profit summary for discovered products
            case 'profit-summary': {
              const { data, error } = await supabase
                .from('v_profit_summary')
                .select('*')
                .single();
      
              if (error && error.code !== 'PGRST116') {
                return NextResponse.json(
                  { success: false, error: error.message },
                  { status: 500 }
                );
              }
      
              return NextResponse.json({ success: true, data: data || {} });
            }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Products API] GET error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/products
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    console.log(searchParams.get('action'));
    const body = await request.json();
   const action = searchParams.get('action') || body.action;
    

    switch (action) {
      case 'create': {
        const { title, description, vendor, productType, tags, variants, images, status } = body;

        if (!title) {
          return NextResponse.json(
            { success: false, error: 'Title is required' },
            { status: 400 }
          );
        }

        const product = await createProduct({
          title,
          description: description,
          vendor,
          product_type: productType,
          tags,
          variants,
          images,
          status: status || 'draft',
        });

        return NextResponse.json({ success: true, data: product });
      }

      case 'sync-shopify': {
        try {
          const { fullSync = false } = body;

          console.log('[Products API] Starting Shopify sync...');
          const result = await syncProductsFromShopify(fullSync);
          
          console.log('[Products API] Shopify sync result:', result);

          return NextResponse.json({
            success: true,
            data: {
              synced: result.synced || 0,
              errors: result.errors || [],
              message: `Synced ${result.synced || 0} products from Shopify`,
            },
          });
        } catch (syncError) {
          console.error('[Products API] Shopify sync error:', syncError);
          
          return NextResponse.json({
            success: false,
            error: {
              code: 'SHOPIFY_SYNC_ERROR',
              message: 'Failed to sync products from Shopify',
              details: syncError instanceof Error ? syncError.message : 'Unknown error',
              suggestion: 'Check Shopify credentials and connection'
            }
          }, { status: 500 });
        }
      }

      case 'update-inventory': {
        const { variantId, quantity, reason, reference } = body;

        if (!variantId || quantity === undefined) {
          return NextResponse.json(
            { success: false, error: 'Variant ID and quantity required' },
            { status: 400 }
          );
        }

        await updateInventory(variantId, quantity, reason, reference);

        return NextResponse.json({
          success: true,
          message: 'Inventory updated successfully',
        });
      }

      case 'bulk-update-inventory': {
        const { updates } = body;

        if (!Array.isArray(updates) || updates.length === 0) {
          return NextResponse.json(
            { success: false, error: 'Updates array required' },
            { status: 400 }
          );
        }

        const results: { variantId: string; success: boolean; error?: string }[] = [];

        for (const update of updates) {
          try {
            await updateInventory(
              update.variantId,
              update.quantity,
              update.reason || 'bulk_update',
              update.reference
            );
            results.push({ variantId: update.variantId, success: true });
          } catch (error) {
            results.push({
              variantId: update.variantId,
              success: false,
              error: String(error),
            });
          }
        }

        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        return NextResponse.json({
          success: true,
          data: {
            results,
            summary: { successful, failed, total: updates.length },
          },
        });
      }

      case 'import-csv': {
        const { rows, options } = body;

        if (!Array.isArray(rows) || rows.length === 0) {
          return NextResponse.json(
            { success: false, error: 'CSV rows required' },
            { status: 400 }
          );
        }

        // Create import batch
        const batch = await createImportBatch(rows.length, options?.source || 'csv_upload');

        // Process rows
        let processed = 0;
        let succeeded = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const row of rows) {
          try {
            await processImportRow(batch.id, row);
            succeeded++;
          } catch (error) {
            failed++;
            errors.push(`Row ${processed + 1}: ${error}`);
          }
          processed++;

          // Update batch progress every 10 rows
          if (processed % 10 === 0) {
            await updateImportBatch(batch.id, {
              processed_count: processed,
              success_count: succeeded,
              error_count: failed,
            });
          }
        }

        // Final batch update
        await updateImportBatch(batch.id, {
          status: failed === rows.length ? 'failed' : 'completed',
          processed_count: processed,
          success_count: succeeded,
          error_count: failed,
          completed_at: new Date().toISOString(),
        });

        return NextResponse.json({
          success: true,
          data: {
            batchId: batch.id,
            total: rows.length,
            succeeded,
            failed,
            errors: errors.slice(0, 10), // First 10 errors
          },
        });
      }

      case 'bulk-status-update': {
        const { productIds, status } = body;

        if (!Array.isArray(productIds) || productIds.length === 0) {
          return NextResponse.json(
            { success: false, error: 'Product IDs required' },
            { status: 400 }
          );
        }

        if (!['active', 'draft', 'archived'].includes(status)) {
          return NextResponse.json(
            { success: false, error: 'Invalid status' },
            { status: 400 }
          );
        }

        const { error } = await supabase
          .from('products')
          .update({ status, updated_at: new Date().toISOString() })
          .in('id', productIds);

        if (error) throw error;

        return NextResponse.json({
          success: true,
          message: `Updated ${productIds.length} products to ${status}`,
        });
      }

      case 'duplicate': {
        const { productId } = body;

        if (!productId) {
          return NextResponse.json(
            { success: false, error: 'Product ID required' },
            { status: 400 }
          );
        }

        const original = await getProduct(productId);
        if (!original) {
          return NextResponse.json(
            { success: false, error: 'Product not found' },
            { status: 404 }
          );
        }

        const duplicate = await createProduct({
          title: `${original.title} (Copy)`,
          description: original.description,
          vendor: original.vendor,
          product_type: original.product_type,
          tags: original.tags,
          images: original.images,
          status: 'draft',
          variants: (original as any).variants?.map((v: any) => ({
            title: v.title,
            sku: v.sku ? `${v.sku}-COPY` : undefined,
            price: v.price,
            compare_at_price: v.compare_at_price,
            inventory_quantity: 0,
            option1: v.option1,
            option2: v.option2,
            option3: v.option3,
          })),
        });

        return NextResponse.json({ success: true, data: duplicate });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Products API] POST error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// PUT /api/products
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'update';
    const id = searchParams.get('id');

    if (!id && action !== 'update-asin') {
      return NextResponse.json(
        { success: false, error: 'Product ID required' },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Handle ASIN update
    if (action === 'update-asin') {
      const { productId, asin, competitor_link } = body;
      
      if (!productId || !asin) {
        return NextResponse.json(
          { success: false, error: 'Product ID and ASIN required' },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from('products')
        .update({
          asin,
          competitor_link: competitor_link || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', productId)
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({ success: true, data });
    }

    // Handle bulk ASIN update
    if (action === 'bulk-update-asin') {
      const { updates } = body; // Array of { productId, asin, competitor_link }

      if (!Array.isArray(updates) || updates.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Updates array required' },
          { status: 400 }
        );
      }

      const results: { productId: string; success: boolean; error?: string }[] = [];

      for (const update of updates) {
        try {
          const { data, error } = await supabase
            .from('products')
            .update({
              asin: update.asin,
              competitor_link: update.competitor_link || null,
              updated_at: new Date().toISOString()
            })
            .eq('id', update.productId)
            .select()
            .single();

          if (error) {
            results.push({
              productId: update.productId,
              success: false,
              error: error.message
            });
          } else {
            results.push({
              productId: update.productId,
              success: true
            });
          }
        } catch (err) {
          results.push({
            productId: update.productId,
            success: false,
            error: String(err)
          });
        }
      }

      const successful = results.filter(r => r.success).length;

      return NextResponse.json({
        success: true,
        data: {
          results,
          summary: {
            total: updates.length,
            successful,
            failed: updates.length - successful
          }
        }
      });
    }

    // Standard product update
    const { title, description, vendor, productType, tags, status, images, variants } = body;

    const updates: Record<string, any> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (vendor !== undefined) updates.vendor = vendor;
    if (productType !== undefined) updates.product_type = productType;
    if (tags !== undefined) updates.tags = tags;
    if (status !== undefined) updates.status = status;
    if (images !== undefined) updates.images = images;

    const product = await updateProduct(id as string, updates);

    // Update variants if provided
    if (variants && Array.isArray(variants)) {
      for (const variant of variants) {
        if (variant.id) {
          await supabase
            .from('variants')
            .update({
              title: variant.title,
              sku: variant.sku,
              barcode: variant.barcode,
              price: variant.price,
              compare_at_price: variant.compare_at_price,
              cost: variant.cost,
              inventory_item_id: variant.inventory_item_id,
              inventory_quantity: variant.inventory_quantity,
              weight: variant.weight,
              weight_unit: variant.weight_unit,
              requires_shipping: variant.requires_shipping,
              taxable: variant.taxable,
              updated_at: new Date().toISOString(),
            })
            .eq('id', variant.id);
        }
      }
    }

    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    console.error('[Products API] PUT error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/products
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const bulk = searchParams.get('bulk') === 'true';

    if (bulk) {
      const body = await request.json();
      const { productIds } = body;

      if (!Array.isArray(productIds) || productIds.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Product IDs required' },
          { status: 400 }
        );
      }

      // Delete variants first
      await supabase
        .from('variants')
        .delete()
        .in('product_id', productIds);

      // Delete products
      const { error } = await supabase
        .from('products')
        .delete()
        .in('id', productIds);

      if (error) throw error;

      return NextResponse.json({
        success: true,
        message: `Deleted ${productIds.length} products`,
      });
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Product ID required' },
        { status: 400 }
      );
    }

    // Delete variants first
    await supabase
      .from('variants')
      .delete()
      .eq('product_id', id);

    // Delete product
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    console.error('[Products API] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
