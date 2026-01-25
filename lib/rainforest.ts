// lib/rainforest.ts
// Rainforest API integration for fetching competitor prices from Amazon, Walmart, etc.

const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY!;
const RAINFOREST_BASE_URL = 'https://api.rainforestapi.com/request';

interface CompetitorPrice {
  source: string;
  price: number;
  currency: string;
  url: string;
  in_stock: boolean;
  last_updated: string;
}

interface PriceResult {
  product_id: string;
  asin?: string;
  prices: CompetitorPrice[];
  lowest_price: CompetitorPrice | null;
}

/**
 * Fetch Amazon price by ASIN
 */
async function fetchAmazonPrice(asin: string): Promise<CompetitorPrice | null> {
  try {
    const params = new URLSearchParams({
      api_key: RAINFOREST_API_KEY,
      type: 'product',
      amazon_domain: 'amazon.com',
      asin: asin
    });

    const response = await fetch(`${RAINFOREST_BASE_URL}?${params}`);
    const data = await response.json();

    if (data.product && data.product.buybox_winner) {
      return {
        source: 'amazon',
        price: data.product.buybox_winner.price?.value || 0,
        currency: data.product.buybox_winner.price?.currency || 'USD',
        url: data.product.link,
        in_stock: data.product.buybox_winner.availability?.type === 'in_stock',
        last_updated: new Date().toISOString()
      };
    }

    return null;
  } catch (error: any) {
    console.error(`Amazon price fetch error for ${asin}:`, error);
    return null;
  }
}

/**
 * Search Amazon for product and get price
 */
async function searchAmazonPrice(searchTerm: string): Promise<CompetitorPrice | null> {
  try {
    const params = new URLSearchParams({
      api_key: RAINFOREST_API_KEY,
      type: 'search',
      amazon_domain: 'amazon.com',
      search_term: searchTerm
    });

    const response = await fetch(`${RAINFOREST_BASE_URL}?${params}`);
    const data = await response.json();

    if (data.search_results && data.search_results.length > 0) {
      const topResult = data.search_results[0];
      return {
        source: 'amazon',
        price: topResult.price?.value || 0,
        currency: topResult.price?.currency || 'USD',
        url: topResult.link,
        in_stock: topResult.availability?.raw !== 'Currently unavailable',
        last_updated: new Date().toISOString()
      };
    }

    return null;
  } catch (error: any) {
    console.error(`Amazon search error for ${searchTerm}:`, error);
    return null;
  }
}

/**
 * Fetch Walmart price
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

    if (data.search_results && data.search_results.length > 0) {
      const topResult = data.search_results[0];
      return {
        source: 'walmart',
        price: topResult.price?.value || 0,
        currency: 'USD',
        url: topResult.link,
        in_stock: true, // Walmart typically shows in-stock items first
        last_updated: new Date().toISOString()
      };
    }

    return null;
  } catch (error: any) {
    console.error(`Walmart price fetch error for ${searchTerm}:`, error);
    return null;
  }
}

/**
 * Fetch eBay price
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

    if (data.search_results && data.search_results.length > 0) {
      // Get average of Buy It Now prices
      const buyItNowItems = data.search_results.filter(
        (item: any) => item.listing_type === 'buy_it_now' && item.price?.value
      );

      if (buyItNowItems.length > 0) {
        const avgPrice = buyItNowItems.reduce(
          (sum: number, item: any) => sum + item.price.value, 0
        ) / buyItNowItems.length;

        return {
          source: 'ebay',
          price: Math.round(avgPrice * 100) / 100,
          currency: 'USD',
          url: buyItNowItems[0].link,
          in_stock: true,
          last_updated: new Date().toISOString()
        };
      }
    }

    return null;
  } catch (error: any) {
    console.error(`eBay price fetch error for ${searchTerm}:`, error);
    return null;
  }
}

/**
 * Fetch competitor prices for a product
 */
