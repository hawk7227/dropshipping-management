// lib/price-sync.ts
// Fetches real competitor prices from Rainforest API and writes to Shopify's compare_at_price
// Works alongside NA Bulk Price Editor - both use the same native Shopify field

import { getShopifyProducts, updateShopifyProducts, updateMetafields } from './shopify-admin';

const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY!;
const RAINFOREST_BASE_URL = 'https://api.rainforestapi.com/request';

interface CompetitorPrice {
  source: 'amazon' | 'walmart' | 'ebay' | 'target';
  price: number;
  url?: string;
  in_stock: boolean;
  last_checked: string;
}

interface PriceSyncResult {
  product_id: string;
  variant_id: string;
  title: string;
  current_price: number;
  old_compare_at: number;
  new_compare_at: number;
  competitor_source: string;
  savings_percent: number;
  status: 'updated' | 'skipped' | 'error';
  reason?: string;
}

/**
 * Fetch Amazon price by ASIN or search term
 */
async function fetchAmazonPrice(params: { asin?: string; search?: string }): Promise<CompetitorPrice | null> {
  try {
    const queryParams = new URLSearchParams({
      api_key: RAINFOREST_API_KEY,
      amazon_domain: 'amazon.com',
    });

    if (params.asin) {
      queryParams.set('type', 'product');
      queryParams.set('asin', params.asin);
    } else if (params.search) {
      queryParams.set('type', 'search');
      queryParams.set('search_term', params.search);
    } else {
      return null;
    }

    const response = await fetch(`${RAINFOREST_BASE_URL}?${queryParams}`);
    const data = await response.json();

    // Handle product lookup by ASIN
    if (params.asin && data.product?.buybox_winner?.price?.value) {
      return {
        source: 'amazon',
        price: data.product.buybox_winner.price.value,
        url: data.product.link,
        in_stock: data.product.buybox_winner.availability?.type === 'in_stock',
        last_checked: new Date().toISOString()
      };
    }

    // Handle search results
    if (data.search_results?.length > 0) {
      const top = data.search_results[0];
      if (top.price?.value) {
        return {
          source: 'amazon',
          price: top.price.value,
          url: top.link,
          in_stock: top.availability?.raw !== 'Currently unavailable',
          last_checked: new Date().toISOString()
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Amazon fetch error:', error);
    return null;
  }
}

/**
 * Fetch Walmart price by search
 */
async function fetchWalmartPrice(searchTerm: string): Promise<CompetitorPrice | null> {
  try {
    const params = new URLSearchParams({
      api_key: RAINFOREST_API_KEY,
      type: 'search',
      source: 'walmart',
      search_term: searchTerm
    });

    const response = await fetch(`${RAINFOREST_BASE_URL}?${params}`);
    const data = await response.json();

    if (data.search_results?.length > 0) {
      const top = data.search_results[0];
      if (top.price?.value) {
        return {
          source: 'walmart',
          price: top.price.value,
          url: top.link,
          in_stock: true,
          last_checked: new Date().toISOString()
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Walmart fetch error:', error);
    return null;
  }
}

/**
 * Fetch eBay price by search
 */
async function fetchEbayPrice(searchTerm: string): Promise<CompetitorPrice | null> {
  try {
    const params = new URLSearchParams({
      api_key: RAINFOREST_API_KEY,
      type: 'search',
      source: 'ebay',
      search_term: searchTerm,
      ebay_domain: 'ebay.com'
    });

    const response = await fetch(`${RAINFOREST_BASE_URL}?${params}`);
    const data = await response.json();

    // Get average of Buy It Now prices
    const buyItNow = data.search_results?.filter(
      (item: any) => item.listing_type === 'buy_it_now' && item.price?.value
    );

    if (buyItNow?.length > 0) {
      const avgPrice = buyItNow.reduce((sum: number, item: any) => sum + item.price.value, 0) / buyItNow.length;
      return {
        source: 'ebay',
        price: Math.round(avgPrice * 100) / 100,
        url: buyItNow[0].link,
        in_stock: true,
        last_checked: new Date().toISOString()
      };
    }

    return null;
  } catch (error) {
    console.error('eBay fetch error:', error);
    return null;
  }
}

/**
 * Fetch competitor prices for a product
 */
export async function fetchCompetitorPrices(
  product: any,
  sources: ('amazon' | 'walmart' | 'ebay')[] = ['amazon']
): Promise<CompetitorPrice[]> {
  const prices: CompetitorPrice[] = [];
  
  // Clean search term from product title
  const searchTerm = product.title
    .replace(/[^\w\s-]/g, '')
    .substring(0, 80);

  // Check for ASIN in metafields or tags
  const asin = product.metafields?.competitor?.asin || 
               product.tags?.find((t: string) => t.startsWith('asin:'))?.replace('asin:', '');

  const fetchPromises: Promise<CompetitorPrice | null>[] = [];

  if (sources.includes('amazon')) {
    fetchPromises.push(
      asin ? fetchAmazonPrice({ asin }) : fetchAmazonPrice({ search: searchTerm })
    );
  }
  if (sources.includes('walmart')) {
    fetchPromises.push(fetchWalmartPrice(searchTerm));
  }
  if (sources.includes('ebay')) {
    fetchPromises.push(fetchEbayPrice(searchTerm));
  }

  const results = await Promise.all(fetchPromises);
  
  for (const result of results) {
    if (result && result.price > 0) {
      prices.push(result);
    }
  }

  return prices;
}

/**
 * Main sync function - fetches competitor prices and writes to compare_at_price
 * 
 * @param options.products - Array of products or 'all'
 * @param options.sources - Which competitors to check
 * @param options.strategy - How to pick the competitor price
 * @param options.minMarkup - Minimum markup % your price should be below competitor
 * @param options.dryRun - Preview without updating
 */
export async function syncCompetitorPrices(options: {
  products?: any[] | 'all';
  sources?: ('amazon' | 'walmart' | 'ebay')[];
  strategy?: 'amazon' | 'lowest' | 'highest';
  minMarkup?: number;
  dryRun?: boolean;
}): Promise<{
  total: number;
  updated: number;
  skipped: number;
  errors: number;
  results: PriceSyncResult[];
}> {
  const {
    products = 'all',
    sources = ['amazon'],
    strategy = 'amazon',
    minMarkup = 10,
    dryRun = false
  } = options;

  // Get products
  let productList: any[];
  if (products === 'all') {
    productList = await getShopifyProducts();
  } else {
    productList = products;
  }

  const results: PriceSyncResult[] = [];
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const product of productList) {
    try {
      // Fetch competitor prices
      const competitorPrices = await fetchCompetitorPrices(product, sources);

      if (competitorPrices.length === 0) {
        results.push({
          product_id: product.id,
          variant_id: product.variants[0]?.id,
          title: product.title,
          current_price: parseFloat(product.variants[0]?.price || '0'),
          old_compare_at: parseFloat(product.variants[0]?.compare_at_price || '0'),
          new_compare_at: 0,
          competitor_source: 'none',
          savings_percent: 0,
          status: 'skipped',
          reason: 'No competitor prices found'
        });
        skipped++;
        continue;
      }

      // Pick competitor price based on strategy
      let selectedPrice: CompetitorPrice;
      
      if (strategy === 'amazon') {
        const amazonPrice = competitorPrices.find(p => p.source === 'amazon');
        selectedPrice = amazonPrice || competitorPrices[0];
      } else if (strategy === 'lowest') {
        selectedPrice = competitorPrices.reduce((min, p) => p.price < min.price ? p : min);
      } else {
        selectedPrice = competitorPrices.reduce((max, p) => p.price > max.price ? p : max);
      }

      // Process each variant
      for (const variant of product.variants) {
        const currentPrice = parseFloat(variant.price);
        const oldCompareAt = parseFloat(variant.compare_at_price || '0');
        const newCompareAt = selectedPrice.price;

        // Calculate savings
        const savingsPercent = newCompareAt > currentPrice 
          ? Math.round(((newCompareAt - currentPrice) / newCompareAt) * 100)
          : 0;

        // Skip if competitor price is lower than our price (we're not cheapest)
        if (newCompareAt <= currentPrice) {
          results.push({
            product_id: product.id,
            variant_id: variant.id,
            title: product.title,
            current_price: currentPrice,
            old_compare_at: oldCompareAt,
            new_compare_at: newCompareAt,
            competitor_source: selectedPrice.source,
            savings_percent: 0,
            status: 'skipped',
            reason: `Competitor price ($${newCompareAt}) <= our price ($${currentPrice})`
          });
          skipped++;
          continue;
        }

        // Skip if savings less than minimum markup
        if (savingsPercent < minMarkup) {
          results.push({
            product_id: product.id,
            variant_id: variant.id,
            title: product.title,
            current_price: currentPrice,
            old_compare_at: oldCompareAt,
            new_compare_at: newCompareAt,
            competitor_source: selectedPrice.source,
            savings_percent: savingsPercent,
            status: 'skipped',
            reason: `Savings ${savingsPercent}% < minimum ${minMarkup}%`
          });
          skipped++;
          continue;
        }

        // Skip if no change needed
        if (Math.abs(newCompareAt - oldCompareAt) < 0.01) {
          results.push({
            product_id: product.id,
            variant_id: variant.id,
            title: product.title,
            current_price: currentPrice,
            old_compare_at: oldCompareAt,
            new_compare_at: newCompareAt,
            competitor_source: selectedPrice.source,
            savings_percent: savingsPercent,
            status: 'skipped',
            reason: 'Price already set'
          });
          skipped++;
          continue;
        }

        // Update Shopify if not dry run
        if (!dryRun) {
          // Update variant compare_at_price
          await updateShopifyProducts([{
            id: product.id,
            variants: [{
              id: variant.id,
              compare_at_price: newCompareAt.toFixed(2)
            }]
          }]);

          // Update competitor source metafield
          await updateMetafields(product.id, [
            {
              namespace: 'competitor',
              key: 'source',
              value: selectedPrice.source.charAt(0).toUpperCase() + selectedPrice.source.slice(1),
              type: 'single_line_text_field'
            },
            {
              namespace: 'competitor',
              key: 'last_checked',
              value: selectedPrice.last_checked,
              type: 'single_line_text_field'
            }
          ]);
        }

        results.push({
          product_id: product.id,
          variant_id: variant.id,
          title: product.title,
          current_price: currentPrice,
          old_compare_at: oldCompareAt,
          new_compare_at: newCompareAt,
          competitor_source: selectedPrice.source,
          savings_percent: savingsPercent,
          status: 'updated'
        });
        updated++;
      }

      // Rate limiting - Rainforest has limits
      await new Promise(resolve => setTimeout(resolve, 600));

    } catch (error: any) {
      results.push({
        product_id: product.id,
        variant_id: product.variants[0]?.id,
        title: product.title,
        current_price: 0,
        old_compare_at: 0,
        new_compare_at: 0,
        competitor_source: 'error',
        savings_percent: 0,
        status: 'error',
        reason: error.message
      });
      errors++;
    }
  }

  return {
    total: productList.length,
    updated,
    skipped,
    errors,
    results
  };
}

/**
 * Quick sync for specific products by ID
 */
export async function syncProductPrices(productIds: string[], sources?: ('amazon' | 'walmart' | 'ebay')[]) {
  const products = await getShopifyProducts();
  const filtered = products.filter(p => productIds.includes(p.id.toString()));
  
  return syncCompetitorPrices({
    products: filtered,
    sources,
    dryRun: false
  });
}

/**
 * Schedule daily price sync (call from cron)
 */
export async function scheduledPriceSync() {
  console.log('Starting scheduled price sync...');
  
  const result = await syncCompetitorPrices({
    products: 'all',
    sources: ['amazon'],
    strategy: 'amazon',
    minMarkup: 10,
    dryRun: false
  });

  console.log(`Price sync complete: ${result.updated} updated, ${result.skipped} skipped, ${result.errors} errors`);
  
  return result;
}
