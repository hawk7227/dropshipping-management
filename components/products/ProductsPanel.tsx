'use client';

// components/products/ProductsPanel.tsx
// COMPLETE Products Management Panel - Main component for the Products page
// Handles: listing, filtering, sorting, pagination, CRUD operations, bulk actions,
// product details modal, export, URL sync, keyboard navigation, and all error states

import { 
  useState, 
  useEffect, 
  useCallback, 
  useMemo, 
  useRef,
  useReducer,
  KeyboardEvent,
  ChangeEvent,
  FormEvent,
} from 'react';
import type { 
  Product, 
  ProductStatus, 
  ProfitStatus,
  CompetitorPrices,
  ApiResponse,
} from '@/types';
import type { ApiError } from '@/types/errors';
import { InlineError } from '@/components/ui/InlineError';
import { FeatureStatusBanner } from '@/components/ui/FeatureStatusBanner';
import { formatPrice, formatProfitPercent } from '@/lib/utils/pricing-calculator';
import { PRICING_RULES } from '@/lib/config/pricing-rules';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

// Filter state
export interface ProductFiltersState {
  search: string;
  status: ProductStatus | 'all';
  profitStatus: ProfitStatus | 'all';
  category: string | 'all';
  sortBy: SortField;
  sortOrder: 'asc' | 'desc';
  showStaleOnly: boolean;
  showSyncedOnly: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  minMargin: number | null;
  maxMargin: number | null;
}

type SortField = 
  | 'title' 
  | 'created_at' 
  | 'updated_at' 
  | 'profit_margin' 
  | 'amazon_price' 
  | 'retail_price'
  | 'rating'
  | 'review_count';

// Pagination state
interface PaginationState {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

// Product detail modal state
interface ProductDetailState {
  isOpen: boolean;
  product: Product | null;
  isEditing: boolean;
  editedFields: Partial<Product>;
  isSaving: boolean;
  saveError: ApiError | null;
}

// Bulk action state
interface BulkActionState {
  isOpen: boolean;
  action: BulkAction | null;
  selectedIds: Set<string>;
  isProcessing: boolean;
  progress: number;
  results: BulkActionResult[];
  error: ApiError | null;
}

type BulkAction = 'refresh' | 'pause' | 'unpause' | 'remove' | 'export' | 'push_to_shopify';

interface BulkActionResult {
  productId: string;
  success: boolean;
  error?: string;
}

// Confirmation dialog state
interface ConfirmationState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmVariant: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
  isProcessing: boolean;
}

// Toast notification
interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration: number;
}

// Component props
interface ProductsPanelProps {
  initialProducts?: Product[];
  onProductsChange?: (products: Product[]) => void;
  showNewDeals?: boolean;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const STALE_THRESHOLD_DAYS = PRICING_RULES.refresh.staleThresholdDays;
const MARGIN_THRESHOLD = PRICING_RULES.profitThresholds.minimum;
const DEBOUNCE_DELAY = 300;
const TOAST_DURATION = 5000;
const VIRTUAL_ROW_HEIGHT = 64;
const VIRTUAL_OVERSCAN = 5;

const DEFAULT_FILTERS: ProductFiltersState = {
  search: '',
  status: 'all',
  profitStatus: 'all',
  category: 'all',
  sortBy: 'updated_at',
  sortOrder: 'desc',
  showStaleOnly: false,
  showSyncedOnly: false,
  minPrice: null,
  maxPrice: null,
  minMargin: null,
  maxMargin: null,
};

const DEFAULT_PAGINATION: PaginationState = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  totalItems: 0,
  totalPages: 0,
};

const INITIAL_PRODUCT_DETAIL: ProductDetailState = {
  isOpen: false,
  product: null,
  isEditing: false,
  editedFields: {},
  isSaving: false,
  saveError: null,
};

const INITIAL_BULK_ACTION: BulkActionState = {
  isOpen: false,
  action: null,
  selectedIds: new Set(),
  isProcessing: false,
  progress: 0,
  results: [],
  error: null,
};

const INITIAL_CONFIRMATION: ConfirmationState = {
  isOpen: false,
  title: '',
  message: '',
  confirmLabel: 'Confirm',
  confirmVariant: 'primary',
  onConfirm: () => {},
  isProcessing: false,
};

// ═══════════════════════════════════════════════════════════════════════════
// REDUCER FOR COMPLEX STATE
// ═══════════════════════════════════════════════════════════════════════════

type PanelAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: ApiError | null }
  | { type: 'SET_PRODUCTS'; payload: Product[] }
  | { type: 'UPDATE_PRODUCT'; payload: Product }
  | { type: 'REMOVE_PRODUCT'; payload: string }
  | { type: 'SET_FILTERS'; payload: Partial<ProductFiltersState> }
  | { type: 'RESET_FILTERS' }
  | { type: 'SET_PAGINATION'; payload: Partial<PaginationState> }
  | { type: 'SET_SELECTION'; payload: Set<string> }
  | { type: 'TOGGLE_SELECTION'; payload: string }
  | { type: 'SELECT_ALL' }
  | { type: 'DESELECT_ALL' }
  | { type: 'OPEN_DETAIL'; payload: Product }
  | { type: 'CLOSE_DETAIL' }
  | { type: 'SET_EDITING'; payload: boolean }
  | { type: 'UPDATE_EDITED_FIELDS'; payload: Partial<Product> }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_SAVE_ERROR'; payload: ApiError | null }
  | { type: 'OPEN_BULK_ACTION'; payload: BulkAction }
  | { type: 'CLOSE_BULK_ACTION' }
  | { type: 'SET_BULK_PROCESSING'; payload: boolean }
  | { type: 'SET_BULK_PROGRESS'; payload: number }
  | { type: 'ADD_BULK_RESULT'; payload: BulkActionResult }
  | { type: 'SET_BULK_ERROR'; payload: ApiError | null }
  | { type: 'OPEN_CONFIRMATION'; payload: Omit<ConfirmationState, 'isOpen' | 'isProcessing'> }
  | { type: 'CLOSE_CONFIRMATION' }
  | { type: 'SET_CONFIRMATION_PROCESSING'; payload: boolean }
  | { type: 'ADD_TOAST'; payload: Omit<Toast, 'id'> }
  | { type: 'REMOVE_TOAST'; payload: string }
  | { type: 'SET_EXPANDED_ROW'; payload: string | null };

interface PanelState {
  isLoading: boolean;
  error: ApiError | null;
  products: Product[];
  filters: ProductFiltersState;
  pagination: PaginationState;
  selectedIds: Set<string>;
  productDetail: ProductDetailState;
  bulkAction: BulkActionState;
  confirmation: ConfirmationState;
  toasts: Toast[];
  expandedRowId: string | null;
}

