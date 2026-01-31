-- P1 PRICE SNAPSHOTS TABLE MIGRATION
-- Creates the missing price_snapshots table with proper relationships

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

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER TO MAINTAIN LATEST SNAPSHOT
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to update latest flag when new snapshot is created
CREATE OR REPLACE FUNCTION update_latest_price_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set all previous snapshots for this product to not latest
  UPDATE price_snapshots 
  SET is_latest = false 
  WHERE product_id = NEW.product_id AND id != NEW.id;
  
  -- Ensure the new snapshot is marked as latest
  NEW.is_latest = true;
  
  RETURN NEW;
END;
$$;

-- Trigger to automatically update latest flag
CREATE TRIGGER trigger_update_latest_price_snapshot
BEFORE INSERT ON price_snapshots
FOR EACH ROW
EXECUTE FUNCTION update_latest_price_snapshot();

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════════

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
-- VIEWS FOR COMMON QUERIES
-- ═══════════════════════════════════════════════════════════════════════════

-- Latest price snapshots view
CREATE OR REPLACE VIEW latest_price_snapshots AS
SELECT 
  ps.*,
  p.title,
  p.asin,
  p.status as product_status
FROM price_snapshots ps
JOIN products p ON ps.product_id = p.id
WHERE ps.is_latest = true;



-- Price intelligence view
CREATE OR REPLACE VIEW price_intelligence AS
SELECT 
  p.id as product_id,
  p.title,
  p.asin,
  ps.current_price,
  ps.cost_price,
  ps.competitor_price,
  ps.availability,
  ps.rating,
  ps.review_count,
  ps.fetched_at,
  CASE 
    WHEN ps.cost_price IS NOT NULL AND ps.current_price IS NOT NULL 
    THEN ((ps.current_price - ps.cost_price) / ps.current_price) * 100
    ELSE NULL 
  END as profit_margin,
  CASE 
    WHEN ps.competitor_price IS NOT NULL AND ps.current_price IS NOT NULL 
    THEN ((ps.competitor_price - ps.current_price) / ps.competitor_price) * 100
    ELSE NULL 
  END as price_advantage,
  CASE 
    WHEN ps.fetched_at < NOW() - INTERVAL '7 days' THEN 'very_stale'
    WHEN ps.fetched_at < NOW() - INTERVAL '3 days' THEN 'stale'
    ELSE 'fresh'
  END as price_freshness
FROM products p
JOIN price_snapshots ps ON p.id = ps.product_id
WHERE ps.is_latest = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS FOR PRICE ANALYSIS
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to get price statistics
CREATE OR REPLACE FUNCTION get_price_statistics(days INTEGER DEFAULT 30)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_products', COUNT(DISTINCT ps.product_id),
    'avg_price', ROUND(AVG(ps.current_price), 2),
    'avg_competitor_price', ROUND(AVG(ps.competitor_price), 2),
    'avg_profit_margin', ROUND(AVG(
      CASE 
        WHEN ps.cost_price IS NOT NULL AND ps.current_price IS NOT NULL 
        THEN ((ps.current_price - ps.cost_price) / ps.current_price) * 100
        ELSE NULL 
      END
    ), 2),
    'in_stock_count', COUNT(*) FILTER (WHERE ps.availability = 'in_stock'),
    'out_of_stock_count', COUNT(*) FILTER (WHERE ps.availability = 'out_of_stock'),
    'avg_rating', ROUND(AVG(ps.rating), 2),
    'stale_count', COUNT(*) FILTER (WHERE ps.fetched_at < NOW() - INTERVAL '3 days'),
    'very_stale_count', COUNT(*) FILTER (WHERE ps.fetched_at < NOW() - INTERVAL '7 days')
  ) as result INTO result
  FROM price_snapshots ps
  WHERE ps.is_latest = true
    AND ps.fetched_at >= NOW() - INTERVAL '1 day';
  
  RETURN result;
END;
$$;

-- Function to get products with stale prices
CREATE OR REPLACE FUNCTION get_stale_price_products(days INTEGER DEFAULT 3)
RETURNS TABLE (
  product_id UUID,
  title TEXT,
  asin TEXT,
  current_price DECIMAL(10,2),
  days_since_check INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.title,
    p.asin,
    ps.current_price,
    EXTRACT(DAYS FROM NOW() - ps.fetched_at)::INTEGER as days_since_check
  FROM products p
  JOIN price_snapshots ps ON p.id = ps.product_id
  WHERE ps.is_latest = true
    AND ps.fetched_at < NOW() - INTERVAL '1 day' * days
  ORDER BY ps.fetched_at ASC;
END;
$$;

-- Function to update product prices from latest snapshot
CREATE OR REPLACE FUNCTION sync_product_prices_from_snapshots()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE products p
  SET 
    current_price = ps.current_price,
    cost_price = ps.cost_price,
    amazon_price = ps.amazon_price,
    retail_price = ps.retail_price,
    rating = ps.rating,
    review_count = ps.review_count,
    last_price_check = ps.fetched_at,
    updated_at = NOW()
  FROM price_snapshots ps
  WHERE p.id = ps.product_id
    AND ps.is_latest = true
    AND (
      p.current_price IS DISTINCT FROM ps.current_price
      OR p.cost_price IS DISTINCT FROM ps.cost_price
      OR p.rating IS DISTINCT FROM ps.rating
      OR p.review_count IS DISTINCT FROM ps.review_count
    );
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN updated_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- CLEANUP FUNCTIONS
-- ═════════════════════════════════════════════════════════════════════════

-- Function to clean up old price snapshots (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_price_snapshots()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM price_snapshots 
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND is_latest = false;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS FOR DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE price_snapshots IS 'Price and market data snapshots for products with historical tracking';
COMMENT ON COLUMN price_snapshots.current_price IS 'Current selling price of the product';
COMMENT ON COLUMN price_snapshots.cost_price IS 'Cost price of the product';
COMMENT ON COLUMN price_snapshots.competitor_price IS 'Competitor price for comparison';
COMMENT ON COLUMN price_snapshots.availability IS 'Product availability status: in_stock, limited, out_of_stock';
COMMENT ON COLUMN price_snapshots.is_latest IS 'Flag indicating if this is the latest snapshot for the product';
COMMENT ON COLUMN price_snapshots.fetched_at IS 'When this price data was fetched from external sources';

COMMENT ON VIEW latest_price_snapshots IS 'Latest price snapshot for each product';
COMMENT ON VIEW price_intelligence IS 'Price intelligence with calculated metrics and freshness indicators';


COMMENT ON FUNCTION sync_product_prices_from_snapshots() IS 'Syncs product table with latest price snapshot data';
COMMENT ON FUNCTION cleanup_old_price_snapshots() IS 'Cleans up old price snapshots, keeping only latest ones';

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER FOR UPDATED_AT
-- ═══════════════════════════════════════════════════════════════════════════

-- Create trigger for updated_at
CREATE TRIGGER update_price_snapshots_updated_at 
  BEFORE UPDATE ON price_snapshots 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
