// lib/ai/ai-analysis-pipeline.ts
// Main AI analysis pipeline - coordinates feature extraction, scoring, and persistence

import { 
  NormalizedProduct, 
  NormalizedPriceSnapshot, 
  NormalizedShopifyProduct 
} from '../schemas/normalized-schema';
import { extractFeatures } from './feature-extraction';
import { calculateAIScore, batchScoreAIScores } from './scoring-engine';
import { AIScorePersistence } from '../db/ai-persistence';

export interface AIAnalysisOptions {
  forceRescore?: boolean;        // Force re-scoring even if recent score exists
  logAnalysis?: boolean;          // Log analysis changes
  triggeredBy?: string;          // What triggered this analysis
}

export interface AIAnalysisResult {
  success: boolean;
  productId: string;
  overallScore?: number;
  scoreTier?: string;
  processingTime?: number;
  error?: string;
  previousScore?: number;
  scoreChange?: number;
}

/**
 * Analyze a single product - extract features, score, and persist
 */
export async function analyzeProduct(
  product: NormalizedProduct,
  priceSnapshot: NormalizedPriceSnapshot | null = null,
  shopifyProduct: NormalizedShopifyProduct | null = null,
  options: AIAnalysisOptions = {}
): Promise<AIAnalysisResult> {
  const startTime = Date.now();
  const { forceRescore = false, logAnalysis = true, triggeredBy = 'system' } = options;
  
  try {
    // Check if recent score already exists (unless forced)
    if (!forceRescore) {
      const existingScore = await AIScorePersistence.getAIScore(product.id);
      if (existingScore.success && existingScore.data) {
        const hoursSinceScore = (Date.now() - new Date(existingScore.data.scored_at).getTime()) / (1000 * 60 * 60);
        if (hoursSinceScore < 24) { // Don't re-score if less than 24 hours old
          return {
            success: true,
            productId: product.id,
            overallScore: existingScore.data.overall_score,
            scoreTier: existingScore.data.score_tier,
            processingTime: Date.now() - startTime
          };
        }
      }
    }

    // Extract features from normalized data
    const featureVector = extractFeatures(product, priceSnapshot, shopifyProduct);
    
    // Calculate AI score
    const scoreResult = calculateAIScore(featureVector);
    
    // Get previous score for change tracking
    let previousScore: number | undefined;
    if (logAnalysis) {
      const existingResult = await AIScorePersistence.getAIScore(product.id);
      if (existingResult.success && existingResult.data) {
        previousScore = existingResult.data.overall_score;
      }
    }
    
    // Persist results
    const persistResult = await AIScorePersistence.upsertAIAnalysis(scoreResult);
    if (!persistResult.success) {
      return {
        success: false,
        productId: product.id,
        error: `Failed to persist analysis: ${persistResult.error}`,
        processingTime: Date.now() - startTime
      };
    }

    // Log analysis change if needed
    if (logAnalysis && previousScore !== undefined) {
      await logAnalysisChange(product.id, previousScore, scoreResult.overall_score, triggeredBy, Date.now() - startTime);
    }

    return {
      success: true,
      productId: product.id,
      overallScore: scoreResult.overall_score,
      scoreTier: getScoreTier(scoreResult.overall_score),
      processingTime: Date.now() - startTime,
      previousScore,
      scoreChange: previousScore ? scoreResult.overall_score - previousScore : undefined
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    
    // Log error if analysis logging is enabled
    if (logAnalysis) {
      await logAnalysisError(product.id, errorMsg, triggeredBy, Date.now() - startTime);
    }
    
    return {
      success: false,
      productId: product.id,
      error: errorMsg,
      processingTime: Date.now() - startTime
    };
  }
}

/**
 * Analyze multiple products in batch
 */
export async function analyzeProducts(
  products: NormalizedProduct[],
  priceSnapshots: Map<string, NormalizedPriceSnapshot> = new Map(),
  shopifyProducts: Map<string, NormalizedShopifyProduct> = new Map(),
  options: AIAnalysisOptions = {}
): Promise<AIAnalysisResult[]> {
  const results: AIAnalysisResult[] = [];
  
  // Process products in batches to avoid overwhelming the system
  const batchSize = 10;
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (product) => {
      const priceSnapshot = priceSnapshots.get(product.id) || null;
      const shopifyProduct = shopifyProducts.get(product.id) || null;
      
      return analyzeProduct(product, priceSnapshot, shopifyProduct, options);
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Brief pause between batches to prevent rate limiting
    if (i + batchSize < products.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

/**
 * Re-score all products (for system-wide re-scoring)
 */
export async function rescoreAllProducts(options: {
  limit?: number;
  minAgeHours?: number;
} = {}): Promise<{ success: boolean; processed: number; errors: number; results?: AIAnalysisResult[] }> {
  const { limit = 100, minAgeHours = 24 } = options;
  
  try {
    // Get products that need re-scoring
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const cutoffTime = new Date(Date.now() - minAgeHours * 60 * 60 * 1000).toISOString();
    
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .or('updated_at.lt.' + cutoffTime + ',last_price_check.is.null')
      .not('asin', 'is', null)
      .limit(limit);

    if (error) {
      return { success: false, processed: 0, errors: 1 };
    }

    if (!products || products.length === 0) {
      return { success: true, processed: 0, errors: 0 };
    }

    // Convert to NormalizedProduct format
    const normalizedProducts: NormalizedProduct[] = products.map((p: any) => ({
      id: p.id,
      asin: p.asin,
      title: p.title,
      brand: p.brand || 'Unknown',
      category: p.category || 'General',
      description: p.description || '',
      main_image: p.image_url || '',
      images: [], // Would need to fetch from source
      rating: p.rating || null,
      ratings_total: p.review_count || null,
      status: p.status || 'active',
      source: p.source || 'unknown',
      created_at: p.created_at,
      updated_at: p.updated_at
    }));

    // Analyze all products
    const results = await analyzeProducts(
      normalizedProducts,
      new Map(),
      new Map(),
      { forceRescore: true, triggeredBy: 'system_batch' }
    );

    const processed = results.filter(r => r.success).length;
    const errors = results.filter(r => !r.success).length;

    return { 
      success: true, 
      processed, 
      errors, 
      results 
    };

  } catch (error) {
    return { 
      success: false, 
      processed: 0, 
      errors: 1 
    };
  }
}

/**
 * Get AI analysis statistics
 */
export async function getAIAnalysisStats(): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const statsResult = await AIScorePersistence.getScoringStats();
    return statsResult;
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Get top scoring products
 */
export async function getTopScoringProducts(limit: number = 50): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const result = await AIScorePersistence.getTopScoringProducts(limit);
    return result;
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Helper function to get score tier
 */
function getScoreTier(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}

/**
 * Log analysis change to audit table
 */
async function logAnalysisChange(
  productId: string, 
  previousScore: number, 
  newScore: number, 
  triggeredBy: string,
  processingTime: number
): Promise<void> {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await supabase
      .from('ai_analysis_log')
      .insert({
        product_id: productId,
        analysis_type: 're_score',
        previous_score: previousScore,
        new_score: newScore,
        score_change: newScore - previousScore,
        processing_time_ms: processingTime,
        triggered_by: triggeredBy
      });

  } catch (error) {
    console.error('Failed to log analysis change:', error);
  }
}

/**
 * Log analysis error to audit table
 */
async function logAnalysisError(
  productId: string, 
  errorMessage: string, 
  triggeredBy: string,
  processingTime: number
): Promise<void> {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await supabase
      .from('ai_analysis_log')
      .insert({
        product_id: productId,
        analysis_type: 're_score',
        error_message: errorMessage,
        processing_time_ms: processingTime,
        triggered_by: triggeredBy
      });

  } catch (error) {
    console.error('Failed to log analysis error:', error);
  }
}
