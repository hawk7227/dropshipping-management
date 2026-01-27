# 📦 How to Populate Product ASIN Field

There are **4 ways** to add ASINs to your products. Choose based on your situation:

---

## **Method 1: Manual Entry (Easiest for Small Catalog)**

**Time: 2 minutes per product**

### Step-by-step:
1. Go to **Products** page in your dashboard
2. Click on a product to edit
3. Find the **"ASIN"** field
4. Enter the 14-character Amazon ASIN (e.g., `B0BDHWDR12`)
5. Click **Save**
6. Repeat for each product

### Where to find ASIN:
- Open product on Amazon.com
- Look at URL: `https://www.amazon.com/Product-Name/dp/B0BDHWDR12`
- The ASIN is the 10-14 character code after `/dp/`

### Finding the ASIN code:
```
Amazon URL: https://www.amazon.com/Apple-AirPods-Charging-Latest-Model/dp/B0935D2JQC
                                                                        ^^^^^^^^^^
                                                                        This is the ASIN
```

---

## **Method 2: CSV Bulk Import (Best for 50+ Products)**

**Time: 15 minutes for 1000 products**

### Step 1: Prepare CSV File

Create a file called `products_with_asin.csv`:

```csv
product_id,title,asin
prod_123,Apple AirPods Pro,B0935D2JQC
prod_456,Sony Headphones,B09M8Y98MG
prod_789,Samsung Phone,B09KQKPN7J
prod_101,iPad Air,B09G9LX8NJ
```

**Required columns:**
- `product_id` - Your internal product ID
- `asin` - Amazon ASIN (can also be in other format)

**Optional columns:**
- `title` - Product title
- `competitor_link` - Full Amazon URL

### Step 2: Upload via Products Page

1. Go to **Products** → **Bulk Import** tab
2. Click **Upload File**
3. Select your CSV
4. **Field Mapping:**
   - Map `product_id` → Product ID
   - Map `asin` → ASIN
   - Map `competitor_link` → Competitor Link (optional)
5. Click **Preview**
6. Click **Import**
7. Wait for completion

---

## **Method 3: Automatic Search & Link (Smart - Uses Rainforest API)**

**Time: 2 seconds per product (with API calls)**

Create a batch job that searches Amazon for your products:

### Step 1: Create Search Endpoint

Add this endpoint to `/app/api/products/route.ts`:

```typescript
case 'find-asins': {
  const { productIds } = body;
  const results: { product_id: string; asin?: string; url?: string }[] = [];
  
  for (const productId of productIds) {
    const { data: product } = await supabase
      .from('products')
      .select('title')
      .eq('id', productId)
      .single();
    
    if (product) {
      // Search Amazon for this product
      const searchResults = await searchAmazonProducts(product.title);
      
      if (searchResults.length > 0) {
        const match = searchResults[0];
        
        // Save ASIN to product
        await supabase
          .from('products')
          .update({
            asin: match.asin,
            competitor_link: match.link,
            updated_at: new Date().toISOString()
          })
          .eq('id', productId);
        
        results.push({
          product_id: productId,
          asin: match.asin,
          url: match.link
        });
      }
    }
  }
  
  return NextResponse.json({ success: true, data: results });
}
```

### Step 2: Call from UI

```typescript
// In ProductsPanel.tsx or any component
async function autoLinkASINs() {
  const res = await fetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'find-asins',
      productIds: products.map(p => p.id)
    })
  });
  
  const result = await res.json();
  console.log(`Found ASINs for ${result.data.length} products`);
  fetchData(); // Refresh
}
```

**Pros:**
- ✅ Automatic
- ✅ Accurate for exact matches
- ✅ Also gets Amazon URLs

**Cons:**
- ⚠️ Requires Rainforest API key
- ⚠️ Slower (rate limited)
- ⚠️ Not 100% accurate if product name differs

---

## **Method 4: Manual Amazon Link Entry**

**Time: 3 minutes per product**

Let users paste the full Amazon URL and extract ASIN:

### UI Component (Add to Products Page)

