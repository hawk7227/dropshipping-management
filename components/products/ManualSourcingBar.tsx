'use client';

// components/products/ManualSourcingBar.tsx
// Manual Sourcing Bar - Same criteria as cron jobs, run anytime
// Appears at top of Products page, synced with 4AM cron settings

import { useState, useEffect } from 'react';
import {
  Search, Filter, Play, ChevronDown, ChevronUp,
  RefreshCw, AlertCircle, CheckCircle, Zap, Save, Clock,
  RotateCcw, Settings
} from 'lucide-react';

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
  progress: number;
  currentPhase: string;
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

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ManualSourcingBar({ onSourcingComplete }: ManualSourcingBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const [filters, setFilters] = useState<FilterSettings>({
    min_amazon_price: 3,
    max_amazon_price: 25,
    min_profit_margin: 30,
    min_reviews: 500,
    min_rating: 3.5,
    max_bsr: 100000,
    require_prime: true,
    excluded_brands: ['Apple', 'Nike', 'Samsung', 'Sony', 'Microsoft'],
    max_products_per_run: 1000,
  });
  
  const [status, setStatus] = useState<SourcingStatus>({
    isRunning: false,
    progress: 0,
    currentPhase: '',
    lastRun: null,
  });
  
  const [productsToSource, setProductsToSource] = useState(1000);

  // Fetch settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/settings');
        if (!response.ok) return;
        
        const data = await response.json();
        if (data.success && data.data?.settings) {
          const settingsMap = new Map(
            data.data.settings.map((s: any) => [`${s.category}.${s.key}`, s.value])
          );
          
          setFilters({
            min_amazon_price: JSON.parse(settingsMap.get('filters.min_amazon_price') || '3'),
            max_amazon_price: JSON.parse(settingsMap.get('filters.max_amazon_price') || '25'),
            min_profit_margin: JSON.parse(settingsMap.get('filters.min_profit_margin') || '30'),
            min_reviews: JSON.parse(settingsMap.get('filters.min_reviews') || '500'),
            min_rating: JSON.parse(settingsMap.get('filters.min_rating') || '3.5'),
            max_bsr: JSON.parse(settingsMap.get('filters.max_bsr') || '100000'),
            require_prime: JSON.parse(settingsMap.get('filters.require_prime') || 'true'),
            excluded_brands: JSON.parse(settingsMap.get('filters.excluded_brands') || '[]'),
            max_products_per_run: JSON.parse(settingsMap.get('filters.max_products_per_run') || '1000'),
          });
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSettings();
  }, []);

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'filters',
          settings: { ...filters, max_products_per_run: productsToSource },
        }),
      });
      
      if (!response.ok) throw new Error('Failed to save');
      setMessage({ type: 'success', text: 'Settings saved! Cron jobs will use these settings.' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const runSourcing = async () => {
    setStatus(prev => ({ ...prev, isRunning: true, progress: 0, currentPhase: 'Starting discovery...' }));
    setMessage(null);
    
    try {
      const response = await fetch('/api/cron/discovery/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters,
          maxProducts: productsToSource,
          source: 'manual',
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start sourcing');
      }
      
      const data = await response.json();
      
      setStatus(prev => ({
        ...prev,
        isRunning: false,
        lastRun: {
          timestamp: new Date().toISOString(),
          found: data.data?.found || 0,
          imported: data.data?.imported || 0,
          rejected: data.data?.rejected || 0,
        },
      }));
      
      setMessage({ 
        type: 'success', 
        text: `Sourcing complete! Found ${data.data?.found || 0} products, imported ${data.data?.imported || 0}.`
      });
      
      if (onSourcingComplete) {
        onSourcingComplete(data.data);
      }
    } catch (error) {
      console.error('Sourcing failed:', error);
      setStatus(prev => ({ ...prev, isRunning: false }));
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Sourcing failed' });
    }
  };

  const resetToDefaults = () => {
    setFilters({
      min_amazon_price: 3,
      max_amazon_price: 25,
      min_profit_margin: 30,
      min_reviews: 500,
      min_rating: 3.5,
      max_bsr: 100000,
      require_prime: true,
      excluded_brands: ['Apple', 'Nike', 'Samsung', 'Sony', 'Microsoft'],
      max_products_per_run: 1000,
    });
    setProductsToSource(1000);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-6">
      {/* Header - Always visible */}
      <div 
        className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Search className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Manual Product Sourcing</h3>
            <p className="text-sm text-gray-500">
              Source products using the same criteria as your 4AM cron job
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {status.lastRun && (
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>Last: {new Date(status.lastRun.timestamp).toLocaleString()}</span>
              <span className="text-green-600">Found: {status.lastRun.found}</span>
              <span className="text-blue-600">Imported: {status.lastRun.imported}</span>
            </div>
          )}
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              runSourcing();
            }}
            disabled={status.isRunning}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status.isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                {status.currentPhase || 'Sourcing...'}
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Source Now
              </>
            )}
          </button>
          
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>
      
      {/* Message */}
      {message && (
        <div className={`mx-6 mb-4 p-3 rounded-lg flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          {message.text}
        </div>
      )}
      
      {/* Expanded Filters */}
      {isExpanded && (
        <div className="px-6 pb-6 border-t border-gray-100">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* Info Banner */}
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-blue-800">
                  <Zap className="w-4 h-4" />
                  <span>
                    These settings match your 4AM cron job. Changes here will update the cron settings.
                  </span>
                  <a href="/settings" className="ml-auto flex items-center gap-1 text-blue-600 hover:underline">
                    <Settings className="w-4 h-4" />
                    Full Settings
                  </a>
                </div>
              </div>
              
              {/* Filter Grid */}
              <div className="mt-4 grid grid-cols-6 gap-4">
                {/* Min Price */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Min Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      type="number"
                      value={filters.min_amazon_price}
                      onChange={(e) => setFilters(prev => ({ ...prev, min_amazon_price: parseFloat(e.target.value) }))}
                      className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                
                {/* Max Price */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Max Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      type="number"
                      value={filters.max_amazon_price}
                      onChange={(e) => setFilters(prev => ({ ...prev, max_amazon_price: parseFloat(e.target.value) }))}
                      className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                
                {/* Min Margin */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Min Margin</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={filters.min_profit_margin}
                      onChange={(e) => setFilters(prev => ({ ...prev, min_profit_margin: parseInt(e.target.value) }))}
                      className="w-full pl-3 pr-7 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                  </div>
                </div>
                
                {/* Min Reviews */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Min Reviews</label>
                  <input
                    type="number"
                    value={filters.min_reviews}
                    onChange={(e) => setFilters(prev => ({ ...prev, min_reviews: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                {/* Min Rating */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Min Rating</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      value={filters.min_rating}
                      onChange={(e) => setFilters(prev => ({ ...prev, min_rating: parseFloat(e.target.value) }))}
                      className="w-full pl-3 pr-7 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-yellow-500">⭐</span>
                  </div>
                </div>
                
                {/* Prime Only */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Prime Only</label>
                  <button
                    onClick={() => setFilters(prev => ({ ...prev, require_prime: !prev.require_prime }))}
                    className={`w-full px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
                      filters.require_prime
                        ? 'bg-blue-100 border-blue-300 text-blue-700'
                        : 'bg-gray-100 border-gray-300 text-gray-600'
                    }`}
                  >
                    {filters.require_prime ? '✓ Required' : 'Optional'}
                  </button>
                </div>
              </div>
              
              {/* Second Row */}
              <div className="mt-4 grid grid-cols-3 gap-4">
                {/* Max BSR */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Max BSR</label>
                  <input
                    type="number"
                    value={filters.max_bsr}
                    onChange={(e) => setFilters(prev => ({ ...prev, max_bsr: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                {/* Products to Source */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Products to Source</label>
                  <select
                    value={productsToSource}
                    onChange={(e) => setProductsToSource(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value={100}>100 products</option>
                    <option value={500}>500 products</option>
                    <option value={1000}>1,000 products</option>
                    <option value={5000}>5,000 products</option>
                    <option value={10000}>10,000 products</option>
                    <option value={50000}>50,000 products</option>
                    <option value={100000}>100,000 products</option>
                  </select>
                </div>
                
                {/* Excluded Brands */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Excluded Brands</label>
                  <input
                    type="text"
                    value={filters.excluded_brands.join(', ')}
                    onChange={(e) => setFilters(prev => ({ 
                      ...prev, 
                      excluded_brands: e.target.value.split(',').map(s => s.trim()).filter(Boolean) 
                    }))}
                    placeholder="Apple, Nike, Samsung..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              
              {/* Actions */}
              <div className="mt-4 flex items-center justify-between">
                <button
                  onClick={resetToDefaults}
                  className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset to Defaults
                </button>
                
                <div className="flex items-center gap-3">
                  <button
                    onClick={saveSettings}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? 'Saving...' : 'Save as Cron Settings'}
                  </button>
                  
                  <button
                    onClick={runSourcing}
                    disabled={status.isRunning}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {status.isRunning ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Source {productsToSource.toLocaleString()} Products
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
