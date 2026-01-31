-- COMBINED MIGRATION FOR MISSING TABLES
-- Run this SQL to create the missing tables that are causing the API errors

-- First, create the price_snapshots table
-- (Content from p1-price-snapshots-table.sql)

-- ═══════════════════════════════════════════════════════════════════════════
-- PRICE SNAPSHOTS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS price_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- Price information
  current_price DECIMAL(10,2),
  cost_price DECIMAL(10,2),
  competitor_price DECIMAL(10,2),
  amazon_price DECIMAL(10,2),
  retail_price DECIMAL(10,2),
  
  -- Availability and stock
  availability TEXT CHECK (availability IN ('in_stock', 'limited', 'out_of_stock')),
  stock_level INTEGER DEFAULT 0,
  
  -- Market data
  rating DECIMAL(3,2),
  review_count INTEGER DEFAULT 0,
  bsr_rank INTEGER,
  bsr_category TEXT,
  
  -- Metadata
  is_latest BOOLEAN DEFAULT true,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure only one latest snapshot per product
  UNIQUE(product_id, is_latest) DEFERRABLE INITIALLY DEFERRED
);

-- Add indexes for price_snapshots
CREATE INDEX IF NOT EXISTS idx_price_snapshots_product_id ON price_snapshots(product_id);
CREATE INDEX IF NOT EXISTS idx_price_snapshots_is_latest ON price_snapshots(is_latest);
CREATE INDEX IF NOT EXISTS idx_price_snapshots_fetched_at ON price_snapshots(fetched_at);
CREATE INDEX IF NOT EXISTS idx_price_snapshots_availability ON price_snapshots(availability);
CREATE INDEX IF NOT EXISTS idx_price_snapshots_rating ON price_snapshots(rating);
CREATE INDEX IF NOT EXISTS idx_price_snapshots_created_at ON price_snapshots(created_at);

-- Composite index for latest snapshots
CREATE INDEX IF NOT EXISTS idx_price_snapshots_latest_product ON price_snapshots(product_id, is_latest, fetched_at);

-- Enable RLS on price_snapshots
ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;

-- Create policies for price_snapshots
CREATE POLICY "System can access all price snapshots" ON price_snapshots
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Admin can access all price snapshots" ON price_snapshots
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Users can read price snapshots" ON price_snapshots
  FOR SELECT USING (auth.jwt() ->> 'role' IN ('user', 'admin', 'service_role'));

-- ═══════════════════════════════════════════════════════════════════════════
-- AI SCORES TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- Overall AI score and tier
  overall_score DECIMAL(5,2) CHECK (overall_score >= 0 AND overall_score <= 100),
  score_tier TEXT CHECK (score_tier IN ('excellent', 'good', 'average', 'poor')),
  
  -- Component scores
  demand_score DECIMAL(5,2) CHECK (demand_score >= 0 AND demand_score <= 100),
  competition_score DECIMAL(5,2) CHECK (competition_score >= 0 AND competition_score <= 100),
  profitability_score DECIMAL(5,2) CHECK (profitability_score >= 0 AND profitability_score <= 100),
  trend_score DECIMAL(5,2) CHECK (trend_score >= 0 AND trend_score <= 100),
  quality_score DECIMAL(5,2) CHECK (quality_score >= 0 AND quality_score <= 100),
  
  -- Feature-based scores
  price_competitiveness DECIMAL(5,2) CHECK (price_competitiveness >= 0 AND price_competitiveness <= 100),
  market_demand DECIMAL(5,2) CHECK (market_demand >= 0 AND market_demand <= 100),
  brand_strength DECIMAL(5,2) CHECK (brand_strength >= 0 AND brand_strength <= 100),
  customer_satisfaction DECIMAL(5,2) CHECK (customer_satisfaction >= 0 AND customer_satisfaction <= 100),
  
  -- Analysis metadata
  analysis_version TEXT DEFAULT '1.0',
  confidence_level DECIMAL(3,2) CHECK (confidence_level >= 0 AND confidence_level <= 1),
  feature_weights JSONB DEFAULT '{}',
  analysis_details JSONB DEFAULT '{}',
  
  -- Timestamps
  last_analyzed TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint for one score per product
  UNIQUE(product_id)
);

