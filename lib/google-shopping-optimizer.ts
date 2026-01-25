// lib/google-shopping-optimizer.ts
// Google Shopping optimization - matches app/api/cron/google-shopping/route.ts expectations

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================================================
// TYPES - Matching what route.ts expects
// ============================================================================

interface Product {
  id: string;
  title: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  costPrice?: number;
  category?: string;
  brand?: string;
  imageUrl?: string;
  link?: string;
  tags?: string[];
}

interface ProductPerformance {
  product_id: string;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  revenue: number;
}

// What generateCustomLabels returns - route expects customLabel0, not label0
interface CustomLabelsResult {
  customLabel0: string;
  customLabel1: string;
  customLabel2: string;
  customLabel3: string;
  customLabel4: string;
}

// What optimizeForGoogleShopping returns - matching route.ts usage exactly
interface OptimizedProduct {
  optimizedTitle: string;
  optimizedDescription: string;
  productHighlights: string[];
  customLabel0: string;
  customLabel1: string;
  customLabel2: string;
  customLabel3: string;
  customLabel4: string;
  googleProductCategory: string;
  priority: 'high' | 'medium' | 'low';
  scores: {
    overallScore: number;
    titleScore: number;
    descriptionScore: number;
  };
  recommendations: string[];
}

// ============================================================================
// generateCustomLabels - Returns customLabel0-4 format
// ============================================================================

export function generateCustomLabels(product: Product): CustomLabelsResult {
  // customLabel0: Margin tier
  let customLabel0 = 'margin_standard';
  if (product.costPrice && product.price) {
    const margin = ((product.price - product.costPrice) / product.costPrice) * 100;
    if (margin >= 70) {
      customLabel0 = 'margin_high';
    } else if (margin >= 40) {
      customLabel0 = 'margin_medium';
    } else if (margin < 20) {
      customLabel0 = 'margin_low';
    }
  }
  
  // customLabel1: Performance tier (placeholder - would use real data)
  let customLabel1 = 'performance_new';
  
  // customLabel2: Price tier
  let customLabel2 = 'price_medium';
  if (product.price < 25) {
    customLabel2 = 'price_low';
  } else if (product.price < 100) {
    customLabel2 = 'price_medium';
  } else {
    customLabel2 = 'price_high';
  }
  
  // customLabel3: Sale status
  let customLabel3 = 'regular';
  if (product.compareAtPrice && product.compareAtPrice > product.price) {
    customLabel3 = 'on_sale';
  }
  
  // customLabel4: Category
  const customLabel4 = product.category?.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'general';
  
  return {
    customLabel0,
    customLabel1,
    customLabel2,
    customLabel3,
    customLabel4,
  };
}

// ============================================================================
// optimizeForGoogleShopping - Main function route.ts calls
// ============================================================================

export async function optimizeForGoogleShopping(product: Product): Promise<OptimizedProduct> {
  let optimizedTitle = product.title;
  let optimizedDescription = product.description || product.title;
  let productHighlights: string[] = [];
  let googleProductCategory = product.category || 'General';
  
  // Try AI optimization
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{
        role: 'user',
        content: `Optimize this product for Google Shopping:
Title: ${product.title}
Description: ${product.description || 'N/A'}
Category: ${product.category || 'General'}
Price: $${product.price}

Return JSON with:
- optimized_title (max 150 chars, include brand/key features)
- optimized_description (500-1000 chars, benefits-focused)
- highlights (array of 3-5 bullet points)
- google_category (Google Product Category path)
- recommendations (array of 2-3 improvement tips)`
      }],
      response_format: { type: 'json_object' },
    });
    
    const result = JSON.parse(response.choices[0].message.content || '{}');
    optimizedTitle = result.optimized_title || product.title;
    optimizedDescription = result.optimized_description || product.description || product.title;
    productHighlights = result.highlights || [];
    googleProductCategory = result.google_category || product.category || 'General';
  } catch (error) {
    console.error('AI optimization failed:', error);
  }
  
  // Generate custom labels
  const labels = generateCustomLabels(product);
  
  // Determine priority based on margin
  let priority: 'high' | 'medium' | 'low' = 'medium';
  if (labels.customLabel0 === 'margin_high') {
    priority = 'high';
  } else if (labels.customLabel0 === 'margin_low') {
    priority = 'low';
  }
  
  // Calculate scores
  const titleScore = optimizedTitle !== product.title ? 85 : 60;
  const descriptionScore = optimizedDescription !== product.description ? 80 : 55;
  const overallScore = Math.round((titleScore + descriptionScore) / 2);
  
  // Recommendations
  const recommendations: string[] = [];
  if (titleScore < 70) recommendations.push('Add brand name and key features to title');
  if (descriptionScore < 70) recommendations.push('Expand description with benefits and specs');
  if (productHighlights.length < 3) recommendations.push('Add more product highlights');
  if (recommendations.length === 0) recommendations.push('Product is well-optimized');
  
  return {
    optimizedTitle,
    optimizedDescription,
    productHighlights,
    customLabel0: labels.customLabel0,
    customLabel1: labels.customLabel1,
    customLabel2: labels.customLabel2,
    customLabel3: labels.customLabel3,
    customLabel4: labels.customLabel4,
    googleProductCategory,
    priority,
    scores: {
      overallScore,
      titleScore,
      descriptionScore,
    },
    recommendations,
  };
}

// ============================================================================
// batchOptimizeForGoogleShopping
// ============================================================================

export async function batchOptimizeForGoogleShopping(
  products: Product[]
): Promise<Map<string, OptimizedProduct>> {
  const results = new Map<string, OptimizedProduct>();
  
  for (const product of products) {
    try {
      const optimized = await optimizeForGoogleShopping(product);
      results.set(product.id, optimized);
      await new Promise(r => setTimeout(r, 200));
    } catch (error) {
      console.error(`Error optimizing product ${product.id}:`, error);
    }
  }
  
  return results;
}

// ============================================================================
// findUnderperformers
// ============================================================================

export async function findUnderperformers(): Promise<ProductPerformance[]> {
  const { data, error } = await supabase
    .from('google_product_performance')
    .select('*')
    .lt('ctr', 0.02)
    .gt('impressions', 100)
    .order('impressions', { ascending: false })
    .limit(50);
  
  if (error) {
    console.error('Error finding underperformers:', error);
    return [];
  }
  
  return data || [];
}

// ============================================================================
// generateSupplementalFeed
// ============================================================================

export async function generateSupplementalFeed(products: Product[]): Promise<any[]> {
  const feed = [];
  
  for (const product of products) {
    const labels = generateCustomLabels(product);
    feed.push({
      id: product.id,
      custom_label_0: labels.customLabel0,
      custom_label_1: labels.customLabel1,
      custom_label_2: labels.customLabel2,
      custom_label_3: labels.customLabel3,
      custom_label_4: labels.customLabel4,
    });
  }
  
  return feed;
}


