// lib/bulk-verification.ts
// Core bulk verification logic - column detection, Keepa integration, pricing rules
// Used by BulkVerifyPanel and bulk-verify API route

import { PRICING_RULES, meetsDiscoveryCriteria, containsExcludedBrand } from '@/lib/config/pricing-rules';
import { getProductsHistory, hasKeepaConfig as keepaHasConfig, type KeepaServiceResult } from '@/lib/services/keepa';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ColumnMapping {
  asin: string | null;
  title: string | null;
  price: string | null;
  vendor: string | null;
  category: string | null;
  sku: string | null;
  barcode: string | null;
}

export interface ParsedProduct {
  rowIndex: number;
  asin: string;
  title: string | null;
  price: number | null;
  vendor: string | null;
  category: string | null;
  sku: string | null;
  barcode: string | null;
  rawData: Record<string, any>;
}

export type VerificationStatus = 'pass' | 'warning' | 'fail' | 'pending' | 'skipped';

export interface VerificationResult {
  meetsPrice: boolean;
  meetsReviews: boolean;
  meetsRating: boolean;
  meetsPrime: boolean;
  meetsBSR: boolean;
  meetsBrand: boolean;
}

export interface VerifiedProduct extends ParsedProduct {
  status: VerificationStatus;
  verificationResult: VerificationResult;
  failReasons: string[];
  warningReasons: string[];
  // Keepa data
  amazonPrice: number | null;
  rating: number | null;
  reviewCount: number | null;
  isPrime: boolean;
  salesRank: number | null;
  avgPrice30d: number | null;
  avgPrice90d: number | null;
  priceStability: 'stable' | 'volatile' | 'unknown';
  // Calculated
  yourRetailPrice: number | null;
  profitMargin: number | null;
  isExisting: boolean;
}

export interface VerificationJob {
  id: string;
  fileName: string;
  totalProducts: number;
  processedProducts: number;
  passCount: number;
  warningCount: number;
  failCount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface VerificationSummary {
  total: number;
  passed: number;
  warnings: number;
  failed: number;
  skipped: number;
  existing: number;
  passRate: number;
  estimatedTokens: number;
  estimatedTime: string;
}

export interface CostEstimate {
  keepaTokens: number;
  rainforestCost: number;
  totalCost: number;
  processingTime: string;
  strategy: string;
  savings: number;
  savingsPercent: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// COLUMN DETECTION
// ═══════════════════════════════════════════════════════════════════════════

const COLUMN_PATTERNS: Record<keyof ColumnMapping, RegExp[]> = {
  asin: [
    /^asin$/i,
    /^amazon.*asin$/i,
    /^product.*id$/i,
    /^variant.*sku$/i,
    /^sku$/i,
    /^source.*product.*id$/i,
  ],
  title: [
    /^title$/i,
    /^product.*title$/i,
    /^name$/i,
    /^product.*name$/i,
    /^item.*name$/i,
  ],
  price: [
    /^price$/i,
    /^cost$/i,
    /^cost.*price$/i,
    /^amazon.*price$/i,
    /^variant.*price$/i,
    /^unit.*price$/i,
  ],
  vendor: [
    /^vendor$/i,
    /^brand$/i,
    /^manufacturer$/i,
    /^supplier$/i,
  ],
  category: [
    /^category$/i,
    /^product.*type$/i,
    /^type$/i,
    /^department$/i,
  ],
  sku: [
    /^sku$/i,
    /^variant.*sku$/i,
    /^product.*sku$/i,
    /^item.*sku$/i,
  ],
  barcode: [
    /^barcode$/i,
    /^upc$/i,
    /^ean$/i,
    /^gtin$/i,
    /^variant.*barcode$/i,
  ],
};

/**
 * Auto-detect column mappings from Excel/CSV headers
 */
export function autoDetectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    asin: null,
    title: null,
    price: null,
    vendor: null,
    category: null,
    sku: null,
    barcode: null,
  };

  for (const header of headers) {
    const normalizedHeader = header.trim();
    
    for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
      if (mapping[field as keyof ColumnMapping] === null) {
        for (const pattern of patterns) {
          if (pattern.test(normalizedHeader)) {
            mapping[field as keyof ColumnMapping] = header;
            break;
          }
        }
      }
    }
  }

  return mapping;
}

/**
 * Get suggested column mappings with confidence scores
 */
