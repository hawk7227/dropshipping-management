// lib/utils/duplicate-detector.ts
// Utility for detecting duplicate products by various identifiers
// Checks ASIN, SKU, title similarity, and Shopify product ID

import type { Product, ProductCreateInput } from '@/types';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type DuplicateIdentifierType = 
  | 'asin' 
  | 'source_product_id' 
  | 'shopify_product_id' 
  | 'title' 
  | 'handle';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateType?: DuplicateIdentifierType;
  existingProduct?: Product;
  similarity?: number; // For title matches, 0-1 score
  message?: string;
}

export interface BulkDuplicateResult {
  totalChecked: number;
  duplicatesFound: number;
  uniqueProducts: number;
  duplicates: Array<{
    index: number;
    product: ProductCreateInput;
    existingProduct?: Product;
    duplicateType: DuplicateIdentifierType;
    similarity?: number;
  }>;
  unique: Array<{
    index: number;
    product: ProductCreateInput;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// ASIN UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract ASIN from Amazon URL or validate ASIN format
 */
export function extractAsin(input: string): string | null {
  // If it's already an ASIN (10 characters, starts with B)
  if (/^B[A-Z0-9]{9}$/i.test(input)) {
    return input.toUpperCase();
  }

  // Extract from Amazon URL patterns
  const patterns = [
    /amazon\.com\/dp\/([A-Z0-9]{10})/i,
    /amazon\.com\/gp\/product\/([A-Z0-9]{10})/i,
    /amazon\.com\/.*\/dp\/([A-Z0-9]{10})/i,
    /amzn\.to\/[a-zA-Z0-9]+/i, // Short URLs need API lookup
    /\/dp\/([A-Z0-9]{10})/i,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
  }

  return null;
}

/**
 * Validate ASIN format
 */
export function isValidAsin(asin: string): boolean {
  return /^B[A-Z0-9]{9}$/i.test(asin);
}

// ═══════════════════════════════════════════════════════════════════════════
// TITLE SIMILARITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate title similarity (0-1, where 1 is identical)
 */
export function calculateTitleSimilarity(title1: string, title2: string): number {
  const s1 = normalizeTitle(title1);
  const s2 = normalizeTitle(title2);

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  
  return 1 - distance / maxLength;
}

/**
 * Normalize title for comparison
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();
}

/**
 * Check if titles are similar enough to be duplicates
 */
export function areTitlesSimilar(
  title1: string, 
  title2: string, 
  threshold: number = 0.85
): boolean {
  return calculateTitleSimilarity(title1, title2) >= threshold;
}

// ═══════════════════════════════════════════════════════════════════════════
// DUPLICATE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a product is a duplicate against existing products
 */
export function checkDuplicate(
  newProduct: ProductCreateInput,
  existingProducts: Product[],
  options: {
    checkTitle?: boolean;
    titleThreshold?: number;
  } = {}
): DuplicateCheckResult {
  const { checkTitle = false, titleThreshold = 0.85 } = options;

  // Check by source_product_id (ASIN)
  if (newProduct.source_product_id) {
    const byAsin = existingProducts.find(
      p => p.source_product_id?.toUpperCase() === newProduct.source_product_id?.toUpperCase()
    );
    if (byAsin) {
      return {
        isDuplicate: true,
        duplicateType: 'source_product_id',
        existingProduct: byAsin,
        message: `Product with ASIN ${newProduct.source_product_id} already exists`,
      };
    }
  }

  // Check by source URL (extract ASIN)
  if (newProduct.source_url) {
    const asin = extractAsin(newProduct.source_url);
    if (asin) {
      const byUrlAsin = existingProducts.find(
        p => p.source_product_id?.toUpperCase() === asin
      );
      if (byUrlAsin) {
        return {
          isDuplicate: true,
          duplicateType: 'source_product_id',
          existingProduct: byUrlAsin,
          message: `Product with ASIN ${asin} (from URL) already exists`,
        };
      }
    }
  }

  // Check by title similarity (optional, can be slow for large lists)
  if (checkTitle && newProduct.title) {
    for (const existing of existingProducts) {
      const similarity = calculateTitleSimilarity(newProduct.title, existing.title);
      if (similarity >= titleThreshold) {
        return {
          isDuplicate: true,
          duplicateType: 'title',
          existingProduct: existing,
          similarity,
          message: `Product title "${newProduct.title}" is ${(similarity * 100).toFixed(0)}% similar to existing "${existing.title}"`,
        };
      }
    }
  }

  return { isDuplicate: false };
}

/**
 * Check for duplicates within a list of new products
 */
export function findInternalDuplicates(
  products: ProductCreateInput[]
): Map<number, number[]> {
  const duplicateGroups = new Map<number, number[]>();
  const seenAsins = new Map<string, number>();

  products.forEach((product, index) => {
    // Check ASIN
    if (product.source_product_id) {
      const asin = product.source_product_id.toUpperCase();
      if (seenAsins.has(asin)) {
        const originalIndex = seenAsins.get(asin)!;
        if (!duplicateGroups.has(originalIndex)) {
          duplicateGroups.set(originalIndex, []);
        }
        duplicateGroups.get(originalIndex)!.push(index);
      } else {
        seenAsins.set(asin, index);
      }
    }

    // Check URL for ASIN
    if (product.source_url) {
      const asin = extractAsin(product.source_url);
      if (asin) {
        if (seenAsins.has(asin)) {
          const originalIndex = seenAsins.get(asin)!;
          if (originalIndex !== index) {
            if (!duplicateGroups.has(originalIndex)) {
              duplicateGroups.set(originalIndex, []);
            }
            duplicateGroups.get(originalIndex)!.push(index);
          }
        } else {
          seenAsins.set(asin, index);
        }
      }
    }
  });

  return duplicateGroups;
}

/**
 * Check multiple products for duplicates against existing products
 */
export function checkBulkDuplicates(
  newProducts: ProductCreateInput[],
  existingProducts: Product[],
  options: {
    checkTitle?: boolean;
    titleThreshold?: number;
    checkInternalDuplicates?: boolean;
  } = {}
): BulkDuplicateResult {
  const { 
    checkTitle = false, 
    titleThreshold = 0.85,
    checkInternalDuplicates = true 
  } = options;

  const duplicates: BulkDuplicateResult['duplicates'] = [];
  const unique: BulkDuplicateResult['unique'] = [];

  // First, check internal duplicates within the new products
  const internalDuplicates = checkInternalDuplicates 
    ? findInternalDuplicates(newProducts) 
    : new Map<number, number[]>();

  // Flatten internal duplicates to a set of indices to skip
  const internalDuplicateIndices = new Set<number>();
  internalDuplicates.forEach(indices => {
    indices.forEach(i => internalDuplicateIndices.add(i));
  });

  // Check each product against existing
  newProducts.forEach((product, index) => {
    // Skip if it's an internal duplicate
    if (internalDuplicateIndices.has(index)) {
      duplicates.push({
        index,
        product,
        duplicateType: 'source_product_id',
        similarity: 1,
      });
      return;
    }

    const result = checkDuplicate(product, existingProducts, { 
      checkTitle, 
      titleThreshold 
    });

    if (result.isDuplicate) {
      duplicates.push({
        index,
        product,
        existingProduct: result.existingProduct,
        duplicateType: result.duplicateType!,
        similarity: result.similarity,
      });
    } else {
      unique.push({ index, product });
    }
  });

  return {
    totalChecked: newProducts.length,
    duplicatesFound: duplicates.length,
    uniqueProducts: unique.length,
    duplicates,
    unique,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a unique handle from title
 */
export function generateHandle(title: string, existingHandles: string[] = []): string {
  let handle = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50)
    .replace(/-$/, '');

  // Ensure uniqueness
  if (existingHandles.includes(handle)) {
    let counter = 1;
    while (existingHandles.includes(`${handle}-${counter}`)) {
      counter++;
    }
    handle = `${handle}-${counter}`;
  }

  return handle;
}

/**
 * Deduplicate a list of products (keep first occurrence)
 */
export function deduplicateProducts(
  products: ProductCreateInput[]
): ProductCreateInput[] {
  const seen = new Set<string>();
  const unique: ProductCreateInput[] = [];

  for (const product of products) {
    // Create a unique key
    const key = product.source_product_id?.toUpperCase() || 
                (product.source_url && extractAsin(product.source_url)) ||
                normalizeTitle(product.title);

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(product);
    }
  }

  return unique;
}