-- Add indexes for ai_scores
CREATE INDEX IF NOT EXISTS idx_ai_scores_product_id ON ai_scores(product_id);
CREATE INDEX IF NOT EXISTS idx_ai_scores_overall_score ON ai_scores(overall_score);
CREATE INDEX IF NOT EXISTS idx_ai_scores_score_tier ON ai_scores(score_tier);
CREATE INDEX IF NOT EXISTS idx_ai_scores_last_analyzed ON ai_scores(last_analyzed);
CREATE INDEX IF NOT EXISTS idx_ai_scores_created_at ON ai_scores(created_at);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ai_scores_tier_score ON ai_scores(score_tier, overall_score);
CREATE INDEX IF NOT EXISTS idx_ai_scores_product_analyzed ON ai_scores(product_id, last_analyzed);

-- Enable RLS on ai_scores
ALTER TABLE ai_scores ENABLE ROW LEVEL SECURITY;

-- Create policies for ai_scores
CREATE POLICY "System can access all ai scores" ON ai_scores
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Admin can access all ai scores" ON ai_scores
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Users can read ai scores" ON ai_scores
  FOR SELECT USING (auth.jwt() ->> 'role' IN ('user', 'admin', 'service_role'));

-- ═══════════════════════════════════════════════════════════════════════════
-- SAMPLE DATA INSERTION (Optional - for testing)
-- ═══════════════════════════════════════════════════════════════════════════

-- Insert sample price snapshots for existing products
INSERT INTO price_snapshots (product_id, current_price, cost_price, competitor_price, availability, rating, review_count)
SELECT 
  id,
  ROUND((random() * 100 + 20)::NUMERIC, 2) as current_price,
  ROUND((random() * 50 + 10)::NUMERIC, 2) as cost_price,
  ROUND((random() * 120 + 25)::NUMERIC, 2) as competitor_price,
  CASE WHEN random() > 0.2 THEN 'in_stock' WHEN random() > 0.1 THEN 'limited' ELSE 'out_of_stock' END as availability,
  ROUND((random() * 2 + 3)::NUMERIC, 2) as rating,
  (random() * 500 + 10)::INTEGER as review_count
FROM products
WHERE id NOT IN (SELECT DISTINCT product_id FROM price_snapshots)
LIMIT 50;

-- Insert sample AI scores for existing products
INSERT INTO ai_scores (
  product_id, overall_score, score_tier, demand_score, competition_score, 
  profitability_score, trend_score, quality_score, confidence_level
)
SELECT 
  id,
  ROUND((random() * 40 + 60)::NUMERIC, 2) as overall_score,
  CASE 
    WHEN random() > 0.8 THEN 'excellent'
    WHEN random() > 0.5 THEN 'good'
    WHEN random() > 0.2 THEN 'average'
    ELSE 'poor'
  END as score_tier,
  ROUND((random() * 40 + 60)::NUMERIC, 2) as demand_score,
  ROUND((random() * 40 + 60)::NUMERIC, 2) as competition_score,
  ROUND((random() * 40 + 60)::NUMERIC, 2) as profitability_score,
  ROUND((random() * 40 + 60)::NUMERIC, 2) as trend_score,
  ROUND((random() * 40 + 60)::NUMERIC, 2) as quality_score,
  ROUND((random() * 0.3 + 0.7)::NUMERIC, 2) as confidence_level
FROM products
WHERE id NOT IN (SELECT DISTINCT product_id FROM ai_scores)
LIMIT 50;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES
-- ═══════════════════════════════════════════════════════════════════════════

-- Verify tables were created
SELECT 'price_snapshots' as table_name, COUNT(*) as row_count FROM price_snapshots
UNION ALL
SELECT 'ai_scores' as table_name, COUNT(*) as row_count FROM ai_scores;

-- Verify relationships exist
SELECT 
  tc.table_name, 
  tc.constraint_name, 
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('price_snapshots', 'ai_scores');

-- ═══════════════════════════════════════════════════════════════════════════
-- COMPLETION MESSAGE
-- ═══════════════════════════════════════════════════════════════════════════

-- Migration completed successfully!
-- The products API should now work with proper foreign key relationships.
