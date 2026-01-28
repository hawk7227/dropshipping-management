# 🔍 Rainforest API Integration Guide

## Overview

Rainforest API provides **real-time Amazon product data** for price checks, product search, and validation. It's used for:

- **Initial product discovery** - Search Amazon for products matching your criteria
- **ASIN validation** - Verify products exist and get current details
- **Current price fetching** - Get live Amazon prices for competitor comparison
- **Product search** - Find products by keyword in specific categories

> **Note:** For **historical price/BSR data** and **demand scoring**, see [KEEPA_API.md](./KEEPA_API.md)

---

## 🔑 API Configuration

### Environment Variables

```bash
# .env or .env.local
RAINFOREST_API_KEY=your_rainforest_api_key_here
```

### Getting Your API Key

1. Go to [https://www.rainforestapi.com/](https://www.rainforestapi.com/)
2. Create an account (free tier available with 100 requests/month)
3. Copy your API key from the dashboard

### Pricing Tiers

| Plan | Requests/Month | Cost | Best For |
|------|---------------|------|----------|
| Free | 100 | $0 | Testing |
| Basic | 2,500 | $49 | Small stores |
| Pro | 10,000 | $149 | Medium stores |
| Business | 50,000 | $499 | High volume |

Each request costs approximately $0.015-$0.02 depending on plan.

---

## 📁 File Structure

```
lib/
├── config/
│   └── pricing-rules.ts      # API cost tracking config
├── services/
│   └── rainforest.ts         # Rainforest service wrapper
├── price-sync.ts             # Uses Rainforest for price sync
├── product-discovery.ts      # Uses Rainforest for product search
└── rainforest.ts             # Legacy Rainforest functions

app/api/
├── discovery/
│   └── route.ts              # Product discovery API endpoint
└── prices/
    └── route.ts              # Price sync API endpoint
```

---

## 🔧 Core Functions

### `lib/services/rainforest.ts`

#### Configuration Check

```typescript
import { hasRainforestConfig, getRainforestStatus } from '@/lib/services/rainforest';

// Check if API is configured
if (!hasRainforestConfig()) {
  console.log('Rainforest API key not configured');
}

// Get service status
const status = getRainforestStatus();
// Returns: { configured: true, requestsToday: 45, ... }
```

#### Product Lookup by ASIN

```typescript
import { getProduct } from '@/lib/services/rainforest';

const product = await getProduct('B0BDHWDR12');
// Returns:
// {
//   asin: 'B0BDHWDR12',
//   title: 'Product Title...',
//   price: 24.99,
//   currency: 'USD',
//   availability: 'In Stock',
//   isPrime: true,
//   rating: 4.5,
//   reviewCount: 1250,
//   imageUrl: 'https://...',
//   category: 'Beauty & Personal Care',
//   brand: 'Brand Name'
// }
```

#### Product Search

```typescript
import { searchProducts } from '@/lib/services/rainforest';

const results = await searchProducts({
  query: 'silicone spatula',
  category: '284507',           // Kitchen & Dining
  minPrice: 5,
  maxPrice: 25,
  minRating: 4.0,
  primeOnly: true,
  sortBy: 'featured',
  limit: 20
});

// Returns: RainforestProduct[]
```

#### Best Sellers

```typescript
import { getBestSellers } from '@/lib/services/rainforest';

const bestSellers = await getBestSellers({
  category: '3760911',          // Beauty & Personal Care
  limit: 100
});

// Returns top 100 products in category
```

### `lib/price-sync.ts`

#### Sync Product Prices

```typescript
import { syncCompetitorPrices } from '@/lib/price-sync';

// Sync prices for products with ASINs
const result = await syncCompetitorPrices({
  productIds: ['uuid-1', 'uuid-2'],
  forceRefresh: false           // Only refresh stale data
});

// Returns: { synced: 2, errors: 0, skipped: 0 }
```

#### Get Stale Products

```typescript
import { getStaleProducts } from '@/lib/price-sync';

// Get products not updated in 24 hours
const staleProducts = await getStaleProducts(24);
// Returns: string[] of product IDs
```

### `lib/product-discovery.ts`

#### Discover New Products

```typescript
import { discoverProducts } from '@/lib/product-discovery';

const discovered = await discoverProducts({
  categories: ['beauty', 'kitchen'],
  maxProducts: 50,
  validateDemand: true          // Also check Keepa for demand score
});

// Returns: DiscoveredProduct[]
```

---

## 📊 Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. PRODUCT DISCOVERY (Finding new products to sell)            │
│     Source: Rainforest searchProducts() or getBestSellers()     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. INITIAL VALIDATION                                          │
│     - Price within range ($3-$60 Amazon cost)                   │
│     - Rating ≥ 3.5 stars                                        │
│     - Reviews ≥ 500                                             │
│     - Prime eligible                                            │
│     - Not in excluded categories                                │
│     - No excluded brand/title words                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. DEMAND VALIDATION (Uses Keepa API)                          │
│     - Get 90-day BSR history                                    │
│     - Calculate demand score                                    │
│     - Determine tier (high/medium/low/reject)                   │
│     - See KEEPA_API.md for details                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. ADD TO PRODUCTS TABLE                                       │
│     - ASIN, title, brand, category                              │
│     - Amazon price (cost)                                       │
│     - Calculated retail price (70% markup)                      │
│     - Competitor display prices                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. ONGOING PRICE SYNC (Cron job or manual)                     │
│     - Check for stale prices (> 24 hours old)                   │
│     - Refresh via Rainforest getProduct()                       │
│     - Update competitor_prices table                            │
│     - Recalculate retail prices if cost changed                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⚙️ Configuration in `pricing-rules.ts`

```typescript
// lib/config/pricing-rules.ts

export const PRICING_RULES = {
  // Discovery criteria (Rainforest search filters)
  discovery: {
    minPrice: 3,                    // Min Amazon price
    maxPrice: 25,                   // Max Amazon price
    minReviews: 500,                // Min review count
    minRating: 3.5,                 // Min star rating
    requirePrime: true,             // Must be Prime
    maxBSR: 100000,                 // Max Best Seller Rank
    minProfitPercent: 80,           // Min profit %
    maxProductsPerDay: 50,          // Daily discovery limit
    
    // Categories to exclude
    excludeCategories: [
      'Books', 'Music', 'Movies & TV', 'Video Games',
      'Software', 'Digital Music', 'Kindle Store',
    ],
    
    // Words to exclude (IP concerns)
    excludeTitleWords: [
      'Nike', 'Adidas', 'Apple', 'Samsung', 'Disney',
      'Marvel', 'Nintendo', 'Pokemon', 'NFL', 'NBA',
      // ... more in actual file
    ],
  },
  
  // API cost tracking
  apiCosts: {
    rainforest: {
      requestCostUsd: 0.015,        // Per request
      dailyBudget: 5.00,            // Max spend per day
    },
  },
  
  // Price range limits
  priceRange: {
    min: 5.00,                      // Min retail price
    max: 100.00,                    // Max retail price
    amazonMin: 3.00,                // Min Amazon cost
    amazonMax: 60.00,               // Max Amazon cost
  },
};
```

---

## 🗄️ Database Tables

### `competitor_prices` Table

```sql
CREATE TABLE competitor_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  asin TEXT NOT NULL,
  
  -- Amazon data
  amazon_price DECIMAL(10,2),
  amazon_url TEXT,
  availability TEXT,
  is_prime BOOLEAN DEFAULT false,
  
  -- Our prices
  our_price DECIMAL(10,2),
  member_price DECIMAL(10,2),
  
  -- Competitor display prices (NA Bulk Price Editor)
  amazon_display_price DECIMAL(10,2),
  costco_display_price DECIMAL(10,2),
  ebay_display_price DECIMAL(10,2),
  sams_display_price DECIMAL(10,2),
  walmart_display_price DECIMAL(10,2),
  target_display_price DECIMAL(10,2),
  
  -- Tracking
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `price_sync_jobs` Table

```sql
CREATE TABLE price_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  
  products_total INTEGER DEFAULT 0,
  products_processed INTEGER DEFAULT 0,
  products_success INTEGER DEFAULT 0,
  products_failed INTEGER DEFAULT 0,
  
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🕐 Cron Jobs

### Price Sync Cron (`app/api/cron/route.ts`)

```typescript
// GET /api/cron?job=price-sync

case 'price-sync': {
  // 1. Find stale products (not synced in 24 hours)
  const staleProducts = await getStaleProducts(24);
  
  // 2. Batch sync via Rainforest
  for (const product of staleProducts) {
    await syncCompetitorPrices({
      productIds: [product.id],
      forceRefresh: true
    });
    
    // Rate limit: 1.1 seconds between requests
    await new Promise(r => setTimeout(r, 1100));
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
      "path": "/api/cron?job=price-sync",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron?job=discovery",
      "schedule": "0 6 * * *"
    }
  ]
}
```

---

## 🔗 API Endpoints

### `POST /api/prices`

#### Sync All Products

```typescript
// Request
POST /api/prices?action=sync-all

// Response
{
  "success": true,
  "synced": 45,
  "errors": 2,
  "skipped": 3,
  "duration_seconds": 52
}
```

#### Sync Single Product

```typescript
// Request
POST /api/prices?action=sync-product
Body: { "productId": "uuid-here" }

// Response
{
  "success": true,
  "product": {
    "asin": "B0BDHWDR12",
    "amazon_price": 14.99,
    "availability": "In Stock"
  }
}
```

#### Link ASIN to Product

```typescript
// Request
POST /api/prices?action=link-asin
Body: { "productId": "uuid-here", "asin": "B0BDHWDR12" }

// Response
{
  "success": true,
  "product": { ... },
  "price": { ... }
}
```

### `POST /api/discovery`

#### Discover New Products

```typescript
// Request
POST /api/discovery?action=discover
Body: {
  "categories": ["beauty", "kitchen"],
  "maxProducts": 50,
  "validateDemand": true
}

// Response
{
  "success": true,
  "discovered": 23,
  "validated": 18,
  "rejected": 5,
  "rejectionReasons": {
    "low_demand": 3,
    "excluded_brand": 2
  }
}
```

---

## 🛠️ Rate Limiting

Rainforest API has strict rate limits. Our code handles this automatically:

```typescript
// lib/services/rainforest.ts

const RATE_LIMIT = {
  requestsPerSecond: 1,
  minDelayMs: 1100,               // 1.1 seconds between requests
  maxRetries: 3,
  retryDelayMs: 5000
};

// Automatic rate limiting
async function rainforestRequest(endpoint: string, params: any) {
  await rateLimiter.acquire();    // Wait if needed
  
  try {
    const response = await fetch(RAINFOREST_BASE_URL, { ... });
    return response.json();
  } catch (error) {
    if (error.status === 429) {
      // Rate limited - wait and retry
      await sleep(RATE_LIMIT.retryDelayMs);
      return rainforestRequest(endpoint, params);
    }
    throw error;
  }
}
```

---

## 🔍 Troubleshooting

### "Empty Competitor Prices List"

**Cause:** No products have ASINs linked.

**Solution:**
1. Go to **Products** page
2. For each product, add its Amazon ASIN
3. Go to **Price Intelligence** page
4. Click "Sync Prices"

### "API Key Not Configured"

```bash
# Check .env file
RAINFOREST_API_KEY=your_key_here

# Verify in browser console
fetch('/api/health').then(r => r.json()).then(console.log)
```

### "Rate Limit Exceeded"

Rainforest allows ~1 request/second. If you're hitting limits:

1. Reduce batch size
2. Increase delay between requests
3. Use the queue system

```typescript
// Increase delay
await new Promise(r => setTimeout(r, 2000));  // 2 seconds
```

### "Product Not Found"

1. Verify ASIN is correct (10-character code starting with B)
2. Check if product is available on Amazon US
3. Try searching: `https://www.amazon.com/dp/B0BDHWDR12`

### "Price Shows $0"

1. Product may be out of stock
2. Price might be in different currency
3. Product might be seller-fulfilled (no Prime price)

---

## 🆚 Rainforest vs Keepa: When to Use Each

| Use Case | Rainforest | Keepa |
|----------|------------|-------|
| **Search for products** | ✅ Best | ❌ No search |
| **Current price** | ✅ Real-time | ⚠️ May be 1-24h old |
| **Price history** | ❌ Current only | ✅ 90 days |
| **BSR history** | ❌ Current only | ✅ 90 days |
| **Demand scoring** | ❌ No | ✅ Built for this |
| **Product details** | ✅ Full details | ⚠️ Basic |
| **Rate limit** | ~1/second | ~60 tokens/min |
| **Cost** | ~$0.015/request | ~$0.001/token |

### Recommended Workflow

1. **Discovery:** Use Rainforest to search for products
2. **Validation:** Use Keepa to check demand score
3. **Ongoing Sync:** Use Rainforest for daily price updates
4. **Demand Refresh:** Use Keepa weekly for BSR trends

---

## 📋 Complete Setup Checklist

- [ ] **API Key Configured**
  - [ ] `.env` has `RAINFOREST_API_KEY` set
  - [ ] Key is valid (test at rainforestapi.com)

- [ ] **Database Ready**
  - [ ] `competitor_prices` table exists
  - [ ] `price_sync_jobs` table exists
  - [ ] Run `supabase/schema.sql` if not

- [ ] **Products Linked**
  - [ ] Products have ASINs assigned
  - [ ] ASINs are valid (B + 9 alphanumeric)

- [ ] **Sync Working**
  - [ ] Manual sync completes
  - [ ] Cron job configured in Vercel
  - [ ] Prices appear in database

---

## 📈 Usage Examples

### Validate Product Before Adding

```typescript
import { getProduct } from '@/lib/services/rainforest';
import { meetsDiscoveryCriteria } from '@/lib/config/pricing-rules';

async function validateProduct(asin: string) {
  // 1. Get product from Amazon
  const product = await getProduct(asin);
  if (!product) {
    return { valid: false, reason: 'Product not found on Amazon' };
  }
  
  // 2. Check discovery criteria
  const criteria = meetsDiscoveryCriteria({
    price: product.price,
    rating: product.rating,
    reviewCount: product.reviewCount,
    isPrime: product.isPrime,
    title: product.title,
    category: product.category
  });
  
  if (!criteria.meets) {
    return { valid: false, reasons: criteria.reasons };
  }
  
  return { valid: true, product };
}
```

### Bulk Price Update

```typescript
import { getStaleProducts, syncCompetitorPrices } from '@/lib/price-sync';

async function bulkPriceUpdate() {
  // Get products not updated in 24 hours
  const staleProducts = await getStaleProducts(24);
  
  console.log(`Found ${staleProducts.length} stale products`);
  
  // Sync in batches of 10 (rate limit friendly)
  const batchSize = 10;
  let processed = 0;
  
  for (let i = 0; i < staleProducts.length; i += batchSize) {
    const batch = staleProducts.slice(i, i + batchSize);
    
    await syncCompetitorPrices({
      productIds: batch,
      forceRefresh: true
    });
    
    processed += batch.length;
    console.log(`Progress: ${processed}/${staleProducts.length}`);
    
    // Wait between batches
    await new Promise(r => setTimeout(r, 15000)); // 15 seconds
  }
  
  return { processed };
}
```

---

## 🔗 Related Documentation

- [KEEPA_API.md](./KEEPA_API.md) - Historical data & demand scoring
- [DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md) - Full system overview
- [Rainforest API Docs](https://www.rainforestapi.com/docs)

---

## 📋 Quick Reference

| Function | Purpose | Cost |
|----------|---------|------|
| `getProduct(asin)` | Single product lookup | 1 request |
| `searchProducts(options)` | Search Amazon | 1 request |
| `getBestSellers(options)` | Top sellers in category | 1 request |
| `syncCompetitorPrices(options)` | Update prices in DB | 1 per product |
| `getStaleProducts(hours)` | Find products needing refresh | 0 (DB only) |
| `hasRainforestConfig()` | Check if API configured | 0 |
[RAINFOREST_API_GUIDE (1).md](https://github.com/user-attachments/files/24899619/RAINFOREST_API_GUIDE.1.md)


