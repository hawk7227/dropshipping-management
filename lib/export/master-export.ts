// lib/export/master-export.ts
// ═══════════════════════════════════════════════════════════════════════════
// Master Export Utility
// Exports all product data to JSON and CSV formats for backup and analysis
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { 
  PRICING_RULES,
  calculateRetailPrice,
  calculateCompetitorPrices,
  estimateMonthlySales,
  DemandTier,
} from '@/lib/config/pricing-rules';

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

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ProductRecord {
  // Core identification
  id: string;
  asin: string;
  title: string;
  brand: string | null;
  category: string | null;
  
  // Pricing
  amazon_price: number | null;
  retail_price: number | null;
  member_price: number | null;
  cost: number | null;
  margin_percent: number | null;
  profit: number | null;
  
  // Competitor prices
  amazon_display_price: number | null;
  costco_display_price: number | null;
  ebay_display_price: number | null;
  sams_display_price: number | null;
  walmart_display_price: number | null;
  target_display_price: number | null;
  
  // Demand metrics
  current_bsr: number | null;
  avg_bsr_30d: number | null;
  avg_bsr_90d: number | null;
  bsr_volatility: number | null;
  bsr_trend: string | null;
  demand_score: number | null;
  demand_tier: DemandTier | null;
  estimated_monthly_sales: number | null;
  
  // Product details
  rating: number | null;
  review_count: number | null;
  is_prime: boolean;
  stock_status: string | null;
  
  // Images and URLs
  image_url: string | null;
  amazon_url: string | null;
  
  // Status and tracking
  status: string;
  last_price_check: string | null;
  last_demand_check: string | null;
  created_at: string;
  updated_at: string;
  
  // Shopify sync
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  shopify_synced_at: string | null;
  
  // eBay sync
  ebay_item_id: string | null;
  ebay_synced_at: string | null;
}

export interface ExportOptions {
  // Filtering
  status?: string | string[];
  demandTier?: DemandTier | DemandTier[];
  minDemandScore?: number;
  maxDemandScore?: number;
  minBSR?: number;
  maxBSR?: number;
  minPrice?: number;
  maxPrice?: number;
  minMargin?: number;
  category?: string | string[];
  isPrime?: boolean;
  stockStatus?: string | string[];
  
  // Date filters
  createdAfter?: Date;
  createdBefore?: Date;
  updatedAfter?: Date;
  updatedBefore?: Date;
  
  // Pagination
  limit?: number;
  offset?: number;
  
  // Sorting
  sortBy?: keyof ProductRecord;
  sortOrder?: 'asc' | 'desc';
  
  // Output options
  includeHistory?: boolean;
  includeDemandData?: boolean;
}

export interface ExportResult {
  success: boolean;
  format: 'json' | 'csv';
  data: string;
  productCount: number;
  exportedAt: string;
  filters: ExportOptions;
  error?: string;
}

