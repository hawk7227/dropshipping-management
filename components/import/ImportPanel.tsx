'use client';

// components/import/ImportPanel.tsx
// COMPLETE Import Panel - Multi-step wizard for importing products
// Handles: file upload (CSV/Excel), Rainforest API discovery, Keepa history,
// data point selection, cost estimation, import execution with progress

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useReducer,
  ChangeEvent,
  DragEvent,
} from 'react';
import type {
  Product,
  RainforestSearchResult,
  KeepaHistoryResult,
  ImportResult,
  ApiResponse,
} from '@/types';
import type { ApiError } from '@/types/errors';
import { InlineError } from '@/components/ui/InlineError';
import { FeatureStatusBanner } from '@/components/ui/FeatureStatusBanner';
import { PRICING_RULES } from '@/lib/config/pricing-rules';
import { calculateRetailPrice, calculateCompetitorPrices, formatPrice } from '@/lib/utils/pricing-calculator';
import { estimateCost, formatCost } from '@/lib/utils/api-cost-estimator';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

// Import steps
type ImportStep = 
  | 'source'      // Step 1: Choose data source
  | 'upload'      // Step 1a: File upload (if file source)
  | 'discover'    // Step 1b: API discovery (if API source)
  | 'select'      // Step 2: Select products to import
  | 'datapoints'  // Step 3: Choose data points to fetch
  | 'estimate'    // Step 4: Review cost estimate
  | 'progress'    // Step 5: Import in progress
  | 'complete';   // Step 6: Import complete

// Data source types
type DataSource = 'file' | 'rainforest' | 'manual';

// File types supported
type FileType = 'csv' | 'xlsx' | 'xls' | 'json';

// Data points that can be fetched
interface DataPointConfig {
  id: string;
  name: string;
  description: string;
  source: 'rainforest' | 'keepa' | 'calculated';
  costPerProduct: number;
  required: boolean;
  enabled: boolean;
}

// Parsed product from file
interface ParsedProduct {
  id: string;
  asin: string;
  title?: string;
  amazonPrice?: number;
  category?: string;
  isValid: boolean;
  validationErrors: string[];
  selected: boolean;
}

// Discovery filters
interface DiscoveryFilters {
  query: string;
  category: string;
  minPrice: number;
  maxPrice: number;
  minRating: number;
  minReviews: number;
  primeOnly: boolean;
}

// Import progress
interface ImportProgress {
  phase: 'validating' | 'fetching_rainforest' | 'fetching_keepa' | 'calculating' | 'saving' | 'complete';
  currentItem: number;
  totalItems: number;
  currentProductAsin: string;
  currentProductTitle: string;
  successCount: number;
  failCount: number;
  errors: Array<{ asin: string; error: string }>;
  startTime: number;
  estimatedTimeRemaining: number;
}

// Component props
interface ImportPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (products: Product[]) => void;
  existingAsins?: Set<string>;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PRODUCTS_PER_IMPORT = 500;
const BATCH_SIZE = 10;
const BATCH_DELAY = 1000; // 1 second between batches

const SUPPORTED_FILE_TYPES: Record<FileType, string[]> = {
  csv: ['text/csv', 'application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  xls: ['application/vnd.ms-excel'],
  json: ['application/json'],
};

const DEFAULT_DISCOVERY_FILTERS: DiscoveryFilters = {
  query: '',
  category: '',
  minPrice: PRICING_RULES.discovery.minAmazonPrice,
  maxPrice: PRICING_RULES.discovery.maxAmazonPrice,
  minRating: PRICING_RULES.discovery.minRating,
  minReviews: PRICING_RULES.discovery.minReviews,
  primeOnly: PRICING_RULES.discovery.requirePrime,
};

const DEFAULT_DATA_POINTS: DataPointConfig[] = [
  {
    id: 'basic_info',
    name: 'Basic Product Info',
    description: 'Title, description, images, category',
    source: 'rainforest',
    costPerProduct: 0.01,
    required: true,
    enabled: true,
  },
  {
    id: 'current_price',
    name: 'Current Amazon Price',
    description: 'Current listing price and availability',
    source: 'rainforest',
    costPerProduct: 0.01,
    required: true,
    enabled: true,
  },
  {
    id: 'reviews',
    name: 'Reviews & Ratings',
    description: 'Star rating and review count',
    source: 'rainforest',
    costPerProduct: 0.005,
    required: false,
    enabled: true,
  },
  {
    id: 'price_history',
    name: '90-Day Price History',
    description: 'Historical prices from Keepa for deal analysis',
    source: 'keepa',
    costPerProduct: 0.02,
    required: false,
    enabled: true,
  },
  {
    id: 'sales_rank',
    name: 'Sales Rank History',
    description: 'Historical sales rank from Keepa',
    source: 'keepa',
    costPerProduct: 0.01,
    required: false,
    enabled: false,
  },
  {
    id: 'competitor_prices',
    name: 'Competitor Prices',
    description: 'Generate display competitor prices',
    source: 'calculated',
    costPerProduct: 0,
    required: true,
    enabled: true,
  },
  {
    id: 'profit_calculation',
    name: 'Profit Calculation',
    description: 'Calculate retail price and profit margin',
    source: 'calculated',
    costPerProduct: 0,
    required: true,
    enabled: true,
  },
];

const AMAZON_CATEGORIES = [
  'All Categories',
  'Electronics',
  'Home & Kitchen',
  'Beauty & Personal Care',
  'Health & Household',
  'Sports & Outdoors',
  'Tools & Home Improvement',
  'Toys & Games',
  'Clothing & Accessories',
  'Pet Supplies',
  'Office Products',
  'Garden & Outdoor',
  'Automotive',
  'Baby',
  'Grocery',
];

const INITIAL_PROGRESS: ImportProgress = {
  phase: 'validating',
  currentItem: 0,
  totalItems: 0,
  currentProductAsin: '',
  currentProductTitle: '',
  successCount: 0,
  failCount: 0,
  errors: [],
  startTime: 0,
  estimatedTimeRemaining: 0,
};

// ═══════════════════════════════════════════════════════════════════════════
// REDUCER
// ═══════════════════════════════════════════════════════════════════════════

// Toast notification types
interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
}

type ImportAction =
  | { type: 'SET_STEP'; payload: ImportStep }
  | { type: 'SET_SOURCE'; payload: DataSource }
  | { type: 'SET_FILE'; payload: File | null }
  | { type: 'SET_FILE_ERROR'; payload: ApiError | null }
  | { type: 'SET_PARSING'; payload: boolean }
  | { type: 'SET_PARSED_PRODUCTS'; payload: ParsedProduct[] }
  | { type: 'TOGGLE_PRODUCT_SELECTION'; payload: string }
  | { type: 'SELECT_ALL_PRODUCTS' }
  | { type: 'DESELECT_ALL_PRODUCTS' }
  | { type: 'SET_DISCOVERY_FILTERS'; payload: Partial<DiscoveryFilters> }
  | { type: 'SET_DISCOVERING'; payload: boolean }
  | { type: 'SET_DISCOVERED_PRODUCTS'; payload: RainforestSearchResult[] }
  | { type: 'SET_DISCOVERY_ERROR'; payload: ApiError | null }
  | { type: 'TOGGLE_DISCOVERED_SELECTION'; payload: string }
  | { type: 'SELECT_ALL_DISCOVERED' }
  | { type: 'DESELECT_ALL_DISCOVERED' }
  | { type: 'SET_DATA_POINTS'; payload: DataPointConfig[] }
  | { type: 'TOGGLE_DATA_POINT'; payload: string }
  | { type: 'SET_IMPORTING'; payload: boolean }
  | { type: 'SET_PROGRESS'; payload: Partial<ImportProgress> }
  | { type: 'ADD_PROGRESS_ERROR'; payload: { asin: string; error: string } }
  | { type: 'SET_IMPORT_ERROR'; payload: ApiError | null }
  | { type: 'SET_IMPORT_RESULT'; payload: Product[] }
  | { type: 'ADD_TOAST'; payload: Omit<Toast, 'id'> }
  | { type: 'REMOVE_TOAST'; payload: string }
  | { type: 'RESET' };

