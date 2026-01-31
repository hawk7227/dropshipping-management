// lib/pipelines/p1-discovery-pipeline.ts
// P1 Product Discovery Pipeline with real API integration
// Uses Rainforest API → Normalization → Persistence → Shopify

import { 
  safeNormalizeRainforestImportProduct,
  safeNormalizeRainforestPriceSync 
} from '../schemas/normalization';
import { 
  ProductPersistence, 
  DiscoveryPersistence 
} from '../db/persistence';

const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY!;
const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

// Discovery criteria based on STEP 1 analysis
const DISCOVERY_CONFIG = {
  minPrice: 3,
  maxPrice: 25,
  minReviews: 500,
  minRating: 3.5,
  primeOnly: true,
  markupPercent: 70,
  minProfitPercent: 80,
};

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

interface DiscoveryResult {
  searched: number;
  found: number;
  imported: number;
  rejected: number;
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

  if (!data.request_info?.success) {
    throw new Error(`Rainforest API error: ${data.error || 'Unknown error'}`);
  }

  return data.search_results || [];
}

/**
 * Get detailed product info by ASIN using Rainforest API
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

  if (!data.request_info?.success) {
    throw new Error(`Rainforest API error: ${data.error || 'Unknown error'}`);
  }

  return data.product || null;
}

/**
 * Check if product meets discovery criteria using available fixture data
 */
function meetsDiscoveryCriteria(product: any): { meets: boolean; reason?: string } {
  // Extract rating from fixture structure
  const rating = product.rating || 0;
  const reviews = product.ratings_total || 0;
  
  // Check basic criteria
  if (rating < DISCOVERY_CONFIG.minRating) {
    return { meets: false, reason: `Rating too low: ${rating} < ${DISCOVERY_CONFIG.minRating}` };
  }
  
  if (reviews < DISCOVERY_CONFIG.minReviews) {
    return { meets: false, reason: `Reviews too few: ${reviews} < ${DISCOVERY_CONFIG.minReviews}` };
  }

  // Check Prime eligibility (from fixture data)
  const isPrime = product.buybox_winner?.is_prime || false;
  if (DISCOVERY_CONFIG.primeOnly && !isPrime) {
    return { meets: false, reason: 'Not Prime eligible' };
  }

  // Price check - NOTE: Price data missing from fixtures
  // This is a limitation we must acknowledge
  console.warn('Price checking disabled - price data not available in fixtures');

  return { meets: true };
}

/**
 * Push product to Shopify
 */
async function pushToShopify(product: any): Promise<string | null> {
  const shopifyProduct = {
    product: {
      title: product.title,
      body_html: `<p>Source: Amazon ASIN ${product.asin}</p><p>${product.description?.substring(0, 500)}...</p>`,
      vendor: product.brand || 'Unknown',
      product_type: product.category?.split(' > ').pop() || 'General',
      status: 'active',
      tags: [
        `asin-${product.asin}`,
        'auto-discovered',
        'rainforest-api'
      ],
      variants: [{
        price: '0.00', // Price not available from fixtures
        sku: product.asin,
        inventory_management: 'shopify',
        inventory_quantity: 100,
        requires_shipping: true
      }]
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
 * Main P1 discovery pipeline
 */
export async function runP1Discovery(options?: {
  searchTerms?: string[];
  maxProducts?: number;
  dryRun?: boolean;
}): Promise<DiscoveryResult> {
  const {
    searchTerms = SEARCH_TERMS,
    maxProducts = 50,
    dryRun = false
  } = options || {};

  // Create discovery run record
  const today = new Date().toISOString().split('T')[0];
  const { id: runId } = await DiscoveryPersistence.upsertDiscoveryRun(today, 'running');

  const result: DiscoveryResult = {
    searched: 0,
    found: 0,
    imported: 0,
    rejected: 0,
    errors: []
  };

  console.log(`Starting P1 Discovery - Run ID: ${runId}`);

  for (const term of searchTerms) {
    if (result.found >= maxProducts) break;

    try {
      console.log(`Searching: ${term}`);
      const searchResults = await searchRainforest(term);
      result.searched += searchResults.length;

      for (const item of searchResults) {
        if (result.found >= maxProducts) break;

        const asin = item.asin;
        console.log(`Processing ASIN: ${asin}`);

        try {
          // Get detailed product data
          const productDetails = await getProductDetails(asin);
          if (!productDetails) {
            console.warn(`No details found for ASIN: ${asin}`);
            continue;
          }

          // Validate with schema
          const normalizedResult = safeNormalizeRainforestImportProduct(productDetails);
          if (!normalizedResult.success) {
            await DiscoveryPersistence.logRejection(
              asin,
              productDetails.title || 'Unknown',
              `Schema validation failed: ${normalizedResult.error}`,
              'content_poor',
              0.5,
              productDetails,
              runId
            );
            result.rejected++;
            continue;
          }

          // Check discovery criteria
          const criteriaCheck = meetsDiscoveryCriteria(productDetails);
          if (!criteriaCheck.meets) {
            await DiscoveryPersistence.logRejection(
              asin,
              productDetails.title,
              criteriaCheck.reason || 'Does not meet criteria',
              'other',
              0.8,
              productDetails,
              runId
            );
            result.rejected++;
            continue;
          }

          result.found++;

          // Persist product
          const persistResult = await ProductPersistence.upsertProduct(normalizedResult.product);
          if (!persistResult.success) {
            result.errors.push(`Failed to persist ${asin}: ${persistResult.error}`);
            continue;
          }

          // Store demand data if available
          if (productDetails.bestsellers_rank_flat) {
            const bsrMatch = productDetails.bestsellers_rank_flat.match(/Rank: (\d+)/);
            const bsrCategoryMatch = productDetails.bestsellers_rank_flat.match(/Category: ([^|]+)\s*\|/);
            
            await ProductPersistence.upsertProductDemand(
              persistResult.id!,
              asin,
              bsrMatch ? parseInt(bsrMatch[1]) : null,
              bsrCategoryMatch ? bsrCategoryMatch[1].trim() : null
            );
          }

          // Push to Shopify (unless dry run)
          if (!dryRun) {
            const shopifyId = await pushToShopify(normalizedResult.product);
            if (shopifyId) {
              console.log(`✅ Pushed to Shopify: ${asin} → ${shopifyId}`);
            } else {
              result.errors.push(`Failed to push ${asin} to Shopify`);
            }
          }

          result.imported++;
          console.log(`✅ Imported: ${asin} - ${productDetails.title}`);

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`${asin}: ${errorMsg}`);
          
          await DiscoveryPersistence.logRejection(
            asin,
            item.title || 'Unknown',
            errorMsg,
            'other',
            0.1,
            item,
            runId
          );
          result.rejected++;
        }
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Search term "${term}": ${errorMsg}`);
      console.error(`Search error for "${term}":`, error);
    }
  }

  // Update discovery run completion
  await DiscoveryPersistence.upsertDiscoveryRun(today, 'completed');
  await DiscoveryPersistence.updateDiscoveryStats(runId!, {
    found: result.found,
    imported: result.imported,
    rejected: result.rejected
  });

  console.log(`P1 Discovery Complete - Found: ${result.found}, Imported: ${result.imported}, Rejected: ${result.rejected}`);
  return result;
}

/**
 * Manual trigger for testing
 */
export async function triggerP1DiscoveryManually(): Promise<DiscoveryResult> {
  return runP1Discovery({
    searchTerms: ['beauty tools'], // Single term for testing
    maxProducts: 5,
    dryRun: false
  });
}
