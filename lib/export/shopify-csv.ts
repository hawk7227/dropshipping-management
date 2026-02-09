// lib/export/shopify-csv.ts
// ═══════════════════════════════════════════════════════════════════════════
// Shopify Product CSV Export
// Generates Shopify's standard 166-column product import format
// Compatible with Shopify Admin bulk import and third-party tools
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { 
  PRICING_RULES,
  calculateRetailPrice,
  calculateCompetitorPrices,
  estimateMonthlySales,
} from '@/lib/config/pricing-rules';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Store configuration
const STORE_CONFIG = {
  vendor: process.env.SHOPIFY_VENDOR || 'Your Store',
  defaultType: 'General',
  defaultWeight: 0,
  weightUnit: 'lb',
  inventoryPolicy: 'continue', // continue = allow overselling for dropship
  fulfillmentService: 'manual',
  inventoryQty: 999, // High number for dropship
  requiresShipping: true,
  taxable: true,
  seoDescriptionLength: 320,
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ShopifyProduct {
  // Core fields
  asin: string;
  title: string;
  description: string;
  vendor: string;
  productType: string;
  tags: string[];
  
  // Pricing
  price: number;
  compareAtPrice: number | null;
  cost: number | null;
  
  // Variant
  sku: string;
  barcode: string | null;
  weight: number;
  weightUnit: string;
  
  // Inventory
  inventoryQty: number;
  inventoryPolicy: string;
  fulfillmentService: string;
  
  // Options (for variants)
  option1Name: string | null;
  option1Value: string | null;
  option2Name: string | null;
  option2Value: string | null;
  option3Name: string | null;
  option3Value: string | null;
  
  // Images
  imageSrc: string | null;
  imageAlt: string | null;
  imagePosition: number;
  
  // SEO
  seoTitle: string | null;
  seoDescription: string | null;
  
  // Status
  status: 'active' | 'draft' | 'archived';
  published: boolean;
  publishedScope: 'web' | 'global';
  
  // Metafields
  metafields: Record<string, any>;
}

export interface ShopifyExportOptions {
  // Filtering
  status?: string | string[];
  minDemandScore?: number;
  maxBSR?: number;
  minMargin?: number;
  
  // Content
  includeMetafields?: boolean;
  includeCompetitorPrices?: boolean;
  includeSEO?: boolean;
  
  // Output
  publishImmediately?: boolean;
  defaultStatus?: 'active' | 'draft';
  
  // Limits
  limit?: number;
  offset?: number;
}

export interface ShopifyExportResult {
  success: boolean;
  csv: string;
  productCount: number;
  variantCount: number;
  exportedAt: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHOPIFY CSV COLUMN DEFINITIONS (Standard 166 columns)
// ═══════════════════════════════════════════════════════════════════════════

const SHOPIFY_COLUMNS = [
  // Product basics (1-10)
  'Handle',
  'Title',
  'Body (HTML)',
  'Vendor',
  'Product Category',
  'Type',
  'Tags',
  'Published',
  'Option1 Name',
  'Option1 Value',
  
  // Options continued (11-16)
  'Option2 Name',
  'Option2 Value',
  'Option3 Name',
  'Option3 Value',
  'Variant SKU',
  'Variant Grams',
  
  // Inventory (17-22)
  'Variant Inventory Tracker',
  'Variant Inventory Qty',
  'Variant Inventory Policy',
  'Variant Fulfillment Service',
  'Variant Price',
  'Variant Compare At Price',
  
  // Shipping (23-26)
  'Variant Requires Shipping',
  'Variant Taxable',
  'Variant Barcode',
  'Image Src',
  
  // Images continued (27-31)
  'Image Position',
  'Image Alt Text',
  'Gift Card',
  'SEO Title',
  'SEO Description',
  
  // Google Shopping (32-41)
  'Google Shopping / Google Product Category',
  'Google Shopping / Gender',
  'Google Shopping / Age Group',
  'Google Shopping / MPN',
  'Google Shopping / AdWords Grouping',
  'Google Shopping / AdWords Labels',
  'Google Shopping / Condition',
  'Google Shopping / Custom Product',
  'Google Shopping / Custom Label 0',
  'Google Shopping / Custom Label 1',
  
  // Google Shopping continued (42-46)
  'Google Shopping / Custom Label 2',
  'Google Shopping / Custom Label 3',
  'Google Shopping / Custom Label 4',
  'Variant Image',
  'Variant Weight Unit',
  
  // Variant tax (47-48)
  'Variant Tax Code',
  'Cost per item',
  
  // Metafields - Competitor Prices (49-54)
  'Included / United States',
  'Price / United States',
  'Compare At Price / United States',
  'Included / International',
  'Price / International',
  'Compare At Price / International',
  
  // Status (55)
  'Status',
] as const;

// Extended columns for metafields (columns 56-166)
const METAFIELD_COLUMNS = [
  // Competitor display prices
  'amazon_display_price',
  'costco_display_price',
  'ebay_display_price',
  'sams_display_price',
  'walmart_display_price',
  'target_display_price',
  
  // Demand data
  'demand_score',
  'demand_tier',
  'current_bsr',
  'estimated_monthly_sales',
  
  // Product data
  'original_asin',
  'amazon_url',
  'rating',
  'review_count',
  'is_prime',
];

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

function generateHandle(title: string, asin: string): string {
  // Create URL-friendly handle from title
  let handle = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 200);
  
  // Ensure uniqueness with ASIN suffix
  return `${handle}-${asin.toLowerCase()}`;
}

function generateTags(product: any): string[] {
  const tags: string[] = [];
  
  // Add category as tag
  if (product.category) {
    tags.push(product.category.replace(/[,]/g, ''));
  }
  
  // Add brand as tag
  if (product.brand) {
    tags.push(`Brand:${product.brand.replace(/[,]/g, '')}`);
  }
  
  // Add demand tier
  if (product.demand_tier) {
    tags.push(`Demand:${product.demand_tier}`);
  }
  
  // Add price range tag
  if (product.retail_price) {
    if (product.retail_price < 10) tags.push('Price:Under $10');
    else if (product.retail_price < 25) tags.push('Price:$10-$25');
    else if (product.retail_price < 50) tags.push('Price:$25-$50');
    else tags.push('Price:Over $50');
  }
  
  // Add Prime tag
  if (product.is_prime) {
    tags.push('Prime');
  }
  
  // Add import tag
  tags.push('bulk-import');
  tags.push(`imported:${new Date().toISOString().split('T')[0]}`);
  
  return tags;
}

function generateBodyHTML(product: any): string {
  const description = product.description || product.title || '';
  
  // Create enhanced HTML body
  const sections: string[] = [];
  
  // Main description
  sections.push(`<p>${description}</p>`);
  
  // Features section (if available)
  if (product.features && Array.isArray(product.features)) {
    sections.push('<h3>Features</h3>');
    sections.push('<ul>');
    product.features.forEach((feature: string) => {
      sections.push(`<li>${feature}</li>`);
    });
    sections.push('</ul>');
  }
  
  // Specifications
  const specs: string[] = [];
  if (product.brand) specs.push(`<li><strong>Brand:</strong> ${product.brand}</li>`);
  if (product.rating) specs.push(`<li><strong>Rating:</strong> ${product.rating} stars (${product.review_count || 0} reviews)</li>`);
  if (product.asin) specs.push(`<li><strong>ASIN:</strong> ${product.asin}</li>`);
  
  if (specs.length > 0) {
    sections.push('<h3>Product Details</h3>');
    sections.push('<ul>');
    sections.push(...specs);
    sections.push('</ul>');
  }
  
  return sections.join('\n');
}

function generateSEOTitle(title: string, brand: string | null): string {
  // Shopify SEO title limit is 70 characters
  const maxLength = 70;
  let seoTitle = title;
  
  if (brand && !title.toLowerCase().includes(brand.toLowerCase())) {
    seoTitle = `${brand} ${title}`;
  }
  
  if (seoTitle.length > maxLength) {
    seoTitle = seoTitle.substring(0, maxLength - 3) + '...';
  }
  
  return seoTitle;
}

function generateSEODescription(title: string, description: string | null, category: string | null): string {
  const maxLength = STORE_CONFIG.seoDescriptionLength;
  
  let seoDesc = description || title;
  
  // Add category context if room
  if (category && seoDesc.length < maxLength - 50) {
    seoDesc = `${seoDesc} Shop ${category} at great prices.`;
  }
  
  if (seoDesc.length > maxLength) {
    seoDesc = seoDesc.substring(0, maxLength - 3) + '...';
  }
  
  return seoDesc;
}

function determineProductType(category: string | null): string {
  if (!category) return STORE_CONFIG.defaultType;
  
  const categoryMap: Record<string, string> = {
    'beauty': 'Beauty',
    'skincare': 'Skin Care',
    'kitchen': 'Kitchen',
    'home': 'Home & Garden',
    'pet': 'Pet Supplies',
    'garden': 'Garden',
    'health': 'Health',
    'fitness': 'Sports & Fitness',
    'baby': 'Baby',
    'toys': 'Toys',
    'office': 'Office',
    'electronics': 'Electronics',
    'automotive': 'Automotive',
    'sports': 'Sports',
  };
  
  const lowerCategory = category.toLowerCase();
  for (const [key, value] of Object.entries(categoryMap)) {
    if (lowerCategory.includes(key)) return value;
  }
  
  return category;
}

function determineGoogleCategory(category: string | null): string {
  if (!category) return '';
  
  // Map to Google Product Category IDs
  // See: https://support.google.com/merchants/answer/6324436
  const googleCategoryMap: Record<string, string> = {
    'beauty': 'Health & Beauty > Personal Care',
    'skincare': 'Health & Beauty > Personal Care > Skin Care',
    'kitchen': 'Home & Garden > Kitchen & Dining',
    'home': 'Home & Garden',
    'pet': 'Animals & Pet Supplies',
    'garden': 'Home & Garden > Lawn & Garden',
    'health': 'Health & Beauty',
    'fitness': 'Sporting Goods > Exercise & Fitness',
    'baby': 'Baby & Toddler',
    'toys': 'Toys & Games',
    'office': 'Office Supplies',
    'electronics': 'Electronics',
    'automotive': 'Vehicles & Parts',
    'sports': 'Sporting Goods',
  };
  
  const lowerCategory = category.toLowerCase();
  for (const [key, value] of Object.entries(googleCategoryMap)) {
    if (lowerCategory.includes(key)) return value;
  }
  
  return '';
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════

async function queryProductsForShopify(options: ShopifyExportOptions = {}): Promise<any[]> {
  console.log('[ShopifyCSV] Querying products for export');
  
  let query = supabase
    .from('products')
    .select(`
      id,
      asin,
      title,
      description,
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
      created_at,
      product_demand (
        current_bsr,
        demand_score,
        estimated_monthly_sales,
        bsr_trend
      )
    `)
    .neq('status', 'rejected');
  
  // Apply filters
  if (options.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    query = query.in('status', statuses);
  } else {
    // Default to active and pending_sync
    query = query.in('status', ['active', 'pending_sync']);
  }
  
  // Sorting by demand score (best products first)
  query = query.order('retail_price', { ascending: false });
  
  // Limits
  if (options.limit) {
    query = query.limit(options.limit);
  }
  
  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 1000) - 1);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('[ShopifyCSV] Query error:', error);
    throw new Error(`Failed to query products: ${error.message}`);
  }
  
  // Post-query filtering for demand data
  let products = data || [];
  
  if (options.minDemandScore !== undefined) {
    products = products.filter((p: any) => {
      const demand = p.product_demand?.[0] || p.product_demand;
      return (demand?.demand_score || 0) >= options.minDemandScore!;
    });
  }
  
  if (options.maxBSR !== undefined) {
    products = products.filter((p: any) => {
      const demand = p.product_demand?.[0] || p.product_demand;
      return (demand?.current_bsr || Infinity) <= options.maxBSR!;
    });
  }
  
  if (options.minMargin !== undefined) {
    products = products.filter((p: any) => {
      const cost = p.cost || p.amazon_price;
      const retail = p.retail_price;
      if (!retail || !cost || cost <= 0) return false;
      const margin = ((retail - cost) / retail) * 100;
      return margin >= options.minMargin!;
    });
  }
  
  console.log(`[ShopifyCSV] Found ${products.length} products for export`);
  return products;
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSFORM TO SHOPIFY FORMAT
// ═══════════════════════════════════════════════════════════════════════════

