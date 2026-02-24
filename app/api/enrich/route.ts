import { NextRequest, NextResponse } from 'next/server';

const KEEPA_KEY = process.env.KEEPA_API_KEY || '';
const KEEPA_BASE = 'https://api.keepa.com';

function keepaPrice(val: number | undefined): number {
  if (!val || val < 0) return 0;
  return val / 100;
}

// GET /api/enrich?check=true — verify API key + token balance
export async function GET() {
  if (!KEEPA_KEY || KEEPA_KEY === 'your_keepa_api_key') {
    return NextResponse.json({ error: 'KEEPA_API_KEY not set in environment', configured: false }, { status: 500 });
  }
  try {
    const res = await fetch(`${KEEPA_BASE}/token?key=${KEEPA_KEY}`);
    const data = await res.json();
    return NextResponse.json({ configured: true, tokensLeft: data.tokensLeft, refillIn: data.refillIn, refillRate: data.refillRate });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e), configured: false }, { status: 500 });
  }
}

// POST /api/enrich — batch enrich ASINs via Keepa
// Body: { asins: string[], criteria?: { minPrice, maxPrice, minRating, minReviews, primeOnly, maxBSR, markup, maxRetail } }
export async function POST(request: NextRequest) {
  if (!KEEPA_KEY || KEEPA_KEY === 'your_keepa_api_key') {
    return NextResponse.json({ error: 'KEEPA_API_KEY not set' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const asins: string[] = body.asins || [];
    const criteria = body.criteria || {};

    if (!asins.length) return NextResponse.json({ error: 'No ASINs provided' }, { status: 400 });

    // Keepa allows up to 100 ASINs per request
    const batch = asins.slice(0, 100);

    const params = new URLSearchParams({
      key: KEEPA_KEY,
      domain: '1', // amazon.com
      asin: batch.join(','),
      stats: '180',
      history: '0',
      offers: '0',
      rating: '1',
    });

    const res = await fetch(`${KEEPA_BASE}/product?${params.toString()}`);
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Keepa ${res.status}: ${text}` }, { status: res.status });
    }

    const data = await res.json();
    const products = data.products || [];

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

    const markup = criteria.markup || 70; // default 70% markup

    for (const p of products) {
      const asin = p.asin;
      const stats = p.stats || {};

      // Prices — try current Amazon, then Buy Box, then avg
      const amazonCurrent = keepaPrice(stats.current?.[0]);
      const buyBox = keepaPrice(stats.current?.[18]);
      const amazonAvg = keepaPrice(stats.avg?.[0]);
      const newPrice = keepaPrice(stats.current?.[1]); // 3rd party new
      const bestPrice = buyBox || amazonCurrent || newPrice || amazonAvg || 0;

      // Rating/reviews
      const rating = stats.current?.[16] ? stats.current[16] / 10 : 0;
      const reviews = stats.current?.[17] || 0;

      // BSR
      const bsr = stats.current?.[3] || 0;

      // Availability
      const isAvailable = bestPrice > 0;

      // Category tree
      const catTree = p.categoryTree || [];
      const category = catTree.length > 0 ? catTree[catTree.length - 1]?.name || '' : '';

      // Brand
      const brand = p.brand || p.manufacturer || '';

      // Image — first from imagesCSV
      const imageUrl = p.imagesCSV
        ? `https://images-na.ssl-images-amazon.com/images/I/${p.imagesCSV.split(',')[0]}`
        : '';

      // Description from features
      const description = (p.features && p.features.length > 0)
        ? p.features.slice(0, 6).join(' | ')
        : (p.description || '');

      const title = p.title || '';
      const monthlySold = p.monthlySold || 0;

      // Pricing calculations
      const sellPrice = bestPrice > 0 ? +(bestPrice * (1 + markup / 100)).toFixed(2) : 0;
      const profit = sellPrice > 0 ? +(sellPrice - bestPrice).toFixed(2) : 0;
      const profitPct = bestPrice > 0 ? +((profit / bestPrice) * 100).toFixed(1) : 0;

      // ── CRITERIA FILTERING ──
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
        title, asin, price: bestPrice, image: imageUrl, description,
        vendor: brand, category, rating, reviews, bsr,
        isPrime: !!(stats.current?.[10] > 0 || amazonCurrent > 0),
        isAvailable, monthlySold,
        sellPrice, profit, profitPct,
        passed: pass, rejectReason: reason,
      };
    }

    return NextResponse.json({
      enriched,
      summary: {
        requested: batch.length, returned: products.length,
        passed, rejected, rejectReasons,
        tokensLeft: data.tokensLeft || 0,
        refillRate: data.refillRate || 0,
        tokensUsed: batch.length,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
