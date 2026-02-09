-- Dropship Pro Dashboard - Seed Data
-- Version: 1.0
-- 
-- This file populates the database with sample data for development and testing.
-- Products follow the business rules:
--   - Your Price = Amazon Cost × 1.70
--   - Competitor Prices = Your Price × 1.80-1.93
--   - All competitor prices are at least 80% higher than retail price
--
-- Run after schema.sql in Supabase SQL Editor

-- ═══════════════════════════════════════════════════════════════════════════
-- SAMPLE PRODUCTS
-- ═══════════════════════════════════════════════════════════════════════════
-- 
-- Pricing calculations example for $10.00 cost:
--   retail_price = 10.00 × 1.70 = $17.00
--   min_competitor = 17.00 × 1.80 = $30.60
--   amazon = 17.00 × 1.85 = $31.45 (82-88% range)
--   costco = 17.00 × 1.82 = $30.94 (80-85% range)
--   ebay = 17.00 × 1.90 = $32.30 (87-93% range, highest)
--   sams = 17.00 × 1.81 = $30.77 (80-83% range, lowest)

INSERT INTO products (
  title,
  source,
  source_product_id,
  asin,
  url,
  image_url,
  cost_price,
  retail_price,
  amazon_display_price,
  costco_display_price,
  ebay_display_price,
  sams_display_price,
  status,
  lifecycle_status,
  rating,
  review_count,
  is_prime,
  tags,
  notes
) VALUES
-- Product 1: Ice Roller ($10.00 cost)
(
  'Ice Roller for Face & Eye Puffiness Relief',
  'rainforest',
  'rainforest_001',
  'B08XYZ1234',
  'https://amazon.com/dp/B08XYZ1234',
  'https://m.media-amazon.com/images/I/ice-roller.jpg',
  10.00,
  17.00,      -- 10 × 1.70
  31.45,      -- 17 × 1.85
  30.94,      -- 17 × 1.82
  32.30,      -- 17 × 1.90
  30.77,      -- 17 × 1.81
  'active',
  'stable',
  4.5,
  2847,
  true,
  ARRAY['beauty', 'skincare', 'bestseller'],
  'Top seller - consistent margins'
),

-- Product 2: Jade Roller Set ($8.00 cost)
(
  'Jade Roller and Gua Sha Set - Premium Quality',
  'rainforest',
  'rainforest_002',
  'B08ABC5678',
  'https://amazon.com/dp/B08ABC5678',
  'https://m.media-amazon.com/images/I/jade-roller.jpg',
  8.00,
  13.60,      -- 8 × 1.70
  25.16,      -- 13.60 × 1.85
  24.75,      -- 13.60 × 1.82
  25.84,      -- 13.60 × 1.90
  24.62,      -- 13.60 × 1.81
  'active',
  'stable',
  4.3,
  1923,
  true,
  ARRAY['beauty', 'skincare', 'gua sha'],
  'Good pairing with ice roller'
),

-- Product 3: LED Face Mask ($15.00 cost)
(
  'LED Light Therapy Face Mask - 7 Colors',
  'keepa',
  'keepa_001',
  'B09DEF9012',
  'https://amazon.com/dp/B09DEF9012',
  'https://m.media-amazon.com/images/I/led-mask.jpg',
  15.00,
  25.50,      -- 15 × 1.70
  47.18,      -- 25.50 × 1.85
  46.41,      -- 25.50 × 1.82
  48.45,      -- 25.50 × 1.90
  46.16,      -- 25.50 × 1.81
  'active',
  'rising',
  4.2,
  892,
  true,
  ARRAY['beauty', 'skincare', 'led', 'trending'],
  'Trending product - monitor closely'
),

-- Product 4: Silicone Face Scrubber ($5.00 cost)
(
  'Silicone Face Scrubber - Pack of 2',
  'csv',
  'csv_import_001',
  'B07GHI3456',
  'https://amazon.com/dp/B07GHI3456',
  'https://m.media-amazon.com/images/I/face-scrubber.jpg',
  5.00,
  8.50,       -- 5 × 1.70
  15.73,      -- 8.50 × 1.85
  15.47,      -- 8.50 × 1.82
  16.15,      -- 8.50 × 1.90
  15.39,      -- 8.50 × 1.81
  'active',
  'stable',
  4.6,
  5621,
  true,
  ARRAY['beauty', 'skincare', 'value'],
  'High volume, low margin'
),

-- Product 5: Derma Roller ($12.00 cost)
(
  'Derma Roller 0.5mm - Titanium Micro Needles',
  'rainforest',
  'rainforest_003',
  'B08JKL7890',
  'https://amazon.com/dp/B08JKL7890',
  'https://m.media-amazon.com/images/I/derma-roller.jpg',
  12.00,
  20.40,      -- 12 × 1.70
  37.74,      -- 20.40 × 1.85
  37.13,      -- 20.40 × 1.82
  38.76,      -- 20.40 × 1.90
  36.92,      -- 20.40 × 1.81
  'active',
  'stable',
  4.4,
  3156,
  true,
  ARRAY['beauty', 'skincare', 'derma'],
  'Steady performer'
),

