// lib/pipelines/p1-discovery-pipeline.ts
// P1 Product Discovery Pipeline - FIXED VERSION
// Uses Keepa API → Pricing Rules → Demand Filter → Correct Pricing → Shopify with Metafields
//
// WORKFLOW:
// 1. Keepa batch lookup for ASINs (from bestsellers or category)
// 2. Apply discovery criteria from pricing-rules.ts
// 3. Apply demand filter (BSR < 100k, volatility < 50%)
// 4. Calculate pricing (cost × 1.70, competitor prices 75-90% higher)
// 5. Save to database with demand data
// 6. Push to Shopify with competitor price metafields
// 7. Log discovery run stats

import { createClient } from '@supabase/supabase-js';
import { 
  getProductsHistory, 
  hasKeepaConfig, 
  analyzeHistory,
  type KeepaServiceResult,
  type EnrichedKeepaData 
} from '@/lib/services/keepa';
import { 
  PRICING_RULES, 
  meetsDiscoveryCriteria, 
  containsExcludedBrand 
} from '@/lib/config/pricing-rules';
import { 
  ProductPersistence, 
  DiscoveryPersistence 
} from '@/lib/db/persistence';
import type { KeepaProductData } from '@/types';

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

const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// Demand filter thresholds
const DEMAND_CONFIG = {
  maxBSR: 100000,           // BSR must be below this
  maxVolatility: 0.50,      // Price volatility must be below 50%
  minEstimatedSales: 10,    // Minimum estimated monthly sales
};

