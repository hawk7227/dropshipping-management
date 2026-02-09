-- ============================================
-- COMPLETE PLATFORM SCHEMA
-- All 6 Feature Categories
-- ============================================

-- =====================
-- 1. PRICE INTELLIGENCE
-- =====================

-- Competitor prices from Rainforest API
create table if not exists competitor_prices (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id) on delete cascade,
  sku text,
  asin text,
  competitor_name text not null default 'Amazon',
  competitor_price numeric(10,2) not null,
  competitor_url text,
  our_price numeric(10,2),
  member_price numeric(10,2),
  price_difference numeric(10,2),
  price_difference_pct numeric(5,2),
  is_prime boolean default false,
  availability text,
  fetched_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(product_id, competitor_name)
);

create index idx_competitor_prices_product on competitor_prices(product_id);
create index idx_competitor_prices_asin on competitor_prices(asin);
create index idx_competitor_prices_fetched on competitor_prices(fetched_at);

-- Price history for trending
create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  source text not null,
  price numeric(10,2) not null,
  recorded_at timestamptz default now()
);

create index idx_price_history_product on price_history(product_id, recorded_at);

-- Price sync jobs
create table if not exists price_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending',
  total_products int default 0,
  processed int default 0,
  errors int default 0,
  started_at timestamptz,
  completed_at timestamptz,
  error_log jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger price_sync_jobs_updated_at before update on price_sync_jobs for each row execute function update_updated_at();

-- Margin alerts
create table if not exists margin_alerts (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  alert_type text not null,
  alert_code text not null,
  message text not null,
  recommendation text,
  is_resolved boolean default false,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

create index idx_margin_alerts_product on margin_alerts(product_id);
create index idx_margin_alerts_unresolved on margin_alerts(is_resolved) where is_resolved = false;

-- Margin rules for automatic pricing
create table if not exists margin_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  min_margin numeric(5,2) not null,
  max_margin numeric(5,2),
  target_margin numeric(5,2),
  category text,
  vendor text,
  product_type text,
  sku_pattern text,
  priority int default 0,
  is_active boolean default true,
  apply_to_members boolean default false,
  action text not null default 'alert', -- 'alert' or 'auto-adjust'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_margin_rules_active on margin_rules(is_active);
create index idx_margin_rules_category on margin_rules(category);
create index idx_margin_rules_priority on margin_rules(priority desc);

-- =====================
-- 2. PRODUCT MANAGEMENT
-- =====================

-- Products cache (synced from Shopify)
create table if not exists products (
  id text primary key,
  title text not null,
  handle text not null,
  vendor text,
  product_type text,
  brand text,
  status text not null default 'active',
  tags text[],
  category text,
  main_image text,
  current_price numeric(10,2),
  compare_at_price numeric(10,2),
  body_html text,
  images jsonb,
  options jsonb,
  asin text,
  competitor_link text,
  created_at timestamptz,
  updated_at timestamptz,
  synced_at timestamptz default now()
);

create index idx_products_handle on products(handle);
create index idx_products_status on products(status);
create index idx_products_asin on products(asin);

-- Variants
create table if not exists variants (
  id text primary key,
  product_id text not null references products(id) on delete cascade,
  title text not null,
  sku text,
  barcode text,
  price numeric(10,2) not null,
  compare_at_price numeric(10,2),
  cost numeric(10,2),
  inventory_item_id text,
  inventory_quantity int default 0,
  weight numeric(10,2),
  weight_unit text,
  requires_shipping boolean default true,
  taxable boolean default true,
  created_at timestamptz,
  updated_at timestamptz
);

create index idx_variants_product on variants(product_id);
create index idx_variants_sku on variants(sku);

-- Product costs
create table if not exists product_costs (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id) on delete cascade,
  variant_id text references variants(id) on delete cascade,
  supplier_cost numeric(10,2) not null,
  shipping_inbound numeric(10,2) default 0,
  packaging_cost numeric(10,2) default 0.50,
  labor_cost numeric(10,2) default 0.25,
  other_costs numeric(10,2) default 0,
  effective_from timestamptz default now(),
  effective_to timestamptz,
  created_at timestamptz default now()
);

-- Inventory locations
create table if not exists inventory_locations (
  id text primary key,
  name text not null,
  address text,
  city text,
  state text,
  country text,
  is_active boolean default true,
  synced_at timestamptz default now()
);

