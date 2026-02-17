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

  // Build the main query - select all columns to avoid missing column errors
  // The API will handle missing pricing columns gracefully
  let query = supabase
    .from('products')
    .select('*', { count: 'exact' });

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

  // Fetch competitor prices (Amazon) for all products
  // Note: product_id in competitor_prices is stored as "productId-amazon" format
  let competitorPricesMap: Record<string, any> = {};
  
  if (productIds.length > 0) {
    try {
      // Build composite IDs for Amazon competitor prices
      const amazonProductIds = productIds.map((id: string) => `${id}-amazon`);
      console.log("amazonProductIds:", amazonProductIds);
      const { data: competitorPrices } = await supabase
        .from('competitor_prices')
        .select('*')
        .in('id', amazonProductIds);
      console.log("competitorPrices:", competitorPrices);
      if (competitorPrices) {
        competitorPrices.forEach((cp: any) => {
          // Extract the actual product ID from the composite format "productId-amazon"
          const actualProductId = cp.product_id.replace('-amazon', '');
          competitorPricesMap[actualProductId] = cp;
        });
      }
    } catch (cpError) {
      // Silently fail if competitor_prices table doesn't exist or has issues
      console.warn('[Products API] Could not fetch competitor prices:', cpError);
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

    // Get competitor price (Amazon) for this product
    const competitorPrice = competitorPricesMap[product.id] || null;

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
    // Use Amazon competitor price if available, otherwise fall back to cost_price
    const amazonPrice = competitorPrice?.competitor_price || product.cost_price;
    const retailPrice = product.current_price;
    
    const profitMargin = amazonPrice && retailPrice
      ? ((retailPrice - amazonPrice) / retailPrice) * 100
      : null;
    
    const profitAmount = amazonPrice && retailPrice
      ? retailPrice - amazonPrice
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
      image_url: product.main_image, // Alias for compatibility
      images: product.images || [],
      variants: variantsMap[product.id] || [],
      current_price: product.current_price,
      // Use database cost_price first, fall back to competitor price lookup
      cost_price: product.cost_price || product.amazon_price || competitorPrice?.competitor_price || null,
      amazon_price: product.amazon_price || product.cost_price || competitorPrice?.competitor_price || null,
      // Use database retail_price, or calculate from cost if available
      retail_price: product.retail_price || (product.cost_price ? product.cost_price * 1.70 : null),
      // Competitor display prices
      amazon_display_price: product.amazon_display_price || null,
      costco_display_price: product.costco_display_price || null,
      ebay_display_price: product.ebay_display_price || null,
      sams_display_price: product.sams_display_price || null,
      compare_at_price: product.compare_at_price || null,
      rating: product.rating || 0,
      review_count: product.review_count || 0,
      is_prime: product.is_prime || competitorPrice?.is_prime || false,
      status: product.status,
      source: product.source || 'manual',
      source_product_id: product.source_product_id || product.asin,
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
      // Margin calculation - use database values first, fall back to calculated
      profit_margin: product.profit_margin || product.profit_percent || profitMargin,
      profit_percent: product.profit_percent || product.profit_margin || profitMargin,
      profit_amount: product.profit_amount || profitAmount,
      profit_status: product.profit_status || profitStatus,
      // Competitor pricing lookup (Amazon)
      amazon_last_checked: competitorPrice?.last_checked || null,
      amazon_fetched_at: competitorPrice?.fetched_at || null,
      amazon_availability: competitorPrice?.availability || null,
      // NEW product tracking - check if is_new and within new_until period (or 48 hours from import)
      is_new: product.is_new && (
        (product.new_until && new Date(product.new_until) > new Date()) ||
        (product.imported_at && (new Date().getTime() - new Date(product.imported_at).getTime() < 48 * 60 * 60 * 1000)) ||
        (product.created_at && (new Date().getTime() - new Date(product.created_at).getTime() < 48 * 60 * 60 * 1000))
      ),
      new_until: product.new_until || null,
      imported_at: product.imported_at || null,
      import_batch_id: product.import_batch_id || null,
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
          const { fullSync = false, productIds, direction } = body;

          // ── PUSH individual products TO Shopify ──────────────────────
          if (productIds && Array.isArray(productIds) && productIds.length > 0) {
            console.log(`[Products API] Pushing ${productIds.length} product(s) to Shopify...`);
            
            let synced = 0;
            const errors: string[] = [];

            // Pricing rules (from lib/config/pricing-rules.ts)
            const MARKUP = 1.70;
            const COMPETITOR_RANGES = {
              amazon: { min: 1.82, max: 1.88 },
              costco: { min: 1.80, max: 1.85 },
              ebay:   { min: 1.87, max: 1.93 },
              sams:   { min: 1.80, max: 1.83 },
            };
            const randInRange = (mn: number, mx: number) => +(mn + Math.random() * (mx - mn)).toFixed(2);

            const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN || process.env.NEXT_PUBLIC_SHOPIFY_STORE;
            const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
            const API_VERSION = '2024-01';

            if (!SHOPIFY_STORE || !SHOPIFY_TOKEN) {
              return NextResponse.json({
                success: false,
                error: { code: 'SHOPIFY_CONFIG_ERROR', message: 'Shopify credentials not configured. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN in .env' }
              }, { status: 400 });
            }

            for (const pid of productIds) {
              try {
                const { data: product, error: fetchErr } = await supabase
                  .from('products').select('*').eq('id', pid).single();
                if (fetchErr || !product) { errors.push(`Product ${pid} not found`); continue; }

                const asin = product.asin || product.source_product_id || product.sku || '';
                const amazonCost = product.cost_price || product.amazon_price || 0;
                const sellPrice = product.retail_price || +(amazonCost * MARKUP).toFixed(2);

                // Calculate competitor display prices
                const amazonDisplay = +(sellPrice * randInRange(COMPETITOR_RANGES.amazon.min, COMPETITOR_RANGES.amazon.max)).toFixed(2);
                const costcoDisplay = +(sellPrice * randInRange(COMPETITOR_RANGES.costco.min, COMPETITOR_RANGES.costco.max)).toFixed(2);
                const ebayDisplay   = +(sellPrice * randInRange(COMPETITOR_RANGES.ebay.min, COMPETITOR_RANGES.ebay.max)).toFixed(2);
                const samsDisplay   = +(sellPrice * randInRange(COMPETITOR_RANGES.sams.min, COMPETITOR_RANGES.sams.max)).toFixed(2);
                const compareAtPrice = Math.max(amazonDisplay, costcoDisplay, ebayDisplay, samsDisplay);

                // Supplier URL from ASIN
                const supplierUrl = asin && /^B[A-Z0-9]{9}$/.test(asin)
                  ? `https://www.amazon.com/dp/${asin}` : (product.source_url || '');

                // Build Shopify payload
                const shopifyPayload: any = {
                  product: {
                    title: product.title,
                    body_html: product.description || product.body_html || '',
                    vendor: product.vendor || '',
                    product_type: product.product_type || '',
                    tags: Array.isArray(product.tags) ? product.tags.join(', ') : (product.tags || ''),
                    variants: [{
                      price: String(sellPrice),
                      compare_at_price: String(compareAtPrice),
                      sku: asin,
                      inventory_management: 'shopify',
                      inventory_quantity: product.inventory_quantity ?? 999,
                      requires_shipping: true,
                    }],
                    images: product.image_url ? [{ src: product.image_url }] :
                            (product.images || []).slice(0, 5).map((img: any) => ({ src: typeof img === 'string' ? img : img.src })),
                    metafields: [
                      { namespace: 'custom', key: 'asin', value: asin, type: 'single_line_text_field' },
                      { namespace: 'custom', key: 'supplier_url', value: supplierUrl, type: 'url' },
                      { namespace: 'custom', key: 'amazon_price', value: String(amazonCost), type: 'number_decimal' },
                      { namespace: 'comparisons', key: 'price_amazon', value: String(amazonDisplay), type: 'number_decimal' },
                      { namespace: 'comparisons', key: 'price_costco', value: String(costcoDisplay), type: 'number_decimal' },
                      { namespace: 'comparisons', key: 'price_ebay', value: String(ebayDisplay), type: 'number_decimal' },
                      { namespace: 'comparisons', key: 'price_samsclub', value: String(samsDisplay), type: 'number_decimal' },
                    ].filter(m => m.value && m.value !== '0' && m.value !== ''),
                  }
                };

                let shopifyResponse;
                if (product.shopify_product_id) {
                  // UPDATE existing — metafields need separate calls for PUT
                  const updatePayload = JSON.parse(JSON.stringify(shopifyPayload));
                  const metafieldsToSet = updatePayload.product.metafields;
                  delete updatePayload.product.metafields;
                  if (product.shopify_variant_id) {
                    updatePayload.product.variants[0].id = product.shopify_variant_id;
                  }
                  shopifyResponse = await fetch(
                    `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/products/${product.shopify_product_id}.json`,
                    { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN }, body: JSON.stringify(updatePayload) }
                  );
                  // Set metafields separately for existing products
                  if (shopifyResponse.ok && metafieldsToSet?.length) {
                    for (const mf of metafieldsToSet) {
                      try {
                        await fetch(`https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/products/${product.shopify_product_id}/metafields.json`,
                          { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
                            body: JSON.stringify({ metafield: { ...mf, owner_id: product.shopify_product_id, owner_resource: 'product' } }) });
                      } catch (mfErr) { console.warn(`[Products API] Metafield ${mf.key} failed:`, mfErr); }
                    }
                  }
                } else {
                  // CREATE new — metafields included in POST
                  shopifyResponse = await fetch(
                    `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/products.json`,
                    { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN }, body: JSON.stringify(shopifyPayload) }
                  );
                }

                if (!shopifyResponse.ok) {
                  const errBody = await shopifyResponse.text();
                  errors.push(`Shopify error for ${product.title}: ${shopifyResponse.status} - ${errBody.substring(0, 200)}`);
                  continue;
                }

                const shopifyData = await shopifyResponse.json();
                const shopifyId = shopifyData.product?.id;
                const shopifyVariantId = shopifyData.product?.variants?.[0]?.id;

                if (shopifyId) {
                  await getSupabaseClient().from('products').update({
                    shopify_product_id: String(shopifyId),
                    shopify_variant_id: shopifyVariantId ? String(shopifyVariantId) : null,
                    shopify_synced_at: new Date().toISOString(),
                    retail_price: sellPrice,
                    compare_at_price: compareAtPrice,
                    amazon_display_price: amazonDisplay,
                    costco_display_price: costcoDisplay,
                    ebay_display_price: ebayDisplay,
                    sams_display_price: samsDisplay,
                    updated_at: new Date().toISOString(),
                  }).eq('id', pid);
                }

                synced++;
                console.log(`[Products API] Pushed ${product.title} (${asin}) → Shopify #${shopifyId} | $${sellPrice} | Compare: $${compareAtPrice}`);
              } catch (pushErr) {
                errors.push(`Failed to push ${pid}: ${pushErr instanceof Error ? pushErr.message : 'Unknown error'}`);
              }
            }

            return NextResponse.json({
              success: true,
              data: { synced, errors, message: `Pushed ${synced}/${productIds.length} products to Shopify` },
            });
          }

          // ── PULL from Shopify (existing behavior) ────────────────────
          console.log('[Products API] Starting Shopify sync (pull)...');
          const result = await syncProductsFromShopify(fullSync);
          console.log('[Products API] Shopify sync result:', result);

          return NextResponse.json({
            success: true,
            data: { synced: result.synced || 0, errors: result.errors || [], message: `Synced ${result.synced || 0} products from Shopify` },
          });
        } catch (syncError) {
          console.error('[Products API] Shopify sync error:', syncError);
          return NextResponse.json({
            success: false,
            error: { code: 'SHOPIFY_SYNC_ERROR', message: 'Failed to sync products with Shopify',
              details: syncError instanceof Error ? syncError.message : 'Unknown error',
              suggestion: 'Check Shopify credentials and connection' }
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



