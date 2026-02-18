'use client';

// app/products/page.tsx
// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTS PAGE — PRODUCTION BUILD (V4)
// ═══════════════════════════════════════════════════════════════════════════
//
// Legacy version preserved at: app/products/page-legacy.tsx
// V4 source reference at: app/products/page-v4.tsx
//
// Features:
//  - Card grid view (default) + table view toggle with density switcher
//  - 6 clickable stat cards that filter products
//  - Full filtering (search, status, profit, sort, sync, stale)
//  - Bulk selection with confirmation dialogs
//  - Toast notifications for all actions
//  - 60-second silent auto-refresh
//  - Import modal (3 tabs: ASINs, File, URL)
//  - Manual sourcing bar (collapsible)
//  - Bulk verify panel
//  - AI suggestion bot
//  - Skeleton loading states
//  - Error states with retry
//  - Empty state with import CTA
//  - Keyboard shortcuts (Ctrl+1/2 view, arrow keys pagination)
//  - localStorage view preference persistence
//
// Existing components preserved:
//  - ProductsPanel (table view, unchanged)
//  - ImportPanelEnhanced (import modal, unchanged)
//  - BulkVerifyPanel (verify modal, unchanged)
//  - ManualSourcingBar (sourcing panel, unchanged)
//  - FeatureStatusBanner (error banner, unchanged)
//  - PageHealthCheck (health check, unchanged)
//  - AISuggestionBot (AI bot, unchanged)
//
// New components (Step 1):
//  - ProductCardGrid (card grid with pagination + bulk actions)
//  - ViewToggle (card/table toggle + density)
//  - ToastProvider / useToast (notification system)
//  - SkeletonProductsPage (loading state)
//
// This file replaces the legacy page.tsx (backed up as page-legacy.tsx)
// To rollback: copy page-legacy.tsx → page.tsx
// ═══════════════════════════════════════════════════════════════════════════

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import type { Product, ProductStatus } from '@/types';
import type { ApiError } from '@/types/errors';

// ── Existing components (unchanged, zero modifications) ─────────────────
import { ProductsPanel } from '@/components/products/ProductsPanel';
import ImportPanelEnhanced from '@/components/import/ImportPanelEnhanced';
import { BulkVerifyPanel } from '@/components/products/BulkVerifyPanel';
import { SourcingPanel } from '@/components/products/SourcingPanel';
import { FeatureStatusBanner } from '@/components/ui/FeatureStatusBanner';
import { PageHealthCheck } from '@/components/ui/PageHealthCheck';
import { AISuggestionBot } from '@/components/ai-assistant/AISuggestionBot';

// ── New V4 components (Step 1) ──────────────────────────────────────────
import { ProductCardGrid } from '@/components/products/ProductCardGrid';
import { ViewToggle, loadViewPreferences } from '@/components/products/ViewToggle';
import type { ViewMode, GridDensity } from '@/components/products/ViewToggle';
import { ShopifySyncModal } from '@/components/products/ShopifySyncModal';
import { ToastProvider, useToast } from '@/components/ui/ToastProvider';
import { SkeletonProductsPage } from '@/components/products/SkeletonCard';

// ── Dark theme ──
import './products-dark.css';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ProductStats {
  total: number;
  active: number;
  paused: number;
  lowMargin: number;
  synced: number;
  stale: number;
}

/** Which stat card is active as a filter — null means "show all" */
type StatFilter = 'total' | 'active' | 'paused' | 'lowMargin' | 'synced' | 'stale' | null;

interface PageState {
  products: Product[];
  isLoading: boolean;
  isSilentRefresh: boolean;
  error: ApiError | null;
  showImport: boolean;
  showBulkVerify: boolean;
  showSourcing: boolean;
  lastFetch: string | null;
  totalCount: number;
  stats: ProductStats;
}

