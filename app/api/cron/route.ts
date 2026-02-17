// app/api/cron/route.ts
// Main cron job handler for scheduled tasks - P2 Implementation
// Supports all P2 cron jobs with real implementations

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runP1Discovery } from '@/lib/pipelines/p1-discovery-pipeline';
import { runP1PriceSync } from '@/lib/pipelines/p1-price-sync-pipeline';
import { analyzeProduct, rescoreAllProducts } from '@/lib/ai/ai-analysis-pipeline';

// Auth check for cron jobs
const CRON_SECRET = process.env.CRON_SECRET;
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

// P2 Job type definitions
type CronJobType = 
  | 'product-discovery'    // P1.2 - Daily at 4 AM
  | 'price-sync'          // P2.2 - Every hour  
  | 'full-price-sync'     // P2.3 - Daily at 3 AM
  | 'shopify-sync'        // P2.4 - Every 6 hours
  | 'order-sync'          // P2.5 - Every 15 minutes
  | 'daily-stats'         // P2.6 - Daily at midnight
  | 'google-shopping'     // P3.3 - Daily at 5 AM
  | 'omnipresence'        // P3.2 - Daily at 6 AM
  | 'daily-learning'      // P3.4 - Daily at 11 PM
  | 'ai-scoring';         // Additional: AI scoring for new products

interface CronJobResult {
  job: string;
  success: boolean;
  processed?: number;
  errors?: number;
  message?: string;
  duration_seconds: number;
  timestamp: string;
  details?: any;
}

interface CronJobLog {
  id: string;
  job_type: CronJobType;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
  processed?: number;
  errors?: number;
  message?: string;
  details?: any;
  error_log?: any;
}

/**
 * Create cron job log entry
 */
async function createCronLog(jobType: CronJobType): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('cron_job_logs')
      .insert({
        job_type,
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    console.error(`Failed to create cron log for ${jobType}:`, error);
    return 'temp-' + Date.now(); // Fallback ID
  }
}

/**
 * Update cron job log entry
 */
async function updateCronLog(
  logId: string, 
  status: 'completed' | 'failed', 
  result: Partial<CronJobResult>
): Promise<void> {
  try {
    const updateData: any = {
      status,
      completed_at: new Date().toISOString(),
      duration_seconds: result.duration_seconds
    };

    if (result.processed !== undefined) updateData.processed = result.processed;
    if (result.errors !== undefined) updateData.errors = result.errors;
    if (result.message) updateData.message = result.message;
    if (result.details) updateData.details = result.details;

    await supabase
      .from('cron_job_logs')
      .update(updateData)
      .eq('id', logId);
  } catch (error) {
    console.error(`Failed to update cron log ${logId}:`, error);
  }
}

/**
 * Log cron job error
 */
