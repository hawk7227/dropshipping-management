# 🗺️ SYSTEM MAP — Dropshipping Command Center

> **Last Updated:** March 5, 2026
> **Total Codebase:** 124,108 lines across 17 pages, 62 API routes, 80 lib files, 62 components
> **Stack:** Next.js 14 + Supabase + Shopify + Stripe + Keepa + Rainforest + OpenAI + Claude

---

## 📦 PAGES (17 pages)

| Page | Path | Lines | What It Does |
|------|------|-------|--------------|
| **Command Center** | `/command-center` | 2,618 | Product import, 10-gate validation, auto-fix, enrichment, pricing, bulk push. 3 tabs: Import, Compliance, Guide. AI Feed Bot slide-out. |
| **Google & SEO** | `/google` | 726 | Google Shopping feed dashboard, Search Console data, SEO engine, sitemap, schema, setup checklist. AI Feed Bot tab + slide-out. |
| **Products** | `/products` | 1,265 | Product catalog view with filters, search, grid/list views, Shopify sync status. |
| **Sourcing** | `/sourcing` | 1,925 | Product discovery from Amazon/Keepa. Criteria-first filtering. BSR/rating/price analysis. |
| **Prices** | `/prices` | 626 | Price intelligence dashboard. Competitor tracking. Margin rules. Alert system. |
| **Social** | `/social` | 5,191 | Social media command center. 7 tabs: Capture, Patterns, Generate, Schedule, Command, Brain, Google. Content generation + Zapier publishing. |
| **Campaigns** | `/campaigns` | 1,685 | Email/SMS/MMS campaign builder. Multi-channel. Patient segmentation. Make.com integration. |
| **Dashboard** | `/dashboard` | 560 | Overview stats. Revenue, orders, products, feed health. |
| **Analytics** | `/analytics` | 31 | Analytics wrapper page. |
| **Settings** | `/settings` | 1,118 | API keys, cron schedules, pricing rules, filters, export config. |
| **AI** | `/ai` | 700 | AI command center. Natural language product operations. |
| **Channels** | `/channels` | 44 | Multi-channel management (Shopify, eBay, TikTok Shop). |
| **Push to Shopify** | `/push-to-shopify` | 578 | Dedicated Shopify push interface with queue management. |
| **Converter** | `/converter` | 367 | File format converter (eBay File Exchange, etc.). |
| **Account** | `/account` | 10 | Account portal wrapper. |
| **Membership** | `/membership` | 10 | Membership/subscription page. |

---

## 🔌 API ROUTES (62 routes)

### Product Operations
| Route | Method | Lines | What It Does |
|-------|--------|-------|--------------|
| `/api/products` | GET/POST | 1,210 | CRUD for products table. Filters, pagination, bulk operations. |
| `/api/command-center` | POST | 229 | Single product push to Shopify with all Google fields. |
| `/api/bulk-push` | POST | 176 | Batch push to Shopify (3 per batch). |
| `/api/enrich` | POST | 232 | Enriches ASINs via Keepa/Rainforest. Returns title, price, images, brand, BSR. |
| `/api/market-price` | POST | 353 | Price research via Keepa. Returns market prices + competitor data. |
| `/api/import` | POST | 913 | Full product import pipeline. |
| `/api/import/v2` | POST | 513 | Enhanced import with validation. |
| `/api/import/sync` | POST | 897 | Sync imported products with Shopify. |
| `/api/shopify-push` | POST | 289 | Alternative Shopify push endpoint. |
| `/api/stock-check` | POST | 181 | Check Amazon stock status for ASINs. |
| `/api/amazon-price` | GET | 199 | Fetch current Amazon price for an ASIN. |
| `/api/amazon-image` | GET | 70 | Fetch product image from Amazon. |
| `/api/suggestions` | POST | 294 | AI product suggestions based on criteria. |

### Google & SEO
| Route | Method | Lines | What It Does |
|-------|--------|-------|--------------|
| `/api/feed/google-shopping` | GET/POST | 334 | **XML feed for Merchant Center.** GET returns RSS 2.0 XML with all g: attributes. POST returns feed health stats. |
| `/api/feed-bot` | POST | 339 | **AI Feed Bot API.** Receives chat messages, calls Claude with product context, returns optimization suggestions with 9 tools. |
| `/api/sitemap` | GET/POST | 237 | XML sitemap generation + Google Search Console submission. |

