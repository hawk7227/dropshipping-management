import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// MARKET PRICE RESEARCH ENGINE — Powered by Keepa API
// ============================================================================
// Uses Keepa's batch endpoint (up to 100 ASINs per call) to get:
//   - Current Amazon price + marketplace (3P) price
//   - 90-day average price (used as market average)
//   - 30-day average price
//   - Sales rank, buy box stats, all-time low
// Then applies dynamic pricing logic to set optimal sell price
// ============================================================================

const KEEPA_KEY = process.env.KEEPA_API_KEY || '';
const KEEPA_BASE = 'https://api.keepa.com/product';

// --- Dynamic pricing constants ---
const BASE_MARKUP = 1.70;
const OVERAGE_THRESHOLD = 0.05;  // 5% — only adjust if sell price is 5%+ above average
const OVERAGE_HALVING = 0.5;     // Take half the overage percentage
const UNDERCUT_BUFFER = 0.05;    // If below average, raise to 5% below average

// ============================================================================
// TYPES
// ============================================================================
export interface MarketPriceResult {
  asin: string;
  title: string;
  amazonCost: number;
  initialSellPrice: number;
  averageMarketPrice: number;
  adjustedSellPrice: number;
  priceAdjustmentPct: number;
  adjustmentReason: string;
  competitorPrices: {
    amazon: number;
    costco: number;
    ebay: number;
    sams: number;
  };
  marketData: {
    currentAmazonPrice: number;
    currentNewPrice: number;
    avg30: number;
    avg90: number;
    allTimeLow: number;
    salesRank: number;
    buyBoxPrice: number;
    pricesUsedForAvg: number;
  };
}

// ============================================================================
// Keepa prices are in cents — convert to dollars
// -1 = out of stock, -2 = no data
// ============================================================================
function keepaPrice(val: number | undefined | null): number {
  if (!val || val < 0) return 0;
  return +(val / 100).toFixed(2);
}

// ============================================================================
// CORE: Calculate dynamic sell price based on market average
// ============================================================================
function calculateDynamicPrice(amazonCost: number, averageMarketPrice: number): {
  adjustedSellPrice: number;
  priceAdjustmentPct: number;
  adjustmentReason: string;
} {
  const initialSellPrice = +(amazonCost * BASE_MARKUP).toFixed(2);

  if (!amazonCost || amazonCost <= 0) {
    return { adjustedSellPrice: 0, priceAdjustmentPct: 0, adjustmentReason: 'No cost data — cannot calculate sell price' };
  }

  if (!averageMarketPrice || averageMarketPrice <= 0) {
    return { adjustedSellPrice: initialSellPrice, priceAdjustmentPct: 0, adjustmentReason: 'No market data — using base 1.70x markup' };
  }

  const overagePct = (initialSellPrice - averageMarketPrice) / averageMarketPrice;

  // CASE 1: Sell price >5% above market average → lower by half the overage
  if (overagePct > OVERAGE_THRESHOLD) {
    const reductionPct = overagePct * OVERAGE_HALVING;
    const adjustedSellPrice = +(initialSellPrice * (1 - reductionPct)).toFixed(2);
    return {
      adjustedSellPrice,
      priceAdjustmentPct: +(reductionPct * -100).toFixed(1),
      adjustmentReason: `$${initialSellPrice} is ${(overagePct * 100).toFixed(0)}% above avg $${averageMarketPrice.toFixed(2)} -> lowered ${(reductionPct * 100).toFixed(0)}%`,
    };
  }

  // CASE 2: Sell price BELOW market average → raise to 5% below average
  if (initialSellPrice < averageMarketPrice) {
    const targetPrice = +(averageMarketPrice * (1 - UNDERCUT_BUFFER)).toFixed(2);
    const raisePct = ((targetPrice - initialSellPrice) / initialSellPrice);
    return {
      adjustedSellPrice: targetPrice,
      priceAdjustmentPct: +(raisePct * 100).toFixed(1),
      adjustmentReason: `$${initialSellPrice} below avg $${averageMarketPrice.toFixed(2)} -> raised to $${targetPrice} (5% under avg)`,
    };
  }

  // CASE 3: Within 5% of average — keep as-is
  return {
    adjustedSellPrice: initialSellPrice,
    priceAdjustmentPct: 0,
    adjustmentReason: `$${initialSellPrice} within 5% of avg $${averageMarketPrice.toFixed(2)} — no adjustment`,
  };
}

