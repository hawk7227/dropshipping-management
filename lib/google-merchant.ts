// lib/google-merchant.ts
// Google Merchant Center API integration using REST API (no googleapis package needed)

const MERCHANT_ID = process.env.GOOGLE_MERCHANT_ID!;
const GOOGLE_ACCESS_TOKEN = process.env.GOOGLE_ACCESS_TOKEN; // Optional - for direct API calls

interface Product {
  id: string;
  title: string;
  description?: string;
  price: number;
  compare_at_price?: number;
  images?: string[];
  brand?: string;
  vendor?: string;
}

interface OptimizedProduct {
  optimized_title?: string;
  optimized_description?: string;
  google_product_category?: string;
  custom_labels?: {
    label0?: string;
    label1?: string;
    label2?: string;
    label3?: string;
    label4?: string;
  };
  product_highlights?: string[];
  seo_score?: number;
  improvements_made?: string[];
}

/**
 * Get OAuth2 access token using service account
 */
async function getAccessToken(): Promise<string> {
  // If direct token is provided, use it
  if (GOOGLE_ACCESS_TOKEN) {
    return GOOGLE_ACCESS_TOKEN;
  }

  // Otherwise, get token from service account (simplified)
  const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
  
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Google service account credentials not configured');
  }

  // For production, you'd use proper JWT signing here
  // This is a placeholder - in real implementation, use googleapis or manual JWT
  throw new Error('Please set GOOGLE_ACCESS_TOKEN or install googleapis package');
}

/**
 * Make authenticated request to Google Content API
 */
async function googleFetch(endpoint: string, options: RequestInit = {}) {
  const accessToken = await getAccessToken();
  
  const response = await fetch(
    `https://shoppingcontent.googleapis.com/content/v2.1/${MERCHANT_ID}/${endpoint}`,
    {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google API Error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Submit a single product to Google Merchant Center
 */
export async function submitProduct(product: Product, optimized?: OptimizedProduct) {
  const productData = {
    offerId: product.id,
    title: optimized?.optimized_title || product.title,
    description: optimized?.optimized_description || product.description || product.title,
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
    customLabel0: optimized?.custom_labels?.label0,
    customLabel1: optimized?.custom_labels?.label1,
    customLabel2: optimized?.custom_labels?.label2,
    customLabel3: optimized?.custom_labels?.label3,
    customLabel4: optimized?.custom_labels?.label4,
    productHighlights: optimized?.product_highlights,
    // Sale price if applicable
    ...(product.compare_at_price && product.compare_at_price > product.price ? {
      salePrice: {
        value: product.price.toString(),
        currency: 'USD'
      },
    } : {}),
    shipping: [{
      country: 'US',
      service: 'Standard',
      price: { value: '0', currency: 'USD' }
    }],
  };

  try {
    const response = await googleFetch('products', {
      method: 'POST',
      body: JSON.stringify(productData),
    });
    
    return {
      success: true,
      productId: product.id,
      googleId: response.id,
    };
  } catch (error: any) {
    return {
      success: false,
      productId: product.id,
      error: error.message,
    };
  }
}

/**
 * Sync multiple products to Google Merchant Center
 */
export async function syncToGoogleMerchant(
  products: Product[],
  optimize: boolean = false
): Promise<{
  total: number;
  successful: number;
  failed: number;
  results: any[];
}> {
  const results = [];
  let successful = 0;
  let failed = 0;

  for (const product of products) {
    const result = await submitProduct(product);
    results.push(result);
    
    if (result.success) {
      successful++;
    } else {
      failed++;
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return { total: products.length, successful, failed, results };
}

/**
 * Get product performance data (placeholder - needs proper implementation)
 */
export async function getProductPerformance(days: number = 30) {
  // This would require the Reports API
  console.log(`[Google Merchant] Performance data for ${days} days requested`);
  return [];
}

/**
 * Get underperforming products
 */
export async function getUnderperformingProducts(ctrThreshold: number = 0.02) {
  const performance = await getProductPerformance(30);
  return performance.filter((p: any) => p.impressions > 100 && p.ctr < ctrThreshold);
}

/**
 * Optimize Google feed (placeholder)
 */
export async function optimizeGoogleFeed(
  products: 'underperforming' | Product[],
  focus: 'click_rate' | 'conversion_rate' | 'both' = 'both'
) {
  console.log(`[Google Merchant] Optimizing feed with focus: ${focus}`);
  return {
    analyzed: 0,
    optimized: 0,
    improvements: []
  };
}

/**
 * Delete a product from Google Merchant Center
 */
export async function deleteProduct(productId: string) {
  try {
    await googleFetch(`products/online:en:US:${productId}`, {
      method: 'DELETE',
    });
    return { success: true, productId };
  } catch (error: any) {
    return { success: false, productId, error: error.message };
  }
}

/**
 * Get account status
 */
export async function getAccountStatus() {
  try {
    const account = await googleFetch('accounts/' + MERCHANT_ID);
    return {
      name: account.name,
      websiteUrl: account.websiteUrl,
    };
  } catch (error: any) {
    return { error: error.message };
  }
}

/**
 * Update custom labels for a product
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
  const updates: any = {};
  if (labels.label0) updates.customLabel0 = labels.label0;
  if (labels.label1) updates.customLabel1 = labels.label1;
  if (labels.label2) updates.customLabel2 = labels.label2;
  if (labels.label3) updates.customLabel3 = labels.label3;
  if (labels.label4) updates.customLabel4 = labels.label4;

  try {
    await googleFetch(`products/online:en:US:${productId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return { success: true, productId, updated: Object.keys(labels) };
  } catch (error: any) {
    return { success: false, productId, error: error.message };
  }
}
