// types/errors.ts
// TypeScript types for error handling throughout Dropship Pro
// Provides standardized error response formats and custom error classes

// ═══════════════════════════════════════════════════════════════════════════
// ERROR SEVERITY & STATUS TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';
export type FeatureStatusType = 'operational' | 'degraded' | 'error' | 'not_configured';

// ═══════════════════════════════════════════════════════════════════════════
// API ERROR TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Standard API error structure returned from all API endpoints
 */
export interface ApiError {
  code: string; // Error code from error-codes.ts (e.g., 'DB_001')
  message: string; // User-friendly error message
  details: string; // More detailed explanation of what happened
  suggestion: string; // What the user can do to fix it
  severity: ErrorSeverity;
  blocking: boolean; // Whether this error prevents further action
  technical?: string; // Technical details for logging (not shown to user)
  timestamp?: string; // ISO timestamp when error occurred
  requestId?: string; // Unique request ID for debugging
}

/**
 * Standard API response wrapper for all API endpoints
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  warnings?: Array<{
    code: string;
    message: string;
    details?: string;
  }>;
  meta?: {
    timestamp: string;
    requestId: string;
    duration?: number; // Response time in ms
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE STATUS TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Status of a specific feature (used for health checks and status indicators)
 */
export interface FeatureStatus {
  featureId: string;
  featureName: string;
  status: FeatureStatusType;
  error?: ApiError;
  lastChecked: string; // ISO timestamp
}

/**
 * Health status for an entire page (aggregates multiple feature statuses)
 */
export interface PageHealthStatus {
  pageId: string;
  healthy: boolean;
  features: FeatureStatus[];
  blockingErrors: ApiError[];
  warnings: ApiError[];
}

// ═══════════════════════════════════════════════════════════════════════════
// DEPENDENCY CHECK TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Defines a health check for a page dependency
 */
export interface DependencyCheck {
  id: string;
  name: string;
  check: () => Promise<boolean>;
  errorCode: string;
  errorMessage?: string;
  errorDetails?: string;
  suggestion?: string;
  nonBlocking?: boolean; // If true, page can still load when this fails
}

/**
 * Result of running all dependency checks for a page
 */
export interface DependencyCheckResult {
  id: string;
  name: string;
  passed: boolean;
  error?: ApiError;
  duration: number; // Time taken for check in ms
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR DEFINITION TYPE (for error-codes.ts)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Structure for error definitions in the error codes registry
 */
export interface ErrorDefinition {
  code: string;
  message: string;
  details: string;
  suggestion: string;
  severity: ErrorSeverity;
  blocking: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM ERROR CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Custom error class that extends Error with additional properties
 * from our error code system. Used throughout the application.
 */
export class AppError extends Error {
  code: string;
  details: string;
  suggestion: string;
  severity: ErrorSeverity;
  blocking: boolean;
  technical?: string;
  timestamp: string;

  constructor(
    code: string,
    errorDef: ErrorDefinition,
    additionalDetails?: string,
    technical?: string
  ) {
    super(errorDef.message);
    
    this.name = 'AppError';
    this.code = code;
    this.details = additionalDetails 
      ? `${errorDef.details} ${additionalDetails}` 
      : errorDef.details;
    this.suggestion = errorDef.suggestion;
    this.severity = errorDef.severity;
    this.blocking = errorDef.blocking;
    this.technical = technical;
    this.timestamp = new Date().toISOString();

    // Maintains proper stack trace for where our error was thrown (only in V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * Convert AppError to ApiError format for API responses
   */
  toApiError(requestId?: string): ApiError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      suggestion: this.suggestion,
      severity: this.severity,
      blocking: this.blocking,
      technical: this.technical,
      timestamp: this.timestamp,
      requestId,
    };
  }

  /**
   * Create a standardized error API response
   */
  toApiResponse<T = never>(requestId?: string): ApiResponse<T> {
    return {
      success: false,
      error: this.toApiError(requestId),
      meta: {
        timestamp: this.timestamp,
        requestId: requestId || 'unknown',
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION ERROR CLASS
// ═══════════════════════════════════════════════════════════════════════════

export interface ValidationErrorItem {
  field: string;
  code: string;
  message: string;
}

/**
 * Specialized error class for validation failures
 * Contains multiple field-level errors
 */
export class ValidationError extends Error {
  code: string = 'VALIDATION_ERROR';
  errors: ValidationErrorItem[];
  timestamp: string;

  constructor(errors: ValidationErrorItem[]) {
    const fieldNames = errors.map(e => e.field).join(', ');
    super(`Validation failed for: ${fieldNames}`);
    
    this.name = 'ValidationError';
    this.errors = errors;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }

  /**
   * Convert to API response format
   */
  toApiResponse<T = never>(requestId?: string): ApiResponse<T> {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: `${this.errors.length} validation error(s) found.`,
        suggestion: 'Review the highlighted fields and correct the errors.',
        severity: 'error',
        blocking: true,
        timestamp: this.timestamp,
        requestId,
      },
      warnings: this.errors.map(e => ({
        code: e.code,
        message: `${e.field}: ${e.message}`,
      })),
      meta: {
        timestamp: this.timestamp,
        requestId: requestId || 'unknown',
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER TYPE GUARDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Type guard to check if an error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Type guard to check if a response is successful
 */
export function isSuccessResponse<T>(response: ApiResponse<T>): response is ApiResponse<T> & { success: true; data: T } {
  return response.success === true && response.data !== undefined;
}

/**
 * Type guard to check if a response is an error
 */
export function isErrorResponse<T>(response: ApiResponse<T>): response is ApiResponse<T> & { success: false; error: ApiError } {
  return response.success === false && response.error !== undefined;
}
