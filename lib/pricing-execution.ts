// lib/pricing-execution.ts
// ═══════════════════════════════════════════════════════════════════════════
// PRICING EXECUTION ENGINE — Spec Items 34, 39
// Wire auto-adjust pricing + grace period + Shopify push
// ═══════════════════════════════════════════════════════════════════════════
// - applyPricingRules(): Recalculate retail + competitor prices from cost
// - enforceGracePeriod(): Auto-pause products below threshold for 7+ days
// - pushPricesToShopify(): Write price + compare_at + metafields to Shopify
// - executePricingCycle(): Full pipeline called by cron
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { PRICING_RULES, COMPETITOR_NAMES } from '@/lib/config/pricing-rules';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Shopify Admin API
const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP_DOMAIN || process.env.NEXT_PUBLIC_SHOPIFY_SHOP_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_API_TOKEN;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface PricingProduct {
  id: string;
  asin: string | null;
  title: string;
  cost_price: number | null;
  retail_price: number | null;
  amazon_price: number | null;
  profit_percent: number | null;
  profit_amount: number | null;
  status: string;
  below_threshold_since: string | null;
  shopify_product_id: string | null;
  shopify_id: string | null;
  amazon_display_price: number | null;
  costco_display_price: number | null;
  ebay_display_price: number | null;
  sams_display_price: number | null;
  compare_at_price: number | null;
  updated_at: string;
}

