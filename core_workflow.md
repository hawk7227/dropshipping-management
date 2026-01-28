# DROPSHIP PRO - CORE WORKFLOW DOCUMENTATION

> **Last Updated:** January 27, 2026  
> **Version:** 2.0  
> **Status:** Development

---

## TABLE OF CONTENTS

1. [System Overview](#system-overview)
2. [Business Model](#business-model)
3. [Product Discovery Workflow](#product-discovery-workflow)
4. [Price Sync Workflow](#price-sync-workflow)
5. [Scheduled Discovery Workflow](#scheduled-discovery-workflow)
6. [Multi-Platform Sync Workflow](#multi-platform-sync-workflow)
7. [Data Flow Architecture](#data-flow-architecture)
8. [API Integration Summary](#api-integration-summary)
9. [Database Schema](#database-schema)
10. [Cron Job Schedule](#cron-job-schedule)
11. [File Structure](#file-structure)
12. [Configuration Reference](#configuration-reference)

---

## SYSTEM OVERVIEW

Dropship Pro is a full-stack e-commerce platform for membership-based dropshipping. The platform discovers high-demand products from Amazon, applies pricing rules, and syncs across multiple sales channels (Shopify, eBay, TikTok Shop, Google Shopping).

### Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL + RLS + Auth) |
| Payments | Stripe (Subscriptions + Checkout + Webhooks) |
| Styling | Tailwind CSS |
| Deployment | Vercel (Serverless + Cron Jobs) |
| Price Intelligence | Keepa API (primary), Rainforest API (fallback) |
| AI | OpenAI GPT-4 (descriptions, SEO) |

---

## BUSINESS MODEL

### Revenue Streams

1. **Membership Fees**
   - Monthly: $9.99/month
   - Annual: $99/year (save $20.88)

2. **Product Margin**
   - 70% markup on Amazon cost
   - Members see $0 product price (shipping only)

### Pricing Formula

```
Amazon Cost ($10.00)
    ↓
Your Retail Price = Cost × 1.70 = $17.00
    ↓
Competitor Display Prices (all 80%+ higher than YOUR price):
    • Amazon Display:  $17.00 × 1.82-1.88 = $30.94 - $32.06
    • Costco Display:  $17.00 × 1.80-1.85 = $30.60 - $31.45
    • eBay Display:    $17.00 × 1.87-1.93 = $31.79 - $32.81
    • Sam's Display:   $17.00 × 1.80-1.83 = $30.60 - $31.11
```

---

## PRODUCT DISCOVERY WORKFLOW

**Philosophy:** Discovery Criteria First → Then Demand Filtering

This approach is more cost-efficient because we filter out unsuitable products (wrong price range, branded items) BEFORE spending Keepa API tokens on demand analysis.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PRODUCT DISCOVERY WORKFLOW                           │
│                    (Criteria-First, Demand-Filtered)                        │
└─────────────────────────────────────────────────────────────────────────────┘

STEP 1: KEEPA CATEGORY/BESTSELLER LOOKUP
────────────────────────────────────────
│ Source: Keepa API (batch-optimized, 100 ASINs/request)
│ 
│ Request Types:
│   • Best Sellers in category
│   • Deals/Price drops
│   • Category browse
│
│ Returns per ASIN:
│   - current_price
│   - title, images, rating, review_count
│   - is_prime
│   - current_bsr (Best Seller Rank)
│   - bsr_history_90d
│   - price_history_90d
│
└──► Raw product list (100+ products)

STEP 2: DISCOVERY CRITERIA FILTER (Instant, No API Cost)
────────────────────────────────────────────────────────
│ Apply meetsDiscoveryCriteria() from pricing-rules.ts:
│
│   ✓ Price: $3 - $25 (Amazon price)
│   ✓ Reviews: 500+ minimum
│   ✓ Rating: 3.5+ stars
│   ✓ Prime: Required
│   ✓ Brand filter: Exclude Nike, Apple, Disney, Samsung, Sony, etc.
│   ✓ Condition filter: No refurbished, renewed, used, open box
│
│ Products that FAIL criteria are logged and discarded
│ Typical pass rate: ~20-30% of products
│
└──► Criteria-qualified products (~20-30 of 100)

STEP 3: DEMAND CONSISTENCY FILTER (Instant, Same Data)
──────────────────────────────────────────────────────
│ Using BSR data already returned from Keepa:
│
│ Requirements:
│   • BSR < 100,000 in category (sufficient sales volume)
│   • BSR volatility < 50% over 90 days (stable demand)
│   • No seasonal spike pattern detected
│   • Estimated sales ≥ 10 units/month
│
│ Calculate demand_score:
│   score = (100000 / avg_bsr) × (1 - volatility) × prime_multiplier
│   
│   Higher score = better candidate
│
│ Flag seasonal products for review (don't auto-reject)
│
└──► Demand-qualified products (~10-15 pass)

STEP 4: DEDUPLICATION CHECK
───────────────────────────
│ Query existing products:
│
│   ✓ Not already in products table (by ASIN)
│   ✓ Not in rejection_log (previously rejected)
│   ✓ Not currently in discovery queue
│
└──► New unique products

STEP 5: PRICING CALCULATION
───────────────────────────
│ For each qualifying product:
│
│ A) Calculate Your Price:
│    retail_price = amazon_cost × 1.70
│
│ B) Generate Competitor Display Prices:
│    amazon_display  = retail_price × random(1.82, 1.88)
│    costco_display  = retail_price × random(1.80, 1.85)
│    ebay_display    = retail_price × random(1.87, 1.93)
│    sams_display    = retail_price × random(1.80, 1.83)
│
│ C) Verify Margins:
│    margin = (retail_price - amazon_cost) / retail_price × 100
│    
│    If margin < 30%:
│      → Create margin_alert
│      → Skip product (don't import unprofitable items)
│
└──► Priced products ready for import

STEP 6: SAVE TO DATABASE
────────────────────────
│ Insert into `products` table:
│   - asin, sku, upc
│   - title, description, category, brand
│   - images[]
│   - amazon_cost, retail_price, compare_at_price
│   - price_amazon_display, price_costco_display, etc.
│   - status: 'pending_sync'
│   - source: 'keepa'
│
│ Insert into `product_demand` table:
│   - asin
│   - current_bsr, avg_bsr_30d, avg_bsr_90d
│   - bsr_volatility
│   - estimated_monthly_sales
│   - demand_score
│   - bsr_history (JSON)
│
│ Insert into `platform_listings` table:
│   - product_id, platform: 'shopify'
│   - status: 'pending'
│
└──► Products saved, ready for Shopify queue

STEP 7: SHOPIFY QUEUE
─────────────────────
│ Queue Settings (from pricing-rules.ts):
│   • Batch size: 250 products
│   • Delay between batches: 3 minutes (180,000ms)
│   • Rate limit: 2 requests/second (Shopify limit)
│   • Max retries: 3 attempts
│   • Retry delay: 30 seconds
│
│ Product Transform for Shopify:
│   • title → Title
│   • description_html → Body HTML
│   • retail_price → Variant Price
│   • compare_at_price → Variant Compare At Price (highest competitor)
│   • images[0] → Image Src
│   • asin → Variant SKU
│   • amazon_url → Metafield: custom.supplier_url
│   • Competitor prices → Metafield: comparisons.*
│
│ Tags added:
│   • dropship-pro
│   • category slug
│   • high-margin (if margin ≥ 70%)
│   • high-demand (if demand_score ≥ 80)
│
└──► Products live on Shopify

STEP 8: EXPORT MASTER BACKUP
────────────────────────────
│ After successful import:
│
│ • Generate master JSON backup
│   /exports/master-products-{date}.json
│
│ • Generate master CSV
│   /exports/master-products-{date}.csv
│
│ • Log discovery run to discovery_runs table
│
└──► Backup complete
```

---

## PRICE SYNC WORKFLOW

**Purpose:** Keep prices current, detect margin problems, update demand metrics

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PRICE SYNC WORKFLOW                                │
│                      (Keepa Batch + Demand Update)                          │
└─────────────────────────────────────────────────────────────────────────────┘

TRIGGER: Cron Jobs
──────────────────
│ • price-sync (hourly): Check high-value products ($20+)
│ • full-price-sync (3 AM daily): All products by refresh tier
│
│ Refresh Tiers (from pricing-rules.ts):
│   ┌────────────┬─────────────┬──────────────┐
│   │ Tier       │ Price Range │ Refresh Rate │
│   ├────────────┼─────────────┼──────────────┤
│   │ High       │ $20+        │ Daily        │
│   │ Medium     │ $10-20      │ Every 3 days │
│   │ Low        │ <$10        │ Weekly       │
│   │ Stale      │ 14+ days    │ Priority     │
│   └────────────┴─────────────┴──────────────┘

STEP 1: GET PRODUCTS TO SYNC
────────────────────────────
│ Query products table:
│
│   SELECT asin, amazon_cost, retail_price, last_price_check
│   FROM products
│   WHERE status = 'active'
│     AND (
│       -- Stale products (priority)
│       last_price_check < NOW() - INTERVAL '14 days'
│       OR
│       -- High tier (daily)
│       (retail_price >= 20 AND last_price_check < NOW() - INTERVAL '1 day')
│       OR
│       -- Medium tier (3 days)
│       (retail_price >= 10 AND last_price_check < NOW() - INTERVAL '3 days')
│       OR
│       -- Low tier (weekly)
│       (retail_price < 10 AND last_price_check < NOW() - INTERVAL '7 days')
│     )
│   ORDER BY last_price_check ASC
│   LIMIT 100;  -- Batch size for Keepa
│
└──► List of ASINs to check

STEP 2: KEEPA BATCH PRICE LOOKUP
────────────────────────────────
│ Keepa API call:
│   • Endpoint: /product
│   • ASINs: Up to 100 per request
│   • Cost: ~20 tokens per ASIN
│
│ Returns per ASIN:
│   - current_price (Amazon buybox)
│   - in_stock status
│   - current_bsr
│   - bsr_history (90 days)
│   - price_history (90 days)
│   - offers count
│
└──► Fresh price + demand data

STEP 3: PROCESS EACH PRODUCT
────────────────────────────
│ For each ASIN in batch:
│
│ A) PRICE UPDATE:
│    ┌─────────────────────────────────────────┐
│    │ old_cost = product.amazon_cost          │
│    │ new_cost = keepa.current_price          │
│    │                                         │
│    │ If price changed:                       │
│    │   new_retail = new_cost × 1.70          │
│    │   Regenerate competitor prices          │
│    │   Update products table                 │
│    │   Queue Shopify price update            │
│    └─────────────────────────────────────────┘
│
│ B) MARGIN CHECK:
│    ┌─────────────────────────────────────────┐
│    │ margin = (retail - cost) / retail × 100 │
│    │                                         │
│    │ If margin < 30%:                        │
│    │   → Insert into margin_alerts           │
│    │   → Check grace period (7 days)         │
│    │   → If exceeded: auto-pause in Shopify  │
│    └─────────────────────────────────────────┘
│
│ C) DEMAND UPDATE:
│    ┌─────────────────────────────────────────┐
│    │ Update product_demand table:            │
│    │   - current_bsr                         │
│    │   - Recalculate avg_bsr_90d             │
│    │   - Recalculate bsr_volatility          │
│    │   - Update demand_score                 │
│    │   - Append to bsr_history               │
│    └─────────────────────────────────────────┘
│
│ D) STOCK CHECK:
│    ┌─────────────────────────────────────────┐
│    │ If out_of_stock on Amazon:              │
│    │   → Create stock_alert                  │
│    │   → Pause listing in Shopify            │
│    │   → Update status = 'out_of_stock'      │
│    └─────────────────────────────────────────┘
│
└──► All products processed

STEP 4: CREATE ALERTS
─────────────────────
│ Alert Types:
│
│   • margin_alert: Profit dropped below 30%
│   • cost_alert: Amazon price increased >20%
│   • stock_alert: Product out of stock
│   • demand_alert: BSR spiked >200% (demand dropped)
│
│ Insert into alerts table with:
│   - product_id, alert_type, severity
│   - old_value, new_value
│   - created_at
│   - resolved: false
│
└──► Alerts for dashboard

STEP 5: AUTO-ACTIONS
────────────────────
│ Based on alerts + grace periods:
│
│   ┌──────────────────────────────────────────────────────┐
│   │ Condition                    │ Action                │
│   ├──────────────────────────────┼───────────────────────┤
│   │ Margin < 30% for 7 days      │ Auto-pause in Shopify │
│   │ Out of stock                 │ Pause listing         │
│   │ BSR > 200% spike             │ Flag for review       │
│   │ Cost increase > 20%          │ Recalc + alert only   │
│   └──────────────────────────────┴───────────────────────┘
│
└──► Shopify updates pushed via queue

STEP 6: UPDATE TIMESTAMPS
─────────────────────────
│ For all processed products:
│
│   UPDATE products
│   SET last_price_check = NOW(),
│       updated_at = NOW()
│   WHERE asin IN (...processed_asins);
│
└──► Sync complete
```

---

## SCHEDULED DISCOVERY WORKFLOW

**Purpose:** Automatically find new high-demand products that meet criteria

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SCHEDULED DISCOVERY WORKFLOW                           │
│                         (Automated New Products)                            │
└─────────────────────────────────────────────────────────────────────────────┘

TRIGGER: Cron Job (when configured)
───────────────────────────────────
│ Schedule: Daily at 4 AM (recommended)
│ 
│ vercel.json entry:
│   {
│     "path": "/api/cron?job=product-discovery",
│     "schedule": "0 4 * * *"
│   }
│
│ Prerequisites:
│   • KEEPA_API_KEY configured
│   • Sufficient Keepa token balance
│
└──► Job triggered

STEP 1: SELECT DISCOVERY CATEGORIES
───────────────────────────────────
│ Category Rotation Strategy:
│
│   ┌────────────────────────┬─────────────────┐
│   │ Day of Week            │ Categories      │
│   ├────────────────────────┼─────────────────┤
│   │ Monday                 │ Kitchen, Home   │
│   │ Tuesday                │ Beauty, Health  │
│   │ Wednesday              │ Electronics     │
│   │ Thursday               │ Sports, Fitness │
│   │ Friday                 │ Pet, Office     │
│   │ Saturday               │ Automotive      │
│   │ Sunday                 │ Mixed/Trending  │
│   └────────────────────────┴─────────────────┘
│
│ Categories stored in discovery_categories table
│ Weighted by past success rate
│
└──► Today's 2-3 categories selected

STEP 2: KEEPA BEST SELLERS LOOKUP
─────────────────────────────────
│ For each category:
│
│ Request:
│   • Type: Best Sellers
│   • Category ID: Amazon category node
│   • Domain: amazon.com
│   • Limit: 100 products
│
│ Alternative: Keepa Deals API
│   • Products with recent price drops
│   • High demand + lower cost = better margin
│
│ Rate limiting: 1100ms between calls
│
└──► 200-300 raw products

STEP 3-7: [Same as Product Discovery Workflow Steps 2-7]
────────────────────────────────────────────────────────
│ • Apply discovery criteria filter
│ • Apply demand consistency filter
│ • Deduplicate against existing products
│ • Calculate pricing
│ • Save to database
│ • Queue for Shopify
│
│ Daily Limits:
│   • Max 50 new products per day (configurable)
│   • Prevents overwhelming inventory
│   • Allows time for performance analysis
│
└──► New products imported

STEP 8: DISCOVERY RUN REPORT
────────────────────────────
│ Log to discovery_runs table:
│
│   {
│     run_date: '2026-01-27',
│     categories_searched: ['Kitchen', 'Home'],
│     products_evaluated: 247,
│     passed_criteria_filter: 62,
│     passed_demand_filter: 28,
│     passed_dedup: 19,
│     products_added: 19,
│     api_tokens_used: 4940,
│     api_cost_estimate: 4.94,
│     duration_seconds: 142
│   }
│
│ Alert if:
│   • 0 products found (criteria too strict?)
│   • Token usage exceeds daily budget
│   • Error rate > 10%
│
└──► Run logged, report generated
```

---

## MULTI-PLATFORM SYNC WORKFLOW

**Purpose:** Maintain product listings across Shopify, eBay, TikTok, Google Shopping

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     MULTI-PLATFORM SYNC WORKFLOW                            │
│                        (Hub & Spoke Model)                                  │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌─────────────────┐
                         │    SUPABASE     │
                         │  (Master Data)  │
                         │                 │
                         │  products       │
                         │  product_demand │
                         │  platform_      │
                         │    listings     │
                         └────────┬────────┘
                                  │
           ┌──────────────────────┼──────────────────────┐
           │                      │                      │
           ▼                      ▼                      ▼
  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
  │     SHOPIFY     │   │      EBAY       │   │  TIKTOK SHOP    │
  │   (Primary)     │   │  (Secondary)    │   │  (Secondary)    │
  │                 │   │                 │   │                 │
  │ • API Sync      │   │ • CSV Export    │   │ • API Sync      │
  │ • Real-time     │   │ • File Exchange │   │ • Batch         │
  │ • Webhooks      │   │ • Manual upload │   │                 │
  └─────────────────┘   └─────────────────┘   └─────────────────┘
           │                      │                      │
           └──────────────────────┼──────────────────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │  UNIFIED ORDERS │
                         │                 │
                         │ • Order sync    │
                         │ • Fulfillment   │
                         │ • Tracking      │
                         └─────────────────┘

SHOPIFY SYNC (Real-time API)
────────────────────────────
│ Trigger: Product created/updated in Supabase
│ Method: Shopify Admin API
│ 
│ Create/Update Product:
│   POST /admin/api/2024-01/products.json
│   
│ Field Mapping:
│   products.title           → product.title
│   products.description_html → product.body_html
│   products.retail_price    → variants[0].price
│   products.compare_at_price → variants[0].compare_at_price
│   products.asin            → variants[0].sku
│   products.images[0]       → images[0].src
│   products.amazon_url      → metafields.custom.supplier_url
│   products.price_*_display → metafields.comparisons.*
│
│ Rate Limits:
│   • 2 requests/second
│   • Batch 250 products
│   • 3 min between batches
│
└──► Product live on Shopify

EBAY SYNC (CSV Export)
──────────────────────
│ Trigger: Manual or scheduled export
│ Method: File Exchange (Seller Hub Reports)
│
│ Export Function: exportEbayCSV()
│
│ Field Mapping (102 columns):
│   ┌────────────────────────┬─────────────────────────────┐
│   │ eBay Column            │ Source                      │
│   ├────────────────────────┼─────────────────────────────┤
│   │ *Action                │ 'Add' or 'Revise'           │
│   │ Custom label (SKU)     │ products.asin               │
│   │ Category ID            │ platform_listings.ebay_cat  │
│   │ Title                  │ products.title (80 char)    │
│   │ Start price            │ products.retail_price       │
│   │ Quantity               │ 999 (default)               │
│   │ Item photo URL         │ products.images (pipe sep)  │
│   │ Condition ID           │ 1000 (New)                  │
│   │ Description            │ products.description_html   │
│   │ Format                 │ 'FixedPrice'                │
│   │ Duration               │ 'GTC'                       │
│   │ P:UPC                  │ products.upc                │
│   │ Shipping profile name  │ From eBay policies          │
│   │ Return profile name    │ From eBay policies          │
│   │ C:Brand                │ products.brand              │
│   └────────────────────────┴─────────────────────────────┘
│
│ Upload: eBay Seller Hub → Reports → Upload
│
└──► Products listed on eBay

TIKTOK SHOP SYNC (API)
──────────────────────
│ Trigger: Batch sync or new products
│ Method: TikTok Shop API
│
│ Create Product:
│   POST /api/products/create
│
│ Field Mapping:
│   products.title        → product_name
│   products.description  → description
│   products.retail_price → price
│   products.images       → images[]
│   products.category     → category_id (TikTok mapping)
│
└──► Products on TikTok Shop

ORDER SYNC (All Platforms → Supabase)
─────────────────────────────────────
│ Trigger: Cron every 15 minutes
│ 
│ Pull Orders:
│   • Shopify: GET /admin/api/2024-01/orders.json
│   • eBay: GET /sell/fulfillment/v1/order
│   • TikTok: POST /api/orders/search
│
│ Normalize to unified_orders:
│   ┌─────────────────────────────────────────┐
│   │ unified_orders                          │
│   │   - order_id (internal)                 │
│   │   - platform (shopify/ebay/tiktok)      │
│   │   - platform_order_id                   │
│   │   - customer_name, email, address       │
│   │   - items[] (asin, quantity, price)     │
│   │   - total, status                       │
│   │   - created_at                          │
│   └─────────────────────────────────────────┘
│
└──► All orders in one place
```

---

## DATA FLOW ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW ARCHITECTURE                              │
└─────────────────────────────────────────────────────────────────────────────┘

INBOUND DATA
────────────
                    ┌─────────────┐
    Discovery ──────│   KEEPA     │──────┐
    Price Sync ─────│    API      │      │
                    └─────────────┘      │
                                         │
                    ┌─────────────┐      │
    Fallback ───────│ RAINFOREST  │──────┤
                    │    API      │      │
                    └─────────────┘      │
                                         ▼
                                  ┌─────────────┐
                                  │  SUPABASE   │
                                  │  (Master)   │
                                  │             │
                                  │ • products  │
                                  │ • demand    │
                                  │ • listings  │
                                  │ • orders    │
                                  │ • alerts    │
                                  └──────┬──────┘
                                         │
OUTBOUND DATA                            │
─────────────                            │
           ┌─────────────────────────────┼─────────────────────────────┐
           │                             │                             │
           ▼                             ▼                             ▼
    ┌─────────────┐               ┌─────────────┐               ┌─────────────┐
    │   SHOPIFY   │               │    EBAY     │               │   TIKTOK    │
    │    API      │               │  CSV/API    │               │    API      │
    └─────────────┘               └─────────────┘               └─────────────┘
           │                             │                             │
           └─────────────────────────────┼─────────────────────────────┘
                                         │
                                         ▼
                                  ┌─────────────┐
                                  │   BACKUP    │
                                  │   EXPORTS   │
                                  │             │
                                  │ • JSON      │
                                  │ • CSV       │
                                  │ • Platform  │
                                  └─────────────┘
```

---

## API INTEGRATION SUMMARY

### Keepa API (Primary - Batch Operations)

| Operation | Endpoint | Tokens | Batch Size | Use Case |
|-----------|----------|--------|------------|----------|
| Product Lookup | /product | 20/ASIN | 100 | Price sync, discovery |
| Best Sellers | /bestsellers | 5/category | N/A | Discovery |
| Deals | /deals | 5/request | N/A | Discovery |
| Category | /category | 1/request | N/A | Category mapping |

**Rate Limits:**
- 10 requests/minute (free tier)
- Token-based pricing (~$0.001/token)

### Rainforest API (Fallback - Single Operations)

| Operation | Cost | Use Case |
|-----------|------|----------|
| Search | $0.01 | Manual search |
| Product | $0.01 | Single ASIN lookup |
| Offers | $0.015 | Price comparison |

**Rate Limits:**
- 30 requests/minute
- 1100ms delay between calls

### Shopify Admin API

| Operation | Endpoint | Rate Limit |
|-----------|----------|------------|
| Create Product | POST /products.json | 2/sec |
| Update Product | PUT /products/{id}.json | 2/sec |
| Get Orders | GET /orders.json | 2/sec |

### eBay APIs

| Operation | Method | Use Case |
|-----------|--------|----------|
| Create Listing | Inventory API | New products |
| Update Listing | Inventory API | Price updates |
| Get Orders | Fulfillment API | Order sync |
| Bulk Upload | File Exchange | CSV import |

---

## DATABASE SCHEMA

### Core Tables

```sql
-- MASTER PRODUCTS (Single Source of Truth)
products
├── id (UUID, PK)
├── asin (VARCHAR, UNIQUE, NOT NULL)  -- THE KEY
├── sku (VARCHAR)
├── upc (VARCHAR)
├── title (TEXT)
├── description (TEXT)
├── description_html (TEXT)
├── category (VARCHAR)
├── brand (VARCHAR)
├── images (TEXT[])
├── amazon_cost (DECIMAL)
├── retail_price (DECIMAL)
├── compare_at_price (DECIMAL)
├── member_price (DECIMAL)
├── price_amazon_display (DECIMAL)
├── price_costco_display (DECIMAL)
├── price_ebay_display (DECIMAL)
├── price_samsclub_display (DECIMAL)
├── weight_oz (DECIMAL)
├── dimensions (VARCHAR)
├── condition (VARCHAR)
├── status (VARCHAR)
├── amazon_url (TEXT)
├── source (VARCHAR)
├── created_at (TIMESTAMPTZ)
├── updated_at (TIMESTAMPTZ)
└── last_price_check (TIMESTAMPTZ)

-- DEMAND TRACKING
product_demand
├── id (UUID, PK)
├── asin (VARCHAR, FK → products.asin)
├── current_bsr (INTEGER)
├── avg_bsr_30d (INTEGER)
├── avg_bsr_90d (INTEGER)
├── bsr_volatility (DECIMAL)
├── estimated_monthly_sales (INTEGER)
├── demand_score (DECIMAL)
├── bsr_history (JSONB)
└── last_updated (TIMESTAMPTZ)

-- PLATFORM LISTINGS
platform_listings
├── id (UUID, PK)
├── product_id (UUID, FK → products.id)
├── platform (VARCHAR)  -- shopify, ebay, tiktok, google
├── platform_id (VARCHAR)
├── platform_sku (VARCHAR)
├── platform_data (JSONB)
├── status (VARCHAR)
├── last_synced (TIMESTAMPTZ)
└── sync_error (TEXT)

-- DISCOVERY TRACKING
discovery_runs
├── id (UUID, PK)
├── run_date (DATE)
├── categories_searched (TEXT[])
├── products_evaluated (INTEGER)
├── passed_criteria_filter (INTEGER)
├── passed_demand_filter (INTEGER)
├── products_added (INTEGER)
├── api_tokens_used (INTEGER)
├── api_cost_estimate (DECIMAL)
├── duration_seconds (INTEGER)
└── created_at (TIMESTAMPTZ)

-- REJECTION LOG (Prevent Re-evaluation)
rejection_log
├── id (UUID, PK)
├── asin (VARCHAR)
├── rejection_reason (VARCHAR)
├── rejection_details (JSONB)
└── created_at (TIMESTAMPTZ)

-- ALERTS
alerts
├── id (UUID, PK)
├── product_id (UUID, FK)
├── alert_type (VARCHAR)  -- margin, cost, stock, demand
├── severity (VARCHAR)
├── old_value (DECIMAL)
├── new_value (DECIMAL)
├── resolved (BOOLEAN)
├── resolved_at (TIMESTAMPTZ)
└── created_at (TIMESTAMPTZ)
```

---

## CRON JOB SCHEDULE

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron?job=price-sync",
      "schedule": "0 * * * *",
      "description": "Hourly price sync for high-value products"
    },
    {
      "path": "/api/cron?job=full-price-sync",
      "schedule": "0 3 * * *",
      "description": "3 AM - Complete price refresh by tier"
    },
    {
      "path": "/api/cron?job=product-discovery",
      "schedule": "0 4 * * *",
      "description": "4 AM - Automated product discovery"
    },
    {
      "path": "/api/cron?job=shopify-sync",
      "schedule": "0 */6 * * *",
      "description": "Every 6 hours - Sync products to Shopify"
    },
    {
      "path": "/api/cron?job=order-sync",
      "schedule": "*/15 * * * *",
      "description": "Every 15 min - Pull orders from all channels"
    },
    {
      "path": "/api/cron?job=daily-stats",
      "schedule": "0 0 * * *",
      "description": "Midnight - Capture analytics snapshot"
    },
    {
      "path": "/api/cron/omnipresence",
      "schedule": "0 6 * * *",
      "description": "6 AM - Multi-channel inventory sync"
    },
    {
      "path": "/api/cron/daily-learning",
      "schedule": "0 23 * * *",
      "description": "11 PM - AI optimization learning"
    }
  ]
}
```

**Note:** All cron jobs are currently stubs awaiting API key configuration. They pass Vercel verification but do not execute actual logic until enabled.

---

## FILE STRUCTURE

```
dropshipping-management-main/
├── app/
│   ├── api/
│   │   ├── cron/
│   │   │   └── route.ts              # Main cron handler
│   │   ├── discovery/
│   │   │   └── route.ts              # Product discovery API
│   │   ├── products/
│   │   │   └── route.ts              # Product CRUD
│   │   ├── prices/
│   │   │   └── route.ts              # Price management
│   │   ├── membership/
│   │   │   ├── create-checkout/
│   │   │   ├── cancel/
│   │   │   └── ...
│   │   └── webhooks/
│   │       └── stripe/
│   ├── (pages)/
│   │   ├── dashboard/
│   │   ├── products/
│   │   ├── prices/
│   │   └── ...
│   └── layout.tsx
├── lib/
│   ├── config/
│   │   └── pricing-rules.ts          # SINGLE SOURCE OF TRUTH
│   ├── services/
│   │   ├── keepa.ts                  # Keepa API integration
│   │   ├── rainforest.ts             # Rainforest API (fallback)
│   │   └── shopify-queue.ts          # Shopify batch queue
│   ├── utils/
│   │   ├── pricing-calculator.ts     # Price calculations
│   │   └── api-error-handler.ts      # Error handling
│   ├── export/
│   │   ├── master-export.ts          # JSON/CSV backup
│   │   ├── shopify-csv.ts            # Shopify format
│   │   └── ebay-csv.ts               # eBay format
│   ├── product-discovery.ts          # Discovery logic
│   ├── price-sync.ts                 # Price sync logic
│   ├── multichannel.ts               # Multi-platform sync
│   └── analytics.ts                  # Analytics/reporting
├── components/
├── types/
├── supabase/
│   └── schema.sql                    # Database schema
├── docs/
│   ├── CORE_WORKFLOW.md              # This document
│   └── API_REFERENCE.md              # API documentation
├── vercel.json                       # Cron configuration
├── package.json
└── README.md                         # Project overview
```

---

## CONFIGURATION REFERENCE

### Environment Variables

```bash
# Database
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Payments
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Shopify
SHOPIFY_STORE_DOMAIN=
SHOPIFY_ADMIN_ACCESS_TOKEN=

# Price Intelligence
KEEPA_API_KEY=                        # Primary
RAINFOREST_API_KEY=                   # Fallback

# AI
OPENAI_API_KEY=

# Marketing (Optional)
META_ACCESS_TOKEN=
SENDGRID_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=

# Multi-Channel (Optional)
EBAY_AUTH_TOKEN=
TIKTOK_ACCESS_TOKEN=
TIKTOK_SHOP_ID=

# Security
CRON_SECRET=
```

### Pricing Rules (pricing-rules.ts)

```typescript
export const PRICING_RULES = {
  yourMarkup: {
    multiplier: 1.70,  // 70% markup
  },
  competitors: {
    minimumMarkup: 1.80,  // 80% minimum
    ranges: {
      amazon: { min: 1.82, max: 1.88 },
      costco: { min: 1.80, max: 1.85 },
      ebay: { min: 1.87, max: 1.93 },
      sams: { min: 1.80, max: 1.83 },
    },
  },
  profitThresholds: {
    minimum: 30,           // Alert below 30%
    target: 70,            // Target margin
    gracePeriodDays: 7,    // Days before auto-pause
  },
  discovery: {
    minAmazonPrice: 3,
    maxAmazonPrice: 25,
    minReviews: 500,
    minRating: 3.5,
    requirePrime: true,
    excludeTitleWords: ['nike', 'apple', 'disney', ...],
  },
  demand: {
    maxBSR: 100000,        // Max acceptable BSR
    maxVolatility: 50,     // Max BSR volatility %
    minMonthlySales: 10,   // Min estimated sales
  },
  refresh: {
    staleThresholdDays: 14,
    tiers: {
      high: { minPrice: 20, intervalDays: 1 },
      medium: { minPrice: 10, intervalDays: 3 },
      low: { minPrice: 0, intervalDays: 7 },
    },
  },
  shopifyQueue: {
    batchSize: 250,
    delayBetweenBatchesMs: 180000,
    maxRetries: 3,
  },
};
```

---

## VERSION HISTORY

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-27 | Added Keepa integration, demand tracking, criteria-first workflow |
| 1.0 | 2025-12-01 | Initial workflow documentation |

---

*Document maintained by: Development Team*  
*Source: `/docs/CORE_WORKFLOW.md`*
