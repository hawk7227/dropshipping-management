// app/api/shopify-push/route.ts
// STANDALONE Shopify push API — zero dependencies on lib/
// Reads products from Supabase, pushes to Shopify, updates Supabase with Shopify IDs

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ── Config (read once per cold start, safe for Vercel) ──────────────
function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const shopifyStore = process.env.SHOPIFY_STORE_DOMAIN;
  const shopifyToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  return { supabaseUrl, supabaseKey, shopifyStore, shopifyToken };
}

function getSupabase() {
  const { supabaseUrl, supabaseKey } = getConfig();
  if (!supabaseUrl || !supabaseKey) throw new Error('Supabase not configured');
  return createClient(supabaseUrl, supabaseKey);
}

// ── Pricing logic ───────────────────────────────────────────────────
const MARKUP = 1.70;
const COMPETITOR_RANGES = {
  amazon: { min: 1.82, max: 1.88 },
  costco: { min: 1.80, max: 1.85 },
  ebay:   { min: 1.87, max: 1.93 },
  sams:   { min: 1.80, max: 1.83 },
};
const rand = (mn: number, mx: number) => +(mn + Math.random() * (mx - mn)).toFixed(2);

// ── GET: Fetch all products from Supabase (for the push page) ───────
export async function GET() {
  try {
    const supabase = getSupabase();

    const { data: products, error, count } = await supabase
      .from('products')
      .select('id, title, asin, main_image, image_url, cost_price, amazon_price, current_price, retail_price, status, shopify_product_id, source_product_id, description, body_html, vendor, product_type, tags, images, source_url, inventory_quantity, shopify_variant_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('[ShopifyPush GET] Supabase error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const { shopifyStore, shopifyToken } = getConfig();

    return NextResponse.json({
      success: true,
      products: products || [],
      total: count || 0,
      shopifyConfigured: !!(shopifyStore && shopifyToken),
      shopifyStore: shopifyStore || null,
    });
  } catch (err) {
    console.error('[ShopifyPush GET] Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// ── POST: Push products to Shopify ──────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { shopifyStore, shopifyToken } = getConfig();
    if (!shopifyStore || !shopifyToken) {
      return NextResponse.json({
        success: false,
        error: 'Shopify not configured. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN in your environment variables.',
      }, { status: 400 });
    }

    const supabase = getSupabase();
    const body = await request.json();
    const { productIds } = body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ success: false, error: 'productIds array required' }, { status: 400 });
    }

    const API