-- Product import queue
create table if not exists product_imports (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid,
  source text not null,
  status text not null default 'pending',
  product_data jsonb not null,
  result jsonb,
  error_message text,
  created_at timestamptz default now(),
  processed_at timestamptz
);

-- ==================================================
-- PRODUCT DISCOVERY: demand, runs and rejection log
-- ==================================================

-- Product demand metrics (one row per product)
create table if not exists product_demand (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id) on delete cascade,
  asin text,
  demand_tier text not null default 'low', -- e.g. high/medium/low
  demand_score numeric(6,2) default 0, -- normalized demand score
  volatility numeric(6,4) default 0, -- price volatility measure
  current_bsr int,
  last_evaluated_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(product_id)
);

create index if not exists idx_product_demand_product on product_demand(product_id);
create index if not exists idx_product_demand_tier on product_demand(demand_tier);

-- Discovery runs metadata
create table if not exists discovery_runs (
  id uuid primary key default gen_random_uuid(),
  run_name text,
  run_date timestamptz default now(),
  source text,
  products_found int default 0,
  products_imported int default 0,
  status text not null default 'pending', -- pending, running, completed, failed
  error_log jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_discovery_runs_date on discovery_runs(run_date desc);

-- Rejection log for discovery/import pipeline
create table if not exists rejection_log (
  id uuid primary key default gen_random_uuid(),
  product_id text references products(id) on delete set null,
  asin text,
  run_id uuid references discovery_runs(id) on delete set null,
  reason text not null,
  details jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_rejection_log_product on rejection_log(product_id);
create index if not exists idx_rejection_log_run on rejection_log(run_id);

-- =====================
-- 3. SOCIAL & MARKETING
-- =====================

-- Social media posts
create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  content text not null,
  media_urls text[],
  hashtags text[],
  scheduled_at timestamptz,
  published_at timestamptz,
  status text not null default 'draft',
  platform_post_id text,
  engagement jsonb,
  product_id text,
  campaign_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_social_posts_platform on social_posts(platform);
create index idx_social_posts_status on social_posts(status);

-- Social media accounts
create table if not exists social_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  account_id text not null,
  account_name text not null,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  profile_data jsonb,
  is_active boolean default true,
  connected_at timestamptz default now(),
  unique(platform, account_id)
);

-- Marketing campaigns
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  type text not null,
  status text not null default 'draft',
  start_date timestamptz,
  end_date timestamptz,
  budget numeric(10,2),
  spent numeric(10,2) default 0,
  target_audience jsonb,
  metrics jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Email campaigns
create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id),
  subject text not null,
  preheader text,
  body_html text not null,
  body_text text,
  from_name text,
  from_email text,
  status text default 'draft',
  sent_at timestamptz,
  stats jsonb,
  created_at timestamptz default now()
);

-- SMS campaigns
create table if not exists sms_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id),
  message text not null,
  media_url text,
  status text default 'draft',
  sent_at timestamptz,
  stats jsonb,
  created_at timestamptz default now()
);

-- Content calendar
create table if not exists content_calendar (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  platform text not null,
  content_type text not null,
  title text not null,
  description text,
  status text default 'planned',
  post_id uuid references social_posts(id),
  created_at timestamptz default now()
);

-- =====================
-- 4. MULTI-CHANNEL
-- =====================

