// lib/pipelines/p1-import-pipeline.ts
// P1 Product Import Pipeline for manual product addition
// Uses ASIN lookup → Rainforest API → Normalization → Persistence → Shopify

import { 
  safeNormalizeRainforestImportProduct,
  safeNormalizeShopifyProduct
} from '../schemas/normalization';
import { 
  ProductPersistence, 
  ShopifyProductPersistence 
} from '../db/persistence';

const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY!;
const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

interface ImportResult {
  success: boolean;
  productId?: string;
  shopifyId?: string;
  error?: string;
}

/**
 * Get product data by ASIN from Rainforest API
 */
async function getProductByASIN(asin: string): Promise<any> {
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
 * Push product to Shopify
 */
async function pushToShopify(product: any): Promise<string | null> {
  const shopifyProduct = {
    product: {
      title: product.title,
      body_html: `<p>Source: Amazon ASIN ${product.asin}</p><p>${product.description?.substring(0, 1000)}...</p>`,
      vendor: product.brand || 'Unknown',
      product_type: product.category?.split(' > ').pop() || 'General',
      status: 'active',
      tags: [
        `asin-${product.asin}`,
        'manual-import',
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
 * Import a single product by ASIN
 */
export async function importProductByASIN(asin: string): Promise<ImportResult> {
  console.log(`Starting import for ASIN: ${asin}`);

  try {
    // Get product data from Rainforest
    const productData = await getProductByASIN(asin);
    if (!productData) {
      return { success: false, error: 'Product not found' };
    }

    // Validate with schema
    const normalizedResult = safeNormalizeRainforestImportProduct(productData);
    if (!normalizedResult.success) {
      return { success: false, error: `Schema validation failed: ${normalizedResult.error}` };
    }

    // Persist product
    const persistResult = await ProductPersistence.upsertProduct(normalizedResult.product);
    if (!persistResult.success) {
      return { success: false, error: `Failed to persist product: ${persistResult.error}` };
    }

    const productId = persistResult.id!;

    // Store demand data if available
    if (productData.bestsellers_rank_flat) {
      const bsrMatch = productData.bestsellers_rank_flat.match(/Rank: (\d+)/);
      const bsrCategoryMatch = productData.bestsellers_rank_flat.match(/Category: ([^|]+)\s*\|/);
      
      await ProductPersistence.upsertProductDemand(
        productId,
        asin,
        bsrMatch ? parseInt(bsrMatch[1]) : null,
        bsrCategoryMatch ? bsrCategoryMatch[1].trim() : null
      );
    }

    // Push to Shopify
    const shopifyId = await pushToShopify(normalizedResult.product);
    if (!shopifyId) {
      return { success: false, error: 'Failed to push to Shopify' };
    }

    // Link Shopify product
    const linkResult = await ShopifyProductPersistence.upsertShopifyProduct({
      shopify_id: parseInt(shopifyId),
      product_id: productId,
      title: normalizedResult.product.title,
      handle: normalizedResult.product.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      vendor: normalizedResult.product.brand,
      status: 'active',
      body_html: normalizedResult.product.description,
      tags: `asin-${asin}, manual-import`,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    if (!linkResult.success) {
      console.warn('Failed to link Shopify product:', linkResult.error);
    }

    console.log(`✅ Imported: ${asin} → Product ID: ${productId}, Shopify ID: ${shopifyId}`);
    
    return { 
      success: true, 
      productId, 
      shopifyId 
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Import error for ${asin}:`, error);
    return { success: false, error: errorMsg };
  }
}

/**
 * Import multiple products by ASIN
 */
export async function importMultipleProducts(asins: string[]): Promise<{ results: ImportResult[]; summary: { success: number; failed: number } }> {
  const results: ImportResult[] = [];
  
  for (const asin of asins) {
    const result = await importProductByASIN(asin);
    results.push(result);
    
    // Rate limiting between requests
    await new Promise(resolve => setTimeout(resolve, 1100));
  }

  const summary = {
    success: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length
  };

  console.log(`Bulk import complete - Success: ${summary.success}, Failed: ${summary.failed}`);
  
  return { results, summary };
}

/**
 * Manual trigger for testing
 */
export async function testImportProduct(): Promise<ImportResult> {
  // Test with a known ASIN from the fixtures
  return importProductByASIN('B0011FJPAY');
}
