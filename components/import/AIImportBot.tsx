'use client';

// components/import/AIImportBot.tsx
// AI-Powered Import Bot - Smart file detection, scenario recognition, recommendations
// Handles both: Verify Mode (full data) and Full Import Mode (ASIN only)

import { useState, useEffect } from 'react';
import { Bot, Sparkles, CheckCircle, AlertCircle, FileText, Zap, ArrowRight } from 'lucide-react';

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

interface AIBotMessage {
  type: 'info' | 'success' | 'warning' | 'analysis';
  title?: string;
  content: string;
  details?: string[];
  actions?: Array<{
    label: string;
    onClick: () => void;
    primary?: boolean;
  }>;
}

interface AIImportBotProps {
  fileData?: any[];
  fileName?: string;
  onModeSelect?: (mode: 'verify' | 'full_import') => void;
  onAnalysisComplete?: (analysis: FileAnalysis) => void;
  isKeepaConnected?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// COLUMN DETECTION PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const COLUMN_PATTERNS = {
  asin: {
    namePatterns: ['asin', 'sku', 'variant sku', 'product id', 'amazon asin'],
    valuePattern: /^B[A-Z0-9]{9}$/i,
    urlPattern: /amazon\.com.*\/dp\/([A-Z0-9]{10})/i,
  },
  title: {
    namePatterns: ['title', 'name', 'product name', 'product title', 'item name'],
  },
  price: {
    namePatterns: ['price', 'variant price', 'selling price', 'your price', 'retail price', 'startprice'],
    valuePattern: /^\$?[\d,]+\.?\d*$/,
  },
  cost: {
    namePatterns: ['cost', 'variant cost', 'your cost', 'unit cost', 'amazon price'],
    valuePattern: /^\$?[\d,]+\.?\d*$/,
  },
  image: {
    namePatterns: ['image', 'image src', 'image url', 'main image', 'picurl', 'photo'],
    valuePattern: /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)/i,
  },
  description: {
    namePatterns: ['description', 'body', 'body html', 'product description'],
  },
  tags: {
    namePatterns: ['tags', 'categories', 'category', 'product tags'],
  },
  url: {
    namePatterns: ['url', 'supplier url', 'amazon url', 'source url', 'custom.supplier_url'],
    valuePattern: /amazon\.com/i,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// ANALYSIS FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function detectColumnType(columnName: string, sampleValues: string[]): { type: string; confidence: number } {
  const normalizedName = columnName.toLowerCase().trim();
  
  for (const [type, patterns] of Object.entries(COLUMN_PATTERNS)) {
    // Check name patterns
    for (const pattern of patterns.namePatterns || []) {
      if (normalizedName.includes(pattern) || normalizedName === pattern) {
        return { type, confidence: 0.9 };
      }
    }
    
    // Check value patterns
    if (patterns.valuePattern && sampleValues.length > 0) {
      const matches = sampleValues.filter(v => v && patterns.valuePattern!.test(String(v)));
      if (matches.length >= sampleValues.length * 0.5) {
        return { type, confidence: 0.7 };
      }
    }
  }
  
  return { type: 'unknown', confidence: 0 };
}

function extractAsinsFromColumn(values: string[]): string[] {
  const asins: string[] = [];
  const asinPattern = /B[A-Z0-9]{9}/gi;
  
  for (const value of values) {
    if (!value) continue;
    const strValue = String(value);
    
    // Direct ASIN match
    if (/^B[A-Z0-9]{9}$/i.test(strValue)) {
      asins.push(strValue.toUpperCase());
      continue;
    }
    
    // Extract from URL or text
    const matches = strValue.match(asinPattern);
    if (matches) {
      asins.push(...matches.map(m => m.toUpperCase()));
    }
  }
  
  return [...new Set(asins)];
}

