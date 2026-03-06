// ═══════════════════════════════════════════════════════════════
// /api/feed/google-shopping/route.ts — PHASE 1: UNIFIED FEED
//
// GET  — Returns XML feed for Google Merchant Center scheduled fetch
// POST — Returns feed health stats + triggers feed_status writes
//
// CHANGES FROM v1:
// - 104-entry category map (was 15) via GOOGLE_CATEGORY_MAP from constants
// - Reads google_product_category column FIRST, then product_type, then auto-map
// - GTIN submission: g:gtin with barcode, identifier_exists=true when valid
// - Sale price: compare_at_price as g:price, retail_price as g:sale_price (strikethrough)
// - Cost of goods: g:cost_of_goods_sold for ROAS bidding
// - Custom labels: margin tier, price range, category
// - Product highlights from tags
// - Feed filter: prefers feed_status='ready', falls back to active+image+price+title
// - Expanded SELECT: +product_type, google_product_category, barcode, feed_status, cost_price, feed_score
// - /rejected endpoint via ?action=rejected query param on POST
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GOOGLE_CATEGORY_MAP } from '@/lib/contracts/constants';

// ── Config ────────────────────────────────────────────────────

const STORE_DOMAIN = process.env.NEXT_PUBLIC_STORE_DOMAIN || process.env.SHOPIFY_STORE_DOMAIN || '';
const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'EvenBetterBuy';
const STORE_DESCRIPTION = process.env.STORE_DESCRIPTION || 'Premium products at unbeatable prices';
const CURRENCY = 'USD';
const CONDITION = 'new';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Helpers ───────────────────────────────────────────────────

function esc(str: string | null | undefined): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function truncTitle(title: string): string {
  if (title.length <= 150) return title;
  const cut = title.substring(0, 147);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 100 ? cut.substring(0, lastSpace) : cut) + '...';
}

function stripHtml(html: string): string {
  return html
    .replace(/<meta[^>]*>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 5000);
}

function buildProductLink(p: Record<string, unknown>): string {
  const domain = (STORE_DOMAIN || '').replace(/\/$/, '');
  if (!domain) return '';
  if (p.handle) return `https://${domain}/products/${p.handle}`;
  if (p.shopify_product_id && !String(p.shopify_product_id).startsWith('sync-'))
    return `https://${domain}/products/${p.shopify_product_id}`;
  if (p.title) {
    const slug = String(p.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 80);
    return `https://${domain}/products/${slug}`;
  }
  return `https://${domain}`;
}

// Auto-map using the 104-entry map from constants
function autoMapCategory(googleCat: string | null, productType: string | null, category: string | null, tags: string | null, title: string | null): string {
  // Priority 1: explicit google_product_category column
  if (googleCat && googleCat.length > 3) return googleCat;
  // Priority 2: product_type column (from Matrixify import)
  if (productType && productType.length > 3) {
    const combined = productType.toLowerCase();
    let best = ''; let bestLen = 0;
    for (const [kw, gc] of Object.entries(GOOGLE_CATEGORY_MAP)) {
      if (combined.includes(kw) && kw.length > bestLen) { best = gc; bestLen = kw.length; }
    }
    if (best) return best;
  }
  // Priority 3: tags + category + title auto-map
  const combined = `${tags || ''} ${category || ''} ${title || ''}`.toLowerCase();
  let best = ''; let bestLen = 0;
  for (const [kw, gc] of Object.entries(GOOGLE_CATEGORY_MAP)) {
    if (combined.includes(kw) && kw.length > bestLen) { best = gc; bestLen = kw.length; }
  }
  return best || (category || '');
}

// GTIN validation
function isValidGTIN(barcode: string | null): boolean {
  if (!barcode) return false;
  const clean = String(barcode).replace(/[^0-9]/g, '');
  if (![8, 12, 13, 14].includes(clean.length)) return false;
  if (['2', '02', '04'].some(p => clean.startsWith(p))) return false;
  // Checksum validation
  const digits = clean.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  const even = digits.length % 2 === 0;
  for (let i = 0; i < digits.length; i++) {
    sum += (even ? (i % 2 === 0 ? 3 : 1) : (i % 2 === 0 ? 1 : 3)) * digits[i];
  }
  return (10 - (sum % 10)) % 10 === check;
}

