-- database-migrations/sourcing-settings.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- SOURCING SETTINGS TABLE — Spec Item 31
-- Stores auto-sourcing configuration, cron schedule, and criteria overrides
-- One row per setting key — acts as a key-value config store
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- Table: sourcing_settings
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sourcing_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Auto sourcing on/off
  enabled BOOLEAN NOT NULL DEFAULT false,
  
  -- Cron interval: '1h', '3h', '6h', '12h', '24h'
  cron_interval TEXT NOT NULL DEFAULT '6h' CHECK (cron_interval IN ('1h', '3h', '6h', '12h', '24h')),
  
  -- Auto-push to Shopify on discovery import
  auto_sync_shopify BOOLEAN NOT NULL DEFAULT false,
  
  -- Search terms for auto-discovery (JSON array of strings)
  search_terms JSONB NOT NULL DEFAULT '["kitchen gadgets", "phone accessories", "home organization"]'::jsonb,
  
  -- Max products per auto-run
  max_products_per_run INTEGER NOT NULL DEFAULT 100,
  
  -- Discovery criteria overrides (null = use defaults from pricing-rules.ts)
  min_amazon_price NUMERIC(10,2) DEFAULT NULL,
  max_amazon_price NUMERIC(10,2) DEFAULT NULL,
  min_reviews INTEGER DEFAULT NULL,
  min_rating NUMERIC(3,2) DEFAULT NULL,
  require_prime BOOLEAN DEFAULT NULL,
  
  -- Excluded brand words override (null = use defaults)
  excluded_brands JSONB DEFAULT NULL,
  
  -- Last run tracking
  last_run_at TIMESTAMPTZ DEFAULT NULL,
  last_run_status TEXT DEFAULT NULL,  -- 'completed', 'failed'
  last_run_imported INTEGER DEFAULT NULL,
  last_run_rejected INTEGER DEFAULT NULL,
  next_run_at TIMESTAMPTZ DEFAULT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Insert default row (singleton pattern — one config for the whole system)
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO sourcing_settings (id, enabled, cron_interval, auto_sync_shopify)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  false,
  '6h',
  false
)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- Auto-update updated_at trigger
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_sourcing_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sourcing_settings_updated ON sourcing_settings;
CREATE TRIGGER trg_sourcing_settings_updated
  BEFORE UPDATE ON sourcing_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_sourcing_settings_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS Policies (Supabase Row Level Security)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE sourcing_settings ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access to sourcing_settings"
  ON sourcing_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- Comments for documentation
-- ═══════════════════════════════════════════════════════════════════════════
COMMENT ON TABLE sourcing_settings IS 'Auto-sourcing configuration — singleton row for system-wide settings';
COMMENT ON COLUMN sourcing_settings.cron_interval IS 'Frequency: 1h, 3h, 6h, 12h, 24h';
COMMENT ON COLUMN sourcing_settings.search_terms IS 'JSON array of Amazon search terms for product discovery';
COMMENT ON COLUMN sourcing_settings.min_amazon_price IS 'Override pricing-rules.ts discovery.minAmazonPrice (null = use default)';
COMMENT ON COLUMN sourcing_settings.excluded_brands IS 'Override pricing-rules.ts discovery.excludeTitleWords (null = use default)';
