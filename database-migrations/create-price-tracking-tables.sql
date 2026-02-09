-- Create price tracking tables for competitor prices and price history
-- Run this in your Supabase SQL editor

-- ═══════════════════════════════════════════════════════════════════════════
-- COMPETITOR PRICES TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS competitor_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT,
  asin TEXT,
  competitor_name TEXT NOT NULL,
  competitor_price DECIMAL(10,2) NOT NULL,
  competitor_url TEXT,
  our_price DECIMAL(10,2),
  member_price DECIMAL(10,2),
  price_difference DECIMAL(10,2),
  price_difference_pct DECIMAL(5,2),
  is_prime BOOLEAN DEFAULT FALSE,
  availability TEXT,
  last_checked TIMESTAMPTZ DEFAULT NOW(),
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint to prevent duplicate competitor entries for same product
  UNIQUE(product_id, competitor_name)
);

-- Add indexes for competitor_prices
CREATE INDEX IF NOT EXISTS idx_competitor_prices_product_id ON competitor_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_competitor_prices_asin ON competitor_prices(asin);
CREATE INDEX IF NOT EXISTS idx_competitor_prices_competitor_name ON competitor_prices(competitor_name);
CREATE INDEX IF NOT EXISTS idx_competitor_prices_fetched_at ON competitor_prices(fetched_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- PRICE HISTORY TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source TEXT NOT NULL, -- 'us', 'competitor', 'amazon', etc.
  price DECIMAL(10,2) NOT NULL,
  competitor_prices JSONB, -- Store multiple competitor prices
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for price_history
CREATE INDEX IF NOT EXISTS idx_price_history_product_id ON price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_source ON price_history(source);
CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON price_history(recorded_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- MARGIN ALERTS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS margin_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('critical', 'warning', 'info')),
  alert_code TEXT NOT NULL,
  message TEXT NOT NULL,
  recommendation TEXT,
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for margin_alerts
CREATE INDEX IF NOT EXISTS idx_margin_alerts_product_id ON margin_alerts(product_id);
CREATE INDEX IF NOT EXISTS idx_margin_alerts_alert_type ON margin_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_margin_alerts_is_resolved ON margin_alerts(is_resolved);
CREATE INDEX IF NOT EXISTS idx_margin_alerts_created_at ON margin_alerts(created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- PRICE SYNC JOBS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS price_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  total_products INTEGER DEFAULT 0,
  processed INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for price_sync_jobs
CREATE INDEX IF NOT EXISTS idx_price_sync_jobs_status ON price_sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_price_sync_jobs_created_at ON price_sync_jobs(created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- MARGIN RULES TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS margin_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  min_margin DECIMAL(5,2) NOT NULL,
  max_margin DECIMAL(5,2),
  category TEXT,
  product_type TEXT,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for margin_rules
CREATE INDEX IF NOT EXISTS idx_margin_rules_category ON margin_rules(category);
CREATE INDEX IF NOT EXISTS idx_margin_rules_priority ON margin_rules(priority);
CREATE INDEX IF NOT EXISTS idx_margin_rules_is_active ON margin_rules(is_active);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE competitor_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_rules ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Users can view competitor prices for their products" ON competitor_prices
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert competitor prices" ON competitor_prices
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update competitor prices" ON competitor_prices
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view price history for their products" ON price_history
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert price history" ON price_history
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view margin alerts for their products" ON margin_alerts
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage margin alerts for their products" ON margin_alerts
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view price sync jobs" ON price_sync_jobs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage price sync jobs" ON price_sync_jobs
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view margin rules" ON margin_rules
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage margin rules" ON margin_rules
  FOR ALL USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS FOR UPDATED_AT
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_competitor_prices_updated_at 
  BEFORE UPDATE ON competitor_prices 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_margin_alerts_updated_at 
  BEFORE UPDATE ON margin_alerts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_price_sync_jobs_updated_at 
  BEFORE UPDATE ON price_sync_jobs 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_margin_rules_updated_at 
  BEFORE UPDATE ON margin_rules 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS FOR DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE competitor_prices IS 'Tracks competitor pricing for products';
COMMENT ON TABLE price_history IS 'Historical price tracking for products';
COMMENT ON TABLE margin_alerts IS 'Alerts for margin issues and opportunities';
COMMENT ON TABLE price_sync_jobs IS 'Background jobs for price synchronization';
COMMENT ON TABLE margin_rules IS 'Business rules for margin calculations';

COMMENT ON COLUMN competitor_prices.last_checked IS 'When this competitor price was last verified';
COMMENT ON COLUMN price_history.competitor_prices IS 'JSON object of multiple competitor prices at recording time';
COMMENT ON COLUMN margin_alerts.alert_type IS 'critical: urgent action needed, warning: monitor closely, info: opportunity';
COMMENT ON COLUMN price_sync_jobs.status IS 'pending: waiting to start, running: in progress, completed: finished, failed: error occurred';
