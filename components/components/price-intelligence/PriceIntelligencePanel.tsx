'use client';

// components/price-intelligence/PriceIntelligencePanel.tsx
// COMPLETE Price Intelligence Panel - Monitor prices, analyze competitors,
// track profit margins, manage alerts, and perform bulk price refreshes

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import type {
  Product,
  ProductStatus,
  ProfitStatus,
  CompetitorPrices,
  PriceAlert,
  ApiResponse,
} from '@/types';
import type { ApiError } from '@/types/errors';
import { InlineError } from '@/components/ui/InlineError';
import { FeatureStatusBanner } from '@/components/ui/FeatureStatusBanner';
import { PRICING_RULES } from '@/lib/config/pricing-rules';
import {
  calculateRetailPrice,
  calculateCompetitorPrices,
  calculateProfit,
  formatPrice,
  formatProfitPercent,
} from '@/lib/utils/pricing-calculator';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

// View modes
type ViewMode = 'overview' | 'alerts' | 'history' | 'competitors';

// Filter state
interface PriceFiltersState {
  search: string;
  profitStatus: ProfitStatus | 'all';
  alertStatus: 'all' | 'has_alerts' | 'no_alerts';
  priceChange: 'all' | 'increased' | 'decreased' | 'stable';
  sortBy: 'profit_margin' | 'amazon_price' | 'retail_price' | 'last_check' | 'price_change';
  sortOrder: 'asc' | 'desc';
  showStaleOnly: boolean;
}

// Price history entry
interface PriceHistoryEntry {
  id: string;
  productId: string;
  amazonPrice: number;
  retailPrice: number;
  profitMargin: number;
  timestamp: string;
}

// Price alert with additional info
interface EnrichedPriceAlert extends PriceAlert {
  product?: Product;
  previousPrice: number;
  currentPrice: number;
  changePercent: number;
}

// Competitor analysis
interface CompetitorAnalysis {
  productId: string;
  asin: string;
  title: string;
  yourPrice: number;
  competitorPrices: CompetitorPrices;
  averageCompetitor: number;
  lowestCompetitor: number;
  highestCompetitor: number;
  savingsPercent: number;
}

// Bulk refresh state
interface BulkRefreshState {
  isOpen: boolean;
  isProcessing: boolean;
  selectedIds: Set<string>;
  progress: number;
  successCount: number;
  failCount: number;
  errors: Array<{ asin: string; error: string }>;
}

// Component props
interface PriceIntelligencePanelProps {
  products: Product[];
  onProductUpdate: (product: Product) => void;
  onBulkUpdate: (products: Product[]) => void;
  className?: string;
}

// Toast notification
interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const MARGIN_THRESHOLD = PRICING_RULES.profitThresholds.minimum;
const STALE_THRESHOLD_DAYS = PRICING_RULES.refresh.staleThresholdDays;
const GRACE_PERIOD_DAYS = PRICING_RULES.profitThresholds.gracePeriodDays;
const TOAST_DURATION = 5000;
const BATCH_SIZE = 10;
const BATCH_DELAY = 1000;

const DEFAULT_FILTERS: PriceFiltersState = {
  search: '',
  profitStatus: 'all',
  alertStatus: 'all',
  priceChange: 'all',
  sortBy: 'profit_margin',
  sortOrder: 'asc',
  showStaleOnly: false,
};

const INITIAL_BULK_REFRESH: BulkRefreshState = {
  isOpen: false,
  isProcessing: false,
  selectedIds: new Set(),
  progress: 0,
  successCount: 0,
  failCount: 0,
  errors: [],
};

// ═══════════════════════════════════════════════════════════════════════════
// REDUCER
// ═══════════════════════════════════════════════════════════════════════════

type PanelAction =
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'SET_FILTERS'; payload: Partial<PriceFiltersState> }
  | { type: 'RESET_FILTERS' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: ApiError | null }
  | { type: 'SET_ALERTS'; payload: EnrichedPriceAlert[] }
  | { type: 'DISMISS_ALERT'; payload: string }
  | { type: 'SET_HISTORY'; payload: PriceHistoryEntry[] }
  | { type: 'SET_SELECTED'; payload: Set<string> }
  | { type: 'TOGGLE_SELECTED'; payload: string }
  | { type: 'SELECT_ALL' }
  | { type: 'DESELECT_ALL' }
  | { type: 'OPEN_BULK_REFRESH' }
  | { type: 'CLOSE_BULK_REFRESH' }
  | { type: 'SET_BULK_PROCESSING'; payload: boolean }
  | { type: 'SET_BULK_PROGRESS'; payload: number }
  | { type: 'INCREMENT_BULK_SUCCESS' }
  | { type: 'ADD_BULK_ERROR'; payload: { asin: string; error: string } }
  | { type: 'RESET_BULK_REFRESH' }
  | { type: 'ADD_TOAST'; payload: Omit<Toast, 'id'> }
  | { type: 'REMOVE_TOAST'; payload: string }
  | { type: 'SET_PRICE_DETAIL'; payload: Product | null };

interface PanelState {
  viewMode: ViewMode;
  filters: PriceFiltersState;
  isLoading: boolean;
  error: ApiError | null;
  alerts: EnrichedPriceAlert[];
  priceHistory: PriceHistoryEntry[];
  selectedIds: Set<string>;
  bulkRefresh: BulkRefreshState;
  toasts: Toast[];
  priceDetailProduct: Product | null;
}

