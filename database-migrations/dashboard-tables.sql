-- ═══════════════════════════════════════════════════════════════════════════
-- DASHBOARD DATA TABLES MIGRATION
-- File: database-migrations/dashboard-tables.sql
-- Purpose: Create tables needed for dashboard real-time data
-- ═══════════════════════════════════════════════════════════════════════════

-- =====================
-- ENSURE PRODUCTS TABLE HAS REQUIRED COLUMNS
-- =====================
-- These columns should already exist from add-product-fields.sql, but we ensure they're present

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS retail_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS inventory_quantity INTEGER DEFAULT 0;

-- Add profit_percent as a generated column for easier querying
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS profit_percent DECIMAL(5,2) 
  GENERATED ALWAYS AS (
    CASE 
      WHEN retail_price > 0 AND cost_price IS NOT NULL 
      THEN ((retail_price - cost_price) / retail_price * 100)
      ELSE 0 
    END
  ) STORED;

-- =====================
-- DISCOVERY RUNS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS discovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  products_discovered INTEGER DEFAULT 0,
  products_analyzed INTEGER DEFAULT 0,
  high_potential_count INTEGER DEFAULT 0,
  avg_score DECIMAL(5,2) DEFAULT 0,
  run_duration_seconds INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date)
);

CREATE INDEX IF NOT EXISTS idx_discovery_runs_date ON discovery_runs(date);
CREATE INDEX IF NOT EXISTS idx_discovery_runs_status ON discovery_runs(status);

-- =====================
-- PRODUCT DEMAND TABLE
-- =====================
CREATE TABLE IF NOT EXISTS product_demand (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  demand_tier TEXT NOT NULL CHECK (demand_tier IN ('High', 'Medium', 'Low')),
  demand_score DECIMAL(5,2) DEFAULT 0,
  search_volume INTEGER DEFAULT 0,
  trend_direction TEXT CHECK (trend_direction IN ('up', 'stable', 'down')),
  seasonality_factor DECIMAL(3,2) DEFAULT 1.0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_demand_product_id ON product_demand(product_id);
CREATE INDEX IF NOT EXISTS idx_product_demand_tier ON product_demand(demand_tier);
CREATE INDEX IF NOT EXISTS idx_product_demand_score ON product_demand(demand_score);

-- =====================
-- MARGIN ALERTS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS margin_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('below_threshold', 'negative_margin', 'price_spike', 'competitor_undercut')),
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message TEXT NOT NULL,
  current_margin DECIMAL(5,2),
  threshold_margin DECIMAL(5,2),
  previous_margin DECIMAL(5,2),
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_margin_alerts_product_id ON margin_alerts(product_id);
CREATE INDEX IF NOT EXISTS idx_margin_alerts_acknowledged ON margin_alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_margin_alerts_severity ON margin_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_margin_alerts_created ON margin_alerts(created_at);

