// lib/programmatic-seo-engine.ts
// ═══════════════════════════════════════════════════════════════════════════
// PROGRAMMATIC SEO ENGINE — Spec Item 42
// Orchestrates automated SEO content generation at scale
// ═══════════════════════════════════════════════════════════════════════════
// Pipeline:
//   1. Identify high-value keyword clusters from product catalog
//   2. Generate landing pages with comparison tables + buying guides
//   3. Build internal linking between product pages and landing pages
//   4. Generate/update SEO metadata (title, description, OG tags)
//   5. Track page performance metrics
//   6. Refresh stale pages automatically
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { analyzeKeywordClusters, generatePageContent, pushPageToShopify } from './landing-page-generator';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface SEOPageRecord {
  id?: string;
  page_handle: string;
  page_title: string;
  meta_title: string;
  meta_description: string;
  shopify_page_id: string | null;
  page_type: 'landing_page' | 'category_page' | 'comparison_page' | 'guide_page';
  keyword_target: string;
  product_count: number;
  last_generated_at: string;
  performance_score: number | null;
  impressions_30d: number | null;
  clicks_30d: number | null;
  status: 'active' | 'stale' | 'draft' | 'disabled';
}

interface SEOCycleResult {
  pagesAnalyzed: number;
  pagesGenerated: number;
  pagesRefreshed: number;
  pagesPushed: number;
  internalLinksCreated: number;
  errors: string[];
  duration_ms: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. SEO METADATA GENERATOR
// Generate optimized title tags and meta descriptions for all products
// ═══════════════════════════════════════════════════════════════════════════

export async function generateProductSEOMetadata(): Promise<{
  updated: number;
  errors: string[];
}> {
  let updated = 0;
  const errors: string[] = [];

  try {
    const { data: products } = await supabase
      .from('products')
      .select('id, title, category, product_type, retail_price, vendor, rating, review_count, asin')
      .eq('status', 'active')
      .not('title', 'is', null);

    if (!products || products.length === 0) return { updated, errors };

    for (const product of products) {
      try {
        const price = product.retail_price ? `$${product.retail_price.toFixed(2)}` : '';
        const rating = product.rating ? `${product.rating}★` : '';
        const reviews = product.review_count ? `${product.review_count.toLocaleString()} reviews` : '';

        // SEO title: "Product Name | Category | $Price - Free Shipping"
        const seoTitle = [
          product.title.slice(0, 55),
          price,
          'Free Shipping',
        ].filter(Boolean).join(' | ').slice(0, 70);

        // Meta description: compelling with keywords, price, reviews
        const seoDescription = [
          `Shop ${product.title.slice(0, 60)}`,
          price ? `for just ${price}` : null,
          rating ? `Rated ${rating}` : null,
          reviews ? `with ${reviews}` : null,
          'Free shipping on all orders. Compare prices and save.',
        ].filter(Boolean).join('. ').slice(0, 160);

        await supabase.from('seo_metadata').upsert({
          product_id: product.id,
          page_type: 'product',
          page_handle: `product-${(product.asin || product.id).toLowerCase()}`,
          page_title: product.title,
          meta_title: seoTitle,
          meta_description: seoDescription,
          keyword_target: `${product.category || product.product_type || ''} ${product.vendor || ''}`.trim(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'product_id' }).then(({ error: upsertErr }) => {
          if (upsertErr) errors.push(`SEO ${product.id}: ${upsertErr.message}`);
          else updated++;
        });
      } catch (err) {
        errors.push(`SEO ${product.id}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }
  } catch (err) {
    errors.push(`SEO system: ${err instanceof Error ? err.message : 'Unknown'}`);
  }

  return { updated, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. INTERNAL LINKING GENERATOR
// Create links between related product pages and landing pages
// ═══════════════════════════════════════════════════════════════════════════

export function generateInternalLinks(products: Array<{
  handle: string;
  title: string;
  category: string | null;
  retail_price: number | null;
}>, landingPageHandles: string[]): Map<string, string[]> {
  const links = new Map<string, string[]>();

  for (const product of products) {
    const productLinks: string[] = [];
    const cat = (product.category || '').toLowerCase();

    // Link to relevant landing pages
    for (const handle of landingPageHandles) {
      if (handle.includes(cat.replace(/[^a-z0-9]+/g, '-'))) {
        productLinks.push(`/pages/${handle}`);
      }
    }

    // Link to same-category products (max 4)
    const sameCategory = products
      .filter(p => p.handle !== product.handle && p.category === product.category)
      .slice(0, 4);
    for (const related of sameCategory) {
      productLinks.push(`/products/${related.handle}`);
    }

    if (productLinks.length > 0) {
      links.set(product.handle, productLinks);
    }
  }

  return links;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. STALE PAGE REFRESHER
// Re-generate pages not updated in 14+ days
// ═══════════════════════════════════════════════════════════════════════════

export async function refreshStalePages(): Promise<{
  refreshed: number;
  errors: string[];
}> {
  let refreshed = 0;
  const errors: string[] = [];

  try {
    const staleCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data: stalePages } = await supabase
      .from('seo_metadata')
      .select('id, page_handle, keyword_target, shopify_page_id')
      .eq('page_type', 'landing_page')
      .lt('updated_at', staleCutoff)
      .limit(10);

    if (!stalePages || stalePages.length === 0) return { refreshed, errors };

    console.log(`[SEO Engine] Found ${stalePages.length} stale pages to refresh`);

    // Re-analyze clusters and regenerate
    const clusters = await analyzeKeywordClusters();
    const SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN || '';

    for (const stalePage of stalePages) {
      const matchingCluster = clusters.find(c => c.slug === stalePage.page_handle);
      if (matchingCluster) {
        const page = generatePageContent(matchingCluster, SHOP_DOMAIN);
        const pushResult = await pushPageToShopify(page);

        if (pushResult.success) {
          await supabase
            .from('seo_metadata')
            .update({ updated_at: new Date().toISOString(), status: 'active' })
            .eq('id', stalePage.id);
          refreshed++;
        } else {
          errors.push(`Refresh ${stalePage.page_handle}: ${pushResult.error}`);
        }
      }
    }
  } catch (err) {
    errors.push(`Refresh system: ${err instanceof Error ? err.message : 'Unknown'}`);
  }

  return { refreshed, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. FULL SEO CYCLE (called by cron)
// ═══════════════════════════════════════════════════════════════════════════

export async function executeSEOCycle(): Promise<SEOCycleResult> {
  const startTime = Date.now();
  const result: SEOCycleResult = {
    pagesAnalyzed: 0, pagesGenerated: 0, pagesRefreshed: 0,
    pagesPushed: 0, internalLinksCreated: 0, errors: [], duration_ms: 0,
  };

  try {
    console.log('[SEO Engine] Starting programmatic SEO cycle');

    // 1. Generate product SEO metadata
    const seoResult = await generateProductSEOMetadata();
    result.pagesAnalyzed = seoResult.updated;
    result.errors.push(...seoResult.errors);

    // 2. Generate landing pages for keyword clusters
    const { generateLandingPages } = await import('./landing-page-generator');
    const landingResult = await generateLandingPages({ maxPages: 15 });
    result.pagesGenerated = landingResult.pagesGenerated;
    result.pagesPushed = landingResult.pagesPushed;
    result.errors.push(...landingResult.errors);

    // 3. Refresh stale pages
    const refreshResult = await refreshStalePages();
    result.pagesRefreshed = refreshResult.refreshed;
    result.errors.push(...refreshResult.errors);

    // 4. Generate internal link map
    const { data: products } = await supabase
      .from('products')
      .select('handle, title, category, retail_price')
      .eq('status', 'active');

    const { data: landingPages } = await supabase
      .from('seo_metadata')
      .select('page_handle')
      .eq('page_type', 'landing_page');

    if (products && landingPages) {
      const landingHandles = landingPages.map(p => p.page_handle);
      const links = generateInternalLinks(products, landingHandles);
      result.internalLinksCreated = links.size;
    }

  } catch (err) {
    result.errors.push(`SEO cycle: ${err instanceof Error ? err.message : 'Unknown'}`);
  }

  result.duration_ms = Date.now() - startTime;
  console.log(`[SEO Engine] Cycle complete: ${result.pagesGenerated} generated, ${result.pagesRefreshed} refreshed, ${result.pagesPushed} pushed (${result.duration_ms}ms)`);
  return result;
}

export default {
  generateProductSEOMetadata,
  generateInternalLinks,
  refreshStalePages,
  executeSEOCycle,
};
