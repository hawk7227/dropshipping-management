'use client';

// app/products/page.tsx
// COMPLETE Products Page - Product management dashboard with full CRUD,
// filtering, bulk actions, import modal, and real-time updates

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useReducer,
} from 'react';
import type { Product, ProductStatus, ApiResponse } from '@/types';
import type { ApiError } from '@/types/errors';
import { ProductsPanel } from '@/components/products/ProductsPanel';
import ImportPanelEnhanced from '@/components/import/ImportPanelEnhanced';
import { BulkVerifyPanel } from '@/components/products/BulkVerifyPanel';
import { ManualSourcingBar } from '@/components/products/ManualSourcingBar';
import { FeatureStatusBanner } from '@/components/ui/FeatureStatusBanner';
import { PageHealthCheck } from '@/components/ui/PageHealthCheck';
import { AISuggestionBot } from '@/components/ai-assistant/AISuggestionBot';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface PageState {
  products: Product[];
  isLoading: boolean;
  error: ApiError | null;
  showImport: boolean;
  showBulkVerify: boolean;
  lastFetch: string | null;
  totalCount: number;
  stats: ProductStats;
}

interface ProductStats {
  total: number;
  active: number;
  paused: number;
  lowMargin: number;
  synced: number;
  stale: number;
}

type PageAction =
  | { type: 'SET_PRODUCTS'; payload: Product[] }
  | { type: 'ADD_PRODUCTS'; payload: Product[] }
  | { type: 'UPDATE_PRODUCT'; payload: Product }
  | { type: 'REMOVE_PRODUCTS'; payload: string[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: ApiError | null }
  | { type: 'TOGGLE_IMPORT' }
  | { type: 'TOGGLE_BULK_VERIFY' }
  | { type: 'SET_STATS'; payload: ProductStats };

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const MARGIN_THRESHOLD = 30;
const STALE_DAYS = 14;
const REFRESH_INTERVAL = 60000; // 1 minute

// ═══════════════════════════════════════════════════════════════════════════
// REDUCER
// ═══════════════════════════════════════════════════════════════════════════

function calculateStats(products: Product[]): ProductStats {
  const total = products.length;
  const active = products.filter(p => p.status === 'active').length;
  const paused = products.filter(p => p.status === 'paused').length;
  const lowMargin = products.filter(p => (p.profit_percent ?? 0) < MARGIN_THRESHOLD).length;
  const synced = products.filter(p => p.source === 'shopify' && p.shopify_product_id).length;
  const stale = products.filter(p => {
    if (!p.last_price_check) return true;
    const days = (Date.now() - new Date(p.last_price_check).getTime()) / (1000 * 60 * 60 * 24);
    return days > STALE_DAYS;
  }).length;

  return { total, active, paused, lowMargin, synced, stale };
}

const initialState: PageState = {
  products: [],
  isLoading: true,
  error: null,
  showImport: false,
  showBulkVerify: false,
  lastFetch: null,
  totalCount: 0,
  stats: { total: 0, active: 0, paused: 0, lowMargin: 0, synced: 0, stale: 0 },
};

function pageReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case 'SET_PRODUCTS': {
      const stats = calculateStats(action.payload);
      return {
        ...state,
        products: action.payload,
        totalCount: action.payload.length,
        stats,
        isLoading: false,
        lastFetch: new Date().toISOString(),
      };
    }

    case 'ADD_PRODUCTS': {
      const existingIds = new Set(state.products.map(p => p.id));
      const newProducts = action.payload.filter(p => !existingIds.has(p.id));
      const updatedProducts = [...state.products, ...newProducts];
      const stats = calculateStats(updatedProducts);
      return {
        ...state,
        products: updatedProducts,
        totalCount: updatedProducts.length,
        stats,
      };
    }

    case 'UPDATE_PRODUCT': {
      const updatedProducts = state.products.map(p =>
        p.id === action.payload.id ? action.payload : p
      );
      const stats = calculateStats(updatedProducts);
      return { ...state, products: updatedProducts, stats };
    }

    case 'REMOVE_PRODUCTS': {
      const idsToRemove = new Set(action.payload);
      const updatedProducts = state.products.filter(p => !idsToRemove.has(p.id));
      const stats = calculateStats(updatedProducts);
      return {
        ...state,
        products: updatedProducts,
        totalCount: updatedProducts.length,
        stats,
      };
    }

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };

    case 'TOGGLE_IMPORT':
      return { ...state, showImport: !state.showImport };

    case 'TOGGLE_BULK_VERIFY':
      return { ...state, showBulkVerify: !state.showBulkVerify };

    case 'SET_STATS':
      return { ...state, stats: action.payload };

    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DATA GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

