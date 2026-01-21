// lib/product-management.ts
// Product Management: Shopify sync, bulk import, inventory tracking

import { createClient } from '@supabase/supabase-js';
import type { Product, Variant, ProductCost, ProductImport } from '@/types/database';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN || '';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '';
const API_VERSION = '2024-01';

// Shopify API request helper
async function shopifyRequest<T>(endpoint: string, options: {
  method?: string;
  body?: unknown;
} = {}): Promise<T> {
  if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
    throw new Error('Shopify credentials not configured');
  }

  const url = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/${endpoint}`;
  
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Sync all products from Shopify to local database
export async function syncAllProducts(): Promise<{ synced: number; errors: number }> {
  let synced = 0;
  let errors = 0;
  let pageInfo: string | null = null;
  let hasMore = true;

  while (hasMore) {
    try {
      const endpoint = pageInfo 
        ? `products.json?limit=250&page_info=${pageInfo}`
        : 'products.json?limit=250';

      const response = await fetch(`https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        },
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data = await response.json();
      const products = data.products || [];

      // Upsert products and variants
      for (const shopifyProduct of products) {
        try {
          await upsertProduct(shopifyProduct);
          synced++;
        } catch (error) {
          console.error(`Error syncing product ${shopifyProduct.id}:`, error);
          errors++;
        }
      }

      // Check for pagination
      const linkHeader = response.headers.get('Link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/page_info=([^>&]+)/);
        pageInfo = match ? match[1] : null;
        hasMore = !!pageInfo;
      } else {
        hasMore = false;
      }

      console.log(`[ProductSync] Synced ${synced} products...`);
    } catch (error) {
      console.error('[ProductSync] Error fetching products:', error);
      hasMore = false;
      errors++;
    }
  }

  return { synced, errors };
}

// Upsert a single product from Shopify data
async function upsertProduct(shopifyProduct: any): Promise<void> {
  // Transform to our format
  const product: Omit<Product, 'synced_at'> = {
    id: shopifyProduct.id.toString(),
    title: shopifyProduct.title,
    handle: shopifyProduct.handle,
    vendor: shopifyProduct.vendor || null,
    product_type: shopifyProduct.product_type || null,
    status: shopifyProduct.status,
    tags: shopifyProduct.tags ? shopifyProduct.tags.split(', ').filter(Boolean) : null,
    body_html: shopifyProduct.body_html || null,
    images: shopifyProduct.images?.map((img: any) => ({
      id: img.id.toString(),
      src: img.src,
      alt: img.alt,
      position: img.position,
    })) || null,
    options: shopifyProduct.options?.map((opt: any) => ({
      id: opt.id.toString(),
      name: opt.name,
      position: opt.position,
      values: opt.values,
    })) || null,
    created_at: shopifyProduct.created_at,
    updated_at: shopifyProduct.updated_at,
  };

  // Upsert product
  await supabase.from('products').upsert({
    ...product,
    synced_at: new Date().toISOString(),
  });

  // Upsert variants
  if (shopifyProduct.variants?.length) {
    const variants: Omit<Variant, 'created_at' | 'updated_at'>[] = shopifyProduct.variants.map((v: any) => ({
      id: v.id.toString(),
      product_id: shopifyProduct.id.toString(),
      title: v.title,
      sku: v.sku || null,
      barcode: v.barcode || null,
      price: parseFloat(v.price),
      compare_at_price: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
      cost: v.inventory_item?.cost ? parseFloat(v.inventory_item.cost) : null,
      inventory_item_id: v.inventory_item_id?.toString() || null,
      inventory_quantity: v.inventory_quantity || 0,
      weight: v.weight || null,
      weight_unit: v.weight_unit || null,
      requires_shipping: v.requires_shipping ?? true,
      taxable: v.taxable ?? true,
    }));

    await supabase.from('variants').upsert(variants);
  }
}

// Sync a single product by ID
export async function syncProduct(productId: string): Promise<Product> {
  const data = await shopifyRequest<{ product: any }>(`products/${productId}.json`);
  await upsertProduct(data.product);
  
  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();

  if (error) throw error;
  return product;
}

// Get products from local database
export async function getProducts(options: {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ products: Product[]; total: number }> {
  let query = supabase
    .from('products')
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false });

  if (options.status) {
    query = query.eq('status', options.status);
  }

  if (options.search) {
    query = query.or(`title.ilike.%${options.search}%,handle.ilike.%${options.search}%`);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { products: data || [], total: count || 0 };
}

// Get product with variants
export async function getProductWithVariants(productId: string): Promise<{
  product: Product;
  variants: Variant[];
} | null> {
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();

  if (productError) return null;

  const { data: variants, error: variantError } = await supabase
    .from('variants')
    .select('*')
    .eq('product_id', productId)
    .order('title');

  if (variantError) throw variantError;

  return { product, variants: variants || [] };
}

