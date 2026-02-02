// lib/content-cleaner.ts
// Clean product content: remove Amazon references, shorten titles, generate competitor prices
// Used for eBay and Shopify exports

import { PRICING_RULES, COMPETITOR_NAMES, type CompetitorKey } from '@/lib/config/pricing-rules';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CleanedProduct {
  asin: string;
  title: string;
  titleShort: string; // Max 80 chars for eBay
  description: string;
  descriptionHtml: string;
  brand: string;
  features: string[];
  images: string[];
  mainImage: string | null;
  barcode: string | null;
  category: string;
  dimensions: string | null;
  weight: number | null; // in grams
  // Pricing
  costPrice: number;
  retailPrice: number;
  compareAtPrice: number;
  competitorPrices: {
    amazon: number;
    costco: number;
    ebay: number;
    samsclub: number;
  };
}

export interface RawProductData {
  asin: string;
  title?: string;
  description?: string;
  features?: string[];
  images?: string[];
  brand?: string;
  category?: string;
  barcode?: string;
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
    unit?: string;
  };
  weight?: {
    value?: number;
    unit?: string;
  };
  price: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// AMAZON REFERENCE PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const AMAZON_PATTERNS = [
  // URLs
  /https?:\/\/(www\.)?amazon\.(com|co\.uk|ca|de|fr|es|it|jp|com\.au|in)[^\s]*/gi,
  /amzn\.(to|com)[^\s]*/gi,
  
  // Text references
  /visit the .+ store/gi,
  /by .+ \(visit the .+ store\)/gi,
  /amazon'?s? choice/gi,
  /amazon best seller/gi,
  /amazon exclusive/gi,
  /best seller in .+/gi,
  /\#1 best seller/gi,
  /fulfilled by amazon/gi,
  /ships from amazon/gi,
  /sold by amazon/gi,
  /amazon prime/gi,
  /prime eligible/gi,
  /free shipping with prime/gi,
  /see all .+ products/gi,
  /compare with similar items/gi,
  /customers who viewed this item also viewed/gi,
  /frequently bought together/gi,
  /sponsored products related to this item/gi,
  /from the manufacturer/gi,
  
  // HTML artifacts
  /<a[^>]*amazon[^>]*>.*?<\/a>/gi,
  /data-asin="[^"]*"/gi,
  /asin:[A-Z0-9]{10}/gi,
];

const TITLE_CLEANUP_PATTERNS = [
  // Remove brand repetition at start
  /^(\w+)\s*[-–—]\s*\1/gi,
  
  // Remove common marketing fluff
  /\s*[-–—]\s*(new|latest|upgraded?|improved|premium|professional|pro|deluxe)\s*$/gi,
  /\s*\(.*pack of \d+.*\)/gi,
  /\s*\[.*\]/g,
  /\s*\|.*$/g,
  
  // Remove excessive punctuation
  /\s*[,!]+\s*$/g,
  /\s{2,}/g,
];

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT CLEANING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Remove all Amazon references from text
 */
export function removeAmazonReferences(text: string): string {
  if (!text) return '';
  
  let cleaned = text;
  
  for (const pattern of AMAZON_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Clean up extra whitespace and punctuation
  cleaned = cleaned
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/gm, '')
    .trim();
  
  return cleaned;
}

/**
 * Clean and shorten title for eBay (max 80 chars)
 */
export function cleanTitle(title: string, maxLength: number = 200): string {
  if (!title) return '';
  
  let cleaned = removeAmazonReferences(title);
  
  // Apply cleanup patterns
  for (const pattern of TITLE_CLEANUP_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  cleaned = cleaned.trim();
  
  // Truncate if needed
  if (cleaned.length > maxLength) {
    // Try to cut at a word boundary
    const truncated = cleaned.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.7) {
      cleaned = truncated.substring(0, lastSpace).trim();
    } else {
      cleaned = truncated.trim();
    }
  }
  
  return cleaned;
}

/**
 * Shorten title for eBay (strict 80 char limit)
 */
export function shortenTitleForEbay(title: string): string {
  const cleaned = cleanTitle(title, 80);
  
  if (cleaned.length <= 80) return cleaned;
  
  // More aggressive shortening
  let short = cleaned;
  
  // Remove common words
  const removeWords = [
    'with', 'for', 'and', 'the', 'in', 'on', 'at', 'to', 'of',
    'a', 'an', 'is', 'are', 'be', 'has', 'have', 'been',
    'new', 'brand', 'genuine', 'original', 'authentic',
  ];
  
  for (const word of removeWords) {
    if (short.length <= 80) break;
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    short = short.replace(regex, '').replace(/\s{2,}/g, ' ').trim();
  }
  
  // Final truncate
  if (short.length > 80) {
    short = short.substring(0, 77) + '...';
  }
  
  return short;
}

/**
 * Clean description HTML
 */
export function cleanDescription(description: string): string {
  if (!description) return '';
  
  let cleaned = removeAmazonReferences(description);
  
  // Remove empty tags
  cleaned = cleaned.replace(/<([a-z]+)[^>]*>\s*<\/\1>/gi, '');
  
  // Remove style and script tags
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  
  // Clean up
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  
  return cleaned;
}

