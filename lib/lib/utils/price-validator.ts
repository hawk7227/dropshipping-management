// lib/utils/price-validator.ts
// Product validation functions for enforcing pricing rules
// Layer 3 of the 4-layer rule enforcement system

import type { 
  Product, 
  ProductCreateInput, 
  CompetitorPrices,
  ValidationResult,
  ValidationError 
} from '@/types';
import { PRICING_RULES, COMPETITOR_NAMES, type CompetitorKey } from '@/lib/config/pricing-rules';
import { 
  getMinimumCompetitorPrice, 
  meetsProfitThreshold,
  roundToTwoDecimals 
} from './pricing-calculator';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate a product before save
 * Returns all validation errors and warnings
 */
export function validateProduct(
  product: ProductCreateInput | Partial<Product>,
  options: { adminOverride?: boolean } = {}
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Skip validation for admin override
  if (options.adminOverride) {
    warnings.push({
      field: 'admin_override',
      code: 'PRICE_CALC_005',
      message: 'Admin override applied - validation bypassed',
    });
    return { valid: true, errors: [], warnings };
  }

  // Required field validation
  if (!product.title || product.title.trim() === '') {
    errors.push({
      field: 'title',
      code: 'VALID_001',
      message: 'Title is required',
    });
  }

  // Cost price validation
  if (product.cost_price === undefined || product.cost_price === null) {
    errors.push({
      field: 'cost_price',
      code: 'VALID_001',
      message: 'Cost price is required',
    });
  } else if (typeof product.cost_price !== 'number') {
    errors.push({
      field: 'cost_price',
      code: 'VALID_002',
      message: 'Cost price must be a number',
    });
  } else if (product.cost_price <= 0) {
    errors.push({
      field: 'cost_price',
      code: 'VALID_003',
      message: 'Cost price must be greater than 0',
    });
  }

  // If we have a valid cost price, validate related pricing
  if (product.cost_price && product.cost_price > 0) {
    // Validate retail price if provided
    if (product.retail_price !== undefined && product.retail_price !== null) {
      const expectedMinRetail = roundToTwoDecimals(
        product.cost_price * PRICING_RULES.yourMarkup.multiplier
      );
      
      if (product.retail_price < product.cost_price) {
        errors.push({
          field: 'retail_price',
          code: 'VALID_003',
          message: `Retail price ($${product.retail_price}) must be greater than cost price ($${product.cost_price})`,
        });
      } else if (product.retail_price < expectedMinRetail * 0.9) {
        // Allow 10% variance but warn
        warnings.push({
          field: 'retail_price',
          code: 'VALID_004',
          message: `Retail price ($${product.retail_price}) is below expected ($${expectedMinRetail})`,
        });
      }

      // Validate profit margin
      const profitPercent = ((product.retail_price - product.cost_price) / product.cost_price) * 100;
      if (!meetsProfitThreshold(profitPercent)) {
        warnings.push({
          field: 'profit_percent',
          code: 'VALID_004',
          message: `Profit margin (${profitPercent.toFixed(1)}%) is below minimum threshold (${PRICING_RULES.profitThresholds.minimum}%)`,
        });
      }
    }
  }

  // Rating validation
  if (product.rating !== undefined && product.rating !== null) {
    if (product.rating < 0 || product.rating > 5) {
      errors.push({
        field: 'rating',
        code: 'VALID_003',
        message: 'Rating must be between 0 and 5',
      });
    }
  }

  // Review count validation
  if (product.review_count !== undefined && product.review_count !== null) {
    if (product.review_count < 0) {
      errors.push({
        field: 'review_count',
        code: 'VALID_003',
        message: 'Review count cannot be negative',
      });
    }
  }

  // Inventory validation
  if (product.inventory_quantity !== undefined && product.inventory_quantity !== null) {
    if (product.inventory_quantity < 0) {
      errors.push({
        field: 'inventory_quantity',
        code: 'VALID_003',
        message: 'Inventory quantity cannot be negative',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPETITOR PRICE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate competitor prices meet 80% minimum requirement
 */
export function validateCompetitorPrices(
  listPrice: number,
  competitors: CompetitorPrices | Partial<CompetitorPrices>
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!listPrice || listPrice <= 0) {
    errors.push({
      field: 'retail_price',
      code: 'VALID_001',
      message: 'List price is required for competitor validation',
    });
    return { valid: false, errors, warnings };
  }

  const minimumPrice = getMinimumCompetitorPrice(listPrice);
  const competitorKeys: CompetitorKey[] = ['amazon', 'costco', 'ebay', 'sams'];

  for (const key of competitorKeys) {
    const price = competitors[key];
    if (price !== undefined && price !== null) {
      if (price < minimumPrice) {
        errors.push({
          field: `${key}_display_price`,
          code: 'VALID_004',
          message: `${COMPETITOR_NAMES[key]} price ($${price}) is below minimum ($${minimumPrice}) - must be 80%+ higher than list price ($${listPrice})`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a single competitor price
 */
export function validateSingleCompetitorPrice(
  listPrice: number,
  competitorPrice: number,
  competitorName: string
): { valid: boolean; correctedPrice?: number; warning?: string } {
  const minimumPrice = getMinimumCompetitorPrice(listPrice);

  if (competitorPrice < minimumPrice) {
    return {
      valid: false,
      correctedPrice: minimumPrice,
      warning: `${competitorName} price auto-corrected from $${competitorPrice.toFixed(2)} to minimum $${minimumPrice.toFixed(2)}`,
    };
  }

  return { valid: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROFIT MARGIN VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate profit margin meets threshold
 */
export function validateProfitMargin(
  cost: number, 
  listPrice: number
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (cost <= 0) {
    errors.push({
      field: 'cost_price',
      code: 'VALID_003',
      message: 'Cost price must be greater than 0',
    });
    return { valid: false, errors, warnings };
  }

  if (listPrice <= 0) {
    errors.push({
      field: 'retail_price',
      code: 'VALID_003',
      message: 'List price must be greater than 0',
    });
    return { valid: false, errors, warnings };
  }

  if (listPrice <= cost) {
    errors.push({
      field: 'retail_price',
      code: 'VALID_003',
      message: `List price ($${listPrice}) must be greater than cost ($${cost})`,
    });
    return { valid: false, errors, warnings };
  }

  const profitPercent = ((listPrice - cost) / cost) * 100;

  if (!meetsProfitThreshold(profitPercent)) {
    warnings.push({
      field: 'profit_percent',
      code: 'VALID_004',
      message: `Profit margin ${profitPercent.toFixed(1)}% is below minimum threshold ${PRICING_RULES.profitThresholds.minimum}%`,
    });
    // This is a warning, not an error - product can still be saved
  }

  return {
    valid: true, // Profit warnings don't block save
    errors,
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FULL PRODUCT PRICING VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate all pricing aspects of a product
 */
export function validateProductPricing(product: Partial<Product>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Validate cost price exists
  if (!product.cost_price || product.cost_price <= 0) {
    errors.push({
      field: 'cost_price',
      code: 'VALID_001',
      message: 'Valid cost price is required',
    });
    return { valid: false, errors, warnings };
  }

  // Validate retail price exists
  if (!product.retail_price || product.retail_price <= 0) {
    errors.push({
      field: 'retail_price',
      code: 'VALID_001',
      message: 'Valid retail price is required',
    });
    return { valid: false, errors, warnings };
  }

  // Validate profit margin
  const profitResult = validateProfitMargin(product.cost_price, product.retail_price);
  errors.push(...profitResult.errors);
  warnings.push(...profitResult.warnings);

  // Validate competitor prices if any are set
  const competitors: Partial<CompetitorPrices> = {};
  if (product.amazon_display_price) competitors.amazon = product.amazon_display_price;
  if (product.costco_display_price) competitors.costco = product.costco_display_price;
  if (product.ebay_display_price) competitors.ebay = product.ebay_display_price;
  if (product.sams_display_price) competitors.sams = product.sams_display_price;

  if (Object.keys(competitors).length > 0) {
    const competitorResult = validateCompetitorPrices(product.retail_price, competitors);
    errors.push(...competitorResult.errors);
    warnings.push(...competitorResult.warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN OVERRIDE CHECK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if admin override is allowed
 * Currently always true if admin flag is set, but could be expanded
 * to check user roles from a database
 */
export function canAdminOverride(options: { isAdmin?: boolean } = {}): boolean {
  if (!PRICING_RULES.admin.canOverrideRules) {
    return false;
  }
  return options.isAdmin === true;
}

// ═══════════════════════════════════════════════════════════════════════════
// BULK VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export interface BulkValidationResult {
  totalProducts: number;
  validProducts: number;
  invalidProducts: number;
  productsWithWarnings: number;
  results: Array<{
    index: number;
    product: ProductCreateInput | Partial<Product>;
    validation: ValidationResult;
  }>;
}

/**
 * Validate multiple products at once
 */
export function validateProducts(
  products: Array<ProductCreateInput | Partial<Product>>,
  options: { adminOverride?: boolean } = {}
): BulkValidationResult {
  const results = products.map((product, index) => ({
    index,
    product,
    validation: validateProduct(product, options),
  }));

  return {
    totalProducts: products.length,
    validProducts: results.filter(r => r.validation.valid).length,
    invalidProducts: results.filter(r => !r.validation.valid).length,
    productsWithWarnings: results.filter(r => r.validation.warnings.length > 0).length,
    results,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DISCOVERY CRITERIA VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate if a product meets discovery criteria from config
 */
export function validateDiscoveryCriteria(product: {
  price?: number | null;
  rating?: number | null;
  reviews?: number | null;
  isPrime?: boolean;
  title?: string;
}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const { discovery } = PRICING_RULES;

  // Price validation
  if (product.price === null || product.price === undefined) {
    errors.push({
      field: 'price',
      code: 'VALID_001',
      message: 'Price is required for discovery',
    });
  } else {
    if (product.price < discovery.minAmazonPrice) {
      errors.push({
        field: 'price',
        code: 'VALID_003',
        message: `Price $${product.price} is below minimum $${discovery.minAmazonPrice}`,
      });
    }
    if (product.price > discovery.maxAmazonPrice) {
      errors.push({
        field: 'price',
        code: 'VALID_003',
        message: `Price $${product.price} exceeds maximum $${discovery.maxAmazonPrice}`,
      });
    }
  }

  // Reviews validation
  if (product.reviews !== undefined && product.reviews !== null) {
    if (product.reviews < discovery.minReviews) {
      warnings.push({
        field: 'reviews',
        code: 'VALID_003',
        message: `Reviews (${product.reviews}) below minimum (${discovery.minReviews})`,
      });
    }
  }

  // Rating validation
  if (product.rating !== undefined && product.rating !== null) {
    if (product.rating < discovery.minRating) {
      warnings.push({
        field: 'rating',
        code: 'VALID_003',
        message: `Rating (${product.rating}) below minimum (${discovery.minRating})`,
      });
    }
  }

  // Prime validation
  if (discovery.requirePrime && !product.isPrime) {
    warnings.push({
      field: 'isPrime',
      code: 'VALID_004',
      message: 'Product is not Prime eligible',
    });
  }

  // Brand word check
  if (product.title) {
    const lowerTitle = product.title.toLowerCase();
    const foundBrand = discovery.excludeTitleWords.find(word => 
      lowerTitle.includes(word.toLowerCase())
    );
    if (foundBrand) {
      errors.push({
        field: 'title',
        code: 'VALID_004',
        message: `Title contains excluded brand word: "${foundBrand}"`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