// Sample ASIN lists by category (these would come from Keepa deals/bestsellers in production)
const CATEGORY_ASINS: Record<string, string[]> = {
  'kitchen': [
    'B08P3JTXTS', 'B07VFCMJH4', 'B08QMW6V24', 'B07FXLQY2T', 'B0869PFGF3',
    'B07TCMPQTH', 'B07W5P9X3Z', 'B08LDQ9H9J', 'B07XNVMQPZ', 'B08C7J4Q3X',
  ],
  'home': [
    'B08BRN4LTC', 'B07N4M94X4', 'B07B4K7N8Z', 'B07GRKS7FQ', 'B07X5T4QFF',
    'B07VLK7C5Z', 'B08CMQHJZP', 'B07RL8H55Y', 'B08QJ5GVYC', 'B07WFPM6BN',
  ],
  'beauty': [
    'B01BMDAVIY', 'B00OE7HXPC', 'B07N1VH7V2', 'B07DPP7HHV', 'B00BSNMB6Q',
    'B07PLND3LJ', 'B07D7V5Q3C', 'B00R87FB8E', 'B07BK8J6N4', 'B07XQXZXJC',
  ],
  'electronics': [
    'B0BQ18T6YZ', 'B0BDHWDR12', 'B09V3KXJPB', 'B08N5WRWNW', 'B07K7FLR9P',
    'B07FKTZC4M', 'B08B4HX8TS', 'B0B3F1FJ3L', 'B0BNW5CHXW', 'B09HQF2VQY',
  ],
  'fitness': [
    'B07BRGVTVJ', 'B07D7NVPJN', 'B07PPNVJ88', 'B084GZQ7LT', 'B07TC2BK1X',
    'B07HCKF4LC', 'B0725HBWJ4', 'B07J9TRG58', 'B078XYZ9HG', 'B07PMT6DQC',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface DiscoveryResult {
  success: boolean;
  searched: number;
  found: number;
  qualified: number;
  imported: number;
  rejected: number;
  errors: string[];
  tokensUsed: number;
  duration: number;
}

interface QualifiedProduct {
  asin: string;
  title: string;
  amazonPrice: number;
  yourPrice: number;
  compareAtPrice: number;
  competitorPrices: {
    amazon: number;
    costco: number;
    ebay: number;
    sams: number;
  };
  margin: number;
  rating: number;
  reviews: number;
  isPrime: boolean;
  bsr: number | null;
  demandScore: number;
  priceStability: 'stable' | 'volatile' | 'unknown';
}

interface RejectionReason {
  asin: string;
  title: string;
  reason: string;
  category: 'criteria' | 'demand' | 'duplicate' | 'price' | 'error';
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate random number between min and max
 */
function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Calculate competitor display prices (75-90% higher than your price)
 * Using ranges from PRICING_RULES
 */
function calculateCompetitorPrices(yourPrice: number): {
  amazon: number;
  costco: number;
  ebay: number;
  sams: number;
  highest: number;
} {
  const { ranges } = PRICING_RULES.competitors;
  
  const amazon = yourPrice * randomBetween(ranges.amazon.min, ranges.amazon.max);
  const costco = yourPrice * randomBetween(ranges.costco.min, ranges.costco.max);
  const ebay = yourPrice * randomBetween(ranges.ebay.min, ranges.ebay.max);
  const sams = yourPrice * randomBetween(ranges.sams.min, ranges.sams.max);
  
  return {
    amazon: Math.round(amazon * 100) / 100,
    costco: Math.round(costco * 100) / 100,
    ebay: Math.round(ebay * 100) / 100,
    sams: Math.round(sams * 100) / 100,
    highest: Math.round(Math.max(amazon, costco, ebay, sams) * 100) / 100,
  };
}

/**
 * Calculate demand score based on BSR and price stability
 * Formula: (100000 / avg_bsr) × (1 - volatility) × prime_multiplier
 */
function calculateDemandScore(
  bsr: number | null,
  priceStability: 'stable' | 'volatile' | 'unknown',
  isPrime: boolean
): number {
  if (!bsr || bsr <= 0) return 0;
  
  const volatilityPenalty = priceStability === 'volatile' ? 0.5 : 
                            priceStability === 'stable' ? 0.1 : 0.3;
  const primeMultiplier = isPrime ? 1.1 : 1.0;
  
  // Base score from BSR (lower BSR = higher score)
  const bsrScore = Math.min(100, (100000 / bsr) * 10);
  
  // Apply volatility and prime multipliers
  const score = bsrScore * (1 - volatilityPenalty) * primeMultiplier;
  
  return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Check if product meets demand criteria
 */
function meetsDemandCriteria(
  bsr: number | null,
  volatility: number,
  demandScore: number
): { meets: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  if (bsr === null) {
    reasons.push('No BSR data available');
  } else if (bsr > DEMAND_CONFIG.maxBSR) {
    reasons.push(`BSR ${bsr.toLocaleString()} exceeds maximum ${DEMAND_CONFIG.maxBSR.toLocaleString()}`);
  }
  
  if (volatility > DEMAND_CONFIG.maxVolatility) {
    reasons.push(`Price volatility ${(volatility * 100).toFixed(0)}% exceeds maximum ${(DEMAND_CONFIG.maxVolatility * 100).toFixed(0)}%`);
  }
  
  if (demandScore < 20) {
    reasons.push(`Demand score ${demandScore} too low (minimum 20)`);
  }
  
  return {
    meets: reasons.length === 0,
    reasons,
  };
}

/**
 * Check if ASIN already exists in our database
 */
async function checkDuplicate(asin: string): Promise<boolean> {
  // Check products table
  const { data: existingProduct } = await getSupabaseClient()
    .from('products')
    .select('id')
    .eq('asin', asin)
    .single();
  
  if (existingProduct) return true;
  
  // Check recent rejections (within 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const { data: recentRejection } = await getSupabaseClient()
    .from('rejection_log')
    .select('id')
    .eq('asin', asin)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .single();
  
  return !!recentRejection;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHOPIFY INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Push product to Shopify with competitor price metafields
 */
async function pushToShopify(product: QualifiedProduct): Promise<{ success: boolean; shopifyId?: string; error?: string }> {
  if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
    return { success: false, error: 'Shopify not configured' };
  }
  
  const amazonUrl = `https://www.amazon.com/dp/${product.asin}`;
  
  const shopifyProduct = {
    product: {
      title: product.title,
      body_html: `<p>High-quality product sourced for value. Rating: ${product.rating}/5 (${product.reviews.toLocaleString()} reviews)</p>`,
      vendor: 'Dropship Pro',
      product_type: 'General',
      status: 'active',
      tags: [
        `asin-${product.asin}`,
        'auto-discovered',
        'keepa-verified',
        'high-demand',
        `margin-${Math.round(product.margin)}pct`,
      ],
      variants: [{
        price: product.yourPrice.toFixed(2),
        compare_at_price: product.compareAtPrice.toFixed(2),
        sku: product.asin,
        inventory_management: null, // No tracking for dropship
        requires_shipping: true,
        taxable: true,
      }],
      metafields: [
        {
          namespace: 'custom',
          key: 'supplier_url',
          value: amazonUrl,
          type: 'url',
        },
        {
          namespace: 'custom',
          key: 'supplier_cost',
          value: product.amazonPrice.toFixed(2),
          type: 'number_decimal',
        },
        {
          namespace: 'comparisons',
          key: 'price_amazon',
          value: product.competitorPrices.amazon.toFixed(2),
          type: 'number_decimal',
        },
        {
          namespace: 'comparisons',
          key: 'price_costco',
          value: product.competitorPrices.costco.toFixed(2),
          type: 'number_decimal',
        },
        {
          namespace: 'comparisons',
          key: 'price_ebay',
          value: product.competitorPrices.ebay.toFixed(2),
          type: 'number_decimal',
        },
        {
          namespace: 'comparisons',
          key: 'price_samsclub',
          value: product.competitorPrices.sams.toFixed(2),
          type: 'number_decimal',
        },
        {
          namespace: 'analytics',
          key: 'demand_score',
          value: product.demandScore.toString(),
          type: 'number_integer',
        },
        {
          namespace: 'analytics',
          key: 'bsr_rank',
          value: (product.bsr || 0).toString(),
          type: 'number_integer',
        },
      ],
    },
  };

  try {
    const response = await fetch(
      `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/products.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify(shopifyProduct),
      }
    );

    const data = await response.json();
    
    if (data.product?.id) {
      return { success: true, shopifyId: data.product.id.toString() };
    }

    return { 
      success: false, 
      error: data.errors ? JSON.stringify(data.errors) : 'Unknown Shopify error' 
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Shopify push failed' 
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DISCOVERY PIPELINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run the P1 Product Discovery Pipeline
 */
export async function runP1Discovery(options?: {
  categories?: string[];
  maxProducts?: number;
  dryRun?: boolean;
}): Promise<DiscoveryResult> {
  const startTime = Date.now();
  const {
    categories = ['kitchen', 'home', 'beauty'],
    maxProducts = 50,
    dryRun = false,
  } = options || {};

  const result: DiscoveryResult = {
    success: false,
    searched: 0,
    found: 0,
    qualified: 0,
    imported: 0,
    rejected: 0,
    errors: [],
    tokensUsed: 0,
    duration: 0,
  };

  const rejections: RejectionReason[] = [];
  const qualifiedProducts: QualifiedProduct[] = [];

  // Check Keepa configuration
  if (!hasKeepaConfig()) {
    result.errors.push('Keepa API not configured - set KEEPA_API_KEY environment variable');
    result.duration = Date.now() - startTime;
    return result;
  }

  // Create discovery run record
  const today = new Date().toISOString().split('T')[0];
  const { id: runId } = await DiscoveryPersistence.upsertDiscoveryRun(today, 'running');

  console.log(`[P1 Discovery] Starting run ${runId} for categories: ${categories.join(', ')}`);

  try {
    // Collect ASINs from selected categories
    const asinsToCheck: string[] = [];
    for (const category of categories) {
      const categoryAsins = CATEGORY_ASINS[category] || [];
      asinsToCheck.push(...categoryAsins);
    }

    // Remove duplicates
    const uniqueAsins = [...new Set(asinsToCheck)];
    result.searched = uniqueAsins.length;

    console.log(`[P1 Discovery] Checking ${uniqueAsins.length} ASINs via Keepa`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: KEEPA BATCH LOOKUP
    // ═══════════════════════════════════════════════════════════════════════

    const keepaResponse = await getProductsHistory(uniqueAsins, { days: 90 });
    
    if (!keepaResponse.success) {
      result.errors.push(`Keepa API error: ${keepaResponse.errorCode}`);
      result.duration = Date.now() - startTime;
      await DiscoveryPersistence.upsertDiscoveryRun(today, 'failed');
      return result;
    }

    const keepaData = keepaResponse.data;
    result.tokensUsed = keepaData.tokensUsed;
    result.found = keepaData.found;

    console.log(`[P1 Discovery] Keepa returned ${keepaData.found} products, used ${keepaData.tokensUsed} tokens`);

    // Process each product
    for (const product of keepaData.products) {
      if (qualifiedProducts.length >= maxProducts) break;

      const asin = product.asin;
      const title = product.title || `Product ${asin}`;
      const amazonPrice = product.amazon_price;
      const rating = product.rating;
      const reviews = product.review_count;
      const isPrime = product.is_prime || false;
      const bsr = product.salesRank;

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 2: DISCOVERY CRITERIA FILTER
      // ═══════════════════════════════════════════════════════════════════════

      const criteriaCheck = meetsDiscoveryCriteria({
        price: amazonPrice,
        rating: rating,
        reviews: reviews,
        isPrime: isPrime,
        title: title,
      });

      if (!criteriaCheck.meets) {
        rejections.push({
          asin,
          title,
          reason: criteriaCheck.reasons.join('; '),
          category: 'criteria',
        });
        continue;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 3: DEMAND CONSISTENCY FILTER
      // ═══════════════════════════════════════════════════════════════════════

      const enriched = analyzeHistory(product);
      const volatility = enriched.priceStability === 'volatile' ? 0.6 : 
                         enriched.priceStability === 'stable' ? 0.15 : 0.35;
      const demandScore = calculateDemandScore(bsr, enriched.priceStability, isPrime);

      const demandCheck = meetsDemandCriteria(bsr, volatility, demandScore);
      
      if (!demandCheck.meets) {
        rejections.push({
          asin,
          title,
          reason: demandCheck.reasons.join('; '),
          category: 'demand',
        });
        continue;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 4: DEDUPLICATION CHECK
      // ═══════════════════════════════════════════════════════════════════════

      const isDuplicate = await checkDuplicate(asin);
      if (isDuplicate) {
        rejections.push({
          asin,
          title,
          reason: 'Already exists in catalog or recently rejected',
          category: 'duplicate',
        });
        continue;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 5: PRICING CALCULATION
      // ═══════════════════════════════════════════════════════════════════════

      if (!amazonPrice || amazonPrice <= 0) {
        rejections.push({
          asin,
          title,
          reason: 'No valid Amazon price available',
          category: 'price',
        });
        continue;
      }

      // Your price = Amazon cost × 1.70 (70% markup)
      const yourPrice = Math.round(amazonPrice * PRICING_RULES.yourMarkup.multiplier * 100) / 100;
      
      // Calculate margin
      const margin = ((yourPrice - amazonPrice) / yourPrice) * 100;
      
      // Check minimum margin
      if (margin < PRICING_RULES.profitThresholds.minimum) {
        rejections.push({
          asin,
          title,
          reason: `Margin ${margin.toFixed(1)}% below minimum ${PRICING_RULES.profitThresholds.minimum}%`,
          category: 'price',
        });
        continue;
      }

      // Generate competitor display prices (75-90% higher)
      const competitorPrices = calculateCompetitorPrices(yourPrice);

      // ═══════════════════════════════════════════════════════════════════════
      // PRODUCT QUALIFIED!
      // ═══════════════════════════════════════════════════════════════════════

      qualifiedProducts.push({
        asin,
        title,
        amazonPrice,
        yourPrice,
        compareAtPrice: competitorPrices.highest,
        competitorPrices: {
          amazon: competitorPrices.amazon,
          costco: competitorPrices.costco,
          ebay: competitorPrices.ebay,
          sams: competitorPrices.sams,
        },
        margin,
        rating: rating || 0,
        reviews: reviews || 0,
        isPrime,
        bsr,
        demandScore,
        priceStability: enriched.priceStability,
      });
    }

    result.qualified = qualifiedProducts.length;
    result.rejected = rejections.length;

    console.log(`[P1 Discovery] ${qualifiedProducts.length} qualified, ${rejections.length} rejected`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6 & 7: SAVE TO DATABASE & PUSH TO SHOPIFY
    // ═══════════════════════════════════════════════════════════════════════

    if (!dryRun) {
      for (const product of qualifiedProducts) {
        try {
          // Save to products table
          const productData = {
            id: `keepa-${product.asin}-${Date.now()}`,
            asin: product.asin,
            title: product.title,
            brand: 'Various',
            category: 'Auto-Discovered',
            description: `Demand Score: ${product.demandScore}/100. ${product.isPrime ? 'Prime eligible.' : ''}`,
            main_image: null,
            rating: product.rating,
            ratings_total: product.reviews,
            source: 'keepa' as const,
            status: 'active' as const,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const persistResult = await ProductPersistence.upsertProduct(productData);
          
          if (!persistResult.success) {
            result.errors.push(`Failed to save ${product.asin}: ${persistResult.error}`);
            continue;
          }

          // Save demand data
          await ProductPersistence.upsertProductDemand(
            persistResult.id!,
            product.asin,
            product.bsr,
            null // Category would come from Keepa category data
          );

          // Save competitor prices to price_history
          await getSupabaseClient().from('price_history').insert({
            product_id: persistResult.id,
            source: 'keepa_discovery',
            price: product.amazonPrice,
            recorded_at: new Date().toISOString(),
          });

          // Update product with pricing data
          await getSupabaseClient().from('products').update({
            amazon_price: product.amazonPrice,
            retail_price: product.yourPrice,
            compare_at_price: product.compareAtPrice,
            amazon_display_price: product.competitorPrices.amazon,
            costco_display_price: product.competitorPrices.costco,
            ebay_display_price: product.competitorPrices.ebay,
            sams_display_price: product.competitorPrices.sams,
            profit_margin: product.margin,
          }).eq('id', persistResult.id);

          // Push to Shopify
          const shopifyResult = await pushToShopify(product);
          
          if (shopifyResult.success) {
            // Update product with Shopify ID
            await getSupabaseClient().from('products').update({
              shopify_product_id: shopifyResult.shopifyId,
              synced_at: new Date().toISOString(),
            }).eq('id', persistResult.id);
            
            result.imported++;
            console.log(`✅ Imported: ${product.asin} → Shopify ${shopifyResult.shopifyId}`);
          } else {
            result.errors.push(`Shopify push failed for ${product.asin}: ${shopifyResult.error}`);
          }

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`${product.asin}: ${errorMsg}`);
        }
      }

      // Log rejections
      for (const rejection of rejections) {
        await DiscoveryPersistence.logRejection(
          rejection.asin,
          rejection.title,
          rejection.reason,
          rejection.category,
          undefined,
          undefined,
          runId
        );
      }
    } else {
      console.log(`[P1 Discovery] DRY RUN - would import ${qualifiedProducts.length} products`);
      result.imported = qualifiedProducts.length; // In dry run, count as imported
    }

    // Update discovery run stats
    await DiscoveryPersistence.updateDiscoveryStats(runId!, {
      found: result.found,
      imported: result.imported,
      rejected: result.rejected,
    });
    await DiscoveryPersistence.upsertDiscoveryRun(today, 'completed');

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 8: GENERATE MASTER BACKUP
    // ═══════════════════════════════════════════════════════════════════════
    
    if (!dryRun && qualifiedProducts.length > 0) {
      const backupResult = await generateMasterBackup(qualifiedProducts, today);
      if (!backupResult.success) {
        result.errors.push(`Backup failed: ${backupResult.error}`);
      }
    }

    result.success = result.errors.length === 0;
    result.duration = Date.now() - startTime;

    console.log(`[P1 Discovery] Complete in ${result.duration}ms - Imported: ${result.imported}, Rejected: ${result.rejected}, Errors: ${result.errors.length}`);

    return result;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(errorMsg);
    result.duration = Date.now() - startTime;
    await DiscoveryPersistence.upsertDiscoveryRun(today, 'failed');
    console.error('[P1 Discovery] Fatal error:', error);
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKUP/EXPORT SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate master backup files (JSON + CSV) after discovery run
 */
async function generateMasterBackup(
  products: QualifiedProduct[],
  runDate: string
): Promise<{ success: boolean; jsonPath?: string; csvPath?: string; error?: string }> {
  if (products.length === 0) {
    return { success: true }; // Nothing to backup
  }

  try {
    // Prepare export data
    const exportData = products.map(p => ({
      asin: p.asin,
      title: p.title,
      amazon_cost: p.amazonPrice,
      your_price: p.yourPrice,
      compare_at_price: p.compareAtPrice,
      margin_percent: Math.round(p.margin * 100) / 100,
      competitor_amazon: p.competitorPrices.amazon,
      competitor_costco: p.competitorPrices.costco,
      competitor_ebay: p.competitorPrices.ebay,
      competitor_sams: p.competitorPrices.sams,
      rating: p.rating,
      reviews: p.reviews,
      is_prime: p.isPrime,
      bsr: p.bsr,
      demand_score: p.demandScore,
      price_stability: p.priceStability,
      discovered_at: new Date().toISOString(),
    }));

    // Store JSON backup in database (as jsonb in discovery_runs)
    const jsonBackup = JSON.stringify(exportData, null, 2);
    
    // Generate CSV content
    const csvHeaders = Object.keys(exportData[0]).join(',');
    const csvRows = exportData.map(row => 
      Object.values(row).map(v => 
        typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v
      ).join(',')
    );
    const csvContent = [csvHeaders, ...csvRows].join('\n');

    // Store backup metadata in discovery_runs
    await getSupabaseClient()
      .from('discovery_runs')
      .update({
        backup_json: exportData,
        backup_csv: csvContent,
        backup_created_at: new Date().toISOString(),
      })
      .eq('run_date', runDate);

    console.log(`[P1 Discovery] Backup created: ${products.length} products`);
    
    return { 
      success: true,
      jsonPath: `discovery_runs/${runDate}/backup.json`,
      csvPath: `discovery_runs/${runDate}/backup.csv`,
    };
  } catch (error) {
    console.error('[P1 Discovery] Backup failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Backup failed' 
    };
  }
}

/**
 * Export discovery results to downloadable format
 */
export async function exportDiscoveryResults(runDate: string): Promise<{
  success: boolean;
  json?: string;
  csv?: string;
  error?: string;
}> {
  try {
    const { data, error } = await getSupabaseClient()
      .from('discovery_runs')
      .select('backup_json, backup_csv')
      .eq('run_date', runDate)
      .single();

    if (error || !data) {
      return { success: false, error: 'Discovery run not found' };
    }

    return {
      success: true,
      json: JSON.stringify(data.backup_json, null, 2),
      csv: data.backup_csv,
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Export failed' 
    };
  }
}

/**
 * Manual trigger for testing with limited scope
 */
export async function triggerP1DiscoveryManually(): Promise<DiscoveryResult> {
  return runP1Discovery({
    categories: ['kitchen'],
    maxProducts: 5,
    dryRun: false,
  });
}

/**
 * Dry run for testing without affecting database/Shopify
 */
export async function testP1Discovery(): Promise<DiscoveryResult> {
  return runP1Discovery({
    categories: ['kitchen', 'home'],
    maxProducts: 10,
    dryRun: true,
  });
}