/**
 * Clean features list
 */
export function cleanFeatures(features: string[]): string[] {
  if (!features || !Array.isArray(features)) return [];
  
  return features
    .map(f => removeAmazonReferences(f))
    .filter(f => f.length > 0 && f.length < 500)
    .slice(0, 10); // Max 10 features
}

// ═══════════════════════════════════════════════════════════════════════════
// PRICE CALCULATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate retail price from Amazon cost
 */
export function calculateRetailPrice(amazonCost: number): number {
  return amazonCost * PRICING_RULES.yourMarkup.multiplier;
}

/**
 * Generate competitor prices (75-90% above YOUR retail price)
 * Random per product for variety
 */
export function generateCompetitorPrices(retailPrice: number): {
  amazon: number;
  costco: number;
  ebay: number;
  samsclub: number;
} {
  const { ranges } = PRICING_RULES.competitors;
  
  // Generate random multiplier within each range
  const randomInRange = (min: number, max: number): number => {
    return min + Math.random() * (max - min);
  };
  
  return {
    amazon: Math.round(retailPrice * randomInRange(ranges.amazon.min, ranges.amazon.max) * 100) / 100,
    costco: Math.round(retailPrice * randomInRange(ranges.costco.min, ranges.costco.max) * 100) / 100,
    ebay: Math.round(retailPrice * randomInRange(ranges.ebay.min, ranges.ebay.max) * 100) / 100,
    samsclub: Math.round(retailPrice * randomInRange(ranges.sams.min, ranges.sams.max) * 100) / 100,
  };
}

/**
 * Calculate compare-at price (highest competitor)
 */
export function calculateCompareAtPrice(competitorPrices: {
  amazon: number;
  costco: number;
  ebay: number;
  samsclub: number;
}): number {
  return Math.max(
    competitorPrices.amazon,
    competitorPrices.costco,
    competitorPrices.ebay,
    competitorPrices.samsclub
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FULL PRODUCT CLEANING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clean and enrich a product for export
 */
export function cleanProduct(raw: RawProductData): CleanedProduct {
  // Clean text content
  const title = cleanTitle(raw.title || `Product ${raw.asin}`);
  const titleShort = shortenTitleForEbay(title);
  const description = cleanDescription(raw.description || '');
  const features = cleanFeatures(raw.features || []);
  const brand = removeAmazonReferences(raw.brand || 'Unbranded');
  const category = removeAmazonReferences(raw.category || 'General');
  
  // Process images
  const images = (raw.images || []).filter(img => {
    // Filter out Amazon-hosted placeholder images
    if (!img) return false;
    if (img.includes('no-image')) return false;
    return true;
  });
  const mainImage = images.length > 0 ? images[0] : null;
  
  // Process dimensions
  let dimensions: string | null = null;
  if (raw.dimensions) {
    const { length, width, height, unit } = raw.dimensions;
    if (length && width && height) {
      dimensions = `${length} x ${width} x ${height} ${unit || 'inches'}`;
    }
  }
  
  // Process weight (convert to grams)
  let weight: number | null = null;
  if (raw.weight?.value) {
    const { value, unit } = raw.weight;
    if (unit === 'pounds' || unit === 'lb') {
      weight = Math.round(value * 453.592);
    } else if (unit === 'ounces' || unit === 'oz') {
      weight = Math.round(value * 28.3495);
    } else if (unit === 'kg' || unit === 'kilograms') {
      weight = Math.round(value * 1000);
    } else {
      weight = Math.round(value); // Assume grams
    }
  }
  
  // Calculate prices
  const costPrice = raw.price;
  const retailPrice = calculateRetailPrice(costPrice);
  const competitorPrices = generateCompetitorPrices(retailPrice);
  const compareAtPrice = calculateCompareAtPrice(competitorPrices);
  
  // Generate description HTML
  let descriptionHtml = '';
  if (description) {
    descriptionHtml += `<p>${description}</p>`;
  }
  if (features.length > 0) {
    descriptionHtml += '<ul>';
    for (const feature of features) {
      descriptionHtml += `<li>${feature}</li>`;
    }
    descriptionHtml += '</ul>';
  }
  
  return {
    asin: raw.asin,
    title,
    titleShort,
    description,
    descriptionHtml,
    brand,
    features,
    images,
    mainImage,
    barcode: raw.barcode || null,
    category,
    dimensions,
    weight,
    costPrice,
    retailPrice,
    compareAtPrice,
    competitorPrices,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clean multiple products
 */
export function cleanProducts(products: RawProductData[]): CleanedProduct[] {
  return products.map(p => cleanProduct(p));
}

/**
 * Validate cleaned product has required fields
 */
export function validateCleanedProduct(product: CleanedProduct): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!product.asin || product.asin.length !== 10) {
    errors.push('Invalid ASIN');
  }
  
  if (!product.title || product.title.length < 5) {
    errors.push('Title too short');
  }
  
  if (!product.costPrice || product.costPrice <= 0) {
    errors.push('Invalid cost price');
  }
  
  if (!product.retailPrice || product.retailPrice <= product.costPrice) {
    errors.push('Invalid retail price');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