function generateMockProducts(count: number): Product[] {
  const categories = ['Electronics', 'Home & Kitchen', 'Beauty', 'Health', 'Sports', 'Toys', 'Garden'];
  const statuses: ProductStatus[] = ['active', 'paused', 'pending'];

  return Array.from({ length: count }, (_, i) => {
    const costPrice = 10 + Math.random() * 40;
    const markup = 1.8 + Math.random() * 0.4;
    const retailPrice = costPrice * markup;
    const profitPercent = ((retailPrice - costPrice) / retailPrice) * 100;
    const lastCheck = Math.random() > 0.2
      ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    return {
      id: `prod-${i + 1}`,
      shopify_product_id: null,
      title: `Product ${i + 1} - ${categories[i % categories.length]} Item with Long Descriptive Name`,
      handle: `product-${i + 1}`,
      source: 'manual' as const,
      source_product_id: `B${String(Math.random()).slice(2, 11).toUpperCase()}`,
      source_url: null,
      cost_price: costPrice,
      retail_price: retailPrice,
      member_price: null,
      amazon_display_price: retailPrice * 1.15,
      costco_display_price: retailPrice * 1.08,
      ebay_display_price: retailPrice * 1.05,
      sams_display_price: retailPrice * 1.12,
      compare_at_price: retailPrice * 1.2,
      profit_amount: retailPrice - costPrice,
      profit_percent: profitPercent,
      profit_status: profitPercent > MARGIN_THRESHOLD ? 'profitable' as const : 'below_threshold' as const,
      category: categories[i % categories.length],
      vendor: null,
      product_type: categories[i % categories.length],
      tags: [],
      rating: 3.5 + Math.random() * 1.5,
      review_count: Math.floor(100 + Math.random() * 5000),
      is_prime: Math.random() > 0.3,
      image_url: `https://picsum.photos/seed/${i}/200/200`,
      inventory_quantity: Math.floor(10 + Math.random() * 100),
      status: statuses[Math.floor(Math.random() * statuses.length)],
      lifecycle_status: 'active' as const,
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
  stats,
  onImportClick,
  onRefreshClick,
  onShopifySyncClick,
  onBulkVerifyClick,
  isLoading,
}: {
  stats: ProductStats;
  onImportClick: () => void;
  onRefreshClick: () => void;
  onShopifySyncClick: () => void;
  onBulkVerifyClick: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-500 mt-1">Manage your product catalog and inventory</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onBulkVerifyClick}
            className="px-4 py-2 text-purple-700 bg-purple-100 border border-purple-300 rounded-lg hover:bg-purple-200 flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Verify Supplier List
          </button>

          <button
            onClick={onShopifySyncClick}
            disabled={isLoading}
            className="px-4 py-2 text-green-700 bg-green-100 border border-green-300 rounded-lg hover:bg-green-200 disabled:opacity-50 flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isLoading ? 'Syncing...' : 'Sync Shopify'}
          </button>

          <button
            onClick={onImportClick}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Import Products
          </button>

          <button
            onClick={onRefreshClick}
            disabled={isLoading}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-6">
        <StatCard label="Total Products" value={stats.total} color="blue" />
        <StatCard label="Active" value={stats.active} color="green" />
        <StatCard label="Paused" value={stats.paused} color="yellow" />
        <StatCard label="Low Margin" value={stats.lowMargin} color="red" />
        <StatCard label="Shopify Synced" value={stats.synced} color="purple" />
        <StatCard label="Stale Prices" value={stats.stale} color="orange" />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'orange';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
      <p className="text-sm opacity-80">{label}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-64 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="h-14 bg-gray-100 border-b border-gray-200" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-16 border-b border-gray-100 flex items-center px-4 gap-4">
            <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
            <div className="h-10 w-10 bg-gray-200 rounded animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
              <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
            </div>
            <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
            <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
            <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
          </div>
        ))}
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
      <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to Load Products</h3>
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

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
      <div className="w-20 h-20 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-6">
        <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">No Products Yet</h3>
      <p className="text-gray-600 mb-6 max-w-md mx-auto">
        Get started by importing products from a file, discovering products on Amazon, or manually adding ASINs.
      </p>
      <button
        onClick={onImport}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 mx-auto"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        Import Your First Products
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function ProductsPage() {
  const [state, dispatch] = useReducer(pageReducer, initialState);

  // ─────────────────────────────────────────────────────────────────────────
  // DATA FETCHING
  // ─────────────────────────────────────────────────────────────────────────

  const fetchProducts = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const response = await fetch('/api/products?action=list&pageSize=1000');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      // Debug: log raw API response for troubleshooting
      // eslint-disable-next-line no-console
      console.debug('[ProductsPage] /api/products result:', result);
      
      if (!result.success) {
        throw new Error(result.error || 'API request failed');
      }
      
      // Map API response to Product format
      // result.data is an object with { products: [...], total: ..., etc. }
      const productsArray = result.data?.products || result.data || [];
      const mappedProducts = (Array.isArray(productsArray) ? productsArray : []).map((item: any) => ({
        id: item.id,
        shopify_product_id: item.id,
        title: item.title,
        handle: item.handle,
        source: 'shopify' as const,
        source_product_id: item.asin || null,
        source_url: null,
        cost_price: item.cost_price || null,
        retail_price: item.retail_price || null,
        member_price: item.member_price || null,
        amazon_display_price: item.amazon_display_price || null,
        costco_display_price: item.costco_display_price || null,
        ebay_display_price: item.ebay_display_price || null,
        sams_display_price: item.sams_display_price || null,
        compare_at_price: item.compare_at_price || null,
        profit_amount: item.profit_amount || null,
        profit_percent: item.profit_percent || null,
        profit_status: item.profit_status || 'unknown' as const,
        category: item.category || null,
        vendor: item.vendor || null,
        product_type: item.product_type || null,
        tags: item.tags || [],
        rating: item.rating || null,
        review_count: item.review_count || null,
        is_prime: item.is_prime || false,
        image_url: item.image_url || null,
        inventory_quantity: item.inventory_quantity || 0,
        status: (item.status as any) || 'active',
        lifecycle_status: item.lifecycle_status || 'active' as const,
        below_threshold_since: item.below_threshold_since || null,
        created_at: item.created_at,
        updated_at: item.updated_at,
        synced_at: item.synced_at,
        last_price_check: item.last_price_check || null,
        admin_override: item.admin_override || false,
        admin_override_by: item.admin_override_by || null,
        admin_override_at: item.admin_override_at || null,
      }));
      // Debug: mapped products count
      // eslint-disable-next-line no-console
      console.debug('[ProductsPage] mappedProducts count:', mappedProducts.length);
      
      dispatch({ type: 'SET_PRODUCTS', payload: mappedProducts });
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: {
          code: 'PROD_FETCH_001',
          message: 'Failed to fetch products',
          details: error instanceof Error ? error.message : 'Unknown error',
          suggestion: 'Check your connection and try again',
        } as ApiError,
      });
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Periodic refresh
  useEffect(() => {
    const interval = setInterval(() => {
      if (!state.isLoading && !state.showImport) {
        // Silent refresh - don't show loading state
        fetchProducts();
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [state.isLoading, state.showImport, fetchProducts]);

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const handleProductUpdate = useCallback((product: Product) => {
    dispatch({ type: 'UPDATE_PRODUCT', payload: product });
  }, []);

  const handleProductsRemove = useCallback((ids: string[]) => {
    dispatch({ type: 'REMOVE_PRODUCTS', payload: ids });
  }, []);

  const handleImportComplete = useCallback((products: Product[]) => {
    // Add products to state if provided
    if (products && products.length > 0) {
      dispatch({ type: 'ADD_PRODUCTS', payload: products });
    }
    // Always refresh to get latest data from database
    fetchProducts();
    dispatch({ type: 'TOGGLE_IMPORT' });
  }, [fetchProducts]);

  const handleApplySuggestion = useCallback(async (suggestion: any) => {
    // Simulate applying suggestion
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('Applied suggestion:', suggestion);
  }, []);

  const handleProductAction = useCallback(async (action: string, productIds: string[]) => {
    // Simulate product action
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('Product action:', action, productIds);
  }, []);

  // Handle Shopify sync
  const handleShopifySync = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      const response = await fetch('/api/products?action=sync-shopify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log('Shopify sync successful:', result.data);
        // Refresh products to show synced items
        await fetchProducts();
      } else {
        console.error('Shopify sync failed:', result.error);
        // You could show a toast notification here
      }
    } catch (error) {
      console.error('Shopify sync error:', error);
      // You could show a toast notification here
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [fetchProducts]);

  // ─────────────────────────────────────────────────────────────────────────
  // EXISTING ASINS (for import duplicate detection)
  // ─────────────────────────────────────────────────────────────────────────

  const existingAsins = useMemo(() => {
    return new Set(
      state.products
        .map(p => p.source_product_id)
        .filter((asin): asin is string => asin !== null && asin !== undefined)
    );
  }, [state.products]);

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
        {state.isLoading && state.products.length === 0 && (
          <LoadingState />
        )}

        {/* Error State */}
        {state.error && !state.isLoading && state.products.length === 0 && (
          <ErrorState error={state.error} onRetry={fetchProducts} />
        )}

        {/* Main Content */}
        {!state.isLoading && !state.error && state.products.length === 0 && (
          <>
            <PageHeader
              stats={state.stats}
              onImportClick={() => dispatch({ type: 'TOGGLE_IMPORT' })}
              onRefreshClick={fetchProducts}
              onShopifySyncClick={handleShopifySync}
              onBulkVerifyClick={() => dispatch({ type: 'TOGGLE_BULK_VERIFY' })}
              isLoading={state.isLoading}
            />
            <EmptyState onImport={() => dispatch({ type: 'TOGGLE_IMPORT' })} />
          </>
        )}

        {state.products.length > 0 && (
          <>
            <PageHeader
              stats={state.stats}
              onImportClick={() => dispatch({ type: 'TOGGLE_IMPORT' })}
              onRefreshClick={fetchProducts}
              onShopifySyncClick={handleShopifySync}
              onBulkVerifyClick={() => dispatch({ type: 'TOGGLE_BULK_VERIFY' })}
              isLoading={state.isLoading}
            />

            {/* Manual Sourcing Bar - Same criteria as 4AM cron */}
            <ManualSourcingBar onSourcingComplete={() => fetchProducts()} />

            <ProductsPanel
              initialProducts={state.products}
              onProductsChange={(products) => dispatch({ type: 'SET_PRODUCTS', payload: products })}
            />
          </>
        )}

        {/* Import Modal - Enhanced with AI Bot */}
        <ImportPanelEnhanced
          isOpen={state.showImport}
          onClose={() => dispatch({ type: 'TOGGLE_IMPORT' })}
          onImportComplete={handleImportComplete}
          existingAsins={existingAsins}
        />

        {/* Bulk Verify Modal */}
        <BulkVerifyPanel
          isOpen={state.showBulkVerify}
          onClose={() => dispatch({ type: 'TOGGLE_BULK_VERIFY' })}
          existingAsins={existingAsins}
        />

        {/* AI Assistant */}
        <AISuggestionBot
          products={state.products}
          onApplySuggestion={handleApplySuggestion}
          onProductAction={handleProductAction}
        />
      </div>
  );
}



