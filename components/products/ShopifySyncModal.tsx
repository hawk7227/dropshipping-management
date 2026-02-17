'use client';

// components/products/ShopifySyncModal.tsx
// ═══════════════════════════════════════════════════════════════════════════
// SHOPIFY SYNC CONFIRMATION MODAL — Spec Item 16
// Shows pricing rules preview before syncing products to Shopify
// ═══════════════════════════════════════════════════════════════════════════
// Features:
// - Product count + pricing summary
// - Pricing rules breakdown with live example from PRICING_RULES
// - Competitor price preview with ranges
// - Metafield list that gets pushed
// - Loading spinner during sync
// - Success/error result display
// - Escape key + backdrop click to close
// - Disabled close during sync
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { PRICING_RULES, COMPETITOR_NAMES } from '@/lib/config/pricing-rules';
import type { Product } from '@/types';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ShopifySyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  products: Product[];
  selectedIds?: Set<string>;
}

type SyncPhase = 'preview' | 'syncing' | 'success' | 'error';

interface SyncResult {
  synced: number;
  errors: string[];
  message: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// INLINE SVG ICONS
// ═══════════════════════════════════════════════════════════════════════════

const Icons = {
  X: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  ShoppingBag: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  ),
  Check: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  AlertTriangle: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  ArrowRight: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  ),
  DollarSign: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `$${n.toFixed(2)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ShopifySyncModal({ isOpen, onClose, onConfirm, products, selectedIds }: ShopifySyncModalProps) {
  const [phase, setPhase] = useState<SyncPhase>('preview');
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Products to sync: selected subset or all
  const syncProducts = selectedIds && selectedIds.size > 0
    ? products.filter(p => selectedIds.has(p.id))
    : products;

  const syncCount = syncProducts.length;
  const withPricing = syncProducts.filter(p => p.cost_price && p.retail_price).length;
  const withoutPricing = syncCount - withPricing;
  const avgCost = syncCount > 0
    ? syncProducts.reduce((s, p) => s + (p.cost_price || 0), 0) / syncCount
    : 0;

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setPhase('preview');
      setSyncResult(null);
      setError(null);
    }
  }, [isOpen]);

  // Escape key to close (except during sync)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'syncing') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
    }
  }, [isOpen, phase, onClose]);

  // Backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current && phase !== 'syncing') onClose();
  };

  // Execute sync
  const handleSync = async () => {
    setPhase('syncing');
    setError(null);
    console.log('[ShopifySyncModal] Starting Shopify sync for', syncCount, 'products');
    try {
      const productIds = syncProducts.map(p => p.id);
      const res = await fetch('/api/products?action=sync-shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          productIds,
          fullSync: !selectedIds || selectedIds.size === 0 
        }),
      });
      const data = await res.json();
      console.log('[ShopifySyncModal] Sync response:', data);
      if (res.ok && data.success) {
        setSyncResult(data.data || { synced: 0, errors: [], message: 'Sync completed' });
        setPhase('success');
        onConfirm();
      } else {
        setError(data.error?.message || data.error?.details || data.error || 'Sync failed');
        setPhase('error');
      }
    } catch (err) {
      console.error('[ShopifySyncModal] Sync error:', err);
      setError(err instanceof Error ? err.message : 'Network error');
      setPhase('error');
    }
  };

  if (!isOpen) return null;

  const rules = PRICING_RULES;
  const exampleYourPrice = avgCost * rules.yourMarkup.multiplier;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Shopify sync confirmation"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Icons.ShoppingBag className="w-5 h-5 text-green-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {phase === 'success' ? 'Sync Complete' : phase === 'error' ? 'Sync Failed' : 'Push to Shopify'}
              </h2>
              <p className="text-sm text-gray-500">
                {phase === 'preview' && `${syncCount} product${syncCount !== 1 ? 's' : ''} will be synced`}
                {phase === 'syncing' && 'Syncing products to Shopify...'}
                {phase === 'success' && `${syncResult?.synced ?? 0} products synced`}
                {phase === 'error' && 'Something went wrong'}
              </p>
            </div>
          </div>
          {phase !== 'syncing' && (
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors" aria-label="Close">
              <Icons.X />
            </button>
          )}
        </div>

        {/* ── Body ────────────────────────────────────────────── */}
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">

          {/* PREVIEW PHASE */}
          {phase === 'preview' && (
            <div className="space-y-5">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <p className="text-xl font-bold text-gray-900">{syncCount}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Total Products</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <p className="text-xl font-bold text-green-700">{withPricing}</p>
                  <p className="text-xs text-gray-500 mt-0.5">With Pricing</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <p className={`text-xl font-bold ${withoutPricing > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{withoutPricing}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Missing Prices</p>
                </div>
              </div>

              {/* Pricing Rules */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                  <Icons.DollarSign className="w-4 h-4 text-gray-500" />
                  <h3 className="text-sm font-semibold text-gray-800">Pricing Rules Applied on Sync</h3>
                </div>
                <div className="p-4 space-y-3 text-sm">
                  {/* Your markup */}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Your Markup</span>
                    <span className="font-medium text-gray-900">{rules.yourMarkup.multiplier}x ({rules.yourMarkup.description})</span>
                  </div>

                  {/* Competitor ranges */}
                  <div className="border-t border-gray-100 pt-3">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Competitor Display Prices</p>
                    <div className="space-y-1.5">
                      {Object.entries(rules.competitors.ranges).map(([key, range]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-gray-600">{COMPETITOR_NAMES[key as keyof typeof COMPETITOR_NAMES]}</span>
                          <span className="text-gray-500">{((range.min - 1) * 100).toFixed(0)}–{((range.max - 1) * 100).toFixed(0)}% higher</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Example */}
                  {avgCost > 0 && (
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Example (avg cost {formatPrice(avgCost)})</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-1 bg-gray-100 rounded text-gray-700">Cost: {formatPrice(avgCost)}</span>
                        <Icons.ArrowRight className="w-3 h-3 text-gray-400" />
                        <span className="px-2 py-1 bg-blue-100 rounded text-blue-700 font-medium">Yours: {formatPrice(exampleYourPrice)}</span>
                        <Icons.ArrowRight className="w-3 h-3 text-gray-400" />
                        <span className="px-2 py-1 bg-orange-100 rounded text-orange-700">
                          Amazon: {formatPrice(exampleYourPrice * rules.competitors.ranges.amazon.min)}–{formatPrice(exampleYourPrice * rules.competitors.ranges.amazon.max)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Profit threshold */}
                  <div className="border-t border-gray-100 pt-3 flex items-center gap-2">
                    <Icons.AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <span className="text-gray-600">
                      Below {rules.profitThresholds.minimum}% margin = alert. Auto-pause after {rules.profitThresholds.gracePeriodDays} days.
                    </span>
                  </div>
                </div>
              </div>

              {/* What gets pushed */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <p className="font-medium">What gets pushed to Shopify:</p>
                <ul className="mt-1 ml-4 list-disc text-blue-700 space-y-0.5">
                  <li>Product title, description, images, price</li>
                  <li>Metafields: ASIN, cost, profit %, Amazon URL</li>
                  <li>Competitor display prices (Amazon, Costco, eBay, Sam{"'"}s)</li>
                  <li>Compare-at price (highest competitor for strikethrough)</li>
                </ul>
              </div>
            </div>
          )}

          {/* SYNCING PHASE */}
          {phase === 'syncing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 border-4 border-green-200 border-t-green-600 rounded-full animate-spin" />
              <p className="mt-4 text-sm font-medium text-gray-700">Pushing {syncCount} products to Shopify...</p>
              <p className="text-xs text-gray-400 mt-1">This may take a few minutes for large catalogs</p>
            </div>
          )}

          {/* SUCCESS PHASE */}
          {phase === 'success' && syncResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="p-2 bg-green-100 rounded-full">
                  <Icons.Check className="w-5 h-5 text-green-700" />
                </div>
                <div>
                  <p className="font-medium text-green-900">{syncResult.message}</p>
                  <p className="text-sm text-green-700 mt-0.5">{syncResult.synced} products synced to Shopify</p>
                </div>
              </div>
              {syncResult.errors.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm font-medium text-amber-800">{syncResult.errors.length} error{syncResult.errors.length !== 1 ? 's' : ''} during sync:</p>
                  <ul className="mt-1 text-xs text-amber-700 space-y-0.5 max-h-32 overflow-y-auto">
                    {syncResult.errors.slice(0, 10).map((err, i) => (
                      <li key={i} className="truncate">{err}</li>
                    ))}
                    {syncResult.errors.length > 10 && (
                      <li className="font-medium text-amber-600">...and {syncResult.errors.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ERROR PHASE */}
          {phase === 'error' && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <Icons.AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Sync Failed</p>
                <p className="text-sm text-red-700 mt-0.5">{error}</p>
                <p className="text-xs text-red-500 mt-2">Check Shopify credentials and connection settings</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          {phase === 'preview' && (
            <>
              <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSync}
                disabled={syncCount === 0}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 active:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                <Icons.ShoppingBag className="w-4 h-4" />
                Push {syncCount} Product{syncCount !== 1 ? 's' : ''} to Shopify
              </button>
            </>
          )}
          {phase === 'syncing' && (
            <p className="text-xs text-gray-400">Please wait — do not close this window</p>
          )}
          {(phase === 'success' || phase === 'error') && (
            <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-white bg-gray-700 rounded-lg hover:bg-gray-800 transition-colors">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ShopifySyncModal;
