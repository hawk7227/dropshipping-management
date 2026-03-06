-- ═══════════════════════════════════════════════════════════
-- SHIFT LOG — Auto-populated system activity log
-- No manual entries needed. Postgres triggers write events
-- from product changes, AI optimizations, and cron runs.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS shift_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'system_event',
  -- 'product_change' | 'ai_optimization' | 'cron_run' | 'feed_event' | 'system_event' | 'task'
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT DEFAULT 'info',
  -- 'info' | 'success' | 'warning' | 'error'
  source TEXT NOT NULL DEFAULT 'system',
  -- 'system' | 'ai-cron' | 'user' | 'matrixify' | 'shopify-sync' | 'price-sync'
  meta JSONB DEFAULT '{}',
  -- Flexible payload: { products_affected: 142, field: 'title', before: '...', after: '...' }
  created_at TIMESTAMPTZ DEFAULT now(),
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  feedback TEXT
);

CREATE INDEX IF NOT EXISTS idx_shift_log_created ON shift_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shift_log_category ON shift_log(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shift_log_ack ON shift_log(acknowledged_by, acknowledged_at);

-- ═══════════════════════════════════════════════════════════
-- TRIGGER: Auto-log product inserts/updates
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION log_product_changes()
RETURNS TRIGGER AS $$
DECLARE
  change_count INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Batch insert detection: count rows inserted in the same second
    SELECT COUNT(*) INTO change_count
    FROM products
    WHERE created_at >= NOW() - INTERVAL '2 seconds';

    -- Only log if this is the first row of a batch (avoids 7648 log entries)
    IF change_count <= 1 THEN
      INSERT INTO shift_log (category, title, description, source, severity, meta)
      VALUES (
        'product_change',
        'Product created: ' || LEFT(COALESCE(NEW.title, NEW.id::text), 60),
        'New product added to catalog',
        'system',
        'info',
        jsonb_build_object('product_id', NEW.id, 'title', LEFT(COALESCE(NEW.title, ''), 100))
      );
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Log feed_status changes
    IF OLD.feed_status IS DISTINCT FROM NEW.feed_status THEN
      INSERT INTO shift_log (category, title, description, source, severity, meta)
      VALUES (
        'feed_event',
        'Feed status: ' || COALESCE(OLD.feed_status, 'null') || ' → ' || COALESCE(NEW.feed_status, 'null'),
        LEFT(COALESCE(NEW.title, ''), 80),
        'system',
        CASE WHEN NEW.feed_status = 'ready' THEN 'success' ELSE 'warning' END,
        jsonb_build_object('product_id', NEW.id, 'old_status', OLD.feed_status, 'new_status', NEW.feed_status)
      );
    END IF;

    -- Log significant field changes (title, description, google_product_category)
    IF OLD.title IS DISTINCT FROM NEW.title AND NEW.title IS NOT NULL THEN
      INSERT INTO shift_log (category, title, description, source, severity, meta)
      VALUES (
        'product_change',
        'Title updated: ' || LEFT(COALESCE(NEW.title, ''), 60),
        'From: ' || LEFT(COALESCE(OLD.title, ''), 80),
        'system',
        'info',
        jsonb_build_object('product_id', NEW.id, 'field', 'title')
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if it doesn't exist
DROP TRIGGER IF EXISTS trg_product_shift_log ON products;
CREATE TRIGGER trg_product_shift_log
  AFTER INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION log_product_changes();

-- ═══════════════════════════════════════════════════════════
-- TRIGGER: Auto-log AI changelog entries
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION log_ai_changes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO shift_log (category, title, description, source, severity, meta)
  VALUES (
    'ai_optimization',
    'AI optimized ' || NEW.field_changed || ': ' || LEFT(COALESCE(NEW.new_value, ''), 50),
    COALESCE(NEW.reasoning, ''),
    COALESCE(NEW.ai_model, 'ai-cron'),
    'success',
    jsonb_build_object(
      'product_id', NEW.product_id,
      'field', NEW.field_changed,
      'optimization_type', NEW.optimization_type
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_changelog_shift_log ON product_ai_changelog;
CREATE TRIGGER trg_ai_changelog_shift_log
  AFTER INSERT ON product_ai_changelog
  FOR EACH ROW EXECUTE FUNCTION log_ai_changes();

-- ═══════════════════════════════════════════════════════════
-- Helper: Summarize activity for a time range
-- Used by the Mission Status Hero to generate the handoff
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_shift_summary(since_ts TIMESTAMPTZ DEFAULT NOW() - INTERVAL '24 hours')
RETURNS TABLE (
  category TEXT,
  event_count BIGINT,
  latest_title TEXT,
  latest_at TIMESTAMPTZ,
  severity TEXT
) AS $$
  SELECT
    sl.category,
    COUNT(*) as event_count,
    (ARRAY_AGG(sl.title ORDER BY sl.created_at DESC))[1] as latest_title,
    MAX(sl.created_at) as latest_at,
    (ARRAY_AGG(sl.severity ORDER BY sl.created_at DESC))[1] as severity
  FROM shift_log sl
  WHERE sl.created_at >= since_ts
  GROUP BY sl.category
  ORDER BY latest_at DESC;
$$ LANGUAGE sql;