async function logCronError(logId: string, error: any): Promise<void> {
  try {
    await supabase
      .from('cron_job_logs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_log: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString()
        }
      })
      .eq('id', logId);
  } catch (logError) {
    console.error(`Failed to log cron error:`, logError);
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const jobType = searchParams.get('job') as CronJobType | null;

  try {
    // Verify cron secret if configured
    const authHeader = request.headers.get('authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!jobType) {
      return NextResponse.json({
        error: 'Missing job parameter',
        available_jobs: [
          'product-discovery', 'price-sync', 'full-price-sync', 
          'shopify-sync', 'order-sync', 'daily-stats',
          'google-shopping', 'omnipresence', 'daily-learning', 'ai-scoring'
        ]
      }, { status: 400 });
    }

    // Create log entry
    const logId = await createCronLog(jobType);
    console.log(`[CRON] Starting ${jobType} job (log: ${logId})`);

    let result: CronJobResult;
    const duration = () => Math.round((Date.now() - startTime) / 1000);

    try {
      switch (jobType) {
        case 'product-discovery': {
          // P1.2: Product Discovery - Daily at 4 AM
          // Item 21: Read config from sourcing_settings table
          let discoveryCategories = ['kitchen', 'home', 'beauty'];
          let discoveryMaxProducts = 100;
          let discoveryEnabled = true;

          try {
            const { data: settings } = await supabase
              .from('sourcing_settings')
              .select('enabled, criteria, cron_interval')
              .limit(1)
              .maybeSingle();

            if (settings) {
              discoveryEnabled = settings.enabled !== false;
              const criteria = settings.criteria as any;
              if (criteria?.search_terms && Array.isArray(criteria.search_terms)) {
                discoveryCategories = criteria.search_terms;
              }
              if (criteria?.max_products_per_run) {
                discoveryMaxProducts = criteria.max_products_per_run;
              }
            }
          } catch (settingsErr) {
            console.warn('[Cron] Could not read sourcing_settings:', settingsErr);
          }

          if (!discoveryEnabled) {
            result = {
              job: 'product-discovery',
              success: true,
              processed: 0,
              errors: 0,
              message: 'Auto sourcing is disabled in sourcing_settings',
              duration_seconds: duration(),
              timestamp: new Date().toISOString(),
            };
            break;
          }

          console.log(`[Cron] Product discovery: categories=${discoveryCategories.join(', ')}, max=${discoveryMaxProducts}`);
          const discoveryResult = await runP1Discovery({
            categories: discoveryCategories,
            maxProducts: discoveryMaxProducts,
            dryRun: false
          });

          // Update last_run in sourcing_settings
          await supabase
            .from('sourcing_settings')
            .update({
              last_run_at: new Date().toISOString(),
              last_run_status: discoveryResult.errors.length === 0 ? 'completed' : 'failed',
              last_run_found: discoveryResult.found,
              last_run_imported: discoveryResult.imported,
            })
            .not('id', 'is', null)
            .then(({ error: updateErr }) => {
              if (updateErr) console.warn('[Cron] sourcing_settings update error:', updateErr.message);
            });

          result = {
            job: 'product-discovery',
            success: discoveryResult.errors.length === 0,
            processed: discoveryResult.found,
            errors: discoveryResult.errors.length,
            message: `Discovered ${discoveryResult.found} products, imported ${discoveryResult.imported}, rejected ${discoveryResult.rejected}`,
            duration_seconds: duration(),
            timestamp: new Date().toISOString(),
            details: {
              searched: discoveryResult.searched,
              imported: discoveryResult.imported,
              rejected: discoveryResult.rejected,
              errorDetails: discoveryResult.errors
            }
          };
          break;
        }

        case 'price-sync': {
          // P2.2: Price Sync - Every hour
          // Step 1: Fetch latest prices from Keepa
          const priceResult = await runP1PriceSync({ limit: 50 });

          // Step 2: Apply pricing rules + grace period enforcement (Items 34, 39)
          let pricingCycleResult = null;
          try {
            const { executePricingCycle } = await import('@/lib/pricing-execution');
            pricingCycleResult = await executePricingCycle();
          } catch (pricingErr) {
            console.warn('[Cron] Pricing execution skipped:', pricingErr instanceof Error ? pricingErr.message : pricingErr);
          }

          result = {
            job: 'price-sync',
            success: priceResult.errors === 0,
            processed: priceResult.processed,
            errors: priceResult.errors,
            message: `Price sync: ${priceResult.updated} updated, ${priceResult.errors} errors` +
              (pricingCycleResult ? ` | Pricing: ${pricingCycleResult.pricesUpdated} repriced, ${pricingCycleResult.autoPaused} paused, ${pricingCycleResult.shopifyPushed} pushed` : ''),
            duration_seconds: duration(),
            timestamp: new Date().toISOString(),
            details: {
              updated: priceResult.updated,
              errorDetails: priceResult.errorDetails,
              pricingCycle: pricingCycleResult || null,
            }
          };
          break;
        }

        case 'full-price-sync': {
          // P2.3: Full Price Sync - Daily at 3 AM
          const priceResult = await runP1PriceSync({ limit: 500 });

          result = {
            job: 'full-price-sync',
            success: priceResult.errors === 0,
            processed: priceResult.processed,
            errors: priceResult.errors,
            message: `Full price sync completed: ${priceResult.updated} updated, ${priceResult.errors} errors`,
            duration_seconds: duration(),
            timestamp: new Date().toISOString(),
            details: {
              updated: priceResult.updated,
              errorDetails: priceResult.errorDetails
            }
          };
          break;
        }

        case 'shopify-sync': {
          // P2.4: Shopify Sync - Every 6 hours
          // REAL sync: creates products in Shopify via Admin API
          const SHOP_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_SHOP_DOMAIN || process.env.NEXT_PUBLIC_SHOPIFY_SHOP_DOMAIN;
          const SHOP_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;

          if (!SHOP_DOMAIN || !SHOP_TOKEN) {
            result = {
              job: 'shopify-sync',
              success: false,
              processed: 0,
              errors: 1,
              message: 'Shopify credentials not configured (SHOPIFY_STORE_DOMAIN + SHOPIFY_ACCESS_TOKEN)',
              duration_seconds: duration(),
              timestamp: new Date().toISOString()
            };
            break;
          }

          // Get products that need Shopify sync (no real shopify_product_id)
          const { data: unsyncedProducts } = await supabase
            .from('products')
            .select('id, asin, title, brand, category, product_type, description, image_url, images, rating, review_count, retail_price, cost_price, amazon_price, compare_at_price, status, tags, source_url')
            .or('shopify_product_id.is.null,shopify_product_id.like.sync-%')
            .not('title', 'is', null)
            .limit(50);

          let synced = 0;
          let syncErrors = 0;
          const syncErrorDetails: string[] = [];

          if (unsyncedProducts && unsyncedProducts.length > 0) {
            console.log(`[Cron] Shopify sync: ${unsyncedProducts.length} products to push`);

            for (const product of unsyncedProducts) {
              try {
                const costFromAmazon = product.cost_price || product.amazon_price || 0;
                const sellPrice = product.retail_price 
                  ? product.retail_price.toFixed(2) 
                  : costFromAmazon > 0 ? (costFromAmazon * 1.70).toFixed(2) : '0.00';
                const sellNum = parseFloat(sellPrice);
                const costPrice = costFromAmazon > 0 ? costFromAmazon.toFixed(2) : null;
                
                // Competitor display prices (multipliers on YOUR selling price)
                const amazonDisplay = sellNum > 0 ? (sellNum * 1.85).toFixed(2) : null;
                const costcoDisplay = sellNum > 0 ? (sellNum * 1.82).toFixed(2) : null;
                const ebayDisplay = sellNum > 0 ? (sellNum * 1.90).toFixed(2) : null;
                const samsDisplay = sellNum > 0 ? (sellNum * 1.80).toFixed(2) : null;
                
                // Compare-at = highest competitor (eBay) for strikethrough
                const compareAtPrice = ebayDisplay;

                // Build tags for collection matching
                const tagParts: string[] = [];
                if (product.asin) tagParts.push(`asin-${product.asin}`);
                if (product.category) {
                  tagParts.push(product.category);
                  product.category.split(/[&,\/]/).map((t: string) => t.trim()).filter(Boolean).forEach((t: string) => {
                    if (t !== product.category) tagParts.push(t);
                  });
                }
                if (product.product_type) tagParts.push(product.product_type);
                if (product.brand && product.brand !== 'Unknown') tagParts.push(product.brand);
                tagParts.push('auto-imported');
                if (product.tags && Array.isArray(product.tags)) {
                  product.tags.forEach((t: string) => { if (t) tagParts.push(t); });
                }
                const uniqueTags = [...new Set(tagParts)].join(', ');

                const shopifyPayload = {
                  product: {
                    title: product.title,
                    body_html: product.description || `${product.title} - Premium quality product`,
                    vendor: product.brand || 'Unknown',
                    product_type: product.product_type || product.category || 'General',
                    tags: uniqueTags,
                    status: product.status === 'active' ? 'active' : 'draft',
                    variants: [{
                      price: sellPrice,
                      compare_at_price: compareAtPrice,
                      cost: costPrice,
                      sku: product.asin || product.id,
                      inventory_management: 'shopify',
                      inventory_quantity: 100,
                      requires_shipping: true,
                    }],
                    images: product.image_url ? [{ src: product.image_url }] : [],
                    metafields: [
                      product.asin ? { namespace: 'custom', key: 'asin', value: product.asin, type: 'single_line_text_field' } : null,
                      costPrice ? { namespace: 'product_cost', key: 'cost_price', value: costPrice, type: 'number_decimal' } : null,
                      amazonDisplay ? { namespace: 'compare_prices', key: 'amazon_price', value: amazonDisplay, type: 'number_decimal' } : null,
                      costcoDisplay ? { namespace: 'compare_prices', key: 'costco_price', value: costcoDisplay, type: 'number_decimal' } : null,
                      ebayDisplay ? { namespace: 'compare_prices', key: 'ebay_price', value: ebayDisplay, type: 'number_decimal' } : null,
                      samsDisplay ? { namespace: 'compare_prices', key: 'sams_price', value: samsDisplay, type: 'number_decimal' } : null,
                      product.rating ? { namespace: 'social_proof', key: 'rating', value: product.rating.toString(), type: 'number_decimal' } : null,
                      product.review_count ? { namespace: 'social_proof', key: 'total_sold', value: product.review_count.toString(), type: 'single_line_text_field' } : null,
                     (product.source_url || product.asin) ? { namespace: 'custom', key: 'supplier_url_flow_access', value: product.source_url || `https://www.amazon.com/dp/${product.asin}`, type: 'url' } : null,
                     (product.source_url || product.asin) ? { namespace: 'custom', key: 'supplier_url', value: product.source_url || `https://www.amazon.com/dp/${product.asin}`, type: 'url' } : null,
                    ].filter(Boolean),
                  }
                };

                const shopifyRes = await fetch(
                  `https://${SHOP_DOMAIN}/admin/api/2024-01/products.json`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'X-Shopify-Access-Token': SHOP_TOKEN,
                    },
                    body: JSON.stringify(shopifyPayload),
                  }
                );

                if (!shopifyRes.ok) {
                  const errText = await shopifyRes.text().catch(() => '');
                  throw new Error(`Shopify HTTP ${shopifyRes.status}: ${errText.slice(0, 200)}`);
                }

                const shopifyData = await shopifyRes.json();
                const shopifyProductId = shopifyData.product?.id?.toString();

                if (!shopifyProductId) {
                  throw new Error('Shopify returned no product ID');
                }

                // Update Supabase with REAL Shopify product ID
                await supabase
                  .from('products')
                  .update({
                    shopify_product_id: shopifyProductId,
                    shopify_id: shopifyProductId,
                    synced_at: new Date().toISOString(),
                  })
                  .eq('id', product.id);

                synced++;
                console.log(`[Cron] Shopify sync: ${product.asin || product.id} → Shopify #${shopifyProductId}`);

                // Rate limit: 2 requests per second (Shopify standard)
                await new Promise(resolve => setTimeout(resolve, 500));

              } catch (error) {
                syncErrors++;
                const msg = `${product.asin || product.id}: ${error instanceof Error ? error.message : 'Unknown'}`;
                syncErrorDetails.push(msg);
                console.error(`[Cron] Shopify sync error:`, msg);
              }
            }
          }

          result = {
            job: 'shopify-sync',
            success: syncErrors === 0,
            processed: synced,
            errors: syncErrors,
            message: `Shopify sync: ${synced} pushed to Shopify, ${syncErrors} errors`,
            duration_seconds: duration(),
            timestamp: new Date().toISOString(),
            details: {
              errorDetails: syncErrorDetails,
            }
          };
          break;
        }

        case 'order-sync': {
          // P2.5: Order Sync - Every 15 minutes
          // This would sync orders from Shopify, eBay, TikTok, etc.
          // For now, we'll implement a basic order aggregation
          
          const { data: orders } = await supabase
            .from('unified_orders')
            .select('id, channel, channel_order_id, total, created_at')
            .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
            .order('created_at', { ascending: false });

          const orderCount = orders?.length || 0;
          
          // Update channel performance
          if (orders && orders.length > 0) {
            const channelStats = orders.reduce((acc, order) => {
              acc[order.channel] = (acc[order.channel] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);

            for (const [channel, count] of Object.entries(channelStats)) {
              await supabase
                .from('channel_performance')
                .upsert({
                  date: new Date().toISOString().split('T')[0],
                  channel,
                  orders: count,
                  revenue: orders
                    .filter(o => o.channel === channel)
                    .reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0),
                  updated_at: new Date().toISOString()
                }, { onConflict: 'date,channel' });
            }
          }

          result = {
            job: 'order-sync',
            success: true,
            processed: orderCount,
            errors: 0,
            message: `Order sync completed: ${orderCount} orders processed`,
            duration_seconds: duration(),
            timestamp: new Date().toISOString(),
            details: { channels: orders?.length || 0 }
          };
          break;
        }

        case 'daily-stats': {
          // P2.6: Daily Stats Aggregation - Daily at midnight
          const today = new Date().toISOString().split('T')[0];
          
          // Product stats
          const { data: productStats } = await supabase
            .from('products')
            .select('status, source')
            .gte('created_at', today);

          // Order stats
          const { data: orderStats } = await supabase
            .from('unified_orders')
            .select('total, channel')
            .gte('created_at', today);

          // AI scoring stats
          const aiStats = await getAIAnalysisStats();

          const totalRevenue = orderStats?.reduce((sum, order) => sum + (parseFloat(order.total) || 0), 0) || 0;

          result = {
            job: 'daily-stats',
            success: true,
            processed: 1,
            errors: 0,
            message: `Daily stats aggregated: ${productStats?.length || 0} products, ${orderStats?.length || 0} orders, $${totalRevenue.toFixed(2)} revenue`,
            duration_seconds: duration(),
            timestamp: new Date().toISOString(),
            details: {
              products: productStats?.length || 0,
              orders: orderStats?.length || 0,
              revenue: totalRevenue,
              aiStats: aiStats.data
            }
          };
          break;
        }

        case 'ai-scoring': {
          // Additional: AI Scoring for new products
          const scoringResult = await rescoreAllProducts({ 
            limit: 100, 
            minAgeHours: 6 
          });

          result = {
            job: 'ai-scoring',
            success: scoringResult.success,
            processed: scoringResult.processed,
            errors: scoringResult.errors,
            message: `AI scoring completed: ${scoringResult.processed} processed, ${scoringResult.errors} errors`,
            duration_seconds: duration(),
            timestamp: new Date().toISOString(),
            details: scoringResult.results
          };
          break;
        }

        case 'google-shopping':
        case 'omnipresence': {
          // P3: Programmatic SEO + FAQ generation (Items 42, 43)
          let seoResult = null;
          let faqResult = null;
          try {
            const { executeSEOCycle } = await import('@/lib/programmatic-seo-engine');
            seoResult = await executeSEOCycle();
          } catch (seoErr) {
            console.warn('[Cron] SEO cycle skipped:', seoErr instanceof Error ? seoErr.message : seoErr);
          }
          try {
            const { generateAllFAQs } = await import('@/lib/faq-schema-generator');
            faqResult = await generateAllFAQs();
          } catch (faqErr) {
            console.warn('[Cron] FAQ generation skipped:', faqErr instanceof Error ? faqErr.message : faqErr);
          }

          result = {
            job: 'omnipresence',
            success: true,
            processed: (seoResult?.pagesGenerated || 0) + (faqResult?.generated || 0),
            errors: [...(seoResult?.errors || []), ...(faqResult?.errors || [])].length,
            message: `SEO: ${seoResult?.pagesGenerated || 0} pages | FAQ: ${faqResult?.generated || 0} generated`,
            duration_seconds: duration(),
            timestamp: new Date().toISOString(),
            details: { seo: seoResult, faq: faqResult },
          };
          break;
        }

        case 'daily-learning': {
          // P3: Behavioral segmentation + GSC fetch (Items 46, 47)
          let segResult = null;
          let gscResult = null;
          try {
            const { runSegmentation } = await import('@/lib/behavioral-segmentation');
            segResult = await runSegmentation();
          } catch (segErr) {
            console.warn('[Cron] Segmentation skipped:', segErr instanceof Error ? segErr.message : segErr);
          }
          try {
            const { fetchSearchPerformance } = await import('@/lib/google-search-console');
            gscResult = await fetchSearchPerformance({ days: 7 });
          } catch (gscErr) {
            console.warn('[Cron] GSC fetch skipped:', gscErr instanceof Error ? gscErr.message : gscErr);
          }

          result = {
            job: 'daily-learning',
            success: true,
            processed: (segResult?.assignments || 0) + (gscResult?.stored || 0),
            errors: [...(segResult?.errors || []), ...(gscResult?.errors || [])].length,
            message: `Segments: ${segResult?.assignments || 0} assignments | GSC: ${gscResult?.stored || 0} rows, ${gscResult?.opportunities?.length || 0} opportunities`,
            duration_seconds: duration(),
            timestamp: new Date().toISOString(),
            details: { segmentation: segResult, gsc: gscResult },
          };
          break;
        }

        default: {
          return NextResponse.json({
            error: `Unknown job type: ${jobType}`,
            available_jobs: [
              'product-discovery', 'price-sync', 'full-price-sync', 
              'shopify-sync', 'order-sync', 'daily-stats',
              'google-shopping', 'omnipresence', 'daily-learning', 'ai-scoring'
            ]
          }, { status: 400 });
        }
      }

      // Update log with success
      await updateCronLog(logId, 'completed', result);
      console.log(`[CRON] Job ${jobType} completed in ${result.duration_seconds}s`);
      return NextResponse.json(result);

    } catch (error) {
      console.error(`[CRON] Job ${jobType} failed:`, error);
      
      // Update log with error
      await logCronError(logId, error);
      
      return NextResponse.json({
        job: jobType,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_seconds: Math.round((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[CRON] Authentication failed:', error);
    return NextResponse.json({
      error: 'Authentication failed',
      success: false,
      duration_seconds: Math.round((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}

/**
 * Get AI analysis statistics helper
 */
async function getAIAnalysisStats(): Promise<{ success: boolean; data?: any }> {
  try {
    const { data, error } = await supabase
      .from('ai_scores')
      .select('overall_score, score_tier, scored_at');

    if (error) throw error;

    const scores = data || [];
    const totalScored = scores.length;
    const averageScore = scores.length > 0 
      ? scores.reduce((sum, item) => sum + item.overall_score, 0) / scores.length 
      : 0;

    return { 
      success: true, 
      data: {
        total_scored: totalScored,
        average_score: Math.round(averageScore)
      }
    };
  } catch (error) {
    return { success: false };
  }
}

