-- Add missing product fields to Supabase
-- Run this in your Supabase SQL editor

-- Core product fields
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS handle TEXT,
ADD COLUMN IF NOT EXISTS body_html TEXT,
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'import',
ADD COLUMN IF NOT EXISTS source_product_id TEXT,
ADD COLUMN IF NOT EXISTS source_url TEXT,
ADD COLUMN IF NOT EXISTS shopify_product_id TEXT,
ADD COLUMN IF NOT EXISTS shopify_id TEXT,
ADD COLUMN IF NOT EXISTS shopify_handle TEXT;

-- Pricing fields
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS retail_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS member_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS amazon_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS amazon_display_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS costco_display_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS ebay_display_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS sams_display_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS compare_at_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS competitor_prices JSONB,
ADD COLUMN IF NOT EXISTS profit_amount DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS profit_percent DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS profit_margin DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS profit_status TEXT DEFAULT 'unknown';

-- Product attributes
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS rating DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS review_count INTEGER,
ADD COLUMN IF NOT EXISTS is_prime BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS inventory_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS below_threshold_since TIMESTAMPTZ;

-- Timestamp fields
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_price_check TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS price_synced_at TIMESTAMPTZ;

-- Admin override fields
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS admin_override BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS admin_override_by TEXT,
ADD COLUMN IF NOT EXISTS admin_override_at TIMESTAMPTZ;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_asin ON products(asin);
CREATE INDEX IF NOT EXISTS idx_products_source ON products(source);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_profit_status ON products(profit_status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_last_price_check ON products(last_price_check);

-- Add constraints
ALTER TABLE products 
ADD CONSTRAINT IF NOT EXISTS check_profit_status 
  CHECK (profit_status IN ('profitable', 'below_threshold', 'unknown')),
ADD CONSTRAINT IF NOT EXISTS check_lifecycle_status 
  CHECK (lifecycle_status IN ('active', 'discontinued', 'archived')),
ADD CONSTRAINT IF NOT EXISTS check_source 
  CHECK (source IN ('shopify', 'rainforest', 'import', 'manual'));

-- Add comments for documentation
COMMENT ON COLUMN products.handle IS 'Shopify handle for storefront URLs';
COMMENT ON COLUMN products.body_html IS 'Long-form description in HTML format';
COMMENT ON COLUMN products.source IS 'Source system: shopify, rainforest, import, manual';
COMMENT ON COLUMN products.source_product_id IS 'Upstream source identifier (ASIN for Amazon)';
COMMENT ON COLUMN products.cost_price IS 'Base cost (typically Amazon cost)';
COMMENT ON COLUMN products.retail_price IS 'Your list/retail price';
COMMENT ON COLUMN products.amazon_price IS 'Direct Amazon cost used by price-intelligence views';
COMMENT ON COLUMN products.amazon_display_price IS 'Amazon price shown to customers (randomized)';
COMMENT ON COLUMN products.profit_percent IS 'Profit margin percentage';
COMMENT ON COLUMN products.profit_status IS 'Profit status: profitable, below_threshold, unknown';
COMMENT ON COLUMN products.is_prime IS 'Amazon Prime eligibility';
COMMENT ON COLUMN products.inventory_quantity IS 'Current stock quantity';
COMMENT ON COLUMN products.lifecycle_status IS 'Product lifecycle: active, discontinued, archived';
COMMENT ON COLUMN products.below_threshold_since IS 'When profit fell below threshold';
COMMENT ON COLUMN products.synced_at IS 'Last sync with source system';
COMMENT ON COLUMN products.last_price_check IS 'Last price verification';
COMMENT ON COLUMN products.admin_override IS 'Manual admin override flag';
