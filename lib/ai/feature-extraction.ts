// lib/ai/feature-extraction.ts
// Feature extraction functions derived ONLY from normalized data

import { 
  NormalizedProduct, 
  NormalizedPriceSnapshot, 
  NormalizedShopifyProduct 
} from '../schemas/normalized-schema';
import { 
  AIFeatureVector, 
  SCORING_CONSTANTS 
} from './feature-vector';

/**
 * Extract demand signals from normalized product data
 */
function extractDemandSignals(product: NormalizedProduct): {
  rating_score: number;
  review_volume_score: number;
  demand_tier_score: number;
} {
  // Rating score: 0-1 based on 5-star scale
  const rating_score = product.rating ? Math.min(product.rating / 5, 1) : 0;
  
  // Review volume score: logarithmic scale to handle wide range
  let review_volume_score = 0;
  if (product.ratings_total && product.ratings_total > 0) {
    const logReviews = Math.log(Math.max(product.ratings_total, 1));
    const logMaxReviews = Math.log(SCORING_CONSTANTS.max_reviews);
    review_volume_score = Math.min(logReviews / logMaxReviews, 1);
  }
  
  // Demand tier score: based on source and available data
  let demand_tier_score = 0.3; // Default to low
  
  if (product.source === 'rainforest_import') {
    // For Rainforest data, estimate demand tier based on reviews and rating
    if (product.ratings_total && product.rating) {
      if (product.ratings_total > 5000 && product.rating >= 4.5) {
        demand_tier_score = 1.0; // High demand
      } else if (product.ratings_total > 1000 && product.rating >= 4.0) {
        demand_tier_score = 0.6; // Medium demand
      } else {
        demand_tier_score = 0.3; // Low demand
      }
    }
  } else if (product.source === 'shopify') {
    demand_tier_score = 0.6; // Medium for Shopify products
  }
  
  return {
    rating_score,
    review_volume_score,
    demand_tier_score
  };
}

/**
 * Extract price competitiveness signals from price snapshot
 */
function extractPriceSignals(priceSnapshot: NormalizedPriceSnapshot | null): {
  price_competitiveness_score: number;
  bsr_competitiveness_score: number;
  prime_eligibility_score: number;
} {
  // Price competitiveness: based on data availability
  let price_competitiveness_score = 0;
  if (priceSnapshot) {
    if (priceSnapshot.current_price && priceSnapshot.cost_price) {
      // If we have both prices, calculate margin-based competitiveness
      const margin = (priceSnapshot.current_price - priceSnapshot.cost_price) / priceSnapshot.cost_price;
      price_competitiveness_score = Math.min(Math.max(margin, 0), 1);
    } else if (priceSnapshot.current_price || priceSnapshot.cost_price) {
      // Partial price data available
      price_competitiveness_score = 0.5;
    }
  }
  
  // BSR competitiveness: inverse of BSR rank (lower rank = higher competitiveness)
  let bsr_competitiveness_score = 0;
  if (priceSnapshot?.bsr_rank && priceSnapshot.bsr_rank > 0) {
    const logBsr = Math.log(priceSnapshot.bsr_rank);
    const logMaxBsr = Math.log(SCORING_CONSTANTS.max_bsr_rank);
    bsr_competitiveness_score = Math.max(1 - (logBsr / logMaxBsr), 0);
  }
  
  // Prime eligibility score
  const prime_eligibility_score = priceSnapshot?.is_prime ? 1 : 0.3; // Penalty for non-Prime
  
  return {
    price_competitiveness_score,
    bsr_competitiveness_score,
    prime_eligibility_score
  };
}

/**
 * Extract content quality signals from product data
 */
function extractContentSignals(product: NormalizedProduct): {
  content_richness_score: number;
  category_specificity_score: number;
  data_freshness_score: number;
} {
  // Content richness: based on images and description
  let content_richness_score = 0;
  
  // Image scoring
  const imageCount = product.images.length;
  if (imageCount >= SCORING_CONSTANTS.min_images) {
    const imageScore = Math.min(imageCount / SCORING_CONSTANTS.max_images, 1);
    content_richness_score += imageScore * 0.6; // Images are 60% of richness
  }
  
  // Description length scoring
  if (product.description) {
    const descLength = product.description.length;
    if (descLength >= SCORING_CONSTANTS.min_description_length) {
      const descScore = Math.min(
        (descLength - SCORING_CONSTANTS.min_description_length) / 
        (SCORING_CONSTANTS.max_description_length - SCORING_CONSTANTS.min_description_length),
        1
      );
      content_richness_score += descScore * 0.4; // Description is 40% of richness
    }
  }
  
  // Category specificity: based on category depth
  let category_specificity_score = 0;
  if (product.category) {
    const categoryLevels = product.category.split('>').length;
    category_specificity_score = Math.min(
      (categoryLevels - 1) * SCORING_CONSTANTS.category_depth_bonus,
      1
    );
  }
  
  // Data freshness: based on update timestamp
  let data_freshness_score = 0;
  const now = new Date();
  const updatedAt = new Date(product.updated_at);
  const hoursSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);
  
  if (hoursSinceUpdate <= SCORING_CONSTANTS.data_freshness_hours) {
    data_freshness_score = 1 - (hoursSinceUpdate / SCORING_CONSTANTS.data_freshness_hours);
  }
  
  return {
    content_richness_score: Math.min(content_richness_score, 1),
    category_specificity_score,
    data_freshness_score: Math.max(data_freshness_score, 0)
  };
}

