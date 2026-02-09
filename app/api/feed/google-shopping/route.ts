// app/api/feed/google-shopping/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE SHOPPING XML FEED — Spec Item 38
// Public endpoint for Google Merchant Center free listings
// URL: /api/feed/google-shopping
// ═══════════════════════════════════════════════════════════════════════════
// - RSS 2.0 with g: namespace (Google Shopping spec)
// - Queries active products from Supabase
// - Includes: title, description, price, compare_at_price, images, GTIN/ASIN
// - Cacheable — 1 hour TTL
// - No auth required (public feed)
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN || process.env.NEXT_PUBLIC_SHOPIFY_SHOP_DOMAIN || '';
const SHOP_NAME = process.env.SHOP_NAME || 'Medazon Health';
const SHOP_URL = SHOP_DOMAIN ? `https://${SHOP_DOMAIN.replace('.myshopify.com', '.com')}` : 'https://medazonhealth.com';
const CURRENCY = 'USD';

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const limit = Math.min(parseInt(searchParams.get('limit') || '500'), 1000);

    // Fetch active products with required fields
    let query = supabase
      .from('products')
      .select('id, title, description, handle, retail_price, compare_at_price, cost_price, image_url, images, asin, category, product_type, vendor, rating, review_count, inventory_quantity, status')
      .eq('status', 'active')
      .not('retail_price', 'is', null)
      .not('title', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq('category', category);
    }

    const { data: products, error } = await query;

    if (error) {
      console.error('[GoogleFeed] Supabase error:', error);
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><error>${escapeXml(error.message)}</error>`,
        { status: 500, headers: { 'Content-Type': 'application/xml' } }
      );
    }

    // Build XML
    const xml = buildFeedXml(products || []);

    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800',
        'X-Feed-Count': (products?.length || 0).toString(),
        'X-Generated-At': new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[GoogleFeed] Error:', err);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><error>Internal server error</error>`,
      { status: 500, headers: { 'Content-Type': 'application/xml' } }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// XML GENERATION
// ═══════════════════════════════════════════════════════════════════════════

function buildFeedXml(products: any[]): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
<channel>
  <title>${escapeXml(SHOP_NAME)} — Google Shopping Feed</title>
  <link>${escapeXml(SHOP_URL)}</link>
  <description>Product feed for Google Merchant Center</description>
`;

  for (const product of products) {
    if (!product.title || !product.retail_price) continue;

    const productUrl = product.handle
      ? `${SHOP_URL}/products/${product.handle}`
      : `${SHOP_URL}/products/product-${(product.asin || product.id).toLowerCase()}`;

    const imageUrl = product.image_url || (product.images?.[0]?.src) || '';
    const additionalImages: string[] = (product.images || [])
      .slice(1, 10)
      .map((img: any) => typeof img === 'string' ? img : img?.src)
      .filter(Boolean);

    const description = (product.description || product.title || '')
      .replace(/<[^>]*>/g, '') // Strip HTML
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);

    const googleCategory = mapToGoogleCategory(product.category || product.product_type || '');
    const availability = (product.inventory_quantity === undefined || product.inventory_quantity > 0)
      ? 'in_stock'
      : 'out_of_stock';

    xml += `  <item>
    <g:id>${escapeXml(product.asin || product.id)}</g:id>
    <g:title>${escapeXml(truncate(product.title, 150))}</g:title>
    <g:description>${escapeXml(truncate(description, 5000))}</g:description>
    <g:link>${escapeXml(productUrl)}</g:link>
    <g:image_link>${escapeXml(imageUrl)}</g:image_link>
`;

    for (const addImg of additionalImages) {
      xml += `    <g:additional_image_link>${escapeXml(addImg)}</g:additional_image_link>\n`;
    }

    xml += `    <g:availability>${availability}</g:availability>
    <g:price>${product.retail_price.toFixed(2)} ${CURRENCY}</g:price>
`;

    if (product.compare_at_price && product.compare_at_price > product.retail_price) {
      xml += `    <g:sale_price>${product.retail_price.toFixed(2)} ${CURRENCY}</g:sale_price>\n`;
    }

    xml += `    <g:condition>new</g:condition>
`;

    if (product.vendor) {
      xml += `    <g:brand>${escapeXml(product.vendor)}</g:brand>\n`;
    }

    if (product.asin) {
      xml += `    <g:mpn>${escapeXml(product.asin)}</g:mpn>\n`;
    }

    if (googleCategory) {
      xml += `    <g:google_product_category>${escapeXml(googleCategory)}</g:google_product_category>\n`;
    }

    if (product.product_type || product.category) {
      xml += `    <g:product_type>${escapeXml(product.product_type || product.category)}</g:product_type>\n`;
    }

    xml += `    <g:identifier_exists>${product.asin ? 'yes' : 'no'}</g:identifier_exists>\n`;
    xml += `    <g:shipping>\n      <g:country>US</g:country>\n      <g:price>0.00 ${CURRENCY}</g:price>\n    </g:shipping>\n`;
    xml += `  </item>\n`;
  }

  xml += `</channel>\n</rss>`;
  return xml;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 1) : str;
}

function mapToGoogleCategory(internalCategory: string): string {
  const lower = internalCategory.toLowerCase();
  const map: Record<string, string> = {
    'kitchen': 'Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils',
    'kitchen gadgets': 'Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils',
    'phone': 'Electronics > Communications > Telephony > Mobile Phone Accessories',
    'phone accessories': 'Electronics > Communications > Telephony > Mobile Phone Accessories',
    'phone cases': 'Electronics > Communications > Telephony > Mobile Phone Accessories > Mobile Phone Cases',
    'home organization': 'Home & Garden > Household Supplies > Storage & Organization',
    'home': 'Home & Garden',
    'electronics': 'Electronics',
    'health': 'Health & Beauty',
    'beauty': 'Health & Beauty > Personal Care',
    'fitness': 'Sporting Goods > Exercise & Fitness',
    'toys': 'Toys & Games',
    'pet': 'Animals & Pet Supplies',
    'automotive': 'Vehicles & Parts > Vehicle Parts & Accessories',
    'office': 'Office Supplies',
    'garden': 'Home & Garden > Lawn & Garden',
    'baby': 'Baby & Toddler',
    'clothing': 'Apparel & Accessories > Clothing',
  };

  for (const [key, value] of Object.entries(map)) {
    if (lower.includes(key)) return value;
  }
  return 'Home & Garden';
}
