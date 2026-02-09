'use client';

// components/products/ProductRow.tsx
// Individual product row component for the products table
// Shows product info, pricing, profit status, and action buttons

import { useState, useCallback, useMemo } from 'react';
import type { Product } from '@/types';
import type { ApiError } from '@/types/errors';
import { InlineError } from '@/components/ui/InlineError';
import { formatPrice, formatProfitPercent } from '@/lib/utils/pricing-calculator';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ProductRowProps {
  product: Product;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onRefresh: (id: string) => Promise<void>;
  onPause: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onViewDetails: (product: Product) => void;
  isExpanded?: boolean;
  onToggleExpand?: (id: string) => void;
}

type ActionType = 'refresh' | 'pause' | 'remove' | null;

// ═══════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function ProfitBadge({ margin, threshold = 30 }: { margin: number | null; threshold?: number }) {
  if (margin === null || margin === undefined) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
        Unknown
      </span>
    );
  }

  const isHealthy = margin >= threshold * 2; // 60%+
  const isWarning = margin >= threshold && margin < threshold * 2; // 30-60%
  const isCritical = margin < threshold; // Below 30%

  const bgClass = isHealthy 
    ? 'bg-green-100 text-green-800' 
    : isWarning 
    ? 'bg-yellow-100 text-yellow-800'
    : 'bg-red-100 text-red-800';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${bgClass}`}>
      {formatProfitPercent(margin)}
    </span>
  );
}

function StatusBadge({ status }: { status: Product['status'] }) {
  const statusConfig = {
    active: { bg: 'bg-green-100', text: 'text-green-800', label: 'Active' },
    paused: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Paused' },
    pending: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Pending' },
    removed: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Removed' },
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

function StaleIndicator({ lastCheck, staleThresholdDays = 14 }: { lastCheck: string | null; staleThresholdDays?: number }) {
  if (!lastCheck) {
    return (
      <span className="text-xs text-orange-600" title="Never checked">
        ⚠️ Never checked
      </span>
    );
  }

  const lastCheckDate = new Date(lastCheck);
  const daysSince = Math.floor((Date.now() - lastCheckDate.getTime()) / (1000 * 60 * 60 * 24));
  const isStale = daysSince >= staleThresholdDays;

  if (isStale) {
    return (
      <span className="text-xs text-orange-600" title={`Last checked ${daysSince} days ago`}>
        ⚠️ Stale ({daysSince}d)
      </span>
    );
  }

  return (
    <span className="text-xs text-gray-500" title={`Last checked ${daysSince} days ago`}>
      {daysSince}d ago
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ProductRow({
  product,
  isSelected,
  onSelect,
  onRefresh,
  onPause,
  onRemove,
  onViewDetails,
  isExpanded = false,
  onToggleExpand,
}: ProductRowProps) {
  const [loadingAction, setLoadingAction] = useState<ActionType>(null);
  const [error, setError] = useState<ApiError | null>(null);

  // Calculate if product needs attention
  const needsAttention = useMemo(() => {
    if (product.status === 'removed') return false;
    if (product.profit_margin !== null && product.profit_margin < 30) return true;
    return false;
  }, [product.status, product.profit_margin]);

  // Handle action with loading state
  const handleAction = useCallback(async (
    action: ActionType,
    handler: (id: string) => Promise<void>
  ) => {
    if (loadingAction) return;
    
    setError(null);
    setLoadingAction(action);
    
    try {
      await handler(product.id);
    } catch (err) {
      setError({
        code: action === 'refresh' ? 'PROD_002' : action === 'pause' ? 'PROD_003' : 'PROD_004',
        message: `Failed to ${action} product`,
        details: err instanceof Error ? err.message : 'Unknown error',
        suggestion: 'Try again or contact support if the issue persists.',
      });
    } finally {
      setLoadingAction(null);
    }
  }, [loadingAction, product.id]);

  // Row background based on status
  const rowBgClass = needsAttention 
    ? 'bg-red-50 hover:bg-red-100' 
    : product.status === 'paused'
    ? 'bg-yellow-50 hover:bg-yellow-100'
    : 'bg-white hover:bg-gray-50';

  return (
    <>
      <tr className={`${rowBgClass} transition-colors border-b border-gray-200`}>
        {/* Checkbox */}
        <td className="px-3 py-3 whitespace-nowrap">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(product.id)}
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            aria-label={`Select ${product.title}`}
          />
        </td>

        {/* Product Image & Title */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-3">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt=""
                className="h-10 w-10 rounded object-cover bg-gray-100"
                loading="lazy"
              />
            ) : (
              <div className="h-10 w-10 rounded bg-gray-200 flex items-center justify-center text-gray-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
            <div className="min-w-0">
              <button
                onClick={() => onViewDetails(product)}
                className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block max-w-xs text-left"
                title={product.title}
              >
                {product.title.length > 40 ? product.title.slice(0, 40) + '...' : product.title}
              </button>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500 font-mono">{product.asin}</span>
                <StaleIndicator lastCheck={product.last_price_check} />
              </div>
            </div>
          </div>
        </td>

        {/* Status */}
        <td className="px-3 py-3 whitespace-nowrap">
          <StatusBadge status={product.status} />
        </td>

        {/* Amazon Cost */}
        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900 font-mono">
          {product.amazon_price !== null ? formatPrice(product.amazon_price) : '-'}
        </td>

        {/* Your Price */}
        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900 font-mono font-medium">
          {product.retail_price !== null ? formatPrice(product.retail_price) : '-'}
        </td>

        {/* Profit Margin */}
        <td className="px-3 py-3 whitespace-nowrap">
          <ProfitBadge margin={product.profit_margin} />
        </td>

        {/* Actions */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex items-center gap-1">
            {/* Refresh button */}
            <button
              onClick={() => handleAction('refresh', onRefresh)}
              disabled={loadingAction !== null}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
              title="Refresh prices"
            >
              {loadingAction === 'refresh' ? (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </button>

            {/* Pause/Unpause button */}
            <button
              onClick={() => handleAction('pause', onPause)}
              disabled={loadingAction !== null}
              className={`p-1.5 rounded disabled:opacity-50 ${
                product.status === 'paused' 
                  ? 'text-green-600 hover:text-green-700 hover:bg-green-50' 
                  : 'text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50'
              }`}
              title={product.status === 'paused' ? 'Unpause' : 'Pause'}
            >
              {loadingAction === 'pause' ? (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : product.status === 'paused' ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </button>

            {/* Remove button */}
            <button
              onClick={() => handleAction('remove', onRemove)}
              disabled={loadingAction !== null}
              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded disabled:opacity-50"
              title="Remove product"
            >
              {loadingAction === 'remove' ? (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>

            {/* Expand/Details button */}
            {onToggleExpand && (
              <button
                onClick={() => onToggleExpand(product.id)}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                <svg 
                  className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Inline error row */}
      {error && (
        <tr className="bg-red-50">
          <td colSpan={7} className="px-3 py-2">
            <InlineError
              error={error}
              onDismiss={() => setError(null)}
              onRetry={() => {
                setError(null);
                if (loadingAction) {
                  handleAction(loadingAction, 
                    loadingAction === 'refresh' ? onRefresh :
                    loadingAction === 'pause' ? onPause : onRemove
                  );
                }
              }}
              compact
            />
          </td>
        </tr>
      )}

      {/* Expanded details row */}
      {isExpanded && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-6 py-4">
            <ProductExpandedDetails product={product} />
          </td>
        </tr>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPANDED DETAILS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function ProductExpandedDetails({ product }: { product: Product }) {
  const competitorPrices = product.competitor_prices || {};

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
      {/* Competitor Prices */}
      <div>
        <h4 className="font-medium text-gray-700 mb-2">Competitor Prices</h4>
        <dl className="space-y-1">
          {Object.entries(competitorPrices).map(([key, value]) => (
            <div key={key} className="flex justify-between">
              <dt className="text-gray-500 capitalize">{key.replace('_', ' ')}</dt>
              <dd className="font-mono text-gray-900">{formatPrice(value as number)}</dd>
            </div>
          ))}
          {Object.keys(competitorPrices).length === 0 && (
            <span className="text-gray-400">No competitor prices</span>
          )}
        </dl>
      </div>

      {/* Product Details */}
      <div>
        <h4 className="font-medium text-gray-700 mb-2">Product Details</h4>
        <dl className="space-y-1">
          <div className="flex justify-between">
            <dt className="text-gray-500">Category</dt>
            <dd className="text-gray-900">{product.category || '-'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Rating</dt>
            <dd className="text-gray-900">{product.rating ?? '-'} ⭐</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Reviews</dt>
            <dd className="text-gray-900">{product.review_count?.toLocaleString() ?? '-'}</dd>
          </div>
        </dl>
      </div>

      {/* Shopify Status */}
      <div>
        <h4 className="font-medium text-gray-700 mb-2">Shopify</h4>
        <dl className="space-y-1">
          <div className="flex justify-between">
            <dt className="text-gray-500">Synced</dt>
            <dd className={product.shopify_id ? 'text-green-600' : 'text-gray-400'}>
              {product.shopify_id ? '✓ Yes' : 'No'}
            </dd>
          </div>
          {product.shopify_id && (
            <div className="flex justify-between">
              <dt className="text-gray-500">ID</dt>
              <dd className="text-gray-900 font-mono text-xs">{product.shopify_id}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-gray-500">Handle</dt>
            <dd className="text-gray-900 text-xs truncate max-w-[120px]">
              {product.shopify_handle || '-'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Timestamps */}
      <div>
        <h4 className="font-medium text-gray-700 mb-2">Timestamps</h4>
        <dl className="space-y-1">
          <div className="flex justify-between">
            <dt className="text-gray-500">Added</dt>
            <dd className="text-gray-900 text-xs">
              {new Date(product.created_at).toLocaleDateString()}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Updated</dt>
            <dd className="text-gray-900 text-xs">
              {new Date(product.updated_at).toLocaleDateString()}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Price Check</dt>
            <dd className="text-gray-900 text-xs">
              {product.last_price_check 
                ? new Date(product.last_price_check).toLocaleDateString() 
                : 'Never'}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export default ProductRow;
