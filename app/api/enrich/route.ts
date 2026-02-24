import { NextRequest, NextResponse } from 'next/server';

const RAINFOREST_KEY = process.env.RAINFOREST_API_KEY || '';
const RAINFOREST_BASE = 'https://api.rainforestapi.com/request';

// GET /api/enrich — check API config
export async function GET() {
  if (!RAINFOREST_KEY || RAINFOREST_KEY === 'your_rainforest_api_key') {
    return NextResponse.json({ error: 'RAINFOREST_API_KEY not set', configured: false }, { status: 500 });
  }
  return NextResponse.json({ configured: true, api: 'rainforest', note: 'Ready. ~$0.02 per product lookup.' });
}

// POST /api/enrich — enrich ASINs via Rainforest (one at a time, but no token limits)
// Body: { asins: string[], criteria?: {...} }
export async function POST(request: NextRequest) {
  if (!RAINFOREST_KEY || RAINFOREST_KEY === 'your_rainforest_api_key') {
    return NextResponse.json({ error: 'RAINFOREST_API_KEY not set' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const asins: string[] = body.asins || [];
    const criteria = body.criteria || {};

    if (!asins.length) return NextResponse.json({ error: 'No ASINs provided' }, { status: 400 });

    // Process up to 10 at a time (parallel) to stay fast but not overwhelm
    const PARALLEL = 5;
    const batch = asins.slice(0, Math.min(asins.length, 50));
    const markup = criteria.markup || 70;

    interface EnrichedProduct {
      title: string; asin: string; price: number; image: string; description: string;
      vendor: string; category: string; rating: number; reviews: number; bsr: number;
      isPrime: boolean; isAvailable: boolean; monthlySold: number;
      sellPrice: number; profit: number; profitPct: number;
      passed: boolean; rejectReason: string;
    }

    const enriched: Record<string, EnrichedProduct> = {};
    let passed = 0, rejected = 0;
    const rejectReasons: Record<string, number> = {};
    const errors: string[] = [];

    // Process in parallel chunks
    for (let i = 0; i < batch.length; i += PARALLEL) {
      const chunk = batch.slice(i, i + PARALLEL);

      const results = await Promise.allSettled(
        chunk.map(async (asin) => {
          const params = new URLSearchParams({
            api_key: RAINFOREST_KEY,
            type: 'product',
            amazon_domain: 'amazon.com',
            asin: asin,
            include_a_plus_body: 'false',
          });

          const res = await fetch(`${RAINFOREST_BASE}?${params.toString()}`, { signal: AbortSignal.timeout(15000) });
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`${res.status}: ${text.substring(0, 200)}`);
          }
          return { asin, data: await res.json() };
        })
      );

      for (const result of results) {
        if (result.status === 'rejected') {
          errors.push(String(result.reason).substring(0, 100));
          continue;
        }

        const { asin, data } = result.value;
        const product = data.product || {};

        // Extract data
        const title = product.title || '';
        const bestPrice = product.buybox_winner?.price?.value || product.price?.value || 0;
        const mainImage = product.main_image?.link || (product.images?.length > 0 ? product.images[0]?.link : '') || '';
        const brand = product.brand || product.manufacturer || '';
        const rating = product.rating || 0;
        const reviews = product.ratings_total || 0;
        const bsr = product.bestsellers_rank?.[0]?.rank || 0;
        const category = product.bestsellers_rank?.[0]?.category || product.categories_flat || '';
        const isAvailable = product.buybox_winner?.availability?.type === 'in_stock' || bestPrice > 0;
        const isPrime = product.buybox_winner?.is_prime || false;

        // Description from feature bullets
        const features = product.feature_bullets || [];
        const description = features.length > 0
          ? features.map((f: string | { text?: string }) => typeof f === 'string' ? f : f?.text || '').filter(Boolean).slice(0, 6).join(' | ')
          : (product.description || '');

        // Pricing
        const sellPrice = bestPrice > 0 ? +(bestPrice * (1 + markup / 100)).toFixed(2) : 0;
        const profit = sellPrice > 0 ? +(sellPrice - bestPrice).toFixed(2) : 0;
        const profitPct = bestPrice > 0 ? +((profit / bestPrice) * 100).toFixed(1) : 0;

        // Criteria filtering
        let pass = true;
        let reason = '';

        if (!isAvailable) { pass = false; reason = 'Out of stock'; }
        else if (!title) { pass = false; reason = 'No title'; }
        else if (criteria.minPrice && bestPrice < criteria.minPrice) { pass = false; reason = `Price $${bestPrice.toFixed(2)} < $${criteria.minPrice}`; }
        else if (criteria.maxPrice && bestPrice > criteria.maxPrice) { pass = false; reason = `Price $${bestPrice.toFixed(2)} > $${criteria.maxPrice}`; }
        else if (criteria.minRating && rating > 0 && rating < criteria.minRating) { pass = false; reason = `Rating ${rating} < ${criteria.minRating}`; }
        else if (criteria.minReviews && reviews < criteria.minReviews) { pass = false; reason = `${reviews} reviews < ${criteria.minReviews}`; }
        else if (criteria.maxBSR && bsr > 0 && bsr > criteria.maxBSR) { pass = false; reason = `BSR ${bsr.toLocaleString()} > ${criteria.maxBSR.toLocaleString()}`; }
        else if (criteria.maxRetail && sellPrice > criteria.maxRetail) { pass = false; reason = `Retail $${sellPrice} > cap $${criteria.maxRetail}`; }

        if (pass) passed++; else { rejected++; rejectReasons[reason] = (rejectReasons[reason] || 0) + 1; }

        enriched[asin] = {
          title, asin, price: bestPrice, image: mainImage, description,
          vendor: brand, category, rating, reviews, bsr,
          isPrime, isAvailable, monthlySold: 0,
          sellPrice, profit, profitPct,
          passed: pass, rejectReason: reason,
        };
      }
    }

    return NextResponse.json({
      enriched,
      summary: {
        requested: batch.length,
        returned: Object.keys(enriched).length,
        passed, rejected, rejectReasons, errors,
        costEstimate: `~$${(Object.keys(enriched).length * 0.02).toFixed(2)}`,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