```typescript
interface ASINPopupProps {
  productId: string;
  onSave: (asin: string, url: string) => void;
}

export function AddASINModal({ productId, onSave }: ASINPopupProps) {
  const [amazonUrl, setAmazonUrl] = useState('');
  const [asin, setAsin] = useState('');

  function extractASIN(url: string) {
    // Extract ASIN from URL: https://amazon.com/.../dp/B0XXXXX
    const match = url.match(/\/dp\/([A-Z0-9]{10})/);
    if (match) {
      setAsin(match[1]);
      return match[1];
    }
    return '';
  }

  async function handleSave() {
    if (!asin) {
      alert('Invalid Amazon URL or ASIN');
      return;
    }

    const res = await fetch('/api/products', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update-asin',
        productId,
        asin,
        competitor_link: amazonUrl
      })
    });

    if (res.ok) {
      onSave(asin, amazonUrl);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label>Paste Amazon Product URL</label>
        <input
          value={amazonUrl}
          onChange={(e) => {
            setAmazonUrl(e.target.value);
            extractASIN(e.target.value);
          }}
          placeholder="https://amazon.com/Product-Name/dp/B0XXXXX"
        />
      </div>

      {asin && (
        <div className="bg-green-50 p-3 rounded">
          ✅ ASIN Found: <code>{asin}</code>
        </div>
      )}

      <button onClick={handleSave} disabled={!asin}>
        Save ASIN
      </button>
    </div>
  );
}
```

---

## **Recommended Approach (By Scenario)**

### **Scenario 1: Migrating Existing Store (1000+ products)**
```
Best: Method 2 (CSV Bulk Import)
1. Export existing products with ASINs from Shopify metafields
2. Create CSV with product_id + asin
3. Use bulk import feature
4. Done in 5 minutes
```

### **Scenario 2: Small New Store (10-50 products)**
```
Best: Method 1 (Manual) + Method 4 (Link)
1. For known products: Paste Amazon link, extract ASIN
2. For new products: Manually find ASIN
3. Takes 2-3 hours for 50 products
```

### **Scenario 3: Dynamic Catalog (Adding products weekly)**
```
Best: Method 3 (Automatic Search)
1. Set up auto-search endpoint
2. When new product added, run search
3. ASIN auto-populated
4. Manual review if wrong match
```

### **Scenario 4: Shopify Store with Metafields**
```
Best: Method 2 + Shopify Sync
1. Store ASIN in Shopify product metafields
2. Sync pulls ASINs automatically
3. Add code to /lib/product-management.ts to extract ASINs
```

---

## **Database Schema Update**

I've already updated the schema to add two fields:

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS asin text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS competitor_link text;
CREATE INDEX IF NOT EXISTS idx_products_asin ON products(asin);
```

**To apply this:**
1. Go to Supabase dashboard
2. Open SQL editor
3. Run the commands above
4. Click Execute

Or it will auto-migrate when you restart the app.

---

## **API to Save ASIN**

Add this to `/app/api/products/route.ts` to handle updates:

```typescript
case 'update-asin': {
  const { productId, asin, competitor_link } = body;
  
  const { data, error } = await supabase
    .from('products')
    .update({
      asin,
      competitor_link,
      updated_at: new Date().toISOString()
    })
    .eq('id', productId)
    .select()
    .single();

  if (error) throw error;
  
  return NextResponse.json({ success: true, data });
}
```

---

## **Verification: Check if ASINs Were Saved**

```typescript
// Run in browser console
fetch('/api/products?action=list')
  .then(r => r.json())
  .then(d => {
    const withASIN = d.data.filter(p => p.asin);
    const withoutASIN = d.data.filter(p => !p.asin);
    console.log(`With ASIN: ${withASIN.length}`);
    console.log(`Without ASIN: ${withoutASIN.length}`);
    console.log('Products without ASIN:', withoutASIN.map(p => p.title));
  });
```

---

## **Next Step: Trigger Price Sync**

Once ASINs are populated:

1. Go to **Price Intelligence** page
2. Click **Sync Prices** button
3. Wait 1-2 seconds per product
4. Competitor prices will appear

---

## **Troubleshooting**

| Issue | Solution |
|-------|----------|
| ASIN field not appearing | Run schema update in Supabase SQL editor |
| Can't find ASIN on Amazon | Product might be under different name or marketplace |
| Import fails | Check CSV format, make sure columns match expected names |
| Auto-search returns wrong product | Product name too generic, manually review/correct |
| Prices still empty after sync | Verify ASINs were actually saved to database |

---

## **Quick Checklist**

- [ ] Schema updated with `asin` and `competitor_link` fields
- [ ] Products have ASINs populated (check via API)
- [ ] `.env` has `RAINFOREST_API_KEY` configured
- [ ] Price Intelligence page loads
- [ ] Click "Sync Prices" button
- [ ] Wait 1-2 min for data to appear
- [ ] Competitor prices show in table ✅
