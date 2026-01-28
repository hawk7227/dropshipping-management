# 📊 Keepa API Integration Guide

## Overview

Keepa provides historical Amazon price and sales rank data that powers your **demand scoring**, **BSR tracking**, and **product validation**. Unlike Rainforest API (which gets current prices), Keepa provides **90 days of historical data** to analyze trends and predict demand.

---

## 🔑 API Configuration

### Environment Variables

```bash
# .env or .env.local
KEEPA_API_KEY=your_keepa_api_key_here
```

### Getting Your API Key

1. Go to [https://keepa.com/#!api](https://keepa.com/#!api)
2. Create an account or sign in
3. Subscribe to an API plan (starts at ~$19/month for 10,000 tokens)
4. Copy your API key from the dashboard

### Token Economics

| Operation | Token Cost | Notes |
|-----------|------------|-------|
| Single product lookup | 1 token | Basic price/BSR data |
| Batch lookup (up to 100) | 1 token per product | Most efficient method |
| Best Sellers | 5 tokens | Top 10,000 per category |
| Deals | 10 tokens | Current Amazon deals |

**Token Refresh:** Tokens refill at ~5 tokens/minute (~300/hour, ~7,200/day)

---

## 📁 File Structure

```
lib/
├── config/
│   └── pricing-rules.ts      # Keepa config: rate limits, token costs, domains
├── services/
│   └── keepa.ts              # Main Keepa service (34.4 KB, 1106 lines)
└── price-sync.ts             # Uses Keepa for price synchronization

supabase/migrations/
└── 004_demand_and_bulk.sql   # Creates product_demand, keepa_api_log tables

app/api/cron/
└── route.ts                  # Cron jobs: demand-check, price-sync
```

---

## 🔧 Core Functions

### `lib/services/keepa.ts`

#### Configuration & Status

```typescript
// Check if Keepa is configured
import { hasKeepaConfig, getServiceStatus } from '@/lib/services/keepa';

if (!hasKeepaConfig()) {
  console.log('Keepa API key not configured');
}

const status = getServiceStatus();
// Returns: { configured, tokensUsedToday, estimatedTokensRemaining, ... }
```

#### Product Lookup (Single & Batch)

```typescript
import { lookupProduct, lookupProducts } from '@/lib/services/keepa';

// Single product lookup
const product = await lookupProduct('B0BDHWDR12');
// Returns: { asin, title, currentPrice, bsrHistory, priceHistory, ... }

// Batch lookup (up to 100 ASINs - most efficient)
const products = await lookupProducts(['B0BDHWDR12', 'B09V3KXJPB', 'B0B8J5L3ZP']);
// Returns: KeepaProduct[] with full historical data
```

#### Demand Analysis

```typescript
import { 
  calculateDemandScore, 
  saveDemandData, 
  detectSeasonality 
} from '@/lib/services/keepa';

// Calculate demand score (0-100) from Keepa data
const score = calculateDemandScore({
  currentBSR: 15000,
  avgBSR30d: 18000,
  avgBSR90d: 22000,
  bsrVolatility: 25,
  priceStability: 85
});
// Returns: 72 (high demand)

// Save demand data to product_demand table
await saveDemandData('product-uuid', {
  currentBSR: 15000,
  avgBSR30d: 18000,
  avgBSR90d: 22000,
  bsrHistory: [...],
  demandScore: 72
});

// Detect seasonal patterns
const seasonality = detectSeasonality(bsrHistory);
// Returns: { hasSeasonal: true, peakMonths: [11, 12], lowMonths: [1, 2] }
```

#### Queue Management

```typescript
import { 
  addToQueue, 
  processQueue, 
  getQueueStatus,
  clearQueue,
  pauseQueue,
  resumeQueue
} from '@/lib/services/keepa';

// Add products to processing queue
addToQueue([
  { asin: 'B0BDHWDR12', priority: 1 },
  { asin: 'B09V3KXJPB', priority: 2 },
]);

// Check queue status
const queueStatus = getQueueStatus();
// Returns: { pending: 2, processing: 0, completed: 0, paused: false }

// Process queue (respects rate limits)
await processQueue();

// Control queue
pauseQueue();   // Pause processing
resumeQueue();  // Resume processing
clearQueue();   // Clear all pending items
```

#### Additional Endpoints

```typescript
import { getBestSellers, getDeals } from '@/lib/services/keepa';

// Get best sellers in a category
const bestSellers = await getBestSellers({
  category: '3760911',  // Beauty & Personal Care
  domain: 1,            // US = 1
  range: 1000           // Top 1000
});

// Get current Amazon deals
const deals = await getDeals({
  priceMin: 10,
  priceMax: 50,
  percentOff: 20
});
```

---

## 📊 Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. PRODUCT DISCOVERED (via Rainforest or manual ASIN entry)    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. ADD TO KEEPA QUEUE                                          │
│     addToQueue([{ asin: 'B0BDHWDR12', priority: 1 }])          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. BATCH PROCESS (via cron or manual trigger)                  │
│     processQueue() → lookupProducts(batchOf100)                 │
│     Rate limited: 60 tokens/minute max                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. KEEPA API RESPONSE                                          │
│     - 90 days price history                                     │
│     - 90 days BSR history                                       │
│     - Current availability & Prime status                       │
│     - Review count trends                                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. CALCULATE DEMAND SCORE                                      │
│     Factors: BSR (40%) + Trend (25%) + Stability (20%) +       │
│              Review Velocity (15%)                              │
│     Result: 0-100 score                                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  6. SAVE TO DATABASE                                            │
│     saveDemandData() → product_demand table                     │
│     recordApiCall() → keepa_api_log table                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  7. CLASSIFY DEMAND TIER                                        │
│     HIGH:   BSR ≤ 25,000  + Score ≥ 70 → Check daily           │
│     MEDIUM: BSR ≤ 75,000  + Score ≥ 50 → Check every 3 days    │
│     LOW:    BSR ≤ 150,000 + Score ≥ 30 → Check weekly          │
│     REJECT: Below thresholds → Don't list                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⚙️ Configuration in `pricing-rules.ts`

```typescript
// lib/config/pricing-rules.ts

export const PRICING_RULES = {
  // Keepa API settings
  keepa: {
    tokensPerMinute: 60,           // Rate limit
    batchSize: 100,                // Max ASINs per batch
    requestTimeoutMs: 30000,       // 30 second timeout
    maxRetries: 3,
    retryDelayMs: 5000,
    
    tokenCosts: {
      product: 1,
      productBatch: 1,             // Per product in batch
      deals: 10,
      bestSellers: 5,
    },
    
    historyDays: 90,               // Days of history to fetch
    
    domains: {
      US: 1, UK: 2, DE: 3, FR: 4, JP: 5,
      CA: 6, IT: 8, ES: 9, IN: 10, MX: 11,
    },
  },
  
  // Demand thresholds (uses Keepa data)
  demand: {
    maxBSR: 150000,
    idealBSR: 50000,
    maxVolatility: 50,
    minMonthlySales: 10,
    
    tiers: {
      high:   { maxBSR: 25000,  minDemandScore: 70, refreshDays: 1 },
      medium: { maxBSR: 75000,  minDemandScore: 50, refreshDays: 3 },
      low:    { maxBSR: 150000, minDemandScore: 30, refreshDays: 7 },
    },
    
    weights: {
      bsr: 0.40,
      bsrTrend: 0.25,
      priceStability: 0.20,
      reviewVelocity: 0.15,
    },
  },
};
```

---

## 🗄️ Database Tables

### `product_demand` Table

```sql
CREATE TABLE product_demand (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  asin TEXT NOT NULL,
  
  -- Current metrics
  current_bsr INTEGER,
  current_price DECIMAL(10,2),
  
  -- Historical averages
  avg_bsr_30d INTEGER,
  avg_bsr_90d INTEGER,
  avg_price_30d DECIMAL(10,2),
  avg_price_90d DECIMAL(10,2),
  
  -- Volatility & trends
  bsr_volatility DECIMAL(5,2),
  price_volatility DECIMAL(5,2),
  bsr_trend TEXT CHECK (bsr_trend IN ('improving', 'declining', 'stable')),
  
  -- Calculated scores
  demand_score INTEGER CHECK (demand_score BETWEEN 0 AND 100),
  estimated_monthly_sales INTEGER,
  
  -- Timestamps
  last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `keepa_api_log` Table

```sql
CREATE TABLE keepa_api_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL,
  tokens_used INTEGER NOT NULL,
  asins_queried INTEGER,
  response_time_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily summary view
CREATE VIEW keepa_daily_usage AS
SELECT 
  DATE(created_at) as date,
  SUM(tokens_used) as total_tokens,
  COUNT(*) as api_calls,
  SUM(asins_queried) as products_checked,
  AVG(response_time_ms) as avg_response_ms,
  SUM(CASE WHEN success THEN 0 ELSE 1 END) as errors
FROM keepa_api_log
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## 🕐 Cron Jobs

### `app/api/cron/route.ts`

```typescript
// Demand check cron job (runs every 6 hours)
// GET /api/cron?job=demand-check

case 'demand-check': {
  // 1. Find products needing demand refresh
  const staleProducts = await getProductsNeedingDemandCheck();
  
  // 2. Batch lookup via Keepa (100 at a time)
  for (const batch of chunks(staleProducts, 100)) {
    const keepaData = await lookupProducts(batch.map(p => p.asin));
    
    // 3. Calculate and save demand scores
    for (const product of keepaData) {
      const score = calculateDemandScore(product);
      await saveDemandData(product.id, {
        ...product,
        demandScore: score
      });
    }
  }
  
  return { processed: staleProducts.length };
}
```

### Vercel Cron Schedule

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron?job=demand-check",
      "schedule": "0 */6 * * *"
    },
    {
      "path": "/api/cron?job=price-sync",
      "schedule": "0 * * * *"
    }
  ]
}
```

---

## 🧮 Demand Score Algorithm

```typescript
function calculateDemandScore(data: {
  currentBSR: number;
  bsrHistory: number[];
  priceHistory: number[];
  reviewCount: number;
  recentReviews: number;
}): number {
  const { weights } = PRICING_RULES.demand;
  let score = 0;
  
  // 1. BSR Score (40% weight)
  // Lower BSR = better. Log scale for fair comparison
  if (data.currentBSR > 0) {
    const bsrScore = Math.max(0, 100 - (Math.log10(data.currentBSR) * 15));
    score += bsrScore * weights.bsr;  // Max ~40 points
  }
  
  // 2. BSR Trend Score (25% weight)
  // Improving (going down) = good, Declining (going up) = bad
  if (data.bsrHistory.length >= 2) {
    const recent = data.bsrHistory.slice(-30);
    const older = data.bsrHistory.slice(-90, -30);
    const recentAvg = average(recent);
    const olderAvg = average(older);
    
    if (recentAvg < olderAvg) {
      // BSR improving (going down)
      const improvement = ((olderAvg - recentAvg) / olderAvg) * 100;
      score += Math.min(100, improvement * 2) * weights.bsrTrend;
    } else {
      // BSR declining (going up)
      const decline = ((recentAvg - olderAvg) / olderAvg) * 100;
      score += Math.max(0, 50 - decline) * weights.bsrTrend;
    }
  }
  
  // 3. Price Stability Score (20% weight)
  // Stable prices = predictable margins
  if (data.priceHistory.length >= 7) {
    const stdDev = standardDeviation(data.priceHistory);
    const mean = average(data.priceHistory);
    const cv = (stdDev / mean) * 100;  // Coefficient of variation
    const stabilityScore = Math.max(0, 100 - cv * 2);
    score += stabilityScore * weights.priceStability;
  }
  
  // 4. Review Velocity Score (15% weight)
  // More recent reviews = active product
  if (data.reviewCount > 0) {
    const velocityRatio = data.recentReviews / data.reviewCount;
    const velocityScore = Math.min(100, velocityRatio * 1000);
    score += velocityScore * weights.reviewVelocity;
  }
  
  return Math.round(Math.max(0, Math.min(100, score)));
}
```

### Score Interpretation

| Score | Tier | Meaning | Action |
|-------|------|---------|--------|
| 70-100 | HIGH | Strong sales, improving BSR | ✅ List immediately, check daily |
| 50-69 | MEDIUM | Decent sales, stable BSR | ✅ List, check every 3 days |
| 30-49 | LOW | Some sales, may be declining | ⚠️ List with caution, check weekly |
| 0-29 | REJECT | Poor sales or high risk | ❌ Don't list |

---

## 🔍 Troubleshooting

### "Keepa API key not configured"

```bash
# Check .env file
KEEPA_API_KEY=your_key_here