function analyzeFileData(data: any[], fileName?: string): FileAnalysis {
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
  
  const columns = Object.keys(data[0] || {});
  const detectedColumns: DetectedColumn[] = [];
  
  let asinColumn: string | null = null;
  let asinCount = 0;
  let hasTitle = false;
  let hasPrice = false;
  let hasImages = false;
  let hasDescription = false;
  
  for (const col of columns) {
    const sampleValues = data.slice(0, 10).map(row => row[col]).filter(Boolean);
    const { type, confidence } = detectColumnType(col, sampleValues);
    
    detectedColumns.push({
      name: col,
      type: type as any,
      sampleValues: sampleValues.slice(0, 3).map(String),
      confidence,
    });
    
    if (type === 'asin' || type === 'url') {
      const allValues = data.map(row => row[col]);
      const extractedAsins = extractAsinsFromColumn(allValues);
      if (extractedAsins.length > asinCount) {
        asinColumn = col;
        asinCount = extractedAsins.length;
      }
    }
    
    if (type === 'title') hasTitle = true;
    if (type === 'price' || type === 'cost') hasPrice = true;
    if (type === 'image') hasImages = true;
    if (type === 'description') hasDescription = true;
  }
  
  // Determine recommended mode
  const hasFullData = hasTitle && hasPrice && (hasImages || hasDescription);
  const recommendedMode = hasFullData ? 'verify' : 'full_import';
  
  // Estimate tokens
  const tokenEstimate = asinCount;
  const potentialSavings = hasFullData ? Math.floor(asinCount * 0.3) : 0; // ~30% might be cached
  
  return {
    totalRows: data.length,
    totalColumns: columns.length,
    detectedColumns,
    asinColumn,
    asinCount,
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
// COMPONENT
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
  
  // Analyze file when data changes
  useEffect(() => {
    if (fileData && fileData.length > 0) {
      setIsAnalyzing(true);
      
      // Simulate analysis delay for UX
      setTimeout(() => {
        const result = analyzeFileData(fileData, fileName);
        setAnalysis(result);
        setIsAnalyzing(false);
        
        if (onAnalysisComplete) {
          onAnalysisComplete(result);
        }
      }, 500);
    }
  }, [fileData, fileName, onAnalysisComplete]);
  
  const handleModeSelect = (mode: 'verify' | 'full_import') => {
    setSelectedMode(mode);
    if (onModeSelect) {
      onModeSelect(mode);
    }
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER MESSAGES
  // ═══════════════════════════════════════════════════════════════════════════
  
  const renderInitialMessage = () => (
    <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-purple-100 rounded-lg">
          <Bot className="w-5 h-5 text-purple-600" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-purple-900 flex items-center gap-2">
            AI Import Assistant
            <Sparkles className="w-4 h-4 text-purple-500" />
          </h4>
          <p className="text-sm text-purple-700 mt-1">
            Upload any file format - I'll automatically detect ASINs, prices, and product data. 
            I'll use Keepa to fetch live Amazon prices and calculate your profits!
          </p>
          <div className="mt-3 flex items-center gap-4 text-xs">
            {isKeepaConnected ? (
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle className="w-4 h-4" />
                Keepa API connected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-600">
                <AlertCircle className="w-4 h-4" />
                Keepa not configured
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
  
  const renderAnalyzingMessage = () => (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-lg">
          <FileText className="w-5 h-5 text-blue-600 animate-bounce" />
        </div>
        <div>
          <h4 className="font-semibold text-blue-900">Analyzing your file...</h4>
          <p className="text-sm text-blue-700">
            Detecting columns, extracting ASINs, checking data completeness
          </p>
        </div>
      </div>
    </div>
  );
  
  const renderAnalysisResult = () => {
    if (!analysis) return null;
    
    const isVerifyMode = analysis.recommendedMode === 'verify';
    
    return (
      <div className="space-y-4">
        {/* Analysis Summary */}
        <div className={`border rounded-xl p-4 ${
          isVerifyMode 
            ? 'bg-green-50 border-green-200' 
            : 'bg-blue-50 border-blue-200'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${
              isVerifyMode ? 'bg-green-100' : 'bg-blue-100'
            }`}>
              <Bot className={`w-5 h-5 ${
                isVerifyMode ? 'text-green-600' : 'text-blue-600'
              }`} />
            </div>
            <div className="flex-1">
              <h4 className={`font-semibold ${
                isVerifyMode ? 'text-green-900' : 'text-blue-900'
              }`}>
                {isVerifyMode ? '✅ Full Product Data Detected!' : '📦 ASIN List Detected'}
              </h4>
              
              <div className="mt-2 text-sm space-y-1">
                <p className={isVerifyMode ? 'text-green-700' : 'text-blue-700'}>
                  Found <strong>{analysis.asinCount.toLocaleString()}</strong> ASINs 
                  in column "<strong>{analysis.asinColumn}</strong>"
                </p>
                
                {/* Detected columns */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {analysis.hasTitle && (
                    <span className="px-2 py-1 bg-white/50 rounded text-xs">✓ Title</span>
                  )}
                  {analysis.hasPrice && (
                    <span className="px-2 py-1 bg-white/50 rounded text-xs">✓ Price</span>
                  )}
                  {analysis.hasImages && (
                    <span className="px-2 py-1 bg-white/50 rounded text-xs">✓ Images</span>
                  )}
                  {analysis.hasDescription && (
                    <span className="px-2 py-1 bg-white/50 rounded text-xs">✓ Description</span>
                  )}
                  {!analysis.hasTitle && (
                    <span className="px-2 py-1 bg-amber-100 rounded text-xs text-amber-700">✗ No Title</span>
                  )}
                  {!analysis.hasPrice && (
                    <span className="px-2 py-1 bg-amber-100 rounded text-xs text-amber-700">✗ No Price</span>
                  )}
                  {!analysis.hasImages && (
                    <span className="px-2 py-1 bg-amber-100 rounded text-xs text-amber-700">✗ No Images</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Recommendation */}
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-purple-900">💡 AI Recommendation</h4>
              
              {isVerifyMode ? (
                <div className="mt-2 text-sm text-purple-800">
                  <p>
                    I see you already have full product data (title, images, prices). 
                    I'll just <strong>verify current Amazon prices</strong> and calculate your profit margins.
                  </p>
                  <p className="mt-2 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span>This saves Keepa tokens - no need to fetch data you already have!</span>
                  </p>
                </div>
              ) : (
                <div className="mt-2 text-sm text-purple-800">
                  <p>
                    I see you only have ASINs. I'll fetch <strong>complete product data</strong> from Keepa including 
                    titles, images, prices, ratings, and BSR. Then I'll calculate your optimal selling prices.
                  </p>
                </div>
              )}
              
              {/* Token estimate */}
              <div className="mt-3 p-3 bg-white/50 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-purple-700">Estimated Keepa tokens:</span>
                  <span className="font-semibold text-purple-900">
                    ~{analysis.tokenEstimate.toLocaleString()}
                  </span>
                </div>
                {analysis.potentialSavings > 0 && (
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-green-700">Potential savings (cached):</span>
                    <span className="font-semibold text-green-600">
                      ~{analysis.potentialSavings.toLocaleString()} tokens
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Mode Selection */}
        <div className="flex gap-3">
          <button
            onClick={() => handleModeSelect('verify')}
            className={`flex-1 p-4 rounded-xl border-2 transition-all ${
              selectedMode === 'verify'
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 hover:border-green-300 hover:bg-green-50/50'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle className={`w-5 h-5 ${
                selectedMode === 'verify' ? 'text-green-600' : 'text-gray-400'
              }`} />
              <span className="font-medium">Verify Mode</span>
            </div>
            <p className="text-xs text-gray-600 mt-1 text-left">
              Check Amazon prices only, keep your existing data
            </p>
          </button>
          
          <button
            onClick={() => handleModeSelect('full_import')}
            className={`flex-1 p-4 rounded-xl border-2 transition-all ${
              selectedMode === 'full_import'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
            }`}
          >
            <div className="flex items-center gap-2">
              <ArrowRight className={`w-5 h-5 ${
                selectedMode === 'full_import' ? 'text-blue-600' : 'text-gray-400'
              }`} />
              <span className="font-medium">Full Import Mode</span>
            </div>
            <p className="text-xs text-gray-600 mt-1 text-left">
              Fetch all product data from Keepa
            </p>
          </button>
        </div>
      </div>
    );
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  
  return (
    <div className="space-y-4">
      {!fileData && renderInitialMessage()}
      {fileData && isAnalyzing && renderAnalyzingMessage()}
      {fileData && !isAnalyzing && analysis && renderAnalysisResult()}
    </div>
  );
}

export default AIImportBot;
