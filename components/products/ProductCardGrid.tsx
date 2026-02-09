'use client';

// components/products/ProductCardGrid.tsx
// PRODUCTION card grid container for the Products V4 page
// Handles: responsive grid layout, density switching, pagination, bulk selection
// with confirmation dialogs, keyboard navigation, scroll management, and all
// empty/loading/error states
// NEW FILE — does not modify any existing files

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { Product } from '@/types';
import { ProductCard } from './ProductCard';
import { SkeletonGrid } from './SkeletonCard';
import type { GridDensity } from './ViewToggle';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ProductCardGridProps {
  products: Product[];
  density: GridDensity;
  isLoading?: boolean;
  /** Page size — number of cards per page */
  pageSize?: number;
  selectedIds: Set<string>;
  onSelectToggle: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onViewDetails: (product: Product) => void;
  onRefresh: (id: string) => Promise<void>;
  onPause: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onSyncShopify?: (id: string) => Promise<void>;
  // Bulk actions
  onBulkSync?: (ids: string[]) => Promise<void>;
  onBulkActivate?: (ids: string[]) => Promise<void>;
  onBulkPause?: (ids: string[]) => Promise<void>;
  onBulkExport?: (ids: string[]) => void;
  onBulkArchive?: (ids: string[]) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_PAGE_SIZE = 24;

const GRID_COLS: Record<GridDensity, string> = {
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  5: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5',
};

// ═══════════════════════════════════════════════════════════════════════════
// CONFIRMATION DIALOG
// ═══════════════════════════════════════════════════════════════════════════

interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor: 'red' | 'green' | 'blue' | 'yellow';
  onConfirm: (() => Promise<void>) | null;
}

const INITIAL_DIALOG: ConfirmDialogState = {
  isOpen: false,
  title: '',
  message: '',
  confirmLabel: 'Confirm',
  confirmColor: 'blue',
  onConfirm: null,
};

