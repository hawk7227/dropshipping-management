# ✅ ASIN Population - Complete Setup Summary

I've created a complete system for populating ASINs for your products. Here's what's been set up:

---

## **📋 What Was Added** s

### **1. Database Schema Update**a
✅ Added to `supabase/schema.sql`:
- `asin` field (text) - Stores the 10-char Amazon ASINa
- `competitor_link` field (text) - Stores full Amazon product URL
- Index on `asin` for faster lookups

**Status:** Ready to apply - Run schema migration in Supabase or restart app

### **2. API Endpoints**
✅ Added to `app/api/products/route.ts`:

- **PUT /api/products?action=update-asin**
  - Updates single product's ASIN
  - Params: `productId`, `asin`, `competitor_link`

- **PUT /api/products?action=bulk-update-asin**
  - Updates multiple products at once
  - Params: `updates` array with product info
  - Returns: Success/fail count

### **3. React Components**
✅ Created `components/products/AddASINModal.tsx`:

- **`<AddASINModal />` Component**
  - Modal for adding ASIN to single product
  - Extracts ASIN from Amazon URL or accepts raw code
  - Validates ASIN format (10 chars, starts with B)
  - Props: `isOpen`, `productId`, `productTitle`, `currentASIN`, `onClose`, `onSave`

- **`<BulkASINUploadModal />` Component**
  - Modal for bulk CSV import
  - Accepts CSV with: product_id, asin, competitor_link
  - Preview before upload
  - Props: `isOpen`, `onClose`, `onUpload`

---

## **🚀 How to Use (4 Methods)**

### **Method 1: Manual Entry (Easiest)**

```tsx
// In ProductsPanel.tsx or product detail page
import { AddASINModal } from '@/components/products/AddASINModal';

function ProductDetail() {
  const [showASINModal, setShowASINModal] = useState(false);

  const handleSaveASIN = async (asin: string, url: string) => {
    await fetch('/api/products?action=update-asin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: product.id,
        asin,
        competitor_link: url
      })
    });
    // Refresh product data
  };

  return (
    <>
      <button onClick={() => setShowASINModal(true)}>
        Add ASIN
      </button>

      <AddASINModal
        isOpen={showASINModal}
        productId={product.id}
        productTitle={product.title}
        currentASIN={product.asin}
        onClose={() => setShowASINModal(false)}
        onSave={handleSaveASIN}
      />
    </>
  );
}
```

### **Method 2: Bulk CSV Import**

```tsx
// In ProductsPanel.tsx
import { BulkASINUploadModal } from '@/components/products/AddASINModal';

function ProductsPanel() {
  const [showBulkUpload, setShowBulkUpload] = useState(false);

  const handleBulkUpload = async (updates) => {
    const res = await fetch('/api/products?action=bulk-update-asin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates })
    });
    const result = await res.json();
    alert(`Updated ${result.data.summary.successful} products`);
    // Refresh list
  };

  return (
    <>
      <button onClick={() => setShowBulkUpload(true)}>
        📥 Bulk Import ASINs
      </button>

      <BulkASINUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onUpload={handleBulkUpload}
      />
    </>
  );
}
```

### **Method 3: CSV Format Example**

Create file `products_asin.csv`:

```csv
product_id,asin,competitor_link
prod_001,B0935D2JQC,https://amazon.com/Apple-AirPods/dp/B0935D2JQC
prod_002,B09M8Y98MG,https://amazon.com/Sony-Headphones/dp/B09M8Y98MG
prod_003,B09KQKPN7J,https://amazon.com/Samsung-Phone/dp/B09KQKPN7J
```

Then upload via UI with `BulkASINUploadModal`

### **Method 4: API Direct Call**

```bash
# Update single product
curl -X PUT http://localhost:3000/api/products?action=update-asin \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod_123",
    "asin": "B0935D2JQC",
    "competitor_link": "https://amazon.com/..."
  }'

# Bulk update
curl -X PUT http://localhost:3000/api/products?action=bulk-update-asin \
  -H "Content-Type: application/json" \
  -d '{
    "updates": [
      { "productId": "prod_123", "asin": "B0935D2JQC" },
      { "productId": "prod_456", "asin": "B09M8Y98MG" }
    ]
  }'
```