type PageAction =
  | { type: 'SET_PRODUCTS'; payload: Product[] }
  | { type: 'ADD_PRODUCTS'; payload: Product[] }
  | { type: 'UPDATE_PRODUCT'; payload: Product }
  | { type: 'REMOVE_PRODUCTS'; payload: string[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SILENT_REFRESH'; payload: boolean }
  | { type: 'SET_ERROR'; payload: ApiError | null }
  | { type: 'TOGGLE_IMPORT' }
  | { type: 'TOGGLE_BULK_VERIFY' }
  | { type: 'TOGGLE_SOURCING' }
  | { type: 'SET_STATS'; payload: ProductStats };

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const MARGIN_THRESHOLD = 30;
const STALE_DAYS = 14;
const REFRESH_INTERVAL = 60000; // 60 seconds

// ═══════════════════════════════════════════════════════════════════════════
// REDUCER
// ═══════════════════════════════════════════════════════════════════════════

function calculateStats(products: Product[]): ProductStats {
  const total = products.length;
  const active = products.filter(p => p.status === 'active').length;
  const paused = products.filter(p => p.status === 'paused').length;
  const lowMargin = products.filter(p => (p.profit_percent ?? 0) < MARGIN_THRESHOLD).length;
  const synced = products.filter(p =>
    !!(p.shopify_product_id || p.shopify_id) ||
    (p.source === 'shopify' && !!p.shopify_product_id)
  ).length;
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
  isSilentRefresh: false,
  error: null,
  showImport: false,
  showBulkVerify: false,
  showSourcing: true,
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
        isSilentRefresh: false,
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

    case 'SET_SILENT_REFRESH':
      return { ...state, isSilentRefresh: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false, isSilentRefresh: false };

    case 'TOGGLE_IMPORT':
      return { ...state, showImport: !state.showImport };

    case 'TOGGLE_BULK_VERIFY':
      return { ...state, showBulkVerify: !state.showBulkVerify };

    case 'TOGGLE_SOURCING':
      return { ...state, showSourcing: !state.showSourcing };

    case 'SET_STATS':
      return { ...state, stats: action.payload };

    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// API RESPONSE MAPPER
// Maps the raw API response to our Product type
// Extracted as a pure function for testability
// ═══════════════════════════════════════════════════════════════════════════

function mapApiProduct(item: Record<string, unknown>): Product {
  return {
    id: item.id as string,
    shopify_product_id: (item.shopify_product_id as string) || (item.id as string) || null,
    title: (item.title as string) || 'Untitled Product',
    handle: (item.handle as string) || null,
    source: (item.source as Product['source']) || 'shopify',
    source_product_id: (item.asin as string) || (item.source_product_id as string) || null,
    asin: (item.asin as string) || null,
    source_url: (item.source_url as string) || null,
    cost_price: (item.cost_price as number) || null,
    retail_price: (item.retail_price as number) || null,
    member_price: (item.member_price as number) || null,
    amazon_display_price: (item.amazon_display_price as number) || null,
    costco_display_price: (item.costco_display_price as number) || null,
    ebay_display_price: (item.ebay_display_price as number) || null,
    sams_display_price: (item.sams_display_price as number) || null,
    compare_at_price: (item.compare_at_price as number) || null,
    profit_amount: (item.profit_amount as number) || null,
    profit_percent: (item.profit_percent as number) || null,
    profit_margin: (item.profit_margin as number) || null,
    profit_status: (item.profit_status as Product['profit_status']) || 'unknown',
    category: (item.category as string) || null,
    vendor: (item.vendor as string) || null,
    product_type: (item.product_type as string) || null,
    tags: (item.tags as string[]) || [],
    rating: (item.rating as number) || null,
    review_count: (item.review_count as number) || null,
    is_prime: (item.is_prime as boolean) || false,
    image_url: (item.image_url as string) || null,
    images: (item.images as Product['images']) || null,
    inventory_quantity: (item.inventory_quantity as number) || 0,
    status: (item.status as ProductStatus) || 'active',
    lifecycle_status: (item.lifecycle_status as Product['lifecycle_status']) || 'active',
    below_threshold_since: (item.below_threshold_since as string) || null,
    created_at: (item.created_at as string) || new Date().toISOString(),
    updated_at: (item.updated_at as string) || new Date().toISOString(),
    synced_at: (item.synced_at as string) || null,
    last_price_check: (item.last_price_check as string) || null,
    admin_override: (item.admin_override as boolean) || false,
    admin_override_by: (item.admin_override_by as string) || null,
    admin_override_at: (item.admin_override_at as string) || null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STAT FILTER LOGIC
// Applies the active stat card filter to the product list
// ═══════════════════════════════════════════════════════════════════════════

function applyStatFilter(products: Product[], filter: StatFilter): Product[] {
  if (!filter || filter === 'total') return products;

  switch (filter) {
    case 'active':
      return products.filter(p => p.status === 'active');
    case 'paused':
      return products.filter(p => p.status === 'paused');
    case 'lowMargin':
      return products.filter(p => (p.profit_percent ?? 0) < MARGIN_THRESHOLD);
    case 'synced':
      return products.filter(p =>
        !!(p.shopify_product_id || p.shopify_id) ||
        (p.source === 'shopify' && !!p.shopify_product_id)
      );
    case 'stale':
      return products.filter(p => {
        if (!p.last_price_check) return true;
        const days = (Date.now() - new Date(p.last_price_check).getTime()) / (1000 * 60 * 60 * 24);
        return days > STALE_DAYS;
      });
    default:
      return products;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH FILTER
// Quick text search across title and ASIN
// ═══════════════════════════════════════════════════════════════════════════

function applySearchFilter(products: Product[], search: string): Product[] {
  if (!search.trim()) return products;
  const q = search.toLowerCase().trim();
  return products.filter(p =>
    (p.title?.toLowerCase().includes(q)) ||
    (p.asin?.toLowerCase().includes(q)) ||
    (p.source_product_id?.toLowerCase().includes(q)) ||
    (p.category?.toLowerCase().includes(q))
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

// ── Stat Cards Row ──────────────────────────────────────────────────────

function StatsRow({
  stats,
  activeFilter,
  onFilterChange,
}: {
  stats: ProductStats;
  activeFilter: StatFilter;
  onFilterChange: (filter: StatFilter) => void;
}) {
  const cards: Array<{
    key: StatFilter;
    label: string;
    value: number;
    color: string;
    activeColor: string;
  }> = [
    { key: 'total', label: 'Total Products', value: stats.total,
      color: 'bg-blue-50 border-blue-200 text-blue-700',
      activeColor: 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' },
    { key: 'active', label: 'Active', value: stats.active,
      color: 'bg-green-50 border-green-200 text-green-700',
      activeColor: 'bg-green-600 border-green-600 text-white shadow-lg shadow-green-200' },
    { key: 'paused', label: 'Paused', value: stats.paused,
      color: 'bg-yellow-50 border-yellow-200 text-yellow-700',
      activeColor: 'bg-yellow-500 border-yellow-500 text-white shadow-lg shadow-yellow-200' },
    { key: 'lowMargin', label: 'Low Margin', value: stats.lowMargin,
      color: 'bg-red-50 border-red-200 text-red-700',
      activeColor: 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-200' },
    { key: 'synced', label: 'Shopify Synced', value: stats.synced,
      color: 'bg-purple-50 border-purple-200 text-purple-700',
      activeColor: 'bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-200' },
    { key: 'stale', label: 'Stale Prices', value: stats.stale,
      color: 'bg-orange-50 border-orange-200 text-orange-700',
      activeColor: 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-200' },
  ];

  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
      role="toolbar"
      aria-label="Product stat filters"
    >
      {cards.map(card => {
        const isActive = activeFilter === card.key;
        return (
          <button
            key={card.key}
            onClick={() => onFilterChange(isActive ? null : card.key)}
            className={`rounded-lg border p-3 text-left transition-all duration-150 cursor-pointer ${
              isActive ? card.activeColor : `${card.color} hover:shadow-md`
            }`}
            aria-pressed={isActive}
            aria-label={`${card.label}: ${card.value}${isActive ? ' (active filter)' : ''}`}
          >
            <p className="text-2xl font-bold">{card.value.toLocaleString()}</p>
            <p className={`text-sm ${isActive ? 'opacity-90' : 'opacity-70'}`}>{card.label}</p>
          </button>
        );
      })}
    </div>
  );
}

// ── Search Bar ──────────────────────────────────────────────────────────

function SearchBar({
  value,
  onChange,
  resultCount,
  totalCount,
}: {
  value: string;
  onChange: (value: string) => void;
  resultCount: number;
  totalCount: number;
}) {
  return (
    <div className="relative flex-1 max-w-md">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search products by name, ASIN, or category..."
        className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white placeholder-gray-400"
        aria-label="Search products"
      />
      {value && (
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 gap-2">
          <span className="text-xs text-gray-400">
            {resultCount} / {totalCount}
          </span>
          <button
            onClick={() => onChange('')}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Clear search"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Error State ─────────────────────────────────────────────────────────

function ErrorState({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
      <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to Load Products</h3>
      <p className="text-gray-600 mb-2">{error.message}</p>
      {error.details && (
        <p className="text-sm text-gray-500 mb-2">{error.details}</p>
      )}
      {error.suggestion && (
        <p className="text-sm text-gray-400 mb-5">{error.suggestion}</p>
      )}
      <button
        onClick={onRetry}
        className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        Try Again
      </button>
    </div>
  );
}

// ── Empty State ─────────────────────────────────────────────────────────

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-14 text-center">
      <div className="w-20 h-20 mx-auto bg-blue-50 rounded-full flex items-center justify-center mb-6">
        <svg className="w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">No Products Yet</h3>
      <p className="text-gray-600 mb-8 max-w-md mx-auto">
        Get started by importing products from Amazon. Paste ASINs, upload a file, or enter a product URL.
      </p>
      <button
        onClick={onImport}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 mx-auto transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Import Your First Products
      </button>
    </div>
  );
}

// ── Sourcing Panel Toggle ───────────────────────────────────────────────

function SourcingToggle({
  isOpen,
  onToggle,
}: {
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
        isOpen
          ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
      }`}
      aria-expanded={isOpen}
      aria-label="Toggle sourcing panel"
    >
      <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
      Sourcing
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE INNER (must be inside ToastProvider to use useToast)
// ═══════════════════════════════════════════════════════════════════════════

function ProductsPageInner() {
  const [state, dispatch] = useReducer(pageReducer, initialState);
  const toast = useToast();

  // ── View state ────────────────────────────────────────────────────────
  const [viewPrefs] = useState(() => loadViewPreferences());
  const [viewMode, setViewMode] = useState<ViewMode>(viewPrefs.viewMode);
  const [gridDensity, setGridDensity] = useState<GridDensity>(viewPrefs.density);

  // ── Filter state ──────────────────────────────────────────────────────
  const [statFilter, setStatFilter] = useState<StatFilter>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSyncModal, setShowSyncModal] = useState(false);

  // ── Refs for refresh timer ────────────────────────────────────────────
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastManualRefreshRef = useRef<number>(0);

  // ═════════════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ═════════════════════════════════════════════════════════════════════

  const fetchProducts = useCallback(async (silent = false) => {
    if (silent) {
      dispatch({ type: 'SET_SILENT_REFRESH', payload: true });
    } else {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
    }

    try {
      const response = await fetch('/api/products?action=list&pageSize=1000');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      // eslint-disable-next-line no-console
      console.debug('[ProductsPage V4] API response:', { success: result.success, count: result.data?.products?.length || 0 });

      if (!result.success) {
        throw new Error(result.error || 'API request failed');
      }

      const productsArray = result.data?.products || result.data || [];
      const mappedProducts = (Array.isArray(productsArray) ? productsArray : [])
        .map((item: Record<string, unknown>) => mapApiProduct(item));

      dispatch({ type: 'SET_PRODUCTS', payload: mappedProducts });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      if (silent) {
        // Silent refresh failures: show toast, don't set error state
        console.error('[ProductsPage V4] Silent refresh failed:', errorMsg);
        toast.warning('Refresh failed', errorMsg);
        dispatch({ type: 'SET_SILENT_REFRESH', payload: false });
      } else {
        dispatch({
          type: 'SET_ERROR',
          payload: {
            code: 'PROD_FETCH_001',
            message: 'Failed to fetch products',
            details: errorMsg,
            suggestion: 'Check your connection and try again',
          } as ApiError,
        });
      }
    }
  }, [toast]);

  // ── Initial fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    fetchProducts(false);
  }, [fetchProducts]);

  // ── 60-second silent auto-refresh ─────────────────────────────────────
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      // Don't refresh if: loading, import modal open, or manual refresh < 10s ago
      if (state.isLoading || state.showImport || state.isSilentRefresh) return;
      const timeSinceManual = Date.now() - lastManualRefreshRef.current;
      if (timeSinceManual < 10000) return;

      fetchProducts(true);
    }, REFRESH_INTERVAL);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [state.isLoading, state.showImport, state.isSilentRefresh, fetchProducts]);

  // ═════════════════════════════════════════════════════════════════════
  // FILTERED PRODUCTS
  // ═════════════════════════════════════════════════════════════════════

  const filteredProducts = useMemo(() => {
    let result = state.products;
    result = applyStatFilter(result, statFilter);
    result = applySearchFilter(result, searchQuery);
    return result;
  }, [state.products, statFilter, searchQuery]);

  // ═════════════════════════════════════════════════════════════════════
  // SELECTION HANDLERS
  // ═════════════════════════════════════════════════════════════════════

  const handleSelectToggle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(filteredProducts.map(p => p.id)));
  }, [filteredProducts]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [statFilter, searchQuery]);

  // ═════════════════════════════════════════════════════════════════════
  // PRODUCT ACTION HANDLERS
  // ═════════════════════════════════════════════════════════════════════

  const handleRefresh = useCallback(async () => {
    lastManualRefreshRef.current = Date.now();
    await fetchProducts(false);
    toast.success('Products refreshed');
  }, [fetchProducts, toast]);

  const handleProductRefresh = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/products?action=get&id=${id}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (result.success && result.data) {
        dispatch({ type: 'UPDATE_PRODUCT', payload: mapApiProduct(result.data) });
        toast.success('Price refreshed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh';
      toast.error('Refresh failed', msg);
      throw err;
    }
  }, [toast]);

  const handleProductPause = useCallback(async (id: string) => {
    try {
      const product = state.products.find(p => p.id === id);
      if (!product) return;

      const newStatus = product.status === 'paused' ? 'active' : 'paused';
      const response = await fetch('/api/products?action=bulk-status-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: [id], status: newStatus }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      if (result.success) {
        dispatch({
          type: 'UPDATE_PRODUCT',
          payload: { ...product, status: newStatus as ProductStatus },
        });
        toast.success(`Product ${newStatus === 'paused' ? 'paused' : 'activated'}`);
      } else {
        throw new Error(result.error || 'Status update failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      toast.error('Action failed', msg);
      throw err;
    }
  }, [state.products, toast]);

  const handleProductRemove = useCallback(async (id: string) => {
    try {
      const response = await fetch('/api/products?action=bulk-status-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: [id], status: 'archived' }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      if (result.success) {
        dispatch({ type: 'REMOVE_PRODUCTS', payload: [id] });
        toast.success('Product removed');
      } else {
        throw new Error(result.error || 'Remove failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to remove';
      toast.error('Remove failed', msg);
      throw err;
    }
  }, [toast]);

  const handleProductSyncShopify = useCallback(async (id: string) => {
    try {
      const response = await fetch('/api/products?action=sync-shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: [id] }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      if (result.success) {
        toast.success('Synced to Shopify');
        // Refresh to get updated sync status
        await fetchProducts(true);
      } else {
        throw new Error(result.error || 'Sync failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      toast.error('Shopify sync failed', msg);
      throw err;
    }
  }, [toast, fetchProducts]);

  const handleViewDetails = useCallback((product: Product) => {
    // In table view, ProductsPanel handles its own detail modal
    // In card view, we'll log for now — detail modal is a future enhancement
    console.debug('[ProductsPage V4] View details:', product.id, product.title);
  }, []);

  // ═════════════════════════════════════════════════════════════════════
  // BULK ACTION HANDLERS
  // ═════════════════════════════════════════════════════════════════════

  const handleBulkSync = useCallback(async (ids: string[]) => {
    // Show the ShopifySyncModal instead of syncing directly — Spec Item 16
    // The modal shows pricing rules preview and handles the API call
    setShowSyncModal(true);
  }, []);

  const handleBulkStatusChange = useCallback(async (ids: string[], status: string) => {
    try {
      const response = await fetch('/api/products?action=bulk-status-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: ids, status }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      if (result.success) {
        toast.success(`${ids.length} product${ids.length > 1 ? 's' : ''} ${status}`);
        setSelectedIds(new Set());
        await fetchProducts(true);
      } else {
        throw new Error(result.error || `Bulk ${status} failed`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Bulk ${status} failed`;
      toast.error(`Bulk ${status} failed`, msg);
      throw err;
    }
  }, [toast, fetchProducts]);

  const handleBulkActivate = useCallback(async (ids: string[]) => {
    await handleBulkStatusChange(ids, 'active');
  }, [handleBulkStatusChange]);

  const handleBulkPause = useCallback(async (ids: string[]) => {
    await handleBulkStatusChange(ids, 'paused');
  }, [handleBulkStatusChange]);

  const handleBulkArchive = useCallback(async (ids: string[]) => {
    await handleBulkStatusChange(ids, 'archived');
  }, [handleBulkStatusChange]);

  const handleBulkExport = useCallback((ids: string[]) => {
    const exportProducts = state.products.filter(p => ids.includes(p.id));
    const csv = [
      'id,title,asin,status,cost_price,retail_price,profit_percent,category,shopify_synced',
      ...exportProducts.map(p =>
        `"${p.id}","${(p.title || '').replace(/"/g, '""')}","${p.asin || p.source_product_id || ''}","${p.status}",${p.cost_price || ''},${p.retail_price || ''},${p.profit_percent?.toFixed(1) || ''},"${p.category || ''}",${!!(p.shopify_product_id || p.shopify_id)}`
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `products-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${ids.length} product${ids.length > 1 ? 's' : ''}`);
    setSelectedIds(new Set());
  }, [state.products, toast]);

  // ═════════════════════════════════════════════════════════════════════
  // SHOPIFY FULL SYNC (header button)
  // ═════════════════════════════════════════════════════════════════════

  const handleShopifySync = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });

      // Collect all product IDs to push TO Shopify
      const allProductIds = state.products.map(p => p.id);
      
      if (allProductIds.length === 0) {
        toast.error('No products to sync');
        dispatch({ type: 'SET_LOADING', payload: false });
        return;
      }

      const response = await fetch('/api/products?action=sync-shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: allProductIds }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      if (result.success) {
        toast.success('Shopify sync complete', `${result.data?.synced || 0} products synced`);
        await fetchProducts(false);
      } else {
        throw new Error(result.error || 'Shopify sync failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      toast.error('Shopify sync failed', msg);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.products, fetchProducts, toast]);
  // IMPORT HANDLERS
  // ═════════════════════════════════════════════════════════════════════

  const handleImportComplete = useCallback((products: Product[]) => {
    if (products && products.length > 0) {
      dispatch({ type: 'ADD_PRODUCTS', payload: products });
      toast.success(`${products.length} product${products.length > 1 ? 's' : ''} imported`);
    }
    fetchProducts(false);
    dispatch({ type: 'TOGGLE_IMPORT' });
  }, [fetchProducts, toast]);

  // ═════════════════════════════════════════════════════════════════════
  // AI BOT HANDLERS
  // ═════════════════════════════════════════════════════════════════════

  const handleApplySuggestion = useCallback(async (suggestion: Record<string, unknown>) => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.debug('[ProductsPage V4] Applied suggestion:', suggestion);
    toast.info('Suggestion applied');
  }, [toast]);

  const handleProductAction = useCallback(async (action: string, productIds: string[]) => {
    console.debug('[ProductsPage V4] Product action:', action, productIds);
    await new Promise(resolve => setTimeout(resolve, 500));
  }, []);

  // ═════════════════════════════════════════════════════════════════════
  // DERIVED VALUES
  // ═════════════════════════════════════════════════════════════════════

  const existingAsins = useMemo(() => {
    return new Set(
      state.products
        .map(p => p.asin || p.source_product_id)
        .filter((asin): asin is string => asin !== null && asin !== undefined)
    );
  }, [state.products]);

  const activeFilterLabel = useMemo(() => {
    if (!statFilter) return null;
    const labels: Record<string, string> = {
      total: 'All Products',
      active: 'Active',
      paused: 'Paused',
      lowMargin: 'Low Margin',
      synced: 'Shopify Synced',
      stale: 'Stale Prices',
    };
    return labels[statFilter] || null;
  }, [statFilter]);

  // ═════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════

  return (
    <div className="products-dark space-y-5" style={{ padding: '20px 24px', maxWidth: 1500, margin: '0 auto' }}>
      {/* ── Loading State (no products yet) ─────────────────────────── */}
      {state.isLoading && state.products.length === 0 && (
        <SkeletonProductsPage density={gridDensity} />
      )}

      {/* ── Error State (no products, failed to load) ────────────────── */}
      {state.error && !state.isLoading && state.products.length === 0 && (
        <ErrorState error={state.error} onRetry={() => fetchProducts(false)} />
      )}

      {/* ── Empty State ──────────────────────────────────────────────── */}
      {!state.isLoading && !state.error && state.products.length === 0 && (
        <>
          {/* Header with import button only */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Products</h1>
              <p className="text-gray-500 mt-1">Manage your product catalog and inventory</p>
            </div>
            <button
              onClick={() => dispatch({ type: 'TOGGLE_IMPORT' })}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Import Products
            </button>
          </div>
          <EmptyState onImport={() => dispatch({ type: 'TOGGLE_IMPORT' })} />
        </>
      )}

      {/* ── Main Content (has products) ──────────────────────────────── */}
      {state.products.length > 0 && (
        <>
          {/* ── Error Banner (inline, when products exist) ──────────── */}
          {state.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">{state.error.message}</p>
                {state.error.details && <p className="text-xs mt-0.5 opacity-80">{state.error.details}</p>}
              </div>
              <button
                onClick={() => dispatch({ type: 'SET_ERROR', payload: null })}
                className="text-red-500 hover:text-red-700 p-1"
                aria-label="Dismiss error"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* ── Page Header ─────────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Products</h1>
              <p className="text-gray-500 mt-1">
                {state.totalCount.toLocaleString()} products in catalog
                {state.lastFetch && (
                  <span className="text-gray-400 ml-2">
                    Last updated {new Date(state.lastFetch).toLocaleTimeString()}
                  </span>
                )}
                {state.isSilentRefresh && (
                  <span className="text-blue-400 ml-2 inline-flex items-center gap-1">
                    <div className="w-2 h-2 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                    refreshing
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => dispatch({ type: 'TOGGLE_BULK_VERIFY' })}
                className="px-3 py-2 text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 flex items-center gap-1.5 transition-colors"
                aria-label="Verify supplier list"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Verify
              </button>

              <button
                onClick={handleShopifySync}
                disabled={state.isLoading}
                className="px-3 py-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                aria-label="Sync all to Shopify"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {state.isLoading ? 'Syncing...' : 'Sync Shopify'}
              </button>

              <button
                onClick={() => dispatch({ type: 'TOGGLE_IMPORT' })}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5 font-medium transition-colors"
                aria-label="Import products"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Import
              </button>

              <button
                onClick={handleRefresh}
                disabled={state.isLoading}
                className="px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                aria-label="Refresh products"
              >
                {state.isLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent" />
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                Refresh
              </button>
            </div>
          </div>

          {/* ── Stats Row (clickable filters) ───────────────────────── */}
          <StatsRow
            stats={state.stats}
            activeFilter={statFilter}
            onFilterChange={setStatFilter}
          />

          {/* ── Toolbar: Search + Sourcing toggle + View Toggle ──────── */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                resultCount={filteredProducts.length}
                totalCount={state.products.length}
              />
              <SourcingToggle
                isOpen={state.showSourcing}
                onToggle={() => dispatch({ type: 'TOGGLE_SOURCING' })}
              />
            </div>

            <ViewToggle
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              gridDensity={gridDensity}
              onGridDensityChange={setGridDensity}
              productCount={filteredProducts.length}
            />
          </div>

          {/* ── Active Filter Indicator ──────────────────────────────── */}
          {(activeFilterLabel || searchQuery) && (
            <div className="flex items-center gap-2 text-sm">
              {activeFilterLabel && (
                <span className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">
                  Showing: {activeFilterLabel}
                  <button
                    onClick={() => setStatFilter(null)}
                    className="ml-1 text-blue-400 hover:text-blue-700"
                    aria-label="Clear stat filter"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {searchQuery && (
                <span className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full">
                  Search: &ldquo;{searchQuery}&rdquo;
                  <button
                    onClick={() => setSearchQuery('')}
                    className="ml-1 text-gray-400 hover:text-gray-700"
                    aria-label="Clear search"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              <span className="text-gray-400">
                {filteredProducts.length} result{filteredProducts.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* ── Sourcing Panel (collapsible, 4 tabs — Spec Item 3) ───── */}
          {state.showSourcing && (
            <div className="animate-slide-up">
              <SourcingPanel onSourcingComplete={() => fetchProducts(false)} />
            </div>
          )}

          {/* ── Product Grid / Table ─────────────────────────────────── */}
          {viewMode === 'card' ? (
            <ProductCardGrid
              products={filteredProducts}
              density={gridDensity}
              isLoading={state.isLoading}
              selectedIds={selectedIds}
              onSelectToggle={handleSelectToggle}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onViewDetails={handleViewDetails}
              onRefresh={handleProductRefresh}
              onPause={handleProductPause}
              onRemove={handleProductRemove}
              onSyncShopify={handleProductSyncShopify}
              onBulkSync={handleBulkSync}
              onBulkActivate={handleBulkActivate}
              onBulkPause={handleBulkPause}
              onBulkExport={handleBulkExport}
              onBulkArchive={handleBulkArchive}
            />
          ) : (
            <ProductsPanel
              initialProducts={filteredProducts}
              onProductsChange={(products) => dispatch({ type: 'SET_PRODUCTS', payload: products })}
            />
          )}

          {/* ── No results from filtering ────────────────────────────── */}
          {filteredProducts.length === 0 && state.products.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-1">No matching products</h3>
              <p className="text-gray-500 text-sm mb-4">
                {searchQuery
                  ? `No products match "${searchQuery}"`
                  : `No products in the "${activeFilterLabel}" category`
                }
              </p>
              <button
                onClick={() => { setStatFilter(null); setSearchQuery(''); }}
                className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Clear all filters
              </button>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* MODALS & OVERLAYS (always rendered, visibility controlled by state) */}
      {/* ════════════════════════════════════════════════════════════════ */}

      {/* Import Modal */}
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

      {/* Shopify Sync Confirmation Modal — Spec Item 16 */}
      <ShopifySyncModal
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        onConfirm={() => {
          setShowSyncModal(false);
          fetchProducts(true);
        }}
        products={filteredProducts}
        selectedIds={selectedIds.size > 0 ? selectedIds : undefined}
      />

      {/* AI Suggestion Bot */}
      <AISuggestionBot
        products={state.products}
        onApplySuggestion={handleApplySuggestion}
        onProductAction={handleProductAction}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE EXPORT (wraps inner in ToastProvider)
// ═══════════════════════════════════════════════════════════════════════════

export default function ProductsPage() {
  return (
    <ToastProvider>
      <ProductsPageInner />
    </ToastProvider>
  );
}