-- Channel configurations
create table if not exists channel_configs (
  id uuid primary key default gen_random_uuid(),
  channel text not null unique,
  is_enabled boolean default false,
  credentials jsonb,
  settings jsonb,
  last_sync_at timestamptz,
  sync_status text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Channel listings
create table if not exists channel_listings (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  variant_id text,
  channel text not null,
  channel_listing_id text not null,
  channel_url text,
  status text not null default 'active',
  price numeric(10,2) not null,
  quantity int default 0,
  last_synced_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(channel, channel_listing_id)
);

-- Unified orders
create table if not exists unified_orders (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  channel_order_id text not null,
  status text not null default 'pending',
  customer_name text,
  customer_email text,
  customer_phone text,
  shipping_name text,
  shipping_address1 text,
  shipping_address2 text,
  shipping_city text,
  shipping_state text,
  shipping_postal text,
  shipping_country text,
  subtotal numeric(10,2),
  shipping_cost numeric(10,2),
  tax numeric(10,2),
  total numeric(10,2) not null,
  items jsonb not null,
  tracking_number text,
  tracking_carrier text,
  fulfilled_at timestamptz,
  channel_created_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(channel, channel_order_id)
);

-- Order routing rules
create table if not exists order_routing_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  priority int default 0,
  conditions jsonb not null,
  action text not null,
  action_params jsonb,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- =====================
-- 5. AI ENGINES
-- =====================

-- AI generated content
create table if not exists ai_content (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  input_data jsonb not null,
  output_text text not null,
  model text not null,
  tokens_used int,
  quality_score numeric(3,2),
  is_approved boolean,
  used_for text,
  created_at timestamptz default now()
);

-- SEO metadata
create table if not exists seo_metadata (
  id uuid primary key default gen_random_uuid(),
  product_id text,
  page_url text,
  meta_title text,
  meta_description text,
  keywords text[],
  og_title text,
  og_description text,
  og_image text,
  schema_markup jsonb,
  seo_score int,
  recommendations jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trend data
create table if not exists trend_data (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  category text,
  search_volume int,
  trend_score numeric(5,2),
  competition_level text,
  related_keywords text[],
  source text,
  recorded_at timestamptz default now()
);

-- Image processing queue
create table if not exists image_queue (
  id uuid primary key default gen_random_uuid(),
  product_id text,
  original_url text not null,
  processed_url text,
  processing_type text not null,
  status text default 'pending',
  settings jsonb,
  error_message text,
  created_at timestamptz default now(),
  processed_at timestamptz
);

-- =====================
-- 6. ANALYTICS
-- =====================

-- Daily metrics
create table if not exists daily_metrics (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  channel text,
  orders_count int default 0,
  revenue numeric(12,2) default 0,
  items_sold int default 0,
  new_customers int default 0,
  returning_customers int default 0,
  avg_order_value numeric(10,2),
  gross_margin numeric(5,2),
  page_views int default 0,
  unique_visitors int default 0,
  conversion_rate numeric(5,4),
  created_at timestamptz default now(),
  unique(date, channel)
);

-- Member metrics
create table if not exists member_metrics (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  total_members int default 0,
  new_members int default 0,
  churned_members int default 0,
  monthly_members int default 0,
  annual_members int default 0,
  mrr numeric(12,2) default 0,
  arr numeric(12,2) default 0,
  avg_member_ltv numeric(10,2),
  member_orders int default 0,
  member_revenue numeric(12,2) default 0,
  created_at timestamptz default now()
);

-- Product performance
create table if not exists product_performance (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  period_start date not null,
  period_end date not null,
  views int default 0,
  add_to_carts int default 0,
  purchases int default 0,
  revenue numeric(12,2) default 0,
  units_sold int default 0,
  return_rate numeric(5,4),
  avg_rating numeric(3,2),
  review_count int default 0,
  created_at timestamptz default now()
);

-- Dashboard widgets
create table if not exists dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  widget_type text not null,
  title text not null,
  position int not null,
  size text default 'medium',
  config jsonb,
  is_visible boolean default true,
  created_at timestamptz default now()
);

-- Update timestamp trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_competitor_prices_updated_at before update on competitor_prices for each row execute function update_updated_at();
create trigger update_social_posts_updated_at before update on social_posts for each row execute function update_updated_at();
create trigger update_campaigns_updated_at before update on campaigns for each row execute function update_updated_at();
create trigger update_channel_configs_updated_at before update on channel_configs for each row execute function update_updated_at();
create trigger update_unified_orders_updated_at before update on unified_orders for each row execute function update_updated_at();
create trigger update_seo_metadata_updated_at before update on seo_metadata for each row execute function update_updated_at();

-- Enable RLS
alter table competitor_prices enable row level security;
alter table products enable row level security;
alter table variants enable row level security;
alter table social_posts enable row level security;
alter table unified_orders enable row level security;
alter table daily_metrics enable row level security;

-- Service role bypass policies
create policy "service_access" on competitor_prices for all using (true);
create policy "service_access" on products for all using (true);
create policy "service_access" on variants for all using (true);
create policy "service_access" on social_posts for all using (true);
create policy "service_access" on unified_orders for all using (true);
create policy "service_access" on daily_metrics for all using (true);

-- =====================================
-- MEMBERSHIP SYSTEM TABLES
-- =====================================
-- ============================================================================
-- MEMBERSHIP SYSTEM SCHEMA
-- Database schema for memberships, orders, and related tables
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- MEMBERSHIPS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    
    -- Stripe identifiers
    stripe_customer_id TEXT NOT NULL,
    stripe_subscription_id TEXT NOT NULL UNIQUE,
    
    -- Status
    status TEXT NOT NULL CHECK (status IN (
        'active',
        'trialing',
        'past_due',
        'canceled',
        'unpaid',
        'incomplete',
        'incomplete_expired'
    )),
    
    -- Plan
    tier TEXT NOT NULL CHECK (tier IN ('monthly', 'annual')),
    
    -- Billing period
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    
    -- Cancellation
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_email ON memberships(email);
CREATE INDEX IF NOT EXISTS idx_memberships_stripe_customer_id ON memberships(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_memberships_stripe_subscription_id ON memberships(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships(status);

-- ============================================================================
-- ORDERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    
    -- Status
    status TEXT NOT NULL CHECK (status IN (
        'pending',
        'confirmed',
        'processing',
        'shipped',
        'delivered',
        'canceled',
        'refunded'
    )) DEFAULT 'pending',
    
    -- Pricing (cents)
    subtotal INTEGER NOT NULL,
    member_discount INTEGER DEFAULT 0,
    shipping INTEGER DEFAULT 0,
    tax INTEGER DEFAULT 0,
    total INTEGER NOT NULL,
    
    -- Order type
    is_member_order BOOLEAN DEFAULT FALSE,
    
    -- Shipping
    shipping_address JSONB,
    
    -- Items
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Stripe
    stripe_session_id TEXT,
    stripe_payment_intent_id TEXT,
    
    -- Fulfillment
    tracking_number TEXT,
    tracking_url TEXT,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    
    -- Notes
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
-- done till here 
-- ============================================================================
-- PRODUCTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    price INTEGER NOT NULL,
    compare_at_price INTEGER,
    sku TEXT,
    inventory_quantity INTEGER,
    active BOOLEAN DEFAULT TRUE,
    image_url TEXT,
    images JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);

-- ============================================================================
-- MEMBERSHIP EVENTS TABLE (Audit Log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS membership_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    membership_id UUID REFERENCES memberships(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    event_type TEXT NOT NULL CHECK (event_type IN (
        'subscription.created',
        'subscription.updated',
        'subscription.deleted',
        'invoice.paid',
        'invoice.payment_failed',
        'plan.changed',
        'canceled',
        'reactivated'
    )),
    
    previous_status TEXT,
    new_status TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    stripe_event_id TEXT UNIQUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_membership_events_membership_id ON membership_events(membership_id);
CREATE INDEX IF NOT EXISTS idx_membership_events_user_id ON membership_events(user_id);
CREATE INDEX IF NOT EXISTS idx_membership_events_created_at ON membership_events(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_events ENABLE ROW LEVEL SECURITY;

-- Memberships: Users can read their own
CREATE POLICY "Users can view own membership"
    ON memberships FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to memberships"
    ON memberships FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Orders: Users can read their own
CREATE POLICY "Users can view own orders"
    ON orders FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to orders"
    ON orders FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Products: Anyone can read active products
CREATE POLICY "Anyone can read active products"
    ON products FOR SELECT
    USING (active = true);

CREATE POLICY "Service role full access to products"
    ON products FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Membership events: Users can read their own
CREATE POLICY "Users can view own membership events"
    ON membership_events FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to membership events"
    ON membership_events FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Check if user is active member
CREATE OR REPLACE FUNCTION is_active_member(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM memberships
        WHERE user_id = check_user_id
        AND status IN ('active', 'trialing')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER memberships_updated_at
    BEFORE UPDATE ON memberships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active members view
CREATE OR REPLACE VIEW active_members AS
SELECT 
    m.id,
    m.user_id,
    m.email,
    m.tier,
    m.status,
    m.current_period_end,
    m.created_at
FROM memberships m
WHERE m.status IN ('active', 'trialing');

-- Membership stats view
CREATE OR REPLACE VIEW membership_stats AS
SELECT
    COUNT(*) FILTER (WHERE status IN ('active', 'trialing')) as total_active,
    COUNT(*) FILTER (WHERE status IN ('active', 'trialing') AND tier = 'monthly') as monthly_count,
    COUNT(*) FILTER (WHERE status IN ('active', 'trialing') AND tier = 'annual') as annual_count,
    COUNT(*) FILTER (WHERE status = 'canceled') as canceled_count,
    (
        COUNT(*) FILTER (WHERE status IN ('active', 'trialing') AND tier = 'monthly') * 9.99 +
        COUNT(*) FILTER (WHERE status IN ('active', 'trialing') AND tier = 'annual') * (99.0 / 12)
    )::DECIMAL(10,2) as estimated_mrr
FROM memberships;
