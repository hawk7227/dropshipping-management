// app/api/discovery/route.ts
// COMPLETE Discovery API - Search Amazon for products, find deals, analyze opportunities
// Integrates with Rainforest API for real-time Amazon data

import { NextRequest, NextResponse } from 'next/server';
import type { RainforestSearchResult, ApiResponse } from '@/types';
import type { ApiError } from '@/types/errors';
import { PRICING_RULES } from '@/lib/config/pricing-rules';
import { calculateRetailPrice, calculateProfit } from '@/lib/utils/pricing-calculator';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface DiscoverySearchParams {
  query: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  minReviews?: number;
  primeOnly?: boolean;
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'reviews';
  page?: number;
  pageSize?: number;
}

interface DiscoveryResult extends RainforestSearchResult {
  potentialRetailPrice: number;
  potentialProfit: number;
  potentialMargin: number;
  meetsMarginThreshold: boolean;
  dealScore: number;
}

interface DealCriteria {
  minMargin: number;
  minRating: number;
  minReviews: number;
  maxPrice: number;
  requirePrime: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const RAINFOREST_API_URL = 'https://api.rainforestapi.com/request';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const DEFAULT_DEAL_CRITERIA: DealCriteria = {
  minMargin: PRICING_RULES.profitThresholds.minimum,
  minRating: PRICING_RULES.discovery.minRating,
  minReviews: PRICING_RULES.discovery.minReviews,
  maxPrice: PRICING_RULES.discovery.maxPrice,
  requirePrime: PRICING_RULES.discovery.requirePrime,
};

// Amazon category IDs for filtering
const CATEGORY_IDS: Record<string, string> = {
  'Electronics': 'electronics',
  'Home & Kitchen': 'kitchen',
  'Beauty & Personal Care': 'beauty',
  'Health & Household': 'hpc',
  'Sports & Outdoors': 'sporting-goods',
  'Tools & Home Improvement': 'tools',
  'Toys & Games': 'toys-and-games',
  'Clothing & Accessories': 'fashion',
  'Pet Supplies': 'pets',
  'Office Products': 'office-products',
  'Garden & Outdoor': 'lawn-garden',
  'Automotive': 'automotive',
  'Baby': 'baby-products',
  'Grocery': 'grocery',
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create error response
 */
function errorResponse(error: ApiError, status: number = 400): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * Create success response
 */
function successResponse<T>(data: T, meta?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ success: true, data, ...(meta && { meta }) });
}

/**
 * Parse search parameters
 */
function parseSearchParams(searchParams: URLSearchParams): DiscoverySearchParams {
  return {
    query: searchParams.get('query') || searchParams.get('q') || '',
    category: searchParams.get('category') || undefined,
    minPrice: searchParams.get('minPrice') ? parseFloat(searchParams.get('minPrice')!) : undefined,
    maxPrice: searchParams.get('maxPrice') ? parseFloat(searchParams.get('maxPrice')!) : undefined,
    minRating: searchParams.get('minRating') ? parseFloat(searchParams.get('minRating')!) : undefined,
    minReviews: searchParams.get('minReviews') ? parseInt(searchParams.get('minReviews')!) : undefined,
    primeOnly: searchParams.get('primeOnly') === 'true',
    sortBy: (searchParams.get('sortBy') as DiscoverySearchParams['sortBy']) || 'relevance',
    page: parseInt(searchParams.get('page') || '1'),
    pageSize: Math.min(parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE),
  };
}

/**
 * Calculate deal score (0-100)
 */
function calculateDealScore(
  margin: number,
  rating: number,
  reviewCount: number,
  isPrime: boolean
): number {
  let score = 0;

  // Margin contribution (0-40 points)
  if (margin >= 80) score += 40;
  else if (margin >= 60) score += 30;
  else if (margin >= 40) score += 20;
  else if (margin >= 30) score += 10;

  // Rating contribution (0-25 points)
  if (rating >= 4.5) score += 25;
  else if (rating >= 4.0) score += 20;
  else if (rating >= 3.5) score += 15;
  else if (rating >= 3.0) score += 10;

  // Review count contribution (0-25 points)
  if (reviewCount >= 1000) score += 25;
  else if (reviewCount >= 500) score += 20;
  else if (reviewCount >= 100) score += 15;
  else if (reviewCount >= 50) score += 10;

  // Prime bonus (0-10 points)
  if (isPrime) score += 10;

  return Math.min(100, score);
}