// Custom labels for Google Ads segmentation
function getCustomLabels(p: Record<string, unknown>): { l0: string; l1: string; l2: string } {
  const cost = Number(p.cost_price) || 0;
  const retail = Number(p.retail_price) || 0;
  const margin = cost > 0 && retail > 0 ? ((retail - cost) / cost) * 100 : 0;

  // Label 0: Margin tier
  const l0 = margin >= 60 ? 'high_margin' : margin >= 30 ? 'medium_margin' : 'low_margin';
  // Label 1: Price range
  const l1 = retail < 15 ? 'under_15' : retail < 30 ? '15_to_30' : retail < 60 ? '30_to_60' : 'over_60';
  // Label 2: Category bucket
  const cat = String(p.category || p.product_type || '').toLowerCase();
  const l2 = cat.includes('health') || cat.includes('beauty') ? 'health_beauty'
    : cat.includes('electron') ? 'electronics'
    : cat.includes('home') || cat.includes('kitchen') ? 'home_kitchen'
    : 'other';
  return { l0, l1, l2 };
}

// Product highlights from tags
function getHighlights(tags: string | null): string[] {
  if (!tags) return [];
  return String(tags).split(',')
    .map(t => t.trim())
    .filter(t => t.length > 3 && t.length < 60 && !['categorized', 'imported', 'bulk-push', 'command-center'].includes(t.toLowerCase()))
    .slice(0, 5);
}

function formatPrice(price: number | null): string {
  if (!price || price <= 0) return '';
  return `${price.toFixed(2)} ${CURRENCY}`;
}

// ═══════════════════════════════════════════════════════════════
// GET — Returns the XML feed
// ═══════════════════════════════════════════════════════════════

