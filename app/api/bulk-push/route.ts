import { NextRequest, NextResponse } from 'next/server';

// Shopify REST API: 40-request bucket, 2/sec leak rate
// Strategy: receive up to 5 products, push sequentially with minimal delay
// Frontend fires multiple of these in parallel (controlled concurrency)

function getShopifyConfig() {
  const store = process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_SHOP_DOMAIN || process.env.NEXT_PUBLIC_SHOPIFY_SHOP_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
  return { store, token, ok: !!(store && token) };
}

const MARKUP = 1.70;
const COMP = { amazon: { min: 1.82, max: 1.88 }, costco: { min: 1.80, max: 1.85 }, ebay: { min: 1.87, max: 1.93 } };
const rand = (lo: number, hi: number) => +(lo + Math.random() * (hi - lo)).toFixed(2);

interface PushProduct {
  title: string; asin: string; price: number; sellPrice?: number;
  image: string; description?: string; vendor?: string; category?: string;
  rating?: number; reviews?: number; bsr?: number;
}

interface PushResult {
  asin: string; success: boolean; shopifyId?: string; error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { products } = await request.json() as { products: PushProduct[] };
    if (!products?.length) return NextResponse.json({ error: 'No products provided' }, { status: 400 });

    const sh = getShopifyConfig();
    if (!sh.ok) return NextResponse.json({ error: 'Shopify not configured' }, { status: 500 });

    const API = '2024-01';
    const hdr = { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': sh.token! };
    const base = `https://${sh.store}/admin/api/${API}`;

    const results: PushResult[] = [];

    for (const p of products) {
      if (!p.title || !p.image || !p.asin) {
        results.push({ asin: p.asin || 'unknown', success: false, error: 'Missing title/image/asin' });
        continue;
      }

      try {
        const cost = p.price;
        const sell = p.sellPrice || +(cost * MARKUP).toFixed(2);
        const compA = +(sell * rand(COMP.amazon.min, COMP.amazon.max)).toFixed(2);
        const compC = +(sell * rand(COMP.costco.min, COMP.costco.max)).toFixed(2);
        const compE = +(sell * rand(COMP.ebay.min, COMP.ebay.max)).toFixed(2);
        const compareAt = Math.max(compA, compC, compE);

        const payload = {
          product: {
            title: p.title,
            body_html: p.description || p.title,
            vendor: p.vendor || '',
            product_type: p.category || '',
            tags: ['command-center', 'bulk-push', p.bsr && p.bsr > 0 ? `BSR:${p.bsr}` : ''].filter(Boolean).join(', '),
            status: 'active',
            variants: [{
              price: String(sell),
              compare_at_price: String(compareAt),
              sku: p.asin,
              cost: String(cost),
              inventory_management: 'shopify',
              requires_shipping: true,
              taxable: true,
            }],
            images: [{ src: p.image }],
            metafields: [
              { namespace: 'comparisons', key: 'price_amazon', value: String(compA), type: 'number_decimal' },
              { namespace: 'comparisons', key: 'price_costco', value: String(compC), type: 'number_decimal' },
              { namespace: 'comparisons', key: 'price_ebay', value: String(compE), type: 'number_decimal' },
            ],
          },
        };

        const res = await fetch(`${base}/products.json`, {
          method: 'POST',
          headers: hdr,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15000),
        });

        // Handle Shopify rate limiting (429)
        if (res.status === 429) {
          const retryAfter = parseFloat(res.headers.get('Retry-After') || '2');
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          // Retry once
          const retry = await fetch(`${base}/products.json`, {
            method: 'POST',
            headers: hdr,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000),
          });
          if (!retry.ok) {
            const errText = await retry.text();
            results.push({ asin: p.asin, success: false, error: `Shopify ${retry.status}: ${errText.substring(0, 150)}` });
            continue;
          }
          const rData = await retry.json();
          results.push({ asin: p.asin, success: true, shopifyId: String(rData.product?.id || '') });
          continue;
        }

        if (!res.ok) {
          const errText = await res.text();
          results.push({ asin: p.asin, success: false, error: `Shopify ${res.status}: ${errText.substring(0, 150)}` });
          continue;
        }

        const sData = await res.json();
        results.push({ asin: p.asin, success: true, shopifyId: String(sData.product?.id || '') });

        // Small delay between products to respect rate limits
        if (products.indexOf(p) < products.length - 1) {
          await new Promise(r => setTimeout(r, 250));
        }
      } catch (e) {
        results.push({ asin: p.asin, success: false, error: String(e).substring(0, 150) });
      }
    }

    const pushed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({
      results,
      summary: { total: products.length, pushed, failed },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
