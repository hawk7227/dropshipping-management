// app/api/shopify-push/route.ts
// ============================================================================
// STANDALONE Shopify Push API — ZERO dependencies on lib/
// Reads from Supabase → Pushes to Shopify → Updates Supabase with Shopify IDs
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

function getShopifyConfig() {
  const store = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  return { store, token, ok: !!(store && token) };
}

const MARKUP = 1.70;
const RANGES = {
  amazon: { min: 1.82, max: 1.88 },
  costco: { min: 1.80, max: 1.85 },
  ebay:   { min: 1.87, max: 1.93 },
  sams:   { min: 1.80, max: 1.83 },
};
const rand = (lo: number, hi: number) => +(lo + Math.random() * (hi - lo)).toFixed(2);

// GET — list all products for the push UI
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

// POST — push selected products to Shopify
export async function POST(request: NextRequest) {
  const results: Array<{ id: string; title: string; success: boolean; shopifyId?: string; error?: string }> = [];
  try {
    const sh = getShopifyConfig();
    if (!sh.ok) {
      return NextResponse.json({ success: false, error: 'Shopify not configured. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN.' }, { status: 400 });
    }
    const sb = getSupabase();
    const { productIds } = await request.json();
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ success: false, error: 'productIds[] required' }, { status: 400 });
    }

    const API = '2024-01';
    const hdr = { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': sh.token! };
    const base = `https://${sh.store}/admin/api/${API}`;

    const { data: products, error: fetchErr } = await sb.from('products').select('*').in('id', productIds);
    if (fetchErr) return NextResponse.json({ success: false, error: fetchErr.message }, { status: 500 });
    if (!products || products.length === 0) return NextResponse.json({ success: false, error: 'No products found' }, { status: 404 });

    for (const p of products) {
      try {
        const asin = p.asin || p.source_product_id || p.sku || '';
        const cost = p.cost_price || p.amazon_price || p.current_price || 0;
        const sell = p.retail_price || +(cost * MARKUP).toFixed(2);
        const ad = +(sell * rand(RANGES.amazon.min, RANGES.amazon.max)).toFixed(2);
        const cd = +(sell * rand(RANGES.costco.min, RANGES.costco.max)).toFixed(2);
        const ed = +(sell * rand(RANGES.ebay.min, RANGES.ebay.max)).toFixed(2);
        const sd = +(sell * rand(RANGES.sams.min, RANGES.sams.max)).toFixed(2);
        const compareAt = Math.max(ad, cd, ed, sd);
        const supUrl = asin && /^B[A-Z0-9]{9}$/.test(asin) ? `https://www.amazon.com/dp/${asin}` : (p.source_url || '');

        // Images
        const imgs: { src: string }[] = [];
        if (p.main_image) imgs.push({ src: p.main_image });
        else if (p.image_url) imgs.push({ src: p.image_url });
        if (Array.isArray(p.images)) {
          for (const img of p.images.slice(0, 5)) {
            const s = typeof img === 'string' ? img : img?.src;
            if (s && !imgs.find(i => i.src === s)) imgs.push({ src: s });
          }
        }

        const tags = Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags || '');

        const payload: any = {
          product: {
            title: p.title,
            body_html: p.description || p.body_html || '',
            vendor: p.vendor || p.brand || '',
            product_type: p.product_type || p.category || '',
            tags,
            variants: [{ price: String(sell), compare_at_price: String(compareAt), sku: asin, inventory_management: 'shopify', inventory_quantity: p.inventory_quantity ?? 999, requires_shipping: true }],
            images: imgs,
            metafields: [
              { namespace: 'custom', key: 'asin', value: asin, type: 'single_line_text_field' },
              { namespace: 'custom', key: 'supplier_url', value: supUrl, type: 'url' },
              { namespace: 'custom', key: 'amazon_price', value: String(cost), type: 'number_decimal' },
              { namespace: 'comparisons', key: 'price_amazon', value: String(ad), type: 'number_decimal' },
              { namespace: 'comparisons', key: 'price_costco', value: String(cd), type: 'number_decimal' },
              { namespace: 'comparisons', key: 'price_ebay', value: String(ed), type: 'number_decimal' },
              { namespace: 'comparisons', key: 'price_samsclub', value: String(sd), type: 'number_decimal' },
            ].filter(m => m.value && m.value !== '0' && m.value !== ''),
          },
        };

        let res: Response;
        if (p.shopify_product_id) {
          // UPDATE
          const up = JSON.parse(JSON.stringify(payload));
          const mfs = up.product.metafields;
          delete up.product.metafields;
          if (p.shopify_variant_id) up.product.variants[0].id = p.shopify_variant_id;
          res = await fetch(`${base}/products/${p.shopify_product_id}.json`, { method: 'PUT', headers: hdr, body: JSON.stringify(up) });
          if (res.ok && mfs?.length) {
            for (const mf of mfs) {
              try { await fetch(`${base}/products/${p.shopify_product_id}/metafields.json`, { method: 'POST', headers: hdr, body: JSON.stringify({ metafield: { ...mf, owner_id: p.shopify_product_id, owner_resource: 'product' } }) }); } catch (_) {}
            }
          }
        } else {
          // CREATE
          res = await fetch(`${base}/products.json`, { method: 'POST', headers: hdr, body: JSON.stringify(payload) });
        }

        if (!res.ok) {
          const errText = await res.text();
          results.push({ id: p.id, title: p.title, success: false, error: `Shopify ${res.status}: ${errText.substring(0, 300)}` });
          // Rate limit hit — back off
          if (res.status === 429) await new Promise(r => setTimeout(r, 5000));
          continue;
        }

        const sData = await res.json();
        const sId = sData.product?.id;
        const svId = sData.product?.variants?.[0]?.id;

        if (sId) {
          await sb.from('products').update({
            shopify_product_id: String(sId),
            shopify_variant_id: svId ? String(svId) : null,
            shopify_synced_at: new Date().toISOString(),
            retail_price: sell,
            compare_at_price: compareAt,
            amazon_display_price: ad,
            costco_display_price: cd,
            ebay_display_price: ed,
            sams_display_price: sd,
            updated_at: new Date().toISOString(),
          }).eq('id', p.id);
        }

        results.push({ id: p.id, title: p.title, success: true, shopifyId: sId ? String(sId) : undefined });
        await new Promise(r => setTimeout(r, 500)); // rate limit
      } catch (e) {
        results.push({ id: p.id, title: p.title, success: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    const ok = results.filter(r => r.success).length;
    return NextResponse.json({ success: true, data: { total: results.length, succeeded: ok, failed: results.length - ok, results, message: `Pushed ${ok}/${results.length} products to Shopify` } });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err), results }, { status: 500 });
  }
}
