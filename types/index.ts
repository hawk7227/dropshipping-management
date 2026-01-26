// types/index.ts
// Core TypeScript types for Dropship Pro Dashboard
// This file defines dropshipping-specific types
// 
// NOTE: For database/Supabase types, import from '@/types/database'
// This file focuses on Amazon/dropshipping price intelligence

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT TYPES (Dropshipping-specific)
// ═══════════════════════════════════════════════════════════════════════════

export type ProductSource = 'shopify' | 'rainforest' | 'keepa' | 'manual';
export type ProductStatus = 'draft' | 'active' | 'paused' | 'pending' | 'discontinued' | 'removed';
export type LifecycleStatus = 'new' | 'active' | 'below_threshold' | 'out_of_stock' | 'discontinued';
export type ProfitStatus = 'profitable' | 'below_threshold' | 'unknown';

// Dropshipping product with Amazon pricing fields
export interface Product {
  // Identity
  id: string;
  shopify_product_id?: string | null;
  title: string;
  handle?: string | null;

  // Source tracking
  source: ProductSource;
  source_product_id?: string | null; // ASIN for Amazon products
  source_url?: string | null;

  // Pricing: Your costs
  cost_price: number | null; // What you pay (Amazon cost)
  retail_price: number | null; // Your list price
  member_price?: number | null; // Discounted price (optional)

  // Pricing: Competitor displays (randomized, 80%+ higher)
  amazon_display_price?: number | null;
  costco_display_price?: number | null;
  ebay_display_price?: number | null;
  sams_display_price?: number | null;
  compare_at_price?: number | null; // Highest competitor (for strikethrough)

  // Profit tracking
  profit_amount?: number | null;
  profit_percent?: number | null;
  profit_status: ProfitStatus;

  // Product attributes
  category?: string | null;
  vendor?: string | null;
  product_type?: string | null;
  tags?: string[] | null;
  rating?: number | null;
  review_count?: number | null;
  is_prime?: boolean;
  image_url?: string | null;

  // Inventory
  inventory_quantity?: number;

  // Status
  status: ProductStatus;
  lifecycle_status: LifecycleStatus;
  below_threshold_since?: string | null; // ISO timestamp

  // Timestamps
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
  synced_at?: string | null;
  last_price_check?: string | null;

  // Admin override tracking
  admin_override?: boolean;
  admin_override_by?: string | null;
  admin_override_at?: string | null;
}

export interface ProductCreateInput {
  title: string;
  source?: ProductSource;
  source_product_id?: string;
  source_url?: string;
  cost_price: number;
  retail_price?: number; // Auto-calculated if not provided
  category?: string;
  vendor?: string;
  product_type?: string;
  tags?: string[];
  rating?: number;
  review_count?: number;
  is_prime?: boolean;
  image_url?: string;
  inventory_quantity?: number;
  admin_override?: boolean;
}

