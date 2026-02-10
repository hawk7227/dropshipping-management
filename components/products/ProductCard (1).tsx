'use client';

// components/products/ProductCard.tsx
// Individual product card for the card grid view
// Shows: image carousel, title, ASIN, pricing, profit badge, status,
// demand score, Shopify sync status, and action buttons
// NEW FILE — does not modify any existing files

import { useState, useCallback, useMemo } from 'react';
import type { Product } from '@/types';
import type { ApiError } from '@/types/errors';
import { formatPrice, formatProfitPercent } from '@/lib/utils/pricing-calculator';
import { ProductImageCarousel } from './ProductImageCarousel';
import { GoogleStatusBadge } from './GoogleStatusBadge';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ProductCardProps {
  product: Product;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onViewDetails: (product: Product) => void;
  onRefresh: (id: string) => Promise<void>;
  onPause: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onSyncShopify?: (id: string) => Promise<void>;
}

type ActionType = 'refresh' | 'pause' | 'remove' | 'sync' | null;

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const MARGIN_THRESHOLD = 30;
const STALE_DAYS = 14;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getProfitBadge(margin: number | null | undefined): {
  label: string;
  className: string;
} {
  if (margin === null || margin === undefined) {
    return { label: 'Unknown', className: 'bg-gray-100 text-gray-600' };
  }
  if (margin >= MARGIN_THRESHOLD * 2) {
    return { label: `${margin.toFixed(0)}%`, className: 'bg-green-100 text-green-700' };
  }
  if (margin >= MARGIN_THRESHOLD) {
    return { label: `${margin.toFixed(0)}%`, className: 'bg-yellow-100 text-yellow-700' };
  }
  return { label: `${margin.toFixed(0)}%`, className: 'bg-red-100 text-red-700' };
}

function getStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'active':
      return { label: 'Active', className: 'bg-green-100 text-green-700' };
    case 'paused':
      return { label: 'Paused', className: 'bg-yellow-100 text-yellow-700' };
    case 'pending':
      return { label: 'Pending', className: 'bg-blue-100 text-blue-700' };
    case 'archived':
      return { label: 'Archived', className: 'bg-gray-100 text-gray-600' };
    default:
      return { label: status, className: 'bg-gray-100 text-gray-600' };
  }
}

