[DEVELOPER-GUIDE.md](https://github.com/user-attachments/files/24900875/DEVELOPER-GUIDE.md)[Uploadi# 🚀 Dropship Pro - Developer Guide

> Complete technical documentation for the Dropship Pro platform - a membership-based dropshipping management system with automated product discovery, pricing intelligence, and multi-channel selling.

---

## 📋 Table of Contents

1. [Architecture Overview](#-architecture-overview)
2. [Project Structure](#-project-structure)
3. [Core Systems](#-core-systems)
4. [Database Schema](#-database-schema)
5. [API Reference](#-api-reference)
6. [Configuration](#-configuration)
7. [Development Workflow](#-development-workflow)
8. [Deployment](#-deployment)
9. [Testing](#-testing)
10. [Troubleshooting](#-troubleshooting)

---

## 🏗 Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DROPSHIP PRO                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌────────────────────────────────────────────────────────────────┐        │
│   │                     FRONTEND (Next.js 14)                       │        │
│   │                                                                  │        │
│   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │        │
│   │  │Dashboard │ │ Products │ │  Prices  │ │ Channels │          │        │
│   │  │  Page    │ │   Page   │ │   Page   │ │   Page   │          │        │
│   │  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │        │
│   └────────────────────────────────────────────────────────────────┘        │
│                                    │                                         │
│                                    ▼                                         │
│   ┌────────────────────────────────────────────────────────────────┐        │
│   │                    API LAYER (Next.js Routes)                   │        │
│   │                                                                  │        │
│   │  /api/products  /api/prices  /api/discovery  /api/cron         │        │
│   │  /api/channels  /api/membership  /api/webhooks                 │        │
│   └────────────────────────────────────────────────────────────────┘        │
│                    │              │              │                           │
│           ┌───────┴───────┐      │      ┌──────┴──────┐                     │
│           ▼               ▼      ▼      ▼             ▼                     │
│   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│   │  Supabase   │ │   Keepa    │ │ Rainforest  │ │   Stripe    │          │
│   │  Database   │ │    API     │ │    API      │ │  Payments   │          │
│   │             │ │  (Primary) │ │ (Fallback)  │ │             │          │
│   └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘          │
│                                                                              │
│   ┌────────────────────────────────────────────────────────────────┐        │
│   │                    OUTBOUND CHANNELS                            │        │
│   │                                                                  │        │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │        │
│   │  │ Shopify │ │  eBay   │ │ TikTok  │ │ Google  │ │ Amazon  │  │        │
│   │  │  (API)  │ │  (CSV)  │ │  (API)  │ │Shopping │ │ (Future)│  │        │
│   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘  │        │
│   └────────────────────────────────────────────────────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
DISCOVERY:    Keepa/Rainforest → Validate → product_demand → products table
PRICING:      Keepa BSR/History → Demand Score → Pricing Rules → Retail Price
SYNC OUT:     products → Shopify API / eBay CSV / TikTok API
ORDERS IN:    All Channels → unified_orders → Fulfillment
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js 14, React 18, Tailwind CSS | UI & SSR |
| Backend | Next.js API Routes (Serverless) | API Logic |
| Database | Supabase (PostgreSQL + RLS) | Data Storage |
| Auth | Supabase Auth | User Authentication |
| Payments | Stripe Subscriptions | Membership Billing |
| Price Data | Keepa (primary), Rainforest (fallback) | Amazon Data |
| AI | OpenAI GPT-4 | Content Generation |
| Deployment | Vercel | Hosting & Cron |

---

## 📁 Project Structure

```
dropshipping-management-main/
│
├── app/                              # Next.js 14 App Router
│   ├── page.tsx                      # Landing → redirect to /dashboard
│   ├── layout.tsx                    # Root layout with providers
│   ├── globals.css                   # Tailwind + global styles
│   │
│   ├── dashboard/                    # Main dashboard
│   │   └── page.tsx
│   ├── products/                     # Product management
│   │   └── page.tsx
│   ├── prices/                       # Price intelligence
│   │   └── page.tsx
│   ├── channels/                     # Multi-channel management
│   │   └── page.tsx
│   ├── analytics/                    # Reports & analytics
│   │   └── page.tsx
│   ├── membership/                   # Subscription management
│   │   ├── page.tsx
│   │   ├── checkout/page.tsx
│   │   └── success/page.tsx
│   │
│   └── api/                          # API Routes
│       ├── products/route.ts         # CRUD products
│       ├── prices/route.ts           # Price sync & display
│       ├── discovery/route.ts        # Product discovery
│       ├── channels/route.ts         # Channel sync
│       ├── analytics/route.ts        # Stats & reports
│       ├── health/route.ts           # System health check
│       │
│       ├── cron/                     # Scheduled jobs
│       │   ├── route.ts              # Main cron handler ⭐
│       │   ├── ai-optimize/route.ts
│       │   ├── daily-learning/route.ts
│       │   ├── google-optimize/route.ts
│       │   ├── google-shopping/route.ts
│       │   └── omnipresence/route.ts
│       │
│       ├── membership/               # Stripe integration
│       │   ├── status/route.ts
│       │   ├── create-checkout/route.ts
│       │   ├── cancel/route.ts
│       │   ├── reactivate/route.ts
│       │   ├── portal/route.ts
│       │   └── invoices/route.ts
│       │
│       └── webhooks/
│           └── stripe/route.ts       # Stripe webhook handler
│
├── components/                       # React Components
│   ├── dashboard/
│   │   └── DashboardOverview.tsx
│   ├── products/
│   │   ├── ProductsPanel.tsx
│   │   ├── ProductRow.tsx
│   │   ├── ProductFilters.tsx
│   │   ├── AddASINModal.tsx
│   │   └── BulkImportPanel.tsx
│   ├── price-intelligence/
│   │   ├── PriceIntelligencePanel.tsx
│   │   └── MarginRulesPanel.tsx
│   ├── channels/
│   │   └── ChannelsPanel.tsx
│   ├── ai/
│   │   ├── AICommandCenter.tsx
│   │   └── AIToolsPanel.tsx
│   ├── navigation/
│   │   └── Navigation.tsx
│   └── ui/                           # Shared UI components
│       ├── ErrorBoundary.tsx
│       ├── FeatureStatusBanner.tsx
│       └── SystemStatusBanner.tsx
│
├── lib/                              # Business Logic ⭐
│   │
│   ├── config/
│   │   ├── pricing-rules.ts          # ⭐ CENTRAL CONFIG (24.9 KB)
│   │   └── error-codes.ts
│   │
│   ├── services/
│   │   ├── keepa.ts                  # ⭐ Keepa API service (34.4 KB)
│   │   ├── rainforest.ts             # Rainforest API wrapper
│   │   ├── shopify-queue.ts          # Shopify batch queue
│   │   ├── ai-suggestions.ts         # AI recommendation engine
│   │   └── sms-notifications.ts      # Twilio SMS
│   │
│   ├── export/                       # ⭐ Export utilities (NEW)
│   │   ├── master-export.ts          # JSON/CSV backup (26.1 KB)
│   │   ├── shopify-csv.ts            # Shopify import format (30.1 KB)
│   │   └── ebay-csv.ts               # eBay File Exchange (36.1 KB)
│   │
│   ├── db/
│   │   └── supabase.ts               # Supabase client
│   │
│   ├── utils/
│   │   ├── pricing-calculator.ts     # Price calculation helpers
│   │   ├── price-validator.ts        # Validation logic
│   │   ├── api-error-handler.ts      # Error formatting
│   │   ├── api-cost-estimator.ts     # API budget tracking
│   │   ├── duplicate-detector.ts     # Dupe detection
│   │   └── health-checker.ts         # System health utils
│   │
│   ├── price-sync.ts                 # ⭐ Price synchronization (18.0 KB)
│   ├── product-discovery.ts          # ⭐ Product discovery (15.9 KB)
│   ├── product-management.ts         # Product CRUD
│   ├── multichannel.ts               # Channel sync logic
│   ├── shopify-admin.ts              # Shopify Admin API
│   ├── ai-engines.ts                 # OpenAI integration
│   ├── ai-content-brain.ts           # Content generation
│   ├── ai-seo-engine.ts              # SEO optimization
│   ├── analytics.ts                  # Analytics logic
│   ├── google-merchant.ts            # Google Shopping
│   ├── google-shopping-optimizer.ts  # Shopping feed optimizer
│   ├── omnipresence-engine.ts        # Multi-platform presence
│   ├── social-marketing.ts           # Social media marketing
│   ├── stripe-products.ts            # Stripe product sync
│   ├── webhook-handler.ts            # Webhook processing
│   └── margin-rules.ts               # Margin calculation
│
├── supabase/
│   ├── schema.sql                    # Main database schema
│   └── migrations/
│       ├── add_competitor_prices_fk.sql
│       └── 004_demand_and_bulk.sql   # ⭐ Demand tables (22.6 KB)
│
├── shopify-theme/                    # Shopify Liquid snippets
│   ├── assets/
│   │   └── price-sync.js             # Client-side price display
│   └── snippets/
│       ├── price-comparison.liquid   # "Amazon: $X, Our Price: $Y"
│       ├── competitor-badge.liquid   # "Save X% vs Amazon" badge
│       └── stock-alert.liquid        # Low stock warnings
│
├── types/
│   ├── index.ts                      # Shared types
│   ├── database.ts                   # Database types
│   └── errors.ts                     # Error types
│
├── middleware.ts                     # Auth middleware
├── next.config.js                    # Next.js config
├── tailwind.config.js                # Tailwind config
├── tsconfig.json                     # TypeScript config
├── vercel.json                       # Vercel deployment config
├── package.json                      # Dependencies
│
└── docs/                             # Documentation
    ├── KEEPA_API.md                  # Keepa integration guide
    ├── RAINFOREST_API_GUIDE.md       # Rainforest integration guide
    └── DEVELOPER-GUIDE.md            # This file
```

---

## ⚙️ Core Systems

### 1. Pricing Rules Engine (`lib/config/pricing-rules.ts`)

This is the **single source of truth** for all business logic:

```typescript
// Key configuration sections:

export const PRICING_RULES = {
  // Your markup strategy
  yourMarkup: {
    basePercent: 70,              // 70% markup on Amazon cost
    memberDiscount: 100,          // Members see $0 (shipping only)
  },
  
  // Competitor display prices (fake prices to show value)
  competitors: {
    amazon: { min: 1.82, max: 1.88 },   // 82-88% higher than retail
    costco: { min: 1.80, max: 1.85 },   // 80-85% higher
    ebay:   { min: 1.87, max: 1.93 },   // 87-93% higher (highest)
    sams:   { min: 1.80, max: 1.83 },   // 80-83% higher (lowest)
  },
  
  // Discovery criteria
  discovery: {
    minPrice: 3,                  // Min Amazon cost
    maxPrice: 25,                 // Max Amazon cost  
    minReviews: 500,              // Min review count
    minRating: 3.5,               // Min star rating
    requirePrime: true,           // Must be Prime
    excludeTitleWords: [...],     // Brand exclusions
  },
  
  // Demand scoring (uses Keepa data)
  demand: {
    maxBSR: 150000,
    tiers: {
      high:   { maxBSR: 25000,  minScore: 70, refreshDays: 1 },
      medium: { maxBSR: 75000,  minScore: 50, refreshDays: 3 },
      low:    { maxBSR: 150000, minScore: 30, refreshDays: 7 },
    },
    weights: {
      bsr: 0.40,
      bsrTrend: 0.25,
      priceStability: 0.20,
      reviewVelocity: 0.15,
    },
  },
  
  // Keepa API settings
  keepa: {
    tokensPerMinute: 60,
    batchSize: 100,
    historyDays: 90,
  },
};
```

### 2. Keepa Integration (`lib/services/keepa.ts`)

Primary API for batch product data and demand scoring:

```typescript
import { 
  lookupProducts,      // Batch lookup (up to 100 ASINs)
  lookupProduct,       // Single product lookup
  saveDemandData,      // Save to product_demand table
  calculateDemandScore,// Calculate 0-100 score
  addToQueue,          // Add to processing queue
  processQueue,        // Process pending items
  getBestSellers,      // Top sellers by category
  getDeals,            // Current Amazon deals
} from '@/lib/services/keepa';

// Example: Batch lookup with demand scoring
const products = await lookupProducts(['B0BDHWDR12', 'B09V3KXJPB']);
for (const product of products) {
  const score = calculateDemandScore({
    currentBSR: product.bsr,
    bsrHistory: product.bsrHistory,
    priceHistory: product.priceHistory,
    reviewCount: product.reviews,
    recentReviews: product.recentReviews,
  });
  
  await saveDemandData(product.id, { ...product, demandScore: score });
}
```

### 3. Price Sync (`lib/price-sync.ts`)

Synchronizes prices using Keepa/Rainforest:

```typescript
import {
  syncCompetitorPrices,   // Sync multiple products
  syncProductWithKeepa,   // Single product via Keepa
  getStaleProducts,       // Find products needing refresh
  syncStaleProducts,      // Auto-sync stale products
} from '@/lib/price-sync';

// Sync all stale products (called by cron)
const result = await syncStaleProducts({
  maxProducts: 100,
  hoursThreshold: 24,
});
// Returns: { synced: 95, errors: 3, skipped: 2 }
```

### 4. Product Discovery (`lib/product-discovery.ts`)

Automated product finding:

```typescript
import {
  discoverProducts,       // Main discovery function
  validateProduct,        // Check against criteria
  trackDiscoveryRun,      // Log discovery job
  logRejection,           // Track why rejected
} from '@/lib/product-discovery';

// Discover new products
const discovered = await discoverProducts({
  categories: ['beauty', 'kitchen', 'home'],
  maxProducts: 50,
  validateDemand: true,   // Check Keepa for demand score
});
```

### 5. Export System (`lib/export/`)

Three export utilities for different purposes:

```typescript
// Master backup export
import { exportMasterJSON, exportMasterCSV, createBackup } from '@/lib/export/master-export';

const backup = await createBackup({
  includeProducts: true,
  includeDemand: true,
  includeHistory: true,
});

// Shopify bulk import
import { generateShopifyCSV } from '@/lib/export/shopify-csv';

const csv = await generateShopifyCSV({
  productIds: [...],
  includeImages: true,
  includeSEO: true,
});

// eBay File Exchange
import { generateEbayCSV } from '@/lib/export/ebay-csv';

const ebayCSV = await generateEbayCSV({
  productIds: [...],
  listingType: 'FixedPriceItem',
  duration: 'GTC',
});
```

---

## 🗄 Database Schema

### Core Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `products` | Master product data | `id`, `asin`, `title`, `amazon_price`, `retail_price`, `status` |
| `product_demand` | BSR & demand metrics | `product_id`, `current_bsr`, `demand_score`, `bsr_trend` |
| `competitor_prices` | Competitor pricing | `product_id`, `amazon_price`, `display_prices` |
| `platform_listings` | Per-platform status | `product_id`, `platform`, `listing_id`, `status` |
| `memberships` | User subscriptions | `user_id`, `stripe_subscription_id`, `status` |
| `unified_orders` | Orders from all channels | `platform`, `platform_order_id`, `status` |
| `discovery_runs` | Discovery job logs | `run_date`, `products_found`, `products_added` |
| `rejection_log` | Rejected products | `asin`, `reason`, `criteria_failed` |
| `keepa_api_log` | API usage tracking | `tokens_used`, `endpoint`, `success` |
| `bulk_check_jobs` | Bulk validation jobs | `status`, `total_asins`, `completed` |
| `bulk_check_results` | Per-ASIN results | `job_id`, `asin`, `viable`, `reason` |

### Entity Relationships

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────────┐
│  products   │────►│  product_demand  │     │  discovery_runs   │
│             │     │                  │     │                   │
│  id (PK)    │     │  product_id (FK) │     │  id (PK)          │
│  asin       │     │  demand_score    │     │  products_found   │
│  title      │     │  current_bsr     │     │  products_added   │
│  status     │     │  bsr_trend       │     └───────────────────┘
└─────────────┘     └──────────────────┘
       │
       │            ┌──────────────────┐     ┌───────────────────┐
       ├───────────►│ competitor_prices│     │   rejection_log   │
       │            │                  │     │                   │
       │            │  product_id (FK) │     │  asin             │
       │            │  amazon_price    │     │  reason           │
       │            │  display_prices  │     │  discovery_run_id │
       │            └──────────────────┘     └───────────────────┘
       │
       │            ┌──────────────────┐
       └───────────►│platform_listings │
                    │                  │
                    │  product_id (FK) │
                    │  platform        │
                    │  listing_id      │
                    └──────────────────┘
```

### Key Indexes

```sql
-- Fast product lookups
CREATE INDEX idx_products_asin ON products(asin);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_last_price_check ON products(last_price_check);

-- Demand queries
CREATE INDEX idx_demand_product ON product_demand(product_id);
CREATE INDEX idx_demand_score ON product_demand(demand_score DESC);
CREATE INDEX idx_demand_tier ON product_demand(demand_tier);

-- Platform sync
CREATE INDEX idx_listings_platform ON platform_listings(platform, status);

-- Discovery tracking
CREATE INDEX idx_rejection_asin ON rejection_log(asin);
```

---

## 📡 API Reference

### Products API (`/api/products`)

| Method | Params | Description |
|--------|--------|-------------|
| `GET` | `?search=&status=&page=&limit=` | List products with filters |
| `POST` | `{ action: 'create', product: {...} }` | Create single product |
| `POST` | `{ action: 'bulk-create', products: [...] }` | Bulk create |
| `PUT` | `{ id, updates: {...} }` | Update product |
| `DELETE` | `{ ids: [...] }` | Delete products |

### Prices API (`/api/prices`)

| Method | Params | Description |
|--------|--------|-------------|
| `GET` | `?action=list` | Get competitor prices |
| `GET` | `?action=stats` | Get price statistics |
| `POST` | `{ action: 'sync-all' }` | Sync all stale prices |
| `POST` | `{ action: 'sync-product', productId }` | Sync single product |
| `POST` | `{ action: 'link-asin', productId, asin }` | Link ASIN to product |

### Discovery API (`/api/discovery`)

| Method | Params | Description |
|--------|--------|-------------|
| `GET` | `?query=&category=` | Search products |
| `POST` | `{ action: 'discover', categories, maxProducts }` | Auto-discover |
| `POST` | `{ action: 'validate', asins: [...] }` | Validate ASINs |
| `POST` | `{ action: 'bulk-check', asins: [...] }` | Bulk viability check |

### Cron API (`/api/cron`)

| Job | Schedule | Description |
|-----|----------|-------------|
| `price-sync` | Hourly | Sync high-value product prices |
| `demand-check` | Every 6 hours | Refresh demand scores via Keepa |
| `discovery` | Daily 4 AM | Find new products |
| `health-check` | Every 15 min | System health verification |
| `shopify-sync` | Every 6 hours | Push updates to Shopify |

```bash
# Trigger cron job manually
curl -X GET "https://your-domain.com/api/cron?job=price-sync" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Membership API (`/api/membership/*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | Get current membership status |
| `/create-checkout` | POST | Create Stripe checkout session |
| `/cancel` | POST | Cancel at period end |
| `/reactivate` | POST | Undo cancellation |
| `/portal` | POST | Get billing portal URL |
| `/invoices` | GET | Get invoice history |

---

## 🔧 Configuration

### Environment Variables

```bash
# ===================
# DATABASE (Required)
# ===================
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ===================
# PRICE INTELLIGENCE (Required - at least one)
# ===================
KEEPA_API_KEY=your-keepa-key              # Primary - batch operations
RAINFOREST_API_KEY=your-rainforest-key    # Fallback - single lookups

# ===================
# PAYMENTS (Required)
# ===================
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# ===================
# SHOPIFY (Required for sync)
# ===================
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...

# ===================
# AI FEATURES (Optional)
# ===================
OPENAI_API_KEY=sk-...

# ===================
# MULTI-CHANNEL (Optional)
# ===================
EBAY_AUTH_TOKEN=your-ebay-token
TIKTOK_ACCESS_TOKEN=your-token
TIKTOK_SHOP_ID=your-shop-id
GOOGLE_MERCHANT_ID=your-merchant-id

# ===================
# SECURITY
# ===================
CRON_SECRET=your-cron-secret
```

### Vercel Configuration

```json
// vercel.json
{
  "crons": [
    { "path": "/api/cron?job=price-sync", "schedule": "0 * * * *" },
    { "path": "/api/cron?job=demand-check", "schedule": "0 */6 * * *" },
    { "path": "/api/cron?job=discovery", "schedule": "0 4 * * *" },
    { "path": "/api/cron?job=health-check", "schedule": "*/15 * * * *" },
    { "path": "/api/cron?job=shopify-sync", "schedule": "0 */6 * * *" }
  ]
}
```

---

## 💻 Development Workflow

### Initial Setup

```bash
# 1. Clone repository
git clone https://github.com/your-org/dropship-pro.git
cd dropship-pro

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env.local
# Edit .env.local with your keys

# 4. Run database migrations
npx supabase db push

# 5. Start development server
npm run dev
```

### Common Commands

```bash
# Development
npm run dev           # Start dev server (localhost:3000)
npm run build         # Production build
npm run start         # Start production server

# Code Quality
npm run lint          # Run ESLint
npm run type-check    # TypeScript check

# Database
npx supabase db push          # Apply migrations
npx supabase db diff -f name  # Generate migration
npx supabase db reset         # Reset (dev only!)
```

### Testing Locally

```bash
# Test cron jobs
curl http://localhost:3000/api/cron?job=price-sync
curl http://localhost:3000/api/cron?job=discovery

# Test API endpoints
curl http://localhost:3000/api/products
curl http://localhost:3000/api/health
```

### Code Style Guidelines

1. **TypeScript:** Strict mode, no `any` types
2. **Components:** Functional components with hooks
3. **State:** React Query for server state, useState for local
4. **Styling:** Tailwind CSS, no inline styles
5. **API Routes:** Always return typed responses
6. **Error Handling:** Use try/catch with proper error types
7. **Logging:** Console.log for dev, structured logs for prod

---

## 🚀 Deployment

### Vercel Deployment

1. **Connect Repository**
   - Link GitHub repo to Vercel
   - Set root directory if needed

2. **Configure Environment**
   - Add all env vars in Vercel dashboard
   - Set `CRON_SECRET` for secure cron endpoints

3. **Deploy**
   - Push to main branch triggers deploy
   - Cron jobs auto-configured via `vercel.json`

### Stripe Webhook Setup

1. Create endpoint: `https://your-domain.com/api/webhooks/stripe`
2. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
3. Copy signing secret to `STRIPE_WEBHOOK_SECRET`

### Post-Deployment Checklist

- [ ] All environment variables set
- [ ] Database migrations applied
- [ ] Stripe webhook configured
- [ ] Cron jobs verified running
- [ ] Health check endpoint responds
- [ ] Test membership signup flow
- [ ] Verify Shopify sync works

---

## 🧪 Testing

### API Testing

```bash
# Health check
curl https://your-domain.com/api/health

# Products
curl https://your-domain.com/api/products?limit=10

# Price sync
curl -X POST https://your-domain.com/api/prices \
  -H "Content-Type: application/json" \
  -d '{"action": "sync-all"}'
```

### Cron Job Testing

```bash
# With authentication
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-domain.com/api/cron?job=price-sync
```

### Webhook Testing

Use Stripe CLI for local webhook testing:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

---

## 🔧 Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Empty product list | No products in DB | Run discovery or import |
| Prices not updating | Stale data, no cron | Check cron job status |
| "Keepa key not configured" | Missing env var | Add `KEEPA_API_KEY` |
| "Rate limit exceeded" | Too many API calls | Wait or reduce batch size |
| Shopify sync fails | Invalid token | Regenerate access token |
| Stripe webhook fails | Wrong secret | Update `STRIPE_WEBHOOK_SECRET` |

### Debugging Steps

1. **Check Vercel Logs:** Vercel Dashboard → Your Project → Logs
2. **Check Supabase Logs:** Supabase Dashboard → Logs
3. **Check Browser Console:** F12 → Console tab
4. **Test API directly:** Use curl or Postman

### Log Locations

| System | Where to Find |
|--------|---------------|
| API Errors | Vercel Functions tab |
| Database Queries | Supabase Logs |
| Cron Jobs | Vercel Cron tab |
| Stripe Events | Stripe Dashboard → Webhooks |

---

## 📚 Related Documentation

| Document | Description |
|----------|-------------|
| [README.md](../README.md) | Project overview & quick start |
| [KEEPA_API.md](./KEEPA_API.md) | Keepa integration details |
| [RAINFOREST_API_GUIDE.md](./RAINFOREST_API_GUIDE.md) | Rainforest integration details |
| [pricing-rules.ts](../lib/config/pricing-rules.ts) | Business logic configuration |
| [schema.sql](../supabase/schema.sql) | Complete database schema |

---

## 📞 Support

For development questions:
1. Check this guide first
2. Review related documentation
3. Check Vercel/Supabase logs
4. Contact development team

---

*Last Updated: January 28, 2026*
*Version: 2.0*
ng DEVELOPER-GUIDE.md…]()
