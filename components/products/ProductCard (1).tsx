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

const PROFIT_THRESHOLD = 30;
const STALE_DAYS = 14;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getProfitBadge(profit: number | null | undefined): {
  label: string;
  className: string;
} {
  if (profit === null || profit === undefined) {
    return { label: 'N/A', className: 'text-[#6b7280]' };
  }
  if (profit >= PROFIT_THRESHOLD) {
    return { label: `${profit.toFixed(1)}%`, className: 'text-cyan-400' };
  }
  return { label: `${profit.toFixed(1)}%`, className: 'text-red-400' };
}

function getStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'active':
      return { label: 'active', className: 'bg-green-500/15 text-green-400 border border-green-500/20' };
    case 'paused':
      return { label: 'paused', className: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20' };
    case 'pending':
      return { label: 'pending', className: 'bg-blue-500/15 text-blue-400 border border-blue-500/20' };
    case 'draft':
      return { label: 'draft', className: 'bg-purple-500/15 text-purple-400 border border-purple-500/20' };
    case 'archived':
      return { label: 'archived', className: 'bg-gray-500/15 text-gray-400 border border-gray-500/20' };
    default:
      return { label: status, className: 'bg-gray-500/15 text-gray-400 border border-gray-500/20' };
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
  const isPrimeEligible = product.amazon_is_prime;
  const isNegativeProfit = (product.profit_percent !== null && product.profit_percent !== undefined && product.profit_percent < 0);

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
      <div className="bg-[#181c25] rounded-xl border border-[#2c3340] overflow-hidden opacity-0 scale-95 transition-all duration-300" />
    );
  }

  return (
    <div
      className={`
        group relative bg-[#181c25] rounded-xl border overflow-hidden transition-all duration-150
        hover:border-[#3a4250] hover:shadow-lg hover:shadow-black/20
        ${isSelected ? 'border-cyan-500/40 ring-2 ring-cyan-500/10' : 'border-[#2c3340]'}
      `}
      aria-label={`${product.title}${asin ? ` — ${asin}` : ''}, ${formatPrice(product.retail_price)}, ${statusBadge.label}`}
    >
      {/* ── Checkbox (top-left overlay) ──────────────────────────────── */}
      <div className="absolute top-2 left-2 z-20">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(product.id)}
          className="w-4 h-4 rounded border-[#3a4250] text-purple-500 focus:ring-purple-500 cursor-pointer bg-[#222832]/80 backdrop-blur-sm"
          aria-label={`Select ${product.title}`}
        />
      </div>

      {/* ── Status badge (top-right) ─────────────────────────────────── */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5">
        {stale && (
          <span className="text-[9px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded-full">
            STALE
          </span>
        )}
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${statusBadge.className}`}>
          {statusBadge.label}
        </span>
      </div>

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
      <div className="p-4 space-y-3">
        {/* Title — BOLD, prominent */}
        <div
          className="cursor-pointer"
          onClick={() => onViewDetails(product)}
        >
          <h3 className="font-bold text-[15px] leading-snug text-[#e8eaed] line-clamp-2 tracking-tight">
            {product.title}
          </h3>
        </div>

        {/* ASIN + Prime badge + Rating — single row */}
        <div className="flex items-center gap-2 flex-wrap">
          {asin && (
            <span className="text-[11px] font-mono text-[#6b7280]">{asin}</span>
          )}
          {isPrimeEligible && (
            <span className="text-[9px] font-extrabold tracking-wide bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded">
              PRIME
            </span>
          )}
          {product.rating && (
            <span className="flex items-center gap-1 text-[11px]">
              <span className="text-yellow-400">★</span>
              <span className="text-[#8b919c] font-medium">
                {product.rating.toFixed(1)} ({(product.review_count || 0).toLocaleString()})
              </span>
            </span>
          )}
        </div>

        {/* ── Price row — BOLD, large, consistent colors ──────────────── */}
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#2c3340]">
          {/* Cost — ALWAYS orange */}
          <div>
            <p className="text-[9px] text-[#6b7280] uppercase tracking-widest font-semibold mb-1">Cost</p>
            <p className="text-[17px] font-extrabold text-orange-400 tracking-tight leading-none">
              {formatPrice(product.cost_price)}
            </p>
          </div>
          {/* Sell — ALWAYS white/bright */}
          <div>
            <p className="text-[9px] text-[#6b7280] uppercase tracking-widest font-semibold mb-1">Sell</p>
            <p className="text-[17px] font-extrabold text-[#e8eaed] tracking-tight leading-none">
              {formatPrice(product.retail_price)}
            </p>
          </div>
          {/* Profit — color changes: cyan if ≥30%, red if <30% */}
          <div className="text-right">
            <p className="text-[9px] text-[#6b7280] uppercase tracking-widest font-semibold mb-1">Profit</p>
            <p className={`text-[19px] font-extrabold tracking-tight leading-none ${profitBadge.className}`}>
              {profitBadge.label}
            </p>
          </div>
        </div>

        {/* ── Sync status row ────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-2 border-t border-[#2c3340]">
          <div className="flex items-center gap-2">
            {/* Shopify sync indicator */}
            <span className={`flex items-center gap-1.5 text-[10px] font-semibold ${
              isSynced ? 'text-green-400' : 'text-[#6b7280]'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isSynced ? 'bg-green-500' : 'bg-[#3a4250]'}`} />
              {isSynced ? 'Synced' : 'Not synced'}
            </span>
            {/* Google Shopping status badge — Spec Item 32 */}
            <GoogleStatusBadge product={product} compact />
          </div>

          {/* Source / category */}
          {product.category && (
            <span className="text-[10px] text-[#6b7280] truncate max-w-[100px]">
              {product.category}
            </span>
          )}
        </div>

        {/* ── Error display ──────────────────────────────────────────── */}
        {actionError && (
          <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1.5 rounded">
            {actionError}
          </div>
        )}

        {/* ── Action buttons — BIG, prominent CTAs ───────────────────── */}
        <div className="flex items-center gap-2 pt-2 border-t border-[#2c3340]">
          {isNegativeProfit ? (
            <>
              <button
                onClick={() => handleAction('refresh', onRefresh)}
                disabled={!!activeAction}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[12px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 rounded-lg transition-all disabled:opacity-50"
                title="Reprice this product"
              >
                {activeAction === 'refresh' ? (
                  <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                ) : '⚠ Reprice'}
              </button>
              <button
                onClick={() => handleAction('remove', onRemove)}
                disabled={!!activeAction}
                className="flex items-center justify-center w-10 h-10 text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 rounded-lg transition-all disabled:opacity-50"
                title="Remove product"
              >
                {activeAction === 'remove' ? (
                  <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            </>
          ) : (
            <>
              {onSyncShopify && (
                <button
                  onClick={() => handleAction('sync', onSyncShopify)}
                  disabled={!!activeAction}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-[12px] font-bold rounded-lg transition-all disabled:opacity-50 ${
                    isSynced
                      ? 'text-green-400 bg-green-500/10 border border-green-500/20 hover:bg-green-500/20'
                      : 'text-[#1a1a1a] bg-[#96bf48] hover:bg-[#a8d450] shadow-sm'
                  }`}
                  title={isSynced ? 'Re-sync to Shopify' : 'Push to Shopify'}
                >
                  {activeAction === 'sync' ? (
                    <div className={`w-3.5 h-3.5 border-2 ${isSynced ? 'border-green-400' : 'border-[#1a1a1a]'} border-t-transparent rounded-full animate-spin`} />
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  )}
                  {isSynced ? '↻ Synced' : '🛒 Shopify'}
                </button>
              )}

              <button
                onClick={() => onViewDetails(product)}
                className="flex items-center justify-center w-10 h-10 text-[#8b919c] hover:text-cyan-400 bg-[#222832] border border-[#2c3340] hover:border-cyan-500/30 rounded-lg transition-all"
                title="View details"
                aria-label={`View ${product.title}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProductCard;

