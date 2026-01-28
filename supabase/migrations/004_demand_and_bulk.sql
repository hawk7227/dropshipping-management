-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 004: Demand Tracking, Discovery Runs, Bulk Checker Tables
-- ═══════════════════════════════════════════════════════════════════════════
-- Tables: product_demand, discovery_runs, rejection_log, bulk_check_jobs, 
--         bulk_check_results, keepa_api_log
-- Functions: is_asin_rejected, get_rejection_reasons, get_keepa_tokens_last_minute,
--            calculate_bulk_job_eta
-- Views: active_bulk_jobs, bulk_job_stats, keepa_usage_last_hour, high_demand_products
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 1: product_demand
-- Stores BSR history, volatility, and demand scores per ASIN
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS product_demand (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asin VARCHAR(20) UNIQUE NOT NULL,
  
  -- Current BSR values
  current_bsr INTEGER,
  avg_bsr_30d INTEGER,
  avg_bsr_90d INTEGER,
  
  -- Volatility and demand metrics
  bsr_volatility DECIMAL(5,2),
  bsr_trend VARCHAR(20) DEFAULT 'stable', -- 'improving', 'declining', 'stable'
  demand_score DECIMAL(5,2),
  estimated_monthly_sales INTEGER,
  
  -- Stock status
  stock_status VARCHAR(20) DEFAULT 'unknown', -- 'in_stock', 'out_of_stock', 'limited', 'unknown'
  
  -- History storage (JSON arrays)
  bsr_history JSONB DEFAULT '[]'::jsonb,
  price_history JSONB DEFAULT '[]'::jsonb,
  
  -- Metadata
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for product_demand
CREATE INDEX IF NOT EXISTS idx_product_demand_asin ON product_demand(asin);
CREATE INDEX IF NOT EXISTS idx_product_demand_bsr ON product_demand(current_bsr);
CREATE INDEX IF NOT EXISTS idx_product_demand_score ON product_demand(demand_score DESC);
CREATE INDEX IF NOT EXISTS idx_product_demand_last_updated ON product_demand(last_updated);
CREATE INDEX IF NOT EXISTS idx_product_demand_stock_status ON product_demand(stock_status);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 2: discovery_runs
-- Logs each automated discovery run for reporting
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS discovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Run identification
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  run_type VARCHAR(50) NOT NULL,
  triggered_by VARCHAR(100),
  
  -- Categories searched
  categories_searched TEXT[] DEFAULT '{}',
  search_terms_used TEXT[] DEFAULT '{}',
  
  -- Results summary
  products_evaluated INTEGER DEFAULT 0,
  passed_criteria_filter INTEGER DEFAULT 0,
  passed_demand_filter INTEGER DEFAULT 0,
  products_added INTEGER DEFAULT 0,
  products_rejected INTEGER DEFAULT 0,
  products_already_exist INTEGER DEFAULT 0,
  
  -- API usage
  api_tokens_used INTEGER DEFAULT 0,
  api_cost_estimate DECIMAL(10,4),
  api_calls_made INTEGER DEFAULT 0,
  
  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  
  -- Status
  status VARCHAR(20) DEFAULT 'running',
  error_message TEXT,
  
  -- Detailed logs (JSON)
  run_log JSONB DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for discovery_runs
CREATE INDEX IF NOT EXISTS idx_discovery_runs_date ON discovery_runs(run_date DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_runs_status ON discovery_runs(status);
CREATE INDEX IF NOT EXISTS idx_discovery_runs_type ON discovery_runs(run_type);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 3: rejection_log
-- Tracks why products were rejected (don't re-evaluate)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rejection_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asin VARCHAR(20) NOT NULL,
  
  -- Rejection details
  rejection_reason TEXT NOT NULL,
  rejection_details JSONB DEFAULT '{}'::jsonb,
  
  -- Product snapshot at rejection time
  product_data JSONB DEFAULT '{}'::jsonb,
  
  -- Source of rejection
  source VARCHAR(50) NOT NULL,
  discovery_run_id UUID REFERENCES discovery_runs(id),
  
  -- Can be re-evaluated after this date
  recheck_after DATE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint to prevent duplicate rejections
  UNIQUE(asin, source)
);

-- Indexes for rejection_log
CREATE INDEX IF NOT EXISTS idx_rejection_log_asin ON rejection_log(asin);
CREATE INDEX IF NOT EXISTS idx_rejection_log_source ON rejection_log(source);
CREATE INDEX IF NOT EXISTS idx_rejection_log_created ON rejection_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rejection_log_recheck ON rejection_log(recheck_after) WHERE recheck_after IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 4: bulk_check_jobs
-- Tracks bulk product checking jobs (uploaded files)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bulk_check_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Job identification
  user_id UUID,
  filename VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255),
  
  -- Job settings
  priority_order VARCHAR(30) DEFAULT 'high-margin-first', -- 'high-margin-first', 'high-price-first', 'as-uploaded'
  
  -- Counts
  total_products INTEGER DEFAULT 0,
  processed_products INTEGER DEFAULT 0,
  ready_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  reject_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'paused', 'completed', 'failed', 'cancelled'
  error_message TEXT,
  
  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  estimated_completion_at TIMESTAMPTZ,
  
  -- Processing metrics
  avg_time_per_product_ms INTEGER,
  tokens_used INTEGER DEFAULT 0,
  api_cost_estimate DECIMAL(10,4)
);

