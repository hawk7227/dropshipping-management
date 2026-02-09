// lib/utils/api-error-handler.ts
// Standardized API error response handling utility
// Converts any error into standardized ApiResponse format

import { NextResponse } from 'next/server';
import { 
  type ApiError, 
  type ApiResponse, 
  type ErrorSeverity,
  AppError,
  ValidationError,
  isAppError,
  isValidationError,
} from '@/types/errors';
import { getErrorDefinition, ERROR_CODES } from '@/lib/config/error-codes';

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST ID GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a unique request ID for tracking
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Maps HTTP status codes to error codes
 */
function getErrorCodeFromStatus(status: number): string {
  const statusMap: Record<number, string> = {
    400: 'VALID_001',
    401: 'DB_006',
    403: 'DB_006',
    404: 'PROD_004',
    408: 'DB_002',
    429: 'SHOP_002',
    500: 'DB_001',
    502: 'DB_001',
    503: 'DB_001',
    504: 'DB_002',
  };
  return statusMap[status] || 'UNKNOWN';
}

/**
 * Determines error code from error message patterns
 */
function getErrorCodeFromMessage(message: string): string {
  const lowerMessage = message.toLowerCase();
  
  // Database errors
  if (lowerMessage.includes('connection') && lowerMessage.includes('database')) {
    return 'DB_001';
  }
  if (lowerMessage.includes('timeout')) {
    return 'DB_002';
  }
  if (lowerMessage.includes('constraint')) {
    return 'DB_004';
  }
  if (lowerMessage.includes('column') || lowerMessage.includes('relation')) {
    return 'DB_005';
  }
  if (lowerMessage.includes('permission') || lowerMessage.includes('rls')) {
    return 'DB_006';
  }
  
  // Shopify errors
  if (lowerMessage.includes('shopify') && lowerMessage.includes('rate')) {
    return 'SHOP_002';
  }
  if (lowerMessage.includes('shopify') && lowerMessage.includes('auth')) {
    return 'SHOP_003';
  }
  
  // API errors
  if (lowerMessage.includes('rainforest')) {
    return 'DISC_004';
  }
  if (lowerMessage.includes('keepa')) {
    return 'KEEPA_004';
  }
  
  // Import errors
  if (lowerMessage.includes('parse')) {
    return 'IMPORT_003';
  }
  
  return 'UNKNOWN';
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ERROR HANDLER
// ═══════════════════════════════════════════════════════════════════════════

interface HandleApiErrorOptions {
  context?: string;
  requestId?: string;
  defaultCode?: string;
}

/**
 * Main function to handle any error and convert to standardized format
 */
export function handleApiError(
  error: unknown, 
  options: HandleApiErrorOptions = {}
): ApiError {
  const { context, requestId = generateRequestId(), defaultCode = 'UNKNOWN' } = options;
  const timestamp = new Date().toISOString();

  // Handle AppError (our custom error class)
  if (isAppError(error)) {
    return error.toApiError(requestId);
  }

  // Handle ValidationError
  if (isValidationError(error)) {
    return {
      code: error.code,
      message: error.message,
      details: `${error.errors.length} validation error(s) found.`,
      suggestion: 'Review the highlighted fields and correct the errors.',
      severity: 'error',
      blocking: true,
      timestamp,
      requestId,
    };
  }

  // Handle standard Error
  if (error instanceof Error) {
    const code = getErrorCodeFromMessage(error.message) || defaultCode;
    const def = getErrorDefinition(code);
    
    return {
      code,
      message: def.message,
      details: context 
        ? `${def.details} Context: ${context}` 
        : def.details,
      suggestion: def.suggestion,
      severity: def.severity,
      blocking: def.blocking,
      technical: error.stack,
      timestamp,
      requestId,
    };
  }

  // Handle fetch Response errors
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    const code = getErrorCodeFromStatus(status);
    const def = getErrorDefinition(code);
    
    return {
      code,
      message: def.message,
      details: context 
        ? `${def.details} HTTP Status: ${status}. Context: ${context}` 
        : `${def.details} HTTP Status: ${status}`,
      suggestion: def.suggestion,
      severity: def.severity,
      blocking: def.blocking,
      timestamp,
      requestId,
    };
  }

  // Handle string errors
  if (typeof error === 'string') {
    const code = getErrorCodeFromMessage(error) || defaultCode;
    const def = getErrorDefinition(code);
    
    return {
      code,
      message: def.message,
      details: context 
        ? `${def.details} Error: ${error}. Context: ${context}` 
        : `${def.details} Error: ${error}`,
      suggestion: def.suggestion,
      severity: def.severity,
      blocking: def.blocking,
      timestamp,
      requestId,
    };
  }

  // Unknown error type
  const def = getErrorDefinition(defaultCode);
  return {
    code: defaultCode,
    message: def.message,
    details: context 
      ? `${def.details} Context: ${context}` 
      : def.details,
    suggestion: def.suggestion,
    severity: def.severity,
    blocking: def.blocking,
    timestamp,
    requestId,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// API RESPONSE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a successful API response
 */
export function createSuccessResponse<T>(
  data: T,
  options: { requestId?: string; warnings?: Array<{ code: string; message: string }> } = {}
): ApiResponse<T> {
  const requestId = options.requestId || generateRequestId();
  return {
    success: true,
    data,
    warnings: options.warnings,
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
    },
  };
}

/**
 * Create an error API response
 */
export function createErrorApiResponse<T = never>(
  error: unknown,
  options: HandleApiErrorOptions = {}
): ApiResponse<T> {
  const requestId = options.requestId || generateRequestId();
  const apiError = handleApiError(error, { ...options, requestId });
  
  return {
    success: false,
    error: apiError,
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
    },
  };
}

