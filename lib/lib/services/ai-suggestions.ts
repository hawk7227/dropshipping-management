// lib/services/ai-suggestions.ts
// AI Suggestions service for automated product optimization recommendations
// Analyzes products and generates actionable suggestions

import type { ApiResponse } from '@/types/errors';
import type { 
  AISuggestion, 
  SuggestionType, 
  SuggestionPriority, 
  SuggestionStatus, 
  SuggestionActionType,
  Product 
} from '@/types';
import { createSuccessResponse, createResponseFromCode, logError } from '@/lib/utils/api-error-handler';
import { PRICING_RULES } from '@/lib/config/pricing-rules';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const SUGGESTION_CONFIG = {
  // Analysis thresholds
  staleThresholdDays: PRICING_RULES.refresh.staleThresholdDays,
  marginDropThreshold: 10,         // Alert when margin drops by 10%+
  marginWarningThreshold: PRICING_RULES.profitThresholds.minimum,
  
  // Suggestion limits
  maxActiveSuggestions: 20,
  expirationDays: 7,               // Suggestions expire after 7 days
  
  // Refresh intervals
  analysisIntervalMinutes: 60,     // Run analysis every hour
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface AnalysisResult {
  staleProducts: Product[];
  marginDropProducts: Product[];
  lowMarginProducts: Product[];
  highPerformers: Product[];
  stats: {
    totalAnalyzed: number;
    staleCount: number;
    marginIssueCount: number;
    healthyCount: number;
  };
}

export interface SuggestionSummary {
  total: number;
  byType: Record<SuggestionType, number>;
  byPriority: Record<SuggestionPriority, number>;
  highPriorityCount: number;
  actionableCount: number;
}

export interface ActionResult {
  executed: boolean;
  productIds?: string[];
  message: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUGGESTION STORAGE (IN-MEMORY FOR DEMO)
// ═══════════════════════════════════════════════════════════════════════════

// In-memory suggestion storage (replace with database in production)
let suggestions: AISuggestion[] = [];
let lastAnalysisAt: string | undefined;
let analysisRunning = false;

/**
 * Generate unique suggestion ID
 */
function generateSuggestionId(): string {
  return `sug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create suggestion record
 */
function createSuggestion(params: {
  type: SuggestionType;
  priority: SuggestionPriority;
  title: string;
  description: string;
  actionLabel?: string;
  actionType?: SuggestionActionType;
  actionData?: Record<string, unknown>;
  affectedCount?: number;
  estimatedImpact?: string;
}): AISuggestion {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SUGGESTION_CONFIG.expirationDays);

  return {
    id: generateSuggestionId(),
    type: params.type,
    priority: params.priority,
    title: params.title,
    description: params.description,
    action_label: params.actionLabel ?? null,
    action_type: params.actionType ?? null,
    action_data: params.actionData ?? null,
    affected_count: params.affectedCount ?? null,
    estimated_impact: params.estimatedImpact ?? null,
    status: 'active',
    created_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYSIS ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyze products and identify issues
 */
function analyzeProducts(products: Product[]): AnalysisResult {
  const now = Date.now();
  const staleThresholdMs = SUGGESTION_CONFIG.staleThresholdDays * 24 * 60 * 60 * 1000;
  
  const staleProducts: Product[] = [];
  const marginDropProducts: Product[] = [];
  const lowMarginProducts: Product[] = [];
  const highPerformers: Product[] = [];
  
  for (const product of products) {
    // Skip paused or removed products
    if (product.status === 'paused' || product.status === 'removed') {
      continue;
    }

    // Check if stale
    if (product.last_price_check) {
      const lastCheck = new Date(product.last_price_check).getTime();
      if (now - lastCheck > staleThresholdMs) {
        staleProducts.push(product);
      }
    } else {
      // Never checked - consider stale
      staleProducts.push(product);
    }

    // Check profit margin
    if (product.profit_margin !== null && product.profit_margin !== undefined) {
      if (product.profit_margin < SUGGESTION_CONFIG.marginWarningThreshold) {
        lowMarginProducts.push(product);
      } else if (product.profit_margin >= PRICING_RULES.profitThresholds.target) {
        highPerformers.push(product);
      }
    }

    // Check for margin drop (would need historical data)
    // For now, flag products below 50% margin as potential drops
    if (product.profit_margin && product.profit_margin < 50 && product.profit_margin >= 30) {
      marginDropProducts.push(product);
    }
  }

  const healthyCount = products.length - staleProducts.length - lowMarginProducts.length;

  return {
    staleProducts,
    marginDropProducts,
    lowMarginProducts,
    highPerformers,
    stats: {
      totalAnalyzed: products.length,
      staleCount: staleProducts.length,
      marginIssueCount: lowMarginProducts.length,
      healthyCount: Math.max(0, healthyCount),
    },
  };
}

/**
 * Generate suggestions from analysis results
 */
function generateSuggestions(analysis: AnalysisResult): AISuggestion[] {
  const newSuggestions: AISuggestion[] = [];

  // Stale products suggestion
  if (analysis.staleProducts.length > 0) {
    const priority: SuggestionPriority = 
      analysis.staleProducts.length >= 50 ? 'high' :
      analysis.staleProducts.length >= 20 ? 'medium' : 'low';

    newSuggestions.push(createSuggestion({
      type: 'stale_products',
      priority,
      title: `${analysis.staleProducts.length} Products Need Price Refresh`,
      description: `These products haven't had their Amazon prices checked in over ${SUGGESTION_CONFIG.staleThresholdDays} days. Refreshing ensures your pricing stays competitive and margins accurate.`,
      actionLabel: 'Refresh All',
      actionType: 'refresh',
      actionData: { 
        productIds: analysis.staleProducts.slice(0, 100).map(p => p.id),
        reason: 'stale' 
      },
      affectedCount: analysis.staleProducts.length,
      estimatedImpact: `Keep pricing accurate for ${analysis.staleProducts.length} products`,
    }));
  }

  // Low margin products suggestion
  if (analysis.lowMarginProducts.length > 0) {
    const priority: SuggestionPriority = 
      analysis.lowMarginProducts.length >= 20 ? 'critical' :
      analysis.lowMarginProducts.length >= 10 ? 'high' : 'medium';

    const avgMargin = analysis.lowMarginProducts.reduce(
      (sum, p) => sum + (p.profit_margin || 0), 0
    ) / analysis.lowMarginProducts.length;

    newSuggestions.push(createSuggestion({
      type: 'margin_drop',
      priority,
      title: `${analysis.lowMarginProducts.length} Products Below ${SUGGESTION_CONFIG.marginWarningThreshold}% Margin`,
      description: `These products have margins below your ${SUGGESTION_CONFIG.marginWarningThreshold}% threshold (avg: ${avgMargin.toFixed(1)}%). Consider pausing or removing them to focus on profitable items.`,
      actionLabel: 'Review Products',
      actionType: 'view',
      actionData: { 
        productIds: analysis.lowMarginProducts.map(p => p.id),
        filter: 'low_margin'
      },
      affectedCount: analysis.lowMarginProducts.length,
      estimatedImpact: `Improve overall portfolio margin by focusing on profitable items`,
    }));
  }

  // Margin optimization suggestion
  if (analysis.marginDropProducts.length >= 5) {
    newSuggestions.push(createSuggestion({
      type: 'cost_optimization',
      priority: 'medium',
      title: 'Margin Optimization Opportunity',
      description: `${analysis.marginDropProducts.length} products have moderate margins (30-50%). Reviewing pricing or finding alternative suppliers could improve profitability.`,
      actionLabel: 'View Analysis',
      actionType: 'optimize',
      actionData: {
        productIds: analysis.marginDropProducts.map(p => p.id),
        suggestion: 'review_pricing'
      },
      affectedCount: analysis.marginDropProducts.length,
      estimatedImpact: `Potential to increase average margin by 10-20%`,
    }));
  }

  // High performers recognition
  if (analysis.highPerformers.length >= 10) {
    const avgMargin = analysis.highPerformers.reduce(
      (sum, p) => sum + (p.profit_margin || 0), 0
    ) / analysis.highPerformers.length;

    newSuggestions.push(createSuggestion({
      type: 'stock_alert',
      priority: 'low',
      title: `${analysis.highPerformers.length} Top Performing Products`,
      description: `Great news! These products maintain margins above ${PRICING_RULES.profitThresholds.target}% (avg: ${avgMargin.toFixed(1)}%). Consider featuring them or finding similar products.`,
      actionLabel: 'View Top Products',
      actionType: 'view',
      actionData: {
        productIds: analysis.highPerformers.slice(0, 20).map(p => p.id),
        filter: 'high_margin'
      },
      affectedCount: analysis.highPerformers.length,
      estimatedImpact: `These products drive your best margins`,
    }));
  }

  return newSuggestions;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API: SUGGESTIONS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run analysis and generate suggestions
 */
