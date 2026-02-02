// lib/export/ebay-file-exchange.ts
// eBay File Exchange CSV export format generator
// Generates CSV files compatible with eBay Seller Hub bulk upload

import { type CleanedProduct } from '@/lib/content-cleaner';
import { mapCategory } from '@/lib/category-mapping';
import { applyEbayTemplate } from '@/lib/templates/ebay-listing';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface EbayExportOptions {
  defaultQuantity?: number;
  conditionId?: number; // 1000 = New
  format?: 'FixedPrice' | 'Auction';
  duration?: 'GTC' | '3' | '5' | '7' | '10' | '30';
  shippingProfile?: string;
  returnProfile?: string;
  paymentProfile?: string;
  applyTemplate?: boolean;
}

export interface EbayListingRow {
  Action: string;
  'Custom Label (SKU)': string;
  'Category ID': number;
  'Category Name': string;
  Title: string;
  Subtitle: string;
  Description: string;
  'Start Price': string;
  'Buy It Now Price': string;
  Quantity: number;
  'Condition ID': number;
  Format: string;
  Duration: string;
  'Item photo URL': string;
  'P:UPC': string;
  'P:EAN': string;
  'C:Brand': string;
  'C:Type': string;
  'C:Color': string;
  'C:MPN': string;
  'Shipping profile name': string;
  'Return profile name': string;
  'Payment profile name': string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_OPTIONS: EbayExportOptions = {
  defaultQuantity: 5,
  conditionId: 1000, // New
  format: 'FixedPrice',
  duration: 'GTC',
  shippingProfile: 'Even Better Buy',
  returnProfile: 'Even Better Buy',
  paymentProfile: 'Even Better Buy',
  applyTemplate: true,
};

// eBay File Exchange CSV headers
const EBAY_CSV_HEADERS = [
  'Action',
  'Custom Label (SKU)',
  'Category ID',
  'Category Name',
  'Title',
  'Subtitle',
  'Description',
  'Start Price',
  'Buy It Now Price',
  'Quantity',
  'Condition ID',
  'Format',
  'Duration',
  'Item photo URL',
  'P:UPC',
  'P:EAN',
  'C:Brand',
  'C:Type',
  'C:Color',
  'C:MPN',
  'Shipping profile name',
  'Return profile name',
  'Payment profile name',
];

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert a cleaned product to eBay listing row
 */
export function productToEbayRow(
  product: CleanedProduct,
  options: EbayExportOptions = {}
): EbayListingRow {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Map category
  const categoryMapping = mapCategory(product.category);
  
  // Generate description with template
  let description = product.descriptionHtml;
  if (opts.applyTemplate) {
    description = applyEbayTemplate({
      title: product.title,
      mainImage: product.mainImage,
      description: product.descriptionHtml,
      dimensions: product.dimensions,
    });
  }
  
  // Format images (pipe-separated for eBay)
  const imageUrls = product.images.slice(0, 12).join('|'); // eBay max 12 images
  
  // Extract UPC/EAN from barcode
  const barcode = product.barcode || '';
  const isUpc = barcode.length === 12;
  const isEan = barcode.length === 13;
  
  return {
    Action: 'Add',
    'Custom Label (SKU)': product.asin,
    'Category ID': categoryMapping.ebayId,
    'Category Name': categoryMapping.ebayName,
    Title: product.titleShort, // Max 80 chars for eBay
    Subtitle: '',
    Description: description,
    'Start Price': product.retailPrice.toFixed(2),
    'Buy It Now Price': product.retailPrice.toFixed(2),
    Quantity: opts.defaultQuantity!,
    'Condition ID': opts.conditionId!,
    Format: opts.format!,
    Duration: opts.duration!,
    'Item photo URL': imageUrls,
    'P:UPC': isUpc ? barcode : '',
    'P:EAN': isEan ? barcode : '',
    'C:Brand': product.brand,
    'C:Type': product.category,
    'C:Color': '', // Would need to extract from features
    'C:MPN': '', // Manufacturer Part Number if available
    'Shipping profile name': opts.shippingProfile!,
    'Return profile name': opts.returnProfile!,
    'Payment profile name': opts.paymentProfile!,
  };
}

/**
 * Escape CSV field value
 */
function escapeCsvField(value: string | number): string {
  const str = String(value);
  
  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

/**
 * Generate eBay File Exchange CSV from products
 */
export function generateEbayCsv(
  products: CleanedProduct[],
  options: EbayExportOptions = {}
): string {
  const rows: string[] = [];
  
  // Add header row
  rows.push(EBAY_CSV_HEADERS.join(','));
  
  // Add product rows
  for (const product of products) {
    const ebayRow = productToEbayRow(product, options);
    
    const values = EBAY_CSV_HEADERS.map(header => {
      const value = ebayRow[header as keyof EbayListingRow];
      return escapeCsvField(value ?? '');
    });
    
    rows.push(values.join(','));
  }
  
  return rows.join('\n');
}

/**
 * Generate eBay File Exchange CSV as Blob
 */
export function generateEbayCsvBlob(
  products: CleanedProduct[],
  options: EbayExportOptions = {}
): Blob {
  const csv = generateEbayCsv(products, options);
  return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
}

/**
 * Download eBay CSV file
 */
export function downloadEbayCsv(
  products: CleanedProduct[],
  filename: string = 'ebay-file-exchange.csv',
  options: EbayExportOptions = {}
): void {
  const blob = generateEbayCsvBlob(products, options);
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export interface EbayValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate product for eBay listing
 */
export function validateForEbay(product: CleanedProduct): EbayValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Required fields
  if (!product.asin) {
    errors.push('Missing ASIN (SKU)');
  }
  
  if (!product.titleShort || product.titleShort.length < 10) {
    errors.push('Title too short (min 10 characters)');
  }
  
  if (product.titleShort && product.titleShort.length > 80) {
    errors.push('Title too long (max 80 characters)');
  }
  
  if (!product.retailPrice || product.retailPrice <= 0) {
    errors.push('Invalid price');
  }
  
  // Warnings
  if (!product.mainImage) {
    warnings.push('No main image');
  }
  
  if (product.images.length < 2) {
    warnings.push('Only one image (recommend 3+ images)');
  }
  
  if (!product.barcode) {
    warnings.push('No UPC/EAN barcode');
  }
  
  if (!product.brand || product.brand === 'Unbranded') {
    warnings.push('No brand specified');
  }
  
  const categoryMapping = mapCategory(product.category);
  if (categoryMapping.confidence === 'low') {
    warnings.push('Category mapping has low confidence');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate all products for eBay export
 */
export function validateProductsForEbay(products: CleanedProduct[]): {
  validProducts: CleanedProduct[];
  invalidProducts: Array<{ product: CleanedProduct; validation: EbayValidationResult }>;
  totalValid: number;
  totalInvalid: number;
  totalWarnings: number;
} {
  const validProducts: CleanedProduct[] = [];
  const invalidProducts: Array<{ product: CleanedProduct; validation: EbayValidationResult }> = [];
  let totalWarnings = 0;
  
  for (const product of products) {
    const validation = validateForEbay(product);
    
    if (validation.valid) {
      validProducts.push(product);
      totalWarnings += validation.warnings.length;
    } else {
      invalidProducts.push({ product, validation });
    }
  }
  
  return {
    validProducts,
    invalidProducts,
    totalValid: validProducts.length,
    totalInvalid: invalidProducts.length,
    totalWarnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get eBay File Exchange CSV headers
 */
export function getEbayHeaders(): string[] {
  return [...EBAY_CSV_HEADERS];
}

/**
 * Get default export options
 */
export function getDefaultEbayOptions(): EbayExportOptions {
  return { ...DEFAULT_OPTIONS };
}

/**
 * Parse eBay category ID from string
 */
export function parseEbayCategoryId(categoryIdStr: string): number | null {
  const id = parseInt(categoryIdStr, 10);
  return isNaN(id) ? null : id;
}
