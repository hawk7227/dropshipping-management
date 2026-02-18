-- database-migrations/v4-new-tables.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- V4 NEW TABLES — Items 42-47 supporting tables
-- Run this AFTER the existing migrations
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ SEO METADATA (Items 42, 44) ═══
CREATE TABLE IF NOT EXISTS seo_metadata (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID REFERENCES products(id) ON DELETE CASCADE,
  page_type       TEXT NOT NULL DEFAULT 'product' CHECK (page_type IN ('product', 'landing_page', 'category_page', 'comparison_page', 'guide_page')),
  page_handle     TEXT NOT NULL,
  page_title      TEXT NOT NULL,
  meta_title      TEXT,
  meta_description TEXT,
  keyword_target  TEXT,
  shopify_page_id TEXT,
  product_count   INTEGER DEFAULT 0,
  performance_score NUMERIC(5,2),
  impressions_30d INTEGER DEFAULT 0,
  clicks_30d      INTEGER DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stale', 'draft', 'disabled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_metadata_product ON seo_metadata (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_seo_metadata_type ON seo_metadata (page_type, status);
CREATE INDEX IF NOT EXISTS idx_seo_metadata_handle ON seo_metadata (page_handle);

-- ═══ SEARCH PERFORMANCE (Item 46 — GSC data) ═══
CREATE TABLE IF NOT EXISTS search_performance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query           TEXT NOT NULL,
  page_url        TEXT NOT NULL,
  clicks          INTEGER NOT NULL DEFAULT 0,
  impressions     INTEGER NOT NULL DEFAULT 0,
  ctr             NUMERIC(6,4) DEFAULT 0,
  avg_position    NUMERIC(5,1) DEFAULT 0,
  date            DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_perf_date ON search_performance (date DESC);
CREATE INDEX IF NOT EXISTS idx_search_perf_query ON search_performance (query);
CREATE INDEX IF NOT EXISTS idx_search_perf_impressions ON search_performance (impressions DESC);

-- ═══ AUDIENCE SEGMENTS (Item 47 — Behavioral segmentation) ═══
CREATE TABLE IF NOT EXISTS audience_segments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email  TEXT NOT NULL,
  segment_type    TEXT NOT NULL CHECK (segment_type IN ('high_value', 'cart_abandoner', 'category_enthusiast', 'price_sensitive', 'new_visitor', 'repeat_buyer', 'win_back')),
  ltv             NUMERIC(10,2) DEFAULT 0,
  order_count     INTEGER DEFAULT 0,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audience_seg_email ON audience_segments (customer_email);
CREATE INDEX IF NOT EXISTS idx_audience_seg_type ON audience_segments (segment_type);

-- ═══ PIXEL EVENTS (Item 45 — Server-side tracking audit) ═══
CREATE TABLE IF NOT EXISTS pixel_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        TEXT NOT NULL,
  event_name      TEXT NOT NULL,
  fb_sent         BOOLEAN DEFAULT false,
  tt_sent         BOOLEAN DEFAULT false,
  pin_sent        BOOLEAN DEFAULT false,
  value           NUMERIC(10,2),
  source_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pixel_events_event_id ON pixel_events (event_id);
CREATE INDEX IF NOT EXISTS idx_pixel_events_created ON pixel_events (created_at DESC);

-- ═══ GOOGLE PRODUCT PERFORMANCE (Item 38 — Shopping feed tracking) ═══
CREATE TABLE IF NOT EXISTS google_product_performance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID REFERENCES products(id) ON DELETE CASCADE,
  impressions     INTEGER DEFAULT 0,
  clicks          INTEGER DEFAULT 0,
  cost            NUMERIC(10,2) DEFAULT 0,
  conversions     INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'active',
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_google_perf_product ON google_product_performance (product_id);

-- ═══ RLS POLICIES ═══
ALTER TABLE seo_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE audience_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pixel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_product_performance ENABLE ROW LEVEL SECURITY;

-- Permissive policies (tighten in production with auth)
CREATE POLICY "seo_metadata_all" ON seo_metadata FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "search_performance_all" ON search_performance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "audience_segments_all" ON audience_segments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "pixel_events_all" ON pixel_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "google_product_perf_all" ON google_product_performance FOR ALL USING (true) WITH CHECK (true);