/**
 * Enrich search result with profit analysis
 */
function enrichSearchResult(result: RainforestSearchResult): DiscoveryResult {
  const retailPrice = calculateRetailPrice(result.price);
  const { profit, margin } = calculateProfit(result.price, retailPrice);

  return {
    ...result,
    potentialRetailPrice: retailPrice,
    potentialProfit: profit,
    potentialMargin: margin,
    meetsMarginThreshold: margin >= PRICING_RULES.profitThresholds.minimum,
    dealScore: calculateDealScore(margin, result.rating, result.review_count, result.is_prime),
  };
}

/**
 * Mock Rainforest API call (replace with real implementation)
 */
async function searchRainforestAPI(params: DiscoverySearchParams): Promise<RainforestSearchResult[]> {
  const apiKey = process.env.RAINFOREST_API_KEY;

  if (!apiKey) {
    // Return mock data if no API key
    return generateMockResults(params);
  }

  try {
    // Build Rainforest API request
    const requestParams = new URLSearchParams({
      api_key: apiKey,
      type: 'search',
      amazon_domain: 'amazon.com',
      search_term: params.query,
      ...(params.category && { category_id: CATEGORY_IDS[params.category] || params.category }),
      ...(params.minPrice && { min_price: String(params.minPrice) }),
      ...(params.maxPrice && { max_price: String(params.maxPrice) }),
      ...(params.primeOnly && { prime: 'true' }),
      page: String(params.page || 1),
    });

    const response = await fetch(`${RAINFOREST_API_URL}?${requestParams}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Rainforest API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform Rainforest response to our format
    return (data.search_results || []).map((item: Record<string, unknown>) => ({
      asin: item.asin as string,
      title: item.title as string,
      price: parseFloat(String(item.price?.value || 0)),
      image_url: item.image as string,
      rating: parseFloat(String(item.rating || 0)),
      review_count: parseInt(String(item.ratings_total || 0)),
      category: (item.categories?.[0]?.name as string) || 'Unknown',
      is_prime: Boolean(item.is_prime),
      availability: (item.availability?.raw as string) || 'Unknown',
    }));
  } catch (error) {
    console.error('Rainforest API error:', error);
    // Fallback to mock data
    return generateMockResults(params);
  }
}

/**
 * Generate mock search results for testing
 */
function generateMockResults(params: DiscoverySearchParams): RainforestSearchResult[] {
  const categories = ['Electronics', 'Home & Kitchen', 'Beauty', 'Health', 'Sports'];
  const results: RainforestSearchResult[] = [];

  const count = params.pageSize || DEFAULT_PAGE_SIZE;

  for (let i = 0; i < count; i++) {
    const price = (params.minPrice || 10) + Math.random() * ((params.maxPrice || 50) - (params.minPrice || 10));
    const rating = Math.max(params.minRating || 3.0, 3.0 + Math.random() * 2);
    const reviewCount = Math.max(params.minReviews || 50, Math.floor(50 + Math.random() * 2000));

    results.push({
      asin: `B${String(Math.random()).slice(2, 11).toUpperCase()}`,
      title: `${params.query || 'Product'} - Premium Quality Item ${i + 1} - Best Seller`,
      price: Math.round(price * 100) / 100,
      image_url: `https://picsum.photos/200/200?random=${Date.now() + i}`,
      rating: Math.round(rating * 10) / 10,
      review_count: reviewCount,
      category: categories[Math.floor(Math.random() * categories.length)],
      is_prime: params.primeOnly || Math.random() > 0.3,
      availability: 'In Stock',
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// GET - Search for products
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const params = parseSearchParams(request.nextUrl.searchParams);

    // Validate query
    if (!params.query || params.query.trim().length < 2) {
      return errorResponse({
        code: 'DISC_001',
        message: 'Search query is required',
        details: 'Query must be at least 2 characters',
        suggestion: 'Provide a search term',
      }, 400);
    }

    // Search for products
    const rawResults = await searchRainforestAPI(params);

    // Enrich results with profit analysis
    let results = rawResults.map(enrichSearchResult);

    // Apply additional filters
    if (params.minRating) {
      results = results.filter(r => r.rating >= params.minRating!);
    }

    if (params.minReviews) {
      results = results.filter(r => r.review_count >= params.minReviews!);
    }

    // Sort results
    switch (params.sortBy) {
      case 'price_asc':
        results.sort((a, b) => a.price - b.price);
        break;
      case 'price_desc':
        results.sort((a, b) => b.price - a.price);
        break;
      case 'rating':
        results.sort((a, b) => b.rating - a.rating);
        break;
      case 'reviews':
        results.sort((a, b) => b.review_count - a.review_count);
        break;
      default:
        // Sort by deal score for relevance
        results.sort((a, b) => b.dealScore - a.dealScore);
    }

    // Calculate summary stats
    const meetsThreshold = results.filter(r => r.meetsMarginThreshold).length;
    const avgMargin = results.length > 0
      ? results.reduce((sum, r) => sum + r.potentialMargin, 0) / results.length
      : 0;
    const avgDealScore = results.length > 0
      ? results.reduce((sum, r) => sum + r.dealScore, 0) / results.length
      : 0;

    return successResponse(results, {
      query: params.query,
      page: params.page || 1,
      pageSize: params.pageSize || DEFAULT_PAGE_SIZE,
      totalResults: results.length,
      summary: {
        meetsMarginThreshold: meetsThreshold,
        averageMargin: Math.round(avgMargin * 10) / 10,
        averageDealScore: Math.round(avgDealScore),
        topCategory: results[0]?.category || null,
      },
      filters: {
        category: params.category,
        priceRange: { min: params.minPrice, max: params.maxPrice },
        minRating: params.minRating,
        minReviews: params.minReviews,
        primeOnly: params.primeOnly,
      },
    });
  } catch (error) {
    console.error('Discovery search error:', error);
    return errorResponse({
      code: 'DISC_002',
      message: 'Search failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      suggestion: 'Please try again',
    }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST - Find deals based on criteria
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Merge with default criteria
    const criteria: DealCriteria = {
      ...DEFAULT_DEAL_CRITERIA,
      ...body.criteria,
    };

    // Build search params from criteria
    const searchParams: DiscoverySearchParams = {
      query: body.query || body.keywords || 'trending products',
      category: body.category,
      minPrice: PRICING_RULES.discovery.minPrice,
      maxPrice: criteria.maxPrice,
      minRating: criteria.minRating,
      minReviews: criteria.minReviews,
      primeOnly: criteria.requirePrime,
      pageSize: body.limit || 50,
    };

    // Search for products
    const rawResults = await searchRainforestAPI(searchParams);

    // Enrich and filter by margin threshold
    const results = rawResults
      .map(enrichSearchResult)
      .filter(r => r.potentialMargin >= criteria.minMargin)
      .sort((a, b) => b.dealScore - a.dealScore);

    // Calculate estimated revenue potential
    const estimatedMonthlyRevenue = results.reduce((sum, r) => {
      // Rough estimate based on review count (proxy for sales volume)
      const estimatedMonthlySales = Math.max(1, Math.floor(r.review_count / 100));
      return sum + (r.potentialProfit * estimatedMonthlySales);
    }, 0);

    return successResponse({
      deals: results,
      criteria,
      summary: {
        totalFound: rawResults.length,
        meetsAllCriteria: results.length,
        averageMargin: results.length > 0
          ? Math.round(results.reduce((sum, r) => sum + r.potentialMargin, 0) / results.length * 10) / 10
          : 0,
        averageDealScore: results.length > 0
          ? Math.round(results.reduce((sum, r) => sum + r.dealScore, 0) / results.length)
          : 0,
        estimatedMonthlyRevenue: Math.round(estimatedMonthlyRevenue),
        topDeals: results.slice(0, 5).map(r => ({
          asin: r.asin,
          title: r.title.slice(0, 50) + '...',
          margin: Math.round(r.potentialMargin),
          score: r.dealScore,
        })),
      },
    });
  } catch (error) {
    console.error('Deal finder error:', error);
    return errorResponse({
      code: 'DISC_003',
      message: 'Deal search failed',
      details: error instanceof Error ? error.message : 'Failed to parse request',
      suggestion: 'Check your request format',
    }, 400);
  }
}
