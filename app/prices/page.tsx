'use client';

// app/prices/page.tsx
// COMPLETE Price Intelligence Page - Dashboard for monitoring prices,
// analyzing competitors, tracking margins, and managing alerts

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useReducer,
} from 'react';
import type { 
  Product, 
  ProductSource, 
  ProductStatus, 
  LifecycleStatus, 
  ProfitStatus,
  PriceAlert, 
  ApiResponse 
} from '@/types';
import type { ApiError } from '@/types/errors';
import { PriceIntelligencePanel } from '@/components/price-intelligence/PriceIntelligencePanel';
import { FeatureStatusBanner } from '@/components/ui/FeatureStatusBanner';
import { PageHealthCheck } from '@/components/ui/PageHealthCheck';
import { AISuggestionBot } from '@/components/ai-assistant/AISuggestionBot';
import { PRICING_RULES } from '@/lib/config/pricing-rules';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface PageState {
  products: Product[];
  isLoading: boolean;
  error: ApiError | null;
  lastRefresh: string | null;
  isRefreshing: boolean;
}

type PageAction =
  | { type: 'SET_PRODUCTS'; payload: Product[] }
  | { type: 'UPDATE_PRODUCT'; payload: Product }
  | { type: 'BULK_UPDATE'; payload: Product[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_REFRESHING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: ApiError | null };

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const MARGIN_THRESHOLD = PRICING_RULES.profitThresholds.minimum;
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ═══════════════════════════════════════════════════════════════════════════
// REDUCER
// ═══════════════════════════════════════════════════════════════════════════

const initialState: PageState = {
  products: [],
  isLoading: true,
  error: null,
  lastRefresh: null,
  isRefreshing: false,
};

function pageReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case 'SET_PRODUCTS':
      return {
        ...state,
        products: action.payload,
        isLoading: false,
        lastRefresh: new Date().toISOString(),
      };

    case 'UPDATE_PRODUCT':
      return {
        ...state,
        products: state.products.map(p =>
          p.id === action.payload.id ? action.payload : p
        ),
      };

    case 'BULK_UPDATE': {
      const updateMap = new Map(action.payload.map(p => [p.id, p]));
      return {
        ...state,
        products: state.products.map(p => updateMap.get(p.id) || p),
      };
    }

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_REFRESHING':
      return { ...state, isRefreshing: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };

    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════════════════

function generateMockProducts(count: number): Product[] {
  const categories = ['Electronics', 'Home & Kitchen', 'Beauty', 'Health', 'Sports', 'Toys', 'Garden'];

  return Array.from({ length: count }, (_, i) => {
    const costPrice = 10 + Math.random() * 40;
    const markup = 1.5 + Math.random() * 0.8; // 50% to 130% markup
    const retailPrice = costPrice * markup;
    const profitPercent = ((retailPrice - costPrice) / retailPrice) * 100;
    const lastCheck = Math.random() > 0.15
      ? new Date(Date.now() - Math.random() * 21 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    return {
      id: `prod-${i + 1}`,
      shopify_product_id: null,
      title: `Product ${i + 1} - ${categories[i % categories.length]} Item with Detailed Description`,
      handle: null,
      source: 'manual' as ProductSource,
      source_product_id: null,
      source_url: null,
      cost_price: costPrice,
      retail_price: retailPrice,
      member_price: null,
      amazon_display_price: retailPrice * (1.1 + Math.random() * 0.2),
      costco_display_price: retailPrice * (1.05 + Math.random() * 0.15),
      ebay_display_price: retailPrice * (0.98 + Math.random() * 0.1),
      sams_display_price: retailPrice * (1.08 + Math.random() * 0.18),
      compare_at_price: retailPrice * 1.2,
      profit_amount: retailPrice - costPrice,
      profit_percent: profitPercent,
      profit_status: profitPercent > MARGIN_THRESHOLD ? 'profitable' as ProfitStatus : 'below_threshold' as ProfitStatus,
      category: categories[i % categories.length],
      vendor: null,
      product_type: null,
      tags: null,
      rating: 3.5 + Math.random() * 1.5,
      review_count: Math.floor(100 + Math.random() * 5000),
      is_prime: Math.random() > 0.3,
      image_url: `https://picsum.photos/seed/price${i}/200/200`,
      inventory_quantity: Math.floor(10 + Math.random() * 100),
      status: Math.random() > 0.1 ? 'active' as ProductStatus : 'paused' as ProductStatus,
      lifecycle_status: 'active' as LifecycleStatus,
      below_threshold_since: null,
      created_at: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      synced_at: lastCheck,
      last_price_check: lastCheck,
      admin_override: false,
      admin_override_by: null,
      admin_override_at: null,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function PageHeader({
  productCount,
  alertCount,
  lastRefresh,
  onRefreshAll,
  isRefreshing,
}: {
  productCount: number;
  alertCount: number;
  lastRefresh: string | null;
  onRefreshAll: () => void;
  isRefreshing: boolean;
}) {
  return (
    <div className="mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Price Intelligence</h1>
          <p className="text-gray-500 mt-1">
            Monitor prices, track margins, and stay competitive
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Last Refresh */}
          {lastRefresh && (
            <span className="text-sm text-gray-500">
              Last updated: {new Date(lastRefresh).toLocaleTimeString()}
            </span>
          )}

          {/* Alerts Indicator */}
          {alertCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-full text-sm font-medium">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {alertCount} alerts
            </span>
          )}

          {/* Refresh Button */}
          <button
            onClick={onRefreshAll}
            disabled={isRefreshing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isRefreshing ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Refreshing...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh All Prices
              </>
            )}
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <QuickStatCard
          label="Total Products"
          value={productCount}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
          color="blue"
        />
        <QuickStatCard
          label="Active Alerts"
          value={alertCount}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          }
          color="red"
        />
        <QuickStatCard
          label="Below Threshold"
          value={0}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
            </svg>
          }
          color="yellow"
          subtext={`< ${MARGIN_THRESHOLD}% margin`}
        />
        <QuickStatCard
          label="Avg. Margin"
          value={`0%`}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
          color="green"
        />
      </div>
    </div>
  );
}

function QuickStatCard({
  label,
  value,
  icon,
  color,
  subtext,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'yellow' | 'red';
  subtext?: string;
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {subtext && (
            <p className="text-xs text-gray-400 mt-0.5">{subtext}</p>
          )}
        </div>
        <div className={`p-3 rounded-full ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-64 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="h-10 w-40 bg-gray-200 rounded animate-pulse" />
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-200 rounded-lg animate-pulse" />
        ))}
      </div>

      {/* Panel skeleton */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="h-14 bg-gray-100 border-b border-gray-200" />
        <div className="h-12 bg-gray-50 border-b border-gray-200" />
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-7 gap-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
          <div className="h-96 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry: () => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
      <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to Load Price Data</h3>
      <p className="text-gray-600 mb-4">{error.message}</p>
      {error.suggestion && (
        <p className="text-sm text-gray-500 mb-4">{error.suggestion}</p>
      )}
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        Try Again
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
      <div className="w-20 h-20 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-6">
        <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">No Products to Analyze</h3>
      <p className="text-gray-600 mb-6 max-w-md mx-auto">
        Import products first to start monitoring prices and analyzing competitor data.
      </p>
      <a
        href="/products"
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium inline-flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        Go to Products
      </a>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function PricesPage() {
  const [state, dispatch] = useReducer(pageReducer, initialState);

  // Calculate alerts count (products below margin threshold)
  const alertCount = useMemo(() => {
    return state.products.filter(p => (p.profit_percent ?? 0) < MARGIN_THRESHOLD).length;
  }, [state.products]);

  // Calculate average margin
  const avgMargin = useMemo(() => {
    if (state.products.length === 0) return 0;
    const total = state.products.reduce((sum, p) => sum + (p.profit_percent ?? 0), 0);
    return total / state.products.length;
  }, [state.products]);

  // ─────────────────────────────────────────────────────────────────────────
  // DATA FETCHING
  // ─────────────────────────────────────────────────────────────────────────

  const fetchProducts = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      // Fetch all products - don't filter by status initially
      const response = await fetch('/api/products?limit=1000');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch products: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'API request failed');
      }

      // Use products directly - Price Intelligence can track and analyze any product
      // Pricing data will be fetched and populated by the sync jobs
      // result.data is an object with { products: [...], total: ..., etc. }
      const products: Product[] = result.data?.products || (Array.isArray(result.data) ? result.data : []);

      dispatch({ type: 'SET_PRODUCTS', payload: products });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      dispatch({
        type: 'SET_ERROR',
        payload: {
          code: 'PRICE_FETCH_ERROR',
          message: 'Failed to load products',
          details: errorMessage,
          severity: 'error',
          suggestion: 'Check your network connection and try refreshing',
          blocking: false,
        },
      });
    }
  }, []);

  const handleRefreshAll = useCallback(async () => {
    dispatch({ type: 'SET_REFRESHING', payload: true });

    try {
      // Get all product IDs to sync
      const productIds = state.products.map(p => p.id).filter(Boolean);
      
      console.log('Refreshing prices for products:', { 
        totalProducts: state.products.length, 
        productIdsCount: productIds.length,
        sampleIds: productIds.slice(0, 3),
      });

      if (!productIds || productIds.length === 0) {
        throw new Error('No products found to sync. Make sure you have products loaded.');
      }
      
      // Call the real sync API
      const response = await fetch('/api/prices?action=sync-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ productIds }),
      });

      if (!response.ok) {
        throw new Error(`Failed to sync prices: ${response.statusText}`);
      }

      const result = await response.json();
      
      console.log('Sync result:', result);
      
      if (!result.success) {
        throw new Error(result.error || 'Sync failed');
      }

      // Refresh the products data after sync
      await fetchProducts();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Refresh error:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: {
          code: 'REFRESH_001',
          message: 'Failed to refresh prices',
          details: errorMessage,
          suggestion: 'Try again in a few moments',
        } as ApiError,
      });
    } finally {
      dispatch({ type: 'SET_REFRESHING', payload: false });
    }
  }, [fetchProducts, state.products]);

  // Initial fetch
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const handleProductUpdate = useCallback((product: Product) => {
    dispatch({ type: 'UPDATE_PRODUCT', payload: product });
  }, []);

  const handleBulkUpdate = useCallback((products: Product[]) => {
    dispatch({ type: 'BULK_UPDATE', payload: products });
  }, []);

  const handleApplySuggestion = useCallback(async (suggestion: any) => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('Applied suggestion:', suggestion);
  }, []);

  const handleProductAction = useCallback(async (action: string, productIds: string[]) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('Product action:', action, productIds);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {state.error && !state.isLoading && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <p className="font-medium">{state.error.message}</p>
          {state.error.details && <p className="text-sm mt-1">{state.error.details}</p>}
          {state.error.suggestion && <p className="text-sm mt-1">{state.error.suggestion}</p>}
          <button
            onClick={() => dispatch({ type: 'SET_ERROR', payload: null })}
            className="mt-2 text-sm underline"
          >
            Dismiss
          </button>
        </div>
      )}

        {/* Loading State */}
        {state.isLoading && (
          <LoadingState />
        )}

        {/* Error State */}
        {state.error && !state.isLoading && state.products.length === 0 && (
          <ErrorState error={state.error} onRetry={fetchProducts} />
        )}

        {/* Empty State */}
        {!state.isLoading && !state.error && state.products.length === 0 && (
          <EmptyState />
        )}

        {/* Main Content */}
        {!state.isLoading && state.products.length > 0 && (
          <>
            <PageHeader
              productCount={state.products.length}
              alertCount={alertCount}
              lastRefresh={state.lastRefresh}
              onRefreshAll={handleRefreshAll}
              isRefreshing={state.isRefreshing}
            />

            <PriceIntelligencePanel
              products={state.products}
              onProductUpdate={handleProductUpdate}
              onBulkUpdate={handleBulkUpdate}
            />
          </>
        )}

        {/* AI Assistant */}
        <AISuggestionBot
          products={state.products}
          onApplySuggestion={handleApplySuggestion}
          onProductAction={handleProductAction}
        />
      </div>
  );
}
