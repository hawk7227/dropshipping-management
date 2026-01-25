// lib/ai-optimization.ts
// AI-Powered Store Optimization Engine
// Optimizes: Titles, Descriptions, Pricing, SEO, Competitor Positioning

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

// ============================================================================
// TYPES
// ============================================================================

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  costPrice?: number;
  category?: string;
  tags?: string[];
  images?: string[];
  metafields?: Record<string, any>;
}

interface OptimizationResult {
  productId: string;
  original: {
    title: string;
    description: string;
    price: number;
  };
  optimized: {
    title: string;
    description: string;
    seoTitle: string;
    seoDescription: string;
    suggestedPrice?: number;
    competitorPrices: {
      amazon: number;
      costco: number;
      ebay: number;
      sams: number;
    };
    tags: string[];
    highlights: string[];
  };
  scores: {
    titleScore: number;
    descriptionScore: number;
    seoScore: number;
    priceCompetitiveness: number;
    overallScore: number;
  };
}

interface BatchOptimizationResult {
  total: number;
  optimized: number;
  failed: number;
  results: OptimizationResult[];
  errors: string[];
}

// ============================================================================
// AI TITLE OPTIMIZATION
// ============================================================================

/**
 * Generate optimized product title using AI
 * - Front-loads keywords for search
 * - Includes brand, key features, size/color
 * - 70-150 characters for Google Shopping
 */
