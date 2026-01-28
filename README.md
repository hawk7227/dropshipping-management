[README (4).md](https://github.com/user-attachments/files/24899456/README.4.md)
# Dropship Pro - Membership-Based Dropshipping Platform

> A full-stack e-commerce platform for automated product discovery, pricing intelligence, and multi-channel selling.

[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)](https://supabase.com/)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-purple)](https://stripe.com/)

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Architecture](#-architecture)
- [Quick Start](#-quick-start)
- [Configuration](#-configuration)
- [Project Structure](#-project-structure)
- [Core Workflows](#-core-workflows)
- [API Reference](#-api-reference)
- [Database Schema](#-database-schema)
- [Deployment](#-deployment)
- [Development](#-development)
- [Documentation](#-documentation)

---

## 🎯 Overview

Dropship Pro is an automated dropshipping management system that:

1. **Discovers** high-demand products from Amazon using Keepa API
2. **Filters** products by profitability criteria and demand consistency
3. **Calculates** optimal pricing with competitor price displays
4. **Syncs** products to Shopify, eBay, TikTok Shop, and Google Shopping
5. **Manages** memberships and subscriptions via Stripe
6. **Monitors** prices and demand, auto-adjusting as needed

### Business Model

- **Membership Tiers:** $9.99/month or $99/year
- **Pricing Strategy:** 70% markup on Amazon cost
- **Competitor Display:** Fake prices 80%+ higher to show value
- **Member Benefit:** Products appear as $0 (shipping only)

### Quick Stats

- **55+ TypeScript/React files**
- **16,700+ lines of production code**
- **17 API routes**
- **12 pages**
- **13 components**
- **10 library modules**

---

## ✨ Features

### Product Discovery
- [x] Keepa API integration for batch product lookup (100 ASINs/request)
- [x] BSR (Best Seller Rank) tracking for demand analysis
- [x] Automated criteria filtering (price, reviews, rating, Prime)
- [x] Brand exclusion (Nike, Apple, Disney, etc.)
- [x] Demand consistency scoring
- [x] Rainforest API fallback for single lookups
- [ ] Scheduled automated discovery (cron ready, awaiting activation)

### Pricing Intelligence
- [x] Automated pricing calculations (70% markup)
- [x] Competitor price generation (Amazon, Costco, eBay, Sam's Club)
- [x] Margin monitoring with alerts (30% minimum threshold)
- [x] Tiered refresh schedule (daily/3-day/weekly based on price)
- [x] 14-day stale product detection
- [ ] Auto-pause for low-margin products (grace period logic ready)

### Multi-Channel Commerce
- [x] Shopify integration (API + batch queue system)
- [x] eBay File Exchange CSV export (102 columns)
- [x] TikTok Shop API integration
- [x] Google Shopping feed generation
- [x] Unified order management across all channels
- [x] ASIN as universal product identifier

### Membership System
- [x] Stripe subscription management
- [x] Monthly ($9.99) and annual ($99) plans
- [x] Customer billing portal access
- [x] Webhook handling for all subscription events
- [x] Member status caching (1 minute TTL)

### AI Features
- [x] GPT-4 product description generation
- [x] SEO title optimization (60 char)
- [x] Meta description generation (150-160 char)
- [x] Social media content generation
- [x] Alt text generation for images
- [ ] Trend analysis and recommendations

### Analytics & Reporting
- [x] Revenue and order tracking
- [x] Member growth metrics
- [x] Product performance analysis
- [x] Price comparison charts
- [x] Weekly report generation
- [x] Daily stats capture

### Data Export
- [x] Master JSON backup
- [x] Master CSV export
- [x] Shopify-formatted CSV (166 columns)
- [x] eBay File Exchange CSV (102 columns)
- [ ] TikTok bulk upload CSV

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         DROPSHIP PRO                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Next.js   │    │  Supabase   │    │   Stripe    │         │
│  │   14 App    │◄──►│  Database   │◄──►│  Payments   │         │
│  │   Router    │    │  + Auth     │    │             │         │
│  └──────┬──────┘    └─────────────┘    └─────────────┘         │
│         │                                                       │
│  ┌──────┴───────────────────────────────────────────┐          │
│  │                   API Layer                       │          │
│  ├──────────┬──────────┬──────────┬────────────────┤          │
│  │ Products │  Prices  │ Members  │    Channels    │          │
│  └──────────┴──────────┴──────────┴────────────────┘          │
│         │                                                       │
│  ┌──────┴───────────────────────────────────────────┐          │
│  │               External Services                   │          │
│  ├─────────┬─────────┬─────────┬─────────┬─────────┤          │
│  │  Keepa  │Rainforest│ Shopify │  eBay   │ TikTok  │          │
│  │ (batch) │(fallback)│  (API)  │  (CSV)  │  (API)  │          │
│  └─────────┴─────────┴─────────┴─────────┴─────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React 18, Tailwind CSS |
| Backend | Next.js API Routes (Serverless) |
| Database | Supabase (PostgreSQL + Row Level Security) |
| Auth | Supabase Auth |
| Payments | Stripe Subscriptions + Checkout |
| Deployment | Vercel (with Cron Jobs) |
| Price Data | Keepa API (primary), Rainforest API (fallback) |
| AI | OpenAI GPT-4 |

### Data Flow

```
INBOUND:  Keepa/Rainforest → Supabase (Master) → Platform Exports
OUTBOUND: Supabase → Shopify API / eBay CSV / TikTok API
ORDERS:   All Platforms → Unified Orders Table → Fulfillment
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- Stripe account
- Keepa API key (for price intelligence)
- Shopify store with Admin API access

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/dropship-pro.git
cd dropship-pro

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Configure your environment variables (see Configuration section)

# Run database migrations
npx supabase db push

# Start development server
npm run dev
```

Visit `http://localhost:3000` to see the application.

---

## ⚙️ Configuration

### Required Environment Variables

```bash
# ===================
# DATABASE (Required)
# ===================
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ===================
# PAYMENTS (Required)
# ===================
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# ===================
# SHOPIFY (Required)
# ===================
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...

# ===================
# PRICE INTELLIGENCE (Required - at least one)
# ===================
KEEPA_API_KEY=your-keepa-key              # Primary - batch operations
RAINFOREST_API_KEY=your-rainforest-key    # Fallback - single lookups
```

### Optional Environment Variables

```bash
# ===================
# AI FEATURES
# ===================
OPENAI_API_KEY=sk-...

# ===================
# MULTI-CHANNEL
# ===================
EBAY_AUTH_TOKEN=your-ebay-token
TIKTOK_ACCESS_TOKEN=your-token
TIKTOK_SHOP_ID=your-shop-id
TIKTOK_APP_KEY=your-app-key
GOOGLE_MERCHANT_ID=your-merchant-id

# ===================
# MARKETING
# ===================
SENDGRID_API_KEY=SG...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
META_ACCESS_TOKEN=...
META_PAGE_ID=...

# ===================
# SECURITY
# ===================
CRON_SECRET=your-cron-secret
```

### Pricing Configuration

All pricing rules are centralized in `lib/config/pricing-rules.ts`:

```typescript
export const PRICING_RULES = {
  // Your markup on Amazon cost
  yourMarkup: { 
    multiplier: 1.70  // 70% markup: $10 cost → $17 retail
  },
  
  // Competitor display prices (all 80%+ higher than YOUR price)
  competitors: {
    minimumMarkup: 1.80,  // Enforced minimum
    ranges: {
      amazon: { min: 1.82, max: 1.88 },  // 82-88% higher
      costco: { min: 1.80, max: 1.85 },  // 80-85% higher
      ebay:   { min: 1.87, max: 1.93 },  // 87-93% higher
      sams:   { min: 1.80, max: 1.83 },  // 80-83% higher
    },
  },
  
  // Discovery criteria
  discovery: {
    minAmazonPrice: 3,
    maxAmazonPrice: 25,
    minReviews: 500,
    minRating: 3.5,
    requirePrime: true,
    excludeTitleWords: ['nike', 'apple', 'disney', 'samsung', ...],
  },
  
  // Demand tracking thresholds
  demand: {
    maxBSR: 100000,       // Max acceptable Best Seller Rank
    maxVolatility: 50,    // Max BSR volatility percentage
    minMonthlySales: 10,  // Min estimated monthly sales
  },
  
  // Profit thresholds
  profitThresholds: {
    minimum: 30,          // Alert if margin < 30%
    target: 70,           // Target margin
    gracePeriodDays: 7,   // Days before auto-pause
  },
  
  // Price refresh schedule
  refresh: {
    staleThresholdDays: 14,
    tiers: {
      high:   { minPrice: 20, intervalDays: 1 },   // Daily
      medium: { minPrice: 10, intervalDays: 3 },   // Every 3 days
      low:    { minPrice: 0,  intervalDays: 7 },   // Weekly
    },
  },
};
```

---

## 📁 Project Structure

```
dropshipping-management-main/
│
├── app/                              # Next.js 14 App Router
│   ├── api/                          # API Routes (17 endpoints)
│   │   ├── cron/route.ts             # Cron job handler
│   │   ├── discovery/route.ts        # Product discovery
│   │   ├── products/route.ts         # Product CRUD
│   │   ├── prices/route.ts           # Price management
│   │   ├── channels/route.ts         # Multi-channel sync
│   │   ├── social/route.ts           # Social marketing
│   │   ├── ai/route.ts               # AI generation
│   │   ├── analytics/route.ts        # Analytics
│   │   ├── membership/               # Subscription management
│   │   │   ├── status/route.ts
│   │   │   ├── create-checkout/route.ts
│   │   │   ├── cancel/route.ts
│   │   │   ├── reactivate/route.ts
│   │   │   ├── portal/route.ts
│   │   │   ├── invoices/route.ts
│   │   │   └── payment-method/route.ts
│   │   └── webhooks/
│   │       └── stripe/route.ts       # Stripe webhooks
│   │
│   ├── (pages)/                      # Page components (12 pages)
│   │   ├── dashboard/
│   │   ├── products/
│   │   ├── prices/
│   │   ├── channels/
│   │   ├── social/
│   │   ├── ai/
│   │   ├── analytics/
│   │   ├── membership/
│   │   └── account/
│   │
│   ├── layout.tsx                    # Root layout
│   └── page.tsx                      # Home page
│
├── lib/                              # Core Business Logic
│   ├── config/
│   │   ├── pricing-rules.ts          # ⭐ SINGLE SOURCE OF TRUTH
│   │   └── error-codes.ts            # Standardized error codes
│   │
│   ├── services/
│   │   ├── keepa.ts                  # Keepa API (batch, demand)
│   │   ├── rainforest.ts             # Rainforest API (fallback)
│   │   └── shopify-queue.ts          # Shopify batch queue
│   │
│   ├── utils/
│   │   ├── pricing-calculator.ts     # Price calculations
│   │   ├── api-error-handler.ts      # Error handling
│   │   ├── health-checker.ts         # System health
│   │   └── duplicate-detector.ts     # ASIN deduplication
│   │
│   ├── export/                       # Export utilities
│   │   ├── master-export.ts          # JSON/CSV backup
│   │   ├── shopify-csv.ts            # Shopify 166-col format
│   │   └── ebay-csv.ts               # eBay 102-col format
│   │
│   ├── product-discovery.ts          # Discovery logic
│   ├── price-sync.ts                 # Price sync logic
│   ├── multichannel.ts               # Multi-platform sync
│   ├── social-marketing.ts           # Social/email/SMS
│   ├── ai-engines.ts                 # AI generation
│   ├── analytics.ts                  # Reporting
│   └── stripe-products.ts            # Stripe integration
│
├── components/                       # React Components (13)
│   ├── ui/                           # Base UI library
│   └── ...                           # Feature components
│
├── types/                            # TypeScript Definitions
│   ├── database.ts                   # Database types
│   ├── errors.ts                     # Error types
│   └── index.ts                      # Shared types
│
├── supabase/
│   └── schema.sql                    # Complete database schema
│
├── docs/                             # Documentation
│   ├── CORE_WORKFLOW.md              # ⭐ Detailed workflow docs
│   └── API_REFERENCE.md              # API documentation
│
├── vercel.json                       # Cron job configuration
├── middleware.ts                     # Auth + membership middleware
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── README.md                         # This file
```

---

## 🔄 Core Workflows

### 1. Product Discovery (Criteria-First)

```
┌─────────────────────────────────────────────────────────────────┐
│                    DISCOVERY WORKFLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Keepa Best Sellers ──► Criteria Filter ──► Demand Filter      │
│  (100 products)         (price/reviews/     (BSR < 100k,       │
│                          rating/Prime/       low volatility)    │
│                          no brands)                             │
│         │                      │                   │            │
│         └──────────────────────┴───────────────────┘            │
│                                │                                │
│                    Qualifying Products (~10-15)                 │
│                                │                                │
│                    ┌───────────┴───────────┐                   │
│                    │                       │                    │
│              Price Calc              Demand Metrics             │
│              (70% markup)            (score, BSR)               │
│                    │                       │                    │
│                    └───────────┬───────────┘                   │
│                                │                                │
│                         Save to Supabase                        │
│                                │                                │
│                         Shopify Queue                           │
│                                │                                │
│                         Products Live                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Why Criteria-First?** More cost-efficient — we filter out unsuitable products BEFORE spending Keepa tokens on demand analysis.

### 2. Price Sync

```
Cron (hourly/daily) → Get Stale Products → Keepa Batch (100 ASINs)
                                                    ↓
                      ┌─────────────────────────────┴──────────────┐
                      │                                            │
               Price Changed?                              Demand Changed?
                      │                                            │
               Recalculate                                Update Metrics
               Update Shopify                             Create Alerts
                      │                                            │
                      └─────────────────────────────┬──────────────┘
                                                    ↓
                                              Log & Report
```

### 3. Multi-Platform Export

```
Supabase (Master) ─────┬───── Shopify API (real-time)
                       │
                       ├───── eBay CSV (File Exchange)
                       │
                       └───── TikTok API (batch)
```

**ASIN is the universal key** connecting products across all platforms.

See **[docs/CORE_WORKFLOW.md](docs/CORE_WORKFLOW.md)** for complete workflow documentation.

---

## 📡 API Reference

### Products API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/products` | List products with filters |
| `POST` | `/api/products` | Create product or bulk operation |
| `PUT` | `/api/products` | Update product |
| `DELETE` | `/api/products` | Delete product(s) |

**Query Parameters:**
- `search` - Search title/SKU
- `status` - active, draft, paused
- `profitStatus` - healthy, warning, critical
- `category` - Filter by category
- `minPrice`, `maxPrice` - Price range
- `page`, `limit` - Pagination

### Discovery API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/discovery?query=...` | Search products by keyword |
| `POST` | `/api/discovery` | Find deals by criteria |

### Prices API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/prices` | Get competitor prices, stats |
| `POST` | `/api/prices` | Sync product prices |

### Membership API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/membership/status` | Get current membership |
| `POST` | `/api/membership/create-checkout` | Start Stripe checkout |
| `POST` | `/api/membership/cancel` | Cancel at period end |
| `POST` | `/api/membership/reactivate` | Undo cancellation |
| `POST` | `/api/membership/portal` | Get billing portal URL |
| `GET` | `/api/membership/invoices` | Get invoice history |

### Cron API

| Method | Endpoint | Schedule | Description |
|--------|----------|----------|-------------|
| `GET` | `/api/cron?job=price-sync` | Hourly | Sync high-value prices |
| `GET` | `/api/cron?job=full-price-sync` | 3 AM | Full price refresh |
| `GET` | `/api/cron?job=product-discovery` | 4 AM | Find new products |
| `GET` | `/api/cron?job=order-sync` | Every 15 min | Pull all orders |
| `GET` | `/api/cron?job=shopify-sync` | Every 6 hrs | Sync to Shopify |
| `GET` | `/api/cron?job=daily-stats` | Midnight | Capture analytics |

---

## 🗄 Database Schema

### Core Tables

| Table | Description | Key Field |
|-------|-------------|-----------|
| `products` | Master product data | `asin` (unique) |
| `product_demand` | BSR history, demand scores | `asin` (FK) |
| `platform_listings` | Per-platform sync status | `product_id` + `platform` |
| `memberships` | User subscriptions | `user_id` |
| `unified_orders` | Orders from all channels | `platform` + `platform_order_id` |
| `alerts` | Margin, stock, demand alerts | `product_id` |
| `discovery_runs` | Discovery job logs | `run_date` |
| `rejection_log` | Rejected ASINs (no retry) | `asin` |

### Key Indexes

```sql
-- Fast product lookups
CREATE INDEX idx_products_asin ON products(asin);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_last_price_check ON products(last_price_check);

-- Demand queries
CREATE INDEX idx_demand_score ON product_demand(demand_score DESC);

-- Platform sync
CREATE INDEX idx_listings_platform ON platform_listings(platform, status);
```

See **[supabase/schema.sql](supabase/schema.sql)** for complete schema.

---

## 🚢 Deployment

### Vercel (Recommended)

1. **Connect Repository**
   - Link GitHub repo to Vercel
   - Select `dropshipping-management-main` as root

2. **Configure Environment**
   - Add all required env vars in Vercel dashboard
   - Set `CRON_SECRET` for secure cron endpoints

3. **Deploy**
   - Push to main branch triggers deploy
   - Cron jobs auto-configured via `vercel.json`

### Cron Configuration

```json
// vercel.json
{
  "crons": [
    { "path": "/api/cron?job=price-sync", "schedule": "0 * * * *" },
    { "path": "/api/cron?job=full-price-sync", "schedule": "0 3 * * *" },
    { "path": "/api/cron?job=product-discovery", "schedule": "0 4 * * *" },
    { "path": "/api/cron?job=shopify-sync", "schedule": "0 */6 * * *" },
    { "path": "/api/cron?job=order-sync", "schedule": "*/15 * * * *" },
    { "path": "/api/cron?job=daily-stats", "schedule": "0 0 * * *" }
  ]
}
```

**Note:** Cron jobs are stubs until API keys are configured. They pass Vercel verification but return `processed: 0`.

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

---

## 🛠 Development

### Commands

```bash
# Development server
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint

# Production build
npm run build

# Start production
npm start
```

### Testing Cron Jobs Locally

```bash
# Test price sync
curl http://localhost:3000/api/cron?job=price-sync

# Test with auth (production)
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-domain.com/api/cron?job=price-sync
```

### Database Operations

```bash
# Generate migration
npx supabase db diff -f migration_name

# Apply migrations
npx supabase db push

# Reset database (dev only!)
npx supabase db reset
```

---

## 📚 Documentation

| Document | Location | Description |
|----------|----------|-------------|
| **Core Workflow** | [docs/CORE_WORKFLOW.md](docs/CORE_WORKFLOW.md) | Complete workflow documentation |
| **Pricing Rules** | [lib/config/pricing-rules.ts](lib/config/pricing-rules.ts) | Single source of truth for pricing |
| **Database Schema** | [supabase/schema.sql](supabase/schema.sql) | Complete database definition |
| **API Reference** | [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | Detailed API documentation |

---

## 🔐 Security

- ✅ Row Level Security (RLS) on all Supabase tables
- ✅ Stripe webhook signature verification
- ✅ API route authentication via Supabase
- ✅ Environment variable protection
- ✅ Cron job authentication via secret
- ✅ CORS configuration
- ✅ Input validation and sanitization

---

## 📊 Current Status

### ✅ Implemented
- Product discovery criteria and filtering
- Pricing calculations with competitor displays
- Shopify integration (API + queue)
- Stripe membership system
- Multi-channel order sync
- Basic analytics and reporting

### 🚧 In Progress
- Keepa API integration (service file ready)
- Demand tracking (schema designed)
- eBay CSV export (format mapped)
- Automated discovery cron (stub ready)

### 📋 Planned
- Advanced analytics dashboard
- Email/SMS marketing automation
- Inventory forecasting
- A/B testing for prices
- Mobile app

---

## 📄 License

Proprietary - All rights reserved.

---

## 📞 Support

For questions or issues, contact the development team.

---

*Last Updated: January 27, 2026*  
*Version: 2.0*