/**
 * Extract market position signals
 */
function extractMarketSignals(
  product: NormalizedProduct, 
  priceSnapshot: NormalizedPriceSnapshot | null
): {
  market_saturation_score: number;
  brand_recognition_score: number;
} {
  // Market saturation: estimated from review volume and rating
  let market_saturation_score = 0;
  if (product.ratings_total && product.rating) {
    // High reviews with moderate rating suggests saturation
    if (product.ratings_total > 10000 && product.rating < 4.5) {
      market_saturation_score = 0.8; // High saturation
    } else if (product.ratings_total > 5000 && product.rating < 4.0) {
      market_saturation_score = 0.6; // Medium saturation
    } else if (product.ratings_total < 1000) {
      market_saturation_score = 0.2; // Low saturation
    } else {
      market_saturation_score = 0.4; // Medium-low saturation
    }
  }
  
  // Brand recognition: based on brand name characteristics
  let brand_recognition_score = 0.3; // Default to low
  
  if (product.brand) {
    const brand = product.brand.toLowerCase();
    
    // Known major brands get higher scores
    const majorBrands = [
      'sony', 'samsung', 'apple', 'lg', 'microsoft', 'canon', 'nikon',
      'panasonic', 'philips', 'bosch', 'black & decker', 'craftsman',
      'colgate', 'crest', 'gillette', 'schick', 'neutrogena', 'clean & clear'
    ];
    
    if (majorBrands.some(major => brand.includes(major))) {
      brand_recognition_score = 1.0; // Major brand
    } else if (brand.length > 2 && brand !== 'unknown' && brand !== 'generic') {
      brand_recognition_score = 0.6; // Recognizable brand
    } else if (brand.length > 1) {
      brand_recognition_score = 0.4; // Minor brand
    }
  }
  
  return {
    market_saturation_score,
    brand_recognition_score
  };
}

/**
 * Main feature extraction function
 */
export function extractFeatures(
  product: NormalizedProduct,
  priceSnapshot: NormalizedPriceSnapshot | null = null,
  shopifyProduct: NormalizedShopifyProduct | null = null
): AIFeatureVector {
  // Extract all signal groups
  const demandSignals = extractDemandSignals(product);
  const priceSignals = extractPriceSignals(priceSnapshot);
  const contentSignals = extractContentSignals(product);
  const marketSignals = extractMarketSignals(product, priceSnapshot);
  
  // Calculate composite scores
  const demand_strength = (
    demandSignals.rating_score * 0.4 +
    demandSignals.review_volume_score * 0.3 +
    demandSignals.demand_tier_score * 0.3
  );
  
  const price_advantage = (
    priceSignals.price_competitiveness_score * 0.4 +
    priceSignals.bsr_competitiveness_score * 0.3 +
    priceSignals.prime_eligibility_score * 0.3
  );
  
  const content_quality = (
    contentSignals.content_richness_score * 0.5 +
    contentSignals.category_specificity_score * 0.3 +
    contentSignals.data_freshness_score * 0.2
  );
  
  const market_opportunity = (
    (1 - marketSignals.market_saturation_score) * 0.4 + // Inverse saturation = opportunity
    marketSignals.brand_recognition_score * 0.3 +
    (priceSignals.bsr_competitiveness_score * 0.3) // BSR as market position indicator
  );
  
  // Calculate feature confidence based on data completeness
  let feature_confidence = 0.5; // Base confidence
  
  if (product.rating && product.ratings_total) feature_confidence += 0.2;
  if (priceSnapshot) feature_confidence += 0.2;
  if (product.images.length > 0) feature_confidence += 0.1;
  if (product.description && product.description.length > 100) feature_confidence += 0.1;
  
  feature_confidence = Math.min(feature_confidence, 1);
  
  return {
    // Identity
    product_id: product.id,
    asin: product.asin,
    source: product.source,
    
    // Demand Signals
    rating_score: demandSignals.rating_score,
    review_volume_score: demandSignals.review_volume_score,
    demand_tier_score: demandSignals.demand_tier_score,
    
    // Price Competitiveness
    price_competitiveness_score: priceSignals.price_competitiveness_score,
    bsr_competitiveness_score: priceSignals.bsr_competitiveness_score,
    prime_eligibility_score: priceSignals.prime_eligibility_score,
    
    // Availability & Risk
    content_richness_score: contentSignals.content_richness_score,
    category_specificity_score: contentSignals.category_specificity_score,
    data_freshness_score: contentSignals.data_freshness_score,
    
    // Market Position
    market_saturation_score: marketSignals.market_saturation_score,
    brand_recognition_score: marketSignals.brand_recognition_score,
    
    // Composite Scores
    demand_strength,
    price_advantage,
    content_quality,
    market_opportunity,
    
    // Metadata
    feature_confidence,
    extraction_timestamp: new Date().toISOString()
  };
}
