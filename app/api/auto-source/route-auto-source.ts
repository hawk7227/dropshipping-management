import { NextRequest, NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════
// /api/auto-source — Product Discovery Engine
// Scrapes Amazon Best Sellers / search results by category,
// applies profitability filters, returns scored candidates
// ═══════════════════════════════════════════════════════════

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Amazon Best Seller category node IDs
const CATEGORY_NODES: Record<string, string[]> = {
  'Beauty & Personal Care': ['3760911'],
  'Kitchen Gadgets': ['289913', '384icons919011'],
  'Pet Products': ['2619533011'],
  'Home & LED Lighting': ['495224', '2230642011'],
  'Fitness & Wellness': ['3407731'],
  'Tech Accessories': ['541966', '172456'],
  'Organization & Storage': ['3744171'],
  'Car Accessories': ['15684181'],
};

// Search term fallbacks when Best Sellers pages don't work
const CATEGORY_SEARCHES: Record<string, string[]> = {
  'Beauty & Personal Care': ['beauty gadgets under 25', 'skincare tools best seller', 'personal care accessories trending'],
  'Kitchen Gadgets': ['kitchen gadgets under 25', 'cooking tools trending', 'kitchen accessories best seller'],
  'Pet Products': ['pet accessories trending', 'dog toys best seller', 'cat accessories under 20'],
  'Home & LED Lighting': ['led lights home decor', 'home organization tools', 'smart home gadgets under 25'],
  'Fitness & Wellness': ['fitness accessories under 25', 'workout gadgets trending', 'wellness tools best seller'],
  'Tech Accessories': ['phone accessories trending', 'tech gadgets under 25', 'usb accessories best seller'],
  'Organization & Storage': ['storage organizer best seller', 'organization accessories trending', 'closet organizer under 20'],
  'Car Accessories': ['car accessories trending', 'car gadgets under 25', 'auto accessories best seller'],
};

interface DiscoveredProduct {
  asin: string;
  title: string;
  amazonPrice: number;
  rating: number;
  reviews: number;
  isPrime: boolean;
  image: string;
  category: string;
  // Calculated
  salePrice: number;
  compareAt: number;
  dollarProfit: number;
  markupPct: number;
  score: number;
  passesFilter: boolean;
  filterReason: string;
}

interface CriteriaInput {
  minPrice: number;
  maxPrice: number;
  minMarkup: number;
  minReviews: number;
  minRating: number;
  requirePrime: boolean;
  blocked: string[];
  maxRetail: number;
  minProfit: number;
}

function getTier(cost: number): number {
  if (cost <= 7) return 2.50;
  if (cost <= 12) return 2.00;
  if (cost <= 18) return 1.80;
  return 1.80;
}

function scoreProduct(p: DiscoveredProduct, crit: CriteriaInput): DiscoveredProduct {
  const mult = getTier(p.amazonPrice);
  let sp = Math.floor(p.amazonPrice * mult) + 0.99;
  if (sp > crit.maxRetail) sp = crit.maxRetail - 0.01;
  const dp = Math.round((sp - p.amazonPrice) * 100) / 100;
  const mp = p.amazonPrice > 0 ? Math.round(((sp - p.amazonPrice) / p.amazonPrice) * 100) : 0;
  const compareAt = Math.floor(sp * 1.4) + 0.99;

  // Filter checks
  let passes = true;
  let reason = '';
  if (p.amazonPrice < crit.minPrice || p.amazonPrice > crit.maxPrice) { passes = false; reason = `Price $${p.amazonPrice} outside $${crit.minPrice}-$${crit.maxPrice}`; }
  else if (mp < crit.minMarkup) { passes = false; reason = `Markup ${mp}% below ${crit.minMarkup}%`; }
  else if (dp < crit.minProfit) { passes = false; reason = `Profit $${dp.toFixed(2)} below $${crit.minProfit}`; }
  else if (sp > crit.maxRetail) { passes = false; reason = `Retail $${sp.toFixed(2)} exceeds $${crit.maxRetail}`; }
  else if (p.reviews < crit.minReviews) { passes = false; reason = `${p.reviews} reviews below ${crit.minReviews}`; }
  else if (p.rating < crit.minRating) { passes = false; reason = `Rating ${p.rating} below ${crit.minRating}`; }
  else if (crit.requirePrime && !p.isPrime) { passes = false; reason = 'Not Prime eligible'; }
  else {
    const titleLower = p.title.toLowerCase();
    for (const b of crit.blocked) {
      if (titleLower.includes(b.toLowerCase())) { passes = false; reason = `Blocked brand: ${b}`; break; }
    }
  }

  // Score (0-100) based on multiple factors
  let score = 0;
  if (passes) {
    score += Math.min(30, mp / 3); // markup contribution (up to 30)
    score += Math.min(25, (p.reviews / 2000) * 25); // reviews contribution (up to 25)
    score += Math.min(15, (p.rating / 5) * 15); // rating contribution (up to 15)
    score += p.isPrime ? 10 : 0; // Prime bonus
    score += dp >= 8 ? 15 : dp >= 5 ? 10 : dp >= 3 ? 5 : 0; // profit bonus
    score += p.image ? 5 : 0; // has image bonus
    score = Math.round(Math.min(100, score));
  }

  return { ...p, salePrice: sp, compareAt, dollarProfit: dp, markupPct: mp, score, passesFilter: passes, filterReason: reason };
}

async function searchAmazon(query: string, category: string): Promise<DiscoveredProduct[]> {
  const products: DiscoveredProduct[] = [];
  const url = `https://www.amazon.com/s?k=${encodeURIComponent(query)}&i=aps&ref=nb_sb_noss`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.5' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return products;
    const html = await res.text();

    // Extract product cards from search results
    // Each result has data-asin, title, price, rating, reviews, image
    const asinMatches = html.matchAll(/data-asin="(B[0-9A-Z]{9})"/g);
    const asins = [...new Set([...asinMatches].map(m => m[1]))].slice(0, 20);

    for (const asin of asins) {
      // Find the block of HTML around this ASIN
      const idx = html.indexOf(`data-asin="${asin}"`);
      if (idx === -1) continue;
      const block = html.substring(Math.max(0, idx - 200), Math.min(html.length, idx + 4000));

      // Title
      const titleMatch = block.match(/class="a-size-(?:medium|base-plus|mini)[^"]*"[^>]*>([^<]{10,200})</);
      const title = titleMatch ? titleMatch[1].trim() : '';
      if (!title) continue;

      // Price
      const priceWhole = block.match(/<span class="a-price-whole">([0-9,]+)/);
      const priceFrac = block.match(/<span class="a-price-fraction">([0-9]+)/);
      let price = 0;
      if (priceWhole) {
        price = parseFloat(`${priceWhole[1].replace(/,/g, '')}.${priceFrac ? priceFrac[1] : '00'}`);
      } else {
        const offscreen = block.match(/class="a-offscreen">\$([0-9,.]+)</);
        if (offscreen) price = parseFloat(offscreen[1].replace(/,/g, ''));
      }
      if (price <= 0) continue;

      // Rating
      const ratingMatch = block.match(/([0-9.]+) out of 5/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

      // Reviews
      const reviewMatch = block.match(/aria-label="[0-9,.]+ out of 5[^"]*"[^>]*>.*?<span[^>]*>([0-9,]+)</s);
      const reviews = reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, ''), 10) : 0;

      // Image
      const imgMatch = block.match(/src="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/);
      const image = imgMatch ? imgMatch[1].replace(/\._[A-Z]{2}_[A-Z0-9_]+_\./, '._AC_SL500_.') : '';

      // Prime
      const isPrime = block.includes('a-icon-prime') || block.includes('FREE delivery');

      products.push({
        asin, title, amazonPrice: price, rating, reviews, isPrime, image, category,
        salePrice: 0, compareAt: 0, dollarProfit: 0, markupPct: 0, score: 0,
        passesFilter: false, filterReason: '',
      });
    }
  } catch (e) {
    console.error(`[AutoSource] Search failed for "${query}":`, e);
  }

  return products;
}