function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    
    case 'SET_PRODUCTS':
      // Calculate valid page number
      const newTotalItems = action.payload.length;
      const newTotalPages = Math.ceil(newTotalItems / state.pagination.pageSize);
      // Ensure current page is not out of bounds (e.g., if on page 5 but new data only has 1 page)
      const validPage = Math.max(1, Math.min(state.pagination.page, newTotalPages || 1));

      return { 
        ...state, 
        products: action.payload,
        pagination: {
          ...state.pagination,
          totalItems: newTotalItems,
          totalPages: newTotalPages,
          page: validPage, // <--- ADD THIS FIX
        },
        isLoading: false,
      };
    
    case 'UPDATE_PRODUCT':
      return {
        ...state,
        products: state.products.map(p => 
          p.id === action.payload.id ? action.payload : p
        ),
      };
    
    case 'REMOVE_PRODUCT':
      return {
        ...state,
        products: state.products.filter(p => p.id !== action.payload),
        selectedIds: new Set([...state.selectedIds].filter(id => id !== action.payload)),
      };
    
    case 'SET_FILTERS':
      return {
        ...state,
        filters: { ...state.filters, ...action.payload },
        pagination: { ...state.pagination, page: 1 },
      };
    
    case 'RESET_FILTERS':
      return {
        ...state,
        filters: DEFAULT_FILTERS,
        pagination: { ...state.pagination, page: 1 },
      };
    
    case 'SET_PAGINATION':
      return {
        ...state,
        pagination: { ...state.pagination, ...action.payload },
      };
    
    case 'SET_SELECTION':
      return { ...state, selectedIds: action.payload };
    
    case 'TOGGLE_SELECTION': {
      const newSelection = new Set(state.selectedIds);
      if (newSelection.has(action.payload)) {
        newSelection.delete(action.payload);
      } else {
        newSelection.add(action.payload);
      }
      return { ...state, selectedIds: newSelection };
    }
    
    case 'SELECT_ALL': {
      const filteredProducts = applyFilters(state.products, state.filters);
      const pageProducts = paginateProducts(filteredProducts, state.pagination);
      return { ...state, selectedIds: new Set(pageProducts.map(p => p.id)) };
    }
    
    case 'DESELECT_ALL':
      return { ...state, selectedIds: new Set() };
    
    case 'OPEN_DETAIL':
      return {
        ...state,
        productDetail: {
          isOpen: true,
          product: action.payload,
          isEditing: false,
          editedFields: {},
          isSaving: false,
          saveError: null,
        },
      };
    
    case 'CLOSE_DETAIL':
      return { ...state, productDetail: INITIAL_PRODUCT_DETAIL };
    
    case 'SET_EDITING':
      return {
        ...state,
        productDetail: {
          ...state.productDetail,
          isEditing: action.payload,
          editedFields: action.payload && state.productDetail.product 
            ? { ...state.productDetail.product }
            : {},
        },
      };
    
    case 'UPDATE_EDITED_FIELDS':
      return {
        ...state,
        productDetail: {
          ...state.productDetail,
          editedFields: { ...state.productDetail.editedFields, ...action.payload },
        },
      };
    
    case 'SET_SAVING':
      return {
        ...state,
        productDetail: { ...state.productDetail, isSaving: action.payload },
      };
    
    case 'SET_SAVE_ERROR':
      return {
        ...state,
        productDetail: { 
          ...state.productDetail, 
          saveError: action.payload,
          isSaving: false,
        },
      };
    
    case 'OPEN_BULK_ACTION':
      return {
        ...state,
        bulkAction: {
          ...INITIAL_BULK_ACTION,
          isOpen: true,
          action: action.payload,
          selectedIds: state.selectedIds,
        },
      };
    
    case 'CLOSE_BULK_ACTION':
      return { ...state, bulkAction: INITIAL_BULK_ACTION };
    
    case 'SET_BULK_PROCESSING':
      return {
        ...state,
        bulkAction: { ...state.bulkAction, isProcessing: action.payload },
      };
    
    case 'SET_BULK_PROGRESS':
      return {
        ...state,
        bulkAction: { ...state.bulkAction, progress: action.payload },
      };
    
    case 'ADD_BULK_RESULT':
      return {
        ...state,
        bulkAction: {
          ...state.bulkAction,
          results: [...state.bulkAction.results, action.payload],
        },
      };
    
    case 'SET_BULK_ERROR':
      return {
        ...state,
        bulkAction: { ...state.bulkAction, error: action.payload },
      };
    
    case 'OPEN_CONFIRMATION':
      return {
        ...state,
        confirmation: { ...action.payload, isOpen: true, isProcessing: false },
      };
    
    case 'CLOSE_CONFIRMATION':
      return { ...state, confirmation: INITIAL_CONFIRMATION };
    
    case 'SET_CONFIRMATION_PROCESSING':
      return {
        ...state,
        confirmation: { ...state.confirmation, isProcessing: action.payload },
      };
    
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
    
    case 'SET_EXPANDED_ROW':
      return { ...state, expandedRowId: action.payload };
    
    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a product is stale (hasn't been price-checked recently)
 */
function isProductStale(product: Product): boolean {
  if (!product.last_price_check) return true;
  
  const lastCheck = new Date(product.last_price_check).getTime();
  const thresholdMs = STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - lastCheck > thresholdMs;
}

/**
 * Get days since last price check
 */
function getDaysSinceLastCheck(product: Product): number | null {
  if (!product.last_price_check) return null;
  
  const lastCheck = new Date(product.last_price_check).getTime();
  return Math.floor((Date.now() - lastCheck) / (1000 * 60 * 60 * 24));
}

/**
 * Get profit status based on margin
 */
function getProfitStatus(margin: number | null): ProfitStatus {
  if (margin === null || margin === undefined) return 'unknown';
  if (margin >= MARGIN_THRESHOLD * 2) return 'profitable';
  if (margin >= MARGIN_THRESHOLD) return 'below_threshold';
  return 'unknown';
}

/**
 * Apply filters to products array
 */
function applyFilters(products: Product[], filters: ProductFiltersState): Product[] {
  return products.filter(product => {
    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesSearch = 
        product.title.toLowerCase().includes(searchLower) ||
        (product.asin != null && product.asin.toLowerCase().includes(searchLower)) ||
        (product.description != null && product.description.toLowerCase().includes(searchLower));
      if (!matchesSearch) return false;
    }

    // Status filter
    if (filters.status !== 'all' && product.status !== filters.status) {
      return false;
    }

    // Profit status filter
    if (filters.profitStatus !== 'all') {
      const status = getProfitStatus(product.profit_margin);
      if (status !== filters.profitStatus) return false;
    }

    // Category filter
    if (filters.category !== 'all' && product.category !== filters.category) {
      return false;
    }

    // Stale filter
    if (filters.showStaleOnly && !isProductStale(product)) {
      return false;
    }

    // Synced filter (API returns shopify_product_id; UI may use shopify_id)
    const shopifyId = product.shopify_id ?? (product as { shopify_product_id?: string | null }).shopify_product_id;
    if (filters.showSyncedOnly && !shopifyId) {
      return false;
    }

    // Price range filter
    if (filters.minPrice !== null && (product.retail_price ?? 0) < filters.minPrice) {
      return false;
    }
    if (filters.maxPrice !== null && (product.retail_price ?? 0) > filters.maxPrice) {
      return false;
    }

    // Margin range filter
    if (filters.minMargin !== null && (product.profit_margin ?? 0) < filters.minMargin) {
      return false;
    }
    if (filters.maxMargin !== null && (product.profit_margin ?? 0) > filters.maxMargin) {
      return false;
    }

    return true;
  });
}

/**
 * Sort products array
 */