---

## **🔍 Finding Amazon ASINs**

### **Option A: From URL**
```
URL: https://www.amazon.com/Apple-AirPods-Pro/dp/B0935D2JQC
                                              ^^^^^^^^^^
                                              ASIN Code
```

### **Option B: Search Amazon**
1. Go to amazon.com
2. Search for your product
3. Open product page
4. Look for `/dp/B0XXXXX` in URL

### **Option C: Use API Search**
```typescript
// Already implemented in lib/price-sync.ts
import { searchAmazonProducts } from '@/lib/price-sync';

const results = await searchAmazonProducts('Apple AirPods Pro');
// Returns: { asin: 'B0935D2JQC', title: '...', link: '...' }
```

---

## **✔️ Verification Checklist**

- [ ] Schema migrated (asin + competitor_link columns added)
- [ ] API endpoints working
  - [ ] Test: `PUT /api/products?action=update-asin`
  - [ ] Test: `PUT /api/products?action=bulk-update-asin`
- [ ] Components imported in ProductsPanel
  - [ ] `AddASINModal` for single product
  - [ ] `BulkASINUploadModal` for bulk import
- [ ] Products have ASINs populated
  - [ ] Check: `fetch('/api/products?action=list').then(r => r.json()).then(d => d.data.filter(p => p.asin))`
- [ ] Rainforest API key configured in `.env`
- [ ] Price Intelligence sync triggered
- [ ] Competitor prices showing in table ✅

---

## **📊 Complete Data Flow**

```
┌─────────────────────────────────────┐
│ 1. Add ASINs to Products            │
│    Manual entry / CSV import        │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│ 2. Save to Database                 │
│    PUT /api/products?action=...     │
│    → products.asin field            │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│ 3. Verify ASINs                     │
│    Fetch products list              │
│    Check asin field populated       │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│ 4. Click Sync Prices                │
│    Price Intelligence page          │
│    handleSync() triggers            │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│ 5. Rainforest API Called            │
│    For each ASIN:                   │
│    rainforestRequest(asin)          │
│    Fetches: price, availability     │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│ 6. Results Saved                    │
│    competitor_prices table          │
│    price_history table              │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│ 7. Display in UI                    │
│    Price Intelligence page          │
│    Competitor prices visible ✅    │
└─────────────────────────────────────┘
```

---

## **📚 Next Steps**

1. **Run schema migration:**
   - Go to Supabase SQL editor
   - Run lines from schema.sql related to asin field
   - OR restart app (auto-migration)

2. **Integrate components:**
   - Import `AddASINModal` in ProductsPanel
   - Add "Add ASIN" button to product table
   - Add "Bulk Import" button to toolbar

3. **Populate products:**
   - Use one of the 4 methods above
   - Verify via API: `GET /api/products?action=list`

4. **Run price sync:**
   - Go to Price Intelligence
   - Click "Sync Prices"
   - Wait 1-2 min
   - See competitor prices appear ✅

---

## **🐛 Troubleshooting**

| Issue | Fix |
|-------|-----|
| ASIN field not visible | Run schema migration in Supabase |
| Bulk import not working | Check CSV format (product_id, asin columns required) |
| API returns 400 | Verify `productId` and `asin` fields in request |
| Products still no ASIN | Check if update actually saved in database |
| Prices still empty after sync | Verify ASINs populated, then click sync again |

---

## **📖 Documentation Files**

- **[POPULATE_ASIN_GUIDE.md](./POPULATE_ASIN_GUIDE.md)** - Detailed guide with 4 methods
- **[RAINFOREST_API_GUIDE.md](./RAINFOREST_API_GUIDE.md)** - API integration details
- **[QUICK_START.md](./QUICK_START.md)** - 3-step quick setup

---

**Ready to start adding ASINs! 🚀**