export function getSuggestedMappings(headers: string[]): Array<{
  field: keyof ColumnMapping;
  header: string;
  confidence: 'high' | 'medium' | 'low';
}> {
  const suggestions: Array<{
    field: keyof ColumnMapping;
    header: string;
    confidence: 'high' | 'medium' | 'low';
  }> = [];

  const detected = autoDetectColumns(headers);

  for (const [field, header] of Object.entries(detected)) {
    if (header) {
      // Check if it's a direct match (high confidence) or partial (medium)
      const patterns = COLUMN_PATTERNS[field as keyof ColumnMapping];
      const isExactMatch = patterns.some(p => p.test(header) && header.toLowerCase() === field);
      
      suggestions.push({
        field: field as keyof ColumnMapping,
        header,
        confidence: isExactMatch ? 'high' : 'medium',
      });
    }
  }

  return suggestions;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse products from raw data using column mapping
 */
export function parseProducts(
  rows: Record<string, any>[],
  mapping: ColumnMapping
): ParsedProduct[] {
  const products: ParsedProduct[] = [];
  const asinColumn = mapping.asin;

  if (!asinColumn) {
    console.error('[parseProducts] No ASIN column mapped');
    return products;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const asinValue = row[asinColumn];

    // Skip rows without ASIN
    if (!asinValue || typeof asinValue !== 'string') {
      continue;
    }

    // Validate ASIN format (B followed by 9 alphanumeric characters)
    const asin = asinValue.trim().toUpperCase();
    if (!/^B[A-Z0-9]{9}$/.test(asin)) {
      continue;
    }

    // Parse price
    let price: number | null = null;
    if (mapping.price && row[mapping.price]) {
      const priceStr = String(row[mapping.price]).replace(/[$,]/g, '');
      const parsed = parseFloat(priceStr);
      if (!isNaN(parsed)) {
        price = parsed;
      }
    }

    products.push({
      rowIndex: i + 1, // 1-indexed for user display
      asin,
      title: mapping.title ? String(row[mapping.title] || '') : null,
      price,
      vendor: mapping.vendor ? String(row[mapping.vendor] || '') : null,
      category: mapping.category ? String(row[mapping.category] || '') : null,
      sku: mapping.sku ? String(row[mapping.sku] || '') : null,
      barcode: mapping.barcode ? String(row[mapping.barcode] || '') : null,
      rawData: row,
    });
  }

  return products;
}

// ═══════════════════════════════════════════════════════════════════════════
// VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

const BSR_THRESHOLD = 100000; // Products with BSR > 100K are considered low demand

/**
 * Verify a single product against criteria
 */
function verifyProduct(
  product: ParsedProduct,
  keepaData: {
    amazonPrice: number | null;
    rating: number | null;
    reviewCount: number | null;
    isPrime: boolean;
    salesRank: number | null;
    avgPrice30d: number | null;
    avgPrice90d: number | null;
    priceStability: 'stable' | 'volatile' | 'unknown';
  } | null,
  existingAsins: Set<string>
): VerifiedProduct {
  const isExisting = existingAsins.has(product.asin);
  const failReasons: string[] = [];
  const warningReasons: string[] = [];

  // Use Keepa price if available, otherwise use file price
  const price = keepaData?.amazonPrice ?? product.price;
  const rating = keepaData?.rating ?? null;
  const reviewCount = keepaData?.reviewCount ?? null;
  const isPrime = keepaData?.isPrime ?? false;
  const salesRank = keepaData?.salesRank ?? null;

  // Check discovery criteria
  const { discovery } = PRICING_RULES;

  // Price check
  const meetsPrice = price !== null && 
    price >= discovery.minAmazonPrice && 
    price <= discovery.maxAmazonPrice;
  
  if (!meetsPrice) {
    if (price === null) {
      failReasons.push('No price available');
    } else if (price < discovery.minAmazonPrice) {
      failReasons.push(`Price $${price.toFixed(2)} below min $${discovery.minAmazonPrice}`);
    } else {
      failReasons.push(`Price $${price.toFixed(2)} above max $${discovery.maxAmazonPrice}`);
    }
  }

  // Reviews check
  const meetsReviews = reviewCount !== null && reviewCount >= discovery.minReviews;
  if (!meetsReviews) {
    if (reviewCount === null) {
      warningReasons.push('No review data');
    } else {
      failReasons.push(`${reviewCount} reviews below min ${discovery.minReviews}`);
    }
  }

  // Rating check
  const meetsRating = rating !== null && rating >= discovery.minRating;
  if (!meetsRating) {
    if (rating === null) {
      warningReasons.push('No rating data');
    } else {
      failReasons.push(`Rating ${rating.toFixed(1)} below min ${discovery.minRating}`);
    }
  }

  // Prime check
  const meetsPrime = !discovery.requirePrime || isPrime;
  if (!meetsPrime) {
    failReasons.push('Not Prime eligible');
  }

  // BSR check
  const meetsBSR = salesRank === null || salesRank <= BSR_THRESHOLD;
  if (!meetsBSR) {
    warningReasons.push(`BSR ${salesRank?.toLocaleString()} above ${BSR_THRESHOLD.toLocaleString()}`);
  }

  // Brand check
  const title = product.title || '';
  const meetsBrand = !containsExcludedBrand(title);
  if (!meetsBrand) {
    failReasons.push('Contains excluded brand');
  }

  // Existing check
  if (isExisting) {
    warningReasons.push('Already in catalog');
  }

  // Calculate retail price and margin
  let yourRetailPrice: number | null = null;
  let profitMargin: number | null = null;
  
  if (price !== null) {
    yourRetailPrice = price * PRICING_RULES.yourMarkup.multiplier;
    profitMargin = ((yourRetailPrice - price) / yourRetailPrice) * 100;
  }

  // Determine status
  let status: VerificationStatus = 'pass';
  if (failReasons.length > 0) {
    status = 'fail';
  } else if (warningReasons.length > 0) {
    status = 'warning';
  }

  return {
    ...product,
    status,
    verificationResult: {
      meetsPrice,
      meetsReviews,
      meetsRating,
      meetsPrime,
      meetsBSR,
      meetsBrand,
    },
    failReasons,
    warningReasons,
    amazonPrice: price,
    rating,
    reviewCount,
    isPrime,
    salesRank,
    avgPrice30d: keepaData?.avgPrice30d ?? null,
    avgPrice90d: keepaData?.avgPrice90d ?? null,
    priceStability: keepaData?.priceStability ?? 'unknown',
    yourRetailPrice,
    profitMargin,
    isExisting,
  };
}

/**
 * Verify products in batches using Keepa API
 */
export async function verifyProducts(
  products: ParsedProduct[],
  existingAsins: Set<string>,
  options: {
    useKeepa?: boolean;
    batchSize?: number;
    onProgress?: (processed: number, total: number) => void;
  } = {}
): Promise<VerifiedProduct[]> {
  const { useKeepa = true, batchSize = 100, onProgress } = options;
  const results: VerifiedProduct[] = [];

  // Check Keepa config
  const hasKeepa = useKeepa && keepaHasConfig();

  if (!hasKeepa) {
    // Verify without Keepa data
    for (const product of products) {
      results.push(verifyProduct(product, null, existingAsins));
    }
    return results;
  }

  // Process in batches with Keepa
  const asins = products.map(p => p.asin);
  const asinToProduct = new Map(products.map(p => [p.asin, p]));

  for (let i = 0; i < asins.length; i += batchSize) {
    const batch = asins.slice(i, i + batchSize);
    
    try {
      const response = await getProductsHistory(batch);
      
      if (response.success && response.data) {
        const keepaMap = new Map(
          response.data.products.map(k => [k.asin, k])
        );

        for (const asin of batch) {
          const product = asinToProduct.get(asin);
          if (!product) continue;

          const keepa = keepaMap.get(asin);
          const keepaData = keepa ? {
            amazonPrice: keepa.amazon_price,
            rating: keepa.rating,
            reviewCount: keepa.review_count,
            isPrime: keepa.is_prime,
            salesRank: keepa.salesRank,
            avgPrice30d: keepa.avgPrice30d ?? null,
            avgPrice90d: keepa.avgPrice90d ?? null,
            priceStability: 'unknown' as const,
          } : null;

          results.push(verifyProduct(product, keepaData, existingAsins));
        }
      } else {
        // Keepa failed, verify without data
        for (const asin of batch) {
          const product = asinToProduct.get(asin);
          if (product) {
            results.push(verifyProduct(product, null, existingAsins));
          }
        }
      }
    } catch (error) {
      console.error('[verifyProducts] Keepa batch error:', error);
      // Verify without data on error
      for (const asin of batch) {
        const product = asinToProduct.get(asin);
        if (product) {
          results.push(verifyProduct(product, null, existingAsins));
        }
      }
    }

    // Report progress
    if (onProgress) {
      onProgress(Math.min(i + batchSize, products.length), products.length);
    }

    // Rate limiting delay between batches
    if (i + batchSize < asins.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY & FILTERING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate verification summary
 */
export function generateSummary(results: VerifiedProduct[]): VerificationSummary {
  const passed = results.filter(r => r.status === 'pass').length;
  const warnings = results.filter(r => r.status === 'warning').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const existing = results.filter(r => r.isExisting).length;
  const total = results.length;

  // Estimate Keepa tokens (1 per product)
  const estimatedTokens = total;

  // Estimate time (100 products per minute with Keepa)
  const minutes = Math.ceil(total / 100);
  const estimatedTime = minutes < 60 
    ? `${minutes} minute${minutes !== 1 ? 's' : ''}`
    : `${Math.ceil(minutes / 60)} hour${Math.ceil(minutes / 60) !== 1 ? 's' : ''}`;

  return {
    total,
    passed,
    warnings,
    failed,
    skipped,
    existing,
    passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
    estimatedTokens,
    estimatedTime,
  };
}

/**
 * Filter results by status
 */
export function filterByStatus(
  results: VerifiedProduct[],
  status: VerificationStatus | 'all'
): VerifiedProduct[] {
  if (status === 'all') return results;
  return results.filter(r => r.status === status);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Export results to CSV format
 */
export function exportToCsv(results: VerifiedProduct[]): string {
  const headers = [
    'ASIN',
    'Title',
    'Status',
    'Amazon Price',
    'Your Retail',
    'Profit Margin',
    'Rating',
    'Reviews',
    'Prime',
    'BSR',
    'Fail Reasons',
    'Warnings',
  ];

  const rows = results.map(r => [
    r.asin,
    `"${(r.title || '').replace(/"/g, '""')}"`,
    r.status.toUpperCase(),
    r.amazonPrice?.toFixed(2) ?? '',
    r.yourRetailPrice?.toFixed(2) ?? '',
    r.profitMargin?.toFixed(1) ?? '',
    r.rating?.toFixed(1) ?? '',
    r.reviewCount?.toString() ?? '',
    r.isPrime ? 'Yes' : 'No',
    r.salesRank?.toString() ?? '',
    `"${r.failReasons.join('; ')}"`,
    `"${r.warningReasons.join('; ')}"`,
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * Export results to JSON format
 */
export function exportToJson(results: VerifiedProduct[]): string {
  return JSON.stringify(results, null, 2);
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE HELPERS (Supabase)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get existing ASINs from database
 */
export async function getExistingAsins(): Promise<Set<string>> {
  try {
    const response = await fetch('/api/products?fields=source_product_id');
    if (!response.ok) {
      console.error('[getExistingAsins] Failed to fetch products');
      return new Set();
    }

    const data = await response.json();
    if (!data.success || !Array.isArray(data.data)) {
      return new Set();
    }

    const asins = data.data
      .map((p: any) => p.source_product_id)
      .filter((asin: any): asin is string => typeof asin === 'string');

    return new Set(asins);
  } catch (error) {
    console.error('[getExistingAsins] Error:', error);
    return new Set();
  }
}

/**
 * Save verification job to database
 */
export async function saveVerificationJob(job: Omit<VerificationJob, 'id'>): Promise<string | null> {
  // For now, generate a client-side ID
  // In production, this would call the API to create a job record
  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.log('[saveVerificationJob] Created job:', id);
  return id;
}

/**
 * Save verification results to database
 */
export async function saveVerificationResults(
  jobId: string,
  results: VerifiedProduct[]
): Promise<boolean> {
  // For now, just log
  // In production, this would call the API to save results
  console.log('[saveVerificationResults] Saving', results.length, 'results for job', jobId);
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// COST ESTIMATION (AI Bot)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Estimate verification cost with smart strategy
 */
export function estimateCost(
  productCount: number,
  options: {
    useKeepa?: boolean;
    useRainforest?: boolean;
    estimatedPassRate?: number;
  } = {}
): CostEstimate {
  const { useKeepa = true, useRainforest = true, estimatedPassRate = 0.4 } = options;

  // Keepa: 1 token per product, free with plan
  const keepaTokens = useKeepa ? productCount : 0;

  // Rainforest: ~$0.01-0.02 per product, only for winners
  const winnersCount = Math.ceil(productCount * estimatedPassRate);
  const rainforestCost = useRainforest ? winnersCount * 0.015 : 0;

  // Naive approach: Rainforest for all
  const naiveCost = productCount * 0.015;
  const savings = naiveCost - rainforestCost;
  const savingsPercent = naiveCost > 0 ? Math.round((savings / naiveCost) * 100) : 0;

  // Processing time estimate
  const keepaMinutes = Math.ceil(productCount / 100); // 100/min with Keepa
  const rainforestMinutes = Math.ceil(winnersCount / 30); // 30/min with Rainforest
  const totalMinutes = keepaMinutes + rainforestMinutes;
  
  let processingTime: string;
  if (totalMinutes < 60) {
    processingTime = `~${totalMinutes} minute${totalMinutes !== 1 ? 's' : ''}`;
  } else {
    const hours = (totalMinutes / 60).toFixed(1);
    processingTime = `~${hours} hours`;
  }

  // Strategy description
  const strategy = useKeepa && useRainforest
    ? `Phase 1: Keepa verify (${keepaTokens} tokens, free) → Phase 2: Enrich ~${winnersCount} winners (~$${rainforestCost.toFixed(2)})`
    : useKeepa
    ? `Keepa only (${keepaTokens} tokens, free)`
    : `Rainforest only (~$${rainforestCost.toFixed(2)})`;

  return {
    keepaTokens,
    rainforestCost,
    totalCost: rainforestCost,
    processingTime,
    strategy,
    savings,
    savingsPercent,
  };
}

/**
 * Check if Keepa API is configured
 */
export function hasKeepaConfig(): boolean {
  return keepaHasConfig();
}
