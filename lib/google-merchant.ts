// lib/google-merchant.ts
// Google Merchant Center API integration for product feeds and optimization

import { google, content_v2_1 } from 'googleapis';
import { optimizeProductForGoogle, batchOptimizeProducts, Product } from './ai-seo-engine';

// Initialize Google API client
const getAuthClient = async () => {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/content']
  });
  return auth;
};

const getMerchantClient = async () => {
  const auth = await getAuthClient();
  return google.content({ version: 'v2.1', auth });
};

const MERCHANT_ID = process.env.GOOGLE_MERCHANT_ID!;

/**
 * Submit a single product to Google Merchant Center
 */
export async function submitProduct(product: Product, optimize: boolean = true) {
  const client = await getMerchantClient();
  
  let optimized;
  if (optimize) {
    optimized = await optimizeProductForGoogle(product);
  }
  
  const requestBody: content_v2_1.Schema$Product = {
    offerId: product.id,
    title: optimized?.optimized_title || product.title,
    description: optimized?.optimized_description || product.description,
    link: `https://${process.env.SHOPIFY_STORE_DOMAIN}/products/${product.id}`,
    imageLink: product.images?.[0],
    additionalImageLinks: product.images?.slice(1),
    price: {
      value: product.price.toString(),
      currency: 'USD'
    },
    availability: 'in_stock',
    brand: product.brand || product.vendor,
    googleProductCategory: optimized?.google_product_category,
    customLabel0: optimized?.custom_labels.label0,
    customLabel1: optimized?.custom_labels.label1,
    customLabel2: optimized?.custom_labels.label2,
    customLabel3: optimized?.custom_labels.label3,
    customLabel4: optimized?.custom_labels.label4,
    productHighlights: optimized?.product_highlights,
    // Sale price if applicable
    ...(product.compare_at_price && product.compare_at_price > product.price ? {
      salePrice: {
        value: product.price.toString(),
        currency: 'USD'
      },
      salePriceEffectiveDate: `${new Date().toISOString().split('T')[0]}/${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`
    } : {}),
    // Shipping
    shipping: [{
      country: 'US',
      service: 'Standard',
      price: {
        value: '0',
        currency: 'USD'
      }
    }],
    // Tax (handled by Shopify/account settings)
    taxes: [{
      country: 'US',
      rate: 0,
      taxShip: false
    }]
  };

  try {
    const response = await client.products.insert({
      merchantId: MERCHANT_ID,
      requestBody
    });
    
    return {
      success: true,
      productId: product.id,
      googleId: response.data.id,
      status: response.status
    };
  } catch (error: any) {
    return {
      success: false,
      productId: product.id,
      error: error.message,
      details: error.errors
    };
  }
}

/**
 * Batch submit products to Google Merchant Center
 */
