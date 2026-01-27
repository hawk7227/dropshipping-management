# 🚀 Quick Start: Getting Competitor Prices to Show

## **TL;DR - 3 Steps**

### **1. Add Products with ASINs**
```typescript
// Your products need Amazon ASINs to track prices
// Example ASIN: B0BDHWDR12

// In Products table, add ASIN field for products you want to track
```

### **2. Configure Rainforest API Key**
```env
# File: .env (root of project)
RAINFOREST_API_KEY=7556F6A6E052431A9480F9E50B9B942E

# Get free key from: https://www.rainforestapi.com/
```

### **3. Click "Sync Prices" on Price Intelligence Page**
- Opens `/app/prices` 
- Click sync button
- Waits 1-2 seconds per product
- Data populates automatically

---

## **What Rainforest API Does**

**Rainforest API** = Service that scrapes Amazon for product data

When you trigger a sync:
1. **Your app** → sends ASIN to Rainforest API
2. **Rainforest** → scrapes Amazon product page
3. **Returns** → Price, availability, prime status, rating, etc.
4. **Your app** → saves to database
5. **UI** → displays in Price Intelligence page

**Cost**: Free tier available (~100 requests/month), paid plans for more

---

## **Where to Find Each Component**

### **Environment Configuration**
```
/.env
RAINFOREST_API_KEY=xxxxx
```

### **Price Sync Library**
```
/lib/price-sync.ts
├── rainforestRequest() ← Makes API calls
├── fetchCompetitorPrice() ← Saves to DB
└── syncProductPrices() ← Batch sync
```

### **API Endpoint**
```
/app/api/prices/route.ts
├── POST /api/prices?action=sync-all ← Triggers sync
├── POST /api/prices?action=sync-product ← Single product
└── GET /api/prices?action=list ← Fetch results
```

### **UI Component**
```
/components/price-intelligence/PriceIntelligencePanel.tsx
├── handleSync() ← Click handler
├── fetchData() ← Load from DB
└── Stats display ← Shows tracked products
```

### **Database Tables**
```
Supabase Tables:
├── competitor_prices ← Where results are stored
├── price_history ← Historical prices for trends
├── price_sync_jobs ← Sync job status tracking
└── margin_alerts ← Margin violations
```

---

## **Example Flow in Code**

```typescript
// 1. User clicks "Sync Prices" button in UI
// File: PriceIntelligencePanel.tsx, line 553
async function handleSync() {
  const syncRes = await fetch('/api/prices', {
    method: 'POST',
    body: JSON.stringify({ action: 'sync-all', productIds: [...] })
  });
}

// 2. API receives request
// File: /app/api/prices/route.ts, line 440
case 'sync-all': {
  const result = await syncProductPrices(productIds);
}

// 3. Library syncs each product
// File: lib/price-sync.ts, line 128+
export async function syncProductPrices(products, batchSize = 10) {
  for (const product of products) {
    const competitorPrice = await fetchCompetitorPrice(
      product.product_id,
      product.asin,  // ← Needs this!
      product.our_price
    );
  }
}

// 4. Fetches from Rainforest API
// File: lib/price-sync.ts, line 88
export async function fetchCompetitorPrice(...) {
  const product = await rainforestRequest(asin); // ← API call here
  // Saves to database
  await supabase.from('competitor_prices').upsert(record);
}

// 5. rainforestRequest makes HTTP call
// File: lib/price-sync.ts, line 28
async function rainforestRequest(asin: string) {
  const response = await fetch(`${RAINFOREST_BASE_URL}?${params}`);
  // ↑ This hits https://api.rainforestapi.com/request
}

// 6. UI displays results
// File: PriceIntelligencePanel.tsx, line 200
const pricesRes = await fetch('/api/prices?action=list');
// ↑ Gets competitor_prices from database
```

---

## **Visual Data Flow**

```
┌──────────────────┐
│  Price Intell.   │ ← /components/price-intelligence/
│  Page            │   PriceIntelligencePanel.tsx
└────────┬─────────┘
         │ clicks "Sync"
         ↓
┌──────────────────────────────┐
│  POST /api/prices            │ ← /app/api/prices/route.ts
│  ?action=sync-all            │
└────────┬─────────────────────┘
         │
         ↓
┌──────────────────────────────┐
│  syncProductPrices()         │ ← /lib/price-sync.ts
│  - For each product ASIN     │
└────────┬─────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────┐
│  rainforestRequest(asin)                     │ ← Makes real API call
│  fetch("rainforestapi.com/request")          │
└────────┬─────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────┐
│  Rainforest API                              │
│  Returns: { price, availability, etc }      │
└────────┬─────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────┐
│  Save to Database                            │
│  INSERT INTO competitor_prices (...)         │
└────────┬─────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────┐
│  UI Refreshes                                │
│  Displays competitor_prices table            │
└──────────────────────────────────────────────┘
```

---

## **Debug Steps**

### **Step 1: Check API Key**
```typescript
// Open browser console
// Go to any page and run:
fetch('/api/prices?action=stats')
  .then(r => r.json())
  .then(console.log)

// If you see data, database is connected
// If you see error, check .env file
```

### **Step 2: Check Products**
```typescript
// Make sure products have ASINs
fetch('/api/products?action=list')
  .then(r => r.json())
  .then(d => console.log(d.data.filter(p => p.asin)))

// Should see products with asin field populated
```

### **Step 3: Check Sync Status**
```typescript
// After clicking sync, check job status
fetch('/api/prices?action=sync-status')
  .then(r => r.json())
  .then(console.log)

// Should show: { status: 'completed', processed: N, errors: 0 }
```

### **Step 4: Check Results**
```typescript
// See if data was saved
fetch('/api/prices?action=list')
  .then(r => r.json())
  .then(d => console.log('Products tracked:', d.data.length))

// Should show > 0 if sync succeeded
```

---

## **If Still Empty**

Check in this order:

1. ✅ `.env` has `RAINFOREST_API_KEY` (not empty)
2. ✅ Products page shows products with ASINs filled in
3. ✅ Click sync button - wait 5-10 seconds
4. ✅ Refresh price intelligence page
5. ✅ Check browser console for errors
6. ✅ Check Supabase dashboard for competitor_prices records

If still nothing, see **RAINFOREST_API_GUIDE.md** for detailed troubleshooting.
