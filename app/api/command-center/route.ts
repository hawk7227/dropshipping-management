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
const COMP = { amazon: { min: 1.82, max: 1.88 }, costco: { min: 1.80, max: 1.85 }, ebay: { min: 1.87, max: 1.93 } };
const rand = (lo: number, hi: number) => +(lo + Math.random() * (hi - lo)).toFixed(2);

// POST: push ONE product at a time (frontend loops)
// Body: { product: {...}, action: 'push' | 'save' }
export async function POST(request: NextRequest) {
  try {
    const { product: p, action } = await request.json();
    if (!p?.title || !p?.image || !p?.asin) {
      return NextResponse.json({ error: `Missing required fields: ${!p?.title ? 'title' : !p?.image ? 'image' : 'asin'}` }, { status: 400 });
    }

    const sb = getSupabase();

    // Upsert to Supabase
    const { data: existing } = await sb.from('products')
      .select('id, shopify_product_id')
      .or(`asin.eq.${p.asin},source_product_id.eq.${p.asin}`)
      .limit(1);

    let dbId: string;
    let shopifyProductId: string | null = null;

    if (existing?.length) {
      dbId = existing[0].id;
      shopifyProductId = existing[0].shopify_product_id || null;
      await sb.from('products').update({
        title: p.title, main_image: p.image, description: p.description, body_html: p.description,
        vendor: p.vendor, product_type: p.category, cost_price: p.price, retail_price: p.sellPrice,
        current_price: p.price, amazon_price: p.price, images: [{ src: p.image }],
        updated_at: new Date().toISOString(),
      }).eq('id', dbId);
    } else {
      dbId = crypto.randomUUID();
      const { error } = await sb.from('products').insert({
        id: dbId, title: p.title, handle: p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 80),
        asin: p.asin, source_product_id: p.asin, sku: p.asin,
        main_image: p.image, images: [{ src: p.image }],
        description: p.description, body_html: p.description,
        vendor: p.vendor || '', product_type: p.category || '', brand: p.vendor || '',
        tags: ['command-center', p.bsr > 0 ? `BSR:${p.bsr}` : ''].filter(Boolean),
        status: 'draft', cost_price: p.price, retail_price: p.sellPrice,
        current_price: p.price, amazon_price: p.price, inventory_quantity: 50,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      if (error) return NextResponse.json({ error: `DB: ${error.message}`, saved: false }, { status: 500 });
    }

    if (action === 'save') {
      return NextResponse.json({ success: true, saved: true, pushed: false, dbId });
    }

    // Push to Shopify
    const sh = getShopifyConfig();
    if (!sh.ok) return NextResponse.json({ success: true, saved: true, pushed: false, error: 'Shopify not configured', dbId });

    const cost = p.price;
    const sell = p.sellPrice || +(cost * YOUR_MARKUP).toFixed(2);
    const compA = +(sell * rand(COMP.amazon.min, COMP.amazon.max)).toFixed(2);
    const compC = +(sell * rand(COMP.costco.min, COMP.costco.max)).toFixed(2);
    const compE = +(sell * rand(COMP.ebay.min, COMP.ebay.max)).toFixed(2);
    const compareAt = Math.max(compA, compC, compE);

    const API = '2024-01';
    const hdr = { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': sh.token! };
    const base = `https://${sh.store}/admin/api/${API}`;

    const payload = {
      product: {
        title: p.title,
        body_html: p.description || p.title,
        vendor: p.vendor || '', product_type: p.category || '',
        tags: ['command-center', p.bsr > 0 ? `BSR:${p.bsr}` : ''].filter(Boolean).join(', '),
        status: 'active',
        variants: [{
          price: String(sell), compare_at_price: String(compareAt),
          sku: p.asin, cost: String(cost),
          inventory_management: 'shopify', inventory_quantity: 50,
          requires_shipping: true, taxable: true,
        }],
        images: [{ src: p.image }],
        metafields: [
          { namespace: 'comparisons', key: 'price_amazon', value: String(compA), type: 'number_decimal' },
          { namespace: 'comparisons', key: 'price_costco', value: String(compC), type: 'number_decimal' },
          { namespace: 'comparisons', key: 'price_ebay', value: String(compE), type: 'number_decimal' },
        ],
      },
    };

    let res: Response;
    if (shopifyProductId) {
      const up = JSON.parse(JSON.stringify(payload));
      delete up.product.metafields;
      res = await fetch(`${base}/products/${shopifyProductId}.json`, { method: 'PUT', headers: hdr, body: JSON.stringify(up) });
      if (!res.ok && res.status === 404) {
        res = await fetch(`${base}/products.json`, { method: 'POST', headers: hdr, body: JSON.stringify(payload) });
      }
    } else {
      res = await fetch(`${base}/products.json`, { method: 'POST', headers: hdr, body: JSON.stringify(payload) });
    }

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ success: true, saved: true, pushed: false, error: `Shopify ${res.status}: ${err.substring(0, 200)}`, dbId });
    }

    const sData = await res.json();
    const sId = sData.product?.id;
    const svId = sData.product?.variants?.[0]?.id;

    await sb.from('products').update({
      shopify_product_id: sId ? String(sId) : null,
      shopify_variant_id: svId ? String(svId) : null,
      status: 'active', updated_at: new Date().toISOString(),
    }).eq('id', dbId);

    return NextResponse.json({ success: true, saved: true, pushed: true, dbId, shopifyId: sId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
