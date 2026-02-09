// types/ai-commander.ts
// TypeScript types for AI Command Center and Price Intelligence modules

/**
 * AI Command Center Types
 */

export interface CommandInterpretation {
  action: string;
  category: 'pricing' | 'products' | 'content' | 'orders' | 'channels' | 'analytics' | 'discovery';
  description: string;
  target_count?: number;
  estimated_duration?: string;
  parameters: Record<string, any>;
}

export interface CommandResults {
  success_count: number;
  error_count: number;
  affected_items: string[];
  errors: Array<{ item: string; error: string }>;
}

export interface CommandExecution {
  execution_id: string;
  command: string;
  interpretation: CommandInterpretation;
  status: 'planned' | 'executing' | 'completed' | 'failed';
  results?: CommandResults;
  executed_at?: string;
  error?: string;
}

export interface AiCommandLog {
  id: string;
  user_id?: string;
  command: string;
  interpretation: CommandInterpretation;
  execution: Partial<CommandExecution>;
  executed: boolean;
  dry_run: boolean;
  created_at: string;
}

export interface CommandStats {
  total_commands: number;
  successful: number;
  failed: number;
  total_items_affected: number;
  by_category: Record<string, number>;
  by_action: Record<string, number>;
}

/**
 * Price Intelligence Types
 */

export interface CompetitorPrice {
  id?: string;
  product_id: string;
  competitor: 'amazon' | 'walmart' | 'ebay';
  price: number;
  currency: string;
  in_stock: boolean;
  rating?: number;
  reviews_count?: number;
  checked_at: string;
}

export interface PriceHistory {
  id?: string;
  product_id: string;
  our_price: number;
  competitor_amazon?: number;
  competitor_walmart?: number;
  competitor_ebay?: number;
  margin_percentage?: number;
  recorded_at: string;
}

export interface MarginAnalysis {
  product_id: string;
  product_title: string;
  cost_price: number;
  our_price: number;
  lowest_competitor: number;
  highest_competitor: number;
  avg_competitor: number;
  margin_percentage: number;
  margin_status: 'healthy' | 'warning' | 'critical';
  action_needed: boolean;
  suggested_price?: number;
}

export interface PriceAlert {
  id?: string;
  product_id: string;
  type: 'margin_low' | 'competitor_undercut' | 'price_drop' | 'stock_alert';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  data: Record<string, any>;
  created_at: string;
  resolved_at?: string;
}

export interface SyncJobStatus {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  total_products: number;
  processed: number;
  succeeded: number;
  failed: number;
  started_at: string;
  completed_at?: string;
  errors: Array<{ product_id: string; error: string }>;
}

export interface MarginRule {
  id?: string;
  name: string;
  category?: string;
  min_margin: number;
  target_margin: number;
  max_margin: number;
  is_active: boolean;
  priority?: number;
}

export interface PriceComparison {
  product_id: string;
  our_price: number;
  amazon_price?: number;
  walmart_price?: number;
  ebay_price?: number;
  lowest_competitor: number;
  highest_competitor: number;
  avg_competitor: number;
  margin_percentage: number;
  margin_status: 'healthy' | 'warning' | 'critical';
  undercut_percentage?: number;
  last_updated: string;
}

export interface PriceTrackingStats {
  tracked_products: number;
  avg_margin: number;
  stale_prices: number;
  critical_alerts: number;
  margin_status: {
    healthy: number;
    warning: number;
    critical: number;
  };
}

export interface PriceTrend {
  avg_our_price: number;
  avg_competitor: number;
  price_change_percent: number;
  trend: 'up' | 'down' | 'stable';
}

/**
 * API Response Types
 */

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface CommandResponse extends ApiResponse<any> {
  command?: string;
  interpretation?: CommandInterpretation;
  execution?: CommandExecution;
  dryRun?: boolean;
}

export interface PriceIntelligenceResponse extends ApiResponse<any> {
  jobStatus?: SyncJobStatus;
  alerts_found?: number;
  recorded?: number;
  failed?: number;
}

/**
 * AI Command Actions
 */

export type PricingAction =
  | 'update_prices'
  | 'sync_prices'
  | 'apply_margin_rule'
  | 'adjust_prices_by_percentage';

export type ProductAction =
  | 'generate_descriptions'
  | 'update_titles'
  | 'pause_products'
  | 'activate_products';

export type ContentAction =
  | 'create_social_posts'
  | 'generate_seo_content';

export type CommandAction =
  | PricingAction
  | ProductAction
  | ContentAction;
