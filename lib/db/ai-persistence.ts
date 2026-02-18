// lib/db/ai-persistence.ts
// Database persistence for AI scores and feature vectors

import { createClient } from '@supabase/supabase-js';
import { AIFeatureVector, AIScoreResult } from '../ai/feature-vector';

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabaseClient() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

/**
 * AI Score persistence operations
 */
export class AIScorePersistence {
  /**
   * Store AI score result for a product
   */
  static async upsertAIScore(scoreResult: AIScoreResult): Promise<{ success: boolean; error?: string }> {
    try {
      const scoreData = {
        product_id: scoreResult.product_id,
        overall_score: scoreResult.overall_score,
        demand_score: scoreResult.score_breakdown.demand_weighted_score,
        price_score: scoreResult.score_breakdown.price_weighted_score,
        content_score: scoreResult.score_breakdown.content_weighted_score,
        market_score: scoreResult.score_breakdown.market_weighted_score,
        recommendations: scoreResult.recommendations,
        risk_factors: scoreResult.risk_factors,
        opportunities: scoreResult.opportunities,
        feature_confidence: scoreResult.feature_vector.feature_confidence,
        score_tier: this.getScoreTier(scoreResult.overall_score),
        scored_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { error } = await getSupabaseClient()
        .from('ai_scores')
        .upsert(scoreData, { onConflict: 'product_id' });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Store feature vector for a product
   */
  static async upsertFeatureVector(featureVector: AIFeatureVector): Promise<{ success: boolean; error?: string }> {
    try {
      const vectorData = {
        product_id: featureVector.product_id,
        asin: featureVector.asin,
        source: featureVector.source,
        
        // Demand signals
        rating_score: featureVector.rating_score,
        review_volume_score: featureVector.review_volume_score,
        demand_tier_score: featureVector.demand_tier_score,
        
        // Price signals
        price_competitiveness_score: featureVector.price_competitiveness_score,
        bsr_competitiveness_score: featureVector.bsr_competitiveness_score,
        prime_eligibility_score: featureVector.prime_eligibility_score,
        
        // Content signals
        content_richness_score: featureVector.content_richness_score,
        category_specificity_score: featureVector.category_specificity_score,
        data_freshness_score: featureVector.data_freshness_score,
        
        // Market signals
        market_saturation_score: featureVector.market_saturation_score,
        brand_recognition_score: featureVector.brand_recognition_score,
        
        // Composite scores
        demand_strength: featureVector.demand_strength,
        price_advantage: featureVector.price_advantage,
        content_quality: featureVector.content_quality,
        market_opportunity: featureVector.market_opportunity,
        
        // Metadata
        feature_confidence: featureVector.feature_confidence,
        extraction_timestamp: featureVector.extraction_timestamp,
        updated_at: new Date().toISOString()
      };

      const { error } = await getSupabaseClient()
        .from('ai_feature_vectors')
        .upsert(vectorData, { onConflict: 'product_id' });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Store both score and feature vector atomically
   */
  static async upsertAIAnalysis(scoreResult: AIScoreResult): Promise<{ success: boolean; error?: string }> {
    try {
      // Store feature vector first
      const vectorResult = await this.upsertFeatureVector(scoreResult.feature_vector);
      if (!vectorResult.success) {
        return vectorResult;
      }

      // Store score result
      const scoreResultPersist = await this.upsertAIScore(scoreResult);
      if (!scoreResultPersist.success) {
        return scoreResultPersist;
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get AI score for a product
   */
  static async getAIScore(productId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await getSupabaseClient()
        .from('ai_scores')
        .select('*')
        .eq('product_id', productId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // Not found
          return { success: true, data: null };
        }
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get feature vector for a product
   */
  static async getFeatureVector(productId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await getSupabaseClient()
        .from('ai_feature_vectors')
        .select('*')
        .eq('product_id', productId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // Not found
          return { success: true, data: null };
        }
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get complete AI analysis for a product
   */
  static async getAIAnalysis(productId: string): Promise<{ success: boolean; data?: { score: any; vector: any }; error?: string }> {
    try {
      const [scoreResult, vectorResult] = await Promise.all([
        this.getAIScore(productId),
        this.getFeatureVector(productId)
      ]);

      if (!scoreResult.success) return scoreResult;
      if (!vectorResult.success) return vectorResult;

      return { 
        success: true, 
        data: { 
          score: scoreResult.data, 
          vector: vectorResult.data 
        } 
      };
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
  static async getTopScoringProducts(limit: number = 50): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      const { data, error } = await getSupabaseClient()
        .from('ai_scores')
        .select(`
          *,
          products!inner (
            id,
            asin,
            title,
            brand,
            category,
            image_url
          )
        `)
        .order('overall_score', { ascending: false })
        .limit(limit);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get products by score tier
   */
  static async getProductsByTier(tier: string, limit: number = 50): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      const { data, error } = await getSupabaseClient()
        .from('ai_scores')
        .select(`
          *,
          products!inner (
            id,
            asin,
            title,
            brand,
            category,
            image_url
          )
        `)
        .eq('score_tier', tier)
        .order('overall_score', { ascending: false })
        .limit(limit);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get AI scoring statistics
   */
  static async getScoringStats(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await getSupabaseClient()
        .from('ai_scores')
        .select(`
          overall_score,
          score_tier,
          scored_at
        `);

      if (error) {
        return { success: false, error: error.message };
      }

      // Calculate statistics
      const scores = data || [];
      const totalScored = scores.length;
      const averageScore = scores.length > 0 
        ? scores.reduce((sum, item) => sum + item.overall_score, 0) / scores.length 
        : 0;

      const tierCounts = scores.reduce((acc, item) => {
        acc[item.score_tier] = (acc[item.score_tier] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const stats = {
        total_scored: totalScored,
        average_score: Math.round(averageScore),
        tier_distribution: tierCounts,
        last_scored_at: scores.length > 0 
          ? Math.max(...scores.map(item => new Date(item.scored_at).getTime()))
          : null
      };

      return { success: true, data: stats };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Helper method to get score tier
   */
  private static getScoreTier(score: number): string {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    return 'D';
  }
}