// ============================================================================
// CORE: Competitor display prices from average market price
// average × varying multipliers (1.60-1.85), floor = sellPrice × 1.15
// ============================================================================
function calculateCompetitorPrices(adjustedSellPrice: number, averageMarketPrice: number): {
  amazon: number; costco: number; ebay: number; sams: number;
} {
  const base = averageMarketPrice > 0 ? averageMarketPrice : adjustedSellPrice;

  const raw = {
    amazon: +(base * 1.78).toFixed(2),
    costco: +(base * 1.72).toFixed(2),
    ebay:   +(base * 1.85).toFixed(2),
    sams:   +(base * 1.65).toFixed(2),
  };

  const floor = +(adjustedSellPrice * 1.15).toFixed(2);
  return {
    amazon: +Math.max(raw.amazon, floor).toFixed(2),
    costco: +Math.max(raw.costco, floor).toFixed(2),
    ebay:   +Math.max(raw.ebay, floor).toFixed(2),
    sams:   +Math.max(raw.sams, floor).toFixed(2),
  };
}

// ============================================================================
// Process a single Keepa product into MarketPriceResult
// ============================================================================
function processKeepaProduct(
  kp: Record<string, unknown>,
  input: { asin: string; title: string; price: number }
): MarketPriceResult {
  const stats = (kp.stats as Record<string, unknown>) || {};
  const current = (stats.current as number[]) || [];
  const avg30 = (stats.avg30 as number[]) || [];
  const avg90 = (stats.avg90 as number[]) || [];
  const minAll = (stats.min as number[]) || [];

  // Keepa csv type indices:
  // 0=AMAZON, 1=NEW(marketplace), 2=USED, 11=NEW_FBA, 18=BUY_BOX_SHIPPING
  const currentAmazon = keepaPrice(current[0]);
  const currentNew = keepaPrice(current[1]);
  const currentBuyBox = keepaPrice(current[18]) || currentAmazon;
  const avg30Amazon = keepaPrice(avg30[0]);
  const avg30New = keepaPrice(avg30[1]);
  const avg90Amazon = keepaPrice(avg90[0]);
  const avg90New = keepaPrice(avg90[1]);
  const allTimeLow = keepaPrice(minAll[0]);
  const salesRank = (kp.salesRankReference as number) || 0;

  // Build average from all available price signals
  const pts: number[] = [];
  if (avg90Amazon > 0) pts.push(avg90Amazon);
  if (avg90New > 0) pts.push(avg90New);
  if (avg30Amazon > 0 && !pts.length) pts.push(avg30Amazon);
  if (avg30New > 0 && !pts.length) pts.push(avg30New);
  if (currentAmazon > 0) pts.push(currentAmazon);
  if (currentNew > 0) pts.push(currentNew);
  if (currentBuyBox > 0) pts.push(currentBuyBox);
  // NOTE: input.price (from Rainforest) intentionally excluded — can be inflated list price

  const averageMarketPrice = pts.length > 0
    ? +(pts.reduce((s, p) => s + p, 0) / pts.length).toFixed(2)
    : 0;

  // Use Keepa's current price as source of truth — it's real-time and accurate
  // Rainforest's buybox price can be inflated (list price vs actual selling price)
  const amazonCost = currentBuyBox || currentAmazon || currentNew || input.price;
  const { adjustedSellPrice, priceAdjustmentPct, adjustmentReason } = calculateDynamicPrice(amazonCost, averageMarketPrice);
  const competitorPrices = calculateCompetitorPrices(adjustedSellPrice, averageMarketPrice);

  return {
    asin: input.asin,
    title: (kp.title as string) || input.title,
    amazonCost,
    initialSellPrice: +(amazonCost * BASE_MARKUP).toFixed(2),
    averageMarketPrice,
    adjustedSellPrice,
    priceAdjustmentPct,
    adjustmentReason,
    competitorPrices,
    marketData: {
      currentAmazonPrice: currentAmazon,
      currentNewPrice: currentNew,
      avg30: avg30Amazon || avg30New,
      avg90: avg90Amazon || avg90New,
      allTimeLow,
      salesRank,
      buyBoxPrice: currentBuyBox,
      pricesUsedForAvg: pts.length,
    },
  };
}

