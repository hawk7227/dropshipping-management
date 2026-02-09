'use client';

// components/ui/ErrorBoundary.tsx
// React Error Boundary for catching rendering errors
// Prevents entire app from crashing on component errors

import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { ApiError } from '@/types/errors';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
  componentName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR BOUNDARY CLASS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    // Update state with error info
    this.setState({ errorInfo });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // In production, you might send this to an error tracking service
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
      // Could integrate with Sentry, LogRocket, etc.
      console.error('[ErrorBoundary] Production error logged');
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback, showDetails = false, componentName } = this.props;

    if (hasError && error) {
      // Custom fallback
      if (fallback) {
        if (typeof fallback === 'function') {
          return fallback(error, this.handleReset);
        }
        return fallback;
      }

      // Default error UI
      return (
        <DefaultErrorFallback
          error={error}
          errorInfo={errorInfo}
          onReset={this.handleReset}
          showDetails={showDetails}
          componentName={componentName}
        />
      );
    }

    return children;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT ERROR FALLBACK UI
// ═══════════════════════════════════════════════════════════════════════════

function DefaultErrorFallback({
  error,
  errorInfo,
  onReset,
  showDetails = false,
  componentName,
}: {
  error: Error;
  errorInfo: ErrorInfo | null;
  onReset: () => void;
  showDetails?: boolean;
  componentName?: string;
}) {
  const apiError: ApiError = {
    code: 'REACT_001',
    message: 'Something went wrong',
    details: error.message || 'An unexpected error occurred while rendering this component.',
    suggestion: 'Try refreshing the page. If the problem persists, contact support.',
    severity: 'error',
  };

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 m-4" role="alert">
      <div className="flex items-start gap-3">
        {/* Error Icon */}
        <div className="flex-shrink-0">
          <svg
            className="w-8 h-8 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <div className="flex-1">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-bold bg-red-200 text-red-800 px-2 py-0.5 rounded">
              {apiError.code}
            </span>
            <h2 className="text-lg font-semibold text-red-800">
              {apiError.message}
            </h2>
          </div>

          {/* Component name */}
          {componentName && (
            <p className="text-sm text-red-600 mt-1">
              Error in: <span className="font-mono">{componentName}</span>
            </p>
          )}

          {/* Why */}
          <div className="mt-3">
            <p className="text-sm font-medium text-red-800">Why this happened:</p>
            <p className="text-sm text-red-700 mt-1">{apiError.details}</p>
          </div>

          {/* What to do */}
          <div className="mt-3">
            <p className="text-sm font-medium text-red-800">What to do:</p>
            <p className="text-sm text-red-700 mt-1">{apiError.suggestion}</p>
          </div>

          {/* Technical details (dev mode) */}
          {showDetails && errorInfo && (
            <details className="mt-4">
              <summary className="text-sm font-medium text-red-700 cursor-pointer hover:text-red-800">
                Technical Details (for developers)
              </summary>
              <div className="mt-2 p-3 bg-red-100 rounded overflow-auto max-h-48">
                <p className="text-xs font-mono text-red-800 whitespace-pre-wrap">
                  {error.stack || error.message}
                </p>
                <p className="text-xs font-mono text-red-700 mt-2 whitespace-pre-wrap">
                  Component Stack:{errorInfo.componentStack}
                </p>
              </div>
            </details>
          )}

          {/* Actions */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={onReset}
              className="px-4 py-2 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium rounded border border-red-300 text-red-700 hover:bg-red-100 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Section-level error boundary with minimal UI
 */
export function SectionErrorBoundary({
  children,
  sectionName,
  onError,
}: {
  children: ReactNode;
  sectionName: string;
  onError?: (error: Error) => void;
}) {
  return (
    <ErrorBoundary
      componentName={sectionName}
      showDetails={process.env.NODE_ENV === 'development'}
      onError={(error, info) => {
        console.error(`[${sectionName}] Error:`, error);
        onError?.(error);
      }}
      fallback={(error, reset) => (
        <div className="bg-gray-100 rounded p-4 text-center">
          <p className="text-sm text-gray-600">
            Failed to load {sectionName}
          </p>
          <button
            onClick={reset}
            className="mt-2 text-sm text-blue-600 hover:underline"
          >
            Try again
          </button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * Widget-level error boundary with compact UI
 */
export function WidgetErrorBoundary({
  children,
  widgetName,
}: {
  children: ReactNode;
  widgetName: string;
}) {
  return (
    <ErrorBoundary
      componentName={widgetName}
      fallback={(error, reset) => (
        <div className="border border-red-200 bg-red-50 rounded p-3">
          <div className="flex items-center gap-2">
            <span className="text-red-500">⚠</span>
            <span className="text-sm text-red-700">{widgetName} failed to load</span>
          </div>
          <button
            onClick={reset}
            className="mt-2 text-xs text-red-600 hover:underline"
          >
            Retry
          </button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * Page-level error boundary with full error display
 */
export function PageErrorBoundary({
  children,
  pageName,
}: {
  children: ReactNode;
  pageName: string;
}) {
  return (
    <ErrorBoundary
      componentName={pageName}
      showDetails={process.env.NODE_ENV === 'development'}
      fallback={(error, reset) => (
        <div className="min-h-[60vh] flex items-center justify-center p-8">
          <div className="max-w-lg w-full">
            <DefaultErrorFallback
              error={error}
              errorInfo={null}
              onReset={reset}
              showDetails={process.env.NODE_ENV === 'development'}
              componentName={pageName}
            />
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * Hook to manually trigger error boundary
 * Use with ErrorBoundary that has onError prop
 */
export function useErrorHandler() {
  return (error: Error) => {
    throw error;
  };
}

export default ErrorBoundary;
