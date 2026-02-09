-- AI Scoring and Feature Vector Tables Migration
-- Creates tables for AI analysis persistence

-- ═══════════════════════════════════════════════════════════════════════════
-- AI SCORES TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  demand_score INTEGER NOT NULL CHECK (demand_score >= 0 AND demand_score <= 100),
  price_score INTEGER NOT NULL CHECK (price_score >= 0 AND price_score <= 100),
  content_score INTEGER NOT NULL CHECK (content_score >= 0 AND content_score <= 100),
  market_score INTEGER NOT NULL CHECK (market_score >= 0 AND market_score <= 100),
  recommendations TEXT[] DEFAULT '{}',
  risk_factors TEXT[] DEFAULT '{}',
  opportunities TEXT[] DEFAULT '{}',
  feature_confidence DECIMAL(3,2) CHECK (feature_confidence >= 0 AND feature_confidence <= 1),
  score_tier TEXT NOT NULL CHECK (score_tier IN ('A+', 'A', 'B', 'C', 'D')),
  scored_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint for one score per product
  UNIQUE(product_id)
);

-- Add indexes for ai_scores
CREATE INDEX IF NOT EXISTS idx_ai_scores_product_id ON ai_scores(product_id);
CREATE INDEX IF NOT EXISTS idx_ai_scores_overall_score ON ai_scores(overall_score);
CREATE INDEX IF NOT EXISTS idx_ai_scores_score_tier ON ai_scores(score_tier);
CREATE INDEX IF NOT EXISTS idx_ai_scores_scored_at ON ai_scores(scored_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- AI FEATURE VECTORS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_feature_vectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  asin TEXT,
  source TEXT,
  
  -- Demand signals
  rating_score DECIMAL(3,2) CHECK (rating_score >= 0 AND rating_score <= 1),
  review_volume_score DECIMAL(3,2) CHECK (review_volume_score >= 0 AND review_volume_score <= 1),
  demand_tier_score DECIMAL(3,2) CHECK (demand_tier_score >= 0 AND demand_tier_score <= 1),
  
  -- Price signals
  price_competitiveness_score DECIMAL(3,2) CHECK (price_competitiveness_score >= 0 AND price_competitiveness_score <= 1),
  bsr_competitiveness_score DECIMAL(3,2) CHECK (bsr_competitiveness_score >= 0 AND bsr_competitiveness_score <= 1),
  prime_eligibility_score DECIMAL(3,2) CHECK (prime_eligibility_score >= 0 AND prime_eligibility_score <= 1),
  
  -- Content signals
  content_richness_score DECIMAL(3,2) CHECK (content_richness_score >= 0 AND content_richness_score <= 1),
  category_specificity_score DECIMAL(3,2) CHECK (category_specificity_score >= 0 AND category_specificity_score <= 1),
  data_freshness_score DECIMAL(3,2) CHECK (data_freshness_score >= 0 AND data_freshness_score <= 1),
  
  -- Market signals
  market_saturation_score DECIMAL(3,2) CHECK (market_saturation_score >= 0 AND market_saturation_score <= 1),
  brand_recognition_score DECIMAL(3,2) CHECK (brand_recognition_score >= 0 AND brand_recognition_score <= 1),
  
  -- Composite scores
  demand_strength DECIMAL(3,2) CHECK (demand_strength >= 0 AND demand_strength <= 1),
  price_advantage DECIMAL(3,2) CHECK (price_advantage >= 0 AND price_advantage <= 1),
  content_quality DECIMAL(3,2) CHECK (content_quality >= 0 AND content_quality <= 1),
  market_opportunity DECIMAL(3,2) CHECK (market_opportunity >= 0 AND market_opportunity <= 1),
  
  -- Metadata
  feature_confidence DECIMAL(3,2) CHECK (feature_confidence >= 0 AND feature_confidence <= 1),
  extraction_timestamp TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint for one vector per product
  UNIQUE(product_id)
);

-- Add indexes for ai_feature_vectors
CREATE INDEX IF NOT EXISTS idx_ai_feature_vectors_product_id ON ai_feature_vectors(product_id);
CREATE INDEX IF NOT EXISTS idx_ai_feature_vectors_asin ON ai_feature_vectors(asin);
CREATE INDEX IF NOT EXISTS idx_ai_feature_vectors_source ON ai_feature_vectors(source);
CREATE INDEX IF NOT EXISTS idx_ai_feature_vectors_demand_strength ON ai_feature_vectors(demand_strength);
CREATE INDEX IF NOT EXISTS idx_ai_feature_vectors_extraction_timestamp ON ai_feature_vectors(extraction_timestamp);

-- ═══════════════════════════════════════════════════════════════════════════
-- AI ANALYSIS LOG TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_analysis_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  analysis_type TEXT NOT NULL CHECK (analysis_type IN ('initial', 'update', 're_score')),
  previous_score INTEGER,
  new_score INTEGER,
  score_change INTEGER,
  confidence_change DECIMAL(3,2),
  processing_time_ms INTEGER,
  error_message TEXT,
  triggered_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for ai_analysis_log
CREATE INDEX IF NOT EXISTS idx_ai_analysis_log_product_id ON ai_analysis_log(product_id);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_log_analysis_type ON ai_analysis_log(analysis_type);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_log_created_at ON ai_analysis_log(created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable RLS on AI tables
ALTER TABLE ai_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_feature_vectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analysis_log ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Users can view AI scores for their products" ON ai_scores
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage AI scores" ON ai_scores
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view AI feature vectors for their products" ON ai_feature_vectors
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage AI feature vectors" ON ai_feature_vectors
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view AI analysis logs" ON ai_analysis_log
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage AI analysis logs" ON ai_analysis_log
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS FOR UPDATED_AT
-- ═══════════════════════════════════════════════════════════════════════════

-- Create triggers for updated_at on AI tables
CREATE TRIGGER update_ai_scores_updated_at 
  BEFORE UPDATE ON ai_scores 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_feature_vectors_updated_at 
  BEFORE UPDATE ON ai_feature_vectors 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS FOR DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE ai_scores IS 'AI scoring results for products with component breakdown';
COMMENT ON TABLE ai_feature_vectors IS 'Detailed feature vectors used for AI scoring calculations';
COMMENT ON TABLE ai_analysis_log IS 'Audit log of AI analysis changes and processing';

COMMENT ON COLUMN ai_scores.overall_score IS 'Final AI score (0-100) for product ranking';
COMMENT ON COLUMN ai_scores.score_tier IS 'Score classification: A+, A, B, C, D';
COMMENT ON COLUMN ai_scores.feature_confidence IS 'How complete the input data was (0-1)';

COMMENT ON COLUMN ai_feature_vectors.demand_strength IS 'Combined demand signals (0-1)';
COMMENT ON COLUMN ai_feature_vectors.price_advantage IS 'Price competitiveness score (0-1)';
COMMENT ON COLUMN ai_feature_vectors.content_quality IS 'Content and presentation quality (0-1)';
COMMENT ON COLUMN ai_feature_vectors.market_opportunity IS 'Market position and potential (0-1)';

COMMENT ON COLUMN ai_analysis_log.score_change IS 'Difference between new and previous scores';
COMMENT ON COLUMN ai_analysis_log.processing_time_ms IS 'Time taken to process the analysis';
COMMENT ON COLUMN ai_analysis_log.triggered_by IS 'What triggered the analysis: system, user, cron, etc.';