// ============================================================================
// GET: Test — /api/market-price?asin=B09YPR4NK4&cost=28.87
// ============================================================================
export async function GET(request: NextRequest) {
  if (!KEEPA_KEY) {
    return NextResponse.json({ error: 'KEEPA_API_KEY not set' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const asin = searchParams.get('asin') || '';
  const costParam = parseFloat(searchParams.get('cost') || '0');
  const titleParam = searchParams.get('title') || '';

  if (!asin) {
    return NextResponse.json({
      status: 'ok',
      usage: '/api/market-price?asin=B09YPR4NK4&cost=28.87',
      description: 'Fetches Keepa price data, calculates dynamic sell price + competitor prices',
      engine: 'Keepa API (100 ASINs/call, 1 token/product)',
    });
  }

  try {
    const params = new URLSearchParams({
      key: KEEPA_KEY,
      domain: '1',
      asin,
      stats: '90',
    });

    const res = await fetch(`${KEEPA_BASE}?${params.toString()}`);
    const data = await res.json();

    if (!data.products?.length) {
      return NextResponse.json({ error: 'Product not found on Keepa', asin, tokensLeft: data.tokensLeft || 0 }, { status: 404 });
    }

    const result = processKeepaProduct(data.products[0], {
      asin,
      title: titleParam || (data.products[0].title as string) || '',
      price: costParam,
    });

    return NextResponse.json({ ...result, tokensLeft: data.tokensLeft || 0 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ============================================================================
// POST: Batch — up to 100 ASINs per Keepa call
// ============================================================================
export async function POST(req: NextRequest) {
  if (!KEEPA_KEY) {
    return NextResponse.json({ error: 'KEEPA_API_KEY not set' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { products } = body as { products: Array<{ asin: string; title: string; price: number }> };

    if (!products?.length) {
      return NextResponse.json({ error: 'No products provided' }, { status: 400 });
    }

    const results: Record<string, MarketPriceResult> = {};
    const errors: string[] = [];
    let tokensLeft = 0;

    // Keepa: up to 100 ASINs per call
    const BATCH = 100;
    for (let i = 0; i < products.length; i += BATCH) {
      const batch = products.slice(i, i + BATCH);
      const asinList = batch.map(p => p.asin).join(',');

      try {
        const params = new URLSearchParams({
          key: KEEPA_KEY,
          domain: '1',
          asin: asinList,
          stats: '90',
        });

        const res = await fetch(`${KEEPA_BASE}?${params.toString()}`, {
          signal: AbortSignal.timeout(30000),
        });
        const data = await res.json();
        tokensLeft = data.tokensLeft || 0;

        if (data.products && Array.isArray(data.products)) {
          for (const kp of data.products) {
            const asin = kp.asin as string;
            const inputProduct = batch.find(p => p.asin === asin);
            if (!inputProduct) continue;
            try {
              results[asin] = processKeepaProduct(kp, inputProduct);
            } catch (parseErr) {
              errors.push(`${asin}: ${String(parseErr).substring(0, 80)}`);
            }
          }
        }

        // Rate limit pause between batches
        if (i + BATCH < products.length) await new Promise(r => setTimeout(r, 2000));
      } catch (batchErr) {
        errors.push(`Batch ${Math.floor(i/BATCH)+1}: ${String(batchErr).substring(0, 80)}`);
      }
    }

    return NextResponse.json({
      results,
      total: products.length,
      priced: Object.keys(results).length,
      errors: errors.length > 0 ? errors : undefined,
      tokensLeft,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
