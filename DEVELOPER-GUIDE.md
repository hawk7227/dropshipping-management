# 🚀 Dropshipping Platform - Developer Guide

## What Is This?

This is a **complete dropshipping management system** that helps you:
- Track competitor prices (Amazon, Walmart, etc.)
- Monitor if products are in stock or sold out
- See your **PROFIT or LOSS** on each product (not just savings!)
- Manage products across Shopify, eBay, TikTok, Amazon, Google
- Use AI commands to bulk edit products
- Import/export product data via CSV, JSON, Excel

---

## 🏗️ System Architecture (The Big Picture)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│                         🖥️  YOUR ADMIN DASHBOARD                                │
│                    (Next.js App - Deploy to Vercel)                            │
│                                                                                 │
│    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│    │   Price     │  │    AI       │  │   Bulk      │  │  Channel    │         │
│    │ Intelligence│  │  Command    │  │   Import    │  │  Manager    │         │
│    │   Panel     │  │   Center    │  │   Panel     │  │   Panel     │         │
│    └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ API Calls
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              🔌 API ROUTES                                      │
│                                                                                 │
│   /api/prices    /api/products    /api/ai    /api/channels    /api/social      │
└─────────────────────────────────────────────────────────────────────────────────┘
                │                       │                       │
                ▼                       ▼                       ▼
┌───────────────────────┐   ┌───────────────────────┐   ┌───────────────────────┐
│    📦 SUPABASE        │   │    🤖 EXTERNAL APIs   │   │    🛒 SALES CHANNELS  │
│    (Database)         │   │                       │   │                       │
│                       │   │  • Rainforest API     │   │  • Shopify API        │
│  • products           │   │    (Amazon prices)    │   │  • eBay API           │
│  • competitor_prices  │   │  • OpenAI             │   │  • TikTok Shop API    │
│  • price_alerts       │   │    (AI commands)      │   │  • Amazon SP-API      │
│  • monitoring_rules   │   │  • Stripe             │   │  • Google Merchant    │
│  • import_jobs        │   │    (payments)         │   │                       │
│  • users              │   │                       │   │                       │
└───────────────────────┘   └───────────────────────┘   └───────────────────────┘
                                                                    │
                                                                    ▼
                                                        ┌───────────────────────┐
                                                        │   🏪 YOUR SHOPIFY     │
                                                        │      STORE            │
                                                        │   (Customer-Facing)   │
                                                        │                       │
                                                        │  • Product pages      │
                                                        │  • Price comparison   │
                                                        │  • Stock alerts       │
                                                        └───────────────────────┘
```

---

## 📁 Where Files Go

### 1️⃣ VERCEL (Your Admin Dashboard)

Deploy the entire `unified-platform` folder to Vercel.

```
unified-platform/
├── app/                      # Pages & API routes
│   ├── page.tsx              # Homepage → redirects to /dashboard
│   ├── dashboard/            # Main dashboard
│   ├── prices/               # Price Intelligence page
│   ├── products/             # Products + Bulk Import
│   ├── ai/                   # AI Command Center
│   ├── channels/             # Multi-channel management
│   ├── analytics/            # Reports
│   └── api/                  # Backend API endpoints
│       ├── prices/route.ts   # Price tracking API
│       ├── products/route.ts # Product management API
│       ├── ai/route.ts       # AI command processing
│       └── channels/route.ts # Channel sync API
│
├── components/               # React UI components
│   ├── price-intelligence/
│   │   └── PriceIntelligencePanel.tsx  # The main price tracking UI
│   ├── products/
│   │   └── BulkImportPanel.tsx         # CSV/JSON/Excel import
│   └── ai/
│       └── AICommandCenter.tsx         # Natural language commands
│
├── lib/                      # Business logic
│   ├── price-sync.ts         # Rainforest API integration
│   ├── multichannel.ts       # Shopify/eBay/etc integration
│   └── ai-engines.ts         # OpenAI integration
│
└── supabase/
    └── schema.sql            # Database schema (run in Supabase)
```

### 2️⃣ SUPABASE (Your Database)

1. Create account at [supabase.com](https://supabase.com)
2. Create new project
3. Go to **SQL Editor**
4. Copy/paste contents of `supabase/schema.sql`
5. Click **Run**

### 3️⃣ SHOPIFY (Customer-Facing Store)

Upload these to **Shopify Admin → Themes → Edit Code**:

```
shopify-theme/
├── snippets/
│   ├── price-comparison.liquid    # Shows "Amazon: $X, Our Price: $Y"
│   ├── competitor-badge.liquid    # Shows "Save X% vs Amazon" badge
│   └── stock-alert.liquid         # Shows low stock warnings
│
├── assets/
│   └── price-sync.js              # Auto-updates prices from your API
│
└── (Add to your product template):
    {% render 'price-comparison', product: product %}
    {% render 'competitor-badge', product: product %}
    {% render 'stock-alert', product: product %}
```

---

## 🔑 Environment Variables

Create `.env.local` in your Vercel project:

```bash
# Supabase (from Supabase dashboard → Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Rainforest API (for Amazon price tracking)
# Get from: https://www.rainforestapi.com/
RAINFOREST_API_KEY=your_key_here