function isStale(lastCheck: string | null | undefined): boolean {
  if (!lastCheck) return true;
  const days = (Date.now() - new Date(lastCheck).getTime()) / (1000 * 60 * 60 * 24);
  return days > STALE_DAYS;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ProductCard({
  product,
  isSelected,
  onSelect,
  onViewDetails,
  onRefresh,
  onPause,
  onRemove,
  onSyncShopify,
}: ProductCardProps) {
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  // Derived state
  const profitBadge = useMemo(() => getProfitBadge(product.profit_percent), [product.profit_percent]);
  const statusBadge = useMemo(() => getStatusBadge(product.status), [product.status]);
  const isSynced = !!(product.shopify_product_id || product.shopify_id);
  const stale = isStale(product.last_price_check);
  const asin = product.asin || product.source_product_id || null;

  // ─── Action handlers ─────────────────────────────────────────────────

  const handleAction = useCallback(async (
    action: ActionType,
    fn: (id: string) => Promise<void>
  ) => {
    if (activeAction) return; // prevent double-click
    setActiveAction(action);
    setActionError(null);
    try {
      await fn(product.id);
      if (action === 'remove') {
        setIsExiting(true);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActiveAction(null);
    }
  }, [activeAction, product.id]);

  // ─── Render ───────────────────────────────────────────────────────────

  if (isExiting) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden opacity-0 scale-95 transition-all duration-300" />
    );
  }

  return (
    <div
      className={`
        group relative bg-white rounded-xl border overflow-hidden transition-all duration-150
        hover:shadow-md hover:border-gray-300
        ${isSelected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'}
      `}
      aria-label={`${product.title}${asin ? ` — ${asin}` : ''}, ${formatPrice(product.retail_price)}, ${statusBadge.label}`}
    >
      {/* ── Checkbox (top-left overlay) ──────────────────────────────── */}
      <div className="absolute top-2 left-2 z-20">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(product.id)}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer bg-white/80 backdrop-blur-sm"
          aria-label={`Select ${product.title}`}
        />
      </div>

      {/* ── Stale badge (top-left, next to checkbox) ─────────────────── */}
      {stale && (
        <div className="absolute top-2 left-8 z-20">
          <span className="text-[9px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">
            STALE
          </span>
        </div>
      )}

      {/* ── Image ────────────────────────────────────────────────────── */}
      <div
        className="cursor-pointer"
        onClick={() => onViewDetails(product)}
      >
        <ProductImageCarousel
          images={product.images}
          imageUrl={product.image_url}
          alt={product.title}
          size="lg"
          className="rounded-none"
        />
      </div>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div className="p-3 space-y-2.5">
        {/* Title + click to view details */}
        <div
          className="cursor-pointer"
          onClick={() => onViewDetails(product)}
        >
          <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight hover:text-blue-600 transition-colors">
            {product.title}
          </h3>
        </div>

        {/* ASIN + Status + Prime row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {asin && (
              <span className="text-[11px] font-mono text-gray-400 truncate">
                {asin}
              </span>
            )}
            {product.is_prime && (
              <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1 py-0.5 rounded flex-shrink-0">
                PRIME
              </span>
            )}
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
        </div>

        {/* Rating */}
        {product.rating && (
          <div className="flex items-center gap-1">
            <div className="flex items-center">
              {[1, 2, 3, 4, 5].map(star => (
                <svg
                  key={star}
                  className={`w-3 h-3 ${
                    star <= Math.round(product.rating || 0)
                      ? 'text-yellow-400'
                      : 'text-gray-200'
                  }`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <span className="text-[10px] text-gray-400">
              {product.rating?.toFixed(1)} ({(product.review_count || 0).toLocaleString()})
            </span>
          </div>
        )}

        {/* ── Price row ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Cost</p>
            <p className="text-sm font-semibold text-gray-700">
              {formatPrice(product.cost_price)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Sell</p>
            <p className="text-sm font-semibold text-gray-900">
              {formatPrice(product.retail_price)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Profit</p>
            <span className={`inline-block text-xs font-bold px-1.5 py-0.5 rounded ${profitBadge.className}`}>
              {profitBadge.label}
            </span>
          </div>
        </div>

        {/* ── Sync status row ────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="flex items-center gap-1.5">
            {/* Shopify sync indicator */}
            <span className={`flex items-center gap-1 text-[10px] font-medium ${
              isSynced ? 'text-green-600' : 'text-gray-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isSynced ? 'bg-green-500' : 'bg-gray-300'}`} />
              {isSynced ? 'Synced' : 'Not synced'}
            </span>
            {/* Google Shopping status badge — Spec Item 32 */}
            <GoogleStatusBadge product={product} compact />
          </div>

          {/* Category */}
          {product.category && (
            <span className="text-[10px] text-gray-400 truncate max-w-[100px]">
              {product.category}
            </span>
          )}
        </div>

        {/* ── Error display ──────────────────────────────────────────── */}
        {actionError && (
          <div className="text-[11px] text-red-600 bg-red-50 px-2 py-1 rounded">
            {actionError}
          </div>
        )}

        {/* ── Action buttons ─────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 pt-2 border-t border-gray-100">
          {/* If negative margin → show Reprice button instead of Sync */}
          {(product.profit_percent !== null && product.profit_percent !== undefined && product.profit_percent < 0) ? (
            <>
              <button
                onClick={() => handleAction('refresh', onRefresh)}
                disabled={!!activeAction}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors disabled:opacity-50"
                title="Reprice this product"
              >
                {activeAction === 'refresh' ? (
                  <div className="w-3 h-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                ) : '⚠ Reprice'}
              </button>
              <button
                onClick={() => handleAction('remove', onRemove)}
                disabled={!!activeAction}
                className="flex items-center justify-center p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                title="Remove product"
              >
                {activeAction === 'remove' ? (
                  <div className="w-3.5 h-3.5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                ) : '🗑️'}
              </button>
            </>
          ) : (
            <>
              {/* Sync to Shopify (if not synced) */}
              {!isSynced && onSyncShopify && (
                <button
                  onClick={() => handleAction('sync', onSyncShopify)}
                  disabled={!!activeAction}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-md transition-colors disabled:opacity-50"
                  title="Sync to Shopify"
                >
                  {activeAction === 'sync' ? (
                    <div className="w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  )}
                  Sync
                </button>
              )}

          {/* Refresh price */}
          <button
            onClick={() => handleAction('refresh', onRefresh)}
            disabled={!!activeAction}
            className="flex items-center justify-center p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
            title="Refresh price"
            aria-label={`Refresh price for ${product.title}`}
          >
            {activeAction === 'refresh' ? (
              <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </button>

          {/* Pause/Activate toggle */}
          <button
            onClick={() => handleAction('pause', onPause)}
            disabled={!!activeAction}
            className={`flex items-center justify-center p-1.5 rounded-md transition-colors disabled:opacity-50 ${
              product.status === 'paused'
                ? 'text-green-600 hover:bg-green-50'
                : 'text-yellow-600 hover:bg-yellow-50'
            }`}
            title={product.status === 'paused' ? 'Activate' : 'Pause'}
            aria-label={product.status === 'paused' ? `Activate ${product.title}` : `Pause ${product.title}`}
          >
            {activeAction === 'pause' ? (
              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : product.status === 'paused' ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </button>

          {/* Remove */}
          <button
            onClick={() => handleAction('remove', onRemove)}
            disabled={!!activeAction}
            className="flex items-center justify-center p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
            title="Remove product"
            aria-label={`Remove ${product.title}`}
          >
            {activeAction === 'remove' ? (
              <div className="w-3.5 h-3.5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProductCard;
