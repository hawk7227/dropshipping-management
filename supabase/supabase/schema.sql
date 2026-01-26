-- Dropship Pro Dashboard - Database Schema
-- Version: 1.0
-- Database: Supabase (PostgreSQL)
--
-- This schema enforces business rules at the database level:
-- - Competitor prices must be at least 80% higher than retail price
-- - Profit calculations are automatically computed via triggers
-- - Price history is recorded on every update
--
-- Run this in Supabase SQL Editor to create all tables

-- ═══════════════════════════════════════════════════════════════════════════
-- EXTENSIONS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- ═══════════════════════════════════════════════════════════════════════════
-- CUSTOM TYPES
-- ═══════════════════════════════════════════════════════════════════════════

-- Product source type
CREATE TYPE product_source AS ENUM (
  'rainforest',
  'keepa',
  'csv',
  'paste',
  'manual'
);

-- Product status type
CREATE TYPE product_status AS ENUM (
  'draft',
  'active',
  'paused',
  'archived'
);

-- Profit status type
CREATE TYPE profit_status AS ENUM (
  'profitable',
  'below_threshold',
  'unknown'
);

-- Lifecycle status type
CREATE TYPE lifecycle_status AS ENUM (
  'new',
  'price_drop',
  'stable',
  'rising'
);

-- Shopify sync status type
CREATE TYPE shopify_sync_status AS ENUM (
  'pending',
  'synced',
  'failed',
  'not_synced'
);

-- Queue action type
CREATE TYPE queue_action AS ENUM (
  'create',
  'update',
  'delete',
  'pause',
  'unpause'
);

-- Queue status type
CREATE TYPE queue_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed'
);

-- Job status type
CREATE TYPE job_status AS ENUM (
  'pending',
  'running',
  'validating',
  'processing',
  'completed',
  'failed'
);

-- Suggestion type
CREATE TYPE suggestion_type AS ENUM (
  'reprice',
  'pause',
  'archive',
  'promote',
  'bundle',
  'restock'
);

-- Priority type
CREATE TYPE priority_level AS ENUM (
  'high',
  'medium',
  'low'
);

-- Suggestion status type
CREATE TYPE suggestion_status AS ENUM (
  'pending',
  'accepted',
  'dismissed',
  'expired'
);

-- Notification type
CREATE TYPE notification_type AS ENUM (
  'price_alert',
  'import_complete',
  'sync_failed',
  'queue_stuck',
  'system'
);

-- Severity type
CREATE TYPE severity_level AS ENUM (
  'info',
  'warning',
  'error',
  'critical'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- PRODUCTS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Basic info
  title TEXT NOT NULL,
  source product_source NOT NULL DEFAULT 'manual',
  source_product_id TEXT,
  asin TEXT,
  url TEXT,
  image_url TEXT,
  
  -- Pricing (CORE BUSINESS LOGIC)
  cost_price NUMERIC(10, 2) NOT NULL CHECK (cost_price > 0),
  retail_price NUMERIC(10, 2) NOT NULL CHECK (retail_price > 0),
  
  -- Competitor display prices (must be >= retail_price * 1.80 when set)
  -- Constraint enforced via trigger to allow admin override
  amazon_display_price NUMERIC(10, 2),
  costco_display_price NUMERIC(10, 2),
  ebay_display_price NUMERIC(10, 2),
  sams_display_price NUMERIC(10, 2),
  
  -- Profit tracking (computed via trigger)
  profit_amount NUMERIC(10, 2),
  profit_percent NUMERIC(5, 2),
  profit_status profit_status NOT NULL DEFAULT 'unknown',
  
  -- Status
  status product_status NOT NULL DEFAULT 'draft',
  lifecycle_status lifecycle_status NOT NULL DEFAULT 'new',
  
  -- Shopify integration
  shopify_product_id TEXT,
  shopify_sync_status shopify_sync_status NOT NULL DEFAULT 'not_synced',
  
  -- Product details
  rating NUMERIC(2, 1) CHECK (rating >= 0 AND rating <= 5),
  review_count INTEGER CHECK (review_count >= 0),
  is_prime BOOLEAN NOT NULL DEFAULT false,
  
  -- Timestamps
  last_price_check TIMESTAMP WITH TIME ZONE,
  prices_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- Admin controls
  admin_override BOOLEAN NOT NULL DEFAULT false,
  
  -- Metadata
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  
  -- System timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT retail_greater_than_cost CHECK (retail_price >= cost_price),
  CONSTRAINT valid_asin CHECK (asin IS NULL OR asin ~ '^B[0-9A-Z]{9}$')
);

