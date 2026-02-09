'use client';

// components/ui/FeatureStatusIndicator.tsx
// Compact status indicator for showing feature health (dot + label)
// Used in headers, sidebars, and navigation

import { useMemo } from 'react';
import type { FeatureStatus, ServiceHealth } from '@/types/errors';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type StatusType = 'operational' | 'degraded' | 'error' | 'not_configured' | 'unknown';

interface FeatureStatusIndicatorProps {
  status: FeatureStatus | ServiceHealth | StatusType;
  label?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  tooltip?: string;
  onClick?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const STATUS_CONFIG: Record<StatusType, {
  color: string;
  bgColor: string;
  pulseColor: string;
  label: string;
  description: string;
}> = {
  operational: {
    color: 'bg-green-500',
    bgColor: 'bg-green-100',
    pulseColor: 'bg-green-400',
    label: 'Operational',
    description: 'Feature is working correctly',
  },
  degraded: {
    color: 'bg-yellow-500',
    bgColor: 'bg-yellow-100',
    pulseColor: 'bg-yellow-400',
    label: 'Degraded',
    description: 'Feature is partially working',
  },
  error: {
    color: 'bg-red-500',
    bgColor: 'bg-red-100',
    pulseColor: 'bg-red-400',
    label: 'Error',
    description: 'Feature is not working',
  },
  not_configured: {
    color: 'bg-gray-400',
    bgColor: 'bg-gray-100',
    pulseColor: 'bg-gray-300',
    label: 'Not Configured',
    description: 'Feature requires configuration',
  },
  unknown: {
    color: 'bg-gray-300',
    bgColor: 'bg-gray-50',
    pulseColor: 'bg-gray-200',
    label: 'Unknown',
    description: 'Status is unknown',
  },
};

const SIZE_CONFIG = {
  sm: {
    dot: 'w-2 h-2',
    pulse: 'w-2 h-2',
    text: 'text-xs',
    gap: 'gap-1',
  },
  md: {
    dot: 'w-2.5 h-2.5',
    pulse: 'w-2.5 h-2.5',
    text: 'text-sm',
    gap: 'gap-1.5',
  },
  lg: {
    dot: 'w-3 h-3',
    pulse: 'w-3 h-3',
    text: 'text-base',
    gap: 'gap-2',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize various status formats to StatusType
 */
function normalizeStatus(status: FeatureStatus | ServiceHealth | StatusType): StatusType {
  if (typeof status === 'string') {
    if (status in STATUS_CONFIG) {
      return status as StatusType;
    }
    return 'unknown';
  }
  
  // Handle FeatureStatus object
  if ('status' in status) {
    return status.status as StatusType;
  }
  
  return 'unknown';
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function FeatureStatusIndicator({
  status,
  label,
  showLabel = true,
  size = 'md',
  className = '',
  tooltip,
  onClick,
}: FeatureStatusIndicatorProps) {
  const normalizedStatus = useMemo(() => normalizeStatus(status), [status]);
  const config = STATUS_CONFIG[normalizedStatus];
  const sizeConfig = SIZE_CONFIG[size];

  const displayLabel = label || config.label;
  const displayTooltip = tooltip || config.description;

  const content = (
    <div
      className={`inline-flex items-center ${sizeConfig.gap} ${className}`}
      title={displayTooltip}
      role="status"
      aria-label={`${displayLabel}: ${config.description}`}
    >
      {/* Status dot with optional pulse animation for errors */}
      <span className="relative flex" aria-hidden="true">
        {normalizedStatus === 'error' && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.pulseColor} opacity-75`}
          />
        )}
        <span
          className={`relative inline-flex rounded-full ${sizeConfig.dot} ${config.color}`}
        />
      </span>

      {/* Label */}
      {showLabel && (
        <span className={`${sizeConfig.text} text-gray-700 font-medium`}>
          {displayLabel}
        </span>
      )}
    </div>
  );

  // Wrap in button if clickable
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="hover:opacity-80 transition-opacity cursor-pointer"
        aria-label={`${displayLabel} status: ${config.description}. Click for details.`}
      >
        {content}
      </button>
    );
  }

  return content;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Status dot only (no label)
 */
export function StatusDot({
  status,
  size = 'md',
  className = '',
  tooltip,
}: {
  status: StatusType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  tooltip?: string;
}) {
  return (
    <FeatureStatusIndicator
      status={status}
      showLabel={false}
      size={size}
      className={className}
      tooltip={tooltip}
    />
  );
}

/**
 * Status badge (pill style)
 */
export function StatusBadge({
  status,
  label,
  size = 'sm',
  className = '',
}: {
  status: StatusType;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const normalizedStatus = normalizeStatus(status);
  const config = STATUS_CONFIG[normalizedStatus];
  const displayLabel = label || config.label;

  const sizeClasses = size === 'sm' 
    ? 'text-xs px-2 py-0.5' 
    : 'text-sm px-2.5 py-1';

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full font-medium
        ${config.bgColor} ${sizeClasses} ${className}
      `}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.color}`} />
      <span className={normalizedStatus === 'error' ? 'text-red-700' : 
                       normalizedStatus === 'degraded' ? 'text-yellow-700' : 
                       normalizedStatus === 'operational' ? 'text-green-700' : 
                       'text-gray-700'}>
        {displayLabel}
      </span>
    </span>
  );
}

/**
 * Compact status for table cells
 */
export function TableCellStatus({
  status,
  showText = false,
}: {
  status: StatusType;
  showText?: boolean;
}) {
  return (
    <FeatureStatusIndicator
      status={status}
      showLabel={showText}
      size="sm"
    />
  );
}

/**
 * Get status from boolean
 */
export function booleanToStatus(value: boolean | null | undefined): StatusType {
  if (value === null || value === undefined) return 'unknown';
  return value ? 'operational' : 'error';
}

/**
 * Get status from configured flag
 */
export function configuredToStatus(configured: boolean): StatusType {
  return configured ? 'operational' : 'not_configured';
}

export default FeatureStatusIndicator;
