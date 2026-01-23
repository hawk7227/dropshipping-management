// lib/google-shopping-optimizer.ts
// ============================================================================
// GOOGLE SHOPPING OPTIMIZATION ENGINE
// Maximize Sales from Ready-to-Buy Customers
// ============================================================================
//
// This engine is specifically designed to:
// 1. Get your products in front of HIGH-INTENT buyers (ready to purchase NOW)
// 2. WIN THE CLICK with optimized titles that match buyer searches
// 3. CONVERT CLICKS TO SALES with competitive pricing and trust signals
// 4. MAXIMIZE ROAS by focusing budget on high-margin, high-converting products
//
// Daily Optimization Flow:
// - 5 AM: Analyze all products and performance data
// - Identify underperformers (high impressions, low CTR)
// - Re-optimize titles for buyer intent keywords
// - Update custom labels for smart bidding
// - Generate supplemental feed updates
// ============================================================================

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================================================
// TYPES
// ============================================================================

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  costPrice?: number;
  category?: string;
  brand?: string;
  gtin?: string;
  mpn?: string;
  imageUrl?: string;
  link?: string;
  availability?: string;
  condition?: string;
  tags?: string[];
  
  // Performance metrics (from Google Ads/Merchant Center)
  impressions?: number;
  clicks?: number;
  conversions?: number;
  revenue?: number;
  cost?: number;
}

interface GoogleShoppingOptimization {
  productId: string;
  
  // Optimized content
  optimizedTitle: string;
  optimizedDescription: string;
  googleProductCategory: string;
  productType: string;
  productHighlights: string[];
  
  // Custom labels for Smart Bidding
  customLabel0: string;  // margin_tier
  customLabel1: string;  // performance_tier
  customLabel2: string;  // price_position
  customLabel3: string;  // buyer_intent
  customLabel4: string;  // seasonality
  
  // Scores
  scores: {
    titleScore: number;
    descriptionScore: number;
    categoryMatch: number;
    priceCompetitiveness: number;
    conversionPotential: number;
    overallScore: number;
  };
  
  // Action items
  recommendations: string[];
  priority: 'high' | 'medium' | 'low';
}

// ============================================================================
// HIGH-INTENT BUYER KEYWORDS
// These indicate someone ready to BUY, not just browse
// ============================================================================

const HIGH_INTENT_BUYER_SIGNALS = {
  // Transactional intent (HIGHEST conversion rate)
  transactional: [
    'buy', 'purchase', 'order', 'shop', 'get',
    'for sale', 'price', 'cost', 'cheap', 'affordable',
    'discount', 'deal', 'sale', 'coupon', 'promo'
  ],
  
  // Commercial investigation (HIGH conversion rate)
  commercial: [
    'best', 'top', 'review', 'reviews', 'rating',
    'vs', 'versus', 'compare', 'comparison',
    'alternative', 'better than', 'worth it'
  ],
  
  // Urgency signals (IMMEDIATE purchase intent)
  urgency: [
    'same day', 'next day', 'fast shipping', 'express',
    'in stock', 'available', 'ready to ship',
    'need', 'asap', 'urgent', 'today'
  ],
  
  // Specificity signals (READY to buy specific item)
  specificity: [
    'for iphone', 'for samsung', 'for dog', 'for cat',
    '64gb', '128gb', '256gb', 'xl', 'large', 'small',
    'black', 'white', 'blue', 'red', 'pink',
    '2-pack', '3-pack', 'set of', 'bundle'
  ]
};

// ============================================================================
// GOOGLE PRODUCT CATEGORIES (Exact Taxonomy)
// ============================================================================