-- Indexes for products
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_source ON products(source);
CREATE INDEX idx_products_asin ON products(asin) WHERE asin IS NOT NULL;
CREATE INDEX idx_products_profit_status ON products(profit_status);
CREATE INDEX idx_products_shopify_sync ON products(shopify_sync_status);
CREATE INDEX idx_products_lifecycle ON products(lifecycle_status);
CREATE INDEX idx_products_created_at ON products(created_at DESC);
CREATE INDEX idx_products_updated_at ON products(updated_at DESC);
CREATE INDEX idx_products_title_search ON products USING gin(title gin_trgm_ops);
CREATE INDEX idx_products_cost_price ON products(cost_price);
CREATE INDEX idx_products_retail_price ON products(retail_price);
CREATE INDEX idx_products_tags ON products USING gin(tags);

-- ═══════════════════════════════════════════════════════════════════════════
-- SHOPIFY QUEUE TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE shopify_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  action queue_action NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  status queue_status NOT NULL DEFAULT 'pending',
  
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  
  last_error TEXT,
  error_code TEXT,
  
  scheduled_for TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for queue
CREATE INDEX idx_queue_status ON shopify_queue(status);
CREATE INDEX idx_queue_priority ON shopify_queue(priority DESC, created_at ASC) WHERE status = 'pending';
CREATE INDEX idx_queue_product_id ON shopify_queue(product_id);
CREATE INDEX idx_queue_scheduled ON shopify_queue(scheduled_for) WHERE status = 'pending' AND scheduled_for IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- DISCOVERY JOBS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE discovery_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  search_term TEXT NOT NULL,
  source product_source NOT NULL CHECK (source IN ('rainforest', 'keepa')),
  status job_status NOT NULL DEFAULT 'pending',
  
  products_found INTEGER NOT NULL DEFAULT 0,
  products_added INTEGER NOT NULL DEFAULT 0,
  products_skipped INTEGER NOT NULL DEFAULT 0,
  
  error_message TEXT,
  error_code TEXT,
  
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for discovery jobs
CREATE INDEX idx_discovery_status ON discovery_jobs(status);
CREATE INDEX idx_discovery_created_at ON discovery_jobs(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- IMPORT JOBS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE import_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  source product_source NOT NULL,
  file_name TEXT,
  
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  successful_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  
  status job_status NOT NULL DEFAULT 'pending',
  
  error_message TEXT,
  error_code TEXT,
  errors_detail JSONB,
  
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for import jobs
CREATE INDEX idx_import_status ON import_jobs(status);
CREATE INDEX idx_import_created_at ON import_jobs(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- AI SUGGESTIONS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE ai_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  type suggestion_type NOT NULL,
  priority priority_level NOT NULL DEFAULT 'medium',
  
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  product_ids UUID[],
  
  current_value TEXT,
  suggested_value TEXT,
  potential_impact TEXT,
  reasoning TEXT,
  confidence NUMERIC(3, 2) CHECK (confidence >= 0 AND confidence <= 1),
  
  status suggestion_status NOT NULL DEFAULT 'pending',
  
  expires_at TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE,
  dismissed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for suggestions
CREATE INDEX idx_suggestions_status ON ai_suggestions(status);
CREATE INDEX idx_suggestions_type ON ai_suggestions(type);
CREATE INDEX idx_suggestions_priority ON ai_suggestions(priority);
CREATE INDEX idx_suggestions_product_id ON ai_suggestions(product_id);
CREATE INDEX idx_suggestions_expires_at ON ai_suggestions(expires_at) WHERE status = 'pending';

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFICATIONS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  type notification_type NOT NULL,
  severity severity_level NOT NULL DEFAULT 'info',
  
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  metadata JSONB,
  
  read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  
  sms_sent BOOLEAN NOT NULL DEFAULT false,
  sms_sent_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for notifications
CREATE INDEX idx_notifications_read ON notifications(read) WHERE read = false;
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_severity ON notifications(severity);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_product_id ON notifications(product_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- PRICE HISTORY TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE price_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  cost_price NUMERIC(10, 2) NOT NULL,
  retail_price NUMERIC(10, 2) NOT NULL,
  
  amazon_display_price NUMERIC(10, 2),
  costco_display_price NUMERIC(10, 2),
  ebay_display_price NUMERIC(10, 2),
  sams_display_price NUMERIC(10, 2),
  
  source TEXT,
  
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for price history
CREATE INDEX idx_price_history_product_id ON price_history(product_id);
CREATE INDEX idx_price_history_recorded_at ON price_history(recorded_at DESC);
CREATE INDEX idx_price_history_product_date ON price_history(product_id, recorded_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- SYSTEM SETTINGS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- API USAGE TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE api_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  api TEXT NOT NULL,
  operation TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  cost NUMERIC(10, 4) NOT NULL DEFAULT 0,
  
  metadata JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for API usage
CREATE INDEX idx_api_usage_api ON api_usage(api);
CREATE INDEX idx_api_usage_created_at ON api_usage(created_at DESC);
CREATE INDEX idx_api_usage_api_date ON api_usage(api, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate profit metrics
CREATE OR REPLACE FUNCTION calculate_profit_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate profit amount
  NEW.profit_amount = NEW.retail_price - NEW.cost_price;
  
  -- Calculate profit percent
  IF NEW.cost_price > 0 THEN
    NEW.profit_percent = ((NEW.retail_price - NEW.cost_price) / NEW.cost_price) * 100;
  ELSE
    NEW.profit_percent = 0;
  END IF;
  
  -- Determine profit status
  IF NEW.profit_percent >= 30 THEN
    NEW.profit_status = 'profitable';
  ELSIF NEW.profit_percent > 0 THEN
    NEW.profit_status = 'below_threshold';
  ELSE
    NEW.profit_status = 'unknown';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate competitor prices (80% minimum markup rule)
-- Only enforced when admin_override is false
CREATE OR REPLACE FUNCTION validate_competitor_prices()
RETURNS TRIGGER AS $$
DECLARE
  min_price NUMERIC(10, 2);
BEGIN
  -- Skip validation if admin override is enabled
  IF NEW.admin_override = true THEN
    RETURN NEW;
  END IF;
  
  -- Calculate minimum allowed competitor price (80% above retail)
  min_price = NEW.retail_price * 1.80;
  
  -- Validate each competitor price if set
  IF NEW.amazon_display_price IS NOT NULL AND NEW.amazon_display_price < min_price THEN
    RAISE EXCEPTION 'Amazon display price ($%) must be at least 80%% higher than retail price ($%). Minimum: $%',
      NEW.amazon_display_price, NEW.retail_price, min_price
      USING ERRCODE = '23514';
  END IF;
  
  IF NEW.costco_display_price IS NOT NULL AND NEW.costco_display_price < min_price THEN
    RAISE EXCEPTION 'Costco display price ($%) must be at least 80%% higher than retail price ($%). Minimum: $%',
      NEW.costco_display_price, NEW.retail_price, min_price
      USING ERRCODE = '23514';
  END IF;
  
  IF NEW.ebay_display_price IS NOT NULL AND NEW.ebay_display_price < min_price THEN
    RAISE EXCEPTION 'eBay display price ($%) must be at least 80%% higher than retail price ($%). Minimum: $%',
      NEW.ebay_display_price, NEW.retail_price, min_price
      USING ERRCODE = '23514';
  END IF;
  
  IF NEW.sams_display_price IS NOT NULL AND NEW.sams_display_price < min_price THEN
    RAISE EXCEPTION 'Sam''s display price ($%) must be at least 80%% higher than retail price ($%). Minimum: $%',
      NEW.sams_display_price, NEW.retail_price, min_price
      USING ERRCODE = '23514';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to record price history
CREATE OR REPLACE FUNCTION record_price_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Only record if prices actually changed
  IF OLD.cost_price IS DISTINCT FROM NEW.cost_price
    OR OLD.retail_price IS DISTINCT FROM NEW.retail_price
    OR OLD.amazon_display_price IS DISTINCT FROM NEW.amazon_display_price
    OR OLD.costco_display_price IS DISTINCT FROM NEW.costco_display_price
    OR OLD.ebay_display_price IS DISTINCT FROM NEW.ebay_display_price
    OR OLD.sams_display_price IS DISTINCT FROM NEW.sams_display_price
  THEN
    INSERT INTO price_history (
      product_id,
      cost_price,
      retail_price,
      amazon_display_price,
      costco_display_price,
      ebay_display_price,
      sams_display_price,
      source
    ) VALUES (
      NEW.id,
      NEW.cost_price,
      NEW.retail_price,
      NEW.amazon_display_price,
      NEW.costco_display_price,
      NEW.ebay_display_price,
      NEW.sams_display_price,
      'price_update'
    );
    
    -- Update prices_updated_at
    NEW.prices_updated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-queue product for Shopify sync
CREATE OR REPLACE FUNCTION auto_queue_shopify_sync()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue if product is active and has Shopify ID
  IF NEW.status = 'active' AND NEW.shopify_product_id IS NOT NULL THEN
    -- Check if price changed
    IF OLD.retail_price IS DISTINCT FROM NEW.retail_price
      OR OLD.amazon_display_price IS DISTINCT FROM NEW.amazon_display_price
      OR OLD.costco_display_price IS DISTINCT FROM NEW.costco_display_price
      OR OLD.ebay_display_price IS DISTINCT FROM NEW.ebay_display_price
      OR OLD.sams_display_price IS DISTINCT FROM NEW.sams_display_price
    THEN
      -- Insert into queue (ignore if already pending)
      INSERT INTO shopify_queue (product_id, action, priority)
      VALUES (NEW.id, 'update', 0)
      ON CONFLICT DO NOTHING;
      
      -- Update sync status
      NEW.shopify_sync_status = 'pending';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

-- Update updated_at triggers
CREATE TRIGGER trigger_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_queue_updated_at
  BEFORE UPDATE ON shopify_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Calculate profit metrics on insert/update
CREATE TRIGGER trigger_calculate_profit
  BEFORE INSERT OR UPDATE OF cost_price, retail_price ON products
  FOR EACH ROW EXECUTE FUNCTION calculate_profit_metrics();

-- Validate competitor prices on insert/update
CREATE TRIGGER trigger_validate_competitors
  BEFORE INSERT OR UPDATE OF retail_price, amazon_display_price, costco_display_price, ebay_display_price, sams_display_price, admin_override ON products
  FOR EACH ROW EXECUTE FUNCTION validate_competitor_prices();

-- Record price history on update
CREATE TRIGGER trigger_price_history
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION record_price_history();

-- Auto-queue Shopify sync on price update
CREATE TRIGGER trigger_shopify_auto_queue
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION auto_queue_shopify_sync();

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for API routes)
-- These policies allow the service role key to access all data

CREATE POLICY "Service role has full access to products"
  ON products FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to shopify_queue"
  ON shopify_queue FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to discovery_jobs"
  ON discovery_jobs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to import_jobs"
  ON import_jobs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to ai_suggestions"
  ON ai_suggestions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to notifications"
  ON notifications FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to price_history"
  ON price_history FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to system_settings"
  ON system_settings FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to api_usage"
  ON api_usage FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════════════════════════════════════════

-- View for products with calculated fields
CREATE OR REPLACE VIEW products_view AS
SELECT
  p.*,
  CASE
    WHEN p.last_price_check IS NULL THEN true
    WHEN p.last_price_check < NOW() - INTERVAL '14 days' THEN true
    ELSE false
  END AS is_stale,
  CASE
    WHEN p.retail_price >= 20 THEN 'high'
    WHEN p.retail_price >= 10 THEN 'medium'
    ELSE 'low'
  END AS refresh_tier
FROM products p;

-- View for queue statistics
CREATE OR REPLACE VIEW queue_stats AS
SELECT
  status,
  COUNT(*) AS count,
  AVG(attempts) AS avg_attempts,
  MIN(created_at) AS oldest
FROM shopify_queue
GROUP BY status;

-- View for daily API usage
CREATE OR REPLACE VIEW daily_api_usage AS
SELECT
  DATE(created_at) AS date,
  api,
  SUM(request_count) AS total_requests,
  SUM(cost) AS total_cost
FROM api_usage
GROUP BY DATE(created_at), api
ORDER BY date DESC, api;

-- View for product summary stats
CREATE OR REPLACE VIEW product_stats AS
SELECT
  status,
  profit_status,
  COUNT(*) AS count,
  AVG(cost_price) AS avg_cost,
  AVG(retail_price) AS avg_retail,
  AVG(profit_percent) AS avg_profit_percent,
  SUM(profit_amount) AS total_profit
FROM products
GROUP BY status, profit_status;

-- ═══════════════════════════════════════════════════════════════════════════
-- DEFAULT SYSTEM SETTINGS
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO system_settings (key, value, description) VALUES
  ('queue_processor_enabled', 'true', 'Whether the Shopify queue processor is running'),
  ('queue_batch_size', '250', 'Number of items to process per batch'),
  ('sms_notifications_enabled', 'false', 'Whether SMS notifications are enabled'),
  ('admin_phone_number', '', 'Phone number for SMS alerts'),
  ('daily_api_budget_rainforest', '10.00', 'Daily budget for Rainforest API'),
  ('daily_api_budget_keepa', '5.00', 'Daily budget for Keepa API'),
  ('price_refresh_enabled', 'true', 'Whether automatic price refresh is enabled'),
  ('ai_suggestions_enabled', 'true', 'Whether AI suggestions are generated')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE products IS 'Main product catalog with pricing and status';
COMMENT ON TABLE shopify_queue IS 'Queue for Shopify sync operations';
COMMENT ON TABLE discovery_jobs IS 'Product discovery job tracking';
COMMENT ON TABLE import_jobs IS 'Bulk import job tracking';
COMMENT ON TABLE ai_suggestions IS 'AI-generated pricing and inventory suggestions';
COMMENT ON TABLE notifications IS 'User notifications and alerts';
COMMENT ON TABLE price_history IS 'Historical price tracking for trend analysis';
COMMENT ON TABLE system_settings IS 'Application configuration settings';
COMMENT ON TABLE api_usage IS 'External API usage tracking for cost monitoring';

COMMENT ON COLUMN products.admin_override IS 'When true, competitor price validation is skipped';
COMMENT ON COLUMN products.profit_status IS 'Calculated: profitable (>=30%), below_threshold (<30%), unknown';
COMMENT ON FUNCTION validate_competitor_prices() IS 'Enforces 80% minimum markup rule for competitor display prices';
