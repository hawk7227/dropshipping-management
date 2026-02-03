'use client';

// components/import/ImportPanelEnhanced.tsx
// ENHANCED Import Panel with AI Bot Integration
// Uses new /api/import/v2 endpoint that calls Keepa for full product data
// Includes: Smart file detection, two-scenario support (Verify vs Full Import)

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
import { AIImportBot } from './AIImportBot';
import type { Product } from '@/types';
import type { ApiError } from '@/types/errors';
import { InlineError } from '@/components/ui/InlineError';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

type ImportStep = 
  | 'source'      // Step 1: Choose source method
  | 'upload'      // Step 2: Upload file / enter ASINs
  | 'analyze'     // Step 3: AI analyzes file
  | 'review'      // Step 4: Review products & mode selection
  | 'progress'    // Step 5: Import in progress
  | 'complete';   // Step 6: Done

type DataSource = 'file' | 'manual';
type ImportMode = 'verify' | 'full_import';

interface ParsedRow {
  asin: string;
  title?: string;
  price?: number;
  cost?: number;
  image?: string;
  [key: string]: any;
}

interface FileAnalysis {
  totalRows: number;
  totalColumns: number;
  asinColumn: string | null;
  asinCount: number;
  hasTitle: boolean;
  hasPrice: boolean;
  hasImages: boolean;
  hasDescription: boolean;
  recommendedMode: ImportMode;
  tokenEstimate: number;
  detectedColumns: Array<{
    name: string;
    type: string;
    confidence: number;
  }>;
}

interface ImportProgress {
  phase: 'preparing' | 'fetching' | 'saving' | 'complete' | 'failed';
  current: number;
  total: number;
  imported: number;
  updated: number;
  rejected: number;
  soldOut: number;
  errors: Array<{ asin: string; error: string }>;
}

interface ImportPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (products: Product[]) => void;
  existingAsins?: Set<string>;
}

// State
interface ImportState {
  step: ImportStep;
  source: DataSource;
  mode: ImportMode | null;
  
  // File data
  file: File | null;
  fileError: ApiError | null;
  isParsing: boolean;
  parsedData: ParsedRow[];
  
  // Analysis
  analysis: FileAnalysis | null;
  isAnalyzing: boolean;
  
  // Manual entry
  manualAsins: string;
  
  // Import
  isImporting: boolean;
  progress: ImportProgress;
  importError: ApiError | null;
  importedProducts: Product[];
  
  // Token tracking
  tokensUsed: number;
  tokensSaved: number;
}

type ImportAction =
  | { type: 'SET_STEP'; payload: ImportStep }
  | { type: 'SET_SOURCE'; payload: DataSource }
  | { type: 'SET_MODE'; payload: ImportMode }
  | { type: 'SET_FILE'; payload: File | null }
  | { type: 'SET_FILE_ERROR'; payload: ApiError | null }
  | { type: 'SET_PARSING'; payload: boolean }
  | { type: 'SET_PARSED_DATA'; payload: ParsedRow[] }
  | { type: 'SET_ANALYSIS'; payload: FileAnalysis }
  | { type: 'SET_ANALYZING'; payload: boolean }
  | { type: 'SET_MANUAL_ASINS'; payload: string }
  | { type: 'SET_IMPORTING'; payload: boolean }
  | { type: 'SET_PROGRESS'; payload: Partial<ImportProgress> }
  | { type: 'SET_IMPORT_ERROR'; payload: ApiError | null }
  | { type: 'SET_IMPORT_RESULT'; payload: { products: Product[]; tokensUsed: number; tokensSaved: number } }
  | { type: 'RESET' };

const initialState: ImportState = {
  step: 'source',
  source: 'file',
  mode: null,
  file: null,
  fileError: null,
  isParsing: false,
  parsedData: [],
  analysis: null,
  isAnalyzing: false,
  manualAsins: '',
  isImporting: false,
  progress: {
    phase: 'preparing',
    current: 0,
    total: 0,
    imported: 0,
    updated: 0,
    rejected: 0,
    soldOut: 0,
    errors: [],
  },
  importError: null,
  importedProducts: [],
  tokensUsed: 0,
  tokensSaved: 0,
};

