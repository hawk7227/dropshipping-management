-- Database migrations for Sales Channels module
-- File: database-migrations/channels-tables.sql

-- =====================
-- CHANNEL CONFIGURATION
-- =====================
CREATE TABLE IF NOT EXISTS channel_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL UNIQUE,
  is_enabled BOOLEAN DEFAULT false,
  credentials JSONB DEFAULT NULL,
  settings JSONB DEFAULT NULL,
  last_sync_at TIMESTAMPTZ DEFAULT NULL,
  sync_status TEXT DEFAULT 'idle',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- PLATFORM LISTINGS
-- =====================
CREATE TABLE IF NOT EXISTS platform_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_listing_id TEXT NOT NULL,
  platform_url TEXT DEFAULT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('active', 'paused', 'error', 'pending')),
  synced_at TIMESTAMPTZ DEFAULT NULL,
  sync_error TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (product_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_platform_listings_product_id ON platform_listings(product_id);
CREATE INDEX IF NOT EXISTS idx_platform_listings_platform ON platform_listings(platform);
CREATE INDEX IF NOT EXISTS idx_platform_listings_status ON platform_listings(status);

-- =====================
-- UNIFIED ORDERS
-- =====================
CREATE TABLE IF NOT EXISTS unified_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL,
  channel_order_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  customer_name TEXT DEFAULT NULL,
  customer_email TEXT DEFAULT NULL,
  customer_phone TEXT DEFAULT NULL,
  shipping_name TEXT DEFAULT NULL,
  shipping_address1 TEXT DEFAULT NULL,
  shipping_address2 TEXT DEFAULT NULL,
  shipping_city TEXT DEFAULT NULL,
  shipping_state TEXT DEFAULT NULL,
  shipping_postal TEXT DEFAULT NULL,
  shipping_country TEXT DEFAULT NULL,
  subtotal DECIMAL(10,2) DEFAULT NULL,
  shipping_cost DECIMAL(10,2) DEFAULT NULL,
  tax DECIMAL(10,2) DEFAULT NULL,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  items JSONB DEFAULT NULL,
  tracking_number TEXT DEFAULT NULL,
  tracking_carrier TEXT DEFAULT NULL,
  fulfilled_at TIMESTAMPTZ DEFAULT NULL,
  channel_created_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (channel, channel_order_id)
);

CREATE INDEX IF NOT EXISTS idx_unified_orders_channel ON unified_orders(channel);
CREATE INDEX IF NOT EXISTS idx_unified_orders_status ON unified_orders(status);
CREATE INDEX IF NOT EXISTS idx_unified_orders_created ON unified_orders(channel_created_at);

-- =====================
-- SHOPIFY QUEUE
-- =====================
CREATE TABLE IF NOT EXISTS shopify_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_ids TEXT[] NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  processed INTEGER DEFAULT 0,
  created INTEGER DEFAULT 0,
  updated INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  error_log JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopify_queue_status ON shopify_queue(status);

-- =====================
-- CHANNEL PERFORMANCE
-- =====================
CREATE TABLE IF NOT EXISTS channel_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  channel TEXT NOT NULL,
  orders INTEGER DEFAULT 0,
  revenue DECIMAL(12,2) DEFAULT 0,
  items_sold INTEGER DEFAULT 0,
  avg_order_value DECIMAL(10,2) DEFAULT 0,
  returns INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (date, channel)
);

CREATE INDEX IF NOT EXISTS idx_channel_performance_date ON channel_performance(date);
CREATE INDEX IF NOT EXISTS idx_channel_performance_channel ON channel_performance(channel);
