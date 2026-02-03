'use client';

// components/products/ManualSourcingBar.tsx
// Manual Sourcing Bar - Same criteria as cron jobs, run anytime
// Appears at top of Products page, synced with 4AM cron settings
// FIXED: Using inline SVG icons instead of lucide-react

import { useState, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// INLINE SVG ICONS
// ═══════════════════════════════════════════════════════════════════════════

const Icons = {
  Search: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  Filter: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  ),
  Play: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  ChevronDown: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  ChevronUp: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  ),
  RefreshCw: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  AlertCircle: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  CheckCircle: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Zap: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  Save: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
    </svg>
  ),
  Clock: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  RotateCcw: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  ),
  Settings: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface FilterSettings {
  min_amazon_price: number;
  max_amazon_price: number;
  min_profit_margin: number;
  min_reviews: number;
  min_rating: number;
  max_bsr: number;
  require_prime: boolean;
  excluded_brands: string[];
  max_products_per_run: number;
}

interface SourcingStatus {
  isRunning: boolean;
  lastRun: {
    timestamp: string;
    found: number;
    imported: number;
    rejected: number;
  } | null;
}

interface ManualSourcingBarProps {
  onSourcingComplete?: (results: any) => void;
}

const DEFAULT_FILTERS: FilterSettings = {
  min_amazon_price: 3,
  max_amazon_price: 25,
  min_profit_margin: 30,
  min_reviews: 500,
  min_rating: 3.5,
  max_bsr: 100000,
  require_prime: true,
  excluded_brands: ['Apple', 'Nike', 'Samsung', 'Sony', 'Microsoft'],
  max_products_per_run: 1000,
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ManualSourcingBar({ onSourcingComplete }: ManualSourcingBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [filters, setFilters] = useState<FilterSettings>(DEFAULT_FILTERS);
  const [status, setStatus] = useState<SourcingStatus>({
    isRunning: false,
    lastRun: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Load settings from API
  useEffect(() => {
    async function loadSettings() {
      try {
        const response = await fetch('/api/settings');
        const data = await response.json();

        if (data.success && data.data.settings) {
          const filterSettings = data.data.settings.filter((s: any) => s.category === 'filters');
          
          const loadedFilters: Partial<FilterSettings> = {};
          for (const setting of filterSettings) {
            const value = typeof setting.value === 'string' 
              ? JSON.parse(setting.value) 
              : setting.value;
            (loadedFilters as any)[setting.key] = value;
          }

          setFilters(prev => ({ ...prev, ...loadedFilters }));
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
  }, []);

  // Update filter
  const updateFilter = (key: keyof FilterSettings, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  // Save to cron settings
  const saveAsCronSettings = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'filters',
          settings: filters,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save');
      }

      setSuccess('Settings saved! Your 4AM cron job will use these filters.');
      setHasChanges(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  // Run sourcing now
  const runSourcingNow = async () => {
    setStatus(prev => ({ ...prev, isRunning: true }));
    setError(null);

    try {
      const response = await fetch('/api/cron/discovery/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters,
          maxProducts: filters.max_products_per_run,
          source: 'manual',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Sourcing failed');
      }

      setStatus({
        isRunning: false,
        lastRun: {
          timestamp: new Date().toISOString(),
          found: data.data?.found || 0,
          imported: data.data?.imported || 0,
          rejected: data.data?.rejected || 0,
        },
      });

      setSuccess(`Sourcing complete! Found ${data.data?.found || 0} products.`);
      setTimeout(() => setSuccess(null), 5000);

      onSourcingComplete?.(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sourcing failed');
      setStatus(prev => ({ ...prev, isRunning: false }));
    }
  };

  // Reset to defaults
  const resetToDefaults = () => {
    setFilters(DEFAULT_FILTERS);
    setHasChanges(true);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg mb-4">
      {/* Header Bar */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
            <Icons.Search className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Manual Sourcing</h3>
            <p className="text-xs text-gray-500">
              Same criteria as 4AM cron job • Run anytime
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {status.lastRun && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Icons.Clock className="w-3 h-3" />
              Last: {new Date(status.lastRun.timestamp).toLocaleTimeString()}
              ({status.lastRun.imported} imported)
            </span>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              runSourcingNow();
            }}
            disabled={status.isRunning}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {status.isRunning ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Sourcing...
              </>
            ) : (
              <>
                <Icons.Play className="w-4 h-4" />
                Source Now
              </>
            )}
          </button>

          {isExpanded ? (
            <Icons.ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <Icons.ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>

      {/* Expanded Filters */}
      {isExpanded && (
        <div className="px-4 py-4 border-t border-gray-200 bg-gray-50">
          {/* Info Banner */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
            <Icons.Zap className="w-4 h-4 text-blue-600 mt-0.5" />
            <p className="text-sm text-blue-700">
              These settings match your <strong>4AM cron job</strong>. Changes here will update the cron when you click "Save as Cron Settings".
            </p>
          </div>

          {/* Alerts */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <Icons.AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
              <Icons.CheckCircle className="w-4 h-4" />
              <span className="text-sm">{success}</span>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* Filter Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Min Price ($)
                  </label>
                  <input
                    type="number"
                    value={filters.min_amazon_price}
                    onChange={(e) => updateFilter('min_amazon_price', parseFloat(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Max Price ($)
                  </label>
                  <input
                    type="number"
                    value={filters.max_amazon_price}
                    onChange={(e) => updateFilter('max_amazon_price', parseFloat(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Min Margin (%)
                  </label>
                  <input
                    type="number"
                    value={filters.min_profit_margin}
                    onChange={(e) => updateFilter('min_profit_margin', parseInt(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Min Reviews
                  </label>
                  <input
                    type="number"
                    value={filters.min_reviews}
                    onChange={(e) => updateFilter('min_reviews', parseInt(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Min Rating
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="5"
                    value={filters.min_rating}
                    onChange={(e) => updateFilter('min_rating', parseFloat(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Max BSR
                  </label>
                  <input
                    type="number"
                    value={filters.max_bsr}
                    onChange={(e) => updateFilter('max_bsr', parseInt(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Products to Source
                  </label>
                  <select
                    value={filters.max_products_per_run}
                    onChange={(e) => updateFilter('max_products_per_run', parseInt(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={100}>100</option>
                    <option value={500}>500</option>
                    <option value={1000}>1,000</option>
                    <option value={5000}>5,000</option>
                    <option value={10000}>10,000</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.require_prime}
                      onChange={(e) => updateFilter('require_prime', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Prime Only</span>
                  </label>
                </div>
              </div>

              {/* Excluded Brands */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Excluded Brands (comma-separated)
                </label>
                <input
                  type="text"
                  value={filters.excluded_brands.join(', ')}
                  onChange={(e) => updateFilter('excluded_brands', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Apple, Nike, Samsung..."
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                <button
                  onClick={resetToDefaults}
                  className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 text-sm"
                >
                  <Icons.RotateCcw className="w-4 h-4" />
                  Reset to Defaults
                </button>

                <div className="flex items-center gap-3">
                  {hasChanges && (
                    <span className="text-xs text-amber-600">Unsaved changes</span>
                  )}

                  <button
                    onClick={saveAsCronSettings}
                    disabled={isSaving || !hasChanges}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm"
                  >
                    <Icons.Save className="w-4 h-4" />
                    {isSaving ? 'Saving...' : 'Save as Cron Settings'}
                  </button>

                  <button
                    onClick={runSourcingNow}
                    disabled={status.isRunning}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                  >
                    {status.isRunning ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Sourcing...
                      </>
                    ) : (
                      <>
                        <Icons.Zap className="w-4 h-4" />
                        Source Now
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ManualSourcingBar;

