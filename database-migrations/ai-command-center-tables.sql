-- database-migrations/ai-command-center-tables.sql
-- AI Command Center and Price Intelligence database schema
-- Run this in Supabase SQL Editor

-- ======================================================================
-- AI COMMAND LOGS TABLE
-- ======================================================================

CREATE TABLE IF NOT EXISTS ai_command_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  command TEXT NOT NULL,
  interpretation JSONB NOT NULL,
  execution JSONB,
  executed BOOLEAN DEFAULT false,
  dry_run BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_command_logs_user_id 
  ON ai_command_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_command_logs_created_at 
  ON ai_command_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_command_logs_executed 
  ON ai_command_logs(executed);

-- ======================================================================
-- COMPETITOR PRICES TABLE
-- ======================================================================

CREATE TABLE IF NOT EXISTS competitor_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  competitor TEXT NOT NULL CHECK (competitor IN ('amazon', 'walmart', 'ebay')),
  price DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  in_stock BOOLEAN DEFAULT true,
  rating DECIMAL(3, 1),
  reviews_count INTEGER,
  checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(product_id, competitor),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_competitor_prices_product_id 
  ON competitor_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_competitor_prices_competitor 
  ON competitor_prices(competitor);
CREATE INDEX IF NOT EXISTS idx_competitor_prices_checked_at 
  ON competitor_prices(checked_at DESC);

-- ======================================================================
-- PRICE HISTORY TABLE
-- ======================================================================

CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  our_price DECIMAL(10, 2) NOT NULL,
  competitor_amazon DECIMAL(10, 2),
  competitor_walmart DECIMAL(10, 2),
  competitor_ebay DECIMAL(10, 2),
  margin_percentage DECIMAL(5, 2),
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_price_history_product_id 
  ON price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at 
  ON price_history(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_product_recorded 
  ON price_history(product_id, recorded_at DESC);

-- ======================================================================
-- PRICE ALERTS TABLE
-- ======================================================================

CREATE TABLE IF NOT EXISTS price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('margin_low', 'competitor_undercut', 'price_drop', 'stock_alert')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_product_id 
  ON price_alerts(product_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_severity 
  ON price_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_price_alerts_created_at 
  ON price_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_alerts_unresolved 
  ON price_alerts(resolved_at) WHERE resolved_at IS NULL;

-- ======================================================================
-- PRICE SYNC JOBS TABLE
-- ======================================================================

CREATE TABLE IF NOT EXISTS price_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  total_products INTEGER NOT NULL,
  processed INTEGER DEFAULT 0,
  succeeded INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  error_log JSONB,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_sync_jobs_status 
  ON price_sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_price_sync_jobs_created_at 
  ON price_sync_jobs(created_at DESC);

-- ======================================================================
-- MARGIN RULES TABLE
-- ======================================================================

CREATE TABLE IF NOT EXISTS margin_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  min_margin DECIMAL(5, 2) NOT NULL DEFAULT 0.25,
  target_margin DECIMAL(5, 2) NOT NULL DEFAULT 0.35,
  max_margin DECIMAL(5, 2) NOT NULL DEFAULT 0.50,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_margin_rules_category 
  ON margin_rules(category);
CREATE INDEX IF NOT EXISTS idx_margin_rules_active 
  ON margin_rules(is_active);

-- ======================================================================
-- MARGIN RULE APPLICATION LOG
-- ======================================================================

CREATE TABLE IF NOT EXISTS margin_rule_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  rule_id UUID NOT NULL,
  old_price DECIMAL(10, 2),
  new_price DECIMAL(10, 2),
  old_margin DECIMAL(5, 2),
  new_margin DECIMAL(5, 2),
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (rule_id) REFERENCES margin_rules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_margin_rule_logs_product_id 
  ON margin_rule_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_margin_rule_logs_applied_at 
  ON margin_rule_logs(applied_at DESC);

-- ======================================================================
-- PRICE COMPARISON TABLE (for dashboard)
-- ======================================================================

CREATE TABLE IF NOT EXISTS price_comparison (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL UNIQUE,
  our_price DECIMAL(10, 2),
  amazon_price DECIMAL(10, 2),
  walmart_price DECIMAL(10, 2),
  ebay_price DECIMAL(10, 2),
  lowest_competitor DECIMAL(10, 2),
  highest_competitor DECIMAL(10, 2),
  avg_competitor DECIMAL(10, 2),
  margin_percentage DECIMAL(5, 2),
  margin_status TEXT CHECK (margin_status IN ('healthy', 'warning', 'critical')),
  undercut_percentage DECIMAL(5, 2),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_price_comparison_margin_status 
  ON price_comparison(margin_status);
CREATE INDEX IF NOT EXISTS idx_price_comparison_last_updated 
  ON price_comparison(last_updated DESC);

-- ======================================================================
-- BULK PRICE UPDATE JOBS TABLE
-- ======================================================================

CREATE TABLE IF NOT EXISTS bulk_price_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT UNIQUE NOT NULL,
  action TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  product_ids TEXT[] NOT NULL,
  total_count INTEGER NOT NULL,
  updated_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  parameters JSONB,
  error_log JSONB,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_price_jobs_status 
  ON bulk_price_jobs(status);
CREATE INDEX IF NOT EXISTS idx_bulk_price_jobs_created_at 
  ON bulk_price_jobs(created_at DESC);

-- ======================================================================
-- SOCIAL POSTS TABLE (for AI Command Center create_posts action)
-- ======================================================================

CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'pinterest')),
  caption TEXT NOT NULL,
  image_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
  scheduled_at TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
  engagement_metrics JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_social_posts_product_id 
  ON social_posts(product_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_platform 
  ON social_posts(platform);
CREATE INDEX IF NOT EXISTS idx_social_posts_status 
  ON social_posts(status);
CREATE INDEX IF NOT EXISTS idx_social_posts_created_at 
  ON social_posts(created_at DESC);

-- ======================================================================
-- EXTENDED PRODUCT FIELDS FOR AI (if not already present)
-- ======================================================================

-- These columns should be added to the products table if they don't exist
-- ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_title TEXT;
-- ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_description TEXT;
-- ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_keywords TEXT;

-- ======================================================================
-- MATERIALIZED VIEW FOR DASHBOARD STATS
-- ======================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS price_dashboard_stats AS
SELECT
  COUNT(DISTINCT p.id) as total_products,
  ROUND(AVG(CASE 
    WHEN p.cost_price > 0 
    THEN ((p.retail_price - p.cost_price) / p.cost_price) * 100 
    ELSE 0 
  END), 2) as avg_margin_percentage,
  COUNT(DISTINCT CASE 
    WHEN cp.checked_at < NOW() - INTERVAL '24 hours' 
    THEN cp.product_id 
  END) as stale_prices_count,
  COUNT(DISTINCT CASE 
    WHEN pa.severity = 'critical' AND pa.resolved_at IS NULL 
    THEN pa.product_id 
  END) as critical_alerts_count,
  SUM(CASE 
    WHEN ((p.retail_price - p.cost_price) / p.cost_price) * 100 >= 35 
    THEN 1 
    ELSE 0 
  END) as healthy_margin_count,
  SUM(CASE 
    WHEN ((p.retail_price - p.cost_price) / p.cost_price) * 100 BETWEEN 25 AND 34.99 
    THEN 1 
    ELSE 0 
  END) as warning_margin_count,
  SUM(CASE 
    WHEN ((p.retail_price - p.cost_price) / p.cost_price) * 100 < 25 
    THEN 1 
    ELSE 0 
  END) as critical_margin_count
FROM products p
LEFT JOIN competitor_prices cp ON p.id = cp.product_id
LEFT JOIN price_alerts pa ON p.id = pa.product_id
WHERE p.status = 'active';

-- ======================================================================
-- HELPER FUNCTIONS
-- ======================================================================

-- Function to calculate margin percentage
CREATE OR REPLACE FUNCTION calculate_margin(cost_price DECIMAL, retail_price DECIMAL)
RETURNS DECIMAL AS $$
BEGIN
  IF cost_price = 0 THEN
    RETURN 0;
  END IF;
  RETURN ROUND(((retail_price - cost_price) / cost_price) * 100, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get margin status
CREATE OR REPLACE FUNCTION get_margin_status(margin_percentage DECIMAL)
RETURNS TEXT AS $$
BEGIN
  IF margin_percentage >= 35 THEN
    RETURN 'healthy';
  ELSIF margin_percentage >= 25 THEN
    RETURN 'warning';
  ELSE
    RETURN 'critical';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to refresh price comparison view
CREATE OR REPLACE FUNCTION refresh_price_comparison()
RETURNS void AS $$
BEGIN
  DELETE FROM price_comparison;
  
  INSERT INTO price_comparison (
    product_id,
    our_price,
    amazon_price,
    walmart_price,
    ebay_price,
    lowest_competitor,
    highest_competitor,
    avg_competitor,
    margin_percentage,
    margin_status,
    undercut_percentage,
    last_updated
  )
  SELECT
    p.id,
    p.retail_price,
    MAX(CASE WHEN cp.competitor = 'amazon' THEN cp.price END),
    MAX(CASE WHEN cp.competitor = 'walmart' THEN cp.price END),
    MAX(CASE WHEN cp.competitor = 'ebay' THEN cp.price END),
    LEAST(
      p.retail_price,
      COALESCE(MAX(CASE WHEN cp.competitor = 'amazon' THEN cp.price END), p.retail_price),
      COALESCE(MAX(CASE WHEN cp.competitor = 'walmart' THEN cp.price END), p.retail_price),
      COALESCE(MAX(CASE WHEN cp.competitor = 'ebay' THEN cp.price END), p.retail_price)
    ),
    GREATEST(
      p.retail_price,
      COALESCE(MAX(CASE WHEN cp.competitor = 'amazon' THEN cp.price END), p.retail_price),
      COALESCE(MAX(CASE WHEN cp.competitor = 'walmart' THEN cp.price END), p.retail_price),
      COALESCE(MAX(CASE WHEN cp.competitor = 'ebay' THEN cp.price END), p.retail_price)
    ),
    AVG(CASE WHEN cp.competitor IS NOT NULL THEN cp.price ELSE NULL END),
    calculate_margin(p.cost_price, p.retail_price),
    get_margin_status(calculate_margin(p.cost_price, p.retail_price)),
    ROUND((LEAST(
      p.retail_price,
      COALESCE(MAX(CASE WHEN cp.competitor = 'amazon' THEN cp.price END), p.retail_price),
      COALESCE(MAX(CASE WHEN cp.competitor = 'walmart' THEN cp.price END), p.retail_price),
      COALESCE(MAX(CASE WHEN cp.competitor = 'ebay' THEN cp.price END), p.retail_price)
    ) - p.retail_price) / p.retail_price * 100, 2),
    NOW()
  FROM products p
  LEFT JOIN competitor_prices cp ON p.id = cp.product_id
  WHERE p.status = 'active'
  GROUP BY p.id, p.retail_price, p.cost_price;
END;
$$ LANGUAGE plpgsql;

-- ======================================================================
-- ENABLE ROW LEVEL SECURITY (Optional - uncomment if needed)
-- ======================================================================

-- ALTER TABLE ai_command_logs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE competitor_prices ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE margin_rules ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

-- ======================================================================
-- SAMPLE DATA (Optional)
-- ======================================================================

-- INSERT INTO margin_rules (name, min_margin, target_margin, max_margin, is_active)
-- VALUES 
--   ('Standard Rule', 0.25, 0.35, 0.50, true),
--   ('Premium Products', 0.40, 0.50, 0.75, true),
--   ('Clearance Items', 0.10, 0.20, 0.30, true);

-- ======================================================================
-- GRANT PERMISSIONS (if using RLS)
-- ======================================================================

-- GRANT SELECT ON ai_command_logs TO anon, authenticated;
-- GRANT INSERT ON ai_command_logs TO authenticated;
-- GRANT SELECT ON competitor_prices TO anon, authenticated;
-- GRANT SELECT ON price_history TO anon, authenticated;
-- GRANT SELECT ON price_alerts TO anon, authenticated;
-- GRANT UPDATE ON price_alerts TO authenticated;
-- GRANT SELECT ON margin_rules TO anon, authenticated;
-- GRANT SELECT ON price_comparison TO anon, authenticated;
