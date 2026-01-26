// lib/db/supabase.ts
// Supabase client configuration and database utilities
// Provides typed database access with error handling

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { 
  Product, 
  CompetitorPrices, 
  ShopifyQueueItem, 
  DiscoveryJob, 
  ImportJob,
  AISuggestion,
  Notification,
  PaginatedResult,
  PaginationParams,
} from '@/types';
import type { ApiResponse } from '@/types/errors';
import { AppError } from '@/types/errors';
import { createErrorResponse, createSuccessResponse } from '@/lib/utils/api-error-handler';

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE TYPES (matches schema.sql)
// ═══════════════════════════════════════════════════════════════════════════

export interface Database {
  public: {
    Tables: {
      products: {
        Row: ProductRow;
        Insert: ProductInsert;
        Update: ProductUpdate;
      };
      shopify_queue: {
        Row: ShopifyQueueRow;
        Insert: ShopifyQueueInsert;
        Update: ShopifyQueueUpdate;
      };
      discovery_jobs: {
        Row: DiscoveryJobRow;
        Insert: DiscoveryJobInsert;
        Update: DiscoveryJobUpdate;
      };
      import_jobs: {
        Row: ImportJobRow;
        Insert: ImportJobInsert;
        Update: ImportJobUpdate;
      };
      ai_suggestions: {
        Row: AISuggestionRow;
        Insert: AISuggestionInsert;
        Update: AISuggestionUpdate;
      };
      notifications: {
        Row: NotificationRow;
        Insert: NotificationInsert;
        Update: NotificationUpdate;
      };
      price_history: {
        Row: PriceHistoryRow;
        Insert: PriceHistoryInsert;
        Update: never;
      };
      system_settings: {
        Row: SystemSettingRow;
        Insert: SystemSettingInsert;
        Update: SystemSettingUpdate;
      };
      api_usage: {
        Row: ApiUsageRow;
        Insert: ApiUsageInsert;
        Update: never;
      };
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ROW TYPES (database columns)
// ═══════════════════════════════════════════════════════════════════════════

export interface ProductRow {
  id: string;
  title: string;
  source: 'rainforest' | 'keepa' | 'csv' | 'paste' | 'manual';
  source_product_id: string | null;
  asin: string | null;
  url: string | null;
  image_url: string | null;
  cost_price: number;
  retail_price: number;
  amazon_display_price: number | null;
  costco_display_price: number | null;
  ebay_display_price: number | null;
  sams_display_price: number | null;
  profit_amount: number | null;
  profit_percent: number | null;
  profit_status: 'profitable' | 'below_threshold' | 'unknown';
  status: 'draft' | 'active' | 'paused' | 'archived';
  lifecycle_status: 'new' | 'price_drop' | 'stable' | 'rising';
  shopify_product_id: string | null;
  shopify_sync_status: 'pending' | 'synced' | 'failed' | 'not_synced';
  rating: number | null;
  review_count: number | null;
  is_prime: boolean;
  last_price_check: string | null;
  prices_updated_at: string | null;
  admin_override: boolean;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ProductInsert = Omit<ProductRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

export type ProductUpdate = Partial<Omit<ProductRow, 'id' | 'created_at'>>;

export interface ShopifyQueueRow {
  id: string;
  product_id: string;
  action: 'create' | 'update' | 'delete' | 'pause' | 'unpause';
  priority: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  error_code: string | null;
  scheduled_for: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ShopifyQueueInsert = Omit<ShopifyQueueRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

export type ShopifyQueueUpdate = Partial<Omit<ShopifyQueueRow, 'id' | 'created_at'>>;

export interface DiscoveryJobRow {
  id: string;
  search_term: string;
  source: 'rainforest' | 'keepa';
  status: 'pending' | 'running' | 'completed' | 'failed';
  products_found: number;
  products_added: number;
  products_skipped: number;
  error_message: string | null;
  error_code: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export type DiscoveryJobInsert = Omit<DiscoveryJobRow, 'id' | 'created_at'> & {
  id?: string;
};

export type DiscoveryJobUpdate = Partial<Omit<DiscoveryJobRow, 'id' | 'created_at'>>;

export interface ImportJobRow {
  id: string;
  source: 'csv' | 'paste' | 'rainforest' | 'keepa';
  file_name: string | null;
  total_rows: number;
  processed_rows: number;
  successful_rows: number;
  failed_rows: number;
  skipped_rows: number;
  status: 'pending' | 'validating' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  error_code: string | null;
  errors_detail: Record<string, unknown>[] | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export type ImportJobInsert = Omit<ImportJobRow, 'id' | 'created_at'> & {
  id?: string;
};

export type ImportJobUpdate = Partial<Omit<ImportJobRow, 'id' | 'created_at'>>;

export interface AISuggestionRow {
  id: string;
  type: 'reprice' | 'pause' | 'archive' | 'promote' | 'bundle' | 'restock';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  product_id: string | null;
  product_ids: string[] | null;
  current_value: string | null;
  suggested_value: string | null;
  potential_impact: string | null;
  reasoning: string | null;
  confidence: number | null;
  status: 'pending' | 'accepted' | 'dismissed' | 'expired';
  expires_at: string | null;
  accepted_at: string | null;
  dismissed_at: string | null;
  created_at: string;
}

export type AISuggestionInsert = Omit<AISuggestionRow, 'id' | 'created_at'> & {
  id?: string;
};

export type AISuggestionUpdate = Partial<Omit<AISuggestionRow, 'id' | 'created_at'>>;

export interface NotificationRow {
  id: string;
  type: 'price_alert' | 'import_complete' | 'sync_failed' | 'queue_stuck' | 'system';
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  product_id: string | null;
  metadata: Record<string, unknown> | null;
  read: boolean;
  read_at: string | null;
  sms_sent: boolean;
  sms_sent_at: string | null;
  created_at: string;
}

export type NotificationInsert = Omit<NotificationRow, 'id' | 'created_at'> & {
  id?: string;
};

export type NotificationUpdate = Partial<Omit<NotificationRow, 'id' | 'created_at'>>;

export interface PriceHistoryRow {
  id: string;
  product_id: string;
  cost_price: number;
  retail_price: number;
  amazon_display_price: number | null;
  costco_display_price: number | null;
  ebay_display_price: number | null;
  sams_display_price: number | null;
  source: string | null;
  recorded_at: string;
}

export type PriceHistoryInsert = Omit<PriceHistoryRow, 'id' | 'recorded_at'> & {
  id?: string;
};

export interface SystemSettingRow {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
}

export type SystemSettingInsert = Omit<SystemSettingRow, 'updated_at'>;
export type SystemSettingUpdate = Partial<Omit<SystemSettingRow, 'key'>>;

export interface ApiUsageRow {
  id: string;
  api: string;
  operation: string;
  request_count: number;
  cost: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type ApiUsageInsert = Omit<ApiUsageRow, 'id' | 'created_at'> & {
  id?: string;
};

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT
// ═══════════════════════════════════════════════════════════════════════════

let supabaseInstance: SupabaseClient<Database> | null = null;

/**
 * Get Supabase configuration status
 */
export function hasSupabaseConfig(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Get the Supabase client instance
 * Uses service role key for server-side operations
 */
export function getSupabase(): SupabaseClient<Database> {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new AppError('DB_001', {
      url: supabaseUrl ? 'set' : 'missing',
      key: supabaseKey ? 'set' : 'missing',
    });
  }

  supabaseInstance = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseInstance;
}

/**
 * Get Supabase client for browser (public key)
 */
export function getSupabasePublic(): SupabaseClient<Database> | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, supabaseKey);
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Test database connection
 */
export async function testConnection(): Promise<ApiResponse<{ latency: number }>> {
  try {
    const supabase = getSupabase();
    const start = Date.now();
    
    const { error } = await supabase
      .from('products')
      .select('id')
      .limit(1);

    const latency = Date.now() - start;

    if (error) {
      console.error('[DB] Connection test failed:', error);
      return createErrorResponse(new AppError('DB_001', { error: error.message }));
    }

    return createSuccessResponse({ latency });
  } catch (error) {
    console.error('[DB] Connection test error:', error);
    if (error instanceof AppError) {
      return createErrorResponse(error);
    }
    return createErrorResponse(new AppError('DB_001', { error: String(error) }));
  }
}

/**
 * Execute a query with timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 30000
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new AppError('DB_002', { timeoutMs }));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]);
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGINATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply pagination to a query
 */
export function applyPagination(
  query: ReturnType<SupabaseClient<Database>['from']>['select'],
  params: PaginationParams
) {
  const page = params.page || 1;
  const pageSize = params.pageSize || 50;
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  return query.range(start, end);
}

/**
 * Create paginated result
 */
export function createPaginatedResult<T>(
  data: T[],
  totalCount: number,
  params: PaginationParams
): PaginatedResult<T> {
  const page = params.page || 1;
  const pageSize = params.pageSize || 50;
  const totalPages = Math.ceil(totalCount / pageSize);

  return {
    data,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR MAPPING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map Supabase error to our error codes
 */
export function mapSupabaseError(error: { code?: string; message?: string }): string {
  const code = error.code || '';
  const message = (error.message || '').toLowerCase();

  // Connection errors
  if (code === 'PGRST301' || message.includes('connection')) {
    return 'DB_001';
  }

  // Timeout errors
  if (code === '57014' || message.includes('timeout') || message.includes('cancel')) {
    return 'DB_002';
  }

  // Write errors
  if (code === '23505' || message.includes('duplicate')) {
    return 'DB_003';
  }

  // Constraint violations
  if (code === '23503' || code === '23514' || message.includes('constraint') || message.includes('violates')) {
    return 'DB_004';
  }

  // Schema errors
  if (code === '42703' || code === '42P01' || message.includes('column') || message.includes('table')) {
    return 'DB_005';
  }

  // RLS errors
  if (code === '42501' || message.includes('permission') || message.includes('denied')) {
    return 'DB_006';
  }

  // Default to generic database error
  return 'DB_001';
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERTERS (DB Row → App Type)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert database row to Product type
 */
export function rowToProduct(row: ProductRow): Product {
  const competitorPrices: CompetitorPrices | undefined = 
    row.amazon_display_price || row.costco_display_price || row.ebay_display_price || row.sams_display_price
      ? {
          amazon: row.amazon_display_price ?? undefined,
          costco: row.costco_display_price ?? undefined,
          ebay: row.ebay_display_price ?? undefined,
          sams: row.sams_display_price ?? undefined,
        }
      : undefined;

  return {
    id: row.id,
    title: row.title,
    source: row.source,
    sourceProductId: row.source_product_id ?? undefined,
    asin: row.asin ?? undefined,
    url: row.url ?? undefined,
    imageUrl: row.image_url ?? undefined,
    costPrice: row.cost_price,
    retailPrice: row.retail_price,
    competitorPrices,
    profitAmount: row.profit_amount ?? undefined,
    profitPercent: row.profit_percent ?? undefined,
    profitStatus: row.profit_status,
    status: row.status,
    lifecycleStatus: row.lifecycle_status,
    shopifyProductId: row.shopify_product_id ?? undefined,
    shopifySyncStatus: row.shopify_sync_status,
    rating: row.rating ?? undefined,
    reviewCount: row.review_count ?? undefined,
    isPrime: row.is_prime,
    lastPriceCheck: row.last_price_check ? new Date(row.last_price_check) : undefined,
    pricesUpdatedAt: row.prices_updated_at ? new Date(row.prices_updated_at) : undefined,
    adminOverride: row.admin_override,
    tags: row.tags,
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Convert Product to database insert row
 */
export function productToInsertRow(product: Partial<Product>): Partial<ProductInsert> {
  const row: Partial<ProductInsert> = {};

  if (product.title !== undefined) row.title = product.title;
  if (product.source !== undefined) row.source = product.source;
  if (product.sourceProductId !== undefined) row.source_product_id = product.sourceProductId;
  if (product.asin !== undefined) row.asin = product.asin;
  if (product.url !== undefined) row.url = product.url;
  if (product.imageUrl !== undefined) row.image_url = product.imageUrl;
  if (product.costPrice !== undefined) row.cost_price = product.costPrice;
  if (product.retailPrice !== undefined) row.retail_price = product.retailPrice;
  if (product.competitorPrices) {
    row.amazon_display_price = product.competitorPrices.amazon ?? null;
    row.costco_display_price = product.competitorPrices.costco ?? null;
    row.ebay_display_price = product.competitorPrices.ebay ?? null;
    row.sams_display_price = product.competitorPrices.sams ?? null;
  }
  if (product.profitAmount !== undefined) row.profit_amount = product.profitAmount;
  if (product.profitPercent !== undefined) row.profit_percent = product.profitPercent;
  if (product.profitStatus !== undefined) row.profit_status = product.profitStatus;
  if (product.status !== undefined) row.status = product.status;
  if (product.lifecycleStatus !== undefined) row.lifecycle_status = product.lifecycleStatus;
  if (product.shopifyProductId !== undefined) row.shopify_product_id = product.shopifyProductId;
  if (product.shopifySyncStatus !== undefined) row.shopify_sync_status = product.shopifySyncStatus;
  if (product.rating !== undefined) row.rating = product.rating;
  if (product.reviewCount !== undefined) row.review_count = product.reviewCount;
  if (product.isPrime !== undefined) row.is_prime = product.isPrime;
  if (product.lastPriceCheck !== undefined) row.last_price_check = product.lastPriceCheck?.toISOString() ?? null;
  if (product.pricesUpdatedAt !== undefined) row.prices_updated_at = product.pricesUpdatedAt?.toISOString() ?? null;
  if (product.adminOverride !== undefined) row.admin_override = product.adminOverride;
  if (product.tags !== undefined) row.tags = product.tags;
  if (product.notes !== undefined) row.notes = product.notes;

  return row;
}

/**
 * Convert database row to ShopifyQueueItem
 */
export function rowToQueueItem(row: ShopifyQueueRow): ShopifyQueueItem {
  return {
    id: row.id,
    productId: row.product_id,
    action: row.action,
    priority: row.priority,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error ?? undefined,
    errorCode: row.error_code ?? undefined,
    scheduledFor: row.scheduled_for ? new Date(row.scheduled_for) : undefined,
    processedAt: row.processed_at ? new Date(row.processed_at) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Convert database row to DiscoveryJob
 */
export function rowToDiscoveryJob(row: DiscoveryJobRow): DiscoveryJob {
  return {
    id: row.id,
    searchTerm: row.search_term,
    source: row.source,
    status: row.status,
    productsFound: row.products_found,
    productsAdded: row.products_added,
    productsSkipped: row.products_skipped,
    errorMessage: row.error_message ?? undefined,
    errorCode: row.error_code ?? undefined,
    startedAt: row.started_at ? new Date(row.started_at) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    createdAt: new Date(row.created_at),
  };
}

/**
 * Convert database row to ImportJob
 */
export function rowToImportJob(row: ImportJobRow): ImportJob {
  return {
    id: row.id,
    source: row.source,
    fileName: row.file_name ?? undefined,
    totalRows: row.total_rows,
    processedRows: row.processed_rows,
    successfulRows: row.successful_rows,
    failedRows: row.failed_rows,
    skippedRows: row.skipped_rows,
    status: row.status,
    errorMessage: row.error_message ?? undefined,
    errorCode: row.error_code ?? undefined,
    errorsDetail: row.errors_detail as ImportJob['errorsDetail'],
    startedAt: row.started_at ? new Date(row.started_at) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    createdAt: new Date(row.created_at),
  };
}

/**
 * Convert database row to AISuggestion
 */
export function rowToAISuggestion(row: AISuggestionRow): AISuggestion {
  return {
    id: row.id,
    type: row.type,
    priority: row.priority,
    title: row.title,
    description: row.description,
    productId: row.product_id ?? undefined,
    productIds: row.product_ids ?? undefined,
    currentValue: row.current_value ?? undefined,
    suggestedValue: row.suggested_value ?? undefined,
    potentialImpact: row.potential_impact ?? undefined,
    reasoning: row.reasoning ?? undefined,
    confidence: row.confidence ?? undefined,
    status: row.status,
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    acceptedAt: row.accepted_at ? new Date(row.accepted_at) : undefined,
    dismissedAt: row.dismissed_at ? new Date(row.dismissed_at) : undefined,
    createdAt: new Date(row.created_at),
  };
}

/**
 * Convert database row to Notification
 */
export function rowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    productId: row.product_id ?? undefined,
    metadata: row.metadata ?? undefined,
    read: row.read,
    readAt: row.read_at ? new Date(row.read_at) : undefined,
    smsSent: row.sms_sent,
    smsSentAt: row.sms_sent_at ? new Date(row.sms_sent_at) : undefined,
    createdAt: new Date(row.created_at),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT ALL
// ═══════════════════════════════════════════════════════════════════════════

export type { SupabaseClient };
