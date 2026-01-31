// lib/ai/scoring-engine.ts
// Deterministic AI scoring function - rule-based, no ML

import { AIFeatureVector, AIScoreResult, FEATURE_WEIGHTS } from './feature-vector';

/**
 * Generate recommendations based on feature vector analysis
 */
function generateRecommendations(features: AIFeatureVector): string[] {
  const recommendations: string[] = [];
  
  // Demand-based recommendations
  if (features.demand_strength < 0.3) {
    recommendations.push('Consider improving product visibility with better marketing');
  }
  if (features.rating_score < 0.6) {
    recommendations.push('Focus on product quality to improve ratings');
  }
  if (features.review_volume_score < 0.4) {
    recommendations.push('Encourage customer reviews to build social proof');
  }
  
  // Price-based recommendations
  if (features.price_advantage < 0.4) {
    recommendations.push('Review pricing strategy to improve competitiveness');
  }
  if (features.prime_eligibility_score < 0.5) {
    recommendations.push('Investigate Prime eligibility requirements');
  }
  
  // Content-based recommendations
  if (features.content_richness_score < 0.5) {
    recommendations.push('Enhance product images and description');
  }
  if (features.category_specificity_score < 0.4) {
    recommendations.push('Use more specific product categorization');
  }
  
  // Market-based recommendations
  if (features.market_saturation_score > 0.7) {
    recommendations.push('Market appears saturated - consider differentiation');
  }
  if (features.brand_recognition_score < 0.4) {
    recommendations.push('Build brand recognition through consistent messaging');
  }
  
  return recommendations.slice(0, 5); // Limit to top 5 recommendations
}

/**
 * Identify risk factors based on feature analysis
 */
function identifyRiskFactors(features: AIFeatureVector): string[] {
  const risks: string[] = [];
  
  if (features.rating_score < 0.3) {
    risks.push('Low product ratings may indicate quality issues');
  }
  if (features.review_volume_score < 0.2) {
    risks.push('Very few reviews - unproven product track record');
  }
  if (features.price_competitiveness_score < 0.2) {
    risks.push('Poor price competitiveness may limit sales');
  }
  if (features.bsr_competitiveness_score < 0.2) {
    risks.push('Very low BSR rank indicates weak market position');
  }
  if (features.prime_eligibility_score < 0.3) {
    risks.push('Non-Prime products have reduced visibility');
  }
  if (features.content_richness_score < 0.3) {
    risks.push('Poor content quality may hurt conversion');
  }
  if (features.market_saturation_score > 0.8) {
    risks.push('High market saturation increases competition');
  }
  if (features.feature_confidence < 0.5) {
    risks.push('Insufficient data for reliable analysis');
  }
  
  return risks.slice(0, 5); // Limit to top 5 risks
}

/**
 * Identify opportunities based on feature analysis
 */
function identifyOpportunities(features: AIFeatureVector): string[] {
  const opportunities: string[] = [];
  
  if (features.demand_strength > 0.7 && features.market_saturation_score < 0.5) {
    opportunities.push('High demand with low competition - ideal market position');
  }
  if (features.rating_score > 0.8 && features.review_volume_score > 0.6) {
    opportunities.push('Excellent reviews provide strong social proof advantage');
  }
  if (features.bsr_competitiveness_score > 0.7) {
    opportunities.push('Strong BSR ranking indicates market leadership');
  }
  if (features.prime_eligibility_score === 1) {
    opportunities.push('Prime eligibility expands customer reach');
  }
  if (features.brand_recognition_score > 0.7) {
    opportunities.push('Strong brand can command premium pricing');
  }
  if (features.content_richness_score > 0.8) {
    opportunities.push('High-quality content supports premium positioning');
  }
  if (features.demand_tier_score > 0.8 && features.price_advantage > 0.6) {
    opportunities.push('High-demand tier with good price advantage');
  }
  
  return opportunities.slice(0, 5); // Limit to top 5 opportunities
}

/**
 * Calculate weighted component scores
 */