/**
 * Create a response from an error code directly
 */
export function createResponseFromCode<T = never>(
  code: string,
  additionalDetails?: string,
  requestId?: string
): ApiResponse<T> {
  const def = getErrorDefinition(code);
  const reqId = requestId || generateRequestId();
  
  return {
    success: false,
    error: {
      code,
      message: def.message,
      details: additionalDetails 
        ? `${def.details} ${additionalDetails}` 
        : def.details,
      suggestion: def.suggestion,
      severity: def.severity,
      blocking: def.blocking,
      timestamp: new Date().toISOString(),
      requestId: reqId,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: reqId,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// NEXT.JS RESPONSE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get appropriate HTTP status code from error severity
 */
function getHttpStatusFromSeverity(severity: ErrorSeverity): number {
  const statusMap: Record<ErrorSeverity, number> = {
    info: 200,
    warning: 200,
    error: 400,
    critical: 500,
  };
  return statusMap[severity];
}

/**
 * Create a NextResponse with success data
 */
export function nextSuccessResponse<T>(
  data: T,
  options: { requestId?: string; warnings?: Array<{ code: string; message: string }> } = {}
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(createSuccessResponse(data, options));
}

/**
 * Create a NextResponse with error
 */
export function nextErrorResponse(
  error: unknown,
  options: HandleApiErrorOptions = {}
): NextResponse<ApiResponse<never>> {
  const response = createErrorApiResponse(error, options);
  const status = response.error 
    ? getHttpStatusFromSeverity(response.error.severity) 
    : 500;
  
  return NextResponse.json(response, { status });
}

/**
 * Create a NextResponse from an error code
 */
export function nextErrorFromCode(
  code: string,
  additionalDetails?: string,
  requestId?: string
): NextResponse<ApiResponse<never>> {
  const response = createResponseFromCode(code, additionalDetails, requestId);
  const status = response.error 
    ? getHttpStatusFromSeverity(response.error.severity) 
    : 500;
  
  return NextResponse.json(response, { status });
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING HELPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log error with context for debugging
 */
export function logError(
  error: unknown, 
  context: string,
  requestId?: string
): void {
  const apiError = handleApiError(error, { context, requestId });
  
  console.error(`[${apiError.code}] ${apiError.message}`, {
    context,
    requestId: apiError.requestId,
    details: apiError.details,
    technical: apiError.technical,
    timestamp: apiError.timestamp,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// THROW HELPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create and throw an AppError from an error code
 */
export function throwAppError(
  code: string, 
  additionalDetails?: string,
  technical?: string
): never {
  const def = getErrorDefinition(code);
  throw new AppError(code, def, additionalDetails, technical);
}
