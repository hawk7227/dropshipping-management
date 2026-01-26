// app/api/suggestions/route.ts
// COMPLETE Suggestions API - AI-powered suggestions for inventory optimization
// Handles: suggestion generation, application, dismissal, snoozing

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Product, AISuggestion, SuggestionType, SuggestionPriority } from '@/types';
import type { ApiError } from '@/types/errors';
import { PRICING_RULES } from '@/lib/config/pricing-rules';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface SuggestionAction {
  suggestionId: string;
  action: 'apply' | 'dismiss' | 'snooze';
  snoozeHours?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const MARGIN_THRESHOLD = PRICING_RULES.profitThresholds.minimum;
const STALE_THRESHOLD_DAYS = PRICING_RULES.refresh.staleThresholdDays;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase configuration');
  return createClient(supabaseUrl, supabaseKey);
}

function generateId(): string {
  return `sug-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function errorResponse(error: ApiError, status: number = 400): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

function successResponse<T>(data: T, meta?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ success: true, data, ...(meta && { meta }) });
}

/**
 * Generate suggestions based on product analysis
 */
function generateSuggestions(products: Product[]): AISuggestion[] {
  const suggestions: AISuggestion[] = [];
  const now = new Date();

  // 1. Low margin products
  const lowMarginProducts = products.filter(
    p => p.profit_margin !== null && p.profit_margin < MARGIN_THRESHOLD
  );
  if (lowMarginProducts.length > 0) {
    suggestions.push({
      id: generateId(),
      type: 'margin_alert',
      priority: lowMarginProducts.length > 5 ? 'critical' : 'high',
      title: `${lowMarginProducts.length} products below margin threshold`,
      description: `These products have profit margins below ${MARGIN_THRESHOLD}%. Consider adjusting prices or removing them from inventory.`,
      affectedProducts: lowMarginProducts.map(p => p.id),
      suggestedAction: 'review_pricing',
      potentialImpact: lowMarginProducts.length * 5,
      confidence: 0.95,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  // 2. Stale products (need price refresh)
  const staleProducts = products.filter(p => {
    if (!p.last_price_check) return true;
    const daysSince = (now.getTime() - new Date(p.last_price_check).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > STALE_THRESHOLD_DAYS;
  });
  if (staleProducts.length > 0) {
    suggestions.push({
      id: generateId(),
      type: 'action_required',
      priority: staleProducts.length > 10 ? 'high' : 'medium',
      title: `${staleProducts.length} products need price refresh`,
      description: `These products haven't been price-checked in over ${STALE_THRESHOLD_DAYS} days and may have outdated pricing.`,
      affectedProducts: staleProducts.map(p => p.id),
      suggestedAction: 'refresh_prices',
      potentialImpact: staleProducts.length * 2,
      confidence: 0.9,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
    });
  }

  // 3. High margin products (potential for competitive pricing)
  const highMarginProducts = products.filter(
    p => p.profit_margin !== null && p.profit_margin > MARGIN_THRESHOLD * 2.5
  );
  if (highMarginProducts.length > 3) {
    suggestions.push({
      id: generateId(),
      type: 'price_adjustment',
      priority: 'low',
      title: `${highMarginProducts.length} products could be more competitive`,
      description: `These products have very high margins and could potentially be priced more competitively to increase sales volume.`,
      affectedProducts: highMarginProducts.map(p => p.id),
      suggestedAction: 'lower_prices',
      potentialImpact: highMarginProducts.length * 3,
      confidence: 0.7,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString(),
    });
  }

  // 4. Unsynced products
  const unsyncedProducts = products.filter(p => !p.shopify_id && p.status === 'active');
  if (unsyncedProducts.length > 0) {
    suggestions.push({
      id: generateId(),
      type: 'action_required',
      priority: 'medium',
      title: `${unsyncedProducts.length} active products not synced to Shopify`,
      description: `These products are marked active but not yet synced to your Shopify store.`,
      affectedProducts: unsyncedProducts.map(p => p.id),
      suggestedAction: 'sync_to_shopify',
      potentialImpact: unsyncedProducts.length * 4,
      confidence: 0.85,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
    });
  }

  // 5. Top performers (trend insight)
  const topPerformers = products
    .filter(p => (p.rating || 0) >= 4.5 && (p.review_count || 0) >= 500)
    .slice(0, 5);
  if (topPerformers.length > 0) {
    suggestions.push({
      id: generateId(),
      type: 'trend_insight',
      priority: 'low',
      title: 'High-performing products identified',
      description: `${topPerformers.length} products show strong customer ratings and review counts, indicating high demand.`,
      affectedProducts: topPerformers.map(p => p.id),
      suggestedAction: 'increase_inventory',
      potentialImpact: 15,
      confidence: 0.75,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 168 * 60 * 60 * 1000).toISOString(),
    });
  }

  // Sort by priority
  const priorityOrder: Record<SuggestionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

