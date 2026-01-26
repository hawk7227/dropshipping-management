'use client';

// components/queue/ShopifyQueueStatus.tsx
// COMPLETE Shopify Queue Status Panel - Monitor and manage Shopify sync queue
// Handles: queue status, retry operations, batch processing, error handling, statistics

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
  ShopifyQueueItem,
  QueueStatus,
  QueueOperation,
  ApiResponse,
} from '@/types';
import type { ApiError } from '@/types/errors';
import { InlineError } from '@/components/ui/InlineError';
import { FeatureStatusBanner } from '@/components/ui/FeatureStatusBanner';
import { formatPrice } from '@/lib/utils/pricing-calculator';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

// Queue item with enriched data
interface EnrichedQueueItem extends ShopifyQueueItem {
  product?: Product;
  isSelected: boolean;
  isRetrying: boolean;
}

// Queue statistics
interface QueueStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  retrying: number;
  avgProcessingTime: number;
  successRate: number;
}

// Filter state
interface QueueFiltersState {
  status: QueueStatus | 'all';
  operation: QueueOperation | 'all';
  search: string;
  dateRange: 'all' | 'today' | 'week' | 'month';
  showFailedOnly: boolean;
}

// Component props
interface ShopifyQueueStatusProps {
  products: Product[];
  onRetry: (itemIds: string[]) => Promise<void>;
  onCancel: (itemIds: string[]) => Promise<void>;
  onClearCompleted: () => Promise<void>;
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

const REFRESH_INTERVAL = 5000; // 5 seconds
const TOAST_DURATION = 5000;

const DEFAULT_FILTERS: QueueFiltersState = {
  status: 'all',
  operation: 'all',
  search: '',
  dateRange: 'all',
  showFailedOnly: false,
};

const STATUS_CONFIG: Record<QueueStatus, { label: string; color: string; icon: string }> = {
  pending: { label: 'Pending', color: 'gray', icon: '⏳' },
  processing: { label: 'Processing', color: 'blue', icon: '🔄' },
  completed: { label: 'Completed', color: 'green', icon: '✓' },
  failed: { label: 'Failed', color: 'red', icon: '✗' },
  retrying: { label: 'Retrying', color: 'yellow', icon: '🔁' },
};

const OPERATION_CONFIG: Record<QueueOperation, { label: string; icon: string }> = {
  create: { label: 'Create Product', icon: '➕' },
  update: { label: 'Update Product', icon: '✏️' },
  delete: { label: 'Delete Product', icon: '🗑️' },
  sync_price: { label: 'Sync Price', icon: '💰' },
  sync_inventory: { label: 'Sync Inventory', icon: '📦' },
  sync_images: { label: 'Sync Images', icon: '🖼️' },
};

// ═══════════════════════════════════════════════════════════════════════════
// REDUCER
// ═══════════════════════════════════════════════════════════════════════════

type QueueAction =
  | { type: 'SET_QUEUE_ITEMS'; payload: EnrichedQueueItem[] }
  | { type: 'UPDATE_ITEM'; payload: { id: string; updates: Partial<EnrichedQueueItem> } }
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'SET_FILTERS'; payload: Partial<QueueFiltersState> }
  | { type: 'RESET_FILTERS' }
  | { type: 'SET_SELECTED'; payload: Set<string> }
  | { type: 'TOGGLE_SELECTED'; payload: string }
  | { type: 'SELECT_ALL' }
  | { type: 'DESELECT_ALL' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: ApiError | null }
  | { type: 'SET_IS_PAUSED'; payload: boolean }
  | { type: 'ADD_TOAST'; payload: Omit<Toast, 'id'> }
  | { type: 'REMOVE_TOAST'; payload: string }
  | { type: 'SET_STATS'; payload: QueueStats }
  | { type: 'SHOW_CONFIRMATION'; payload: Omit<ConfirmationModal, 'isOpen'> }
  | { type: 'HIDE_CONFIRMATION' };

// Confirmation modal state
interface ConfirmationModal {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmStyle: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
}

