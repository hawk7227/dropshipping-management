// app/api/shopify-push/route.ts
// ============================================================================
// STANDALONE Shopify Push API
// Pricing Logic (from lib/config/pricing-rules.ts):
//   - Amazon cost = what you pay on Amazon
//   - Your price = Amazon cost × 1.70 (70% markup)
//   - Competitor prices = Your price × competitor range multipliers
//   - Compare-at price = HIGHEST of the 3 competitor prices (Amazon, Costco, eBay)
//   - Shopify Cost = Amazon cost (so Shopify calculates Profit & Margin)
//   - Inventory = minimum 50 units
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase config');
  return createClient(url, key);
}

function getShopifyConfig() {
  const store = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  return { store, token, ok: !!(store && token) };
}

// ── PRICING RULES (from lib/config/pricing-rules.ts) ────────────────
const YOUR_MARKUP = 1.70; // 70% markup on Amazon cost

const COMPETITOR_RANGES = {
  amazon: { min: 1.82, max: 1.88 }, // 82-88% higher than YOUR price
  costco: { min: 1.80, max: 1.85 }, // 80-85% higher
  ebay:   { min: 1.87, max: 1.93 }, // 87-93% higher
};

const MIN_INVENTORY = 50; // Minimum inventory when pushing to Shopify

const rand = (lo: number, hi: number) => +(lo + Math.random() * (hi - lo)).toFixed(2);