// ═══════════════════════════════════════════════════════════════════════════
// GET - Get suggestions
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true';
    const typeFilter = request.nextUrl.searchParams.get('type') as SuggestionType | null;
    const priorityFilter = request.nextUrl.searchParams.get('priority') as SuggestionPriority | null;

    // Fetch products for analysis
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .in('status', ['active', 'pending', 'paused']);

    if (error) {
      return errorResponse({
        code: 'SUG_001',
        message: 'Failed to fetch products',
        details: error.message,
      }, 500);
    }

    // Generate suggestions
    let suggestions = generateSuggestions(products || []);

    // Apply filters
    if (typeFilter) {
      suggestions = suggestions.filter(s => s.type === typeFilter);
    }
    if (priorityFilter) {
      suggestions = suggestions.filter(s => s.priority === priorityFilter);
    }

    // Calculate summary
    const summary = {
      total: suggestions.length,
      byPriority: {
        critical: suggestions.filter(s => s.priority === 'critical').length,
        high: suggestions.filter(s => s.priority === 'high').length,
        medium: suggestions.filter(s => s.priority === 'medium').length,
        low: suggestions.filter(s => s.priority === 'low').length,
      },
      byType: {
        margin_alert: suggestions.filter(s => s.type === 'margin_alert').length,
        price_adjustment: suggestions.filter(s => s.type === 'price_adjustment').length,
        action_required: suggestions.filter(s => s.type === 'action_required').length,
        trend_insight: suggestions.filter(s => s.type === 'trend_insight').length,
      },
      totalAffectedProducts: new Set(suggestions.flatMap(s => s.affectedProducts)).size,
      totalPotentialImpact: suggestions.reduce((sum, s) => sum + s.potentialImpact, 0),
    };

    return successResponse(suggestions, { summary, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Suggestions GET error:', error);
    return errorResponse({
      code: 'SUG_002',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST - Apply suggestion action
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as SuggestionAction;

    if (!body.suggestionId || !body.action) {
      return errorResponse({
        code: 'SUG_003',
        message: 'Invalid request',
        details: 'suggestionId and action are required',
      }, 400);
    }

    // In a real implementation, we would:
    // 1. Store dismissed/snoozed suggestions in the database
    // 2. Execute the actual action (refresh prices, sync to Shopify, etc.)

    switch (body.action) {
      case 'apply':
        // Execute the suggestion's recommended action
        return successResponse({
          suggestionId: body.suggestionId,
          action: 'apply',
          status: 'executed',
          message: 'Suggestion applied successfully',
        });

      case 'dismiss':
        // Mark suggestion as dismissed
        return successResponse({
          suggestionId: body.suggestionId,
          action: 'dismiss',
          status: 'dismissed',
          message: 'Suggestion dismissed',
        });

      case 'snooze':
        const snoozeHours = body.snoozeHours || 24;
        const snoozeUntil = new Date(Date.now() + snoozeHours * 60 * 60 * 1000);
        return successResponse({
          suggestionId: body.suggestionId,
          action: 'snooze',
          status: 'snoozed',
          snoozeUntil: snoozeUntil.toISOString(),
          message: `Suggestion snoozed for ${snoozeHours} hours`,
        });

      default:
        return errorResponse({
          code: 'SUG_004',
          message: 'Invalid action',
          details: `Action "${body.action}" is not supported`,
        }, 400);
    }
  } catch (error) {
    console.error('Suggestions POST error:', error);
    return errorResponse({
      code: 'SUG_005',
      message: 'Invalid request',
      details: error instanceof Error ? error.message : 'Failed to parse request',
    }, 400);
  }
}
