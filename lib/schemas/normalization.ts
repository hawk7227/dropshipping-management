import { v4 as uuidv4 } from 'uuid';
import { 
  RainforestImportProductResponse,
  RainforestPriceSyncResponse,
  ShopifyProductResponse
} from './rainforest-schema';
import { 
  NormalizedProduct,
  NormalizedPriceSnapshot,
  NormalizedShopifyProduct
} from './normalized-schema';

/**
 * Normalizes Rainforest Import Product data to our internal Product model
 * Uses ONLY fields available in the fixture
 */
export function normalizeRainforestImportProduct(
  data: RainforestImportProductResponse
): NormalizedProduct {
  const now = new Date().toISOString();
  
  return {
    id: uuidv4(),
    asin: data.asin,
    title: data.title,
    brand: data.brand,
    category: data.categories_flat,
    description: data.description,
    main_image: data.main_image.link,
    images: data.images.map(img => img.link),
    rating: data.rating || null,
    ratings_total: data.ratings_total || null,
    status: 'active', // Default status for imported products
    source: 'rainforest_import',
    created_at: now,
    updated_at: now,
  };
}

/**
 * Normalizes Rainforest Price Sync data to our internal PriceSnapshot model
 * Uses ONLY fields available in the fixture
 */
export function normalizeRainforestPriceSync(
  data: RainforestPriceSyncResponse,
  productId: string
): NormalizedPriceSnapshot {
  const now = new Date().toISOString();
  
  // Extract BSR rank from bestsellers_rank_flat
  const bsrMatch = data.product.bestsellers_rank_flat.match(/Rank: (\d+)/);
  const bsrRank = bsrMatch ? parseInt(bsrMatch[1]) : null;
  
  // Extract BSR category from bestsellers_rank_flat
  const bsrCategoryMatch = data.product.bestsellers_rank_flat.match(/Category: ([^|]+)\s*\|/);
  const bsrCategory = bsrCategoryMatch ? bsrCategoryMatch[1].trim() : null;
  
  return {
    product_id: productId,
    asin: data.product.asin,
    current_price: null, // NOT AVAILABLE in fixtures
    cost_price: null, // NOT AVAILABLE in fixtures
    competitor_prices: null, // NOT AVAILABLE in fixtures
    bsr_rank: bsrRank,
    bsr_category: bsrCategory,
    recent_sales: data.product.recent_sales || null,
    rating: data.product.rating || null,
    is_prime: data.product.buybox_winner?.is_prime || null,
    sync_date: now,
  };
}

/**
 * Normalizes Shopify Product data to our internal ShopifyProduct model
 * Uses ONLY fields available in the fixture
 */
export function normalizeShopifyProduct(
  data: ShopifyProductResponse,
  productId: string
): NormalizedShopifyProduct {
  // Take the first product from the array
  const product = data.products[0];
  if (!product) {
    throw new Error('No products found in Shopify response');
  }

  return {
    shopify_id: product.id,
    product_id: productId,
    title: product.title,
    handle: product.handle,
    vendor: product.vendor,
    status: product.status,
    body_html: product.body_html,
    tags: product.tags,
    published_at: product.published_at,
    updated_at: product.updated_at,
  };
}

/**
 * Defensive parsing with error handling
 */
export function safeNormalizeRainforestImportProduct(
  data: unknown
): { success: true; product: NormalizedProduct } | { success: false; error: string } {
  try {
    const { RainforestImportProductSchema } = require('./rainforest-schema');
    const parsed = RainforestImportProductSchema.parse(data);
    const product = normalizeRainforestImportProduct(parsed);
    return { success: true, product };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown validation error' 
    };
  }
}

export function safeNormalizeRainforestPriceSync(
  data: unknown,
  productId: string
): { success: true; snapshot: NormalizedPriceSnapshot } | { success: false; error: string } {
  try {
    const { RainforestPriceSyncSchema } = require('./rainforest-schema');
    const parsed = RainforestPriceSyncSchema.parse(data);
    const snapshot = normalizeRainforestPriceSync(parsed, productId);
    return { success: true, snapshot };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown validation error' 
    };
  }
}

export function safeNormalizeShopifyProduct(
  data: unknown,
  productId: string
): { success: true; shopifyProduct: NormalizedShopifyProduct } | { success: false; error: string } {
  try {
    const { ShopifyProductSchema } = require('./rainforest-schema');
    const parsed = ShopifyProductSchema.parse(data);
    const shopifyProduct = normalizeShopifyProduct(parsed, productId);
    return { success: true, shopifyProduct };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown validation error' 
    };
  }
}