export async function optimizeTitle(product: Product): Promise<{ title: string; score: number }> {
  const prompt = `Optimize this product title for e-commerce and Google Shopping.

CURRENT TITLE: ${product.title}
CATEGORY: ${product.category || 'General'}
PRICE: $${product.price}

RULES:
1. 70-150 characters (optimal for Google Shopping)
2. Front-load primary keywords (what it IS)
3. Include brand if known
4. Include key differentiators (size, color, material, quantity)
5. No promotional language ("Best", "Amazing", "#1")
6. No ALL CAPS except brand names
7. No special characters or emojis

GOOD EXAMPLES:
- "Ninja Professional Blender 1000W - 72oz Pitcher, Black, Dishwasher Safe"
- "Apple AirPods Pro 2nd Gen - Active Noise Cancellation, MagSafe Case"
- "Coleman 6-Person Instant Cabin Tent - WeatherTec, 60-Second Setup"

Respond in JSON:
{
  "optimizedTitle": "...",
  "score": 0-100,
  "reasoning": "brief explanation"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return {
      title: result.optimizedTitle || product.title,
      score: result.score || 50
    };
  } catch (error) {
    console.error('Title optimization error:', error);
    return { title: product.title, score: 50 };
  }
}

// ============================================================================
// AI DESCRIPTION OPTIMIZATION
// ============================================================================

/**
 * Generate optimized product description using AI
 * - SEO-friendly with natural keyword integration
 * - Benefit-focused, scannable format
 * - 150-500 words for Google Shopping
 */
export async function optimizeDescription(product: Product): Promise<{ description: string; highlights: string[]; score: number }> {
  const prompt = `Write an optimized e-commerce product description.

PRODUCT: ${product.title}
CURRENT DESCRIPTION: ${product.description || 'None provided'}
CATEGORY: ${product.category || 'General'}
PRICE: $${product.price}

RULES:
1. 150-500 words (optimal for SEO)
2. First sentence: clear statement of what it is + main benefit
3. Use natural, conversational tone
4. Include 3-5 key features as benefits
5. NO promotional claims ("best", "amazing", "#1")
6. NO competitor comparisons
7. NO pricing or shipping info
8. End with subtle call-to-action

Also generate 4-6 product highlights (bullet points for Google Shopping).

Respond in JSON:
{
  "description": "full description...",
  "highlights": ["highlight 1", "highlight 2", ...],
  "score": 0-100,
  "keywordsUsed": ["keyword1", "keyword2"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.5
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return {
      description: result.description || product.description,
      highlights: result.highlights || [],
      score: result.score || 50
    };
  } catch (error) {
    console.error('Description optimization error:', error);
    return { description: product.description, highlights: [], score: 50 };
  }
}

// ============================================================================
// AI PRICING OPTIMIZATION
// ============================================================================

/**
 * Calculate optimal competitor display prices
 * Based on sales price, generates prices 80-90% higher for competitors
 */
export function calculateCompetitorPrices(salesPrice: number): {
  amazon: number;
  costco: number;
  ebay: number;
  sams: number;
} {
  // Competitor prices are 80-90% HIGHER than our sales price
  // This makes our price look like a great deal
  return {
    amazon: Math.round(salesPrice * 1.85 * 100) / 100,  // 85% higher
    costco: Math.round(salesPrice * 1.82 * 100) / 100,  // 82% higher
    ebay: Math.round(salesPrice * 1.90 * 100) / 100,    // 90% higher
    sams: Math.round(salesPrice * 1.80 * 100) / 100     // 80% higher
  };
}

/**
 * Calculate optimal sales price from cost
 * 70% markup = cost × 1.70
 */
export function calculateSalesPrice(costPrice: number): number {
  const markup = 1.70; // 70% markup
  return Math.round(costPrice * markup * 100) / 100;
}

/**
 * AI-powered price optimization based on market analysis
 */
export async function optimizePrice(product: Product): Promise<{
  suggestedPrice: number;
  competitorPrices: { amazon: number; costco: number; ebay: number; sams: number };
  priceCompetitiveness: number;
  reasoning: string;
}> {
  const costPrice = product.costPrice || product.price / 1.70;
  const currentPrice = product.price;
  
  // Calculate optimal pricing
  const optimalSalesPrice = calculateSalesPrice(costPrice);
  const competitorPrices = calculateCompetitorPrices(optimalSalesPrice);
  
  // Calculate competitiveness score (how much cheaper than "competitors")
  const avgCompetitor = (competitorPrices.amazon + competitorPrices.costco + competitorPrices.ebay + competitorPrices.sams) / 4;
  const savings = ((avgCompetitor - optimalSalesPrice) / avgCompetitor) * 100;
  const priceCompetitiveness = Math.min(100, Math.round(savings));

  return {
    suggestedPrice: optimalSalesPrice,
    competitorPrices,
    priceCompetitiveness,
    reasoning: `Cost: $${costPrice.toFixed(2)} × 1.70 markup = $${optimalSalesPrice.toFixed(2)}. Competitors display 80-90% higher.`
  };
}

// ============================================================================
// AI SEO OPTIMIZATION
// ============================================================================

/**
 * Generate SEO-optimized meta title and description
 */
export async function optimizeSEO(product: Product): Promise<{
  seoTitle: string;
  seoDescription: string;
  score: number;
}> {
  const prompt = `Generate SEO meta tags for this product.

PRODUCT: ${product.title}
CATEGORY: ${product.category || 'General'}
PRICE: $${product.price}

RULES:
1. Meta Title: 50-60 characters, include primary keyword + brand + modifier
2. Meta Description: 150-160 characters, include call-to-action, mention value/savings
3. Natural language, no keyword stuffing

Respond in JSON:
{
  "seoTitle": "...",
  "seoDescription": "...",
  "score": 0-100
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return {
      seoTitle: result.seoTitle || product.title.substring(0, 60),
      seoDescription: result.seoDescription || '',
      score: result.score || 50
    };
  } catch (error) {
    console.error('SEO optimization error:', error);
    return {
      seoTitle: product.title.substring(0, 60),
      seoDescription: '',
      score: 50
    };
  }
}

// ============================================================================
// AI TAG GENERATION
// ============================================================================

/**
 * Generate optimized product tags for search and filtering
 */
export async function generateTags(product: Product): Promise<string[]> {
  const prompt = `Generate product tags for e-commerce search and filtering.

PRODUCT: ${product.title}
CATEGORY: ${product.category || 'General'}
DESCRIPTION: ${product.description?.substring(0, 200) || 'None'}

Generate 8-12 tags including:
- Category tags (what it is)
- Use-case tags (what it's for)
- Feature tags (key attributes)
- Audience tags (who it's for)

Respond in JSON:
{
  "tags": ["tag1", "tag2", ...]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.5
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return result.tags || [];
  } catch (error) {
    console.error('Tag generation error:', error);
    return [];
  }
}

// ============================================================================
// FULL PRODUCT OPTIMIZATION
// ============================================================================

/**
 * Complete AI optimization for a single product
 */
export async function optimizeProduct(product: Product): Promise<OptimizationResult> {
  console.log(`Optimizing: ${product.title}`);

  // Run all optimizations in parallel
  const [titleResult, descResult, priceResult, seoResult, tags] = await Promise.all([
    optimizeTitle(product),
    optimizeDescription(product),
    optimizePrice(product),
    optimizeSEO(product),
    generateTags(product)
  ]);

  // Calculate overall score
  const overallScore = Math.round(
    (titleResult.score + descResult.score + seoResult.score + priceResult.priceCompetitiveness) / 4
  );

  return {
    productId: product.id,
    original: {
      title: product.title,
      description: product.description,
      price: product.price
    },
    optimized: {
      title: titleResult.title,
      description: descResult.description,
      seoTitle: seoResult.seoTitle,
      seoDescription: seoResult.seoDescription,
      suggestedPrice: priceResult.suggestedPrice,
      competitorPrices: priceResult.competitorPrices,
      tags,
      highlights: descResult.highlights
    },
    scores: {
      titleScore: titleResult.score,
      descriptionScore: descResult.score,
      seoScore: seoResult.score,
      priceCompetitiveness: priceResult.priceCompetitiveness,
      overallScore
    }
  };
}

// ============================================================================
// BATCH OPTIMIZATION
// ============================================================================

/**
 * Optimize multiple products with rate limiting
 */
export async function batchOptimizeProducts(
  products: Product[],
  options?: {
    applyChanges?: boolean;
    minScoreToApply?: number;
  }
): Promise<BatchOptimizationResult> {
  const { applyChanges = false, minScoreToApply = 60 } = options || {};

  const result: BatchOptimizationResult = {
    total: products.length,
    optimized: 0,
    failed: 0,
    results: [],
    errors: []
  };

  for (const product of products) {
    try {
      const optimization = await optimizeProduct(product);
      result.results.push(optimization);

      // Apply changes if enabled and score is high enough
      if (applyChanges && optimization.scores.overallScore >= minScoreToApply) {
        await applyOptimization(product.id, optimization);
        result.optimized++;
      }

      // Rate limiting - OpenAI has limits
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error: any) {
      result.failed++;
      result.errors.push(`${product.title}: ${error.message}`);
    }
  }

  return result;
}

// ============================================================================
// APPLY OPTIMIZATION TO SHOPIFY
// ============================================================================

/**
 * Apply optimization results to Shopify product
 */
export async function applyOptimization(
  productId: string,
  optimization: OptimizationResult
): Promise<boolean> {
  try {
    // Update product
    const productUpdate = {
      product: {
        id: productId,
        title: optimization.optimized.title,
        body_html: optimization.optimized.description,
        tags: optimization.optimized.tags.join(', '),
        metafields: [
          // SEO
          {
            namespace: 'global',
            key: 'title_tag',
            value: optimization.optimized.seoTitle,
            type: 'single_line_text_field'
          },
          {
            namespace: 'global',
            key: 'description_tag',
            value: optimization.optimized.seoDescription,
            type: 'single_line_text_field'
          },
          // Competitor prices (for NA Bulk Price Editor compatibility)
          {
            namespace: 'compare_prices',
            key: 'amazon_price',
            value: optimization.optimized.competitorPrices.amazon.toString(),
            type: 'number_decimal'
          },
          {
            namespace: 'compare_prices',
            key: 'costco_price',
            value: optimization.optimized.competitorPrices.costco.toString(),
            type: 'number_decimal'
          },
          {
            namespace: 'compare_prices',
            key: 'ebay_price',
            value: optimization.optimized.competitorPrices.ebay.toString(),
            type: 'number_decimal'
          },
          {
            namespace: 'compare_prices',
            key: 'sams_price',
            value: optimization.optimized.competitorPrices.sams.toString(),
            type: 'number_decimal'
          },
          // AI optimization metadata
          {
            namespace: 'ai_optimization',
            key: 'last_optimized',
            value: new Date().toISOString(),
            type: 'single_line_text_field'
          },
          {
            namespace: 'ai_optimization',
            key: 'optimization_score',
            value: optimization.scores.overallScore.toString(),
            type: 'number_integer'
          },
          // Product highlights for Google Shopping
          {
            namespace: 'google',
            key: 'product_highlights',
            value: JSON.stringify(optimization.optimized.highlights),
            type: 'json'
          }
        ]
      }
    };

    const response = await fetch(
      `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/products/${productId}.json`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        },
        body: JSON.stringify(productUpdate)
      }
    );

    return response.ok;
  } catch (error) {
    console.error('Apply optimization error:', error);
    return false;
  }
}

// ============================================================================
// OPTIMIZATION ANALYSIS
// ============================================================================

/**
 * Analyze products and identify optimization opportunities
 */
export async function analyzeOptimizationOpportunities(products: Product[]): Promise<{
  needsOptimization: Product[];
  wellOptimized: Product[];
  issues: { product: Product; issues: string[] }[];
}> {
  const needsOptimization: Product[] = [];
  const wellOptimized: Product[] = [];
  const issues: { product: Product; issues: string[] }[] = [];

  for (const product of products) {
    const productIssues: string[] = [];

    // Title checks
    if (product.title.length < 30) productIssues.push('Title too short (<30 chars)');
    if (product.title.length > 200) productIssues.push('Title too long (>200 chars)');
    if (product.title === product.title.toUpperCase()) productIssues.push('Title is ALL CAPS');
    if (/best|amazing|#1|top rated/i.test(product.title)) productIssues.push('Title has promotional language');

    // Description checks
    if (!product.description || product.description.length < 100) {
      productIssues.push('Description too short or missing');
    }

    // Price checks
    if (!product.costPrice) {
      productIssues.push('No cost price set - cannot optimize margins');
    }

    // Categorize
    if (productIssues.length > 0) {
      needsOptimization.push(product);
      issues.push({ product, issues: productIssues });
    } else {
      wellOptimized.push(product);
    }
  }

  return { needsOptimization, wellOptimized, issues };
}

// ============================================================================
// DISCOVERED PRODUCT OPTIMIZATION
// ============================================================================

/**
 * Optimize a newly discovered product before publishing
 * Called during product discovery to enhance listings
 */
export async function optimizeDiscoveredProduct(rawProduct: {
  asin: string;
  title: string;
  amazonPrice: number;
  rating: number;
  reviewCount: number;
  category: string;
  imageUrl: string;
}): Promise<{
  title: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  salesPrice: number;
  competitorPrices: { amazon: number; costco: number; ebay: number; sams: number };
  tags: string[];
  highlights: string[];
}> {
  // Calculate pricing
  const salesPrice = calculateSalesPrice(rawProduct.amazonPrice);
  const competitorPrices = calculateCompetitorPrices(salesPrice);

  // Create a product object for optimization
  const product: Product = {
    id: rawProduct.asin,
    title: rawProduct.title,
    description: '',
    price: salesPrice,
    costPrice: rawProduct.amazonPrice,
    category: rawProduct.category
  };

  // Run optimizations
  const [titleResult, descResult, seoResult, tags] = await Promise.all([
    optimizeTitle(product),
    optimizeDescription(product),
    optimizeSEO(product),
    generateTags(product)
  ]);

  return {
    title: titleResult.title,
    description: descResult.description,
    seoTitle: seoResult.seoTitle,
    seoDescription: seoResult.seoDescription,
    salesPrice,
    competitorPrices,
    tags,
    highlights: descResult.highlights
  };
}

// ============================================================================
// EXPORT SUMMARY
// ============================================================================

export default {
  // Single product
  optimizeTitle,
  optimizeDescription,
  optimizePrice,
  optimizeSEO,
  generateTags,
  optimizeProduct,
  
  // Batch operations
  batchOptimizeProducts,
  applyOptimization,
  analyzeOptimizationOpportunities,
  
  // Discovery integration
  optimizeDiscoveredProduct,
  
  // Price calculations
  calculateSalesPrice,
  calculateCompetitorPrices
};