function reducer(state: ImportState, action: ImportAction): ImportState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.payload };
    case 'SET_SOURCE':
      return { ...state, source: action.payload };
    case 'SET_MODE':
      return { ...state, mode: action.payload };
    case 'SET_FILE':
      return { ...state, file: action.payload, fileError: null };
    case 'SET_FILE_ERROR':
      return { ...state, fileError: action.payload };
    case 'SET_PARSING':
      return { ...state, isParsing: action.payload };
    case 'SET_PARSED_DATA':
      return { ...state, parsedData: action.payload, isParsing: false };
    case 'SET_ANALYSIS':
      return { ...state, analysis: action.payload, isAnalyzing: false };
    case 'SET_ANALYZING':
      return { ...state, isAnalyzing: action.payload };
    case 'SET_MANUAL_ASINS':
      return { ...state, manualAsins: action.payload };
    case 'SET_IMPORTING':
      return { ...state, isImporting: action.payload };
    case 'SET_PROGRESS':
      return { ...state, progress: { ...state.progress, ...action.payload } };
    case 'SET_IMPORT_ERROR':
      return { ...state, importError: action.payload, isImporting: false };
    case 'SET_IMPORT_RESULT':
      return {
        ...state,
        importedProducts: action.payload.products,
        tokensUsed: action.payload.tokensUsed,
        tokensSaved: action.payload.tokensSaved,
        isImporting: false,
      };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function extractAsins(text: string): string[] {
  const asinPattern = /\b(B[A-Z0-9]{9})\b/gi;
  const matches = text.match(asinPattern) || [];
  return [...new Set(matches.map(m => m.toUpperCase()))];
}

