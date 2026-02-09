-- P1 AI SCORES TABLE MIGRATION
-- Creates the missing ai_scores table with proper relationships

-- ═══════════════════════════════════════════════════════════════════════════
-- AI SCORES TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
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

-- ═══════════════════════════════════════════════════════════════════════════
-- AI ANALYSIS LOG TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_analysis_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Analysis run information
  run_id UUID DEFAULT gen_random_uuid(),
  analysis_type TEXT CHECK (analysis_type IN ('batch', 'single', 'incremental')),
  status TEXT CHECK (status IN ('running', 'completed', 'failed', 'cancelled')) DEFAULT 'running',
  
  -- Processing statistics
  products_processed INTEGER DEFAULT 0,
  products_updated INTEGER DEFAULT 0,
  products_failed INTEGER DEFAULT 0,
  avg_score DECIMAL(5,2),
  high_score_products INTEGER DEFAULT 0,
  
  -- Performance metrics
  processing_time_ms INTEGER,
  memory_usage_mb DECIMAL(8,2),
  error_rate DECIMAL(5,2),
  
  -- Configuration and metadata
  analysis_config JSONB DEFAULT '{}',
  error_log JSONB DEFAULT '{}',
  performance_metrics JSONB DEFAULT '{}',
  
  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for ai_analysis_log
