// app/api/stock-check/route.ts
// ============================================================================
// Stock Check API — checks Amazon availability by ASIN
// Primary: Rainforest API | Fallback: Keepa API
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

interface StockResult {
  asin: string;
  productId: string;
  inStock: boolean | null;
  price: number | null;
  source: 'rainforest' | 'keepa' | 'none';
  seller?: string;
  error?: string;
}

// ── Rainforest check ────────────────────────────────────────────────
async function checkRainforest(asin: string): Promise<{ inStock: boolean | null; price: number | null; seller?: string; error?: string }> {
  const key = process.env.RAINFOREST_API_KEY;
  if (!key) return { inStock: null, price: null, error: 'RAINFOREST_API_KEY not set' };

  try {
    const params = new URLSearchParams({
      api_key: key,
      type: 'product',
      amazon_domain: 'amazon.com',
      asin,
    });

    const res = await fetch(`https://api.rainforestapi.com/request?${params}`, {
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const text = await res.text();
      return { inStock: null, price: null, error: `Rainforest ${res.status}: ${text.substring(0, 200)}` };
    }

    const data = await res.json();
    const product = data.product;

    if (!product) return { inStock: null, price: null, error: 'No product data returned' };

    const buybox = product.buybox_winner;
    const inStock = buybox?.availability?.type === 'in_stock'
      || product.in_stock === true
      || (buybox?.availability?.raw && !buybox.availability.raw.toLowerCase().includes('unavailable'));

    const price = buybox?.price?.value || product.buybox_winner?.price?.value || null;
    const seller = buybox?.seller?.name || null;

    return { inStock: !!inStock, price, seller };
  } catch (err) {
    return { inStock: null, price: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Keepa check (fallback) ──────────────────────────────────────────
async function checkKeepa(asin: string): Promise<{ inStock: boolean | null; price: number | null; error?: string }> {
  const key = process.env.KEEPA_API_KEY;
  if (!key) return { inStock: null, price: null, error: 'KEEPA_API_KEY not set' };

  try {
    const res = await fetch(
      `https://api.keepa.com/product?key=${key}&domain=1&asin=${asin}&stats=1&offers=20`,
      { signal: AbortSignal.timeout(15000) }
    );

    if (!res.ok) {
      const text = await res.text();
      return { inStock: null, price: null, error: `Keepa ${res.status}: ${text.substring(0, 200)}` };
    }

    const data = await res.json();
    const product = data.products?.[0];

    if (!product) return { inStock: null, price: null, error: 'No product in Keepa response' };

    // Keepa csv array: index 0 = Amazon price, index 1 = marketplace new
    // -1 means out of stock
    const amazonPrice = product.csv?.[0];
    const lastAmazonPrice = Array.isArray(amazonPrice) && amazonPrice.length >= 2
      ? amazonPrice[amazonPrice.length - 1]
      : null;

    // Stats has current price info
    const currentPrice = product.stats?.current?.[0]; // Amazon price in cents
    const buyBoxPrice = product.stats?.current?.[18]; // Buy box price in cents

    const price = buyBoxPrice && buyBoxPrice > 0
      ? buyBoxPrice / 100
      : currentPrice && currentPrice > 0
        ? currentPrice / 100
        : null;

    // If price is -1 or null, it's out of stock on Amazon
    const inStock = price !== null && price > 0;

    return { inStock, price };
  } catch (err) {
    return { inStock: null, price: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── POST: check stock for array of { asin, productId } ─────────────
export async function POST(request: NextRequest) {
  try {
    const { items } = await request.json();
    // items: Array<{ asin: string; productId: string }>

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'items[] required (each with asin and productId)' }, { status: 400 });
    }

    const results: StockResult[] = [];

    for (const item of items) {
      const { asin, productId } = item;

      if (!asin || asin.length < 5) {
        results.push({ asin: asin || '', productId, inStock: null, price: null, source: 'none', error: 'No valid ASIN' });
        continue;
      }

      // Try Rainforest first
      const rf = await checkRainforest(asin);

      if (rf.inStock !== null) {
        results.push({
          asin,
          productId,
          inStock: rf.inStock,
          price: rf.price,
          source: 'rainforest',
          seller: rf.seller,
        });
      } else {
        // Fallback to Keepa
        const kp = await checkKeepa(asin);

        if (kp.inStock !== null) {
          results.push({
            asin,
            productId,
            inStock: kp.inStock,
            price: kp.price,
            source: 'keepa',
          });
        } else {
          results.push({
            asin,
            productId,
            inStock: null,
            price: null,
            source: 'none',
            error: rf.error || kp.error || 'Both APIs failed',
          });
        }
      }

      // Rate limit: 1 request/sec for Rainforest free tier
      await new Promise(r => setTimeout(r, 1200));
    }

    const inStockCount = results.filter(r => r.inStock === true).length;
    const outOfStockCount = results.filter(r => r.inStock === false).length;
    const unknownCount = results.filter(r => r.inStock === null).length;

    return NextResponse.json({
      success: true,
      data: {
        results,
        summary: { total: results.length, inStock: inStockCount, outOfStock: outOfStockCount, unknown: unknownCount },
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