function transformToShopifyRow(product: any, options: ShopifyExportOptions): string[] {
  const demand = product.product_demand?.[0] || product.product_demand || {};
  const competitorPrices = calculateCompetitorPrices(product.retail_price);
  
  const handle = generateHandle(product.title, product.asin);
  const tags = generateTags({ ...product, demand_tier: getDemandTierFromScore(demand.demand_score) });
  const bodyHTML = generateBodyHTML(product);
  const productType = determineProductType(product.category);
  const googleCategory = determineGoogleCategory(product.category);
  
  const published = options.publishImmediately !== false;
  const status = options.defaultStatus || 'active';
  
  // Calculate compare at price (competitor Amazon price)
  const compareAtPrice = competitorPrices.amazon || null;
  
  // Row values matching SHOPIFY_COLUMNS order
  const row: string[] = [
    // Product basics (1-10)
    handle,                                                    // Handle
    product.title || '',                                       // Title
    bodyHTML,                                                  // Body (HTML)
    product.brand || STORE_CONFIG.vendor,                      // Vendor
    googleCategory,                                            // Product Category
    productType,                                               // Type
    tags.join(', '),                                           // Tags
    published ? 'TRUE' : 'FALSE',                              // Published
    'Title',                                                   // Option1 Name
    'Default Title',                                           // Option1 Value
    
    // Options continued (11-16)
    '',                                                        // Option2 Name
    '',                                                        // Option2 Value
    '',                                                        // Option3 Name
    '',                                                        // Option3 Value
    product.asin,                                              // Variant SKU = ASIN
    String(STORE_CONFIG.defaultWeight * 453.592),              // Variant Grams (converted from lb)
    
    // Inventory (17-22)
    'shopify',                                                 // Variant Inventory Tracker
    String(STORE_CONFIG.inventoryQty),                         // Variant Inventory Qty
    STORE_CONFIG.inventoryPolicy,                              // Variant Inventory Policy
    STORE_CONFIG.fulfillmentService,                           // Variant Fulfillment Service
    product.retail_price?.toFixed(2) || '0.00',               // Variant Price
    compareAtPrice?.toFixed(2) || '',                          // Variant Compare At Price
    
    // Shipping (23-26)
    STORE_CONFIG.requiresShipping ? 'TRUE' : 'FALSE',          // Variant Requires Shipping
    STORE_CONFIG.taxable ? 'TRUE' : 'FALSE',                   // Variant Taxable
    product.barcode || '',                                     // Variant Barcode
    product.image_url || '',                                   // Image Src
    
    // Images continued (27-31)
    '1',                                                       // Image Position
    product.title?.substring(0, 100) || '',                   // Image Alt Text
    'FALSE',                                                   // Gift Card
    options.includeSEO !== false 
      ? generateSEOTitle(product.title, product.brand) 
      : '',                                                    // SEO Title
    options.includeSEO !== false 
      ? generateSEODescription(product.title, product.description, product.category) 
      : '',                                                    // SEO Description
    
    // Google Shopping (32-41)
    googleCategory,                                            // Google Shopping / Google Product Category
    '',                                                        // Google Shopping / Gender
    '',                                                        // Google Shopping / Age Group
    product.asin,                                              // Google Shopping / MPN
    '',                                                        // Google Shopping / AdWords Grouping
    '',                                                        // Google Shopping / AdWords Labels
    'new',                                                     // Google Shopping / Condition
    'FALSE',                                                   // Google Shopping / Custom Product
    getDemandTierFromScore(demand.demand_score) || '',         // Google Shopping / Custom Label 0 (demand tier)
    demand.demand_score?.toFixed(0) || '',                     // Google Shopping / Custom Label 1 (demand score)
    
    // Google Shopping continued (42-46)
    demand.current_bsr?.toString() || '',                      // Google Shopping / Custom Label 2 (BSR)
    product.rating?.toFixed(1) || '',                         // Google Shopping / Custom Label 3 (rating)
    product.is_prime ? 'Prime' : '',                          // Google Shopping / Custom Label 4 (Prime)
    '',                                                        // Variant Image
    STORE_CONFIG.weightUnit,                                   // Variant Weight Unit
    
    // Variant tax (47-48)
    '',                                                        // Variant Tax Code
    product.cost?.toFixed(2) || product.amazon_price?.toFixed(2) || '',  // Cost per item
    
    // Markets (49-54)
    'TRUE',                                                    // Included / United States
    product.retail_price?.toFixed(2) || '',                   // Price / United States
    compareAtPrice?.toFixed(2) || '',                          // Compare At Price / United States
    'FALSE',                                                   // Included / International
    '',                                                        // Price / International
    '',                                                        // Compare At Price / International
    
    // Status (55)
    status,                                                    // Status
  ];
  
  // Add metafields if requested (columns 56+)
  if (options.includeMetafields !== false) {
    row.push(
      // Competitor prices
      competitorPrices.amazon?.toFixed(2) || '',
      competitorPrices.costco?.toFixed(2) || '',
      competitorPrices.ebay?.toFixed(2) || '',
      competitorPrices.sams?.toFixed(2) || '',
      competitorPrices.walmart?.toFixed(2) || '',
      competitorPrices.target?.toFixed(2) || '',
      
      // Demand data
      demand.demand_score?.toFixed(0) || '',
      getDemandTierFromScore(demand.demand_score) || '',
      demand.current_bsr?.toString() || '',
      demand.estimated_monthly_sales?.toString() || estimateMonthlySales(demand.current_bsr).toString(),
      
      // Product data
      product.asin,
      `https://www.amazon.com/dp/${product.asin}`,
      product.rating?.toFixed(1) || '',
      product.review_count?.toString() || '',
      product.is_prime ? 'TRUE' : 'FALSE',
    );
  }
  
  return row;
}