-- Indexes for bulk_check_jobs
CREATE INDEX IF NOT EXISTS idx_bulk_check_jobs_user ON bulk_check_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_check_jobs_status ON bulk_check_jobs(status);
CREATE INDEX IF NOT EXISTS idx_bulk_check_jobs_created ON bulk_check_jobs(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 5: bulk_check_results
-- Individual product results within a bulk check job
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bulk_check_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES bulk_check_jobs(id) ON DELETE CASCADE,
  
  -- Product identification
  asin VARCHAR(20) NOT NULL,
  row_index INTEGER NOT NULL,
  process_order INTEGER,
  
  -- Original data from upload
  original_title TEXT,
  original_cost DECIMAL(10,2),
  original_price DECIMAL(10,2),
  
  -- Checked data from Keepa
  checked_title TEXT,
  amazon_price DECIMAL(10,2),
  keepa_price DECIMAL(10,2),
  
  -- Calculated values
  calculated_retail_price DECIMAL(10,2),
  calculated_margin DECIMAL(5,2),
  calculated_profit DECIMAL(10,2),
  
  -- Demand metrics
  bsr INTEGER,
  demand_score DECIMAL(5,2),
  estimated_monthly_sales INTEGER,
  
  -- Priority score for processing
  priority_score INTEGER DEFAULT 0,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'checking', 'ready', 'warning', 'reject', 'error'
  reject_reasons TEXT[],
  warning_reasons TEXT[],
  error_message TEXT,
  
  -- Stock info
  stock_status VARCHAR(20) DEFAULT 'unknown',
  is_prime BOOLEAN DEFAULT FALSE,
  
  -- Competitor prices
  amazon_display_price DECIMAL(10,2),
  costco_display_price DECIMAL(10,2),
  ebay_display_price DECIMAL(10,2),
  sams_display_price DECIMAL(10,2),
  walmart_display_price DECIMAL(10,2),
  target_display_price DECIMAL(10,2),
  
  -- Timing
  checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique per job
  UNIQUE(job_id, asin)
);

