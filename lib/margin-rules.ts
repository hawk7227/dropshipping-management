// lib/margin-rules.ts
// Margin rules engine for price intelligence

import { createClient } from '@supabase/supabase-js';

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

export interface MarginRuleMatch {
  ruleId: string;
  ruleName: string;
  action: 'alert' | 'auto-adjust';
  minMargin: number;
  targetMargin: number;
  maxMargin: number;
  status: 'ok' | 'warning' | 'critical';
  currentMargin: number;
  recommendation: string;
}

export interface MarginAnalysis {
  productId: string;
  title: string;
  costPrice: number;
  ourPrice: number;
  competitorPrice: number;
  currentMargin: number;
  marginPercent: number;
  matchedRules: MarginRuleMatch[];
  suggestedPrice?: number;
  alerts: string[];
}

/**
 * Calculate margin in percentage
 */
export function calculateMarginPercent(ourPrice: number, costPrice: number): number {
  if (costPrice <= 0) return 0;
  return ((ourPrice - costPrice) / costPrice) * 100;
}

/**
 * Calculate required price for target margin
 */
export function calculatePriceForMargin(costPrice: number, targetMarginPercent: number): number {
  return costPrice * (1 + targetMarginPercent / 100);
}

/**
 * Get applicable margin rules for a product
 */
export async function getApplicableRules(
  product: {
    id: string;
    category?: string;
    vendor?: string;
    product_type?: string;
    sku?: string;
  }
): Promise<any[]> {
  try {
    // Get all active rules ordered by priority
    const { data: rules, error } = await supabase
      .from('margin_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error) throw error;

    // Filter rules that match the product
    return (rules || []).filter((rule) => {
      if (rule.category && rule.category !== product.category) return false;
      if (rule.vendor && rule.vendor !== product.vendor) return false;
      if (rule.product_type && rule.product_type !== product.product_type) return false;
      
      if (rule.sku_pattern && product.sku) {
        const pattern = rule.sku_pattern.replace('*', '.*');
        const regex = new RegExp(`^${pattern}$`);
        if (!regex.test(product.sku)) return false;
      }

      return true;
    });
  } catch (error) {
    console.error('Error fetching margin rules:', error);
    return [];
  }
}

/**
 * Analyze margin for a product against rules
 */
export async function analyzeProductMargin(
  product: {
    id: string;
    title: string;
    category?: string;
    vendor?: string;
    product_type?: string;
    sku?: string;
  },
  costPrice: number,
  ourPrice: number,
  competitorPrice: number
): Promise<MarginAnalysis> {
  const currentMargin = ourPrice - costPrice;
  const marginPercent = calculateMarginPercent(ourPrice, costPrice);

  // Get applicable rules
  const rules = await getApplicableRules(product);

  const matchedRules: MarginRuleMatch[] = [];
  const alerts: string[] = [];
  let suggestedPrice: number | undefined;

  // Check each rule
  for (const rule of rules) {
    const status = marginPercent < rule.min_margin ? 'critical' : marginPercent < (rule.target_margin || rule.min_margin + 15) ? 'warning' : 'ok';

    let recommendation = '';
    if (status === 'critical') {
      recommendation = `Margin is below minimum (${marginPercent.toFixed(1)}% < ${rule.min_margin}%). `;
      const requiredPrice = calculatePriceForMargin(costPrice, rule.min_margin);
      recommendation += `Increase price to $${requiredPrice.toFixed(2)}`;

      if (!suggestedPrice || requiredPrice > suggestedPrice) {
        suggestedPrice = requiredPrice;
      }

      alerts.push(`${rule.name}: Critical margin alert`);

      // Auto-adjust if rule allows
      if (rule.action === 'auto-adjust') {
        // Log for admin review
        alerts.push(`${rule.name}: Would auto-adjust to $${requiredPrice.toFixed(2)}`);
      }
    } else if (status === 'warning') {
      recommendation = `Margin is below target (${marginPercent.toFixed(1)}% < ${rule.target_margin || rule.min_margin + 15}%).`;
      alerts.push(`${rule.name}: Margin warning`);
    }

    matchedRules.push({
      ruleId: rule.id,
      ruleName: rule.name,
      action: rule.action,
      minMargin: rule.min_margin,
      targetMargin: rule.target_margin || rule.min_margin + 15,
      maxMargin: rule.max_margin || 100,
      status,
      currentMargin: marginPercent,
      recommendation,
    });
  }

  return {
    productId: product.id,
    title: product.title,
    costPrice,
    ourPrice,
    competitorPrice,
    currentMargin,
    marginPercent,
    matchedRules,
    suggestedPrice,
    alerts,
  };
}

/**
 * Batch analyze multiple products
 */
export async function analyzeProductMargins(
  products: Array<{
    id: string;
    title: string;
    category?: string;
    vendor?: string;
    product_type?: string;
    sku?: string;
    cost_price: number;
    price: number;
    competitor_price: number;
  }>
): Promise<MarginAnalysis[]> {
  return Promise.all(
    products.map((p) =>
      analyzeProductMargin(
        {
          id: p.id,
          title: p.title,
          category: p.category,
          vendor: p.vendor,
          product_type: p.product_type,
          sku: p.sku,
        },
        p.cost_price,
        p.price,
        p.competitor_price
      )
    )
  );
}

/**
 * Create margin alert from analysis
 */
export async function createMarginAlert(
  productId: string,
  analysis: MarginAnalysis,
  ruleId: string
): Promise<void> {
  try {
    const criticalRule = analysis.matchedRules.find((r) => r.status === 'critical');

    if (criticalRule) {
      await getSupabaseClient().from('margin_alerts').insert({
        product_id: productId,
        alert_type: 'margin_critical',
        alert_code: 'margin_below_minimum',
        message: `Product margin ${analysis.marginPercent.toFixed(1)}% is below minimum (${criticalRule.minMargin}%)`,
        recommendation: criticalRule.recommendation,
        is_resolved: false,
      });
    }
  } catch (error) {
    console.error('Error creating margin alert:', error);
  }
}
