'use client';

// components/ui/InlineError.tsx
// Compact inline error display for form fields and small error contexts
// Shows error code, message, and optional retry button

import { useState, useCallback } from 'react';
import type { ApiError } from '@/types/errors';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface InlineErrorProps {
  error: ApiError | string | null;
  className?: string;
  showCode?: boolean;
  showSuggestion?: boolean;
  onRetry?: () => void | Promise<void>;
  onDismiss?: () => void;
  compact?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function InlineError({
  error,
  className = '',
  showCode = true,
  showSuggestion = true,
  onRetry,
  onDismiss,
  compact = false,
}: InlineErrorProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Handle retry click
  const handleRetry = useCallback(async () => {
    if (!onRetry || isRetrying) return;
    
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  }, [onRetry, isRetrying]);

  // Handle dismiss click
  const handleDismiss = useCallback(() => {
    setDismissed(true);
    onDismiss?.();
  }, [onDismiss]);

  // Don't render if no error or dismissed
  if (!error || dismissed) {
    return null;
  }

  // Normalize error to ApiError format
  const normalizedError: ApiError = typeof error === 'string'
    ? { code: 'UNKNOWN', message: error }
    : error;

  // Compact mode - single line
  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-2 text-sm text-red-600 ${className}`}
        role="alert"
      >
        {showCode && normalizedError.code !== 'UNKNOWN' && (
          <span className="font-mono text-xs bg-red-100 px-1 rounded">
            {normalizedError.code}
          </span>
        )}
        <span>{normalizedError.message}</span>
        {onRetry && (
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className="text-red-700 underline hover:text-red-800 disabled:opacity-50"
          >
            {isRetrying ? '...' : 'Retry'}
          </button>
        )}
        {onDismiss && (
          <button
            onClick={handleDismiss}
            className="text-red-400 hover:text-red-600"
            aria-label="Dismiss error"
          >
            ×
          </button>
        )}
      </div>
    );
  }

  // Full mode - with details
  return (
    <div
      className={`bg-red-50 border border-red-200 rounded-md p-3 ${className}`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        {/* Error icon */}
        <svg
          className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>

        <div className="flex-1 min-w-0">
          {/* Error code and message */}
          <div className="flex items-center gap-2 flex-wrap">
            {showCode && normalizedError.code !== 'UNKNOWN' && (
              <span className="font-mono text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                {normalizedError.code}
              </span>
            )}
            <span className="text-sm font-medium text-red-800">
              {normalizedError.message}
            </span>
          </div>

          {/* Details */}
          {normalizedError.details && (
            <p className="text-sm text-red-600 mt-1">
              {normalizedError.details}
            </p>
          )}

          {/* Suggestion */}
          {showSuggestion && normalizedError.suggestion && (
            <p className="text-sm text-red-700 mt-1">
              <span className="font-medium">What to do: </span>
              {normalizedError.suggestion}
            </p>
          )}

          {/* Actions */}
          {(onRetry || onDismiss) && (
            <div className="flex gap-2 mt-2">
              {onRetry && (
                <button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="text-sm bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 disabled:opacity-50 transition-colors"
                >
                  {isRetrying ? 'Retrying...' : 'Try Again'}
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={handleDismiss}
                  className="text-sm text-red-600 px-2 py-1 rounded hover:bg-red-100 transition-colors"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>

        {/* Close button (alternative to dismiss) */}
        {onDismiss && !onRetry && (
          <button
            onClick={handleDismiss}
            className="text-red-400 hover:text-red-600 p-1"
            aria-label="Dismiss error"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simple error text for form validation
 */
export function FormError({ message, className = '' }: { message: string | null; className?: string }) {
  if (!message) return null;
  
  return (
    <p className={`text-sm text-red-600 mt-1 ${className}`} role="alert">
      {message}
    </p>
  );
}

/**
 * Error wrapper for field groups
 */
export function FieldError({
  error,
  children,
  className = '',
}: {
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {children}
      {error && (
        <p className="text-sm text-red-600 mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default InlineError;