### Cron Jobs (automated daily/hourly)
| Route | Schedule | Lines | What It Does |
|-------|----------|-------|--------------|
| `/api/cron/google-shopping` | 5 AM daily | 516 | **Google Shopping Optimizer.** Fetches products, identifies underperformers, re-optimizes titles/descriptions for buyer keywords, generates custom labels, updates Shopify metafields. |
| `/api/cron/omnipresence` | 6 AM daily | 535 | **SEO Landing Page Generator.** Generates keyword-clustered pages (best X under $Y, top rated Z), FAQ schemas, pushes to Shopify Pages API. |
| `/api/cron/daily-learning` | 11 PM daily | 400 | **Performance Analyzer.** Pulls GSC data, analyzes what worked, discovers patterns, generates improvement plan for tomorrow. |
| `/api/cron/ai-optimize` | 4 AM daily | 264 | **AI Product Optimizer.** Batch optimizes titles, descriptions, SEO, pricing using AI. |
| `/api/cron/google-optimize` | scheduled | 205 | **Google Merchant Optimizer.** Updates custom labels, product highlights, underperformer fixes. |
| `/api/cron/discovery/run` | 4 AM daily | 621 | **Product Discovery.** Keepa bestsellers → criteria filter → demand analysis → database save. |
| `/api/cron?job=price-sync` | Hourly | 710 | **Price Sync.** Updates Amazon prices, recalculates margins, flags price drops. |
| `/api/cron?job=shopify-sync` | Every 6 hrs | 710 | **Shopify Sync.** Syncs product data with Shopify. |
| `/api/cron?job=order-sync` | Every 15 min | 93 | **Order Sync.** Pulls Shopify orders to local database. |
| `/api/cron/scraper` | Every 5 min | 252 | **Price Scraper.** Monitors competitor prices. |

### Other
| Route | Lines | What It Does |
|-------|-------|--------------|
| `/api/ai` | 566 | General AI endpoint for chat/commands |
| `/api/social` | 1,032 | Social media CRUD + Zapier publishing |
| `/api/prices/intelligence` | 464 | Price intelligence analysis |
| `/api/analytics-advanced` | 361 | Advanced analytics queries |
| `/api/health` | 401 | System health checks (102 checks, 13 categories) |
| `/api/queue` | 551 | Shopify push queue management |
| `/api/webhooks/shopify` | 271 | Shopify webhook handler |
| `/api/webhooks/stripe` | 13 | Stripe webhook handler |
| `/api/checkout` | 142 | Stripe checkout session creation |
| `/api/membership/*` | ~500 | Membership management (status, cancel, reactivate, portal, invoices) |

---

## 📚 LIB FILES (80 files, 40,554 lines)

### Level 3 Foundation (NEW — Google Merchant Compliance)
| File | Lines | What It Does |
|------|-------|--------------|
| `lib/contracts/identifiers.ts` | 67 | Zod schema: ASIN regex, GTIN checksum validation, handle slug |
| `lib/contracts/pricing.ts` | 89 | Zod schema: cost/sell with invariants, derived profit/margin |
| `lib/contracts/media.ts` | 39 | Zod schema: image URL validation, primary image derivation |
| `lib/contracts/merchant.ts` | 68 | Zod schema: gate results, availability/condition enums, feed score |
| `lib/contracts/product.ts` | 101 | Composed CleanProduct from all sub-schemas. parseProduct(). createEmptyProduct(). |
| `lib/contracts/constants.ts` | 195 | ALL constants: markup, title rules, desc rules, GTIN rules, 90+ Google category map |
| `lib/gates/registry.ts` | 57 | Declarative GateDefinition interface. Runner is 8 lines. |
| `lib/gates/core-gates.ts` | 92 | 5 core gates: title, image, price, asin, description |
| `lib/gates/google-gates.ts` | 140 | 5 Google gates: titleLength, descClean, googleCategory, barcode, identifier |
| `lib/gates/index.ts` | 61 | Combines all gates. runAllGates() single entry point. |
| `lib/feed-pipeline/detect.ts` | 42 | Stage 1: file type detection from headers |
| `lib/feed-pipeline/map.ts` | 98 | Stage 2: 80+ column mapping variations |
| `lib/feed-pipeline/clean.ts` | 135 | Stage 3: HTML strip, ASIN extract, image arrays, dedup |
| `lib/feed-pipeline/index.ts` | 162 | Stages 4-6: price + validate + score. processFile(). |
| `lib/push/queue.ts` | 172 | Job queue: per-product isolation, retry, concurrency control |
| `lib/push/shopify-adapter.ts` | 102 | Maps CleanProduct → Shopify API payload with all Google fields |
| `lib/tokens.ts` | 71 | Design tokens: spacing, radius, shadows, colors, motion |
| `lib/feed-bot-prompt.ts` | 158 | Feed Bot system prompt with research data + 2026 policy changes |

### SEO & Optimization Engines
| File | Lines | What It Does |
|------|-------|--------------|
| `lib/omnipresence-engine.ts` | 1,111 | Social posting via Zapier, email sequences, SMS marketing, pixel tracking |
| `lib/landing-page-generator.ts` | 397 | Keyword-clustered Shopify pages: "best X under $Y", "top rated Z" |
| `lib/programmatic-seo-engine.ts` | 283 | Orchestrates: keyword clusters → content → internal links → metadata → track |
| `lib/ai-seo-engine.ts` | 359 | AI title/description optimization for Google Shopping |
| `lib/google-shopping-optimizer.ts` | 280 | Daily optimizer: underperformers, custom labels, product highlights |
| `lib/google-search-console.ts` | 279 | GSC API: impressions, clicks, CTR, position data |
| `lib/faq-schema-generator.ts` | 205 | FAQ + HowTo structured data → Shopify metafields |
| `lib/google-merchant.ts` | 262 | Google Merchant Center API integration |