async function parseFile(file: File): Promise<ParsedRow[]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  
  if (extension === 'csv' || extension === 'txt') {
    const text = await file.text();
    return parseCSV(text);
  } else if (extension === 'xlsx' || extension === 'xls') {
    // For Excel, we'll use a simple approach - send to API for parsing
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/files/parse', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error('Failed to parse Excel file');
    }
    
    const data = await response.json();
    return data.rows || [];
  } else if (extension === 'json') {
    const text = await file.text();
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [data];
  }
  
  throw new Error(`Unsupported file type: ${extension}`);
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return [];
  
  // Detect delimiter
  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') ? '\t' : ',';
  
  // Parse header
  const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
  
  // Parse rows
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
    const row: ParsedRow = { asin: '' };
    
    headers.forEach((header, index) => {
      const value = values[index];
      const lowerHeader = header.toLowerCase();
      
      // Map common column names
      if (lowerHeader.includes('asin') || lowerHeader.includes('sku')) {
        // Extract ASIN from value
        const asins = extractAsins(value || '');
        if (asins.length > 0) row.asin = asins[0];
      } else if (lowerHeader.includes('title') || lowerHeader.includes('name')) {
        row.title = value;
      } else if (lowerHeader.includes('price') && !lowerHeader.includes('compare')) {
        row.price = parseFloat(value?.replace(/[$,]/g, '') || '0') || undefined;
      } else if (lowerHeader.includes('cost')) {
        row.cost = parseFloat(value?.replace(/[$,]/g, '') || '0') || undefined;
      } else if (lowerHeader.includes('image')) {
        row.image = value;
      }
      
      // Store all values
      row[header] = value;
    });
    
    // Also try to extract ASIN from any URL-like field
    if (!row.asin) {
      for (const value of Object.values(row)) {
        if (typeof value === 'string' && value.includes('amazon.com')) {
          const asins = extractAsins(value);
          if (asins.length > 0) {
            row.asin = asins[0];
            break;
          }
        }
      }
    }
    
    if (row.asin) {
      rows.push(row);
    }
  }
  
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function SourceStep({
  source,
  onSourceChange,
  onNext,
}: {
  source: DataSource;
  onSourceChange: (s: DataSource) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* AI Bot Introduction */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-purple-900 flex items-center gap-2">
              🤖 AI Import Assistant
            </h4>
            <p className="text-sm text-purple-700 mt-1">
              Upload any file format - I'll automatically detect ASINs, prices, and product data. 
              I'll use Keepa to fetch live Amazon prices and calculate your profits!
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs text-green-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Keepa API connected
            </div>
          </div>
        </div>
      </div>

      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900">Choose Import Method</h3>
        <p className="text-gray-500 mt-1">Select how you want to add products</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onSourceChange('file')}
          className={`p-6 rounded-lg border-2 text-left transition-all ${
            source === 'file'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className={`mb-3 ${source === 'file' ? 'text-blue-600' : 'text-gray-400'}`}>
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h4 className="font-medium text-gray-900">Upload File</h4>
          <p className="text-sm text-gray-500 mt-1">CSV, Excel, or any format with ASINs</p>
        </button>

        <button
          onClick={() => onSourceChange('manual')}
          className={`p-6 rounded-lg border-2 text-left transition-all ${
            source === 'manual'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className={`mb-3 ${source === 'manual' ? 'text-blue-600' : 'text-gray-400'}`}>
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <h4 className="font-medium text-gray-900">Enter ASINs</h4>
          <p className="text-sm text-gray-500 mt-1">Paste or type ASIN codes directly</p>
        </button>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onNext}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function UploadStep({
  source,
  file,
  error,
  isParsing,
  manualAsins,
  parsedData,
  onFileSelect,
  onManualAsinsChange,
  onBack,
  onNext,
}: {
  source: DataSource;
  file: File | null;
  error: ApiError | null;
  isParsing: boolean;
  manualAsins: string;
  parsedData: ParsedRow[];
  onFileSelect: (f: File | null) => void;
  onManualAsinsChange: (s: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) onFileSelect(droppedFile);
  };

  const asinCount = source === 'manual' 
    ? extractAsins(manualAsins).length 
    : parsedData.filter(r => r.asin).length;

  return (
    <div className="space-y-6">
      {source === 'file' ? (
        <>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900">Upload Product File</h3>
            <p className="text-gray-500 mt-1">Any format with ASINs - we'll auto-detect columns</p>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-blue-500 bg-blue-50' :
              file ? 'border-green-500 bg-green-50' :
              'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.json,.txt"
              onChange={(e) => e.target.files?.[0] && onFileSelect(e.target.files[0])}
              className="hidden"
            />
            
            {file ? (
              <div className="space-y-2">
                <svg className="w-12 h-12 mx-auto text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                {isParsing && (
                  <p className="text-sm text-blue-600 animate-pulse">Parsing file...</p>
                )}
                {parsedData.length > 0 && (
                  <p className="text-sm text-green-600">Found {asinCount} ASINs</p>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onFileSelect(null); }}
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
                <p className="text-sm text-gray-500">CSV, XLSX, XLS, JSON, or TXT</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900">Enter ASINs</h3>
            <p className="text-gray-500 mt-1">Paste ASINs or Amazon URLs (one per line)</p>
          </div>

          <textarea
            value={manualAsins}
            onChange={(e) => onManualAsinsChange(e.target.value)}
            placeholder="B08N5WRWNW&#10;B07PXGQC1Q&#10;https://amazon.com/dp/B09ABC123&#10;..."
            className="w-full h-48 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
          />

          {asinCount > 0 && (
            <p className="text-sm text-green-600 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Found {asinCount} valid ASINs
            </p>
          )}
        </>
      )}

      {error && <InlineError error={error} showSuggestion />}

      <div className="flex justify-between">
        <button onClick={onBack} className="px-4 py-2 text-gray-700 hover:text-gray-900">
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={asinCount === 0 || isParsing}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isParsing ? 'Parsing...' : `Continue with ${asinCount} ASINs`}
        </button>
      </div>
    </div>
  );
}

function ReviewStep({
  parsedData,
  analysis,
  mode,
  existingAsins,
  onModeSelect,
  onBack,
  onImport,
}: {
  parsedData: ParsedRow[];
  analysis: FileAnalysis | null;
  mode: ImportMode | null;
  existingAsins: Set<string>;
  onModeSelect: (m: ImportMode) => void;
  onBack: () => void;
  onImport: () => void;
}) {
  const asins = parsedData.filter(r => r.asin).map(r => r.asin);
  const uniqueAsins = [...new Set(asins)];
  const duplicates = uniqueAsins.filter(a => existingAsins.has(a)).length;
  const newAsins = uniqueAsins.length - duplicates;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900">Review & Import</h3>
        <p className="text-gray-500 mt-1">Confirm import mode and start the import</p>
      </div>

      {/* AI Analysis */}
      <AIImportBot
        fileData={parsedData}
        onModeSelect={onModeSelect}
        onAnalysisComplete={() => {}}
        isKeepaConnected={true}
      />

      {/* Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-3">Import Summary</h4>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{uniqueAsins.length}</p>
            <p className="text-sm text-gray-600">Total ASINs</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{newAsins}</p>
            <p className="text-sm text-gray-600">New Products</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-yellow-600">{duplicates}</p>
            <p className="text-sm text-gray-600">Will Update</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-600">~{analysis?.tokenEstimate || uniqueAsins.length}</p>
            <p className="text-sm text-gray-600">Keepa Tokens</p>
          </div>
        </div>
      </div>

      {/* Mode Selection - if not auto-selected */}
      {!mode && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-amber-800">Please select an import mode above to continue.</p>
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={onBack} className="px-4 py-2 text-gray-700 hover:text-gray-900">
          ← Back
        </button>
        <button
          onClick={onImport}
          disabled={!mode}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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

function ProgressStep({
  progress,
  error,
}: {
  progress: ImportProgress;
  error: ApiError | null;
}) {
  const percentage = progress.total > 0 
    ? Math.round((progress.current / progress.total) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900">
          {progress.phase === 'complete' ? 'Import Complete!' : 
           progress.phase === 'failed' ? 'Import Failed' : 
           'Importing Products...'}
        </h3>
        <p className="text-gray-500 mt-1">
          {progress.phase === 'fetching' && 'Fetching product data from Keepa...'}
          {progress.phase === 'saving' && 'Saving products to database...'}
          {progress.phase === 'complete' && 'All products have been imported successfully.'}
        </p>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Progress</span>
          <span className="font-medium">{percentage}%</span>
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 ${
              progress.phase === 'failed' ? 'bg-red-500' :
              progress.phase === 'complete' ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-600">{progress.imported}</p>
          <p className="text-xs text-green-700">Imported</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-blue-600">{progress.updated}</p>
          <p className="text-xs text-blue-700">Updated</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-yellow-600">{progress.soldOut}</p>
          <p className="text-xs text-yellow-700">Sold Out</p>
        </div>
        <div className="bg-red-50 rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-red-600">{progress.rejected}</p>
          <p className="text-xs text-red-700">Rejected</p>
        </div>
      </div>

      {/* Errors */}
      {progress.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-32 overflow-y-auto">
          <p className="font-medium text-red-800 mb-2">Errors:</p>
          <ul className="text-sm text-red-700 space-y-1">
            {progress.errors.slice(0, 10).map((err, i) => (
              <li key={i}>• {err.asin}: {err.error}</li>
            ))}
            {progress.errors.length > 10 && (
              <li>... and {progress.errors.length - 10} more</li>
            )}
          </ul>
        </div>
      )}

      {error && <InlineError error={error} showSuggestion />}
    </div>
  );
}

function CompleteStep({
  progress,
  importedProducts,
  tokensUsed,
  tokensSaved,
  onClose,
  onImportMore,
}: {
  progress: ImportProgress;
  importedProducts: Product[];
  tokensUsed: number;
  tokensSaved: number;
  onClose: () => void;
  onImportMore: () => void;
}) {
  return (
    <div className="space-y-6 text-center">
      <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
        <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <div>
        <h3 className="text-xl font-semibold text-gray-900">Import Complete!</h3>
        <p className="text-gray-500 mt-1">Your products have been imported successfully.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
        <div className="bg-green-50 rounded-lg p-4">
          <p className="text-2xl font-bold text-green-600">{progress.imported}</p>
          <p className="text-sm text-green-700">New Products</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-2xl font-bold text-blue-600">{progress.updated}</p>
          <p className="text-sm text-blue-700">Updated</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <p className="text-2xl font-bold text-purple-600">{tokensUsed}</p>
          <p className="text-sm text-purple-700">Tokens Used</p>
        </div>
      </div>

      {tokensSaved > 0 && (
        <p className="text-sm text-green-600 flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Saved {tokensSaved} tokens by using cached data!
        </p>
      )}

      <div className="flex justify-center gap-4 pt-4">
        <button
          onClick={onImportMore}
          className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Import More
        </button>
        <button
          onClick={onClose}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ImportPanelEnhanced({
  isOpen,
  onClose,
  onImportComplete,
  existingAsins = new Set(),
}: ImportPanelProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const modalRef = useRef<HTMLDivElement>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // FILE HANDLING
  // ─────────────────────────────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (file: File | null) => {
    dispatch({ type: 'SET_FILE', payload: file });
    
    if (!file) {
      dispatch({ type: 'SET_PARSED_DATA', payload: [] });
      return;
    }

    dispatch({ type: 'SET_PARSING', payload: true });
    
    try {
      const parsed = await parseFile(file);
      dispatch({ type: 'SET_PARSED_DATA', payload: parsed });
    } catch (error) {
      dispatch({
        type: 'SET_FILE_ERROR',
        payload: {
          code: 'PARSE_ERROR',
          message: 'Failed to parse file',
          details: error instanceof Error ? error.message : 'Unknown error',
          severity: 'error' as const,
          blocking: false,
        },
      });
      dispatch({ type: 'SET_PARSING', payload: false });
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // IMPORT
  // ─────────────────────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    // Get ASINs
    let asins: string[] = [];
    let existingData: ParsedRow[] = [];
    
    if (state.source === 'manual') {
      asins = extractAsins(state.manualAsins);
    } else {
      existingData = state.parsedData.filter(r => r.asin);
      asins = existingData.map(r => r.asin);
    }

    if (asins.length === 0) return;

    dispatch({ type: 'SET_STEP', payload: 'progress' });
    dispatch({ type: 'SET_IMPORTING', payload: true });
    dispatch({ 
      type: 'SET_PROGRESS', 
      payload: { 
        phase: 'fetching',
        total: asins.length,
        current: 0,
      } 
    });

    try {
      const response = await fetch('/api/import/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asins,
          mode: state.mode || 'full_import',
          options: {
            skipCache: false,
            autoApprove: true,
            markupPercent: 70,
          },
          existingData: state.mode === 'verify' ? existingData : undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Import failed');
      }

      // Update progress with results
      dispatch({
        type: 'SET_PROGRESS',
        payload: {
          phase: 'complete',
          current: asins.length,
          imported: result.data.imported,
          updated: result.data.updated,
          rejected: result.data.rejected || 0,
          soldOut: result.data.soldOut,
          errors: result.data.errors || [],
        },
      });

      // Convert result products to Product type
      const products: Product[] = result.data.products.map((p: any) => ({
        id: p.asin,
        asin: p.asin,
        title: p.title,
        image_url: p.image,
        amazon_price: p.amazonPrice,
        price: p.yourPrice,
        profit_percent: p.profitPercent,
        status: p.status,
      }));

      dispatch({
        type: 'SET_IMPORT_RESULT',
        payload: {
          products,
          tokensUsed: result.data.tokensUsed,
          tokensSaved: result.data.tokensSaved,
        },
      });

      dispatch({ type: 'SET_STEP', payload: 'complete' });
      onImportComplete(products);

    } catch (error) {
      dispatch({
        type: 'SET_PROGRESS',
        payload: { phase: 'failed' },
      });
      dispatch({
        type: 'SET_IMPORT_ERROR',
        payload: {
          code: 'IMPORT_ERROR',
          message: 'Import failed',
          details: error instanceof Error ? error.message : 'Unknown error',
          severity: 'error' as const,
          blocking: false,
        },
      });
    }
  }, [state.source, state.manualAsins, state.parsedData, state.mode, onImportComplete]);

  // ─────────────────────────────────────────────────────────────────────────
  // NAVIGATION
  // ─────────────────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const handleClose = useCallback(() => {
    dispatch({ type: 'RESET' });
    onClose();
  }, [onClose]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50"
          onClick={state.isImporting ? undefined : handleClose}
        />

        {/* Modal */}
        <div
          ref={modalRef}
          className="relative bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Import Products</h2>
              <p className="text-sm text-gray-500">Add products to your inventory with Keepa data</p>
            </div>
            {!state.isImporting && (
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {state.step === 'source' && (
              <SourceStep
                source={state.source}
                onSourceChange={(s) => dispatch({ type: 'SET_SOURCE', payload: s })}
                onNext={() => dispatch({ type: 'SET_STEP', payload: 'upload' })}
              />
            )}

            {state.step === 'upload' && (
              <UploadStep
                source={state.source}
                file={state.file}
                error={state.fileError}
                isParsing={state.isParsing}
                manualAsins={state.manualAsins}
                parsedData={state.parsedData}
                onFileSelect={handleFileSelect}
                onManualAsinsChange={(s) => dispatch({ type: 'SET_MANUAL_ASINS', payload: s })}
                onBack={() => dispatch({ type: 'SET_STEP', payload: 'source' })}
                onNext={() => dispatch({ type: 'SET_STEP', payload: 'review' })}
              />
            )}

            {state.step === 'review' && (
              <ReviewStep
                parsedData={state.parsedData.length > 0 
                  ? state.parsedData 
                  : extractAsins(state.manualAsins).map(asin => ({ asin }))
                }
                analysis={state.analysis}
                mode={state.mode}
                existingAsins={existingAsins}
                onModeSelect={(m) => dispatch({ type: 'SET_MODE', payload: m })}
                onBack={() => dispatch({ type: 'SET_STEP', payload: 'upload' })}
                onImport={handleImport}
              />
            )}

            {state.step === 'progress' && (
              <ProgressStep
                progress={state.progress}
                error={state.importError}
              />
            )}

            {state.step === 'complete' && (
              <CompleteStep
                progress={state.progress}
                importedProducts={state.importedProducts}
                tokensUsed={state.tokensUsed}
                tokensSaved={state.tokensSaved}
                onClose={handleClose}
                onImportMore={handleReset}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImportPanelEnhanced;
