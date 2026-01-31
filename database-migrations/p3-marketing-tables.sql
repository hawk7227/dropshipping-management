-- P3 Marketing & External Channels Tables Migration
-- Creates tables for AI marketing, social posting, Google Shopping, and Zapier integrations

-- ═══════════════════════════════════════════════════════════════════════════
-- SOCIAL POSTS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'facebook', 'twitter', 'tiktok')),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  image_url TEXT,
  hashtags TEXT[] DEFAULT '{}',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('draft', 'scheduled', 'published', 'failed')) DEFAULT 'draft',
  engagement JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for social_posts
CREATE INDEX IF NOT EXISTS idx_social_posts_platform ON social_posts(platform);
CREATE INDEX IF NOT EXISTS idx_social_posts_product_id ON social_posts(product_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status);
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled_at ON social_posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_social_posts_published_at ON social_posts(published_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- MARKETING FEEDS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS marketing_feeds (
  id TEXT PRIMARY KEY,
  feed_type TEXT NOT NULL CHECK (feed_type IN ('google_shopping', 'facebook_catalog', 'tiktok_catalog')),
  feed_xml TEXT,
  feed_url TEXT,
  products_count INTEGER DEFAULT 0,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint for feed type
  UNIQUE(feed_type)
);

-- Add indexes for marketing_feeds
CREATE INDEX IF NOT EXISTS idx_marketing_feeds_feed_type ON marketing_feeds(feed_type);
CREATE INDEX IF NOT EXISTS idx_marketing_feeds_generated_at ON marketing_feeds(generated_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- ZAPIER PAYLOADS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS zapier_payloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_type TEXT NOT NULL CHECK (integration_type IN ('email', 'webhook', 'slack', 'discord')),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')) DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for zapier_payloads
CREATE INDEX IF NOT EXISTS idx_zapier_payloads_integration_type ON zapier_payloads(integration_type);
CREATE INDEX IF NOT EXISTS idx_zapier_payloads_product_id ON zapier_payloads(product_id);
CREATE INDEX IF NOT EXISTS idx_zapier_payloads_status ON zapier_payloads(status);
CREATE INDEX IF NOT EXISTS idx_zapier_payloads_sent_at ON zapier_payloads(sent_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- PUBLICATION TRACKING TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS publication_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type TEXT NOT NULL CHECK (channel_type IN ('social', 'google_shopping', 'zapier', 'email', 'webhook')),
  channel_name TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  content_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'published', 'failed', 'retrying')) DEFAULT 'pending',
  published_at TIMESTAMPTZ,
  error_message TEXT,
  error_code TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  external_id TEXT,
  external_url TEXT,
  engagement JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for publication_tracking
CREATE INDEX IF NOT EXISTS idx_publication_tracking_channel_type ON publication_tracking(channel_type);
CREATE INDEX IF NOT EXISTS idx_publication_tracking_channel_name ON publication_tracking(channel_name);
CREATE INDEX IF NOT EXISTS idx_publication_tracking_product_id ON publication_tracking(product_id);
CREATE INDEX IF NOT EXISTS idx_publication_tracking_status ON publication_tracking(status);
CREATE INDEX IF NOT EXISTS idx_publication_tracking_next_retry_at ON publication_tracking(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_publication_tracking_published_at ON publication_tracking(published_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- MARKETING CACHE TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS marketing_cache (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  refreshed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint for cache ID
  UNIQUE(id)
);

-- Add indexes for marketing_cache
CREATE INDEX IF NOT EXISTS idx_marketing_cache_refreshed_at ON marketing_cache(refreshed_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- MARKETING SCHEDULES TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS marketing_schedules (
  id TEXT PRIMARY KEY,
  feed_type TEXT NOT NULL,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('once', 'recurring')),
  interval_hours INTEGER,
  next_run TIMESTAMPTZ,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint for schedule ID
  UNIQUE(id)
);

-- Add indexes for marketing_schedules
CREATE INDEX IF NOT EXISTS idx_marketing_schedules_feed_type ON marketing_schedules(feed_type);
CREATE INDEX IF NOT EXISTS idx_marketing_schedules_next_run ON marketing_schedules(next_run);
CREATE INDEX IF NOT EXISTS idx_marketing_schedules_active ON marketing_schedules(active);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable RLS on marketing tables
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE zapier_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_schedules ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Users can view social posts" ON social_posts
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage social posts" ON social_posts
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view marketing feeds" ON marketing_feeds
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage marketing feeds" ON marketing_feeds
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view Zapier payloads" ON zapier_payloads
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage Zapier payloads" ON zapier_payloads
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view publication tracking" ON publication_tracking
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage publication tracking" ON publication_tracking
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view marketing cache" ON marketing_cache
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage marketing cache" ON marketing_cache
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view marketing schedules" ON marketing_schedules
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage marketing schedules" ON marketing_schedules
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS FOR UPDATED_AT
-- ═══════════════════════════════════════════════════════════════════════════

-- Create triggers for updated_at on marketing tables
CREATE TRIGGER update_social_posts_updated_at 
  BEFORE UPDATE ON social_posts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_marketing_feeds_updated_at 
  BEFORE UPDATE ON marketing_feeds 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_zapier_payloads_updated_at 
  BEFORE UPDATE ON zapier_payloads 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_publication_tracking_updated_at 
  BEFORE UPDATE ON publication_tracking 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_marketing_cache_updated_at 
  BEFORE UPDATE ON marketing_cache 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_marketing_schedules_updated_at 
  BEFORE UPDATE ON marketing_schedules 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS FOR DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE social_posts IS 'Social media posts with AI-selected products and engagement tracking';
COMMENT ON TABLE marketing_feeds IS 'Generated marketing feeds for external platforms (Google Shopping, etc.)';
COMMENT ON TABLE zapier_payloads IS 'Zapier integration payloads with delivery tracking and retry logic';
COMMENT ON TABLE publication_tracking IS 'Comprehensive publication tracking across all marketing channels';
COMMENT ON TABLE marketing_cache IS 'Cached marketing data for performance optimization';
COMMENT ON TABLE marketing_schedules IS 'Marketing automation schedules and next run times';

COMMENT ON COLUMN social_posts.platform IS 'Social media platform: instagram, facebook, twitter, tiktok';
COMMENT ON COLUMN social_posts.engagement IS 'Engagement metrics: likes, comments, shares, views';
COMMENT ON COLUMN publication_tracking.channel_type IS 'Channel category: social, google_shopping, zapier, email, webhook';
COMMENT ON COLUMN publication_tracking.retry_count IS 'Number of retry attempts for failed publications';
COMMENT ON COLUMN publication_tracking.engagement IS 'Performance metrics for published content';
COMMENT ON COLUMN zapier_payloads.integration_type IS 'Zapier integration: email, webhook, slack, discord';
COMMENT ON COLUMN marketing_feeds.feed_type IS 'Feed type: google_shopping, facebook_catalog, tiktok_catalog';

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEWS FOR COMMON QUERIES
-- ═══════════════════════════════════════════════════════════════════════════

-- View for marketing performance summary
CREATE OR REPLACE VIEW marketing_performance_summary AS
SELECT 
  channel_type,
  channel_name,
  COUNT(*) as total_publications,
  COUNT(*) FILTER (WHERE status = 'published') as successful_publications,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_publications,
  ROUND(
    (COUNT(*) FILTER (WHERE status = 'published')::DECIMAL / COUNT(*)) * 100, 2
  ) as success_rate,
  AVG(retry_count) as avg_retry_count,
  MAX(published_at) as last_published_at
FROM publication_tracking
GROUP BY channel_type, channel_name;

-- View for social media performance
CREATE OR REPLACE VIEW social_media_performance AS
SELECT 
  sp.platform,
  sp.status,
  COUNT(*) as post_count,
  COUNT(*) FILTER (WHERE sp.published_at IS NOT NULL) as published_posts,
  SUM((sp.engagement->>'likes')::INTEGER) as total_likes,
  SUM((sp.engagement->>'comments')::INTEGER) as total_comments,
  SUM((sp.engagement->>'shares')::INTEGER) as total_shares,
  AVG(p.ai_score) as avg_ai_score,
  MAX(sp.published_at) as last_posted_at
FROM social_posts sp
JOIN products p ON sp.product_id = p.id
JOIN ai_scores ais ON ais.product_id = p.id -- Changed 'as' to 'ais'
GROUP BY sp.platform, sp.status;

-- View for Zapier integration performance
CREATE OR REPLACE VIEW zapier_integration_performance AS
SELECT 
  zp.integration_type,
  zp.status,
  COUNT(*) as payload_count,
  COUNT(*) FILTER (WHERE zp.sent_at IS NOT NULL) as sent_payloads,
  AVG(zp.retry_count) as avg_retry_count,
  MAX(zp.sent_at) as last_sent_at
FROM zapier_payloads zp
GROUP BY zp.integration_type, zp.status;
