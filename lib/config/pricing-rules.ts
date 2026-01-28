// lib/config/pricing-rules.ts
// ═══════════════════════════════════════════════════════════════════════════
// SINGLE SOURCE OF TRUTH for all pricing rules and business configuration
// Every other file imports from here. Change here = changes everywhere.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CONFIGURATION OBJECT
// ═══════════════════════════════════════════════════════════════════════════

export const PRICING_RULES = {
  // ─────────────────────────────────────────────────────────────────────────
  // CORE PRICING
  // ─────────────────────────────────────────────────────────────────────────
  markup: {
    percent: 70,                    // 70% markup on Amazon cost
    minimumProfit: 3.00,            // Minimum $3 profit per item
    minimumMarginPercent: 25,       // Minimum 25% margin
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PRICE RANGES
  // ─────────────────────────────────────────────────────────────────────────
  priceRange: {
    min: 5.00,                      // Minimum retail price
    max: 100.00,                    // Maximum retail price
    amazonMin: 3.00,                // Minimum Amazon cost to consider
    amazonMax: 60.00,               // Maximum Amazon cost to consider
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DISCOVERY CRITERIA
  // ─────────────────────────────────────────────────────────────────────────
  discovery: {
    minPrice: 3,                    // Minimum Amazon price
    maxPrice: 25,                   // Maximum Amazon price
    minReviews: 500,                // Minimum review count
    minRating: 3.5,                 // Minimum star rating
    requirePrime: true,             // Must be Prime eligible
    maxBSR: 100000,                 // Maximum Best Seller Rank
    minProfitPercent: 80,           // Minimum profit percentage
    maxProductsPerDay: 50,          // Daily discovery limit
    
    // Categories to exclude
    excludeCategories: [
      'Books',
      'Music',
      'Movies & TV',
      'Video Games',
      'Software',
      'Digital Music',
      'Kindle Store',
    ],
    
    // Brand/title words to exclude (IP concerns)
    excludeTitleWords: [
      // Major brands
      'Nike', 'Adidas', 'Apple', 'Samsung', 'Sony', 'Microsoft',
      'Disney', 'Marvel', 'Nintendo', 'Pokemon', 'Star Wars',
      'NFL', 'NBA', 'MLB', 'NHL', 'FIFA',
      'Louis Vuitton', 'Gucci', 'Prada', 'Chanel', 'Rolex',
      'Coca-Cola', 'Pepsi', 'McDonald',
      // Restricted categories
      'CBD', 'THC', 'Cannabis', 'Vape', 'E-cigarette',
      'Weapon', 'Gun', 'Ammunition', 'Knife', 'Firearm',
      // Other risky terms
      'Replica', 'Counterfeit', 'Knockoff', 'Fake',
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DEMAND THRESHOLDS (For Keepa Integration)
  // ─────────────────────────────────────────────────────────────────────────
  demand: {
    // BSR thresholds
    maxBSR: 150000,                 // Absolute maximum BSR to consider
    idealBSR: 50000,                // Ideal BSR for high-demand products
    
    // Volatility limits (percentage)
    maxVolatility: 50,              // Max BSR volatility percentage
    idealVolatility: 25,            // Ideal stable BSR volatility
    
    // Sales velocity
    minMonthlySales: 10,            // Minimum estimated monthly sales
    idealMonthlySales: 50,          // Ideal monthly sales
    
    // Demand tiers for prioritization
    tiers: {
      high: {
        maxBSR: 25000,
        minDemandScore: 70,
        refreshDays: 1,             // Check prices daily
      },
      medium: {
        maxBSR: 75000,
        minDemandScore: 50,
        refreshDays: 3,             // Check prices every 3 days
      },
      low: {
        maxBSR: 150000,
        minDemandScore: 30,
        refreshDays: 7,             // Check prices weekly
      },
    },
    
    // Demand score weights (must sum to 1.0)
    weights: {
      bsr: 0.40,                    // BSR importance
      bsrTrend: 0.25,               // BSR trend importance
      priceStability: 0.20,         // Price stability importance
      reviewVelocity: 0.15,         // Review velocity importance
    },
    
    // BSR to estimated monthly sales conversion
    salesEstimates: [
      { maxBSR: 1000, monthlySales: 500 },
      { maxBSR: 5000, monthlySales: 200 },
      { maxBSR: 10000, monthlySales: 100 },
      { maxBSR: 25000, monthlySales: 50 },
      { maxBSR: 50000, monthlySales: 25 },
      { maxBSR: 100000, monthlySales: 10 },
      { maxBSR: 200000, monthlySales: 5 },
      { maxBSR: Infinity, monthlySales: 1 },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // KEEPA API CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────
  keepa: {
    // Rate limiting (tokens per minute)
    tokensPerMinute: 60,            // Keepa rate limit
    batchSize: 100,                 // Max ASINs per batch request
    requestTimeoutMs: 30000,        // 30 second timeout
    maxRetries: 3,                  // Retry failed requests
    retryDelayMs: 5000,             // 5 second retry delay
    
    // Token costs
    tokenCosts: {
      product: 1,                   // Single product lookup
      productBatch: 1,              // Per product in batch
      deals: 10,                    // Deals endpoint
      bestSellers: 5,               // Best sellers endpoint
    },
    
    // History settings
    historyDays: 90,                // Days of price/BSR history to fetch
    
    // Domains
    domains: {
      US: 1,
      UK: 2,
      DE: 3,
      FR: 4,
      JP: 5,
      CA: 6,
      IT: 8,
      ES: 9,
      IN: 10,
      MX: 11,
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // COMPETITOR PRICE MULTIPLIERS (NA Bulk Price Editor)
  // ─────────────────────────────────────────────────────────────────────────
  competitors: {
    amazon: 1.85,                   // Amazon display = our price × 1.85
    costco: 1.82,                   // Costco display = our price × 1.82
    ebay: 1.90,                     // eBay display = our price × 1.90
    sams: 1.80,                     // Sam's Club = our price × 1.80
    walmart: 1.78,                  // Walmart = our price × 1.78
    target: 1.75,                   // Target = our price × 1.75
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PRICE SYNC SETTINGS
  // ─────────────────────────────────────────────────────────────────────────
  priceSync: {
    // Refresh intervals by price tier
    refreshTiers: {
      highValue: { minPrice: 20, refreshDays: 1 },
      mediumValue: { minPrice: 10, refreshDays: 3 },
      lowValue: { minPrice: 0, refreshDays: 7 },
    },
    
    // Stale data threshold
    staleDays: 14,
    
    // Margin alerts
    marginAlert: {
      warningThreshold: 30,
      criticalThreshold: 20,
      gracePeriodDays: 7,
    },
    
    // Stock alerts
    stockAlert: {
      autoPauseOutOfStock: true,
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DISCOVERY CATEGORIES (Rotating Daily)
  // ─────────────────────────────────────────────────────────────────────────
  discoveryCategories: {
    schedule: {
      0: ['beauty', 'skincare'],
      1: ['kitchen', 'home'],
      2: ['pet', 'garden'],
      3: ['health', 'fitness'],
      4: ['baby', 'toys'],
      5: ['office', 'electronics'],
      6: ['automotive', 'sports'],
    },
    
    categories: {
      beauty: {
        name: 'Beauty & Personal Care',
        amazonCategoryId: '3760911',
        markupMultiplier: 1.70,
        searchTerms: ['ice roller face', 'gua sha tool', 'jade roller', 'facial steamer', 'makeup organizer'],
      },
      skincare: {
        name: 'Skin Care',
        amazonCategoryId: '11060451',
        markupMultiplier: 1.70,
        searchTerms: ['pimple patches', 'face mask', 'sunscreen', 'moisturizer', 'serum'],
      },
      kitchen: {
        name: 'Kitchen & Dining',
        amazonCategoryId: '284507',
        markupMultiplier: 1.70,
        searchTerms: ['silicone spatula', 'measuring cups', 'food storage containers', 'kitchen timer'],
      },
      home: {
        name: 'Home & Kitchen',
        amazonCategoryId: '1055398',
        markupMultiplier: 1.70,
        searchTerms: ['drawer organizer', 'closet organizer', 'shower caddy', 'trash bags'],
      },
      pet: {
        name: 'Pet Supplies',
        amazonCategoryId: '2619533011',
        markupMultiplier: 1.70,
        searchTerms: ['dog toys', 'cat toys', 'pet brush', 'dog treats', 'pet bed'],
      },
      garden: {
        name: 'Patio, Lawn & Garden',
        amazonCategoryId: '2972638011',
        markupMultiplier: 1.70,
        searchTerms: ['plant pots', 'garden gloves', 'watering can', 'plant stakes'],
      },
      health: {
        name: 'Health & Household',
        amazonCategoryId: '3760901',
        markupMultiplier: 1.70,
        searchTerms: ['vitamins', 'first aid', 'pain relief', 'sleep aids'],
      },
      fitness: {
        name: 'Sports & Fitness',
        amazonCategoryId: '3375251',
        markupMultiplier: 1.70,
        searchTerms: ['resistance bands', 'yoga mat', 'foam roller', 'jump rope'],
      },
      baby: {
        name: 'Baby',
        amazonCategoryId: '165796011',
        markupMultiplier: 1.70,
        searchTerms: ['baby bottles', 'pacifiers', 'teething toys', 'baby wipes'],
      },
      toys: {
        name: 'Toys & Games',
        amazonCategoryId: '165793011',
        markupMultiplier: 1.70,
        searchTerms: ['puzzles', 'building blocks', 'action figures', 'board games'],
      },
      office: {
        name: 'Office Products',
        amazonCategoryId: '1064954',
        markupMultiplier: 1.70,
        searchTerms: ['sticky notes', 'desk organizer', 'pens', 'notebooks'],
      },
      electronics: {
        name: 'Electronics Accessories',
        amazonCategoryId: '172282',
        markupMultiplier: 1.70,
        searchTerms: ['phone stand', 'cable organizer', 'screen cleaner', 'phone case'],
      },
      automotive: {
        name: 'Automotive',
        amazonCategoryId: '15684181',
        markupMultiplier: 1.70,
        searchTerms: ['car phone mount', 'car charger', 'air freshener', 'car vacuum'],
      },
      sports: {
        name: 'Sports & Outdoors',
        amazonCategoryId: '3375251',
        markupMultiplier: 1.70,
        searchTerms: ['water bottle', 'sunglasses', 'camping gear', 'hiking accessories'],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // API COST TRACKING
  // ─────────────────────────────────────────────────────────────────────────
  apiCosts: {
    keepa: {
      tokenCostUsd: 0.001,
      dailyBudget: 10.00,
    },
    rainforest: {
      requestCostUsd: 0.015,
      dailyBudget: 5.00,
    },
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export type PricingRules = typeof PRICING_RULES;
export type DemandTier = 'high' | 'medium' | 'low' | 'reject';
export type DiscoveryCategory = keyof typeof PRICING_RULES.discoveryCategories.categories;

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function isValidASIN(asin: string | null | undefined): boolean {
  if (!asin) return false;
  return /^B[A-Z0-9]{9}$/.test(asin.toUpperCase());
}

export function containsExcludedBrand(title: string | null | undefined): boolean {
  if (!title) return false;
  const lowerTitle = title.toLowerCase();
  return PRICING_RULES.discovery.excludeTitleWords.some(
    word => lowerTitle.includes(word.toLowerCase())
  );
}

export function isExcludedCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  const lowerCategory = category.toLowerCase();
  return PRICING_RULES.discovery.excludeCategories.some(
    cat => lowerCategory.includes(cat.toLowerCase())
  );
}

export function meetsDiscoveryCriteria(product: {
  price?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  isPrime?: boolean;
  title?: string | null;
  category?: string | null;
  bsr?: number | null;
}): { meets: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const rules = PRICING_RULES.discovery;

  if (product.price !== undefined && product.price !== null) {
    if (product.price < rules.minPrice) {
      reasons.push(`Price $${product.price} below minimum $${rules.minPrice}`);
    }
    if (product.price > rules.maxPrice) {
      reasons.push(`Price $${product.price} above maximum $${rules.maxPrice}`);
    }
  }

  if (product.rating !== undefined && product.rating !== null) {
    if (product.rating < rules.minRating) {
      reasons.push(`Rating ${product.rating} below minimum ${rules.minRating}`);
    }
  }

  if (product.reviewCount !== undefined && product.reviewCount !== null) {
    if (product.reviewCount < rules.minReviews) {
      reasons.push(`Reviews ${product.reviewCount} below minimum ${rules.minReviews}`);
    }
  }

  if (rules.requirePrime && product.isPrime === false) {
    reasons.push('Not Prime eligible');
  }

  if (product.bsr !== undefined && product.bsr !== null) {
    if (product.bsr > rules.maxBSR) {
      reasons.push(`BSR ${product.bsr.toLocaleString()} above maximum ${rules.maxBSR.toLocaleString()}`);
    }
  }

  if (product.category && isExcludedCategory(product.category)) {
    reasons.push(`Category "${product.category}" is excluded`);
  }

  if (product.title && containsExcludedBrand(product.title)) {
    const excludedWord = PRICING_RULES.discovery.excludeTitleWords.find(
      word => product.title!.toLowerCase().includes(word.toLowerCase())
    );
    reasons.push(`Title contains excluded word: "${excludedWord}"`);
  }

  return { meets: reasons.length === 0, reasons };
}

export function meetsDemandCriteria(product: {
  bsr?: number | null;
  demandScore?: number | null;
}): { tier: DemandTier; meets: boolean; reason?: string } {
  const { tiers } = PRICING_RULES.demand;
  const bsr = product.bsr ?? Infinity;
  const score = product.demandScore ?? 0;

  if (bsr <= tiers.high.maxBSR && score >= tiers.high.minDemandScore) {
    return { tier: 'high', meets: true };
  }
  if (bsr <= tiers.medium.maxBSR && score >= tiers.medium.minDemandScore) {
    return { tier: 'medium', meets: true };
  }
  if (bsr <= tiers.low.maxBSR && score >= tiers.low.minDemandScore) {
    return { tier: 'low', meets: true };
  }
  
  return { 
    tier: 'reject', 
    meets: false,
    reason: `BSR ${bsr.toLocaleString()} or demand score ${score} below thresholds`,
  };
}

export function calculateDemandScore(data: {
  currentBSR: number | null;
  bsrHistory?: number[];
  priceHistory?: number[];
  reviewCount?: number;
  recentReviews?: number;
}): number {
  const { weights } = PRICING_RULES.demand;
  let score = 0;

  if (data.currentBSR !== null && data.currentBSR > 0) {
    const bsrScore = Math.max(0, 100 - (Math.log10(data.currentBSR) * 15));
    score += bsrScore * weights.bsr;
  }

  if (data.bsrHistory && data.bsrHistory.length >= 2) {
    const validHistory = data.bsrHistory.filter(b => b > 0);
    if (validHistory.length >= 2) {
      const recent = validHistory.slice(-Math.ceil(validHistory.length / 2));
      const older = validHistory.slice(0, Math.ceil(validHistory.length / 2));
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
      
      if (olderAvg > 0) {
        const improvement = (olderAvg - recentAvg) / olderAvg;
        const trendScore = 50 + (improvement * 100);
        score += Math.max(0, Math.min(100, trendScore)) * weights.bsrTrend;
      }
    }
  } else {
    score += 50 * weights.bsrTrend;
  }

  if (data.priceHistory && data.priceHistory.length >= 2) {
    const prices = data.priceHistory.filter(p => p > 0);
    if (prices.length >= 2) {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      const variance = prices.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / prices.length;
      const stdDev = Math.sqrt(variance);
      const cv = avg > 0 ? stdDev / avg : 0;
      const stabilityScore = Math.max(0, 100 - (cv * 200));
      score += stabilityScore * weights.priceStability;
    }
  } else {
    score += 50 * weights.priceStability;
  }

  if (data.recentReviews !== undefined && data.reviewCount !== undefined && data.reviewCount > 0) {
    const velocityRatio = data.recentReviews / data.reviewCount;
    const velocityScore = Math.min(100, velocityRatio * 1000);
    score += velocityScore * weights.reviewVelocity;
  } else {
    score += 50 * weights.reviewVelocity;
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}

export function estimateMonthlySales(bsr: number | null): number {
  if (bsr === null || bsr <= 0) return 0;
  const estimates = PRICING_RULES.demand.salesEstimates;
  const tier = estimates.find(e => bsr <= e.maxBSR);
  return tier?.monthlySales ?? 1;
}

export function getRefreshInterval(price: number): number {
  const { refreshTiers } = PRICING_RULES.priceSync;
  if (price >= refreshTiers.highValue.minPrice) return refreshTiers.highValue.refreshDays;
  if (price >= refreshTiers.mediumValue.minPrice) return refreshTiers.mediumValue.refreshDays;
  return refreshTiers.lowValue.refreshDays;
}

export function getRefreshIntervalByDemand(tier: DemandTier): number {
  const { tiers } = PRICING_RULES.demand;
  switch (tier) {
    case 'high': return tiers.high.refreshDays;
    case 'medium': return tiers.medium.refreshDays;
    case 'low': return tiers.low.refreshDays;
    default: return 7;
  }
}

export function getTodayDiscoveryCategories(): string[] {
  const dayOfWeek = new Date().getDay();
  const schedule = PRICING_RULES.discoveryCategories.schedule;
  return schedule[dayOfWeek as keyof typeof schedule] || ['beauty', 'kitchen'];
}

export function getCategoryConfig(categoryName: string) {
  const categories = PRICING_RULES.discoveryCategories.categories;
  return categories[categoryName as keyof typeof categories] || null;
}

export function calculateProcessingPriority(
  cost: number,
  price: number,
  priorityOrder: 'high-margin-first' | 'high-price-first' | 'as-uploaded' = 'high-margin-first'
): number {
  if (priorityOrder === 'as-uploaded') return 0;
  if (cost <= 0 || price <= 0) return 0;
  const margin = ((price - cost) / price) * 100;
  if (priorityOrder === 'high-margin-first') return Math.round(margin * price);
  return Math.round(price * 100);
}

export function calculateRetailPrice(amazonCost: number): number {
  const { markup, priceRange } = PRICING_RULES;
  let retailPrice = amazonCost * (1 + markup.percent / 100);
  if (retailPrice - amazonCost < markup.minimumProfit) {
    retailPrice = amazonCost + markup.minimumProfit;
  }
  retailPrice = Math.max(priceRange.min, Math.min(priceRange.max, retailPrice));
  return Math.round(retailPrice * 100) / 100;
}

export function calculateCompetitorPrices(retailPrice: number): Record<string, number> {
  const { competitors } = PRICING_RULES;
  return {
    amazon: Math.round(retailPrice * competitors.amazon * 100) / 100,
    costco: Math.round(retailPrice * competitors.costco * 100) / 100,
    ebay: Math.round(retailPrice * competitors.ebay * 100) / 100,
    sams: Math.round(retailPrice * competitors.sams * 100) / 100,
    walmart: Math.round(retailPrice * competitors.walmart * 100) / 100,
    target: Math.round(retailPrice * competitors.target * 100) / 100,
  };
}

export function meetsAllCriteria(product: {
  price?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  isPrime?: boolean;
  title?: string | null;
  category?: string | null;
  bsr?: number | null;
  demandScore?: number | null;
}): { passes: boolean; reasons: string[]; demandTier?: DemandTier } {
  const reasons: string[] = [];
  const discoveryResult = meetsDiscoveryCriteria(product);
  if (!discoveryResult.meets) reasons.push(...discoveryResult.reasons);
  const demandResult = meetsDemandCriteria(product);
  if (!demandResult.meets && demandResult.reason) reasons.push(demandResult.reason);
  return { passes: reasons.length === 0, reasons, demandTier: demandResult.tier };
}

export function validatePricingConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const weights = PRICING_RULES.demand.weights;
  const weightSum = weights.bsr + weights.bsrTrend + weights.priceStability + weights.reviewVelocity;
  if (Math.abs(weightSum - 1.0) > 0.001) {
    errors.push(`Demand weights sum to ${weightSum}, should be 1.0`);
  }
  const { tiers } = PRICING_RULES.demand;
  if (tiers.high.maxBSR >= tiers.medium.maxBSR) {
    errors.push('High tier maxBSR should be less than medium tier');
  }
  if (tiers.medium.maxBSR >= tiers.low.maxBSR) {
    errors.push('Medium tier maxBSR should be less than low tier');
  }
  if (PRICING_RULES.discovery.minPrice >= PRICING_RULES.discovery.maxPrice) {
    errors.push('Discovery minPrice should be less than maxPrice');
  }
  return { valid: errors.length === 0, errors };
}

export default PRICING_RULES;