CREATE INDEX IF NOT EXISTS idx_ai_analysis_log_run_id ON ai_analysis_log(run_id);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_log_status ON ai_analysis_log(status);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_log_analysis_type ON ai_analysis_log(analysis_type);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_log_started_at ON ai_analysis_log(started_at);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_log_created_at ON ai_analysis_log(created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable RLS on ai_scores
ALTER TABLE ai_scores ENABLE ROW LEVEL SECURITY;

-- Enable RLS on ai_analysis_log
ALTER TABLE ai_analysis_log ENABLE ROW LEVEL SECURITY;

-- Create policies for ai_scores
CREATE POLICY "System can access all ai scores" ON ai_scores
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Admin can access all ai scores" ON ai_scores
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Users can read ai scores" ON ai_scores
  FOR SELECT USING (auth.jwt() ->> 'role' IN ('user', 'admin', 'service_role'));

-- Create policies for ai_analysis_log
CREATE POLICY "System can access all ai analysis logs" ON ai_analysis_log
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Admin can access all ai analysis logs" ON ai_analysis_log
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Users can read ai analysis logs" ON ai_analysis_log
  FOR SELECT USING (auth.jwt() ->> 'role' IN ('user', 'admin', 'service_role'));

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEWS FOR COMMON QUERIES
-- ═══════════════════════════════════════════════════════════════════════════

-- Product AI scores view
CREATE OR REPLACE VIEW product_ai_scores AS
SELECT 
  p.id as product_id,
  p.title,
  p.asin,
  p.status as product_status,
  ais.overall_score,
  ais.score_tier,
  ais.demand_score,
  ais.competition_score,
  ais.profitability_score,
  ais.trend_score,
  ais.quality_score,
  ais.price_competitiveness,
  ais.market_demand,
  ais.brand_strength,
  ais.customer_satisfaction,
  ais.confidence_level,
  ais.last_analyzed
FROM products p
LEFT JOIN ai_scores ais ON p.id = ais.product_id;

-- High scoring products view
CREATE OR REPLACE VIEW high_scoring_products AS
SELECT 
  p.id,
  p.title,
  p.asin,
  p.price,
  p.rating,
  p.review_count,
  ais.overall_score,
  ais.score_tier,
  ais.demand_score,
  ais.profitability_score,
  ais.last_analyzed
FROM products p
JOIN ai_scores ais ON p.id = ais.product_id
WHERE ais.overall_score >= 80
  AND p.status = 'active'
ORDER BY ais.overall_score DESC;

-- AI score distribution view
CREATE OR REPLACE VIEW ai_score_distribution AS
SELECT 
  score_tier,
  COUNT(*) as product_count,
  ROUND(AVG(overall_score), 2) as avg_score,
  ROUND(AVG(demand_score), 2) as avg_demand_score,
  ROUND(AVG(profitability_score), 2) as avg_profitability_score,
  ROUND(AVG(competition_score), 2) as avg_competition_score
FROM ai_scores
GROUP BY score_tier
ORDER BY 
  CASE score_tier
    WHEN 'excellent' THEN 1
    WHEN 'good' THEN 2
    WHEN 'average' THEN 3
    WHEN 'poor' THEN 4
  END;

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS FOR AI ANALYSIS
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to calculate AI score tier
CREATE OR REPLACE FUNCTION calculate_score_tier(p_score DECIMAL(5,2))
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_score >= 90 THEN
    RETURN 'excellent';
  ELSIF p_score >= 75 THEN
    RETURN 'good';
  ELSIF p_score >= 60 THEN
    RETURN 'average';
  ELSE
    RETURN 'poor';
  END IF;
END;
$$;

-- Function to update AI score for a product
CREATE OR REPLACE FUNCTION update_ai_score(
  product_uuid UUID,
  overall_score DECIMAL(5,2),
  demand_score DECIMAL(5,2),
  competition_score DECIMAL(5,2),
  profitability_score DECIMAL(5,2),
  trend_score DECIMAL(5,2),
  quality_score DECIMAL(5,2),
  price_competitiveness DECIMAL(5,2),
  market_demand DECIMAL(5,2),
  brand_strength DECIMAL(5,2),
  customer_satisfaction DECIMAL(5,2),
  confidence_level DECIMAL(3,2),
  feature_weights JSONB DEFAULT '{}',
  analysis_details JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  score_id UUID;
  score_tier TEXT;
BEGIN
  -- Calculate score tier
  score_tier := calculate_score_tier(overall_score);
  
  -- Insert or update AI score
  INSERT INTO ai_scores (
    product_id,
    overall_score,
    score_tier,
    demand_score,
    competition_score,
    profitability_score,
    trend_score,
    quality_score,
    price_competitiveness,
    market_demand,
    brand_strength,
    customer_satisfaction,
    confidence_level,
    feature_weights,
    analysis_details,
    last_analyzed,
    updated_at
  ) VALUES (
    product_uuid,
    overall_score,
    score_tier,
    demand_score,
    competition_score,
    profitability_score,
    trend_score,
    quality_score,
    price_competitiveness,
    market_demand,
    brand_strength,
    customer_satisfaction,
    confidence_level,
    feature_weights,
    analysis_details,
    NOW(),
    NOW()
  )
  ON CONFLICT (product_id) DO UPDATE SET
    overall_score = EXCLUDED.overall_score,
    score_tier = EXCLUDED.score_tier,
    demand_score = EXCLUDED.demand_score,
    competition_score = EXCLUDED.competition_score,
    profitability_score = EXCLUDED.profitability_score,
    trend_score = EXCLUDED.trend_score,
    quality_score = EXCLUDED.quality_score,
    price_competitiveness = EXCLUDED.price_competitiveness,
    market_demand = EXCLUDED.market_demand,
    brand_strength = EXCLUDED.brand_strength,
    customer_satisfaction = EXCLUDED.customer_satisfaction,
    confidence_level = EXCLUDED.confidence_level,
    feature_weights = EXCLUDED.feature_weights,
    analysis_details = EXCLUDED.analysis_details,
    last_analyzed = NOW(),
    updated_at = NOW()
  RETURNING id INTO score_id;
  
  RETURN score_id;
END;
$$;

-- Function to get AI score statistics
CREATE OR REPLACE FUNCTION get_ai_score_statistics()
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_products', COUNT(*),
    'avg_score', ROUND(AVG(overall_score), 2),
    'median_score', ROUND(
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY overall_score), 2
    ),
    'score_distribution', (
      SELECT json_build_object(
        'excellent', COUNT(*) FILTER (WHERE score_tier = 'excellent'),
        'good', COUNT(*) FILTER (WHERE score_tier = 'good'),
        'average', COUNT(*) FILTER (WHERE score_tier = 'average'),
        'poor', COUNT(*) FILTER (WHERE score_tier = 'poor')
      )
    ),
    'avg_demand_score', ROUND(AVG(demand_score), 2),
    'avg_profitability_score', ROUND(AVG(profitability_score), 2),
    'avg_competition_score', ROUND(AVG(competition_score), 2),
    'high_score_products', COUNT(*) FILTER (WHERE overall_score >= 80),
    'last_analyzed', MAX(last_analyzed)
  ) as result INTO result
  FROM ai_scores AS ais;
  
  RETURN result;