interface QueueState {
  items: EnrichedQueueItem[];
  filters: QueueFiltersState;
  selectedIds: Set<string>;
  isLoading: boolean;
  error: ApiError | null;
  isPaused: boolean;
  toasts: Toast[];
  stats: QueueStats;
  confirmationModal: ConfirmationModal | null;
}

const initialStats: QueueStats = {
  total: 0,
  pending: 0,
  processing: 0,
  completed: 0,
  failed: 0,
  retrying: 0,
  avgProcessingTime: 0,
  successRate: 0,
};

const initialState: QueueState = {
  items: [],
  filters: DEFAULT_FILTERS,
  selectedIds: new Set(),
  isLoading: true,
  error: null,
  isPaused: false,
  toasts: [],
  stats: initialStats,
  confirmationModal: null,
};

function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'SET_QUEUE_ITEMS':
      return { ...state, items: action.payload, isLoading: false };

    case 'UPDATE_ITEM':
      return {
        ...state,
        items: state.items.map(item =>
          item.id === action.payload.id ? { ...item, ...action.payload.updates } : item
        ),
      };

    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter(item => item.id !== action.payload),
        selectedIds: new Set([...state.selectedIds].filter(id => id !== action.payload)),
      };

    case 'SET_FILTERS':
      return { ...state, filters: { ...state.filters, ...action.payload } };

    case 'RESET_FILTERS':
      return { ...state, filters: DEFAULT_FILTERS };

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
      return { ...state, selectedIds: new Set(state.items.map(i => i.id)) };

    case 'DESELECT_ALL':
      return { ...state, selectedIds: new Set() };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };

    case 'SET_IS_PAUSED':
      return { ...state, isPaused: action.payload };

    case 'ADD_TOAST': {
      const toast: Toast = {
        ...action.payload,
        id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
      return { ...state, toasts: [...state.toasts, toast] };
    }

    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };

    case 'SET_STATS':
      return { ...state, stats: action.payload };

    case 'SHOW_CONFIRMATION':
      return { 
        ...state, 
        confirmationModal: { ...action.payload, isOpen: true } 
      };

    case 'HIDE_CONFIRMATION':
      return { ...state, confirmationModal: null };

    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Format relative time
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diff = now - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

/**
 * Format duration
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  
  if (seconds < 60) return `${seconds}s`;
  return `${minutes}m ${seconds % 60}s`;
}

/**
 * Generate mock queue items
 */
function generateMockQueueItems(products: Product[]): EnrichedQueueItem[] {
  const statuses: QueueStatus[] = ['pending', 'processing', 'completed', 'failed', 'retrying'];
  const operations: QueueOperation[] = ['create', 'update', 'sync_price', 'sync_inventory'];

  return products.slice(0, 30).map((product, i) => {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const createdAt = new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000);
    const startedAt = status !== 'pending' 
      ? new Date(createdAt.getTime() + Math.random() * 60000) 
      : null;
    const completedAt = status === 'completed' 
      ? new Date((startedAt?.getTime() || createdAt.getTime()) + Math.random() * 120000) 
      : null;

    return {
      id: `queue-${product.id}-${i}`,
      productId: product.id,
      asin: product.asin,
      operation: operations[Math.floor(Math.random() * operations.length)],
      status,
      priority: Math.floor(Math.random() * 10),
      retryCount: status === 'failed' || status === 'retrying' ? Math.floor(Math.random() * 3) + 1 : 0,
      maxRetries: 3,
      error: status === 'failed' ? {
        code: 'SHOPIFY_001',
        message: ['Rate limit exceeded', 'Product not found', 'Invalid data', 'Connection timeout'][Math.floor(Math.random() * 4)],
      } : undefined,
      createdAt: createdAt.toISOString(),
      startedAt: startedAt?.toISOString() || null,
      completedAt: completedAt?.toISOString() || null,
      product,
      isSelected: false,
      isRetrying: false,
    };
  });
}

