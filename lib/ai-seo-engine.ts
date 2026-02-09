// lib/ai-seo-engine.ts
// AI-powered SEO optimization that beats Google's generic AI
// Generates optimized titles, descriptions, and attributes for Google Shopping

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Google Product Category taxonomy (subset of common categories)
const GOOGLE_CATEGORIES = {
  'apparel': 'Apparel & Accessories > Clothing',
  'shoes': 'Apparel & Accessories > Shoes',
  'jewelry': 'Apparel & Accessories > Jewelry',
  'electronics': 'Electronics',
  'home': 'Home & Garden',
  'baby': 'Baby & Toddler',
  'health': 'Health & Beauty',
  'toys': 'Toys & Games',
  'sports': 'Sporting Goods',
  'pet': 'Animals & Pet Supplies'
};

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  compare_at_price?: number;
  category?: string;
  brand?: string;
  vendor?: string;
  tags?: string[];
  images?: string[];
  variants?: any[];
  metafields?: {
    compare_prices?: {
      amazon_price?: number;
      walmart_price?: number;
      ebay_price?: number;
    };
    social_proof?: {
      total_sold?: string;
      rating?: number;
    };
  };
}

export interface OptimizedProduct {
  original_title: string;
  optimized_title: string;
  optimized_description: string;
  google_product_category: string;
  custom_labels: {
    label0: string; // Margin tier: high_margin, medium_margin, low_margin
    label1: string; // Performance: bestseller, trending, underperforming
    label2: string; // Price position: price_leader, competitive, premium
    label3: string; // Seasonality: evergreen, seasonal, clearance
    label4: string; // Inventory: in_stock, low_stock, pre_order
  };
  product_highlights: string[];
  seo_keywords: string[];
  seo_score: number;
  improvements_made: string[];
}

/**
 * Optimize a single product for Google Shopping
 */
export async function optimizeProductForGoogle(product: Product): Promise<OptimizedProduct> {
  const competitorPrice = product.metafields?.compare_prices?.amazon_price || product.price * 1.2;
  const pricePosition = product.price < competitorPrice * 0.9 ? 'price_leader' 
    : product.price < competitorPrice ? 'competitive' : 'premium';
  
  const marginPercent = product.compare_at_price 
    ? ((product.compare_at_price - product.price) / product.compare_at_price * 100)
    : 30; // Assume 30% if no compare price
  
  const marginTier = marginPercent > 40 ? 'high_margin' 
    : marginPercent > 20 ? 'medium_margin' : 'low_margin';

  const prompt = `You are a Google Shopping SEO expert. Optimize this product listing for maximum visibility, clicks, and conversions.

PRODUCT DATA:
- Title: ${product.title}
- Description: ${product.description || 'No description'}
- Price: $${product.price}
- Competitor Price (Amazon): $${competitorPrice}
- Brand: ${product.brand || product.vendor || 'Unknown'}
- Category: ${product.category || 'General'}
- Tags: ${product.tags?.join(', ') || 'None'}
- Rating: ${product.metafields?.social_proof?.rating || 'N/A'}
- Total Sold: ${product.metafields?.social_proof?.total_sold || 'N/A'}

OPTIMIZATION RULES:
1. TITLE (70-150 chars):
   - Front-load primary keywords (what people search)
   - Include: Brand + Product Type + Key Attribute (size/color/material)
   - Avoid: Promotional text, all caps, excessive punctuation
   - Example: "Nike Air Max 270 Women's Running Shoes - Black/White, Size 8"

2. DESCRIPTION (500-1500 chars):
   - First 160 chars are critical (shown in preview)
   - Include: Key features, materials, dimensions, use cases
   - Natural language, not keyword stuffing
   - Avoid: "Buy now", "Sale", "Free shipping", prices

3. GOOGLE PRODUCT CATEGORY:
   - Must be exact match from Google's taxonomy
   - Be as specific as possible (deeper = better)

4. PRODUCT HIGHLIGHTS (4-6 bullet points):
   - Scannable benefit statements
   - Include differentiators vs competitors

5. SEO KEYWORDS:
   - Primary: What they search to find this
   - Secondary: Related terms and long-tail variations

RESPOND IN JSON:
{
  "optimized_title": "...",
  "optimized_description": "...",
  "google_product_category": "Exact Google category path",
  "product_highlights": ["...", "...", "...", "..."],
  "seo_keywords": {
    "primary": ["keyword1", "keyword2"],
    "secondary": ["longtail1", "longtail2"]
  },
  "seo_score": 0-100,
  "improvements_made": ["Improvement 1", "Improvement 2"]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.4
  });

  const aiResult = JSON.parse(response.choices[0].message.content || '{}');

  return {
    original_title: product.title,
    optimized_title: aiResult.optimized_title || product.title,
    optimized_description: aiResult.optimized_description || product.description || '',
    google_product_category: aiResult.google_product_category || 'General',
    custom_labels: {
      label0: marginTier,
      label1: 'new', // Will be updated based on performance data
      label2: pricePosition,
      label3: 'evergreen', // Can be updated based on seasonality detection
      label4: 'in_stock'
    },
    product_highlights: aiResult.product_highlights || [],
    seo_keywords: [
      ...(aiResult.seo_keywords?.primary || []),
      ...(aiResult.seo_keywords?.secondary || [])
    ],
    seo_score: aiResult.seo_score || 50,
    improvements_made: aiResult.improvements_made || []
  };
}

/**
 * Batch optimize products with rate limiting
 */
export async function batchOptimizeProducts(
  products: Product[], 
  options: { concurrency?: number; onProgress?: (completed: number, total: number) => void } = {}
): Promise<Map<string, OptimizedProduct>> {
  const { concurrency = 5, onProgress } = options;
  const results = new Map<string, OptimizedProduct>();
  
  // Process in batches
  for (let i = 0; i < products.length; i += concurrency) {
    const batch = products.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(p => optimizeProductForGoogle(p).catch(err => {
        console.error(`Failed to optimize ${p.id}:`, err);
        return null;
      }))
    );
    
    batch.forEach((product, idx) => {
      if (batchResults[idx]) {
        results.set(product.id, batchResults[idx]!);
      }
    });
    
    if (onProgress) {
      onProgress(Math.min(i + concurrency, products.length), products.length);
    }
    
    // Rate limiting pause between batches
    if (i + concurrency < products.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}

/**
 * Generate Google Merchant Center feed (TSV format)
 */
export async function generateGoogleFeed(products: Product[]): Promise<string> {
  const optimized = await batchOptimizeProducts(products);
  
  const headers = [
    'id',
    'title',
    'description',
    'link',
    'image_link',
    'price',
    'sale_price',
    'availability',
    'brand',
    'google_product_category',
    'custom_label_0',
    'custom_label_1',
    'custom_label_2',
    'custom_label_3',
    'custom_label_4',
    'product_highlight'
  ];
  
  const rows = [headers.join('\t')];
  
  for (const product of products) {
    const opt = optimized.get(product.id);
    if (!opt) continue;
    
    const row = [
      product.id,
      opt.optimized_title,
      opt.optimized_description.substring(0, 5000), // Google limit
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/products/${product.id}`,
      product.images?.[0] || '',
      `${product.price} USD`,
      product.compare_at_price ? `${product.price} USD` : '',
      'in_stock',
      product.brand || product.vendor || '',
      opt.google_product_category,
      opt.custom_labels.label0,
      opt.custom_labels.label1,
      opt.custom_labels.label2,
      opt.custom_labels.label3,
      opt.custom_labels.label4,
      opt.product_highlights.join('|')
    ];
    
    rows.push(row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join('\t'));
  }
  
  return rows.join('\n');
}

