// lib/services/rainforest.ts
// Rainforest API service for Amazon product discovery and ASIN lookup
// Falls back to mock data when API key is not configured

import type { ApiResponse } from '@/types/errors';
import type { RainforestSearchResult } from '@/types';
import { createSuccessResponse, createResponseFromCode, logError } from '@/lib/utils/api-error-handler';
import { PRICING_RULES, meetsDiscoveryCriteria } from '@/lib/config/pricing-rules';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const RAINFOREST_API_BASE = 'https://api.rainforestapi.com/request';

// API costs per request type (in USD)
export const RAINFOREST_COSTS = {
  search: 0.01,        // Search query
  product: 0.01,       // Single ASIN lookup
  productBatch: 0.008, // Batch ASIN lookup (per ASIN, cheaper)
  offers: 0.015,       // Offers/pricing lookup
  reviews: 0.02,       // Reviews lookup
} as const;

// Rate limiting
const RATE_LIMIT = {
  requestsPerMinute: 30,
  batchSize: 10, // Max ASINs per batch request
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface RainforestConfig {
  apiKey: string | undefined;
  isConfigured: boolean;
}

interface RainforestAPIProduct {
  asin: string;
  title?: string;
  price?: {
    value?: number;
    currency?: string;
  };
  rating?: number;
  ratings_total?: number;
  is_prime?: boolean;
  main_image?: {
    link?: string;
  };
  categories?: Array<{ name: string }>;
  buybox_winner?: {
    price?: {
      value?: number;
    };
  };
}

interface RainforestSearchResponse {
  request_info?: {
    success: boolean;
    credits_used?: number;
    credits_remaining?: number;
  };
  search_results?: RainforestAPIProduct[];
  product?: RainforestAPIProduct;
  error?: {
    message: string;
    code?: string;
  };
}

export interface RainforestServiceResult {
  products: RainforestSearchResult[];
  creditsUsed: number;
  creditsRemaining?: number;
  isMock: boolean;
  totalFound: number;
  filtered: number;
  requestId?: string;
}

export interface SingleProductResult {
  product: RainforestSearchResult | null;
  creditsUsed: number;
  isMock: boolean;
}

export interface BatchProductResult {
  products: RainforestSearchResult[];
  creditsUsed: number;
  isMock: boolean;
  found: number;
  notFound: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION HELPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get Rainforest API configuration status
 */
export function getRainforestConfig(): RainforestConfig {
  const apiKey = process.env.RAINFOREST_API_KEY;
  return {
    apiKey,
    isConfigured: !!apiKey && apiKey.length > 0,
  };
}

/**
 * Check if Rainforest API is configured
 */
export function hasRainforestConfig(): boolean {
  return getRainforestConfig().isConfigured;
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DATA GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

const MOCK_PRODUCT_NAMES = [
  'Premium Wireless Bluetooth Earbuds with Charging Case',
  'Organic Cold-Pressed Extra Virgin Olive Oil 500ml',
  'Stainless Steel Water Bottle 32oz Insulated',
  'Natural Bamboo Cutting Board Set (3 Pack)',
  'LED Desk Lamp with USB Charging Port',
  'Memory Foam Neck Pillow for Travel',
  'Portable Phone Charger 10000mAh Power Bank',
  'Silicone Kitchen Utensil Set (7 Piece)',
  'Yoga Mat Non-Slip Exercise Mat 6mm',
  'Digital Kitchen Scale with LCD Display',
  'Microfiber Cleaning Cloths Pack of 24',
  'Glass Food Storage Containers Set',
  'Resistance Bands Set for Home Workout',
  'Stainless Steel Mixing Bowls Set',
  'LED Strip Lights 50ft with Remote',
  'Electric Hand Mixer 5-Speed',
  'Bamboo Drawer Organizer Expandable',
  'Portable Laptop Stand Adjustable',
  'French Press Coffee Maker 34oz',
  'Ceramic Non-Stick Frying Pan 10 inch',
];

const MOCK_CATEGORIES = [
  'Electronics',
  'Home & Kitchen',
  'Sports & Outdoors',
  'Health & Household',
  'Kitchen & Dining',
  'Office Products',
  'Patio, Lawn & Garden',
  'Beauty & Personal Care',
];

/**
 * Generate a seeded random number for consistent mock data
 */
function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs((Math.sin(hash) + 1) / 2);
}

/**
 * Generate a mock ASIN
 */
function generateMockAsin(index: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let asin = 'B0';
  for (let i = 0; i < 8; i++) {
    asin += chars[Math.floor(seededRandom(`${index}-${i}`) * chars.length)];
  }
  return asin;
}

/**
 * Generate mock product data
 */
function generateMockProduct(seed: string, index: number): RainforestSearchResult {
  const random = seededRandom(seed + index.toString());
  const nameIndex = Math.floor(random * MOCK_PRODUCT_NAMES.length);
  const categoryIndex = Math.floor(seededRandom(seed + 'cat' + index) * MOCK_CATEGORIES.length);
  
  // Price between $5 and $25 (within discovery range)
  const { minAmazonPrice, maxAmazonPrice } = PRICING_RULES.discovery;
  const price = Math.round((minAmazonPrice + (random * (maxAmazonPrice - minAmazonPrice))) * 100) / 100;
  
  // Rating between 3.5 and 5.0
  const rating = Math.round((3.5 + (random * 1.5)) * 10) / 10;
  
  // Reviews between 500 and 5000
  const reviews = Math.floor(500 + (random * 4500));
  
  return {
    asin: generateMockAsin(index),
    title: MOCK_PRODUCT_NAMES[nameIndex],
    price,
    rating,
    reviews,
    isPrime: random > 0.3, // 70% are Prime
    imageUrl: `https://m.media-amazon.com/images/I/mock-${index}.jpg`,
    category: MOCK_CATEGORIES[categoryIndex],
  };
}

/**
 * Generate mock search results
 */
function generateMockSearchResults(query: string, count: number = 20): RainforestSearchResult[] {
  const products: RainforestSearchResult[] = [];
  for (let i = 0; i < count; i++) {
    products.push(generateMockProduct(query, i));
  }
  return products;
}

/**
 * Generate mock product for a specific ASIN
 */
function generateMockProductForAsin(asin: string): RainforestSearchResult {
  return {
    asin,
    title: MOCK_PRODUCT_NAMES[Math.floor(seededRandom(asin) * MOCK_PRODUCT_NAMES.length)],
    price: Math.round((5 + seededRandom(asin + 'price') * 20) * 100) / 100,
    rating: Math.round((3.5 + seededRandom(asin + 'rating') * 1.5) * 10) / 10,
    reviews: Math.floor(500 + seededRandom(asin + 'reviews') * 4500),
    isPrime: seededRandom(asin + 'prime') > 0.3,
    imageUrl: `https://m.media-amazon.com/images/I/${asin}.jpg`,
    category: MOCK_CATEGORIES[Math.floor(seededRandom(asin + 'cat') * MOCK_CATEGORIES.length)],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// API RESPONSE TRANSFORMER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Transform Rainforest API response to our format
 */
function transformProduct(apiProduct: RainforestAPIProduct): RainforestSearchResult {
  return {
    asin: apiProduct.asin,
    title: apiProduct.title || 'Unknown Product',
    price: apiProduct.buybox_winner?.price?.value ?? apiProduct.price?.value ?? null,
    rating: apiProduct.rating ?? null,
    reviews: apiProduct.ratings_total ?? null,
    isPrime: apiProduct.is_prime ?? false,
    imageUrl: apiProduct.main_image?.link ?? null,
    category: apiProduct.categories?.[0]?.name ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// API REQUEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Make request to Rainforest API
 */
async function makeRainforestRequest(
  params: Record<string, string>
): Promise<ApiResponse<RainforestSearchResponse>> {
  const config = getRainforestConfig();
  
  if (!config.isConfigured) {
    return createResponseFromCode('DISC_001');
  }

  try {
    const url = new URL(RAINFOREST_API_BASE);
    url.searchParams.set('api_key', config.apiKey!);
    
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return createResponseFromCode('DISC_002');
      }
      if (response.status === 429 || response.status === 402) {
        return createResponseFromCode('DISC_003');
      }
      return createResponseFromCode('DISC_004');
    }

    const data = await response.json() as RainforestSearchResponse;

    if (data.error) {
      logError('DISC_004', new Error(data.error.message));
      return createResponseFromCode('DISC_004');
    }

    return createSuccessResponse(data);
  } catch (error) {
    logError('DISC_004', error instanceof Error ? error : new Error(String(error)));
    return createResponseFromCode('DISC_004');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API: SEARCH PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Search for products on Amazon
 * Falls back to mock data when API is not configured
 */
export async function searchProducts(
  query: string,
  options: {
    page?: number;
    filterByCriteria?: boolean;
    amazonDomain?: string;
  } = {}
): Promise<ApiResponse<RainforestServiceResult>> {
  const { page = 1, filterByCriteria = true, amazonDomain = 'amazon.com' } = options;
  const config = getRainforestConfig();

  // MOCK MODE: Return mock data when API not configured
  if (!config.isConfigured) {
    console.log('[Rainforest] Using mock data - API not configured');
    
    const mockProducts = generateMockSearchResults(query, 20);
    
    // Filter by discovery criteria if requested
    let filteredProducts = mockProducts;
    let filteredCount = 0;
    
    if (filterByCriteria) {
      filteredProducts = mockProducts.filter(product => {
        const result = meetsDiscoveryCriteria(product);
        if (!result.meets) filteredCount++;
        return result.meets;
      });
    }

    return createSuccessResponse({
      products: filteredProducts,
      creditsUsed: 0,
      creditsRemaining: undefined,
      isMock: true,
      totalFound: mockProducts.length,
      filtered: filteredCount,
    });
  }

  // LIVE MODE: Make actual API request
  const response = await makeRainforestRequest({
    type: 'search',
    amazon_domain: amazonDomain,
    search_term: query,
    page: page.toString(),
    output: 'json',
  });

  if (!response.success) {
    return response as ApiResponse<RainforestServiceResult>;
  }

  const data = response.data;
  const products = (data.search_results || []).map(transformProduct);

  // Filter by discovery criteria if requested
  let filteredProducts = products;
  let filteredCount = 0;

  if (filterByCriteria) {
    filteredProducts = products.filter(product => {
      const result = meetsDiscoveryCriteria(product);
      if (!result.meets) filteredCount++;
      return result.meets;
    });
  }

  return createSuccessResponse({
    products: filteredProducts,
    creditsUsed: RAINFOREST_COSTS.search,
    creditsRemaining: data.request_info?.credits_remaining,
    isMock: false,
    totalFound: products.length,
    filtered: filteredCount,
    requestId: undefined,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API: SINGLE PRODUCT LOOKUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Look up a single product by ASIN
 */
export async function getProductByAsin(
  asin: string,
  options: {
    amazonDomain?: string;
  } = {}
): Promise<ApiResponse<SingleProductResult>> {
  const { amazonDomain = 'amazon.com' } = options;
  const config = getRainforestConfig();

  // Validate ASIN format
  if (!/^B[A-Z0-9]{9}$/.test(asin)) {
    return createSuccessResponse({
      product: null,
      creditsUsed: 0,
      isMock: !config.isConfigured,
    });
  }

  // MOCK MODE
  if (!config.isConfigured) {
    console.log(`[Rainforest] Using mock data for ASIN: ${asin}`);
    
    return createSuccessResponse({
      product: generateMockProductForAsin(asin),
      creditsUsed: 0,
      isMock: true,
    });
  }

  // LIVE MODE
  const response = await makeRainforestRequest({
    type: 'product',
    amazon_domain: amazonDomain,
    asin: asin,
    output: 'json',
  });

  if (!response.success) {
    return response as ApiResponse<SingleProductResult>;
  }

  const data = response.data;
  const product = data.product ? transformProduct(data.product) : null;

  return createSuccessResponse({
    product,
    creditsUsed: RAINFOREST_COSTS.product,
    isMock: false,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API: BATCH PRODUCT LOOKUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Look up multiple products by ASIN
 * Automatically batches requests for efficiency
 */
export async function getProductsByAsins(
  asins: string[],
  options: {
    amazonDomain?: string;
  } = {}
): Promise<ApiResponse<BatchProductResult>> {
  const { amazonDomain = 'amazon.com' } = options;
  const config = getRainforestConfig();

  // Filter valid ASINs
  const validAsins = asins.filter(asin => /^B[A-Z0-9]{9}$/.test(asin));
  const invalidAsins = asins.filter(asin => !/^B[A-Z0-9]{9}$/.test(asin));

  if (validAsins.length === 0) {
    return createSuccessResponse({
      products: [],
      creditsUsed: 0,
      isMock: !config.isConfigured,
      found: 0,
      notFound: invalidAsins,
    });
  }

  // MOCK MODE
  if (!config.isConfigured) {
    console.log(`[Rainforest] Using mock data for ${validAsins.length} ASINs`);
    
    const products = validAsins.map(asin => generateMockProductForAsin(asin));
    
    return createSuccessResponse({
      products,
      creditsUsed: 0,
      isMock: true,
      found: products.length,
      notFound: invalidAsins,
    });
  }

  // LIVE MODE: Process in batches
  const products: RainforestSearchResult[] = [];
  const notFound: string[] = [...invalidAsins];
  let totalCredits = 0;

  // Split into batches
  const batches: string[][] = [];
  for (let i = 0; i < validAsins.length; i += RATE_LIMIT.batchSize) {
    batches.push(validAsins.slice(i, i + RATE_LIMIT.batchSize));
  }

  // Process each batch
  for (const batch of batches) {
    // For batches, we need to make individual requests (Rainforest doesn't have native batch)
    // In production, consider using their batch endpoint if available
    for (const asin of batch) {
      const response = await makeRainforestRequest({
        type: 'product',
        amazon_domain: amazonDomain,
        asin: asin,
        output: 'json',
      });

      if (response.success && response.data.product) {
        products.push(transformProduct(response.data.product));
        totalCredits += RAINFOREST_COSTS.productBatch;
      } else {
        notFound.push(asin);
        // Still costs credits even if not found
        totalCredits += RAINFOREST_COSTS.productBatch;
      }
    }
  }

  return createSuccessResponse({
    products,
    creditsUsed: totalCredits,
    isMock: false,
    found: products.length,
    notFound,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API: CATEGORY SEARCH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Search products within a specific category
 */
export async function searchByCategory(
  categoryId: string,
  options: {
    page?: number;
    sortBy?: 'price_low_to_high' | 'price_high_to_low' | 'reviews' | 'featured';
    filterByCriteria?: boolean;
    amazonDomain?: string;
  } = {}
): Promise<ApiResponse<RainforestServiceResult>> {
  const { 
    page = 1, 
    sortBy = 'featured',
    filterByCriteria = true, 
    amazonDomain = 'amazon.com' 
  } = options;
  const config = getRainforestConfig();

  // MOCK MODE
  if (!config.isConfigured) {
    console.log(`[Rainforest] Using mock data for category: ${categoryId}`);
    
    const mockProducts = generateMockSearchResults(categoryId, 20);
    
    let filteredProducts = mockProducts;
    let filteredCount = 0;
    
    if (filterByCriteria) {
      filteredProducts = mockProducts.filter(product => {
        const result = meetsDiscoveryCriteria(product);
        if (!result.meets) filteredCount++;
        return result.meets;
      });
    }

    return createSuccessResponse({
      products: filteredProducts,
      creditsUsed: 0,
      creditsRemaining: undefined,
      isMock: true,
      totalFound: mockProducts.length,
      filtered: filteredCount,
    });
  }

  // LIVE MODE
  const response = await makeRainforestRequest({
    type: 'category',
    amazon_domain: amazonDomain,
    category_id: categoryId,
    page: page.toString(),
    sort_by: sortBy,
    output: 'json',
  });

  if (!response.success) {
    return response as ApiResponse<RainforestServiceResult>;
  }

  const data = response.data;
  const products = (data.search_results || []).map(transformProduct);

  let filteredProducts = products;
  let filteredCount = 0;

  if (filterByCriteria) {
    filteredProducts = products.filter(product => {
      const result = meetsDiscoveryCriteria(product);
      if (!result.meets) filteredCount++;
      return result.meets;
    });
  }

  return createSuccessResponse({
    products: filteredProducts,
    creditsUsed: RAINFOREST_COSTS.search,
    creditsRemaining: data.request_info?.credits_remaining,
    isMock: false,
    totalFound: products.length,
    filtered: filteredCount,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API: BEST SELLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get best sellers in a category
 */
export async function getBestSellers(
  categoryId: string,
  options: {
    filterByCriteria?: boolean;
    amazonDomain?: string;
  } = {}
): Promise<ApiResponse<RainforestServiceResult>> {
  const { filterByCriteria = true, amazonDomain = 'amazon.com' } = options;
  const config = getRainforestConfig();

  // MOCK MODE
  if (!config.isConfigured) {
    console.log(`[Rainforest] Using mock data for best sellers: ${categoryId}`);
    
    const mockProducts = generateMockSearchResults('bestsellers-' + categoryId, 20);
    
    let filteredProducts = mockProducts;
    let filteredCount = 0;
    
    if (filterByCriteria) {
      filteredProducts = mockProducts.filter(product => {
        const result = meetsDiscoveryCriteria(product);
        if (!result.meets) filteredCount++;
        return result.meets;
      });
    }

    return createSuccessResponse({
      products: filteredProducts,
      creditsUsed: 0,
      isMock: true,
      totalFound: mockProducts.length,
      filtered: filteredCount,
    });
  }

  // LIVE MODE
  const response = await makeRainforestRequest({
    type: 'bestsellers',
    amazon_domain: amazonDomain,
    category_id: categoryId,
    output: 'json',
  });

  if (!response.success) {
    return response as ApiResponse<RainforestServiceResult>;
  }

  const data = response.data;
  const products = (data.search_results || []).map(transformProduct);

  let filteredProducts = products;
  let filteredCount = 0;

  if (filterByCriteria) {
    filteredProducts = products.filter(product => {
      const result = meetsDiscoveryCriteria(product);
      if (!result.meets) filteredCount++;
      return result.meets;
    });
  }

  return createSuccessResponse({
    products: filteredProducts,
    creditsUsed: RAINFOREST_COSTS.search,
    creditsRemaining: data.request_info?.credits_remaining,
    isMock: false,
    totalFound: products.length,
    filtered: filteredCount,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// COST ESTIMATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Estimate cost for a discovery operation
 */
export function estimateSearchCost(options: {
  searchQueries?: number;
  asinLookups?: number;
  categorySearches?: number;
}): number {
  const { searchQueries = 0, asinLookups = 0, categorySearches = 0 } = options;
  
  return (
    searchQueries * RAINFOREST_COSTS.search +
    asinLookups * RAINFOREST_COSTS.productBatch +
    categorySearches * RAINFOREST_COSTS.search
  );
}

/**
 * Get rate limit information
 */
export function getRateLimitInfo(): typeof RATE_LIMIT {
  return { ...RATE_LIMIT };
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE STATUS
// ═══════════════════════════════════════════════════════════════════════════

export interface RainforestServiceStatus {
  isConfigured: boolean;
  mode: 'live' | 'mock';
  costPerSearch: number;
  costPerAsin: number;
  rateLimitPerMinute: number;
}

/**
 * Get service status information
 */
export function getServiceStatus(): RainforestServiceStatus {
  const config = getRainforestConfig();
  
  return {
    isConfigured: config.isConfigured,
    mode: config.isConfigured ? 'live' : 'mock',
    costPerSearch: RAINFOREST_COSTS.search,
    costPerAsin: RAINFOREST_COSTS.product,
    rateLimitPerMinute: RATE_LIMIT.requestsPerMinute,
  };
}
