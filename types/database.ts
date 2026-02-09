// types/database.ts
// Complete type definitions for all 6 feature categories

// =====================
// 1. PRICE INTELLIGENCE
// =====================
export interface DailyStats {
  id?: string;
  date: string;
  total_products: number;
  active_products: number;
  total_members: number;
  new_members: number;
  churned_members: number;
  total_revenue: number;
  membership_revenue: number;
  product_revenue: number;
  total_orders: number;
  average_order_value: number;
  price_updates: number;
  competitor_checks: number;
  created_at?: string;
}

export interface MemberAnalytics {
  id?: string;
  member_id: string;
  total_orders: number;
  total_spent: number;
  total_saved: number;
  last_order_at: string | null;
  avg_order_value: number;
  lifetime_value: number;
  churn_risk_score: number;
  updated_at?: string;
}

export interface ChannelPerformance {
  id?: string;
  date: string;
  channel: string;
  orders: number;
  revenue: number;
  items_sold: number;
  avg_order_value: number;
  returns: number;
  created_at?: string;
}

export interface ProductPerformance {
  id: string;
  date: string;
  product_id: string;
  views: number;
  add_to_carts: number;
  purchases: number;
  revenue: number;
  conversion_rate: number;
  created_at: string;
}

// Ensure Product is also defined if not already present
export interface Product {
  id: string;
  title: string;
  description: string; // or body_html depending on your schema
  body_html: string;
  vendor: string;
  product_type: string;
  status: string;
  handle: string;
  tags: string[];
  options: ProductOption[] | null;
  images: any[];
  variants: any[];
  price_synced_at: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string;
}

// export interface Product {
//   id: string;
//   title: string;
//   handle: string;
//   vendor: string | null;
//   product_type: string | null;
//   status: 'active' | 'draft' | 'archived';
//   tags: string[] | null;
//   body_html: string | null;
//   images: ProductImage[] | null;
//   options: ProductOption[] | null;
//   created_at: string | null;
//   updated_at: string | null;
//   synced_at: string;
// }
export interface CompetitorPrice {
  id: string;
  product_id: string;
  sku: string | null;
  asin: string | null;
  competitor_name: string;
  competitor_price: number;
  competitor_url: string | null;
  our_price: number | null;
  member_price: number | null;
  price_difference: number | null;
  price_difference_pct: number | null;
  is_prime: boolean;
  availability: string | null;
  fetched_at: string;
  created_at: string;
  updated_at: string;
}

export interface PriceHistory {
  id: string;
  product_id: string;
  source: string;
  price: number;
  recorded_at: string;
}

export interface PriceSyncJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  total_products: number;
  processed: number;
  errors: number;
  started_at: string | null;
  completed_at: string | null;
  error_log: Record<string, string>[] | null;
  created_at: string;
}

