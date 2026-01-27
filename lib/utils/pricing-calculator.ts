// lib/utils/pricing-calculator.ts
// Core pricing calculation functions
// Uses rules from lib/config/pricing-rules.ts as single source of truth

import type { 
  CompetitorPrices, 
  AllPrices, 
  ProfitMetrics,
  ProfitStatus 
} from '@/types';
import { PRICING_RULES, type CompetitorKey } from '@/lib/config/pricing-rules';

// ═══════════════════════════════════════════════════════════════════════════
// RANDOM NUMBER GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a random number within a range (inclusive)
 * Used for competitor price randomization
 */
export function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Generate a seeded random number for consistent competitor prices
 * Uses product ID or cost as seed for reproducibility
 */
export function seededRandomInRange(
  min: number, 
  max: number, 
  seed: number
): number {
  // Simple seeded random using sine
  const x = Math.sin(seed) * 10000;
  const random = x - Math.floor(x);
  return min + random * (max - min);
}

// ═══════════════════════════════════════════════════════════════════════════
// LIST PRICE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

export interface ListPriceResult {
  success: boolean;
  price?: number;
  errorCode?: string;
  errorDetails?: string;
}

/**
 * Calculate list price from Amazon cost
 * Formula: Amazon Cost × 1.70 (70% markup)
 */
