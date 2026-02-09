// lib/ai/feature-vector.ts
// AI Feature Vector Definition - derived ONLY from normalized data

export interface AIFeatureVector {
  // Identity & Source
  product_id: string;
  asin: string;
  source: string;
  
  // Demand Signals (from NormalizedProduct)
  rating_score: number;           // 0-1: rating / 5
  review_volume_score: number;    // 0-1: log(reviews) / log(max_reviews)
  demand_tier_score: number;      // 0-1: high=1, medium=0.6, low=0.3
  
  // Price Competitiveness (from NormalizedPriceSnapshot)
  price_competitiveness_score: number; // 0-1: based on price data availability
  bsr_competitiveness_score: number;   // 0-1: inverse of BSR rank
  prime_eligibility_score: number;     // 0-1: Prime availability
  
  // Availability & Risk Signals
  content_richness_score: number;  // 0-1: images, description length
  category_specificity_score: number; // 0-1: category depth
  data_freshness_score: number;    // 0-1: how recent the data is
  
  // Market Position
  market_saturation_score: number; // 0-1: estimated competition level
  brand_recognition_score: number; // 0-1: brand presence
  
  // Composite Scores
  demand_strength: number;         // 0-1: combined demand signals
  price_advantage: number;         // 0-1: price competitiveness
  content_quality: number;         // 0-1: content and presentation
  market_opportunity: number;      // 0-1: overall market position
  
  // Metadata
  feature_confidence: number;      // 0-1: how complete the data is
  extraction_timestamp: string;    // when features were extracted
}

export interface AIScoreResult {
  product_id: string;
  overall_score: number;           // 0-100: final AI score
  feature_vector: AIFeatureVector;
  score_breakdown: {
    demand_weighted_score: number;
    price_weighted_score: number;
    content_weighted_score: number;
    market_weighted_score: number;
  };
  recommendations: string[];
  risk_factors: string[];
  opportunities: string[];
}

// Feature extraction weights (explicitly documented)
export const FEATURE_WEIGHTS = {
  // Main category weights (sum to 1.0)
  demand: 0.35,              // 35% - Market demand and traction
  price: 0.30,               // 30% - Price competitiveness and margins  
  content: 0.20,             // 20% - Content quality and completeness
  market: 0.15,              // 15% - Market position and opportunity
  
  // Sub-component weights
  demand_components: {
    rating_score: 0.4,        // Rating importance within demand
    review_volume: 0.3,       // Review volume importance
    demand_tier: 0.3,         // Demand tier importance
  },
  
  price_components: {
    price_competitiveness: 0.4, // Price data availability
    bsr_competitiveness: 0.3,   // BSR ranking
    prime_eligibility: 0.3,     // Prime advantage
  },
  
  content_components: {
    richness: 0.5,            // Images and media
    specificity: 0.3,         // Category depth
    freshness: 0.2,            // Data recency
  },
  
  market_components: {
    saturation: 0.4,          // Competition level
    brand: 0.3,               // Brand recognition
    opportunity: 0.3          // Market positioning
  }
};

// Scoring constants
export const SCORING_CONSTANTS = {
  max_reviews: 100000,        // Cap for review volume calculation
  max_bsr_rank: 100000,       // Cap for BSR competitiveness
  min_description_length: 50,  // Minimum acceptable description
  max_description_length: 2000, // Maximum for scoring
  min_images: 3,              // Minimum images for good score
  max_images: 10,             // Cap for image scoring
  category_depth_bonus: 0.2,   // Bonus per category level
  data_freshness_hours: 24,   // Fresh data threshold
};