function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };

    case 'SET_FILTERS':
      return { ...state, filters: { ...state.filters, ...action.payload } };

    case 'RESET_FILTERS':
      return { ...state, filters: DEFAULT_FILTERS };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };

    case 'SET_ALERTS':
      return { ...state, alerts: action.payload };

    case 'DISMISS_ALERT':
      return {
        ...state,
        alerts: state.alerts.filter(a => a.id !== action.payload),
      };

    case 'SET_HISTORY':
      return { ...state, priceHistory: action.payload };

    case 'SET_SELECTED':
      return { ...state, selectedIds: action.payload };

    case 'TOGGLE_SELECTED': {
      const newSelection = new Set(state.selectedIds);
      if (newSelection.has(action.payload)) {
        newSelection.delete(action.payload);
      } else {
        newSelection.add(action.payload);
      }
      return { ...state, selectedIds: newSelection };
    }

    case 'SELECT_ALL':
      return { ...state, selectedIds: new Set() }; // Will be filled by component

    case 'DESELECT_ALL':
      return { ...state, selectedIds: new Set() };

    case 'OPEN_BULK_REFRESH':
      return {
        ...state,
        bulkRefresh: {
          ...INITIAL_BULK_REFRESH,
          isOpen: true,
          selectedIds: state.selectedIds,
        },
      };

    case 'CLOSE_BULK_REFRESH':
      return { ...state, bulkRefresh: INITIAL_BULK_REFRESH };

    case 'SET_BULK_PROCESSING':
      return {
        ...state,
        bulkRefresh: { ...state.bulkRefresh, isProcessing: action.payload },
      };

    case 'SET_BULK_PROGRESS':
      return {
        ...state,
        bulkRefresh: { ...state.bulkRefresh, progress: action.payload },
      };

    case 'INCREMENT_BULK_SUCCESS':
      return {
        ...state,
        bulkRefresh: {
          ...state.bulkRefresh,
          successCount: state.bulkRefresh.successCount + 1,
        },
      };

    case 'ADD_BULK_ERROR':
      return {
        ...state,
        bulkRefresh: {
          ...state.bulkRefresh,
          failCount: state.bulkRefresh.failCount + 1,
          errors: [...state.bulkRefresh.errors, action.payload],
        },
      };

    case 'RESET_BULK_REFRESH':
      return { ...state, bulkRefresh: INITIAL_BULK_REFRESH, selectedIds: new Set() };

    case 'ADD_TOAST': {
      const toast: Toast = {
        ...action.payload,
        id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
      return { ...state, toasts: [...state.toasts, toast] };
    }

    case 'REMOVE_TOAST':
      return {
        ...state,
        toasts: state.toasts.filter(t => t.id !== action.payload),
      };

    case 'SET_PRICE_DETAIL':
      return { ...state, priceDetailProduct: action.payload };

    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if product is stale
 */
function isProductStale(product: Product): boolean {
  if (!product.last_price_check) return true;
  const lastCheck = new Date(product.last_price_check).getTime();
  const thresholdMs = STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - lastCheck > thresholdMs;
}

/**
 * Get days since last check
 */
function getDaysSinceCheck(product: Product): number | null {
  if (!product.last_price_check) return null;
  const lastCheck = new Date(product.last_price_check).getTime();
  return Math.floor((Date.now() - lastCheck) / (1000 * 60 * 60 * 24));
}

/**
 * Get profit status
 */
function getProfitStatus(margin: number | null): ProfitStatus {
  if (margin === null || margin === undefined) return 'unknown';
  if (margin >= MARGIN_THRESHOLD * 2) return 'profitable';
  if (margin >= MARGIN_THRESHOLD) return 'below_threshold';
  return 'unknown';
}

/**
 * Calculate price change status
 */
function getPriceChangeStatus(product: Product, history: PriceHistoryEntry[]): 'increased' | 'decreased' | 'stable' {
  const productHistory = history.filter(h => h.productId === product.id);
  if (productHistory.length < 2) return 'stable';

  const sorted = [...productHistory].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const latest = sorted[0];
  const previous = sorted[1];
  const change = latest.amazonPrice - previous.amazonPrice;

  if (change > 0.5) return 'increased';
  if (change < -0.5) return 'decreased';
  return 'stable';
}

/**
 * Apply filters to products
 */
function applyFilters(
  products: Product[],
  filters: PriceFiltersState,
  alerts: EnrichedPriceAlert[],
  history: PriceHistoryEntry[]
): Product[] {
  return products.filter(product => {
    // Search
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matches = 
        product.title.toLowerCase().includes(searchLower) ||
        product.asin.toLowerCase().includes(searchLower);
      if (!matches) return false;
    }

    // Profit status
    if (filters.profitStatus !== 'all') {
      const status = getProfitStatus(product.profit_margin);
      if (status !== filters.profitStatus) return false;
    }

    // Alert status
    if (filters.alertStatus !== 'all') {
      const hasAlerts = alerts.some(a => a.productId === product.id);
      if (filters.alertStatus === 'has_alerts' && !hasAlerts) return false;
      if (filters.alertStatus === 'no_alerts' && hasAlerts) return false;
    }

    // Price change
    if (filters.priceChange !== 'all') {
      const changeStatus = getPriceChangeStatus(product, history);
      if (changeStatus !== filters.priceChange) return false;
    }

    // Stale only
    if (filters.showStaleOnly && !isProductStale(product)) {
      return false;
    }

    return true;
  });
}

/**
 * Sort products
 */
