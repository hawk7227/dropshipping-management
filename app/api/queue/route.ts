// app/api/queue/route.ts
// COMPLETE Queue API - Manage Shopify sync queue with status, retry, pause/resume
// Handles: queue listing, item management, bulk operations, statistics

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ShopifyQueueItem, QueueStatus, QueueOperation, ApiResponse } from '@/types';
import type { ApiError } from '@/types/errors';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface QueueQueryParams {
  status?: QueueStatus | 'all';
  operation?: QueueOperation | 'all';
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface QueueStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  retrying: number;
  avgProcessingTime: number;
  successRate: number;
  isPaused: boolean;
}

interface BulkQueueOperation {
  operation: 'retry' | 'cancel' | 'prioritize';
  itemIds: string[];
  priority?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_RETRIES = 3;

// In-memory queue pause state (use Redis in production)
let queuePaused = false;

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
 * Create error response
 */
function errorResponse(error: ApiError, status: number = 400): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * Create success response
 */
function successResponse<T>(data: T, meta?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ success: true, data, ...(meta && { meta }) });
}

/**
 * Parse query parameters
 */
function parseQueryParams(searchParams: URLSearchParams): QueueQueryParams {
  return {
    status: (searchParams.get('status') as QueueStatus | 'all') || 'all',
    operation: (searchParams.get('operation') as QueueOperation | 'all') || 'all',
    page: parseInt(searchParams.get('page') || '1'),
    pageSize: Math.min(parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE),
    sortBy: searchParams.get('sortBy') || 'created_at',
    sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
  };
}

/**
 * Calculate queue statistics
 */
