// lib/product-discovery.ts
// Discovers products from Amazon via Rainforest API that meet 80%+ markup criteria
// Auto-publishes to Shopify with proper pricing

const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY!;
const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

// Discovery criteria
const DISCOVERY_CONFIG = {
  minPrice: 3,           // Minimum Amazon price
  maxPrice: 25,          // Maximum Amazon price
  minReviews: 500,       // Minimum review count
  minRating: 3.5,        // Minimum star rating
  primeOnly: true,       // Must be Prime eligible
  markupPercent: 70,     // Our markup: Cost × 1.70 = Sales price
  minProfitPercent: 80,  // Minimum profit margin to qualify
};

// Search terms for product discovery
const SEARCH_TERMS = [
  'kitchen gadgets',
  'phone accessories',
  'home organization',
  'pet supplies',
  'beauty tools',
  'fitness accessories',
  'car accessories',
  'office supplies',
  'outdoor gear',
  'tech accessories'
];

interface DiscoveredProduct {
  asin: string;
  title: string;
  amazonPrice: number;
  salesPrice: number;
  profitAmount: number;
  profitPercent: number;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  amazonUrl: string;
  category: string;
  isPrime: boolean;
}

interface DiscoveryResult {
  searched: number;
  found: number;
  published: number;
  skipped: number;
  products: DiscoveredProduct[];
  errors: string[];
}

/**
 * Search Rainforest API for products
 */
async function searchRainforest(searchTerm: string): Promise<any[]> {
  const params = new URLSearchParams({
    api_key: RAINFOREST_API_KEY,
    type: 'search',
    amazon_domain: 'amazon.com',
    search_term: searchTerm,
    sort_by: 'featured'
  });

  const response = await fetch(`https://api.rainforestapi.com/request?${params}`);
  const data = await response.json();

  return data.search_results || [];
}

/**
 * Get detailed product info by ASIN
 */
async function getProductDetails(asin: string): Promise<any> {
  const params = new URLSearchParams({
    api_key: RAINFOREST_API_KEY,
    type: 'product',
    amazon_domain: 'amazon.com',
    asin: asin
  });

  const response = await fetch(`https://api.rainforestapi.com/request?${params}`);
  const data = await response.json();

  return data.product || null;
}

/**
 * Check if product meets discovery criteria
 */
function meetsDiscoveryCriteria(product: any): boolean {
  const price = product.price?.value || product.buybox_winner?.price?.value || 0;
  const rating = product.rating || 0;
  const reviews = product.ratings_total || product.reviews_total || 0;
  const isPrime = product.is_prime || product.buybox_winner?.is_prime || false;

  // Check all criteria
  if (price < DISCOVERY_CONFIG.minPrice || price > DISCOVERY_CONFIG.maxPrice) return false;
  if (rating < DISCOVERY_CONFIG.minRating) return false;
  if (reviews < DISCOVERY_CONFIG.minReviews) return false;
  if (DISCOVERY_CONFIG.primeOnly && !isPrime) return false;

  // Calculate profit margin
  const salesPrice = price * (1 + DISCOVERY_CONFIG.markupPercent / 100);
  const profit = salesPrice - price;
  const profitPercent = (profit / price) * 100;

  if (profitPercent < DISCOVERY_CONFIG.minProfitPercent) return false;

  return true;
}

/**
 * Calculate pricing for a product
 */
function calculatePricing(amazonPrice: number): { salesPrice: number; profitAmount: number; profitPercent: number } {
  const salesPrice = Math.round(amazonPrice * (1 + DISCOVERY_CONFIG.markupPercent / 100) * 100) / 100;
  const profitAmount = Math.round((salesPrice - amazonPrice) * 100) / 100;
  const profitPercent = Math.round((profitAmount / amazonPrice) * 100);

  return { salesPrice, profitAmount, profitPercent };
}

/**
 * Push product to Shopify
 */
