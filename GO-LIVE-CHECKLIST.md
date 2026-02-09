# GO-LIVE CHECKLIST — Products V4

## The Honest Answer

**The code is complete and correct. But it won't work "out of the box" because it depends on ~6 external services that need accounts and API keys.** Think of it like a car that's fully built — engine, transmission, everything — but it needs gas, oil, and a key to start.

---

## What Works Immediately (Zero Config)

| Feature | Status | Notes |
|---------|--------|-------|
| All 15 frontend pages | ✅ Ready | UI renders, navigation works, layouts load |
| Product card grid + table view | ✅ Ready | Card/table toggle, density control, search, filters |
| Skeleton loading states | ✅ Ready | Shows while data loads |
| View preferences (localStorage) | ✅ Ready | Persists card/table choice |
| PRICING_RULES config | ✅ Ready | Hardcoded in lib/config/pricing-rules.ts |
| All component styling | ✅ Ready | Tailwind, responsive, dark-mode ready |
| File converter utility | ✅ Ready | CSV/JSON/XLSX conversion |

---

## What Needs Setup (Step by Step)

### STEP 1: Supabase (5 minutes) — REQUIRED

Without this, the app loads but shows empty pages.

1. Create project at [supabase.com](https://supabase.com)
2. Copy URL + anon key + service role key to `.env.local`
3. Run ALL migrations in order:

```bash
# In Supabase SQL Editor, run each file:
database-migrations/create-price-tracking-tables.sql
database-migrations/dashboard-tables.sql
database-migrations/channels-tables.sql
database-migrations/ai-scoring-tables.sql
database-migrations/ai-command-center-tables.sql
database-migrations/p1-missing-tables.sql
database-migrations/p1-ai-scores-table.sql
database-migrations/p1-price-snapshots-table.sql
database-migrations/p2-cron-logging-tables.sql
database-migrations/p3-marketing-tables.sql
database-migrations/p9-observability-tables.sql
database-migrations/fix-missing-tables.sql
database-migrations/add-product-fields.sql
database-migrations/sourcing-settings.sql
database-migrations/webhook-logs.sql
database-migrations/v4-new-tables.sql          ← NEW
```

**After this**: Products page loads data, all CRUD works, dashboard populates.

---

### STEP 2: Shopify (10 minutes) — REQUIRED for sync

Without this, products live only in Supabase. No storefront.

1. Create Shopify custom app with Admin API access
2. Scopes needed: `read_products, write_products, read_orders, write_orders, read_inventory`
3. Copy access token to `.env.local`
4. Register webhooks in Shopify admin → point to `https://your-domain.com/api/webhooks/shopify`

**After this**: Shopify sync works, ShopifySyncModal pushes products, webhooks flow back.

---

### STEP 3: Keepa API ($20/month) — REQUIRED for import/pricing

Without this, you can't import products or track Amazon prices.

1. Buy Keepa API subscription at [keepa.com](https://keepa.com/#!api)
2. Add key to `.env.local`

**After this**: Import by ASIN works, price sync cron works, cost prices populate.

---

### STEP 4: npm install + Deploy (5 minutes)

```bash
npm install
npm run build          # Verify no build errors
vercel deploy --prod   # Or: vercel link + git push
```

Set all env vars in Vercel dashboard → Settings → Environment Variables.

**After this**: App is live. Cron jobs auto-run on Vercel schedule.

---

### STEP 5 (OPTIONAL): Shopify Theme Snippets

The Liquid files need to be manually added to your Shopify theme:

1. Go to Shopify Admin → Online Store → Themes → Edit Code
2. Create each snippet file under `snippets/`:
   - `product-schema.liquid` (JSON-LD structured data)
   - `faq-howto-schema.liquid` (FAQ rich results)
   - `tracking-pixels.liquid` (FB/TikTok/Pinterest/GA4)
   - `competitor-badge.liquid` (price comparison badges)
   - `price-comparison.liquid` (comparison tables)
3. Add to `theme.liquid`:
```liquid
{% render 'product-schema', product: product %}
{% render 'faq-howto-schema', product: product %}
{% render 'tracking-pixels' %}
```
4. Set pixel IDs in Theme Settings (or hardcode them)

**After this**: Google rich results, retargeting pixels, and competitor badges appear on storefront.

---

## Optional Services (Features Degrade Gracefully)

| Service | Env Var | What Breaks Without It | Cost |
|---------|---------|----------------------|------|
| OpenAI | `OPENAI_API_KEY` | AI title optimization skipped at import — uses raw titles | ~$0.01/product |
| Rainforest | `RAINFOREST_API_KEY` | Alternative discovery engine unavailable — Keepa still works | $50/mo |
| Stripe | `STRIPE_SECRET_KEY` | Membership/billing page non-functional | 2.9% + $0.30 |
| Google Search Console | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | GSC data not fetched — no keyword tracking | Free |
| IndexNow | `INDEXNOW_KEY` | No instant indexing ping — Google still crawls normally | Free |
| Google Merchant Center | `GOOGLE_MERCHANT_ID` | Can't validate Shopping feed submission | Free |
| Facebook CAPI | `FB_CONVERSIONS_API_TOKEN` | Server-side FB events not sent — client pixel still works | Free |
| TikTok Events API | `TIKTOK_EVENTS_API_TOKEN` | Server-side TT events not sent — client pixel still works | Free |
| Pinterest CAPI | `PINTEREST_CONVERSIONS_TOKEN` | Server-side Pin events not sent — client pixel still works | Free |

---

## What Each Cron Job Needs

| Cron Job | Schedule | Dependencies |
|----------|----------|--------------|
| `product-discovery` | Daily 4 AM | Keepa API key + sourcing_settings table |
| `price-sync` | Hourly | Keepa + Shopify (for push) |
| `full-price-sync` | Daily 3 AM | Keepa + Shopify |
| `shopify-sync` | Every 6h | Shopify access token |
| `order-sync` | Every 15m | Shopify access token |
| `daily-stats` | Midnight | Supabase only |
| `ai-scoring` | Daily 2 AM | OpenAI (optional) |
| `google-shopping` | Daily 5 AM | Supabase only (feed is public XML) |
| `omnipresence` | Daily 6 AM | Supabase + Shopify (for page push) |
| `daily-learning` | Daily 11 PM | GSC service account (optional) |

---

## Minimum Viable Launch

To get a working product with the minimum effort:

1. **Supabase** — create project, run migrations (~5 min)
2. **Shopify** — create app, get access token (~10 min)
3. **Keepa** — buy API key (~2 min)
4. **`.env.local`** — fill in the 6 TIER 1+2 vars (~2 min)
5. **`npm install && vercel deploy`** (~5 min)

**Total: ~25 minutes to a working deployment.**

Everything else (AI, pixels, GSC, IndexNow) can be added incrementally as you need each feature. The code gracefully skips anything where the env var is missing.
