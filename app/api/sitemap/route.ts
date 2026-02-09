// app/api/sitemap/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// SITEMAP GENERATOR + INDEXNOW — Spec Item 44
// Dynamic XML sitemap + IndexNow ping for instant indexing
// ═══════════════════════════════════════════════════════════════════════════
// GET /api/sitemap          → XML sitemap
// POST /api/sitemap         → Trigger IndexNow ping for recent changes
// GET /api/sitemap?format=index → Sitemap index (for large catalogs)
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SITE_URL = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://medazonhealth.com';
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || '';

// ═══════════════════════════════════════════════════════════════════════════
// GET — XML Sitemap
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');

    if (format === 'index') {
      return buildSitemapIndex();
    }

    return buildSitemap();
  } catch (err) {
    console.error('[Sitemap] Error:', err);
    return new NextResponse('Internal error', { status: 500 });
  }
}

async function buildSitemap(): Promise<NextResponse> {
  // Fetch products
  const { data: products } = await supabase
    .from('products')
    .select('handle, asin, updated_at, image_url, title, retail_price')
    .eq('status', 'active')
    .not('handle', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(5000);

  // Fetch landing pages
  const { data: landingPages } = await supabase
    .from('seo_metadata')
    .select('page_handle, updated_at')
    .eq('page_type', 'landing_page')
    .limit(500);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
`;

  // Homepage
  xml += urlEntry(SITE_URL, new Date().toISOString(), '1.0', 'daily');

  // Static pages
  const staticPages = ['/collections/all', '/pages/about', '/pages/contact', '/pages/shipping'];
  for (const page of staticPages) {
    xml += urlEntry(`${SITE_URL}${page}`, new Date().toISOString(), '0.6', 'weekly');
  }

  // Product pages
  if (products) {
    for (const product of products) {
      const url = `${SITE_URL}/products/${product.handle}`;
      const lastmod = product.updated_at || new Date().toISOString();
      xml += urlEntry(url, lastmod, '0.8', 'daily', product.image_url, product.title);
    }
  }

  // Landing pages (SEO pages)
  if (landingPages) {
    for (const page of landingPages) {
      const url = `${SITE_URL}/pages/${page.page_handle}`;
      const lastmod = page.updated_at || new Date().toISOString();
      xml += urlEntry(url, lastmod, '0.7', 'weekly');
    }
  }

  xml += `</urlset>`;

  const totalUrls = 1 + staticPages.length + (products?.length || 0) + (landingPages?.length || 0);

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800',
      'X-Sitemap-Count': totalUrls.toString(),
    },
  });
}

async function buildSitemapIndex(): Promise<NextResponse> {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${SITE_URL}/api/sitemap</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITE_URL}/api/feed/google-shopping</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
  </sitemap>
</sitemapindex>`;

  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// POST — IndexNow Ping
// Notifies Bing/Yandex of recently updated URLs
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  if (!INDEXNOW_KEY) {
    return NextResponse.json({ error: 'INDEXNOW_KEY not configured' }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const hoursBack = body.hoursBack || 24;

    // Get recently updated products
    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

    const { data: recentProducts } = await supabase
      .from('products')
      .select('handle')
      .eq('status', 'active')
      .gte('updated_at', cutoff)
      .not('handle', 'is', null)
      .limit(100);

    const { data: recentPages } = await supabase
      .from('seo_metadata')
      .select('page_handle')
      .eq('page_type', 'landing_page')
      .gte('updated_at', cutoff)
      .limit(50);

    const urls: string[] = [];
    if (recentProducts) {
      urls.push(...recentProducts.map(p => `${SITE_URL}/products/${p.handle}`));
    }
    if (recentPages) {
      urls.push(...recentPages.map(p => `${SITE_URL}/pages/${p.page_handle}`));
    }

    if (urls.length === 0) {
      return NextResponse.json({ success: true, message: 'No recent changes to ping', pinged: 0 });
    }

    // Ping IndexNow
    const indexNowPayload = {
      host: new URL(SITE_URL).hostname,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
      urlList: urls,
    };

    const pingRes = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(indexNowPayload),
    });

    const success = pingRes.ok || pingRes.status === 202;

    console.log(`[IndexNow] Pinged ${urls.length} URLs — status ${pingRes.status}`);

    return NextResponse.json({
      success,
      pinged: urls.length,
      status: pingRes.status,
      message: success ? `Submitted ${urls.length} URLs to IndexNow` : `IndexNow returned ${pingRes.status}`,
    });
  } catch (err) {
    console.error('[IndexNow] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function urlEntry(
  loc: string,
  lastmod: string,
  priority: string,
  changefreq: string,
  imageUrl?: string | null,
  imageTitle?: string | null
): string {
  let entry = `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod.split('T')[0]}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
`;
  if (imageUrl) {
    entry += `    <image:image>
      <image:loc>${escapeXml(imageUrl)}</image:loc>
${imageTitle ? `      <image:title>${escapeXml(imageTitle)}</image:title>\n` : ''}    </image:image>
`;
  }
  entry += `  </url>\n`;
  return entry;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