# Verify in code
console.log(process.env.KEEPA_API_KEY ? 'Key found' : 'Key missing');
```

### "Rate limit exceeded"

Keepa allows ~60 tokens/minute. If you're hitting limits:

```typescript
// Check current usage
const status = getServiceStatus();
console.log(`Tokens used today: ${status.tokensUsedToday}`);

// Reduce batch size
const SAFE_BATCH_SIZE = 50;  // Instead of 100

// Add delays between batches
await new Promise(resolve => setTimeout(resolve, 2000));
```

### "No demand data found"

1. Verify the ASIN exists on Amazon
2. Check if Keepa has data: `https://keepa.com/#!product/1-B0BDHWDR12`
3. New products may not have 90-day history

### "Demand score always 0"

Check that you're passing valid data:

```typescript
const score = calculateDemandScore({
  currentBSR: 15000,       // Must be > 0
  bsrHistory: [...],       // Must have ≥2 data points
  priceHistory: [...],     // Must have ≥7 data points
  reviewCount: 500,        // Must be > 0
  recentReviews: 50        // Recent 30-day reviews
});
```

---

## 📈 Usage Examples

### Check Product Viability Before Listing

```typescript
import { lookupProduct, saveDemandData } from '@/lib/services/keepa';
import { meetsDemandCriteria, calculateDemandScore } from '@/lib/config/pricing-rules';

async function checkProductViability(asin: string): Promise<{
  viable: boolean;
  tier: string;
  score: number;
  reason?: string;
}> {
  // 1. Get Keepa data
  const keepaData = await lookupProduct(asin);
  if (!keepaData) {
    return { viable: false, tier: 'reject', score: 0, reason: 'No Keepa data found' };
  }
  
  // 2. Calculate demand score
  const score = calculateDemandScore({
    currentBSR: keepaData.currentBSR,
    bsrHistory: keepaData.bsrHistory,
    priceHistory: keepaData.priceHistory,
    reviewCount: keepaData.reviewCount,
    recentReviews: keepaData.recentReviews,
  });
  
  // 3. Check against thresholds
  const result = meetsDemandCriteria({
    bsr: keepaData.currentBSR,
    demandScore: score
  });
  
  return {
    viable: result.meets,
    tier: result.tier,
    score,
    reason: result.reason
  };
}

// Usage
const viability = await checkProductViability('B0BDHWDR12');
if (viability.viable) {
  console.log(`✅ List this product! Tier: ${viability.tier}, Score: ${viability.score}`);
} else {
  console.log(`❌ Don't list: ${viability.reason}`);
}
```

### Bulk Check Products from CSV

```typescript
import { addToQueue, processQueue } from '@/lib/services/keepa';

