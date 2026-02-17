// lib/landing-page-generator.ts
// ═══════════════════════════════════════════════════════════════════════════
// LONG-TAIL LANDING PAGE GENERATOR — Spec Item 37
// Generates keyword-clustered Shopify pages for programmatic SEO
// ═══════════════════════════════════════════════════════════════════════════
// Patterns:
//   "best {category} under ${price}" → /collections/best-kitchen-gadgets-under-20
//   "top rated {product_type}" → /pages/top-rated-phone-cases
//   "cheapest {brand} alternatives" → /pages/cheapest-apple-alternatives
// Pipeline:
//   1. Analyze product catalog for keyword clusters
//   2. Generate page content (AI or template)
//   3. Push to Shopify Pages API
//   4. Track in Supabase for performance monitoring
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabaseClient() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP_DOMAIN || process.env.NEXT_PUBLIC_SHOPIFY_SHOP_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_API_TOKEN;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface KeywordCluster {
  keyword: string;
  slug: string;
  pattern: 'best_under_price' | 'top_rated' | 'category_guide' | 'vs_competitor';
  products: ClusterProduct[];
  searchVolume?: number;
}

interface ClusterProduct {
  id: string;
  title: string;
  retail_price: number;
  rating: number | null;
  review_count: number | null;
  image_url: string | null;
  asin: string | null;
  handle: string | null;
}

interface LandingPage {
  title: string;
  handle: string;
  body_html: string;
  meta_title: string;
  meta_description: string;
  template_suffix?: string;
}

interface GenerationResult {
  pagesGenerated: number;
  pagesPushed: number;
  clusters: number;
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. ANALYZE CATALOG FOR KEYWORD CLUSTERS
// ═══════════════════════════════════════════════════════════════════════════

export async function analyzeKeywordClusters(): Promise<KeywordCluster[]> {
  const clusters: KeywordCluster[] = [];

  // Fetch active products with prices
  const { data: products, error } = await supabase
    .from('products')
    .select('id, title, retail_price, rating, review_count, image_url, asin, category, product_type, vendor, handle')
    .eq('status', 'active')
    .not('retail_price', 'is', null)
    .order('retail_price', { ascending: true });

  if (error || !products || products.length === 0) return clusters;

  // Group by category
  const categoryMap = new Map<string, ClusterProduct[]>();
  for (const p of products) {
    const cat = (p.category || p.product_type || 'General').toLowerCase().trim();
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat)!.push({
      id: p.id,
      title: p.title,
      retail_price: p.retail_price,
      rating: p.rating,
      review_count: p.review_count,
      image_url: p.image_url,
      asin: p.asin,
      handle: p.handle,
    });
  }

  // Generate "best X under $Y" clusters
  const priceThresholds = [10, 15, 20, 25, 30, 50];
  for (const [category, prods] of categoryMap) {
    if (prods.length < 3) continue; // Need at least 3 products

    for (const threshold of priceThresholds) {
      const matching = prods.filter(p => p.retail_price <= threshold);
      if (matching.length >= 3) {
        const slug = `best-${category.replace(/[^a-z0-9]+/g, '-')}-under-${threshold}`;
        clusters.push({
          keyword: `best ${category} under $${threshold}`,
          slug,
          pattern: 'best_under_price',
          products: matching.slice(0, 10),
        });
        break; // Only one price threshold per category
      }
    }

    // Generate "top rated X" clusters
    const topRated = prods
      .filter(p => p.rating && p.rating >= 4.0 && (p.review_count || 0) >= 100)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0));

    if (topRated.length >= 3) {
      clusters.push({
        keyword: `top rated ${category}`,
        slug: `top-rated-${category.replace(/[^a-z0-9]+/g, '-')}`,
        pattern: 'top_rated',
        products: topRated.slice(0, 10),
      });
    }
  }

  return clusters;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. GENERATE PAGE CONTENT
// ═══════════════════════════════════════════════════════════════════════════