END;
$$;

-- Function to get products needing AI analysis
CREATE OR REPLACE FUNCTION get_products_needing_ai_analysis(hours INTEGER DEFAULT 24)
RETURNS TABLE (
  product_id text,
  title TEXT,
  asin TEXT,
  price DECIMAL(10,2),
  hours_since_analysis INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.title,
    p.asin,
    p.price,
    EXTRACT(HOURS FROM NOW() - COALESCE(ais.last_analyzed, '1970-01-01'::TIMESTAMPTZ))::INTEGER as hours_since_analysis
  FROM products p
  LEFT JOIN ai_scores ais ON p.id = ais.product_id
  WHERE p.status = 'active'
    AND (
      ais.product_id IS NULL 
      OR ais.last_analyzed < NOW() - INTERVAL '1 hour' * hours
    )
  ORDER BY 
    CASE WHEN ais.product_id IS NULL THEN 0 ELSE 1 END,
    COALESCE(ais.last_analyzed, '1970-01-01'::TIMESTAMPTZ) ASC
  LIMIT 1000;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- CLEANUP FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to clean up old analysis logs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_ai_analysis_logs()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM ai_analysis_log 
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND status = 'completed';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS FOR DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE ai_scores IS 'AI scoring data for products with component scores and analysis metadata';
COMMENT ON COLUMN ai_scores.overall_score IS 'Overall AI score (0-100) for the product';
COMMENT ON COLUMN ai_scores.score_tier IS 'Score tier: excellent (90+), good (75-89), average (60-74), poor (<60)';
COMMENT ON COLUMN ai_scores.demand_score IS 'Demand component of the AI score';
COMMENT ON COLUMN ai_scores.competition_score IS 'Competition component of the AI score';
COMMENT ON COLUMN ai_scores.profitability_score IS 'Profitability component of the AI score';
COMMENT ON COLUMN ai_scores.confidence_level IS 'Confidence level of the AI analysis (0-1)';
COMMENT ON COLUMN ai_scores.last_analyzed IS 'When the product was last analyzed by AI';

COMMENT ON TABLE ai_analysis_log IS 'Log of AI analysis runs with performance metrics and statistics';
COMMENT ON COLUMN ai_analysis_log.run_id IS 'Unique identifier for the analysis run';
COMMENT ON COLUMN ai_analysis_log.products_processed IS 'Number of products processed in this run';
COMMENT ON COLUMN ai_analysis_log.avg_score IS 'Average score for products processed in this run';
COMMENT ON COLUMN ai_analysis_log.high_score_products IS 'Number of products with score >= 80';

COMMENT ON VIEW product_ai_scores IS 'Products with their AI scores and analysis data';
COMMENT ON VIEW high_scoring_products IS 'Products with AI scores >= 80';
COMMENT ON VIEW ai_score_distribution IS 'Distribution of AI scores by tier with component averages';

COMMENT ON FUNCTION calculate_score_tier(score) IS 'Calculates the score tier based on the overall score';
COMMENT ON FUNCTION get_ai_score_statistics() IS 'Returns comprehensive AI score statistics';
COMMENT ON FUNCTION get_products_needing_ai_analysis(hours) IS 'Returns products that need AI analysis based on last analysis time';
COMMENT ON FUNCTION cleanup_old_ai_analysis_logs() IS 'Cleans up old completed analysis logs';

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS FOR UPDATED_AT
-- ═══════════════════════════════════════════════════════════════════════════

-- Create triggers for updated_at
CREATE TRIGGER update_ai_scores_updated_at 
  BEFORE UPDATE ON ai_scores 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_analysis_log_updated_at 
  BEFORE UPDATE ON ai_analysis_log 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