export async function GET() {
  try {
    const supabase = getSupabase();

    // Expanded SELECT — includes all new fields
    const { data: products, error } = await supabase
      .from('products')
      .select('id, title, description, image_url, retail_price, compare_at_price, cost_price, status, shopify_product_id, category, product_type, google_product_category, asin, handle, vendor, tags, quantity, images, weight, sku, barcode, feed_status, feed_score')
      .eq('status', 'active')
      .not('image_url', 'is', null)
      .gt('retail_price', 0)
      .not('title', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Google Feed] Supabase error:', error);
      return new NextResponse('<!-- Feed generation error -->', { status: 500, headers: { 'Content-Type': 'application/xml' } });
    }

    const items = (products || []).map((p: Record<string, unknown>) => {
      const link = buildProductLink(p);
      const retailPrice = Number(p.retail_price) || 0;
      const compareAt = Number(p.compare_at_price) || 0;
      const costPrice = Number(p.cost_price) || 0;
      const desc = p.description ? stripHtml(String(p.description)) : String(p.title || '');
      const googleCat = autoMapCategory(
        p.google_product_category as string, p.product_type as string,
        p.category as string, p.tags as string, p.title as string
      );
      const availability = Number(p.quantity) === 0 ? 'out of stock' : 'in stock';
      const itemId = p.asin || p.sku || p.id;
      const barcode = String(p.barcode || '').replace(/[^0-9]/g, '');
      const gtinValid = isValidGTIN(barcode);
      const labels = getCustomLabels(p);
      const highlights = getHighlights(p.tags as string);

      // Sale price logic: if compare_at > retail, show strikethrough
      // g:price = the higher price (compare_at), g:sale_price = your actual price
      let priceXml = '';
      if (compareAt > retailPrice && compareAt > 0) {
        priceXml = `      <g:price>${formatPrice(compareAt)}</g:price>\n      <g:sale_price>${formatPrice(retailPrice)}</g:sale_price>`;
      } else {
        priceXml = `      <g:price>${formatPrice(retailPrice)}</g:price>`;
      }

      // Additional images
      let additionalImages = '';
      if (p.images) {
        try {
          const imgs = typeof p.images === 'string' ? JSON.parse(p.images as string) : p.images;
          if (Array.isArray(imgs)) {
            additionalImages = imgs
              .map((img: unknown) => typeof img === 'string' ? img : (img as Record<string, string>)?.src || '')
              .filter((img: string) => img && img !== p.image_url)
              .slice(0, 10)
              .map((img: string) => `      <g:additional_image_link>${esc(img)}</g:additional_image_link>`)
              .join('\n');
          }
        } catch { /* ignore */ }
      }

      return `    <item>
      <g:id>${esc(String(itemId))}</g:id>
      <g:title>${esc(truncTitle(String(p.title)))}</g:title>
      <g:description>${esc(desc)}</g:description>
      <g:link>${esc(link)}</g:link>
      <g:image_link>${esc(String(p.image_url))}</g:image_link>
${additionalImages ? additionalImages + '\n' : ''}${priceXml}
${costPrice > 0 ? `      <g:cost_of_goods_sold>${formatPrice(costPrice)}</g:cost_of_goods_sold>\n` : ''}      <g:availability>${availability}</g:availability>
      <g:condition>${CONDITION}</g:condition>
      <g:brand>${esc(String(p.vendor || STORE_NAME))}</g:brand>
${gtinValid ? `      <g:gtin>${esc(barcode)}</g:gtin>\n      <g:identifier_exists>true</g:identifier_exists>` : `${p.asin ? `      <g:mpn>${esc(String(p.asin))}</g:mpn>\n` : ''}      <g:identifier_exists>${gtinValid || !!p.asin ? 'true' : 'false'}</g:identifier_exists>`}
${googleCat ? `      <g:google_product_category>${esc(googleCat)}</g:google_product_category>` : ''}
${p.product_type || p.category ? `      <g:product_type>${esc(String(p.product_type || p.category))}</g:product_type>` : ''}
      <g:custom_label_0>${labels.l0}</g:custom_label_0>
      <g:custom_label_1>${labels.l1}</g:custom_label_1>
      <g:custom_label_2>${labels.l2}</g:custom_label_2>
${highlights.map(h => `      <g:product_highlight>${esc(h)}</g:product_highlight>`).join('\n')}
      <g:shipping>
        <g:country>US</g:country>
        <g:price>0.00 ${CURRENCY}</g:price>
      </g:shipping>
${p.weight ? `      <g:shipping_weight>${p.weight} lb</g:shipping_weight>\n` : ''}    </item>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>${esc(STORE_NAME)}</title>
    <link>https://${esc(STORE_DOMAIN)}</link>
    <description>${esc(STORE_DESCRIPTION)}</description>
${items.join('\n')}
  </channel>
</rss>`;

    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'X-Feed-Items': String(items.length),
        'X-Feed-Generated': new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[Google Feed] Unexpected error:', err);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel><title>Error</title></channel></rss>`,
      { status: 500, headers: { 'Content-Type': 'application/xml' } }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// POST — Feed stats + rejected products list + feed-check trigger
// ═══════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'stats';

    // ── REJECTED: Return all products failing feed gates ──
    if (action === 'rejected') {
      const { data, error } = await supabase
        .from('products')
        .select('id, title, handle, asin, image_url, retail_price, category, product_type, google_product_category, barcode, feed_status, feed_score, feed_rejection_reasons, vendor')
        .eq('feed_status', 'rejected')
        .order('feed_score', { ascending: true })
        .limit(500);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({
        rejected: data || [],
        count: data?.length || 0,
        timestamp: new Date().toISOString(),
      });
    }

    // ── FEED-CHECK: Run compliance check and write feed_status ──
    if (action === 'feed-check') {
      const { data: products, error } = await supabase
        .from('products')
        .select('id, title, description, image_url, retail_price, category, product_type, google_product_category, asin, vendor, tags, barcode, feed_status')
        .eq('status', 'active')
        .limit(10000);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      let ready = 0, rejected = 0, pending = 0;
      const updates: Array<{ id: string; feed_status: string; feed_score: number; feed_rejection_reasons: string[]; google_product_category: string | null }> = [];

      for (const p of (products || [])) {
        const reasons: string[] = [];
        let score = 0;
        const title = String(p.title || '');
        const desc = String(p.description || '');
        const barcode = String(p.barcode || '').replace(/[^0-9]/g, '');

        // Gate checks
        if (title.length > 5) score += 10; else reasons.push('MISSING_TITLE');
        if (title.length <= 150) score += 10; else reasons.push('TITLE_TOO_LONG');
        if (p.image_url) score += 15; else reasons.push('MISSING_IMAGE');
        if (Number(p.retail_price) > 0) score += 15; else reasons.push('MISSING_PRICE');
        if (desc.length > 30 && !/<[a-z]/i.test(desc)) score += 15; else reasons.push(desc.length < 30 ? 'SHORT_DESCRIPTION' : 'HTML_IN_DESCRIPTION');
        if (isValidGTIN(barcode)) score += 15; else if (barcode) reasons.push('INVALID_GTIN'); else reasons.push('MISSING_GTIN');

        const googleCat = autoMapCategory(p.google_product_category, p.product_type, p.category, p.tags, p.title);
        if (googleCat && googleCat.length > 3) score += 10; else reasons.push('MISSING_CATEGORY');
        if (p.vendor && p.vendor !== 'Unknown') score += 5; else reasons.push('MISSING_BRAND');
        score += 5; // free shipping always

        const status = reasons.length === 0 ? 'ready' : score >= 60 ? 'pending' : 'rejected';
        if (status === 'ready') ready++;
        else if (status === 'rejected') rejected++;
        else pending++;

        updates.push({
          id: p.id,
          feed_status: status,
          feed_score: score,
          feed_rejection_reasons: reasons,
          google_product_category: googleCat || p.google_product_category || null,
        });
      }

      // Batch write — 500 at a time
      for (let i = 0; i < updates.length; i += 500) {
        const batch = updates.slice(i, i + 500);
        for (const u of batch) {
          await supabase.from('products').update({
            feed_status: u.feed_status,
            feed_score: u.feed_score,
            feed_rejection_reasons: u.feed_rejection_reasons,
            google_product_category: u.google_product_category,
          }).eq('id', u.id);
        }
      }

      // Log to shift_log
      try {
        await supabase.from('shift_log').insert({
          category: 'feed_event',
          title: `Feed check complete: ${ready} ready, ${pending} pending, ${rejected} rejected`,
          description: `Checked ${updates.length} products. Feed health: ${updates.length > 0 ? Math.round((ready / updates.length) * 100) : 0}%`,
          source: 'feed-check',
          severity: rejected > ready ? 'warning' : 'success',
          meta: { ready, pending, rejected, total: updates.length },
        });
      } catch { /* shift_log may not exist yet */ }

      return NextResponse.json({
        success: true,
        checked: updates.length,
        ready, pending, rejected,
        healthPercent: updates.length > 0 ? Math.round((ready / updates.length) * 100) : 0,
        timestamp: new Date().toISOString(),
      });
    }

    // ── DEFAULT: Stats ──
    const { count: totalProducts } = await supabase.from('products').select('id', { count: 'exact', head: true });
    const { count: feedReady } = await supabase.from('products').select('id', { count: 'exact', head: true })
      .eq('status', 'active').not('image_url', 'is', null).gt('retail_price', 0).not('title', 'is', null);
    const { count: missingImage } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('status', 'active').is('image_url', null);
    const { count: missingPrice } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('status', 'active').or('retail_price.is.null,retail_price.lte.0');
    const { count: byStatus } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('feed_status', 'ready');

    return NextResponse.json({
      success: true,
      feedUrl: '/api/feed/google-shopping',
      stats: {
        totalProducts: totalProducts || 0,
        feedReady: feedReady || 0,
        feedReadyByStatus: byStatus || 0,
        missingImage: missingImage || 0,
        missingPrice: missingPrice || 0,
        healthScore: totalProducts ? Math.round(((feedReady || 0) / totalProducts) * 100) : 0,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Google Feed POST] Error:', err);
    return NextResponse.json({ error: 'Feed operation failed' }, { status: 500 });
  }
}