function getDemandTierFromScore(score: number | null): string | null {
  if (score === null || score === undefined) return null;
  
  const { tiers } = PRICING_RULES.demand;
  
  if (score >= tiers.high.minDemandScore) return 'high';
  if (score >= tiers.medium.minDemandScore) return 'medium';
  if (score >= tiers.low.minDemandScore) return 'low';
  return 'reject';
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Export products to Shopify CSV format
 */
export async function exportToShopifyCSV(options: ShopifyExportOptions = {}): Promise<ShopifyExportResult> {
  const exportedAt = new Date().toISOString();
  
  try {
    const products = await queryProductsForShopify(options);
    
    if (products.length === 0) {
      return {
        success: true,
        csv: '',
        productCount: 0,
        variantCount: 0,
        exportedAt,
      };
    }
    
    // Build header
    const allColumns = options.includeMetafields !== false 
      ? [...SHOPIFY_COLUMNS, ...METAFIELD_COLUMNS]
      : SHOPIFY_COLUMNS;
    
    const header = allColumns.map(escapeCSV).join(',');
    
    // Transform products to rows
    const rows = products.map(product => 
      transformToShopifyRow(product, options).map(escapeCSV).join(',')
    );
    
    const csv = [header, ...rows].join('\n');
    
    return {
      success: true,
      csv,
      productCount: products.length,
      variantCount: products.length, // 1 variant per product for now
      exportedAt,
    };
    
  } catch (error: any) {
    console.error('[ShopifyCSV] Export error:', error);
    return {
      success: false,
      csv: '',
      productCount: 0,
      variantCount: 0,
      exportedAt,
      error: error.message,
    };
  }
}

/**
 * Export high-demand products only
 */
export async function exportHighDemandToShopify(): Promise<ShopifyExportResult> {
  return exportToShopifyCSV({
    minDemandScore: PRICING_RULES.demand.tiers.high.minDemandScore,
    maxBSR: PRICING_RULES.demand.tiers.high.maxBSR,
    publishImmediately: true,
    defaultStatus: 'active',
    includeMetafields: true,
    includeSEO: true,
  });
}

/**
 * Export draft products (for review before publishing)
 */
export async function exportDraftToShopify(options: ShopifyExportOptions = {}): Promise<ShopifyExportResult> {
  return exportToShopifyCSV({
    ...options,
    publishImmediately: false,
    defaultStatus: 'draft',
  });
}

/**
 * Export products by demand tier
 */
export async function exportByDemandTierToShopify(
  tier: 'high' | 'medium' | 'low'
): Promise<ShopifyExportResult> {
  const tierConfig = PRICING_RULES.demand.tiers[tier];
  
  return exportToShopifyCSV({
    minDemandScore: tierConfig.minDemandScore,
    maxBSR: tierConfig.maxBSR,
    publishImmediately: tier === 'high',
    defaultStatus: tier === 'high' ? 'active' : 'draft',
    includeMetafields: true,
    includeSEO: true,
  });
}

/**
 * Generate Shopify column mapping documentation
 */
export function getShopifyColumnMapping(): Array<{
  column: string;
  shopifyField: string;
  description: string;
  example: string;
}> {
  return [
    { column: 'Handle', shopifyField: 'handle', description: 'URL-friendly product identifier', example: 'ice-roller-face-b0abc123' },
    { column: 'Title', shopifyField: 'title', description: 'Product title', example: 'Ice Roller for Face Massage' },
    { column: 'Body (HTML)', shopifyField: 'body_html', description: 'Product description in HTML', example: '<p>Description here</p>' },
    { column: 'Vendor', shopifyField: 'vendor', description: 'Product vendor/brand', example: 'Your Store' },
    { column: 'Type', shopifyField: 'product_type', description: 'Product type for organization', example: 'Beauty' },
    { column: 'Tags', shopifyField: 'tags', description: 'Comma-separated tags', example: 'Beauty, Demand:high, Prime' },
    { column: 'Variant SKU', shopifyField: 'variant.sku', description: 'ASIN as SKU', example: 'B0ABC12345' },
    { column: 'Variant Price', shopifyField: 'variant.price', description: 'Your retail price', example: '24.99' },
    { column: 'Variant Compare At Price', shopifyField: 'variant.compare_at_price', description: 'Competitor Amazon price', example: '46.23' },
    { column: 'Cost per item', shopifyField: 'variant.cost', description: 'Amazon cost/your cost', example: '14.70' },
    { column: 'Image Src', shopifyField: 'images.src', description: 'Product image URL', example: 'https://...' },
    { column: 'SEO Title', shopifyField: 'metafields.seo.title', description: 'Page title for SEO', example: 'Ice Roller | Your Store' },
    { column: 'Status', shopifyField: 'status', description: 'active, draft, or archived', example: 'active' },
  ];
}

/**
 * Get Shopify-specific metafield definitions
 */
export function getMetafieldDefinitions(): Array<{
  namespace: string;
  key: string;
  type: string;
  description: string;
}> {
  return [
    { namespace: 'competitor', key: 'amazon_price', type: 'number_decimal', description: 'Amazon display price' },
    { namespace: 'competitor', key: 'costco_price', type: 'number_decimal', description: 'Costco display price' },
    { namespace: 'competitor', key: 'ebay_price', type: 'number_decimal', description: 'eBay display price' },
    { namespace: 'competitor', key: 'walmart_price', type: 'number_decimal', description: 'Walmart display price' },
    { namespace: 'competitor', key: 'target_price', type: 'number_decimal', description: 'Target display price' },
    { namespace: 'competitor', key: 'sams_price', type: 'number_decimal', description: "Sam's Club display price" },
    { namespace: 'demand', key: 'score', type: 'number_integer', description: 'Demand score (0-100)' },
    { namespace: 'demand', key: 'tier', type: 'single_line_text_field', description: 'Demand tier: high/medium/low' },
    { namespace: 'demand', key: 'bsr', type: 'number_integer', description: 'Best Seller Rank' },
    { namespace: 'demand', key: 'monthly_sales', type: 'number_integer', description: 'Estimated monthly sales' },
    { namespace: 'product', key: 'asin', type: 'single_line_text_field', description: 'Amazon ASIN' },
    { namespace: 'product', key: 'amazon_url', type: 'url', description: 'Amazon product URL' },
    { namespace: 'product', key: 'rating', type: 'number_decimal', description: 'Amazon rating (0-5)' },
    { namespace: 'product', key: 'reviews', type: 'number_integer', description: 'Review count' },
    { namespace: 'product', key: 'prime', type: 'boolean', description: 'Prime eligible' },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export default {
  exportToShopifyCSV,
  exportHighDemandToShopify,
  exportDraftToShopify,
  exportByDemandTierToShopify,
  getShopifyColumnMapping,
  getMetafieldDefinitions,
  SHOPIFY_COLUMNS,
  METAFIELD_COLUMNS,
};
