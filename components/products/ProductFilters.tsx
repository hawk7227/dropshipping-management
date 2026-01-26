'use client';

// components/products/ProductFilters.tsx
// Filter and search controls for the products list
// Includes status filter, margin filter, search, and sort options

import { useState, useCallback, useMemo } from 'react';
import type { ProductStatus, ProfitStatus } from '@/types';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ProductFiltersState {
  search: string;
  status: ProductStatus | 'all';
  profitStatus: ProfitStatus | 'all';
  sortBy: 'title' | 'created_at' | 'updated_at' | 'profit_margin' | 'amazon_price' | 'retail_price';
  sortOrder: 'asc' | 'desc';
  showStaleOnly: boolean;
}

interface ProductFiltersProps {
  filters: ProductFiltersState;
  onFiltersChange: (filters: ProductFiltersState) => void;
  totalCount: number;
  filteredCount: number;
  selectedCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBulkAction: (action: 'refresh' | 'pause' | 'unpause' | 'remove') => void;
  isLoading?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT FILTERS
// ═══════════════════════════════════════════════════════════════════════════

export const defaultFilters: ProductFiltersState = {
  search: '',
  status: 'all',
  profitStatus: 'all',
  sortBy: 'updated_at',
  sortOrder: 'desc',
  showStaleOnly: false,
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ProductFilters({
  filters,
  onFiltersChange,
  totalCount,
  filteredCount,
  selectedCount,
  onSelectAll,
  onDeselectAll,
  onBulkAction,
  isLoading = false,
}: ProductFiltersProps) {
  const [showBulkMenu, setShowBulkMenu] = useState(false);

  // Update a single filter
  const updateFilter = useCallback(<K extends keyof ProductFiltersState>(
    key: K,
    value: ProductFiltersState[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  }, [filters, onFiltersChange]);

  // Clear all filters
  const clearFilters = useCallback(() => {
    onFiltersChange(defaultFilters);
  }, [onFiltersChange]);

  // Check if filters are active
  const hasActiveFilters = useMemo(() => {
    return filters.search !== '' ||
      filters.status !== 'all' ||
      filters.profitStatus !== 'all' ||
      filters.showStaleOnly;
  }, [filters]);

  // Handle bulk action
  const handleBulkAction = useCallback((action: 'refresh' | 'pause' | 'unpause' | 'remove') => {
    setShowBulkMenu(false);
    onBulkAction(action);
  }, [onBulkAction]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      {/* Top Row: Search and Quick Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search by title or ASIN..."
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={isLoading}
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Status Filter */}
        <select
          value={filters.status}
          onChange={(e) => updateFilter('status', e.target.value as ProductStatus | 'all')}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          disabled={isLoading}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="pending">Pending</option>
          <option value="removed">Removed</option>
        </select>

        {/* Profit Status Filter */}
        <select
          value={filters.profitStatus}
          onChange={(e) => updateFilter('profitStatus', e.target.value as ProfitStatus | 'all')}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          disabled={isLoading}
        >
          <option value="all">All Margins</option>
          <option value="profitable">Profitable (≥60%)</option>
          <option value="below_threshold">Warning (30-60%)</option>
          <option value="unknown">Low (&lt;30%)</option>
        </select>

        {/* Stale Toggle */}
        <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
          <input
            type="checkbox"
            checked={filters.showStaleOnly}
            onChange={(e) => updateFilter('showStaleOnly', e.target.checked)}
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            disabled={isLoading}
          />
          <span className="text-sm text-gray-700 whitespace-nowrap">Stale only</span>
        </label>
      </div>

      {/* Second Row: Sort and Bulk Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        {/* Left: Count and Sort */}
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            Showing <span className="font-medium">{filteredCount}</span> of{' '}
            <span className="font-medium">{totalCount}</span> products
            {selectedCount > 0 && (
              <> · <span className="text-blue-600 font-medium">{selectedCount} selected</span></>
            )}
          </span>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-blue-600 hover:text-blue-800"
              disabled={isLoading}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Right: Sort and Bulk Actions */}
        <div className="flex items-center gap-2">
          {/* Sort */}
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">Sort:</span>
            <select
              value={filters.sortBy}
              onChange={(e) => updateFilter('sortBy', e.target.value as ProductFiltersState['sortBy'])}
              className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              disabled={isLoading}
            >
              <option value="updated_at">Updated</option>
              <option value="created_at">Created</option>
              <option value="title">Title</option>
              <option value="profit_margin">Margin</option>
              <option value="amazon_price">Amazon Price</option>
              <option value="retail_price">Your Price</option>
            </select>
            <button
              onClick={() => updateFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
              className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              title={filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              disabled={isLoading}
            >
              {filters.sortOrder === 'asc' ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
          </div>

          {/* Selection Controls */}
          <div className="flex items-center gap-1 border-l border-gray-200 pl-2 ml-2">
            <button
              onClick={onSelectAll}
              className="px-2 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded"
              disabled={isLoading}
            >
              Select All
            </button>
            {selectedCount > 0 && (
              <button
                onClick={onDeselectAll}
                className="px-2 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded"
                disabled={isLoading}
              >
                Clear
              </button>
            )}
          </div>

          {/* Bulk Actions */}
          {selectedCount > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowBulkMenu(!showBulkMenu)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                disabled={isLoading}
              >
                Bulk Actions ({selectedCount})
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showBulkMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowBulkMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                    <button
                      onClick={() => handleBulkAction('refresh')}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh Prices
                    </button>
                    <button
                      onClick={() => handleBulkAction('pause')}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Pause Products
                    </button>
                    <button
                      onClick={() => handleBulkAction('unpause')}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Unpause Products
                    </button>
                    <hr className="my-1" />
                    <button
                      onClick={() => handleBulkAction('remove')}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
    </div>
  );
}

export default ProductFilters;