// Update product cost
export async function updateProductCost(
  productId: string,
  variantId: string | null,
  costs: Omit<ProductCost, 'id' | 'created_at' | 'product_id' | 'variant_id' | 'effective_from' | 'effective_to'>
): Promise<ProductCost> {
  // End previous cost record
  await supabase
    .from('product_costs')
    .update({ effective_to: new Date().toISOString() })
    .eq('product_id', productId)
    .is('effective_to', null);

  // Insert new cost record
  const { data, error } = await supabase
    .from('product_costs')
    .insert({
      product_id: productId,
      variant_id: variantId,
      ...costs,
      effective_from: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get current product cost
export async function getProductCost(productId: string, variantId?: string): Promise<ProductCost | null> {
  let query = supabase
    .from('product_costs')
    .select('*')
    .eq('product_id', productId)
    .is('effective_to', null);

  if (variantId) {
    query = query.eq('variant_id', variantId);
  }

  const { data, error } = await query.single();
  if (error) return null;
  return data;
}

// Bulk import products from CSV data
export async function bulkImportProducts(
  products: Array<{
    title: string;
    price: number;
    sku?: string;
    barcode?: string;
    vendor?: string;
    product_type?: string;
    description?: string;
    image_url?: string;
    inventory_quantity?: number;
    cost?: number;
  }>,
  batchId?: string
): Promise<{ imported: number; failed: number; errors: string[] }> {
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];
  const actualBatchId = batchId || crypto.randomUUID();

  for (const productData of products) {
    // Create import record
    const { data: importRecord, error: importError } = await supabase
      .from('product_imports')
      .insert({
        batch_id: actualBatchId,
        source: 'csv',
        status: 'pending',
        product_data: productData,
      })
      .select()
      .single();

    if (importError) {
      errors.push(`Failed to create import record: ${importError.message}`);
      failed++;
      continue;
    }

    try {
      // Create product in Shopify
      const shopifyProduct = await shopifyRequest<{ product: any }>('products.json', {
        method: 'POST',
        body: {
          product: {
            title: productData.title,
            body_html: productData.description || '',
            vendor: productData.vendor || '',
            product_type: productData.product_type || '',
            variants: [{
              price: productData.price.toString(),
              sku: productData.sku || '',
              barcode: productData.barcode || '',
              inventory_quantity: productData.inventory_quantity || 0,
              inventory_management: 'shopify',
            }],
            images: productData.image_url ? [{ src: productData.image_url }] : [],
          },
        },
      });

      // Sync to local database
      await upsertProduct(shopifyProduct.product);

      // Record cost if provided
      if (productData.cost) {
        await supabase.from('product_costs').insert({
          product_id: shopifyProduct.product.id.toString(),
          variant_id: shopifyProduct.product.variants[0].id.toString(),
          supplier_cost: productData.cost,
        });
      }

      // Update import record
      await supabase
        .from('product_imports')
        .update({
          status: 'completed',
          result: { shopify_product_id: shopifyProduct.product.id },
          processed_at: new Date().toISOString(),
        })
        .eq('id', importRecord.id);

      imported++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to import "${productData.title}": ${errorMessage}`);
      
      await supabase
        .from('product_imports')
        .update({
          status: 'failed',
          error_message: errorMessage,
          processed_at: new Date().toISOString(),
        })
        .eq('id', importRecord.id);

      failed++;
    }
  }

  return { imported, failed, errors };
}

// Get import batch status
export async function getImportBatchStatus(batchId: string): Promise<{
  total: number;
  pending: number;
  completed: number;
  failed: number;
  imports: ProductImport[];
}> {
  const { data, error } = await supabase
    .from('product_imports')
    .select('*')
    .eq('batch_id', batchId);

  if (error) throw error;

  const imports = data || [];
  
  return {
    total: imports.length,
    pending: imports.filter(i => i.status === 'pending').length,
    completed: imports.filter(i => i.status === 'completed').length,
    failed: imports.filter(i => i.status === 'failed').length,
    imports,
  };
}

// Sync inventory from Shopify
export async function syncInventory(): Promise<{ updated: number; errors: number }> {
  let updated = 0;
  let errors = 0;

  // Get all variants with inventory_item_id
  const { data: variants, error } = await supabase
    .from('variants')
    .select('id, inventory_item_id')
    .not('inventory_item_id', 'is', null);

  if (error) throw error;

  // Batch fetch inventory levels (50 at a time)
  const batchSize = 50;
  for (let i = 0; i < (variants?.length || 0); i += batchSize) {
    const batch = variants!.slice(i, i + batchSize);
    const ids = batch.map(v => v.inventory_item_id).join(',');

    try {
      const data = await shopifyRequest<{ inventory_levels: any[] }>(
        `inventory_levels.json?inventory_item_ids=${ids}`
      );

      for (const level of data.inventory_levels || []) {
        const variant = batch.find(v => v.inventory_item_id === level.inventory_item_id.toString());
        if (variant) {
          await supabase
            .from('variants')
            .update({ inventory_quantity: level.available })
            .eq('id', variant.id);
          updated++;
        }
      }
    } catch (error) {
      console.error('[InventorySync] Batch error:', error);
      errors++;
    }
  }

  return { updated, errors };
}

// Get low stock products
export async function getLowStockProducts(threshold: number = 10): Promise<Array<{
  product: Product;
  variant: Variant;
}>> {
  const { data, error } = await supabase
    .from('variants')
    .select('*, products(*)')
    .lte('inventory_quantity', threshold)
    .order('inventory_quantity', { ascending: true });

  if (error) throw error;

  return (data || []).map((v: any) => ({
    product: v.products,
    variant: { ...v, products: undefined },
  }));
}

// Test Shopify connection
export async function testShopifyConnection(): Promise<{ success: boolean; shop?: any; error?: string }> {
  if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
    return { success: false, error: 'Shopify credentials not configured' };
  }

  try {
    const data = await shopifyRequest<{ shop: any }>('shop.json');
    return { success: true, shop: data.shop };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Wrapper for cron compatibility - accepts fullSync parameter
export async function syncProductsFromShopify(
  fullSync: boolean = false
): Promise<{ synced: number; errors: string[] }> {
  console.log(`[ProductSync] Starting ${fullSync ? 'full' : 'incremental'} sync from Shopify`);
  const result = await syncAllProducts();
  return {
    synced: result.synced,
    errors: result.errors > 0 ? [`${result.errors} products failed to sync`] : []
  };
}