-- Product 6: Eye Cream Applicator ($3.00 cost)
(
  'Metal Eye Cream Applicator Wand - Set of 2',
  'paste',
  'paste_001',
  'B09MNO1234',
  'https://amazon.com/dp/B09MNO1234',
  'https://m.media-amazon.com/images/I/eye-wand.jpg',
  3.00,
  5.10,       -- 3 × 1.70
  9.44,       -- 5.10 × 1.85
  9.28,       -- 5.10 × 1.82
  9.69,       -- 5.10 × 1.90
  9.23,       -- 5.10 × 1.81
  'draft',
  'new',
  4.1,
  723,
  true,
  ARRAY['beauty', 'accessories'],
  'New product - needs review'
),

-- Product 7: Facial Steamer ($18.00 cost)
(
  'Nano Ionic Facial Steamer - Professional Grade',
  'rainforest',
  'rainforest_004',
  'B08PQR5678',
  'https://amazon.com/dp/B08PQR5678',
  'https://m.media-amazon.com/images/I/facial-steamer.jpg',
  18.00,
  30.60,      -- 18 × 1.70
  56.61,      -- 30.60 × 1.85
  55.69,      -- 30.60 × 1.82
  58.14,      -- 30.60 × 1.90
  55.39,      -- 30.60 × 1.81
  'active',
  'stable',
  4.5,
  1876,
  true,
  ARRAY['beauty', 'spa', 'professional'],
  'Higher price point but good margins'
),

-- Product 8: Blackhead Remover ($7.00 cost)
(
  'Blackhead Remover Pore Vacuum - Electric',
  'keepa',
  'keepa_002',
  'B09STU9012',
  'https://amazon.com/dp/B09STU9012',
  'https://m.media-amazon.com/images/I/pore-vacuum.jpg',
  7.00,
  11.90,      -- 7 × 1.70
  22.02,      -- 11.90 × 1.85
  21.66,      -- 11.90 × 1.82
  22.61,      -- 11.90 × 1.90
  21.54,      -- 11.90 × 1.81
  'active',
  'price_drop',
  4.0,
  2341,
  true,
  ARRAY['beauty', 'skincare', 'electric'],
  'Price dropped from competitor - watch margins'
),

-- Product 9: Paused product for testing
(
  'Face Massage Tool - Rose Quartz',
  'csv',
  'csv_import_002',
  'B08VWX3456',
  'https://amazon.com/dp/B08VWX3456',
  'https://m.media-amazon.com/images/I/rose-quartz.jpg',
  9.00,
  15.30,      -- 9 × 1.70
  28.31,      -- 15.30 × 1.85
  27.85,      -- 15.30 × 1.82
  29.07,      -- 15.30 × 1.90
  27.69,      -- 15.30 × 1.81
  'paused',
  'stable',
  4.2,
  1245,
  true,
  ARRAY['beauty', 'skincare'],
  'Paused due to inventory issues'
),