function ConfirmDialog({
  state,
  onClose,
}: {
  state: ConfirmDialogState;
  onClose: () => void;
}) {
  const [isExecuting, setIsExecuting] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Focus confirm button on open
  useEffect(() => {
    if (state.isOpen && confirmBtnRef.current) {
      confirmBtnRef.current.focus();
    }
  }, [state.isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!state.isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExecuting) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [state.isOpen, isExecuting, onClose]);

  if (!state.isOpen) return null;

  const handleConfirm = async () => {
    if (!state.onConfirm || isExecuting) return;
    setIsExecuting(true);
    try {
      await state.onConfirm();
      onClose();
    } catch (err) {
      console.error('[ProductCardGrid] Bulk action failed:', err);
    } finally {
      setIsExecuting(false);
    }
  };

  const btnColorMap = {
    red: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    green: 'bg-green-600 hover:bg-green-700 focus:ring-green-500',
    blue: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    yellow: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={!isExecuting ? onClose : undefined}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6 animate-slide-up">
        <h3
          id="confirm-dialog-title"
          className="text-lg font-semibold text-gray-900 mb-2"
        >
          {state.title}
        </h3>
        <p className="text-sm text-gray-600 mb-6">{state.message}</p>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isExecuting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            ref={confirmBtnRef}
            onClick={handleConfirm}
            disabled={isExecuting}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 ${btnColorMap[state.confirmColor]}`}
          >
            {isExecuting ? (
              <span className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              state.confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BULK ACTION BAR
// ═══════════════════════════════════════════════════════════════════════════

function BulkActionBar({
  selectedCount,
  totalCount,
  selectedIds,
  onSelectAll,
  onDeselectAll,
  onRequestConfirm,
  onBulkSync,
  onBulkActivate,
  onBulkPause,
  onBulkExport,
  onBulkArchive,
}: {
  selectedCount: number;
  totalCount: number;
  selectedIds: string[];
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onRequestConfirm: (state: Omit<ConfirmDialogState, 'isOpen'>) => void;
  onBulkSync?: (ids: string[]) => Promise<void>;
  onBulkActivate?: (ids: string[]) => Promise<void>;
  onBulkPause?: (ids: string[]) => Promise<void>;
  onBulkExport?: (ids: string[]) => void;
  onBulkArchive?: (ids: string[]) => Promise<void>;
}) {
  const ids = selectedIds;

  return (
    <div
      className="sticky top-0 z-30 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center justify-between gap-4 animate-fade-in shadow-sm"
      role="toolbar"
      aria-label="Bulk actions"
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-blue-800">
          {selectedCount} of {totalCount} selected
        </span>
        <button
          onClick={selectedCount === totalCount ? onDeselectAll : onSelectAll}
          className="text-xs text-blue-600 hover:text-blue-800 underline focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 rounded"
        >
          {selectedCount === totalCount ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      <div className="flex items-center gap-2">
        {onBulkSync && (
          <BulkBtn
            label={`Sync (${selectedCount})`}
            color="green"
            onClick={() => onRequestConfirm({
              title: 'Sync to Shopify',
              message: `Push ${selectedCount} product${selectedCount > 1 ? 's' : ''} to Shopify with current pricing rules? This will create or update Shopify listings.`,
              confirmLabel: 'Sync to Shopify',
              confirmColor: 'green',
              onConfirm: () => onBulkSync(ids),
            })}
          />
        )}
        {onBulkActivate && (
          <BulkBtn
            label="Activate"
            color="blue"
            onClick={() => onRequestConfirm({
              title: 'Activate Products',
              message: `Set ${selectedCount} product${selectedCount > 1 ? 's' : ''} to active status?`,
              confirmLabel: 'Activate',
              confirmColor: 'blue',
              onConfirm: () => onBulkActivate(ids),
            })}
          />
        )}
        {onBulkPause && (
          <BulkBtn
            label="Pause"
            color="yellow"
            onClick={() => onRequestConfirm({
              title: 'Pause Products',
              message: `Pause ${selectedCount} product${selectedCount > 1 ? 's' : ''}? They will remain in the catalog but won't appear on Shopify.`,
              confirmLabel: 'Pause',
              confirmColor: 'yellow',
              onConfirm: () => onBulkPause(ids),
            })}
          />
        )}
        {onBulkExport && (
          <BulkBtn
            label="Export"
            color="gray"
            onClick={() => onBulkExport(ids)}
          />
        )}
        {onBulkArchive && (
          <BulkBtn
            label="Archive"
            color="red"
            onClick={() => onRequestConfirm({
              title: 'Archive Products',
              message: `Archive ${selectedCount} product${selectedCount > 1 ? 's' : ''}? They will be hidden from the main view and removed from Shopify.`,
              confirmLabel: 'Archive',
              confirmColor: 'red',
              onConfirm: () => onBulkArchive(ids),
            })}
          />
        )}

        <div className="w-px h-5 bg-blue-200 mx-1" />

        <button
          onClick={onDeselectAll}
          className="p-1 text-gray-500 hover:text-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
          title="Cancel selection"
          aria-label="Cancel selection"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function BulkBtn({
  label,
  color,
  onClick,
}: {
  label: string;
  color: 'green' | 'blue' | 'yellow' | 'red' | 'gray';
  onClick: () => void;
}) {
  const colorMap = {
    green: 'text-green-700 bg-green-100 hover:bg-green-200 border-green-200',
    blue: 'text-blue-700 bg-blue-100 hover:bg-blue-200 border-blue-200',
    yellow: 'text-yellow-700 bg-yellow-100 hover:bg-yellow-200 border-yellow-200',
    red: 'text-red-700 bg-red-100 hover:bg-red-200 border-red-200',
    gray: 'text-gray-700 bg-gray-100 hover:bg-gray-200 border-gray-200',
  };

  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium border rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 ${colorMap[color]}`}
    >
      {label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGINATION
// ═══════════════════════════════════════════════════════════════════════════

function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Build page numbers with ellipsis
  const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = [];
  const maxVisible = 7;

  if (totalPages <= maxVisible) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('ellipsis-start');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('ellipsis-end');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between pt-4 border-t border-gray-200">
      {/* Result count */}
      <p className="text-sm text-gray-600">
        Showing <span className="font-medium">{startItem}</span> to{' '}
        <span className="font-medium">{endItem}</span> of{' '}
        <span className="font-medium">{totalItems.toLocaleString()}</span> products
      </p>

      {/* Page buttons */}
      <nav className="flex items-center gap-1" aria-label="Pagination">
        {/* Previous */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-2 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
          aria-label="Previous page"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Page numbers */}
        {pages.map((page) =>
          typeof page === 'string' ? (
            <span key={page} className="px-2 py-1 text-sm text-gray-400">
              ...
            </span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={`min-w-[32px] px-2 py-1 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                page === currentPage
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
              aria-current={page === currentPage ? 'page' : undefined}
              aria-label={`Page ${page}`}
            >
              {page}
            </button>
          )
        )}

        {/* Next */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-2 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
          aria-label="Next page"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </nav>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN GRID COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ProductCardGrid({
  products,
  density,
  isLoading,
  pageSize = DEFAULT_PAGE_SIZE,
  selectedIds,
  onSelectToggle,
  onSelectAll,
  onDeselectAll,
  onViewDetails,
  onRefresh,
  onPause,
  onRemove,
  onSyncShopify,
  onBulkSync,
  onBulkActivate,
  onBulkPause,
  onBulkExport,
  onBulkArchive,
}: ProductCardGridProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(INITIAL_DIALOG);
  const gridRef = useRef<HTMLDivElement>(null);

  const hasSelection = selectedIds.size > 0;

  // ─── Pagination logic ─────────────────────────────────────────────────
  const totalItems = products.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Clamp current page if products list changes (e.g. after filtering)
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Reset to page 1 when products change significantly (new filter applied)
  const prevProductCountRef = useRef(totalItems);
  useEffect(() => {
    const prevCount = prevProductCountRef.current;
    // If count changed by more than pageSize, reset to page 1
    if (Math.abs(totalItems - prevCount) > pageSize) {
      setCurrentPage(1);
    }
    prevProductCountRef.current = totalItems;
  }, [totalItems, pageSize]);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return products.slice(start, start + pageSize);
  }, [products, currentPage, pageSize]);

  // ─── Page change with scroll to top ───────────────────────────────────
  const handlePageChange = useCallback((page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    // Scroll grid container into view
    if (gridRef.current) {
      gridRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [totalPages]);

  // ─── Keyboard navigation ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't handle if dialog open or user is typing in a form element
      if (confirmDialog.isOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case 'ArrowLeft':
          if (currentPage > 1) {
            e.preventDefault();
            handlePageChange(currentPage - 1);
          }
          break;
        case 'ArrowRight':
          if (currentPage < totalPages) {
            e.preventDefault();
            handlePageChange(currentPage + 1);
          }
          break;
        case 'Escape':
          if (hasSelection) {
            e.preventDefault();
            onDeselectAll();
          }
          break;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [currentPage, totalPages, hasSelection, confirmDialog.isOpen, handlePageChange, onDeselectAll]);

  // ─── Confirmation dialog handlers ─────────────────────────────────────
  const requestConfirm = useCallback((state: Omit<ConfirmDialogState, 'isOpen'>) => {
    setConfirmDialog({ ...state, isOpen: true });
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmDialog(INITIAL_DIALOG);
  }, []);

  // ─── Loading state (no products yet) ──────────────────────────────────
  if (isLoading && products.length === 0) {
    return <SkeletonGrid count={pageSize} density={density} />;
  }

  // ─── Empty state ──────────────────────────────────────────────────────
  if (!isLoading && products.length === 0) {
    return null; // Parent component handles the empty state UI
  }

  // ─── Selected IDs as array (for bulk action callbacks) ────────────────
  const selectedArray = Array.from(selectedIds);

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div ref={gridRef} className="space-y-4">
      {/* Bulk action bar — sticky at top when items selected */}
      {hasSelection && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          totalCount={products.length}
          selectedIds={selectedArray}
          onSelectAll={onSelectAll}
          onDeselectAll={onDeselectAll}
          onRequestConfirm={requestConfirm}
          onBulkSync={onBulkSync}
          onBulkActivate={onBulkActivate}
          onBulkPause={onBulkPause}
          onBulkExport={onBulkExport}
          onBulkArchive={onBulkArchive}
        />
      )}

      {/* Loading overlay for background refresh while products are visible */}
      {isLoading && products.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-gray-500" role="status" aria-live="polite">
          <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Refreshing...
        </div>
      )}

      {/* Product card grid */}
      <div
        className={`grid ${GRID_COLS[density]} gap-4`}
        role="list"
        aria-label={`Product grid — page ${currentPage} of ${totalPages}`}
      >
        {paginatedProducts.map(product => (
          <div key={product.id} role="listitem">
            <ProductCard
              product={product}
              isSelected={selectedIds.has(product.id)}
              onSelect={onSelectToggle}
              onViewDetails={onViewDetails}
              onRefresh={onRefresh}
              onPause={onPause}
              onRemove={onRemove}
              onSyncShopify={onSyncShopify}
            />
          </div>
        ))}
      </div>

      {/* Pagination controls */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={handlePageChange}
      />

      {/* Confirmation dialog (rendered via portal-like fixed positioning) */}
      <ConfirmDialog state={confirmDialog} onClose={closeConfirm} />
    </div>
  );
}

export default ProductCardGrid;