export async function runAnalysis(
  products: Product[]
): Promise<ApiResponse<{ suggestionsGenerated: number; stats: AnalysisResult['stats'] }>> {
  if (analysisRunning) {
    return createSuccessResponse({
      suggestionsGenerated: 0,
      stats: { totalAnalyzed: 0, staleCount: 0, marginIssueCount: 0, healthyCount: 0 },
    });
  }

  analysisRunning = true;

  try {
    // Perform analysis
    const analysis = analyzeProducts(products);
    
    // Generate new suggestions
    const newSuggestions = generateSuggestions(analysis);
    
    // Remove expired and duplicate suggestions
    const now = new Date();
    suggestions = suggestions.filter(s => {
      // Keep if not expired
      if (s.expires_at && new Date(s.expires_at) < now) return false;
      // Keep if actioned or dismissed
      if (s.status !== 'active') return true;
      return true;
    });

    // Deduplicate by type - keep most recent per type
    const existingTypes = new Set(suggestions.filter(s => s.status === 'active').map(s => s.type));
    
    for (const suggestion of newSuggestions) {
      // Skip if we already have an active suggestion of this type
      if (existingTypes.has(suggestion.type)) {
        // Update existing instead
        const existing = suggestions.find(s => s.type === suggestion.type && s.status === 'active');
        if (existing) {
          existing.title = suggestion.title;
          existing.description = suggestion.description;
          existing.affected_count = suggestion.affected_count;
          existing.action_data = suggestion.action_data;
          existing.estimated_impact = suggestion.estimated_impact;
        }
      } else {
        suggestions.unshift(suggestion);
        existingTypes.add(suggestion.type);
      }
    }

    // Limit total suggestions
    if (suggestions.length > SUGGESTION_CONFIG.maxActiveSuggestions * 2) {
      suggestions = suggestions.slice(0, SUGGESTION_CONFIG.maxActiveSuggestions * 2);
    }

    lastAnalysisAt = new Date().toISOString();

    return createSuccessResponse({
      suggestionsGenerated: newSuggestions.length,
      stats: analysis.stats,
    });
  } catch (error) {
    logError('AI_002', error instanceof Error ? error : new Error(String(error)));
    return createResponseFromCode('AI_002');
  } finally {
    analysisRunning = false;
  }
}

