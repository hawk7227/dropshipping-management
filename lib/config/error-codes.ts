// lib/config/error-codes.ts
// Complete registry of all error codes with messages and suggestions
// This is the SINGLE SOURCE OF TRUTH for error definitions

import type { ErrorDefinition, ErrorSeverity } from '@/types/errors';

// ═══════════════════════════════════════════════════════════════════════════
// ERROR CODES REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

export const ERROR_CODES: Record<string, ErrorDefinition> = {
  // ═════════════════════════════════════════════════════════════════════════
  // DATABASE ERRORS (DB_XXX)
  // ═════════════════════════════════════════════════════════════════════════
  DB_001: {
    code: 'DB_001',
    message: 'Database connection failed',
    details: 'Could not connect to Supabase. The database server may be unreachable.',
    suggestion: 'Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables. Verify Supabase project is active.',
    severity: 'critical',
    blocking: true,
  },
  DB_002: {
    code: 'DB_002',
    message: 'Database query timeout',
    details: 'The database query took too long and was cancelled.',
    suggestion: 'Try filtering for fewer results or contact support if this persists.',
    severity: 'error',
    blocking: true,
  },
  DB_003: {
    code: 'DB_003',
    message: 'Database write failed',
    details: 'Could not save data to the database.',
    suggestion: 'Check for duplicate entries or invalid data formats.',
    severity: 'error',
    blocking: true,
  },
  DB_004: {
    code: 'DB_004',
    message: 'Database constraint violation',
    details: 'Data violates database rules (e.g., competitor prices below 80% minimum).',
    suggestion: 'Check pricing rules compliance or use admin override.',
    severity: 'error',
    blocking: true,
  },
  DB_005: {
    code: 'DB_005',
    message: 'Database schema mismatch',
    details: 'Code expects columns that do not exist in the database.',
    suggestion: 'Run database migrations to update schema.',
    severity: 'critical',
    blocking: true,
  },
  DB_006: {
    code: 'DB_006',
    message: 'Row level security blocked',
    details: 'Access denied by Supabase RLS policy.',
    suggestion: 'Check user permissions or use service role for admin operations.',
    severity: 'error',
    blocking: true,
  },

  // ═════════════════════════════════════════════════════════════════════════
  // CONFIGURATION ERRORS (CONFIG_XXX)
  // ═════════════════════════════════════════════════════════════════════════
  CONFIG_001: {
    code: 'CONFIG_001',
    message: 'Pricing rules not loaded',
    details: 'The pricing-rules.ts configuration file failed to load or contains invalid values.',
    suggestion: 'Verify lib/config/pricing-rules.ts exists and exports PRICING_RULES correctly.',
    severity: 'critical',
    blocking: true,
  },
  CONFIG_002: {
    code: 'CONFIG_002',
    message: 'Invalid multiplier values',
    details: 'Pricing multipliers are outside valid range (must be > 1.0).',
    suggestion: 'Check yourMarkup.multiplier and competitors.ranges values in pricing-rules.ts.',
    severity: 'critical',
    blocking: true,
  },
  CONFIG_003: {
    code: 'CONFIG_003',
    message: 'Invalid profit thresholds',
    details: 'Profit threshold configuration is invalid.',
    suggestion: 'Ensure profitThresholds values are between 0-100 in pricing-rules.ts.',
    severity: 'critical',
    blocking: true,
  },

  // ═════════════════════════════════════════════════════════════════════════
  // SHOPIFY ERRORS (SHOP_XXX)
  // ═════════════════════════════════════════════════════════════════════════
  SHOP_001: {
    code: 'SHOP_001',
    message: 'Shopify store not connected',
    details: 'SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN is missing.',
    suggestion: 'Add Shopify credentials in Settings > Integrations or environment variables.',
    severity: 'warning',
    blocking: false,
  },
  SHOP_002: {
    code: 'SHOP_002',
    message: 'Shopify API rate limited',
    details: 'Too many requests to Shopify. Exceeded 2 calls/second limit.',
    suggestion: 'Wait 60 seconds and retry. Use queue for bulk operations.',
    severity: 'warning',
    blocking: false,
  },
  SHOP_003: {
    code: 'SHOP_003',
    message: 'Shopify authentication failed',
    details: 'Access token rejected. May be expired or revoked.',
    suggestion: 'Generate new access token in Shopify Admin > Apps > Develop apps.',
    severity: 'error',
    blocking: true,
  },
  SHOP_004: {
    code: 'SHOP_004',
    message: 'Shopify sync partial failure',
    details: 'Some products failed to sync due to invalid data or API errors.',
    suggestion: 'Review failed products and fix data issues.',
    severity: 'warning',
    blocking: false,
  },
  SHOP_005: {
    code: 'SHOP_005',
    message: 'Shopify store not found',
    details: 'The store domain does not exist or is not accessible.',
    suggestion: 'Verify store domain format: mystore.myshopify.com',
    severity: 'error',
    blocking: true,
  },

  // ═════════════════════════════════════════════════════════════════════════
  // RAINFOREST/DISCOVERY ERRORS (DISC_XXX)
  // ═════════════════════════════════════════════════════════════════════════
  DISC_001: {
    code: 'DISC_001',
    message: 'Rainforest API not configured',
    details: 'RAINFOREST_API_KEY environment variable is not set.',
    suggestion: 'Add API key in Settings or system will use mock data for testing.',
    severity: 'warning',
    blocking: false,
  },
  DISC_002: {
    code: 'DISC_002',
    message: 'Rainforest API key invalid',
    details: 'API key was rejected as invalid or expired.',
    suggestion: 'Verify key at rainforestapi.com and update in Settings.',
    severity: 'error',
    blocking: true,
  },
  DISC_003: {
    code: 'DISC_003',
    message: 'Rainforest API quota exceeded',
    details: 'All API credits used for this billing period.',
    suggestion: 'Purchase more credits or wait for quota reset.',
    severity: 'error',
    blocking: true,
  },
  DISC_004: {
    code: 'DISC_004',
    message: 'Rainforest API temporarily unavailable',
    details: 'Rainforest servers returned an error.',
    suggestion: 'Wait and retry. Check status.rainforestapi.com for outages.',
    severity: 'warning',
    blocking: false,
  },

  // ═════════════════════════════════════════════════════════════════════════
  // KEEPA ERRORS (KEEPA_XXX)
  // ═════════════════════════════════════════════════════════════════════════
  KEEPA_001: {
    code: 'KEEPA_001',
    message: 'Keepa API not configured',
    details: 'KEEPA_API_KEY environment variable is not set.',
    suggestion: 'Add API key in Settings. Historical data features will be unavailable.',
    severity: 'warning',
    blocking: false,
  },
  KEEPA_002: {
    code: 'KEEPA_002',
    message: 'Keepa API key invalid',
    details: 'API key rejected. May be expired or incorrect.',
    suggestion: 'Verify key at keepa.com/#!api and update in Settings.',
    severity: 'error',
    blocking: true,
  },
  KEEPA_003: {
    code: 'KEEPA_003',
    message: 'Keepa token balance low',
    details: 'Insufficient tokens for this operation.',
    suggestion: 'Purchase more tokens at keepa.com or reduce product count.',
    severity: 'warning',
    blocking: false,
  },
  KEEPA_004: {
    code: 'KEEPA_004',
    message: 'Keepa API rate limited',
    details: 'Too many requests. Being throttled.',
    suggestion: 'Operation will continue at reduced speed.',
    severity: 'warning',
    blocking: false,
  },

  // ═════════════════════════════════════════════════════════════════════════
  // IMPORT ERRORS (IMPORT_XXX)
  // ═════════════════════════════════════════════════════════════════════════
  IMPORT_001: {
    code: 'IMPORT_001',
    message: 'File upload failed',
    details: 'Could not upload file to server.',
    suggestion: 'Check file size (max 50MB) and try again.',
    severity: 'error',
    blocking: true,
  },
  IMPORT_002: {
    code: 'IMPORT_002',
    message: 'File type not supported',
    details: 'Only CSV, JSON, XLSX, XLS, and TXT files are supported.',
    suggestion: 'Convert your file to a supported format.',
    severity: 'error',
    blocking: true,
  },
  IMPORT_003: {
    code: 'IMPORT_003',
    message: 'Failed to parse file',
    details: 'File format does not match parser expectations.',
    suggestion: 'Check file formatting. Download template for correct format.',
    severity: 'error',
    blocking: true,
  },
  IMPORT_004: {
    code: 'IMPORT_004',
    message: 'File too large',
    details: 'File exceeds 100,000 product limit.',
    suggestion: 'Split file into smaller batches.',
    severity: 'error',
    blocking: true,
  },
  IMPORT_005: {
    code: 'IMPORT_005',
    message: 'No valid products found',
    details: 'Parser found 0 valid product identifiers.',
    suggestion: 'Ensure file contains ASINs, SKUs, or Amazon URLs. Download template for format.',
    severity: 'error',
    blocking: true,
  },
  IMPORT_006: {
    code: 'IMPORT_006',
    message: 'Partial parse success',
    details: 'Some items were valid, others were skipped due to errors.',
    suggestion: 'Continue with valid items or download error report to fix invalid entries.',
    severity: 'warning',
    blocking: false,
  },
  IMPORT_010: {
    code: 'IMPORT_010',
    message: 'Failed to parse pasted text',
    details: 'Could not identify any product identifiers in the pasted text.',
    suggestion: 'Paste one ASIN, SKU, or Amazon URL per line.',
    severity: 'error',
    blocking: true,
  },
  IMPORT_011: {
    code: 'IMPORT_011',
    message: 'Too many items pasted',
    details: 'Pasted items exceed maximum for paste (10,000). Use file upload for larger lists.',
    suggestion: 'Use the file upload option for lists larger than 10,000 items.',
    severity: 'error',
    blocking: true,
  },
  IMPORT_012: {
    code: 'IMPORT_012',
    message: 'Invalid format detected',
    details: 'Items do not appear to be valid ASINs, SKUs, or Amazon URLs.',
    suggestion: 'ASINs should be 10 characters starting with "B". URLs should be amazon.com/dp/ASIN format.',
    severity: 'error',
    blocking: true,
  },
  IMPORT_020: {
    code: 'IMPORT_020',
    message: 'Failed to parse prompt',
    details: 'Could not understand the search criteria from your prompt.',
    suggestion: 'Try a clearer prompt like: "Find 1000 beauty products on Amazon priced $5-20 with 500+ reviews"',
    severity: 'error',
    blocking: true,
  },
  IMPORT_030: {
    code: 'IMPORT_030',
    message: 'No data points selected',
    details: 'You must select at least one data point to fetch.',
    suggestion: 'Check at least "Current Price" to proceed.',
    severity: 'error',
    blocking: true,
  },
  IMPORT_040: {
    code: 'IMPORT_040',
    message: 'Cost estimation failed',
    details: 'Could not calculate API costs. Using fallback estimates.',
    suggestion: 'Actual costs may vary. Proceed with caution or contact support.',
    severity: 'warning',
    blocking: false,
  },
  IMPORT_041: {
    code: 'IMPORT_041',
    message: 'Estimated cost exceeds limit',
    details: 'Estimated cost exceeds your configured limit.',
    suggestion: 'Reduce product count, select fewer data points, or increase cost limit in Settings.',
    severity: 'warning',
    blocking: false,
  },
  IMPORT_050: {
    code: 'IMPORT_050',
    message: 'Import job failed to start',
    details: 'Could not create import job in database.',
    suggestion: 'Check database connection and try again.',
    severity: 'error',
    blocking: true,
  },
  IMPORT_051: {
    code: 'IMPORT_051',
    message: 'Import job failed mid-process',
    details: 'Import stopped before completion.',
    suggestion: 'Partial results saved. You can retry failed items or start over.',
    severity: 'error',
    blocking: true,
  },
  IMPORT_052: {
    code: 'IMPORT_052',
    message: 'Import completed with errors',
    details: 'Import finished but some items failed.',
    suggestion: 'Download error report to see why items failed.',
    severity: 'warning',
    blocking: false,
  },
  IMPORT_053: {
    code: 'IMPORT_053',
    message: 'Background job lost',
    details: 'Lost connection to background import job. Job may still be running.',
    suggestion: 'Check import jobs list for status. Do not start duplicate imports.',
    severity: 'warning',
    blocking: false,
  },

  // ═════════════════════════════════════════════════════════════════════════
  // QUEUE ERRORS (QUEUE_XXX)
  // ═════════════════════════════════════════════════════════════════════════
  QUEUE_001: {
    code: 'QUEUE_001',
    message: 'Failed to load queue status',
    details: 'Could not query queue table.',
    suggestion: 'Check database connection. Queue may still be processing.',
    severity: 'warning',
    blocking: false,
  },
  QUEUE_002: {
    code: 'QUEUE_002',
    message: 'Queue processor not running',
    details: 'Background processor has not run recently.',
    suggestion: 'Check Vercel cron configuration or manually trigger.',
    severity: 'warning',
    blocking: false,
  },
  QUEUE_003: {
    code: 'QUEUE_003',
    message: 'Queue stuck',
    details: 'Items have been processing for over 30 minutes.',
    suggestion: 'Reset stuck items to retry.',
    severity: 'warning',
    blocking: false,
  },
  QUEUE_010: {
    code: 'QUEUE_010',
    message: 'Failed to add to queue',
    details: 'Could not add products to the push queue.',
    suggestion: 'Check if products already exist in queue. Duplicates are not allowed.',
    severity: 'error',
    blocking: true,
  },
  QUEUE_011: {
    code: 'QUEUE_011',
    message: 'Queue processing failed',
    details: 'Batch processing failed. Some items returned errors.',
    suggestion: 'View error details for each item. Common cause: Shopify API issues.',
    severity: 'error',
    blocking: false,
  },
  QUEUE_012: {
    code: 'QUEUE_012',
    message: 'Queue paused unexpectedly',
    details: 'Queue processing was paused due to repeated failures.',
    suggestion: 'Review recent errors, fix issues, and resume queue.',
    severity: 'warning',
    blocking: false,
  },
  QUEUE_013: {
    code: 'QUEUE_013',
    message: 'Shopify rate limit hit',
    details: 'Shopify API rate limit reached. Queue paused temporarily.',
    suggestion: 'Queue will auto-resume. No action needed unless urgent.',
    severity: 'warning',
    blocking: false,
  },

  // ═════════════════════════════════════════════════════════════════════════
  // SMS ERRORS (SMS_XXX)
  // ═════════════════════════════════════════════════════════════════════════
  SMS_001: {
    code: 'SMS_001',
    message: 'Twilio not configured',
    details: 'Twilio credentials not set in environment variables.',
    suggestion: 'Configure Twilio to enable SMS. Alerts will only appear in dashboard.',
    severity: 'info',
    blocking: false,
  },
  SMS_002: {
    code: 'SMS_002',
    message: 'Invalid phone number',
    details: 'Phone number not in valid E.164 format.',
    suggestion: 'Enter as +1XXXXXXXXXX with country code.',
    severity: 'error',
    blocking: true,
  },
  SMS_003: {
    code: 'SMS_003',
    message: 'Test SMS failed',
    details: 'Could not send test message.',
    suggestion: 'Verify Twilio credentials and phone number.',
    severity: 'error',
    blocking: false,
  },
  SMS_004: {
    code: 'SMS_004',
    message: 'SMS send failed',
    details: 'Alert SMS failed to send.',
    suggestion: 'Alert was logged to dashboard. Check Twilio account balance and verify phone number.',
    severity: 'warning',
    blocking: false,
  },

  // ═════════════════════════════════════════════════════════════════════════
  // AI SUGGESTION ERRORS (AI_XXX)
  // ═════════════════════════════════════════════════════════════════════════
  AI_001: {
    code: 'AI_001',
    message: 'AI Suggestions failed to load',
    details: 'Could not fetch suggestions from database.',
    suggestion: 'Widget will retry automatically.',
    severity: 'warning',
    blocking: false,
  },
  AI_002: {
    code: 'AI_002',
    message: 'Suggestion generation failed',
    details: 'Background job encountered an error.',
    suggestion: 'Suggestions may be outdated. System will retry.',
    severity: 'warning',
    blocking: false,
  },
  AI_003: {
    code: 'AI_003',
    message: 'Suggestion engine not initialized',
    details: 'Required data for generating suggestions is not available.',
    suggestion: 'Import products and wait for first analysis cycle (runs hourly).',
    severity: 'warning',
    blocking: false,
  },
  AI_010: {
    code: 'AI_010',
    message: 'Suggestion action failed',
    details: 'Could not execute the suggested action.',
    suggestion: 'Try the action manually from the relevant page.',
    severity: 'error',
    blocking: false,
  },
  AI_011: {
    code: 'AI_011',
    message: 'Refresh action failed',
    details: 'Attempted to refresh products but the operation failed.',
    suggestion: 'Go to Products page and try refreshing manually.',
    severity: 'error',
    blocking: false,
  },
  AI_012: {
    code: 'AI_012',
    message: 'Dismiss failed',
    details: 'Could not dismiss suggestion. It may reappear.',
    suggestion: 'Try dismissing again or the suggestion will auto-expire.',
    severity: 'warning',
    blocking: false,
  },

  // ═════════════════════════════════════════════════════════════════════════
  // PRICING CALCULATION ERRORS (PRICE_CALC_XXX)
  // ═════════════════════════════════════════════════════════════════════════
  PRICE_CALC_001: {
    code: 'PRICE_CALC_001',
    message: 'List price calculation failed',
    details: 'Cost price may be invalid (zero, negative, or non-numeric).',
    suggestion: 'Ensure cost price is a positive number.',
    severity: 'error',
    blocking: true,
  },
  PRICE_CALC_002: {
    code: 'PRICE_CALC_002',
    message: 'Competitor price calculation failed',
    details: 'List price may be invalid.',
    suggestion: 'Ensure list price is set before calculating competitors.',
    severity: 'error',
    blocking: true,
  },
  PRICE_CALC_003: {
    code: 'PRICE_CALC_003',
    message: 'Competitor minimum not met',
    details: 'Calculated price below 80% minimum. Auto-corrected.',
    suggestion: 'Check if this is expected behavior.',
    severity: 'warning',
    blocking: false,
  },
  PRICE_CALC_004: {
    code: 'PRICE_CALC_004',
    message: 'Profit calculation resulted in NaN',
    details: 'Profit calculation produced invalid result.',
    suggestion: 'Check for zero or negative values in pricing data.',
    severity: 'error',
    blocking: true,
  },
  PRICE_CALC_005: {
    code: 'PRICE_CALC_005',
    message: 'Admin override applied',
    details: 'Prices set by admin override. Normal validation bypassed.',
    suggestion: 'No action needed - this is informational.',
    severity: 'info',
    blocking: false,
  },

  // ═════════════════════════════════════════════════════════════════════════
  // PRICE INTELLIGENCE ERRORS (PRICE_XXX)
  // ═════════════════════════════════════════════════════════════════════════
  PRICE_000: {
    code: 'PRICE_000',
    message: 'No products in database',
    details: 'Price Intelligence requires products to analyze. Import products first.',
    suggestion: 'Go to Products page and import or sync products.',
    severity: 'warning',
    blocking: false,
  },
  PRICE_001: {
    code: 'PRICE_001',
    message: 'Failed to calculate profit metrics',
    details: 'Could not aggregate profit data across products.',
    suggestion: 'Some products may have missing price data. Run "Refresh Prices" to fix.',
    severity: 'error',
    blocking: false,
  },
  PRICE_002: {
    code: 'PRICE_002',
    message: 'Metrics showing stale data',
    details: 'Metrics were last calculated some time ago. Real-time calculation failed.',
    suggestion: 'Click refresh to update metrics. Check database connection if issue persists.',
    severity: 'warning',
    blocking: false,
  },

  // ═════════════════════════════════════════════════════════════════════════
  // PRODUCT ERRORS (PROD_XXX)
  // ═════════════════════════════════════════════════════════════════════════
  PROD_001: {
    code: 'PROD_001',
    message: 'Failed to load products',
    details: 'Could not fetch products from database.',
    suggestion: 'Check your internet connection and try again.',
    severity: 'error',
    blocking: true,
  },
  PROD_002: {
    code: 'PROD_002',
    message: 'Failed to save product',
    details: 'Could not save product changes to database.',
    suggestion: 'Check for validation errors and try again.',
    severity: 'error',
    blocking: true,
  },
  PROD_003: {
    code: 'PROD_003',
    message: 'Failed to delete product',
    details: 'Could not remove product from database.',
    suggestion: 'Product may be in use elsewhere. Check Shopify queue.',
    severity: 'error',
    blocking: true,
  },
  PROD_004: {
    code: 'PROD_004',
    message: 'Product not found',
    details: 'The requested product does not exist.',
    suggestion: 'Product may have been deleted. Refresh the page.',
    severity: 'error',
    blocking: true,
  },

  // ═════════════════════════════════════════════════════════════════════════
  // VALIDATION ERRORS (VALID_XXX)
  // ═════════════════════════════════════════════════════════════════════════
  VALID_001: {
    code: 'VALID_001',
    message: 'Required field missing',
    details: 'A required field was not provided.',
    suggestion: 'Fill in all required fields.',
    severity: 'error',
    blocking: true,
  },
  VALID_002: {
    code: 'VALID_002',
    message: 'Invalid data type',
    details: 'Field received wrong data type.',
    suggestion: 'Check input format.',
    severity: 'error',
    blocking: true,
  },
  VALID_003: {
    code: 'VALID_003',
    message: 'Value out of range',
    details: 'Value outside allowed range.',
    suggestion: 'Adjust to be within range.',
    severity: 'error',
    blocking: true,
  },
  VALID_004: {
    code: 'VALID_004',
    message: 'Pricing rules violated',
    details: 'Product pricing does not meet business rules.',
    suggestion: 'Adjust prices or use admin override.',
    severity: 'error',
    blocking: true,
  },
  VALID_005: {
    code: 'VALID_005',
    message: 'Duplicate detected',
    details: 'A product with this identifier already exists.',
    suggestion: 'Update existing product or remove duplicate.',
    severity: 'warning',
    blocking: false,
  },

  // ═════════════════════════════════════════════════════════════════════════
  // CRON ERRORS (CRON_XXX)
  // ═════════════════════════════════════════════════════════════════════════
  CRON_001: {
    code: 'CRON_001',
    message: 'Cron job failed: price-refresh',
    details: 'Scheduled price refresh encountered an error.',
    suggestion: 'Check API keys and database. Job will retry next run.',
    severity: 'error',
    blocking: false,
  },
  CRON_002: {
    code: 'CRON_002',
    message: 'Cron job failed: process-queue',
    details: 'Queue processor failed. Items may be stuck.',
    suggestion: 'Manually trigger or wait for next run.',
    severity: 'error',
    blocking: false,
  },
  CRON_003: {
    code: 'CRON_003',
    message: 'Cron job failed: lifecycle-check',
    details: 'Product lifecycle check failed. Auto-pause may not have run.',
    suggestion: 'Manually review products below threshold. Check database connection.',
    severity: 'error',
    blocking: false,
  },
  CRON_004: {
    code: 'CRON_004',
    message: 'Cron job failed: generate-suggestions',
    details: 'AI suggestion generation failed. Suggestions may be outdated.',
    suggestion: 'Suggestions will regenerate on next successful run. No action needed.',
    severity: 'warning',
    blocking: false,
  },
  CRON_005: {
    code: 'CRON_005',
    message: 'Cron not running',
    details: 'No cron job executed recently.',
    suggestion: 'Check Vercel cron config and deployment status.',
    severity: 'warning',
    blocking: false,
  },

  // ═════════════════════════════════════════════════════════════════════════
  // REACT/UI ERRORS (REACT_XXX)
  // ═════════════════════════════════════════════════════════════════════════
  REACT_001: {
    code: 'REACT_001',
    message: 'Component rendering failed',
    details: 'A React component encountered an error during rendering.',
    suggestion: 'Try reloading the page. If the issue persists, contact support.',
    severity: 'error',
    blocking: true,
  },

  // ═════════════════════════════════════════════════════════════════════════
  // UNKNOWN/FALLBACK ERROR
  // ═════════════════════════════════════════════════════════════════════════
  UNKNOWN: {
    code: 'UNKNOWN',
    message: 'An unknown error occurred',
    details: 'An unexpected error happened that we could not identify.',
    suggestion: 'Try again. If the issue persists, contact support.',
    severity: 'error',
    blocking: true,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get error definition by code
 */
export function getErrorDefinition(code: string): ErrorDefinition {
  return ERROR_CODES[code] || ERROR_CODES.UNKNOWN;
}

/**
 * Create error response object for API responses
 */
export function createErrorResponse(
  code: string, 
  additionalDetails?: string
): ErrorDefinition & { details: string } {
  const def = getErrorDefinition(code);
  return {
    ...def,
    details: additionalDetails 
      ? `${def.details} ${additionalDetails}` 
      : def.details,
  };
}

/**
 * Check if an error code exists
 */
export function isValidErrorCode(code: string): boolean {
  return code in ERROR_CODES;
}

/**
 * Get all error codes for a category (e.g., 'DB' returns DB_001, DB_002, etc.)
 */
export function getErrorCodesForCategory(prefix: string): ErrorDefinition[] {
  return Object.values(ERROR_CODES).filter(e => e.code.startsWith(prefix));
}

/**
 * Get all blocking errors
 */
export function getBlockingErrors(): ErrorDefinition[] {
  return Object.values(ERROR_CODES).filter(e => e.blocking);
}

/**
 * Get all errors by severity
 */
export function getErrorsBySeverity(severity: ErrorSeverity): ErrorDefinition[] {
  return Object.values(ERROR_CODES).filter(e => e.severity === severity);
}