export async function fetchCompetitorPrices(
  products: any[] | 'all',
  sources: ('amazon' | 'walmart' | 'ebay')[] = ['amazon', 'walmart']
): Promise<{
  total: number;
  fetched: number;
  results: PriceResult[];
}> {
  // If 'all', this would need to fetch from Shopify first
  const productList = products === 'all' ? [] : products;
  
  const results: PriceResult[] = [];

  for (const product of productList) {
    const priceResult: PriceResult = {
      product_id: product.id?.toString() || product.product_id,
      asin: product.metafields?.competitor?.asin,
      prices: [],
      lowest_price: null
    };

    // Search term: use title, cleaned up
    const searchTerm = product.title
      .replace(/[^\w\s]/g, '')
      .substring(0, 100);

    // Fetch from each source
    const fetchPromises: Promise<CompetitorPrice | null>[] = [];

    if (sources.includes('amazon')) {
      if (priceResult.asin) {
        fetchPromises.push(fetchAmazonPrice(priceResult.asin));
      } else {
        fetchPromises.push(searchAmazonPrice(searchTerm));
      }
    }

    if (sources.includes('walmart')) {
      fetchPromises.push(fetchWalmartPrice(searchTerm));
    }

    if (sources.includes('ebay')) {
      fetchPromises.push(fetchEbayPrice(searchTerm));
    }

    const prices = await Promise.all(fetchPromises);
    
    for (const price of prices) {
      if (price && price.price > 0) {
        priceResult.prices.push(price);
      }
    }

    // Find lowest price
    if (priceResult.prices.length > 0) {
      priceResult.lowest_price = priceResult.prices.reduce(
        (min, p) => p.price < min.price ? p : min
      );
    }

    results.push(priceResult);

    // Rate limiting - Rainforest has limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return {
    total: productList.length,
    fetched: results.filter(r => r.prices.length > 0).length,
    results
  };
}

/**
 * Apply pricing rule based on competitor data
 */
export async function applyPricingRule(params: {
  rule: 'amazon_minus' | 'lowest_competitor_minus' | 'match_lowest';
  percentage?: number;
  margin_floor?: number;
  products?: any[];
}): Promise<{
  analyzed: number;
  updated: number;
  updates: { product_id: string; old_price: number; new_price: number; reason: string }[];
}> {
  const { rule, percentage = 10, margin_floor = 15, products = [] } = params;
  
  // Fetch competitor prices
  const priceData = await fetchCompetitorPrices(products, ['amazon', 'walmart']);
  
  const updates: { product_id: string; old_price: number; new_price: number; reason: string }[] = [];

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const competitorData = priceData.results[i];
    
    if (!competitorData.lowest_price) continue;

    const currentPrice = parseFloat(product.variants?.[0]?.price || product.price);
    const competitorPrice = competitorData.lowest_price.price;
    const costEstimate = currentPrice * (1 - margin_floor / 100); // Estimated cost

    let newPrice = currentPrice;
    let reason = '';

    switch (rule) {
      case 'amazon_minus':
        const amazonPrice = competitorData.prices.find(p => p.source === 'amazon')?.price;
        if (amazonPrice) {
          newPrice = amazonPrice * (1 - percentage / 100);
          reason = `Amazon price $${amazonPrice} minus ${percentage}%`;
        }
        break;

      case 'lowest_competitor_minus':
        newPrice = competitorPrice * (1 - percentage / 100);
        reason = `Lowest (${competitorData.lowest_price.source}) $${competitorPrice} minus ${percentage}%`;
        break;

      case 'match_lowest':
        newPrice = competitorPrice;
        reason = `Match lowest (${competitorData.lowest_price.source})`;
        break;
    }

    // Apply margin floor
    if (newPrice < costEstimate) {
      newPrice = costEstimate;
      reason += ` (floor applied: ${margin_floor}% margin)`;
    }

    // Only update if price changed meaningfully (>1% difference)
    if (Math.abs(newPrice - currentPrice) / currentPrice > 0.01) {
      updates.push({
        product_id: product.id?.toString() || product.product_id,
        old_price: currentPrice,
        new_price: Math.round(newPrice * 100) / 100,
        reason
      });
    }
  }

  return {
    analyzed: products.length,
    updated: updates.length,
    updates
  };
}
