import { NextRequest, NextResponse } from 'next/server';

const RAINFOREST_KEY = process.env.RAINFOREST_API_KEY || '';
const RAINFOREST_BASE = 'https://api.rainforestapi.com/request';

// GET /api/enrich — check config, or test with ?asin=B09NW9P3TW
export async function GET(request: NextRequest) {
  if (!RAINFOREST_KEY || RAINFOREST_KEY === 'your_rainforest_api_key') {
    return NextResponse.json({ error: 'RAINFOREST_API_KEY not set', configured: false }, { status: 500 });
  }
  
  const testAsin = request.nextUrl.searchParams.get('asin');
  if (testAsin) {
    try {
      const params = new URLSearchParams({
        api_key: RAINFOREST_KEY,
        type: 'product',
        amazon_domain: 'amazon.com',
        asin: testAsin,
        include_a_plus_body: 'false',
      });
      const res = await fetch(`${RAINFOREST_BASE}?${params.toString()}`);
      const data = await res.json();
      const p = data.product || {};

      // Extract ALL images for test response
      const allImages: string[] = [];
      if (p.main_image?.link) allImages.push(p.main_image.link);
      if (Array.isArray(p.images)) {
        for (const img of p.images) {
          if (!img) continue;
          const link = String(img?.link || img?.src || (typeof img === 'string' ? img : '') || '');
          if (link && typeof link === 'string' && link.startsWith('http') && !allImages.includes(link)) allImages.push(link);
        }
      }
      // Also check variant images
      if (Array.isArray(p.variants)) {
        for (const v of p.variants) {
          if (!v) continue;
          const vLink = String(v?.main_image?.link || '');
          if (vLink && typeof vLink === 'string' && vLink.startsWith('http') && !allImages.includes(vLink)) allImages.push(vLink);
        }
      }

      return NextResponse.json({
        raw_status: res.status,
        has_product: !!data.product,
        title: p.title,
        price: p.buybox_winner?.price?.value || p.price?.value,
        image: allImages[0] || '',
        images: allImages,
        images_count: allImages.length,
        brand: p.brand,
        rating: p.rating,
        reviews: p.ratings_total,
        bsr: p.bestsellers_rank?.[0]?.rank,
        category: p.bestsellers_rank?.[0]?.category,
        available: p.buybox_winner?.availability?.type,
        prime: p.buybox_winner?.is_prime,
        features_count: p.feature_bullets?.length || 0,
        request_info: data.request_info,
        error_if_any: data.error || null,
      });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }
  
  return NextResponse.json({ configured: true, api: 'rainforest', note: 'Ready. Add ?asin=B09NW9P3TW to test.' });
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

    // Keep batch small to avoid Vercel timeout (10s on hobby plan)
    // 5 parallel × 1 round = 5 ASINs in ~2-3s
    const PARALLEL = 5;
    const batch = asins.slice(0, Math.min(asins.length, 5));
    const markup = criteria.markup || 70;

    interface EnrichedProduct {
      title: string; asin: string; price: number; image: string; images: string[]; description: string;
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
        const brand = product.brand || product.manufacturer || '';
        const rating = product.rating || 0;
        const reviews = product.ratings_total || 0;
        const bsr = product.bestsellers_rank?.[0]?.rank || 0;
        const category = product.bestsellers_rank?.[0]?.category || product.categories_flat || '';
        const isAvailable = product.buybox_winner?.availability?.type === 'in_stock' || bestPrice > 0;
        const isPrime = product.buybox_winner?.is_prime || false;

        // ═══════════════════════════════════════════════════════════
        // EXTRACT ALL IMAGES — main image + product.images array + variant images
        // Rainforest returns: main_image.link, images[].link, variants[].main_image.link
        // ═══════════════════════════════════════════════════════════
        const allImages: string[] = [];

        // 1. Main image first (highest quality, used as hero)
        if (product.main_image?.link) {
          allImages.push(product.main_image.link);
        }

        // 2. All images from the images array
        if (Array.isArray(product.images)) {
          for (const img of product.images) {
            if (!img) continue;
            const link = String(img?.link || img?.src || (typeof img === 'string' ? img : '') || '');
            if (link && typeof link === 'string' && link.startsWith('http') && !allImages.includes(link)) {
              allImages.push(link);
            }
          }
        }

        // 3. Variant images (different colors/sizes often have unique images)
        if (Array.isArray(product.variants)) {
          for (const variant of product.variants) {
            if (!variant) continue;
            const vImg = String(variant?.main_image?.link || variant?.image?.link || '');
            if (vImg && typeof vImg === 'string' && vImg.startsWith('http') && !allImages.includes(vImg)) {
              allImages.push(vImg);
            }
          }
        }

        // Fallback: if no images found at all
        const mainImage = allImages[0] || '';

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
          title, asin, price: bestPrice, image: mainImage, images: allImages, description,
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
