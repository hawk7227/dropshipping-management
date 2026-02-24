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

const YOUR_MARKUP = 1.70;
const COMPETITOR_RANGES = {
  amazon: { min: 1.82, max: 1.88 },
  costco: { min: 1.80, max: 1.85 },
  ebay: { min: 1.87, max: 1.93 },
};
const MIN_INVENTORY = 50;
const rand = (lo: number, hi: number) => +(lo + Math.random() * (hi - lo)).toFixed(2);

interface ProductInput {
  title: string; asin: string; price: number; sellPrice: number; profit: number;
  image: string; description: string; vendor: string; category: string;
  rating: number; reviews: number; bsr: number; stockStatus: string;
}

// POST /api/command-center — save + push enriched products
export async function POST(request: NextRequest) {
  try {
    const { products, action } = await request.json() as { products: ProductInput[]; action: 'save' | 'push' };

    if (!products?.length) return NextResponse.json({ error: 'No products' }, { status: 400 });

    const sb = getSupabase();
    const saved: string[] = [];
    const errors: string[] = [];

    // Save to Supabase
    for (const p of products) {
      if (!p.title || !p.image || !p.asin) {
        errors.push(`${p.asin}: missing title/image/asin`);
        continue;
      }

      try {
        // Check if ASIN already exists
        const { data: existing } = await sb.from('products')
          .select('id')
          .or(`asin.eq.${p.asin},source_product_id.eq.${p.asin},sku.eq.${p.asin}`)
          .limit(1);

        if (existing?.length) {
          // Update existing
          await sb.from('products').update({
            title: p.title,
            main_image: p.image,
            description: p.description,
            body_html: p.description,
            vendor: p.vendor,
            product_type: p.category,
            cost_price: p.price,
            retail_price: p.sellPrice,
            current_price: p.price,
            amazon_price: p.price,
            updated_at: new Date().toISOString(),
          }).eq('id', existing[0].id);
          saved.push(existing[0].id);
        } else {
          // Create new
          const id = crypto.randomUUID();
          const { error } = await sb.from('products').insert({
            id,
            title: p.title,
            handle: p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 80),
            asin: p.asin,
            source_product_id: p.asin,
            sku: p.asin,
            main_image: p.image,
            images: [{ src: p.image }],
            description: p.description,
            body_html: p.description,
            vendor: p.vendor || '',
            product_type: p.category || '',
            brand: p.vendor || '',
            tags: [p.bsr > 0 ? `BSR:${p.bsr}` : '', p.rating > 0 ? `Rating:${p.rating}` : '', 'command-center'].filter(Boolean),
            status: 'draft',
            cost_price: p.price,
            retail_price: p.sellPrice,
            current_price: p.price,
            amazon_price: p.price,
            inventory_quantity: MIN_INVENTORY,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          if (error) { errors.push(`${p.asin}: ${error.message}`); continue; }
          saved.push(id);
        }
      } catch (e) {
        errors.push(`${p.asin}: ${String(e)}`);
      }
    }

    if (action === 'save') {
      return NextResponse.json({ success: true, saved: saved.length, errors, ids: saved });
    }

    // Push to Shopify
    const sh = getShopifyConfig();
    if (!sh.ok) return NextResponse.json({ success: true, saved: saved.length, errors, shopifyError: 'Shopify not configured' });

    const API = '2024-01';
    const hdr = { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': sh.token! };
    const base = `https://${sh.store}/admin/api/${API}`;

    // Get location ID
    let locationId: string | null = null;
    try {
      const locRes = await fetch(`${base}/locations.json`, { headers: hdr });
      if (locRes.ok) { const d = await locRes.json(); locationId = d.locations?.[0]?.id ? String(d.locations[0].id) : null; }
    } catch (_) {}

    const pushed: string[] = [];
    const pushErrors: string[] = [];

    // Fetch saved products from Supabase
    const { data: dbProducts } = await sb.from('products').select('*').in('id', saved);

    for (const p of (dbProducts || [])) {
      try {
        const amazonCost = p.cost_price || p.amazon_price || 0;
        const yourPrice = p.retail_price || +(amazonCost * YOUR_MARKUP).toFixed(2);
        const compAmazon = +(yourPrice * rand(COMPETITOR_RANGES.amazon.min, COMPETITOR_RANGES.amazon.max)).toFixed(2);
        const compCostco = +(yourPrice * rand(COMPETITOR_RANGES.costco.min, COMPETITOR_RANGES.costco.max)).toFixed(2);
        const compEbay = +(yourPrice * rand(COMPETITOR_RANGES.ebay.min, COMPETITOR_RANGES.ebay.max)).toFixed(2);
        const compareAt = Math.max(compAmazon, compCostco, compEbay);

        const imgs: { src: string }[] = [];
        if (p.main_image) imgs.push({ src: p.main_image });

        const payload = {
          product: {
            title: p.title,
            body_html: p.description || p.body_html || p.title,
            vendor: p.vendor || p.brand || '',
            product_type: p.product_type || p.category || '',
            tags: Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags || ''),
            status: 'active',
            variants: [{
              price: String(yourPrice),
              compare_at_price: String(compareAt),
              sku: p.asin || p.source_product_id || '',
              cost: String(amazonCost),
              inventory_management: 'shopify',
              inventory_quantity: MIN_INVENTORY,
              requires_shipping: true, taxable: true,
            }],
            images: imgs,
            metafields: [
              { namespace: 'comparisons', key: 'price_amazon', value: String(compAmazon), type: 'number_decimal' },
              { namespace: 'comparisons', key: 'price_costco', value: String(compCostco), type: 'number_decimal' },
              { namespace: 'comparisons', key: 'price_ebay', value: String(compEbay), type: 'number_decimal' },
            ],
          },
        };

        let res: Response;
        if (p.shopify_product_id) {
          const up = JSON.parse(JSON.stringify(payload));
          delete up.product.metafields;
          res = await fetch(`${base}/products/${p.shopify_product_id}.json`, { method: 'PUT', headers: hdr, body: JSON.stringify(up) });
          if (!res.ok && res.status === 404) {
            res = await fetch(`${base}/products.json`, { method: 'POST', headers: hdr, body: JSON.stringify(payload) });
          }
        } else {
          res = await fetch(`${base}/products.json`, { method: 'POST', headers: hdr, body: JSON.stringify(payload) });
        }

        if (!res.ok) {
          const err = await res.text();
          pushErrors.push(`${p.asin}: Shopify ${res.status}: ${err.substring(0, 150)}`);
          if (res.status === 429) await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        const sData = await res.json();
        const sId = sData.product?.id;
        const svId = sData.product?.variants?.[0]?.id;

        // Update Supabase with Shopify IDs
        await sb.from('products').update({
          shopify_product_id: sId ? String(sId) : null,
          shopify_variant_id: svId ? String(svId) : null,
          status: 'active',
          updated_at: new Date().toISOString(),
        }).eq('id', p.id);

        // Set inventory
        const invItemId = sData.product?.variants?.[0]?.inventory_item_id;
        if (invItemId && locationId) {
          try {
            await fetch(`${base}/inventory_items/${invItemId}.json`, {
              method: 'PUT', headers: hdr,
              body: JSON.stringify({ inventory_item: { id: invItemId, cost: String(amazonCost) } }),
            });
            await fetch(`${base}/inventory_levels/set.json`, {
              method: 'POST', headers: hdr,
              body: JSON.stringify({ location_id: locationId, inventory_item_id: invItemId, available: MIN_INVENTORY }),
            });
          } catch (_) {}
        }

        pushed.push(p.id);

        // Rate limit: 2 per second for Shopify
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        pushErrors.push(`${p.asin}: ${String(e)}`);
      }
    }

    return NextResponse.json({
      success: true,
      saved: saved.length,
      pushed: pushed.length,
      errors: [...errors, ...pushErrors],
      ids: saved,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