function calculateComponentScores(features: AIFeatureVector): {
  demand_weighted_score: number;
  price_weighted_score: number;
  content_weighted_score: number;
  market_weighted_score: number;
} {
  // Demand component (35% weight)
  const demand_weighted_score = (
    features.rating_score * FEATURE_WEIGHTS.demand_components.rating_score +
    features.review_volume_score * FEATURE_WEIGHTS.demand_components.review_volume +
    features.demand_tier_score * FEATURE_WEIGHTS.demand_components.demand_tier
  ) * FEATURE_WEIGHTS.demand;
  
  // Price component (30% weight)
  const price_weighted_score = (
    features.price_competitiveness_score * FEATURE_WEIGHTS.price_components.price_competitiveness +
    features.bsr_competitiveness_score * FEATURE_WEIGHTS.price_components.bsr_competitiveness +
    features.prime_eligibility_score * FEATURE_WEIGHTS.price_components.prime_eligibility
  ) * FEATURE_WEIGHTS.price;
  
  // Content component (20% weight)
  const content_weighted_score = (
    features.content_richness_score * FEATURE_WEIGHTS.content_components.richness +
    features.category_specificity_score * FEATURE_WEIGHTS.content_components.specificity +
    features.data_freshness_score * FEATURE_WEIGHTS.content_components.freshness
  ) * FEATURE_WEIGHTS.content;
  
  // Market component (15% weight)
  const market_weighted_score = (
    (1 - features.market_saturation_score) * FEATURE_WEIGHTS.market_components.saturation +
    features.brand_recognition_score * FEATURE_WEIGHTS.market_components.brand +
    features.market_opportunity * FEATURE_WEIGHTS.market_components.opportunity
  ) * FEATURE_WEIGHTS.market;
  
  return {
    demand_weighted_score,
    price_weighted_score,
    content_weighted_score,
    market_weighted_score
  };
}

/**
 * Main deterministic scoring function
 * Score range: 0-100
 */
export function calculateAIScore(features: AIFeatureVector): AIScoreResult {
  // Calculate component scores
  const componentScores = calculateComponentScores(features);
  
  // Calculate overall score (0-1 scale)
  const overall_score_raw = (
    componentScores.demand_weighted_score +
    componentScores.price_weighted_score +
    componentScores.content_weighted_score +
    componentScores.market_weighted_score
  );
  
  // Apply confidence adjustment
  const confidence_adjusted_score = overall_score_raw * features.feature_confidence;
  
  // Convert to 0-100 scale with rounding
  const overall_score = Math.round(confidence_adjusted_score * 100);
  
  // Generate insights
  const recommendations = generateRecommendations(features);
  const risk_factors = identifyRiskFactors(features);
  const opportunities = identifyOpportunities(features);
  
  return {
    product_id: features.product_id,
    overall_score: Math.max(0, Math.min(100, overall_score)), // Clamp to 0-100
    feature_vector: features,
    score_breakdown: {
      demand_weighted_score: Math.round(componentScores.demand_weighted_score * 100),
      price_weighted_score: Math.round(componentScores.price_weighted_score * 100),
      content_weighted_score: Math.round(componentScores.content_weighted_score * 100),
      market_weighted_score: Math.round(componentScores.market_weighted_score * 100)
    },
    recommendations,
    risk_factors,
    opportunities
  };
}

/**
 * Score tier classification
 */
export function getScoreTier(score: number): {
  tier: 'A+' | 'A' | 'B' | 'C' | 'D';
  label: string;
  color: string;
  description: string;
} {
  if (score >= 90) {
    return {
      tier: 'A+',
      label: 'Excellent',
      color: 'green',
      description: 'Outstanding product with strong market position'
    };
  } else if (score >= 80) {
    return {
      tier: 'A',
      label: 'Very Good',
      color: 'blue',
      description: 'Strong product with good market potential'
    };
  } else if (score >= 70) {
    return {
      tier: 'B',
      label: 'Good',
      color: 'yellow',
      description: 'Decent product with moderate potential'
    };
  } else if (score >= 60) {
    return {
      tier: 'C',
      label: 'Fair',
      color: 'orange',
      description: 'Product needs improvement to compete'
    };
  } else {
    return {
      tier: 'D',
      label: 'Poor',
      color: 'red',
      description: 'Significant issues need addressing'
    };
  }
}

/**
 * Batch scoring for multiple products
 */
export function batchScoreAIScores(featureVectors: AIFeatureVector[]): AIScoreResult[] {
  return featureVectors
    .map(features => calculateAIScore(features))
    .sort((a, b) => b.overall_score - a.overall_score); // Sort by score descending
}
