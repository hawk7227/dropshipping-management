// app/api/import/preview/route.ts
// FREE price preview - scrapes Amazon directly, no API costs
// Used by ImportPanel to show estimated prices before import

import { NextRequest, NextResponse } from 'next/server';
import { scrapeAmazonProduct, scrapeMultipleProducts, type AmazonScrapedProduct } from '@/lib/services/amazon-scraper';
import { PRICING_RULES } from '@/lib/config/pricing-rules';
import { roundToTwoDecimals } from '@/lib/utils/pricing-calculator';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface PreviewItem {
  // ─────────────────────────────────────────────────────────────────────────
  // IDENTIFIERS (4 fields)
  // ─────────────────────────────────────────────────────────────────────────
  asin: string;
  upc: string | null;
  ean: string | null;
  mpn: string | null;

  // ─────────────────────────────────────────────────────────────────────────
  // BASIC INFO (5 fields)
  // ─────────────────────────────────────────────────────────────────────────
  title: string | null;
  brand: string | null;
  category: string | null;
  description: string | null;
  bulletPoints: string[];

  // ─────────────────────────────────────────────────────────────────────────
  // PRICING (calculated)
  // ─────────────────────────────────────────────────────────────────────────
  amazonPrice: number | null;
  listPrice: number | null;
  salesPrice: number | null;
  profitAmount: number | null;
  profitPercent: number | null;
  profitStatus: 'high_profit' | 'profitable' | 'below_threshold' | 'unknown';
  meetsThreshold: boolean;

  // ─────────────────────────────────────────────────────────────────────────
  // IMAGES (5 fields)
  // ─────────────────────────────────────────────────────────────────────────
  mainImage: string | null;
  images: string[];

  // ─────────────────────────────────────────────────────────────────────────
  // DIMENSIONS & WEIGHT
  // ─────────────────────────────────────────────────────────────────────────
  weightOz: number | null;
  weightGrams: number | null;
  dimensions: string | null;
  packageDimensions: string | null;

  // ─────────────────────────────────────────────────────────────────────────
  // SOCIAL PROOF & AVAILABILITY
  // ─────────────────────────────────────────────────────────────────────────
  rating: number | null;
  reviewCount: number | null;
  isPrime: boolean;
  inStock: boolean;
  availability: string | null;
  stockQuantity: number | null;

  // ─────────────────────────────────────────────────────────────────────────
  // VARIANTS
  // ─────────────────────────────────────────────────────────────────────────
  colors: string[];
  sizes: string[];
  styles: string[];

  // ─────────────────────────────────────────────────────────────────────────
  // ADDITIONAL DETAILS
  // ─────────────────────────────────────────────────────────────────────────
  material: string | null;
  manufacturer: string | null;
  modelNumber: string | null;
  countryOfOrigin: string | null;
  dateFirstAvailable: string | null;
  bestSellersRank: { rank: number; category: string }[] | null;
  amazonUrl: string;

  // ─────────────────────────────────────────────────────────────────────────
  // SEO (Generated)
  // ─────────────────────────────────────────────────────────────────────────
  seoTitle: string | null;
  seoDescription: string | null;
  imageAltText: string | null;

  // ─────────────────────────────────────────────────────────────────────────
  // VALIDATION
  // ─────────────────────────────────────────────────────────────────────────
  validationReasons: string[];
  isValid: boolean;
  error?: string;
}