async function bulkCheckASINs(asins: string[]) {
  // Add all to queue with priority
  addToQueue(asins.map((asin, index) => ({
    asin,
    priority: index  // Process in order
  })));
  
  // Process (handles rate limiting automatically)
  const results = await processQueue();
  
  // Return summary
  const summary = {
    total: asins.length,
    high: results.filter(r => r.tier === 'high').length,
    medium: results.filter(r => r.tier === 'medium').length,
    low: results.filter(r => r.tier === 'low').length,
    reject: results.filter(r => r.tier === 'reject').length,
  };
  
  return { results, summary };
}
```

---

## 🔗 Related Documentation

- [RAINFOREST_API_GUIDE.md](./RAINFOREST_API_GUIDE.md) - Current price fetching
- [DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md) - Full system overview
- [Keepa API Documentation](https://keepa.com/#!discuss/t/keepa-api-documentation/13289)
- [Keepa API Console](https://keepa.com/#!api)

---

## 📋 Quick Reference

| Function | Purpose | Tokens |
|----------|---------|--------|
| `lookupProduct(asin)` | Single product data | 1 |
| `lookupProducts(asins[])` | Batch lookup (up to 100) | 1 per ASIN |
| `saveDemandData(id, data)` | Save to database | 0 |
| `calculateDemandScore(data)` | Calculate 0-100 score | 0 |
| `addToQueue(items[])` | Add to processing queue | 0 |
| `processQueue()` | Process pending items | Varies |
| `getBestSellers(options)` | Top sellers in category | 5 |
| `getDeals(options)` | Current Amazon deals | 10 |
| `getServiceStatus()` | Check API status | 0 |