export interface ProductUpdateInput extends Partial<ProductCreateInput> {
  id: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPETITOR PRICING TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CompetitorPrices {
  amazon: number;
  costco: number;
  ebay: number;
  sams: number;
  highest: number; // Used for compare_at_price
}

export interface AllPrices {
  cost: number;
  listPrice: number;
  competitors: CompetitorPrices;
  profit: ProfitMetrics;
}

export interface ProfitMetrics {
  amount: number; // Dollar amount profit
  percent: number; // Percentage profit
  status: ProfitStatus;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHOPIFY QUEUE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type QueueAction = 'create' | 'update' | 'delete' | 'pause';
export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ShopifyQueueItem {
  id: string;
  product_id: string;
  action: QueueAction;
  status: QueueStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  error_message?: string | null;
  payload?: Record<string, unknown> | null;
  created_at: string;
  processed_at?: string | null;
  completed_at?: string | null;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// DISCOVERY / IMPORT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type JobType = 'discovery' | 'import' | 'refresh';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';
export type InputType = 'file' | 'paste' | 'prompt' | 'scheduled';

export interface DiscoveryJob {
  id: string;
  type: JobType;
  status: JobStatus;
  input_type?: InputType | null;
  input_data?: Record<string, unknown> | null;
  total_items?: number | null;
  processed_items: number;
  successful_items: number;
  failed_items: number;
  skipped_items: number;
  results?: Record<string, unknown> | null;
  errors?: string[] | null;
  estimated_cost_rainforest?: number | null;
  estimated_cost_keepa?: number | null;
  estimated_cost_total?: number | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface DiscoverySearchTerm {
  id: string;
  category: string;
  search_term: string;
  is_active: boolean;
  last_searched?: string | null;
  products_found: number;
  created_at: string;
}

export interface RainforestSearchResult {
  asin: string;
  title: string;
  price: number | null;
  rating: number | null;
  reviews: number | null;
  isPrime: boolean;
  imageUrl?: string | null;
  category?: string | null;
}

export interface KeepaProductData {
  asin: string;
  priceHistory: Array<{ timestamp: number; price: number }>;
  salesRank?: number | null;
  avgPrice30d?: number | null;
  avgPrice90d?: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// AI SUGGESTIONS TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type SuggestionType = 'stale_products' | 'margin_drop' | 'cost_optimization' | 'stock_alert';
export type SuggestionPriority = 'low' | 'medium' | 'high' | 'critical';
export type SuggestionStatus = 'active' | 'dismissed' | 'actioned';
export type SuggestionActionType = 'refresh' | 'pause' | 'remove' | 'optimize' | 'view';

export interface AISuggestion {
  id: string;
  type: SuggestionType;
  priority: SuggestionPriority;
  title: string;
  description: string;
  action_label?: string | null;
  action_type?: SuggestionActionType | null;
  action_data?: Record<string, unknown> | null;
  affected_count?: number | null;
  estimated_impact?: string | null;
  status: SuggestionStatus;
  dismissed_at?: string | null;
  actioned_at?: string | null;
  created_at: string;
  expires_at?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type NotificationType = 'sms' | 'email' | 'dashboard';
export type NotificationCategory = 'margin_alert' | 'stock_alert' | 'import_complete' | 'system_error';
export type NotificationStatus = 'pending' | 'sent' | 'failed';

export interface Notification {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  data?: Record<string, unknown> | null;
  status: NotificationStatus;
  sent_at?: string | null;
  error_message?: string | null;
  created_at: string;
}

export interface NotificationSettings {
  enabled: boolean;
  phone_number: string;
  alerts: {
    margin_alerts: boolean;
    stock_alerts: boolean;
    import_completion: boolean;
    system_errors: boolean;
  };
  quiet_hours: {
    enabled: boolean;
    start: string; // HH:MM format
    end: string; // HH:MM format
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN SETTINGS TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface AdminSetting {
  id: string;
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
}

export interface ApiKeysSettings {
  rainforest: string;
  keepa: string;
  shopify_domain: string;
  shopify_access_token: string;
  twilio_account_sid: string;
  twilio_auth_token: string;
  twilio_phone_number: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// FILTER & PAGINATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ProductFilters {
  search?: string;
  source?: ProductSource;
  status?: ProductStatus;
  profitStatus?: ProfitStatus;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  minProfit?: number;
  maxProfit?: number;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type HealthStatus = 'operational' | 'degraded' | 'error' | 'not_configured';

export interface ServiceHealth {
  name: string;
  status: HealthStatus;
  message?: string;
  lastChecked: string;
  responseTime?: number; // milliseconds
  details?: Record<string, unknown>;
}

export interface SystemHealth {
  overall: HealthStatus;
  services: ServiceHealth[];
  timestamp: string;
}

export interface SystemIssue {
  id: string;
  code: string;
  message: string;
  details?: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  feature?: string;
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// API COST ESTIMATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ApiName = 'rainforest' | 'keepa' | 'shopify';

export interface ApiCostEstimate {
  id: string;
  job_id?: string | null;
  api_name: ApiName;
  call_count: number;
  rate_per_call: number;
  estimated_cost: number;
  created_at: string;
}

export interface CostBreakdown {
  rainforest: { calls: number; cost: number };
  keepa: { calls: number; cost: number };
  total: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DATA FLAG TYPE
// ═══════════════════════════════════════════════════════════════════════════

export interface MockDataResult<T> {
  data: T;
  isMock: boolean;
  mockReason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// API RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generic API response wrapper
 * Used across all API endpoints for consistent response structure
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: string;
  };
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
    hasMore?: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRICE ALERT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type PriceAlertType = 
  | 'price_drop'
  | 'price_increase'
  | 'competitor_change'
  | 'margin_warning'
  | 'out_of_stock'
  | 'back_in_stock';

export type PriceAlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface PriceAlert {
  id: string;
  product_id: string;
  asin?: string;
  title: string;
  type: PriceAlertType;
  severity: PriceAlertSeverity;
  message: string;
  
  // Price details
  previous_price?: number;
  current_price?: number;
  price_change?: number;
  price_change_percent?: number;
  
  // Margin details
  previous_margin?: number;
  current_margin?: number;
  
  // Status
  acknowledged: boolean;
  acknowledged_at?: string;
  acknowledged_by?: string;
  
  // Timestamps
  created_at: string;
  expires_at?: string;
}
