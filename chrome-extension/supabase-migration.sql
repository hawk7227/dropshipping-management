-- Social Intelligence Scanner — Database Migration
-- Run this in your Supabase SQL Editor

-- ============================================================
-- scraped_content — friend posts scraped from feeds
-- ============================================================
CREATE TABLE IF NOT EXISTS scraped_content (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  platform text NOT NULL,                        -- instagram, facebook, tiktok, twitter
  source_url text UNIQUE,                        -- post URL (for dedup)
  source_username text,                          -- who posted it
  content_type text DEFAULT 'unknown',           -- image, video, carousel, text, reel, thread
  caption text,                                  -- post text/caption
  hashtags text[] DEFAULT '{}',                  -- extracted hashtags
  hook_text text,                                -- first line of caption (hook)
  metrics jsonb DEFAULT '{}',                    -- { likes, comments, shares, saves, views }
  posted_at timestamptz,                         -- when the original was posted
  scraped_at timestamptz DEFAULT now(),          -- when we scraped it
  engagement_rate decimal DEFAULT 0,             -- calculated engagement %
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_scraped_platform ON scraped_content(platform);
CREATE INDEX IF NOT EXISTS idx_scraped_username ON scraped_content(source_username);
CREATE INDEX IF NOT EXISTS idx_scraped_at ON scraped_content(scraped_at DESC);

-- ============================================================
-- scroll_sessions — log of each AI scroll scan session
-- ============================================================
CREATE TABLE IF NOT EXISTS scroll_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  total_scanned int DEFAULT 0,
  friend_posts int DEFAULT 0,
  ads_skipped int DEFAULT 0,
  suggestions_skipped int DEFAULT 0,
  scanned_at timestamptz DEFAULT now()
);

-- ============================================================
-- friend_clusters — auto-detected interest groups
-- ============================================================
CREATE TABLE IF NOT EXISTS friend_clusters (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  icon text DEFAULT '👥',
  members int DEFAULT 0,
  interests text[] DEFAULT '{}',
  peak_hours text,
  share_triggers text[] DEFAULT '{}',
  avoid_topics text[] DEFAULT '{}',
  best_tone text DEFAULT 'discovery',
  best_format text DEFAULT 'reel',
  platform_strength text DEFAULT 'instagram',
  engagement_rate decimal DEFAULT 0,
  last_targeted timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- RLS Policies (if using Supabase auth)
-- ============================================================
-- ALTER TABLE scraped_content ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE scroll_sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE friend_clusters ENABLE ROW LEVEL SECURITY;

-- For now, allow all operations (single-user app)
-- CREATE POLICY "Allow all" ON scraped_content FOR ALL USING (true);
-- CREATE POLICY "Allow all" ON scroll_sessions FOR ALL USING (true);
-- CREATE POLICY "Allow all" ON friend_clusters FOR ALL USING (true);
