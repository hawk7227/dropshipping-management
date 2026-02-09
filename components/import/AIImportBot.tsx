'use client';

// components/import/AIImportBot.tsx
// AI-Powered Import Bot - Smart file detection, cost analysis, best route recommendation
// ALWAYS shows cost before committing - recommends cheapest effective route
// FIXED: Using inline SVG icons instead of lucide-react

import { useState, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS - Token pricing
// ═══════════════════════════════════════════════════════════════════════════

const TOKEN_COST_PER_1000 = 0.10; // $0.10 per 1000 tokens (adjust based on your Keepa plan)
const TOKENS_PER_PRODUCT_FULL = 1; // Full import uses 1 token per product
const TOKENS_PER_PRODUCT_VERIFY = 0.2; // Verify mode uses ~0.2 tokens (price only)

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
  DollarSign: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  TrendingDown: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
    </svg>
  ),
  Award: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
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

interface CostBreakdown {
  mode: 'verify' | 'full_import';
  tokens: number;
  cost: number;
  description: string;
}

interface AIImportBotProps {
  fileData?: any[];
  fileName?: string;
  productCount?: number; // For manual sourcing
  onModeSelect: (mode: 'verify' | 'full_import') => void;
  onAnalysisComplete?: (analysis: FileAnalysis) => void;
  isKeepaConnected?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function calculateCost(tokens: number): number {
  return (tokens / 1000) * TOKEN_COST_PER_1000;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return '<$0.01';
  return `$${cost.toFixed(2)}`;
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

  // Calculate token estimates
  const tokenEstimate = Math.ceil(asins.length * TOKENS_PER_PRODUCT_FULL);
  const verifyTokens = Math.ceil(asins.length * TOKENS_PER_PRODUCT_VERIFY);
  const potentialSavings = hasFullData ? tokenEstimate - verifyTokens : 0;

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
  productCount,
  onModeSelect,
  onAnalysisComplete,
  isKeepaConnected = true,
}: AIImportBotProps) {
  const [analysis, setAnalysis] = useState<FileAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'verify' | 'full_import' | null>(null);

  // Calculate costs for both modes
  const count = analysis?.asinCount || productCount || 0;
  const fullImportTokens = Math.ceil(count * TOKENS_PER_PRODUCT_FULL);
  const verifyTokens = Math.ceil(count * TOKENS_PER_PRODUCT_VERIFY);
  
  const costs: CostBreakdown[] = [
    {
      mode: 'full_import',
      tokens: fullImportTokens,
      cost: calculateCost(fullImportTokens),
      description: 'Fetch all data (title, images, price, BSR, ratings)',
    },
    {
      mode: 'verify',
      tokens: verifyTokens,
      cost: calculateCost(verifyTokens),
      description: 'Only fetch current Amazon prices',
    },
  ];

  // Determine best route
  const canUseVerify = analysis?.hasTitle && analysis?.hasPrice;
  const bestRoute = canUseVerify ? 'verify' : 'full_import';
  const savings = canUseVerify ? fullImportTokens - verifyTokens : 0;
  const savingsCost = calculateCost(savings);

  // Analyze file when data changes
  useEffect(() => {
    if (fileData && fileData.length > 0) {
      setIsAnalyzing(true);
      
      setTimeout(() => {
        const result = analyzeFile(fileData);
        setAnalysis(result);
        setIsAnalyzing(false);
        onAnalysisComplete?.(result);
        
        // Auto-select recommended mode
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

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Initial State (no data)
  // ─────────────────────────────────────────────────────────────────────────

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
              Upload any file format - I'll analyze your data and recommend the <strong>cheapest, most effective</strong> import strategy.
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

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Analyzing
  // ─────────────────────────────────────────────────────────────────────────

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
              Detecting columns, calculating costs, finding the best route
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Analysis Complete with Cost Breakdown
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-5 space-y-4">
      {/* Header */}
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
            Found <strong>{analysis.asinCount} products</strong>. Here's my recommendation:
          </p>
        </div>
      </div>

      {/* COST BREAKDOWN - Always Visible */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
          <Icons.DollarSign className="w-5 h-5 text-green-600" />
          <span className="font-semibold text-gray-900">Cost Breakdown for {analysis.asinCount} Products</span>
        </div>
        
        <div className="p-4 space-y-3">
          {/* Full Import Cost */}
          <div className={`flex items-center justify-between p-3 rounded-lg ${
            bestRoute === 'full_import' ? 'bg-blue-50 border-2 border-blue-300' : 'bg-gray-50'
          }`}>
            <div className="flex items-center gap-3">
              <Icons.FileText className="w-5 h-5 text-blue-600" />
              <div>
                <p className="font-medium text-gray-900">Full Import</p>
                <p className="text-xs text-gray-500">Fetch all data from Keepa</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-gray-900">{fullImportTokens.toLocaleString()} tokens</p>
              <p className="text-sm text-gray-600">{formatCost(calculateCost(fullImportTokens))}</p>
            </div>
          </div>

          {/* Verify Mode Cost */}
          <div className={`flex items-center justify-between p-3 rounded-lg ${
            bestRoute === 'verify' ? 'bg-green-50 border-2 border-green-300' : 'bg-gray-50'
          } ${!canUseVerify ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-3">
              <Icons.Zap className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-medium text-gray-900">Verify Mode</p>
                <p className="text-xs text-gray-500">
                  {canUseVerify ? 'Use existing data, only fetch prices' : 'Requires title & price in file'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-gray-900">{verifyTokens.toLocaleString()} tokens</p>
              <p className="text-sm text-gray-600">{formatCost(calculateCost(verifyTokens))}</p>
            </div>
          </div>
        </div>
      </div>

      {/* AI RECOMMENDATION - Best Route */}
      <div className={`p-4 rounded-lg ${
        bestRoute === 'verify' 
          ? 'bg-green-100 border border-green-300' 
          : 'bg-blue-100 border border-blue-300'
      }`}>
        <div className="flex items-start gap-3">
          <Icons.Award className={`w-6 h-6 ${bestRoute === 'verify' ? 'text-green-600' : 'text-blue-600'}`} />
          <div className="flex-1">
            <p className={`font-semibold ${bestRoute === 'verify' ? 'text-green-800' : 'text-blue-800'}`}>
              🤖 My Recommendation: {bestRoute === 'verify' ? 'Verify Mode' : 'Full Import'}
            </p>
            <p className={`text-sm mt-1 ${bestRoute === 'verify' ? 'text-green-700' : 'text-blue-700'}`}>
              {bestRoute === 'verify' ? (
                <>
                  Your file already has product titles and prices. I'll just verify current Amazon prices.
                  <strong className="ml-1">You'll save {savings.toLocaleString()} tokens ({formatCost(savingsCost)})!</strong>
                </>
              ) : (
                <>
                  Your file only has ASINs. I need to fetch complete product data from Keepa.
                  This costs {fullImportTokens.toLocaleString()} tokens ({formatCost(calculateCost(fullImportTokens))}).
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Savings Alert (if applicable) */}
      {canUseVerify && savings > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
          <Icons.TrendingDown className="w-5 h-5 text-green-600" />
          <p className="text-sm text-green-700">
            <strong>Potential Savings:</strong> {savings.toLocaleString()} tokens ({formatCost(savingsCost)}) by using Verify Mode
          </p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-lg p-3 text-center border border-gray-200">
          <p className="text-xl font-bold text-blue-600">{analysis.asinCount}</p>
          <p className="text-xs text-gray-600">Products</p>
        </div>
        <div className="bg-white rounded-lg p-3 text-center border border-gray-200">
          <p className="text-xl font-bold text-purple-600">{analysis.totalColumns}</p>
          <p className="text-xs text-gray-600">Columns</p>
        </div>
        <div className="bg-white rounded-lg p-3 text-center border border-gray-200">
          <p className="text-xl font-bold text-green-600">
            {selectedMode === 'verify' ? verifyTokens : fullImportTokens}
          </p>
          <p className="text-xs text-gray-600">Tokens</p>
        </div>
        <div className="bg-white rounded-lg p-3 text-center border border-gray-200">
          <p className="text-xl font-bold text-amber-600">
            {formatCost(calculateCost(selectedMode === 'verify' ? verifyTokens : fullImportTokens))}
          </p>
          <p className="text-xs text-gray-600">Est. Cost</p>
        </div>
      </div>

      {/* Detected Columns */}
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <p className="text-sm font-medium text-gray-700 mb-2">Detected Data:</p>
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
          {!analysis.hasTitle && (
            <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700">
              ⚠️ No title column
            </span>
          )}
          {!analysis.hasPrice && (
            <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700">
              ⚠️ No price column
            </span>
          )}
        </div>
      </div>

      {/* Mode Selection Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => handleModeSelect('verify')}
          disabled={!canUseVerify}
          className={`p-4 rounded-lg border-2 text-left transition-all ${
            selectedMode === 'verify'
              ? 'border-green-500 bg-green-50'
              : 'border-gray-200 hover:border-gray-300'
          } ${!canUseVerify ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Icons.Zap className="w-4 h-4 text-green-600" />
            <span className="font-medium text-gray-900">Verify Mode</span>
            {bestRoute === 'verify' && (
              <span className="ml-auto text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">BEST</span>
            )}
            {selectedMode === 'verify' && (
              <Icons.CheckCircle className="w-4 h-4 text-green-600 ml-auto" />
            )}
          </div>
          <p className="text-xs text-gray-600">Use existing data, only fetch prices</p>
          <p className="text-sm font-semibold text-green-600 mt-1">
            {verifyTokens.toLocaleString()} tokens • {formatCost(calculateCost(verifyTokens))}
          </p>
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
            {bestRoute === 'full_import' && !canUseVerify && (
              <span className="ml-auto text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">BEST</span>
            )}
            {selectedMode === 'full_import' && (
              <Icons.CheckCircle className="w-4 h-4 text-blue-600 ml-auto" />
            )}
          </div>
          <p className="text-xs text-gray-600">Fetch all data from Keepa</p>
          <p className="text-sm font-semibold text-blue-600 mt-1">
            {fullImportTokens.toLocaleString()} tokens • {formatCost(calculateCost(fullImportTokens))}
          </p>
        </button>
      </div>
    </div>
  );
}

export default AIImportBot;