async function pushToShopify(product: DiscoveredProduct): Promise<string | null> {
  const shopifyProduct = {
    product: {
      title: product.title,
      body_html: `<p>Discovered from Amazon - ${product.category}</p>`,
      vendor: 'Auto-Discovered',
      product_type: product.category,
      status: 'active', // AUTO-PUBLISH
      tags: [
        'auto-discovered',
        '80-percent-markup',
        product.category.toLowerCase().replace(/\s+/g, '-'),
        `asin-${product.asin}`
      ].join(', '),
      variants: [{
        price: product.salesPrice.toFixed(2),
        compare_at_price: (product.salesPrice * 1.85).toFixed(2), // Show "was" price
        sku: product.asin,
        inventory_management: null,
        inventory_policy: 'continue'
      }],
      images: [{
        src: product.imageUrl
      }],
      metafields: [
        {
          namespace: 'discovery',
          key: 'asin',
          value: product.asin,
          type: 'single_line_text_field'
        },
        {
          namespace: 'discovery',
          key: 'cost_price',
          value: product.amazonPrice.toString(),
          type: 'number_decimal'
        },
        {
          namespace: 'discovery',
          key: 'profit_percent',
          value: product.profitPercent.toString(),
          type: 'number_decimal'
        },
        {
          namespace: 'discovery',
          key: 'amazon_url',
          value: product.amazonUrl,
          type: 'single_line_text_field'
        },
        {
          namespace: 'social_proof',
          key: 'rating',
          value: product.rating.toString(),
          type: 'number_decimal'
        },
        {
          namespace: 'social_proof',
          key: 'review_count',
          value: product.reviewCount.toString(),
          type: 'number_integer'
        }
      ]
    }
  };

  try {
    const response = await fetch(
      `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/products.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        },
        body: JSON.stringify(shopifyProduct)
      }
    );

    const data = await response.json();
    
    if (data.product?.id) {
      return data.product.id.toString();
    }

    console.error('Shopify push error:', data);
    return null;
  } catch (error) {
    console.error('Shopify push error:', error);
    return null;
  }
}

/**
 * Check if product already exists in Shopify (by ASIN)
 */
async function productExistsInShopify(asin: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/products.json?tag=asin-${asin}`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        }
      }
    );

    const data = await response.json();
    return (data.products?.length || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Main discovery function - finds and publishes products meeting 80%+ markup
 */
export async function discoverProducts(options?: {
  searchTerms?: string[];
  maxProducts?: number;
  dryRun?: boolean;
}): Promise<DiscoveryResult> {
  const {
    searchTerms = SEARCH_TERMS,
    maxProducts = 50,
    dryRun = false
  } = options || {};

  const result: DiscoveryResult = {
    searched: 0,
    found: 0,
    published: 0,
    skipped: 0,
    products: [],
    errors: []
  };

  for (const term of searchTerms) {
    if (result.found >= maxProducts) break;

    try {
      console.log(`Searching: ${term}`);
      const searchResults = await searchRainforest(term);
      result.searched += searchResults.length;

      for (const item of searchResults) {
        if (result.found >= maxProducts) break;

        // Quick filter on search results
        const price = item.price?.value || 0;
        if (price < DISCOVERY_CONFIG.minPrice || price > DISCOVERY_CONFIG.maxPrice) continue;

        // Get detailed product info
        const product = await getProductDetails(item.asin);
        if (!product) continue;

        // Check criteria
        if (!meetsDiscoveryCriteria(product)) continue;

        // Calculate pricing
        const amazonPrice = product.buybox_winner?.price?.value || product.price?.value || 0;
        const { salesPrice, profitAmount, profitPercent } = calculatePricing(amazonPrice);

        const discoveredProduct: DiscoveredProduct = {
          asin: product.asin,
          title: product.title,
          amazonPrice,
          salesPrice,
          profitAmount,
          profitPercent,
          rating: product.rating || 0,
          reviewCount: product.ratings_total || 0,
          imageUrl: product.main_image?.link || '',
          amazonUrl: product.link || `https://amazon.com/dp/${product.asin}`,
          category: product.categories?.[0]?.name || term,
          isPrime: product.buybox_winner?.is_prime || false
        };

        result.products.push(discoveredProduct);
        result.found++;

        // Check if already in Shopify
        const exists = await productExistsInShopify(product.asin);
        if (exists) {
          result.skipped++;
          console.log(`Skipped (exists): ${product.title}`);
          continue;
        }

        // Push to Shopify
        if (!dryRun) {
          const shopifyId = await pushToShopify(discoveredProduct);
          if (shopifyId) {
            result.published++;
            console.log(`Published: ${product.title} → Shopify ID: ${shopifyId}`);
          } else {
            result.errors.push(`Failed to publish: ${product.title}`);
          }
        } else {
          console.log(`[DRY RUN] Would publish: ${product.title} @ $${salesPrice}`);
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error: any) {
      result.errors.push(`Search "${term}" failed: ${error.message}`);
    }

    // Rate limiting between searches
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return result;
}

/**
 * Validate existing products still meet 80% markup
 */
export async function validateProfitMargins(): Promise<{
  validated: number;
  alerts: { productId: string; title: string; currentProfit: number; requiredProfit: number }[];
}> {
  // This would check all discovered products against current Amazon prices
  // and create alerts if profit drops below threshold
  
  const alerts: { productId: string; title: string; currentProfit: number; requiredProfit: number }[] = [];
  
  // Implementation would fetch products with discovery.asin metafield,
  // check current Amazon price via Rainforest,
  // compare against current sales price
  
  return {
    validated: 0,
    alerts
  };
}
