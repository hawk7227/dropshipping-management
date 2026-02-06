'use client';

// components/products/ManualSourcingBar.tsx
// ENHANCED Manual Sourcing Bar - Open by default, preview products before sourcing
// Same criteria as 4AM cron job • Run anytime
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
  Eye: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
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
  Package: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  DollarSign: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Star: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  TrendingUp: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  X: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
};

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS - Token pricing (same as AIImportBot)
// ═══════════════════════════════════════════════════════════════════════════

const TOKEN_COST_PER_1000 = 0.10; // $0.10 per 1000 tokens
const TOKENS_PER_PRODUCT = 1; // 1 token per product for discovery

function calculateCost(tokens: number): number {
  return (tokens / 1000) * TOKEN_COST_PER_1000;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return '<$0.01';
  return `$${cost.toFixed(2)}`;
}

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

interface PreviewProduct {
  asin: string;
  title: string;
  price: number;
  rating: number;
  reviews: number;
  bsr: number;
  image: string;
  estimatedProfit: number;
  estimatedMargin: number;
}

interface PreviewResult {
  totalFound: number;
  products: PreviewProduct[];
  estimatedTokens: number;
  filters: FilterSettings;
}

interface SourcingStatus {
  isRunning: boolean;
  isPreviewing: boolean;
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
  // OPEN BY DEFAULT
  const [isExpanded, setIsExpanded] = useState(true);
  const [filters, setFilters] = useState<FilterSettings>(DEFAULT_FILTERS);
  const [status, setStatus] = useState<SourcingStatus>({
    isRunning: false,
    isPreviewing: false,
    lastRun: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Preview state
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);

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
    // Clear preview when filters change
    setPreview(null);
    setShowPreview(false);
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

  // Preview products before sourcing
  const previewProducts = async () => {
    setStatus(prev => ({ ...prev, isPreviewing: true }));
    setError(null);

    try {
      // Use the discovery API with search action
      const searchTerms = [
        'kitchen gadgets',
        'phone accessories', 
        'home organization',
        'pet supplies',
        'beauty tools'
      ];
      
      // Search with first term to preview
      const params = new URLSearchParams({
        action: 'search',
        query: searchTerms[0],
        minPrice: filters.min_amazon_price.toString(),
        maxPrice: filters.max_amazon_price.toString(),
        minRating: filters.min_rating.toString(),
        minReviews: filters.min_reviews.toString(),
        primeOnly: filters.require_prime.toString(),
        pageSize: Math.min(filters.max_products_per_run, 20).toString(),
      });

      const response = await fetch(`/api/discovery?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Preview failed');
      }

      // Filter by margin and transform to preview format
      const products = (data.data?.results || data.results || [])
        .filter((p: any) => p.potentialMargin >= filters.min_profit_margin)
        .map((p: any) => ({
          asin: p.asin,
          title: p.title,
          amazonPrice: p.price,
          salesPrice: p.potentialRetailPrice,
          profitAmount: p.potentialProfit,
          profitPercent: p.potentialMargin,
          rating: p.rating,
          reviewCount: p.review_count,
          imageUrl: p.image_url,
          isPrime: p.is_prime,
          category: p.category,
        }));

      // Set preview data
      setPreview({
        totalFound: products.length,
        products: products,
        estimatedTokens: products.length,
        filters: { ...filters },
      });
      setShowPreview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setStatus(prev => ({ ...prev, isPreviewing: false }));
    }
  };

  // Run sourcing now (after preview)
  const runSourcingNow = async () => {
    setStatus(prev => ({ ...prev, isRunning: true }));
    setError(null);

    try {
      // If we have preview products, import them
      if (preview && preview.products.length > 0) {
        const importResults = {
          found: preview.products.length,
          imported: 0,
          rejected: 0,
          errors: [] as string[],
        };

        // Import each product from the preview
        for (const product of preview.products) {
          try {
            const response = await fetch('/api/import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                items: [{
                  asin: product.asin,
                  title: product.title,
                  amazon_price: product.amazonPrice,
                }],
                options: {
                  fetchDetails: true,
                  updateExisting: false,
                  autoPublish: true,
                },
              }),
            });

            const data = await response.json();
            
            if (data.success && data.data?.imported > 0) {
              importResults.imported++;
            } else {
              importResults.rejected++;
              if (data.error) {
                importResults.errors.push(`${product.asin}: ${data.error}`);
              }
            }
          } catch (err) {
            importResults.rejected++;
            importResults.errors.push(`${product.asin}: ${err instanceof Error ? err.message : 'Import failed'}`);
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        setStatus({
          isRunning: false,
          isPreviewing: false,
          lastRun: {
            timestamp: new Date().toISOString(),
            found: importResults.found,
            imported: importResults.imported,
            rejected: importResults.rejected,
          },
        });

        if (importResults.imported > 0) {
          setSuccess(`Sourcing complete! Imported ${importResults.imported} of ${importResults.found} products.`);
        } else {
          setError(`No products imported. ${importResults.errors[0] || 'Check API configuration.'}`);
        }
        
        setShowPreview(false);
        setPreview(null);
        setTimeout(() => setSuccess(null), 5000);

        onSourcingComplete?.(importResults);
      } else {
        setError('No products to import. Run Preview first.');
        setStatus(prev => ({ ...prev, isRunning: false }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sourcing failed');
      setStatus(prev => ({ ...prev, isRunning: false }));
    }
  };

  // Reset to defaults
  const resetToDefaults = () => {
    setFilters(DEFAULT_FILTERS);
    setHasChanges(true);
    setPreview(null);
    setShowPreview(false);
  };

  // Cancel preview
  const cancelPreview = () => {
    setShowPreview(false);
    setPreview(null);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg mb-4 shadow-sm">
      {/* Header Bar */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
            <Icons.Search className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Manual Sourcing</h3>
            <p className="text-xs text-gray-500">
              Same criteria as 4AM cron job • Preview before importing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Token Cost Estimate */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
            <Icons.Zap className="w-4 h-4 text-amber-600" />
            <span className="text-xs text-amber-700">
              ~{filters.max_products_per_run} tokens
            </span>
          </div>

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
              previewProducts();
            }}
            disabled={status.isPreviewing || status.isRunning}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {status.isPreviewing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Scanning...
              </>
            ) : (
              <>
                <Icons.Eye className="w-4 h-4" />
                Preview Products
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

      {/* Preview Modal */}
      {showPreview && preview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden">
            {/* Preview Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Product Preview</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Found <span className="font-semibold text-blue-600">{preview.totalFound}</span> products matching your criteria
                  </p>
                </div>
                <button
                  onClick={cancelPreview}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <Icons.X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Preview Stats */}
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
              <div className="grid grid-cols-5 gap-4">
                <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                  <div className="flex items-center justify-center gap-2 text-blue-600 mb-1">
                    <Icons.Package className="w-4 h-4" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{preview.totalFound}</p>
                  <p className="text-xs text-gray-500">Products Found</p>
                </div>
                <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                  <div className="flex items-center justify-center gap-2 text-green-600 mb-1">
                    <Icons.DollarSign className="w-4 h-4" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">${filters.min_amazon_price}-${filters.max_amazon_price}</p>
                  <p className="text-xs text-gray-500">Price Range</p>
                </div>
                <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                  <div className="flex items-center justify-center gap-2 text-purple-600 mb-1">
                    <Icons.TrendingUp className="w-4 h-4" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{filters.min_profit_margin}%+</p>
                  <p className="text-xs text-gray-500">Min Margin</p>
                </div>
                <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                  <div className="flex items-center justify-center gap-2 text-amber-600 mb-1">
                    <Icons.Zap className="w-4 h-4" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">~{Math.min(preview.totalFound, filters.max_products_per_run)}</p>
                  <p className="text-xs text-gray-500">Tokens Needed</p>
                </div>
                <div className="bg-white rounded-lg p-3 text-center shadow-sm border-2 border-green-300">
                  <div className="flex items-center justify-center gap-2 text-green-600 mb-1">
                    <Icons.DollarSign className="w-4 h-4" />
                  </div>
                  <p className="text-2xl font-bold text-green-600">{formatCost(calculateCost(Math.min(preview.totalFound, filters.max_products_per_run)))}</p>
                  <p className="text-xs text-gray-500">Est. Cost</p>
                </div>
              </div>
            </div>

            {/* Product List */}
            <div className="px-6 py-4 overflow-y-auto max-h-[40vh]">
              {preview.products.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500 mb-3">
                    Showing first {preview.products.length} of {preview.totalFound} products:
                  </p>
                  {preview.products.map((product, index) => (
                    <div
                      key={product.asin || index}
                      className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center overflow-hidden">
                        {product.image ? (
                          <img src={product.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Icons.Package className="w-6 h-6 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {product.title || `Product ${product.asin}`}
                        </p>
                        <p className="text-xs text-gray-500">
                          ASIN: {product.asin} • BSR: {product.bsr?.toLocaleString() || 'N/A'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">${product.price?.toFixed(2) || 'N/A'}</p>
                        <p className="text-xs text-green-600">+{product.estimatedMargin || filters.min_profit_margin}% margin</p>
                      </div>
                      <div className="flex items-center gap-1 text-amber-500">
                        <Icons.Star className="w-4 h-4 fill-current" />
                        <span className="text-sm">{product.rating || 'N/A'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Icons.Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No preview products available.</p>
                  <p className="text-sm">Products will be sourced based on your filters.</p>
                </div>
              )}
            </div>

            {/* Preview Actions */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <button
                onClick={cancelPreview}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                ← Back to Filters
              </button>
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-500">
                  Ready to import up to <span className="font-semibold">{filters.max_products_per_run}</span> products
                </p>
                <button
                  onClick={runSourcingNow}
                  disabled={status.isRunning}
                  className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                >
                  {status.isRunning ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Importing...
                    </>
                  ) : (
                    <>
                      <Icons.Zap className="w-4 h-4" />
                      Import {preview.totalFound > filters.max_products_per_run ? filters.max_products_per_run : preview.totalFound} Products
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expanded Filters */}
      {isExpanded && (
        <div className="px-4 py-4 border-t border-gray-200 bg-gray-50">
          {/* Cost Estimate Banner */}
          <div className="mb-4 p-4 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Icons.Zap className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium text-gray-900">Estimated Cost for {filters.max_products_per_run.toLocaleString()} Products</p>
                  <p className="text-sm text-gray-600">
                    ~{filters.max_products_per_run.toLocaleString()} Keepa tokens • {formatCost(calculateCost(filters.max_products_per_run))}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-green-600">{formatCost(calculateCost(filters.max_products_per_run))}</p>
                <p className="text-xs text-gray-500">Est. Keepa Cost</p>
              </div>
            </div>
          </div>

          {/* Info Banner */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
            <Icons.Eye className="w-4 h-4 text-blue-600 mt-0.5" />
            <p className="text-sm text-blue-700">
              Click <strong>"Preview Products"</strong> to see matching products before importing. 
              Changes here will update the 4AM cron when you click "Save as Cron Settings".
            </p>
          </div>

          {/* Alerts */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <Icons.AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">×</button>
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
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Products to Source
                  </label>
                  <select
                    value={filters.max_products_per_run}
                    onChange={(e) => updateFilter('max_products_per_run', parseInt(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                    onClick={previewProducts}
                    disabled={status.isPreviewing || status.isRunning}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                  >
                    {status.isPreviewing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Scanning...
                      </>
                    ) : (
                      <>
                        <Icons.Eye className="w-4 h-4" />
                        Preview Products
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

