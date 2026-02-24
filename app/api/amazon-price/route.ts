import { NextRequest, NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════
// /api/amazon-price — Server-side Amazon price + availability checker
// Takes an ASIN, scrapes the Amazon product page, returns:
//   - currentPrice (current Amazon price)
//   - availability (in_stock | oos | unavail)
//   - title, rating, reviews, isPrime
//   - images (bonus: hi-res images from the same scrape)
// ═══════════════════════════════════════════════════════════

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface PriceResult {
  asin: string;
  currentPrice: number | null;
  availability: 'in_stock' | 'oos' | 'unavail';
  title: string;
  rating: number | null;
  reviews: number | null;
  isPrime: boolean;
  images: string[];
  checkedAt: string;
  error?: string;
}

function extractPrice(html: string): number | null {
  // Strategy 1: Price whole + fraction spans (most common)
  const wholeMatch = html.match(/<span class="a-price-whole">([0-9,]+)/);
  const fracMatch = html.match(/<span class="a-price-fraction">([0-9]+)/);
  if (wholeMatch) {
    const whole = wholeMatch[1].replace(/,/g, '');
    const frac = fracMatch ? fracMatch[1] : '00';
    return parseFloat(`${whole}.${frac}`);
  }

  // Strategy 2: priceAmount in JSON
  const jsonPrice = html.match(/"priceAmount"\s*:\s*([0-9.]+)/);
  if (jsonPrice) return parseFloat(jsonPrice[1]);

  // Strategy 3: data-asin-price attribute
  const dataPrice = html.match(/data-asin-price="([0-9.]+)"/);
  if (dataPrice) return parseFloat(dataPrice[1]);

  // Strategy 4: price block text
  const priceBlock = html.match(/class="a-offscreen">\$([0-9,.]+)</);
  if (priceBlock) return parseFloat(priceBlock[1].replace(/,/g, ''));

  // Strategy 5: corePrice JSON
  const corePrice = html.match(/"corePrice_feature_div".*?"price"\s*:\s*"?\$?([0-9,.]+)/s);
  if (corePrice) return parseFloat(corePrice[1].replace(/,/g, ''));

  return null;
}

function extractAvailability(html: string): 'in_stock' | 'oos' | 'unavail' {
  const lower = html.toLowerCase();
  // Check for explicit OOS markers
  if (lower.includes('currently unavailable') || lower.includes('not available')) return 'unavail';
  if (lower.includes('out of stock') || lower.includes('back in stock')) return 'oos';
  // Check for positive stock signals
  if (lower.includes('in stock') || lower.includes('add to cart') || lower.includes('buy now')) return 'in_stock';
  if (lower.includes('addtocart') || lower.includes('add-to-cart')) return 'in_stock';
  // JSON availability
  const avail = html.match(/"availability"\s*:\s*"([^"]+)"/);
  if (avail) {
    const v = avail[1].toLowerCase();
    if (v.includes('in stock') || v.includes('instock')) return 'in_stock';
    if (v.includes('out of stock')) return 'oos';
  }
  return 'unavail';
}

function extractRating(html: string): number | null {
  const m = html.match(/([0-9.]+) out of 5 star/);
  if (m) return parseFloat(m[1]);
  const m2 = html.match(/"ratingValue"\s*:\s*"?([0-9.]+)/);
  if (m2) return parseFloat(m2[1]);
  return null;
}

function extractReviews(html: string): number | null {
  const m = html.match(/([0-9,]+)\s*(?:global\s*)?ratings/i);
  if (m) return parseInt(m[1].replace(/,/g, ''), 10);
  const m2 = html.match(/"reviewCount"\s*:\s*"?([0-9,]+)/);
  if (m2) return parseInt(m2[1].replace(/,/g, ''), 10);
  return null;
}

function extractImages(html: string): string[] {
  const images: string[] = [];
  // og:image
  const og = html.match(/<meta\s+(?:property|name)="og:image"\s+content="([^"]+)"/i);
  if (og?.[1]) {
    images.push(og[1].replace(/\._[A-Z]{2}_[A-Z0-9_]+_\./, '._AC_SL1500_.'));
  }
  // hiRes from colorImages JSON
  for (const m of html.matchAll(/"hiRes"\s*:\s*"(https:\/\/[^"]+)"/g)) {
    if (m[1] && !images.includes(m[1])) images.push(m[1]);
  }
  // data-old-hires
  for (const m of html.matchAll(/data-old-hires="([^"]+)"/g)) {
    if (m[1]?.startsWith('http') && !images.includes(m[1])) images.push(m[1]);
  }
  // large from colorImages
  for (const m of html.matchAll(/"large"\s*:\s*"(https:\/\/[^"]+)"/g)) {
    if (m[1] && !images.includes(m[1])) images.push(m[1]);
  }
  return [...new Set(images)].slice(0, 5);
}

function extractTitle(html: string): string {
  const m = html.match(/<span[^>]*id="productTitle"[^>]*>([^<]+)/);
  if (m) return m[1].trim();
  const og = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  if (og) return og[1].trim();
  return '';
}

async function scrapeAsin(asin: string): Promise<PriceResult> {
  const result: PriceResult = {
    asin,
    currentPrice: null,
    availability: 'unavail',
    title: '',
    rating: null,
    reviews: null,
    isPrime: false,
    images: [],
    checkedAt: new Date().toISOString(),
  };

  const headers: Record<string, string> = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
  };

  for (const url of [`https://www.amazon.com/dp/${asin}`, `https://www.amazon.com/gp/product/${asin}`]) {
    try {
      const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const html = await res.text();

      // Check for CAPTCHA / bot detection
      if (html.includes('captcha') && html.length < 5000) {
        result.error = 'Amazon CAPTCHA detected';
        continue;
      }

      result.currentPrice = extractPrice(html);
      result.availability = extractAvailability(html);
      result.title = extractTitle(html);
      result.rating = extractRating(html);
      result.reviews = extractReviews(html);
      result.isPrime = html.includes('prime') || html.includes('Prime');
      result.images = extractImages(html);

      if (result.currentPrice !== null) break; // Got price, done
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error';
      result.error = errMsg;
    }
  }

  return result;
}

// GET /api/amazon-price?asin=B0XXXXXXXX
// GET /api/amazon-price?asins=B0XXX,B0YYY,B0ZZZ (batch, max 10)
export async function GET(request: NextRequest) {
  const singleAsin = request.nextUrl.searchParams.get('asin')?.trim().toUpperCase();
  const batchAsins = request.nextUrl.searchParams.get('asins')?.trim().toUpperCase();

  if (singleAsin) {
    if (!/^B[0-9A-Z]{9}$/.test(singleAsin)) {
      return NextResponse.json({ error: 'Invalid ASIN' }, { status: 400 });
    }
    const result = await scrapeAsin(singleAsin);
    return NextResponse.json(result);
  }

  if (batchAsins) {
    const asins = batchAsins.split(',').map(a => a.trim()).filter(a => /^B[0-9A-Z]{9}$/.test(a)).slice(0, 10);
    if (asins.length === 0) {
      return NextResponse.json({ error: 'No valid ASINs' }, { status: 400 });
    }
    // Process sequentially with delay to avoid rate limiting
    const results: PriceResult[] = [];
    for (let i = 0; i < asins.length; i++) {
      results.push(await scrapeAsin(asins[i]));
      if (i < asins.length - 1) await new Promise(r => setTimeout(r, 800));
    }
    return NextResponse.json({ results, count: results.length });
  }

  return NextResponse.json({ error: 'Provide ?asin=BXXXXXXXXXX or ?asins=B0XXX,B0YYY' }, { status: 400 });
}