/**
 * Analyze SEO performance and suggest improvements
 */
export async function analyzeAndImprove(
  product: Product,
  performanceData: { impressions: number; clicks: number; conversions: number }
): Promise<{
  current_ctr: number;
  benchmark_ctr: number;
  issues: string[];
  recommendations: string[];
}> {
  const ctr = performanceData.impressions > 0 
    ? performanceData.clicks / performanceData.impressions 
    : 0;
  
  const conversionRate = performanceData.clicks > 0 
    ? performanceData.conversions / performanceData.clicks 
    : 0;
  
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  // CTR analysis
  if (ctr < 0.01) {
    issues.push('Very low CTR (<1%)');
    recommendations.push('Rewrite title to be more compelling and keyword-rich');
  } else if (ctr < 0.02) {
    issues.push('Below average CTR (1-2%)');
    recommendations.push('Test different title formats and add price competitiveness signals');
  }
  
  // Title analysis
  if (product.title.length < 50) {
    issues.push('Title too short - missing keyword opportunities');
    recommendations.push('Expand title to include brand, product type, and key attributes');
  }
  if (product.title.length > 150) {
    issues.push('Title too long - may be truncated');
    recommendations.push('Condense title to under 150 characters');
  }
  
  // Description analysis
  if (!product.description || product.description.length < 200) {
    issues.push('Description too short or missing');
    recommendations.push('Add detailed 500-1500 character description');
  }
  
  // Price analysis
  const competitorPrice = product.metafields?.compare_prices?.amazon_price;
  if (competitorPrice && product.price > competitorPrice) {
    issues.push('Price higher than Amazon - reduces click appeal');
    recommendations.push('Consider price adjustment or highlight value-adds');
  }
  
  // Image analysis
  if (!product.images || product.images.length < 3) {
    issues.push('Insufficient images');
    recommendations.push('Add at least 3 high-quality images showing different angles');
  }

  return {
    current_ctr: ctr,
    benchmark_ctr: 0.025, // 2.5% is typical for Google Shopping
    issues,
    recommendations
  };
}

/**
 * Generate AI content for ads and listings
 */
export async function generateAdContent(
  product: Product,
  type: 'headline' | 'description' | 'callout'
): Promise<string[]> {
  const prompts: Record<string, string> = {
    headline: `Generate 5 Google Ads headlines (max 30 chars each) for: ${product.title}. Price: $${product.price}. Focus on benefits and urgency.`,
    description: `Generate 3 Google Ads descriptions (max 90 chars each) for: ${product.title}. Include call-to-action.`,
    callout: `Generate 4 callout extensions (max 25 chars each) for: ${product.title}. Highlight benefits like free shipping, warranties, etc.`
  };

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [{
      role: 'user',
      content: `${prompts[type]} Respond with JSON array of strings only: ["option1", "option2", ...]`
    }],
    response_format: { type: 'json_object' },
    temperature: 0.7
  });

  const result = JSON.parse(response.choices[0].message.content || '[]');
  return Array.isArray(result) ? result : result.options || result.headlines || result.descriptions || [];
}
