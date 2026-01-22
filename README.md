#Trigger Vercel deployment
# Dropshipping Membership Platform

Complete production-ready e-commerce platform with membership system, price intelligence, multi-channel selling, AI content generation, and analytics.

## Quick Stats

- **55 TypeScript/React files**
- **16,700+ lines of production code**
- **17 API routes**
- **12 pages**
- **13 components**
- **10 library modules**

## Features

### 1. Membership System
- Stripe-powered subscriptions ($9.99/mo or $99/yr)
- Members pay $0 for products (just shipping)
- Guest vs member price differentiation
- Billing portal, cancel/reactivate, invoice history
- Webhook-verified member status with caching

### 2. Price Intelligence
- Amazon competitor price tracking via Rainforest API
- Automated price sync with configurable margin rules
- Price history tracking and trend analysis
- Stale price detection and alerts
- Rate-limited API calls (1100ms between requests)

### 3. Product Management
- Full Shopify Admin API integration
- Product CRUD with variants support
- Inventory tracking with low stock alerts
- Bulk CSV import with batch tracking
- Cost tracking and margin calculation

### 4. Social & Marketing
- AI-powered content generation (OpenAI GPT-4)
- Multi-platform posting (Instagram, Facebook, TikTok)
- Email campaigns via SendGrid
- SMS marketing via Twilio
- Template management with variables
- Campaign scheduling and execution

### 5. Multi-Channel Commerce
- eBay Trading API integration
- TikTok Shop integration
- Google Merchant Center feed generation
- Unified order management across all channels
- Cross-channel inventory synchronization
- Order routing rules engine

### 6. AI Engines
- Product description generation with tone/length control
- SEO analysis and optimization scoring
- Meta title and description generation
- Market trend detection
- Image analysis and alt text generation
- Bulk content generation

### 7. Analytics Dashboard
- Real-time revenue and order tracking
- Member analytics with lifetime value
- Churn risk prediction
- Channel performance comparison
- Product performance metrics
- Automated weekly report generation
- Interactive charts (revenue, growth, prices)

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL + RLS)
- **Payments**: Stripe (Subscriptions + Checkout)
- **Styling**: Tailwind CSS
- **Deployment**: Vercel (with cron jobs)

## Project Structure

```
├── app/
│   ├── layout.tsx              # Root layout with navigation
│   ├── page.tsx                # Home redirect
│   ├── globals.css             # Global styles
│   ├── dashboard/page.tsx      # Main dashboard
│   ├── products/page.tsx       # Product management
│   ├── prices/page.tsx         # Price intelligence
│   ├── social/page.tsx         # Social & marketing
│   ├── channels/page.tsx       # Multi-channel orders
│   ├── ai/page.tsx             # AI content tools
│   ├── analytics/page.tsx      # Full analytics
│   ├── account/page.tsx        # Member account portal
│   ├── membership/
│   │   ├── page.tsx            # Membership landing
│   │   ├── checkout/page.tsx   # Checkout flow
│   │   └── success/page.tsx    # Success confirmation
│   └── api/
│       ├── products/route.ts   # Product CRUD, sync, inventory
│       ├── prices/route.ts     # Competitor tracking, margins
│       ├── social/route.ts     # Posts, campaigns, templates
│       ├── channels/route.ts   # Multi-channel operations
│       ├── ai/route.ts         # AI content generation
│       ├── analytics/route.ts  # Dashboard metrics
│       ├── cron/route.ts       # Scheduled jobs
│       ├── checkout/route.ts   # Cart checkout
│       ├── auth/me/route.ts    # User session
│       ├── membership/
│       │   ├── status/         # Check membership
│       │   ├── create-checkout/# Start subscription
│       │   ├── cancel/         # Cancel subscription
│       │   ├── reactivate/     # Reactivate subscription
│       │   ├── portal/         # Billing portal
│       │   ├── invoices/       # Invoice history
│       │   └── payment-method/ # Payment info
│       └── webhooks/
│           └── stripe/route.ts # Stripe webhooks
│
├── components/
│   ├── navigation/Navigation.tsx    # Sidebar + mobile nav
│   ├── dashboard/DashboardOverview.tsx
│   ├── products/ProductsPanel.tsx
│   ├── price-intelligence/PriceIntelligencePanel.tsx
│   ├── social/SocialMarketingPanel.tsx
│   ├── channels/ChannelsPanel.tsx
│   ├── ai/AIToolsPanel.tsx
│   ├── analytics/AnalyticsPanel.tsx
│   ├── account-portal.tsx
│   ├── membership-landing.tsx
│   ├── membership-checkout.tsx
│   ├── membership-success.tsx
│   └── ui/index.tsx            # Shared UI components
│
├── lib/
│   ├── price-sync.ts           # Rainforest API, competitor tracking
│   ├── product-management.ts   # Shopify sync, inventory
│   ├── social-marketing.ts     # AI content, email/SMS
│   ├── multichannel.ts         # eBay, TikTok, Google
│   ├── ai-engines.ts           # Descriptions, SEO, trends
│   ├── analytics.ts            # Dashboard, charts, reports
│   ├── stripe-products.ts      # Subscription management
│   ├── member-detection.ts     # Membership verification
│   ├── checkout-logic.ts       # Cart and checkout
│   └── webhook-handler.ts      # Stripe webhook processing
│
├── supabase/
│   └── schema.sql              # Complete database schema with RLS
│
├── types/
│   └── database.ts             # TypeScript interfaces
│
├── middleware.ts               # Auth middleware
├── vercel.json                 # Cron job configuration
├── package.json
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
└── .env.example
```