interface ImportState {
  step: ImportStep;
  source: DataSource;
  // File upload
  file: File | null;
  fileError: ApiError | null;
  isParsing: boolean;
  parsedProducts: ParsedProduct[];
  // Discovery
  discoveryFilters: DiscoveryFilters;
  isDiscovering: boolean;
  discoveredProducts: RainforestSearchResult[];
  discoveryError: ApiError | null;
  selectedDiscovered: Set<string>;
  // Data points
  dataPoints: DataPointConfig[];
  // Import
  isImporting: boolean;
  progress: ImportProgress;
  importError: ApiError | null;
  importedProducts: Product[];
  // Toasts
  toasts: Toast[];
}

const initialState: ImportState = {
  step: 'source',
  source: 'file',
  file: null,
  fileError: null,
  isParsing: false,
  parsedProducts: [],
  discoveryFilters: DEFAULT_DISCOVERY_FILTERS,
  isDiscovering: false,
  discoveredProducts: [],
  discoveryError: null,
  selectedDiscovered: new Set(),
  dataPoints: DEFAULT_DATA_POINTS,
  isImporting: false,
  progress: INITIAL_PROGRESS,
  importError: null,
  importedProducts: [],
  toasts: [],
};

function importReducer(state: ImportState, action: ImportAction): ImportState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.payload };

    case 'SET_SOURCE':
      return { ...state, source: action.payload };

    case 'SET_FILE':
      return { ...state, file: action.payload, fileError: null };

    case 'SET_FILE_ERROR':
      return { ...state, fileError: action.payload };

    case 'SET_PARSING':
      return { ...state, isParsing: action.payload };

    case 'SET_PARSED_PRODUCTS':
      return { ...state, parsedProducts: action.payload, isParsing: false };

    case 'TOGGLE_PRODUCT_SELECTION':
      return {
        ...state,
        parsedProducts: state.parsedProducts.map(p =>
          p.id === action.payload ? { ...p, selected: !p.selected } : p
        ),
      };

    case 'SELECT_ALL_PRODUCTS':
      return {
        ...state,
        parsedProducts: state.parsedProducts.map(p =>
          p.isValid ? { ...p, selected: true } : p
        ),
      };

    case 'DESELECT_ALL_PRODUCTS':
      return {
        ...state,
        parsedProducts: state.parsedProducts.map(p => ({ ...p, selected: false })),
      };

    case 'SET_DISCOVERY_FILTERS':
      return {
        ...state,
        discoveryFilters: { ...state.discoveryFilters, ...action.payload },
      };

    case 'SET_DISCOVERING':
      return { ...state, isDiscovering: action.payload };

    case 'SET_DISCOVERED_PRODUCTS':
      return {
        ...state,
        discoveredProducts: action.payload,
        isDiscovering: false,
        selectedDiscovered: new Set(action.payload.map(p => p.asin)),
      };

    case 'SET_DISCOVERY_ERROR':
      return { ...state, discoveryError: action.payload, isDiscovering: false };

    case 'TOGGLE_DISCOVERED_SELECTION': {
      const newSelection = new Set(state.selectedDiscovered);
      if (newSelection.has(action.payload)) {
        newSelection.delete(action.payload);
      } else {
        newSelection.add(action.payload);
      }
      return { ...state, selectedDiscovered: newSelection };
    }

    case 'SELECT_ALL_DISCOVERED':
      return {
        ...state,
        selectedDiscovered: new Set(state.discoveredProducts.map(p => p.asin)),
      };

    case 'DESELECT_ALL_DISCOVERED':
      return { ...state, selectedDiscovered: new Set() };

    case 'SET_DATA_POINTS':
      return { ...state, dataPoints: action.payload };

    case 'TOGGLE_DATA_POINT':
      return {
        ...state,
        dataPoints: state.dataPoints.map(dp =>
          dp.id === action.payload && !dp.required
            ? { ...dp, enabled: !dp.enabled }
            : dp
        ),
      };

    case 'SET_IMPORTING':
      return { ...state, isImporting: action.payload };

    case 'SET_PROGRESS':
      return { ...state, progress: { ...state.progress, ...action.payload } };

    case 'ADD_PROGRESS_ERROR':
      return {
        ...state,
        progress: {
          ...state.progress,
          errors: [...state.progress.errors, action.payload],
          failCount: state.progress.failCount + 1,
        },
      };

    case 'SET_IMPORT_ERROR':
      return { ...state, importError: action.payload, isImporting: false };

    case 'SET_IMPORT_RESULT':
      return {
        ...state,
        importedProducts: action.payload,
        isImporting: false,
        step: 'complete',
      };

    case 'ADD_TOAST': {
      const newToast: Toast = {
        ...action.payload,
        id: `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      };
      return { ...state, toasts: [...state.toasts, newToast] };
    }

    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate ASIN format
 */
function isValidAsin(asin: string): boolean {
  return /^[A-Z0-9]{10}$/.test(asin.toUpperCase());
}

/**
 * Parse CSV content
 */
function parseCsvContent(content: string): ParsedProduct[] {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  // Detect header row
  const headerLine = lines[0].toLowerCase();
  const hasHeader = headerLine.includes('asin') || headerLine.includes('title') || headerLine.includes('price');
  
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const products: ParsedProduct[] = [];

  // Parse header to find column indices
  let asinIndex = 0;
  let titleIndex = -1;
  let priceIndex = -1;
  let categoryIndex = -1;

  if (hasHeader) {
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    asinIndex = headers.findIndex(h => h === 'asin' || h === 'product_id' || h === 'sku');
    titleIndex = headers.findIndex(h => h === 'title' || h === 'name' || h === 'product_name');
    priceIndex = headers.findIndex(h => h === 'price' || h === 'amazon_price' || h === 'cost');
    categoryIndex = headers.findIndex(h => h === 'category' || h === 'product_category');
  }

  dataLines.forEach((line, index) => {
    const columns = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    const asin = (columns[asinIndex] || '').toUpperCase();
    
    const validationErrors: string[] = [];
    
    if (!asin) {
      validationErrors.push('Missing ASIN');
    } else if (!isValidAsin(asin)) {
      validationErrors.push('Invalid ASIN format');
    }

    const price = priceIndex >= 0 ? parseFloat(columns[priceIndex]) : undefined;
    if (price !== undefined && isNaN(price)) {
      validationErrors.push('Invalid price format');
    }

    products.push({
      id: `parsed-${index}-${asin || 'unknown'}`,
      asin,
      title: titleIndex >= 0 ? columns[titleIndex] : undefined,
      amazonPrice: price,
      category: categoryIndex >= 0 ? columns[categoryIndex] : undefined,
      isValid: validationErrors.length === 0,
      validationErrors,
      selected: validationErrors.length === 0,
    });
  });

  return products;
}

/**
 * Parse JSON content
 */
function parseJsonContent(content: string): ParsedProduct[] {
  try {
    const data = JSON.parse(content);
    const items = Array.isArray(data) ? data : data.products || data.items || [data];
    
    return items.map((item: Record<string, unknown>, index: number) => {
      const asin = ((item.asin || item.ASIN || item.product_id || '') as string).toUpperCase();
      const validationErrors: string[] = [];
      
      if (!asin) {
        validationErrors.push('Missing ASIN');
      } else if (!isValidAsin(asin)) {
        validationErrors.push('Invalid ASIN format');
      }

      return {
        id: `parsed-${index}-${asin || 'unknown'}`,
        asin,
        title: (item.title || item.name || item.product_name) as string | undefined,
        amazonPrice: typeof item.price === 'number' ? item.price : parseFloat(item.price as string) || undefined,
        category: (item.category || item.product_category) as string | undefined,
        isValid: validationErrors.length === 0,
        validationErrors,
        selected: validationErrors.length === 0,
      };
    });
  } catch (error) {
    console.error('JSON parse error:', error);
    return [];
  }
}

/**
 * Parse Excel content (xlsx/xls) using SheetJS
 * Dynamically imports xlsx library for Excel parsing
 */
async function parseExcelContent(file: File): Promise<ParsedProduct[]> {
  try {
    // Dynamic import of SheetJS
    const XLSX = await import('xlsx');
    
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    
    // Get first sheet
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      console.error('Excel file has no sheets');
      return [];
    }
    
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Convert to JSON with header detection
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: '', // Default value for empty cells
      raw: false, // Parse all values as strings first
    });
    
    if (jsonData.length === 0) {
      return [];
    }
    
    // Normalize header names (lowercase, trim)
    const normalizeKey = (key: string): string => 
      key.toLowerCase().trim().replace(/\s+/g, '_');
    
    // Find column mappings from first row keys
    const firstRowKeys = Object.keys(jsonData[0] || {});
    const keyMap: Record<string, string> = {};
    
    firstRowKeys.forEach(key => {
      const normalized = normalizeKey(key);
      if (normalized.includes('asin') || normalized === 'product_id' || normalized === 'sku') {
        keyMap.asin = key;
      } else if (normalized === 'title' || normalized === 'name' || normalized === 'product_name') {
        keyMap.title = key;
      } else if (normalized === 'price' || normalized === 'amazon_price' || normalized === 'cost') {
        keyMap.price = key;
      } else if (normalized === 'category' || normalized === 'product_category') {
        keyMap.category = key;
      }
    });
    
    const products: ParsedProduct[] = jsonData.map((row, index) => {
      const asinValue = keyMap.asin ? String(row[keyMap.asin] || '') : '';
      const asin = asinValue.toUpperCase().trim();
      const validationErrors: string[] = [];
      
      if (!asin) {
        validationErrors.push('Missing ASIN');
      } else if (!isValidAsin(asin)) {
        validationErrors.push('Invalid ASIN format');
      }
      
      const priceValue = keyMap.price ? row[keyMap.price] : undefined;
      let amazonPrice: number | undefined;
      
      if (priceValue !== undefined && priceValue !== '') {
        const parsed = typeof priceValue === 'number' 
          ? priceValue 
          : parseFloat(String(priceValue).replace(/[^0-9.-]/g, ''));
        
        if (!isNaN(parsed)) {
          amazonPrice = parsed;
        } else {
          validationErrors.push('Invalid price format');
        }
      }
      
      return {
        id: `parsed-excel-${index}-${asin || 'unknown'}`,
        asin,
        title: keyMap.title ? String(row[keyMap.title] || '') : undefined,
        amazonPrice,
        category: keyMap.category ? String(row[keyMap.category] || '') : undefined,
        isValid: validationErrors.length === 0,
        validationErrors,
        selected: validationErrors.length === 0,
      };
    });
    
    return products;
  } catch (error) {
    console.error('Excel parse error:', error);
    return [];
  }
}

/**
 * Format file size
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format duration
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}m ${secs}s`;
}

/**
 * Calculate estimated cost
 */
function calculateEstimatedCost(
  productCount: number,
  dataPoints: DataPointConfig[]
): { total: number; breakdown: Array<{ name: string; cost: number }> } {
  const breakdown: Array<{ name: string; cost: number }> = [];
  let total = 0;

  dataPoints.forEach(dp => {
    if (dp.enabled) {
      const cost = dp.costPerProduct * productCount;
      if (cost > 0) {
        breakdown.push({ name: dp.name, cost });
        total += cost;
      }
    }
  });

  return { total, breakdown };
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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
 * Step Indicator
 */
function StepIndicator({ 
  steps, 
  currentStep 
}: { 
  steps: Array<{ id: ImportStep; label: string }>; 
  currentStep: ImportStep;
}) {
  const currentIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <nav aria-label="Import progress" className="flex items-center justify-center mb-8">
      <ol className="flex items-center" role="list">
        {steps.map((step, index) => {
          const isActive = step.id === currentStep;
          const isCompleted = index < currentIndex;
          const isLast = index === steps.length - 1;

          return (
            <li key={step.id} className="flex items-center">
              {/* Step Circle */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    isCompleted
                      ? 'bg-green-500 text-white'
                      : isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={`Step ${index + 1}: ${step.label}${isCompleted ? ' (completed)' : isActive ? ' (current)' : ''}`}
                >
                  {isCompleted ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <span aria-hidden="true">{index + 1}</span>
                  )}
                </div>
                <span
                  className={`mt-2 text-xs font-medium ${
                    isActive ? 'text-blue-600' : 'text-gray-500'
                  }`}
                  aria-hidden="true"
                >
                  {step.label}
                </span>
              </div>

              {/* Connector */}
              {!isLast && (
                <div
                  className={`w-16 h-0.5 mx-2 ${
                    isCompleted ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Source Selection Step
 */
function SourceSelectionStep({
  source,
  onSourceChange,
  onNext,
}: {
  source: DataSource;
  onSourceChange: (source: DataSource) => void;
  onNext: () => void;
}) {
  const sources: Array<{ id: DataSource; title: string; description: string; icon: React.ReactNode }> = [
    {
      id: 'file',
      title: 'Upload File',
      description: 'Import from CSV, Excel, or JSON file with ASINs',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: 'rainforest',
      title: 'Discover Products',
      description: 'Search Amazon for products matching your criteria',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
    },
    {
      id: 'manual',
      title: 'Enter ASINs',
      description: 'Manually type or paste ASIN codes',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
    },
  ];

  const handleKeyDown = (e: React.KeyboardEvent, currentId: DataSource) => {
    const currentIndex = sources.findIndex(s => s.id === currentId);
    
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % sources.length;
      onSourceChange(sources[nextIndex].id);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + sources.length) % sources.length;
      onSourceChange(sources[prevIndex].id);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onNext();
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 id="source-heading" className="text-lg font-semibold text-gray-900">Choose Import Method</h3>
        <p className="text-gray-500 mt-1">Select how you want to add products to your inventory</p>
      </div>

      <div 
        className="grid grid-cols-1 md:grid-cols-3 gap-4" 
        role="radiogroup" 
        aria-labelledby="source-heading"
      >
        {sources.map(s => (
          <button
            key={s.id}
            onClick={() => onSourceChange(s.id)}
            onKeyDown={(e) => handleKeyDown(e, s.id)}
            role="radio"
            aria-checked={source === s.id}
            tabIndex={source === s.id ? 0 : -1}
            className={`p-6 rounded-lg border-2 text-left transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              source === s.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className={`mb-4 ${source === s.id ? 'text-blue-600' : 'text-gray-400'}`}>
              {s.icon}
            </div>
            <h4 className={`font-medium ${source === s.id ? 'text-blue-900' : 'text-gray-900'}`}>
              {s.title}
            </h4>
            <p className={`text-sm mt-1 ${source === s.id ? 'text-blue-700' : 'text-gray-500'}`}>
              {s.description}
            </p>
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          onClick={onNext}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label="Continue to next step"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/**
 * File Upload Step
 */
function FileUploadStep({
  file,
  error,
  isParsing,
  parsedProducts,
  existingAsins,
  onFileSelect,
  onParse,
  onBack,
  onNext,
}: {
  file: File | null;
  error: ApiError | null;
  isParsing: boolean;
  parsedProducts: ParsedProduct[];
  existingAsins: Set<string>;
  onFileSelect: (file: File | null) => void;
  onParse: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      onFileSelect(droppedFile);
    }
  }, [onFileSelect]);

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      onFileSelect(selectedFile);
    }
  }, [onFileSelect]);

  const validProducts = parsedProducts.filter(p => p.isValid);
  const invalidProducts = parsedProducts.filter(p => !p.isValid);
  const duplicateCount = parsedProducts.filter(p => existingAsins.has(p.asin)).length;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900">Upload Product File</h3>
        <p className="text-gray-500 mt-1">Upload a CSV, Excel, or JSON file containing ASINs</p>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : file
            ? 'border-green-500 bg-green-50'
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.json"
          onChange={handleFileChange}
          className="hidden"
        />

        {file ? (
          <div className="space-y-2">
            <svg className="w-12 h-12 mx-auto text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium text-gray-900">{file.name}</p>
            <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFileSelect(null);
              }}
              className="text-sm text-red-600 hover:text-red-800"
            >
              Remove file
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <svg className="w-12 h-12 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-gray-600">
              <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
            </p>
            <p className="text-sm text-gray-500">CSV, XLSX, XLS, or JSON up to 10MB</p>
          </div>
        )}
      </div>

      {/* File Format Help */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-2">Supported File Formats</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium text-gray-700">CSV Format:</p>
            <pre className="mt-1 p-2 bg-white rounded border text-xs font-mono">
              asin,title,price{'\n'}
              B08N5WRWNW,Product Name,19.99{'\n'}
              B07PXGQC1Q,Another Product,24.99
            </pre>
          </div>
          <div>
            <p className="font-medium text-gray-700">JSON Format:</p>
            <pre className="mt-1 p-2 bg-white rounded border text-xs font-mono">
              {'[{\n  "asin": "B08N5WRWNW",\n  "title": "Product Name"\n}]'}
            </pre>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <InlineError error={error} showSuggestion />
      )}

      {/* Parse Results */}
      {parsedProducts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Parse Results</h4>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{validProducts.length}</p>
              <p className="text-sm text-green-700">Valid Products</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-red-600">{invalidProducts.length}</p>
              <p className="text-sm text-red-700">Invalid</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-yellow-600">{duplicateCount}</p>
              <p className="text-sm text-yellow-700">Duplicates</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-600">
                {validProducts.filter(p => p.selected).length}
              </p>
              <p className="text-sm text-blue-700">Selected</p>
            </div>
          </div>

          {/* Invalid Products Warning */}
          {invalidProducts.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm font-medium text-red-800 mb-2">
                {invalidProducts.length} products have validation errors:
              </p>
              <ul className="text-sm text-red-700 space-y-1">
                {invalidProducts.slice(0, 5).map(p => (
                  <li key={p.id}>
                    • {p.asin || 'Unknown'}: {p.validationErrors.join(', ')}
                  </li>
                ))}
                {invalidProducts.length > 5 && (
                  <li>• ... and {invalidProducts.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          {/* Duplicate Warning */}
          {duplicateCount > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                <strong>{duplicateCount}</strong> products already exist in your inventory and will be updated.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-700 hover:text-gray-900"
        >
          ← Back
        </button>
        <div className="flex gap-3">
          {file && parsedProducts.length === 0 && (
            <button
              onClick={onParse}
              disabled={isParsing}
              className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {isParsing && <LoadingSpinner size="sm" />}
              Parse File
            </button>
          )}
          <button
            onClick={onNext}
            disabled={validProducts.filter(p => p.selected).length === 0}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
          >
            Continue with {validProducts.filter(p => p.selected).length} products
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Discovery Step
 */
function DiscoveryStep({
  filters,
  isDiscovering,
  discoveredProducts,
  selectedAsins,
  error,
  existingAsins,
  onFiltersChange,
  onSearch,
  onToggleSelection,
  onSelectAll,
  onDeselectAll,
  onBack,
  onNext,
}: {
  filters: DiscoveryFilters;
  isDiscovering: boolean;
  discoveredProducts: RainforestSearchResult[];
  selectedAsins: Set<string>;
  error: ApiError | null;
  existingAsins: Set<string>;
  onFiltersChange: (filters: Partial<DiscoveryFilters>) => void;
  onSearch: () => void;
  onToggleSelection: (asin: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const duplicateCount = discoveredProducts.filter(p => existingAsins.has(p.asin)).length;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900">Discover Products</h3>
        <p className="text-gray-500 mt-1">Search Amazon for products matching your criteria</p>
      </div>

      {/* Search Filters */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search Query */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Query</label>
            <input
              type="text"
              value={filters.query}
              onChange={(e) => onFiltersChange({ query: e.target.value })}
              placeholder="e.g., jade roller, face massager, skincare tool"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={filters.category}
              onChange={(e) => onFiltersChange({ category: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              {AMAZON_CATEGORIES.map(cat => (
                <option key={cat} value={cat === 'All Categories' ? '' : cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Price Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price Range</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={filters.minPrice}
                onChange={(e) => onFiltersChange({ minPrice: parseFloat(e.target.value) || 0 })}
                placeholder="Min"
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="text-gray-500">to</span>
              <input
                type="number"
                value={filters.maxPrice}
                onChange={(e) => onFiltersChange({ maxPrice: parseFloat(e.target.value) || 0 })}
                placeholder="Max"
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Min Rating */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Rating</label>
            <select
              value={filters.minRating}
              onChange={(e) => onFiltersChange({ minRating: parseFloat(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="0">Any rating</option>
              <option value="3">3+ stars</option>
              <option value="3.5">3.5+ stars</option>
              <option value="4">4+ stars</option>
              <option value="4.5">4.5+ stars</option>
            </select>
          </div>

          {/* Min Reviews */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Reviews</label>
            <input
              type="number"
              value={filters.minReviews}
              onChange={(e) => onFiltersChange({ minReviews: parseInt(e.target.value) || 0 })}
              placeholder="e.g., 100"
              min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Prime Only */}
          <div className="flex items-center">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.primeOnly}
                onChange={(e) => onFiltersChange({ primeOnly: e.target.checked })}
                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Prime eligible only</span>
            </label>
          </div>
        </div>

        {/* Search Button */}
        <div className="flex justify-end">
          <button
            onClick={onSearch}
            disabled={isDiscovering || !filters.query.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {isDiscovering && <LoadingSpinner size="sm" />}
            Search Products
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <InlineError error={error} showSuggestion />
      )}

      {/* Results */}
      {discoveredProducts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {/* Results Header */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                Found <span className="font-medium">{discoveredProducts.length}</span> products
              </span>
              {duplicateCount > 0 && (
                <span className="text-sm text-yellow-600">
                  ({duplicateCount} already in inventory)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onSelectAll}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Select all
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={onDeselectAll}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Deselect all
              </button>
              <span className="text-gray-300">|</span>
              <span className="text-sm font-medium text-blue-600">
                {selectedAsins.size} selected
              </span>
            </div>
          </div>

          {/* Results Grid */}
          <div className="max-h-96 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {discoveredProducts.map(product => {
                const isSelected = selectedAsins.has(product.asin);
                const isExisting = existingAsins.has(product.asin);

                return (
                  <div
                    key={product.asin}
                    onClick={() => onToggleSelection(product.asin)}
                    className={`border rounded-lg p-3 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    } ${isExisting ? 'opacity-60' : ''}`}
                  >
                    <div className="flex gap-3">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="h-4 w-4 mt-1 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />

                      {/* Image */}
                      <div className="w-16 h-16 flex-shrink-0 bg-gray-100 rounded overflow-hidden">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate" title={product.title}>
                          {product.title.slice(0, 60)}...
                        </p>
                        <p className="text-xs text-gray-500 font-mono">{product.asin}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm font-medium text-green-600">
                            {formatPrice(product.price)}
                          </span>
                          <span className="text-xs text-gray-500">
                            ⭐ {product.rating} ({product.review_count})
                          </span>
                        </div>
                        {isExisting && (
                          <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded">
                            Already imported
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isDiscovering && discoveredProducts.length === 0 && filters.query && (
        <div className="text-center py-12 text-gray-500">
          <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p>No products found matching your criteria</p>
          <p className="text-sm mt-1">Try adjusting your search filters</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-700 hover:text-gray-900"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={selectedAsins.size === 0}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
        >
          Continue with {selectedAsins.size} products
        </button>
      </div>
    </div>
  );
}

/**
 * Manual Entry Step
 */
function ManualEntryStep({
  parsedProducts,
  existingAsins,
  onProductsChange,
  onBack,
  onNext,
}: {
  parsedProducts: ParsedProduct[];
  existingAsins: Set<string>;
  onProductsChange: (products: ParsedProduct[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleParse = useCallback(() => {
    setError(null);
    
    // Split by newlines, commas, or spaces
    const asins = input
      .split(/[\n,\s]+/)
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length > 0);

    if (asins.length === 0) {
      setError('Please enter at least one ASIN');
      return;
    }

    const products: ParsedProduct[] = asins.map((asin, index) => {
      const validationErrors: string[] = [];
      if (!isValidAsin(asin)) {
        validationErrors.push('Invalid ASIN format (should be 10 alphanumeric characters)');
      }

      return {
        id: `manual-${index}-${asin}`,
        asin,
        isValid: validationErrors.length === 0,
        validationErrors,
        selected: validationErrors.length === 0,
      };
    });

    // Check for duplicates in input
    const seen = new Set<string>();
    products.forEach(p => {
      if (seen.has(p.asin)) {
        p.validationErrors.push('Duplicate ASIN in input');
        p.isValid = false;
        p.selected = false;
      }
      seen.add(p.asin);
    });

    onProductsChange(products);
  }, [input, onProductsChange]);

  const validProducts = parsedProducts.filter(p => p.isValid);
  const selectedCount = validProducts.filter(p => p.selected).length;
  const duplicateCount = parsedProducts.filter(p => existingAsins.has(p.asin)).length;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900">Enter ASINs Manually</h3>
        <p className="text-gray-500 mt-1">Type or paste ASIN codes, one per line</p>
      </div>

      {/* Input Area */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          ASIN Codes
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="B08N5WRWNW&#10;B07PXGQC1Q&#10;B08DFPZG71&#10;..."
          rows={8}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
        />
        <p className="text-sm text-gray-500 mt-1">
          Enter ASINs separated by new lines, commas, or spaces
        </p>
      </div>

      {/* Parse Button */}
      <div className="flex justify-end">
        <button
          onClick={handleParse}
          disabled={!input.trim()}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium disabled:opacity-50"
        >
          Parse ASINs
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      {parsedProducts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Parsed ASINs</h4>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{validProducts.length}</p>
              <p className="text-sm text-green-700">Valid</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-red-600">
                {parsedProducts.filter(p => !p.isValid).length}
              </p>
              <p className="text-sm text-red-700">Invalid</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-yellow-600">{duplicateCount}</p>
              <p className="text-sm text-yellow-700">Duplicates</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-600">{selectedCount}</p>
              <p className="text-sm text-blue-700">Selected</p>
            </div>
          </div>

          {/* ASIN List */}
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Select</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">ASIN</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {parsedProducts.map(product => (
                  <tr key={product.id} className={product.isValid ? '' : 'bg-red-50'}>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={product.selected}
                        disabled={!product.isValid}
                        onChange={() => {
                          const updated = parsedProducts.map(p =>
                            p.id === product.id ? { ...p, selected: !p.selected } : p
                          );
                          onProductsChange(updated);
                        }}
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
                      />
                    </td>
                    <td className="px-4 py-2 font-mono text-sm">{product.asin}</td>
                    <td className="px-4 py-2 text-sm">
                      {product.isValid ? (
                        existingAsins.has(product.asin) ? (
                          <span className="text-yellow-600">Already exists</span>
                        ) : (
                          <span className="text-green-600">Valid</span>
                        )
                      ) : (
                        <span className="text-red-600">{product.validationErrors.join(', ')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-700 hover:text-gray-900"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={selectedCount === 0}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
        >
          Continue with {selectedCount} products
        </button>
      </div>
    </div>
  );
}

/**
 * Data Points Selection Step
 */
function DataPointsStep({
  dataPoints,
  productCount,
  onToggleDataPoint,
  onBack,
  onNext,
}: {
  dataPoints: DataPointConfig[];
  productCount: number;
  onToggleDataPoint: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const enabledDataPoints = dataPoints.filter(dp => dp.enabled);
  const { total: estimatedCost, breakdown } = calculateEstimatedCost(productCount, dataPoints);

  const groupedDataPoints = useMemo(() => {
    const groups: Record<string, DataPointConfig[]> = {
      rainforest: [],
      keepa: [],
      calculated: [],
    };
    dataPoints.forEach(dp => {
      groups[dp.source].push(dp);
    });
    return groups;
  }, [dataPoints]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900">Select Data Points</h3>
        <p className="text-gray-500 mt-1">
          Choose what information to fetch for {productCount} products
        </p>
      </div>

      {/* Data Point Groups */}
      <div className="space-y-6">
        {/* Rainforest Data */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-orange-50 border-b border-orange-100">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
              <span className="font-medium text-orange-900">Rainforest API</span>
              <span className="text-sm text-orange-600">Real-time Amazon data</span>
            </div>
          </div>
          <div className="p-4 space-y-3">
            {groupedDataPoints.rainforest.map(dp => (
              <DataPointToggle
                key={dp.id}
                dataPoint={dp}
                productCount={productCount}
                onToggle={() => onToggleDataPoint(dp.id)}
              />
            ))}
          </div>
        </div>

        {/* Keepa Data */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-purple-50 border-b border-purple-100">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className="font-medium text-purple-900">Keepa API</span>
              <span className="text-sm text-purple-600">Historical price data</span>
            </div>
          </div>
          <div className="p-4 space-y-3">
            {groupedDataPoints.keepa.map(dp => (
              <DataPointToggle
                key={dp.id}
                dataPoint={dp}
                productCount={productCount}
                onToggle={() => onToggleDataPoint(dp.id)}
              />
            ))}
          </div>
        </div>

        {/* Calculated Data */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-green-50 border-b border-green-100">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="font-medium text-green-900">Calculated</span>
              <span className="text-sm text-green-600">Computed locally (free)</span>
            </div>
          </div>
          <div className="p-4 space-y-3">
            {groupedDataPoints.calculated.map(dp => (
              <DataPointToggle
                key={dp.id}
                dataPoint={dp}
                productCount={productCount}
                onToggle={() => onToggleDataPoint(dp.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Cost Preview */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-blue-900">Estimated API Cost</p>
            <p className="text-sm text-blue-700 mt-1">
              {enabledDataPoints.length} data points × {productCount} products
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-blue-600">{formatCost(estimatedCost)}</p>
            <p className="text-sm text-blue-500">
              ~{formatCost(estimatedCost / productCount)} per product
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-700 hover:text-gray-900"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          Review Estimate
        </button>
      </div>
    </div>
  );
}

/**
 * Data Point Toggle Component
 */
function DataPointToggle({
  dataPoint,
  productCount,
  onToggle,
}: {
  dataPoint: DataPointConfig;
  productCount: number;
  onToggle: () => void;
}) {
  const cost = dataPoint.costPerProduct * productCount;

  return (
    <label className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
      dataPoint.enabled ? 'bg-gray-50' : 'hover:bg-gray-50'
    } ${dataPoint.required ? 'opacity-75' : ''}`}>
      <input
        type="checkbox"
        checked={dataPoint.enabled}
        disabled={dataPoint.required}
        onChange={onToggle}
        className="h-4 w-4 mt-1 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={`font-medium ${dataPoint.enabled ? 'text-gray-900' : 'text-gray-500'}`}>
            {dataPoint.name}
          </span>
          {dataPoint.required && (
            <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Required</span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-0.5">{dataPoint.description}</p>
      </div>
      <div className="text-right">
        {cost > 0 ? (
          <>
            <p className="text-sm font-medium text-gray-900">{formatCost(cost)}</p>
            <p className="text-xs text-gray-500">{formatCost(dataPoint.costPerProduct)}/ea</p>
          </>
        ) : (
          <span className="text-sm text-green-600">Free</span>
        )}
      </div>
    </label>
  );
}

/**
 * Cost Estimate Step
 */
function CostEstimateStep({
  productCount,
  dataPoints,
  existingAsins,
  selectedAsins,
  onBack,
  onStartImport,
}: {
  productCount: number;
  dataPoints: DataPointConfig[];
  existingAsins: Set<string>;
  selectedAsins: string[];
  onBack: () => void;
  onStartImport: () => void;
}) {
  const enabledDataPoints = dataPoints.filter(dp => dp.enabled);
  const { total: estimatedCost, breakdown } = calculateEstimatedCost(productCount, dataPoints);
  const newProducts = selectedAsins.filter(asin => !existingAsins.has(asin)).length;
  const updateProducts = selectedAsins.filter(asin => existingAsins.has(asin)).length;

  // Estimate time (rough calculation)
  const estimatedTimeSeconds = Math.ceil(productCount / BATCH_SIZE) * (BATCH_DELAY / 1000) + productCount * 0.5;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900">Review Import</h3>
        <p className="text-gray-500 mt-1">Confirm details before starting the import</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-blue-600">{productCount}</p>
          <p className="text-sm text-gray-600">Products</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{newProducts}</p>
          <p className="text-sm text-gray-600">New</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-yellow-600">{updateProducts}</p>
          <p className="text-sm text-gray-600">Updates</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-purple-600">{enabledDataPoints.length}</p>
          <p className="text-sm text-gray-600">Data Points</p>
        </div>
      </div>

      {/* Cost Breakdown */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h4 className="font-medium text-gray-900">Cost Breakdown</h4>
        </div>
        <div className="p-4">
          <table className="w-full">
            <thead>
              <tr className="text-sm text-gray-500">
                <th className="text-left pb-2">Data Point</th>
                <th className="text-right pb-2">Cost per Product</th>
                <th className="text-right pb-2">Total</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {enabledDataPoints.map(dp => (
                <tr key={dp.id} className="border-t border-gray-100">
                  <td className="py-2 text-gray-900">{dp.name}</td>
                  <td className="py-2 text-right text-gray-600">
                    {dp.costPerProduct > 0 ? formatCost(dp.costPerProduct) : 'Free'}
                  </td>
                  <td className="py-2 text-right text-gray-900">
                    {dp.costPerProduct > 0 ? formatCost(dp.costPerProduct * productCount) : 'Free'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200">
                <td className="pt-3 font-medium text-gray-900">Total Estimated Cost</td>
                <td></td>
                <td className="pt-3 text-right text-xl font-bold text-blue-600">
                  {formatCost(estimatedCost)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Time Estimate */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-medium text-yellow-900">Estimated Time</p>
            <p className="text-sm text-yellow-700">
              Approximately {formatDuration(estimatedTimeSeconds)} to complete
            </p>
          </div>
        </div>
      </div>

      {/* Warning */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-900 mb-1">Before you start:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>API costs will be charged to your account</li>
          <li>Import cannot be cancelled once started</li>
          <li>Products will be available after import completes</li>
          <li>Existing products will be updated with new data</li>
        </ul>
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-700 hover:text-gray-900"
        >
          ← Back
        </button>
        <button
          onClick={onStartImport}
          className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-lg flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Start Import
        </button>
      </div>
    </div>
  );
}

/**
 * Import Progress Step
 */
function ImportProgressStep({
  progress,
  error,
  onCancel,
}: {
  progress: ImportProgress;
  error: ApiError | null;
  onCancel?: () => void;
}) {
  const progressPercent = progress.totalItems > 0
    ? Math.round((progress.currentItem / progress.totalItems) * 100)
    : 0;

  const phaseLabels: Record<ImportProgress['phase'], string> = {
    validating: 'Validating products...',
    fetching_rainforest: 'Fetching Amazon data...',
    fetching_keepa: 'Fetching price history...',
    calculating: 'Calculating prices...',
    saving: 'Saving to database...',
    complete: 'Import complete!',
  };

  const elapsedTime = progress.startTime > 0 ? (Date.now() - progress.startTime) / 1000 : 0;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900">
          {progress.phase === 'complete' ? 'Import Complete!' : 'Importing Products...'}
        </h3>
        <p className="text-gray-500 mt-1">{phaseLabels[progress.phase]}</p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">
            {progress.currentItem} of {progress.totalItems} products
          </span>
          <span className="font-medium text-blue-600">{progressPercent}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className="bg-blue-600 h-3 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Current Product */}
      {progress.currentProductAsin && progress.phase !== 'complete' && (
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-gray-600">Currently processing:</p>
          <p className="font-mono text-gray-900">{progress.currentProductAsin}</p>
          {progress.currentProductTitle && (
            <p className="text-sm text-gray-500 truncate">{progress.currentProductTitle}</p>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{progress.successCount}</p>
          <p className="text-sm text-green-700">Successful</p>
        </div>
        <div className="bg-red-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{progress.failCount}</p>
          <p className="text-sm text-red-700">Failed</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{formatDuration(elapsedTime)}</p>
          <p className="text-sm text-blue-700">Elapsed</p>
        </div>
      </div>

      {/* Time Estimate */}
      {progress.estimatedTimeRemaining > 0 && progress.phase !== 'complete' && (
        <p className="text-center text-sm text-gray-500">
          Estimated time remaining: {formatDuration(progress.estimatedTimeRemaining)}
        </p>
      )}

      {/* Errors */}
      {progress.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="font-medium text-red-800 mb-2">Errors ({progress.errors.length}):</p>
          <div className="max-h-32 overflow-y-auto text-sm text-red-700 space-y-1">
            {progress.errors.map((err, i) => (
              <p key={i}>• {err.asin}: {err.error}</p>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <InlineError error={error} showSuggestion />
      )}

      {/* Spinner */}
      {progress.phase !== 'complete' && (
        <div className="flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
      )}
    </div>
  );
}

/**
 * Import Complete Step
 */
function ImportCompleteStep({
  progress,
  importedProducts,
  onClose,
  onImportMore,
}: {
  progress: ImportProgress;
  importedProducts: Product[];
  onClose: () => void;
  onImportMore: () => void;
}) {
  const successRate = progress.totalItems > 0
    ? Math.round((progress.successCount / progress.totalItems) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Success Icon */}
      <div className="text-center">
        <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-gray-900">Import Complete!</h3>
        <p className="text-gray-500 mt-1">
          Successfully imported {progress.successCount} products
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{progress.totalItems}</p>
          <p className="text-sm text-gray-600">Total Processed</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{progress.successCount}</p>
          <p className="text-sm text-gray-600">Successful</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{progress.failCount}</p>
          <p className="text-sm text-gray-600">Failed</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-purple-600">{successRate}%</p>
          <p className="text-sm text-gray-600">Success Rate</p>
        </div>
      </div>

      {/* Sample of Imported Products */}
      {importedProducts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h4 className="font-medium text-gray-900">Recently Imported</h4>
          </div>
          <div className="divide-y divide-gray-200">
            {importedProducts.slice(0, 5).map(product => (
              <div key={product.id} className="px-4 py-3 flex items-center gap-3">
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
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{product.title}</p>
                  <p className="text-xs text-gray-500 font-mono">{product.asin}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-green-600">
                    {product.retail_price ? formatPrice(product.retail_price) : '-'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {product.profit_margin ? `${product.profit_margin.toFixed(0)}% margin` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {importedProducts.length > 5 && (
            <div className="px-4 py-2 bg-gray-50 text-center text-sm text-gray-500">
              ... and {importedProducts.length - 5} more
            </div>
          )}
        </div>
      )}

      {/* Failed Products */}
      {progress.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="font-medium text-red-800 mb-2">
            {progress.errors.length} products failed to import:
          </p>
          <div className="max-h-32 overflow-y-auto text-sm text-red-700 space-y-1">
            {progress.errors.map((err, i) => (
              <p key={i}>• {err.asin}: {err.error}</p>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-center gap-4">
        <button
          onClick={onImportMore}
          className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
        >
          Import More
        </button>
        <button
          onClick={onClose}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          View Products
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TOAST COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

const TOAST_DURATION = 5000;

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div 
      className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map(toast => (
        <ToastNotification 
          key={toast.id} 
          toast={toast} 
          onDismiss={onDismiss} 
        />
      ))}
    </div>
  );
}

function ToastNotification({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const duration = toast.duration || TOAST_DURATION;
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  const typeStyles = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };

  const typeIcons = {
    success: (
      <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
    ),
  };

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg border shadow-lg min-w-[300px] max-w-md animate-slide-up ${typeStyles[toast.type]}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex-shrink-0">{typeIcons[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{toast.title}</p>
        <p className="text-sm opacity-90 mt-0.5">{toast.message}</p>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 text-current opacity-50 hover:opacity-100"
        aria-label="Dismiss notification"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ImportPanel({
  isOpen,
  onClose,
  onImportComplete,
  existingAsins = new Set(),
}: ImportPanelProps) {
  const [state, dispatch] = useReducer(importReducer, initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation - Escape to close
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !state.isImporting) {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, state.isImporting, onClose]);

  // Focus trap - keep focus inside modal
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const focusableElements = modalRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    // Focus first element on open
    firstElement?.focus();

    document.addEventListener('keydown', handleTabKey);
    return () => document.removeEventListener('keydown', handleTabKey);
  }, [isOpen, state.step]);

  // Get steps based on source
  const steps = useMemo(() => {
    const baseSteps: Array<{ id: ImportStep; label: string }> = [];
    
    baseSteps.push({ id: 'source', label: 'Source' });
    
    if (state.source === 'file') {
      baseSteps.push({ id: 'upload', label: 'Upload' });
    } else if (state.source === 'rainforest') {
      baseSteps.push({ id: 'discover', label: 'Discover' });
    } else {
      baseSteps.push({ id: 'upload', label: 'Enter' }); // Manual entry uses upload step
    }
    
    baseSteps.push(
      { id: 'datapoints', label: 'Data Points' },
      { id: 'estimate', label: 'Review' },
      { id: 'progress', label: 'Import' },
    );
    
    return baseSteps;
  }, [state.source]);

  // Get selected ASINs based on source
  const selectedAsins = useMemo(() => {
    if (state.source === 'rainforest') {
      return Array.from(state.selectedDiscovered);
    }
    return state.parsedProducts.filter(p => p.selected).map(p => p.asin);
  }, [state.source, state.selectedDiscovered, state.parsedProducts]);

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const handleFileSelect = useCallback((file: File | null) => {
    dispatch({ type: 'SET_FILE', payload: file });
    dispatch({ type: 'SET_PARSED_PRODUCTS', payload: [] });
    
    if (!file) return;

    // Validate file
    if (file.size > MAX_FILE_SIZE) {
      dispatch({
        type: 'SET_FILE_ERROR',
        payload: {
          code: 'IMPORT_001',
          message: 'File too large',
          details: `Maximum file size is ${formatFileSize(MAX_FILE_SIZE)}`,
          suggestion: 'Try splitting your file into smaller chunks',
        },
      });
      return;
    }

    // Auto-parse
    dispatch({ type: 'SET_PARSING', payload: true });

    const ext = file.name.split('.').pop()?.toLowerCase();
    
    // Handle Excel files with async parsing
    if (ext === 'xlsx' || ext === 'xls') {
      parseExcelContent(file).then(products => {
        if (products.length === 0) {
          dispatch({
            type: 'SET_FILE_ERROR',
            payload: {
              code: 'IMPORT_002',
              message: 'No products found in Excel file',
              details: 'The file appears to be empty or missing ASIN column',
              suggestion: 'Ensure your Excel file has an ASIN column with valid product IDs',
            },
          });
          dispatch({ type: 'SET_PARSING', payload: false });
          return;
        }

        if (products.length > MAX_PRODUCTS_PER_IMPORT) {
          dispatch({
            type: 'SET_FILE_ERROR',
            payload: {
              code: 'IMPORT_003',
              message: 'Too many products',
              details: `Maximum ${MAX_PRODUCTS_PER_IMPORT} products per import. Found ${products.length}.`,
              suggestion: 'Split your file into smaller batches',
            },
          });
          dispatch({ type: 'SET_PARSING', payload: false });
          return;
        }

        dispatch({ type: 'SET_PARSED_PRODUCTS', payload: products });
        dispatch({ 
          type: 'ADD_TOAST', 
          payload: { 
            type: 'success', 
            title: 'Excel Parsed', 
            message: `Found ${products.length} products in file` 
          } 
        });
      }).catch(error => {
        console.error('Excel parse error:', error);
        dispatch({
          type: 'SET_FILE_ERROR',
          payload: {
            code: 'IMPORT_005',
            message: 'Failed to parse Excel file',
            details: error instanceof Error ? error.message : 'Unknown error',
            suggestion: 'Ensure the file is a valid Excel format',
          },
        });
        dispatch({ type: 'SET_PARSING', payload: false });
      });
      return;
    }

    // Handle CSV and JSON with FileReader
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      let products: ParsedProduct[] = [];

      if (ext === 'json') {
        products = parseJsonContent(content);
      } else {
        products = parseCsvContent(content);
      }

      if (products.length === 0) {
        dispatch({
          type: 'SET_FILE_ERROR',
          payload: {
            code: 'IMPORT_002',
            message: 'No products found in file',
            details: 'The file appears to be empty or in an unsupported format',
            suggestion: 'Check the file format and ensure it contains ASIN data',
          },
        });
        dispatch({ type: 'SET_PARSING', payload: false });
        return;
      }

      if (products.length > MAX_PRODUCTS_PER_IMPORT) {
        dispatch({
          type: 'SET_FILE_ERROR',
          payload: {
            code: 'IMPORT_003',
            message: 'Too many products',
            details: `Maximum ${MAX_PRODUCTS_PER_IMPORT} products per import. Found ${products.length}.`,
            suggestion: 'Split your file into smaller batches',
          },
        });
        dispatch({ type: 'SET_PARSING', payload: false });
        return;
      }

      dispatch({ type: 'SET_PARSED_PRODUCTS', payload: products });
      dispatch({ 
        type: 'ADD_TOAST', 
        payload: { 
          type: 'success', 
          title: 'File Parsed', 
          message: `Found ${products.length} products in file` 
        } 
      });
    };

    reader.onerror = () => {
      dispatch({
        type: 'SET_FILE_ERROR',
        payload: {
          code: 'IMPORT_004',
          message: 'Failed to read file',
          details: 'There was an error reading the file',
          suggestion: 'Try uploading the file again',
        },
      });
      dispatch({ type: 'SET_PARSING', payload: false });
    };

    reader.readAsText(file);
  }, [existingAsins]);

  const handleDiscover = useCallback(async () => {
    dispatch({ type: 'SET_DISCOVERING', payload: true });
    dispatch({ type: 'SET_DISCOVERY_ERROR', payload: null });

    try {
      // Build search parameters
      const searchParams = new URLSearchParams({
        query: state.discoveryFilters.query,
        ...(state.discoveryFilters.category && { category: state.discoveryFilters.category }),
        ...(state.discoveryFilters.minPrice && { minPrice: String(state.discoveryFilters.minPrice) }),
        ...(state.discoveryFilters.maxPrice && { maxPrice: String(state.discoveryFilters.maxPrice) }),
        ...(state.discoveryFilters.minRating && { minRating: String(state.discoveryFilters.minRating) }),
        ...(state.discoveryFilters.minReviews && { minReviews: String(state.discoveryFilters.minReviews) }),
        ...(state.discoveryFilters.primeOnly && { primeOnly: 'true' }),
        pageSize: '50',
      });

      // Call real discovery API
      const response = await fetch(`/api/discovery?${searchParams}`);
      
      if (!response.ok) {
        throw new Error(`Discovery API error: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error?.message || 'Discovery failed');
      }

      // Transform results to RainforestSearchResult format
      const discoveredProducts: RainforestSearchResult[] = result.data.map((item: any) => ({
        asin: item.asin,
        title: item.title,
        price: item.price,
        image_url: item.image_url,
        rating: item.rating,
        review_count: item.review_count,
        category: item.category,
        is_prime: item.is_prime,
        availability: item.availability,
      }));

      dispatch({ type: 'SET_DISCOVERED_PRODUCTS', payload: discoveredProducts });
    } catch (error) {
      dispatch({
        type: 'SET_DISCOVERY_ERROR',
        payload: {
          code: 'DISC_001',
          message: 'Failed to discover products',
          details: error instanceof Error ? error.message : 'Unknown error',
          suggestion: 'Check your search criteria and try again',
          severity: 'error' as const,
          blocking: false,
        },
      });
    } finally {
      dispatch({ type: 'SET_DISCOVERING', payload: false });
    }
  }, [state.discoveryFilters]);

  const handleStartImport = useCallback(async () => {
    dispatch({ type: 'SET_IMPORTING', payload: true });
    dispatch({ type: 'SET_STEP', payload: 'progress' });
    dispatch({
      type: 'SET_PROGRESS',
      payload: {
        ...INITIAL_PROGRESS,
        totalItems: selectedAsins.length,
        startTime: Date.now(),
      },
    });

    try {
      // Prepare import items
      const importItems = selectedAsins.map(asin => ({
        asin,
        title: `Product ${asin}`,
        amazon_price: null, // Will be fetched by API
        category: 'Imported',
      }));

      // Start real import job
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: importItems,
          options: {
            skipExisting: true,
            fetchPrices: true,
            fetchDetails: true,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Import API error: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error?.message || 'Import failed');
      }

      const jobId = result.data.jobId;

      // Poll for progress
      const pollProgress = async () => {
        try {
          const progressResponse = await fetch(`/api/import?jobId=${jobId}`);
          const progressResult = await progressResponse.json();

          if (progressResult.success) {
            const job = progressResult.data;
            
            dispatch({
              type: 'SET_PROGRESS',
              payload: {
                currentItem: job.processedItems,
                totalItems: job.totalItems,
                successCount: job.successCount,
                failCount: job.failCount,
                phase: job.status === 'completed' ? 'complete' : 
                       job.status === 'failed' ? 'calculating' : 'fetching_rainforest',
                errors: job.errors.map(e => ({ asin: e.asin, error: e.error })),
                estimatedTimeRemaining: Math.max(0, ((job.totalItems - job.processedItems) / BATCH_SIZE) * (BATCH_DELAY / 1000)),
              },
            });

            if (job.status === 'completed' || job.status === 'failed') {
              if (job.status === 'completed') {
                // Use created products from job if available, otherwise fetch from API
                let importedProducts = [];
                
                if (job.createdProducts && job.createdProducts.length > 0) {
                  importedProducts = job.createdProducts;
                  console.log('[ImportPanel] Using created products from job:', importedProducts.length);
                } else {
                  // Fallback: Fetch the imported products from products API
                  console.log('[ImportPanel] Fetching imported products from API');
                  const productsResponse = await fetch('/api/products?action=list&pageSize=1000');
                  const productsResult = await productsResponse.json();
                  
                  if (productsResult.success) {
                    importedProducts = productsResult.data.filter((p: any) => 
                      importItems.some(item => item.asin === p.asin)
                    );
                  }
                }
                  
                dispatch({ type: 'SET_IMPORT_RESULT', payload: importedProducts });
                onImportComplete(importedProducts);
              }
              
              dispatch({
                type: 'SET_PROGRESS',
                payload: { phase: job.status === 'completed' ? 'complete' : 'calculating' },
              });
              
              if (job.status === 'failed') {
                dispatch({
                  type: 'SET_IMPORT_ERROR',
                  payload: {
                    code: 'IMPORT_041',
                    message: 'Import failed',
                    details: job.errors.map(e => e.error).join(', '),
                    suggestion: 'Check the errors and try again',
                    severity: 'error' as const,
                    blocking: false,
                  },
                });
              }
            } else {
              // Continue polling
              setTimeout(pollProgress, 2000);
            }
          }
        } catch (error) {
          console.error('Progress polling error:', error);
          setTimeout(pollProgress, 5000); // Retry with longer delay
        }
      };

      // Start polling
      setTimeout(pollProgress, 1000);
    } catch (error) {
      dispatch({
        type: 'SET_IMPORT_ERROR',
        payload: {
          code: 'IMPORT_040',
          message: 'Import failed',
          details: error instanceof Error ? error.message : 'Unknown error',
          suggestion: 'Try importing again or contact support',
          severity: 'error' as const,
          blocking: false,
        },
      });
    }
  }, [selectedAsins, onImportComplete]);

  const handleClose = useCallback(() => {
    if (state.isImporting) {
      abortControllerRef.current?.abort();
    }
    dispatch({ type: 'RESET' });
    onClose();
  }, [state.isImporting, onClose]);

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // NAVIGATION
  // ─────────────────────────────────────────────────────────────────────────

  const navigateToStep = useCallback((step: ImportStep) => {
    dispatch({ type: 'SET_STEP', payload: step });
  }, []);

  const handleSourceNext = useCallback(() => {
    if (state.source === 'rainforest') {
      navigateToStep('discover');
    } else {
      navigateToStep('upload');
    }
  }, [state.source, navigateToStep]);

  const handleUploadNext = useCallback(() => {
    navigateToStep('datapoints');
  }, [navigateToStep]);

  const handleDiscoverNext = useCallback(() => {
    navigateToStep('datapoints');
  }, [navigateToStep]);

  const handleDataPointsNext = useCallback(() => {
    navigateToStep('estimate');
  }, [navigateToStep]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
      aria-describedby="import-modal-description"
    >
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={state.isImporting ? undefined : handleClose}
          aria-hidden="true"
        />

        {/* Modal */}
        <div 
          ref={modalRef}
          className="relative bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          role="document"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 id="import-modal-title" className="text-xl font-semibold text-gray-900">Import Products</h2>
              <p id="import-modal-description" className="text-sm text-gray-500">Add products to your inventory</p>
            </div>
            {!state.isImporting && (
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close import dialog"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Step Indicator */}
          {state.step !== 'complete' && (
            <div className="px-6 pt-6">
              <StepIndicator steps={steps} currentStep={state.step} />
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {/* Source Selection */}
            {state.step === 'source' && (
              <SourceSelectionStep
                source={state.source}
                onSourceChange={(source) => dispatch({ type: 'SET_SOURCE', payload: source })}
                onNext={handleSourceNext}
              />
            )}

            {/* File Upload / Manual Entry */}
            {state.step === 'upload' && state.source === 'file' && (
              <FileUploadStep
                file={state.file}
                error={state.fileError}
                isParsing={state.isParsing}
                parsedProducts={state.parsedProducts}
                existingAsins={existingAsins}
                onFileSelect={handleFileSelect}
                onParse={() => {}}
                onBack={() => navigateToStep('source')}
                onNext={handleUploadNext}
              />
            )}

            {state.step === 'upload' && state.source === 'manual' && (
              <ManualEntryStep
                parsedProducts={state.parsedProducts}
                existingAsins={existingAsins}
                onProductsChange={(products) => dispatch({ type: 'SET_PARSED_PRODUCTS', payload: products })}
                onBack={() => navigateToStep('source')}
                onNext={handleUploadNext}
              />
            )}

            {/* Discovery */}
            {state.step === 'discover' && (
              <DiscoveryStep
                filters={state.discoveryFilters}
                isDiscovering={state.isDiscovering}
                discoveredProducts={state.discoveredProducts}
                selectedAsins={state.selectedDiscovered}
                error={state.discoveryError}
                existingAsins={existingAsins}
                onFiltersChange={(filters) => dispatch({ type: 'SET_DISCOVERY_FILTERS', payload: filters })}
                onSearch={handleSearch}
                onToggleSelection={(asin) => dispatch({ type: 'TOGGLE_DISCOVERED_SELECTION', payload: asin })}
                onSelectAll={() => dispatch({ type: 'SELECT_ALL_DISCOVERED' })}
                onDeselectAll={() => dispatch({ type: 'DESELECT_ALL_DISCOVERED' })}
                onBack={() => navigateToStep('source')}
                onNext={handleDiscoverNext}
              />
            )}

            {/* Data Points */}
            {state.step === 'datapoints' && (
              <DataPointsStep
                dataPoints={state.dataPoints}
                productCount={selectedAsins.length}
                onToggleDataPoint={(id) => dispatch({ type: 'TOGGLE_DATA_POINT', payload: id })}
                onBack={() => state.source === 'rainforest' ? navigateToStep('discover') : navigateToStep('upload')}
                onNext={handleDataPointsNext}
              />
            )}

            {/* Cost Estimate */}
            {state.step === 'estimate' && (
              <CostEstimateStep
                productCount={selectedAsins.length}
                dataPoints={state.dataPoints}
                existingAsins={existingAsins}
                selectedAsins={selectedAsins}
                onBack={() => navigateToStep('datapoints')}
                onStartImport={handleStartImport}
              />
            )}

            {/* Progress */}
            {state.step === 'progress' && (
              <ImportProgressStep
                progress={state.progress}
                error={state.importError}
              />
            )}

            {/* Complete */}
            {state.step === 'complete' && (
              <ImportCompleteStep
                progress={state.progress}
                importedProducts={state.importedProducts}
                onClose={handleClose}
                onImportMore={handleReset}
              />
            )}
          </div>
        </div>
      </div>

      {/* Toast Notifications */}
      <ToastContainer toasts={state.toasts} onDismiss={(id) => dispatch({ type: 'REMOVE_TOAST', payload: id })} />
    </div>
  );
}

export default ImportPanel;