// GET /api/auto-source?category=Beauty+%26+Personal+Care&minPrice=3&maxPrice=25&...
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const category = params.get('category') || 'Beauty & Personal Care';
  const crit: CriteriaInput = {
    minPrice: parseFloat(params.get('minPrice') || '3'),
    maxPrice: parseFloat(params.get('maxPrice') || '25'),
    minMarkup: parseInt(params.get('minMarkup') || '80', 10),
    minReviews: parseInt(params.get('minReviews') || '500', 10),
    minRating: parseFloat(params.get('minRating') || '3.5'),
    requirePrime: params.get('requirePrime') !== 'false',
    blocked: (params.get('blocked') || '').split(',').filter(Boolean),
    maxRetail: parseFloat(params.get('maxRetail') || '40'),
    minProfit: parseFloat(params.get('minProfit') || '4'),
  };

  // Get search terms for this category
  const searches = CATEGORY_SEARCHES[category] || [`${category} best seller under 25`];
  const allProducts: DiscoveredProduct[] = [];
  const seenAsins = new Set<string>();

  for (const query of searches) {
    const results = await searchAmazon(query, category);
    for (const p of results) {
      if (seenAsins.has(p.asin)) continue;
      seenAsins.add(p.asin);
      allProducts.push(scoreProduct(p, crit));
    }
    // Rate limit between searches
    await new Promise(r => setTimeout(r, 1200));
  }

  // Sort by score descending
  allProducts.sort((a, b) => b.score - a.score);

  const passed = allProducts.filter(p => p.passesFilter);
  const filtered = allProducts.filter(p => !p.passesFilter);

  return NextResponse.json({
    category,
    total: allProducts.length,
    passed: passed.length,
    filtered: filtered.length,
    products: passed,
    filteredProducts: filtered.slice(0, 20), // Include some filtered for reference
    searchTerms: searches,
    checkedAt: new Date().toISOString(),
  });
}