-- =====================
-- ORDERS TABLE (Local cache for Shopify orders)
-- =====================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id TEXT UNIQUE,
  order_number TEXT,
  customer_email TEXT,
  customer_name TEXT,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  shipping DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'pending',
  fulfillment_status TEXT,
  financial_status TEXT,
  items JSONB DEFAULT '[]',
  shipping_address JSONB,
  ordered_at TIMESTAMPTZ NOT NULL,
  fulfilled_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_shopify_id ON orders(shopify_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_ordered_at ON orders(ordered_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_synced_at ON orders(synced_at);

-- =====================
-- PRICE HISTORY TABLE (For profit trend charts)
-- =====================
CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  cost_price DECIMAL(10,2),
  retail_price DECIMAL(10,2),
  profit_amount DECIMAL(10,2),
  profit_percent DECIMAL(5,2),
  competitor_price DECIMAL(10,2),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_product_id ON price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON price_history(recorded_at);

-- =====================
-- ENABLE ROW LEVEL SECURITY
-- =====================
ALTER TABLE discovery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_demand ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

-- =====================
-- RLS POLICIES
-- =====================

-- Discovery Runs Policies
CREATE POLICY "Service role can access all discovery runs" ON discovery_runs
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can read discovery runs" ON discovery_runs
  FOR SELECT USING (true);

-- Product Demand Policies
CREATE POLICY "Service role can access all product demand" ON product_demand
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can read product demand" ON product_demand
  FOR SELECT USING (true);

-- Margin Alerts Policies
CREATE POLICY "Service role can access all margin alerts" ON margin_alerts
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can read margin alerts" ON margin_alerts
  FOR SELECT USING (true);

CREATE POLICY "Users can update margin alerts" ON margin_alerts
  FOR UPDATE USING (true);

-- Orders Policies
CREATE POLICY "Service role can access all orders" ON orders
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can read orders" ON orders
  FOR SELECT USING (true);

-- Price History Policies
CREATE POLICY "Service role can access all price history" ON price_history
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can read price history" ON price_history
  FOR SELECT USING (true);

-- =====================
-- SAMPLE DATA FOR TESTING
-- =====================

-- Insert a discovery run for today
INSERT INTO discovery_runs (date, products_discovered, products_analyzed, high_potential_count, avg_score, status)
VALUES (CURRENT_DATE, 150, 150, 45, 72.5, 'completed')
ON CONFLICT (date) DO NOTHING;

-- Insert sample product demand data for existing products
INSERT INTO product_demand (product_id, demand_tier, demand_score, search_volume, trend_direction)
SELECT 
  id,
  CASE 
    WHEN random() > 0.7 THEN 'High'
    WHEN random() > 0.4 THEN 'Medium'
    ELSE 'Low'
  END as demand_tier,
  ROUND((random() * 40 + 60)::NUMERIC, 2) as demand_score,
  (random() * 10000 + 1000)::INTEGER as search_volume,
  CASE 
    WHEN random() > 0.6 THEN 'up'
    WHEN random() > 0.3 THEN 'stable'
    ELSE 'down'
  END as trend_direction
FROM products
WHERE id NOT IN (SELECT product_id FROM product_demand)
LIMIT 50
ON CONFLICT (product_id) DO NOTHING;

-- Insert sample margin alerts for products below 30% margin
INSERT INTO margin_alerts (product_id, alert_type, severity, message, current_margin, threshold_margin, acknowledged)
SELECT 
  id,
  'below_threshold' as alert_type,
  CASE 
    WHEN profit_percent < 15 THEN 'critical'
    WHEN profit_percent < 25 THEN 'high'
    ELSE 'medium'
  END as severity,
  'Product margin (' || COALESCE(profit_percent::TEXT, '0') || '%) is below threshold (30%)' as message,
  profit_percent as current_margin,
  30.00 as threshold_margin,
  random() > 0.7 as acknowledged
FROM products
WHERE profit_percent < 30 AND profit_percent IS NOT NULL
LIMIT 20
ON CONFLICT DO NOTHING;

-- =====================
-- VERIFICATION QUERIES
-- =====================

-- Verify tables were created
SELECT 'discovery_runs' as table_name, COUNT(*) as row_count FROM discovery_runs
UNION ALL
SELECT 'product_demand' as table_name, COUNT(*) as row_count FROM product_demand
UNION ALL
SELECT 'margin_alerts' as table_name, COUNT(*) as row_count FROM margin_alerts
UNION ALL
SELECT 'orders' as table_name, COUNT(*) as row_count FROM orders
UNION ALL
SELECT 'price_history' as table_name, COUNT(*) as row_count FROM price_history;

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════════════════
-- Next steps:
-- 1. Run this migration in Supabase SQL Editor
-- 2. Create dashboard service to query these tables
-- 3. Set up Shopify orders sync cron job
-- 4. Update dashboard API route to use new tables
-- ═══════════════════════════════════════════════════════════════════════════