### Pricing & Discovery
| File | Lines | What It Does |
|------|-------|--------------|
| `lib/config/pricing-rules.ts` | 261 | Pricing config: 1.70x markup, competitor multipliers, discovery criteria |
| `lib/pricing-execution.ts` | 409 | Dynamic pricing engine with 3 safeguards |
| `lib/price-sync.ts` | 591 | Price monitoring + sync with Keepa |
| `lib/product-discovery.ts` | 522 | Criteria-first product discovery pipeline |
| `lib/margin-rules.ts` | 237 | Margin alert rules and thresholds |

### Services
| File | Lines | What It Does |
|------|-------|--------------|
| `lib/services/keepa.ts` | 629 | Keepa API client (batch 100 ASINs per request) |
| `lib/services/keepa-enhanced.ts` | 654 | Enhanced Keepa with token management |
| `lib/services/rainforest.ts` | 770 | Rainforest API client |
| `lib/services/shopify-queue.ts` | 824 | Shopify push queue (2 req/sec rate limit) |
| `lib/services/batch-scraper.ts` | 1,077 | Amazon batch scraper |
| `lib/services/amazon-scraper.ts` | 994 | Amazon product scraper |
| `lib/services/ai-suggestions.ts` | 697 | AI-powered product suggestions |
| `lib/services/price-intelligence-service.ts` | 732 | Price intelligence analysis |

---

## 🧩 COMPONENTS (62 components)

### Feed & Compliance (NEW)
| Component | Lines | What It Does |
|-----------|-------|--------------|
| `components/feed/FeedBotPanel.tsx` | 307 | AI chat panel. 5 quick actions. Tool approval cards. Auto-send initialPrompt. |
| `components/feed/GateBadge.tsx` | 48 | Single gate status badge (pass/warn/fail) |
| `components/feed/GateStatusBar.tsx` | 62 | Full 10-gate bar with pass counter + feed score |
| `components/feed/FeedScoreBadge.tsx` | 52 | SVG donut chart for feed health score 0-100 |
| `components/feed/PricingBlock.tsx` | 102 | Pricing display: cost/sell/profit/competitors |

### Products
| Component | Lines | What It Does |
|-----------|-------|--------------|
| `components/products/ProductsPanel.tsx` | 3,397 | Main products view with all filters and actions |
| `components/products/ProductCard.tsx` | 371 | Product card with image, pricing, status |
| `components/products/ProductCardGrid.tsx` | 633 | Grid layout for product cards |
| `components/products/BulkImportPanel.tsx` | 744 | Bulk product import interface |
| `components/products/BulkVerifyPanel.tsx` | 693 | Bulk product verification |
| `components/products/SourcingPanel.tsx` | 574 | Product sourcing interface |
| `components/products/ManualSourcingBar.tsx` | 1,001 | Manual ASIN sourcing |
| `components/products/ShopifySyncModal.tsx` | 378 | Shopify sync status modal |
| `components/products/CronTestPanel.tsx` | 423 | Cron job testing interface |

---

## ⏰ AUTOMATED CRON SCHEDULE

```
Every 5 min   → /api/cron/scraper          (price monitoring)
Every 15 min  → /api/cron?job=order-sync    (Shopify orders → DB)
Every hour    → /api/cron?job=price-sync    (Amazon price updates)
Every 6 hrs   → /api/cron?job=shopify-sync  (product sync)
Midnight      → /api/cron?job=daily-stats   (daily report)
2 AM          → /api/cron?job=ai-scoring    (AI product scoring)
3 AM          → /api/cron?job=full-price-sync (full price refresh)
4 AM          → /api/cron?job=product-discovery (new product find)
5 AM          → /api/cron?job=google-shopping (feed optimization)
6 AM          → /api/cron?job=omnipresence  (SEO landing pages)
11 PM         → /api/cron?job=daily-learning (GSC analysis)
```

---

## 🗄️ DATABASE (86 Supabase tables referenced)

Key tables: `products`, `product_demand`, `product_costs`, `competitor_prices`, `price_history`, `price_snapshots`, `orders`, `cron_job_logs`, `search_performance`, `seo_metadata`, `social_posts`, `campaigns`, `members`, `system_logs`, `ai_scores`

---

## 🔑 ENVIRONMENT VARIABLES (75 required)

Critical: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_SHOP_DOMAIN`, `KEEPA_API_KEY`, `RAINFOREST_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `STRIPE_SECRET_KEY`
