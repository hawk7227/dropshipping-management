// lib/google-shopping-optimizer.ts
// Google Shopping optimization with all required exports

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================================================
// TYPES
// ============================================================================

interface Product {
  id: string;
  title: string;
  description?: string;
  price: number;
  compare_at_price?: number;
  category?: string;
  brand?: string;
  images?: string[];
}

interface ProductPerformance {
  product_id: string;
  title?: string;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  revenue: number;
  cost?: number;
  roas?: number;
}

interface CustomLabels {
  label0?: string;
  label1?: string;
  label2?: string;
  label3?: string;
  label4?: string;
}

// Using camelCase to match route expectations
interface OptimizedProduct {
  productId: string;
  optimizedTitle: string;
  optimizedDescription: string;
  customLabels: CustomLabels;
  googleProductCategory?: string;
  productHighlights?: string[];
  seoScore: number;
  improvementsMade: string[];
}

// ============================================================================
// CUSTOM LABELS GENERATION
// ============================================================================

export function generateCustomLabels(product: Product, performance?: ProductPerformance): CustomLabels {
  const labels: CustomLabels = {};
  
  if (product.price < 25) {
    labels.label0 = 'under_25';
  } else if (product.price < 50) {
    labels.label0 = '25_to_50';
  } else if (product.price < 100) {
    labels.label0 = '50_to_100';
  } else if (product.price < 200) {
    labels.label0 = '100_to_200';
  } else {
    labels.label0 = 'over_200';
  }
  
  if (product.compare_at_price && product.compare_at_price > product.price) {
    const margin = ((product.compare_at_price - product.price) / product.compare_at_price) * 100;
    if (margin >= 50) {
      labels.label1 = 'high_margin';
    } else if (margin >= 30) {
      labels.label1 = 'medium_margin';
    } else {
      labels.label1 = 'low_margin';
    }
  } else {
    labels.label1 = 'standard_margin';
  }
  
  if (performance) {
    if (performance.ctr >= 3 && performance.conversions > 0) {
      labels.label2 = 'top_performer';
    } else if (performance.ctr >= 1.5) {
      labels.label2 = 'good_performer';
    } else if (performance.impressions > 100 && performance.ctr < 0.5) {
      labels.label2 = 'needs_optimization';
    } else {
      labels.label2 = 'average';
    }
  } else {
    labels.label2 = 'new_product';
  }
  
  if (product.compare_at_price && product.compare_at_price > product.price) {
    labels.label3 = 'on_sale';
  } else {
    labels.label3 = 'regular_price';
  }
  
  labels.label4 = product.category?.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'uncategorized';
  
  return labels;
}

// ============================================================================
// PRODUCT PERFORMANCE
// ============================================================================

export async function getProductPerformance(days: number = 30): Promise<ProductPerformance[]> {
  const { data, error } = await supabase
    .from('google_product_performance')
    .select('*')
    .gte('recorded_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());
  
  if (error) {
    console.error('Error fetching performance:', error);
    return [];
  }
  
  return (data || []).map(d => ({
    product_id: d.product_id,
    title: d.title,
    impressions: d.impressions || 0,
    clicks: d.clicks || 0,
    ctr: d.ctr || 0,
    conversions: d.conversions || 0,
    revenue: d.revenue || 0,
    cost: d.cost,
    roas: d.roas,
  }));
}

export async function getUnderperformingProducts(
  ctrThreshold: number = 0.02,
  minImpressions: number = 100
): Promise<ProductPerformance[]> {
  const performance = await getProductPerformance(30);
  
  return performance
    .filter(p => p.impressions > minImpressions && p.ctr < ctrThreshold)
    .sort((a, b) => b.impressions - a.impressions);
}

// ============================================================================
// PRODUCT OPTIMIZATION
// ============================================================================

export async function optimizeProductTitle(
  product: Product,
  performance?: ProductPerformance
): Promise<string> {
  const prompt = `Optimize this product title for Google Shopping:

Current Title: ${product.title}
Category: ${product.category || 'General'}
Brand: ${product.brand || 'Unknown'}
Price: $${product.price}
${performance ? `Current CTR: ${(performance.ctr * 100).toFixed(2)}%` : ''}

Requirements:
- Max 150 characters
- Include brand, key features, product type
- Front-load important keywords
- Avoid promotional text

Return JSON: { "optimized_title": "..." }`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    
    const result = JSON.parse(response.choices[0].message.content || '{}');
    return result.optimized_title || product.title;
  } catch (error) {
    console.error('Error optimizing title:', error);
    return product.title;
  }
}