interface PreviewResponse {
  success: boolean;
  items: PreviewItem[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    inStock: number;
    outOfStock: number;
    meetsThreshold: number;
    avgProfitPercent: number | null;
    estimatedTotalProfit: number | null;
    // Additional stats
    withImages: number;
    withUPC: number;
    withWeight: number;
    withBrand: number;
    primeEligible: number;
    avgRating: number | null;
    totalReviews: number;
  };
  cost: {
    tokens: number;
    usd: number;
    message: string;
  };
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION CONFIG (same as import route)
// ═══════════════════════════════════════════════════════════════════════════

const DISCOVERY_CONFIG = {
  minPrice: PRICING_RULES.discovery.minAmazonPrice,
  maxPrice: PRICING_RULES.discovery.maxAmazonPrice,
  minReviews: PRICING_RULES.discovery.minReviews,
  minRating: PRICING_RULES.discovery.minRating,
  primeOnly: PRICING_RULES.discovery.requirePrime,
  markupMultiplier: PRICING_RULES.yourMarkup.multiplier,
  minProfitPercent: PRICING_RULES.profitThresholds.target,
  profitAlertThreshold: PRICING_RULES.profitThresholds.minimum,
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function calculatePricing(amazonPrice: number): {
  salesPrice: number;
  profitAmount: number;
  profitPercent: number;
  profitStatus: 'high_profit' | 'profitable' | 'below_threshold';
  meetsThreshold: boolean;
} {
  const salesPrice = roundToTwoDecimals(amazonPrice * DISCOVERY_CONFIG.markupMultiplier);
  const profitAmount = roundToTwoDecimals(salesPrice - amazonPrice);
  const profitPercent = roundToTwoDecimals((profitAmount / amazonPrice) * 100);
  
  let profitStatus: 'high_profit' | 'profitable' | 'below_threshold' = 'profitable';
  if (profitPercent >= DISCOVERY_CONFIG.minProfitPercent) {
    profitStatus = 'high_profit';
  } else if (profitPercent < DISCOVERY_CONFIG.profitAlertThreshold) {
    profitStatus = 'below_threshold';
  }
  
  return {
    salesPrice,
    profitAmount,
    profitPercent,
    profitStatus,
    meetsThreshold: profitPercent >= DISCOVERY_CONFIG.minProfitPercent,
  };
}

function validateProduct(product: AmazonScrapedProduct): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  // Out of stock check
  if (!product.inStock) {
    reasons.push('Out of stock');
  }
  
  // Price check
  if (product.price === null) {
    reasons.push('Price not found');
  } else {
    if (product.price < DISCOVERY_CONFIG.minPrice) {
      reasons.push(`Price $${product.price} below minimum $${DISCOVERY_CONFIG.minPrice}`);
    }
    if (product.price > DISCOVERY_CONFIG.maxPrice) {
      reasons.push(`Price $${product.price} above maximum $${DISCOVERY_CONFIG.maxPrice}`);
    }
  }
  
  // Rating check
  if (product.rating !== null && product.rating < DISCOVERY_CONFIG.minRating) {
    reasons.push(`Rating ${product.rating} below minimum ${DISCOVERY_CONFIG.minRating}`);
  }
  
  // Review check
  if (product.reviewCount !== null && product.reviewCount < DISCOVERY_CONFIG.minReviews) {
    reasons.push(`Reviews ${product.reviewCount} below minimum ${DISCOVERY_CONFIG.minReviews}`);
  }
  
  // Prime check
  if (DISCOVERY_CONFIG.primeOnly && !product.isPrime) {
    reasons.push('Not Prime eligible');
  }
  
  return {
    valid: reasons.length === 0,
    reasons,
  };
}

function transformToPreviewItem(scraped: AmazonScrapedProduct): PreviewItem {
  const validation = validateProduct(scraped);
  
  let pricing = null;
  if (scraped.price && scraped.price > 0) {
    pricing = calculatePricing(scraped.price);
  }
  
  return {
    // IDENTIFIERS (4 fields)
    asin: scraped.asin,
    upc: scraped.upc,
    ean: scraped.ean,
    mpn: scraped.mpn,

    // BASIC INFO (5 fields)
    title: scraped.title,
    brand: scraped.brand,
    category: scraped.category,
    description: scraped.description,
    bulletPoints: scraped.bulletPoints,

    // PRICING
    amazonPrice: scraped.price,
    listPrice: scraped.listPrice,
    salesPrice: pricing?.salesPrice ?? null,
    profitAmount: pricing?.profitAmount ?? null,
    profitPercent: pricing?.profitPercent ?? null,
    profitStatus: pricing?.profitStatus ?? 'unknown',
    meetsThreshold: pricing?.meetsThreshold ?? false,

    // IMAGES
    mainImage: scraped.mainImage,
    images: scraped.images,

    // DIMENSIONS & WEIGHT
    weightOz: scraped.weightOz,
    weightGrams: scraped.weightGrams,
    dimensions: scraped.dimensions,
    packageDimensions: scraped.packageDimensions,

    // SOCIAL PROOF & AVAILABILITY
    rating: scraped.rating,
    reviewCount: scraped.reviewCount,
    isPrime: scraped.isPrime,
    inStock: scraped.inStock,
    availability: scraped.availability,
    stockQuantity: scraped.stockQuantity,

    // VARIANTS
    colors: scraped.colors,
    sizes: scraped.sizes,
    styles: scraped.styles,

    // ADDITIONAL DETAILS
    material: scraped.material,
    manufacturer: scraped.manufacturer,
    modelNumber: scraped.modelNumber,
    countryOfOrigin: scraped.countryOfOrigin,
    dateFirstAvailable: scraped.dateFirstAvailable,
    bestSellersRank: scraped.bestSellersRank,
    amazonUrl: scraped.amazonUrl,

    // SEO
    seoTitle: scraped.seoTitle,
    seoDescription: scraped.seoDescription,
    imageAltText: scraped.imageAltText,

    // VALIDATION
    validationReasons: validation.reasons,
    isValid: validation.valid,
    error: scraped.error,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// API ROUTE
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest): Promise<NextResponse<PreviewResponse>> {
  try {
    const body = await request.json();
    const { asins } = body as { asins: string[] };
    
    if (!asins || !Array.isArray(asins) || asins.length === 0) {
      return NextResponse.json({
        success: false,
        items: [],
        summary: {
          total: 0,
          valid: 0,
          invalid: 0,
          inStock: 0,
          outOfStock: 0,
          meetsThreshold: 0,
          avgProfitPercent: null,
          estimatedTotalProfit: null,
          withImages: 0,
          withUPC: 0,
          withWeight: 0,
          withBrand: 0,
          primeEligible: 0,
          avgRating: null,
          totalReviews: 0,
        },
        cost: { tokens: 0, usd: 0, message: 'FREE - Direct scraping' },
        error: 'No ASINs provided',
      }, { status: 400 });
    }
    
    // Limit preview to 20 items to avoid rate limiting
    const limitedAsins = asins.slice(0, 20);
    
    console.log(`[Preview] Scraping ${limitedAsins.length} products (FREE)`);
    
    // Scrape Amazon directly - FREE!
    const scrapedProducts = await scrapeMultipleProducts(limitedAsins, 500);
    
    // Transform to preview items
    const items = scrapedProducts.map(transformToPreviewItem);
    
    // Calculate summary
    const valid = items.filter(i => i.isValid).length;
    const invalid = items.filter(i => !i.isValid).length;
    const inStock = items.filter(i => i.inStock).length;
    const outOfStock = items.filter(i => !i.inStock).length;
    const meetsThreshold = items.filter(i => i.meetsThreshold).length;
    
    const validProfits = items.filter(i => i.profitPercent !== null).map(i => i.profitPercent!);
    const avgProfitPercent = validProfits.length > 0 
      ? roundToTwoDecimals(validProfits.reduce((a, b) => a + b, 0) / validProfits.length)
      : null;
    
    const validAmounts = items.filter(i => i.profitAmount !== null && i.isValid).map(i => i.profitAmount!);
    const estimatedTotalProfit = validAmounts.length > 0
      ? roundToTwoDecimals(validAmounts.reduce((a, b) => a + b, 0))
      : null;

    // Additional stats for data completeness
    const withImages = items.filter(i => i.images.length > 0).length;
    const withUPC = items.filter(i => i.upc !== null).length;
    const withWeight = items.filter(i => i.weightGrams !== null).length;
    const withBrand = items.filter(i => i.brand !== null).length;
    const primeEligible = items.filter(i => i.isPrime).length;
    
    const validRatings = items.filter(i => i.rating !== null).map(i => i.rating!);
    const avgRating = validRatings.length > 0
      ? roundToTwoDecimals(validRatings.reduce((a, b) => a + b, 0) / validRatings.length)
      : null;
    
    const totalReviews = items.reduce((sum, i) => sum + (i.reviewCount || 0), 0);
    
    console.log(`[Preview] Complete: ${valid} valid, ${invalid} invalid, ${meetsThreshold} meet 70% threshold`);
    console.log(`[Preview] Data: ${withImages} with images, ${withUPC} with UPC, ${withWeight} with weight`);
    
    return NextResponse.json({
      success: true,
      items,
      summary: {
        total: items.length,
        valid,
        invalid,
        inStock,
        outOfStock,
        meetsThreshold,
        avgProfitPercent,
        estimatedTotalProfit,
        // Additional stats
        withImages,
        withUPC,
        withWeight,
        withBrand,
        primeEligible,
        avgRating,
        totalReviews,
      },
      cost: {
        tokens: 0,
        usd: 0,
        message: 'FREE - Direct Amazon scraping (no API costs)',
      },
    });
    
  } catch (error) {
    console.error('[Preview] Error:', error);
    return NextResponse.json({
      success: false,
      items: [],
      summary: {
        total: 0,
        valid: 0,
        invalid: 0,
        inStock: 0,
        outOfStock: 0,
        meetsThreshold: 0,
        avgProfitPercent: null,
        estimatedTotalProfit: null,
        withImages: 0,
        withUPC: 0,
        withWeight: 0,
        withBrand: 0,
        primeEligible: 0,
        avgRating: null,
        totalReviews: 0,
      },
      cost: { tokens: 0, usd: 0, message: 'FREE' },
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