const GOOGLE_CATEGORIES: Record<string, string> = {
  // Electronics
  'phone case': 'Electronics > Communications > Telephony > Mobile Phone Accessories > Mobile Phone Cases',
  'phone charger': 'Electronics > Electronics Accessories > Power > Power Adapters & Chargers',
  'wireless earbuds': 'Electronics > Audio > Audio Accessories > Headphones & Headsets',
  'bluetooth speaker': 'Electronics > Audio > Audio Accessories > Speakers > Portable Speakers',
  'power bank': 'Electronics > Electronics Accessories > Power > Power Adapters & Chargers',
  'screen protector': 'Electronics > Communications > Telephony > Mobile Phone Accessories > Mobile Phone Screen Protectors',
  'usb cable': 'Electronics > Electronics Accessories > Cables > USB Cables',
  'smart watch': 'Electronics > Electronics Accessories > Wearable Technology > Smart Watches',
  
  // Home & Kitchen
  'kitchen gadget': 'Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils',
  'air fryer': 'Home & Garden > Kitchen & Dining > Kitchen Appliances > Fryers',
  'blender': 'Home & Garden > Kitchen & Dining > Kitchen Appliances > Blenders',
  'coffee maker': 'Home & Garden > Kitchen & Dining > Kitchen Appliances > Coffee Makers',
  'food storage': 'Home & Garden > Kitchen & Dining > Food Storage > Food Storage Containers',
  'water bottle': 'Home & Garden > Kitchen & Dining > Barware > Water Bottles',
  'cutting board': 'Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils > Cutting Boards',
  
  // Pet Supplies
  'dog bed': 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Beds',
  'cat toy': 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Toys',
  'dog toy': 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Toys',
  'pet bowl': 'Animals & Pet Supplies > Pet Supplies > Pet Bowls, Feeders & Waterers',
  'dog leash': 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Leashes',
  'cat litter': 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Litter',
  
  // Beauty & Personal Care
  'makeup brush': 'Health & Beauty > Personal Care > Cosmetics > Cosmetic Tool Accessories > Makeup Brushes',
  'hair dryer': 'Health & Beauty > Personal Care > Hair Care > Hair Dryers',
  'skincare': 'Health & Beauty > Personal Care > Cosmetics > Skin Care',
  'nail polish': 'Health & Beauty > Personal Care > Cosmetics > Nail Care > Nail Polish',
  
  // Fitness
  'yoga mat': 'Sporting Goods > Exercise & Fitness > Yoga & Pilates > Yoga Mats',
  'resistance band': 'Sporting Goods > Exercise & Fitness > Strength Training > Resistance Bands',
  'dumbbell': 'Sporting Goods > Exercise & Fitness > Strength Training > Free Weights',
  'fitness tracker': 'Electronics > Electronics Accessories > Wearable Technology > Fitness Trackers',
  
  // Office
  'desk organizer': 'Office Supplies > Desk Accessories > Desk Organizers',
  'notebook': 'Office Supplies > Paper Products > Notebooks & Pads',
  'pen': 'Office Supplies > Writing Instruments > Pens',
  
  // Baby & Kids
  'baby bottle': 'Baby & Toddler > Nursing & Feeding > Baby Bottles',
  'diaper bag': 'Baby & Toddler > Baby Transport Accessories > Diaper Bags',
  'baby toy': 'Baby & Toddler > Baby Toys'
};

// ============================================================================
// TITLE OPTIMIZATION FOR GOOGLE SHOPPING
// ============================================================================

/**
 * Generate Google Shopping optimized title that WINS CLICKS
 * 
 * Key principles:
 * 1. Front-load the PRIMARY KEYWORD (what buyers search)
 * 2. Include SPECIFIC ATTRIBUTES (size, color, quantity)
 * 3. Add BRAND if recognized
 * 4. Keep 70-150 characters
 */