function sortProducts(
  products: Product[],
  sortBy: PriceFiltersState['sortBy'],
  sortOrder: 'asc' | 'desc'
): Product[] {
  return [...products].sort((a, b) => {
    let aVal: number;
    let bVal: number;

    switch (sortBy) {
      case 'profit_margin':
        aVal = a.profit_margin ?? -Infinity;
        bVal = b.profit_margin ?? -Infinity;
        break;
      case 'amazon_price':
        aVal = a.amazon_price ?? -Infinity;
        bVal = b.amazon_price ?? -Infinity;
        break;
      case 'retail_price':
        aVal = a.retail_price ?? -Infinity;
        bVal = b.retail_price ?? -Infinity;
        break;
      case 'last_check':
        aVal = a.last_price_check ? new Date(a.last_price_check).getTime() : 0;
        bVal = b.last_price_check ? new Date(b.last_price_check).getTime() : 0;
        break;
      case 'price_change':
        aVal = a.amazon_price ?? 0;
        bVal = b.amazon_price ?? 0;
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });
}

/**
 * Generate competitor analysis
 */
function generateCompetitorAnalysis(products: Product[]): CompetitorAnalysis[] {
  return products
    .filter(p => p.retail_price && p.competitor_prices)
    .map(product => {
      const prices = Object.values(product.competitor_prices || {}) as number[];
      const avgCompetitor = prices.length > 0
        ? prices.reduce((sum, p) => sum + p, 0) / prices.length
        : 0;
      const lowestCompetitor = prices.length > 0 ? Math.min(...prices) : 0;
      const highestCompetitor = prices.length > 0 ? Math.max(...prices) : 0;
      const savingsPercent = avgCompetitor > 0
        ? ((avgCompetitor - (product.retail_price || 0)) / avgCompetitor) * 100
        : 0;

      return {
        productId: product.id,
        asin: product.asin,
        title: product.title,
        yourPrice: product.retail_price || 0,
        competitorPrices: product.competitor_prices || {},
        averageCompetitor: avgCompetitor,
        lowestCompetitor,
        highestCompetitor,
        savingsPercent,
      };
    });
}

/**
 * Generate mock alerts
 */
function generateMockAlerts(products: Product[]): EnrichedPriceAlert[] {
  const lowMarginProducts = products.filter(
    p => p.profit_margin !== null && p.profit_margin < MARGIN_THRESHOLD
  );

  return lowMarginProducts.slice(0, 10).map((product, i) => ({
    id: `alert-${product.id}-${i}`,
    productId: product.id,
    asin: product.asin,
    type: 'margin_drop' as const,
    message: `Profit margin dropped below ${MARGIN_THRESHOLD}%`,
    severity: product.profit_margin! < MARGIN_THRESHOLD / 2 ? 'critical' as const : 'warning' as const,
    timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    acknowledged: false,
    product,
    previousPrice: (product.amazon_price || 10) * 0.9,
    currentPrice: product.amazon_price || 10,
    changePercent: 11.1,
  }));
}

/**
 * Generate mock history
 */
function generateMockHistory(products: Product[]): PriceHistoryEntry[] {
  const history: PriceHistoryEntry[] = [];

  products.slice(0, 50).forEach(product => {
    // Generate 7 days of history
    for (let i = 0; i < 7; i++) {
      const basePrice = product.amazon_price || 15;
      const variation = (Math.random() - 0.5) * 2; // ±$1
      const amazonPrice = basePrice + variation;
      const retailPrice = calculateRetailPrice(amazonPrice);

      history.push({
        id: `history-${product.id}-${i}`,
        productId: product.id,
        amazonPrice,
        retailPrice,
        profitMargin: ((retailPrice - amazonPrice) / retailPrice) * 100,
        timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
      });
    }
  });

  return history;
}

/**
 * Format relative time
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diff = now - date.getTime();

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Loading Spinner
 */
function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' };
  return (
    <svg className={`animate-spin ${sizeClasses[size]} text-blue-600`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/**
 * View Mode Tabs
 */
function ViewModeTabs({
  viewMode,
  onViewModeChange,
  alertCount,
}: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  alertCount: number;
}) {
  const tabs: Array<{ id: ViewMode; label: string; icon: React.ReactNode }> = [
    {
      id: 'overview',
      label: 'Overview',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    {
      id: 'alerts',
      label: 'Alerts',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    },
    {
      id: 'history',
      label: 'History',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'competitors',
      label: 'Competitors',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
  ];

  const handleKeyDown = (e: React.KeyboardEvent, currentMode: ViewMode) => {
    const currentIndex = tabs.findIndex(t => t.id === currentMode);
    
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % tabs.length;
      onViewModeChange(tabs[nextIndex].id);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      onViewModeChange(tabs[prevIndex].id);
    }
  };

  return (
    <div className="flex border-b border-gray-200" role="tablist" aria-label="Price intelligence views">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onViewModeChange(tab.id)}
          onKeyDown={(e) => handleKeyDown(e, tab.id)}
          role="tab"
          aria-selected={viewMode === tab.id}
          aria-controls={`${tab.id}-panel`}
          tabIndex={viewMode === tab.id ? 0 : -1}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${
            viewMode === tab.id
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          {tab.icon}
          {tab.label}
          {tab.id === 'alerts' && alertCount > 0 && (
            <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-600" aria-label={`${alertCount} alerts`}>
              {alertCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Stats Summary Cards
 */
function StatsSummary({
  products,
  alerts,
}: {
  products: Product[];
  alerts: EnrichedPriceAlert[];
}) {
  const stats = useMemo(() => {
    const total = products.length;
    const healthy = products.filter(p => (p.profit_margin ?? 0) >= MARGIN_THRESHOLD * 2).length;
    const warning = products.filter(p => {
      const margin = p.profit_margin ?? 0;
      return margin >= MARGIN_THRESHOLD && margin < MARGIN_THRESHOLD * 2;
    }).length;
    const critical = products.filter(p => (p.profit_margin ?? 0) < MARGIN_THRESHOLD).length;
    const stale = products.filter(isProductStale).length;
    const avgMargin = total > 0
      ? products.reduce((sum, p) => sum + (p.profit_margin ?? 0), 0) / total
      : 0;

    return { total, healthy, warning, critical, stale, avgMargin, alertCount: alerts.length };
  }, [products, alerts]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <p className="text-sm text-gray-500">Total Products</p>
        <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
      </div>
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <p className="text-sm text-green-600">Healthy</p>
        <p className="text-2xl font-bold text-green-700">{stats.healthy}</p>
      </div>
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-600">Warning</p>
        <p className="text-2xl font-bold text-yellow-700">{stats.warning}</p>
      </div>
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-600">Critical</p>
        <p className="text-2xl font-bold text-red-700">{stats.critical}</p>
      </div>
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
        <p className="text-sm text-orange-600">Stale</p>
        <p className="text-2xl font-bold text-orange-700">{stats.stale}</p>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-600">Avg Margin</p>
        <p className="text-2xl font-bold text-blue-700">{stats.avgMargin.toFixed(1)}%</p>
      </div>
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <p className="text-sm text-purple-600">Alerts</p>
        <p className="text-2xl font-bold text-purple-700">{stats.alertCount}</p>
      </div>
    </div>
  );
}

/**
 * Filters Bar
 */
function FiltersBar({
  filters,
  onFiltersChange,
  onReset,
  selectedCount,
  onRefreshSelected,
  isLoading,
}: {
  filters: PriceFiltersState;
  onFiltersChange: (filters: Partial<PriceFiltersState>) => void;
  onReset: () => void;
  selectedCount: number;
  onRefreshSelected: () => void;
  isLoading: boolean;
}) {
  const hasActiveFilters = useMemo(() => {
    return filters.search !== '' ||
      filters.profitStatus !== 'all' ||
      filters.alertStatus !== 'all' ||
      filters.priceChange !== 'all' ||
      filters.showStaleOnly;
  }, [filters]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4" role="search" aria-label="Filter products">
      {/* Search and Filters Row */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <label htmlFor="price-search" className="sr-only">Search products</label>
          <input
            id="price-search"
            type="text"
            placeholder="Search by title or ASIN..."
            value={filters.search}
            onChange={(e) => onFiltersChange({ search: e.target.value })}
            disabled={isLoading}
            aria-label="Search products by title or ASIN"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Profit Status */}
        <label htmlFor="profit-filter" className="sr-only">Filter by profit margin</label>
        <select
          id="profit-filter"
          value={filters.profitStatus}
          onChange={(e) => onFiltersChange({ profitStatus: e.target.value as ProfitStatus | 'all' })}
          disabled={isLoading}
          aria-label="Filter by profit margin"
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50"
        >
          <option value="all">All Margins</option>
          <option value="profitable">Healthy (≥60%)</option>
          <option value="below_threshold">Warning (30-60%)</option>
          <option value="unknown">Critical (&lt;30%)</option>
        </select>

        {/* Alert Status */}
        <label htmlFor="alert-filter" className="sr-only">Filter by alert status</label>
        <select
          id="alert-filter"
          value={filters.alertStatus}
          onChange={(e) => onFiltersChange({ alertStatus: e.target.value as 'all' | 'has_alerts' | 'no_alerts' })}
          disabled={isLoading}
          aria-label="Filter by alert status"
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50"
        >
          <option value="all">All Alerts</option>
          <option value="has_alerts">Has Alerts</option>
          <option value="no_alerts">No Alerts</option>
        </select>

        {/* Price Change */}
        <label htmlFor="change-filter" className="sr-only">Filter by price change</label>
        <select
          id="change-filter"
          value={filters.priceChange}
          onChange={(e) => onFiltersChange({ priceChange: e.target.value as 'all' | 'increased' | 'decreased' | 'stable' })}
          disabled={isLoading}
          aria-label="Filter by price change"
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50"
        >
          <option value="all">All Changes</option>
          <option value="increased">Price Increased</option>
          <option value="decreased">Price Decreased</option>
          <option value="stable">Stable</option>
        </select>

        {/* Stale Toggle */}
        <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
          <input
            type="checkbox"
            checked={filters.showStaleOnly}
            onChange={(e) => onFiltersChange({ showStaleOnly: e.target.checked })}
            disabled={isLoading}
            aria-label="Show only stale products"
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Stale only</span>
        </label>

        {hasActiveFilters && (
          <button
            onClick={onReset}
            disabled={isLoading}
            aria-label="Clear all filters"
            className="px-3 py-2 text-sm text-blue-600 hover:text-blue-800"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Sort and Actions Row */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <label htmlFor="sort-select" className="text-sm text-gray-500">Sort by:</label>
          <select
            id="sort-select"
            value={filters.sortBy}
            onChange={(e) => onFiltersChange({ sortBy: e.target.value as PriceFiltersState['sortBy'] })}
            disabled={isLoading}
            aria-label="Sort products by"
            className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="profit_margin">Profit Margin</option>
            <option value="amazon_price">Amazon Price</option>
            <option value="retail_price">Your Price</option>
            <option value="last_check">Last Check</option>
          </select>
          <button
            onClick={() => onFiltersChange({ sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' })}
            disabled={isLoading}
            aria-label={`Sort ${filters.sortOrder === 'asc' ? 'descending' : 'ascending'}`}
            className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
          >
            {filters.sortOrder === 'asc' ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>
        </div>

        {selectedCount > 0 && (
          <button
            onClick={onRefreshSelected}
            disabled={isLoading}
            aria-label={`Refresh ${selectedCount} selected products`}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh {selectedCount} Selected
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Profit Badge
 */
function ProfitBadge({ margin }: { margin: number | null }) {
  if (margin === null || margin === undefined) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
        Unknown
      </span>
    );
  }

  const isHealthy = margin >= MARGIN_THRESHOLD * 2;
  const isWarning = margin >= MARGIN_THRESHOLD && margin < MARGIN_THRESHOLD * 2;

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

/**
 * Price Row Component
 */
function PriceRow({
  product,
  isSelected,
  onSelect,
  onRefresh,
  onViewDetail,
  alerts,
  history,
  isLoading,
}: {
  product: Product;
  isSelected: boolean;
  onSelect: () => void;
  onRefresh: () => void;
  onViewDetail: () => void;
  alerts: EnrichedPriceAlert[];
  history: PriceHistoryEntry[];
  isLoading: boolean;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const productAlerts = alerts.filter(a => a.productId === product.id);
  const priceChange = getPriceChangeStatus(product, history);
  const daysSinceCheck = getDaysSinceCheck(product);
  const isStale = isProductStale(product);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Row background based on margin status
  const margin = product.profit_margin ?? 0;
  const rowBgClass = margin < MARGIN_THRESHOLD
    ? 'bg-red-50 hover:bg-red-100'
    : margin < MARGIN_THRESHOLD * 2
    ? 'bg-yellow-50 hover:bg-yellow-100'
    : 'bg-white hover:bg-gray-50';

  return (
    <tr className={`${rowBgClass} transition-colors border-b border-gray-200`}>
      {/* Checkbox */}
      <td className="px-3 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          disabled={isLoading}
          className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
        />
      </td>

      {/* Product */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt=""
              className="w-10 h-10 rounded object-cover bg-gray-100"
            />
          ) : (
            <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center text-gray-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          <div className="min-w-0">
            <button
              onClick={onViewDetail}
              className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block max-w-[200px] text-left"
              title={product.title}
            >
              {product.title.slice(0, 40)}...
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-mono">{product.asin}</span>
              {productAlerts.length > 0 && (
                <span className="text-xs text-red-600 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {productAlerts.length}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Amazon Price */}
      <td className="px-3 py-3 text-sm font-mono text-gray-900">
        <div className="flex items-center gap-1">
          {formatPrice(product.amazon_price || 0)}
          {priceChange === 'increased' && (
            <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          )}
          {priceChange === 'decreased' && (
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </td>

      {/* Your Price */}
      <td className="px-3 py-3 text-sm font-mono font-medium text-green-600">
        {formatPrice(product.retail_price || 0)}
      </td>

      {/* Profit */}
      <td className="px-3 py-3">
        <ProfitBadge margin={product.profit_margin} />
      </td>

      {/* Last Check */}
      <td className="px-3 py-3 text-sm">
        <span className={isStale ? 'text-orange-600' : 'text-gray-500'}>
          {daysSinceCheck !== null ? (
            isStale ? `⚠️ ${daysSinceCheck}d` : `${daysSinceCheck}d ago`
          ) : (
            '⚠️ Never'
          )}
        </span>
      </td>

      {/* Actions */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
            title="Refresh price"
          >
            {isRefreshing ? (
              <LoadingSpinner size="sm" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </button>
          <button
            onClick={onViewDetail}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
            title="View details"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

/**
 * Overview View
 */
function OverviewView({
  products,
  alerts,
  history,
  filters,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onRefresh,
  onViewDetail,
  isLoading,
}: {
  products: Product[];
  alerts: EnrichedPriceAlert[];
  history: PriceHistoryEntry[];
  filters: PriceFiltersState;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onRefresh: (product: Product) => void;
  onViewDetail: (product: Product) => void;
  isLoading: boolean;
}) {
  const filteredProducts = useMemo(() => {
    const filtered = applyFilters(products, filters, alerts, history);
    return sortProducts(filtered, filters.sortBy, filters.sortOrder);
  }, [products, filters, alerts, history]);

  const allSelected = filteredProducts.length > 0 && 
    filteredProducts.every(p => selectedIds.has(p.id));

  if (filteredProducts.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <h3 className="text-lg font-medium text-gray-900">No products found</h3>
        <p className="text-gray-500 mt-1">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Selection bar */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          <span className="text-gray-600">
            {filteredProducts.length} products
          </span>
          {selectedIds.size > 0 && (
            <span className="text-blue-600 font-medium">
              {selectedIds.size} selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={allSelected ? onDeselectAll : onSelectAll}
            className="text-blue-600 hover:text-blue-800"
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={allSelected ? onDeselectAll : onSelectAll}
                  className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Product
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Amazon Price
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Your Price
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Profit
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Last Check
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredProducts.map(product => (
              <PriceRow
                key={product.id}
                product={product}
                isSelected={selectedIds.has(product.id)}
                onSelect={() => onToggleSelect(product.id)}
                onRefresh={() => onRefresh(product)}
                onViewDetail={() => onViewDetail(product)}
                alerts={alerts}
                history={history}
                isLoading={isLoading}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Alerts View
 */
function AlertsView({
  alerts,
  onDismiss,
  onViewProduct,
  isLoading,
}: {
  alerts: EnrichedPriceAlert[];
  onDismiss: (alertId: string) => void;
  onViewProduct: (productId: string) => void;
  isLoading: boolean;
}) {
  const criticalAlerts = alerts.filter(a => a.severity === 'critical');
  const warningAlerts = alerts.filter(a => a.severity === 'warning');

  if (alerts.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900">All Clear!</h3>
        <p className="text-gray-500 mt-1">No price alerts at this time</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Critical Alerts */}
      {criticalAlerts.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-red-800 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Critical Alerts ({criticalAlerts.length})
          </h3>
          <div className="space-y-3">
            {criticalAlerts.map(alert => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onDismiss={() => onDismiss(alert.id)}
                onViewProduct={() => onViewProduct(alert.productId)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Warning Alerts */}
      {warningAlerts.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-yellow-800 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Warnings ({warningAlerts.length})
          </h3>
          <div className="space-y-3">
            {warningAlerts.map(alert => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onDismiss={() => onDismiss(alert.id)}
                onViewProduct={() => onViewProduct(alert.productId)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Alert Card Component
 */
function AlertCard({
  alert,
  onDismiss,
  onViewProduct,
}: {
  alert: EnrichedPriceAlert;
  onDismiss: () => void;
  onViewProduct: () => void;
}) {
  const bgClass = alert.severity === 'critical' 
    ? 'bg-red-50 border-red-200' 
    : 'bg-yellow-50 border-yellow-200';
  const textClass = alert.severity === 'critical' ? 'text-red-800' : 'text-yellow-800';

  return (
    <div className={`${bgClass} border rounded-lg p-4`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          {alert.product?.image_url && (
            <img
              src={alert.product.image_url}
              alt=""
              className="w-12 h-12 rounded object-cover"
            />
          )}
          <div>
            <p className={`font-medium ${textClass}`}>{alert.message}</p>
            <p className="text-sm text-gray-600 mt-1">
              {alert.product?.title?.slice(0, 60) || alert.asin}...
            </p>
            <div className="flex items-center gap-4 mt-2 text-sm">
              <span className="text-gray-500">
                Previous: {formatPrice(alert.previousPrice)}
              </span>
              <span className="text-gray-500">→</span>
              <span className={textClass}>
                Current: {formatPrice(alert.currentPrice)}
              </span>
              <span className={`font-medium ${alert.changePercent > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {alert.changePercent > 0 ? '+' : ''}{alert.changePercent.toFixed(1)}%
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {formatRelativeTime(alert.timestamp)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onViewProduct}
            className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            View
          </button>
          <button
            onClick={onDismiss}
            className="p-1 text-gray-400 hover:text-gray-600"
            title="Dismiss"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * History View
 */
function HistoryView({
  products,
  history,
}: {
  products: Product[];
  history: PriceHistoryEntry[];
}) {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  // Group history by date
  const groupedHistory = useMemo(() => {
    const groups: Record<string, PriceHistoryEntry[]> = {};
    history.forEach(entry => {
      const date = new Date(entry.timestamp).toLocaleDateString();
      if (!groups[date]) groups[date] = [];
      groups[date].push(entry);
    });
    return Object.entries(groups).sort((a, b) => 
      new Date(b[0]).getTime() - new Date(a[0]).getTime()
    );
  }, [history]);

  // Prepare chart data for selected product or all
  const chartData = useMemo(() => {
    let relevantHistory = history;
    if (selectedProductId) {
      relevantHistory = history.filter(h => h.productId === selectedProductId);
    }

    // Group by date and calculate average prices
    const dateMap = new Map<string, { date: string; amazonPrice: number; retailPrice: number; margin: number; count: number }>();
    
    relevantHistory.forEach(entry => {
      const dateKey = new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, { date: dateKey, amazonPrice: 0, retailPrice: 0, margin: 0, count: 0 });
      }
      const existing = dateMap.get(dateKey)!;
      existing.amazonPrice += entry.amazonPrice;
      existing.retailPrice += entry.retailPrice;
      existing.margin += entry.profitMargin;
      existing.count += 1;
    });

    return Array.from(dateMap.values())
      .map(d => ({
        date: d.date,
        amazonPrice: d.amazonPrice / d.count,
        retailPrice: d.retailPrice / d.count,
        margin: d.margin / d.count,
      }))
      .reverse()
      .slice(-14); // Last 14 days
  }, [history, selectedProductId]);

  // Products with history for filter dropdown
  const productsWithHistory = useMemo(() => {
    const productIds = new Set(history.map(h => h.productId));
    return products.filter(p => productIds.has(p.id));
  }, [history, products]);

  if (history.length === 0) {
    return (
      <div className="text-center py-12" role="status" aria-label="No price history available">
        <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-lg font-medium text-gray-900">No Price History</h3>
        <p className="text-gray-500 mt-1">Price history will appear here after price checks</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter */}
      <div className="flex items-center justify-between">
        <label htmlFor="product-filter" className="text-sm font-medium text-gray-700">
          Filter by Product:
        </label>
        <select
          id="product-filter"
          value={selectedProductId || ''}
          onChange={(e) => setSelectedProductId(e.target.value || null)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          aria-label="Select product to view price history"
        >
          <option value="">All Products</option>
          {productsWithHistory.map(p => (
            <option key={p.id} value={p.id}>
              {p.asin} - {p.title.slice(0, 30)}...
            </option>
          ))}
        </select>
      </div>

      {/* Price Chart */}
      <div 
        className="bg-white border border-gray-200 rounded-lg p-4"
        role="img"
        aria-label={`Price history chart showing ${chartData.length} data points`}
      >
        <h3 className="text-sm font-medium text-gray-700 mb-4">Price Trend (Last 14 Days)</h3>
        {chartData.length > 1 ? (
          <PriceHistoryChart data={chartData} />
        ) : (
          <div className="h-48 flex items-center justify-center text-gray-400">
            <p>Not enough data points for chart</p>
          </div>
        )}
      </div>

      {/* History Table */}
      {groupedHistory.slice(0, 7).map(([date, entries]) => (
        <div key={date}>
          <h3 className="text-sm font-medium text-gray-700 mb-3">{date}</h3>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200" role="table" aria-label={`Price history for ${date}`}>
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500">Product</th>
                  <th scope="col" className="px-4 py-2 text-right text-xs font-medium text-gray-500">Amazon</th>
                  <th scope="col" className="px-4 py-2 text-right text-xs font-medium text-gray-500">Retail</th>
                  <th scope="col" className="px-4 py-2 text-right text-xs font-medium text-gray-500">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {entries.slice(0, 10).map(entry => {
                  const product = products.find(p => p.id === entry.productId);
                  return (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm">
                        <span className="font-mono text-gray-500">{product?.asin || 'Unknown'}</span>
                        {product && (
                          <span className="text-gray-700 ml-2">{product.title.slice(0, 30)}...</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono">
                        {formatPrice(entry.amazonPrice)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono text-green-600">
                        {formatPrice(entry.retailPrice)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <ProfitBadge margin={entry.profitMargin} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Price History Chart Component using SVG (no external dependencies)
 */
function PriceHistoryChart({ data }: { data: Array<{ date: string; amazonPrice: number; retailPrice: number; margin: number }> }) {
  const width = 600;
  const height = 200;
  const padding = { top: 20, right: 60, bottom: 30, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate scales
  const allPrices = data.flatMap(d => [d.amazonPrice, d.retailPrice]);
  const minPrice = Math.min(...allPrices) * 0.95;
  const maxPrice = Math.max(...allPrices) * 1.05;

  const xScale = (index: number) => padding.left + (index / (data.length - 1)) * chartWidth;
  const yScale = (value: number) => padding.top + ((maxPrice - value) / (maxPrice - minPrice)) * chartHeight;

  // Create paths
  const amazonPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.amazonPrice)}`).join(' ');
  const retailPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.retailPrice)}`).join(' ');

  return (
    <svg 
      viewBox={`0 0 ${width} ${height}`} 
      className="w-full h-48"
      role="img"
      aria-label="Price history line chart"
    >
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
        const y = padding.top + ratio * chartHeight;
        const price = maxPrice - ratio * (maxPrice - minPrice);
        return (
          <g key={i}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e5e7eb" strokeDasharray="2,2" />
            <text x={padding.left - 8} y={y + 4} textAnchor="end" className="text-xs fill-gray-400">
              ${price.toFixed(0)}
            </text>
          </g>
        );
      })}

      {/* X-axis labels */}
      {data.map((d, i) => (
        i % Math.ceil(data.length / 5) === 0 && (
          <text key={i} x={xScale(i)} y={height - 8} textAnchor="middle" className="text-xs fill-gray-400">
            {d.date}
          </text>
        )
      ))}

      {/* Amazon price line */}
      <path d={amazonPath} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      
      {/* Retail price line */}
      <path d={retailPath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Data points - Amazon */}
      {data.map((d, i) => (
        <circle key={`amazon-${i}`} cx={xScale(i)} cy={yScale(d.amazonPrice)} r="3" fill="#f59e0b" />
      ))}

      {/* Data points - Retail */}
      {data.map((d, i) => (
        <circle key={`retail-${i}`} cx={xScale(i)} cy={yScale(d.retailPrice)} r="3" fill="#10b981" />
      ))}

      {/* Legend */}
      <g transform={`translate(${width - padding.right + 10}, ${padding.top})`}>
        <circle cx="0" cy="0" r="4" fill="#f59e0b" />
        <text x="10" y="4" className="text-xs fill-gray-600">Amazon</text>
        <circle cx="0" cy="20" r="4" fill="#10b981" />
        <text x="10" y="24" className="text-xs fill-gray-600">Retail</text>
      </g>
    </svg>
  );
}

/**
 * Competitors View
 */
function CompetitorsView({
  products,
}: {
  products: Product[];
}) {
  const analysis = useMemo(() => generateCompetitorAnalysis(products), [products]);

  if (analysis.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <h3 className="text-lg font-medium text-gray-900">No Competitor Data</h3>
        <p className="text-gray-500 mt-1">Competitor prices will appear after product imports</p>
      </div>
    );
  }

  // Summary stats
  const avgSavings = analysis.reduce((sum, a) => sum + a.savingsPercent, 0) / analysis.length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <p className="text-sm text-green-600">Average Customer Savings</p>
          <p className="text-3xl font-bold text-green-700">{avgSavings.toFixed(1)}%</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <p className="text-sm text-blue-600">Products with Competitors</p>
          <p className="text-3xl font-bold text-blue-700">{analysis.length}</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
          <p className="text-sm text-purple-600">Avg Price Difference</p>
          <p className="text-3xl font-bold text-purple-700">
            {formatPrice(
              analysis.reduce((sum, a) => sum + (a.averageCompetitor - a.yourPrice), 0) / analysis.length
            )}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Your Price</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Lowest</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Average</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Highest</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Savings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {analysis.slice(0, 50).map(item => (
              <tr key={item.productId} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                    {item.title.slice(0, 40)}...
                  </p>
                  <p className="text-xs text-gray-500 font-mono">{item.asin}</p>
                </td>
                <td className="px-4 py-3 text-right text-sm font-mono font-medium text-green-600">
                  {formatPrice(item.yourPrice)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-mono text-gray-600">
                  {formatPrice(item.lowestCompetitor)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-mono text-gray-600">
                  {formatPrice(item.averageCompetitor)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-mono text-gray-600">
                  {formatPrice(item.highestCompetitor)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    {item.savingsPercent.toFixed(0)}% off
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Bulk Refresh Modal
 */
function BulkRefreshModal({
  state,
  onClose,
}: {
  state: BulkRefreshState;
  onClose: () => void;
}) {
  if (!state.isOpen) return null;

  const totalCount = state.selectedIds.size;
  const processedCount = state.successCount + state.failCount;
  const progressPercent = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={state.isProcessing ? undefined : onClose} />
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {state.isProcessing ? 'Refreshing Prices...' : 'Bulk Refresh Complete'}
          </h3>

          {/* Progress */}
          <div className="space-y-4">
            <div className="flex justify-between text-sm text-gray-600">
              <span>{processedCount} of {totalCount} products</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{state.successCount}</p>
                <p className="text-sm text-green-700">Successful</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-600">{state.failCount}</p>
                <p className="text-sm text-red-700">Failed</p>
              </div>
            </div>

            {/* Errors */}
            {state.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-32 overflow-y-auto">
                <p className="text-sm font-medium text-red-800 mb-1">Errors:</p>
                {state.errors.slice(0, 5).map((err, i) => (
                  <p key={i} className="text-xs text-red-700">• {err.asin}: {err.error}</p>
                ))}
              </div>
            )}

            {state.isProcessing && (
              <div className="flex justify-center">
                <LoadingSpinner size="lg" />
              </div>
            )}
          </div>

          {!state.isProcessing && (
            <div className="mt-6 flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Toast Container
 */
function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(toast => (
        <ToastNotification key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/**
 * Toast Notification
 */
function ToastNotification({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const bgClasses = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    warning: 'bg-yellow-50 border-yellow-200',
    info: 'bg-blue-50 border-blue-200',
  };

  return (
    <div className={`${bgClasses[toast.type]} border rounded-lg shadow-lg p-4 min-w-[300px]`}>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="font-medium text-gray-900">{toast.title}</p>
          <p className="text-sm text-gray-600">{toast.message}</p>
        </div>
        <button onClick={() => onDismiss(toast.id)} className="text-gray-400 hover:text-gray-600">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function PriceIntelligencePanel({
  products,
  onProductUpdate,
  onBulkUpdate,
  className = '',
}: PriceIntelligencePanelProps) {
  const [state, dispatch] = useReducer(panelReducer, {
    viewMode: 'overview',
    filters: DEFAULT_FILTERS,
    isLoading: false,
    error: null,
    alerts: [],
    priceHistory: [],
    selectedIds: new Set(),
    bulkRefresh: INITIAL_BULK_REFRESH,
    toasts: [],
    priceDetailProduct: null,
  });

  // Generate mock data on mount
  useEffect(() => {
    const alerts = generateMockAlerts(products);
    const history = generateMockHistory(products);
    dispatch({ type: 'SET_ALERTS', payload: alerts });
    dispatch({ type: 'SET_HISTORY', payload: history });
  }, [products]);

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    dispatch({ type: 'ADD_TOAST', payload: toast });
  }, []);

  const handleRefreshProduct = useCallback(async (product: Product) => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    const newAmazonPrice = (product.amazon_price || 15) * (0.95 + Math.random() * 0.1);
    const newRetailPrice = calculateRetailPrice(newAmazonPrice);
    const competitorPrices = calculateCompetitorPrices(newRetailPrice);

    const updatedProduct: Product = {
      ...product,
      amazon_price: newAmazonPrice,
      retail_price: newRetailPrice,
      profit_margin: ((newRetailPrice - newAmazonPrice) / newRetailPrice) * 100,
      competitor_prices: competitorPrices,
      last_price_check: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    onProductUpdate(updatedProduct);

    addToast({
      type: 'success',
      title: 'Price Refreshed',
      message: `${product.asin} updated successfully`,
      duration: TOAST_DURATION,
    });
  }, [onProductUpdate, addToast]);

  const handleBulkRefresh = useCallback(async () => {
    dispatch({ type: 'OPEN_BULK_REFRESH' });
    dispatch({ type: 'SET_BULK_PROCESSING', payload: true });

    const selectedProducts = products.filter(p => state.selectedIds.has(p.id));
    const updatedProducts: Product[] = [];

    for (let i = 0; i < selectedProducts.length; i++) {
      const product = selectedProducts[i];
      dispatch({ type: 'SET_BULK_PROGRESS', payload: Math.round(((i + 1) / selectedProducts.length) * 100) });

      try {
        await new Promise(resolve => setTimeout(resolve, 200));

        // Simulate occasional failure
        if (Math.random() < 0.05) {
          throw new Error('API rate limit');
        }

        const newAmazonPrice = (product.amazon_price || 15) * (0.95 + Math.random() * 0.1);
        const newRetailPrice = calculateRetailPrice(newAmazonPrice);
        const competitorPrices = calculateCompetitorPrices(newRetailPrice);

        const updatedProduct: Product = {
          ...product,
          amazon_price: newAmazonPrice,
          retail_price: newRetailPrice,
          profit_margin: ((newRetailPrice - newAmazonPrice) / newRetailPrice) * 100,
          competitor_prices: competitorPrices,
          last_price_check: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        updatedProducts.push(updatedProduct);
        dispatch({ type: 'INCREMENT_BULK_SUCCESS' });
      } catch (error) {
        dispatch({
          type: 'ADD_BULK_ERROR',
          payload: { asin: product.asin, error: error instanceof Error ? error.message : 'Unknown error' },
        });
      }

      // Batch delay
      if ((i + 1) % BATCH_SIZE === 0) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    dispatch({ type: 'SET_BULK_PROCESSING', payload: false });
    onBulkUpdate(updatedProducts);
  }, [products, state.selectedIds, onBulkUpdate]);

  const handleSelectAll = useCallback(() => {
    const filteredProducts = applyFilters(products, state.filters, state.alerts, state.priceHistory);
    dispatch({ type: 'SET_SELECTED', payload: new Set(filteredProducts.map(p => p.id)) });
  }, [products, state.filters, state.alerts, state.priceHistory]);

  // Export to CSV
  const handleExportCSV = useCallback(() => {
    const filteredProducts = applyFilters(products, state.filters, state.alerts, state.priceHistory);
    
    if (filteredProducts.length === 0) {
      addToast({
        type: 'warning',
        title: 'No Data to Export',
        message: 'No products match the current filters',
        duration: TOAST_DURATION,
      });
      return;
    }

    // CSV header
    const headers = [
      'ASIN',
      'Title',
      'Amazon Price',
      'Retail Price',
      'Profit Margin %',
      'Status',
      'Last Price Check',
      'Shopify Synced',
    ].join(',');

    // CSV rows
    const rows = filteredProducts.map(p => [
      p.asin,
      `"${(p.title || '').replace(/"/g, '""')}"`, // Escape quotes
      p.amazon_price?.toFixed(2) || '',
      p.retail_price?.toFixed(2) || '',
      p.profit_margin?.toFixed(1) || '',
      p.status || '',
      p.last_price_check || '',
      p.shopify_id ? 'Yes' : 'No',
    ].join(','));

    const csvContent = [headers, ...rows].join('\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `price-intelligence-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    addToast({
      type: 'success',
      title: 'Export Complete',
      message: `Exported ${filteredProducts.length} products to CSV`,
      duration: TOAST_DURATION,
    });
  }, [products, state.filters, state.alerts, state.priceHistory, addToast]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="price-intel-title" className="text-xl font-semibold text-gray-900">Price Intelligence</h2>
            <p className="text-sm text-gray-500 mt-1">
              Monitor prices, track margins, and manage alerts
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Export Button */}
            <button
              onClick={handleExportCSV}
              disabled={state.isLoading}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
              aria-label="Export price data to CSV file"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </button>
            {/* Refresh Button */}
            <button
              onClick={() => {
                dispatch({ type: 'SET_LOADING', payload: true });
                setTimeout(() => {
                  const alerts = generateMockAlerts(products);
                  const history = generateMockHistory(products);
                  dispatch({ type: 'SET_ALERTS', payload: alerts });
                  dispatch({ type: 'SET_HISTORY', payload: history });
                  dispatch({ type: 'SET_LOADING', payload: false });
                  addToast({
                    type: 'success',
                    title: 'Data Refreshed',
                    message: 'Price intelligence data updated',
                    duration: TOAST_DURATION,
                  });
                }, 1000);
              }}
              disabled={state.isLoading}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              aria-label="Refresh all price data"
            >
              {state.isLoading ? <LoadingSpinner size="sm" /> : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              Refresh All
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {state.error && (
        <FeatureStatusBanner
          status={{
            code: state.error.code,
            status: 'error',
            message: state.error.message,
            details: state.error.details,
            suggestion: state.error.suggestion,
            blocking: false,
          }}
          onDismiss={() => dispatch({ type: 'SET_ERROR', payload: null })}
        />
      )}

      {/* Stats Summary */}
      <div className="px-6 py-4">
        <StatsSummary products={products} alerts={state.alerts} />
      </div>

      {/* View Tabs */}
      <ViewModeTabs
        viewMode={state.viewMode}
        onViewModeChange={(mode) => dispatch({ type: 'SET_VIEW_MODE', payload: mode })}
        alertCount={state.alerts.length}
      />

      {/* Content */}
      <div className="p-6">
        {/* Filters (only for overview) */}
        {state.viewMode === 'overview' && (
          <div className="mb-6">
            <FiltersBar
              filters={state.filters}
              onFiltersChange={(filters) => dispatch({ type: 'SET_FILTERS', payload: filters })}
              onReset={() => dispatch({ type: 'RESET_FILTERS' })}
              selectedCount={state.selectedIds.size}
              onRefreshSelected={handleBulkRefresh}
              isLoading={state.isLoading}
            />
          </div>
        )}

        {/* View Content */}
        {state.viewMode === 'overview' && (
          <OverviewView
            products={products}
            alerts={state.alerts}
            history={state.priceHistory}
            filters={state.filters}
            selectedIds={state.selectedIds}
            onToggleSelect={(id) => dispatch({ type: 'TOGGLE_SELECTED', payload: id })}
            onSelectAll={handleSelectAll}
            onDeselectAll={() => dispatch({ type: 'DESELECT_ALL' })}
            onRefresh={handleRefreshProduct}
            onViewDetail={(product) => dispatch({ type: 'SET_PRICE_DETAIL', payload: product })}
            isLoading={state.isLoading}
          />
        )}

        {state.viewMode === 'alerts' && (
          <AlertsView
            alerts={state.alerts}
            onDismiss={(id) => dispatch({ type: 'DISMISS_ALERT', payload: id })}
            onViewProduct={(productId) => {
              const product = products.find(p => p.id === productId);
              if (product) {
                dispatch({ type: 'SET_VIEW_MODE', payload: 'overview' });
                dispatch({ type: 'SET_FILTERS', payload: { search: product.asin } });
              }
            }}
            isLoading={state.isLoading}
          />
        )}

        {state.viewMode === 'history' && (
          <HistoryView products={products} history={state.priceHistory} />
        )}

        {state.viewMode === 'competitors' && (
          <CompetitorsView products={products} />
        )}
      </div>

      {/* Bulk Refresh Modal */}
      <BulkRefreshModal
        state={state.bulkRefresh}
        onClose={() => dispatch({ type: 'RESET_BULK_REFRESH' })}
      />

      {/* Toasts */}
      <ToastContainer
        toasts={state.toasts}
        onDismiss={(id) => dispatch({ type: 'REMOVE_TOAST', payload: id })}
      />
    </div>
  );
}

export default PriceIntelligencePanel;
