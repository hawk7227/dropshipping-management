// ═══════════════════════════════════════════════════════════════
// /api/feed/google-shopping/route.ts
// 
// Google Merchant Center Product Feed (XML/RSS 2.0 with g: namespace)
//
// WHAT THIS IS:
// When you go to Merchant Center → Products → Feeds → Add Feed,
// you select "Scheduled fetch" and paste this URL:
//   https://your-domain.com/api/feed/google-shopping
//
// Google hits this URL on a schedule (daily recommended).
// It returns XML containing every active product with all
// required attributes. Google reads it and lists your products
// in Google Shopping, Google Images, and the Shopping tab.
//
// REQUIRED ATTRIBUTES (Google will reject without these):
//   id, title, description, link, image_link, price,
//   availability, condition
//
// RECOMMENDED ATTRIBUTES (improves ranking):
//   brand, gtin, mpn, google_product_category, product_type,
//   shipping, identifier_exists, additional_image_link
//
// ⚠️ DO NOT remove, rename, or delete this file without approval.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ── Config ────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STORE_DOMAIN = process.env.NEXT_PUBLIC_STORE_DOMAIN || process.env.SHOPIFY_STORE_DOMAIN || '';
const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'Medazon';
const STORE_DESCRIPTION = process.env.STORE_DESCRIPTION || 'Premium products at unbeatable prices';
const CURRENCY = 'USD';
const CONDITION = 'new';
const DEFAULT_SHIPPING_PRICE = '0.00'; // Free shipping (Prime fulfillment)
const DEFAULT_SHIPPING_COUNTRY = 'US';

// ── Supabase Admin Client ─────────────────────────────────────

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// ── XML Escaping ──────────────────────────────────────────────

function esc(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Truncate to Google's limits ───────────────────────────────

function truncTitle(title: string): string {
  // Google max: 150 chars. Cut at last word boundary.
  if (title.length <= 150) return title;
  const cut = title.substring(0, 147);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 100 ? cut.substring(0, lastSpace) : cut) + '...';
}

function truncDesc(desc: string): string {
  // Google max: 5,000 chars
  if (desc.length <= 5000) return desc;
  return desc.substring(0, 4997) + '...';
}

// ── Clean description (strip HTML) ────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Build product link ────────────────────────────────────────

function buildProductLink(product: any): string {
  // If we have a Shopify handle/ID, link to the real Shopify product page
  const domain = STORE_DOMAIN.replace(/\/$/, '');
  if (!domain) return '';

  // Use the product handle if available, otherwise fallback to shopify product ID
  if (product.handle) {
    return `https://${domain}/products/${product.handle}`;
  }
  if (product.shopify_product_id && !product.shopify_product_id.startsWith('sync-')) {
    return `https://${domain}/products/${product.shopify_product_id}`;
  }
  // Last resort: use title as slug
  if (product.title) {
    const slug = product.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 80);
    return `https://${domain}/products/${slug}`;
  }
  return `https://${domain}`;
}

// ── Map category to Google taxonomy ───────────────────────────

function mapGoogleCategory(category: string | null): string {
  if (!category) return '';

  const cat = (category || '').toLowerCase();
  const MAP: Record<string, string> = {
    'health': 'Health & Beauty',
    'beauty': 'Health & Beauty > Personal Care',
    'electronics': 'Electronics',
    'home': 'Home & Garden',
    'kitchen': 'Home & Garden > Kitchen & Dining',
    'fitness': 'Sporting Goods > Exercise & Fitness',
    'pet': 'Animals & Pet Supplies',
    'baby': 'Baby & Toddler',
    'toys': 'Toys & Games',
    'clothing': 'Apparel & Accessories',
    'office': 'Office Supplies',
    'automotive': 'Vehicles & Parts > Vehicle Parts & Accessories',
    'garden': 'Home & Garden > Lawn & Garden',
    'sports': 'Sporting Goods',
    'tools': 'Hardware > Tools',
  };

  for (const [key, val] of Object.entries(MAP)) {
    if (cat.includes(key)) return val;
  }
  return category; // Pass through if no match
}

// ── Format price ──────────────────────────────────────────────

function formatPrice(price: number | null): string {
  if (!price || price <= 0) return '';
  return `${price.toFixed(2)} ${CURRENCY}`;
}