async function optimizeGoogleTitle(product: Product): Promise<{
  title: string;
  primaryKeyword: string;
  score: number;
}> {
  const prompt = `You are a Google Shopping expert. Create a title that will WIN CLICKS from ready-to-buy customers.

PRODUCT: ${product.title}
BRAND: ${product.brand || 'Generic'}
CATEGORY: ${product.category || 'General'}
PRICE: $${product.price}

GOOGLE SHOPPING TITLE FORMULA:
[Primary Keyword] + [Brand] + [Key Feature] + [Size/Color/Qty] - [Differentiator]

RULES:
1. 70-150 characters (shows fully on all devices)
2. FRONT-LOAD the exact term buyers search for
3. Include specifics: size, color, quantity, material
4. Add brand if it's a selling point
5. NO promotional words (Best, Amazing, Sale, Free)
6. NO ALL CAPS except acronyms (USB, LED, etc.)

WINNING TITLE EXAMPLES:
- "Wireless Earbuds Bluetooth 5.3 with 40H Battery - IPX7 Waterproof, Black"
- "iPhone 15 Pro Max Case MagSafe - Clear Shockproof, Military Grade Drop Protection"
- "Dog Bed Large Orthopedic Memory Foam - Washable Cover, 36x28 inch, Gray"
- "Air Fryer 4-Quart Digital - 8 Preset Functions, Dishwasher Safe, Stainless Steel"
- "Resistance Bands Set 5-Pack - Latex Free, Exercise Guide Included, All Fitness Levels"

WHAT BUYERS SEARCH (match these patterns):
- "[product] for [device/use]" → "Phone Case for iPhone 15"
- "[product] [size/capacity]" → "Water Bottle 32oz"
- "[product] [color]" → "Yoga Mat Black"
- "[adjective] [product]" → "Wireless Earbuds"

Respond in JSON:
{
  "optimizedTitle": "the winning title",
  "primaryKeyword": "the main search term",
  "score": 0-100,
  "whyItConverts": "brief explanation"
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
      primaryKeyword: result.primaryKeyword || '',
      score: result.score || 50
    };
  } catch (error) {
    console.error('Title optimization error:', error);
    return { title: product.title, primaryKeyword: '', score: 50 };
  }
}

// ============================================================================
// DESCRIPTION OPTIMIZATION FOR CONVERSIONS
// ============================================================================

/**
 * Generate description that CONVERTS browsers to buyers
 */
async function optimizeGoogleDescription(product: Product): Promise<{
  description: string;
  score: number;
}> {
  const prompt = `Write a Google Shopping description that CONVERTS browsers into BUYERS.

PRODUCT: ${product.title}
DESCRIPTION: ${product.description?.substring(0, 500) || 'None provided'}
PRICE: $${product.price}
CATEGORY: ${product.category || 'General'}

CONVERSION-FOCUSED DESCRIPTION RULES:
1. 500-1500 characters (sweet spot for Shopping)
2. First sentence = WHAT IT IS + WHO IT'S FOR + MAIN BENEFIT
3. Next 2-3 sentences = KEY FEATURES as BENEFITS
4. NO promotional claims (best, amazing, #1)
5. NO pricing or shipping info
6. NO competitor mentions
7. Include natural keywords (what buyers search)

STRUCTURE:
"[Product] is perfect for [who] looking to [benefit]. Features [feature 1] for [why it matters]. [Feature 2] ensures [benefit]. [Feature 3] makes it [benefit]. Designed for [use case]."

Respond in JSON:
{
  "optimizedDescription": "...",
  "score": 0-100
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.4
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return {
      description: result.optimizedDescription || product.description,
      score: result.score || 50
    };
  } catch (error) {
    console.error('Description optimization error:', error);
    return { description: product.description, score: 50 };
  }
}

// ============================================================================
// PRODUCT HIGHLIGHTS (Bullet Points in Ads)
// ============================================================================

/**
 * Generate product highlights for Google Shopping ads
 * These appear as scannable bullet points
 */
async function generateHighlights(product: Product): Promise<string[]> {
  const prompt = `Generate 4-6 product highlights for Google Shopping.

PRODUCT: ${product.title}
CATEGORY: ${product.category || 'General'}

HIGHLIGHT RULES:
1. 6-15 words each
2. Start with the BENEFIT or specific FEATURE
3. Include NUMBERS when possible (40h battery, 5-pack, 32oz)
4. Focus on what BUYERS care about
5. NO promotional language

EXAMPLES:
- "40-hour battery life on a single charge"
- "IPX7 waterproof - safe for rain and workouts"
- "Compatible with iPhone 15, 14, 13, and 12 series"
- "Memory foam padding provides all-day comfort"
- "Dishwasher-safe parts for easy cleaning"
- "Includes 2-year manufacturer warranty"

Respond in JSON:
{
  "highlights": ["highlight 1", "highlight 2", "highlight 3", "highlight 4", "highlight 5"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.5
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return result.highlights || [];
  } catch (error) {
    console.error('Highlights generation error:', error);
    return [];
  }
}

// ============================================================================
// CUSTOM LABELS FOR SMART BIDDING
// ============================================================================

/**
 * Generate custom labels that help Google's AI bid smarter
 * 
 * Custom Label Strategy:
 * - label0: Margin tier → Bid more on high-margin products
 * - label1: Performance → Boost winners, fix/pause losers
 * - label2: Price position → Highlight price leaders
 * - label3: Buyer intent → Target high-intent categories
 * - label4: Seasonality → Adjust for timing
 */
function generateCustomLabels(product: Product): {
  customLabel0: string;
  customLabel1: string;
  customLabel2: string;
  customLabel3: string;
  customLabel4: string;
} {
  // LABEL 0: Margin Tier (for ROAS bidding)
  let marginTier = 'margin_medium';
  if (product.costPrice && product.price) {
    const marginPercent = ((product.price - product.costPrice) / product.costPrice) * 100;
    if (marginPercent >= 80) marginTier = 'margin_high';       // 80%+ markup - bid aggressively
    else if (marginPercent >= 50) marginTier = 'margin_good';   // 50-79% markup - standard bids
    else if (marginPercent >= 30) marginTier = 'margin_medium'; // 30-49% markup - careful bids
    else marginTier = 'margin_low';                              // <30% markup - minimal bids
  }

  // LABEL 1: Performance Tier (from conversion data)
  let performanceTier = 'perf_new';
  if (product.impressions && product.impressions > 100) {
    const ctr = (product.clicks || 0) / product.impressions * 100;
    const convRate = product.clicks ? ((product.conversions || 0) / product.clicks * 100) : 0;
    const roas = product.cost && product.cost > 0 ? (product.revenue || 0) / product.cost : 0;

    if (roas >= 5 && convRate >= 3) performanceTier = 'perf_star';        // Stars: maximize
    else if (roas >= 2 && convRate >= 1.5) performanceTier = 'perf_good';  // Good: grow
    else if (roas >= 1) performanceTier = 'perf_ok';                       // OK: optimize
    else if (ctr < 1) performanceTier = 'perf_low_ctr';                    // Low CTR: fix title
    else performanceTier = 'perf_low_conv';                                // Low conv: fix price/page
  }

  // LABEL 2: Price Position (vs displayed competitors)
  let pricePosition = 'price_competitive';
  if (product.compareAtPrice && product.price) {
    const discount = ((product.compareAtPrice - product.price) / product.compareAtPrice) * 100;
    if (discount >= 45) pricePosition = 'price_leader';      // 45%+ off - major advantage
    else if (discount >= 30) pricePosition = 'price_great';  // 30-44% off - strong advantage
    else if (discount >= 15) pricePosition = 'price_good';   // 15-29% off - competitive
    else pricePosition = 'price_standard';                   // <15% off - standard
  }

  // LABEL 3: Buyer Intent (product type analysis)
  let buyerIntent = 'intent_medium';
  const title = product.title.toLowerCase();
  const category = (product.category || '').toLowerCase();
  
  // High intent: replacement/refill items, chargers, cables, consumables
  if (title.includes('replacement') || title.includes('refill') || 
      title.includes('charger') || title.includes('cable') ||
      title.includes('battery') || title.includes('filter')) {
    buyerIntent = 'intent_high';
  }
  // Low intent: decorative, luxury, gift items (more consideration)
  else if (title.includes('decor') || title.includes('art') ||
           title.includes('luxury') || title.includes('gift') ||
           category.includes('jewelry')) {
    buyerIntent = 'intent_low';
  }

  // LABEL 4: Seasonality
  let seasonality = 'season_evergreen';
  const tags = (product.tags || []).join(' ').toLowerCase();
  const month = new Date().getMonth();
  
  if (tags.includes('christmas') || tags.includes('holiday') || 
      tags.includes('thanksgiving') || tags.includes('black friday')) {
    seasonality = month >= 9 ? 'season_peak' : 'season_off';  // Oct-Dec = peak
  } else if (tags.includes('summer') || tags.includes('beach') || tags.includes('outdoor')) {
    seasonality = (month >= 4 && month <= 8) ? 'season_peak' : 'season_off'; // May-Sep = peak
  } else if (tags.includes('back to school')) {
    seasonality = (month >= 6 && month <= 8) ? 'season_peak' : 'season_off'; // Jul-Sep = peak
  } else if (tags.includes('clearance') || tags.includes('closeout')) {
    seasonality = 'season_clearance';
  }

  return {
    customLabel0: marginTier,
    customLabel1: performanceTier,
    customLabel2: pricePosition,
    customLabel3: buyerIntent,
    customLabel4: seasonality
  };
}

// ============================================================================
// GOOGLE CATEGORY MATCHING
// ============================================================================

/**
 * Match product to exact Google Product Category
 */
function matchGoogleCategory(product: Product): string {
  const titleLower = product.title.toLowerCase();
  const categoryLower = (product.category || '').toLowerCase();
  
  // Try exact matches first
  for (const [keyword, googleCat] of Object.entries(GOOGLE_CATEGORIES)) {
    if (titleLower.includes(keyword) || categoryLower.includes(keyword)) {
      return googleCat;
    }
  }
  
  // Fallback to broad categories
  if (titleLower.includes('phone') || titleLower.includes('iphone') || titleLower.includes('samsung')) {
    return 'Electronics > Communications > Telephony > Mobile Phone Accessories';
  }
  if (titleLower.includes('dog') || titleLower.includes('cat') || titleLower.includes('pet')) {
    return 'Animals & Pet Supplies';
  }
  if (titleLower.includes('kitchen') || titleLower.includes('cooking')) {
    return 'Home & Garden > Kitchen & Dining';
  }
  
  return 'General';
}

// ============================================================================
// FULL OPTIMIZATION
// ============================================================================

/**
 * Complete Google Shopping optimization for a single product
 */
export async function optimizeForGoogleShopping(product: Product): Promise<GoogleShoppingOptimization> {
  console.log(`🛒 Optimizing for Google Shopping: ${product.title.substring(0, 50)}...`);

  // Run all optimizations
  const [titleResult, descResult, highlights] = await Promise.all([
    optimizeGoogleTitle(product),
    optimizeGoogleDescription(product),
    generateHighlights(product)
  ]);

  // Get category and labels
  const googleCategory = matchGoogleCategory(product);
  const labels = generateCustomLabels(product);

  // Calculate scores
  const priceCompetitiveness = product.compareAtPrice && product.price 
    ? Math.min(100, Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100 * 1.5))
    : 50;

  const conversionPotential = calculateConversionPotential(product, titleResult.title, labels);

  const overallScore = Math.round(
    titleResult.score * 0.30 +
    descResult.score * 0.20 +
    priceCompetitiveness * 0.25 +
    conversionPotential * 0.25
  );

  // Determine priority
  let priority: 'high' | 'medium' | 'low' = 'medium';
  if (labels.customLabel0 === 'margin_high' && overallScore >= 60) priority = 'high';
  if (labels.customLabel1 === 'perf_star') priority = 'high';
  if (labels.customLabel0 === 'margin_low' || overallScore < 40) priority = 'low';

  // Generate recommendations
  const recommendations = generateRecommendations(product, titleResult, descResult, labels, priceCompetitiveness);

  return {
    productId: product.id,
    optimizedTitle: titleResult.title,
    optimizedDescription: descResult.description,
    googleProductCategory: googleCategory,
    productType: product.category || 'General',
    productHighlights: highlights,
    ...labels,
    scores: {
      titleScore: titleResult.score,
      descriptionScore: descResult.score,
      categoryMatch: googleCategory !== 'General' ? 90 : 50,
      priceCompetitiveness,
      conversionPotential,
      overallScore
    },
    recommendations,
    priority
  };
}

// ============================================================================
// CONVERSION POTENTIAL CALCULATION
// ============================================================================

function calculateConversionPotential(
  product: Product, 
  optimizedTitle: string, 
  labels: ReturnType<typeof generateCustomLabels>
): number {
  let score = 50;

  // Title quality
  if (optimizedTitle.length >= 70 && optimizedTitle.length <= 150) score += 10;
  if (/\d/.test(optimizedTitle)) score += 5; // Has specifics (numbers)
  if (optimizedTitle.includes('-')) score += 3; // Well-structured

  // Margin indicator
  if (labels.customLabel0 === 'margin_high') score += 15;
  else if (labels.customLabel0 === 'margin_good') score += 10;
  else if (labels.customLabel0 === 'margin_medium') score += 5;

  // Buyer intent
  if (labels.customLabel3 === 'intent_high') score += 10;

  // Price position
  if (labels.customLabel2 === 'price_leader') score += 15;
  else if (labels.customLabel2 === 'price_great') score += 10;

  // Seasonality boost
  if (labels.customLabel4 === 'season_peak') score += 5;

  // Has identifiers
  if (product.gtin || product.mpn) score += 5;
  if (product.brand && product.brand !== 'Generic') score += 5;

  return Math.min(100, score);
}

// ============================================================================
// RECOMMENDATIONS ENGINE
// ============================================================================

function generateRecommendations(
  product: Product,
  titleResult: { score: number },
  descResult: { score: number },
  labels: ReturnType<typeof generateCustomLabels>,
  priceComp: number
): string[] {
  const recs: string[] = [];

  // Title issues
  if (titleResult.score < 70) {
    recs.push('📝 TITLE: Front-load the main search term buyers use');
  }

  // Description issues
  if (descResult.score < 70) {
    recs.push('📄 DESCRIPTION: Add more specific benefits, not just features');
  }

  // Price issues
  if (priceComp < 40) {
    recs.push('💰 PRICE: Increase compare-at price to show bigger savings');
  }

  // Performance issues
  if (labels.customLabel1 === 'perf_low_ctr') {
    recs.push('⚠️ LOW CTR: Title or image not compelling - needs rewrite');
  }
  if (labels.customLabel1 === 'perf_low_conv') {
    recs.push('⚠️ LOW CONVERSION: Price may be too high or landing page issues');
  }

  // Missing data
  if (!product.gtin && !product.mpn) {
    recs.push('🔍 IDENTIFIERS: Add GTIN or MPN for better ad placement');
  }
  if (!product.brand || product.brand === 'Generic') {
    recs.push('🏷️ BRAND: Add brand name to capture brand searches');
  }

  // Margin issues
  if (labels.customLabel0 === 'margin_low') {
    recs.push('📉 LOW MARGIN: Consider raising price or reducing ad spend');
  }

  return recs;
}

// ============================================================================
// BATCH OPTIMIZATION
// ============================================================================

/**
 * Optimize multiple products for Google Shopping
 */
export async function batchOptimizeForGoogleShopping(
  products: Product[],
  options?: {
    limit?: number;
    priorityOnly?: boolean;
    submitToGoogle?: boolean;
  }
): Promise<{
  total: number;
  optimized: number;
  highPriority: number;
  errors: string[];
  results: GoogleShoppingOptimization[];
}> {
  const { limit = 50, priorityOnly = false } = options || {};

  // Sort by margin (high margin first)
  const sorted = [...products].sort((a, b) => {
    const marginA = a.costPrice ? (a.price - a.costPrice) / a.costPrice : 0;
    const marginB = b.costPrice ? (b.price - b.costPrice) / b.costPrice : 0;
    return marginB - marginA;
  }).slice(0, limit);

  const result = {
    total: sorted.length,
    optimized: 0,
    highPriority: 0,
    errors: [] as string[],
    results: [] as GoogleShoppingOptimization[]
  };

  for (const product of sorted) {
    try {
      const optimization = await optimizeForGoogleShopping(product);
      
      if (priorityOnly && optimization.priority !== 'high') {
        continue;
      }

      result.results.push(optimization);
      result.optimized++;
      
      if (optimization.priority === 'high') {
        result.highPriority++;
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 800));

    } catch (error: any) {
      result.errors.push(`${product.id}: ${error.message}`);
    }
  }

  return result;
}

// ============================================================================
// UNDERPERFORMER DETECTION
// ============================================================================

/**
 * Find products wasting ad spend
 */
export function findUnderperformers(products: Product[]): {
  lowCtr: Product[];      // High impressions, low clicks
  lowConversion: Product[]; // High clicks, low sales
  negative: Product[];     // Losing money (ROAS < 1)
} {
  return {
    lowCtr: products.filter(p => {
      if (!p.impressions || p.impressions < 100) return false;
      const ctr = (p.clicks || 0) / p.impressions * 100;
      return ctr < 1; // Less than 1% CTR
    }),
    
    lowConversion: products.filter(p => {
      if (!p.clicks || p.clicks < 20) return false;
      const convRate = (p.conversions || 0) / p.clicks * 100;
      return convRate < 1; // Less than 1% conversion
    }),
    
    negative: products.filter(p => {
      if (!p.cost || p.cost < 10) return false;
      const roas = (p.revenue || 0) / p.cost;
      return roas < 1; // Losing money
    })
  };
}

// ============================================================================
// FEED GENERATION
// ============================================================================

/**
 * Generate supplemental feed for Google Merchant Center
 */
export function generateSupplementalFeed(optimizations: GoogleShoppingOptimization[]): string {
  const headers = [
    'id', 'title', 'description', 'google_product_category', 'product_type',
    'custom_label_0', 'custom_label_1', 'custom_label_2', 'custom_label_3', 'custom_label_4',
    'product_highlight'
  ];

  const rows = optimizations.map(opt => [
    opt.productId,
    `"${opt.optimizedTitle.replace(/"/g, '""')}"`,
    `"${opt.optimizedDescription.replace(/"/g, '""')}"`,
    `"${opt.googleProductCategory}"`,
    `"${opt.productType}"`,
    opt.customLabel0,
    opt.customLabel1,
    opt.customLabel2,
    opt.customLabel3,
    opt.customLabel4,
    `"${opt.productHighlights.join('|')}"`
  ]);

  return [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================



export default {
  optimizeForGoogleShopping,
  batchOptimizeForGoogleShopping,
  findUnderperformers,
  generateSupplementalFeed,
  generateCustomLabels,
  GOOGLE_CATEGORIES,
  HIGH_INTENT_BUYER_SIGNALS
};