-- Indexes for bulk_check_results
CREATE INDEX IF NOT EXISTS idx_bulk_check_results_job ON bulk_check_results(job_id);
CREATE INDEX IF NOT EXISTS idx_bulk_check_results_asin ON bulk_check_results(asin);
CREATE INDEX IF NOT EXISTS idx_bulk_check_results_status ON bulk_check_results(status);
CREATE INDEX IF NOT EXISTS idx_bulk_check_results_process_order ON bulk_check_results(job_id, process_order);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE 6: keepa_api_log
-- Tracks Keepa API usage for cost monitoring
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS keepa_api_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Request details
  tokens_used INTEGER NOT NULL,
  asins_requested INTEGER NOT NULL,
  asins_returned INTEGER NOT NULL,
  asin_count INTEGER,
  
  -- Job association
  job_type VARCHAR(50),
  job_id VARCHAR(100),
  
  -- Result
  success BOOLEAN NOT NULL,
  error_message TEXT,
  
  -- Performance
  duration_ms INTEGER,
  
  -- Cost tracking
  estimated_cost_usd DECIMAL(10,6),
  
  -- Metadata
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for keepa_api_log
CREATE INDEX IF NOT EXISTS idx_keepa_log_created ON keepa_api_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_keepa_log_requested ON keepa_api_log(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_keepa_log_job_type ON keepa_api_log(job_type);
CREATE INDEX IF NOT EXISTS idx_keepa_log_success ON keepa_api_log(success);

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to check if ASIN was recently rejected
CREATE OR REPLACE FUNCTION is_asin_rejected(
  p_asin VARCHAR(20),
  p_source VARCHAR(50) DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_rejected BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM rejection_log
    WHERE asin = p_asin
      AND (p_source IS NULL OR source = p_source)
      AND (recheck_after IS NULL OR recheck_after > CURRENT_DATE)
  ) INTO v_rejected;
  
  RETURN v_rejected;
END;
$$ LANGUAGE plpgsql;

-- Function to get rejection reasons for an ASIN
CREATE OR REPLACE FUNCTION get_rejection_reasons(p_asin VARCHAR(20))
RETURNS TABLE(
  source VARCHAR(50),
  reason TEXT,
  rejected_at TIMESTAMPTZ,
  recheck_after DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.source,
    r.rejection_reason,
    r.created_at,
    r.recheck_after
  FROM rejection_log r
  WHERE r.asin = p_asin
  ORDER BY r.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get Keepa tokens used in last minute (for rate limiting check)
CREATE OR REPLACE FUNCTION get_keepa_tokens_last_minute()
RETURNS INTEGER AS $$
DECLARE
  v_tokens INTEGER;
BEGIN
  SELECT COALESCE(SUM(tokens_used), 0) INTO v_tokens
  FROM keepa_api_log
  WHERE requested_at >= NOW() - INTERVAL '1 minute';
  
  RETURN v_tokens;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate bulk job ETA
CREATE OR REPLACE FUNCTION calculate_bulk_job_eta(p_job_id UUID)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_remaining INTEGER;
  v_avg_time_ms INTEGER;
  v_eta TIMESTAMPTZ;
BEGIN
  SELECT 
    (total_products - processed_products),
    COALESCE(avg_time_per_product_ms, 10000) -- Default 10s per product
  INTO v_remaining, v_avg_time_ms
  FROM bulk_check_jobs
  WHERE id = p_job_id;
  
  IF v_remaining IS NULL OR v_remaining <= 0 THEN
    RETURN NOW();
  END IF;
  
  -- Calculate ETA considering rate limit (6 products per minute max)
  v_eta := NOW() + (v_remaining / 6.0 * INTERVAL '1 minute');
  
  RETURN v_eta;
END;
$$ LANGUAGE plpgsql;

-- Function to complete a discovery run
CREATE OR REPLACE FUNCTION complete_discovery_run(
  p_run_id UUID,
  p_status VARCHAR(20),
  p_products_added INTEGER DEFAULT 0,
  p_products_rejected INTEGER DEFAULT 0,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE discovery_runs
  SET 
    status = p_status,
    products_added = p_products_added,
    products_rejected = p_products_rejected,
    error_message = p_error_message,
    completed_at = NOW(),
    duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
  WHERE id = p_run_id;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

-- Auto-update last_updated on product_demand
CREATE OR REPLACE FUNCTION update_product_demand_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_product_demand_timestamp ON product_demand;
CREATE TRIGGER trigger_product_demand_timestamp
  BEFORE UPDATE ON product_demand
  FOR EACH ROW
  EXECUTE FUNCTION update_product_demand_timestamp();

-- Auto-update bulk job counts when results change
CREATE OR REPLACE FUNCTION update_bulk_job_counts()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE bulk_check_jobs SET
        ready_count = (SELECT COUNT(*) FROM bulk_check_results WHERE job_id = COALESCE(NEW.job_id, OLD.job_id) AND status = 'ready'),
        warning_count = (SELECT COUNT(*) FROM bulk_check_results WHERE job_id = COALESCE(NEW.job_id, OLD.job_id) AND status = 'warning'),
        reject_count = (SELECT COUNT(*) FROM bulk_check_results WHERE job_id = COALESCE(NEW.job_id, OLD.job_id) AND status = 'reject'),
        error_count = (SELECT COUNT(*) FROM bulk_check_results WHERE job_id = COALESCE(NEW.job_id, OLD.job_id) AND status = 'error'),
        processed_products = (SELECT COUNT(*) FROM bulk_check_results WHERE job_id = COALESCE(NEW.job_id, OLD.job_id) AND status != 'pending')
    WHERE id = COALESCE(NEW.job_id, OLD.job_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_bulk_job_counts ON bulk_check_results;
CREATE TRIGGER trg_update_bulk_job_counts
    AFTER INSERT OR UPDATE OR DELETE ON bulk_check_results
    FOR EACH ROW
    EXECUTE FUNCTION update_bulk_job_counts();

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════════════════════════════════════════

-- View: Active bulk jobs with progress
CREATE OR REPLACE VIEW active_bulk_jobs AS
SELECT 
    j.id,
    j.filename,
    j.status,
    j.total_products,
    j.processed_products,
    ROUND((j.processed_products::DECIMAL / NULLIF(j.total_products, 0)) * 100, 1) as progress_percent,
    j.ready_count,
    j.warning_count,
    j.reject_count,
    j.error_count,
    j.created_at,
    j.started_at,
    j.estimated_completion_at,
    EXTRACT(EPOCH FROM (NOW() - j.started_at)) / 60 as minutes_running
FROM bulk_check_jobs j
WHERE j.status IN ('pending', 'processing', 'paused')
ORDER BY j.created_at DESC;

-- View: Bulk job statistics
CREATE OR REPLACE VIEW bulk_job_stats AS
SELECT 
    j.id,
    j.filename,
    j.status,
    j.total_products,
    j.ready_count,
    j.warning_count,
    j.reject_count,
    j.error_count,
    ROUND((j.ready_count::DECIMAL / NULLIF(j.total_products, 0)) * 100, 1) as ready_percent,
    AVG(r.calculated_margin) as avg_margin,
    AVG(r.bsr) as avg_bsr,
    j.created_at,
    j.completed_at,
    EXTRACT(EPOCH FROM (j.completed_at - j.started_at)) / 60 as total_minutes
FROM bulk_check_jobs j
LEFT JOIN bulk_check_results r ON r.job_id = j.id AND r.status = 'ready'
GROUP BY j.id
ORDER BY j.created_at DESC;

-- View: Recent discovery runs summary
CREATE OR REPLACE VIEW recent_discovery_runs AS
SELECT 
  id,
  run_date,
  run_type,
  status,
  categories_searched,
  products_evaluated,
  products_added,
  products_rejected,
  api_tokens_used,
  api_cost_estimate,
  duration_seconds,
  started_at,
  completed_at
FROM discovery_runs
WHERE run_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY started_at DESC;

-- View: Keepa API usage stats
CREATE OR REPLACE VIEW keepa_usage_stats AS
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_requests,
  SUM(tokens_used) as total_tokens,
  SUM(asins_requested) as total_asins_requested,
  SUM(asins_returned) as total_asins_returned,
  SUM(estimated_cost_usd) as total_cost_usd,
  COUNT(*) FILTER (WHERE success) as successful_requests,
  COUNT(*) FILTER (WHERE NOT success) as failed_requests
FROM keepa_api_log
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- View: Keepa usage last hour
CREATE OR REPLACE VIEW keepa_usage_last_hour AS
SELECT 
    date_trunc('minute', requested_at) as minute,
    SUM(tokens_used) as tokens_used,
    COUNT(*) as request_count,
    SUM(asin_count) as asins_checked
FROM keepa_api_log
WHERE requested_at > NOW() - INTERVAL '1 hour'
GROUP BY date_trunc('minute', requested_at)
ORDER BY minute DESC;

-- View: High demand products
CREATE OR REPLACE VIEW high_demand_products AS
SELECT 
    pd.asin,
    pd.current_bsr,
    pd.demand_score,
    pd.estimated_monthly_sales,
    pd.bsr_volatility,
    pd.bsr_trend,
    pd.stock_status,
    pd.last_updated,
    pd.last_checked_at,
    p.title,
    p.retail_price,
    p.amazon_price
FROM product_demand pd
LEFT JOIN products p ON pd.asin = p.asin
WHERE pd.demand_score >= 70
  AND pd.current_bsr <= 50000
  AND pd.stock_status = 'in_stock'
ORDER BY pd.demand_score DESC, pd.current_bsr ASC;

-- View: Recently rejected ASINs
CREATE OR REPLACE VIEW recent_rejections AS
SELECT 
  asin,
  source,
  rejection_reason,
  product_data->>'price' as price_at_rejection,
  product_data->>'bsr' as bsr_at_rejection,
  recheck_after,
  created_at
FROM rejection_log
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- SAMPLE DATA / TESTING (comment out in production)
-- ═══════════════════════════════════════════════════════════════════════════

-- Uncomment to insert test data
/*
INSERT INTO bulk_check_jobs (filename, status, total_products, priority_order)
VALUES 
    ('test_products.xlsx', 'pending', 100, 'high-margin-first');

INSERT INTO product_demand (asin, current_bsr, demand_score, estimated_monthly_sales, bsr_volatility)
VALUES 
    ('B0TEST12345', 5000, 85.5, 150, 12.5),
    ('B0TEST67890', 75000, 45.2, 25, 35.0);

INSERT INTO discovery_runs (run_type, triggered_by, categories_searched, status)
VALUES 
    ('manual', 'test', ARRAY['beauty', 'kitchen'], 'completed');
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    RAISE NOTICE 'Migration 004: Demand tracking & bulk checker tables created successfully';
    RAISE NOTICE 'Tables: product_demand, discovery_runs, rejection_log, bulk_check_jobs, bulk_check_results, keepa_api_log';
    RAISE NOTICE 'Functions: is_asin_rejected, get_rejection_reasons, get_keepa_tokens_last_minute, calculate_bulk_job_eta';
    RAISE NOTICE 'Views: active_bulk_jobs, bulk_job_stats, keepa_usage_last_hour, high_demand_products';
END $$;
