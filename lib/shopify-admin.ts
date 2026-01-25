// lib/shopify-admin.ts
// Shopify Admin API integration for full store control

import Shopify from '@shopify/shopify-api';

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;

const shopifyFetch = async (endpoint: string, options: RequestInit = {}) => {
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shopify API Error: ${response.status} - ${error}`);
  }

  return response.json();
};

/**
 * Get all products (paginated)
 */
export async function getShopifyProducts(productIds?: string[]): Promise<any[]> {
  const allProducts: any[] = [];
  let pageInfo: string | null = null;

  if (productIds && productIds.length > 0) {
    // Fetch specific products
    const chunks = [];
    for (let i = 0; i < productIds.length; i += 250) {
      chunks.push(productIds.slice(i, i + 250));
    }
    
    for (const chunk of chunks) {
      const response = await shopifyFetch(`products.json?ids=${chunk.join(',')}`);
      allProducts.push(...response.products);
    }
    return allProducts;
  }

  // Fetch all products with pagination
  do {
    const endpoint = pageInfo 
      ? `products.json?limit=250&page_info=${pageInfo}`
      : 'products.json?limit=250';
    
    const response = await shopifyFetch(endpoint);
    allProducts.push(...response.products);
    
    // Get next page info from Link header (simplified - you'd parse this properly)
    pageInfo = null; // Reset for simplicity in this example
  } while (pageInfo);

  return allProducts;
}

/**
 * Get single product by ID
 */
export async function getProduct(productId: string) {
  const response = await shopifyFetch(`products/${productId}.json`);
  return response.product;
}

/**
 * Create a new product
 */
export async function createShopifyProduct(productData: {
  title: string;
  description?: string;
  vendor?: string;
  product_type?: string;
  tags?: string[];
  variants?: any[];
  images?: { src: string }[];
  metafields?: any[];
}) {
  const response = await shopifyFetch('products.json', {
    method: 'POST',
    body: JSON.stringify({
      product: {
        title: productData.title,
        body_html: productData.description,
        vendor: productData.vendor,
        product_type: productData.product_type,
        tags: productData.tags?.join(', '),
        variants: productData.variants || [{ price: '0.00' }],
        images: productData.images,
        metafields: productData.metafields
      }
    })
  });
  
  return response.product;
}

/**
 * Update existing products (batch)
 */
export async function updateShopifyProducts(updates: {
  id: string;
  title?: string;
  body_html?: string;
  variants?: { id?: string; price?: string }[];
  tags?: string;
  metafields?: any[];
}[]) {
  const results = [];
  
  for (const update of updates) {
    try {
      const response = await shopifyFetch(`products/${update.id}.json`, {
        method: 'PUT',
        body: JSON.stringify({ product: update })
      });
      results.push({ id: update.id, success: true, product: response.product });
    } catch (error: any) {
      results.push({ id: update.id, success: false, error: error.message });
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  
  return {
    total: updates.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results
  };
}

/**
 * Delete a product
 */
export async function deleteShopifyProduct(productId: string) {
  await shopifyFetch(`products/${productId}.json`, { method: 'DELETE' });
  return { success: true, productId };
}

/**
 * Update product metafields
 */
export async function updateMetafields(
  productId: string,
  namespace: string,
  key: string,
  value: string | number,
  type: string = 'single_line_text_field'
) {
  // First, get existing metafield if any
  const metafieldsResponse = await shopifyFetch(
    `products/${productId}/metafields.json?namespace=${namespace}&key=${key}`
  );
  
  const existing = metafieldsResponse.metafields?.[0];
  
  if (existing) {
    // Update existing
    const response = await shopifyFetch(`metafields/${existing.id}.json`, {
      method: 'PUT',
      body: JSON.stringify({
        metafield: { value: String(value), type }
      })
    });
    return response.metafield;
  } else {
    // Create new
    const response = await shopifyFetch(`products/${productId}/metafields.json`, {
      method: 'POST',
      body: JSON.stringify({
        metafield: {
          namespace,
          key,
          value: String(value),
          type
        }
      })
    });
    return response.metafield;
  }
}

/**
 * Bulk update metafields for multiple products
 */
export async function bulkUpdateMetafields(
  updates: {
    productId: string;
    namespace: string;
    key: string;
    value: string | number;
    type?: string;
  }[]
) {
  const results = [];
  
  for (const update of updates) {
    try {
      const result = await updateMetafields(
        update.productId,
        update.namespace,
        update.key,
        update.value,
        update.type
      );
      results.push({ ...update, success: true, metafield: result });
    } catch (error: any) {
      results.push({ ...update, success: false, error: error.message });
    }
    
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  
  return results;
}

/**
 * Get inventory levels
 */
export async function getInventoryLevels(locationId?: string) {
  const endpoint = locationId 
    ? `inventory_levels.json?location_ids=${locationId}&limit=250`
    : 'inventory_levels.json?limit=250';
  
  const response = await shopifyFetch(endpoint);
  return response.inventory_levels;
}

/**
 * Update inventory level
 */
export async function updateInventoryLevel(
  inventoryItemId: string,
  locationId: string,
  available: number
) {
  const response = await shopifyFetch('inventory_levels/set.json', {
    method: 'POST',
    body: JSON.stringify({
      location_id: locationId,
      inventory_item_id: inventoryItemId,
      available
    })
  });
  
  return response.inventory_level;
}

/**
 * Create a discount code
 */
export async function createDiscount(discountData: {
  code: string;
  discount_type: 'percentage' | 'fixed_amount';
  value: number;
  starts_at?: string;
  ends_at?: string;
  usage_limit?: number;
  applies_once_per_customer?: boolean;
}) {
  // Create price rule first
  const priceRuleResponse = await shopifyFetch('price_rules.json', {
    method: 'POST',
    body: JSON.stringify({
      price_rule: {
        title: discountData.code,
        target_type: 'line_item',
        target_selection: 'all',
        allocation_method: 'across',
        value_type: discountData.discount_type,
        value: discountData.discount_type === 'percentage' 
          ? `-${discountData.value}` 
          : `-${discountData.value}`,
        customer_selection: 'all',
        starts_at: discountData.starts_at || new Date().toISOString(),
        ends_at: discountData.ends_at,
        usage_limit: discountData.usage_limit,
        once_per_customer: discountData.applies_once_per_customer
      }
    })
  });
  
  // Create discount code
  const codeResponse = await shopifyFetch(
    `price_rules/${priceRuleResponse.price_rule.id}/discount_codes.json`,
    {
      method: 'POST',
      body: JSON.stringify({
        discount_code: { code: discountData.code }
      })
    }
  );
  
  return {
    price_rule: priceRuleResponse.price_rule,
    discount_code: codeResponse.discount_code
  };
}

/**
 * Get collections
 */
export async function getCollections() {
  const [smart, custom] = await Promise.all([
    shopifyFetch('smart_collections.json'),
    shopifyFetch('custom_collections.json')
  ]);
  
  return {
    smart_collections: smart.smart_collections,
    custom_collections: custom.custom_collections
  };
}

/**
 * Create a collection
 */
export async function createCollection(collectionData: {
  title: string;
  body_html?: string;
  rules?: { column: string; relation: string; condition: string }[];
  image?: { src: string };
}) {
  const isSmartCollection = collectionData.rules && collectionData.rules.length > 0;
  
  const endpoint = isSmartCollection 
    ? 'smart_collections.json' 
    : 'custom_collections.json';
  
  const bodyKey = isSmartCollection ? 'smart_collection' : 'custom_collection';
  
  const response = await shopifyFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({
      [bodyKey]: {
        title: collectionData.title,
        body_html: collectionData.body_html,
        ...(isSmartCollection ? { rules: collectionData.rules, disjunctive: false } : {}),
        image: collectionData.image
      }
    })
  });
  
  return response[bodyKey];
}

/**
 * Get theme settings
 */
export async function getThemes() {
  const response = await shopifyFetch('themes.json');
  return response.themes;
}

/**
 * Update theme settings
 */
export async function updateThemeSettings(themeId: string, settings: Record<string, any>) {
  // This updates theme settings via the Asset API
  const response = await shopifyFetch(`themes/${themeId}/assets.json`, {
    method: 'PUT',
    body: JSON.stringify({
      asset: {
        key: 'config/settings_data.json',
        value: JSON.stringify(settings)
      }
    })
  });
  
  return response.asset;
}