-- Product 10: Low margin product (below 30% after competitor discovery)
(
  'Basic Cotton Pads - 100 Count',
  'manual',
  NULL,
  'B09YZA7890',
  'https://amazon.com/dp/B09YZA7890',
  'https://m.media-amazon.com/images/I/cotton-pads.jpg',
  4.00,
  6.80,       -- 4 × 1.70
  12.58,      -- 6.80 × 1.85
  12.38,      -- 6.80 × 1.82
  12.92,      -- 6.80 × 1.90
  12.31,      -- 6.80 × 1.81
  'active',
  'stable',
  4.7,
  8923,
  true,
  ARRAY['consumables', 'basics'],
  'Consider bundling to improve margins'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- SAMPLE SHOPIFY QUEUE ITEMS
-- ═══════════════════════════════════════════════════════════════════════════

-- Get product IDs for queue items
DO $$
DECLARE
  product_1_id UUID;
  product_2_id UUID;
  product_3_id UUID;
BEGIN
  SELECT id INTO product_1_id FROM products WHERE asin = 'B08XYZ1234';
  SELECT id INTO product_2_id FROM products WHERE asin = 'B08ABC5678';
  SELECT id INTO product_3_id FROM products WHERE asin = 'B09DEF9012';
  
  -- Insert queue items
  INSERT INTO shopify_queue (product_id, action, priority, status) VALUES
    (product_1_id, 'update', 0, 'pending'),
    (product_2_id, 'create', 1, 'pending'),
    (product_3_id, 'update', 0, 'completed');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SAMPLE AI SUGGESTIONS
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  product_8_id UUID;
  product_10_id UUID;
BEGIN
  SELECT id INTO product_8_id FROM products WHERE asin = 'B09STU9012';
  SELECT id INTO product_10_id FROM products WHERE asin = 'B09YZA7890';
  
  INSERT INTO ai_suggestions (
    type,
    priority,
    title,
    description,
    product_id,
    current_value,
    suggested_value,
    potential_impact,
    reasoning,
    confidence,
    status,
    expires_at
  ) VALUES
  (
    'reprice',
    'high',
    'Adjust pricing for Blackhead Remover',
    'Competitor prices have dropped. Consider lowering your price to maintain competitiveness while staying above minimum margin.',
    product_8_id,
    '$11.90',
    '$10.50',
    'Maintain sales velocity',
    'Based on price history analysis, this product category is experiencing downward pressure. Reducing price now prevents inventory buildup.',
    0.85,
    'pending',
    NOW() + INTERVAL '7 days'
  ),
  (
    'bundle',
    'medium',
    'Create bundle with Cotton Pads',
    'Low-margin product could benefit from bundling with complementary items.',
    product_10_id,
    'Single item',
    'Bundle with face scrubber',
    'Increase margins by 15-20%',
    'Products are frequently bought together. Bundling allows higher markup while providing customer value.',
    0.72,
    'pending',
    NOW() + INTERVAL '14 days'
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SAMPLE NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO notifications (type, severity, title, message, read) VALUES
(
  'system',
  'info',
  'Welcome to Dropship Pro!',
  'Your dashboard is ready. Start by importing products or discovering new items via Rainforest API.',
  false
),
(
  'price_alert',
  'warning',
  'Margin Alert: Blackhead Remover',
  'The Blackhead Remover product has dropped below target margin. Current profit: 41%. Consider repricing.',
  false
),
(
  'import_complete',
  'info',
  'Import Completed',
  'Successfully imported 10 products from CSV. 8 active, 1 draft, 1 paused.',
  true
);

-- ═══════════════════════════════════════════════════════════════════════════
-- SAMPLE PRICE HISTORY
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  product_1_id UUID;
BEGIN
  SELECT id INTO product_1_id FROM products WHERE asin = 'B08XYZ1234';
  
  -- Insert historical prices (simulating price changes over time)
  INSERT INTO price_history (
    product_id,
    cost_price,
    retail_price,
    amazon_display_price,
    costco_display_price,
    ebay_display_price,
    sams_display_price,
    source,
    recorded_at
  ) VALUES
  (product_1_id, 9.50, 16.15, 29.88, 29.39, 30.69, 29.23, 'import', NOW() - INTERVAL '30 days'),
  (product_1_id, 9.75, 16.58, 30.67, 30.18, 31.50, 30.01, 'price_refresh', NOW() - INTERVAL '14 days'),
  (product_1_id, 10.00, 17.00, 31.45, 30.94, 32.30, 30.77, 'price_refresh', NOW() - INTERVAL '7 days');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SAMPLE DISCOVERY JOB
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO discovery_jobs (
  search_term,
  source,
  status,
  products_found,
  products_added,
  products_skipped,
  started_at,
  completed_at
) VALUES
(
  'ice roller face beauty',
  'rainforest',
  'completed',
  25,
  8,
  17,
  NOW() - INTERVAL '2 hours',
  NOW() - INTERVAL '1 hour'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- SAMPLE IMPORT JOB
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO import_jobs (
  source,
  file_name,
  total_rows,
  processed_rows,
  successful_rows,
  failed_rows,
  skipped_rows,
  status,
  started_at,
  completed_at
) VALUES
(
  'csv',
  'beauty_products_batch1.csv',
  12,
  12,
  10,
  1,
  1,
  'completed',
  NOW() - INTERVAL '3 hours',
  NOW() - INTERVAL '3 hours' + INTERVAL '2 minutes'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- SAMPLE API USAGE
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO api_usage (api, operation, request_count, cost) VALUES
('rainforest', 'product_search', 5, 0.05),
('rainforest', 'product_lookup', 25, 0.25),
('keepa', 'price_history', 10, 0.01),
('shopify', 'create_product', 8, 0.00),
('shopify', 'update_product', 15, 0.00);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY DATA
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  product_count INTEGER;
  suggestion_count INTEGER;
  notification_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO product_count FROM products;
  SELECT COUNT(*) INTO suggestion_count FROM ai_suggestions;
  SELECT COUNT(*) INTO notification_count FROM notifications;
  
  RAISE NOTICE 'Seed data inserted successfully!';
  RAISE NOTICE 'Products: %', product_count;
  RAISE NOTICE 'AI Suggestions: %', suggestion_count;
  RAISE NOTICE 'Notifications: %', notification_count;
END $$;