// ── GET: list products ──────────────────────────────────────────────
export async function GET() {
  try {
    const sb = getSupabase();
    const sh = getShopifyConfig();
    const { data, error, count } = await sb
      .from('products')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      products: data || [],
      total: count || 0,
      shopifyConfigured: sh.ok,
      shopifyStore: sh.store || null,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// ── POST: push products to Shopify ──────────────────────────────────
export async function POST(request: NextRequest) {
  const results: Array<{ id: string; title: string; success: boolean; shopifyId?: string; error?: string }> = [];

  try {
    const sh = getShopifyConfig();
    if (!sh.ok) {
      return NextResponse.json({ success: false, error: 'Shopify not configured.' }, { status: 400 });
    }

    const sb = getSupabase();
    const { productIds, forceCreate } = await request.json();

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ success: false, error: 'productIds[] required' }, { status: 400 });
    }

    if (forceCreate) {
      await sb.from('products').update({ shopify_product_id: null, shopify_variant_id: null }).in('id', productIds);
    }

    const API = '2024-01';
    const hdr = { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': sh.token! };
    const base = `https://${sh.store}/admin/api/${API}`;

    // Get location ID once (needed for inventory)
    let locationId: string | null = null;
    try {
      const locRes = await fetch(`${base}/locations.json`, { headers: hdr });
      if (locRes.ok) {
        const locData = await locRes.json();
        locationId = locData.locations?.[0]?.id ? String(locData.locations[0].id) : null;
      }
    } catch (_) {}

    // Fetch products
    const { data: products, error: fetchErr } = await sb.from('products').select('*').in('id', productIds);
    if (fetchErr) return NextResponse.json({ success: false, error: fetchErr.message }, { status: 500 });
    if (!products?.length) return NextResponse.json({ success: false, error: 'No products found' }, { status: 404 });

    for (const p of products) {
      try {
        // ── PRICING ─────────────────────────────────────────────
        const asin = p.asin || p.source_product_id || p.sku || '';

        // Amazon cost = what you pay (the source/supplier price)
        const amazonCost = p.cost_price || p.amazon_price || p.current_price || 0;

        // Your sell price = Amazon cost × 1.70 markup
        const yourPrice = p.retail_price || +(amazonCost * YOUR_MARKUP).toFixed(2);

        // Competitor display prices = YOUR price × competitor multiplier
        // These are what customers see as "other store prices"
        const competitorAmazon = +(yourPrice * rand(COMPETITOR_RANGES.amazon.min, COMPETITOR_RANGES.amazon.max)).toFixed(2);
        const competitorCostco = +(yourPrice * rand(COMPETITOR_RANGES.costco.min, COMPETITOR_RANGES.costco.max)).toFixed(2);
        const competitorEbay   = +(yourPrice * rand(COMPETITOR_RANGES.ebay.min, COMPETITOR_RANGES.ebay.max)).toFixed(2);

        // Compare-at price = HIGHEST of the 3 competitor prices
        const compareAtPrice = Math.max(competitorAmazon, competitorCostco, competitorEbay);

        // Profit calculation
        const profitAmount = yourPrice - amazonCost;
        const profitMargin = amazonCost > 0 ? ((profitAmount / yourPrice) * 100) : 0;

        // ── IMAGES ──────────────────────────────────────────────
        const imgs: { src: string }[] = [];
        if (p.main_image) imgs.push({ src: p.main_image });
        else if (p.image_url) imgs.push({ src: p.image_url });
        if (Array.isArray(p.images)) {
          for (const img of p.images.slice(0, 5)) {
            const s = typeof img === 'string' ? img : img?.src;
            if (s && !imgs.find(i => i.src === s)) imgs.push({ src: s });
          }
        }

        // ── TAGS ────────────────────────────────────────────────
        const tags = Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags || '');

        // ── DESCRIPTION ─────────────────────────────────────────
        // Use real description, not "Imported product with ASIN"
        let description = p.description || p.body_html || '';
        if (description.startsWith('Imported product with ASIN') || !description.trim()) {
          description = p.title || ''; // Fallback to title if no real description
        }

        // ── SHOPIFY PAYLOAD ─────────────────────────────────────
        const payload: any = {
          product: {
            title: p.title,
            body_html: description,
            vendor: p.vendor || p.brand || '',
            product_type: p.product_type || p.category || '',
            tags,
            status: 'active',
            variants: [{
              price: String(yourPrice),
              compare_at_price: String(compareAtPrice),
              sku: asin,
              cost: String(amazonCost), // THIS sets the Cost in Shopify so Profit & Margin calculate
              inventory_management: 'shopify',
              inventory_quantity: Math.max(p.inventory_quantity || 0, MIN_INVENTORY),
              requires_shipping: true,
              taxable: true,
            }],
            images: imgs,
          },
        };

        // ── SEND TO SHOPIFY ─────────────────────────────────────
        let res: Response;

        if (p.shopify_product_id) {
          const up = JSON.parse(JSON.stringify(payload));
          if (p.shopify_variant_id) up.product.variants[0].id = p.shopify_variant_id;
          res = await fetch(`${base}/products/${p.shopify_product_id}.json`, { method: 'PUT', headers: hdr, body: JSON.stringify(up) });
        } else {
          res = await fetch(`${base}/products.json`, { method: 'POST', headers: hdr, body: JSON.stringify(payload) });
        }

        // 404 = stale Shopify ID, retry as CREATE
        if (!res.ok && res.status === 404 && p.shopify_product_id) {
          await sb.from('products').update({ shopify_product_id: null, shopify_variant_id: null }).eq('id', p.id);
          res = await fetch(`${base}/products.json`, { method: 'POST', headers: hdr, body: JSON.stringify(payload) });
        }

        if (!res.ok) {
          const errText = await res.text();
          results.push({ id: p.id, title: p.title, success: false, error: `Shopify ${res.status}: ${errText.substring(0, 300)}` });
          if (res.status === 429) await new Promise(r => setTimeout(r, 5000));
          continue;
        }

        const sData = await res.json();
        const sId = sData.product?.id;
        const svId = sData.product?.variants?.[0]?.id;
        const inventoryItemId = sData.product?.variants?.[0]?.inventory_item_id;

        // ── SET INVENTORY at location level ──────────────────────
        if (inventoryItemId && locationId) {
          try {
            // Set the cost on the inventory item (backup method)
            await fetch(`${base}/inventory_items/${inventoryItemId}.json`, {
              method: 'PUT',
              headers: hdr,
              body: JSON.stringify({
                inventory_item: {
                  id: inventoryItemId,
                  cost: String(amazonCost),
                },
              }),
            });

            // Set available inventory
            await fetch(`${base}/inventory_levels/set.json`, {
              method: 'POST',
              headers: hdr,
              body: JSON.stringify({
                location_id: locationId,
                inventory_item_id: inventoryItemId,
                available: Math.max(p.inventory_quantity || 0, MIN_INVENTORY),
              }),
            });
          } catch (invErr) {
            console.warn(`[ShopifyPush] Inventory set failed for ${p.title}:`, invErr);
          }
        }

        // ── UPDATE SUPABASE ─────────────────────────────────────
        if (sId) {
          await sb.from('products').update({
            shopify_product_id: String(sId),
            shopify_variant_id: svId ? String(svId) : null,
            shopify_synced_at: new Date().toISOString(),
            cost_price: amazonCost,
            retail_price: yourPrice,
            compare_at_price: compareAtPrice,
            profit_amount: +profitAmount.toFixed(2),
            profit_margin: +profitMargin.toFixed(2),
            profit_percent: +profitMargin.toFixed(2),
            amazon_display_price: competitorAmazon,
            costco_display_price: competitorCostco,
            ebay_display_price: competitorEbay,
            updated_at: new Date().toISOString(),
          }).eq('id', p.id);
        }

        results.push({ id: p.id, title: p.title, success: true, shopifyId: sId ? String(sId) : undefined });
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        results.push({ id: p.id, title: p.title, success: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    const ok = results.filter(r => r.success).length;
    return NextResponse.json({
      success: true,
      data: { total: results.length, succeeded: ok, failed: results.length - ok, results, message: `Pushed ${ok}/${results.length} to Shopify` },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err), results }, { status: 500 });
  }
}