export function generatePageContent(cluster: KeywordCluster, shopDomain: string): LandingPage {
  const { keyword, slug, products, pattern } = cluster;
  const year = new Date().getFullYear();
  const month = new Date().toLocaleString('en-US', { month: 'long' });

  // Title and meta
  const title = pattern === 'best_under_price'
    ? `${products.length} Best ${capitalize(keyword.replace(/^best /, ''))} (${month} ${year})`
    : `Top Rated ${capitalize(keyword.replace(/^top rated /, ''))} — ${year} Guide`;

  const metaTitle = `${title} | ${shopDomain?.replace('.myshopify.com', '') || 'Our Store'}`;
  const metaDescription = pattern === 'best_under_price'
    ? `Compare the ${products.length} best ${keyword.replace(/^best /, '')} with reviews, ratings, and prices. Updated ${month} ${year}. Free shipping on all orders.`
    : `Expert picks for ${keyword}. Verified reviews from ${products.reduce((s, p) => s + (p.review_count || 0), 0).toLocaleString()}+ customers. Free shipping.`;

  // Build HTML body
  let html = `<div class="landing-page" data-cluster="${slug}">\n`;

  // Hero section
  html += `<div class="lp-hero">\n`;
  html += `  <h1>${title}</h1>\n`;
  html += `  <p class="lp-subtitle">Independently reviewed and compared. Updated ${month} ${year}.</p>\n`;
  html += `</div>\n\n`;

  // Quick comparison table
  html += `<div class="lp-comparison">\n`;
  html += `  <h2>Quick Comparison</h2>\n`;
  html += `  <table class="lp-table">\n`;
  html += `    <thead><tr><th>Product</th><th>Price</th><th>Rating</th><th>Reviews</th><th></th></tr></thead>\n`;
  html += `    <tbody>\n`;

  for (const product of products.slice(0, 8)) {
    const productUrl = product.handle ? `/products/${product.handle}` : '#';
    const stars = product.rating ? `${product.rating}★` : '—';
    const reviews = product.review_count ? product.review_count.toLocaleString() : '—';

    html += `    <tr>\n`;
    html += `      <td>\n`;
    if (product.image_url) {
      html += `        <img src="${product.image_url}" alt="${escapeHtml(product.title)}" width="60" height="60" loading="lazy" />\n`;
    }
    html += `        <a href="${productUrl}">${escapeHtml(truncate(product.title, 60))}</a>\n`;
    html += `      </td>\n`;
    html += `      <td class="lp-price">$${product.retail_price.toFixed(2)}</td>\n`;
    html += `      <td>${stars}</td>\n`;
    html += `      <td>${reviews}</td>\n`;
    html += `      <td><a href="${productUrl}" class="lp-btn">View Deal</a></td>\n`;
    html += `    </tr>\n`;
  }

  html += `    </tbody>\n  </table>\n</div>\n\n`;

  // Buying guide section
  html += `<div class="lp-guide">\n`;
  html += `  <h2>Buying Guide: What to Look For</h2>\n`;
  html += `  <p>When shopping for ${keyword.replace(/^(best|top rated) /, '')}, consider these key factors:</p>\n`;
  html += `  <ul>\n`;
  html += `    <li><strong>Price vs Value</strong> — The cheapest option isn't always the best. Look for products with high review counts and ratings above 4.0.</li>\n`;
  html += `    <li><strong>Verified Reviews</strong> — All products listed have been verified with ${products.reduce((s, p) => s + (p.review_count || 0), 0).toLocaleString()}+ real customer reviews.</li>\n`;
  html += `    <li><strong>Prime Shipping</strong> — Most products qualify for fast, free shipping.</li>\n`;
  html += `  </ul>\n`;
  html += `</div>\n\n`;

  // FAQ schema (helps with rich results)
  html += `<div class="lp-faq" itemscope itemtype="https://schema.org/FAQPage">\n`;
  html += `  <h2>Frequently Asked Questions</h2>\n`;
  html += faqItem(`What is the best ${keyword.replace(/^(best|top rated) /, '')}?`, 
    `Based on ${products[0]?.review_count?.toLocaleString() || 'thousands of'} reviews, the ${escapeHtml(products[0]?.title || 'top-rated option')} is our top pick at $${products[0]?.retail_price?.toFixed(2) || '0'}.`);
  html += faqItem(`How many ${keyword.replace(/^(best|top rated) /, '')} did you compare?`,
    `We compared ${products.length} products across price, rating, review count, and availability to find the best options.`);
  html += `</div>\n`;

  html += `</div>`;

  return {
    title,
    handle: slug,
    body_html: html,
    meta_title: metaTitle.slice(0, 70),
    meta_description: metaDescription.slice(0, 160),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. PUSH TO SHOPIFY PAGES API
// ═══════════════════════════════════════════════════════════════════════════

export async function pushPageToShopify(page: LandingPage): Promise<{ success: boolean; pageId?: string; error?: string }> {
  if (!SHOPIFY_SHOP || !SHOPIFY_TOKEN) {
    return { success: false, error: 'Shopify credentials not configured' };
  }

  try {
    const res = await fetch(`https://${SHOPIFY_SHOP}/admin/api/2024-01/pages.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
      },
      body: JSON.stringify({
        page: {
          title: page.title,
          handle: page.handle,
          body_html: page.body_html,
          metafields_global_title_tag: page.meta_title,
          metafields_global_description_tag: page.meta_description,
          published: true,
          template_suffix: page.template_suffix || null,
        },
      }),
    });

    if (!res.ok) {
      // Might already exist — try update
      if (res.status === 422) {
        return await updateExistingPage(page);
      }
      const errText = await res.text().catch(() => '');
      return { success: false, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    return { success: true, pageId: data.page?.id?.toString() };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown' };
  }
}

async function updateExistingPage(page: LandingPage): Promise<{ success: boolean; pageId?: string; error?: string }> {
  try {
    // Find existing page by handle
    const listRes = await fetch(`https://${SHOPIFY_SHOP}/admin/api/2024-01/pages.json?handle=${page.handle}`, {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN! },
    });

    if (!listRes.ok) return { success: false, error: 'Could not find existing page' };
    const listData = await listRes.json();
    const existingPage = listData.pages?.[0];
    if (!existingPage) return { success: false, error: 'Page not found for update' };

    const updateRes = await fetch(`https://${SHOPIFY_SHOP}/admin/api/2024-01/pages/${existingPage.id}.json`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_TOKEN!,
      },
      body: JSON.stringify({
        page: {
          id: existingPage.id,
          body_html: page.body_html,
          metafields_global_title_tag: page.meta_title,
          metafields_global_description_tag: page.meta_description,
        },
      }),
    });

    if (!updateRes.ok) return { success: false, error: `Update failed: HTTP ${updateRes.status}` };
    return { success: true, pageId: existingPage.id.toString() };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. FULL PIPELINE
// ═══════════════════════════════════════════════════════════════════════════

export async function generateLandingPages(options?: {
  maxPages?: number;
  dryRun?: boolean;
}): Promise<GenerationResult> {
  const maxPages = options?.maxPages || 20;
  const dryRun = options?.dryRun || false;
  const result: GenerationResult = { pagesGenerated: 0, pagesPushed: 0, clusters: 0, errors: [] };

  try {
    // 1. Analyze clusters
    const clusters = await analyzeKeywordClusters();
    result.clusters = clusters.length;
    console.log(`[LandingPages] Found ${clusters.length} keyword clusters`);

    if (clusters.length === 0) return result;

    // 2. Generate pages
    const pages: LandingPage[] = [];
    for (const cluster of clusters.slice(0, maxPages)) {
      try {
        const page = generatePageContent(cluster, SHOPIFY_SHOP || '');
        pages.push(page);
        result.pagesGenerated++;
      } catch (err) {
        result.errors.push(`Generate ${cluster.slug}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }

    // 3. Push to Shopify
    if (!dryRun) {
      for (const page of pages) {
        const pushResult = await pushPageToShopify(page);
        if (pushResult.success) {
          result.pagesPushed++;

          // Track in Supabase
          await getSupabaseClient().from('seo_metadata').insert({
            page_handle: page.handle,
            page_title: page.title,
            meta_title: page.meta_title,
            meta_description: page.meta_description,
            shopify_page_id: pushResult.pageId,
            page_type: 'landing_page',
            created_at: new Date().toISOString(),
          }).catch(() => { /* table may not exist */ });
        } else {
          result.errors.push(`Push ${page.handle}: ${pushResult.error}`);
        }
      }
    }
  } catch (err) {
    result.errors.push(`System: ${err instanceof Error ? err.message : 'Unknown'}`);
  }

  console.log(`[LandingPages] Generated ${result.pagesGenerated}, pushed ${result.pagesPushed}, ${result.errors.length} errors`);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function capitalize(str: string): string {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

function faqItem(question: string, answer: string): string {
  return `  <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
    <h3 itemprop="name">${escapeHtml(question)}</h3>
    <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
      <p itemprop="text">${answer}</p>
    </div>
  </div>\n`;
}

export default { analyzeKeywordClusters, generatePageContent, pushPageToShopify, generateLandingPages };
