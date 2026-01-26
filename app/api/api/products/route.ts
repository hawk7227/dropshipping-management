// app/api/products/route.ts
// COMPLETE Products API - Full CRUD operations with validation, filtering, pagination,
// bulk operations, error handling, and Supabase integration

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Product, ProductStatus, ApiResponse } from '@/types';
import type { ApiError } from '@/types/errors';
import { calculateRetailPrice, calculateCompetitorPrices } from '@/lib/utils/pricing-calculator';
import { PRICING_RULES } from '@/lib/config/pricing-rules';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ProductsQueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: ProductStatus | 'all';
  profitStatus?: 'profitable' | 'below_threshold' | 'unknown' | 'all';
  category?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  showStaleOnly?: boolean;
  showSyncedOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  minMargin?: number;
  maxMargin?: number;
  ids?: string[];
}

interface CreateProductRequest {
  asin: string;
  title?: string;
  description?: string;
  amazon_price?: number;
  category?: string;
  image_url?: string;
}

interface UpdateProductRequest {
  title?: string;
  description?: string;
  amazon_price?: number;
  retail_price?: number;
  category?: string;
  status?: ProductStatus;
  image_url?: string;
}

interface BulkOperationRequest {
  operation: 'pause' | 'unpause' | 'delete' | 'refresh' | 'sync';
  productIds: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_BULK_OPERATIONS = 100;
const STALE_THRESHOLD_DAYS = PRICING_RULES.refresh.staleThresholdDays;
const MARGIN_THRESHOLD = PRICING_RULES.profitThresholds.minimum;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create Supabase client
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Validate ASIN format
 */
function isValidAsin(asin: string): boolean {
  return /^[A-Z0-9]{10}$/.test(asin.toUpperCase());
}

/**
 * Create error response
 */
function errorResponse(error: ApiError, status: number = 400): NextResponse {
  return NextResponse.json(
    { success: false, error },
    { status }
  );
}

/**
 * Create success response
 */
function successResponse<T>(data: T, meta?: Record<string, unknown>): NextResponse {
  return NextResponse.json({
    success: true,
    data,
    ...(meta && { meta }),
  });
}

/**
 * Parse query parameters
 */
function parseQueryParams(searchParams: URLSearchParams): ProductsQueryParams {
  return {
    page: parseInt(searchParams.get('page') || '1'),
    pageSize: Math.min(parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE),
    search: searchParams.get('search') || undefined,
    status: (searchParams.get('status') as ProductStatus | 'all') || 'all',
    profitStatus: (searchParams.get('profitStatus') as ProductsQueryParams['profitStatus']) || 'all',
    category: searchParams.get('category') || undefined,
    sortBy: searchParams.get('sortBy') || 'created_at',
    sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
    showStaleOnly: searchParams.get('showStaleOnly') === 'true',
    showSyncedOnly: searchParams.get('showSyncedOnly') === 'true',
    minPrice: searchParams.get('minPrice') ? parseFloat(searchParams.get('minPrice')!) : undefined,
    maxPrice: searchParams.get('maxPrice') ? parseFloat(searchParams.get('maxPrice')!) : undefined,
    minMargin: searchParams.get('minMargin') ? parseFloat(searchParams.get('minMargin')!) : undefined,
    maxMargin: searchParams.get('maxMargin') ? parseFloat(searchParams.get('maxMargin')!) : undefined,
    ids: searchParams.get('ids')?.split(',').filter(Boolean) || undefined,
  };
}

/**
 * Build Supabase query with filters
 */
function buildProductsQuery(
  supabase: ReturnType<typeof getSupabaseClient>,
  params: ProductsQueryParams
) {
  let query = supabase.from('products').select('*', { count: 'exact' });

  // Search filter
  if (params.search) {
    query = query.or(`title.ilike.%${params.search}%,asin.ilike.%${params.search}%,description.ilike.%${params.search}%`);
  }

  // Status filter
  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  // Category filter
  if (params.category) {
    query = query.eq('category', params.category);
  }

  // IDs filter (for bulk operations)
  if (params.ids && params.ids.length > 0) {
    query = query.in('id', params.ids);
  }

  // Price range filters
  if (params.minPrice !== undefined) {
    query = query.gte('amazon_price', params.minPrice);
  }
  if (params.maxPrice !== undefined) {
    query = query.lte('amazon_price', params.maxPrice);
  }

  // Margin range filters
  if (params.minMargin !== undefined) {
    query = query.gte('profit_margin', params.minMargin);
  }
  if (params.maxMargin !== undefined) {
    query = query.lte('profit_margin', params.maxMargin);
  }

  // Profit status filter
  if (params.profitStatus && params.profitStatus !== 'all') {
    if (params.profitStatus === 'profitable') {
      query = query.gte('profit_margin', MARGIN_THRESHOLD * 2);
    } else if (params.profitStatus === 'below_threshold') {
      query = query.gte('profit_margin', MARGIN_THRESHOLD).lt('profit_margin', MARGIN_THRESHOLD * 2);
    } else if (params.profitStatus === 'unknown') {
      query = query.or(`profit_margin.lt.${MARGIN_THRESHOLD},profit_margin.is.null`);
    }
  }

  // Stale products filter
  if (params.showStaleOnly) {
    const staleDate = new Date(Date.now() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
    query = query.or(`last_price_check.lt.${staleDate},last_price_check.is.null`);
  }

  // Synced to Shopify filter
  if (params.showSyncedOnly) {
    query = query.not('shopify_id', 'is', null);
  }

  // Sorting
  const validSortColumns = ['title', 'created_at', 'updated_at', 'profit_margin', 'amazon_price', 'retail_price', 'rating', 'review_count'];
  const sortColumn = validSortColumns.includes(params.sortBy || '') ? params.sortBy! : 'created_at';
  query = query.order(sortColumn, { ascending: params.sortOrder === 'asc' });

  // Pagination
  const page = Math.max(1, params.page || 1);
  const pageSize = params.pageSize || DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * pageSize;
  query = query.range(offset, offset + pageSize - 1);

  return query;
}

// ═══════════════════════════════════════════════════════════════════════════
// GET - List products with filtering and pagination
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const params = parseQueryParams(request.nextUrl.searchParams);

    // Build and execute query
    const query = buildProductsQuery(supabase, params);
    const { data: products, error, count } = await query;

    if (error) {
      console.error('Supabase query error:', error);
      return errorResponse({
        code: 'DB_001',
        message: 'Failed to fetch products',
        details: error.message,
        suggestion: 'Please try again or contact support',
      }, 500);
    }

    // Calculate pagination metadata
    const totalItems = count || 0;
    const pageSize = params.pageSize || DEFAULT_PAGE_SIZE;
    const totalPages = Math.ceil(totalItems / pageSize);
    const currentPage = params.page || 1;

    return successResponse(products || [], {
      pagination: {
        page: currentPage,
        pageSize,
        totalItems,
        totalPages,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1,
      },
      filters: {
        search: params.search,
        status: params.status,
        profitStatus: params.profitStatus,
        category: params.category,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      },
    });
  } catch (error) {
    console.error('Products GET error:', error);
    return errorResponse({
      code: 'API_001',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      suggestion: 'Please try again later',
    }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST - Create new product or bulk operation
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();

    // Check if this is a bulk operation
    if (body.operation && body.productIds) {
      return handleBulkOperation(supabase, body as BulkOperationRequest);
    }

    // Otherwise, create new product
    return handleCreateProduct(supabase, body as CreateProductRequest);
  } catch (error) {
    console.error('Products POST error:', error);
    return errorResponse({
      code: 'API_002',
      message: 'Invalid request',
      details: error instanceof Error ? error.message : 'Failed to parse request body',
      suggestion: 'Check your request format',
    }, 400);
  }
}

/**
 * Handle single product creation
 */
async function handleCreateProduct(
  supabase: ReturnType<typeof getSupabaseClient>,
  data: CreateProductRequest
): Promise<NextResponse> {
  // Validate ASIN
  if (!data.asin) {
    return errorResponse({
      code: 'VAL_001',
      message: 'ASIN is required',
      suggestion: 'Provide a valid Amazon ASIN',
    }, 400);
  }

  if (!isValidAsin(data.asin)) {
    return errorResponse({
      code: 'VAL_002',
      message: 'Invalid ASIN format',
      details: `"${data.asin}" is not a valid ASIN`,
      suggestion: 'ASIN should be 10 alphanumeric characters',
    }, 400);
  }

  const asin = data.asin.toUpperCase();

  // Check for existing product
  const { data: existing } = await supabase
    .from('products')
    .select('id')
    .eq('asin', asin)
    .single();

  if (existing) {
    return errorResponse({
      code: 'VAL_003',
      message: 'Product already exists',
      details: `A product with ASIN ${asin} already exists`,
      suggestion: 'Use PUT to update the existing product',
    }, 409);
  }

  // Calculate pricing if amazon_price provided
  let retailPrice: number | null = null;
  let profitMargin: number | null = null;
  let competitorPrices: Record<string, number> | null = null;

  if (data.amazon_price && data.amazon_price > 0) {
    retailPrice = calculateRetailPrice(data.amazon_price);
    profitMargin = ((retailPrice - data.amazon_price) / retailPrice) * 100;
    competitorPrices = calculateCompetitorPrices(retailPrice);
  }

  // Create product
  const now = new Date().toISOString();
  const productData = {
    asin,
    title: data.title || `Product ${asin}`,
    description: data.description || null,
    amazon_price: data.amazon_price || null,
    retail_price: retailPrice,
    profit_margin: profitMargin,
    competitor_prices: competitorPrices,
    category: data.category || 'Uncategorized',
    image_url: data.image_url || null,
    status: 'pending' as ProductStatus,
    rating: null,
    review_count: null,
    last_price_check: data.amazon_price ? now : null,
    created_at: now,
    updated_at: now,
    shopify_id: null,
    shopify_handle: null,
  };

  const { data: product, error } = await supabase
    .from('products')
    .insert(productData)
    .select()
    .single();

  if (error) {
    console.error('Product creation error:', error);
    return errorResponse({
      code: 'DB_002',
      message: 'Failed to create product',
      details: error.message,
      suggestion: 'Please try again',
    }, 500);
  }

  return successResponse(product, { created: true });
}

/**
 * Handle bulk operations
 */
async function handleBulkOperation(
  supabase: ReturnType<typeof getSupabaseClient>,
  data: BulkOperationRequest
): Promise<NextResponse> {
  // Validate operation
  const validOperations = ['pause', 'unpause', 'delete', 'refresh', 'sync'];
  if (!validOperations.includes(data.operation)) {
    return errorResponse({
      code: 'VAL_004',
      message: 'Invalid operation',
      details: `Operation "${data.operation}" is not supported`,
      suggestion: `Valid operations: ${validOperations.join(', ')}`,
    }, 400);
  }

  // Validate product IDs
  if (!data.productIds || data.productIds.length === 0) {
    return errorResponse({
      code: 'VAL_005',
      message: 'No products specified',
      suggestion: 'Provide at least one product ID',
    }, 400);
  }

  if (data.productIds.length > MAX_BULK_OPERATIONS) {
    return errorResponse({
      code: 'VAL_006',
      message: 'Too many products',
      details: `Maximum ${MAX_BULK_OPERATIONS} products per bulk operation`,
      suggestion: 'Split into smaller batches',
    }, 400);
  }

  const results = {
    success: [] as string[],
    failed: [] as { id: string; error: string }[],
  };

  switch (data.operation) {
    case 'pause':
    case 'unpause': {
      const newStatus = data.operation === 'pause' ? 'paused' : 'active';
      const { error } = await supabase
        .from('products')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .in('id', data.productIds);

      if (error) {
        return errorResponse({
          code: 'DB_003',
          message: `Failed to ${data.operation} products`,
          details: error.message,
        }, 500);
      }
      results.success = data.productIds;
      break;
    }

    case 'delete': {
      const { error } = await supabase
        .from('products')
        .delete()
        .in('id', data.productIds);

      if (error) {
        return errorResponse({
          code: 'DB_004',
          message: 'Failed to delete products',
          details: error.message,
        }, 500);
      }
      results.success = data.productIds;
      break;
    }

    case 'refresh': {
      // Mark products for refresh (actual refresh handled by separate service)
      const { error } = await supabase
        .from('products')
        .update({ 
          status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .in('id', data.productIds);

      if (error) {
        return errorResponse({
          code: 'DB_005',
          message: 'Failed to queue products for refresh',
          details: error.message,
        }, 500);
      }
      results.success = data.productIds;
      break;
    }

    case 'sync': {
      // Add to Shopify sync queue (handled by queue service)
      // For now, just mark as pending sync
      const { data: products, error: fetchError } = await supabase
        .from('products')
        .select('id, asin')
        .in('id', data.productIds);

      if (fetchError) {
        return errorResponse({
          code: 'DB_006',
          message: 'Failed to fetch products for sync',
          details: fetchError.message,
        }, 500);
      }

      // Add to queue
      const queueItems = (products || []).map(p => ({
        product_id: p.id,
        asin: p.asin,
        operation: 'create',
        status: 'pending',
        priority: 5,
        retry_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
      }));

      const { error: queueError } = await supabase
        .from('shopify_queue')
        .insert(queueItems);

      if (queueError) {
        // Non-blocking - queue might not exist
        console.warn('Queue insert warning:', queueError.message);
      }

      results.success = data.productIds;
      break;
    }
  }

  return successResponse({
    operation: data.operation,
    total: data.productIds.length,
    successful: results.success.length,
    failed: results.failed.length,
    results,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PUT - Update existing product
// ═══════════════════════════════════════════════════════════════════════════

export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();

    // Get product ID from query params or body
    const productId = request.nextUrl.searchParams.get('id') || body.id;

    if (!productId) {
      return errorResponse({
        code: 'VAL_007',
        message: 'Product ID is required',
        suggestion: 'Provide product ID in query params or request body',
      }, 400);
    }

    // Verify product exists
    const { data: existing } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (!existing) {
      return errorResponse({
        code: 'VAL_008',
        message: 'Product not found',
        details: `No product with ID ${productId}`,
      }, 404);
    }

    // Build update object
    const updates: Partial<Product> = {
      updated_at: new Date().toISOString(),
    };

    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.category !== undefined) updates.category = body.category;
    if (body.status !== undefined) updates.status = body.status;
    if (body.image_url !== undefined) updates.image_url = body.image_url;

    // Handle price updates
    if (body.amazon_price !== undefined) {
      updates.amazon_price = body.amazon_price;
      updates.last_price_check = new Date().toISOString();

      // Recalculate retail price and margins if retail_price not explicitly set
      if (body.retail_price === undefined && body.amazon_price > 0) {
        updates.retail_price = calculateRetailPrice(body.amazon_price);
        updates.profit_margin = ((updates.retail_price - body.amazon_price) / updates.retail_price) * 100;
        updates.competitor_prices = calculateCompetitorPrices(updates.retail_price);
      }
    }

    if (body.retail_price !== undefined) {
      updates.retail_price = body.retail_price;
      
      // Recalculate margin with new retail price
      const amazonPrice = body.amazon_price !== undefined ? body.amazon_price : existing.amazon_price;
      if (amazonPrice && body.retail_price > 0) {
        updates.profit_margin = ((body.retail_price - amazonPrice) / body.retail_price) * 100;
        updates.competitor_prices = calculateCompetitorPrices(body.retail_price);
      }
    }

    // Execute update
    const { data: product, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', productId)
      .select()
      .single();

    if (error) {
      console.error('Product update error:', error);
      return errorResponse({
        code: 'DB_007',
        message: 'Failed to update product',
        details: error.message,
      }, 500);
    }

    return successResponse(product, { updated: true });
  } catch (error) {
    console.error('Products PUT error:', error);
    return errorResponse({
      code: 'API_003',
      message: 'Invalid request',
      details: error instanceof Error ? error.message : 'Failed to parse request body',
    }, 400);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE - Remove product(s)
// ═══════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    // Get product ID(s) from query params
    const productId = request.nextUrl.searchParams.get('id');
    const productIds = request.nextUrl.searchParams.get('ids')?.split(',').filter(Boolean);

    const idsToDelete = productIds || (productId ? [productId] : []);

    if (idsToDelete.length === 0) {
      return errorResponse({
        code: 'VAL_009',
        message: 'No products specified',
        suggestion: 'Provide product ID(s) to delete',
      }, 400);
    }

    if (idsToDelete.length > MAX_BULK_OPERATIONS) {
      return errorResponse({
        code: 'VAL_010',
        message: 'Too many products',
        details: `Maximum ${MAX_BULK_OPERATIONS} products per delete operation`,
      }, 400);
    }

    // Delete products
    const { error, count } = await supabase
      .from('products')
      .delete()
      .in('id', idsToDelete);

    if (error) {
      console.error('Product delete error:', error);
      return errorResponse({
        code: 'DB_008',
        message: 'Failed to delete products',
        details: error.message,
      }, 500);
    }

    return successResponse({
      deleted: count || idsToDelete.length,
      ids: idsToDelete,
    });
  } catch (error) {
    console.error('Products DELETE error:', error);
    return errorResponse({
      code: 'API_004',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}