export function calculateListPrice(amazonCost: number): ListPriceResult {
  // Validate input
  if (amazonCost === null || amazonCost === undefined) {
    return {
      success: false,
      errorCode: 'PRICE_CALC_001',
      errorDetails: 'Cost price is null or undefined',
    };
  }

  if (typeof amazonCost !== 'number' || isNaN(amazonCost)) {
    return {
      success: false,
      errorCode: 'PRICE_CALC_001',
      errorDetails: `Cost price is not a valid number: ${amazonCost}`,
    };
  }

  if (amazonCost <= 0) {
    return {
      success: false,
      errorCode: 'PRICE_CALC_001',
      errorDetails: `Cost price must be positive: ${amazonCost}`,
    };
  }

  const price = roundToTwoDecimals(amazonCost * PRICING_RULES.yourMarkup.multiplier);
  
  return {
    success: true,
    price,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPETITOR PRICE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

export interface CompetitorPricesResult {
  success: boolean;
  prices?: CompetitorPrices;
  warnings?: string[];
  errorCode?: string;
  errorDetails?: string;
}

/**
 * Calculate randomized competitor prices (all 80%+ higher than list price)
 * Uses ranges from config for each competitor
 */
export function calculateCompetitorPrices(
  listPrice: number,
  options: { seed?: number } = {}
): CompetitorPricesResult {
  const warnings: string[] = [];

  // Validate input
  if (listPrice === null || listPrice === undefined) {
    return {
      success: false,
      errorCode: 'PRICE_CALC_002',
      errorDetails: 'List price is null or undefined',
    };
  }

  if (typeof listPrice !== 'number' || isNaN(listPrice)) {
    return {
      success: false,
      errorCode: 'PRICE_CALC_002',
      errorDetails: `List price is not a valid number: ${listPrice}`,
    };
  }

  if (listPrice <= 0) {
    return {
      success: false,
      errorCode: 'PRICE_CALC_002',
      errorDetails: `List price must be positive: ${listPrice}`,
    };
  }

  const { ranges, minimumMarkup } = PRICING_RULES.competitors;
  const minimumPrice = listPrice * minimumMarkup;

  // Calculate each competitor price
  const randomFn = options.seed !== undefined
    ? (min: number, max: number, offset: number) => 
        seededRandomInRange(min, max, options.seed! + offset)
    : (min: number, max: number) => randomInRange(min, max);

  const calculateForCompetitor = (
    key: CompetitorKey, 
    seedOffset: number
  ): number => {
    const range = ranges[key];
    const multiplier = randomFn(range.min, range.max, seedOffset);
    const price = roundToTwoDecimals(listPrice * multiplier);
    
    // Enforce minimum (should never happen if ranges are configured correctly)
    if (price < minimumPrice) {
      warnings.push(`${key} price auto-corrected from $${price} to minimum $${roundToTwoDecimals(minimumPrice)}`);
      return roundToTwoDecimals(minimumPrice);
    }
    
    return price;
  };

  const amazon = calculateForCompetitor('amazon', 1);
  const costco = calculateForCompetitor('costco', 2);
  const ebay = calculateForCompetitor('ebay', 3);
  const sams = calculateForCompetitor('sams', 4);

  // Find highest for compare_at_price
  const highest = Math.max(amazon, costco, ebay, sams);

  const result: CompetitorPricesResult = {
    success: true,
    prices: {
      amazon,
      costco,
      ebay,
      sams,
      highest,
    },
  };

  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  return result;
}

/**
 * Calculate a single competitor price by key
 */
export function calculateSingleCompetitorPrice(
  listPrice: number,
  competitor: CompetitorKey,
  options: { seed?: number } = {}
): { price: number; warning?: string } {
  const range = PRICING_RULES.competitors.ranges[competitor];
  const minimumMarkup = PRICING_RULES.competitors.minimumMarkup;
  const minimumPrice = listPrice * minimumMarkup;

  const multiplier = options.seed !== undefined
    ? seededRandomInRange(range.min, range.max, options.seed)
    : randomInRange(range.min, range.max);
  
  let price = roundToTwoDecimals(listPrice * multiplier);
  let warning: string | undefined;
  
  // Enforce minimum
  if (price < minimumPrice) {
    warning = `Price auto-corrected to minimum 80% markup`;
    price = roundToTwoDecimals(minimumPrice);
  }

  return { price, warning };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROFIT CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

export interface ProfitResult {
  success: boolean;
  metrics?: ProfitMetrics;
  errorCode?: string;
  errorDetails?: string;
}

/**
 * Calculate profit metrics
 */
export function calculateProfit(
  cost: number, 
  listPrice: number
): ProfitResult {
  // Validate inputs
  if (cost === null || cost === undefined || listPrice === null || listPrice === undefined) {
    return {
      success: false,
      errorCode: 'PRICE_CALC_004',
      errorDetails: 'Cost or list price is null or undefined',
    };
  }

  if (typeof cost !== 'number' || typeof listPrice !== 'number') {
    return {
      success: false,
      errorCode: 'PRICE_CALC_004',
      errorDetails: 'Cost or list price is not a number',
    };
  }

  if (cost <= 0) {
    return {
      success: false,
      errorCode: 'PRICE_CALC_004',
      errorDetails: `Cannot calculate profit with cost <= 0: ${cost}`,
    };
  }

  const amount = roundToTwoDecimals(listPrice - cost);
  const percent = roundToTwoDecimals((amount / cost) * 100);

  // Check for NaN result
  if (isNaN(percent)) {
    return {
      success: false,
      errorCode: 'PRICE_CALC_004',
      errorDetails: `Profit calculation resulted in NaN. Cost: ${cost}, List: ${listPrice}`,
    };
  }

  // Determine profit status
  let status: ProfitStatus = 'unknown';
  if (percent >= PRICING_RULES.profitThresholds.minimum) {
    status = 'profitable';
  } else if (percent < PRICING_RULES.profitThresholds.minimum) {
    status = 'below_threshold';
  }

  return {
    success: true,
    metrics: {
      amount,
      percent,
      status,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ALL-IN-ONE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

export interface AllPricesResult {
  success: boolean;
  data?: AllPrices;
  warnings?: string[];
  errorCode?: string;
  errorDetails?: string;
}

/**
 * Calculate all prices at once (list, competitors, profit)
 * This is the main function to use when processing products
 */
export function calculateAllPrices(
  amazonCost: number,
  options: { seed?: number } = {}
): AllPricesResult {
  const warnings: string[] = [];

  // Step 1: Calculate list price
  const listResult = calculateListPrice(amazonCost);
  if (!listResult.success) {
    return {
      success: false,
      errorCode: listResult.errorCode,
      errorDetails: listResult.errorDetails,
    };
  }

  const listPrice = listResult.price!;

  // Step 2: Calculate competitor prices
  const competitorResult = calculateCompetitorPrices(listPrice, options);
  if (!competitorResult.success) {
    return {
      success: false,
      errorCode: competitorResult.errorCode,
      errorDetails: competitorResult.errorDetails,
    };
  }

  if (competitorResult.warnings) {
    warnings.push(...competitorResult.warnings);
  }

  // Step 3: Calculate profit
  const profitResult = calculateProfit(amazonCost, listPrice);
  if (!profitResult.success) {
    return {
      success: false,
      errorCode: profitResult.errorCode,
      errorDetails: profitResult.errorDetails,
    };
  }

  const result: AllPricesResult = {
    success: true,
    data: {
      cost: amazonCost,
      listPrice,
      competitors: competitorResult.prices!,
      profit: profitResult.metrics!,
    },
  };

  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// RECALCULATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recalculate all prices for a product that already has a list price
 * (useful for refreshing competitor prices without changing list price)
 */
export function recalculateCompetitorsAndProfit(
  cost: number,
  listPrice: number,
  options: { seed?: number } = {}
): AllPricesResult {
  const warnings: string[] = [];

  // Validate cost
  if (cost <= 0) {
    return {
      success: false,
      errorCode: 'PRICE_CALC_001',
      errorDetails: `Cost must be positive: ${cost}`,
    };
  }

  // Validate list price
  if (listPrice <= 0) {
    return {
      success: false,
      errorCode: 'PRICE_CALC_002',
      errorDetails: `List price must be positive: ${listPrice}`,
    };
  }

  // Calculate competitor prices
  const competitorResult = calculateCompetitorPrices(listPrice, options);
  if (!competitorResult.success) {
    return {
      success: false,
      errorCode: competitorResult.errorCode,
      errorDetails: competitorResult.errorDetails,
    };
  }

  if (competitorResult.warnings) {
    warnings.push(...competitorResult.warnings);
  }

  // Calculate profit
  const profitResult = calculateProfit(cost, listPrice);
  if (!profitResult.success) {
    return {
      success: false,
      errorCode: profitResult.errorCode,
      errorDetails: profitResult.errorDetails,
    };
  }

  const result: AllPricesResult = {
    success: true,
    data: {
      cost,
      listPrice,
      competitors: competitorResult.prices!,
      profit: profitResult.metrics!,
    },
  };

  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Round to two decimal places (for currency)
 */
export function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Format price for display
 */
export function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return '-';
  return `$${price.toFixed(2)}`;
}

/**
 * Format profit percentage for display
 */
export function formatProfitPercent(percent: number | null | undefined): string {
  if (percent === null || percent === undefined) return '-';
  return `${percent.toFixed(1)}%`;
}

/**
 * Get expected list price from a given cost
 */
export function getExpectedListPrice(cost: number): number {
  return roundToTwoDecimals(cost * PRICING_RULES.yourMarkup.multiplier);
}

/**
 * Get minimum competitor price for a given list price
 */
export function getMinimumCompetitorPrice(listPrice: number): number {
  return roundToTwoDecimals(listPrice * PRICING_RULES.competitors.minimumMarkup);
}

/**
 * Check if a competitor price meets the minimum requirement
 */
export function meetsCompetitorMinimum(
  competitorPrice: number, 
  listPrice: number
): boolean {
  const minimum = getMinimumCompetitorPrice(listPrice);
  return competitorPrice >= minimum;
}

/**
 * Check if profit margin meets the minimum threshold
 */
export function meetsProfitThreshold(profitPercent: number): boolean {
  return profitPercent >= PRICING_RULES.profitThresholds.minimum;
}

/**
 * Get the profit threshold from config
 */
export function getProfitThreshold(): number {
  return PRICING_RULES.profitThresholds.minimum;
}

/**
 * Get the target profit from config
 */
export function getTargetProfit(): number {
  return PRICING_RULES.profitThresholds.target;
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMPLE HELPER FUNCTIONS (return direct values for backwards compatibility)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simple retail price calculator - returns number directly
 * Used by components that expect a number, not ListPriceResult
 */
export function calculateRetailPrice(amazonCost: number): number {
  const result = calculateListPrice(amazonCost);
  return result.price ?? 0;
}

/**
 * Simple profit calculator - returns { profit, margin } directly
 * Used by components that expect direct values, not ProfitResult
 */
export function calculateSimpleProfit(cost: number, listPrice: number): { profit: number; margin: number } {
  const result = calculateProfit(cost, listPrice);
  return {
    profit: result.metrics?.amount ?? 0,
    margin: result.metrics?.percent ?? 0,
  };
}

/**
 * Simple competitor prices - returns Record<string, number> directly
 * Used by components that expect direct values, not CompetitorPricesResult
 */
export function getCompetitorPrices(listPrice: number): Record<string, number> {
  const result = calculateCompetitorPrices(listPrice);
  if (result.prices) {
    return {
      amazon: result.prices.amazon,
      costco: result.prices.costco,
      ebay: result.prices.ebay,
      sams: result.prices.sams,
      highest: result.prices.highest,
    };
  }
  return { amazon: 0, costco: 0, ebay: 0, sams: 0, highest: 0 };
}

/**
 * Alias for calculateCompetitorPrices - used by some components
 */
export { calculateCompetitorPrices as calculateCompetitorDisplayPrices };