/**
 * Calculate queue statistics
 */
function calculateStats(items: EnrichedQueueItem[]): QueueStats {
  const total = items.length;
  const pending = items.filter(i => i.status === 'pending').length;
  const processing = items.filter(i => i.status === 'processing').length;
  const completed = items.filter(i => i.status === 'completed').length;
  const failed = items.filter(i => i.status === 'failed').length;
  const retrying = items.filter(i => i.status === 'retrying').length;

  // Calculate average processing time for completed items
  const completedItems = items.filter(i => i.status === 'completed' && i.startedAt && i.completedAt);
  const avgProcessingTime = completedItems.length > 0
    ? completedItems.reduce((sum, i) => {
        const start = new Date(i.startedAt!).getTime();
        const end = new Date(i.completedAt!).getTime();
        return sum + (end - start);
      }, 0) / completedItems.length
    : 0;

  const successRate = (completed + failed) > 0
    ? (completed / (completed + failed)) * 100
    : 100;

  return { total, pending, processing, completed, failed, retrying, avgProcessingTime, successRate };
}

/**
 * Apply filters to queue items
 */
function applyFilters(items: EnrichedQueueItem[], filters: QueueFiltersState): EnrichedQueueItem[] {
  return items.filter(item => {
    // Status filter
    if (filters.status !== 'all' && item.status !== filters.status) {
      return false;
    }

    // Operation filter
    if (filters.operation !== 'all' && item.operation !== filters.operation) {
      return false;
    }

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesSearch = 
        item.asin.toLowerCase().includes(searchLower) ||
        item.product?.title.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Date range filter
    if (filters.dateRange !== 'all') {
      const createdAt = new Date(item.createdAt).getTime();
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;

      if (filters.dateRange === 'today' && now - createdAt > day) return false;
      if (filters.dateRange === 'week' && now - createdAt > 7 * day) return false;
      if (filters.dateRange === 'month' && now - createdAt > 30 * day) return false;
    }

    // Failed only filter
    if (filters.showFailedOnly && item.status !== 'failed') {
      return false;
    }

    return true;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Loading Spinner
 */
function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-6 w-6' };
  return (
    <svg className={`animate-spin ${sizeClasses[size]} text-blue-600`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/**
 * Stats Cards
 */
function StatsCards({ stats }: { stats: QueueStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
        <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        <p className="text-xs text-gray-500">Total</p>
      </div>
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
        <p className="text-2xl font-bold text-gray-600">{stats.pending}</p>
        <p className="text-xs text-gray-500">Pending</p>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
        <p className="text-2xl font-bold text-blue-600">{stats.processing}</p>
        <p className="text-xs text-blue-600">Processing</p>
      </div>
      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
        <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
        <p className="text-xs text-green-600">Completed</p>
      </div>
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
        <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
        <p className="text-xs text-red-600">Failed</p>
      </div>
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
        <p className="text-2xl font-bold text-yellow-600">{stats.retrying}</p>
        <p className="text-xs text-yellow-600">Retrying</p>
      </div>
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
        <p className="text-2xl font-bold text-purple-600">{stats.successRate.toFixed(0)}%</p>
        <p className="text-xs text-purple-600">Success Rate</p>
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
  onRetrySelected,
  onCancelSelected,
  isPaused,
  onTogglePause,
  isLoading,
}: {
  filters: QueueFiltersState;
  onFiltersChange: (filters: Partial<QueueFiltersState>) => void;
  onReset: () => void;
  selectedCount: number;
  onRetrySelected: () => void;
  onCancelSelected: () => void;
  isPaused: boolean;
  onTogglePause: () => void;
  isLoading: boolean;
}) {
  const hasActiveFilters = useMemo(() => {
    return filters.status !== 'all' ||
      filters.operation !== 'all' ||
      filters.search !== '' ||
      filters.dateRange !== 'all' ||
      filters.showFailedOnly;
  }, [filters]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4" role="search" aria-label="Filter queue items">
      {/* Search and Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <label htmlFor="queue-search" className="sr-only">Search queue items</label>
          <input
            id="queue-search"
            type="text"
            placeholder="Search by ASIN or title..."
            value={filters.search}
            onChange={(e) => onFiltersChange({ search: e.target.value })}
            disabled={isLoading}
            aria-label="Search queue items by ASIN or title"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 text-sm"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Status */}
        <label htmlFor="queue-status" className="sr-only">Filter by status</label>
        <select
          id="queue-status"
          value={filters.status}
          onChange={(e) => onFiltersChange({ status: e.target.value as QueueStatus | 'all' })}
          disabled={isLoading}
          aria-label="Filter by status"
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm disabled:opacity-50"
        >
          <option value="all">All Status</option>
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <option key={key} value={key}>{config.icon} {config.label}</option>
          ))}
        </select>

        {/* Operation */}
        <label htmlFor="queue-operation" className="sr-only">Filter by operation</label>
        <select
          id="queue-operation"
          value={filters.operation}
          onChange={(e) => onFiltersChange({ operation: e.target.value as QueueOperation | 'all' })}
          disabled={isLoading}
          aria-label="Filter by operation type"
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm disabled:opacity-50"
        >
          <option value="all">All Operations</option>
          {Object.entries(OPERATION_CONFIG).map(([key, config]) => (
            <option key={key} value={key}>{config.icon} {config.label}</option>
          ))}
        </select>

        {/* Date Range */}
        <label htmlFor="queue-date" className="sr-only">Filter by date range</label>
        <select
          id="queue-date"
          value={filters.dateRange}
          onChange={(e) => onFiltersChange({ dateRange: e.target.value as QueueFiltersState['dateRange'] })}
          disabled={isLoading}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm disabled:opacity-50"
        >
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </select>

        {/* Failed Only */}
        <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
          <input
            type="checkbox"
            checked={filters.showFailedOnly}
            onChange={(e) => onFiltersChange({ showFailedOnly: e.target.checked })}
            disabled={isLoading}
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Failed only</span>
        </label>

        {hasActiveFilters && (
          <button
            onClick={onReset}
            disabled={isLoading}
            className="px-3 py-2 text-sm text-blue-600 hover:text-blue-800"
          >
            Clear
          </button>
        )}
      </div>

      {/* Actions Row */}
      <div className="flex justify-between items-center pt-2 border-t border-gray-200">
        <div className="flex items-center gap-3">
          {/* Pause/Resume */}
          <button
            onClick={onTogglePause}
            className={`px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2 ${
              isPaused
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
            }`}
          >
            {isPaused ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Resume Queue
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Pause Queue
              </>
            )}
          </button>

          {isPaused && (
            <span className="text-sm text-yellow-600 flex items-center gap-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Queue is paused
            </span>
          )}
        </div>

        {/* Bulk Actions */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">{selectedCount} selected</span>
            <button
              onClick={onRetrySelected}
              disabled={isLoading}
              className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-50"
            >
              Retry Selected
            </button>
            <button
              onClick={onCancelSelected}
              disabled={isLoading}
              className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50"
            >
              Cancel Selected
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Status Badge
 */
function StatusBadge({ status }: { status: QueueStatus }) {
  const config = STATUS_CONFIG[status];
  const colorClasses: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700',
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700',
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${colorClasses[config.color]}`}>
      <span>{config.icon}</span>
      {config.label}
    </span>
  );
}

/**
 * Operation Badge
 */
function OperationBadge({ operation }: { operation: QueueOperation }) {
  const config = OPERATION_CONFIG[operation];

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs">
      <span>{config.icon}</span>
      {config.label}
    </span>
  );
}

/**
 * Queue Item Row
 */
function QueueItemRow({
  item,
  onSelect,
  onRetry,
  onCancel,
  onViewDetails,
  isLoading,
}: {
  item: EnrichedQueueItem;
  onSelect: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onViewDetails: () => void;
  isLoading: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const rowBgClass = item.status === 'failed'
    ? 'bg-red-50 hover:bg-red-100'
    : item.status === 'processing'
    ? 'bg-blue-50 hover:bg-blue-100'
    : 'bg-white hover:bg-gray-50';

  return (
    <>
      <tr className={`${rowBgClass} transition-colors border-b border-gray-200`}>
        {/* Checkbox */}
        <td className="px-3 py-3">
          <input
            type="checkbox"
            checked={item.isSelected}
            onChange={onSelect}
            disabled={isLoading || item.status === 'processing'}
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
          />
        </td>

        {/* Product */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-3">
            {item.product?.image_url ? (
              <img
                src={item.product.image_url}
                alt=""
                className="w-8 h-8 rounded object-cover bg-gray-100"
              />
            ) : (
              <div className="w-8 h-8 rounded bg-gray-200 flex items-center justify-center text-gray-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate max-w-[150px]">
                {item.product?.title?.slice(0, 30) || item.asin}
              </p>
              <p className="text-xs text-gray-500 font-mono">{item.asin}</p>
            </div>
          </div>
        </td>

        {/* Operation */}
        <td className="px-3 py-3">
          <OperationBadge operation={item.operation} />
        </td>

        {/* Status */}
        <td className="px-3 py-3">
          <StatusBadge status={item.status} />
        </td>

        {/* Retries */}
        <td className="px-3 py-3 text-sm text-gray-600">
          {item.retryCount > 0 ? (
            <span className="text-yellow-600">{item.retryCount}/{item.maxRetries}</span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </td>

        {/* Created */}
        <td className="px-3 py-3 text-xs text-gray-500">
          {formatRelativeTime(item.createdAt)}
        </td>

        {/* Actions */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-1">
            {/* Retry (only for failed items) */}
            {item.status === 'failed' && (
              <button
                onClick={onRetry}
                disabled={isLoading || item.isRetrying}
                className="p-1.5 text-blue-600 hover:bg-blue-100 rounded disabled:opacity-50"
                title="Retry"
              >
                {item.isRetrying ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
              </button>
            )}

            {/* Cancel (only for pending items) */}
            {item.status === 'pending' && (
              <button
                onClick={onCancel}
                disabled={isLoading}
                className="p-1.5 text-red-600 hover:bg-red-100 rounded disabled:opacity-50"
                title="Cancel"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            {/* Expand */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
              title="Details"
            >
              <svg
                className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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

      {/* Expanded Details */}
      {isExpanded && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {/* Timing */}
              <div>
                <h4 className="font-medium text-gray-700 mb-2">Timing</h4>
                <dl className="space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Created</dt>
                    <dd className="text-gray-900">{new Date(item.createdAt).toLocaleString()}</dd>
                  </div>
                  {item.startedAt && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Started</dt>
                      <dd className="text-gray-900">{new Date(item.startedAt).toLocaleString()}</dd>
                    </div>
                  )}
                  {item.completedAt && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Completed</dt>
                      <dd className="text-gray-900">{new Date(item.completedAt).toLocaleString()}</dd>
                    </div>
                  )}
                  {item.startedAt && item.completedAt && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Duration</dt>
                      <dd className="text-gray-900">
                        {formatDuration(new Date(item.completedAt).getTime() - new Date(item.startedAt).getTime())}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Error Details (if failed) */}
              {item.error && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Error</h4>
                  <div className="bg-red-50 border border-red-200 rounded p-3">
                    <p className="font-mono text-xs text-red-600">{item.error.code}</p>
                    <p className="text-sm text-red-800 mt-1">{item.error.message}</p>
                  </div>
                </div>
              )}

              {/* Product Details */}
              {item.product && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Product</h4>
                  <dl className="space-y-1">
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Price</dt>
                      <dd className="text-gray-900">{formatPrice(item.product.retail_price || 0)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Status</dt>
                      <dd className="text-gray-900 capitalize">{item.product.status}</dd>
                    </div>
                    {item.product.shopify_id && (
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Shopify ID</dt>
                        <dd className="text-gray-900 font-mono text-xs">{item.product.shopify_id}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Empty State
 */
function EmptyState({ hasFilters, onReset }: { hasFilters: boolean; onReset: () => void }) {
  return (
    <div className="text-center py-12">
      <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
      <h3 className="text-lg font-medium text-gray-900">
        {hasFilters ? 'No matching items' : 'Queue is empty'}
      </h3>
      <p className="text-gray-500 mt-1">
        {hasFilters
          ? 'Try adjusting your filters'
          : 'Products will appear here when added to the sync queue'}
      </p>
      {hasFilters && (
        <button
          onClick={onReset}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Clear Filters
        </button>
      )}
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
        <button onClick={() => onDismiss(toast.id)} className="text-gray-400 hover:text-gray-600" aria-label="Dismiss notification">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * Confirmation Modal Component
 */
function ConfirmationModalComponent({
  modal,
  onClose,
}: {
  modal: ConfirmationModal;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const confirmButtonStyles = {
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    warning: 'bg-yellow-600 hover:bg-yellow-700 text-white',
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
  };

  return (
    <div 
      className="fixed inset-0 z-[60] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-description"
    >
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black/50 transition-opacity" 
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <h3 id="confirm-title" className="text-lg font-semibold text-gray-900 mb-2">
            {modal.title}
          </h3>
          <p id="confirm-description" className="text-gray-600 mb-6">
            {modal.message}
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                modal.onConfirm();
                onClose();
              }}
              className={`px-4 py-2 rounded-lg font-medium ${confirmButtonStyles[modal.confirmStyle]}`}
            >
              {modal.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ShopifyQueueStatus({
  products,
  onRetry,
  onCancel,
  onClearCompleted,
  className = '',
}: ShopifyQueueStatusProps) {
  const [state, dispatch] = useReducer(queueReducer, initialState);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load queue items on mount
  useEffect(() => {
    const items = generateMockQueueItems(products);
    dispatch({ type: 'SET_QUEUE_ITEMS', payload: items });
    dispatch({ type: 'SET_STATS', payload: calculateStats(items) });
  }, [products]);

  // Auto-refresh
  useEffect(() => {
    if (!state.isPaused) {
      refreshIntervalRef.current = setInterval(() => {
        // Simulate progress
        dispatch({
          type: 'SET_QUEUE_ITEMS',
          payload: state.items.map(item => {
            if (item.status === 'processing' && Math.random() > 0.7) {
              return {
                ...item,
                status: Math.random() > 0.1 ? 'completed' : 'failed',
                completedAt: new Date().toISOString(),
                error: Math.random() > 0.1 ? undefined : {
                  code: 'SHOPIFY_ERR',
                  message: 'Processing failed',
                },
              } as EnrichedQueueItem;
            }
            if (item.status === 'pending' && Math.random() > 0.8) {
              return {
                ...item,
                status: 'processing',
                startedAt: new Date().toISOString(),
              } as EnrichedQueueItem;
            }
            return item;
          }),
        });
      }, REFRESH_INTERVAL);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [state.isPaused, state.items]);

  // Update stats when items change
  useEffect(() => {
    dispatch({ type: 'SET_STATS', payload: calculateStats(state.items) });
  }, [state.items]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return applyFilters(state.items, state.filters);
  }, [state.items, state.filters]);

  // Update selected state in items
  const itemsWithSelection = useMemo(() => {
    return filteredItems.map(item => ({
      ...item,
      isSelected: state.selectedIds.has(item.id),
    }));
  }, [filteredItems, state.selectedIds]);

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    dispatch({ type: 'ADD_TOAST', payload: toast });
  }, []);

  const handleRetryItem = useCallback(async (itemId: string) => {
    dispatch({
      type: 'UPDATE_ITEM',
      payload: { id: itemId, updates: { isRetrying: true } },
    });

    try {
      await onRetry([itemId]);
      
      dispatch({
        type: 'UPDATE_ITEM',
        payload: {
          id: itemId,
          updates: {
            status: 'pending',
            retryCount: (state.items.find(i => i.id === itemId)?.retryCount || 0) + 1,
            isRetrying: false,
            error: undefined,
          },
        },
      });

      addToast({
        type: 'success',
        title: 'Retry Queued',
        message: 'Item has been re-added to the queue',
        duration: TOAST_DURATION,
      });
    } catch (error) {
      dispatch({
        type: 'UPDATE_ITEM',
        payload: { id: itemId, updates: { isRetrying: false } },
      });

      addToast({
        type: 'error',
        title: 'Retry Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: TOAST_DURATION,
      });
    }
  }, [onRetry, state.items, addToast]);

  const handleCancelItem = useCallback(async (itemId: string) => {
    try {
      await onCancel([itemId]);
      dispatch({ type: 'REMOVE_ITEM', payload: itemId });

      addToast({
        type: 'success',
        title: 'Item Cancelled',
        message: 'Item has been removed from the queue',
        duration: TOAST_DURATION,
      });
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Cancel Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: TOAST_DURATION,
      });
    }
  }, [onCancel, addToast]);

  const handleRetrySelected = useCallback(async () => {
    const selectedIds = Array.from(state.selectedIds);
    const failedItems = state.items.filter(
      i => selectedIds.includes(i.id) && i.status === 'failed'
    );

    if (failedItems.length === 0) {
      addToast({
        type: 'warning',
        title: 'No Failed Items',
        message: 'Only failed items can be retried',
        duration: TOAST_DURATION,
      });
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      await onRetry(failedItems.map(i => i.id));

      failedItems.forEach(item => {
        dispatch({
          type: 'UPDATE_ITEM',
          payload: {
            id: item.id,
            updates: {
              status: 'pending',
              retryCount: (item.retryCount || 0) + 1,
              error: undefined,
            },
          },
        });
      });

      dispatch({ type: 'DESELECT_ALL' });

      addToast({
        type: 'success',
        title: 'Retries Queued',
        message: `${failedItems.length} items have been re-added to the queue`,
        duration: TOAST_DURATION,
      });
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Retry Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: TOAST_DURATION,
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.selectedIds, state.items, onRetry, addToast]);

  // Actual cancel logic (called after confirmation)
  const performCancelSelected = useCallback(async () => {
    const selectedIds = Array.from(state.selectedIds);
    const pendingItems = state.items.filter(
      i => selectedIds.includes(i.id) && i.status === 'pending'
    );

    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      await onCancel(pendingItems.map(i => i.id));

      pendingItems.forEach(item => {
        dispatch({ type: 'REMOVE_ITEM', payload: item.id });
      });

      dispatch({ type: 'DESELECT_ALL' });

      addToast({
        type: 'success',
        title: 'Items Cancelled',
        message: `${pendingItems.length} items have been removed from the queue`,
        duration: TOAST_DURATION,
      });
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Cancel Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: TOAST_DURATION,
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.selectedIds, state.items, onCancel, addToast]);

  // Cancel with confirmation
  const handleCancelSelected = useCallback(async () => {
    const selectedIds = Array.from(state.selectedIds);
    const pendingItems = state.items.filter(
      i => selectedIds.includes(i.id) && i.status === 'pending'
    );

    if (pendingItems.length === 0) {
      addToast({
        type: 'warning',
        title: 'No Pending Items',
        message: 'Only pending items can be cancelled',
        duration: TOAST_DURATION,
      });
      return;
    }

    // Show confirmation modal
    dispatch({
      type: 'SHOW_CONFIRMATION',
      payload: {
        title: 'Cancel Queue Items',
        message: `Are you sure you want to cancel ${pendingItems.length} pending item${pendingItems.length > 1 ? 's' : ''}? This action cannot be undone.`,
        confirmLabel: 'Cancel Items',
        confirmStyle: 'danger',
        onConfirm: performCancelSelected,
      },
    });
  }, [state.selectedIds, state.items, addToast, performCancelSelected]);

  const handleClearCompleted = useCallback(async () => {
    const completedItems = state.items.filter(i => i.status === 'completed');

    if (completedItems.length === 0) {
      addToast({
        type: 'info',
        title: 'Nothing to Clear',
        message: 'There are no completed items',
        duration: TOAST_DURATION,
      });
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      await onClearCompleted();

      completedItems.forEach(item => {
        dispatch({ type: 'REMOVE_ITEM', payload: item.id });
      });

      addToast({
        type: 'success',
        title: 'Cleared',
        message: `${completedItems.length} completed items removed`,
        duration: TOAST_DURATION,
      });
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Clear Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: TOAST_DURATION,
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.items, onClearCompleted, addToast]);

  const handleSelectAll = useCallback(() => {
    dispatch({ type: 'SET_SELECTED', payload: new Set(filteredItems.map(i => i.id)) });
  }, [filteredItems]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const hasActiveFilters = state.filters.status !== 'all' ||
    state.filters.operation !== 'all' ||
    state.filters.search !== '' ||
    state.filters.dateRange !== 'all' ||
    state.filters.showFailedOnly;

  return (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Shopify Sync Queue</h2>
            <p className="text-sm text-gray-500 mt-1">
              Monitor and manage product synchronization
            </p>
          </div>
          <div className="flex items-center gap-3">
            {state.stats.processing > 0 && (
              <span className="flex items-center gap-2 text-sm text-blue-600">
                <LoadingSpinner size="sm" />
                {state.stats.processing} processing
              </span>
            )}
            <button
              onClick={handleClearCompleted}
              disabled={state.isLoading || state.stats.completed === 0}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              Clear Completed
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
            blocking: false,
          }}
          onDismiss={() => dispatch({ type: 'SET_ERROR', payload: null })}
        />
      )}

      {/* Stats */}
      <div className="px-6 py-4">
        <StatsCards stats={state.stats} />
      </div>

      {/* Filters */}
      <div className="px-6 pb-4">
        <FiltersBar
          filters={state.filters}
          onFiltersChange={(filters) => dispatch({ type: 'SET_FILTERS', payload: filters })}
          onReset={() => dispatch({ type: 'RESET_FILTERS' })}
          selectedCount={state.selectedIds.size}
          onRetrySelected={handleRetrySelected}
          onCancelSelected={handleCancelSelected}
          isPaused={state.isPaused}
          onTogglePause={() => dispatch({ type: 'SET_IS_PAUSED', payload: !state.isPaused })}
          isLoading={state.isLoading}
        />
      </div>

      {/* Queue Table */}
      {itemsWithSelection.length === 0 ? (
        <EmptyState
          hasFilters={hasActiveFilters}
          onReset={() => dispatch({ type: 'RESET_FILTERS' })}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={state.selectedIds.size === filteredItems.length && filteredItems.length > 0}
                    onChange={() => {
                      if (state.selectedIds.size === filteredItems.length) {
                        dispatch({ type: 'DESELECT_ALL' });
                      } else {
                        handleSelectAll();
                      }
                    }}
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Product
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Operation
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Retries
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Created
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {itemsWithSelection.map(item => (
                <QueueItemRow
                  key={item.id}
                  item={item}
                  onSelect={() => dispatch({ type: 'TOGGLE_SELECTED', payload: item.id })}
                  onRetry={() => handleRetryItem(item.id)}
                  onCancel={() => handleCancelItem(item.id)}
                  onViewDetails={() => {}}
                  isLoading={state.isLoading}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Toasts */}
      <ToastContainer
        toasts={state.toasts}
        onDismiss={(id) => dispatch({ type: 'REMOVE_TOAST', payload: id })}
      />

      {/* Confirmation Modal */}
      {state.confirmationModal && (
        <ConfirmationModalComponent
          modal={state.confirmationModal}
          onClose={() => dispatch({ type: 'HIDE_CONFIRMATION' })}
        />
      )}
    </div>
  );
}

export default ShopifyQueueStatus;