interface PricingCycleResult {
  processed: number;
  pricesUpdated: number;
  competitorPricesSet: number;
  gracePeriodFlagged: number;
  autoPaused: number;
  shopifyPushed: number;
  errors: string[];
  duration_ms: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function roundToTwo(n: number): number {
  return Math.round(n * 100) / 100;
}

function generateCompetitorPrices(yourPrice: number): {
  amazon_display_price: number;
  costco_display_price: number;
  ebay_display_price: number;
  sams_display_price: number;
  compare_at_price: number;
} {
  const ranges = PRICING_RULES.competitors.ranges;
  const amazon = roundToTwo(yourPrice * randomInRange(ranges.amazon.min, ranges.amazon.max));
  const costco = roundToTwo(yourPrice * randomInRange(ranges.costco.min, ranges.costco.max));
  const ebay = roundToTwo(yourPrice * randomInRange(ranges.ebay.min, ranges.ebay.max));
  const sams = roundToTwo(yourPrice * randomInRange(ranges.sams.min, ranges.sams.max));
  const compare_at = Math.max(amazon, costco, ebay, sams);

  return { amazon_display_price: amazon, costco_display_price: costco, ebay_display_price: ebay, sams_display_price: sams, compare_at_price: compare_at };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. APPLY PRICING RULES
// Recalculate retail price from cost using PRICING_RULES.yourMarkup
// Generate randomized competitor display prices
// ═══════════════════════════════════════════════════════════════════════════

export async function applyPricingRules(products: PricingProduct[]): Promise<{
  updated: number;
  errors: string[];
}> {
  let updated = 0;
  const errors: string[] = [];
  const multiplier = PRICING_RULES.yourMarkup.multiplier;

  for (const product of products) {
    try {
      const costPrice = product.cost_price || product.amazon_price;
      if (!costPrice || costPrice <= 0) continue;

      const retailPrice = roundToTwo(costPrice * multiplier);
      const profitAmount = roundToTwo(retailPrice - costPrice);
      const profitPercent = roundToTwo((profitAmount / retailPrice) * 100);
      const competitors = generateCompetitorPrices(retailPrice);

      const { error } = await supabase
        .from('products')
        .update({
          retail_price: retailPrice,
          profit_amount: profitAmount,
          profit_percent: profitPercent,
          ...competitors,
          updated_at: new Date().toISOString(),
        })
        .eq('id', product.id);

      if (error) {
        errors.push(`${product.asin || product.id}: ${error.message}`);
      } else {
        updated++;
      }
    } catch (err) {
      errors.push(`${product.asin || product.id}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  return { updated, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. ENFORCE GRACE PERIOD
// Products below profitThresholds.minimum for > gracePeriodDays → auto-pause
// First infraction: set below_threshold_since timestamp
// After grace period: set status to 'paused', create margin_alert
// ═══════════════════════════════════════════════════════════════════════════

export async function enforceGracePeriod(): Promise<{
  flagged: number;
  paused: number;
  errors: string[];
}> {
  const thresholds = PRICING_RULES.profitThresholds;
  const graceDays = thresholds.gracePeriodDays;
  const minimumMargin = thresholds.minimum;
  let flagged = 0;
  let paused = 0;
  const errors: string[] = [];

  try {
    // Get all active products with pricing
    const { data: products, error: fetchErr } = await supabase
      .from('products')
      .select('id, asin, title, profit_percent, below_threshold_since, status')
      .in('status', ['active', 'pending'])
      .not('profit_percent', 'is', null);

    if (fetchErr) {
      errors.push(`Fetch error: ${fetchErr.message}`);
      return { flagged, paused, errors };
    }
    if (!products || products.length === 0) return { flagged, paused, errors };

    const now = new Date();
    const graceMs = graceDays * 24 * 60 * 60 * 1000;

    for (const product of products) {
      try {
        const margin = product.profit_percent as number;

        if (margin < minimumMargin) {
          if (!product.below_threshold_since) {
            // First time below threshold — start grace period
            await supabase
              .from('products')
              .update({ below_threshold_since: now.toISOString(), updated_at: now.toISOString() })
              .eq('id', product.id);
            flagged++;
            console.log(`[PricingExec] Flagged ${product.asin}: margin ${margin.toFixed(1)}% < ${minimumMargin}%`);
          } else {
            // Check if grace period expired
            const sinceDate = new Date(product.below_threshold_since);
            if (now.getTime() - sinceDate.getTime() > graceMs) {
              // Auto-pause
              await supabase
                .from('products')
                .update({ status: 'paused', updated_at: now.toISOString() })
                .eq('id', product.id);

              // Create margin alert
              await supabase.from('margin_alerts').insert({
                product_id: product.id,
                alert_type: 'auto_pause',
                alert_code: 'grace_period_expired',
                message: `Auto-paused: margin ${margin.toFixed(1)}% below ${minimumMargin}% for ${graceDays}+ days`,
                recommendation: `Review pricing or cost for ${product.title}`,
                is_resolved: false,
              }).then(({ error: alertErr }) => {
                if (alertErr) console.warn(`[PricingExec] Alert insert error:`, alertErr.message);
              });

              paused++;
              console.log(`[PricingExec] Auto-paused ${product.asin}: below threshold since ${product.below_threshold_since}`);
            }
          }
        } else if (product.below_threshold_since) {
          // Margin recovered — clear the flag
          await supabase
            .from('products')
            .update({ below_threshold_since: null, updated_at: now.toISOString() })
            .eq('id', product.id);
        }
      } catch (err) {
        errors.push(`Grace period ${product.asin}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }
  } catch (err) {
    errors.push(`Grace period system: ${err instanceof Error ? err.message : 'Unknown'}`);
  }

  return { flagged, paused, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. PUSH PRICES TO SHOPIFY
// Write price, compare_at_price, and competitor metafields via Admin API
// ═══════════════════════════════════════════════════════════════════════════

export async function pushPricesToShopify(products: PricingProduct[]): Promise<{
  pushed: number;
  errors: string[];
}> {
  let pushed = 0;
  const errors: string[] = [];

  if (!SHOPIFY_SHOP || !SHOPIFY_TOKEN) {
    return { pushed: 0, errors: ['Shopify credentials not configured'] };
  }

  const shopifyProducts = products.filter(p => p.shopify_product_id || p.shopify_id);

  for (const product of shopifyProducts) {
    try {
      const shopifyId = product.shopify_product_id || product.shopify_id;
      if (!shopifyId) continue;

      // Update product price via Shopify Admin API
      const shopifyUrl = `https://${SHOPIFY_SHOP}/admin/api/2024-01/products/${shopifyId}.json`;
      
      const updateBody: any = {
        product: {
          id: shopifyId,
          variants: [{
            price: product.retail_price?.toString() || '0',
            compare_at_price: product.compare_at_price?.toString() || null,
          }],
        },
      };

      const res = await fetch(shopifyUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        },
        body: JSON.stringify(updateBody),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown');
        errors.push(`Shopify ${product.asin}: HTTP ${res.status} — ${errText.slice(0, 100)}`);
        continue;
      }

      // Set competitor price metafields
      const metafields = [
        { namespace: 'competitor', key: 'amazon_price', value: (product.amazon_display_price || 0).toString(), type: 'number_decimal' },
        { namespace: 'competitor', key: 'costco_price', value: (product.costco_display_price || 0).toString(), type: 'number_decimal' },
        { namespace: 'competitor', key: 'ebay_price', value: (product.ebay_display_price || 0).toString(), type: 'number_decimal' },
        { namespace: 'competitor', key: 'sams_price', value: (product.sams_display_price || 0).toString(), type: 'number_decimal' },
        { namespace: 'inventory', key: 'cost', value: (product.cost_price || 0).toString(), type: 'number_decimal' },
        { namespace: 'inventory', key: 'profit_percent', value: (product.profit_percent || 0).toString(), type: 'number_decimal' },
      ];

      for (const mf of metafields) {
        const mfUrl = `https://${SHOPIFY_SHOP}/admin/api/2024-01/products/${shopifyId}/metafields.json`;
        await fetch(mfUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_TOKEN,
          },
          body: JSON.stringify({ metafield: mf }),
        }).catch(() => { /* non-fatal */ });
      }

      pushed++;
    } catch (err) {
      errors.push(`Shopify push ${product.asin}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  return { pushed, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. FULL PRICING CYCLE (called by price-sync cron)
// ═══════════════════════════════════════════════════════════════════════════

export async function executePricingCycle(): Promise<PricingCycleResult> {
  const startTime = Date.now();
  const result: PricingCycleResult = {
    processed: 0, pricesUpdated: 0, competitorPricesSet: 0,
    gracePeriodFlagged: 0, autoPaused: 0, shopifyPushed: 0,
    errors: [], duration_ms: 0,
  };

  try {
    // 1. Fetch all products with cost prices
    const { data: products, error: fetchErr } = await supabase
      .from('products')
      .select('id, asin, title, cost_price, retail_price, amazon_price, profit_percent, profit_amount, status, below_threshold_since, shopify_product_id, shopify_id, amazon_display_price, costco_display_price, ebay_display_price, sams_display_price, compare_at_price, updated_at')
      .not('cost_price', 'is', null)
      .in('status', ['active', 'pending', 'draft']);

    if (fetchErr) {
      result.errors.push(`Fetch: ${fetchErr.message}`);
      result.duration_ms = Date.now() - startTime;
      return result;
    }

    if (!products || products.length === 0) {
      result.duration_ms = Date.now() - startTime;
      return result;
    }

    result.processed = products.length;
    console.log(`[PricingExec] Processing ${products.length} products`);

    // 2. Apply pricing rules
    const pricingResult = await applyPricingRules(products as PricingProduct[]);
    result.pricesUpdated = pricingResult.updated;
    result.competitorPricesSet = pricingResult.updated;
    result.errors.push(...pricingResult.errors);

    // 3. Enforce grace period
    const graceResult = await enforceGracePeriod();
    result.gracePeriodFlagged = graceResult.flagged;
    result.autoPaused = graceResult.paused;
    result.errors.push(...graceResult.errors);

    // 4. Push to Shopify (re-fetch updated prices)
    const { data: updatedProducts } = await supabase
      .from('products')
      .select('id, asin, title, cost_price, retail_price, amazon_price, profit_percent, profit_amount, status, below_threshold_since, shopify_product_id, shopify_id, amazon_display_price, costco_display_price, ebay_display_price, sams_display_price, compare_at_price, updated_at')
      .not('cost_price', 'is', null)
      .in('status', ['active']);

    if (updatedProducts && updatedProducts.length > 0) {
      const shopifyResult = await pushPricesToShopify(updatedProducts as PricingProduct[]);
      result.shopifyPushed = shopifyResult.pushed;
      result.errors.push(...shopifyResult.errors);
    }

    // 5. Record price history
    await supabase.from('price_history').insert(
      (products as PricingProduct[])
        .filter(p => p.cost_price)
        .slice(0, 50) // Cap to avoid huge inserts
        .map(p => ({
          product_id: p.id,
          amazon_price: p.amazon_price,
          our_price: p.retail_price,
          competitor_price: p.amazon_display_price,
          margin_percent: p.profit_percent,
          source: 'pricing_cycle',
          recorded_at: new Date().toISOString(),
        }))
    ).then(({ error: histErr }) => {
      if (histErr) console.warn('[PricingExec] Price history insert:', histErr.message);
    });

  } catch (err) {
    result.errors.push(`System: ${err instanceof Error ? err.message : 'Unknown'}`);
  }

  result.duration_ms = Date.now() - startTime;
  console.log(`[PricingExec] Cycle complete: ${result.pricesUpdated} prices, ${result.autoPaused} paused, ${result.shopifyPushed} pushed (${result.duration_ms}ms)`);
  return result;
}

export default {
  applyPricingRules,
  enforceGracePeriod,
  pushPricesToShopify,
  executePricingCycle,
};