/**
 * Get all active suggestions
 */
export async function getSuggestions(options: {
  status?: SuggestionStatus;
  type?: SuggestionType;
  limit?: number;
} = {}): Promise<ApiResponse<AISuggestion[]>> {
  try {
    const { status = 'active', type, limit = 20 } = options;
    
    let filtered = suggestions;
    
    if (status) {
      filtered = filtered.filter(s => s.status === status);
    }
    
    if (type) {
      filtered = filtered.filter(s => s.type === type);
    }

    // Sort by priority and date
    const priorityOrder: Record<SuggestionPriority, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    filtered.sort((a, b) => {
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return createSuccessResponse(filtered.slice(0, limit));
  } catch (error) {
    logError('AI_001', error instanceof Error ? error : new Error(String(error)));
    return createResponseFromCode('AI_001');
  }
}

/**
 * Get suggestion summary
 */
export function getSuggestionSummary(): SuggestionSummary {
  const activeSuggestions = suggestions.filter(s => s.status === 'active');
  
  const byType: Record<SuggestionType, number> = {
    stale_products: 0,
    margin_drop: 0,
    cost_optimization: 0,
    stock_alert: 0,
  };
  
  const byPriority: Record<SuggestionPriority, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  let actionableCount = 0;

  for (const suggestion of activeSuggestions) {
    byType[suggestion.type]++;
    byPriority[suggestion.priority]++;
    if (suggestion.action_type) actionableCount++;
  }

  return {
    total: activeSuggestions.length,
    byType,
    byPriority,
    highPriorityCount: byPriority.high + byPriority.critical,
    actionableCount,
  };
}

/**
 * Dismiss a suggestion
 */
export async function dismissSuggestion(
  suggestionId: string
): Promise<ApiResponse<{ dismissed: boolean }>> {
  try {
    const suggestion = suggestions.find(s => s.id === suggestionId);
    
    if (!suggestion) {
      return createSuccessResponse({ dismissed: false });
    }

    suggestion.status = 'dismissed';
    suggestion.dismissed_at = new Date().toISOString();

    return createSuccessResponse({ dismissed: true });
  } catch (error) {
    logError('AI_012', error instanceof Error ? error : new Error(String(error)));
    return createResponseFromCode('AI_012');
  }
}

/**
 * Mark suggestion as actioned
 */
export async function markActioned(
  suggestionId: string
): Promise<ApiResponse<{ actioned: boolean }>> {
  try {
    const suggestion = suggestions.find(s => s.id === suggestionId);
    
    if (!suggestion) {
      return createSuccessResponse({ actioned: false });
    }

    suggestion.status = 'actioned';
    suggestion.actioned_at = new Date().toISOString();

    return createSuccessResponse({ actioned: true });
  } catch (error) {
    logError('AI_010', error instanceof Error ? error : new Error(String(error)));
    return createResponseFromCode('AI_010');
  }
}

/**
 * Execute suggestion action
 * This returns the action data so the caller can execute it
 */
export async function executeSuggestionAction(
  suggestionId: string,
  executor: {
    refreshProducts?: (productIds: string[]) => Promise<ApiResponse<{ refreshed: number }>>;
    pauseProducts?: (productIds: string[]) => Promise<ApiResponse<{ paused: number }>>;
    removeProducts?: (productIds: string[]) => Promise<ApiResponse<{ removed: number }>>;
  }
): Promise<ApiResponse<ActionResult>> {
  try {
    const suggestion = suggestions.find(s => s.id === suggestionId);
    
    if (!suggestion) {
      return createResponseFromCode('AI_010');
    }

    if (!suggestion.action_type || !suggestion.action_data) {
      return createSuccessResponse({
        executed: false,
        message: 'Suggestion has no associated action',
      });
    }

    const productIds = (suggestion.action_data.productIds as string[]) || [];
    let result: ActionResult = {
      executed: false,
      productIds,
      message: 'Action type not supported',
    };

    switch (suggestion.action_type) {
      case 'refresh':
        if (executor.refreshProducts) {
          const refreshResult = await executor.refreshProducts(productIds);
          if (refreshResult.success) {
            result = {
              executed: true,
              productIds,
              message: `Refreshed ${refreshResult.data.refreshed} products`,
            };
          }
        }
        break;

      case 'pause':
        if (executor.pauseProducts) {
          const pauseResult = await executor.pauseProducts(productIds);
          if (pauseResult.success) {
            result = {
              executed: true,
              productIds,
              message: `Paused ${pauseResult.data.paused} products`,
            };
          }
        }
        break;

      case 'remove':
        if (executor.removeProducts) {
          const removeResult = await executor.removeProducts(productIds);
          if (removeResult.success) {
            result = {
              executed: true,
              productIds,
              message: `Removed ${removeResult.data.removed} products`,
            };
          }
        }
        break;

      case 'view':
      case 'optimize':
        // These are navigation actions, return the data
        result = {
          executed: true,
          productIds,
          message: `Navigate to view ${productIds.length} products`,
        };
        break;
    }

    if (result.executed) {
      await markActioned(suggestionId);
    }

    return createSuccessResponse(result);
  } catch (error) {
    logError('AI_010', error instanceof Error ? error : new Error(String(error)));
    return createResponseFromCode('AI_010');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// QUICK SUGGESTIONS (CONTEXT-AWARE)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get contextual suggestions based on current page/action
 */
export function getContextualSuggestions(context: {
  page: 'products' | 'prices' | 'import' | 'dashboard';
  selectedCount?: number;
  filterApplied?: string;
}): AISuggestion[] {
  const { page, selectedCount = 0, filterApplied } = context;
  const contextSuggestions: AISuggestion[] = [];

  // Products page suggestions
  if (page === 'products') {
    if (selectedCount > 0) {
      contextSuggestions.push(createSuggestion({
        type: 'cost_optimization',
        priority: 'low',
        title: `Bulk Actions Available`,
        description: `${selectedCount} products selected. You can refresh prices, pause, or remove them in bulk.`,
        actionLabel: 'Open Bulk Actions',
        actionType: 'view',
        actionData: { action: 'bulk_menu' },
        affectedCount: selectedCount,
      }));
    }

    if (filterApplied === 'low_margin') {
      contextSuggestions.push(createSuggestion({
        type: 'margin_drop',
        priority: 'medium',
        title: 'Review Low Margin Products',
        description: 'Consider pausing products that consistently have margins below your threshold. They may not be worth the effort.',
        actionLabel: 'Select All Low Margin',
        actionType: 'view',
        actionData: { action: 'select_filtered' },
      }));
    }
  }

  // Prices page suggestions
  if (page === 'prices') {
    contextSuggestions.push(createSuggestion({
      type: 'cost_optimization',
      priority: 'low',
      title: 'Price Intelligence Tip',
      description: 'Monitor competitor prices regularly. Products with competitors priced significantly higher may be underpriced.',
      actionLabel: 'Learn More',
      actionType: 'view',
      actionData: { action: 'help_pricing' },
    }));
  }

  // Import page suggestions
  if (page === 'import') {
    contextSuggestions.push(createSuggestion({
      type: 'stock_alert',
      priority: 'low',
      title: 'Import Best Practices',
      description: 'For best results, import products that meet discovery criteria: $3-$25 price, 500+ reviews, 3.5+ rating.',
      actionLabel: 'View Criteria',
      actionType: 'view',
      actionData: { action: 'help_criteria' },
    }));
  }

  return contextSuggestions;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE STATUS
// ═══════════════════════════════════════════════════════════════════════════

export interface AISuggestionServiceStatus {
  isRunning: boolean;
  lastAnalysisAt?: string;
  activeSuggestionCount: number;
  summary: SuggestionSummary;
  analysisIntervalMinutes: number;
}

/**
 * Get service status
 */
export function getServiceStatus(): AISuggestionServiceStatus {
  return {
    isRunning: analysisRunning,
    lastAnalysisAt,
    activeSuggestionCount: suggestions.filter(s => s.status === 'active').length,
    summary: getSuggestionSummary(),
    analysisIntervalMinutes: SUGGESTION_CONFIG.analysisIntervalMinutes,
  };
}

/**
 * Clear all suggestions (for testing)
 */
export function clearAllSuggestions(): number {
  const count = suggestions.length;
  suggestions = [];
  return count;
}

/**
 * Get suggestion by ID
 */
export function getSuggestionById(id: string): AISuggestion | null {
  return suggestions.find(s => s.id === id) ?? null;
}

/**
 * Check if analysis should run (based on time)
 */
export function shouldRunAnalysis(): boolean {
  if (!lastAnalysisAt) return true;
  
  const lastRun = new Date(lastAnalysisAt).getTime();
  const intervalMs = SUGGESTION_CONFIG.analysisIntervalMinutes * 60 * 1000;
  
  return Date.now() - lastRun >= intervalMs;
}
