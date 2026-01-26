// lib/config/pricing-rules.ts
// SINGLE SOURCE OF TRUTH for all pricing rules and business configuration
// Every other file imports from here. Change here = changes everywhere.

// ═══════════════════════════════════════════════════════════════════════════
// PRICING RULES CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export const PRICING_RULES = {
  
  // ═══════════════════════════════════════════════════════════════════════
  // YOUR MARKUP (applied to Amazon cost)
  // ═══════════════════════════════════════════════════════════════════════
  yourMarkup: {
    multiplier: 1.70, // 70% markup on Amazon cost
    description: '70% markup on Amazon cost',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // COMPETITOR DISPLAY PRICES (applied to YOUR list price)
  // All must be at least 80% higher than your price
  // ═══════════════════════════════════════════════════════════════════════
  competitors: {
    minimumMarkup: 1.80, // 80% minimum - ENFORCED
    ranges: {
      amazon: { min: 1.82, max: 1.88 }, // 82-88% higher
      costco: { min: 1.80, max: 1.85 }, // 80-85% higher
      ebay: { min: 1.87, max: 1.93 }, // 87-93% higher (highest)
      sams: { min: 1.80, max: 1.83 }, // 80-83% higher (lowest)
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // PROFIT THRESHOLDS
  // ═══════════════════════════════════════════════════════════════════════
  profitThresholds: {
    minimum: 30, // Below 30% = alert
    target: 70, // Target profit percentage
    gracePeriodDays: 7, // Days before auto-pause in Shopify
  },

  // ═══════════════════════════════════════════════════════════════════════
  // PRODUCT DISCOVERY CRITERIA
  // ═══════════════════════════════════════════════════════════════════════
  discovery: {
    minAmazonPrice: 3,
    maxAmazonPrice: 25,
    minReviews: 500,
    minRating: 3.5,
    requirePrime: true,
    excludeTitleWords: [
      // Major brands
      'nike', 'adidas', 'apple', 'samsung', 'sony', 'lg', 'philips',
      'bose', 'beats', 'jbl', 'anker', 'logitech', 'microsoft',
      // Brand indicators
      'branded', 'official', 'licensed', 'authentic', 'genuine',
      // Entertainment brands
      'disney', 'marvel', 'star wars', 'pokemon', 'nintendo',
      // Condition indicators
      'refurbished', 'renewed', 'used', 'open box',
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // REFRESH SETTINGS
  // ═══════════════════════════════════════════════════════════════════════
  refresh: {
    staleThresholdDays: 14, // Products without price check for 14+ days are stale
    tiers: {
      high: { minPrice: 20, intervalDays: 1 }, // Daily refresh for $20+ items
      medium: { minPrice: 10, intervalDays: 3 }, // Every 3 days for $10-20 items
      low: { minPrice: 0, intervalDays: 7 }, // Weekly for <$10 items
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // SHOPIFY QUEUE SETTINGS
  // ═══════════════════════════════════════════════════════════════════════
  shopifyQueue: {
    batchSize: 250, // Max products per batch
    delayBetweenBatchesMs: 180000, // 3 minutes between batches
    maxRetries: 3, // Max retry attempts per item
    retryDelayMs: 30000, // 30 seconds between retries
  },

  // ═══════════════════════════════════════════════════════════════════════
  // IMPORT LIMITS
  // ═══════════════════════════════════════════════════════════════════════
  import: {
    maxFileSize: 100000, // 100k products per upload
    maxPasteItems: 10000, // Max items from paste
    maxFileSizeMB: 50, // Max file size in MB
    supportedFileTypes: ['csv', 'json', 'xlsx', 'xls', 'txt'],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ADMIN SETTINGS
  // ═══════════════════════════════════════════════════════════════════════
  admin: {
    canOverrideRules: true, // Admins can bypass rules without warnings
  },

  // ═══════════════════════════════════════════════════════════════════════
  // API COST RATES (for estimation only)
  // ═══════════════════════════════════════════════════════════════════════
  apiCosts: {
    rainforest: {
      search: 0.01, // Per search request
      product: 0.005, // Per product details request
    },
    keepa: {
      tokensPerProduct: 20, // Tokens per product lookup
      tokenCostUsd: 0.001, // USD per token
    },
  },

} as const;

// Type export for the pricing rules
export type PricingRules = typeof PRICING_RULES;

// ═══════════════════════════════════════════════════════════════════════════
// COMPETITOR NAMES (for display purposes)
// ═══════════════════════════════════════════════════════════════════════════

export const COMPETITOR_NAMES = {
  amazon: 'Amazon',
  costco: 'Costco',
  ebay: 'eBay',
  sams: "Sam's Club",
} as const;

export type CompetitorKey = keyof typeof COMPETITOR_NAMES;

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validates that the pricing rules configuration is valid
 * Called on app startup to catch config errors early
 */
export function validatePricingConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate your markup multiplier
  if (PRICING_RULES.yourMarkup.multiplier <= 1.0) {
    errors.push('yourMarkup.multiplier must be greater than 1.0');
  }

  // Validate competitor minimum markup
  if (PRICING_RULES.competitors.minimumMarkup < 1.80) {
    errors.push('competitors.minimumMarkup must be at least 1.80 (80%)');
  }

  // Validate all competitor ranges meet minimum
  const { ranges, minimumMarkup } = PRICING_RULES.competitors;
  for (const [competitor, range] of Object.entries(ranges)) {
    if (range.min < minimumMarkup) {
      errors.push(`competitors.ranges.${competitor}.min must be >= ${minimumMarkup}`);
    }
    if (range.max < range.min) {
      errors.push(`competitors.ranges.${competitor}.max must be >= min`);
    }
  }

  // Validate profit thresholds
  if (PRICING_RULES.profitThresholds.minimum < 0 || PRICING_RULES.profitThresholds.minimum > 100) {
    errors.push('profitThresholds.minimum must be between 0 and 100');
  }

  // Validate discovery criteria
  if (PRICING_RULES.discovery.minAmazonPrice > PRICING_RULES.discovery.maxAmazonPrice) {
    errors.push('discovery.minAmazonPrice must be <= maxAmazonPrice');
  }

  // Validate refresh tiers
  const { tiers } = PRICING_RULES.refresh;
  if (tiers.high.minPrice <= tiers.medium.minPrice) {
    errors.push('refresh.tiers.high.minPrice must be > medium.minPrice');
  }
  if (tiers.medium.minPrice <= tiers.low.minPrice) {
    errors.push('refresh.tiers.medium.minPrice must be > low.minPrice');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get the refresh interval for a product based on its price
 */
export function getRefreshInterval(price: number): number {
  const { tiers } = PRICING_RULES.refresh;
  
  if (price >= tiers.high.minPrice) {
    return tiers.high.intervalDays;
  }
  if (price >= tiers.medium.minPrice) {
    return tiers.medium.intervalDays;
  }
  return tiers.low.intervalDays;
}

/**
 * Check if a product title contains excluded brand words
 */
export function containsExcludedBrand(title: string): boolean {
  const lowerTitle = title.toLowerCase();
  return PRICING_RULES.discovery.excludeTitleWords.some(word => 
    lowerTitle.includes(word.toLowerCase())
  );
}

/**
 * Check if a product meets discovery criteria
 */
export function meetsDiscoveryCriteria(product: {
  price: number | null;
  rating: number | null;
  reviews: number | null;
  isPrime: boolean;
  title: string;
}): { meets: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const { discovery } = PRICING_RULES;

  if (product.price === null) {
    reasons.push('No price available');
  } else {
    if (product.price < discovery.minAmazonPrice) {
      reasons.push(`Price $${product.price} below minimum $${discovery.minAmazonPrice}`);
    }
    if (product.price > discovery.maxAmazonPrice) {
      reasons.push(`Price $${product.price} above maximum $${discovery.maxAmazonPrice}`);
    }
  }

  if (product.reviews === null || product.reviews < discovery.minReviews) {
    reasons.push(`Reviews ${product.reviews ?? 0} below minimum ${discovery.minReviews}`);
  }

  if (product.rating === null || product.rating < discovery.minRating) {
    reasons.push(`Rating ${product.rating ?? 0} below minimum ${discovery.minRating}`);
  }

  if (discovery.requirePrime && !product.isPrime) {
    reasons.push('Not Prime eligible');
  }

  if (containsExcludedBrand(product.title)) {
    reasons.push('Contains excluded brand word');
  }

  return {
    meets: reasons.length === 0,
    reasons,
  };
}
