'use client';

// components/ui/FeatureStatusBanner.tsx
// THE RED ERROR BOX - Full-width banner for critical errors
// Shows error code, why it happened, what to do, and action buttons

import { useState, useCallback } from 'react';
import type { ApiError, FeatureStatus, ErrorSeverity } from '@/types/errors';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface FeatureStatusBannerProps {
  error?: ApiError | null;
  status?: FeatureStatus | null;
  title?: string;
  className?: string;
  onRetry?: () => void | Promise<void>;
  onDismiss?: () => void;
  dismissible?: boolean;
  showTimestamp?: boolean;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

interface MultiErrorBannerProps {
  errors: ApiError[];
  title?: string;
  className?: string;
  onRetryAll?: () => void | Promise<void>;
  onDismissAll?: () => void;
  dismissible?: boolean;
  collapsible?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEVERITY CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const SEVERITY_CONFIG: Record<ErrorSeverity, {
  bgColor: string;
  borderColor: string;
  iconColor: string;
  textColor: string;
  titleColor: string;
  icon: 'error' | 'warning' | 'info';
}> = {
  critical: {
    bgColor: 'bg-red-50',
    borderColor: 'border-red-400',
    iconColor: 'text-red-500',
    textColor: 'text-red-700',
    titleColor: 'text-red-800',
    icon: 'error',
  },
  error: {
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    iconColor: 'text-red-500',
    textColor: 'text-red-700',
    titleColor: 'text-red-800',
    icon: 'error',
  },
  warning: {
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-400',
    iconColor: 'text-yellow-500',
    textColor: 'text-yellow-700',
    titleColor: 'text-yellow-800',
    icon: 'warning',
  },
  info: {
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    iconColor: 'text-blue-500',
    textColor: 'text-blue-700',
    titleColor: 'text-blue-800',
    icon: 'info',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════

function ErrorIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function WarningIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function InfoIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ChevronIcon({ className = '', direction = 'down' }: { className?: string; direction?: 'up' | 'down' }) {
  return (
    <svg 
      className={`${className} transition-transform ${direction === 'up' ? 'rotate-180' : ''}`} 
      fill="none" 
      viewBox="0 0 24 24" 
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function FeatureStatusBanner({
  error,
  status,
  title,
  className = '',
  onRetry,
  onDismiss,
  dismissible = true,
  showTimestamp = false,
  collapsible = false,
  defaultCollapsed = false,
}: FeatureStatusBannerProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  // Determine what to display
  const displayError = error || (status?.error ? status.error : null);
  
  if (!displayError || dismissed) {
    return null;
  }

  const severity: ErrorSeverity = displayError.severity || 'error';
  const config = SEVERITY_CONFIG[severity];

  const handleRetry = async () => {
    if (!onRetry || isRetrying) return;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  const IconComponent = config.icon === 'error' ? ErrorIcon : 
                        config.icon === 'warning' ? WarningIcon : InfoIcon;

  return (
    <div
      className={`
        ${config.bgColor} ${config.borderColor} border-l-4 p-4 rounded-r-md
        ${className}
      `}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start">
        {/* Icon */}
        <IconComponent className={`w-6 h-6 ${config.iconColor} flex-shrink-0`} />

        {/* Content */}
        <div className="ml-3 flex-1">
          {/* Header: Code + Title */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Error Code Badge */}
            <span className={`
              font-mono text-sm font-bold px-2 py-0.5 rounded
              ${severity === 'critical' || severity === 'error' ? 'bg-red-200 text-red-800' :
                severity === 'warning' ? 'bg-yellow-200 text-yellow-800' :
                'bg-blue-200 text-blue-800'}
            `}>
              {displayError.code}
            </span>

            {/* Title/Message */}
            <h3 className={`text-base font-semibold ${config.titleColor}`}>
              {title || displayError.message}
            </h3>

            {/* Collapsible toggle */}
            {collapsible && (
              <button
                onClick={() => setCollapsed(!collapsed)}
                className={`ml-auto p-1 rounded hover:bg-white/50 ${config.textColor}`}
                aria-expanded={!collapsed}
              >
                <ChevronIcon className="w-5 h-5" direction={collapsed ? 'down' : 'up'} />
              </button>
            )}
          </div>

          {/* Collapsible content */}
          {!collapsed && (
            <>
              {/* Message (if title is different) */}
              {title && (
                <p className={`mt-1 text-sm ${config.textColor}`}>
                  {displayError.message}
                </p>
              )}

              {/* Why it happened */}
              {displayError.details && (
                <div className="mt-2">
                  <p className={`text-sm font-medium ${config.titleColor}`}>Why this happened:</p>
                  <p className={`text-sm ${config.textColor}`}>{displayError.details}</p>
                </div>
              )}

              {/* What to do */}
              {displayError.suggestion && (
                <div className="mt-2">
                  <p className={`text-sm font-medium ${config.titleColor}`}>What to do:</p>
                  <p className={`text-sm ${config.textColor}`}>{displayError.suggestion}</p>
                </div>
              )}

              {/* Timestamp */}
              {showTimestamp && displayError.timestamp && (
                <p className={`mt-2 text-xs ${config.textColor} opacity-75`}>
                  Occurred at: {new Date(displayError.timestamp).toLocaleString()}
                </p>
              )}

              {/* Actions */}
              {(onRetry || dismissible) && (
                <div className="mt-3 flex gap-2">
                  {onRetry && (
                    <button
                      onClick={handleRetry}
                      disabled={isRetrying}
                      className={`
                        px-3 py-1.5 text-sm font-medium rounded
                        ${severity === 'critical' || severity === 'error'
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : severity === 'warning'
                          ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                          : 'bg-blue-600 text-white hover:bg-blue-700'}
                        disabled:opacity-50 transition-colors
                      `}
                    >
                      {isRetrying ? 'Retrying...' : 'Try Again'}
                    </button>
                  )}
                  {dismissible && onDismiss && (
                    <button
                      onClick={handleDismiss}
                      className={`px-3 py-1.5 text-sm font-medium rounded ${config.textColor} hover:bg-white/50 transition-colors`}
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Close button (alternative position) */}
        {dismissible && !onDismiss && (
          <button
            onClick={handleDismiss}
            className={`ml-2 p-1 rounded hover:bg-white/50 ${config.textColor}`}
            aria-label="Dismiss"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-ERROR BANNER
// ═══════════════════════════════════════════════════════════════════════════

export function MultiErrorBanner({
  errors,
  title = 'Multiple Issues Detected',
  className = '',
  onRetryAll,
  onDismissAll,
  dismissible = true,
  collapsible = true,
}: MultiErrorBannerProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (errors.length === 0 || dismissed) {
    return null;
  }

  // Single error - use regular banner
  if (errors.length === 1) {
    return (
      <FeatureStatusBanner
        error={errors[0]}
        onRetry={onRetryAll}
        onDismiss={onDismissAll}
        dismissible={dismissible}
        className={className}
      />
    );
  }

  const handleRetryAll = async () => {
    if (!onRetryAll || isRetrying) return;
    setIsRetrying(true);
    try {
      await onRetryAll();
    } finally {
      setIsRetrying(false);
    }
  };

  // Count by severity
  const criticalCount = errors.filter(e => e.severity === 'critical').length;
  const errorCount = errors.filter(e => e.severity === 'error' || !e.severity).length;
  const warningCount = errors.filter(e => e.severity === 'warning').length;

  return (
    <div
      className={`bg-red-50 border-l-4 border-red-400 p-4 rounded-r-md ${className}`}
      role="alert"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ErrorIcon className="w-6 h-6 text-red-500" />
          <h3 className="text-base font-semibold text-red-800">{title}</h3>
          <span className="text-sm text-red-600">
            ({errors.length} issues)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {collapsible && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1 rounded hover:bg-red-100 text-red-700"
            >
              <ChevronIcon className="w-5 h-5" direction={collapsed ? 'down' : 'up'} />
            </button>
          )}
          {dismissible && (
            <button
              onClick={() => {
                setDismissed(true);
                onDismissAll?.();
              }}
              className="p-1 rounded hover:bg-red-100 text-red-500"
              aria-label="Dismiss all"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex gap-2 mt-2">
        {criticalCount > 0 && (
          <span className="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full">
            {criticalCount} Critical
          </span>
        )}
        {errorCount > 0 && (
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
            {errorCount} Errors
          </span>
        )}
        {warningCount > 0 && (
          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
            {warningCount} Warnings
          </span>
        )}
      </div>

      {/* Error list */}
      {!collapsed && (
        <div className="mt-3 space-y-2">
          {errors.map((error, index) => (
            <div
              key={`${error.code}-${index}`}
              className="bg-white/50 rounded p-2 border border-red-200"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                  {error.code}
                </span>
                <span className="text-sm font-medium text-red-800">{error.message}</span>
              </div>
              {error.suggestion && (
                <p className="text-xs text-red-600 mt-1 ml-14">
                  → {error.suggestion}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {onRetryAll && (
        <div className="mt-3">
          <button
            onClick={handleRetryAll}
            disabled={isRetrying}
            className="px-3 py-1.5 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isRetrying ? 'Retrying All...' : 'Retry All'}
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Full-page blocking error
 */
export function FullPageError({
  error,
  onRetry,
  showHomeLink = true,
}: {
  error: ApiError;
  onRetry?: () => void;
  showHomeLink?: boolean;
}) {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      <div className="max-w-lg w-full">
        <FeatureStatusBanner
          error={error}
          onRetry={onRetry}
          dismissible={false}
        />
        {showHomeLink && (
          <div className="mt-4 text-center">
            <a href="/" className="text-sm text-gray-600 hover:text-gray-800 underline">
              Return to Dashboard
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Warning banner (non-blocking)
 */
export function WarningBanner({
  message,
  details,
  suggestion,
  onDismiss,
}: {
  message: string;
  details?: string;
  suggestion?: string;
  onDismiss?: () => void;
}) {
  return (
    <FeatureStatusBanner
      error={{
        code: 'WARNING',
        message,
        details,
        suggestion,
        severity: 'warning',
      }}
      onDismiss={onDismiss}
      dismissible={true}
    />
  );
}

/**
 * Info banner
 */
export function InfoBanner({
  message,
  details,
  onDismiss,
}: {
  message: string;
  details?: string;
  onDismiss?: () => void;
}) {
  return (
    <FeatureStatusBanner
      error={{
        code: 'INFO',
        message,
        details,
        severity: 'info',
      }}
      onDismiss={onDismiss}
      dismissible={true}
    />
  );
}

export default FeatureStatusBanner;