## Environment Variables

```env
# ===================
# REQUIRED - Core
# ===================
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# ===================
# REQUIRED - Stripe
# ===================
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# ===================
# REQUIRED - Shopify
# ===================
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...

# ===================
# OPTIONAL - Price Intelligence
# ===================
RAINFOREST_API_KEY=

# ===================
# OPTIONAL - AI Features
# ===================
OPENAI_API_KEY=sk-...

# ===================
# OPTIONAL - Social Marketing
# ===================
META_ACCESS_TOKEN=
META_PAGE_ID=
SENDGRID_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# ===================
# OPTIONAL - Multi-Channel
# ===================
EBAY_AUTH_TOKEN=
EBAY_SANDBOX=false
TIKTOK_ACCESS_TOKEN=
TIKTOK_SHOP_ID=
TIKTOK_APP_KEY=
TIKTOK_APP_SECRET=
GOOGLE_MERCHANT_ID=
GOOGLE_SERVICE_ACCOUNT_JSON=

# ===================
# OPTIONAL - Cron Security
# ===================
CRON_SECRET=your-random-secret

# ===================
# App Config
# ===================
NEXT_PUBLIC_STORE_URL=https://yourstore.com
NEXT_PUBLIC_STORE_NAME=Your Store Name
```

## Setup Guide

### 1. Database Setup

1. Create a new Supabase project
2. Go to SQL Editor
3. Run the contents of `supabase/schema.sql`
4. This creates all tables, RLS policies, and seed data

### 2. Stripe Setup

1. Create products in Stripe Dashboard:
   - **Monthly**: $9.99/month recurring
   - **Annual**: $99/year recurring

2. Copy the price IDs and update `lib/stripe-products.ts`:
   ```typescript
   export const MEMBERSHIP_TIERS = {
     monthly: {
       priceId: 'price_xxx', // Your monthly price ID
       // ...
     },
     annual: {
       priceId: 'price_xxx', // Your annual price ID
       // ...
     },
   };
   ```

3. Set up webhook endpoint:
   - URL: `https://yourdomain.com/api/webhooks/stripe`
   - Events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `invoice.payment_failed`

### 3. Install & Run

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### 4. Deploy to Vercel

1. Push to GitHub
2. Import to Vercel
3. Add environment variables
4. Deploy

Cron jobs are configured in `vercel.json`:
- Daily stats capture (midnight UTC)
- Price sync (every 6 hours)
- Order sync (hourly)
- Shopify sync (every 6 hours)

## API Reference

### Products
```
GET  /api/products?action=list&page=1&pageSize=50
GET  /api/products?action=get&id=xxx
GET  /api/products?action=stats
POST /api/products?action=create
POST /api/products?action=sync-shopify
PUT  /api/products?action=update&id=xxx
DELETE /api/products?action=delete&id=xxx
```

### Prices
```
GET  /api/prices?action=list&page=1
GET  /api/prices?action=stale&hours=24
GET  /api/prices?action=stats
GET  /api/prices?action=sync-status
POST /api/prices?action=sync-product&productId=xxx
```

### Social & Marketing
```
GET  /api/social?action=posts&limit=20
GET  /api/social?action=campaigns
GET  /api/social?action=templates
POST /api/social?action=create-post
POST /api/social?action=generate-post
POST /api/social?action=publish-post
```

### Channels
```
GET  /api/channels?action=channel-status
GET  /api/channels?action=orders&limit=50
POST /api/channels?action=sync-orders
POST /api/channels?action=update-fulfillment
```

### AI
```
GET  /api/ai?action=content&limit=50
GET  /api/ai?action=stats
POST /api/ai?action=generate-description
POST /api/ai?action=analyze-seo
POST /api/ai?action=analyze-trends
```

### Analytics
```
GET  /api/analytics?action=dashboard
GET  /api/analytics?action=overview
GET  /api/analytics?action=top-products&limit=10
GET  /api/analytics?action=high-value-members
GET  /api/analytics?action=churn-risk
GET  /api/analytics?action=channel-comparison
```

### Membership
```
GET  /api/membership/status
POST /api/membership/create-checkout
POST /api/membership/cancel
POST /api/membership/reactivate
POST /api/membership/portal
GET  /api/membership/invoices
GET  /api/membership/payment-method
```

## Design System

- **Aesthetic**: Professional Costco/Google Shopping style
- **Colors**: Clean white/gray palette, subtle green for savings
- **Typography**: System fonts (Inter, system-ui)
- **No**: Emojis, pulsing animations, aggressive sales language
- **Yes**: Clean cards, subtle shadows, professional spacing

## Security Features

- Row Level Security (RLS) on all database tables
- Stripe webhook signature verification
- API route authentication via Supabase
- Secure session handling
- Environment variable protection
- CORS configuration

## Performance Optimizations

- Member status caching (1 minute TTL)
- Rate-limited external API calls
- Paginated data fetching
- Optimistic UI updates
- Lazy loading components
- Image optimization

## License

Proprietary - All rights reserved
