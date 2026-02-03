'use client';

// components/import/AIImportBot.tsx
// AI-Powered Import Bot - Smart file detection, scenario recognition, recommendations
// Handles both: Verify Mode (full data) and Full Import Mode (ASIN only)
// FIXED: Using inline SVG icons instead of lucide-react

import { useState, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// INLINE SVG ICONS
// ═══════════════════════════════════════════════════════════════════════════

const Icons = {
  Bot: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  Sparkles: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  ),
  CheckCircle: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  AlertCircle: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  FileText: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  Zap: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  ArrowRight: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  ),
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface DetectedColumn {
  name: string;
  type: 'asin' | 'title' | 'price' | 'cost' | 'image' | 'description' | 'tags' | 'url' | 'unknown';
  sampleValues: string[];
  confidence: number;
}

interface FileAnalysis {
  totalRows: number;
  totalColumns: number;
  detectedColumns: DetectedColumn[];
  asinColumn: string | null;
  asinCount: number;
  hasTitle: boolean;
  hasPrice: boolean;
  hasImages: boolean;
  hasDescription: boolean;
  recommendedMode: 'verify' | 'full_import';
  tokenEstimate: number;
  potentialSavings: number;
}

interface AIImportBotProps {
  fileData?: any[];
  fileName?: string;
  onModeSelect: (mode: 'verify' | 'full_import') => void;
  onAnalysisComplete?: (analysis: FileAnalysis) => void;
  isKeepaConnected?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// COLUMN DETECTION PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const COLUMN_PATTERNS: Record<string, { names: RegExp[]; valuePattern?: RegExp }> = {
  asin: {
    names: [/^asin$/i, /variant.*sku/i, /^sku$/i, /amazon.*asin/i, /product.*id/i],
    valuePattern: /^B[A-Z0-9]{9}$/,
  },
  title: {
    names: [/^title$/i, /product.*name/i, /^name$/i, /item.*name/i],
  },
  price: {
    names: [/^price$/i, /variant.*price/i, /selling.*price/i, /your.*price/i, /retail.*price/i],
    valuePattern: /^\$?[\d,.]+$/,
  },
  cost: {
    names: [/^cost$/i, /variant.*cost/i, /your.*cost/i, /unit.*cost/i, /amazon.*price/i],
    valuePattern: /^\$?[\d,.]+$/,
  },
  image: {
    names: [/image/i, /^pic/i, /photo/i, /thumbnail/i],
    valuePattern: /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)/i,
  },
  description: {
    names: [/description/i, /body/i, /^desc$/i],
  },
  tags: {
    names: [/^tags$/i, /categories/i, /^category$/i],
  },
  url: {
    names: [/url/i, /link/i, /supplier/i],
    valuePattern: /amazon\.com/i,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function detectColumnType(columnName: string, sampleValues: string[]): { type: string; confidence: number } {
  for (const [type, patterns] of Object.entries(COLUMN_PATTERNS)) {
    const nameMatch = patterns.names.some(regex => regex.test(columnName));
    
    if (nameMatch) {
      if (patterns.valuePattern) {
        const matchingValues = sampleValues.filter(v => v && patterns.valuePattern!.test(String(v)));
        const confidence = sampleValues.length > 0 ? matchingValues.length / sampleValues.length : 0;
        if (confidence > 0.3) {
          return { type, confidence: Math.min(0.9, 0.5 + confidence * 0.4) };
        }
      } else {
        return { type, confidence: 0.8 };
      }
    }
  }

  for (const [type, patterns] of Object.entries(COLUMN_PATTERNS)) {
    if (patterns.valuePattern) {
      const matchingValues = sampleValues.filter(v => v && patterns.valuePattern!.test(String(v)));
      const confidence = sampleValues.length > 0 ? matchingValues.length / sampleValues.length : 0;
      if (confidence > 0.5) {
        return { type, confidence: confidence * 0.7 };
      }
    }
  }

  return { type: 'unknown', confidence: 0 };
}

function extractAsins(data: any[]): string[] {
  const asinPattern = /\b(B[A-Z0-9]{9})\b/gi;
  const asins = new Set<string>();

  for (const row of data) {
    for (const value of Object.values(row)) {
      if (typeof value === 'string') {
        const matches = value.match(asinPattern);
        if (matches) {
          matches.forEach(m => asins.add(m.toUpperCase()));
        }
      }
    }
  }

  return Array.from(asins);
}

function analyzeFile(data: any[]): FileAnalysis {
  if (!data || data.length === 0) {
    return {
      totalRows: 0,
      totalColumns: 0,
      detectedColumns: [],
      asinColumn: null,
      asinCount: 0,
      hasTitle: false,
      hasPrice: false,
      hasImages: false,
      hasDescription: false,
      recommendedMode: 'full_import',
      tokenEstimate: 0,
      potentialSavings: 0,
    };
  }

  const columns = Object.keys(data[0]);
  const detectedColumns: DetectedColumn[] = [];

  for (const col of columns) {
    const sampleValues = data.slice(0, 20).map(row => String(row[col] || '')).filter(Boolean);
    const { type, confidence } = detectColumnType(col, sampleValues);

    detectedColumns.push({
      name: col,
      type: type as any,
      sampleValues: sampleValues.slice(0, 3),
      confidence,
    });
  }

  const asinCol = detectedColumns.find(c => c.type === 'asin' && c.confidence > 0.5);
  const asins = extractAsins(data);

  const hasTitle = detectedColumns.some(c => c.type === 'title' && c.confidence > 0.5);
  const hasPrice = detectedColumns.some(c => c.type === 'price' && c.confidence > 0.5);
  const hasImages = detectedColumns.some(c => c.type === 'image' && c.confidence > 0.5);
  const hasDescription = detectedColumns.some(c => c.type === 'description' && c.confidence > 0.5);

  const hasFullData = hasTitle && hasPrice && (hasImages || hasDescription);
  const recommendedMode = hasFullData ? 'verify' : 'full_import';

  const tokenEstimate = asins.length;
  const potentialSavings = hasFullData ? Math.floor(asins.length * 0.8) : 0;

  return {
    totalRows: data.length,
    totalColumns: columns.length,
    detectedColumns,
    asinColumn: asinCol?.name || null,
    asinCount: asins.length,
    hasTitle,
    hasPrice,
    hasImages,
    hasDescription,
    recommendedMode,
    tokenEstimate,
    potentialSavings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function AIImportBot({
  fileData,
  fileName,
  onModeSelect,
  onAnalysisComplete,
  isKeepaConnected = true,
}: AIImportBotProps) {
  const [analysis, setAnalysis] = useState<FileAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'verify' | 'full_import' | null>(null);

  useEffect(() => {
    if (fileData && fileData.length > 0) {
      setIsAnalyzing(true);
      
      setTimeout(() => {
        const result = analyzeFile(fileData);
        setAnalysis(result);
        setIsAnalyzing(false);
        onAnalysisComplete?.(result);
        
        if (result.recommendedMode && !selectedMode) {
          setSelectedMode(result.recommendedMode);
          onModeSelect(result.recommendedMode);
        }
      }, 500);
    }
  }, [fileData, onAnalysisComplete, onModeSelect, selectedMode]);

  const handleModeSelect = (mode: 'verify' | 'full_import') => {
    setSelectedMode(mode);
    onModeSelect(mode);
  };

  if (!fileData || fileData.length === 0) {
    return (
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-purple-100 rounded-lg text-purple-600">
            <Icons.Bot className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-purple-900 flex items-center gap-2">
              <Icons.Sparkles className="w-4 h-4" />
              AI Import Assistant
            </h3>
            <p className="text-sm text-purple-700 mt-1">
              Upload any file format - I'll automatically detect ASINs, prices, and product data.
              Then I'll use Keepa to fetch live Amazon prices and calculate your profits!
            </p>
            <div className="mt-3 flex items-center gap-4 text-xs">
              {isKeepaConnected ? (
                <span className="flex items-center gap-1 text-green-600">
                  <Icons.CheckCircle className="w-4 h-4" />
                  Keepa API connected
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-600">
                  <Icons.AlertCircle className="w-4 h-4" />
                  Keepa not configured
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isAnalyzing) {
    return (
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-5">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-purple-100 rounded-lg text-purple-600 animate-pulse">
            <Icons.Bot className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-purple-900">Analyzing your file...</h3>
            <p className="text-sm text-purple-700 mt-1">
              Detecting columns, extracting ASINs, checking data completeness
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-purple-100 rounded-lg text-purple-600">
          <Icons.Bot className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-purple-900 flex items-center gap-2">
            <Icons.Sparkles className="w-4 h-4" />
            Analysis Complete
          </h3>
          <p className="text-sm text-purple-700 mt-1">
            {analysis.recommendedMode === 'verify' ? (
              <>
                I see you already have <strong>full product data</strong>. I'll just verify current Amazon prices and calculate your profit margins.
                <span className="text-green-600 ml-1">This saves Keepa tokens!</span>
              </>
            ) : (
              <>
                I see you only have <strong>ASINs</strong>. I'll fetch complete product data from Keepa including titles, images, prices, ratings, and BSR.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-blue-600">{analysis.asinCount}</p>
          <p className="text-xs text-gray-600">ASINs Found</p>
        </div>
        <div className="bg-white rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-purple-600">{analysis.totalColumns}</p>
          <p className="text-xs text-gray-600">Columns</p>
        </div>
        <div className="bg-white rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-600">~{analysis.tokenEstimate}</p>
          <p className="text-xs text-gray-600">Est. Tokens</p>
        </div>
        <div className="bg-white rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-amber-600">{analysis.potentialSavings}</p>
          <p className="text-xs text-gray-600">Potential Savings</p>
        </div>
      </div>

      <div className="bg-white rounded-lg p-3">
        <p className="text-sm font-medium text-gray-700 mb-2">Detected Columns:</p>
        <div className="flex flex-wrap gap-2">
          {analysis.detectedColumns.filter(c => c.type !== 'unknown').map(col => (
            <span
              key={col.name}
              className={`px-2 py-1 text-xs rounded-full ${
                col.type === 'asin' ? 'bg-blue-100 text-blue-700' :
                col.type === 'title' ? 'bg-green-100 text-green-700' :
                col.type === 'price' ? 'bg-purple-100 text-purple-700' :
                col.type === 'image' ? 'bg-amber-100 text-amber-700' :
                'bg-gray-100 text-gray-700'
              }`}
            >
              {col.type}: {col.name}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => handleModeSelect('verify')}
          disabled={!analysis.hasTitle || !analysis.hasPrice}
          className={`p-4 rounded-lg border-2 text-left transition-all ${
            selectedMode === 'verify'
              ? 'border-green-500 bg-green-50'
              : 'border-gray-200 hover:border-gray-300'
          } ${(!analysis.hasTitle || !analysis.hasPrice) ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Icons.Zap className="w-4 h-4 text-green-600" />
            <span className="font-medium text-gray-900">Verify Mode</span>
            {selectedMode === 'verify' && (
              <Icons.CheckCircle className="w-4 h-4 text-green-600 ml-auto" />
            )}
          </div>
          <p className="text-xs text-gray-600">Use existing data, only fetch Amazon prices</p>
          <p className="text-xs text-green-600 mt-1">Saves ~{analysis.potentialSavings} tokens</p>
        </button>

        <button
          onClick={() => handleModeSelect('full_import')}
          className={`p-4 rounded-lg border-2 text-left transition-all ${
            selectedMode === 'full_import'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Icons.FileText className="w-4 h-4 text-blue-600" />
            <span className="font-medium text-gray-900">Full Import</span>
            {selectedMode === 'full_import' && (
              <Icons.CheckCircle className="w-4 h-4 text-blue-600 ml-auto" />
            )}
          </div>
          <p className="text-xs text-gray-600">Fetch all data from Keepa (title, images, price, etc.)</p>
          <p className="text-xs text-blue-600 mt-1">Uses ~{analysis.tokenEstimate} tokens</p>
        </button>
      </div>

      {analysis.recommendedMode && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
          analysis.recommendedMode === 'verify' 
            ? 'bg-green-100 text-green-700' 
            : 'bg-blue-100 text-blue-700'
        }`}>
          <Icons.Sparkles className="w-4 h-4" />
          Recommended: <strong>{analysis.recommendedMode === 'verify' ? 'Verify Mode' : 'Full Import'}</strong>
          <Icons.ArrowRight className="w-4 h-4" />
        </div>
      )}
    </div>
  );
}

export default AIImportBot;