function sortProducts(products: Product[], sortBy: SortField, sortOrder: 'asc' | 'desc'): Product[] {
  const sorted = [...products].sort((a, b) => {
    let aVal: number | string | null;
    let bVal: number | string | null;

    switch (sortBy) {
      case 'title':
        aVal = a.title.toLowerCase();
        bVal = b.title.toLowerCase();
        break;
      case 'created_at':
        aVal = new Date(a.created_at).getTime();
        bVal = new Date(b.created_at).getTime();
        break;
      case 'updated_at':
        aVal = new Date(a.updated_at).getTime();
        bVal = new Date(b.updated_at).getTime();
        break;
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
      case 'rating':
        aVal = a.rating ?? -Infinity;
        bVal = b.rating ?? -Infinity;
        break;
      case 'review_count':
        aVal = a.review_count ?? -Infinity;
        bVal = b.review_count ?? -Infinity;
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  return sorted;
}

/**
 * Paginate products array
 */
function paginateProducts(products: Product[], pagination: PaginationState): Product[] {
  const start = (pagination.page - 1) * pagination.pageSize;
  const end = start + pagination.pageSize;
  return products.slice(start, end);
}

/**
 * Get unique categories from products
 */
function getUniqueCategories(products: Product[]): string[] {
  const categories = new Set<string>();
  products.forEach(p => {
    if (p.category) categories.add(p.category);
  });
  return Array.from(categories).sort();
}

/**
 * Generate CSV from products
 */
function generateProductsCsv(products: Product[]): string {
  const headers = [
    'ASIN',
    'Title',
    'Status',
    // 'Amazon Price',
    'Your Price',
    // 'Profit Margin',
    'Category',
    'Rating',
    'Reviews',
    'Shopify ID',
    'Last Price Check',
    'Created At',
  ];

  const rows = products.map(p => [
    p.asin,
    `"${p.title.replace(/"/g, '""')}"`,
    p.status,
   // p.amazon_price?.toFixed(2) ?? '',
    p.retail_price?.toFixed(2) ?? '',
   // p.profit_margin?.toFixed(1) ?? '',
    p.category ?? '',
    p.rating?.toString() ?? '',
    p.review_count?.toString() ?? '',
    p.shopify_id ?? '',
    p.last_price_check ?? '',
    p.created_at,
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * Download file helper
 */
function downloadFile(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
// CUSTOM HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Debounce hook for search input
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * URL sync hook for filters
 */
function useUrlSync(
  filters: ProductFiltersState,
  pagination: PaginationState,
  setFilters: (filters: Partial<ProductFiltersState>) => void,
  setPagination: (pagination: Partial<PaginationState>) => void,
  onSynced?: () => void
): void {
  // Parse URL on mount (runs once so first fetch uses URL state)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const urlFilters: Partial<ProductFiltersState> = {};
    const urlPagination: Partial<PaginationState> = {};

    if (params.get('search')) urlFilters.search = params.get('search')!;
    if (params.get('status')) urlFilters.status = params.get('status') as ProductStatus | 'all';
    if (params.get('profit')) urlFilters.profitStatus = params.get('profit') as ProfitStatus | 'all';
    if (params.get('category')) urlFilters.category = params.get('category')!;
    if (params.get('sort')) urlFilters.sortBy = params.get('sort') as SortField;
    if (params.get('order')) urlFilters.sortOrder = params.get('order') as 'asc' | 'desc';
    if (params.get('stale') === 'true') urlFilters.showStaleOnly = true;
    if (params.get('synced') === 'true') urlFilters.showSyncedOnly = true;
    if (params.get('page')) urlPagination.page = parseInt(params.get('page')!, 10);
    if (params.get('pageSize')) urlPagination.pageSize = parseInt(params.get('pageSize')!, 10);

    if (Object.keys(urlFilters).length > 0) setFilters(urlFilters);
    if (Object.keys(urlPagination).length > 0) setPagination(urlPagination);
    onSynced?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount; onSynced intentionally not in deps

  // Update URL when filters change
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams();
    
    if (filters.search) params.set('search', filters.search);
    if (filters.status !== 'all') params.set('status', filters.status);
    if (filters.profitStatus !== 'all') params.set('profit', filters.profitStatus);
    if (filters.category !== 'all') params.set('category', filters.category);
    if (filters.sortBy !== 'updated_at') params.set('sort', filters.sortBy);
    if (filters.sortOrder !== 'desc') params.set('order', filters.sortOrder);
    if (filters.showStaleOnly) params.set('stale', 'true');
    if (filters.showSyncedOnly) params.set('synced', 'true');
    if (pagination.page !== 1) params.set('page', pagination.page.toString());
    if (pagination.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', pagination.pageSize.toString());

    const newUrl = params.toString() 
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    
    window.history.replaceState({}, '', newUrl);
  }, [filters, pagination.page, pagination.pageSize]);
}

/**
 * Keyboard navigation hook
 */
function useKeyboardNavigation(
  filteredProducts: Product[],
  selectedIds: Set<string>,
  expandedRowId: string | null,
  dispatch: React.Dispatch<PanelAction>
): void {
  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      // Don't handle if focus is in input
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return;
      }

      // Ctrl/Cmd + A: Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        dispatch({ type: 'SELECT_ALL' });
        return;
      }

      // Escape: Deselect all or close expanded
      if (e.key === 'Escape') {
        if (expandedRowId) {
          dispatch({ type: 'SET_EXPANDED_ROW', payload: null });
        } else if (selectedIds.size > 0) {
          dispatch({ type: 'DESELECT_ALL' });
        }
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredProducts, selectedIds, expandedRowId, dispatch]);
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Status Badge Component
 */
function StatusBadge({ status }: { status: ProductStatus }) {
  const config: Record<ProductStatus, { bg: string; text: string; label: string }> = {
    active: { bg: 'bg-green-100', text: 'text-green-800', label: 'Active' },
    paused: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Paused' },
    pending: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Pending' },
    removed: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Removed' },
  };

  const c = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

/**
 * Profit Badge Component
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
 * Stale Indicator Component
 */
function StaleIndicator({ product }: { product: Product }) {
  const days = getDaysSinceLastCheck(product);
  const isStale = isProductStale(product);

  if (days === null) {
    return (
      <span className="text-xs text-orange-600 flex items-center gap-1" title="Never checked">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        Never
      </span>
    );
  }

  if (isStale) {
    return (
      <span className="text-xs text-orange-600 flex items-center gap-1" title={`Last checked ${days} days ago`}>
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        {days}d
      </span>
    );
  }

  return (
    <span className="text-xs text-gray-500" title={`Last checked ${days} days ago`}>
      {days}d ago
    </span>
  );
}

/**
 * Loading Spinner Component
 */
function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <svg 
      className={`animate-spin ${sizeClasses[size]} text-blue-600`} 
      fill="none" 
      viewBox="0 0 24 24"
    >
      <circle 
        className="opacity-25" 
        cx="12" 
        cy="12" 
        r="10" 
        stroke="currentColor" 
        strokeWidth="4" 
      />
      <path 
        className="opacity-75" 
        fill="currentColor" 
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" 
      />
    </svg>
  );
}

/**
 * Empty State Component
 */
function EmptyState({ 
  title, 
  message, 
  action,
  actionLabel,
  icon,
}: { 
  title: string; 
  message: string; 
  action?: () => void;
  actionLabel?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon || (
        <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      )}
      <h3 className="text-lg font-medium text-gray-900 mb-1">{title}</h3>
      <p className="text-gray-500 mb-4 max-w-sm">{message}</p>
      {action && actionLabel && (
        <button
          onClick={action}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Toast Notification Component
 */
function ToastNotification({ 
  toast, 
  onDismiss 
}: { 
  toast: Toast; 
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  const bgClasses = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    warning: 'bg-yellow-50 border-yellow-200',
    info: 'bg-blue-50 border-blue-200',
  };

  const iconClasses = {
    success: 'text-green-500',
    error: 'text-red-500',
    warning: 'text-yellow-500',
    info: 'text-blue-500',
  };

  const icons = {
    success: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
    ),
  };

  return (
    <div 
      className={`${bgClasses[toast.type]} border rounded-lg shadow-lg p-4 flex items-start gap-3 min-w-[300px] max-w-md animate-slide-in`}
      role="alert"
    >
      <span className={iconClasses[toast.type]}>{icons[toast.type]}</span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900">{toast.title}</p>
        <p className="text-sm text-gray-600 mt-0.5">{toast.message}</p>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-gray-400 hover:text-gray-600"
        aria-label="Dismiss"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Toast Container Component
 */
function ToastContainer({ 
  toasts, 
  onDismiss 
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
 * Confirmation Dialog Component
 */
function ConfirmationDialog({
  state,
  onClose,
  onConfirm,
}: {
  state: ConfirmationState;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!state.isOpen) return null;

  const confirmButtonClasses = {
    danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    warning: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
    primary: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black/50 transition-opacity" 
          onClick={onClose}
          aria-hidden="true"
        />
        
        {/* Dialog */}
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {state.title}
          </h3>
          <p className="text-gray-600 mb-6">
            {state.message}
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={state.isProcessing}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={state.isProcessing}
              className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 flex items-center gap-2 ${confirmButtonClasses[state.confirmVariant]}`}
            >
              {state.isProcessing && <LoadingSpinner size="sm" />}
              {state.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Bulk Action Modal Component
 */
function BulkActionModal({
  state,
  products,
  onClose,
  onExecute,
}: {
  state: BulkActionState;
  products: Product[];
  onClose: () => void;
  onExecute: () => void;
}) {
  if (!state.isOpen || !state.action) return null;

  const selectedProducts = products.filter(p => state.selectedIds.has(p.id));

  const actionConfig: Record<BulkAction, { title: string; description: string; variant: 'danger' | 'warning' | 'primary' }> = {
    refresh: {
      title: 'Refresh Prices',
      description: 'Fetch latest Amazon prices for selected products.',
      variant: 'primary',
    },
    pause: {
      title: 'Pause Products',
      description: 'Pause selected products. They will not be synced to Shopify.',
      variant: 'warning',
    },
    unpause: {
      title: 'Unpause Products',
      description: 'Unpause selected products and resume Shopify sync.',
      variant: 'primary',
    },
    remove: {
      title: 'Remove Products',
      description: 'Permanently remove selected products from your inventory.',
      variant: 'danger',
    },
    export: {
      title: 'Export Products',
      description: 'Download selected products as CSV file.',
      variant: 'primary',
    },
    push_to_shopify: {
      title: 'Push to Shopify',
      description: 'Add selected products to Shopify push queue.',
      variant: 'primary',
    },
  };

  const config = actionConfig[state.action];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div 
          className="fixed inset-0 bg-black/50 transition-opacity" 
          onClick={state.isProcessing ? undefined : onClose}
          aria-hidden="true"
        />
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {config.title}
          </h3>
          <p className="text-gray-600 mb-4">
            {config.description}
          </p>

          {/* Selection summary */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-700">
              <span className="font-medium">{selectedProducts.length}</span> products selected
            </p>
            {selectedProducts.length <= 5 ? (
              <ul className="mt-2 text-sm text-gray-600 space-y-1">
                {selectedProducts.map(p => (
                  <li key={p.id} className="truncate">• {p.title}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-500">
                Including: {selectedProducts.slice(0, 3).map(p => p.title.slice(0, 20)).join(', ')}...
              </p>
            )}
          </div>

          {/* Progress */}
          {state.isProcessing && (
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Processing...</span>
                <span>{state.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${state.progress}%` }}
                />
              </div>
              {state.results.length > 0 && (
                <p className="text-sm text-gray-500 mt-2">
                  {state.results.filter(r => r.success).length} succeeded, {state.results.filter(r => !r.success).length} failed
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {state.error && (
            <div className="mb-4">
              <InlineError error={state.error} />
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={state.isProcessing}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              {state.isProcessing ? 'Close' : 'Cancel'}
            </button>
            {!state.isProcessing && (
              <button
                onClick={onExecute}
                className={`px-4 py-2 text-white rounded-lg flex items-center gap-2 ${
                  config.variant === 'danger' 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : config.variant === 'warning'
                    ? 'bg-yellow-600 hover:bg-yellow-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {config.title}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Product Detail Modal Component
 */
function ProductDetailModal({
  state,
  onClose,
  onSave,
  onEdit,
  onCancelEdit,
  onFieldChange,
  onRefresh,
  onPause,
  onRemove,
}: {
  state: ProductDetailState;
  onClose: () => void;
  onSave: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onFieldChange: (field: keyof Product, value: unknown) => void;
  onRefresh: () => void;
  onPause: () => void;
  onRemove: () => void;
}) {
  if (!state.isOpen || !state.product) return null;

  const product = state.isEditing ? { ...state.product, ...state.editedFields } : state.product;
  const competitorPrices = product.competitor_prices || {};

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div 
          className="fixed inset-0 bg-black/50 transition-opacity" 
          onClick={onClose}
          aria-hidden="true"
        />
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-gray-900">Product Details</h2>
              <StatusBadge status={product.status} />
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left Column - Image & Basic Info */}
              <div className="space-y-4">
                {/* Image */}
                <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                  {product.image_url ? (
                    <img 
                      src={product.image_url} 
                      alt={product.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={onRefresh}
                    className="flex-1 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </button>
                  <button
                    onClick={onPause}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg flex items-center justify-center gap-2 ${
                      product.status === 'paused'
                        ? 'bg-green-50 text-green-700 hover:bg-green-100'
                        : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                    }`}
                  >
                    {product.status === 'paused' ? (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        </svg>
                        Unpause
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Pause
                      </>
                    )}
                  </button>
                </div>

                {/* Amazon Link */}
                <a
                  href={`https://www.amazon.com/dp/${product.asin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-3 py-2 text-sm text-center bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  View on Amazon →
                </a>
              </div>

              {/* Middle Column - Product Details */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  {state.isEditing ? (
                    <input
                      type="text"
                      value={state.editedFields.title ?? product.title}
                      onChange={(e) => onFieldChange('title', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  ) : (
                    <p className="text-gray-900">{product.title}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ASIN</label>
                    <p className="font-mono text-gray-900">{product.asin}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    {state.isEditing ? (
                      <input
                        type="text"
                        value={state.editedFields.category ?? product.category ?? ''}
                        onChange={(e) => onFieldChange('category', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    ) : (
                      <p className="text-gray-900">{product.category || '-'}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
                    <p className="text-gray-900">{product.rating ?? '-'} ⭐</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reviews</label>
                    <p className="text-gray-900">{product.review_count?.toLocaleString() ?? '-'}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  {state.isEditing ? (
                    <textarea
                      value={state.editedFields.description ?? product.description ?? ''}
                      onChange={(e) => onFieldChange('description', e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  ) : (
                    <p className="text-gray-600 text-sm">{product.description || 'No description'}</p>
                  )}
                </div>

                {/* Timestamps */}
                <div className="pt-4 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Timestamps</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Created:</span>{' '}
                      <span className="text-gray-900">{formatRelativeTime(product.created_at)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Updated:</span>{' '}
                      <span className="text-gray-900">{formatRelativeTime(product.updated_at)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Last Check:</span>{' '}
                      <span className="text-gray-900">
                        {product.last_price_check ? formatRelativeTime(product.last_price_check) : 'Never'}
                      </span>
                    </div>
                    <div>
                      <StaleIndicator product={product} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column - Pricing */}
              <div className="space-y-4">
                {/* Pricing Card */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Pricing</h4>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Amazon Cost</span>
                      <span className="font-mono font-medium text-gray-900">
                        {product.amazon_price !== null ? formatPrice(product.amazon_price) : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Your Price</span>
                      {state.isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={state.editedFields.retail_price ?? (product as any).variants?.[0]?.price ?? ''}
                          onChange={(e) => onFieldChange('retail_price', parseFloat(e.target.value))}
                          className="w-24 px-2 py-1 text-right font-mono border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      ) : (
                        <span className="font-mono font-medium text-lg text-green-600">
                          {(product as any).variants?.[0]?.price ? formatPrice(parseFloat((product as any).variants[0].price)) : '-'}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                      <span className="text-gray-600">Profit Margin</span>
                      <ProfitBadge margin={product.profit_margin} />
                    </div>
                  </div>
                </div>

                {/* Competitor Prices */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Competitor Prices</h4>
                  
                  <div className="space-y-2">
                    {Object.entries(competitorPrices).map(([key, value]) => (
                      <div key={key} className="flex justify-between items-center text-sm">
                        <span className="text-gray-600 capitalize">{key.replace('_', ' ')}</span>
                        <span className="font-mono text-gray-900">{formatPrice(value as number)}</span>
                      </div>
                    ))}
                    {Object.keys(competitorPrices).length === 0 && (
                      <p className="text-sm text-gray-400">No competitor prices set</p>
                    )}
                  </div>
                </div>

                {/* Shopify Status */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Shopify</h4>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Synced</span>
                      <span className={product.shopify_id ? 'text-green-600' : 'text-gray-400'}>
                        {product.shopify_id ? '✓ Yes' : 'No'}
                      </span>
                    </div>
                    {product.shopify_id && (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">ID</span>
                          <span className="font-mono text-xs text-gray-900">{product.shopify_id}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Handle</span>
                          <span className="text-xs text-gray-900 truncate max-w-[120px]">
                            {product.shopify_handle || '-'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Save Error */}
            {state.saveError && (
              <div className="mt-4">
                <InlineError error={state.saveError} />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
            <button
              onClick={onRemove}
              className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
            >
              Remove Product
            </button>
            <div className="flex gap-3">
              {state.isEditing ? (
                <>
                  <button
                    onClick={onCancelEdit}
                    disabled={state.isSaving}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onSave}
                    disabled={state.isSaving}
                    className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {state.isSaving && <LoadingSpinner size="sm" />}
                    Save Changes
                  </button>
                </>
              ) : (
                <button
                  onClick={onEdit}
                  className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Edit Product
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Filters Panel Component
 */
function FiltersPanel({
  filters,
  categories,
  onFilterChange,
  onReset,
  isLoading,
}: {
  filters: ProductFiltersState;
  categories: string[];
  onFilterChange: (filters: Partial<ProductFiltersState>) => void;
  onReset: () => void;
  isLoading: boolean;
}) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebounce(searchInput, DEBOUNCE_DELAY);

  // Sync debounced search to filters
  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      onFilterChange({ search: debouncedSearch });
    }
  }, [debouncedSearch, filters.search, onFilterChange]);

  const hasActiveFilters = useMemo(() => {
    return filters.search !== '' ||
      filters.status !== 'all' ||
      filters.profitStatus !== 'all' ||
      filters.category !== 'all' ||
      filters.showStaleOnly ||
      filters.showSyncedOnly ||
      filters.minPrice !== null ||
      filters.maxPrice !== null ||
      filters.minMargin !== null ||
      filters.maxMargin !== null;
  }, [filters]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4" role="search" aria-label="Filter products">
      {/* Search */}
      <div className="relative">
        <label htmlFor="products-search" className="sr-only">Search products</label>
        <input
          id="products-search"
          type="text"
          placeholder="Search by title, ASIN, or description..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          disabled={isLoading}
          aria-label="Search products by title, ASIN, or description"
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
        {searchInput && (
          <button
            onClick={() => setSearchInput('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="Clear search"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap gap-3">
        {/* Status */}
        <label htmlFor="filter-status" className="sr-only">Filter by status</label>
        <select
          id="filter-status"
          value={filters.status}
          onChange={(e) => onFilterChange({ status: e.target.value as ProductStatus | 'all' })}
          disabled={isLoading}
          aria-label="Filter by product status"
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="pending">Pending</option>
          <option value="removed">Removed</option>
        </select>

        {/* Profit Status */}
        <label htmlFor="filter-profit" className="sr-only">Filter by profit margin</label>
        <select
          id="filter-profit"
          value={filters.profitStatus}
          onChange={(e) => onFilterChange({ profitStatus: e.target.value as ProfitStatus | 'all' })}
          disabled={isLoading}
          aria-label="Filter by profit margin"
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50"
        >
          <option value="all">All Margins</option>
          <option value="profitable">Healthy (≥60%)</option>
          <option value="below_threshold">Warning (30-60%)</option>
          <option value="unknown">Low (&lt;30%)</option>
        </select>

        {/* Category */}
        <label htmlFor="filter-category" className="sr-only">Filter by category</label>
        <select
          id="filter-category"
          value={filters.category}
          onChange={(e) => onFilterChange({ category: e.target.value })}
          disabled={isLoading}
          aria-label="Filter by category"
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50"
        >
          <option value="all">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        {/* Stale Toggle */}
        <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
          <input
            type="checkbox"
            checked={filters.showStaleOnly}
            onChange={(e) => onFilterChange({ showStaleOnly: e.target.checked })}
            disabled={isLoading}
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700 whitespace-nowrap">Stale only</span>
        </label>

        {/* Synced Toggle */}
        <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
          <input
            type="checkbox"
            checked={filters.showSyncedOnly}
            onChange={(e) => onFilterChange({ showSyncedOnly: e.target.checked })}
            disabled={isLoading}
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700 whitespace-nowrap">Shopify synced</span>
        </label>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={onReset}
            disabled={isLoading}
            className="px-3 py-2 text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* Sort Row */}
      <div className="flex items-center gap-4 pt-2 border-t border-gray-200">
        <span className="text-sm text-gray-500">Sort by:</span>
        <select
          value={filters.sortBy}
          onChange={(e) => onFilterChange({ sortBy: e.target.value as SortField })}
          disabled={isLoading}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50"
        >
          <option value="updated_at">Last Updated</option>
          <option value="created_at">Date Added</option>
          <option value="title">Title</option>
          <option value="profit_margin">Profit Margin</option>
          <option value="amazon_price">Amazon Price</option>
          <option value="retail_price">Your Price</option>
          <option value="rating">Rating</option>
          <option value="review_count">Review Count</option>
        </select>
        <button
          onClick={() => onFilterChange({ sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' })}
          disabled={isLoading}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50"
          title={filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
        >
          {filters.sortOrder === 'asc' ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * Product Row Component
 */
function ProductRow({
  product,
  isSelected,
  isExpanded,
  onSelect,
  onExpand,
  onViewDetails,
  onRefresh,
  onPause,
  onRemove,
  isLoading,
}: {
  product: Product;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onExpand: () => void;
  onViewDetails: () => void;
  onRefresh: () => void;
  onPause: () => void;
  onRemove: () => void;
  isLoading: boolean;
}) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const needsAttention = useMemo(() => {
    if (product.status === 'removed') return false;
    if (product.profit_margin !== null && product.profit_margin < MARGIN_THRESHOLD) return true;
    if (isProductStale(product)) return true;
    return false;
  }, [product]);

  const handleAction = async (action: string, handler: () => void) => {
    setActionLoading(action);
    try {
      await handler();
    } finally {
      setActionLoading(null);
    }
  };

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
            onChange={onSelect}
            disabled={isLoading}
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            aria-label={`Select ${product.title}`}
          />
        </td>

        {/* Product */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-3">
            {/* Image */}
            <div className="h-12 w-12 flex-shrink-0">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt=""
                  className="h-12 w-12 rounded object-cover bg-gray-100"
                  loading="lazy"
                />
              ) : (
                <div className="h-12 w-12 rounded bg-gray-200 flex items-center justify-center text-gray-400">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="min-w-0">
              <button
                onClick={onViewDetails}
                className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block max-w-xs text-left"
                title={product.title}
              >
                {product.title.length > 50 ? product.title.slice(0, 50) + '...' : product.title}
              </button>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500 font-mono">{product.asin}</span>
                
                {/* AI Score Badge */}
                {(product as any).ai_score && (
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium
                    ${(product as any).ai_score >= 80 ? 'bg-green-100 text-green-800' : 
                      (product as any).ai_score >= 60 ? 'bg-yellow-100 text-yellow-800' : 
                      'bg-red-100 text-red-800'}
                  `}>
                    AI: {(product as any).ai_score}
                  </span>
                )}

                {/* Demand Badge */}
                {(product as any).demand_level && (
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium
                    ${(product as any).demand_level === 'high' ? 'bg-red-100 text-red-800' : 
                      (product as any).demand_level === 'medium' ? 'bg-orange-100 text-orange-800' : 
                      'bg-gray-100 text-gray-800'}
                  `}>
                    {(product as any).demand_level === 'high' ? '🔥' : 
                     (product as any).demand_level === 'medium' ? '⚡' : '📊'}
                  </span>
                )}

                {/* Sync Status */}
                {(product as any).shopify_sync_status === 'synced' && (
                  <span className="text-xs text-green-600">✓ Shopify</span>
                )}
                
                {/* Price Freshness */}
                {(product as any).price_freshness && (product as any).price_freshness !== 'fresh' && (
                  <span className={`text-xs flex items-center gap-1
                    ${(product as any).price_freshness === 'very_stale' ? 'text-red-600' : 'text-orange-600'}
                  `}>
                    {(product as any).days_since_price_check}d
                  </span>
                )}

                {product.review_count && (
                  <span className="text-xs text-gray-400">({product.review_count} reviews)</span>
                )}
              </div>
            </div>
          </div>
        </td>

        {/* Status */}
        <td className="px-3 py-3 whitespace-nowrap">
          <StatusBadge status={product.status} />
        </td>

        {/* Source */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex items-center gap-1">
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
              ${product.source === 'import' ? 'bg-blue-100 text-blue-800' : ''}
              ${product.source === 'shopify' ? 'bg-green-100 text-green-800' : ''}
              ${product.source === 'rainforest' ? 'bg-purple-100 text-purple-800' : ''}
              ${product.source === 'manual' ? 'bg-gray-100 text-gray-800' : ''}
            `}>
              {product.source}
            </span>
            {product.lifecycle_status === 'discontinued' && (
              <span className="text-xs text-red-600">Disc.</span>
            )}
          </div>
        </td>

        {/* Cost */}
        {/* <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900 font-mono">
          {product.cost_price ? formatPrice(product.cost_price) : '-'}
        </td> */}

        {/* Current Price */}
        <td className="px-3 py-3 whitespace-nowrap text-sm font-mono font-medium text-green-600">
          {(product as any).variants?.[0]?.price ? formatPrice(parseFloat((product as any).variants[0].price)) : 'N/A'}
        </td>

        {/* Profit */}
        {/* <td className="px-3 py-3 whitespace-nowrap">
          <ProfitBadge margin={(product as any).profit_margin} />
         {typeof (product as any).profit_margin === 'number' && (
            <div className="text-xs text-gray-500 font-mono">
              {((product as any).profit_margin).toFixed(1)}%
            </div>
          )}
        </td> */}

        {/* Rating */}
        <td className="px-3 py-3 whitespace-nowrap">
          {product.rating !== null ? (
            <div className="flex items-center gap-1">
              <div className="flex items-center">
                <svg className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-xs text-gray-600 ml-1">{product.rating.toFixed(1)}</span>
              </div>
            </div>
          ) : (
            <span className="text-xs text-gray-400">-</span>
          )}
        </td>

        {/* Prime */}
        <td className="px-3 py-3 whitespace-nowrap">
          {product.is_prime ? (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              Prime
            </span>
          ) : (
            <span className="text-xs text-gray-400">-</span>
          )}
        </td>

        {/* Category */}
        <td className="px-3 py-3 whitespace-nowrap">
          <span className="text-xs text-gray-600 truncate block max-w-24" title={product.category || '-'}>
            {product.category || '-'}
          </span>
        </td>

        {/* Actions */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex items-center gap-1">
            {/* Refresh */}
            <button
              onClick={() => handleAction('refresh', onRefresh)}
              disabled={isLoading || actionLoading !== null}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
              title="Refresh prices"
            >
              {actionLoading === 'refresh' ? (
                <LoadingSpinner size="sm" />
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </button>

            {/* Pause/Unpause */}
            <button
              onClick={() => handleAction('pause', onPause)}
              disabled={isLoading || actionLoading !== null}
              className={`p-1.5 rounded disabled:opacity-50 ${
                product.status === 'paused'
                  ? 'text-green-600 hover:text-green-700 hover:bg-green-50'
                  : 'text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50'
              }`}
              title={product.status === 'paused' ? 'Unpause' : 'Pause'}
            >
              {actionLoading === 'pause' ? (
                <LoadingSpinner size="sm" />
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

            {/* Remove */}
            <button
              onClick={() => handleAction('remove', onRemove)}
              disabled={isLoading || actionLoading !== null}
              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded disabled:opacity-50"
              title="Remove product"
            >
              {actionLoading === 'remove' ? (
                <LoadingSpinner size="sm" />
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>

            {/* Expand */}
            <button
              onClick={onExpand}
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
          </div>
        </td>
      </tr>

      {/* Expanded Row */}
      {isExpanded && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-6 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {/* Competitor Prices */}
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Competitor Prices</h4>
                <dl className="space-y-1">
                  {Object.entries(product.competitor_prices || {}).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <dt className="text-gray-500 capitalize">{key.replace('_', ' ')}</dt>
                      <dd className="font-mono text-gray-900">{formatPrice(value as number)}</dd>
                    </div>
                  ))}
                  {Object.keys(product.competitor_prices || {}).length === 0 && (
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
                </dl>
              </div>

              {/* Timestamps */}
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Timestamps</h4>
                <dl className="space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Added</dt>
                    <dd className="text-gray-900">{formatRelativeTime(product.created_at)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Updated</dt>
                    <dd className="text-gray-900">{formatRelativeTime(product.updated_at)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Price Check</dt>
                    <dd className="text-gray-900">
                      {product.last_price_check
                        ? formatRelativeTime(product.last_price_check)
                        : 'Never'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Pagination Component
 */
function Pagination({
  pagination,
  onPageChange,
  onPageSizeChange,
  isLoading,
}: {
  pagination: PaginationState;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  isLoading: boolean;
}) {
  const { page, pageSize, totalItems, totalPages } = pagination;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  // Generate page numbers to show
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = [];
    const showPages = 5;
    const half = Math.floor(showPages / 2);

    let startPage = Math.max(1, page - half);
    const endPage = Math.min(totalPages, startPage + showPages - 1);

    if (endPage - startPage < showPages - 1) {
      startPage = Math.max(1, endPage - showPages + 1);
    }

    if (startPage > 1) {
      pages.push(1);
      if (startPage > 2) pages.push('ellipsis');
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) pages.push('ellipsis');
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 px-4 py-3 bg-white border-t border-gray-200">
      {/* Info */}
      <div className="text-sm text-gray-600">
        Showing <span className="font-medium">{start}</span> to{' '}
        <span className="font-medium">{end}</span> of{' '}
        <span className="font-medium">{totalItems}</span> products
      </div>

      {/* Page Size */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">Show:</label>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
          disabled={isLoading}
          className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50"
        >
          {PAGE_SIZE_OPTIONS.map(size => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </div>

      {/* Page Navigation */}
      <div className="flex items-center gap-1">
        {/* Previous */}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1 || isLoading}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Previous page"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Page Numbers */}
        {getPageNumbers().map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`ellipsis-${i}`} className="px-2 text-gray-400">...</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              disabled={isLoading}
              className={`min-w-[36px] h-9 px-3 text-sm rounded transition-colors ${
                p === page
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              } disabled:opacity-50`}
            >
              {p}
            </button>
          )
        )}

        {/* Next */}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages || isLoading}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Next page"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * Action Bar Component
 */
function ActionBar({
  selectedCount,
  filteredCount,
  onSelectAll,
  onDeselectAll,
  onBulkAction,
  onImport,
  onExport,
  isLoading,
}: {
  selectedCount: number;
  filteredCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBulkAction: (action: BulkAction) => void;
  onImport: () => void;
  onExport: () => void;
  isLoading: boolean;
}) {
  const [showBulkMenu, setShowBulkMenu] = useState(false);

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200">
      {/* Left: Selection */}
      <div className="flex items-center gap-3">
        <button
          onClick={onSelectAll}
          disabled={isLoading}
          className="text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
        >
          Select all ({filteredCount})
        </button>
        {selectedCount > 0 && (
          <>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-blue-600 font-medium">{selectedCount} selected</span>
            <button
              onClick={onDeselectAll}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Export */}
        <button
          onClick={onExport}
          disabled={isLoading}
          className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Export
        </button>

        {/* Import */}
        {/* <button
          onClick={onImport}
          disabled={isLoading}
          className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Import Products
        </button> */}

        {/* Bulk Actions */}
        {selectedCount > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowBulkMenu(!showBulkMenu)}
              disabled={isLoading}
              className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              Bulk Actions ({selectedCount})
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showBulkMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowBulkMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                  <button
                    onClick={() => { setShowBulkMenu(false); onBulkAction('refresh'); }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3"
                  >
                    <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh Prices
                  </button>
                  <button
                    onClick={() => { setShowBulkMenu(false); onBulkAction('push_to_shopify'); }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3"
                  >
                    <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Push to Shopify
                  </button>
                  <button
                    onClick={() => { setShowBulkMenu(false); onBulkAction('pause'); }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3"
                  >
                    <svg className="w-4 h-4 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Pause Products
                  </button>
                  <button
                    onClick={() => { setShowBulkMenu(false); onBulkAction('unpause'); }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3"
                  >
                    <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    </svg>
                    Unpause Products
                  </button>
                  <button
                    onClick={() => { setShowBulkMenu(false); onBulkAction('export'); }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3"
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Export Selected
                  </button>
                  <hr className="my-1" />
                  <button
                    onClick={() => { setShowBulkMenu(false); onBulkAction('remove'); }}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Remove Products
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ProductsPanel({
  initialProducts = [],
  onProductsChange,
  showNewDeals = true,
  className = '',
}: ProductsPanelProps) {
  // Initialize state with reducer
  const [state, dispatch] = useReducer(panelReducer, {
   isLoading: initialProducts.length === 0, // Only load if no initial products
    error: null,
    products: initialProducts, // <--- USE PROP HERE
    filters: DEFAULT_FILTERS,
    pagination: {
      ...DEFAULT_PAGINATION,
      totalItems: initialProducts.length, // <--- UPDATE TOTAL
      totalPages: Math.ceil(initialProducts.length / DEFAULT_PAGE_SIZE), // <--- UPDATE PAGES
    },
    selectedIds: new Set(),
    productDetail: INITIAL_PRODUCT_DETAIL,
    bulkAction: INITIAL_BULK_ACTION,
    confirmation: INITIAL_CONFIRMATION,
    toasts: [],
    expandedRowId: null,
  });

  // Refs
  const tableRef = useRef<HTMLTableElement>(null);
  const [fetchReady, setFetchReady] = useState(false);
  const [lastFetchUrl, setLastFetchUrl] = useState<string | null>(null);
  const [lastFetchResult, setLastFetchResult] = useState<any | null>(null);

  // Fetch products from API (primitive deps only to avoid spurious refetches)
  const fetchProducts = useCallback(async () => {
    try {
      console.log('[ProductsPanel] Starting fetchProducts...');
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      const params = new URLSearchParams();
      params.set('action', 'list');
      params.set('page', state.pagination.page.toString());
      params.set('pageSize', state.pagination.pageSize.toString());

      // Only include non-default / meaningful filters to avoid server-side misinterpretation
      if (state.filters.search && state.filters.search.trim() !== '') {
        params.set('search', state.filters.search.trim());
      }
      if (state.filters.status && state.filters.status !== 'all') {
        params.set('status', state.filters.status);
      }
      if (state.filters.category && state.filters.category !== 'all') {
        params.set('category', state.filters.category);
      }
      if (state.filters.sortBy && state.filters.sortBy !== 'updated_at') {
        params.set('sortBy', state.filters.sortBy);
      }
      if (state.filters.sortOrder && state.filters.sortOrder !== 'desc') {
        params.set('sortOrder', state.filters.sortOrder);
      }
      if (state.filters.showStaleOnly) params.set('showStaleOnly', 'true');
      if (state.filters.showSyncedOnly) params.set('showSyncedOnly', 'true');

      if (state.filters.minPrice != null) params.set('minPrice', state.filters.minPrice.toString());
      if (state.filters.maxPrice != null) params.set('maxPrice', state.filters.maxPrice.toString());
      if (state.filters.minMargin != null) params.set('minMargin', state.filters.minMargin.toString());
      if (state.filters.maxMargin != null) params.set('maxMargin', state.filters.maxMargin.toString());

      const url = `/api/products?${params}`;
      setLastFetchUrl(url);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch products');

      const result = await response.json();

      console.log('[ProductsPanel] API Response:', result);
      setLastFetchResult(result);
      // Also log for quick inspection in browser console
      // (useful if the debug button/panel isn't visible in your build)
      // eslint-disable-next-line no-console
      console.debug('[ProductsPanel] fetched', url, result);
      if (result.success) {
        const rawProducts = result.data?.products ?? [];
        const products = Array.isArray(rawProducts)
          ? rawProducts.map((p: any) => {
              // Normalize common API field differences so UI can render consistently
              const mainImage = p.main_image ?? (Array.isArray(p.images) && p.images[0]?.src) ?? null;
              const imageUrl = p.image_url ?? mainImage ?? null;
              const retailPrice = p.retail_price ?? p.current_price ?? p.price ?? null;
              const amazonPrice = p.amazon_price ?? p.current_price ?? null;

              return {
                ...p,
                // prefer existing keys but provide fallbacks
                main_image: mainImage,
                image_url: imageUrl,
                retail_price: retailPrice,
                amazon_price: amazonPrice,
                cost_price: p.cost_price ?? null,
                shopify_id: p.shopify_id ?? p.shopify_product_id ?? null,
              } as any;
            })
          : [];

        console.log('[ProductsPanel] Processed products:', products.length, products);
        dispatch({ type: 'SET_PRODUCTS', payload: products });
        dispatch({ type: 'SET_PAGINATION', payload: {
          totalItems: result.data?.total ?? products.length,
          totalPages: result.data?.totalPages ?? Math.ceil((result.data?.total ?? products.length) / state.pagination.pageSize),
        }});
      } else {
        throw new Error(result.error || 'Failed to fetch products');
      }
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: { message: error instanceof Error ? error.message : 'Failed to load products' }
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [
    state.pagination.page,
    state.pagination.pageSize,
    state.filters.search,
    state.filters.status,
    state.filters.category,
    state.filters.sortBy,
    state.filters.sortOrder,
    state.filters.showStaleOnly,
    state.filters.showSyncedOnly,
    state.filters.minPrice,
    state.filters.maxPrice,
    state.filters.minMargin,
    state.filters.maxMargin,
  ]);

  // Fetch only after URL sync (avoids double fetch: initial + after URL params)
  useEffect(() => {
    if (!fetchReady) return;
    fetchProducts();
  }, [fetchReady, fetchProducts]);

  // Fallback: Fetch products if URL sync doesn't complete within 2 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!fetchReady && !state.isLoading && state.products.length === 0) {
        console.log('[ProductsPanel] Fallback: URL sync may have failed, fetching products anyway');
        setFetchReady(true);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [fetchReady, state.isLoading, state.products.length]);

  // Computed values
  const categories = useMemo(() => getUniqueCategories(state.products), [state.products]);
  
  const filteredProducts = useMemo(() => {
    const filtered = applyFilters(state.products, state.filters);
    return sortProducts(filtered, state.filters.sortBy, state.filters.sortOrder);
  }, [state.products, state.filters]);

  const paginatedProducts = useMemo(() => {
    return paginateProducts(filteredProducts, state.pagination);
  }, [filteredProducts, state.pagination]);

  // URL sync (onSynced runs after URL is applied so first fetch uses URL state = single fetch)
  useUrlSync(
    state.filters,
    state.pagination,
    (filters) => dispatch({ type: 'SET_FILTERS', payload: filters }),
    (pagination) => dispatch({ type: 'SET_PAGINATION', payload: pagination }),
    () => setFetchReady(true)
  );

  // Small developer debug UI: toggleable panel showing last fetch URL/result
  const [showDebug, setShowDebug] = useState(true);

  // Keyboard navigation
  useKeyboardNavigation(
    filteredProducts,
    state.selectedIds,
    state.expandedRowId,
    dispatch
  );

  // Notify parent of products change
  useEffect(() => {
    onProductsChange?.(state.products);
  }, [state.products]);

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    dispatch({ type: 'ADD_TOAST', payload: toast });
  }, []);

  const removeToast = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_TOAST', payload: id });
  }, []);

  const handleRefreshProduct = useCallback(async (productId: string) => {
    // In real implementation, call API
    console.log('Refreshing product:', productId);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Update product with new prices
    const product = state.products.find(p => p.id === productId);
    if (product) {
      dispatch({
        type: 'UPDATE_PRODUCT',
        payload: {
          ...product,
          last_price_check: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });
    }
    
    addToast({
      type: 'success',
      title: 'Price Refreshed',
      message: 'Product prices have been updated.',
      duration: TOAST_DURATION,
    });
  }, [state.products, addToast]);

  const handlePauseProduct = useCallback(async (productId: string) => {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    const newStatus: ProductStatus = product.status === 'paused' ? 'active' : 'paused';
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    dispatch({
      type: 'UPDATE_PRODUCT',
      payload: {
        ...product,
        status: newStatus,
        updated_at: new Date().toISOString(),
      },
    });
    
    addToast({
      type: 'success',
      title: newStatus === 'paused' ? 'Product Paused' : 'Product Unpaused',
      message: `${product.title.slice(0, 30)}... has been ${newStatus === 'paused' ? 'paused' : 'unpaused'}.`,
      duration: TOAST_DURATION,
    });
  }, [state.products, addToast]);

  const handleRemoveProduct = useCallback((productId: string) => {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    dispatch({
      type: 'OPEN_CONFIRMATION',
      payload: {
        title: 'Remove Product',
        message: `Are you sure you want to remove "${product.title.slice(0, 50)}..."? This action cannot be undone.`,
        confirmLabel: 'Remove',
        confirmVariant: 'danger',
        onConfirm: async () => {
          dispatch({ type: 'SET_CONFIRMATION_PROCESSING', payload: true });
          
          try {
            // Call API to remove product
            const response = await fetch(`/api/products?action=delete&id=${productId}`, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
              },
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Failed to remove product');
            }

            const result = await response.json();
            
            if (result.success) {
              dispatch({ type: 'REMOVE_PRODUCT', payload: productId });
              dispatch({ type: 'CLOSE_CONFIRMATION' });
              
              addToast({
                type: 'success',
                title: 'Product Removed',
                message: 'The product has been removed from your inventory.',
                duration: TOAST_DURATION,
              });
            } else {
              throw new Error(result.error || 'Failed to remove product');
            }
          } catch (error) {
            dispatch({ type: 'SET_CONFIRMATION_PROCESSING', payload: false });
            
            addToast({
              type: 'error',
              title: 'Remove Failed',
              message: error instanceof Error ? error.message : 'Failed to remove product. Please try again.',
              duration: TOAST_DURATION,
            });
          }
        },
      },
    });
  }, [state.products, addToast]);

  const handleBulkAction = useCallback((action: BulkAction) => {
    if (state.selectedIds.size === 0) return;
    
    if (action === 'export') {
      // Export immediately without modal
      const selectedProducts = state.products.filter(p => state.selectedIds.has(p.id));
      const csv = generateProductsCsv(selectedProducts);
      downloadFile(csv, `products-export-${Date.now()}.csv`, 'text/csv');
      
      addToast({
        type: 'success',
        title: 'Export Complete',
        message: `${selectedProducts.length} products exported to CSV.`,
        duration: TOAST_DURATION,
      });
      return;
    }
    
    // Show confirmation dialog for remove action
    if (action === 'remove') {
      dispatch({
        type: 'OPEN_CONFIRMATION',
        payload: {
          title: 'Remove Products',
          message: `Are you sure you want to remove ${state.selectedIds.size} selected product${state.selectedIds.size > 1 ? 's' : ''}? This action cannot be undone.`,
          confirmLabel: 'Remove All',
          confirmVariant: 'danger',
          onConfirm: () => {
            dispatch({ type: 'CLOSE_CONFIRMATION' });
            dispatch({ type: 'OPEN_BULK_ACTION', payload: action });
          },
        },
      });
      return;
    }
    
    dispatch({ type: 'OPEN_BULK_ACTION', payload: action });
  }, [state.selectedIds, state.products, addToast]);

  const executeBulkAction = useCallback(async () => {
    const { action, selectedIds } = state.bulkAction;
    if (!action || selectedIds.size === 0) return;
    
    dispatch({ type: 'SET_BULK_PROCESSING', payload: true });
    
    const ids = Array.from(selectedIds);
    let successCount = 0;
    let failCount = 0;
    
    // Handle bulk remove separately for efficiency
    if (action === 'remove') {
      try {
        dispatch({ type: 'SET_BULK_PROGRESS', payload: 50 });
        
        const response = await fetch('/api/products?bulk=true', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ productIds: ids }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to remove products');
        }

        const result = await response.json();
        
        if (result.success) {
          // Remove all products from state
          ids.forEach(productId => {
            dispatch({ type: 'REMOVE_PRODUCT', payload: productId });
          });
          successCount = ids.length;
          
          dispatch({ type: 'SET_BULK_PROGRESS', payload: 100 });
        } else {
          throw new Error(result.error || 'Failed to remove products');
        }
      } catch (error) {
        failCount = ids.length;
        addToast({
          type: 'error',
          title: 'Bulk Remove Failed',
          message: error instanceof Error ? error.message : 'Failed to remove products. Please try again.',
          duration: TOAST_DURATION,
        });
      }
    } else {
      // Handle other bulk actions individually
      for (let i = 0; i < ids.length; i++) {
        const productId = ids[i];
        const progress = Math.round(((i + 1) / ids.length) * 100);
        dispatch({ type: 'SET_BULK_PROGRESS', payload: progress });
        
        try {
          switch (action) {
            case 'refresh':
              await handleRefreshProduct(productId);
              break;
            case 'pause':
              const pauseProduct = state.products.find(p => p.id === productId);
              if (pauseProduct && pauseProduct.status !== 'paused') {
                dispatch({
                  type: 'UPDATE_PRODUCT',
                  payload: { ...pauseProduct, status: 'paused', updated_at: new Date().toISOString() },
                });
              }
              break;
            case 'unpause':
              const unpauseProduct = state.products.find(p => p.id === productId);
              if (unpauseProduct && unpauseProduct.status === 'paused') {
                dispatch({
                  type: 'UPDATE_PRODUCT',
                  payload: { ...unpauseProduct, status: 'active', updated_at: new Date().toISOString() },
                });
              }
              break;
            case 'push_to_shopify':
              // Would add to Shopify queue
              break;
          }
          
          dispatch({ type: 'ADD_BULK_RESULT', payload: { productId, success: true } });
          successCount++;
        } catch (error) {
          dispatch({
            type: 'ADD_BULK_RESULT',
            payload: {
              productId,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          });
          failCount++;
        }
      }
    }
    
    dispatch({ type: 'SET_BULK_PROCESSING', payload: false });
    dispatch({ type: 'DESELECT_ALL' });
    
    addToast({
      type: failCount > 0 ? 'warning' : 'success',
      title: 'Bulk Action Complete',
      message: `${successCount} succeeded, ${failCount} failed.`,
      duration: TOAST_DURATION,
    });
  }, [state.bulkAction, state.products, handleRefreshProduct, addToast]);

  const handleSaveProduct = useCallback(async () => {
    const { product, editedFields } = state.productDetail;
    if (!product) return;
    
    dispatch({ type: 'SET_SAVING', payload: true });
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update product
      dispatch({
        type: 'UPDATE_PRODUCT',
        payload: {
          ...product,
          ...editedFields,
          updated_at: new Date().toISOString(),
        },
      });
      
      dispatch({ type: 'SET_EDITING', payload: false });
      
      addToast({
        type: 'success',
        title: 'Product Saved',
        message: 'Your changes have been saved.',
        duration: TOAST_DURATION,
      });
    } catch (error) {
      dispatch({
        type: 'SET_SAVE_ERROR',
        payload: {
          code: 'PROD_002',
          message: 'Failed to save product',
          details: error instanceof Error ? error.message : 'Unknown error',
          suggestion: 'Please try again or contact support.',
        },
      });
    }
  }, [state.productDetail, addToast]);

  const handleExportAll = useCallback(() => {
    const productsToExport = state.selectedIds.size > 0
      ? state.products.filter(p => state.selectedIds.has(p.id))
      : filteredProducts;
    
    const csv = generateProductsCsv(productsToExport);
    downloadFile(csv, `products-export-${Date.now()}.csv`, 'text/csv');
    
    addToast({
      type: 'success',
      title: 'Export Complete',
      message: `${productsToExport.length} products exported to CSV.`,
      duration: TOAST_DURATION,
    });
  }, [state.selectedIds, state.products, filteredProducts, addToast]);

  const handleImport = useCallback(() => {
    // Would open import modal
    console.log('Open import modal');
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  // Loading state
  if (state.isLoading && state.products.length === 0) {
    return (
      <div className={`bg-white rounded-lg shadow ${className}`}>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-gray-500">Loading products...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (state.error && state.products.length === 0) {
    return (
      <div className={`bg-white rounded-lg shadow ${className}`}>
        <FeatureStatusBanner
          status={{
            code: state.error.code,
            status: 'error',
            message: state.error.message,
            details: state.error.details,
            suggestion: state.error.suggestion,
            blocking: true,
          }}
          onRetry={() => {
            dispatch({ type: 'SET_ERROR', payload: null });
            dispatch({ type: 'SET_LOADING', payload: true });
            // Would reload products
          }}
        />
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Products</h2>
            <p className="text-sm text-gray-500 mt-1">
              Manage your product inventory and pricing
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
              {state.products.length} total products
            </span>
            <button
              onClick={() => setShowDebug(s => !s)}
              className="ml-3 px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
            >
              {showDebug ? 'Hide' : 'Show'} debug
            </button>
          </div>
        </div>
      </div>

      

      {/* Filters */}
      <div className="px-4 py-4">
        <FiltersPanel
          filters={state.filters}
          categories={categories}
          onFilterChange={(filters) => dispatch({ type: 'SET_FILTERS', payload: filters })}
          onReset={() => dispatch({ type: 'RESET_FILTERS' })}
          isLoading={state.isLoading}
        />
      </div>

      {/* Action Bar */}
      <ActionBar
        selectedCount={state.selectedIds.size}
        filteredCount={filteredProducts.length}
        onSelectAll={() => dispatch({ type: 'SELECT_ALL' })}
        onDeselectAll={() => dispatch({ type: 'DESELECT_ALL' })}
        onBulkAction={handleBulkAction}
        onImport={handleImport}
        onExport={handleExportAll}
        isLoading={state.isLoading}
      />

      {/* Table */}
      {filteredProducts.length === 0 ? (
        <EmptyState
          title="No products found"
          message={
            state.products.length === 0
              ? "You haven't imported any products yet. Start by importing products from Amazon."
              : "No products match your current filters. Try adjusting your search or filter criteria."
          }
          action={state.products.length === 0 ? handleImport : () => dispatch({ type: 'RESET_FILTERS' })}
          actionLabel={state.products.length === 0 ? 'Import Products' : 'Clear Filters'}
        />
      ) : (
        <div className="overflow-x-auto">
          <table ref={tableRef} className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-3 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={state.selectedIds.size === paginatedProducts.length && paginatedProducts.length > 0}
                    onChange={() => {
                      if (state.selectedIds.size === paginatedProducts.length) {
                        dispatch({ type: 'DESELECT_ALL' });
                      } else {
                        dispatch({ type: 'SELECT_ALL' });
                      }
                    }}
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    aria-label="Select all products on this page"
                  />
                </th>
                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source
                </th>
                {/* <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amazon Cost
                </th> */}
                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Your Price
                </th>
                {/* <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Profit
                </th> */}
                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rating
                </th>
                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Prime
                </th>
                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedProducts.map(product => (
                <ProductRow
                  key={product.id}
                  product={product}
                  isSelected={state.selectedIds.has(product.id)}
                  isExpanded={state.expandedRowId === product.id}
                  onSelect={() => dispatch({ type: 'TOGGLE_SELECTION', payload: product.id })}
                  onExpand={() => dispatch({
                    type: 'SET_EXPANDED_ROW',
                    payload: state.expandedRowId === product.id ? null : product.id,
                  })}
                  onViewDetails={() => dispatch({ type: 'OPEN_DETAIL', payload: product })}
                  onRefresh={() => handleRefreshProduct(product.id)}
                  onPause={() => handlePauseProduct(product.id)}
                  onRemove={() => handleRemoveProduct(product.id)}
                  isLoading={state.isLoading}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {filteredProducts.length > 0 && (
        <Pagination
          pagination={state.pagination}
          onPageChange={(page) => dispatch({ type: 'SET_PAGINATION', payload: { page } })}
          onPageSizeChange={(pageSize) => dispatch({
            type: 'SET_PAGINATION',
            payload: {
              pageSize,
              page: 1,
              totalPages: Math.ceil(filteredProducts.length / pageSize),
            },
          })}
          isLoading={state.isLoading}
        />
      )}

      {/* Modals */}
      <ProductDetailModal
        state={state.productDetail}
        onClose={() => dispatch({ type: 'CLOSE_DETAIL' })}
        onSave={handleSaveProduct}
        onEdit={() => dispatch({ type: 'SET_EDITING', payload: true })}
        onCancelEdit={() => dispatch({ type: 'SET_EDITING', payload: false })}
        onFieldChange={(field, value) => dispatch({
          type: 'UPDATE_EDITED_FIELDS',
          payload: { [field]: value },
        })}
        onRefresh={() => {
          if (state.productDetail.product) {
            handleRefreshProduct(state.productDetail.product.id);
          }
        }}
        onPause={() => {
          if (state.productDetail.product) {
            handlePauseProduct(state.productDetail.product.id);
          }
        }}
        onRemove={() => {
          if (state.productDetail.product) {
            handleRemoveProduct(state.productDetail.product.id);
            dispatch({ type: 'CLOSE_DETAIL' });
          }
        }}
      />

      <BulkActionModal
        state={state.bulkAction}
        products={state.products}
        onClose={() => dispatch({ type: 'CLOSE_BULK_ACTION' })}
        onExecute={executeBulkAction}
      />

      <ConfirmationDialog
        state={state.confirmation}
        onClose={() => dispatch({ type: 'CLOSE_CONFIRMATION' })}
        onConfirm={state.confirmation.onConfirm}
      />

      {/* Toasts */}
      <ToastContainer toasts={state.toasts} onDismiss={removeToast} />

      {/* Custom styles for animations */}
      <style jsx global>{`
        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

export default ProductsPanel;