export async function optimizeProductDescription(
  product: Product
): Promise<string> {
  const prompt = `Optimize this product description for Google Shopping:

Title: ${product.title}
Current Description: ${product.description || 'No description'}
Category: ${product.category || 'General'}

Requirements:
- 500-5000 characters
- Include key features and benefits
- Use natural language, avoid keyword stuffing
- Include specifications if relevant

Return JSON: { "optimized_description": "..." }`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    
    const result = JSON.parse(response.choices[0].message.content || '{}');
    return result.optimized_description || product.description || product.title;
  } catch (error) {
    console.error('Error optimizing description:', error);
    return product.description || product.title;
  }
}

export async function optimizeProduct(
  product: Product,
  performance?: ProductPerformance
): Promise<OptimizedProduct> {
  const [optimizedTitle, optimizedDescription] = await Promise.all([
    optimizeProductTitle(product, performance),
    optimizeProductDescription(product),
  ]);
  
  const customLabels = generateCustomLabels(product, performance);
  
  const improvements: string[] = [];
  if (optimizedTitle !== product.title) {
    improvements.push('Title optimized');
  }
  if (optimizedDescription !== product.description) {
    improvements.push('Description optimized');
  }
  
  return {
    productId: product.id,
    optimizedTitle,
    optimizedDescription,
    customLabels,
    productHighlights: [],
    seoScore: 75,
    improvementsMade: improvements,
  };
}

// ============================================================================
// BATCH OPTIMIZATION
// ============================================================================

export async function batchOptimizeProducts(
  products: Product[]
): Promise<Map<string, OptimizedProduct>> {
  const results = new Map<string, OptimizedProduct>();
  const performance = await getProductPerformance(30);
  const performanceMap = new Map(performance.map(p => [p.product_id, p]));
  
  for (const product of products) {
    try {
      const perf = performanceMap.get(product.id);
      const optimized = await optimizeProduct(product, perf);
      results.set(product.id, optimized);
      
      await new Promise(r => setTimeout(r, 200));
    } catch (error) {
      console.error(`Error optimizing product ${product.id}:`, error);
    }
  }
  
  return results;
}

// ============================================================================
// GOOGLE CATEGORY MAPPING
// ============================================================================

export async function suggestGoogleCategory(
  product: Product
): Promise<string | null> {
  const prompt = `Suggest the most appropriate Google Product Category for:

Title: ${product.title}
Description: ${product.description || 'N/A'}
Current Category: ${product.category || 'N/A'}

Return the full Google Product Category path (e.g., "Apparel & Accessories > Clothing > Shirts & Tops").
Return JSON: { "google_category": "..." }`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    
    const result = JSON.parse(response.choices[0].message.content || '{}');
    return result.google_category || null;
  } catch (error) {
    console.error('Error suggesting category:', error);
    return null;
  }
}

// ============================================================================
// FEED HEALTH
// ============================================================================

export async function checkFeedHealth(): Promise<{
  totalProducts: number;
  optimized: number;
  needsAttention: number;
  issues: { product_id: string; issue: string }[];
}> {
  const performance = await getProductPerformance(30);
  const underperforming = await getUnderperformingProducts();
  
  return {
    totalProducts: performance.length,
    optimized: performance.filter(p => p.ctr >= 0.02).length,
    needsAttention: underperforming.length,
    issues: underperforming.slice(0, 10).map(p => ({
      product_id: p.product_id,
      issue: `Low CTR (${(p.ctr * 100).toFixed(2)}%) with ${p.impressions} impressions`,
    })),
  };
}

// ============================================================================
// ALIASES FOR BACKWARD COMPATIBILITY
// ============================================================================

export const optimizeForGoogleShopping = optimizeProduct;
export const batchOptimizeForGoogleShopping = batchOptimizeProducts;
export const findUnderperformers = getUnderperformingProducts;

// Generate supplemental feed data
export async function generateSupplementalFeed(products: any[]): Promise<any[]> {
  const results = [];
  for (const product of products) {
    const labels = generateCustomLabels(product);
    results.push({
      id: product.id,
      custom_label_0: labels.label0,
      custom_label_1: labels.label1,
      custom_label_2: labels.label2,
      custom_label_3: labels.label3,
      custom_label_4: labels.label4,
    });
  }
  return results;
}