export async function syncToGoogleMerchant(
  products: Product[] | 'all',
  optimize: boolean = true
): Promise<{
  total: number;
  successful: number;
  failed: number;
  results: any[];
}> {
  // If 'all', fetch from Shopify (implement getShopifyProducts)
  const productList = products === 'all' 
    ? [] // TODO: await getShopifyProducts()
    : products;
  
  const results = [];
  let successful = 0;
  let failed = 0;

  // Optimize in batch first if needed
  let optimizedMap: Map<string, any> | null = null;
  if (optimize) {
    optimizedMap = await batchOptimizeProducts(productList);
  }

  // Submit products
  for (const product of productList) {
    const result = await submitProduct(product, false); // Already optimized
    results.push(result);
    
    if (result.success) {
      successful++;
    } else {
      failed++;
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return {
    total: productList.length,
    successful,
    failed,
    results
  };
}

/**
 * Get product performance data from Google Merchant Center
 */
export async function getProductPerformance(days: number = 30) {
  const client = await getMerchantClient();
  
  const endDate = new Date();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  try {
    const response = await client.reports.search({
      merchantId: MERCHANT_ID,
      requestBody: {
        query: `
          SELECT 
            segments.offer_id,
            segments.title,
            metrics.impressions,
            metrics.clicks,
            metrics.ctr,
            metrics.conversions,
            metrics.conversion_value
          FROM ProductPerformanceView
          WHERE segments.date BETWEEN '${startDate.toISOString().split('T')[0]}' AND '${endDate.toISOString().split('T')[0]}'
          ORDER BY metrics.impressions DESC
          LIMIT 1000
        `
      }
    });

    return response.data.results?.map(row => ({
      product_id: row.segments?.offerId,
      title: row.segments?.title,
      impressions: parseInt(row.metrics?.impressions || '0'),
      clicks: parseInt(row.metrics?.clicks || '0'),
      ctr: parseFloat(row.metrics?.ctr || '0'),
      conversions: parseInt(row.metrics?.conversions || '0'),
      revenue: parseFloat(row.metrics?.conversionValue?.value || '0')
    })) || [];
  } catch (error: any) {
    console.error('Failed to get performance data:', error);
    return [];
  }
}

/**
 * Get underperforming products that need optimization
 */
export async function getUnderperformingProducts(ctrThreshold: number = 0.02) {
  const performance = await getProductPerformance(30);
  
  return performance.filter(p => {
    // Has impressions but low CTR
    return p.impressions > 100 && p.ctr < ctrThreshold;
  }).sort((a, b) => b.impressions - a.impressions); // Prioritize by impressions
}

/**
 * Optimize underperforming listings automatically
 */
export async function optimizeGoogleFeed(
  products: 'underperforming' | Product[],
  focus: 'click_rate' | 'conversion_rate' | 'both' = 'both'
) {
  let productsToOptimize: any[] = [];
  
  if (products === 'underperforming') {
    productsToOptimize = await getUnderperformingProducts();
  } else {
    productsToOptimize = products;
  }

  const results = {
    analyzed: productsToOptimize.length,
    optimized: 0,
    improvements: [] as any[]
  };

  for (const product of productsToOptimize.slice(0, 50)) { // Limit per run
    try {
      const optimized = await optimizeProductForGoogle(product);
      await submitProduct({ ...product, ...optimized }, false);
      
      results.optimized++;
      results.improvements.push({
        product_id: product.id || product.product_id,
        original_title: product.title,
        new_title: optimized.optimized_title,
        seo_score: optimized.seo_score,
        changes: optimized.improvements_made
      });
    } catch (error: any) {
      console.error(`Failed to optimize ${product.id}:`, error);
    }
  }

  return results;
}

/**
 * Delete a product from Google Merchant Center
 */
export async function deleteProduct(productId: string) {
  const client = await getMerchantClient();
  
  try {
    await client.products.delete({
      merchantId: MERCHANT_ID,
      productId: `online:en:US:${productId}`
    });
    return { success: true, productId };
  } catch (error: any) {
    return { success: false, productId, error: error.message };
  }
}

/**
 * Get account status and diagnostics
 */
export async function getAccountStatus() {
  const client = await getMerchantClient();
  
  try {
    const [account, status] = await Promise.all([
      client.accounts.get({ merchantId: MERCHANT_ID, accountId: MERCHANT_ID }),
      client.accountstatuses.get({ merchantId: MERCHANT_ID, accountId: MERCHANT_ID })
    ]);

    return {
      name: account.data.name,
      websiteUrl: account.data.websiteUrl,
      products: status.data.products,
      accountLevelIssues: status.data.accountLevelIssues,
      dataQualityIssues: status.data.dataQualityIssues
    };
  } catch (error: any) {
    return { error: error.message };
  }
}

/**
 * Update custom labels for bidding optimization
 */
export async function updateCustomLabels(
  productId: string,
  labels: Partial<{
    label0: string;
    label1: string;
    label2: string;
    label3: string;
    label4: string;
  }>
) {
  const client = await getMerchantClient();
  
  const updates: content_v2_1.Schema$Product = {};
  if (labels.label0) updates.customLabel0 = labels.label0;
  if (labels.label1) updates.customLabel1 = labels.label1;
  if (labels.label2) updates.customLabel2 = labels.label2;
  if (labels.label3) updates.customLabel3 = labels.label3;
  if (labels.label4) updates.customLabel4 = labels.label4;

  try {
    const response = await client.products.update({
      merchantId: MERCHANT_ID,
      productId: `online:en:US:${productId}`,
      requestBody: updates
    });
    
    return { success: true, productId, updated: Object.keys(labels) };
  } catch (error: any) {
    return { success: false, productId, error: error.message };
  }
}
