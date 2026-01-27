# 🔍 Rainforest API Integration - How It Works & Why List is Empty

## **The Problem: Empty Competitor Prices List**

Your "Competitor Prices & Availability" list is empty because:

1. **No products have ASINs linked** - Rainforest API requires Amazon ASINs (product IDs)
2. **Sync hasn't been triggered** - Manual sync needs to be run
3. **No data has been fetched yet** - First sync populates the database

---

## **Where Rainforest API Is Called**

### **1. Core Implementation** (`lib/price-sync.ts`) a
```typescript
// Lines 12-13: API Configuration
const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY || '';
const RAINFOREST_BASE_URL = 'https://api.rainforestapi.com/request';

// Lines 28-56: rainforestRequest() function
// Makes actual HTTP calls to Rainforest API
async function rainforestRequest(asin: string): Promise<RainforestProduct | null> {
  // Fetches product data by ASIN
  // Returns price, availability, prime eligibility, etc.
}

// Lines 88-126: fetchCompetitorPrice() function
// Public function that calls rainforestRequest() and saves to database
// This is the main function that gets prices
```

**What it does:**
- ✅ Accepts Amazon ASIN (e.g., "B0BDHWDR12")
- ✅ Calls Rainforest API with rate limiting (1.1 seconds between requests)
- ✅ Extracts price, availability, prime eligibility
- ✅ Stores result in `competitor_prices` database table
- ✅ Records price history for trends

### **2. API Endpoint** (`app/api/prices/route.ts`)
```typescript
// Lines 440-475: POST /api/prices?action=sync-all
// Receives product list with ASINs
// Calls syncProductPrices() to fetch all competitor prices
```

**Endpoints that trigger Rainforest API:**
- `POST /api/prices?action=sync-all` - Batch sync (calls fetchCompetitorPrice for each product)
- `POST /api/prices?action=sync-product` - Single product sync
- `POST /api/prices?action=link-asin` - Link ASIN to product

### **3. UI Trigger** (`components/price-intelligence/PriceIntelligencePanel.tsx`)
```typescript
// Lines 553-577: handleSync() function
// Finds stale products (not updated in 24 hours)
// Calls POST /api/prices?action=sync-all
// Then refreshes the UI
```

---

## **The Data Flow**

```
┌─────────────────────────────────────────────────────────┐
│  Step 1: Link Products to Amazon ASINs                  │
│  - Go to Products page                                   │
│  - For each product, add ASIN (e.g., B0BDHWDR12)        │
│  - Save product with ASIN in competitor_prices table    │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────────────┐
│  Step 2: Trigger Price Intelligence Sync                │
│  - Go to Price Intelligence page                        │
│  - Click "Sync Prices" button                           │
│  - PriceIntelligencePanel.handleSync() is called        │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────────────┐
│  Step 3: API Collects Products                          │
│  - POST /api/prices?action=sync-all                     │
│  - Gets list of products with ASINs                     │
│  - Creates price_sync_jobs record                       │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────────────┐
│  Step 4: Rainforest API Called                          │
│  - For EACH product's ASIN:                             │
│  - rainforestRequest(asin) is called                    │
│  - HTTP GET to https://api.rainforestapi.com/request    │
│  - API key sent in request                             │
│  - Waits 1.1 seconds between requests (rate limit)     │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────────────┐
│  Step 5: Results Stored in Database                     │
│  - fetchCompetitorPrice() saves to competitor_prices   │
│  - Records: price, availability, is_prime, etc.        │
│  - Also saves price_history for trends                 │
│  - Updates price_sync_jobs status                      │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────────────┐
│  Step 6: UI Fetches & Displays                          │
│  - GET /api/prices?action=list                         │
│  - UI displays competitor_prices table                 │
│  - Shows pricing, availability, margins                │
└─────────────────────────────────────────────────────────┘
```

---

## **Why Your List is Empty**

### **Reason 1: No Products with ASINs**
The `competitor_prices` table is empty because no products have been linked to ASINs yet.

