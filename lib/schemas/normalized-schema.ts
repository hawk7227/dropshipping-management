import { z } from 'zod';

// Normalized Product Schema (based on STEP 2 analysis)
export const NormalizedProductSchema = z.object({
  id: z.string().uuid(),
  asin: z.string(),
  title: z.string(),
  brand: z.string(),
  category: z.string(),
  description: z.string(),
  main_image: z.string(),
  images: z.array(z.string()),
  rating: z.number().nullable(),
  ratings_total: z.number().nullable(),
  status: z.string(),
  source: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

// Normalized Price Snapshot Schema (based on STEP 2 analysis)
export const NormalizedPriceSnapshotSchema = z.object({
  product_id: z.string().uuid(),
  asin: z.string(),
  current_price: z.number().nullable(), // Missing from fixtures
  cost_price: z.number().nullable(), // Missing from fixtures
  competitor_prices: z.any().nullable(), // Missing from fixtures
  bsr_rank: z.number().nullable(),
  bsr_category: z.string().nullable(),
  recent_sales: z.string().nullable(),
  rating: z.number().nullable(),
  is_prime: z.boolean().nullable(),
  sync_date: z.string(),
});

// Normalized Shopify Product Schema (based on STEP 2 analysis)
export const NormalizedShopifyProductSchema = z.object({
  shopify_id: z.number(),
  product_id: z.string().uuid(),
  title: z.string(),
  handle: z.string(),
  vendor: z.string(),
  status: z.string(),
  body_html: z.string(),
  tags: z.string(),
  published_at: z.string(),
  updated_at: z.string(),
});

// Export types
export type NormalizedProduct = z.infer<typeof NormalizedProductSchema>;
export type NormalizedPriceSnapshot = z.infer<typeof NormalizedPriceSnapshotSchema>;
export type NormalizedShopifyProduct = z.infer<typeof NormalizedShopifyProductSchema>;
