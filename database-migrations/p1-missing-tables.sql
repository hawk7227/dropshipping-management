-- P1 Missing Tables Migration
-- Creates the missing tables identified in STEP 1 analysis

-- ═══════════════════════════════════════════════════════════════════════════
-- PRODUCT_DEMAND TABLE (P1.4)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS product_demand (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  asin TEXT,
  demand_tier TEXT CHECK (demand_tier IN ('high', 'medium', 'low')),
  current_bsr INTEGER,
  bsr_category TEXT,
  bsr_trend TEXT CHECK (bsr_trend IN ('up', 'down', 'stable')),
  demand_score DECIMAL(5,2),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint for ASIN-based tracking
  UNIQUE(asin)
);

-- Add indexes for product_demand
CREATE INDEX IF NOT EXISTS idx_product_demand_product_id ON product_demand(product_id);
CREATE INDEX IF NOT EXISTS idx_product_demand_asin ON product_demand(asin);
CREATE INDEX IF NOT EXISTS idx_product_demand_demand_tier ON product_demand(demand_tier);
CREATE INDEX IF NOT EXISTS idx_product_demand_last_updated ON product_demand(last_updated);

-- ═══════════════════════════════════════════════════════════════════════════
-- DISCOVERY_RUNS TABLE (P1.5)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS discovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  total_products_found INTEGER DEFAULT 0,
  products_imported INTEGER DEFAULT 0,
  products_rejected INTEGER DEFAULT 0,
  search_criteria JSONB,
  error_log JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint for daily runs
  UNIQUE(run_date)
);

-- Add indexes for discovery_runs
CREATE INDEX IF NOT EXISTS idx_discovery_runs_run_date ON discovery_runs(run_date);
CREATE INDEX IF NOT EXISTS idx_discovery_runs_status ON discovery_runs(status);
CREATE INDEX IF NOT EXISTS idx_discovery_runs_started_at ON discovery_runs(started_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- REJECTION_LOG TABLE (P1.6)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rejection_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  asin TEXT,
  title TEXT,
  rejection_reason TEXT NOT NULL,
  rejection_category TEXT CHECK (rejection_category IN ('low_rating', 'high_competition', 'price_mismatch', 'content_poor', 'duplicate', 'other')),
  confidence_score DECIMAL(3,2),
  raw_data JSONB,
  discovery_run_id UUID REFERENCES discovery_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for rejection_log
CREATE INDEX IF NOT EXISTS idx_rejection_log_product_id ON rejection_log(product_id);
CREATE INDEX IF NOT EXISTS idx_rejection_log_asin ON rejection_log(asin);
CREATE INDEX IF NOT EXISTS idx_rejection_log_rejection_category ON rejection_log(rejection_category);
CREATE INDEX IF NOT EXISTS idx_rejection_log_discovery_run_id ON rejection_log(discovery_run_id);
CREATE INDEX IF NOT EXISTS idx_rejection_log_created_at ON rejection_log(created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable RLS on new tables
ALTER TABLE product_demand ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rejection_log ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Users can view product demand for their products" ON product_demand
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage product demand" ON product_demand
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view discovery runs" ON discovery_runs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage discovery runs" ON discovery_runs
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view rejection logs" ON rejection_log
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage rejection logs" ON rejection_log
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS FOR UPDATED_AT
-- ═══════════════════════════════════════════════════════════════════════════

-- Create triggers for updated_at on new tables
CREATE TRIGGER update_product_demand_updated_at 
  BEFORE UPDATE ON product_demand 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_discovery_runs_updated_at 
  BEFORE UPDATE ON discovery_runs 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS FOR DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE product_demand IS 'Demand tracking for products with BSR and tier analysis';
COMMENT ON TABLE discovery_runs IS 'Daily product discovery run tracking and statistics';
COMMENT ON TABLE rejection_log IS 'Log of rejected products during discovery with reasons';

COMMENT ON COLUMN product_demand.demand_tier IS 'High/Med/Low demand classification based on BSR';
COMMENT ON COLUMN product_demand.current_bsr IS 'Current Best Seller Rank from Amazon';
COMMENT ON COLUMN product_demand.bsr_trend IS 'BSR rank trend over time';
COMMENT ON COLUMN product_demand.demand_score IS 'Calculated demand score (0-100)';

COMMENT ON COLUMN discovery_runs.run_date IS 'Date of the discovery run';
COMMENT ON COLUMN discovery_runs.search_criteria IS 'JSON of search parameters used';
COMMENT ON COLUMN discovery_runs.error_log IS 'JSON array of errors encountered';

COMMENT ON COLUMN rejection_log.rejection_category IS 'Category of rejection for analytics';
COMMENT ON COLUMN rejection_log.confidence_score IS 'AI confidence in rejection decision (0-1)';
COMMENT ON COLUMN rejection_log.raw_data IS 'Original API data for reprocessing';
