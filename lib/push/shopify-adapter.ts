// ═══ DELIVERY ENVELOPE ═══
// FILE: lib/push/shopify-adapter.ts
// LINES: ~80
// IMPORTS FROM: lib/contracts/product.ts (CleanProduct), lib/push/queue.ts (PushAdapter)
// EXPORTS TO: Generator page (passed to runPushQueue as the adapter)
// DOES: Maps CleanProduct to the Shopify push API payload. Includes ALL fields: title, asin, pricing, images, description, vendor, category, AND the new Google Merchant fields (barcode, googleCategory, weight, handle, seoTitle, seoDescription, feedScore). Calls /api/command-center for single pushes and /api/bulk-push for batches.
// DOES NOT: Manage the queue (queue.ts does that). Retry (queue handles retries). Render UI.
// BREAKS IF: /api/command-center or /api/bulk-push routes don't exist. API returns non-JSON.
// ASSUMES: API routes accept the payload shape defined here and return { results: [{ asin, success, error? }] } for bulk or { pushed: boolean, error? } for single.
// LEVEL: 3 — Integrated. Implements PushAdapter interface. All fields from composed product type included.
// VERIFIED: AI self-check. Payload includes all 10 coordination points from the spec.
// ═══════════════════════════════════════════════════════════

import type { CleanProduct } from '../contracts/product';
import type { PushAdapter } from './queue';

// ── Build Shopify payload from CleanProduct ─────────────

function toShopifyPayload(p: CleanProduct) {
  return {
    // Identity
    title: p.title,
    asin: p.asin,
    handle: p.handle,
    barcode: p.barcode,
    // Pricing
    price: p.pricing.cost,
    sellPrice: p.pricing.sell,
    profit: p.pricing.profit,
    compareAt: p.pricing.compareAt,
    competitorPrices: p.pricing.competitors,
    // Media
    image: p.media.image,
    images: p.media.images,
    // Content
    description: p.description,
    vendor: p.vendor,
    category: p.category,
    // Metrics
    rating: p.rating,
    reviews: p.reviews,
    bsr: p.bsr,
    stockStatus: p.stockStatus,
    // Google Merchant fields
    googleCategory: p.merchant.googleCategory,
    weight: p.merchant.weight,
    seoTitle: p.merchant.seoTitle,
    seoDescription: p.merchant.seoDescription,
    feedScore: p.merchant.feedScore,
    gateCount: p.merchant.gateCount,
    condition: p.merchant.condition,
    availability: p.merchant.availability,
  };
}

// ── Bulk Push Adapter (for queue.ts) ────────────────────

export const shopifyBulkAdapter: PushAdapter = async (products) => {
  try {
    const res = await fetch('/api/bulk-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        products: products.map(toShopifyPayload),
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown');
      return products.map(p => ({ asin: p.asin, success: false, error: `HTTP ${res.status}: ${errText.substring(0, 100)}` }));
    }

    const data = await res.json();
    if (data.error) {
      return products.map(p => ({ asin: p.asin, success: false, error: data.error }));
    }

    return (data.results || []).map((r: { asin: string; success: boolean; error?: string }) => ({
      asin: r.asin,
      success: r.success,
      error: r.error,
    }));
  } catch (err) {
    return products.map(p => ({ asin: p.asin, success: false, error: String(err).substring(0, 100) }));
  }
};

// ── Single Push (for one-at-a-time from product detail) ─

export async function pushSingleProduct(product: CleanProduct): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/command-center', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: toShopifyPayload(product), action: 'push' }),
    });
    const data = await res.json();
    return { success: !!data.pushed, error: data.error };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