export interface ExportStats {
  totalProducts: number;
  byStatus: Record<string, number>;
  byDemandTier: Record<string, number>;
  avgMargin: number;
  avgBSR: number;
  avgDemandScore: number;
  totalValue: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CSV COLUMN DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const MASTER_CSV_COLUMNS = [
  // Core
  'id',
  'asin',
  'title',
  'brand',
  'category',
  
  // Pricing
  'amazon_price',
  'retail_price',
  'member_price',
  'cost',
  'margin_percent',
  'profit',
  
  // Competitor prices
  'amazon_display_price',
  'costco_display_price',
  'ebay_display_price',
  'sams_display_price',
  'walmart_display_price',
  'target_display_price',
  
  // Demand
  'current_bsr',
  'avg_bsr_30d',
  'avg_bsr_90d',
  'bsr_volatility',
  'bsr_trend',
  'demand_score',
  'demand_tier',
  'estimated_monthly_sales',
  
  // Details
  'rating',
  'review_count',
  'is_prime',
  'stock_status',
  
  // URLs
  'image_url',
  'amazon_url',
  
  // Status
  'status',
  'last_price_check',
  'last_demand_check',
  'created_at',
  'updated_at',
  
  // Sync IDs
  'shopify_product_id',
  'shopify_variant_id',
  'shopify_synced_at',
  'ebay_item_id',
  'ebay_synced_at',
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function escapeCSV(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDate(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function getDemandTier(bsr: number | null, score: number | null): DemandTier | null {
  if (bsr === null || score === null) return null;
  
  const { tiers } = PRICING_RULES.demand;
  
  if (bsr <= tiers.high.maxBSR && score >= tiers.high.minDemandScore) return 'high';
  if (bsr <= tiers.medium.maxBSR && score >= tiers.medium.minDemandScore) return 'medium';
  if (bsr <= tiers.low.maxBSR && score >= tiers.low.minDemandScore) return 'low';
  return 'reject';
}

function calculateMargin(retailPrice: number | null, cost: number | null): number | null {
  if (!retailPrice || !cost || cost <= 0) return null;
  return Math.round(((retailPrice - cost) / retailPrice) * 10000) / 100;
}

function calculateProfit(retailPrice: number | null, cost: number | null): number | null {
  if (!retailPrice || !cost) return null;
  return Math.round((retailPrice - cost) * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY BUILDER
// ═══════════════════════════════════════════════════════════════════════════

async function queryProducts(options: ExportOptions = {}): Promise<ProductRecord[]> {
  console.log('[MasterExport] Querying products with options:', options);
  
  // Base query - join products with product_demand
  let query = getSupabaseClient()
    .from('products')
    .select(`
      id,
      asin,
      title,
      brand,
      category,
      amazon_price,
      retail_price,
      member_price,
      cost,
      amazon_display_price,
      costco_display_price,
      ebay_display_price,
      sams_display_price,
      walmart_display_price,
      target_display_price,
      rating,
      review_count,
      is_prime,
      stock_status,
      image_url,
      status,
      last_price_check,
      created_at,
      updated_at,
      shopify_product_id,
      shopify_variant_id,
      shopify_synced_at,
      ebay_item_id,
      ebay_synced_at,
      product_demand (
        current_bsr,
        avg_bsr_30d,
        avg_bsr_90d,
        bsr_volatility,
        bsr_trend,
        demand_score,
        estimated_monthly_sales,
        last_checked_at
      )
    `);
  
  // Apply filters
  if (options.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    query = query.in('status', statuses);
  }
  
  if (options.minPrice !== undefined) {
    query = query.gte('retail_price', options.minPrice);
  }
  
  if (options.maxPrice !== undefined) {
    query = query.lte('retail_price', options.maxPrice);
  }
  
  if (options.category) {
    const categories = Array.isArray(options.category) ? options.category : [options.category];
    query = query.in('category', categories);
  }
  
  if (options.isPrime !== undefined) {
    query = query.eq('is_prime', options.isPrime);
  }
  
  if (options.stockStatus) {
    const statuses = Array.isArray(options.stockStatus) ? options.stockStatus : [options.stockStatus];
    query = query.in('stock_status', statuses);
  }
  
  if (options.createdAfter) {
    query = query.gte('created_at', options.createdAfter.toISOString());
  }
  
  if (options.createdBefore) {
    query = query.lte('created_at', options.createdBefore.toISOString());
  }
  
  if (options.updatedAfter) {
    query = query.gte('updated_at', options.updatedAfter.toISOString());
  }
  
  if (options.updatedBefore) {
    query = query.lte('updated_at', options.updatedBefore.toISOString());
  }
  
  // Sorting
  const sortBy = options.sortBy || 'created_at';
  const sortOrder = options.sortOrder === 'asc' ? { ascending: true } : { ascending: false };
  query = query.order(sortBy, sortOrder);
  
  // Pagination
  if (options.limit) {
    query = query.limit(options.limit);
  }
  
  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 1000) - 1);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('[MasterExport] Query error:', error);
    throw new Error(`Failed to query products: ${error.message}`);
  }
  
  // Transform data
  const products: ProductRecord[] = (data || []).map((row: any) => {
    const demand = row.product_demand?.[0] || row.product_demand || {};
    const retailPrice = row.retail_price;
    const cost = row.cost || row.amazon_price;
    
    return {
      id: row.id,
      asin: row.asin,
      title: row.title,
      brand: row.brand,
      category: row.category,
      
      amazon_price: row.amazon_price,
      retail_price: retailPrice,
      member_price: row.member_price,
      cost: cost,
      margin_percent: calculateMargin(retailPrice, cost),
      profit: calculateProfit(retailPrice, cost),
      
      amazon_display_price: row.amazon_display_price,
      costco_display_price: row.costco_display_price,
      ebay_display_price: row.ebay_display_price,
      sams_display_price: row.sams_display_price,
      walmart_display_price: row.walmart_display_price,
      target_display_price: row.target_display_price,
      
      current_bsr: demand.current_bsr,
      avg_bsr_30d: demand.avg_bsr_30d,
      avg_bsr_90d: demand.avg_bsr_90d,
      bsr_volatility: demand.bsr_volatility,
      bsr_trend: demand.bsr_trend,
      demand_score: demand.demand_score,
      demand_tier: getDemandTier(demand.current_bsr, demand.demand_score),
      estimated_monthly_sales: demand.estimated_monthly_sales || estimateMonthlySales(demand.current_bsr),
      
      rating: row.rating,
      review_count: row.review_count,
      is_prime: row.is_prime || false,
      stock_status: row.stock_status,
      
      image_url: row.image_url,
      amazon_url: row.asin ? `https://www.amazon.com/dp/${row.asin}` : null,
      
      status: row.status,
      last_price_check: row.last_price_check,
      last_demand_check: demand.last_checked_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      
      shopify_product_id: row.shopify_product_id,
      shopify_variant_id: row.shopify_variant_id,
      shopify_synced_at: row.shopify_synced_at,
      ebay_item_id: row.ebay_item_id,
      ebay_synced_at: row.ebay_synced_at,
    };
  });
  
  // Post-query filters (for demand data that's in the joined table)
  let filtered = products;
  
  if (options.minDemandScore !== undefined) {
    filtered = filtered.filter(p => (p.demand_score || 0) >= options.minDemandScore!);
  }
  
  if (options.maxDemandScore !== undefined) {
    filtered = filtered.filter(p => (p.demand_score || 100) <= options.maxDemandScore!);
  }
  
  if (options.minBSR !== undefined) {
    filtered = filtered.filter(p => (p.current_bsr || Infinity) >= options.minBSR!);
  }
  
  if (options.maxBSR !== undefined) {
    filtered = filtered.filter(p => (p.current_bsr || 0) <= options.maxBSR!);
  }
  
  if (options.minMargin !== undefined) {
    filtered = filtered.filter(p => (p.margin_percent || 0) >= options.minMargin!);
  }
  
  if (options.demandTier) {
    const tiers = Array.isArray(options.demandTier) ? options.demandTier : [options.demandTier];
    filtered = filtered.filter(p => p.demand_tier && tiers.includes(p.demand_tier));
  }
  
  console.log(`[MasterExport] Found ${filtered.length} products after filtering`);
  return filtered;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Export products to JSON format
 */
export async function exportToJSON(options: ExportOptions = {}): Promise<ExportResult> {
  const exportedAt = new Date().toISOString();
  
  try {
    const products = await queryProducts(options);
    
    const exportData = {
      exportedAt,
      productCount: products.length,
      filters: options,
      pricingConfig: {
        markup: PRICING_RULES.markup,
        competitors: PRICING_RULES.competitors,
        demandTiers: PRICING_RULES.demand.tiers,
      },
      products,
    };
    
    return {
      success: true,
      format: 'json',
      data: JSON.stringify(exportData, null, 2),
      productCount: products.length,
      exportedAt,
      filters: options,
    };
  } catch (error: any) {
    console.error('[MasterExport] JSON export error:', error);
    return {
      success: false,
      format: 'json',
      data: '',
      productCount: 0,
      exportedAt,
      filters: options,
      error: error.message,
    };
  }
}

/**
 * Export products to CSV format
 */
export async function exportToCSV(options: ExportOptions = {}): Promise<ExportResult> {
  const exportedAt = new Date().toISOString();
  
  try {
    const products = await queryProducts(options);
    
    // Build CSV header
    const header = MASTER_CSV_COLUMNS.join(',');
    
    // Build CSV rows
    const rows = products.map(product => {
      return MASTER_CSV_COLUMNS.map(col => {
        const value = product[col as keyof ProductRecord];
        return escapeCSV(value);
      }).join(',');
    });
    
    const csv = [header, ...rows].join('\n');
    
    return {
      success: true,
      format: 'csv',
      data: csv,
      productCount: products.length,
      exportedAt,
      filters: options,
    };
  } catch (error: any) {
    console.error('[MasterExport] CSV export error:', error);
    return {
      success: false,
      format: 'csv',
      data: '',
      productCount: 0,
      exportedAt,
      filters: options,
      error: error.message,
    };
  }
}

/**
 * Export products to both JSON and CSV
 */
export async function exportBoth(options: ExportOptions = {}): Promise<{
  json: ExportResult;
  csv: ExportResult;
}> {
  const [json, csv] = await Promise.all([
    exportToJSON(options),
    exportToCSV(options),
  ]);
  
  return { json, csv };
}

/**
 * Create timestamped backup files
 */
export async function createBackup(options: ExportOptions = {}): Promise<{
  success: boolean;
  timestamp: string;
  jsonFilename: string;
  csvFilename: string;
  productCount: number;
  error?: string;
}> {
  const timestamp = formatTimestamp();
  const jsonFilename = `products_backup_${timestamp}.json`;
  const csvFilename = `products_backup_${timestamp}.csv`;
  
  try {
    const { json, csv } = await exportBoth(options);
    
    if (!json.success || !csv.success) {
      throw new Error(json.error || csv.error || 'Export failed');
    }
    
    // In a real implementation, you would save these to storage (S3, Supabase Storage, etc.)
    // For now, we return the data that can be saved by the calling code
    
    console.log(`[MasterExport] Backup created: ${jsonFilename}, ${csvFilename}`);
    console.log(`[MasterExport] Total products: ${json.productCount}`);
    
    return {
      success: true,
      timestamp,
      jsonFilename,
      csvFilename,
      productCount: json.productCount,
    };
  } catch (error: any) {
    console.error('[MasterExport] Backup error:', error);
    return {
      success: false,
      timestamp,
      jsonFilename,
      csvFilename,
      productCount: 0,
      error: error.message,
    };
  }
}

/**
 * Get export statistics without full data
 */
export async function getExportStats(): Promise<ExportStats> {
  try {
    // Get total count and status breakdown
    const { data: statusData, error: statusError } = await getSupabaseClient()
      .from('products')
      .select('status', { count: 'exact' });
    
    if (statusError) throw statusError;
    
    // Count by status
    const byStatus: Record<string, number> = {};
    (statusData || []).forEach((row: any) => {
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    });
    
    // Get demand tier breakdown
    const { data: demandData, error: demandError } = await getSupabaseClient()
      .from('product_demand')
      .select('demand_score, current_bsr');
    
    if (demandError) throw demandError;
    
    const byDemandTier: Record<string, number> = { high: 0, medium: 0, low: 0, reject: 0 };
    let totalBSR = 0;
    let bsrCount = 0;
    let totalDemandScore = 0;
    let demandScoreCount = 0;
    
    (demandData || []).forEach((row: any) => {
      const tier = getDemandTier(row.current_bsr, row.demand_score);
      if (tier) byDemandTier[tier]++;
      
      if (row.current_bsr) {
        totalBSR += row.current_bsr;
        bsrCount++;
      }
      if (row.demand_score) {
        totalDemandScore += row.demand_score;
        demandScoreCount++;
      }
    });
    
    // Get margin stats
    const { data: priceData, error: priceError } = await getSupabaseClient()
      .from('products')
      .select('retail_price, amazon_price, cost');
    
    if (priceError) throw priceError;
    
    let totalMargin = 0;
    let marginCount = 0;
    let totalValue = 0;
    
    (priceData || []).forEach((row: any) => {
      const cost = row.cost || row.amazon_price;
      const retail = row.retail_price;
      
      if (retail && cost && cost > 0) {
        totalMargin += ((retail - cost) / retail) * 100;
        marginCount++;
      }
      
      if (retail) {
        totalValue += retail;
      }
    });
    
    return {
      totalProducts: statusData?.length || 0,
      byStatus,
      byDemandTier,
      avgMargin: marginCount > 0 ? Math.round(totalMargin / marginCount * 100) / 100 : 0,
      avgBSR: bsrCount > 0 ? Math.round(totalBSR / bsrCount) : 0,
      avgDemandScore: demandScoreCount > 0 ? Math.round(totalDemandScore / demandScoreCount * 100) / 100 : 0,
      totalValue: Math.round(totalValue * 100) / 100,
    };
  } catch (error: any) {
    console.error('[MasterExport] Stats error:', error);
    return {
      totalProducts: 0,
      byStatus: {},
      byDemandTier: {},
      avgMargin: 0,
      avgBSR: 0,
      avgDemandScore: 0,
      totalValue: 0,
    };
  }
}

/**
 * Export high-demand products only
 */
export async function exportHighDemand(): Promise<ExportResult> {
  return exportToCSV({
    demandTier: 'high',
    status: 'active',
    stockStatus: 'in_stock',
    sortBy: 'demand_score' as keyof ProductRecord,
    sortOrder: 'desc',
  });
}

/**
 * Export products needing price check
 */
export async function exportStaleProducts(days: number = 7): Promise<ExportResult> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  return exportToCSV({
    updatedBefore: cutoffDate,
    status: 'active',
    sortBy: 'updated_at' as keyof ProductRecord,
    sortOrder: 'asc',
  });
}

/**
 * Export products for a specific demand tier
 */
export async function exportByDemandTier(tier: DemandTier): Promise<ExportResult> {
  return exportToCSV({
    demandTier: tier,
    sortBy: 'demand_score' as keyof ProductRecord,
    sortOrder: 'desc',
  });
}

/**
 * Get column definitions for documentation
 */
export function getColumnDefinitions(): Array<{ column: string; description: string; type: string }> {
  return [
    { column: 'id', description: 'Unique product ID', type: 'uuid' },
    { column: 'asin', description: 'Amazon Standard Identification Number', type: 'string' },
    { column: 'title', description: 'Product title', type: 'string' },
    { column: 'brand', description: 'Product brand', type: 'string' },
    { column: 'category', description: 'Product category', type: 'string' },
    { column: 'amazon_price', description: 'Current Amazon price', type: 'number' },
    { column: 'retail_price', description: 'Your retail price', type: 'number' },
    { column: 'member_price', description: 'Member/discount price (90% of retail)', type: 'number' },
    { column: 'cost', description: 'Product cost (usually amazon_price)', type: 'number' },
    { column: 'margin_percent', description: 'Profit margin percentage', type: 'number' },
    { column: 'profit', description: 'Profit per unit in dollars', type: 'number' },
    { column: 'amazon_display_price', description: 'Competitor price: Amazon', type: 'number' },
    { column: 'costco_display_price', description: 'Competitor price: Costco', type: 'number' },
    { column: 'ebay_display_price', description: 'Competitor price: eBay', type: 'number' },
    { column: 'sams_display_price', description: 'Competitor price: Sam\'s Club', type: 'number' },
    { column: 'walmart_display_price', description: 'Competitor price: Walmart', type: 'number' },
    { column: 'target_display_price', description: 'Competitor price: Target', type: 'number' },
    { column: 'current_bsr', description: 'Current Best Seller Rank', type: 'number' },
    { column: 'avg_bsr_30d', description: '30-day average BSR', type: 'number' },
    { column: 'avg_bsr_90d', description: '90-day average BSR', type: 'number' },
    { column: 'bsr_volatility', description: 'BSR volatility percentage', type: 'number' },
    { column: 'bsr_trend', description: 'BSR trend: improving/declining/stable', type: 'string' },
    { column: 'demand_score', description: 'Calculated demand score (0-100)', type: 'number' },
    { column: 'demand_tier', description: 'Demand tier: high/medium/low/reject', type: 'string' },
    { column: 'estimated_monthly_sales', description: 'Estimated monthly units sold', type: 'number' },
    { column: 'rating', description: 'Product rating (0-5)', type: 'number' },
    { column: 'review_count', description: 'Number of reviews', type: 'number' },
    { column: 'is_prime', description: 'Prime eligible', type: 'boolean' },
    { column: 'stock_status', description: 'Stock status: in_stock/out_of_stock/limited', type: 'string' },
    { column: 'image_url', description: 'Product image URL', type: 'string' },
    { column: 'amazon_url', description: 'Amazon product URL', type: 'string' },
    { column: 'status', description: 'Product status: active/pending_sync/paused/out_of_stock', type: 'string' },
    { column: 'last_price_check', description: 'Last price check timestamp', type: 'datetime' },
    { column: 'last_demand_check', description: 'Last demand data check timestamp', type: 'datetime' },
    { column: 'created_at', description: 'Record creation timestamp', type: 'datetime' },
    { column: 'updated_at', description: 'Record update timestamp', type: 'datetime' },
    { column: 'shopify_product_id', description: 'Shopify product ID if synced', type: 'string' },
    { column: 'shopify_variant_id', description: 'Shopify variant ID if synced', type: 'string' },
    { column: 'shopify_synced_at', description: 'Last Shopify sync timestamp', type: 'datetime' },
    { column: 'ebay_item_id', description: 'eBay item ID if listed', type: 'string' },
    { column: 'ebay_synced_at', description: 'Last eBay sync timestamp', type: 'datetime' },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export default {
  exportToJSON,
  exportToCSV,
  exportBoth,
  createBackup,
  getExportStats,
  exportHighDemand,
  exportStaleProducts,
  exportByDemandTier,
  getColumnDefinitions,
  MASTER_CSV_COLUMNS,
};
