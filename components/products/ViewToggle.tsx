'use client';

// components/products/ViewToggle.tsx
// PRODUCTION toggle between card grid view and table view
// Includes density selector for card view (2/3/4/5 columns)
// Persists user preference in localStorage
// Keyboard shortcuts: Ctrl+1 card, Ctrl+2 table, Ctrl+3/4/5/6 density
// NEW FILE — does not modify any existing files

import { useCallback, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ViewMode = 'card' | 'table';
export type GridDensity = 2 | 3 | 4 | 5;

interface ViewToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  gridDensity: GridDensity;
  onGridDensityChange: (density: GridDensity) => void;
  /** Show product count for context */
  productCount?: number;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOCALSTORAGE PERSISTENCE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const STORAGE_KEY_VIEW = 'products-view-mode';
const STORAGE_KEY_DENSITY = 'products-grid-density';

export function loadViewPreferences(): { viewMode: ViewMode; density: GridDensity } {
  try {
    const viewMode = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY_VIEW)) as ViewMode | null;
    const densityStr = typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY_DENSITY);
    const density = densityStr ? parseInt(densityStr, 10) : null;

    return {
      viewMode: viewMode === 'card' || viewMode === 'table' ? viewMode : 'card',
      density: density === 2 || density === 3 || density === 4 || density === 5 ? density : 4,
    };
  } catch {
    // SSR or localStorage unavailable
    return { viewMode: 'card', density: 4 };
  }
}

function saveViewMode(mode: ViewMode): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_VIEW, mode);
    }
  } catch {
    // localStorage unavailable — fail silently
  }
}

function saveDensity(density: GridDensity): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_DENSITY, String(density));
    }
  } catch {
    // localStorage unavailable — fail silently
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ViewToggle({
  viewMode,
  onViewModeChange,
  gridDensity,
  onGridDensityChange,
  productCount,
  className = '',
}: ViewToggleProps) {

  // ─── Persist preferences ──────────────────────────────────────────────
  const handleViewChange = useCallback((mode: ViewMode) => {
    onViewModeChange(mode);
    saveViewMode(mode);
  }, [onViewModeChange]);

  const handleDensityChange = useCallback((d: GridDensity) => {
    onGridDensityChange(d);
    saveDensity(d);
    // If switching density while in table mode, also switch to card
    if (viewMode === 'table') {
      onViewModeChange('card');
      saveViewMode('card');
    }
  }, [viewMode, onViewModeChange, onGridDensityChange]);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only Ctrl+number shortcuts, and not when typing
      if (!e.ctrlKey && !e.metaKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case '1':
          e.preventDefault();
          handleViewChange('card');
          break;
        case '2':
          e.preventDefault();
          handleViewChange('table');
          break;
        case '3':
          e.preventDefault();
          handleDensityChange(2);
          break;
        case '4':
          e.preventDefault();
          handleDensityChange(3);
          break;
        case '5':
          e.preventDefault();
          handleDensityChange(4);
          break;
        case '6':
          e.preventDefault();
          handleDensityChange(5);
          break;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleViewChange, handleDensityChange]);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Product count context */}
      {productCount !== undefined && (
        <span className="text-sm text-gray-500 hidden sm:inline">
          {productCount.toLocaleString()} product{productCount !== 1 ? 's' : ''}
        </span>
      )}

      {/* View mode toggle */}
      <div
        className="flex items-center bg-gray-100 rounded-lg p-0.5"
        role="radiogroup"
        aria-label="View mode"
      >
        <button
          onClick={() => handleViewChange('card')}
          className={`p-1.5 rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 ${
            viewMode === 'card'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          title="Card view (Ctrl+1)"
          aria-label="Card view"
          aria-checked={viewMode === 'card'}
          role="radio"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        </button>
        <button
          onClick={() => handleViewChange('table')}
          className={`p-1.5 rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 ${
            viewMode === 'table'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          title="Table view (Ctrl+2)"
          aria-label="Table view"
          aria-checked={viewMode === 'table'}
          role="radio"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Density selector — only visible in card mode */}
      {viewMode === 'card' && (
        <div
          className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5"
          role="radiogroup"
          aria-label="Grid density"
        >
          {([2, 3, 4, 5] as GridDensity[]).map((d, i) => (
            <button
              key={d}
              onClick={() => handleDensityChange(d)}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                gridDensity === d
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title={`${d} columns (Ctrl+${i + 3})`}
              aria-label={`${d} column grid`}
              aria-checked={gridDensity === d}
              role="radio"
            >
              {d}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ViewToggle;