# OpenAI (for AI Command Center)
# Get from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-...

# Stripe (for membership/payments)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Shopify (for syncing products)
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_...

# eBay (optional)
EBAY_CLIENT_ID=...
EBAY_CLIENT_SECRET=...

# TikTok Shop (optional)
TIKTOK_APP_KEY=...
TIKTOK_APP_SECRET=...
```

---

## 📊 Understanding Profit vs Savings

### The Old Way (Savings) ❌
```
Amazon Price: $100
Our Price: $80
Savings: 20% ← This is what CUSTOMERS see
```

### The New Way (Profit) ✅
```
Amazon Price: $100
Our Price: $80
Your Cost: $65
───────────────
Profit: $15 (23% margin) ← This is what YOU need to see
```

The system now shows:
- **Green badge**: Profit > 0% (you're making money)
- **Red badge**: Profit < 0% (you're LOSING money!)
- **Percentage + Amount**: So you know exactly how much

---

## 🎯 Step-by-Step Setup

### Step 1: Deploy to Vercel (5 minutes)

```bash
# 1. Push code to GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOU/dropshipping-platform.git
git push -u origin main

# 2. Go to vercel.com
# 3. Import your GitHub repo
# 4. Add environment variables
# 5. Deploy!
```

### Step 2: Set Up Supabase (10 minutes)

1. Go to [supabase.com](https://supabase.com) → New Project
2. Copy your project URL and service key
3. Go to SQL Editor
4. Run the schema.sql file
5. Done!

### Step 3: Connect Shopify (15 minutes)

1. **Create Private App:**
   - Shopify Admin → Settings → Apps → Develop apps
   - Create new app
   - Give it permissions: Products (read/write), Inventory (read/write)
   - Get Access Token

2. **Add Liquid Snippets:**
   - Shopify Admin → Themes → Edit Code
   - Create files in `snippets/` folder
   - Add render tags to product template

3. **Set Up Metafields:**
   - Shopify Admin → Settings → Custom data → Products
   - Add these metafields:
     - `competitor.price` (Number)
     - `competitor.source` (Single line text)
     - `competitor.last_updated` (Date)
     - `inventory.cost` (Number)

### Step 4: Get API Keys (20 minutes)

| Service | What It Does | Get Key At |
|---------|--------------|------------|
| Rainforest | Gets Amazon prices | rainforestapi.com |
| OpenAI | Powers AI commands | platform.openai.com |
| Stripe | Handles payments | dashboard.stripe.com |

### Step 5: Test Everything

1. Open your Vercel URL
2. Go to `/prices` - should see empty dashboard
3. Click "Import Data" → upload a CSV
4. Go to `/ai` → try "Show all products"
5. Check Shopify store - price comparison should appear

---

## 🔧 Common Issues & Fixes

### "Prices not showing on Shopify"
- Check metafields are set up correctly
- Verify API URL in `price-sync.js`
- Check browser console for errors

### "AI commands not working"
- Check OpenAI API key is valid
- Check Supabase connection
- Look at Vercel logs

### "Import failing"
- Make sure CSV has headers in first row
- Required columns: SKU, Price, Source
- Check file is UTF-8 encoded

---

## 📝 Quick Reference: AI Commands

```
CREATE:
  "Create product Summer Hat at $29.99"
  "Add 5 new products from this list..."

EDIT:
  "Increase all prices by 10%"
  "Add tag 'sale' to products under $20"
  "Set vendor 'Nike' products to draft"

DELETE:
  "Delete products with 0 inventory"
  "Remove all draft products"

SEARCH:
  "Find products with profit below 20%"
  "Show out of stock items"
  "List products not sold in 30 days"

SYNC:
  "Sync all to Shopify"
  "Update eBay listings"
  "Push new products to all channels"
```

---

## 🆘 Need Help?

1. **Check Vercel Logs**: Vercel Dashboard → Your Project → Logs
2. **Check Supabase Logs**: Supabase Dashboard → Logs
3. **Browser Console**: Right-click → Inspect → Console tab

---

## 📦 What's Included

| Feature | Status | File |
|---------|--------|------|
| Price tracking | ✅ | PriceIntelligencePanel.tsx |
| Availability monitoring | ✅ | PriceIntelligencePanel.tsx |
| Profit/Loss display | ✅ | PriceIntelligencePanel.tsx |
| Price alerts | ✅ | PriceIntelligencePanel.tsx |
| Monitoring rules | ✅ | PriceIntelligencePanel.tsx |
| CSV import | ✅ | BulkImportPanel.tsx |
| JSON import | ✅ | BulkImportPanel.tsx |
| Excel import | ✅ | BulkImportPanel.tsx |
| AI commands | ✅ | AICommandCenter.tsx |
| Shopify sync | ✅ | multichannel.ts |
| eBay sync | ✅ | multichannel.ts |
| TikTok sync | ✅ | multichannel.ts |
| Shopify Liquid files | ✅ | shopify-theme/ |

---

**Total Setup Time: ~1 hour**

Good luck! 🎉