export interface MarginAlert {
  id: string;
  product_id: string;
  alert_type: 'critical' | 'warning' | 'info';
  alert_code: string;
  message: string;
  recommendation: string | null;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

// =====================
// 2. PRODUCT MANAGEMENT
// =====================

// export interface Product {
//   id: string;
//   title: string;
//   handle: string;
//   vendor: string | null;
//   product_type: string | null;
//   status: 'active' | 'draft' | 'archived';
//   tags: string[] | null;
//   body_html: string | null;
//   images: ProductImage[] | null;
//   options: ProductOption[] | null;
//   created_at: string | null;
//   updated_at: string | null;
//   synced_at: string;
// }

export interface ProductImage {
  id: string;
  src: string;
  alt: string | null;
  position: number;
}

export interface ProductOption {
  id: string;
  name: string;
  position: number;
  values: string[];
}

export interface Variant {
  id: string;
  product_id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  compare_at_price: number | null;
  cost: number | null;
  inventory_item_id: string | null;
  inventory_quantity: number;
  weight: number | null;
  weight_unit: string | null;
  requires_shipping: boolean;
  taxable: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProductCost {
  id: string;
  product_id: string;
  variant_id: string | null;
  supplier_cost: number;
  shipping_inbound: number;
  packaging_cost: number;
  labor_cost: number;
  other_costs: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

export interface ProductImport {
  id: string;
  batch_id: string | null;
  source: string;
  status: string;
  product_data: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

// =====================
// 3. SOCIAL & MARKETING
// =====================

export interface SocialPost {
  id: string;
  platform: string;
  content: string;
  media_urls: string[] | null;
  hashtags: string[] | null;
  scheduled_at: string | null;
  published_at: string | null;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  platform_post_id: string | null;
  engagement: PostEngagement | null;
  product_id: string | null;
  campaign_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostEngagement {
  likes: number;
  comments: number;
  shares: number;
  views: number;
}

export interface SocialAccount {
  id: string;
  platform: string;
  account_id: string;
  account_name: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  profile_data: Record<string, unknown> | null;
  is_active: boolean;
  connected_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  spent: number;
  target_audience: Record<string, unknown> | null;
  metrics: CampaignMetrics | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

export interface EmailCampaign {
  id: string;
  campaign_id: string | null;
  subject: string;
  preheader: string | null;
  body_html: string;
  body_text: string | null;
  from_name: string | null;
  from_email: string | null;
  status: string;
  sent_at: string | null;
  stats: EmailStats | null;
  created_at: string;
}

export interface EmailStats {
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
  bounces: number;
  unsubscribes: number;
}

export interface ContentCalendarItem {
  id: string;
  date: string;
  platform: string;
  content_type: string;
  title: string;
  description: string | null;
  status: string;
  post_id: string | null;
  created_at: string;
}

// =====================
// 4. MULTI-CHANNEL
// =====================

export interface ChannelConfig {
  id: string;
  channel: string;
  is_enabled: boolean;
  credentials: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  last_sync_at: string | null;
  sync_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChannelListing {
  id: string;
  product_id: string;
  variant_id: string | null;
  channel: string;
  channel_listing_id: string;
  channel_url: string | null;
  status: string;
  price: number;
  quantity: number;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformListing {
  id: string;
  product_id: string;
  platform: string; // 'shopify', 'ebay', 'tiktok', 'google'
  platform_listing_id: string;
  platform_url: string | null;
  status: 'active' | 'paused' | 'error' | 'pending';
  synced_at: string | null;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShopifyQueue {
  id: string;
  product_ids: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processed: number;
  created: number;
  updated: number;
  failed: number;
  error_log: Record<string, string>[] | null;
  created_at: string;
  updated_at: string;
}

export interface ChannelPerformance {
  id: string;
  date: string;
  channel: string;
  orders: number;
  revenue: number;
  items_sold: number;
  avg_order_value: number;
  returns: number;
  created_at: string;
}

export interface ChannelStatus {
  name: string;
  configured: boolean;
  active: boolean;
  listings_count: number;
  last_sync: string | null;
  monthly_revenue: number;
}

export interface SyncJobStatus {
  total: number;
  processed: number;
  created: number;
  updated: number;
  failed: number;
  status: string;
  estimated_remaining_seconds: number;
}

export interface UnifiedOrder {
  id: string;
  channel: string;
  channel_order_id: string;
  status: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_name: string | null;
  shipping_address1: string | null;
  shipping_address2: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_postal: string | null;
  shipping_country: string | null;
  subtotal: number | null;
  shipping_cost: number | null;
  tax: number | null;
  total: number;
  items: OrderItem[];
  tracking_number: string | null;
  tracking_carrier: string | null;
  fulfilled_at: string | null;
  channel_created_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  product_id: string;
  sku: string;
  title: string;
  quantity: number;
  price: number;
}

export interface OrderRoutingRule {
  id: string;
  name: string;
  priority: number;
  conditions: RoutingCondition[];
  action: string;
  action_params: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
}

export interface RoutingCondition {
  field: string;
  operator: string;
  value: string | number | string[];
}

// =====================
// 5. AI ENGINES
// =====================

export interface AiContent {
  id: string;
  type: string;
  input_data: Record<string, unknown>;
  output_text: string;
  model: string;
  tokens_used: number | null;
  quality_score: number | null;
  is_approved: boolean | null;
  used_for: string | null;
  created_at: string;
}

export interface SeoMetadata {
  id: string;
  product_id: string | null;
  page_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
  keywords: string[] | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  schema_markup: Record<string, unknown> | null;
  seo_score: number | null;
  recommendations: SeoRecommendation[] | null;
  created_at: string;
  updated_at: string;
}

export interface SeoRecommendation {
  type: string;
  category: string;
  message: string;
  impact: string;
}

export interface TrendData {
  id: string;
  keyword: string;
  category: string | null;
  search_volume: number | null;
  trend_score: number | null;
  competition_level: string | null;
  related_keywords: string[] | null;
  source: string;
  recorded_at: string;
}

export interface ImageQueueItem {
  id: string;
  product_id: string | null;
  original_url: string;
  processed_url: string | null;
  processing_type: string;
  status: string;
  settings: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

// =====================
// 6. ANALYTICS
// =====================

export interface DailyMetrics {
  id: string;
  date: string;
  channel: string | null;
  orders_count: number;
  revenue: number;
  items_sold: number;
  new_customers: number;
  returning_customers: number;
  avg_order_value: number | null;
  gross_margin: number | null;
  page_views: number;
  unique_visitors: number;
  conversion_rate: number | null;
  created_at: string;
}

export interface MemberMetrics {
  id: string;
  date: string;
  total_members: number;
  new_members: number;
  churned_members: number;
  monthly_members: number;
  annual_members: number;
  mrr: number;
  arr: number;
  avg_member_ltv: number | null;
  member_orders: number;
  member_revenue: number;
  created_at: string;
}

export interface ProductPerformance {
  id: string;
  product_id: string;
  period_start: string;
  period_end: string;
  views: number;
  add_to_carts: number;
  purchases: number;
  revenue: number;
  units_sold: number;
  return_rate: number | null;
  avg_rating: number | null;
  review_count: number;
  created_at: string;
}

// =====================
// API & DASHBOARD TYPES
// =====================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface DashboardSummary {
  revenue: { today: number; yesterday: number; this_week: number; trend: number };
  orders: { today: number; pending: number; processing: number; shipped: number };
  members: { total: number; active: number; mrr: number; churn_rate: number };
  products: { total: number; active: number; low_stock: number; out_of_stock: number };
  price_alerts: { critical: number; warning: number; total: number };
}
/**
 * Supabase Database Types
 * Auto-generated types for type-safe database queries
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      memberships: {
        Row: {
          id: string;
          user_id: string;
          email: string;
          stripe_customer_id: string;
          stripe_subscription_id: string;
          status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired';
          tier: 'monthly' | 'annual';
          current_period_start: string;
          current_period_end: string;
          cancel_at_period_end: boolean;
          canceled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email: string;
          stripe_customer_id: string;
          stripe_subscription_id: string;
          status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired';
          tier: 'monthly' | 'annual';
          current_period_start: string;
          current_period_end: string;
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          email?: string;
          stripe_customer_id?: string;
          stripe_subscription_id?: string;
          status?: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired';
          tier?: 'monthly' | 'annual';
          current_period_start?: string;
          current_period_end?: string;
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          user_id: string | null;
          email: string;
          status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'canceled' | 'refunded';
          subtotal: number;
          member_discount: number;
          shipping: number;
          tax: number;
          total: number;
          is_member_order: boolean;
          shipping_address: Json | null;
          items: Json;
          stripe_session_id: string | null;
          stripe_payment_intent_id: string | null;
          tracking_number: string | null;
          tracking_url: string | null;
          shipped_at: string | null;
          delivered_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id?: string | null;
          email: string;
          status?: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'canceled' | 'refunded';
          subtotal: number;
          member_discount?: number;
          shipping?: number;
          tax?: number;
          total: number;
          is_member_order?: boolean;
          shipping_address?: Json | null;
          items?: Json;
          stripe_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          tracking_number?: string | null;
          tracking_url?: string | null;
          shipped_at?: string | null;
          delivered_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          email?: string;
          status?: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'canceled' | 'refunded';
          subtotal?: number;
          member_discount?: number;
          shipping?: number;
          tax?: number;
          total?: number;
          is_member_order?: boolean;
          shipping_address?: Json | null;
          items?: Json;
          stripe_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          tracking_number?: string | null;
          tracking_url?: string | null;
          shipped_at?: string | null;
          delivered_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          price: number;
          compare_at_price: number | null;
          sku: string | null;
          inventory_quantity: number | null;
          active: boolean;
          image_url: string | null;
          images: Json;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          title: string;
          description?: string | null;
          price: number;
          compare_at_price?: number | null;
          sku?: string | null;
          inventory_quantity?: number | null;
          active?: boolean;
          image_url?: string | null;
          images?: Json;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          price?: number;
          compare_at_price?: number | null;
          sku?: string | null;
          inventory_quantity?: number | null;
          active?: boolean;
          image_url?: string | null;
          images?: Json;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      membership_events: {
        Row: {
          id: string;
          membership_id: string | null;
          user_id: string | null;
          event_type: 'subscription.created' | 'subscription.updated' | 'subscription.deleted' | 'invoice.paid' | 'invoice.payment_failed' | 'plan.changed' | 'canceled' | 'reactivated';
          previous_status: string | null;
          new_status: string | null;
          metadata: Json;
          stripe_event_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          membership_id?: string | null;
          user_id?: string | null;
          event_type: 'subscription.created' | 'subscription.updated' | 'subscription.deleted' | 'invoice.paid' | 'invoice.payment_failed' | 'plan.changed' | 'canceled' | 'reactivated';
          previous_status?: string | null;
          new_status?: string | null;
          metadata?: Json;
          stripe_event_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          membership_id?: string | null;
          user_id?: string | null;
          event_type?: 'subscription.created' | 'subscription.updated' | 'subscription.deleted' | 'invoice.paid' | 'invoice.payment_failed' | 'plan.changed' | 'canceled' | 'reactivated';
          previous_status?: string | null;
          new_status?: string | null;
          metadata?: Json;
          stripe_event_id?: string | null;
          created_at?: string;
        };
      };
    };
    Views: {
      active_members: {
        Row: {
          id: string | null;
          user_id: string | null;
          email: string | null;
          tier: string | null;
          status: string | null;
          current_period_end: string | null;
          created_at: string | null;
        };
      };
      membership_stats: {
        Row: {
          total_active: number | null;
          monthly_count: number | null;
          annual_count: number | null;
          canceled_count: number | null;
          estimated_mrr: number | null;
        };
      };
    };
    Functions: {
      is_active_member: {
        Args: {
          check_user_id: string;
        };
        Returns: boolean;
      };
    };
  };
}