**How to fix:**
1. Go to **Products** page
2. For each product, add its Amazon ASIN
3. Products MUST have ASINs before sync can work

### **Reason 2: Sync Never Triggered**
Even if products have ASINs, the sync hasn't been manually run yet.

**How to fix:**
1. Go to **Price Intelligence** page
2. Look for "Sync Prices" button (in header or card)
3. Click it to start fetching competitor prices
4. Takes 1-2 seconds per product (rate limited)

### **Reason 3: API Key Not Configured**
If `RAINFOREST_API_KEY` is missing or invalid, API calls fail silently.

**Check your `.env` file:**
```
RAINFOREST_API_KEY=7556F6A6E052431A9480F9E50B9B942E
```

**If empty:**
1. Get free API key from https://www.rainforestapi.com/
2. Add to `.env`
3. Restart the application

---

## **Testing Rainforest API Connection**

Call this function to test if API is configured:
```typescript
// In lib/price-sync.ts
export async function testRainforestConnection(): Promise<{ success: boolean; message: string }> {
  // Tests connection with sample ASIN
  // Returns: { success: true, message: 'Rainforest API connected successfully' }
  //     or: { success: false, message: 'Rainforest API key not configured' }
}
```

You can call this from the browser console or create a test endpoint.

---

## **What Should Happen After Sync**

After running sync, you should see:

### **✅ In `competitor_prices` table:**
- product_id
- asin (Amazon product ID)
- competitor_price (Amazon price)
- competitor_url (Amazon link)
- our_price (your store price)
- availability (in stock, out of stock, etc.)
- is_prime (true/false)
- price_difference (our_price - competitor_price)
- fetched_at (timestamp of sync)

### **✅ In `price_history` table:**
- Historical price records for trends

### **✅ In `price_sync_jobs` table:**
- Job status: "completed" or "failed"
- processed: count of products synced
- errors: count of failures

---

## **Complete Setup Checklist**

- [ ] **API Key Configured**
  - [ ] `.env` has `RAINFOREST_API_KEY` set
  - [ ] Test connection with `testRainforestConnection()`

- [ ] **Products Linked**
  - [ ] Go to Products page
  - [ ] Add ASIN for each product you want to track
  - [ ] Example ASIN: B0BDHWDR12 (14-character code from Amazon)

- [ ] **Database Ready**
  - [ ] `competitor_prices` table exists
  - [ ] `price_history` table exists
  - [ ] `price_sync_jobs` table exists
  - [ ] `margin_alerts` table exists (just added)

- [ ] **Sync Triggered**
  - [ ] Go to Price Intelligence page
  - [ ] Click "Sync Prices" button
  - [ ] Wait for completion (1-2 sec per product)
  - [ ] Refresh page to see results

- [ ] **Data Appears**
  - [ ] Competitor Prices & Availability table shows data
  - [ ] Stats (tracked products, profit, etc.) update
  - [ ] Price history available in modals

---

## **Finding Product ASINs**

### **Method 1: From Amazon URL**
```
https://www.amazon.com/Some-Product-Title/dp/B0BDHWDR12
                                              ^^^^^^^^^^^
                                              This is ASIN
```

### **Method 2: Using Rainforest Search API**
```typescript
// In lib/price-sync.ts, there's a searchAmazonProducts() function
export async function searchAmazonProducts(query: string, category?: string): Promise<any[]>
```

This searches Amazon and returns products with ASINs.

---

## **Common Issues & Solutions**

| Issue | Cause | Solution |
|-------|-------|----------|
| Empty list after sync | API key invalid | Check RAINFOREST_API_KEY in .env |
| Sync runs slowly | Rate limiting | Normal - 1.1 sec between requests |
| Price shows $0 | Product not on Amazon | Check ASIN is correct |
| "Could not find table" errors | Schema missing | Run schema.sql in Supabase |
| Synced but no data | Database connection failed | Check Supabase URL & key |