// ═══════════════════════════════════════════════════════════════
// GET — Returns the XML feed
// ═══════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();

    // Pull all feed-ready products
    // Feed-ready = active + has image + has price + has title
    const { data: products, error } = await supabase
      .from('products')
      .select('id, title, description, image_url, retail_price, compare_at_price, status, shopify_product_id, category, asin, handle, vendor, tags, quantity, images, weight, sku')
      .eq('status', 'active')
      .not('image_url', 'is', null)
      .gt('retail_price', 0)
      .not('title', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Google Feed] Supabase error:', error);
      return new NextResponse('<!-- Feed generation error -->', {
        status: 500,
        headers: { 'Content-Type': 'application/xml' },
      });
    }

    const items = (products || []).map((p: any) => {
      const link = buildProductLink(p);
      const price = formatPrice(p.retail_price);
      const salePrice = p.compare_at_price && p.compare_at_price > p.retail_price
        ? formatPrice(p.compare_at_price)
        : '';
      const desc = p.description ? truncDesc(stripHtml(p.description)) : p.title || '';
      const googleCat = mapGoogleCategory(p.category);
      const availability = (p.quantity === 0) ? 'out of stock' : 'in stock';

      // Use ASIN as the unique ID (best for dropshipping), fallback to DB id
      const itemId = p.asin || p.sku || p.id;

      // Additional images (if stored as JSON array)
      let additionalImages = '';
      if (p.images) {
        try {
          const imgs = typeof p.images === 'string' ? JSON.parse(p.images) : p.images;
          if (Array.isArray(imgs)) {
            additionalImages = imgs
              .filter((img: string) => img && img !== p.image_url)
              .slice(0, 10) // Google max: 10 additional images
              .map((img: string) => `      <g:additional_image_link>${esc(img)}</g:additional_image_link>`)
              .join('\n');
          }
        } catch { /* ignore parse errors */ }
      }

      return `    <item>
      <g:id>${esc(String(itemId))}</g:id>
      <g:title>${esc(truncTitle(p.title))}</g:title>
      <g:description>${esc(desc)}</g:description>
      <g:link>${esc(link)}</g:link>
      <g:image_link>${esc(p.image_url)}</g:image_link>
${additionalImages ? additionalImages + '\n' : ''}      <g:price>${price}</g:price>
${salePrice ? `      <g:sale_price>${salePrice}</g:sale_price>\n` : ''}      <g:availability>${availability}</g:availability>
      <g:condition>${CONDITION}</g:condition>
      <g:brand>${esc(p.vendor || STORE_NAME)}</g:brand>
${p.asin ? `      <g:mpn>${esc(p.asin)}</g:mpn>\n` : ''}      <g:identifier_exists>false</g:identifier_exists>
${googleCat ? `      <g:google_product_category>${esc(googleCat)}</g:google_product_category>\n` : ''}${p.category ? `      <g:product_type>${esc(p.category)}</g:product_type>\n` : ''}      <g:shipping>
        <g:country>${DEFAULT_SHIPPING_COUNTRY}</g:country>
        <g:price>${DEFAULT_SHIPPING_PRICE} ${CURRENCY}</g:price>
      </g:shipping>
${p.weight ? `      <g:shipping_weight>${p.weight} lb</g:shipping_weight>\n` : ''}    </item>`;
    });

    // ── Build the full XML feed ─────────────────────────────────

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>${esc(STORE_NAME)}</title>
    <link>https://${esc(STORE_DOMAIN)}</link>
    <description>${esc(STORE_DESCRIPTION)}</description>
${items.join('\n')}
  </channel>
</rss>`;

    // ── Return XML with proper headers ──────────────────────────

    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600', // Cache 1 hour
        'X-Feed-Items': String(items.length),
        'X-Feed-Generated': new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[Google Feed] Unexpected error:', err);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Error</title>
    <description>Feed generation failed</description>
  </channel>
</rss>`,
      { status: 500, headers: { 'Content-Type': 'application/xml' } }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// POST — Force regenerate + return stats (for admin/cron use)
// ═══════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    // Optional: verify cron secret
    const secret = req.headers.get('x-cron-secret');
    if (secret && secret !== process.env.CRON_SECRET && secret !== 'manual-trigger') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();

    // Count feed-ready products
    const { count: totalProducts } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true });

    const { count: feedReady } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .not('image_url', 'is', null)
      .gt('retail_price', 0)
      .not('title', 'is', null);

    const { count: missingImage } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .is('image_url', null);

    const { count: missingPrice } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .or('retail_price.is.null,retail_price.lte.0');

    const { count: missingDesc } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .is('description', null);

    // Log to cron_job_logs (if table exists)
    try {
      await supabase.from('cron_job_logs').insert({
        job_name: 'google-shopping',
        status: 'success',
        message: `Feed generated: ${feedReady} products ready, ${totalProducts} total`,
        duration_seconds: 0,
      });
    } catch { /* table may not exist yet */ }

    return NextResponse.json({
      success: true,
      feedUrl: '/api/feed/google-shopping',
      stats: {
        totalProducts: totalProducts || 0,
        feedReady: feedReady || 0,
        missingImage: missingImage || 0,
        missingPrice: missingPrice || 0,
        missingDescription: missingDesc || 0,
        healthScore: totalProducts ? Math.round(((feedReady || 0) / totalProducts) * 100) : 0,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Google Feed POST] Error:', err);
    return NextResponse.json({ error: 'Feed stats failed' }, { status: 500 });
  }
}