async function calculateQueueStats(supabase: ReturnType<typeof getSupabaseClient>): Promise<QueueStats> {
  // Get counts by status
  const { data: statusCounts } = await getSupabaseClient()
    .from('shopify_queue')
    .select('status')
    .returns<{ status: QueueStatus }[]>();

  const counts = (statusCounts || []).reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Get completed items for processing time calculation
  const { data: completedItems } = await getSupabaseClient()
    .from('shopify_queue')
    .select('started_at, completed_at')
    .eq('status', 'completed')
    .not('started_at', 'is', null)
    .not('completed_at', 'is', null)
    .limit(100);

  let avgProcessingTime = 0;
  if (completedItems && completedItems.length > 0) {
    const totalTime = completedItems.reduce((sum, item) => {
      const start = new Date(item.started_at!).getTime();
      const end = new Date(item.completed_at!).getTime();
      return sum + (end - start);
    }, 0);
    avgProcessingTime = totalTime / completedItems.length;
  }

  const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
  const completed = counts['completed'] || 0;
  const failed = counts['failed'] || 0;
  const successRate = (completed + failed) > 0
    ? (completed / (completed + failed)) * 100
    : 100;

  return {
    total,
    pending: counts['pending'] || 0,
    processing: counts['processing'] || 0,
    completed,
    failed,
    retrying: counts['retrying'] || 0,
    avgProcessingTime,
    successRate,
    isPaused: queuePaused,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GET - List queue items and stats
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const params = parseQueryParams(request.nextUrl.searchParams);

    // Check if stats only requested
    if (request.nextUrl.searchParams.get('statsOnly') === 'true') {
      const stats = await calculateQueueStats(supabase);
      return successResponse(stats);
    }

    // Build query
    let query = getSupabaseClient()
      .from('shopify_queue')
      .select('*, products!inner(id, asin, title, image_url, retail_price, status)', { count: 'exact' });

    // Apply filters
    if (params.status && params.status !== 'all') {
      query = query.eq('status', params.status);
    }

    if (params.operation && params.operation !== 'all') {
      query = query.eq('operation', params.operation);
    }

    // Sorting
    const validSortColumns = ['created_at', 'updated_at', 'priority', 'retry_count'];
    const sortColumn = validSortColumns.includes(params.sortBy || '') ? params.sortBy! : 'created_at';
    query = query.order(sortColumn, { ascending: params.sortOrder === 'asc' });

    // Pagination
    const page = Math.max(1, params.page || 1);
    const pageSize = params.pageSize || DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * pageSize;
    query = query.range(offset, offset + pageSize - 1);

    const { data: items, error, count } = await query;

    if (error) {
      console.error('Queue query error:', error);
      return errorResponse({
        code: 'QUEUE_001',
        message: 'Failed to fetch queue',
        details: error.message,
      }, 500);
    }

    // Get stats
    const stats = await calculateQueueStats(supabase);

    return successResponse(items || [], {
      pagination: {
        page,
        pageSize,
        totalItems: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
      stats,
    });
  } catch (error) {
    console.error('Queue GET error:', error);
    return errorResponse({
      code: 'QUEUE_002',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST - Add item to queue or bulk operations
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();

    // Handle queue control operations
    if (body.action) {
      switch (body.action) {
        case 'pause':
          queuePaused = true;
          return successResponse({ paused: true, message: 'Queue paused' });

        case 'resume':
          queuePaused = false;
          return successResponse({ paused: false, message: 'Queue resumed' });

        case 'clear_completed':
          const { error: clearError, count } = await getSupabaseClient()
            .from('shopify_queue')
            .delete()
            .eq('status', 'completed');

          if (clearError) {
            return errorResponse({
              code: 'QUEUE_003',
              message: 'Failed to clear completed items',
              details: clearError.message,
            }, 500);
          }

          return successResponse({ cleared: count || 0 });

        case 'retry_all_failed':
          const { error: retryError } = await getSupabaseClient()
            .from('shopify_queue')
            .update({
              status: 'pending',
              retry_count: 0,
              error: null,
              updated_at: new Date().toISOString(),
            })
            .eq('status', 'failed')
            .lt('retry_count', MAX_RETRIES);

          if (retryError) {
            return errorResponse({
              code: 'QUEUE_004',
              message: 'Failed to retry items',
              details: retryError.message,
            }, 500);
          }

          return successResponse({ message: 'All failed items queued for retry' });
      }
    }

    // Handle bulk operations
    if (body.operation && body.itemIds) {
      return handleBulkOperation(supabase, body as BulkQueueOperation);
    }

    // Add new item to queue
    if (body.productId && body.operation) {
      // Verify product exists
      const { data: product } = await getSupabaseClient()
        .from('products')
        .select('id, asin')
        .eq('id', body.productId)
        .single();

      if (!product) {
        return errorResponse({
          code: 'QUEUE_005',
          message: 'Product not found',
        }, 404);
      }

      // Check for existing pending item
      const { data: existing } = await getSupabaseClient()
        .from('shopify_queue')
        .select('id')
        .eq('product_id', body.productId)
        .eq('operation', body.operation)
        .in('status', ['pending', 'processing'])
        .single();

      if (existing) {
        return errorResponse({
          code: 'QUEUE_006',
          message: 'Item already in queue',
          details: 'A pending operation for this product already exists',
        }, 409);
      }

      // Add to queue
      const { data: item, error } = await getSupabaseClient()
        .from('shopify_queue')
        .insert({
          product_id: body.productId,
          asin: product.asin,
          operation: body.operation,
          status: 'pending',
          priority: body.priority || 5,
          retry_count: 0,
          max_retries: MAX_RETRIES,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        return errorResponse({
          code: 'QUEUE_007',
          message: 'Failed to add to queue',
          details: error.message,
        }, 500);
      }

      return successResponse(item, { created: true });
    }

    return errorResponse({
      code: 'QUEUE_008',
      message: 'Invalid request',
      suggestion: 'Provide productId and operation, or action, or bulk operation',
    }, 400);
  } catch (error) {
    console.error('Queue POST error:', error);
    return errorResponse({
      code: 'QUEUE_009',
      message: 'Invalid request',
      details: error instanceof Error ? error.message : 'Failed to parse request',
    }, 400);
  }
}

/**
 * Handle bulk queue operations
 */
async function handleBulkOperation(
  supabase: ReturnType<typeof getSupabaseClient>,
  data: BulkQueueOperation
): Promise<NextResponse> {
  const { operation, itemIds, priority } = data;

  if (!itemIds || itemIds.length === 0) {
    return errorResponse({
      code: 'QUEUE_010',
      message: 'No items specified',
    }, 400);
  }

  switch (operation) {
    case 'retry': {
      const { error } = await getSupabaseClient()
        .from('shopify_queue')
        .update({
          status: 'pending',
          error: null,
          updated_at: new Date().toISOString(),
        })
        .in('id', itemIds)
        .eq('status', 'failed');

      if (error) {
        return errorResponse({
          code: 'QUEUE_011',
          message: 'Failed to retry items',
          details: error.message,
        }, 500);
      }

      return successResponse({ retried: itemIds.length });
    }

    case 'cancel': {
      const { error } = await getSupabaseClient()
        .from('shopify_queue')
        .delete()
        .in('id', itemIds)
        .eq('status', 'pending');

      if (error) {
        return errorResponse({
          code: 'QUEUE_012',
          message: 'Failed to cancel items',
          details: error.message,
        }, 500);
      }

      return successResponse({ cancelled: itemIds.length });
    }

    case 'prioritize': {
      if (priority === undefined) {
        return errorResponse({
          code: 'QUEUE_013',
          message: 'Priority value required',
        }, 400);
      }

      const { error } = await getSupabaseClient()
        .from('shopify_queue')
        .update({
          priority,
          updated_at: new Date().toISOString(),
        })
        .in('id', itemIds);

      if (error) {
        return errorResponse({
          code: 'QUEUE_014',
          message: 'Failed to update priority',
          details: error.message,
        }, 500);
      }

      return successResponse({ updated: itemIds.length, priority });
    }

    default:
      return errorResponse({
        code: 'QUEUE_015',
        message: 'Invalid operation',
        details: `Operation "${operation}" is not supported`,
      }, 400);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PUT - Update queue item
// ═══════════════════════════════════════════════════════════════════════════

export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const itemId = request.nextUrl.searchParams.get('id');
    const body = await request.json();

    if (!itemId) {
      return errorResponse({
        code: 'QUEUE_016',
        message: 'Item ID required',
      }, 400);
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.status !== undefined) updates.status = body.status;

    const { data: item, error } = await getSupabaseClient()
      .from('shopify_queue')
      .update(updates)
      .eq('id', itemId)
      .select()
      .single();

    if (error) {
      return errorResponse({
        code: 'QUEUE_017',
        message: 'Failed to update item',
        details: error.message,
      }, 500);
    }

    return successResponse(item);
  } catch (error) {
    console.error('Queue PUT error:', error);
    return errorResponse({
      code: 'QUEUE_018',
      message: 'Invalid request',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 400);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE - Remove queue item(s)
// ═══════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const itemId = request.nextUrl.searchParams.get('id');
    const itemIds = request.nextUrl.searchParams.get('ids')?.split(',').filter(Boolean);

    const idsToDelete = itemIds || (itemId ? [itemId] : []);

    if (idsToDelete.length === 0) {
      return errorResponse({
        code: 'QUEUE_019',
        message: 'No items specified',
      }, 400);
    }

    const { error, count } = await getSupabaseClient()
      .from('shopify_queue')
      .delete()
      .in('id', idsToDelete);

    if (error) {
      return errorResponse({
        code: 'QUEUE_020',
        message: 'Failed to delete items',
        details: error.message,
      }, 500);
    }

    return successResponse({ deleted: count || idsToDelete.length });
  } catch (error) {
    console.error('Queue DELETE error:', error);
    return errorResponse({
      code: 'QUEUE_021',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}
